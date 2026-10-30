import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { BODY_PARTS, BodyPart, computeMuscleRanks, MUSCLE_TIERS } from '@/constants/muscleRanks';
import { DEFAULT_EXERCISES, loadRankableWorkoutLogs, WORKOUT_LOGS_CHANGED, WorkoutLogEntry } from '@/constants/workoutStorage';
import { MuscleRankBody, RankEmblem } from './MuscleRankArtwork';
import { personalRankPalette } from '@/constants/personalRankPalette';

export function MuscleRanksSection({ userId, active, accountName, accountHandle }: {
  userId: string; active: boolean; accountName?: string; accountHandle?: string;
}) {
  const { colors, isDark } = useTheme();
  const [selected, setSelected] = useState<BodyPart>('arms');
  const [back, setBack] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [personalColors, setPersonalColors] = useState(true);
  const availablePalette = personalRankPalette(accountName, accountHandle);
  const palette = personalColors ? availablePalette : undefined;
  const [history, setHistory] = useState<{ userId: string; logs: WorkoutLogEntry[]; loading: boolean; error: boolean }>({ userId, logs: [], loading: true, error: false });
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setHistory(previous => ({ userId, logs: previous.userId === userId ? previous.logs : [], loading: true, error: false }));
    try {
      const logs = await loadRankableWorkoutLogs(userId);
      if (alive.current && request === generation.current) setHistory({ userId, logs, loading: false, error: false });
    } catch {
      if (alive.current && request === generation.current) setHistory({ userId, logs: [], loading: false, error: true });
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { if (active) refresh(); }, [active, refresh]));
  useEffect(() => {
    const listener = DeviceEventEmitter.addListener(WORKOUT_LOGS_CHANGED, (event: { userId: string }) => {
      if (event.userId === userId) refresh();
    });
    return () => listener.remove();
  }, [userId, refresh]);

  const ownHistory = history.userId === userId;
  const ranks = useMemo(() => computeMuscleRanks(ownHistory ? history.logs : [], DEFAULT_EXERCISES, userId), [ownHistory, history.logs, userId]);
  const rank = ranks.find(item => item.part === selected)!;
  const part = BODY_PARTS.find(item => item.id === selected)!;
  const trainedParts = ranks.filter(item => item.days > 0).length;
  const choosePart = (value: BodyPart) => {
    setSelected(value);
    if (value === 'back') setBack(true);
    if (value === 'chest' || value === 'core') setBack(false);
    Haptics.selectionAsync().catch(() => {});
  };
  const panel = { backgroundColor: colors.card, borderColor: colors.border };

  return <View style={s.container}>
    <View style={s.headingRow}>
      <View style={{ flex: 1 }}><Text style={[s.eyebrow, { color: colors.textMuted }]}>TRAINING, LEVELLED UP</Text><Text style={[s.title, { color: colors.text }]}>Your muscle ranks</Text></View>
      <View style={[s.summary, { backgroundColor: colors.primaryBg }]}><Ionicons name="shield-checkmark-outline" size={15} color={colors.primary} /><Text style={[s.summaryText, { color: colors.primary }]}>{trainedParts}/6 trained</Text></View>
    </View>
    <Text style={[s.intro, { color: colors.textMuted }]}>Build your ranks one training day at a time.</Text>
    {(!ownHistory || history.loading) && <View style={s.loading}><ActivityIndicator color={colors.primary} /><Text style={[s.caption, { color: colors.textMuted }]}>Updating workout history...</Text></View>}
    {ownHistory && history.error ? <View style={[s.detail, panel]}>
      <Text style={[s.detailTitle, { color: colors.text }]}>Could not load your ranks</Text>
      <Text style={[s.intro, { color: colors.textMuted }]}>Your workout history could not be read. Try again.</Text>
      <TouchableOpacity onPress={refresh}><Text style={{ color: colors.primary, fontWeight: '700' }}>Retry</Text></TouchableOpacity>
    </View> : <>
      <View style={s.hero}>
        <View style={s.heroTop}><View><Text style={s.heroEyebrow}>YOUR TRAINING ARMOR</Text><Text style={s.heroHint}>Tap a muscle to inspect its rank</Text></View>
          <View style={s.angleTabs}>{([false, true] as const).map(value => <TouchableOpacity key={String(value)} accessibilityRole="button" accessibilityState={{ selected: back === value }}
            onPress={() => setBack(value)} style={[s.angleTab, back === value && { backgroundColor: '#34343c' }]}><Text style={[s.angleText, back === value && { color: '#fff' }]}>{value ? 'Back' : 'Front'}</Text></TouchableOpacity>)}</View>
        </View>
        <View style={s.bodyStage}>
          <View pointerEvents="none" style={s.stageRing} />
          <MuscleRankBody ranks={ranks} selected={selected} onSelect={choosePart} back={back} palette={palette} />
          <View pointerEvents="none" style={[s.heroChip, { borderColor: rank.tier.color + '70' }]}><RankEmblem tier={rank.tier} size={32} /><View><Text style={s.chipPart}>{part.label.toUpperCase()}</Text><Text style={[s.chipRank, { color: rank.tier.light }]}>{rank.tier.name}</Text></View></View>
        </View>
        {availablePalette && <View style={s.paletteRow}>
          <View><Text style={s.heroEyebrow}>{palette ? 'PERSONAL COLOR PALETTE' : 'EARNED RANK COLORS'}</Text><Text style={s.heroHint}>Your ranks still follow your workouts</Text></View>
          <TouchableOpacity accessibilityRole="button" onPress={() => setPersonalColors(value => !value)}><Text style={s.paletteToggle}>{palette ? 'Use rank colors' : 'Use my palette'}</Text></TouchableOpacity>
        </View>}
      </View>

      <View style={[s.detail, panel]}>
        <View style={s.detailRow}><RankEmblem tier={rank.tier} size={54} />
          <View style={{ flex: 1 }}><Text style={[s.caption, { color: colors.textMuted }]}>{part.label.toUpperCase()} / {part.description}</Text><Text style={[s.detailTitle, { color: colors.text }]}>{rank.tier.name}</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Text style={[s.dayCount, { color: colors.text }]}>{rank.days}</Text><Text style={[s.caption, { color: colors.textMuted }]}>{rank.days === 1 ? 'training day' : 'training days'}</Text></View>
        </View>
        <View accessibilityRole="progressbar" accessibilityLabel={`${part.label} progress toward ${rank.next?.name || 'maximum rank'}`} accessibilityValue={{ min: 0, max: 100, now: Math.round(rank.progress * 100) }} style={[s.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
          <View style={[s.progressFill, { width: `${rank.progress * 100}%`, backgroundColor: rank.tier.color }]} />
        </View>
        <View style={s.detailRow}><Text style={[s.progressText, { color: colors.textMuted }]}>{rank.next ? `${rank.remaining} more training ${rank.remaining === 1 ? 'day' : 'days'} to ${rank.next.name}` : 'Olympian reached. Your training keeps counting.'}</Text>
          {rank.next && <Text style={[s.caption, { color: colors.textMuted }]}>{rank.days - rank.tier.days}/{rank.next.days - rank.tier.days}</Text>}
        </View>
      </View>

      <View style={s.partsGrid}>{ranks.map(item => {
        const metadata = BODY_PARTS.find(body => body.id === item.part)!;
        const chosen = selected === item.part;
        return <TouchableOpacity key={item.part} accessibilityRole="button" accessibilityLabel={`${metadata.label}: ${item.tier.name}, ${item.days} training days`} accessibilityState={{ selected: chosen }} onPress={() => choosePart(item.part)}
          style={[s.partCard, panel, chosen && { borderColor: isDark ? item.tier.color : colors.text, backgroundColor: isDark ? item.tier.dark + '25' : colors.surfaceSecondary }]}>
          <RankEmblem tier={item.tier} size={34} /><View style={{ flex: 1 }}><Text style={[s.partName, { color: colors.text }]}>{metadata.label}</Text><Text style={[s.partTier, { color: colors.textMuted }]}>{item.tier.name} · {item.days}d</Text></View>
          {chosen && <Ionicons name="checkmark" size={14} color={colors.text} />}
        </TouchableOpacity>;
      })}</View>

      {!trainedParts && !history.loading && <Text style={[s.emptyHint, { color: colors.textMuted }]}>Your first saved workout unlocks Bronze for its primary body part. Three training days unlock Silver.</Text>}

      <View style={[s.ladder, panel]}>
        <Text style={[s.ladderTitle, { color: colors.text }]}>The rank ladder</Text>
        <Text style={[s.caption, { color: colors.textMuted }]}>A separate rank for every body part</Text>
        <View style={s.tierGrid}>{MUSCLE_TIERS.map(tier => <View key={tier.id} style={[s.tierCell, tier.id === rank.tier.id && { backgroundColor: isDark ? tier.dark + '30' : colors.surfaceSecondary }]}>
          <RankEmblem tier={tier} size={48} /><Text style={[s.tierName, { color: colors.text }]}>{tier.name}</Text><Text style={[s.caption, { color: colors.textMuted }]}>{tier.days === 0 ? 'Start here' : `${tier.days} ${tier.days === 1 ? 'day' : 'days'}`}</Text>
        </View>)}</View>
      </View>
      <View style={[s.rules, { borderColor: colors.border }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: rulesOpen }} onPress={() => setRulesOpen(value => !value)} style={s.rulesToggle}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} /><Text style={[s.rulesTitle, { color: colors.text }]}>How ranks are earned</Text><Ionicons name={rulesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </TouchableOpacity>
        {rulesOpen && <Text style={[s.rulesText, { color: colors.textMuted }]}>Each body part earns one credit per calendar day with a saved workout targeting its primary muscles. More sets on the same day stay one credit. Bodyweight exercises count too. Ranks use your existing workout history and update when workouts are saved or removed. Three arm-training days earn Silver. These ranks reward training consistency.</Text>}
      </View>
    </>}
  </View>;
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  title: { fontSize: 25, fontFamily: SERIF_FONT, letterSpacing: -.7 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 20 },
  summaryText: { fontSize: 10, fontWeight: '700' },
  intro: { fontSize: 13, lineHeight: 19, marginTop: -7 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caption: { fontSize: 10, lineHeight: 15 },
  hero: { borderRadius: 24, backgroundColor: '#0B0C10', borderWidth: 1, borderColor: '#242630', overflow: 'hidden' },
  heroTop: { padding: 16, paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  heroEyebrow: { color: '#B9C0CF', fontSize: 8, letterSpacing: 1.3, fontWeight: '800' },
  heroHint: { color: '#727B8B', fontSize: 9, marginTop: 5 },
  angleTabs: { flexDirection: 'row', padding: 3, borderRadius: 18, backgroundColor: '#1A1D25' },
  angleTab: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 15 },
  angleText: { color: '#8690A2', fontSize: 10, fontWeight: '700' },
  bodyStage: { alignItems: 'center', justifyContent: 'center', paddingTop: 2, paddingBottom: 4 },
  stageRing: { position: 'absolute', width: 250, height: 250, borderRadius: 125, borderWidth: 1, borderColor: '#202633', backgroundColor: '#10141D', top: 47 },
  heroChip: { position: 'absolute', bottom: 24, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 13, backgroundColor: '#121620ED', padding: 8 },
  chipPart: { color: '#8F9BAD', fontSize: 8, letterSpacing: 1.1, fontWeight: '800' },
  chipRank: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  paletteRow: { padding: 16, paddingTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  paletteToggle: { color: '#C4CFFF', fontSize: 10, fontWeight: '700' },
  detail: { borderRadius: 20, padding: 16, borderWidth: 1, gap: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailTitle: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  dayCount: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 5, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { flex: 1, fontSize: 12, lineHeight: 18 },
  partsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9 },
  partCard: { width: '48.6%', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 16, padding: 10 },
  partName: { fontSize: 12, fontWeight: '700' },
  partTier: { fontSize: 10, marginTop: 3 },
  emptyHint: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 14 },
  ladder: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 5 },
  ladderTitle: { fontSize: 16, fontWeight: '800' },
  tierGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  tierCell: { width: '33.333%', alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: 14 },
  tierName: { fontSize: 11, fontWeight: '700' },
  rules: { borderWidth: 1, borderRadius: 16, padding: 14 },
  rulesToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rulesTitle: { flex: 1, fontSize: 12, fontWeight: '700' },
  rulesText: { fontSize: 12, lineHeight: 19, marginTop: 12 },
});
