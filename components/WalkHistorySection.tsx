import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import MapView, { Polyline, Marker } from 'react-native-maps';
import {
  WalkRecord,
  loadWalks,
  deleteWalk,
  formatWalkDate,
} from '@/constants/walkStorage';
import { metersToKm, metersToMiles } from '@/constants/userProfile';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';

type FilterType = 'all' | 'week' | 'month';
type SortOption = 'recent' | 'longest' | 'walk' | 'run' | 'cycle';

const SORT_LABELS: Record<SortOption, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  recent: { label: 'Recent', icon: 'time-outline' },
  longest: { label: 'Longest', icon: 'trending-up-outline' },
  walk: { label: 'Walk', icon: 'walk-outline' },
  run: { label: 'Run', icon: 'fitness-outline' },
  cycle: { label: 'Cycle', icon: 'bicycle-outline' },
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatTotalTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export type WorkoutGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';

export interface WorkoutEffortEvaluation {
  grade: WorkoutGrade;
  color: string;
  effortScore: number; // 0 - 100
  effortLevel: 'Maximal' | 'Hard' | 'Moderate' | 'Light' | 'Recovery';
  comparisonText: string;
  burnRateKcalPerHour: number;
}

/**
 * Evaluates the workout's relative effort & assign an A+ to F performance grade.
 * Analyzes:
 *  - Activity type (run, walk, cycle) with physiological baseline burn & speed factors
 *  - Speed/pace intensity vs historical average for that activity type
 *  - Energy expenditure rate (calories per hour) relative to standard metabolic equivalents
 *  - Distance & duration volume vs recent sessions
 */
