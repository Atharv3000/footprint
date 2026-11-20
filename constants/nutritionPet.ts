import type { DietGoal, MealLog } from './nutritionStorage';

export type PetMood = 'ready' | 'hungry' | 'peckish' | 'energized' | 'satisfied' | 'full' | 'stuffed' | 'cheerful' | 'curious' | 'low' | 'recovering' | 'sleepy';
type PetMeal = Pick<MealLog, 'id' | 'dateKey' | 'calories'> & Partial<Pick<MealLog, 'timestamp'>>;
export type NutritionPetState = {
  rhythm?: PetRhythm;
  mood: PetMood; label: string; dialogue: string; calories: number; target: number; percent: number;
  goal: DietGoal; todayMealIds: string[]; loggedDays: number; streak: number;
  level: number; careProgress: number; daysToNextLevel: number; bellyScale: number;
};

function dayBefore(key: string) {
  const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate()-1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function validDay(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T12:00:00`);
  return Number.isFinite(date.getTime()) && date.getFullYear() === Number(key.slice(0,4)) && date.getMonth()+1 === Number(key.slice(5,7)) && date.getDate() === Number(key.slice(8,10));
}

/** A virtual pet's daily fullness, not a body-fat or weight prediction.
 * Cut/bulk targets have already been set by the nutrition plan: do not adjust twice.
 * Care progression rewards logged days, never eating more/less or repeated entries.
 */
export function computeNutritionPet(meals: readonly PetMeal[], dailyTarget: number, goal: DietGoal, today: string, now = new Date()): NutritionPetState {
  const seen = new Set<string>(), days = new Set<string>(), ids: string[] = [];
  let calories = 0;
  for (const meal of meals) {
    if (!meal || typeof meal.id !== 'string' || !meal.id || seen.has(meal.id) || !Number.isFinite(meal.calories) || meal.calories < 0) continue;
    if (typeof meal.dateKey !== 'string' || !validDay(meal.dateKey) || meal.dateKey > today || !validDay(today)) continue;
    seen.add(meal.id);
    if (meal.calories > 0) days.add(meal.dateKey);
    if (meal.dateKey === today) { calories += meal.calories; ids.push(meal.id); }
  }
  const target = Number.isFinite(dailyTarget) && dailyTarget > 0 ? dailyTarget : 0;
  const ratio = target ? calories/target : 0;
  const mood: Exclude<PetMood, 'cheerful' | 'curious' | 'low' | 'recovering' | 'sleepy'> = !target || calories === 0 ? 'ready' : ratio < .35 ? 'hungry' : ratio < .7 ? 'peckish' : ratio < .9 ? 'energized' : ratio <= 1.1 ? 'satisfied' : ratio <= 1.3 ? 'full' : 'stuffed';
  const label: Record<typeof mood, string> = { ready: 'Ready for today', hungry: 'A little hungry', peckish: 'Getting fueled', energized: 'Feeling energized', satisfied: 'Happy belly', full: 'Feeling full', stuffed: 'Very full' };
  const plan = goal === 'cut' ? 'cut' : goal === 'bulk' ? 'bulk' : 'maintenance';
  const dialogue: Record<typeof mood, string> = {
    ready: `A fresh day for our ${plan} plan! Log a meal when you're ready.`,
    hungry: goal === 'bulk' ? 'A little fuel in the tank! Every logged meal helps me follow your bulk.' : 'Thanks for the first bites! I follow what you log, one meal at a time.',
    peckish: goal === 'cut' ? "We're finding our rhythm. Let's follow the target you set for your cut." : goal === 'bulk' ? "Fueling up for our bulk! I'm getting perkier with each logged meal." : "Mmm, getting fueled! We're making progress toward your daily goal.",
    energized: goal === 'bulk' ? 'Feeling strong! Our bulk target is getting close.' : goal === 'cut' ? 'Feeling bright! We are getting close to your cut target.' : 'Feeling bright! Your daily target is getting close.',
    satisfied: `Happy belly! We're right around your ${plan} target today.`,
    full: "Feeling full! Your log is above today's target. Keep your diary honest, even on bigger days.",
    stuffed: "Whew, a very full belly today! Every day is different. Keep logging honestly and we'll start fresh tomorrow.",
  };
  let streak = 0; let cursor = days.has(today) ? today : dayBefore(today);
  while (validDay(cursor) && days.has(cursor)) { streak++; cursor = dayBefore(cursor); }
  const state: NutritionPetState = { mood, label: label[mood], dialogue: target ? dialogue[mood] : 'Set a daily calorie target so I can follow your plan.', calories, target,
    percent: ratio*100, goal, todayMealIds: ids, loggedDays: days.size, streak,
    level: 1+Math.floor(days.size/3), careProgress: (days.size%3)/3, daysToNextLevel: 3-days.size%3,
    bellyScale: Math.min(1.13, .96+Math.min(1.4, ratio)*.12) };
  return applyDailyRhythm(state, meals, today, now);
}

