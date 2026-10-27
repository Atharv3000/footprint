import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { useAuth } from '@/constants/AuthContext';
import { NutritionTargets, saveNutritionTargets, ActivityLevel } from '@/constants/nutritionStorage';
import { DragSlider } from '@/components/DragSlider';

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
    sub: 'Desk job, little movement',
    multiplier: 1.2,
    icon: 'desktop-outline',
    desc: 'Low physical output during work and recreation.',
  },
  {
    id: 'light',
    label: 'Light Active',
    sub: '1–3 workouts or walks/wk',
    multiplier: 1.375,
    icon: 'walk-outline',
    desc: 'Light daily exercise, 4,000–7,000 daily steps.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    sub: '3–5 gym sessions/wk',
    multiplier: 1.55,
    icon: 'barbell-outline',
    desc: 'Active training regimen, 8,000–11,000 daily steps.',
  },
  {
    id: 'very_active',
    label: 'Very Active',
    sub: '6–7 intense workouts/wk',
    multiplier: 1.725,
    icon: 'bicycle-outline',
    desc: 'Rigorous daily athletic training or physically demanding job.',
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
    desc: '30% Protein · 40% Carbs · 30% Fat · All-around performance & energy',
    proteinPct: 30,
    carbsPct: 40,
    fatPct: 30,
    icon: 'scale-outline',
  },
  {
    id: 'high_protein',
    name: 'High Protein',
    desc: '40% Protein · 35% Carbs · 25% Fat · Hypertrophy, muscle retention & fullness',
    proteinPct: 40,
    carbsPct: 35,
    fatPct: 25,
    icon: 'barbell-outline',
  },
  {
    id: 'endurance',
    name: 'Endurance',
    desc: '20% Protein · 60% Carbs · 20% Fat · High glycogen reloading for runners',
    proteinPct: 20,
    carbsPct: 60,
    fatPct: 20,
    icon: 'bicycle-outline',
  },
  {
    id: 'keto',
    name: 'Keto',
    desc: '25% Protein · 10% Carbs · 65% Fat · Low-glycemic ketosis and steady fuel',
    proteinPct: 25,
    carbsPct: 10,
    fatPct: 65,
    icon: 'flame-outline',
  },
];

