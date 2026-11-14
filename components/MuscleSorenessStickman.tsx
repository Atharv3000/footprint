import React, { useState, useId } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path, G, Ellipse, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { MuscleGroupKey, MuscleRecoveryStatus } from '@/constants/muscleRecoveryEngine';

interface MuscleSorenessStickmanProps {
  recoveryMap: Record<MuscleGroupKey, MuscleRecoveryStatus>;
  selectedMuscle: MuscleGroupKey | null;
  onSelectMuscle: (muscle: MuscleGroupKey) => void;
  isDark?: boolean;
}

/**
 * Modern Clean Stylized Muscular Recovery & Soreness Visualizer
 * Beautiful vector illustration that matches the aesthetic of MuscleRanks,
 * without any off-putting, clinical, or raw fleshy anatomical raster images.
 */
export const MuscleSorenessStickman: React.FC<MuscleSorenessStickmanProps> = ({
  recoveryMap,
  selectedMuscle,
  onSelectMuscle,
  isDark = true,
}) => {
  const [viewAngle, setViewAngle] = useState<'front' | 'back'>('front');
  const gradId = `soreGrad${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const getMuscleColor = (mKey: MuscleGroupKey) => {
    const data = recoveryMap[mKey];
    return data ? data.statusColor : '#10b981';
  };

  const getInterpolatedRecoveryColors = (percent: number) => {
    // Smooth continuous gradient transition across 0% -> 50% -> 100%
    const clamped = Math.max(0, Math.min(100, percent));
    let r: number, g: number, b: number;
    if (clamped <= 50) {
      // Red (#ef4444: 239, 68, 68) to Amber (#f59e0b: 245, 158, 11)
      const t = clamped / 50;
      r = Math.round(239 + (245 - 239) * t);
      g = Math.round(68 + (158 - 68) * t);
      b = Math.round(68 + (11 - 68) * t);
    } else {
      // Amber (#f59e0b: 245, 158, 11) to Emerald Green (#10b981: 16, 185, 129)
      const t = (clamped - 50) / 50;
      r = Math.round(245 + (16 - 245) * t);
      g = Math.round(158 + (185 - 158) * t);
      b = Math.round(11 + (129 - 11) * t);
    }

    const baseHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    const lightR = Math.min(255, Math.round(r + (255 - r) * 0.35));
    const lightG = Math.min(255, Math.round(g + (255 - g) * 0.35));
    const lightB = Math.min(255, Math.round(b + (255 - b) * 0.35));
    const lightHex = `#${lightR.toString(16).padStart(2, '0')}${lightG.toString(16).padStart(2, '0')}${lightB.toString(16).padStart(2, '0')}`;

    const darkR = Math.max(0, Math.round(r * 0.65));
    const darkG = Math.max(0, Math.round(g * 0.65));
    const darkB = Math.max(0, Math.round(b * 0.65));
    const darkHex = `#${darkR.toString(16).padStart(2, '0')}${darkG.toString(16).padStart(2, '0')}${darkB.toString(16).padStart(2, '0')}`;

    return { light: lightHex, color: baseHex, dark: darkHex };
  };

  const getGradientColors = (mKey: MuscleGroupKey) => {
    const data = recoveryMap[mKey];
    const percent = data ? data.recoveryPercent : 100;
    return getInterpolatedRecoveryColors(percent);
  };

  const renderMuscleGroup = (mKey: MuscleGroupKey, paths: string[]) => {
    const isSelected = selectedMuscle === mKey;
    const color = getMuscleColor(mKey);

    return (
      <G key={mKey} onPress={() => onSelectMuscle(mKey)}>
        {paths.map((p, idx) => (
          <Path
            key={idx}
            d={p}
            fill={`url(#${gradId}${mKey})`}
            fillOpacity={isSelected ? 0.95 : 0.8}
            stroke={isSelected ? '#ffffff' : isDark ? '#27272a' : '#d4d4d8'}
            strokeWidth={isSelected ? 2.2 : 0.9}
            strokeLinejoin="round"
          />
        ))}
      </G>
    );
  };

  const allKeys: MuscleGroupKey[] = [
    'shoulders',
    'chest',
    'biceps',
    'triceps',
    'forearms',
    'abs',
    'quads',
    'hamstrings',
    'calves',
    'upper_back',
    'lats',
    'glutes',
  ];

  return (
    <View style={styles.card}>
      {/* Front vs Back View Switcher Tabs */}
      <View style={styles.angleToggleRow}>
        <TouchableOpacity
          style={[
            styles.angleBtn,
            viewAngle === 'front' && {
              backgroundColor: isDark ? '#27272a' : '#e4e4e7',
              borderColor: isDark ? '#52525b' : '#a1a1aa',
            },
          ]}
          onPress={() => setViewAngle('front')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.angleBtnText,
              { color: viewAngle === 'front' ? (isDark ? '#fff' : '#000') : (isDark ? '#a1a1aa' : '#71717a') },
            ]}
          >
            FRONT
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.angleBtn,
            viewAngle === 'back' && {
              backgroundColor: isDark ? '#27272a' : '#e4e4e7',
              borderColor: isDark ? '#52525b' : '#a1a1aa',
            },
          ]}
          onPress={() => setViewAngle('back')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.angleBtnText,
              { color: viewAngle === 'back' ? (isDark ? '#fff' : '#000') : (isDark ? '#a1a1aa' : '#71717a') },
            ]}
          >
            BACK
          </Text>
        </TouchableOpacity>
      </View>

      {/* Clean Stylized Vector Body Stage */}
      <View style={[styles.stageBox, { backgroundColor: isDark ? '#121215' : '#f8fafc' }]}>
        <Svg width="220" height="390" viewBox="0 0 200 400" accessibilityLabel="Muscle recovery diagram">
          <Defs>
            {allKeys.map((k) => {
              const g = getGradientColors(k);
              return (
                <LinearGradient key={k} id={`${gradId}${k}`} x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={g.light} />
                  <Stop offset="0.45" stopColor={g.color} />
                  <Stop offset="1" stopColor={g.dark} />
                </LinearGradient>
              );
            })}
          </Defs>

          {/* Ground drop shadow */}
          <Ellipse cx="100" cy="389" rx="42" ry="5.5" fill="#000" fillOpacity={isDark ? 0.35 : 0.15} />

          {/* Base Sleek Body Silhouette */}
          <Path
            d="M89 48 L88 63 L69 70 Q53 73 46 90 L40 135 L35 160 L30 201 L34 215 L40 218 L47 210 L49 193 L58 159 L63 128 L70 157 L65 188 L61 217 L64 263 L69 287 L68 329 L73 370 L66 378 L63 386 Q74 392 88 383 L88 367 L95 319 L98 283 L100 246 L102 283 L105 319 L112 367 L112 383 Q126 392 137 386 L134 378 L127 370 L132 329 L131 287 L136 263 L139 217 L135 188 L130 157 L137 128 L142 159 L151 193 L153 210 L160 218 L166 215 L170 201 L165 160 L160 135 L154 90 Q147 73 131 70 L112 63 L111 48 Z"
            fill={isDark ? '#27272a' : '#cbd5e1'}
            stroke={isDark ? '#3f3f46' : '#94a3b8'}
            strokeWidth="0.8"
          />

          {/* Stylized Head & Neck matching body silhouette styling */}
          <Ellipse cx="100" cy="29" rx="17" ry="22" fill={isDark ? '#27272a' : '#cbd5e1'} stroke={isDark ? '#3f3f46' : '#94a3b8'} strokeWidth="0.8" />
          <Path d="M86 46 L90 58 L100 64 L110 58 L114 46" fill={isDark ? '#27272a' : '#cbd5e1'} stroke={isDark ? '#3f3f46' : '#94a3b8'} strokeWidth="0.8" />

          {/* Dynamic Muscle Layers & Touch Zones */}
          {viewAngle === 'front' ? (
            <>
              {/* Shoulders / Delts */}
              {renderMuscleGroup('shoulders', [
                'M68 72 C57 73 48 82 47 94 L58 107 C66 100 72 89 74 78 Z',
                'M132 72 C143 73 152 82 153 94 L142 107 C134 100 128 89 126 78 Z',
              ])}

              {/* Biceps */}
              {renderMuscleGroup('biceps', [
                'M49 101 C42 113 42 132 47 145 C55 144 64 128 63 114 L58 106 Z',
                'M151 101 C158 113 158 132 153 145 C145 144 136 128 137 114 L142 106 Z',
              ])}

              {/* Forearms */}
              {renderMuscleGroup('forearms', [
                'M45 149 C38 162 34 183 38 200 L46 203 C52 187 57 169 54 154 Z',
                'M155 149 C162 162 166 183 162 200 L154 203 C148 187 143 169 146 154 Z',
              ])}

              {/* Chest / Pectorals */}
              {renderMuscleGroup('chest', [
                'M74 79 C83 74 95 77 99 84 L98 112 C86 121 73 115 67 101 Z',
                'M126 79 C117 74 105 77 101 84 L102 112 C114 121 127 115 133 101 Z',
              ])}

              {/* Abs & Core */}
              {renderMuscleGroup('abs', [
                'M81 117 Q91 119 99 116 L99 179 L88 189 L78 164 Z',
                'M119 117 Q109 119 101 116 L101 179 L112 189 L122 164 Z',
                'M73 117 L78 123 L76 151 L87 178 L83 185 L70 162 Z',
                'M127 117 L122 123 L124 151 L113 178 L117 185 L130 162 Z',
              ])}

              {/* Quadriceps */}
              {renderMuscleGroup('quads', [
                'M72 184 C83 184 96 192 97 215 L91 271 C89 282 80 285 73 278 C63 254 62 225 65 204 Z',
                'M128 184 C117 184 104 192 103 215 L109 271 C111 282 120 285 127 278 C137 254 138 225 135 204 Z',
              ])}

              {/* Calves */}
              {renderMuscleGroup('calves', [
                'M73 288 C66 304 68 330 72 347 L75 369 L83 369 L87 342 C93 320 90 299 85 288 Z',
                'M127 288 C134 304 132 330 128 347 L125 369 L117 369 L113 342 C107 320 110 299 115 288 Z',
              ])}

              {/* Anatomical Contours & Definition Lines */}
              <Path
                d="M83 132 L98 134 M102 134 L117 132 M83 148 L98 150 M102 150 L117 148 M87 165 L98 167 M102 167 L113 165 M77 199 L87 236 L82 270 M123 199 L113 236 L118 270"
                fill="none"
                stroke="#ffffff"
                strokeOpacity={isDark ? 0.45 : 0.65}
                strokeWidth="0.9"
              />
              <Circle cx="100" cy="190" r="2.2" fill={isDark ? '#18181b' : '#64748b'} />
            </>
          ) : (
            <>
              {/* Rear Deltoids */}
              {renderMuscleGroup('shoulders', [
                'M68 72 C57 73 48 82 47 94 L58 107 C66 100 72 89 74 78 Z',
                'M132 72 C143 73 152 82 153 94 L142 107 C134 100 128 89 126 78 Z',
              ])}

              {/* Triceps */}
              {renderMuscleGroup('triceps', [
                'M49 101 C42 113 42 132 47 145 C55 144 64 128 63 114 L58 106 Z',
                'M151 101 C158 113 158 132 153 145 C145 144 136 128 137 114 L142 106 Z',
              ])}

              {/* Forearms */}
              {renderMuscleGroup('forearms', [
                'M45 149 C38 162 34 183 38 200 L46 203 C52 187 57 169 54 154 Z',
                'M155 149 C162 162 166 183 162 200 L154 203 C148 187 143 169 146 154 Z',
              ])}

              {/* Upper Back & Trapezius */}
              {renderMuscleGroup('upper_back', [
                'M77 71 L99 65 L99 112 L74 132 L65 109 L64 93 Z',
                'M123 71 L101 65 L101 112 L126 132 L135 109 L136 93 Z',
              ])}

              {/* Lats */}
              {renderMuscleGroup('lats', [
                'M70 123 L98 114 L97 167 L83 180 L74 163 Z',
                'M130 123 L102 114 L103 167 L117 180 L126 163 Z',
              ])}

              {/* Glutes */}
              {renderMuscleGroup('glutes', [
                'M70 183 C78 175 90 174 99 183 L98 211 C86 221 71 212 66 201 Z',
                'M130 183 C122 175 110 174 101 183 L102 211 C114 221 129 212 134 201 Z',
              ])}

              {/* Hamstrings */}
              {renderMuscleGroup('hamstrings', [
                'M72 213 C83 213 96 220 95 240 L91 271 C89 282 80 285 73 278 C63 254 62 230 65 220 Z',
                'M128 213 C117 213 104 220 105 240 L109 271 C111 282 120 285 127 278 C137 254 138 230 135 220 Z',
              ])}

              {/* Calves Posterior */}
              {renderMuscleGroup('calves', [
                'M73 288 C66 304 68 330 72 347 L75 369 L83 369 L87 342 C93 320 90 299 85 288 Z',
                'M127 288 C134 304 132 330 128 347 L125 369 L117 369 L113 342 C107 320 110 299 115 288 Z',
              ])}

              {/* Back Contour Lines */}
              <Path
                d="M100 71 L100 163 M72 111 L98 123 M128 111 L102 123 M77 230 L82 271 M123 230 L118 271"
                fill="none"
                stroke="#ffffff"
                strokeOpacity={isDark ? 0.45 : 0.65}
                strokeWidth="0.8"
              />
            </>
          )}
        </Svg>
      </View>

      {/* Quick Muscle Selector Pills */}
      <View style={styles.quickPillsRow}>
        {(viewAngle === 'front'
          ? (['chest', 'abs', 'shoulders', 'biceps', 'quads', 'calves'] as MuscleGroupKey[])
          : (['upper_back', 'lats', 'triceps', 'glutes', 'hamstrings', 'calves'] as MuscleGroupKey[])
        ).map((mKey) => {
          const isSelected = selectedMuscle === mKey;
          const status = recoveryMap[mKey];
          const color = status ? status.statusColor : '#10b981';
          return (
            <TouchableOpacity
              key={mKey}
              style={[
                styles.quickPill,
                {
                  backgroundColor: isSelected ? color + '25' : isDark ? '#18181b' : '#f4f4f5',
                  borderColor: isSelected ? color : isDark ? '#27272a' : '#e4e4e7',
                },
              ]}
              onPress={() => onSelectMuscle(mKey)}
              activeOpacity={0.7}
            >
              <View style={[styles.pillDot, { backgroundColor: color }]} />
              <Text
                style={[
                  styles.quickPillText,
                  {
                    color: isSelected ? color : isDark ? '#d4d4d8' : '#3f3f46',
                    fontWeight: isSelected ? '800' : '600',
                  },
                ]}
              >
                {mKey.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Soreness Status Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
          <Text style={[styles.legendLabel, { color: isDark ? '#a1a1aa' : '#71717a' }]}>Sore (&lt;50%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#f97316' }]} />
          <Text style={[styles.legendLabel, { color: isDark ? '#a1a1aa' : '#71717a' }]}>Mild</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#eab308' }]} />
          <Text style={[styles.legendLabel, { color: isDark ? '#a1a1aa' : '#71717a' }]}>Moderate</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
          <Text style={[styles.legendLabel, { color: isDark ? '#a1a1aa' : '#71717a' }]}>Recovered</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 4,
    width: '100%',
  },
  angleToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  angleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  angleBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stageBox: {
    width: 200,
    height: 400,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.15)',
  },
  anatomyImage: {
    width: 200,
    height: 400,
    position: 'absolute',
  },
  svgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  quickPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 8,
  },
  quickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  quickPillText: {
    fontSize: 11,
    textTransform: 'capitalize',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
