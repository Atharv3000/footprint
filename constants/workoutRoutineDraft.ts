import type { CustomRoutine, ExerciseDefinition } from './workoutStorage';

/** A name is only a label. Only explicit selections determine a workout's exercises. */
export function buildWorkoutRoutine(input: {
  id: string; title: string; color: string; category: CustomRoutine['category']; selectedIds: readonly string[];
}, exercises: readonly ExerciseDefinition[], existing?: CustomRoutine | null): CustomRoutine {
  if (!input.title.trim()) throw new Error('Please enter a name for your workout day.');
  const ids = [...new Set(input.selectedIds)];
  if (!ids.length) throw new Error('Choose at least one exercise for this workout day.');
  const definitions = new Map(exercises.map(exercise => [exercise.id, exercise]));
  const retained = new Map(existing?.exercises.map(exercise => [exercise.exerciseId, exercise]) ?? []);
  return {
    ...existing, id: existing?.id ?? input.id, title: input.title.trim(), color: input.color, category: input.category,
    exercises: ids.map(id => {
      const previous = retained.get(id);
      if (previous) return { ...previous };
      const definition = definitions.get(id);
      if (!definition) throw new Error('A selected exercise is unavailable. Remove it or select it again from the catalog.');
      return {
        exerciseId: id,
        reps: Number.isInteger(definition.defaultReps) && definition.defaultReps > 0 ? definition.defaultReps : 10,
        weight: Number.isFinite(definition.defaultWeight) && definition.defaultWeight >= 0 ? definition.defaultWeight : 0,
      };
    }),
  };
}
