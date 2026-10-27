import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WalkRecord {
  id: string;
  userId: string;
  date: string;           // ISO string
  label: string;          // e.g. "Morning Walk"
  activityType?: 'walk' | 'run' | 'cycle';
  durationSeconds: number;
  distanceMeters: number;
  calories: number;
  steps: number;
  avgPace: string;        // e.g. "12'07\""
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
}

const WALK_STORAGE_KEY = (userId: string) => `@footprint_walks_${userId}`;

export async function saveWalk(userId: string, walk: Omit<WalkRecord, 'id' | 'userId' | 'date' | 'label'> & { label?: string; activityType?: 'walk' | 'run' | 'cycle' }): Promise<WalkRecord> {
  const now = new Date();
  const hour = now.getHours();
  const typeWord = walk.activityType === 'cycle' ? 'Ride' : walk.activityType === 'run' ? 'Run' : 'Walk';
  const timeOfDay =
    hour < 11 ? 'Morning' :
    hour < 14 ? 'Midday' :
    hour < 18 ? 'Afternoon' :
    hour < 21 ? 'Evening' : 'Night';
  const defaultLabel = `${timeOfDay} ${typeWord}`;

  const record: WalkRecord = {
    id: `walk_${Date.now()}`,
    userId,
    date: now.toISOString(),
    label: walk.label || defaultLabel,
    activityType: walk.activityType || 'walk',
    ...walk,
  };

  try {
    const key = WALK_STORAGE_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    const existing: WalkRecord[] = raw ? JSON.parse(raw) : [];
    const updated = [record, ...existing];
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save walk', e);
  }

  return record;
}

export async function loadWalks(userId: string): Promise<WalkRecord[]> {
  try {
    const key = WALK_STORAGE_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed: WalkRecord[] = JSON.parse(raw);
      if (parsed.length > 0) {
        return parsed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
    }

    // If no walks exist yet, generate rich mock activities across walk, run, and cycle
    const now = Date.now();
    const demoWalks: WalkRecord[] = [
      {
        id: `walk_demo_1`,
        userId,
        date: new Date(now - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
        label: 'Afternoon Tempo Run',
        activityType: 'run',
        durationSeconds: 1980, // 33m
        distanceMeters: 5400, // 5.4 km
        calories: 432,
        steps: 5890,
        avgPace: "6'06\"",
        routeCoordinates: [
          { latitude: 37.7749, longitude: -122.4194 },
          { latitude: 37.7761, longitude: -122.4178 },
          { latitude: 37.7779, longitude: -122.4155 },
          { latitude: 37.7792, longitude: -122.4132 },
          { latitude: 37.7810, longitude: -122.4111 },
          { latitude: 37.7825, longitude: -122.4095 },
        ],
      },
      {
        id: `walk_demo_2`,
        userId,
        date: new Date(now - 1000 * 60 * 60 * 26).toISOString(), // Yesterday
        label: 'Golden Gate Cycle',
        activityType: 'cycle',
        durationSeconds: 3240, // 54m
        distanceMeters: 18200, // 18.2 km
        calories: 615,
        steps: 820,
        avgPace: "2'57\"",
        routeCoordinates: [
          { latitude: 37.8024, longitude: -122.4367 },
          { latitude: 37.8085, longitude: -122.4552 },
          { latitude: 37.8182, longitude: -122.4782 },
          { latitude: 37.8285, longitude: -122.4795 },
        ],
      },
      {
        id: `walk_demo_3`,
        userId,
        date: new Date(now - 1000 * 60 * 60 * 52).toISOString(), // 2 days ago
        label: 'Morning Power Walk',
        activityType: 'walk',
        durationSeconds: 2700, // 45m
        distanceMeters: 4100, // 4.1 km
        calories: 278,
        steps: 5210,
        avgPace: "10'58\"",
        routeCoordinates: [
          { latitude: 37.7689, longitude: -122.4467 },
          { latitude: 37.7712, longitude: -122.4491 },
          { latitude: 37.7735, longitude: -122.4518 },
        ],
      },
      {
        id: `walk_demo_4`,
        userId,
        date: new Date(now - 1000 * 60 * 60 * 98).toISOString(), // 4 days ago
        label: 'Evening City Walk',
        activityType: 'walk',
        durationSeconds: 1680, // 28m
        distanceMeters: 2350, // 2.35 km
        calories: 162,
        steps: 3120,
        avgPace: "11'54\"",
        routeCoordinates: [
          { latitude: 37.7850, longitude: -122.4060 },
          { latitude: 37.7875, longitude: -122.4085 },
        ],
      },
      {
        id: `walk_demo_5`,
        userId,
        date: new Date(now - 1000 * 60 * 60 * 148).toISOString(), // 6 days ago
        label: 'Interval Track Run',
        activityType: 'run',
        durationSeconds: 2520, // 42m
        distanceMeters: 7800, // 7.8 km
        calories: 624,
        steps: 8400,
        avgPace: "5'23\"",
        routeCoordinates: [
          { latitude: 37.7650, longitude: -122.4320 },
          { latitude: 37.7670, longitude: -122.4340 },
          { latitude: 37.7695, longitude: -122.4370 },
        ],
      },
    ];

    await AsyncStorage.setItem(key, JSON.stringify(demoWalks));
    return demoWalks;
  } catch (e) {
    console.error('Failed to load walks', e);
  }
  return [];
}

export async function deleteWalk(userId: string, walkId: string): Promise<void> {
  try {
    const key = WALK_STORAGE_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const walks: WalkRecord[] = JSON.parse(raw);
      const updated = walks.filter((w) => w.id !== walkId);
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    }
  } catch (e) {
    console.error('Failed to delete walk', e);
  }
}

export function formatWalkDate(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) return `Today, ${timeStr}`;
  if (diffDays === 1) return `Yesterday, ${timeStr}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
}