/** Rotate character dialogue without changing calorie targets or care rewards. */
export function nutritionPetDialogue(state: NutritionPetState, variation = 0): string {
  if (!state.target) return state.dialogue;
  if (state.rhythm) {
    const plan = state.goal === 'bulk' ? 'bulk' : state.goal === 'cut' ? 'cut' : 'maintenance';
    const lines = [state.dialogue, ...rhythmDialogue(state, plan)];
    const index = Number.isFinite(variation) ? Math.abs(Math.floor(variation)) % lines.length : 0;
    return lines[index];
  }
  let lines: string[];
  if (state.goal === 'bulk' && state.percent < 70) {
    lines = [
      'Rumble rumble… my virtual tummy is hungry! Any meals to log for our bulk?',
      `Bulk buddy reporting for snack duty! Our diary has ${Math.round(Math.max(0, state.target - state.calories))} kcal left to the target.`,
      "My bowl looks a little empty for our bulk. Did a meal miss the diary?",
    ];
  } else if (state.goal === 'cut' && state.percent >= 100) {
    lines = [
      "Whoa, snack chef! We've reached today's cut target. My virtual belly is full!",
      "My snack paws are off duty—we've reached our cut target. Keep logging anything else you eat, too.",
      "Purr… full belly, cut target reached. I'll take head rubs instead of virtual snacks!",
    ];
  } else if (state.goal === 'bulk' && state.percent < 90) {
    lines = [state.dialogue, 'Bulk fuel loading… almost there! My tail is getting its energy back.', 'Feeling stronger! Our bulk diary is getting close to the target.'];
  } else if (state.goal === 'cut' && state.percent >= 70) {
    lines = [state.dialogue, "Our cut diary is getting close to its target. I'm settling in for some head rubs.", "Paws on the dashboard—we're nearly at today's cut target!"];
  } else if (state.percent > 110) {
    lines = [state.dialogue, "My virtual belly is extra round today. Thanks for keeping the diary honest!", 'Stretch… purr… time for a cozy cat nap.'];
  } else {
    lines = [state.dialogue, state.percent >= 90 ? 'Happy belly, happy tail! Got a head rub for your favorite logging buddy?' : 'Tiny paws, big plans. I follow the meals you log!', 'Psst… my ears accept head rubs at all times.'];
  }
  const index = Number.isFinite(variation) ? Math.abs(Math.floor(variation)) % lines.length : 0;
  return lines[index];
}

/** Mood art follows the saved daily target; affection temporarily cheers every species. */
export function nutritionPetExpression(state: Pick<NutritionPetState, 'target' | 'percent' | 'rhythm'>, petted = false): 'ready' | 'hungry' | 'happy' | 'full' {
  if (petted) return 'happy';
  if (!Number.isFinite(state.target) || state.target <= 0 || !Number.isFinite(state.percent)) return 'ready';
  if (state.rhythm) return state.rhythm.expression;
  // Keep exact target boundaries stable after ratio-to-percentage rounding.
  if (state.percent < 90 - 1e-8) return 'hungry';
  if (state.percent > 110 + 1e-8) return 'full';
  return 'happy';
}

