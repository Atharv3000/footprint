import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BODY_PARTS, MuscleRankGain, workoutRankGains } from '@/constants/muscleRanks';
import { DEFAULT_EXERCISES, loadRankableWorkoutLogs } from '@/constants/workoutStorage';
import { BRAND_ROUNDED_FONT_EXTRA, useTheme } from '@/constants/ThemeContext';

export function WorkoutRankProgress({ userId, logIds, weightUnit }: { userId: string; logIds: string[]; weightUnit: 'kg' | 'lb' }) {
  const { colors } = useTheme();
  const [result, setResult] = useState<{ key: string; gains: MuscleRankGain[] }>({ key: '', gains: [] });
  const key = JSON.stringify([userId, logIds]);
  useEffect(() => {
    let alive = true;
    if (logIds.length) loadRankableWorkoutLogs(userId).then(logs => {
      if (alive) setResult({ key, gains: workoutRankGains(logs, logIds, DEFAULT_EXERCISES, userId) });
    }).catch(() => { if (alive) setResult({ key, gains: [] }); });
    return () => { alive = false; };
  }, [key]);
  if (!logIds.length || result.key !== key || !result.gains.length) return null;
  const display = (lbs: number) => (weightUnit === 'kg' ? lbs / 2.20462 : lbs).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return <View accessibilityLiveRegion="polite" style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary + '55' }]}>
    <View style={s.row}><Ionicons name="trending-up" size={18} color={colors.primary} /><Text style={[s.heading, { color: colors.text }]}>Gym rank progress</Text></View>
    {result.gains.map(gain => <View key={gain.part} style={{ gap: 7 }}>
      <View style={s.row}>
        <Text style={[s.label, { color: colors.text, flex: 1 }]}>{BODY_PARTS.find(part => part.id === gain.part)?.label}</Text>
        <Text style={[s.label, { color: colors.primary }]}>+{display(gain.addedVolumeLbs)} {weightUnit} volume</Text>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel={`${gain.part} rank progress`} accessibilityValue={{ min: 0, max: 100, now: Math.round(gain.after.progress * 100) }} style={[s.track, { backgroundColor: colors.border }]}><View style={{ height: 5, width: `${gain.after.progress * 100}%`, backgroundColor: gain.after.tier.color }} /></View>
      <Text style={[s.caption, { color: colors.textMuted }]}>{gain.rankedUp ? `${gain.before.tier.name} → ${gain.after.tier.name}!` : gain.after.tier.name}{gain.after.next ? ` · ${display(gain.after.remaining)} ${weightUnit} volume to ${gain.after.next.name}` : ' · Maximum rank'}</Text>
    </View>)}
    <Text style={[s.caption, { color: colors.textMuted }]}>Saved weight × reps. Only completed, logged sets count.</Text>
  </View>;
}
const s = StyleSheet.create({
  card: { padding: 14, borderWidth: 1, borderRadius: 18, gap: 13, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  heading: { fontSize: 14, fontWeight: '800', fontFamily: BRAND_ROUNDED_FONT_EXTRA },
  label: { fontSize: 12, fontWeight: '700' }, caption: { fontSize: 11, lineHeight: 16 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
});