export function evaluateWorkoutEffort(
  workout: WalkRecord,
  allWalks: WalkRecord[]
): WorkoutEffortEvaluation {
  const durationSec = Math.max(1, workout.durationSeconds);
  const durationMin = durationSec / 60;
  const distKm = (workout.distanceMeters || 0) / 1000;
  const speedKmh = distKm > 0 ? (distKm / (durationSec / 3600)) : 0;
  const burnRate = Math.round((workout.calories / durationSec) * 3600);

  // Filter previous matching activities for personal baselines
  const actType = workout.activityType || 'walk';
  const pastMatches = allWalks.filter(
    (w) => (w.activityType || 'walk') === actType && w.id !== workout.id
  );

  // Personal baselines from past performances
  let avgPastSpeed = 0;
  let avgPastDist = 0;
  let avgPastBurnRate = 0;

  if (pastMatches.length > 0) {
    const totalPastSpeed = pastMatches.reduce((acc, w) => {
      const s = (w.distanceMeters / 1000) / (Math.max(1, w.durationSeconds) / 3600);
      return acc + s;
    }, 0);
    avgPastSpeed = totalPastSpeed / pastMatches.length;

    const totalPastDist = pastMatches.reduce((acc, w) => acc + (w.distanceMeters / 1000), 0);
    avgPastDist = totalPastDist / pastMatches.length;

    const totalPastBurn = pastMatches.reduce((acc, w) => {
      return acc + (w.calories / Math.max(1, w.durationSeconds)) * 3600;
    }, 0);
    avgPastBurnRate = totalPastBurn / pastMatches.length;
  } else {
    // Activity-specific normative defaults
    if (actType === 'run') {
      avgPastSpeed = 9.2; // km/h
      avgPastDist = 5.0; // km
      avgPastBurnRate = 560; // kcal/hr
    } else if (actType === 'cycle') {
      avgPastSpeed = 19.5; // km/h
      avgPastDist = 14.0; // km
      avgPastBurnRate = 480; // kcal/hr
    } else {
      // walk
      avgPastSpeed = 4.8; // km/h
      avgPastDist = 3.2; // km
      avgPastBurnRate = 260; // kcal/hr
    }
  }

  // 1. Intensity Ratio (Pace/Speed vs personal/expected average)
  const speedRatio = avgPastSpeed > 0 ? (speedKmh / avgPastSpeed) : 1;
  // 2. Caloric Output Ratio
  const burnRatio = avgPastBurnRate > 0 ? (burnRate / avgPastBurnRate) : 1;
  // 3. Volume Ratio (distance and duration factor)
  const distRatio = avgPastDist > 0 ? (distKm / avgPastDist) : 1;
  const durationFactor = Math.min(1.25, Math.max(0.65, Math.sqrt(durationMin / 25)));

  // Relative Effort Score (0 - 100)
  // Weighted: 45% speed intensity, 35% calorie burn rate, 20% distance volume, adjusted by session duration
  const compositeRatio = (speedRatio * 0.45 + burnRatio * 0.35 + distRatio * 0.20) * durationFactor;
  const rawScore = Math.round(compositeRatio * 60);
  const effortScore = Math.min(99, Math.max(20, rawScore));

  // Determine comparison statement vs historical baseline
  const speedDiffPct = Math.round((speedRatio - 1) * 100);
  let comparisonText = '';
  if (speedDiffPct >= 8) {
    comparisonText = `${speedDiffPct}% faster than typical pace`;
  } else if (speedDiffPct <= -8) {
    comparisonText = `${Math.abs(speedDiffPct)}% below typical pace`;
  } else {
    comparisonText = `Consistent with baseline pace`;
  }

  // Grade classification matching squad scale: A+ to F
  if (effortScore >= 88) {
    return {
      grade: 'A+',
      color: '#22c55e',
      effortScore,
      effortLevel: 'Maximal',
      comparisonText,
      burnRateKcalPerHour: burnRate,
    };
  }
  if (effortScore >= 78) {
    return {
      grade: 'A',
      color: '#10b981',
      effortScore,
      effortLevel: 'Hard',
      comparisonText,
      burnRateKcalPerHour: burnRate,
    };
  }
  if (effortScore >= 68) {
    return {
      grade: 'B+',
      color: '#3b82f6',
      effortScore,
      effortLevel: 'Hard',
      comparisonText,
      burnRateKcalPerHour: burnRate,
    };
  }
  if (effortScore >= 58) {
    return {
      grade: 'B',
      color: '#6366f1',
      effortScore,
      effortLevel: 'Moderate',
      comparisonText,
      burnRateKcalPerHour: burnRate,
    };
  }
  if (effortScore >= 48) {
    return {
      grade: 'C+',
      color: '#eab308',
      effortScore,
      effortLevel: 'Moderate',
      comparisonText,
      burnRateKcalPerHour: burnRate,
    };
  }
  if (effortScore >= 38) {
    return {
      grade: 'C',
      color: '#f59e0b',
      effortScore,
      effortLevel: 'Light',
      comparisonText,
      burnRateKcalPerHour: burnRate,
    };
  }
  if (effortScore >= 28) {
    return {
      grade: 'D',
      color: '#f97316',
      effortScore,
      effortLevel: 'Recovery',
      comparisonText,
      burnRateKcalPerHour: burnRate,
    };
  }
  return {
    grade: 'F',
    color: '#ef4444',
    effortScore,
    effortLevel: 'Recovery',
    comparisonText,
    burnRateKcalPerHour: burnRate,
  };
}

function getRegionForCoordinates(points: Array<{ latitude: number; longitude: number }>) {
  if (!points || points.length === 0) {
    return {
      latitude: 37.33182,
      longitude: -122.03118,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    };
  }

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  for (let i = 1; i < points.length; i++) {
    minLat = Math.min(minLat, points[i].latitude);
    maxLat = Math.max(maxLat, points[i].latitude);
    minLng = Math.min(minLng, points[i].longitude);
    maxLng = Math.max(maxLng, points[i].longitude);
  }

  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const deltaLat = Math.max((maxLat - minLat) * 1.55, 0.0035);
  const deltaLng = Math.max((maxLng - minLng) * 1.55, 0.0035);

  return {
    latitude: midLat,
    longitude: midLng,
    latitudeDelta: deltaLat,
    longitudeDelta: deltaLng,
  };
}

interface WalkHistorySectionProps {
  userId?: string;
  unitSystem?: string;
}

