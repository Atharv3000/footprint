import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, DeviceEventEmitter, Modal, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/constants/AuthContext';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { loadFriends, FriendUser } from '@/constants/socialEngine';
import { MEAL_LOGS_CHANGED, loadNutritionTargets } from '@/constants/nutritionStorage';
import { CalorieChallenge, previewCalorieChallenge, cachedChallenges, createCalorieChallenge, joinCalorieChallenge, syncCalorieChallenges, CALORIE_CHALLENGES_CHANGED } from '@/constants/calorieChallenges';

export function CalorieChallenges({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme(); const { user } = useAuth(); const id = user?.id || 'guest_user';
  const [items, setItems] = useState<CalorieChallenge[]>([]); const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'cut' | 'bulk'>('cut'); const [target, setTarget] = useState('2000');
  const [days, setDays] = useState(7); const [code, setCode] = useState(''); const [friends, setFriends] = useState<FriendUser[]>([]);
  const [friend, setFriend] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const scope = useRef(id); scope.current = id; const syncing = useRef(false); const focused = useRef(false);
  const refresh = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try { const result = await syncCalorieChallenges(id); if (scope.current === id) { setItems(result); setError(''); } }
    catch (e) { if (scope.current === id) setError((e as Error).message); }
    finally { syncing.current = false; }
  }, [id]);
  useEffect(() => {
    setItems([]); setError(''); setOpen(false);
    cachedChallenges(id).then(result => { if (scope.current === id) setItems(result); }).catch(() => {});
  }, [id]);
  useFocusEffect(useCallback(() => {
    focused.current = true; refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 10000);
    const meals = DeviceEventEmitter.addListener(MEAL_LOGS_CHANGED, refresh);
    const changed = DeviceEventEmitter.addListener(CALORIE_CHALLENGES_CHANGED, refresh);
    const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { focused.current = false; clearInterval(timer); meals.remove(); changed.remove(); app.remove(); };
  }, [refresh]));
  const show = async () => {
    setOpen(true);
    try { const [list, nutrition] = await Promise.all([loadFriends(id), loadNutritionTargets()]);
      if (scope.current === id) { setFriends(list); setTarget(String(Math.round(nutrition.dailyCalories))); }
    } catch { /* Keep the manual form usable while offline. */ }
  };
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return; setBusy(true);
    try { await action(); await refresh(); }
    catch (e) { Alert.alert('Calorie challenge', (e as Error).message); }
    finally { setBusy(false); }
  };
  const invite = (challenge: CalorieChallenge) => Share.share({ message:
    `${friend ? `${friend}, join` : 'Join'} my ${challenge.days}-day ${challenge.mode} challenge on Footprint: ${challenge.target.toLocaleString()} kcal/day. Finish each day within 10% of the target. Open Calorie Tracker > Challenges > Join with code: ${challenge.code}` });
  const active = items.filter(c => c.status === 'active' || c.status === 'waiting');
  const text = { color: colors.text }; const muted = { color: colors.textMuted };
  const button = (label: string, onPress: () => void, selected = false) => <TouchableOpacity key={label} accessibilityRole="button" disabled={busy} onPress={onPress}
    style={[s.pill, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '20' : colors.surfaceElevated }]}><Text style={[s.small, selected ? { color: colors.primary } : text]}>{label}</Text></TouchableOpacity>;
  const card = (c: CalorieChallenge) => <View key={c.code} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={s.row}><Ionicons name="flame-outline" size={19} color={colors.primary} /><Text style={[s.cardTitle, text]}>{c.mode === 'cut' ? 'Cut' : 'Bulk'} · {c.target.toLocaleString()} kcal / day</Text><Text style={[s.small, muted]}>{c.days}d</Text></View>
    <Text style={[s.caption, muted]}>{c.status === 'waiting' ? 'Waiting for your friend · invite expires in 7 days' : `${c.start} – ${c.end} · ${c.timezone}`}</Text>
    {c.players.map((p, i) => <View key={i} style={{ marginTop: 10 }}>
      <View style={s.row}><Text style={[s.small, text, { flex: 1 }]}>{i === c.you ? 'You' : p.name}</Text><Text style={[s.small, muted]}>{p.calories.toLocaleString()} kcal · {p.score} / {c.days} days{p.complete ? ' ✓' : ''}</Text></View>
      <View style={[s.track, { backgroundColor: colors.border }]}><View style={{ width: `${Math.min(100, p.calories / c.target * 100)}%`, height: 4, backgroundColor: p.complete ? '#10b981' : colors.primary }} /></View>
    </View>)}
    {c.status === 'finished' && <Text style={[s.small, { color: colors.primary, marginTop: 12 }]}>{c.winner === null ? 'Challenge finished · Draw' : c.winner === c.you ? 'Challenge finished · You won!' : `${c.players[c.winner].name} won`}</Text>}
    <View style={[s.row, { marginTop: 12, flexWrap: 'wrap' }]}>
      {c.status === 'waiting' && button(`Invite · ${c.code}`, () => { invite(c).catch(() => {}); })}
      {c.status === 'active' && !c.players[c.you].complete && button('Finish today', () => Alert.alert('Finished logging today?', 'Your total must be within 10% of the target. Later food edits can change today’s result.', [
        { text: 'Keep logging', style: 'cancel' }, { text: 'Finish today', onPress: () => run(() => syncCalorieChallenges(id, { code: c.code, complete: true })) },
      ]))}
      {(c.status === 'active' || c.status === 'waiting') && button('End challenge', () => Alert.alert('End challenge?', 'This ends the challenge for both people without a winner.', [
        { text: 'Keep challenge', style: 'cancel' }, { text: 'End', style: 'destructive', onPress: () => run(() => syncCalorieChallenges(id, { code: c.code, cancel: true })) },
      ]))}
    </View>
  </View>;
  return <>
    <TouchableOpacity onPress={show} accessibilityRole="button" accessibilityLabel="Open calorie challenges" style={[s.banner, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <Ionicons name="trophy-outline" color={colors.primary} size={20} /><View style={{ flex: 1 }}><Text style={[s.small, text]}>Calorie challenges{active.length ? ` · ${active.length} ongoing` : ''}</Text>
      <Text style={[s.caption, muted]}>{active[0] ? `${active[0].mode === 'cut' ? 'Cut' : 'Bulk'} · ${active[0].target.toLocaleString()} kcal/day · ${active[0].status === 'waiting' ? 'Invite a friend' : `${active[0].players[active[0].you].score}/${active[0].days} days`}` : 'Challenge a friend to stay on target'}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </TouchableOpacity>
    {!compact && active.slice(0, 3).map(card)}
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
        <View style={s.row}><Text style={[s.title, text, { flex: 1 }]}>Calorie challenges</Text><TouchableOpacity accessibilityLabel="Close calorie challenges" onPress={() => setOpen(false)}><Ionicons name="close" size={26} color={colors.text} /></TouchableOpacity></View>
        <Text style={[s.caption, muted, { marginVertical: 12 }]}>Stay within 10% of your agreed daily target, then finish your day. Most completed days wins; ties are a draw. Food totals are self-reported. Only totals and scores are shared.</Text>
        {error ? <View style={[s.card, { borderColor: colors.border }]}><Text style={[s.caption, muted]}>Not synced: {error}</Text>{button('Retry sync', refresh)}</View> : null}
        <Text style={[s.heading, text]}>New challenge</Text>
        <View style={s.row}>{button('Cut', () => setMode('cut'), mode === 'cut')}{button('Bulk', () => setMode('bulk'), mode === 'bulk')}</View>
        <Text style={[s.label, muted]}>Daily calorie target (kcal)</Text>
        <TextInput accessibilityLabel="Daily calorie target" value={target} onChangeText={setTarget} keyboardType="number-pad" style={[s.input, text, { borderColor: colors.border }]} />
        <View style={[s.row, { flexWrap: 'wrap' }]}>{[1, 7, 14, 30].map(d => button(`${d} day${d === 1 ? '' : 's'}`, () => setDays(d), d === days))}</View>
        {friends.length > 0 && <><Text style={[s.label, muted]}>Invite a friend</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{friends.map(f => button(f.displayName, () => setFriend(f.displayName), friend === f.displayName))}</ScrollView></>}
        <Text style={[s.caption, muted, { marginVertical: 10 }]}>Both people accept the same target. Choose one that fits you both. Challenge targets do not change your nutrition goals.</Text>
        {button('Create & share invite', () => run(async () => {
          if (!/^\d+$/.test(target) || Number(target) < 1000 || Number(target) > 10000) throw new Error('Enter a target from 1,000 to 10,000 kcal.');
          if (active.length >= 10) throw new Error('End an ongoing challenge before creating another.');
          const challenge = await createCalorieChallenge(id, user?.name || 'Player', mode, Number(target), days);
          setItems(await cachedChallenges(id)); await invite(challenge);
        }))}
        <Text style={[s.heading, text]}>Join a friend</Text>
        <TextInput accessibilityLabel="Challenge invite code" placeholder="12-character invite code" placeholderTextColor={colors.textMuted} autoCapitalize="characters" autoCorrect={false} maxLength={12} value={code} onChangeText={setCode} style={[s.input, text, { borderColor: colors.border }]} />
        <Text style={[s.caption, muted]}>Joining starts the challenge today in the creator’s time zone. You can review the target before accepting.</Text>
        {button('Review invite', () => run(async () => {
          const preview = await previewCalorieChallenge(code);
          Alert.alert('Accept calorie challenge?', `${preview.mode} · ${preview.target.toLocaleString()} kcal/day for ${preview.days} days. Time zone: ${preview.timezone}.`, [
            { text: 'Cancel', style: 'cancel' }, { text: 'Accept & join', onPress: () => run(async () => { await joinCalorieChallenge(id, user?.name || 'Player', code); setCode(''); }) },
          ]);
        }))}
        {busy && <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />}
        <Text style={[s.heading, text]}>Your challenges</Text>
        {items.length ? items.map(card) : <Text style={[s.caption, muted]}>Create a challenge or join with your friend’s invite code.</Text>}
        {button('Refresh progress', refresh)}
      </ScrollView></SafeAreaView>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: SERIF_FONT, fontSize: 27 }, heading: { fontSize: 18, fontWeight: '700', marginTop: 22, marginBottom: 12 },
  small: { fontSize: 12, fontWeight: '600' }, caption: { fontSize: 11, lineHeight: 17 }, label: { fontSize: 12, marginTop: 14, marginBottom: 7 },
  pill: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 20, marginVertical: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 16, marginBottom: 9 },
  card: { padding: 16, borderWidth: 1, borderRadius: 18, marginBottom: 12 }, cardTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  track: { height: 4, borderRadius: 3, overflow: 'hidden', marginTop: 7 },
});
