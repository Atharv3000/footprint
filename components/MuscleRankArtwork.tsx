import React, { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import { BodyPart, MuscleRank, MuscleTier, MUSCLE_TIERS } from '@/constants/muscleRanks';
import type { MusclePalette } from '@/constants/personalRankPalette';

export function RankEmblem({ tier, size = 46 }: { tier: MuscleTier; size?: number }) {
  const id = `emblem${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const level = MUSCLE_TIERS.findIndex(value => value.id === tier.id);
  return <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel={`${tier.name} rank`}>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor={tier.light} /><Stop offset=".48" stopColor={tier.color} /><Stop offset="1" stopColor={tier.dark} />
    </LinearGradient></Defs>
    {level >= 4 && <Path d="M18 23 L1 16 L5 28 L17 37 M46 23 L63 16 L59 28 L47 37 M16 36 L5 32 L10 44 L22 46 M48 36 L59 32 L54 44 L42 46"
      fill={tier.dark} stroke={tier.color} strokeWidth="1.5" />}
    <Path d="M32 4 L53 15 L51 40 L32 59 L13 40 L11 15 Z" fill={`url(#${id})`} stroke={tier.light} strokeWidth="1.3" />
    <Path d="M32 11 L46 19 L45 37 L32 50 L19 37 L18 19 Z" fill={tier.dark} fillOpacity=".8" stroke={tier.light} strokeOpacity=".7" />
    {level < 3 ? <>
      <Path d="M24 29 L32 23 L40 29 M24 36 L32 30 L40 36" fill="none" stroke={tier.light} strokeWidth="3" strokeLinejoin="round" />
      {level === 2 && <Path d="M24 43 L32 37 L40 43" fill="none" stroke={tier.light} strokeWidth="3" />}
    </> : <Polygon points="32,18 36,27 46,28 38,35 40,45 32,40 24,45 26,35 18,28 28,27" fill={`url(#${id})`} stroke={tier.light} strokeWidth="1" />}
    {level >= 6 && <Path d="M20 10 L20 2 L27 7 L32 0 L37 7 L44 2 L44 10 Z" fill={tier.color} stroke={tier.light} strokeWidth="1" />}
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
    <Ellipse cx="100" cy="29" rx="17" ry="22" fill="#BBC3CC" />
    <Path d="M86 46 L90 58 L100 64 L110 58 L114 46" fill="#9CA6B2" />
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
