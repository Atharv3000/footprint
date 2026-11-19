import { loadAllStepData, parseDate } from './stepsStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadWalks } from './walkStorage';

export type BadgeTier = 'bronze' | 'silver' | 'gold';

export interface BadgeDefinition {
  id: string;
  title: string;
  category: 'steps' | 'walks' | 'streak' | 'distance' | 'time';
  icon: string; // Ionicons name
  description: string;
  bronzeTarget: number;
  silverTarget: number;
  goldTarget: number;
  unit: string;
  currentValue: number;
  currentTier: BadgeTier | null;
  progressPercent: number; // 0 to 100 towards next tier
  nextTierTarget: number;
  earnedDate?: string;
}

export interface UserStatsForBadges {
  totalSteps: number;
  totalWalks: number;
  totalDistanceKm: number;
  consecutiveStreakDays: number;
  singleDayRecordSteps: number;
  longestWalkMinutes: number;
  totalCaloriesBurned?: number;
  paceRecordMinPerKm?: number;
  elevationMeters?: number;
  fastWalkSessions?: number;
}

const STEPS_STORAGE_PREFIX = '@stridetrack_steps_';

export async function getUserBadgeStats(userId: string): Promise<UserStatsForBadges> {
  let totalSteps = 0;
  let singleDayRecordSteps = 0;
  let consecutiveStreakDays = 0;

  try {
    const map = await loadAllStepData(userId);
    const rawSteps = JSON.stringify(map);
    if (rawSteps) {

      const days = Object.keys(map).sort();
      let currentStreak = 0;
      let previousDay: string | null = null;

      for (const day of days) {
        const s = map[day]?.totalSteps || 0;
        totalSteps += s;
        if (s > singleDayRecordSteps) {
          singleDayRecordSteps = s;
        }
        if (s >= 5000) {
          const expected = parseDate(day); expected.setDate(expected.getDate() - 1);
          if (!previousDay || parseDate(previousDay).getTime() !== expected.getTime()) currentStreak = 0;
          currentStreak++;
          if (currentStreak > consecutiveStreakDays) {
            consecutiveStreakDays = currentStreak;
          }
        } else {
          currentStreak = 0;
        }
        previousDay = day;
      }
    }
  } catch (e) {
    console.warn('Failed loading steps for badges:', e);
  }

  // Load walk records
  let totalWalks = 0;
  let totalDistanceKm = 0;
  let longestWalkMinutes = 0;
  let fastWalkSessions = 0;

  try {
    const walks = await loadWalks(userId);
    totalWalks = walks.length;
    for (const w of walks) {
      if (w.distanceMeters > 0 && w.durationSeconds > 0 && (w.durationSeconds / 60) / (w.distanceMeters / 1000) <= 10) fastWalkSessions++;
      totalDistanceKm += (w.distanceMeters || 0) / 1000;
      const mins = Math.round((w.durationSeconds || 0) / 60);
      if (mins > longestWalkMinutes) {
        longestWalkMinutes = mins;
      }
    }
  } catch (e) {
    console.warn('Failed loading walks for badges:', e);
  }

  return {
    totalSteps,
    totalWalks: totalWalks,
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
    consecutiveStreakDays: consecutiveStreakDays,
    singleDayRecordSteps: singleDayRecordSteps,
    longestWalkMinutes: longestWalkMinutes,
    totalCaloriesBurned: Math.round(totalSteps * 0.04),
    paceRecordMinPerKm: 0,
    elevationMeters: 0,
    fastWalkSessions,
  };
}

