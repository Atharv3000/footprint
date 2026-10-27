import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  Alert,
  Platform,
  RefreshControl,
  Switch,
  Dimensions,
  Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/constants/AuthContext';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { DraggableSheetHandle } from '@/components/DraggableSheetHandle';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';
import { InteractiveBadge } from '@/components/InteractiveBadge';
import { WeeklyBarChart } from '@/components/StepsCharts';
import { dateString, ensureMockDataSeeded } from '@/constants/stepsStorage';
import {
  BadgeDefinition,
  getUserBadgeStats,
  computeBadges,
  TIER_METALLIC,
  UserStatsForBadges,
} from '@/constants/badgesEngine';
import {
  FriendUser,
  FriendRequest,
  SocialGroup,
  SquadType,
  loadFriends,
  removeFriend,
  setFriendCustomColor,
  FRIEND_CURSOR_PALETTE,
  loadFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  loadGroups,
  createGroup,
  addMemberToGroup,
  leaveOrDeleteGroup,
  getOrCreateMyUsername,
  getLocationPrivacy,
  setLocationPrivacy,
  PrivacyStatus,
  syncMyProfileToSupabase,
} from '@/constants/socialEngine';
import { supabase } from '@/constants/supabaseClient';
import { SquadDetailScreen, calculateSquadGrade } from '@/components/SquadDetailScreen';

export interface CommunityQuest {
  id: string;
  title: string;
  category: 'daily' | 'weekly' | 'squad';
  description: string;
  current: number;
  target: number;
  unit: string;
  reward: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  daysLeft: number;
  joined?: boolean;
}

const INITIAL_QUESTS: CommunityQuest[] = [
  {
    id: 'quest_1',
    title: 'Weekend 15,000 Step Trek',
    category: 'weekly',
    description: 'Crush 15,000 steps this weekend with fellow community walkers.',
    current: 11420,
    target: 15000,
    unit: 'steps',
    reward: 'Gold Footprint Badge + 150 Pts',
    icon: 'flame',
    color: '#f97316',
    daysLeft: 2,
    joined: true,
  },
  {
    id: 'quest_2',
    title: 'Sunrise Stepper',
    category: 'daily',
    description: 'Log 4,000 steps before 9:00 AM to kickstart your morning metabolism.',
    current: 3100,
    target: 4000,
    unit: 'steps',
    reward: 'Early Bird Pin',
    icon: 'sunny',
    color: '#eab308',
    daysLeft: 1,
    joined: true,
  },
  {
    id: 'quest_3',
    title: 'Squad Century Expedition',
    category: 'squad',
    description: 'Collaborate with your squad to cover a combined 100km total distance.',
    current: 68.4,
    target: 100,
    unit: 'km',
    reward: 'Expedition Trophy + Squad Rank Boost',
    icon: 'shield-checkmark',
    color: '#3b82f6',
    daysLeft: 4,
    joined: true,
  },
  {
    id: 'quest_4',
    title: 'Trailfinder Discovery',
    category: 'weekly',
    description: 'Record walks across 3 distinct routes or parks in your area.',
    current: 2,
    target: 3,
    unit: 'parks',
    reward: 'Pathfinder Ribbon',
    icon: 'compass',
    color: '#10b981',
    daysLeft: 5,
    joined: false,
  },
  {
    id: 'quest_5',
    title: 'Twilight Stroll Milestone',
    category: 'daily',
    description: 'Take a relaxed evening walk of at least 2,500 steps after sunset.',
    current: 0,
    target: 2500,
    unit: 'steps',
    reward: 'Moonlight Pin',
    icon: 'moon',
    color: '#8b5cf6',
    daysLeft: 1,
    joined: false,
  },
];

