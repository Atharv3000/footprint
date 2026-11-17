import type { WorkoutLogEntry } from './workoutStorage';

export interface SessionExercise {
  exerciseId: string;
  name: string;
  sets: { reps: number; weight: number; multiplier: number; completed: boolean }[];
}

/** Validate the whole selection before writing any history. */
export function completedWorkoutEntries(
  exercises: SessionExercise[],
  weightUnit: 'kg' | 'lb',
  notes: string,
): Omit<WorkoutLogEntry, 'id' | 'userId' | 'date'>[] {
  return exercises.flatMap(exercise => exercise.sets.flatMap((set, index) => {
    if (!set.completed) return [];
    if (!Number.isInteger(set.reps) || set.reps < 1 || !Number.isFinite(set.weight) || set.weight < 0
      || !Number.isInteger(set.multiplier) || set.multiplier < 1 || set.multiplier > 4) {
      throw new Error('Checked sets need positive whole reps and a valid weight (0 is allowed for bodyweight).');
    }
    return Array.from({ length: set.multiplier }, (_, copy) => ({
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name,
      reps: set.reps,
      weight: set.weight,
      weightUnit,
      notes: `Set ${index + 1}${set.multiplier > 1 ? ` (${copy + 1}/${set.multiplier})` : ''} · ${notes}`,
    }));
  }));
}

export function confirmedCameraWeight(exercise: string, input: string): number {
  if (exercise === 'pushups' || exercise === 'boxing') return 0;
  const weight = input.trim() === '' ? NaN : Number(input);
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error('Enter the weight you used. Enter 0 if no additional weight was used.');
  }
  return weight;
}
