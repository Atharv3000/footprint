import type { WalkRecord } from './walkStorage';
export type GoalTargets = { daily: number; weekly: number };
export const DEFAULT_GOAL_TARGETS: GoalTargets = { daily: 4000, weekly: 15000 };
export type GoalProgress = {
  id: string; category: 'daily' | 'weekly' | 'squad'; title: string;
  current: number; target: number; endsAt: string; color: string;
};
export type WalkGoalGain = GoalProgress & { added: number; before: number; completedNow: boolean; pending?: boolean };
export function goalWindows(now = new Date()) {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const nextDay = new Date(day); nextDay.setDate(day.getDate() + 1);
  const week = new Date(day); week.setDate(day.getDate() - (day.getDay() + 6) % 7);
  const nextWeek = new Date(week); nextWeek.setDate(week.getDate() + 7);
  return { day, nextDay, week, nextWeek };
}
export function walkingStepsInWindow(walks: readonly WalkRecord[], userId: string, start: number, end: number, now = Date.now()): number {
  const seen = new Set<string>(); let steps = 0;
  for (const walk of walks) {
    const time = Date.parse(walk?.date);
    if (!walk?.id || /demo/i.test(walk.id) || seen.has(walk.id) || walk.userId !== userId) continue;
    if (walk.activityType && walk.activityType !== 'walk' && walk.activityType !== 'run') continue;
    if (!Number.isFinite(time) || time < start || time >= end || time > now) continue;
    if (!Number.isInteger(walk.steps) || walk.steps < 0 || !Number.isFinite(walk.durationSeconds) || walk.durationSeconds <= 0) continue;
    seen.add(walk.id); steps += walk.steps;
  }
  return steps;
}
export function personalGoalProgress(walks: readonly WalkRecord[], userId: string, targets: GoalTargets, now = new Date()): GoalProgress[] {
  const { day, nextDay, week, nextWeek } = goalWindows(now);
  return [
    { id: 'daily', category: 'daily', title: 'Daily step goal', color: '#eab308', current: walkingStepsInWindow(walks, userId, +day, +nextDay, +now), target: targets.daily, endsAt: nextDay.toISOString() },
    { id: 'weekly', category: 'weekly', title: 'Weekly step goal', color: '#f97316', current: walkingStepsInWindow(walks, userId, +week, +nextWeek, +now), target: targets.weekly, endsAt: nextWeek.toISOString() },
  ];
}
export function walkGoalGains(walks: readonly WalkRecord[], walk: WalkRecord, targets: GoalTargets, now = new Date()): WalkGoalGain[] {
  const before = personalGoalProgress(walks.filter(item => item.id !== walk.id), walk.userId, targets, now);
  return personalGoalProgress(walks, walk.userId, targets, now).map((goal, index) => ({ ...goal,
    before: before[index].current, added: Math.max(0, goal.current - before[index].current),
    completedNow: before[index].current < goal.target && goal.current >= goal.target,
  })).filter(goal => goal.added > 0);
}
