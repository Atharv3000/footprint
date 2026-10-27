import AsyncStorage from '@react-native-async-storage/async-storage';

export type UnitSystem = 'metric' | 'us_customary';
export type GenderOption = 'female' | 'male' | 'na';
export type ActivityType = 'walk' | 'run' | 'cycle';

export interface UserProfile {
  isLoggedIn: boolean;
  name: string;
  email: string;
  avatarUrl?: string; // Camera roll avatar or profile picture
  authProvider: 'apple' | 'google' | 'guest';
  weightKg: number; // Canonical in kg
  heightCm: number; // Canonical in cm
  heightFeet?: number; // Exact US Customary feet input
  heightInches?: number; // Exact US Customary inches input
  age: number;
  gender: GenderOption;
  unitSystem: UnitSystem;
  hasCompletedSetup: boolean;
  joinedAt?: string; // e.g. "September 2026"
  stepsGoal: number; // Daily steps goal, default 8000
  distanceGoalKm?: number; // Daily distance goal in km, default 5 (approx 3.1 miles)
}

export const DEFAULT_PROFILE: UserProfile = {
  isLoggedIn: false,
  name: 'Walker',
  email: 'walker@footprint.app',
  avatarUrl: undefined,
  authProvider: 'guest',
  weightKg: 70,    // Standard default ~154 lbs
  heightCm: 175,   // Standard default ~5'9"
  heightFeet: 5,
  heightInches: 9,
  age: 28,
  gender: 'na',
  unitSystem: 'us_customary', // "Customary"
  hasCompletedSetup: false,
  joinedAt: 'September 2026',
  stepsGoal: 8000,
  distanceGoalKm: 5,
};

const STORAGE_KEY = '@footprint_user_profile';

export async function loadUserProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.gender === 'other') parsed.gender = 'na';
      if (!parsed.unitSystem) parsed.unitSystem = 'us_customary';
      return { ...DEFAULT_PROFILE, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load profile', e);
  }
  return DEFAULT_PROFILE;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to save profile', e);
  }
}

// Unit conversion helpers
export const kgToLbs = (kg: number) => Math.round(kg * 2.20462);
export const lbsToKg = (lbs: number) => lbs / 2.20462;
export const cmToInches = (cm: number) => Math.round(cm / 2.54);
export const inchesToCm = (inches: number) => inches * 2.54;
export const metersToKm = (m: number) => m / 1000;
export const metersToMiles = (m: number) => m * 0.000621371;

/**
 * SCIENTIFIC CALORIE BURN CALCULATION
 * Supports Walk, Run, and Cycle using standard Compendium of Physical Activities METs.
 */
export function calculateScientificCaloriesBurned(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: GenderOption,
  durationMinutes: number,
  distanceMeters: number,
  activityType: ActivityType = 'walk'
): number {
  if (durationMinutes <= 0 || weightKg <= 0) return 0;

  const distanceKm = distanceMeters / 1000;
  const speedKmH = durationMinutes > 0 ? (distanceKm / (durationMinutes / 60)) : 4.0;
  let met = 3.5;

  if (activityType === 'run') {
    // Running MET based on speed (Ainsworth et al.)
    if (speedKmH <= 8.0) met = 8.3; // 5 mph
    else if (speedKmH <= 9.7) met = 9.8; // 6 mph
    else if (speedKmH <= 11.3) met = 11.0; // 7 mph
    else if (speedKmH <= 12.9) met = 11.8; // 8 mph
    else met = 12.8;
  } else if (activityType === 'cycle') {
    // Cycling MET based on speed
    if (speedKmH <= 15) met = 4.0; // light leisure
    else if (speedKmH <= 19) met = 6.0; // moderate
    else if (speedKmH <= 22) met = 8.0; // vigorous
    else if (speedKmH <= 25) met = 10.0; // very fast
    else met = 12.0;
  } else {
    // Walking MET (ACSM equation)
    const speedMetersPerMin = (speedKmH * 1000) / 60;
    let vo2 = 0.1 * speedMetersPerMin + 3.5;
    if (speedKmH < 2.0) vo2 = 7.0;
    else if (vo2 < 10.5) vo2 = 10.5;
    else if (vo2 > 24.5) vo2 = 24.5;
    met = vo2 / 3.5;
  }

  // Base kcal per minute = (MET * 3.5 * weightKg) / 200
  let kcalPerMin = (met * 3.5 * weightKg) / 200;

  // Gender & age metabolic rate adjustment
  let demographicMultiplier = 1.0;
  if (gender === 'male') {
    demographicMultiplier = 1.05; // slightly higher lean muscle mass
  } else if (gender === 'female') {
    demographicMultiplier = 0.95;
  }

  // Slight age taper (-2% per decade over 30)
  if (age > 30) {
    const decadesOver30 = (age - 30) / 10;
    demographicMultiplier *= Math.max(0.85, 1.0 - decadesOver30 * 0.02);
  }

  const totalKcal = Math.round(kcalPerMin * demographicMultiplier * durationMinutes);
  return Math.max(0, totalKcal);
}
