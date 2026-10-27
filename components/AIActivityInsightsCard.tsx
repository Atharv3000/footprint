import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import {
  DailyStepData,
  loadAllStepData,
  getWeekDates,
  parseDate,
} from '@/constants/stepsStorage';
import { loadWalks, WalkRecord } from '@/constants/walkStorage';
import { MetricMode, DISTANCE_COLOR } from './StepsCharts';

interface AIActivityInsightsCardProps {
  userId?: string;
  metricMode: MetricMode;
  distanceUnit: 'mi' | 'km';
  stepsGoal: number;
  distanceGoal: number;
}

type InsightWindow = 'recent' | 'monthly' | 'older';

interface TimePoint {
  label: string;
  value: number; // in current metric (steps count or distance number)
  dateStr: string;
}

const CARD_PAD = 16;
const CHART_H = 135;
const Y_AXIS_W = 42;

export function AIActivityInsightsCard({
  userId,
  metricMode,
  distanceUnit,
  stepsGoal,
  distanceGoal,
}: AIActivityInsightsCardProps) {
  const { colors, isDark } = useTheme();

  // Active time horizon tab: 'recent' (7D), 'monthly' (28D), 'older' (12W checkpoints)
  const [activeWindow, setActiveWindow] = useState<InsightWindow>('recent');
  const [plotAreaWidth, setPlotAreaWidth] = useState<number>(240);
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);

  // Aggregated data states
  const [allStepMap, setAllStepMap] = useState<Record<string, DailyStepData>>({});
  const [walksList, setWalksList] = useState<WalkRecord[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      if (!userId) return;
      try {
        const [stepsMap, loadedWalks] = await Promise.all([
          loadAllStepData(userId),
          loadWalks(userId),
        ]);
        if (isMounted) {
          setAllStepMap(stepsMap || {});
          setWalksList(loadedWalks || []);
        }
      } catch {
        // gracefully fallback
      }
    }
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const targetGoal = metricMode === 'steps' ? stepsGoal : distanceGoal;
  const unitLabel = metricMode === 'steps' ? 'steps' : distanceUnit;
  const primaryThemeColor = metricMode === 'distance' ? DISTANCE_COLOR : colors.primary;

  const getMetricValueForDay = (dateStr: string): number => {
    const dayData = allStepMap[dateStr];
    const baseSteps = dayData?.totalSteps || 0;

    const dayWalks = walksList.filter((w) => w.date && w.date.slice(0, 10) === dateStr);
    const walkSteps = dayWalks.reduce((acc, w) => acc + (w.steps || 0), 0);
    const walkDistKm = dayWalks.reduce((acc, w) => acc + (w.distanceMeters || 0) / 1000, 0);

    const effectiveSteps = Math.max(
      baseSteps,
      baseSteps + Math.max(0, walkSteps - (baseSteps > 0 ? walkSteps * 0.5 : 0))
    );

    if (metricMode === 'steps') {
      return Math.round(effectiveSteps);
    } else {
      const stepDist = distanceUnit === 'mi' ? effectiveSteps * 0.00045 : effectiveSteps * 0.00072;
      const walkDist = distanceUnit === 'mi' ? walkDistKm * 0.621371 : walkDistKm;
      return +Math.max(stepDist, walkDist, stepDist + walkDist * 0.7).toFixed(1);
    }
  };

  // Metrics computation for Apple Health Trends format
  const trendData = useMemo(() => {
    if (activeWindow === 'recent') {
      // Recent: This week (7D) vs Last week baseline
      const thisWeekDates = getWeekDates(0);
      const lastWeekDates = getWeekDates(-1);

      const thisWeekPoints: TimePoint[] = thisWeekDates.map((d) => {
        const dateObj = parseDate(d);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'narrow' });
        return {
          label: dayName,
          value: getMetricValueForDay(d),
          dateStr: d,
        };
      });

      const currentTotal = thisWeekPoints.reduce((acc, p) => acc + p.value, 0);
      const prevTotal = lastWeekDates.reduce((acc, d) => acc + getMetricValueForDay(d), 0);

      const currentDailyAvg = Math.round(currentTotal / (thisWeekPoints.length || 7));
      const prevDailyAvg = Math.round(prevTotal / (lastWeekDates.length || 7));

      const diff = currentDailyAvg - prevDailyAvg;
      const pctChange = prevDailyAvg > 0 ? Math.round((diff / prevDailyAvg) * 100) : 0;
      const isUp = diff >= 0;

      let explanation = '';
      if (pctChange > 10) {
        explanation = `Daily average is up by ${pctChange}% compared to last week. You're maintaining stronger pace earlier in the day.`;
      } else if (pctChange >= -5) {
        explanation = `Daily volume is steady within ${Math.abs(pctChange)}% of last week's pace. Consistent cadence across active days.`;
      } else {
        explanation = `Daily average is down ${Math.abs(pctChange)}% vs last week. Adding a brief evening walk will bring your trend line back up.`;
      }

      return {
        points: thisWeekPoints,
        dailyAvgVal: currentDailyAvg,
        baselineVal: prevDailyAvg,
        baselineLabel: 'Last week avg',
        diffPct: Math.abs(pctChange),
        isUp,
        explanation,
        timeframeTitle: 'Recent (7 Days)',
      };
    } else if (activeWindow === 'monthly') {
      // Monthly: 4 Rolling 7-day intervals (28 days) vs Prior 28 days baseline
      const weekPoints: TimePoint[] = [];
      let totalMonth = 0;
      let prevMonthTotal = 0;

      for (let w = 3; w >= 0; w--) {
        const dates = getWeekDates(-w);
        const wSum = dates.reduce((acc, d) => acc + getMetricValueForDay(d), 0);
        totalMonth += wSum;
        const weekAvg = Math.round(wSum / 7);
        weekPoints.push({
          label: w === 0 ? 'W4' : `W${4 - w}`,
          value: weekAvg,
          dateStr: dates[0],
        });
      }

      for (let w = 7; w >= 4; w--) {
        const dates = getWeekDates(-w);
        prevMonthTotal += dates.reduce((acc, d) => acc + getMetricValueForDay(d), 0);
      }

      const currentDailyAvg = Math.round(totalMonth / 28);
      const prevDailyAvg = Math.round(prevMonthTotal / 28);

      const diff = currentDailyAvg - prevDailyAvg;
      const pctChange = prevDailyAvg > 0 ? Math.round((diff / prevDailyAvg) * 100) : 0;
      const isUp = diff >= 0;

      let explanation = '';
      if (pctChange >= 8) {
        explanation = `Monthly daily average is up ${pctChange}% compared to the prior 28 days, showing positive stamina gains.`;
      } else if (pctChange >= -8) {
        explanation = `Monthly trend is stable within ${Math.abs(pctChange)}% variance. Consistent volume month over month.`;
      } else {
        explanation = `Monthly daily average dipped ${Math.abs(pctChange)}% below your prior 28-day baseline.`;
      }

      return {
        points: weekPoints,
        dailyAvgVal: currentDailyAvg,
        baselineVal: prevDailyAvg,
        baselineLabel: 'Prior 28D avg',
        diffPct: Math.abs(pctChange),
        isUp,
        explanation,
        timeframeTitle: 'Monthly (28 Days)',
      };
    } else {
      // Older / Long term: 6 Checkpoints going back 12 weeks
      const checkpoints: TimePoint[] = [];
      let recentSum = 0;
      let olderSum = 0;

      for (let i = 5; i >= 0; i--) {
        const weekOffset = -(i * 2);
        const dates = getWeekDates(weekOffset);
        const bSum = dates.reduce((acc, d) => acc + getMetricValueForDay(d), 0);
        const dailyAvg = Math.round(bSum / 7);

        if (i < 3) recentSum += dailyAvg;
        else olderSum += dailyAvg;

        checkpoints.push({
          label: i === 0 ? 'Now' : `-${i * 2}w`,
          value: dailyAvg,
          dateStr: dates[0],
        });
      }

      const currentDailyAvg = Math.round(recentSum / 3);
      const prevDailyAvg = Math.round(olderSum / 3);

      const diff = currentDailyAvg - prevDailyAvg;
      const pctChange = prevDailyAvg > 0 ? Math.round((diff / prevDailyAvg) * 100) : 0;
      const isUp = diff >= 0;

      let explanation = isUp
        ? `Long-term trend is upward (+${pctChange}%), with sustained gains above historical baselines.`
        : `Long-term trend is pacing ${Math.abs(pctChange)}% below earlier peak periods.`;

      return {
        points: checkpoints,
        dailyAvgVal: currentDailyAvg,
        baselineVal: prevDailyAvg,
        baselineLabel: 'Older baseline',
        diffPct: Math.abs(pctChange),
        isUp,
        explanation,
        timeframeTitle: 'Historical Baseline',
      };
    }
  }, [allStepMap, walksList, activeWindow, metricMode, distanceUnit]);

  // Dynamic Chart Scale
  const points = trendData.points;
  const allValues = [
    ...points.map((p) => p.value),
    trendData.dailyAvgVal,
    trendData.baselineVal,
  ];
  const maxRaw = Math.max(...allValues, 10);
  const maxVal = Math.ceil(maxRaw * 1.15); // headroom

  // Calculate coords inside the plot canvas (accounting for padding)
  const coords = useMemo(() => {
    if (!points.length || plotAreaWidth <= 0) return [];
    const count = points.length;
    const stepX = count > 1 ? plotAreaWidth / (count - 1) : 0;
    const innerH = CHART_H - 24;

    return points.map((p, idx) => {
      const x = Math.round(idx * stepX);
      const ratio = Math.max(0, Math.min(1, p.value / (maxVal || 1)));
      const y = Math.round(CHART_H - 12 - ratio * innerH);
      return { x, y, value: p.value, label: p.label };
    });
  }, [points, plotAreaWidth, maxVal]);

  // Baseline trend line vertical position
  const baselineRatio = Math.max(0, Math.min(1, trendData.baselineVal / (maxVal || 1)));
  const baselineY = Math.round(CHART_H - 12 - baselineRatio * (CHART_H - 24));

  // Active inspected point
  const activeCoord =
    selectedPointIdx !== null && coords[selectedPointIdx]
      ? coords[selectedPointIdx]
      : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Header matching standard StepsCharts cards */}
      <View style={styles.cardHeader}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Activity Trends
          </Text>

          {/* Timeframe pills */}
          <View style={styles.timeframeTabs}>
            {(
              [
                { id: 'recent', label: 'Recent' },
                { id: 'monthly', label: 'Monthly' },
                { id: 'older', label: 'History' },
              ] as const
            ).map((tab) => {
              const isActive = activeWindow === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.timeframePill,
                    {
                      backgroundColor: isActive
                        ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                        : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    if (activeWindow !== tab.id) {
                      Haptics.selectionAsync().catch(() => {});
                      setActiveWindow(tab.id);
                      setSelectedPointIdx(null);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.timeframePillText,
                      {
                        color: isActive ? colors.text : colors.textMuted,
                        fontWeight: isActive ? '700' : '500',
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Apple Health style Trend KPI Display */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiLeft}>
            <View style={styles.valueRow}>
              <Text style={[styles.bigKpiNumber, { color: colors.text }]}>
                {metricMode === 'steps'
                  ? trendData.dailyAvgVal.toLocaleString()
                  : trendData.dailyAvgVal.toFixed(1)}
              </Text>
              <Text style={[styles.kpiUnit, { color: colors.textMuted }]}>
                {unitLabel}/day
              </Text>
            </View>

            {/* Apple Health Trend Pill: Arrow + Percentage change */}
            <View style={styles.trendIndicatorRow}>
              <View
                style={[
                  styles.trendBadge,
                  {
                    backgroundColor: trendData.isUp
                      ? 'rgba(16, 185, 129, 0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                  },
                ]}
              >
                <Ionicons
                  name={trendData.isUp ? 'arrow-up' : 'arrow-down'}
                  size={12}
                  color={trendData.isUp ? '#10b981' : '#ef4444'}
                />
                <Text
                  style={[
                    styles.trendBadgeText,
                    { color: trendData.isUp ? '#10b981' : '#ef4444' },
                  ]}
                >
                  {trendData.diffPct}%
                </Text>
              </View>

              <Text style={[styles.trendComparisonSub, { color: colors.textMuted }]}>
                vs {trendData.baselineLabel} (
                {metricMode === 'steps'
                  ? trendData.baselineVal.toLocaleString()
                  : trendData.baselineVal.toFixed(1)}
                )
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Graph Area with literal Apple Health trend line and data segments */}
      <View style={{ height: CHART_H, flexDirection: 'row', position: 'relative' }}>
        {/* Y-Axis scale label */}
        <View style={[styles.yAxisCol, { width: Y_AXIS_W }]}>
          <Text style={[styles.axisLbl, { color: colors.textMuted }]}>
            {maxVal >= 1000 ? `${Math.round(maxVal / 1000)}k` : maxVal}
          </Text>
          <Text style={[styles.axisLbl, { color: colors.textMuted }]}>
            {Math.round(maxVal / 2) >= 1000
              ? `${Math.round(maxVal / 2000)}k`
              : Math.round(maxVal / 2)}
          </Text>
          <Text style={[styles.axisLbl, { color: colors.textMuted }]}>0</Text>
        </View>

        {/* Plot Area */}
        <View
          style={styles.plotArea}
          onLayout={(e: LayoutChangeEvent) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - plotAreaWidth) > 1) {
              setPlotAreaWidth(w);
            }
          }}
        >
          {/* Subtle horizontal grid lines */}
          <View
            style={[
              styles.gridLine,
              {
                top: Math.round((CHART_H - 24) * 0.25),
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              },
            ]}
          />
          <View
            style={[
              styles.gridLine,
              {
                top: Math.round((CHART_H - 24) * 0.75),
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              },
            ]}
          />

          {/* LITERAL APPLE HEALTH TREND LINE (Horizontal Dashed Baseline across the graph) */}
          <View
            pointerEvents="none"
            style={[
              styles.baselineTrendLine,
              {
                top: baselineY,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.35)',
              },
            ]}
          />

          {/* Baseline Tag on right side */}
          <View
            pointerEvents="none"
            style={[
              styles.baselineTag,
              {
                top: Math.max(2, baselineY - 14),
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              },
            ]}
          >
            <Text style={[styles.baselineTagText, { color: colors.textMuted }]}>
              Trend Line
            </Text>
          </View>

          {/* Connected Data Line Segments */}
          {coords.map((curr, idx) => {
            if (idx === coords.length - 1) return null;
            const next = coords[idx + 1];
            const dx = next.x - curr.x;
            const dy = next.y - curr.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const midX = (curr.x + next.x) / 2;
            const midY = (curr.y + next.y) / 2;

            return (
              <View
                key={`line-${idx}`}
                pointerEvents="none"
                style={[
                  styles.dataLineSegment,
                  {
                    width: len,
                    left: midX - len / 2,
                    top: midY - 1.25,
                    transform: [{ rotate: `${angle}deg` }],
                    backgroundColor: primaryThemeColor,
                  },
                ]}
              />
            );
          })}

          {/* Interactive Data Point Touch Nodes */}
          {coords.map((coord, idx) => {
            const isSelected = selectedPointIdx === idx;
            return (
              <TouchableOpacity
                key={`dot-${idx}`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSelectedPointIdx(selectedPointIdx === idx ? null : idx);
                }}
                activeOpacity={0.8}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[
                  styles.dotTouchTarget,
                  {
                    left: coord.x - 12,
                    top: coord.y - 12,
                  },
                ]}
              >
                <View
                  style={[
                    styles.dataPointDot,
                    {
                      backgroundColor: isSelected ? colors.surface : primaryThemeColor,
                      borderColor: primaryThemeColor,
                      borderWidth: isSelected ? 3 : 2,
                      transform: [{ scale: isSelected ? 1.3 : 1 }],
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}

          {/* Floating Tooltip for tapped point */}
          {activeCoord && (
            <View
              pointerEvents="none"
              style={[
                styles.pointTooltip,
                {
                  left: Math.max(4, Math.min(plotAreaWidth - 80, activeCoord.x - 40)),
                  top: Math.max(0, activeCoord.y - 32),
                  backgroundColor: isDark ? '#27272a' : '#18181b',
                },
              ]}
            >
              <Text style={styles.pointTooltipText}>
                {activeCoord.label}: {activeCoord.value.toLocaleString()} {unitLabel}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* X-Axis Day/Period Labels */}
      <View style={styles.xAxisRow}>
        <View style={{ width: Y_AXIS_W }} />
        <View style={styles.xAxisLabelsArea}>
          {points.map((p, idx) => (
            <TouchableOpacity
              key={`x-lbl-${idx}`}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSelectedPointIdx(selectedPointIdx === idx ? null : idx);
              }}
              style={styles.xAxisItem}
            >
              <Text
                style={[
                  styles.axisLbl,
                  {
                    color: selectedPointIdx === idx ? primaryThemeColor : colors.textMuted,
                    fontWeight: selectedPointIdx === idx ? '800' : '600',
                  },
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Trend Analysis Brief Note matching clean native styling */}
      <View
        style={[
          styles.insightSummaryBox,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.insightSummaryText, { color: colors.textMuted }]}>
          {trendData.explanation}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: CARD_PAD,
  },
  cardHeader: {
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  timeframeTabs: {
    flexDirection: 'row',
    gap: 4,
  },
  timeframePill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  timeframePillText: {
    fontSize: 11,
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  kpiLeft: {
    gap: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  bigKpiNumber: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  kpiUnit: {
    fontSize: 12,
    fontWeight: '600',
  },
  trendIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  trendComparisonSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  yAxisCol: {
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  axisLbl: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  plotArea: {
    flex: 1,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomWidth: 1,
  },
  baselineTrendLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    zIndex: 1,
  },
  baselineTag: {
    position: 'absolute',
    right: 0,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    zIndex: 2,
  },
  baselineTagText: {
    fontSize: 8.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  dataLineSegment: {
    position: 'absolute',
    height: 2.5,
    borderRadius: 1.25,
    zIndex: 3,
  },
  dotTouchTarget: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  dataPointDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pointTooltip: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  pointTooltipText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  xAxisRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  xAxisLabelsArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xAxisItem: {
    alignItems: 'center',
    minWidth: 16,
  },
  insightSummaryBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  insightSummaryText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '500',
  },
});
