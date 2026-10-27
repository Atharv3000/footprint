import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import {
  DailyStepData,
  loadWeekSteps,
  loadDaySteps,
  getWeekDates,
  dateString,
  formatDayLabel,
  formatWeekRange,
  parseDate,
  getWeekOffsetForDate,
} from '@/constants/stepsStorage';
import { loadWalks, WalkRecord } from '@/constants/walkStorage';
import { AIActivityInsightsCard } from './AIActivityInsightsCard';
import { WalkHistorySection } from './WalkHistorySection';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_PAD = 16;
const CHART_H = 148;
const Y_AXIS_W = 42;
// Available bar area = screen - scroll padding (16×2) - card padding (16×2) - y-axis
const BAR_AREA_W = SCREEN_W - 32 - CARD_PAD * 2 - Y_AXIS_W;
const TOOLTIP_W = 118;
const TOOLTIP_H = 54;

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HOUR_TICK: Record<number, string> = { 0: '12a', 4: '4a', 8: '8a', 12: '12p', 16: '4p', 20: '8p' };
const GOAL_COLOR = 'rgba(0,0,0,0.82)';
const GRID_COLOR = 'rgba(128,128,128,0.14)';

export type MetricMode = 'steps' | 'distance' | 'history';

export const STEPS_COLOR_LIGHT = '#10b981';
export const DISTANCE_COLOR = '#3b82f6'; // Clean vibrant energetic blue for distance

interface Props {
  userId?: string;
  stepsGoal: number;
  distanceGoal: number;
  metricMode: MetricMode;
  distanceUnit: 'mi' | 'km';
  hideGoalLine?: boolean;
}

function getMetricThemeColor(metricMode: MetricMode, defaultPrimary: string): string {
  return metricMode === 'distance' ? DISTANCE_COLOR : defaultPrimary;
}

type TooltipState = { idx: number; title: string; sub: string } | null;

// ─── Helpers ────────────────────────────────────────────────────
function todayStr() { return dateString(0); }

function addDays(d: string, n: number): string {
  const date = parseDate(d);
  date.setDate(date.getDate() + n);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtNum(n: number): string { return n.toLocaleString(); }

function fmtK(n: number): string {
  if (n >= 1000) return `${n % 1000 === 0 ? (n / 1000).toFixed(0) : (n / 1000).toFixed(1)}k`;
  return String(n);
}

function shortDate(d: string): string {
  return parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function hourRange(h: number): string {
  const fmt = (x: number) => x === 0 ? '12 AM' : x === 12 ? '12 PM' : x < 12 ? `${x} AM` : `${x - 12} PM`;
  return `${fmt(h)}–${fmt(h + 1)}`;
}

// Convert steps to distance based on unit
function stepsToDistance(steps: number, unit: 'mi' | 'km'): number {
  return unit === 'mi' ? (steps * 0.00045) : (steps * 0.00072);
}

function formatMetricVal(val: number, mode: MetricMode, unit: 'mi' | 'km'): string {
  if (mode === 'steps') {
    return `${fmtNum(Math.round(val))} steps`;
  }
  return `${val.toFixed(2)} ${unit}`;
}

function formatMetricAxis(val: number, mode: MetricMode, unit: 'mi' | 'km'): string {
  if (mode === 'steps') {
    return fmtK(val);
  }
  return `${val.toFixed(1)}${unit}`;
}

/**
 * Compute a nice Y-axis scale for either steps or distance.
 */
function computeYScale(
  roughMax: number,
  mode: MetricMode,
  unit: 'mi' | 'km'
): { lines: { value: number; label: string }[]; maxVal: number } {
  if (roughMax <= 0) return { lines: [], maxVal: 1 };

  if (mode === 'distance') {
    let step = 1;
    if (roughMax <= 2) step = 0.5;
    else if (roughMax <= 5) step = 1;
    else if (roughMax <= 12) step = 2;
    else if (roughMax <= 25) step = 5;
    else step = 10;

    const lines: { value: number; label: string }[] = [];
    let v = step;
    while (lines.length < 6) {
      lines.push({ value: v, label: `${v.toFixed(step < 1 ? 1 : 0)}${unit}` });
      v += step;
      if (lines[lines.length - 1].value >= roughMax && lines.length >= 3) break;
      if (v > roughMax * 1.5) break;
    }
    const maxVal = lines.length > 0 ? lines[lines.length - 1].value : roughMax;
    return { lines, maxVal };
  }

  // Steps mode
  const rawStep = roughMax / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  let step = mag;
  const r = rawStep / mag;
  if (r >= 7.5) step = mag * 10;
  else if (r >= 5) step = mag * 5;
  else if (r >= 2.5) step = mag * 2.5;
  else if (r >= 2) step = mag * 2;

  const lines: { value: number; label: string }[] = [];
  let v = step;
  while (lines.length < 6) {
    lines.push({ value: v, label: fmtK(v) });
    v += step;
    if (v > roughMax * 1.6) break;
    if (lines[lines.length - 1].value >= roughMax && lines.length >= 3) break;
  }
  const maxVal = lines.length > 0 ? lines[lines.length - 1].value : roughMax;
  return { lines, maxVal };
}

// ─── Animated Bar ───────────────────────────────────────────────
function AnimatedBar({ ratio, color, delay = 0, w }: { ratio: number; color: string; delay?: number; w: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: Math.min(ratio, 1), duration: 520, delay, useNativeDriver: false }).start();
  }, [ratio]);
  const h = anim.interpolate({ inputRange: [0, 1], outputRange: [0, CHART_H] });
  return <Animated.View style={{ width: Math.max(2, w - 2), height: h, borderRadius: 4, backgroundColor: color }} />;
}

