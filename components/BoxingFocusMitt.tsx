import React, { useId } from 'react';
import { Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { boxingPadPresentation, PunchKind } from '@/constants/boxingPadPresentation';

const outline = 'M -38 43 C -54 22 -57 -16 -44 -42 C -34 -65 -12 -73 9 -68 C 36 -63 51 -40 52 -13 C 54 13 45 36 32 49 C 18 63 -24 63 -38 43 Z';

/** Leather focus mitt, drawn independently of camera geometry and hit detection. */
export function BoxingFocusMitt({ x, y, size, kind = 'straight', inward, hand, ready = false }: {
  x: number; y: number; size: number; kind?: PunchKind; inward?: number; hand: 'l' | 'r'; ready?: boolean;
}) {
  const id = `mitt${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const accent = hand === 'l' ? '#38bdf8' : '#fb7185';
  const darkAccent = hand === 'l' ? '#075985' : '#9f1239';
  const view = boxingPadPresentation(kind, inward ?? (hand === 'l' ? -1 : 1));
  const faceMatrix = (depth = 0) => `matrix(${view.matrix.join(' ')} ${-view.normal.x*depth} ${-view.normal.y*depth})`;
  return <G transform={`translate(${x},${y}) scale(${size/55})`}>
    <Defs>
      <LinearGradient id={`${id}shell`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#4C5159" /><Stop offset="0.35" stopColor="#20252D" /><Stop offset="1" stopColor="#080B11" /></LinearGradient>
      <LinearGradient id={`${id}leather`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={accent} /><Stop offset="0.5" stopColor={darkAccent} /><Stop offset="1" stopColor="#171A22" /></LinearGradient>
      <LinearGradient id={`${id}palm`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#414650" /><Stop offset="0.48" stopColor="#242933" /><Stop offset="1" stopColor="#12151C" /></LinearGradient>
    </Defs>
    <Ellipse cx={-view.normal.x*9+3} cy={-view.normal.y*9+12} rx={kind === 'hook' ? 31 : 54} ry={kind === 'uppercut' ? 34 : 65} fill="#000" opacity={.3} />
    {[18, 15, 12, 9, 6, 3].map(depth => <G key={depth} transform={faceMatrix(depth)}>
      <Path d={outline} fill={`url(#${id}shell)`} stroke={depth === 18 ? '#080A0E' : '#414650'} strokeWidth={depth === 18 ? 3 : .7} />
    </G>)}
    <G transform={faceMatrix()}>
    {ready && <Path d={outline} fill="none" stroke={accent} strokeWidth={9} opacity={.3} />}
    <Rect x={-27} y={43} width={53} height={28} rx={11} fill="#13171E" stroke="#656B75" strokeWidth={1.5} />
    <Rect x={-24} y={51} width={47} height={13} rx={4} fill={darkAccent} />
    <Path d="M -20 55 L 19 55 M -20 61 L 19 61" stroke={accent} strokeWidth={.8} strokeDasharray="2 2" opacity={.7} />
    <Path d={outline} fill={`url(#${id}shell)`} stroke="#080A0E" strokeWidth={4} />
    <Path d="M -36 40 C -49 20 -52 -14 -40 -39 C -31 -59 -12 -66 7 -62 C 31 -57 45 -37 46 -12 C 48 12 40 32 28 44 C 15 55 -23 55 -36 40 Z" fill={`url(#${id}leather)`} stroke={accent} strokeWidth={1.5} />
    <Path d="M -23 37 C -39 21 -43 -8 -33 -31 C -26 -47 -9 -54 7 -49 C 25 -44 36 -27 36 -8 C 37 12 31 29 20 38 C 9 47 -12 46 -23 37 Z" fill={`url(#${id}palm)`} stroke="#0D1118" strokeWidth={3} />
    <Path d="M -34 36 C -47 16 -47 -12 -36 -35 C -28 -52 -11 -61 6 -57 C 27 -52 39 -34 41 -12 C 43 11 36 29 25 40" fill="none" stroke="#D9DDE3" strokeWidth={.85} strokeDasharray="2 2.5" opacity={.55} />
    <Path d="M -29 -29 C -23 -44 -7 -51 7 -47 C 17 -44 25 -37 29 -27" fill="none" stroke="#F1F3F5" strokeWidth={3} strokeLinecap="round" opacity={.2} />
    <Path d="M -29 24 Q -2 39 25 24 M -31 28 Q -2 43 24 29" fill="none" stroke="#06080D" strokeWidth={1.5} opacity={.65} />
    <Path d="M -15 -10 L -3 -18 L -3 2 L 12 -8 L 12 4 L -15 18 Z" fill="#E8E5DC" opacity={.9} />
    <SvgText x={0} y={-29} textAnchor="middle" fontSize={6} fontWeight="800" letterSpacing={1.2} fill="#D8DBDF">FOOTPRINT</SvgText>
    <SvgText x={0} y={61} textAnchor="middle" fontSize={8} fontWeight="900" fill="#F7F7F5">{hand === 'l' ? 'L' : 'R'}</SvgText>
    </G>
  </G>;
}
