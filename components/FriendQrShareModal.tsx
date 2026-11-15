import { useScreenInsets } from '@/constants/useScreenInsets';
import { AppModal as Modal } from '@/components/AppModal';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Dimensions,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing as ReanimatedEasing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
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

// Generate 4 high-density grey static frames (grain specks + horizontal static scanlines)
const PARTICLE_COUNT_PER_FRAME = 900;
const SCANLINE_COUNT_PER_FRAME = 18;
const GREY_SHADES = ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#3f3f46'] as const;

const generateStaticFrames = () => {
  return Array.from({ length: 4 }, (_, frameIdx) => {
    const specks = Array.from({ length: PARTICLE_COUNT_PER_FRAME }, (_, i) => {
      const s1 = Math.sin(frameIdx * 997 + i * 31.7) * 10000;
      const s2 = Math.cos(frameIdx * 823 + i * 47.3) * 10000;
      const s3 = Math.sin(frameIdx * 641 + i * 19.1) * 10000;
      const x = Math.abs(s1 - Math.floor(s1)) * SCREEN_W;
      const y = Math.abs(s2 - Math.floor(s2)) * SCREEN_H;
      const w = 1.6 + Math.abs(s3 - Math.floor(s3)) * 2.8;
      const h = 1.4 + ((i % 3) * 0.6);
      const opacity = 0.28 + (i % 5) * 0.14;
      const fill = GREY_SHADES[i % GREY_SHADES.length];
      return { x, y, w, h, opacity, fill };
    });
    const scanlines = Array.from({ length: SCANLINE_COUNT_PER_FRAME }, (_, i) => {
      const s1 = Math.sin(frameIdx * 1301 + i * 73.1) * 10000;
      const s2 = Math.cos(frameIdx * 719 + i * 53.7) * 10000;
      const s3 = Math.sin(frameIdx * 409 + i * 29.3) * 10000;
      const y = Math.abs(s1 - Math.floor(s1)) * SCREEN_H;
      const x = Math.abs(s2 - Math.floor(s2)) * (SCREEN_W * 0.45);
      const w = SCREEN_W * (0.25 + Math.abs(s3 - Math.floor(s3)) * 0.65);
      const opacity = 0.14 + (i % 4) * 0.08;
      const fill = i % 2 === 0 ? '#a1a1aa' : '#52525b';
      return { x, y, w, h: 1.5, opacity, fill };
    });
    return { specks, scanlines };
  });
};