// ─── Y-Axis + Gridlines overlay ────────────────────────────────
function YAxisOverlay({ lines, maxVal }: { lines: { value: number; label: string }[]; maxVal: number }) {
  const { colors } = useTheme();
  return (
    <>
      {lines.map(l => {
        const bot = (l.value / maxVal) * CHART_H;
        return (
          <React.Fragment key={l.value}>
            <View pointerEvents="none" style={{
              position: 'absolute', bottom: bot, left: Y_AXIS_W, right: 0, height: 1, backgroundColor: GRID_COLOR,
            }} />
            <View pointerEvents="none" style={{
              position: 'absolute', bottom: bot - 6, left: 0, width: Y_AXIS_W - 5, alignItems: 'flex-end',
            }}>
              <Text style={{ fontSize: 8.5, fontWeight: '600', color: colors.textMuted }}>{l.label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </>
  );
}

// ─── Floating Tooltip ──────────────────────────────────────────
function Tooltip({
  title, sub, posLeft, posBottom, isDark,
}: { title: string; sub: string; posLeft: number; posBottom: number; isDark: boolean }) {
  const bottom = Math.max(8, Math.min(posBottom, CHART_H - TOOLTIP_H - 4));
  const minLeft = Y_AXIS_W;
  const maxLeft = Math.max(Y_AXIS_W, Y_AXIS_W + BAR_AREA_W - TOOLTIP_W);
  const left = Math.max(minLeft, Math.min(posLeft, maxLeft));
  const bg = isDark ? '#f4f4f5' : '#09090b';
  const fg = isDark ? '#09090b' : '#f4f4f5';
  
  const targetArrowX = (posLeft + TOOLTIP_W / 2) - left;
  const arrowLeft = Math.max(8, Math.min(targetArrowX - 5, TOOLTIP_W - 18));

  return (
    <View pointerEvents="none" style={{
      position: 'absolute',
      left,
      bottom,
      width: TOOLTIP_W,
      backgroundColor: bg,
      borderRadius: 11,
      paddingVertical: 8,
      paddingHorizontal: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 12,
      zIndex: 999,
    }}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: 13, letterSpacing: -0.4 }}>{title}</Text>
      <Text style={{ color: fg, fontSize: 9.5, opacity: 0.75, marginTop: 2, lineHeight: 13 }}>{sub}</Text>
      <View style={{
        position: 'absolute', bottom: -5, left: arrowLeft,
        borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 5,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: bg,
      }} />
    </View>
  );
}

// ─── Dual-layer Swipe Hook ──────────────────────────────────────
function useSwipeGestures(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  onScrollLock?: (locked: boolean) => void,
  threshold = 28,
) {
  const leftRef = useRef(onSwipeLeft);
  const rightRef = useRef(onSwipeRight);
  const lockRef = useRef(onScrollLock);
  useEffect(() => { leftRef.current = onSwipeLeft; }, [onSwipeLeft]);
  useEffect(() => { rightRef.current = onSwipeRight; }, [onSwipeRight]);
  useEffect(() => { lockRef.current = onScrollLock; }, [onScrollLock]);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchHandled = useRef(false);

  const triggerSwipe = useCallback((dx: number) => {
    if (Math.abs(dx) > threshold) {
      Haptics.selectionAsync().catch(() => {});
      if (dx < 0) leftRef.current();
      else rightRef.current();
    }
  }, [threshold]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gs) => {
      const isHorizontal = Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy);
      if (isHorizontal) lockRef.current?.(true);
      return isHorizontal;
    },
    onMoveShouldSetPanResponderCapture: (_, gs) => {
      const isHorizontal = Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.4;
      if (isHorizontal) lockRef.current?.(true);
      return isHorizontal;
    },
    onPanResponderGrant: () => {
      lockRef.current?.(true);
    },
    onPanResponderRelease: (_, gs) => {
      lockRef.current?.(false);
      triggerSwipe(gs.dx);
      touchHandled.current = true;
    },
    onPanResponderTerminate: () => {
      lockRef.current?.(false);
    },
  })).current;

  const touchHandlers = {
    onTouchStart: (e: any) => {
      touchHandled.current = false;
      const t = e.nativeEvent.touches?.[0] || e.nativeEvent;
      touchStartX.current = t.pageX ?? t.clientX ?? 0;
      touchStartY.current = t.pageY ?? t.clientY ?? 0;
    },
    onTouchMove: (e: any) => {
      const t = e.nativeEvent.touches?.[0] || e.nativeEvent;
      const curX = t.pageX ?? t.clientX ?? 0;
      const curY = t.pageY ?? t.clientY ?? 0;
      const dx = curX - touchStartX.current;
      const dy = curY - touchStartY.current;
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        lockRef.current?.(true);
      }
    },
    onTouchEnd: (e: any) => {
      lockRef.current?.(false);
      if (touchHandled.current) return;
      const t = e.nativeEvent.changedTouches?.[0] || e.nativeEvent;
      const curX = t.pageX ?? t.clientX ?? 0;
      const curY = t.pageY ?? t.clientY ?? 0;
      const dx = curX - touchStartX.current;
      const dy = curY - touchStartY.current;
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
        triggerSwipe(dx);
      }
    },
    onTouchCancel: () => {
      lockRef.current?.(false);
    },
  };

  return {
    combinedHandlers: {
      ...panResponder.panHandlers,
      ...touchHandlers,
    },
  };
}

