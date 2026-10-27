import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import {
  MacroQuizAnswers,
  NutritionTargets,
  calculateMacrosFromQuiz,
  saveNutritionTargets,
  saveQuizAnswers,
  ActivityLevel,
  DietGoal,
  DietPreference,
} from '@/constants/nutritionStorage';

interface MacroGoalQuizModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (targets: NutritionTargets) => void;
  initialAnswers?: MacroQuizAnswers | null;
}

export function MacroGoalQuizModal({
  visible,
  onClose,
  onSaved,
  initialAnswers,
}: MacroGoalQuizModalProps) {
  const { colors, isDark } = useTheme();

  const [step, setStep] = useState<number>(1);
  const totalSteps = 4;

  // Form State
  const [goal, setGoal] = useState<DietGoal>(initialAnswers?.goal || 'maintain');
  const [activity, setActivity] = useState<ActivityLevel>(initialAnswers?.activityLevel || 'moderate');
  const [diet, setDiet] = useState<DietPreference>(initialAnswers?.dietPreference || 'balanced');
  const [weightKg, setWeightKg] = useState<string>(initialAnswers ? String(initialAnswers.weightKg) : '75');
  const [heightCm, setHeightCm] = useState<string>(initialAnswers ? String(initialAnswers.heightCm) : '178');
  const [age, setAge] = useState<string>(initialAnswers ? String(initialAnswers.age) : '26');
  const [gender, setGender] = useState<'male' | 'female' | 'na'>(initialAnswers?.gender || 'male');

  // Preview target calculations in real-time
  const previewTargets: NutritionTargets = calculateMacrosFromQuiz({
    goal,
    activityLevel: activity,
    dietPreference: diet,
    weightKg: parseFloat(weightKg) || 75,
    heightCm: parseFloat(heightCm) || 178,
    age: parseInt(age, 10) || 26,
    gender,
  });

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      handleFinalize();
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step > 1) {
      setStep((s) => s - 1);
    } else {
      onClose();
    }
  };

  const handleFinalize = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const quizPayload: MacroQuizAnswers = {
      goal,
      activityLevel: activity,
      dietPreference: diet,
      weightKg: parseFloat(weightKg) || 75,
      heightCm: parseFloat(heightCm) || 178,
      age: parseInt(age, 10) || 26,
      gender,
    };

    await saveQuizAnswers(quizPayload);
    await saveNutritionTargets(previewTargets);
    onSaved(previewTargets);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Header Navigation */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleBack} style={styles.headerBtn}>
            <Ionicons name={step === 1 ? 'close' : 'chevron-back'} size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Macro Calculator</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              Step {step} of {totalSteps}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress Bar Indicator */}
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${(step / totalSteps) * 100}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>

        <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          {/* STEP 1: Core Fitness Goal */}
          {step === 1 && (
            <View>
              <Text style={[styles.stepHeading, { color: colors.text }]}>What is your primary fitness goal?</Text>
              <Text style={[styles.stepSubtext, { color: colors.textMuted }]}>
                We will scientifically balance your caloric deficit or surplus to optimize body composition.
              </Text>

              <View style={styles.cardList}>
                {[
                  {
                    key: 'cut',
                    title: 'Cut & Burn Fat',
                    desc: 'Caloric deficit (-450 kcal) to shed body fat while preserving lean muscle mass.',
                    icon: 'flame',
                    color: '#ef4444',
                  },
                  {
                    key: 'maintain',
                    title: 'Maintain & Recompose',
                    desc: 'Stay at baseline expenditure. Build strength, tone muscle, and stay lean.',
                    icon: 'shield-checkmark',
                    color: '#38bdf8',
                  },
                  {
                    key: 'bulk',
                    title: 'Lean Muscle Bulk',
                    desc: 'Caloric surplus (+350 kcal) prioritizing protein to accelerate hypertrophy.',
                    icon: 'barbell',
                    color: '#a3e635',
                  },
                ].map((item) => {
                  const isSelected = goal === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.selectCard,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setGoal(item.key as DietGoal);
                      }}
                    >
                      <View style={[styles.iconPill, { backgroundColor: `${item.color}20` }]}>
                        <Ionicons name={item.icon as any} size={24} color={item.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                        <Text style={[styles.cardDesc, { color: colors.textMuted }]}>{item.desc}</Text>
                      </View>
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={isSelected ? colors.primary : colors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 2: Physical Metrics */}
          {step === 2 && (
            <View>
              <Text style={[styles.stepHeading, { color: colors.text }]}>Body Metrics & Physiology</Text>
              <Text style={[styles.stepSubtext, { color: colors.textMuted }]}>
                Used to compute your Basal Metabolic Rate (BMR) via the clinical Mifflin-St Jeor equation.
              </Text>

              {/* Gender */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>GENDER</Text>
              <View style={styles.genderRow}>
                {[
                  { key: 'male', label: 'Male', icon: 'male' },
                  { key: 'female', label: 'Female', icon: 'female' },
                  { key: 'na', label: 'Non-Binary', icon: 'person' },
                ].map((g) => (
                  <TouchableOpacity
                    key={g.key}
                    style={[
                      styles.genderBtn,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: gender === g.key ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setGender(g.key as any)}
                  >
                    <Ionicons name={g.icon as any} size={18} color={gender === g.key ? colors.primary : colors.text} />
                    <Text
                      style={[
                        styles.genderBtnText,
                        { color: gender === g.key ? colors.primary : colors.text },
                      ]}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Metric Inputs */}
              <View style={styles.inputGrid}>
                <View style={styles.inputCol}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>WEIGHT (KG)</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    value={weightKg}
                    onChangeText={setWeightKg}
                    placeholder="75"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.inputCol}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>HEIGHT (CM)</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    value={heightCm}
                    onChangeText={setHeightCm}
                    placeholder="178"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.inputCol}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>AGE</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    value={age}
                    onChangeText={setAge}
                    placeholder="26"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: Activity Level & Daily Expenditure */}
          {step === 3 && (
            <View>
              <Text style={[styles.stepHeading, { color: colors.text }]}>Daily Activity Level</Text>
              <Text style={[styles.stepSubtext, { color: colors.textMuted }]}>
                Footprint combines your steps, gym sessions, and daily physical movement to determine TDEE.
              </Text>

              <View style={styles.cardList}>
                {[
                  {
                    key: 'sedentary',
                    title: 'Sedentary',
                    desc: 'Desk job, < 4,000 steps daily, little or no structured exercise.',
                    badge: '1.2x BMR',
                  },
                  {
                    key: 'light',
                    title: 'Lightly Active',
                    desc: '5,000–8,000 steps daily or 1–3 light workout sessions per week.',
                    badge: '1.38x BMR',
                  },
                  {
                    key: 'moderate',
                    title: 'Moderately Active',
                    desc: '8,000–12,000 steps daily, 3–5 intense gym or cardio workouts weekly.',
                    badge: '1.55x BMR',
                  },
                  {
                    key: 'very_active',
                    title: 'Very Active / Athlete',
                    desc: '12,000+ steps daily, hard physical labor, or training twice a day.',
                    badge: '1.73x BMR',
                  },
                ].map((item) => {
                  const isSelected = activity === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.selectCard,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setActivity(item.key as ActivityLevel);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                          <View style={[styles.metricPill, { backgroundColor: colors.borderLight }]}>
                            <Text style={[styles.metricPillText, { color: colors.textSecondary }]}>{item.badge}</Text>
                          </View>
                        </View>
                        <Text style={[styles.cardDesc, { color: colors.textMuted }]}>{item.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 4: Dietary Macro Split & Final Confirmation */}
          {step === 4 && (
            <View>
              <Text style={[styles.stepHeading, { color: colors.text }]}>Macro Distribution Plan</Text>
              <Text style={[styles.stepSubtext, { color: colors.textMuted }]}>
                Choose your preferred macro balance, then review your scientifically personalized targets.
              </Text>

              {/* Diet Styles */}
              <View style={styles.dietPillsRow}>
                {[
                  { key: 'balanced', label: 'Balanced (40/30/30)' },
                  { key: 'high_protein', label: 'High Protein (Hypertrophy)' },
                  { key: 'keto', label: 'Keto (Low Carb)' },
                  { key: 'low_fat', label: 'Low Fat High Carb' },
                ].map((d) => (
                  <TouchableOpacity
                    key={d.key}
                    style={[
                      styles.dietPill,
                      {
                        backgroundColor: diet === d.key ? colors.primary : colors.surfaceElevated,
                        borderColor: diet === d.key ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setDiet(d.key as DietPreference);
                    }}
                  >
                    <Text
                      style={[
                        styles.dietPillText,
                        { color: diet === d.key ? '#09090b' : colors.text, fontWeight: diet === d.key ? '700' : '500' },
                      ]}
                    >
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Target Results Dashboard Card */}
              <View style={[styles.resultCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <View style={styles.resultHeader}>
                  <Text style={[styles.resultTitle, { color: colors.textMuted }]}>RECOMMENDED DAILY TARGET</Text>
                  <Text style={[styles.resultCalories, { color: colors.primary }]}>
                    {previewTargets.dailyCalories}{' '}
                    <Text style={{ fontSize: 16, color: colors.textMuted }}>KCAL</Text>
                  </Text>
                </View>

                {/* Macro Split Bar */}
                <View style={styles.macroSplitBar}>
                  <View style={[styles.macroBarFill, { flex: previewTargets.proteinGrams * 4, backgroundColor: '#38bdf8' }]} />
                  <View style={[styles.macroBarFill, { flex: previewTargets.carbsGrams * 4, backgroundColor: '#a3e635' }]} />
                  <View style={[styles.macroBarFill, { flex: previewTargets.fatGrams * 9, backgroundColor: '#f59e0b' }]} />
                </View>

                {/* Macro Item Grid */}
                <View style={styles.macroGrid}>
                  <View style={styles.macroBox}>
                    <View style={[styles.dot, { backgroundColor: '#38bdf8' }]} />
                    <Text style={[styles.macroGram, { color: colors.text }]}>{previewTargets.proteinGrams}g</Text>
                    <Text style={[styles.macroName, { color: colors.textMuted }]}>Protein (4 kcal/g)</Text>
                  </View>

                  <View style={styles.macroBox}>
                    <View style={[styles.dot, { backgroundColor: '#a3e635' }]} />
                    <Text style={[styles.macroGram, { color: colors.text }]}>{previewTargets.carbsGrams}g</Text>
                    <Text style={[styles.macroName, { color: colors.textMuted }]}>Carbs (4 kcal/g)</Text>
                  </View>

                  <View style={styles.macroBox}>
                    <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
                    <Text style={[styles.macroGram, { color: colors.text }]}>{previewTargets.fatGrams}g</Text>
                    <Text style={[styles.macroName, { color: colors.textMuted }]}>Fat (9 kcal/g)</Text>
                  </View>
                </View>

                {/* Hydration bonus note */}
                <View style={[styles.waterNote, { backgroundColor: colors.surfaceSecondary }]}>
                  <Ionicons name="water" size={18} color="#38bdf8" />
                  <Text style={[styles.waterNoteText, { color: colors.textSecondary }]}>
                    Hydration Goal: <Text style={{ fontWeight: '700', color: colors.text }}>{previewTargets.waterGoalMl} ml</Text> daily for peak metabolic rate.
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Bottom CTA Button */}
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleNext}
          >
            <Text style={styles.primaryBtnText}>
              {step === totalSteps ? 'Save & Apply Macro Targets' : 'Continue'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#09090b" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: '100%',
  },
  scrollBody: {
    padding: 20,
    paddingBottom: 40,
  },
  stepHeading: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
    marginBottom: 6,
  },
  stepSubtext: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  cardList: {
    gap: 12,
  },
  selectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  iconPill: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  genderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  genderBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  inputCol: {
    flex: 1,
  },
  inputBox: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
  },
  metricPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metricPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dietPillsRow: {
    gap: 8,
    marginBottom: 20,
  },
  dietPill: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  dietPillText: {
    fontSize: 14,
  },
  resultCard: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  resultCalories: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: SERIF_FONT,
  },
  macroSplitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  macroBarFill: {
    height: '100%',
  },
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  macroBox: {
    flex: 1,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  macroGram: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  macroName: {
    fontSize: 11,
    textAlign: 'center',
  },
  waterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  waterNoteText: {
    fontSize: 12,
    flex: 1,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#09090b',
  },
});
