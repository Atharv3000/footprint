import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BadgeDefinition, TIER_METALLIC } from '@/constants/badgesEngine';
import { CircularProgressRing } from './CircularProgressRing';

interface InteractiveBadgeProps {
  badge: BadgeDefinition;
  isDark?: boolean;
  onPress: () => void;
}

export const InteractiveBadge: React.FC<InteractiveBadgeProps> = ({
  badge,
  isDark = true,
  onPress,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.94,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 6,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const tierInfo = badge.currentTier
    ? TIER_METALLIC[badge.currentTier]
    : TIER_METALLIC.unearned;

  const isGold = badge.currentTier === 'gold';
  const isSilver = badge.currentTier === 'silver';
  const isBronze = badge.currentTier === 'bronze';

  const badgeFaceBg = isGold
    ? (isDark ? '#261805' : '#fef3c7')
    : isSilver
    ? (isDark ? '#181e29' : '#f1f5f9')
    : isBronze
    ? (isDark ? '#231205' : '#ffedd5')
    : (isDark ? '#18181b' : '#f4f4f5');

  const badgeBorderColor = isGold
    ? '#f59e0b'
    : isSilver
    ? '#94a3b8'
    : isBronze
    ? '#d97706'
    : isDark ? '#27272a' : '#e4e4e7';

  return (
    <View style={styles.coinColWrapper}>
      <TouchableOpacity
        activeOpacity={0.82}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
      >
        <Animated.View
          style={[
            styles.coinAnchor,
            {
              transform: [{ scale }],
            },
          ]}
        >
          {/* Subtle Ambient Glow for Earned Tiers */}
          {badge.currentTier && (
            <View
              style={[
                styles.coinRadiantGlow,
                {
                  backgroundColor: tierInfo.glow,
                  opacity: isDark ? 0.22 : 0.16,
                },
              ]}
            />
          )}

          {/* Outer Circular Progress Ring around the symbol */}
          <CircularProgressRing
            size={88}
            strokeWidth={6}
            strokeLinecap="butt"
            progressPercent={badge.progressPercent}
            activeColor={tierInfo.base}
            trackColor={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
          >
            {/* Clean Medallion Face without deep 3D cylinder layers */}
            <View
              style={[
                styles.coinFaceCircle,
                {
                  backgroundColor: badgeFaceBg,
                  borderColor: badgeBorderColor,
                },
              ]}
            >
              {/* Inner Badge Icon Symbol with pop highlight */}
              <View
                style={[
                  styles.iconCoreCircle,
                  {
                    backgroundColor: isDark ? tierInfo.gradientDark : tierInfo.bg,
                    borderColor: tierInfo.border,
                  },
                ]}
              >
                {/* Subtle top-light shine for metallic pop */}
                {badge.currentTier && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.iconCoreHighlight,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.45)' },
                    ]}
                  />
                )}
                <Ionicons
                  name={badge.icon as any}
                  size={26}
                  color={badge.currentTier ? tierInfo.base : (isDark ? '#71717a' : '#a1a1aa')}
                />
              </View>
            </View>
          </CircularProgressRing>
        </Animated.View>
      </TouchableOpacity>

      {/* Label info below the badge */}
      <View style={styles.coinLabelBlock}>
        <Text style={[styles.badgeCoinTitle, { color: isDark ? '#ffffff' : '#09090b' }]} numberOfLines={1}>
          {badge.title}
        </Text>

        <Text style={[styles.coinProgressHint, { color: badge.currentTier === 'gold' ? tierInfo.base : (isDark ? '#a1a1aa' : '#71717a') }]}>
          {badge.currentTier === 'gold' ? '100% · Completed' : `${badge.progressPercent}%`}
        </Text>
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// 3D SPINNABLE COIN MODAL HERO (Interactive Front & Back Face)
// ══════════════════════════════════════════════════════════════════════════
interface SpinnableCoinHeroProps {
  badge: BadgeDefinition;
  userName?: string;
  isDark?: boolean;
}

export const SpinnableCoinHero: React.FC<SpinnableCoinHeroProps> = ({
  badge,
  userName = 'Walker',
  isDark = true,
}) => {
  const tierInfo = badge.currentTier
    ? TIER_METALLIC[badge.currentTier]
    : TIER_METALLIC.unearned;

  const isGold = badge.currentTier === 'gold';
  const isSilver = badge.currentTier === 'silver';
  const isBronze = badge.currentTier === 'bronze';

  const badgeFaceBg = isGold
    ? (isDark ? '#261805' : '#fef3c7')
    : isSilver
    ? (isDark ? '#181e29' : '#f1f5f9')
    : isBronze
    ? (isDark ? '#231205' : '#ffedd5')
    : (isDark ? '#18181b' : '#f4f4f5');

  const badgeBorderColor = isGold
    ? '#f59e0b'
    : isSilver
    ? '#94a3b8'
    : isBronze
    ? '#d97706'
    : isDark ? '#27272a' : '#e4e4e7';

  return (
    <View style={styles.heroWrapper}>
      <View style={styles.heroCoinContainer}>
        {/* Subtle Ambient Glow */}
        {badge.currentTier && (
          <View
            style={[
              styles.heroCoinRadiantGlow,
              {
                backgroundColor: tierInfo.glow,
                opacity: isDark ? 0.24 : 0.18,
              },
            ]}
          />
        )}

        {/* Outer Circular Progress Ring showing milestone progress */}
        <CircularProgressRing
          size={116}
          strokeWidth={7}
          strokeLinecap="butt"
          progressPercent={badge.progressPercent}
          activeColor={tierInfo.base}
          trackColor={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
        >
          {/* Main Clean Badge Medallion Shell */}
          <View
            style={[
              styles.heroCoinFace,
              {
                backgroundColor: badgeFaceBg,
                borderColor: badgeBorderColor,
              },
            ]}
          >
            <View
              style={[
                styles.heroCoinCore,
                {
                  backgroundColor: tierInfo.bg,
                  borderColor: tierInfo.border,
                },
              ]}
            >
              <Ionicons name={badge.icon as any} size={44} color={tierInfo.base} />
            </View>
          </View>
        </CircularProgressRing>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  coinColWrapper: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 26,
    paddingVertical: 4,
  },
  coinAnchor: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  coinRadiantGlow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    filter: Platform.OS === 'web' ? 'blur(12px)' : undefined,
  },
  coinEdgeDepth: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 2,
    top: 6,
    opacity: 0.7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  coinEdgeDepthLayer2: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    top: 4,
    opacity: 0.6,
  },
  coinEdgeDepthLayer3: {
    position: 'absolute',
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 1,
    top: 2,
    opacity: 0.45,
  },
  coinFaceCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  iconCoreCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  iconCoreHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 25,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    opacity: 0.6,
  },
  coinLabelBlock: {
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
    paddingHorizontal: 4,
  },
  badgeCoinTitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  coinProgressHint: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: -0.1,
  },

  /* ── Hero Showcase Badge In Detail Modal ── */
  heroWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroCoinContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroCoinRadiantGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  heroCoinFace: {
    width: 102,
    height: 102,
    borderRadius: 51,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroCoinCore: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
