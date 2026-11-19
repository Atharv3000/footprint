import { cleanAccountRecords } from './accountRecords';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import rawExercisesData from './exercisesData.json';

export interface ExerciseDefinition {
  id: string;
  name: string;
  category: 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio';
  defaultReps: number;
  defaultWeight: number; // in lbs or kg
  imageUrl?: string;
  equipment?: string;
  primaryMuscles?: string[];
}

export interface WorkoutTrackingData {
  exerciseType: 'pushups' | 'squats' | 'bicep_curls' | 'jumping_jacks' | 'boxing';
  repCount: number;
  averageFormScore: number; // 0 - 100
  formAdvice: string[];
  feedbackHighlights: string[];
  boxingScore?: number;
  boxingMisses?: number;
  boxingBestCombo?: number;
  durationSeconds: number;
  confirmedWeight?: number;
  confirmedWeightUnit?: 'kg' | 'lb';
}

export interface WorkoutLogEntry {
  id: string;
  userId: string;
  exerciseId: string;
  exerciseName: string;
  reps: number;
  weight: number;
  weightUnit: 'kg' | 'lb';
  notes?: string;
  date: string; // ISO string
  aiTracked?: boolean; // Flag indicating logged via AI Camera Form Tracker
  trackingData?: WorkoutTrackingData;
}

export interface RoutineExercise {
  exerciseId: string;
  reps: number;
  weight: number;
}

export interface CustomRoutine {
  id: string;
  title: string; // e.g. "Chest", "Legs", "Back & Biceps", "Push Day"
  color: string; // pill accent color e.g. '#3b82f6', '#10b981', '#f59e0b', '#ec4899'
  category: 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio';
  exercises: RoutineExercise[];
}

export const DEFAULT_CUSTOM_ROUTINES: CustomRoutine[] = [
  {
    id: 'routine_chest',
    title: 'Chest',
    color: '#3b82f6',
    category: 'chest',
    exercises: [
      { exerciseId: 'bench_press', reps: 10, weight: 185 },
      { exerciseId: 'incline_dumbbell_press', reps: 12, weight: 65 },
      { exerciseId: 'dumbbell_flyes', reps: 12, weight: 40 },
    ],
  },
  {
    id: 'routine_legs',
    title: 'Legs',
    color: '#10b981',
    category: 'legs',
    exercises: [
      { exerciseId: 'squats', reps: 8, weight: 225 },
      { exerciseId: 'leg_press', reps: 10, weight: 360 },
      { exerciseId: 'hamstring_curls', reps: 12, weight: 95 },
    ],
  },
  {
    id: 'routine_back',
    title: 'Back',
    color: '#8b5cf6',
    category: 'back',
    exercises: [
      { exerciseId: 'deadlift', reps: 5, weight: 275 },
      { exerciseId: 'barbell_row', reps: 10, weight: 135 },
      { exerciseId: 'lat_pulldown', reps: 12, weight: 140 },
    ],
  },
  {
    id: 'routine_arms',
    title: 'Arms',
    color: '#f59e0b',
    category: 'arms',
    exercises: [
      { exerciseId: 'bicep_curls', reps: 12, weight: 35 },
      { exerciseId: 'hammer_curls', reps: 12, weight: 35 },
      { exerciseId: 'tricep_pushdown', reps: 15, weight: 50 },
    ],
  },
  {
    id: 'routine_shoulders',
    title: 'Shoulders',
    color: '#ec4899',
    category: 'shoulders',
    exercises: [
      { exerciseId: 'overhead_press', reps: 10, weight: 115 },
      { exerciseId: 'lateral_raises', reps: 15, weight: 25 },
      { exerciseId: 'front_raises', reps: 12, weight: 25 },
    ],
  },
];


// 870+ realistic illustrated exercises with photo references
export const DEFAULT_EXERCISES: ExerciseDefinition[] = (rawExercisesData as any[]).map((ex) => ({
  id: ex.id,
  name: ex.name,
  category: ex.category as any,
  defaultReps: ex.defaultReps || 12,
  defaultWeight: ex.defaultWeight || 0,
  imageUrl: ex.imageUrl,
  equipment: ex.equipment,
  primaryMuscles: ex.primaryMuscles,
}));

const LOG_STORAGE_KEY = (userId: string) => `@stridetrack_workout_logs_${userId}`;
export const WORKOUT_LOGS_CHANGED = 'footprint:workout-logs-changed';
const VISIBLE_EXERCISES_KEY = (userId: string) => `@stridetrack_visible_exercises_${userId}`;

export async function saveWorkoutLog(
  userId: string,
  entry: Omit<WorkoutLogEntry, 'id' | 'userId' | 'date'> & { date?: string }
): Promise<WorkoutLogEntry> {
  const newLog: WorkoutLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    date: entry.date || new Date().toISOString(),
    ...entry,
  };

  try {
    const key = LOG_STORAGE_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    const existing: WorkoutLogEntry[] = raw ? JSON.parse(raw) : [];
    const updated = [newLog, ...existing];
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    DeviceEventEmitter.emit(WORKOUT_LOGS_CHANGED, { userId });
  } catch (e) {
    console.error('Failed to save workout log', e);
  }

  return newLog;
}

