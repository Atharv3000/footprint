import React, { useState, useRef, useEffect } from 'react';
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
import { InteractiveScaleRuler } from '@/components/InteractiveScaleRuler';
import { FlipNumberPicker } from '@/components/FlipNumberPicker';
import { getOrCreateMyUsername, setMyUsername } from '@/constants/socialEngine';
import { ensureMockDataSeeded } from '@/constants/stepsStorage';
import { loadWeightLogs, recordWeightLog } from '@/constants/workoutStorage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 5;

export default function OnboardingScreen() {
  const { user, profile, updateProfile } = useAuth();
  const themeContext = useTheme();
  const colors = themeContext?.colors;
  const isDark = themeContext?.isDark ?? colors?.isDark ?? true;

  const scrollRef = useRef<any>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [saving, setSaving] = useState(false);

  // Preference: Units
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(profile?.unitSystem || 'us_customary');
  const isUS = unitSystem === 'us_customary';
  const unitLabel = isUS ? 'lbs' : 'kg';

  // Step 1: Weight Scale (Starting with last saved profile or weight logs)
  const initialWeightLbs = profile?.weightKg ? Math.round(kgToLbs(profile.weightKg)) : 155;
  const initialWeightKg = profile?.weightKg ? Math.round(profile.weightKg) : 70;
  const [weightVal, setWeightVal] = useState<number>(isUS ? initialWeightLbs : initialWeightKg);

  // Step 2: Target Weight Scale
  const [targetWeightVal, setTargetWeightVal] = useState<number>(isUS ? initialWeightLbs : initialWeightKg);

  // Step 3: Pace / Speed of weight change
  const [weightPace, setWeightPace] = useState<'slow' | 'steady' | 'fast'>('steady');

  // Step 4: Physiology (Height, Age, Sex)
  const [heightFeet, setHeightFeet] = useState(profile?.heightFeet || 5);
  const [heightInches, setHeightInches] = useState(profile?.heightInches || 9);
  const [heightCm, setHeightCm] = useState(profile?.heightCm || 175);
  const [age, setAge] = useState(profile?.age || 26);
  const [gender, setGender] = useState<GenderOption>(profile?.gender || 'na');

  // Step 5: Profile Identity & Daily Step Goal
  const [nameInput, setNameInput] = useState(profile?.name || user?.name || '');
  const [usernameInput, setUsernameInput] = useState('');
  const [stepsGoal, setStepsGoal] = useState(profile?.stepsGoal || 8000);

  // Load last saved weight entry on mount
  useEffect(() => {
    async function loadLastWeight() {
      if (user?.id) {
        try {
          const logs = await loadWeightLogs(user.id);
          if (logs.length > 0) {
            const lastLog = logs[logs.length - 1];
            if (lastLog?.weightKg) {
              const val = isUS ? Math.round(kgToLbs(lastLog.weightKg)) : Math.round(lastLog.weightKg);
              setWeightVal(val);
              setTargetWeightVal(val);
            }
          }
        } catch (e) {}
      }
    }
    loadLastWeight();
  }, [user?.id, isUS]);

  // Handle unit switch
  const handleToggleUnit = (newUnit: UnitSystem) => {
    if (newUnit === unitSystem) return;
    Haptics.selectionAsync().catch(() => {});
    if (newUnit === 'us_customary') {
      const convertedCurrent = Math.round(kgToLbs(weightVal));
      const convertedTarget = Math.round(kgToLbs(targetWeightVal));
      setWeightVal(convertedCurrent);
      setTargetWeightVal(convertedTarget);
    } else {
      const convertedCurrent = Math.round(lbsToKg(weightVal));
      const convertedTarget = Math.round(lbsToKg(targetWeightVal));
      setWeightVal(convertedCurrent);
      setTargetWeightVal(convertedTarget);
    }
    setUnitSystem(newUnit);
  };

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
        await getOrCreateMyUsername(user.id, nameInput.trim() || 'User').catch(() => {});
      }

      // Compute canonical values
      const canonicalCurrentKg = isUS ? lbsToKg(weightVal) : weightVal;
      const canonicalTargetKg = isUS ? lbsToKg(targetWeightVal) : targetWeightVal;
      const canonicalCm = isUS ? inchesToCm(heightFeet * 12 + heightInches) : heightCm;
      const saveFeet = isUS ? heightFeet : Math.floor(cmToInches(canonicalCm) / 12);
      const saveInches = isUS ? heightInches : Math.round(cmToInches(canonicalCm) % 12);

      await updateProfile({
        name: nameInput.trim() || 'Walker',
        weightKg: canonicalCurrentKg,
        targetWeightKg: canonicalTargetKg,
        weightGoalPace: weightPace,
        heightCm: canonicalCm,
        heightFeet: saveFeet,
        heightInches: saveInches,
        age,
        gender,
        unitSystem,
        stepsGoal,
        hasCompletedSetup: true,
      });

      // Record weight log entry
      if (user?.id) {
        await recordWeightLog(user.id, canonicalCurrentKg).catch(() => {});
        await ensureMockDataSeeded(user.id, stepsGoal).catch(() => {});
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

  const stepLabels = ['Current Weight', 'Target Weight', 'Goal Pace', 'Body & Stats', 'Profile & Steps'];

  // Weight difference insight
  const weightDiff = targetWeightVal - weightVal;
  const isLossGoal = weightDiff < -0.5;
  const isGainGoal = weightDiff > 0.5;
  const diffMagnitude = Math.abs(weightDiff);

  return (
    <View style={[styles.container, { backgroundColor: colors?.background || '#09090b' }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={[styles.logoMark, { backgroundColor: colors?.surface || '#141417', borderColor: colors?.border || '#242429' }]}>
          <Ionicons name="scale-outline" size={20} color={colors?.primary || '#a3e635'} />
        </View>
        <View style={styles.stepInfo}>
          <Text style={[styles.stepLabel, { color: colors?.textMuted || '#71717a' }]}>
            Step {currentStep + 1} of {TOTAL_STEPS} — {stepLabels[currentStep]}
          </Text>
        </View>
        {currentStep > 0 && (
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors?.surfaceElevated || '#1c1c20' }]}
            onPress={() => goToStep(currentStep - 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={colors?.text || '#fff'} />
          </TouchableOpacity>
        )}
      </View>

      {/* Progress Track */}
      <View style={[styles.progressTrack, { backgroundColor: colors?.border || '#242429' }]}>
        <Animated.View style={[styles.progressFill, { backgroundColor: colors?.primary || '#a3e635', width: progressWidth }]} />
      </View>

      {/* Scrollable Step Pages */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* ──────── STEP 1: CURRENT WEIGHT (CENTERED INTERACTIVE SCALE) ──────── */}
        <ScrollView style={{ width: SCREEN_WIDTH }} contentContainerStyle={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors?.text }]}>What is your weight?</Text>
          <Text style={[styles.stepSubtitle, { color: colors?.textSecondary }]}>
            Slide the interactive scale to set your current weight. Starts with your last saved entry.
          </Text>

          {/* Unit Toggle */}
          <View style={[styles.pillTrack, { backgroundColor: colors?.surface, borderColor: colors?.border }]}>
            {(['us_customary', 'metric'] as UnitSystem[]).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.pillOption, unitSystem === u && [styles.pillOptionActive, { backgroundColor: colors?.primary }]]}
                onPress={() => handleToggleUnit(u)}
                activeOpacity={0.85}
              >
                <Text style={[styles.pillText, { color: colors?.textMuted }, unitSystem === u && { color: isDark ? '#09090b' : '#ffffff' }]}>
                  {u === 'us_customary' ? 'Pounds (lbs)' : 'Kilograms (kg)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Interactive Scale Ruler */}
          <InteractiveScaleRuler
            value={weightVal}
            min={isUS ? 60 : 30}
            max={isUS ? 420 : 200}
            step={1}
            unit={unitLabel}
            onValueChange={setWeightVal}
            accentColor={colors?.primary}
          />

          <View style={[styles.scaleHelperCard, { backgroundColor: colors?.surfaceElevated }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors?.primary} />
            <Text style={[styles.scaleHelperText, { color: colors?.textSecondary }]}>
              Ready as-is! You can adjust anytime or immediately hit continue.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors?.primary }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={[styles.nextBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={isDark ? '#09090b' : '#ffffff'} />
          </TouchableOpacity>
        </ScrollView>

        {/* ──────── STEP 2: TARGET WEIGHT ──────── */}
        <ScrollView style={{ width: SCREEN_WIDTH }} contentContainerStyle={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors?.text }]}>What is your target weight?</Text>
          <Text style={[styles.stepSubtitle, { color: colors?.textSecondary }]}>
            Set your ideal goal weight. We will tailor your calorie expenditure and nutrition plan to match.
          </Text>

          {/* Interactive Target Scale Ruler */}
          <InteractiveScaleRuler
            value={targetWeightVal}
            min={isUS ? 60 : 30}
            max={isUS ? 420 : 200}
            step={1}
            unit={unitLabel}
            onValueChange={setTargetWeightVal}
            accentColor="#38bdf8"
          />

          {/* Insight card */}
          <View style={[styles.scaleHelperCard, { backgroundColor: colors?.surfaceElevated }]}>
            <Ionicons
              name={isLossGoal ? 'trending-down' : isGainGoal ? 'trending-up' : 'checkmark-done'}
              size={18}
              color={colors?.primary}
            />
            <Text style={[styles.scaleHelperText, { color: colors?.textSecondary }]}>
              {isLossGoal
                ? `Goal: Shed ${diffMagnitude} ${unitLabel} at a sustainable, muscle-preserving pace.`
                : isGainGoal
                ? `Goal: Gain ${diffMagnitude} ${unitLabel} of clean lean muscle.`
                : `Goal: Maintain your current weight of ${weightVal} ${unitLabel} and recomposition.`}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors?.primary }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={[styles.nextBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={isDark ? '#09090b' : '#ffffff'} />
          </TouchableOpacity>
        </ScrollView>

        {/* ──────── STEP 3: SPEED OF WEIGHT CHANGE ──────── */}
        <ScrollView style={{ width: SCREEN_WIDTH }} contentContainerStyle={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors?.text }]}>Choose your pace</Text>
          <Text style={[styles.stepSubtitle, { color: colors?.textSecondary }]}>
            Select how quickly you want to reach your goal. Steady paces are the most sustainable.
          </Text>

          <View style={styles.paceOptionsList}>
            {[
              {
                id: 'slow',
                title: 'Gentle & Steady',
                paceStr: isUS ? '0.5 lb / week' : '0.25 kg / week',
                desc: 'Minimal diet disruption. Easiest to maintain long-term with zero fatigue.',
                icon: 'leaf-outline',
              },
              {
                id: 'steady',
                title: 'Optimal Balance',
                paceStr: isUS ? '1.0 lb / week' : '0.5 kg / week',
                desc: 'The recommended sweet spot for sustainable results while fueling training.',
                icon: 'fitness-outline',
              },
              {
                id: 'fast',
                title: 'Accelerated',
                paceStr: isUS ? '1.5–2.0 lbs / week' : '0.75–1.0 kg / week',
                desc: 'Fastest timeline. Best for dedicated routines and short-term cuts or bulks.',
                icon: 'flash-outline',
              },
            ].map((opt) => {
              const isSelected = weightPace === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.paceCard,
                    {
                      backgroundColor: isSelected ? `${colors?.primary}22` : colors?.surfaceElevated,
                      borderColor: isSelected ? colors?.primary : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setWeightPace(opt.id as any);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.paceIconWrap, { backgroundColor: isSelected ? colors?.primary : colors?.surfaceSecondary }]}>
                    <Ionicons name={opt.icon as any} size={20} color={isSelected ? '#09090b' : colors?.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.paceTitle, { color: colors?.text }]}>{opt.title}</Text>
                      <Text style={[styles.paceBadge, { color: colors?.primary }]}>{opt.paceStr}</Text>
                    </View>
                    <Text style={[styles.paceDesc, { color: colors?.textSecondary }]}>{opt.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors?.primary }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={[styles.nextBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={isDark ? '#09090b' : '#ffffff'} />
          </TouchableOpacity>
        </ScrollView>

        {/* ──────── STEP 4: BODY PHYSIOLOGY (HEIGHT, AGE, SEX) ──────── */}
        <ScrollView style={{ width: SCREEN_WIDTH }} contentContainerStyle={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors?.text }]}>Your physiology</Text>
          <Text style={[styles.stepSubtitle, { color: colors?.textSecondary }]}>
            These physical parameters calibrate your metabolic baseline (BMR).
          </Text>

          {/* Height Input */}
          {isUS ? (
            <View style={styles.measureRow}>
              <View style={styles.measureCol}>
                <Text style={[styles.fieldLabel, { color: colors?.textMuted }]}>HEIGHT (FT)</Text>
                <FlipNumberPicker value={heightFeet} min={3} max={8} step={1} unit="ft" onChange={setHeightFeet} />
              </View>
              <View style={styles.measureCol}>
                <Text style={[styles.fieldLabel, { color: colors?.textMuted }]}>HEIGHT (IN)</Text>
                <FlipNumberPicker value={heightInches} min={0} max={11} step={1} unit="in" onChange={setHeightInches} />
              </View>
            </View>
          ) : (
            <View style={styles.measureRow}>
              <View style={[styles.measureCol, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors?.textMuted }]}>HEIGHT (CM)</Text>
                <FlipNumberPicker value={heightCm} min={90} max={250} step={1} unit="cm" onChange={setHeightCm} />
              </View>
            </View>
          )}

          {/* Age */}
          <View style={styles.measureRow}>
            <View style={[styles.measureCol, { flex: 1 }]}>
              <Text style={[styles.fieldLabel, { color: colors?.textMuted }]}>AGE</Text>
              <FlipNumberPicker value={age} min={13} max={99} step={1} unit="yrs" onChange={setAge} />
            </View>
          </View>

          {/* Biological Sex */}
          <Text style={[styles.fieldLabel, { color: colors?.textMuted, marginTop: 12 }]}>BIOLOGICAL SEX</Text>
          <View style={[styles.genderRow, { backgroundColor: colors?.surface, borderColor: colors?.border }]}>
            {(['female', 'male', 'na'] as GenderOption[]).map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.genderChip, gender === g && [styles.genderChipActive, { backgroundColor: colors?.primary }]]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setGender(g);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.genderChipText, { color: gender === g ? '#09090b' : colors?.textMuted }]}>
                  {g === 'female' ? 'Female' : g === 'male' ? 'Male' : 'Non-Binary'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors?.primary }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={[styles.nextBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={isDark ? '#09090b' : '#ffffff'} />
          </TouchableOpacity>
        </ScrollView>

        {/* ──────── STEP 5: PROFILE IDENTITY & STEPS ──────── */}
        <KeyboardAvoidingView
          style={{ width: SCREEN_WIDTH }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.stepTitle, { color: colors?.text }]}>Finalize your profile</Text>
            <Text style={[styles.stepSubtitle, { color: colors?.textSecondary }]}>
              Set your walker identity and your starting daily steps target.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors?.textMuted }]}>DISPLAY NAME</Text>
              <View style={[styles.inputBox, { backgroundColor: colors?.surface, borderColor: colors?.border }]}>
                <Ionicons name="person-outline" size={16} color={colors?.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { color: colors?.text }]}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Your Name"
                  placeholderTextColor={colors?.textMuted}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors?.textMuted }]}>USERNAME</Text>
              <View style={[styles.inputBox, { backgroundColor: colors?.surface, borderColor: colors?.border }]}>
                <Text style={[styles.atSign, { color: colors?.primary }]}>@</Text>
                <TextInput
                  style={[styles.input, { color: colors?.text }]}
                  value={usernameInput}
                  onChangeText={(t) => setUsernameInput(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="username"
                  placeholderTextColor={colors?.textMuted}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Steps Goal Display */}
            <Text style={[styles.fieldLabel, { color: colors?.textMuted, marginTop: 10 }]}>DAILY STEPS GOAL</Text>
            <View style={[styles.goalDisplay, { backgroundColor: colors?.surface, borderColor: colors?.border }]}>
              <Text style={[styles.goalNumber, { color: colors?.primary, fontFamily: SERIF_FONT }]}>
                {stepsGoal.toLocaleString()}
              </Text>
              <Text style={[styles.goalUnit, { color: colors?.textMuted }]}>steps / day</Text>
            </View>

            <View style={styles.presetsRow}>
              {[6000, 8000, 10000, 12000, 15000].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetChip,
                    { backgroundColor: colors?.surface, borderColor: colors?.border },
                    stepsGoal === preset && { backgroundColor: colors?.primary, borderColor: colors?.primary },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setStepsGoal(preset);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.presetChipText, { color: stepsGoal === preset ? '#09090b' : colors?.textSecondary }]}>
                    {(preset / 1000).toFixed(0)}k
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors?.primary }, saving && styles.nextBtnDisabled]}
              onPress={handleFinish}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Text style={[styles.nextBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                {saving ? 'Setting up...' : "Let's Go!"}
              </Text>
              <Ionicons name="checkmark-circle" size={18} color={isDark ? '#09090b' : '#ffffff'} />
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScrollView>

      {/* Step dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === currentStep ? colors?.primary : colors?.border },
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
    paddingTop: 24,
    paddingBottom: 48,
  },
  stepTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14.5,
    lineHeight: 21,
    marginBottom: 20,
  },
  pillTrack: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginBottom: 16,
    height: 44,
  },
  pillOption: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  pillOptionActive: {},
  pillText: { fontSize: 13.5, fontWeight: '700' },
  scaleHelperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    marginTop: 14,
    marginBottom: 8,
  },
  scaleHelperText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    fontWeight: '500',
  },
  paceOptionsList: {
    gap: 12,
    marginVertical: 12,
  },
  paceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 12,
  },
  paceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  paceBadge: {
    fontSize: 12,
    fontWeight: '800',
  },
  paceDesc: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  measureRow: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  measureCol: { flex: 1 },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: 8,
  },
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
  fieldGroup: { marginBottom: 16 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
  },
  atSign: { fontSize: 16, fontWeight: '800', marginRight: 6 },
  input: { flex: 1, fontSize: 15, fontWeight: '600' },
  goalDisplay: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 18,
    marginBottom: 16,
  },
  goalNumber: {
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  goalUnit: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
    justifyContent: 'center',
  },
  presetChip: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  presetChipText: { fontSize: 13, fontWeight: '700' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 26,
    marginTop: 20,
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { fontSize: 15.5, fontWeight: '800' },
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
