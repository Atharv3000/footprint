import { WorkoutRoutineCarousel } from './WorkoutRoutineCarousel';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_ROUNDED_FONT_EXTRA, useTheme } from '@/constants/ThemeContext';
import type { CustomRoutine, WorkoutLogEntry } from '@/constants/workoutStorage';

const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function WorkoutStartPanel({ routines, logs, onSelectRoutine, onCreateRoutine }: {
  routines: CustomRoutine[]; logs: WorkoutLogEntry[];
  onSelectRoutine: (routine: CustomRoutine) => void; onCreateRoutine: () => void;
}) {
  const { colors } = useTheme();
  const recent = useMemo(() => {
    const history = logs.filter(log => !log.id.startsWith('demo_') && log.exerciseId !== 'boxing'
      && Number.isFinite(Date.parse(log.date)) && log.reps > 0)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    if (!history.length) return null;
    const date = new Date(history[0].date);
    const day = localDay(date);
    const latest = history.filter(log => localDay(new Date(log.date)) === day);
    const exercises = new Map<string, { id: string; name: string; sets: number }>();
    for (const log of latest) {
      const previous = exercises.get(log.exerciseId);
      exercises.set(log.exerciseId, { id: log.exerciseId, name: log.exerciseName, sets: (previous?.sets || 0) + 1 });
    }
    return { date: day === localDay(new Date()) ? 'Today' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      sets: latest.length, exercises: [...exercises.values()] };
  }, [logs]);
  return <View style={s.content}>
    <View style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <View style={s.headingRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.eyebrow, { color: colors.primary }]}>YOUR NEXT SESSION</Text>
          <Text style={[s.title, { color: colors.text }]}>Ready for your{ '\n' }next set?</Text>
        </View>
        <View style={[s.artwork, { backgroundColor: colors.primaryBg }]}>
          <View style={[s.orbit, { borderColor: colors.primary, opacity: .2 }]} />
          <Ionicons name="barbell-outline" size={40} color={colors.primary} style={{ transform: [{ rotate: '-25deg' }] }} />
          <View style={[s.spark, { backgroundColor: colors.surfaceElevated }]}><Ionicons name="sparkles" size={17} color={colors.primary} /></View>
        </View>
      </View>
      <Text style={[s.body, { color: colors.textMuted, marginTop: 14 }]}>Choose a workout day to reveal your exercises, sets, reps, and weights.</Text>
      <View style={s.steps}>
        {(['Choose', 'Track', 'Save'] as const).map((label, index) => <View key={label} style={s.step}>
          <View style={[s.stepNumber, { backgroundColor: colors.primaryBg }]}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>{index + 1}</Text></View>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
          {index < 2 && <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />}
        </View>)}
      </View>
      {routines.length > 0 ? <>
        <WorkoutRoutineCarousel routines={routines} onSelect={onSelectRoutine} />
        <TouchableOpacity accessibilityRole="button" onPress={onCreateRoutine} style={s.create}><Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>Build a new workout day</Text></TouchableOpacity>
      </> : <TouchableOpacity accessibilityRole="button" onPress={onCreateRoutine} style={[s.start, { backgroundColor: colors.primary }]}>
        <Ionicons name="add" size={17} color="#101609" />
        <Text numberOfLines={1} style={s.startText}>Create a workout day</Text>
      </TouchableOpacity>}

    </View>
    {recent ? <View style={[s.recent, { borderColor: colors.border }]}>
      <View style={s.recentHeader}>
        <View style={s.recentHeading}><Ionicons name="time-outline" size={17} color={colors.textMuted} /><Text style={[s.recentTitle, { color: colors.text }]}>Latest training day</Text></View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{recent.date}</Text>
      </View>
      <Text style={[s.summary, { color: colors.textMuted }]}>{recent.sets} {recent.sets === 1 ? 'set' : 'sets'} logged · {recent.exercises.length} {recent.exercises.length === 1 ? 'exercise' : 'exercises'}</Text>
      {recent.exercises.slice(0, 3).map(exercise => <View key={exercise.id} style={s.exerciseRow}>
        <View style={[s.dot, { backgroundColor: colors.primary }]} />
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12 }}>{exercise.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{exercise.sets} {exercise.sets === 1 ? 'set' : 'sets'}</Text>
      </View>)}
      {recent.exercises.length > 3 && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 9 }}>+{recent.exercises.length - 3} more exercises</Text>}
    </View> : <View style={s.firstSession}>
      <Ionicons name="checkmark-circle-outline" size={18} color={colors.textMuted} />
      <Text style={[s.body, { color: colors.textMuted, flex: 1 }]}>Your completed sets will appear here after your first workout.</Text>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  content: { gap: 14, marginTop: 18 }, card: { padding: 22, borderRadius: 24, borderWidth: 1 }, headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 9, letterSpacing: 1.5, fontWeight: '800', marginBottom: 9 }, title: { fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontSize: 27, lineHeight: 32, fontWeight: '800' },
  artwork: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, orbit: { position: 'absolute', width: 91, height: 91, borderRadius: 46, borderWidth: 1 }, spark: { position: 'absolute', right: -4, top: -7, padding: 5, borderRadius: 12 },
  body: { fontSize: 13, lineHeight: 20 }, steps: { flexDirection: 'row', marginTop: 21, marginBottom: 21, gap: 6 }, step: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }, stepNumber: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  start: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 16, padding: 13 }, startText: { flex: 1, minWidth: 0, color: '#101609', fontSize: 14, fontWeight: '800', textAlign: 'center' }, create: { alignSelf: 'center', padding: 12, paddingBottom: 0 },
  recent: { padding: 18, borderWidth: 1, borderRadius: 20 }, recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, recentHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }, recentTitle: { fontSize: 13, fontWeight: '700', flexShrink: 1 }, summary: { marginTop: 9, marginBottom: 5, fontSize: 12 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }, dot: { width: 4, height: 4, borderRadius: 2 }, firstSession: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 8 },
});
