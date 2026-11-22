import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, saveUserProfile } from './userProfile';
import { dateString, ensureMockDataSeeded } from './stepsStorage';
import {
  saveWorkoutLog,
  recordWeightLog,
  recordBodyFatLog,
  saveCustomRoutines,
  DEFAULT_CUSTOM_ROUTINES,
  saveProgressPhoto,
  ProgressPhoto,
} from './workoutStorage';
import { saveWalk } from './walkStorage';
import { saveMealLog, saveDailyWater, saveNutritionTargets } from './nutritionStorage';

export const DEMO_ACCOUNT = {
  name: 'Alex Mercer',
  email: 'alex.mercer@stridetrack.app',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop',
};

const DEMO_SEEDED_FLAG_KEY = `@stridetrack_demo_seeded_v3_${DEMO_ACCOUNT.email}`;

/**
 * Preloads realistic, rich fitness stats and activity history for the demo account
 */
export async function preloadDemoAccountData(userId: string = DEMO_ACCOUNT.email): Promise<void> {
  try {
    const alreadySeeded = await AsyncStorage.getItem(DEMO_SEEDED_FLAG_KEY);
    if (alreadySeeded) return;

    // 1. Profile biometrics
    const demoProfile: UserProfile = {
      isLoggedIn: true,
      name: DEMO_ACCOUNT.name,
      email: DEMO_ACCOUNT.email,
      authProvider: 'email' as any,
      weightKg: 78.5,       // ~173 lbs
      heightCm: 180,        // 5'11"
      heightFeet: 5,
      heightInches: 11,
      age: 26,
      gender: 'male',
      unitSystem: 'us_customary',
      hasCompletedSetup: true,
      joinedAt: 'January 2026',
      stepsGoal: 10000,
      distanceGoalKm: 7.0,
      targetWeightKg: 76.0,
      weightGoalPace: 'steady',
    };
    await saveUserProfile(demoProfile);

    // 2. Nutrition targets & daily logs
    await saveNutritionTargets({
      dailyCalories: 2450,
      proteinGrams: 185,
      carbsGrams: 240,
      fatGrams: 70,
      waterGoalMl: 3200,
    });

    const todayStr = dateString(0);
    const yesterdayStr = dateString(-1);

    await saveDailyWater(todayStr, 2250);
    await saveDailyWater(yesterdayStr, 3100);

    await saveMealLog({
      id: `meal_demo_1_${Date.now()}`,
      timestamp: Date.now() - 1000 * 60 * 60 * 6,
      dateKey: todayStr,
      mealType: 'breakfast',
      title: 'Scrambled Eggs, Avocado Toast & Berries',
      calories: 540,
      proteinG: 34,
      carbsG: 48,
      fatG: 22,
      items: [
        { id: 'item_1', name: 'Eggs (3 large)', portion: '3 eggs', calories: 215, proteinG: 18, carbsG: 2, fatG: 15 },
        { id: 'item_2', name: 'Sourdough Toast with Avocado', portion: '2 slices', calories: 240, proteinG: 8, carbsG: 36, fatG: 7 },
        { id: 'item_3', name: 'Fresh Blueberries', portion: '1 cup', calories: 85, proteinG: 1, carbsG: 21, fatG: 0 },
      ],
      aiAnalyzed: true,
      notes: 'Post-run breakfast high in protein',
    });

    await saveMealLog({
      id: `meal_demo_2_${Date.now()}`,
      timestamp: Date.now() - 1000 * 60 * 60 * 2,
      dateKey: todayStr,
      mealType: 'lunch',
      title: 'Grilled Salmon Quinoa Bowl',
      calories: 680,
      proteinG: 48,
      carbsG: 62,
      fatG: 24,
      items: [
        { id: 'item_4', name: 'Atlantic Salmon Fillet', portion: '200g', calories: 410, proteinG: 42, carbsG: 0, fatG: 26 },
        { id: 'item_5', name: 'Fluffy Quinoa & Steamed Greens', portion: '1 bowl', calories: 270, proteinG: 6, carbsG: 62, fatG: 2 },
      ],
      aiAnalyzed: true,
    });

    // 3. Step history (past 35 days)
    await ensureMockDataSeeded(userId, 10000);

    // 4. Weight history & trend logs (over past month showing steady progress)
    const now = Date.now();
    await recordWeightLog(userId, 81.2, new Date(now - 1000 * 60 * 60 * 24 * 28).toISOString());
    await recordWeightLog(userId, 80.5, new Date(now - 1000 * 60 * 60 * 24 * 21).toISOString());
    await recordWeightLog(userId, 79.8, new Date(now - 1000 * 60 * 60 * 24 * 14).toISOString());
    await recordWeightLog(userId, 79.1, new Date(now - 1000 * 60 * 60 * 24 * 7).toISOString());
    await recordWeightLog(userId, 78.5, new Date(now).toISOString());

    // 5. Body Fat % Scans (AI Vision physique scans)
    await recordBodyFatLog(userId, 13.8, {
      weightKg: 79.8,
      method: 'ai_scan',
      date: new Date(now - 1000 * 60 * 60 * 24 * 14).toISOString(),
    });
    await recordBodyFatLog(userId, 13.2, {
      weightKg: 78.5,
      method: 'ai_scan',
      date: new Date(now).toISOString(),
    });

    // 6. Workout History (Weight training & AI camera reps)
    await saveCustomRoutines(userId, DEFAULT_CUSTOM_ROUTINES);

    const yesterdayIso = new Date(now - 1000 * 60 * 60 * 24).toISOString();
    const threeDaysAgoIso = new Date(now - 1000 * 60 * 60 * 72).toISOString();
    const fiveDaysAgoIso = new Date(now - 1000 * 60 * 60 * 120).toISOString();

    // Chest & Triceps session (yesterday)
    await saveWorkoutLog(userId, {
      exerciseId: 'bench_press',
      exerciseName: 'Barbell Bench Press',
      reps: 10,
      weight: 195,
      weightUnit: 'lb',
      date: yesterdayIso,
      notes: 'Strong top set of 10 reps',
    });
    await saveWorkoutLog(userId, {
      exerciseId: 'incline_dumbbell_press',
      exerciseName: 'Incline Dumbbell Press',
      reps: 12,
      weight: 70,
      weightUnit: 'lb',
      date: yesterdayIso,
    });
    await saveWorkoutLog(userId, {
      exerciseId: 'pushups',
      exerciseName: 'Push-Ups (AI Camera)',
      reps: 32,
      weight: 0,
      weightUnit: 'lb',
      date: yesterdayIso,
      aiTracked: true,
      trackingData: {
        exerciseType: 'pushups',
        repCount: 32,
        averageFormScore: 94,
        formAdvice: ['Full lock-out maintained', 'Consistent chest depth'],
        feedbackHighlights: ['Excellent tempo', 'Core tension held throughout'],
        durationSeconds: 52,
      },
    });

    // Back & Biceps (3 days ago)
    await saveWorkoutLog(userId, {
      exerciseId: 'deadlifts',
      exerciseName: 'Barbell Deadlift',
      reps: 6,
      weight: 315,
      weightUnit: 'lb',
      date: threeDaysAgoIso,
    });
    await saveWorkoutLog(userId, {
      exerciseId: 'pullups',
      exerciseName: 'Bodyweight Pull-Ups',
      reps: 14,
      weight: 0,
      weightUnit: 'lb',
      date: threeDaysAgoIso,
    });
    await saveWorkoutLog(userId, {
      exerciseId: 'bicep_curls',
      exerciseName: 'Dumbbell Bicep Curls (AI Camera)',
      reps: 15,
      weight: 35,
      weightUnit: 'lb',
      date: threeDaysAgoIso,
      aiTracked: true,
      trackingData: {
        exerciseType: 'bicep_curls',
        repCount: 15,
        averageFormScore: 92,
        formAdvice: ['Full elbow flexion', 'Zero torso momentum'],
        feedbackHighlights: ['Clean concentric squeeze'],
        durationSeconds: 44,
      },
    });

    // Leg Day (5 days ago)
    await saveWorkoutLog(userId, {
      exerciseId: 'squats',
      exerciseName: 'Barbell Back Squat',
      reps: 8,
      weight: 245,
      weightUnit: 'lb',
      date: fiveDaysAgoIso,
    });
    await saveWorkoutLog(userId, {
      exerciseId: 'leg_press',
      exerciseName: 'Leg Press',
      reps: 12,
      weight: 410,
      weightUnit: 'lb',
      date: fiveDaysAgoIso,
    });

    // 7. Recorded Walks & Outdoor GPS Runs
    await saveWalk(userId, {
      activityType: 'run',
      durationSeconds: 1980, // 33m
      distanceMeters: 5600,  // 5.6 km
      calories: 465,
      steps: 5980,
      avgPace: "5'54\"",
      label: 'Golden Gate Sunset Run',
      routeCoordinates: [
        { latitude: 37.8024, longitude: -122.4367 },
        { latitude: 37.8085, longitude: -122.4552 },
        { latitude: 37.8182, longitude: -122.4782 },
      ],
    });

    await saveWalk(userId, {
      activityType: 'walk',
      durationSeconds: 2400, // 40m
      distanceMeters: 3450,  // 3.45 km
      calories: 215,
      steps: 4320,
      avgPace: "11'36\"",
      label: 'Morning Hill Walk',
      routeCoordinates: [
        { latitude: 37.7689, longitude: -122.4467 },
        { latitude: 37.7712, longitude: -122.4491 },
      ],
    });

    // 8. Progress Transformation Photos
    const progressPhotosList: Array<Omit<ProgressPhoto, 'id'>> = [
      {
        userId,
        uri: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?q=80&w=800&auto=format&fit=crop',
        date: new Date(now).toISOString().split('T')[0],
        createdAt: new Date(now).toISOString(),
        caption: 'Week 12 Shred Peak - Deep ab separation & vascularity',
        weightKg: 78.5,
      },
      {
        userId,
        uri: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=800&auto=format&fit=crop',
        date: new Date(now - 1000 * 60 * 60 * 24 * 28).toISOString().split('T')[0],
        createdAt: new Date(now - 1000 * 60 * 60 * 24 * 28).toISOString(),
        caption: 'Week 8 Cut Check-in - Upper abs showing, waist tightening',
        weightKg: 79.8,
      },
      {
        userId,
        uri: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?q=80&w=800&auto=format&fit=crop',
        date: new Date(now - 1000 * 60 * 60 * 24 * 56).toISOString().split('T')[0],
        createdAt: new Date(now - 1000 * 60 * 60 * 24 * 56).toISOString(),
        caption: 'Week 4 Progress - Chest fuller, starting deficit',
        weightKg: 81.5,
      },
      {
        userId,
        uri: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=800&auto=format&fit=crop',
        date: new Date(now - 1000 * 60 * 60 * 24 * 84).toISOString().split('T')[0],
        createdAt: new Date(now - 1000 * 60 * 60 * 24 * 84).toISOString(),
        caption: 'Day 1 Baseline - Starting bulk transition into cut',
        weightKg: 83.2,
      },
    ];

    const photosStorageKey = `@stridetrack_progress_photos_${userId}`;
    const generatedPhotos: ProgressPhoto[] = progressPhotosList.map((p, i) => ({
      ...p,
      id: `demo_progress_photo_${i + 1}_${Date.now()}`,
    }));
    await AsyncStorage.setItem(photosStorageKey, JSON.stringify(generatedPhotos));

    await AsyncStorage.setItem(DEMO_SEEDED_FLAG_KEY, '1');
    console.log('[DemoAccount] Preloaded full stats, progress photos, workouts, nutrition, and walks for Alex Mercer');
  } catch (err) {
    console.warn('[DemoAccount] Error preloading stats:', err);
  }
}

