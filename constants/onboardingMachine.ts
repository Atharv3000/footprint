export const ONBOARDING_STEPS = [
  { id: 'workouts', route: '/log', label: 'Workouts', dialogue: ["Hi, I'm Pip! Let's get you comfortable with Footprint.", 'First, open your Fitness Log.'] },
  { id: 'fitness-tools', route: '/log', label: 'fitness tools', dialogue: ['AI Form counts camera reps. Body Fat records your check-ins, and Soreness tracks recovery.', 'Tap this tools bar to continue. You can try each tool after the tour.'] },
  { id: 'workout-days', route: '/log', label: 'Workout days', dialogue: ['Create a workout day here, then choose it to log its exercises, reps and weights.', 'Check off the sets you finish. Only checked sets are saved. Tap Workout days to continue.'] },
  { id: 'nutrition', route: '/nutrition', label: 'Calorie Tracker', dialogue: ['Next, open your food diary. Your meals keep your calorie totals and challenges up to date.'] },
  { id: 'calorie-overview', route: '/nutrition', label: 'calorie summary', dialogue: ['This card shows your logged calories against your daily target, with calorie challenges in the same place.', 'Tap the summary to continue.'] },
  { id: 'meal-logging', route: '/nutrition', label: 'Your Essentials', dialogue: ['Use Log beside a meal to add food. Your totals update when you save or edit an entry.', 'Water has its own log below the meals. Tap Your Essentials to continue.'] },
  { id: 'nutrition-pet', route: '/nutrition', label: 'Pet', dialogue: ['Your food diary also looks after your daily companion. Open Pet to meet them.'] },
  { id: 'pet-care', route: '/nutrition', label: 'your companion', dialogue: ['Logged calories change my mood relative to your cut, bulk or maintenance target.', 'After the tour, rub my head back and forth to cheer me up. You can also change my style. Tap my picture to continue.'] },
  { id: 'nutrition-tracker', route: '/nutrition', label: 'Tracker', dialogue: ['Switch back to Tracker whenever you want to log food or water.'] },
  { id: 'community', route: '/community', label: 'Community', dialogue: ['Community brings your friends and shared goals together. Open it next.'] },
  { id: 'calorie-challenge', route: '/community', label: 'calorie challenge', dialogue: ['Pick a daily cut or bulk target and invite a friend. Food saved in your diary updates your challenge.', 'Tap this card to continue the tour. You can create a challenge later.'] },
  { id: 'country-quest', route: '/community', label: 'country quest', dialogue: ['Choose a country border route and walk it together with friends.', 'Completed saved walks add progress to the shared route. Tap the country card to continue.'] },
  { id: 'community-goals', route: '/community', label: 'active challenges', dialogue: ['Daily and weekly goals follow your saved walks. Squad goals combine contributions from joined friends.', 'You can adjust personal targets and manage squad invites here. Tap the highlighted goals to continue.'] },
  { id: 'map', route: '/', label: 'Map', dialogue: ['Now open the map to see where you record walks and runs.'] },
  { id: 'map-controls', route: '/', label: 'tracking controls', dialogue: ['These controls adjust your map view. Use Start below when you are ready to record, then Finish to save your activity.', 'Tap the highlighted area to continue. This tour will not start a recording.'] },
  { id: 'account', route: '/profile', label: 'Account', dialogue: ['Finally, open Account to explore your progress.'] },
  { id: 'profile-activity', route: '/profile', label: 'Activity', dialogue: ['Activity shows your recorded movement, measurements and exercise history. Open the Activity tab.'] },
  { id: 'profile-progress', route: '/profile', label: 'Progress', dialogue: ['Progress keeps your photo check-ins together. Open it to see where you can add and compare photos.'] },
  { id: 'profile-insights', route: '/profile', label: 'Insights', dialogue: ['Insights uses recorded activity to estimate race performance. New accounts need real activity first. Open Insights.'] },
  { id: 'profile-badges', route: '/profile', label: 'Badges', dialogue: ['Badges contains muscle ranks and achievements earned from your logged activity.', "Open Badges to finish. You're ready to explore! You can replay this tour from the Account menu."] },
] as const;
export const TUTORIAL_FLOW_VERSION = 2;
export type TutorialTargetId = typeof ONBOARDING_STEPS[number]['id'];
export type TutorialState = { step: number; line: number; phase: 'read' | 'act' | 'waiting' | 'done' };
export const INITIAL_TUTORIAL: TutorialState = { step: 0, line: 0, phase: 'read' };
export type TutorialEvent = { type: 'READ_NEXT' } | { type: 'TARGET'; id: string }
  | { type: 'ROUTE_READY'; route: string } | { type: 'ACTION_FAILED' } | { type: 'RESTORE'; state: TutorialState };
export function restoreTutorial(value: unknown): TutorialState {
  const saved = value as Partial<TutorialState> | null;
  if (!saved || !Number.isInteger(saved.step) || saved.step! < 0 || saved.step! >= ONBOARDING_STEPS.length) return { ...INITIAL_TUTORIAL };
  const step = saved.step!;
  const line = Number.isInteger(saved.line) ? Math.max(0, Math.min(saved.line!, ONBOARDING_STEPS[step].dialogue.length - 1)) : 0;
  const phase = saved.phase === 'done' && step === ONBOARDING_STEPS.length - 1 ? 'done'
    : saved.phase === 'act' || saved.phase === 'waiting' ? 'act' : 'read';
  return { step, line, phase };
}
export function tutorialReducer(state: TutorialState, event: TutorialEvent): TutorialState {
  if (event.type === 'RESTORE') return restoreTutorial(event.state);
  if (state.phase === 'done') return state;
  const step = ONBOARDING_STEPS[state.step];
  if (event.type === 'READ_NEXT' && state.phase === 'read') {
    return state.line + 1 < step.dialogue.length ? { ...state, line: state.line + 1 } : { ...state, phase: 'act' };
  }
  if (event.type === 'TARGET' && state.phase === 'act' && event.id === step.id) return { ...state, phase: 'waiting' };
  const route = event.type === 'ROUTE_READY' ? event.route.replace(/\/$/, '') || '/' : '';
  if (event.type === 'ROUTE_READY' && state.phase === 'waiting' && route === step.route) {
    return state.step + 1 === ONBOARDING_STEPS.length ? { ...state, phase: 'done' } : { step: state.step + 1, line: 0, phase: 'read' };
  }
  if (event.type === 'ACTION_FAILED' && state.phase === 'waiting') return { ...state, phase: 'act' };
  return state;
}
export type TutorialRect = { x: number; y: number; width: number; height: number };
export function spotlightRect(target: TutorialRect, frame: TutorialRect): TutorialRect | null {
  if (![target.x, target.y, target.width, target.height, frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)
    || target.width <= 0 || target.height <= 0 || frame.width <= 0 || frame.height <= 0) return null;
  const x = Math.max(0, target.x - frame.x), y = Math.max(0, target.y - frame.y);
  const right = Math.min(frame.width, target.x - frame.x + target.width), bottom = Math.min(frame.height, target.y - frame.y + target.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
