import React, { useRef, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/constants/ThemeContext';

export interface FlipNumberPickerProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
}

export function FlipNumberPicker({
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: FlipNumberPickerProps) {
  const { colors: pickerColors } = useTheme();
  const ITEM_HEIGHT = 48;
  const scrollViewRef = useRef<ScrollView | null>(null);

  const numbers = useMemo(() => {
    const list: number[] = [];
    for (let i = min; i <= max; i += step) {
      list.push(i);
    }
    return list;
  }, [min, max, step]);

  const clampedValue = Math.min(Math.max(value, min), max);
  const selectedIndex = Math.max(0, numbers.indexOf(clampedValue));

  useEffect(() => {
    if (scrollViewRef.current && selectedIndex >= 0) {
      scrollViewRef.current.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    }
  }, [selectedIndex]);

  const handleIncrement = () => {
    Haptics.selectionAsync().catch(() => {});
    const next = Math.min(max, clampedValue + step);
    onChange(next);
  };

  const handleDecrement = () => {
    Haptics.selectionAsync().catch(() => {});
    const next = Math.max(min, clampedValue - step);
    onChange(next);
  };

  const handleScrollEnd = (e: any) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / ITEM_HEIGHT);
    const safeIndex = Math.max(0, Math.min(numbers.length - 1, index));
    if (numbers[safeIndex] !== undefined && numbers[safeIndex] !== clampedValue) {
      Haptics.selectionAsync().catch(() => {});
      onChange(numbers[safeIndex]);
    }
  };

  return (
    <View style={[styles.pickerColumnContainer, { backgroundColor: pickerColors.surfaceElevated, borderColor: pickerColors.border }]}>
      {/* Up Arrow for Quick Stepping */}
      <TouchableOpacity
        style={styles.pickerArrowBtn}
        onPress={handleIncrement}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 4, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-up" size={18} color={pickerColors.primary} />
      </TouchableOpacity>

      {/* Central Scrollable Flip Window */}
      <View style={styles.pickerViewport}>
        <View style={[styles.pickerCenterHighlighter, { backgroundColor: pickerColors.primaryBg, borderColor: pickerColors.primary }]} pointerEvents="none" />
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          nestedScrollEnabled={true}
          contentContainerStyle={{
            paddingVertical: ITEM_HEIGHT,
          }}
        >
          {numbers.map((num) => {
            const isSelected = num === clampedValue;
            return (
              <TouchableOpacity
                key={num}
                style={styles.pickerItemRow}
                onPress={() => onChange(num)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    { color: pickerColors.textMuted },
                    isSelected && [styles.pickerItemTextSelected, { color: pickerColors.primary, fontWeight: '900' }],
                  ]}
                >
                  {num}
                </Text>
                {unit && isSelected && (
                  <Text style={[styles.pickerItemUnit, { color: pickerColors.primary }]}>{unit}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Down Arrow for Quick Stepping */}
      <TouchableOpacity
        style={styles.pickerArrowBtn}
        onPress={handleDecrement}
        activeOpacity={0.7}
        hitSlop={{ top: 4, bottom: 8, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-down" size={18} color={pickerColors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerColumnContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: 4,
    width: '100%',
    minWidth: 80,
  },
  pickerArrowBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  pickerViewport: {
    height: 144, // 3 rows of 48px visible
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  pickerCenterHighlighter: {
    position: 'absolute',
    top: 48,
    left: 4,
    right: 4,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  pickerItemRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pickerItemText: {
    fontSize: 17,
    fontWeight: '700',
  },
  pickerItemTextSelected: {
    fontSize: 22,
    fontWeight: '900',
  },
  pickerItemUnit: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
});
