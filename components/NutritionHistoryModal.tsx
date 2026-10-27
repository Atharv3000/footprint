import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '@/constants/ThemeContext';
import { MealLog, MealType, NutritionTargets } from '@/constants/nutritionStorage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_MAX_HEIGHT = 170;

type TimeRange = 'daily' | 'weekly' | 'monthly';

interface NutritionHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  allMeals: MealLog[];
  targets: NutritionTargets;
  currentWeightKg: number;
  isUS: boolean;
  tdee: number;
}

const MEAL_COLORS: Record<MealType, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  breakfast: { label: 'Breakfast', color: '#f59e0b', icon: 'sunny' },
  lunch: { label: 'Lunch', color: '#38bdf8', icon: 'restaurant' },
  dinner: { label: 'Dinner', color: '#a855f7', icon: 'moon' },
  snack: { label: 'Snacks', color: '#10b981', icon: 'cafe' },
};

export function NutritionHistoryModal({
  visible,
  onClose,
  allMeals,
  targets,
  currentWeightKg,
  isUS,
  tdee,
}: NutritionHistoryModalProps) {
  const { colors, isDark } = useTheme();
  const [timeRange, setTimeRange] = useState<TimeRange>('weekly');
  const [dayOffset, setDayOffset] = useState<number>(0); // 0 = today, -1 = yesterday
  const [weekOffset, setWeekOffset] = useState<number>(0); // 0 = this week, -1 = last week
  const [monthOffset, setMonthOffset] = useState<number>(0); // 0 = this month, -1 = last month
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [showWeeklyCalLabels, setShowWeeklyCalLabels] = useState<boolean>(false);
  const [showMonthlyCalLabels, setShowMonthlyCalLabels] = useState<boolean>(false);

  // Helper date formatter: YYYY-MM-DD
  const formatDateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Aggregate all meals by dateKey including macros
  const dailyMealStats = useMemo(() => {
    const map: Record<
      string,
      {
        total: number;
        protein: number;
        carbs: number;
        fat: number;
        breakfast: number;
        lunch: number;
        dinner: number;
        snack: number;
        itemsCount: number;
      }
    > = {};

    allMeals.forEach((m) => {
      if (!map[m.dateKey]) {
        map[m.dateKey] = {
          total: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          breakfast: 0,
          lunch: 0,
          dinner: 0,
          snack: 0,
          itemsCount: 0,
        };
      }
      const st = map[m.dateKey];
      st.total += m.calories || 0;
      st.protein += m.proteinG || 0;
      st.carbs += m.carbsG || 0;
      st.fat += m.fatG || 0;
      st.itemsCount += 1;
      if (m.mealType === 'breakfast') st.breakfast += m.calories || 0;
      else if (m.mealType === 'lunch') st.lunch += m.calories || 0;
      else if (m.mealType === 'dinner') st.dinner += m.calories || 0;
      else if (m.mealType === 'snack') st.snack += m.calories || 0;
    });

    return map;
  }, [allMeals]);

  // ==========================================
  // DAILY VIEW COMPUTATION
  // ==========================================
  const activeDailyDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);

  const activeDailyDateKey = useMemo(() => formatDateKey(activeDailyDate), [activeDailyDate]);

  const dailyLabel = useMemo(() => {
    if (dayOffset === 0) return 'Today';
    if (dayOffset === -1) return 'Yesterday';
    return activeDailyDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [dayOffset, activeDailyDate]);

  const dailyStats = useMemo(() => {
    return (
      dailyMealStats[activeDailyDateKey] || {
        total: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        snack: 0,
        itemsCount: 0,
      }
    );
  }, [dailyMealStats, activeDailyDateKey]);

  // Donut chart geometry & segment calculations for daily calories
  const donutSegments = useMemo(() => {
    const total = dailyStats.total;
    const size = 190;
    const strokeWidth = 22;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (total === 0) {
      return {
        size,
        strokeWidth,
        radius,
        circumference,
        segments: [],
        isEmpty: true,
      };
    }

    let accumulatedPct = 0;
    const segments = order.map((type) => {
      const cals = dailyStats[type] || 0;
      const pct = cals / total;
      const strokeDashoffset = circumference * (1 - pct);
      const rotation = accumulatedPct * 360 - 90; // Start at 12 o'clock (-90deg)
      accumulatedPct += pct;

      return {
        type,
        cals,
        pct: Math.round(pct * 100),
        rawPct: pct,
        color: MEAL_COLORS[type].color,
        label: MEAL_COLORS[type].label,
        icon: MEAL_COLORS[type].icon,
        strokeDashoffset,
        rotation,
      };
    });

    return {
      size,
      strokeWidth,
      radius,
      circumference,
      segments,
      isEmpty: false,
    };
  }, [dailyStats]);

  // ==========================================
  // WEEKLY VIEW COMPUTATION
  // ==========================================
  const currentWeekDays = useMemo(() => {
    const now = new Date();
    const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate() + weekOffset * 7);

    // Monday of this week (0=Sun, 1=Mon, ..., 6=Sat)
    const dayOfWeek = anchor.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diffToMonday);

    const days: { date: Date; dateKey: string; dayLabel: string; shortDate: string }[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      days.push({
        date: d,
        dateKey: formatDateKey(d),
        dayLabel: dayNames[i],
        shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }
    return days;
  }, [weekOffset]);

  const {
    chartDays,
    weekAvgCals,
    weekTotalCals,
    activeLoggedDays,
    weekTotalProtein,
    weekTotalCarbs,
    weekTotalFat,
    weekTotalBreakfast,
    weekTotalLunch,
    weekTotalDinner,
    weekTotalSnack,
  } = useMemo(() => {
    let sum = 0;
    let activeDays = 0;
    let prot = 0;
    let carbs = 0;
    let fat = 0;
    let bf = 0;
    let ln = 0;
    let dn = 0;
    let sn = 0;

    const days = currentWeekDays.map((d) => {
      const st = dailyMealStats[d.dateKey] || {
        total: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        snack: 0,
        itemsCount: 0,
      };

      if (st.total > 0) {
        sum += st.total;
        prot += st.protein;
        carbs += st.carbs;
        fat += st.fat;
        bf += st.breakfast;
        ln += st.lunch;
        dn += st.dinner;
        sn += st.snack;
        activeDays += 1;
      }

      return {
        ...d,
        stats: st,
      };
    });

    const avg = activeDays > 0 ? Math.round(sum / activeDays) : 0;
    return {
      chartDays: days,
      weekAvgCals: avg,
      weekTotalCals: sum,
      activeLoggedDays: activeDays,
      weekTotalProtein: prot,
      weekTotalCarbs: carbs,
      weekTotalFat: fat,
      weekTotalBreakfast: bf,
      weekTotalLunch: ln,
      weekTotalDinner: dn,
      weekTotalSnack: sn,
    };
  }, [currentWeekDays, dailyMealStats]);

  const maxDayCals = useMemo(() => {
    const highestLogged = Math.max(
      ...chartDays.map((d) => d.stats.total),
      weekAvgCals,
      targets.dailyCalories
    );
    return Math.max(highestLogged * 1.18, 2000);
  }, [chartDays, weekAvgCals, targets.dailyCalories]);

  const weekLabel = useMemo(() => {
    if (currentWeekDays.length === 0) return '';
    const first = currentWeekDays[0].date;
    const last = currentWeekDays[currentWeekDays.length - 1].date;
    const m1 = first.toLocaleDateString('en-US', { month: 'short' });
    const m2 = last.toLocaleDateString('en-US', { month: 'short' });
    if (m1 === m2) {
      return `${m1} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`;
    }
    return `${m1} ${first.getDate()} – ${m2} ${last.getDate()}, ${last.getFullYear()}`;
  }, [currentWeekDays]);

  // Selected item detail for weekly chart
  const activeDetail = useMemo(() => {
    if (selectedDayKey === 'AVG') {
      const divisor = Math.max(1, activeLoggedDays);
      const avgBreakfast = Math.round(chartDays.reduce((a, b) => a + b.stats.breakfast, 0) / divisor);
      const avgLunch = Math.round(chartDays.reduce((a, b) => a + b.stats.lunch, 0) / divisor);
      const avgDinner = Math.round(chartDays.reduce((a, b) => a + b.stats.dinner, 0) / divisor);
      const avgSnack = Math.round(chartDays.reduce((a, b) => a + b.stats.snack, 0) / divisor);
      const avgProt = Math.round(chartDays.reduce((a, b) => a + b.stats.protein, 0) / divisor);
      const avgCarbs = Math.round(chartDays.reduce((a, b) => a + b.stats.carbs, 0) / divisor);
      const avgFat = Math.round(chartDays.reduce((a, b) => a + b.stats.fat, 0) / divisor);

      return {
        title: '7-Day Daily Average',
        subtitle: `Calculated from ${activeLoggedDays} active logged day${activeLoggedDays === 1 ? '' : 's'}`,
        stats: {
          total: weekAvgCals,
          protein: avgProt,
          carbs: avgCarbs,
          fat: avgFat,
          breakfast: avgBreakfast,
          lunch: avgLunch,
          dinner: avgDinner,
          snack: avgSnack,
          itemsCount: 0,
        },
      };
    }

    const day = chartDays.find((d) => d.dateKey === selectedDayKey);
    if (!day) return null;

    return {
      title: `${day.dayLabel}, ${day.shortDate}`,
      subtitle: day.stats.total > 0 ? `${day.stats.total} kcal total` : 'No meals logged',
      stats: day.stats,
    };
  }, [selectedDayKey, chartDays, weekAvgCals, activeLoggedDays]);

  // ==========================================
  // MONTHLY VIEW COMPUTATION
  // ==========================================
  const activeMonthDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const monthLabel = useMemo(() => {
    return activeMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [activeMonthDate]);

  // Divide the month into ~4-5 weeks for stacked monthly bar chart
  const monthlyWeeks = useMemo(() => {
    const y = activeMonthDate.getFullYear();
    const m = activeMonthDate.getMonth();
    const totalDaysInMonth = new Date(y, m + 1, 0).getDate();

    const weeks: {
      label: string;
      sub: string;
      total: number;
      breakfast: number;
      lunch: number;
      dinner: number;
      snack: number;
      protein: number;
      carbs: number;
      fat: number;
      daysCount: number;
    }[] = [];

    let currentWeek = 1;
    for (let day = 1; day <= totalDaysInMonth; day += 7) {
      const endDay = Math.min(day + 6, totalDaysInMonth);
      let tot = 0;
      let bf = 0;
      let ln = 0;
      let dn = 0;
      let sn = 0;
      let prot = 0;
      let carbs = 0;
      let fat = 0;
      let daysCount = 0;

      for (let d = day; d <= endDay; d++) {
        const dt = new Date(y, m, d);
        const k = formatDateKey(dt);
        const st = dailyMealStats[k];
        if (st && st.total > 0) {
          tot += st.total;
          bf += st.breakfast;
          ln += st.lunch;
          dn += st.dinner;
          sn += st.snack;
          prot += st.protein;
          carbs += st.carbs;
          fat += st.fat;
          daysCount += 1;
        }
      }

      weeks.push({
        label: `W${currentWeek}`,
        sub: `${m + 1}/${day}-${endDay}`,
        total: tot,
        breakfast: bf,
        lunch: ln,
        dinner: dn,
        snack: sn,
        protein: prot,
        carbs: carbs,
        fat: fat,
        daysCount,
      });
      currentWeek += 1;
    }
    return weeks;
  }, [activeMonthDate, dailyMealStats]);

  const maxMonthWeekCals = useMemo(() => {
    const highest = Math.max(...monthlyWeeks.map((w) => w.total), 1);
    return Math.max(highest * 1.18, 5000);
  }, [monthlyWeeks]);

  const monthlyStats = useMemo(() => {
    const y = activeMonthDate.getFullYear();
    const m = activeMonthDate.getMonth();
    const totalDaysInMonth = new Date(y, m + 1, 0).getDate();

    let totalCals = 0;
    let daysWithMeals = 0;
    let bf = 0;
    let ln = 0;
    let dn = 0;
    let sn = 0;
    let prot = 0;
    let carbs = 0;
    let fat = 0;

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const d = new Date(y, m, day);
      const k = formatDateKey(d);
      const st = dailyMealStats[k];
      if (st && st.total > 0) {
        totalCals += st.total;
        daysWithMeals += 1;
        bf += st.breakfast;
        ln += st.lunch;
        dn += st.dinner;
        sn += st.snack;
        prot += st.protein;
        carbs += st.carbs;
        fat += st.fat;
      }
    }

    const avg = daysWithMeals > 0 ? Math.round(totalCals / daysWithMeals) : 0;
    return {
      totalCals,
      avgDailyCals: avg,
      daysWithMeals,
      totalDaysInMonth,
      breakfast: bf,
      lunch: ln,
      dinner: dn,
      snack: sn,
      protein: prot,
      carbs: carbs,
      fat: fat,
    };
  }, [activeMonthDate, dailyMealStats]);

  // ========================================================
  // REUSABLE MACRO PROGRESS BARS WITH OVER-GOAL DARKER SHADE
  // ========================================================
  const renderMacroProgressCards = (
    consumedProt: number,
    targetProt: number,
    consumedCarb: number,
    targetCarb: number,
    consumedFat: number,
    targetFat: number,
    periodLabel: string
  ) => {
    const macroConfig = [
      {
        key: 'protein',
        name: 'Protein',
        consumed: consumedProt,
        target: targetProt,
        unit: 'g',
        baseColor: isDark ? '#38bdf8' : '#0284c7',
        darkerColor: isDark ? '#0369a1' : '#075985',
      },
      {
        key: 'carbs',
        name: 'Carbs',
        consumed: consumedCarb,
        target: targetCarb,
        unit: 'g',
        baseColor: isDark ? '#a3e635' : '#16a34a',
        darkerColor: isDark ? '#4d7c0f' : '#15803d',
      },
      {
        key: 'fat',
        name: 'Fat',
        consumed: consumedFat,
        target: targetFat,
        unit: 'g',
        baseColor: isDark ? '#f59e0b' : '#d97706',
        darkerColor: isDark ? '#b45309' : '#92400e',
      },
    ];

    return (
      <View
        style={[
          styles.chartCard,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <Text style={[styles.breakdownHeaderTitle, { color: colors.text, marginBottom: 0 }]}>
            Macro Goals Met
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }}>
            {periodLabel}
          </Text>
        </View>

        <View style={{ gap: 14 }}>
          {macroConfig.map((item) => {
            const rawPct = item.target > 0 ? Math.round((item.consumed / item.target) * 100) : 0;
            const basePct = Math.min(100, rawPct);
            const excessPct = rawPct > 100 ? Math.min(100, rawPct - 100) : 0;
            const isOver = rawPct > 100;

            return (
              <View key={item.key}>
                {/* Header row: Name, Percent & Grams */}
                <View style={styles.macroRowHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.macroDot, { backgroundColor: isOver ? item.darkerColor : item.baseColor }]} />
                    <Text style={[styles.macroNameText, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.macroPctBadgeText, { color: isOver ? item.darkerColor : item.baseColor }]}>
                      {rawPct}%
                    </Text>
                  </View>
                  <Text style={[styles.macroGramsText, { color: colors.text }]}>
                    {item.consumed}
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}> / {item.target}{item.unit}</Text>
                  </Text>
                </View>

                {/* Layered Progress Track */}
                <View style={[styles.macroProgressBarTrack, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}>
                  {/* Base Fill (up to 100%) */}
                  <View
                    style={[
                      styles.macroProgressBarFill,
                      {
                        width: `${basePct}%`,
                        backgroundColor: item.baseColor,
                      },
                    ]}
                  />
                  {/* Excess Fill overlay (darker shade for going over goal) */}
                  {isOver && (
                    <View
                      style={[
                        styles.macroProgressBarExcess,
                        {
                          width: `${excessPct}%`,
                          backgroundColor: item.darkerColor,
                        },
                      ]}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header Bar */}
        <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Calorie History</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              {timeRange === 'daily'
                ? 'Daily Meal Breakdown'
                : timeRange === 'weekly'
                ? 'Weekly Stacked Meal Intake'
                : 'Monthly Stacked Overview'}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* TIME RANGE SEGMENTED TOGGLE (Daily / Weekly / Monthly) */}
        <View style={styles.toggleSegmentWrapper}>
          <View
            style={[
              styles.toggleSegmentContainer,
              { backgroundColor: isDark ? '#18181b' : '#e4e4e7', borderColor: colors.border },
            ]}
          >
            {(['daily', 'weekly', 'monthly'] as TimeRange[]).map((tab) => {
              const isActive = timeRange === tab;
              const title = tab.charAt(0).toUpperCase() + tab.slice(1);
              return (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.toggleSegmentBtn,
                    isActive && {
                      backgroundColor: colors.surfaceElevated,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.15,
                      shadowRadius: 4,
                      elevation: 3,
                    },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTimeRange(tab);
                    setSelectedDayKey(null);
                  }}
                >
                  <Text
                    style={[
                      styles.toggleSegmentText,
                      { color: isActive ? colors.primary : colors.textMuted },
                      isActive && { fontWeight: '800' },
                    ]}
                  >
                    {title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          {/* ============================================================ */}
          {/* DAILY VIEW: Donut Chart + Meal Percentages + Daily Macros    */}
          {/* ============================================================ */}
          {timeRange === 'daily' && (
            <View>
              {/* Day Nav Selector */}
              <View
                style={[
                  styles.navCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  style={styles.navArrowBtn}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setDayOffset((prev) => prev - 1);
                  }}
                >
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.navLabelWrap}>
                  <Text style={[styles.navRangeText, { color: colors.text }]}>{dailyLabel}</Text>
                  <Text style={[styles.navOffsetBadge, { color: colors.primary }]}>
                    {activeDailyDate.toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.navArrowBtn, dayOffset >= 0 && { opacity: 0.3 }]}
                  disabled={dayOffset >= 0}
                  onPress={() => {
                    if (dayOffset < 0) {
                      Haptics.selectionAsync().catch(() => {});
                      setDayOffset((prev) => prev + 1);
                    }
                  }}
                >
                  <Ionicons name="chevron-forward" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Donut Chart Card */}
              <View
                style={[
                  styles.chartCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <View style={styles.donutContainer}>
                  <Svg
                    width={donutSegments.size}
                    height={donutSegments.size}
                    viewBox={`0 0 ${donutSegments.size} ${donutSegments.size}`}
                  >
                    {/* Background ring */}
                    <Circle
                      cx={donutSegments.size / 2}
                      cy={donutSegments.size / 2}
                      r={donutSegments.radius}
                      stroke={isDark ? '#27272a' : '#f4f4f5'}
                      strokeWidth={donutSegments.strokeWidth}
                      fill="none"
                    />

                    {/* Meal category arcs */}
                    {!donutSegments.isEmpty &&
                      donutSegments.segments.map((seg) => {
                        if (seg.cals <= 0) return null;
                        return (
                          <G
                            key={seg.type}
                            origin={`${donutSegments.size / 2}, ${donutSegments.size / 2}`}
                            rotation={seg.rotation}
                          >
                            <Circle
                              cx={donutSegments.size / 2}
                              cy={donutSegments.size / 2}
                              r={donutSegments.radius}
                              stroke={seg.color}
                              strokeWidth={donutSegments.strokeWidth}
                              fill="none"
                              strokeDasharray={`${donutSegments.circumference} ${donutSegments.circumference}`}
                              strokeDashoffset={seg.strokeDashoffset}
                              strokeLinecap="round"
                            />
                          </G>
                        );
                      })}
                  </Svg>

                  {/* Donut Center Content */}
                  <View style={styles.donutCenterWrap} pointerEvents="none">
                    <Text style={[styles.donutCenterCals, { color: colors.text }]}>
                      {dailyStats.total}
                    </Text>
                    <Text style={[styles.donutCenterUnit, { color: colors.textMuted }]}>
                      TOTAL KCAL
                    </Text>
                    <View
                      style={[
                        styles.donutGoalPill,
                        {
                          backgroundColor:
                            dailyStats.total > targets.dailyCalories
                              ? 'rgba(239,68,68,0.15)'
                              : 'rgba(34,197,94,0.15)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.donutGoalPillText,
                          {
                            color:
                              dailyStats.total > targets.dailyCalories ? '#ef4444' : '#22c55e',
                          },
                        ]}
                      >
                        {Math.round((dailyStats.total / targets.dailyCalories) * 100)}% of Goal
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Percentage Breakdown by Meal */}
                <View style={styles.donutBreakdownSection}>
                  <Text style={[styles.breakdownHeaderTitle, { color: colors.text }]}>
                    Meal Breakdown
                  </Text>
                  <View style={styles.donutLegendGrid}>
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => {
                      const cals = dailyStats[mealType] || 0;
                      const pct =
                        dailyStats.total > 0
                          ? Math.round((cals / dailyStats.total) * 100)
                          : 0;
                      const info = MEAL_COLORS[mealType];

                      return (
                        <View
                          key={mealType}
                          style={[
                            styles.donutMealRow,
                            {
                              backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <View style={styles.donutMealLeft}>
                            <View
                              style={[
                                styles.donutMealDot,
                                { backgroundColor: info.color },
                              ]}
                            />
                            <View>
                              <Text style={[styles.donutMealName, { color: colors.text }]}>
                                {info.label}
                              </Text>
                              <Text style={[styles.donutMealCals, { color: colors.textMuted }]}>
                                {cals} kcal
                              </Text>
                            </View>
                          </View>

                          <View style={styles.donutMealRight}>
                            <View
                              style={[
                                styles.donutPctBadge,
                                { backgroundColor: `${info.color}22` },
                              ]}
                            >
                              <Text style={[styles.donutPctText, { color: info.color }]}>
                                {pct}%
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Daily Macro Graphs (Going over goal is darker) */}
              {renderMacroProgressCards(
                dailyStats.protein,
                targets.proteinGrams,
                dailyStats.carbs,
                targets.carbsGrams,
                dailyStats.fat,
                targets.fatGrams,
                'TODAY'
              )}
            </View>
          )}

          {/* ============================================================ */}
          {/* WEEKLY VIEW: Stacked Bar Chart with Average Bar             */}
          {/* ============================================================ */}
          {timeRange === 'weekly' && (
            <View>
              {/* Week Selector Nav */}
              <View
                style={[
                  styles.navCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  style={styles.navArrowBtn}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setWeekOffset((prev) => prev - 1);
                    setSelectedDayKey(null);
                  }}
                >
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.navLabelWrap}>
                  <Text style={[styles.navRangeText, { color: colors.text }]}>{weekLabel}</Text>
                  <Text style={[styles.navOffsetBadge, { color: colors.primary }]}>
                    {weekOffset === 0
                      ? 'CURRENT WEEK'
                      : weekOffset === -1
                      ? 'LAST WEEK'
                      : `${Math.abs(weekOffset)} WEEKS AGO`}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.navArrowBtn, weekOffset >= 0 && { opacity: 0.3 }]}
                  disabled={weekOffset >= 0}
                  onPress={() => {
                    if (weekOffset < 0) {
                      Haptics.selectionAsync().catch(() => {});
                      setWeekOffset((prev) => prev + 1);
                      setSelectedDayKey(null);
                    }
                  }}
                >
                  <Ionicons name="chevron-forward" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Quick Stat Summary Chips */}
              <View style={styles.summaryChipsRow}>
                <View
                  style={[
                    styles.summaryChip,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.summaryChipLabel, { color: colors.textMuted }]}>
                    WEEK TOTAL
                  </Text>
                  <Text style={[styles.summaryChipValue, { color: colors.text }]}>
                    {weekTotalCals}{' '}
                    <Text style={{ fontSize: 11, fontWeight: '500' }}>kcal</Text>
                  </Text>
                </View>

                <View
                  style={[
                    styles.summaryChip,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.summaryChipLabel, { color: colors.textMuted }]}>
                    DAILY AVERAGE
                  </Text>
                  <Text style={[styles.summaryChipValue, { color: colors.primary }]}>
                    {weekAvgCals}{' '}
                    <Text style={{ fontSize: 11, fontWeight: '500' }}>kcal</Text>
                  </Text>
                </View>

                <View
                  style={[
                    styles.summaryChip,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.summaryChipLabel, { color: colors.textMuted }]}>
                    DAILY GOAL
                  </Text>
                  <Text style={[styles.summaryChipValue, { color: colors.text }]}>
                    {targets.dailyCalories}{' '}
                    <Text style={{ fontSize: 11, fontWeight: '500' }}>kcal</Text>
                  </Text>
                </View>
              </View>

              {/* Stacked Bar Chart Card (Tap anywhere on the chart to toggle numbers above bars) */}
              <TouchableOpacity
                style={[
                  styles.chartCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
                activeOpacity={0.96}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowWeeklyCalLabels((prev) => !prev);
                }}
              >
                {/* Header Row: Legend + Tap Hint */}
                <View style={styles.chartHeaderRow}>
                  <View style={styles.legendRow}>
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((type) => (
                      <View key={type} style={styles.legendItem}>
                        <View
                          style={[
                            styles.legendColorDot,
                            { backgroundColor: MEAL_COLORS[type].color },
                          ]}
                        />
                        <Text style={[styles.legendText, { color: colors.textMuted }]}>
                          {MEAL_COLORS[type].label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.chartToggleHintBadge}>
                    <Ionicons
                      name={showWeeklyCalLabels ? 'eye' : 'eye-outline'}
                      size={12}
                      color={colors.textMuted}
                    />
                    <Text style={[styles.chartToggleHintText, { color: colors.textMuted }]}>
                      {showWeeklyCalLabels ? 'Hide cals' : 'Tap to show cals'}
                    </Text>
                  </View>
                </View>

                {/* Bars Area with Goal Guideline */}
                <View style={styles.barsContainer}>
                  {/* Calorie Goal Guideline */}
                  {(() => {
                    const goalRatio = targets.dailyCalories / maxDayCals;
                    const goalBottomPx = Math.min(
                      BAR_MAX_HEIGHT,
                      Math.max(10, goalRatio * BAR_MAX_HEIGHT)
                    );
                    return (
                      <View
                        style={[styles.goalGuidelineRow, { bottom: goalBottomPx + 24 }]}
                        pointerEvents="none"
                      >
                        <View
                          style={[
                            styles.goalDashedLine,
                            { borderColor: colors.textMuted + '40' },
                          ]}
                        />
                        <Text style={[styles.goalLineLabel, { color: colors.textMuted }]}>
                          Goal {targets.dailyCalories}
                        </Text>
                      </View>
                    );
                  })()}

                  <View style={styles.barsRow}>
                    {/* 7 Daily Stacked Bars */}
                    {chartDays.map((d) => {
                      const isSelected = selectedDayKey === d.dateKey;
                      const hasData = d.stats.total > 0;

                      const breakfastH = (d.stats.breakfast / maxDayCals) * BAR_MAX_HEIGHT;
                      const lunchH = (d.stats.lunch / maxDayCals) * BAR_MAX_HEIGHT;
                      const dinnerH = (d.stats.dinner / maxDayCals) * BAR_MAX_HEIGHT;
                      const snackH = (d.stats.snack / maxDayCals) * BAR_MAX_HEIGHT;
                      const totalH = Math.max(
                        hasData ? 6 : 0,
                        breakfastH + lunchH + dinnerH + snackH
                      );

                      return (
                        <TouchableOpacity
                          key={d.dateKey}
                          style={styles.barColTouchable}
                          activeOpacity={0.7}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setSelectedDayKey(isSelected ? null : d.dateKey);
                          }}
                        >
                          {/* Number Above Bar (Toggleable on graph click) */}
                          <View style={styles.barTopValSlot}>
                            {showWeeklyCalLabels && d.stats.total > 0 && (
                              <Text
                                style={[
                                  styles.barTopValText,
                                  { color: isSelected ? colors.primary : colors.text },
                                ]}
                                numberOfLines={1}
                              >
                                {d.stats.total}
                              </Text>
                            )}
                          </View>

                          <View style={[styles.barTrack, { height: BAR_MAX_HEIGHT }]}>
                            {hasData ? (
                              <View
                                style={[
                                  styles.stackedBarWrap,
                                  { height: totalH },
                                  isSelected && {
                                    borderWidth: 2,
                                    borderColor: colors.text,
                                    borderRadius: 6,
                                  },
                                ]}
                              >
                                {snackH > 0 && (
                                  <View
                                    style={{
                                      height: snackH,
                                      backgroundColor: MEAL_COLORS.snack.color,
                                    }}
                                  />
                                )}
                                {dinnerH > 0 && (
                                  <View
                                    style={{
                                      height: dinnerH,
                                      backgroundColor: MEAL_COLORS.dinner.color,
                                    }}
                                  />
                                )}
                                {lunchH > 0 && (
                                  <View
                                    style={{
                                      height: lunchH,
                                      backgroundColor: MEAL_COLORS.lunch.color,
                                    }}
                                  />
                                )}
                                {breakfastH > 0 && (
                                  <View
                                    style={{
                                      height: breakfastH,
                                      backgroundColor: MEAL_COLORS.breakfast.color,
                                    }}
                                  />
                                )}
                              </View>
                            ) : (
                              <View
                                style={[
                                  styles.emptyBarPip,
                                  { backgroundColor: isDark ? '#27272a' : '#e4e4e7' },
                                ]}
                              />
                            )}
                          </View>
                          <Text
                            style={[
                              styles.barDayLabel,
                              { color: isSelected ? colors.primary : colors.text },
                            ]}
                          >
                            {d.dayLabel}
                          </Text>
                          <Text
                            style={[
                              styles.barDateSub,
                              { color: isSelected ? colors.primary : colors.textMuted },
                            ]}
                          >
                            {d.shortDate}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Vertical Divider */}
                    <View
                      style={[
                        styles.avgBarDivider,
                        { backgroundColor: colors.border },
                      ]}
                    />

                    {/* 8th AVERAGE BAR */}
                    {(() => {
                      const isAvgSelected = selectedDayKey === 'AVG';
                      const bfH =
                        weekAvgCals > 0
                          ? (chartDays.reduce((a, b) => a + b.stats.breakfast, 0) /
                              Math.max(1, activeLoggedDays) /
                              maxDayCals) *
                            BAR_MAX_HEIGHT
                          : 0;
                      const lnchH =
                        weekAvgCals > 0
                          ? (chartDays.reduce((a, b) => a + b.stats.lunch, 0) /
                              Math.max(1, activeLoggedDays) /
                              maxDayCals) *
                            BAR_MAX_HEIGHT
                          : 0;
                      const dinH =
                        weekAvgCals > 0
                          ? (chartDays.reduce((a, b) => a + b.stats.dinner, 0) /
                              Math.max(1, activeLoggedDays) /
                              maxDayCals) *
                            BAR_MAX_HEIGHT
                          : 0;
                      const snkH =
                        weekAvgCals > 0
                          ? (chartDays.reduce((a, b) => a + b.stats.snack, 0) /
                              Math.max(1, activeLoggedDays) /
                              maxDayCals) *
                            BAR_MAX_HEIGHT
                          : 0;
                      const avgTotalH = Math.max(
                        weekAvgCals > 0 ? 6 : 0,
                        bfH + lnchH + dinH + snkH
                      );

                      return (
                        <TouchableOpacity
                          style={styles.barColTouchable}
                          activeOpacity={0.7}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setSelectedDayKey(isAvgSelected ? null : 'AVG');
                          }}
                        >
                          {/* Number Above Average Bar */}
                          <View style={styles.barTopValSlot}>
                            {showWeeklyCalLabels && weekAvgCals > 0 && (
                              <Text
                                style={[
                                  styles.barTopValText,
                                  { color: colors.primary, fontWeight: '800' },
                                ]}
                                numberOfLines={1}
                              >
                                {weekAvgCals}
                              </Text>
                            )}
                          </View>

                          <View style={[styles.barTrack, { height: BAR_MAX_HEIGHT }]}>
                            {weekAvgCals > 0 ? (
                              <View
                                style={[
                                  styles.stackedBarWrap,
                                  { height: avgTotalH },
                                  isAvgSelected && {
                                    borderWidth: 2,
                                    borderColor: colors.primary,
                                    borderRadius: 6,
                                  },
                                ]}
                              >
                                {snkH > 0 && (
                                  <View
                                    style={{
                                      height: snkH,
                                      backgroundColor: MEAL_COLORS.snack.color,
                                    }}
                                  />
                                )}
                                {dinH > 0 && (
                                  <View
                                    style={{
                                      height: dinH,
                                      backgroundColor: MEAL_COLORS.dinner.color,
                                    }}
                                  />
                                )}
                                {lnchH > 0 && (
                                  <View
                                    style={{
                                      height: lnchH,
                                      backgroundColor: MEAL_COLORS.lunch.color,
                                    }}
                                  />
                                )}
                                {bfH > 0 && (
                                  <View
                                    style={{
                                      height: bfH,
                                      backgroundColor: MEAL_COLORS.breakfast.color,
                                    }}
                                  />
                                )}
                              </View>
                            ) : (
                              <View
                                style={[
                                  styles.emptyBarPip,
                                  { backgroundColor: isDark ? '#27272a' : '#e4e4e7' },
                                ]}
                              />
                            )}
                          </View>
                          <Text
                            style={[
                              styles.barDayLabel,
                              {
                                color: colors.primary,
                                fontWeight: '800',
                              },
                            ]}
                          >
                            AVG
                          </Text>
                          <Text
                            style={[
                              styles.barDateSub,
                              { color: colors.primary, fontSize: 9.5, fontWeight: '700' },
                            ]}
                          >
                            7D
                          </Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>
                </View>
              </TouchableOpacity>

              {/* 4 MEAL CATEGORIES & PERCENTAGE BREAKDOWN OVER THIS WEEK */}
              <View
                style={[
                  styles.chartCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.breakdownHeaderTitle, { color: colors.text, marginBottom: 12 }]}>
                  Meal Breakdown (This Week)
                </Text>
                <View style={styles.categoryPillsGrid}>
                  {(
                    [
                      { key: 'breakfast', cals: weekTotalBreakfast },
                      { key: 'lunch', cals: weekTotalLunch },
                      { key: 'dinner', cals: weekTotalDinner },
                      { key: 'snack', cals: weekTotalSnack },
                    ] as { key: MealType; cals: number }[]
                  ).map((item) => {
                    const info = MEAL_COLORS[item.key];
                    const pct = weekTotalCals > 0 ? Math.round((item.cals / weekTotalCals) * 100) : 0;

                    return (
                      <View
                        key={item.key}
                        style={[
                          styles.categoryPillItem,
                          { backgroundColor: isDark ? '#18181b' : '#f4f4f5' },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.legendColorDot, { backgroundColor: info.color, width: 10, height: 10, borderRadius: 5 }]} />
                          <Ionicons name={info.icon} size={15} color={info.color} />
                          <Text style={[styles.categoryPillName, { color: colors.text }]}>
                            {info.label}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.categoryPillCals, { color: colors.text }]}>
                            {item.cals.toLocaleString()} kcal
                          </Text>
                          <Text style={[styles.categoryPillPct, { color: colors.textMuted }]}>
                            {pct}% of week
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* WEEKLY MACRO GRAPHS (Going over goal is darker) */}
              {renderMacroProgressCards(
                weekTotalProtein,
                targets.proteinGrams * 7,
                weekTotalCarbs,
                targets.carbsGrams * 7,
                weekTotalFat,
                targets.fatGrams * 7,
                'THIS WEEK'
              )}

              {/* Selected Day/Item Detailed Breakdown Card */}
              {activeDetail && (
                <View
                  style={[
                    styles.detailCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.primary + '66',
                    },
                  ]}
                >
                  <View style={styles.detailHeaderRow}>
                    <View>
                      <Text style={[styles.detailTitle, { color: colors.text }]}>
                        {activeDetail.title}
                      </Text>
                      <Text style={[styles.detailSubtitle, { color: colors.textMuted }]}>
                        {activeDetail.subtitle}
                      </Text>
                    </View>
                    <View style={styles.detailTotalBadge}>
                      <Text style={[styles.detailTotalText, { color: colors.primary }]}>
                        {activeDetail.stats.total}{' '}
                        <Text style={{ fontSize: 13, fontWeight: '600' }}>kcal</Text>
                      </Text>
                    </View>
                  </View>

                  {/* 4 Category Pill Rows for selected bar */}
                  <View style={styles.categoryPillsGrid}>
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((catKey) => {
                      const catCals = activeDetail.stats[catKey] || 0;
                      const catPct =
                        activeDetail.stats.total > 0
                          ? Math.round((catCals / activeDetail.stats.total) * 100)
                          : 0;
                      const info = MEAL_COLORS[catKey];

                      return (
                        <View
                          key={catKey}
                          style={[
                            styles.categoryPillItem,
                            { backgroundColor: isDark ? '#18181b' : '#f4f4f5' },
                          ]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name={info.icon} size={15} color={info.color} />
                            <Text style={[styles.categoryPillName, { color: colors.text }]}>
                              {info.label}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.categoryPillCals, { color: colors.text }]}>
                              {catCals} kcal
                            </Text>
                            <Text style={[styles.categoryPillPct, { color: colors.textMuted }]}>
                              {catPct}%
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ============================================================ */}
          {/* MONTHLY VIEW: Stacked Bar Chart by Week & Breakdown         */}
          {/* ============================================================ */}
          {timeRange === 'monthly' && (
            <View>
              {/* Month Nav Selector */}
              <View
                style={[
                  styles.navCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  style={styles.navArrowBtn}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setMonthOffset((prev) => prev - 1);
                  }}
                >
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.navLabelWrap}>
                  <Text style={[styles.navRangeText, { color: colors.text }]}>
                    {monthLabel}
                  </Text>
                  <Text style={[styles.navOffsetBadge, { color: colors.primary }]}>
                    {monthlyStats.daysWithMeals} of {monthlyStats.totalDaysInMonth} DAYS LOGGED
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.navArrowBtn, monthOffset >= 0 && { opacity: 0.3 }]}
                  disabled={monthOffset >= 0}
                  onPress={() => {
                    if (monthOffset < 0) {
                      Haptics.selectionAsync().catch(() => {});
                      setMonthOffset((prev) => prev + 1);
                    }
                  }}
                >
                  <Ionicons name="chevron-forward" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Monthly Stat Summary */}
              <View style={styles.summaryChipsRow}>
                <View
                  style={[
                    styles.summaryChip,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.summaryChipLabel, { color: colors.textMuted }]}>
                    MONTH TOTAL
                  </Text>
                  <Text style={[styles.summaryChipValue, { color: colors.text }]}>
                    {monthlyStats.totalCals.toLocaleString()}{' '}
                    <Text style={{ fontSize: 11, fontWeight: '500' }}>kcal</Text>
                  </Text>
                </View>

                <View
                  style={[
                    styles.summaryChip,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.summaryChipLabel, { color: colors.textMuted }]}>
                    ACTIVE AVG
                  </Text>
                  <Text style={[styles.summaryChipValue, { color: colors.primary }]}>
                    {monthlyStats.avgDailyCals}{' '}
                    <Text style={{ fontSize: 11, fontWeight: '500' }}>kcal</Text>
                  </Text>
                </View>

                <View
                  style={[
                    styles.summaryChip,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.summaryChipLabel, { color: colors.textMuted }]}>
                    MONTHLY GOAL
                  </Text>
                  <Text style={[styles.summaryChipValue, { color: colors.text }]}>
                    {(targets.dailyCalories * monthlyStats.totalDaysInMonth).toLocaleString()}{' '}
                    <Text style={{ fontSize: 11, fontWeight: '500' }}>kcal</Text>
                  </Text>
                </View>
              </View>

              {/* Monthly Stacked Bar Chart (Tap graph to toggle number of cals above bars) */}
              <TouchableOpacity
                style={[
                  styles.chartCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
                activeOpacity={0.96}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowMonthlyCalLabels((prev) => !prev);
                }}
              >
                {/* Header Row: Legend + Tap Hint */}
                <View style={styles.chartHeaderRow}>
                  <View style={styles.legendRow}>
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((type) => (
                      <View key={type} style={styles.legendItem}>
                        <View
                          style={[
                            styles.legendColorDot,
                            { backgroundColor: MEAL_COLORS[type].color },
                          ]}
                        />
                        <Text style={[styles.legendText, { color: colors.textMuted }]}>
                          {MEAL_COLORS[type].label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.chartToggleHintBadge}>
                    <Ionicons
                      name={showMonthlyCalLabels ? 'eye' : 'eye-outline'}
                      size={12}
                      color={colors.textMuted}
                    />
                    <Text style={[styles.chartToggleHintText, { color: colors.textMuted }]}>
                      {showMonthlyCalLabels ? 'Hide cals' : 'Tap to show cals'}
                    </Text>
                  </View>
                </View>

                {/* Monthly Stacked Bars */}
                <View style={styles.barsContainer}>
                  <View style={styles.barsRow}>
                    {monthlyWeeks.map((wk, idx) => {
                      const hasData = wk.total > 0;
                      const bfH = (wk.breakfast / maxMonthWeekCals) * BAR_MAX_HEIGHT;
                      const lnchH = (wk.lunch / maxMonthWeekCals) * BAR_MAX_HEIGHT;
                      const dinH = (wk.dinner / maxMonthWeekCals) * BAR_MAX_HEIGHT;
                      const snkH = (wk.snack / maxMonthWeekCals) * BAR_MAX_HEIGHT;
                      const totalH = Math.max(hasData ? 6 : 0, bfH + lnchH + dinH + snkH);

                      return (
                        <View key={idx} style={styles.barColTouchable}>
                          {/* Number Above Bar */}
                          <View style={styles.barTopValSlot}>
                            {showMonthlyCalLabels && wk.total > 0 && (
                              <Text
                                style={[styles.barTopValText, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {wk.total}
                              </Text>
                            )}
                          </View>

                          <View style={[styles.barTrack, { height: BAR_MAX_HEIGHT, width: 20 }]}>
                            {hasData ? (
                              <View style={[styles.stackedBarWrap, { height: totalH, width: 20 }]}>
                                {snkH > 0 && (
                                  <View
                                    style={{
                                      height: snkH,
                                      backgroundColor: MEAL_COLORS.snack.color,
                                    }}
                                  />
                                )}
                                {dinH > 0 && (
                                  <View
                                    style={{
                                      height: dinH,
                                      backgroundColor: MEAL_COLORS.dinner.color,
                                    }}
                                  />
                                )}
                                {lnchH > 0 && (
                                  <View
                                    style={{
                                      height: lnchH,
                                      backgroundColor: MEAL_COLORS.lunch.color,
                                    }}
                                  />
                                )}
                                {bfH > 0 && (
                                  <View
                                    style={{
                                      height: bfH,
                                      backgroundColor: MEAL_COLORS.breakfast.color,
                                    }}
                                  />
                                )}
                              </View>
                            ) : (
                              <View
                                style={[
                                  styles.emptyBarPip,
                                  { backgroundColor: isDark ? '#27272a' : '#e4e4e7', width: 20 },
                                ]}
                              />
                            )}
                          </View>
                          <Text style={[styles.barDayLabel, { color: colors.text }]}>
                            {wk.label}
                          </Text>
                          <Text style={[styles.barDateSub, { color: colors.textMuted }]}>
                            {wk.sub}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </TouchableOpacity>

              {/* 4 MEAL CATEGORIES & PERCENTAGE BREAKDOWN OVER THIS MONTH */}
              <View
                style={[
                  styles.chartCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.breakdownHeaderTitle, { color: colors.text, marginBottom: 12 }]}>
                  Meal Breakdown (This Month)
                </Text>
                <View style={styles.categoryPillsGrid}>
                  {(
                    [
                      { key: 'breakfast', cals: monthlyStats.breakfast },
                      { key: 'lunch', cals: monthlyStats.lunch },
                      { key: 'dinner', cals: monthlyStats.dinner },
                      { key: 'snack', cals: monthlyStats.snack },
                    ] as { key: MealType; cals: number }[]
                  ).map((item) => {
                    const info = MEAL_COLORS[item.key];
                    const pct =
                      monthlyStats.totalCals > 0
                        ? Math.round((item.cals / monthlyStats.totalCals) * 100)
                        : 0;

                    return (
                      <View
                        key={item.key}
                        style={[
                          styles.categoryPillItem,
                          { backgroundColor: isDark ? '#18181b' : '#f4f4f5' },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.legendColorDot, { backgroundColor: info.color, width: 10, height: 10, borderRadius: 5 }]} />
                          <Ionicons name={info.icon} size={15} color={info.color} />
                          <Text style={[styles.categoryPillName, { color: colors.text }]}>
                            {info.label}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.categoryPillCals, { color: colors.text }]}>
                            {item.cals.toLocaleString()} kcal
                          </Text>
                          <Text style={[styles.categoryPillPct, { color: colors.textMuted }]}>
                            {pct}% of month
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* MONTHLY MACRO GRAPHS (Going over goal is darker) */}
              {renderMacroProgressCards(
                monthlyStats.protein,
                targets.proteinGrams * monthlyStats.totalDaysInMonth,
                monthlyStats.carbs,
                targets.carbsGrams * monthlyStats.totalDaysInMonth,
                monthlyStats.fat,
                targets.fatGrams * monthlyStats.totalDaysInMonth,
                'THIS MONTH'
              )}
            </View>
          )}

          {/* Diet Projection Insight Card (Always relevant based on actual consumption) */}
          <View
            style={[
              styles.projectionInsightCard,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <Text style={[styles.projectionTitle, { color: colors.text }]}>
                Diet Weight Prediction
              </Text>
            </View>

            {(() => {
              // Use daily stats for daily tab, week avg for weekly, and month avg for monthly
              const effectiveDailyAvg =
                timeRange === 'daily'
                  ? dailyStats.total > 0
                    ? dailyStats.total
                    : targets.dailyCalories
                  : timeRange === 'monthly'
                  ? monthlyStats.avgDailyCals > 0
                    ? monthlyStats.avgDailyCals
                    : targets.dailyCalories
                  : weekAvgCals > 0
                  ? weekAvgCals
                  : targets.dailyCalories;

              const dailyCalDiff = effectiveDailyAvg - tdee;
              const monthlyLbs = (dailyCalDiff * 30) / 3500;
              const projectedLbs = Math.max(50, currentWeightKg * 2.20462 + monthlyLbs);
              const projectedKg = Math.max(25, currentWeightKg + monthlyLbs / 2.20462);

              return (
                <View>
                  <Text style={[styles.projectionBody, { color: colors.textMuted }]}>
                    Based on your{' '}
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {timeRange} consumption of {effectiveDailyAvg} kcal/day
                    </Text>{' '}
                    and maintenance expenditure (~{tdee} kcal):
                  </Text>
                  <View style={styles.projectionStatRow}>
                    <Text
                      style={[
                        styles.projectionHighlight,
                        { color: dailyCalDiff <= 0 ? '#22c55e' : '#f59e0b' },
                      ]}
                    >
                      {isUS ? `${Math.round(projectedLbs)} lbs` : `${Math.round(projectedKg)} kg`}{' '}
                      in 1 mo
                    </Text>
                    <Text style={[styles.projectionSubHighlight, { color: colors.textMuted }]}>
                      (
                      {dailyCalDiff > 0 ? '+' : ''}
                      {isUS
                        ? monthlyLbs.toFixed(1) + ' lbs'
                        : (monthlyLbs / 2.20462).toFixed(1) + ' kg'}{' '}
                      shift)
                    </Text>
                  </View>
                </View>
              );
            })()}
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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  // Segmented Toggle
  toggleSegmentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  toggleSegmentContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
  },
  toggleSegmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  toggleSegmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 16,
  },
  // Nav Card
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  navArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabelWrap: {
    alignItems: 'center',
  },
  navRangeText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  navOffsetBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  // Summary Chips
  summaryChipsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  summaryChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  summaryChipLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  summaryChipValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  // Chart Card
  chartCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 14,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chartToggleHintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(150, 150, 150, 0.12)',
  },
  chartToggleHintText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Donut Chart Styles
  donutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 12,
  },
  donutCenterWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterCals: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  donutCenterUnit: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: -2,
    marginBottom: 4,
  },
  donutGoalPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  donutGoalPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  donutBreakdownSection: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.2)',
    paddingTop: 14,
  },
  breakdownHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  donutLegendGrid: {
    gap: 8,
  },
  donutMealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  donutMealLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  donutMealDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  donutMealName: {
    fontSize: 14,
    fontWeight: '700',
  },
  donutMealCals: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  donutMealRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  donutPctBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  donutPctText: {
    fontSize: 13,
    fontWeight: '800',
  },
  // Weekly Chart Legend
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  barsContainer: {
    position: 'relative',
    height: BAR_MAX_HEIGHT + 52,
    justifyContent: 'flex-end',
  },
  goalGuidelineRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  goalDashedLine: {
    flex: 1,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
  },
  goalLineLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    marginLeft: 6,
    textTransform: 'uppercase',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    zIndex: 2,
  },
  barColTouchable: {
    flex: 1,
    alignItems: 'center',
  },
  barTopValSlot: {
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
  },
  barTopValText: {
    fontSize: 9,
    fontWeight: '700',
  },
  barTrack: {
    width: 14,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
  },
  stackedBarWrap: {
    width: 14,
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  emptyBarPip: {
    width: 14,
    height: 3,
    borderRadius: 1.5,
  },
  avgBarDivider: {
    width: 1,
    height: BAR_MAX_HEIGHT,
    marginHorizontal: 4,
    marginBottom: 24,
  },
  barDayLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  barDateSub: {
    fontSize: 9,
    fontWeight: '600',
  },
  // Macro Rows & Progress Track
  macroRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroNameText: {
    fontSize: 13,
    fontWeight: '700',
  },
  macroPctBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 2,
  },
  macroGramsText: {
    fontSize: 13,
    fontWeight: '700',
  },
  macroProgressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  macroProgressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  macroProgressBarExcess: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  // Detail Card
  detailCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    gap: 14,
    marginTop: 14,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  detailSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  detailTotalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  detailTotalText: {
    fontSize: 16,
    fontWeight: '800',
  },
  categoryPillsGrid: {
    gap: 8,
  },
  categoryPillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  categoryPillName: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryPillCals: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryPillPct: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Projection Card
  projectionInsightCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 14,
  },
  projectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  projectionBody: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 10,
  },
  projectionStatRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  projectionHighlight: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  projectionSubHighlight: {
    fontSize: 12,
    fontWeight: '600',
  },
});
