import { buildWorkoutRoutine } from '@/constants/workoutRoutineDraft';
import { TutorialAnchor, TutorialScrollView } from "@/components/FirstRunTutorial";
import { WorkoutStartPanel } from '@/components/WorkoutStartPanel';
import { WorkoutRankProgress } from '@/components/WorkoutRankProgress';
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
const ROUTINE_CARD_GAP = 10;
const ROUTINE_CARDS_PER_PAGE = 2;
const ROUTINE_PAGE_WIDTH = SCREEN_WIDTH - 32;
const ROUTINE_CARD_WIDTH = Math.floor((ROUTINE_PAGE_WIDTH - ROUTINE_CARD_GAP) / ROUTINE_CARDS_PER_PAGE);
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

function getExerciseDetails(ex: ExerciseDefinition, weightUnit: 'kg' | 'lb') {
  const exName = (ex.name || '').toLowerCase();
  const exCat = (ex.category || '').toLowerCase();
  const exEquip = (ex.equipment || '').toLowerCase();

  let popPercent = 42;
  let popNotches = 2;
  if (exName.includes('barbell flat bench') || exName.includes('barbell squat') || exName.includes('conventional deadlift') || exName.includes('lat pulldown') || exName.includes('bicep curl')) {
    popPercent = 78; popNotches = 3;
  } else if (exName.includes('incline dumbbell') || exName.includes('romanian deadlift') || exName.includes('leg press') || exName.includes('pull-up') || exName.includes('lateral raise') || exName.includes('tricep rope') || exName.includes('cable fly')) {
    popPercent = 64; popNotches = 3;
  } else if (exName.includes('overhead press') || exName.includes('hammer curl') || exName.includes('leg extension') || exName.includes('leg curl') || exName.includes('cable row') || exName.includes('skull crusher')) {
    popPercent = 52; popNotches = 2;
  } else if (exName.includes('bulgarian') || exName.includes('incline curl') || exName.includes('chest supported') || exName.includes('calf') || exName.includes('dip') || exName.includes('face pull')) {
    popPercent = 36; popNotches = 2;
  } else if (exName.includes('sissy') || exName.includes('good morning') || exName.includes('front squat') || exName.includes('clean') || exName.includes('snatch') || exName.includes('hack squat') || exName.includes('shrug')) {
    popPercent = 22; popNotches = 1;
  } else if (exCat === 'chest' || exCat === 'arms') {
    popPercent = 48; popNotches = 2;
  } else if (exCat === 'back' || exCat === 'legs' || exCat === 'shoulders') {
    popPercent = 42; popNotches = 2;
  } else if (exCat === 'core') {
    popPercent = 34; popNotches = 1;
  } else {
    popPercent = 24; popNotches = 1;
  }

  let diffLevel = 2;
  let difficultyLabel: 'Beginner' | 'Intermediate' | 'Advanced' = 'Intermediate';
  if (exName.includes('deadlift') || exName.includes('squat') || exName.includes('clean') || exName.includes('snatch') || exName.includes('overhead press')) {
    diffLevel = 3; difficultyLabel = 'Advanced';
  } else if (exName.includes('curl') || exName.includes('pushdown') || exName.includes('crunch') || exName.includes('calf') || exName.includes('lateral raise') || exName.includes('extension')) {
    diffLevel = 1; difficultyLabel = 'Beginner';
  }

  let progLevel = 2;
  if (exName.includes('bench') || exName.includes('squat') || exName.includes('deadlift') || exName.includes('leg press') || exName.includes('barbell row')) {
    progLevel = 3;
  } else if (exName.includes('lateral raise') || exName.includes('face pull') || exName.includes('wrist') || exName.includes('rotator')) {
    progLevel = 1;
  }

  let baseAvgLbs = 45;
  const isBodyweight = exEquip.includes('body only') || exName.includes('bodyweight') || exName.includes('pushup') || exName.includes('pullup') || exName.includes('chin-up') || exName.includes('dip') || exName.includes('crunch') || exName.includes('plank');
  if (isBodyweight) baseAvgLbs = 0;
  else if (exEquip.includes('dumbbell')) {
    if (exName.includes('bench') || exName.includes('chest press') || exName.includes('incline press')) baseAvgLbs = 50;
    else if (exName.includes('shoulder press') || exName.includes('overhead')) baseAvgLbs = 40;
    else if (exName.includes('lateral raise') || exName.includes('front raise') || exName.includes('fly')) baseAvgLbs = 20;
    else if (exName.includes('curl') || exName.includes('tricep') || exName.includes('extension')) baseAvgLbs = 25;
    else if (exName.includes('lunge') || exName.includes('squat') || exName.includes('deadlift')) baseAvgLbs = 45;
    else baseAvgLbs = 30;
  } else if (exEquip.includes('barbell')) {
    if (exName.includes('deadlift')) baseAvgLbs = 205;
    else if (exName.includes('squat')) baseAvgLbs = 185;
    else if (exName.includes('bench press')) baseAvgLbs = 145;
    else if (exName.includes('row')) baseAvgLbs = 135;
    else if (exName.includes('overhead press') || exName.includes('military')) baseAvgLbs = 95;
    else if (exName.includes('curl')) baseAvgLbs = 65;
    else baseAvgLbs = 115;
  } else if (exEquip.includes('cable')) {
    if (exName.includes('pulldown') || exName.includes('row')) baseAvgLbs = 120;
    else if (exName.includes('tricep') || exName.includes('pushdown')) baseAvgLbs = 50;
    else if (exName.includes('curl') || exName.includes('fly') || exName.includes('crossover') || exName.includes('lateral')) baseAvgLbs = 25;
    else baseAvgLbs = 45;
  } else if (exEquip.includes('machine')) {
    if (exName.includes('leg press')) baseAvgLbs = 270;
    else if (exName.includes('leg curl') || exName.includes('leg extension')) baseAvgLbs = 85;
    else if (exName.includes('chest press') || exName.includes('row')) baseAvgLbs = 110;
    else if (exName.includes('shoulder') || exName.includes('overhead')) baseAvgLbs = 70;
    else baseAvgLbs = 80;
  } else {
    if (exCat === 'legs') baseAvgLbs = 155;
    else if (exCat === 'chest' || exCat === 'back') baseAvgLbs = 115;
    else if (exCat === 'shoulders') baseAvgLbs = 55;
    else if (exCat === 'arms') baseAvgLbs = 35;
    else if (exCat === 'core') baseAvgLbs = 0;
  }

  const fmtAvg = (lbs: number) =>
    isBodyweight || baseAvgLbs === 0
      ? 'BW'
      : weightUnit === 'kg'
        ? `${Math.round(lbs * 0.453592)}kg`
        : `${Math.round(lbs)}lb`;

  let dynamicDesc = 'Cardiovascular and muscular endurance stimulus. Keep your breathing rhythmical and pace sustained.';
  if (exCat === 'chest') dynamicDesc = 'Engages the pectoralis major and anterior deltoids. Maintain retracted scapulae and a steady eccentric cadence to maximize tension.';
  else if (exCat === 'back') dynamicDesc = 'Recruits the latissimus dorsi, rhomboids, and mid-trapezius. Drive through your elbows while maintaining neutral spinal alignment.';
  else if (exCat === 'legs') dynamicDesc = 'Activates the quadriceps, hamstrings, and gluteal complex. Anchor through your midfoot and brace your core throughout the movement.';
  else if (exCat === 'shoulders') dynamicDesc = 'Isolates and loads the deltoid heads. Avoid shrugging the traps to isolate tension strictly onto the shoulder joint.';
  else if (exCat === 'arms') dynamicDesc = 'Focuses directly on the biceps and triceps. Keep elbow position fixed and enforce complete contraction at peak flexion.';
  else if (exCat === 'core') dynamicDesc = 'Challenges the abdominal wall and stabilizers. Emphasize deep diaphragmatic bracing without allowing spinal hyperextension.';

  return {
    popPercent,
    popNotches,
    diffLevel,
    difficultyLabel,
    progLevel,
    maleAvgWeight10Reps: fmtAvg(baseAvgLbs),
    femaleAvgWeight10Reps: fmtAvg(Math.round(baseAvgLbs * 0.65)),
    dynamicDesc,
  };
}

