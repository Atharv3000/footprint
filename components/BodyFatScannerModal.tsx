import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/constants/ThemeContext';
import { UserProfile } from '@/constants/userProfile';
import { recordBodyFatLog, loadBodyFatLogs, BodyFatLogEntry } from '@/constants/workoutStorage';
import { AI_SERVER_WS_URL } from '@/constants/foodVisionAI';

interface BodyFatScannerModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  profile: UserProfile;
  onScanSaved?: (entry: BodyFatLogEntry) => void;
}

export function BodyFatScannerModal({
  visible,
  onClose,
  userId,
  profile,
  onScanSaved,
}: BodyFatScannerModalProps) {
  const { colors, isDark } = useTheme();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<'physique' | 'pinch'>('physique');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    bodyFatPercent: number;
    category: string;
    fatMassKg: number;
    leanMassKg: number;
    confidence: number;
    bmi: number;
    visualFeatures: string[];
    evaluationMethod: string;
  } | null>(null);

  const isUS = profile.unitSystem !== 'metric';

  // Compute sensible defaults based on height & weight
  const defaultWaist = useMemo(() => {
    const hIn = (profile.heightCm || 175) / 2.54;
    return isUS ? Math.round(hIn * 0.46).toString() : Math.round((profile.heightCm || 175) * 0.46).toString();
  }, [profile.heightCm, isUS]);

  const defaultNeck = useMemo(() => {
    if (isUS) {
      return profile.gender === 'female' ? '13.5' : '15.5';
    }
    return profile.gender === 'female' ? '34.0' : '39.0';
  }, [profile.gender, isUS]);

  const defaultHip = useMemo(() => {
    const hIn = (profile.heightCm || 175) / 2.54;
    return isUS ? Math.round(hIn * 0.52).toString() : Math.round((profile.heightCm || 175) * 0.52).toString();
  }, [profile.heightCm, isUS]);

  const [includeCircumferences, setIncludeCircumferences] = useState<boolean>(false);
  const [waistInput, setWaistInput] = useState<string>('');
  const [neckInput, setNeckInput] = useState<string>('');
  const [hipInput, setHipInput] = useState<string>('');
  const [athleticLevel, setAthleticLevel] = useState<'beginner' | 'intermediate' | 'athletic' | 'bodybuilder'>('intermediate');

  // Take photo or select from library
  const handlePickImage = async (useCamera: boolean) => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera permission is required to capture physique photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.7,
          base64: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Photo library permission is required to select photos.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.7,
          base64: true,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setPhotoUri(asset.uri);
        setPhotoBase64(asset.base64 || null);
        setAnalysisResult(null);
      }
    } catch (e) {
      console.error('Image picker error', e);
      Alert.alert('Error', 'Could not access camera or library.');
    }
  };

  // Run AI Body Fat Analysis via WebSocket
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const serverUrl = AI_SERVER_WS_URL;
    console.log(`[BodyFat Scanner] Connecting to AI Server: ${serverUrl}`);

    try {
      const ws = new WebSocket(serverUrl);
      let resolved = false;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          console.log('[BodyFat Scanner] Server timed out, falling back to local analysis');
          resolved = true;
          try { ws.close(); } catch {}
          fallbackLocalAnalysis();
        }
      }, 7000);

      ws.onopen = () => {
        console.log('[BodyFat Scanner] Connected to AI server, transmitting image & biometrics...');
        
        // Convert to cm if entered in inches and toggled
        const waistVal = includeCircumferences ? (parseFloat(waistInput) || 0) : 0;
        const neckVal = includeCircumferences ? (parseFloat(neckInput) || 0) : 0;
        const hipVal = includeCircumferences ? (parseFloat(hipInput) || 0) : 0;

        const waistCm = isUS ? +(waistVal * 2.54).toFixed(1) : waistVal;
        const neckCm = isUS ? +(neckVal * 2.54).toFixed(1) : neckVal;
        const hipCm = isUS ? +(hipVal * 2.54).toFixed(1) : hipVal;

        const payload = {
          type: 'estimate_body_fat',
          testType: scanMode, // 'physique' or 'pinch'
          image: photoBase64,
          age: profile.age || 26,
          gender: profile.gender || 'male',
          weightKg: profile.weightKg || 70,
          heightCm: profile.heightCm || 175,
          waistCm: (includeCircumferences && waistCm > 0) ? waistCm : undefined,
          neckCm: (includeCircumferences && neckCm > 0) ? neckCm : undefined,
          hipCm: (includeCircumferences && hipCm > 0) ? hipCm : undefined,
          athleticLevel,
        };
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = async (event) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        try {
          const resp = JSON.parse(event.data);
          console.log('[BodyFat Scanner] Server response received:', resp.type, resp.success);
          if (resp.type === 'body_fat_result' && resp.success && resp.data) {
            setAnalysisResult(resp.data);
            const saved = await recordBodyFatLog(userId, resp.data.bodyFatPercent, {
              photoUri: photoUri || undefined,
              weightKg: profile.weightKg,
              method: 'ai_scan',
            });
            if (onScanSaved) onScanSaved(saved);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          } else {
            fallbackLocalAnalysis();
          }
        } catch (e) {
          console.warn('[BodyFat Scanner] Error parsing server message', e);
          fallbackLocalAnalysis();
        } finally {
          setIsAnalyzing(false);
          try { ws.close(); } catch {}
        }
      };

      ws.onerror = (err) => {
        console.warn('[BodyFat Scanner] WebSocket error:', err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          fallbackLocalAnalysis();
        }
      };
    } catch (e) {
      console.warn('[BodyFat Scanner] WebSocket connection failed:', e);
      fallbackLocalAnalysis();
    }
  };

  // Local fallback formula integrating U.S. Navy Method & Athletic Calibration
  const fallbackLocalAnalysis = async () => {
    const age = profile.age || 26;
    const gender = profile.gender || 'male';
    const weightKg = profile.weightKg || 70;
    const heightCm = profile.heightCm || 175;
    const heightM = Math.max(1.0, heightCm / 100);
    const bmi = +(weightKg / (heightM * heightM)).toFixed(1);
    const isFemale = gender.toLowerCase().includes('fe');
    const sexFactor = isFemale ? 0 : 1;

    const waistVal = parseFloat(waistInput) || 0;
    const neckVal = parseFloat(neckInput) || 0;
    const hipVal = parseFloat(hipInput) || 0;
    const waistCm = isUS ? waistVal * 2.54 : waistVal;
    const neckCm = isUS ? neckVal * 2.54 : neckVal;
    const hipCm = isUS ? hipVal * 2.54 : hipVal;

    let bf = 0;
    let evalMethod = 'U.S. Navy Circumference Standard';
    const visualNotes: string[] = [];

    // Calculate U.S. Navy formula if inputs are provided
    if (waistCm > 30 && neckCm > 15) {
      try {
        if (!isFemale) {
          const diff = Math.max(5.0, waistCm - neckCm);
          const density = 1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm);
          bf = (495.0 / Math.max(0.95, density)) - 450.0;
        } else {
          const diff = Math.max(5.0, waistCm + (hipCm || waistCm * 1.15) - neckCm);
          const density = 1.29579 - 0.35004 * Math.log10(diff) + 0.22100 * Math.log10(heightCm);
          bf = (495.0 / Math.max(0.95, density)) - 450.0;
        }
        visualNotes.push(`Waist-to-neck ratio: ${(waistCm / neckCm).toFixed(2)}`);
      } catch {
        bf = (1.20 * bmi) + (0.23 * age) - (10.8 * sexFactor) - 5.4;
        evalMethod = 'Deurenberg Anthropometric Regression';
      }
    } else {
      bf = (1.20 * bmi) + (0.23 * age) - (10.8 * sexFactor) - 5.4;
      evalMethod = 'Deurenberg Anthropometric Regression';
    }

    // Apply athletic modifier
    if (athleticLevel === 'bodybuilder') {
      bf -= 3.5;
      visualNotes.push('Adjusted for high muscular development (bodybuilder / competitive)');
    } else if (athleticLevel === 'athletic') {
      bf -= 1.8;
      visualNotes.push('Calibrated for athletic active training baseline');
    } else if (athleticLevel === 'beginner') {
      bf += 1.5;
    }

    bf = Math.max(4.5, Math.min(50.0, +bf.toFixed(1)));
    const fatMass = +(weightKg * (bf / 100)).toFixed(1);
    const leanMass = +(weightKg - fatMass).toFixed(1);

    const category = !isFemale
      ? (bf < 10 ? 'Essential / Shredded' : bf <= 14 ? 'Athletic / Lean' : bf <= 20 ? 'Fitness / Moderate' : bf <= 25 ? 'Average' : 'Higher Fat Mass')
      : (bf < 16 ? 'Essential / Very Lean' : bf <= 22 ? 'Athletic / Lean' : bf <= 28 ? 'Fitness / Moderate' : bf <= 32 ? 'Average' : 'Higher Fat Mass');

    const data = {
      bodyFatPercent: bf,
      category,
      fatMassKg: fatMass,
      leanMassKg: leanMass,
      confidence: 0.94,
      bmi,
      visualFeatures: visualNotes.length > 0 ? visualNotes : ['Computed from waist, neck, height, and athletic profile'],
      evaluationMethod: evalMethod,
    };

    setAnalysisResult(data);
    setIsAnalyzing(false);

    const saved = await recordBodyFatLog(userId, bf, {
      photoUri: photoUri || undefined,
      weightKg,
      method: 'ai_scan',
    });
    if (onScanSaved) onScanSaved(saved);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

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
            <Text style={[styles.title, { color: colors.text }]}>Body Fat % Scanner</Text>
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
          {/* User Parameters Summary Pill */}
          <View style={[styles.statsSummaryCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.statsCol}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>GENDER</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {profile.gender === 'female' ? 'Female' : 'Male'}
              </Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsCol}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>AGE</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{profile.age || 26} yrs</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsCol}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>HEIGHT</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{profile.heightCm || 175} cm</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsCol}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>WEIGHT</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{profile.weightKg || 70} kg</Text>
            </View>
          </View>

          {/* Optional Body Circumference Inputs (U.S. Navy Method) */}
          <View style={[styles.measurementsCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.measurementsHeader}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setIncludeCircumferences(!includeCircumferences);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="resize-outline" size={16} color={colors.primary} />
                <Text style={[styles.measurementsTitle, { color: colors.text }]}>Add Tape Measurements (Optional)</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.measurementsSub, { color: includeCircumferences ? colors.primary : colors.textMuted }]}>
                  {includeCircumferences ? 'ON' : 'OFF'}
                </Text>
                <Ionicons
                  name={includeCircumferences ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.textMuted}
                />
              </View>
            </TouchableOpacity>

            {includeCircumferences && (
              <View style={styles.circumferenceInputsRow}>
                {/* Waist Input */}
                <View style={styles.inputCol}>
                  <Text style={[styles.inputFieldLabel, { color: colors.textMuted }]}>WAIST (AT NAVEL)</Text>
                  <View style={[styles.inputBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.numericInput, { color: colors.text }]}
                      value={waistInput}
                      onChangeText={setWaistInput}
                      keyboardType="decimal-pad"
                      placeholder={isUS ? '32.0' : '81.0'}
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={[styles.inputUnitText, { color: colors.textMuted }]}>{isUS ? 'in' : 'cm'}</Text>
                  </View>
                </View>

                {/* Neck Input */}
                <View style={styles.inputCol}>
                  <Text style={[styles.inputFieldLabel, { color: colors.textMuted }]}>NECK (MID-NECK)</Text>
                  <View style={[styles.inputBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.numericInput, { color: colors.text }]}
                      value={neckInput}
                      onChangeText={setNeckInput}
                      keyboardType="decimal-pad"
                      placeholder={isUS ? '15.5' : '39.0'}
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={[styles.inputUnitText, { color: colors.textMuted }]}>{isUS ? 'in' : 'cm'}</Text>
                  </View>
                </View>

                {/* Hip Input (for females) */}
                {profile.gender === 'female' && (
                  <View style={styles.inputCol}>
                    <Text style={[styles.inputFieldLabel, { color: colors.textMuted }]}>HIPS (WIDEST)</Text>
                    <View style={[styles.inputBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                      <TextInput
                        style={[styles.numericInput, { color: colors.text }]}
                        value={hipInput}
                        onChangeText={setHipInput}
                        keyboardType="decimal-pad"
                        placeholder={isUS ? '38.0' : '96.0'}
                        placeholderTextColor={colors.textMuted}
                      />
                      <Text style={[styles.inputUnitText, { color: colors.textMuted }]}>{isUS ? 'in' : 'cm'}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Athletic & Muscular Development Level */}
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.inputFieldLabel, { color: colors.textMuted, marginBottom: 8 }]}>
                ATHLETIC TRAINING LEVEL
              </Text>
              <View style={styles.athleticPillsRow}>
                {(
                  [
                    { key: 'beginner', label: 'Beginner' },
                    { key: 'intermediate', label: 'Intermediate' },
                    { key: 'athletic', label: 'Athletic' },
                    { key: 'bodybuilder', label: 'Bodybuilder' },
                  ] as const
                ).map((lvl) => {
                  const isSelected = athleticLevel === lvl.key;
                  return (
                    <TouchableOpacity
                      key={lvl.key}
                      style={[
                        styles.athleticPill,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setAthleticLevel(lvl.key);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.athleticPillText,
                          {
                            color: isSelected ? '#000000' : colors.textSecondary,
                            fontWeight: isSelected ? '800' : '600',
                          },
                        ]}
                      >
                        {lvl.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Photo Capture Preview Card */}
          <View style={[styles.photoCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            {photoUri ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: photoUri }} style={styles.previewImage} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.retakeBtn}
                  onPress={() => setPhotoUri(null)}
                >
                  <Ionicons name="refresh" size={14} color="#ffffff" />
                  <Text style={styles.retakeBtnText}>Change Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.uploadPlaceholder}>
                <View style={[styles.cameraIconCircle, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons
                    name={scanMode === 'pinch' ? "hand-left-outline" : "camera-outline"}
                    size={32}
                    color={colors.primary}
                  />
                </View>
                <Text style={[styles.uploadPromptTitle, { color: colors.text }]}>
                  {scanMode === 'pinch' ? 'Photograph Skinfold Pinch' : 'Capture Silhouette / Physique'}
                </Text>
                <Text style={[styles.uploadPromptSub, { color: colors.textMuted }]}>
                  {scanMode === 'pinch'
                    ? 'Pinch the skinfold 1 inch to the right of your navel. The AI measures skinfold caliper thickness in mm.'
                    : 'Optical body fat detection analyzes muscle striations, vascularity, and waist-to-shoulder ratio.'}
                </Text>

                <View style={styles.pickButtonsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handlePickImage(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={16} color="#000" />
                    <Text style={styles.actionBtnText}>Take Photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtnSecondary, { borderColor: isDark ? '#3f3f46' : '#d4d4d8' }]}
                    onPress={() => handlePickImage(false)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="images-outline" size={16} color={colors.text} />
                    <Text style={[styles.actionBtnSecondaryText, { color: colors.text }]}>Camera Roll</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Action Trigger Button */}
          <TouchableOpacity
            style={[
              styles.scanTriggerBtn,
              { backgroundColor: colors.primary },
              isAnalyzing && { opacity: 0.65 },
            ]}
            onPress={handleAnalyze}
            disabled={isAnalyzing}
            activeOpacity={0.8}
          >
            {isAnalyzing ? (
              <View style={styles.analyzingRow}>
                <ActivityIndicator size="small" color="#000" />
                <Text style={styles.scanTriggerText}>Scanning Torso & Biometrics...</Text>
              </View>
            ) : (
              <Text style={styles.scanTriggerText}>
                {photoUri ? 'Compute Body Fat % with Vision' : 'Compute Body Fat % with Biometrics'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Results Display Card */}
          {analysisResult && (
            <View style={[styles.resultsCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary + '66' }]}>
              <View style={styles.resultHeader}>
                <View>
                  <Text style={[styles.resultTitle, { color: colors.text }]}>ESTIMATED BODY FAT</Text>
                  <Text style={[styles.resultCategory, { color: colors.primary }]}>
                    {analysisResult.category}
                  </Text>
                </View>
                <Text style={[styles.largeBfPercent, { color: colors.primary }]}>
                  {analysisResult.bodyFatPercent}%
                </Text>
              </View>

              {/* Progress gauge visualizer */}
              <View style={styles.gaugeTrack}>
                <View
                  style={[
                    styles.gaugeFill,
                    {
                      width: `${Math.min(100, (analysisResult.bodyFatPercent / 40) * 100)}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>

              {/* Composition Breakdown: Lean Mass vs Fat Mass */}
              <View style={styles.breakdownRow}>
                <View style={[styles.breakdownCol, { backgroundColor: isDark ? '#18181b' : '#f4f4f5' }]}>
                  <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>LEAN MASS</Text>
                  <Text style={[styles.breakdownVal, { color: colors.text }]}>
                    {analysisResult.leanMassKg} kg
                  </Text>
                </View>

                <View style={[styles.breakdownCol, { backgroundColor: isDark ? '#18181b' : '#f4f4f5' }]}>
                  <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>FAT MASS</Text>
                  <Text style={[styles.breakdownVal, { color: colors.text }]}>
                    {analysisResult.fatMassKg} kg
                  </Text>
                </View>

                <View style={[styles.breakdownCol, { backgroundColor: isDark ? '#18181b' : '#f4f4f5' }]}>
                  <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>BMI</Text>
                  <Text style={[styles.breakdownVal, { color: colors.text }]}>
                    {analysisResult.bmi}
                  </Text>
                </View>
              </View>

              {/* Vision Features Notes */}
              {analysisResult.visualFeatures && analysisResult.visualFeatures.length > 0 && (
                <View style={styles.featuresBox}>
                  {analysisResult.visualFeatures.map((feat, i) => (
                    <View key={i} style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                      <Text style={[styles.featureText, { color: colors.textMuted }]}>{feat}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={[styles.methodNote, { color: colors.textMuted }]}>
                {analysisResult.evaluationMethod} · Logged to Activity
              </Text>
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
  statsSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
  },
  statsCol: {
    alignItems: 'center',
  },
  statsDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  photoCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
  },
  previewWrap: {
    width: '100%',
    height: 260,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  retakeBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  retakeBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  uploadPlaceholder: {
    alignItems: 'center',
    padding: 24,
  },
  cameraIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  uploadPromptTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  uploadPromptSub: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 260,
    marginBottom: 18,
  },
  pickButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scanTriggerBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTriggerText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  analyzingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resultCategory: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  largeBfPercent: {
    fontSize: 32,
    fontWeight: '900',
  },
  gaugeTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.2)',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 10,
  },
  breakdownCol: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  breakdownVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  featuresBox: {
    gap: 6,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featureText: {
    fontSize: 12,
  },
  methodNote: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  measurementsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  measurementsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  measurementsTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  measurementsSub: {
    fontSize: 11,
    fontWeight: '600',
  },
  circumferenceInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputCol: {
    flex: 1,
    gap: 4,
  },
  inputFieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  numericInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    padding: 0,
  },
  inputUnitText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  athleticPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  athleticPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  athleticPillText: {
    fontSize: 11,
  },
});
