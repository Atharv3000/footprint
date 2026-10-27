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
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';
import { CameraFormTrackerModal } from '@/components/CameraFormTrackerModal';
import { AppleHealthSyncModal } from '@/components/AppleHealthSyncModal';
import { ProgressPhotoGalleryModal } from '@/components/ProgressPhotoGalleryModal';
import {
  DEFAULT_EXERCISES,
  CORE_FEATURED_EXERCISE_IDS,
  WorkoutLogEntry,
  ProgressPhoto,
  saveWorkoutLog,
  loadWorkoutLogs,
  loadVisibleExerciseIds,
  saveVisibleExerciseIds,
  loadProgressPhotos,
  deleteProgressPhoto,
  updateProgressPhoto,
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
    distance: false,
    weight: true,
    history: false,
  });

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
  const [showVisibilityModal, setShowVisibilityModal] = useState<boolean>(false);
  const [showAiCameraModal, setShowAiCameraModal] = useState<boolean>(false);
  const [showAppleHealthModal, setShowAppleHealthModal] = useState<boolean>(false);
  const [showDirectGalleryModal, setShowDirectGalleryModal] = useState<boolean>(false);
  const [activityPhotos, setActivityPhotos] = useState<ProgressPhoto[]>([]);
  const [galleryActivePhotoId, setGalleryActivePhotoId] = useState<string | undefined>(undefined);
  const [weightSummary, setWeightSummary] = useState<{ changeStr: string; changeVal: number; isLoss: boolean }>({
    changeStr: '0.0',
    changeVal: 0,
    isLoss: false,
  });

  const triggerTakePhotoRef = React.useRef<(() => void) | null>(null);
  const triggerCapturePhotoRef = React.useRef<(() => void) | null>(null);
  const triggerUploadPhotoRef = React.useRef<(() => void) | null>(null);
  const triggerOpenGalleryRef = React.useRef<((photoId?: string) => void) | null>(null);

  const distanceUnit: 'mi' | 'km' = unitSystem === 'us_customary' ? 'mi' : 'km';
  const effectiveDistanceGoal = unitSystem === 'us_customary'
    ? +(distanceGoalKm * 0.621371).toFixed(1)
    : distanceGoalKm;

  const loadData = useCallback(async () => {
    try {
      const [logs, ids, todayData, curWeekData, prevWeekData, allWalks, photos, weightLogs] = await Promise.all([
        loadWorkoutLogs(userId),
        loadVisibleExerciseIds(userId),
        loadDaySteps(userId, dateString(0)),
        loadWeekSteps(userId, getWeekDates(0)),
        loadWeekSteps(userId, getWeekDates(-1)),
        loadWalks(userId),
        loadProgressPhotos(userId),
        loadWeightLogs(userId),
      ]);

      setWorkoutLogs(logs);
      setVisibleExerciseIds(ids);
      setWalksCount(allWalks.length);
      setActivityPhotos(photos);

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

  const handleToggleExerciseVisibility = async (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    const nextIds = visibleExerciseIds.includes(id)
      ? visibleExerciseIds.filter((item) => item !== id)
      : [...visibleExerciseIds, id];

    if (nextIds.length === 0) return;
    setVisibleExerciseIds(nextIds);
    await saveVisibleExerciseIds(userId, nextIds);
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
      {/* Action Buttons Row: Photos, Health Sync, Filter */}
      <View style={styles.topActionsRow}>
        <TouchableOpacity
          style={[
            styles.filterIconButton,
            {
              backgroundColor: isDark ? '#1a1a20' : '#f0f0f5',
              borderColor: isDark ? '#2e2e38' : '#e0e0ea',
            },
          ]}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            if (triggerTakePhotoRef.current) triggerTakePhotoRef.current();
          }}
        >
          <Ionicons name="camera-outline" size={17} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterIconButton,
            {
              backgroundColor: colors.primary + '18',
              borderColor: colors.primary + '40',
            },
          ]}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            loadProgressPhotos(userId).then((photos) => {
              setActivityPhotos(photos);
              setGalleryActivePhotoId(photos[0]?.id);
              setShowDirectGalleryModal(true);
            });
          }}
        >
          <Ionicons name="images" size={16} color={colors.primary} />
          <Text style={[styles.filterBtnText, { color: colors.primary }]}>Photos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterIconButton,
            {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#fee2e2',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#fca5a5',
            },
          ]}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setShowAppleHealthModal(true);
          }}
        >
          <Ionicons name="heart" size={16} color="#ef4444" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterIconButton,
            {
              backgroundColor: isDark ? '#1a1a20' : '#f0f0f5',
              borderColor: isDark ? '#2e2e38' : '#e0e0ea',
            },
          ]}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setShowVisibilityModal(true);
          }}
        >
          <Ionicons name="options-outline" size={17} color={colors.text} />
          <Text style={[styles.filterBtnText, { color: colors.text }]}>Filter</Text>
        </TouchableOpacity>
      </View>

      {/* Mini Streak Calendar */}
      <ActivityStreakCalendar
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
        onTakePhotoRef={(fn) => {
          triggerTakePhotoRef.current = fn;
        }}
        onCapturePhotoRef={(fn) => {
          triggerCapturePhotoRef.current = fn;
        }}
        onUploadPhotoRef={(fn) => {
          triggerUploadPhotoRef.current = fn;
        }}
        onOpenGalleryRef={(fn) => {
          triggerOpenGalleryRef.current = fn;
        }}
        onPhotoAdded={async () => {
          const updated = await loadProgressPhotos(userId);
          setActivityPhotos(updated);
        }}
        onOpenGallery={(photoId) => {
          loadProgressPhotos(userId).then((photos) => {
            setActivityPhotos(photos);
            setGalleryActivePhotoId(photoId || photos[0]?.id);
            setShowDirectGalleryModal(true);
          });
        }}
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
        {/* 1. STEPS STRIP */}
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
            onPress={() => toggleSection('steps')}
          >
            <View style={styles.stripHeaderLeft}>
              <Ionicons name="footsteps" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.stripTitle, { color: colors.text }]}>steps</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Text style={{ fontSize: 9.5, color: colors.textMuted }}>
                    {stepsSummary.weekChangePct >= 0 ? '▲' : '▼'}
                  </Text>
                  <Text style={[styles.stripSubtitle, { color: colors.textMuted }]}>
                    {stepsSummary.weekChangePct >= 0 ? `+${stepsSummary.weekChangePct}%` : `${stepsSummary.weekChangePct}%`} vs last week
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.stripHeaderRight}>
              <View style={[styles.measurementBoxFilled, { backgroundColor: colors.primary }]}>
                <Text style={[styles.measurementValueTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}>
                  {stepsSummary.today.toLocaleString()}
                  <Text style={[styles.measurementUnitTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}> steps</Text>
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {expandedSections.steps && (
            <View style={[styles.expandedContentWrap, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb' }]}>
              <WeeklyBarChart
                userId={userId}
                stepsGoal={stepsGoal}
                distanceGoal={effectiveDistanceGoal}
                metricMode="steps"
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
                  metricMode="steps"
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
                  metricMode="steps"
                  distanceUnit={distanceUnit}
                  selectedDate={activeDate}
                />
              </View>
            </View>
          )}
        </View>

        {/* 2. DISTANCE STRIP */}
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
            onPress={() => toggleSection('distance')}
          >
            <View style={styles.stripHeaderLeft}>
              <Ionicons name="navigate" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.stripTitle, { color: colors.text }]}>distance</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Text style={{ fontSize: 9.5, color: colors.textMuted }}>
                    {distanceSummary.weekChangePct >= 0 ? '▲' : '▼'}
                  </Text>
                  <Text style={[styles.stripSubtitle, { color: colors.textMuted }]}>
                    {distanceSummary.weekChangePct >= 0 ? `+${distanceSummary.weekChangePct}%` : `${distanceSummary.weekChangePct}%`} vs last week
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.stripHeaderRight}>
              <View style={[styles.measurementBoxFilled, { backgroundColor: colors.primary }]}>
                <Text style={[styles.measurementValueTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}>
                  {distanceSummary.today}
                  <Text style={[styles.measurementUnitTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}> {distanceUnit}</Text>
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {expandedSections.distance && (
            <View style={[styles.expandedContentWrap, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb' }]}>
              <WeeklyBarChart
                userId={userId}
                stepsGoal={stepsGoal}
                distanceGoal={effectiveDistanceGoal}
                metricMode="distance"
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
                  metricMode="distance"
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
                  metricMode="distance"
                  distanceUnit={distanceUnit}
                  selectedDate={activeDate}
                />
              </View>
            </View>
          )}
        </View>

        {/* 2.5 BODY WEIGHT STRIP */}
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
            onPress={() => toggleSection('weight')}
          >
            <View style={styles.stripHeaderLeft}>
              <Ionicons name="scale-outline" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.stripTitle, { color: colors.text }]}>body weight</Text>
                <Text style={[styles.stripSubtitle, { color: colors.textMuted }]}>
                  {weightSummary.changeStr}
                </Text>
              </View>
            </View>

            <View style={styles.stripHeaderRight}>
              <View style={[styles.measurementBoxFilled, { backgroundColor: colors.primary }]}>
                <Text style={[styles.measurementValueTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}>
                  {profile.weightKg
                    ? unitSystem === 'us_customary'
                      ? Math.round(profile.weightKg * 2.20462)
                      : Math.round(profile.weightKg * 10) / 10
                    : '--'}
                  <Text style={[styles.measurementUnitTextFilled, { color: isDark ? '#09090b' : '#ffffff' }]}>
                    {unitSystem === 'us_customary' ? ' lb' : ' kg'}
                  </Text>
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {expandedSections.weight && (
            <View style={[styles.expandedContentWrap, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb' }]}>
              <WeightLineChart
                userId={userId}
                unitSystem={unitSystem}
                currentWeightKg={profile.weightKg}
              />
            </View>
          )}
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
                <Text style={[styles.stripTitle, { color: colors.text }]}>history</Text>
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

        {/* 4+. WORKOUT EXERCISE STRIPS */}
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
                                    AI CAMERA · {set.trackingData?.averageFormScore ? `${set.trackingData.averageFormScore}%` : 'VERIFIED'}
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
      </View>

      {/* Select Workouts to Show Modal */}
      <InteractiveBottomModal
        visible={showVisibilityModal}
        onDismiss={() => setShowVisibilityModal(false)}
        handleColor={colors.border}
        cardStyle={[styles.modalSheetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.modalContent}>
          <Text style={[styles.modalHeading, { color: colors.text }]}>Visible Workouts</Text>
          <Text style={[styles.modalDesc, { color: colors.textMuted }]}>
            Choose which exercises appear in your workout logs and activity feed:
          </Text>
          <View style={styles.modalScroll}>
            {DEFAULT_EXERCISES.slice(0, 40).map((ex) => {
              const isChecked = visibleExerciseIds.includes(ex.id);
              return (
                <TouchableOpacity
                  key={ex.id}
                  style={[
                    styles.modalExerciseItem,
                    {
                      backgroundColor: isDark ? '#1c1c22' : '#f7f7fa',
                      borderColor: isChecked ? colors.tint : isDark ? '#2c2c34' : '#e4e4eb',
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleToggleExerciseVisibility(ex.id)}
                >
                  <View style={styles.modalExerciseInfo}>
                    <Text style={[styles.modalExerciseName, { color: colors.text }]}>
                      {ex.name}
                    </Text>
                    <Text style={[styles.modalExerciseCategory, { color: colors.textMuted }]}>
                      {ex.category.toUpperCase()} · default {ex.defaultWeight} lbs
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkboxWrap,
                      {
                        backgroundColor: isChecked ? colors.tint : 'transparent',
                        borderColor: isChecked ? colors.tint : isDark ? '#555' : '#bbb',
                      },
                    ]}
                  >
                    {isChecked && <Ionicons name="checkmark" size={16} color="#ffffff" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </InteractiveBottomModal>

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
              notes: `AI Form Score: ${trackingData.averageFormScore}%`,
              aiTracked: true,
              trackingData,
            });

            setExpandedSections((prev) => ({ ...prev, [meta.id]: true }));
            loadData();
          } catch (e) {
            console.warn('Failed to save AI tracked workout', e);
          }
        }}
      />

      {/* Apple Health Sync Modal */}
      <AppleHealthSyncModal
        visible={showAppleHealthModal}
        onClose={() => setShowAppleHealthModal(false)}
        userId={userId}
        onSyncCompleted={() => {
          setRefreshKey((k) => k + 1);
          loadData();
        }}
      />

      {/* Progress Photo Gallery Modal */}
      <ProgressPhotoGalleryModal
        visible={showDirectGalleryModal}
        onClose={() => setShowDirectGalleryModal(false)}
        photos={activityPhotos}
        initialPhotoId={galleryActivePhotoId}
        onDeletePhoto={async (photoId) => {
          await deleteProgressPhoto(userId, photoId);
          const updated = await loadProgressPhotos(userId);
          setActivityPhotos(updated);
          setRefreshKey((k) => k + 1);
        }}
        onUpdatePhoto={async (photoId, updates) => {
          await updateProgressPhoto(userId, photoId, updates);
          const updated = await loadProgressPhotos(userId);
          setActivityPhotos(updated);
          setRefreshKey((k) => k + 1);
        }}
        onUploadNewPhoto={() => {
          setShowDirectGalleryModal(false);
          if (triggerUploadPhotoRef.current) {
            triggerUploadPhotoRef.current();
          } else if (triggerTakePhotoRef.current) {
            triggerTakePhotoRef.current();
          }
        }}
        onCaptureNewPhoto={() => {
          setShowDirectGalleryModal(false);
          if (triggerCapturePhotoRef.current) {
            triggerCapturePhotoRef.current();
          } else if (triggerTakePhotoRef.current) {
            triggerTakePhotoRef.current();
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
    justifyContent: 'flex-end',
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
  checkboxWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