function ExerciseInfoBlock({ ex, weightUnit, isDark, colors }: { ex: ExerciseDefinition; weightUnit: 'kg' | 'lb'; isDark: boolean; colors: any }) {
  const details = getExerciseDetails(ex, weightUnit);
  const filledColor = isDark ? '#ffffff' : '#000000';
  const emptyColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const flameColor = isDark ? '#ffffff' : '#000000';

  return (
    <View style={styles.heroExpandedContainer}>
      <View style={[styles.heroExpandedDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />
      <Text style={[styles.heroExerciseDescription, { color: colors.textSecondary }]}>
        {details.dynamicDesc}
      </Text>
      <View style={styles.heroNotchesGrid}>
        <View style={styles.rankingSideBySideRow}>
          <View style={styles.rankingCol}>
            <View style={styles.rankingLabelRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[styles.rankingTitle, { color: colors.text }]}>Difficulty</Text>
                <Ionicons name="barbell-outline" size={13} color={colors.textSecondary} />
              </View>
            </View>
            <View style={styles.notchesBar}>
              {[1, 2, 3].map((lvl) => (
                <View key={`diff_${lvl}`} style={[styles.notchSegment, { backgroundColor: lvl <= details.diffLevel ? filledColor : emptyColor }]} />
              ))}
            </View>
          </View>
          <View style={styles.rankingCol}>
            <View style={styles.rankingLabelRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[styles.rankingTitle, { color: colors.text }]}>Progression</Text>
                <Ionicons name="trending-up" size={13} color={colors.textSecondary} />
              </View>
            </View>
            <View style={styles.notchesBar}>
              {[1, 2, 3].map((lvl) => (
                <View key={`prog_${lvl}`} style={[styles.notchSegment, { backgroundColor: lvl <= details.progLevel ? filledColor : emptyColor }]} />
              ))}
            </View>
          </View>
        </View>
        <View style={styles.rankingSideBySideRow}>
          <View style={styles.rankingCol}>
            <View style={styles.rankingLabelRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[styles.rankingTitle, { color: colors.text }]}>Popularity</Text>
                <Ionicons name="flame" size={13} color={flameColor} />
              </View>
            </View>
            <View style={styles.popularityNotchesWithNumRow}>
              <View style={styles.notchesBarCompact}>
                {[1, 2, 3].map((lvl) => (
                  <View key={`pop_${lvl}`} style={[styles.notchSegmentCompact, { backgroundColor: lvl <= details.popNotches ? filledColor : emptyColor }]} />
                ))}
              </View>
              <Text style={[styles.rankingValueInline, { color: colors.text }]}>{details.popPercent}%</Text>
            </View>
          </View>
          <View style={styles.rankingCol}>
            <View style={styles.rankingLabelRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[styles.rankingTitle, { color: colors.text }]}>Avg 10-Rep</Text>
                <Ionicons name="scale-outline" size={13} color={colors.textSecondary} />
              </View>
            </View>
            <View style={styles.genderWeightsRow}>
              <View style={styles.genderItem}>
                <Ionicons name="male" size={13} color={colors.text} />
                <Text style={[styles.genderWeightText, { color: colors.text }]}>{details.maleAvgWeight10Reps}</Text>
              </View>
              <View style={styles.genderItem}>
                <Ionicons name="female" size={13} color={colors.text} />
                <Text style={[styles.genderWeightText, { color: colors.text }]}>{details.femaleAvgWeight10Reps}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

interface ModalExerciseCheckItemProps {
  ex: ExerciseDefinition;
  isSelected: boolean;
  isExpanded: boolean;
  isLast: boolean;
  weightUnit: 'kg' | 'lb';
  isDark: boolean;
  colors: any;
  onToggle: (ex: ExerciseDefinition) => void;
  onToggleExpand: (id: string) => void;
}

const ModalExerciseCheckItem = React.memo(function ModalExerciseCheckItem({
  ex,
  isSelected,
  isExpanded,
  isLast,
  weightUnit,
  isDark,
  colors,
  onToggle,
  onToggleExpand,
}: ModalExerciseCheckItemProps) {
  const details = getExerciseDetails(ex, weightUnit);
  return (
    <View
      style={[
        styles.modalExerciseItem,
        {
          backgroundColor: isSelected
            ? isDark
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)'
            : 'transparent',
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.modalExerciseRowHeader}
        onPress={() => onToggleExpand(ex.id)}
        activeOpacity={0.75}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          {ex.imageUrl ? (
            <ExerciseDemo imageUrl={ex.imageUrl} name={ex.name} size={40} radius={10} active={isSelected || isExpanded} />
          ) : (
            <Ionicons name="barbell-outline" size={18} color={isSelected ? colors.primary : colors.textMuted} />
          )}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={[styles.modalExName, { color: colors.text }]}>
              {ex.name}
            </Text>
            <Text numberOfLines={1} style={[styles.modalExMeta, { color: colors.textMuted }]}>
              {ex.category.charAt(0).toUpperCase() + ex.category.slice(1)} · {details.difficultyLabel}
              {ex.primaryMuscles ? ` · ${ex.primaryMuscles.join(', ')}` : ''}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={isSelected ? `Remove ${ex.name}` : `Add ${ex.name}`}
            onPress={() => onToggle(ex)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 11,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: isSelected ? colors.primary : (isDark ? 'rgba(255,255,255,0.08)' : '#e4e4e7'),
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isSelected ? 'checkmark' : 'add'}
              size={14}
              color={isSelected ? (isDark ? '#09090b' : '#ffffff') : colors.text}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: isSelected ? (isDark ? '#09090b' : '#ffffff') : colors.text,
              }}
            >
              {isSelected ? 'Added' : 'Add'}
            </Text>
          </TouchableOpacity>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={{ marginTop: 10 }}>
          <View style={styles.modalExInfoRow}>
            {ex.imageUrl && (
              <ExerciseDemo imageUrl={ex.imageUrl} name={ex.name} size={76} radius={12} active controls />
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.exerciseBadgeRow}>
                <View style={[styles.categoryTagPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }]}>
                  <Text style={[styles.categoryTagText, { color: colors.textSecondary }]}>
                    {ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}
                  </Text>
                </View>
                {ex.equipment ? (
                  <View style={[styles.equipmentTagPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }]}>
                    <Ionicons name="barbell-outline" size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={[styles.equipmentTagText, { color: colors.textSecondary }]}>{ex.equipment}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.selectedMuscleSub, { color: colors.textMuted }]}>
                Focus: {ex.primaryMuscles?.join(', ') || ex.category}
              </Text>
            </View>
          </View>
          <ExerciseInfoBlock ex={ex} weightUnit={weightUnit} isDark={isDark} colors={colors} />
        </View>
      )}
    </View>
  );
});

