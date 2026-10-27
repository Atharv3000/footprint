import React, { useState, useEffect, useMemo } from 'react';
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
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { loadWalks, WalkRecord } from '@/constants/walkStorage';
import {
  RACE_DISTANCES,
  RaceDistanceDef,
  predictRaceTimeSeconds,
  formatRaceTime,
  formatPace,
  calculateRacePercentile,
} from '@/constants/racePredictionsEngine';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';

interface RacePredictorCardProps {
  userId?: string;
  unitSystem?: 'us_customary' | 'metric';
  gender?: 'male' | 'female' | 'na';
  age?: number;
}

export function RacePredictorCard({
  userId,
  unitSystem = 'us_customary',
  gender = 'na',
  age = 28,
}: RacePredictorCardProps) {
  const { colors, isDark } = useTheme();

  const [walks, setWalks] = useState<WalkRecord[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<string>('5k');
  const [showMethodologyModal, setShowMethodologyModal] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) return;
    loadWalks(userId).then((records) => {
      setWalks(records);
    });
  }, [userId]);

  // Find user's best recorded effort to base predictions on
  // Priority: Best running session > fastest walk/run over 1km > fallback reasonable pace
  const baselinePerformance = useMemo(() => {
    if (!walks || walks.length === 0) {
      // Default baseline: 3km at 6:00/km (18:00)
      return {
        distanceKm: 3.0,
        durationSeconds: 18 * 60,
        paceSecondsPerKm: 360,
        source: 'Standard Baseline (Estimate)',
        activityName: 'Initial Model Pace',
      };
    }

    // Filter running or walking workouts with valid distance >= 0.5km and duration >= 2 mins
    const valid = walks.filter(
      (w) => (w.distanceMeters || 0) >= 500 && (w.durationSeconds || 0) >= 120
    );

    if (valid.length === 0) {
      return {
        distanceKm: 3.0,
        durationSeconds: 18 * 60,
        paceSecondsPerKm: 360,
        source: 'Estimated Benchmark',
        activityName: 'Base Estimate',
      };
    }

    // Find fastest pace workout (prioritize run)
    let bestRecord: WalkRecord = valid[0];
    let bestPace = (bestRecord.durationSeconds || 0) / ((bestRecord.distanceMeters || 1) / 1000);

    for (const w of valid) {
      const pace = (w.durationSeconds || 0) / ((w.distanceMeters || 1) / 1000);
      const isRun = w.activityType === 'run' || (w.label || '').toLowerCase().includes('run');
      const curBestIsRun = bestRecord.activityType === 'run' || (bestRecord.label || '').toLowerCase().includes('run');

      // Strongly favor run records, or faster paces if same category
      if ((isRun && !curBestIsRun) || (isRun === curBestIsRun && pace < bestPace)) {
        bestRecord = w;
        bestPace = pace;
      }
    }

    const distKm = (bestRecord.distanceMeters || 1000) / 1000;
    const longestKm = Math.max(...valid.map((w) => (w.distanceMeters || 0) / 1000), 5.0);
    const actType = (bestRecord.activityType || 'run') as 'walk' | 'run' | 'cycle';

    return {
      distanceKm: distKm,
      durationSeconds: bestRecord.durationSeconds || 600,
      paceSecondsPerKm: bestPace,
      activityType: actType,
      longestRecentWorkoutKm: longestKm,
      source: `Best Effort (${bestRecord.label || 'Workout'})`,
      activityName: bestRecord.label,
    };
  }, [walks]);

  // Compute predictions for all race distances with adapted scaling
  const predictions = useMemo(() => {
    return RACE_DISTANCES.map((race) => {
      const predictedSec = predictRaceTimeSeconds(
        baselinePerformance.distanceKm,
        baselinePerformance.durationSeconds,
        race.distanceKm,
        baselinePerformance.activityType || 'run',
        baselinePerformance.longestRecentWorkoutKm || 5.0
      );

      const paceStr = formatPace(predictedSec, race.distanceKm, unitSystem);
      const timeStr = formatRaceTime(predictedSec);
      const stats = calculateRacePercentile(predictedSec, race.distanceKm, gender, age, race.id);

      return {
        race,
        predictedSec,
        timeStr,
        paceStr,
        ...stats,
      };
    });
  }, [baselinePerformance, unitSystem, gender, age]);

  const activePrediction = predictions.find((p) => p.race.id === selectedRaceId) || predictions[1]; // default 5k

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header with Title & Methodology Info Trigger */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.headerTitleGroup}>
          <View style={[styles.badgeIconBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="speedometer-outline" size={17} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Race Predictions</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
              Estimated finish times & peer percentile rank
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.infoBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setShowMethodologyModal(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Race Distance Selector Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.raceSelectorScroll}
      >
        {RACE_DISTANCES.map((race) => {
          const isSelected = race.id === selectedRaceId;
          return (
            <TouchableOpacity
              key={race.id}
              style={[
                styles.racePill,
                { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                isSelected && {
                  backgroundColor: isDark ? '#ffffff' : '#000000',
                  borderColor: isDark ? '#ffffff' : '#000000',
                },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSelectedRaceId(race.id);
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.racePillText,
                  { color: isSelected ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary },
                  isSelected && { fontWeight: '800' },
                ]}
              >
                {race.shortName}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Hero Showcase for Selected Distance */}
      <View style={[styles.heroBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={[styles.heroDistanceName, { color: colors.text }]}>
              {activePrediction.race.name}
            </Text>
            <Text style={[styles.heroDistanceDesc, { color: colors.textMuted }]}>
              {unitSystem === 'us_customary'
                ? `${activePrediction.race.distanceMiles.toFixed(2)} miles`
                : `${activePrediction.race.distanceKm} km`} · {activePrediction.race.description}
            </Text>
          </View>

          <View style={[styles.tierTag, { backgroundColor: `${activePrediction.tierColor}18`, borderColor: activePrediction.tierColor }]}>
            <Text style={[styles.tierTagText, { color: activePrediction.tierColor }]}>
              {activePrediction.tierLabel}
            </Text>
          </View>
        </View>

        {/* Big Time Display & Target Pace */}
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStatBlock}>
            <Text style={[styles.heroTimeValue, { color: colors.text }]}>
              {activePrediction.timeStr}
            </Text>
            <Text style={[styles.heroStatSub, { color: colors.textMuted }]}>
              PREDICTED TIME
            </Text>
          </View>

          <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />

          <View style={styles.heroStatBlock}>
            <Text style={[styles.heroPaceValue, { color: colors.primary }]}>
              {activePrediction.paceStr}
            </Text>
            <Text style={[styles.heroStatSub, { color: colors.textMuted }]}>
              TARGET AVG PACE
            </Text>
          </View>
        </View>

        {/* Percentile Ranking Bar */}
        <View style={[styles.percentileSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.percentileHeaderRow}>
            <View style={styles.percentileRankBadge}>
              <Ionicons name="trophy" size={14} color="#f59e0b" />
              <Text style={[styles.percentileRankText, { color: colors.text }]}>
                Top {100 - activePrediction.percentile}% Finisher
              </Text>
            </View>
            <Text style={[styles.percentileNum, { color: colors.primary }]}>
              {activePrediction.percentile}th Percentile
            </Text>
          </View>

          {/* Progress Bar with Color Track */}
          <View style={[styles.progressTrack, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${activePrediction.percentile}%`,
                  backgroundColor: activePrediction.tierColor,
                },
              ]}
            />
          </View>

          <Text style={[styles.percentileExplanation, { color: colors.textMuted }]}>
            Faster than {activePrediction.percentile}% of runners in your age & gender demographic.
          </Text>
        </View>
      </View>

      {/* Grid of Other Distances Quick Comparison */}
      <View style={styles.quickGrid}>
        {predictions.map((item) => {
          const isCurrent = item.race.id === selectedRaceId;
          return (
            <TouchableOpacity
              key={item.race.id}
              style={[
                styles.quickGridCell,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                isCurrent && { borderColor: colors.primary, borderWidth: 1.5 },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSelectedRaceId(item.race.id);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.quickGridTop}>
                <Text style={[styles.quickGridDistance, { color: isCurrent ? colors.primary : colors.text }]}>
                  {item.race.shortName}
                </Text>
                <Text style={[styles.quickGridPercentile, { color: item.tierColor }]}>
                  {item.percentile}%
                </Text>
              </View>
              <Text style={[styles.quickGridTime, { color: colors.text }]}>{item.timeStr}</Text>
              <Text style={[styles.quickGridPace, { color: colors.textMuted }]}>{item.paceStr}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Footnote on source */}
      <View style={styles.baselineFootnoteRow}>
        <Ionicons name="flash-outline" size={13} color={colors.textMuted} />
        <Text style={[styles.baselineFootnote, { color: colors.textMuted }]}>
          Derived from: {baselinePerformance.source}
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

        <View style={[styles.modalContentList, { marginTop: 14 }]}>
          <View style={[styles.modalInfoBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.modalInfoHead}>
              <Ionicons name="calculator-outline" size={18} color={colors.primary} />
              <Text style={[styles.modalInfoTitle, { color: colors.text }]}>Peter Riegel Formula</Text>
            </View>
            <Text style={[styles.modalInfoBody, { color: colors.textSecondary }]}>
              Estimates your potential finish times by taking your best recorded pace and projecting how your stamina naturally holds up across shorter sprints or longer distance events.
            </Text>
          </View>

          <View style={[styles.modalInfoBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.modalInfoHead}>
              <Ionicons name="podium-outline" size={18} color="#f59e0b" />
              <Text style={[styles.modalInfoTitle, { color: colors.text }]}>Demographic Percentiles</Text>
            </View>
            <Text style={[styles.modalInfoBody, { color: colors.textSecondary }]}>
              Percentiles are calibrated against 35+ million recorded road race finishing times (World Athletics & RunRepeat database) adjusted for your gender and age curve.
            </Text>
          </View>

          <View style={[styles.modalInfoBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.modalInfoHead}>
              <Ionicons name="bar-chart-outline" size={18} color="#10b981" />
              <Text style={[styles.modalInfoTitle, { color: colors.text }]}>Dynamic Progression</Text>
            </View>
            <Text style={[styles.modalInfoBody, { color: colors.textSecondary }]}>
              As you record faster runs or longer distances on the Track tab, your predicted finishing times and percentiles automatically adapt in real-time.
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
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  badgeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 11.5,
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
  raceSelectorScroll: {
    gap: 7,
    paddingVertical: 2,
  },
  racePill: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  racePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  heroBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroDistanceName: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  heroDistanceDesc: {
    fontSize: 11.5,
    marginTop: 2,
  },
  tierTag: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  tierTagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  heroStatBlock: {
    alignItems: 'center',
  },
  heroTimeValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heroPaceValue: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroStatSub: {
    fontSize: 9.5,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 1,
  },
  heroDivider: {
    width: 1,
    height: 34,
  },
  percentileSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  percentileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  percentileRankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  percentileRankText: {
    fontSize: 13,
    fontWeight: '700',
  },
  percentileNum: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressTrack: {
    height: 7,
    borderRadius: 3.5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3.5,
  },
  percentileExplanation: {
    fontSize: 11,
    lineHeight: 15,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickGridCell: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 11,
  },
  quickGridTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  quickGridDistance: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  quickGridPercentile: {
    fontSize: 11,
    fontWeight: '800',
  },
  quickGridTime: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  quickGridPace: {
    fontSize: 10.5,
    marginTop: 2,
  },
  baselineFootnoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 2,
  },
  baselineFootnote: {
    fontSize: 11,
    flex: 1,
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
  modalContentList: {
    gap: 12,
    marginBottom: 20,
  },
  modalInfoBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  modalInfoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalInfoTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  modalInfoBody: {
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
