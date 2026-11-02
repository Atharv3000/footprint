import { DeviceEventEmitter } from 'react-native';
export const MEAL_LOGS_CHANGED = 'footprint:meal-logs-changed';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';
export type DietGoal = 'cut' | 'maintain' | 'bulk';
export type DietPreference = 'balanced' | 'high_protein' | 'keto' | 'low_fat' | 'custom';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface NutritionTargets {
  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterGoalMl: number;
}

export interface MacroQuizAnswers {
  age: number;
  gender: 'female' | 'male' | 'na';
  weightKg: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  goal: DietGoal;
  dietPreference: DietPreference;
}

export interface FoodItem {
  id: string;
  name: string;
  portion: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  confidence?: number; // 0..1 for AI detections
}

export interface MealLog {
  id: string;
  timestamp: number;
  dateKey: string; // YYYY-MM-DD
  mealType: MealType;
  title: string;
  imageUri?: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: FoodItem[];
  aiAnalyzed?: boolean;
  notes?: string;
}

export interface DailyNutritionSummary {
  dateKey: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  waterMl: number;
  meals: MealLog[];
}

const STORAGE_KEY_TARGETS = '@stridetrack_nutrition_targets';
const STORAGE_KEY_MEALS = '@stridetrack_meal_logs';
const STORAGE_KEY_WATER = '@stridetrack_water_logs';
const STORAGE_KEY_QUIZ = '@stridetrack_macro_quiz';

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  dailyCalories: 2200,
  proteinGrams: 150,
  carbsGrams: 230,
  fatGrams: 70,
  waterGoalMl: 2500,
};

// Calculate BMR and TDEE based on Mifflin-St Jeor Formula
export function calculateMacrosFromQuiz(answers: MacroQuizAnswers): NutritionTargets {
  const { weightKg, heightCm, age, gender, activityLevel, goal, dietPreference } = answers;

  // BMR Calculation (Mifflin-St Jeor)
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === 'female') {
    bmr -= 161;
  } else {
    bmr += 5;
  }

  // Activity Multipliers
  const multipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very_active: 1.725,
  };

  let tdee = bmr * (multipliers[activityLevel] || 1.375);

  // Goal adjustment
  if (goal === 'cut') {
    tdee -= 450; // Moderate 15-20% deficit for fat loss
  } else if (goal === 'bulk') {
    tdee += 350; // Lean surplus for muscle growth
  }

  const dailyCalories = Math.max(1200, Math.round(tdee));

  let proteinGrams = 0;
  let carbsGrams = 0;
  let fatGrams = 0;

  if (dietPreference === 'high_protein') {
    // 2.2g per kg bodyweight
    proteinGrams = Math.round(weightKg * 2.2);
    // 25% fat
    const fatCalories = dailyCalories * 0.25;
    fatGrams = Math.round(fatCalories / 9);
    // Remainder in carbs
    const carbCalories = Math.max(0, dailyCalories - (proteinGrams * 4 + fatCalories));
    carbsGrams = Math.round(carbCalories / 4);
  } else if (dietPreference === 'keto') {
    // 70% fat, 25% protein, 5% carbs
    fatGrams = Math.round((dailyCalories * 0.70) / 9);
    proteinGrams = Math.round((dailyCalories * 0.25) / 4);
    carbsGrams = Math.round((dailyCalories * 0.05) / 4);
  } else if (dietPreference === 'low_fat') {
    // 15% fat, 30% protein, 55% carbs
    fatGrams = Math.round((dailyCalories * 0.15) / 9);
    proteinGrams = Math.round((dailyCalories * 0.30) / 4);
    carbsGrams = Math.round((dailyCalories * 0.55) / 4);
  } else {
    // Balanced (30% Protein, 40% Carbs, 30% Fat)
    proteinGrams = Math.round((dailyCalories * 0.30) / 4);
    carbsGrams = Math.round((dailyCalories * 0.40) / 4);
    fatGrams = Math.round((dailyCalories * 0.30) / 9);
  }

  const waterGoalMl = Math.round(weightKg * 35); // 35ml per kg

  return {
    dailyCalories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    waterGoalMl,
  };
}

export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function loadNutritionTargets(): Promise<NutritionTargets> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_TARGETS);
    if (raw) {
      return { ...DEFAULT_NUTRITION_TARGETS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Error loading nutrition targets:', e);
  }
  return DEFAULT_NUTRITION_TARGETS;
}

export async function saveNutritionTargets(targets: NutritionTargets): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_TARGETS, JSON.stringify(targets));
  } catch (e) {
    console.error('Error saving nutrition targets:', e);
  }
}

export async function loadSavedQuiz(): Promise<MacroQuizAnswers | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_QUIZ);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading quiz:', e);
  }
  return null;
}

export async function saveQuizAnswers(quiz: MacroQuizAnswers): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_QUIZ, JSON.stringify(quiz));
  } catch (e) {
    console.error('Error saving quiz:', e);
  }
}

export async function loadMealLogs(dateKey?: string): Promise<MealLog[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_MEALS);
    const allMeals: MealLog[] = raw ? JSON.parse(raw) : [];
    if (dateKey) {
      return allMeals.filter((m) => m.dateKey === dateKey);
    }
    return allMeals;
  } catch (e) {
    console.error('Error loading meal logs:', e);
    return [];
  }
}

export async function saveMealLog(meal: MealLog): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_MEALS);
    const allMeals: MealLog[] = raw ? JSON.parse(raw) : [];
    const existingIndex = allMeals.findIndex((m) => m.id === meal.id);
    if (existingIndex >= 0) {
      allMeals[existingIndex] = meal;
    } else {
      allMeals.unshift(meal);
    }
    await AsyncStorage.setItem(STORAGE_KEY_MEALS, JSON.stringify(allMeals));
    DeviceEventEmitter.emit(MEAL_LOGS_CHANGED);
  } catch (e) {
    console.error('Error saving meal log:', e);
  }
}

export async function deleteMealLog(mealId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_MEALS);
    if (raw) {
      const allMeals: MealLog[] = JSON.parse(raw);
      const filtered = allMeals.filter((m) => m.id !== mealId);
      await AsyncStorage.setItem(STORAGE_KEY_MEALS, JSON.stringify(filtered));
      DeviceEventEmitter.emit(MEAL_LOGS_CHANGED);
    }
  } catch (e) {
    console.error('Error deleting meal log:', e);
  }
}

export async function loadDailyWater(dateKey: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_KEY_WATER}_${dateKey}`);
    return raw ? parseInt(raw, 10) : 0;
  } catch (e) {
    return 0;
  }
}

export async function saveDailyWater(dateKey: string, ml: number): Promise<void> {
  try {
    await AsyncStorage.setItem(`${STORAGE_KEY_WATER}_${dateKey}`, ml.toString());
  } catch (e) {
    console.error('Error saving water:', e);
  }
}