interface RoutineBuilderModalProps {
  visible: boolean;
  saving: boolean;
  editingRoutine: CustomRoutine | null;
  weightUnit: 'kg' | 'lb';
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
  saving,
  editingRoutine,
  weightUnit,
  isDark,
  colors,
  onClose,
  onSave,
  onDelete,
}: RoutineBuilderModalProps) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [category, setCategory] = useState<CustomRoutine['category']>('chest');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dropdownActive, setDropdownActive] = useState<'muscle' | 'difficulty' | 'type' | null>(null);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSearchQuery('');
    setMuscleFilter('all');
    setDifficultyFilter('all');
    setTypeFilter('all');
    setDropdownActive(null);
    setExpandedExerciseId(null);
    if (editingRoutine) {
      setTitle(editingRoutine.title);
      setColor(editingRoutine.color || '#3b82f6');
      setCategory(editingRoutine.category || 'chest');
      setSelectedIds((editingRoutine.exercises || []).map((e) => e.exerciseId));
    } else {
      setTitle('');
      setColor('#3b82f6');
      setCategory('chest');
      setSelectedIds([]);
    }
  }, [visible, editingRoutine]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredModalExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return DEFAULT_EXERCISES.filter((e) => {
      if (q) {
        const matchesName = e.name.toLowerCase().includes(q);
        const matchesCat = e.category.toLowerCase().includes(q);
        const matchesEquip = (e.equipment || '').toLowerCase().includes(q);
        const matchesMuscles = (e.primaryMuscles || []).some((m) => m.toLowerCase().includes(q));
        if (!matchesName && !matchesCat && !matchesEquip && !matchesMuscles) return false;
      }
      if (muscleFilter !== 'all' && e.category !== muscleFilter) return false;
      if (difficultyFilter !== 'all') {
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
        if (diff !== difficultyFilter) return false;
      }
      if (typeFilter !== 'all') {
        const equip = (e.equipment || '').toLowerCase();
        if (typeFilter === 'barbell' && !equip.includes('barbell')) return false;
        if (typeFilter === 'dumbbell' && !equip.includes('dumbbell')) return false;
        if (typeFilter === 'cable' && !equip.includes('cable')) return false;
        if (typeFilter === 'machine' && !equip.includes('machine')) return false;
        if (typeFilter === 'bodyweight' && !equip.includes('body only')) return false;
      }
      return true;
    });
  }, [searchQuery, muscleFilter, difficultyFilter, typeFilter]);

  const handleToggleExercise = useCallback((ex: ExerciseDefinition) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) => {
      if (prev.includes(ex.id)) {
        return prev.filter((id) => id !== ex.id);
      }
      return [...prev, ex.id];
    });
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedExerciseId((prev) => (prev === id ? null : id));
  }, []);

  const renderExerciseItem = useCallback(
    ({ item, index }: { item: ExerciseDefinition; index: number }) => (
      <ModalExerciseCheckItem
        ex={item}
        isSelected={selectedSet.has(item.id)}
        isExpanded={expandedExerciseId === item.id}
        isLast={index === filteredModalExercises.length - 1}
        weightUnit={weightUnit}
        isDark={isDark}
        colors={colors}
        onToggle={handleToggleExercise}
        onToggleExpand={handleToggleExpand}
      />
    ),
    [selectedSet, expandedExerciseId, filteredModalExercises.length, weightUnit, isDark, colors, handleToggleExercise, handleToggleExpand]
  );

  const keyExtractor = useCallback((item: ExerciseDefinition) => item.id, []);

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
            {selectedIds.length} exercise{selectedIds.length === 1 ? '' : 's'} selected
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
      <Text style={[styles.modalSectionLabel, { color: colors.text }]}>
        Accent Color
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

      {/* Exercises Header + Results Count */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={[styles.modalSectionLabel, { color: colors.text, marginBottom: 0 }]}>
          Exercises ({selectedIds.length} selected)
        </Text>
        <Text style={[styles.unitBadge, { color: colors.textMuted }]}>
          {filteredModalExercises.length} found
        </Text>
      </View>

      {/* Search Bar (restored from classic browser) */}
      <View
        style={[
          styles.exerciseSearchBar,
          {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: 10,
            marginBottom: 10,
          },
        ]}
      >
        <Ionicons name="search-outline" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.exerciseSearchInput, { color: colors.text, fontSize: 14 }]}
          placeholder="Search exercises..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* 3 Dropdown Filter Bubbles: Muscle, Difficulty, and Type */}
      <View style={[styles.dropdownBubblesContainer, { marginBottom: 10 }]}>
        <View style={styles.dropdownBubblesRow}>
          <TouchableOpacity
            style={[
              styles.filterDropdownPill,
              {
                backgroundColor: muscleFilter !== 'all' ? colors.primary : colors.card,
                borderColor: muscleFilter !== 'all' || dropdownActive === 'muscle' ? colors.primary : colors.border,
              },
            ]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setDropdownActive((cur) => (cur === 'muscle' ? null : 'muscle'));
            }}
            activeOpacity={0.75}
          >
            <Ionicons
              name="body-outline"
              size={14}
              color={muscleFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted}
            />
            <Text
              style={[
                styles.filterDropdownPillText,
                { color: muscleFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.text },
              ]}
              numberOfLines={1}
            >
              {muscleFilter === 'all' ? 'Muscle' : muscleFilter.charAt(0).toUpperCase() + muscleFilter.slice(1)}
            </Text>
            <Ionicons
              name={dropdownActive === 'muscle' ? 'chevron-up' : 'chevron-down'}
              size={13}
              color={muscleFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterDropdownPill,
              {
                backgroundColor: difficultyFilter !== 'all' ? colors.primary : colors.card,
                borderColor: difficultyFilter !== 'all' || dropdownActive === 'difficulty' ? colors.primary : colors.border,
              },
            ]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setDropdownActive((cur) => (cur === 'difficulty' ? null : 'difficulty'));
            }}
            activeOpacity={0.75}
          >
            <Ionicons
              name="barbell-outline"
              size={14}
              color={difficultyFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted}
            />
            <Text
              style={[
                styles.filterDropdownPillText,
                { color: difficultyFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.text },
              ]}
              numberOfLines={1}
            >
              {difficultyFilter === 'all' ? 'Level' : difficultyFilter.charAt(0).toUpperCase() + difficultyFilter.slice(1)}
            </Text>
            <Ionicons
              name={dropdownActive === 'difficulty' ? 'chevron-up' : 'chevron-down'}
              size={13}
              color={difficultyFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterDropdownPill,
              {
                backgroundColor: typeFilter !== 'all' ? colors.primary : colors.card,
                borderColor: typeFilter !== 'all' || dropdownActive === 'type' ? colors.primary : colors.border,
              },
            ]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setDropdownActive((cur) => (cur === 'type' ? null : 'type'));
            }}
            activeOpacity={0.75}
          >
            <Ionicons
              name="hardware-chip-outline"
              size={14}
              color={typeFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted}
            />
            <Text
              style={[
                styles.filterDropdownPillText,
                { color: typeFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.text },
              ]}
              numberOfLines={1}
            >
              {typeFilter === 'all' ? 'Type' : typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
            </Text>
            <Ionicons
              name={dropdownActive === 'type' ? 'chevron-up' : 'chevron-down'}
              size={13}
              color={typeFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        {dropdownActive && (
          <View style={[styles.filterDropdownDrawer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {dropdownActive === 'muscle' && (
              <View style={styles.dropdownOptionsGrid}>
                {[
                  { id: 'all', label: 'All Muscles' },
                  { id: 'chest', label: 'Chest' },
                  { id: 'back', label: 'Back' },
                  { id: 'legs', label: 'Legs' },
                  { id: 'shoulders', label: 'Shoulders' },
                  { id: 'arms', label: 'Arms' },
                  { id: 'core', label: 'Core' },
                  { id: 'cardio', label: 'Cardio' },
                ].map((opt) => {
                  const isChosen = muscleFilter === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.dropdownOptionChip,
                        { backgroundColor: isChosen ? colors.primary : colors.surfaceSecondary },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setMuscleFilter(opt.id);
                        setDropdownActive(null);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.dropdownOptionChipText, { color: isChosen ? (isDark ? '#09090b' : '#ffffff') : colors.text }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {dropdownActive === 'difficulty' && (
              <View style={styles.dropdownOptionsGrid}>
                {[
                  { id: 'all', label: 'All Levels' },
                  { id: 'beginner', label: 'Beginner' },
                  { id: 'intermediate', label: 'Intermediate' },
                  { id: 'advanced', label: 'Advanced' },
                ].map((opt) => {
                  const isChosen = difficultyFilter === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.dropdownOptionChip,
                        { backgroundColor: isChosen ? colors.primary : colors.surfaceSecondary },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setDifficultyFilter(opt.id);
                        setDropdownActive(null);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.dropdownOptionChipText, { color: isChosen ? (isDark ? '#09090b' : '#ffffff') : colors.text }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {dropdownActive === 'type' && (
              <View style={styles.dropdownOptionsGrid}>
                {[
                  { id: 'all', label: 'All Types' },
                  { id: 'barbell', label: 'Barbell' },
                  { id: 'dumbbell', label: 'Dumbbell' },
                  { id: 'cable', label: 'Cable' },
                  { id: 'machine', label: 'Machine' },
                  { id: 'bodyweight', label: 'Bodyweight' },
                ].map((opt) => {
                  const isChosen = typeFilter === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.dropdownOptionChip,
                        { backgroundColor: isChosen ? colors.primary : colors.surfaceSecondary },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setTypeFilter(opt.id);
                        setDropdownActive(null);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.dropdownOptionChipText, { color: isChosen ? (isDark ? '#09090b' : '#ffffff') : colors.text }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>

      <View
        style={[
          styles.modalConnectedListWrap,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <FlatList
          data={visible ? filteredModalExercises : []}
          keyExtractor={keyExtractor}
          renderItem={renderExerciseItem}
          extraData={{ expandedExerciseId, selectedIds }}
          style={styles.modalExerciseList}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          keyboardShouldPersistTaps="handled"
        />
      </View>

      {/* Action Buttons: Save & Optional Delete */}
      <View style={styles.modalActionsRow}>
        {editingRoutine && (
          <TouchableOpacity
            style={[styles.deleteRoutineBtn, { borderColor: '#ef4444' }]}
            disabled={saving}
            onPress={() => onDelete(editingRoutine.id)}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          disabled={saving || selectedIds.length === 0}
          style={[styles.saveRoutineBtn, { backgroundColor: color, opacity: saving || selectedIds.length === 0 ? .5 : 1 }]}
          onPress={() =>
            onSave({
              title,
              color,
              category: DEFAULT_EXERCISES.find(exercise => exercise.id === selectedIds[0])?.category ?? category,
              selectedIds,
            })
          }
        >
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={styles.saveRoutineBtnText}>{saving ? 'Saving...' : 'Save Workout Day'}</Text>
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
  const [showLegacyLogModal, setShowLegacyLogModal] = useState(false);
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
  const [savingRoutine, setSavingRoutine] = useState(false);
  const routineWriteLock = useRef(false);
  const routineRevision = useRef(0);
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

  const [activeRoutinePage, setActiveRoutinePage] = useState<number>(0);
  // Chunk routines and append a "New Day" card as the last option (exactly like the add friend circle in community)
  type RoutineSliderItem =
    | { type: 'routine'; data: CustomRoutine }
    | { type: 'new_day' };

  const routinePages = useMemo(() => {
    const items: RoutineSliderItem[] = [{ type: 'new_day' }, ...routines.map((r): RoutineSliderItem => ({ type: 'routine', data: r }))];

    const pages: RoutineSliderItem[][] = [];
    for (let i = 0; i < items.length; i += ROUTINE_CARDS_PER_PAGE) {
      pages.push(items.slice(i, i + ROUTINE_CARDS_PER_PAGE));
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
    const revision = routineRevision.current;
    const [logs, loadedRoutines, loadedOverrides] = await Promise.all([
      loadWorkoutLogs(userId),
      loadCustomRoutines(userId),
      loadManualMuscleSoreness(userId),
    ]);
    setAllLogs(logs);
    if (revision === routineRevision.current) setRoutines(loadedRoutines);
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
    setSelectedExIdsForRoutine([]);
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

      if (routineWriteLock.current) return;
      routineWriteLock.current = true; setSavingRoutine(true); routineRevision.current++;
      try {
        const newRoutine = buildWorkoutRoutine({
          id: `routine_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, title, color, category, selectedIds,
        }, DEFAULT_EXERCISES, editingRoutine);
        const updated = editingRoutine
          ? routines.map(routine => routine.id === editingRoutine.id ? newRoutine : routine)
          : [...routines, newRoutine];
        await saveCustomRoutines(userId, updated);
        setRoutines(updated);
        if (activeSessionRoutine?.id === newRoutine.id) setActiveSessionRoutine(newRoutine);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setRoutineModalVisible(false);
      } catch (error) {
        Alert.alert('Workout day not saved', error instanceof Error ? error.message : 'Please try again. Your selections are still here.');
      } finally { routineWriteLock.current = false; setSavingRoutine(false); }
    },
    [activeSessionRoutine, editingRoutine, newRoutineCategory, newRoutineColor, newRoutineTitle, routines, selectedExIdsForRoutine, userId]
  );
  const handleDeleteRoutine = useCallback(
    async (routineId: string) => {
      if (routineWriteLock.current) return;
      routineWriteLock.current = true; setSavingRoutine(true); routineRevision.current++;
      try {
        const updated = routines.filter(routine => routine.id !== routineId);
        await saveCustomRoutines(userId, updated);
        setRoutines(updated);
        if (activeSessionRoutine?.id === routineId) setActiveSessionRoutine(null);
        setRoutineModalVisible(false);
      } catch (error) {
        Alert.alert('Workout day not deleted', error instanceof Error ? error.message : 'Please try again.');
      } finally { routineWriteLock.current = false; setSavingRoutine(false); }
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

  const cameraTrackerModal = useMemo(() => (
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
  ), [showCameraTracker, effectiveWeightUnit, userId, loadData, undoTimer]);

  const sorenessModal = useMemo(() => (
    <MuscleSorenessModal
        visible={showMuscleRecoveryModal}
        onClose={() => setShowMuscleRecoveryModal(false)}
        recoveryMap={recoveryMap}
        selectedMuscle={selectedMuscle}
        onSelectMuscle={(m) => setSelectedMuscle(m)}
        onSetMuscleRecovery={handleSetMuscleRecovery}
      />
  ), [showMuscleRecoveryModal, recoveryMap, selectedMuscle, manualMuscleOverrides, userId]);

  const bodyFatModal = useMemo(() => (
    <BodyFatScannerModal
        visible={showBodyFatModal}
        onClose={() => setShowBodyFatModal(false)}
        userId={userId}
        profile={profile}
        onScanSaved={() => {
          loadData();
        }}
      />
  ), [showBodyFatModal, userId, profile, loadData]);

  return (
    <ExerciseDemoProvider paused={routineModalVisible || showCameraTracker || showMuscleRecoveryModal || showBodyFatModal}>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TutorialScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header matching modern aesthetic */}
        <View style={[styles.header, { paddingTop: screenInsets.top + 16 }]}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Fitness Log</Text>
        </View>

        {/* ── 3 SEPARATE QUICK ACTION BUTTONS ── */}
        <TutorialAnchor tutorialId="fitness-tools" accessibilityLabel="Fitness tools" style={styles.quickActionButtonsRow}>
          {([
            { id: 'aiForm', color: '#10b981', label: 'AI Form', icon: 'videocam', open: () => setShowCameraTracker(true) },
            { id: 'bodyFat', color: '#a855f7', label: 'Body Fat', icon: 'scan-circle', open: () => setShowBodyFatModal(true) },
            { id: 'soreness', color: '#f97316', label: 'Soreness', icon: 'fitness', open: () => setShowMuscleRecoveryModal(true) },
          ] as const).map(tool => (
            <TouchableOpacity
              key={tool.id}
              accessibilityRole="button"
              style={[styles.quickActionTile, { backgroundColor: colors.surfaceElevated }]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                tool.open();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name={tool.icon} size={19} color={tool.color} />
              <Text style={[styles.quickActionTitle, { color: colors.text }]} numberOfLines={1}>
                {tool.label}
              </Text>
            </TouchableOpacity>
          ))}
        </TutorialAnchor>

        {/* Individual Exercise Log Button (opens legacy individual logger) */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Individual Log"
          style={[
            styles.individualLogBtn,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setShowLegacyLogModal(true);
          }}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="barbell-outline" size={18} color={colors.primary} />
            <Text style={[styles.quickActionTitle, { color: colors.text, fontSize: 13.5 }]}>
              Individual Log
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* ── SECTION 0: CUSTOM WORKOUT DAY PRESETS / ROUTINES (SLIDER: 2 LARGER CARDS AT ONCE) ── */}
        <TutorialAnchor tutorialId="workout-days"><Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 6, marginBottom: 10 }}>Workout days</Text>
        <ScrollView
          horizontal
          pagingEnabled={false}
          snapToInterval={ROUTINE_PAGE_SNAP_INTERVAL}
          snapToAlignment="start"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.routinesSliderTrack}
          onMomentumScrollEnd={(e) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const pageIndex = Math.min(
              routinePageCount - 1,
              Math.max(0, Math.round(offsetX / ROUTINE_PAGE_SNAP_INTERVAL))
            );
            setActiveRoutinePage(pageIndex);
          }}
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
                          borderColor: colors.primary,
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
                          <Ionicons name="add" size={23} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.routinePillTitle,
                              { color: colors.primary },
                            ]}
                            numberOfLines={2}
                          >
                            New workout
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
                          numberOfLines={2}
                        >
                          {routine.title}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.routinePillSub,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={2}
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

        </TutorialAnchor>
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
        <WorkoutRankProgress userId={userId} logIds={lastLoggedIds} weightUnit={effectiveWeightUnit} />
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
      </TutorialScrollView>

      {/* Custom Routine / Workout Day Creation Modal */}
      <RoutineBuilderModal
        visible={routineModalVisible}
        saving={savingRoutine}
        editingRoutine={editingRoutine}
        weightUnit={effectiveWeightUnit}
        isDark={isDark}
        colors={colors}
        onClose={() => { if (!routineWriteLock.current) setRoutineModalVisible(false); }}
        onSave={handleSaveCustomRoutine}
        onDelete={handleDeleteRoutine}
      />

      {/* Legacy Individual Exercise Logging Modal */}
      <Modal visible={showLegacyLogModal} animationType="slide" onRequestClose={() => setShowLegacyLogModal(false)}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { paddingTop: screenInsets.top + 16, paddingHorizontal: 16, marginBottom: 8 }]}>
            <Text style={[styles.screenTitle, { color: colors.text, fontSize: 22 }]}>Individual Log</Text>
            <TouchableOpacity
              onPress={() => setShowLegacyLogModal(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Change exercise"
              accessibilityState={{ expanded: exerciseBrowserExpanded }}
              onPress={() => {
                if (exerciseBrowserExpanded) Keyboard.dismiss();
                setExerciseBrowserExpanded((value) => !value);
                Haptics.selectionAsync().catch(() => {});
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, marginBottom: 12, backgroundColor: colors.surfaceElevated }}
            >
              <Ionicons name="search-outline" size={17} color={colors.primary} />
              <Text style={{ flex: 1, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontSize: 13, color: colors.text }}>Change exercise</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted }}>{exerciseBrowserExpanded ? 'Close' : 'Browse'}</Text>
              <Ionicons name={exerciseBrowserExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {exerciseBrowserExpanded && (
              <View>
                <View style={styles.resultsCountOnlyRow}>
                  <Text style={[styles.unitBadge, { color: colors.textMuted }]}>{filteredExercises.length} found</Text>
                </View>

                <View style={[styles.exerciseSearchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e9e9eb' }]}>
                  <Ionicons name="search" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.exerciseSearchInput, { color: colors.text }]}
                    placeholder="Search exercises"
                    placeholderTextColor={colors.textMuted}
                    value={exerciseSearchQuery}
                    onChangeText={(text) => setExerciseSearchQuery(text)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                  />
                  {exerciseSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setExerciseSearchQuery('')} style={{ padding: 4 }} activeOpacity={0.7}>
                      <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.dropdownBubblesContainer}>
                  <View style={styles.dropdownBubblesRow}>
                    <TouchableOpacity
                      style={[
                        styles.filterDropdownPill,
                        {
                          backgroundColor: selectedMuscleFilter !== 'all' ? colors.primary : colors.surfaceElevated,
                          borderColor: selectedMuscleFilter !== 'all' || activeDropdown === 'muscle' ? colors.primary : colors.surfaceSecondary,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setActiveDropdown((cur) => (cur === 'muscle' ? null : 'muscle'));
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="body-outline" size={14} color={selectedMuscleFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted} />
                      <Text style={[styles.filterDropdownPillText, { color: selectedMuscleFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.text }]} numberOfLines={1}>
                        {selectedMuscleFilter === 'all' ? 'Muscle' : selectedMuscleFilter.charAt(0).toUpperCase() + selectedMuscleFilter.slice(1)}
                      </Text>
                      <Ionicons name={activeDropdown === 'muscle' ? 'chevron-up' : 'chevron-down'} size={13} color={selectedMuscleFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.filterDropdownPill,
                        {
                          backgroundColor: selectedDifficultyFilter !== 'all' ? colors.primary : colors.surfaceElevated,
                          borderColor: selectedDifficultyFilter !== 'all' || activeDropdown === 'difficulty' ? colors.primary : colors.surfaceSecondary,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setActiveDropdown((cur) => (cur === 'difficulty' ? null : 'difficulty'));
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="barbell-outline" size={14} color={selectedDifficultyFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted} />
                      <Text style={[styles.filterDropdownPillText, { color: selectedDifficultyFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.text }]} numberOfLines={1}>
                        {selectedDifficultyFilter === 'all' ? 'Difficulty' : selectedDifficultyFilter.charAt(0).toUpperCase() + selectedDifficultyFilter.slice(1)}
                      </Text>
                      <Ionicons name={activeDropdown === 'difficulty' ? 'chevron-up' : 'chevron-down'} size={13} color={selectedDifficultyFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.filterDropdownPill,
                        {
                          backgroundColor: selectedTypeFilter !== 'all' ? colors.primary : colors.surfaceElevated,
                          borderColor: selectedTypeFilter !== 'all' || activeDropdown === 'type' ? colors.primary : colors.surfaceSecondary,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setActiveDropdown((cur) => (cur === 'type' ? null : 'type'));
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="hardware-chip-outline" size={14} color={selectedTypeFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted} />
                      <Text style={[styles.filterDropdownPillText, { color: selectedTypeFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.text }]} numberOfLines={1}>
                        {selectedTypeFilter === 'all' ? 'Type' : selectedTypeFilter.charAt(0).toUpperCase() + selectedTypeFilter.slice(1)}
                      </Text>
                      <Ionicons name={activeDropdown === 'type' ? 'chevron-up' : 'chevron-down'} size={13} color={selectedTypeFilter !== 'all' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {activeDropdown && (
                    <View style={[styles.filterDropdownDrawer, { backgroundColor: colors.surfaceElevated, borderColor: colors.surfaceSecondary }]}>
                      {activeDropdown === 'muscle' && (
                        <View style={styles.dropdownOptionsGrid}>
                          {[
                            { id: 'all', label: 'All Muscles' },
                            { id: 'chest', label: 'Chest' },
                            { id: 'back', label: 'Back' },
                            { id: 'legs', label: 'Legs' },
                            { id: 'shoulders', label: 'Shoulders' },
                            { id: 'arms', label: 'Arms' },
                            { id: 'cardio', label: 'Cardio' },
                          ].map((opt) => {
                            const isChosen = selectedMuscleFilter === opt.id;
                            return (
                              <TouchableOpacity
                                key={opt.id}
                                style={[styles.dropdownOptionChip, { backgroundColor: isChosen ? colors.primary : colors.surfaceSecondary }]}
                                onPress={() => {
                                  Haptics.selectionAsync().catch(() => {});
                                  setSelectedMuscleFilter(opt.id);
                                  setActiveDropdown(null);
                                }}
                                activeOpacity={0.75}
                              >
                                <Text style={[styles.dropdownOptionChipText, { color: isChosen ? (isDark ? '#09090b' : '#ffffff') : colors.text }]}>{opt.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      {activeDropdown === 'difficulty' && (
                        <View style={styles.dropdownOptionsGrid}>
                          {[
                            { id: 'all', label: 'All Levels' },
                            { id: 'beginner', label: 'Beginner' },
                            { id: 'intermediate', label: 'Intermediate' },
                            { id: 'advanced', label: 'Advanced' },
                          ].map((opt) => {
                            const isChosen = selectedDifficultyFilter === opt.id;
                            return (
                              <TouchableOpacity
                                key={opt.id}
                                style={[styles.dropdownOptionChip, { backgroundColor: isChosen ? colors.primary : colors.surfaceSecondary }]}
                                onPress={() => {
                                  Haptics.selectionAsync().catch(() => {});
                                  setSelectedDifficultyFilter(opt.id);
                                  setActiveDropdown(null);
                                }}
                                activeOpacity={0.75}
                              >
                                <Text style={[styles.dropdownOptionChipText, { color: isChosen ? (isDark ? '#09090b' : '#ffffff') : colors.text }]}>{opt.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      {activeDropdown === 'type' && (
                        <View style={styles.dropdownOptionsGrid}>
                          {[
                            { id: 'all', label: 'All Types' },
                            { id: 'barbell', label: 'Barbell' },
                            { id: 'dumbbell', label: 'Dumbbell' },
                            { id: 'cable', label: 'Cable' },
                            { id: 'machine', label: 'Machine' },
                            { id: 'bodyweight', label: 'Bodyweight' },
                          ].map((opt) => {
                            const isChosen = selectedTypeFilter === opt.id;
                            return (
                              <TouchableOpacity
                                key={opt.id}
                                style={[styles.dropdownOptionChip, { backgroundColor: isChosen ? colors.primary : colors.surfaceSecondary }]}
                                onPress={() => {
                                  Haptics.selectionAsync().catch(() => {});
                                  setSelectedTypeFilter(opt.id);
                                  setActiveDropdown(null);
                                }}
                                activeOpacity={0.75}
                              >
                                <Text style={[styles.dropdownOptionChipText, { color: isChosen ? (isDark ? '#09090b' : '#ffffff') : colors.text }]}>{opt.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                <View style={[styles.exerciseResultsCard, { backgroundColor: colors.surfaceElevated }]}>
                  {filteredExercises.length === 0 ? (
                    <View style={styles.noExercisesFoundBox}>
                      <Ionicons name="search-outline" size={24} color={colors.textMuted} style={{ marginBottom: 6 }} />
                      <Text style={[styles.noExercisesFoundText, { color: colors.textMuted }]}>
                        No exercises matching "{exerciseSearchQuery}"
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={styles.exerciseResultsScroll} nestedScrollEnabled showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                      {filteredExercises.slice(0, 50).map((item, index) => (
                        <ExerciseRowItem
                          key={item.id}
                          item={item}
                          isSelected={selectedExercise.id === item.id}
                          isLast={index === filteredExercises.length - 1}
                          isDark={isDark}
                          primaryColor={colors.primary}
                          textColor={colors.text}
                          textMutedColor={colors.textMuted}
                          onSelect={handleSelectExercise}
                          onExpandHero={handleExpandHeroForExercise}
                        />
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>
            )}

            {/* Selected Exercise Hero Card with Old Expandable Info */}
            <View style={[styles.logInputCard, { backgroundColor: colors.surfaceElevated, marginBottom: 14 }]}>
              <TouchableOpacity
                style={styles.stickmanHeroHeaderTap}
                onPress={() => toggleHeroExpanded()}
                activeOpacity={0.85}
              >
                <View style={styles.stickmanHeroContent}>
                  {selectedExercise.imageUrl ? (
                    <View style={[styles.stickmanVisualWrap, { backgroundColor: isDark ? '#141417' : '#f1f5f9' }]}>
                      <ExerciseDemo imageUrl={selectedExercise.imageUrl} name={selectedExercise.name} size={96} controls />
                    </View>
                  ) : null}
                  <View style={styles.stickmanInfoCol}>
                    <Text style={[styles.stickmanExerciseTitle, { color: colors.text }]}>
                      {selectedExercise.name}
                    </Text>
                    <View style={styles.exerciseBadgeRow}>
                      <View style={[styles.categoryTagPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }]}>
                        <Text style={[styles.categoryTagText, { color: colors.textSecondary }]}>
                          {selectedExercise.category.charAt(0).toUpperCase() + selectedExercise.category.slice(1).toLowerCase()}
                        </Text>
                      </View>
                      {selectedExercise.equipment ? (
                        <View style={[styles.equipmentTagPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }]}>
                          <Ionicons name="barbell-outline" size={13} color={colors.textSecondary} style={{ marginRight: 5 }} />
                          <Text style={[styles.equipmentTagText, { color: colors.textSecondary }]}>
                            {selectedExercise.equipment}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.selectedMuscleSub, { color: colors.textMuted }]}>
                      Focus: {selectedExercise.primaryMuscles?.join(', ') || selectedExercise.category}
                    </Text>
                  </View>
                  <View style={[styles.heroChevronBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                    <Ionicons name={isHeroExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                  </View>
                </View>
              </TouchableOpacity>
              {isHeroExpanded && (
                <ExerciseInfoBlock ex={selectedExercise} weightUnit={effectiveWeightUnit} isDark={isDark} colors={colors} />
              )}
            </View>

            <View style={[styles.logInputCard, { backgroundColor: colors.surfaceElevated }]}>
              <View style={styles.logCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.selectedTitle, { color: colors.text }]}>{selectedExercise.name}</Text>
                </View>
                <TouchableOpacity onPress={addExerciseSetRow} style={[styles.addSetHeaderBtn, { backgroundColor: colors.surfaceSecondary || colors.card }]} activeOpacity={0.7}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={[styles.addSetHeaderBtnText, { color: colors.primary }]}>Add Set</Text>
                </TouchableOpacity>
              </View>

              <View style={{ gap: 12, marginBottom: 14 }}>
                {(() => {
                  let runningNum = 1;
                  return exerciseSets.map((sItem, sIndex) => {
                    const mult = sItem.multiplier || 1;
                    const startNum = runningNum;
                    const endNum = runningNum + mult - 1;
                    runningNum += mult;
                    const setLabel = mult > 1 ? `SETS ${startNum}-${endNum}` : `SET ${startNum}`;
                    const rNum = parseInt(sItem.reps, 10) || 0;
                    const wNum = parseFloat(sItem.weight) || 0;
                    const sRepsDiff = rNum - prevReps;
                    const sWeightDiff = wNum - prevWeight;

                    return (
                      <View key={sItem.id} style={[styles.logScreenSetCard, { backgroundColor: colors.card }]}>
                        <View style={styles.logScreenSetTopRow}>
                          <Text style={[styles.logScreenSetIndexLabel, { color: colors.textSecondary }]}>{setLabel}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TouchableOpacity
                              style={[
                                styles.multiplierCircle,
                                {
                                  backgroundColor: sItem.multiplier > 1 ? colors.primary : isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                                  borderColor: sItem.multiplier > 1 ? colors.primary : isDark ? 'rgba(255,255,255,0.12)' : '#cbd5e1',
                                },
                              ]}
                              onPress={() => cycleSetMultiplier(sIndex)}
                              activeOpacity={0.75}
                              accessibilityLabel={`Multiplier ${sItem.multiplier}x`}
                            >
                              {(() => {
                                const iconColor = sItem.multiplier > 1 ? (isDark ? '#000000' : '#ffffff') : (isDark ? '#cbd5e1' : '#64748b');
                                return (
                                  <View style={styles.multiplierIconStack}>
                                    <Svg width={28} height={28} viewBox="0 0 28 28">
                                      <SvgPath d="M14 3.5 A 10.5 10.5 0 0 1 24.5 14" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" />
                                      <SvgPath d="M21.5 14 L24.5 14 L24.5 11" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      <SvgPath d="M14 24.5 A 10.5 10.5 0 0 1 3.5 14" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" />
                                      <SvgPath d="M6.5 14 L3.5 14 L3.5 17" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      <SvgText x="14" y="17.5" fontSize="9.5" fontWeight="800" fill={iconColor} textAnchor="middle">{sItem.multiplier}</SvgText>
                                    </Svg>
                                  </View>
                                );
                              })()}
                            </TouchableOpacity>

                            {exerciseSets.length > 1 && (
                              <TouchableOpacity onPress={() => removeExerciseSetRow(sIndex)} style={styles.deleteSetBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>

                        <View style={styles.inputsRow}>
                          <View style={styles.inputCol}>
                            <View style={styles.inputLabelHeaderRow}>
                              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>REPS</Text>
                              {sRepsDiff > 0 && (
                                <View style={[styles.increaseFilledBadge, { backgroundColor: colors.primary }]}>
                                  <Text style={[styles.increaseTriangleGlyph, { color: isDark ? '#09090b' : '#ffffff' }]}>▲</Text>
                                  <Text style={[styles.increaseAmountText, { color: isDark ? '#09090b' : '#ffffff' }]}>+{sRepsDiff}</Text>
                                </View>
                              )}
                              {sRepsDiff < 0 && (
                                <View style={[styles.decreaseFilledBadge, { backgroundColor: '#ef4444' }]}>
                                  <Text style={styles.decreaseTriangleGlyph}>▼</Text>
                                  <Text style={styles.decreaseAmountText}>{sRepsDiff}</Text>
                                </View>
                              )}
                            </View>
                            <View style={[styles.numberBox, { backgroundColor: colors.surfaceElevated }]}>
                              <TouchableOpacity style={styles.stepBtn} onPress={() => updateSetReps(sIndex, -1)} activeOpacity={0.7}>
                                <Ionicons name="remove" size={18} color={colors.text} />
                              </TouchableOpacity>
                              <TextInput
                                style={[styles.numericInput, { color: colors.text }]}
                                keyboardType="numeric"
                                value={sItem.reps}
                                onChangeText={(txt) => setDirectSetReps(sIndex, txt)}
                                selectTextOnFocus
                              />
                              <TouchableOpacity style={styles.stepBtn} onPress={() => updateSetReps(sIndex, 1)} activeOpacity={0.7}>
                                <Ionicons name="add" size={18} color={colors.text} />
                              </TouchableOpacity>
                            </View>
                          </View>

                          <View style={styles.inputCol}>
                            <View style={styles.inputLabelHeaderRow}>
                              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>WEIGHT ({effectiveWeightUnit})</Text>
                              {sWeightDiff > 0 && (
                                <View style={[styles.increaseFilledBadge, { backgroundColor: colors.primary }]}>
                                  <Text style={[styles.increaseTriangleGlyph, { color: isDark ? '#09090b' : '#ffffff' }]}>▲</Text>
                                  <Text style={[styles.increaseAmountText, { color: isDark ? '#09090b' : '#ffffff' }]}>+{sWeightDiff}</Text>
                                </View>
                              )}
                              {sWeightDiff < 0 && (
                                <View style={[styles.decreaseFilledBadge, { backgroundColor: '#ef4444' }]}>
                                  <Text style={styles.decreaseTriangleGlyph}>▼</Text>
                                  <Text style={styles.decreaseAmountText}>{sWeightDiff}</Text>
                                </View>
                              )}
                            </View>
                            <View style={[styles.numberBox, { backgroundColor: colors.surfaceElevated }]}>
                              <TouchableOpacity style={styles.stepBtn} onPress={() => updateSetWeight(sIndex, -5)} activeOpacity={0.7}>
                                <Ionicons name="remove" size={18} color={colors.text} />
                              </TouchableOpacity>
                              <TextInput
                                style={[styles.numericInput, { color: colors.text }]}
                                keyboardType="numeric"
                                value={sItem.weight}
                                onChangeText={(txt) => setDirectSetWeight(sIndex, txt)}
                                selectTextOnFocus
                              />
                              <TouchableOpacity style={styles.stepBtn} onPress={() => updateSetWeight(sIndex, 5)} activeOpacity={0.7}>
                                <Ionicons name="add" size={18} color={colors.text} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>

                        <View style={styles.quickWeightRow}>
                          {[-10, -5, +5, +10, +25].map((delta) => (
                            <TouchableOpacity
                              key={delta}
                              style={[styles.quickWeightPill, { backgroundColor: colors.surfaceElevated }]}
                              onPress={() => updateSetWeight(sIndex, delta)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.quickWeightText, { color: colors.textSecondary }]}>
                                {delta > 0 ? `+${delta}` : delta}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    );
                  });
                })()}
              </View>

              <View style={[styles.notesWrapper, { backgroundColor: colors.card }]}>
                <TextInput
                  style={[styles.notesInput, { color: colors.text }]}
                  placeholder="Notes / form observations (optional)"
                  placeholderTextColor={colors.textMuted}
                  value={notesInput}
                  onChangeText={setNotesInput}
                />
              </View>

              {(() => {
                const totalSetsToLog = exerciseSets.reduce((acc, s) => acc + (s.multiplier || 1), 0);
                const btnBg = logSuccessFill.interpolate({
                  inputRange: [0, 1],
                  outputRange: [colors.primary, '#10b981'],
                });
                return (
                  <Animated.View style={{ transform: [{ scale: logButtonScale }] }}>
                    <TouchableOpacity
                      onPress={handleLogWorkout}
                      accessibilityRole="button"
                      accessibilityLabel={loggedSuccess ? `Logged ${totalSetsToLog} set${totalSetsToLog === 1 ? '' : 's'} for ${selectedExercise.name}` : `Log ${totalSetsToLog} set${totalSetsToLog === 1 ? '' : 's'} for ${selectedExercise.name}`}
                      activeOpacity={0.85}
                    >
                      <Animated.View style={[styles.logSubmitBtn, { backgroundColor: btnBg }]}>
                        <Animated.View style={{ transform: [{ scale: logCheckScale }] }}>
                          <Ionicons
                            name={loggedSuccess ? 'checkmark-circle' : 'checkmark-done'}
                            size={loggedSuccess ? 22 : 20}
                            color={isDark ? '#09090b' : '#ffffff'}
                          />
                        </Animated.View>
                        <View style={{ flexShrink: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.logSubmitBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                            {loggedSuccess ? `Logged ${totalSetsToLog} Set${totalSetsToLog > 1 ? 's' : ''}!` : `Log ${totalSetsToLog} Set${totalSetsToLog > 1 ? 's' : ''}`}
                          </Text>
                        </View>
                      </Animated.View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })()}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* AI Camera Form Tracker Modal (in Fitness / Workouts Tab) */}
      {cameraTrackerModal}

      {/* Standalone Muscle Soreness & Recovery Modal */}
      {sorenessModal}

      {/* Standalone Body Fat % Scanner Modal */}
      {bodyFatModal}


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
    gap: ROUTINE_CARD_GAP,
    marginBottom: 10,
  },
  quickActionTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 16,
    gap: 7,
    height: 52,
  },
  quickActionTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
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
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 8,
    height: 80.75,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  routinePillSub: {
    fontSize: 12,
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
    justifyContent: 'center',
    paddingVertical: 14,
  },
  routineThreeDotsBtn: {
    padding: 8,
    minWidth: 44,
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
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.1,
    marginBottom: 8,
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
  modalFilterChipsScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  modalFilterChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  modalFilterChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  modalFilterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  modalConnectedListWrap: {
    maxHeight: 280,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
  },
  modalExerciseList: {
    flexGrow: 0,
  },
  modalExerciseItem: {
    padding: 12,
  },
  individualLogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  modalExerciseRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  modalExExpandedPanel: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  modalExInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalExInfoLine: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  modalExAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalExName: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
  },
  modalExMeta: {
    fontSize: 12,
    lineHeight: 15,
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