/** Save one completed session together, or leave the existing history untouched on failure. */
export async function saveWorkoutLogBatch(
  userId: string,
  entries: Omit<WorkoutLogEntry, 'id' | 'userId' | 'date'>[],
): Promise<WorkoutLogEntry[]> {
  if (!entries.length) return [];
  const key = LOG_STORAGE_KEY(userId);
  const raw = await AsyncStorage.getItem(key);
  const existing: WorkoutLogEntry[] = raw ? JSON.parse(raw) : [];
  const date = new Date().toISOString();
  const logs = entries.map(entry => ({ ...entry, userId, date,
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` }));
  await AsyncStorage.setItem(key, JSON.stringify([...logs, ...existing]));
  DeviceEventEmitter.emit(WORKOUT_LOGS_CHANGED, { userId });
  return logs;
}

export async function deleteWorkoutLogsByIds(userId: string, idsToDelete: string[]): Promise<void> {
  try {
    const key = LOG_STORAGE_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const existing: WorkoutLogEntry[] = JSON.parse(raw);
    const idsSet = new Set(idsToDelete);
    const updated = existing.filter((log) => !idsSet.has(log.id));
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    DeviceEventEmitter.emit(WORKOUT_LOGS_CHANGED, { userId });
  } catch (e) {
    console.error('Failed to delete workout logs', e);
  }
}

/** Read existing history without seeding demonstrations or migrating another key. */
export async function loadRankableWorkoutLogs(userId: string): Promise<WorkoutLogEntry[]> {
  const raw = await AsyncStorage.getItem(LOG_STORAGE_KEY(userId));
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Workout history is unavailable.');
  return cleanAccountRecords(userId, 'workouts', parsed as WorkoutLogEntry[]);
}

export async function loadWorkoutLogs(userId: string): Promise<WorkoutLogEntry[]> {
  return loadRankableWorkoutLogs(userId);
}

export const CORE_FEATURED_EXERCISE_IDS = [
  'squats',
  'bench_press',
  'deadlift',
  'overhead_press',
  'barbell_row',
  'incline_dumbbell_press',
  'dumbbell_flyes',
  'lat_pulldown',
  'pull_ups',
  'bicep_curls',
  'hammer_curls',
  'tricep_pushdown',
  'lateral_raises',
  'front_raises',
  'leg_press',
  'hamstring_curls',
];

export async function loadVisibleExerciseIds(userId: string): Promise<string[]> {
  try {
    const key = VISIBLE_EXERCISES_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  // Default: core featured exercises (prevents freezing the JS thread by rendering 870+ SVGs simultaneously)
  return CORE_FEATURED_EXERCISE_IDS;
}

export async function saveVisibleExerciseIds(userId: string, ids: string[]): Promise<void> {
  try {
    const key = VISIBLE_EXERCISES_KEY(userId);
    await AsyncStorage.setItem(key, JSON.stringify(ids));
  } catch (e) {
    console.error('Failed to save visible exercises', e);
  }
}

const CUSTOM_ROUTINES_KEY = (userId: string) => `@stridetrack_custom_routines_${userId}`;

export async function loadCustomRoutines(userId: string): Promise<CustomRoutine[]> {
  try {
    const key = CUSTOM_ROUTINES_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((r: any) => ({
          ...r,
          exercises: Array.isArray(r.exercises) ? r.exercises : [],
        }));
      }
    }
  } catch (e) {
    console.error('Failed to load custom routines', e);
  }
  return [];
}

export async function saveCustomRoutines(userId: string, routines: CustomRoutine[]): Promise<void> {
  try {
    const key = CUSTOM_ROUTINES_KEY(userId);
    await AsyncStorage.setItem(key, JSON.stringify(routines));
  } catch (e) {
    console.error('Failed to save custom routines', e);
  }
}

export interface ProgressPhoto {
  id: string;
  userId: string;
  uri: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO
  caption?: string;
  weightKg?: number;
}

const PROGRESS_PHOTOS_KEY = (userId: string) => `@stridetrack_progress_photos_${userId}`;

export async function loadProgressPhotos(userId: string): Promise<ProgressPhoto[]> {
  const raw = await AsyncStorage.getItem(PROGRESS_PHOTOS_KEY(userId));
  const records = raw ? JSON.parse(raw) : [];
  return cleanAccountRecords(userId, 'photos', records as ProgressPhoto[])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function saveProgressPhoto(
  userId: string,
  entry: { uri: string; date: string; caption?: string; weightKg?: number }
): Promise<ProgressPhoto> {
  const newPhoto: ProgressPhoto = {
    id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    uri: entry.uri,
    date: entry.date,
    createdAt: new Date().toISOString(),
    caption: entry.caption,
    weightKg: entry.weightKg,
  };

  try {
    const key = PROGRESS_PHOTOS_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    const existing: ProgressPhoto[] = raw ? JSON.parse(raw) : [];
    const updated = [newPhoto, ...existing];
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save progress photo', e);
  }

  return newPhoto;
}

export async function updateProgressPhoto(
  userId: string,
  photoId: string,
  updates: { date?: string; caption?: string; uri?: string; weightKg?: number }
): Promise<void> {
  try {
    const key = PROGRESS_PHOTOS_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const existing: ProgressPhoto[] = JSON.parse(raw);
      const updated = existing.map((p) => (p.id === photoId ? { ...p, ...updates } : p));
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    }
  } catch (e) {
    console.error('Failed to update progress photo', e);
  }
}

export async function deleteProgressPhoto(userId: string, photoId: string): Promise<void> {
  try {
    const key = PROGRESS_PHOTOS_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const existing: ProgressPhoto[] = JSON.parse(raw);
      const updated = existing.filter((p) => p.id !== photoId);
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    }
  } catch (e) {
    console.error('Failed to delete progress photo', e);
  }
}

export interface WeightLogEntry {
  id: string;
  userId: string;
  weightKg: number;
  date: string; // ISO or YYYY-MM-DD
}

const WEIGHT_LOGS_KEY = (userId: string) => `@stridetrack_weight_logs_${userId}`;

export async function loadWeightLogs(userId: string): Promise<WeightLogEntry[]> {
  const raw = await AsyncStorage.getItem(WEIGHT_LOGS_KEY(userId));
  const records = raw ? JSON.parse(raw) : [];
  return cleanAccountRecords(userId, 'weights', records as WeightLogEntry[])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function recordWeightLog(userId: string, weightKg: number, date?: string): Promise<WeightLogEntry> {
  const newEntry: WeightLogEntry = {
    id: `weight_${Date.now()}`,
    userId,
    weightKg,
    date: date || new Date().toISOString(),
  };

  try {
    const key = WEIGHT_LOGS_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    const existing: WeightLogEntry[] = raw ? JSON.parse(raw) : [];
    // If an entry exists for the same day, update it; otherwise append
    const targetDay = newEntry.date.split('T')[0];
    const filtered = existing.filter((e) => e.date.split('T')[0] !== targetDay);
    const updated = [...filtered, newEntry].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save weight log', e);
  }

  return newEntry;
}

export interface BodyFatLogEntry {
  id: string;
  userId: string;
  bodyFatPercent: number;
  date: string; // ISO
  method?: 'ai_scan' | 'manual';
  photoUri?: string;
  notes?: string;
  estimatedFatMassKg?: number;
  estimatedLeanMassKg?: number;
}

const BODY_FAT_LOGS_KEY = (userId: string) => `@stridetrack_body_fat_logs_${userId}`;

export async function loadBodyFatLogs(userId: string): Promise<BodyFatLogEntry[]> {
  const raw = await AsyncStorage.getItem(BODY_FAT_LOGS_KEY(userId));
  const records = raw ? JSON.parse(raw) : [];
  return cleanAccountRecords(userId, 'bodyFat', records as BodyFatLogEntry[])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function recordBodyFatLog(
  userId: string,
  bodyFatPercent: number,
  options?: { photoUri?: string; method?: 'ai_scan' | 'manual'; notes?: string; weightKg?: number }
): Promise<BodyFatLogEntry> {
  const fatMass = options?.weightKg ? +(options.weightKg * (bodyFatPercent / 100)).toFixed(1) : undefined;
  const leanMass = options?.weightKg && fatMass ? +(options.weightKg - fatMass).toFixed(1) : undefined;

  const newEntry: BodyFatLogEntry = {
    id: `bf_${Date.now()}`,
    userId,
    bodyFatPercent: +bodyFatPercent.toFixed(1),
    date: new Date().toISOString(),
    method: options?.method || 'ai_scan',
    photoUri: options?.photoUri,
    notes: options?.notes,
    estimatedFatMassKg: fatMass,
    estimatedLeanMassKg: leanMass,
  };

  try {
    const key = BODY_FAT_LOGS_KEY(userId);
    const raw = await AsyncStorage.getItem(key);
    const existing: BodyFatLogEntry[] = raw ? JSON.parse(raw) : [];
    const updated = [...existing, newEntry].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save body fat log', e);
  }

  return newEntry;
}

// User-specified manual muscle soreness override store
const MANUAL_SORENESS_KEY = (userId: string) => `@stridetrack_manual_soreness_${userId}`;

export async function loadManualMuscleSoreness(userId: string): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(MANUAL_SORENESS_KEY(userId));
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

export async function saveManualMuscleSoreness(userId: string, overrides: Record<string, number>): Promise<void> {
  try {
    await AsyncStorage.setItem(MANUAL_SORENESS_KEY(userId), JSON.stringify(overrides));
  } catch (e) {}
}
