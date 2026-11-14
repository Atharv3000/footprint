import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path as SvgPath, Rect as SvgRect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme, BRAND_ROUNDED_FONT_EXTRA, BRAND_ROUNDED_FONT } from '@/constants/ThemeContext';

export interface WaterPreset {
  id: string;
  name: string;
  ml: number;
  oz: number;
  shape: 'glass-sm' | 'glass-md' | 'mug' | 'bottle-sm' | 'bottle-md' | 'bottle-lg' | 'hydro' | 'jug' | 'gallon';
}

export const WATER_PRESETS: WaterPreset[] = [
  { id: 'glass_sm', name: 'Small Glass', ml: 200, oz: 6.8, shape: 'glass-sm' },
  { id: 'glass_md', name: 'Glass / Cup', ml: 250, oz: 8.5, shape: 'glass-md' },
  { id: 'mug', name: 'Coffee Mug', ml: 350, oz: 11.8, shape: 'mug' },
  { id: 'bottle_sm', name: 'Water Bottle', ml: 500, oz: 16.9, shape: 'bottle-sm' },
  { id: 'bottle_md', name: 'Sport Bottle', ml: 750, oz: 25.4, shape: 'bottle-md' },
  { id: 'bottle_lg', name: 'Large Bottle', ml: 1000, oz: 33.8, shape: 'bottle-lg' },
  { id: 'hydro', name: 'Hydro Flask', ml: 1200, oz: 40.6, shape: 'hydro' },
  { id: 'jug', name: 'Water Jug', ml: 1500, oz: 50.7, shape: 'jug' },
  { id: 'gallon', name: 'Full Gallon', ml: 3780, oz: 128, shape: 'gallon' },
];

/**
 * Relative-scale vessel icons:
 * Container height is fixed at 54px.
 * Small vessels (200ml) are noticeably shorter and narrower (~24x30)
 * Medium vessels (500ml-750ml) are mid-scale (~28x42)
 * Large bottles and jugs (1000ml-3780ml) utilize full height & width (~38x50 to ~46x50)
 */
