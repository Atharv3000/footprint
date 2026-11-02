import type { BodyPart } from './muscleRanks';

export type MuscleColors = { color: string; light: string; dark: string };
export type MusclePalette = Record<BodyPart, MuscleColors>;

function shade(color: string, toward: number, amount: number): string {
  const channels = [1, 3, 5].map(index => Math.round(parseInt(color.slice(index, index + 2), 16) * (1 - amount) + toward * amount));
  return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}
// One randomly shuffled palette generated for this account; stable across reloads.
const base: Record<BodyPart, string> = {
  arms: '#FFD600', chest: '#FF4938', shoulders: '#A939FF',
  back: '#00F5AD', core: '#FF2898', legs: '#356BFF',
};
export const SHIH_MICHAEL_PALETTE = Object.fromEntries(Object.entries(base).map(([part, color]) => [part, {
  color, light: shade(color, 255, .18), dark: shade(color, 0, .22),
}])) as MusclePalette;

export function personalRankPalette(...accountNames: (string | undefined)[]): MusclePalette | undefined {
  const matches = accountNames.some(name => {
    const key = (name || '').toLowerCase().replace(/[^a-z]/g, '');
    return key === 'shihmichael' || key === 'michaelshih';
  });
  return matches ? SHIH_MICHAEL_PALETTE : undefined;
}
