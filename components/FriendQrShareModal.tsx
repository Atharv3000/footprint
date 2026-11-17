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
    modalViewport: { ...styles.modalViewport, paddingTop: screenInsets.top + 16 , paddingLeft: screenInsets.left + 20, paddingRight: screenInsets.right + 20 },
  }), [screenInsets.top, screenInsets.left, screenInsets.right]);

  const cleanUsername = (username || 'user').toLowerCase().replace(/^@/, '');
  const shareUrl = Linking.createURL(`friend?user=${cleanUsername}`);

  const isClosingRef = useRef(false);

  // Animations
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const meltProgress = useRef(new Animated.Value(0)).current; // 0 = bright liquid white, 1 = transparent clear
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardSlideDown = useRef(new Animated.Value(-40)).current;
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);

  // Compute standard 2D QR matrix
  const matrix = useMemo(() => {
    return generateQrMatrix(`https://footprint.app/add/${cleanUsername}`);
  }, [cleanUsername]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      // 1. Entrance: top-docked slide down with pure white liquid melting in
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(meltProgress, {
          toValue: 1,
          duration: 480,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          friction: 8,
          tension: 75,
          useNativeDriver: true,
        }),
        Animated.spring(cardSlideDown, {
          toValue: 0,
          friction: 8,
          tension: 75,
          useNativeDriver: true,
        }),
      ]).start();

      // 2. High-speed 30 FPS particle static grain flicker
      let frame = 0;
      const interval = setInterval(() => {
        frame = (frame + 1) % 4;
        setActiveFrameIndex(frame);
      }, 40);

      return () => {
        clearInterval(interval);
      };
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(cardScale, { toValue: 0.92, duration: 180, useNativeDriver: true }),
        Animated.timing(meltProgress, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Haptics.selectionAsync().catch(() => {});
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.92, duration: 180, useNativeDriver: true }),
      Animated.timing(cardSlideDown, { toValue: -30, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      isClosingRef.current = false;
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

  // Melting white flash overlay interpolation
  const meltWhiteFlashOpacity = meltProgress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.98, 0.45, 0],
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
              backgroundColor: isDark ? 'rgba(9, 9, 11, 0.88)' : 'rgba(15, 15, 18, 0.68)',
            },
          ]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />

          {/* Full Screen High-Density Real Static Particle Noise Field */}
          <View style={styles.particlesContainer} pointerEvents="none">
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {currentParticles.map((pt, i) => <View key={`grain-${i}`} style={{ position: 'absolute', left: pt.x-pt.r, top: pt.y-pt.r, width: pt.r*2, height: pt.r*2, borderRadius: pt.r, backgroundColor: isDark ? pt.fill : (pt.fill === '#ffffff' ? '#e2e8f0' : '#475569'), opacity: pt.opacity }} />)}
            </View>
          </View>
        </Animated.View>

        {/* Top-Docked QR Card (Clean & Compact) */}
        <Animated.View
          style={[
            styles.topQrCard,
            {
              backgroundColor: isDark ? '#18181b' : '#ffffff',
              borderColor: isDark ? '#27272a' : '#e4e4e7',
              transform: [{ scale: cardScale }, { translateY: cardSlideDown }],
            },
          ]}
        >
          {/* Liquid Pure White Melt-in Overlay */}
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

