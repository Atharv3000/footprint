import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTheme } from '@/constants/ThemeContext';
import { BorderCountry, borderProgress } from '@/constants/countryQuests';

export function CountryBorderMap({ country, steps = 0, height = 220 }: { country: BorderCountry; steps?: number; height?: number }) {
  const { colors } = useTheme();
  const outline = useMemo(() => country.rings.map(r => `M ${r.points.map(p => p.join(' ')).join(' L ')} Z`).join(' '), [country]);
  const progress = useMemo(() => borderProgress(country, steps), [country, steps]);
  const start = country.rings[0].points[0];
  return <View accessible accessibilityLabel={`${country.name} virtual border route, ${Math.min(100, steps / (country.totalKm*1310)*100).toFixed(1)} percent completed`}>
    <Svg width="100%" height={height} viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet">
      {[150, 350, 550].map(y => <Line key={`y${y}`} x1={0} y1={y} x2={1000} y2={y} stroke={colors.border} strokeWidth={1.5} strokeDasharray="5 10" />)}
      {[150, 350, 550, 750, 950].map(x => <Line key={`x${x}`} x1={x} y1={0} x2={x} y2={700} stroke={colors.border} strokeWidth={1.5} strokeDasharray="5 10" />)}
      <Path d={outline} fill={colors.primary} fillOpacity={.07} fillRule="evenodd" stroke={colors.textMuted} strokeOpacity={.4} strokeWidth={4} strokeLinejoin="round" />
      {steps > 0 && progress.paths.map((path, i) => <Path key={i} d={path} fill="none" stroke={colors.primary} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />)}
      <Circle cx={start[0]} cy={start[1]} r={10} fill={colors.textMuted} stroke={colors.card} strokeWidth={4} />
      <Circle cx={progress.marker[0]} cy={progress.marker[1]} r={22} fill={colors.primary} opacity={.18} />
      <Circle cx={progress.marker[0]} cy={progress.marker[1]} r={11} fill={colors.primary} stroke={colors.card} strokeWidth={4} />
    </Svg>
  </View>;
}
