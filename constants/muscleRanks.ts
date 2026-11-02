import type { ExerciseDefinition, WorkoutLogEntry } from './workoutStorage';

export const BODY_PARTS = [
  { id: 'arms', label: 'Arms', description: 'Biceps, triceps & forearms' },
  { id: 'chest', label: 'Chest', description: 'Pectorals' },
  { id: 'shoulders', label: 'Shoulders', description: 'Deltoids' },
  { id: 'back', label: 'Back', description: 'Lats, traps & upper/lower back' },
  { id: 'core', label: 'Core', description: 'Abs & obliques' },
  { id: 'legs', label: 'Legs', description: 'Quads, hamstrings, glutes & calves' },
] as const;
export type BodyPart = typeof BODY_PARTS[number]['id'];

// Visual gradient matches to the supplied rank references, not official brand hex codes.
// Keep the legacy `iron` ID for compatibility; its displayed starter rank is Wood.
export const MUSCLE_TIERS = [
  { id: 'iron', name: 'Wood', days: 0, color: '#A66D35', light: '#D3954A', dark: '#6C431F' },
  { id: 'bronze', name: 'Bronze', days: 1, color: '#B7876A', light: '#DBB599', dark: '#855B43' },
  { id: 'silver', name: 'Silver', days: 3, color: '#9BAFB5', light: '#D3DFE2', dark: '#6E8790' },
  { id: 'gold', name: 'Gold', days: 7, color: '#F4D449', light: '#FFE879', dark: '#CCA528' },
  { id: 'platinum', name: 'Platinum', days: 15, color: '#48C9B9', light: '#8CE8DD', dark: '#219C94' },
  { id: 'diamond', name: 'Diamond', days: 30, color: '#7B68EC', light: '#BBB1FF', dark: '#5D47C9' },
  { id: 'champion', name: 'Champion', days: 60, color: '#C86ADD', light: '#EBA0F1', dark: '#9F44C3' },
  { id: 'titan', name: 'Titan', days: 100, color: '#E30020', light: '#F51030', dark: '#A80019' },
  { id: 'olympian', name: 'Olympian', days: 150, color: '#50BBD0', light: '#98DDED', dark: '#2B8EAA' },
] as const;
export type MuscleTier = typeof MUSCLE_TIERS[number];
export type MuscleRank = {
  part: BodyPart; days: number; tier: MuscleTier; next: MuscleTier | null;
  progress: number; remaining: number; lastTrained: string | null;
};

const primaryGroups: Record<string, BodyPart> = {
  biceps: 'arms', triceps: 'arms', forearms: 'arms', brachialis: 'arms',
  chest: 'chest', pectorals: 'chest', shoulders: 'shoulders', deltoids: 'shoulders',
  lats: 'back', traps: 'back', 'middle back': 'back', 'lower back': 'back', 'upper back': 'back',
  abdominals: 'core', abs: 'core', obliques: 'core', core: 'core',
  quadriceps: 'legs', quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs',
  adductors: 'legs', abductors: 'legs',
};
// IDs used by older workout and camera screens, before the larger exercise library.
const legacyGroups: Record<string, BodyPart[]> = {
  squats: ['legs'], bench_press: ['chest'], deadlift: ['back', 'legs'],
  overhead_press: ['shoulders'], barbell_row: ['back'], incline_dumbbell_press: ['chest'],
  dumbbell_flyes: ['chest'], lat_pulldown: ['back'], pull_ups: ['back'],
  bicep_curls: ['arms'], hammer_curls: ['arms'], tricep_pushdown: ['arms'],
  lateral_raises: ['shoulders'], front_raises: ['shoulders'], leg_press: ['legs'],
  hamstring_curls: ['legs'], cable_crunches: ['core'], pushups: ['chest'],
};
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

export function tierForDays(days: number): MuscleRank['tier'] {
  const safe = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  return [...MUSCLE_TIERS].reverse().find(tier => safe >= tier.days) || MUSCLE_TIERS[0];
}

export function rankForPart(part: BodyPart, days: number, lastTrained: string | null = null): MuscleRank {
  const tier = tierForDays(days);
  const next = MUSCLE_TIERS[MUSCLE_TIERS.indexOf(tier) + 1] || null;
  return { part, days, tier, next, lastTrained,
    progress: next ? Math.max(0, Math.min(1, (days - tier.days) / (next.days - tier.days))) : 1,
    remaining: next ? Math.max(0, next.days - days) : 0 };
}

/** Lifetime consistency ranks. One credit per primary body part per local day. */
export function computeMuscleRanks(
  logs: readonly WorkoutLogEntry[], exercises: readonly ExerciseDefinition[], userId: string, now = new Date(),
): MuscleRank[] {
  const byId = new Map(exercises.map(exercise => [exercise.id, exercise]));
  const byName = new Map(exercises.map(exercise => [normalize(exercise.name), exercise]));
  const days = Object.fromEntries(BODY_PARTS.map(part => [part.id, new Set<string>()])) as Record<BodyPart, Set<string>>;
  const latest: Partial<Record<BodyPart, string>> = {};
  const seen = new Set<string>();
  for (const log of logs) {
    if (!log || typeof log.id !== 'string' || /^demo_/i.test(log.id) || seen.has(log.id)) continue;
    // The existing app can migrate guest history into the user's own storage key.
    if (log.userId !== userId && log.userId !== 'guest_user') continue;
    if (!Number.isInteger(log.reps) || log.reps <= 0 || !Number.isFinite(log.weight) || log.weight < 0) continue;
    if (typeof log.date !== 'string' || typeof log.exerciseId !== 'string' || typeof log.exerciseName !== 'string') continue;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(log.date);
    const date = dateOnly ? new Date(`${log.date}T00:00:00`) : new Date(log.date);
    if (!Number.isFinite(date.getTime()) || date.getTime() > now.getTime()) continue;
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (dateOnly && day !== log.date) continue;
    const exercise = byId.get(log.exerciseId) || byName.get(normalize(log.exerciseName));
    const parts = new Set<BodyPart>();
    for (const muscle of exercise?.primaryMuscles || []) {
      const part = primaryGroups[muscle.toLowerCase().replace(/_/g, ' ').trim()];
      if (part) parts.add(part);
    }
    if (!parts.size && exercise && BODY_PARTS.some(part => part.id === exercise.category)) parts.add(exercise.category as BodyPart);
    if (!parts.size) for (const part of legacyGroups[log.exerciseId] || []) parts.add(part);
    if (!parts.size) continue;
    seen.add(log.id);
    for (const part of parts) {
      days[part].add(day);
      if (!latest[part] || date.getTime() > new Date(latest[part]!).getTime()) latest[part] = date.toISOString();
    }
  }
  return BODY_PARTS.map(part => rankForPart(part.id, days[part.id].size, latest[part.id] || null));
}