function WaterVesselShape({
  shape,
  color,
}: {
  shape: WaterPreset['shape'];
  color: string;
}) {
  const waterColor = '#38bdf8';
  const outlineColor = color;

  switch (shape) {
    case 'glass-sm':
      // 200ml: Small, delicate tapered glass (22w x 28h)
      return (
        <Svg width={22} height={28} viewBox="0 0 22 28">
          <SvgPath
            d="M 4 2 L 18 2 L 15.5 25 L 6.5 25 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Raised water fill to ~85% full */}
          <SvgPath
            d="M 4.8 6 L 17.2 6 L 15 24 L 7 24 Z"
            fill={waterColor}
            opacity={0.88}
          />
        </Svg>
      );

    case 'glass-md':
      // 250ml: Standard tapered glass (24w x 34h)
      return (
        <Svg width={24} height={34} viewBox="0 0 24 34">
          <SvgPath
            d="M 3 2 L 21 2 L 18 31 L 6 31 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Raised water fill */}
          <SvgPath
            d="M 3.8 7 L 20.2 7 L 17.5 30 L 6.5 30 Z"
            fill={waterColor}
            opacity={0.88}
          />
        </Svg>
      );

    case 'mug':
      // 350ml: Stocky ceramic coffee mug with handle (32w x 30h)
      return (
        <Svg width={32} height={30} viewBox="0 0 32 30">
          {/* Mug Body */}
          <SvgPath
            d="M 4 4 L 22 4 L 22 25 C 22 27 20 28 18 28 L 8 28 C 6 28 4 27 4 25 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Raised Water Fill */}
          <SvgPath
            d="M 4.8 8 L 21.2 8 L 21.2 24.5 C 21.2 26.2 19.5 27.2 17.5 27.2 L 8.5 27.2 C 6.5 27.2 4.8 26.2 4.8 24.5 Z"
            fill={waterColor}
            opacity={0.88}
          />
          {/* Handle */}
          <SvgPath
            d="M 22 8 C 29 8 29 20 22 21"
            fill="none"
            stroke={outlineColor}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </Svg>
      );

    case 'bottle-sm':
      // 500ml: Sleek portable plastic/metal water bottle (24w x 40h)
      return (
        <Svg width={24} height={40} viewBox="0 0 24 40">
          <SvgRect x={9} y={1} width={6} height={4} rx={1} fill={outlineColor} />
          <SvgPath
            d="M 10 5 L 7 9 C 6 11 6 13 6 16 L 6 35 C 6 37 7.5 38.5 9.5 38.5 L 14.5 38.5 C 16.5 38.5 18 37 18 35 L 18 16 C 18 13 18 11 17 9 L 14 5 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          {/* Raised Water fill */}
          <SvgPath
            d="M 6.8 12 L 17.2 12 L 17.2 34.5 C 17.2 36.2 15.8 37.3 14 37.3 L 10 37.3 C 8.2 37.3 6.8 36.2 6.8 34.5 Z"
            fill={waterColor}
            opacity={0.88}
          />
        </Svg>
      );

    case 'bottle-md':
      // 750ml: Sport bottle with pull-spout and grip waist (27w x 45h)
      return (
        <Svg width={27} height={45} viewBox="0 0 27 45">
          <SvgRect x={11} y={1} width={5} height={3} rx={1} fill={outlineColor} />
          <SvgRect x={8} y={4} width={11} height={3} rx={1.5} fill={outlineColor} />
          <SvgPath
            d="M 9 7 C 6 9 5 12 5 16 C 5 20 7.5 22 7.5 25 C 7.5 28 5 30 5 35 L 5 40 C 5 42.5 7 43.5 9.5 43.5 L 17.5 43.5 C 20 43.5 22 42.5 22 40 L 22 35 C 22 30 19.5 28 19.5 25 C 19.5 22 22 20 22 16 C 22 12 21 9 18 7 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          {/* Raised Water fill */}
          <SvgPath
            d="M 6 13 C 6 17 7.5 21 7.5 25 C 7.5 28 5.8 30 5.8 35 L 5.8 39.5 C 5.8 41.5 7.8 42.5 10 42.5 L 17 42.5 C 19.2 42.5 21.2 41.5 21.2 39.5 L 21.2 35 C 21.2 30 19.5 28 19.5 25 C 19.5 21 21 17 21 13 Z"
            fill={waterColor}
            opacity={0.88}
          />
        </Svg>
      );

    case 'bottle-lg':
      // 1000ml: Tall, wide cylindrical 1-Liter bottle (29w x 49h)
      return (
        <Svg width={29} height={49} viewBox="0 0 29 49">
          <SvgRect x={10} y={1} width={9} height={4} rx={1.5} fill={outlineColor} />
          <SvgPath
            d="M 10 5 C 6 6 4 9 4 14 L 4 43 C 4 46 6.5 47.5 9.5 47.5 L 19.5 47.5 C 22.5 47.5 25 46 25 43 L 25 14 C 25 9 23 6 19 5 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Raised Water fill */}
          <SvgPath
            d="M 5 10 L 24 10 L 24 42.5 C 24 45 22 46.2 19 46.2 L 10 46.2 C 7 46.2 5 45 5 42.5 Z"
            fill={waterColor}
            opacity={0.88}
          />
        </Svg>
      );

    case 'hydro':
      // 1200ml: Wide-mouth hydro flask with loop handle cap (33w x 50h)
      return (
        <Svg width={33} height={50} viewBox="0 0 33 50">
          {/* Loop handle */}
          <SvgPath
            d="M 12 1 C 12 1 16.5 -0.8 21 1 C 22.2 2 22 5 22 5 L 11 5 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="1.8"
          />
          <SvgRect x={10} y={5} width={13} height={4} rx={1.5} fill={outlineColor} />
          {/* Wide insulated body */}
          <SvgPath
            d="M 10 9 C 5.5 10 4 13.5 4 18 L 4 44 C 4 47.5 6.5 48.5 10 48.5 L 23 48.5 C 26.5 48.5 29 47.5 29 44 L 29 18 C 29 13.5 27.5 10 23 9 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Raised Water fill */}
          <SvgPath
            d="M 4.8 12 L 28.2 12 L 28.2 43.5 C 28.2 46.2 26 47.2 22.5 47.2 L 10.5 47.2 C 7 47.2 4.8 46.2 4.8 43.5 Z"
            fill={waterColor}
            opacity={0.88}
          />
        </Svg>
      );

    case 'jug':
      // 1500ml: Distinctive jug with side loop handle (38w x 51h)
      return (
        <Svg width={38} height={51} viewBox="0 0 38 51">
          <SvgRect x={13} y={1} width={8} height={3.5} rx={1} fill={outlineColor} />
          {/* Jug body */}
          <SvgPath
            d="M 13 4.5 L 10 9.5 C 5.5 11 4 15 4 19 L 4 44 C 4 48 7 49.5 10.5 49.5 L 24.5 49.5 C 28 49.5 31 48 31 44 L 31 19 C 31 15 29.5 11 25 9.5 L 22 4.5 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Jug side handle */}
          <SvgPath
            d="M 31 16 C 37 17 37 32 31 34"
            fill="none"
            stroke={outlineColor}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Raised Water fill */}
          <SvgPath
            d="M 4.8 13 L 30.2 13 L 30.2 43.5 C 30.2 46.5 28 48.2 24 48.2 L 11 48.2 C 7 48.2 4.8 46.5 4.8 43.5 Z"
            fill={waterColor}
            opacity={0.88}
          />
        </Svg>
      );

    case 'gallon':
    default:
      // 3780ml: Big full gallon jug, widest and most substantial (44w x 52h)
      return (
        <Svg width={44} height={52} viewBox="0 0 44 52">
          <SvgRect x={14} y={1} width={10} height={4} rx={1.5} fill={outlineColor} />
          {/* Sloped shoulders with big gallon girth */}
          <SvgPath
            d="M 14 5 L 9 10 C 4.5 11.5 2 16 2 21 L 2 45 C 2 49 5.5 50.5 10 50.5 L 26 50.5 C 30.5 50.5 34 49 34 45 L 34 21 C 34 16 31.5 11.5 27 10 L 22 5 Z"
            fill="none"
            stroke={outlineColor}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {/* Sturdy side handle */}
          <SvgPath
            d="M 34 16 C 43 17 43 36 34 38"
            fill="none"
            stroke={outlineColor}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          {/* Raised Water fill */}
          <SvgPath
            d="M 3 14 L 33 14 L 33 44.5 C 33 47.8 30.2 49.2 25.5 49.2 L 10.5 49.2 C 5.8 49.2 3 47.8 3 44.5 Z"
            fill={waterColor}
            opacity={0.88}
          />
        </Svg>
      );
  }
}