// ══════════════════════════════════════════════════════════════
// WEEKLY BAR CHART
// ══════════════════════════════════════════════════════════════
export function WeeklyBarChart({
  userId,
  stepsGoal,
  distanceGoal,
  metricMode,
  distanceUnit,
  weekOffset,
  onWeekOffsetChange,
  selectedDate,
  onDaySelect,
  onScrollLock,
  hideGoalLine = false,
}: Props & {
  weekOffset: number;
  onWeekOffsetChange: (w: number) => void;
  selectedDate: string;
  onDaySelect: (date: string) => void;
  onScrollLock?: (locked: boolean) => void;
}) {
  const { colors, isDark } = useTheme();
  const [weekData, setWeekData] = useState<DailyStepData[]>([]);
  const [weekWalks, setWeekWalks] = useState<Record<string, { distKm: number; steps: number }>>({});
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [containerWidth, setContainerWidth] = useState<number>(BAR_AREA_W);
  const weekDates = getWeekDates(weekOffset);

  const weekOffsetRef = useRef(weekOffset);
  const onChangeRef = useRef(onWeekOffsetChange);
  useEffect(() => { weekOffsetRef.current = weekOffset; }, [weekOffset]);
  useEffect(() => { onChangeRef.current = onWeekOffsetChange; }, [onWeekOffsetChange]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    const [steps, walks] = await Promise.all([
      loadWeekSteps(userId, weekDates),
      loadWalks(userId),
    ]);
    setWeekData(steps);

    const wMap: Record<string, { distKm: number; steps: number }> = {};
    for (const w of walks) {
      const d = w.date.split('T')[0];
      if (!wMap[d]) wMap[d] = { distKm: 0, steps: 0 };
      wMap[d].distKm += (w.distanceMeters || 0) / 1000;
      wMap[d].steps += (w.steps || 0);
    }
    setWeekWalks(wMap);
    setTooltip(null);
  }, [userId, weekOffset]);
  useEffect(() => { loadData(); }, [loadData]);

  const today = todayStr();
  const targetGoal = metricMode === 'steps' ? stepsGoal : distanceGoal;

  // Values in current metric, combining step sensor data and direct workout metrics
  const dayValues = weekData.map((d) => {
    const walkInfo = weekWalks[d.date];
    const walkSteps = walkInfo?.steps || 0;
    const totalDaySteps = Math.max(d.totalSteps, walkSteps) > 0
      ? Math.max(d.totalSteps, d.totalSteps + Math.max(0, walkSteps - (d.totalSteps > 0 ? walkSteps * 0.5 : 0)))
      : 0;

    if (metricMode === 'steps') {
      return totalDaySteps;
    }

    const stepDist = stepsToDistance(d.totalSteps, distanceUnit);
    const walkDistInUnit = walkInfo?.distKm
      ? (distanceUnit === 'mi' ? walkInfo.distKm * 0.621371 : walkInfo.distKm)
      : 0;
    return Math.max(stepDist, walkDistInUnit, stepDist + walkDistInUnit * 0.7);
  });

  const actualMax = Math.max(...dayValues, 0);
  const roughMax = Math.max(targetGoal * 1.15, actualMax * 1.05, metricMode === 'steps' ? 100 : 1);
  const { lines: gridlines, maxVal } = computeYScale(roughMax, metricMode, distanceUnit);
  const goalBot = (targetGoal / maxVal) * CHART_H;
  const barW = containerWidth / 7;

  const { combinedHandlers } = useSwipeGestures(
    () => onChangeRef.current(weekOffsetRef.current + 1 <= 0 ? weekOffsetRef.current + 1 : weekOffsetRef.current),
    () => onChangeRef.current(weekOffsetRef.current - 1),
    onScrollLock,
    28,
  );

  const canGoNextWeek = weekOffset < 0;
  const weekLabel = weekOffset === 0 ? 'this week' : weekOffset === -1 ? 'last week' : `${Math.abs(weekOffset)}w ago`;

  // Calculate prior week sum to compare percentage difference
  const [priorWeekTotal, setPriorWeekTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    const priorDates = getWeekDates(weekOffset - 1);
    loadWeekSteps(userId, priorDates).then((priorSteps) => {
      const sum = priorSteps.reduce((acc, curr) => acc + curr.totalSteps, 0);
      setPriorWeekTotal(sum);
    });
  }, [userId, weekOffset]);

  const currentWeekTotal = weekData.reduce((acc, curr) => acc + curr.totalSteps, 0);
  const weekDiffPct = priorWeekTotal && priorWeekTotal > 0
    ? Math.round(((currentWeekTotal - priorWeekTotal) / priorWeekTotal) * 100)
    : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {metricMode === 'steps' ? 'Daily Steps' : 'Daily Distance'}
            </Text>
            {/* Triangle percentage comparison indicator vs previous week */}
            {weekDiffPct !== 0 && (
              <View style={[styles.comparisonPill, { backgroundColor: weekDiffPct > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)' }]}>
                <Text style={[styles.triangleIcon, { color: weekDiffPct > 0 ? '#10b981' : '#ef4444' }]}>
                  {weekDiffPct > 0 ? '▲' : '▼'}
                </Text>
                <Text style={[styles.comparisonText, { color: weekDiffPct > 0 ? '#10b981' : '#ef4444' }]}>
                  {Math.abs(weekDiffPct)}%
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onWeekOffsetChange(weekOffset - 1);
              }}
              style={[styles.arrowBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={14} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!canGoNextWeek) return;
                Haptics.selectionAsync().catch(() => {});
                onWeekOffsetChange(weekOffset + 1);
              }}
              disabled={!canGoNextWeek}
              style={[
                styles.arrowBtn,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                !canGoNextWeek && { opacity: 0.3 },
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={14} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={[styles.cardSub, { color: colors.textMuted }]}>
          {formatWeekRange(weekDates[0], weekDates[6])} · {weekLabel}
        </Text>
      </View>

      <View {...combinedHandlers}>
        <View style={{ height: CHART_H, flexDirection: 'row', position: 'relative' }}>
          <View style={{ width: Y_AXIS_W }} />
          <View
            style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - containerWidth) > 1) {
                setContainerWidth(w);
              }
            }}
          >
            {weekData.map((day, i) => {
              const val = dayValues[i];
              const ratio = val / maxVal;
              const isSelected = day.date === selectedDate;
              const isToday = day.date === today;
              const atGoal = val >= targetGoal;
              const activeColor = getMetricThemeColor(metricMode, colors.primary);
              const barColor = isSelected || isToday ? activeColor
                : atGoal ? activeColor + 'bb' : activeColor + '40';
              return (
                <TouchableOpacity
                  key={day.date}
                  style={{ width: barW, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}
                  activeOpacity={0.72}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    onDaySelect(day.date);
                    if (tooltip?.idx === i) { setTooltip(null); return; }
                    setTooltip({
                      idx: i,
                      title: formatMetricVal(val, metricMode, distanceUnit),
                      sub: shortDate(day.date),
                    });
                  }}
                >
                  <AnimatedBar ratio={ratio} color={barColor} delay={i * 35} w={barW} />
                  {isSelected && (
                    <View style={{ position: 'absolute', inset: 0, borderWidth: 1.5, borderColor: activeColor, borderRadius: 5, opacity: 0.35 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <YAxisOverlay lines={gridlines} maxVal={maxVal} />

          {/* Goal line */}
          {!hideGoalLine && (
            <View pointerEvents="none" style={{
              position: 'absolute', bottom: goalBot, left: Y_AXIS_W, right: 0,
              height: 2.5, backgroundColor: GOAL_COLOR, borderRadius: 1,
            }} />
          )}

          {tooltip !== null && weekData[tooltip.idx] && (() => {
            const val = dayValues[tooltip.idx];
            const barHeight = (val / maxVal) * CHART_H;
            const barCenterX = Y_AXIS_W + tooltip.idx * barW + barW / 2;
            return (
              <Tooltip
                title={tooltip.title}
                sub={tooltip.sub}
                posLeft={barCenterX - TOOLTIP_W / 2}
                posBottom={barHeight + 10}
                isDark={isDark}
              />
            );
          })()}
        </View>

        {/* X-axis day labels */}
        <View style={{ flexDirection: 'row', marginTop: 5 }}>
          <View style={{ width: Y_AXIS_W }} />
          {weekDates.map((date, i) => {
            const isSel = date === selectedDate;
            const isToday = date === today;
            return (
              <View key={date} style={{ width: barW, alignItems: 'center' }}>
                <Text style={[
                  styles.axisLbl,
                  { color: isSel ? colors.primary : isToday ? colors.primary + 'aa' : colors.textMuted },
                  isSel && { fontWeight: '800' },
                ]}>
                  {DAY_LABELS[i]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// HOURLY BAR CHART
// ══════════════════════════════════════════════════════════════
export function HourlyBarChart({
  userId,
  stepsGoal,
  distanceGoal,
  metricMode,
  distanceUnit,
  selectedDate,
  onDayChange,
  onScrollLock,
}: Props & {
  selectedDate: string;
  onDayChange: (date: string) => void;
  onScrollLock?: (locked: boolean) => void;
}) {
  const { colors, isDark } = useTheme();
  const [dayData, setDayData] = useState<DailyStepData | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [containerWidth, setContainerWidth] = useState<number>(BAR_AREA_W);
  const selectedDateRef = useRef(selectedDate);
  const onDayRef = useRef(onDayChange);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  useEffect(() => { onDayRef.current = onDayChange; }, [onDayChange]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    const [dData, walks] = await Promise.all([
      loadDaySteps(userId, selectedDate),
      loadWalks(userId),
    ]);

    // Merge day's workouts into hourly values
    const dayWalks = walks.filter((w) => w.date.startsWith(selectedDate));
    const mergedSteps = dData ? [...dData.hourlySteps] : new Array(24).fill(0);
    while (mergedSteps.length < 24) mergedSteps.push(0);

    let extraSteps = 0;
    for (const w of dayWalks) {
      const h = new Date(w.date).getHours();
      const wSteps = w.steps || 0;
      mergedSteps[h] = (mergedSteps[h] || 0) + wSteps;
      extraSteps += wSteps;
    }

    setDayData({
      date: selectedDate,
      totalSteps: (dData?.totalSteps || 0) + extraSteps,
      hourlySteps: mergedSteps,
    });
    setTooltip(null);
  }, [userId, selectedDate]);
  useEffect(() => { loadData(); }, [loadData]);

  const rawHourly = dayData?.hourlySteps ?? new Array(24).fill(0);
  const hourlyValues = rawHourly.map((steps) =>
    metricMode === 'steps' ? steps : stepsToDistance(steps, distanceUnit)
  );

  const actualMax = Math.max(...hourlyValues, 0);
  const roughMax = Math.max(actualMax * 1.15, metricMode === 'steps' ? 100 : 0.5);
  const { lines: gridlines, maxVal } = computeYScale(roughMax, metricMode, distanceUnit);
  const barW = containerWidth / 24;
  const today = todayStr();

  const totalVal = metricMode === 'steps'
    ? (dayData?.totalSteps ?? 0)
    : stepsToDistance(dayData?.totalSteps ?? 0, distanceUnit);

  const { combinedHandlers } = useSwipeGestures(
    () => {
      onDayRef.current(addDays(selectedDateRef.current, -1));
    },
    () => {
      const next = addDays(selectedDateRef.current, 1);
      if (next <= todayStr()) onDayRef.current(next);
    },
    onScrollLock,
    28,
  );

  const canGoNextDay = selectedDate < today;
  const dayLabel = selectedDate === today ? 'Today' : formatDayLabel(selectedDate);

  // Day-over-day comparison vs previous day
  const [priorDaySteps, setPriorDaySteps] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    const prevDate = addDays(selectedDate, -1);
    loadDaySteps(userId, prevDate).then((p) => {
      setPriorDaySteps(p?.totalSteps || 0);
    });
  }, [userId, selectedDate]);

  const currentSteps = dayData?.totalSteps || 0;
  const dayDiffPct = priorDaySteps && priorDaySteps > 0
    ? Math.round(((currentSteps - priorDaySteps) / priorDaySteps) * 100)
    : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {metricMode === 'steps' ? 'Hourly Steps' : 'Hourly Distance'}
            </Text>
            {/* Triangle percentage comparison indicator vs yesterday */}
            {dayDiffPct !== 0 && (
              <View style={[styles.comparisonPill, { backgroundColor: dayDiffPct > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)' }]}>
                <Text style={[styles.triangleIcon, { color: dayDiffPct > 0 ? '#10b981' : '#ef4444' }]}>
                  {dayDiffPct > 0 ? '▲' : '▼'}
                </Text>
                <Text style={[styles.comparisonText, { color: dayDiffPct > 0 ? '#10b981' : '#ef4444' }]}>
                  {Math.abs(dayDiffPct)}%
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onDayChange(addDays(selectedDate, -1));
              }}
              style={[styles.arrowBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={14} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!canGoNextDay) return;
                const next = addDays(selectedDate, 1);
                if (next <= today) {
                  Haptics.selectionAsync().catch(() => {});
                  onDayChange(next);
                }
              }}
              disabled={!canGoNextDay}
              style={[
                styles.arrowBtn,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                !canGoNextDay && { opacity: 0.3 },
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={14} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={[styles.cardSub, { color: colors.textMuted }]}>
          {dayLabel} · {formatMetricVal(totalVal, metricMode, distanceUnit)} total
        </Text>
      </View>

      <View {...combinedHandlers}>
        <View style={{ height: CHART_H, flexDirection: 'row', position: 'relative' }}>
          <View style={{ width: Y_AXIS_W }} />
          <View
            style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - containerWidth) > 1) {
                setContainerWidth(w);
              }
            }}
          >
            {hourlyValues.map((val: number, hour: number) => {
              const ratio = val / maxVal;
              const alphaByte = Math.min(255, Math.round(65 + (actualMax > 0 ? val / actualMax : 0) * 190));
              const alpha = alphaByte.toString(16).padStart(2, '0');
              const activeColor = getMetricThemeColor(metricMode, colors.primary);
              return (
                <TouchableOpacity
                  key={hour}
                  style={{ width: barW, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}
                  activeOpacity={0.72}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    if (tooltip?.idx === hour) { setTooltip(null); return; }
                    setTooltip({
                      idx: hour,
                      title: formatMetricVal(val, metricMode, distanceUnit),
                      sub: `${hourRange(hour)} · ${shortDate(selectedDate)}`,
                    });
                  }}
                >
                  <AnimatedBar ratio={ratio} color={activeColor + alpha} delay={hour * 8} w={barW} />
                </TouchableOpacity>
              );
            })}
          </View>

          <YAxisOverlay lines={gridlines} maxVal={maxVal} />

          {tooltip !== null && (() => {
            const barHeight = (hourlyValues[tooltip.idx] / maxVal) * CHART_H;
            const barCenterX = Y_AXIS_W + tooltip.idx * barW + barW / 2;
            return (
              <Tooltip
                title={tooltip.title}
                sub={tooltip.sub}
                posLeft={barCenterX - TOOLTIP_W / 2}
                posBottom={barHeight + 10}
                isDark={isDark}
              />
            );
          })()}
        </View>

        {/* X-axis */}
        <View style={{ flexDirection: 'row', marginTop: 5 }}>
          <View style={{ width: Y_AXIS_W }} />
          {Array.from({ length: 24 }, (_, i) => (
            <View key={i} style={{ width: barW, alignItems: 'center' }}>
              {HOUR_TICK[i] !== undefined && (
                <Text style={[styles.axisLbl, { color: colors.textMuted, fontSize: 8 }]}>{HOUR_TICK[i]}</Text>
              )}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// CUMULATIVE LINE CHART
// ══════════════════════════════════════════════════════════════
export function CumulativeLineChart({
  userId,
  stepsGoal,
  distanceGoal,
  metricMode,
  distanceUnit,
  selectedDate,
}: Props & { selectedDate: string }) {
  const { colors, isDark } = useTheme();
  const [dayData, setDayData] = useState<DailyStepData | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [containerWidth, setContainerWidth] = useState<number>(BAR_AREA_W);

  const loadData = useCallback(async () => {
    if (!userId) return;
    const [dData, walks] = await Promise.all([
      loadDaySteps(userId, selectedDate),
      loadWalks(userId),
    ]);

    const dayWalks = walks.filter((w) => w.date.startsWith(selectedDate));
    const mergedSteps = dData ? [...dData.hourlySteps] : new Array(24).fill(0);
    while (mergedSteps.length < 24) mergedSteps.push(0);

    let extraSteps = 0;
    for (const w of dayWalks) {
      const h = new Date(w.date).getHours();
      const wSteps = w.steps || 0;
      mergedSteps[h] = (mergedSteps[h] || 0) + wSteps;
      extraSteps += wSteps;
    }

    setDayData({
      date: selectedDate,
      totalSteps: (dData?.totalSteps || 0) + extraSteps,
      hourlySteps: mergedSteps,
    });
    setTooltip(null);
  }, [userId, selectedDate]);
  useEffect(() => { loadData(); }, [loadData]);

  // If viewing today, do not project or extend dots/line past current hour
  const isToday = selectedDate === todayStr();
  const currentHour = new Date().getHours();
  const maxValidHour = isToday ? Math.min(23, currentHour) : 23;

  useEffect(() => {
    setRevealedCount(0);
    let c = 0;
    const timer = setInterval(() => {
      c++;
      setRevealedCount(c);
      if (c >= maxValidHour) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [selectedDate, maxValidHour]);

  const rawHourly = dayData?.hourlySteps ?? new Array(24).fill(0);
  const hourlyValues = rawHourly.map((steps) =>
    metricMode === 'steps' ? steps : stepsToDistance(steps, distanceUnit)
  );

  const cumulative: number[] = [];
  let running = 0;
  for (let h = 0; h < 24; h++) {
    running += hourlyValues[h];
    cumulative.push(running);
  }

  // Value achieved as of the latest active hour
  const finalVal = cumulative[maxValidHour] ?? (cumulative[23] ?? 0);
  const targetGoal = metricMode === 'steps' ? stepsGoal : distanceGoal;
  const roughMax = Math.max(finalVal * 1.15, targetGoal * 1.15, metricMode === 'steps' ? 1000 : 1.0);
  const { lines: gridlines, maxVal } = computeYScale(roughMax, metricMode, distanceUnit);
  const goalBot = Math.min((targetGoal / maxVal) * CHART_H, CHART_H);

  const stepX = (containerWidth - 12) / 23;
  const points = cumulative.map((val, i) => ({
    x: 6 + i * stepX,
    y: Math.max(4, CHART_H - (val / maxVal) * (CHART_H - 10) - 5),
  }));

  const ampm = (h: number) => h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;
  const activeThemeColor = getMetricThemeColor(metricMode, colors.primary);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          {metricMode === 'steps' ? 'Cumulative Steps' : 'Cumulative Distance'}
        </Text>
        <Text style={[styles.cardSub, { color: colors.textMuted }]}>
          Total: {formatMetricVal(finalVal, metricMode, distanceUnit)} · {shortDate(selectedDate)}
        </Text>
      </View>

      <View style={{ height: CHART_H, flexDirection: 'row', position: 'relative' }}>
        <View style={{ width: Y_AXIS_W }} />

        <View
          style={{ flex: 1, position: 'relative' }}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - containerWidth) > 1) {
              setContainerWidth(w);
            }
          }}
        >
          {/* Line segments capped at maxValidHour */}
          {points.slice(0, Math.min(revealedCount, maxValidHour) + 1).map((pt, i) => {
            if (i === 0) return null;
            const prev = points[i - 1];
            const dx = pt.x - prev.x;
            const dy = pt.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const midX = (prev.x + pt.x) / 2;
            const midY = (prev.y + pt.y) / 2;
            return (
              <View key={i} pointerEvents="none" style={{
                position: 'absolute',
                left: midX - len / 2,
                top: midY - 1,
                width: len,
                height: 2,
                backgroundColor: activeThemeColor,
                transform: [{ rotate: `${angle}deg` }],
              }} />
            );
          })}

          {/* Dots capped at maxValidHour */}
          {points.slice(0, Math.min(revealedCount, maxValidHour) + 1).map((pt, i) => {
            const isLast = i === Math.min(revealedCount, maxValidHour);
            return (
              <TouchableOpacity
                key={`dot${i}`}
                style={{
                  position: 'absolute',
                  left: pt.x - 12,
                  top: pt.y - 12,
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (tooltip?.idx === i) { setTooltip(null); return; }
                  setTooltip({
                    idx: i,
                    title: formatMetricVal(cumulative[i], metricMode, distanceUnit),
                    sub: `As of ${ampm(i)} · ${shortDate(selectedDate)}`,
                  });
                }}
              >
                <View style={{
                  width: isLast ? 7 : 5,
                  height: isLast ? 7 : 5,
                  borderRadius: 4,
                  backgroundColor: activeThemeColor,
                  opacity: isLast ? 1 : 0.5,
                }} />
              </TouchableOpacity>
            );
          })}
        </View>

        <YAxisOverlay lines={gridlines} maxVal={maxVal} />

        {/* Goal line on top */}
        <View pointerEvents="none" style={{
          position: 'absolute', bottom: goalBot, left: Y_AXIS_W, right: 0,
          height: 2.5, backgroundColor: GOAL_COLOR, borderRadius: 1,
        }} />

        {tooltip !== null && points[tooltip.idx] && (() => {
          const pt = points[tooltip.idx];
          const ptBottom = CHART_H - pt.y;
          const dotCenterX = Y_AXIS_W + pt.x;
          return (
            <Tooltip
              title={tooltip.title}
              sub={tooltip.sub}
              posLeft={dotCenterX - TOOLTIP_W / 2}
              posBottom={ptBottom + 10}
              isDark={isDark}
            />
          );
        })()}
      </View>

      <View style={{ flexDirection: 'row', marginTop: 5 }}>
        <View style={{ width: Y_AXIS_W }} />
        {Array.from({ length: 24 }, (_, i) => (
          <View key={i} style={{ width: BAR_AREA_W / 24, alignItems: 'center' }}>
            {HOUR_TICK[i] !== undefined && (
              <Text style={[styles.axisLbl, { color: colors.textMuted, fontSize: 8 }]}>{HOUR_TICK[i]}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════
export interface StepsChartsProps {
  userId?: string;
  stepsGoal: number;
  distanceGoal?: number;
  unitSystem?: 'us_customary' | 'metric';
  onUnitSystemChange?: (newSystem: 'us_customary' | 'metric') => void;
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  onScrollLock?: (locked: boolean) => void;
}

export function StepsCharts({
  userId,
  stepsGoal,
  distanceGoal = 5,
  unitSystem = 'us_customary',
  onUnitSystemChange,
  selectedDate: externalDate,
  onSelectDate: externalOnSelectDate,
  onScrollLock,
}: StepsChartsProps) {
  const { colors, isDark } = useTheme();
  const [weekOffset, setWeekOffset] = useState(0);
  const [internalDate, setInternalDate] = useState(todayStr());
  const [metricMode, setMetricMode] = useState<MetricMode>('steps');
  const [localUnitSystem, setLocalUnitSystem] = useState<'us_customary' | 'metric'>(unitSystem);

  useEffect(() => {
    setLocalUnitSystem(unitSystem);
  }, [unitSystem]);

  const effectiveUnitSystem = onUnitSystemChange ? unitSystem : localUnitSystem;
  const distanceUnit: 'mi' | 'km' = effectiveUnitSystem === 'us_customary' ? 'mi' : 'km';

  // Toggle unit between mi and km
  const toggleDistanceUnit = () => {
    const nextSystem: 'us_customary' | 'metric' = effectiveUnitSystem === 'us_customary' ? 'metric' : 'us_customary';
    Haptics.selectionAsync().catch(() => {});
    setLocalUnitSystem(nextSystem);
    onUnitSystemChange?.(nextSystem);
  };

  const selectedDate = externalDate || internalDate;
  const setSelectedDate = (d: string) => {
    setInternalDate(d);
    externalOnSelectDate?.(d);
  };

  // Compute effective distance goal in active unit
  const effectiveDistanceGoal = effectiveUnitSystem === 'us_customary'
    ? +(distanceGoal * 0.621371).toFixed(1)
    : distanceGoal;

  const handleDayChange = (newDate: string) => {
    if (newDate > todayStr()) return;
    setSelectedDate(newDate);
    const targetOffset = getWeekOffsetForDate(newDate);
    if (targetOffset !== weekOffset) {
      setWeekOffset(targetOffset);
    }
  };

  // Sync externalDate changes to weekOffset
  useEffect(() => {
    if (externalDate) {
      const targetOffset = getWeekOffsetForDate(externalDate);
      if (targetOffset !== weekOffset) {
        setWeekOffset(targetOffset);
      }
    }
  }, [externalDate]);

  const metricAnim = useRef(new Animated.Value(metricMode === 'steps' ? 0 : metricMode === 'distance' ? 1 : 2)).current;

  const handleSwitchMetric = (mode: MetricMode) => {
    if (mode === metricMode) {
      if (mode === 'distance') {
        // Tapping distance tab while active toggles unit between mi and km
        toggleDistanceUnit();
      }
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setMetricMode(mode);
    const targetVal = mode === 'steps' ? 0 : mode === 'distance' ? 1 : 2;
    Animated.timing(metricAnim, {
      toValue: targetVal,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View style={{ gap: 14 }}>
      {/* Metric Mode Switcher Bar (Identical style to Profile Tab Chooser) */}
      <View style={[styles.subTabBarContainer, { backgroundColor: isDark ? '#000000' : '#ffffff', borderBottomColor: isDark ? '#1f1f24' : '#e5e5ea' }]}>
        <TouchableOpacity
          style={styles.subTabBtn}
          onPress={() => handleSwitchMetric('steps')}
          activeOpacity={0.75}
        >
          <Animated.Text
            style={[
              styles.subTabText,
              {
                color: metricMode === 'steps' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                fontWeight: metricMode === 'steps' ? '800' : '600',
              },
            ]}
          >
            steps
          </Animated.Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.subTabBtn}
          onPress={() => handleSwitchMetric('distance')}
          activeOpacity={0.75}
        >
          <Animated.Text
            style={[
              styles.subTabText,
              {
                color: metricMode === 'distance' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                fontWeight: metricMode === 'distance' ? '800' : '600',
              },
            ]}
          >
            distance
          </Animated.Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.subTabBtn}
          onPress={() => handleSwitchMetric('history')}
          activeOpacity={0.75}
        >
          <Animated.Text
            style={[
              styles.subTabText,
              {
                color: metricMode === 'history' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                fontWeight: metricMode === 'history' ? '800' : '600',
              },
            ]}
          >
            history
          </Animated.Text>
        </TouchableOpacity>

        {/* Animated line highlighted under selected metric */}
        <Animated.View
          style={[
            styles.subTabHighlightLine,
            {
              backgroundColor: isDark ? '#ffffff' : '#000000',
              left: metricAnim.interpolate({
                inputRange: [0, 1, 2],
                outputRange: ['0%', '33.33%', '66.66%'],
              }),
              width: '33.33%',
            },
          ]}
        />
      </View>

      {/* Content depending on whether history or steps/distance is selected */}
      {metricMode === 'history' ? (
        <WalkHistorySection
          userId={userId}
          unitSystem={unitSystem}
        />
      ) : (
        <View style={styles.chartsContentWrapper}>
          {/* AI Movement Insights Card with Live Generation & 4-Point Star Sweep */}
          <AIActivityInsightsCard
            userId={userId}
            metricMode={metricMode}
            distanceUnit={distanceUnit}
            stepsGoal={stepsGoal}
            distanceGoal={effectiveDistanceGoal}
          />

          <WeeklyBarChart
            userId={userId}
            stepsGoal={stepsGoal}
            distanceGoal={effectiveDistanceGoal}
            metricMode={metricMode}
            distanceUnit={distanceUnit}
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            selectedDate={selectedDate}
            onDaySelect={setSelectedDate}
            onScrollLock={onScrollLock}
          />
          <HourlyBarChart
            userId={userId}
            stepsGoal={stepsGoal}
            distanceGoal={effectiveDistanceGoal}
            metricMode={metricMode}
            distanceUnit={distanceUnit}
            selectedDate={selectedDate}
            onDayChange={handleDayChange}
            onScrollLock={onScrollLock}
          />
          <CumulativeLineChart
            userId={userId}
            stepsGoal={stepsGoal}
            distanceGoal={effectiveDistanceGoal}
            metricMode={metricMode}
            distanceUnit={distanceUnit}
            selectedDate={selectedDate}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartsContentWrapper: {
    paddingHorizontal: 16,
    gap: 14,
  },
  card: { borderRadius: 20, borderWidth: 1, padding: CARD_PAD },
  cardHeader: { marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  cardSub: { fontSize: 11.5, marginTop: 3, fontWeight: '500' },
  axisLbl: { fontSize: 9.5, fontWeight: '600', marginTop: 3 },
  arrowBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    position: 'relative',
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  subTabHighlightLine: {
    position: 'absolute',
    bottom: -1,
    height: 3,
    borderRadius: 1.5,
    zIndex: 5,
  },
  subTabBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  subTabText: {
    fontSize: 14.5,
    letterSpacing: -0.2,
    textTransform: 'lowercase',
  },
  comparisonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  triangleIcon: {
    fontSize: 9,
    fontWeight: '900',
  },
  comparisonText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
