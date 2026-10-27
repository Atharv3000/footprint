import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Linking,
  Platform,
  ScrollView,
  FlatList,
  Keyboard,
  PanResponder,
  Animated,
  Image,
} from 'react-native';
import MapView, { Marker, Polyline, Circle, Region, MapType } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/constants/AuthContext';
import { useTheme } from '@/constants/ThemeContext';
import { saveWalk, loadWalks, WalkRecord } from '@/constants/walkStorage';
import { loadFriends, FriendUser } from '@/constants/socialEngine';
import {
  UserProfile,
  DEFAULT_PROFILE,
  loadUserProfile,
  saveUserProfile,

  calculateScientificCaloriesBurned,
  kgToLbs,
  lbsToKg,
  metersToKm,
  metersToMiles,
  UnitSystem,
  GenderOption,
  ActivityType,
} from '@/constants/userProfile';
import {
  searchPlaces,
  fetchRealRoadRoute,
  fetchMultiStopRoute,
  generateRealCircuitSuggestions,
  recalculateReturnToPathRoute,
  calculateEstimatedMinutes,
  RealRouteResult,
  GeocodedPlace,
  RouteStep,
  RoutePoi,
  RouteOptions,
  DEFAULT_ROUTE_OPTIONS,
} from '@/constants/realNavigationEngine';

interface WalkStats {
  distanceMeters: number;
  durationSeconds: number;
  avgPace: string;
  calories: number;
  steps: number;
}

function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

import { FlipNumberPicker } from '@/components/FlipNumberPicker';
import { DraggableSheetHandle } from '@/components/DraggableSheetHandle';

const ROUTE_PALETTE = ['#38bdf8', '#a855f7', '#f59e0b', '#10b981', '#ec4899', '#6366f1'];

// ─────────────────────────────────────────────────────────────────────────────
// DraggableStopRow — memoized so PanResponder is stable across parent re-renders
// (creating PanResponder inside a .map() causes it to be recreated every render,
//  leading to gesture conflicts and the "tab flash" lag)
// ─────────────────────────────────────────────────────────────────────────────
interface DraggableStopRowProps {
  stop: import('@/constants/realNavigationEngine').GeocodedPlace;
  sIdx: number;
  isLast: boolean;
  canReorder: boolean;
  isItemDragging: boolean;
  dragTranslateY: import('react-native').Animated.Value;
  themeColors: any;
  onDragStart: (idx: number) => void;
  onDragEnd: (idx: number, dy: number) => void;
  onMove: (dy: number) => void;
  onSwap: (from: number, to: number) => void;
  onRemove: (idx: number) => void;
}

const DraggableStopRow = React.memo(function DraggableStopRow({
  stop, sIdx, isLast, canReorder, isItemDragging,
  dragTranslateY, themeColors,
  onDragStart, onDragEnd, onMove, onSwap, onRemove,
}: DraggableStopRowProps) {
  const panResponder = React.useRef(
    PanResponder.create({
      // Capture-phase claim prevents tab-swipe gesture from stealing the touch
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 3,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 3,
      onPanResponderGrant: () => {
        onDragStart(sIdx);
        dragTranslateY.setValue(0);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      },
      onPanResponderMove: (_, g) => {
        dragTranslateY.setValue(g.dy);
        onMove(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        onDragEnd(sIdx, g.dy);
        dragTranslateY.setValue(0);
      },
      onPanResponderTerminate: () => {
        dragTranslateY.setValue(0);
        onDragEnd(sIdx, 0);
      },
    })
  ).current;

  return (
    <Animated.View
      key={`vertical_stop_${stop.placeId}_${sIdx}`}
      style={[
        draggableStopStyles.item,
        { borderBottomColor: themeColors.border },
        isItemDragging && {
          transform: [{ translateY: dragTranslateY }, { scale: 1.03 }],
          backgroundColor: themeColors.isDark ? '#27272a' : '#f4f4f5',
          borderRadius: 12,
          zIndex: 99,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 10,
        },
      ]}
    >
      {/* Grab Handle */}
      <View
        {...panResponder.panHandlers}
        style={[
          draggableStopStyles.grabSpot,
          {
            backgroundColor: isItemDragging ? themeColors.surfaceElevated : 'transparent',
            borderColor: isItemDragging ? themeColors.borderLight : themeColors.border,
          },
        ]}
      >
        <Ionicons
          name="reorder-two-outline"
          size={17}
          color={isItemDragging ? themeColors.text : themeColors.textMuted}
        />
      </View>

      {/* Stop Number Badge */}
      <View style={[draggableStopStyles.numberBadge, { backgroundColor: isLast ? '#10b981' : '#f59e0b' }]}>
        <Text style={draggableStopStyles.numberText}>{isLast ? '🏁' : `${sIdx + 1}`}</Text>
      </View>

      {/* Stop Name */}
      <View style={{ flex: 1, marginRight: 6 }}>
        <Text style={[draggableStopStyles.name, { color: themeColors.text }]} numberOfLines={1}>
          {stop.shortName}
        </Text>
        <Text style={[draggableStopStyles.sub, { color: themeColors.textMuted }]} numberOfLines={1}>
          {isLast ? 'Final Destination' : `Waypoint Stop ${sIdx + 1}`}
        </Text>
      </View>

      {/* Tap-to-swap shortcut */}
      {canReorder && (
        <TouchableOpacity
          style={[draggableStopStyles.swapPill, { borderColor: themeColors.border }]}
          onPress={() => onSwap(sIdx, (sIdx + 1) % (sIdx + 2))}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="swap-vertical" size={12} color={themeColors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Remove Button */}
      <TouchableOpacity
        style={draggableStopStyles.removeBtn}
        onPress={() => onRemove(sIdx)}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="trash-outline" size={14} color="#ef4444" />
      </TouchableOpacity>
    </Animated.View>
  );
});

const draggableStopStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grabSpot: {
    width: 28,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  numberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  numberText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
  },
  sub: {
    fontSize: 10.5,
    marginTop: 1,
  },
  swapPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  removeBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderRadius: 8,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


// ---------------------------------------------------------------------------
// Premium Distance Slider Component (Logarithmic scale: 1,000 ft to Marathon)
// ---------------------------------------------------------------------------
function DistanceSlider({
  value,
  min,
  max,
  isUS,
  primaryColor,
  borderColor,
  surfaceColor,
  onChange,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  isUS: boolean;
  primaryColor: string;
  borderColor: string;
  surfaceColor: string;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<View | null>(null);
  const trackPageXRef = useRef<number>(0);
  const trackWidthRef = useRef<number>(0);
  const valueRef = useRef<number>(value);
  const startDragPageXRef = useRef<number>(0);
  const startDragTRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const [isPressed, setIsPressed] = useState<boolean>(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Logarithmic transformation helpers:
  // val = min * (max / min)^t  where t in [0, 1]
  // t = ln(val / min) / ln(max / min)
  const valToT = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    return Math.log(clamped / min) / Math.log(max / min);
  };

  const tToVal = (t: number) => {
    const clampedT = Math.max(0, Math.min(1, t));
    const raw = min * Math.pow(max / min, clampedT);
    // Smooth adaptive snapping for clean human display:
    // Under 1km (~3280 ft): snap to ~50m / ~150ft increments
    if (raw < 1.0) {
      return parseFloat((Math.round(raw * 20) / 20).toFixed(2));
    } else if (raw < 5.0) {
      // Under 5km (~3 mi): 0.1km steps
      return parseFloat((Math.round(raw * 10) / 10).toFixed(1));
    } else if (raw < 15.0) {
      // 5-15km: 0.5km steps
      return parseFloat((Math.round(raw * 2) / 2).toFixed(1));
    } else if (raw < 41.5) {
      // 15-41.5km: 1km steps
      return parseFloat(Math.round(raw).toFixed(1));
    } else {
      // Near end: snap cleanly to official marathon distance 42.195 km
      return 42.195;
    }
  };

  const THUMB_SIZE = 28;
  const tCurrent = valToT(value);
  const usableWidth = Math.max(1, trackWidth - THUMB_SIZE);
  const thumbPos = trackWidth > 0 ? tCurrent * usableWidth : 0;

  const updateFromDelta = (deltaX: number, isRelease = false) => {
    const usableW = Math.max(1, trackWidthRef.current - THUMB_SIZE);
    const deltaT = deltaX / usableW;
    const newT = Math.max(0, Math.min(1, startDragTRef.current + deltaT));
    const newVal = tToVal(newT);

    if (newVal !== valueRef.current) {
      valueRef.current = newVal;
      onChange(newVal);
      Haptics.selectionAsync().catch(() => {});
    }

    if (isRelease) {
      onCommit(valueRef.current);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_e, gestureState) => Math.abs(gestureState.dx) > 2,
      onMoveShouldSetPanResponderCapture: (_e, gestureState) => Math.abs(gestureState.dx) > 2,
      onPanResponderGrant: (e) => {
        isDraggingRef.current = true;
        setIsPressed(true);
        startDragPageXRef.current = e.nativeEvent.pageX;

        // Calculate initial touched T based on geometry
        if (trackRef.current) {
          trackRef.current.measure((_x, _y, width, _height, pageX) => {
            if (width > 0) {
              trackPageXRef.current = pageX;
              trackWidthRef.current = width;
              setTrackWidth(width);
            }
            const relX = e.nativeEvent.pageX - pageX - (THUMB_SIZE / 2);
            const usableW = Math.max(1, width - THUMB_SIZE);
            const touchedT = Math.max(0, Math.min(1, relX / usableW));
            startDragTRef.current = touchedT;
            const newVal = tToVal(touchedT);
            if (newVal !== valueRef.current) {
              valueRef.current = newVal;
              onChange(newVal);
              Haptics.selectionAsync().catch(() => {});
            }
          });
        } else {
          startDragTRef.current = valToT(valueRef.current);
        }
      },
      onPanResponderMove: (e) => {
        if (!isDraggingRef.current) return;
        const deltaX = e.nativeEvent.pageX - startDragPageXRef.current;
        updateFromDelta(deltaX);
      },
      onPanResponderRelease: (e) => {
        setIsPressed(false);
        isDraggingRef.current = false;
        const deltaX = e.nativeEvent.pageX - startDragPageXRef.current;
        updateFromDelta(deltaX, true);
      },
      onPanResponderTerminate: (e) => {
        setIsPressed(false);
        isDraggingRef.current = false;
        const deltaX = e.nativeEvent.pageX - startDragPageXRef.current;
        updateFromDelta(deltaX, true);
      },
    })
  ).current;

  // Formatting labels
  const formatVal = (km: number) => {
    if (isUS) {
      const miles = km * 0.621371;
      const ft = km * 3280.84;
      if (miles < 0.25) {
        return `${Math.round(ft / 50) * 50} ft`;
      }
      if (Math.abs(miles - 26.2) < 0.3 || km >= 42.1) {
        return '26.2 mi (Marathon)';
      }
      return `${miles.toFixed(1)} mi`;
    } else {
      if (km < 1.0) {
        return `${Math.round((km * 1000) / 50) * 50} m`;
      }
      if (Math.abs(km - 42.2) < 0.4 || km >= 42.1) {
        return '42.2 km (Marathon)';
      }
      return `${km.toFixed(1)} km`;
    }
  };

  const minLabel = isUS ? '1,000 ft' : '300 m';
  const midLabel = isUS ? '3.1 mi (5K)' : '5.0 km';
  const maxLabel = isUS ? '26.2 mi (Marathon)' : '42.2 km (Marathon)';

  return (
    <View style={sliderStyles.wrapper}>
      {/* Generous touch container with hit slop to prevent misses */}
      <View
        style={sliderStyles.touchContainer}
        {...panResponder.panHandlers}
      >
        <View
          ref={trackRef}
          style={[
            sliderStyles.track,
            { backgroundColor: surfaceColor, borderColor: isPressed ? primaryColor : borderColor },
          ]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setTrackWidth(w);
            trackWidthRef.current = w;
            if (trackRef.current) {
              trackRef.current.measure((_x, _y, width, _height, pageX) => {
                if (width > 0) {
                  trackPageXRef.current = pageX;
                  trackWidthRef.current = width;
                }
              });
            }
          }}
        >
          {/* Active progress fill */}
          <View
            style={[
              sliderStyles.fill,
              {
                width: Math.max(THUMB_SIZE / 2, thumbPos + (THUMB_SIZE / 2)),
                backgroundColor: primaryColor,
              },
            ]}
          />

          {/* Subtle midpoint landmark notch (5K / 3.1 mi) */}
          {trackWidth > 0 && (
            <View
              style={[
                sliderStyles.notch,
                {
                  left: valToT(5.0) * usableWidth + (THUMB_SIZE / 2) - 1,
                  backgroundColor: borderColor,
                },
              ]}
            />
          )}

          {/* Tactile thumb pill with sleek shadow */}
          {trackWidth > 0 && (
            <View
              style={[
                sliderStyles.thumb,
                {
                  left: thumbPos,
                  borderColor: primaryColor,
                  transform: [{ scale: isPressed ? 1.12 : 1.0 }],
                },
              ]}
            >
              <View style={[sliderStyles.thumbInnerDot, { backgroundColor: primaryColor }]} />
            </View>
          )}
        </View>
      </View>

      {/* Ticks and scale bounds */}
      <View style={sliderStyles.labels}>
        <Text style={[sliderStyles.labelText, { color: borderColor }]}>{minLabel}</Text>
        <Text style={[sliderStyles.labelTextMid, { color: borderColor }]}>{midLabel}</Text>
        <Text style={[sliderStyles.labelText, { color: borderColor }]}>{maxLabel}</Text>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
  },
  touchContainer: {
    paddingVertical: 12, // High vertical hit slop area so touches slightly above/below the track register perfectly
    justifyContent: 'center',
  },
  track: {
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    overflow: 'visible',
    justifyContent: 'center',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 7,
  },
  notch: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
    opacity: 0.45,
  },
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    top: -8, // Centers 28px thumb on 14px track
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  thumbInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    paddingHorizontal: 2,
  },
  labelText: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  labelTextMid: {
    fontSize: 10,
    fontWeight: '500',
    opacity: 0.8,
  },
});
// ---------------------------------------------------------------------------

