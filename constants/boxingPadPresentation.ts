export type PunchKind = 'straight' | 'hook' | 'uppercut';

/** Orthographic projection of a thick mitt, viewed from the boxer's camera.
 * Roll is decorative; yaw/pitch orient the striking face against the punch.
 * Screen y increases downward. `inward` is the tracked hand's hook direction.
 */
export function boxingPadPresentation(kind: PunchKind, inward: number) {
  const side = inward < 0 ? -1 : 1;
  const yaw = kind === 'hook' ? -side * 68 : -side * 8;
  const pitch = kind === 'uppercut' ? -64 : kind === 'hook' ? -5 : -3;
  const roll = kind === 'hook' ? side * 4 : kind === 'uppercut' ? side * 3 : 0;
  const radians = Math.PI / 180;
  const cy = Math.cos(yaw*radians), sy = Math.sin(yaw*radians);
  const cp = Math.cos(pitch*radians), sp = Math.sin(pitch*radians);
  const cr = Math.cos(roll*radians), sr = Math.sin(roll*radians);
  const matrix = [cr*cy, sr*cy, cr*sy*sp-sr*cp, sr*sy*sp+cr*cp];
  const normal = { x: cr*sy*cp+sr*sp, y: sr*sy*cp-cr*sp, z: cy*cp };
  return { matrix, normal, thickness: 18, yaw, pitch, roll };
}

/** Present the mitt, then settle before the server's scoring window opens. */
export function boxingPadArrival(kind: PunchKind, inward: number, age: number, radius: number) {
  const remaining = 1 - Math.max(0, Math.min(1, age / 1.9));
  const eased = remaining*remaining;
  return { x: kind === 'hook' ? -(inward < 0 ? -1 : 1)*radius*.8*eased : 0,
    y: kind === 'uppercut' ? -radius*.85*eased : 0 };
}
