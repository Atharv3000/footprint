import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';
import {
  AppleHealthSyncStatus,
  getAppleHealthStatus,
  requestAppleHealthPermissions,
  disconnectAppleHealth,
  syncFromAppleHealth,
  DEFAULT_HEALTH_STATUS,
} from '@/constants/appleHealthService';

interface AppleHealthSyncModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onSyncCompleted?: () => void;
}

export function AppleHealthSyncModal({
  visible,
  onClose,
  userId,
  onSyncCompleted,
}: AppleHealthSyncModalProps) {
  const { colors, isDark } = useTheme();
  const [status, setStatus] = useState<AppleHealthSyncStatus>(DEFAULT_HEALTH_STATUS);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (visible && userId) {
      loadStatus();
    }
  }, [visible, userId]);

  const loadStatus = async () => {
    setLoading(true);
    const s = await getAppleHealthStatus(userId);
    setStatus(s);
    setLoading(false);
  };

  const handleToggleConnection = async () => {
    Haptics.selectionAsync().catch(() => {});
    if (status.isConnected) {
      Alert.alert(
        'Disconnect Apple Health',
        'Disconnect Apple Health integration?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              await disconnectAppleHealth(userId);
              setStatus((prev) => ({ ...prev, isConnected: false }));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            },
          },
        ]
      );
    } else {
      setLoading(true);
      const res = await requestAppleHealthPermissions(userId);
      setLoading(false);
      if (res.success) {
        setStatus((prev) => ({
          ...prev,
          isConnected: true,
          lastSyncTime: new Date().toISOString(),
        }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        Alert.alert('HealthKit Unavailable', res.error || 'Apple Health requires an iOS device with a native build and HealthKit entitlement.');
      }
    }
  };

  const handleSyncNow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSyncing(true);
    setSyncMessage(null);
    try {
      const summary = await syncFromAppleHealth(userId, 14);
      setSyncing(false);
      if (summary.syncedDaysCount === 0) {
        Alert.alert(
          'Apple HealthKit Not Available',
          'Native HealthKit APIs are unavailable in this Expo Go environment. In a custom development build (with react-native-health and HealthKit entitlements), real Apple Health data will stream in directly.'
        );
      } else {
        setSyncMessage(
          `Synced ${summary.totalStepsAdded.toLocaleString()} steps across ${summary.syncedDaysCount} days.`
        );
        setStatus((prev) => ({ ...prev, lastSyncTime: summary.lastSyncDate }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (onSyncCompleted) {
          onSyncCompleted();
        }
      }
    } catch (e) {
      setSyncing(false);
      Alert.alert('Sync Error', 'Could not sync from Apple Health.');
    }
  };

  return (
    <InteractiveBottomModal
      visible={visible}
      onDismiss={onClose}
      handleColor={colors.border}
      cardStyle={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.contentWrap}>
        {/* Header with Apple Health Heart Icon */}
        <View style={styles.headerRow}>
          <View style={styles.appleHeartIconBadge}>
            <Ionicons name="heart" size={26} color="#ef4444" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Apple Health</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Sync steps, distance, & daily activity
            </Text>
          </View>
        </View>

        {/* Status Card */}
        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: status.isConnected ? 'rgba(34, 197, 94, 0.4)' : colors.border,
            },
          ]}
        >
          <View style={styles.statusTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={[
                  styles.statusIndicatorDot,
                  { backgroundColor: status.isConnected ? '#22c55e' : '#71717a' },
                ]}
              />
              <Text style={[styles.statusStateText, { color: colors.text }]}>
                {status.isConnected ? 'Connected to HealthKit' : 'Not Connected'}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.connectBtn,
                {
                  backgroundColor: status.isConnected
                    ? (isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2')
                    : colors.primary,
                  borderColor: status.isConnected ? '#ef4444' : 'transparent',
                },
              ]}
              onPress={handleToggleConnection}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text
                  style={[
                    styles.connectBtnText,
                    { color: status.isConnected ? '#ef4444' : (isDark ? '#09090b' : '#ffffff') },
                  ]}
                >
                  {status.isConnected ? 'Disconnect' : 'Connect'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {status.lastSyncTime && (
            <Text style={[styles.lastSyncText, { color: colors.textMuted }]}>
              Last synced: {new Date(status.lastSyncTime).toLocaleDateString()} at{' '}
              {new Date(status.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>

        {/* Sync Success Message */}
        {syncMessage && (
          <View style={[styles.syncNoticeCard, { backgroundColor: isDark ? '#052e16' : '#dcfce7' }]}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={[styles.syncNoticeText, { color: isDark ? '#86efac' : '#166534' }]}>
              {syncMessage}
            </Text>
          </View>
        )}

        {/* Permissions Data Read List */}
        <View style={styles.dataListWrap}>
          <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>
            DATA SYNCHRONIZED
          </Text>

          <View style={[styles.dataItemRow, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="footsteps" size={18} color="#10b981" />
              <View>
                <Text style={[styles.dataItemTitle, { color: colors.text }]}>Daily Steps</Text>
                <Text style={[styles.dataItemDesc, { color: colors.textMuted }]}>
                  Hourly and total pedometer data
                </Text>
              </View>
            </View>
            <Ionicons
              name={status.isConnected ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={status.isConnected ? '#10b981' : colors.textMuted}
            />
          </View>

          <View style={[styles.dataItemRow, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="navigate" size={18} color="#3b82f6" />
              <View>
                <Text style={[styles.dataItemTitle, { color: colors.text }]}>Walking + Running Distance</Text>
                <Text style={[styles.dataItemDesc, { color: colors.textMuted }]}>
                  Distance covered throughout the day
                </Text>
              </View>
            </View>
            <Ionicons
              name={status.isConnected ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={status.isConnected ? '#3b82f6' : colors.textMuted}
            />
          </View>

          <View style={[styles.dataItemRow, { borderBottomColor: 'transparent' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="scale" size={18} color="#a855f7" />
              <View>
                <Text style={[styles.dataItemTitle, { color: colors.text }]}>Body Weight & Measurements</Text>
                <Text style={[styles.dataItemDesc, { color: colors.textMuted }]}>
                  Syncs with smart scales and Health app
                </Text>
              </View>
            </View>
            <Ionicons
              name={status.isConnected ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={status.isConnected ? '#a855f7' : colors.textMuted}
            />
          </View>
        </View>

        {/* Notice on HealthKit Capabilities */}
        <View style={{ padding: 12, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: colors.border, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 }}>
              HEALTHKIT ENVIRONMENT NOTE
            </Text>
          </View>
          <Text style={{ fontSize: 11.5, color: colors.textMuted, lineHeight: 16 }}>
            Standard Expo Go runs in a managed sandbox without native HealthKit entitlements. In production/standalone iOS builds, Apple HealthKit links directly via `react-native-health`.
          </Text>
        </View>

        {/* Sync Now Action Button */}
        {status.isConnected && (
          <TouchableOpacity
            style={[styles.syncNowBtn, { backgroundColor: colors.primary }]}
            onPress={handleSyncNow}
            disabled={syncing}
            activeOpacity={0.8}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#09090b" />
            ) : (
              <>
                <Ionicons name="sync" size={18} color="#09090b" />
                <Text style={styles.syncNowBtnText}>Sync Apple Health Now</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </InteractiveBottomModal>
  );
}

const styles = StyleSheet.create({
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 32,
  },
  contentWrap: {
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  appleHeartIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  modalTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  modalSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  statusCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusStateText: {
    fontSize: 14,
    fontWeight: '700',
  },
  connectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  connectBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  lastSyncText: {
    fontSize: 12,
  },
  syncNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  syncNoticeText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  dataListWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 12,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  dataItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  dataItemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  dataItemDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  syncNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 18,
    gap: 8,
    marginTop: 4,
  },
  syncNowBtnText: {
    color: '#09090b',
    fontSize: 15,
    fontWeight: '800',
  },
});
