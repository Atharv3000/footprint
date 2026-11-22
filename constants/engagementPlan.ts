import type { DietGoal, MealLog } from './nutritionStorage';
import type { WorkoutLogEntry } from './workoutStorage';
import type { WalkRecord } from './walkStorage';

export type ReminderKind = 'meal' | 'workout' | 'streak' | 'comeback';
export type ReminderSettings = {
  enabled: boolean; tone: 'gentle' | 'playful'; meal: boolean; workout: boolean;
  streak: boolean; comeback: boolean; dailyLimit: 1 | 2;
  quietStart: number; quietEnd: number; pausedUntil: number;
};
export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false, tone: 'playful', meal: true, workout: true, streak: true,
  comeback: true, dailyLimit: 2, quietStart: 21, quietEnd: 9, pausedUntil: 0,
};
export type ReminderSlot = { key: string; kind: ReminderKind; at: number; title: string; body: string; route: 'nutrition' | 'log' | 'index'; pet: boolean };
export type ReminderHistory = Pick<ReminderSlot, 'key' | 'at'>;
export type EngagementSnapshot = {
  meals: readonly MealLog[]; workouts: readonly WorkoutLogEntry[]; walks: readonly WalkRecord[];
  routineCount: number; target: number; goal: DietGoal; petName: string; lastOpened: number | null;
};
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function normalizeReminderSettings(input: unknown): ReminderSettings {
  const raw = input && typeof input === 'object' ? input as Partial<ReminderSettings> : {};
  const result = { ...DEFAULT_REMINDERS };
  for (const key of ['enabled','meal','workout','streak','comeback'] as const) if (typeof raw[key] === 'boolean') result[key] = raw[key]!;
  result.tone = raw.tone === 'gentle' ? 'gentle' : 'playful'; result.dailyLimit = raw.dailyLimit === 1 ? 1 : 2;
  for (const key of ['quietStart','quietEnd'] as const) if (typeof raw[key] === 'number' && Number.isInteger(raw[key]) && raw[key]! >= 0 && raw[key]! <= 23) result[key] = raw[key]!;
  if (result.quietStart === result.quietEnd) { result.quietStart = 21; result.quietEnd = 9; }
  result.pausedUntil = typeof raw.pausedUntil === 'number' && Number.isFinite(raw.pausedUntil) ? Math.max(0, raw.pausedUntil) : 0;
  return result;
}
export function inQuietHours(date: Date, settings: ReminderSettings): boolean {
  const h = date.getHours();
  return settings.quietStart > settings.quietEnd ? h >= settings.quietStart || h < settings.quietEnd : h >= settings.quietStart && h < settings.quietEnd;
}
const validTime = (n: number, now: number) => Number.isFinite(n) && n > 0 && n <= now;
const validDateKey = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key) && localDay(new Date(`${key}T12:00:00`)) === key;
function priorDay(key: string) { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate()-1); return localDay(d); }
function hash(value: string) { let n=0; for (const c of value) n=(n*31+c.charCodeAt(0))>>>0; return n; }

/** Seven days, at most two reminders per day, no repeats within three hours.
 * Future copy is deliberately conditional: closed apps cannot know what happened
 * after their last snapshot. Saving data while open replaces that pending plan.
 */
