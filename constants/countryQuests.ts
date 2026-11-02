import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { DeviceEventEmitter } from 'react-native';
import { repServerUrl } from './repTrackerProtocol';
import { loadRecordedWalks, WalkRecord } from './walkStorage';
import catalog from '@/assets/data/countryBorders.json';

export type BorderRing = { points: number[][]; lengths: number[] };
export type BorderCountry = { id: string; name: string; totalKm: number; rings: BorderRing[] };
export const BORDER_COUNTRIES: BorderCountry[] = catalog.countries;
export const COUNTRY_QUESTS_CHANGED = 'footprint:country-quests-changed';
export type CountryQuest = {
  code: string; countryId: string; title: string; goalSteps: number; totalSteps: number;
  status: 'active' | 'completed' | 'closed'; you: string; isOwner: boolean; joinedAt: string; left: boolean;
  members: { id: string; name: string; steps: number; joinedAt: string; left: boolean }[];
};
export type CountryInvite = Pick<CountryQuest, 'title' | 'countryId' | 'goalSteps'> & { memberCount: number };
const cacheKey = (id: string) => `@footprint_country_quests_${id}`;
const secureKey = (id: string) => `border_walker_${Array.from(id).map(c => c.charCodeAt(0).toString(16)).join('')}`;
export async function cachedCountryQuests(id: string): Promise<CountryQuest[]> {
  return JSON.parse(await AsyncStorage.getItem(cacheKey(id)) || '[]');
}
async function walkerKey(id: string) {
  let key = await SecureStore.getItemAsync(secureKey(id));
  if (!key) { key = randomUUID() + randomUUID(); await SecureStore.setItemAsync(secureKey(id), key); }
  return key;
}
async function request(action: string, data: object): Promise<any> {
  const token = process.env.EXPO_PUBLIC_REP_TOKEN;
  if (!token) throw new Error('Start npm run start:reps:tunnel to connect country quests.');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${repServerUrl()}/countries`, { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...data }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Could not update this quest.');
    return result;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Connection timed out. Your walks are saved; retry to sync.');
    throw e;
  } finally { clearTimeout(timeout); }
}
export function eligibleWalkingSteps(walks: WalkRecord[], userId: string, joinedAt: string, now = Date.now()): number {
  const since = Date.parse(joinedAt); if (!Number.isFinite(since)) return 0;
  const seen = new Set<string>(); let steps = 0;
  for (const walk of walks) {
    if (!walk || typeof walk !== 'object') continue;
    const time = Date.parse(walk.date);
    if (!walk.id || /demo/i.test(walk.id) || seen.has(walk.id) || walk.userId !== userId) continue;
    if (walk.activityType && walk.activityType !== 'walk' && walk.activityType !== 'run') continue;
    if (!Number.isFinite(time) || time < since || time > now + 300000) continue;
    if (!Number.isInteger(walk.steps) || walk.steps < 0 || !Number.isFinite(walk.durationSeconds) || walk.durationSeconds <= 0) continue;
    seen.add(walk.id); steps += walk.steps;
  }
  return steps;
}
const queues = new Map<string, Promise<unknown>>();
function ordered<T>(id: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(id) || Promise.resolve()).catch(() => {}).then(action); queues.set(id, next); return next;
}
async function remember(id: string, quest: CountryQuest) {
  const existing = await cachedCountryQuests(id);
  await AsyncStorage.setItem(cacheKey(id), JSON.stringify([quest, ...existing.filter(q => q.code !== quest.code)]));
  DeviceEventEmitter.emit(COUNTRY_QUESTS_CHANGED); return quest;
}
async function checkLimit(id: string) {
  if ((await cachedCountryQuests(id)).filter(q => q.status === 'active' && !q.left).length >= 5)
    throw new Error('You can contribute to five country quests at once. Finish or leave one first.');
}
export function createCountryQuest(id: string, name: string, countryId: string, title: string): Promise<CountryQuest> {
  return ordered(id, async () => { await checkLimit(id); return remember(id, await request('create', { name, countryId, title, walkerKey: await walkerKey(id) })); });
}
export function joinCountryQuest(id: string, name: string, code: string): Promise<CountryQuest> {
  return ordered(id, async () => { await checkLimit(id); return remember(id, await request('join', { name, code: code.trim().toUpperCase(), walkerKey: await walkerKey(id) })); });
}
export async function previewCountryQuest(code: string): Promise<CountryInvite> { return request('preview', { code: code.trim().toUpperCase() }); }
export function syncCountryQuests(id: string, action?: { code: string; action: 'leave' | 'close' }): Promise<CountryQuest[]> {
  return ordered(id, async () => {
    const existing = await cachedCountryQuests(id); const updated: CountryQuest[] = [];
    if (!existing.some(q => q.status === 'active')) return existing;
    const key = await walkerKey(id); const walks = await loadRecordedWalks(id);
    for (const quest of existing) {
      if (quest.status !== 'active') { updated.push(quest); continue; }
      if (action?.code === quest.code) {
        updated.push(await request(action.action, { code: quest.code, walkerKey: key }));
      } else if (quest.left) {
        updated.push(await request('get', { code: quest.code, walkerKey: key }));
      } else {
        updated.push(await request('sync', { code: quest.code, walkerKey: key, steps: eligibleWalkingSteps(walks, id, quest.joinedAt) }));
      }
    }
    await AsyncStorage.setItem(cacheKey(id), JSON.stringify(updated)); return updated;
  });
}

/** Draw the travelled fraction by geodesic edge lengths, never by screen-space length.
 * Disconnected islands start separate paths; no fictitious sea crossings add distance.
 */
export function borderProgress(country: BorderCountry, steps: number) {
  let remaining = Number.isFinite(steps) ? Math.max(0, Math.min(country.totalKm, steps / 1310)) : 0;
  const paths: string[] = []; let marker = country.rings[0]?.points[0] || [500, 350];
  let stopped = false;
  for (const ring of country.rings) {
    if (stopped) break;
    let path = `M ${ring.points[0].join(' ')}`;
    for (let i = 0; i < ring.lengths.length; i++) {
      const a = ring.points[i], b = ring.points[i+1], distance = ring.lengths[i];
      const fraction = distance > 0 ? Math.min(1, remaining / distance) : 1;
      const point = [a[0]+(b[0]-a[0])*fraction, a[1]+(b[1]-a[1])*fraction];
      path += ` L ${point.map(v => v.toFixed(2)).join(' ')}`; marker = point;
      remaining = Math.max(0, remaining-distance);
      if (fraction < 1 || remaining <= .00001) { stopped = true; break; }
    }
    paths.push(path);
  }
  return { paths, marker };
}
