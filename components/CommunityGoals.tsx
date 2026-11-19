import { TutorialAnchor } from "@/components/FirstRunTutorial";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, DeviceEventEmitter, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { useAuth } from '@/constants/AuthContext';
import { useTheme } from '@/constants/ThemeContext';
import { WALKS_CHANGED } from '@/constants/walkStorage';
import { DEFAULT_GOAL_TARGETS, GoalProgress, personalGoalProgress } from '@/constants/communityGoalProgress';
import { COMMUNITY_GOALS_CHANGED, SquadGoal, createSquadGoal, joinSquadGoal, loadCommunityGoals, previewSquadGoal, saveGoalTargets, squadProgress, syncSquadGoal } from '@/constants/communityGoals';

export function CommunityGoals({ search = '' }: { search?: string }) {
  const { colors } = useTheme(); const { user } = useAuth(); const id = user?.id || 'guest_user';
  const scope = useRef(id); scope.current = id;
  const [goals, setGoals] = useState<GoalProgress[]>(personalGoalProgress([], id, DEFAULT_GOAL_TARGETS));
  const [squad, setSquad] = useState<SquadGoal | null>(null);
  const [daily, setDaily] = useState('4000'), [weekly, setWeekly] = useState('15000');
  const [title, setTitle] = useState('Squad step goal'), [target, setTarget] = useState('100000');
  const [code, setCode] = useState(''), [open, setOpen] = useState(false), [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const refreshing = useRef(false);
  useEffect(() => { setGoals(personalGoalProgress([], id, DEFAULT_GOAL_TARGETS)); setSquad(null); setOpen(false); setCode(''); setError(''); }, [id]);
  const load = useCallback(async (resetInputs = false) => {
    const result = await loadCommunityGoals(id);
    if (scope.current !== id) return;
    setGoals(result.goals); setSquad(result.squad);
    if (resetInputs) { setDaily(String(result.targets.daily)); setWeekly(String(result.targets.weekly)); }
  }, [id]);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try { await load(); await syncSquadGoal(id); await load(); if (scope.current === id) setError(''); }
    catch (failure) { if (scope.current === id) setError(failure instanceof Error ? failure.message : 'Could not refresh goals.'); }
    finally { refreshing.current = false; }
  }, [id, load]);
  useFocusEffect(useCallback(() => {
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    const walks = DeviceEventEmitter.addListener(WALKS_CHANGED, (event: { userId: string }) => { if (event.userId === id) void refresh(); });
    const changes = DeviceEventEmitter.addListener(COMMUNITY_GOALS_CHANGED, (event: { userId: string }) => { if (event.userId === id) void load().catch(() => {}); });
    const app = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { clearInterval(timer); walks.remove(); changes.remove(); app.remove(); };
  }, [id, load, refresh]));
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { await action(); await load(); }
    catch (failure) { Alert.alert('Community goals', failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const show = () => { setOpen(true); void load(true).catch(() => {}); };
  const activeSquad = squad && squad.status === 'active' && !squad.left && Date.parse(squad.endsAt) > Date.now();
  const squadCard: GoalProgress = squad ? squadProgress(squad) : { id: 'squad', category: 'squad', title: 'Start a squad goal', target: 100000, current: 0, endsAt: '', color: '#3b82f6' };
  const visible = [...goals, squadCard].filter(goal => `${goal.title} ${goal.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const actionButton = (label: string, action: () => void, primary = false) => <TouchableOpacity disabled={busy} accessibilityRole="button" onPress={action} style={[s.button, { backgroundColor: primary ? colors.primary : colors.surfaceElevated, borderColor: colors.border, opacity: busy ? .5 : 1 }]}><Text style={{ color: primary ? '#101609' : colors.text, fontWeight: '700', fontSize: 13 }}>{label}</Text></TouchableOpacity>;
  return <View style={{ gap: 12 }}>
    <TutorialAnchor tutorialId="community-goals" style={s.row}><Text style={{ flex: 1, color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: .8 }}>COMMUNITY GOALS</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit community goals" onPress={show} style={{ padding: 5 }}><Ionicons name="options-outline" size={19} color={colors.textMuted} /></TouchableOpacity></TutorialAnchor>
    {!!error && <Text style={[s.caption, { color: colors.textMuted }]}>Could not fully refresh goals. Saved progress is shown.</Text>}
    {!visible.length && <Text style={{ color: colors.textMuted }}>No goals match your search.</Text>}
    {visible.map(goal => {
      const complete = goal.current >= goal.target;
      const hours = Math.max(0, Math.ceil((Date.parse(goal.endsAt) - Date.now()) / 3600000));
      const timing = goal.category === 'squad' && !squad ? 'Create or join' : complete ? 'Complete' : goal.category === 'squad' && (squad?.left || squad?.status === 'closed' || hours === 0) ? 'Ended' : hours < 24 ? `${hours}h left` : `${Math.ceil(hours / 24)}d left`;
      return <TouchableOpacity key={goal.id} accessibilityRole="button" accessibilityLabel={`Manage ${goal.title}`} onPress={show} style={[s.card, { backgroundColor: colors.surfaceElevated }]}>
        <View style={s.row}>
          <View style={[s.icon, { backgroundColor: goal.color + '18' }]}><Ionicons name={complete ? 'checkmark-circle' : goal.category === 'daily' ? 'sunny' : goal.category === 'weekly' ? 'flame' : 'people'} size={22} color={goal.color} /></View>
          <View style={{ flex: 1 }}><View style={s.row}><Text style={{ flex: 1, color: goal.color, fontSize: 10, fontWeight: '800' }}>{goal.category.toUpperCase()} GOAL</Text><Text style={{ color: complete ? colors.primary : colors.textMuted, fontSize: 11 }}>{timing}</Text></View><Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 4 }}>{goal.title}</Text></View>
        </View>
        <View style={[s.row, { marginTop: 13 }]}><Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12 }}>{goal.current.toLocaleString()} / {goal.target.toLocaleString()} steps</Text><Text style={{ color: goal.color, fontSize: 12, fontWeight: '800' }}>{Math.min(100, Math.round(goal.current / goal.target * 100))}%</Text></View>
        <View accessibilityRole="progressbar" accessibilityLabel={goal.title} accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(goal.current / goal.target * 100)) }} style={[s.track, { backgroundColor: colors.border }]}><View style={{ height: 6, width: `${Math.min(100, goal.current / goal.target * 100)}%`, backgroundColor: goal.color }} /></View>
      </TouchableOpacity>;
    })}
    <AppModal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}><View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.row, { padding: 20 }]}><Text style={{ flex: 1, color: colors.text, fontSize: 23, fontWeight: '800' }}>Community goals</Text><TouchableOpacity accessibilityLabel="Close community goals" onPress={() => setOpen(false)}><Ionicons name="close" size={25} color={colors.text} /></TouchableOpacity></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }}>
        <Text style={[s.caption, { color: colors.textMuted }]}>Real saved walks and runs count automatically. Daily goals reset at local midnight; weekly goals reset Monday. Demo activities and cycling are excluded.</Text>
        <Text style={[s.heading, { color: colors.text }]}>Personal targets</Text>
        <Text style={{ color: colors.text }}>Daily steps</Text><TextInput accessibilityLabel="Daily step target" editable={!busy} keyboardType="number-pad" value={daily} onChangeText={setDaily} style={[s.input, { color: colors.text, borderColor: colors.border }]} />
        <Text style={{ color: colors.text }}>Weekly steps</Text><TextInput accessibilityLabel="Weekly step target" editable={!busy} keyboardType="number-pad" value={weekly} onChangeText={setWeekly} style={[s.input, { color: colors.text, borderColor: colors.border }]} />
        {actionButton('Save personal targets', () => run(async () => {
          if (!/^\d+$/.test(daily) || !/^\d+$/.test(weekly)) throw new Error('Enter whole step targets.');
          await saveGoalTargets(id, { daily: Number(daily), weekly: Number(weekly) });
        }), true)}
        <Text style={[s.heading, { color: colors.text }]}>Shared squad goal</Text>
        {squad && <View style={[s.card, { backgroundColor: colors.surfaceElevated }]}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{squad.title}</Text><Text style={[s.caption, { color: colors.textMuted, marginTop: 6 }]}>{squad.totalSteps.toLocaleString()} / {squad.goalSteps.toLocaleString()} steps · {squad.members.filter(member => !member.left).length} walkers</Text>
          <Text selectable style={{ color: colors.primary, marginVertical: 10 }}>Invite code: {squad.code}</Text>
          {squad.members.map(member => <View key={member.id} style={[s.row, { marginVertical: 5 }]}><Text style={{ flex: 1, color: colors.text, fontSize: 12 }}>{member.id === squad.you ? 'You' : member.name}{member.left ? ' (left)' : ''}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{member.steps.toLocaleString()} steps</Text></View>)}
          {activeSquad && <>
            {actionButton('Invite friends', () => { void Share.share({ message: `Join our Footprint squad goal: ${squad.title}, ${squad.goalSteps.toLocaleString()} shared steps. Open Community > Community goals > Join squad goal. Code: ${squad.code}` }).catch(() => {}); })}
            {actionButton(squad.isOwner ? 'End squad goal' : 'Leave squad goal', () => Alert.alert(squad.isOwner ? 'End this squad goal?' : 'Leave this squad goal?', 'Saved contributions stay visible. New steps will stop counting.', [
              { text: 'Cancel', style: 'cancel' }, { text: squad.isOwner ? 'End' : 'Leave', style: 'destructive', onPress: () => run(async () => { await syncSquadGoal(id, squad.isOwner ? 'close' : 'leave'); }) },
            ]))}
          </>}
        </View>}
        {!activeSquad && <>
          <Text style={[s.caption, { color: colors.textMuted }]}>Create a seven-day team goal. Up to 50 friends can contribute walks and runs saved after they join.</Text>
          <TextInput accessibilityLabel="Squad goal name" editable={!busy} value={title} onChangeText={setTitle} maxLength={80} placeholder="Squad goal name" placeholderTextColor={colors.textMuted} style={[s.input, { color: colors.text, borderColor: colors.border }]} />
          <TextInput accessibilityLabel="Shared squad step target" editable={!busy} keyboardType="number-pad" value={target} onChangeText={setTarget} style={[s.input, { color: colors.text, borderColor: colors.border }]} />
          {actionButton('Start squad goal', () => run(async () => { if (!/^\d+$/.test(target)) throw new Error('Enter a whole shared step target.'); await createSquadGoal(id, user?.name || 'Walker', title, Number(target)); }), true)}
          <Text style={[s.heading, { color: colors.text }]}>Join squad goal</Text>
          <TextInput accessibilityLabel="Squad goal invite code" editable={!busy} value={code} onChangeText={setCode} maxLength={12} autoCapitalize="characters" autoCorrect={false} placeholder="12-character invite code" placeholderTextColor={colors.textMuted} style={[s.input, { color: colors.text, borderColor: colors.border }]} />
          {actionButton('Review invite', () => run(async () => {
            const invite = await previewSquadGoal(code); const inviteCode = code;
            Alert.alert(invite.title, `${invite.goalSteps.toLocaleString()} shared steps · ${invite.memberCount}/50 walkers · Ends ${new Date(invite.endsAt).toLocaleDateString()}`, [
              { text: 'Cancel', style: 'cancel' }, { text: 'Join goal', onPress: () => run(async () => { await joinSquadGoal(id, user?.name || 'Walker', inviteCode); setCode(''); }) },
            ]);
          }))}
        </>}
        {!!error && <Text style={[s.caption, { color: colors.textMuted }]}>{error}</Text>}
        {actionButton('Sync goals', () => { void refresh(); })}
        {busy && <ActivityIndicator color={colors.primary} />}
      </ScrollView>
    </View></AppModal>
  </View>;
}
const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, card: { borderRadius: 18, padding: 16 }, icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 }, caption: { fontSize: 12, lineHeight: 18 }, heading: { fontSize: 16, fontWeight: '800', marginTop: 12 }, input: { borderWidth: 1, borderRadius: 14, padding: 13, fontSize: 15 }, button: { alignItems: 'center', padding: 13, borderRadius: 14, borderWidth: 1 } });
