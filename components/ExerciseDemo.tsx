import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { exerciseVector } from '@/constants/exerciseVector';
import { ExerciseFigure } from './ExerciseFigure';
import { useTheme } from '@/constants/ThemeContext';

const Playback = createContext({ active: true, reduceMotion: false });

/** One focus/app-state/accessibility subscription for the whole fitness log. */
export function ExerciseDemoProvider({ children }: { children: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true); setForeground(AppState.currentState === 'active');
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduceMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  const value = useMemo(() => ({ active: focused && foreground, reduceMotion }), [focused, foreground, reduceMotion]);
  return <Playback.Provider value={value}>{children}</Playback.Provider>;
}

type Props = { imageUrl?: string; name: string; size?: number; active?: boolean; controls?: boolean; radius?: number };

export function ExerciseDemo(props: Props) {
  // Restart geometry and playback state when the selected exercise changes.
  return <DemoPlayer key={props.imageUrl || props.name} {...props} />;
}

function DemoPlayer({ imageUrl, name, size = 104, active = true, controls = false, radius = 12 }: Props) {
  const playback = useContext(Playback);
  const { colors } = useTheme();
  const demo = useMemo(() => exerciseVector(imageUrl), [imageUrl]);
  const progress = useRef(new Animated.Value(0)).current;
  const [paused, setPaused] = useState(false);
  const playing = active && playback.active && !playback.reduceMotion && !paused && !!demo;
  useEffect(() => {
    if (!playing) return;
    const sequence = demo?.cyclic ? [
      Animated.timing(progress, { toValue: 1, duration: 2600, easing: Easing.linear, isInteraction: false, useNativeDriver: false }),
      Animated.timing(progress, { toValue: 0, duration: 0, isInteraction: false, useNativeDriver: false }),
    ] : [
      Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), isInteraction: false, useNativeDriver: false }),
      Animated.delay(250),
      Animated.timing(progress, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), isInteraction: false, useNativeDriver: false }),
      Animated.delay(250),
    ];
    const loop = Animated.loop(Animated.sequence(sequence), { iterations: -1, resetBeforeIteration: false });
    loop.start(); return () => { loop.stop(); progress.stopAnimation(); };
  }, [playing, progress, demo]);
  return <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.primaryBg }}>
    <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={`${name}, ${demo ? 'simplified animated movement illustration' : 'movement illustration unavailable'}`}>
      {demo ? <ExerciseFigure demo={demo} progress={progress} size={size} color={colors.primary} />
        : <View style={s.fallback}><Ionicons name="body-outline" size={Math.max(16,size*.3)} color={colors.textMuted} /></View>}
    </View>
    {controls && !!demo && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${paused ? 'Play' : 'Pause'} ${name} animation`} accessibilityHint={playback.reduceMotion ? 'Animation is disabled by your Reduce Motion setting' : 'A simplified movement illustration'} disabled={playback.reduceMotion} hitSlop={5} onPress={event => { event.stopPropagation(); setPaused(value => !value); }} style={[s.control, { opacity: playback.reduceMotion ? .55 : 1 }]}>
      <Ionicons name={paused || playback.reduceMotion ? 'play' : 'pause'} size={13} color="#fff" />
    </TouchableOpacity>}
  </View>;
}

const s = StyleSheet.create({ fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' }, control: { position: 'absolute', bottom: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: '#111827b8', alignItems: 'center', justifyContent: 'center' } });
