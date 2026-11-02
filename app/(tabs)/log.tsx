import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Modal,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/constants/AuthContext';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { StickmanWorkoutIcon } from '@/components/StickmanWorkoutIcon';
import {
  DEFAULT_EXERCISES,
  ExerciseDefinition,
  saveWorkoutLog,
  loadWorkoutLogs,
  WorkoutLogEntry,
  WorkoutTrackingData,
  CustomRoutine,
  RoutineExercise,
  loadCustomRoutines,
  saveCustomRoutines,
  DEFAULT_CUSTOM_ROUTINES,
  deleteWorkoutLogsByIds,
  loadManualMuscleSoreness,
  saveManualMuscleSoreness,
} from '@/constants/workoutStorage';
import { CameraFormTrackerModal } from '@/components/CameraFormTrackerModal';
import { MuscleSorenessModal } from '@/components/MuscleSorenessModal';
import { BodyFatScannerModal } from '@/components/BodyFatScannerModal';
import {
  computeMuscleRecoveryMap,
  MuscleGroupKey,
  MuscleRecoveryStatus,
} from '@/constants/muscleRecoveryEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ROUTINE_CARD_GAP = 10;
const ROUTINE_CARD_WIDTH = Math.floor((SCREEN_WIDTH - 32 - ROUTINE_CARD_GAP) / 2);
const ROUTINE_SNAP_INTERVAL = ROUTINE_CARD_WIDTH + ROUTINE_CARD_GAP;

