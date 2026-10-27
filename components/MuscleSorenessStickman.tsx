import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MuscleGroupKey, MuscleRecoveryStatus } from '@/constants/muscleRecoveryEngine';

interface MuscleSorenessStickmanProps {
  recoveryMap: Record<MuscleGroupKey, MuscleRecoveryStatus>;
  selectedMuscle: MuscleGroupKey | null;
  onSelectMuscle: (muscle: MuscleGroupKey) => void;
  isDark?: boolean;
}

const frontAnatomyImg = require('@/assets/images/anatomy_front.png');
const backAnatomyImg = require('@/assets/images/anatomy_back.png');

/**
 * Photorealistic Medical Muscular Anatomy Soreness & Recovery Visualizer
 * Uses high-resolution realistic muscular atlas images with precision anatomical overlay paths
 * matching exact human body contours (pectorals, abs, deltoids, quads, calves, trapezius, lats, glutes, hamstrings).
 */
export const MuscleSorenessStickman: React.FC<MuscleSorenessStickmanProps> = ({
  recoveryMap,
  selectedMuscle,
  onSelectMuscle,
  isDark = true,
}) => {
  const [viewAngle, setViewAngle] = useState<'front' | 'back'>('front');

  const getMuscleColor = (mKey: MuscleGroupKey) => {
    const data = recoveryMap[mKey];
    return data ? data.statusColor : '#10b981';
  };

  const getPathStyle = (mKey: MuscleGroupKey) => {
    const isSelected = selectedMuscle === mKey;
    const color = getMuscleColor(mKey);
    const data = recoveryMap[mKey];
    const isSore = data?.status === 'sore';
    const isRecovering = data?.status === 'recovering';

    // Base fill opacity: sore is clearly red/amber, ready is a subtle clean tint
    let fillOpacity = isSelected ? 0.65 : isSore ? 0.55 : isRecovering ? 0.45 : 0.22;
    let strokeWidth = isSelected ? 2.5 : 1.2;

    return {
      fill: color,
      fillOpacity,
      stroke: isSelected ? '#ffffff' : color,
      strokeWidth,
      strokeOpacity: isSelected ? 1 : 0.75,
    };
  };

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
            ANTERIOR (FRONT)
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
            POSTERIOR (BACK)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sleek Minimalist Anatomy Stage (Pre-mounted dual layers for zero-lag instant toggle) */}
      <View style={[styles.stageBox, { backgroundColor: isDark ? '#09090b' : '#f4f4f5' }]}>
        <Image
          source={frontAnatomyImg}
          style={[
            styles.anatomyImage,
            { opacity: viewAngle === 'front' ? (isDark ? 0.88 : 0.92) : 0 },
          ]}
          resizeMode="contain"
        />
        <Image
          source={backAnatomyImg}
          style={[
            styles.anatomyImage,
            { opacity: viewAngle === 'back' ? (isDark ? 0.88 : 0.92) : 0 },
          ]}
          resizeMode="contain"
        />

        {/* Anatomical Soreness Heatmap & Touch Target Layer (Exact coordinate bounds on 200x400 viewport) */}
        <Svg width="200" height="400" viewBox="0 0 200 400" style={styles.svgOverlay}>
          {viewAngle === 'front' ? (
            <>
              {/* SHOULDERS / DELTOIDS (Right & Left) */}
              <Path
                d="M 68 76 C 60 78 52 84 50 94 C 48 104 54 112 60 108 C 66 104 68 94 70 82 Z"
                {...getPathStyle('shoulders')}
                onPress={() => onSelectMuscle('shoulders')}
              />
              <Path
                d="M 132 76 C 140 78 148 84 150 94 C 152 104 146 112 140 108 C 134 104 132 94 130 82 Z"
                {...getPathStyle('shoulders')}
                onPress={() => onSelectMuscle('shoulders')}
              />

              {/* CHEST / PECTORALS (Right & Left) */}
              <Path
                d="M 72 82 C 82 80 98 84 98 98 C 98 112 86 118 76 116 C 68 114 66 98 72 82 Z"
                {...getPathStyle('chest')}
                onPress={() => onSelectMuscle('chest')}
              />
              <Path
                d="M 128 82 C 118 80 102 84 102 98 C 102 112 114 118 124 116 C 132 114 134 98 128 82 Z"
                {...getPathStyle('chest')}
                onPress={() => onSelectMuscle('chest')}
              />

              {/* BICEPS (Right & Left Arms) */}
              <Path
                d="M 52 106 C 46 116 46 132 52 144 C 58 144 64 130 64 116 C 64 108 58 104 52 106 Z"
                {...getPathStyle('biceps')}
                onPress={() => onSelectMuscle('biceps')}
              />
              <Path
                d="M 148 106 C 154 116 154 132 148 144 C 142 144 136 130 136 116 C 136 108 142 104 148 106 Z"
                {...getPathStyle('biceps')}
                onPress={() => onSelectMuscle('biceps')}
              />

              {/* FOREARMS (Right & Left) */}
              <Path
                d="M 46 150 C 40 166 38 188 44 206 C 50 206 56 186 56 164 C 56 154 50 150 46 150 Z"
                {...getPathStyle('forearms')}
                onPress={() => onSelectMuscle('forearms')}
              />
              <Path
                d="M 154 150 C 160 166 162 188 156 206 C 150 206 144 186 144 164 C 144 154 150 150 154 150 Z"
                {...getPathStyle('forearms')}
                onPress={() => onSelectMuscle('forearms')}
              />

              {/* ABS & CORE */}
              <Path
                d="M 84 120 C 92 118 108 118 116 120 C 122 142 120 168 114 186 C 104 192 96 192 86 186 C 80 168 78 142 84 120 Z"
                {...getPathStyle('abs')}
                onPress={() => onSelectMuscle('abs')}
              />

              {/* QUADRICEPS (Right & Left Thighs) */}
              <Path
                d="M 72 192 C 86 192 96 206 94 236 C 92 262 84 282 76 284 C 68 282 64 258 64 228 C 64 204 68 192 72 192 Z"
                {...getPathStyle('quads')}
                onPress={() => onSelectMuscle('quads')}
              />
              <Path
                d="M 128 192 C 114 192 104 206 106 236 C 108 262 116 282 124 284 C 132 282 136 258 136 228 C 136 204 132 192 128 192 Z"
                {...getPathStyle('quads')}
                onPress={() => onSelectMuscle('quads')}
              />

              {/* CALVES (Right & Left Lower Legs) */}
              <Path
                d="M 74 294 C 82 296 86 314 85 348 C 83 372 78 382 76 382 C 72 382 68 372 70 348 C 70 314 71 296 74 294 Z"
                {...getPathStyle('calves')}
                onPress={() => onSelectMuscle('calves')}
              />
              <Path
                d="M 126 294 C 118 296 114 314 115 348 C 117 372 122 382 124 382 C 128 382 132 372 130 348 C 130 314 129 296 126 294 Z"
                {...getPathStyle('calves')}
                onPress={() => onSelectMuscle('calves')}
              />
            </>
          ) : (
            <>
              {/* UPPER BACK & TRAPS (Trapezius) */}
              <Path
                d="M 100 58 C 112 68 132 74 138 82 C 128 94 116 108 100 124 C 84 108 72 94 62 82 C 68 74 88 68 100 58 Z"
                {...getPathStyle('upper_back')}
                onPress={() => onSelectMuscle('upper_back')}
              />

              {/* REAR DELTOIDS */}
              <Path
                d="M 62 80 C 54 82 46 90 44 100 C 46 110 56 108 62 100 Z"
                {...getPathStyle('shoulders')}
                onPress={() => onSelectMuscle('shoulders')}
              />
              <Path
                d="M 138 80 C 146 82 154 90 156 100 C 154 110 144 108 138 100 Z"
                {...getPathStyle('shoulders')}
                onPress={() => onSelectMuscle('shoulders')}
              />

              {/* TRICEPS */}
              <Path
                d="M 48 104 C 42 118 42 136 46 148 C 52 148 58 134 58 118 C 58 110 52 104 48 104 Z"
                {...getPathStyle('triceps')}
                onPress={() => onSelectMuscle('triceps')}
              />
              <Path
                d="M 152 104 C 158 118 158 136 154 148 C 148 148 142 134 142 118 C 142 110 148 104 152 104 Z"
                {...getPathStyle('triceps')}
                onPress={() => onSelectMuscle('triceps')}
              />

              {/* LATS (Latissimus Dorsi Wings) */}
              <Path
                d="M 70 94 C 82 106 94 122 96 152 C 84 154 74 144 66 122 C 64 106 68 96 70 94 Z"
                {...getPathStyle('lats')}
                onPress={() => onSelectMuscle('lats')}
              />
              <Path
                d="M 130 94 C 118 106 106 122 104 152 C 116 154 126 144 134 122 C 136 106 132 96 130 94 Z"
                {...getPathStyle('lats')}
                onPress={() => onSelectMuscle('lats')}
              />

              {/* GLUTES */}
              <Path
                d="M 98 158 C 98 178 92 204 74 204 C 62 202 58 182 64 166 C 74 154 90 154 98 158 Z"
                {...getPathStyle('glutes')}
                onPress={() => onSelectMuscle('glutes')}
              />
              <Path
                d="M 102 158 C 102 178 108 204 126 204 C 138 202 142 182 136 166 C 126 154 110 154 102 158 Z"
                {...getPathStyle('glutes')}
                onPress={() => onSelectMuscle('glutes')}
              />

              {/* HAMSTRINGS */}
              <Path
                d="M 72 208 C 86 208 94 224 92 254 C 90 274 82 288 74 288 C 66 288 62 274 62 250 C 62 226 66 208 72 208 Z"
                {...getPathStyle('hamstrings')}
                onPress={() => onSelectMuscle('hamstrings')}
              />
              <Path
                d="M 128 208 C 114 208 106 224 108 254 C 110 274 118 288 126 288 C 134 288 138 274 138 250 C 138 226 134 208 128 208 Z"
                {...getPathStyle('hamstrings')}
                onPress={() => onSelectMuscle('hamstrings')}
              />

              {/* POSTERIOR CALVES (Gastrocnemius & Soleus) */}
              <Path
                d="M 74 294 C 84 296 88 316 86 350 C 84 374 78 382 76 382 C 72 382 68 374 68 350 C 68 316 70 296 74 294 Z"
                {...getPathStyle('calves')}
                onPress={() => onSelectMuscle('calves')}
              />
              <Path
                d="M 126 294 C 116 296 112 316 114 350 C 116 374 122 382 124 382 C 128 382 132 374 132 350 C 132 316 130 296 126 294 Z"
                {...getPathStyle('calves')}
                onPress={() => onSelectMuscle('calves')}
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
          <Text style={[styles.legendLabel, { color: isDark ? '#a1a1aa' : '#71717a' }]}>Sore / DOMS (&lt;55%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
          <Text style={[styles.legendLabel, { color: isDark ? '#a1a1aa' : '#71717a' }]}>Recovering (55-89%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
          <Text style={[styles.legendLabel, { color: isDark ? '#a1a1aa' : '#71717a' }]}>100% Ready</Text>
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
