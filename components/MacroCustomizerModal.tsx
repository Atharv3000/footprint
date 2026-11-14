import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/constants/ThemeContext';
import { useAuth } from '@/constants/AuthContext';
import { NutritionTargets, saveNutritionTargets, ActivityLevel } from '@/constants/nutritionStorage';
import { DragSlider } from '@/components/DragSlider';
import { InteractiveScaleRuler } from '@/components/InteractiveScaleRuler';

interface MacroCustomizerModalProps {
  visible: boolean;
  targets: NutritionTargets;
  onClose: () => void;
  onSaved: (newTargets: NutritionTargets) => void;
}

interface EnergyLevelOption {
  id: ActivityLevel;
  label: string;
  sub: string;
  multiplier: number;
  icon: keyof typeof Ionicons.glyphMap;
  desc: string;
}

const ENERGY_LEVELS: EnergyLevelOption[] = [
  {
    id: 'sedentary',
    label: 'Sedentary',
    sub: 'Desk job, low activity',
    multiplier: 1.2,
    icon: 'desktop-outline',
    desc: 'Desk work, under 5k steps/day.',
  },
  {
    id: 'light',
    label: 'Lightly Active',
    sub: '1–3 light sessions/wk',
    multiplier: 1.375,
    icon: 'walk-outline',
    desc: 'Light workouts or 5k–8k daily steps.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    sub: '3–5 workouts/wk',
    multiplier: 1.55,
    icon: 'barbell-outline',
    desc: 'Regular training, 8k–11k daily steps.',
  },
  {
    id: 'very_active',
    label: 'Very Active',
    sub: '6–7 intense workouts/wk',
    multiplier: 1.725,
    icon: 'bicycle-outline',
    desc: 'Daily athletic training or labor.',
  },
];

interface PresetOption {
  id: string;
  name: string;
  desc: string;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  icon: keyof typeof Ionicons.glyphMap;
}

const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    desc: '30% P · 40% C · 30% F · Steady everyday energy',
    proteinPct: 30,
    carbsPct: 40,
    fatPct: 30,
    icon: 'scale-outline',
  },
  {
    id: 'high_protein',
    name: 'High Protein',
    desc: '40% P · 35% C · 25% F · Muscle fullness & recovery',
    proteinPct: 40,
    carbsPct: 35,
    fatPct: 25,
    icon: 'barbell-outline',
  },
  {
    id: 'endurance',
    name: 'Endurance',
    desc: '20% P · 60% C · 20% F · Glycogen replenishment for runners',
    proteinPct: 20,
    carbsPct: 60,
    fatPct: 20,
    icon: 'bicycle-outline',
  },
  {
    id: 'keto',
    name: 'Keto',
    desc: '25% P · 10% C · 65% F · Low-carb metabolic state',
    proteinPct: 25,
    carbsPct: 10,
    fatPct: 65,
    icon: 'flame-outline',
  },
];

const STEPS = [
  { step: 1, title: 'Body Weight', subtitle: 'Current & Goal' },
  { step: 2, title: 'Activity Level', subtitle: 'Energy output' },
  { step: 3, title: 'Daily Fuel', subtitle: 'Pace & timeline' },
  { step: 4, title: 'Macro Balance', subtitle: 'Fuel distribution' },
];

