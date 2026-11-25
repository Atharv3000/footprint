import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import type { CustomRoutine } from '@/constants/workoutStorage';

export function WorkoutRoutineCarousel({
  routines,
  onSelect,
  initialIndex = 0,
}: {
  routines: CustomRoutine[];
  onSelect: (routine: CustomRoutine) => void;
  initialIndex?: number;
}) {
  const { colors, isDark } = useTheme();
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const clampedInitial = routines.length > 0 ? Math.max(0, Math.min(routines.length - 1, initialIndex)) : 0;
  const [index, setIndex] = useState(clampedInitial);
  const loop = routines.length > 1;
  const routineKey = routines.map((routine) => routine.id).join('|');
  const pages = loop ? [routines[routines.length - 1], ...routines, routines[0]] : routines;

  useEffect(() => {
    setIndex(clampedInitial);
    if (!width) return;
    const targetPage = loop ? clampedInitial + 1 : 0;
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollTo({ x: width * targetPage, animated: false })
    );
    return () => cancelAnimationFrame(frame);
  }, [width, routineKey, loop, clampedInitial]);

  const settle = (offset: number) => {
    if (!width || !routines.length) return;
    const page = Math.round(offset / width);
    if (loop && page === 0) {
      scroll.current?.scrollTo({ x: width * routines.length, animated: false });
      setIndex(routines.length - 1);
    } else if (loop && page >= routines.length + 1) {
      scroll.current?.scrollTo({ x: width, animated: false });
      setIndex(0);
    } else {
      setIndex(Math.max(0, Math.min(routines.length - 1, page - (loop ? 1 : 0))));
    }
  };

  const buttonForeground = isDark ? '#09090b' : '#ffffff';

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          scrollEnabled={loop}
          onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.x)}
        >
          {pages.map((routine, page) => {
            const sentinel = loop && (page === 0 || page === pages.length - 1);
            return (
              <View
                key={`${page}-${routine.id}`}
                style={{ width, paddingHorizontal: loop ? 5 : 0 }}
                accessibilityElementsHidden={sentinel}
                importantForAccessibility={sentinel ? 'no-hide-descendants' : 'auto'}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Start ${routine.title} workout`}
                  onPress={() => onSelect(routine)}
                  style={[s.start, { backgroundColor: colors.primary }]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="play" size={16} color={buttonForeground} />
                  <Text numberOfLines={1} style={[s.startText, { color: buttonForeground }]}>
                    Start {routine.title}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
      {loop && (
        <View style={s.dotsRow}>
          {routines.map((routine, i) => {
            const active = i === index;
            return (
              <TouchableOpacity
                key={routine.id}
                accessibilityRole="button"
                accessibilityLabel={`Select ${routine.title}`}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => {
                  setIndex(i);
                  scroll.current?.scrollTo({ x: width * (i + 1), animated: true });
                }}
              >
                <View
                  style={[
                    s.dot,
                    {
                      width: active ? 16 : 6,
                      backgroundColor: active
                        ? colors.primary
                        : isDark
                        ? 'rgba(255,255,255,0.22)'
                        : 'rgba(0,0,0,0.18)',
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  start: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  startText: {
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
