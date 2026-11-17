export const PET_SPECIES = ['cat', 'fox', 'bunny'] as const;
export const PET_HATS = ['none', 'cap', 'beanie', 'crown'] as const;
export const PET_FACE = ['none', 'glasses', 'shades'] as const;
export const PET_NECK = ['none', 'bowtie', 'medal'] as const;
export const PET_PALETTES = {
  mint: { label: 'Mint', light: '#C4F7DF', mid: '#96E2C6', dark: '#5EBEA4', outline: '#4A9E89', belly: '#E9F7D6' },
  peach: { label: 'Peach', light: '#FFE1C0', mid: '#FFB982', dark: '#E78D61', outline: '#BA6B48', belly: '#FFF0D7' },
  lilac: { label: 'Lilac', light: '#E6DBFF', mid: '#C1A6F6', dark: '#9371D1', outline: '#7556AA', belly: '#F5EBFF' },
  ocean: { label: 'Ocean', light: '#CBEEFF', mid: '#81CFF5', dark: '#48A4DB', outline: '#337EAE', belly: '#EAF7FF' },
  rose: { label: 'Rose', light: '#FFD9EA', mid: '#F6A0C4', dark: '#DA6D9E', outline: '#AE4C79', belly: '#FFF0F6' },
  cocoa: { label: 'Cocoa', light: '#EED4B9', mid: '#C79A77', dark: '#A36F50', outline: '#805138', belly: '#FFF0DA' },
} as const;
export type PetAppearance = {
  species: typeof PET_SPECIES[number]; color: keyof typeof PET_PALETTES;
  hat: typeof PET_HATS[number]; face: typeof PET_FACE[number]; neck: typeof PET_NECK[number];
};
export const DEFAULT_PET_APPEARANCE: PetAppearance = { species: 'cat', color: 'mint', hat: 'none', face: 'none', neck: 'none' };
export function sanitizePetAppearance(value: unknown): PetAppearance {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const choose = <T extends string>(choices: readonly T[], key: string, fallback: T): T => choices.includes(raw[key] as T) ? raw[key] as T : fallback;
  return {
    species: choose(PET_SPECIES, 'species', 'cat'),
    color: choose(Object.keys(PET_PALETTES) as PetAppearance['color'][], 'color', 'mint'),
    hat: choose(PET_HATS, 'hat', 'none'), face: choose(PET_FACE, 'face', 'none'), neck: choose(PET_NECK, 'neck', 'none'),
  };
}
export function randomPetAppearance(random: () => number = Math.random): PetAppearance {
  const pick = <T,>(items: readonly T[]): T => {
    const value = random();
    return items[Math.max(0, Math.min(items.length - 1, Number.isFinite(value) ? Math.floor(value * items.length) : 0))];
  };
  return { species: pick(PET_SPECIES), color: pick(Object.keys(PET_PALETTES) as PetAppearance['color'][]), hat: pick(PET_HATS), face: pick(PET_FACE), neck: pick(PET_NECK) };
}
