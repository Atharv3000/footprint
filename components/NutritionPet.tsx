import { TutorialAnchor } from "@/components/FirstRunTutorial";
import { DEFAULT_PET_APPEARANCE, PetAppearance } from '@/constants/petAppearance';
import { loadNutritionPetProfile, saveNutritionPetProfile } from '@/constants/nutritionPetProfile';
import { PetCustomizerModal } from './PetCustomizerModal';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_ROUNDED_FONT_EXTRA, useTheme } from '@/constants/ThemeContext';
import type { DietGoal, MealLog } from '@/constants/nutritionStorage';
import { computeNutritionPet, nutritionPetDialogue } from '@/constants/nutritionPet';
import { NutritionPetArtwork } from './NutritionPetArtwork';

export function NutritionPet({ userId, meals, target, goal, todayKey, active, ready, error, onLogMeal, onAdjustGoal, onRetry }: {
  userId: string; meals: MealLog[]; target: number; goal: DietGoal; todayKey: string;
  active: boolean; ready: boolean; error?: string; onLogMeal: () => void; onAdjustGoal: () => void; onRetry: () => void;
}) {
  const { colors } = useTheme();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    if (!active || !ready || error) return;
    const refresh = () => setClock(new Date());
    refresh();
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => { if (timer) clearInterval(timer); timer = setInterval(refresh, 60000); };
    if (AppState.currentState === 'active') start();
    const listener = AppState.addEventListener('change', state => {
      if (timer) clearInterval(timer);
      if (state === 'active') { refresh(); start(); }
    });
    return () => { if (timer) clearInterval(timer); listener.remove(); };
  }, [active, ready, error, todayKey]);
  const petDay = `${clock.getFullYear()}-${String(clock.getMonth()+1).padStart(2, '0')}-${String(clock.getDate()).padStart(2, '0')}`;
  const pet = useMemo(() => computeNutritionPet(meals, target, goal, petDay, clock), [meals, target, goal, petDay, clock]);
  const [name, setName] = useState('Pip'); const [draft, setDraft] = useState('Pip'); const [renaming, setRenaming] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false); const [celebration, setCelebration] = useState(0);
  const [appearance, setAppearance] = useState<PetAppearance>(DEFAULT_PET_APPEARANCE);
  const [customizing, setCustomizing] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [petted, setPetted] = useState(false);
  const [dialogueBeat, setDialogueBeat] = useState(0);
  const [justFed, setJustFed] = useState(false);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRub = useRef(0);
  const onHeadRub = useCallback(() => {
    if (!active || !ready || error) return;
    setPetted(true);
    if (happyTimer.current) clearTimeout(happyTimer.current);
    happyTimer.current = setTimeout(() => setPetted(false), 3500);
    if (Date.now()-lastRub.current > 700) {
      lastRub.current = Date.now();
      setCelebration(value => value+1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [active, ready, error]);
  useEffect(() => {
    setPetted(false); lastRub.current = 0;
    return () => { if (happyTimer.current) clearTimeout(happyTimer.current); };
  }, [active, userId]);
  useEffect(() => {
    if (!active || !ready || error) return;
    const timer = setInterval(() => setDialogueBeat(value => value + 1), 14000);
    return () => clearInterval(timer);
  }, [active, ready, error]);
  useEffect(() => {
    if (!justFed) return;
    const timer = setTimeout(() => setJustFed(false), 4000);
    return () => clearTimeout(timer);
  }, [justFed, celebration]);
  useEffect(() => { setJustFed(false); setDialogueBeat(0); }, [userId, petDay, active]);
  const account = useRef(userId); account.current = userId;
  const previous = useRef<{ date: string; userId: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    let alive = true;
    setName('Pip'); setDraft('Pip'); setRenaming(false); previous.current = null;
    setAppearance({ ...DEFAULT_PET_APPEARANCE }); setCustomizing(false); setProfileReady(false);
    loadNutritionPetProfile(userId).then(saved => {
      if (!alive || account.current !== userId) return;
      setName(saved.name); setDraft(saved.name); setAppearance(saved.appearance);
    }).catch(() => {}).finally(() => { if (alive && account.current === userId) setProfileReady(true); });
    return () => { alive = false; };
  }, [userId]);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (!ready || !active) return;
    const ids = new Set(pet.todayMealIds);
    const old = previous.current;
    if (old && old.date === petDay && old.userId === userId && pet.todayMealIds.some(id => !old.ids.has(id))) {
      setCelebration(value => value+1);
      setJustFed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    previous.current = { date: petDay, userId, ids };
  }, [pet.todayMealIds, petDay, userId, ready, active]);
  const saveName = async () => {
    const clean = draft.replace(/[\u0000-\u001f]/g, '').trim().slice(0,18) || 'Pip';
    try {
      await saveNutritionPetProfile(userId, { name: clean });
      if (account.current === userId) { setName(clean); setDraft(clean); setRenaming(false); }
    } catch { Alert.alert('Name not saved', 'Try renaming your pet again.'); }
  };
  const saveAppearance = async (value: PetAppearance) => {
    const saved = await saveNutritionPetProfile(userId, { appearance: value });
    if (account.current === userId) setAppearance(saved.appearance);
  };
  const pettingLines = appearance.species === 'fox'
    ? ['You found my happy spot! Watch that tail go!', 'Wiggle wiggle! More head rubs, please.', 'My tail has a mind of its own!']
    : appearance.species === 'bunny'
    ? ['Boing! Those head rubs put a spring in my paws!', 'Happy hops for my favorite human!', 'One head rub, a whole lot of happy hops!']
    : ['Purrr… those head rubs are the best!', 'You found the purr button! Happy little paws.', 'More head rubs, please! This is my favorite.'];
  const accent = goal === 'bulk' ? '#62B9F5' : goal === 'cut' ? colors.primary : '#B9A1F5';
  const text = { color: colors.text }, muted = { color: colors.textMuted };
  const plan = goal === 'cut' ? 'Cut' : goal === 'bulk' ? 'Bulk' : 'Maintain';
  return <View style={s.content}>
    <View style={s.row}><View style={{ flex: 1 }}><Text style={[s.eyebrow, { color: accent }]}>YOUR DAILY COMPANION</Text><Text style={[s.title, text]}>{name}</Text></View>
      <View style={[s.levelBadge, { backgroundColor: colors.primaryBg }]}><Ionicons name="sparkles" size={15} color={colors.primary} /><Text style={[s.small, { color: colors.primary }]}>Lv. {pet.level}</Text></View>
      <TouchableOpacity accessibilityLabel={`Rename ${name}`} disabled={!profileReady} hitSlop={10} onPress={() => setRenaming(value => !value)} style={[s.iconButton, { backgroundColor: colors.surfaceElevated }]}><Ionicons name="pencil-outline" size={18} color={colors.textMuted} /></TouchableOpacity>
    </View>
    {renaming && <View style={s.row}><TextInput accessibilityLabel="Pet name" value={draft} onChangeText={setDraft} maxLength={18} autoFocus returnKeyType="done" onSubmitEditing={saveName} style={[s.input, text, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]} /><TouchableOpacity onPress={saveName} style={[s.save, { backgroundColor: colors.primary }]}><Text style={s.darkButton}>Save</Text></TouchableOpacity></View>}
    <View style={[s.petCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <View style={s.row}><View style={[s.mood, { backgroundColor: colors.primaryBg }]}><View style={[s.dot, { backgroundColor: accent }]} /><Text style={[s.small, text]}>{ready ? petted ? 'Feeling loved' : pet.label : 'Checking your diary'}</Text></View>
        <TouchableOpacity accessibilityLabel="Change nutrition goal" onPress={onAdjustGoal} style={[s.plan, { borderColor: colors.border }]}><Text style={[s.small, { color: accent }]}>{plan} plan</Text><Ionicons name="chevron-down" size={12} color={accent} /></TouchableOpacity>
      </View>
      <View style={[s.dialogue, { backgroundColor: colors.background }]}><Text accessibilityLiveRegion="polite" style={[s.dialogueText, text]}>{error || (!ready ? 'Getting your latest food logs...' : petted ? pettingLines[celebration % pettingLines.length] : justFed ? 'Diary updated! Thanks for checking in with me.' : nutritionPetDialogue(pet, dialogueBeat))}</Text></View>
      <TutorialAnchor tutorialId="pet-care" style={s.artwork}><NutritionPetArtwork state={pet} appearance={appearance} active={active && ready && !error} reduceMotion={reduceMotion} celebration={celebration} petted={petted} onHeadRub={onHeadRub} /></TutorialAnchor>
      {ready && !error && pet.rhythm && <View style={{ marginBottom: 10, gap: 3 }}>
        <Text style={[s.small, text]}>{pet.rhythm.period} · {pet.rhythm.lastLogLabel}</Text>
        <Text style={[s.caption, muted]}>{pet.rhythm.reason}</Text>
      </View>}
      <Text style={[s.caption, muted, { textAlign: 'center', marginBottom: 12 }]}>Rub back and forth on my head.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Customize ${name}`} disabled={!profileReady}
        onPress={() => setCustomizing(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 11, borderWidth: 1, borderRadius: 15, borderColor: colors.border, marginBottom: 14 }}>
        <Ionicons name="color-palette-outline" size={18} color={colors.primary} /><Text style={[s.small, { color: colors.primary }]}>{profileReady ? `Customize ${name}` : 'Loading pet style…'}</Text>
      </TouchableOpacity>
      {!ready && !error && <ActivityIndicator color={colors.primary} />}
      {!!error && <TouchableOpacity onPress={onRetry}><Text style={[s.small, { color: colors.primary, textAlign: 'center', marginBottom: 12 }]}>Retry diary</Text></TouchableOpacity>}
      <View style={s.row}><View style={s.stat}><Text style={[s.value, text]}>{Math.round(pet.calories).toLocaleString()} <Text style={[s.caption, muted]}>kcal</Text></Text><Text style={[s.caption, muted]}>logged today</Text></View><View style={[s.stat, { alignItems: 'flex-end' }]}><Text style={[s.value, text]}>{Math.round(pet.target).toLocaleString()} <Text style={[s.caption, muted]}>kcal</Text></Text><Text style={[s.caption, muted]}>{plan.toLowerCase()} target</Text></View></View>
      <View accessibilityRole="progressbar" accessibilityLabel={`${name}'s daily calorie progress`} accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(100, pet.percent)) }} style={[s.track, { backgroundColor: colors.border }]}><View style={{ width: `${Math.min(100, pet.percent)}%`, height: 8, backgroundColor: accent }} /></View>
      <Text style={[s.caption, muted, { marginBottom: 16 }]}>{Math.round(pet.percent)}% of today's target | {pet.todayMealIds.length} meal {pet.todayMealIds.length === 1 ? 'entry' : 'entries'}</Text>
      <View style={s.row}>
        <TouchableOpacity accessibilityRole="button" onPress={onLogMeal} style={[s.feed, { backgroundColor: colors.primary }]}><Ionicons name="add" size={19} color="#101609" /><Text style={s.darkButton}>Feed {name}</Text></TouchableOpacity>
      </View>
      <Text style={[s.caption, muted, { textAlign: 'center', marginTop: 9 }]}>Logging a real meal feeds your pet.</Text>
    </View>
    <View style={[s.careCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <View style={s.row}><Ionicons name="heart-outline" size={19} color={colors.primary} /><Text style={[s.heading, text, { flex: 1 }]}>Growing together</Text><Text style={[s.small, muted]}>Level {pet.level}</Text></View>
      <View style={[s.row, { marginTop: 16 }]}><View style={s.stat}><Text style={[s.value, text]}>{pet.loggedDays}</Text><Text style={[s.caption, muted]}>days cared for</Text></View><View style={s.stat}><Text style={[s.value, text]}>{pet.streak}</Text><Text style={[s.caption, muted]}>day logging streak</Text></View></View>
      <View style={[s.track, { backgroundColor: colors.border, marginTop: 16 }]}><View style={{ width: `${pet.careProgress*100}%`, height: 8, backgroundColor: colors.primary }} /></View>
      <Text style={[s.caption, muted]}>{pet.daysToNextLevel} more logged {pet.daysToNextLevel === 1 ? 'day' : 'days'} to level {pet.level+1}.</Text>
    </View>
    <Text style={[s.caption, muted, { textAlign: 'center', paddingHorizontal: 8 }]}>Fullness starts fresh each day. Care levels grow from logging days, not eating more or less. Your pet follows your diary, so missing logs do not mean missing meals.</Text>
    {customizing && <PetCustomizerModal visible name={name} appearance={appearance} state={pet} reduceMotion={reduceMotion}
      onClose={() => setCustomizing(false)} onSave={saveAppearance} />}
  </View>;
}

const s = StyleSheet.create({
  content: { gap: 16 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, stat: { flex: 1 },
  title: { fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontSize: 30, fontWeight: '800', marginTop: 4 }, eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  small: { fontSize: 12, fontWeight: '700' }, caption: { fontSize: 11, lineHeight: 17 }, value: { fontSize: 22, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontWeight: '800' }, heading: { fontSize: 16, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontWeight: '800' },
  petCard: { padding: 16, borderRadius: 24, borderWidth: 1, overflow: 'hidden' }, careCard: { padding: 16, borderRadius: 20, borderWidth: 1 },
  levelBadge: { flexDirection: 'row', gap: 5, borderRadius: 14, padding: 10, alignItems: 'center' }, iconButton: { padding: 10, borderRadius: 14 },
  mood: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 9 }, dot: { width: 6, height: 6, borderRadius: 3 }, plan: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 9, borderRadius: 14, borderWidth: 1 },
  dialogue: { padding: 14, borderRadius: 16, marginTop: 16 }, dialogueText: { fontSize: 13, lineHeight: 20 }, artwork: { alignItems: 'center', marginTop: 4, marginBottom: 8 },
  track: { height: 8, borderRadius: 5, overflow: 'hidden', marginTop: 12, marginBottom: 8 },
  feed: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16 }, darkButton: { color: '#101609', fontSize: 13, fontWeight: '800' },
  input: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 1, fontSize: 15 }, save: { padding: 13, borderRadius: 14 },
});
