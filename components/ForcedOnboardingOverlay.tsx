import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, GestureResponderEvent, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { ONBOARDING_STEPS, TutorialRect, TutorialState } from '@/constants/onboardingMachine';

export function ForcedOnboardingOverlay({ state, target, width, height, onRead, onTarget, onClose }: {
  state: TutorialState; target: TutorialRect | null; width: number; height: number;
  onClose?: () => void; onRead: () => void; onTarget: (event: GestureResponderEvent) => void;
}) {
  const insets = useSafeAreaInsets();
  const id = `tour${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [cardHeight, setCardHeight] = useState(190);
  const step = ONBOARDING_STEPS[state.step];
  const reading = state.phase === 'read';
  const acting = state.phase === 'act' && !!target;
  const text = reading ? step.dialogue[state.line] : state.phase === 'waiting' ? 'Opening it for you...' : `Tap the highlighted ${step.label} to continue.`;
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; listener.remove(); };
  }, []);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Pip. ${text} ${reading ? 'Tap to continue.' : state.phase === 'act' ? `Activate ${step.label} to continue.` : ''}`);
  }, [text, reading, state.phase, step.label]);
  useEffect(() => {
    pulse.setValue(0);
    if (reduceMotion || state.phase === 'waiting') return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: true }),
    ]));
    animation.start(); return () => animation.stop();
  }, [pulse, reduceMotion, state.phase]);
  // Keep the same bottom card design; scroll sections above it and avoid covering lower controls.
  const preferredBottom = insets.bottom + 84;
  const preferredTop = height - preferredBottom - cardHeight;
  const overlaps = target && target.y < height - preferredBottom + 12 && target.y + target.height > preferredTop - 12;
  const aboveFits = target && target.y - 16 - cardHeight >= insets.top + 90;
  const desiredBottom = overlaps && target
    ? aboveFits ? height - target.y + 16 : height - target.y - target.height - 16 - cardHeight
    : preferredBottom;
  const cardBottom = Math.max(insets.bottom + 12, Math.min(desiredBottom, height - cardHeight - insets.top - 90));
  return <View style={StyleSheet.absoluteFill} accessibilityViewIsModal importantForAccessibility="yes" testID="forced-onboarding-overlay">
    <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs><Mask id={id} x={0} y={0} width={width} height={height} maskUnits="userSpaceOnUse">
        <Rect x={0} y={0} width={width} height={height} fill="white" />
        {target && <Rect x={target.x - 3} y={target.y - 3} width={target.width + 6} height={target.height + 6} rx={16} fill="black" />}
      </Mask></Defs>
      <Rect x={0} y={0} width={width} height={height} fill="rgba(0,0,0,0.75)" mask={`url(#${id})`} />
    </Svg>
    {/* A real input shield covers even the bright hole throughout the reading phase. */}
    <Pressable testID="tutorial-input-shield" accessible={reading} accessibilityRole={reading ? 'button' : undefined}
      accessibilityLabel={reading ? 'Tap to continue the explanation' : undefined}
      style={StyleSheet.absoluteFill} onPress={reading ? onRead : () => {}} />
    {target && state.phase === 'act' && <>
      <Animated.View pointerEvents="none" style={[s.ring, { left: target.x - 4, top: target.y - 4, width: target.width + 8, height: target.height + 8,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [.6, 1] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: target.x + target.width / 2 - 15, top: Math.max(0, target.y - 38),
        transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [-5, 1] }) }] }}><Ionicons name="hand-left" size={30} color="#D8F69C" style={{ transform: [{ rotate: '180deg' }] }} /></Animated.View>
      <Pressable testID="tutorial-forced-target" accessibilityRole="button" accessibilityLabel={`Open ${step.label} to continue tutorial`}
        style={{ position: 'absolute', left: target.x, top: target.y, width: target.width, height: target.height }}
        disabled={!acting} onPress={onTarget} />
    </>}
    {onClose && <Pressable testID="tutorial-close-preview" accessibilityRole="button" accessibilityLabel="Close tutorial preview" onPress={onClose}
      style={{ position: 'absolute', right: 18, top: insets.top + 12, backgroundColor: '#191E18', borderRadius: 18, padding: 12 }}>
      <Text style={{ color: '#F4F8EF', fontWeight: '700' }}>Close preview</Text>
    </Pressable>}
    <Pressable testID="tutorial-speech-card" accessible={reading} accessibilityRole={reading ? 'button' : undefined}
      accessibilityLabel={reading ? `Pip: ${text}. Tap to continue.` : undefined}
      onLayout={event => setCardHeight(event.nativeEvent.layout.height)}
      onPress={reading ? onRead : () => {}} style={[s.card, { bottom: cardBottom }]}>
      <Image accessible={false} pointerEvents="none" source={require('../assets/images/tutorial-pip.png')} style={s.character} resizeMode="contain" />
      <View style={s.cardTop}><View style={s.name}><Text style={s.nameText}>PIP</Text></View><Text style={s.count}>{state.step + 1} / {ONBOARDING_STEPS.length}</Text></View>
      <Text style={s.dialogue}>{text}</Text>
      {reading ? <Animated.Text style={[s.hint, { opacity: reduceMotion ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [.35, 1] }) }]}>Tap to continue</Animated.Text>
        : state.phase === 'waiting' ? <ActivityIndicator color="#A3E635" style={{ alignSelf: 'flex-end', marginTop: 12 }} />
        : <Text style={s.action}>{target ? `Tap ${step.label}` : 'Getting the next button ready...'}</Text>}
    </Pressable>
  </View>;
}
const s = StyleSheet.create({
  card: { position: 'absolute', left: 18, right: 18, backgroundColor: '#191E18', borderRadius: 22, borderWidth: 1.5, borderColor: '#648C38', padding: 20, paddingTop: 18, shadowColor: '#000', shadowOpacity: .35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  character: { position: 'absolute', left: 4, top: -81, width: 116, height: 116 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 108, marginBottom: 17 },
  name: { backgroundColor: '#A3E635', paddingHorizontal: 13, paddingVertical: 5, borderRadius: 10 }, nameText: { color: '#152009', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  count: { color: '#B9C6AF', fontSize: 11, fontWeight: '700' }, dialogue: { color: '#F4F8EF', fontSize: 16, lineHeight: 23, fontWeight: '600' },
  hint: { color: '#CBD7BE', fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 16 }, action: { color: '#C7F184', fontSize: 12, fontWeight: '800', textAlign: 'right', marginTop: 16 },
  ring: { position: 'absolute', borderRadius: 18, borderWidth: 3, borderColor: '#A3E635' },
});
