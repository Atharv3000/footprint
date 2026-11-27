import { FoodItem } from './nutritionStorage';
import { estimateDescription } from './foodTextMatcher';
import { AI_SERVER_WS_URL, getAIServerUrl, aiRequest } from './aiServer';

export { AI_SERVER_WS_URL, getAIServerUrl };

export interface FoodCandidate {
  id: string;
  title: string;
  confidence: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portion: string;
  tags?: string[];
}

export interface PortionVariant {
  label: string;
  sublabel: string;
  multiplier: number;
}

export interface FoodVisionAnalysisResult {
  dishTitle: string;
  confidence: number;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  items: FoodItem[];
  candidates?: FoodCandidate[];
  portionVariants?: PortionVariant[];
  servingsPerContainer?: number;
  healthScore: number; // 0..100
  dietaryTags: string[];
  tips: string;
  isFood?: boolean;
  nonFoodReason?: string;
  detectedSubject?: string;
  /** Several separate foods were found in the photo (one entry each in `items`). */
  isMultiItem?: boolean;
  /** A branded product (barcode, label or pack text) from Open Food Facts. */
  isProduct?: boolean;
  isReceipt?: boolean;
  isRecipe?: boolean;
  /** Recipe: number of servings the recipe makes (items[0] is one serving). */
  servings?: number;
  ingredients?: { name: string; portion: string; calories: number; matched: boolean }[];
  /** Less certain foods also seen in the photo; the user can add them with one tap. */
  alsoSpotted?: FoodItem[];
}

/*
 * Both food features run on the trained Footprint AI models (footprint_ai/):
 *  - photo: food/non-food gate -> Google AIY food classifier (2,023 dishes) + trained dish head -> USDA SR28 nutrition
 *  - text:  USDA SR28 + curated aliases/recipes with an amount parser
 * Routing (AI server, Metro proxy or hosted rep server) is handled by aiRequest in ./aiServer.
 * If nothing answers, photos report "AI server unreachable" (no made-up dish), and text falls back to
 * the on-device nutrition index, clearly labelled as an offline estimate.
 */

type Raw = { ok: boolean; data?: any; error?: string; offline?: boolean };

function requestFood(kind: 'photo' | 'text', payload: Record<string, unknown>, timeoutMs: number): Promise<Raw> {
  return aiRequest(kind === 'photo' ? 'analyze_food' : 'describe_food', payload, timeoutMs);
}

function toItems(raw: any[] | undefined, prefix: string): FoodItem[] {
  return (raw || []).map((it: any, i: number) => ({
    id: it.id || `${prefix}_${Date.now()}_${i}`,
    name: it.name,
    portion: it.portion || '1 serving',
    calories: it.calories ?? 0,
    proteinG: it.proteinG ?? 0,
    carbsG: it.carbsG ?? 0,
    fatG: it.fatG ?? 0,
    fiberG: it.fiberG ?? undefined,
    confidence: it.confidence ?? 0.8,
  }));
}

/** Server scan result (items[] + totals) -> the result the logging screen shows. */
function fromScan(d: any, prefix: string): FoodVisionAnalysisResult {
  return {
    dishTitle: d.dishTitle,
    confidence: d.confidence ?? 0,
    totalCalories: d.totalCalories ?? 0,
    totalProteinG: d.totalProteinG ?? 0,
    totalCarbsG: d.totalCarbsG ?? 0,
    totalFatG: d.totalFatG ?? 0,
    items: toItems(d.items, prefix),
    candidates: d.candidates || [],
    portionVariants: d.portionVariants || [],
    servingsPerContainer: d.servingsPerContainer || 1.0,
    healthScore: d.healthScore ?? 0,
    dietaryTags: d.dietaryTags || [],
    tips: d.tips || '',
    isFood: true,
    isMultiItem: !!d.isMultiItem,
    isProduct: !!d.isProduct,
    isReceipt: !!d.isReceipt,
    isRecipe: !!d.isRecipe,
    servings: d.servings,
    ingredients: d.ingredients,
    alsoSpotted: toItems(d.alsoSpotted, 'also'),
  };
}

