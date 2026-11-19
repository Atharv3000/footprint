import AsyncStorage from '@react-native-async-storage/async-storage';
import { INITIAL_TUTORIAL, restoreTutorial, TutorialState, TUTORIAL_FLOW_VERSION } from './onboardingMachine';
export const TUTORIAL_INSTALL_KEY = '@footprint_forced_tour_v1';
export const tutorialAccountKey = (id: string) => `@footprint_tutorial_account_v2_${encodeURIComponent(id.trim().toLowerCase())}`;
type AccountTour = { version: 2; flowVersion: number; completed: boolean; progress?: TutorialState };
type InstallTour = { version: 1; eligible: boolean; completed: boolean; accountId?: string; progress?: TutorialState };
let queue: Promise<unknown> = Promise.resolve();
function ordered<T>(action: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => {}).then(action); queue = next; return next;
}
async function initializeUnlocked(): Promise<InstallTour> {
  const stored = await AsyncStorage.getItem(TUTORIAL_INSTALL_KEY);
  if (stored) {
    try {
      const record = JSON.parse(stored);
      if (record?.version === 1 && typeof record.eligible === 'boolean') return record;
    } catch { /* Never force an unknown legacy installation into onboarding. */ }
    return { version: 1, eligible: false, completed: true };
  }
  const existingProfile = await AsyncStorage.getItem('@footprint_user_profile');
  const record: InstallTour = { version: 1, eligible: existingProfile === null, completed: false };
  await AsyncStorage.setItem(TUTORIAL_INSTALL_KEY, JSON.stringify(record));
  return record;
}
export function initializeTutorialInstall(): Promise<InstallTour> { return ordered(initializeUnlocked); }
/** New accounts are eligible even on a device where another account already finished the tour. */
export function enrollTutorialAccount(accountId: string): Promise<void> {
  return ordered(async () => {
    const key = tutorialAccountKey(accountId);
    if (await AsyncStorage.getItem(key)) return;
    await AsyncStorage.setItem(key, JSON.stringify({ version: 2, flowVersion: TUTORIAL_FLOW_VERSION, completed: false, progress: INITIAL_TUTORIAL }));
  });
}
async function readAccount(accountId: string): Promise<AccountTour | null> {
  const key = tutorialAccountKey(accountId), stored = await AsyncStorage.getItem(key);
  if (stored) {
    const record = JSON.parse(stored);
    return record?.version === 2 ? record : null;
  }
  const legacy = await initializeUnlocked();
  if (!legacy.eligible || (legacy.accountId && legacy.accountId !== accountId)) return null;
  const migrated: AccountTour = { version: 2, flowVersion: TUTORIAL_FLOW_VERSION, completed: legacy.completed, progress: INITIAL_TUTORIAL };
  await AsyncStorage.setItem(key, JSON.stringify(migrated));
  // Bind unowned first-install eligibility once; other existing accounts remain undisturbed.
  if (!legacy.accountId) await AsyncStorage.setItem(TUTORIAL_INSTALL_KEY, JSON.stringify({ ...legacy, accountId }));
  return migrated;
}
export function loadTutorialForAccount(accountId: string): Promise<TutorialState | null> {
  return ordered(async () => {
    const record = await readAccount(accountId);
    if (!record || record.completed) return null;
    return record.flowVersion === TUTORIAL_FLOW_VERSION ? restoreTutorial(record.progress) : { ...INITIAL_TUTORIAL };
  });
}
export function saveTutorialProgress(accountId: string, progress: TutorialState): Promise<void> {
  return ordered(async () => {
    const record = await readAccount(accountId);
    if (!record || record.completed) return;
    await AsyncStorage.setItem(tutorialAccountKey(accountId), JSON.stringify({ version: 2, flowVersion: TUTORIAL_FLOW_VERSION,
      completed: progress.phase === 'done', progress: restoreTutorial(progress) }));
  });
}
