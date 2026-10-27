import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { loadAllStepData } from '@/constants/stepsStorage';
import { loadWalks, WalkRecord } from '@/constants/walkStorage';
import {
  loadProgressPhotos,
  saveProgressPhoto,
  deleteProgressPhoto,
  ProgressPhoto,
} from '@/constants/workoutStorage';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';
import { ProgressPhotoGalleryModal } from '@/components/ProgressPhotoGalleryModal';
import { metersToMiles, metersToKm } from '@/constants/userProfile';


interface ActivityStreakCalendarProps {
  userId?: string;
  stepsGoal: number;
  distanceGoalKm: number;
  unitSystem?: 'us_customary' | 'metric';
  onSelectDate?: (dateStr: string) => void;
  selectedDate?: string;
  onOpenAiCamera?: () => void;
  onTakePhotoRef?: (triggerFn: () => void) => void;
  onCapturePhotoRef?: (triggerFn: () => void) => void;
  onUploadPhotoRef?: (triggerFn: () => void) => void;
  onOpenGalleryRef?: (triggerFn: (photoId?: string) => void) => void;
  onOpenGallery?: (photoId?: string) => void;
  onPhotoAdded?: () => void;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ActivityStreakCalendar({
  userId,
  stepsGoal,
  distanceGoalKm,
  unitSystem = 'us_customary',
  onSelectDate,
  selectedDate,
  onOpenAiCamera,
  onTakePhotoRef,
  onCapturePhotoRef,
  onUploadPhotoRef,
  onOpenGalleryRef,
  onOpenGallery,
  onPhotoAdded,
}: ActivityStreakCalendarProps) {
  const { colors, isDark } = useTheme();

  // Current viewed month for the calendar
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [stepDataMap, setStepDataMap] = useState<Record<string, { totalSteps: number }>>({});
  const [walksList, setWalksList] = useState<WalkRecord[]>([]);
  const [walkDatesMap, setWalkDatesMap] = useState<Record<string, { totalKm: number; count: number; walks: WalkRecord[] }>>({});

  // Detailed Modal state
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [modalFocusedDate, setModalFocusedDate] = useState<string>(formatYYYYMMDD(new Date()));

  // Progress Photos state
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [showAddPhotoModal, setShowAddPhotoModal] = useState<boolean>(false);
  const [photoTargetDate, setPhotoTargetDate] = useState<string>(formatYYYYMMDD(new Date()));
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState<string>('');

  // Full-screen Gallery & A/B Comparison Modal state (internal fallback)
  const [showGalleryModal, setShowGalleryModal] = useState<boolean>(false);
  const [gallerySelectedPhotoId, setGallerySelectedPhotoId] = useState<string | undefined>(undefined);
  const pendingGalleryPhotoIdRef = useRef<string | undefined>(undefined);

  const handleDetailModalDismissComplete = () => {
    if (pendingGalleryPhotoIdRef.current !== undefined) {
      const photoId = pendingGalleryPhotoIdRef.current === '__ALL__' ? undefined : pendingGalleryPhotoIdRef.current;
      pendingGalleryPhotoIdRef.current = undefined;

      // Small delay ensures iOS/Android window focus returns completely to parent view
      setTimeout(() => {
        if (onOpenGallery) {
          onOpenGallery(photoId);
        } else {
          setGallerySelectedPhotoId(photoId);
          setShowGalleryModal(true);
        }
      }, 50);
    }
  };

  const openGallery = (photoId?: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (showDetailModal) {
      // Defer opening until detail modal is completely dismissed and unmounted
      pendingGalleryPhotoIdRef.current = photoId || '__ALL__';
      setShowDetailModal(false);
    } else {
      if (onOpenGallery) {
        onOpenGallery(photoId);
      } else {
        setGallerySelectedPhotoId(photoId);
        setShowGalleryModal(true);
      }
    }
  };

  useEffect(() => {
    if (onOpenGalleryRef) {
      onOpenGalleryRef((photoId?: string) => {
        openGallery(photoId);
      });
    }
  }, [onOpenGalleryRef]);

  const progressPhotosMap = useMemo(() => {
    const map: Record<string, ProgressPhoto[]> = {};
    for (const p of progressPhotos) {
      if (!map[p.date]) map[p.date] = [];
      map[p.date].push(p);
    }
    return map;
  }, [progressPhotos]);

  const loadData = () => {
    const targetUserId = userId || 'guest_user';

    loadAllStepData(targetUserId).then((map) => {
      setStepDataMap(map);
    });

    loadWalks(targetUserId).then((walks) => {
      setWalksList(walks);
      const wMap: Record<string, { totalKm: number; count: number; walks: WalkRecord[] }> = {};
      for (const w of walks) {
        const d = w.date.split('T')[0];
        if (!wMap[d]) wMap[d] = { totalKm: 0, count: 0, walks: [] };
        wMap[d].totalKm += (w.distanceMeters || 0) / 1000;
        wMap[d].count += 1;
        wMap[d].walks.push(w);
      }
      setWalkDatesMap(wMap);
    });

    loadProgressPhotos(targetUserId).then((photos) => {
      setProgressPhotos(photos);
    });
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  useEffect(() => {
    if (onTakePhotoRef) {
      onTakePhotoRef(() => {
        promptChoicePhoto(formatYYYYMMDD(new Date()));
      });
    }
  }, [onTakePhotoRef]);

  useEffect(() => {
    if (onCapturePhotoRef) {
      onCapturePhotoRef(() => {
        setPhotoTargetDate(formatYYYYMMDD(new Date()));
        handleTakePhoto();
      });
    }
  }, [onCapturePhotoRef]);

  useEffect(() => {
    if (onUploadPhotoRef) {
      onUploadPhotoRef(() => {
        setPhotoTargetDate(formatYYYYMMDD(new Date()));
        handlePickLibraryPhoto();
      });
    }
  }, [onUploadPhotoRef]);

  const promptChoicePhoto = (targetDate?: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (targetDate) setPhotoTargetDate(targetDate);
    Alert.alert(
      'Progress Photo',
      'Choose how you want to add your transformation photo:',
      [
        {
          text: 'Take Photo (Camera)',
          onPress: () => handleTakePhoto(),
        },
        {
          text: 'Upload from Library',
          onPress: () => handlePickLibraryPhoto(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Permission', 'Camera permission is required to take progress photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedPhotoUri(result.assets[0].uri);
        setShowAddPhotoModal(true);
      }
    } catch (e) {
      console.warn('Failed to take camera photo', e);
      Alert.alert('Camera Unavailable', 'Could not open camera on this device.');
    }
  };

  const handlePickLibraryPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photos Permission', 'Permission is needed to choose photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : ['images'] as any,
        allowsEditing: true,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedPhotoUri(result.assets[0].uri);
        setShowAddPhotoModal(true);
      }
    } catch (e) {
      console.warn('Failed to pick photo', e);
    }
  };

  const handleSaveProgressPhoto = async () => {
    const targetUserId = userId || 'guest_user';
    if (!selectedPhotoUri || !targetUserId) return;
    await saveProgressPhoto(targetUserId, {
      uri: selectedPhotoUri,
      date: photoTargetDate,
      caption: photoCaption.trim() || undefined,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShowAddPhotoModal(false);
    setSelectedPhotoUri(null);
    setPhotoCaption('');
    const refreshed = await loadProgressPhotos(targetUserId);
    setProgressPhotos(refreshed);
    if (onPhotoAdded) {
      onPhotoAdded();
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    const targetUserId = userId || 'guest_user';
    if (!targetUserId) return;
    await deleteProgressPhoto(targetUserId, photoId);
    Haptics.selectionAsync().catch(() => {});
    const refreshed = await loadProgressPhotos(targetUserId);
    setProgressPhotos(refreshed);
    if (onPhotoAdded) {
      onPhotoAdded();
    }
  };


  // Compute streak
  const { currentStreak, totalWorkoutsCount, totalActiveDaysCount } = useMemo(() => {
    const today = new Date();

    const isActive = (dStr: string) => {
      const steps = stepDataMap[dStr]?.totalSteps || 0;
      const walks = walkDatesMap[dStr]?.count || 0;
      return walks > 0 || steps >= 4500 || steps >= stepsGoal * 0.7;
    };

    let streak = 0;
    let checkDate = new Date(today);
    let checkStr = formatYYYYMMDD(checkDate);

    if (!isActive(checkStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
      checkStr = formatYYYYMMDD(checkDate);
    }

    while (isActive(checkStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
      checkStr = formatYYYYMMDD(checkDate);
      if (streak > 365) break;
    }

    const allDates = new Set([...Object.keys(stepDataMap), ...Object.keys(walkDatesMap)]);
    let activeDays = 0;
    allDates.forEach((d) => {
      if (isActive(d)) activeDays++;
    });

    return {
      currentStreak: streak,
      totalWorkoutsCount: walksList.length,
      totalActiveDaysCount: activeDays,
    };
  }, [stepDataMap, walkDatesMap, walksList, stepsGoal]);

  // Calendar Grid builder for currentMonth
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isActive: boolean;
      isFullGoalMet: boolean;
      isToday: boolean;
      isSelected: boolean;
      steps: number;
      walksCount: number;
      walkKm: number;
      photosCount: number;
    }> = [];

    const todayStr = formatYYYYMMDD(new Date());

    // Previous month padding
    const prevMonthLastDate = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dNum = prevMonthLastDate - i;
      const prevDate = new Date(year, month - 1, dNum);
      const dStr = formatYYYYMMDD(prevDate);
      days.push({
        dateStr: dStr,
        dayNumber: dNum,
        isCurrentMonth: false,
        isActive: false,
        isFullGoalMet: false,
        isToday: dStr === todayStr,
        isSelected: dStr === selectedDate,
        steps: 0,
        walksCount: 0,
        walkKm: 0,
        photosCount: 0,
      });
    }

    // Days of current month
    for (let d = 1; d <= totalDays; d++) {
      const curDate = new Date(year, month, d);
      const dStr = formatYYYYMMDD(curDate);
      const steps = stepDataMap[dStr]?.totalSteps || 0;
      const walkInfo = walkDatesMap[dStr];
      const hasWalk = (walkInfo?.count || 0) > 0;
      const photoList = progressPhotosMap[dStr] || [];
      const hasPhotos = photoList.length > 0;
      const fullGoal = steps >= stepsGoal || (walkInfo?.totalKm || 0) >= distanceGoalKm;
      const active = hasWalk || hasPhotos || steps >= 4500 || steps >= stepsGoal * 0.7;


      days.push({
        dateStr: dStr,
        dayNumber: d,
        isCurrentMonth: true,
        isActive: active,
        isFullGoalMet: fullGoal,
        isToday: dStr === todayStr,
        isSelected: dStr === selectedDate,
        steps,
        walksCount: walkInfo?.count || 0,
        walkKm: walkInfo?.totalKm || 0,
        photosCount: photoList.length,
      });

    }

    // Next month padding
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let n = 1; n <= remaining; n++) {
        const nextDate = new Date(year, month + 1, n);
        const dStr = formatYYYYMMDD(nextDate);
        days.push({
          dateStr: dStr,
          dayNumber: n,
          isCurrentMonth: false,
          isActive: false,
          isFullGoalMet: false,
          isToday: dStr === todayStr,
          isSelected: dStr === selectedDate,
          steps: 0,
          walksCount: 0,
          walkKm: 0,
          photosCount: 0,
        });

      }
    }

    return days;
  }, [currentMonth, stepDataMap, walkDatesMap, stepsGoal, distanceGoalKm, selectedDate]);

