import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { DeviceEventEmitter } from 'react-native';
import { repServerUrl } from './repTrackerProtocol';
import { loadMealLogs } from './nutritionStorage';

export const CALORIE_CHALLENGES_CHANGED = 'footprint:calorie-challenges-changed';
export type CalorieChallenge = {
  code: string; mode: 'cut' | 'bulk'; target: number; days: number; timezone: string;
  start: string | null; end: string | null; status: 'waiting' | 'active' | 'finished' | 'cancelled';
  today: string; you: number; winner: number | null;
  players: { name: string; score: number; calories: number; complete: boolean }[];
};
type Membership = { code: string; key: string; challenge: CalorieChallenge };
const storageKey = (id: string) => `@footprint_calorie_challenges_${id}`;
// Per-account capability keys stay in secure device storage; never in invite messages.
const secretKey = (id: string) => `calorie_challenges_${Array.from(id).map(c => c.charCodeAt(0).toString(16)).join('')}`;
async function credentials(id: string): Promise<Record<string, string>> {
  return JSON.parse(await SecureStore.getItemAsync(secretKey(id)) || '{}');
}
export async function cachedChallenges(id: string): Promise<CalorieChallenge[]> {
  return JSON.parse(await AsyncStorage.getItem(storageKey(id)) || '[]');
}
async function request(action: string, data: object) {
  const token = process.env.EXPO_PUBLIC_REP_TOKEN;
  if (!token) throw new Error('Start npm run start:reps:tunnel to connect calorie challenges.');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${repServerUrl()}/calories`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...data }), signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Challenge could not be updated.');
    return result;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Connection timed out. Your food logs are saved; retry to sync.');
    throw e;
  } finally { clearTimeout(timeout); }
}
async function remember(id: string, result: Membership) {
  const keys = await credentials(id); keys[result.challenge.code] = result.key;
  await SecureStore.setItemAsync(secretKey(id), JSON.stringify(keys));
  const cached = await cachedChallenges(id);
  await AsyncStorage.setItem(storageKey(id), JSON.stringify([result.challenge, ...cached.filter(c => c.code !== result.challenge.code)].slice(0, 20)));
  DeviceEventEmitter.emit(CALORIE_CHALLENGES_CHANGED);
  return result.challenge;
}
async function createUnlocked(id: string, name: string, mode: 'cut' | 'bulk', target: number, days: number) {
  return remember(id, await request('create', { name, mode, target, days, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }));
}
async function joinUnlocked(id: string, name: string, code: string) {
  const keys = await credentials(id);
  if (keys[code.trim().toUpperCase()]) throw new Error('You already joined this challenge on this account.');
  return remember(id, await request('join', { name, code: code.trim().toUpperCase() }));
}
export function challengeTotals(meals: { id: string; dateKey: string; calories: number }[], challenge: CalorieChallenge) {
  const totals: Record<string, number> = {}; const seen = new Set<string>();
  if (!challenge.start || !challenge.end) return totals;
  for (const meal of meals) {
    if (seen.has(meal.id) || meal.dateKey < challenge.start || meal.dateKey > challenge.end || meal.dateKey > challenge.today) continue;
    if (!Number.isFinite(meal.calories) || meal.calories < 0) continue;
    seen.add(meal.id); totals[meal.dateKey] = (totals[meal.dateKey] || 0) + meal.calories;
  }
  return totals;
}
async function syncUnlocked(id: string, action?: { code: string; complete?: boolean; cancel?: boolean }) {
  const keys = await credentials(id); const cached = await cachedChallenges(id); const meals = await loadMealLogs();
  const updated: CalorieChallenge[] = [];
  // Sequential requests keep server writes and local cache ordered.
  for (const challenge of cached) {
    if (!keys[challenge.code]) continue;
    if (challenge.status === 'finished' || challenge.status === 'cancelled') { updated.push(challenge); continue; }
    // Fetch first: an invite may have become active since the last refresh.
    const current: CalorieChallenge = await request('get', { code: challenge.code, key: keys[challenge.code] });
    updated.push(await request('update', { code: challenge.code, key: keys[challenge.code],
      totals: challengeTotals(meals, current), ...(action?.code === challenge.code ? action : {}) }));
  }
  await AsyncStorage.setItem(storageKey(id), JSON.stringify(updated));
  return updated;
}

export async function previewCalorieChallenge(code: string): Promise<Pick<CalorieChallenge, 'mode' | 'target' | 'days' | 'timezone'>> {
  return request('preview', { code: code.trim().toUpperCase() });
}

// Both mounted screens and meal-edit listeners share this queue, preventing
// a stale poll from overwriting a newly created membership or completed day.
const accountQueues = new Map<string, Promise<unknown>>();
function ordered<T>(id: string, action: () => Promise<T>): Promise<T> {
  const next = (accountQueues.get(id) || Promise.resolve()).catch(() => {}).then(action);
  accountQueues.set(id, next);
  return next;
}
export function createCalorieChallenge(id: string, name: string, mode: 'cut' | 'bulk', target: number, days: number) {
  return ordered(id, () => createUnlocked(id, name, mode, target, days));
}
export function joinCalorieChallenge(id: string, name: string, code: string) {
  return ordered(id, () => joinUnlocked(id, name, code));
}
export function syncCalorieChallenges(id: string, action?: { code: string; complete?: boolean; cancel?: boolean }) {
  return ordered(id, () => syncUnlocked(id, action));
}
