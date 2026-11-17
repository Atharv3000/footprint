import { DEFAULT_PET_APPEARANCE, PET_PALETTES, PetAppearance } from '@/constants/petAppearance';
import { PetSpeciesBody } from './PetSpeciesBody';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { NutritionPetState, nutritionPetExpression } from '@/constants/nutritionPet';
import { createHeadRubTracker } from '@/constants/petHeadRub';

export function NutritionPetArtwork({ state, active, reduceMotion, celebration, petted, onHeadRub, appearance = DEFAULT_PET_APPEARANCE, sizeOverride }: {
  state: NutritionPetState; active: boolean; reduceMotion: boolean; celebration: number;
  petted: boolean; onHeadRub: () => void; appearance?: PetAppearance; sizeOverride?: number;
}) {
  const { width } = useWindowDimensions();
  const size = sizeOverride ?? Math.min(300, Math.max(180, width-68));
  const palette = PET_PALETTES[appearance.color];
  const bunny = appearance.species === 'bunny';
  const fox = appearance.species === 'fox';
  const id = `pip${useId().replace(/[^a-zA-Z0-9]/g,'')}`;
  const bob = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const hearts = useRef(new Animated.Value(0)).current;
  const playBow = useRef(new Animated.Value(0)).current;
  const wag = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const [blink, setBlink] = useState(false);
  const expression = nutritionPetExpression(state, petted);
  const relaxed = !petted && (expression === 'hungry' || expression === 'full');
  const happy = expression === 'happy';
  const headResponder = useMemo(() => {
    const tracker = createHeadRubTracker(14*size/300);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Leave vertical gestures to the diary's ScrollView.
      onMoveShouldSetPanResponder: (_, gesture) => active && gesture.numberActiveTouches === 1 && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dy) < Math.abs(gesture.dx)*.7,
      onPanResponderGrant: () => tracker.reset(),
      onPanResponderMove: (_, gesture) => {
        if (gesture.numberActiveTouches !== 1 || Math.abs(gesture.dy) > 65*size/300) { tracker.reset(); return; }
        if (tracker.move(gesture.dx)) onHeadRub();
      },
      onPanResponderRelease: () => tracker.reset(),
      onPanResponderTerminate: () => tracker.reset(),
    });
  }, [active, size, onHeadRub]);
  const ribbon = state.goal === 'bulk' ? '#62B9F5' : state.goal === 'cut' ? '#A3E635' : '#B9A1F5';
  useEffect(() => {
    if (!active || reduceMotion) { bob.setValue(0); breath.setValue(0); return; }
    const float = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: relaxed ? 2100 : 1400, useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: relaxed ? 2100 : 1400, useNativeDriver: true }),
    ]));
    const breathe = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(breath, { toValue: 0, duration: 1100, useNativeDriver: true }),
    ]));
    float.start(); breathe.start(); return () => { float.stop(); breathe.stop(); };
  }, [active, reduceMotion, relaxed, bob, breath]);
  useEffect(() => {
    if (!active || reduceMotion) { setBlink(false); return; }
    let opening: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => { setBlink(true); opening = setTimeout(() => setBlink(false), 140); }, 3800);
    return () => { clearInterval(interval); clearTimeout(opening); };
  }, [active, reduceMotion]);
  useEffect(() => {
    if (!celebration || !active || reduceMotion) return;
    hearts.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(hearts, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(hearts, { toValue: 2, duration: 950, useNativeDriver: true }),
    ]);
    animation.start(); return () => animation.stop();
  }, [celebration, active, reduceMotion, hearts]);
  useEffect(() => {
    const target = active && fox && petted ? 1 : 0;
    if (reduceMotion || !active) { playBow.setValue(target); return; }
    const animation = Animated.timing(playBow, { toValue: target, duration: 220, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [active, fox, petted, reduceMotion, playBow]);
  useEffect(() => {
    if (!active || !fox || !petted || reduceMotion) { wag.setValue(0); return; }
    wag.setValue(-1);
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(wag, { toValue: 1, duration: 170, useNativeDriver: true }),
      Animated.timing(wag, { toValue: -1, duration: 170, useNativeDriver: true }),
    ]));
    animation.start(); return () => { animation.stop(); wag.setValue(0); };
  }, [active, fox, petted, reduceMotion, wag]);
  useEffect(() => {
    if (!active || reduceMotion) { hop.setValue(0); return; }
    if (!bunny || !petted) {
      const landing = Animated.timing(hop, { toValue: 0, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true });
      landing.start(); return () => landing.stop();
    }
    hop.setValue(0);
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(hop, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(hop, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(140),
    ]));
    animation.start(); return () => animation.stop();
  }, [active, bunny, petted, reduceMotion, hop]);
  return <View style={{ width: size, height: size*(bunny ? 336 : 280)/300, alignItems: 'center', justifyContent: 'center' }}><View style={[s.stage, { transform: [{ scale: size/300 }] }]}>
    <Svg width={300} height={280} style={StyleSheet.absoluteFill} viewBox="0 0 300 280">
      <Ellipse cx={150} cy={246} rx={102} ry={19} fill="#86B95A" opacity={.12} />
      <Circle cx={54} cy={73} r={4} fill={ribbon} opacity={.5} /><Circle cx={251} cy={110} r={3} fill={ribbon} opacity={.4} />
      <Path d="M 249 49 L 252 56 L 259 59 L 252 62 L 249 69 L 246 62 L 239 59 L 246 56 Z" fill={ribbon} opacity={.5} />
    </Svg>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
      transform: [{ translateY: hop.interpolate({ inputRange: [0,1], outputRange: [0,-22] }) }] }]}>
    <Animated.View style={[s.tail, bunny && { left: 20, top: 161 }, { opacity: playBow.interpolate({ inputRange: [0,1], outputRange: [1,0] }), transform: [{ rotate: breath.interpolate({ inputRange: [0,1], outputRange: ['-8deg','8deg'] }) }] }]}>
      <Svg width={100} height={100} viewBox="0 0 100 100">
        {bunny ? <><Circle cx={62} cy={64} r={22} fill={palette.belly} stroke={palette.outline} strokeWidth={3} /><Circle cx={53} cy={58} r={7} fill={palette.light} /></>
          : fox ? <><Path d="M 80 83 C 7 106 -6 57 20 18 L 42 5 Q 80 35 49 47 Q 48 63 86 59 Z" fill={palette.mid} stroke={palette.outline} strokeWidth={3} /><Path d="M 42 5 Q 61 21 61 33 L 48 30 L 45 43 L 31 37 L 17 49 Q 10 31 20 18 Z" fill={palette.belly} /></>
          : <><Path d="M 77 78 C 21 93 5 57 15 25 C 18 13 34 15 34 28 C 26 50 40 62 71 58 Z" fill={palette.mid} stroke={palette.outline} strokeWidth={3} /><Path d="M 17 23 Q 22 18 29 24" stroke={palette.light} strokeWidth={7} strokeLinecap="round" fill="none" /></>}
      </Svg>
    </Animated.View>
    <Animated.View style={{ opacity: playBow.interpolate({ inputRange: [0,1], outputRange: [1,0] }), transform: [{ translateY: bob.interpolate({ inputRange:[0,1],outputRange:[0, bunny && petted ? 0 : relaxed ? -2 : happy ? -8 : -4] }) }, { scaleX: state.bellyScale }, { scale: breath.interpolate({inputRange:[0,1],outputRange:[1,1.015]}) }] }}>
      <Svg width={300} height={280} viewBox="0 0 300 280">
        <Defs><LinearGradient id={id} x1="0" y1="0" x2="0.8" y2="1"><Stop offset="0" stopColor={palette.light} /><Stop offset="0.5" stopColor={palette.mid} /><Stop offset="1" stopColor={palette.dark} /></LinearGradient></Defs>
        <PetSpeciesBody appearance={appearance} state={state} gradient={id} bow={false} petted={petted}
          blink={blink} relaxed={relaxed} happy={happy} ribbon={ribbon} />
      </Svg>
    </Animated.View>
    {fox && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: playBow,
      transform: [{ translateY: playBow.interpolate({ inputRange: [0,1], outputRange: [8,0] }) }, { scaleX: Math.max(1, Math.min(1.08, state.bellyScale)) }] }]}>
      <Animated.View style={{ position: 'absolute', left: 160, top: 68,
        transform: [{ rotate: wag.interpolate({ inputRange: [-1,1], outputRange: ['-26deg','26deg'] }) }] }}>
        <Svg width={100} height={100} viewBox="0 0 100 100">
          <Path d="M 50 53 Q 104 65 92 15 L 73 1 L 48 14 Q 80 28 50 34 Z" fill={palette.mid} stroke={palette.outline} strokeWidth={3} />
          <Path d="M 73 1 L 92 15 Q 98 35 85 41 L 76 31 L 65 39 L 48 14 Z" fill={palette.belly} />
        </Svg>
      </Animated.View>
      <Svg width={300} height={280} viewBox="0 0 300 280">
        <Defs><LinearGradient id={`${id}bow`} x1="0" y1="0" x2="0.8" y2="1"><Stop offset="0" stopColor={palette.light} /><Stop offset="0.5" stopColor={palette.mid} /><Stop offset="1" stopColor={palette.dark} /></LinearGradient></Defs>
        <PetSpeciesBody appearance={appearance} state={state} gradient={`${id}bow`} bow petted={petted}
          blink={blink} relaxed={false} happy ribbon={ribbon} />
      </Svg>
    </Animated.View>}
    </Animated.View>
    <View {...headResponder.panHandlers} style={{ position: 'absolute', left: fox && petted ? 22 : 60, top: fox && petted ? 115 : 35, width: 180, height: 145 }} accessible accessibilityRole="image" accessibilityLabel={petted ? (bunny ? 'Your bunny is happy and hopping from head rubs' : fox ? 'Your fox is happy and wagging its tail from head rubs' : 'Your cat is happy and purring from head rubs') : `A ${palette.label.toLowerCase()} ${appearance.species} with ${expression === 'hungry' ? 'sad, hungry' : expression === 'full' ? 'sad, overfull' : expression} expression`} accessibilityHint="Rub left and right across the head to make your pet happy" accessibilityActions={[{ name: 'pet', label: 'Rub pet head' }]} onAccessibilityAction={event => { if (active && event.nativeEvent.actionName === 'pet') onHeadRub(); }} />
    <Animated.View pointerEvents="none" style={[s.hearts, { opacity: hearts.interpolate({inputRange:[0,1,2],outputRange:[0,1,0]}), transform:[{translateY:hearts.interpolate({inputRange:[0,2],outputRange:[0,-62]})}] }]}>
      <Svg width={90} height={70} viewBox="0 0 90 70"><Path d="M 45 43 C 10 23 26 4 45 20 C 65 3 80 24 45 43 Z" fill="#F3A4B3" /><Path d="M 14 63 C -2 52 4 43 14 50 C 24 42 30 53 14 63 Z M 75 61 C 59 50 65 41 75 48 C 85 40 91 51 75 61 Z" fill="#C4E8A6" /></Svg>
    </Animated.View>
  </View></View>;
}
const s=StyleSheet.create({ stage:{width:300,height:280,alignItems:'center',justifyContent:'center'},tail:{position:'absolute',left:35,top:141},hearts:{position:'absolute',top:50,left:105} });
