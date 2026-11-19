import { cleanAccountRecords } from './accountRecords';
import { DeviceEventEmitter } from 'react-native';
export const WALKS_CHANGED = 'footprint:walks-changed';
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
    id: `walk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
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
    DeviceEventEmitter.emit(WALKS_CHANGED, { userId });
  } catch (e) {
    console.error('Failed to save walk', e);
    throw e;
  }

  return record;
}

export async function loadWalks(userId: string): Promise<WalkRecord[]> {
  const raw = await AsyncStorage.getItem(WALK_STORAGE_KEY(userId));
  const records: WalkRecord[] = raw ? JSON.parse(raw) : [];
  return cleanAccountRecords(userId, 'walks', records)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function deleteWalk(userId: string, walkId: string): Promise<void> {
  try {
    const key = WALK_STORAGE_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const walks: WalkRecord[] = JSON.parse(raw);
      const updated = walks.filter((w) => w.id !== walkId);
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    DeviceEventEmitter.emit(WALKS_CHANGED, { userId });
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


/** Raw persisted records for real collaborative goals; never seeds demo walks. */
export async function loadRecordedWalks(userId: string): Promise<WalkRecord[]> {
  const raw = await AsyncStorage.getItem(WALK_STORAGE_KEY(userId));
  if (!raw) return [];
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) throw new Error('Saved walk history could not be read.');
  return records;
}
