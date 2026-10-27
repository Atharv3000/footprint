import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { describeFoodAsync } from '@/constants/foodVisionAI';
import { MealLog, MealType, saveMealLog, getTodayDateKey } from '@/constants/nutritionStorage';

interface AIDescribeFoodModalProps {
  visible: boolean;
  initialMealType?: MealType;
  onClose: () => void;
  onMealSaved: (meal: MealLog) => void;
}

export function AIDescribeFoodModal({
  visible,
  initialMealType = 'breakfast',
  onClose,
  onMealSaved,
}: AIDescribeFoodModalProps) {
  const { colors } = useTheme();

  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [description, setDescription] = useState<string>('');
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [calculatedResult, setCalculatedResult] = useState<any | null>(null);
  const [quantityMultiplier, setQuantityMultiplier] = useState<number>(1);

  React.useEffect(() => {
    if (visible && initialMealType) {
      setMealType(initialMealType);
    }
  }, [visible, initialMealType]);

  const handleCalculate = async () => {
    if (!description.trim()) {
      alert('Please describe what you ate or drank.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsCalculating(true);
    setCalculatedResult(null);
    setQuantityMultiplier(1);

    try {
      const res = await describeFoodAsync(description);
      setCalculatedResult(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.error('Describe food error:', e);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSave = async () => {
    if (!calculatedResult) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const scaledItems = (calculatedResult.items || []).map((it: any) => ({
      ...it,
      calories: Math.round(it.calories * quantityMultiplier),
      proteinG: Math.round(it.proteinG * quantityMultiplier * 10) / 10,
      carbsG: Math.round(it.carbsG * quantityMultiplier * 10) / 10,
      fatG: Math.round(it.fatG * quantityMultiplier * 10) / 10,
      portion: quantityMultiplier !== 1 ? `${quantityMultiplier}x (${it.portion})` : it.portion,
    }));

    const finalMeal: MealLog = {
      id: `meal_desc_${Date.now()}`,
      timestamp: Date.now(),
      dateKey: getTodayDateKey(),
      mealType,
      title: quantityMultiplier !== 1 ? `${calculatedResult.dishTitle} (${quantityMultiplier}x)` : calculatedResult.dishTitle,
      calories: Math.round(calculatedResult.totalCalories * quantityMultiplier),
      proteinG: Math.round(calculatedResult.totalProteinG * quantityMultiplier * 10) / 10,
      carbsG: Math.round(calculatedResult.totalCarbsG * quantityMultiplier * 10) / 10,
      fatG: Math.round(calculatedResult.totalFatG * quantityMultiplier * 10) / 10,
      items: scaledItems,
      aiAnalyzed: true,
      notes: `Described to AI: "${description}"`,
    };

    await saveMealLog(finalMeal);
    onMealSaved(finalMeal);
    handleResetAndClose();
  };

  const handleResetAndClose = () => {
    setDescription('');
    setCalculatedResult(null);
    setIsCalculating(false);
    setQuantityMultiplier(1);
    onClose();
  };

  const quickExamples = [
    '2 scrambled eggs, 2 strips of bacon & 1 slice toast',
    '3 chocolate chip cookies & a cold glass of lemonade',
    'Grilled chicken breast with 1 cup white rice and broccoli',
    '1 protein shake bottle and 1 banana',
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleResetAndClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleResetAndClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Describe Food to AI</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              Natural language & quantity calculator
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

          {/* Description Input Card */}
          <View style={[styles.inputCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <Text style={[styles.inputLabel, { color: colors.text }]}>What did you eat or drink?</Text>
            </View>
            <Text style={[styles.inputDesc, { color: colors.textMuted }]}>
              Include counts and portions. E.g., "3 cookies", "2 glasses of lemonade", "1 bowl of oats with blueberries".
            </Text>

            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border },
              ]}
              placeholder="e.g. 3 cookies and a cold glass of lemonade..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />

            {/* Quick Inspiration Pills */}
            <View style={styles.examplesWrap}>
              <Text style={[styles.examplesLabel, { color: colors.textMuted }]}>TAP TO TRY AN EXAMPLE:</Text>
              <View style={styles.examplesRow}>
                {quickExamples.map((ex) => (
                  <TouchableOpacity
                    key={ex}
                    style={[styles.exampleChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                    onPress={() => setDescription(ex)}
                  >
                    <Text style={[styles.exampleChipText, { color: colors.text }]}>{ex}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.calcBtn, { backgroundColor: colors.primary, opacity: isCalculating ? 0.7 : 1 }]}
              onPress={handleCalculate}
              disabled={isCalculating}
            >
              {isCalculating ? (
                <ActivityIndicator size="small" color="#09090b" />
              ) : (
                <>
                  <Ionicons name="calculator-outline" size={18} color="#09090b" />
                  <Text style={styles.calcBtnText}>Calculate Nutrition</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Calculated Nutrition Summary Card */}
          {calculatedResult && (
            <View style={[styles.resultCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <View style={styles.resultHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultSub, { color: colors.primary }]}>AI CALCULATED MEAL</Text>
                  <Text style={[styles.resultTitle, { color: colors.text }]}>{calculatedResult.dishTitle}</Text>
                </View>
              </View>

              {/* Macro Grid */}
              <View style={[styles.macroGrid, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <View style={styles.macroGridCol}>
                  <Text style={[styles.macroGridLabel, { color: colors.textMuted }]}>CALORIES</Text>
                  <Text style={[styles.macroGridVal, { color: colors.text }]}>
                    {Math.round(calculatedResult.totalCalories * quantityMultiplier)}{' '}
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>kcal</Text>
                  </Text>
                </View>
                <View style={[styles.gridSep, { backgroundColor: colors.border }]} />
                <View style={styles.macroGridCol}>
                  <Text style={[styles.macroGridLabel, { color: '#38bdf8' }]}>PROTEIN</Text>
                  <Text style={[styles.macroGridVal, { color: colors.text }]}>
                    {Math.round(calculatedResult.totalProteinG * quantityMultiplier * 10) / 10}g
                  </Text>
                </View>
                <View style={[styles.gridSep, { backgroundColor: colors.border }]} />
                <View style={styles.macroGridCol}>
                  <Text style={[styles.macroGridLabel, { color: '#a3e635' }]}>CARBS</Text>
                  <Text style={[styles.macroGridVal, { color: colors.text }]}>
                    {Math.round(calculatedResult.totalCarbsG * quantityMultiplier * 10) / 10}g
                  </Text>
                </View>
                <View style={[styles.gridSep, { backgroundColor: colors.border }]} />
                <View style={styles.macroGridCol}>
                  <Text style={[styles.macroGridLabel, { color: '#f59e0b' }]}>FAT</Text>
                  <Text style={[styles.macroGridVal, { color: colors.text }]}>
                    {Math.round(calculatedResult.totalFatG * quantityMultiplier * 10) / 10}g
                  </Text>
                </View>
              </View>

              {/* Quantity Stepper */}
              <View style={[styles.quantityRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.qtyLabel, { color: colors.textMuted }]}>QUANTITY / SERVINGS</Text>
                  <Text style={[styles.qtyDesc, { color: colors.text }]}>
                    {quantityMultiplier === 1 ? '1x standard serving' : `${quantityMultiplier}x multiple`}
                  </Text>
                </View>
                <View style={styles.stepperWrap}>
                  <TouchableOpacity
                    style={[styles.stepperBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                    onPress={() => {
                      if (quantityMultiplier > 0.5) {
                        Haptics.selectionAsync().catch(() => {});
                        setQuantityMultiplier((prev) => Math.max(0.5, prev - 0.5));
                      }
                    }}
                  >
                    <Ionicons name="remove" size={16} color={colors.text} />
                  </TouchableOpacity>
                  <View style={styles.stepperValBox}>
                    <Text style={[styles.stepperValText, { color: colors.text }]}>{quantityMultiplier}x</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.stepperBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                    onPress={() => {
                      if (quantityMultiplier < 10) {
                        Haptics.selectionAsync().catch(() => {});
                        setQuantityMultiplier((prev) => prev + 0.5);
                      }
                    }}
                  >
                    <Ionicons name="add" size={16} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Parsed Items List */}
              {calculatedResult.items && calculatedResult.items.length > 0 && (
                <View style={styles.itemsSection}>
                  <Text style={[styles.itemsSectionTitle, { color: colors.textMuted }]}>
                    PARSED INGREDIENTS & PORTIONS ({calculatedResult.items.length})
                  </Text>
                  {calculatedResult.items.map((it: any) => (
                    <View
                      key={it.id}
                      style={[styles.itemCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemName, { color: colors.text }]}>{it.name}</Text>
                        <Text style={[styles.itemPortion, { color: colors.textMuted }]}>Portion: {it.portion}</Text>
                      </View>
                      <Text style={[styles.itemCals, { color: colors.primary }]}>
                        {Math.round(it.calories * quantityMultiplier)} kcal
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Log Meal Button */}
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                <Ionicons name="checkmark-circle" size={20} color="#09090b" />
                <Text style={styles.saveBtnText}>Log to {mealType.toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 17,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
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
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTypePillText: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  inputCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  inputDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
    minHeight: 70,
    marginBottom: 12,
  },
  examplesWrap: {
    marginBottom: 14,
  },
  examplesLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  examplesRow: {
    gap: 6,
  },
  exampleChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  exampleChipText: {
    fontSize: 12,
  },
  calcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  calcBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#09090b',
  },
  resultCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  resultSub: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
  },
  macroGrid: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    marginBottom: 14,
  },
  macroGridCol: {
    flex: 1,
    alignItems: 'center',
  },
  gridSep: {
    width: 1,
    height: '70%',
    alignSelf: 'center',
  },
  macroGridLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  macroGridVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 14,
  },
  qtyLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  qtyDesc: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValBox: {
    minWidth: 42,
    alignItems: 'center',
  },
  stepperValText: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemsSection: {
    marginBottom: 16,
  },
  itemsSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemPortion: {
    fontSize: 11,
    marginTop: 2,
  },
  itemCals: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#09090b',
  },
});
