import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface FriendUser {
  id: string;
  username: string; // unique lowercase handle without spaces
  displayName: string;
  avatarColor: string; // customizable pin/cursor color on map, e.g. '#ec4899'
  avatarUrl?: string; // profile picture url
  dailySteps?: number; // daily steps, e.g. 3600
  isWalkingNow: boolean;
  currentActivity?: 'walk' | 'run' | 'cycle';
  currentLocation?: { latitude: number; longitude: number; heading?: number };
  recentTrail?: Array<{ latitude: number; longitude: number }>;
  weeklySteps: number;
  totalWorkouts: number;
  lastActive: string;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromDisplayName: string;
  fromAvatarColor: string;
  toUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  sentAt: string;
}

export type SquadType = 'admin_only' | 'open_invite';

export interface SocialGroup {
  id: string;
  name: string;
  description: string;
  badgeEmoji?: string;
  createdById: string;
  adminIds?: string[];
  squadType?: SquadType; // 'admin_only' (only admin can invite) | 'open_invite' (anyone can add)
  memberUsernames: string[]; // usernames in the group
  createdAt: string;
}

const USERNAME_KEY = (userId: string) => `@footprint_username_${userId}`;
const ALL_USERS_KEY = '@footprint_registered_usernames';
const FRIENDS_KEY = (userId: string) => `@footprint_friends_${userId}`;
const GROUPS_KEY = (userId: string) => `@footprint_groups_${userId}`;
const FRIEND_COLOR_PREFS_KEY = (userId: string) => `@footprint_friend_colors_${userId}`;
const FRIEND_REQUESTS_KEY = (userId: string) => `@footprint_requests_${userId}`;

// Vibrant modern palette for friend map cursors & trails
export const FRIEND_CURSOR_PALETTE = [
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Amber
  '#84cc16', // Lime
  '#10b981', // Emerald
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Sapphire
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#ec4899', // Fuchsia / Pink
  '#f43f8e', // Strawberry
  '#fb7185', // Coral
  '#38bdf8', // Sky Blue
  '#2dd4bf', // Mint
];

/**
 * Built-in community users to populate discovery and social group features.
 */
export const DEFAULT_COMMUNITY_USERS: FriendUser[] = [
  {
    id: 'user_sarah_runs',
    username: 'sarah_runs',
    displayName: 'Sarah Walker',
    avatarColor: '#ec4899',
    dailySteps: 3600,
    isWalkingNow: true,
    currentActivity: 'walk',
    currentLocation: { latitude: 37.33400, longitude: -122.02900, heading: 45 },
    recentTrail: [
      { latitude: 37.33150, longitude: -122.03200 },
      { latitude: 37.33280, longitude: -122.03050 },
      { latitude: 37.33400, longitude: -122.02900 },
    ],
    weeklySteps: 48290,
    totalWorkouts: 14,
    lastActive: 'Just now',
  },
  {
    id: 'user_alex_stride',
    username: 'alex_stride',
    displayName: 'Alex Chen',
    avatarColor: '#06b6d4',
    dailySteps: 6400,
    isWalkingNow: true,
    currentActivity: 'run',
    currentLocation: { latitude: 37.32900, longitude: -122.03450, heading: 120 },
    recentTrail: [
      { latitude: 37.32650, longitude: -122.03700 },
      { latitude: 37.32780, longitude: -122.03580 },
      { latitude: 37.32900, longitude: -122.03450 },
    ],
    weeklySteps: 62410,
    totalWorkouts: 21,
    lastActive: '3m ago',
  },
  {
    id: 'user_jordan_trail',
    username: 'jordan_trail',
    displayName: 'Jordan Miller',
    avatarColor: '#f97316',
    dailySteps: 4100,
    isWalkingNow: false,
    currentActivity: 'walk',
    currentLocation: { latitude: 37.33550, longitude: -122.03300, heading: 270 },
    recentTrail: [
      { latitude: 37.33700, longitude: -122.03500 },
      { latitude: 37.33550, longitude: -122.03300 },
    ],
    weeklySteps: 34150,
    totalWorkouts: 9,
    lastActive: '2h ago',
  },
  {
    id: 'user_emma_hike',
    username: 'emma_hike',
    displayName: 'Emma Davies',
    avatarColor: '#8b5cf6',
    dailySteps: 7200,
    isWalkingNow: false,
    currentActivity: 'cycle',
    currentLocation: { latitude: 37.32700, longitude: -122.02700, heading: 90 },
    recentTrail: [
      { latitude: 37.32500, longitude: -122.02500 },
      { latitude: 37.32700, longitude: -122.02700 },
    ],
    weeklySteps: 51900,
    totalWorkouts: 17,
    lastActive: 'Yesterday',
  },
];