export function WalkHistorySection({ userId, unitSystem }: WalkHistorySectionProps) {
  const { colors, isDark, showsBuildings } = useTheme();
  const [walks, setWalks] = useState<WalkRecord[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [showSortMenu, setShowSortMenu] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedWalkForReview, setSelectedWalkForReview] = useState<WalkRecord | null>(null);
  const reviewMapRef = useRef<MapView | null>(null);

  // Walk route playback animation
  const [isPlayingBack, setIsPlayingBack] = useState<boolean>(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const playbackTimerRef = useRef<any>(null);

  const isUS = unitSystem === 'us_customary';

  const fetchWalks = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const records = await loadWalks(userId);
      setWalks(records);
    } catch (e) {
      console.warn('Error loading walks:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchWalks();
  }, [fetchWalks]);

  const [playbackSeconds, setPlaybackSeconds] = useState<number>(0);

  useEffect(() => {
    if (!selectedWalkForReview) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      setIsPlayingBack(false);
      setPlaybackIndex(0);
      setPlaybackSeconds(0);
    } else {
      setPlaybackSeconds(0);
      setPlaybackIndex(0);
    }
  }, [selectedWalkForReview]);

  const handleTogglePlayback = () => {
    if (!selectedWalkForReview?.routeCoordinates || selectedWalkForReview.routeCoordinates.length < 2) return;
    Haptics.selectionAsync().catch(() => {});

    if (isPlayingBack) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      setIsPlayingBack(false);
    } else {
      setIsPlayingBack(true);
      const coords = selectedWalkForReview.routeCoordinates;
      const totalPoints = coords.length;
      const totalDuration = selectedWalkForReview.durationSeconds || 60;

      // Ultra-fast, smooth replay animation: ~1.2 to 2.0 seconds total replay time
      const targetTotalPlaybackMs = Math.min(2000, Math.max(1000, totalPoints * 10));
      const pointsPerSecond = totalPoints / (targetTotalPlaybackMs / 1000);
      const stepInterval = 16; // 60fps tick
      const stride = Math.max(1, Math.round(pointsPerSecond * (stepInterval / 1000)));

      let curIdx = playbackIndex >= totalPoints - 1 ? 0 : playbackIndex;
      setPlaybackIndex(curIdx);
      const startSec = Math.round((curIdx / Math.max(1, totalPoints - 1)) * totalDuration);
      setPlaybackSeconds(startSec);

      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = setInterval(() => {
        curIdx += stride;
        if (curIdx >= totalPoints) {
          if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
          setIsPlayingBack(false);
          setPlaybackIndex(totalPoints - 1);
          setPlaybackSeconds(totalDuration);
        } else {
          setPlaybackIndex(curIdx);
          const currentElapsedSec = Math.round((curIdx / (totalPoints - 1)) * totalDuration);
          setPlaybackSeconds(currentElapsedSec);
        }
      }, stepInterval);
    }
  };

  const handleDelete = (walkId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Delete Walk', 'Remove this walk from your history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          await deleteWalk(userId, walkId);
          if (selectedWalkForReview?.id === walkId) {
            setSelectedWalkForReview(null);
          }
          await fetchWalks();
        },
      },
    ]);
  };

  const handleOpenReview = (walk: WalkRecord) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedWalkForReview(walk);
  };

  // Helper to resolve activity type of a record
  const getRecordType = (w: WalkRecord): 'walk' | 'run' | 'cycle' => {
    if (w.activityType) return w.activityType;
    const labelLower = (w.label || '').toLowerCase();
    if (labelLower.includes('cycle') || labelLower.includes('bike') || labelLower.includes('ride')) return 'cycle';
    if (labelLower.includes('run') || labelLower.includes('jog')) return 'run';
    return 'walk';
  };

  const filteredWalks = walks
    .filter((w) => {
      // Period filter (All / Week / Month)
      if (filter === 'week') {
        const date = new Date(w.date);
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (date < weekAgo) return false;
      } else if (filter === 'month') {
        const date = new Date(w.date);
        const now = new Date();
        if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) {
          return false;
        }
      }

      // Activity type filter
      if (sortOption === 'walk' || sortOption === 'run' || sortOption === 'cycle') {
        return getRecordType(w) === sortOption;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortOption === 'longest') {
        return (b.distanceMeters || 0) - (a.distanceMeters || 0);
      }
      // 'recent', 'walk', 'run', 'cycle' sort by date descending
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  const totalDistance = filteredWalks.reduce((s, w) => s + w.distanceMeters, 0);
  const totalSeconds = filteredWalks.reduce((s, w) => s + w.durationSeconds, 0);
  const totalCalories = filteredWalks.reduce((s, w) => s + w.calories, 0);

  const distanceDisplay = isUS
    ? `${metersToMiles(totalDistance).toFixed(1)} mi`
    : `${metersToKm(totalDistance).toFixed(1)} km`;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary Banner */}
      <View style={[styles.summaryBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.bannerHeader}>
          <Text style={[styles.bannerTitle, { color: colors.textMuted }]}>TOTAL SUMMARY</Text>
          <View style={[styles.activeTag, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.activeTagText, { color: colors.tint }]}>{filteredWalks.length} Workouts</Text>
          </View>
        </View>
        <View style={styles.bannerStatsRow}>
          <View style={styles.bannerStatCol}>
            <Text style={[styles.bannerStatBig, { color: colors.text }]}>{distanceDisplay}</Text>
            <Text style={[styles.bannerStatSub, { color: colors.textMuted }]}>DISTANCE</Text>
          </View>
          <View style={[styles.bannerDivider, { backgroundColor: colors.border }]} />
          <View style={styles.bannerStatCol}>
            <Text style={[styles.bannerStatBig, { color: colors.text }]}>{totalCalories.toLocaleString()}</Text>
            <Text style={[styles.bannerStatSub, { color: colors.textMuted }]}>KCAL</Text>
          </View>
          <View style={[styles.bannerDivider, { backgroundColor: colors.border }]} />
          <View style={styles.bannerStatCol}>
            <Text style={[styles.bannerStatBig, { color: colors.text }]}>{formatTotalTime(totalSeconds)}</Text>
            <Text style={[styles.bannerStatSub, { color: colors.textMuted }]}>TOTAL TIME</Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs & Sort Dropdown Row */}
      <View style={styles.filtersRow}>
        {(['all', 'week', 'month'] as const).map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.filterChip,
              { backgroundColor: colors.card, borderColor: colors.border },
              filter === item && { backgroundColor: colors.tint, borderColor: colors.tint },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setFilter(item);
            }}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: colors.textSecondary },
                filter === item && { color: isDark ? '#09090b' : '#ffffff' },
              ]}
            >
              {item === 'all' ? 'All' : item === 'week' ? 'This Week' : 'This Month'}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Sort Dropdown Button (to the right of This Month) */}
        <TouchableOpacity
          style={[
            styles.sortDropdownBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
            sortOption !== 'recent' && { borderColor: colors.tint },
          ]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setShowSortMenu(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={SORT_LABELS[sortOption].icon}
            size={14}
            color={sortOption !== 'recent' ? colors.tint : colors.textSecondary}
          />
          <Text
            style={[
              styles.sortDropdownText,
              { color: sortOption !== 'recent' ? colors.tint : colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {SORT_LABELS[sortOption].label}
          </Text>
          <Ionicons
            name="chevron-down"
            size={13}
            color={sortOption !== 'recent' ? colors.tint : colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* Empty State */}
      {filteredWalks.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="compass-outline" size={36} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No walks yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            {filter === 'all'
              ? 'Start a walk from the Track tab and it will appear here.'
              : `No walks recorded for this ${filter}.`}
          </Text>
        </View>
      ) : (
        /* Walk Cards List */
        <View style={styles.walksList}>
          {filteredWalks.map((item) => {
            const distKm = metersToKm(item.distanceMeters);
            const distMi = metersToMiles(item.distanceMeters);
            const dist = isUS ? distMi.toFixed(2) : distKm.toFixed(2);
            const unit = isUS ? 'mi' : 'km';
            const hasPath = item.routeCoordinates && item.routeCoordinates.length > 1;
            const framedRegion = hasPath ? getRegionForCoordinates(item.routeCoordinates) : undefined;

            const evalResult = evaluateWorkoutEffort(item, walks);

            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.walkCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleOpenReview(item)}
                activeOpacity={0.92}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleWrap}>
                    <View style={[styles.cardIconBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                      <Ionicons
                        name={getRecordType(item) === 'cycle' ? 'bicycle' : getRecordType(item) === 'run' ? 'fitness' : 'walk'}
                        size={18}
                        color={colors.tint}
                      />
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.cardLabel, { color: colors.text }]}>{item.label}</Text>
                        {/* Effort Grade Badge */}
                        <View style={[styles.effortGradePill, { borderColor: evalResult.color, backgroundColor: colors.surfaceSecondary }]}>
                          <Text style={[styles.effortGradePillText, { color: evalResult.color }]}>{evalResult.grade}</Text>
                        </View>
                      </View>
                      <Text style={[styles.cardDate, { color: colors.textMuted }]}>{formatWalkDate(item.date)}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                    <Text style={[styles.distanceValue, { color: colors.tint }]}>{dist}</Text>
                    <Text style={[styles.distanceUnit, { color: colors.tint }]}>{unit}</Text>
                  </View>
                </View>

                {/* Embedded In-Card Map Preview */}
                {hasPath && framedRegion && (
                  <View style={[styles.inlineMapContainer, { borderColor: colors.border }]}>
                    <MapView
                      style={styles.inlineMap}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      pitchEnabled={false}
                      rotateEnabled={false}
                      showsBuildings={showsBuildings}
                      userInterfaceStyle={isDark ? 'dark' : 'light'}
                      initialRegion={framedRegion}
                    >
                      <Polyline
                        coordinates={item.routeCoordinates}
                        strokeColor={colors.primary}
                        strokeWidth={4.5}
                        lineCap="round"
                        lineJoin="round"
                      />
                      <Marker
                        coordinate={item.routeCoordinates[0]}
                        title="Start"
                        pinColor="#10b981"
                      />
                      <Marker
                        coordinate={item.routeCoordinates[item.routeCoordinates.length - 1]}
                        title="Stop"
                        pinColor="#ef4444"
                      />
                    </MapView>
                  </View>
                )}

                {/* Relative Effort Comparison Bar */}
                <View style={[styles.relativeEffortRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Ionicons name="pulse" size={13} color={evalResult.color} />
                    <Text style={[styles.relativeEffortLabel, { color: colors.text }]}>
                      Relative Effort: <Text style={{ color: evalResult.color, fontWeight: '800' }}>{evalResult.effortScore}/100</Text> • {evalResult.effortLevel}
                    </Text>
                  </View>
                  <Text style={[styles.relativeEffortCompare, { color: colors.textMuted }]}>
                    {evalResult.comparisonText}
                  </Text>
                </View>

                <View style={[styles.statsMatrix, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginTop: 8 }]}>
                  <View style={styles.matrixItem}>
                    <Ionicons name="timer-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.matrixText, { color: colors.textSecondary }]}>{formatDuration(item.durationSeconds)}</Text>
                  </View>
                  <View style={styles.matrixItem}>
                    <Ionicons name="speedometer-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.matrixText, { color: colors.textSecondary }]}>{item.avgPace}/{unit}</Text>
                  </View>
                  <View style={styles.matrixItem}>
                    <Ionicons name="flame-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.matrixText, { color: colors.textSecondary }]}>{item.calories} kcal</Text>
                  </View>
                  <View style={styles.matrixItem}>
                    <Ionicons name="walk-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.matrixText, { color: colors.textSecondary }]}>{item.steps.toLocaleString()} steps</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* WORKOUT PATH REVIEW MODAL */}
      <InteractiveBottomModal
        visible={!!selectedWalkForReview}
        onDismiss={() => setSelectedWalkForReview(null)}
        handleColor={colors.border}
        cardStyle={[styles.reviewModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        {/* Header */}
        <View style={[styles.reviewHeader, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.reviewTitle, { color: colors.text }]}>
              {selectedWalkForReview?.label || 'Workout Path Review'}
            </Text>
            <Text style={[styles.reviewSubtitle, { color: colors.textMuted }]}>
              {selectedWalkForReview ? formatWalkDate(selectedWalkForReview.date) : ''}
            </Text>
          </View>
        </View>

        {/* Map Preview with Rich On-Map Info Callouts */}
        <View style={styles.reviewMapWrap}>
          {selectedWalkForReview?.routeCoordinates && selectedWalkForReview.routeCoordinates.length > 0 ? (
            <>
              <MapView
                ref={reviewMapRef}
                style={styles.reviewMap}
                showsBuildings={showsBuildings}
                showsPointsOfInterests={showsBuildings}
                userInterfaceStyle={isDark ? 'dark' : 'light'}
                initialRegion={getRegionForCoordinates(selectedWalkForReview.routeCoordinates)}
                onMapReady={() => {
                  if (reviewMapRef.current && selectedWalkForReview?.routeCoordinates?.length) {
                    reviewMapRef.current.fitToCoordinates(selectedWalkForReview.routeCoordinates, {
                      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                      animated: true,
                    });
                  }
                }}
              >
                <Polyline
                  coordinates={selectedWalkForReview.routeCoordinates}
                  strokeColor={colors.primary}
                  strokeWidth={5.5}
                  lineCap="round"
                  lineJoin="round"
                />
                <Marker
                  coordinate={selectedWalkForReview.routeCoordinates[0]}
                  title="Workout Start"
                  description={`Started at ${formatWalkDate(selectedWalkForReview.date)}`}
                  pinColor="#10b981"
                />
                {selectedWalkForReview.routeCoordinates.length > 1 && (
                  <Marker
                    coordinate={
                      selectedWalkForReview.routeCoordinates[
                        selectedWalkForReview.routeCoordinates.length - 1
                      ]
                    }
                    title="Workout Finish"
                    description={`Completed ${isUS ? metersToMiles(selectedWalkForReview.distanceMeters).toFixed(2) + ' mi' : metersToKm(selectedWalkForReview.distanceMeters).toFixed(2) + ' km'} in ${formatDuration(selectedWalkForReview.durationSeconds)}`}
                    pinColor="#ef4444"
                  />
                )}
                {/* Replay cursor navigating down the track with identical styling to map cursor */}
                {isPlayingBack && selectedWalkForReview.routeCoordinates[playbackIndex] && (() => {
                  const coords = selectedWalkForReview.routeCoordinates;
                  const curCoord = coords[playbackIndex];
                  const nextCoord = coords[Math.min(playbackIndex + 1, coords.length - 1)];
                  const prevCoord = coords[Math.max(0, playbackIndex - 1)];

                  // Calculate bearing heading along the route
                  let heading = 0;
                  const p1 = playbackIndex < coords.length - 1 ? curCoord : prevCoord;
                  const p2 = playbackIndex < coords.length - 1 ? nextCoord : curCoord;
                  if (p1 && p2 && (p1.latitude !== p2.latitude || p1.longitude !== p2.longitude)) {
                    const dLon = (p2.longitude - p1.longitude) * (Math.PI / 180);
                    const lat1 = p1.latitude * (Math.PI / 180);
                    const lat2 = p2.latitude * (Math.PI / 180);
                    const y = Math.sin(dLon) * Math.cos(lat2);
                    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
                    heading = (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
                  }

                  return (
                    <Marker
                      coordinate={curCoord}
                      anchor={{ x: 0.5, y: 0.5 }}
                      flat={true}
                      zIndex={30}
                    >
                      <View
                        style={[
                          styles.arrowMarkerContainer,
                          {
                            transform: [
                              { perspective: 850 },
                              { rotateZ: `${heading}deg` },
                            ],
                          },
                        ]}
                      >
                        {/* Sharp Top Surface Navigation Arrow Asset identical to the main tracker */}
                        <Ionicons
                          name="navigate"
                          size={32}
                          color={colors.primary}
                          style={[
                            styles.arrowIconShadow,
                            { shadowColor: colors.primary },
                          ]}
                        />
                      </View>
                    </Marker>
                  );
                })()}
              </MapView>

              {/* Floating On-Map Bar: Live Elapsed Time (counting up during replay) + Replay Button */}
              <View style={[styles.onMapInfoFloatingBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <View style={styles.onMapInfoChip}>
                  <Ionicons name="time-outline" size={13} color={colors.primary} />
                  <Text style={[styles.onMapInfoText, { color: colors.text }]}>
                    {isPlayingBack || playbackSeconds > 0
                      ? `Time: ${formatDuration(playbackSeconds)}`
                      : `Started ${new Date(selectedWalkForReview.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </Text>
                </View>
                <View style={[styles.onMapInfoDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.playbackActionBtn}
                  onPress={handleTogglePlayback}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isPlayingBack ? 'pause-circle' : 'play-circle'}
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={[styles.playbackBtnText, { color: colors.primary }]}>
                    {isPlayingBack ? 'Pause' : playbackIndex > 0 && playbackIndex < selectedWalkForReview.routeCoordinates.length - 1 ? 'Resume' : 'Replay Walk'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={[styles.noMapPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
              <Ionicons name="map-outline" size={44} color={colors.textMuted} />
              <Text style={[styles.noMapText, { color: colors.textSecondary }]}>
                No GPS path recorded for this walk
              </Text>
            </View>
          )}
        </View>

        {/* Stats Summary Row */}
        {selectedWalkForReview && (() => {
          const evalResult = evaluateWorkoutEffort(selectedWalkForReview, walks);

          return (
            <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
              {/* Relative Effort & Grade Evaluation Card */}
              <View style={[styles.modalEffortCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <View style={styles.modalEffortTopRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.modalGradeCircle, { borderColor: evalResult.color, backgroundColor: colors.surfaceSecondary }]}>
                      <Text style={[styles.modalGradeText, { color: evalResult.color }]}>{evalResult.grade}</Text>
                    </View>
                    <View>
                      <Text style={[styles.modalEffortHeading, { color: colors.text }]}>
                        {evalResult.effortLevel} Intensity
                      </Text>
                      <Text style={[styles.modalEffortScoreText, { color: colors.textMuted }]}>
                        Relative Effort: <Text style={{ color: evalResult.color, fontWeight: '800' }}>{evalResult.effortScore}/100</Text>
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.burnRateBadge, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <Ionicons name="flame" size={13} color="#f97316" />
                    <Text style={[styles.burnRateText, { color: colors.text }]}>
                      {evalResult.burnRateKcalPerHour} kcal/h
                    </Text>
                  </View>
                </View>

                {/* Progress score bar */}
                <View style={[styles.effortScoreTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                  <View style={[styles.effortScoreFill, { width: `${evalResult.effortScore}%`, backgroundColor: evalResult.color }]} />
                </View>

                {/* Contextual baseline comparison */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}>
                  <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.modalEffortCompareText, { color: colors.textSecondary }]}>
                    {evalResult.comparisonText} for this {getRecordType(selectedWalkForReview)}
                  </Text>
                </View>
              </View>

              <View style={[styles.reviewStatsRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, marginTop: 10 }]}>
                <View style={styles.reviewStatBox}>
                  <Text style={[styles.reviewStatVal, { color: colors.text }]}>
                    {isUS
                      ? `${metersToMiles(selectedWalkForReview.distanceMeters).toFixed(2)} mi`
                      : `${metersToKm(selectedWalkForReview.distanceMeters).toFixed(2)} km`}
                  </Text>
                  <Text style={[styles.reviewStatLabel, { color: colors.textMuted }]}>DISTANCE</Text>
                </View>
                <View style={[styles.reviewStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.reviewStatBox}>
                  <Text style={[styles.reviewStatVal, { color: colors.text }]}>
                    {formatDuration(selectedWalkForReview.durationSeconds)}
                  </Text>
                  <Text style={[styles.reviewStatLabel, { color: colors.textMuted }]}>DURATION</Text>
                </View>
                <View style={[styles.reviewStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.reviewStatBox}>
                  <Text style={[styles.reviewStatVal, { color: colors.text }]}>
                    {selectedWalkForReview.calories}
                  </Text>
                  <Text style={[styles.reviewStatLabel, { color: colors.textMuted }]}>KCAL</Text>
                </View>
                <View style={[styles.reviewStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.reviewStatBox}>
                  <Text style={[styles.reviewStatVal, { color: colors.text }]}>
                    {selectedWalkForReview.avgPace}
                  </Text>
                  <Text style={[styles.reviewStatLabel, { color: colors.textMuted }]}>PACE</Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* Action Bar */}
        <View style={styles.reviewActions}>
          <TouchableOpacity
            style={[styles.reviewDeleteBtn, { borderColor: '#ef4444' }]}
            onPress={() => {
              if (selectedWalkForReview) {
                handleDelete(selectedWalkForReview.id);
              }
            }}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={styles.reviewDeleteText}>Delete Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reviewDoneBtn, { backgroundColor: colors.primary }]}
            onPress={() => setSelectedWalkForReview(null)}
          >
            <Text style={styles.reviewDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </InteractiveBottomModal>

      {/* Sort & Filter Dropdown Bottom Sheet */}
      <InteractiveBottomModal
        visible={showSortMenu}
        onDismiss={() => setShowSortMenu(false)}
        handleColor={isDark ? '#3f3f46' : '#d4d4d8'}
        cardStyle={[styles.sortModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Text style={[styles.sortModalTitle, { color: colors.text }]}>Filter & Sort</Text>
        <Text style={[styles.sortModalSubtitle, { color: colors.textMuted }]}>
          Choose how workouts are organized in your log
        </Text>

        <View style={styles.sortOptionsList}>
          {(['recent', 'longest', 'walk', 'run', 'cycle'] as SortOption[]).map((opt) => {
            const isSelected = sortOption === opt;
            const itemInfo = SORT_LABELS[opt];
            return (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.sortOptionRow,
                  { backgroundColor: isSelected ? (isDark ? '#18181b' : '#f4f4f5') : 'transparent', borderColor: colors.border },
                  isSelected && { borderColor: colors.primary },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSortOption(opt);
                  setShowSortMenu(false);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.sortOptionLeft}>
                  <View
                    style={[
                      styles.sortIconCircle,
                      { backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary },
                    ]}
                  >
                    <Ionicons
                      name={itemInfo.icon}
                      size={18}
                      color={isSelected ? '#ffffff' : colors.textSecondary}
                    />
                  </View>
                  <View>
                    <Text
                      style={[
                        styles.sortOptionLabel,
                        { color: colors.text },
                        isSelected && { color: colors.primary, fontWeight: '700' },
                      ]}
                    >
                      {itemInfo.label} {opt === 'recent' ? '(Default)' : ''}
                    </Text>
                    <Text style={[styles.sortOptionDesc, { color: colors.textMuted }]}>
                      {opt === 'recent'
                        ? 'Order by latest date and time'
                        : opt === 'longest'
                        ? 'Order by furthest distance completed'
                        : opt === 'walk'
                        ? 'Show only walking workouts'
                        : opt === 'run'
                        ? 'Show only running workouts'
                        : 'Show only cycling workouts'}
                    </Text>
                  </View>
                </View>

                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                ) : (
                  <View style={[styles.sortRadioCircle, { borderColor: colors.border }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </InteractiveBottomModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBanner: {
    marginBottom: 16,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  bannerTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  activeTag: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  activeTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  bannerStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bannerStatCol: {
    alignItems: 'center',
  },
  bannerStatBig: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  bannerStatSub: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 1,
  },
  bannerDivider: {
    width: 1,
    height: 32,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sortDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 16,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  sortDropdownText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  sortModalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sortModalTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  sortModalSubtitle: {
    fontSize: 12.5,
    marginTop: 4,
    marginBottom: 16,
  },
  sortOptionsList: {
    gap: 9,
  },
  sortOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  sortOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  sortIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortOptionLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sortOptionDesc: {
    fontSize: 11.5,
    marginTop: 2,
  },
  sortRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  walksList: {
    gap: 14,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 32,
  },
  walkCard: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardDate: {
    fontSize: 12,
    marginTop: 2,
  },
  distanceValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  distanceUnit: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 1,
  },
  statsMatrix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  matrixItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  matrixText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inlineMapContainer: {
    width: '100%',
    height: 145,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 12,
  },
  inlineMap: {
    width: '100%',
    height: '100%',
  },
  onMapInfoFloatingBar: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
    gap: 8,
  },
  onMapInfoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  onMapInfoText: {
    fontSize: 11,
    fontWeight: '700',
  },
  onMapInfoDivider: {
    width: 1,
    height: 12,
  },
  playbackActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playbackBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  playbackCursorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#18181b',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 6,
  },
  arrowMarkerContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIconShadow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },
  reviewModalCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  reviewTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  reviewSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  reviewMapWrap: {
    width: '100%',
    height: 280,
    overflow: 'hidden',
  },
  reviewMap: {
    width: '100%',
    height: '100%',
  },
  noMapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  noMapText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  reviewStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  reviewStatBox: {
    alignItems: 'center',
  },
  reviewStatVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  reviewStatLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  reviewStatDivider: {
    width: 1,
    height: 24,
  },
  reviewActions: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  reviewDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  reviewDeleteText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
  reviewDoneBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
  },
  reviewDoneText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  effortGradePill: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  effortGradePillText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  relativeEffortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    gap: 8,
  },
  relativeEffortLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  relativeEffortCompare: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  modalEffortCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  modalEffortTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalGradeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGradeText: {
    fontSize: 16,
    fontWeight: '900',
  },
  modalEffortHeading: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  modalEffortScoreText: {
    fontSize: 11.5,
    marginTop: 1,
  },
  burnRateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  burnRateText: {
    fontSize: 11,
    fontWeight: '700',
  },
  effortScoreTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  effortScoreFill: {
    height: '100%',
    borderRadius: 3,
  },
  modalEffortCompareText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
