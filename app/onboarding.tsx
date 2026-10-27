import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/constants/AuthContext';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import {
  UnitSystem,
  GenderOption,
  kgToLbs,
  lbsToKg,
  cmToInches,
  inchesToCm,
} from '@/constants/userProfile';
import { FlipNumberPicker } from '@/components/FlipNumberPicker';
import { getOrCreateMyUsername, setMyUsername } from '@/constants/socialEngine';
import { ensureMockDataSeeded } from '@/constants/stepsStorage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const { user, profile, updateProfile } = useAuth();
  const { colors } = useTheme();

  const scrollRef = useRef<ScrollView>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [saving, setSaving] = useState(false);

  // Step 1: Identity
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [usernameInput, setUsernameInput] = useState('');

  // Step 2: Measurements
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('us_customary');
  const [weightLbs, setWeightLbs] = useState(154);
  const [heightFeet, setHeightFeet] = useState(5);
  const [heightInches, setHeightInches] = useState(9);
  const [weightKg, setWeightKg] = useState(70);
  const [heightCm, setHeightCm] = useState(175);
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState<GenderOption>('na');

  // Step 3: Steps Goal
  const [stepsGoal, setStepsGoal] = useState(8000);
  const [stepsInputText, setStepsInputText] = useState('8000');

  const animateProgress = (step: number) => {
    Animated.spring(progressAnim, {
      toValue: (step + 1) / TOTAL_STEPS,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  };

  const goToStep = (step: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    scrollRef.current?.scrollTo({ x: step * SCREEN_WIDTH, animated: true });
    setCurrentStep(step);
    animateProgress(step);
  };

  const handleNext = () => {
    if (currentStep === 0) {
      if (!nameInput.trim()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return;
      }
    }
    if (currentStep < TOTAL_STEPS - 1) {
      goToStep(currentStep + 1);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      // Save username
      if (user?.id && usernameInput.trim()) {
        await setMyUsername(user.id, usernameInput.trim()).catch(() => {});
      } else if (user?.id) {
        await getOrCreateMyUsername(user.id, nameInput.trim()).catch(() => {});
      }

      // Compute canonical values
      let canonicalKg = unitSystem === 'us_customary' ? lbsToKg(weightLbs) : weightKg;
      let canonicalCm = unitSystem === 'us_customary' ? inchesToCm(heightFeet * 12 + heightInches) : heightCm;
      let saveFeet = unitSystem === 'us_customary' ? heightFeet : Math.floor(cmToInches(canonicalCm) / 12);
      let saveInches = unitSystem === 'us_customary' ? heightInches : Math.round(cmToInches(canonicalCm) % 12);

      const parsedGoal = parseInt(stepsInputText.replace(/\D/g, '')) || stepsGoal;
      const clampedGoal = Math.max(1000, Math.min(50000, parsedGoal));

      await updateProfile({
        name: nameInput.trim() || 'Walker',
        weightKg: canonicalKg,
        heightCm: canonicalCm,
        heightFeet: saveFeet,
        heightInches: saveInches,
        age,
        gender,
        unitSystem,
        stepsGoal: clampedGoal,
        hasCompletedSetup: true,
      });

      // Seed mock step data
      if (user?.id) {
        await ensureMockDataSeeded(user.id, clampedGoal);
      }

      router.replace('/(tabs)');
    } catch (e) {
      console.error('Onboarding save failed', e);
      router.replace('/(tabs)');
    }
    setSaving(false);
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const stepLabels = ['Who are you?', 'Your body', 'Your goal'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.logoMark, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="footsteps" size={22} color={colors.primary} />
        </View>
        <View style={styles.stepInfo}>
          <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
            Step {currentStep + 1} of {TOTAL_STEPS - 1} — {stepLabels[Math.min(currentStep, stepLabels.length - 1)]}
          </Text>
        </View>
        {currentStep > 0 && (
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.surfaceElevated }]}
            onPress={() => goToStep(currentStep - 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <Animated.View style={[styles.progressFill, { backgroundColor: colors.primary, width: progressWidth }]} />
      </View>

      {/* Scrollable Steps */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* ──────── STEP 1: Identity ──────── */}
        <KeyboardAvoidingView
          style={{ width: SCREEN_WIDTH }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.stepTitle, { color: colors.text }]}>Let's set up your profile</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              This helps us personalize your experience.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>NAME</Text>
              <View style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="person-outline" size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Your name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>USERNAME</Text>
              <View style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.atSign, { color: colors.primary }]}>@</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={usernameInput}
                  onChangeText={(t) => setUsernameInput(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.primary }, !nameInput.trim() && styles.nextBtnDisabled]}
              onPress={handleNext}
              activeOpacity={0.85}
              disabled={!nameInput.trim()}
            >
              <Text style={styles.nextBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#09090b" />
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ──────── STEP 2: Measurements ──────── */}
        <ScrollView style={{ width: SCREEN_WIDTH }} contentContainerStyle={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Your body measurements</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
            Used to calculate accurate calorie burns.
          </Text>

          {/* Units Toggle */}
          <View style={[styles.pillTrack, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['us_customary', 'metric'] as UnitSystem[]).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.pillOption, unitSystem === u && [styles.pillOptionActive, { backgroundColor: colors.primary }]]}
                onPress={() => setUnitSystem(u)}
                activeOpacity={0.85}
              >
                <Text style={[styles.pillText, { color: colors.textMuted }, unitSystem === u && styles.pillTextActive]}>
                  {u === 'us_customary' ? 'US Customary' : 'Metric'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.measureRow}>
            <View style={styles.measureCol}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                {unitSystem === 'us_customary' ? 'WEIGHT (LBS)' : 'WEIGHT (KG)'}
              </Text>
              <FlipNumberPicker
                value={unitSystem === 'us_customary' ? weightLbs : weightKg}
                min={unitSystem === 'us_customary' ? 60 : 30}
                max={unitSystem === 'us_customary' ? 450 : 210}
                step={1}
                unit={unitSystem === 'us_customary' ? 'lbs' : 'kg'}
                onChange={(v) => unitSystem === 'us_customary' ? setWeightLbs(v) : setWeightKg(v)}
              />
            </View>
            <View style={styles.measureCol}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>AGE</Text>
              <FlipNumberPicker value={age} min={13} max={99} step={1} unit="yrs" onChange={setAge} />
            </View>
          </View>

          {unitSystem === 'us_customary' ? (
            <View style={styles.measureRow}>
              <View style={styles.measureCol}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>HEIGHT (FT)</Text>
                <FlipNumberPicker value={heightFeet} min={3} max={8} step={1} unit="ft" onChange={setHeightFeet} />
              </View>
              <View style={styles.measureCol}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>HEIGHT (IN)</Text>
                <FlipNumberPicker value={heightInches} min={0} max={11} step={1} unit="in" onChange={setHeightInches} />
              </View>
            </View>
          ) : (
            <View style={styles.measureRow}>
              <View style={[styles.measureCol, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>HEIGHT (CM)</Text>
                <FlipNumberPicker value={heightCm} min={90} max={250} step={1} unit="cm" onChange={setHeightCm} />
              </View>
            </View>
          )}

          {/* Sex */}
          <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 12 }]}>SEX</Text>
          <View style={[styles.genderRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['female', 'male', 'na'] as GenderOption[]).map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.genderChip, gender === g && [styles.genderChipActive, { backgroundColor: colors.primary }]]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setGender(g); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.genderChipText, { color: gender === g ? '#09090b' : colors.textMuted }]}>
                  {g === 'female' ? 'Female' : g === 'male' ? 'Male' : '-'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.primary }]} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#09090b" />
          </TouchableOpacity>
        </ScrollView>

        {/* ──────── STEP 3: Units (skipped — combined into step 2) ──────── */}
        {/* ──────── STEP 4: Steps Goal ──────── */}
        <KeyboardAvoidingView
          style={{ width: SCREEN_WIDTH }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.stepTitle, { color: colors.text }]}>Set your daily steps goal</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              You can always change this later from your profile.
            </Text>

            {/* Goal display */}
            <View style={[styles.goalDisplay, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.goalNumber, { color: colors.primary, fontFamily: SERIF_FONT }]}>
                {stepsGoal.toLocaleString()}
              </Text>
              <Text style={[styles.goalUnit, { color: colors.textMuted }]}>steps / day</Text>
            </View>

            {/* Quick presets */}
            <View style={styles.presetsRow}>
              {[5000, 7500, 10000, 12500, 15000].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetChip,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    stepsGoal === preset && [styles.presetChipActive, { backgroundColor: colors.primary, borderColor: colors.primary }],
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setStepsGoal(preset);
                    setStepsInputText(String(preset));
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.presetChipText, { color: stepsGoal === preset ? '#09090b' : colors.textSecondary }]}>
                    {(preset / 1000).toFixed(preset % 1000 === 0 ? 0 : 1)}k
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom input */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>OR ENTER CUSTOM GOAL</Text>
              <View style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="footsteps-outline" size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={stepsInputText}
                  onChangeText={(t) => {
                    setStepsInputText(t);
                    const n = parseInt(t.replace(/\D/g, ''));
                    if (!isNaN(n) && n > 0) setStepsGoal(Math.min(50000, n));
                  }}
                  keyboardType="numeric"
                  placeholder="e.g. 10000"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.primary }, saving && styles.nextBtnDisabled]}
              onPress={handleFinish}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Text style={styles.nextBtnText}>{saving ? 'Setting up...' : "Let's Go!"}</Text>
              <Ionicons name="checkmark-circle" size={18} color="#09090b" />
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScrollView>

      {/* Step dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: TOTAL_STEPS - 1 }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === currentStep ? colors.primary : colors.border },
              i === currentStep && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 32,
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInfo: { flex: 1 },
  stepLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 3,
    marginHorizontal: 20,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: 2 },
  stepContent: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },
  stepTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 32,
  },
  fieldGroup: { marginBottom: 20 },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
  },
  atSign: { fontSize: 16, fontWeight: '800', marginRight: 6 },
  input: { flex: 1, fontSize: 16, fontWeight: '600' },
  pillTrack: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginBottom: 24,
    height: 46,
  },
  pillOption: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  pillOptionActive: {},
  pillText: { fontSize: 14, fontWeight: '700' },
  pillTextActive: { color: '#09090b' },
  measureRow: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  measureCol: { flex: 1 },
  genderRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    height: 46,
    marginBottom: 8,
  },
  genderChip: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  genderChipActive: {},
  genderChipText: { fontSize: 13, fontWeight: '700' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 26,
    marginTop: 28,
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { fontSize: 16, fontWeight: '800', color: '#09090b' },
  // Goal step
  goalDisplay: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 28,
    marginBottom: 24,
  },
  goalNumber: {
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: -2,
  },
  goalUnit: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
    justifyContent: 'center',
  },
  presetChip: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
  },
  presetChipActive: {},
  presetChipText: { fontSize: 14, fontWeight: '700' },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingTop: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 22 },
});
