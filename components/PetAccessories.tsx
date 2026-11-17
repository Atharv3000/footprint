import React from 'react';
import { Circle, Ellipse, G, Path } from 'react-native-svg';
import type { PetAppearance } from '@/constants/petAppearance';

/** Shared local head coordinates keep outfits attached in both poses. */
export function PetAccessories({ appearance, bow = false, headTransform }: { appearance: PetAppearance; bow?: boolean; headTransform?: string }) {
  return <G transform={headTransform || (bow ? 'translate(97 165) scale(0.72)' : 'translate(150 100)')}>
    {appearance.hat === 'cap' && <G>
      <Path d="M -42 -26 Q -44 -66 0 -65 Q 39 -64 40 -26 Z" fill="#5A81EE" stroke="#3556B1" strokeWidth={3} />
      <Path d="M -44 -27 Q 8 -38 58 -26 Q 66 -18 35 -16 L -42 -18 Z" fill="#8EB7FF" stroke="#3556B1" strokeWidth={3} />
      <Path d="M -4 -59 L -4 -36" stroke="#ADC9FF" strokeWidth={3} strokeLinecap="round" />
    </G>}
    {appearance.hat === 'beanie' && <G>
      <Path d="M -43 -27 Q -46 -69 0 -67 Q 45 -69 43 -27 Z" fill="#F4AB6A" stroke="#C27945" strokeWidth={3} />
      <Circle cy={-71} r={10} fill="#FFE0A8" stroke="#C27945" strokeWidth={2} />
      <Path d="M -45 -36 Q 0 -45 45 -36 L 45 -20 Q 0 -28 -45 -20 Z" fill="#FFD39A" stroke="#C27945" strokeWidth={3} />
      <Path d="M -24 -58 L -24 -40 M -8 -62 L -8 -43 M 8 -62 L 8 -43 M 24 -58 L 24 -40" stroke="#CF8751" strokeWidth={2} />
    </G>}
    {appearance.hat === 'crown' && <G>
      <Path d="M -39 -26 L -48 -60 L -22 -46 L 0 -73 L 22 -46 L 48 -60 L 39 -26 Z" fill="#F9D35D" stroke="#BA8A2E" strokeWidth={3} />
      <Path d="M -39 -26 Q 0 -35 39 -26 L 37 -17 Q 0 -25 -37 -17 Z" fill="#FFE699" stroke="#BA8A2E" strokeWidth={3} />
      <Path d="M 0 -47 L 7 -39 L 0 -31 L -7 -39 Z" fill="#F08BAA" />
      <Circle cx={-48} cy={-60} r={4} fill="#FFF0B8" /><Circle cy={-73} r={4} fill="#FFF0B8" /><Circle cx={48} cy={-60} r={4} fill="#FFF0B8" />
    </G>}
    {appearance.face !== 'none' && <G stroke="#343B58" strokeWidth={4}>
      <Ellipse cx={-37} cy={27} rx={23} ry={18} fill={appearance.face === 'shades' ? '#333C59' : '#C6EFFF'} fillOpacity={appearance.face === 'shades' ? .95 : .22} />
      <Ellipse cx={38} cy={27} rx={23} ry={18} fill={appearance.face === 'shades' ? '#333C59' : '#C6EFFF'} fillOpacity={appearance.face === 'shades' ? .95 : .22} />
      <Path d="M -14 24 Q 0 15 15 24 M -60 24 L -67 20 M 61 24 L 67 20" fill="none" strokeLinecap="round" />
      {appearance.face === 'shades' && <Path d="M -47 21 L -36 14 M 28 21 L 39 14" stroke="#A4CDF1" strokeWidth={3} />}
    </G>}
    {appearance.neck === 'bowtie' && <G>
      <Path d="M -3 78 L -27 64 Q -35 78 -27 92 L -3 82 L 27 92 Q 35 78 27 64 Z" fill="#EF8FB1" stroke="#AC5577" strokeWidth={2} />
      <Circle cy={78} r={7} fill="#FFD0DE" stroke="#AC5577" strokeWidth={2} />
    </G>}
    {appearance.neck === 'medal' && <G>
      <Path d="M -25 65 L 0 105 L 25 65" stroke="#6D96EF" strokeWidth={10} fill="none" />
      <Circle cy={105} r={14} fill="#FFDC6D" stroke="#BB8D34" strokeWidth={3} />
      <Path d="M 0 96 L 3 102 L 9 103 L 4 107 L 5 113 L 0 110 L -5 113 L -4 107 L -9 103 L -3 102 Z" fill="#C58D28" />
    </G>}
  </G>;
}
