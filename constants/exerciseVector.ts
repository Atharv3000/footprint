import poses from './exerciseVectorPoses.json';

export type VectorExercise = {
  frames: number[][][]; equipment: string; muscles: string[]; scores?: number[];
  source?: string; support?: string; barAt?: string; cableAt?: string; focus?: string; cyclic?: boolean;
};
const catalog = poses as Record<string, VectorExercise>;
const base = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export function exerciseVector(imageUrl?: string): VectorExercise | null {
  if (!imageUrl?.startsWith(base)) return null;
  const path = imageUrl.slice(base.length);
  const folder = path.slice(0,path.lastIndexOf('/'));
  return Object.prototype.hasOwnProperty.call(catalog,folder) ? catalog[folder] : null;
}
