import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/constants/ThemeContext';

interface DragSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  color: string;
  unit?: string;
  sublabel?: string;
  hideHeader?: boolean;
  onValueChange: (val: number) => void;
}

export function DragSlider({
  label,
  value,
  min,
  max,
  step = 5,
  color,
  unit = 'g',
  sublabel,
  hideHeader = false,
  onValueChange,
}: DragSliderProps) {
  const { colors } = useTheme();
  const [trackWidth, setTrackWidth] = useState<number>(200);
  const trackWidthRef = useRef<number>(200);
  const trackPageXRef = useRef<number>(0);
  const trackViewRef = useRef<View>(null);

  const calculateValueFromPageX = (pageX: number) => {
    const width = trackWidthRef.current || 200;
    const startX = trackPageXRef.current || 0;
    const relativeX = Math.max(0, Math.min(width, pageX - startX));
    const ratio = relativeX / width;
    const rawVal = min + ratio * (max - min);
    const steppedVal = Math.round(rawVal / step) * step;
    return Math.max(min, Math.min(max, steppedVal));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        Haptics.selectionAsync().catch(() => {});
        const newVal = calculateValueFromPageX(evt.nativeEvent.pageX);
        onValueChange(newVal);
      },
      onPanResponderMove: (evt) => {
        const newVal = calculateValueFromPageX(evt.nativeEvent.pageX);
        onValueChange(newVal);
      },
      onPanResponderRelease: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      },
    })
  ).current;

  const currentRatio = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

  return (
    <View style={styles.container}>
      {!hideHeader && (
        <View style={styles.topInfoRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.colorDot, { backgroundColor: color }]} />
            <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.valueText, { color }]}>
              {value}
              <Text style={{ fontSize: 13, color: colors.textMuted }}> {unit}</Text>
            </Text>
            {sublabel && <Text style={[styles.sublabelText, { color: colors.textMuted }]}>{sublabel}</Text>}
          </View>
        </View>
      )}

      {/* Interactive Touch Track Area */}
      <View
        style={styles.touchArea}
        {...panResponder.panHandlers}
      >
        <View
          ref={trackViewRef}
          style={[styles.trackBackground, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setTrackWidth(w);
            trackWidthRef.current = w;
            if (trackViewRef.current) {
              (trackViewRef.current as any).measure?.((_x: any, _y: any, width: number, _height: any, pageX: number) => {
                if (width > 0) {
                  trackPageXRef.current = pageX;
                  trackWidthRef.current = width;
                }
              });
            }
          }}
        >
          {/* Active Colored Fill Bar */}
          <View style={[styles.fillBar, { width: `${currentRatio * 100}%`, backgroundColor: color }]} />

          {/* Smooth Circle Knob */}
          <View
            style={[
              styles.knob,
              {
                left: `${currentRatio * 100}%`,
                backgroundColor: color,
                borderColor: '#09090b',
              },
            ]}
          >
            <View style={styles.knobCenter} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
  },
  topInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  valueText: {
    fontSize: 16,
    fontWeight: '800',
  },
  sublabelText: {
    fontSize: 11,
    marginTop: 1,
  },
  touchArea: {
    paddingVertical: 10,
    justifyContent: 'center',
  },
  trackBackground: {
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    position: 'relative',
    overflow: 'visible',
    justifyContent: 'center',
  },
  fillBar: {
    height: '100%',
    borderRadius: 6,
  },
  knob: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.5,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
    zIndex: 10,
  },
  knobCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
});
