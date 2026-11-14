import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/constants/AuthContext';
import { useTheme } from '@/constants/ThemeContext';
import { ActivityStreakCalendar } from '@/components/ActivityStreakCalendar';
import {
  WeeklyBarChart,
  HourlyBarChart,
  CumulativeLineChart,
} from '@/components/StepsCharts';
import { WalkHistorySection } from '@/components/WalkHistorySection';
import { WeightLineChart } from '@/components/WeightLineChart';
import { StickmanWorkoutIcon } from '@/components/StickmanWorkoutIcon';
import { CameraFormTrackerModal } from '@/components/CameraFormTrackerModal';
import {
  DEFAULT_EXERCISES,
  CORE_FEATURED_EXERCISE_IDS,
  WorkoutLogEntry,
  saveWorkoutLog,
  loadWorkoutLogs,
  loadVisibleExerciseIds,
  loadWeightLogs,
} from '@/constants/workoutStorage';
import { loadDaySteps, loadWeekSteps, getWeekDates, dateString } from '@/constants/stepsStorage';
import { loadWalks } from '@/constants/walkStorage';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ProfileActivitySectionProps {
  userId?: string;
  stepsGoal: number;
  distanceGoalKm: number;
  unitSystem: 'us_customary' | 'metric';
}

export const ProfileActivitySection: React.FC<ProfileActivitySectionProps> = ({
  userId = 'guest_user',
  stepsGoal,
  distanceGoalKm,
  unitSystem,
}) => {
  const { profile } = useAuth();
  const { colors, isDark } = useTheme();

  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Accordion expansion states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    steps: false,
    weight: false,
    history: false,
    exercises: false,
  });

  const [movementMetric, setMovementMetric] = useState<'steps' | 'distance'>('steps');
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [stepsSummary, setStepsSummary] = useState<{ today: number; weekChangePct: number }>({
    today: 0,
    weekChangePct: 0,
  });
  const [distanceSummary, setDistanceSummary] = useState<{ today: number; weekChangePct: number }>({
    today: 0,
    weekChangePct: 0,
  });
  const [walksCount, setWalksCount] = useState<number>(0);

  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLogEntry[]>([]);
  const [visibleExerciseIds, setVisibleExerciseIds] = useState<string[]>(CORE_FEATURED_EXERCISE_IDS);
  const [showAiCameraModal, setShowAiCameraModal] = useState<boolean>(false);
  const [weightSummary, setWeightSummary] = useState<{ changeStr: string; changeVal: number; isLoss: boolean }>({
    changeStr: '0.0',
    changeVal: 0,
    isLoss: false,
  });

  // Calculate live Body Mass Index (BMI)
  const bmiData = useMemo(() => {
    const weightKg = profile.weightKg || 70;
    const heightCm = profile.heightCm || 175;
    if (weightKg <= 0 || heightCm <= 0) {
      return { val: 0, str: "--", category: "Unknown", color: "#9ca3af" };
    }
    const heightM = heightCm / 100;
    const bmiVal = weightKg / (heightM * heightM);
    const rounded = Math.round(bmiVal * 10) / 10;
    
    let category = "Normal";
    let color = "#10b981";
    if (rounded < 18.5) {
      category = "Underweight";
      color = "#38bdf8";
    } else if (rounded < 25.0) {
      category = "Normal";
      color = "#10b981";
    } else if (rounded < 30.0) {
      category = "Overweight";
      color = "#f59e0b";
    } else {
      category = "Obese";
      color = "#ef4444";
    }

    return { val: rounded, str: rounded.toFixed(1), category, color };
  }, [profile.weightKg, profile.heightCm]);


  const distanceUnit: 'mi' | 'km' = unitSystem === 'us_customary' ? 'mi' : 'km';
  const effectiveDistanceGoal = unitSystem === 'us_customary'
    ? +(distanceGoalKm * 0.621371).toFixed(1)
    : distanceGoalKm;

  const loadData = useCallback(async () => {
    try {
      const [logs, ids, todayData, curWeekData, prevWeekData, allWalks, weightLogs] = await Promise.all([
        loadWorkoutLogs(userId),
        loadVisibleExerciseIds(userId),
        loadDaySteps(userId, dateString(0)),
        loadWeekSteps(userId, getWeekDates(0)),
        loadWeekSteps(userId, getWeekDates(-1)),
        loadWalks(userId),
        loadWeightLogs(userId),
      ]);

      setWorkoutLogs(logs);
      setVisibleExerciseIds(ids);
      setWalksCount(allWalks.length);

      if (weightLogs && weightLogs.length >= 2) {
        const firstEntry = weightLogs[0];
        const latestEntry = weightLogs[weightLogs.length - 1];
        const diffKg = latestEntry.weightKg - firstEntry.weightKg;
        const isUS = unitSystem === 'us_customary';
        const displayDiff = isUS ? diffKg * 2.20462 : diffKg;
        const sign = displayDiff > 0 ? '+' : '';
        const unit = isUS ? 'lb' : 'kg';
        setWeightSummary({
          changeStr: `${sign}${displayDiff.toFixed(1)} ${unit} overall`,
          changeVal: displayDiff,
          isLoss: displayDiff < 0,
        });
      } else {
        const unit = unitSystem === 'us_customary' ? 'lb' : 'kg';
        setWeightSummary({
          changeStr: `0.0 ${unit} overall`,
          changeVal: 0,
          isLoss: false,
        });
      }

      const curStepsTotal = curWeekData.reduce((acc, d) => acc + (d.totalSteps || 0), 0);
      const prevStepsTotal = prevWeekData.reduce((acc, d) => acc + (d.totalSteps || 0), 0);
      const stepsPct = prevStepsTotal > 0
        ? Math.round(((curStepsTotal - prevStepsTotal) / prevStepsTotal) * 100)
        : 8;

      const todaySteps = todayData?.totalSteps ?? (curWeekData[curWeekData.length - 1]?.totalSteps || 6420);
      setStepsSummary({
        today: todaySteps,
        weekChangePct: stepsPct,
      });

      const stepsToDist = (st: number) => (unitSystem === 'us_customary' ? st * 0.00045 : st * 0.00072);
      const curDistTotal = stepsToDist(curStepsTotal);
      const prevDistTotal = stepsToDist(prevStepsTotal);
      const distPct = prevDistTotal > 0
        ? Math.round(((curDistTotal - prevDistTotal) / prevDistTotal) * 100)
        : stepsPct;

      setDistanceSummary({
        today: +stepsToDist(todaySteps).toFixed(2),
        weekChangePct: distPct,
      });
    } catch (e) {
      console.warn('Error loading activity data in profile', e);
    }
  }, [userId, unitSystem]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSection = (sectionId: string) => {
    Haptics.selectionAsync().catch(() => {});
    LayoutAnimation.configureNext({
      duration: 380,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const logsByExercise = useMemo(() => {
    const map: Record<string, WorkoutLogEntry[]> = {};
    for (const log of workoutLogs) {
      if (!visibleExerciseIds.includes(log.exerciseId)) continue;
      if (selectedCalendarDate) {
        const logDateKey = log.date.split('T')[0];
        if (logDateKey !== selectedCalendarDate) continue;
      }
      if (!map[log.exerciseId]) {
        map[log.exerciseId] = [];
      }
      map[log.exerciseId].push(log);
    }
    return map;
  }, [workoutLogs, visibleExerciseIds, selectedCalendarDate]);

  const orderedExerciseDefinitions = useMemo(() => {
    const squatDef = DEFAULT_EXERCISES.find((e) => e.id === 'squats');
    const otherDefs = DEFAULT_EXERCISES.filter((e) => e.id !== 'squats');
    const fullList = squatDef ? [squatDef, ...otherDefs] : DEFAULT_EXERCISES;
    return fullList.filter((e) => visibleExerciseIds.includes(e.id));
  }, [visibleExerciseIds]);

  const activeDate = selectedCalendarDate || dateString(0);

  return (
    <View style={styles.container}>
      {/* Mini Streak Calendar */}
      <ActivityStreakCalendar
        showPhotos={false}
        key={`cal_${refreshKey}`}
        userId={userId}
        stepsGoal={stepsGoal}
        distanceGoalKm={distanceGoalKm}
        unitSystem={unitSystem}
        selectedDate={selectedCalendarDate}
        onSelectDate={(d) => {
          setSelectedCalendarDate(d === selectedCalendarDate ? undefined : d);
        }}
        onOpenAiCamera={() => setShowAiCameraModal(true)}

      />

      {selectedCalendarDate && (
        <View style={styles.dateFilterNoticeRow}>
          <Text style={[styles.dateFilterNoticeText, { color: colors.textMuted }]}>
            Showing items for {selectedCalendarDate}
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedCalendarDate(undefined)}
            style={[styles.clearFilterBadge, { backgroundColor: colors.tint + '18' }]}
          >
            <Text style={[styles.clearFilterText, { color: colors.tint }]}>Show All</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Full Vertical Expandable Strips */}
      <View
        style={[
          styles.verticalStripsContainer,
          {
            borderTopColor: isDark ? '#27272f' : '#e4e4eb',
            borderBottomColor: isDark ? '#27272f' : '#e4e4eb',
            backgroundColor: isDark ? '#141417' : '#ffffff',
          },
        ]}
      >
        <View style={[styles.stripRowWrapper, { borderBottomColor: isDark ? '#222228' : '#ededf2', backgroundColor: isDark ? '#141417' : '#ffffff' }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Steps and distance" accessibilityState={{ expanded: !!expandedSections.steps }} style={styles.stripHeaderTouchable} activeOpacity={0.7} onPress={() => toggleSection('steps')}>
            <View style={styles.stripHeaderLeft}>
              <Ionicons name="footsteps" size={20} color={colors.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.stripTitle, { color: colors.text, textTransform: 'none' }]}>Movement</Text>
                <Text style={[styles.stripSubtitle, { color: colors.textMuted }]}>{stepsSummary.today.toLocaleString()} steps | {distanceSummary.today} {distanceUnit} today</Text>
              </View>
            </View>
            <Ionicons name={expandedSections.steps ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {expandedSections.steps && <View style={[styles.expandedContentWrap, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb' }]}>
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 18, backgroundColor: colors.surfaceElevated, gap: 4, marginBottom: 12 }}>
              {(['steps','distance'] as const).map(metric => <TouchableOpacity key={metric} accessibilityRole="tab" accessibilityState={{ selected: movementMetric === metric }} onPress={() => { setMovementMetric(metric); Haptics.selectionAsync().catch(() => {}); }} style={{ flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: movementMetric === metric ? colors.primaryBg : 'transparent' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: movementMetric === metric ? colors.primary : colors.textMuted }}>{metric === 'steps' ? 'Steps' : 'Distance'}</Text>
              </TouchableOpacity>)}
            </View>
            <Text style={[styles.stripSubtitle, { color: colors.textMuted, marginBottom: 12 }]}>{movementMetric === 'steps' ? stepsSummary.weekChangePct : distanceSummary.weekChangePct}% vs last week</Text>
              <WeeklyBarChart
                userId={userId}
                stepsGoal={stepsGoal}
                distanceGoal={effectiveDistanceGoal}
                metricMode={movementMetric}
                distanceUnit={distanceUnit}
                weekOffset={weekOffset}
                onWeekOffsetChange={setWeekOffset}
                selectedDate={activeDate}
                onDaySelect={(d) => setSelectedCalendarDate(d)}
              />
              <View style={{ marginTop: 14 }}>
                <HourlyBarChart
                  userId={userId}
                  stepsGoal={stepsGoal}
                  distanceGoal={effectiveDistanceGoal}
                  metricMode={movementMetric}
                  distanceUnit={distanceUnit}
                  selectedDate={activeDate}
                  onDayChange={(d) => setSelectedCalendarDate(d)}
                />
              </View>
              <View style={{ marginTop: 14 }}>
                <CumulativeLineChart
                  userId={userId}
                  stepsGoal={stepsGoal}
                  distanceGoal={effectiveDistanceGoal}
                  metricMode={movementMetric}
                  distanceUnit={distanceUnit}
                  selectedDate={activeDate}
                />
              </View>
          </View>}
        </View>

        <View style={[styles.stripRowWrapper, { borderBottomColor: isDark ? '#222228' : '#ededf2', backgroundColor: isDark ? '#141417' : '#ffffff' }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Body weight and BMI" accessibilityState={{ expanded: !!expandedSections.weight }} style={styles.stripHeaderTouchable} activeOpacity={0.7} onPress={() => toggleSection('weight')}>
            <View style={styles.stripHeaderLeft}>
              <Ionicons name="scale-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.stripTitle, { color: colors.text, textTransform: 'none' }]}>Body Stats</Text>
                <Text style={[styles.stripSubtitle, { color: colors.textMuted }]}>{profile.weightKg ? unitSystem === 'us_customary' ? Math.round(profile.weightKg * 2.20462) : Math.round(profile.weightKg * 10) / 10 : '--'} {unitSystem === 'us_customary' ? 'lb' : 'kg'} | BMI {bmiData.str}</Text>
              </View>
            </View>
            <Ionicons name={expandedSections.weight ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {expandedSections.weight && <View style={[styles.expandedContentWrap, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb', gap: 16 }]}>
            <Text style={[styles.stripSubtitle, { color: colors.textMuted }]}>{weightSummary.changeStr}</Text>
            <WeightLineChart userId={userId} unitSystem={unitSystem} currentWeightKg={profile.weightKg} />
              <View style={styles.bmiGaugeContainer}>
                <View style={styles.bmiGaugeHeader}>
                  <Text style={[styles.bmiGaugeScoreText, { color: colors.text }]}>
                    {bmiData.str} <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: "600" }}>BMI</Text>
                  </Text>
                  <View style={[styles.bmiCategoryBadge, { backgroundColor: bmiData.color + "22" }]}>
                    <Text style={[styles.bmiCategoryBadgeText, { color: bmiData.color }]}>
                      {bmiData.category.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.bmiBarTrack}>
                  <View style={[styles.bmiBarSegment, { flex: 18.5, backgroundColor: "#38bdf8" }]} />
                  <View style={[styles.bmiBarSegment, { flex: 6.4, backgroundColor: "#10b981" }]} />
                  <View style={[styles.bmiBarSegment, { flex: 5, backgroundColor: "#f59e0b" }]} />
                  <View style={[styles.bmiBarSegment, { flex: 10.1, backgroundColor: "#ef4444" }]} />
                </View>

                <View style={styles.bmiRangeLabelsRow}>
                  <Text style={[styles.bmiRangeLabelText, { color: colors.textMuted }]}>18.5</Text>
                  <Text style={[styles.bmiRangeLabelText, { color: colors.textMuted }]}>25.0</Text>
                  <Text style={[styles.bmiRangeLabelText, { color: colors.textMuted }]}>30.0</Text>
                </View>

                <View style={styles.bmiInfoRow}>
                  <View style={[styles.bmiStatCard, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#ffffff" }]}>
                    <Text style={[styles.bmiStatCardLabel, { color: colors.textMuted }]}>Height</Text>
                    <Text style={[styles.bmiStatCardValue, { color: colors.text }]}>
                      {unitSystem === "us_customary"
                        ? `${Math.floor((profile.heightCm || 175) / 30.48)}'${Math.round(((profile.heightCm || 175) % 30.48) / 2.54)}"`
                        : `${Math.round(profile.heightCm || 175)} cm`}
                    </Text>
                  </View>
                  <View style={[styles.bmiStatCard, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#ffffff" }]}>
                    <Text style={[styles.bmiStatCardLabel, { color: colors.textMuted }]}>Weight</Text>
                    <Text style={[styles.bmiStatCardValue, { color: colors.text }]}>
                      {unitSystem === "us_customary"
                        ? `${Math.round((profile.weightKg || 70) * 2.20462)} lb`
                        : `${Math.round(profile.weightKg || 70)} kg`}
                    </Text>
                  </View>
                  <View style={[styles.bmiStatCard, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#ffffff" }]}>
                    <Text style={[styles.bmiStatCardLabel, { color: colors.textMuted }]}>Healthy Target</Text>
                    <Text style={[styles.bmiStatCardValue, { color: "#10b981" }]}>
                      18.5 – 24.9
                    </Text>
                  </View>
                </View>
              </View>
          </View>}
        </View>

        {/* 3. HISTORY STRIP */}
        <View
          style={[
            styles.stripRowWrapper,
            {
              borderBottomColor: isDark ? '#222228' : '#ededf2',
              backgroundColor: isDark ? '#141417' : '#ffffff',
            },
          ]}
        >
          <TouchableOpacity
            style={styles.stripHeaderTouchable}
            activeOpacity={0.7}
            onPress={() => toggleSection('history')}
          >
            <View style={styles.stripHeaderLeft}>
              <Ionicons name="time" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.stripTitle, { color: colors.text, textTransform: 'none' }]}>History</Text>
                <Text style={[styles.stripSubtitle, { color: colors.textMuted }]}>
                  {walksCount} routes & GPS walks recorded
                </Text>
              </View>
            </View>

            <View style={styles.stripHeaderRight}>
              <View style={[styles.measurementBoxFilled, { backgroundColor: colors.primary }]}>
                <Text style={[styles.measurementValueTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}>
                  {walksCount}
                  <Text style={[styles.measurementUnitTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}> walks</Text>
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {expandedSections.history && (
            <View style={[styles.expandedContentWrap, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb' }]}>
              <WalkHistorySection
                userId={userId}
                unitSystem={unitSystem}
              />
            </View>
          )}
        </View>

        <View style={{ backgroundColor: isDark ? '#141417' : '#ffffff' }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Exercises" accessibilityState={{ expanded: !!expandedSections.exercises }}
            style={styles.stripHeaderTouchable} activeOpacity={0.7} onPress={() => toggleSection('exercises')}>
            <View style={styles.stripHeaderLeft}>
              <Ionicons name="barbell-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.stripTitle, { color: colors.text, textTransform: 'none' }]}>Exercises</Text>
                <Text numberOfLines={1} style={[styles.stripSubtitle, { color: colors.textMuted }]}>{orderedExerciseDefinitions.length} exercises | {Object.values(logsByExercise).reduce((total, logs) => total + logs.length, 0)} logged sets</Text>
              </View>
            </View>
            <Ionicons name={expandedSections.exercises ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {expandedSections.exercises && <View style={{ borderTopWidth: 1, borderTopColor: isDark ? '#222228' : '#ededf2' }}>
        {/* Individual exercise progress and history */}
        {orderedExerciseDefinitions.map((ex, exIndex) => {
          const logsForEx = logsByExercise[ex.id] || [];
          const hasLogs = logsForEx.length > 0;
          const latestLog = logsForEx[0];
          const maxWeight = hasLogs
            ? logsForEx.reduce((acc, curr) => Math.max(acc, curr.weight), latestLog?.weight || ex.defaultWeight)
            : (unitSystem === 'metric' ? Math.round(ex.defaultWeight * 0.453592) : ex.defaultWeight);
          const activeUnit = latestLog?.weightUnit || (unitSystem === 'metric' ? 'kg' : 'lb');
          const isExpanded = !!expandedSections[ex.id];
          const isLast = exIndex === orderedExerciseDefinitions.length - 1;

          return (
            <View
              key={ex.id}
              style={[
                styles.stripRowWrapper,
                {
                  borderBottomColor: isDark ? '#222228' : '#ededf2',
                  borderBottomWidth: isLast && !isExpanded ? 0 : 1,
                  backgroundColor: isDark ? '#141417' : '#ffffff',
                  opacity: hasLogs ? 1 : (isDark ? 0.38 : 0.46),
                },
              ]}
            >
              <TouchableOpacity
                style={styles.stripHeaderTouchable}
                activeOpacity={0.7}
                onPress={() => toggleSection(ex.id)}
              >
                <View style={styles.stripHeaderLeft}>
                  <StickmanWorkoutIcon
                    exerciseId={ex.id}
                    size={20}
                    color={hasLogs ? colors.primary : (isDark ? '#71717a' : '#a1a1aa')}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.stripTitle,
                        { color: hasLogs ? colors.text : colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {ex.name.toLowerCase()}
                    </Text>
                    <Text style={[styles.stripSubtitle, { color: colors.textMuted }]}>
                      {hasLogs
                        ? `${logsForEx.length} logged set${logsForEx.length > 1 ? 's' : ''} · peak ${maxWeight} ${activeUnit}`
                        : `No sets logged yet · ${ex.category}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.stripHeaderRight}>
                  {hasLogs ? (
                    <View style={[styles.measurementBoxFilled, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.measurementValueTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}>
                        {maxWeight}
                        <Text style={[styles.measurementUnitTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}> {activeUnit}</Text>
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.measurementBoxFilled,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                          borderColor: isDark ? '#27272f' : '#e4e4eb',
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text style={[styles.measurementValueTextFilled, { color: colors.textMuted, fontSize: 12 }]}>
                        --
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={[styles.expandedContentWrap, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb' }]}>
                  {logsForEx.length === 0 ? (
                    <View style={styles.emptyExerciseWrap}>
                      <Text style={[styles.emptyExerciseText, { color: colors.textMuted }]}>
                        No logged sets yet for {ex.name}. Head to the Log tab to record your sets!
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.setRowsList}>
                      <Text style={[styles.historySubheader, { color: colors.textMuted }]}>
                        Recorded Sets & History
                      </Text>
                      {logsForEx.map((set, idx) => (
                        <View
                          key={set.id}
                          style={[
                            styles.setDetailRow,
                            {
                              backgroundColor: set.aiTracked
                                ? (isDark ? '#082f49' : '#e0f2fe')
                                : (isDark ? '#1a1a20' : '#ffffff'),
                              borderColor: set.aiTracked
                                ? '#0284c7'
                                : (isDark ? '#282832' : '#ececf2'),
                              borderWidth: set.aiTracked ? 1.5 : 1,
                            },
                          ]}
                        >
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={[styles.setNumberLabel, { color: colors.text }]}>
                                Set {logsForEx.length - idx}
                              </Text>
                              {set.aiTracked && (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: '#0284c7',
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 6,
                                    gap: 3,
                                  }}
                                >
                                  <Ionicons name="scan" size={11} color="#ffffff" />
                                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#ffffff' }}>
                                    AI CAMERA · {set.trackingData?.averageFormScore ? `${set.trackingData.averageFormScore}%` : 'REPS ONLY'}
                                  </Text>
                                </View>
                              )}
                            </View>

                            <Text style={[styles.setTimeLabel, { color: colors.textMuted }]}>
                              {new Date(set.date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              · {new Date(set.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>

                            {set.notes ? (
                              <Text style={[styles.setNotesLabel, { color: set.aiTracked ? (isDark ? '#bae6fd' : '#0369a1') : colors.textMuted }]}>
                                "{set.notes}"
                              </Text>
                            ) : null}

                            {set.trackingData?.formAdvice && set.trackingData.formAdvice.length > 0 && (
                              <View
                                style={{
                                  marginTop: 4,
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderRadius: 6,
                                  backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.7)',
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Ionicons name="sparkles" size={12} color="#0284c7" />
                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: isDark ? '#e0f2fe' : '#0369a1',
                                    fontWeight: '600',
                                    flex: 1,
                                  }}
                                  numberOfLines={1}
                                >
                                  {set.trackingData.formAdvice[0]}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.setStatsRight}>
                            <Text style={[styles.setRepsText, { color: colors.text }]}>
                              {set.reps} reps
                            </Text>
                            <View
                              style={[
                                styles.measurementBoxFilledSmall,
                                {
                                  backgroundColor: set.aiTracked ? '#0284c7' : colors.primary,
                                },
                              ]}
                            >
                              <Text style={[styles.measurementValueTextSmallFilled, { color: '#ffffff' }]}>
                                {set.weight} {set.weightUnit}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
          </View>}
        </View>
      </View>

      {/* AI Camera Form Tracker Modal */}
      <CameraFormTrackerModal
        visible={showAiCameraModal}
        onClose={() => setShowAiCameraModal(false)}
        onSaveTrackedWorkout={async (trackingData) => {
          try {
            const exerciseMap: Record<string, { id: string; name: string }> = {
              pushups: { id: 'pushups', name: 'Standard Pushups' },
              squats: { id: 'squats', name: 'Barbell Back Squat' },
              bicep_curls: { id: 'bicep_curls', name: 'Standing Barbell Bicep Curl' },
            };
            const meta = exerciseMap[trackingData.exerciseType] || { id: 'pushups', name: 'Standard Pushups' };
            const defaultWeight = meta.id === 'pushups' ? 0 : meta.id === 'squats' ? 135 : 30;

            await saveWorkoutLog(userId, {
              exerciseId: meta.id,
              exerciseName: meta.name,
              reps: trackingData.repCount,
              weight: defaultWeight,
              weightUnit: unitSystem === 'metric' ? 'kg' : 'lb',
              notes: trackingData.averageFormScore > 0 ? `AI Form Score: ${trackingData.averageFormScore}%` : 'Camera-counted reps; form score not assessed.',
              aiTracked: true,
              trackingData,
            });

            setExpandedSections((prev) => ({ ...prev, exercises: true, [meta.id]: true }));
            loadData();
          } catch (e) {
            console.warn('Failed to save AI tracked workout', e);
          }
        }}
      />


    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingBottom: 40,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  filterIconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  filterBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  dateFilterNoticeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  dateFilterNoticeText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  clearFilterBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  verticalStripsContainer: {
    marginTop: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  stripRowWrapper: {
    borderBottomWidth: 1,
  },
  stripHeaderTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  stripHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  stripTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    textTransform: 'lowercase',
  },
  stripSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  stripHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  measurementBoxFilled: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  measurementValueTextFilled: {
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  measurementUnitTextFilled: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  measurementBoxFilledSmall: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  measurementValueTextSmallFilled: {
    fontSize: 12,
    fontWeight: '800',
  },
  expandedContentWrap: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.12)',
  },
  emptyExerciseWrap: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyExerciseText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  setRowsList: {
    gap: 8,
    marginTop: 6,
  },
  historySubheader: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  setDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  setNumberLabel: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  setTimeLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  setNotesLabel: {
    fontSize: 10.5,
    fontStyle: 'italic',
    marginTop: 2,
  },
  setStatsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setRepsText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalSheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  modalHeading: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalContent: {
    paddingBottom: 24,
  },
  modalDesc: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalScroll: {
    maxHeight: 380,
  },
  modalExerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  modalExerciseInfo: {
    flex: 1,
  },
  modalExerciseName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  modalExerciseCategory: {
    fontSize: 11,
  },
  bmiGaugeContainer: {
    paddingVertical: 10,
    gap: 12,
  },
  bmiGaugeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bmiGaugeScoreText: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  bmiCategoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  bmiCategoryBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  bmiBarTrack: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    gap: 3,
  },
  bmiBarSegment: {
    height: "100%",
    borderRadius: 2,
  },
  bmiRangeLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: -4,
  },
  bmiRangeLabelText: {
    fontSize: 11,
    fontWeight: "600",
  },
  bmiInfoRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  bmiStatCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  bmiStatCardLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 3,
  },
  bmiStatCardValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  checkboxWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
