import React, { useEffect, useRef, useState } from 'react';
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
import Svg, { Rect, Path } from 'react-native-svg';
import { BRAND_ROUNDED_FONT, BRAND_ROUNDED_FONT_EXTRA } from '@/constants/ThemeContext';

interface FriendBarcodeShareModalProps {
  visible: boolean;
  onClose: () => void;
  username: string;
  displayName: string;
  avatarColor: string;
  isDark: boolean;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Code 128 (Subset B) table for accurate scanner barcode generation
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

function encodeCode128(text: string): string[] {
  const clean = text.trim();
  const startCodeB = 104;
  let checksum = startCodeB;
  const patterns: string[] = [CODE128_PATTERNS[startCodeB]];

  for (let i = 0; i < clean.length; i++) {
    const ascii = clean.charCodeAt(i);
    const code = ascii - 32;
    if (code >= 0 && code < 103) {
      checksum += code * (i + 1);
      patterns.push(CODE128_PATTERNS[code]);
    }
  }

  const checkVal = checksum % 103;
  patterns.push(CODE128_PATTERNS[checkVal]);
  patterns.push(CODE128_PATTERNS[106]); // Stop pattern
  return patterns;
}

export function FriendBarcodeShareModal({
  visible,
  onClose,
  username,
  displayName,
  avatarColor,
  isDark,
}: FriendBarcodeShareModalProps) {
  const cleanUsername = (username || 'user').toLowerCase().replace(/^@/, '');
  const shareUrl = Linking.createURL(`friend?user=${cleanUsername}`);

  // Animations
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.75)).current;
  const translateYAnim = useRef(new Animated.Value(40)).current;
  const laserAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (visible) {
      setCopied(false);
      // Entrance animation sequence
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 70,
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          friction: 8,
          tension: 70,
          useNativeDriver: true,
        }),
      ]).start();

      // Continuous futuristic holographic laser sweep
      const laserLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      laserLoop.start();

      // Gentle badge breathing
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();

      // Automatically open the native system share sheet below the popup
      const timer = setTimeout(() => {
        handleNativeShare();
      }, 550);

      return () => {
        clearTimeout(timer);
        laserLoop.stop();
        pulseLoop.stop();
      };
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.8, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {});
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 220, useNativeDriver: true }),
      Animated.timing(translateYAnim, { toValue: 30, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      onClose();
    });
  };

  const handleNativeShare = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await Share.share({
        message: `Add me on Footprint! Tap this link or scan my pass to automatically become walking friends: ${shareUrl}`,
        url: shareUrl,
        title: `Add ${displayName || cleanUsername} on Footprint`,
      });
    } catch (err) {
      // User cancelled or share sheet closed
    }
  };

  // Generate SVG barcode stripes
  const patterns = encodeCode128(`FP:${cleanUsername}`);
  const bars: { x: number; width: number }[] = [];
  let currentX = 14;
  const unitWidth = 2.4;

  patterns.forEach((pattern) => {
    for (let i = 0; i < pattern.length; i++) {
      const widthUnits = parseInt(pattern[i], 10);
      const isBar = i % 2 === 0;
      if (isBar) {
        bars.push({ x: currentX, width: widthUnits * unitWidth });
      }
      currentX += widthUnits * unitWidth;
    }
  });

  const totalSvgWidth = Math.max(280, currentX + 14);
  const barcodeHeight = 88;

  const laserTranslateY = laserAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, barcodeHeight + 10],
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[
            styles.backdropDismiss,
            {
              opacity: backdropAnim,
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.78)' : 'rgba(0, 0, 0, 0.55)',
            },
          ]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.cardContainer,
            {
              backgroundColor: isDark ? '#121318' : '#ffffff',
              borderColor: isDark ? '#27272a' : '#e4e4e7',
              transform: [{ scale: scaleAnim }, { translateY: translateYAnim }],
            },
          ]}
        >
          {/* Top holographic glowing edge accent */}
          <View style={[styles.glowHeaderBar, { backgroundColor: avatarColor || '#10b981' }]} />

          {/* Close button */}
          <TouchableOpacity
            style={[styles.closeIconBtn, { backgroundColor: isDark ? '#27272a' : '#f4f4f5' }]}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={19} color={isDark ? '#e4e4e7' : '#27272a'} />
          </TouchableOpacity>

          {/* Card Brand & Header */}
          <View style={styles.cardHeaderSection}>
            <Animated.View
              style={[
                styles.avatarCircle,
                {
                  backgroundColor: avatarColor || '#10b981',
                  transform: [{ scale: pulseAnim }],
                  shadowColor: avatarColor || '#10b981',
                },
              ]}
            >
              <Text style={styles.avatarInitial}>
                {(displayName || cleanUsername).charAt(0).toUpperCase()}
              </Text>
            </Animated.View>

            <View style={styles.userTextInfo}>
              <Text style={[styles.displayNameText, { color: isDark ? '#ffffff' : '#09090b' }]}>
                {displayName || cleanUsername}
              </Text>
              <View style={styles.handleBadgeRow}>
                <Ionicons name="sparkles" size={12} color="#10b981" />
                <Text style={styles.handleBadgeText}>@{cleanUsername}</Text>
              </View>
            </View>
          </View>

          {/* Barcode Hologram Stage */}
          <View
            style={[
              styles.barcodeContainerBox,
              {
                backgroundColor: isDark ? '#090a0f' : '#f8fafc',
                borderColor: isDark ? '#222530' : '#e2e8f0',
              },
            ]}
          >
            {/* Top Barcode Subtitle */}
            <View style={styles.barcodeMetaRow}>
              <Text style={[styles.barcodeMetaLabel, { color: isDark ? '#71717a' : '#94a3b8' }]}>
                FOOTPRINT FRIEND PASS
              </Text>
              <View style={styles.liveScanChip}>
                <View style={styles.liveDotPulse} />
                <Text style={styles.liveScanText}>READY TO SCAN</Text>
              </View>
            </View>

            {/* SVG Rendered Code 128 Barcode */}
            <View style={styles.svgWrapper}>
              <Svg width={totalSvgWidth} height={barcodeHeight} viewBox={`0 0 ${totalSvgWidth} ${barcodeHeight}`}>
                {bars.map((bar, idx) => (
                  <Rect
                    key={idx}
                    x={bar.x}
                    y={0}
                    width={bar.width}
                    height={barcodeHeight}
                    fill={isDark ? '#ffffff' : '#0f172a'}
                    rx={1.2}
                  />
                ))}
              </Svg>

              {/* Animated Hologram Laser Scanning Beam */}
              <Animated.View
                style={[
                  styles.laserScanLine,
                  {
                    transform: [{ translateY: laserTranslateY }],
                    shadowColor: avatarColor || '#10b981',
                  },
                ]}
              />
            </View>

            {/* Human Readable Code */}
            <Text style={[styles.humanReadableText, { color: isDark ? '#a1a1aa' : '#64748b' }]}>
              {`FP-${cleanUsername.toUpperCase()}-VERIFIED`}
            </Text>
          </View>

          <Text style={[styles.scanHintText, { color: isDark ? '#a1a1aa' : '#64748b' }]}>
            Point another camera or share this link to immediately add as a friend.
          </Text>

          {/* Action Dock (Share button & Link Copy) */}
          <View style={styles.actionDock}>
            <TouchableOpacity
              style={[styles.primaryShareBtn, { backgroundColor: avatarColor || '#10b981' }]}
              onPress={handleNativeShare}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social-outline" size={18} color="#ffffff" />
              <Text style={styles.primaryShareBtnText}>Share Friend Pass</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryLinkBtn,
                {
                  backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                  borderColor: isDark ? '#3f3f46' : '#e4e4e7',
                },
              ]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryLinkBtnText, { color: isDark ? '#e4e4e7' : '#27272a' }]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 375,
    borderRadius: 28,
    borderWidth: 1.5,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  glowHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  closeIconBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cardHeaderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
    marginBottom: 20,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarInitial: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
  },
  userTextInfo: {
    flex: 1,
  },
  displayNameText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  handleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  handleBadgeText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#10b981',
    letterSpacing: -0.2,
  },
  barcodeContainerBox: {
    borderRadius: 20,
    borderWidth: 1.2,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  barcodeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  barcodeMetaLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  liveScanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  liveDotPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  liveScanText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#10b981',
    letterSpacing: 0.8,
  },
  svgWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  laserScanLine: {
    position: 'absolute',
    top: 0,
    left: 4,
    right: 4,
    height: 2.5,
    backgroundColor: '#10b981',
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 3,
  },
  humanReadableText: {
    fontFamily: BRAND_ROUNDED_FONT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 14,
  },
  scanHintText: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 14,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  actionDock: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  primaryShareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryShareBtnText: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 14.5,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  secondaryLinkBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLinkBtnText: {
    fontFamily: BRAND_ROUNDED_FONT,
    fontSize: 14,
    fontWeight: '700',
  },
});
