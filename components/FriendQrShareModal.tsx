import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
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
import Svg, { Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { BRAND_ROUNDED_FONT, BRAND_ROUNDED_FONT_EXTRA } from '@/constants/ThemeContext';
import { generateQrMatrix } from '@/constants/qrCodeEngine';

interface FriendQrShareModalProps {
  visible: boolean;
  onClose: () => void;
  username: string;
  displayName: string;
  avatarColor: string;
  isDark: boolean;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export function FriendQrShareModal({
  visible,
  onClose,
  username,
  displayName,
  avatarColor,
  isDark,
}: FriendQrShareModalProps) {
  const cleanUsername = (username || 'user').toLowerCase().replace(/^@/, '');
  const shareUrl = Linking.createURL(`friend?user=${cleanUsername}`);

  // Entrance and melting animations
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const meltProgress = useRef(new Animated.Value(0)).current; // 0 = bright liquid white, 1 = crystal clear card
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardSlideDown = useRef(new Animated.Value(-60)).current;
  const staticGrainFlicker = useRef(new Animated.Value(0)).current;
  const qrLaserY = useRef(new Animated.Value(0)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;

  // Generate static cyber grains
  const staticParticles = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.45 + 0.1,
    }));
  }, []);

  // Compute 2D QR matrix
  const matrix = useMemo(() => {
    return generateQrMatrix(`https://footprint.app/add/${cleanUsername}`);
  }, [cleanUsername]);

  useEffect(() => {
    if (visible) {
      // 1. Entrance animation: Melt in from bright pure white
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(meltProgress, {
          toValue: 1,
          duration: 650,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.spring(cardSlideDown, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();

      // 2. Holographic Static Grain Noise flicker
      const staticLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(staticGrainFlicker, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(staticGrainFlicker, { toValue: 0.3, duration: 80, useNativeDriver: true }),
          Animated.timing(staticGrainFlicker, { toValue: 0.85, duration: 140, useNativeDriver: true }),
          Animated.timing(staticGrainFlicker, { toValue: 0.1, duration: 90, useNativeDriver: true }),
        ])
      );
      staticLoop.start();

      // 3. Cyber laser line scanning across QR modules
      const laserLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(qrLaserY, {
            toValue: 1,
            duration: 1900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(qrLaserY, {
            toValue: 0,
            duration: 1900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      laserLoop.start();

      // 4. Subtle badge breathing
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(badgePulse, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
          Animated.timing(badgePulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      pulseLoop.start();

      // Automatically open system share menu simultaneously
      const timer = setTimeout(() => {
        handleNativeShare();
      }, 550);

      return () => {
        clearTimeout(timer);
        staticLoop.stop();
        laserLoop.stop();
        pulseLoop.stop();
      };
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(cardScale, { toValue: 0.85, duration: 200, useNativeDriver: true }),
        Animated.timing(meltProgress, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {});
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.85, duration: 220, useNativeDriver: true }),
      Animated.timing(cardSlideDown, { toValue: -40, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      onClose();
    });
  };

  const handleNativeShare = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await Share.share({
        message: `Add me on Footprint! Tap or scan my pass to automatically become walking friends: ${shareUrl}`,
        url: shareUrl,
        title: `Add ${displayName || cleanUsername} on Footprint`,
      });
    } catch {
      // User dismissed share dialog
    }
  };

  // QR rendering calculations
  const qrBoxSize = 200;
  const matrixDimension = matrix.length;
  const cellSize = qrBoxSize / matrixDimension;

  const laserTranslate = qrLaserY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, qrBoxSize - 4],
  });

  // Melting white flash overlay interpolations
  const meltWhiteFlashOpacity = meltProgress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.95, 0.45, 0],
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalViewport}>
        {/* Soft Blurred & Dimmed Backdrop with Static Grain */}
        <Animated.View
          style={[
            styles.backdropLayer,
            {
              opacity: backdropOpacity,
              backgroundColor: isDark ? 'rgba(7, 8, 12, 0.86)' : 'rgba(15, 23, 42, 0.65)',
            },
          ]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />

          {/* Holographic Cyber Static particles floating in the blurred background */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: staticGrainFlicker }]} pointerEvents="none">
            {staticParticles.map((pt) => (
              <View
                key={pt.id}
                style={[
                  styles.staticDustParticle,
                  {
                    left: `${pt.left}%`,
                    top: `${pt.top}%`,
                    width: pt.size,
                    height: pt.size,
                    opacity: pt.opacity,
                    backgroundColor: isDark ? '#ffffff' : '#38bdf8',
                  },
                ]}
              />
            ))}
          </Animated.View>
        </Animated.View>

        {/* Top-Docked QR Pass Container (leaving bottom friend view visible) */}
        <Animated.View
          style={[
            styles.topQrCard,
            {
              backgroundColor: isDark ? '#11131a' : '#ffffff',
              borderColor: isDark ? '#272935' : '#e2e8f0',
              transform: [{ scale: cardScale }, { translateY: cardSlideDown }],
            },
          ]}
        >
          {/* Melting in from pure liquid white light flash */}
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

          {/* Top Edge Glow */}
          <View style={[styles.topGlowStripe, { backgroundColor: avatarColor || '#10b981' }]} />

          {/* Header Row: User Identity + Close Pill */}
          <View style={styles.cardHeaderRow}>
            <Animated.View
              style={[
                styles.avatarCircle,
                {
                  backgroundColor: avatarColor || '#10b981',
                  transform: [{ scale: badgePulse }],
                  shadowColor: avatarColor || '#10b981',
                },
              ]}
            >
              <Text style={styles.avatarInitial}>
                {(displayName || cleanUsername).charAt(0).toUpperCase()}
              </Text>
            </Animated.View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.cardTitle, { color: isDark ? '#ffffff' : '#09090b' }]}>
                {displayName || cleanUsername}
              </Text>
              <View style={styles.handleChip}>
                <Ionicons name="qr-code-outline" size={12} color="#10b981" />
                <Text style={styles.handleChipText}>@{cleanUsername}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.closePillBtn, { backgroundColor: isDark ? '#222530' : '#f1f5f9' }]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={17} color={isDark ? '#e2e8f0' : '#334155'} />
            </TouchableOpacity>
          </View>

          {/* Center High-Contrast QR Code Stage */}
          <View
            style={[
              styles.qrStageBox,
              {
                backgroundColor: isDark ? '#08090d' : '#f8fafc',
                borderColor: isDark ? '#242735' : '#e2e8f0',
              },
            ]}
          >
            {/* Holographic Target Corner Accents */}
            <View style={[styles.cornerBracket, styles.bracketTL, { borderColor: '#10b981' }]} />
            <View style={[styles.cornerBracket, styles.bracketTR, { borderColor: '#10b981' }]} />
            <View style={[styles.cornerBracket, styles.bracketBL, { borderColor: '#10b981' }]} />
            <View style={[styles.cornerBracket, styles.bracketBR, { borderColor: '#10b981' }]} />

            {/* SVG Crisp QR Code Grid */}
            <View style={{ width: qrBoxSize, height: qrBoxSize, position: 'relative' }}>
              <Svg width={qrBoxSize} height={qrBoxSize} viewBox={`0 0 ${qrBoxSize} ${qrBoxSize}`}>
                <Defs>
                  <SvgLinearGradient id="qrGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%" stopColor="#10b981" />
                    <Stop offset="100%" stopColor={isDark ? '#ffffff' : '#0f172a'} />
                  </SvgLinearGradient>
                </Defs>
                {matrix.map((row, r) =>
                  row.map((active, c) => {
                    if (!active) return null;
                    return (
                      <Rect
                        key={`${r}-${c}`}
                        x={c * cellSize + 0.5}
                        y={r * cellSize + 0.5}
                        width={cellSize - 1}
                        height={cellSize - 1}
                        rx={cellSize * 0.28}
                        ry={cellSize * 0.28}
                        fill={
                          (r < 7 && c < 7) || (r < 7 && c >= matrixDimension - 7) || (r >= matrixDimension - 7 && c < 7)
                            ? (isDark ? '#ffffff' : '#09090b')
                            : (isDark ? '#ffffff' : '#1e293b')
                        }
                      />
                    );
                  })
                )}
              </Svg>

              {/* Holographic Glowing Laser Sweep */}
              <Animated.View
                style={[
                  styles.cyberLaserBeam,
                  {
                    transform: [{ translateY: laserTranslate }],
                    shadowColor: '#10b981',
                  },
                ]}
              />
            </View>

            {/* Sub-label */}
            <View style={styles.qrBadgeBottom}>
              <View style={styles.pulsingGreenDot} />
              <Text style={styles.qrBadgeText}>SCAN TO AUTO-FRIEND</Text>
            </View>
          </View>

          {/* Quick Action Footer: Share button */}
          <View style={styles.cardActionsRow}>
            <TouchableOpacity
              style={[styles.shareActionBtn, { backgroundColor: avatarColor || '#10b981' }]}
              onPress={handleNativeShare}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social-outline" size={17} color="#ffffff" />
              <Text style={styles.shareActionBtnText}>Share Friend Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.doneActionBtn,
                { backgroundColor: isDark ? '#1f222e' : '#f1f5f9', borderColor: isDark ? '#323646' : '#e2e8f0' },
              ]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.doneActionBtnText, { color: isDark ? '#ffffff' : '#0f172a' }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalViewport: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 64 : 44,
    paddingHorizontal: 20,
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  staticDustParticle: {
    position: 'absolute',
    borderRadius: 2,
  },
  topQrCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 30,
    borderWidth: 1.5,
    padding: 22,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.55,
    shadowRadius: 36,
    elevation: 16,
  },
  meltFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    zIndex: 20,
  },
  topGlowStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarInitial: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
  },
  cardTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  handleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  handleChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
    letterSpacing: -0.2,
  },
  closePillBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrStageBox: {
    borderRadius: 22,
    borderWidth: 1.2,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cornerBracket: {
    position: 'absolute',
    width: 14,
    height: 14,
  },
  bracketTL: {
    top: 8,
    left: 8,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderTopLeftRadius: 5,
  },
  bracketTR: {
    top: 8,
    right: 8,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderTopRightRadius: 5,
  },
  bracketBL: {
    bottom: 8,
    left: 8,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderBottomLeftRadius: 5,
  },
  bracketBR: {
    bottom: 8,
    right: 8,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderBottomRightRadius: 5,
  },
  cyberLaserBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: '#10b981',
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 4,
  },
  qrBadgeBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  pulsingGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  qrBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#10b981',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    alignItems: 'center',
  },
  shareActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  shareActionBtnText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  doneActionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneActionBtnText: {
    fontFamily: BRAND_ROUNDED_FONT,
    fontSize: 13.5,
    fontWeight: '700',
  },
});
