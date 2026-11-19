import { TutorialAnchor } from "@/components/FirstRunTutorial";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, DeviceEventEmitter, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { AppModal } from './AppModal';
import { useAuth } from '@/constants/AuthContext';
import { BRAND_ROUNDED_FONT_EXTRA, useTheme } from '@/constants/ThemeContext';
import { WALKS_CHANGED } from '@/constants/walkStorage';
import { DEFAULT_GOAL_TARGETS, GoalProgress, personalGoalProgress } from '@/constants/communityGoalProgress';
import { COMMUNITY_GOALS_CHANGED, SquadGoal, createSquadGoal, joinSquadGoal, loadCommunityGoals, previewSquadGoal, saveGoalTargets, squadProgress, syncSquadGoal } from '@/constants/communityGoals';

function StepGoalMeter({ current, target, color, border, text, muted }: {
  current: number; target: number; color: string; border: string; text: string; muted: string;
}) {
  const percent = Math.min(1, Math.max(0, current / Math.max(1, target)));
  const circumference = 2 * Math.PI * 80;
  return <View style={{ alignItems: 'center', marginVertical: 22 }}>
    <View style={{ width: 188, height: 188, alignItems: 'center', justifyContent: 'center' }}>
      <Svg pointerEvents="none" width={188} height={188} viewBox="0 0 188 188" style={StyleSheet.absoluteFill}>
        <Circle cx={94} cy={94} r={80} fill="none" stroke={border} strokeWidth={11} />
        <Circle cx={94} cy={94} r={80} fill={color} opacity={.06} />
        {percent > 0 && <Circle cx={94} cy={94} r={80} fill="none" stroke={color} strokeWidth={11} strokeLinecap="round" strokeDasharray={`${circumference * percent} ${circumference}`} transform="rotate(-90 94 94)" />}
      </Svg>
      <Text style={{ color: text, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontSize: 32, fontWeight: '800', letterSpacing: -1 }}>{current.toLocaleString()}</Text>
      <Text style={{ color: muted, fontSize: 12, marginTop: 3 }}>steps logged</Text>
      <Text style={{ color, fontSize: 12, fontWeight: '800', marginTop: 8 }}>{Math.round(percent * 100)}%</Text>
    </View>
  </View>;
}

