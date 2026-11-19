import AsyncStorage from '@react-native-async-storage/async-storage';

let activeAccount = 'guest_user';
export function setActiveStorageAccount(email: string | null) { activeAccount = email?.trim().toLowerCase() || 'guest_user'; }
export function accountStorageKey(key: string): string { return `${key}:account:${encodeURIComponent(activeAccount)}`; }
const LEGACY_OWNER_KEY = '@footprint_legacy_nutrition_owner_v1';
const LEGACY_PREFIXES = ['@stridetrack_nutrition_targets', '@stridetrack_macro_quiz', '@stridetrack_meal_logs', '@stridetrack_water_logs_'];
let migration: Promise<void> = Promise.resolve();

/** Copy shared legacy nutrition data once, only to the profile that owned it. Originals remain intact. */
export function prepareAccountStorage(email: string, legacyOwner?: string): Promise<void> {
  const account = email.trim().toLowerCase();
  const work = migration.catch(() => {}).then(async () => {
    const owner = await AsyncStorage.getItem(LEGACY_OWNER_KEY);
    if (owner && owner !== account) return;
    if (!owner && (!legacyOwner || legacyOwner.trim().toLowerCase() !== account || account === 'walker@footprint.app')) return;
    const marker = `${LEGACY_OWNER_KEY}:complete`;
    if (await AsyncStorage.getItem(marker)) return;
    await AsyncStorage.setItem(LEGACY_OWNER_KEY, account);
    const keys = (await AsyncStorage.getAllKeys()).filter(key => !key.includes(':account:') && LEGACY_PREFIXES.some(prefix => key.startsWith(prefix)));
    for (const key of keys) {
      const destination = `${key}:account:${encodeURIComponent(account)}`;
      const value = await AsyncStorage.getItem(key);
      if (value !== null && (await AsyncStorage.getItem(destination)) === null) await AsyncStorage.setItem(destination, value);
    }
    await AsyncStorage.setItem(marker, '1');
  });
  migration = work;
  return work;
}
