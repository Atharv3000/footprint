import React, { useCallback, useEffect, useId, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { BodyPart, MuscleRank, MuscleTier, MUSCLE_TIERS } from '@/constants/muscleRanks';
import type { MusclePalette } from '@/constants/personalRankPalette';

const AnimatedShine = Animated.createAnimatedComponent(Rect);
const AnimatedGlint = Animated.createAnimatedComponent(Circle);
const SHIELD = 'M32 4 L53 15 L51 40 L32 59 L13 40 L11 15 Z';
const WINGS = 'M18 23 L1 16 L5 28 L17 37 Z M46 23 L63 16 L59 28 L47 37 Z M16 36 L5 32 L10 44 L22 46 Z M48 36 L59 32 L54 44 L42 46 Z';
const CROWN = 'M20 10 L20 2 L27 7 L32 0 L37 7 L44 2 L44 10 Z';

export function RankEmblem({ tier, size = 46, active = true }: { tier: MuscleTier; size?: number; active?: boolean }) {
  const id = `emblem${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const level = MUSCLE_TIERS.findIndex(value => value.id === tier.id);
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [reduceMotion, setReduceMotion] = useState(useReducedMotion());
  const phase = useSharedValue(0);
  const playing = active && focused && foreground && !reduceMotion;
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { app.remove(); motion.remove(); };
  }, []);
  useEffect(() => {
    cancelAnimation(phase); phase.value = 0;
    if (!playing) return;
    // Bold, continuous foil motion stays visible even on the smallest rank badges.
    phase.value = withRepeat(withTiming(1, { duration: 2200 + Math.max(0, level) * 40, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(phase); phase.value = 0; };
  }, [playing, level, phase]);
  const shineProps = useAnimatedProps(() => {
    const angle = phase.value * Math.PI * 2 + level * .43;
    return { x: 8 + Math.sin(angle) * 48, width: 32 + Math.cos(angle * 2) * 8, opacity: .8 + (.5 + .5 * Math.cos(angle)) * .2 };
  });
  const foilProps = useAnimatedProps(() => {
    const angle = phase.value * Math.PI * 2 + level * .43;
    return { x: -35 + Math.sin(angle + .8) * 30, width: 88 + Math.sin(angle * 2) * 20, opacity: .75 + (.5 + .5 * Math.sin(angle)) * .25 };
  });
  const reflectionProps = useAnimatedProps(() => {
    const angle = phase.value * Math.PI * 2 + level * .43;
    return { x: 5 + Math.cos(angle + 1.7) * 44, width: 28 + Math.sin(angle) * 8, opacity: .55 + (.5 + .5 * Math.sin(angle + 2)) * .4 };
  });
  const glintProps = useAnimatedProps(() => {
    const angle = phase.value * Math.PI * 2 + level * .43;
    return { cx: 32 + Math.sin(angle) * 19, cy: 29 + Math.cos(angle * 2) * 18, r: 1.4 + (.5 + .5 * Math.cos(angle * 2)) * 1.8, opacity: .35 + Math.pow(.5 + .5 * Math.sin(angle + .8), 2) * .65 };
  });
  return <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel={`${tier.name} rank`}>
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={tier.light} /><Stop offset=".18" stopColor={tier.color} />
        <Stop offset=".36" stopColor={tier.dark} /><Stop offset=".47" stopColor={tier.light} />
        <Stop offset=".5" stopColor="#FFFFFF" stopOpacity=".85" /><Stop offset=".55" stopColor={tier.light} />
        <Stop offset=".7" stopColor={tier.color} /><Stop offset=".86" stopColor={tier.dark} /><Stop offset="1" stopColor={tier.light} />
      </LinearGradient>
      <LinearGradient id={`${id}inset`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={tier.dark} /><Stop offset=".4" stopColor={tier.color} /><Stop offset=".52" stopColor={tier.dark} /><Stop offset="1" stopColor={tier.color} />
      </LinearGradient>
      <LinearGradient id={`${id}shine`} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" /><Stop offset=".22" stopColor="#FFFFFF" stopOpacity=".3" />
        <Stop offset=".38" stopColor="#FFFFFF" stopOpacity=".92" /><Stop offset=".5" stopColor="#FFFFFF" stopOpacity="1" />
        <Stop offset=".64" stopColor="#FFFFFF" stopOpacity=".8" /><Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </LinearGradient>
      <LinearGradient id={`${id}foil`} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#86F5FF" stopOpacity="0" /><Stop offset=".15" stopColor="#64F5FF" stopOpacity=".65" />
        <Stop offset=".3" stopColor="#AD88FF" stopOpacity=".82" /><Stop offset=".43" stopColor="#FF83E2" stopOpacity=".9" />
        <Stop offset=".55" stopColor="#FFF39A" stopOpacity=".85" /><Stop offset=".7" stopColor="#7AFFC4" stopOpacity=".8" />
        <Stop offset=".85" stopColor="#77D2FF" stopOpacity=".65" /><Stop offset="1" stopColor="#B5A0FF" stopOpacity="0" />
      </LinearGradient>
      <ClipPath id={`${id}clip`}><Path d={SHIELD} />{level >= 4 && <Path d={WINGS} />}{level >= 6 && <Path d={CROWN} />}</ClipPath>
    </Defs>
    {level >= 4 && <Path d={WINGS} fill={`url(#${id})`} stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round" />}
    <Path d={SHIELD} fill={`url(#${id})`} stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="2.6" strokeLinejoin="round" />
    <Path d="M32 11 L46 19 L45 37 L32 50 L19 37 L18 19 Z" fill={`url(#${id}inset)`} stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="2.2" strokeLinejoin="round" />
    {level < 3 ? <>
      <Path d="M24 29 L32 23 L40 29 M24 36 L32 30 L40 36" fill="none" stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="4.5" strokeLinejoin="round" />
      {level === 2 && <Path d="M24 43 L32 37 L40 43" fill="none" stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="4.5" />}
    </> : <Polygon points="32,18 36,27 46,28 38,35 40,45 32,40 24,45 26,35 18,28 28,27" fill={`url(#${id})`} stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="2.3" strokeLinejoin="round" />}
    {level >= 6 && <Path d={CROWN} fill={`url(#${id})`} stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="2.3" strokeLinejoin="round" />}
    {playing && <G clipPath={`url(#${id}clip)`} pointerEvents="none">
      <G transform="rotate(35 32 32)">
        <AnimatedShine animatedProps={foilProps} y={-32} width={58} height={128} fill={`url(#${id}foil)`} />
        <AnimatedShine animatedProps={shineProps} y={-32} width={25} height={128} fill={`url(#${id}shine)`} />
      </G>
      <G transform="rotate(-38 32 32)"><AnimatedShine animatedProps={reflectionProps} y={-32} width={18} height={128} fill={`url(#${id}shine)`} /></G>
      <AnimatedGlint animatedProps={glintProps} fill="#FFFFFF" />
    </G>}
  </Svg>;
}


const shoulders = ['M68 72 C57 73 48 82 47 94 L58 107 C66 100 72 89 74 78 Z',
  'M132 72 C143 73 152 82 153 94 L142 107 C134 100 128 89 126 78 Z'];
const arms = ['M49 101 C42 113 42 132 47 145 C55 144 64 128 63 114 L58 106 Z',
  'M151 101 C158 113 158 132 153 145 C145 144 136 128 137 114 L142 106 Z',
  'M45 149 C38 162 34 183 38 200 L46 203 C52 187 57 169 54 154 Z',
  'M155 149 C162 162 166 183 162 200 L154 203 C148 187 143 169 146 154 Z'];
const legs = ['M72 184 C83 184 96 192 97 215 L91 271 C89 282 80 285 73 278 C63 254 62 225 65 204 Z',
  'M128 184 C117 184 104 192 103 215 L109 271 C111 282 120 285 127 278 C137 254 138 225 135 204 Z',
  'M73 288 C66 304 68 330 72 347 L75 369 L83 369 L87 342 C93 320 90 299 85 288 Z',
  'M127 288 C134 304 132 330 128 347 L125 369 L117 369 L113 342 C107 320 110 299 115 288 Z'];

export function MuscleRankBody({ ranks, selected, onSelect, back, palette }: {
  ranks: MuscleRank[]; selected: BodyPart; onSelect: (part: BodyPart) => void; back: boolean;
  palette?: MusclePalette;
}) {
  const id = `body${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  function panel(part: BodyPart, paths: string[]) {
    return <G key={part} onPress={() => onSelect(part)}>
      {paths.map((path, index) => <Path key={index} d={path} fill={`url(#${id}${part})`}
        stroke={selected === part ? '#FFFFFF' : '#D5DCE6'} strokeOpacity={selected === part ? 1 : .65}
        strokeWidth={selected === part ? 1.9 : .8} strokeLinejoin="round" />)}
    </G>;
  }
  return <Svg width="210" height="386" viewBox="0 0 200 400" accessibilityLabel={`Your ${back ? 'back' : 'front'} muscle rank map`}>
    <Defs>{ranks.map(rank => {
      const colors = palette?.[rank.part] || rank.tier;
      return <LinearGradient key={rank.part} id={`${id}${rank.part}`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={colors.light} /><Stop offset=".4" stopColor={colors.color} /><Stop offset="1" stopColor={colors.dark} />
      </LinearGradient>;
    })}</Defs>
    <Ellipse cx="100" cy="389" rx="40" ry="5" fill="#000" fillOpacity=".5" />
    <Path d="M89 48 L88 63 L69 70 Q53 73 46 90 L40 135 L35 160 L30 201 L34 215 L40 218 L47 210 L49 193 L58 159 L63 128 L70 157 L65 188 L61 217 L64 263 L69 287 L68 329 L73 370 L66 378 L63 386 Q74 392 88 383 L88 367 L95 319 L98 283 L100 246 L102 283 L105 319 L112 367 L112 383 Q126 392 137 386 L134 378 L127 370 L132 329 L131 287 L136 263 L139 217 L135 188 L130 157 L137 128 L142 159 L151 193 L153 210 L160 218 L166 215 L170 201 L165 160 L160 135 L154 90 Q147 73 131 70 L112 63 L111 48 Z"
      fill="#7D8793" stroke="#B7C0CB" strokeWidth=".7" />
    <Ellipse cx="100" cy="29" rx="17" ry="22" fill="#7D8793" stroke="#B7C0CB" strokeWidth=".7" />
    <Path d="M86 46 L90 58 L100 64 L110 58 L114 46" fill="#7D8793" stroke="#B7C0CB" strokeWidth=".7" />
    {panel('shoulders', shoulders)}
    {panel('arms', arms)}
    {back ? <>
      {panel('back', ['M77 71 L99 65 L99 112 L74 132 L65 109 L64 93 Z', 'M123 71 L101 65 L101 112 L126 132 L135 109 L136 93 Z',
        'M70 123 L98 114 L97 167 L83 180 L74 163 Z', 'M130 123 L102 114 L103 167 L117 180 L126 163 Z'])}
      {panel('core', ['M86 172 L100 165 L114 172 L117 187 L100 200 L83 187 Z'])}
      {panel('legs', [...legs, 'M70 183 C78 175 90 174 99 183 L98 211 C86 221 71 212 66 201 Z', 'M130 183 C122 175 110 174 101 183 L102 211 C114 221 129 212 134 201 Z'])}
      <Path d="M100 71 L100 163 M72 111 L98 123 M128 111 L102 123 M77 230 L82 271 M123 230 L118 271" fill="none" stroke="#E5EAF0" strokeOpacity=".55" strokeWidth=".8" />
    </> : <>
      {panel('chest', ['M74 79 C83 74 95 77 99 84 L98 112 C86 121 73 115 67 101 Z', 'M126 79 C117 74 105 77 101 84 L102 112 C114 121 127 115 133 101 Z'])}
      {panel('core', ['M81 117 Q91 119 99 116 L99 179 L88 189 L78 164 Z', 'M119 117 Q109 119 101 116 L101 179 L112 189 L122 164 Z',
        'M73 117 L78 123 L76 151 L87 178 L83 185 L70 162 Z', 'M127 117 L122 123 L124 151 L113 178 L117 185 L130 162 Z'])}
      {panel('legs', legs)}
      <Path d="M83 132 L98 134 M102 134 L117 132 M83 148 L98 150 M102 150 L117 148 M87 165 L98 167 M102 167 L113 165 M77 199 L87 236 L82 270 M123 199 L113 236 L118 270"
        fill="none" stroke="#EFF4FA" strokeOpacity=".65" strokeWidth=".9" />
    </>}
    <Circle cx="100" cy="190" r="2" fill="#56606C" />
  </Svg>;
}
