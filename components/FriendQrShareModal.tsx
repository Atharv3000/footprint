import { useScreenInsets } from '@/constants/useScreenInsets';
import { AppModal as Modal } from '@/components/AppModal';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import Svg, { Rect, Circle, Defs, Pattern } from 'react-native-svg';
import { BRAND_ROUNDED_FONT, BRAND_ROUNDED_FONT_EXTRA } from '@/constants/ThemeContext';
import { generateQrMatrix } from '@/constants/qrCodeEngine';

interface FriendQrShareModalProps {
  visible: boolean;
  onClose: () => void;
  username: string;
  displayName: string;
  avatarColor?: string;
  isDark: boolean;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Generate 4 randomized grain frames with high-density realistic micro-particles
const PARTICLE_COUNT_PER_FRAME = 340;
const generateStaticParticles = () => {
  return Array.from({ length: 4 }, (_, frameIdx) => {
    return Array.from({ length: PARTICLE_COUNT_PER_FRAME }, (_, i) => {
      // Deterministic pseudorandom spread covering full screen
      const s1 = Math.sin(frameIdx * 997 + i * 31.7) * 10000;
      const s2 = Math.cos(frameIdx * 823 + i * 47.3) * 10000;
      const s3 = Math.sin(frameIdx * 641 + i * 19.1) * 10000;
      const x = Math.abs(s1 - Math.floor(s1)) * SCREEN_W;
      const y = Math.abs(s2 - Math.floor(s2)) * SCREEN_H;
      const radius = 0.6 + Math.abs(s3 - Math.floor(s3)) * 1.5; // micro speckles 0.6 to 2.1px
      const opacity = 0.18 + (i % 5) * 0.16; // variable depth grain opacities
      const shade = (i % 3 === 0) ? '#e4e4e7' : (i % 3 === 1) ? '#ffffff' : '#a1a1aa';
      return { x, y, r: radius, opacity, fill: shade };
    });
  });
};

const STATIC_FRAMES = generateStaticParticles();

export function FriendQrShareModal({
  visible,
  onClose,
  username,
  displayName,
  avatarColor,
  isDark,
}: FriendQrShareModalProps) {
  const screenInsets = useScreenInsets();
  const safeStyles = React.useMemo(() => ({ ...styles,
    modalViewport: { ...styles.modalViewport, paddingTop: Math.max(12, screenInsets.top + 2), paddingLeft: screenInsets.left + 20, paddingRight: screenInsets.right + 20 },
  }), [screenInsets.top, screenInsets.left, screenInsets.right]);

  const cleanUsername = (username || 'user').toLowerCase().replace(/^@/, '');
  const shareUrl = Linking.createURL(`friend?user=${cleanUsername}`);

  // Animations
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const meltProgress = useRef(new Animated.Value(0)).current; // 0 = bright liquid white, 1 = transparent clear
  const colorPhase = useRef(new Animated.Value(0)).current; // 0 -> 1 -> 0 prismatic shimmer phase
  const sheenSweep = useRef(new Animated.Value(-1)).current; // diagonal Apple glass specular sweep
  const cardScale = useRef(new Animated.Value(0.88)).current;
  const cardSlideDown = useRef(new Animated.Value(-120)).current;
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);

  // Compute standard 2D QR matrix
  const matrix = useMemo(() => {
    return generateQrMatrix(`https://footprint.app/add/${cleanUsername}`);
  }, [cleanUsername]);

