import type { DietGoal, MealLog } from './nutritionStorage';

export type PetMood = 'ready' | 'hungry' | 'peckish' | 'energized' | 'satisfied' | 'full' | 'stuffed';
type PetMeal = Pick<MealLog, 'id' | 'dateKey' | 'calories'>;
export type NutritionPetState = {
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
export function computeNutritionPet(meals: readonly PetMeal[], dailyTarget: number, goal: DietGoal, today: string): NutritionPetState {
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
  const mood: PetMood = !target || calories === 0 ? 'ready' : ratio < .35 ? 'hungry' : ratio < .7 ? 'peckish' : ratio < .9 ? 'energized' : ratio <= 1.1 ? 'satisfied' : ratio <= 1.3 ? 'full' : 'stuffed';
  const label: Record<PetMood, string> = { ready: 'Ready for today', hungry: 'A little hungry', peckish: 'Getting fueled', energized: 'Feeling energized', satisfied: 'Happy belly', full: 'Feeling full', stuffed: 'Very full' };
  const plan = goal === 'cut' ? 'cut' : goal === 'bulk' ? 'bulk' : 'maintenance';
  const dialogue: Record<PetMood, string> = {
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
  return { mood, label: label[mood], dialogue: target ? dialogue[mood] : 'Set a daily calorie target so I can follow your plan.', calories, target,
    percent: ratio*100, goal, todayMealIds: ids, loggedDays: days.size, streak,
    level: 1+Math.floor(days.size/3), careProgress: (days.size%3)/3, daysToNextLevel: 3-days.size%3,
    bellyScale: Math.min(1.13, .96+Math.min(1.4, ratio)*.12) };
}
