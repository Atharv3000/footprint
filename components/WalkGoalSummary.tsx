import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import { progressFromSavedWalk } from '@/constants/communityGoals';
import type { WalkGoalGain } from '@/constants/communityGoalProgress';
import type { WalkRecord } from '@/constants/walkStorage';

export function WalkGoalSummary({ walk, userId }: { walk: WalkRecord; userId: string }) {
  const { colors } = useTheme();
  const [gains, setGains] = useState<WalkGoalGain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(''); setGains([]);
    progressFromSavedWalk(userId, walk, personal => { if (alive) setGains(personal); })
      .then(result => { if (alive) { setGains(result.gains); setError(result.syncError || ''); } })
      .catch(() => { if (alive) setError('Walk saved. Open Community to refresh your goal progress.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, walk.id]);
  if (!loading && !gains.length && !error) return <Text style={{ color: colors.textMuted, fontSize: 12, marginVertical: 12 }}>{walk.activityType === 'cycle' ? 'Cycling is saved to history; step goals count walks and runs.' : 'No step-goal progress was added for this activity.'}</Text>;
  return <View style={{ alignSelf: 'stretch', marginTop: 16, marginBottom: 10 }}>
    <View style={s.row}><Text style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' }}>Goal progress added</Text>{loading && <ActivityIndicator size="small" color={colors.primary} />}</View>
    {gains.map(goal => <View key={goal.id} style={{ marginTop: 12 }}>
      <View style={s.row}>
        <Ionicons name={goal.completedNow ? 'checkmark-circle' : goal.category === 'squad' ? 'people-outline' : 'footsteps-outline'} size={17} color={goal.color} />
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>{goal.title}</Text>
        <Text style={{ color: goal.color, fontSize: 12, fontWeight: '800' }}>+{goal.added.toLocaleString()} steps{goal.pending ? ' pending' : ''}</Text>
      </View>
      <View style={[s.track, { backgroundColor: colors.border }]}><View style={{ height: 5, width: `${Math.min(100, goal.current / goal.target * 100)}%`, backgroundColor: goal.color }} /></View>
      <Text style={{ color: goal.completedNow ? colors.primary : colors.textMuted, fontSize: 11, marginTop: 4 }}>{goal.completedNow ? 'Goal completed! · ' : ''}{goal.current.toLocaleString()} / {goal.target.toLocaleString()} steps</Text>
    </View>)}
    {!!error && <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 10 }}>{error}</Text>}
  </View>;
}
const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 7 }, track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 6 } });