const STATIC_FRAMES = generateStaticFrames();

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

  // Reanimated shared values for fast tissue-warp pull + full-white-to-solid transition
  const backdropOpacity = useSharedValue(0);
  const pullProgress = useSharedValue(0); // 0 = tucked above top edge, 1 = landed
  const whiteOverlay = useSharedValue(0); // turns full white as it comes down, then snaps to solid
  const sheenProgress = useSharedValue(-1);
  const isClosingRef = useRef(false);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);

  const offscreenTopY = -(screenInsets.top + 380);

  // Compute standard 2D QR matrix
  const matrix = useMemo(() => {
    return generateQrMatrix(`https://footprint.app/add/${cleanUsername}`);
  }, [cleanUsername]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      pullProgress.value = 0;
      whiteOverlay.value = 1;
      sheenProgress.value = -1;
      backdropOpacity.value = 0;

      // Smooth 520ms warped pull-down; starts white at top and becomes solid BEFORE settling
      backdropOpacity.value = withTiming(1, { duration: 240 });
      pullProgress.value = withTiming(1, {
        duration: 520,
        easing: ReanimatedEasing.bezier(0.25, 0.9, 0.3, 1),
      });
      whiteOverlay.value = withTiming(0, {
        duration: 380,
        easing: ReanimatedEasing.bezier(0.35, 0, 0.65, 1),
      });
      sheenProgress.value = withTiming(1, {
        duration: 500,
        easing: ReanimatedEasing.bezier(0.22, 1, 0.36, 1),
      });

      // High-speed particle static grain flicker
      let frame = 0;
      const interval = setInterval(() => {
        frame = (frame + 1) % 4;
        setActiveFrameIndex(frame);
      }, 40);

      return () => {
        clearInterval(interval);
      };
    } else {
      pullProgress.value = 0;
      whiteOverlay.value = 0;
      backdropOpacity.value = 0;
      sheenProgress.value = -1;
    }
  }, [visible]);

  const finishClose = () => {
    isClosingRef.current = false;
    onClose();
  };

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Haptics.selectionAsync().catch(() => {});

    backdropOpacity.value = withTiming(0, { duration: 300 });
    whiteOverlay.value = 0;
    pullProgress.value = withTiming(
      0,
      {
        duration: 360,
        easing: ReanimatedEasing.bezier(0.5, 0, 0.8, 0.3),
      },
      (finished) => {
        if (finished) {
          runOnJS(finishClose)();
        }
      }
    );
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

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Pulled-sheet warp style: symmetrical curved bottom, gentle side-to-side shift + tilt (no sideways fold)
  const cardWarpStyle = useAnimatedStyle(() => {
    const p = pullProgress.value;
    return {
      borderTopLeftRadius: interpolate(p, [0, 0.5, 1], [10, 18, 22]),
      borderTopRightRadius: interpolate(p, [0, 0.5, 1], [10, 18, 22]),
      borderBottomLeftRadius: interpolate(p, [0, 0.45, 0.85, 1], [68, 42, 25, 22]),
      borderBottomRightRadius: interpolate(p, [0, 0.45, 0.85, 1], [68, 42, 25, 22]),
      transform: [
        { perspective: 750 },
        { translateY: interpolate(p, [0, 0.5, 0.86, 1], [offscreenTopY, -34, 4, 0]) },
        { translateX: interpolate(p, [0, 0.25, 0.55, 0.82, 1], [0, -10, 7, -3, 0]) },
        { scaleX: interpolate(p, [0, 0.45, 0.82, 1], [0.8, 0.94, 1.02, 1]) },
        { scaleY: interpolate(p, [0, 0.45, 0.82, 1], [1.22, 1.08, 0.97, 1]) },
        { rotateX: `${interpolate(p, [0, 0.45, 0.82, 1], [28, 11, -3, 0])}deg` },
        { skewX: `${interpolate(p, [0, 0.25, 0.55, 0.82, 1], [0, 5.5, -3.5, 1.5, 0])}deg` },
      ],
    };
  });

  const whiteFlashStyle = useAnimatedStyle(() => ({
    opacity: whiteOverlay.value,
  }));

  const prismStyle = useAnimatedStyle(() => ({
    opacity: interpolate(whiteOverlay.value, [0, 0.45, 1], [0, 0.48, 0.62]),
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheenProgress.value, [-1, -0.2, 0.4, 1], [0, 0.8, 0.45, 0]),
    transform: [
      { translateX: interpolate(sheenProgress.value, [-1, 1], [-280, 280]) },
      { rotate: '22deg' },
    ],
  }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} edgeToEdge>
      <View style={safeStyles.modalViewport}>
        {/* Grey Static Backdrop */}
        <Animated.View
          style={[
            styles.backdropLayer,
            {
              backgroundColor: isDark ? 'rgba(39, 39, 42, 0.78)' : 'rgba(63, 63, 70, 0.74)',
            },
            backdropStyle,
          ]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />

          {/* Pre-mounted 4-Frame Dynamic Grey Static Field */}
          <View style={styles.particlesContainer} pointerEvents="none">
            {STATIC_FRAMES.map((frameData, frameIdx) => (
              <View
                key={frameIdx}
                style={[
                  StyleSheet.absoluteFill,
                  { opacity: activeFrameIndex === frameIdx ? 1 : 0 },
                ]}
              >
                <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
                  {frameData.specks.map((pt, i) => (
                    <Rect
                      key={`s-${i}`}
                      x={pt.x}
                      y={pt.y}
                      width={pt.w}
                      height={pt.h}
                      fill={pt.fill}
                      opacity={pt.opacity}
                    />
                  ))}
                  {frameData.scanlines.map((line, i) => (
                    <Rect
                      key={`l-${i}`}
                      x={line.x}
                      y={line.y}
                      width={line.w}
                      height={line.h}
                      fill={line.fill}
                      opacity={line.opacity}
                    />
                  ))}
                </Svg>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Top-Docked Warped Tissue -> Solid QR Card */}
        <Animated.View
          style={[
            styles.topQrCard,
            {
              backgroundColor: isDark ? '#18181b' : '#ffffff',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.95)',
              shadowColor: avatarColor || '#a855f7',
              transformOrigin: 'top center',
            },
            cardWarpStyle,
          ]}
        >
          {/* Luminous Liquid Glass Color Layer (vibrant while moving, fades out as card becomes solid) */}
          <Animated.View style={[StyleSheet.absoluteFill, prismStyle]} pointerEvents="none">
            <LinearGradient
              colors={['rgba(56, 189, 248, 0.48)', 'rgba(168, 85, 247, 0.48)', 'rgba(236, 72, 153, 0.44)', 'rgba(99, 102, 241, 0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* Diagonal Specular Glass Sheen Sweep */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: -40,
                bottom: -40,
                width: 90,
              },
              sheenStyle,
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255, 255, 255, 0.85)', 'transparent']}
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
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.85)',
            }}
          />

          {/* Full Solid White Form Overlay (turns white as it comes down, then snaps off) */}
          <Animated.View
            style={[
              styles.meltFlashOverlay,
              {
                backgroundColor: '#ffffff',
              },
              whiteFlashStyle,
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