interface WaterLoggingModalProps {
  visible: boolean;
  currentWaterMl: number;
  dailyGoalMl: number;
  onClose: () => void;
  onAddWater: (amountMl: number) => void;
}

export function WaterLoggingModal({
  visible,
  currentWaterMl,
  dailyGoalMl,
  onClose,
  onAddWater,
}: WaterLoggingModalProps) {
  const { colors, isDark } = useTheme();
  const [customMlInput, setCustomMlInput] = useState<string>('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  const handleSelectPreset = (preset: WaterPreset) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setSelectedPresetId(preset.id);
    onAddWater(preset.ml);
    setTimeout(() => {
      setSelectedPresetId(null);
      onClose();
    }, 200);
  };

  const handleLogCustom = () => {
    const val = parseInt(customMlInput.trim(), 10);
    if (!isNaN(val) && val > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onAddWater(val);
      setCustomMlInput('');
      onClose();
    }
  };

  const goalPercent = Math.min(100, Math.round((currentWaterMl / (dailyGoalMl || 2500)) * 100));

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalCard, { backgroundColor: colors.surfaceElevated }]}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.waterIconHeader}>
                    <Ionicons name="water" size={20} color="#38bdf8" />
                  </View>
                  <View>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Log Water</Text>
                    <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                      {currentWaterMl} ml logged ({goalPercent}% of daily goal)
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Progress bar with grey track for remainder that isn't done yet */}
              <View style={[styles.progressBarOuter, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : '#e2e8f0' }]}>
                <View style={[styles.progressBarFill, { width: `${goalPercent}%` }]} />
              </View>

              {/* Grid with 3 items per row, relative scale, borderless cards */}
              <ScrollView
                style={styles.gridScroll}
                contentContainerStyle={styles.gridContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.presetGrid}>
                  {WATER_PRESETS.map((preset) => {
                    const isSelected = selectedPresetId === preset.id;
                    return (
                      <TouchableOpacity
                        key={preset.id}
                        style={[
                          styles.presetCard,
                          {
                            backgroundColor: isSelected
                              ? 'rgba(56, 189, 248, 0.22)'
                              : colors.surfaceSecondary,
                          },
                        ]}
                        onPress={() => handleSelectPreset(preset)}
                        activeOpacity={0.75}
                      >
                        {/* Scaled Vessel Silhouette with high water line */}
                        <View style={styles.vesselWrap}>
                          <WaterVesselShape
                            shape={preset.shape}
                            color={isDark ? '#e4e4e7' : '#52525b'}
                          />
                        </View>

                        {/* Title & units: ml and oz */}
                        <Text style={[styles.presetName, { color: colors.text }]} numberOfLines={1}>
                          {preset.name}
                        </Text>
                        <Text style={styles.presetVolumeMl}>{preset.ml} ml</Text>
                        <Text style={[styles.presetVolumeOz, { color: colors.textMuted }]}>
                          {preset.oz} fl oz
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Amount Section */}
                <View style={styles.customWrap}>
                  <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>
                    CUSTOM AMOUNT
                  </Text>
                  <View style={styles.customRow}>
                    <View style={[styles.customInputWrap, { backgroundColor: colors.surfaceSecondary }]}>
                      <TextInput
                        style={[styles.customInput, { color: colors.text }]}
                        placeholder="e.g. 400"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        value={customMlInput}
                        onChangeText={setCustomMlInput}
                        returnKeyType="done"
                        onSubmitEditing={handleLogCustom}
                      />
                      <Text style={[styles.customInputUnit, { color: colors.textMuted }]}>ml</Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.customAddBtn,
                        {
                          backgroundColor:
                            customMlInput.trim().length > 0 ? '#38bdf8' : colors.surfaceSecondary,
                          opacity: customMlInput.trim().length > 0 ? 1 : 0.6,
                        },
                      ]}
                      onPress={handleLogCustom}
                      disabled={!customMlInput.trim()}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="add"
                        size={18}
                        color={customMlInput.trim().length > 0 ? '#000000' : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.customAddBtnText,
                          {
                            color:
                              customMlInput.trim().length > 0 ? '#000000' : colors.textMuted,
                          },
                        ]}
                      >
                        Add
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 24,
    borderWidth: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  waterIconHeader: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarOuter: {
    height: 5,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  gridScroll: {
    maxHeight: 520,
  },
  gridContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 22,
    gap: 12,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  /* 3 in a row layout */
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  presetCard: {
    width: '31.5%',
    borderRadius: 16,
    borderWidth: 0, // No borders on items
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  vesselWrap: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  presetName: {
    fontFamily: BRAND_ROUNDED_FONT,
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  presetVolumeMl: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  presetVolumeOz: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  customWrap: {
    marginTop: 8,
    gap: 10,
  },
  customRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  customInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 0,
    paddingHorizontal: 14,
    height: 46,
  },
  customInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
  },
  customInputUnit: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  customAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 18,
    height: 46,
    borderRadius: 14,
  },
  customAddBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
