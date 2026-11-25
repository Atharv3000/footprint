export const ONBOARDING_STEPS = [
  { id: 'workouts', route: '/log', label: 'Workouts', dialogue: ["Hi, I'm Pip! Let's get you comfortable with Footprint.", 'First, open your Fitness Log.'] },
  { id: 'fitness-tools', route: '/log', label: 'fitness tools', dialogue: ['AI Form counts camera reps. Body Fat records your check-ins, and Soreness tracks recovery.', 'Tap these tools to continue. You can try each tool after the tour.'] },
  { id: 'workout-days', route: '/log', label: 'Workout Split', dialogue: ['Swipe between workout days here or tap Split in the top right to order your repeating rotation, edit days, or add a new one.', 'Tap Start when ready to log sets, or use Individual Log above for a single exercise. Tap here to continue.'] },
  { id: 'nutrition', route: '/nutrition', label: 'Calorie Tracker', dialogue: ['Next, open your food diary. Your meals keep your calorie totals and challenges up to date.'] },
  { id: 'calorie-overview', route: '/nutrition', label: 'calorie summary', dialogue: ['This card shows your logged calories against your daily target, with calorie challenges in the same place.', 'Tap the summary to continue.'] },
  { id: 'meal-logging', route: '/nutrition', label: 'Your Essentials', dialogue: ['Use Log beside a meal to scan food, labels, or receipts, or enter items manually. Your totals update automatically.', 'Water has its own log below the meals. Tap Your Essentials to continue.'] },
  { id: 'nutrition-pet', route: '/nutrition', label: 'Pet', dialogue: ['Your food diary also looks after your daily companion. Tap the Pet pill in the top right to meet them.'] },
  { id: 'pet-care', route: '/nutrition', label: 'your companion', dialogue: ['Logged calories change my mood relative to your cut, bulk or maintenance target.', 'After the tour, rub my head back and forth to cheer me up. You can also change my style. Tap my picture to continue.'] },
  { id: 'nutrition-tracker', route: '/nutrition', label: 'Pet Pill', dialogue: ['Tap the Pet pill again whenever you want to switch back to your Calorie Tracker to log food or water.'] },
  { id: 'community', route: '/community', label: 'Community', dialogue: ['Community brings your friends and shared goals together. Open it next.'] },
  { id: 'calorie-challenge', route: '/community', label: 'calorie challenge', dialogue: ['Pick a daily cut or bulk target and invite a friend. Food saved in your diary updates your challenge.', 'Tap this card to continue the tour. You can create a challenge later.'] },
  { id: 'country-quest', route: '/community', label: 'country quest', dialogue: ['Choose a country border route and walk it together with friends.', 'Completed saved walks add progress to the shared route. Tap the country card to continue.'] },
  { id: 'community-goals', route: '/community', label: 'active challenges', dialogue: ['Daily and weekly goals follow your saved walks. Squad goals combine contributions from joined friends.', 'You can adjust personal targets and manage squad invites here. Tap the highlighted goals to continue.'] },
  { id: 'map', route: '/', label: 'Map', dialogue: ['Now open the map to see where you record walks and runs.'] },
  { id: 'map-controls', route: '/', label: 'tracking controls', dialogue: ["Hi, I'm Pip! These controls adjust your map view (3D, map layers, and locate).", 'Tap the highlighted controls to finish the map tour. Use Start below whenever you are ready to record!'] },
  { id: 'account', route: '/profile', label: 'Account', dialogue: ['Finally, open Account to explore your progress.'] },
  { id: 'profile-activity', route: '/profile', label: 'Activity', dialogue: ['Activity shows your recorded movement, measurements and exercise history. Open the Activity tab.'] },
  { id: 'profile-progress', route: '/profile', label: 'Progress', dialogue: ['Progress keeps your photo check-ins together. Open it to see where you can add and compare photos.'] },
  { id: 'profile-insights', route: '/profile', label: 'Insights', dialogue: ['Insights uses recorded activity to estimate race performance. New accounts need real activity first. Open Insights.'] },
  { id: 'profile-badges', route: '/profile', label: 'Badges', dialogue: ['Badges contains muscle ranks and achievements earned from your logged activity.', "Open Badges to finish. You're ready to explore! You can replay this tour from the Account menu."] },
] as const;

export const PAGE_TUTORIAL_ROUTES = ['/', '/log', '/nutrition', '/community', '/profile'] as const;
export type TutorialPageRoute = typeof PAGE_TUTORIAL_ROUTES[number];

const TAB_SWITCH_IDS = new Set(['workouts', 'nutrition', 'community', 'map', 'account']);

export function normalizeTutorialRoute(pathname: string): string {
  const clean = pathname.replace(/\/$/, '') || '/';
  return clean;
}

/** Per-page tutorial steps shown automatically the first time a user opens each page. */
export function stepsForPage(route: string): number[] {
  const normalized = normalizeTutorialRoute(route);
  const indices: number[] = [];
  for (let i = 0; i < ONBOARDING_STEPS.length; i++) {
    const s = ONBOARDING_STEPS[i];
    if (s.route === normalized && !TAB_SWITCH_IDS.has(s.id)) {
      indices.push(i);
    }
  }
  return indices;
}

export const TUTORIAL_FLOW_VERSION = 3;
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
  const route = event.type === 'ROUTE_READY' ? normalizeTutorialRoute(event.route) : '';
  if (event.type === 'ROUTE_READY' && state.phase === 'waiting' && route === step.route) {
    return state.step + 1 === ONBOARDING_STEPS.length ? { ...state, phase: 'done' } : { step: state.step + 1, line: 0, phase: 'read' };
  }
  if (event.type === 'ACTION_FAILED' && state.phase === 'waiting') return { ...state, phase: 'act' };
  return state;
}

/** Page-scoped reducer: advances only within the current page's tutorial steps. */
export function pageTutorialReducer(state: TutorialState, event: TutorialEvent, pageSteps: number[]): TutorialState {
  if (event.type === 'RESTORE') return restoreTutorial(event.state);
  if (state.phase === 'done' || pageSteps.length === 0) return state;
  const pos = pageSteps.indexOf(state.step);
  if (pos === -1) return { step: pageSteps[0], line: 0, phase: 'read' };
  const step = ONBOARDING_STEPS[state.step];
  if (event.type === 'READ_NEXT' && state.phase === 'read') {
    return state.line + 1 < step.dialogue.length ? { ...state, line: state.line + 1 } : { ...state, phase: 'act' };
  }
  if (event.type === 'TARGET' && state.phase === 'act' && event.id === step.id) return { ...state, phase: 'waiting' };
  const route = event.type === 'ROUTE_READY' ? normalizeTutorialRoute(event.route) : '';
  if (event.type === 'ROUTE_READY' && state.phase === 'waiting' && route === step.route) {
    return pos + 1 >= pageSteps.length
      ? { ...state, phase: 'done' }
      : { step: pageSteps[pos + 1], line: 0, phase: 'read' };
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
