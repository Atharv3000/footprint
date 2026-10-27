export type MuscleGroupKey =
  | 'chest'
  | 'lats'
  | 'upper_back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves';

export interface MuscleRecoveryStatus {
  muscle: MuscleGroupKey;
  label: string;
  hoursElapsed: number;
  recoveryPercent: number; // 0 to 100
  isSore: boolean;
  status: 'sore' | 'recovering' | 'ready';
  statusColor: string;
  statusText: string;
  lastTrainedDate?: string;
  hoursUntilRecovered: number;
  lastExerciseName?: string;
}

// Typical full recovery window per muscle group (in hours)
export const MUSCLE_RECOVERY_HOURS: Record<MuscleGroupKey, number> = {
  chest: 48,
  lats: 48,
  upper_back: 48,
  shoulders: 36,
  biceps: 36,
  triceps: 36,
  forearms: 24,
  abs: 24,
  quads: 72,
  hamstrings: 72,
  glutes: 60,
  calves: 36,
};

export const MUSCLE_LABELS: Record<MuscleGroupKey, string> = {
  chest: 'Chest / Pectorals',
  lats: 'Lats (Latissimus)',
  upper_back: 'Upper Back & Traps',
  shoulders: 'Shoulders / Delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs & Core',
  quads: 'Quadriceps',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
};

// Maps exercise ID to targeted muscles
export function getExerciseMuscles(exerciseId: string, category?: string): MuscleGroupKey[] {
  const id = exerciseId.toLowerCase();

  // Specific chest exercises
  if (id.includes('bench') || id.includes('chest') || id.includes('fly') || id.includes('pec')) {
    if (id.includes('close_grip')) return ['triceps', 'chest'];
    return ['chest', 'triceps'];
  }
  if (id.includes('pushup')) {
    if (id.includes('diamond')) return ['triceps', 'chest'];
    return ['chest', 'triceps', 'abs'];
  }
  if (id.includes('dips')) return ['chest', 'triceps', 'shoulders'];

  // Specific back exercises
  if (id.includes('deadlift')) {
    if (id.includes('romanian') || id.includes('rdl')) return ['hamstrings', 'glutes', 'upper_back'];
    return ['upper_back', 'lats', 'glutes', 'hamstrings', 'forearms'];
  }
  if (id.includes('pull_up') || id.includes('chin_up') || id.includes('pulldown')) {
    return ['lats', 'upper_back', 'biceps', 'forearms'];
  }
  if (id.includes('row')) {
    return ['upper_back', 'lats', 'biceps', 'forearms'];
  }
  if (id.includes('shrug') || id.includes('face_pull') || id.includes('hyperextension') || id.includes('good_morning')) {
    return ['upper_back'];
  }

  // Specific leg exercises
  if (id.includes('squat')) {
    if (id.includes('front')) return ['quads', 'abs'];
    return ['quads', 'glutes', 'calves'];
  }
  if (id.includes('leg_press') || id.includes('leg_extension')) {
    return ['quads'];
  }
  if (id.includes('hamstring') || id.includes('leg_curl')) {
    return ['hamstrings'];
  }
  if (id.includes('hip_thrust') || id.includes('glute_bridge')) {
    return ['glutes', 'hamstrings'];
  }
  if (id.includes('lunge') || id.includes('step_up') || id.includes('split_squat')) {
    return ['quads', 'glutes', 'hamstrings'];
  }
  if (id.includes('calf')) {
    return ['calves'];
  }

  // Specific shoulder exercises
  if (id.includes('overhead') || id.includes('military') || id.includes('push_press') || (id.includes('press') && !id.includes('bench') && !id.includes('leg'))) {
    return ['shoulders', 'triceps'];
  }
  if (id.includes('lateral_raise') || id.includes('front_raise') || id.includes('rear_delt') || id.includes('upright_row') || id.includes('lu_raise')) {
    return ['shoulders'];
  }

  // Specific arm exercises
  if (id.includes('bicep') || (id.includes('curl') && !id.includes('leg') && !id.includes('wrist'))) {
    return ['biceps', 'forearms'];
  }
  if (id.includes('tricep') || id.includes('skull_crusher') || id.includes('kickback')) {
    return ['triceps'];
  }
  if (id.includes('wrist') || id.includes('forearm')) {
    return ['forearms'];
  }

  // Specific core exercises
  if (id.includes('plank') || id.includes('crunch') || id.includes('twist') || id.includes('leg_raise') || id.includes('situp') || id.includes('wheel') || id.includes('dead_bug') || id.includes('woodchopper')) {
    return ['abs'];
  }

  // Specific cardio exercises
  if (id.includes('jump_rope') || id.includes('box_jump')) {
    return ['calves', 'quads'];
  }
  if (id.includes('burpee') || id.includes('mountain_climber')) {
    return ['quads', 'abs', 'chest', 'shoulders'];
  }
  if (id.includes('kettlebell')) {
    return ['glutes', 'hamstrings', 'upper_back'];
  }
  if (id.includes('rowing')) {
    return ['lats', 'quads', 'biceps'];
  }

  // Fallback by general category
  if (category === 'chest') return ['chest', 'triceps'];
  if (category === 'back') return ['upper_back', 'lats', 'biceps'];
  if (category === 'legs') return ['quads', 'hamstrings', 'glutes', 'calves'];
  if (category === 'shoulders') return ['shoulders'];
  if (category === 'arms') return ['biceps', 'triceps'];
  if (category === 'core') return ['abs'];
  return ['quads', 'calves'];
}