export default function TrackScreen() {
  const { user } = useAuth();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [backgroundPermission, setBackgroundPermission] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User Profile
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  // Map modes: 3D, MapType
  const [is3D, setIs3D] = useState<boolean>(false);
  // Map modes: 3D, MapType
  const [mapType, setMapType] = useState<MapType>('standard');
  const [followsUser, setFollowsUser] = useState<boolean>(true);
  // Live camera bearing & pitch (tilt) — updated on map rotation and tilt so pointer lays flat and accurate
  const [cameraBearing, setCameraBearing] = useState<number>(0);
  const [cameraPitch, setCameraPitch] = useState<number>(0);

  // Live Altitude Tracking (from GPS/Map services)
  const [currentAltitude, setCurrentAltitude] = useState<number | null>(null);

  // Activity Mode & Dropdown State
  const [activityType, setActivityType] = useState<ActivityType>('walk');
  const [isActivityDropdownOpen, setIsActivityDropdownOpen] = useState<boolean>(false);

  // Search & Navigation State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<GeocodedPlace[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [selectedRoute, setSelectedRoute] = useState<RealRouteResult | null>(null);
  const [previewPlace, setPreviewPlace] = useState<GeocodedPlace | null>(null);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [routeStops, setRouteStops] = useState<GeocodedPlace[]>([]);
  const [showStopsManager, setShowStopsManager] = useState<boolean>(false);
  const [isAddingStopMode, setIsAddingStopMode] = useState<boolean>(false);
  const [draggingStopIdx, setDraggingStopIdx] = useState<number | null>(null);
  const dragTranslateY = useRef(new Animated.Value(0)).current;
  const searchDropdownAnim = useRef(new Animated.Value(0)).current;
  const routePreviewSlideAnim = useRef(new Animated.Value(0)).current;
  // Soft delayed shadow fade-in for top bar (routes icon & search) and floating map HUD
  const hudShadowAnim = useRef(new Animated.Value(0)).current;
  const [placeActionTarget, setPlaceActionTarget] = useState<GeocodedPlace | null>(null);

  useEffect(() => {
    // Fade in soft shadow gently over time instead of appearing immediately
    Animated.timing(hudShadowAnim, {
      toValue: 1,
      duration: 1200,
      delay: 300,
      useNativeDriver: false,
    }).start();
  }, []);

  // Route Customizer & Suggester Modal
  const [showRouteModal, setShowRouteModal] = useState<boolean>(false);
  const [targetDistanceKm, setTargetDistanceKm] = useState<number>(5.0);
  const [targetElevation, setTargetElevation] = useState<'flat' | 'rolling' | 'hilly' | null>(null);
  const [routeType, setRouteType] = useState<'loop' | 'oneway'>('loop');
  const [routeSuggestions, setRouteSuggestions] = useState<RealRouteResult[]>([]);
  const [isGeneratingRoutes, setIsGeneratingRoutes] = useState<boolean>(false);
  const [showDirections, setShowDirections] = useState<boolean>(false);

  // Route Preferences: Default to fastest when other detours are unselected
  const [preferFastest, setPreferFastest] = useState<boolean>(true);
  const [preferParks, setPreferParks] = useState<boolean>(false);
  const [avoidTrafficLights, setAvoidTrafficLights] = useState<boolean>(false);
  const [avoidBusyRoads, setAvoidBusyRoads] = useState<boolean>(false);
  const [preferCyclingLanes, setPreferCyclingLanes] = useState<boolean>(true);
  const [showSearchOptions, setShowSearchOptions] = useState<boolean>(false);

  // Active Navigation State
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [distToNextTurn, setDistToNextTurn] = useState<number>(0);
  const [isRerouting, setIsRerouting] = useState<boolean>(false);
  const [routeDestination, setRouteDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [rerouteTrigger, setRerouteTrigger] = useState<{ lat: number; lng: number } | null>(null);
  // Past Workouts Overlay on Map
  const [pastWalks, setPastWalks] = useState<WalkRecord[]>([]);
  const [showPastWalks, setShowPastWalks] = useState<boolean>(true);

  // Live Friends on Map Overlay
  const [friendsOnMap, setFriendsOnMap] = useState<FriendUser[]>([]);
  const [showFriendsOnMap, setShowFriendsOnMap] = useState<boolean>(true);
  const [selectedFriend, setSelectedFriend] = useState<FriendUser | null>(null);

  // Walk Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [routeCoordinates, setRouteCoordinates] = useState<
    Array<{ latitude: number; longitude: number }>
  >([]);
  const [totalDistanceMeters, setTotalDistanceMeters] = useState<number>(0);

  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const isVoiceMutedRef = useRef<boolean>(false);
  useEffect(() => { isVoiceMutedRef.current = isVoiceMuted; }, [isVoiceMuted]);

  // Animated slide down/up for top navigation card
  const navAnim = useRef(new Animated.Value(0)).current;
  const lastSpokenRef = useRef<string>('');

  const speakInstruction = (text: string) => {
    if (isVoiceMutedRef.current || !text) return;
    if (lastSpokenRef.current === text) return;
    lastSpokenRef.current = text;
    try {
      Speech.stop();
      Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.95,
      });
    } catch (_) {}
  };

  // Slide top navigation card in/out: active only when actively navigating or recording
  const showTopNav = isNavigating && !!selectedRoute && (selectedRoute.steps?.length || 0) > 0;
  useEffect(() => {
    Animated.spring(navAnim, {
      toValue: showTopNav ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 65,
    }).start();
  }, [showTopNav]);

  // Connected slide-down animation for search dropdown list
  useEffect(() => {
    Animated.spring(searchDropdownAnim, {
      toValue: searchResults.length > 0 ? 1 : 0,
      useNativeDriver: true,
      friction: 9,
      tension: 70,
    }).start();
  }, [searchResults.length > 0]);

  // Slide-up animation from underneath bottom nav bar for route preview card (only animates upon initial opening, not on every recalculation/update)
  const isPreviewActiveRef = useRef<boolean>(false);
  useEffect(() => {
    const isPreviewActive = selectedRoute !== null && !isNavigating && !isRecording;
    if (isPreviewActive) {
      if (!isPreviewActiveRef.current) {
        // Only run entry spring animation on initial transition from inactive -> active
        isPreviewActiveRef.current = true;
        routePreviewSlideAnim.setValue(0);
        Animated.spring(routePreviewSlideAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 65,
        }).start();
      }
    } else {
      if (isPreviewActiveRef.current) {
        isPreviewActiveRef.current = false;
        Animated.timing(routePreviewSlideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [selectedRoute !== null, isNavigating, isRecording]);

  // Setup / Calibration Modal state
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [modalUnits, setModalUnits] = useState<UnitSystem>('us_customary');
  const [tempWeight, setTempWeight] = useState<string>('154');
  const [tempHeight, setTempHeight] = useState<string>('175'); // for metric cm
  const [tempHeightFeet, setTempHeightFeet] = useState<string>('5');
  const [tempHeightInches, setTempHeightInches] = useState<string>('9');
  const [tempAge, setTempAge] = useState<string>('28');
  const [tempGender, setTempGender] = useState<GenderOption>('na');

  const [completedSummary, setCompletedSummary] = useState<WalkStats | null>(null);

  // Global App Color Scheme & Map Appearance
  const {
    theme: mapTheme,
    setTheme: setMapTheme,
    colors: themeColors,
    showsBuildings,
    setShowsBuildings,
  } = useTheme();

  // Manual & automatic recalculate handler
  const handleRecalculate = useCallback(async () => {
    if (!selectedRouteRef.current && !routeDestinationRef.current) return;
    const lat = locationRef.current?.coords.latitude || location?.coords.latitude;
    const lng = locationRef.current?.coords.longitude || location?.coords.longitude;
    const dest = routeDestinationRef.current || routeDestination;
    if (!lat || !lng || !dest) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setIsRerouting(true);
    isReroutingRef.current = true;
    speakInstruction('Recalculating route directions.');

    try {
      const currentOpts: RouteOptions = {
        preferFastest,
        preferParks,
        avoidTrafficLights,
        avoidBusyRoads,
        preferCyclingLanes,
      };
      const newRoute = await fetchRealRoadRoute(lat, lng, dest.lat, dest.lng, activityType, currentOpts);
      if (newRoute) {
        setSelectedRoute(newRoute);
        selectedRouteRef.current = newRoute;
        setCurrentStepIndex(0);
        currentStepIndexRef.current = 0;
        if (newRoute.steps && newRoute.steps.length > 0) {
          speakInstruction(newRoute.steps[0].instruction);
        }
      }
    } catch (e) {
      console.warn('Manual recalculation failed:', e);
    } finally {
      setIsRerouting(false);
      isReroutingRef.current = false;
      setRerouteTrigger(null);
    }
  }, [location, routeDestination, activityType, preferFastest, preferParks, avoidTrafficLights, avoidBusyRoads, preferCyclingLanes]);

  // Heading-aligned navigation tracking: map rotates to face where you point
  const [followHeading, setFollowHeading] = useState<boolean>(false);

  // Sync refs so live location & heading subscriptions read latest flags without re-binding
  const followsUserRef = useRef<boolean>(true);
  const followHeadingRef = useRef<boolean>(false);
  const is3DRef = useRef<boolean>(false);
  const headingRef = useRef<number>(0);
  const cameraBearingRef = useRef<number>(0);
  const cameraPitchRef = useRef<number>(0);
  const locationRef = useRef<Location.LocationObject | null>(null);

  // Navigation refs (read inside location closure without stale state)
  const selectedRouteRef = useRef<RealRouteResult | null>(null);
  const currentStepIndexRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const isReroutingRef = useRef<boolean>(false);
  const routeDestinationRef = useRef<{ lat: number; lng: number } | null>(null);  // Jitter-prevention throttles for compass/heading updates
  const lastAnimatedHeadingRef = useRef<number>(0);
  const lastCameraTimeRef = useRef<number>(0);

  useEffect(() => { followsUserRef.current = followsUser; }, [followsUser]);
  useEffect(() => { followHeadingRef.current = followHeading; }, [followHeading]);
  useEffect(() => { is3DRef.current = is3D; }, [is3D]);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { cameraBearingRef.current = cameraBearing; }, [cameraBearing]);
  useEffect(() => { cameraPitchRef.current = cameraPitch; }, [cameraPitch]);

  // Navigation ref sync
  useEffect(() => { selectedRouteRef.current = selectedRoute; }, [selectedRoute]);
  useEffect(() => { currentStepIndexRef.current = currentStepIndex; }, [currentStepIndex]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isReroutingRef.current = isRerouting; }, [isRerouting]);
  useEffect(() => { routeDestinationRef.current = routeDestination; }, [routeDestination]);

  const mapRef = useRef<MapView | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const headingSubRef = useRef<Location.LocationSubscription | null>(null);


  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    (async () => {
      const p = await loadUserProfile();
      setProfile(p);
      setModalUnits(p.unitSystem);
      setTempGender(p.gender);
      setTempAge(p.age.toString());
      if (p.unitSystem === 'us_customary') {
        setTempWeight(kgToLbs(p.weightKg).toString());
        const totalInches = Math.round(p.heightCm / 2.54);
        setTempHeightFeet(Math.floor(totalInches / 12).toString());
        setTempHeightInches((totalInches % 12).toString());
        setTempHeight(totalInches.toString());
      } else {
        setTempWeight(Math.round(p.weightKg).toString());
        setTempHeight(Math.round(p.heightCm).toString());
      }
    })();
  }, [isRecording]);

  // Load past recorded workouts to display on the map
  const fetchPastWalks = useCallback(async () => {
    if (!user) return;
    try {
      const records = await loadWalks(user.id);
      setPastWalks(records || []);
    } catch (e) {
      console.warn('Failed to load past walks for map overlay:', e);
    }
  }, [user]);

  useEffect(() => {
    fetchPastWalks();
  }, [fetchPastWalks]);

  // Load friends and their live cursors/trails for map display
  const fetchFriendsForMap = useCallback(async () => {
    const uid = user?.id || 'guest_user';
    try {
      const f = await loadFriends(uid);
      setFriendsOnMap(f || []);
    } catch (e) {
      console.warn('Failed to load friends for map:', e);
    }
  }, [user]);

  useEffect(() => {
    fetchFriendsForMap();
  }, [fetchFriendsForMap]);

  const initTracking = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionStatus('denied');
        setErrorMsg('Location permission required. Please enable location to use Footprint.');
        setIsLoading(false);
        return;
      }
      setPermissionStatus('granted');

      try {
        const bgStatus = await Location.getBackgroundPermissionsAsync();
        setBackgroundPermission(bgStatus.status === 'granted');
      } catch {
        setBackgroundPermission(false);
      }

      const initialPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(initialPos);
      if (typeof initialPos?.coords?.altitude === 'number') {
        setCurrentAltitude(initialPos.coords.altitude);
      }

      if (mapRef.current && initialPos) {
        mapRef.current.animateToRegion({
          latitude: initialPos.coords.latitude,
          longitude: initialPos.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
      }

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (newLocation) => {
          setLocation(newLocation);
          if (typeof newLocation?.coords?.altitude === 'number') {
            setCurrentAltitude(newLocation.coords.altitude);
          }
          if (isRecordingRef.current) {
            setRouteCoordinates((prevCoords) => {
              if (prevCoords.length > 0) {
                const last = prevCoords[prevCoords.length - 1];
                const addedDist = calculateDistance(
                  last.latitude,
                  last.longitude,
                  newLocation.coords.latitude,
                  newLocation.coords.longitude
                );
                if (addedDist > 1) {
                  setTotalDistanceMeters((prevDist) => prevDist + addedDist);
                  return [
                    ...prevCoords,
                    { latitude: newLocation.coords.latitude, longitude: newLocation.coords.longitude },
                  ];
                }
                return prevCoords;
              }
              return [{ latitude: newLocation.coords.latitude, longitude: newLocation.coords.longitude }];
            });

            // ── Active Navigation: step advancement + reroute detection ──
            const route = selectedRouteRef.current;
            if (route?.steps && !isReroutingRef.current) {
              const steps = route.steps;
              const stepIdx = currentStepIndexRef.current;
              const lat = newLocation.coords.latitude;
              const lng = newLocation.coords.longitude;

              // Advance to next step if within 25 m of the current step's location
              if (stepIdx < steps.length && steps[stepIdx].location) {
                const stepLoc = steps[stepIdx].location!;
                const distToStep = calculateDistance(lat, lng, stepLoc.latitude, stepLoc.longitude);
                setDistToNextTurn(Math.round(distToStep));

                if (distToStep < 25 && stepIdx + 1 < steps.length) {
                  const nextIdx = stepIdx + 1;
                  currentStepIndexRef.current = nextIdx;
                  setCurrentStepIndex(nextIdx);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  if (steps[nextIdx]?.instruction) {
                    speakInstruction(steps[nextIdx].instruction);
                  }
                }
              }

              // Deviation check: sample route coords every ~5 points
              const coords = route.coordinates;
              let minDist = 99999;
              const sampleStep = Math.max(1, Math.floor(coords.length / 40));
              for (let i = 0; i < coords.length; i += sampleStep) {
                const d = calculateDistance(lat, lng, coords[i].latitude, coords[i].longitude);
                if (d < minDist) minDist = d;
                if (minDist < 60) break; // close enough, skip rest
              }
              if (minDist > 80 && routeDestinationRef.current) {
                isReroutingRef.current = true; // prevent multiple triggers
                setRerouteTrigger({ lat, lng });
                speakInstruction('Off route. Recalculating directions.');
              }
            }
          }

          // If tracking centered position, automatically re-center camera
          if (followsUserRef.current && mapRef.current) {
            const currentHead = headingRef.current;
            if (is3DRef.current || followHeadingRef.current) {
              mapRef.current.animateCamera(
                {
                  center: {
                    latitude: newLocation.coords.latitude,
                    longitude: newLocation.coords.longitude,
                  },
                  pitch: is3DRef.current ? 65 : 0,
                  heading: followHeadingRef.current ? currentHead : cameraBearingRef.current,
                },
                { duration: 400 }
              );
            } else {
              mapRef.current.animateCamera(
                {
                  center: {
                    latitude: newLocation.coords.latitude,
                    longitude: newLocation.coords.longitude,
                  },
                },
                { duration: 400 }
              );
            }
          }
        }
      );

      headingSubRef.current = await Location.watchHeadingAsync((newHeading) => {
        const currentHeading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magHeading;
        const roundedHeading = Math.round(currentHeading);
        setHeading(roundedHeading);
        headingRef.current = roundedHeading;

        // Smooth rotation when locked to heading:
        // 1. Only animate if bearing shifted by >= 2.5 degrees (avoids micro-sensor noise/tremor)
        // 2. Throttle camera animation to at most once per 280ms to prevent animation queuing stutter
        if (followsUserRef.current && followHeadingRef.current && mapRef.current && locationRef.current) {
          const now = Date.now();
          const lastH = lastAnimatedHeadingRef.current;
          let diff = Math.abs(roundedHeading - lastH);
          if (diff > 180) diff = 360 - diff; // circular angle difference

          if (diff >= 3 && now - lastCameraTimeRef.current >= 280) {
            lastAnimatedHeadingRef.current = roundedHeading;
            lastCameraTimeRef.current = now;
            cameraBearingRef.current = roundedHeading;
            setCameraBearing(roundedHeading);

            mapRef.current.animateCamera(
              {
                center: {
                  latitude: locationRef.current.coords.latitude,
                  longitude: locationRef.current.coords.longitude,
                },
                pitch: is3DRef.current ? 65 : 0,
                heading: roundedHeading,
              },
              { duration: 320 }
            );
          }
        }
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to initialize GPS & Compass.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initTracking();
    return () => {
      locationSubRef.current?.remove();
      headingSubRef.current?.remove();
    };
  }, [isRecording]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // 3D Camera Tilt Toggle (works in Standard, Hybrid, Satellite, and Terrain)
  const toggle3D = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const next3D = !is3D;
    setIs3D(next3D);
    is3DRef.current = next3D; // sync immediately so camera-follow picks it up

    if (mapRef.current) {
      const center = location
        ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
        : undefined;

      const targetHeading = headingRef.current || heading || cameraBearingRef.current || cameraBearing || 0;

      // Animate immediately
      mapRef.current.animateCamera(
        {
          ...(center ? { center } : {}),
          pitch: next3D ? 65 : 0,
          heading: next3D ? targetHeading : 0,
          altitude: next3D ? 450 : 1200,
          zoom: next3D ? 18.5 : 16,
        },
        { duration: 700 }
      );

      // Follow-up frame ensures orientation locks in satellite mode without native desync
      setTimeout(() => {
        if (mapRef.current && is3DRef.current === next3D) {
          mapRef.current.animateCamera(
            {
              pitch: next3D ? 65 : 0,
              heading: next3D ? (headingRef.current || targetHeading) : 0,
            },
            { duration: 300 }
          );
        }
      }, 150);
    }
  };

  // Map layer switcher modal state
  const [showMapLayersModal, setShowMapLayersModal] = useState<boolean>(false);

  const selectMapType = (newType: MapType) => {
    Haptics.selectionAsync().catch(() => {});
    setMapType(newType);
    setShowMapLayersModal(false);

    // If selecting satellite or hybrid, automatically engage 3D mode so it's not a flat 2D satellite photo
    const should3D = is3D || newType === 'satelliteFlyover' || newType === 'hybridFlyover' || newType === 'satellite' || newType === 'hybrid';
    if (should3D && !is3D) {
      setIs3D(true);
      is3DRef.current = true;
    }

    if (mapRef.current && location) {
      setTimeout(() => {
        mapRef.current?.animateCamera({
          center: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
          pitch: should3D ? 65 : 0,
          heading: headingRef.current || cameraBearingRef.current || 0,
          altitude: should3D ? 450 : 1200,
          zoom: should3D ? 18.5 : 16,
        }, { duration: 600 });
      }, 100);
    }
  };


  const handleSelectFriend = (fr: FriendUser) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedFriend(selectedFriend?.id === fr.id ? null : fr);
    const coord = fr.currentLocation;
    if (coord && mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: coord.latitude,
            longitude: coord.longitude,
          },
        },
        { duration: 400 }
      );
    }
  };

  const handleToggleWalk = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!isRecording) {
      // If user hasn't calibrated measurements yet, ask once. Once completed, never ask again!
      // Measurements are adjusted anytime in the Profile / Settings tab.
      if (!profile.hasCompletedSetup) {
        setShowSetupModal(true);
        return;
      }

      startActiveRecording();
    } else {
      stopActiveRecording();
    }
  };

  const handleUseDefaultsAndStart = async () => {
    const updated: UserProfile = {
      ...profile,
      weightKg: 70,
      heightCm: 175,
      age: 28,
      gender: 'na',
      unitSystem: 'us_customary',
      hasCompletedSetup: true,
    };
    setProfile(updated);
    await saveUserProfile(updated);
    setShowSetupModal(false);
    startActiveRecording();
  };

  const handleSaveCustomSetupAndStart = async () => {
    let canonicalKg = parseFloat(tempWeight) || 70;
    let canonicalCm = parseFloat(tempHeight) || 175;
    if (modalUnits === 'us_customary') {
      canonicalKg = lbsToKg(parseFloat(tempWeight) || 154);
      const ft = parseInt(tempHeightFeet, 10) || 5;
      const inch = parseInt(tempHeightInches, 10) || 9;
      const totalInches = ft * 12 + inch;
      canonicalCm = totalInches * 2.54;
    }

    const updated: UserProfile = {
      ...profile,
      weightKg: canonicalKg,
      heightCm: canonicalCm,
      age: parseInt(tempAge, 10) || 28,
      gender: tempGender,
      unitSystem: modalUnits,
      hasCompletedSetup: true,
    };
    setProfile(updated);
    await saveUserProfile(updated);
    setShowSetupModal(false);
    startActiveRecording();
  };

  const startActiveRecording = () => {
    setShowSetupModal(false);
    setElapsedSeconds(0);
    setTotalDistanceMeters(0);
    setCurrentStepIndex(0);
    currentStepIndexRef.current = 0;
    setDistToNextTurn(0);
    // Save destination for rerouting if a route is already selected
    if (selectedRouteRef.current && selectedRouteRef.current.coordinates.length > 0) {
      const last = selectedRouteRef.current.coordinates[selectedRouteRef.current.coordinates.length - 1];
      setRouteDestination({ lat: last.latitude, lng: last.longitude });
    }
    if (location) {
      setRouteCoordinates([{ latitude: location.coords.latitude, longitude: location.coords.longitude }]);
    } else {
      setRouteCoordinates([]);
    }
    setIsRecording(true);
    if (selectedRouteRef.current?.steps && selectedRouteRef.current.steps.length > 0) {
      speakInstruction(selectedRouteRef.current.steps[0].instruction);
    }
  };

  const handleSearchChange = async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const lat = location?.coords.latitude || 37.33182;
    const lng = location?.coords.longitude || -122.03118;
    const results = await searchPlaces(text, lat, lng);
    setSearchResults(results);
    setIsSearching(false);
  };

  // Build a RouteOptions object from current preference state
  const routeOptions: RouteOptions = {
    preferFastest: preferFastest || (!preferParks && !avoidTrafficLights && !avoidBusyRoads),
    preferParks,
    avoidTrafficLights,
    avoidBusyRoads,
    preferCyclingLanes,
  };

  const handleGenerateRoutes = async (
    distKm: number = targetDistanceKm,
    elevPref: 'flat' | 'rolling' | 'hilly' | null = targetElevation,
    opts: RouteOptions = routeOptions,
    type: 'loop' | 'oneway' = routeType
  ) => {
    const lat = location?.coords.latitude || 37.33182;
    const lng = location?.coords.longitude || -122.03118;
    setIsGeneratingRoutes(true);
    try {
      const suggestions = await generateRealCircuitSuggestions(
        lat,
        lng,
        distKm,
        elevPref,
        activityType,
        opts,
        type
      );
      setRouteSuggestions(suggestions);

      // Zoom out map to show all generated routes in full view above the bottom card
      if (suggestions.length > 0 && mapRef.current) {
        const allCoords: Array<{ latitude: number; longitude: number }> = [];
        for (const s of suggestions) {
          if (s.coordinates && s.coordinates.length > 0) {
            allCoords.push(...s.coordinates);
          }
        }
        if (allCoords.length > 0) {
          setTimeout(() => {
            mapRef.current?.fitToCoordinates(allCoords, {
              edgePadding: { top: 90, right: 40, bottom: 420, left: 40 },
              animated: true,
            });
          }, 100);
        }
      }
    } catch (e) {
      console.warn('generateRealCircuitSuggestions failed:', e);
    } finally {
      setIsGeneratingRoutes(false);
    }
  };


  // Recalculates turn-by-turn road route across current user position + all stops in order
  const recalculateRouteWithStops = async (stopsList: GeocodedPlace[], opts: RouteOptions = routeOptions) => {
    const startLat = location?.coords.latitude || 37.33182;
    const startLng = location?.coords.longitude || -122.03118;

    if (stopsList.length === 0) {
      handleClearSuggestedRoute();
      return;
    }

    setIsSearching(true);
    if (stopsList.length === 1) {
      const dest = stopsList[0];
      const realRoute = await fetchRealRoadRoute(
        startLat,
        startLng,
        dest.latitude,
        dest.longitude,
        activityType,
        opts
      );
      setIsSearching(false);
      if (realRoute) {
        realRoute.destinationName = dest.shortName;
        setSelectedRoute(realRoute);
        setRouteDestination({ lat: dest.latitude, lng: dest.longitude });
        setCurrentStepIndex(0);
        currentStepIndexRef.current = 0;
        if (mapRef.current && realRoute.coordinates.length > 0) {
          mapRef.current.fitToCoordinates(realRoute.coordinates, {
            edgePadding: { top: 180, right: 60, bottom: 280, left: 60 },
            animated: true,
          });
        }
      }
    } else {
      // Build waypoints: Current GPS user location -> Stop 1 -> Stop 2 ... -> Final Stop
      const waypoints = [
        { latitude: startLat, longitude: startLng, name: 'Current Location' },
        ...stopsList.map((s) => ({
          latitude: s.latitude,
          longitude: s.longitude,
          name: s.shortName,
        })),
      ];
      const multiRoute = await fetchMultiStopRoute(waypoints, activityType, opts);
      setIsSearching(false);
      if (multiRoute) {
        const lastStop = stopsList[stopsList.length - 1];
        multiRoute.destinationName = lastStop.shortName;
        setSelectedRoute(multiRoute);
        setRouteDestination({ lat: lastStop.latitude, lng: lastStop.longitude });
        setCurrentStepIndex(0);
        currentStepIndexRef.current = 0;
        if (mapRef.current && multiRoute.coordinates.length > 0) {
          mapRef.current.fitToCoordinates(multiRoute.coordinates, {
            edgePadding: { top: 180, right: 60, bottom: 280, left: 60 },
            animated: true,
          });
        }
      }
    }
  };

  const handleSelectSearchResult = async (place: GeocodedPlace) => {
    Keyboard.dismiss();
    setSearchResults([]);
    setIsAddingStopMode(false);

    if (isAddingStopMode || (selectedRoute && !isNavigating)) {
      // If user pressed "Add Stop", append to existing stops
      await handleAddStopToRoute(place);
      return;
    }

    setSearchQuery(place.shortName);
    setPreviewPlace(place);
    setIsNavigating(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const newStops = [place];
    setRouteStops(newStops);
    await recalculateRouteWithStops(newStops);
  };

  const handleAddStopToRoute = async (place: GeocodedPlace) => {
    Keyboard.dismiss();
    setSearchResults([]);
    setSearchQuery('');
    setIsAddingStopMode(false);
    setPlaceActionTarget(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    // Ensure previewPlace is established if this was first stop
    if (!previewPlace) {
      setPreviewPlace(routeStops[routeStops.length - 1] || place);
    }

    const newStops = [...routeStops, place];
    setRouteStops(newStops);
    await recalculateRouteWithStops(newStops);
  };

  const handleRemoveStop = async (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const updated = routeStops.filter((_, idx) => idx !== index);
    setRouteStops(updated);
    if (updated.length === 0) {
      if (previewPlace) {
        // Fall back to original single destination
        setRouteStops([previewPlace]);
        await recalculateRouteWithStops([previewPlace]);
      } else {
        handleClearSuggestedRoute();
      }
    } else {
      await recalculateRouteWithStops(updated);
    }
  };

  const handleMoveStop = async (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= routeStops.length || fromIndex === toIndex) return;
    Haptics.selectionAsync().catch(() => {});
    const updated = [...routeStops];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setRouteStops(updated);
    await recalculateRouteWithStops(updated);
  };

  const handleUpdateStopCoordinate = async (index: number, newCoord: { latitude: number; longitude: number }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const updated = routeStops.map((stop, idx) => {
      if (idx === index) {
        return {
          ...stop,
          latitude: newCoord.latitude,
          longitude: newCoord.longitude,
        };
      }
      return stop;
    });
    setRouteStops(updated);
    await recalculateRouteWithStops(updated);
  };

  const handleStartNavigating = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsNavigating(true);
    setPreviewPlace(null);
    setShowStopsManager(false);
    setCurrentStepIndex(0);
    currentStepIndexRef.current = 0;
    if (selectedRoute?.steps && selectedRoute.steps.length > 0) {
      speakInstruction(selectedRoute.steps[0].instruction);
    }
    if (mapRef.current && selectedRoute && selectedRoute.coordinates.length > 0) {
      mapRef.current.fitToCoordinates(selectedRoute.coordinates, {
        edgePadding: { top: 180, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }
  };

  const handlePreviewRoute = (route: RealRouteResult) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedRoute(route);
    if (route.coordinates.length > 0) {
      const last = route.coordinates[route.coordinates.length - 1];
      setRouteDestination({ lat: last.latitude, lng: last.longitude });
    }
    if (mapRef.current && route.coordinates.length > 0) {
      mapRef.current.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 90, right: 40, bottom: 420, left: 40 },
        animated: true,
      });
    }
  };

  const handleSelectRoute = (route: RealRouteResult) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedRoute(route);
    setShowRouteModal(false);
    setIsNavigating(true);
    setCurrentStepIndex(0);
    currentStepIndexRef.current = 0;
    // Last coord of a circuit route is the destination
    if (route.coordinates.length > 0) {
      const last = route.coordinates[route.coordinates.length - 1];
      setRouteDestination({ lat: last.latitude, lng: last.longitude });
    }
    if (route.steps && route.steps.length > 0) {
      speakInstruction(route.steps[0].instruction);
    }
    if (mapRef.current && route.coordinates.length > 0) {
      mapRef.current.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 180, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }
  };

  const handleClearSuggestedRoute = () => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedRoute(null);
    setPreviewPlace(null);
    setRouteStops([]);
    setShowStopsManager(false);
    setPlaceActionTarget(null);
    setIsNavigating(false);
    setSearchQuery('');
    setShowDirections(false);
    setRouteDestination(null);
    setCurrentStepIndex(0);
    currentStepIndexRef.current = 0;
    setDistToNextTurn(0);
  };

  // Reroute when user deviates >80 m from the planned route
  useEffect(() => {
    if (!rerouteTrigger) return;
    const { lat, lng } = rerouteTrigger;
    const dest = routeDestination;
    if (!dest) {
      setRerouteTrigger(null);
      isReroutingRef.current = false;
      return;
    }
    setIsRerouting(true);
    fetchRealRoadRoute(lat, lng, dest.lat, dest.lng, activityType, routeOptions)
      .then((newRoute) => {
        if (newRoute) {
          setSelectedRoute(newRoute);
          setCurrentStepIndex(0);
          currentStepIndexRef.current = 0;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
      })
      .finally(() => {
        setIsRerouting(false);
        isReroutingRef.current = false;
        setRerouteTrigger(null);
      });
  }, [rerouteTrigger]);


  // Calculate passed and upcoming portions of the selected route for directions mode
  const { passedRouteCoordinates, upcomingRouteCoordinates } = useMemo(() => {
    if (!selectedRoute?.coordinates || selectedRoute.coordinates.length === 0 || !location) {
      return { passedRouteCoordinates: [], upcomingRouteCoordinates: selectedRoute?.coordinates || [] };
    }
    let closestIdx = 0;
    let minDist = Infinity;
    const { latitude: curLat, longitude: curLon } = location.coords;
    selectedRoute.coordinates.forEach((pt, idx) => {
      const d = (pt.latitude - curLat) ** 2 + (pt.longitude - curLon) ** 2;
      if (d < minDist) {
        minDist = d;
        closestIdx = idx;
      }
    });
    return {
      passedRouteCoordinates: selectedRoute.coordinates.slice(0, closestIdx + 1),
      upcomingRouteCoordinates: selectedRoute.coordinates.slice(closestIdx),
    };
  }, [selectedRoute, location]);

  const stopActiveRecording = () => {
    setIsRecording(false);
    try { Speech.stop(); } catch (_) {}
    const mins = elapsedSeconds / 60;
    const burnedCalories = calculateScientificCaloriesBurned(
      profile.weightKg,
      profile.heightCm,
      profile.age,
      profile.gender,
      mins,
      totalDistanceMeters,
      activityType
    );

  const isUS = profile.unitSystem === 'us_customary';
    const mainUnitsDist = isUS ? metersToMiles(totalDistanceMeters) : metersToKm(totalDistanceMeters);
    const paceMinPerUnit = mainUnitsDist > 0.03 ? Math.floor(mins / mainUnitsDist) : 0;
    const paceSecPerUnit = mainUnitsDist > 0.03 ? Math.round(((mins / mainUnitsDist) % 1) * 60) : 0;
    const paceString = mainUnitsDist > 0.03 ? `${paceMinPerUnit}'${paceSecPerUnit.toString().padStart(2, '0')}"` : '--:--';
    const estimatedSteps = Math.round(totalDistanceMeters * 1.31);

    setCompletedSummary({
      distanceMeters: totalDistanceMeters,
      durationSeconds: elapsedSeconds,
      avgPace: paceString,
      calories: burnedCalories,
      steps: estimatedSteps,
    });

    if (user && (totalDistanceMeters > 5 || elapsedSeconds > 10)) {
      saveWalk(user.id, {
        durationSeconds: elapsedSeconds,
        distanceMeters: totalDistanceMeters,
        calories: burnedCalories,
        steps: estimatedSteps,
        avgPace: paceString,
        activityType,
        routeCoordinates: [...routeCoordinates],
      })
        .then(() => fetchPastWalks())
        .catch((e) => console.warn('Failed to auto-save workout record:', e));
    }
  };

  const centerOnUser = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!mapRef.current) return;

    setFollowsUser(true);
    setFollowHeading(false);
    followsUserRef.current = true;
    followHeadingRef.current = false;

    // If a planned route is selected, fit camera to show the whole planned route
    if (selectedRoute && selectedRoute.coordinates.length > 0) {
      mapRef.current.fitToCoordinates(selectedRoute.coordinates, {
        edgePadding: { top: 180, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
      return;
    }

    // If an active walk trail is recorded with multiple coordinates, frame the entire recorded route
    if (routeCoordinates.length > 1) {
      mapRef.current.fitToCoordinates(routeCoordinates, {
        edgePadding: { top: 180, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
      return;
    }

    // Otherwise, center directly onto current location
    if (location) {
      cameraBearingRef.current = 0;
      setCameraBearing(0);
      lastAnimatedHeadingRef.current = 0;

      mapRef.current.animateCamera(
        {
          center: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
          pitch: is3D ? 65 : 0,
          heading: 0,
          zoom: 17,
        },
        { duration: 600 }
      );
    }
  };

  const googleMapStyleNoLabels = [
    {
      featureType: 'poi',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'poi.business',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'landscape.man_made',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'transit',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
  ];

  const getCardinalDirection = (deg: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    return directions[Math.round(deg / 45) % 8];
  };

  const isUS = profile.unitSystem === 'us_customary';
  const displayDistance = isUS
    ? metersToMiles(totalDistanceMeters).toFixed(2)
    : metersToKm(totalDistanceMeters).toFixed(2);
  const distanceUnitLabel = isUS ? 'MILES' : 'KM';

  const durationMins = elapsedSeconds / 60;
  const liveCalories = calculateScientificCaloriesBurned(
    profile.weightKg,
    profile.heightCm,
    profile.age,
    profile.gender,
    durationMins,
    totalDistanceMeters,
    activityType
  );

  const initialRegion: Region = {
    latitude: location?.coords.latitude || 37.33182,
    longitude: location?.coords.longitude || -122.03118,
    latitudeDelta: 0.006,
    longitudeDelta: 0.006,
  };

  /**
   * Marker Angle & 3D Perspective Calculations:
   * The flat=true Marker rotates with the map in 2D screen space.
   * We subtract the live camera bearing so the arrow always points
   * in the correct compass direction regardless of how the map is rotated.
   * The Ionicons "navigate" glyph has a built-in 45° NE offset that we cancel out.
   */
  const arrowRotationAngle = (heading - cameraBearing - 45 + 720) % 360;

  // In 3D mode (or whenever the camera is tilted in elevation), the cursor marker
  // dynamically alters its dimensions/rotateX to stay perfectly flat against the 3D surface.
  const effectiveMarkerPitch = is3D ? (cameraPitch > 10 ? Math.min(cameraPitch, 70) : 65) : (cameraPitch > 10 ? Math.min(cameraPitch, 70) : 0);

  // Google Maps / Platform Custom Styling to turn off all POI/building labels when toggled off
  

  // When satellite is chosen, retain satellite imagery in both 2D and 3D mode.
  const effectiveMapType: MapType = useMemo(() => {
    if (mapType === 'satellite') {
      return 'satellite';
    }
    if (mapType === 'hybrid' || mapType === 'satelliteFlyover' || mapType === 'hybridFlyover') {
      return Platform.OS === 'ios' && is3D ? 'hybridFlyover' : 'hybrid';
    }
    // Always provide terrain topography as the native map type for standard and muted modes
    return 'terrain';
  }, [mapType, is3D]);

  // Google Maps styling that ensures landscape elevation & contours remain visible while respecting label visibility
  const currentMapStyle = useMemo(() => {
    const baseTerrainStyling = [
      {
        featureType: 'landscape.natural.terrain',
        elementType: 'geometry',
        stylers: [{ visibility: 'on' }],
      },
    ];
    if (showsBuildings) {
      return baseTerrainStyling;
    }
    return [...googleMapStyleNoLabels, ...baseTerrainStyling];
  }, [showsBuildings]);

  return (
    <View style={styles.container}>
      {/* Edge-to-Edge Map with Native 3D Building Models & Labels Toggle */}
      <MapView
        key={`map_${mapTheme}_${effectiveMapType}_${showsBuildings ? 'bldg_on' : 'bldg_off'}`}
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        mapType={effectiveMapType}
        userInterfaceStyle={mapTheme === 'light' ? 'light' : 'dark'}
        showsBuildings={showsBuildings}
        showsPointsOfInterests={showsBuildings}
        customMapStyle={currentMapStyle}
        showsUserLocation={false}
        showsCompass={false}
        showsScale={true}
        pitchEnabled={true}
        rotateEnabled={true}
        onPanDrag={() => {
          setFollowsUser(false);
          setFollowHeading(false);
          followsUserRef.current = false;
          followHeadingRef.current = false;
        }}
        onRegionChangeComplete={async () => {
          // Sync live camera bearing so the navigator pointer stays accurate on rotation
          if (mapRef.current) {
            try {
              const cam = await (mapRef.current as any).getCamera();
              if (typeof cam?.heading === 'number') {
                setCameraBearing(cam.heading);
              }
              if (typeof cam?.pitch === 'number') {
                setCameraPitch(Math.round(cam.pitch));
                cameraPitchRef.current = Math.round(cam.pitch);
              }
            } catch (_) {}
          }
        }}
      >
        {/* Past Workouts Historical Activity Overlay: Clean vibrant green trail line */}
        {showPastWalks && pastWalks.length > 0 && pastWalks.map((walk, wIdx) => {
          if (!walk.routeCoordinates || walk.routeCoordinates.length < 2) return null;
          return (
            <Polyline
              key={`past_walk_${walk.id || wIdx}`}
              coordinates={walk.routeCoordinates}
              strokeColor="#22c55e"
              strokeWidth={3.5}
              lineCap="round"
              lineJoin="round"
              zIndex={4}
            />
          );
        })}

        {/* Live Friends Trails on Map */}
        {friendsOnMap && friendsOnMap.length > 0 && friendsOnMap.map((fr) => {
          if (!fr.recentTrail || fr.recentTrail.length < 2) return null;
          const frColor = fr.avatarColor || '#a855f7';
          return (
            <Polyline
              key={`friend_trail_${fr.id}`}
              coordinates={fr.recentTrail}
              strokeColor={frColor}
              strokeWidth={3.5}
              lineCap="round"
              lineJoin="round"
              zIndex={5}
            />
          );
        })}

        {/* Live Friends Directional Cursors on Map */}
        {friendsOnMap && friendsOnMap.length > 0 && friendsOnMap.map((fr) => {
          if (!fr.currentLocation) return null;
          const frColor = fr.avatarColor || '#a855f7';
          const isSelected = selectedFriend?.id === fr.id;
          const heading = fr.currentLocation.heading ?? 0;

          return (
            <Marker
              key={`friend_marker_${fr.id}`}
              coordinate={{ latitude: fr.currentLocation.latitude, longitude: fr.currentLocation.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat={true}
              zIndex={isSelected ? 35 : 25}
              onPress={() => handleSelectFriend(fr)}
            >
              <View style={styles.friendCursorContainer}>
                {/* Sleek Directional Pointer / Navigator Arrow Cursor */}
                <View
                  style={[
                    styles.friendCursorPointerWrap,
                    {
                      transform: [{ rotate: `${heading}deg` }],
                    },
                  ]}
                >
                  <Ionicons
                    name="navigate"
                    size={28}
                    color={frColor}
                    style={styles.friendCursorIcon}
                  />
                </View>
              </View>
            </Marker>
          );
        })}

        {/* Suggested Route Paths Overlay (when Route Explorer sheet is open and no route is active yet) */}
        {showRouteModal && !selectedRoute && routeSuggestions.map((route, idx) => {
          const color = ROUTE_PALETTE[idx % ROUTE_PALETTE.length];
          return (
            <React.Fragment key={`sugg_route_frag_${route.id || idx}`}>
              <Polyline
                coordinates={route.coordinates}
                strokeColor={color}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
                zIndex={5}
              />
              {/* Dedicated Bike Lane overlay: distinct vibrant green glow where bike path applies (CYCLE MODE ONLY) */}
              {activityType === 'cycle' && route.bikeLaneSegments && route.bikeLaneSegments.map((seg, sIdx) => (
                <Polyline
                  key={`sugg_bike_lane_${route.id || idx}_${sIdx}`}
                  coordinates={seg}
                  strokeColor="#00e676"
                  strokeWidth={7}
                  lineCap="round"
                  lineJoin="round"
                  zIndex={6}
                />
              ))}
              {/* Start Point Pin with Matching Route Color */}
              <Marker
                coordinate={route.coordinates[0]}
                title={route.name}
                pinColor={color}
              />
              {/* Highlight / Spot Points along this suggested route */}
              {route.pois && route.pois.map((poi, pIdx) => {
                const pCoord = poi.coordinate || (route.coordinates.length > 0
                  ? route.coordinates[Math.min(route.coordinates.length - 1, Math.floor(((pIdx + 1) / (route.pois!.length + 1)) * (route.coordinates.length - 1)))]
                  : null);
                if (!pCoord) return null;
                const catIcon =
                  poi.category === 'park' ? 'leaf'
                  : poi.category === 'water' ? 'water'
                  : poi.category === 'viewpoint' ? 'eye'
                  : poi.category === 'trail' ? 'walk'
                  : 'compass';

                return (
                  <Marker
                    key={`poi_marker_${poi.id || pIdx}`}
                    coordinate={pCoord}
                    title={poi.name}
                    description={`${poi.category.toUpperCase()} • ${poi.distanceAlongKm || 0} km along path`}
                    zIndex={12}
                  >
                    <View style={{ alignItems: 'center' }}>
                      {showsBuildings && (
                        <View style={[styles.poiCalloutBadge, { backgroundColor: '#18181b', borderColor: color }]}>
                          <Text style={styles.poiCalloutText} numberOfLines={1}>
                            {poi.name}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.mapPoiPin, { backgroundColor: color, borderColor: '#ffffff' }]}>
                        <Ionicons name={catIcon as any} size={11} color="#ffffff" />
                      </View>
                    </View>
                  </Marker>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Selected Route Polyline in Directions Mode: split into passed (dark/greyed out) and upcoming (vibrant cyan) */}
        {selectedRoute && selectedRoute.coordinates.length > 1 && (
          <>
            {/* 1. Passed portion of route: darker, greyed out, muted trail showing how far you went */}
            {passedRouteCoordinates.length > 1 && (
              <Polyline
                coordinates={passedRouteCoordinates}
                strokeColor={mapTheme === 'light' ? 'rgba(100, 116, 139, 0.65)' : 'rgba(71, 85, 105, 0.7)'}
                strokeWidth={5.5}
                lineCap="round"
                lineJoin="round"
                zIndex={14}
              />
            )}

            {/* 2. Upcoming portion of route: vibrant cyan line */}
            {upcomingRouteCoordinates.length > 1 ? (
              <Polyline
                coordinates={upcomingRouteCoordinates}
                strokeColor="#38bdf8"
                strokeWidth={6.5}
                lineCap="round"
                lineJoin="round"
                zIndex={15}
              />
            ) : passedRouteCoordinates.length <= 1 ? (
              <Polyline
                coordinates={selectedRoute.coordinates}
                strokeColor="#38bdf8"
                strokeWidth={6.5}
                lineCap="round"
                lineJoin="round"
                zIndex={15}
              />
            ) : null}

            {/* Dedicated Bike Lane Paths in a separate high-visibility color (#00e676) ONLY in cycle mode */}
            {activityType === 'cycle' && selectedRoute.bikeLaneSegments && selectedRoute.bikeLaneSegments.map((seg, sIdx) => (
              <Polyline
                key={`selected_bike_segment_${sIdx}`}
                coordinates={seg}
                strokeColor="#00e676"
                strokeWidth={8}
                lineCap="round"
                lineJoin="round"
                zIndex={16}
              />
            ))}
            {/* Multi-Stop Interactive Markers (Draggable to adjust locations along route) */}
            {routeStops.length > 0 ? (
              routeStops.map((stop, sIdx) => {
                const isFirst = sIdx === 0;
                const isLast = sIdx === routeStops.length - 1;
                const stopLabel = isLast ? '🏁' : `${sIdx + 1}`;
                const badgeColor = isLast ? '#10b981' : isFirst ? '#38bdf8' : '#f59e0b';

                return (
                  <Marker
                    key={`route_stop_${stop.placeId}_${sIdx}`}
                    coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
                    title={`${isLast ? 'Destination' : `Stop ${sIdx + 1}`}: ${stop.shortName}`}
                    description="Drag to reposition stop along road"
                    draggable={!isNavigating && !isRecording}
                    onDragEnd={(e) => {
                      const newCoord = e.nativeEvent.coordinate;
                      handleUpdateStopCoordinate(sIdx, newCoord);
                    }}
                    zIndex={30 + sIdx}
                  >
                    <View style={{ alignItems: 'center' }}>
                      <View style={[styles.stopPinBadge, { backgroundColor: badgeColor, borderColor: '#ffffff' }]}>
                        <Text style={styles.stopPinBadgeText}>{stopLabel}</Text>
                      </View>
                      <View style={[styles.stopPinTip, { borderTopColor: badgeColor }]} />
                    </View>
                  </Marker>
                );
              })
            ) : (
              <>
                {/* Fallback Start point marker */}
                <Marker
                  coordinate={selectedRoute.coordinates[0]}
                  title={selectedRoute.name || 'Route Start'}
                  pinColor={passedRouteCoordinates.length > 1 ? '#64748b' : '#38bdf8'}
                />
                {/* Fallback Destination point marker */}
                {selectedRoute.coordinates.length > 1 && (
                  <Marker
                    coordinate={selectedRoute.coordinates[selectedRoute.coordinates.length - 1]}
                    title={selectedRoute.destinationName || 'Destination'}
                    pinColor="#10b981"
                  />
                )}
              </>
            )}
            {/* Highlight Spots Along the Selected Path */}
            {selectedRoute.pois && selectedRoute.pois.map((poi, pIdx) => {
              const pCoord = poi.coordinate || (selectedRoute.coordinates.length > 0
                ? selectedRoute.coordinates[Math.min(selectedRoute.coordinates.length - 1, Math.floor(((pIdx + 1) / (selectedRoute.pois!.length + 1)) * (selectedRoute.coordinates.length - 1)))]
                : null);
              if (!pCoord) return null;
              const catIcon =
                poi.category === 'park' ? 'leaf'
                : poi.category === 'water' ? 'water'
                : poi.category === 'viewpoint' ? 'eye'
                : poi.category === 'trail' ? 'walk'
                : 'compass';

              return (
                <Marker
                  key={`selected_poi_${poi.id || pIdx}`}
                  coordinate={pCoord}
                  title={poi.name}
                  description={`${poi.category.toUpperCase()} • ${poi.distanceAlongKm || 0} km in`}
                  zIndex={20}
                >
                  <View style={{ alignItems: 'center' }}>
                    {showsBuildings && (
                      <View style={[styles.poiCalloutBadge, { backgroundColor: '#18181b', borderColor: '#38bdf8' }]}>
                        <Text style={styles.poiCalloutText} numberOfLines={1}>
                          {poi.name}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.mapPoiPin, { backgroundColor: '#38bdf8', borderColor: '#ffffff' }]}>
                      <Ionicons name={catIcon as any} size={12} color="#ffffff" />
                    </View>
                  </View>
                </Marker>
              );
            })}
          </>
        )}

        {/* Continuous Walking Trail Polyline with Smooth, Long, Multi-Stage Fading Trail */}
        {routeCoordinates.length > 1 && (
          <>
            {/* Layer 1: Base recorded route - solid gentle green base trail */}
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="rgba(163, 230, 53, 0.45)"
              strokeWidth={4.5}
              lineCap="round"
              lineJoin="round"
              zIndex={6}
            />

            {/* Layer 2: Extended long tail fade (last 80 points) */}
            {routeCoordinates.length > 8 && (
              <Polyline
                coordinates={routeCoordinates.slice(Math.max(0, routeCoordinates.length - 80))}
                strokeColor="rgba(163, 230, 53, 0.60)"
                strokeWidth={5.2}
                lineCap="round"
                lineJoin="round"
                zIndex={7}
              />
            )}

            {/* Layer 3: Smooth mid-tail transition (last 45 points) */}
            {routeCoordinates.length > 5 && (
              <Polyline
                coordinates={routeCoordinates.slice(Math.max(0, routeCoordinates.length - 45))}
                strokeColor="rgba(163, 230, 53, 0.78)"
                strokeWidth={6.0}
                lineCap="round"
                lineJoin="round"
                zIndex={8}
              />
            )}

            {/* Layer 4: Close proximity glow (last 20 points) */}
            {routeCoordinates.length > 3 && (
              <Polyline
                coordinates={routeCoordinates.slice(Math.max(0, routeCoordinates.length - 20))}
                strokeColor="rgba(190, 242, 100, 0.90)"
                strokeWidth={6.8}
                lineCap="round"
                lineJoin="round"
                zIndex={9}
              />
            )}

            {/* Layer 5: Immediate apex lead trail right behind cursor (last 8 points) */}
            <Polyline
              coordinates={routeCoordinates.slice(Math.max(0, routeCoordinates.length - 8))}
              strokeColor={themeColors.primary}
              strokeWidth={7.5}
              lineCap="round"
              lineJoin="round"
              zIndex={10}
            />
          </>
        )}

        {/* Sleek Green Navigator Arrow Marker on Map Surface */}
        {location && (
          <Marker
            coordinate={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            flat={true}
            title={typeof currentAltitude === 'number' ? `Altitude: ${Math.round(currentAltitude)}m` : 'Current Location'}
          >
            <View
              style={[
                styles.arrowMarkerContainer,
                {
                  transform: [
                    { perspective: 850 },
                    { rotateX: `${effectiveMarkerPitch}deg` }, // Dynamically changes dimensions to lay flat against terrain at any elevation tilt angle
                    { rotateZ: `${arrowRotationAngle}deg` },
                  ],
                },
              ]}
            >
              {/* Subtle 3D Extrusion Layers: In 3D elevation mode, render a bevel base shifted slightly down to give physical 3D depth */}
              {effectiveMarkerPitch > 15 && (
                <>
                  <View style={[styles.arrowMarkerExtrusionBase, { transform: [{ translateY: 3 }] }]}>
                    <Ionicons
                      name="navigate"
                      size={34}
                      color={mapTheme === 'light' ? '#0f172a' : '#020617'}
                      style={{ opacity: 0.85 }}
                    />
                  </View>
                  <View style={[styles.arrowMarkerExtrusionBase, { transform: [{ translateY: 1.5 }] }]}>
                    <Ionicons
                      name="navigate"
                      size={34}
                      color={mapTheme === 'light' ? '#334155' : '#1e293b'}
                      style={{ opacity: 0.9 }}
                    />
                  </View>
                </>
              )}

              {/* Crisp Modern Top Surface Navigation Arrow Asset - Vibrant Green */}
              <Ionicons
                name="navigate"
                size={34}
                color={themeColors.primary}
                style={styles.arrowIconShadow}
              />
            </View>
          </Marker>
        )}
      </MapView>



      {/* Top Active Navigation Card - Slides in from the top during recording with Turn Directions and Voice Audio */}
      {selectedRoute && selectedRoute.steps && selectedRoute.steps.length > 0 && (
        <Animated.View
          style={[
            styles.topNavCardContainer,
            {
              backgroundColor: themeColors.cardBg,
              borderBottomColor: '#38bdf8',
              transform: [
                {
                  translateY: navAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-240, 0],
                  }),
                },
              ],
              opacity: navAnim,
            },
          ]}
          pointerEvents={showTopNav ? 'auto' : 'none'}
        >
          {isRerouting ? (
            <View style={styles.topReroutingRow}>
              <ActivityIndicator size="small" color="#38bdf8" />
              <Text style={[styles.topReroutingText, { color: '#38bdf8' }]}>Recalculating route…</Text>
            </View>
          ) : (() => {
            const step = selectedRoute.steps[currentStepIndex] || selectedRoute.steps[0];
            const nextStep = selectedRoute.steps[currentStepIndex + 1];
            const iconName = (() => {
              if (step.maneuverType === 'depart') return 'navigate';
              if (step.maneuverType === 'arrive') return 'flag';
              if (step.modifier === 'left' || step.modifier === 'slight left') return 'arrow-back';
              if (step.modifier === 'right' || step.modifier === 'slight right') return 'arrow-forward';
              if (step.modifier === 'uturn') return 'return-up-back';
              return 'arrow-up';
            })();
            const distText = distToNextTurn >= 1000
              ? `${(distToNextTurn / 1000).toFixed(1)} km`
              : distToNextTurn > 0
                ? `${Math.round(distToNextTurn)} m`
                : step.distanceMeters >= 1000
                  ? `${(step.distanceMeters / 1000).toFixed(1)} km`
                  : `${Math.round(step.distanceMeters || 0)} m`;

            return (
              <View style={styles.topNavCardInner}>
                <View style={[styles.topNavIconWrap, { backgroundColor: 'rgba(56, 189, 248, 0.15)', borderColor: '#38bdf8' }]}>
                  <Ionicons name={iconName as any} size={22} color="#38bdf8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.topNavInstruction, { color: themeColors.text }]} numberOfLines={1}>
                    {step.instruction}
                  </Text>
                  {nextStep ? (
                    <Text style={[styles.topNavThen, { color: themeColors.textMuted }]} numberOfLines={1}>
                      Then: {nextStep.instruction}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.topNavDistBadge, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
                  <Text style={[styles.topNavDistText, { color: '#38bdf8' }]}>{distText}</Text>
                </View>
                {/* Voice Navigation Mute/Unmute Toggle */}
                <TouchableOpacity
                  style={[styles.voiceMuteBtn, { backgroundColor: isVoiceMuted ? themeColors.surfaceElevated : 'rgba(56, 189, 248, 0.15)' }]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    const next = !isVoiceMuted;
                    setIsVoiceMuted(next);
                    if (next) {
                      try { Speech.stop(); } catch (_) {}
                    } else if (step?.instruction) {
                      speakInstruction(step.instruction);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isVoiceMuted ? 'volume-mute' : 'volume-high'}
                    size={18}
                    color={isVoiceMuted ? themeColors.textMuted : '#38bdf8'}
                  />
                </TouchableOpacity>

                {/* Recalculate Button */}
                <TouchableOpacity
                  style={[styles.voiceMuteBtn, { backgroundColor: isRerouting ? 'rgba(56, 189, 248, 0.25)' : themeColors.surfaceElevated }]}
                  onPress={handleRecalculate}
                  disabled={isRerouting}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="refresh"
                    size={17}
                    color="#38bdf8"
                  />
                </TouchableOpacity>

                {/* Steps List Toggle */}
                <TouchableOpacity
                  style={[styles.voiceMuteBtn, { backgroundColor: showDirections ? 'rgba(56, 189, 248, 0.18)' : themeColors.surfaceElevated }]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowDirections(!showDirections);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="list"
                    size={17}
                    color="#38bdf8"
                  />
                </TouchableOpacity>

                {/* Clear / Dismiss Route Button (when not actively recording) */}
                {!isRecording && (
                  <TouchableOpacity
                    style={[styles.voiceMuteBtn, { backgroundColor: themeColors.surfaceElevated }]}
                    onPress={handleClearSuggestedRoute}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="close"
                      size={18}
                      color={themeColors.textMuted}
                    />
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}
        </Animated.View>
      )}

      {/* Top Header Bar: Visible normally OR when user taps Add Stop on preview route */}
      {!isRecording && (!selectedRoute || isAddingStopMode) && (
        <Animated.View
          style={[
            styles.unifiedTopBar,
            {
              backgroundColor: themeColors.cardBg,
              borderColor: themeColors.border,
              shadowOpacity: hudShadowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.12],
              }),
              shadowRadius: hudShadowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 10],
              }),
              elevation: hudShadowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 3],
              }),
            },
          ]}
        >
          {/* Activity Mode Dropdown Trigger – icon only (or Back button if in Add Stop mode) */}
          {isAddingStopMode ? (
            <TouchableOpacity
              style={styles.unifiedActivityBtn}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setIsAddingStopMode(false);
                setSearchQuery('');
                setSearchResults([]);
                Keyboard.dismiss();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={18} color={themeColors.primary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.unifiedActivityBtn}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setIsActivityDropdownOpen(!isActivityDropdownOpen);
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={activityType === 'walk' ? 'walk' : activityType === 'run' ? 'fitness' : 'bicycle'}
                size={18}
                color={themeColors.primary}
              />
              <Ionicons
                name={isActivityDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={10}
                color={themeColors.textMuted}
              />
            </TouchableOpacity>
          )}

          <View style={[styles.unifiedBarDivider, { backgroundColor: themeColors.border }]} />

          {/* Routes Explorer Button */}
          <TouchableOpacity
            style={[
              styles.unifiedRoutesBtn,
              selectedRoute && { backgroundColor: themeColors.primaryBg },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              handleGenerateRoutes();
              setShowRouteModal(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={17} color={selectedRoute ? themeColors.primary : themeColors.text} />
          </TouchableOpacity>

          <View style={[styles.unifiedBarDivider, { backgroundColor: themeColors.border }]} />

          {/* Place / Destination Search Bar */}
          <View style={styles.unifiedSearchWrap}>
            <Ionicons name="search" size={15} color={themeColors.textMuted} style={styles.searchIcon} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder={isAddingStopMode ? "Search stop to add…" : "Search places…"}
              placeholderTextColor={themeColors.textMuted}
              value={searchQuery}
              onChangeText={handleSearchChange}
              returnKeyType="search"
              autoCorrect={false}
            />
            {isSearching ? (
              <ActivityIndicator size="small" color={themeColors.primary} style={{ marginRight: 6 }} />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                style={styles.searchClearBtn}
              >
                <Ionicons name="close-circle" size={16} color={themeColors.textMuted} />
              </TouchableOpacity>
            ) : null}

            {/* Quick Route Settings Button in Search Bar */}
            <TouchableOpacity
              style={[
                styles.searchSettingsBtn,
                (showSearchOptions || preferParks || avoidTrafficLights) && { backgroundColor: themeColors.primaryBg },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setShowSearchOptions(!showSearchOptions);
                setIsActivityDropdownOpen(false);
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={showSearchOptions || preferParks || avoidTrafficLights ? themeColors.primary : themeColors.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* Floating Search Route Settings Popover */}
          {showSearchOptions && (
            <View style={[styles.searchOptionsPopover, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.searchOptionsHeader}>
                <Ionicons name="filter-outline" size={14} color={themeColors.primary} />
                <Text style={[styles.searchOptionsTitle, { color: themeColors.text }]}>Route Settings</Text>
                <TouchableOpacity
                  onPress={() => setShowSearchOptions(false)}
                  style={{ marginLeft: 'auto', padding: 2 }}
                >
                  <Ionicons name="close" size={16} color={themeColors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Prefer Parks & Green Spaces */}
              <TouchableOpacity
                style={styles.searchOptionRow}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const next = !preferParks;
                  setPreferParks(next);
                  if (routeDestination) {
                    const lat = location?.coords.latitude || 37.33182;
                    const lng = location?.coords.longitude || -122.03118;
                    fetchRealRoadRoute(lat, lng, routeDestination.lat, routeDestination.lng, activityType, {
                      ...routeOptions,
                      preferParks: next,
                    }).then((r) => { if (r) setSelectedRoute(r); });
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="leaf-outline" size={15} color={preferParks ? themeColors.primary : themeColors.textMuted} />
                <Text style={[styles.searchOptionLabel, { color: themeColors.text }]}>Parks & Trails</Text>
                <Ionicons
                  name={preferParks ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={preferParks ? themeColors.primary : themeColors.textMuted}
                  style={{ marginLeft: 'auto' }}
                />
              </TouchableOpacity>

              {/* Avoid Traffic Lights */}
              <TouchableOpacity
                style={styles.searchOptionRow}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const next = !avoidTrafficLights;
                  setAvoidTrafficLights(next);
                  if (routeDestination) {
                    const lat = location?.coords.latitude || 37.33182;
                    const lng = location?.coords.longitude || -122.03118;
                    fetchRealRoadRoute(lat, lng, routeDestination.lat, routeDestination.lng, activityType, {
                      ...routeOptions,
                      avoidTrafficLights: next,
                    }).then((r) => { if (r) setSelectedRoute(r); });
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="stopwatch-outline" size={15} color={avoidTrafficLights ? themeColors.primary : themeColors.textMuted} />
                <Text style={[styles.searchOptionLabel, { color: themeColors.text }]}>Avoid Traffic Lights</Text>
                <Ionicons
                  name={avoidTrafficLights ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={avoidTrafficLights ? themeColors.primary : themeColors.textMuted}
                  style={{ marginLeft: 'auto' }}
                />
              </TouchableOpacity>

              {/* Quieter Streets / Less Traffic */}
              <TouchableOpacity
                style={styles.searchOptionRow}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const next = !avoidBusyRoads;
                  setAvoidBusyRoads(next);
                  if (routeDestination) {
                    const lat = location?.coords.latitude || 37.33182;
                    const lng = location?.coords.longitude || -122.03118;
                    fetchRealRoadRoute(lat, lng, routeDestination.lat, routeDestination.lng, activityType, {
                      ...routeOptions,
                      avoidBusyRoads: next,
                    }).then((r) => { if (r) setSelectedRoute(r); });
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="shield-checkmark-outline" size={15} color={avoidBusyRoads ? themeColors.primary : themeColors.textMuted} />
                <Text style={[styles.searchOptionLabel, { color: themeColors.text }]}>Less Traffic / Quiet</Text>
                <Ionicons
                  name={avoidBusyRoads ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={avoidBusyRoads ? themeColors.primary : themeColors.textMuted}
                  style={{ marginLeft: 'auto' }}
                />
              </TouchableOpacity>

              {/* Dedicated Bike Lanes (if cycle mode) */}
              {activityType === 'cycle' && (
                <TouchableOpacity
                  style={styles.searchOptionRow}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    const next = !preferCyclingLanes;
                    setPreferCyclingLanes(next);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="bicycle-outline" size={15} color={preferCyclingLanes ? themeColors.primary : themeColors.textMuted} />
                  <Text style={[styles.searchOptionLabel, { color: themeColors.text }]}>Bike Lanes Only</Text>
                  <Ionicons
                    name={preferCyclingLanes ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={preferCyclingLanes ? themeColors.primary : themeColors.textMuted}
                    style={{ marginLeft: 'auto' }}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Floating Activity Dropdown Menu */}
          {isActivityDropdownOpen && (
            <View style={[styles.dropdownMenu, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              {(['walk', 'run', 'cycle'] as const).map((mode) => {
                const isSelected = activityType === mode;
                const iconName = mode === 'walk' ? 'walk' : mode === 'run' ? 'fitness' : 'bicycle';
                const label = mode === 'walk' ? 'Walk' : mode === 'run' ? 'Run' : 'Cycle';
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.dropdownMenuItem,
                      isSelected && { backgroundColor: themeColors.primaryBg },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setActivityType(mode);
                      setIsActivityDropdownOpen(false);

                      // If a route is already previewed or selected, instantly adapt estimated time to the chosen activity
                      const currentRoute = selectedRouteRef.current;
                      if (currentRoute) {
                        const newMins = calculateEstimatedMinutes(currentRoute.distanceKm, mode);
                        setSelectedRoute({ ...currentRoute, durationMins: newMins });
                        selectedRouteRef.current = { ...currentRoute, durationMins: newMins };

                        // If navigating or has a target destination, smoothly re-query real road route with the new profile (e.g., bicycle vs foot)
                        if (routeDestination) {
                          const lat = location?.coords.latitude || 37.33182;
                          const lng = location?.coords.longitude || -122.03118;
                          fetchRealRoadRoute(lat, lng, routeDestination.lat, routeDestination.lng, mode, {
                            ...routeOptions,
                            preferCyclingLanes: mode === 'cycle' ? true : preferCyclingLanes,
                          }).then((r) => {
                            if (r) {
                              setSelectedRoute(r);
                              selectedRouteRef.current = r;
                            }
                          });
                        }
                      }

                      // Update any generated circuit suggestions so their estimated times and paths reflect the new activity
                      if (routeSuggestions.length > 0) {
                        setRouteSuggestions((prev) =>
                          prev.map((r) => ({
                            ...r,
                            durationMins: calculateEstimatedMinutes(r.distanceKm, mode),
                          }))
                        );
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={iconName}
                      size={16}
                      color={isSelected ? themeColors.primary : themeColors.textMuted}
                    />
                    <Text
                      style={[
                        styles.dropdownMenuItemText,
                        { color: isSelected ? themeColors.primary : themeColors.text },
                        isSelected && { fontWeight: '800' },
                      ]}
                    >
                      {label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color={themeColors.primary} style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Live Search Results Dropdown List: Coming down from the top bar when searching */}
          {searchResults.length > 0 && (
            <Animated.View
              style={[
                styles.searchResultsDropdown,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                  opacity: searchDropdownAnim,
                  transform: [
                    {
                      translateY: searchDropdownAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-18, 0],
                      }),
                    },
                    {
                      scaleY: searchDropdownAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.92, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.placeId}
                keyboardShouldPersistTaps="always"
                renderItem={({ item }) => {
                  const distFormatted = item.distanceMeters !== undefined
                    ? (profile.unitSystem === 'us_customary'
                        ? (item.distanceMeters >= 1609.34
                            ? `${(item.distanceMeters / 1609.34).toFixed(1)} mi`
                            : `${Math.round(item.distanceMeters * 3.28084)} ft`)
                        : (item.distanceMeters >= 1000
                            ? `${(item.distanceMeters / 1000).toFixed(1)} km`
                            : `${Math.round(item.distanceMeters)} m`))
                    : null;

                  const catIcon =
                    item.category === 'park' ? 'leaf'
                    : item.category === 'water' ? 'water'
                    : item.category === 'viewpoint' ? 'eye'
                    : item.category === 'trail' ? 'walk'
                    : item.category === 'nature' ? 'flower'
                    : item.category === 'monument' ? 'business-outline'
                    : 'location';

                  return (
                    <TouchableOpacity
                      style={[styles.searchResultItem, { borderBottomColor: themeColors.border }]}
                      onPress={() => handleSelectSearchResult(item)}
                      activeOpacity={0.7}
                    >
                      {/* Place Thumbnail Image or Category Icon Avatar */}
                      <View style={[styles.searchResultThumbWrap, { borderColor: themeColors.border, backgroundColor: themeColors.surfaceElevated }]}>
                        {item.imageUrl ? (
                          <Image
                            source={{ uri: item.imageUrl }}
                            style={styles.searchResultThumbImg}
                            resizeMode="cover"
                            defaultSource={{ uri: 'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&q=80' }}
                          />
                        ) : (
                          <Ionicons name={catIcon as any} size={20} color={themeColors.primary} />
                        )}
                        {item.category && item.category !== 'place' && (
                          <View style={styles.searchResultCategoryDot}>
                            <Ionicons name={catIcon as any} size={8} color="#ffffff" />
                          </View>
                        )}
                      </View>

                      <View style={{ flex: 1, marginRight: 8, justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.searchResultName, { color: themeColors.text }]} numberOfLines={1}>
                            {item.shortName}
                          </Text>
                          {item.category && item.category !== 'place' && (
                            <View style={[styles.searchResultCategoryBadge, { backgroundColor: `${themeColors.primary}18`, borderColor: `${themeColors.primary}40` }]}>
                              <Text style={[styles.searchResultCategoryBadgeText, { color: themeColors.primary }]}>
                                {item.category.toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.searchResultAddress, { color: themeColors.textMuted }]} numberOfLines={1}>
                          {item.description || item.displayName}
                        </Text>
                      </View>

                      {distFormatted && (
                        <View style={[styles.searchResultDistBadge, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
                          <Text style={[styles.searchResultDistText, { color: themeColors.primary }]}>
                            {distFormatted}
                          </Text>
                        </View>
                      )}
                      {/* Action Menu Trigger Button for Searching Places */}
                      <TouchableOpacity
                        style={[styles.searchResultMoreBtn, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}
                        onPress={(e) => {
                          e.stopPropagation();
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setPlaceActionTarget(item);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="ellipsis-vertical" size={15} color={themeColors.textSecondary} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
              />
            </Animated.View>
          )}
        </Animated.View>
      )}

      {/* Floating Secondary Map HUD Bar */}
      <View
        style={[
          styles.topHudContainer,
          (selectedRoute || isRecording) && { top: Platform.OS === 'ios' ? 122 : 88 },
          { justifyContent: 'flex-end' },
        ]}
      >
        {/* Map Controls */}
        <View style={styles.topActionsRow}>
          {/* 3D Perspective Button */}
          <Animated.View
            style={[
              {
                borderRadius: 18,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: hudShadowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, is3D ? 0.2 : 0.08],
                }),
                shadowRadius: hudShadowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 8],
                }),
                elevation: hudShadowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 2],
                }),
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.iconButton,
                { backgroundColor: is3D ? themeColors.surfaceElevated : themeColors.cardBg, borderColor: is3D ? themeColors.primary : themeColors.border },
                is3D && styles.iconButtonActive,
              ]}
              onPress={toggle3D}
              activeOpacity={0.8}
            >
              <Text style={[styles.controlButtonText, { color: is3D ? themeColors.primary : themeColors.text }]}>
                3D
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Map Layers / Style Selector (Opens bottom sheet) */}
          <Animated.View
            style={[
              {
                borderRadius: 18,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: hudShadowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, mapType !== 'standard' ? 0.2 : 0.08],
                }),
                shadowRadius: hudShadowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 8],
                }),
                elevation: hudShadowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 2],
                }),
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.iconButton,
                { backgroundColor: mapType !== 'standard' ? themeColors.surfaceElevated : themeColors.cardBg, borderColor: mapType !== 'standard' ? themeColors.primary : themeColors.border },
                mapType !== 'standard' && styles.iconButtonActive,
              ]}
              onPress={() => setShowMapLayersModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="layers-outline"
                size={17}
                color={mapType !== 'standard' ? themeColors.primary : themeColors.text}
              />
            </TouchableOpacity>
          </Animated.View>

          {/* Center On User & Route Button */}
          <Animated.View
            style={[
              {
                borderRadius: 18,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: hudShadowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, followsUser ? 0.2 : 0.08],
                }),
                shadowRadius: hudShadowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 8],
                }),
                elevation: hudShadowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 2],
                }),
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.iconButton,
                { backgroundColor: followsUser ? themeColors.surfaceElevated : themeColors.cardBg, borderColor: followsUser ? themeColors.primary : themeColors.border },
                followsUser && styles.iconButtonActive,
              ]}
              onPress={centerOnUser}
              activeOpacity={0.8}
            >
              <Ionicons
                name="locate"
                size={18}
                color={followsUser ? themeColors.primary : themeColors.text}
              />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {/* Full Turn-by-Turn Directions Panel (Modal list when requested) */}
      {selectedRoute && showDirections && selectedRoute.steps && selectedRoute.steps.length > 0 && (
        <View
          style={[
            styles.directionsPanel,
            {
              backgroundColor: themeColors.cardBg,
              borderColor: themeColors.border,
              top: Platform.OS === 'ios' ? 172 : 138,
            },
          ]}
        >
          <View style={[styles.directionsPanelHeader, { borderBottomColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="navigate-circle" size={16} color="#38bdf8" />
              <Text style={[styles.directionsPanelTitle, { color: themeColors.text }]}>Turn-by-Turn Directions</Text>
              <Text style={[styles.directionsPanelSub, { color: themeColors.textMuted }]}>
                {selectedRoute.steps.length} steps
              </Text>
            </View>

            {/* Auto-recalculating indicator when active */}
            {isRerouting && (
              <View style={[styles.directionsRecalcBtn, { backgroundColor: 'rgba(56, 189, 248, 0.25)', borderColor: themeColors.border }]}>
                <ActivityIndicator size="small" color="#38bdf8" />
                <Text style={styles.directionsRecalcText}>Updating...</Text>
              </View>
            )}
          </View>
          <ScrollView style={styles.directionsList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
            {selectedRoute.steps.map((step: RouteStep, idx: number) => {
              const isFirst = idx === 0;
              const isLast = idx === selectedRoute.steps!.length - 1;
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              const iconName = (() => {
                if (isPast) return 'checkmark-circle';
                if (step.maneuverType === 'depart') return 'navigate-outline';
                if (step.maneuverType === 'arrive') return 'flag-outline';
                if (step.maneuverType === 'roundabout' || step.maneuverType === 'rotary') return 'refresh-outline';
                if (step.maneuverType === 'fork') return 'git-branch-outline';
                if (step.modifier === 'left' || step.modifier === 'slight left') return 'arrow-back-outline';
                if (step.modifier === 'right' || step.modifier === 'slight right') return 'arrow-forward-outline';
                if (step.modifier === 'uturn') return 'return-up-back-outline';
                return 'arrow-up-outline';
              })();
              const dist = step.distanceMeters >= 1000
                ? `${(step.distanceMeters / 1000).toFixed(1)} km`
                : step.distanceMeters > 0
                  ? `${Math.round(step.distanceMeters)} m`
                  : '';
              return (
                <View
                  key={idx}
                  style={[
                    styles.directionStep,
                    { borderBottomColor: themeColors.border },
                    isLast && { borderBottomWidth: 0 },
                    isPast && { opacity: 0.55, backgroundColor: 'rgba(16, 185, 129, 0.04)' },
                    isCurrent && { backgroundColor: 'rgba(56, 189, 248, 0.08)', borderRadius: 10, paddingHorizontal: 6 },
                  ]}
                >
                  <View style={[
                    styles.directionIconWrap,
                    {
                      backgroundColor: isPast
                        ? 'rgba(16, 185, 129, 0.15)'
                        : isCurrent
                          ? 'rgba(56, 189, 248, 0.2)'
                          : isFirst || isLast
                            ? 'rgba(56,189,248,0.15)'
                            : themeColors.surfaceElevated,
                      borderColor: isPast
                        ? '#10b981'
                        : isCurrent
                          ? '#38bdf8'
                          : isFirst || isLast
                            ? '#38bdf8'
                            : themeColors.border,
                    }
                  ]}>
                    <Ionicons
                      name={iconName as any}
                      size={14}
                      color={isPast ? '#10b981' : isCurrent || isFirst || isLast ? '#38bdf8' : themeColors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text
                        style={[
                          styles.directionStepText,
                          { color: themeColors.text },
                          isPast && { textDecorationLine: 'line-through', color: themeColors.textMuted },
                          isCurrent && { fontWeight: '800', color: '#38bdf8' },
                        ]}
                      >
                        {step.instruction}
                      </Text>
                      {isPast && (
                        <Text style={[styles.walkedBadgeText, { color: '#10b981' }]}>Walked</Text>
                      )}
                      {isCurrent && (
                        <View style={[styles.currentStepBadge, { backgroundColor: '#38bdf8' }]}>
                          <Text style={styles.currentStepBadgeText}>Current</Text>
                        </View>
                      )}
                    </View>
                    {step.streetName ? (
                      <Text style={[styles.directionStreetName, { color: themeColors.textMuted }]} numberOfLines={1}>{step.streetName}</Text>
                    ) : null}
                  </View>
                  {dist ? (
                    <Text style={[styles.directionStepDist, { color: isCurrent ? '#38bdf8' : themeColors.textMuted }]}>
                      {isCurrent && distToNextTurn > 0 ? `${distToNextTurn} m` : dist}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}



      {/* Active Workout Dashboard Overlay - Positioned lower to avoid intersecting with HUD and directions */}
      {isRecording && (
        <View style={[styles.liveMetricsCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <View style={styles.liveHeaderRow}>
            <View style={styles.livePulseBadge}>
              <View style={styles.liveDot} />
              <Text style={[styles.liveBadgeText, { color: themeColors.text }]}>
                TRACKING {activityType.toUpperCase()} • {formatTimer(elapsedSeconds)}
              </Text>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <View style={styles.metricColumn}>
              <Text style={[styles.metricNumber, { color: themeColors.text }]}>{displayDistance}</Text>
              <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>{distanceUnitLabel}</Text>
            </View>
            <View style={[styles.metricDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.metricColumn}>
              <Text style={[styles.metricNumber, { color: themeColors.text }]}>{liveCalories}</Text>
              <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>CALORIES</Text>
            </View>
            <View style={[styles.metricDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.metricColumn}>
              <Text style={[styles.metricNumber, { color: themeColors.text }]}>
                {activityType === 'cycle' ? `${(durationMins > 0 ? (totalDistanceMeters / 1000 / (durationMins / 60)) : 0).toFixed(1)}` : Math.round(totalDistanceMeters * 1.31)}
              </Text>
              <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>
                {activityType === 'cycle' ? 'KM/H' : 'STEPS'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Permission Denied Alert */}
      {permissionStatus === 'denied' && (
        <View style={styles.alertCard}>
          <Ionicons name="warning" size={20} color="#f59e0b" />
          <Text style={styles.alertText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.alertBtn} onPress={initTracking}>
            <Text style={styles.alertBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingPill}>
          <ActivityIndicator size="small" color={themeColors.primary} />
          <Text style={styles.loadingText}>Locating...</Text>
        </View>
      )}

      {/* Route Preview & Customization Confirmation Card (Shown when searching/selecting a location before starting navigation) */}
      {selectedRoute && !isNavigating && !isRecording && (
        <Animated.View
          style={[
            styles.routePreviewCard,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              opacity: routePreviewSlideAnim,
              transform: [
                {
                  translateY: routePreviewSlideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [320, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Top Grab Handle */}
          <View style={[styles.routePreviewHandle, { backgroundColor: themeColors.border }]} />

          {/* Header Row: Destination Title & Close */}
          <View style={styles.routePreviewHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="location" size={16} color={themeColors.primary} />
                <Text style={[styles.routePreviewTitle, { color: themeColors.text }]} numberOfLines={1}>
                  {previewPlace?.shortName || selectedRoute.destinationName || selectedRoute.name || 'Selected Destination'}
                </Text>
              </View>
              {previewPlace?.displayName && (
                <Text style={[styles.routePreviewSubtitle, { color: themeColors.textMuted }]} numberOfLines={1}>
                  {previewPlace.displayName}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.routePreviewCloseBtn, { backgroundColor: themeColors.surfaceElevated }]}
              onPress={handleClearSuggestedRoute}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Body: Metrics, Stops, Highlights, and Route Preferences */}
          <ScrollView
            style={styles.routePreviewScrollBody}
            contentContainerStyle={styles.routePreviewScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* Quick Metrics Bar: Distance, Duration, Elevation */}
            <View style={[styles.routePreviewStatsBar, { borderColor: themeColors.border, backgroundColor: themeColors.surfaceElevated }]}>
              <View style={styles.routePreviewStatCol}>
                <Text style={[styles.routePreviewStatVal, { color: themeColors.text }]}>
                  {isUS
                    ? `${(selectedRoute.distanceKm * 0.621371).toFixed(1)} mi`
                    : `${selectedRoute.distanceKm} km`}
                </Text>
                <Text style={[styles.routePreviewStatLabel, { color: themeColors.textMuted }]}>Distance</Text>
              </View>
              <View style={[styles.routePreviewStatDivider, { backgroundColor: themeColors.border }]} />
              <View style={styles.routePreviewStatCol}>
                <Text style={[styles.routePreviewStatVal, { color: themeColors.text }]}>
                  ~{selectedRoute.durationMins || calculateEstimatedMinutes(selectedRoute.distanceKm, activityType)} min
                </Text>
                <Text style={[styles.routePreviewStatLabel, { color: themeColors.textMuted }]}>
                  Est. {activityType === 'walk' ? 'Walk' : activityType === 'run' ? 'Run' : 'Cycle'}
                </Text>
              </View>
              <View style={[styles.routePreviewStatDivider, { backgroundColor: themeColors.border }]} />
              <View style={styles.routePreviewStatCol}>
                <Text style={[styles.routePreviewStatVal, { color: themeColors.text }]}>
                  +{selectedRoute.elevationGainMeters}m
                </Text>
                <Text style={[styles.routePreviewStatLabel, { color: themeColors.textMuted }]}>Elevation</Text>
              </View>
            </View>

            {/* Route Stops / Waypoints Section */}
            <View style={styles.routeStopsSection}>
              <View style={styles.routeStopsSectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="git-commit-outline" size={15} color={themeColors.primary} />
                  <Text style={[styles.routeStopsSectionTitle, { color: themeColors.text }]}>
                    Route Stops ({routeStops.length > 0 ? routeStops.length : 1})
                  </Text>
                </View>

                {/* Direct Add Stop Button */}
                <TouchableOpacity
                  style={[styles.manageStopsPill, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    setIsAddingStopMode(true);
                    setSearchQuery('');
                    setSearchResults([]);
                    setTimeout(() => {
                      searchInputRef.current?.focus();
                    }, 120);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="add" size={14} color={themeColors.text} />
                  <Text style={[styles.manageStopsPillText, { color: themeColors.text, fontWeight: '700' }]}>
                    Add Stop
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Draggable markers hint */}
              <View style={styles.stopsDraggableHint}>
                <Ionicons name="move-outline" size={12} color={themeColors.textMuted} />
                <Text style={[styles.stopsDraggableHintText, { color: themeColors.textMuted }]}>
                  Hold & drag handle to reorder stops • Hold pins on map to adjust coordinates
                </Text>
              </View>

              {/* Vertical Stops Sequence List */}
              <View style={styles.stopsManagerExpandedList}>
                {/* Origin item (Current Location) */}
                <View style={[styles.stopManagerItem, { borderBottomColor: themeColors.border }]}>
                  <View style={styles.stopLeftFixedSpot}>
                    <View style={[styles.stopManagerNumberBadge, { backgroundColor: '#38bdf8', marginRight: 0 }]}>
                      <Ionicons name="navigate" size={11} color="#ffffff" />
                    </View>
                  </View>
                  <View style={{ flex: 1, paddingLeft: 8 }}>
                    <Text style={[styles.stopManagerName, { color: themeColors.text }]}>Current Location (Start)</Text>
                    <Text style={[styles.stopManagerSub, { color: themeColors.textMuted }]}>GPS Origin Point</Text>
                  </View>
                  <View style={[styles.startOriginTag, { borderColor: `${themeColors.primary}30` }]}>
                    <Text style={styles.startOriginTagText}>START</Text>
                  </View>
                </View>

                {/* Dynamic vertical stops list */}
                {routeStops.map((stop, sIdx) => (
                  <DraggableStopRow
                    key={`vertical_stop_${stop.placeId}_${sIdx}`}
                    stop={stop}
                    sIdx={sIdx}
                    isLast={sIdx === routeStops.length - 1}
                    canReorder={routeStops.length > 1}
                    isItemDragging={draggingStopIdx === sIdx}
                    dragTranslateY={dragTranslateY}
                    themeColors={themeColors}
                    onDragStart={(idx) => setDraggingStopIdx(idx)}
                    onDragEnd={(idx, dy) => {
                      setDraggingStopIdx(null);
                      if (routeStops.length <= 1) return;
                      const deltaSlots = Math.round(dy / 48);
                      if (deltaSlots !== 0) {
                        const targetIdx = Math.max(0, Math.min(routeStops.length - 1, idx + deltaSlots));
                        if (targetIdx !== idx) handleMoveStop(idx, targetIdx);
                      }
                    }}
                    onMove={(dy) => dragTranslateY.setValue(dy)}
                    onSwap={(from, _to) => {
                      const nextIdx = (from + 1) % routeStops.length;
                      handleMoveStop(from, nextIdx);
                    }}
                    onRemove={(idx) => handleRemoveStop(idx)}
                  />
                ))}
              </View>
            </View>

            {/* Route Preferences & Road Controls (Elevation, Quiet Roads, Parks, Traffic Lights) */}
            <View style={styles.routePreviewPreferencesSection}>
              <View style={styles.routeStopsSectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="options-outline" size={15} color={themeColors.primary} />
                  <Text style={[styles.routeStopsSectionTitle, { color: themeColors.text }]}>
                    Route Preferences
                  </Text>
                </View>
              </View>

              {/* Elevation Profile Filter */}
              <View style={styles.previewPrefSubSection}>
                <Text style={[styles.previewPrefSubTitle, { color: themeColors.textMuted }]}>ELEVATION PROFILE</Text>
                <View style={styles.previewElevOptionsRow}>
                  {(['flat', 'rolling', 'hilly'] as const).map((elev) => {
                    const isSelected = targetElevation === elev;
                    return (
                      <TouchableOpacity
                        key={`elev_pref_${elev}`}
                        style={[
                          styles.previewElevOptionBtn,
                          {
                            backgroundColor: isSelected ? themeColors.primaryBg : themeColors.surfaceElevated,
                            borderColor: isSelected ? themeColors.primary : themeColors.border,
                          },
                        ]}
                        onPress={async () => {
                          Haptics.selectionAsync().catch(() => {});
                          const nextElev = isSelected ? null : elev;
                          setTargetElevation(nextElev);
                          if (routeStops.length > 0) {
                            await recalculateRouteWithStops(routeStops);
                          }
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={elev === 'flat' ? 'remove-outline' : elev === 'rolling' ? 'pulse-outline' : 'trending-up-outline'}
                          size={14}
                          color={isSelected ? themeColors.primary : themeColors.textMuted}
                        />
                        <Text
                          style={[
                            styles.previewElevOptionText,
                            {
                              color: isSelected ? themeColors.primary : themeColors.text,
                              fontWeight: isSelected ? '800' : '600',
                            },
                          ]}
                        >
                          {elev.charAt(0).toUpperCase() + elev.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Road Type & Avoidance Toggles Row */}
              <View style={styles.previewPrefSubSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.previewPrefSubTitle, { color: themeColors.textMuted, marginBottom: 0 }]}>
                    ROUTING PREFERENCES
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>
                    {(!preferParks && !avoidTrafficLights && !avoidBusyRoads && (!preferCyclingLanes || activityType !== 'cycle')) ? 'Fastest Path Default' : 'Custom Preferences'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { key: 'quiet', label: 'Quiet Roads', icon: 'shield-checkmark-outline', isActive: avoidBusyRoads },
                    { key: 'parks', label: 'Parks & Trails', icon: 'leaf-outline', isActive: preferParks },
                    { key: 'lights', label: 'Avoid Lights', icon: 'stopwatch-outline', isActive: avoidTrafficLights },
                    ...(activityType === 'cycle'
                      ? [{ key: 'lanes', label: 'Bike Lanes', icon: 'bicycle-outline', isActive: preferCyclingLanes }]
                      : []),
                  ].map((item) => {
                    const isActive = item.isActive;
                    const activeFg = themeColors.isDark ? '#000000' : '#ffffff';
                    return (
                      <TouchableOpacity
                        key={`pref_${item.key}`}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          paddingVertical: 9,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isActive ? themeColors.primary : themeColors.border,
                          backgroundColor: isActive ? themeColors.primary : themeColors.surfaceElevated,
                        }}
                        onPress={async () => {
                          Haptics.selectionAsync().catch(() => {});
                          let nextBusy = avoidBusyRoads;
                          let nextParks = preferParks;
                          let nextLights = avoidTrafficLights;
                          let nextLanes = preferCyclingLanes;

                          if (item.key === 'quiet') {
                            nextBusy = !avoidBusyRoads;
                            setAvoidBusyRoads(nextBusy);
                          } else if (item.key === 'parks') {
                            nextParks = !preferParks;
                            setPreferParks(nextParks);
                          } else if (item.key === 'lights') {
                            nextLights = !avoidTrafficLights;
                            setAvoidTrafficLights(nextLights);
                          } else if (item.key === 'lanes') {
                            nextLanes = !preferCyclingLanes;
                            setPreferCyclingLanes(nextLanes);
                          }

                          const nonePicked = !nextBusy && !nextParks && !nextLights && (!nextLanes || activityType !== 'cycle');
                          setPreferFastest(nonePicked);

                          const updatedOpts: RouteOptions = {
                            ...routeOptions,
                            avoidBusyRoads: nextBusy,
                            preferParks: nextParks,
                            avoidTrafficLights: nextLights,
                            preferCyclingLanes: nextLanes,
                            preferFastest: nonePicked,
                          };

                          if (routeStops.length > 0) {
                            await recalculateRouteWithStops(routeStops, updatedOpts);
                          }
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={item.icon as any}
                          size={15}
                          color={isActive ? activeFg : themeColors.textSecondary}
                        />
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 12,
                            fontWeight: isActive ? '800' : '600',
                            color: isActive ? activeFg : themeColors.text,
                          }}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Highlights Along Route */}
            {selectedRoute.pois && selectedRoute.pois.length > 0 && (
              <View style={styles.routePreviewStopsSection}>
                <View style={styles.routePoiSectionHeader}>
                  <Ionicons name="sparkles" size={13} color="#38bdf8" />
                  <Text style={[styles.routePoiSectionTitle, { color: themeColors.text }]}>
                    Highlights Along Path
                  </Text>
                </View>
                <ScrollView
                  horizontal={true}
                  nestedScrollEnabled={true}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingVertical: 2, paddingRight: 8 }}
                >
                  {selectedRoute.pois.map((poi, pIdx) => {
                    const catIcon =
                      poi.category === 'park' ? 'leaf'
                      : poi.category === 'water' ? 'water'
                      : poi.category === 'viewpoint' ? 'eye'
                      : poi.category === 'trail' ? 'walk'
                      : 'compass';

                    const stopIdx = routeStops.findIndex((s) => {
                      if (s.placeId === poi.id || s.placeId === `poi_${poi.id}` || s.placeId.startsWith(`poi_${poi.id}_`)) return true;
                      if (s.shortName && poi.name && s.shortName.trim().toLowerCase() === poi.name.trim().toLowerCase()) return true;
                      if (s.displayName && poi.name && s.displayName.trim().toLowerCase() === poi.name.trim().toLowerCase()) return true;
                      if (
                        poi.coordinate &&
                        Math.abs(s.latitude - poi.coordinate.latitude) < 0.0008 &&
                        Math.abs(s.longitude - poi.coordinate.longitude) < 0.0008
                      ) {
                        return true;
                      }
                      return false;
                    });
                    const isAlreadyStop = stopIdx >= 0;

                    return (
                      <TouchableOpacity
                        key={poi.id || pIdx}
                        style={[
                          styles.previewPoiCard,
                          {
                            backgroundColor: themeColors.surface,
                            borderColor: isAlreadyStop ? themeColors.primary : themeColors.border,
                            borderWidth: isAlreadyStop ? 1.5 : 1,
                          },
                        ]}
                        activeOpacity={0.82}
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                          const targetPlace: GeocodedPlace = {
                            placeId: `poi_${poi.id}`,
                            displayName: poi.name,
                            shortName: poi.name,
                            latitude: poi.coordinate?.latitude || location?.coords.latitude || 37.33182,
                            longitude: poi.coordinate?.longitude || location?.coords.longitude || -122.03118,
                            category: (poi.category as any) || 'place',
                            imageUrl: poi.imageUrl,
                            description: `${poi.category.toUpperCase()} • Popular highlight along route`,
                          };

                          if (isAlreadyStop && stopIdx >= 0) {
                            await handleRemoveStop(stopIdx);
                          } else {
                            await handleAddStopToRoute(targetPlace);
                          }
                        }}
                      >
                        <View style={styles.previewPoiImgWrap}>
                          <Image
                            source={{ uri: poi.imageUrl }}
                            style={styles.previewPoiImg}
                            resizeMode="cover"
                            defaultSource={{ uri: 'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&q=80' }}
                          />
                          <View style={styles.poiCategoryBadge}>
                            <Ionicons name={catIcon as any} size={10} color="#ffffff" />
                            <Text style={styles.poiCategoryText}>{poi.category.toUpperCase()}</Text>
                          </View>
                          <View
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              backgroundColor: isAlreadyStop ? themeColors.primary : 'rgba(0, 0, 0, 0.72)',
                              borderRadius: 12,
                              paddingHorizontal: 6,
                              paddingVertical: 3,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 3,
                              borderWidth: 0.5,
                              borderColor: isAlreadyStop ? themeColors.primary : 'rgba(255, 255, 255, 0.3)',
                            }}
                          >
                            <Ionicons
                              name={isAlreadyStop ? 'checkmark' : 'add'}
                              size={11}
                              color={isAlreadyStop ? (themeColors.isDark ? '#09090b' : '#ffffff') : '#ffffff'}
                            />
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: '800',
                                color: isAlreadyStop ? (themeColors.isDark ? '#09090b' : '#ffffff') : '#ffffff',
                              }}
                            >
                              {isAlreadyStop ? 'ADDED' : 'ADD'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.previewPoiDetails}>
                          <Text style={[styles.previewPoiName, { color: themeColors.text }]} numberOfLines={1}>
                            {poi.name}
                          </Text>
                          {typeof poi.distanceAlongKm === 'number' && (
                            <View style={styles.poiDistRow}>
                              <Ionicons name="navigate-outline" size={10} color="#38bdf8" />
                              <Text style={[styles.poiDist, { color: themeColors.textMuted }]}>
                                {isUS ? `${(poi.distanceAlongKm * 0.621371).toFixed(1)} mi in` : `${poi.distanceAlongKm} km in`}
                              </Text>
                            </View>
                          )}
                          {Boolean(poi.description || poi.infoSnippet) && (
                            <Text
                              style={{
                                fontSize: 9.5,
                                lineHeight: 13,
                                color: themeColors.textSecondary,
                                marginTop: 3,
                              }}
                              numberOfLines={2}
                            >
                              {poi.description || poi.infoSnippet}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </ScrollView>

          {/* Docked Action Row: Start Navigation & Cancel (always visible at bottom above tab bar) */}
          <View style={[styles.routePreviewActionRow, { borderTopColor: themeColors.border, backgroundColor: themeColors.surface }]}>
            <TouchableOpacity
              style={[styles.routePreviewCancelBtn, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}
              onPress={handleClearSuggestedRoute}
              activeOpacity={0.8}
            >
              <Text style={[styles.routePreviewCancelText, { color: themeColors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.routePreviewStartBtn, { backgroundColor: themeColors.primary, shadowColor: themeColors.primary }]}
              onPress={handleStartNavigating}
              activeOpacity={0.88}
            >
              <Ionicons name="navigate" size={18} color={themeColors.isDark ? '#09090b' : '#ffffff'} />
              <Text style={[styles.routePreviewStartText, { color: themeColors.isDark ? '#09090b' : '#ffffff' }]}>START NAVIGATION</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Bottom Main Action Button - Displayed when NOT previewing a searched destination */}
      {(!selectedRoute || isNavigating || isRecording) && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.actionButton, isRecording ? styles.stopButton : [styles.startButton, { backgroundColor: themeColors.primary }]]}
            onPress={handleToggleWalk}
            activeOpacity={0.88}
          >
            <Ionicons
              name={isRecording ? 'stop-circle' : isNavigating ? 'navigate' : 'play'}
              size={19}
              color={isRecording ? '#ffffff' : themeColors.isDark ? '#09090b' : '#ffffff'}
            />
            <Text style={[styles.actionButtonText, { color: isRecording ? '#ffffff' : themeColors.isDark ? '#09090b' : '#ffffff' }]}>
              {isRecording
                ? `FINISH ${activityType.toUpperCase()}`
                : isNavigating && selectedRoute
                  ? `TRACK ${activityType.toUpperCase()} ROUTE`
                  : `START ${activityType.toUpperCase()}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}



      {/* PLACE SEARCH ACTION MENU MODAL (Add Stop / Set Destination / Preview) */}
      <Modal
        visible={!!placeActionTarget}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPlaceActionTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setPlaceActionTarget(null)}
          />
          <View style={[styles.placeActionSheet, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <DraggableSheetHandle
              onDismiss={() => setPlaceActionTarget(null)}
              color={themeColors.borderLight}
              style={{ marginBottom: 12 }}
            />

            {placeActionTarget && (
              <>
                <View style={styles.placeActionHeader}>
                  <View style={[styles.placeActionThumbWrap, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
                    {placeActionTarget.imageUrl ? (
                      <Image source={{ uri: placeActionTarget.imageUrl }} style={styles.placeActionThumb} resizeMode="cover" />
                    ) : (
                      <Ionicons name="location" size={24} color={themeColors.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1, paddingRight: 4 }}>
                    <Text style={[styles.placeActionTitle, { color: themeColors.text }]} numberOfLines={1}>
                      {placeActionTarget.shortName}
                    </Text>
                    <Text style={[styles.placeActionSub, { color: themeColors.textMuted }]} numberOfLines={2}>
                      {placeActionTarget.description || placeActionTarget.displayName}
                    </Text>
                  </View>
                </View>

                {/* Action Options List */}
                <View style={styles.placeActionButtonsCol}>
                  {/* Option 1: Add as Next Stop */}
                  <TouchableOpacity
                    style={[styles.placeActionButton, { backgroundColor: `${themeColors.primary}15`, borderColor: `${themeColors.primary}40` }]}
                    onPress={() => {
                      if (placeActionTarget) {
                        handleAddStopToRoute(placeActionTarget);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.placeActionIconCircle, { backgroundColor: themeColors.primary }]}>
                      <Ionicons name="add" size={18} color="#09090b" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.placeActionBtnTitle, { color: themeColors.primary }]}>
                        Add as Stop to Route
                      </Text>
                      <Text style={[styles.placeActionBtnSub, { color: themeColors.textMuted }]}>
                        Inserts into your current route itinerary
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={themeColors.primary} />
                  </TouchableOpacity>

                  {/* Option 2: Set as Sole Destination */}
                  <TouchableOpacity
                    style={[styles.placeActionButton, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}
                    onPress={() => {
                      if (placeActionTarget) {
                        const target = placeActionTarget;
                        setPlaceActionTarget(null);
                        handleSelectSearchResult(target);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.placeActionIconCircle, { backgroundColor: '#10b981' }]}>
                      <Ionicons name="flag" size={16} color="#ffffff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.placeActionBtnTitle, { color: themeColors.text }]}>
                        Set as Destination
                      </Text>
                      <Text style={[styles.placeActionBtnSub, { color: themeColors.textMuted }]}>
                        Creates a direct route to this location
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
                  </TouchableOpacity>

                  {/* Cancel Button */}
                  <TouchableOpacity
                    style={[styles.placeActionCancelBtn, { borderColor: themeColors.border }]}
                    onPress={() => setPlaceActionTarget(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.placeActionCancelText, { color: themeColors.textSecondary }]}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* EXPANDED SETUP & CALIBRATION MODAL */}
      <Modal
        visible={showSetupModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSetupModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowSetupModal(false)}
          />
          <View style={[styles.expandedModalSheet, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <DraggableSheetHandle
              onDismiss={() => setShowSetupModal(false)}
              color={themeColors.borderLight}
              style={{ marginBottom: 6 }}
            />

            <View style={[styles.modalHeaderIcon, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
              <Ionicons name="options" size={26} color={themeColors.primary} />
            </View>

            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Setup Calibration</Text>
            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
              Calibrate your profile for scientific calorie burn and passive tracking.
            </Text>

            {/* Units Segmented Toggle: Customary <-> Metric */}
            <View style={styles.expandedSection}>
              <Text style={[styles.expandedLabel, { color: themeColors.textMuted }]}>UNITS</Text>
              <View style={[styles.pillToggleTrack, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={[
                    styles.pillToggleOption,
                    modalUnits === 'us_customary' && [styles.pillToggleOptionActive, { backgroundColor: themeColors.primary }],
                  ]}
                  onPress={() => {
                    if (modalUnits !== 'us_customary') {
                      // Converting from metric to US Customary
                      const curKg = parseFloat(tempWeight) || 70;
                      setTempWeight(Math.round(kgToLbs(curKg)).toString());
                      const curCm = parseFloat(tempHeight) || 175;
                      const totalInches = Math.round(curCm / 2.54);
                      setTempHeightFeet(Math.floor(totalInches / 12).toString());
                      setTempHeightInches((totalInches % 12).toString());
                      setModalUnits('us_customary');
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.pillToggleText,
                      { color: themeColors.textMuted },
                      modalUnits === 'us_customary' && [styles.pillToggleTextActive, { color: '#ffffff' }],
                    ]}
                  >
                    Customary
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.pillToggleOption,
                    modalUnits === 'metric' && [styles.pillToggleOptionActive, { backgroundColor: themeColors.primary }],
                  ]}
                  onPress={() => {
                    if (modalUnits !== 'metric') {
                      // Converting from US Customary to metric
                      const curLbs = parseFloat(tempWeight) || 154;
                      setTempWeight(Math.round(lbsToKg(curLbs)).toString());
                      const ft = parseInt(tempHeightFeet, 10) || 5;
                      const inch = parseInt(tempHeightInches, 10) || 9;
                      const totalInches = ft * 12 + inch;
                      setTempHeight(Math.round(totalInches * 2.54).toString());
                      setModalUnits('metric');
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.pillToggleText,
                      { color: themeColors.textMuted },
                      modalUnits === 'metric' && [styles.pillToggleTextActive, { color: '#ffffff' }],
                    ]}
                  >
                    Metric
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Scroll / Flip Number Pickers: Weight & Height */}
            <View style={styles.setupInputRow}>
              {/* Weight Picker */}
              <View style={styles.setupInputCol}>
                <Text style={[styles.setupInputLabel, { color: themeColors.textMuted }]}>
                  {modalUnits === 'us_customary' ? 'WEIGHT (LBS)' : 'WEIGHT (KG)'}
                </Text>
                <FlipNumberPicker
                  value={parseInt(tempWeight, 10) || (modalUnits === 'us_customary' ? 154 : 70)}
                  min={modalUnits === 'us_customary' ? 60 : 30}
                  max={modalUnits === 'us_customary' ? 450 : 220}
                  step={1}
                  unit={modalUnits === 'us_customary' ? 'lbs' : 'kg'}
                  onChange={(v) => setTempWeight(v.toString())}
                />
              </View>

              {/* Height Section */}
              <View style={styles.setupInputCol}>
                <Text style={[styles.setupInputLabel, { color: themeColors.textMuted }]}>
                  {modalUnits === 'us_customary' ? 'HEIGHT (FT & IN)' : 'HEIGHT (CM)'}
                </Text>
                {modalUnits === 'us_customary' ? (
                  <View style={styles.feetInchesRow}>
                    <View style={{ flex: 1 }}>
                      <FlipNumberPicker
                        value={parseInt(tempHeightFeet, 10) || 5}
                        min={3}
                        max={7}
                        step={1}
                        unit="ft"
                        onChange={(v) => setTempHeightFeet(v.toString())}
                      />
                    </View>
<View style={{ flex: 1 }}>
<FlipNumberPicker
value={parseInt(tempHeightInches, 10) || 9}
min={0}
max={11}
step={1}
unit="in"
onChange={(v) => setTempHeightInches(v.toString())}
/>
</View>
</View>
) : (
<FlipNumberPicker
value={parseInt(tempHeight, 10) || 175}
min={100}
max={230}
step={1}
unit="cm"
onChange={(v) => setTempHeight(v.toString())}
/>
)}
</View>
</View>

{/* Age & Gender */}
<View style={styles.setupInputRow}>
<View style={styles.setupInputCol}>
<Text style={[styles.setupInputLabel, { color: themeColors.textMuted }]}>AGE</Text>
<FlipNumberPicker
value={parseInt(tempAge, 10) || 28}
min={10}
max={100}
step={1}
unit="yrs"
onChange={(v) => setTempAge(v.toString())}
/>
</View>

<View style={styles.setupInputCol}>
<Text style={[styles.setupInputLabel, { color: themeColors.textMuted }]}>GENDER</Text>
<View style={[styles.modalGenderRow, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<TouchableOpacity
style={[
styles.modalGenderBtn,
{ backgroundColor: 'transparent' },
tempGender === 'male' && [styles.modalGenderBtnActive, { backgroundColor: themeColors.surface, borderColor: themeColors.border }],
]}
onPress={() => setTempGender('male')}
activeOpacity={0.8}
>
<Text style={[styles.modalGenderSymbol, { color: themeColors.textMuted }, tempGender === 'male' && { color: themeColors.primary, fontWeight: '900' }]}>
♂ Male
</Text>
</TouchableOpacity>

<TouchableOpacity
style={[
styles.modalGenderBtn,
{ backgroundColor: 'transparent' },
tempGender === 'female' && [styles.modalGenderBtnActive, { backgroundColor: themeColors.surface, borderColor: themeColors.border }],
]}
onPress={() => setTempGender('female')}
activeOpacity={0.8}
>
<Text style={[styles.modalGenderSymbol, { color: themeColors.textMuted }, tempGender === 'female' && { color: themeColors.primary, fontWeight: '900' }]}>
♀ Female
</Text>
</TouchableOpacity>

<TouchableOpacity
style={[
styles.modalGenderBtn,
{ backgroundColor: 'transparent' },
tempGender === 'na' && [styles.modalGenderBtnActive, { backgroundColor: themeColors.surface, borderColor: themeColors.border }],
]}
onPress={() => setTempGender('na')}
activeOpacity={0.8}
>
<Text style={[styles.modalGenderSymbol, { color: themeColors.textMuted }, tempGender === 'na' && { color: themeColors.primary, fontWeight: '900' }]}>
—
</Text>
</TouchableOpacity>
</View>
</View>
</View>

{/* Passive Location Notice */}
{!backgroundPermission && (
<View style={[styles.passiveNoticeBox, { backgroundColor: themeColors.primaryBg, borderColor: themeColors.primary }]}>
<Ionicons name="information-circle" size={20} color={themeColors.primary} />
<View style={{ flex: 1 }}>
<Text style={[styles.passiveNoticeTitle, { color: themeColors.text }]}>Passive Tracking</Text>
<Text style={[styles.passiveNoticeDesc, { color: themeColors.textSecondary }]}>
Set Location to "Always" in iOS Settings to record with phone locked.
</Text>
</View>
<TouchableOpacity
style={[styles.openSettingsPill, { backgroundColor: themeColors.primary }]}
onPress={() => Linking.openSettings()}
>
<Text style={[styles.openSettingsPillText, { color: '#ffffff' }]}>Settings</Text>
</TouchableOpacity>
</View>
)}

{/* Modal Buttons */}
<View style={styles.modalButtonsGroup}>
<TouchableOpacity
style={[styles.startConfirmedBtn, { backgroundColor: themeColors.primary }]}
onPress={handleSaveCustomSetupAndStart}
activeOpacity={0.85}
>
<Ionicons name="checkmark-circle" size={18} color="#ffffff" />
<Text style={[styles.startConfirmedBtnText, { color: '#ffffff' }]}>START WITH THESE SETTINGS</Text>
</TouchableOpacity>

<TouchableOpacity
style={[styles.useDefaultsBtn, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}
onPress={handleUseDefaultsAndStart}
activeOpacity={0.85}
>
<Ionicons name="flash" size={16} color={themeColors.text} />
<Text style={[styles.useDefaultsBtnText, { color: themeColors.text }]}>JUST USE DEFAULTS & START</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.cancelBtn}
onPress={() => setShowSetupModal(false)}
activeOpacity={0.8}
>
<Text style={[styles.cancelBtnText, { color: themeColors.textMuted }]}>Cancel</Text>
</TouchableOpacity>
</View>
</View>
</View>
</Modal>

{/* SUMMARY MODAL */}
<Modal
visible={!!completedSummary}
transparent={true}
animationType="fade"
onRequestClose={() => setCompletedSummary(null)}
>
<View style={styles.summaryModalBackdrop}>
<View style={[styles.summaryCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
<View style={[styles.summaryCheckmark, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<Ionicons name="trophy" size={28} color={themeColors.primary} />
</View>
<Text style={[styles.summaryTitle, { color: themeColors.text }]}>Walk Complete!</Text>
<Text style={[styles.summarySubtitle, { color: themeColors.textSecondary }]}>Great work on your route.</Text>

{completedSummary && (
<View style={styles.summaryStatsGrid}>
<View style={[styles.summaryStatBox, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<Text style={[styles.summaryStatVal, { color: themeColors.text }]}>
{isUS
? metersToMiles(completedSummary.distanceMeters).toFixed(2)
: metersToKm(completedSummary.distanceMeters).toFixed(2)}
</Text>
<Text style={[styles.summaryStatUnit, { color: themeColors.textMuted }]}>{isUS ? 'Miles' : 'Kilometers'}</Text>
</View>
<View style={[styles.summaryStatBox, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<Text style={[styles.summaryStatVal, { color: themeColors.text }]}>
{formatTimer(completedSummary.durationSeconds)}
</Text>
<Text style={[styles.summaryStatUnit, { color: themeColors.textMuted }]}>Duration</Text>
</View>
<View style={[styles.summaryStatBox, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<Text style={[styles.summaryStatVal, { color: themeColors.text }]}>{completedSummary.calories}</Text>
<Text style={[styles.summaryStatUnit, { color: themeColors.textMuted }]}>Calories Burned</Text>
</View>
<View style={[styles.summaryStatBox, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<Text style={[styles.summaryStatVal, { color: themeColors.text }]}>{completedSummary.steps}</Text>
<Text style={[styles.summaryStatUnit, { color: themeColors.textMuted }]}>Est. Steps</Text>
</View>
</View>
)}

<TouchableOpacity
style={[styles.summaryCloseBtn, { backgroundColor: themeColors.primary }]}
onPress={() => setCompletedSummary(null)}
>
<Text style={[styles.summaryCloseBtnText, { color: '#ffffff' }]}>Save to History</Text>
</TouchableOpacity>
</View>
</View>
</Modal>

<Modal
visible={showMapLayersModal}
transparent={true}
animationType="slide"
onRequestClose={() => setShowMapLayersModal(false)}
>
<View style={styles.bottomSheetBackdrop}>
<TouchableOpacity
style={StyleSheet.absoluteFill}
activeOpacity={1}
onPress={() => setShowMapLayersModal(false)}
/>
<View
style={[
styles.bottomSheetCard,
{
backgroundColor: themeColors.surface,
borderColor: themeColors.border,
maxHeight: '80%',
},
]}
>
{/* Grab handle */}
<View style={[styles.sheetHandle, { backgroundColor: themeColors.borderLight }]} />

<View style={styles.sheetHeaderRow}>
<View style={{ flex: 1, paddingRight: 8 }}>
<Text style={[styles.sheetTitle, { color: themeColors.text }]}>Map Themes & Buildings</Text>
<Text style={[styles.sheetSubtitle, { color: themeColors.textSecondary }]}>
Choose your theme & customize building labels
</Text>
</View>
<TouchableOpacity
style={[styles.sheetCloseButton, { backgroundColor: themeColors.surfaceElevated }]}
onPress={() => setShowMapLayersModal(false)}
>
<Ionicons name="close" size={20} color={themeColors.textSecondary} />
</TouchableOpacity>
</View>

<ScrollView
showsVerticalScrollIndicator={true}
nestedScrollEnabled={true}
contentContainerStyle={{ paddingBottom: 16 }}
>
{/* 3D Buildings & Place Labels Toggle */}
<View style={styles.sheetSection}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted }]}>BUILDING & PLACE LABELS</Text>
<View style={[styles.buildingsToggleCard, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<View style={{ flex: 1, paddingRight: 8 }}>
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
<Ionicons name="business" size={16} color={showsBuildings ? themeColors.primary : themeColors.textMuted} />
<Text style={[styles.buildingsToggleTitle, { color: themeColors.text }]}>
Building & Place Labels
</Text>
</View>
<Text style={[styles.buildingsToggleSubtitle, { color: themeColors.textMuted }]}>
{showsBuildings ? '3D buildings, place titles, and landmark labels are visible' : 'Clean label-free map with markers and routes only'}
</Text>
</View>

{/* Switch Button */}
<TouchableOpacity
style={[
styles.buildingsSwitchBtn,
showsBuildings
? { backgroundColor: themeColors.primary }
: { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 },
]}
onPress={() => {
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
setShowsBuildings(!showsBuildings);
}}
activeOpacity={0.8}
>
<Text
style={[
styles.buildingsSwitchText,
showsBuildings ? { color: '#09090b' } : { color: themeColors.textMuted },
]}
>
{showsBuildings ? 'ON' : 'OFF'}
</Text>
</TouchableOpacity>
</View>
</View>

{/* Past Recorded Workouts Overlay Toggle */}
<View style={styles.sheetSection}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted }]}>WORKOUT TRAILS OVERLAY</Text>
<View style={[styles.buildingsToggleCard, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<View style={{ flex: 1, paddingRight: 8 }}>
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
<Ionicons name="footsteps" size={16} color={showPastWalks ? '#a1a1aa' : themeColors.textMuted} />
<Text style={[styles.buildingsToggleTitle, { color: themeColors.text }]}>
Past Workouts on Map
</Text>
</View>
<Text style={[styles.buildingsToggleSubtitle, { color: themeColors.textMuted }]}>
{showPastWalks
? `${pastWalks.length} past workout line${pastWalks.length === 1 ? '' : 's'} visible in subtle grey on the map`
: 'Past workout paths hidden from map'}
</Text>
</View>

{/* Switch Button */}
<TouchableOpacity
style={[
styles.buildingsSwitchBtn,
showPastWalks
? { backgroundColor: '#71717a' }
: { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 },
]}
onPress={() => {
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
setShowPastWalks(!showPastWalks);
}}
activeOpacity={0.8}
>
<Text
style={[
styles.buildingsSwitchText,
showPastWalks ? { color: '#ffffff' } : { color: themeColors.textMuted },
]}
>
{showPastWalks ? 'ON' : 'OFF'}
</Text>
</TouchableOpacity>
</View>
</View>

{/* Live Friends Walking Trails & Cursors Overlay Toggle */}
<View style={styles.sheetSection}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted }]}>FRIENDS LIVE OVERLAY</Text>
<View style={[styles.buildingsToggleCard, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<View style={{ flex: 1, paddingRight: 8 }}>
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
<Ionicons name="people" size={16} color={showFriendsOnMap ? '#ec4899' : themeColors.textMuted} />
<Text style={[styles.buildingsToggleTitle, { color: themeColors.text }]}>
Friends on Map
</Text>
</View>
<Text style={[styles.buildingsToggleSubtitle, { color: themeColors.textMuted }]}>
{showFriendsOnMap
? `${friendsOnMap.length} friend${friendsOnMap.length === 1 ? '' : 's'} with personalized cursor colors & trails`
: 'Friend map cursors hidden'}
</Text>
</View>

{/* Switch Button */}
<TouchableOpacity
style={[
styles.buildingsSwitchBtn,
showFriendsOnMap
? { backgroundColor: '#ec4899' }
: { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 },
]}
onPress={() => {
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
setShowFriendsOnMap(!showFriendsOnMap);
}}
activeOpacity={0.8}
>
<Text
style={[
styles.buildingsSwitchText,
showFriendsOnMap ? { color: '#ffffff' } : { color: themeColors.textMuted },
]}
>
{showFriendsOnMap ? 'ON' : 'OFF'}
</Text>
</TouchableOpacity>
</View>
</View>

{/* Map Appearance: Dark vs Light */}
<View style={styles.sheetSection}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted }]}>MAP APPEARANCE</Text>
<View style={styles.appearanceRow}>
<TouchableOpacity
style={[
styles.appearanceOption,
{ backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border },
mapTheme === 'dark' && [styles.appearanceOptionActive, { borderColor: themeColors.primary, backgroundColor: `${themeColors.primary}18` }],
]}
onPress={() => {
Haptics.selectionAsync().catch(() => {});
setMapTheme('dark');
}}
activeOpacity={0.8}
>
<View style={[styles.themePreviewDark, { borderColor: themeColors.border }]}>
<View style={styles.themeRoadLineDark} />
<View style={styles.themeRoadLineSubDark} />
</View>
<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 4 }}>
<Text style={[styles.appearanceLabel, { color: themeColors.text }, mapTheme === 'dark' && { color: themeColors.primary }]}>
Dark Mode
</Text>
{mapTheme === 'dark' && <Ionicons name="checkmark-circle" size={15} color={themeColors.primary} />}
</View>
<Text style={[styles.appearanceDesc, { color: themeColors.textMuted }]}>OLED deep contrast</Text>
</TouchableOpacity>

<TouchableOpacity
style={[
styles.appearanceOption,
{ backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border },
mapTheme === 'light' && [styles.appearanceOptionActive, { borderColor: themeColors.primary, backgroundColor: `${themeColors.primary}18` }],
]}
onPress={() => {
Haptics.selectionAsync().catch(() => {});
setMapTheme('light');
}}
activeOpacity={0.8}
>
<View style={[styles.themePreviewLight, { borderColor: themeColors.border }]}>
<View style={styles.themeRoadLineLight} />
<View style={styles.themeRoadLineSubLight} />
</View>
<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 4 }}>
<Text style={[styles.appearanceLabel, { color: themeColors.text }, mapTheme === 'light' && { color: themeColors.primary }]}>
Light Mode
</Text>
{mapTheme === 'light' && <Ionicons name="checkmark-circle" size={15} color={themeColors.primary} />}
</View>
<Text style={[styles.appearanceDesc, { color: themeColors.textMuted }]}>Crisp sunlight clarity</Text>
</TouchableOpacity>
</View>
</View>

{/* Map Type / Layer Styles Grid */}
<View style={styles.sheetSection}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted }]}>MAP STYLES</Text>
<View style={styles.mapTypesGrid}>
{/* Standard Map */}
<TouchableOpacity
style={[
styles.mapTypeCard,
{ backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border },
mapType === 'standard' && [styles.mapTypeCardActive, { borderColor: themeColors.primary, backgroundColor: `${themeColors.primary}15` }],
]}
onPress={() => selectMapType('standard')}
activeOpacity={0.7}
>
<View style={[styles.texturePreviewStandard, { borderColor: themeColors.border }]}>
<View style={styles.textureRoadMajor} />
<View style={styles.textureRoadMinor} />
<View style={styles.textureBuildingBlock1} />
<View style={styles.textureBuildingBlock2} />
</View>
<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
<Text style={[styles.mapTypeCardTitle, { color: themeColors.text }, mapType === 'standard' && { color: themeColors.primary }]}>
Standard
</Text>
{mapType === 'standard' && <Ionicons name="checkmark-circle" size={15} color={themeColors.primary} />}
</View>
<Text style={[styles.mapTypeCardSub, { color: themeColors.textMuted }]}>Apple vector map</Text>
</TouchableOpacity>

{/* Muted Standard */}
<TouchableOpacity
style={[
styles.mapTypeCard,
{ backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border },
mapType === 'mutedStandard' && [styles.mapTypeCardActive, { borderColor: themeColors.primary, backgroundColor: `${themeColors.primary}15` }],
]}
onPress={() => selectMapType('mutedStandard')}
activeOpacity={0.7}
>
<View style={[styles.texturePreviewMuted, { borderColor: themeColors.border }]}>
<View style={styles.textureRoadMuted} />
<View style={styles.textureBlockMuted} />
</View>
<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
<Text style={[styles.mapTypeCardTitle, { color: themeColors.text }, mapType === 'mutedStandard' && { color: themeColors.primary }]}>
Muted
</Text>
{mapType === 'mutedStandard' && <Ionicons name="checkmark-circle" size={15} color={themeColors.primary} />}
</View>
<Text style={[styles.mapTypeCardSub, { color: themeColors.textMuted }]}>Low-contrast route focus</Text>
</TouchableOpacity>

{/* Satellite Map */}
<TouchableOpacity
  style={[
    styles.mapTypeCard,
    { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border },
    (mapType === 'satellite' || mapType === 'hybrid') && [styles.mapTypeCardActive, { borderColor: themeColors.primary, backgroundColor: `${themeColors.primary}15` }],
  ]}
  onPress={() => selectMapType('satellite')}
  activeOpacity={0.7}
>
  <View style={[styles.texturePreviewSatellite, { borderColor: themeColors.border }]}>
    <View style={styles.textureCanopyPatch} />
    <View style={styles.textureOceanWater} />
    <View style={styles.textureUrbanGrid} />
  </View>
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
    <Text style={[styles.mapTypeCardTitle, { color: themeColors.text }, (mapType === 'satellite' || mapType === 'hybrid') && { color: themeColors.primary }]}>
      Satellite
    </Text>
    {(mapType === 'satellite' || mapType === 'hybrid') && <Ionicons name="checkmark-circle" size={15} color={themeColors.primary} />}
  </View>
  <Text style={[styles.mapTypeCardSub, { color: themeColors.textMuted }]}>High-res aerial imagery</Text>
</TouchableOpacity>
</View>
</View>

{/* Done button */}
<TouchableOpacity
style={[styles.sheetDoneButton, { backgroundColor: themeColors.primary }]}
onPress={() => setShowMapLayersModal(false)}
>
<Text style={[styles.sheetDoneButtonText, { color: themeColors.isDark ? '#09090b' : '#ffffff' }]}>
Done
</Text>
</TouchableOpacity>
</ScrollView>
</View>
</View>
</Modal>

{/* ROUTE BUILDER & EXPLORER MODAL (Bottom half-sheet allowing live map visibility of all 3 routes above) */}
<Modal
visible={showRouteModal}
transparent={true}
animationType="slide"
onRequestClose={() => setShowRouteModal(false)}
>
<View style={styles.routeModalBackdrop} pointerEvents="box-none">
{/* Tap outside the bottom card to dismiss */}
<TouchableOpacity
style={styles.routeModalTopDismissArea}
activeOpacity={1}
onPress={() => setShowRouteModal(false)}
/>

<View
style={[
styles.routeModalBottomCard,
{ backgroundColor: themeColors.surface },
]}
>
<View style={[styles.sheetHandle, { backgroundColor: themeColors.borderLight }]} />

<View style={styles.sheetHeaderRow}>
<View style={{ flex: 1 }}>
<Text style={[styles.sheetTitle, { color: themeColors.text }]}>Explore Suggested Routes</Text>
</View>
</View>

<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
{/* Route Type Segmented Control: Circuit Loop vs One-Way Outbound */}
<View style={styles.sheetSection}>
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted, marginBottom: 0 }]}>
ROUTE TYPE
</Text>
<Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>
{routeType === 'loop' ? 'Start & End at Same Point' : 'Point-to-Point Destination'}
</Text>
</View>
<View style={[styles.pillToggleTrack, { backgroundColor: themeColors.surfaceElevated, borderColor: themeColors.border }]}>
<TouchableOpacity
style={[
styles.pillToggleOption,
{
backgroundColor: routeType === 'loop' ? themeColors.primary : 'transparent',
},
]}
onPress={() => {
Haptics.selectionAsync().catch(() => {});
setRouteType('loop');
handleGenerateRoutes(targetDistanceKm, targetElevation, routeOptions, 'loop');
}}
activeOpacity={0.85}
>
<Ionicons
name="repeat-outline"
size={14}
color={routeType === 'loop' ? (themeColors.isDark ? '#000000' : '#ffffff') : themeColors.textMuted}
style={{ marginRight: 5 }}
/>
<Text
style={{
fontSize: 13,
fontWeight: routeType === 'loop' ? '800' : '600',
color: routeType === 'loop' ? (themeColors.isDark ? '#000000' : '#ffffff') : themeColors.textMuted,
}}
>
Loop Circuit
</Text>
</TouchableOpacity>

<TouchableOpacity
style={[
styles.pillToggleOption,
{
backgroundColor: routeType === 'oneway' ? themeColors.primary : 'transparent',
},
]}
onPress={() => {
Haptics.selectionAsync().catch(() => {});
setRouteType('oneway');
handleGenerateRoutes(targetDistanceKm, targetElevation, routeOptions, 'oneway');
}}
activeOpacity={0.85}
>
<Ionicons
name="arrow-forward-outline"
size={14}
color={routeType === 'oneway' ? (themeColors.isDark ? '#000000' : '#ffffff') : themeColors.textMuted}
style={{ marginRight: 5 }}
/>
<Text
style={{
fontSize: 13,
fontWeight: routeType === 'oneway' ? '800' : '600',
color: routeType === 'oneway' ? (themeColors.isDark ? '#000000' : '#ffffff') : themeColors.textMuted,
}}
>
One-Way
</Text>
</TouchableOpacity>
</View>
</View>

{/* Target Distance Slider: 1,000 ft to Marathon with Logarithmic Scaling */}
<View style={styles.sheetSection}>
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted, marginBottom: 0 }]}>TARGET DISTANCE</Text>
<Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.primary }}>
{isUS
? targetDistanceKm * 0.621371 < 0.25
? `${Math.round(targetDistanceKm * 3280.84 / 50) * 50} ft`
: Math.abs(targetDistanceKm * 0.621371 - 26.2) < 0.3
? '26.2 mi (Marathon)'
: `${(targetDistanceKm * 0.621371).toFixed(1)} mi`
: targetDistanceKm < 1.0
? `${Math.round((targetDistanceKm * 1000) / 50) * 50} m`
: Math.abs(targetDistanceKm - 42.2) < 0.4
? '42.2 km (Marathon)'
: `${targetDistanceKm.toFixed(1)} km`}
</Text>
</View>
<DistanceSlider
value={targetDistanceKm}
min={0.3048}
max={42.195}
isUS={isUS}
primaryColor={themeColors.primary}
surfaceColor={themeColors.surfaceElevated}
borderColor={themeColors.border}
onChange={(val) => setTargetDistanceKm(val)}
onCommit={(val) => handleGenerateRoutes(val, targetElevation, routeOptions, routeType)}
/>
</View>

{/* Elevation Profile Selector: Flat / Rolling / Hilly */}
<View style={styles.sheetSection}>
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted, marginBottom: 0 }]}>
ELEVATION PROFILE
</Text>
<Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>
{targetElevation === 'flat' ? 'Level Grade / Valleys' : targetElevation === 'rolling' ? 'Moderate Incline' : targetElevation === 'hilly' ? 'Hillside & Ridge Trails' : 'No Preference'}
</Text>
</View>
<View style={{ flexDirection: 'row', gap: 8 }}>
{[
{ key: 'flat', label: 'Flat', icon: 'remove-outline' },
{ key: 'rolling', label: 'Rolling', icon: 'trending-up-outline' },
{ key: 'hilly', label: 'Hilly', icon: 'trail-sign-outline' },
].map((item) => {
const isActive = targetElevation === item.key;
const activeFg = themeColors.isDark ? '#000000' : '#ffffff';
return (
<TouchableOpacity
key={item.key}
style={{
flex: 1,
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
gap: 6,
paddingVertical: 9,
borderRadius: 12,
borderWidth: 1,
borderColor: isActive ? themeColors.primary : themeColors.border,
backgroundColor: isActive ? themeColors.primary : themeColors.surfaceElevated,
}}
onPress={() => {
Haptics.selectionAsync().catch(() => {});
const newElev = isActive ? null : (item.key as 'flat' | 'rolling' | 'hilly');
setTargetElevation(newElev);
handleGenerateRoutes(targetDistanceKm, newElev, routeOptions, routeType);
}}
activeOpacity={0.8}
>
<Ionicons
name={item.icon as any}
size={15}
color={isActive ? activeFg : themeColors.textSecondary}
/>
<Text
style={{
fontSize: 12,
fontWeight: isActive ? '800' : '600',
color: isActive ? activeFg : themeColors.text,
}}
>
{item.label}
</Text>
</TouchableOpacity>
);
})}
</View>
</View>

{/* Route Preferences & Road Controls (Matching the Searching Modal design) */}
<View style={styles.sheetSection}>
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted, marginBottom: 0 }]}>
ROUTING PREFERENCES
</Text>
<Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>
{(!preferParks && !avoidTrafficLights && !avoidBusyRoads) ? 'Fastest Path Default' : 'Custom Preferences'}
</Text>
</View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { key: 'quiet', label: 'Quiet Roads', icon: 'shield-checkmark-outline', isActive: avoidBusyRoads },
          { key: 'parks', label: 'Parks & Trails', icon: 'leaf-outline', isActive: preferParks },
          { key: 'lights', label: 'Avoid Lights', icon: 'stopwatch-outline', isActive: avoidTrafficLights },
          ...(activityType === 'cycle'
            ? [{ key: 'lanes', label: 'Bike Lanes', icon: 'bicycle-outline', isActive: preferCyclingLanes }]
            : []),
        ].map((item) => {
          const isActive = item.isActive;
          const activeFg = themeColors.isDark ? '#000000' : '#ffffff';
          return (
            <TouchableOpacity
              key={item.key}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 9,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: isActive ? themeColors.primary : themeColors.border,
                backgroundColor: isActive ? themeColors.primary : themeColors.surfaceElevated,
              }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                let nextBusy = avoidBusyRoads;
                let nextParks = preferParks;
                let nextLights = avoidTrafficLights;
                let nextLanes = preferCyclingLanes;

                if (item.key === 'quiet') {
                  nextBusy = !avoidBusyRoads;
                  setAvoidBusyRoads(nextBusy);
                } else if (item.key === 'parks') {
                  nextParks = !preferParks;
                  setPreferParks(nextParks);
                } else if (item.key === 'lights') {
                  nextLights = !avoidTrafficLights;
                  setAvoidTrafficLights(nextLights);
                } else if (item.key === 'lanes') {
                  nextLanes = !preferCyclingLanes;
                  setPreferCyclingLanes(nextLanes);
                }

                // If none are picked, default to fastest path
                const nonePicked = !nextBusy && !nextParks && !nextLights && (!nextLanes || activityType !== 'cycle');
                setPreferFastest(nonePicked);

                const updatedOpts: RouteOptions = {
                  ...routeOptions,
                  avoidBusyRoads: nextBusy,
                  preferParks: nextParks,
                  avoidTrafficLights: nextLights,
                  preferCyclingLanes: nextLanes,
                  preferFastest: nonePicked,
                };
                handleGenerateRoutes(targetDistanceKm, targetElevation, updatedOpts, routeType);
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={item.icon as any}
                size={15}
                color={isActive ? activeFg : themeColors.textSecondary}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: isActive ? '800' : '600',
                  color: isActive ? activeFg : themeColors.text,
                }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>

{/* Suggested Routes List with Colored Map Route Indicators */}
<View style={styles.sheetSection}>
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
<Text style={[styles.sheetSectionTitle, { color: themeColors.textMuted, marginBottom: 0 }]}>
{routeType === 'loop' ? 'CIRCUITS ON MAP' : 'ONE-WAY ROUTES ON MAP'} ({routeSuggestions.length})
</Text>
{isGeneratingRoutes && (
<ActivityIndicator size="small" color={themeColors.primary} />
)}
</View>

{routeSuggestions.length === 0 && !isGeneratingRoutes && (
<View style={[styles.emptyRoutesBox, { borderColor: themeColors.border, backgroundColor: themeColors.surfaceElevated }]}>
<Ionicons name="map-outline" size={24} color={themeColors.textMuted} />
<Text style={[styles.emptyRoutesText, { color: themeColors.textSecondary }]}>
{routeType === 'loop' ? 'Drag the distance slider above to find real loop circuits' : 'Drag the distance slider above to find real outbound routes'}
</Text>
</View>
)}

{routeSuggestions.map((route, idx) => {
const isSelected = selectedRoute?.id === route.id;
const routeColors = ['#10b981', '#38bdf8', '#f59e0b'];
const routeColor = routeColors[idx % routeColors.length];
const displayDist = isUS
? `${(route.distanceKm * 0.621371).toFixed(1)} mi`
: `${route.distanceKm} km`;

return (
<View
key={route.id}
style={[
styles.routeCard,
{ backgroundColor: themeColors.surfaceElevated, borderColor: isSelected ? routeColor : themeColors.border },
isSelected && { borderWidth: 2, backgroundColor: `${routeColor}12` },
]}
>
<TouchableOpacity
onPress={() => handlePreviewRoute(route)}
activeOpacity={0.8}
>
<View style={styles.routeCardTop}>
{/* Colored Map Route Badge Indicator */}
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
<View style={[styles.routeColorBadge, { backgroundColor: routeColor }]}>
<Ionicons name="navigate" size={13} color="#ffffff" />
</View>
<View style={{ flex: 1 }}>
<Text style={[styles.routeCardTitle, { color: themeColors.text }]}>{route.name}</Text>
<Text style={[styles.routeCardDesc, { color: themeColors.textSecondary }]} numberOfLines={1}>
{route.summary || route.destinationName}
</Text>
</View>
</View>

<View style={[styles.routeDiffBadge, { backgroundColor: `${routeColor}20`, borderColor: routeColor }]}>
<Text style={[styles.routeDiffText, { color: routeColor }]}>Map Route {idx + 1}</Text>
</View>
</View>

{/* Prominently Listed Distance and Time */}
<View style={[styles.routeStatsRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
<View style={styles.routeStatItem}>
<Ionicons name="footsteps-outline" size={14} color={routeColor} />
<View>
<Text style={[styles.routeStatVal, { color: themeColors.text, fontWeight: '800' }]}>{displayDist}</Text>
<Text style={[styles.routeStatSub, { color: themeColors.textMuted }]}>Distance</Text>
</View>
</View>
<View style={styles.routeStatItem}>
<Ionicons name="time-outline" size={14} color={routeColor} />
<View>
<Text style={[styles.routeStatVal, { color: themeColors.text, fontWeight: '800' }]}>~{route.durationMins} min</Text>
<Text style={[styles.routeStatSub, { color: themeColors.textMuted }]}>Est. Time</Text>
</View>
</View>
<View style={styles.routeStatItem}>
<Ionicons name="trending-up-outline" size={14} color={themeColors.textMuted} />
<View>
<Text style={[styles.routeStatVal, { color: themeColors.text }]}>+{route.elevationGainMeters}m</Text>
<Text style={[styles.routeStatSub, { color: themeColors.textMuted }]}>Elevation</Text>
</View>
</View>
</View>
</TouchableOpacity>

{/* Highlights / POI Images Along the Route */}
{route.pois && route.pois.length > 0 && (
<View style={styles.routePoiSection}>
<View style={styles.routePoiSectionHeader}>
<Ionicons name="images" size={14} color={routeColor} />
<Text style={[styles.routePoiSectionTitle, { color: themeColors.textSecondary }]}>
Highlights Along This Route
</Text>
<Text style={[styles.routePoiCountBadge, { color: themeColors.textMuted }]}>
{route.pois.length} spots (Swipe →)
</Text>
</View>
<ScrollView
horizontal={true}
nestedScrollEnabled={true}
directionalLockEnabled={true}
scrollEventThrottle={16}
showsHorizontalScrollIndicator={true}
contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingRight: 16 }}
>
{route.pois.map((poi, pIdx) => {
const catIcon =
poi.category === 'park' ? 'leaf'
: poi.category === 'water' ? 'water'
: poi.category === 'viewpoint' ? 'eye'
: poi.category === 'trail' ? 'walk'
: 'compass';

return (
<View
key={poi.id || pIdx}
style={[
styles.poiCard,
{ backgroundColor: themeColors.surface, borderColor: themeColors.border },
]}
>
<View style={styles.poiImageContainer}>
<Image source={{ uri: poi.imageUrl }} style={styles.poiImage} resizeMode="cover" />
<View style={[styles.poiMilestoneBadge, { backgroundColor: routeColor }]}>
<Text style={styles.poiMilestoneText}>STOP {pIdx + 1}</Text>
</View>
<View style={styles.poiCategoryBadge}>
<Ionicons name={catIcon as any} size={11} color="#FFF" />
<Text style={styles.poiCategoryText}>{poi.category.toUpperCase()}</Text>
</View>
</View>
<View style={[styles.poiInfo, { padding: 10 }]}>
<Text style={[styles.poiName, { color: themeColors.text }]} numberOfLines={1}>
{poi.name}
</Text>
{typeof poi.distanceAlongKm === 'number' && (
<View style={styles.poiDistRow}>
<Ionicons name="navigate-outline" size={10} color={routeColor} />
<Text style={[styles.poiDist, { color: themeColors.textMuted }]}>
{isUS ? `${(poi.distanceAlongKm * 0.621371).toFixed(1)} mi along route` : `${poi.distanceAlongKm} km along route`}
</Text>
</View>
)}
{Boolean(poi.description || poi.infoSnippet) && (
<Text
style={{
fontSize: 10.5,
lineHeight: 14,
color: themeColors.textSecondary,
marginTop: 4,
}}
numberOfLines={2}
>
{poi.description || poi.infoSnippet}
</Text>
)}
</View>
</View>
);
})}
</ScrollView>
</View>
)}

{/* Select & Start Button */}
<TouchableOpacity
style={[
styles.selectRouteActionBtn,
{ backgroundColor: isSelected ? routeColor : themeColors.surface, borderColor: routeColor },
]}
onPress={() => handleSelectRoute(route)}
activeOpacity={0.8}
>
<Ionicons
name={isSelected ? 'checkmark-circle' : 'play'}
size={15}
color={isSelected ? '#09090b' : routeColor}
/>
<Text style={[styles.selectRouteActionText, { color: isSelected ? '#09090b' : routeColor }]}>
{isSelected ? 'Start This Route' : 'Select This Route'}
</Text>
</TouchableOpacity>
</View>
);
})}
</View>
</ScrollView>
</View>
</View>
</Modal>
</View>
);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  arrowMarkerContainer: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIconShadow: {
    shadowColor: '#a3e635',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.65,
    shadowRadius: 6,
    elevation: 8,
  },
  arrowMarkerExtrusionBase: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  /* Full-width Top Turn-by-Turn Navigation Bar (takes whole top bar across edge-to-edge) */
  topNavCardContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderBottomWidth: 2,
    zIndex: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  topNavCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topNavIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNavInstruction: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  topNavThen: {
    fontSize: 11,
    marginTop: 2,
  },
  topNavDistBadge: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  topNavDistText: {
    fontSize: 12,
    fontWeight: '800',
  },
  voiceMuteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topReroutingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  topReroutingText: {
    fontSize: 13,
    fontWeight: '700',
  },
  /* Unified Topmost Bar: Fused single pill [Activity | Routes | Search] */
  unifiedTopBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 62 : 20,
    left: 14,
    right: 14,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 30,
  },
  unifiedActivityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: '100%',
    justifyContent: 'center',
  },
  unifiedRoutesBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedBarDivider: {
    width: 1,
    height: 22,
    opacity: 0.6,
  },
  unifiedSearchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 10,
  },
  topBarContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 62 : 20,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 30,
  },
  activityDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 42,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    height: '100%',
    padding: 0,
  },
  searchClearBtn: {
    padding: 2,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 54,
    left: 0,
    width: 150,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 40,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dropdownMenuItemText: {
    fontSize: 13,
    fontWeight: '600',
  },
  searchResultsDropdown: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 116 : 80,
    left: 14,
    right: 14,
    maxHeight: 320,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
    zIndex: 35,
  },
  searchResultsBottomMenu: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 70 : 60,
    left: 0,
    right: 0,
    maxHeight: 280,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 20,
    zIndex: 50,
  },
  searchBottomMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBottomMenuTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  searchBottomCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  searchBottomCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  searchBottomCloseBtn: {
    padding: 2,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchResultName: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchResultAddress: {
    fontSize: 11,
    marginTop: 2,
  },
  searchResultDistBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchResultDistText: {
    fontSize: 10,
    fontWeight: '700',
  },
  searchOptionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  searchOptionsTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  searchOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  searchOptionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  searchResultThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  searchResultThumbImg: {
    width: '100%',
    height: '100%',
  },
  searchResultCategoryDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultCategoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 0.8,
  },
  searchResultCategoryBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  /* Route POI Images Preview Strip */
  routePoiSection: {
    marginTop: 12,
    marginBottom: 6,
  },
  routePoiSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  routePoiSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  routePoiCountBadge: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  poiMilestoneBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#38bdf8',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  poiMilestoneText: {
    color: '#09090b',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  /* Friend Cursor Info Popup Modal */
  friendPopupBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  friendPopupCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  friendPopupHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  friendPopupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  friendPopupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendPopupAvatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  friendPopupName: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendPopupStatusRow: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  friendPopupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  friendPopupStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  friendPopupStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  friendPopupStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  friendPopupStatVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  friendPopupStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 3,
  },
  friendPopupStatDivider: {
    width: 1,
    height: 24,
  },
  poiCard: {
    width: 180,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  poiImageContainer: {
    width: '100%',
    height: 104,
    position: 'relative',
  },
  poiImage: {
    width: '100%',
    height: '100%',
  },
  poiCategoryBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
  },
  poiName: {
    fontSize: 12,
    fontWeight: '700',
  },
  poiDistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  poiDist: {
    fontSize: 10,
    fontWeight: '600',
  },
  /* Selected Route Preview Stops Strip */
  routePreviewStopsSection: {
    marginBottom: 12,
  },
  previewPoiCard: {
    width: 140,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  previewPoiImgWrap: {
    width: '100%',
    height: 74,
    position: 'relative',
  },
  previewPoiImg: {
    width: '100%',
    height: '100%',
  },
  previewPoiDetails: {
    padding: 6,
  },
  previewPoiName: {
    fontSize: 11,
    fontWeight: '700',
  },
  mapPoiPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  /* Friend Live Map Cursor & Multiplayer Tags */
  friendCursorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
  },
  friendCursorPulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  friendCursorPointerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendCursorIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 3,
  },
  friendCursorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: -2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
  friendCursorTagSelected: {
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  friendCursorStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  friendCursorTagText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  friendMapCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1.5,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  friendMapCalloutText: {
    fontSize: 10,
    fontWeight: '800',
  },
  friendLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  friendCursorPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  poiCalloutBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 4,
    maxWidth: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 5,
  },
  poiCalloutText: {
    color: '#fafafa',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },

  /* Route Preview & Customization Confirmation Card */
  routePreviewCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 44 : 26, // Pivoted cleanly down above the tab bar without excessive bottom space
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
    maxHeight: '75%',
  },
  routePreviewHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
    opacity: 0.8,
  },
  routePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  routePreviewTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  routePreviewSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  routePreviewCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routePreviewScrollBody: {
    flexShrink: 1,
  },
  routePreviewScrollContent: {
    paddingBottom: 8,
  },
  routePreviewStatsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  routePreviewStatCol: {
    alignItems: 'center',
    flex: 1,
  },
  routePreviewStatVal: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  routePreviewStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routePreviewStatDivider: {
    width: 1,
    height: 24,
  },
  routePreviewPreferencesSection: {
    marginBottom: 14,
  },
  previewPrefSubSection: {
    marginBottom: 10,
  },
  previewPrefSubTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  previewElevOptionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  previewElevOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewElevOptionText: {
    fontSize: 11.5,
  },
  previewToggleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewToggleCard: {
    width: '48.5%',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  previewToggleTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  previewToggleSub: {
    fontSize: 10,
    marginTop: 1,
  },
  routePreviewCustomizerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  routePreviewPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  routePreviewPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  routePreviewActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  routePreviewCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routePreviewCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
  routePreviewStartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#a3e635',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  routePreviewStartText: {
    color: '#09090b',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  /* Search Results Action Menu Trigger */
  searchResultMoreBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  /* Map Draggable Stop Pins */
  stopPinBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  stopPinBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  stopPinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    alignSelf: 'center',
  },

  /* Route Stops Section in Preview Card - Minimalist transparent styling */
  routeStopsSection: {
    paddingVertical: 4,
    marginBottom: 12,
  },
  routeStopsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  routeStopsSectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  manageStopsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  manageStopsPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  stopsDraggableHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
    opacity: 0.85,
  },
  stopsDraggableHintText: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  stopsChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  stopChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 160,
  },
  stopChipDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  stopChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stopsManagerExpandedList: {
    gap: 4,
    marginTop: 4,
  },
  stopManagerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stopLeftFixedSpot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopGrabHandleSpot: {
    width: 28,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  stopManagerNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  stopManagerNumberText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  stopManagerName: {
    fontSize: 13,
    fontWeight: '700',
  },
  stopManagerSub: {
    fontSize: 10.5,
    marginTop: 1,
  },
  startOriginTag: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  startOriginTagText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  quickMovePill: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Place Action Sheet Modal */
  placeActionSheet: {
    width: '100%',
    maxWidth: 420,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 16,
  },
  placeActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  placeActionThumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  placeActionThumb: {
    width: '100%',
    height: '100%',
  },
  placeActionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  placeActionSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  placeActionButtonsCol: {
    gap: 10,
  },
  placeActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  placeActionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeActionBtnTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  placeActionBtnSub: {
    fontSize: 10,
    marginTop: 2,
  },
  placeActionCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 2,
  },
  placeActionCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },

  /* Floating Top HUD Bar - Positioned below the unified top bar */
  topHudContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 114 : 72,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  compassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  compassText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  routeExploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  routeExploreBtnText: {
    fontSize: 12,
    fontWeight: '800',
    maxWidth: 130,
  },
  selectedRouteBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 160 : 124,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    zIndex: 10,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  selectedRouteTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  selectedRouteSub: {
    fontSize: 11,
    marginTop: 2,
  },
  clearRouteBtn: {
    padding: 4,
  },
  directionsToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  directionsPanel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 214 : 178,
    left: 14,
    right: 14,
    maxHeight: 280,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  directionsPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  directionsPanelTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    flex: 1,
  },
  directionsPanelSub: {
    fontSize: 11,
    fontWeight: '600',
  },
  directionsList: {
    maxHeight: 230,
  },
  directionStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  directionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  directionStepText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  directionStreetName: {
    fontSize: 10,
    marginTop: 1,
  },
  directionStepDist: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 0,
    marginLeft: 4,
  },
  topActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  controlButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'System',
  },
  startButton: {
    backgroundColor: '#a3e635',
  },
  stopButton: {
    backgroundColor: '#dc2626',
  },
  actionButtonText: {
    color: '#09090b',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  liveHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  livePulseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveBadgeText: {
    color: '#fafafa',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveCaloriePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#18181b',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  liveCaloriePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 4,
  },
  metricColumn: {
    alignItems: 'center',
  },
  metricNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fafafa',
    letterSpacing: -0.5,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  metricDivider: {
    width: 1,
    height: 28,
  },
  loadingPill: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(24, 24, 27, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    zIndex: 100,
  },
  loadingText: {
    color: '#d4d4d8',
    fontSize: 12,
    fontWeight: '600',
  },
  searchSettingsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchOptionsPopover: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 99,
  },
  liveMetricsCard: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 40,
  },
  alertCard: {
    position: 'absolute',
    top: 70,
    left: 20,
    right: 20,
    backgroundColor: '#1c1917',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#78350f',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 100,
  },
  alertText: {
    flex: 1,
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
  },
  alertBtn: {
    backgroundColor: '#d97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  alertBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  poiCategoryText: {
    color: '#fafafa',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  poiInfo: {
    flex: 1,
  },
  modalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  expandedSection: {
    marginBottom: 18,
  },
  expandedLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  pillToggleTrack: {
    flexDirection: 'row',
    height: 44,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
  },
  pillToggleOption: {
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillToggleOptionActive: {
    backgroundColor: '#a3e635',
  },
  pillToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#71717a',
  },
  pillToggleTextActive: {
    color: '#09090b',
    fontWeight: '900',
  },
  setupInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  setupInputCol: {
    flex: 1,
  },
  setupInputLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
  actionButton: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  expandedModalSheet: {
    backgroundColor: '#121215',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#27272a',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fafafa',
    textAlign: 'center',
    marginBottom: 6,
  },
  feetInchesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerColumnContainer: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    overflow: 'hidden',
    paddingVertical: 2,
  },
  pickerArrowBtn: {
    width: '100%',
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerViewport: {
    height: 132, // Shows exactly 3 items at 44px each
    width: '100%',
    position: 'relative',
  },
  pickerCenterHighlighter: {
    position: 'absolute',
    top: 44,
    left: 8,
    right: 8,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 1,
  },
  pickerItemRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 2,
  },
  pickerItemText: {
    color: '#52525b',
    fontSize: 15,
    fontWeight: '600',
  },
  pickerItemTextSelected: {
    color: '#fafafa',
    fontSize: 19,
    fontWeight: '900',
  },
  pickerItemUnit: {
    fontSize: 11,
    fontWeight: '800',
  },
  setupInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    height: 46,
    paddingHorizontal: 12,
  },
  setupInputUnit: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '700',
  },
  modalGenderRow: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    height: 180,
    flexDirection: 'column',
    padding: 4,
    gap: 4,
  },
  modalGenderBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  modalGenderBtnActive: {
    backgroundColor: '#27272a',
  },
  modalGenderSymbol: {
    fontSize: 16,
    fontWeight: '800',
    color: '#71717a',
  },
  modalGenderSymbolActive: {
  },
  passiveNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#18181b',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16,
  },
  passiveNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fafafa',
  },
  passiveNoticeDesc: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 2,
  },
  openSettingsPill: {
    backgroundColor: '#27272a',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  openSettingsPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalButtonsGroup: {
    gap: 10,
  },
  startConfirmedBtn: {
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startConfirmedBtnText: {
    color: '#09090b',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  useDefaultsBtn: {
    backgroundColor: '#18181b',
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#27272a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  useDefaultsBtnText: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cancelBtn: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#52525b',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  summaryCard: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    backgroundColor: '#121215',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  summaryCheckmark: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fafafa',
  },
  summarySubtitle: {
    fontSize: 13,
    color: '#a1a1aa',
    marginTop: 4,
    marginBottom: 20,
  },
  summaryStatsGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  summaryStatBox: {
    width: '48%',
    backgroundColor: '#18181b',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
  },
  summaryStatVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fafafa',
  },
  summaryStatUnit: {
    fontSize: 11,
    color: '#71717a',
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  summaryCloseBtn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCloseBtnText: {
    color: '#09090b',
    fontSize: 15,
    fontWeight: '800',
  },

  /* Bottom Sheet Map Styles Modal */
  bottomSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  bottomSheetCard: {
    backgroundColor: '#121215',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 26,
    borderWidth: 1,
    borderColor: '#27272a',
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3f3f46',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    color: '#fafafa',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 2,
  },
  sheetCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e1e24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSection: {
    marginBottom: 20,
  },
  sheetSectionTitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  /* Buildings Toggle Card */
  buildingsToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  buildingsToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  buildingsToggleSubtitle: {
    fontSize: 11.5,
    marginTop: 3,
  },
  buildingsSwitchBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildingsSwitchText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  /* Map Appearance Row */
  appearanceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  appearanceOption: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  appearanceOptionActive: {},
  appearanceLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  appearanceDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  mapTypeCardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  mapTypeCardSub: {
    fontSize: 11,
    marginTop: 2,
  },

  /* Turn Directions Extra Controls */
  directionsRecalcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  directionsRecalcText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
  },
  walkedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  currentStepBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  currentStepBadgeText: {
    color: '#09090b',
    fontSize: 9.5,
    fontWeight: '800',
  },

  perspectiveRow: {
    flexDirection: 'row',
    gap: 10,
  },
  perspectiveOption: {
    flex: 1,
    backgroundColor: '#18181b',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#27272a',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  perspectiveOptionActive: {
    borderColor: '#a3e635',
    backgroundColor: 'rgba(163, 230, 53, 0.08)',
  },
  perspectiveLabel: {
    color: '#fafafa',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  perspectiveLabelActive: {
    color: '#a3e635',
  },
  perspectiveDesc: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  mapTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mapTypeCard: {
    width: '48%',
    backgroundColor: '#18181b',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#27272a',
    padding: 12,
    alignItems: 'center',
  },
  mapTypeCardActive: {
    borderColor: '#a3e635',
    backgroundColor: 'rgba(163, 230, 53, 0.08)',
  },
  /* Theme Card Graphics */
  themePreviewDark: {
    width: '100%',
    height: 38,
    borderRadius: 8,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 4,
    justifyContent: 'center',
  },
  themeRoadLineDark: {
    position: 'absolute',
    top: 14,
    left: -10,
    right: -10,
    height: 6,
    backgroundColor: '#27272a',
    borderRadius: 3,
  },
  themeRoadLineSubDark: {
    position: 'absolute',
    left: 28,
    top: -5,
    bottom: -5,
    width: 4,
    backgroundColor: '#3f3f46',
  },
  themePreviewLight: {
    width: '100%',
    height: 38,
    borderRadius: 8,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 4,
    justifyContent: 'center',
  },
  themeRoadLineLight: {
    position: 'absolute',
    top: 14,
    left: -10,
    right: -10,
    height: 6,
    backgroundColor: '#ffffff',
    borderWidth: 0.5,
    borderColor: '#d4d4d8',
    borderRadius: 3,
  },
  themeRoadLineSubLight: {
    position: 'absolute',
    left: 28,
    top: -5,
    bottom: -5,
    width: 4,
    backgroundColor: '#fed7aa',
  },

  /* Perspective Graphics */
  perspective2DGraphic: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  gridOverheadLineH: {
    width: '80%',
    height: 2,
    backgroundColor: '#52525b',
  },
  gridOverheadLineV: {
    position: 'absolute',
    height: '80%',
    width: 2,
    backgroundColor: '#52525b',
  },
  perspective3DGraphic: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    flexDirection: 'row',
    gap: 3,
  },
  buildingBlock3D: {
    width: 9,
    height: 16,
    backgroundColor: '#a3e635',
    borderRadius: 2,
    opacity: 0.75,
  },
  buildingBlock3DTall: {
    height: 24,
    backgroundColor: '#84cc16',
    opacity: 0.95,
  },

  /* High-Definition Map Texture Previews */
  texturePreviewStandard: {
    width: '100%',
    height: 52,
    borderRadius: 10,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  textureRoadMajor: {
    position: 'absolute',
    top: 20,
    left: -10,
    right: -10,
    height: 8,
    backgroundColor: '#27272a',
    borderRadius: 4,
  },
  textureRoadMinor: {
    position: 'absolute',
    left: 36,
    top: -5,
    bottom: -5,
    width: 5,
    backgroundColor: '#3f3f46',
  },
  textureBuildingBlock1: {
    position: 'absolute',
    top: 4,
    left: 8,
    width: 18,
    height: 12,
    backgroundColor: '#3f3f46',
    borderRadius: 2,
    opacity: 0.5,
  },
  textureBuildingBlock2: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    width: 24,
    height: 14,
    backgroundColor: '#52525b',
    borderRadius: 2,
    opacity: 0.6,
  },

  texturePreviewMuted: {
    width: '100%',
    height: 52,
    borderRadius: 10,
    backgroundColor: '#232328',
    borderWidth: 1,
    borderColor: '#323238',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  textureRoadMuted: {
    position: 'absolute',
    top: 22,
    left: -10,
    right: -10,
    height: 6,
    backgroundColor: '#2c2c34',
  },
  textureBlockMuted: {
    position: 'absolute',
    top: 6,
    right: 12,
    width: 20,
    height: 12,
    backgroundColor: '#2e2e38',
    borderRadius: 2,
  },

  texturePreviewSatellite: {
    width: '100%',
    height: 52,
    borderRadius: 10,
    backgroundColor: '#1c2826',
    borderWidth: 1,
    borderColor: '#2b3f3c',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  textureCanopyPatch: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2d4a22',
    opacity: 0.85,
  },
  textureOceanWater: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0f2d3a',
    opacity: 0.9,
  },
  textureUrbanGrid: {
    position: 'absolute',
    top: 8,
    right: 16,
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: '#6b7280',
    backgroundColor: '#4b5563',
    opacity: 0.6,
    borderRadius: 3,
  },

  texturePreviewHybrid: {
    width: '100%',
    height: 52,
    borderRadius: 10,
    backgroundColor: '#1b2d28',
    borderWidth: 1,
    borderColor: '#305047',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  textureHybridRoad: {
    position: 'absolute',
    top: 20,
    left: -10,
    right: -10,
    height: 6,
    backgroundColor: '#fbbf24',
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: '#ffffff',
  },
  textureHybridMarker: {
    position: 'absolute',
    top: 8,
    left: 20,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#a3e635',
  },

  texturePreviewTerrain: {
    width: '100%',
    height: 52,
    borderRadius: 10,
    backgroundColor: '#2e261b',
    borderWidth: 1,
    borderColor: '#453826',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  textureElevationContour1: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    height: 38,
    borderBottomWidth: 2,
    borderColor: '#785b34',
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  textureElevationContour2: {
    position: 'absolute',
    top: 6,
    left: 8,
    right: 8,
    height: 32,
    borderBottomWidth: 2,
    borderColor: '#a37e4c',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  textureElevationPeak: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#d97706',
    opacity: 0.7,
  },
  mapTypeTitle: {
    color: '#fafafa',
    fontSize: 14,
    fontWeight: '700',
  },
  mapTypeTitleActive: {
    color: '#a3e635',
  },
  mapTypeSub: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  sheetDoneButton: {
    backgroundColor: '#a3e635',
    borderRadius: 16,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  sheetDoneButtonText: {
    color: '#09090b',
    fontSize: 15,
    fontWeight: '800',
  },

  /* Route Builder & Explorer Styles */
  distanceChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  distanceChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  distanceChipActive: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  distanceChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  routeCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  routeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  routeCardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  routeCardDesc: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  routeDiffBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  routeDiffText: {
    fontSize: 10,
    fontWeight: '800',
  },
  routeStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  routeStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  routeStatVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  routeStatSub: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  routeColorBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectRouteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  selectRouteActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  routeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    justifyContent: 'flex-end',
  },
  routeModalTopDismissArea: {
    flex: 1,
  },
  routeModalBottomCard: {
    maxHeight: '54%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
    elevation: 12,
  },
  emptyRoutesBox: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyRoutesText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },

  /* Active Navigation Next Turn Card */
  nextTurnCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  nextTurnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextTurnIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTurnInstruction: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  nextTurnThen: {
    fontSize: 11,
    marginTop: 2,
  },
  nextTurnDistBadge: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  nextTurnDistText: {
    fontSize: 12,
    fontWeight: '800',
  },
  reroutingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  reroutingText: {
    fontSize: 13,
    fontWeight: '700',
  },

  /* Route Preferences Toggles & Switches */
  prefToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  prefIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  prefDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  switchThumbInactive: {
    alignSelf: 'flex-start',
  },
});