export function computeBadges(stats: UserStatsForBadges): BadgeDefinition[] {
  const configs = [
    {
      id: 'lifetime_steps',
      title: 'Pathfinder',
      category: 'steps' as const,
      icon: 'footsteps',
      description: 'Accumulate total lifetime steps across all recorded days.',
      unit: 'steps',
      val: stats.totalSteps,
      bronze: 100000,
      silver: 250000,
      gold: 1000000,
    },
    {
      id: 'walk_sessions',
      title: 'Trek Master',
      category: 'walks' as const,
      icon: 'map',
      description: 'Complete verified outdoor walking routes.',
      unit: 'walks',
      val: stats.totalWalks,
      bronze: 5,
      silver: 20,
      gold: 50,
    },
    {
      id: 'distance_pioneer',
      title: 'Horizon Seeker',
      category: 'distance' as const,
      icon: 'earth',
      description: 'Traverse overall distance across all terrains.',
      unit: 'km',
      val: stats.totalDistanceKm,
      bronze: 20,
      silver: 100,
      gold: 300,
    },
    {
      id: 'streak_warrior',
      title: 'Streak Titan',
      category: 'streak' as const,
      icon: 'flame',
      description: 'Hit 5,000+ daily steps in continuous consecutive days.',
      unit: 'days',
      val: stats.consecutiveStreakDays,
      bronze: 3,
      silver: 7,
      gold: 30,
    },
    {
      id: 'daily_peak',
      title: 'Apex Strider',
      category: 'steps' as const,
      icon: 'flash',
      description: 'Achieve a record single-day step milestone.',
      unit: 'steps',
      val: stats.singleDayRecordSteps,
      bronze: 10000,
      silver: 15000,
      gold: 25000,
    },
    {
      id: 'endurance_voyager',
      title: 'Endurance Pioneer',
      category: 'time' as const,
      icon: 'hourglass',
      description: 'Longest continuous recorded walking duration.',
      unit: 'min',
      val: stats.longestWalkMinutes,
      bronze: 30,
      silver: 60,
      gold: 120,
    },
    {
      id: 'calorie_crusher',
      title: 'Calorie Crusher',
      category: 'streak' as const,
      icon: 'bonfire',
      description: 'Burn active energy through workouts and daily strides.',
      unit: 'kcal',
      val: stats.totalCaloriesBurned ?? Math.round(stats.totalSteps * 0.04),
      bronze: 1000,
      silver: 5000,
      gold: 20000,
    },
    {
      id: 'speed_demon',
      title: 'Tempo Master',
      category: 'time' as const,
      icon: 'speedometer',
      description: 'Complete high-cadence power walks and sustained pace sessions.',
      unit: 'sessions',
      val: stats.fastWalkSessions ?? 0,
      bronze: 3,
      silver: 10,
      gold: 25,
    },
    {
      id: 'summit_conqueror',
      title: 'Summit Peak',
      category: 'distance' as const,
      icon: 'trophy',
      description: 'Climb cumulative vertical incline and elevation gain.',
      unit: 'm',
      val: stats.elevationMeters ?? 0,
      bronze: 100,
      silver: 500,
      gold: 1500,
    },
  ];

  return configs.map((c) => {
    let currentTier: BadgeTier | null = null;
    let nextTierTarget = c.bronze;
    let progressPercent = 0;

    if (c.val >= c.gold) {
      currentTier = 'gold';
      nextTierTarget = c.gold;
      progressPercent = 100;
    } else if (c.val >= c.silver) {
      currentTier = 'silver';
      nextTierTarget = c.gold;
      const range = c.gold - c.silver;
      const progress = c.val - c.silver;
      progressPercent = Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
    } else if (c.val >= c.bronze) {
      currentTier = 'bronze';
      nextTierTarget = c.silver;
      const range = c.silver - c.bronze;
      const progress = c.val - c.bronze;
      progressPercent = Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
    } else {
      currentTier = null;
      nextTierTarget = c.bronze;
      progressPercent = Math.min(100, Math.max(0, Math.round((c.val / c.bronze) * 100)));
    }

    const earnedDate: string | undefined = undefined;

    return {
      id: c.id,
      title: c.title,
      category: c.category,
      icon: c.icon,
      description: c.description,
      bronzeTarget: c.bronze,
      silverTarget: c.silver,
      goldTarget: c.gold,
      unit: c.unit,
      currentValue: c.val,
      currentTier,
      progressPercent,
      nextTierTarget,
      earnedDate,
    };
  });
}

export const TIER_METALLIC = {
  gold: {
    base: '#f59e0b',
    glow: '#fbbf24',
    border: '#d97706',
    bg: 'rgba(245, 158, 11, 0.14)',
    label: 'GOLD',
    gradientDark: '#78350f',
  },
  silver: {
    base: '#94a3b8',
    glow: '#cbd5e1',
    border: '#64748b',
    bg: 'rgba(148, 163, 184, 0.14)',
    label: 'SILVER',
    gradientDark: '#334155',
  },
  bronze: {
    base: '#d97706',
    glow: '#b45309',
    border: '#92400e',
    bg: 'rgba(217, 119, 6, 0.14)',
    label: 'BRONZE',
    gradientDark: '#451a03',
  },
  unearned: {
    base: '#52525b',
    glow: '#71717a',
    border: '#3f3f46',
    bg: 'rgba(82, 82, 91, 0.1)',
    label: 'IN PROGRESS',
    gradientDark: '#27272a',
  },
};