export function MacroCustomizerModal({
  visible,
  targets,
  onClose,
  onSaved,
}: MacroCustomizerModalProps) {
  const { colors } = useTheme();
  const { profile } = useAuth();

  // Energy Level selection
  const [selectedEnergyLevel, setSelectedEnergyLevel] = useState<ActivityLevel>('moderate');

  // Daily calories and chosen calorie preset
  const [dailyCalories, setDailyCalories] = useState<number>(targets.dailyCalories || 2200);
  const [selectedCalPreset, setSelectedCalPreset] = useState<string>('maintenance');

  // Percentage split: Protein, Carbs, Fat
  const [protPct, setProtPct] = useState<number>(30);
  const [carbPct, setCarbPct] = useState<number>(40);
  const fatPct = Math.max(5, 100 - protPct - carbPct);
  const [selectedMacroPreset, setSelectedMacroPreset] = useState<string>('balanced');

  const barTrackWidthRef = useRef<number>(300);
  const barPageXRef = useRef<number>(0);
  const barTrackViewRef = useRef<any>(null);
  const activeNodeRef = useRef<'node1' | 'node2' | null>(null);

  // Compute User BMR & TDEE accurately from body measurements
  const { bmr, tdee, weightKg, heightCm, age, gender } = useMemo(() => {
    const w = profile?.weightKg || 72;
    const h = profile?.heightCm || 175;
    const a = profile?.age || 26;
    const g = profile?.gender || 'male';

    let calcBmr = 10 * w + 6.25 * h - 5 * a;
    if (g === 'female') {
      calcBmr -= 161;
    } else {
      calcBmr += 5;
    }

    const energyObj = ENERGY_LEVELS.find((e) => e.id === selectedEnergyLevel) || ENERGY_LEVELS[2];
    const calcTdee = Math.round(calcBmr * energyObj.multiplier);

    return {
      bmr: Math.round(calcBmr),
      tdee: calcTdee,
      weightKg: w,
      heightCm: h,
      age: a,
      gender: g,
    };
  }, [profile, selectedEnergyLevel]);

  // Dynamically calculated Calorie Goals from TDEE
  const caloriePresets = useMemo(() => {
    const fatLossCal = Math.max(1200, Math.round(tdee - 450));
    const maintenanceCal = Math.round(tdee);
    const leanBulkCal = Math.round(tdee + 250);
    const heavyBulkCal = Math.round(tdee + 500);

    return [
      {
        id: 'cut',
        name: 'Fat Loss',
        calories: fatLossCal,
        delta: -450,
        desc: `Target: ${fatLossCal} kcal (~450 kcal deficit from your ${tdee} kcal TDEE). Projected ~0.9 lb/week fat loss while preserving muscle.`,
      },
      {
        id: 'maintenance',
        name: 'Maintenance',
        calories: maintenanceCal,
        delta: 0,
        desc: `Target: ${maintenanceCal} kcal (Exact match to your ${tdee} kcal TDEE). Preserves current weight while fueling training.`,
      },
      {
        id: 'lean_bulk',
        name: 'Lean Bulk',
        calories: leanBulkCal,
        delta: 250,
        desc: `Target: ${leanBulkCal} kcal (+250 kcal surplus). Supports clean hypertrophy (~0.4 lb/week gain) with minimal fat accrual.`,
      },
      {
        id: 'heavy_bulk',
        name: 'Heavy Bulk',
        calories: heavyBulkCal,
        delta: 500,
        desc: `Target: ${heavyBulkCal} kcal (+500 kcal surplus). High energy for maximum strength progression and rapid muscle building.`,
      },
    ];
  }, [tdee]);

  // Synchronize initial targets on open
  React.useEffect(() => {
    if (visible) {
      const initCals = targets.dailyCalories || tdee;
      setDailyCalories(initCals);

      const pG = targets.proteinGrams || Math.round((initCals * 0.3) / 4);
      const cG = targets.carbsGrams || Math.round((initCals * 0.4) / 4);
      const fG = targets.fatGrams || Math.round((initCals * 0.3) / 9);
      const totalCals = pG * 4 + cG * 4 + fG * 9 || initCals;

      const pPct = Math.round(((pG * 4) / totalCals) * 100);
      const cPct = Math.round(((cG * 4) / totalCals) * 100);
      setProtPct(Math.max(10, Math.min(80, pPct)));
      setCarbPct(Math.max(10, Math.min(80, cPct)));

      const matchCal = caloriePresets.find((p) => p.calories === initCals);
      setSelectedCalPreset(matchCal ? matchCal.id : 'custom');

      const matchMacro = PRESET_OPTIONS.find((p) => p.proteinPct === pPct && p.carbsPct === cPct);
      setSelectedMacroPreset(matchMacro ? matchMacro.id : 'custom');
    }
  }, [visible, targets, tdee, caloriePresets]);

  // Gram amounts strictly derived out of current daily calorie target and macro percentages
  const proteinG = Math.round((dailyCalories * (protPct / 100)) / 4);
  const carbsG = Math.round((dailyCalories * (carbPct / 100)) / 4);
  const fatG = Math.round((dailyCalories * (fatPct / 100)) / 9);

  // When changing energy level, update TDEE and adjust preset targets
  const handleSelectEnergyLevel = (levelId: ActivityLevel) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedEnergyLevel(levelId);

    const energyObj = ENERGY_LEVELS.find((e) => e.id === levelId) || ENERGY_LEVELS[2];
    const newTdee = Math.round(bmr * energyObj.multiplier);

    // If currently on a standard preset, adapt the calories to the new TDEE
    if (selectedCalPreset === 'cut') {
      setDailyCalories(Math.max(1200, newTdee - 450));
    } else if (selectedCalPreset === 'maintenance') {
      setDailyCalories(newTdee);
    } else if (selectedCalPreset === 'lean_bulk') {
      setDailyCalories(newTdee + 250);
    } else if (selectedCalPreset === 'heavy_bulk') {
      setDailyCalories(newTdee + 500);
    }
  };

  // When user moves calorie slider, update calories and switch calorie preset pill to 'custom'
  const handleCalorieSliderChange = (newVal: number) => {
    setDailyCalories(newVal);
    const match = caloriePresets.find((p) => p.calories === newVal);
    setSelectedCalPreset(match ? match.id : 'custom');
  };

  // When user selects a calorie preset pill
  const handleSelectCalPreset = (preset: { id: string; calories: number }) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedCalPreset(preset.id);
    setDailyCalories(preset.calories);
  };

  // ROBUST TRIPLE SLIDER NODE ADJUSTMENT
  // Node 1 divides Protein and Carbs; Fat is held fixed
  // Node 2 divides Carbs and Fat; Protein is held fixed
  const handleUpdateFromNodePosition = (nodeType: 'node1' | 'node2', pageX: number) => {
    const width = barTrackWidthRef.current || 300;
    const startX = barPageXRef.current || 0;
    const relativeX = Math.max(0, Math.min(width, pageX - startX));
    const touchPct = Math.round((relativeX / width) * 100);

    setSelectedMacroPreset('custom');

    if (nodeType === 'node1') {
      // Node 1 divider between Protein and Carbs
      // Keep Fat fixed, distribute between Protein & Carbs
      const currentFat = fatPct;
      const budget = 100 - currentFat; // Protein + Carbs
      // Protein min 5%, Carbs min 5%
      const newProt = Math.max(5, Math.min(budget - 5, touchPct));
      const newCarb = budget - newProt;

      setProtPct(newProt);
      setCarbPct(newCarb);
    } else {
      // Node 2 divider between Carbs and Fat
      // Keep Protein fixed, distribute between Carbs & Fat
      const fixedProt = protPct;
      const maxSplit = 95; // Fat min 5%
      const minSplit = fixedProt + 5; // Carbs min 5%
      const newSplit = Math.max(minSplit, Math.min(maxSplit, touchPct));
      const newCarb = newSplit - fixedProt;

      setCarbPct(newCarb);
    }
  };

  // Direct nudge helpers for each macro (+ / - 5%)
  const handleAdjustMacro = (macro: 'protein' | 'carbs' | 'fat', delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedMacroPreset('custom');

    if (macro === 'protein') {
      const newProt = Math.max(5, Math.min(85, protPct + delta));
      const change = newProt - protPct;
      if (change === 0) return;
      // Compensate first from carbs, then fat
      let remaining = change;
      let newCarb = carbPct;
      let newFat = fatPct;
      if (remaining > 0) {
        const takeCarb = Math.min(newCarb - 5, remaining);
        newCarb -= takeCarb;
        remaining -= takeCarb;
        if (remaining > 0) {
          newFat = Math.max(5, newFat - remaining);
        }
      } else {
        newCarb += Math.abs(remaining);
      }
      setProtPct(newProt);
      setCarbPct(newCarb);
    } else if (macro === 'carbs') {
      const newCarb = Math.max(5, Math.min(85, carbPct + delta));
      const change = newCarb - carbPct;
      if (change === 0) return;
      // Compensate from fat first, then protein
      let remaining = change;
      let newFat = fatPct;
      let newProt = protPct;
      if (remaining > 0) {
        const takeFat = Math.min(newFat - 5, remaining);
        newFat -= takeFat;
        remaining -= takeFat;
        if (remaining > 0) {
          newProt = Math.max(5, newProt - remaining);
        }
      } else {
        newFat += Math.abs(remaining);
      }
      setProtPct(newProt);
      setCarbPct(newCarb);
    } else {
      // macro === 'fat'
      const newFat = Math.max(5, Math.min(85, fatPct + delta));
      const change = newFat - fatPct;
      if (change === 0) return;
      // Compensate from carbs first, then protein
      let remaining = change;
      let newCarb = carbPct;
      let newProt = protPct;
      if (remaining > 0) {
        const takeCarb = Math.min(newCarb - 5, remaining);
        newCarb -= takeCarb;
        remaining -= takeCarb;
        if (remaining > 0) {
          newProt = Math.max(5, newProt - remaining);
        }
      } else {
        newCarb += Math.abs(remaining);
      }
      setProtPct(newProt);
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

  // Apply a macro split preset pill
  const handleApplyMacroPreset = (preset: PresetOption) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedMacroPreset(preset.id);
    setProtPct(preset.proteinPct);
    setCarbPct(preset.carbsPct);
  };

  const handleSave = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const updated: NutritionTargets = {
      ...targets,
      dailyCalories,
      proteinGrams: proteinG,
      carbsGrams: carbsG,
      fatGrams: fatG,
    };
    await saveNutritionTargets(updated);
    onSaved(updated);
    onClose();
  };

  const activeCalPresetObj = caloriePresets.find((p) => p.id === selectedCalPreset);
  const activeMacroPresetObj = PRESET_OPTIONS.find((p) => p.id === selectedMacroPreset);

  // Dynamic customized outcome text for calorie goal
  const customCalorieOutcomeText = useMemo(() => {
    const delta = dailyCalories - tdee;
    if (Math.abs(delta) < 75) {
      return `Neutral balance (${dailyCalories} kcal). Ideal for weight stabilization, body recomposition, and metabolic health.`;
    } else if (delta < 0) {
      const weeklyLbs = Math.abs((delta * 7) / 3500).toFixed(1);
      return `Caloric deficit of ${Math.abs(delta)} kcal/day below your ${tdee} kcal expenditure. Projected weight loss rate: ~${weeklyLbs} lbs/week.`;
    } else {
      const weeklyLbs = ((delta * 7) / 3500).toFixed(1);
      return `Caloric surplus of +${delta} kcal/day above your ${tdee} kcal expenditure. Projected weight gain rate: ~${weeklyLbs} lbs/week.`;
    }
  }, [dailyCalories, tdee]);

  // Dynamic customized outcome text for macro goal
  const customMacroOutcomeText = useMemo(() => {
    const pPerKg = (proteinG / (weightKg || 70)).toFixed(1);
    let outcome = `${protPct}% Protein (${proteinG}g · ${pPerKg}g/kg), ${carbPct}% Carbs (${carbsG}g), ${fatPct}% Fat (${fatG}g). `;
    if (protPct >= 35) {
      outcome += 'High protein supports maximum muscle synthesis and satiety during dieting.';
    } else if (carbPct >= 50) {
      outcome += 'High carbohydrate intake fuels intense cardio, long walks, and rapid glycogen recovery.';
    } else if (fatPct >= 50) {
      outcome += 'High dietary fat intake facilitates ketone production and sustained energy.';
    } else {
      outcome += 'Evenly distributed macronutrients support steady metabolic performance and athletic endurance.';
    }
    return outcome;
  }, [protPct, carbPct, fatPct, proteinG, carbsG, fatG, weightKg]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        {/* Top Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.title, { color: colors.text }]}>Macro Goals</Text>
          </View>
          <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.saveHeaderText, { color: colors.primary }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* 1. ENERGY LEVEL PICKER AT THE TOP */}
          <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[styles.cardLabel, { color: colors.textMuted }]}>DAILY ENERGY EXPENDITURE</Text>
              <Text style={[styles.tdeeMetricBadge, { color: colors.primary }]}>
                BMR: {bmr} · TDEE: {tdee} kcal
              </Text>
            </View>

            <Text style={[styles.bodyMetricsSummary, { color: colors.textSecondary }]}>
              Calculated from your profile ({weightKg} kg · {heightCm} cm · {age} yrs · {gender}):
            </Text>

            {/* Energy Level Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsScrollRow}
              style={{ marginTop: 8 }}
            >
              {ENERGY_LEVELS.map((level) => {
                const isSelected = selectedEnergyLevel === level.id;
                return (
                  <TouchableOpacity
                    key={level.id}
                    style={[
                      styles.presetPill,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleSelectEnergyLevel(level.id)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={level.icon}
                      size={14}
                      color={isSelected ? '#09090b' : colors.text}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.presetPillText,
                        { color: isSelected ? '#09090b' : colors.text },
                      ]}
                    >
                      {level.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Description below selected energy level pill */}
            {(() => {
              const activeEnergy = ENERGY_LEVELS.find((e) => e.id === selectedEnergyLevel);
              return (
                <View style={[styles.pillInfoBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginTop: 10 }]}>
                  <Ionicons name="flash-outline" size={15} color={colors.primary} style={{ marginTop: 1 }} />
                  <Text style={[styles.pillInfoText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{activeEnergy?.label} ({activeEnergy?.sub}): </Text>
                    {activeEnergy?.desc} Estimated Total Daily Energy Expenditure: <Text style={{ fontWeight: '800', color: colors.primary }}>{tdee} kcal</Text>.
                  </Text>
                </View>
              );
            })()}
          </View>

          {/* 2. DAILY CALORIE TARGET WITH PRESET PILLS */}
          <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <Text style={[styles.cardLabel, { color: colors.textMuted }]}>DAILY CALORIE TARGET</Text>
                <Text style={[styles.cardCalNumber, { color: colors.text }]}>
                  {dailyCalories} <Text style={{ fontSize: 15, color: colors.textMuted, fontWeight: '500' }}>KCAL</Text>
                </Text>
              </View>

              <DragSlider
                label="Daily Calorie Target"
                hideHeader={true}
                value={dailyCalories}
                min={1200}
                max={4500}
                step={25}
                color={colors.primary}
                unit="kcal"
                onValueChange={handleCalorieSliderChange}
              />

              {/* Calorie Preset Pills with Custom on very right */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsScrollRow}
                style={{ marginTop: 12 }}
              >
                {caloriePresets.map((p) => {
                  const isSelected = selectedCalPreset === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.presetPill,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => handleSelectCalPreset(p)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.presetPillText,
                          { color: isSelected ? '#09090b' : colors.text },
                        ]}
                      >
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Custom Pill on Very Right */}
                <TouchableOpacity
                  style={[
                    styles.presetPill,
                    {
                      backgroundColor: selectedCalPreset === 'custom' ? colors.primary : colors.surfaceSecondary,
                      borderColor: selectedCalPreset === 'custom' ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelectedCalPreset('custom');
                  }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.presetPillText,
                      { color: selectedCalPreset === 'custom' ? '#09090b' : colors.text },
                    ]}
                  >
                    Custom
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Dynamic outcome text below selected calorie pill */}
              <View style={[styles.pillInfoBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Ionicons name="flame-outline" size={15} color={colors.primary} style={{ marginTop: 1 }} />
                <Text style={[styles.pillInfoText, { color: colors.textSecondary }]}>
                  {selectedCalPreset === 'custom'
                    ? customCalorieOutcomeText
                    : activeCalPresetObj?.desc || ''}
                </Text>
              </View>
            </View>
          </View>

          {/* 3. SHARED MAIN RATIO BAR WITH INTERACTIVE NODES & PRESET PILLS */}
          <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.sharedBarHeader}>
              <Text style={[styles.cardLabel, { color: colors.textMuted }]}>SHARED RATIO BREAKDOWN</Text>
            </View>

            {/* The Shared Combined Bar with PanResponder direct drag interaction */}
            <View
              ref={barTrackViewRef}
              style={[styles.sharedBarTrack, { backgroundColor: colors.border }]}
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
              {/* Protein Segment */}
              <View style={[styles.sharedSegment, { width: `${protPct}%`, backgroundColor: '#38bdf8' }]} />
              {/* Carbs Segment */}
              <View style={[styles.sharedSegment, { width: `${carbPct}%`, backgroundColor: '#a3e635' }]} />
              {/* Fat Segment */}
              <View style={[styles.sharedSegment, { width: `${fatPct}%`, backgroundColor: '#f59e0b' }]} />

              {/* Slider Node 1: Protein - Carbs Divider */}
              <View
                pointerEvents="none"
                style={[
                  styles.barCircleNode,
                  {
                    left: `${Math.max(4, Math.min(94, protPct))}%`,
                    borderColor: colors.surfaceElevated || '#09090b',
                    backgroundColor: '#38bdf8',
                  },
                ]}
              >
                <View style={styles.innerNodeCore} />
              </View>

              {/* Slider Node 2: Carbs - Fat Divider */}
              <View
                pointerEvents="none"
                style={[
                  styles.barCircleNode,
                  {
                    left: `${Math.max(6, Math.min(96, protPct + carbPct))}%`,
                    borderColor: colors.surfaceElevated || '#09090b',
                    backgroundColor: '#a3e635',
                  },
                ]}
              >
                <View style={styles.innerNodeCore} />
              </View>
            </View>

            {/* Hint for dragging the nodes */}
            <View style={styles.dragBarHelperRow}>
              <Ionicons name="swap-horizontal" size={13} color={colors.textMuted} />
              <Text style={[styles.dragBarHelperText, { color: colors.textMuted }]}>
                Drag divider nodes or tap +/- below to balance macros
              </Text>
            </View>

            {/* Macro Cards with Direct Stepper Nudge Controls */}
            <View style={styles.macroCardsRow}>
              {/* Protein Card */}
              <View style={[styles.macroStepperCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <View style={styles.macroCardHeader}>
                  <View style={[styles.circleLegendNode, { backgroundColor: '#38bdf8' }]} />
                  <Text style={[styles.macroCardTitle, { color: colors.text }]}>Protein</Text>
                </View>
                <Text style={[styles.macroCardValue, { color: '#38bdf8' }]}>{protPct}%</Text>
                <Text style={[styles.macroCardGrams, { color: colors.textMuted }]}>{proteinG}g</Text>
                <View style={styles.macroStepperButtons}>
                  <TouchableOpacity
                    style={[styles.macroMiniBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                    onPress={() => handleAdjustMacro('protein', -5)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={14} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.macroMiniBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                    onPress={() => handleAdjustMacro('protein', +5)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={14} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Carbs Card */}
              <View style={[styles.macroStepperCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <View style={styles.macroCardHeader}>
                  <View style={[styles.circleLegendNode, { backgroundColor: '#a3e635' }]} />
                  <Text style={[styles.macroCardTitle, { color: colors.text }]}>Carbs</Text>
                </View>
                <Text style={[styles.macroCardValue, { color: '#a3e635' }]}>{carbPct}%</Text>
                <Text style={[styles.macroCardGrams, { color: colors.textMuted }]}>{carbsG}g</Text>
                <View style={styles.macroStepperButtons}>
                  <TouchableOpacity
                    style={[styles.macroMiniBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                    onPress={() => handleAdjustMacro('carbs', -5)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={14} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.macroMiniBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                    onPress={() => handleAdjustMacro('carbs', +5)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={14} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Fat Card */}
              <View style={[styles.macroStepperCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <View style={styles.macroCardHeader}>
                  <View style={[styles.circleLegendNode, { backgroundColor: '#f59e0b' }]} />
                  <Text style={[styles.macroCardTitle, { color: colors.text }]}>Fat</Text>
                </View>
                <Text style={[styles.macroCardValue, { color: '#f59e0b' }]}>{fatPct}%</Text>
                <Text style={[styles.macroCardGrams, { color: colors.textMuted }]}>{fatG}g</Text>
                <View style={styles.macroStepperButtons}>
                  <TouchableOpacity
                    style={[styles.macroMiniBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                    onPress={() => handleAdjustMacro('fat', -5)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={14} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.macroMiniBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                    onPress={() => handleAdjustMacro('fat', +5)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={14} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Macro Split Preset Pills with Custom on very right */}
            <View style={{ marginTop: 18 }}>
              <Text style={[styles.cardLabel, { color: colors.textMuted, marginBottom: 8 }]}>
                MACRO SPLIT PRESETS
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsScrollRow}
              >
                {PRESET_OPTIONS.map((preset) => {
                  const isSelected = selectedMacroPreset === preset.id;
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      style={[
                        styles.presetPill,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => handleApplyMacroPreset(preset)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.presetPillText,
                          { color: isSelected ? '#09090b' : colors.text },
                        ]}
                      >
                        {preset.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Custom Pill on Very Right for Macro Slider */}
                <TouchableOpacity
                  style={[
                    styles.presetPill,
                    {
                      backgroundColor: selectedMacroPreset === 'custom' ? colors.primary : colors.surfaceSecondary,
                      borderColor: selectedMacroPreset === 'custom' ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelectedMacroPreset('custom');
                  }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.presetPillText,
                      { color: selectedMacroPreset === 'custom' ? '#09090b' : colors.text },
                    ]}
                  >
                    Custom
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Dynamic outcome text below selected macro pill */}
              <View style={[styles.pillInfoBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Ionicons name="pie-chart-outline" size={15} color={colors.primary} style={{ marginTop: 1 }} />
                <Text style={[styles.pillInfoText, { color: colors.textSecondary }]}>
                  {selectedMacroPreset === 'custom'
                    ? customMacroOutcomeText
                    : `${activeMacroPresetObj?.name}: ${activeMacroPresetObj?.desc}.`}
                </Text>
              </View>
            </View>
          </View>

          {/* Apply Button */}
          <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={handleSave} activeOpacity={0.85}>
            <Ionicons name="checkmark-done" size={20} color="#09090b" />
            <Text style={styles.applyBtnText}>Apply Macro Targets</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bodyMetricsSummary: {
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 17,
  },
  tdeeMetricBadge: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 6,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
  saveHeaderBtn: {
    padding: 6,
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  saveHeaderText: {
    fontSize: 16,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardCalNumber: {
    fontSize: 32,
    fontWeight: '900',
    fontFamily: SERIF_FONT,
    marginTop: 2,
  },
  calAdjustRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  ratioSummary: {
    fontSize: 13,
    fontWeight: '800',
  },
  sharedBarTrack: {
    height: 24,
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'visible',
    position: 'relative',
    marginBottom: 10,
  },
  sharedSegment: {
    height: '100%',
  },
  barCircleNode: {
    position: 'absolute',
    top: -6,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    marginLeft: -18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 10,
  },
  innerNodeCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  dragBarHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  dragBarHelperText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  macroCardsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  macroStepperCard: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  macroCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  macroCardTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  macroCardValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: SERIF_FONT,
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
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodesLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 4,
  },
  legendNodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  circleLegendNode: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendNodeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  legendSubAmount: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  sliderRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  macroBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroRowTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  macroRowGrams: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  miniStepperWrap: {
    flexDirection: 'row',
    gap: 8,
  },
  miniStepBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDivider: {
    height: 1,
    marginVertical: 10,
  },
  presetsList: {
    gap: 8,
  },
  presetItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  presetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  presetDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  pillsScrollRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  presetPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetPillText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  pillInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  pillInfoText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 4,
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#09090b',
  },
});
