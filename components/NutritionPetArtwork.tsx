import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { NutritionPetState } from '@/constants/nutritionPet';
import { createHeadRubTracker } from '@/constants/petHeadRub';

export function NutritionPetArtwork({ state, active, reduceMotion, celebration, petted, onHeadRub }: {
  state: NutritionPetState; active: boolean; reduceMotion: boolean; celebration: number;
  petted: boolean; onHeadRub: () => void;
}) {
  const { width } = useWindowDimensions();
  const size = Math.min(300, Math.max(180, width-68));
  const id = `pip${useId().replace(/[^a-zA-Z0-9]/g,'')}`;
  const bob = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const hearts = useRef(new Animated.Value(0)).current;
  const [blink, setBlink] = useState(false);
  const relaxed = !petted && (state.mood === 'full' || state.mood === 'stuffed');
  const happy = petted || state.mood === 'satisfied' || state.mood === 'energized';
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
  return <View style={{ width: size, height: size*280/300, alignItems: 'center', justifyContent: 'center' }}><View style={[s.stage, { transform: [{ scale: size/300 }] }]}>
    <Svg width={300} height={280} style={StyleSheet.absoluteFill} viewBox="0 0 300 280">
      <Ellipse cx={150} cy={246} rx={102} ry={19} fill="#86B95A" opacity={.12} />
      <Circle cx={54} cy={73} r={4} fill={ribbon} opacity={.5} /><Circle cx={251} cy={110} r={3} fill={ribbon} opacity={.4} />
      <Path d="M 249 49 L 252 56 L 259 59 L 252 62 L 249 69 L 246 62 L 239 59 L 246 56 Z" fill={ribbon} opacity={.5} />
    </Svg>
    <Animated.View style={[s.tail, { transform: [{ rotate: breath.interpolate({ inputRange: [0,1], outputRange: ['-8deg','8deg'] }) }] }]}>
      <Svg width={100} height={100} viewBox="0 0 100 100"><Path d="M 77 78 C 21 93 5 57 15 25 C 18 13 34 15 34 28 C 26 50 40 62 71 58 Z" fill="#74CDB4" stroke="#48A68E" strokeWidth={3} /><Path d="M 17 23 Q 22 18 29 24" stroke="#C6F5DF" strokeWidth={7} strokeLinecap="round" fill="none" /></Svg>
    </Animated.View>
    <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange:[0,1],outputRange:[0, relaxed ? -2 : happy ? -8 : -4] }) }, { scaleX: state.bellyScale }, { scale: breath.interpolate({inputRange:[0,1],outputRange:[1,1.015]}) }] }}>
      <Svg width={300} height={280} viewBox="0 0 300 280">
        <Defs><LinearGradient id={id} x1="0" y1="0" x2="0.8" y2="1"><Stop offset="0" stopColor="#C4F7DF" /><Stop offset="0.5" stopColor="#96E2C6" /><Stop offset="1" stopColor="#5EBEA4" /></LinearGradient></Defs>
        <Path d="M 85 89 L 70 43 Q 66 28 80 34 L 117 56 Q 148 43 181 58 L 215 35 Q 229 28 226 45 L 217 94 C 235 116 239 149 229 174 C 241 202 224 238 194 243 Q 148 257 105 241 C 75 240 60 208 72 179 C 56 145 65 113 85 89 Z" fill={`url(#${id})`} stroke="#4A9E89" strokeWidth={3} />
        <Path d="M 80 46 L 91 82 L 108 64 Z M 214 46 L 207 83 L 190 65 Z" fill="#E6A8AE" opacity={.8} />
        <Ellipse cx={150} cy={199} rx={state.mood === 'stuffed' ? 66 : 57} ry={39} fill="#E9F7D6" opacity={.88} />
        <Path d="M 91 79 Q 150 53 211 79 L 210 91 Q 150 67 88 93 Z" fill={ribbon} />
        <Path d="M 201 86 L 229 94 L 218 102 L 204 94 Z" fill={ribbon} />
        <Ellipse cx={104} cy={144} rx={15} ry={8} fill="#EFA2AF" opacity={petted ? .85 : relaxed ? .65 : .4} />
        <Ellipse cx={197} cy={144} rx={15} ry={8} fill="#EFA2AF" opacity={petted ? .85 : relaxed ? .65 : .4} />
        {blink || relaxed ? <G stroke="#244940" strokeWidth={4} fill="none" strokeLinecap="round"><Path d="M 103 126 Q 113 132 123 126 M 178 126 Q 188 132 198 126" /></G>
          : happy ? <G stroke="#244940" strokeWidth={4} fill="none" strokeLinecap="round"><Path d="M 103 129 Q 113 115 123 129 M 178 129 Q 188 115 198 129" /></G>
          : <G><Ellipse cx={113} cy={127} rx={7} ry={10} fill="#244940" /><Ellipse cx={188} cy={127} rx={7} ry={10} fill="#244940" /><Circle cx={115} cy={124} r={2.3} fill="#fff" /><Circle cx={190} cy={124} r={2.3} fill="#fff" /></G>}
        <Path d="M 143 140 Q 150 135 157 140 L 150 146 Z" fill="#C27384" />
        {state.mood === 'stuffed' && !petted ? <Ellipse cx={150} cy={156} rx={7} ry={9} fill="#36574A" />
          : happy ? <><Path d="M 135 150 Q 150 179 165 150 Z" fill="#31564B" /><Ellipse cx={150} cy={162} rx={8} ry={4} fill="#ED9FAD" /></>
          : <Path d={state.mood === 'hungry' ? 'M 140 157 Q 150 150 160 157' : 'M 137 151 Q 150 164 163 151'} stroke="#31564B" strokeWidth={3} fill="none" strokeLinecap="round" />}
        <Path d={relaxed ? 'M 93 184 Q 113 199 124 187 M 208 184 Q 188 201 176 188' : 'M 83 174 Q 94 194 109 187 M 218 174 Q 207 194 192 187'} stroke="#4A9E89" strokeWidth={4} fill="none" strokeLinecap="round" />
        <Ellipse cx={108} cy={240} rx={25} ry={11} fill="#9DE4C7" stroke="#4A9E89" strokeWidth={2} /><Ellipse cx={194} cy={240} rx={25} ry={11} fill="#9DE4C7" stroke="#4A9E89" strokeWidth={2} />
        {state.mood === 'stuffed' && !petted && <Path d="M 233 105 Q 245 123 233 126 Q 222 124 233 105 Z" fill="#8BCBE4" />}
      </Svg>
    </Animated.View>
    <View {...headResponder.panHandlers} style={{ position: 'absolute', left: 65, top: 30, width: 170, height: 125 }} accessible accessibilityRole="image" accessibilityLabel={petted ? 'Your pet is happy from head rubs' : `A mint cat with ${state.label.toLowerCase()} expression`} accessibilityHint="Rub left and right across the head to make your pet happy" accessibilityActions={[{ name: 'pet', label: 'Rub pet head' }]} onAccessibilityAction={event => { if (active && event.nativeEvent.actionName === 'pet') onHeadRub(); }} />
    <Animated.View pointerEvents="none" style={[s.hearts, { opacity: hearts.interpolate({inputRange:[0,1,2],outputRange:[0,1,0]}), transform:[{translateY:hearts.interpolate({inputRange:[0,2],outputRange:[0,-62]})}] }]}>
      <Svg width={90} height={70} viewBox="0 0 90 70"><Path d="M 45 43 C 10 23 26 4 45 20 C 65 3 80 24 45 43 Z" fill="#F3A4B3" /><Path d="M 14 63 C -2 52 4 43 14 50 C 24 42 30 53 14 63 Z M 75 61 C 59 50 65 41 75 48 C 85 40 91 51 75 61 Z" fill="#C4E8A6" /></Svg>
    </Animated.View>
  </View></View>;
}
const s=StyleSheet.create({ stage:{width:300,height:280,alignItems:'center',justifyContent:'center'},tail:{position:'absolute',left:35,top:141},hearts:{position:'absolute',top:50,left:105} });