  const monthShort = currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const monthFull = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    Haptics.selectionAsync().catch(() => {});
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    const now = new Date();
    const maxFuture = new Date(now.getFullYear(), now.getMonth(), 1);
    if (currentMonth >= maxFuture) return;
    Haptics.selectionAsync().catch(() => {});
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const isAtFutureMonth = (() => {
    const now = new Date();
    return currentMonth.getFullYear() === now.getFullYear() && currentMonth.getMonth() >= now.getMonth();
  })();

  const handleCirclePress = (item: typeof daysInMonth[0]) => {
    if (!item.isCurrentMonth) return;
    Haptics.selectionAsync().catch(() => {});
    setModalFocusedDate(item.dateStr);
    setPhotoTargetDate(item.dateStr);
    onSelectDate?.(item.dateStr);
    setShowDetailModal(true);
  };

  const focusedDayData = useMemo(() => {
    const steps = stepDataMap[modalFocusedDate]?.totalSteps || 0;
    const walkInfo = walkDatesMap[modalFocusedDate];
    const walks = walkInfo?.walks || [];
    const walkKm = walkInfo?.totalKm || 0;
    const isGoalMet = steps >= stepsGoal || walkKm >= distanceGoalKm;
    const [y, m, d] = modalFocusedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formattedTitle = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    const isUS = unitSystem === 'us_customary';
    const distDisplay = isUS
      ? `${(walkKm * 0.621371).toFixed(2)} mi`
      : `${walkKm.toFixed(2)} km`;

    return {
      dateStr: modalFocusedDate,
      formattedTitle,
      steps,
      walks,
      walkKm,
      distDisplay,
      isGoalMet,
    };
  }, [modalFocusedDate, stepDataMap, walkDatesMap, stepsGoal, distanceGoalKm, unitSystem]);

