import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { analyzeFoodImageAsync, FoodVisionAnalysisResult } from '@/constants/foodVisionAI';
import { MealLog, MealType, saveMealLog, getTodayDateKey } from '@/constants/nutritionStorage';

interface AIFoodCameraModalProps {
  visible: boolean;
  initialMealType?: MealType;
  onClose: () => void;
  onMealSaved: (meal: MealLog) => void;
}

export function AIFoodCameraModal({ visible, initialMealType = 'lunch', onClose, onMealSaved }: AIFoodCameraModalProps) {
  const { colors, isDark } = useTheme();

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [descriptionInput, setDescriptionInput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<FoodVisionAnalysisResult | null>(null);
  const [servingMultiplier, setServingMultiplier] = useState<number>(1);

  const scanBarAnim = useRef(new Animated.Value(0)).current;
  const [scanStatusText, setScanStatusText] = useState<string>('Scanning plate & food items...');
  const [scanPercent, setScanPercent] = useState<number>(18);

  useEffect(() => {
    if (isAnalyzing) {
      // Smooth continuous forward progress from 0% to 95%
      scanBarAnim.setValue(0);
      const progressTiming = Animated.timing(scanBarAnim, {
        toValue: 0.95,
        duration: 3800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      progressTiming.start();

      // Sequential descriptive AI phases that advance forward without resetting or looping
      const phases = [
        { text: 'Scanning plate & food items...', pct: 20, delay: 0 },
        { text: 'Identifying bowl & dish ingredients...', pct: 45, delay: 900 },
        { text: 'Matching against USDA clinical macros...', pct: 72, delay: 1900 },
        { text: 'Calibrating portion weight & calories...', pct: 88, delay: 2800 },
        { text: 'Finalizing nutritional breakdown...', pct: 96, delay: 3500 },
      ];

      setScanStatusText(phases[0].text);
      setScanPercent(phases[0].pct);

      const timeouts = phases.slice(1).map((phase) =>
        setTimeout(() => {
          setScanStatusText(phase.text);
          setScanPercent(phase.pct);
        }, phase.delay)
      );

      return () => {
        timeouts.forEach((t) => clearTimeout(t));
        progressTiming.stop();
      };
    } else {
      scanBarAnim.setValue(1);
      setScanPercent(100);
    }
  }, [isAnalyzing]);

  useEffect(() => {
    if (visible && initialMealType) {
      setMealType(initialMealType);
    }
  }, [visible, initialMealType]);

  // Take photo with native device camera
  const handleTakePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert('Camera permission is required to photograph meals.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedImage(asset.uri);
      setBase64Data(asset.base64 || null);
      runVisionAnalysis(asset.base64 || '', asset.uri);
    }
  };

  // Pick photo from library
  const handlePickLibrary = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedImage(asset.uri);
      setBase64Data(asset.base64 || null);
      runVisionAnalysis(asset.base64 || '', asset.uri);
    }
  };

  const runVisionAnalysis = async (base64: string, uri: string) => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setServingMultiplier(1);
    try {
      const result = await analyzeFoodImageAsync(base64, mealType, descriptionInput);
      setAnalysisResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.error('Vision analysis error:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveMeal = async () => {
    if (!analysisResult) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const scaledItems = analysisResult.items.map((item) => ({
      ...item,
      calories: Math.round(item.calories * servingMultiplier),
      proteinG: Math.round(item.proteinG * servingMultiplier * 10) / 10,
      carbsG: Math.round(item.carbsG * servingMultiplier * 10) / 10,
      fatG: Math.round(item.fatG * servingMultiplier * 10) / 10,
      portion: servingMultiplier !== 1 ? `${servingMultiplier}x (${item.portion})` : item.portion,
    }));

    const newMeal: MealLog = {
      id: `meal_${Date.now()}`,
      timestamp: Date.now(),
      dateKey: getTodayDateKey(),
      mealType,
      title: servingMultiplier !== 1 ? `${analysisResult.dishTitle} (${servingMultiplier}x)` : analysisResult.dishTitle,
      imageUri: selectedImage || undefined,
      calories: Math.round(analysisResult.totalCalories * servingMultiplier),
      proteinG: Math.round(analysisResult.totalProteinG * servingMultiplier * 10) / 10,
      carbsG: Math.round(analysisResult.totalCarbsG * servingMultiplier * 10) / 10,
      fatG: Math.round(analysisResult.totalFatG * servingMultiplier * 10) / 10,
      items: scaledItems,
      aiAnalyzed: true,
      notes: analysisResult.tips,
    };

    await saveMealLog(newMeal);
    onMealSaved(newMeal);
    handleResetAndClose();
  };

  const handleResetAndClose = () => {
    setSelectedImage(null);
    setBase64Data(null);
    setAnalysisResult(null);
    setDescriptionInput('');
    setServingMultiplier(1);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleResetAndClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleResetAndClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>AI Nutrition Scanner</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              Computer Vision Food & Macro AI
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          {/* Meal Type Category Pills */}
          <View style={styles.mealTypeRow}>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.mealTypePill,
                  {
                    backgroundColor: mealType === t ? colors.primary : colors.surfaceElevated,
                    borderColor: mealType === t ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setMealType(t);
                }}
              >
                <Text
                  style={[
                    styles.mealTypePillText,
                    { color: mealType === t ? '#09090b' : colors.text, fontWeight: mealType === t ? '700' : '500' },
                  ]}
                >
                  {t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Photo Viewfinder / Showcase Card */}
          {selectedImage ? (
            <View style={[styles.imageContainer, { borderColor: colors.border }]}>
              <Image source={{ uri: selectedImage }} style={styles.previewImage} resizeMode="cover" />
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => {
                  setSelectedImage(null);
                  setAnalysisResult(null);
                }}
              >
                <Ionicons name="refresh" size={16} color="#ffffff" />
                <Text style={styles.retakeBtnText}>Retake Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.uploadBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <View style={[styles.cameraIconPill, { backgroundColor: `${colors.primary}20` }]}>
                <Ionicons name="camera" size={36} color={colors.primary} />
              </View>
              <Text style={[styles.uploadTitle, { color: colors.text }]}>Capture or Upload Meal Photo</Text>
              <Text style={[styles.uploadSubtitle, { color: colors.textMuted }]}>
                AI identifies meal composition, portions, calories, and complete macronutrient breakdown.
              </Text>

              <View style={styles.actionBtnRow}>
                <TouchableOpacity
                  style={[styles.cameraActionBtn, { backgroundColor: colors.primary }]}
                  onPress={handleTakePhoto}
                >
                  <Ionicons name="camera" size={20} color="#09090b" />
                  <Text style={styles.cameraActionText}>Snap Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.libraryActionBtn, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                  onPress={handlePickLibrary}
                >
                  <Ionicons name="images-outline" size={20} color={colors.text} />
                  <Text style={[styles.libraryActionText, { color: colors.text }]}>Photo Library</Text>
                </TouchableOpacity>
              </View>

              {/* Optional Text Guidance */}
              <View style={styles.optionalDescBox}>
                <Text style={[styles.optionalDescLabel, { color: colors.textMuted }]}>
                  OPTIONAL: ADD SPECIAL INGREDIENTS OR RESTAURANT NAME
                </Text>
                <TextInput
                  style={[styles.optionalInput, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g., 200g grilled salmon, half avocado, jasmine rice"
                  placeholderTextColor={colors.textMuted}
                  value={descriptionInput}
                  onChangeText={setDescriptionInput}
                />
              </View>
            </View>
          )}

          {/* Real-time AI Analysis Indicator with Animated Progress Bar */}
          {isAnalyzing && (
            <View style={[styles.analyzingCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }]}>
              <View style={styles.scanBarHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                  <View style={[styles.scanLiveDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.analyzingTitle, { color: colors.text }]} numberOfLines={1}>
                    {scanStatusText}
                  </Text>
                </View>
                <Text style={[styles.scanPercentText, { color: colors.primary }]}>
                  {scanPercent}%
                </Text>
              </View>

              {/* Animated Progress Bar */}
              <View style={[styles.scanBarOuterTrack, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Animated.View
                  style={[
                    styles.scanBarFill,
                    {
                      backgroundColor: colors.primary,
                      width: scanBarAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['8%', '100%'],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.scanBarLaserTip,
                    {
                      backgroundColor: '#ffffff',
                      left: scanBarAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['6%', '98%'],
                      }),
                    },
                  ]}
                />
              </View>

              <View style={styles.scanStagesRow}>
                <Text style={[styles.scanStageItem, { color: colors.textSecondary }]}>
                  <Ionicons name="scan-outline" size={12} color={colors.primary} /> Vision Input
                </Text>
                <Text style={[styles.scanStageItem, { color: colors.textSecondary }]}>
                  <Ionicons name="pie-chart-outline" size={12} color={colors.primary} /> Food Volume
                </Text>
                <Text style={[styles.scanStageItem, { color: colors.textSecondary }]}>
                  <Ionicons name="flame-outline" size={12} color={colors.primary} /> Real USDA Cals
                </Text>
              </View>
            </View>
          )}

          {/* AI Analysis Breakdown Results */}
          {analysisResult && !isAnalyzing && (
            <View style={styles.resultsContainer}>
              {analysisResult.isFood === false ? (
                /* Non-Food Detected Warning Card */
                <View style={[styles.nonFoodCard, { backgroundColor: '#ef444415', borderColor: '#ef4444' }]}>
                  <View style={styles.nonFoodHeader}>
                    <View style={styles.nonFoodIconWrap}>
                      <Ionicons name="warning" size={32} color="#ef4444" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nonFoodTitle, { color: '#ef4444' }]}>Non-Food Detected</Text>
                      <Text style={[styles.nonFoodSubtitle, { color: colors.text }]}>
                        {analysisResult.nonFoodReason || `Detected as ${analysisResult.detectedSubject || 'an object'}.`}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.nonFoodGuidanceBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                    <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                    <Text style={[styles.nonFoodGuidanceText, { color: colors.textSecondary }]}>
                      The vision model identified this image as a {analysisResult.detectedSubject?.toLowerCase() || 'non-edible item'}, not food. Please point the camera at a meal, drink, or snack.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.retakeFullBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setSelectedImage(null);
                      setAnalysisResult(null);
                    }}
                  >
                    <Ionicons name="camera" size={18} color="#09090b" />
                    <Text style={styles.retakeFullBtnText}>Take Another Photo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                {/* Clean, Modern Health Breakdown Card */}
                <View style={[styles.analysisCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  {/* Item Header */}
                  <View style={styles.analysisHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.confidenceBadge}>
                        <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
                        <Text style={[styles.confidenceText, { color: colors.textMuted }]}>
                          VERIFIED SCAN · {Math.round(analysisResult.confidence * 100)}% MATCH
                        </Text>
                      </View>
                      <Text style={[styles.dishTitle, { color: colors.text }]}>{analysisResult.dishTitle}</Text>
                    </View>
                  </View>

                  {/* Clean Nutrition Hero & Macro Matrix */}
                  <View style={[styles.nutritionMatrix, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <View style={styles.calorieStatCol}>
                      <Text style={[styles.calorieMetricLabel, { color: colors.textMuted }]}>CALORIES</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                        <Text style={[styles.calorieMetricNumber, { color: colors.text }]}>
                          {Math.round(analysisResult.totalCalories * servingMultiplier)}
                        </Text>
                        <Text style={[styles.calorieMetricUnit, { color: colors.textMuted }]}>kcal</Text>
                      </View>
                    </View>

                    <View style={[styles.matrixDivider, { backgroundColor: colors.border }]} />

                    <View style={styles.macroColumnsWrap}>
                      <View style={styles.macroStatItem}>
                        <Text style={[styles.macroStatLabel, { color: colors.textMuted }]}>PROTEIN</Text>
                        <Text style={[styles.macroStatNumber, { color: colors.text }]}>
                          {Math.round(analysisResult.totalProteinG * servingMultiplier * 10) / 10}g
                        </Text>
                      </View>
                      <View style={styles.macroStatItem}>
                        <Text style={[styles.macroStatLabel, { color: colors.textMuted }]}>CARBS</Text>
                        <Text style={[styles.macroStatNumber, { color: colors.text }]}>
                          {Math.round(analysisResult.totalCarbsG * servingMultiplier * 10) / 10}g
                        </Text>
                      </View>
                      <View style={styles.macroStatItem}>
                        <Text style={[styles.macroStatLabel, { color: colors.textMuted }]}>FAT</Text>
                        <Text style={[styles.macroStatNumber, { color: colors.text }]}>
                          {Math.round(analysisResult.totalFatG * servingMultiplier * 10) / 10}g
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Quantity & Serving Size Fine-Tuning Stepper */}
                  <View style={[styles.quantityControlRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.quantityLabel, { color: colors.textMuted }]}>FINE-TUNE QUANTITY</Text>
                      <Text style={[styles.quantitySubtext, { color: colors.text }]} numberOfLines={1}>
                        {servingMultiplier === 1
                          ? analysisResult.items[0]?.portion || '1 standard serving'
                          : `${servingMultiplier}x portion scale`}
                      </Text>
                    </View>
                    <View style={styles.stepperContainer}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                        onPress={() => {
                          if (servingMultiplier > 0.05) {
                            Haptics.selectionAsync().catch(() => {});
                            const step = servingMultiplier <= 0.2 ? 0.05 : servingMultiplier <= 1 ? 0.25 : 0.5;
                            setServingMultiplier((prev) => Math.max(0.05, Math.round((prev - step) * 100) / 100));
                          }
                        }}
                      >
                        <Ionicons name="remove" size={16} color={colors.text} />
                      </TouchableOpacity>
                      <View style={styles.stepperValueBox}>
                        <Text style={[styles.stepperValueText, { color: colors.text }]}>
                          {servingMultiplier}x
                        </Text>
                        <Text style={[styles.stepperSubtext, { color: colors.textMuted }]}>servings</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.stepperBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                        onPress={() => {
                          if (servingMultiplier < 25) {
                            Haptics.selectionAsync().catch(() => {});
                            const step = servingMultiplier < 1 ? 0.25 : 0.5;
                            setServingMultiplier((prev) => Math.round((prev + step) * 100) / 100);
                          }
                        }}
                      >
                        <Ionicons name="add" size={16} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Dietary Meta Tags */}
                  <View style={styles.tagRow}>
                    {analysisResult.dietaryTags.map((tag) => (
                      <View key={tag} style={[styles.tagBadge, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                        <Text style={[styles.tagBadgeText, { color: colors.textMuted }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Scanned Items / Serving Detail */}
                <View style={[styles.itemsCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Text style={[styles.itemsHeading, { color: colors.text }]}>Serving & Component Breakdown</Text>
                  {analysisResult.items.map((item, idx) => {
                    const scaledCals = Math.round(item.calories * servingMultiplier);
                    const scaledP = Math.round(item.proteinG * servingMultiplier * 10) / 10;
                    const scaledC = Math.round(item.carbsG * servingMultiplier * 10) / 10;
                    const scaledF = Math.round(item.fatG * servingMultiplier * 10) / 10;
                    const portionDisplay = servingMultiplier === 1
                      ? item.portion
                      : `${item.portion} (${servingMultiplier}x)`;

                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.foodItemRow,
                          idx < analysisResult.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.foodItemName, { color: colors.text }]}>{item.name}</Text>
                          <Text style={[styles.foodItemPortion, { color: colors.textMuted }]}>{portionDisplay}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.foodItemCals, { color: colors.text }]}>{scaledCals} kcal</Text>
                          <Text style={[styles.foodItemMacros, { color: colors.textMuted }]}>
                            P {scaledP}g · C {scaledC}g · F {scaledF}g
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                </>
            )}
            </View>
          )}
        </ScrollView>

        {/* Bottom Save Action - Only active if recognized as food */}
        {analysisResult && !isAnalyzing && analysisResult.isFood !== false && (
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSaveMeal}
            >
              <Ionicons name="checkmark-circle" size={20} color="#09090b" />
              <Text style={styles.saveBtnText}>Log Meal to Daily Tracker</Text>
            </TouchableOpacity>
          </View>
        )}
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scrollBody: {
    padding: 16,
    paddingBottom: 40,
  },
  mealTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  mealTypePill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  mealTypePillText: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  uploadBox: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 16,
  },
  cameraIconPill: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
    marginBottom: 6,
    textAlign: 'center',
  },
  uploadSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  cameraActionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cameraActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#09090b',
  },
  libraryActionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  libraryActionText: {
    fontSize: 15,
    fontWeight: '700',
  },
  optionalDescBox: {
    width: '100%',
    marginTop: 8,
  },
  optionalDescLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  optionalInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  imageContainer: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 16,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 220,
  },
  retakeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  retakeBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  analyzingCard: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 12,
    marginBottom: 16,
  },
  scanBarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scanLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scanPercentText: {
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  scanBarOuterTrack: {
    width: '100%',
    height: 10,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  scanBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  scanBarLaserTip: {
    position: 'absolute',
    width: 12,
    height: '100%',
    borderRadius: 6,
    opacity: 0.9,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 4,
  },
  scanStagesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  scanStageItem: {
    fontSize: 11,
    fontWeight: '600',
  },
  analyzingTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  resultsContainer: {
    gap: 14,
  },
  analysisCard: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  dishTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  candidateSelectorBox: {
    marginTop: 10,
    marginBottom: 12,
  },
  candidateSelectorLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  candidatePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  candidatePillText: {
    fontSize: 12,
  },
  nutritionMatrix: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  calorieStatCol: {
    paddingRight: 18,
  },
  calorieMetricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  calorieMetricNumber: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  calorieMetricUnit: {
    fontSize: 13,
    fontWeight: '500',
  },
  matrixDivider: {
    width: StyleSheet.hairlineWidth,
    height: 38,
  },
  macroColumnsWrap: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingLeft: 8,
  },
  macroStatItem: {
    alignItems: 'center',
  },
  macroStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  macroStatNumber: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  portionVariantsWrapper: {
    marginBottom: 12,
  },
  portionVariantsLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  portionVariantsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  portionVariantPill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionVariantTitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
  },
  portionVariantSubtitle: {
    fontSize: 10,
    textAlign: 'center',
  },
  quantityControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  quantityLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  quantitySubtext: {
    fontSize: 13,
    fontWeight: '600',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueBox: {
    alignItems: 'center',
    minWidth: 46,
  },
  stepperValueText: {
    fontSize: 14,
    fontWeight: '800',
  },
  stepperSubtext: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: -1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  tagBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
  },
  tipText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  itemsCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  itemsHeading: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  foodItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  foodItemName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  foodItemPortion: {
    fontSize: 12,
  },
  foodItemCals: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  foodItemMacros: {
    fontSize: 11,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  saveBtn: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#09090b',
  },
  nonFoodCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
    gap: 14,
  },
  nonFoodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nonFoodIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ef444422',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nonFoodTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  nonFoodSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  nonFoodGuidanceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  nonFoodGuidanceText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  retakeFullBtn: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  retakeFullBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#09090b',
  },
});
