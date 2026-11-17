import { AppModal as Modal } from '@/components/AppModal';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Dimensions,
  Animated,
  Easing,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { analyzeFoodImageAsync, describeFoodAsync, FoodVisionAnalysisResult } from '@/constants/foodVisionAI';
import { MealLog, MealType, saveMealLog, getTodayDateKey } from '@/constants/nutritionStorage';
import { FoodItemIndex, HUGE_FOOD_INDEX } from '@/constants/foodDatabase';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORIES = ['All', 'Popular Foods', 'Snacks & Treats', 'Drinks & Shakes', 'Protein & Dairy', 'Breakfast & Bakery', 'Fruits & Veggies'] as const;

export type FoodScanMode = 'food' | 'label' | 'receipt';

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
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<FoodVisionAnalysisResult | null>(null);
  const [servingMultiplier, setServingMultiplier] = useState<number>(1);

  // Active scan mode: 'food' | 'label' | 'receipt'
  const [scanMode, setScanMode] = useState<FoodScanMode>('food');

  // Sub-feature drawers/sections: 'none' | 'describe' | 'preselected'
  const [activeSheet, setActiveSheet] = useState<'none' | 'describe' | 'preselected'>('none');

  // Camera permissions & ref
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  // Real-time analysis status stages and percent display
  const [scanStatusText, setScanStatusText] = useState<string>('Scanning meal composition...');
  const [scanPercent, setScanPercent] = useState<number>(18);

  useEffect(() => {
    if (visible && initialMealType) {
      setMealType(initialMealType);
    }
  }, [visible, initialMealType]);

  // Request camera permission when modal becomes visible if not yet determined
  useEffect(() => {
    if (visible && !permission?.granted && permission?.canAskAgain) {
      requestPermission().catch(() => {});
    }
  }, [visible, permission]);

  // Scanner animation loop
  useEffect(() => {
    if (isAnalyzing) {
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

      pulseLoop.start();
      progressTiming.start();
      glowLoop.start();

      const phases = scanMode === 'receipt' ? [
        { text: 'Scanning receipt text & line items...', pct: 25, delay: 0 },
        { text: 'Detecting grocery items & quantities...', pct: 50, delay: 900 },
        { text: 'Matching products to USDA nutrition...', pct: 75, delay: 1900 },
        { text: 'Calculating cumulative macros...', pct: 92, delay: 2800 },
      ] : scanMode === 'label' ? [
        { text: 'Scanning Nutrition Facts panel...', pct: 25, delay: 0 },
        { text: 'Reading serving size & calories...', pct: 55, delay: 900 },
        { text: 'Extracting protein, carbs & fats...', pct: 80, delay: 1900 },
        { text: 'Validating label macros...', pct: 95, delay: 2800 },
      ] : [
        { text: 'Scanning meal composition...', pct: 22, delay: 0 },
        { text: 'Identifying dish & ingredients...', pct: 48, delay: 900 },
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
        pulseLoop.stop();
        progressTiming.stop();
        glowLoop.stop();
      };
    } else {
      pulseAnim.setValue(1);
      scanLineAnim.setValue(1);
      glowAnim.setValue(0.3);
      setScanPercent(100);
    }
  }, [isAnalyzing, scanMode]);

  // Capture snapshot directly from CameraView and analyze
  const handleCaptureFromCamera = async (overrideMode?: FoodScanMode) => {
    const activeTargetMode = overrideMode || scanMode;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!cameraRef.current) {
      // Fallback to ImagePicker camera if CameraView ref is not ready
      await handleFallbackCamera(activeTargetMode);
      return;
    }

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: false,
      });

      if (photo && photo.uri) {
        setSelectedImage(photo.uri);
        setActiveSheet('none');
        runVisionAnalysis(photo.base64 || '', photo.uri, activeTargetMode);
      }
    } catch (e) {
      console.warn('CameraView capture error, trying image picker fallback:', e);
      await handleFallbackCamera(activeTargetMode);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFallbackCamera = async (targetMode: FoodScanMode) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
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
      setActiveSheet('none');
      runVisionAnalysis(asset.base64 || '', asset.uri, targetMode);
    }
  };

  // Upload an already existing photo from gallery
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
      setActiveSheet('none');
      runVisionAnalysis(asset.base64 || '', asset.uri, scanMode);
    }
  };

  const runVisionAnalysis = async (base64: string, uri: string, modeHint: FoodScanMode = scanMode) => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setServingMultiplier(1);
    try {
      const contextHint = modeHint === 'receipt' 
        ? `${mealType} (grocery receipt / itemized bill)` 
        : modeHint === 'label' 
        ? `${mealType} (nutrition facts label / barcode)` 
        : mealType;

      const result = await analyzeFoodImageAsync(base64, contextHint, descriptionInput);
      setAnalysisResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.error('Vision analysis error:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // AI Description Text Calculator ("Write what it is")
  const handleCalculateFromDescription = async () => {
    if (!descriptionInput.trim()) {
      alert('Please type what you ate (e.g. 3 cookies and a glass of lemonade).');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setServingMultiplier(1);
    setActiveSheet('none');

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

  // Quick Recipe / Food Index Tap Selection ("Choose from preselected stuff")
  const handleSelectRecipe = (rec: FoodItemIndex) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveSheet('none');
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
    Keyboard.dismiss();
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
    setIsCapturing(false);
    setActiveSheet('none');
    onClose();
  };

  // Filter recipes based on category and search text across huge database
  const filteredRecipes = HUGE_FOOD_INDEX.filter((r) => {
    const matchesCat = selectedCategory === 'All' || r.category === selectedCategory;
    const query = recipeSearchQuery.toLowerCase().trim();
    const matchesQuery = !query || r.name.toLowerCase().includes(query) || r.category.toLowerCase().includes(query);
    return matchesCat && matchesQuery;
  });

  // Switch scan mode without interrupting the live camera
  const handleModePress = (mode: FoodScanMode) => {
    Haptics.selectionAsync().catch(() => {});
    setScanMode(mode);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleResetAndClose}>
      <View style={[styles.safeArea, { backgroundColor: '#09090b' }]}>
        <View style={styles.fullPageContainer}>
          {/* Top Bar Floating Controls */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={handleResetAndClose} style={styles.topIconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.topMealTag}>
              <Ionicons name="restaurant-outline" size={14} color={colors.primary} />
              <Text style={[styles.topMealTagText, { color: '#ffffff' }]}>
                {mealType.toUpperCase()}
              </Text>
            </View>

            {selectedImage ? (
              <TouchableOpacity
                onPress={() => {
                  setSelectedImage(null);
                  setAnalysisResult(null);
                }}
                style={styles.topIconBtn}
              >
                <Ionicons name="refresh" size={20} color="#ffffff" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>

          {/* MAIN CAMERA VIEWER */}
          <View style={styles.cameraViewportWrap}>
            {selectedImage ? (
              <View style={styles.previewContainer}>
                <Image source={{ uri: selectedImage }} style={styles.cameraFill} resizeMode="cover" />
                {/* Viewfinder crosshairs overlaid on captured photo */}
                <View style={styles.viewfinderOverlay}>
                  <View style={styles.cornerTL} />
                  <View style={styles.cornerTR} />
                  <View style={styles.cornerBL} />
                  <View style={styles.cornerBR} />

                  {isAnalyzing && (
                    <Animated.View
                      style={[
                        styles.photoScanBeam,
                        {
                          backgroundColor: '#ffffff',
                          transform: [
                            {
                              translateY: scanLineAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [10, 260],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                  )}
                </View>
              </View>
            ) : permission?.granted ? (
              <View style={styles.cameraContainer}>
                <CameraView ref={cameraRef} style={styles.cameraFill} facing="back">
                  {/* Viewfinder target bounds */}
                  <View style={styles.viewfinderOverlay}>
                    <View style={styles.cornerTL} />
                    <View style={styles.cornerTR} />
                    <View style={styles.cornerBL} />
                    <View style={styles.cornerBR} />

                    {/* Mode tag indicator inside the viewfinder */}
                    <View style={styles.cameraModeIndicator}>
                      <Text style={styles.cameraModeIndicatorText}>
                        {scanMode === 'food' ? 'FOOD SCAN' : scanMode === 'label' ? 'NUTRITION LABEL' : 'RECEIPT'}
                      </Text>
                    </View>
                  </View>
                </CameraView>
              </View>
            ) : (
              <View style={[styles.permissionBox, { backgroundColor: '#18181b' }]}>
                <Ionicons name="camera-outline" size={44} color="#ffffff" />
                <Text style={[styles.permissionTitle, { color: '#ffffff' }]}>Camera Access Required</Text>
                <Text style={[styles.permissionSubtitle, { color: 'rgba(255,255,255,0.6)' }]}>
                  StrideTrack uses live vision to scan meals, nutrition labels, and grocery receipts.
                </Text>
                <TouchableOpacity
                  style={styles.grantPermissionBtn}
                  onPress={() => requestPermission()}
                >
                  <Text style={styles.grantPermissionBtnText}>Enable Camera</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Shutter Capture Button (Clean normal camera shutter: white circle with inner disc) */}
            {!selectedImage && !isAnalyzing && (
              <View style={styles.shutterRow}>
                <TouchableOpacity
                  style={styles.shutterOuterRing}
                  onPress={() => handleCaptureFromCamera()}
                  disabled={isCapturing}
                  activeOpacity={0.8}
                >
                  <View style={styles.shutterInnerCircle} />
                </TouchableOpacity>
              </View>
            )}

            {/* TRANSLUCENT OVERLAY MODAL / MENU IN FRONT OF CAMERA FOR TYPING & PRESELECTED */}
            {activeSheet !== 'none' && (
              <View style={styles.cameraSheetOverlayWrap}>
                <View style={styles.cameraSheetCard}>
                  {/* Close / Dismiss Bar */}
                  <View style={styles.cameraSheetHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={styles.cameraSheetHeaderIcon}>
                        <Ionicons
                          name={activeSheet === 'describe' ? 'pencil' : 'list'}
                          size={15}
                          color="#ffffff"
                        />
                      </View>
                      <Text style={styles.cameraSheetHeaderTitle}>
                        {activeSheet === 'describe' ? 'Type / Describe Food' : 'Preselected Foods'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        Keyboard.dismiss();
                        setActiveSheet('none');
                      }}
                      style={styles.cameraSheetCloseBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close" size={17} color="#ffffff" />
                    </TouchableOpacity>
                  </View>

                  {/* ACTIVE SHEET 1: TYPING / DESCRIBE */}
                  {activeSheet === 'describe' && (
                    <View style={styles.sheetBodyPadding}>
                      <TextInput
                        style={styles.describeTextInputClear}
                        placeholder="e.g. 2 eggs, sourdough toast with butter, and an iced latte"
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        value={descriptionInput}
                        onChangeText={setDescriptionInput}
                        multiline
                        numberOfLines={3}
                        returnKeyType="done"
                        blurOnSubmit={true}
                        autoFocus={true}
                        onSubmitEditing={() => Keyboard.dismiss()}
                      />

                      <TouchableOpacity
                        style={styles.calcDescribeBtnClear}
                        onPress={handleCalculateFromDescription}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="sparkles" size={15} color="#000000" />
                        <Text style={styles.calcDescribeBtnClearText}>Analyze Food</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* ACTIVE SHEET 2: PRESELECTED DATABASE */}
                  {activeSheet === 'preselected' && (
                    <View style={styles.sheetBodyPaddingPreselected}>
                      {/* Search Bar Input */}
                      <View style={styles.searchBoxClear}>
                        <Ionicons name="search" size={15} color="rgba(255,255,255,0.6)" />
                        <TextInput
                          style={styles.searchInputClear}
                          placeholder="Search food, beverage, snack..."
                          placeholderTextColor="rgba(255,255,255,0.45)"
                          value={recipeSearchQuery}
                          onChangeText={setRecipeSearchQuery}
                          autoFocus={true}
                        />
                        {recipeSearchQuery.length > 0 && (
                          <TouchableOpacity onPress={() => setRecipeSearchQuery('')}>
                            <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.6)" />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Category Pills */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryScrollClear}
                      >
                        {CATEGORIES.map((cat) => {
                          const isSelected = selectedCategory === cat;
                          return (
                            <TouchableOpacity
                              key={cat}
                              style={[
                                styles.catChipClear,
                                isSelected && styles.catChipClearSelected,
                              ]}
                              onPress={() => {
                                Haptics.selectionAsync().catch(() => {});
                                setSelectedCategory(cat);
                              }}
                            >
                              <Text
                                style={[
                                  styles.catChipClearText,
                                  isSelected && styles.catChipClearTextSelected,
                                ]}
                              >
                                {cat}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {/* Scrollable Preselected Items */}
                      <ScrollView
                        style={{ maxHeight: 220 }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                      >
                        <View style={styles.recipeListGroupClear}>
                          {filteredRecipes.slice(0, 15).map((rec, index) => {
                            const isLast = index === Math.min(filteredRecipes.length, 15) - 1;
                            return (
                              <React.Fragment key={rec.id}>
                                <TouchableOpacity
                                  style={styles.recipeRowItemClear}
                                  onPress={() => {
                                    handleSelectRecipe(rec);
                                    setActiveSheet('none');
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <View style={styles.recipeIconWrapClear}>
                                    <Ionicons name={rec.icon as any} size={15} color="#ffffff" />
                                  </View>
                                  <View style={{ flex: 1, paddingRight: 6 }}>
                                    <Text style={styles.recipeItemTitleClear} numberOfLines={1}>
                                      {rec.name}
                                    </Text>
                                    <Text style={styles.recipeItemSubClear}>
                                      {rec.portion} · P: {rec.protein}g · C: {rec.carbs}g · F: {rec.fat}g
                                    </Text>
                                  </View>
                                  <Text style={styles.recipeItemCalsClear}>{rec.calories} kcal</Text>
                                </TouchableOpacity>
                                {!isLast && <View style={styles.recipeDividerClear} />}
                              </React.Fragment>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* LOWER CONTROLS & RESULTS AREA */}
          <ScrollView
            style={[styles.lowerSection, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.lowerScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* SCANNING PROGRESS CARD */}
            {isAnalyzing && (
              <View style={[styles.satisfyingLoadingCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }]}>
                <View style={styles.scanBarHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
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
                </View>
              </View>
            )}

            {/* ACTIVE NUTRITION CARD (WHEN LOGGED VIA SCAN, TEXT, OR PRESELECTED) */}
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

                  <TouchableOpacity
                    onPress={() => {
                      setAnalysisResult(null);
                      setSelectedImage(null);
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

            {/* 3x2 BUTTON GRID (SOUTH OF THE CAMERA VIEWER) */}
            <View style={styles.gridContainer}>
              {/* ROW 1: SCAN MODES (Food | Nutrition Label | Receipt) */}
              <View style={styles.gridRow}>
                {/* 1. Food Scanner */}
                <TouchableOpacity
                  style={[
                    styles.gridButton,
                    scanMode === 'food' && styles.gridButtonActive,
                  ]}
                  onPress={() => handleModePress('food')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.gridIconCircle, scanMode === 'food' && styles.gridIconCircleActive]}>
                    <Ionicons
                      name="restaurant-outline"
                      size={20}
                      color={scanMode === 'food' ? '#000000' : '#ffffff'}
                    />
                  </View>
                  <Text style={[styles.gridButtonText, scanMode === 'food' && styles.gridButtonTextActive]} numberOfLines={1}>
                    Food
                  </Text>
                </TouchableOpacity>

                {/* 2. Nutrition Label Scanner */}
                <TouchableOpacity
                  style={[
                    styles.gridButton,
                    scanMode === 'label' && styles.gridButtonActive,
                  ]}
                  onPress={() => handleModePress('label')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.gridIconCircle, scanMode === 'label' && styles.gridIconCircleActive]}>
                    <Ionicons
                      name="barcode-outline"
                      size={20}
                      color={scanMode === 'label' ? '#000000' : '#ffffff'}
                    />
                  </View>
                  <Text style={[styles.gridButtonText, scanMode === 'label' && styles.gridButtonTextActive]} numberOfLines={1}>
                    Label
                  </Text>
                </TouchableOpacity>

                {/* 3. Receipt Scanner */}
                <TouchableOpacity
                  style={[
                    styles.gridButton,
                    scanMode === 'receipt' && styles.gridButtonActive,
                  ]}
                  onPress={() => handleModePress('receipt')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.gridIconCircle, scanMode === 'receipt' && styles.gridIconCircleActive]}>
                    <Ionicons
                      name="receipt-outline"
                      size={20}
                      color={scanMode === 'receipt' ? '#000000' : '#ffffff'}
                    />
                  </View>
                  <Text style={[styles.gridButtonText, scanMode === 'receipt' && styles.gridButtonTextActive]} numberOfLines={1}>
                    Receipt
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ROW 2: OTHER FEATURES (Typing / Describe | Preselected | Upload Photo) */}
              <View style={styles.gridRow}>
                {/* 4. Type / Describe */}
                <TouchableOpacity
                  style={[
                    styles.gridButton,
                    activeSheet === 'describe' && styles.gridButtonActive,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setActiveSheet((curr) => (curr === 'describe' ? 'none' : 'describe'));
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.gridIconCircle, activeSheet === 'describe' && styles.gridIconCircleActive]}>
                    <Ionicons
                      name="pencil-outline"
                      size={20}
                      color={activeSheet === 'describe' ? '#000000' : '#ffffff'}
                    />
                  </View>
                  <Text style={[styles.gridButtonText, activeSheet === 'describe' && styles.gridButtonTextActive]} numberOfLines={1}>
                    Typing
                  </Text>
                </TouchableOpacity>

                {/* 5. Choose From Preselected */}
                <TouchableOpacity
                  style={[
                    styles.gridButton,
                    activeSheet === 'preselected' && styles.gridButtonActive,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setActiveSheet((curr) => (curr === 'preselected' ? 'none' : 'preselected'));
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.gridIconCircle, activeSheet === 'preselected' && styles.gridIconCircleActive]}>
                    <Ionicons
                      name="list-outline"
                      size={20}
                      color={activeSheet === 'preselected' ? '#000000' : '#ffffff'}
                    />
                  </View>
                  <Text style={[styles.gridButtonText, activeSheet === 'preselected' && styles.gridButtonTextActive]} numberOfLines={1}>
                    Preselected
                  </Text>
                </TouchableOpacity>

                {/* 6. Upload Photo */}
                <TouchableOpacity
                  style={styles.gridButton}
                  onPress={handlePickLibrary}
                  activeOpacity={0.7}
                >
                  <View style={styles.gridIconCircle}>
                    <Ionicons name="images-outline" size={20} color="#ffffff" />
                  </View>
                  <Text style={styles.gridButtonText} numberOfLines={1}>
                    Upload
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* EXPANDED DRAWER: WRITE WHAT IT IS */}
            {activeSheet === 'describe' && (
              <View style={[styles.typeSectionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }]}>
                <View style={[styles.sectionHeaderRow, { justifyContent: 'space-between' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.sectionIconWrap, { backgroundColor: '#38bdf820' }]}>
                      <Ionicons name="chatbubble-ellipses" size={16} color="#38bdf8" />
                    </View>
                    <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>Describe Your Meal</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => Keyboard.dismiss()}
                    style={styles.keyboardDismissBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="chevron-down-circle" size={18} color={colors.primary} />
                    <Text style={[styles.keyboardDismissText, { color: colors.primary }]}>Done</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[
                    styles.describeTextInput,
                    { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder="e.g. 2 eggs, sourdough toast with butter, and an iced latte"
                  placeholderTextColor={colors.textMuted}
                  value={descriptionInput}
                  onChangeText={setDescriptionInput}
                  multiline
                  numberOfLines={2}
                  returnKeyType="done"
                  blurOnSubmit={true}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />

                <TouchableOpacity
                  style={[styles.calcDescribeBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCalculateFromDescription}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flash-outline" size={15} color="#09090b" />
                  <Text style={styles.calcDescribeBtnText}>Calculate Nutrition</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* EXPANDED DRAWER: CHOOSE PRESELECTED FOODS */}
            {activeSheet === 'preselected' && (
              <View style={[styles.recipeSectionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionIconWrap, { backgroundColor: `${colors.primary}20` }]}>
                    <Ionicons name="search" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>Preselected Food Database</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }}>{filteredRecipes.length} items</Text>
                  </View>
                </View>

                {/* Search Bar Input */}
                <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <Ionicons name="search" size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Search any food, beverage, or brand..."
                    placeholderTextColor={colors.textMuted}
                    value={recipeSearchQuery}
                    onChangeText={setRecipeSearchQuery}
                    autoFocus
                  />
                  {recipeSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setRecipeSearchQuery('')}>
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Category Pills */}
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

                {/* Results List */}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardDismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  keyboardDismissText: {
    fontSize: 12,
    fontWeight: '700',
  },
  safeArea: {
    flex: 1,
  },
  fullPageContainer: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  topIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  topMealTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  topMealTagText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* MAIN CAMERA VIEWPORT */
  cameraViewportWrap: {
    width: '100%',
    height: Math.min(420, SCREEN_HEIGHT * 0.44),
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  cameraContainer: {
    width: '100%',
    height: '100%',
  },
  previewContainer: {
    width: '100%',
    height: '100%',
  },
  cameraFill: {
    width: '100%',
    height: '100%',
  },
  viewfinderOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cameraModeIndicator: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    marginTop: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cameraModeIndicatorText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cornerTL: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 26,
    height: 26,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 26,
    height: 26,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopRightRadius: 6,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    width: 26,
    height: 26,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 26,
    height: 26,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomRightRadius: 6,
  },
  photoScanBeam: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 2,
    borderRadius: 1,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },

  /* Shutter Capture Button */
  shutterRow: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
  },
  shutterOuterRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInnerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
  },

  /* Camera Overlay Floating Modal / Menu (clearish in front of camera view) */
  cameraSheetOverlayWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingTop: 56,
    paddingBottom: 16,
    zIndex: 40,
    justifyContent: 'center',
  },
  cameraSheetCard: {
    backgroundColor: 'rgba(24, 24, 27, 0.88)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  cameraSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  cameraSheetHeaderIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraSheetHeaderTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cameraSheetCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBodyPadding: {
    padding: 14,
    gap: 12,
  },
  describeTextInputClear: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    color: '#ffffff',
    fontSize: 13.5,
    minHeight: 76,
    textAlignVertical: 'top',
  },
  calcDescribeBtnClear: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 11,
    gap: 6,
  },
  calcDescribeBtnClearText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  sheetBodyPaddingPreselected: {
    padding: 12,
    gap: 10,
  },
  searchBoxClear: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
  },
  searchInputClear: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    paddingVertical: 0,
  },
  categoryScrollClear: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  catChipClear: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  catChipClearSelected: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  catChipClearText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  catChipClearTextSelected: {
    color: '#000000',
    fontWeight: '800',
  },
  recipeListGroupClear: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  recipeRowItemClear: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 10,
  },
  recipeIconWrapClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeItemTitleClear: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  recipeItemSubClear: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10.5,
    marginTop: 1,
  },
  recipeItemCalsClear: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  recipeDividerClear: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 10,
  },

  /* Camera Permission Box */
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  permissionTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 6,
  },
  permissionSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  grantPermissionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
  },
  grantPermissionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#09090b',
  },

  /* LOWER CONTROLS & RESULTS */
  lowerSection: {
    flex: 1,
  },
  lowerScrollContent: {
    padding: 14,
    paddingBottom: 40,
    gap: 14,
  },

  /* 3x2 Grid South of the Camera View: Circular White/Grey Buttons with transparent labels */
  gridContainer: {
    gap: 12,
    paddingVertical: 4,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  gridButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 64,
  },
  gridButtonActive: {
    opacity: 1,
  },
  gridIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridIconCircleActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  gridButtonText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 0.2,
  },
  gridButtonTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },

  /* Scanning Progress */
  satisfyingLoadingCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 10,
  },
  scanBarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  satisfyingLoadingTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
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
    justifyContent: 'center',
  },
  scanBarFill: {
    height: '100%',
    borderRadius: 5,
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

  /* Drawer Cards */
  typeSectionCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
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
    minHeight: 52,
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
    borderWidth: 1.5,
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
