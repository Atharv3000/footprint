import { AppModal as Modal } from '@/components/AppModal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, DeviceEventEmitter, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/constants/AuthContext';
import { BRAND_ROUNDED_FONT_EXTRA, useTheme } from '@/constants/ThemeContext';
import { loadFriends, FriendUser } from '@/constants/socialEngine';
import { MEAL_LOGS_CHANGED, loadNutritionTargets } from '@/constants/nutritionStorage';
import { CalorieChallenge, previewCalorieChallenge, cachedChallenges, createCalorieChallenge, joinCalorieChallenge, syncCalorieChallenges, CALORIE_CHALLENGES_CHANGED } from '@/constants/calorieChallenges';
import Svg, { Circle } from 'react-native-svg';

function CalorieMeter({ calories = 0, target }: { calories?: number; target?: number }) {
  const { colors } = useTheme();
  const percent = target ? calories / target * 100 : 0;
  return <View style={s.meter}>
    <View accessible accessibilityRole="progressbar" accessibilityLabel={target ? `${calories.toLocaleString()} of ${target.toLocaleString()} daily calories logged` : 'Calorie progress. Set a challenge goal to begin'} accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(100, percent)) }}>
      <View style={{ width: 188, height: 188, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={188} height={188} viewBox="0 0 188 188" style={StyleSheet.absoluteFill}>
          <Circle cx={94} cy={94} r={84} fill="none" stroke={colors.primary} strokeOpacity={.07} strokeWidth={12} />
          {percent > 0 && <Circle cx={94} cy={94} r={84} fill="none" stroke={colors.primary} strokeOpacity={.3} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 84} ${2 * Math.PI * 84}`} strokeDashoffset={2 * Math.PI * 84 * (1 - Math.min(100, Math.max(0, percent)) / 100)} transform="rotate(-90 94 94)" />}
          <Circle cx={94} cy={94} r={90} fill="none" stroke={colors.textMuted} strokeOpacity={.4} strokeWidth={1.5} />
          <Circle cx={94} cy={94} r={78} fill="none" stroke={colors.textMuted} strokeOpacity={.4} strokeWidth={1.5} />
        </Svg>
        <Text style={[s.meterNumber, { color: colors.text }]}>{target ? calories.toLocaleString() : '0%'}</Text>
        <Text style={[s.caption, { color: colors.textMuted }]}>{target ? 'kcal logged today' : 'Ready to begin'}</Text>
      </View>
    </View>
    {target ? <>
      <Text style={[s.small, { color: colors.primary }]}>{Math.round(percent)}% of your daily target</Text>
      <View style={[s.row, { width: '100%' }]}>
        <View style={s.stat}><Text style={[s.value, { color: colors.text }]}>{target.toLocaleString()} kcal</Text><Text style={[s.caption, { color: colors.textMuted }]}>daily goal</Text></View>
        <View style={[s.stat, { alignItems: 'flex-end' }]}><Text style={[s.value, { color: colors.text }]}>{Math.abs(target-calories).toLocaleString()} kcal</Text><Text style={[s.caption, { color: colors.textMuted }]}>{calories > target ? 'above target' : 'to your target'}</Text></View>
      </View>
    </> : null}
  </View>;
}

export function CalorieChallenges({ compact = false, embedded = false }: { compact?: boolean; embedded?: boolean }) {
  const { colors } = useTheme(); const { user } = useAuth();
  const id = user?.id || 'guest_user';
  const [items, setItems] = useState<CalorieChallenge[]>([]); const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false); const [creating, setCreating] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const actionBusy = useRef(false);
  const [mode, setMode] = useState<'cut' | 'bulk'>('cut'); const [target, setTarget] = useState('2000');
  const [days, setDays] = useState(7); const [code, setCode] = useState('');
  const [friends, setFriends] = useState<FriendUser[]>([]); const [friend, setFriend] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const scope = useRef(id); scope.current = id; const syncing = useRef(false);
  const refresh = useCallback(async () => {
    if (syncing.current) return; syncing.current = true; setRefreshing(true);
    try { const result = await syncCalorieChallenges(id); if (scope.current === id) { setItems(result); setError(''); } }
    catch (e) { if (scope.current === id) setError((e as Error).message); }
    finally { syncing.current = false; if (scope.current === id) setRefreshing(false); }
  }, [id]);
  useEffect(() => {
    setItems([]); setSelected(''); setError(''); setOpen(false); setCreating(false); setJoinOpen(false); setProgressOpen(false); setCode(''); setFriends([]); setFriend('');
    cachedChallenges(id).then(result => { if (scope.current === id) setItems(result); }).catch(() => {});
  }, [id]);
  useFocusEffect(useCallback(() => {
    refresh(); const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 10000);
    const meals = DeviceEventEmitter.addListener(MEAL_LOGS_CHANGED, refresh);
    const changed = DeviceEventEmitter.addListener(CALORIE_CHALLENGES_CHANGED, refresh);
    const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); meals.remove(); changed.remove(); app.remove(); };
  }, [refresh]));
  const active = items.filter(c => c.status === 'active' || c.status === 'waiting');
  const featured = items.find(c => c.code === selected) || active[0] || items[0];
  const loadSetup = async () => {
    try {
      const [list, nutrition] = await Promise.all([loadFriends(id), loadNutritionTargets()]);
      if (scope.current === id) { setFriends(list); setTarget(String(Math.round(nutrition.dailyCalories))); }
    } catch { /* The manual form remains usable offline. */ }
  };
  const show = () => {
    setCreating(false); setJoinOpen(false); setProgressOpen(false); setOpen(true); void refresh(); void loadSetup();
  };
  const newChallenge = () => { setCreating(true); setOpen(true); void loadSetup(); };
  const run = async (action: () => Promise<unknown>, syncAfter = true) => {
    if (actionBusy.current) return; actionBusy.current = true; setBusy(true);
    try { await action(); if (syncAfter) await refresh(); }
    catch (e) { Alert.alert('Calorie challenge', (e as Error).message); }
    finally { actionBusy.current = false; setBusy(false); }
  };
  const invite = (challenge: CalorieChallenge) => Share.share({ message:
    `${friend ? `${friend}, join` : 'Join'} my ${challenge.days}-day ${challenge.mode} challenge on Footprint: ${challenge.target.toLocaleString()} kcal/day. Finish each day within 10% of the target. Open Calorie Tracker > Calorie Challenges > Join with code: ${challenge.code}` });
  const text = { color: colors.text }; const muted = { color: colors.textMuted };
  const button = (label: string, onPress: () => void, primary = false) => <TouchableOpacity key={label} accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={onPress}
    style={[s.button, { opacity: busy ? .5 : 1, borderColor: primary ? colors.primary : colors.border, backgroundColor: primary ? colors.primary + '18' : colors.surfaceElevated }]}>
    <Text style={[s.small, primary ? { color: colors.primary } : text]}>{label}</Text>
  </TouchableOpacity>;
  const summary = (c: CalorieChallenge, manage = false) => {
    const own = c.players[c.you];
    const daysLeft = c.status === 'finished' || c.status === 'cancelled' ? 0 : c.end
      ? Math.max(0, Math.round((Date.parse(c.end)-Date.parse(c.today))/86400000)+1) : c.days;
    const result = c.status === 'finished' ? c.winner === null ? 'CHALLENGE DRAW' : c.winner === c.you ? 'YOU WON' : `${c.players[c.winner].name.toUpperCase()} WON`
      : c.status === 'cancelled' ? 'CHALLENGE ENDED' : c.status === 'waiting' ? 'WAITING FOR A FRIEND' : 'Cut or bulk?\nHit it today.';
    return <View style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <View style={s.row}><View style={{ flex: 1 }}>
        <View style={[s.row, { gap: 6, marginBottom: 4 }]}><Ionicons name="flame" size={13} color={colors.primary} /><Text style={[s.eyebrow, { color: colors.primary, flexShrink: 1 }]}>{result}</Text></View>
        <Text style={[s.cardTitle, text]}>{c.mode === 'cut' ? 'Cut Challenge' : 'Bulk Challenge'}</Text>
      </View>{c.status === 'finished' && <View style={[s.iconBadge, { backgroundColor: colors.primary + '18' }]}><Ionicons name="trophy" size={20} color={colors.primary} /></View>}</View>
      <Text style={[s.caption, muted]}>{c.days} days {c.start ? `| ${c.start} - ${c.end}` : '| Starts when your friend joins'}</Text>
      <CalorieMeter calories={own.calories} target={c.target} />
      <Text style={[s.caption, muted, { marginBottom: 12 }]}>Finish each day within 10% of your shared target.</Text>
      {c.players.map((player, index) => <View key={index} style={{ marginBottom: 12 }}>
        <View style={s.row}><Text style={[s.small, text, { flex: 1 }]}>{index === c.you ? 'You' : player.name}</Text><Text style={[s.small, { color: player.complete ? colors.primary : colors.textMuted }]}>{player.calories.toLocaleString()} kcal{player.complete ? ' | Complete' : ''}</Text></View>
        <View accessibilityRole="progressbar" accessibilityLabel={`${index === c.you ? 'Your' : player.name + "'s"} logged calories toward daily target`} accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(100, player.calories/c.target*100)) }} style={[s.track, { backgroundColor: colors.border }]}><View style={{ height: 6, width: `${Math.min(100, player.calories/c.target*100)}%`, backgroundColor: colors.primary }} /></View>
      </View>)}
      {c.status === 'waiting' && <Text style={[s.caption, muted, { marginBottom: 12 }]}>Invite a friend to start logging toward this goal together.</Text>}
      <View style={s.row}><View style={s.stat}><Text style={[s.value, text]}>{own.score} / {c.days} days</Text><Text style={[s.caption, muted]}>your completed days</Text></View><View style={[s.stat, { alignItems: 'flex-end' }]}><Text style={[s.value, text]}>{daysLeft} days</Text><Text style={[s.caption, muted]}>{c.status === 'waiting' ? 'challenge duration' : 'left in the challenge'}</Text></View></View>
      {manage && <>
        <View style={[s.row, { flexWrap: 'wrap', marginTop: 12 }]}>
          {c.status === 'waiting' && button('Invite Friend', () => { invite(c).catch(() => {}); }, true)}
          {c.status === 'active' && !own.complete && button('Finish Today', () => Alert.alert('Finished logging today?', "Your total must be within 10% of the target. Later food edits can change today's result.", [
            { text: 'Keep Logging', style: 'cancel' }, { text: 'Finish Today', onPress: () => run(() => syncCalorieChallenges(id, { code: c.code, complete: true })) },
          ]), true)}
        </View>
        {c.status === 'waiting' && <Text selectable style={[s.caption, muted, { marginTop: 8 }]}>Invite code: {c.code} | Expires after 7 days</Text>}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: progressOpen }} onPress={() => setProgressOpen(value => !value)} style={[s.row, { justifyContent: 'space-between', marginTop: 16 }]}>
          <Text style={[s.small, text]}>Challenge progress</Text><Ionicons name={progressOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textMuted} />
        </TouchableOpacity>
        {progressOpen && <>
        {c.players.map((player, index) => <View key={index} style={[s.member, { borderColor: colors.border }]}><View style={s.row}><Text style={[s.small, text, { flex: 1 }]}>{index === c.you ? 'You' : player.name}</Text><Text style={[s.small, { color: colors.primary }]}>{player.score} / {c.days} days</Text></View></View>)}
        {(c.status === 'waiting' || c.status === 'active') && button('End Challenge', () => Alert.alert('End challenge?', 'This ends the challenge for both people without a winner.', [
          { text: 'Keep Challenge', style: 'cancel' }, { text: 'End', style: 'destructive', onPress: () => run(() => syncCalorieChallenges(id, { code: c.code, cancel: true })) },
        ]))}
        </>}
      </>}
    </View>;
  };
  return <>
    {compact ? <TouchableOpacity onPress={show} accessibilityRole="button" accessibilityLabel="Open calorie challenges" style={[s.banner, { backgroundColor: embedded ? 'transparent' : colors.surfaceElevated, borderRadius: embedded ? 0 : 18 }]}>
      <View style={[s.headerIconWrap, { backgroundColor: colors.primary + '18' }]}><Ionicons name="flame" size={17} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={[s.small, text]}>Calorie Challenges</Text><Text style={[s.caption, muted]}>{active[0] ? `${active[0].target.toLocaleString()} kcal/day | ${active[0].status === 'waiting' ? 'Invite a friend' : 'Track your shared goal'}` : 'Challenge a friend to stay on target'}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </TouchableOpacity> : <>
      <View style={s.headerRow}><View style={[s.row, { flexShrink: 1 }]}><View style={[s.headerIconWrap, { backgroundColor: colors.primary + '18' }]}><Ionicons name="flame" size={17} color={colors.primary} /></View><Text style={[s.sectionTitle, text, { flexShrink: 1 }]}>Calorie Challenges</Text></View>{button(featured ? 'Manage' : 'Start', show, true)}</View>
      {!!error && <Text style={[s.caption, muted, { marginBottom: 10 }]}>Showing last synced progress. Open Manage to retry.</Text>}
      {featured ? <TouchableOpacity activeOpacity={.9} accessibilityRole="button" accessibilityLabel="Manage calorie challenge" onPress={show}>{summary(featured)}</TouchableOpacity>
        : <TouchableOpacity activeOpacity={.9} accessibilityRole="button" onPress={show} style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={s.row}><Text style={[s.cardTitle, text, { flex: 1 }]}>{'Cut or bulk?\nHit it today.'}</Text></View>
          <Text style={[s.caption, muted, { marginTop: 8 }]}>Pick a cut or bulk goal, set a daily calorie target, and challenge a friend to fill your rings together.</Text>
          <CalorieMeter />
        </TouchableOpacity>}
    </>}
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: 16 }}>
        <View style={[s.row, { padding: 20 }]}>
          <TouchableOpacity hitSlop={12} accessibilityRole="button" accessibilityLabel="Close calorie challenges" onPress={() => setOpen(false)}><Ionicons name="close" size={25} color={colors.text} /></TouchableOpacity>
          <Text style={[s.title, text, { flex: 1 }]}>Calorie Challenges</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sync calorie challenges and food logs" disabled={refreshing || busy} onPress={refresh}
            style={[s.headerIconWrap, { backgroundColor: colors.surfaceElevated }]}>
            {refreshing || busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={18} color={colors.textMuted} />}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 45 }} keyboardShouldPersistTaps="handled">
          {!!error && <View style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}><Text style={[s.caption, muted]}>Not synced: {error}</Text>{button('Retry', refresh)}</View>}
          {items.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>{items.map(c => <View key={c.code}>{button(`${c.mode === 'cut' ? 'Cut' : 'Bulk'} | ${c.target.toLocaleString()} kcal | ${c.code.slice(-4)}`, () => { setSelected(c.code); setCreating(false); setProgressOpen(false); }, featured?.code === c.code && !creating)}</View>)}</ScrollView>}
          {featured && !creating && <>
            {summary(featured, true)}
            {button('Start another challenge', newChallenge)}
          </>}
          {(!featured || creating) && <View style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
              <Text style={[s.heading, text, { flex: 1, marginVertical: 0 }]}>Start a calorie challenge</Text>
              {featured && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel new calorie challenge" disabled={busy} onPress={() => setCreating(false)}><Ionicons name="close" size={20} color={colors.textMuted} /></TouchableOpacity>}
            </View>

            <View style={s.row}>{button('Cut', () => setMode('cut'), mode === 'cut')}{button('Bulk', () => setMode('bulk'), mode === 'bulk')}</View>
            <Text style={[s.heading, text]}>Daily Calorie Target</Text><TextInput accessibilityLabel="Daily calorie target" value={target} editable={!busy} onChangeText={setTarget} keyboardType="number-pad" style={[s.input, text, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]} />
            <Text style={[s.caption, muted]}>kcal per day | Finish within 10% of the target.</Text>
            <Text style={[s.heading, text]}>Challenge Duration</Text><View style={[s.row, { flexWrap: 'wrap' }]}>{[1, 7, 14, 30].map(d => button(`${d} Day${d === 1 ? '' : 's'}`, () => setDays(d), d === days))}</View>
            {!!friends.length && <><Text style={[s.heading, text]}>Invite a Friend</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{friends.map(f => <View key={f.id}>{button(f.displayName, () => setFriend(f.displayName), friend === f.displayName)}</View>)}</ScrollView></>}
            <Text style={[s.caption, muted, { marginVertical: 14 }]}>Both people accept the same target. Choose one that fits you both. Challenge targets do not change your nutrition goals.</Text>
            {button('Start challenge', () => run(async () => {
              if (!/^\d+$/.test(target) || Number(target) < 1000 || Number(target) > 10000) throw new Error('Enter a target from 1,000 to 10,000 kcal.');
              if (active.length >= 10) throw new Error('End an ongoing challenge before creating another.');
              const created = await createCalorieChallenge(id, user?.name || 'Player', mode, Number(target), days);
              if (scope.current !== id) return;
              setSelected(created.code); setItems(await cachedChallenges(id)); setCreating(false); setProgressOpen(false);
            }), true)}

          </View>}
          <View style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, marginTop: 8 }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: joinOpen }} onPress={() => setJoinOpen(value => !value)} style={[s.row, { justifyContent: 'space-between' }]}>
              <View style={[s.row, { flex: 1 }]}><Ionicons name="people-outline" size={18} color={colors.primary} /><Text style={[s.small, text]}>Join your friend</Text></View>
              <Ionicons name={joinOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {!joinOpen && <Text style={[s.caption, muted, { marginTop: 6 }]}>Have a code? Review the goal before you join.</Text>}
            {joinOpen && <View style={{ marginTop: 12 }}>
              <TextInput accessibilityLabel="Challenge invite code" placeholder="12-character invite code" placeholderTextColor={colors.textMuted} autoCapitalize="characters" autoCorrect={false} maxLength={12} value={code} onChangeText={setCode} editable={!busy} style={[s.input, text, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]} />
              {button('Review Invite', () => run(async () => {
                const preview = await previewCalorieChallenge(code);
                Alert.alert('Accept calorie challenge?', `${preview.mode} | ${preview.target.toLocaleString()} kcal/day for ${preview.days} days. Time zone: ${preview.timezone}.`, [
                  { text: 'Cancel', style: 'cancel' }, { text: 'Accept & Join', onPress: () => run(async () => {
                    const joined = await joinCalorieChallenge(id, user?.name || 'Player', code);
                    if (scope.current !== id) return;
                    setSelected(joined.code); setItems(await cachedChallenges(id)); setCode(''); setJoinOpen(false); setCreating(false); setProgressOpen(false);
                  }) },
                ]);
              }, false), true)}
            </View>}
          </View>
          <Text style={[s.caption, muted, { marginTop: 18 }]}>Most completed days wins; ties are a draw. Food totals are self-reported. Only totals and scores are shared. Joining starts the challenge in the creator's time zone.</Text>
        </ScrollView>
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2, marginBottom: 12 },
  headerIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', fontFamily: BRAND_ROUNDED_FONT_EXTRA, letterSpacing: -0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: .08, shadowRadius: 5, elevation: 2 },
  title: { fontSize: 24, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontWeight: '800' },
  heading: { fontSize: 16, fontWeight: '800', fontFamily: BRAND_ROUNDED_FONT_EXTRA, marginVertical: 12 },
  cardTitle: { fontSize: 22, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontWeight: '800', marginVertical: 3, letterSpacing: -0.4 },
  eyebrow: { fontSize: 9.5, fontWeight: '800', letterSpacing: .8 }, caption: { fontSize: 11.5, lineHeight: 17, fontWeight: '500' },
  small: { fontSize: 12, fontWeight: '700' }, value: { fontSize: 18, fontWeight: '800', fontFamily: BRAND_ROUNDED_FONT_EXTRA }, stat: { flex: 1 },
  iconBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  button: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, marginVertical: 4 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 14, padding: 13, fontSize: 15, marginBottom: 10 },
  member: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
  meter: { alignItems: 'center', marginVertical: 20, gap: 14 },
  meterNumber: { fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  banner: { borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