export type PetRhythm = {
  period: 'Night' | 'Morning' | 'Afternoon' | 'Evening';
  expectedPercent: number;
  minutesSinceLog: number | null;
  lastLogLabel: string;
  reason: string;
  expression: 'ready' | 'hungry' | 'happy' | 'full';
};

const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

/** A loose virtual-pet rhythm, not a meal schedule or a human hunger estimate.
 * Local-time anchors interpolate smoothly. Only a long gap AND a substantial
 * diary shortfall lower mood; reaching the target always takes precedence.
 * No mood, timers or penalties are stored: edits, midnight and account changes
 * are fully recomputed from that account's current diary.
 */
function applyDailyRhythm(state: NutritionPetState, meals: readonly PetMeal[], today: string, now: Date): NutritionPetState {
  if (!Number.isFinite(now.getTime()) || localDay(now) !== today || !state.target) return state;
  const hour = now.getHours() + now.getMinutes()/60;
  const night = hour < 7 || hour >= 23;
  const period: PetRhythm['period'] = night ? 'Night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  const anchors = [[7,0],[10,.15],[14,.45],[18,.70],[21,.95],[23,1]];
  let expected = hour < 7 ? 0 : 1;
  for (let i = 1; i < anchors.length; i++) {
    const [a, x] = anchors[i-1], [b, y] = anchors[i];
    if (hour >= a && hour < b) { expected = x+(y-x)*(hour-a)/(b-a); break; }
  }
  const ids = new Set(state.todayMealIds);
  let last: number | null = null;
  const visited = new Set<string>();
  for (const meal of meals) {
    if (!meal || !ids.has(meal.id) || visited.has(meal.id) || meal.dateKey !== today || !Number.isFinite(meal.calories) || meal.calories < 0) continue;
    visited.add(meal.id);
    if (!(meal.calories > 0) || !Number.isFinite(meal.timestamp)) continue;
    const time = meal.timestamp!;
    if (time > now.getTime() || localDay(new Date(time)) !== today) continue;
    last = Math.max(last ?? time, time);
  }
  const minutes = last === null ? null : Math.max(0, (now.getTime()-last)/60000);
  // Untimed legacy entries receive no fabricated timestamp or fresh-log bonus.
  const gap = minutes ?? (state.calories > 0 ? 0 : Math.max(0, (hour-9)*60));
  const lag = Math.max(0, expected-state.percent/100);
  const plan = state.goal === 'bulk' ? 'bulk' : state.goal === 'cut' ? 'cut' : 'maintenance';
  let mood: PetMood, label: string, dialogue: string, reason: string;
  let expression: PetRhythm['expression'] = 'happy';
  if (night) {
    mood='sleepy'; label='Winding down'; expression='ready';
    dialogue="Yawn... I'm getting cozy. No late-night diary catch-up needed; we'll find our rhythm tomorrow.";
    reason='Quiet hours: Pip rests from 11 pm to 7 am. Logging is always available.';
  } else if (state.percent > 110+1e-8) {
    mood=state.percent > 130 ? 'stuffed' : 'full'; label='A full little companion'; expression='full';
    dialogue="Oof, my virtual belly is full. Bigger days happen! Keep the diary honest; no need to make up for it tomorrow.";
    reason='Your diary is above the saved daily target. This changes Pip’s expression, never your goal.';
  } else if (state.percent >= 90-1e-8) {
    mood='satisfied'; label='Content and cozy';
    dialogue=state.goal === 'cut' ? "Our cut diary is around its target. I'll take head rubs! Still log anything else you eat." : `Our ${plan} diary is around its target. Happy belly, happy companion!`;
    reason='Near your daily target: Pip stays content even if the last log was hours ago.';
  } else if (minutes !== null && minutes <= 45) {
    mood='recovering'; label='Perking back up';
    dialogue="A meal in the diary! My ears are perking up. Thanks for checking in with me.";
    reason='A recent meal log gives Pip a 45-minute cheerful recovery window.';
  } else if (hour < 10) {
    mood='cheerful'; label='A happy start';
    dialogue=`Good morning! A fresh start for our ${plan} plan. I'm happy to keep you company.`;
    reason='Morning grace period: an empty diary does not make Pip sad.';
  } else if (lag >= .30 && gap >= 360) {
    mood='low'; label='Missing our rhythm'; expression='hungry';
    dialogue=state.goal === 'bulk' ? "My little ears are drooping. Our bulk diary has been quiet a while. Have any meals gone unlogged?" : "I'm a little subdued after a quiet diary day. Did a meal miss the log? A head rub is welcome, too.";
    reason='A long logging gap and a large gap from the daytime rhythm make Pip look sad.';
  } else if (lag >= .20 && gap >= 240) {
    mood='hungry'; label='A quiet little tummy'; expression='hungry';
    dialogue=state.goal === 'bulk' ? "Rumble... our bulk diary is quieter than usual for this time of day. Anything to log?" : "My virtual tummy is a little quiet. If you've eaten, shall we catch the diary up?";
    reason='Several hours without a meal log, with progress behind Pip’s loose daytime rhythm.';
  } else if (lag >= .12 && gap >= 120) {
    mood='curious'; label='Looking for a check-in'; expression='ready';
    dialogue="Psst... how's your day going? Any meals missing from our diary?";
    reason='A gentle check-in before Pip gets subdued. No calories need to be added just for Pip.';
  } else {
    mood='energized'; label='In our rhythm';
    dialogue=`Feeling bright! Our ${plan} diary is finding its rhythm. Got a head rub for me?`;
    reason='Recent logging or comfortable daytime progress keeps Pip cheerful.';
  }
  const lastLogLabel = minutes === null ? state.calories > 0 ? 'Meal time unavailable' : 'No meals logged today'
    : minutes < 1 ? 'Meal logged just now' : minutes < 60 ? `Last meal log ${Math.floor(minutes)}m ago`
    : `Last meal log ${Math.floor(minutes/60)}h ${Math.floor(minutes%60)}m ago`;
  return {...state, mood, label, dialogue, rhythm: {period, expectedPercent: expected*100, minutesSinceLog: minutes, lastLogLabel, reason, expression}};
}

