import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/constants/ThemeContext';

export interface InteractiveScaleRulerProps {
  value: number; // in current units (lbs or kg)
  min?: number;
  max?: number;
  step?: number;
  unit: string;
  onValueChange: (val: number) => void;
  accentColor?: string;
  hideReadout?: boolean;
}

const TICK_WIDTH = 12; // width per whole unit tick

export function InteractiveScaleRuler({
  value,
  min = 40,
  max = 450,
  step = 1,
  unit,
  onValueChange,
  accentColor,
  hideReadout = false,
}: InteractiveScaleRulerProps) {
  const themeContext = useTheme();
  const colors = themeContext?.colors;
  const isDark = themeContext?.isDark ?? colors?.isDark ?? true;
  const activeAccent = accentColor || colors?.primary || '#a3e635';

  const scrollRef = useRef<any>(null);
  const lastHapticVal = useRef<number>(value);
  const isInitialScroll = useRef<boolean>(true);

  // Pre-generate array of tick integers
  const tickCount = Math.floor((max - min) / step) + 1;
  const ticks = React.useMemo(() => {
    return Array.from({ length: tickCount }, (_, i) => min + i * step);
  }, [min, max, step, tickCount]);

  // Center the ruler on mount or when value externally updates
  useEffect(() => {
    if (scrollRef.current) {
      const targetOffset = ((value - min) / step) * TICK_WIDTH;
      if (isInitialScroll.current) {
        isInitialScroll.current = false;
        setTimeout(() => {
          scrollRef.current?.scrollTo({ x: targetOffset, animated: false });
        }, 50);
      } else if (Math.abs(lastHapticVal.current - value) > 0.01) {
        lastHapticVal.current = value;
        scrollRef.current?.scrollTo({ x: targetOffset, animated: true });
      }
    }
  }, [value, min, step]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = Math.max(0, e.nativeEvent.contentOffset.x);
    const index = Math.round(x / TICK_WIDTH);
    const rawVal = min + index * step;
    const clampedVal = Math.min(max, Math.max(min, rawVal));

    if (clampedVal !== lastHapticVal.current) {
      lastHapticVal.current = clampedVal;
      Haptics.selectionAsync().catch(() => {});
      onValueChange(clampedVal);
    }
  };

  return (
    <View style={styles.container}>
      {/* Big Digital Readout */}
      {!hideReadout && (
        <View style={styles.readoutRow}>
          <Text style={[styles.readoutNumber, { color: colors?.text || '#fff' }]}>
            {value}
          </Text>
          <Text style={[styles.readoutUnit, { color: activeAccent }]}>
            {unit}
          </Text>
        </View>
      )}

      {/* Scale Dial Wrapper */}
      <View style={styles.dialBox}>
        {/* Center Indicator Needle */}
        <View style={[styles.centerNeedle, { backgroundColor: activeAccent }]} />
        <View style={[styles.centerTriangle, { borderTopColor: activeAccent }]} />

        {/* Horizontal Ticking Ruler */}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          contentContainerStyle={styles.scrollTrack}
          snapToInterval={TICK_WIDTH}
          decelerationRate="fast"
        >
          {ticks.map((val) => {
            const isMatch = Math.abs(val - value) < step / 2;
            const isMajor = val % 5 === 0;
            const isSuperMajor = val % 10 === 0;

            return (
              <View key={val} style={styles.tickWrapper}>
                <View
                  style={[
                    styles.tickLine,
                    {
                      height: isMatch ? 36 : isSuperMajor ? 32 : isMajor ? 22 : 12,
                      backgroundColor: isMatch
                        ? activeAccent
                        : isSuperMajor
                        ? isDark
                          ? '#cbd5e1'
                          : '#475569'
                        : isMajor
                        ? isDark
                          ? '#a1a1aa'
                          : '#52525b'
                        : isDark
                        ? '#3f3f46'
                        : '#d4d4d8',
                      width: isMatch ? 3.5 : isSuperMajor ? 2.5 : isMajor ? 2 : 1,
                    },
                  ]}
                />
                {isSuperMajor && (
                  <Text
                    style={[
                      styles.tickNumber,
                      { color: isMatch ? activeAccent : isDark ? '#71717a' : '#9ca3af', fontWeight: isMatch ? '900' : '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {val}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 12,
  },
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 16,
  },
  readoutNumber: {
    fontSize: 54,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  readoutUnit: {
    fontSize: 20,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dialBox: {
    width: '100%',
    height: 90,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  centerNeedle: {
    position: 'absolute',
    top: 6,
    width: 3.5,
    height: 48,
    borderRadius: 2,
    zIndex: 10,
  },
  centerTriangle: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    zIndex: 11,
  },
  scrollTrack: {
    paddingHorizontal: '50%', // offsets so first and last tick can align with the center needle
    alignItems: 'flex-start',
    paddingTop: 8,
  },
  tickWrapper: {
    width: TICK_WIDTH,
    alignItems: 'center',
    position: 'relative',
  },
  tickLine: {
    borderRadius: 1,
  },
  tickNumber: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
    width: 36,
    textAlign: 'center',
    position: 'absolute',
    top: 34,
    left: '50%',
    marginLeft: -18,
  },
});
