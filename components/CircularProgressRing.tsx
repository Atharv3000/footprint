import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface CircularProgressProps {
  size?: number;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  progressPercent: number; // 0 to 100
  activeColor: string;
  gradientToColor?: string; // Gradient end color towards the next tier
  trackColor: string;
  children?: React.ReactNode;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * High-precision Circular Progress Ring powered by react-native-svg.
 * Accurately renders strokeDashoffset mathematically proportional to progressPercent (0-100%).
 * Supports smooth linear gradient transition from current tier color to next tier color.
 */
export const CircularProgressRing: React.FC<CircularProgressProps> = ({
  size = 64,
  strokeWidth = 6,
  strokeLinecap = 'butt',
  progressPercent,
  activeColor,
  gradientToColor,
  trackColor,
  children,
}) => {
  const animatedProgress = useRef(new Animated.Value(progressPercent)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: Math.min(100, Math.max(0, progressPercent)),
      duration: 650,
      useNativeDriver: false,
    }).start();
  }, [progressPercent]);

  const clamped = Math.min(100, Math.max(0, progressPercent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const innerSize = size - strokeWidth * 2;

  // Unique gradient ID per component instance
  const gradientId = useRef(`ringGrad_${Math.random().toString(36).substring(2, 9)}`).current;
  const endColor = gradientToColor || activeColor;

  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradientId} x1="50%" y1="0%" x2="50%" y2="100%">
            <Stop offset="0%" stopColor={activeColor} stopOpacity="1" />
            <Stop offset="100%" stopColor={endColor} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* Background track circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Active progress arc, rotated -90deg so it starts at the top 12 o'clock */}
        {clamped > 0 && (
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap={strokeLinecap}
            fill="none"
            transform={`rotate(-90, ${center}, ${center})`}
          />
        )}
      </Svg>

      {/* Center content slot */}
      {children && (
        <View
          style={[
            styles.centerContent,
            {
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
            },
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