  useEffect(() => {
    if (visible) {
      meltProgress.setValue(0);
      cardSlideDown.setValue(-120);
      cardScale.setValue(0.88);
      sheenSweep.setValue(-1);
      colorPhase.setValue(0);

      // 1. Entrance: top-docked slide down with Apple Liquid Glass white flash + prismatic color phase
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(meltProgress, {
          toValue: 1,
          duration: 560,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.timing(sheenSweep, {
          toValue: 1,
          duration: 720,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.spring(cardSlideDown, {
          toValue: 0,
          friction: 8,
          tension: 78,
          useNativeDriver: true,
        }),
      ]).start();

      // Continuous subtle glass color-phase shimmer while open
      const phaseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(colorPhase, {
            toValue: 1,
            duration: 2600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(colorPhase, {
            toValue: 0,
            duration: 2600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      phaseLoop.start();

      // 2. High-speed 30 FPS particle static grain flicker
      let frame = 0;
      const interval = setInterval(() => {
        frame = (frame + 1) % 4;
        setActiveFrameIndex(frame);
      }, 40);

      return () => {
        clearInterval(interval);
        phaseLoop.stop();
      };
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(cardScale, { toValue: 0.88, duration: 180, useNativeDriver: true }),
        Animated.timing(meltProgress, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {});
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.92, duration: 180, useNativeDriver: true }),
      Animated.timing(cardSlideDown, { toValue: -30, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      onClose();
    });
  };

  const handleNativeShare = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await Share.share({
        message: `Add me on Footprint: ${shareUrl}`,
        url: shareUrl,
        title: `Add ${displayName || cleanUsername} on Footprint`,
      });
    } catch {
      // dismissed
    }
  };

  // QR code dimension directly integrated into the card
  const qrBoxSize = 200;
  const matrixDimension = matrix.length;
  const cellSize = qrBoxSize / matrixDimension;

  // Melting white flash + prismatic color phase interpolations
  const meltWhiteFlashOpacity = meltProgress.interpolate({
    inputRange: [0, 0.32, 0.68, 1],
    outputRange: [1, 0.72, 0.16, 0],
  });
  const prismFlashOpacity = meltProgress.interpolate({
    inputRange: [0, 0.25, 0.65, 1],
    outputRange: [0.9, 0.75, 0.28, 0.16],
  });
  const phaseAuraOpacity = colorPhase.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  });
  const sheenTranslateX = sheenSweep.interpolate({
    inputRange: [-1, 1],
    outputRange: [-280, 280],
  });
  const sheenOpacity = sheenSweep.interpolate({
    inputRange: [-1, -0.2, 0.4, 1],
    outputRange: [0, 0.65, 0.4, 0],
  });

  if (!visible) return null;

  const currentParticles = STATIC_FRAMES[activeFrameIndex];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} edgeToEdge>
      <View style={safeStyles.modalViewport}>
        {/* Backdrop Tint */}
        <Animated.View
          style={[
            styles.backdropLayer,
            {
              opacity: backdropOpacity,
              backgroundColor: isDark ? 'rgba(9, 9, 11, 0.82)' : 'rgba(15, 15, 18, 0.56)',
            },
          ]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />

          {/* Full Screen High-Density Real Static Particle Noise Field */}
          <View style={styles.particlesContainer} pointerEvents="none">
            <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
              {currentParticles.map((pt, i) => (
                <Circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={pt.r}
                  fill={isDark ? pt.fill : (pt.fill === '#ffffff' ? '#e2e8f0' : '#475569')}
                  opacity={pt.opacity}
                />
              ))}
            </Svg>
          </View>
        </Animated.View>

        {/* Top-Docked Apple Liquid Glass QR Card */}
        <Animated.View
          style={[
            styles.topQrCard,
            {
              backgroundColor: isDark ? 'rgba(22, 22, 28, 0.78)' : 'rgba(255, 255, 255, 0.84)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 255, 255, 0.95)',
              shadowColor: avatarColor || '#a855f7',
              transform: [{ scale: cardScale }, { translateY: cardSlideDown }],
            },
          ]}
        >
          {/* Prismatic Iridescent Color Gradient Layer */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: prismFlashOpacity }]} pointerEvents="none">
            <LinearGradient
              colors={['rgba(56, 189, 248, 0.55)', 'rgba(168, 85, 247, 0.55)', 'rgba(236, 72, 153, 0.5)', 'rgba(163, 230, 53, 0.45)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* Breathing Glass Color Phase Rim */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: phaseAuraOpacity }]} pointerEvents="none">
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.45)', 'rgba(99, 102, 241, 0.22)', 'rgba(56, 189, 248, 0.28)', 'rgba(255, 255, 255, 0.15)']}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* Diagonal Specular Glass Sheen Sweep */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -40,
              bottom: -40,
              width: 90,
              opacity: sheenOpacity,
              transform: [{ translateX: sheenTranslateX }, { rotate: '22deg' }],
            }}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255, 255, 255, 0.75)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* Top Inner Specular Glass Rim */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 14,
              right: 14,
              height: 1.5,
              borderRadius: 1,
              backgroundColor: 'rgba(255, 255, 255, 0.75)',
            }}
          />

          {/* Liquid Pure White Melt-in Flash Overlay */}
          <Animated.View
            style={[
              styles.meltFlashOverlay,
              {
                opacity: meltWhiteFlashOpacity,
                backgroundColor: '#ffffff',
              },
            ]}
            pointerEvents="none"
          />

          {/* Header Row: User Info on Left, Action Buttons on Top Right */}
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.cardTitle, { color: isDark ? '#fafafa' : '#09090b' }]} numberOfLines={1}>
                {displayName || cleanUsername}
              </Text>
              <Text style={[styles.handleText, { color: isDark ? '#a1a1aa' : '#71717a' }]}>
                @{cleanUsername}
              </Text>
            </View>

            {/* Top-Right Action Controls: Share button next to the X */}
            <View style={styles.topRightActions}>
              <TouchableOpacity
                style={[styles.actionIconBtn, { backgroundColor: isDark ? '#27272a' : '#f4f4f5' }]}
                onPress={handleNativeShare}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Share Friend Link"
              >
                <Ionicons name="share-outline" size={17} color={isDark ? '#fafafa' : '#09090b'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionIconBtn, { backgroundColor: isDark ? '#27272a' : '#f4f4f5' }]}
                onPress={handleClose}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={17} color={isDark ? '#fafafa' : '#09090b'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Direct QR Code - No Bezel, Directly Integrated into Card Surface */}
          <View style={styles.qrDirectWrapper}>
            <Svg width={qrBoxSize} height={qrBoxSize} viewBox={`0 0 ${qrBoxSize} ${qrBoxSize}`}>
              {matrix.map((row, r) =>
                row.map((active, c) => {
                  if (!active) return null;
                  return (
                    <Rect
                      key={`${r}-${c}`}
                      x={c * cellSize + 0.3}
                      y={r * cellSize + 0.3}
                      width={cellSize - 0.6}
                      height={cellSize - 0.6}
                      rx={cellSize * 0.22}
                      ry={cellSize * 0.22}
                      fill={isDark ? '#fafafa' : '#09090b'}
                    />
                  );
                })
              )}
            </Svg>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Re-export alias for compatibility
export const FriendBarcodeShareModal = FriendQrShareModal;

const styles = StyleSheet.create({
  modalViewport: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 76 : 56,
    paddingHorizontal: 20,
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  particlesContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  topQrCard: {
    width: '100%',
    maxWidth: 260,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  meltFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    zIndex: 20,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  handleText: {
    fontFamily: BRAND_ROUNDED_FONT,
    fontSize: 12,
    marginTop: 1,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrDirectWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});

