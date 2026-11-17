import AsyncStorage from '@react-native-async-storage/async-storage';
import { PetAppearance, sanitizePetAppearance } from './petAppearance';
export type NutritionPetProfile = { version: 2; name: string; appearance: PetAppearance };
const key = (userId: string) => `@footprint_nutrition_pet_${userId}`;
const cleanName = (name: unknown) => typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 18) || 'Pip' : 'Pip';
export async function loadNutritionPetProfile(userId: string): Promise<NutritionPetProfile> {
  const raw = await AsyncStorage.getItem(key(userId));
  const saved = raw ? JSON.parse(raw) : {};
  return { version: 2, name: cleanName(saved?.name), appearance: sanitizePetAppearance(saved?.appearance) };
}
/** Read before patching so renaming and changing outfits preserve each other. */
export async function saveNutritionPetProfile(userId: string, patch: { name?: string; appearance?: PetAppearance }): Promise<NutritionPetProfile> {
  const previous = await loadNutritionPetProfile(userId);
  const profile: NutritionPetProfile = { version: 2,
    name: patch.name === undefined ? previous.name : cleanName(patch.name),
    appearance: patch.appearance === undefined ? previous.appearance : sanitizePetAppearance(patch.appearance),
  };
  await AsyncStorage.setItem(key(userId), JSON.stringify(profile));
  return profile;
}
