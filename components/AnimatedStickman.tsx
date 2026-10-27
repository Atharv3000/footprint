import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Rect, Path, Ellipse } from 'react-native-svg';


interface AnimatedStickmanProps {
  category: 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio';
  exerciseId?: string;
  color?: string;
  size?: number;
}

/**
 * Animated Stickman Workout Avatar
 * Dynamically performs realistic workout animations tailored to the specific selected exercise:
 * - squats: Deep squatting hips down, knees flaring out, barbell on upper traps
 * - leg_press: Seated reclined back, knees bending in and pressing leg sled platform away
 * - romanian_deadlift: Stiff leg hip hinge, spine flat, lowering barbell to shins
 * - bench_press: Lying flat on bench, elbows lowering and pressing barbell to full lockout
 * - incline_dumbbell_press: 45° incline bench, dumbbells pressing up-forward from chest
 * - deadlift: Squatting into bar, standing up driving hips forward with heavy barbell
 * - barbell_row: Bent-over 45° torso, rowing barbell from floor up into belly
 * - pull_ups: Hanging vertically from bar, pulling chin all the way over the bar
 * - overhead_press: Standing tall, pressing barbell from clavicles overhead to lockout
 * - lateral_raises: Standing upright, raising dumbbells laterally in wide arc to parallel
 * - bicep_curls: Elbows anchored at waist, curling barbell up to chest
 * - tricep_pushdown: Torso slight forward lean, pressing rope/handle down to thighs
 */