function scanFailure(res: Raw, what: string): FoodVisionAnalysisResult {
  if (res.offline) {
    return errorResult('AI Server Unreachable', 'Offline', `${res.error || 'Could not reach the AI server.'} Check your connection and try again.`, 'Connection Issue');
  }
  return errorResult(`Could Not Read ${what}`, 'Unreadable', res.error || `The ${what.toLowerCase()} could not be read. Fill the frame, avoid glare and try again.`, what);
}

/** Barcode (already read by the camera) and/or a photo of a nutrition label or package -> one product. */
export async function scanLabelAsync(base64Image: string, barcode?: string): Promise<FoodVisionAnalysisResult> {
  const res = await aiRequest('scan_label', { image: base64Image || '', barcode: barcode || '' }, 25000);
  return res.ok ? fromScan(res.data, 'label') : scanFailure(res, 'Label');
}

/** Receipt photo -> the food items bought, each with nutrition for a typical serving. */
export async function readReceiptAsync(base64Image: string): Promise<FoodVisionAnalysisResult> {
  const res = await aiRequest('read_receipt', { image: base64Image }, 30000);
  return res.ok ? fromScan(res.data, 'rcpt') : scanFailure(res, 'Receipt');
}

/** Recipe photo or pasted recipe text -> nutrition for one serving. */
export async function readRecipeAsync(input: { image?: string; text?: string }): Promise<FoodVisionAnalysisResult> {
  const res = await aiRequest('read_recipe', { image: input.image || '', text: input.text || '' }, 30000);
  return res.ok ? fromScan(res.data, 'recipe') : scanFailure(res, 'Recipe');
}

/** Pasted text that is a recipe (several ingredient lines, or an "Ingredients"/"Serves" line), not a meal. */
export function looksLikeRecipe(text: string): boolean {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (/\b(ingredients|serves|servings|yield|makes \d+|directions|instructions)\b/i.test(text) && lines.length >= 3) return true;
  return lines.filter((l) => /^([-•*]\s*)?(\d|½|¼|¾|⅓|⅔)/.test(l)).length >= 4;
}

function errorResult(title: string, tag: string, message: string, subject: string): FoodVisionAnalysisResult {
  return {
    dishTitle: title,
    confidence: 0,
    totalCalories: 0,
    totalProteinG: 0,
    totalCarbsG: 0,
    totalFatG: 0,
    items: [],
    candidates: [],
    healthScore: 0,
    dietaryTags: [tag],
    tips: message,
    isFood: false,
    nonFoodReason: message,
    detectedSubject: subject,
  };
}

/** Food photo -> dish + USDA nutrition. An optional text hint ("2 eggs and toast") takes priority. */
export async function analyzeFoodImageAsync(
  base64Image: string,
  mealTypeHint: string = 'lunch',
  userTextDescription?: string
): Promise<FoodVisionAnalysisResult> {
  const res = await requestFood('photo', { image: base64Image, hint: userTextDescription || '', mealHint: mealTypeHint }, 20000);

  if (!res.ok) {
    if (res.offline) {
      return errorResult(
        'AI Server Unreachable',
        'Offline',
        `${res.error || 'Could not reach the AI server.'} Start it with "npm run start:reps" (or "npm run start:ai") and keep the phone on the same Wi-Fi, or describe the meal in words.`,
        'Connection Issue'
      );
    }
    return errorResult('Could Not Identify Food', 'Unrecognized', res.error || 'The food could not be classified. Try again with the meal centred and well lit.', 'Unrecognized Item');
  }

  const d = res.data;
  if (d.isFood === false) {
    return {
      ...errorResult(
        'Not Recognized as Food',
        'Not Food',
        d.error || 'This does not look like food. Point the camera at the meal so it fills most of the frame.',
        d.detectedSubject || 'Not food'
      ),
      confidence: (d.confidence || 0) / 100,
    };
  }

  if (Array.isArray(d.items) && (d.isMultiItem || d.isProduct || d.items.length > 1)) {
    return fromScan(d, 'food');
  }

  let items: FoodItem[] = [
    {
      id: `food_${Date.now()}_1`,
      name: d.dishTitle,
      portion: d.portion || '1 standard serving',
      calories: d.totalCalories,
      proteinG: d.totalProteinG,
      carbsG: d.totalCarbsG,
      fatG: d.totalFatG,
      confidence: d.confidence,
    },
  ];
  if (Array.isArray(d.scannedIngredients) && d.scannedIngredients.length > 0 && d.isLabel) {
    items = d.scannedIngredients.map((ing: any, i: number) => ({
      id: ing.id || `ing_${Date.now()}_${i}`,
      name: ing.name,
      portion: ing.portion || '1 portion',
      calories: ing.calories ?? 0,
      proteinG: ing.proteinG ?? 0,
      carbsG: ing.carbsG ?? 0,
      fatG: ing.fatG ?? 0,
      confidence: ing.confidence ?? 0.8,
    }));
  }

  return {
    dishTitle: d.dishTitle,
    confidence: d.confidence,
    totalCalories: d.totalCalories,
    totalProteinG: d.totalProteinG,
    totalCarbsG: d.totalCarbsG,
    totalFatG: d.totalFatG,
    items,
    candidates: d.candidates || [],
    portionVariants: d.portionVariants || [],
    servingsPerContainer: d.servingsPerContainer || 1.0,
    healthScore: d.healthScore ?? 0,
    dietaryTags: d.dietaryTags || [],
    tips: d.tips || `USDA-based estimate: ${d.totalCalories} kcal, ${d.totalProteinG} g protein.`,
    isFood: true,
    alsoSpotted: toItems(d.alsoSpotted, 'also'),
  };
}

