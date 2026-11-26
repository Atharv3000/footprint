import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "I'm 13 or older" confirmation, asked during setup (onboarding step "Your physiology").
 * Stored on the device with the time it was given. Not legal advice; see docs/legal-checklist.md.
 */
export const MIN_AGE = 13;
const KEY = '@footprint_age_confirmed_v1';

export async function isAgeConfirmed(): Promise<boolean> {
  try {
    return !!(await AsyncStorage.getItem(KEY));
  } catch {
    return false;
  }
}

export async function saveAgeConfirmation(): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ minAge: MIN_AGE, confirmedAt: new Date().toISOString() }));
}