  return (
    <>
      {/* ── SUPER SIMPLE COMPACT CALENDAR (SLIM ROW: LEFT INFO, RIGHT CIRCLES) ── */}
      <TouchableOpacity
        style={[styles.simpleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setShowDetailModal(true);
        }}
        activeOpacity={0.88}
      >
        {/* Left Side: Streak badge & Month Navigation */}
        <View style={styles.calendarLeftColumn}>
          <View style={styles.streakBadgeStacked}>
            <Ionicons
              name="flame"
              size={23}
              color={currentStreak > 0 ? '#f97316' : '#9ca3af'}
              style={styles.flameIcon}
            />
            <Text style={[styles.streakText, { color: colors.text }]}>
              {currentStreak} Day Streak
            </Text>
          </View>

          <View style={styles.monthNav}>
            <TouchableOpacity
              style={styles.navArrow}
              onPress={(e) => {
                e.stopPropagation();
                handlePrevMonth();
              }}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={12} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={[styles.monthLabel, { color: colors.text }]}>
              {monthShort}
            </Text>
            <TouchableOpacity
              style={[styles.navArrow, isAtFutureMonth && { opacity: 0.25 }]}
              onPress={(e) => {
                e.stopPropagation();
                handleNextMonth();
              }}
              disabled={isAtFutureMonth}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Quick Progress Photo Button */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <TouchableOpacity
              style={[styles.quickCameraBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', borderColor: colors.border }]}
              onPress={(e) => {
                e.stopPropagation();
                promptChoicePhoto(formatYYYYMMDD(new Date()));
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="camera" size={12} color={colors.primary} />
              <Text style={[styles.quickCameraBtnText, { color: colors.text }]}>Photo</Text>
            </TouchableOpacity>
          </View>
        </View>


        {/* Right Side: Minimal Circles Grid (Slim & compact on the right side) */}
        <View style={styles.calendarRightGrid}>
          {daysInMonth.map((item, idx) => {
            const isFaded = !item.isCurrentMonth;
            return (
              <TouchableOpacity
                key={`${item.dateStr}-${idx}`}
                style={styles.circleCell}
                disabled={isFaded}
                onPress={() => handleCirclePress(item)}
                activeOpacity={0.65}
              >
                <View
                  style={[
                    styles.simpleDot,
                    // Days on the edges outside the current month (faded/lighter)
                    isFaded && {
                      opacity: 0.16,
                      backgroundColor: isDark ? '#3f3f46' : '#d1d5db',
                    },
                    // Rest/inactive days inside the current month (darker/more visible than outside days)
                    !isFaded && !item.isActive && {
                      backgroundColor: isDark ? '#27272a' : '#e4e4e7',
                    },
                    // Active but goal not met: LIGHTER GREEN, ONE SOLID COLOR, NO BORDER
                    !isFaded && item.isActive && !item.isFullGoalMet && {
                      backgroundColor: isDark ? '#4ade8055' : '#86efac',
                    },
                    // Full goal met: solid primary vibrant green
                    !isFaded && item.isFullGoalMet && {
                      backgroundColor: colors.primary,
                    },
                    // Today ring
                    item.isToday && [styles.todayRing, { borderColor: isDark ? '#ffffff' : '#000000' }],
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>

      {/* ── DETAILED ACTIVITY & STREAK MODAL ── */}
      <InteractiveBottomModal
        visible={showDetailModal}
        onDismiss={() => setShowDetailModal(false)}
        onDismissComplete={handleDetailModalDismissComplete}
        handleColor={colors.border}
        cardStyle={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.modalHeaderRow}>
          <View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Activity Calendar</Text>
            {/* Month Switcher inside detailed modal */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                style={[styles.modalNavArrow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={13} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>{monthFull}</Text>
              <TouchableOpacity
                onPress={handleNextMonth}
                disabled={isAtFutureMonth}
                style={[
                  styles.modalNavArrow,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  isAtFutureMonth && { opacity: 0.25 },
                ]}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-forward" size={13} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Clean minimal streak badge: no border, no background, non-orange text */}
          <View style={styles.modalStreakPillClean}>
            <Ionicons
              name="flame"
              size={18}
              color={currentStreak > 0 ? '#f97316' : '#9ca3af'}
            />
            <Text style={[styles.modalStreakNumClean, { color: colors.text }]}>
              {currentStreak} {currentStreak === 1 ? 'Day' : 'Days'}
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16, gap: 12 }}
        >
          {/* Calendar Grid with weekday labels & numbers in detailed view */}
          <View style={[styles.modalCalendarCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            {/* Weekday Row */}
            <View style={styles.modalWeekdayRow}>
              {DAY_LETTERS.map((l, i) => (
                <Text key={i} style={[styles.modalWeekdayText, { color: colors.textMuted }]}>
                  {l}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.modalDaysGrid}>
              {daysInMonth.map((item, idx) => {
                const isFaded = !item.isCurrentMonth;
                const isFocused = item.dateStr === modalFocusedDate;
                return (
                  <TouchableOpacity
                    key={`modal-${item.dateStr}-${idx}`}
                    style={styles.modalDayCell}
                    disabled={isFaded}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setModalFocusedDate(item.dateStr);
                      setPhotoTargetDate(item.dateStr);
                      onSelectDate?.(item.dateStr);
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.modalDayInner,
                        item.isFullGoalMet && { backgroundColor: colors.primary },
                        item.isActive && !item.isFullGoalMet && {
                          backgroundColor: isDark ? '#166534' : '#86efac',
                        },
                        item.isToday && !item.isActive && {
                          borderColor: colors.text,
                          borderWidth: 1.5,
                        },
                        // Sector selection: just a black circle around what is selected
                        isFocused && [
                          styles.modalDayInnerSelectedCircle,
                          { borderColor: isDark ? '#ffffff' : '#000000' },
                        ],
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalDayText,
                          { color: isFaded ? colors.textMuted + '40' : colors.text },
                          item.isFullGoalMet && { color: isDark ? '#09090b' : '#ffffff', fontWeight: '800' },
                          item.isActive && !item.isFullGoalMet && { color: isDark ? '#ffffff' : '#064e3b', fontWeight: '800' },
                          item.isToday && !item.isFullGoalMet && !item.isActive && { fontWeight: '800' },
                        ]}
                      >
                        {item.dayNumber}
                      </Text>
                      {item.photosCount > 0 && (
                        <View style={styles.modalDayCameraDot}>
                          <Ionicons name="camera" size={8} color={item.isFullGoalMet ? (isDark ? '#09090b' : '#ffffff') : colors.primary} />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>

                );
              })}
            </View>

            {/* Legend inside detailed view */}
            <View style={[styles.modalLegendRow, { borderTopColor: colors.border }]}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>Goal Met</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: isDark ? '#166534' : '#86efac' }]} />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>Workout / Active</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]} />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>Rest</Text>
              </View>
            </View>
          </View>

          {/* Focused Day Detailed Stats Card */}
          <View style={[styles.dayDetailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.dayDetailHeader}>
              <Text style={[styles.dayDetailDate, { color: colors.text }]}>
                {focusedDayData.formattedTitle}
              </Text>
              {focusedDayData.isGoalMet && (
                <View style={[styles.goalBadge, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '50' }]}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
                  <Text style={[styles.goalBadgeText, { color: colors.primary }]}>Goal Achieved</Text>
                </View>
              )}
            </View>

            <View style={styles.dayDetailStatsRow}>
              <View style={styles.dayDetailStatBox}>
                <Text style={[styles.dayDetailStatVal, { color: colors.text }]}>
                  {focusedDayData.steps.toLocaleString()}
                </Text>
                <Text style={[styles.dayDetailStatLbl, { color: colors.textMuted }]}>STEPS LOGGED</Text>
              </View>
              <View style={[styles.dayDetailDivider, { backgroundColor: colors.border }]} />
              <View style={styles.dayDetailStatBox}>
                <Text style={[styles.dayDetailStatVal, { color: colors.text }]}>
                  {focusedDayData.distDisplay}
                </Text>
                <Text style={[styles.dayDetailStatLbl, { color: colors.textMuted }]}>WORKOUT DISTANCE</Text>
              </View>
              <View style={[styles.dayDetailDivider, { backgroundColor: colors.border }]} />
              <View style={styles.dayDetailStatBox}>
                <Text style={[styles.dayDetailStatVal, { color: colors.text }]}>
                  {focusedDayData.walks.length}
                </Text>
                <Text style={[styles.dayDetailStatLbl, { color: colors.textMuted }]}>WORKOUTS</Text>
              </View>
            </View>

            {/* List of recorded walks on this day if any */}
            {focusedDayData.walks.length > 0 && (
              <View style={styles.walksListWrap}>
                <Text style={[styles.walksListHeader, { color: colors.textMuted }]}>LOGGED WORKOUTS</Text>
                {focusedDayData.walks.map((w) => (
                  <View key={w.id} style={[styles.walkItemRow, { borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.walkItemLabel, { color: colors.text }]}>{w.label}</Text>
                      <Text style={[styles.walkItemTime, { color: colors.textMuted }]}>
                        {new Date(w.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {formatDuration(w.durationSeconds)}
                      </Text>
                    </View>
                    <Text style={[styles.walkItemDist, { color: colors.primary }]}>
                      {unitSystem === 'us_customary'
                        ? `${metersToMiles(w.distanceMeters).toFixed(2)} mi`
                        : `${metersToKm(w.distanceMeters).toFixed(2)} km`}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Progress Photos for this date */}
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={[styles.walksListHeader, { color: colors.textMuted }]}>
                  PROGRESS PHOTOS ({progressPhotosMap[modalFocusedDate]?.length || 0})
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    onPress={() => {
                      promptChoicePhoto(modalFocusedDate);
                    }}
                  >
                    <Ionicons name="camera" size={14} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Add Photo</Text>
                  </TouchableOpacity>

                  {progressPhotos.length > 0 && (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      onPress={() => {
                        const firstPhotoId = progressPhotosMap[modalFocusedDate]?.[0]?.id || progressPhotos[0]?.id;
                        openGallery(firstPhotoId);
                      }}
                    >
                      <Ionicons name="images-outline" size={14} color={colors.text} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>View Gallery</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {progressPhotosMap[modalFocusedDate] && progressPhotosMap[modalFocusedDate].length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {progressPhotosMap[modalFocusedDate].map((photo) => (
                    <TouchableOpacity
                      key={photo.id}
                      style={styles.photoThumbCard}
                      onPress={() => openGallery(photo.id)}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: photo.uri }} style={styles.photoThumbImage} />
                      {photo.caption && (
                        <Text style={[styles.photoThumbCaption, { color: colors.text }]} numberOfLines={1}>
                          {photo.caption}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <View style={{ gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.emptyPhotoBox, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => {
                      promptChoicePhoto(modalFocusedDate);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
                    <Text style={[styles.emptyPhotoText, { color: colors.textMuted }]}>
                      No progress photo for this date. Tap to capture or upload.
                    </Text>
                  </TouchableOpacity>

                  {progressPhotos.length > 0 && (
                    <TouchableOpacity
                      style={[styles.quickGalleryLaunchBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                      onPress={() => openGallery(progressPhotos[0]?.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="images" size={16} color={colors.primary} />
                      <Text style={[styles.quickGalleryLaunchText, { color: colors.text }]}>
                        Open All Saved Progress Photos ({progressPhotos.length})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </InteractiveBottomModal>

      {/* ── ADD PROGRESS PHOTO MODAL (Interactive Date Picker & Note) ── */}
      <Modal
        visible={showAddPhotoModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddPhotoModal(false)}
      >
        <View style={styles.photoModalOverlay}>
          <View style={[styles.photoModalSheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.photoModalHeader}>
              <Text style={[styles.photoModalTitle, { color: colors.text }]}>Save Progress Photo</Text>
              <TouchableOpacity
                onPress={() => setShowAddPhotoModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedPhotoUri && (
              <Image source={{ uri: selectedPhotoUri }} style={styles.photoPreviewImage} />
            )}

            {/* Date Selection Header & Quick Pickers */}
            <Text style={[styles.photoFieldLabel, { color: colors.textMuted }]}>
              ASSIGN TO DATE:
            </Text>
            
            {/* Quick date selector chips: Today, Yesterday, 2 Days Ago, 1 Week Ago */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {[
                { label: 'Today', daysOffset: 0 },
                { label: 'Yesterday', daysOffset: 1 },
                { label: '2 Days Ago', daysOffset: 2 },
                { label: '1 Wk Ago', daysOffset: 7 },
              ].map((chip) => {
                const targetD = new Date();
                targetD.setDate(targetD.getDate() - chip.daysOffset);
                const dateKey = formatYYYYMMDD(targetD);
                const isSelected = photoTargetDate === dateKey;
                return (
                  <TouchableOpacity
                    key={chip.label}
                    style={[
                      styles.quickDateChip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.card,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setPhotoTargetDate(dateKey);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.quickDateChipText,
                        {
                          color: isSelected ? (isDark ? '#09090b' : '#ffffff') : colors.text,
                          fontWeight: isSelected ? '800' : '600',
                        },
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Date Input Wrap with Day Steppers */}
            <View style={[styles.photoInputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const [y, m, d] = photoTargetDate.split('-').map(Number);
                  const prevD = new Date(y, m - 1, d - 1);
                  setPhotoTargetDate(formatYYYYMMDD(prevD));
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4 }}
              >
                <Ionicons name="chevron-back" size={16} color={colors.text} />
              </TouchableOpacity>

              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <TextInput
                style={[styles.photoTextInput, { color: colors.text, textAlign: 'center', fontWeight: '700' }]}
                value={photoTargetDate}
                onChangeText={setPhotoTargetDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
              />

              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const [y, m, d] = photoTargetDate.split('-').map(Number);
                  const nextD = new Date(y, m - 1, d + 1);
                  setPhotoTargetDate(formatYYYYMMDD(nextD));
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4 }}
              >
                <Ionicons name="chevron-forward" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Optional Caption */}
            <Text style={[styles.photoFieldLabel, { color: colors.textMuted }]}>
              NOTE / CAPTION (OPTIONAL):
            </Text>
            <View style={[styles.photoInputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                style={[styles.photoTextInput, { color: colors.text }]}
                value={photoCaption}
                onChangeText={setPhotoCaption}
                placeholder="e.g. 185 lbs morning check-in"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.savePhotoBtn, { backgroundColor: colors.primary }]}
              onPress={handleSaveProgressPhoto}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={18} color={isDark ? '#09090b' : '#ffffff'} />
              <Text style={[styles.savePhotoBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                Save to Activity Calendar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── FULL-SCREEN PROGRESS PHOTO VIEWER & A/B COMPARISON MODAL (Only when not provided by parent) ── */}
      {!onOpenGallery && (
        <ProgressPhotoGalleryModal
          visible={showGalleryModal}
          onClose={() => setShowGalleryModal(false)}
          photos={progressPhotos}
          initialPhotoId={gallerySelectedPhotoId}
          onDeletePhoto={handleDeletePhoto}
          onUploadNewPhoto={handlePickLibraryPhoto}
          onCaptureNewPhoto={handleTakePhoto}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  simpleCard: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calendarLeftColumn: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    minWidth: 88,
  },
  calendarRightGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 2,
  },
  streakBadgeStacked: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1.5,
    alignSelf: 'stretch',
  },
  flameIcon: {
    marginBottom: 0,
  },
  streakText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  navArrow: {
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'center',
  },
  circleCell: {
    width: '14.28%',
    height: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleDot: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
  },
  todayRing: {
    borderWidth: 1.5,
    transform: [{ scale: 1.15 }],
  },
  modalNavArrow: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Detailed Modal */
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
    height: '82%',
    maxHeight: '88%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  modalStreakPillClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  modalStreakNumClean: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  modalCalendarCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  modalWeekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalWeekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    opacity: 0.7,
  },
  modalDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modalDayCell: {
    width: '14.28%',
    aspectRatio: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDayInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDayInnerSelectedCircle: {
    borderWidth: 2,
  },
  modalDayText: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '600',
  },
  dayDetailCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  dayDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dayDetailDate: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  goalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  goalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dayDetailStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  dayDetailStatBox: {
    alignItems: 'center',
  },
  dayDetailStatVal: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dayDetailStatLbl: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 3,
  },
  dayDetailDivider: {
    width: 1,
    height: 26,
  },
  walksListWrap: {
    marginTop: 14,
    paddingTop: 10,
  },
  walksListHeader: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  walkItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  walkItemLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  walkItemTime: {
    fontSize: 11,
    marginTop: 2,
  },
  walkItemDist: {
    fontSize: 13,
    fontWeight: '800',
  },
  quickCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  quickCameraBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  modalDayCameraDot: {
    position: 'absolute',
    bottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoThumbCard: {
    width: 88,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photoThumbImage: {
    width: 88,
    height: 108,
    borderRadius: 12,
  },
  photoThumbCaption: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ffffff',
    borderRadius: 9,
  },
  emptyPhotoBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyPhotoText: {
    fontSize: 11.5,
    textAlign: 'center',
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  photoModalSheet: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  photoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  photoModalTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  photoPreviewImage: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    marginBottom: 14,
    resizeMode: 'cover',
  },
  photoFieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  photoInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    marginBottom: 12,
  },
  photoTextInput: {
    flex: 1,
    fontSize: 13,
  },
  savePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    gap: 6,
    marginTop: 6,
  },
  savePhotoBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  quickDateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickDateChipText: {
    fontSize: 11.5,
  },
  quickGalleryLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickGalleryLaunchText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
});

