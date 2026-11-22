import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { DeviceEventEmitter } from 'react-native';
import { repServerUrl, getRepAuthToken } from './repTrackerProtocol';
import { loadRecordedWalks, WalkRecord } from './walkStorage';
import { DEFAULT_GOAL_TARGETS, GoalTargets, GoalProgress, WalkGoalGain, personalGoalProgress, walkingStepsInWindow, walkGoalGains } from './communityGoalProgress';
export const COMMUNITY_GOALS_CHANGED = 'footprint:community-goals-changed';
export type SquadGoal = {
  code: string; title: string; goalSteps: number; totalSteps: number; startsAt: string; endsAt: string;
  status: 'active' | 'completed' | 'closed'; joinedAt: string; left: boolean; isOwner: boolean; you: string;
  members: { id: string; name: string; steps: number; left: boolean }[];
};
const targetKey = (id: string) => `@footprint_goal_targets_${id}`;
const squadKey = (id: string) => `@footprint_squad_goal_${id}`;
const accessKey = (id: string) => `squad_goal_${Array.from(id).map(c => c.charCodeAt(0).toString(16)).join('')}`;
const valid = (value: number) => Number.isInteger(value) && value >= 100 && value <= 1000000;
export async function loadGoalTargets(id: string): Promise<GoalTargets> {
  const raw = await AsyncStorage.getItem(targetKey(id)); const saved = raw ? JSON.parse(raw) : {};
  return { daily: valid(saved.daily) ? saved.daily : DEFAULT_GOAL_TARGETS.daily, weekly: valid(saved.weekly) ? saved.weekly : DEFAULT_GOAL_TARGETS.weekly };
}
export async function saveGoalTargets(id: string, targets: GoalTargets) {
  if (!valid(targets.daily) || !valid(targets.weekly)) throw new Error('Enter whole step targets from 100 to 1,000,000.');
  await AsyncStorage.setItem(targetKey(id), JSON.stringify(targets)); DeviceEventEmitter.emit(COMMUNITY_GOALS_CHANGED, { userId: id });
}
export async function cachedSquadGoal(id: string): Promise<SquadGoal | null> {
  const raw = await AsyncStorage.getItem(squadKey(id)); return raw ? JSON.parse(raw) : null;
}
async function identity(id: string) {
  let key = await SecureStore.getItemAsync(accessKey(id));
  if (!key) { key = randomUUID() + randomUUID(); await SecureStore.setItemAsync(accessKey(id), key); }
  return key;
}
async function request(data: object): Promise<any> {
  const token = process.env.EXPO_PUBLIC_REP_TOKEN || (await getRepAuthToken());
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token && token !== 'local-dev-proxy') headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${repServerUrl()}/goals`, { method: 'POST', signal: controller.signal,
      headers, body: JSON.stringify(data) });
    const result = await response.json();
    if (response.status === 404) throw new Error('Shared squad goals are not available on the connected server yet. Your personal goals still work.');
    if (!response.ok) throw new Error(result.detail || 'Squad goal could not sync.');
    return result;
  } finally { clearTimeout(timer); }
}
const queues = new Map<string, Promise<unknown>>();
function ordered<T>(id: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(id) || Promise.resolve()).catch(() => {}).then(action); queues.set(id, next); return next;
}
async function remember(id: string, goal: SquadGoal) {
  await AsyncStorage.setItem(squadKey(id), JSON.stringify(goal));
  DeviceEventEmitter.emit(COMMUNITY_GOALS_CHANGED, { userId: id }); return goal;
}
async function canJoin(id: string) {
  const goal = await cachedSquadGoal(id);
  if (goal && goal.status === 'active' && !goal.left && Date.parse(goal.endsAt) > Date.now()) throw new Error('Finish or leave your current squad goal first.');
}
export function createSquadGoal(id: string, name: string, title: string, target: number): Promise<SquadGoal> {
  return ordered(id, async () => {
    if (!valid(target)) throw new Error('Enter a shared step target from 100 to 1,000,000.');
    await canJoin(id);
    return remember(id, await request({ action: 'create', walkerKey: await identity(id), name, title, target }));
  });
}
export function previewSquadGoal(code: string): Promise<{ title: string; goalSteps: number; memberCount: number; endsAt: string }> {
  return request({ action: 'preview', code: code.trim().toUpperCase() });
}
export function joinSquadGoal(id: string, name: string, code: string): Promise<SquadGoal> {
  return ordered(id, async () => { await canJoin(id); return remember(id, await request({ action: 'join', walkerKey: await identity(id), name, code: code.trim().toUpperCase() })); });
}
export function syncSquadGoal(id: string, action?: 'leave' | 'close'): Promise<SquadGoal | null> {
  return ordered(id, async () => {
    const cached = await cachedSquadGoal(id); if (!cached) return null;
    const walkerKey = await identity(id);
    const current: SquadGoal = await request({ action: 'get', walkerKey, code: cached.code });
    if (current.status !== 'active' || current.left) return remember(id, current);
    const walks = await loadRecordedWalks(id);
    const steps = walkingStepsInWindow(walks, id, Math.max(Date.parse(current.startsAt), Date.parse(current.joinedAt)), Date.parse(current.endsAt));
    return remember(id, await request({ action: action || 'sync', walkerKey, code: cached.code, steps }));
  });
}
export function squadProgress(goal: SquadGoal): GoalProgress {
  return { id: goal.code, category: 'squad', title: goal.title, current: goal.totalSteps, target: goal.goalSteps, endsAt: goal.endsAt, color: '#3b82f6' };
}
export async function loadCommunityGoals(id: string) {
  const [walks, targets, squad] = await Promise.all([loadRecordedWalks(id), loadGoalTargets(id), cachedSquadGoal(id)]);
  return { goals: personalGoalProgress(walks, id, targets), targets, squad };
}
export async function progressFromSavedWalk(id: string, walk: WalkRecord, onPersonal?: (gains: WalkGoalGain[]) => void): Promise<{ gains: WalkGoalGain[]; syncError?: string }> {
  const [walks, targets, cached] = await Promise.all([loadRecordedWalks(id), loadGoalTargets(id), cachedSquadGoal(id)]);
  const gains = walkGoalGains(walks, walk, targets);
  onPersonal?.([...gains]);
  if (!cached || cached.status !== 'active' || cached.left) return { gains };
  const since = Math.max(Date.parse(cached.startsAt), Date.parse(cached.joinedAt));
  const added = walkingStepsInWindow([walk], id, since, Date.parse(cached.endsAt));
  if (!added) return { gains };
  try {
    const current = await syncSquadGoal(id);
    if (current && current.code === cached.code) {
      // Compare this member's absolute contribution; teammate updates are not attributed to this walk.
      const mine = current.members.find(member => member.id === current.you)?.steps || 0;
      const without = walkingStepsInWindow(walks.filter(item => item.id !== walk.id), id, since, Date.parse(cached.endsAt));
      const counted = Math.min(added, Math.max(0, mine - without));
      const before = Math.max(0, current.totalSteps - counted);
      if (counted) gains.push({ ...squadProgress(current), before, added: counted, completedNow: before < current.goalSteps && current.totalSteps >= current.goalSteps });
    }
    return { gains };
  } catch {
    gains.push({ ...squadProgress(cached), before: cached.totalSteps, added, completedNow: false, pending: true });
    return { gains, syncError: 'Walk saved. Squad contribution will sync when you reconnect.' };
  }
}
