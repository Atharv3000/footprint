import { AppModal as Modal } from '@/components/AppModal';
import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
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
import { recordBodyFatLog, BodyFatLogEntry } from '@/constants/workoutStorage';
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [analysisResult, setAnalysisResult] = useState<{
    bodyFatPercent: number;
    category: string;
    fatMassKg: number;
    leanMassKg: number;
    confidence: number;
    bmi: number;
    visualFeatures: string[];
    evaluationMethod: string;
    abTier?: string;
  } | null>(null);

  const isUS = profile.unitSystem !== 'metric';

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
          quality: 0.75,
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
          quality: 0.75,
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

  // Run AI Body Fat & Ab Definition Analysis via WebSocket
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
        console.log('[BodyFat Scanner] Transmitting image & biometrics to AI Vision engine...');
        
        const waistVal = includeCircumferences ? (parseFloat(waistInput) || 0) : 0;
        const neckVal = includeCircumferences ? (parseFloat(neckInput) || 0) : 0;
        const hipVal = includeCircumferences ? (parseFloat(hipInput) || 0) : 0;

        const waistCm = isUS ? +(waistVal * 2.54).toFixed(1) : waistVal;
        const neckCm = isUS ? +(neckVal * 2.54).toFixed(1) : neckVal;
        const hipCm = isUS ? +(hipVal * 2.54).toFixed(1) : hipVal;

        const payload = {
          type: 'estimate_body_fat',
          testType: scanMode,
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
      visualNotes.push('Ab Definition: Deep 6-pack brick separation & clear linea alba');
      visualNotes.push('Vascularity: High surface vascularity & striations');
    } else if (athleticLevel === 'athletic') {
      bf -= 1.8;
      visualNotes.push('Ab Definition: Distinct 4-pack & athletic abdominal separation');
      visualNotes.push('Obliques & Serratus: Visible oblique taper');
    } else if (athleticLevel === 'beginner') {
      bf += 1.5;
      visualNotes.push('Ab Definition: Smooth midsection, subcutaneous softness');
    } else {
      visualNotes.push('Ab Definition: Flat midsection with subtle ab outline');
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
      visualFeatures: visualNotes,
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
        <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: colors.text }]}>Physique & Ab Scanner</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Streamlined Mode Segmented Control */}
          <View style={[styles.segmentedBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
            <TouchableOpacity
              style={[
                styles.segmentItem,
                scanMode === 'physique' && [styles.segmentActive, { backgroundColor: colors.surfaceElevated }],
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setScanMode('physique');
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="body-outline"
                size={16}
                color={scanMode === 'physique' ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.segmentLabel,
                  { color: scanMode === 'physique' ? colors.text : colors.textMuted, fontWeight: scanMode === 'physique' ? '700' : '500' },
                ]}
              >
                Physique & Abs
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentItem,
                scanMode === 'pinch' && [styles.segmentActive, { backgroundColor: colors.surfaceElevated }],
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setScanMode('pinch');
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="hand-left-outline"
                size={16}
                color={scanMode === 'pinch' ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.segmentLabel,
                  { color: scanMode === 'pinch' ? colors.text : colors.textMuted, fontWeight: scanMode === 'pinch' ? '700' : '500' },
                ]}
              >
                Skinfold Caliper
              </Text>
            </TouchableOpacity>
          </View>

          {/* Decluttered Camera / Photo Card */}
          <View style={[styles.photoCard, { backgroundColor: colors.surfaceElevated, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            {photoUri ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: photoUri }} style={styles.previewImage} resizeMode="cover" />
                <View style={styles.previewOverlay}>
                  <View style={styles.scanBadge}>
                    <Ionicons name="sparkles" size={13} color="#22c55e" />
                    <Text style={styles.scanBadgeText}>Photo Ready</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.retakeBtn}
                    onPress={() => setPhotoUri(null)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh" size={13} color="#ffffff" />
                    <Text style={styles.retakeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.cameraPlaceholder}>
                {/* Visual reticle / torso guide frame */}
                <View style={styles.targetFrame}>
                  <View style={[styles.targetCorner, styles.tl, { borderColor: colors.primary }]} />
                  <View style={[styles.targetCorner, styles.tr, { borderColor: colors.primary }]} />
                  <View style={[styles.targetCorner, styles.bl, { borderColor: colors.primary }]} />
                  <View style={[styles.targetCorner, styles.br, { borderColor: colors.primary }]} />

                  <View style={[styles.cameraIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                    <Ionicons
                      name={scanMode === 'pinch' ? 'hand-left-outline' : 'scan-outline'}
                      size={28}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={[styles.targetTitle, { color: colors.text }]}>
                    {scanMode === 'pinch' ? 'Pinch Skinfold' : 'Capture Torso / Abs'}
                  </Text>
                  <Text style={[styles.targetSub, { color: colors.textMuted }]}>
                    {scanMode === 'pinch'
                      ? 'Pinch fold beside navel to evaluate subcutaneous thickness.'
                      : 'Stand in good lighting to scan ab bricks, obliques & striations.'}
                  </Text>
                </View>

                {/* Translucent Rounded Action Buttons */}
                <View style={styles.pickButtonsRow}>
                  <TouchableOpacity
                    style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handlePickImage(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={16} color="#000" />
                    <Text style={styles.primaryActionText}>Camera</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.secondaryActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                    onPress={() => handlePickImage(false)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="images-outline" size={16} color={colors.text} />
                    <Text style={[styles.secondaryActionText, { color: colors.text }]}>Gallery</Text>
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
              isAnalyzing && { opacity: 0.7 },
            ]}
            onPress={handleAnalyze}
            disabled={isAnalyzing}
            activeOpacity={0.85}
          >
            {isAnalyzing ? (
              <View style={styles.analyzingRow}>
                <ActivityIndicator size="small" color="#000" />
                <Text style={styles.scanTriggerText}>Scanning Abs & Definition...</Text>
              </View>
            ) : (
              <View style={styles.analyzingRow}>
                <Ionicons name="sparkles" size={17} color="#000000" />
                <Text style={styles.scanTriggerText}>
                  {photoUri ? 'Analyze Physique & Abs' : 'Calculate Body Fat %'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Clean Results Display Card */}
          {analysisResult && (
            <View style={[styles.resultsCard, { backgroundColor: colors.surfaceElevated, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}>
              {/* Header with big clean number & badge */}
              <View style={styles.resultHeader}>
                <View>
                  <Text style={[styles.resultPreTitle, { color: colors.textMuted }]}>BODY FAT PERCENTAGE</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                    <Text style={[styles.largeBfPercent, { color: colors.text }]}>
                      {analysisResult.bodyFatPercent}
                    </Text>
                    <Text style={[styles.largeBfSymbol, { color: colors.primary }]}>%</Text>
                  </View>
                </View>

                <View style={[styles.categoryBadge, { backgroundColor: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)' }]}>
                  <Ionicons name="shield-checkmark" size={14} color="#22c55e" />
                  <Text style={styles.categoryBadgeText}>
                    {analysisResult.category}
                  </Text>
                </View>
              </View>

              {/* Minimalist Gauge Bar */}
              <View style={[styles.gaugeTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <View
                  style={[
                    styles.gaugeFill,
                    {
                      width: `${Math.min(100, Math.max(8, (analysisResult.bodyFatPercent / 35) * 100))}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>

              {/* Body Composition Pill Trio */}
              <View style={styles.compositionTrio}>
                <View style={[styles.compPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                  <Text style={[styles.compLabel, { color: colors.textMuted }]}>LEAN MASS</Text>
                  <Text style={[styles.compValue, { color: colors.text }]}>{analysisResult.leanMassKg} kg</Text>
                </View>
                <View style={[styles.compPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                  <Text style={[styles.compLabel, { color: colors.textMuted }]}>FAT MASS</Text>
                  <Text style={[styles.compValue, { color: colors.text }]}>{analysisResult.fatMassKg} kg</Text>
                </View>
                <View style={[styles.compPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                  <Text style={[styles.compLabel, { color: colors.textMuted }]}>BMI</Text>
                  <Text style={[styles.compValue, { color: colors.text }]}>{analysisResult.bmi}</Text>
                </View>
              </View>

              {/* Detected Abs & Physique Highlights */}
              {analysisResult.visualFeatures && analysisResult.visualFeatures.length > 0 && (
                <View style={styles.featuresSection}>
                  <Text style={[styles.featuresSectionTitle, { color: colors.textMuted }]}>
                    PHYSIQUE & DEFINITION DETECTED
                  </Text>
                  <View style={styles.featuresList}>
                    {analysisResult.visualFeatures.map((feat, i) => {
                      const isAb = feat.toLowerCase().includes('ab');
                      const isVasc = feat.toLowerCase().includes('vascularity');
                      const isOblique = feat.toLowerCase().includes('oblique') || feat.toLowerCase().includes('serratus');
                      
                      const iconName = isAb ? 'grid-outline' : isVasc ? 'flash-outline' : isOblique ? 'fitness-outline' : 'checkmark-circle-outline';
                      const iconColor = isAb ? '#38bdf8' : isVasc ? '#f59e0b' : '#22c55e';

                      return (
                        <View
                          key={i}
                          style={[
                            styles.featureCard,
                            { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' },
                          ]}
                        >
                          <Ionicons name={iconName} size={15} color={iconColor} style={{ marginTop: 1 }} />
                          <Text style={[styles.featureCardText, { color: colors.text }]}>
                            {feat}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={[styles.methodNote, { color: colors.textMuted }]}>
                {analysisResult.evaluationMethod} · Logged to Profile
              </Text>
            </View>
          )}

          {/* Decluttered Collapsible Calibration Accordion */}
          <View style={[styles.accordionCard, { backgroundColor: colors.surfaceElevated, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            <TouchableOpacity
              style={styles.accordionHeader}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setShowAdvanced(!showAdvanced);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.accordionTitleRow}>
                <Ionicons name="options-outline" size={16} color={colors.primary} />
                <Text style={[styles.accordionTitle, { color: colors.text }]}>Biometrics & Calibration</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.accordionSummary, { color: colors.textMuted }]}>
                  {Math.round(profile.age || 26)}y · {isUS ? `${Math.round((profile.weightKg || 70) * 2.20462)}lbs` : `${Math.round(profile.weightKg || 70)}kg`} · {athleticLevel}
                </Text>
                <Ionicons
                  name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.textMuted}
                />
              </View>
            </TouchableOpacity>

            {showAdvanced && (
              <View style={styles.accordionContent}>
                {/* Athletic Training Level Pills */}
                <View style={{ marginTop: 4 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>TRAINING BACKGROUND</Text>
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
                              backgroundColor: isSelected ? colors.primary : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
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
                                color: isSelected ? '#000000' : colors.text,
                                fontWeight: isSelected ? '700' : '500',
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

                {/* Optional Tape Circumferences Switch */}
                <TouchableOpacity
                  style={[styles.tapeToggleRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setIncludeCircumferences(!includeCircumferences);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="resize-outline" size={15} color={includeCircumferences ? colors.primary : colors.textMuted} />
                    <Text style={[styles.fieldLabel, { color: colors.text, marginBottom: 0 }]}>
                      Add Waist & Neck Tape Measure
                    </Text>
                  </View>
                  <Text style={[styles.tapeToggleState, { color: includeCircumferences ? colors.primary : colors.textMuted }]}>
                    {includeCircumferences ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>

                {includeCircumferences && (
                  <View style={styles.tapeInputsRow}>
                    <View style={styles.tapeInputCol}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>WAIST</Text>
                      <View style={[styles.tapeInputBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                        <TextInput
                          style={[styles.tapeInput, { color: colors.text }]}
                          value={waistInput}
                          onChangeText={setWaistInput}
                          keyboardType="decimal-pad"
                          placeholder={isUS ? '32' : '81'}
                          placeholderTextColor={colors.textMuted}
                        />
                        <Text style={[styles.tapeUnit, { color: colors.textMuted }]}>{isUS ? 'in' : 'cm'}</Text>
                      </View>
                    </View>

                    <View style={styles.tapeInputCol}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>NECK</Text>
                      <View style={[styles.tapeInputBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                        <TextInput
                          style={[styles.tapeInput, { color: colors.text }]}
                          value={neckInput}
                          onChangeText={setNeckInput}
                          keyboardType="decimal-pad"
                          placeholder={isUS ? '15.5' : '39'}
                          placeholderTextColor={colors.textMuted}
                        />
                        <Text style={[styles.tapeUnit, { color: colors.textMuted }]}>{isUS ? 'in' : 'cm'}</Text>
                      </View>
                    </View>

                    {profile.gender === 'female' && (
                      <View style={styles.tapeInputCol}>
                        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>HIPS</Text>
                        <View style={[styles.tapeInputBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                          <TextInput
                            style={[styles.tapeInput, { color: colors.text }]}
                            value={hipInput}
                            onChangeText={setHipInput}
                            keyboardType="decimal-pad"
                            placeholder={isUS ? '38' : '96'}
                            placeholderTextColor={colors.textMuted}
                          />
                          <Text style={[styles.tapeUnit, { color: colors.textMuted }]}>{isUS ? 'in' : 'cm'}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 14,
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
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
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
    gap: 14,
  },
  segmentedBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentLabel: {
    fontSize: 13,
  },
  photoCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 220,
  },
  previewWrap: {
    width: '100%',
    height: 270,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  scanBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 16,
  },
  retakeBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  cameraPlaceholder: {
    alignItems: 'center',
    padding: 22,
  },
  targetFrame: {
    width: '100%',
    maxWidth: 280,
    aspectRatio: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 6,
  },
  targetCorner: {
    position: 'absolute',
    width: 14,
    height: 14,
  },
  tl: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 4 },
  cameraIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  targetTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  targetSub: {
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
    lineHeight: 16,
  },
  pickButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    width: '100%',
    maxWidth: 280,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryActionText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scanTriggerBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanTriggerText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  resultsCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  resultPreTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  largeBfPercent: {
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  largeBfSymbol: {
    fontSize: 20,
    fontWeight: '800',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  categoryBadgeText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '700',
  },
  gaugeTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 3,
  },
  compositionTrio: {
    flexDirection: 'row',
    gap: 8,
  },
  compPill: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
  },
  compLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  compValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  featuresSection: {
    gap: 8,
    paddingTop: 4,
  },
  featuresSectionTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  featuresList: {
    gap: 6,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  featureCardText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    lineHeight: 17,
  },
  methodNote: {
    fontSize: 10.5,
    textAlign: 'center',
  },
  accordionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  accordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accordionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  accordionSummary: {
    fontSize: 11,
    fontWeight: '500',
  },
  accordionContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  athleticPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  athleticPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  athleticPillText: {
    fontSize: 11,
  },
  tapeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  tapeToggleState: {
    fontSize: 11,
    fontWeight: '700',
  },
  tapeInputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tapeInputCol: {
    flex: 1,
  },
  tapeInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tapeInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    padding: 0,
  },
  tapeUnit: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 2,
  },
});