export function buildEngagementPlan(snapshot: EngagementSnapshot, settings: ReminderSettings, now: Date, history: readonly ReminderHistory[] = []): ReminderSlot[] {
  if (!settings.enabled || !Number.isFinite(now.getTime())) return [];
  const time = now.getTime(), today = localDay(now), days = new Set<string>();
  const meals = snapshot.meals.filter(m => m && typeof m.id === 'string' && m.id && !m.id.startsWith('demo_') && Number.isFinite(m.calories) && m.calories > 0 && validDateKey(m.dateKey) && m.dateKey <= today && !(Number.isFinite(m.timestamp)&&m.timestamp>time));
  for (const m of meals) days.add(m.dateKey);
  const workouts = snapshot.workouts.filter(w => w && typeof w.id === 'string' && !w.id.startsWith('demo_') && Number.isFinite(w.reps) && w.reps > 0 && validTime(Date.parse(w.date),time));
  const walks = snapshot.walks.filter(w => w && typeof w.id === 'string' && !w.id.startsWith('demo_') && w.durationSeconds > 0 && validTime(Date.parse(w.date),time));
  for (const w of [...workouts,...walks]) days.add(localDay(new Date(w.date)));
  let streak = 0, cursor = priorDay(today);
  while (days.has(cursor)) { streak++; cursor=priorDay(cursor); }
  const todayMeals = meals.filter(m=>m.dateKey===today), calories = [...new Map(todayMeals.map(m=>[m.id,m])).values()].reduce((n,m)=>n+m.calories,0);
  const lastMeal = Math.max(0,...todayMeals.map(m=>validTime(m.timestamp,time)?m.timestamp:0));
  const dietBehind = snapshot.target > 0 && calories/snapshot.target < .85;
  const mealHour=Math.min(19,Math.max(13,now.getHours()+1));
  const nextMealCheck=new Date(now);nextMealCheck.setHours(mealHour,0,0,0);
  const longGap = lastMeal === 0 ? todayMeals.length === 0 : nextMealCheck.getTime()-lastMeal >= 4*3600000;
  const workoutToday = workouts.some(w=>localDay(new Date(w.date))===today);
  const latestActivity = Math.max(0,...[...workouts,...walks].map(w=>Date.parse(w.date)),...meals.map(m=>new Date(`${m.dateKey}T12:00:00`).getTime()));
  const away = snapshot.lastOpened && validTime(snapshot.lastOpened,time) ? Math.floor((time-snapshot.lastOpened)/86400000) : 0;
  const name = snapshot.petName.trim().slice(0,18) || 'Pip';
  const plan = snapshot.goal==='bulk'?'bulk':snapshot.goal==='cut'?'cut':'daily';
  const candidates: (ReminderSlot & {priority:number})[] = [];
  function add(day:Date, kind:ReminderKind, hour:number, minute:number, priority:number, lines:readonly [string,string][], route:ReminderSlot['route'], pet=false) {
    const date = new Date(day); date.setHours(hour,minute,0,0);
    // Do not postpone a midday message to nighttime or produce catch-up bursts.
    if (date.getTime() <= time+60000 || date.getTime() < settings.pausedUntil || inQuietHours(date,settings)) return;
    const key=`${localDay(date)}:${kind}`, [title,body]=lines[hash(key+settings.tone)%lines.length];
    candidates.push({key,kind,at:date.getTime(),title,body,route,pet,priority});
  }
  for (let offset=0;offset<7;offset++) {
    const day=new Date(now);day.setDate(day.getDate()+offset); const current=offset===0;
    if (settings.meal && snapshot.target>0 && (!current || (dietBehind && longGap))) {
      const lines: [string,string][] = settings.tone==='playful' ? [
        [`${name} has entered the chat`, `Any meals missing from your ${plan} diary? My tiny paws are ready for a check-in.`],
        ['Your pocket companion is checking in', `If you've eaten, give your diary a quick update. ${name} will bring the happy paws.`],
        ['Plot twist: the diary needs a sidekick', `A real meal to log? ${name} is here for it. Head rubs also accepted.`],
      ] : [['A little diary check-in',`Have any meals gone unlogged? ${name} is here when you want to update your diary.`]];
      add(day,'meal',current?mealHour:13,0,70,lines,'nutrition',true);
    }
    // A saved routine is evidence of workout intent. Never demand consecutive training days.
    const recentTraining = workouts.some(w=>time-Date.parse(w.date)<36*3600000);
    if (settings.workout && snapshot.routineCount>0 && (!current || (!workoutToday && !recentTraining)) && offset%2===0) {
      add(day,'workout',18,0,60,settings.tone==='playful' ? [
        ['Your workout day saved you a seat', 'Training today? Your routine is ready. Rest days count as a plan, too.'],
        ['Pip brought the imaginary dumbbells', 'If a workout fits today, your saved exercises are one tap away.'],
        ['The gym arc continues?', 'Your next session is ready whenever you are. A rest day is a valid plot twist.'],
      ] : [['Your routine is ready','If training is on your plan today, open your saved workout to get started.']],'log');
    }
    if (current && settings.streak && streak>0 && !days.has(today)) {
      add(day,'streak',20,0,100,settings.tone==='playful' ? [
        [`${streak}-day check-in streak: encore?`, 'A real meal log, completed set, or recorded walk keeps your check-in rhythm going. No pressure to train.'],
        ['One small check-in?', `You've checked in for ${streak} days in a row. If there's something real to log today, your diary is ready.`],
      ] : [[`Your ${streak}-day check-in rhythm`,'If you have a meal or activity to record, a quick check-in will keep your logging streak going.']],'nutrition');
    }
    if (settings.comeback && ((current && away>=3 && latestActivity<time-3*86400000) || offset===3 || offset===6)) {
      add(day,'comeback',18,0,offset===3||offset===6?90:95,settings.tone==='playful' ? [
        ['Tiny paws. Open invitation.', `${name} saved you a spot. If you feel like checking in, we're right here.`],
        ['The comeback episode is always available', 'No catching up required. Open your diary, pick a routine, or just say hi.'],
        [`${name}'s door is open`, 'A small restart is still a restart. Come back whenever it suits you.'],
      ] : [['A fresh start is here','Your diary and saved routines are ready whenever you want to return.']],'nutrition',true);
    }
  }
  const accepted: ReminderSlot[] = [], used = new Map<string,number[]>();
  const seen = new Set<string>();
  for(const entry of history) if (entry && Number.isFinite(entry.at) && entry.at<=time && !seen.has(entry.key)) {
    seen.add(entry.key); const day=localDay(new Date(entry.at)); used.set(day,[...(used.get(day)||[]),entry.at]);
  }
  candidates.sort((a,b)=>b.priority-a.priority || a.at-b.at);
  for(const candidate of candidates) {
    const day=localDay(new Date(candidate.at)), times=used.get(day)||[];
    if(seen.has(candidate.key)||times.length>=settings.dailyLimit||times.some(t=>Math.abs(t-candidate.at)<3*3600000))continue;
    seen.add(candidate.key);used.set(day,[...times,candidate.at]); const {priority,...slot}=candidate;accepted.push(slot);
  }
  return accepted.sort((a,b)=>a.at-b.at);
}