const SQUAD_EMOJI_PICKER = ['👟', '🏃‍♂️', '⚡', '🌄', '🌲', '🏆', '🔥', '🚴', '🚀', '🎯', '🌿', '🧭'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FRIENDS_PAGE_WIDTH = SCREEN_WIDTH - 32;

export default function CommunityScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [selectedFriendForDetail, setSelectedFriendForDetail] = useState<FriendUser | null>(null);
  const [myUsername, setMyUsernameState] = useState<string>('');

  // Profile Sub-tab in Friend sheet: 'activity' | 'badges' | 'cursor'
  const [memberSubTab, setMemberSubTab] = useState<'activity' | 'badges' | 'cursor'>('activity');
  const memberTabAnim = useRef(new Animated.Value(0)).current;
  const [memberBadges, setMemberBadges] = useState<BadgeDefinition[]>([]);
  const [selectedMemberBadge, setSelectedMemberBadge] = useState<BadgeDefinition | null>(null);

  // States for friend's daily activity charts
  const [memberWeekOffset, setMemberWeekOffset] = useState<number>(0);
  const [memberSelectedDate, setMemberSelectedDate] = useState<string>(dateString(0));
  const [memberMetricMode, setMemberMetricMode] = useState<'steps' | 'distance'>('steps');

  const switchMemberSubTab = (tab: 'activity' | 'badges' | 'cursor') => {
    if (tab === memberSubTab) return;
    Haptics.selectionAsync().catch(() => {});
    setMemberSubTab(tab);
    const targetVal = tab === 'activity' ? 0 : tab === 'badges' ? 1 : 2;
    Animated.timing(memberTabAnim, {
      toValue: targetVal,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  const handleOpenFriendProfile = (friend: FriendUser) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedFriendForDetail(friend);
    setMemberSubTab('activity');
    setMemberWeekOffset(0);
    setMemberSelectedDate(dateString(0));
    setMemberMetricMode('steps');
    memberTabAnim.setValue(0);
    ensureMockDataSeeded(friend.username, 8000).catch(() => {});
    getUserBadgeStats(friend.username).then((stats: UserStatsForBadges) => {
      const computed = computeBadges(stats);
      setMemberBadges(computed);
    }).catch(() => {});
  };

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [groups, setGroups] = useState<SocialGroup[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [friendsPageIndex, setFriendsPageIndex] = useState<number>(0);

  // Send friend request modal
  const [showSendRequestModal, setShowSendRequestModal] = useState<boolean>(false);
  const [targetUsernameInput, setTargetUsernameInput] = useState<string>('');
  const [requestSending, setRequestSending] = useState<boolean>(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Community 3-Way Tab switcher: 'friends' | 'squads' | 'quests'
  const [activeTab, setActiveTab] = useState<'friends' | 'squads' | 'quests'>('friends');
  const communityTabAnim = useRef(new Animated.Value(0)).current;

  // Unified Notifications Modal
  const [showNotificationsModal, setShowNotificationsModal] = useState<boolean>(false);

  // Quests list state
  const [quests, setQuests] = useState<CommunityQuest[]>(INITIAL_QUESTS);

  // Squads specific state
  const [selectedSquadType, setSelectedSquadType] = useState<SquadType>('open_invite');
  const [viewingSquad, setViewingSquad] = useState<SocialGroup | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState<boolean>(false);
  const [groupNameInput, setGroupNameInput] = useState<string>('');
  const [groupDescInput, setGroupDescInput] = useState<string>('');
  const [selectedGroupForMember, setSelectedGroupForMember] = useState<SocialGroup | null>(null);
  const [memberInput, setMemberInput] = useState<string>('');

  const switchCommunityTab = (tab: 'friends' | 'squads' | 'quests') => {
    if (tab === activeTab) return;
    Haptics.selectionAsync().catch(() => {});
    setActiveTab(tab);
    const target = tab === 'friends' ? 0 : tab === 'squads' ? 1 : 2;
    Animated.timing(communityTabAnim, {
      toValue: target,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  const handleToggleQuest = (questId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setQuests((prev) =>
      prev.map((q) => {
        if (q.id === questId) {
          const nextJoined = !q.joined;
          return {
            ...q,
            joined: nextJoined,
            current: nextJoined ? Math.max(q.current, Math.round(q.target * 0.15)) : q.current,
          };
        }
        return q;
      })
    );
  };

  // Selected friend for color customization modal

  // Privacy status with timer
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus>({
    isPrivate: false,
    expiresAt: null,
    remainingSeconds: 0,
  });
  const [showPrivacyDurationModal, setShowPrivacyDurationModal] = useState<boolean>(false);
  const privacySelectionMadeRef = useRef<boolean>(false);

  const userId = user?.id || 'guest_user';

  const loadData = useCallback(async () => {
    try {
      const uName = await getOrCreateMyUsername(userId, user?.name);
      setMyUsernameState(uName);

      const [f, reqs, g, priv] = await Promise.all([
        loadFriends(userId),
        loadFriendRequests(userId),
        loadGroups(userId),
        getLocationPrivacy(userId),
      ]);

      setFriends(f);
      setRequests(reqs);
      setGroups(g);
      setPrivacyStatus(priv);
    } catch (e) {
      console.warn('Failed loading social data:', e);
    }
  }, [userId, user?.name]);

  useEffect(() => {
    loadData();

    // Supabase Realtime: subscribe to instant friend requests and profile changes
    const channel = supabase
      .channel('public:social_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Live countdown timer for active privacy mode
  useEffect(() => {
    if (!privacyStatus.isPrivate || !privacyStatus.expiresAt) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((privacyStatus.expiresAt! - now) / 1000));
      if (diff <= 0) {
        clearInterval(timer);
        // Expired! Turn back off
        setLocationPrivacy(userId, false).then((updated) => {
          setPrivacyStatus(updated);
          syncMyProfileToSupabase(userId, { location_private: false });
        });
      } else {
        setPrivacyStatus((prev) => ({ ...prev, remainingSeconds: diff }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [privacyStatus.isPrivate, privacyStatus.expiresAt, userId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Called when tapping the privacy switch/pill
  const handleTogglePrivacy = async (turningOn: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (turningOn) {
      // Immediately slide/toggle switch ON so it feels responsive and active
      setPrivacyStatus((prev) => ({
        ...prev,
        isPrivate: true,
      }));
      // Reset selection flag and open duration dropup menu
      privacySelectionMadeRef.current = false;
      setShowPrivacyDurationModal(true);
    } else {
      // Turn off privacy
      const res = await setLocationPrivacy(userId, false);
      setPrivacyStatus(res);
      await syncMyProfileToSupabase(userId, { location_private: false });
    }
  };

  // Called when user selects a duration pill or indefinite
  const handleSelectPrivacyDuration = async (durationHours: number | null) => {
    privacySelectionMadeRef.current = true;
    setShowPrivacyDurationModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const res = await setLocationPrivacy(userId, true, durationHours);
    setPrivacyStatus(res);
    await syncMyProfileToSupabase(userId, { location_private: true });
  };

  // Format seconds to human hours and minutes (e.g. "2h 15m left" or "45m left", no seconds)
  const formatCountdown = (totalSec: number) => {
    const totalMinutes = Math.max(1, Math.ceil(totalSec / 60));
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hrs > 0) {
      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    return `${mins}m`;
  };

  const handleSendRequest = async () => {
    if (!targetUsernameInput.trim()) return;
    setRequestError(null);
    setRequestSending(true);
    try {
      await sendFriendRequest(userId, targetUsernameInput, user?.name);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowSendRequestModal(false);
      setTargetUsernameInput('');
      await loadData();
      Alert.alert(
        'Request Sent',
        `Friend request sent to @${targetUsernameInput.trim().replace(/^@/, '')}!`
      );
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setRequestError(e.message || 'Could not send request');
    } finally {
      setRequestSending(false);
    }
  };

  const handleAcceptRequest = async (req: FriendRequest) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await acceptFriendRequest(userId, req.id);
      await loadData();
      Alert.alert('Friend Connected', `You and @${req.fromUsername} are now friends!`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not accept request');
    }
  };

  const handleDeclineRequest = async (req: FriendRequest) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await declineFriendRequest(userId, req.id);
    await loadData();
  };

  const handleRemoveFriend = (friend: FriendUser) => {
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove @${friend.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeFriend(userId, friend.username);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            loadData();
          },
        },
      ]
    );
  };

  const handleCreateGroup = async () => {
    if (!groupNameInput.trim()) {
      Alert.alert('Squad Name Required', 'Please enter a name for your squad.');
      return;
    }
    try {
      await createGroup(
        userId,
        groupNameInput,
        groupDescInput,
        undefined,
        selectedSquadType
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowCreateGroupModal(false);
      setGroupNameInput('');
      setGroupDescInput('');
      setSelectedSquadType('open_invite');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create squad.');
    }
  };

  const handleAddMemberToGroup = async () => {
    if (!selectedGroupForMember || !memberInput.trim()) return;
    try {
      await addMemberToGroup(userId, selectedGroupForMember.id, memberInput);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSelectedGroupForMember(null);
      setMemberInput('');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not add member.');
    }
  };

  const handleDeleteGroup = (group: SocialGroup) => {
    Alert.alert('Leave Group', `Are you sure you want to leave ${group.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leaveOrDeleteGroup(userId, group.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          loadData();
        },
      },
    ]);
  };

  const handleSelectFriendColor = async (friend: FriendUser, color: string) => {
    Haptics.selectionAsync().catch(() => {});
    await setFriendCustomColor(userId, friend.username, color);
    setSelectedFriendForDetail(null);
    loadData();
  };

  const pendingIncomingRequests = requests.filter(
    (r) => r.status === 'pending' && r.fromUserId !== userId
  );

  const mainScrollRef = useRef<FlatList<any>>(null);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        ref={mainScrollRef}
        data={[]}
        keyExtractor={(_, i) => `empty_${i}`}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            {/* ── Community Header with Title & Top-Right Combined Notifications Bell ── */}
            <View style={[styles.retroHeader, { paddingTop: Platform.OS === 'ios' ? 76 : 48 }]}>
              <Text style={[styles.retroScreenTitle, { color: colors.text }]}>Community</Text>
              <View style={styles.retroHeaderActions}>
                {/* Contextual Action Button based on active tab */}
                {activeTab === 'friends' && (
                  <TouchableOpacity
                    style={[styles.retroActionBtn, { backgroundColor: colors.surfaceElevated }]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setShowSendRequestModal(true);
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel="Invite Friends"
                  >
                    <Ionicons name="person-add-outline" size={19} color={colors.text} />
                  </TouchableOpacity>
                )}

                {activeTab === 'squads' && (
                  <TouchableOpacity
                    style={[styles.retroActionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setShowCreateGroupModal(true);
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel="New Squad"
                  >
                    <Ionicons name="add" size={20} color={isDark ? '#09090b' : '#ffffff'} />
                  </TouchableOpacity>
                )}

                {/* Notifications Bell Icon combining Friends & Squads Notifications with circle in bottom-right */}
                <TouchableOpacity
                  style={[styles.retroActionBtn, { backgroundColor: colors.surfaceElevated }]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowNotificationsModal(true);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Community Notifications"
                >
                  <Ionicons name="notifications-outline" size={20} color={colors.text} />
                  {pendingIncomingRequests.length > 0 && (
                    <View style={styles.retroNotificationDotBottomRight} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Full End-to-End Segmented Bar: Friends | Squads | Quests ── */}
            <View
              style={[
                styles.communitySubTabBar,
                {
                  backgroundColor: isDark ? '#000000' : '#ffffff',
                  borderBottomColor: isDark ? '#1f1f24' : '#e4e4eb',
                  borderTopColor: isDark ? '#1f1f24' : '#e4e4eb',
                },
              ]}
            >
              <TouchableOpacity
                style={styles.communitySubTabBtn}
                onPress={() => switchCommunityTab('friends')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.communitySubTabText,
                    {
                      color: activeTab === 'friends' ? colors.text : colors.textMuted,
                      fontWeight: activeTab === 'friends' ? '800' : '600',
                    },
                  ]}
                >
                  friends
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.communitySubTabBtn}
                onPress={() => switchCommunityTab('squads')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.communitySubTabText,
                    {
                      color: activeTab === 'squads' ? colors.text : colors.textMuted,
                      fontWeight: activeTab === 'squads' ? '800' : '600',
                    },
                  ]}
                >
                  squads
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.communitySubTabBtn}
                onPress={() => switchCommunityTab('quests')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.communitySubTabText,
                    {
                      color: activeTab === 'quests' ? colors.text : colors.textMuted,
                      fontWeight: activeTab === 'quests' ? '800' : '600',
                    },
                  ]}
                >
                  quests
                </Text>
              </TouchableOpacity>

              {/* Animated Underline Indicator across the bar */}
              <Animated.View
                style={[
                  styles.communitySubTabIndicator,
                  {
                    backgroundColor: colors.primary,
                    width: SCREEN_WIDTH / 3,
                    transform: [
                      {
                        translateX: communityTabAnim.interpolate({
                          inputRange: [0, 1, 2],
                          outputRange: [0, SCREEN_WIDTH / 3, (SCREEN_WIDTH / 3) * 2],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>

            {/* ── Retro Pill Search Bar ── */}
            <View style={[styles.retroSearchContainer, { backgroundColor: colors.surfaceElevated }]}>
              <Ionicons name="search" size={17} color={colors.textMuted} style={styles.retroSearchIcon} />
              <TextInput
                style={[styles.retroSearchInput, { color: colors.text }]}
                placeholder={
                  activeTab === 'friends'
                    ? 'Search friends or usernames'
                    : activeTab === 'squads'
                    ? 'Search squads or members'
                    : 'Search quests & challenges'
                }
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            {/* ── TAB 1: FRIENDS ── */}
            {activeTab === 'friends' && (
              <View>
                {/* Retro Circular Friend Grid / List (3 friends per tab) */}
                {(() => {
                  const filteredFriends = friends.filter(
                    (f) =>
                      !searchQuery.trim() ||
                      f.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      f.username.toLowerCase().includes(searchQuery.toLowerCase())
                  );

                  if (filteredFriends.length === 0) {
                    return (
                      <View style={[styles.friendsEmptyInline, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Ionicons name="people-outline" size={24} color={colors.textMuted} />
                        <Text style={[styles.friendsEmptyText, { color: colors.textMuted }]}>
                          {searchQuery.trim() ? 'No friends match your search.' : 'No friends yet — tap the add icon above to send a request'}
                        </Text>
                      </View>
                    );
                  }

                  type FriendCarouselItem = { type: 'friend'; data: FriendUser } | { type: 'add_friend' };
                  const allItems: FriendCarouselItem[] = [
                    ...filteredFriends.map((f) => ({ type: 'friend' as const, data: f })),
                    { type: 'add_friend' as const },
                  ];

                  const itemPages: FriendCarouselItem[][] = [];
                  for (let i = 0; i < allItems.length; i += 3) {
                    itemPages.push(allItems.slice(i, i + 3));
                  }

                  const numDots = itemPages.length;
                  const formatSteps = (steps: number) => {
                    if (steps >= 1000) {
                      return `${(steps / 1000).toFixed(1)}k`;
                    }
                    return steps.toString();
                  };

                  return (
                    <View style={styles.retroFriendsWrapper}>
                      <FlatList
                        data={itemPages}
                        keyExtractor={(_, index) => `friend_page_${index}`}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        decelerationRate="fast"
                        snapToInterval={FRIENDS_PAGE_WIDTH}
                        snapToAlignment="start"
                        onMomentumScrollEnd={(e) => {
                          const page = Math.round(e.nativeEvent.contentOffset.x / FRIENDS_PAGE_WIDTH);
                          setFriendsPageIndex(page);
                        }}
                        renderItem={({ item: pageItems }) => (
                          <View style={[styles.friendsPageContainer, { width: FRIENDS_PAGE_WIDTH }]}>
                            {pageItems.map((item) => {
                              if (item.type === 'add_friend') {
                                return (
                                  <TouchableOpacity
                                    key="add_friend_circle"
                                    style={styles.retroFriendItem}
                                    onPress={() => {
                                      Haptics.selectionAsync().catch(() => {});
                                      setShowSendRequestModal(true);
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <View
                                      style={[
                                        styles.retroAvatarContainer,
                                        {
                                          backgroundColor: colors.surfaceElevated,
                                          borderColor: colors.border,
                                          borderWidth: 1.5,
                                          borderStyle: 'dashed',
                                        },
                                      ]}
                                    >
                                      <Ionicons name="add" size={26} color={colors.primary} />
                                    </View>
                                    <Text style={[styles.retroFriendName, { color: colors.text }]} numberOfLines={1}>
                                      add
                                    </Text>
                                    <View style={styles.friendStepsRow}>
                                      <Text style={[styles.friendStepsText, { color: colors.textMuted }]} numberOfLines={1}>
                                        invite friends
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                );
                              }

                              const friend = item.data;
                              const stepsCount = friend.dailySteps || Math.round(friend.weeklySteps / 7) || 3600;
                              return (
                                <TouchableOpacity
                                  key={friend.id}
                                  style={styles.retroFriendItem}
                                  onPress={() => {
                                    handleOpenFriendProfile(friend);
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <View
                                    style={[
                                      styles.retroAvatarContainer,
                                      { backgroundColor: friend.avatarColor || '#e2e8f0' },
                                    ]}
                                  >
                                    {friend.avatarUrl ? (
                                      <Image source={{ uri: friend.avatarUrl }} style={styles.friendAvatarImage} />
                                    ) : (
                                      <Text style={styles.retroAvatarLetter}>
                                        {friend.username.charAt(0).toUpperCase()}
                                      </Text>
                                    )}
                                    {friend.isWalkingNow && (
                                      <View style={[styles.retroPinBadge, { borderColor: colors.background }]}>
                                        {!!friend.currentActivity && (
                                          <Ionicons
                                            name="footsteps"
                                            size={7.5}
                                            color={isDark ? '#09090b' : '#ffffff'}
                                          />
                                        )}
                                      </View>
                                    )}
                                  </View>

                                  <Text style={[styles.retroFriendName, { color: colors.text, fontWeight: '800' }]} numberOfLines={1}>
                                    {friend.username.toLowerCase()}
                                  </Text>

                                  <View style={styles.friendStepsRow}>
                                    <Ionicons
                                      name="navigate"
                                      size={11}
                                      color={friend.avatarColor}
                                      style={styles.cursorIconRotated}
                                    />
                                    <Text style={[styles.friendStepsText, { color: colors.textMuted, fontWeight: '700' }]} numberOfLines={1}>
                                      {formatSteps(stepsCount)} steps today
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                            {pageItems.length < 3 &&
                              Array.from({ length: 3 - pageItems.length }).map((_, spacerIdx) => (
                                <View key={`spacer_${spacerIdx}`} style={styles.retroFriendItem} />
                              ))}
                          </View>
                        )}
                      />

                      {numDots > 1 && (
                        <View style={styles.retroDotsRow}>
                          {itemPages.map((_, i) => {
                            const isActive = i === friendsPageIndex;
                            return (
                              <View
                                key={`dot_${i}`}
                                style={[
                                  styles.retroDot,
                                  isActive ? [styles.retroDotActive, { backgroundColor: colors.text }] : { backgroundColor: colors.border },
                                ]}
                              />
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Privacy Toggle with Countdown */}
                <View style={[styles.privacyCompactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.privacyCompactHeader}>
                    <View style={[styles.privacyIconWrapSmall, { backgroundColor: privacyStatus.isPrivate ? '#10b98118' : colors.surfaceElevated }]}>
                      <Ionicons
                        name={privacyStatus.isPrivate ? 'eye-off' : 'eye'}
                        size={18}
                        color={privacyStatus.isPrivate ? '#10b981' : colors.textMuted}
                      />
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.privacyCompactTitle, { color: colors.text }]}>Privacy Mode</Text>

                      {privacyStatus.isPrivate && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                          <Ionicons name="timer-outline" size={13} color="#10b981" />
                          <Text style={[styles.privacyTimerText, { color: '#10b981' }]}>
                            {privacyStatus.expiresAt
                              ? `${formatCountdown(privacyStatus.remainingSeconds)} left`
                              : 'Until I turn it back on'}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {privacyStatus.isPrivate ? (
                        <TouchableOpacity
                          style={styles.privacySolidResumeBtn}
                          onPress={() => handleTogglePrivacy(false)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="play" size={12} color="#ffffff" style={{ marginRight: 4 }} />
                          <Text style={styles.privacySolidResumeBtnText}>Resume</Text>
                        </TouchableOpacity>
                      ) : (
                        <Switch
                          value={false}
                          onValueChange={handleTogglePrivacy}
                          trackColor={{ false: colors.border, true: '#10b981' }}
                          thumbColor={Platform.OS === 'ios' ? undefined : colors.textMuted}
                        />
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ── TAB 2: SQUADS ── */}
            {activeTab === 'squads' && (
              <View>
                {(() => {
                  const filteredSquads = groups.filter((g) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      g.name.toLowerCase().includes(q) ||
                      g.description.toLowerCase().includes(q) ||
                      g.memberUsernames.some((u) => u.toLowerCase().includes(q))
                    );
                  });

                  if (filteredSquads.length === 0) {
                    return (
                      <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Ionicons name="shield-outline" size={32} color={colors.textMuted} />
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>No Squads Found</Text>
                        <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                          {searchQuery.trim()
                            ? 'No squads match your search criteria.'
                            : 'Create or join a walking squad to compete together on team ranks!'}
                        </Text>
                        <TouchableOpacity
                          style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setShowCreateGroupModal(true);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.emptyActionBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                            Create a Squad
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  return (
                    <View style={{ gap: 12, paddingBottom: 20 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, marginTop: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.textMuted }}>
                          ACTIVE SQUADS ({filteredSquads.length})
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setShowCreateGroupModal(true);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                            + New Squad
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {filteredSquads.map((item) => {
                        const memberCount = Math.max(1, item.memberUsernames.length);
                        const totalSquadSteps = Math.round(memberCount * 42500);
                        const gradeInfo = calculateSquadGrade(totalSquadSteps, memberCount);
                        const isAdminOnly = item.squadType === 'admin_only';

                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.squadCardContainer, { backgroundColor: colors.surfaceElevated }]}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setViewingSquad(item);
                            }}
                            activeOpacity={0.88}
                          >
                            <View style={styles.squadCardHeaderRow}>
                              <View style={[styles.squadCardGradeBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderColor: gradeInfo.color }]}>
                                <Text style={[styles.squadCardGradeText, { color: gradeInfo.color }]}>
                                  {gradeInfo.grade}
                                </Text>
                              </View>

                              <View style={{ flex: 1, marginLeft: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <Text style={[styles.squadCardTitle, { color: colors.text }]}>{item.name}</Text>
                                  {isAdminOnly && (
                                    <View
                                      style={[
                                        styles.squadTypeTag,
                                        {
                                          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                          borderWidth: 0,
                                        },
                                      ]}
                                    >
                                      <Ionicons name="lock-closed" size={10} color="#ef4444" />
                                      <Text style={[styles.squadTypeTagText, { color: '#ef4444' }]}>
                                        ADMIN
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={[styles.squadCardDesc, { color: colors.textMuted }]} numberOfLines={2}>
                                  {item.description}
                                </Text>
                              </View>
                            </View>

                            <View style={[styles.squadCardStatsBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 0 }]}>
                              <View style={styles.squadCardStatCol}>
                                <Text style={[styles.squadCardStatVal, { color: colors.text }]}>{memberCount}</Text>
                                <Text style={[styles.squadCardStatLabel, { color: colors.textMuted }]}>MEMBERS</Text>
                              </View>
                              <View style={[styles.squadCardStatDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />
                              <View style={styles.squadCardStatCol}>
                                <Text style={[styles.squadCardStatVal, { color: colors.text }]}>{totalSquadSteps.toLocaleString()}</Text>
                                <Text style={[styles.squadCardStatLabel, { color: colors.textMuted }]}>SQUAD STEPS</Text>
                              </View>
                              <View style={[styles.squadCardStatDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />
                              <View style={styles.squadCardStatCol}>
                                <Text style={[styles.squadCardStatVal, { color: gradeInfo.color }]}>{gradeInfo.grade}</Text>
                                <Text style={[styles.squadCardStatLabel, { color: colors.textMuted }]}>RATING</Text>
                              </View>
                            </View>

                            <View style={styles.squadMembersContainer}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                                {item.memberUsernames.map((u) => {
                                  const isSelf = u === myUsername;
                                  const isGroupAdmin = item.createdById === userId && isSelf;
                                  return (
                                    <View
                                      key={u}
                                      style={[
                                        styles.memberBadgePill,
                                        {
                                          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                          borderWidth: 0,
                                        },
                                      ]}
                                    >
                                      {isGroupAdmin && (
                                        <Ionicons name="star" size={10} color={colors.textSecondary} style={{ marginRight: 3 }} />
                                      )}
                                      <Text style={[styles.memberBadgeText, { color: isSelf ? colors.text : colors.textMuted }]}>
                                        @{u} {isSelf && '(You)'}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            )}

            {/* ── TAB 3: QUESTS ── */}
            {activeTab === 'quests' && (
              <View style={{ paddingBottom: 24 }}>
                {(() => {
                  const filteredQuests = quests.filter((q) => {
                    if (!searchQuery.trim()) return true;
                    const query = searchQuery.toLowerCase();
                    return (
                      q.title.toLowerCase().includes(query) ||
                      q.description.toLowerCase().includes(query) ||
                      q.category.toLowerCase().includes(query)
                    );
                  });

                  if (filteredQuests.length === 0) {
                    return (
                      <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Ionicons name="compass-outline" size={32} color={colors.textMuted} />
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>No Quests Found</Text>
                        <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                          No quests match your search query. Try another keyword!
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View style={{ gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, marginTop: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.textMuted }}>
                          ACTIVE CHALLENGES ({filteredQuests.length})
                        </Text>
                      </View>

                      {filteredQuests.map((quest) => {
                        const pct = Math.min(100, Math.round((quest.current / quest.target) * 100));
                        return (
                          <View
                            key={quest.id}
                            style={[styles.questCard, { backgroundColor: colors.surfaceElevated }]}
                          >
                            <View style={styles.questTopRow}>
                              <View style={[styles.questIconCircle, { backgroundColor: `${quest.color}18` }]}>
                                <Ionicons name={quest.icon} size={22} color={quest.color} />
                              </View>
                              <View style={{ flex: 1, marginLeft: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Text style={[styles.questCategoryPill, { color: quest.color }]}>
                                    {quest.category.toUpperCase()} QUEST
                                  </Text>
                                  <Text style={[styles.questDaysLeft, { color: colors.textMuted }]}>
                                    {quest.daysLeft}d left
                                  </Text>
                                </View>
                                <Text style={[styles.questTitle, { color: colors.text }]}>{quest.title}</Text>
                                <Text style={[styles.questDesc, { color: colors.textMuted }]} numberOfLines={2}>
                                  {quest.description}
                                </Text>
                              </View>
                            </View>

                            {/* Progress Bar & Numbers */}
                            <View style={styles.questProgressSection}>
                              <View style={styles.questProgressHeader}>
                                <Text style={[styles.questProgressValues, { color: colors.textSecondary }]}>
                                  {quest.current.toLocaleString()} / {quest.target.toLocaleString()} {quest.unit}
                                </Text>
                                <Text style={[styles.questProgressPercent, { color: quest.color }]}>
                                  {pct}%
                                </Text>
                              </View>
                              <View style={[styles.questProgressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                                <View style={[styles.questProgressBar, { width: `${pct}%`, backgroundColor: quest.color }]} />
                              </View>
                            </View>

                            {/* Reward & Join / Done Button */}
                            <View style={styles.questFooter}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                <Ionicons name="gift-outline" size={14} color={quest.color} />
                                <Text style={[styles.questRewardText, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {quest.reward}
                                </Text>
                              </View>

                              <TouchableOpacity
                                style={[
                                  styles.questActionBtn,
                                  quest.joined
                                    ? { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }
                                    : { backgroundColor: colors.primary },
                                ]}
                                onPress={() => handleToggleQuest(quest.id)}
                                activeOpacity={0.8}
                              >
                                <Ionicons
                                  name={quest.joined ? 'checkmark-circle' : 'flag'}
                                  size={13}
                                  color={quest.joined ? colors.text : (isDark ? '#09090b' : '#ffffff')}
                                />
                                <Text
                                  style={[
                                    styles.questActionBtnText,
                                    { color: quest.joined ? colors.text : (isDark ? '#09090b' : '#ffffff') },
                                  ]}
                                >
                                  {quest.joined ? 'Joined' : 'Join'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            )}

          </View>
        }
        renderItem={null}
      />

      {/* FRIEND FULL PROFILE BOTTOM SHEET — tapped from friends carousel */}
      <InteractiveBottomModal
        visible={!!selectedFriendForDetail}
        onDismiss={() => {
          setSelectedFriendForDetail(null);
          setSelectedMemberBadge(null);
        }}
        handleColor={colors.border}
        cardStyle={[
          styles.modalSheetCard,
          { backgroundColor: colors.surface, borderColor: colors.border, height: '82%', maxHeight: '90%' },
        ]}
      >
        {selectedFriendForDetail && (
          <View style={{ flex: 1, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              {/* Friend Profile Header Row */}
              <View style={styles.detailFriendHeader}>
                <View style={[styles.detailAvatar, { backgroundColor: selectedFriendForDetail.avatarColor, position: 'relative' }]}>
                  {selectedFriendForDetail.avatarUrl ? (
                    <Image source={{ uri: selectedFriendForDetail.avatarUrl }} style={styles.detailAvatarImage} />
                  ) : (
                    <Text style={styles.detailAvatarLetter}>
                      {selectedFriendForDetail.username.charAt(0).toUpperCase()}
                    </Text>
                  )}
                  {selectedFriendForDetail.isWalkingNow && (
                    <View style={[styles.retroPinBadge, { borderColor: colors.surface }]}>
                      {!!selectedFriendForDetail.currentActivity && (
                        <Ionicons
                          name="footsteps"
                          size={7.5}
                          color={isDark ? '#09090b' : '#ffffff'}
                        />
                      )}
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.detailName, { color: colors.text }]}>
                    {selectedFriendForDetail.displayName || selectedFriendForDetail.username}
                  </Text>
                  <Text style={[styles.detailHandle, { color: colors.textMuted }]}>
                    @{selectedFriendForDetail.username}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Ionicons name="navigate" size={11} color={selectedFriendForDetail.avatarColor} style={styles.cursorIconRotated} />
                    <Text style={[styles.detailActive, { color: colors.textMuted }]}>
                      {(selectedFriendForDetail.dailySteps || Math.round(selectedFriendForDetail.weeklySteps / 7) || 3600).toLocaleString()} daily steps • Active {selectedFriendForDetail.lastActive}
                    </Text>
                  </View>
                </View>
                {selectedFriendForDetail.username.toLowerCase() !== myUsername.toLowerCase() && (
                  <TouchableOpacity
                    style={[styles.detailRemoveBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => {
                      handleRemoveFriend(selectedFriendForDetail);
                      setSelectedFriendForDetail(null);
                    }}
                  >
                    <Ionicons name="person-remove-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Stats Bar */}
              <View style={[styles.profileStatsBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <View style={styles.profileStatCol}>
                  <Text style={[styles.profileStatVal, { color: colors.text }]}>
                    {(selectedFriendForDetail.weeklySteps / 1000).toFixed(1)}k
                  </Text>
                  <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>WEEKLY STEPS</Text>
                </View>
                <View style={[styles.profileStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.profileStatCol}>
                  <Text style={[styles.profileStatVal, { color: colors.text }]}>
                    {selectedFriendForDetail.totalWorkouts}
                  </Text>
                  <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>WORKOUTS</Text>
                </View>
                <View style={[styles.profileStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.profileStatCol}>
                  <Text style={[styles.profileStatVal, { color: colors.text }]}>
                    {Math.round((selectedFriendForDetail.dailySteps || Math.round(selectedFriendForDetail.weeklySteps / 7) || 3600) * 0.045)}
                  </Text>
                  <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>EST. KCAL</Text>
                </View>
              </View>

              {/* Profile Sub-tabs: Activity | Badges | Cursor */}
              <View style={[styles.subTabBarContainer, { backgroundColor: isDark ? '#000000' : '#ffffff', borderBottomColor: isDark ? '#1f1f24' : '#e5e5ea' }]}>
                <TouchableOpacity
                  style={styles.subTabBtn}
                  onPress={() => switchMemberSubTab('activity')}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.subTabText,
                      {
                        color: memberSubTab === 'activity' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                        fontWeight: memberSubTab === 'activity' ? '800' : '600',
                      },
                    ]}
                  >
                    activity
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.subTabBtn}
                  onPress={() => switchMemberSubTab('badges')}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.subTabText,
                      {
                        color: memberSubTab === 'badges' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                        fontWeight: memberSubTab === 'badges' ? '800' : '600',
                      },
                    ]}
                  >
                    badges
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.subTabBtn}
                  onPress={() => switchMemberSubTab('cursor')}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.subTabText,
                      {
                        color: memberSubTab === 'cursor' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                        fontWeight: memberSubTab === 'cursor' ? '800' : '600',
                      },
                    ]}
                  >
                    cursor
                  </Text>
                </TouchableOpacity>

                {/* Animated active underline line */}
                <Animated.View
                  style={[
                    styles.subTabHighlightLine,
                    {
                      backgroundColor: isDark ? '#ffffff' : '#000000',
                      left: memberTabAnim.interpolate({
                        inputRange: [0, 1, 2],
                        outputRange: ['0%', '33.33%', '66.66%'],
                      }),
                      width: '33.33%',
                    },
                  ]}
                />
              </View>

              {/* Scrollable Sub-tab Content */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
                style={{ flex: 1 }}
              >
                {memberSubTab === 'activity' ? (
                  <View style={{ paddingTop: 4 }}>
                    {/* Daily Steps Graph */}
                    <WeeklyBarChart
                      userId={selectedFriendForDetail.username}
                      stepsGoal={8000}
                      distanceGoal={5}
                      metricMode="steps"
                      distanceUnit="mi"
                      weekOffset={memberWeekOffset}
                      onWeekOffsetChange={setMemberWeekOffset}
                      selectedDate={memberSelectedDate}
                      onDaySelect={setMemberSelectedDate}
                      hideGoalLine={true}
                    />

                    {/* Daily Distance Graph */}
                    <WeeklyBarChart
                      userId={selectedFriendForDetail.username}
                      stepsGoal={8000}
                      distanceGoal={5}
                      metricMode="distance"
                      distanceUnit="mi"
                      weekOffset={memberWeekOffset}
                      onWeekOffsetChange={setMemberWeekOffset}
                      selectedDate={memberSelectedDate}
                      onDaySelect={setMemberSelectedDate}
                      hideGoalLine={true}
                    />
                  </View>
                ) : memberSubTab === 'badges' ? (
                  <View style={styles.badgesSectionContainer}>
                    {/* Badges Header Summary */}
                    <View style={[styles.badgesSummaryBanner, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb', borderColor: isDark ? '#232328' : '#e8e8ed' }]}>
                      <View style={styles.badgesSummaryCol}>
                        <Text style={[styles.badgesSummaryNum, { color: TIER_METALLIC.gold.base }]}>
                          {memberBadges.filter((b) => b.currentTier === 'gold').length}
                        </Text>
                        <Text style={[styles.badgesSummaryLabel, { color: colors.textMuted }]}>GOLD</Text>
                      </View>
                      <View style={[styles.badgesSummaryDivider, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]} />
                      <View style={styles.badgesSummaryCol}>
                        <Text style={[styles.badgesSummaryNum, { color: TIER_METALLIC.silver.base }]}>
                          {memberBadges.filter((b) => b.currentTier === 'silver').length}
                        </Text>
                        <Text style={[styles.badgesSummaryLabel, { color: colors.textMuted }]}>SILVER</Text>
                      </View>
                      <View style={[styles.badgesSummaryDivider, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]} />
                      <View style={styles.badgesSummaryCol}>
                        <Text style={[styles.badgesSummaryNum, { color: TIER_METALLIC.bronze.base }]}>
                          {memberBadges.filter((b) => b.currentTier === 'bronze').length}
                        </Text>
                        <Text style={[styles.badgesSummaryLabel, { color: colors.textMuted }]}>BRONZE</Text>
                      </View>
                    </View>

                    {/* Badges Grid with 3D Physics */}
                    <View style={styles.badgesGrid}>
                      {memberBadges.map((badge) => (
                        <InteractiveBadge
                          key={badge.id}
                          badge={badge}
                          isDark={isDark}
                          onPress={() => setSelectedMemberBadge(badge)}
                        />
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={{ paddingTop: 8 }}>
                    {/* Map Cursor color palette */}
                    <Text style={[styles.profilePaletteTitle, { color: colors.text }]}>Map Cursor Color</Text>
                    <Text style={[styles.profilePaletteDesc, { color: colors.textMuted }]}>
                      Pick a radar cursor & trail color for this friend on your map.
                    </Text>
                    <View style={styles.paletteGrid}>
                      {FRIEND_CURSOR_PALETTE.map((color) => {
                        const isSelected = selectedFriendForDetail.avatarColor === color;
                        return (
                          <TouchableOpacity
                            key={color}
                            style={[styles.paletteSwatch, { backgroundColor: color }, isSelected && styles.paletteSwatchSelected]}
                            onPress={() => handleSelectFriendColor(selectedFriendForDetail, color)}
                            activeOpacity={0.8}
                          >
                            {isSelected && <Ionicons name="checkmark" size={18} color="#ffffff" />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>

            <TouchableOpacity
              style={[styles.colorDoneBtn, { backgroundColor: colors.primary, marginTop: 10 }]}
              onPress={() => {
                setSelectedFriendForDetail(null);
                setSelectedMemberBadge(null);
              }}
            >
              <Text style={[styles.colorDoneBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </InteractiveBottomModal>

      {/* ── FRIEND BADGE DETAIL POPUP BOTTOM SHEET ── */}
      <InteractiveBottomModal
        visible={!!selectedMemberBadge}
        onDismiss={() => setSelectedMemberBadge(null)}
        handleColor={isDark ? '#3f3f46' : '#d4d4d8'}
        cardStyle={[
          styles.badgeDetailCard,
          {
            backgroundColor: isDark ? '#141418' : '#ffffff',
            borderColor: selectedMemberBadge?.currentTier
              ? TIER_METALLIC[selectedMemberBadge.currentTier].border
              : isDark ? '#27272a' : '#e4e4e7',
          },
        ]}
      >
        {selectedMemberBadge && (() => {
          const tierInfo = selectedMemberBadge.currentTier
            ? TIER_METALLIC[selectedMemberBadge.currentTier]
            : null;
          return (
            <View style={styles.badgeDetailContent}>
              <View
                style={[
                  styles.badgeDetailIconCircle,
                  {
                    backgroundColor: tierInfo ? tierInfo.base : isDark ? '#27272a' : '#e4e4e7',
                    borderColor: tierInfo ? tierInfo.glow : isDark ? '#3f3f46' : '#d4d4d8',
                  },
                ]}
              >
                <Ionicons
                  name={selectedMemberBadge.icon as any}
                  size={42}
                  color={tierInfo ? '#ffffff' : colors.textMuted}
                />
              </View>

              <Text style={[styles.badgeDetailTitle, { color: colors.text }]}>
                {selectedMemberBadge.title}
              </Text>

              {tierInfo ? (
                <View style={[styles.badgeDetailTierPill, { backgroundColor: `${tierInfo.base}22`, borderColor: tierInfo.border }]}>
                  <Text style={[styles.badgeDetailTierText, { color: tierInfo.glow }]}>
                    {selectedMemberBadge.currentTier?.toUpperCase()} TIER
                  </Text>
                </View>
              ) : (
                <View style={[styles.badgeDetailTierPill, { backgroundColor: isDark ? '#27272a' : '#f4f4f5', borderColor: colors.border }]}>
                  <Text style={[styles.badgeDetailTierText, { color: colors.textMuted }]}>
                    LOCKED
                  </Text>
                </View>
              )}

              <Text style={[styles.badgeDetailDesc, { color: colors.textSecondary }]}>
                {selectedMemberBadge.description}
              </Text>

              <View style={[styles.badgeProgressBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <View style={styles.badgeProgressHeader}>
                  <Text style={[styles.badgeProgressLabel, { color: colors.textMuted }]}>
                    PROGRESS TO NEXT TIER
                  </Text>
                  <Text style={[styles.badgeProgressPct, { color: colors.text }]}>
                    {selectedMemberBadge.progressPercent}%
                  </Text>
                </View>
                <View style={[styles.badgeProgressTrack, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}>
                  <View
                    style={[
                      styles.badgeProgressBar,
                      {
                        backgroundColor: tierInfo ? tierInfo.base : colors.primary,
                        width: `${selectedMemberBadge.progressPercent}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.badgeProgressValueText, { color: colors.textMuted }]}>
                  {selectedMemberBadge.currentValue.toLocaleString()} / {selectedMemberBadge.nextTierTarget.toLocaleString()} {selectedMemberBadge.unit}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.badgeDetailCloseBtn, { backgroundColor: colors.primary }]}
                onPress={() => setSelectedMemberBadge(null)}
              >
                <Text style={[styles.badgeDetailCloseText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          );
        })()}
      </InteractiveBottomModal>

      {/* MODAL: SEND FRIEND REQUEST */}
      {/* MODAL: SEND FRIEND REQUEST */}
      <InteractiveBottomModal
        visible={showSendRequestModal}
        onDismiss={() => setShowSendRequestModal(false)}
        handleColor={colors.border}
        cardStyle={[styles.modalSheetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
            <Text style={[styles.modalSheetHeading, { color: colors.text }]}>Send Friend Request</Text>
            <Text style={[styles.modalSheetSubtext, { color: colors.textMuted }]}>
              Enter a unique @username. They will receive your invite and appear on your live walking radar once accepted!
            </Text>

            <View style={[styles.modalInputWrapper, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={[styles.inputPrefix, { color: colors.primary }]}>@</Text>
              <TextInput
                style={[styles.modalInputText, { color: colors.text }]}
                placeholder="username (e.g. sarah_runs, alex_stride)"
                placeholderTextColor={colors.textMuted}
                value={targetUsernameInput}
                onChangeText={(t) => {
                  setTargetUsernameInput(t.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                  setRequestError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {requestError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={14} color="#ef4444" />
                <Text style={styles.errorBannerText}>{requestError}</Text>
              </View>
            )}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalDismissBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={() => setShowSendRequestModal(false)}
              >
                <Text style={[styles.modalDismissText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleSendRequest}
                disabled={requestSending}
              >
                <Ionicons name="paper-plane" size={15} color={isDark ? '#09090b' : '#ffffff'} />
                <Text style={[styles.modalPrimaryBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Send Request</Text>
              </TouchableOpacity>
            </View>
      </InteractiveBottomModal>

      {/* MODAL: PRIVACY DURATION SELECTION DROPUP */}
      <InteractiveBottomModal
        visible={showPrivacyDurationModal}
        onDismiss={() => {
          setShowPrivacyDurationModal(false);
          // If dismissed without choosing an amount, automatically turn back off privacy mode
          if (!privacySelectionMadeRef.current) {
            setLocationPrivacy(userId, false).then((res) => {
              setPrivacyStatus(res);
              syncMyProfileToSupabase(userId, { location_private: false });
            });
          }
        }}
        handleColor={colors.border}
        cardStyle={[styles.modalSheetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={{ marginBottom: 4 }}>
          <Text style={[styles.modalSheetHeading, { color: colors.text }]}>Privacy Duration</Text>
        </View>
        <Text style={[styles.modalSheetSubtext, { color: colors.textMuted, marginBottom: 16 }]}>
          Select how long your live walking position and activity will be hidden.
        </Text>

        {/* Duration Pills Grid (2h, 4h, 12h, 24h) */}
        <View style={styles.privacyDurationGrid}>
          {[
            { label: '2 Hours', hours: 2 },
            { label: '4 Hours', hours: 4 },
            { label: '12 Hours', hours: 12 },
            { label: '24 Hours', hours: 24 },
          ].map((pill) => (
            <TouchableOpacity
              key={pill.label}
              style={[
                styles.privacyDurationPill,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
              onPress={() => handleSelectPrivacyDuration(pill.hours)}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={15} color={colors.primary} />
              <Text style={[styles.privacyDurationPillText, { color: colors.text }]}>{pill.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Until I turn it back on Option Across the Bottom */}
        <TouchableOpacity
          style={[styles.privacyIndefiniteBtn, { backgroundColor: `${colors.textMuted}14`, borderColor: colors.border }]}
          onPress={() => handleSelectPrivacyDuration(null)}
          activeOpacity={0.7}
        >
          <Ionicons name="infinite-outline" size={18} color={colors.text} />
          <Text style={[styles.privacyIndefiniteBtnText, { color: colors.text }]}>Until I turn it back on</Text>
        </TouchableOpacity>
      </InteractiveBottomModal>

      {/* ── MODAL: COMBINED NOTIFICATIONS (FRIENDS & GROUPS/SQUADS) ── */}
      <InteractiveBottomModal
        visible={showNotificationsModal}
        onDismiss={() => setShowNotificationsModal(false)}
        handleColor={colors.border}
        cardStyle={[styles.modalSheetCard, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '88%' }]}
      >
        <View style={styles.notifHeaderRow}>
          <View>
            <Text style={[styles.modalSheetHeading, { color: colors.text }]}>Notifications</Text>
            <Text style={[styles.modalSheetSubtext, { color: colors.textMuted }]}>
              Pending requests, invites & group activity updates
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.notifCloseIconBtn, { backgroundColor: colors.surfaceElevated }]}
            onPress={() => setShowNotificationsModal(false)}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Section 1: Pending Friend Requests */}
          <View style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={[styles.notifSectionTitle, { color: colors.text }]}>
                Friend Requests ({pendingIncomingRequests.length})
              </Text>
              {pendingIncomingRequests.length > 0 && (
                <View style={styles.notifBadgeCount}>
                  <Text style={styles.notifBadgeCountText}>{pendingIncomingRequests.length} new</Text>
                </View>
              )}
            </View>

            {pendingIncomingRequests.length === 0 ? (
              <View style={[styles.notifEmptyBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Ionicons name="checkmark-done-circle-outline" size={24} color={colors.textMuted} />
                <Text style={[styles.notifEmptyText, { color: colors.textMuted }]}>
                  No pending friend requests
                </Text>
              </View>
            ) : (
              pendingIncomingRequests.map((req) => (
                <View
                  key={req.id}
                  style={[styles.retroRequestCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 10 }]}
                >
                  <View style={styles.retroRequestTopRow}>
                    <View style={[styles.retroRequestAvatar, { backgroundColor: req.fromAvatarColor || colors.primary }]}>
                      <Text style={styles.retroRequestAvatarLetter}>
                        {req.fromDisplayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.retroRequestInfo}>
                      <Text style={[styles.retroRequestName, { color: colors.text }]}>
                        {req.fromDisplayName.toLowerCase()}
                      </Text>
                      <Text style={[styles.retroRequestHandle, { color: colors.textMuted }]}>
                        @{req.fromUsername}
                      </Text>
                    </View>
                    <View style={styles.retroRequestTimeWrap}>
                      <View style={styles.retroRedDot} />
                    </View>
                  </View>

                  <View style={styles.retroRequestButtonsRow}>
                    <TouchableOpacity
                      style={[styles.retroAcceptBtn, { backgroundColor: colors.primary }]}
                      onPress={async () => {
                        await handleAcceptRequest(req);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.retroAcceptBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.retroDecideLaterBtn, { borderColor: colors.border }]}
                      onPress={async () => {
                        await handleDeclineRequest(req);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.retroDecideLaterBtnText, { color: colors.text }]}>Decide Later</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Section 2: Squad / Group Activity Alerts */}
          <View>
            <Text style={[styles.notifSectionTitle, { color: colors.text, marginBottom: 10 }]}>
              Squad & Group Updates
            </Text>

            {groups.length === 0 ? (
              <View style={[styles.notifEmptyBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Ionicons name="shield-outline" size={24} color={colors.textMuted} />
                <Text style={[styles.notifEmptyText, { color: colors.textMuted }]}>
                  No squad activity yet. Join or start a squad to get group alerts.
                </Text>
              </View>
            ) : (
              groups.map((group) => {
                const memberCount = Math.max(1, group.memberUsernames.length);
                const totalSquadSteps = Math.round(memberCount * 42500);
                const gradeInfo = calculateSquadGrade(totalSquadSteps, memberCount);
                return (
                  <TouchableOpacity
                    key={`alert_${group.id}`}
                    style={[styles.squadAlertCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => {
                      setShowNotificationsModal(false);
                      setViewingSquad(group);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.squadAlertIconWrap, { backgroundColor: `${gradeInfo.color}18` }]}>
                      <Text style={[styles.squadAlertGradeText, { color: gradeInfo.color }]}>
                        {gradeInfo.grade}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.squadAlertTitle, { color: colors.text }]}>
                        {group.name}
                      </Text>
                      <Text style={[styles.squadAlertDesc, { color: colors.textMuted }]} numberOfLines={1}>
                        Squad reached {gradeInfo.label} rating • {memberCount} active members
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      </InteractiveBottomModal>

      {/* ── MODAL: CREATE SQUAD ── */}
      <InteractiveBottomModal
        visible={showCreateGroupModal}
        onDismiss={() => setShowCreateGroupModal(false)}
        handleColor={colors.border}
        cardStyle={[styles.modalSheetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <Text style={[styles.modalSheetHeading, { color: colors.text }]}>Create Walking Squad</Text>
          <Text style={[styles.modalSheetSubtext, { color: colors.textMuted }]}>
            Form a squad, invite companions, and compare step leaderboards.
          </Text>

          {/* Squad Type Selection */}
          <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 4 }]}>SQUAD ACCESS & INVITATIONS</Text>
          <View style={styles.typeOptionContainer}>
            {/* Option 1: Admin Only */}
            <TouchableOpacity
              style={[
                styles.typeOptionCard,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                selectedSquadType === 'admin_only' && {
                  borderColor: colors.primary,
                  backgroundColor: `${colors.primary}12`,
                },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSelectedSquadType('admin_only');
              }}
              activeOpacity={0.8}
            >
              <View style={styles.typeOptionHeader}>
                <View style={[styles.typeIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  <Ionicons name="lock-closed" size={16} color="#ef4444" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.typeOptionTitle, { color: colors.text }]}>Admin Only</Text>
                  <Text style={[styles.typeOptionDesc, { color: colors.textMuted }]}>
                    You are the only admin and can curate members. Other members cannot invite anyone.
                  </Text>
                </View>
                <Ionicons
                  name={selectedSquadType === 'admin_only' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedSquadType === 'admin_only' ? colors.primary : colors.textMuted}
                />
              </View>
            </TouchableOpacity>

            {/* Option 2: Open Invite */}
            <TouchableOpacity
              style={[
                styles.typeOptionCard,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                selectedSquadType === 'open_invite' && {
                  borderColor: colors.primary,
                  backgroundColor: `${colors.primary}12`,
                },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSelectedSquadType('open_invite');
              }}
              activeOpacity={0.8}
            >
              <View style={styles.typeOptionHeader}>
                <View style={[styles.typeIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Ionicons name="people" size={16} color="#3b82f6" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.typeOptionTitle, { color: colors.text }]}>Open Invite</Text>
                  <Text style={[styles.typeOptionDesc, { color: colors.textMuted }]}>
                    Anyone in the squad can add anyone else as long as they are already a member.
                  </Text>
                </View>
                <Ionicons
                  name={selectedSquadType === 'open_invite' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedSquadType === 'open_invite' ? colors.primary : colors.textMuted}
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Inputs */}
          <View style={[styles.modalInputWrapper, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, marginTop: 12 }]}>
            <Ionicons name="flag" size={18} color={colors.primary} />
            <TextInput
              style={[styles.modalInputText, { color: colors.text, marginLeft: 8 }]}
              placeholder="Squad Name (e.g. Sunset Loopers)"
              placeholderTextColor={colors.textMuted}
              value={groupNameInput}
              onChangeText={setGroupNameInput}
            />
          </View>

          <View style={[styles.modalInputWrapper, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, height: 64, alignItems: 'flex-start', paddingTop: 10, marginTop: 10 }]}>
            <TextInput
              style={[styles.modalInputText, { color: colors.text, height: '100%' }]}
              placeholder="Squad Goal (e.g. 50k weekly steps together)"
              placeholderTextColor={colors.textMuted}
              value={groupDescInput}
              onChangeText={setGroupDescInput}
              multiline
            />
          </View>

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={[styles.modalDismissBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              onPress={() => setShowCreateGroupModal(false)}
            >
              <Text style={[styles.modalDismissText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreateGroup}
            >
              <Ionicons name="checkmark-circle" size={16} color={isDark ? '#09090b' : '#ffffff'} />
              <Text style={[styles.modalPrimaryBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Create Squad</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </InteractiveBottomModal>

      {/* ── MODAL: ADD SQUAD MEMBER ── */}
      <InteractiveBottomModal
        visible={!!selectedGroupForMember}
        onDismiss={() => setSelectedGroupForMember(null)}
        handleColor={colors.border}
        cardStyle={[styles.modalSheetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.modalSheetHeading, { color: colors.text }]}>
          Add to {selectedGroupForMember?.name}
        </Text>
        <Text style={[styles.modalSheetSubtext, { color: colors.textMuted }]}>
          {selectedGroupForMember?.squadType === 'admin_only'
            ? 'As the squad admin, invite a friend to join.'
            : 'Invite any friend to join this squad.'}
        </Text>

        <View style={[styles.modalInputWrapper, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={[styles.inputPrefix, { color: colors.primary }]}>@</Text>
          <TextInput
            style={[styles.modalInputText, { color: colors.text }]}
            placeholder="friend_username"
            placeholderTextColor={colors.textMuted}
            value={memberInput}
            onChangeText={(t) => setMemberInput(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.modalButtonRow}>
          <TouchableOpacity
            style={[styles.modalDismissBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={() => setSelectedGroupForMember(null)}
          >
            <Text style={[styles.modalDismissText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleAddMemberToGroup}
          >
            <Text style={[styles.modalPrimaryBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Add Member</Text>
          </TouchableOpacity>
        </View>
      </InteractiveBottomModal>

      {/* ── MODAL: SQUAD DETAIL FULL-PAGE ── */}
      {!!viewingSquad && (
        <SquadDetailScreen
          visible={!!viewingSquad}
          squad={viewingSquad}
          userId={userId}
          myUsername={myUsername}
          onClose={() => setViewingSquad(null)}
          onAddMember={(squad) => {
            setViewingSquad(null);
            setSelectedGroupForMember(squad);
          }}
          onLeave={async (squad) => {
            setViewingSquad(null);
            await leaveOrDeleteGroup(userId, squad.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            loadData();
          }}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 28,
    marginBottom: 4,
  },
  screenTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  screenSubtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  /* Action row: Add Friend & Email requests */
  friendsTopActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  mainAddFriendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  mainAddFriendBtnText: {
    color: '#09090b',
    fontSize: 14,
    fontWeight: '800',
  },
  emailRequestsBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  emailNotificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#09090b',
  },
  emailNotificationText: {
    color: '#09090b',
    fontSize: 10,
    fontWeight: '900',
  },
  friendsSubheadRow: {
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  friendsSubheadTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  /* Segmented Navigation Bar */
  segmentedBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: Platform.OS === 'ios' ? 56 : 28,
    marginBottom: 8,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
  },
  segmentBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    fontWeight: '800',
  },
  notifBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  /* Section Header Action Bar */
  sectionActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sectionSub: {
    fontSize: 12.5,
    marginTop: 4,
    lineHeight: 17,
    maxWidth: 240,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 12,
  },
  primaryActionBtnText: {
    color: '#09090b',
    fontSize: 13,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 0,
  },
  /* Cards */
  cardContainer: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  liveGlowBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
  },
  liveGlowCore: {
    width: 0,
    height: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardUsername: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardLastActive: {
    fontSize: 11,
    fontWeight: '500',
  },
  liveTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  livePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  liveTagText: {
    color: '#10b981',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  friendRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorSwatchBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  deleteActionBtn: {
    padding: 6,
    borderRadius: 8,
  },
  cardStatsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardStatCol: {
    alignItems: 'center',
  },
  cardStatVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardStatLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  cardStatDivider: {
    width: 1,
    height: 20,
  },
  cardStatColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCursorPreviewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  /* Groups */
  groupEmojiCircle: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  addMemberIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membersContainer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  membersHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  memberBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  memberBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  /* Empty States */
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 16,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: -0.5,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },
  emptyActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
  },
  emptyActionBtnText: {
    color: '#09090b',
    fontSize: 13,
    fontWeight: '800',
  },
  /* Privacy Card */
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    gap: 12,
  },
  privacyCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  privacyIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  privacySub: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 15,
  },
  privacyToggleBtn: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 10,
    borderWidth: 1,
  },
  privacyToggleBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  /* Inline Incoming Requests */
  incomingRequestsSection: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    gap: 8,
  },
  incomingRequestsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  incomingRequestsTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  inlineRequestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  /* Request Item Styles */
  requestButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  acceptBtnText: {
    color: '#09090b',
    fontSize: 12,
    fontWeight: '800',
  },
  declineBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalSheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 44 : 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modalSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalSheetHeading: {
    fontFamily: SERIF_FONT,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  modalSheetSubtext: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
  },
  inputPrefix: {
    fontSize: 17,
    fontWeight: '800',
    marginRight: 4,
  },
  modalInputText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 0,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  errorBannerText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalDismissBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  modalDismissText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalPrimaryBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
  },
  modalPrimaryBtnText: {
    color: '#09090b',
    fontSize: 13,
    fontWeight: '800',
  },
  emojiPickerLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  emojiPickerRow: {
    gap: 8,
    paddingBottom: 14,
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorModalCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginVertical: 16,
  },
  paletteSwatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paletteSwatchSelected: {
    borderColor: '#ffffff',
    transform: [{ scale: 1.1 }],
  },
  colorDoneBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  colorDoneBtnText: {
    color: '#09090b',
    fontSize: 14,
    fontWeight: '800',
  },

  /* ── Friends Section Header ── */
  friendsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  friendsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  miniActionBtnText: {
    color: '#09090b',
    fontSize: 13,
    fontWeight: '800',
  },

  /* ── Friend Horizontal Chip Cards ── */
  friendsScrollContent: {
    paddingHorizontal: 0,
    gap: 10,
    paddingBottom: 4,
  },
  friendChip: {
    width: 128,
    height: 158,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 5,
    elevation: 2,
  },
  friendChipAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  friendChipAvatarWrap: {
    position: 'relative',
    marginBottom: 4,
  },
  friendChipAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendChipAvatarLetter: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  friendChipLiveDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 2,
  },
  friendChipName: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  friendChipHandle: {
    fontSize: 10.5,
    textAlign: 'center',
  },
  friendChipStat: {
    alignItems: 'center',
    marginTop: 6,
  },
  friendChipStatVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  friendChipStatLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  friendChipCursorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    opacity: 0.85,
  },
  friendsEmptyInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  friendsEmptyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  /* ── Squads Section Header ── */
  squadsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12,
  },

  /* ── Friend Detail Modal ── */
  detailFriendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAvatarLetter: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  detailName: {
    fontFamily: SERIF_FONT,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  detailHandle: {
    fontSize: 13,
    marginTop: 2,
  },
  detailActive: {
    fontSize: 11.5,
    marginTop: 2,
  },
  detailRemoveBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },

  /* ── Privacy Row (re-used from index) ── */
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginVertical: 8,
  },
  privacyLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },

  /* ── Retro Header & Search ── */
  retroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 16,
  },
  retroScreenTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  retroHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  retroActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  retroNotificationDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ef4444',
  },
  retroNotificationDotBottomRight: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  retroSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  retroSearchIcon: {
    marginRight: 8,
  },
  retroSearchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    height: '100%',
    padding: 0,
  },

  /* ── Retro Friends Circle Grid (3 per tab) ── */
  retroFriendsWrapper: {
    marginBottom: 20,
  },
  friendsPageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  retroFriendItem: {
    alignItems: 'center',
    width: (FRIENDS_PAGE_WIDTH - 24) / 3,
  },
  retroAvatarContainer: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  friendAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
  },
  detailAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  retroAvatarLetter: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  retroPinBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  retroFriendName: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
    marginTop: 7,
    textAlign: 'center',
    width: '100%',
  },
  friendStepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 3,
    width: '100%',
  },
  cursorIconRotated: {
    transform: [{ rotate: '-45deg' }],
  },
  friendStepsText: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  retroDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  retroDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  retroDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  /* ── Retro Request Cards ── */
  retroRequestsSection: {
    marginBottom: 18,
    gap: 10,
  },
  retroSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  retroRequestCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  retroRequestTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  retroRequestAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retroRequestAvatarLetter: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  retroRequestInfo: {
    flex: 1,
    marginLeft: 12,
  },
  retroRequestName: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  retroRequestHandle: {
    fontSize: 12,
    marginTop: 1,
  },
  retroRequestExpires: {
    fontSize: 11,
    marginTop: 3,
  },
  retroRequestTimeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  retroRequestTime: {
    fontSize: 11,
    fontWeight: '500',
  },
  retroRedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  retroRequestButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  retroAcceptBtn: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retroAcceptBtnText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  retroDecideLaterBtn: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retroDecideLaterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  /* ── Compact Privacy UI ── */
  privacyCompactCard: {
    marginHorizontal: 0,
    marginTop: 14,
    marginBottom: 24,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 68,
  },
  privacyCompactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privacyIconWrapSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyCompactTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  privacyTimerText: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  privacySubSmall: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  privacySolidResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 18,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  privacySolidResumeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },

  /* ── Privacy Duration Bottom Sheet Dropup ── */
  privacyDurationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  privacyDurationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minWidth: '45%',
  },
  privacyDurationPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  privacyIndefiniteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 2,
    marginBottom: 4,
  },
  privacyIndefiniteBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },

  /* ── Friend Profile Full Modal Styles ── */
  profileStatsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  profileStatCol: {
    alignItems: 'center',
  },
  profileStatVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  profileStatLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  profileStatDivider: {
    width: 1,
    height: 24,
  },
  subTabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    position: 'relative',
    borderBottomWidth: 1,
    marginBottom: 14,
  },
  subTabBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  subTabText: {
    fontSize: 14,
    letterSpacing: -0.2,
    textTransform: 'lowercase',
  },
  subTabHighlightLine: {
    position: 'absolute',
    bottom: -1,
    height: 3,
    borderRadius: 1.5,
    zIndex: 5,
  },
  badgesSectionContainer: {
    paddingTop: 4,
  },
  badgesSummaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  badgesSummaryCol: {
    alignItems: 'center',
  },
  badgesSummaryNum: {
    fontSize: 18,
    fontWeight: '800',
  },
  badgesSummaryLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  badgesSummaryDivider: {
    width: 1,
    height: 24,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  profilePaletteTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  profilePaletteDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  badgeDetailCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  badgeDetailContent: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  badgeDetailIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  badgeDetailTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  badgeDetailTierPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  badgeDetailTierText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  badgeDetailDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  badgeProgressBox: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
  },
  badgeProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeProgressLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeProgressPct: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeProgressTrack: {
    height: 7,
    borderRadius: 3.5,
    overflow: 'hidden',
    marginBottom: 6,
  },
  badgeProgressBar: {
    height: '100%',
    borderRadius: 3.5,
  },
  badgeProgressValueText: {
    fontSize: 11,
    textAlign: 'right',
  },
  badgeDetailCloseBtn: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDetailCloseText: {
    fontSize: 15,
    fontWeight: '800',
  },

  /* ── Community 3-Way SubTab Bar ── */
  communitySubTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    marginHorizontal: -16,
    position: 'relative',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  communitySubTabBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  communitySubTabText: {
    fontSize: 14,
    letterSpacing: -0.2,
    textTransform: 'lowercase',
  },
  communitySubTabIndicator: {
    position: 'absolute',
    bottom: -1,
    height: 3,
    borderRadius: 1.5,
    zIndex: 5,
  },
  tabCounterPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  tabCounterText: {
    fontSize: 11,
    fontWeight: '800',
  },

  /* ── Notifications Modal Styles ── */
  notifHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  notifCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  notifBadgeCount: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ef4444',
  },
  notifBadgeCountText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  notifEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  notifEmptyText: {
    fontSize: 12.5,
    textAlign: 'center',
    fontWeight: '500',
  },
  squadAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  squadAlertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  squadAlertGradeText: {
    fontFamily: SERIF_FONT,
    fontSize: 16,
    fontWeight: '800',
  },
  squadAlertTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  squadAlertDesc: {
    fontSize: 11.5,
    marginTop: 2,
  },

  /* ── Squad Cards Styles ── */
  squadCardContainer: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  squadCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  squadCardGradeBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  squadCardGradeText: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  squadCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  squadCardDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  squadCardStatsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  squadCardStatCol: {
    alignItems: 'center',
  },
  squadCardStatVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  squadCardStatLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  squadCardStatDivider: {
    width: 1,
    height: 20,
  },
  squadMembersContainer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  squadTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  squadTypeTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  /* ── Squad Modal Form & Options ── */
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  typeOptionContainer: {
    gap: 8,
    marginBottom: 4,
  },
  typeOptionCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  typeOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeOptionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  typeOptionDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },

  /* ── Quests Styles ── */
  questCard: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  questTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  questIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questCategoryPill: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  questDaysLeft: {
    fontSize: 11,
    fontWeight: '600',
  },
  questTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: 2,
  },
  questDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  questProgressSection: {
    marginTop: 14,
  },
  questProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  questProgressValues: {
    fontSize: 11,
    fontWeight: '700',
  },
  questProgressPercent: {
    fontSize: 12,
    fontWeight: '800',
  },
  questProgressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  questProgressBar: {
    height: '100%',
    borderRadius: 3,
  },
  questFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.1)',
  },
  questRewardText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  questActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  questActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