export function MacroCustomizerModal({
  visible,
  targets,
  onClose,
  onSaved,
}: MacroCustomizerModalProps) {
  const themeContext = useTheme();
  const colors = themeContext?.colors;
  const isDark = themeContext?.isDark ?? colors?.isDark ?? true;
  const { profile, updateProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24);

  const isUS = profile?.unitSystem === 'us_customary';
  const weightUnit = isUS ? 'lbs' : 'kg';

  // Initial weights
  const initialCurrentWeight = Math.round(
    isUS ? (profile?.weightKg || 72) * 2.20462 : (profile?.weightKg || 72)
  );
  const initialTargetWeight = Math.round(
    profile?.targetWeightKg
      ? isUS
        ? profile.targetWeightKg * 2.20462
        : profile.targetWeightKg
      : initialCurrentWeight
  );

  // Weight edit states
  const [currentWeight, setCurrentWeight] = useState<number>(initialCurrentWeight);
  const [targetWeight, setTargetWeight] = useState<number>(initialTargetWeight);

  // Multistep flow state
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Energy Level selection
  const [selectedEnergyLevel, setSelectedEnergyLevel] = useState<ActivityLevel>('moderate');

  // Daily calories and selected preset
  const [dailyCalories, setDailyCalories] = useState<number>(targets.dailyCalories || 2200);
  const [selectedCalPreset, setSelectedCalPreset] = useState<string>('maintenance');

  // Daily fuel weekly rate (-2.0 lbs to +2.0 lbs per week)
  const [weeklyLbsPace, setWeeklyLbsPace] = useState<number>(0);

  // Macro percentages state (protPct + carbPct + fatPct = 100)
  const totalCal = targets.dailyCalories || 2200;
  const initialProtPct = Math.round(((targets.proteinGrams * 4) / totalCal) * 100) || 30;
  const initialCarbPct = Math.round(((targets.carbsGrams * 4) / totalCal) * 100) || 40;

  const [protPct, setProtPct] = useState<number>(initialProtPct);
  const [carbPct, setCarbPct] = useState<number>(initialCarbPct);
  const fatPct = Math.max(0, 100 - protPct - carbPct);
  const [selectedMacroPreset, setSelectedMacroPreset] = useState<string>('balanced');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Ref measurements for the interactive shared slider bar
  const barTrackViewRef = useRef<View>(null);
  const barTrackWidthRef = useRef<number>(300);
  const barPageXRef = useRef<number>(0);
  const activeNodeRef = useRef<'node1' | 'node2' | null>(null);

  const rulerScrollRef = useRef<any>(null);
  const lastRulerHaptic = useRef<number>(0);
  const isRulerInitial = useRef<boolean>(true);

  // Compute User BMR & TDEE accurately from body measurements and dynamic currentWeight
  const activeWeightKg = isUS ? currentWeight / 2.20462 : currentWeight;

  const { bmr, tdee, weightKg, heightCm, age, gender } = useMemo(() => {
    const w = activeWeightKg || profile?.weightKg || 72;
    const h = profile?.heightCm || 175;
    const a = profile?.age || 26;
    const g = profile?.gender || 'male';

    let calcBmr = 10 * w + 6.25 * h - 5 * a;
    if (g === 'female') {
      calcBmr -= 161;
    } else {
      calcBmr += 5;
    }
    calcBmr = Math.round(calcBmr);

    const mult =
      ENERGY_LEVELS.find((l) => l.id === selectedEnergyLevel)?.multiplier || 1.55;
    const calcTdee = Math.round(calcBmr * mult);

    return {
      bmr: calcBmr,
      tdee: calcTdee,
      weightKg: w,
      heightCm: h,
      age: a,
      gender: g,
    };
  }, [profile, selectedEnergyLevel, activeWeightKg]);

  // Dynamic Calorie Presets based on calculated TDEE
  const caloriePresets = useMemo(() => {
    return [
      {
        id: 'aggressive_loss',
        name: 'Fat Loss (Fast)',
        delta: -750,
        calories: Math.max(1200, tdee - 750),
        desc: `-750 kcal/day · ~1.5 lbs/week loss`,
      },
      {
        id: 'moderate_loss',
        name: 'Fat Loss (Steady)',
        delta: -500,
        calories: Math.max(1200, tdee - 500),
        desc: `-500 kcal/day · ~1.0 lb/week loss`,
      },
      {
        id: 'mild_deficit',
        name: 'Lean Definition',
        delta: -250,
        calories: Math.max(1200, tdee - 250),
        desc: `-250 kcal/day · Muscle retention cut`,
      },
      {
        id: 'maintenance',
        name: 'Maintenance',
        delta: 0,
        calories: tdee,
        desc: `Neutral balance at ${tdee} kcal/day`,
      },
      {
        id: 'lean_bulk',
        name: 'Lean Muscle Gain',
        delta: 250,
        calories: tdee + 250,
        desc: `+250 kcal/day · ~0.5 lb/week gain`,
      },
      {
        id: 'aggressive_bulk',
        name: 'Max Strength Bulk',
        delta: 500,
        calories: tdee + 500,
        desc: `+500 kcal/day · Heavy surplus`,
      },
    ];
  }, [tdee]);

  // Gram calculations
  const proteinG = Math.round((dailyCalories * (protPct / 100)) / 4);
  const carbsG = Math.round((dailyCalories * (carbPct / 100)) / 4);
  const fatG = Math.round((dailyCalories * (fatPct / 100)) / 9);

  const handleSelectEnergyLevel = (level: ActivityLevel) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedEnergyLevel(level);
    const chosenLevel = ENERGY_LEVELS.find((l) => l.id === level);
    const mult = chosenLevel ? chosenLevel.multiplier : 1.55;
    const newTdee = Math.round(bmr * mult);

    if (selectedCalPreset !== 'custom') {
      const p = caloriePresets.find((x) => x.id === selectedCalPreset);
      if (p) {
        setDailyCalories(Math.max(1200, newTdee + p.delta));
      }
    }
  };

  // Handle scroll on the notched weekly weight ruler
  // Range from -2.0 lbs/wk (fat loss) to +2.0 lbs/wk (muscle gain) in 0.1 lb steps
  const RULER_STEP = 0.1;
  const RULER_MIN = -2.0;
  const RULER_MAX = 2.0;
  const RULER_TICK_WIDTH = 14;
  const tickCount = Math.round((RULER_MAX - RULER_MIN) / RULER_STEP) + 1;
  const rulerTicks = useMemo(() => {
    return Array.from({ length: tickCount }, (_, i) => {
      const val = RULER_MIN + i * RULER_STEP;
      return Math.round(val * 10) / 10;
    });
  }, [tickCount]);

  useEffect(() => {
    if (currentStep === 3 && rulerScrollRef.current) {
      const targetOffset = Math.round(((weeklyLbsPace - RULER_MIN) / RULER_STEP) * RULER_TICK_WIDTH);
      setTimeout(() => {
        rulerScrollRef.current?.scrollTo({ x: targetOffset, animated: false });
      }, 60);
    }
  }, [currentStep]);

  const handleRulerScroll = (e: any) => {
    const x = Math.max(0, e.nativeEvent.contentOffset.x);
    const index = Math.round(x / RULER_TICK_WIDTH);
    const rawVal = RULER_MIN + index * RULER_STEP;
    const clampedVal = Math.min(RULER_MAX, Math.max(RULER_MIN, Math.round(rawVal * 10) / 10));

    if (clampedVal !== lastRulerHaptic.current) {
      lastRulerHaptic.current = clampedVal;
      Haptics.selectionAsync().catch(() => {});
      setWeeklyLbsPace(clampedVal);
      // 1 lb of body weight ≈ 3500 kcal -> weekly kcal delta / 7 = daily kcal delta
      const dailyDelta = Math.round((clampedVal * 3500) / 7);
      const newCalories = Math.max(1200, Math.min(4800, tdee + dailyDelta));
      setDailyCalories(newCalories);
    }
  };

  const handleUpdateFromNodePosition = (node: 'node1' | 'node2', pageX: number) => {
    const width = barTrackWidthRef.current || 300;
    const startX = barPageXRef.current || 0;
    const relativeX = Math.max(0, Math.min(width, pageX - startX));
    const touchPct = Math.round((relativeX / width) * 100);

    setSelectedMacroPreset('custom');

    if (node === 'node1') {
      const newProt = Math.max(5, Math.min(80, touchPct));
      const currentEndCarb = protPct + carbPct;
      let newCarb = Math.max(5, currentEndCarb - newProt);
      if (newProt + newCarb > 95) {
        newCarb = 95 - newProt;
      }
      setProtPct(newProt);
      setCarbPct(newCarb);
    } else {
      const node2Touch = Math.max(protPct + 5, Math.min(95, touchPct));
      const newCarb = Math.max(5, node2Touch - protPct);
      setCarbPct(newCarb);
    }
  };

  const handleAdjustMacro = (macro: 'protein' | 'carbs' | 'fat', delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedMacroPreset('custom');

    if (macro === 'protein') {
      const newProt = Math.max(5, Math.min(80, protPct + delta));
      const diff = newProt - protPct;
      let newCarb = carbPct - diff;
      if (newCarb < 5) {
        newCarb = 5;
      }
      setProtPct(newProt);
      setCarbPct(newCarb);
    } else if (macro === 'carbs') {
      const newCarb = Math.max(5, Math.min(80, carbPct + delta));
      const diff = newCarb - carbPct;
      let newProt = protPct - diff;
      if (newProt < 5) {
        newProt = 5;
      }
      setProtPct(newProt);
      setCarbPct(newCarb);
    } else {
      const currentFat = fatPct;
      const desiredFat = Math.max(5, Math.min(80, currentFat + delta));
      const diff = desiredFat - currentFat;
      let newCarb = carbPct - diff;
      if (newCarb < 5) {
        const remaining = 5 - newCarb;
        newCarb = 5;
        let newProt = Math.max(5, protPct - remaining);
        setProtPct(newProt);
      }
      setCarbPct(newCarb);
    }
  };

  const measureBarTrack = () => {
    if (barTrackViewRef.current) {
      (barTrackViewRef.current as any).measure?.((_x: any, _y: any, width: number, _height: any, pageX: number) => {
        if (width > 0) {
          barPageXRef.current = pageX;
          barTrackWidthRef.current = width;
        }
      });
    }
  };

  const sharedBarPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        Haptics.selectionAsync().catch(() => {});
        measureBarTrack();
        const width = barTrackWidthRef.current || 300;
        const startX = barPageXRef.current || 0;
        const relativeX = Math.max(0, Math.min(width, evt.nativeEvent.pageX - startX));
        const touchPct = (relativeX / width) * 100;

        const node1Pos = protPct;
        const node2Pos = protPct + carbPct;
        const dist1 = Math.abs(touchPct - node1Pos);
        const dist2 = Math.abs(touchPct - node2Pos);

        const chosenNode = dist1 <= dist2 ? 'node1' : 'node2';
        activeNodeRef.current = chosenNode;
        handleUpdateFromNodePosition(chosenNode, evt.nativeEvent.pageX);
      },
      onPanResponderMove: (evt) => {
        if (activeNodeRef.current) {
          handleUpdateFromNodePosition(activeNodeRef.current, evt.nativeEvent.pageX);
        }
      },
      onPanResponderRelease: () => {
        activeNodeRef.current = null;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      },
    })
  ).current;

  const handleApplyMacroPreset = (preset: PresetOption) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedMacroPreset(preset.id);
    setProtPct(preset.proteinPct);
    setCarbPct(preset.carbsPct);
  };

  const handleSave = async () => {
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Save profile weight updates
    try {
      const finalWeightKg = isUS ? currentWeight / 2.20462 : currentWeight;
      const finalTargetWeightKg = isUS ? targetWeight / 2.20462 : targetWeight;
      await updateProfile({
        weightKg: Math.round(finalWeightKg * 10) / 10,
        targetWeightKg: Math.round(finalTargetWeightKg * 10) / 10,
      });
    } catch (e) {
      console.warn('Could not update profile weights', e);
    }

    const updated: NutritionTargets = {
      ...targets,
      dailyCalories,
      proteinGrams: proteinG,
      carbsGrams: carbsG,
      fatGrams: fatG,
    };

    await saveNutritionTargets(updated);
    onSaved(updated);

    // Give visual loading then checkmark saved confirmation before closing
    setTimeout(() => {
      setSaveStatus('saved');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => {
        onClose();
        setTimeout(() => setSaveStatus('idle'), 300);
      }, 700);
    }, 450);
  };

  const activeCalPresetObj = caloriePresets.find((p) => p.id === selectedCalPreset);
  const activeMacroPresetObj = PRESET_OPTIONS.find((p) => p.id === selectedMacroPreset);

  const customCalorieOutcomeText = useMemo(() => {
    const delta = dailyCalories - tdee;
    if (Math.abs(delta) < 75) {
      return `Balanced (${dailyCalories} kcal) · Ideal for weight stabilization and healthy vitality.`;
    } else if (delta < 0) {
      const weeklyLbs = Math.abs((delta * 7) / 3500).toFixed(1);
      return `Gentle deficit of ${Math.abs(delta)} kcal/day · Projected weight loss: ~${weeklyLbs} lbs/week.`;
    } else {
      const weeklyLbs = ((delta * 7) / 3500).toFixed(1);
      return `Nourishing surplus of +${delta} kcal/day · Projected gain: ~${weeklyLbs} lbs/week.`;
    }
  }, [dailyCalories, tdee]);

  const customMacroOutcomeText = useMemo(() => {
    const pPerKg = (proteinG / (weightKg || 70)).toFixed(1);
    let outcome = `${protPct}% Protein (${proteinG}g · ${pPerKg}g/kg), ${carbPct}% Carbs (${carbsG}g), ${fatPct}% Fat (${fatG}g). `;
    if (protPct >= 35) {
      outcome += 'High protein supports muscle strength, focus, and sustained fullness.';
    } else if (carbPct >= 50) {
      outcome += 'High carbohydrates deliver smooth energy for joyful movement and daily active life.';
    } else if (fatPct >= 50) {
      outcome += 'Good dietary fats provide slow-burning, steady vitality throughout the day.';
    } else {
      outcome += 'Harmoniously balanced nutrients for natural everyday energy.';
    }
    return outcome;
  }, [protPct, carbPct, fatPct, proteinG, carbsG, fatG, weightKg]);

  // Timeline calculations for Step 4
  const targetTimeline = useMemo(() => {
    const rawDiffLbs = isUS
      ? targetWeight - currentWeight
      : (targetWeight - currentWeight) * 2.20462;
    const diffAbsLbs = Math.abs(rawDiffLbs);

    // Goal direction
    const isLossGoal = rawDiffLbs < -0.1;
    const isGainGoal = rawDiffLbs > 0.1;
    const isSameWeight = diffAbsLbs <= 0.1;

    if (isSameWeight) {
      return {
        status: 'achieved',
        headline: 'Goal weight matched!',
        description: 'You are currently at your target weight. Maintain your daily fuel to stay right here.',
        weeks: 0,
        estimatedDateStr: 'Current Weight',
      };
    }

    // Check direction alignment with chosen weekly pace
    if (isLossGoal) {
      if (weeklyLbsPace >= 0) {
        return {
          status: 'misaligned',
          headline: 'Pace set to maintain or gain',
          description: `Your goal is to drop ${diffAbsLbs.toFixed(1)} ${weightUnit}. Move the pace slider to a negative rate (-lbs/wk) to calculate your timeline.`,
          weeks: null,
          estimatedDateStr: null,
        };
      }
      const weeks = Math.ceil(diffAbsLbs / Math.abs(weeklyLbsPace));
      const targetDate = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
      const dateStr = targetDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return {
        status: 'on_track',
        headline: `~${weeks} ${weeks === 1 ? 'week' : 'weeks'} to goal`,
        description: `At -${Math.abs(weeklyLbsPace).toFixed(1)} lbs/week, you'll reach your target of ${targetWeight} ${weightUnit} around ${dateStr}.`,
        weeks,
        estimatedDateStr: dateStr,
      };
    }

    if (isGainGoal) {
      if (weeklyLbsPace <= 0) {
        return {
          status: 'misaligned',
          headline: 'Pace set to maintain or deficit',
          description: `Your goal is to gain ${diffAbsLbs.toFixed(1)} ${weightUnit}. Move the pace slider to a positive surplus (+lbs/wk) to calculate your timeline.`,
          weeks: null,
          estimatedDateStr: null,
        };
      }
      const weeks = Math.ceil(diffAbsLbs / weeklyLbsPace);
      const targetDate = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
      const dateStr = targetDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return {
        status: 'on_track',
        headline: `~${weeks} ${weeks === 1 ? 'week' : 'weeks'} to goal`,
        description: `At +${weeklyLbsPace.toFixed(1)} lbs/week, you'll reach your target of ${targetWeight} ${weightUnit} around ${dateStr}.`,
        weeks,
        estimatedDateStr: dateStr,
      };
    }

    return {
      status: 'neutral',
      headline: 'Steady pace',
      description: 'Pacing neutral balance.',
      weeks: 0,
      estimatedDateStr: 'Ongoing',
    };
  }, [currentWeight, targetWeight, weeklyLbsPace, isUS, weightUnit]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topInset, paddingBottom: Math.max(insets.bottom, 20) }]}>
        
        {/* Clean Header: Back Button on Left (or disabled placeholder on step 1), Progress Notches in Center, Exit/Close Icon on Right */}
        <View style={styles.header}>
          {currentStep > 1 ? (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setCurrentStep((s) => s - 1);
              }}
              style={[styles.headerNavBtn, { backgroundColor: colors.surfaceElevated }]}
              activeOpacity={0.75}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerNavBtnPlaceholder} />
          )}

          {/* Notches for Setup Steps */}
          <View style={styles.headerNotchesContainer}>
            {STEPS.map((sItem) => {
              const isFilled = currentStep >= sItem.step;
              const isCurrent = currentStep === sItem.step;

              return (
                <TouchableOpacity
                  key={sItem.step}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setCurrentStep(sItem.step);
                  }}
                  activeOpacity={0.75}
                  style={styles.headerNotchTouchArea}
                >
                  <View
                    style={[
                      styles.headerNotchSegment,
                      {
                        backgroundColor: isFilled
                          ? colors.primary
                          : colors.surfaceSecondary,
                        opacity: isCurrent ? 1 : isFilled ? 0.75 : 0.4,
                      },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Single Exit Icon Button on Right */}
          <TouchableOpacity
            onPress={onClose}
            style={[styles.headerNavBtn, { backgroundColor: colors.surfaceElevated }]}
            activeOpacity={0.75}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* STEP BODY CONTENT */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* STEP 1: CURRENT & GOAL WEIGHT ON THE SAME PAGE */}
          {currentStep === 1 && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeroBlock}>
                <Text style={[styles.stepHeadline, { color: colors.text }]}>Body Weight</Text>
                <Text style={[styles.stepSubtext, { color: colors.textMuted }]}>
                  Calibrate your starting point and target body weight.
                </Text>
              </View>

              {/* 1. Current Weight Section */}
              <View style={[styles.heroMetricCard, { backgroundColor: colors.surfaceElevated }]}>
                <Text style={[styles.heroMetricLabel, { color: colors.textMuted }]}>STARTING CURRENT WEIGHT</Text>
                <View style={styles.weightReadoutRow}>
                  <Text style={[styles.weightReadoutNumber, { color: colors.text }]}>{currentWeight}</Text>
                  <Text style={[styles.weightReadoutUnit, { color: colors.primary }]}>{weightUnit}</Text>
                </View>

                {/* Interactive Scale Ruler for Current Weight */}
                <InteractiveScaleRuler
                  value={currentWeight}
                  min={isUS ? 80 : 35}
                  max={isUS ? 420 : 190}
                  step={1}
                  unit={weightUnit}
                  onValueChange={(val) => setCurrentWeight(val)}
                  accentColor={colors.primary}
                  hideReadout={true}
                />
              </View>

              {/* 2. Target Goal Weight Section */}
              <View style={[styles.heroMetricCard, { backgroundColor: colors.surfaceElevated }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.heroMetricLabel, { color: colors.textMuted }]}>TARGET GOAL WEIGHT</Text>
                  
                  {/* Delta indicator badge */}
                  <View
                    style={[
                      styles.weightDiffPill,
                      {
                        backgroundColor:
                          targetWeight < currentWeight
                            ? 'rgba(56, 189, 248, 0.15)'
                            : targetWeight > currentWeight
                            ? 'rgba(16, 185, 129, 0.15)'
                            : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    {targetWeight !== currentWeight ? (
                      <View
                        style={[
                          targetWeight > currentWeight
                            ? styles.triangleUp
                            : styles.triangleDown,
                          {
                            [targetWeight > currentWeight ? 'borderBottomColor' : 'borderTopColor']:
                              targetWeight > currentWeight ? '#10b981' : '#38bdf8',
                          },
                        ]}
                      />
                    ) : (
                      <Ionicons name="checkmark" size={12} color={colors.textMuted} />
                    )}
                    <Text
                      style={[
                        styles.weightDiffPillText,
                        {
                          color:
                            targetWeight < currentWeight
                              ? '#38bdf8'
                              : targetWeight > currentWeight
                              ? '#10b981'
                              : colors.textMuted,
                          fontSize: 11,
                        },
                      ]}
                    >
                      {targetWeight < currentWeight
                        ? `${Math.abs(targetWeight - currentWeight)} ${weightUnit} to cut`
                        : targetWeight > currentWeight
                        ? `${targetWeight - currentWeight} ${weightUnit} to build`
                        : 'Maintain'}
                    </Text>
                  </View>
                </View>

                <View style={styles.weightReadoutRow}>
                  <Text style={[styles.weightReadoutNumber, { color: colors.text }]}>{targetWeight}</Text>
                  <Text style={[styles.weightReadoutUnit, { color: '#38bdf8' }]}>{weightUnit}</Text>
                </View>

                {/* Interactive Scale Ruler for Target Weight */}
                <InteractiveScaleRuler
                  value={targetWeight}
                  min={isUS ? 80 : 35}
                  max={isUS ? 420 : 190}
                  step={1}
                  unit={weightUnit}
                  onValueChange={(val) => setTargetWeight(val)}
                  accentColor="#38bdf8"
                  hideReadout={true}
                />
              </View>
            </View>
          )}

          {/* STEP 2: ACTIVITY LEVEL */}
          {currentStep === 2 && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeroBlock}>
                <Text style={[styles.stepHeadline, { color: colors.text }]}>What is your daily rhythm?</Text>
                <Text style={[styles.stepSubtext, { color: colors.textMuted }]}>
                  Your activity level helps calibrate your daily expenditure (BMR: {bmr} kcal).
                </Text>
              </View>

              <View style={styles.optionsList}>
                {ENERGY_LEVELS.map((level) => {
                  const isSelected = selectedEnergyLevel === level.id;
                  return (
                    <TouchableOpacity
                      key={level.id}
                      style={[
                        styles.choiceCard,
                        {
                          backgroundColor: isSelected ? `${colors.primary}22` : colors.surfaceElevated,
                        },
                      ]}
                      onPress={() => handleSelectEnergyLevel(level.id)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.choiceIconWrap,
                          {
                            backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                          },
                        ]}
                      >
                        <Ionicons
                          name={level.icon}
                          size={22}
                          color={isSelected ? '#09090b' : colors.text}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.choiceTitle, { color: colors.text }]}>{level.label}</Text>
                        <Text style={[styles.choiceSub, { color: colors.textMuted }]}>{level.sub}</Text>
                        <Text style={[styles.choiceDesc, { color: colors.textSecondary }]}>{level.desc}</Text>
                      </View>

                      {isSelected && (
                        <View style={[styles.checkmarkCircle, { backgroundColor: colors.primary }]}>
                          <Ionicons name="checkmark" size={14} color="#09090b" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.friendlyCallout, { backgroundColor: colors.surfaceElevated }]}>
                <Ionicons name="sparkles" size={18} color={colors.primary} />
                <Text style={[styles.friendlyCalloutText, { color: colors.textSecondary }]}>
                  At <Text style={{ color: colors.text, fontWeight: '700' }}>{selectedEnergyLevel}</Text> activity, your baseline energy burn is{' '}
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>{tdee} kcal/day</Text>.
                </Text>
              </View>
            </View>
          )}

          {/* STEP 3: DAILY FUEL & WEEKLY PACE SLIDER */}
          {currentStep === 3 && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeroBlock}>
                <Text style={[styles.stepHeadline, { color: colors.text }]}>Daily Fuel</Text>
                <Text style={[styles.stepSubtext, { color: colors.textMuted }]}>
                  Choose how many pounds to gain or lose per week.
                </Text>
              </View>

              {/* Interactive Notched Scrollable Ruler Card */}
              <View style={[styles.heroMetricCard, { backgroundColor: colors.surfaceElevated }]}>
                <Text style={[styles.heroMetricLabel, { color: colors.textMuted }]}>
                  {weeklyLbsPace > 0
                    ? 'WEIGHT GAIN RATE'
                    : weeklyLbsPace < 0
                    ? 'WEIGHT LOSS RATE'
                    : 'MAINTENANCE PACE'}
                </Text>

                {/* Big Readout */}
                <View style={styles.fuelReadoutRow}>
                  <Text style={[styles.fuelReadoutNumber, { color: colors.text }]}>
                    {weeklyLbsPace > 0 ? `+${weeklyLbsPace.toFixed(1)}` : `${weeklyLbsPace.toFixed(1)}`}
                  </Text>
                  <Text style={[styles.fuelReadoutUnit, { color: colors.primary }]}>
                    lbs / wk
                  </Text>
                </View>

                {/* Ruler Track with Notches and Center Indicator Needle */}
                <View style={styles.fuelRulerBox}>
                  {/* Center Needle */}
                  <View style={[styles.fuelCenterNeedle, { backgroundColor: colors.primary }]} />
                  <View style={[styles.fuelCenterTriangle, { borderTopColor: colors.primary }]} />

                  {/* Horizontal Scrollable Notch Bar */}
                  <ScrollView
                    ref={rulerScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={handleRulerScroll}
                    contentContainerStyle={styles.fuelRulerTrack}
                    snapToInterval={RULER_TICK_WIDTH}
                    decelerationRate="fast"
                  >
                    {rulerTicks.map((val) => {
                      const isZero = val === 0;
                      const isWhole = Math.abs(val % 1) < 0.01;
                      const isHalf = Math.abs(val % 0.5) < 0.01;

                      return (
                        <View key={`tick_${val}`} style={styles.fuelTickWrapper}>
                          <View
                            style={[
                              styles.fuelTickLine,
                              {
                                height: isZero ? 36 : isWhole ? 28 : isHalf ? 20 : 12,
                                backgroundColor: isZero
                                  ? colors.primary
                                  : isWhole
                                  ? isDark
                                    ? '#e4e4e7'
                                    : '#3f3f46'
                                  : isHalf
                                  ? isDark
                                    ? '#71717a'
                                    : '#a1a1aa'
                                  : isDark
                                  ? '#27272a'
                                  : '#e4e4e7',
                                width: isZero ? 3 : isWhole ? 2 : 1.5,
                              },
                            ]}
                          />
                          {(isWhole || isZero) && (
                            <Text
                              style={[
                                styles.fuelTickNumber,
                                {
                                  color: isZero ? colors.primary : isDark ? '#71717a' : '#a1a1aa',
                                  fontWeight: isZero ? '800' : '600',
                                },
                              ]}
                            >
                              {val > 0 ? `+${val}` : `${val}`}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Subtext info under the ruler */}
                <View style={styles.fuelTargetPillRow}>
                  <View style={[styles.fuelTargetPill, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.fuelTargetPillLabel, { color: colors.textMuted }]}>Calorie Budget</Text>
                    <Text style={[styles.fuelTargetPillValue, { color: colors.text }]}>
                      {dailyCalories}{' '}
                      <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textMuted }}>kcal / day</Text>
                    </Text>
                  </View>
                  <View style={[styles.fuelTargetPill, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.fuelTargetPillLabel, { color: colors.textMuted }]}>Daily Adjustment</Text>
                    <Text
                      style={[
                        styles.fuelTargetPillValue,
                        {
                          color:
                            dailyCalories - tdee > 0
                              ? '#10b981'
                              : dailyCalories - tdee < 0
                              ? '#38bdf8'
                              : colors.text,
                        },
                      ]}
                    >
                      {dailyCalories - tdee > 0
                        ? `+${dailyCalories - tdee} kcal`
                        : dailyCalories - tdee < 0
                        ? `${dailyCalories - tdee} kcal`
                        : '0 kcal (Balance)'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Dynamic Goal Timeline Projection Card */}
              <View
                style={[
                  styles.timelineHeroCard,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor:
                      targetTimeline.status === 'on_track'
                        ? `${colors.primary}55`
                        : colors.surfaceSecondary,
                  },
                ]}
              >
                <View style={styles.timelineHeaderRow}>
                  <View
                    style={[
                      styles.timelineIconBadge,
                      {
                        backgroundColor:
                          targetTimeline.status === 'on_track'
                            ? colors.primary
                            : targetTimeline.status === 'achieved'
                            ? '#10b981'
                            : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        targetTimeline.status === 'achieved'
                          ? 'checkmark-done'
                          : targetTimeline.status === 'on_track'
                          ? 'time-outline'
                          : 'alert-circle-outline'
                      }
                      size={20}
                      color={
                        targetTimeline.status === 'on_track'
                          ? '#09090b'
                          : targetTimeline.status === 'achieved'
                          ? '#ffffff'
                          : colors.textSecondary
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.timelineHeroLabel, { color: colors.textMuted }]}>
                      ESTIMATED TIMELINE TO GOAL
                    </Text>
                    <Text style={[styles.timelineHeroHeadline, { color: colors.text }]}>
                      {targetTimeline.headline}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.timelineHeroDesc, { color: colors.textSecondary }]}>
                  {targetTimeline.description}
                </Text>

                {targetTimeline.estimatedDateStr && targetTimeline.status === 'on_track' && (
                  <View style={[styles.targetDateRow, { backgroundColor: colors.surfaceSecondary }]}>
                    <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                    <Text style={[styles.targetDateText, { color: colors.text }]}>
                      Estimated Goal Date:{' '}
                      <Text style={{ fontWeight: '800', color: colors.primary }}>
                        {targetTimeline.estimatedDateStr}
                      </Text>
                    </Text>
                  </View>
                )}
              </View>

              {/* Informative Guidance Breakdown Below */}
              <View style={[styles.friendlyCallout, { backgroundColor: colors.surfaceElevated }]}>
                <Ionicons
                  name={weeklyLbsPace < 0 ? 'flame-outline' : weeklyLbsPace > 0 ? 'barbell-outline' : 'leaf-outline'}
                  size={20}
                  color={colors.primary}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.fuelInfoHeadline, { color: colors.text }]}>
                    {weeklyLbsPace < 0
                      ? 'Fat Loss Calorie Deficit'
                      : weeklyLbsPace > 0
                      ? 'Hypertrophy Muscle Surplus'
                      : 'Weight Maintenance & Vitality'}
                  </Text>
                  <Text style={[styles.friendlyCalloutText, { color: colors.textSecondary }]}>
                    {weeklyLbsPace < 0
                      ? `Consuming ${dailyCalories} kcal/day (${Math.abs(dailyCalories - tdee)} kcal deficit) enables a consistent loss of ~${Math.abs(weeklyLbsPace).toFixed(1)} lbs per week while preserving lean muscle mass.`
                      : weeklyLbsPace > 0
                      ? `Consuming ${dailyCalories} kcal/day (+${dailyCalories - tdee} kcal surplus) provides fuel for progressive strength overload and muscle synthesis at ~${weeklyLbsPace.toFixed(1)} lbs gained per week.`
                      : `Consuming ${tdee} kcal/day matches your total daily energy expenditure (TDEE) to preserve your current weight.`}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* STEP 4: MACRONUTRIENTS */}
          {currentStep === 4 && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeroBlock}>
                <Text style={[styles.stepHeadline, { color: colors.text }]}>Balance your macros</Text>
                <Text style={[styles.stepSubtext, { color: colors.textMuted }]}>
                  Fine-tune your nutrients for energy, stamina, and recovery.
                </Text>
              </View>

              {/* Interactive Shared Bar Container */}
              <View style={[styles.heroMetricCard, { backgroundColor: colors.surfaceElevated }]}>
                {/* The Interactive Combined Multi-Track */}
                <View
                  ref={barTrackViewRef}
                  style={[styles.sharedBarTrack, { backgroundColor: colors.surfaceSecondary }]}
                  onLayout={(e) => {
                    const w = e.nativeEvent.layout.width;
                    barTrackWidthRef.current = w;
                    if (barTrackViewRef.current) {
                      (barTrackViewRef.current as any).measure?.((_x: any, _y: any, width: number, _height: any, pageX: number) => {
                        if (width > 0) {
                          barPageXRef.current = pageX;
                          barTrackWidthRef.current = width;
                        }
                      });
                    }
                  }}
                  {...sharedBarPanResponder.panHandlers}
                >
                  <View style={[styles.sharedSegment, { width: `${protPct}%`, backgroundColor: '#38bdf8' }]} />
                  <View style={[styles.sharedSegment, { width: `${carbPct}%`, backgroundColor: '#a3e635' }]} />
                  <View style={[styles.sharedSegment, { width: `${fatPct}%`, backgroundColor: '#f59e0b' }]} />

                  {/* Divider Handle 1 */}
                  <View
                    pointerEvents="none"
                    style={[
                      styles.barCircleNode,
                      {
                        left: `${Math.max(4, Math.min(94, protPct))}%`,
                        backgroundColor: '#38bdf8',
                      },
                    ]}
                  >
                    <View style={styles.innerNodeCore} />
                  </View>

                  {/* Divider Handle 2 */}
                  <View
                    pointerEvents="none"
                    style={[
                      styles.barCircleNode,
                      {
                        left: `${Math.max(6, Math.min(96, protPct + carbPct))}%`,
                        backgroundColor: '#a3e635',
                      },
                    ]}
                  >
                    <View style={styles.innerNodeCore} />
                  </View>
                </View>

                <View style={styles.dragBarHelperRow}>
                  <Ionicons name="swap-horizontal" size={13} color={colors.textMuted} />
                  <Text style={[styles.dragBarHelperText, { color: colors.textMuted }]}>
                    Drag the divider handles or tap +/- below
                  </Text>
                </View>

                {/* Macro Detail Cards with Nudge Steppers */}
                <View style={styles.macroCardsRow}>
                  {/* Protein */}
                  <View style={[styles.macroStepperCard, { backgroundColor: colors.surfaceSecondary }]}>
                    <View style={styles.macroCardHeader}>
                      <View style={[styles.circleLegendNode, { backgroundColor: '#38bdf8' }]} />
                      <Text style={[styles.macroCardTitle, { color: colors.text }]}>Protein</Text>
                    </View>
                    <Text style={[styles.macroCardValue, { color: '#38bdf8' }]}>{protPct}%</Text>
                    <Text style={[styles.macroCardGrams, { color: colors.textMuted }]}>{proteinG}g</Text>
                    <View style={styles.macroStepperButtons}>
                      <TouchableOpacity
                        style={[styles.macroMiniBtn, { backgroundColor: colors.surfaceElevated }]}
                        onPress={() => handleAdjustMacro('protein', -5)}
                      >
                        <Ionicons name="remove" size={14} color={colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.macroMiniBtn, { backgroundColor: colors.surfaceElevated }]}
                        onPress={() => handleAdjustMacro('protein', 5)}
                      >
                        <Ionicons name="add" size={14} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Carbs */}
                  <View style={[styles.macroStepperCard, { backgroundColor: colors.surfaceSecondary }]}>
                    <View style={styles.macroCardHeader}>
                      <View style={[styles.circleLegendNode, { backgroundColor: '#a3e635' }]} />
                      <Text style={[styles.macroCardTitle, { color: colors.text }]}>Carbs</Text>
                    </View>
                    <Text style={[styles.macroCardValue, { color: '#a3e635' }]}>{carbPct}%</Text>
                    <Text style={[styles.macroCardGrams, { color: colors.textMuted }]}>{carbsG}g</Text>
                    <View style={styles.macroStepperButtons}>
                      <TouchableOpacity
                        style={[styles.macroMiniBtn, { backgroundColor: colors.surfaceElevated }]}
                        onPress={() => handleAdjustMacro('carbs', -5)}
                      >
                        <Ionicons name="remove" size={14} color={colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.macroMiniBtn, { backgroundColor: colors.surfaceElevated }]}
                        onPress={() => handleAdjustMacro('carbs', 5)}
                      >
                        <Ionicons name="add" size={14} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Fat */}
                  <View style={[styles.macroStepperCard, { backgroundColor: colors.surfaceSecondary }]}>
                    <View style={styles.macroCardHeader}>
                      <View style={[styles.circleLegendNode, { backgroundColor: '#f59e0b' }]} />
                      <Text style={[styles.macroCardTitle, { color: colors.text }]}>Fat</Text>
                    </View>
                    <Text style={[styles.macroCardValue, { color: '#f59e0b' }]}>{fatPct}%</Text>
                    <Text style={[styles.macroCardGrams, { color: colors.textMuted }]}>{fatG}g</Text>
                    <View style={styles.macroStepperButtons}>
                      <TouchableOpacity
                        style={[styles.macroMiniBtn, { backgroundColor: colors.surfaceElevated }]}
                        onPress={() => handleAdjustMacro('fat', -5)}
                      >
                        <Ionicons name="remove" size={14} color={colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.macroMiniBtn, { backgroundColor: colors.surfaceElevated }]}
                        onPress={() => handleAdjustMacro('fat', 5)}
                      >
                        <Ionicons name="add" size={14} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              {/* Preset Archetypes */}
              <Text style={[styles.sectionHeading, { color: colors.text }]}>Popular Splits</Text>
              <View style={styles.optionsList}>
                {PRESET_OPTIONS.map((pr) => {
                  const isSelected = selectedMacroPreset === pr.id;
                  return (
                    <TouchableOpacity
                      key={pr.id}
                      style={[
                        styles.choiceCardCompact,
                        {
                          backgroundColor: isSelected ? `${colors.primary}22` : colors.surfaceElevated,
                        },
                      ]}
                      onPress={() => handleApplyMacroPreset(pr)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.choiceTitle, { color: colors.text }]}>{pr.name}</Text>
                        <Text style={[styles.choiceDesc, { color: colors.textSecondary }]}>{pr.desc}</Text>
                      </View>
                      {isSelected && (
                        <View style={[styles.checkmarkCircle, { backgroundColor: colors.primary }]}>
                          <Ionicons name="checkmark" size={14} color="#09090b" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.friendlyCallout, { backgroundColor: colors.surfaceElevated }]}>
                <Ionicons name="pie-chart-outline" size={18} color={colors.primary} />
                <Text style={[styles.friendlyCalloutText, { color: colors.textSecondary }]}>
                  {selectedMacroPreset === 'custom'
                    ? customMacroOutcomeText
                    : `${activeMacroPresetObj?.name}: ${activeMacroPresetObj?.desc}.`}
                </Text>
              </View>
            </View>
          )}

          {/* Bottom Flow Nav Buttons */}
          <View style={styles.navRow}>
            {currentStep > 1 && (
              <TouchableOpacity
                style={[styles.navBackBtn, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCurrentStep((prev) => prev - 1);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={18} color={colors.text} />
                <Text style={[styles.navBackBtnText, { color: colors.text }]}>Back</Text>
              </TouchableOpacity>
            )}

            {currentStep < 4 ? (
              <TouchableOpacity
                style={[styles.navNextBtn, { backgroundColor: colors.primary, flex: currentStep === 1 ? 1 : 1.5 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setCurrentStep((prev) => prev + 1);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.navNextBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                  Continue to {STEPS[currentStep].title}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={isDark ? '#09090b' : '#ffffff'} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.navNextBtn, { backgroundColor: colors.primary, flex: 1.5 }]}
                onPress={handleSave}
                disabled={saveStatus === 'saving' || saveStatus === 'saved'}
                activeOpacity={0.85}
              >
                {saveStatus === 'saving' ? (
                  <View style={styles.savingStateRow}>
                    <ActivityIndicator size="small" color={isDark ? '#09090b' : '#ffffff'} />
                    <Text style={[styles.navNextBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Saving...</Text>
                  </View>
                ) : saveStatus === 'saved' ? (
                  <View style={styles.savingStateRow}>
                    <Ionicons name="checkmark-circle" size={20} color={isDark ? '#09090b' : '#ffffff'} />
                    <Text style={[styles.navNextBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Saved!</Text>
                  </View>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={isDark ? '#09090b' : '#ffffff'} />
                    <Text style={[styles.navNextBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Save Macro Goals</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  /* Header Nav */
  headerNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNavBtnPlaceholder: {
    width: 40,
    height: 40,
  },
  /* Weight Hero Elements */
  weightReadoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  weightReadoutNumber: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  weightReadoutUnit: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  weightDiffPillRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weightDiffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  triangleUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 4.5,
    borderRightWidth: 4.5,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  triangleDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 4.5,
    borderRightWidth: 4.5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  weightDiffPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  /* Timeline Hero Card */
  timelineHeroCard: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: 12,
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  timelineIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineHeroLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  timelineHeroHeadline: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  timelineHeroDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  targetDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  targetDateText: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  saveIndicatorPillBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  saveStatusText: {
    fontSize: 13,
    fontWeight: '800',
  },
  savingStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerNotchesContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 18,
  },
  headerNotchTouchArea: {
    flex: 1,
    paddingVertical: 6,
  },
  headerNotchSegment: {
    height: 5,
    borderRadius: 2.5,
  },
  /* Stepper Notch */
  stepperNotchWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 10,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepTouchTarget: {
    paddingVertical: 4,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: {
    fontSize: 11,
    fontWeight: '800',
  },
  stepLabelText: {
    fontSize: 13,
  },
  progressLineTrack: {
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
    width: '100%',
  },
  progressLineFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  /* Scroll & Content */
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  stepContainer: {
    gap: 16,
  },
  stepHeroBlock: {
    gap: 4,
    marginTop: 4,
  },
  stepHeadline: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  stepSubtext: {
    fontSize: 14,
    lineHeight: 20,
  },
  optionsList: {
    gap: 10,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 24,
    gap: 14,
  },
  choiceCardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 22,
    gap: 12,
  },
  choiceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  choiceSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  choiceDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  checkmarkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetCalsTag: {
    fontSize: 13,
    fontWeight: '800',
  },
  friendlyCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
  },
  friendlyCalloutText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  heroMetricCard: {
    padding: 18,
    borderRadius: 24,
    gap: 12,
  },
  heroMetricLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroMetricNumber: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 6,
  },
  sharedBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratioSummary: {
    fontSize: 14,
    fontWeight: '800',
  },
  sharedBarTrack: {
    height: 28,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'visible',
    position: 'relative',
    marginVertical: 4,
  },
  sharedSegment: {
    height: '100%',
  },
  barCircleNode: {
    position: 'absolute',
    top: -4,
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: -18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  innerNodeCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
  },
  dragBarHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dragBarHelperText: {
    fontSize: 12,
    fontWeight: '500',
  },
  macroCardsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 4,
  },
  macroStepperCard: {
    flex: 1,
    padding: 12,
    borderRadius: 18,
    alignItems: 'center',
  },
  macroCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  circleLegendNode: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroCardTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  macroCardValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  macroCardGrams: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    marginBottom: 8,
  },
  macroStepperButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  macroMiniBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Fuel Notched Scrollable Ruler */
  fuelReadoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  fuelReadoutNumber: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  fuelReadoutUnit: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  fuelRulerBox: {
    height: 90,
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
    marginVertical: 4,
  },
  fuelCenterNeedle: {
    position: 'absolute',
    top: 6,
    left: '50%',
    marginLeft: -1.5,
    width: 3,
    height: 44,
    borderRadius: 1.5,
    zIndex: 10,
  },
  fuelCenterTriangle: {
    position: 'absolute',
    top: 48,
    left: '50%',
    marginLeft: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    zIndex: 10,
  },
  fuelRulerTrack: {
    paddingHorizontal: '50%',
    alignItems: 'flex-start',
    paddingTop: 10,
  },
  fuelTickWrapper: {
    width: 14,
    alignItems: 'center',
  },
  fuelTickLine: {
    borderRadius: 1,
  },
  fuelTickNumber: {
    fontSize: 10.5,
    marginTop: 8,
    width: 32,
    textAlign: 'center',
  },
  fuelTargetPillRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  fuelTargetPill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 3,
  },
  fuelTargetPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fuelTargetPillValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  fuelInfoHeadline: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  /* Navigation buttons */
  navRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  navBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 22,
    gap: 6,
  },
  navBackBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  navNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 22,
    gap: 8,
  },
  navNextBtnText: {
    color: '#09090b',
    fontSize: 15,
    fontWeight: '800',
  },
});