export function computeMuscleRecoveryMap(
  logs: { exerciseId: string; exerciseName?: string; date: string }[],
  manualOverrides?: Record<string, number>
): Record<MuscleGroupKey, MuscleRecoveryStatus> {
  const now = Date.now();
  const allMuscles: MuscleGroupKey[] = [
    'chest',
    'lats',
    'upper_back',
    'shoulders',
    'biceps',
    'triceps',
    'forearms',
    'abs',
    'quads',
    'hamstrings',
    'glutes',
    'calves',
  ];

  // Track most recent workout date & exercise per muscle group
  const muscleLatestMap: Partial<Record<MuscleGroupKey, { time: number; iso: string; exName: string }>> = {};

  for (const log of logs) {
    const logTime = new Date(log.date).getTime();
    if (isNaN(logTime) || logTime > now) continue;

    const targeted = getExerciseMuscles(log.exerciseId);
    for (const m of targeted) {
      if (!muscleLatestMap[m] || logTime > muscleLatestMap[m]!.time) {
        muscleLatestMap[m] = {
          time: logTime,
          iso: log.date,
          exName: log.exerciseName || log.exerciseId,
        };
      }
    }
  }

  const result: Partial<Record<MuscleGroupKey, MuscleRecoveryStatus>> = {};

  for (const m of allMuscles) {
    const latest = muscleLatestMap[m];
    const fullHours = MUSCLE_RECOVERY_HOURS[m];
    const hasManualOverride = manualOverrides && typeof manualOverrides[m] === 'number';

    if (!latest && !hasManualOverride) {
      // Never trained or fully rested
      result[m] = {
        muscle: m,
        label: MUSCLE_LABELS[m],
        hoursElapsed: 999,
        recoveryPercent: 100,
        isSore: false,
        status: 'ready',
        statusColor: '#10b981', // Clean Emerald Green
        statusText: '100% Ready (Fresh)',
        hoursUntilRecovered: 0,
      };
      continue;
    }

    const elapsedMs = latest ? now - latest.time : 0;
    const hoursElapsed = latest ? Math.max(0, elapsedMs / (1000 * 60 * 60)) : 0;
    const recoveryRatio = Math.min(1, hoursElapsed / fullHours);

    // Apply manual override if set by user
    const recoveryPercent = hasManualOverride
      ? Math.max(0, Math.min(100, Math.round(manualOverrides![m])))
      : Math.round(recoveryRatio * 100);

    const hoursUntilRecovered = Math.max(
      0,
      Math.round(fullHours * (1 - recoveryPercent / 100))
    );

    let status: 'sore' | 'recovering' | 'ready';
    let statusColor: string;
    let statusText: string;

    if (recoveryPercent < 55) {
      status = 'sore';
      statusColor = '#ef4444'; // Red (Peak Soreness / DOMS)
      statusText = `Sore (${hoursUntilRecovered}h left)`;
    } else if (recoveryPercent < 90) {
      status = 'recovering';
      statusColor = '#f59e0b'; // Amber / Yellow (Recovering)
      statusText = `Recovering (${hoursUntilRecovered}h left)`;
    } else {
      status = 'ready';
      statusColor = '#10b981'; // Green (Ready)
      statusText = '100% Ready';
    }

    result[m] = {
      muscle: m,
      label: MUSCLE_LABELS[m],
      hoursElapsed: Math.round(hoursElapsed),
      recoveryPercent,
      isSore: status === 'sore',
      status,
      statusColor,
      statusText,
      lastTrainedDate: latest?.iso,
      hoursUntilRecovered,
      lastExerciseName: latest?.exName,
    };
  }

  return result as Record<MuscleGroupKey, MuscleRecoveryStatus>;
}