function offlineDescription(descriptionText: string, reason: string): FoodVisionAnalysisResult {
  const clean = descriptionText.trim() || 'Meal';
  const described = estimateDescription(clean);
  const items: FoodItem[] = described.map((d, i) => ({
    id: `desc_offline_${i}_${Date.now()}`,
    name: d.name,
    portion: d.portion,
    calories: d.calories,
    proteinG: d.proteinG,
    carbsG: d.carbsG,
    fatG: d.fatG,
    confidence: d.confidence,
  }));
  const sum = (k: 'calories' | 'proteinG' | 'carbsG' | 'fatG') => items.reduce((acc, it) => acc + (it[k] || 0), 0);
  const matched = described.filter((d) => d.matchedId).length;
  const confidence = items.length ? described.reduce((a, d) => a + d.confidence, 0) / items.length : 0;
  return {
    dishTitle: clean.charAt(0).toUpperCase() + clean.slice(1),
    confidence,
    totalCalories: Math.round(sum('calories')),
    totalProteinG: Math.round(sum('proteinG') * 10) / 10,
    totalCarbsG: Math.round(sum('carbsG') * 10) / 10,
    totalFatG: Math.round(sum('fatG') * 10) / 10,
    items,
    candidates: [],
    healthScore: 0,
    dietaryTags: ['Offline estimate'],
    tips: `${reason} Offline estimate: ${matched} of ${items.length} item(s) matched the on-device nutrition index; check the rest before saving.`,
    isFood: true,
  };
}

/** Meal description ("3 chocolate chip cookies and a glass of lemonade") -> items + USDA nutrition. */
export async function describeFoodAsync(descriptionText: string): Promise<FoodVisionAnalysisResult> {
  const res = await requestFood('text', { description: descriptionText }, 8000);
  if (!res.ok) return offlineDescription(descriptionText, res.offline ? 'AI server unreachable.' : res.error || 'AI server error.');

  const d = res.data;
  const items: FoodItem[] = (d.items || []).map((it: any, idx: number) => ({
    id: it.id || `item_${idx}_${Date.now()}`,
    name: it.name,
    portion: it.portion || '1 serving',
    calories: it.calories || 0,
    proteinG: it.proteinG || 0,
    carbsG: it.carbsG || 0,
    fatG: it.fatG || 0,
    confidence: it.confidence ?? 0.9,
  }));
  return {
    dishTitle: d.dishTitle || descriptionText,
    confidence: d.confidence ?? 0,
    totalCalories: d.totalCalories || 0,
    totalProteinG: d.totalProteinG || 0,
    totalCarbsG: d.totalCarbsG || 0,
    totalFatG: d.totalFatG || 0,
    items,
    candidates: [],
    healthScore: d.healthScore ?? 0,
    dietaryTags: d.dietaryTags || [],
    tips: d.tips || 'Calculated from your description with USDA data.',
    isFood: true,
  };
}