function rhythmDialogue(state: NutritionPetState, plan: string): string[] {
  switch (state.mood) {
    case 'sleepy': return ["Sleepy paws, soft snores. I'll keep your place until morning.", 'The diary is here whenever you want it. I can rest while you log.'];
    case 'cheerful': return [`Tiny paws, fresh day! Our ${plan} target stays just as you set it.`, 'No rush from me this morning. Head rubs are a lovely way to start.'];
    case 'curious': return ['A little diary check-in would be lovely, if there is anything to log.', 'Missing logs do not tell me whether you ate. I only follow the diary.'];
    case 'hungry': case 'low': return [state.goal === 'bulk' ? 'Bulk buddy checking in. Have any meals missed the diary today?' : 'A quiet diary makes my virtual ears droop. Log a real meal whenever you are ready.', 'I still love head rubs. No eating extra just to cheer me up.'];
    case 'recovering': return ['My little spark is coming back! A diary check-in always makes me perk up.', 'Thanks for the update. My paws are ready for some company.'];
    case 'satisfied': return [state.goal === 'cut' ? 'Cut target close by! My snack paws can rest; keep logging honestly.' : `Cozy paws! Our ${plan} diary is close to the target.`, 'Content little belly. Head rubs welcome, as always.'];
    case 'full': case 'stuffed': return ['Full virtual belly, same favorite human. Every real meal still belongs in the diary.', 'One day does not change our friendship. A cozy head rub sounds nice.'];
    default: return [`Our ${plan} diary is moving along. I'm feeling good!`, 'Happy paws, happy company. Let’s keep the diary honest.'];
  }
}