async function getAuthenticatedCloudUserId(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured || !userId || userId === 'guest_user') return null;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    return uid && uid === userId ? uid : null;
  } catch {
    return null;
  }
}

/**
 * Get the current user's unique username, or auto-assign one if not yet set.
 */
export async function getOrCreateMyUsername(userId: string, defaultName?: string): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(USERNAME_KEY(userId));
    if (existing) return existing;

    const base = (defaultName || 'stride_user')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12) || 'walker';

    let candidate = base;
    const all = await getAllRegisteredUsernames();
    let counter = 1;
    while (all.includes(candidate)) {
      candidate = `${base}${counter}`;
      counter++;
    }

    await setMyUsername(userId, candidate);
    return candidate;
  } catch (e) {
    console.warn('Failed to get/create username:', e);
    return 'walker';
  }
}

export async function getAllRegisteredUsernames(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(ALL_USERS_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    for (const u of DEFAULT_COMMUNITY_USERS) {
      if (!set.includes(u.username)) set.push(u.username);
    }
    return set;
  } catch {
    return DEFAULT_COMMUNITY_USERS.map((u) => u.username);
  }
}

/**
 * Sync the current user's profile and live status to Supabase.
 * Location coordinates live exclusively in `user_locations` and are wiped when privacy mode is enabled.
 */
