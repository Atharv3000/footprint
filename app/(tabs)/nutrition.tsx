import { CalorieChallenges } from '@/components/CalorieChallenges';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Alert,
  Modal,
  Platform,
  Dimensions,
  PanResponder,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import {
  NutritionTargets,
  MealLog,
  MealType,
  loadNutritionTargets,
  loadMealLogs,
  deleteMealLog,
  loadDailyWater,
  saveDailyWater,
  getTodayDateKey,
  loadSavedQuiz,
  MacroQuizAnswers,
  DEFAULT_NUTRITION_TARGETS,
} from '@/constants/nutritionStorage';
import { MacroGoalQuizModal } from '@/components/MacroGoalQuizModal';
import { MacroCustomizerModal } from '@/components/MacroCustomizerModal';
import { FoodLoggingModal } from '@/components/FoodLoggingModal';
import { NutritionHistoryModal } from '@/components/NutritionHistoryModal';
import { useAuth } from '@/constants/AuthContext';

const MEAL_CATEGORIES: { type: MealType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; desc: string }[] = [
  { type: 'breakfast', label: 'Breakfast', icon: 'sunny-outline', color: '#f59e0b', desc: 'Kickstart your energy' },
  { type: 'lunch', label: 'Lunch', icon: 'restaurant-outline', color: '#38bdf8', desc: 'Midday fuel' },
  { type: 'dinner', label: 'Dinner', icon: 'moon-outline', color: '#a855f7', desc: 'Evening recovery' },
  { type: 'snack', label: 'Snacks', icon: 'cafe-outline', color: '#10b981', desc: 'Bites & drinks' },
];

