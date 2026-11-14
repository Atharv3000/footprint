import { AppModal as Modal } from '@/components/AppModal';
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/constants/ThemeContext';
import { MuscleGroupKey, MuscleRecoveryStatus } from '@/constants/muscleRecoveryEngine';
import { MuscleSorenessStickman } from '@/components/MuscleSorenessStickman';

interface MuscleSorenessModalProps {
  visible: boolean;
  onClose: () => void;
  recoveryMap: Record<MuscleGroupKey, MuscleRecoveryStatus>;
  selectedMuscle: MuscleGroupKey | null;
  onSelectMuscle: (muscle: MuscleGroupKey) => void;
  onSetMuscleRecovery: (muscle: MuscleGroupKey, percent: number) => void;
}

export function MuscleSorenessModal({
  visible,
  onClose,
  recoveryMap,
  selectedMuscle,
  onSelectMuscle,
  onSetMuscleRecovery,
}: MuscleSorenessModalProps) {
  const { colors, isDark } = useTheme();

  const selectedMuscleData = selectedMuscle ? recoveryMap[selectedMuscle] : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header Bar */}
        <View style={[styles.header, { borderBottomColor: isDark ? '#27272a' : '#e4e4e7' }]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: colors.text }]}>Muscle Soreness & Recovery</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Anatomical Model Visualizer */}
          <View style={[styles.modelContainer, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <MuscleSorenessStickman
              recoveryMap={recoveryMap}
              selectedMuscle={selectedMuscle}
              onSelectMuscle={(m) => {
                Haptics.selectionAsync().catch(() => {});
                onSelectMuscle(m);
              }}
              isDark={isDark}
            />
          </View>

          {/* Selected Muscle Live Detail Card & User Recovery Tuner */}
          {selectedMuscleData && (
            <View
              style={[
                styles.selectedMuscleBox,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: selectedMuscleData.statusColor + '55',
                },
              ]}
            >
              <View style={styles.selectedHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.selectedTitle, { color: colors.text }]}>
                    {selectedMuscleData.label}
                  </Text>
                  <Text style={[styles.selectedSub, { color: colors.textMuted }]}>
                    {selectedMuscleData.lastExerciseName
                      ? `Last: ${selectedMuscleData.lastExerciseName} (${selectedMuscleData.hoursElapsed}h ago)`
                      : 'Rested'}
                  </Text>
                </View>

                {/* Single Clean Indicator */}
                <View
                  style={[
                    styles.singleIndicatorPill,
                    {
                      backgroundColor: selectedMuscleData.statusColor + '18',
                      borderColor: selectedMuscleData.statusColor,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.indicatorDot,
                      { backgroundColor: selectedMuscleData.statusColor },
                    ]}
                  />
                  <Text
                    style={[
                      styles.indicatorText,
                      { color: selectedMuscleData.statusColor },
                    ]}
                  >
                    {selectedMuscleData.recoveryPercent}% Recovered
                  </Text>
                </View>
              </View>

              {/* Recovery Progress Bar */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${selectedMuscleData.recoveryPercent}%`,
                      backgroundColor: selectedMuscleData.statusColor,
                    },
                  ]}
                />
              </View>

              {/* User Soreness / Recovery Tuner */}
              <View style={styles.recoveryTunerSection}>
                <Text style={[styles.tunerTitle, { color: colors.textMuted }]}>
                  MARK SORENESS
                </Text>
                <View style={styles.tunerButtonRow}>
                  {[
                    { label: 'Sore', percent: 25, color: '#ef4444' },
                    { label: 'Mild', percent: 50, color: '#f97316' },
                    { label: 'Moderate', percent: 70, color: '#eab308' },
                    { label: 'Recovered', percent: 100, color: '#10b981' },
                  ].map((level) => {
                    const isCurrent =
                      (level.percent === 25 && selectedMuscleData.recoveryPercent < 40) ||
                      (level.percent === 50 && selectedMuscleData.recoveryPercent >= 40 && selectedMuscleData.recoveryPercent < 60) ||
                      (level.percent === 70 && selectedMuscleData.recoveryPercent >= 60 && selectedMuscleData.recoveryPercent < 88) ||
                      (level.percent === 100 && selectedMuscleData.recoveryPercent >= 88);

                    return (
                      <TouchableOpacity
                        key={level.label}
                        style={[
                          styles.tunerBtn,
                          {
                            backgroundColor: isCurrent ? level.color + '22' : isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
                            borderColor: isCurrent ? level.color : isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
                            borderWidth: 1.5,
                          },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          onSetMuscleRecovery(selectedMuscleData.muscle, level.percent);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.tunerDot, { backgroundColor: level.color }]} />
                        <Text
                          style={[
                            styles.tunerBtnText,
                            {
                              color: isCurrent ? level.color : (isDark ? '#a1a1aa' : '#71717a'),
                              fontWeight: isCurrent ? '800' : '600',
                            },
                          ]}
                        >
                          {level.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  modelContainer: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  selectedMuscleBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  selectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectedTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  selectedSub: {
    fontSize: 12,
    marginTop: 2,
  },
  singleIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  indicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  indicatorText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  recoveryTunerSection: {
    gap: 8,
    marginTop: 4,
  },
  tunerTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tunerButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tunerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  tunerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tunerBtnText: {
    fontSize: 12,
  },
});
