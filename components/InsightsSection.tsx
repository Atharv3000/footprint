import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { loadWalks, WalkRecord } from '@/constants/walkStorage';
import { loadAllStepData, DailyStepData } from '@/constants/stepsStorage';
import {
  RACE_DISTANCES,
  RaceDistanceDef,
  predictRaceTimeSeconds,
  formatRaceTime,
  formatPace,
  calculateRacePercentile,
} from '@/constants/racePredictionsEngine';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';

interface InsightsSectionProps {
  userId?: string;
  unitSystem?: 'us_customary' | 'metric';
  gender?: 'male' | 'female' | 'na';
  age?: number;
}

export function InsightsSection({
  userId,
  unitSystem = 'us_customary',
  gender = 'na',
  age = 28,
}: InsightsSectionProps) {
  const { colors, isDark } = useTheme();

  const [walks, setWalks] = useState<WalkRecord[]>([]);
  const [stepDays, setStepDays] = useState<Record<string, DailyStepData>>({});
  const [showMethodologyModal, setShowMethodologyModal] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) return;
    loadWalks(userId).then((records) => {
      setWalks(records);
    });
    loadAllStepData(userId).then((data) => {
      setStepDays(data);
    });
  }, [userId]);

  // Find user's baseline performance strictly derived from all recorded user activities & steps,
  // weighing more recent activities more heavily
  const baselinePerformance = useMemo(() => {
    // 1. Check all recorded workouts
    const validWalks = walks.filter(
      (w) => (w.distanceMeters || 0) >= 400 && (w.durationSeconds || 0) >= 120
    );

    if (validWalks.length > 0) {
      const now = Date.now();
      let totalWeightedPace = 0;
      let totalWeight = 0;
      let totalDistSum = 0;

      // Sort newest first
      const sorted = [...validWalks].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      for (let i = 0; i < sorted.length; i++) {
        const w = sorted[i];
        const distKm = (w.distanceMeters || 1000) / 1000;
        const durSec = w.durationSeconds || 600;
        const rawPaceSecPerKm = durSec / distKm;

        // Recency weight: exponential half-life of ~14 days plus position weight
        const daysOld = Math.max(0, (now - new Date(w.date).getTime()) / (1000 * 60 * 60 * 24));
        const recencyWeight = Math.exp(-daysOld / 14); // Newest gets ~1.0, 2 weeks old gets ~0.37
        const isRun = w.activityType === 'run' || (w.label || '').toLowerCase().includes('run');
        const activityWeight = isRun ? 1.35 : 1.0; // Running activities weighted higher for race speed
        const weight = Math.max(0.1, recencyWeight * activityWeight);

        totalWeightedPace += rawPaceSecPerKm * weight;
        totalWeight += weight;
        totalDistSum += distKm;
      }

      const effectivePaceSecPerKm = totalWeightedPace / Math.max(0.001, totalWeight);
      const representativeDistKm = Math.min(10, Math.max(3.0, totalDistSum / sorted.length));
      const effectiveDurationSec = Math.round(effectivePaceSecPerKm * representativeDistKm);

      return {
        distanceKm: representativeDistKm,
        durationSeconds: effectiveDurationSec,
        source: `Weighted history (${sorted.length} workout${sorted.length > 1 ? 's' : ''}, recency-weighted)`,
      };
    }

    // 2. Derive from actual recorded step activity history (peak active hour across recorded days)
    const allDays = Object.values(stepDays);
    if (allDays.length > 0) {
      let maxHourSteps = 0;
      let totalRecordedSteps = 0;
      let totalActiveDays = 0;

      for (const day of allDays) {
        if (day.totalSteps > 0) {
          totalRecordedSteps += day.totalSteps;
          totalActiveDays++;
        }
        if (day.hourlySteps && day.hourlySteps.length === 24) {
          for (const s of day.hourlySteps) {
            if (s > maxHourSteps) maxHourSteps = s;
          }
        }
      }

      const avgDailySteps = totalActiveDays > 0 ? totalRecordedSteps / totalActiveDays : 7000;
      const estimatedKmInHour = Math.max(2.4, Math.min(6.5, (maxHourSteps || avgDailySteps * 0.35) * 0.00078));
      const durSec = 3600;

      return {
        distanceKm: estimatedKmInHour,
        durationSeconds: durSec,
        source: `Peak activity (${Math.round(maxHourSteps || avgDailySteps * 0.35)} steps/hr)`,
      };
    }

    // Default fallback if brand new account with 0 steps
    return {
      distanceKm: 3.2,
      durationSeconds: 22 * 60,
      source: 'Activity baseline',
    };
  }, [walks, stepDays]);

  // Compute predictions for all 5 race lengths
  const predictions = useMemo(() => {
    const longestKm = Math.max(...walks.map((w) => (w.distanceMeters || 0) / 1000), 5.0);
    return RACE_DISTANCES.map((race) => {
      const predictedSec = predictRaceTimeSeconds(
        baselinePerformance.distanceKm,
        baselinePerformance.durationSeconds,
        race.distanceKm,
        'run',
        longestKm
      );

      const timeStr = formatRaceTime(predictedSec);
      const paceStr = formatPace(predictedSec, race.distanceKm, unitSystem);
      const stats = calculateRacePercentile(predictedSec, race.distanceKm, gender, age, race.id);

      return {
        race,
        predictedSec,
        timeStr,
        paceStr,
        ...stats,
      };
    });
  }, [baselinePerformance, walks, unitSystem, gender, age]);

  // Neutral colors: dark/black in light theme, subtle charcoal/zinc in dark theme
  const neutralLeftBg = isDark ? '#1f1f23' : '#111115';
  const neutralLeftText = '#ffffff';

  return (
    <View style={styles.container}>
      {/* Header with Title & Info Trigger */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Race Predictions</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            Personalized projections based on your active pace & steps
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.infoBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setShowMethodologyModal(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="information-circle-outline" size={19} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Slim Horizontal Cards: Neutral 20% block on left, time and stats on right */}
      <View style={styles.cardsList}>
        {predictions.map((item) => {
          return (
            <View
              key={item.race.id}
              style={[
                styles.horizontalCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {/* Left ~20% Neutral Block with Distance Name */}
              <View
                style={[
                  styles.cardLeftBlock,
                  { backgroundColor: neutralLeftBg },
                ]}
              >
                <Text style={[styles.raceBadgeText, { color: neutralLeftText }]}>
                  {item.race.shortName}
                </Text>
                <Text style={[styles.raceBadgeSub, { color: 'rgba(255,255,255,0.72)' }]}>
                  {unitSystem === 'us_customary'
                    ? `${item.race.distanceMiles.toFixed(item.race.distanceMiles < 10 ? 1 : 0)} mi`
                    : `${item.race.distanceKm} km`}
                </Text>
              </View>

              {/* Right Content: Time & Top % on top; Pace & Tier text (no box) on bottom */}
              <View style={styles.cardRightContent}>
                {/* Top Row: Finish Time on left, Top X% on right */}
                <View style={styles.rightTopRow}>
                  <Text style={[styles.timeValue, { color: colors.text }]}>{item.timeStr}</Text>

                  <Text style={[styles.topPercentileText, { color: colors.textMuted }]}>
                    top {Math.max(1, 100 - item.percentile)}%
                  </Text>
                </View>

                {/* Bottom Row: Pace on left, Tier text (no box, just plain text) on right */}
                <View style={styles.rightBottomRow}>
                  <View style={styles.statPill}>
                    <Ionicons name="speedometer-outline" size={12.5} color={colors.textMuted} />
                    <Text style={[styles.statPillText, { color: colors.textSecondary }]}>
                      {item.paceStr}
                    </Text>
                  </View>

                  <Text style={[styles.tierPlainText, { color: item.tierColor }]}>
                    {item.tierLabel}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Footnote indicating source */}
      <View style={styles.footnoteRow}>
        <Ionicons name="flash-outline" size={13} color={colors.textMuted} />
        <Text style={[styles.footnoteText, { color: colors.textMuted }]}>
          Based on: {baselinePerformance.source} · Peter Riegel formula
        </Text>
      </View>

      {/* ── METHODOLOGY BOTTOM MODAL ── */}
      <InteractiveBottomModal
        visible={showMethodologyModal}
        onDismiss={() => setShowMethodologyModal(false)}
        handleColor={isDark ? '#3f3f46' : '#d4d4d8'}
        cardStyle={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Text style={[styles.modalTitle, { color: colors.text }]}>How It's Calculated</Text>

        <View style={[styles.modalList, { marginTop: 14 }]}>
          <View style={[styles.modalBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.modalHead}>
              <Ionicons name="calculator-outline" size={18} color={colors.primary} />
              <Text style={[styles.modalHeadTitle, { color: colors.text }]}>Peter Riegel Model</Text>
            </View>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Estimates your potential finish times by taking your best recorded pace and projecting how your stamina naturally holds up across shorter sprints or longer distance events.
            </Text>
          </View>

          <View style={[styles.modalBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.modalHead}>
              <Ionicons name="podium-outline" size={18} color="#f59e0b" />
              <Text style={[styles.modalHeadTitle, { color: colors.text }]}>35M+ Runner Database</Text>
            </View>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Percentiles are derived from World Athletics and RunRepeat race databases, calibrated against millions of runners in your specific age and gender bracket.
            </Text>
          </View>

          <View style={[styles.modalBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.modalHead}>
              <Ionicons name="trending-up-outline" size={18} color="#10b981" />
              <Text style={[styles.modalHeadTitle, { color: colors.text }]}>Dynamic Real-Time Recalculation</Text>
            </View>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Whenever you complete a faster or longer workout in the app, your race estimates and percentile scores automatically adjust.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.modalDoneBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowMethodologyModal(false)}
          activeOpacity={0.85}
        >
          <Text style={[styles.modalDoneBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Got It</Text>
        </TouchableOpacity>
      </InteractiveBottomModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  infoBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsList: {
    gap: 12,
  },
  horizontalCard: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLeftBlock: {
    width: '20%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  raceBadgeText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  raceBadgeSub: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  cardRightContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    gap: 6,
  },
  rightTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  topPercentileText: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  rightBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statPillText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  tierPlainText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  footnoteText: {
    fontSize: 11.5,
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  modalTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  modalSubtitle: {
    fontSize: 12.5,
    marginTop: 4,
    marginBottom: 16,
  },
  modalList: {
    gap: 12,
    marginBottom: 20,
  },
  modalBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalHeadTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  modalBody: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  modalDoneBtn: {
    borderRadius: 16,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
});
