import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
  RefreshControl,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { useAuth } from '@/constants/AuthContext';
import {
  WalkRecord,
  loadWalks,
  deleteWalk,
  formatWalkDate,
} from '@/constants/walkStorage';
import { metersToKm, metersToMiles } from '@/constants/userProfile';

import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { DraggableSheetHandle } from '@/components/DraggableSheetHandle';
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

// Helper to compute map region framing all points with margin
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

export default function HistoryScreen() {
  const { user, profile } = useAuth();
  const { colors, isDark, theme, showsBuildings } = useTheme();
  const [walks, setWalks] = useState<WalkRecord[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [showSortMenu, setShowSortMenu] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWalkForReview, setSelectedWalkForReview] = useState<WalkRecord | null>(null);
  const reviewMapRef = useRef<MapView | null>(null);

  // Walk route playback animation
  const [isPlayingBack, setIsPlayingBack] = useState<boolean>(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const playbackTimerRef = useRef<any>(null);

  const [playbackSeconds, setPlaybackSeconds] = useState<number>(0);

  useEffect(() => {
    // Reset playback when modal opens/closes
    if (!selectedWalkForReview) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      setIsPlayingBack(false);
      setPlaybackIndex(0);
      setPlaybackSeconds(0);
    } else {
      setPlaybackIndex(0);
      setPlaybackSeconds(0);
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

  const isUS = profile.unitSystem === 'us_customary';

  const fetchWalks = useCallback(async () => {
    if (!user) return;
    const records = await loadWalks(user.id);
    setWalks(records);
  }, [user]);

  // Reload when tab comes into focus (e.g. after finishing a walk)
  useFocusEffect(
    useCallback(() => {
      fetchWalks();
    }, [fetchWalks])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWalks();
    setRefreshing(false);
  };

  const handleDelete = (walkId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Delete Walk', 'Remove this walk from your history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!user) return;
          await deleteWalk(user.id, walkId);
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

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Ionicons name="compass-outline" size={36} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No workouts yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
        {filter === 'all'
          ? 'Start an activity from the Track tab and it will appear here.'
          : `No workouts found for this selection.`}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Walk List */}
      <FlatList
        data={filteredWalks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, filteredWalks.length === 0 && { flex: 1 }]}
        ListEmptyComponent={renderEmpty}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
        ListHeaderComponent={
          <View>
            {/* Serif Scrollable Title */}
            <Text style={[styles.screenTitle, { color: colors.text, paddingTop: Platform.OS === 'ios' ? 76 : 48, paddingBottom: 16 }]}>Workout Log</Text>

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
          </View>
        }
        renderItem={({ item }) => {
          const distKm = metersToKm(item.distanceMeters);
          const distMi = metersToMiles(item.distanceMeters);
          const dist = isUS ? distMi.toFixed(2) : distKm.toFixed(2);
          const unit = isUS ? 'mi' : 'km';
          const hasPath = item.routeCoordinates && item.routeCoordinates.length > 1;
          const framedRegion = hasPath ? getRegionForCoordinates(item.routeCoordinates) : undefined;

          return (
            <TouchableOpacity
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
                    <Text style={[styles.cardLabel, { color: colors.text }]}>{item.label}</Text>
                    <Text style={[styles.cardDate, { color: colors.textMuted }]}>{formatWalkDate(item.date)}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                  <Text style={[styles.distanceValue, { color: colors.tint }]}>{dist}</Text>
                  <Text style={[styles.distanceUnit, { color: colors.tint }]}>{unit}</Text>
                </View>
              </View>

              {/* Embedded In-Card Map Preview: Frames start to finish properly with zoom */}
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

              <View style={[styles.statsMatrix, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
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
        }}
      />

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
                    {/* Start Point with Rich Callout */}
                    <Marker
                      coordinate={selectedWalkForReview.routeCoordinates[0]}
                      title="Workout Start"
                      description={`Started at ${formatWalkDate(selectedWalkForReview.date)}`}
                      pinColor="#10b981"
                    />
                    {/* Finish Point with Rich Callout */}
                    {selectedWalkForReview.routeCoordinates.length > 1 && (
                      <Marker
                        coordinate={
                          selectedWalkForReview.routeCoordinates[
                            selectedWalkForReview.routeCoordinates.length - 1
                          ]
                        }
                        title="Workout Finish"
                        description={`Completed ${isUS ? (metersToMiles(selectedWalkForReview.distanceMeters)).toFixed(2) + ' mi' : (metersToKm(selectedWalkForReview.distanceMeters)).toFixed(2) + ' km'} in ${formatDuration(selectedWalkForReview.durationSeconds)}`}
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
            {selectedWalkForReview && (
              <View style={[styles.reviewStatsRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
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
            )}

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
  container: { flex: 1 },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 28,
    marginBottom: 4,
  },
  screenTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  screenSubtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  summaryBanner: {
    marginHorizontal: 0,
    marginTop: 6,
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  bannerTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  activeTag: {
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1,
  },
  activeTagText: { fontSize: 11, fontWeight: '700' },
  bannerStatsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  bannerStatCol: { alignItems: 'center' },
  bannerStatBig: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  bannerStatSub: { fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 1 },
  bannerDivider: { width: 1, height: 32 },
  filtersRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  filterChip: {
    paddingVertical: 7, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
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
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontFamily: SERIF_FONT, fontSize: 26, fontWeight: '700', marginBottom: 8, letterSpacing: -0.4 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 32 },
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
  },
  cardTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconBox: {
    width: 36, height: 36, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  cardLabel: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  cardDate: { fontSize: 12, marginTop: 2 },
  distanceValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  distanceUnit: { fontSize: 12, fontWeight: '700', marginLeft: 1 },
  statsMatrix: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  matrixItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  matrixText: { fontSize: 12, fontWeight: '600' },
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
  pathBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  pathBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38bdf8',
  },
  /* Review Modal */
  reviewModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 16,
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
  reviewCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
});

