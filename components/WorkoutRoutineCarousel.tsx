import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import type { CustomRoutine } from '@/constants/workoutStorage';

export function WorkoutRoutineCarousel({ routines, onSelect }: {
  routines: CustomRoutine[]; onSelect: (routine: CustomRoutine) => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const loop = routines.length > 1;
  const routineKey = routines.map(routine => routine.id).join('|');
  const pages = loop ? [routines[routines.length - 1], ...routines, routines[0]] : routines;
  useEffect(() => {
    setIndex(0);
    if (!width) return;
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ x: loop ? width : 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [width, routineKey, loop]);
  const settle = (offset: number) => {
    if (!width || !routines.length) return;
    const page = Math.round(offset / width);
    if (loop && page === 0) {
      scroll.current?.scrollTo({ x: width * routines.length, animated: false });
      setIndex(routines.length - 1);
    } else if (loop && page >= routines.length + 1) {
      scroll.current?.scrollTo({ x: width, animated: false });
      setIndex(0);
    } else setIndex(Math.max(0, Math.min(routines.length - 1, page - (loop ? 1 : 0))));
  };
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {width > 0 && <ScrollView ref={scroll} horizontal pagingEnabled directionalLockEnabled
      showsHorizontalScrollIndicator={false} decelerationRate="fast" scrollEnabled={loop}
      onMomentumScrollEnd={event => settle(event.nativeEvent.contentOffset.x)}>
      {pages.map((routine, page) => {
        const sentinel = loop && (page === 0 || page === pages.length - 1);
        return <View key={`${page}-${routine.id}`} style={{ width }} accessibilityElementsHidden={sentinel} importantForAccessibility={sentinel ? 'no-hide-descendants' : 'auto'}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Start ${routine.title} workout`}
            onPress={() => onSelect(routine)} style={[s.start, { backgroundColor: colors.primary }]}>
            <Ionicons name="play" size={17} color="#101609" />
            <Text numberOfLines={1} style={s.startText}>Start {routine.title}</Text>
            <Ionicons name="arrow-forward" size={18} color="#101609" />
          </TouchableOpacity>
        </View>;
      })}
    </ScrollView>}
    {loop && <View style={s.controls}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous workout day" hitSlop={8}
        onPress={() => scroll.current?.scrollTo({ x: width * index, animated: true })} style={s.arrow}>
        <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted, fontSize: 11 }}>Swipe to choose · {index + 1} / {routines.length}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next workout day" hitSlop={8}
        onPress={() => scroll.current?.scrollTo({ x: width * (index + 2), animated: true })} style={s.arrow}>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  start: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 16, padding: 13 },
  startText: { flex: 1, minWidth: 0, color: '#101609', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 }, arrow: { padding: 5 },
});
