import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Platform,
  Dimensions,
  Animated,
  Easing,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { analyzeFoodImageAsync, describeFoodAsync, FoodVisionAnalysisResult } from '@/constants/foodVisionAI';
import { MealLog, MealType, saveMealLog, getTodayDateKey } from '@/constants/nutritionStorage';

import { FoodItemIndex, HUGE_FOOD_INDEX } from '@/constants/foodDatabase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const CATEGORIES = ['All', 'Popular Foods', 'Snacks & Treats', 'Drinks & Shakes', 'Protein & Dairy', 'Breakfast & Bakery', 'Fruits & Veggies'] as const;

interface FoodLoggingModalProps {
  visible: boolean;
  initialMealType?: MealType;
  onClose: () => void;
  onMealSaved: (meal: MealLog) => void;
}

export function FoodLoggingModal({
  visible,
  initialMealType = 'breakfast',
  onClose,
  onMealSaved,
}: FoodLoggingModalProps) {
  const { colors } = useTheme();

  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [descriptionInput, setDescriptionInput] = useState<string>('');
  const [recipeSearchQuery, setRecipeSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<FoodVisionAnalysisResult | null>(null);
  const [servingMultiplier, setServingMultiplier] = useState<number>(1);

  // Active section tracking: 'photo' | 'describe' | 'recipes' | 'none'
  const [activeSection, setActiveSection] = useState<'photo' | 'describe' | 'recipes' | 'none'>('none');
  const [showOtherOptions, setShowOtherOptions] = useState<boolean>(false);

  // Food-themed animation values: spinning fork, hovering plate, and pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const forkSpinAnim = useRef(new Animated.Value(0)).current;
  const plateBounceAnim = useRef(new Animated.Value(0)).current;

  // Real-time analysis status stages and percent display
  const [scanStatusText, setScanStatusText] = useState<string>('Scanning meal composition...');
  const [scanPercent, setScanPercent] = useState<number>(18);

  useEffect(() => {
    if (visible && initialMealType) {
      setMealType(initialMealType);
    }
  }, [visible, initialMealType]);

  // Satisfying spinning fork and plate animation loop
  useEffect(() => {
    if (isAnalyzing) {
      // Continuous smooth 360-degree spinning fork
      const spinLoop = Animated.loop(
        Animated.timing(forkSpinAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

      // Gentle floating plate hover
      const plateBounceLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(plateBounceAnim, {
            toValue: -6,
            duration: 550,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(plateBounceAnim, {
            toValue: 0,
            duration: 550,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      // Smooth continuous forward progress from 0% to 95%
      scanLineAnim.setValue(0);
      const progressTiming = Animated.timing(scanLineAnim, {
        toValue: 0.95,
        duration: 3800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });

      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 0.9,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );

      spinLoop.start();
      plateBounceLoop.start();
      pulseLoop.start();
      progressTiming.start();
      glowLoop.start();

      // Sequential descriptive AI phases that advance forward without resetting or looping
      const phases = [
        { text: 'Scanning meal composition...', pct: 22, delay: 0 },
        { text: 'Identifying bowl & dish ingredients...', pct: 48, delay: 900 },
        { text: 'Matching against USDA clinical macros...', pct: 74, delay: 1900 },
        { text: 'Calibrating portion weight & calories...', pct: 89, delay: 2800 },
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
        spinLoop.stop();
        plateBounceLoop.stop();
        pulseLoop.stop();
        progressTiming.stop();
        glowLoop.stop();
      };
    } else {
      forkSpinAnim.setValue(0);
      plateBounceAnim.setValue(0);
      pulseAnim.setValue(1);
      scanLineAnim.setValue(1);
      glowAnim.setValue(0.3);
      setScanPercent(100);
    }
  }, [isAnalyzing]);

  // Take photo with camera
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
      setActiveSection('photo');
      setShowOtherOptions(false);
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
      setActiveSection('photo');
      setShowOtherOptions(false);
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

  // AI Description Text Calculator
  const handleCalculateFromDescription = async () => {
    if (!descriptionInput.trim()) {
      alert('Please type what you ate (e.g. 3 cookies and a glass of lemonade).');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActiveSection('describe');
    setShowOtherOptions(false);
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setServingMultiplier(1);

    try {
      const result = await describeFoodAsync(descriptionInput);
      setAnalysisResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.error('Describe food error:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Quick Recipe / Food Index Tap Selection
  const handleSelectRecipe = (rec: FoodItemIndex) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveSection('recipes');
    setShowOtherOptions(false);
    setServingMultiplier(1);
    setAnalysisResult({
      dishTitle: rec.name,
      confidence: 1.0,
      totalCalories: rec.calories,
      totalProteinG: rec.protein,
      totalCarbsG: rec.carbs,
      totalFatG: rec.fat,
      items: [
        {
          id: `rec_${Date.now()}`,
          name: rec.name,
          portion: rec.portion,
          calories: rec.calories,
          proteinG: rec.protein,
          carbsG: rec.carbs,
          fatG: rec.fat,
          confidence: 1.0,
        },
      ],
      healthScore: 90,
      dietaryTags: [rec.category],
      tips: `${rec.name} · ${rec.portion}`,
      isFood: true,
    });
  };

  // Save Meal to Today's Log
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
    setAnalysisResult(null);
    setDescriptionInput('');
    setRecipeSearchQuery('');
    setSelectedCategory('All');
    setServingMultiplier(1);
    setIsAnalyzing(false);
    setActiveSection('none');
    setShowOtherOptions(false);
    onClose();
  };

  // Filter recipes based on category and search text across huge database
  const filteredRecipes = HUGE_FOOD_INDEX.filter((r) => {
    const matchesCat = selectedCategory === 'All' || r.category === selectedCategory;
    const query = recipeSearchQuery.toLowerCase().trim();
    const matchesQuery = !query || r.name.toLowerCase().includes(query) || r.category.toLowerCase().includes(query);
    return matchesCat && matchesQuery;
  });

  // Logic: When an action is chosen, hide other options unless expanded
  const hasActiveChoice = activeSection !== 'none' || !!analysisResult || !!selectedImage;
  const showPhotoSection = !hasActiveChoice || activeSection === 'photo' || showOtherOptions;
  const showDescribeSection = !hasActiveChoice || activeSection === 'describe' || showOtherOptions;
  const showRecipeSection = !hasActiveChoice || activeSection === 'recipes' || showOtherOptions;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleResetAndClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.fullPageContainer, { backgroundColor: colors.background }]}>
          {/* Top Header with In-Frame Exit Button */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={handleResetAndClose} style={[styles.exitBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>

            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Log {mealType.charAt(0).toUpperCase() + mealType.slice(1)}</Text>
            </View>

            <View style={{ width: 36 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* TOP SECTION: PHOTO SCANNER */}
            {showPhotoSection && (
              <View style={[styles.photoHalfSection, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
                {selectedImage ? (
                  <View style={styles.photoContainer}>
                    <Image source={{ uri: selectedImage }} style={styles.photoFill} resizeMode="cover" />
                    {/* Viewfinder crosshairs overlaid on captured photo */}
                    <View style={styles.viewfinderOverlay}>
                      <View style={[styles.cornerTL, { borderColor: colors.primary }]} />
                      <View style={[styles.cornerTR, { borderColor: colors.primary }]} />
                      <View style={[styles.cornerBL, { borderColor: colors.primary }]} />
                      <View style={[styles.cornerBR, { borderColor: colors.primary }]} />
                      
                      {/* Laser sweep animation across the photo */}
                      {isAnalyzing && (
                        <Animated.View
                          style={[
                            styles.photoScanBeam,
                            {
                              backgroundColor: colors.primary,
                              transform: [
                                {
                                  translateY: scanLineAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [10, 220],
                                  }),
                                },
                              ],
                            },
                          ]}
                        />
                      )}
                    </View>

                    <TouchableOpacity
                      style={styles.retakeBtn}
                      onPress={() => {
                        setSelectedImage(null);
                        setAnalysisResult(null);
                        setActiveSection('none');
                      }}
                    >
                      <Ionicons name="refresh" size={15} color="#ffffff" />
                      <Text style={styles.retakeBtnText}>Retake Photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.emptyPhotoBox}>
                    <View style={styles.viewfinderEmptyBox}>
                      <View style={[styles.cornerTL, { borderColor: `${colors.primary}80` }]} />
                      <View style={[styles.cornerTR, { borderColor: `${colors.primary}80` }]} />
                      <View style={[styles.cornerBL, { borderColor: `${colors.primary}80` }]} />
                      <View style={[styles.cornerBR, { borderColor: `${colors.primary}80` }]} />
                      <View style={[styles.cameraCircle, { backgroundColor: `${colors.primary}20` }]}>
                        <Ionicons name="camera" size={30} color={colors.primary} />
                      </View>
                    </View>

                    <Text style={[styles.photoPromptTitle, { color: colors.text }]}>Snap Plate, Snack, or Label</Text>

                    <View style={styles.photoActionRow}>
                      <TouchableOpacity
                        style={[styles.cameraActionBtn, { backgroundColor: colors.primary }]}
                        onPress={handleTakePhoto}
                      >
                        <Ionicons name="camera" size={17} color="#09090b" />
                        <Text style={styles.cameraActionText}>Take Photo</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.libraryActionBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        onPress={handlePickLibrary}
                      >
                        <Ionicons name="images-outline" size={17} color={colors.text} />
                        <Text style={[styles.libraryActionText, { color: colors.text }]}>Upload</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* MODERN SCANNING PROGRESS BAR & ANALYSIS INDICATOR */}
            {isAnalyzing && (
              <View style={[styles.satisfyingLoadingCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }]}>
                {/* Header with Live Status & Percentage */}
                <View style={styles.scanBarHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                    <View style={[styles.scanLiveDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.satisfyingLoadingTitle, { color: colors.text }]} numberOfLines={1}>
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
                        width: scanLineAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['8%', '100%'],
                        }),
                      },
                    ]}
                  />
                  {/* Glowing Laser Leading Edge */}
                  <Animated.View
                    style={[
                      styles.scanBarLaserTip,
                      {
                        backgroundColor: '#ffffff',
                        left: scanLineAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['6%', '98%'],
                        }),
                      },
                    ]}
                  />
                </View>

                {/* Stage Steps Indicator */}
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

            {/* ACTIVE NUTRITION CARD (WHEN LOGGED VIA PHOTO, TEXT, OR RECIPE) */}
            {analysisResult && !isAnalyzing && (
              <View style={[styles.activeResultCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }]}>
                <View style={styles.resultTitleRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                      <Text style={[styles.resultBadge, { color: colors.primary }]}>READY TO LOG</Text>
                    </View>
                    <Text style={[styles.dishTitle, { color: colors.text }]}>{analysisResult.dishTitle}</Text>
                    <Text style={[styles.dishPortion, { color: colors.textMuted }]}>
                      {analysisResult.items[0]?.portion || '1 standard portion'}
                    </Text>
                  </View>

                  {/* Clear Result Button */}
                  <TouchableOpacity
                    onPress={() => {
                      setAnalysisResult(null);
                      setSelectedImage(null);
                      setActiveSection('none');
                    }}
                    style={styles.clearBtn}
                  >
                    <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Macro Bar Grid */}
                <View style={[styles.macroGrid, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={styles.macroCol}>
                    <Text style={[styles.macroColLabel, { color: colors.textMuted }]}>CALORIES</Text>
                    <Text style={[styles.macroColNum, { color: colors.text }]}>
                      {Math.round(analysisResult.totalCalories * servingMultiplier)}{' '}
                      <Text style={{ fontSize: 10, color: colors.textMuted }}>kcal</Text>
                    </Text>
                  </View>
                  <View style={[styles.macroSep, { backgroundColor: colors.border }]} />
                  <View style={styles.macroCol}>
                    <Text style={[styles.macroColLabel, { color: '#38bdf8' }]}>PROTEIN</Text>
                    <Text style={[styles.macroColNum, { color: colors.text }]}>
                      {Math.round(analysisResult.totalProteinG * servingMultiplier * 10) / 10}g
                    </Text>
                  </View>
                  <View style={[styles.macroSep, { backgroundColor: colors.border }]} />
                  <View style={styles.macroCol}>
                    <Text style={[styles.macroColLabel, { color: '#a3e635' }]}>CARBS</Text>
                    <Text style={[styles.macroColNum, { color: colors.text }]}>
                      {Math.round(analysisResult.totalCarbsG * servingMultiplier * 10) / 10}g
                    </Text>
                  </View>
                  <View style={[styles.macroSep, { backgroundColor: colors.border }]} />
                  <View style={styles.macroCol}>
                    <Text style={[styles.macroColLabel, { color: '#f59e0b' }]}>FAT</Text>
                    <Text style={[styles.macroColNum, { color: colors.text }]}>
                      {Math.round(analysisResult.totalFatG * servingMultiplier * 10) / 10}g
                    </Text>
                  </View>
                </View>

                {/* Quantity Stepper */}
                <View style={[styles.quantityStepperRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.qtyLabel, { color: colors.textMuted }]}>QUANTITY</Text>
                    <Text style={[styles.qtyValue, { color: colors.text }]}>
                      {servingMultiplier === 1 ? '1x standard portion' : `${servingMultiplier}x multiple`}
                    </Text>
                  </View>

                  <View style={styles.stepperWrap}>
                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                      onPress={() => {
                        if (servingMultiplier > 0.25) {
                          Haptics.selectionAsync().catch(() => {});
                          const step = servingMultiplier <= 1 ? 0.25 : 0.5;
                          setServingMultiplier((prev) => Math.max(0.25, Math.round((prev - step) * 100) / 100));
                        }
                      }}
                    >
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </TouchableOpacity>

                    <View style={styles.stepperValBox}>
                      <Text style={[styles.stepperValText, { color: colors.text }]}>{servingMultiplier}x</Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                      onPress={() => {
                        if (servingMultiplier < 20) {
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

                {/* Log Meal Button */}
                <TouchableOpacity style={[styles.logMealSubmitBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMeal}>
                  <Ionicons name="checkmark-done" size={20} color="#09090b" />
                  <Text style={styles.logMealSubmitText}>Log to {mealType.toUpperCase()}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* EXPAND / COLLAPSE BUTTON TO REVEAL OTHER OPTIONS WHEN ONE IS ACTIVE */}
            {hasActiveChoice && (
              <TouchableOpacity
                style={[styles.expandToggleBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowOtherOptions((prev) => !prev);
                }}
              >
                <Text style={[styles.expandToggleText, { color: colors.text }]}>
                  {showOtherOptions ? 'Hide other options' : 'More logging options'}
                </Text>
                <Ionicons
                  name={showOtherOptions ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.primary}
                />
              </TouchableOpacity>
            )}

            {/* OPTION 2: DESCRIBE FOOD */}
            {showDescribeSection && (
              <View style={[styles.typeSectionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionIconWrap, { backgroundColor: '#38bdf820' }]}>
                    <Ionicons name="chatbubble-ellipses" size={16} color="#38bdf8" />
                  </View>
                  <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>Describe Food</Text>
                </View>

                <TextInput
                  style={[
                    styles.describeTextInput,
                    { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder="e.g. 3 cookies, chicken breast, or lemonade"
                  placeholderTextColor={colors.textMuted}
                  value={descriptionInput}
                  onChangeText={(text) => {
                    setDescriptionInput(text);
                    if (text && activeSection !== 'describe') {
                      setActiveSection('describe');
                    }
                  }}
                  multiline
                  numberOfLines={2}
                />

                <TouchableOpacity
                  style={[styles.calcDescribeBtn, { backgroundColor: '#38bdf8' }]}
                  onPress={handleCalculateFromDescription}
                >
                  <Ionicons name="flash-outline" size={15} color="#09090b" />
                  <Text style={styles.calcDescribeBtnText}>Calculate Nutrition</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* OPTION 3: SEARCH RECIPES & MEALS (HUGE INDEX WITH CATEGORY FILTER CHIPS) */}
            {showRecipeSection && (
              <View style={[styles.recipeSectionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionIconWrap, { backgroundColor: `${colors.primary}20` }]}>
                    <Ionicons name="search" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>Search Foods & Meals</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }}>{filteredRecipes.length} items</Text>
                  </View>
                </View>

                {/* Search Bar Input */}
                <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <Ionicons name="search" size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Search any food, drink, or meal..."
                    placeholderTextColor={colors.textMuted}
                    value={recipeSearchQuery}
                    onChangeText={(q) => {
                      setRecipeSearchQuery(q);
                      if (q && activeSection !== 'recipes') {
                        setActiveSection('recipes');
                      }
                    }}
                  />
                  {recipeSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setRecipeSearchQuery('')}>
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Horizontal Category Filter Pills */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                  {CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.catChip,
                          {
                            backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSelectedCategory(cat);
                        }}
                      >
                        <Text
                          style={[
                            styles.catChipText,
                            {
                              color: isSelected ? '#09090b' : colors.text,
                              fontWeight: isSelected ? '800' : '600',
                            },
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Full Database Results List */}
                <View style={[styles.recipeListGroup, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  {filteredRecipes.slice(0, 10).map((rec, index) => {
                    const isLast = index === Math.min(filteredRecipes.length, 10) - 1;
                    return (
                      <React.Fragment key={rec.id}>
                        <TouchableOpacity
                          style={styles.recipeRowItem}
                          onPress={() => handleSelectRecipe(rec)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.recipeIconWrap, { backgroundColor: colors.surfaceElevated }]}>
                            <Ionicons name={rec.icon as any} size={15} color={colors.primary} />
                          </View>
                          <View style={{ flex: 1, paddingRight: 6 }}>
                            <Text style={[styles.recipeItemTitle, { color: colors.text }]} numberOfLines={1}>
                              {rec.name}
                            </Text>
                            <Text style={[styles.recipeItemSub, { color: colors.textMuted }]}>
                              {rec.portion} · P: {rec.protein}g · C: {rec.carbs}g · F: {rec.fat}g
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.recipeItemCals, { color: colors.primary }]}>{rec.calories} kcal</Text>
                            <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: '600' }}>{rec.category}</Text>
                          </View>
                        </TouchableOpacity>
                        {!isLast && <View style={[styles.recipeDivider, { backgroundColor: colors.border }]} />}
                      </React.Fragment>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  fullPageContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  exitBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
  },
  scrollBody: {
    padding: 14,
    paddingBottom: 36,
    gap: 12,
  },
  photoHalfSection: {
    height: Math.min(260, SCREEN_HEIGHT * 0.32),
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  photoFill: {
    width: '100%',
    height: '100%',
  },
  retakeBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  retakeBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyPhotoBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  cameraCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  photoPromptTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
    marginBottom: 12,
    textAlign: 'center',
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cameraActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },
  cameraActionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#09090b',
  },
  libraryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  libraryActionText: {
    fontSize: 13,
    fontWeight: '700',
  },

  /* Viewfinder crosshairs overlaid on image */
  viewfinderOverlay: {
    ...StyleSheet.absoluteFill,
    padding: 16,
    justifyContent: 'space-between',
  },
  viewfinderEmptyBox: {
    width: 140,
    height: 100,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 20,
    height: 20,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
  },
  photoScanBeam: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2.5,
    borderRadius: 1,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },

  /* Food-Themed Scanning Bar Loading State */
  satisfyingLoadingCard: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 12,
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
  satisfyingLoadingTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  satisfyingLoadingSub: {
    fontSize: 11,
    fontWeight: '500',
  },

  /* Category Filter Chips */
  categoryScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 11,
  },

  /* Active Result Card */
  activeResultCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 10,
  },
  resultTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  resultBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dishTitle: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
  },
  dishPortion: {
    fontSize: 12,
    marginTop: 2,
  },
  clearBtn: {
    padding: 4,
  },
  macroGrid: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
  },
  macroCol: {
    flex: 1,
    alignItems: 'center',
  },
  macroSep: {
    width: 1,
    height: '70%',
    alignSelf: 'center',
  },
  macroColLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  macroColNum: {
    fontSize: 13,
    fontWeight: '800',
  },
  quantityStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  qtyLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  qtyValue: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValBox: {
    minWidth: 34,
    alignItems: 'center',
  },
  stepperValText: {
    fontSize: 13,
    fontWeight: '800',
  },
  logMealSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  logMealSubmitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#09090b',
  },

  /* Expand / Collapse More Options */
  expandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  expandToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },

  /* Type & Recipe Sections */
  typeSectionCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  describeTextInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 50,
  },
  calcDescribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  calcDescribeBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#09090b',
  },
  recipeSectionCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 2,
  },
  recipeListGroup: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  recipeRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  recipeDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
  },
  recipeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeItemTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  recipeItemSub: {
    fontSize: 11,
    marginTop: 1,
  },
  recipeItemCals: {
    fontSize: 12,
    fontWeight: '800',
  },
});
