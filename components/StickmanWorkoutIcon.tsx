import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Rect, Ellipse } from 'react-native-svg';

export type ExerciseIconId =
  | 'bench_press'
  | 'squats'
  | 'deadlift'
  | 'overhead_press'
  | 'barbell_row'
  | 'incline_dumbbell_press'
  | 'bicep_curls'
  | 'tricep_pushdown'
  | 'leg_press'
  | 'pull_ups'
  | 'lateral_raises'
  | 'romanian_deadlift'
  | 'steps'
  | 'distance'
  | 'history'
  | string;

interface StickmanIconProps {
  exerciseId: ExerciseIconId;
  color?: string;
  size?: number;
  opacity?: number;
}

/**
 * Detailed Stick Figure Icons performing specific exercises
 * Scaled neatly inside 24x24 or custom size SVG viewports
 */
export const StickmanWorkoutIcon: React.FC<StickmanIconProps> = ({
  exerciseId,
  color = '#10b981',
  size = 20,
  opacity = 1,
}) => {
  const strokeW = 1.8;
  const headR = 2.2;

  const renderIconContent = () => {
    switch (exerciseId) {
      case 'squats':
        // Stickman deep squatting with barbell on back - realistic biomechanics & quad oval highlights
        return (
          <>
            {/* Barbell across upper traps */}
            <Line x1="2" y1="8.5" x2="22" y2="8.5" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Rect x="2.5" y="6" width="2" height="5" rx="0.5" fill={color} />
            <Rect x="19.5" y="6" width="2" height="5" rx="0.5" fill={color} />
            {/* Head - Anatomical oval */}
            <Ellipse cx="12" cy="5.5" rx="2.2" ry="2.6" fill={color} />
            {/* Torso with slight forward squat lean */}
            <Line x1="12" y1="7.5" x2="12" y2="13.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Arms holding barbell */}
            <Line x1="12" y1="8.5" x2="6.5" y2="8.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="8.5" x2="17.5" y2="8.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Quad muscle highlight ovals on femurs */}
            <Ellipse cx="9.2" cy="15.2" rx="2" ry="1.2" fill={color} opacity={0.65} />
            <Ellipse cx="14.8" cy="15.2" rx="2" ry="1.2" fill={color} opacity={0.65} />
            {/* Deep squat legs: Hips back, knees out */}
            <Line x1="12" y1="13.5" x2="7" y2="15.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="7" y1="15.5" x2="6" y2="21.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="13.5" x2="17" y2="15.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="17" y1="15.5" x2="18" y2="21.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'bench_press':
        // Stickman lying on flat bench pressing barbell upwards with chest muscle highlight
        return (
          <>
            {/* Flat Bench */}
            <Line x1="3" y1="18" x2="21" y2="18" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Line x1="6" y1="18" x2="6" y2="22" stroke="#71717a" strokeWidth="1.4" strokeLinecap="round" />
            <Line x1="18" y1="18" x2="18" y2="22" stroke="#71717a" strokeWidth="1.4" strokeLinecap="round" />
            {/* Lying Torso */}
            <Line x1="6" y1="16" x2="15" y2="16" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Chest muscle oval */}
            <Ellipse cx="10.5" cy="15" rx="2.5" ry="1.4" fill={color} opacity={0.7} />
            {/* Head on bench */}
            <Ellipse cx="4.5" cy="15.5" rx="2.2" ry="2.5" fill={color} />
            {/* Legs planted off bench */}
            <Line x1="15" y1="16" x2="18" y2="17.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="18" y1="17.5" x2="19" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Barbell Pressed High */}
            <Line x1="5" y1="6.5" x2="19" y2="6.5" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Rect x="6" y="4" width="1.6" height="5" rx="0.4" fill={color} />
            <Rect x="16.4" y="4" width="1.6" height="5" rx="0.4" fill={color} />
            {/* Arms reaching up to barbell */}
            <Line x1="9.5" y1="15.5" x2="8.5" y2="6.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="15.5" x2="13" y2="6.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'deadlift':
      case 'romanian_deadlift':
        // Stickman hinged at hips grabbing barbell off floor - athletic back & hamstrings
        return (
          <>
            {/* Barbell on floor with bumper plates */}
            <Line x1="2" y1="20" x2="22" y2="20" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Ellipse cx="4" cy="20" rx="2.2" ry="2.6" fill={color} />
            <Ellipse cx="20" cy="20" rx="2.2" ry="2.6" fill={color} />
            {/* Head looking forward */}
            <Ellipse cx="7.5" cy="7" rx="2.2" ry="2.5" fill={color} />
            {/* Flat Hinged Spine */}
            <Line x1="8.5" y1="8.5" x2="15.5" y2="12.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Lat / Back oval muscle contour */}
            <Ellipse cx="11.5" cy="10" rx="2.4" ry="1.2" fill={color} opacity={0.65} />
            {/* Arms hanging straight down locking onto bar */}
            <Line x1="10" y1="9.5" x2="11.5" y2="19" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Hamstrings / Glute hinge legs */}
            <Line x1="15.5" y1="12.5" x2="15.5" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="15.5" y1="12.5" x2="18" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'overhead_press':
        // Stickman standing tall with bar locked out directly overhead, shoulder deltoid ovals
        return (
          <>
            {/* Barbell overhead */}
            <Line x1="2" y1="3" x2="22" y2="3" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Rect x="3" y="1" width="2" height="4" rx="0.5" fill={color} />
            <Rect x="19" y="1" width="2" height="4" rx="0.5" fill={color} />
            {/* Arms locked overhead */}
            <Line x1="9" y1="9.5" x2="6.5" y2="3.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="15" y1="9.5" x2="17.5" y2="3.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Shoulder deltoids ovals */}
            <Ellipse cx="8.5" cy="9.5" rx="1.8" ry="1.2" fill={color} opacity={0.7} />
            <Ellipse cx="15.5" cy="9.5" rx="1.8" ry="1.2" fill={color} opacity={0.7} />
            {/* Head */}
            <Ellipse cx="12" cy="7" rx="2.2" ry="2.6" fill={color} />
            {/* Torso standing strong */}
            <Line x1="12" y1="9" x2="12" y2="15" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Straight Legs */}
            <Line x1="12" y1="15" x2="9" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="15" x2="15" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'barbell_row':
        // Bent over row pulling bar toward belly with back lat wing
        return (
          <>
            {/* Head */}
            <Ellipse cx="6" cy="10" rx="2.2" ry="2.5" fill={color} />
            {/* Flat Back Hinge */}
            <Line x1="7.5" y1="11.5" x2="15" y2="13" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Back lat muscle contour */}
            <Ellipse cx="11.5" cy="11.5" rx="2.6" ry="1.3" fill={color} opacity={0.7} />
            {/* Elbows pulled back high rowing bar */}
            <Line x1="9.5" y1="12" x2="11.5" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="11.5" y1="8" x2="12.5" y2="13.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Barbell pulled into waist */}
            <Line x1="4" y1="14" x2="20" y2="14" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Rect x="5" y="11.5" width="2" height="5" rx="0.5" fill={color} />
            <Rect x="17" y="11.5" width="2" height="5" rx="0.5" fill={color} />
            {/* Knees bent */}
            <Line x1="15" y1="13" x2="16" y2="17" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="16" y1="17" x2="17.5" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'incline_dumbbell_press':
        // Inclined torso pressing dumbbells up and away with upper chest highlight
        return (
          <>
            {/* Incline Bench Pad */}
            <Line x1="6" y1="20" x2="16" y2="10" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            {/* Head */}
            <Ellipse cx="16" cy="8" rx="2.2" ry="2.5" fill={color} />
            {/* Torso on angle */}
            <Line x1="14.5" y1="10" x2="8.5" y2="17.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Upper chest oval */}
            <Ellipse cx="12" cy="12.5" rx="1.8" ry="1.2" fill={color} opacity={0.7} />
            {/* Arms pressing up-forward */}
            <Line x1="13" y1="11.5" x2="19" y2="6" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Dumbbells at hands */}
            <Rect x="18" y="3" width="4" height="2" rx="0.5" fill={color} />
            <Rect x="18" y="7" width="4" height="2" rx="0.5" fill={color} />
            {/* Leg grounded */}
            <Line x1="8.5" y1="17.5" x2="11" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'bicep_curls':
        // Stickman standing with elbows tucked and curled bicep ovals
        return (
          <>
            {/* Head */}
            <Ellipse cx="12" cy="5" rx="2.2" ry="2.6" fill={color} />
            {/* Torso */}
            <Line x1="12" y1="7" x2="12" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Bicep muscle peak ovals */}
            <Ellipse cx="8.5" cy="10" rx="1.3" ry="2" fill={color} opacity={0.8} />
            <Ellipse cx="15.5" cy="10" rx="1.3" ry="2" fill={color} opacity={0.8} />
            {/* Upper arm straight down, forearm curled up 90-deg */}
            <Line x1="11" y1="8" x2="9" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="9" y1="12" x2="8" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="13" y1="8" x2="15" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="15" y1="12" x2="16" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Dumbbells in hand */}
            <Ellipse cx="8" cy="7.5" rx="1.5" ry="1.2" fill={color} />
            <Ellipse cx="16" cy="7.5" rx="1.5" ry="1.2" fill={color} />
            {/* Standing Legs */}
            <Line x1="12" y1="14" x2="9.5" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="14" x2="14.5" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'tricep_pushdown':
        // Cable tower bar pushed downwards by stickman with tricep lateral head oval
        return (
          <>
            {/* Cable rope from top */}
            <Line x1="16" y1="2" x2="16" y2="8" stroke="#71717a" strokeWidth="1.2" strokeLinecap="round" />
            {/* Head */}
            <Ellipse cx="10" cy="6" rx="2.2" ry="2.6" fill={color} />
            {/* Slight forward lean torso */}
            <Line x1="10.5" y1="8" x2="11.5" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Tricep muscle highlight oval */}
            <Ellipse cx="12.2" cy="10" rx="1.2" ry="1.8" fill={color} opacity={0.8} />
            {/* Arms extending downwards */}
            <Line x1="11" y1="9" x2="13.5" y2="11" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="13.5" y1="11" x2="16" y2="15" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Pushdown handle */}
            <Line x1="14.5" y1="15" x2="18.5" y2="15" stroke="#71717a" strokeWidth="1.8" strokeLinecap="round" />
            {/* Legs */}
            <Line x1="11.5" y1="14" x2="9" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="11.5" y1="14" x2="13.5" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'leg_press':
        // Stickman seated back pressing platform upwards on angled sled with quad oval
        return (
          <>
            {/* Incline sled track */}
            <Line x1="5" y1="20" x2="19" y2="6" stroke="#71717a" strokeWidth="1.4" strokeLinecap="round" />
            {/* Seated torso */}
            <Line x1="6" y1="18" x2="10" y2="19" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="5" cy="16" rx="2.2" ry="2.5" fill={color} />
            {/* Quad muscle oval on thigh */}
            <Ellipse cx="11.2" cy="15.8" rx="1.4" ry="2.2" fill={color} opacity={0.7} />
            {/* Knees bent up driving footplate */}
            <Line x1="10" y1="19" x2="12" y2="13" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="13" x2="16" y2="9" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Foot plate on sled */}
            <Rect x="15" y="7" width="4" height="4" rx="0.5" fill={color} />
          </>
        );

      case 'pull_ups':
        // Stickman hanging from pullup bar, chin over bar with lat wings
        return (
          <>
            {/* Overhead pullup bar */}
            <Line x1="2" y1="4" x2="22" y2="4" stroke="#71717a" strokeWidth="1.8" strokeLinecap="round" />
            {/* Arms pulling up to bar */}
            <Line x1="7" y1="4" x2="9.5" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="17" y1="4" x2="14.5" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Lat wing ovals */}
            <Ellipse cx="10" cy="10" rx="1.4" ry="2.4" fill={color} opacity={0.75} />
            <Ellipse cx="14" cy="10" rx="1.4" ry="2.4" fill={color} opacity={0.75} />
            {/* Head above shoulders */}
            <Ellipse cx="12" cy="4.5" rx="2.2" ry="2.6" fill={color} />
            {/* Torso hanging */}
            <Line x1="12" y1="8" x2="12" y2="15" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Knees bent backwards */}
            <Line x1="12" y1="15" x2="14" y2="18" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="14" y1="18" x2="13" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'lateral_raises':
        // Stickman standing with arms flared out wide horizontally
        return (
          <>
            {/* Head */}
            <Circle cx="12" cy="5" r={headR} fill={color} />
            {/* Torso */}
            <Line x1="12" y1="7" x2="12" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Flared Lateral Arms */}
            <Line x1="12" y1="8.5" x2="4" y2="9.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="8.5" x2="20" y2="9.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Dumbbells in hands */}
            <Circle cx="3.5" cy="9.5" r="1.5" fill={color} />
            <Circle cx="20.5" cy="9.5" r="1.5" fill={color} />
            {/* Standing Legs */}
            <Line x1="12" y1="14" x2="9" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="14" x2="15" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'steps':
        // Stickman running/striding forward
        return (
          <>
            <Circle cx="13" cy="5" r={headR} fill={color} />
            <Line x1="13" y1="7" x2="11.5" y2="13" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Pumping arms */}
            <Line x1="12.5" y1="9" x2="8" y2="11" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12.5" y1="9" x2="16.5" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Striding legs */}
            <Line x1="11.5" y1="13" x2="6" y2="18" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="6" y1="18" x2="4.5" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="11.5" y1="13" x2="16.5" y2="16" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="16.5" y1="16" x2="19" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'distance':
        // Stickman running fast with GPS compass track
        return (
          <>
            <Circle cx="14" cy="5.5" r={headR} fill={color} />
            <Line x1="14" y1="7.5" x2="11" y2="12.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="9" x2="7" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="9" x2="17" y2="11" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="11" y1="12.5" x2="5" y2="17" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="5" y1="17" x2="4" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="11" y1="12.5" x2="16" y2="17" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="16" y1="17" x2="19.5" y2="20" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'history':
        // Stickman with clock / path indicator
        return (
          <>
            <Circle cx="10" cy="5.5" r={headR} fill={color} />
            <Line x1="10" y1="7.5" x2="10" y2="13.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="10" y1="9" x2="7" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="10" y1="9" x2="13" y2="11" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="10" y1="13.5" x2="8" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="10" y1="13.5" x2="12" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Clock outline in background/right */}
            <Circle cx="17.5" cy="11.5" r="4.5" stroke="#71717a" strokeWidth="1.2" fill="none" />
            <Line x1="17.5" y1="11.5" x2="17.5" y2="9" stroke="#71717a" strokeWidth="1.1" strokeLinecap="round" />
            <Line x1="17.5" y1="11.5" x2="19.5" y2="11.5" stroke="#71717a" strokeWidth="1.1" strokeLinecap="round" />
          </>
        );

      case 'pushups':
        // Stickman in horizontal plank on ground pressing up with chest/triceps ovals
        return (
          <>
            {/* Ground line */}
            <Line x1="2" y1="21" x2="22" y2="21" stroke="#71717a" strokeWidth="1.2" strokeLinecap="round" />
            {/* Head oval */}
            <Ellipse cx="5" cy="14" rx="2.5" ry="2.2" fill={color} />
            {/* Plank Torso */}
            <Line x1="6.5" y1="15" x2="16" y2="17" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Chest muscle oval in pushup */}
            <Ellipse cx="8.5" cy="16.5" rx="1.8" ry="1.2" fill={color} opacity={0.7} />
            {/* Arms planted down to floor */}
            <Line x1="8.5" y1="15.5" x2="8.5" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Legs extended back to toes with quad oval */}
            <Ellipse cx="17.5" cy="18.2" rx="2.2" ry="1.1" fill={color} opacity={0.65} />
            <Line x1="16" y1="17" x2="21" y2="20" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'dips_chest':
        // Stickman suspended on parallel dip bars with chest and tricep ovals
        return (
          <>
            {/* Parallel dip bars */}
            <Line x1="3" y1="14" x2="21" y2="14" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            {/* Head */}
            <Ellipse cx="12" cy="5" rx="2.2" ry="2.6" fill={color} />
            {/* Chest forward lean oval */}
            <Ellipse cx="11.5" cy="10" rx="2.2" ry="1.6" fill={color} opacity={0.7} />
            {/* Torso leaning forward */}
            <Line x1="12" y1="7" x2="13" y2="15" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Arms bent holding bars with tricep ovals */}
            <Ellipse cx="8.8" cy="10.5" rx="1.3" ry="1.8" fill={color} opacity={0.75} />
            <Ellipse cx="15.2" cy="10.5" rx="1.3" ry="1.8" fill={color} opacity={0.75} />
            <Line x1="12" y1="8.5" x2="7" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="8.5" x2="17" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Legs bent backward */}
            <Line x1="13" y1="15" x2="16" y2="19" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="16" y1="19" x2="15" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'dumbbell_flyes':
        // Lying on flat bench with arms opened wide in fly arc with chest ovals
        return (
          <>
            {/* Bench */}
            <Line x1="4" y1="18" x2="20" y2="18" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Line x1="7" y1="18" x2="7" y2="22" stroke="#71717a" strokeWidth="1.2" />
            <Line x1="17" y1="18" x2="17" y2="22" stroke="#71717a" strokeWidth="1.2" />
            {/* Torso lying down */}
            <Line x1="6.5" y1="16" x2="15" y2="16" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="10.5" cy="15" rx="2.6" ry="1.4" fill={color} opacity={0.75} />
            <Ellipse cx="4.5" cy="15.5" rx="2.2" ry="2.5" fill={color} />
            {/* Arms wide arched outward */}
            <Line x1="11" y1="16" x2="5" y2="10" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="11" y1="16" x2="17" y2="10" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Dumbbells in hands */}
            <Ellipse cx="4.5" cy="9.5" rx="1.6" ry="1.3" fill={color} />
            <Ellipse cx="17.5" cy="9.5" rx="1.6" ry="1.3" fill={color} />
          </>
        );

      case 'cable_crossover':
        // Stickman standing leaning forward bringing dual cables together with chest ovals
        return (
          <>
            {/* Cable wires from top corners */}
            <Line x1="2" y1="2" x2="10" y2="12" stroke="#71717a" strokeWidth="1.2" />
            <Line x1="22" y1="2" x2="14" y2="12" stroke="#71717a" strokeWidth="1.2" />
            {/* Head */}
            <Ellipse cx="12" cy="5" rx="2.2" ry="2.6" fill={color} />
            {/* Pectoral squeeze oval */}
            <Ellipse cx="11.8" cy="10" rx="2.2" ry="1.5" fill={color} opacity={0.75} />
            {/* Forward lean torso */}
            <Line x1="12" y1="7" x2="11.5" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Hugging arms meeting in front */}
            <Line x1="12" y1="9" x2="10" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="9" x2="14" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Split stance legs */}
            <Line x1="11.5" y1="14" x2="7.5" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="11.5" y1="14" x2="15" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'lat_pulldown':
        // Stickman seated pulling wide angled bar down to collarbone with lat wings
        return (
          <>
            {/* Cable pulldown bar */}
            <Line x1="3" y1="8" x2="21" y2="8" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            {/* Seated bench / thigh pad */}
            <Line x1="8" y1="18" x2="16" y2="18" stroke="#71717a" strokeWidth="1.4" strokeLinecap="round" />
            <Line x1="12" y1="18" x2="12" y2="22" stroke="#71717a" strokeWidth="1.2" />
            {/* Lat muscle ovals flaring */}
            <Ellipse cx="9.5" cy="12.5" rx="1.6" ry="2.4" fill={color} opacity={0.75} />
            <Ellipse cx="14.5" cy="12.5" rx="1.6" ry="2.4" fill={color} opacity={0.75} />
            {/* Head */}
            <Ellipse cx="12" cy="7.5" rx="2.2" ry="2.6" fill={color} />
            {/* Seated torso */}
            <Line x1="12" y1="9.5" x2="12" y2="17" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Arms reaching up & out to wide bar ends */}
            <Line x1="12" y1="10" x2="6" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="10" x2="18" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Knees tucked forward */}
            <Line x1="12" y1="17" x2="15" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'seated_cable_row':
      case 't_bar_row':
        // Stickman seated/bent rowing handle into midsection with lat back oval
        return (
          <>
            {/* Foot pegs & cable wire */}
            <Line x1="19" y1="16" x2="19" y2="21" stroke="#71717a" strokeWidth="1.4" strokeLinecap="round" />
            <Line x1="13" y1="13" x2="19" y2="17" stroke="#71717a" strokeWidth="1.2" strokeLinecap="round" />
            {/* Head */}
            <Ellipse cx="7" cy="8" rx="2.2" ry="2.5" fill={color} />
            {/* Back lat muscle contour oval */}
            <Ellipse cx="9.8" cy="13.5" rx="2" ry="2.6" fill={color} opacity={0.7} />
            {/* Torso upright / slight angle */}
            <Line x1="7.5" y1="10" x2="9" y2="18" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Arms pulling cable handle into ribs */}
            <Line x1="8" y1="11" x2="13" y2="13" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Legs extended forward to pegs */}
            <Line x1="9" y1="18" x2="18" y2="18" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'lunges':
        // Deep forward walking lunge with 90° front and back knees with quad oval
        return (
          <>
            {/* Head */}
            <Ellipse cx="12" cy="5" rx="2.2" ry="2.6" fill={color} />
            {/* Upright Torso */}
            <Line x1="12" y1="7" x2="12" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Arms holding DBs at sides */}
            <Line x1="11" y1="8.5" x2="10" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="10" cy="14.5" rx="1.4" ry="1.2" fill={color} />
            {/* Front Thigh quad oval */}
            <Ellipse cx="14.8" cy="15.2" rx="2" ry="1.2" fill={color} opacity={0.7} />
            {/* Front Leg bent at 90° */}
            <Line x1="12" y1="14" x2="17" y2="16" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="17" y1="16" x2="17" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Back Leg trailing down */}
            <Line x1="12" y1="14" x2="7" y2="18" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="7" y1="18" x2="6" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'leg_extensions':
        // Seated on machine kicking lower legs straight forward with quad contraction oval
        return (
          <>
            {/* Machine seat pad */}
            <Line x1="6" y1="15" x2="14" y2="15" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Line x1="6" y1="8" x2="6" y2="15" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            {/* Head */}
            <Ellipse cx="9" cy="6" rx="2.2" ry="2.5" fill={color} />
            {/* Quad contraction muscle oval */}
            <Ellipse cx="13.5" cy="14.2" rx="2.6" ry="1.3" fill={color} opacity={0.8} />
            {/* Seated upright torso */}
            <Line x1="8.5" y1="8" x2="9" y2="15" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Extended Leg straight out holding roller */}
            <Line x1="9" y1="15" x2="18" y2="15" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="18" cy="15" rx="2" ry="1.6" fill={color} />
          </>
        );

      case 'hamstring_curls':
        // Lying face down curling leg pad up towards glutes with hamstring oval
        return (
          <>
            {/* Bench */}
            <Line x1="3" y1="17" x2="15" y2="17" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            {/* Head face down */}
            <Ellipse cx="4" cy="14.5" rx="2.4" ry="2.1" fill={color} />
            {/* Hamstring contraction oval */}
            <Ellipse cx="15.5" cy="12.5" rx="1.3" ry="2.4" fill={color} opacity={0.8} />
            {/* Prone Torso */}
            <Line x1="5.5" y1="15.5" x2="13" y2="15.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Curled lower leg vertical with roller */}
            <Line x1="13" y1="15.5" x2="16" y2="16" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="16" y1="16" x2="15" y2="9" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="15" cy="8.5" rx="2" ry="1.6" fill={color} />
          </>
        );

      case 'calf_raises':
        // Standing tall on tiptoes on calf block with sculpted calf ovals
        return (
          <>
            {/* Step block under toes */}
            <Rect x="5" y="21" width="14" height="2" fill="#71717a" />
            {/* Head */}
            <Ellipse cx="12" cy="4" rx="2.2" ry="2.6" fill={color} />
            {/* Torso tall */}
            <Line x1="12" y1="6" x2="12" y2="13" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Calf muscle ovals */}
            <Ellipse cx="9.2" cy="16.5" rx="1.3" ry="2.4" fill={color} opacity={0.8} />
            <Ellipse cx="14.8" cy="16.5" rx="1.3" ry="2.4" fill={color} opacity={0.8} />
            {/* Legs elevated high on balls of feet */}
            <Line x1="12" y1="13" x2="10" y2="20" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="13" x2="14" y2="20" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Angled feet on tiptoes */}
            <Line x1="10" y1="20" x2="11" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="14" y1="20" x2="15" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'front_raises':
        // Stickman raising dumbbells straight in front to shoulder height with anterior delt oval
        return (
          <>
            <Ellipse cx="9" cy="5" rx="2.2" ry="2.5" fill={color} />
            <Line x1="9" y1="7" x2="9" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Front delt oval */}
            <Ellipse cx="10.5" cy="8.5" rx="1.8" ry="1.2" fill={color} opacity={0.8} />
            {/* Arm raised straight forward at 90° */}
            <Line x1="9" y1="8.5" x2="19" y2="8.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="19.5" cy="8.5" rx="1.6" ry="1.3" fill={color} />
            {/* Legs */}
            <Line x1="9" y1="14" x2="7.5" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="9" y1="14" x2="11" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'rear_delt_flyes':
        // Bent over 90° raising arms wide back with posterior delt ovals
        return (
          <>
            <Ellipse cx="6" cy="11" rx="2.2" ry="2.5" fill={color} />
            {/* Rear delts ovals */}
            <Ellipse cx="11.2" cy="8.5" rx="1.5" ry="2.2" fill={color} opacity={0.8} />
            {/* Horizontal torso */}
            <Line x1="7.5" y1="12" x2="15" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Arms flying back wide */}
            <Line x1="11" y1="12" x2="10" y2="5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="10" cy="4.5" rx="1.5" ry="1.2" fill={color} />
            <Line x1="11" y1="12" x2="18" y2="6" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="18" cy="5.5" rx="1.5" ry="1.2" fill={color} />
            {/* Bent knees */}
            <Line x1="15" y1="12" x2="16" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'arnold_press':
        // Seated overhead dumbbell rotation press with 3D delt ovals
        return (
          <>
            {/* Seated bench */}
            <Line x1="7" y1="18" x2="17" y2="18" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Ellipse cx="12" cy="6" rx="2.2" ry="2.6" fill={color} />
            {/* Shoulder deltoids ovals */}
            <Ellipse cx="9.2" cy="8.8" rx="1.8" ry="1.2" fill={color} opacity={0.75} />
            <Ellipse cx="14.8" cy="8.8" rx="1.8" ry="1.2" fill={color} opacity={0.75} />
            <Line x1="12" y1="8" x2="12" y2="17" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Arms pressing DBs diagonally overhead */}
            <Line x1="12" y1="9" x2="5" y2="4" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="9" x2="19" y2="4" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="4.5" cy="3.5" rx="1.6" ry="1.3" fill={color} />
            <Ellipse cx="19.5" cy="3.5" rx="1.6" ry="1.3" fill={color} />
            {/* Seated legs */}
            <Line x1="12" y1="17" x2="16" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'hammer_curls':
        // Neutral wrist grip bicep curl with vertical dumbbells and brachialis ovals
        return (
          <>
            <Ellipse cx="12" cy="5" rx="2.2" ry="2.6" fill={color} />
            <Line x1="12" y1="7" x2="12" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Forearm / brachialis ovals */}
            <Ellipse cx="8.2" cy="10" rx="1.3" ry="2.2" fill={color} opacity={0.8} />
            <Ellipse cx="15.8" cy="10" rx="1.3" ry="2.2" fill={color} opacity={0.8} />
            {/* Forearm curled up at angle */}
            <Line x1="11" y1="8.5" x2="9" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="9" y1="12" x2="7.5" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Rect x="6.5" y="6" width="2" height="4" rx="0.5" fill={color} />
            {/* Right arm */}
            <Line x1="13" y1="8.5" x2="15" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="15" y1="12" x2="16.5" y2="8" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Rect x="15.5" y="6" width="2" height="4" rx="0.5" fill={color} />
            {/* Legs */}
            <Line x1="12" y1="14" x2="9.5" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="14" x2="14.5" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'skull_crushers':
        // Lying on bench with elbows pointing up and tricep ovals
        return (
          <>
            {/* Flat bench */}
            <Line x1="4" y1="18" x2="20" y2="18" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Ellipse cx="4.5" cy="15.5" rx="2.2" ry="2.5" fill={color} />
            <Line x1="7" y1="16" x2="15" y2="16" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Tricep long head oval */}
            <Ellipse cx="11" cy="12.5" rx="1.3" ry="2.2" fill={color} opacity={0.8} />
            {/* Vertical upper arm, forearm bent back toward head */}
            <Line x1="11" y1="16" x2="11" y2="10" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="11" y1="10" x2="6" y2="10" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="5.5" cy="10" rx="2" ry="1.6" fill={color} />
          </>
        );

      case 'preacher_curls':
        // Seated on angled preacher pad curling bar with peaked bicep oval
        return (
          <>
            {/* Preacher pad slant */}
            <Line x1="8" y1="18" x2="16" y2="10" stroke="#71717a" strokeWidth="2.5" strokeLinecap="round" />
            <Ellipse cx="9" cy="6" rx="2.2" ry="2.5" fill={color} />
            <Line x1="8.5" y1="8" x2="7" y2="16" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Peaked bicep oval on preacher pad */}
            <Ellipse cx="11.5" cy="10.5" rx="1.5" ry="2.2" fill={color} opacity={0.85} />
            {/* Arms resting on pad curling up */}
            <Line x1="8" y1="10" x2="13" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="13" y1="12" x2="14" y2="7" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Ellipse cx="14" cy="6.5" rx="2" ry="1.6" fill={color} />
          </>
        );

      case 'plank':
      case 'side_plank':
        // Straight isometric plank with glowing core ovals
        return (
          <>
            <Line x1="2" y1="20" x2="22" y2="20" stroke="#71717a" strokeWidth="1.2" strokeLinecap="round" />
            <Ellipse cx="5" cy="14" rx="2.2" ry="2.5" fill={color} />
            {/* Rigid horizontal torso */}
            <Line x1="7" y1="15" x2="16" y2="15.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Core highlight oval */}
            <Ellipse cx="11.5" cy="15.5" rx="2.5" ry="1.2" fill={color} opacity={0.9} />
            {/* Forearm on floor */}
            <Line x1="9" y1="15" x2="9" y2="19.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="9" y1="19.5" x2="6.5" y2="19.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Legs straight back onto toes */}
            <Line x1="16" y1="15.5" x2="21" y2="19" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'hanging_leg_raises':
      case 'hanging_knee_tucks':
        // Hanging from bar with legs flexed horizontally
        return (
          <>
            <Line x1="3" y1="3" x2="21" y2="3" stroke="#71717a" strokeWidth="1.6" strokeLinecap="round" />
            <Ellipse cx="12" cy="5.5" rx="2" ry="2.3" fill={color} />
            <Line x1="9.5" y1="3" x2="11.5" y2="7.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="14.5" y1="3" x2="12.5" y2="7.5" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="7.5" x2="12" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Core oval */}
            <Ellipse cx="12" cy="11.5" rx="1.6" ry="2.2" fill={color} opacity={0.85} />
            {/* Legs raised 90 degrees */}
            <Line x1="12" y1="14" x2="18" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="18" y1="14" x2="21" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'cable_crunches':
      case 'bicycle_crunches':
      case 'russian_twists':
      case 'declined_situps':
      case 'ab_wheel_rollout':
      case 'dead_bug':
        // Floor crunch flex with glowing abdominal core ovals
        return (
          <>
            <Line x1="3" y1="21" x2="21" y2="21" stroke="#71717a" strokeWidth="1.2" strokeLinecap="round" />
            <Ellipse cx="7" cy="13" rx="2.2" ry="2.4" fill={color} />
            {/* Curled spine */}
            <Line x1="8.5" y1="14.5" x2="13" y2="18" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Core highlight oval */}
            <Ellipse cx="11" cy="16" rx="2.2" ry="1.6" fill={color} opacity={0.9} />
            {/* Hands behind head */}
            <Line x1="8" y1="14" x2="5.5" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Bent knees */}
            <Line x1="13" y1="18" x2="17" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="17" y1="14" x2="19" y2="20" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'jumping_jacks':
      case 'burpees':
      case 'mountain_climbers':
        // Dynamic explosive star jump / burpee position
        return (
          <>
            <Ellipse cx="12" cy="4.5" rx="2.2" ry="2.5" fill={color} />
            <Line x1="12" y1="7" x2="12" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Arms flared high */}
            <Line x1="12" y1="8.5" x2="5" y2="4" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="8.5" x2="19" y2="4" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Legs flared wide */}
            <Line x1="12" y1="14" x2="6" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="14" x2="18" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'jump_rope':
      case 'battle_ropes':
      case 'kettlebell_swings':
        // Athlete with rope/kettlebell in motion
        return (
          <>
            <Ellipse cx="12" cy="5" rx="2.2" ry="2.5" fill={color} />
            <Line x1="12" y1="7" x2="12" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="9" x2="7" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="9" x2="17" y2="12" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            {/* Rope arc */}
            <Line x1="7" y1="12" x2="5" y2="21" stroke="#71717a" strokeWidth="1" strokeLinecap="round" />
            <Line x1="17" y1="12" x2="19" y2="21" stroke="#71717a" strokeWidth="1" strokeLinecap="round" />
            <Line x1="12" y1="14" x2="10" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="14" x2="14" y2="21" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      case 'rowing_machine':
      case 'sled_push':
      case 'assault_bike':
      case 'stair_climber':
      case 'treadmill_incline_walk':
      case 'farmers_walk':
        // Cardio drive motion with machine track
        return (
          <>
            <Line x1="3" y1="18" x2="21" y2="18" stroke="#71717a" strokeWidth="1.4" strokeLinecap="round" />
            <Ellipse cx="7" cy="10" rx="2.2" ry="2.4" fill={color} />
            <Line x1="8" y1="11.5" x2="12" y2="17" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="9" y1="13" x2="17" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="17" x2="18" y2="17" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );

      default:
        // Default standard gym stickman with natural proportions & shoulder ovals
        return (
          <>
            <Ellipse cx="12" cy="5" rx="2.2" ry="2.6" fill={color} />
            <Ellipse cx="9.5" cy="8.5" rx="1.6" ry="1.1" fill={color} opacity={0.65} />
            <Ellipse cx="14.5" cy="8.5" rx="1.6" ry="1.1" fill={color} opacity={0.65} />
            <Line x1="12" y1="7" x2="12" y2="14" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="9" x2="6" y2="11" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="9" x2="18" y2="11" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="14" x2="8" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
            <Line x1="12" y1="14" x2="16" y2="22" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          </>
        );
    }
  };

  return (
    <View style={[styles.wrap, { width: size, height: size, opacity }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {renderIconContent()}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
