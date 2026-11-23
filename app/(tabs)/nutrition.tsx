import { TutorialAnchor, TutorialButton, TutorialScrollView, useTutorialTargetId } from '@/components/FirstRunTutorial';
import { AppModal as Modal } from '@/components/AppModal';
import { NutritionPet } from '@/components/NutritionPet';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
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
  Dimensions,
  Animated,
  AppState,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useTheme, BRAND_ROUNDED_FONT_EXTRA, BRAND_ROUNDED_FONT } from '@/constants/ThemeContext';
import {
  MEAL_LOGS_CHANGED,
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
import { WaterLoggingModal } from '@/components/WaterLoggingModal';
import { useAuth } from '@/constants/AuthContext';

const MEAL_CATEGORIES: { type: MealType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; desc: string }[] = [
  { type: 'breakfast', label: 'Breakfast', icon: 'sunny', color: '#f59e0b', desc: 'Kickstart your energy' },
  { type: 'lunch', label: 'Lunch', icon: 'restaurant', color: '#38bdf8', desc: 'Midday fuel' },
  { type: 'dinner', label: 'Dinner', icon: 'moon', color: '#a855f7', desc: 'Evening recovery' },
  { type: 'snack', label: 'Snacks', icon: 'cafe', color: '#10b981', desc: 'Bites & drinks' },
];

export default function NutritionScreen() {
  const themeContext = useTheme();
  const colors = themeContext?.colors;
  const isDark = themeContext?.isDark ?? colors?.isDark ?? true;
  const { profile, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'tracker' | 'pet'>('tracker');
  const reminderParams=useLocalSearchParams<{section?:string;reminder?:string}>();
  useEffect(()=>{
    if(!reminderParams.reminder)return;
    if(reminderParams.section==='pet')setActiveTab('pet');
    else if(reminderParams.section==='tracker')setActiveTab('tracker');
  },[reminderParams.section,reminderParams.reminder]);
  const tutorialTarget = useTutorialTargetId();
  useEffect(() => {
    if (tutorialTarget === 'pet-care') setActiveTab('pet');
    else if (tutorialTarget === 'nutrition' || tutorialTarget === 'calorie-overview' || tutorialTarget === 'meal-logging') setActiveTab('tracker');
  }, [tutorialTarget]);
  const [screenActive, setScreenActive] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [nutritionReady, setNutritionReady] = useState(false);
  const [nutritionError, setNutritionError] = useState('');
  const dataRequest = useRef(0);
  const mainScroll = useRef<React.ElementRef<typeof ScrollView>>(null);

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
  const [showWaterModal, setShowWaterModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [activeMealType, setActiveMealType] = useState<MealType>('breakfast');

  const [todayKey, setTodayKey] = useState(getTodayDateKey);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [dailyTotalsMap, setDailyTotalsMap] = useState<Record<string, { cals: number; metGoal: boolean }>>({});

  // Horizontal scroll ref for the scrollable date strip
  const dateScrollRef = useRef<any>(null);

  // Generate extended 28-day scrollable historical date list ending on today
  const scrollableDaysList = React.useMemo(() => {
    const list: { key: string; dayLabel: string; dateNum: number; isToday: boolean; fullDate: Date }[] = [];
    const baseAnchor = new Date(todayKey + 'T12:00:00');

    const getShortDayLabel = (date: Date) => {
      const day = date.getDay();
      switch (day) {
        case 0: return 'Su';
        case 1: return 'Mo';
        case 2: return 'Tu';
        case 3: return 'We';
        case 4: return 'Th';
        case 5: return 'Fr';
        case 6: return 'Sa';
        default: return '';
      }
    };

    // 27 days in past up to today (28 total days)
    for (let offset = -27; offset <= 0; offset++) {
      const d = new Date(baseAnchor);
      d.setDate(d.getDate() + offset);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      list.push({
        key,
        dayLabel: getShortDayLabel(d),
        dateNum: d.getDate(),
        isToday: key === todayKey,
        fullDate: d,
      });
    }
    return list;
  }, [todayKey]);

  // Compute stats for History Pill
  const historyPillStats = React.useMemo(() => {
    const curEnd = new Date(todayKey + 'T12:00:00');
    const curStart = new Date(curEnd);
    curStart.setDate(curStart.getDate() - 6);

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

    let pctDiff = 0;
    let hasPrevData = prevDailyAvg > 0;
    if (hasPrevData && curDailyAvg > 0) {
      pctDiff = Math.round(((curDailyAvg - prevDailyAvg) / prevDailyAvg) * 100);
    }

    // Days target met percentage across recorded days in the history window
    let daysTargetMetPct = 64; // baseline fallback
    if (targets?.dailyCalories > 0 && curDaysSeen.size > 0) {
      let metCount = 0;
      curDaysSeen.forEach((dKey) => {
        let dayCal = 0;
        allMealsHistory.forEach((m) => {
          if (m.dateKey === dKey) dayCal += m.calories;
        });
        if (dayCal >= targets.dailyCalories * 0.85) metCount++;
      });
      daysTargetMetPct = Math.round((metCount / curDaysSeen.size) * 100);
    }

    const effectiveConsumed = curDailyAvg > 0 ? curDailyAvg : meals.reduce((a, b) => a + b.calories, 0);

    const weightKg = profile?.weightKg || 70;
    const heightCm = profile?.heightCm || 175;
    const age = profile?.age || 28;
    const isMale = !profile?.gender?.toLowerCase().includes('fe');
    const isUS = profile?.unitSystem !== 'metric';

    const bmr = isMale
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    const tdee = Math.round(bmr * 1.4);

    const activeCals = effectiveConsumed > 0 ? effectiveConsumed : tdee;
    const calDiff = activeCals - tdee;
    const monthlyLbs = (calDiff * 30) / 3500;
    const monthlyKg = monthlyLbs / 2.20462;
    const currentLbs = weightKg * 2.20462;
    const projectedWeightLbs = Math.max(50, Math.round(currentLbs + monthlyLbs));
    const projectedWeightKg = Math.max(25, Math.round(weightKg + monthlyKg));

    const absMonthlyLbs = Math.abs(monthlyLbs).toFixed(1);
    const absMonthlyKg = Math.abs(monthlyKg).toFixed(1);
    const isGain = monthlyLbs > 0.15;
    const isLoss = monthlyLbs < -0.15;
    const paceStr = isGain
      ? `+${isUS ? absMonthlyLbs + ' lbs in a mo' : absMonthlyKg + ' kg in a mo'}`
      : isLoss
      ? `-${isUS ? absMonthlyLbs + ' lbs in a mo' : absMonthlyKg + ' kg in a mo'}`
      : 'Maintain weight';

    return {
      curDailyAvg,
      prevDailyAvg,
      pctDiff,
      hasPrevData,
      isUp: pctDiff > 0,
      tdee,
      projectedWeightStr: paceStr,
      paceStr,
      weightKg,
      isUS,
      daysTargetMetPct,
    };
  }, [allMealsHistory, meals, profile, todayKey, targets]);

  const loadAllNutritionData = useCallback(
    async (targetKey = selectedDateKey) => {
      const request = ++dataRequest.current;
      try {
        const [loadedTargets, loadedMeals, loadedWater, loadedQuiz, allMealsRaw] = await Promise.all([
          loadNutritionTargets(),
          loadMealLogs(targetKey),
          loadDailyWater(targetKey),
          loadSavedQuiz(),
          loadMealLogs(),
        ]);
        if (request !== dataRequest.current) return;
        setNutritionReady(true);
        setNutritionError('');
        setTargets(loadedTargets);
        setMeals(loadedMeals);
        setAllMealsHistory(allMealsRaw);
        setWaterMl(loadedWater);
        setSavedQuiz(loadedQuiz);

        const totals: Record<string, { cals: number; metGoal: boolean }> = {};
        allMealsRaw.forEach((m) => {
          if (!totals[m.dateKey]) totals[m.dateKey] = { cals: 0, metGoal: false };
          totals[m.dateKey].cals += m.calories;
        });
        Object.keys(totals).forEach((k) => {
          totals[k].metGoal = totals[k].cals >= loadedTargets.dailyCalories * 0.9;
        });
        setDailyTotalsMap(totals);
      } catch (e) {
        if (request !== dataRequest.current) return;
        setNutritionError('Your diary could not load. Please try again.');
        setNutritionReady(false);
        console.error('Error loading nutrition data:', e);
      }
    },
    [selectedDateKey]
  );

  useFocusEffect(useCallback(() => {
    setScreenActive(true);
    setForeground(AppState.currentState === 'active');
    const refreshDay = () => {
      const next = getTodayDateKey();
      if (next !== todayKey) {
        setTodayKey(next);
        setSelectedDateKey(previous => previous === todayKey ? next : previous);
      }
    };
    refreshDay();
    void loadAllNutritionData(selectedDateKey);
    const mealsChanged = DeviceEventEmitter.addListener(MEAL_LOGS_CHANGED, () => { void loadAllNutritionData(selectedDateKey); });
    const appState = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state === 'active') { refreshDay(); void loadAllNutritionData(selectedDateKey); }
    });
    const timer = setInterval(refreshDay, 30000);
    return () => { setScreenActive(false); dataRequest.current++; mealsChanged.remove(); appState.remove(); clearInterval(timer); };
  }, [loadAllNutritionData, selectedDateKey, todayKey]));

  const handleSelectDate = (newKey: string) => {
    if (newKey === selectedDateKey) return;
    Haptics.selectionAsync().catch(() => {});
    setSelectedDateKey(newKey);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllNutritionData(selectedDateKey);
    setRefreshing(false);
  };

  // Metrics
  const totalCaloriesConsumed = meals.reduce((acc, m) => acc + m.calories, 0);
  const totalProteinConsumed = Math.round(meals.reduce((acc, m) => acc + m.proteinG, 0));
  const totalCarbsConsumed = Math.round(meals.reduce((acc, m) => acc + m.carbsG, 0));
  const totalFatConsumed = Math.round(meals.reduce((acc, m) => acc + m.fatG, 0));

  const remainingCalories = Math.max(0, targets.dailyCalories - totalCaloriesConsumed);
  const rawCaloriePercent = Math.round((totalCaloriesConsumed / (targets.dailyCalories || 1)) * 100);
  const caloriePercent = Math.min(100, rawCaloriePercent);
  const isOverGoal = totalCaloriesConsumed > targets.dailyCalories;
  const excessCalories = isOverGoal ? totalCaloriesConsumed - targets.dailyCalories : 0;
  const calorieBasePercent = caloriePercent;

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
          await loadAllNutritionData(selectedDateKey);
        },
      },
    ]);
  };

  const openLogChoice = (type: MealType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActiveMealType(type);
    setShowLogModal(true);
  };

  const selectedDateObj = new Date(selectedDateKey + 'T12:00:00');
  const isSelectedToday = selectedDateKey === todayKey;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <TutorialScrollView
        ref={mainScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header: Title + Subtitle + Pet Pill + Customizer Button */}
        <View style={styles.scrollHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.text }]}>Calorie Tracker</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
              {activeTab === 'pet' ? "Today's companion" : isSelectedToday
                ? `Today • ${selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
                : selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TutorialButton
              tutorialId="nutrition-pet"
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === 'pet' }}
              accessibilityLabel="Toggle Pet Companion"
              onPress={() => {
                setActiveTab((prev) => (prev === 'pet' ? 'tracker' : 'pet'));
                mainScroll.current?.scrollTo({ y: 0, animated: false });
                Haptics.selectionAsync().catch(() => {});
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 44,
                paddingHorizontal: 15,
                borderRadius: 22,
                backgroundColor: activeTab === 'pet' ? colors.primary : colors.surfaceElevated,
              }}
            >
              <Ionicons
                name="paw"
                size={17}
                color={activeTab === 'pet' ? (isDark ? '#09090b' : '#ffffff') : colors.primary}
              />
              <Text
                style={{
                  fontFamily: BRAND_ROUNDED_FONT_EXTRA,
                  fontSize: 13.5,
                  color: activeTab === 'pet' ? (isDark ? '#09090b' : '#ffffff') : colors.primary,
                }}
              >
                Pet
              </Text>
            </TutorialButton>

            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.surfaceElevated }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setShowCustomizerModal(true);
              }}
            >
              <Ionicons name="options-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ gap: 14, display: activeTab === 'tracker' ? 'flex' : 'none' }}>
        {/* INTEGRATED DATE SELECTOR BAR: Isolated directly on the background (no bubble container around row) */}
        <View style={styles.dateBarRow}>
          <ScrollView
            ref={dateScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateScrollInner}
            onScrollBeginDrag={() => {
              Haptics.selectionAsync().catch(() => {});
            }}
            onScroll={() => {
              // Light tick during scroll every few items
              const now = Date.now();
              if (!(dateScrollRef as any).lastHaptic || now - (dateScrollRef as any).lastHaptic > 140) {
                (dateScrollRef as any).lastHaptic = now;
                Haptics.selectionAsync().catch(() => {});
              }
            }}
            scrollEventThrottle={16}
            onContentSizeChange={() => {
              dateScrollRef.current?.scrollToEnd({ animated: false });
            }}
          >
            {scrollableDaysList.map((item) => {
              const isSelected = item.key === selectedDateKey;
              const dayMeta = dailyTotalsMap[item.key];
              const consumedCals = dayMeta?.cals || 0;
              const targetCals = targets.dailyCalories || 2000;
              const calPercent = Math.min(100, Math.round((consumedCals / targetCals) * 100));

              // Ring dimensions
              const ringSize = 36;
              const ringStroke = 3;
              const ringRadius = (ringSize - ringStroke) / 2;
              const ringCircumference = 2 * Math.PI * ringRadius;
              const strokeDashoffset = ringCircumference - (calPercent / 100) * ringCircumference;

              return (
                <TouchableOpacity
                  key={item.key}
                  style={styles.datePillBtn}
                  activeOpacity={0.7}
                  onPress={() => handleSelectDate(item.key)}
                >
                  <Text
                    style={[
                      styles.datePillDayLabel,
                      {
                        color: isSelected ? colors.primary : colors.textMuted,
                        fontWeight: isSelected ? '800' : '600',
                      },
                    ]}
                  >
                    {item.dayLabel}
                  </Text>

                  {/* Circular Calorie Completion Ring around day number */}
                  <View style={styles.dateRingWrapper}>
                    <Svg width={ringSize} height={ringSize} style={styles.dateRingSvg}>
                      {/* Track */}
                      <Circle
                        cx={ringSize / 2}
                        cy={ringSize / 2}
                        r={ringRadius}
                        stroke={isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
                        strokeWidth={ringStroke}
                        fill="transparent"
                      />
                      {/* Progress */}
                      {calPercent > 0 && (
                        <Circle
                          cx={ringSize / 2}
                          cy={ringSize / 2}
                          r={ringRadius}
                          stroke={isSelected ? colors.primary : (calPercent >= 90 ? '#10b981' : colors.primary)}
                          strokeWidth={ringStroke}
                          strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          fill="transparent"
                          transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                        />
                      )}
                    </Svg>

                    <Text
                      style={[
                        styles.dateCircleNum,
                        {
                          color: isSelected ? colors.primary : colors.text,
                          fontWeight: isSelected ? '800' : '600',
                        },
                      ]}
                    >
                      {item.dateNum}
                    </Text>
                  </View>

                  {/* Clean pip indicator below */}
                  <View
                    style={[
                      styles.dateGoalMetPip,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : calPercent >= 90
                          ? '#10b981'
                          : 'transparent',
                      },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Calorie summary and challenges in one card */}
        {(() => {
          const remainingCals = Math.max(0, targets.dailyCalories - totalCaloriesConsumed);
          const barFillColor = colors.primary;

          return (
            <TutorialAnchor tutorialId="calorie-overview"
              style={[
                styles.calorieHeroBoxStandalone,
                {
                  backgroundColor: colors.surfaceElevated,
                },
              ]}
            >
              <View style={{ position: 'relative', minHeight: 88, overflow: 'hidden' }}>
              {isOverGoal ? (
                <>
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
                  <View
                    style={[
                      styles.calorieBoxFill,
                      {
                        left: `${Math.round((targets.dailyCalories / totalCaloriesConsumed) * 100)}%`,
                        width: `${Math.round((excessCalories / totalCaloriesConsumed) * 100)}%`,
                        backgroundColor: isDark ? '#365314' : '#14532d',
                        opacity: 0.95,
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        borderTopRightRadius: 20,
                        borderBottomRightRadius: 0,
                      },
                    ]}
                  />
                </>
              ) : (
                <View
                  style={[
                    styles.calorieBoxFill,
                    {
                      width: `${calorieBasePercent}%`,
                      backgroundColor: barFillColor,
                      opacity: isDark ? 0.75 : 0.65,
                      borderTopRightRadius: calorieBasePercent >= 100 ? 20 : 0,
                      borderBottomRightRadius: 0,
                    },
                  ]}
                />
              )}

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
              <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <CalorieChallenges compact embedded />
              </View>
            </TutorialAnchor>
          );
        })()}

        {/* 3 DISCONNECTED INDIVIDUAL MACRO BUBBLES IN ONE ROW (CIRCLE WITH SYMBOL IN MIDDLE, STATS BELOW) */}
        {(() => {
          const rawProtPct = Math.round((totalProteinConsumed / (targets.proteinGrams || 1)) * 100);
          const rawCarbPct = Math.round((totalCarbsConsumed / (targets.carbsGrams || 1)) * 100);
          const rawFatPct = Math.round((totalFatConsumed / (targets.fatGrams || 1)) * 100);

          const baseProtPct = Math.min(100, rawProtPct);
          const baseCarbPct = Math.min(100, rawCarbPct);
          const baseFatPct = Math.min(100, rawFatPct);

          const excessProtPct = rawProtPct > 100 ? Math.min(100, rawProtPct - 100) : 0;
          const excessCarbPct = rawCarbPct > 100 ? Math.min(100, rawCarbPct - 100) : 0;
          const excessFatPct = rawFatPct > 100 ? Math.min(100, rawFatPct - 100) : 0;

          const proteinColor = isDark ? '#38bdf8' : '#0284c7';
          const carbsColor = isDark ? '#a3e635' : '#16a34a';
          const fatColor = isDark ? '#f59e0b' : '#d97706';

          const proteinDarker = isDark ? '#0369a1' : '#075985';
          const carbsDarker = isDark ? '#4d7c0f' : '#15803d';
          const fatDarker = isDark ? '#b45309' : '#92400e';

          const trackBgColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';

          const circleSize = 64;
          const strokeWidth = 5.5;
          const radius = (circleSize - strokeWidth) / 2;
          const circ = 2 * Math.PI * radius;
          const center = circleSize / 2;

          const macrosList = [
            {
              id: 'protein',
              name: 'Protein',
              icon: 'barbell' as const,
              current: totalProteinConsumed,
              target: targets.proteinGrams,
              pct: rawProtPct,
              basePct: baseProtPct,
              excessPct: excessProtPct,
              color: proteinColor,
              darkerColor: proteinDarker,
            },
            {
              id: 'carbs',
              name: 'Carbs',
              icon: 'flash' as const,
              current: totalCarbsConsumed,
              target: targets.carbsGrams,
              pct: rawCarbPct,
              basePct: baseCarbPct,
              excessPct: excessCarbPct,
              color: carbsColor,
              darkerColor: carbsDarker,
            },
            {
              id: 'fat',
              name: 'Fat',
              icon: 'flame' as const,
              current: totalFatConsumed,
              target: targets.fatGrams,
              pct: rawFatPct,
              basePct: baseFatPct,
              excessPct: excessFatPct,
              color: fatColor,
              darkerColor: fatDarker,
            },
          ];

          return (
            <View style={styles.macroDisconnectedBubblesRow}>
              {macrosList.map((m) => {
                const baseOffset = circ - (m.basePct / 100) * circ;
                const excessOffset = circ - (m.excessPct / 100) * circ;

                return (
                  <View
                    key={m.id}
                    style={[
                      styles.macroSingleBubbleCard,
                      { backgroundColor: colors.surfaceElevated },
                    ]}
                  >
                    {/* Top Row: Name on top left, Percentage on top right */}
                    <View style={styles.macroBubbleTopRow}>
                      <View style={styles.macroBubbleTopLeft}>
                        <Text style={[styles.macroBubbleName, { color: colors.text }]}>
                          {m.name}
                        </Text>
                        <Text style={[styles.macroBubbleGrams, { color: colors.text }]}>
                          {m.current}g
                          <Text style={[styles.macroBubbleTarget, { color: colors.textMuted }]}>
                            {' '}/ {m.target}g
                          </Text>
                        </Text>
                      </View>
                      <Text style={[styles.macroBubblePct, { color: m.color }]}>
                        {m.pct}%
                      </Text>
                    </View>

                    {/* Progress Circle with fat solid symbol in middle */}
                    <View style={styles.macroCircleContainer}>
                      <Svg width={circleSize} height={circleSize}>
                        <Circle
                          cx={center}
                          cy={center}
                          r={radius}
                          stroke={trackBgColor}
                          strokeWidth={strokeWidth}
                          fill="transparent"
                        />
                        {m.basePct > 0 && (
                          <Circle
                            cx={center}
                            cy={center}
                            r={radius}
                            stroke={m.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${circ} ${circ}`}
                            strokeDashoffset={baseOffset}
                            strokeLinecap="round"
                            fill="transparent"
                            transform={`rotate(-90 ${center} ${center})`}
                          />
                        )}
                        {m.excessPct > 0 && (
                          <Circle
                            cx={center}
                            cy={center}
                            r={radius}
                            stroke={m.darkerColor}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${circ} ${circ}`}
                            strokeDashoffset={excessOffset}
                            strokeLinecap="round"
                            fill="transparent"
                            transform={`rotate(-90 ${center} ${center})`}
                          />
                        )}
                      </Svg>

                      {/* Filled, thicker icon in the center */}
                      <View style={styles.macroSymbolInCircle}>
                        <Ionicons name={m.icon} size={23} color={m.color} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* HISTORY PILL BAR: Solid filled pill with triangle direction indicator and lbs/kg pace */}
        <TouchableOpacity
          style={[styles.historyPillBar, { backgroundColor: colors.surfaceElevated }]}
          activeOpacity={0.8}
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
            <View
              style={[
                styles.historyTrendBadge,
                {
                  backgroundColor: '#10b981',
                },
              ]}
            >
              <Text style={[styles.historyTrendText, { color: '#ffffff' }]}>
                {historyPillStats.daysTargetMetPct}% met
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* YOUR ESSENTIALS: Meals & Daily Hydration Progression */}
        <View style={styles.mealsVerticalSection}>
          <TutorialAnchor tutorialId="meal-logging" style={styles.mealsHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Essentials</Text>
            <Text style={[styles.mealCountBadge, { color: colors.textMuted }]}>
              {meals.length} {meals.length === 1 ? 'item' : 'items'} logged
            </Text>
          </TutorialAnchor>

          {/* Meal Category Cards (Clean modern typography) */}
          {MEAL_CATEGORIES.map((cat) => {
            const catMeals = meals.filter((m) => m.mealType === cat.type);
            const catCalories = catMeals.reduce((sum, m) => sum + m.calories, 0);
            const isLogged = catMeals.length > 0;

            return (
              <View key={cat.type} style={[styles.mealCategoryCard, { backgroundColor: colors.surfaceElevated }]}>
                <TouchableOpacity
                  style={styles.categoryHeader}
                  activeOpacity={0.8}
                  onPress={() => openLogChoice(cat.type)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 8 }}>
                    <View style={styles.categoryIconWrap}>
                      <Ionicons name={isLogged ? 'checkmark-circle' : cat.icon} size={22} color={cat.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <Text style={[styles.categoryTitle, { color: colors.text }]}>{cat.label}</Text>
                        {catCalories > 0 ? (
                          <Text style={[styles.categoryCalsBadge, { color: cat.color }]}>
                            {catCalories} kcal
                          </Text>
                        ) : null}
                      </View>
                      {isLogged ? (
                        <Text
                          style={[styles.categorySub, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {catMeals.map((m) => m.title).join(', ')}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={[styles.logMealBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                    <Ionicons name="add" size={15} color={colors.primary} />
                    <Text style={[styles.logMealBtnText, { color: colors.primary }]}>Log</Text>
                  </View>
                </TouchableOpacity>

                {catMeals.length > 0 && (
                  <View style={[styles.categoryItemsList, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                    {catMeals.map((meal) => (
                      <View key={meal.id} style={styles.loggedItemRow}>
                        {meal.imageUri ? (
                          <Image source={{ uri: meal.imageUri }} style={styles.itemThumb} />
                        ) : (
                          <View style={[styles.itemIconPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
                            <Ionicons name="restaurant" size={14} color={cat.color} />
                          </View>
                        )}

                        <View style={{ flex: 1 }}>
                          <Text style={[styles.loggedItemName, { color: colors.text }]} numberOfLines={1}>
                            {meal.title}
                          </Text>
                          <Text style={[styles.loggedItemMacros, { color: colors.textMuted }]}>
                            P: {meal.proteinG}g · C: {meal.carbsG}g · F: {meal.fatG}g
                          </Text>
                        </View>

                        <Text style={[styles.loggedItemCals, { color: colors.text }]}>{meal.calories} kcal</Text>

                        <TouchableOpacity onPress={() => handleDeleteMeal(meal)} style={styles.deleteBtn}>
                          <Ionicons name="trash-outline" size={15} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {/* Hydration Tracker Card */}
          <View style={[styles.waterCard, { backgroundColor: colors.surfaceElevated }]}>
            <View style={styles.waterHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.waterIconWrapBare}>
                  <Ionicons name="water" size={22} color="#38bdf8" />
                </View>
                <View>
                  <Text style={[styles.categoryTitle, { color: colors.text }]}>Daily Water</Text>
                  {waterMl > 0 ? (
                    <Text style={[styles.categorySub, { color: colors.textSecondary }]}>
                      {Math.round((waterMl / (targets.waterGoalMl || 2500)) * 100)}% of daily goal
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.waterMetric, { color: '#38bdf8' }]}>
                  {waterMl} <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textMuted }}>/ {targets.waterGoalMl} ml</Text>
                </Text>

                {/* Log Button on Daily Water Header (Exact same pill as other log buttons with blue text & icon) */}
                <TouchableOpacity
                  style={[styles.logMealBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowWaterModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={15} color="#38bdf8" />
                  <Text style={[styles.logMealBtnText, { color: '#38bdf8' }]}>Log</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Logging Action Row (+250ml, +500ml, +750ml) */}
            <View style={styles.waterActionRow}>
              {[
                { ml: 250, label: '+250ml' },
                { ml: 500, label: '+500ml' },
                { ml: 750, label: '+750ml' },
              ].map((btn) => (
                <TouchableOpacity
                  key={btn.label}
                  style={[styles.waterBtn, { backgroundColor: colors.surfaceSecondary }]}
                  onPress={() => handleAddWater(btn.ml)}
                >
                  <Ionicons name="add" size={15} color="#38bdf8" />
                  <Text style={[styles.waterBtnText, { color: colors.text }]}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>


        </View>
        </View>
        {activeTab === 'pet' && <NutritionPet userId={user?.id || 'guest'} meals={allMealsHistory} target={targets.dailyCalories} goal={savedQuiz?.goal || 'maintain'} todayKey={todayKey} ready={nutritionReady} error={nutritionError}
          active={screenActive && foreground && !showLogModal && !showQuizModal && !showCustomizerModal && !showWaterModal && !showHistoryModal}
          onLogMeal={() => { setSelectedDateKey(todayKey); const hour = new Date().getHours(); openLogChoice(hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 21 ? 'dinner' : 'snack'); }}
          onAdjustGoal={() => setShowQuizModal(true)} onRetry={() => { void loadAllNutritionData(selectedDateKey); }} />}
      </TutorialScrollView>

      {/* Full-Page Food Logging Screen */}
      <FoodLoggingModal
        visible={showLogModal}
        initialMealType={activeMealType}
        onClose={() => setShowLogModal(false)}
        onMealSaved={() => { void loadAllNutritionData(selectedDateKey); }}
      />

      {/* Quiz Modal with Notches */}
      <MacroGoalQuizModal
        visible={showQuizModal}
        initialAnswers={savedQuiz}
        onClose={() => setShowQuizModal(false)}
        onSaved={(newTargets) => { setTargets(newTargets); void loadAllNutritionData(selectedDateKey); }}
      />

      {/* Macro Ratio Customizer Modal */}
      <MacroCustomizerModal
        visible={showCustomizerModal}
        targets={targets}
        onClose={() => setShowCustomizerModal(false)}
        onSaved={(newTargets) => { setTargets(newTargets); void loadAllNutritionData(selectedDateKey); }}
      />

      {/* Water Container Grid Logging Modal */}
      <WaterLoggingModal
        visible={showWaterModal}
        currentWaterMl={waterMl}
        dailyGoalMl={targets.waterGoalMl}
        onClose={() => setShowWaterModal(false)}
        onAddWater={(amount) => handleAddWater(amount)}
      />

      {/* History & Trends Modal */}
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
  sectionTitle: { fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontSize: 18, fontWeight: '800' },
  scrollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 0,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  pageTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Scrollable Date Bar Row (isolated on background)
  dateBarRow: {
    paddingVertical: 4,
    marginHorizontal: -16,
    width: Dimensions.get('window').width,
  },
  dateScrollInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  datePillBtn: {
    alignItems: 'center',
    width: Math.floor((Dimensions.get('window').width - 32) / 7),
    paddingVertical: 2,
    gap: 4,
  },
  datePillDayLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
  },
  dateRingWrapper: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dateRingSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  dateCircleNum: {
    fontSize: 13,
    letterSpacing: -0.2,
  },
  dateGoalMetPip: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  calorieHeroBoxStandalone: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    minHeight: 88,
    width: '100%',
  },
  calorieBoxFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  calorieBoxContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    zIndex: 1,
  },
  calorieBoxLeft: {
    gap: 3,
  },
  calorieBoxLabel: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  calorieBoxAmount: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  calorieBoxTarget: {
    fontFamily: BRAND_ROUNDED_FONT,
    fontSize: 13,
    fontWeight: '600',
  },
  calorieBoxRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  calorieBoxRemainingVal: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  calorieBoxRemainingLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  macroDisconnectedBubblesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
  },
  macroSingleBubbleCard: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 140,
  },
  macroBubbleTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  macroBubbleTopLeft: {
    alignItems: 'flex-start',
    gap: 1,
    flex: 1,
  },
  macroCircleContainer: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 2,
    marginBottom: 2,
  },
  macroSymbolInCircle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroBubbleName: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'left',
  },
  macroBubbleGrams: {
    fontFamily: BRAND_ROUNDED_FONT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'left',
  },
  macroBubbleTarget: {
    fontSize: 10,
    fontWeight: '500',
  },
  macroBubblePct: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    marginLeft: 4,
  },
  mealsVerticalSection: {
    gap: 10,
  },
  mealsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  mealCountBadge: {
    fontSize: 12,
    fontWeight: '500',
  },
  mealCategoryCard: {
    borderRadius: 18,
    padding: 13,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  categoryCalsBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  categorySub: {
    fontSize: 12,
    marginTop: 1,
    letterSpacing: -0.1,
  },
  logMealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  logMealBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryItemsList: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  loggedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  itemIconPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loggedItemName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  loggedItemMacros: {
    fontSize: 11,
    marginTop: 2,
  },
  loggedItemCals: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  deleteBtn: {
    padding: 6,
  },
  waterCard: {
    padding: 16,
    borderRadius: 18,
    gap: 10,
  },
  waterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waterMetric: {
    fontSize: 14,
    fontWeight: '800',
  },
  waterLogHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  waterLogHeaderBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
  },
  waterIconWrapBare: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
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
    paddingVertical: 9,
    borderRadius: 10,
  },
  waterBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  historyPillBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    marginTop: 2,
    marginBottom: 4,
    gap: 8,
  },
  historyPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyPillTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
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
    gap: 3,
  },
  historyTrendTriangle: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  historyTrendText: {
    fontSize: 11,
    fontWeight: '800',
  },
});
