import { DEFAULT_REST_SECONDS, MAX_REST_SECONDS, REST_PRESETS, formatRestInterval, loadRestInterval, normalizeRestSeconds, saveRestInterval } from '@/constants/workoutRest';
import { completedWorkoutEntries } from '@/constants/workoutSessionLogging';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { AppModal as Modal } from '@/components/AppModal';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Path as SvgPath, Text as SvgText } from 'react-native-svg';
import { useTheme, BRAND_ROUNDED_FONT, BRAND_ROUNDED_FONT_EXTRA } from '@/constants/ThemeContext';
import {
  CustomRoutine,
  DEFAULT_EXERCISES,
  ExerciseDefinition,
  saveWorkoutLogBatch,
  WorkoutLogEntry,
} from '@/constants/workoutStorage';

interface WorkoutSessionModalProps {
  visible: boolean;
  embedded?: boolean;
  routine: CustomRoutine | null;
  allLogs: WorkoutLogEntry[];
  userId: string;
  weightUnit: 'kg' | 'lb';
  onClose: () => void;
  onFinishSession: (loggedCount: number, ids: string[]) => void;
}

interface ExerciseSetRow {
  id: string;
  reps: number;
  weight: number;
  multiplier: number; // 1, 2, 3, 4
  completed: boolean;
}

interface ActiveExerciseState {
  exerciseId: string;
  name: string;
  category: string;
  imageUrl?: string;
  targetMuscles?: string[];
  sets: ExerciseSetRow[];
}

function SessionSurface({ embedded, visible, onClose, children }: {
  embedded: boolean; visible: boolean; onClose: () => void; children: React.ReactNode;
}) {
  return embedded ? <View>{children}</View> : <Modal visible={visible} animationType="slide"
    presentationStyle="pageSheet" onRequestClose={onClose}>{children}</Modal>;
}


export const RestCountdown = React.memo(function RestCountdown({ endAt, onFinish, color }: {
  endAt: number; onFinish: () => void; color: string;
}) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((endAt-Date.now())/1000)));
  useEffect(() => {
    let finished = false;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endAt-Date.now())/1000));
      setSeconds(remaining);
      if (!remaining && !finished) {
        finished = true; onFinish();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endAt, onFinish]);
  return <Text testID="rest-countdown" style={[styles.restTimerText, { color }]}>{seconds}s</Text>;
});