export async function syncMyProfileToSupabase(
  userId: string,
  data: Partial<FriendUser & { location_private?: boolean }>
): Promise<void> {
  try {
    const authUid = await getAuthenticatedCloudUserId(userId);
    if (!authUid) return;

    const username = (await AsyncStorage.getItem(USERNAME_KEY(userId))) || data.username;
    if (!username) return;

    const privacy = await getLocationPrivacy(userId);
    const isPrivate = data.location_private ?? privacy.isPrivate;

    const profileUpdates: Record<string, unknown> = {
      id: authUid,
      username,
      location_private: isPrivate,
      updated_at: new Date().toISOString(),
    };
    if (data.displayName !== undefined) profileUpdates.display_name = data.displayName || username;
    if (data.avatarColor !== undefined) profileUpdates.avatar_color = data.avatarColor;
    if (data.avatarUrl !== undefined) profileUpdates.avatar_url = data.avatarUrl || null;
    if (data.dailySteps !== undefined) profileUpdates.daily_steps = data.dailySteps;
    if (data.weeklySteps !== undefined) profileUpdates.weekly_steps = data.weeklySteps;
    if (data.totalWorkouts !== undefined) profileUpdates.total_workouts = data.totalWorkouts;
    if (data.isWalkingNow !== undefined) profileUpdates.is_walking_now = data.isWalkingNow;
    if (data.currentActivity !== undefined) profileUpdates.current_activity = data.currentActivity;
    if (data.lastActive !== undefined) profileUpdates.last_active = data.lastActive;

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authUid)
      .maybeSingle();

    if (existing) {
      await supabase.from('profiles').update(profileUpdates).eq('id', authUid);
    } else {
      await supabase.from('profiles').insert({
        display_name: data.displayName || username,
        avatar_color: data.avatarColor || '#10b981',
        avatar_url: data.avatarUrl || null,
        daily_steps: data.dailySteps ?? 0,
        weekly_steps: data.weeklySteps ?? 0,
        total_workouts: data.totalWorkouts ?? 0,
        is_walking_now: data.isWalkingNow ?? false,
        current_activity: data.currentActivity || 'walk',
        last_active: data.lastActive || 'Just now',
        ...profileUpdates,
      });
    }

    // Location data is strictly stored in user_locations and nulled out when private.
    const shouldSyncLocation =
      data.location_private !== undefined ||
      data.currentLocation !== undefined ||
      data.recentTrail !== undefined;

    if (shouldSyncLocation) {
      await supabase.from('user_locations').upsert(
        {
          user_id: authUid,
          location_private: isPrivate,
          current_location: isPrivate ? null : data.currentLocation ?? null,
          recent_trail: isPrivate ? null : data.recentTrail ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    }
  } catch (e) {
    // Graceful offline fallback
    console.warn('Supabase profile sync note:', e);
  }
}

/**
 * Set and claim a unique username for the user in Supabase & locally.
 */
export async function setMyUsername(userId: string, requestedUsername: string, displayName?: string): Promise<string> {
  const clean = requestedUsername.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  if (clean.length < 3) throw new Error('Username must be at least 3 characters.');
  if (clean.length > 20) throw new Error('Username must be 20 characters or less.');

  const current = await AsyncStorage.getItem(USERNAME_KEY(userId));
  if (current === clean) return clean;

  const authUid = await getAuthenticatedCloudUserId(userId);
  if (authUid) {
    try {
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', clean)
        .maybeSingle();

      if (existingUser && existingUser.id !== authUid) {
        throw new Error(`Username @${clean} is already claimed by another user.`);
      }
    } catch (err: any) {
      if (err.message && err.message.includes('already claimed')) {
        throw err;
      }
    }
  }

  const all = await getAllRegisteredUsernames();
  if (all.includes(clean) && !DEFAULT_COMMUNITY_USERS.some((u) => u.username === clean)) {
    throw new Error(`Username @${clean} is already claimed. Choose another.`);
  }

  const updatedAll = all.filter((u) => u !== current);
  updatedAll.push(clean);

  await AsyncStorage.setItem(ALL_USERS_KEY, JSON.stringify(updatedAll));
  await AsyncStorage.setItem(USERNAME_KEY(userId), clean);

  // Sync to Supabase
  await syncMyProfileToSupabase(userId, {
    username: clean,
    displayName: displayName || clean,
  });

  return clean;
}

/**
 * Find user profile by username (non-location metadata only; location is never exposed to non-friends).
 */
export async function findUserByUsername(userId: string, username: string): Promise<FriendUser | null> {
  const clean = username.toLowerCase().trim().replace(/^@/, '');
  if (!clean) return null;

  const authUid = await getAuthenticatedCloudUserId(userId);
  if (authUid) {
    try {
      const { data: cloudProfile, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_color, avatar_url, daily_steps, weekly_steps, total_workouts, is_walking_now, current_activity, last_active')
        .ilike('username', clean)
        .maybeSingle();

      if (cloudProfile && !error) {
        const customColor = (await getFriendCustomColor(userId, cloudProfile.username)) || cloudProfile.avatar_color;
        return {
          id: cloudProfile.id,
          username: cloudProfile.username,
          displayName: cloudProfile.display_name,
          avatarColor: customColor,
          avatarUrl: cloudProfile.avatar_url || undefined,
          dailySteps: cloudProfile.daily_steps || 0,
          weeklySteps: cloudProfile.weekly_steps || 0,
          totalWorkouts: cloudProfile.total_workouts || 0,
          isWalkingNow: cloudProfile.is_walking_now || false,
          currentActivity: cloudProfile.current_activity || 'walk',
          lastActive: cloudProfile.last_active || 'Just now',
        };
      }
    } catch {
      // Offline or network error, continue to local lookup
    }
  }

  // 2. Default community users
  const foundDefault = DEFAULT_COMMUNITY_USERS.find((u) => u.username === clean);
  if (foundDefault) {
    const customColor = await getFriendCustomColor(userId, clean);
    return customColor ? { ...foundDefault, avatarColor: customColor } : foundDefault;
  }

  // 3. Existing friend
  const friends = await loadFriends(userId);
  const foundFriend = friends.find((f) => f.username === clean);
  if (foundFriend) return foundFriend;

  return null;
}

/**
 * Custom color preferences for friends' cursors & trails
 */
export async function getFriendCustomColor(userId: string, friendUsername: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(FRIEND_COLOR_PREFS_KEY(userId));
    if (!raw) return null;
    const map: Record<string, string> = JSON.parse(raw);
    return map[friendUsername.toLowerCase()] || null;
  } catch {
    return null;
  }
}

export async function setFriendCustomColor(userId: string, friendUsername: string, color: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(FRIEND_COLOR_PREFS_KEY(userId));
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[friendUsername.toLowerCase()] = color;
    await AsyncStorage.setItem(FRIEND_COLOR_PREFS_KEY(userId), JSON.stringify(map));

    const friends = await loadFriends(userId);
    const updated = friends.map((f) => (f.username === friendUsername.toLowerCase() ? { ...f, avatarColor: color } : f));
    await AsyncStorage.setItem(FRIENDS_KEY(userId), JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to set friend color:', e);
  }
}

/**
 * Load friends list with live Supabase cloud status and friend-scoped coordinates
 */
export async function loadFriends(userId: string): Promise<FriendUser[]> {
  let localFriends: FriendUser[] = [];
  try {
    const raw = await AsyncStorage.getItem(FRIENDS_KEY(userId));
    if (raw) {
      localFriends = JSON.parse(raw);
    } else {
      localFriends = [DEFAULT_COMMUNITY_USERS[0], DEFAULT_COMMUNITY_USERS[1]];
      await AsyncStorage.setItem(FRIENDS_KEY(userId), JSON.stringify(localFriends));
    }
  } catch (e) {
    console.warn('Local friends read note:', e);
  }

  const authUid = await getAuthenticatedCloudUserId(userId);
  if (authUid) {
    // Sync with cloud friendships table
    try {
      const { data: cloudFriendships } = await supabase
        .from('friendships')
        .select('friend_id, friend_username, custom_color')
        .eq('user_id', authUid);

      if (cloudFriendships && cloudFriendships.length > 0) {
        for (const cf of cloudFriendships) {
          if (!localFriends.some((f) => f.username === cf.friend_username)) {
            const fetchedFriend = await findUserByUsername(userId, cf.friend_username);
            if (fetchedFriend) {
              localFriends.push(fetchedFriend);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Supabase cloud friendships note:', err);
    }

    // Refresh friend profiles and friend-only live locations
    try {
      const friendHandles = localFriends.map((f) => f.username);
      if (friendHandles.length > 0) {
        const { data: liveProfiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, daily_steps, weekly_steps, total_workouts, is_walking_now, current_activity, location_private, last_active')
          .in('username', friendHandles);

        if (liveProfiles) {
          const friendIds = liveProfiles.map((p) => p.id).filter(Boolean);
          let locationMap = new Map<string, any>();
          if (friendIds.length > 0) {
            const { data: liveLocations } = await supabase
              .from('user_locations')
              .select('user_id, current_location, recent_trail, location_private')
              .in('user_id', friendIds);
            if (liveLocations) {
              locationMap = new Map(liveLocations.map((loc) => [loc.user_id, loc]));
            }
          }

          const liveMap = new Map(liveProfiles.map((p) => [p.username, p]));
          localFriends = localFriends.map((f) => {
            const live = liveMap.get(f.username);
            if (live) {
              const loc = locationMap.get(live.id);
              const canShareLocation = live.location_private === false && loc && loc.location_private === false;
              return {
                ...f,
                id: live.id || f.id,
                displayName: live.display_name || f.displayName,
                dailySteps: live.daily_steps ?? f.dailySteps,
                weeklySteps: live.weekly_steps ?? f.weeklySteps,
                totalWorkouts: live.total_workouts ?? f.totalWorkouts,
                isWalkingNow: live.is_walking_now ?? f.isWalkingNow,
                currentActivity: live.current_activity || f.currentActivity,
                currentLocation: canShareLocation ? (loc.current_location || undefined) : undefined,
                recentTrail: canShareLocation ? (loc.recent_trail || undefined) : undefined,
                lastActive: live.last_active || f.lastActive,
              };
            }
            return f;
          });
        }
      }
    } catch (err) {
      console.warn('Live profile location fetch note:', err);
    }
  }

  // Apply custom color overrides
  try {
    const colorRaw = await AsyncStorage.getItem(FRIEND_COLOR_PREFS_KEY(userId));
    const colorMap: Record<string, string> = colorRaw ? JSON.parse(colorRaw) : {};
    return localFriends.map((f) => (colorMap[f.username] ? { ...f, avatarColor: colorMap[f.username] } : f));
  } catch {
    return localFriends;
  }
}

/**
 * Remove a friend
 */
export async function removeFriend(userId: string, friendUsername: string): Promise<void> {
  const clean = friendUsername.toLowerCase();
  const authUid = await getAuthenticatedCloudUserId(userId);
  if (authUid) {
    try {
      const { error } = await supabase.rpc('remove_friendship', { p_friend_username: clean });
      if (error) {
        await supabase
          .from('friendships')
          .delete()
          .match({ user_id: authUid, friend_username: clean });
      }
    } catch (err) {
      console.warn('Supabase friend removal note:', err);
    }
  }

  try {
    const friends = await loadFriends(userId);
    const updated = friends.filter((f) => f.username !== clean);
    await AsyncStorage.setItem(FRIENDS_KEY(userId), JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to remove friend locally:', e);
  }
}

// ─────────────────────────────────────────────
// Friend Requests Engine (Sending, Incoming, Outgoing, Accepting)
// ─────────────────────────────────────────────

export async function loadFriendRequests(userId: string): Promise<FriendRequest[]> {
  const myHandle = await getOrCreateMyUsername(userId);
  let cloudRequests: FriendRequest[] = [];

  const authUid = await getAuthenticatedCloudUserId(userId);
  if (authUid) {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`to_username.eq.${myHandle},from_user_id.eq.${authUid}`)
        .order('created_at', { ascending: false });

      if (data && !error) {
        cloudRequests = data.map((row) => ({
          id: row.id,
          fromUserId: row.from_user_id,
          fromUsername: row.from_username,
          fromDisplayName: row.from_display_name,
          fromAvatarColor: row.from_avatar_color,
          toUsername: row.to_username,
          status: row.status as 'pending' | 'accepted' | 'declined',
          sentAt: 'Recent',
        }));
      }
    } catch (err) {
      console.warn('Supabase friend requests fetch note:', err);
    }
  }

  // Also check local cache
  try {
    const raw = await AsyncStorage.getItem(FRIEND_REQUESTS_KEY(userId));
    const localRequests: FriendRequest[] = raw ? JSON.parse(raw) : [];

    // Merge cloud requests with local, favoring cloud
    const merged = [...cloudRequests];
    for (const lr of localRequests) {
      if (!merged.some((m) => m.id === lr.id || (m.fromUsername === lr.fromUsername && m.toUsername === lr.toUsername))) {
        merged.push(lr);
      }
    }

    if (merged.length > 0) {
      await AsyncStorage.setItem(FRIEND_REQUESTS_KEY(userId), JSON.stringify(merged));
      return merged;
    }
  } catch (e) {
    console.warn('Failed loading friend requests:', e);
  }

  // Initial mock request for fresh experience
  const initial: FriendRequest[] = [
    {
      id: 'req_jordan',
      fromUserId: 'user_jordan_trail',
      fromUsername: 'jordan_trail',
      fromDisplayName: 'Jordan Miller',
      fromAvatarColor: '#f97316',
      toUsername: myHandle,
      status: 'pending',
      sentAt: '10m ago',
    },
  ];
  await AsyncStorage.setItem(FRIEND_REQUESTS_KEY(userId), JSON.stringify(initial));
  return initial;
}

export async function sendFriendRequest(
  userId: string,
  targetUsername: string,
  myDisplayName?: string
): Promise<FriendRequest> {
  const clean = targetUsername.toLowerCase().trim().replace(/^@/, '');
  const myUsername = await getOrCreateMyUsername(userId);

  if (clean === myUsername) {
    throw new Error('You cannot send a friend request to yourself.');
  }

  const friends = await loadFriends(userId);
  if (friends.some((f) => f.username === clean)) {
    throw new Error(`@${clean} is already your friend!`);
  }

  const target = await findUserByUsername(userId, clean);
  if (!target) {
    throw new Error(`User @${clean} does not exist. Try @sarah_runs, @alex_stride, or another real user!`);
  }

  const currentRequests = await loadFriendRequests(userId);
  if (currentRequests.some((r) => r.toUsername === clean && r.status === 'pending')) {
    throw new Error(`A friend request to @${clean} is already pending.`);
  }

  const newReq: FriendRequest = {
    id: `req_${Date.now()}`,
    fromUserId: userId,
    fromUsername: myUsername,
    fromDisplayName: myDisplayName || myUsername,
    fromAvatarColor: '#a3e635',
    toUsername: clean,
    status: 'pending',
    sentAt: 'Just now',
  };

  const authUid = await getAuthenticatedCloudUserId(userId);
  if (authUid) {
    try {
      await supabase.from('friend_requests').insert({
        from_user_id: authUid,
        from_username: myUsername,
        from_display_name: myDisplayName || myUsername,
        from_avatar_color: '#a3e635',
        to_user_id: target.id.startsWith('user_') ? null : target.id,
        to_username: clean,
        status: 'pending',
      });
    } catch (err) {
      console.warn('Could not post request to cloud:', err);
    }
  }

  const updated = [newReq, ...currentRequests];
  await AsyncStorage.setItem(FRIEND_REQUESTS_KEY(userId), JSON.stringify(updated));
  return newReq;
}

export async function acceptFriendRequest(userId: string, requestId: string): Promise<FriendUser> {
  const requests = await loadFriendRequests(userId);
  const req = requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Request not found.');

  // Find the sender user details
  const friend = await findUserByUsername(userId, req.fromUsername);
  if (!friend) throw new Error('User profile not found.');

  // Add to friends list locally
  const friends = await loadFriends(userId);
  if (!friends.some((f) => f.username === friend.username)) {
    const updatedFriends = [friend, ...friends];
    await AsyncStorage.setItem(FRIENDS_KEY(userId), JSON.stringify(updatedFriends));
  }

  // Atomically create mutual friendship in Supabase via SECURITY DEFINER RPC
  const authUid = await getAuthenticatedCloudUserId(userId);
  if (authUid && !requestId.startsWith('req_')) {
    try {
      await supabase.rpc('accept_friend_request', { p_request_id: requestId });
    } catch (err) {
      console.warn('Supabase accept friend sync note:', err);
    }
  }

  // Update local request status
  const updatedReqs = requests.map((r) => (r.id === requestId ? { ...r, status: 'accepted' as const } : r));
  await AsyncStorage.setItem(FRIEND_REQUESTS_KEY(userId), JSON.stringify(updatedReqs));

  return friend;
}

export async function declineFriendRequest(userId: string, requestId: string): Promise<void> {
  const authUid = await getAuthenticatedCloudUserId(userId);
  if (authUid && !requestId.startsWith('req_')) {
    try {
      await supabase.from('friend_requests').delete().eq('id', requestId);
    } catch (err) {
      console.warn('Supabase decline request note:', err);
    }
  }

  const requests = await loadFriendRequests(userId);
  const updatedReqs = requests.filter((r) => r.id !== requestId);
  await AsyncStorage.setItem(FRIEND_REQUESTS_KEY(userId), JSON.stringify(updatedReqs));
}

// ─────────────────────────────────────────────
// Groups Management
// ─────────────────────────────────────────────
const DEFAULT_INITIAL_GROUPS: SocialGroup[] = [
  {
    id: 'group_morning_walkers',
    name: 'Morning Striders Club',
    description: 'Early morning walkers aiming for 10k steps before 9 AM',
    createdById: 'user_sarah_runs',
    memberUsernames: ['sarah_runs', 'alex_stride'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'group_weekend_hikers',
    name: 'Weekend Trail Explorers',
    description: 'Park loops, scenic circuits, and elevation challenges',
    createdById: 'user_alex_stride',
    memberUsernames: ['alex_stride', 'jordan_trail', 'sarah_runs'],
    createdAt: new Date().toISOString(),
  },
];

export async function loadGroups(userId: string): Promise<SocialGroup[]> {
  try {
    const raw = await AsyncStorage.getItem(GROUPS_KEY(userId));
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load groups:', e);
  }
  await AsyncStorage.setItem(GROUPS_KEY(userId), JSON.stringify(DEFAULT_INITIAL_GROUPS));
  return DEFAULT_INITIAL_GROUPS;
}

export async function createGroup(
  userId: string,
  name: string,
  description: string,
  badgeEmoji?: string,
  squadType: SquadType = 'open_invite'
): Promise<SocialGroup> {
  if (!name.trim()) throw new Error('Please enter a group name.');
  const myUsername = await getOrCreateMyUsername(userId);
  const newGroup: SocialGroup = {
    id: `group_${Date.now()}`,
    name: name.trim(),
    description: description.trim() || 'Walking and fitness squad',
    badgeEmoji,
    createdById: userId,
    adminIds: [userId],
    squadType,
    memberUsernames: [myUsername],
    createdAt: new Date().toISOString(),
  };

  const current = await loadGroups(userId);
  const updated = [newGroup, ...current];
  await AsyncStorage.setItem(GROUPS_KEY(userId), JSON.stringify(updated));
  return newGroup;
}

export async function addMemberToGroup(userId: string, groupId: string, username: string): Promise<SocialGroup> {
  const clean = username.toLowerCase().trim().replace(/^@/, '');
  const groups = await loadGroups(userId);
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new Error('Group not found.');

  // If squad is admin_only, check if current user is admin or creator
  if (group.squadType === 'admin_only') {
    const isAdmin = group.createdById === userId || (group.adminIds && group.adminIds.includes(userId));
    if (!isAdmin) {
      throw new Error('Only squad admins can add new members to this squad.');
    }
  }

  if (group.memberUsernames.includes(clean)) {
    throw new Error(`@${clean} is already a member of ${group.name}.`);
  }

  const updatedGroup = {
    ...group,
    memberUsernames: [...group.memberUsernames, clean],
  };

  const updatedList = groups.map((g) => (g.id === groupId ? updatedGroup : g));
  await AsyncStorage.setItem(GROUPS_KEY(userId), JSON.stringify(updatedList));
  return updatedGroup;
}

export async function leaveOrDeleteGroup(userId: string, groupId: string): Promise<void> {
  const groups = await loadGroups(userId);
  const updated = groups.filter((g) => g.id !== groupId);
  await AsyncStorage.setItem(GROUPS_KEY(userId), JSON.stringify(updated));
}

const PRIVACY_MODE_KEY = (userId: string) => `@footprint_location_privacy_${userId}`;
const PRIVACY_EXPIRES_AT_KEY = (userId: string) => `@footprint_privacy_expires_at_${userId}`;

export interface PrivacyStatus {
  isPrivate: boolean;
  expiresAt: number | null; // unix ms timestamp or null for indefinite
  remainingSeconds: number; // remaining seconds (0 if expired or not private)
}

export async function getLocationPrivacy(userId: string): Promise<PrivacyStatus> {
  try {
    const raw = await AsyncStorage.getItem(PRIVACY_MODE_KEY(userId));
    const isPrivate = raw !== null ? JSON.parse(raw) : false;

    if (!isPrivate) {
      return { isPrivate: false, expiresAt: null, remainingSeconds: 0 };
    }

    const expRaw = await AsyncStorage.getItem(PRIVACY_EXPIRES_AT_KEY(userId));
    if (expRaw) {
      const expiresAt = Number(expRaw);
      const now = Date.now();
      if (expiresAt > 0 && now >= expiresAt) {
        // Expired! Automatically turn back off privacy mode
        await AsyncStorage.setItem(PRIVACY_MODE_KEY(userId), JSON.stringify(false));
        await AsyncStorage.removeItem(PRIVACY_EXPIRES_AT_KEY(userId));
        return { isPrivate: false, expiresAt: null, remainingSeconds: 0 };
      }
      const remainingSeconds = expiresAt > 0 ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
      return { isPrivate: true, expiresAt, remainingSeconds };
    }

    // Indefinite privacy
    return { isPrivate: true, expiresAt: null, remainingSeconds: 0 };
  } catch (_) {
    return { isPrivate: false, expiresAt: null, remainingSeconds: 0 };
  }
}

export async function setLocationPrivacy(
  userId: string,
  isPrivate: boolean,
  durationHours?: number | null // null or 0 means indefinite
): Promise<PrivacyStatus> {
  try {
    if (!isPrivate) {
      await AsyncStorage.setItem(PRIVACY_MODE_KEY(userId), JSON.stringify(false));
      await AsyncStorage.removeItem(PRIVACY_EXPIRES_AT_KEY(userId));
      return { isPrivate: false, expiresAt: null, remainingSeconds: 0 };
    }

    // Turning ON
    let expiresAt: number | null = null;
    let remainingSeconds = 0;
    if (durationHours && durationHours > 0) {
      expiresAt = Date.now() + durationHours * 3600 * 1000;
      remainingSeconds = durationHours * 3600;
      await AsyncStorage.setItem(PRIVACY_EXPIRES_AT_KEY(userId), String(expiresAt));
    } else {
      await AsyncStorage.removeItem(PRIVACY_EXPIRES_AT_KEY(userId));
    }

    await AsyncStorage.setItem(PRIVACY_MODE_KEY(userId), JSON.stringify(true));
    return { isPrivate: true, expiresAt, remainingSeconds };
  } catch (_) {
    return { isPrivate, expiresAt: null, remainingSeconds: 0 };
  }
}
