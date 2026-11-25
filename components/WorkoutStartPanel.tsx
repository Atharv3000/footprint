import { WorkoutRoutineCarousel } from './WorkoutRoutineCarousel';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_ROUNDED_FONT_EXTRA, useTheme } from '@/constants/ThemeContext';
import type { CustomRoutine, WorkoutLogEntry } from '@/constants/workoutStorage';

const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function WorkoutStartPanel({
  routines,
  logs,
  onSelectRoutine,
  onCreateRoutine,
  onOpenSplit,
  initialIndex = 0,
  splitLabel,
}: {
  routines: CustomRoutine[];
  logs: WorkoutLogEntry[];
  onSelectRoutine: (routine: CustomRoutine) => void;
  onCreateRoutine: () => void;
  onOpenSplit?: () => void;
  initialIndex?: number;
  splitLabel?: string;
}) {
  const { colors, isDark } = useTheme();
  const recent = useMemo(() => {
    const history = logs
      .filter(
        (log) =>
          !log.id.startsWith('demo_') &&
          log.exerciseId !== 'boxing' &&
          Number.isFinite(Date.parse(log.date)) &&
          log.reps > 0
      )
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    if (!history.length) return null;
    const date = new Date(history[0].date);
    const day = localDay(date);
    const latest = history.filter((log) => localDay(new Date(log.date)) === day);
    const exercises = new Map<string, { id: string; name: string; sets: number }>();
    for (const log of latest) {
      const previous = exercises.get(log.exerciseId);
      exercises.set(log.exerciseId, {
        id: log.exerciseId,
        name: log.exerciseName,
        sets: (previous?.sets || 0) + 1,
      });
    }
    return {
      date:
        day === localDay(new Date())
          ? 'Today'
          : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      sets: latest.length,
      exercises: [...exercises.values()],
    };
  }, [logs]);

  const ctaForeground = isDark ? '#09090b' : '#ffffff';

  return (
    <View style={s.content}>
      <View
        style={[
          s.card,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        ]}
      >
        <View style={s.headingRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.eyebrow, { color: colors.primary }]}>YOUR NEXT SESSION</Text>
            <Text style={[s.title, { color: colors.text }]}>
              Ready for your{'\n'}next set?
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 10 }}>
            {onOpenSplit && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Manage workout split and day order"
                onPress={onOpenSplit}
                style={[
                  s.splitPillBtn,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#f4f4f6',
                    borderColor: colors.border,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Ionicons name="repeat" size={13} color={colors.primary} />
                <Text style={[s.splitPillText, { color: colors.text }]} numberOfLines={1}>
                  {splitLabel || 'Split'}
                </Text>
                <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            <View
              style={[
                s.artwork,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f4f4f6',
                },
              ]}
            >
              <Ionicons
                name="barbell-outline"
                size={36}
                color={colors.primary}
                style={{ transform: [{ rotate: '-25deg' }] }}
              />
            </View>
          </View>
        </View>

        <View style={{ height: 22 }} />

        {routines.length > 0 ? (
          <WorkoutRoutineCarousel
            routines={routines}
            onSelect={onSelectRoutine}
            initialIndex={initialIndex}
          />
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onCreateRoutine}
            style={[s.start, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={17} color={ctaForeground} />
            <Text numberOfLines={1} style={[s.startText, { color: ctaForeground }]}>
              Create a workout day
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {recent ? (
        <View style={[s.recent, { borderColor: colors.border }]}>
          <View style={s.recentHeader}>
            <View style={s.recentHeading}>
              <Ionicons name="time-outline" size={17} color={colors.textMuted} />
              <Text style={[s.recentTitle, { color: colors.text }]}>Latest training day</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{recent.date}</Text>
          </View>
          <Text style={[s.summary, { color: colors.textMuted }]}>
            {recent.sets} {recent.sets === 1 ? 'set' : 'sets'} logged · {recent.exercises.length}{' '}
            {recent.exercises.length === 1 ? 'exercise' : 'exercises'}
          </Text>
          {recent.exercises.slice(0, 3).map((exercise) => (
            <View key={exercise.id} style={s.exerciseRow}>
              <View style={[s.dot, { backgroundColor: colors.primary }]} />
              <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12 }}>
                {exercise.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {exercise.sets} {exercise.sets === 1 ? 'set' : 'sets'}
              </Text>
            </View>
          ))}
          {recent.exercises.length > 3 && (
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 9 }}>
              +{recent.exercises.length - 3} more exercises
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  content: { gap: 14, marginTop: 10, width: '100%', alignItems: 'center' },
  card: { width: '100%', padding: 22, borderRadius: 24, borderWidth: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrow: { fontSize: 9, letterSpacing: 1.5, fontWeight: '800', marginBottom: 9 },
  title: { fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontSize: 27, lineHeight: 32, fontWeight: '800' },
  splitPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 150,
  },
  splitPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  artwork: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  start: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    padding: 13,
  },
  startText: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  recent: { width: '100%', padding: 18, borderWidth: 1, borderRadius: 20 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  recentHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  recentTitle: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  summary: { marginTop: 9, marginBottom: 5, fontSize: 12 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