const SessionClock = React.memo(function SessionClock({ running, session, clock }: {
  running: boolean; session: CustomRoutine | null; clock: React.MutableRefObject<number>;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    clock.current = 0; setSeconds(0);
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => { const value = Math.floor((Date.now() - started) / 1000); clock.current = value; setSeconds(value); }, 1000);
    return () => clearInterval(timer);
  }, [running, session, clock]);
  return <Text style={styles.islandTimerText}>{`${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}</Text>;
});


const SessionExerciseCard = React.memo(function SessionExerciseCard({item, exIndex, colors, isDark, weightUnit, visible, showAddExerciseModal, isFinishing, setDirectReps, setDirectWeight, adjustReps, adjustWeight, cycleMultiplier, addSetRow, removeSetRow, toggleComplete}: {
  item: ActiveExerciseState; exIndex: number; colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean; weightUnit: 'kg' | 'lb'; visible: boolean; showAddExerciseModal: boolean; isFinishing: boolean;
  setDirectReps: (exercise: number, set: number, value: string) => void;
  setDirectWeight: (exercise: number, set: number, value: string) => void;
  adjustReps: (exercise: number, set: number, delta: number) => void;
  adjustWeight: (exercise: number, set: number, delta: number) => void;
  cycleMultiplier: (exercise: number, set: number) => void;
  addSetRow: (exercise: number) => void; removeSetRow: (exercise: number, set: number) => void;
  toggleComplete: (exercise: number, set: number) => void;
}) {
            const allSetsCompleted = item.sets.every((s) => s.completed);
            return (
              <View
                key={item.exerciseId}
                style={[
                  styles.exerciseCard,
                  {
                    backgroundColor: colors.surfaceElevated,
                    opacity: allSetsCompleted ? 0.8 : 1,
                  },
                ]}
              >
                {/* Exercise Card Header */}
                <View style={styles.exCardHeader}>
                  <View style={{ marginRight: 10 }}><ExerciseDemo imageUrl={item.imageUrl} name={item.name} size={44} active={visible && !showAddExerciseModal} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.exName, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.exMuscles, { color: colors.textMuted }]}>
                      {item.targetMuscles?.join(', ') || item.category}
                    </Text>
                  </View>

                  {/* Add set row button in header */}
                  <TouchableOpacity
                    onPress={() => addSetRow(exIndex)}
                    style={[styles.addSetHeaderBtn, { backgroundColor: colors.surfaceSecondary || colors.card }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={[styles.addSetHeaderBtnText, { color: colors.primary }]}>Add Set</Text>
                  </TouchableOpacity>
                </View>

                {/* Multiple Set Rows */}
                <View style={styles.setsListContainer}>
                  {item.sets.length === 0 && (
                    <View style={[styles.emptySetsPromptCard, { backgroundColor: colors.card }]}>
                      <Text style={[styles.emptySetsPromptText, { color: colors.textMuted }]}>
                        No sets logged for this exercise.
                      </Text>
                      <TouchableOpacity
                        onPress={() => addSetRow(exIndex)}
                        style={[styles.emptyAddSetBtn, { backgroundColor: colors.primary }]}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="add" size={15} color={isDark ? '#000000' : '#ffffff'} />
                        <Text style={[styles.emptyAddSetBtnText, { color: isDark ? '#000000' : '#ffffff' }]}>
                          Add Set
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {(() => {
                    let runningSetNum = 1;
                    return item.sets.map((set, setIndex) => {
                      const mult = set.multiplier || 1;
                      const startNum = runningSetNum;
                      const endNum = runningSetNum + mult - 1;
                      runningSetNum += mult;
                      const setRangeLabel = mult > 1 ? `SETS ${startNum}-${endNum}` : `SET ${startNum}`;

                      return (
                        <View
                          key={set.id}
                          style={[
                            styles.setRowCard,
                            {
                              backgroundColor: colors.card,
                              borderColor: 'transparent',
                            },
                          ]}
                        >
                          {/* Set Number & Multiplier Pill (x1 / x2 / x3 / x4) */}
                          <View style={styles.setRowHeader}>
                            <View style={styles.setIndexBadge}>
                              <Text style={[styles.setIndexText, { color: colors.textSecondary }]}>
                                {setRangeLabel}
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                               {/* Multiplier button: circular loop of arrows with number centered inside */}
                              <TouchableOpacity
                                style={[
                                  styles.multiplierCircle,
                                  {
                                    backgroundColor:
                                      set.multiplier > 1
                                        ? colors.primary
                                        : isDark
                                        ? 'rgba(255,255,255,0.06)'
                                        : '#f1f5f9',
                                    borderColor:
                                      set.multiplier > 1
                                        ? colors.primary
                                        : isDark
                                        ? 'rgba(255,255,255,0.12)'
                                        : '#cbd5e1',
                                  },
                                ]}
                                onPress={() => cycleMultiplier(exIndex, setIndex)}
                                activeOpacity={0.75}
                                accessibilityLabel={`Multiplier ${set.multiplier}x`}
                              >
                                {(() => {
                                  const iconColor = set.multiplier > 1
                                    ? (isDark ? '#000000' : '#ffffff')
                                    : (isDark ? '#cbd5e1' : '#64748b');
                                  return (
                                    <View style={styles.multiplierIconStack}>
                                      <Svg width={28} height={28} viewBox="0 0 28 28">
                                        {/* Top clockwise arc with arrowhead */}
                                        <SvgPath
                                          d="M14 3.5 A 10.5 10.5 0 0 1 24.5 14"
                                          fill="none"
                                          stroke={iconColor}
                                          strokeWidth="1.8"
                                          strokeLinecap="round"
                                        />
                                        <SvgPath
                                          d="M21.5 14 L24.5 14 L24.5 11"
                                          fill="none"
                                          stroke={iconColor}
                                          strokeWidth="1.8"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                        {/* Bottom clockwise arc with arrowhead */}
                                        <SvgPath
                                          d="M14 24.5 A 10.5 10.5 0 0 1 3.5 14"
                                          fill="none"
                                          stroke={iconColor}
                                          strokeWidth="1.8"
                                          strokeLinecap="round"
                                        />
                                        <SvgPath
                                          d="M6.5 14 L3.5 14 L3.5 17"
                                          fill="none"
                                          stroke={iconColor}
                                          strokeWidth="1.8"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                        {/* Centered number rendered directly inside the SVG coordinate center */}
                                        <SvgText
                                          x="14"
                                          y="17.5"
                                          fontSize="9.5"
                                          fontWeight="800"
                                          fill={iconColor}
                                          textAnchor="middle"
                                        >
                                          {set.multiplier}
                                        </SvgText>
                                      </Svg>
                                    </View>
                                  );
                                })()}
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => removeSetRow(exIndex, setIndex)}
                                style={styles.deleteSetBtn}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Reps and Weight Steppers with Vertically Scrollable Pickers & Direct Inputs */}
                          <View style={styles.steppersRow}>
                            {/* Reps vertical scroll box */}
                            <View style={[styles.stepperBox, { backgroundColor: colors.surfaceElevated }]}>
                              <TouchableOpacity
                                onPress={() => adjustReps(exIndex, setIndex, -1)}
                                style={styles.stepTouch}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Ionicons name="remove" size={17} color={colors.text} />
                              </TouchableOpacity>

                              <View style={styles.wheelViewport}>
                                <View
                                  style={[
                                    styles.wheelCenterHighlight,
                                    {
                                      backgroundColor: colors.primary + '18',
                                      borderColor: colors.primary,
                                    },
                                  ]}
                                  pointerEvents="none"
                                />
                                <ScrollView
                                  showsVerticalScrollIndicator={false}
                                  snapToInterval={36}
                                  decelerationRate="fast"
                                  nestedScrollEnabled
                                  contentContainerStyle={styles.wheelContent}
                                >
                                  {[-2, -1, 0, 1, 2].map((offset) => {
                                    const val = Math.max(1, set.reps + offset);
                                    const isCenter = offset === 0;
                                    if (isCenter) {
                                      return (
                                        <View key={offset} style={[styles.wheelItem, styles.wheelItemActive]}>
                                          <TextInput
                                            keyboardType="number-pad"
                                            value={String(set.reps)}
                                            onChangeText={(txt) => setDirectReps(exIndex, setIndex, txt)}
                                            style={[
                                              styles.wheelInputText,
                                              {
                                                color: colors.primary,
                                              },
                                            ]}
                                            selectTextOnFocus
                                          />
                                        </View>
                                      );
                                    }
                                    return (
                                      <TouchableOpacity
                                        key={offset}
                                        style={styles.wheelItem}
                                        onPress={() => adjustReps(exIndex, setIndex, offset)}
                                      >
                                        <Text
                                          style={[
                                            styles.wheelItemText,
                                            {
                                              color: colors.textMuted,
                                              fontSize: 13,
                                              fontWeight: '500',
                                              opacity: 0.45,
                                            },
                                          ]}
                                        >
                                          {val}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </ScrollView>
                              </View>

                              <Text style={[styles.unitOutsideLabel, { color: colors.textMuted }]}>REPS</Text>

                              <TouchableOpacity
                                onPress={() => adjustReps(exIndex, setIndex, 1)}
                                style={styles.stepTouch}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Ionicons name="add" size={17} color={colors.text} />
                              </TouchableOpacity>
                            </View>

                            {/* Weight vertical scroll box */}
                            <View style={[styles.stepperBox, { backgroundColor: colors.surfaceElevated }]}>
                              <TouchableOpacity
                                onPress={() => adjustWeight(exIndex, setIndex, -5)}
                                style={styles.stepTouch}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Ionicons name="remove" size={17} color={colors.text} />
                              </TouchableOpacity>

                              <View style={styles.wheelViewport}>
                                <View
                                  style={[
                                    styles.wheelCenterHighlight,
                                    {
                                      backgroundColor: colors.primary + '18',
                                      borderColor: colors.primary,
                                    },
                                  ]}
                                  pointerEvents="none"
                                />
                                <ScrollView
                                  showsVerticalScrollIndicator={false}
                                  snapToInterval={36}
                                  decelerationRate="fast"
                                  nestedScrollEnabled
                                  contentContainerStyle={styles.wheelContent}
                                >
                                  {[-10, -5, 0, 5, 10].map((offset) => {
                                    const val = Math.max(0, set.weight + offset);
                                    const isCenter = offset === 0;
                                    if (isCenter) {
                                      return (
                                        <View key={offset} style={[styles.wheelItem, styles.wheelItemActive]}>
                                          <TextInput
                                            keyboardType="decimal-pad"
                                            value={String(set.weight)}
                                            onChangeText={(txt) => setDirectWeight(exIndex, setIndex, txt)}
                                            style={[
                                              styles.wheelInputText,
                                              {
                                                color: colors.primary,
                                              },
                                            ]}
                                            selectTextOnFocus
                                          />
                                        </View>
                                      );
                                    }
                                    return (
                                      <TouchableOpacity
                                        key={offset}
                                        style={styles.wheelItem}
                                        onPress={() => adjustWeight(exIndex, setIndex, offset)}
                                      >
                                        <Text
                                          style={[
                                            styles.wheelItemText,
                                            {
                                              color: colors.textMuted,
                                              fontSize: 13,
                                              fontWeight: '500',
                                              opacity: 0.45,
                                            },
                                          ]}
                                        >
                                          {val}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </ScrollView>
                              </View>

                              <Text style={[styles.unitOutsideLabel, { color: colors.textMuted }]}>
                                {weightUnit.toUpperCase()}
                              </Text>

                              <TouchableOpacity
                                onPress={() => adjustWeight(exIndex, setIndex, 5)}
                                style={styles.stepTouch}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Ionicons name="add" size={17} color={colors.text} />
                              </TouchableOpacity>
                            </View>
                          </View>
                          <TouchableOpacity
                            testID={`complete-set-${exIndex}-${setIndex}`}
                            accessibilityRole="checkbox"
                            accessibilityLabel={`${item.name}, ${setRangeLabel.toLowerCase()}, ${set.completed ? 'completed' : 'mark complete'}`}
                            accessibilityState={{ checked: set.completed, disabled: isFinishing }}
                            accessibilityHint="Checked sets are saved when you log the workout."
                            disabled={isFinishing}
                            onPress={() => toggleComplete(exIndex, setIndex)}
                            activeOpacity={0.8}
                            style={[styles.completeSetButton, { backgroundColor: set.completed ? colors.primary : colors.surfaceElevated, borderColor: set.completed ? colors.primary : colors.border, opacity: isFinishing ? .5 : 1 }]}
                          >
                            <Ionicons name={set.completed ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={set.completed ? (isDark ? '#000000' : '#ffffff') : colors.primary} />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: set.completed ? (isDark ? '#000000' : '#ffffff') : colors.text }}>
                              {set.completed ? `${mult > 1 ? `${mult} sets` : 'Set'} complete` : `Mark ${mult > 1 ? `${mult} sets` : 'set'} complete`}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    });
                  })()}
                </View>
              </View>
            );
});

export function WorkoutSessionModal({
  visible,
  embedded = false,
  routine,
  allLogs,
  userId,
  weightUnit,
  onClose,
  onFinishSession,
}: WorkoutSessionModalProps) {
  const themeContext = useTheme();
  const colors = themeContext?.colors;
  const isDark = themeContext?.isDark ?? colors?.isDark ?? true;

  // Active workout timer
  const elapsedSeconds = useRef(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);

  // Set rest timer
  const [restEndsAt, setRestEndsAt] = useState(0);
  const setRestSeconds = (seconds: number) => setRestEndsAt(seconds > 0 ? Date.now()+seconds*1000 : 0);
  const finishRest = useCallback(() => { setIsResting(false); setRestEndsAt(0); }, []);
  const [isResting, setIsResting] = useState<boolean>(false);

  const [restInterval, setRestInterval] = useState(DEFAULT_REST_SECONDS);
  const [restSettingsOpen, setRestSettingsOpen] = useState(false);
  const restPreferenceRevision = useRef(0);
  const restAccount = useRef(userId); restAccount.current = userId;
  useEffect(() => {
    let alive = true;
    const revision = ++restPreferenceRevision.current;
    setRestInterval(DEFAULT_REST_SECONDS);
    setRestSettingsOpen(false);
    setIsResting(false); setRestSeconds(0);
    loadRestInterval(userId).then(value => {
      if (alive && restAccount.current === userId && revision === restPreferenceRevision.current) setRestInterval(value);
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  const changeRestInterval = (seconds: number) => {
    const value = normalizeRestSeconds(seconds);
    const owner = userId;
    const revision = ++restPreferenceRevision.current;
    setRestInterval(value);
    if (!value) { setIsResting(false); setRestSeconds(0); }
    saveRestInterval(owner, value).catch(() => {
      if (restAccount.current === owner && revision === restPreferenceRevision.current)
        Alert.alert('Rest interval not saved', 'Your selection works for this session. Try changing it again to save it for future workouts.');
    });
  };
  const adjustCurrentRest = (amount: number) => {
    const seconds = Math.max(0, Math.min(MAX_REST_SECONDS, Math.max(0, Math.ceil((restEndsAt-Date.now())/1000)) + amount));
    setRestSeconds(seconds); setIsResting(seconds > 0);
  };

  // Exercise items state inside session
  const [exerciseStates, setExerciseStates] = useState<ActiveExerciseState[]>([]);

  const exerciseStatesRef = useRef(exerciseStates); exerciseStatesRef.current = exerciseStates;

  // Add Exercise to active session state (with matching main workout page filters and preview)
  const [showAddExerciseModal, setShowAddExerciseModal] = useState<boolean>(false);
  const [exerciseSearchText, setExerciseSearchText] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedDifficultyFilter, setSelectedDifficultyFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [activeDropdown, setActiveDropdown] = useState<'muscle' | 'difficulty' | 'type' | null>(null);
  const [previewingExercise, setPreviewingExercise] = useState<ExerciseDefinition>(DEFAULT_EXERCISES[0]);
  const [isPreviewHeroExpanded, setIsPreviewHeroExpanded] = useState<boolean>(false);
  const [isPastWorkoutExpanded, setIsPastWorkoutExpanded] = useState<boolean>(false);
  const [repeatStatusMsg, setRepeatStatusMsg] = useState<string | null>(null);
  const [previousExerciseSnapshot, setPreviousExerciseSnapshot] = useState<ActiveExerciseState[] | null>(null);
  const [repeatTimer, setRepeatTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);
  const finishing = useRef(false);
  const finishScale = useRef(new Animated.Value(1)).current;
  const finishFill = useRef(new Animated.Value(0)).current;
  const finishCheckScale = useRef(new Animated.Value(1)).current;

  // Find last workout log specifically for this workout day/routine (or its exercises) and any other logs from that exact calendar day
  const lastSessionSummary = useMemo(() => {
    if (!routine || allLogs.length === 0) return null;
    const routineExIds = routine.exercises.map((e) => e.exerciseId);

    // 1. Sort allLogs newest-first by date
    const sortedLogs = [...allLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 2. Find the most recent log belonging to this routine's exercises (or category)
    const latestRoutineLog = sortedLogs.find((l) => l.userId === userId && routineExIds.includes(l.exerciseId));
    if (!latestRoutineLog) return null;

    // 3. Extract the target day string (YYYY-MM-DD) of that specific past session
    const targetDayStr = latestRoutineLog.date.split('T')[0];

    // The repeat preview must contain only this workout's exercises, not unrelated sets that day.
    const dayLogs = sortedLogs.filter((l) => l.userId === userId && routineExIds.includes(l.exerciseId) && l.date.split('T')[0] === targetDayStr);

    const latestDate = new Date(latestRoutineLog.date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    return {
      date: latestDate,
      dateKey: targetDayStr,
      logs: dayLogs,
      routineLogs: dayLogs.filter((l) => routineExIds.includes(l.exerciseId)),
    };
  }, [routine, allLogs, userId]);

  // Initialize exercises when routine opens
  useEffect(() => {
    if (!routine || !visible) {
      elapsedSeconds.current = 0;
      setRestSeconds(0);
      setIsResting(false);
      return;
    }

    elapsedSeconds.current = 0;
    setIsTimerRunning(true);
    setRestSeconds(0);
    setIsResting(false);

    const initialStates: ActiveExerciseState[] = routine.exercises.map((item) => {
      const def = DEFAULT_EXERCISES.find((e) => e.id === item.exerciseId);
      // Use the saved plan. Past values are copied only through Repeat Past Workout.
      let initWeight = item.weight ?? def?.defaultWeight ?? 0;
      const initReps = item.reps ?? def?.defaultReps ?? 10;
      if (weightUnit === 'kg') {
        initWeight = Math.round(initWeight * 0.453592);
      }

      return {
        exerciseId: item.exerciseId,
        name: def?.name || item.exerciseId,
        category: def?.category || routine.category,
        imageUrl: def?.imageUrl,
        targetMuscles: def?.primaryMuscles,
        sets: [
          {
            id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            reps: initReps,
            weight: initWeight,
            multiplier: 1,
            completed: false,
          },
        ],
      };
    });

    setExerciseStates(initialStates);
  }, [routine, visible]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Direct input for reps or weight
  const setDirectReps = useCallback((exIndex: number, setIndex: number, valStr: string) => {
    const num = parseInt(valStr.replace(/[^0-9]/g, ''), 10);
    setExerciseStates((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = {
        ...sets[setIndex],
        reps: isNaN(num) ? 0 : Math.max(0, num),
      };
      ex.sets = sets;
      copy[exIndex] = ex;
      return copy;
    });
  }, []);

  const setDirectWeight = useCallback((exIndex: number, setIndex: number, valStr: string) => {
    const num = parseFloat(valStr.replace(/[^0-9.]/g, ''));
    setExerciseStates((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = {
        ...sets[setIndex],
        weight: isNaN(num) ? 0 : Math.max(0, num),
      };
      ex.sets = sets;
      copy[exIndex] = ex;
      return copy;
    });
  }, []);

  // Adjust reps or weight of a specific set within an exercise
  const adjustReps = useCallback((exIndex: number, setIndex: number, delta: number) => {
    setExerciseStates((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = {
        ...sets[setIndex],
        reps: Math.max(1, sets[setIndex].reps + delta),
      };
      ex.sets = sets;
      copy[exIndex] = ex;
      return copy;
    });
  }, []);

  const adjustWeight = useCallback((exIndex: number, setIndex: number, delta: number) => {
    setExerciseStates((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = {
        ...sets[setIndex],
        weight: Math.max(0, sets[setIndex].weight + delta),
      };
      ex.sets = sets;
      copy[exIndex] = ex;
      return copy;
    });
  }, []);

  // Cycle multiplier: x1 -> x2 -> x3 -> x4 -> x1
  const cycleMultiplier = useCallback((exIndex: number, setIndex: number) => {
    setExerciseStates((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      const curMult = sets[setIndex].multiplier || 1;
      const nextMult = curMult >= 4 ? 1 : curMult + 1;
      sets[setIndex] = {
        ...sets[setIndex],
        multiplier: nextMult,
      };
      ex.sets = sets;
      copy[exIndex] = ex;
      return copy;
    });
  }, []);

  // Add a new set row with customized or differing weight/reps
  const addSetRow = useCallback((exIndex: number) => {
    setExerciseStates((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const lastSet = ex.sets[ex.sets.length - 1];
      const newSet: ExerciseSetRow = {
        id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        reps: lastSet ? lastSet.reps : 10,
        weight: lastSet ? lastSet.weight : 0,
        multiplier: 1,
        completed: false,
      };
      ex.sets = [...ex.sets, newSet];
      copy[exIndex] = ex;
      return copy;
    });
  }, []);

  // Remove a set row (supports removing down to 0 sets)
  const removeSetRow = useCallback((exIndex: number, setIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    setExerciseStates((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      ex.sets = ex.sets.filter((_, idx) => idx !== setIndex);
      copy[exIndex] = ex;
      return copy;
    });
  }, []);

  const toggleComplete = useCallback((exIndex: number, setIndex: number) => {
    if (finishing.current) return;
    const completing = !exerciseStatesRef.current[exIndex]?.sets[setIndex]?.completed;
    Haptics.selectionAsync().catch(() => { });
    setExerciseStates((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      const nextCompleted = !sets[setIndex].completed;
      sets[setIndex] = { ...sets[setIndex], completed: nextCompleted };
      ex.sets = sets;
      copy[exIndex] = ex;
      return copy;
    });

    // Unchecking a set must not start another rest interval.
    if (completing && restInterval > 0) { setRestSeconds(restInterval); setIsResting(true); }
  }, [restInterval]);

  // Add exercise to active session
  const handleAddExerciseToSession = (exercise: ExerciseDefinition) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });

    // Check if exercise already exists in this session
    const existingIndex = exerciseStates.findIndex((e) => e.exerciseId === exercise.id);
    if (existingIndex >= 0) {
      setShowAddExerciseModal(false);
      return;
    }

    // Default weight conversion if kg
    let initWeight = exercise.defaultWeight ?? 0;
    if (weightUnit === 'kg') {
      initWeight = Math.round(initWeight * 0.453592);
    }
    const initReps = exercise.defaultReps || 10;

    const newExerciseState: ActiveExerciseState = {
      exerciseId: exercise.id,
      name: exercise.name,
      category: exercise.category,
      imageUrl: exercise.imageUrl,
      targetMuscles: exercise.primaryMuscles,
      sets: [
        {
          id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          reps: initReps,
          weight: initWeight,
          multiplier: 1,
          completed: false,
        },
      ],
    };

    setExerciseStates((prev) => [...prev, newExerciseState]);
    setShowAddExerciseModal(false);
    setExerciseSearchText('');
  };

  // Filtered available exercises matching main workout page
  const filteredAvailableExercises = useMemo(() => {
    const q = exerciseSearchText.trim().toLowerCase();

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
      if (selectedCategoryFilter !== 'all' && e.category.toLowerCase() !== selectedCategoryFilter.toLowerCase()) {
        return false;
      }

      // 3. Difficulty Filter
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
        if (diff !== selectedDifficultyFilter) return false;
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
  }, [exerciseSearchText, selectedCategoryFilter, selectedDifficultyFilter, selectedTypeFilter]);

  // Apply previous workout's weights and reps in-place without auto-logging
  const handleApplyPastWorkout = () => {
    if (!lastSessionSummary || !routine) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });

    // Save snapshot for Undo
    setPreviousExerciseSnapshot(JSON.parse(JSON.stringify(exerciseStates)));

    setExerciseStates((prev) => {
      return prev.map((exState) => {
        // Find matching logs from lastSessionSummary
        const matchingLogs = lastSessionSummary.logs.filter((l) => l.exerciseId === exState.exerciseId);
        if (matchingLogs.length === 0) return exState;

        const updatedSets: ExerciseSetRow[] = matchingLogs.map((logItem, idx) => {
          let convertedW = logItem.weight;
          if (logItem.weightUnit !== weightUnit) {
            convertedW = weightUnit === 'kg' ? Math.round(logItem.weight * 0.453592) : Math.round(logItem.weight * 2.20462);
          }
          return {
            id: `set_past_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            reps: logItem.reps || 10,
            weight: convertedW,
            multiplier: 1,
            completed: false,
          };
        });

        return {
          ...exState,
          sets: updatedSets.length > 0 ? updatedSets : exState.sets,
        };
      });
    });

    setRepeatStatusMsg(`Applied reps and weights from ${lastSessionSummary.date}. Ready for your session.`);
    if (repeatTimer) clearTimeout(repeatTimer);
    const t = setTimeout(() => {
      setRepeatStatusMsg(null);
    }, 6000);
    setRepeatTimer(t);
  };

  const handleUndoRepeatPastWorkout = () => {
    Haptics.selectionAsync().catch(() => { });
    if (previousExerciseSnapshot) {
      setExerciseStates(previousExerciseSnapshot);
      setPreviousExerciseSnapshot(null);
    }
    setRepeatStatusMsg(null);
    if (repeatTimer) clearTimeout(repeatTimer);
  };

  // Persist only checked rows; validate every row before the single storage write.
  const handleFinishAll = async () => {
    if (finishing.current) return;
    try {
      const entries = completedWorkoutEntries(exerciseStates, weightUnit,
        `${routine?.title || 'Workout'} (${formatTime(elapsedSeconds.current)})`);
      if (!entries.length) {
        Alert.alert('No completed sets', 'Check off the sets you actually completed before logging.');
        return;
      }
      finishing.current = true;
      setIsFinishing(true);
      const logs = await saveWorkoutLogBatch(userId, entries);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onFinishSession(logs.length, logs.map(log => log.id));
    } catch (error) {
      Alert.alert('Workout not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      finishing.current = false;
      setIsFinishing(false);
    }
  };

  if (!routine) return null;

  const totalSetsCount = exerciseStates.reduce((acc, ex) => {
    return acc + ex.sets.reduce((sAcc, s) => sAcc + (s.multiplier || 1), 0);
  }, 0);

  const completedSetsCount = exerciseStates.reduce((acc, ex) => {
    return acc + ex.sets.reduce((sAcc, s) => sAcc + (s.completed ? (s.multiplier || 1) : 0), 0);
  }, 0);

  return (
    <SessionSurface embedded={embedded} visible={visible} onClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }, embedded && { flex: 0, marginHorizontal: -16 }]}>
        {/* Apple Dynamic Island / Top Widget Bar */}
        <View style={[styles.dynamicIslandBar, { backgroundColor: '#000000' }]}>
          <View style={styles.islandIndicator}>
            <View style={styles.islandDot} />
            <Text style={styles.islandTitle}>{routine.title}</Text>
          </View>
          <View style={styles.islandRight}>
            <Ionicons name="timer-outline" size={15} color="#a3e635" />
            <SessionClock running={visible && isTimerRunning} session={routine} clock={elapsedSeconds} />
          </View>
        </View>

        {/* Header with Title and Close */}
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sessionTitle, { color: colors.text }]}>{routine.title}</Text>
            <Text style={[styles.sessionSubtitle, { color: colors.textMuted }]}>
              {completedSetsCount} of {totalSetsCount} sets checked off
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeCircleBtn, { backgroundColor: colors.surfaceElevated }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginHorizontal: 18, marginBottom: 12 }}>
          Enter your reps and weight, then mark each finished set complete. Save your checked sets below.
        </Text>

        <View style={{ marginHorizontal: 18, marginBottom: 12 }}>
          <TouchableOpacity testID="rest-interval-settings" accessibilityRole="button"
            accessibilityLabel={`Automatic rest ${formatRestInterval(restInterval)}. Adjust rest interval`}
            accessibilityState={{ expanded: restSettingsOpen }} onPress={() => setRestSettingsOpen(value => !value)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <Ionicons name="timer-outline" size={17} color={colors.primary} />
            <Text style={{ color: colors.text, flex: 1, fontSize: 13, fontWeight: '600' }}>Auto rest · {formatRestInterval(restInterval)}</Text>
            <Text style={{ color: colors.primary, fontSize: 12 }}>Adjust</Text>
            <Ionicons name={restSettingsOpen ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} />
          </TouchableOpacity>
          {restSettingsOpen && <View style={{ backgroundColor: colors.surfaceElevated, padding: 12, borderRadius: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {REST_PRESETS.map(seconds => <TouchableOpacity key={seconds} testID={`rest-preset-${seconds}`}
                accessibilityRole="radio" accessibilityState={{ selected: restInterval === seconds }}
                accessibilityLabel={seconds ? `${seconds} seconds rest` : 'Turn automatic rest off'}
                onPress={() => changeRestInterval(seconds)}
                style={{ minWidth: 48, minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                  backgroundColor: restInterval === seconds ? colors.primary : colors.background }}>
                <Text style={{ color: restInterval === seconds ? '#101609' : colors.text, fontWeight: '600' }}>{formatRestInterval(seconds)}</Text>
              </TouchableOpacity>)}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity testID="rest-interval-less" accessibilityRole="button" accessibilityLabel="Decrease automatic rest by 15 seconds"
                disabled={restInterval === 0} onPress={() => changeRestInterval(restInterval - 15)}
                style={{ minHeight: 44, minWidth: 48, alignItems: 'center', justifyContent: 'center', opacity: restInterval === 0 ? .4 : 1 }}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>−15s</Text>
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontWeight: '700' }}>{formatRestInterval(restInterval)}</Text>
              <TouchableOpacity testID="rest-interval-more" accessibilityRole="button" accessibilityLabel="Increase automatic rest by 15 seconds"
                disabled={restInterval === MAX_REST_SECONDS} onPress={() => changeRestInterval(restInterval + 15)}
                style={{ minHeight: 44, minWidth: 48, alignItems: 'center', justifyContent: 'center', opacity: restInterval === MAX_REST_SECONDS ? .4 : 1 }}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>+15s</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16 }}>Saved for your account. Applies after your next completed set. Off also stops the current countdown.</Text>
          </View>}
        </View>

        {/* Rest Timer Widget if resting */}
        {isResting && (
          <View style={[styles.restBar, { backgroundColor: colors.surfaceElevated, flexWrap: 'wrap', gap: 6 }]}>
            <View style={styles.restLeft}>
              <Ionicons name="hourglass-outline" size={16} color={colors.primary} />
              <Text style={[styles.restTitle, { color: colors.text }]}>Rest Interval</Text>
            </View>
            <View style={styles.restRight}>
              <RestCountdown endAt={restEndsAt} onFinish={finishRest} color={colors.primary} />
              <TouchableOpacity testID="rest-current-less" accessibilityRole="button" accessibilityLabel="Shorten current rest by 15 seconds"
                onPress={() => adjustCurrentRest(-15)} style={[styles.restSkipBtn, { minHeight: 44, justifyContent: 'center' }]}>
                <Text style={[styles.restSkipText, { color: colors.primary }]}>−15s</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="rest-current-more" accessibilityRole="button" accessibilityLabel="Extend current rest by 15 seconds"
                disabled={restEndsAt-Date.now() >= MAX_REST_SECONDS*1000} onPress={() => adjustCurrentRest(15)} style={[styles.restSkipBtn, { minHeight: 44, justifyContent: 'center' }]}>
                <Text style={[styles.restSkipText, { color: colors.primary }]}>+15s</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="rest-skip" accessibilityRole="button" accessibilityLabel="Skip current rest"
                onPress={() => { setIsResting(false); setRestSeconds(0); }}
                style={styles.restSkipBtn}
              >
                <Text style={[styles.restSkipText, { color: colors.textMuted }]}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Past Workout Banner with Dropdown Miniview & Undo */}
        {lastSessionSummary && (
          <View style={styles.pastWorkoutSectionWrap}>
            <View
              style={[
                styles.pastWorkoutBanner,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border || 'rgba(255,255,255,0.06)' },
              ]}
            >
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}
                onPress={handleApplyPastWorkout}
                activeOpacity={0.75}
              >
                <View style={[styles.pastIconWrap, { backgroundColor: (routine.color || colors.primary) + '18' }]}>
                  <Ionicons name="sync" size={20} color={routine.color || colors.primary} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <View style={styles.pastTitleBadgeRow}>
                    <Text style={[styles.pastTitle, { color: colors.text }]}>
                      Repeat Past Workout
                    </Text>
                    <View style={[styles.pastDatePill, { backgroundColor: (routine.color || colors.primary) + '22' }]}>
                      <Text style={[styles.pastDatePillText, { color: routine.color || colors.primary }]}>
                        {lastSessionSummary.date}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.pastSubtitle, { color: colors.textMuted }]}>
                    Tap to auto-fill your previous weights & reps for this session
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Right dropdown chevron to expand and drop down miniview */}
              <TouchableOpacity
                style={styles.pastDropdownChevronBtn}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => { });
                  setIsPastWorkoutExpanded((prev) => !prev);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={isPastWorkoutExpanded ? 'chevron-up' : 'chevron-down'}
                  size={19}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Notification line below saying what happened with Undo link */}
            {repeatStatusMsg && (
              <View style={styles.repeatStatusRowBelow}>
                <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                <Text style={[styles.repeatStatusText, { color: colors.text }]} numberOfLines={1}>
                  {repeatStatusMsg}
                </Text>
                <TouchableOpacity
                  onPress={handleUndoRepeatPastWorkout}
                  activeOpacity={0.65}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 6 }}
                >
                  <Text style={styles.repeatUndoText}>Undo</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Dropdown Mini-view of everything done that day */}
            {isPastWorkoutExpanded && (
              <View style={[styles.pastWorkoutDropdownCard, { backgroundColor: colors.surfaceElevated }]}>
                <View style={styles.pastDropdownHeader}>
                  <Text style={[styles.pastDropdownTitle, { color: colors.text }]}>
                    Logged on {lastSessionSummary.date}
                  </Text>
                  <TouchableOpacity
                    style={[styles.applyPastMiniBtn, { backgroundColor: colors.primary }]}
                    onPress={handleApplyPastWorkout}
                  >
                    <Text style={[styles.applyPastMiniBtnText, { color: isDark ? '#000000' : '#ffffff' }]}>
                      Apply All
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.pastMiniList}>
                  {lastSessionSummary.logs.map((logItem) => (
                    <View key={logItem.id} style={styles.pastMiniItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pastMiniExName, { color: colors.text }]} numberOfLines={1}>
                          {logItem.exerciseName}
                        </Text>
                        <Text style={[styles.pastMiniExDetail, { color: colors.textMuted }]}>
                          {logItem.reps} reps · {logItem.weight} {logItem.weightUnit}
                          {logItem.notes ? ` (${logItem.notes})` : ''}
                        </Text>
                      </View>
                      <View style={[styles.pastMiniBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
                        <Text style={[styles.pastMiniBadgeText, { color: colors.textSecondary }]}>
                          {logItem.weight} {logItem.weightUnit}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Exercises Scroll List */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!embedded}
          style={[styles.scrollList, embedded && { flex: 0 }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {exerciseStates.map((item, exIndex) => <SessionExerciseCard key={item.exerciseId}
            item={item} exIndex={exIndex} colors={colors} isDark={isDark} weightUnit={weightUnit} visible={visible} showAddExerciseModal={showAddExerciseModal} isFinishing={isFinishing} setDirectReps={setDirectReps} setDirectWeight={setDirectWeight} adjustReps={adjustReps} adjustWeight={adjustWeight} cycleMultiplier={cycleMultiplier} addSetRow={addSetRow} removeSetRow={removeSetRow} toggleComplete={toggleComplete} />)}

          {/* Add Exercise to Session Button */}
          <TouchableOpacity
            style={[
              styles.addExerciseCardBtn,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: 'transparent',
              },
            ]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => { });
              setShowAddExerciseModal(true);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.addExIconBubble, { backgroundColor: colors.primary }]}>
              <Ionicons name="add" size={20} color={isDark ? '#000000' : '#ffffff'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.addExBtnTitle, { color: colors.text }]}>Add Exercise</Text>
              <Text style={[styles.addExBtnSubtitle, { color: colors.textMuted }]}>
                Browse catalog, filter by muscle groups, or search
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>

        {/* Finish & Log Workout Button with satisfying fill & check animation */}
        <View style={[styles.footerBar, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 8 }}>{completedSetsCount ? 'Only checked sets will be saved and added to your ranks.' : 'Mark a set complete above to enable logging.'}</Text>
          {(() => {
            const btnBg = finishFill.interpolate({
              inputRange: [0, 1],
              outputRange: [colors.primary, '#10b981'],
            });

            return (
              <Animated.View style={{ transform: [{ scale: finishScale }] }}>
                <TouchableOpacity
                  testID="save-completed-sets"
                  accessibilityRole="button"
                  accessibilityLabel={completedSetsCount ? `Log ${completedSetsCount} completed sets` : 'Mark a set complete to enable logging'}
                  disabled={isFinishing || completedSetsCount === 0}
                  accessibilityState={{ disabled: isFinishing || completedSetsCount === 0 }}
                  style={{ opacity: isFinishing || completedSetsCount === 0 ? 0.5 : 1 }}
                  onPress={handleFinishAll}
                  activeOpacity={0.85}
                >
                  <Animated.View style={[styles.finishBtn, { backgroundColor: btnBg }]}>
                    <Animated.View style={{ transform: [{ scale: finishCheckScale }] }}>
                      <Ionicons
                        name={isFinishing ? 'checkmark-circle' : 'checkmark-done'}
                        size={isFinishing ? 22 : 20}
                        color={isDark ? '#000000' : '#ffffff'}
                      />
                    </Animated.View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.finishBtnText, { flexShrink: 1, color: isDark ? '#000000' : '#ffffff' }]}>
                      {isFinishing
                        ? `Saving…`
                        : completedSetsCount === 0 ? 'Mark a set complete to log' : `Log ${completedSetsCount} Completed Set${completedSetsCount === 1 ? '' : 's'}`}
                    </Text>
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
            );
          })()}
        </View>

        {/* Modal Sheet for Adding Exercise to Active Session */}
        {showAddExerciseModal && <Modal
          visible={showAddExerciseModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowAddExerciseModal(false)}
        >
          <View style={[styles.pickerContainer, { backgroundColor: colors.background }]}>
            {/* Picker Header */}
            <View style={styles.pickerHeader}>
              <View>
                <Text style={[styles.pickerTitle, { color: colors.text }]}>Add Exercise</Text>
                <Text style={[styles.pickerSubtitle, { color: colors.textMuted }]}>
                  Select any exercise or filter to add to this workout
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAddExerciseModal(false)}
                style={[styles.closeCircleBtn, { backgroundColor: colors.surfaceElevated }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              testID="session-exercise-catalog"
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              data={filteredAvailableExercises}
              keyExtractor={item => item.id}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={3}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={<>
              {/* ── STICKMAN HERO CARD (Exact preview from main workout page) ── */}
              {previewingExercise && (
                <View style={[styles.stickmanHeroCard, { backgroundColor: colors.surfaceElevated }]}>
                  <TouchableOpacity
                    style={styles.stickmanHeroHeaderTap}
                    onPress={() => setIsPreviewHeroExpanded((prev) => !prev)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.stickmanHeroContent}>
                      {previewingExercise.imageUrl ? (
                        <View style={[styles.stickmanVisualWrap, { backgroundColor: isDark ? '#141417' : '#f1f5f9' }]}>
                          <ExerciseDemo imageUrl={previewingExercise.imageUrl} name={previewingExercise.name} size={58} active={visible && showAddExerciseModal} controls />
                        </View>
                      ) : null}
                      <View style={styles.stickmanInfoCol}>
                        <Text style={[styles.stickmanExerciseTitle, { color: colors.text }]}>
                          {previewingExercise.name}
                        </Text>
                        <View style={styles.exerciseBadgeRow}>
                          <View
                            style={[
                              styles.categoryTagPill,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                              },
                            ]}
                          >
                            <Text style={[styles.categoryTagText, { color: colors.textSecondary }]}>
                              {previewingExercise.category.charAt(0).toUpperCase() + previewingExercise.category.slice(1).toLowerCase()}
                            </Text>
                          </View>
                          {previewingExercise.equipment ? (
                            <View
                              style={[
                                styles.equipmentTagPill,
                                {
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                                },
                              ]}
                            >
                              <Ionicons name="barbell-outline" size={13} color={colors.textSecondary} style={{ marginRight: 5 }} />
                              <Text style={[styles.equipmentTagText, { color: colors.textSecondary }]}>
                                {previewingExercise.equipment}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.selectedMuscleSub, { color: colors.textMuted }]}>
                          Focus: {previewingExercise.primaryMuscles?.join(', ') || previewingExercise.category}
                        </Text>
                      </View>
                      <View style={[styles.heroChevronBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                        <Ionicons
                          name={isPreviewHeroExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.textSecondary}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Add to session action bar right under hero header */}
                  <View style={styles.heroAddActionBar}>
                    <TouchableOpacity
                      style={[styles.heroQuickAddBtn, { backgroundColor: colors.primary }]}
                      onPress={() => handleAddExerciseToSession(previewingExercise)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add" size={17} color={isDark ? '#000000' : '#ffffff'} />
                      <Text style={[styles.heroQuickAddBtnText, { color: isDark ? '#000000' : '#ffffff' }]}>
                        Add {previewingExercise.name} to Workout
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Expandable info & benchmarks */}
                  {isPreviewHeroExpanded && (() => {
                    const exName = (previewingExercise.name || '').toLowerCase();
                    const exCat = (previewingExercise.category || '').toLowerCase();
                    const exEquip = (previewingExercise.equipment || '').toLowerCase();

                    let popPercent = 54;
                    let popNotches = 2;
                    if (exName.includes('bench') || exName.includes('squat') || exName.includes('deadlift') || exName.includes('curl')) {
                      popPercent = 78;
                      popNotches = 3;
                    }

                    let diffLevel = 2;
                    if (exName.includes('deadlift') || exName.includes('squat') || exName.includes('overhead press')) diffLevel = 3;
                    else if (exName.includes('curl') || exName.includes('extension') || exName.includes('crunch')) diffLevel = 1;

                    let progLevel = 2;
                    if (exName.includes('bench') || exName.includes('squat') || exName.includes('deadlift') || exName.includes('leg press')) progLevel = 3;

                    const filledColor = isDark ? '#ffffff' : '#000000';
                    const emptyColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
                    const flameColor = isDark ? '#ffffff' : '#000000';

                    let baseAvgLbs = 115;
                    const isBodyweight = exEquip.includes('body only') || exName.includes('pushup') || exName.includes('pullup') || exName.includes('dip');
                    if (isBodyweight) baseAvgLbs = 0;
                    else if (exEquip.includes('dumbbell')) baseAvgLbs = 35;
                    else if (exEquip.includes('barbell')) baseAvgLbs = 145;

                    const maleAvgLbs = baseAvgLbs;
                    const femaleAvgLbs = Math.round(baseAvgLbs * 0.65);
                    const maleAvg10 = isBodyweight ? 'BW' : weightUnit === 'kg' ? `${Math.round(maleAvgLbs * 0.453592)}kg` : `${Math.round(maleAvgLbs)}lb`;
                    const femaleAvg10 = isBodyweight ? 'BW' : weightUnit === 'kg' ? `${Math.round(femaleAvgLbs * 0.453592)}kg` : `${Math.round(femaleAvgLbs)}lb`;

                    return (
                      <View style={styles.heroExpandedContainer}>
                        <View style={[styles.heroExpandedDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />
                        <Text style={[styles.heroExerciseDescription, { color: colors.textSecondary }]}>
                          Engages {previewingExercise.primaryMuscles?.join(', ') || previewingExercise.category}. Maintain controlled tempo through complete range of motion.
                        </Text>
                        <View style={styles.heroNotchesGrid}>
                          <View style={styles.rankingSideBySideRow}>
                            <View style={styles.rankingCol}>
                              <View style={styles.rankingLabelRow}>
                                <Text style={[styles.rankingTitle, { color: colors.text }]}>Difficulty</Text>
                                <Ionicons name="barbell-outline" size={13} color={colors.textSecondary} />
                              </View>
                              <View style={styles.notchesBar}>
                                {[1, 2, 3].map((lvl) => (
                                  <View key={`d_${lvl}`} style={[styles.notchSegment, { backgroundColor: lvl <= diffLevel ? filledColor : emptyColor }]} />
                                ))}
                              </View>
                            </View>
                            <View style={styles.rankingCol}>
                              <View style={styles.rankingLabelRow}>
                                <Text style={[styles.rankingTitle, { color: colors.text }]}>Progression</Text>
                                <Ionicons name="trending-up" size={13} color={colors.textSecondary} />
                              </View>
                              <View style={styles.notchesBar}>
                                {[1, 2, 3].map((lvl) => (
                                  <View key={`p_${lvl}`} style={[styles.notchSegment, { backgroundColor: lvl <= progLevel ? filledColor : emptyColor }]} />
                                ))}
                              </View>
                            </View>
                          </View>
                          <View style={styles.rankingSideBySideRow}>
                            <View style={styles.rankingCol}>
                              <View style={styles.rankingLabelRow}>
                                <Text style={[styles.rankingTitle, { color: colors.text }]}>Popularity</Text>
                                <Ionicons name="flame" size={13} color={flameColor} />
                              </View>
                              <View style={styles.popularityNotchesWithNumRow}>
                                <View style={styles.notchesBarCompact}>
                                  {[1, 2, 3].map((lvl) => (
                                    <View key={`pop_${lvl}`} style={[styles.notchSegmentCompact, { backgroundColor: lvl <= popNotches ? filledColor : emptyColor }]} />
                                  ))}
                                </View>
                                <Text style={[styles.rankingValueInline, { color: colors.text }]}>{popPercent}%</Text>
                              </View>
                            </View>
                            <View style={styles.rankingCol}>
                              <View style={styles.rankingLabelRow}>
                                <Text style={[styles.rankingTitle, { color: colors.text }]}>Avg 10-Rep</Text>
                                <Ionicons name="scale-outline" size={13} color={colors.textSecondary} />
                              </View>
                              <View style={styles.genderWeightsRow}>
                                <View style={styles.genderItem}>
                                  <Ionicons name="male" size={13} color={colors.text} />
                                  <Text style={[styles.genderWeightText, { color: colors.text }]}>{maleAvg10}</Text>
                                </View>
                                <View style={styles.genderItem}>
                                  <Ionicons name="female" size={13} color={colors.text} />
                                  <Text style={[styles.genderWeightText, { color: colors.text }]}>{femaleAvg10}</Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              )}

              {/* Results count label */}
              <View style={styles.resultsCountOnlyRow}>
                <Text style={[styles.unitBadge, { color: colors.textMuted }]}>
                  {filteredAvailableExercises.length} found
                </Text>
              </View>

              {/* Search Bar matching main workout page */}
              <View style={[styles.exerciseSearchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e9e9eb' }]}>
                <Ionicons name="search" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.exerciseSearchInput, { color: colors.text }]}
                  placeholder="Search exercises"
                  placeholderTextColor={colors.textMuted}
                  value={exerciseSearchText}
                  onChangeText={setExerciseSearchText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                {exerciseSearchText.length > 0 && (
                  <TouchableOpacity onPress={() => setExerciseSearchText('')} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* 3 Dropdown Filter Bubbles: Muscle Group, Difficulty, and Type */}
              <View style={styles.dropdownBubblesContainer}>
                <View style={styles.dropdownBubblesRow}>
                  {/* 1. Muscle Group Bubble */}
                  <TouchableOpacity
                    style={[
                      styles.filterDropdownPill,
                      {
                        backgroundColor: selectedCategoryFilter !== 'all' ? colors.primary : colors.surfaceElevated,
                        borderColor: selectedCategoryFilter !== 'all' || activeDropdown === 'muscle' ? colors.primary : colors.surfaceSecondary,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => { });
                      setActiveDropdown((cur) => (cur === 'muscle' ? null : 'muscle'));
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="body-outline" size={14} color={selectedCategoryFilter !== 'all' ? '#ffffff' : colors.textMuted} />
                    <Text style={[styles.filterDropdownPillText, { color: selectedCategoryFilter !== 'all' ? '#ffffff' : colors.text }]} numberOfLines={1}>
                      {selectedCategoryFilter === 'all' ? 'Muscle' : selectedCategoryFilter.charAt(0).toUpperCase() + selectedCategoryFilter.slice(1)}
                    </Text>
                    <Ionicons name={activeDropdown === 'muscle' ? 'chevron-up' : 'chevron-down'} size={13} color={selectedCategoryFilter !== 'all' ? '#ffffff' : colors.textMuted} />
                  </TouchableOpacity>

                  {/* 2. Difficulty Bubble */}
                  <TouchableOpacity
                    style={[
                      styles.filterDropdownPill,
                      {
                        backgroundColor: selectedDifficultyFilter !== 'all' ? colors.primary : colors.surfaceElevated,
                        borderColor: selectedDifficultyFilter !== 'all' || activeDropdown === 'difficulty' ? colors.primary : colors.surfaceSecondary,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => { });
                      setActiveDropdown((cur) => (cur === 'difficulty' ? null : 'difficulty'));
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="barbell-outline" size={14} color={selectedDifficultyFilter !== 'all' ? '#ffffff' : colors.textMuted} />
                    <Text style={[styles.filterDropdownPillText, { color: selectedDifficultyFilter !== 'all' ? '#ffffff' : colors.text }]} numberOfLines={1}>
                      {selectedDifficultyFilter === 'all' ? 'Difficulty' : selectedDifficultyFilter.charAt(0).toUpperCase() + selectedDifficultyFilter.slice(1)}
                    </Text>
                    <Ionicons name={activeDropdown === 'difficulty' ? 'chevron-up' : 'chevron-down'} size={13} color={selectedDifficultyFilter !== 'all' ? '#ffffff' : colors.textMuted} />
                  </TouchableOpacity>

                  {/* 3. Type / Equipment Bubble */}
                  <TouchableOpacity
                    style={[
                      styles.filterDropdownPill,
                      {
                        backgroundColor: selectedTypeFilter !== 'all' ? colors.primary : colors.surfaceElevated,
                        borderColor: selectedTypeFilter !== 'all' || activeDropdown === 'type' ? colors.primary : colors.surfaceSecondary,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => { });
                      setActiveDropdown((cur) => (cur === 'type' ? null : 'type'));
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="hardware-chip-outline" size={14} color={selectedTypeFilter !== 'all' ? '#ffffff' : colors.textMuted} />
                    <Text style={[styles.filterDropdownPillText, { color: selectedTypeFilter !== 'all' ? '#ffffff' : colors.text }]} numberOfLines={1}>
                      {selectedTypeFilter === 'all' ? 'Type' : selectedTypeFilter === 'bodyweight' ? 'Body' : selectedTypeFilter.charAt(0).toUpperCase() + selectedTypeFilter.slice(1)}
                    </Text>
                    <Ionicons name={activeDropdown === 'type' ? 'chevron-up' : 'chevron-down'} size={13} color={selectedTypeFilter !== 'all' ? '#ffffff' : colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Active Dropdown Options Drawer */}
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
                          { id: 'core', label: 'Core' },
                          { id: 'cardio', label: 'Cardio' },
                        ].map((opt) => {
                          const isChosen = selectedCategoryFilter === opt.id;
                          return (
                            <TouchableOpacity
                              key={opt.id}
                              style={[styles.dropdownOptionChip, { backgroundColor: isChosen ? colors.primary : colors.surfaceSecondary }]}
                              onPress={() => {
                                Haptics.selectionAsync().catch(() => { });
                                setSelectedCategoryFilter(opt.id);
                                setActiveDropdown(null);
                              }}
                              activeOpacity={0.75}
                            >
                              <Text style={[styles.dropdownOptionChipText, { color: isChosen ? '#09090b' : colors.text }]}>{opt.label}</Text>
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
                                Haptics.selectionAsync().catch(() => { });
                                setSelectedDifficultyFilter(opt.id);
                                setActiveDropdown(null);
                              }}
                              activeOpacity={0.75}
                            >
                              <Text style={[styles.dropdownOptionChipText, { color: isChosen ? '#09090b' : colors.text }]}>{opt.label}</Text>
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
                                Haptics.selectionAsync().catch(() => { });
                                setSelectedTypeFilter(opt.id);
                                setActiveDropdown(null);
                              }}
                              activeOpacity={0.75}
                            >
                              <Text style={[styles.dropdownOptionChipText, { color: isChosen ? '#09090b' : colors.text }]}>{opt.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>

              </>}
              ListEmptyComponent={<View style={styles.noExercisesFoundBox}><Ionicons name="search-outline" size={24} color={colors.textMuted} /><Text style={[styles.noExercisesFoundText, { color: colors.textMuted }]}>No exercises matching "{exerciseSearchText}"</Text></View>}
              renderItem={({ item, index }) => {
                    const isSelected = previewingExercise?.id === item.id;
                    const alreadyInSession = exerciseStates.some((s) => s.exerciseId === item.id);
                    const isLast = index === filteredAvailableExercises.length - 1;

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.exerciseListItem,
                          {
                            backgroundColor: isSelected
                              ? isDark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.08)'
                              : 'transparent',
                            borderBottomColor: isLast ? 'transparent' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => { });
                          setPreviewingExercise(item);
                        }}
                        activeOpacity={0.75}
                      >
                        <View style={styles.exerciseListItemLeft}>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.exerciseListItemName,
                                {
                                  color: isSelected ? colors.primary : colors.text,
                                  fontWeight: isSelected ? '800' : '700',
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            <Text style={[styles.exerciseListItemMeta, { color: colors.textMuted }]}>
                              {item.category.toUpperCase()}
                              {item.primaryMuscles ? ` · ${item.primaryMuscles.join(', ')}` : ''}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <TouchableOpacity
                            onPress={() => handleAddExerciseToSession(item)}
                            style={[
                              styles.addPillBtn,
                              {
                                backgroundColor: alreadyInSession
                                  ? isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
                                  : colors.primary,
                              },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons
                              name={alreadyInSession ? 'checkmark' : 'add'}
                              size={14}
                              color={alreadyInSession ? colors.textMuted : isDark ? '#000000' : '#ffffff'}
                            />
                            <Text
                              style={[
                                styles.addPillText,
                                {
                                  color: alreadyInSession ? colors.textMuted : isDark ? '#000000' : '#ffffff',
                                },
                              ]}
                            >
                              {alreadyInSession ? 'Added' : 'Add'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              setPreviewingExercise(item);
                              setIsPreviewHeroExpanded(true);
                            }}
                            style={styles.arrowTapArea}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="chevron-forward" size={16} color={isSelected ? colors.primary : colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
              }}
            />
          </View>
        </Modal>}
      </View>
    </SessionSurface>
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
  pastWorkoutSectionWrap: {
    marginHorizontal: 16,
    marginBottom: 14,
  },
  pastWorkoutBanner: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 74,
  },
  pastTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pastDatePill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  pastDatePillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pastDropdownChevronBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  repeatStatusRowBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
    gap: 6,
  },
  repeatStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  repeatUndoText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  pastWorkoutDropdownCard: {
    marginTop: 8,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pastDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pastDropdownTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 13,
    fontWeight: '800',
  },
  applyPastMiniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  applyPastMiniBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pastMiniList: {
    gap: 8,
  },
  pastMiniItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  pastMiniExName: {
    fontSize: 13,
    fontWeight: '700',
  },
  pastMiniExDetail: {
    fontSize: 11,
    marginTop: 1,
  },
  pastMiniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pastMiniBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptySetsPromptCard: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 4,
  },
  emptySetsPromptText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyAddSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  emptyAddSetBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stickmanHeroCard: {
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  stickmanHeroHeaderTap: {
    padding: 14,
  },
  stickmanHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stickmanVisualWrap: {
    width: 58,
    height: 58,
    borderRadius: 14,
    overflow: 'hidden',
  },
  heroExerciseImage: {
    width: '100%',
    height: '100%',
  },
  stickmanInfoCol: {
    flex: 1,
    gap: 4,
  },
  stickmanExerciseTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 16,
    fontWeight: '800',
  },
  exerciseBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryTagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  equipmentTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  equipmentTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  selectedMuscleSub: {
    fontSize: 11.5,
  },
  heroChevronBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAddActionBar: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  heroQuickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  heroQuickAddBtnText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 13,
    fontWeight: '800',
  },
  heroExpandedContainer: {
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  heroExpandedDivider: {
    height: 1,
    marginBottom: 12,
  },
  heroExerciseDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  heroNotchesGrid: {
    gap: 12,
  },
  rankingSideBySideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankingCol: {
    flex: 1,
    gap: 4,
  },
  rankingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rankingTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 11,
    fontWeight: '700',
  },
  notchesBar: {
    flexDirection: 'row',
    gap: 4,
    height: 6,
  },
  notchSegment: {
    flex: 1,
    borderRadius: 3,
  },
  popularityNotchesWithNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notchesBarCompact: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    height: 6,
  },
  notchSegmentCompact: {
    flex: 1,
    borderRadius: 3,
  },
  rankingValueInline: {
    fontSize: 11,
    fontWeight: '800',
  },
  genderWeightsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  genderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  genderWeightText: {
    fontSize: 11,
    fontWeight: '700',
  },
  resultsCountOnlyRow: {
    paddingVertical: 6,
  },
  unitBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  exerciseSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  exerciseSearchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  dropdownBubblesContainer: {
    marginBottom: 12,
    zIndex: 20,
  },
  dropdownBubblesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterDropdownPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 4,
  },
  filterDropdownPillText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 11.5,
    fontWeight: '800',
  },
  filterDropdownDrawer: {
    marginTop: 8,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  dropdownOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dropdownOptionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  dropdownOptionChipText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 11,
    fontWeight: '700',
  },
  exerciseResultsCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  noExercisesFoundBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noExercisesFoundText: {
    fontSize: 13,
  },
  exerciseListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  exerciseListItemLeft: {
    flex: 1,
    marginRight: 10,
  },
  exerciseListItemName: {
    fontSize: 14,
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
  },
  exerciseListItemMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  arrowTapArea: {
    padding: 4,
  },
  container: {
    flex: 1,
  },
  dynamicIslandBar: {
    marginHorizontal: 16,
    marginTop: Platform.OS === 'ios' ? 12 : 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  islandIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  islandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#a3e635',
  },
  islandTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  islandRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  islandTimerText: {
    color: '#a3e635',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  sessionSubtitle: {
    fontSize: 12.5,
    marginTop: 2,
  },
  closeCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restBar: {
    marginHorizontal: 18,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  restLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  restTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  restRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  restTimerText: {
    fontSize: 16,
    fontWeight: '800',
  },
  restSkipBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  restSkipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pastIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  pastSubtitle: {
    fontSize: 12,
    marginTop: 2.5,
    lineHeight: 16,
  },
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 12,
  },
  exerciseCard: {
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  exCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  exMuscles: {
    fontSize: 11,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  addSetHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  addSetHeaderBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  setsListContainer: {
    gap: 10,
  },
  setRowCard: {
    borderRadius: 16,
    padding: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  setRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  setIndexBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  setIndexText: {
    fontSize: 11,
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
  completeSetButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  checkSetBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  steppersRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stepperBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  wheelViewport: {
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  wheelCenterHighlight: {
    position: 'absolute',
    top: 6,
    left: 2,
    right: 2,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    zIndex: 1,
  },
  wheelContent: {
    alignItems: 'center',
    paddingVertical: 6,
    zIndex: 2,
  },
  wheelItem: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  wheelItemActive: {
    borderRadius: 8,
  },
  wheelItemText: {
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  wheelInputText: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    padding: 0,
    margin: 0,
    width: '100%',
  },
  unitOutsideLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginRight: 4,
  },
  stepTouch: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  stepValueCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: 17,
    fontWeight: '800',
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  footerBar: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  finishBtn: {
    height: 50,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  finishBtnText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  addExerciseCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    marginTop: 6,
    marginBottom: 20,
    gap: 14,
  },
  addExIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addExBtnTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  addExBtnSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  pickerContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 20 : 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  pickerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pickerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  pickerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: 16,
    gap: 8,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  filterRowWrapper: {
    marginBottom: 12,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  filterChipText: {
    fontSize: 13,
  },
  pickerListContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  emptyResultsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyResultsText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pickerExerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
  },
  exAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pickerExName: {
    fontSize: 15,
    fontWeight: '700',
  },
  pickerExDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  pickerExCategory: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pickerExEquipment: {
    fontSize: 11,
    fontWeight: '500',
  },
  pickerExMuscles: {
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
  addPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  addPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

