export type JointCoordinate = { indices: number[]; axis: number; offset: number };

/** Exactly the old piecewise-linear SVG pose interpolation, executed as a worklet. */
export function sampleExercisePose(frames: number[][][], progress: number): number[][] {
  'worklet';
  const position = Math.max(0, Math.min(1, progress)) * (frames.length-1);
  const low = Math.floor(position), high = Math.min(frames.length-1, low+1), fraction = position-low;
  return frames[low].map((point,i) => point.map((value,axis) => value+(frames[high][i][axis]-value)*fraction));
}

export function resolveJointCoordinate(pose: number[][], coordinate: number | JointCoordinate): number {
  'worklet';
  if (typeof coordinate === 'number') return coordinate;
  return coordinate.indices.reduce((total,i)=>total+pose[i][coordinate.axis],0)/coordinate.indices.length+coordinate.offset;
}
