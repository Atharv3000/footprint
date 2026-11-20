import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_REST_SECONDS = 60;
export const MAX_REST_SECONDS = 600;
export const REST_PRESETS = [0, 30, 60, 90, 120, 180] as const;
const key = (userId: string) => `@footprint_workout_rest_v1:${encodeURIComponent(userId)}`;

export function normalizeRestSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_REST_SECONDS;
  return Math.max(0, Math.min(MAX_REST_SECONDS, Math.round(value / 15) * 15));
}

export function formatRestInterval(value: number): string {
  const seconds = normalizeRestSeconds(value);
  return seconds === 0 ? 'Off' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export async function loadRestInterval(userId: string): Promise<number> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (raw === null) return DEFAULT_REST_SECONDS;
  try { return normalizeRestSeconds(JSON.parse(raw)); } catch { return DEFAULT_REST_SECONDS; }
}

// Preserve tap order, even if storage takes longer than another adjustment.
let writes: Promise<void> = Promise.resolve();
export function saveRestInterval(userId: string, seconds: number): Promise<void> {
  const value = normalizeRestSeconds(seconds);
  const write = writes.catch(() => {}).then(() => AsyncStorage.setItem(key(userId), JSON.stringify(value)));
  writes = write;
  return write;
}