export default function LogScreen() {
  const { user, profile } = useAuth();
  const { colors, isDark } = useTheme();

  const userId = user?.id || 'guest_user';
  const effectiveWeightUnit: 'kg' | 'lb' =
    profile.unitSystem === 'metric' ? 'kg' : 'lb';

  const [selectedExercise, setSelectedExercise] = useState<ExerciseDefinition>(DEFAULT_EXERCISES[0]);
  const [repsInput, setRepsInput] = useState<string>(String(DEFAULT_EXERCISES[0].defaultReps));
  const [weightInput, setWeightInput] = useState<string>(
    String(
      effectiveWeightUnit === 'kg'
        ? Math.round(DEFAULT_EXERCISES[0].defaultWeight * 0.453592)
        : DEFAULT_EXERCISES[0].defaultWeight
    )
  );
  const [notesInput, setNotesInput] = useState<string>('');
  const [loggedSuccess, setLoggedSuccess] = useState<boolean>(false);
  const [allLogs, setAllLogs] = useState<WorkoutLogEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState<string>('');

  // Custom Routine / Workout Day Presets state
  const [routines, setRoutines] = useState<CustomRoutine[]>([]);
  const [routineModalVisible, setRoutineModalVisible] = useState<boolean>(false);
  const [editingRoutine, setEditingRoutine] = useState<CustomRoutine | null>(null);
  const [newRoutineTitle, setNewRoutineTitle] = useState<string>('');
  const [newRoutineCategory, setNewRoutineCategory] = useState<CustomRoutine['category']>('chest');
  const [newRoutineColor, setNewRoutineColor] = useState<string>('#3b82f6');
  const [selectedExIdsForRoutine, setSelectedExIdsForRoutine] = useState<string[]>([]);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);
  const [showCameraTracker, setShowCameraTracker] = useState<boolean>(false);

  // Undo support state: stores IDs of the most recently logged entry/entries
  const [lastLoggedIds, setLastLoggedIds] = useState<string[]>([]);
  const [undoTimer, setUndoTimer] = useState<any>(null);

  // 3-dots routine menu modal state (edit exercises of routine or selectively log subset)
  const [selectedRoutineForOptions, setSelectedRoutineForOptions] = useState<CustomRoutine | null>(null);
  const [subsetSelectedExIds, setSubsetSelectedExIds] = useState<string[]>([]);
  const [activeRoutinePage, setActiveRoutinePage] = useState<number>(0);
  const routinePageCount = Math.max(1, Math.ceil(routines.length / 2));

  // Muscle Soreness & Recovery Map state
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroupKey | null>('chest');
  const [showMuscleRecoveryModal, setShowMuscleRecoveryModal] = useState<boolean>(false);
  const [showBodyFatModal, setShowBodyFatModal] = useState<boolean>(false);
  const [manualMuscleOverrides, setManualMuscleOverrides] = useState<Record<string, number>>({});

  const recoveryMap = useMemo(() => {
    return computeMuscleRecoveryMap(allLogs, manualMuscleOverrides);
  }, [allLogs, manualMuscleOverrides]);

  const soreMusclesCount = useMemo(() => {
    return Object.values(recoveryMap).filter((m) => m.status === 'sore').length;
  }, [recoveryMap]);

  const loadData = useCallback(async () => {
    const [logs, loadedRoutines, loadedOverrides] = await Promise.all([
      loadWorkoutLogs(userId),
      loadCustomRoutines(userId),
      loadManualMuscleSoreness(userId),
    ]);
    setAllLogs(logs);
    setRoutines(loadedRoutines);
    setManualMuscleOverrides(loadedOverrides);
  }, [userId]);

  const handleSetMuscleRecovery = async (muscle: MuscleGroupKey, percent: number) => {
    const next = { ...manualMuscleOverrides, [muscle]: percent };
    setManualMuscleOverrides(next);
    await saveManualMuscleSoreness(userId, next);
  };

  // Single focus effect loads data when tab mounts or comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const triggerUndo = async () => {
    if (lastLoggedIds.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await deleteWorkoutLogsByIds(userId, lastLoggedIds);
    setLastLoggedIds([]);
    setLoggedSuccess(false);
    setBatchSuccessMsg(null);
    if (undoTimer) clearTimeout(undoTimer);
    const refreshed = await loadWorkoutLogs(userId);
    setAllLogs(refreshed);
  };

  // Click a routine pill: Logs all exercises inside it at once
  const handleLogWholeRoutine = async (routine: CustomRoutine) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    
    const loggedIds: string[] = [];
    for (const item of routine.exercises) {
      const exDef = DEFAULT_EXERCISES.find((e) => e.id === item.exerciseId);
      const convertedW = effectiveWeightUnit === 'kg'
        ? Math.round(item.weight * 0.453592)
        : item.weight;

      const created = await saveWorkoutLog(userId, {
        exerciseId: item.exerciseId,
        exerciseName: exDef?.name || item.exerciseId,
        reps: item.reps,
        weight: convertedW,
        weightUnit: effectiveWeightUnit,
        notes: `Logged from ${routine.title} routine`,
      });
      if (created?.id) loggedIds.push(created.id);
    }

    const refreshed = await loadWorkoutLogs(userId);
    setAllLogs(refreshed);

    if (routine.exercises.length > 0) {
      const firstEx = DEFAULT_EXERCISES.find((e) => e.id === routine.exercises[0].exerciseId);
      if (firstEx) {
        setSelectedCategory(routine.category);
        setSelectedExercise(firstEx);
      }
    }

    setLastLoggedIds(loggedIds);
    setBatchSuccessMsg(`Logged ${routine.exercises.length} sets from ${routine.title}!`);
    if (undoTimer) clearTimeout(undoTimer);
    const timer = setTimeout(() => {
      setBatchSuccessMsg(null);
      setLastLoggedIds([]);
    }, 4500);
    setUndoTimer(timer);
  };

  // Log only a chosen subset of exercises from a routine
  const handleLogSubsetRoutine = async () => {
    if (!selectedRoutineForOptions) return;
    if (subsetSelectedExIds.length === 0) {
      Alert.alert('Selection Required', 'Select at least 1 exercise to log.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const loggedIds: string[] = [];
    const chosenItems = selectedRoutineForOptions.exercises.filter((ex) =>
      subsetSelectedExIds.includes(ex.exerciseId)
    );

    for (const item of chosenItems) {
      const exDef = DEFAULT_EXERCISES.find((e) => e.id === item.exerciseId);
      const convertedW = effectiveWeightUnit === 'kg'
        ? Math.round(item.weight * 0.453592)
        : item.weight;

      const created = await saveWorkoutLog(userId, {
        exerciseId: item.exerciseId,
        exerciseName: exDef?.name || item.exerciseId,
        reps: item.reps,
        weight: convertedW,
        weightUnit: effectiveWeightUnit,
        notes: `Logged subset from ${selectedRoutineForOptions.title}`,
      });
      if (created?.id) loggedIds.push(created.id);
    }

    const refreshed = await loadWorkoutLogs(userId);
    setAllLogs(refreshed);

    const routineTitle = selectedRoutineForOptions.title;
    setSelectedRoutineForOptions(null);

    setLastLoggedIds(loggedIds);
    setBatchSuccessMsg(`Logged ${chosenItems.length} exercises from ${routineTitle}!`);
    if (undoTimer) clearTimeout(undoTimer);
    const timer = setTimeout(() => {
      setBatchSuccessMsg(null);
      setLastLoggedIds([]);
    }, 4500);
    setUndoTimer(timer);
  };

  const openCreateRoutineModal = () => {
    setEditingRoutine(null);
    setNewRoutineTitle('');
    setNewRoutineCategory('chest');
    setNewRoutineColor('#3b82f6');
    setSelectedExIdsForRoutine(['bench_press', 'incline_dumbbell_press']);
    setRoutineModalVisible(true);
  };

  const openEditRoutineModal = (routine: CustomRoutine) => {
    setEditingRoutine(routine);
    setNewRoutineTitle(routine.title);
    setNewRoutineCategory(routine.category);
    setNewRoutineColor(routine.color);
    setSelectedExIdsForRoutine(routine.exercises.map((e) => e.exerciseId));
    setSelectedRoutineForOptions(null);
    setRoutineModalVisible(true);
  };

  const openRoutineOptionsMenu = (routine: CustomRoutine) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedRoutineForOptions(routine);
    setSubsetSelectedExIds(routine.exercises.map((e) => e.exerciseId));
  };

  const handleSaveCustomRoutine = async () => {
    if (!newRoutineTitle.trim()) {
      Alert.alert('Title Required', 'Please enter a name for your workout day (e.g. "Chest", "Legs").');
      return;
    }
    if (selectedExIdsForRoutine.length === 0) {
      Alert.alert('Exercises Required', 'Please choose at least 1 exercise for this routine.');
      return;
    }

    const newExList: RoutineExercise[] = selectedExIdsForRoutine.map((id) => {
      const def = DEFAULT_EXERCISES.find((e) => e.id === id);
      return {
        exerciseId: id,
        reps: def?.defaultReps || 10,
        weight: def?.defaultWeight || 50,
      };
    });

    const newRoutine: CustomRoutine = {
      id: editingRoutine ? editingRoutine.id : `routine_${Date.now()}`,
      title: newRoutineTitle.trim(),
      color: newRoutineColor,
      category: newRoutineCategory,
      exercises: newExList,
    };

    let updated: CustomRoutine[];
    if (editingRoutine) {
      updated = routines.map((r) => (r.id === editingRoutine.id ? newRoutine : r));
    } else {
      updated = [...routines, newRoutine];
    }

    setRoutines(updated);
    await saveCustomRoutines(userId, updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setRoutineModalVisible(false);
  };

  const handleDeleteRoutine = async (routineId: string) => {
    const updated = routines.filter((r) => r.id !== routineId);
    setRoutines(updated);
    await saveCustomRoutines(userId, updated);
    setRoutineModalVisible(false);
  };



  // Find the most recent previous log for the selected exercise
  const previousLog = allLogs.find((l) => l.exerciseId === selectedExercise.id);
  const prevReps = previousLog ? previousLog.reps : selectedExercise.defaultReps;
  const prevWeight = previousLog
    ? (previousLog.weightUnit === effectiveWeightUnit
        ? previousLog.weight
        : effectiveWeightUnit === 'kg'
          ? Math.round(previousLog.weight * 0.453592)
          : Math.round(previousLog.weight * 2.20462))
    : (effectiveWeightUnit === 'kg'
        ? Math.round(selectedExercise.defaultWeight * 0.453592)
        : selectedExercise.defaultWeight);

  // Compute diffs
  const currentRepsNum = parseInt(repsInput, 10) || 0;
  const currentWeightNum = parseFloat(weightInput) || 0;
  const repsDiff = currentRepsNum - prevReps;
  const weightDiff = currentWeightNum - prevWeight;

  const handleSelectExercise = (exercise: ExerciseDefinition) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedExercise(exercise);
    
    // Check if we have prior log
    const prev = allLogs.find((l) => l.exerciseId === exercise.id);
    if (prev) {
      setRepsInput(String(prev.reps));
      const convertedW =
        prev.weightUnit === effectiveWeightUnit
          ? prev.weight
          : effectiveWeightUnit === 'kg'
            ? Math.round(prev.weight * 0.453592)
            : Math.round(prev.weight * 2.20462);
      setWeightInput(String(convertedW));
    } else {
      setRepsInput(String(exercise.defaultReps));
      const initW =
        effectiveWeightUnit === 'kg'
          ? Math.round(exercise.defaultWeight * 0.453592)
          : exercise.defaultWeight;
      setWeightInput(String(initW));
    }
  };

  const handleLogWorkout = async () => {
    const repsNum = parseInt(repsInput.trim(), 10);
    const weightNum = parseFloat(weightInput.trim());

    if (isNaN(repsNum) || repsNum <= 0) {
      Alert.alert('Reps Required', 'Please enter a valid number of repetitions.');
      return;
    }

    if (isNaN(weightNum) || weightNum < 0) {
      Alert.alert('Weight Required', 'Please enter a valid weight.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const created = await saveWorkoutLog(userId, {
      exerciseId: selectedExercise.id,
      exerciseName: selectedExercise.name,
      reps: repsNum,
      weight: weightNum,
      weightUnit: effectiveWeightUnit,
      notes: notesInput.trim() || undefined,
    });

    const refreshed = await loadWorkoutLogs(userId);
    setAllLogs(refreshed);

    if (created?.id) {
      setLastLoggedIds([created.id]);
    }
    setLoggedSuccess(true);
    if (undoTimer) clearTimeout(undoTimer);
    const timer = setTimeout(() => {
      setLoggedSuccess(false);
      setLastLoggedIds([]);
    }, 4500);
    setUndoTimer(timer);
  };

  const filteredExercises = DEFAULT_EXERCISES.filter((e) => {
    const q = exerciseSearchQuery.trim().toLowerCase();
    const matchesSearch = !q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    const matchesCategory = selectedCategory === 'all' || e.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Retro Header styled identically to other tabs */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 76 : 48 }]}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Fitness Log</Text>
        </View>

        {/* ── SEPARATE INDIVIDUAL QUICK ACTION BUTTONS (Form Tracker | Muscle Recovery | Body Fat) ── */}
        <View style={styles.quickActionButtonsRow}>
          {/* 1. Video Form Tracker */}
          <TouchableOpacity
            style={[styles.quickActionIndividualBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              setShowCameraTracker(true);
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIconCircle, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="videocam" size={16} color={colors.primary} />
            </View>
            <Text style={[styles.quickActionLabel, { color: colors.text }]}>AI Form</Text>
          </TouchableOpacity>

          {/* 2. Muscle Soreness & Recovery Visualizer */}
          <TouchableOpacity
            style={[styles.quickActionIndividualBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setShowMuscleRecoveryModal(true);
            }}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.quickActionIconCircle,
                { backgroundColor: soreMusclesCount > 0 ? '#ef444420' : '#10b98120' },
              ]}
            >
              <Ionicons
                name="body"
                size={16}
                color={soreMusclesCount > 0 ? '#ef4444' : '#10b981'}
              />
            </View>
            <Text style={[styles.quickActionLabel, { color: colors.text }]}>
              Soreness
            </Text>
          </TouchableOpacity>

          {/* 3. Body Fat Scanner */}
          <TouchableOpacity
            style={[styles.quickActionIndividualBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setShowBodyFatModal(true);
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIconCircle, { backgroundColor: '#8b5cf620' }]}>
              <Ionicons name="scan" size={15} color="#8b5cf6" />
            </View>
            <Text style={[styles.quickActionLabel, { color: colors.text }]}>Body Fat</Text>
          </TouchableOpacity>
        </View>

        {/* ── SECTION 0: CUSTOM WORKOUT DAY PRESETS / ROUTINES (SLIDER: 2 VISIBLE AT ONCE, SNAPPY) ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>
            WORKOUT DAYS & ROUTINES
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              openCreateRoutineModal();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.editPresetsLink, { color: colors.primary }]}>+ New Day</Text>
          </TouchableOpacity>
        </View>

        {/* Carousel / Slider displaying 2 routine cards visible at once without side cropping */}
        <ScrollView
          horizontal
          snapToInterval={ROUTINE_SNAP_INTERVAL}
          snapToAlignment="start"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.routinesSliderTrack}
          onScroll={(e) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const pageIndex = Math.round(offsetX / (ROUTINE_SNAP_INTERVAL * 2));
            setActiveRoutinePage(pageIndex);
          }}
          scrollEventThrottle={16}
        >
          {routines.map((routine) => {
            return (
              <View
                key={routine.id}
                style={[
                  styles.coloredRoutineCardSlider,
                  {
                    backgroundColor: routine.color,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.routineCardMainTap}
                  onPress={() => handleLogWholeRoutine(routine)}
                  activeOpacity={0.8}
                >
                  <View style={styles.routinePillInner}>
                    <Text style={styles.routinePillTitle} numberOfLines={1}>{routine.title}</Text>
                  </View>
                </TouchableOpacity>

                {/* 3-dots Menu Button to edit day or select subset */}
                <TouchableOpacity
                  style={styles.routineThreeDotsBtn}
                  onPress={() => openRoutineOptionsMenu(routine)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="ellipsis-vertical" size={16} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

        {/* Black Dots Indicator below the workout days/routines */}
        {routinePageCount > 1 && (
          <View style={styles.routineDotsRow}>
            {Array.from({ length: routinePageCount }).map((_, pIdx) => {
              const isSelectedPage = pIdx === activeRoutinePage;
              return (
                <View
                  key={`routine_dot_${pIdx}`}
                  style={[
                    styles.routineDot,
                    {
                      backgroundColor: isSelectedPage ? '#000000' : (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'),
                      transform: [{ scale: isSelectedPage ? 1.3 : 1 }],
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

        {/* Success text below workout days (plain text line, no big pill) */}
        {loggedSuccess && (
          <View style={styles.successTextRowBelowDays}>
            <Ionicons name="checkmark-circle" size={15} color="#10b981" />
            <Text style={[styles.loggedTextPlain, { color: colors.text }]}>
              Logged {selectedExercise.name} · {repsInput} reps @ {weightInput} {effectiveWeightUnit}
            </Text>
            {lastLoggedIds.length > 0 && (
              <TouchableOpacity
                onPress={triggerUndo}
                activeOpacity={0.65}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: 6 }}
              >
                <Text style={styles.blueUndoTextOnly}>Undo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Batch Logged text below workout days (plain text line, no big pill) */}
        {batchSuccessMsg && (
          <View style={styles.successTextRowBelowDays}>
            <Ionicons name="flash" size={15} color="#10b981" />
            <Text style={[styles.loggedTextPlain, { color: colors.text }]}>
              {batchSuccessMsg}
            </Text>
            {lastLoggedIds.length > 0 && (
              <TouchableOpacity
                onPress={triggerUndo}
                activeOpacity={0.65}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: 6 }}
              >
                <Text style={styles.blueUndoTextOnly}>Undo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}


        <View style={[styles.stickmanHeroCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={styles.stickmanHeroContent}>
            {selectedExercise.imageUrl ? (
              <View style={styles.stickmanVisualWrap}>
                <Image
                  source={{ uri: selectedExercise.imageUrl }}
                  style={styles.heroExerciseImage}
                  resizeMode="contain"
                />
              </View>
            ) : null}
            <View style={styles.stickmanInfoCol}>
              <View style={[styles.categoryTagPill, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[styles.categoryTagText, { color: colors.primary }]}>
                  {selectedExercise.category.toUpperCase()}
                  {selectedExercise.equipment ? ` · ${selectedExercise.equipment}` : ''}
                </Text>
              </View>
              <Text style={[styles.stickmanExerciseTitle, { color: colors.text }]}>
                {selectedExercise.name}
              </Text>
              <Text style={[styles.selectedMuscleSub, { color: colors.textMuted }]}>
                Target: {selectedExercise.primaryMuscles?.join(', ') || selectedExercise.category}
              </Text>
            </View>
          </View>
        </View>


        {/* ── EXERCISE SEARCH & SELECTION ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>
            SELECT EXERCISE
          </Text>
          <Text style={[styles.unitBadge, { color: colors.textSecondary }]}>
            {filteredExercises.length} found
          </Text>
        </View>

        {/* Exercise Search Input Box */}
        <View style={[styles.exerciseSearchBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.exerciseSearchInput, { color: colors.text }]}
            placeholder="Type exercise name (e.g. bench, squat, pull up, curl)..."
            placeholderTextColor={colors.textMuted}
            value={exerciseSearchQuery}
            onChangeText={(text) => setExerciseSearchQuery(text)}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {exerciseSearchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setExerciseSearchQuery('')}
              style={{ padding: 4 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Filter Category Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryPillsRow}
        >
          {[
            { id: 'all', label: 'All (100+)' },
            { id: 'chest', label: 'Chest' },
            { id: 'back', label: 'Back' },
            { id: 'legs', label: 'Legs' },
            { id: 'shoulders', label: 'Shoulders' },
            { id: 'arms', label: 'Arms' },
            { id: 'core', label: 'Core' },
            { id: 'cardio', label: 'Cardio' },
          ].map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.muscleGroupPill,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surfaceElevated,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSelectedCategory(cat.id);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.muscleGroupPillText,
                    {
                      color: isSelected ? (isDark ? '#09090b' : '#ffffff') : colors.text,
                      fontWeight: isSelected ? '800' : '600',
                    },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Dropdown / Results List Below the Search */}
        <View style={[styles.exerciseResultsCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <ScrollView
            style={styles.exerciseResultsScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {filteredExercises.length === 0 ? (
              <View style={styles.noExercisesFoundBox}>
                <Ionicons name="search-outline" size={24} color={colors.textMuted} style={{ marginBottom: 6 }} />
                <Text style={[styles.noExercisesFoundText, { color: colors.textMuted }]}>
                  No exercises matching "{exerciseSearchQuery}"
                </Text>
              </View>
            ) : (
              filteredExercises.map((item, idx) => {
                const isSelected = selectedExercise.id === item.id;
                const isLast = idx === filteredExercises.length - 1;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.exerciseListItem,
                      {
                        backgroundColor: isSelected ? (isDark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.08)') : 'transparent',
                        borderBottomColor: isLast ? 'transparent' : colors.border,
                        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                      },
                    ]}
                    onPress={() => handleSelectExercise(item)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.exerciseListItemLeft}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.exerciseListItemName,
                            {
                              color: isSelected ? colors.primary : colors.text,
                              fontWeight: isSelected ? '800' : '600',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Text style={[styles.exerciseListItemMeta, { color: colors.textMuted }]}>
                          {item.category.toUpperCase()} · default {item.defaultReps} reps {item.defaultWeight > 0 ? `@ ${item.defaultWeight} lbs` : '(bodyweight)'}
                        </Text>
                      </View>
                    </View>

                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={19} color={colors.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} opacity={0.6} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* ── SECTION 2: INPUT REPS & WEIGHT ── */}
        <View style={[styles.logInputCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={styles.logCardHeader}>
            <View>
              <Text style={[styles.selectedTitle, { color: colors.text }]}>
                {selectedExercise.name}
              </Text>
            </View>
          </View>

          {/* Stepper / Input Row: Reps & Weight */}
          <View style={styles.inputsRow}>
            {/* Reps Input */}
            <View style={styles.inputCol}>
              <View style={styles.inputLabelHeaderRow}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>REPS</Text>
                {repsDiff > 0 && (
                  <View style={[styles.increaseFilledBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.increaseTriangleGlyph, { color: isDark ? '#09090b' : '#ffffff' }]}>▲</Text>
                    <Text style={[styles.increaseAmountText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                      +{repsDiff}
                    </Text>
                  </View>
                )}
                {repsDiff < 0 && (
                  <View style={[styles.decreaseFilledBadge, { backgroundColor: '#ef4444' }]}>
                    <Text style={styles.decreaseTriangleGlyph}>▼</Text>
                    <Text style={styles.decreaseAmountText}>
                      {repsDiff}
                    </Text>
                  </View>
                )}
              </View>
              <View style={[styles.numberBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    const cur = parseInt(repsInput, 10) || 0;
                    setRepsInput(String(Math.max(1, cur - 1)));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.numericInput, { color: colors.text }]}
                  keyboardType="numeric"
                  value={repsInput}
                  onChangeText={setRepsInput}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    const cur = parseInt(repsInput, 10) || 0;
                    setRepsInput(String(cur + 1));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Weight Input */}
            <View style={styles.inputCol}>
              <View style={styles.inputLabelHeaderRow}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  WEIGHT ({effectiveWeightUnit})
                </Text>
                {weightDiff > 0 && (
                  <View style={[styles.increaseFilledBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.increaseTriangleGlyph, { color: isDark ? '#09090b' : '#ffffff' }]}>▲</Text>
                    <Text style={[styles.increaseAmountText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                      +{weightDiff}
                    </Text>
                  </View>
                )}
                {weightDiff < 0 && (
                  <View style={[styles.decreaseFilledBadge, { backgroundColor: '#ef4444' }]}>
                    <Text style={styles.decreaseTriangleGlyph}>▼</Text>
                    <Text style={styles.decreaseAmountText}>
                      {weightDiff}
                    </Text>
                  </View>
                )}
              </View>
              <View style={[styles.numberBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    const cur = parseFloat(weightInput) || 0;
                    setWeightInput(String(Math.max(0, cur - 5)));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.numericInput, { color: colors.text }]}
                  keyboardType="numeric"
                  value={weightInput}
                  onChangeText={setWeightInput}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    const cur = parseFloat(weightInput) || 0;
                    setWeightInput(String(cur + 5));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Quick Weight Adjust Pills */}
          <View style={styles.quickWeightRow}>
            {[-10, -5, +5, +10, +25].map((delta) => (
              <TouchableOpacity
                key={delta}
                style={[styles.quickWeightPill, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const cur = parseFloat(weightInput) || 0;
                  setWeightInput(String(Math.max(0, cur + delta)));
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickWeightText, { color: colors.textSecondary }]}>
                  {delta > 0 ? `+${delta}` : delta}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Optional Notes Input */}
          <View style={[styles.notesWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.notesInput, { color: colors.text }]}
              placeholder="Notes / form observations (optional)"
              placeholderTextColor={colors.textMuted}
              value={notesInput}
              onChangeText={setNotesInput}
            />
          </View>

          {/* LOG SET BUTTON */}
          <TouchableOpacity
            style={[styles.logSubmitBtn, { backgroundColor: colors.primary }]}
            onPress={handleLogWorkout}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-done" size={20} color={isDark ? '#09090b' : '#ffffff'} />
            <Text style={[styles.logSubmitBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>
              Log {weightInput} {effectiveWeightUnit} × {repsInput} Reps
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Custom Routine / Workout Day Creation Modal */}
      <Modal
        visible={routineModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRoutineModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {editingRoutine ? 'Edit Workout Day' : 'New Workout Day'}
                </Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                  Create a preset with exercises that logs in one tap
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setRoutineModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Routine Title Input */}
            <View style={[styles.routineInputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                style={[styles.routineTextInput, { color: colors.text }]}
                placeholder="Day Name (e.g. Chest, Legs, Push, Upper)"
                placeholderTextColor={colors.textMuted}
                value={newRoutineTitle}
                onChangeText={setNewRoutineTitle}
              />
            </View>

            {/* Color Accent Picker */}
            <Text style={[styles.modalSectionLabel, { color: colors.textMuted }]}>
              ACCENT COLOR:
            </Text>
            <View style={styles.colorPickerRow}>
              {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    newRoutineColor === c && styles.colorCircleSelected,
                  ]}
                  onPress={() => setNewRoutineColor(c)}
                >
                  {newRoutineColor === c && (
                    <Ionicons name="checkmark" size={14} color="#ffffff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Exercises Selector for this routine */}
            <Text style={[styles.modalSectionLabel, { color: colors.textMuted }]}>
              EXERCISES IN THIS DAY ({selectedExIdsForRoutine.length} SELECTED):
            </Text>

            <ScrollView style={styles.modalExerciseList} showsVerticalScrollIndicator={false}>
              {DEFAULT_EXERCISES.map((ex) => {
                const isSelected = selectedExIdsForRoutine.includes(ex.id);
                return (
                  <TouchableOpacity
                    key={ex.id}
                    style={[
                      styles.modalExerciseItem,
                      {
                        backgroundColor: isSelected ? (isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)') : colors.card,
                        borderColor: isSelected ? newRoutineColor : colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      if (isSelected) {
                        setSelectedExIdsForRoutine((prev) => prev.filter((id) => id !== ex.id));
                      } else {
                        setSelectedExIdsForRoutine((prev) => [...prev, ex.id]);
                        setNewRoutineCategory(ex.category);
                      }
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      {ex.imageUrl ? (
                        <Image source={{ uri: ex.imageUrl }} style={{ width: 22, height: 22, borderRadius: 5 }} />
                      ) : (
                        <Ionicons name="barbell-outline" size={16} color={isSelected ? newRoutineColor : colors.textMuted} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalExName, { color: isSelected ? colors.text : colors.textMuted }]}>
                          {ex.name}
                        </Text>
                        <Text style={[styles.modalExMeta, { color: colors.textMuted }]}>
                          {ex.category.toUpperCase()} · {ex.defaultReps} reps @ {ex.defaultWeight} lbs
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isSelected ? newRoutineColor : colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Action Buttons: Save & Optional Delete */}
            {/* Action Buttons: Save & Optional Delete */}
            <View style={styles.modalActionsRow}>
              {editingRoutine && (
                <TouchableOpacity
                  style={[styles.deleteRoutineBtn, { borderColor: '#ef4444' }]}
                  onPress={() => handleDeleteRoutine(editingRoutine.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveRoutineBtn, { backgroundColor: newRoutineColor }]}
                onPress={handleSaveCustomRoutine}
              >
                <Text style={styles.saveRoutineBtnText}>
                  Save Workout Day
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Routine 3-Dots Options Modal: Edit exercises of day or select subset to log */}
      <Modal
        visible={!!selectedRoutineForOptions}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedRoutineForOptions(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, maxHeight: '82%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {selectedRoutineForOptions?.title}
                </Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                  Edit routine exercises or select specific ones to log
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedRoutineForOptions(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Quick Actions Row */}
            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
              <TouchableOpacity
                style={[
                  styles.optionActionBtn,
                  { backgroundColor: colors.card, borderColor: colors.border, flex: 1 },
                ]}
                onPress={() => {
                  if (selectedRoutineForOptions) openEditRoutineModal(selectedRoutineForOptions);
                }}
              >
                <Ionicons name="pencil" size={15} color={colors.primary} />
                <Text style={[styles.optionActionBtnText, { color: colors.text }]}>Edit Day Exercises</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.optionActionBtn,
                  {
                    backgroundColor: subsetSelectedExIds.length === selectedRoutineForOptions?.exercises.length
                      ? colors.card
                      : colors.primary + '18',
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  if (!selectedRoutineForOptions) return;
                  if (subsetSelectedExIds.length === selectedRoutineForOptions.exercises.length) {
                    setSubsetSelectedExIds([]);
                  } else {
                    setSubsetSelectedExIds(selectedRoutineForOptions.exercises.map((e) => e.exerciseId));
                  }
                }}
              >
                <Text style={[styles.optionActionBtnText, { color: colors.primary }]}>
                  {subsetSelectedExIds.length === selectedRoutineForOptions?.exercises.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Subset selection checklist */}
            <Text style={[styles.modalSectionLabel, { color: colors.textMuted }]}>
              CHOOSE EXERCISES TO LOG ({subsetSelectedExIds.length}/{selectedRoutineForOptions?.exercises.length || 0}):
            </Text>

            <ScrollView style={{ maxHeight: 220, marginBottom: 16 }} showsVerticalScrollIndicator={false}>
              {selectedRoutineForOptions?.exercises.map((item) => {
                const exDef = DEFAULT_EXERCISES.find((e) => e.id === item.exerciseId);
                const isSelected = subsetSelectedExIds.includes(item.exerciseId);
                return (
                  <TouchableOpacity
                    key={item.exerciseId}
                    style={[
                      styles.modalExerciseItem,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)')
                          : colors.card,
                        borderColor: isSelected ? (selectedRoutineForOptions.color || colors.primary) : colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      if (isSelected) {
                        setSubsetSelectedExIds((prev) => prev.filter((id) => id !== item.exerciseId));
                      } else {
                        setSubsetSelectedExIds((prev) => [...prev, item.exerciseId]);
                      }
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      {exDef?.imageUrl ? (
                        <Image source={{ uri: exDef.imageUrl }} style={{ width: 22, height: 22, borderRadius: 5 }} />
                      ) : (
                        <Ionicons name="barbell-outline" size={16} color={isSelected ? selectedRoutineForOptions.color : colors.textMuted} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalExName, { color: isSelected ? colors.text : colors.textMuted }]}>
                          {exDef?.name || item.exerciseId}
                        </Text>
                        <Text style={[styles.modalExMeta, { color: colors.textMuted }]}>
                          {item.reps} reps @ {item.weight} lbs
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isSelected ? selectedRoutineForOptions.color : colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Log chosen subset button */}
            <TouchableOpacity
              style={[
                styles.saveRoutineBtn,
                { backgroundColor: selectedRoutineForOptions?.color || colors.primary },
              ]}
              onPress={handleLogSubsetRoutine}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-done" size={17} color="#ffffff" />
              <Text style={styles.saveRoutineBtnText}>
                Log Selected ({subsetSelectedExIds.length}) Exercises
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* AI Camera Form Tracker Modal (in Fitness / Workouts Tab) */}
      <CameraFormTrackerModal
        visible={showCameraTracker}
        onClose={() => setShowCameraTracker(false)}
        onSaveTrackedWorkout={async (trackingData) => {
          try {
            const exerciseMap: Record<string, { id: string; name: string }> = {
              boxing: { id: 'boxing', name: 'Shadowboxing' },
              pushups: { id: 'pushups', name: 'Pushups' },
              squats: { id: 'squats', name: 'Barbell Squat' },
              bicep_curls: { id: 'bicep_curls', name: 'Bicep Curls' },
            };
            const meta = exerciseMap[trackingData.exerciseType] || { id: 'pushups', name: 'Pushups' };
            const defaultWeight = (meta.id === 'pushups' || meta.id === 'boxing') ? 0 : meta.id === 'squats' ? 135 : 30;

            await saveWorkoutLog(userId, {
              exerciseId: meta.id,
              exerciseName: meta.name,
              reps: trackingData.repCount,
              weight: defaultWeight,
              weightUnit: effectiveWeightUnit,
              notes: trackingData.exerciseType === 'boxing' ? `Boxing: ${trackingData.boxingScore || 0} points, ${trackingData.repCount} hits, ${trackingData.boxingMisses || 0} misses; best combo ${trackingData.boxingBestCombo || 0}.` : trackingData.averageFormScore > 0 ? `AI Form Score: ${trackingData.averageFormScore}%` : 'Camera-counted reps; form score not assessed.',
              aiTracked: true,
              trackingData,
            });

            loadData();
            setLoggedSuccess(true);
            setTimeout(() => setLoggedSuccess(false), 2400);
          } catch (e) {
            console.warn('Failed to save camera tracked workout', e);
          }
        }}
      />

      {/* Standalone Muscle Soreness & Recovery Modal */}
      <MuscleSorenessModal
        visible={showMuscleRecoveryModal}
        onClose={() => setShowMuscleRecoveryModal(false)}
        recoveryMap={recoveryMap}
        selectedMuscle={selectedMuscle}
        onSelectMuscle={(m) => setSelectedMuscle(m)}
        onSetMuscleRecovery={handleSetMuscleRecovery}
      />

      {/* Standalone Body Fat % Scanner Modal */}
      <BodyFatScannerModal
        visible={showBodyFatModal}
        onClose={() => setShowBodyFatModal(false)}
        userId={userId}
        profile={profile}
        onScanSaved={() => {
          loadData();
        }}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  screenTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  quickActionIndividualBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  quickActionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    marginBottom: 16,
  },
  successBannerText: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  stickmanHeroCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  stickmanHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stickmanVisualWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 125,
    height: 125,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  heroExerciseImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  stickmanInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  categoryTagPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    marginBottom: 6,
  },
  categoryTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  stickmanExerciseTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  lastWorkoutBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  lastWorkoutText: {
    fontSize: 11,
    letterSpacing: -0.1,
  },
  editPresetsLink: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10b98125',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
  },
  undoBtnText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '800',
  },
  workoutDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
    paddingTop: 8,
  },
  workoutDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  routinesSliderTrack: {
    flexDirection: 'row',
    gap: ROUTINE_CARD_GAP,
    paddingRight: 16,
    paddingBottom: 4,
  },
  coloredRoutineCardSlider: {
    width: ROUTINE_CARD_WIDTH,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  successTextRowBelowDays: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    marginTop: 2,
    marginBottom: 14,
  },
  loggedTextPlain: {
    fontSize: 13,
    fontWeight: '700',
  },
  blueUndoTextOnly: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  routineDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 6,
    marginBottom: 16,
  },
  routineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  routinesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  coloredRoutineCard: {
    width: '48.5%',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  routineCardMainTap: {
    flex: 1,
  },
  routineThreeDotsBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routinePillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  routinePillTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  routinePillSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '600',
  },
  optionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  optionActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  muscleGroupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  muscleGroupPillText: {
    fontSize: 11.5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  unitBadge: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  sorenessBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sorenessBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  recoveryCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    marginBottom: 18,
  },
  recoveryCardSub: {
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  selectedMuscleInfoBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
  selectedMuscleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  selectedMuscleTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  selectedMuscleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  muscleStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  muscleStatusPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  recoveryProgressWrap: {
    gap: 4,
  },
  recoveryProgressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  recoveryProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  recoveryProgressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recoveryPercentText: {
    fontSize: 11,
    fontWeight: '800',
  },
  recoveryTimeLeftText: {
    fontSize: 11,
  },
  categoryPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    paddingRight: 8,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
  },
  categoryPillText: {
    fontSize: 12.5,
    textTransform: 'capitalize',
  },
  exerciseSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  exerciseSearchInput: {
    flex: 1,
    fontSize: 13.5,
    padding: 0,
  },
  exerciseResultsCard: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 18,
    overflow: 'hidden',
    maxHeight: 280,
  },
  exerciseResultsScroll: {
    maxHeight: 280,
  },
  exerciseListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exerciseListItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  exerciseListIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseListItemName: {
    fontSize: 13,
  },
  exerciseListItemMeta: {
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  noExercisesFoundBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noExercisesFoundText: {
    fontSize: 12.5,
    textAlign: 'center',
  },
  exerciseCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  exerciseCard: {
    width: '48.5%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    justifyContent: 'center',
    minHeight: 40,
  },
  exerciseCardName: {
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
  },
  exerciseCardCategory: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  logInputCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  logCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  selectedTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  selectedSub: {
    fontSize: 12,
    marginTop: 3,
  },
  weightPillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  weightPillBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  inputCol: {
    flex: 1,
  },
  inputLabelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  increaseFilledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  increaseTriangleGlyph: {
    fontSize: 8.5,
    fontWeight: '900',
  },
  increaseAmountText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  decreaseFilledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  decreaseTriangleGlyph: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#ffffff',
  },
  decreaseAmountText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: '#ffffff',
  },
  numberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 36,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numericInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    padding: 0,
  },
  quickWeightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 16,
  },
  quickWeightPill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  quickWeightText: {
    fontSize: 12,
    fontWeight: '700',
  },
  notesWrapper: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    justifyContent: 'center',
    marginBottom: 18,
  },
  notesInput: {
    fontSize: 13,
  },
  logSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 16,
    gap: 8,
  },
  logSubmitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  modalSub: {
    fontSize: 12,
    marginTop: 2,
  },
  modalDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 18,
  },
  modalDayBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  modalDayBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  routineInputWrap: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    justifyContent: 'center',
    marginBottom: 14,
  },
  routineTextInput: {
    fontSize: 14,
    fontWeight: '600',
  },
  colorPickerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  modalExerciseList: {
    maxHeight: 280,
    marginBottom: 14,
  },
  modalExerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  modalExName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalExMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  saveRoutineBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveRoutineBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  deleteRoutineBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