export const AnimatedStickman: React.FC<AnimatedStickmanProps> = ({
  category,
  exerciseId,
  color = '#10b981',
  size = 140,
}) => {
  const anim = useRef(new Animated.Value(0)).current;

  // Resolve target movement key
  const activeEx = exerciseId || (
    category === 'legs' ? 'squats' :
    category === 'chest' ? 'bench_press' :
    category === 'back' ? 'deadlift' :
    category === 'shoulders' ? 'overhead_press' :
    category === 'arms' ? 'bicep_curls' :
    category === 'core' ? 'cable_crunches' :
    category === 'cardio' ? 'jumping_jacks' : 'squats'
  );

  useEffect(() => {
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 950,
          useNativeDriver: false,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 950,
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();

    return () => loop.stop();
  }, [activeEx, anim]);

  const [frame, setFrame] = React.useState(0);
  useEffect(() => {
    const id = anim.addListener(() => {
      setFrame((f) => (f + 1) % 10000);
    });
    return () => anim.removeListener(id);
  }, [anim]);

  // Interpolation mappings for specific exercises (0 = start/reset, 1 = peak effort/rep inflection)
  // ViewBox: 0 0 100 120

  // 1. Head position
  const headX = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['bench_press', 'dumbbell_flyes', 'skull_crushers', 'hamstring_curls'].includes(activeEx) ? [20, 20] :
      ['incline_dumbbell_press'].includes(activeEx) ? [28, 28] :
      ['leg_press'].includes(activeEx) ? [22, 22] :
      ['pushups'].includes(activeEx) ? [22, 22] :
      ['barbell_row', 'rear_delt_flyes'].includes(activeEx) ? [36, 40] :
      ['seated_cable_row', 't_bar_row'].includes(activeEx) ? [34, 38] :
      ['deadlift', 'romanian_deadlift'].includes(activeEx) ? [42, 50] :
      [50, 50],
  });

  const headY = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['squats', 'lunges'].includes(activeEx) ? [20, 48] :
      ['pushups'].includes(activeEx) ? [58, 76] :
      ['dips_chest'].includes(activeEx) ? [22, 38] :
      ['bench_press', 'dumbbell_flyes', 'skull_crushers'].includes(activeEx) ? [70, 70] :
      ['hamstring_curls'].includes(activeEx) ? [74, 74] :
      ['incline_dumbbell_press'].includes(activeEx) ? [46, 46] :
      ['leg_press', 'leg_extensions'].includes(activeEx) ? [68, 68] :
      ['pull_ups', 'lat_pulldown'].includes(activeEx) ? [44, 20] :
      ['barbell_row', 'rear_delt_flyes'].includes(activeEx) ? [32, 26] :
      ['seated_cable_row', 't_bar_row'].includes(activeEx) ? [34, 30] :
      ['deadlift'].includes(activeEx) ? [46, 20] :
      ['romanian_deadlift'].includes(activeEx) ? [24, 46] :
      ['calf_raises'].includes(activeEx) ? [22, 14] :
      [22, 22],
  });

  // 2. Torso Neck/Shoulder (X1, Y1) to Hip (X2, Y2)
  const torsoX1 = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['bench_press', 'dumbbell_flyes', 'skull_crushers', 'hamstring_curls'].includes(activeEx) ? [26, 26] :
      ['pushups'].includes(activeEx) ? [28, 28] :
      ['incline_dumbbell_press'].includes(activeEx) ? [34, 34] :
      ['leg_press'].includes(activeEx) ? [28, 28] :
      ['barbell_row', 'rear_delt_flyes'].includes(activeEx) ? [40, 44] :
      ['seated_cable_row', 't_bar_row'].includes(activeEx) ? [38, 42] :
      ['deadlift', 'romanian_deadlift'].includes(activeEx) ? [44, 50] :
      [50, 50],
  });

  const torsoY1 = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['squats', 'lunges'].includes(activeEx) ? [28, 56] :
      ['pushups'].includes(activeEx) ? [62, 80] :
      ['dips_chest'].includes(activeEx) ? [30, 46] :
      ['bench_press', 'dumbbell_flyes', 'skull_crushers'].includes(activeEx) ? [70, 70] :
      ['hamstring_curls'].includes(activeEx) ? [74, 74] :
      ['incline_dumbbell_press'].includes(activeEx) ? [54, 54] :
      ['leg_press', 'leg_extensions'].includes(activeEx) ? [70, 70] :
      ['pull_ups', 'lat_pulldown'].includes(activeEx) ? [52, 28] :
      ['barbell_row', 'rear_delt_flyes'].includes(activeEx) ? [40, 34] :
      ['seated_cable_row', 't_bar_row'].includes(activeEx) ? [42, 38] :
      ['deadlift'].includes(activeEx) ? [54, 28] :
      ['romanian_deadlift'].includes(activeEx) ? [32, 54] :
      ['calf_raises'].includes(activeEx) ? [30, 22] :
      [30, 30],
  });

  const torsoX2 = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['bench_press', 'dumbbell_flyes', 'skull_crushers', 'hamstring_curls'].includes(activeEx) ? [54, 54] :
      ['pushups'].includes(activeEx) ? [62, 62] :
      ['incline_dumbbell_press'].includes(activeEx) ? [52, 52] :
      ['leg_press'].includes(activeEx) ? [44, 44] :
      ['barbell_row', 'rear_delt_flyes'].includes(activeEx) ? [58, 58] :
      ['seated_cable_row', 't_bar_row'].includes(activeEx) ? [54, 54] :
      ['deadlift', 'romanian_deadlift'].includes(activeEx) ? [52, 50] :
      [50, 50],
  });

  const torsoY2 = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['squats', 'lunges'].includes(activeEx) ? [62, 82] :
      ['pushups'].includes(activeEx) ? [72, 84] :
      ['dips_chest'].includes(activeEx) ? [58, 74] :
      ['bench_press', 'dumbbell_flyes', 'skull_crushers', 'hamstring_curls'].includes(activeEx) ? [70, 70] :
      ['incline_dumbbell_press'].includes(activeEx) ? [78, 78] :
      ['leg_press', 'leg_extensions'].includes(activeEx) ? [82, 82] :
      ['pull_ups'].includes(activeEx) ? [80, 56] :
      ['lat_pulldown'].includes(activeEx) ? [80, 80] :
      ['barbell_row', 'rear_delt_flyes'].includes(activeEx) ? [58, 58] :
      ['seated_cable_row', 't_bar_row'].includes(activeEx) ? [74, 74] :
      ['deadlift'].includes(activeEx) ? [72, 60] :
      ['romanian_deadlift'].includes(activeEx) ? [60, 68] :
      ['calf_raises'].includes(activeEx) ? [60, 52] :
      [60, 60],
  });

  // 3. Hands / Barbell / Equipment Coordinates
  const handY = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['squats'].includes(activeEx) ? [30, 58] :
      ['lunges'].includes(activeEx) ? [48, 70] :
      ['pushups'].includes(activeEx) ? [82, 82] :
      ['dips_chest'].includes(activeEx) ? [46, 58] :
      ['bench_press', 'dumbbell_flyes'].includes(activeEx) ? [66, 38] : // Chest press lockout
      ['incline_dumbbell_press'].includes(activeEx) ? [60, 28] : // Incline press lockout
      ['cable_crossover'].includes(activeEx) ? [32, 58] : // Fly hug forward
      ['overhead_press', 'arnold_press'].includes(activeEx) ? [36, 10] : // Overhead press
      ['lateral_raises', 'rear_delt_flyes'].includes(activeEx) ? [64, 30] : // Lateral raise horizontal
      ['front_raises'].includes(activeEx) ? [64, 32] : // Front raise
      ['bicep_curls', 'hammer_curls', 'preacher_curls'].includes(activeEx) ? [66, 34] : // Bicep curl up
      ['tricep_pushdown'].includes(activeEx) ? [42, 68] : // Pushdown to thighs
      ['skull_crushers'].includes(activeEx) ? [40, 64] : // Flex elbows back
      ['barbell_row', 'seated_cable_row', 't_bar_row'].includes(activeEx) ? [72, 44] : // Row to abdomen
      ['deadlift'].includes(activeEx) ? [82, 52] : // Deadlift lockout
      ['romanian_deadlift'].includes(activeEx) ? [52, 80] : // Lowering to shins
      ['pull_ups'].includes(activeEx) ? [20, 20] : // Hands anchored on pullup bar
      ['lat_pulldown'].includes(activeEx) ? [20, 48] : // Pull bar down to chin
      ['calf_raises'].includes(activeEx) ? [48, 40] :
      [48, 48],
  });

  const handXLeft = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['bench_press', 'skull_crushers'].includes(activeEx) ? [38, 38] :
      ['dumbbell_flyes'].includes(activeEx) ? [44, 18] :
      ['cable_crossover'].includes(activeEx) ? [24, 46] :
      ['incline_dumbbell_press'].includes(activeEx) ? [42, 48] :
      ['lateral_raises', 'rear_delt_flyes'].includes(activeEx) ? [38, 14] : // Wide lateral arc
      ['front_raises'].includes(activeEx) ? [46, 46] :
      ['bicep_curls', 'hammer_curls', 'preacher_curls'].includes(activeEx) ? [38, 42] :
      ['tricep_pushdown'].includes(activeEx) ? [44, 46] :
      ['barbell_row', 'seated_cable_row', 't_bar_row'].includes(activeEx) ? [44, 46] :
      ['pull_ups', 'lat_pulldown'].includes(activeEx) ? [28, 32] :
      [32, 32],
  });

  const handXRight = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['bench_press', 'skull_crushers'].includes(activeEx) ? [38, 38] :
      ['dumbbell_flyes'].includes(activeEx) ? [44, 18] :
      ['cable_crossover'].includes(activeEx) ? [76, 54] :
      ['incline_dumbbell_press'].includes(activeEx) ? [42, 48] :
      ['lateral_raises', 'rear_delt_flyes'].includes(activeEx) ? [62, 86] : // Wide lateral arc
      ['front_raises'].includes(activeEx) ? [54, 54] :
      ['bicep_curls', 'hammer_curls', 'preacher_curls'].includes(activeEx) ? [62, 58] :
      ['tricep_pushdown'].includes(activeEx) ? [56, 54] :
      ['barbell_row', 'seated_cable_row', 't_bar_row'].includes(activeEx) ? [44, 46] :
      ['pull_ups', 'lat_pulldown'].includes(activeEx) ? [72, 68] :
      [68, 68],
  });

  // 4. Legs: Knees & Feet
  const kneeY = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['squats'].includes(activeEx) ? [80, 88] :
      ['lunges'].includes(activeEx) ? [78, 92] :
      ['leg_press'].includes(activeEx) ? [78, 52] : // Sled press
      ['leg_extensions'].includes(activeEx) ? [84, 68] :
      ['hamstring_curls'].includes(activeEx) ? [74, 56] :
      ['bench_press', 'dumbbell_flyes', 'skull_crushers'].includes(activeEx) ? [82, 82] :
      ['pushups'].includes(activeEx) ? [84, 90] :
      ['incline_dumbbell_press'].includes(activeEx) ? [90, 90] :
      ['deadlift'].includes(activeEx) ? [90, 78] :
      ['barbell_row', 'rear_delt_flyes'].includes(activeEx) ? [78, 78] :
      ['seated_cable_row', 't_bar_row'].includes(activeEx) ? [80, 80] :
      ['pull_ups'].includes(activeEx) ? [96, 72] :
      ['calf_raises'].includes(activeEx) ? [78, 70] :
      [80, 80],
  });

  const kneeXLeft = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['squats'].includes(activeEx) ? [40, 24] :
      ['lunges'].includes(activeEx) ? [46, 32] :
      ['leg_press'].includes(activeEx) ? [56, 68] :
      ['leg_extensions'].includes(activeEx) ? [62, 74] :
      ['hamstring_curls'].includes(activeEx) ? [66, 62] :
      ['bench_press', 'dumbbell_flyes', 'skull_crushers'].includes(activeEx) ? [68, 68] :
      ['pushups'].includes(activeEx) ? [76, 76] :
      ['incline_dumbbell_press'].includes(activeEx) ? [64, 64] :
      ['barbell_row', 'rear_delt_flyes'].includes(activeEx) ? [64, 64] :
      ['deadlift'].includes(activeEx) ? [46, 48] :
      [42, 42],
  });

  const kneeXRight = anim.interpolate({
    inputRange: [0, 1],
    outputRange:
      ['squats'].includes(activeEx) ? [60, 76] :
      ['lunges'].includes(activeEx) ? [54, 68] :
      ['leg_press'].includes(activeEx) ? [56, 68] :
      ['leg_extensions'].includes(activeEx) ? [62, 74] :
      ['hamstring_curls'].includes(activeEx) ? [66, 62] :
      ['bench_press', 'dumbbell_flyes', 'skull_crushers'].includes(activeEx) ? [68, 68] :
      ['pushups'].includes(activeEx) ? [76, 76] :
      ['incline_dumbbell_press'].includes(activeEx) ? [64, 64] :
      ['barbell_row', 'rear_delt_flyes'].includes(activeEx) ? [64, 64] :
      ['deadlift'].includes(activeEx) ? [54, 52] :
      [58, 58],
  });

  // Helper values
  // @ts-ignore
  const cHeadX = headX.__getValue ? headX.__getValue() : 50;
  // @ts-ignore
  const cHeadY = headY.__getValue ? headY.__getValue() : 22;
  // @ts-ignore
  const cTorsoX1 = torsoX1.__getValue ? torsoX1.__getValue() : 50;
  // @ts-ignore
  const cTorsoY1 = torsoY1.__getValue ? torsoY1.__getValue() : 30;
  // @ts-ignore
  const cTorsoX2 = torsoX2.__getValue ? torsoX2.__getValue() : 50;
  // @ts-ignore
  const cTorsoY2 = torsoY2.__getValue ? torsoY2.__getValue() : 60;
  // @ts-ignore
  const cHandY = handY.__getValue ? handY.__getValue() : 48;
  // @ts-ignore
  const cHandXLeft = handXLeft.__getValue ? handXLeft.__getValue() : 32;
  // @ts-ignore
  const cHandXRight = handXRight.__getValue ? handXRight.__getValue() : 68;
  // @ts-ignore
  const cKneeY = kneeY.__getValue ? kneeY.__getValue() : 80;
  // @ts-ignore
  const cKneeXLeft = kneeXLeft.__getValue ? kneeXLeft.__getValue() : 42;
  // @ts-ignore
  const cKneeXRight = kneeXRight.__getValue ? kneeXRight.__getValue() : 58;

  return (
    <View style={[styles.container, { width: size, height: size * 1.1 }]}>
      <Svg width={size} height={size * 1.1} viewBox="0 0 100 120">
        {/* Specific Equipment Backgrounds */}

        {/* Bench for Bench Press */}
        {activeEx === 'bench_press' && (
          <>
            <Line x1="14" y1="76" x2="82" y2="76" stroke="#52525b" strokeWidth="4" strokeLinecap="round" />
            <Line x1="22" y1="76" x2="22" y2="108" stroke="#3f3f46" strokeWidth="3" />
            <Line x1="74" y1="76" x2="74" y2="108" stroke="#3f3f46" strokeWidth="3" />
          </>
        )}

        {/* Incline Bench for Incline Press */}
        {activeEx === 'incline_dumbbell_press' && (
          <>
            <Line x1="20" y1="92" x2="62" y2="44" stroke="#52525b" strokeWidth="4.5" strokeLinecap="round" />
            <Line x1="28" y1="84" x2="28" y2="108" stroke="#3f3f46" strokeWidth="3" />
            <Line x1="56" y1="52" x2="56" y2="108" stroke="#3f3f46" strokeWidth="3" />
          </>
        )}

        {/* Pull Up Bar */}
        {activeEx === 'pull_ups' && (
          <>
            <Line x1="12" y1="20" x2="88" y2="20" stroke="#71717a" strokeWidth="3.5" strokeLinecap="round" />
            <Line x1="20" y1="20" x2="20" y2="6" stroke="#52525b" strokeWidth="3" />
            <Line x1="80" y1="20" x2="80" y2="6" stroke="#52525b" strokeWidth="3" />
          </>
        )}

        {/* Cable Pulley for Triceps */}
        {activeEx === 'tricep_pushdown' && (
          <>
            <Line x1="50" y1="6" x2="50" y2="18" stroke="#52525b" strokeWidth="4" strokeLinecap="round" />
            <Circle cx="50" cy="18" r="4" fill="#71717a" />
            <Line x1="50" y1="18" x2={cHandXLeft + 4} y2={cHandY} stroke="#a1a1aa" strokeWidth="1.6" />
          </>
        )}

        {/* Leg Press Sled Machine */}
        {activeEx === 'leg_press' && (
          <>
            <Line x1="24" y1="98" x2="88" y2="34" stroke="#52525b" strokeWidth="4" strokeLinecap="round" />
            {/* Sled Platform attached to feet */}
            <Rect x={cKneeXLeft + 12} y={cKneeY - 18} width="8" height="24" rx="2" fill="#71717a" />
          </>
        )}

        {/* Muscular Anatomy Overlay - Dynamic anatomical muscle visualization with proper ovals & contours */}
        {/* Torso core / ribcage / abs */}
        {!['bench_press', 'pushups', 'incline_dumbbell_press'].includes(activeEx) && (
          <>
            {/* Pectorals / Chest - Left & Right anatomical ovals */}
            <Ellipse
              cx={cTorsoX1 - 5.5}
              cy={cTorsoY1 + 6}
              rx={6}
              ry={3.8}
              fill={['dumbbell_flyes', 'dips_chest', 'cable_crossover'].includes(activeEx) || category === 'chest' ? color : '#3f3f46'}
              opacity={['dumbbell_flyes', 'dips_chest', 'cable_crossover'].includes(activeEx) || category === 'chest' ? 0.95 : 0.35}
            />
            <Ellipse
              cx={cTorsoX1 + 5.5}
              cy={cTorsoY1 + 6}
              rx={6}
              ry={3.8}
              fill={['dumbbell_flyes', 'dips_chest', 'cable_crossover'].includes(activeEx) || category === 'chest' ? color : '#3f3f46'}
              opacity={['dumbbell_flyes', 'dips_chest', 'cable_crossover'].includes(activeEx) || category === 'chest' ? 0.95 : 0.35}
            />

            {/* Core / Abdominals - Sculpted paired ovals */}
            <Ellipse
              cx={cTorsoX1 - 3.2}
              cy={cTorsoY1 + 13}
              rx={2.8}
              ry={2.2}
              fill={category === 'core' ? color : '#3f3f46'}
              opacity={category === 'core' ? 0.9 : 0.32}
            />
            <Ellipse
              cx={cTorsoX1 + 3.2}
              cy={cTorsoY1 + 13}
              rx={2.8}
              ry={2.2}
              fill={category === 'core' ? color : '#3f3f46'}
              opacity={category === 'core' ? 0.9 : 0.32}
            />
            <Ellipse
              cx={cTorsoX1 - 3.2}
              cy={cTorsoY1 + 18}
              rx={2.8}
              ry={2.2}
              fill={category === 'core' ? color : '#3f3f46'}
              opacity={category === 'core' ? 0.9 : 0.32}
            />
            <Ellipse
              cx={cTorsoX1 + 3.2}
              cy={cTorsoY1 + 18}
              rx={2.8}
              ry={2.2}
              fill={category === 'core' ? color : '#3f3f46'}
              opacity={category === 'core' ? 0.9 : 0.32}
            />
          </>
        )}

        {/* Shoulders / Deltoids - Natural angled ovals */}
        {!['bench_press'].includes(activeEx) && (
          <>
            <Ellipse
              cx={cTorsoX1 - 10}
              cy={cTorsoY1 + 4}
              rx={4.8}
              ry={3.4}
              fill={category === 'shoulders' ? color : '#52525b'}
              opacity={category === 'shoulders' ? 0.95 : 0.45}
            />
            <Ellipse
              cx={cTorsoX1 + 10}
              cy={cTorsoY1 + 4}
              rx={4.8}
              ry={3.4}
              fill={category === 'shoulders' ? color : '#52525b'}
              opacity={category === 'shoulders' ? 0.95 : 0.45}
            />
          </>
        )}

        {/* Biceps / Triceps muscle bulge on arms - Anatomical elongated ovals */}
        {['bicep_curls', 'hammer_curls', 'preacher_curls', 'tricep_pushdown', 'pull_ups', 'lat_pulldown'].includes(activeEx) && (
          <>
            <Ellipse
              cx={(cTorsoX1 + cHandXLeft) / 2 - 2}
              cy={(cTorsoY1 + cHandY) / 2}
              rx={3.6}
              ry={5.8}
              fill={color}
              opacity={0.92}
            />
            <Ellipse
              cx={(cTorsoX1 + cHandXRight) / 2 + 2}
              cy={(cTorsoY1 + cHandY) / 2}
              rx={3.6}
              ry={5.8}
              fill={color}
              opacity={0.92}
            />
          </>
        )}

        {/* Back / Lat flares - Sweeping contoured muscle wings */}
        {category === 'back' && !['bench_press'].includes(activeEx) && (
          <>
            <Path
              d={`M ${cTorsoX1 - 4} ${cTorsoY1 + 3} Q ${cTorsoX1 - 17} ${cTorsoY1 + 13} ${cTorsoX2 - 4} ${cTorsoY2 - 2} Z`}
              fill={color}
              opacity={0.85}
            />
            <Path
              d={`M ${cTorsoX1 + 4} ${cTorsoY1 + 3} Q ${cTorsoX1 + 17} ${cTorsoY1 + 13} ${cTorsoX2 + 4} ${cTorsoY2 - 2} Z`}
              fill={color}
              opacity={0.85}
            />
          </>
        )}

        {/* Quad / Thigh muscle definition on legs - Anatomical teardrop ovals */}
        {['squats', 'leg_press', 'romanian_deadlift', 'lunges', 'leg_extensions'].includes(activeEx) && (
          <>
            <Ellipse
              cx={(cTorsoX2 + cKneeXLeft) / 2}
              cy={(cTorsoY2 + cKneeY) / 2}
              rx={4.8}
              ry={7.2}
              fill={color}
              opacity={0.88}
            />
            <Ellipse
              cx={(cTorsoX2 + cKneeXRight) / 2}
              cy={(cTorsoY2 + cKneeY) / 2}
              rx={4.8}
              ry={7.2}
              fill={color}
              opacity={0.88}
            />
            {/* Calves muscle ovals */}
            <Ellipse
              cx={cKneeXLeft > 50 ? cKneeXLeft + 2 : cKneeXLeft - 2}
              cy={(cKneeY + 110) / 2}
              rx={3.2}
              ry={5.2}
              fill={color}
              opacity={0.7}
            />
            <Ellipse
              cx={cKneeXRight > 50 ? cKneeXRight + 2 : cKneeXRight - 2}
              cy={(cKneeY + 110) / 2}
              rx={3.2}
              ry={5.2}
              fill={color}
              opacity={0.7}
            />
          </>
        )}

        {/* Head - Anatomical athletic proportions */}
        <Ellipse cx={cHeadX} cy={cHeadY} rx={7.5} ry={8.8} fill={color} />

        {/* Torso Spine */}
        <Line
          x1={cTorsoX1}
          y1={cTorsoY1}
          x2={cTorsoX2}
          y2={cTorsoY2}
          stroke={color}
          strokeWidth="4.5"
          strokeLinecap="round"
        />

        {/* Left Arm / Right Arm */}
        {activeEx === 'bench_press' ? (
          // Arms pushing barbell straight up
          <>
            <Line x1={cTorsoX1 + 10} y1={cTorsoY1} x2={cHandXLeft} y2={cHandY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <Line x1={cTorsoX1 + 14} y1={cTorsoY1} x2={cHandXLeft + 4} y2={cHandY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
          </>
        ) : activeEx === 'incline_dumbbell_press' ? (
          // Incline arms pushing dumbbells
          <>
            <Line x1={cTorsoX1 + 8} y1={cTorsoY1} x2={cHandXLeft} y2={cHandY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <Line x1={cTorsoX1 + 14} y1={cTorsoY1} x2={cHandXRight} y2={cHandY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
          </>
        ) : (
          // Standing / hanging bilateral arms with elbows and forearms
          <>
            <Line x1={cTorsoX1 - 2} y1={cTorsoY1 + 4} x2={cHandXLeft} y2={cHandY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <Line x1={cTorsoX1 + 2} y1={cTorsoY1 + 4} x2={cHandXRight} y2={cHandY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
          </>
        )}

        {/* Legs: Left & Right */}
        {activeEx === 'bench_press' ? (
          // Legs draped off flat bench
          <>
            <Line x1={cTorsoX2} y1={cTorsoY2} x2={68} y2={76} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <Line x1={68} y1={76} x2={74} y2={104} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
          </>
        ) : activeEx === 'incline_dumbbell_press' ? (
          // Legs grounded seated
          <>
            <Line x1={cTorsoX2} y1={cTorsoY2} x2={66} y2={84} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <Line x1={66} y1={84} x2={70} y2={106} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
          </>
        ) : activeEx === 'leg_press' ? (
          // Seated legs driving footplate
          <>
            <Line x1={cTorsoX2} y1={cTorsoY2} x2={cKneeXLeft} y2={cKneeY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <Line x1={cKneeXLeft} y1={cKneeY} x2={cKneeXLeft + 16} y2={cKneeY - 10} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
          </>
        ) : activeEx === 'pull_ups' ? (
          // Hanging legs bent behind
          <>
            <Line x1={cTorsoX2} y1={cTorsoY2} x2={56} y2={cKneeY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <Line x1={56} y1={cKneeY} x2={52} y2={cKneeY + 16} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
          </>
        ) : (
          // Standing / squatting bilateral legs
          <>
            <Line x1={cTorsoX2} y1={cTorsoY2} x2={cKneeXLeft} y2={cKneeY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <Line x1={cKneeXLeft} y1={cKneeY} x2={activeEx === 'squats' ? 34 : 38} y2={110} stroke={color} strokeWidth="3.8" strokeLinecap="round" />

            <Line x1={cTorsoX2} y1={cTorsoY2} x2={cKneeXRight} y2={cKneeY} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <Line x1={cKneeXRight} y1={cKneeY} x2={activeEx === 'squats' ? 66 : 62} y2={110} stroke={color} strokeWidth="3.8" strokeLinecap="round" />
          </>
        )}

        {/* Weights & Equipment In Motion */}

        {/* Floor for Pushups */}
        {activeEx === 'pushups' && (
          <Line x1="10" y1="88" x2="90" y2="88" stroke="#52525b" strokeWidth="3" strokeLinecap="round" />
        )}

        {/* Dip Bars */}
        {activeEx === 'dips_chest' && (
          <>
            <Line x1="18" y1="58" x2="82" y2="58" stroke="#71717a" strokeWidth="4" strokeLinecap="round" />
            <Line x1="28" y1="58" x2="28" y2="108" stroke="#52525b" strokeWidth="3.5" />
            <Line x1="72" y1="58" x2="72" y2="108" stroke="#52525b" strokeWidth="3.5" />
          </>
        )}

        {/* Lat Pulldown Bar & Cable */}
        {activeEx === 'lat_pulldown' && (
          <>
            <Line x1="50" y1="6" x2="50" y2={cHandY} stroke="#a1a1aa" strokeWidth="1.6" />
            <Line x1={12} y1={cHandY} x2={88} y2={cHandY} stroke="#71717a" strokeWidth="3.5" strokeLinecap="round" />
          </>
        )}

        {/* Seated Cable Row Foot Plate & Cable */}
        {['seated_cable_row', 't_bar_row'].includes(activeEx) && (
          <>
            <Line x1="84" y1="68" x2="84" y2="92" stroke="#71717a" strokeWidth="4" strokeLinecap="round" />
            <Line x1={cHandXLeft} y1={cHandY} x2="84" y2="80" stroke="#a1a1aa" strokeWidth="1.6" />
          </>
        )}

        {/* Barbell (Squats, Bench, Deadlift, RDL, Row, OHP, Curls, Skull Crushers, Preacher) */}
        {['squats', 'bench_press', 'overhead_press', 'barbell_row', 'deadlift', 'romanian_deadlift', 'bicep_curls', 'skull_crushers', 'preacher_curls'].includes(activeEx) && (
          <>
            <Line
              x1={14}
              y1={cHandY}
              x2={86}
              y2={cHandY}
              stroke="#71717a"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            {/* Left Plates */}
            <Rect x={18} y={cHandY - 11} width={5} height={22} rx={2} fill={color} />
            {/* Right Plates */}
            <Rect x={77} y={cHandY - 11} width={5} height={22} rx={2} fill={color} />
          </>
        )}

        {/* Dumbbells (Incline DB, Flyes, Lunges, Lateral/Front/Rear Delt Raises, Arnold Press, Hammer Curls) */}
        {['incline_dumbbell_press', 'dumbbell_flyes', 'lunges', 'lateral_raises', 'front_raises', 'rear_delt_flyes', 'arnold_press', 'hammer_curls'].includes(activeEx) && (
          <>
            {/* Left DB */}
            <Line x1={cHandXLeft - 8} y1={cHandY} x2={cHandXLeft + 8} y2={cHandY} stroke="#71717a" strokeWidth="2.5" strokeLinecap="round" />
            <Circle cx={cHandXLeft - 6} cy={cHandY} r="4" fill={color} />
            <Circle cx={cHandXLeft + 6} cy={cHandY} r="4" fill={color} />

            {/* Right DB */}
            <Line x1={cHandXRight - 8} y1={cHandY} x2={cHandXRight + 8} y2={cHandY} stroke="#71717a" strokeWidth="2.5" strokeLinecap="round" />
            <Circle cx={cHandXRight - 6} cy={cHandY} r="4" fill={color} />
            <Circle cx={cHandXRight + 6} cy={cHandY} r="4" fill={color} />
          </>
        )}

        {/* Tricep Pushdown Handle */}
        {activeEx === 'tricep_pushdown' && (
          <Line
            x1={cHandXLeft - 6}
            y1={cHandY}
            x2={cHandXRight + 6}
            y2={cHandY}
            stroke="#e4e4e7"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
