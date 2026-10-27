import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { loadWeightLogs, recordWeightLog, WeightLogEntry } from '@/constants/workoutStorage';
import { kgToLbs, lbsToKg } from '@/constants/userProfile';

interface WeightLineChartProps {
  userId: string;
  unitSystem?: 'us_customary' | 'metric';
  currentWeightKg: number;
}

const CHART_H = 150;
const Y_AXIS_W = 38;

export function WeightLineChart({
  userId,
  unitSystem = 'us_customary',
  currentWeightKg,
}: WeightLineChartProps) {
  const { colors, isDark } = useTheme();
  const [logs, setLogs] = useState<WeightLogEntry[]>([]);
  const [containerWidth, setContainerWidth] = useState<number>(Dimensions.get('window').width - 64);
  const [tooltip, setTooltip] = useState<{ idx: number; val: number; dateStr: string; x: number; y: number } | null>(null);

  const isLbs = unitSystem === 'us_customary';
  const unitLabel = isLbs ? 'lb' : 'kg';

  const loadData = useCallback(async () => {
    if (!userId) return;
    const loaded = await loadWeightLogs(userId);
    // Ensure current profile weight is also tracked if latest log doesn't match
    if (loaded.length === 0 || Math.abs(loaded[loaded.length - 1].weightKg - currentWeightKg) > 0.1) {
      await recordWeightLog(userId, currentWeightKg);
      const reloaded = await loadWeightLogs(userId);
      setLogs(reloaded);
    } else {
      setLogs(loaded);
    }
  }, [userId, currentWeightKg]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Convert weight entries to display values in user's unit
  const displayEntries = logs.map((entry) => {
    const val = isLbs ? Math.round(kgToLbs(entry.weightKg) * 10) / 10 : Math.round(entry.weightKg * 10) / 10;
    const d = new Date(entry.date);
    const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      ...entry,
      displayVal: val,
      dateLabel,
    };
  });

  const values = displayEntries.map((e) => e.displayVal);
  const minVal = values.length > 0 ? Math.min(...values) : (isLbs ? 150 : 68);
  const maxVal = values.length > 0 ? Math.max(...values) : (isLbs ? 165 : 75);

  // Buffer y-axis range
  const yMin = Math.floor(minVal - 2);
  const yMax = Math.ceil(maxVal + 2);
  const yRange = Math.max(1, yMax - yMin);

  // Compute point positions
  const usableWidth = Math.max(80, containerWidth - Y_AXIS_W - 20);
  const stepX = displayEntries.length > 1 ? usableWidth / (displayEntries.length - 1) : usableWidth / 2;

  const points = displayEntries.map((e, i) => {
    const x = Y_AXIS_W + 10 + (displayEntries.length === 1 ? usableWidth / 2 : i * stepX);
    const ratio = (e.displayVal - yMin) / yRange;
    const y = Math.max(10, CHART_H - ratio * (CHART_H - 24) - 12);
    return { x, y, entry: e, index: i };
  });

  const latestWeight = values.length > 0 ? values[values.length - 1] : (isLbs ? kgToLbs(currentWeightKg) : currentWeightKg);
  const firstWeight = values.length > 0 ? values[0] : latestWeight;
  const netChange = Math.round((latestWeight - firstWeight) * 10) / 10;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="scale-outline" size={17} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Body Weight Trend</Text>
          </View>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>
            Current: <Text style={{ color: colors.text, fontWeight: '700' }}>{latestWeight} {unitLabel}</Text> · {displayEntries.length} check-ins
          </Text>
        </View>

        {netChange !== 0 && (
          <View style={[styles.changeBadge, { backgroundColor: netChange < 0 ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)' }]}>
            <Text style={[styles.changeBadgeText, { color: netChange < 0 ? '#10b981' : '#3b82f6' }]}>
              {netChange > 0 ? `+${netChange}` : netChange} {unitLabel}
            </Text>
          </View>
        )}
      </View>

      {/* Chart Canvas */}
      <View
        style={{ height: CHART_H + 20, position: 'relative' }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - containerWidth) > 2) {
            setContainerWidth(w);
          }
        }}
      >
        {/* Horizontal gridlines */}
        {[0, 0.5, 1].map((ratio, idx) => {
          const y = 10 + ratio * (CHART_H - 24);
          const gridVal = Math.round(yMax - ratio * yRange);
          return (
            <View key={idx} style={[styles.gridRow, { top: y }]}>
              <Text style={[styles.yAxisText, { color: colors.textMuted }]}>{gridVal}</Text>
              <View style={[styles.gridLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
            </View>
          );
        })}

        {/* Line Segments */}
        {points.map((pt, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const midX = (prev.x + pt.x) / 2;
          const midY = (prev.y + pt.y) / 2;
          return (
            <View
              key={`line-${i}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: midX - len / 2,
                top: midY - 1.5,
                width: len,
                height: 3,
                backgroundColor: colors.primary,
                borderRadius: 1.5,
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}

        {/* Data Point Dots */}
        {points.map((pt, i) => {
          const isSelected = tooltip?.idx === i;
          return (
            <TouchableOpacity
              key={`dot-${i}`}
              style={[
                styles.dotTouchable,
                { left: pt.x - 14, top: pt.y - 14 },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                if (tooltip?.idx === i) {
                  setTooltip(null);
                } else {
                  setTooltip({
                    idx: i,
                    val: pt.entry.displayVal,
                    dateStr: pt.entry.dateLabel,
                    x: pt.x,
                    y: pt.y,
                  });
                }
              }}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: isSelected ? '#ffffff' : colors.primary,
                    borderColor: colors.primary,
                    borderWidth: 2,
                  },
                ]}
              />
            </TouchableOpacity>
          );
        })}

        {/* Tooltip Popup */}
        {tooltip && (
          <View
            style={[
              styles.tooltipBox,
              {
                left: Math.max(Y_AXIS_W + 5, Math.min(containerWidth - 85, tooltip.x - 40)),
                top: Math.max(0, tooltip.y - 42),
                backgroundColor: isDark ? '#27272a' : '#18181b',
              },
            ]}
          >
            <Text style={styles.tooltipVal}>{tooltip.val} {unitLabel}</Text>
            <Text style={styles.tooltipDate}>{tooltip.dateStr}</Text>
          </View>
        )}

        {/* X-axis date labels */}
        <View style={styles.xAxisRow}>
          {points.map((pt, i) => {
            // Show first, middle, last to prevent overlap
            const isImportant = i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2);
            if (!isImportant && points.length > 5) return null;
            return (
              <Text
                key={`lbl-${i}`}
                style={[
                  styles.xAxisLabel,
                  {
                    left: pt.x - 24,
                    color: colors.textMuted,
                  },
                ]}
              >
                {pt.entry.dateLabel}
              </Text>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  changeBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  gridRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  yAxisText: {
    width: Y_AXIS_W,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
    paddingRight: 6,
  },
  gridLine: {
    flex: 1,
    height: 1,
  },
  dotTouchable: {
    position: 'absolute',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tooltipBox: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  tooltipVal: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  tooltipDate: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9.5,
  },
  xAxisRow: {
    position: 'absolute',
    bottom: -6,
    left: 0,
    right: 0,
    height: 16,
  },
  xAxisLabel: {
    position: 'absolute',
    width: 48,
    fontSize: 9.5,
    textAlign: 'center',
  },
});
