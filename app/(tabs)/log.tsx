import { WorkoutStartPanel } from '@/components/WorkoutStartPanel';
import { ExerciseDemo, ExerciseDemoProvider } from '@/components/ExerciseDemo';
import { useScreenInsets } from '@/constants/useScreenInsets';
import { AppModal as Modal } from '@/components/AppModal';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
  Dimensions,
  Animated,
  LayoutAnimation,
  UIManager,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Path as SvgPath, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/constants/AuthContext';
import { useTheme, BRAND_ROUNDED_FONT, BRAND_ROUNDED_FONT_EXTRA } from '@/constants/ThemeContext';
import { StickmanWorkoutIcon } from '@/components/StickmanWorkoutIcon';
import {
  DEFAULT_EXERCISES,
  ExerciseDefinition,
  saveWorkoutLog,
  saveWorkoutLogBatch,
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
import { WorkoutSessionModal } from '@/components/WorkoutSessionModal';
import {
  computeMuscleRecoveryMap,
  MuscleGroupKey,
  MuscleRecoveryStatus,
} from '@/constants/muscleRecoveryEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ROUTINE_CARD_GAP = 9;
const ROUTINE_PAGE_WIDTH = SCREEN_WIDTH - 32;
const ROUTINE_CARD_WIDTH = Math.floor((ROUTINE_PAGE_WIDTH - ROUTINE_CARD_GAP * 2) / 3);
const ROUTINE_PAGE_SNAP_INTERVAL = ROUTINE_PAGE_WIDTH + ROUTINE_CARD_GAP;

interface LogScreenSetRow {
  id: string;
  reps: string;
  weight: string;
  multiplier: number; // 1, 2, 3, 4
}

interface ExerciseRowItemProps {
  item: ExerciseDefinition;
  isSelected: boolean;
  isLast: boolean;
  isDark: boolean;
  primaryColor: string;
  textColor: string;
  textMutedColor: string;
  onSelect: (item: ExerciseDefinition) => void;
  onExpandHero: (item: ExerciseDefinition) => void;
}

const ExerciseRowItem = React.memo(function ExerciseRowItem({
  item,
  isSelected,
  isLast,
  isDark,
  primaryColor,
  textColor,
  textMutedColor,
  onSelect,
  onExpandHero,
}: ExerciseRowItemProps) {
  return (
    <TouchableOpacity
      style={[
        styles.exerciseListItem,
        {
          backgroundColor: isSelected
            ? isDark
              ? 'rgba(16,185,129,0.14)'
              : 'rgba(16,185,129,0.08)'
            : 'transparent',
          borderBottomColor: isLast
            ? 'transparent'
            : isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.04)',
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
      onPress={() => onSelect(item)}
      activeOpacity={0.75}
    >
      <View style={styles.exerciseListItemLeft}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.exerciseListItemName,
              {
                color: isSelected ? primaryColor : textColor,
                fontWeight: isSelected ? '800' : '700',
              },
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.exerciseListItemMeta, { color: textMutedColor }]}>
            {item.category.toUpperCase()}
            {item.primaryMuscles ? ` · ${item.primaryMuscles.join(', ')}` : ''}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          onExpandHero(item);
        }}
        style={styles.arrowTapArea}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons
          name="chevron-forward"
          size={17}
          color={isSelected ? primaryColor : textMutedColor}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const MODAL_EX_ROW_HEIGHT = 60;

interface ModalExerciseCheckItemProps {
  ex: ExerciseDefinition;
  isSelected: boolean;
  accentColor: string;
  isDark: boolean;
  cardColor: string;
  borderColor: string;
  textColor: string;
  textMutedColor: string;
  onToggle: (ex: ExerciseDefinition) => void;
}

const ModalExerciseCheckItem = React.memo(function ModalExerciseCheckItem({
  ex,
  isSelected,
  accentColor,
  isDark,
  cardColor,
  borderColor,
  textColor,
  textMutedColor,
  onToggle,
}: ModalExerciseCheckItemProps) {
  return (
    <TouchableOpacity
      style={[
        styles.modalExerciseItem,
        {
          backgroundColor: isSelected
            ? isDark
              ? 'rgba(59,130,246,0.15)'
              : 'rgba(59,130,246,0.1)'
            : cardColor,
          borderColor: isSelected ? accentColor : borderColor,
        },
      ]}
      onPress={() => onToggle(ex)}
      activeOpacity={0.75}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        {ex.imageUrl ? <ExerciseDemo imageUrl={ex.imageUrl} name={ex.name} size={26} radius={6} active={isSelected} /> : <Ionicons name="barbell-outline" size={18} color={isSelected ? accentColor : textMutedColor} />}
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={[styles.modalExName, { color: isSelected ? textColor : textMutedColor }]}
          >
            {ex.name}
          </Text>
          <Text numberOfLines={1} style={[styles.modalExMeta, { color: textMutedColor }]}>
            {ex.category.toUpperCase()}
            {ex.primaryMuscles ? ` · ${ex.primaryMuscles.join(', ')}` : ''}
          </Text>
        </View>
      </View>
      <Ionicons
        name={isSelected ? 'checkbox' : 'square-outline'}
        size={20}
        color={isSelected ? accentColor : textMutedColor}
      />
    </TouchableOpacity>
  );
});

interface RoutineBuilderModalProps {
  visible: boolean;
  editingRoutine: CustomRoutine | null;
  isDark: boolean;
  colors: any;
  onClose: () => void;
  onSave: (data: {
    title: string;
    color: string;
    category: CustomRoutine['category'];
    selectedIds: string[];
  }) => void;
  onDelete: (id: string) => void;
}

const RoutineBuilderModal = React.memo(function RoutineBuilderModal({
  visible,
  editingRoutine,
  isDark,
  colors,
  onClose,
  onSave,
  onDelete,
}: RoutineBuilderModalProps) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [category, setCategory] = useState<CustomRoutine['category']>('chest');
  const [selectedIds, setSelectedIds] = useState<string[]>([
    'bench_press',
    'incline_dumbbell_press',
  ]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSearchQuery('');
    if (editingRoutine) {
      setTitle(editingRoutine.title);
      setColor(editingRoutine.color || '#3b82f6');
      setCategory(editingRoutine.category || 'chest');
      setSelectedIds((editingRoutine.exercises || []).map((e) => e.exerciseId));
    } else {
      setTitle('');
      setColor('#3b82f6');
      setCategory('chest');
      setSelectedIds(['bench_press', 'incline_dumbbell_press']);
    }
  }, [visible, editingRoutine]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredModalExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return DEFAULT_EXERCISES;
    return DEFAULT_EXERCISES.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.primaryMuscles || []).some((m) => m.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const handleToggleExercise = useCallback((ex: ExerciseDefinition) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) => {
      if (prev.includes(ex.id)) {
        return prev.filter((id) => id !== ex.id);
      }
      setCategory(ex.category);
      return [...prev, ex.id];
    });
  }, []);

  const renderExerciseItem = useCallback(
    ({ item }: { item: ExerciseDefinition }) => (
      <ModalExerciseCheckItem
        ex={item}
        isSelected={selectedSet.has(item.id)}
        accentColor={color}
        isDark={isDark}
        cardColor={colors.card}
        borderColor={colors.border}
        textColor={colors.text}
        textMutedColor={colors.textMuted}
        onToggle={handleToggleExercise}
      />
    ),
    [selectedSet, color, isDark, colors.card, colors.border, colors.text, colors.textMuted, handleToggleExercise]
  );

  const keyExtractor = useCallback((item: ExerciseDefinition) => item.id, []);
  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: MODAL_EX_ROW_HEIGHT,
      offset: MODAL_EX_ROW_HEIGHT * index,
      index,
    }),
    []
  );

  return (
    <InteractiveBottomModal
      visible={visible}
      onDismiss={onClose}
      handleColor={colors.border}
      cardStyle={[
        styles.modalSheet,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}
    >
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
          onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={26} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Routine Title Input */}
      <View
        style={[
          styles.routineInputWrap,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <TextInput
          style={[styles.routineTextInput, { color: colors.text }]}
          placeholder="Day Name (e.g. Chest, Legs, Push, Upper)"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
      </View>

      {/* Color Accent Picker */}
      <Text style={[styles.modalSectionLabel, { color: colors.textMuted }]}>
        ACCENT COLOR:
      </Text>
      <View style={styles.colorPickerRow}>
        {[
          '#3b82f6',
          '#10b981',
          '#8b5cf6',
          '#f59e0b',
          '#ec4899',
          '#06b6d4',
          '#ef4444',
        ].map((c) => (
          <TouchableOpacity
            key={c}
            style={[
              styles.colorCircle,
              { backgroundColor: c },
              color === c && styles.colorCircleSelected,
            ]}
            onPress={() => setColor(c)}
          >
            {color === c && (
              <Ionicons name="checkmark" size={14} color="#ffffff" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Exercises Selector for this routine */}
      <Text style={[styles.modalSectionLabel, { color: colors.textMuted }]}>
        CHOOSE EXERCISES FOR THIS DAY ({selectedIds.length} SELECTED):
      </Text>

      {/* Quick Filter Input for Modal Exercise List */}
      <View
        style={[
          styles.routineInputWrap,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            height: 40,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          },
        ]}
      >
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={[styles.routineTextInput, { color: colors.text, flex: 1, fontSize: 13 }]}
          placeholder="Filter exercises..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredModalExercises}
        keyExtractor={keyExtractor}
        renderItem={renderExerciseItem}
        getItemLayout={getItemLayout}
        style={styles.modalExerciseList}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={3}
        removeClippedSubviews={true}
        keyboardShouldPersistTaps="handled"
      />

      {/* Action Buttons: Save & Optional Delete */}
      <View style={styles.modalActionsRow}>
        {editingRoutine && (
          <TouchableOpacity
            style={[styles.deleteRoutineBtn, { borderColor: '#ef4444' }]}
            onPress={() => onDelete(editingRoutine.id)}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.saveRoutineBtn, { backgroundColor: color }]}
          onPress={() =>
            onSave({
              title,
              color,
              category,
              selectedIds,
            })
          }
        >
          <Text style={styles.saveRoutineBtnText}>Save Workout Day</Text>
        </TouchableOpacity>
      </View>
    </InteractiveBottomModal>
  );
});

export default function LogScreen() {
  const screenInsets = useScreenInsets();

  const { user, profile } = useAuth();
  const themeContext = useTheme();
  const colors = themeContext?.colors;
  const isDark = themeContext?.isDark ?? colors?.isDark ?? true;

  const userId = user?.id || 'guest_user';
  const effectiveWeightUnit: 'kg' | 'lb' =
    profile.unitSystem === 'metric' ? 'kg' : 'lb';

  const [selectedExercise, setSelectedExercise] = useState<ExerciseDefinition>(DEFAULT_EXERCISES[0]);
  const [exerciseSets, setExerciseSets] = useState<LogScreenSetRow[]>([
    {
      id: 'set_init',
      reps: String(DEFAULT_EXERCISES[0].defaultReps),
      weight: String(
        effectiveWeightUnit === 'kg'
          ? Math.round(DEFAULT_EXERCISES[0].defaultWeight * 0.453592)
          : DEFAULT_EXERCISES[0].defaultWeight
      ),
      multiplier: 1,
    },
  ]);
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
  const logButtonScale = useRef(new Animated.Value(1)).current;
  const logSuccessFill = useRef(new Animated.Value(0)).current;
  const logCheckScale = useRef(new Animated.Value(1)).current;
  const [allLogs, setAllLogs] = useState<WorkoutLogEntry[]>([]);
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState<string>('all');
  const [selectedDifficultyFilter, setSelectedDifficultyFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [activeDropdown, setActiveDropdown] = useState<'muscle' | 'difficulty' | 'type' | null>(null);

  const [exerciseSearchQuery, setExerciseSearchQuery] = useState<string>('');
  const [exerciseBrowserExpanded, setExerciseBrowserExpanded] = useState(false);
  const [isHeroExpanded, setIsHeroExpanded] = useState<boolean>(false);
  const heroExpandAnim = useRef(new Animated.Value(0)).current;

  const toggleHeroExpanded = (forceOpen?: boolean) => {
    const nextState = forceOpen !== undefined ? forceOpen : !isHeroExpanded;
    if (nextState === isHeroExpanded && forceOpen === undefined) return;
    setIsHeroExpanded(nextState);
    Animated.timing(heroExpandAnim, {
      toValue: nextState ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

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
  const [activeFitnessTool, setActiveFitnessTool] = useState<'soreness' | 'bodyFat' | 'aiForm'>('aiForm');

  // Undo support state: stores IDs of the most recently logged entry/entries
  const [lastLoggedIds, setLastLoggedIds] = useState<string[]>([]);
  const [undoTimer, setUndoTimer] = useState<any>(null);

  const [activeRoutinePage, setActiveRoutinePage] = useState<number>(0);
  // Chunk routines and append a "New Day" card as the last option (exactly like the add friend circle in community)
  type RoutineSliderItem =
    | { type: 'routine'; data: CustomRoutine }
    | { type: 'new_day' };

  const routinePages = useMemo(() => {
    const items: RoutineSliderItem[] = routines.map((r) => ({ type: 'routine', data: r }));
    items.push({ type: 'new_day' });

    const pages: RoutineSliderItem[][] = [];
    for (let i = 0; i < items.length; i += 3) {
      pages.push(items.slice(i, i + 3));
    }
    return pages;
  }, [routines]);
  const routinePageCount = Math.max(1, routinePages.length);

  // Muscle Soreness & Recovery Map state
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroupKey | null>('chest');
  const [showMuscleRecoveryModal, setShowMuscleRecoveryModal] = useState<boolean>(false);
  const [showBodyFatModal, setShowBodyFatModal] = useState<boolean>(false);
  const [activeSessionRoutine, setActiveSessionRoutine] = useState<CustomRoutine | null>(null);
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
    setSelectedExIdsForRoutine((routine.exercises || []).map((e) => e.exerciseId));
    setRoutineModalVisible(true);
  };

  const handleSaveCustomRoutine = useCallback(
    async (params?: {
      title?: string;
      color?: string;
      category?: CustomRoutine['category'];
      selectedIds?: string[];
    }) => {
      const title = typeof params?.title === 'string' ? params.title : newRoutineTitle;
      const color = typeof params?.color === 'string' ? params.color : newRoutineColor;
      const category = params?.category ?? newRoutineCategory;
      const selectedIds = Array.isArray(params?.selectedIds) ? params.selectedIds : selectedExIdsForRoutine;

      if (!title.trim()) {
        Alert.alert('Title Required', 'Please enter a name for your workout day (e.g. "Chest", "Legs").');
        return;
      }
      if (selectedIds.length === 0) {
        Alert.alert('Exercises Required', 'Please choose at least 1 exercise for this routine.');
        return;
      }

      const newExList: RoutineExercise[] = selectedIds.map((id) => {
        const def = DEFAULT_EXERCISES.find((e) => e.id === id);
        return {
          exerciseId: id,
          reps: def?.defaultReps || 10,
          weight: def?.defaultWeight || 50,
        };
      });

      const newRoutine: CustomRoutine = {
        id: editingRoutine ? editingRoutine.id : `routine_${Date.now()}`,
        title: title.trim(),
        color,
        category,
        exercises: newExList,
      };

      const updated = editingRoutine
        ? routines.map((r) => (r.id === editingRoutine.id ? newRoutine : r))
        : [...routines, newRoutine];

      setRoutines(updated);
      if (activeSessionRoutine?.id === newRoutine.id) setActiveSessionRoutine(newRoutine);
      await saveCustomRoutines(userId, updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRoutineModalVisible(false);
    },
    [activeSessionRoutine, editingRoutine, newRoutineCategory, newRoutineColor, newRoutineTitle, routines, selectedExIdsForRoutine, userId]
  );
  const handleDeleteRoutine = useCallback(
    async (routineId: string) => {
      const updated = routines.filter((r) => r.id !== routineId);
      setRoutines(updated);
      if (activeSessionRoutine?.id === routineId) setActiveSessionRoutine(null);
      await saveCustomRoutines(userId, updated);
      setRoutineModalVisible(false);
    },
    [activeSessionRoutine, routines, userId]
  );



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

  const handleSelectExercise = useCallback((exercise: ExerciseDefinition) => {
    setExerciseBrowserExpanded(false);
    Keyboard.dismiss();
    setSelectedExercise(exercise);
    
    // Check if we have prior log
    const prev = allLogs.find((l) => l.exerciseId === exercise.id);
    let targetR = String(exercise.defaultReps);
    let targetW = String(
      effectiveWeightUnit === 'kg'
        ? Math.round(exercise.defaultWeight * 0.453592)
        : exercise.defaultWeight
    );

    if (prev) {
      targetR = String(prev.reps);
      const convertedW =
        prev.weightUnit === effectiveWeightUnit
          ? prev.weight
          : effectiveWeightUnit === 'kg'
            ? Math.round(prev.weight * 0.453592)
            : Math.round(prev.weight * 2.20462);
      targetW = String(convertedW);
    }

    setRepsInput(targetR);
    setWeightInput(targetW);
    setExerciseSets([
      {
        id: `set_${Date.now()}`,
        reps: targetR,
        weight: targetW,
        multiplier: 1,
      },
    ]);
  }, [allLogs, effectiveWeightUnit]);

  // Set management for main fitness log screen
  const addExerciseSetRow = () => {
    setExerciseSets((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          reps: last ? last.reps : repsInput,
          weight: last ? last.weight : weightInput,
          multiplier: 1,
        },
      ];
    });
  };

  const removeExerciseSetRow = (setIndex: number) => {
    setExerciseSets((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, idx) => idx !== setIndex);
    });
  };

  const cycleSetMultiplier = (setIndex: number) => {
    setExerciseSets((prev) => {
      const copy = [...prev];
      const cur = copy[setIndex].multiplier || 1;
      const next = cur >= 4 ? 1 : cur + 1;
      copy[setIndex] = { ...copy[setIndex], multiplier: next };
      return copy;
    });
  };

  const updateSetReps = (setIndex: number, delta: number) => {
    setExerciseSets((prev) => {
      const copy = [...prev];
      const curVal = parseInt(copy[setIndex].reps, 10) || 0;
      copy[setIndex] = {
        ...copy[setIndex],
        reps: String(Math.max(1, curVal + delta)),
      };
      return copy;
    });
  };

  const updateSetWeight = (setIndex: number, delta: number) => {
    setExerciseSets((prev) => {
      const copy = [...prev];
      const curVal = parseFloat(copy[setIndex].weight) || 0;
      copy[setIndex] = {
        ...copy[setIndex],
        weight: String(Math.max(0, curVal + delta)),
      };
      return copy;
    });
  };

  const setDirectSetReps = (setIndex: number, text: string) => {
    setExerciseSets((prev) => {
      const copy = [...prev];
      copy[setIndex] = { ...copy[setIndex], reps: text };
      return copy;
    });
  };

  const setDirectSetWeight = (setIndex: number, text: string) => {
    setExerciseSets((prev) => {
      const copy = [...prev];
      copy[setIndex] = { ...copy[setIndex], weight: text };
      return copy;
    });
  };

  const handleExpandHeroForExercise = useCallback((exercise: ExerciseDefinition) => {
    Haptics.selectionAsync().catch(() => {});
    handleSelectExercise(exercise);
    toggleHeroExpanded(true);
  }, [handleSelectExercise, toggleHeroExpanded]);

  const handleLogWorkout = async () => {
    // Validate all rows
    const validRows: { reps: number; weight: number; multiplier: number }[] = [];
    for (const setRow of exerciseSets) {
      const r = parseInt(setRow.reps.trim(), 10);
      const w = parseFloat(setRow.weight.trim());
      if (isNaN(r) || r <= 0) {
        Alert.alert('Reps Required', 'Please enter a valid number of repetitions for each set.');
        return;
      }
      if (isNaN(w) || w < 0) {
        Alert.alert('Weight Required', 'Please enter a valid weight for each set.');
        return;
      }
      validRows.push({ reps: r, weight: w, multiplier: setRow.multiplier || 1 });
    }

    if (validRows.length === 0) return;

    // Satisfying multi-stage haptic ripple
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 140);

    // Trigger punchy press-in & fill animation
    Animated.sequence([
      Animated.timing(logButtonScale, { toValue: 0.94, duration: 90, useNativeDriver: true }),
      Animated.spring(logButtonScale, { toValue: 1.02, friction: 4, tension: 180, useNativeDriver: true }),
      Animated.spring(logButtonScale, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }),
    ]).start();

    // Fill in emerald green and pop checkmark icon
    Animated.timing(logSuccessFill, { toValue: 1, duration: 180, useNativeDriver: false }).start();
    Animated.sequence([
      Animated.timing(logCheckScale, { toValue: 1.45, duration: 160, useNativeDriver: true }),
      Animated.spring(logCheckScale, { toValue: 1, friction: 4, tension: 190, useNativeDriver: true }),
    ]).start();

    const newCreatedIds: string[] = [];
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      for (let m = 0; m < row.multiplier; m++) {
        const created = await saveWorkoutLog(userId, {
          exerciseId: selectedExercise.id,
          exerciseName: selectedExercise.name,
          reps: row.reps,
          weight: row.weight,
          weightUnit: effectiveWeightUnit,
          notes:
            notesInput.trim() ||
            (validRows.length > 1
              ? `Set ${i + 1}${row.multiplier > 1 ? ` (${m + 1}/${row.multiplier})` : ''}`
              : undefined),
        });
        if (created?.id) {
          newCreatedIds.push(created.id);
        }
      }
    }

    const refreshed = await loadWorkoutLogs(userId);
    setAllLogs(refreshed);

    if (newCreatedIds.length > 0) {
      setLastLoggedIds(newCreatedIds);
    }
    setLoggedSuccess(true);
    if (undoTimer) clearTimeout(undoTimer);
    const timer = setTimeout(() => {
      setLoggedSuccess(false);
      setLastLoggedIds([]);
      Animated.timing(logSuccessFill, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    }, 4500);
    setUndoTimer(timer);
  };

  const filteredExercises = useMemo(() => {
    const q = exerciseSearchQuery.trim().toLowerCase();

    return DEFAULT_EXERCISES.filter((e) => {
      // 1. Text Query Filter
      if (q) {
        const matchesName = e.name.toLowerCase().includes(q);
        const matchesCat = e.category.toLowerCase().includes(q);
        const matchesEquip = (e.equipment || '').toLowerCase().includes(q);
        const matchesMuscles = (e.primaryMuscles || []).some((m) => m.toLowerCase().includes(q));
        if (!matchesName && !matchesCat && !matchesEquip && !matchesMuscles) {
          return false;
        }
      }

      // 2. Muscle Group Filter
      if (selectedMuscleFilter !== 'all' && e.category !== selectedMuscleFilter) {
        return false;
      }

      // 3. Difficulty Filter (beginner, intermediate, advanced)
      if (selectedDifficultyFilter !== 'all') {
        const exName = e.name.toLowerCase();
        let diff = 'intermediate';
        if (
          exName.includes('deadlift') ||
          exName.includes('squat') ||
          exName.includes('clean') ||
          exName.includes('snatch') ||
          exName.includes('overhead press')
        ) {
          diff = 'advanced';
        } else if (
          exName.includes('curl') ||
          exName.includes('pushdown') ||
          exName.includes('crunch') ||
          exName.includes('calf') ||
          exName.includes('lateral raise') ||
          exName.includes('extension')
        ) {
          diff = 'beginner';
        }
        if (diff !== selectedDifficultyFilter) {
          return false;
        }
      }

      // 4. Equipment Type Filter
      if (selectedTypeFilter !== 'all') {
        const equip = (e.equipment || '').toLowerCase();
        if (selectedTypeFilter === 'barbell' && !equip.includes('barbell')) return false;
        if (selectedTypeFilter === 'dumbbell' && !equip.includes('dumbbell')) return false;
        if (selectedTypeFilter === 'cable' && !equip.includes('cable')) return false;
        if (selectedTypeFilter === 'machine' && !equip.includes('machine')) return false;
        if (selectedTypeFilter === 'bodyweight' && !equip.includes('body only')) return false;
      }

      return true;
    });
  }, [exerciseSearchQuery, selectedMuscleFilter, selectedDifficultyFilter, selectedTypeFilter]);

  return (
    <ExerciseDemoProvider>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header matching modern aesthetic */}
        <View style={[styles.header, { paddingTop: screenInsets.top + 16 }]}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Fitness Log</Text>
        </View>

        {/* ── 3 PROMINENT QUICK ACTION TILES ── */}
        <View accessibilityLabel="Fitness tools" style={[styles.quickActionButtonsRow, { backgroundColor: colors.surfaceElevated }]}>
          {([
            { id: 'aiForm', color: '#10b981', label: 'AI Form', icon: 'videocam-outline', open: () => setShowCameraTracker(true) },
            { id: 'bodyFat', color: '#a855f7', label: 'Body Fat', icon: 'scan-circle-outline', open: () => setShowBodyFatModal(true) },
            { id: 'soreness', color: '#f97316', label: 'Soreness', icon: 'fitness-outline', open: () => setShowMuscleRecoveryModal(true) },
          ] as const).map(tool => {
            const selected = activeFitnessTool === tool.id;
            return <TouchableOpacity key={tool.id} accessibilityRole="button" accessibilityState={{ selected }}
              style={[styles.quickActionTile, { backgroundColor: selected ? tool.color + '18' : 'transparent' }]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setActiveFitnessTool(tool.id); tool.open(); }} activeOpacity={0.8}>
              <Ionicons name={tool.icon} size={18} color={tool.color} />
              <Text style={[styles.quickActionTitle, { color: tool.color }]} numberOfLines={1}>{tool.label}</Text>
            </TouchableOpacity>;
          })}
        </View>

        {/* ── SECTION 0: CUSTOM WORKOUT DAY PRESETS / ROUTINES (SLIDER: 3 VISIBLE AT ONCE, SNAPPY) ── */}
        <ScrollView
          horizontal
          pagingEnabled={false}
          snapToInterval={ROUTINE_PAGE_SNAP_INTERVAL}
          snapToAlignment="start"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.routinesSliderTrack}
          onScroll={(e) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const pageIndex = Math.min(
              routinePageCount - 1,
              Math.max(0, Math.round(offsetX / ROUTINE_PAGE_SNAP_INTERVAL))
            );
            setActiveRoutinePage(pageIndex);
          }}
          scrollEventThrottle={16}
        >
          {routinePages.map((pageGroup, pIdx) => (
            <View key={`routine_page_${pIdx}`} style={styles.routinePageGroup}>
              {pageGroup.map((item, itemIdx) => {
                if (item.type === 'new_day') {
                  return (
                    <TouchableOpacity
                      key="routine_new_day_item"
                      style={[
                        styles.coloredRoutineCardSlider,
                        styles.newDayCardSlider,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        openCreateRoutineModal();
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.newDayInnerRow}>
                        <View style={[styles.newDayIconCircle, { backgroundColor: colors.surfaceSecondary }]}>
                          <Ionicons name="add" size={17} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.routinePillTitle,
                              { color: colors.primary },
                            ]}
                            numberOfLines={1}
                          >
                            New Day
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }

                const routine = item.data;
                const exCount = routine.exercises?.length ?? 0;
                return (
                  <View
                    key={routine.id}
                    style={[
                      styles.coloredRoutineCardSlider,
                      {
                        backgroundColor: activeSessionRoutine?.id === routine.id ? routine.color + '22' : colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: activeSessionRoutine?.id === routine.id ? routine.color : 'transparent',
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.routineCardMainTap}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${routine.title} workout day`}
                      accessibilityState={{ selected: activeSessionRoutine?.id === routine.id }}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        if (activeSessionRoutine?.id === routine.id) return;
                        if (activeSessionRoutine) {
                          Alert.alert('Switch workout day?', 'Unsaved sets in the current workout will be discarded.', [
                            { text: 'Keep workout', style: 'cancel' },
                            { text: 'Switch', style: 'destructive', onPress: () => setActiveSessionRoutine(routine) },
                          ]);
                        } else setActiveSessionRoutine(routine);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.routinePillInner}>
                        <Text
                          style={[
                            styles.routinePillTitle,
                            { color: colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {routine.title}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.routinePillSub,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {exCount} {exCount === 1 ? 'exercise' : 'exercises'}
                      </Text>
                    </TouchableOpacity>

                    {/* 3-dots Menu Button to edit day or select subset */}
                    <TouchableOpacity
                      style={styles.routineThreeDotsBtn}
                      accessibilityLabel={`Edit ${routine.title} workout day`}
                      onPress={() => {
                        if (activeSessionRoutine?.id === routine.id) {
                          Alert.alert('Edit active workout day?', 'Saving changes will reset unsaved sets for this workout.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Edit', onPress: () => openEditRoutineModal(routine) },
                          ]);
                        } else openEditRoutineModal(routine);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="ellipsis-vertical"
                        size={14}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
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

        {batchSuccessMsg && <View style={styles.successTextRowBelowDays}>
          <Text style={[styles.loggedTextPlain, { color: colors.text }]}>{batchSuccessMsg}</Text>
          {lastLoggedIds.length > 0 && <TouchableOpacity onPress={triggerUndo}><Text style={styles.blueUndoTextOnly}>Undo</Text></TouchableOpacity>}
        </View>}
        {!activeSessionRoutine && <WorkoutStartPanel routines={routines} logs={allLogs}
          onSelectRoutine={setActiveSessionRoutine} onCreateRoutine={openCreateRoutineModal} />}
        {activeSessionRoutine && (
          <WorkoutSessionModal
            key={activeSessionRoutine?.id || 'no-workout'}
            embedded
            visible={!!activeSessionRoutine}
            routine={activeSessionRoutine}
            allLogs={allLogs}
            userId={userId}
            weightUnit={effectiveWeightUnit}
            onClose={() => Alert.alert('Close workout?', 'Unsaved sets will be discarded.', [
              { text: 'Keep workout', style: 'cancel' },
              { text: 'Close', style: 'destructive', onPress: () => setActiveSessionRoutine(null) },
            ])}
            onFinishSession={(count, ids) => {
              setLastLoggedIds(ids);
              setActiveSessionRoutine(null);
              loadData();
              setBatchSuccessMsg(`Logged ${count} completed set${count === 1 ? '' : 's'}!`);
              if (undoTimer) clearTimeout(undoTimer);
              setUndoTimer(setTimeout(() => {
                setBatchSuccessMsg(null);
                setLastLoggedIds([]);
              }, 4500));
            }}
          />
        )}
      </ScrollView>

      {/* Custom Routine / Workout Day Creation Modal */}
      <RoutineBuilderModal
        visible={routineModalVisible}
        editingRoutine={editingRoutine}
        isDark={isDark}
        colors={colors}
        onClose={() => setRoutineModalVisible(false)}
        onSave={handleSaveCustomRoutine}
        onDelete={handleDeleteRoutine}
      />

      {/* AI Camera Form Tracker Modal (in Fitness / Workouts Tab) */}
      <CameraFormTrackerModal
        visible={showCameraTracker}
        weightUnit={effectiveWeightUnit}
        onClose={() => setShowCameraTracker(false)}
        onSaveTrackedWorkout={async (trackingData) => {
          const exerciseMap: Record<string, { id: string; name: string }> = {
            boxing: { id: 'boxing', name: 'Shadowboxing' },
            pushups: { id: 'pushups', name: 'Pushups' },
            squats: { id: 'squats', name: trackingData.confirmedWeight === 0 ? 'Bodyweight Squat' : 'Squats' },
            bicep_curls: { id: 'bicep_curls', name: 'Bicep Curls' },
          };
          const meta = exerciseMap[trackingData.exerciseType] || { id: 'pushups', name: 'Pushups' };
          const confirmedWeight = trackingData.confirmedWeight;
          if (confirmedWeight === undefined || !Number.isFinite(confirmedWeight) || confirmedWeight < 0) {
            throw new Error('Camera workout needs a confirmed weight.');
          }

          const created = await saveWorkoutLogBatch(userId, [{
            exerciseId: meta.id,
            exerciseName: meta.name,
            reps: trackingData.repCount,
            weight: confirmedWeight,
            weightUnit: trackingData.confirmedWeightUnit || effectiveWeightUnit,
            notes: trackingData.exerciseType === 'boxing' ? `Boxing: ${trackingData.boxingScore || 0} points, ${trackingData.repCount} hits, ${trackingData.boxingMisses || 0} misses; best combo ${trackingData.boxingBestCombo || 0}.` : trackingData.averageFormScore > 0 ? `AI Form Score: ${trackingData.averageFormScore}%` : 'Camera-counted reps; form score not assessed.',
            aiTracked: true,
            trackingData,
          }]);

          loadData();
          setLastLoggedIds(created.map(log => log.id));
          setBatchSuccessMsg(`Logged ${trackingData.repCount} camera-tracked ${meta.id === 'boxing' ? 'hits' : 'reps'}.`);
          if (undoTimer) clearTimeout(undoTimer);
          setUndoTimer(setTimeout(() => { setBatchSuccessMsg(null); setLastLoggedIds([]); }, 4500));
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
    </ExerciseDemoProvider>
  );
}


const styles = StyleSheet.create({
  multiplierCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiplierIconStack: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  multiplierNumberCenterWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiplierCircleText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 10,
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
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
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 28,
    fontWeight: '800',
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
    marginHorizontal: -16,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 18,
    gap: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  quickActionTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 18,
    gap: 7,
    minHeight: 42,
  },
  quickActionTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 13,
    flexShrink: 1,
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
    padding: 16,
    marginBottom: 18,
  },
  stickmanHeroHeaderTap: {
    width: '100%',
  },
  stickmanHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroChevronBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  heroExpandedContainer: {
    marginTop: 14,
    gap: 12,
  },
  heroExpandedDivider: {
    height: 1,
    width: '100%',
  },
  heroExerciseDescription: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  heroNotchesGrid: {
    gap: 10,
  },
  userPercentileBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  userPercentileText: {
    fontSize: 11,
    fontWeight: '600',
  },
  medianWeightValueWrap: {
    height: 14,
    justifyContent: 'center',
  },
  medianWeightBigText: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  stickmanVisualWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 104,
    height: 104,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 0,
  },
  heroExerciseImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    transform: [{ scale: 1.15 }],
  },
  stickmanInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  exerciseBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  categoryTagPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
  },
  categoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  equipmentTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
  },
  equipmentTagText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  stickmanExerciseTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 21,
    fontWeight: '800',
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
  routinePageGroup: {
    width: ROUTINE_PAGE_WIDTH,
    flexDirection: 'row',
    gap: ROUTINE_CARD_GAP,
  },
  coloredRoutineCardSlider: {
    width: ROUTINE_CARD_WIDTH,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 6,
    height: 52,
  },
  newDayCardSlider: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  newDayInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  newDayIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineIconBadgeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  routinePillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  routinePillTitle: {
    fontFamily: BRAND_ROUNDED_FONT,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  routinePillSub: {
    fontSize: 10.5,
    fontWeight: '500',
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
  },
  routineCardMainTap: {
    flex: 1,
  },
  routineThreeDotsBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  muscleGroupPillText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  resultsCountOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  sectionHeading: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
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
  /* 3 Dropdown Filter Bubbles & Drawer */
  dropdownBubblesContainer: {
    marginBottom: 16,
    zIndex: 20,
  },
  dropdownBubblesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterDropdownPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 5,
  },
  filterDropdownPillText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  filterDropdownDrawer: {
    marginTop: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  dropdownOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dropdownOptionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  dropdownOptionChipText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 12,
    fontWeight: '800',
  },
  categoryPillsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 2,
    paddingRight: 16,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 16,
  },
  categoryPillText: {
    fontSize: 13,
    textTransform: 'capitalize',
  },
  exerciseSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 14,
  },
  exerciseSearchInput: {
    fontFamily: BRAND_ROUNDED_FONT,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    padding: 0,
  },
  exerciseResultsCard: {
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
    height: 160,
  },
  exerciseResultsScroll: {
    height: 160,
  },
  exerciseDetailSlideWrap: {
    height: 275,
    padding: 16,
    justifyContent: 'space-between',
  },
  exerciseDetailSlideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  backToExercisesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  backToExercisesText: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectThisExBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  selectThisExText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  inspectTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  inspectDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  inspectMetricsContainer: {
    gap: 9,
    marginTop: 2,
  },
  rankingSideBySideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rankingCol: {
    flex: 1,
    gap: 4,
  },
  rankingFullRow: {
    gap: 4,
  },
  rankingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rankingTitle: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  rankingValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  notchesBar: {
    flexDirection: 'row',
    gap: 5,
    height: 5,
    width: 78,
  },
  notchSegment: {
    width: 22,
    height: '100%',
    borderRadius: 2.5,
  },
  popularityNotchesWithNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 16,
  },
  notchesBarCompact: {
    flexDirection: 'row',
    gap: 4,
    height: 5,
  },
  notchSegmentCompact: {
    width: 16,
    height: '100%',
    borderRadius: 2.5,
  },
  rankingValueInline: {
    fontSize: 11,
    fontWeight: '800',
  },
  genderWeightsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 16,
  },
  genderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
  },
  genderWeightText: {
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  popularityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  popularityText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  arrowTapArea: {
    padding: 6,
  },
  exerciseListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  exerciseListItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  exerciseListIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseListItemName: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 19,
  },
  exerciseListItemMeta: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.1,
  },
  noExercisesFoundBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noExercisesFoundText: {
    fontFamily: BRAND_ROUNDED_FONT,
    fontSize: 13,
    fontWeight: '600',
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
    borderRadius: 22,
    padding: 18,
  },
  logCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  addSetHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  addSetHeaderBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  logScreenSetCard: {
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  logScreenSetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logScreenSetIndexLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  multiplierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 12,
  },
  multiplierPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  deleteSetBtn: {
    padding: 6,
  },
  selectedTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 21,
    fontWeight: '800',
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
  },
  quickWeightText: {
    fontSize: 12,
    fontWeight: '700',
  },
  notesWrapper: {
    borderRadius: 14,
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
    minHeight: 58,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    gap: 8,
  },
  logSubmitBtnText: {
    textAlign: 'center',
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
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 21,
    fontWeight: '800',
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