export default function NutritionScreen() {
  const { colors, isDark } = useTheme();
  const { profile } = useAuth();

  const [targets, setTargets] = useState<NutritionTargets>(DEFAULT_NUTRITION_TARGETS);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [allMealsHistory, setAllMealsHistory] = useState<MealLog[]>([]);
  const [waterMl, setWaterMl] = useState<number>(0);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [savedQuiz, setSavedQuiz] = useState<MacroQuizAnswers | null>(null);

  // Modals & Logging Flows
  const [showQuizModal, setShowQuizModal] = useState<boolean>(false);
  const [showCustomizerModal, setShowCustomizerModal] = useState<boolean>(false);
  const [showLogModal, setShowLogModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [activeMealType, setActiveMealType] = useState<MealType>('breakfast');

  const todayKey = getTodayDateKey();
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [dailyTotalsMap, setDailyTotalsMap] = useState<Record<string, { cals: number; metGoal: boolean }>>({});
  const [weekOffset, setWeekOffset] = useState<number>(0); // 0 = current week, -1 = 1 week ago, etc.

  // Slide animation for day transition
  const pageSlideAnim = useRef(new Animated.Value(0)).current;
  const pageOpacityAnim = useRef(new Animated.Value(1)).current;

  // Generate strip of 7 days for the currently selected week (offset from today's week)
  const dateStrip = React.useMemo(() => {
    const list: { key: string; dayLabel: string; dateNum: number; isToday: boolean; isFuture: boolean; fullDate: Date }[] = [];
    const baseAnchor = new Date(todayKey + 'T12:00:00');
    // Shift by weekOffset * 7 days
    baseAnchor.setDate(baseAnchor.getDate() + weekOffset * 7);

    // Render 7 consecutive days ending on baseAnchor
    for (let offset = -6; offset <= 0; offset++) {
      const d = new Date(baseAnchor);
      d.setDate(d.getDate() + offset);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      list.push({
        key,
        dayLabel: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
        dateNum: d.getDate(),
        isToday: key === todayKey,
        isFuture: key > todayKey,
        fullDate: d,
      });
    }
    return list;
  }, [weekOffset, todayKey]);

  // Compute stats for History Pill (percentage vs last week + projected weight on current diet)
  const historyPillStats = React.useMemo(() => {
    // Current 7 days (ending today)
    const curEnd = new Date(todayKey + 'T12:00:00');
    const curStart = new Date(curEnd);
    curStart.setDate(curStart.getDate() - 6);

    // Prior 7 days (7 to 13 days ago)
    const prevEnd = new Date(curStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - 6);

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const curKStart = fmt(curStart);
    const curKEnd = fmt(curEnd);
    const prevKStart = fmt(prevStart);
    const prevKEnd = fmt(prevEnd);

    let curSum = 0;
    let curDaysCount = 0;
    let prevSum = 0;
    let prevDaysCount = 0;

    const curDaysSeen = new Set<string>();
    const prevDaysSeen = new Set<string>();

    allMealsHistory.forEach((m) => {
      if (m.dateKey >= curKStart && m.dateKey <= curKEnd) {
        curSum += m.calories;
        curDaysSeen.add(m.dateKey);
      } else if (m.dateKey >= prevKStart && m.dateKey <= prevKEnd) {
        prevSum += m.calories;
        prevDaysSeen.add(m.dateKey);
      }
    });

    curDaysCount = Math.max(1, curDaysSeen.size);
    prevDaysCount = Math.max(1, prevDaysSeen.size);

    const curDailyAvg = curSum > 0 ? Math.round(curSum / curDaysCount) : 0;
    const prevDailyAvg = prevSum > 0 ? Math.round(prevSum / prevDaysCount) : 0;

    // Percent diff vs last week
    let pctDiff = 0;
    let hasPrevData = prevDailyAvg > 0;
    if (hasPrevData && curDailyAvg > 0) {
      pctDiff = Math.round(((curDailyAvg - prevDailyAvg) / prevDailyAvg) * 100);
    }

    // Weight projection based on consumed calories (not the target!)
    // If no recent meals logged, fallback to today's consumption or targets
    const effectiveConsumed = curDailyAvg > 0 ? curDailyAvg : meals.reduce((a, b) => a + b.calories, 0);

    // Maintenance TDEE estimate based on user weight, height, age, gender
    const weightKg = profile?.weightKg || 70;
    const heightCm = profile?.heightCm || 175;
    const age = profile?.age || 28;
    const isMale = !profile?.gender?.toLowerCase().includes('fe');
    const isUS = profile?.unitSystem !== 'metric';

    // Mifflin-St Jeor TDEE with moderate activity factor (1.4)
    const bmr = isMale
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    const tdee = Math.round(bmr * 1.4);

    const activeCals = effectiveConsumed > 0 ? effectiveConsumed : tdee;
    const calDiff = activeCals - tdee; // surplus (>0) or deficit (<0)
    const monthlyLbs = (calDiff * 30) / 3500;
    const currentLbs = weightKg * 2.20462;
    const projectedWeightLbs = Math.max(50, Math.round(currentLbs + monthlyLbs));
    const projectedWeightKg = Math.max(25, Math.round(weightKg + (monthlyLbs / 2.20462)));

    return {
      curDailyAvg,
      prevDailyAvg,
      pctDiff,
      hasPrevData,
      isUp: pctDiff > 0,
      tdee,
      projectedWeightStr: isUS ? `${projectedWeightLbs} lbs in a mo` : `${projectedWeightKg} kg in a mo`,
      weightKg,
      isUS,
    };
  }, [allMealsHistory, meals, profile, todayKey]);
  const loadAllNutritionData = useCallback(async (targetKey = selectedDateKey) => {
    try {
      const [loadedTargets, loadedMeals, loadedWater, loadedQuiz, allMealsRaw] = await Promise.all([
        loadNutritionTargets(),
        loadMealLogs(targetKey),
        loadDailyWater(targetKey),
        loadSavedQuiz(),
        loadMealLogs(), // all meals to compute goal completion for recent days
      ]);
      setTargets(loadedTargets);
      setMeals(loadedMeals);
      setAllMealsHistory(allMealsRaw);
      setWaterMl(loadedWater);
      setSavedQuiz(loadedQuiz);

      // Build daily completion map
      const totals: Record<string, { cals: number; metGoal: boolean }> = {};
      allMealsRaw.forEach((m) => {
        if (!totals[m.dateKey]) totals[m.dateKey] = { cals: 0, metGoal: false };
        totals[m.dateKey].cals += m.calories;
      });
      Object.keys(totals).forEach((k) => {
        totals[k].metGoal = totals[k].cals >= (loadedTargets.dailyCalories * 0.9);
      });
      setDailyTotalsMap(totals);
    } catch (e) {
      console.error('Error loading nutrition data:', e);
    }
  }, [selectedDateKey]);

  useEffect(() => {
    loadAllNutritionData(selectedDateKey);
  }, [selectedDateKey, loadAllNutritionData]);

  const switchDayWithAnimation = (newKey: string, direction: 'left' | 'right') => {
    if (newKey > todayKey) return; // Disallow navigating to future dates
    Haptics.selectionAsync().catch(() => {});
    const exitVal = direction === 'left' ? -120 : 120;
    const enterVal = direction === 'left' ? 120 : -120;

    Animated.parallel([
      Animated.timing(pageSlideAnim, {
        toValue: exitVal,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(pageOpacityAnim, {
        toValue: 0.3,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSelectedDateKey(newKey);
      pageSlideAnim.setValue(enterVal);
      Animated.parallel([
        Animated.spring(pageSlideAnim, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(pageOpacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const shiftDay = (days: number) => {
    const cur = new Date(selectedDateKey + 'T12:00:00');
    cur.setDate(cur.getDate() + days);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const targetKey = `${y}-${m}-${d}`;
    
    // Prevent moving into the future beyond today
    if (targetKey > todayKey) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    switchDayWithAnimation(targetKey, days > 0 ? 'left' : 'right');
  };

  const shiftWeek = (direction: -1 | 1) => {
    const nextOffset = weekOffset + direction;
    if (nextOffset > 0) {
      // Disallow moving past the current week into future weeks
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setWeekOffset(nextOffset);
    // Also select the corresponding day in that new week
    const cur = new Date(selectedDateKey + 'T12:00:00');
    cur.setDate(cur.getDate() + direction * 7);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    let targetKey = `${y}-${m}-${d}`;
    if (targetKey > todayKey) targetKey = todayKey;
    switchDayWithAnimation(targetKey, direction > 0 ? 'left' : 'right');
  };

  // Horizontal pan responder to swipe between parallel day UIs
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 25 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50) {
          // Swipe left -> Next day (only if not already at today)
          if (selectedDateKey >= todayKey) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            return;
          }
          shiftDay(1);
        } else if (gestureState.dx > 50) {
          // Swipe right -> Previous day (history)
          shiftDay(-1);
        }
      },
    })
  ).current;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllNutritionData(selectedDateKey);
    setRefreshing(false);
  };

  // Aggregated Daily Metrics
  const totalCaloriesConsumed = meals.reduce((acc, m) => acc + m.calories, 0);
  const totalProteinConsumed = Math.round(meals.reduce((acc, m) => acc + m.proteinG, 0));
  const totalCarbsConsumed = Math.round(meals.reduce((acc, m) => acc + m.carbsG, 0));
  const totalFatConsumed = Math.round(meals.reduce((acc, m) => acc + m.fatG, 0));

  const remainingCalories = Math.max(0, targets.dailyCalories - totalCaloriesConsumed);
  const rawCaloriePercent = Math.round((totalCaloriesConsumed / (targets.dailyCalories || 1)) * 100);
  const caloriePercent = Math.min(100, rawCaloriePercent);
  const isOverGoal = totalCaloriesConsumed > targets.dailyCalories;
  const excessCalories = isOverGoal ? totalCaloriesConsumed - targets.dailyCalories : 0;
  // Width percentage for standard fill (capped at 100%)
  const calorieBasePercent = caloriePercent;

  // Quick hydration logging
  const handleAddWater = async (amount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const newAmount = Math.max(0, waterMl + amount);
    setWaterMl(newAmount);
    await saveDailyWater(selectedDateKey, newAmount);
  };

  const handleDeleteMeal = (meal: MealLog) => {
    Alert.alert('Delete Meal', `Remove "${meal.title}" from this day's log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          await deleteMealLog(meal.id);
          setMeals((prev) => prev.filter((m) => m.id !== meal.id));
        },
      },
    ]);
  };

  // Open full-page logging screen for a specific meal category
  const openLogChoice = (type: MealType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActiveMealType(type);
    setShowLogModal(true);
  };

  const selectedDateObj = new Date(selectedDateKey + 'T12:00:00');
  const isSelectedToday = selectedDateKey === todayKey;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            { flex: 1 },
            {
              transform: [{ translateX: pageSlideAnim }],
              opacity: pageOpacityAnim,
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            {/* Page Title & Options (Inside ScrollView so it scrolls and crops off naturally) */}
            <View style={styles.scrollHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pageTitle, { color: colors.text }]}>Calorie Tracker</Text>
                <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
                  {isSelectedToday
                    ? `Today • ${selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
                    : selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>

              {/* Adjust Goals / Macro Customizer button */}
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowCustomizerModal(true);
                }}
              >
                <Ionicons name="options-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <CalorieChallenges compact />

            {/* Caloric Energy Balance: Entire box is progress bar + connected bottom notch with interactive day circles */}
            {(() => {
              const remainingCals = Math.max(0, targets.dailyCalories - totalCaloriesConsumed);
              const barFillColor = colors.primary;

              return (
                <View style={styles.calorieCardWithNotchWrapper}>
                  {/* The Main Calorie Box */}
                  <View
                    style={[
                      styles.calorieHeroBox,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {/* When over goal, base green occupies (targets.dailyCalories / totalCaloriesConsumed)%, and darker green occupies (excess / totalCaloriesConsumed)% */}
                    {isOverGoal ? (
                      <>
                        {/* Base Goal Portion (Normal Green) */}
                        <View
                          style={[
                            styles.calorieBoxFill,
                            {
                              width: `${Math.round((targets.dailyCalories / totalCaloriesConsumed) * 100)}%`,
                              backgroundColor: barFillColor,
                              opacity: isDark ? 0.75 : 0.65,
                              borderTopRightRadius: 0,
                              borderBottomRightRadius: 0,
                            },
                          ]}
                        />
                        {/* Over-Goal Margin Portion (Darker Green) */}
                        <View
                          style={[
                            styles.calorieBoxFill,
                            {
                              left: `${Math.round((targets.dailyCalories / totalCaloriesConsumed) * 100)}%`,
                              width: `${Math.round((excessCalories / totalCaloriesConsumed) * 100)}%`,
                              backgroundColor: isDark ? '#365314' : '#14532d', // darker shade of green
                              opacity: 0.95,
                              borderTopLeftRadius: 0,
                              borderBottomLeftRadius: 0,
                              borderTopRightRadius: 17,
                              borderBottomRightRadius: 17,
                            },
                          ]}
                        />
                      </>
                    ) : (
                      /* Normal under-or-at goal fill */
                      <View
                        style={[
                          styles.calorieBoxFill,
                          {
                            width: `${calorieBasePercent}%`,
                            backgroundColor: barFillColor,
                            opacity: isDark ? 0.75 : 0.65,
                            borderTopRightRadius: calorieBasePercent >= 100 ? 17 : 0,
                            borderBottomRightRadius: calorieBasePercent >= 100 ? 17 : 0,
                          },
                        ]}
                      />
                    )}

                    {/* Foreground content: Consumed / Target on Left, Remaining Cals on Right */}
                    <View style={styles.calorieBoxContent}>
                      <View style={styles.calorieBoxLeft}>
                        <Text style={[styles.calorieBoxLabel, { color: isDark ? '#ffffff' : '#0f172a' }]}>
                          Calories
                        </Text>
                        <Text style={[styles.calorieBoxAmount, { color: isDark ? '#ffffff' : '#0f172a' }]}>
                          {totalCaloriesConsumed}
                          <Text
                            style={[
                              styles.calorieBoxTarget,
                              { color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.65)' },
                            ]}
                          >
                            {' '}/ {targets.dailyCalories} kcal
                          </Text>
                        </Text>
                      </View>

                      <View style={styles.calorieBoxRight}>
                        <Text style={[styles.calorieBoxRemainingVal, { color: isDark ? '#ffffff' : '#0f172a' }]}>
                          {remainingCals}
                        </Text>
                        <Text
                          style={[
                            styles.calorieBoxRemainingLabel,
                            { color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.65)' },
                          ]}
                        >
                          kcal remaining
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* CONNECTED NOTCH COMING DOWN FROM THE CALORIE BAR (FITS FULL WIDTH WITH WEEK ARROWS) */}
                  <View
                    style={[
                      styles.connectedDayNotch,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {/* Previous Week Chevron Button */}
                    <TouchableOpacity
                      style={styles.weekArrowBtn}
                      activeOpacity={0.7}
                      onPress={() => shiftWeek(-1)}
                      accessibilityLabel="Previous week"
                    >
                      <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {/* 7 Days of the Week */}
                    <View style={styles.notchDaysRow}>
                      {dateStrip.map((item) => {
                        const isSelected = item.key === selectedDateKey;
                        const dayMeta = dailyTotalsMap[item.key];
                        const isGoalMet = dayMeta?.metGoal;

                        return (
                          <TouchableOpacity
                            key={item.key}
                            style={styles.dayNotchItem}
                            activeOpacity={0.7}
                            onPress={() => {
                              if (item.key !== selectedDateKey) {
                                const dir = item.key > selectedDateKey ? 'left' : 'right';
                                switchDayWithAnimation(item.key, dir);
                              }
                            }}
                          >
                            <Text
                              style={[
                                styles.dayNotchLabel,
                                { color: isSelected ? colors.primary : colors.textMuted },
                              ]}
                            >
                              {item.dayLabel}
                            </Text>

                            {/* Interactive Slim Day Circle with distinct representation for Goal Met */}
                            <View
                              style={[
                                styles.dayCircle,
                                {
                                  backgroundColor: isSelected
                                    ? colors.primary
                                    : isGoalMet
                                    ? `${colors.primary}25`
                                    : colors.surfaceSecondary,
                                  borderColor: isSelected
                                    ? colors.primary
                                    : isGoalMet
                                    ? colors.primary
                                    : colors.border,
                                },
                                isSelected && styles.dayCircleSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dayCircleText,
                                  {
                                    color: isSelected
                                      ? '#09090b'
                                      : isGoalMet
                                      ? colors.primary
                                      : colors.textSecondary,
                                    fontWeight: isSelected || isGoalMet ? '800' : '600',
                                  },
                                ]}
                              >
                                {item.dateNum}
                              </Text>

                              {/* Goal Met Distinct Indicator Pip */}
                              {isGoalMet && (
                                <View
                                  style={[
                                    styles.goalMetCheckPip,
                                    {
                                      backgroundColor: isSelected ? '#09090b' : colors.primary,
                                    },
                                  ]}
                                />
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Next Week Chevron Button (Disabled if already in current week) */}
                    <TouchableOpacity
                      style={[styles.weekArrowBtn, weekOffset >= 0 && styles.weekArrowBtnDisabled]}
                      activeOpacity={0.7}
                      disabled={weekOffset >= 0}
                      onPress={() => shiftWeek(1)}
                      accessibilityLabel="Next week"
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={weekOffset >= 0 ? colors.textMuted + '40' : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}

            {/* CONCENTRIC THREE MACRO CIRCLES ON LEFT + STATS IN ROWS ON RIGHT */}
            {(() => {
              // Uncapped raw percentages so over-the-goal amounts display e.g. 115%
              const rawProtPct = Math.round((totalProteinConsumed / (targets.proteinGrams || 1)) * 100);
              const rawCarbPct = Math.round((totalCarbsConsumed / (targets.carbsGrams || 1)) * 100);
              const rawFatPct = Math.round((totalFatConsumed / (targets.fatGrams || 1)) * 100);

              // Standard arc clamp 0..100 for the base gradient circle
              const baseProtPct = Math.min(100, rawProtPct);
              const baseCarbPct = Math.min(100, rawCarbPct);
              const baseFatPct = Math.min(100, rawFatPct);

              // Over-100% margin percentages that get rendered in darker contrasting color
              const excessProtPct = rawProtPct > 100 ? Math.min(100, rawProtPct - 100) : 0;
              const excessCarbPct = rawCarbPct > 100 ? Math.min(100, rawCarbPct - 100) : 0;
              const excessFatPct = rawFatPct > 100 ? Math.min(100, rawFatPct - 100) : 0;

              // Theme-aware accessible high-contrast base colors
              const proteinBase = isDark ? '#38bdf8' : '#0284c7';
              const carbsBase = isDark ? '#a3e635' : '#16a34a';
              const fatBase = isDark ? '#f59e0b' : '#d97706';

              // Darker tone for margin going over 100%
              const proteinDarker = isDark ? '#0369a1' : '#075985';
              const carbsDarker = isDark ? '#4d7c0f' : '#15803d';
              const fatDarker = isDark ? '#b45309' : '#92400e';

              const trackBgColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';

              const svgSize = 108;
              const center = svgSize / 2; // 54
              const strokeWidth = 12.5; // Thick, bold rings
              const gap = 2;

              // Contracted overall radius with a compact, tight inner center hole
              const rProt = 46.5; // Outer ring
              const rCarb = rProt - strokeWidth - gap; // 32
              const rFat = rCarb - strokeWidth - gap; // 17.5

              const circProt = 2 * Math.PI * rProt;
              const circCarb = 2 * Math.PI * rCarb;
              const circFat = 2 * Math.PI * rFat;

              const offsetProt = circProt - (baseProtPct / 100) * circProt;
              const offsetCarb = circCarb - (baseCarbPct / 100) * circCarb;
              const offsetFat = circFat - (baseFatPct / 100) * circFat;

              const offsetExcessProt = circProt - (excessProtPct / 100) * circProt;
              const offsetExcessCarb = circCarb - (excessCarbPct / 100) * circCarb;
              const offsetExcessFat = circFat - (excessFatPct / 100) * circFat;

              return (
                <View style={[styles.macrosCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <View style={styles.macrosCardHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Macros</Text>
                  </View>

                  {/* Layout: Concentric Rings on Left, Stats in Rows on Right */}
                  <View style={styles.concentricMacrosRow}>
                    {/* Left: Concentric 3 Thick Circles with Gradients & Over-100% Darker Margin */}
                    <View style={styles.concentricSvgWrap}>
                      <Svg width={svgSize} height={svgSize}>
                        <Defs>
                          {/* Smooth gradient along the protein ring */}
                          <LinearGradient id="proteinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor={isDark ? '#38bdf8' : '#38bdf8'} />
                            <Stop offset="100%" stopColor={isDark ? '#0284c7' : '#0369a1'} />
                          </LinearGradient>
                          {/* Smooth gradient along the carbs ring */}
                          <LinearGradient id="carbsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor={isDark ? '#bef264' : '#84cc16'} />
                            <Stop offset="100%" stopColor={isDark ? '#65a30d' : '#16a34a'} />
                          </LinearGradient>
                          {/* Smooth gradient along the fat ring */}
                          <LinearGradient id="fatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor={isDark ? '#fde047' : '#fbbf24'} />
                            <Stop offset="100%" stopColor={isDark ? '#d97706' : '#b45309'} />
                          </LinearGradient>
                        </Defs>

                        {/* Background Tracks */}
                        <Circle cx={center} cy={center} r={rProt} stroke={trackBgColor} strokeWidth={strokeWidth} fill="transparent" />
                        <Circle cx={center} cy={center} r={rCarb} stroke={trackBgColor} strokeWidth={strokeWidth} fill="transparent" />
                        <Circle cx={center} cy={center} r={rFat} stroke={trackBgColor} strokeWidth={strokeWidth} fill="transparent" />

                        {/* Outer: Protein Ring (Starts exactly at 12 o'clock / -90 deg) */}
                        {baseProtPct > 0 && (
                          <Circle
                            cx={center}
                            cy={center}
                            r={rProt}
                            stroke="url(#proteinGrad)"
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${(baseProtPct / 100) * circProt} ${circProt}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            fill="transparent"
                            transform={`rotate(-90 ${center} ${center})`}
                          />
                        )}

                        {/* Outer: Protein Darker Overlap Arc for Margin Over 100% */}
                        {excessProtPct > 0 && (
                          <Circle
                            cx={center}
                            cy={center}
                            r={rProt}
                            stroke={proteinDarker}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${(excessProtPct / 100) * circProt} ${circProt}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            fill="transparent"
                            transform={`rotate(-90 ${center} ${center})`}
                          />
                        )}

                        {/* Middle: Carbs Ring (Starts exactly at 12 o'clock / -90 deg synchronously) */}
                        {baseCarbPct > 0 && (
                          <Circle
                            cx={center}
                            cy={center}
                            r={rCarb}
                            stroke="url(#carbsGrad)"
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${(baseCarbPct / 100) * circCarb} ${circCarb}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            fill="transparent"
                            transform={`rotate(-90 ${center} ${center})`}
                          />
                        )}

                        {/* Middle: Carbs Darker Overlap Arc for Margin Over 100% */}
                        {excessCarbPct > 0 && (
                          <Circle
                            cx={center}
                            cy={center}
                            r={rCarb}
                            stroke={carbsDarker}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${(excessCarbPct / 100) * circCarb} ${circCarb}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            fill="transparent"
                            transform={`rotate(-90 ${center} ${center})`}
                          />
                        )}

                        {/* Inner: Fat Ring (Starts exactly at 12 o'clock / -90 deg) */}
                        {baseFatPct > 0 && (
                          <Circle
                            cx={center}
                            cy={center}
                            r={rFat}
                            stroke="url(#fatGrad)"
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${(baseFatPct / 100) * circFat} ${circFat}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            fill="transparent"
                            transform={`rotate(-90 ${center} ${center})`}
                          />
                        )}

                        {/* Inner: Fat Darker Overlap Arc for Margin Over 100% */}
                        {excessFatPct > 0 && (
                          <Circle
                            cx={center}
                            cy={center}
                            r={rFat}
                            stroke={fatDarker}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${(excessFatPct / 100) * circFat} ${circFat}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            fill="transparent"
                            transform={`rotate(-90 ${center} ${center})`}
                          />
                        )}
                      </Svg>
                    </View>

                    {/* Right: Stats Layed Out in Rows Over Each Other in a Single Line */}
                    <View style={styles.macroStatsColumn}>
                      {/* Protein Row */}
                      <View style={[styles.macroStatRow, { borderBottomColor: colors.border }]}>
                        <View style={styles.macroStatLeftRow}>
                          <View style={[styles.macroColorDot, { backgroundColor: proteinBase }]} />
                          <Text style={[styles.macroStatName, { color: colors.text }]}>Protein</Text>
                          <Text
                            style={[
                              styles.macroStatPct,
                              { color: rawProtPct > 100 ? proteinDarker : proteinBase },
                            ]}
                          >
                            {rawProtPct}%
                          </Text>
                        </View>
                        <View style={styles.macroStatValueCol}>
                          <Text style={styles.macroStatGramsSingleLine} numberOfLines={1}>
                            <Text style={[styles.macroStatGrams, { color: colors.text }]}>{totalProteinConsumed}g</Text>
                            <Text style={[styles.macroStatTarget, { color: colors.textMuted }]}> / {targets.proteinGrams}g</Text>
                          </Text>
                        </View>
                      </View>

                      {/* Carbs Row */}
                      <View style={[styles.macroStatRow, { borderBottomColor: colors.border }]}>
                        <View style={styles.macroStatLeftRow}>
                          <View style={[styles.macroColorDot, { backgroundColor: carbsBase }]} />
                          <Text style={[styles.macroStatName, { color: colors.text }]}>Carbs</Text>
                          <Text
                            style={[
                              styles.macroStatPct,
                              { color: rawCarbPct > 100 ? carbsDarker : carbsBase },
                            ]}
                          >
                            {rawCarbPct}%
                          </Text>
                        </View>
                        <View style={styles.macroStatValueCol}>
                          <Text style={styles.macroStatGramsSingleLine} numberOfLines={1}>
                            <Text style={[styles.macroStatGrams, { color: colors.text }]}>{totalCarbsConsumed}g</Text>
                            <Text style={[styles.macroStatTarget, { color: colors.textMuted }]}> / {targets.carbsGrams}g</Text>
                          </Text>
                        </View>
                      </View>

                      {/* Fat Row */}
                      <View style={[styles.macroStatRow, { borderBottomWidth: 0 }]}>
                        <View style={styles.macroStatLeftRow}>
                          <View style={[styles.macroColorDot, { backgroundColor: fatBase }]} />
                          <Text style={[styles.macroStatName, { color: colors.text }]}>Fat</Text>
                          <Text
                            style={[
                              styles.macroStatPct,
                              { color: rawFatPct > 100 ? fatDarker : fatBase },
                            ]}
                          >
                            {rawFatPct}%
                          </Text>
                        </View>
                        <View style={styles.macroStatValueCol}>
                          <Text style={styles.macroStatGramsSingleLine} numberOfLines={1}>
                            <Text style={[styles.macroStatGrams, { color: colors.text }]}>{totalFatConsumed}g</Text>
                            <Text style={[styles.macroStatTarget, { color: colors.textMuted }]}> / {targets.fatGrams}g</Text>
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })()}

        {/* HISTORY PILL BAR: Between Macros and Meals Today */}
        <TouchableOpacity
          style={[
            styles.historyPillBar,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
          activeOpacity={0.75}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setShowHistoryModal(true);
          }}
        >
          <View style={styles.historyPillLeft}>
            <Text style={[styles.historyPillTitle, { color: colors.text }]}>History</Text>
          </View>

          <View style={styles.historyPillCenter}>
            <Text style={[styles.historyPillProjection, { color: colors.text }]} numberOfLines={1}>
              {historyPillStats.projectedWeightStr}
            </Text>
          </View>

          <View style={styles.historyPillRight}>
            {historyPillStats.hasPrevData && (
              <View
                style={[
                  styles.historyTrendBadge,
                  {
                    backgroundColor: historyPillStats.isUp
                      ? 'rgba(239,68,68,0.15)'
                      : 'rgba(34,197,94,0.15)',
                  },
                ]}
              >
                <Ionicons
                  name={historyPillStats.isUp ? 'arrow-up' : 'arrow-down'}
                  size={11}
                  color={historyPillStats.isUp ? '#ef4444' : '#22c55e'}
                />
                <Text
                  style={[
                    styles.historyTrendText,
                    { color: historyPillStats.isUp ? '#ef4444' : '#22c55e' },
                  ]}
                >
                  {Math.abs(historyPillStats.pctDiff)}%
                </Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* VERTICAL MEAL CATEGORIES: Breakfast, Lunch, Dinner, Snack */}
        <View style={styles.mealsVerticalSection}>
          <View style={styles.mealsHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Meals Today</Text>
            <Text style={[styles.mealCountBadge, { color: colors.textMuted }]}>
              {meals.length} {meals.length === 1 ? 'item' : 'items'} logged
            </Text>
          </View>

          {MEAL_CATEGORIES.map((cat) => {
            const catMeals = meals.filter((m) => m.mealType === cat.type);
            const catCalories = catMeals.reduce((sum, m) => sum + m.calories, 0);

            return (
              <View
                key={cat.type}
                style={[styles.mealCategoryCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              >
                {/* Category Header Row */}
                <View style={styles.categoryHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                    <View style={[styles.categoryIconWrap, { backgroundColor: `${cat.color}20` }]}>
                      <Ionicons name={cat.icon} size={20} color={cat.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <Text style={[styles.categoryTitle, { color: colors.text }]}>{cat.label}</Text>
                        {catCalories > 0 && (
                          <Text style={{ fontSize: 12, fontWeight: '700', color: cat.color }}>
                            {catCalories} kcal
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.categorySub, { color: catMeals.length > 0 ? colors.text : colors.textMuted }]} numberOfLines={2}>
                        {catMeals.length > 0
                          ? catMeals.map((m) => m.title).join(', ')
                          : 'No foods logged yet'}
                      </Text>
                    </View>
                  </View>

                  {/* Vertical Meal Card Click to Log */}
                  <TouchableOpacity
                    style={[styles.logMealBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                    onPress={() => openLogChoice(cat.type)}
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={[styles.logMealBtnText, { color: colors.primary }]}>Log</Text>
                  </TouchableOpacity>
                </View>

                {/* Logged items in this category */}
                {catMeals.length > 0 && (
                  <View style={[styles.categoryItemsList, { borderTopColor: colors.border }]}>
                    {catMeals.map((meal) => (
                      <View key={meal.id} style={styles.loggedItemRow}>
                        {meal.imageUri ? (
                          <Image source={{ uri: meal.imageUri }} style={styles.itemThumb} />
                        ) : (
                          <View style={[styles.itemIconPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
                            <Ionicons name="restaurant" size={16} color={cat.color} />
                          </View>
                        )}

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.loggedItemName, { color: colors.text }]} numberOfLines={1}>
                              {meal.title}
                            </Text>
                          </View>
                          <Text style={[styles.loggedItemMacros, { color: colors.textMuted }]}>
                            P: {meal.proteinG}g · C: {meal.carbsG}g · F: {meal.fatG}g
                          </Text>
                        </View>

                        <Text style={[styles.loggedItemCals, { color: colors.text }]}>{meal.calories} kcal</Text>

                        <TouchableOpacity onPress={() => handleDeleteMeal(meal)} style={styles.deleteBtn}>
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Hydration Tracker Card */}
        <View style={[styles.waterCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={styles.waterHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="water" size={22} color="#38bdf8" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Water Intake</Text>
            </View>
            <Text style={[styles.waterMetric, { color: '#38bdf8' }]}>
              {waterMl} <Text style={{ fontSize: 13, color: colors.textMuted }}>/ {targets.waterGoalMl} ml</Text>
            </Text>
          </View>

          {/* Quick Add Water Buttons */}
          <View style={styles.waterActionRow}>
            {[
              { ml: 250, label: '+250ml' },
              { ml: 500, label: '+500ml' },
              { ml: 750, label: '+750ml' },
            ].map((btn) => (
              <TouchableOpacity
                key={btn.label}
                style={[styles.waterBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                onPress={() => handleAddWater(btn.ml)}
              >
                <Ionicons name="add" size={16} color="#38bdf8" />
                <Text style={[styles.waterBtnText, { color: colors.text }]}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  </View>

      {/* Full-Page Food Logging Screen (Half Photo + Describe to AI + Search Recipes) */}
      <FoodLoggingModal
        visible={showLogModal}
        initialMealType={activeMealType}
        onClose={() => setShowLogModal(false)}
        onMealSaved={(newMeal) => {
          setMeals((prev) => [newMeal, ...prev]);
        }}
      />

      {/* Quiz Modal */}
      <MacroGoalQuizModal
        visible={showQuizModal}
        initialAnswers={savedQuiz}
        onClose={() => setShowQuizModal(false)}
        onSaved={(newTargets) => setTargets(newTargets)}
      />

      {/* Macro Ratio Customizer Modal (Sliders, Nodes & Presets) */}
      <MacroCustomizerModal
        visible={showCustomizerModal}
        targets={targets}
        onClose={() => setShowCustomizerModal(false)}
        onSaved={(newTargets) => setTargets(newTargets)}
      />

      {/* History & Stacked Weekly Meal Charts Modal */}
      <NutritionHistoryModal
        visible={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        allMeals={allMealsHistory}
        targets={targets}
        currentWeightKg={historyPillStats.weightKg}
        isUS={historyPillStats.isUS}
        tdee={historyPillStats.tdee}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: 4,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '700',
    fontFamily: SERIF_FONT,
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 12,
  },
  aiScanBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#09090b',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  calorieCardWithNotchWrapper: {
    alignItems: 'center',
    width: '100%',
  },
  calorieHeroBox: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    minHeight: 62,
    width: '100%',
    zIndex: 2,
  },
  calorieBoxFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderTopLeftRadius: 17,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  calorieExcessOverlay: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    right: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    overflow: 'hidden',
  },
  calorieExcessStripe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
  },
  excessTextBadge: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  connectedDayNotch: {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 3,
    paddingBottom: 4,
    width: '100%',
    alignSelf: 'stretch',
    zIndex: 1,
  },
  weekArrowBtn: {
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  weekArrowBtnDisabled: {
    opacity: 0.35,
  },
  notchDaysRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 2,
  },
  dayNotchItem: {
    alignItems: 'center',
    paddingVertical: 0,
    paddingHorizontal: 2,
    gap: 1,
  },
  dayNotchLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: -1,
  },
  dayCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayCircleSelected: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  dayCircleText: {
    fontSize: 9.5,
    letterSpacing: -0.2,
  },
  goalMetCheckPip: {
    position: 'absolute',
    bottom: -2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  calorieBoxContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    zIndex: 1,
  },
  calorieBoxLeft: {
    gap: 3,
  },
  calorieBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  calorieBoxAmount: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
    letterSpacing: -0.5,
  },
  calorieBoxTarget: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: undefined,
  },
  calorieBoxRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  calorieBoxRemainingVal: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
    letterSpacing: -0.5,
  },
  calorieBoxRemainingLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  macrosCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  macrosCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
  },
  editTargetsLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  macroDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  macroRatioSub: {
    fontSize: 12,
    marginTop: 2,
  },
  adjustBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  concentricMacrosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 0,
  },
  concentricSvgWrap: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroStatsColumn: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  macroStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  macroStatLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroColorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  macroStatName: {
    fontSize: 13,
    fontWeight: '800',
  },
  macroStatPct: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 2,
  },
  macroStatValueCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  macroStatGramsSingleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  macroStatGrams: {
    fontSize: 14,
    fontWeight: '800',
  },
  macroStatTarget: {
    fontSize: 12,
    fontWeight: '500',
  },
  macroPillGrams: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  mealsVerticalSection: {
    gap: 12,
  },
  mealsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  mealCountBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  mealCategoryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
  },
  categorySub: {
    fontSize: 12,
    marginTop: 2,
  },
  logMealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  logMealBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryItemsList: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  loggedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemThumb: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  itemIconPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loggedItemName: {
    fontSize: 14,
    fontWeight: '700',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  aiBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  loggedItemMacros: {
    fontSize: 11,
    marginTop: 2,
  },
  loggedItemCals: {
    fontSize: 13,
    fontWeight: '800',
  },
  deleteBtn: {
    padding: 6,
  },
  waterCard: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  waterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waterMetric: {
    fontSize: 16,
    fontWeight: '800',
  },
  waterActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  waterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  waterBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  choiceSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  choiceSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  choiceSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
  },
  choiceSheetSub: {
    fontSize: 13,
    marginTop: 2,
  },
  closeChoiceBtn: {
    padding: 6,
  },
  choiceOptionsList: {
    gap: 12,
  },
  choiceOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  choiceOptionIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOptionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  choiceOptionDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  // History Pill Bar Styles
  historyPillBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 16,
    gap: 8,
  },
  historyPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyPillTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  historyPillCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  historyPillProjection: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  historyPillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyTrendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 2,
  },
  historyTrendText: {
    fontSize: 11,
    fontWeight: '800',
  },
});