export function CommunityGoals({ search = '' }: { search?: string }) {
  const { colors } = useTheme(); const { user } = useAuth(); const id = user?.id || 'guest_user';
  const scope = useRef(id); scope.current = id;
  const [goals, setGoals] = useState<GoalProgress[]>(personalGoalProgress([], id, DEFAULT_GOAL_TARGETS));
  const [squad, setSquad] = useState<SquadGoal | null>(null);
  const [daily, setDaily] = useState('4000'), [weekly, setWeekly] = useState('15000');
  const [title, setTitle] = useState('Squad step goal'), [target, setTarget] = useState('100000');
  const [code, setCode] = useState(''), [open, setOpen] = useState(false), [error, setError] = useState('');
  const [teamExpanded, setTeamExpanded] = useState(false), [joinOpen, setJoinOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const refreshing = useRef(false);
  const [selectedGoal, setSelectedGoal] = useState<GoalProgress['category']>('daily');
  const [editingTarget, setEditingTarget] = useState(false);
  const [creatingSquad, setCreatingSquad] = useState(false);
  useEffect(() => { setGoals(personalGoalProgress([], id, DEFAULT_GOAL_TARGETS)); setSquad(null); setOpen(false); setCode(''); setError(''); }, [id]);
  const load = useCallback(async (resetInputs = false) => {
    const result = await loadCommunityGoals(id);
    if (scope.current !== id) return;
    setGoals(result.goals); setSquad(result.squad);
    if (resetInputs) { setDaily(String(result.targets.daily)); setWeekly(String(result.targets.weekly)); }
  }, [id]);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true; setSyncing(true);
    try { await load(); await syncSquadGoal(id); await load(); if (scope.current === id) setError(''); }
    catch (failure) { if (scope.current === id) setError(failure instanceof Error ? failure.message : 'Could not refresh goals.'); }
    finally { refreshing.current = false; if (scope.current === id) setSyncing(false); }
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
  const show = (category: GoalProgress['category'] = 'daily') => { setSelectedGoal(category); setEditingTarget(false); setCreatingSquad(false); setTeamExpanded(false); setJoinOpen(false); setOpen(true); void load(true).catch(() => {}); };
  const activeSquad = squad && squad.status === 'active' && !squad.left && Date.parse(squad.endsAt) > Date.now();
  const squadCard: GoalProgress = squad ? squadProgress(squad) : { id: 'squad', category: 'squad', title: 'Start a squad goal', target: 100000, current: 0, endsAt: '', color: '#3b82f6' };
  const visible = [...goals, squadCard].filter(goal => `${goal.title} ${goal.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const personal = goals.find(goal => goal.category === selectedGoal) || personalGoalProgress([], id, DEFAULT_GOAL_TARGETS).find(goal => goal.category === selectedGoal) || goals[0];
  const actionButton = (label: string, action: () => void, primary = false) => <TouchableOpacity disabled={busy} accessibilityRole="button" onPress={action} style={[s.button, { backgroundColor: primary ? colors.primary : colors.surfaceElevated, borderColor: colors.border, opacity: busy ? .5 : 1 }]}><Text style={{ color: primary ? '#101609' : colors.text, fontWeight: '700', fontSize: 13 }}>{label}</Text></TouchableOpacity>;
  return <View style={{ gap: 12 }}>
    <TutorialAnchor tutorialId="community-goals" style={s.row}><Text style={{ flex: 1, color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: .8 }}>COMMUNITY GOALS</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit community goals" onPress={() => show('daily')} style={{ padding: 5 }}><Ionicons name="options-outline" size={19} color={colors.textMuted} /></TouchableOpacity></TutorialAnchor>
    {!!error && <Text style={[s.caption, { color: colors.textMuted }]}>Could not fully refresh goals. Saved progress is shown.</Text>}
    {!visible.length && <Text style={{ color: colors.textMuted }}>No goals match your search.</Text>}
    {visible.map(goal => {
      const complete = goal.current >= goal.target;
      const hours = Math.max(0, Math.ceil((Date.parse(goal.endsAt) - Date.now()) / 3600000));
      const timing = goal.category === 'squad' && !squad ? 'Create or join' : complete ? 'Complete' : goal.category === 'squad' && (squad?.left || squad?.status === 'closed' || hours === 0) ? 'Ended' : hours < 24 ? `${hours}h left` : `${Math.ceil(hours / 24)}d left`;
      return <TouchableOpacity key={goal.id} accessibilityRole="button" accessibilityLabel={`Manage ${goal.title}`} onPress={() => show(goal.category)} style={[s.card, { backgroundColor: colors.surfaceElevated }]}>
        <View style={s.row}>
          <View style={[s.icon, { backgroundColor: goal.color + '18' }]}><Ionicons name={complete ? 'checkmark-circle' : goal.category === 'daily' ? 'sunny' : goal.category === 'weekly' ? 'flame' : 'people'} size={22} color={goal.color} /></View>
          <View style={{ flex: 1 }}><View style={s.row}><Text style={{ flex: 1, color: goal.color, fontSize: 10, fontWeight: '800' }}>{goal.category.toUpperCase()} GOAL</Text><Text style={{ color: complete ? colors.primary : colors.textMuted, fontSize: 11 }}>{timing}</Text></View><Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 4 }}>{goal.title}</Text></View>
        </View>
        <View style={[s.row, { marginTop: 13 }]}><Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12 }}>{goal.current.toLocaleString()} / {goal.target.toLocaleString()} steps</Text><Text style={{ color: goal.color, fontSize: 12, fontWeight: '800' }}>{Math.min(100, Math.round(goal.current / goal.target * 100))}%</Text></View>
        <View accessibilityRole="progressbar" accessibilityLabel={goal.title} accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(goal.current / goal.target * 100)) }} style={[s.track, { backgroundColor: colors.border }]}><View style={{ height: 6, width: `${Math.min(100, goal.current / goal.target * 100)}%`, backgroundColor: goal.color }} /></View>
      </TouchableOpacity>;
    })}
    <AppModal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: 16 }}>
        <View style={[s.row, { padding: 20 }]}>
          <TouchableOpacity hitSlop={12} accessibilityRole="button" accessibilityLabel="Close community goals" onPress={() => setOpen(false)}><Ionicons name="close" size={25} color={colors.text} /></TouchableOpacity>
          <Text style={[s.detailTitle, { color: colors.text, flex: 1 }]}>Community Goals</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sync community goals" disabled={syncing || busy} onPress={() => { void refresh(); }} style={[s.headerIconWrap, { backgroundColor: colors.surfaceElevated }]}>
            {syncing || busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={18} color={colors.textMuted} />}
          </TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 45 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
            {(['daily', 'weekly', 'squad'] as const).map(category => <TouchableOpacity key={category} accessibilityRole="tab" accessibilityState={{ selected: selectedGoal === category }} disabled={busy} onPress={() => { setSelectedGoal(category); setEditingTarget(false); }} style={[s.goalTab, { borderColor: selectedGoal === category ? colors.primary : colors.border, backgroundColor: selectedGoal === category ? colors.primary : colors.surfaceElevated }]}>
              <Text style={[s.small, { color: selectedGoal === category ? '#101609' : colors.text }]}>{category === 'daily' ? 'Daily' : category === 'weekly' ? 'Weekly' : 'Squad'}</Text>
            </TouchableOpacity>)}
          </ScrollView>
          {!!error && <View style={[s.detailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}><Text style={[s.detailCaption, { color: colors.textMuted }]}>Not synced: {error}</Text>{actionButton('Retry', () => { void refresh(); })}</View>}

          {selectedGoal !== 'squad' && <>
            {!editingTarget ? <View style={[s.detailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <View style={s.row}>
                <View style={{ flex: 1 }}><Text style={[s.eyebrow, { color: colors.primary }]}>{personal.current >= personal.target ? 'GOAL COMPLETE' : selectedGoal === 'daily' ? 'MAKE TODAY COUNT' : 'ONE STEP AT A TIME'}</Text><Text style={[s.detailCardTitle, { color: colors.text }]}>{selectedGoal === 'daily' ? 'Your daily goal' : 'Your weekly goal'}</Text></View>
                <View style={[s.iconBadge, { backgroundColor: colors.primary + '18' }]}><Ionicons name={personal.current >= personal.target ? 'trophy' : selectedGoal === 'daily' ? 'sunny-outline' : 'flame-outline'} size={20} color={colors.primary} /></View>
              </View>
              <StepGoalMeter current={personal.current} target={personal.target} color={colors.primary} border={colors.border} text={colors.text} muted={colors.textMuted} />
              <View style={s.row}>
                <View style={{ flex: 1 }}><Text style={[s.value, { color: colors.text }]}>{personal.target.toLocaleString()}</Text><Text style={[s.detailCaption, { color: colors.textMuted }]}>step target</Text></View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={[s.value, { color: colors.text }]}>{Math.max(0, personal.target - personal.current).toLocaleString()}</Text><Text style={[s.detailCaption, { color: colors.textMuted }]}>steps to go</Text></View>
              </View>
              <View style={[s.row, { marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Ionicons name="time-outline" size={15} color={colors.textMuted} /><Text style={[s.detailCaption, { color: colors.textMuted, flex: 1 }]}>{selectedGoal === 'daily' ? 'Resets at midnight' : 'Resets Monday'} | {new Date(personal.endsAt).toLocaleDateString()}</Text>
                <TouchableOpacity disabled={busy} accessibilityRole="button" onPress={() => { setDaily(String(goals.find(goal => goal.category === 'daily')?.target ?? DEFAULT_GOAL_TARGETS.daily)); setWeekly(String(goals.find(goal => goal.category === 'weekly')?.target ?? DEFAULT_GOAL_TARGETS.weekly)); setEditingTarget(true); }} style={[s.button, { borderColor: colors.border, backgroundColor: colors.background }]}><Text style={[s.small, { color: colors.text }]}>Edit target</Text></TouchableOpacity>
              </View>
            </View> : <View style={[s.detailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <View style={[s.row, { marginBottom: 12 }]}><Text style={[s.heading, { flex: 1, color: colors.text, marginVertical: 0 }]}>{selectedGoal === 'daily' ? 'Set your daily target' : 'Set your weekly target'}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel target editing" disabled={busy} onPress={() => setEditingTarget(false)}><Ionicons name="close" size={20} color={colors.textMuted} /></TouchableOpacity></View>
              <Text style={[s.detailCaption, { color: colors.textMuted, marginBottom: 16 }]}>Choose a step goal that fits your routine. Saved walks and runs fill your progress automatically.</Text>
              <Text style={[s.small, { color: colors.text, marginBottom: 8 }]}>{selectedGoal === 'daily' ? 'Daily steps' : 'Weekly steps'}</Text>
              <TextInput accessibilityLabel={selectedGoal === 'daily' ? 'Daily step target' : 'Weekly step target'} editable={!busy} keyboardType="number-pad" value={selectedGoal === 'daily' ? daily : weekly} onChangeText={selectedGoal === 'daily' ? setDaily : setWeekly} style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]} />
              {actionButton('Save target', () => run(async () => {
                if (!/^\d+$/.test(selectedGoal === 'daily' ? daily : weekly)) throw new Error('Enter a whole step target.');
                await saveGoalTargets(id, {
                  daily: selectedGoal === 'daily' ? Number(daily) : goals.find(goal => goal.category === 'daily')?.target ?? DEFAULT_GOAL_TARGETS.daily,
                  weekly: selectedGoal === 'weekly' ? Number(weekly) : goals.find(goal => goal.category === 'weekly')?.target ?? DEFAULT_GOAL_TARGETS.weekly,
                }); setEditingTarget(false);
              }), true)}
            </View>}
            <View style={[s.detailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <View style={s.row}><Ionicons name="footsteps-outline" size={20} color={colors.primary} /><Text style={[s.small, { color: colors.text }]}>Walk. Save. Make progress.</Text></View>
              <Text style={[s.detailCaption, { color: colors.textMuted, marginTop: 8 }]}>Finish and save a walk or run on the map. Your steps appear here automatically, with your progress shown after each activity.</Text>
            </View>
          </>}

          {selectedGoal === 'squad' && <>
          {!creatingSquad && <View style={[s.detailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[s.eyebrow, { color: colors.primary }]}>{squad?.status === 'completed' ? 'SQUAD GOAL COMPLETE' : squad?.status === 'closed' ? 'SQUAD GOAL ENDED' : squad?.left ? 'YOU LEFT THIS GOAL' : squad && !activeSquad ? 'SQUAD GOAL ENDED' : 'WALK TOGETHER'}</Text>
                <Text style={[s.detailCardTitle, { color: colors.text }]}>{squad?.title || 'Your squad goal'}</Text>
              </View>
              <View style={[s.iconBadge, { backgroundColor: colors.primary + '18' }]}><Ionicons name={squad?.status === 'completed' ? 'trophy' : 'people'} size={20} color={colors.primary} /></View>
            </View>
            <StepGoalMeter current={squad?.totalSteps ?? 0} target={squad?.goalSteps ?? 100000} color={colors.primary} border={colors.border} text={colors.text} muted={colors.textMuted} />
            <View style={s.row}>
              <View style={{ flex: 1 }}><Text style={[s.value, { color: colors.text }]}>{(squad?.goalSteps ?? 100000).toLocaleString()}</Text><Text style={[s.detailCaption, { color: colors.textMuted }]}>shared step target</Text></View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={[s.value, { color: colors.text }]}>{Math.max(0, (squad?.goalSteps ?? 100000) - (squad?.totalSteps ?? 0)).toLocaleString()}</Text><Text style={[s.detailCaption, { color: colors.textMuted }]}>steps to go</Text></View>
            </View>
            <View style={[s.row, { marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <Ionicons name="time-outline" size={15} color={colors.textMuted} />
              <Text style={[s.detailCaption, { color: colors.textMuted, flex: 1 }]}>{squad ? `Ends ${new Date(squad.endsAt).toLocaleDateString()}` : '7-day team goal'}</Text>
              {activeSquad && squad ? <TouchableOpacity disabled={busy} accessibilityRole="button" onPress={() => { void Share.share({ message: `Join our Footprint squad goal: ${squad.title}, ${squad.goalSteps.toLocaleString()} shared steps. Open Community > Community goals > Join squad goal. Code: ${squad.code}` }).catch(() => {}); }} style={[s.button, { borderColor: colors.border, backgroundColor: colors.background }]}><Text style={[s.small, { color: colors.text }]}>Invite friends</Text></TouchableOpacity>
                : <TouchableOpacity disabled={busy} accessibilityRole="button" onPress={() => setCreatingSquad(true)} style={[s.button, { borderColor: colors.border, backgroundColor: colors.background }]}><Text style={[s.small, { color: colors.text }]}>{squad ? 'Start another' : 'Start goal'}</Text></TouchableOpacity>}
            </View>
            {activeSquad && squad && <Text selectable style={[s.detailCaption, { color: colors.textMuted, marginTop: 8 }]}>Invite code: {squad.code}</Text>}
            {squad && <>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: teamExpanded }} onPress={() => setTeamExpanded(value => !value)} style={[s.row, { justifyContent: 'space-between', marginTop: 16 }]}>
                <Text style={[s.small, { color: colors.text }]}>Team progress ({squad.members.filter(member => !member.left).length})</Text><Ionicons name={teamExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textMuted} />
              </TouchableOpacity>
              {teamExpanded && <>
                {squad.members.map(member => <View key={member.id} style={[s.row, s.member, { borderColor: colors.border }]}><Text style={[s.small, { flex: 1, color: colors.text }]}>{member.id === squad.you ? 'You' : member.name}{member.left ? ' (left)' : ''}</Text><Text style={[s.small, { color: colors.primary }]}>{member.steps.toLocaleString()} steps</Text></View>)}
                {activeSquad && actionButton(squad.isOwner ? 'End squad goal' : 'Leave squad goal', () => Alert.alert(squad.isOwner ? 'End this squad goal?' : 'Leave this squad goal?', 'Saved contributions stay visible. New steps will stop counting.', [
                  { text: 'Cancel', style: 'cancel' }, { text: squad.isOwner ? 'End' : 'Leave', style: 'destructive', onPress: () => run(async () => { await syncSquadGoal(id, squad.isOwner ? 'close' : 'leave'); }) },
                ]))}
              </>}
            </>}
          </View>}

          {!activeSquad && creatingSquad && <View style={[s.detailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={[s.row, { marginBottom: 12 }]}><Text style={[s.heading, { color: colors.text, flex: 1, marginVertical: 0 }]}>Start a squad goal</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel squad goal creation" disabled={busy} onPress={() => setCreatingSquad(false)}><Ionicons name="close" size={20} color={colors.textMuted} /></TouchableOpacity></View>
            <Text style={[s.detailCaption, { color: colors.textMuted, marginBottom: 14 }]}>Choose a shared step target and walk toward it together for seven days.</Text>
            <Text style={[s.small, { color: colors.text, marginBottom: 8 }]}>Goal name</Text>
            <TextInput accessibilityLabel="Squad goal name" editable={!busy} value={title} onChangeText={setTitle} maxLength={80} placeholder="Squad goal name" placeholderTextColor={colors.textMuted} style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]} />
            <Text style={[s.small, { color: colors.text, marginBottom: 8 }]}>Shared step target</Text>
            <TextInput accessibilityLabel="Shared squad step target" editable={!busy} keyboardType="number-pad" value={target} onChangeText={setTarget} style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]} />
            <Text style={[s.detailCaption, { color: colors.textMuted, marginBottom: 12 }]}>Up to 50 friends. Walks and runs saved after joining count toward your team's goal.</Text>
            {actionButton('Start squad goal', () => run(async () => { if (!/^\d+$/.test(target)) throw new Error('Enter a whole shared step target.'); await createSquadGoal(id, user?.name || 'Walker', title, Number(target)); setCreatingSquad(false); }), true)}
          </View>}

          {!activeSquad && <View style={[s.detailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, marginTop: 4 }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: joinOpen }} onPress={() => setJoinOpen(value => !value)} style={[s.row, { justifyContent: 'space-between' }]}>
              <View style={[s.row, { flex: 1 }]}><Ionicons name="people-outline" size={18} color={colors.primary} /><Text style={[s.small, { color: colors.text }]}>Join your friends</Text></View>
              <Ionicons name={joinOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {!joinOpen && <Text style={[s.detailCaption, { color: colors.textMuted, marginTop: 6 }]}>Have a code? Review the goal before you join.</Text>}
            {joinOpen && <View style={{ marginTop: 12 }}>
              <TextInput accessibilityLabel="Squad goal invite code" editable={!busy} value={code} onChangeText={setCode} maxLength={12} autoCapitalize="characters" autoCorrect={false} placeholder="12-character invite code" placeholderTextColor={colors.textMuted} style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]} />
              {actionButton('Review invite', () => run(async () => {
                const invite = await previewSquadGoal(code); const inviteCode = code;
                Alert.alert(invite.title, `${invite.goalSteps.toLocaleString()} shared steps | ${invite.memberCount}/50 walkers | Ends ${new Date(invite.endsAt).toLocaleDateString()}`, [
                  { text: 'Cancel', style: 'cancel' }, { text: 'Join goal', onPress: () => run(async () => { await joinSquadGoal(id, user?.name || 'Walker', inviteCode); setCode(''); setJoinOpen(false); setCreatingSquad(false); }) },
                ]);
              }), true)}
            </View>}
          </View>}
          </>}
          <Text style={[s.detailCaption, { color: colors.textMuted, marginTop: 2 }]}>Daily targets reset at local midnight; weekly targets reset Monday. Only real saved walks and runs count. Cycling and demo activities are excluded.</Text>
        </ScrollView>
      </View>
    </AppModal>
  </View>;
}
const s = StyleSheet.create({
  goalTab: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 10, marginVertical: 4 },
  detailTitle: { fontSize: 24, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontWeight: '800' },
  detailCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: .08, shadowRadius: 5, elevation: 2 },
  detailCardTitle: { fontSize: 22, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontWeight: '800', marginVertical: 3, letterSpacing: -.4 },
  detailCaption: { fontSize: 11.5, lineHeight: 17, fontWeight: '500' },
  small: { fontSize: 12, fontWeight: '700' }, value: { fontSize: 18, fontWeight: '800', fontFamily: BRAND_ROUNDED_FONT_EXTRA },
  eyebrow: { fontSize: 9.5, fontWeight: '800', letterSpacing: .8 },
  headerIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  member: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
 row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, card: { borderRadius: 18, padding: 16 }, icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 }, caption: { fontSize: 12, lineHeight: 18 }, heading: { fontSize: 16, fontWeight: '800', fontFamily: BRAND_ROUNDED_FONT_EXTRA, marginVertical: 12 }, input: { borderWidth: 1, borderRadius: 14, padding: 13, fontSize: 15, marginBottom: 10 }, button: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, marginVertical: 4, borderRadius: 14, borderWidth: 1 } });
