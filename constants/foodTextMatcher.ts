import { HUGE_FOOD_INDEX, FoodItemIndex } from './foodDatabase';

/**
 * Offline meal-description estimator.
 *
 * Used when the food AI server cannot be reached. Each part of the description
 * ("2 eggs", "a glass of lemonade") is matched against the app's nutrition
 * index by IDF-weighted word overlap; anything unmatched falls back to broad
 * food-type estimates and is reported with low confidence.
 */

export interface DescribedItem {
  name: string;
  portion: string;
  quantity: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: number;
  matchedId: string | null;
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, half: 0.5, couple: 2, few: 3, dozen: 12,
};

// Container / measure words: describe how much, not what.
const MEASURE = new Set([
  'cup', 'cups', 'glass', 'glasses', 'bowl', 'bowls', 'plate', 'plates', 'serving', 'servings', 'piece', 'pieces',
  'slice', 'slices', 'scoop', 'scoops', 'bottle', 'bottles', 'can', 'cans', 'bag', 'bags', 'handful', 'handfuls',
  'portion', 'portions', 'order', 'orders', 'bar', 'bars', 'of', 'some', 'large', 'small', 'medium', 'big', 'little',
]);
const STOP = new Set(['the', 'with', 'and', 'my', 'had', 'ate', 'i', 'for', 'on', 'in', 'x', 'about', 'like']);
const COUNTABLE = /^(\d+(?:\.\d+)?)\s+(?:large\s+)?(cookies|eggs|strips|links|pancakes|tenders|shrimp|crackers|pieces|chips|crisps|cups(?=\s*\())/i;

function stem(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && /(ches|shes|oes)$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[’'()/,.!-]/g, ' ').split(/\s+/).map(stem)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const INDEX_TOKENS = HUGE_FOOD_INDEX.map((item) => new Set(tokens(item.name)));
const DOC_FREQ: Record<string, number> = {};
INDEX_TOKENS.forEach((set) => set.forEach((t) => { DOC_FREQ[t] = (DOC_FREQ[t] || 0) + 1; }));
const idf = (t: string) => Math.log((HUGE_FOOD_INDEX.length + 1) / ((DOC_FREQ[t] || 0) + 0.5));

export function splitDescription(text: string): string[] {
  return text.split(/[,;\n+&]|\band\b|\bwith\b|\bplus\b/i).map((s) => s.trim()).filter(Boolean);
}

export function parseQuantity(chunk: string): { quantity: number; rest: string } {
  let rest = chunk.trim().toLowerCase();
  let quantity = 1;
  const frac = rest.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
  const num = rest.match(/^(\d+(?:\.\d+)?)\s*(?:x\s+)?(.*)$/);
  if (frac && Number(frac[2]) > 0) {
    quantity = Number(frac[1]) / Number(frac[2]); rest = frac[3];
  } else if (num) {
    quantity = parseFloat(num[1]); rest = num[2];
  } else {
    const first = rest.split(/\s+/)[0];
    if (first in WORD_NUMBERS) {
      quantity = WORD_NUMBERS[first]; rest = rest.slice(first.length).trim();
      if (/^(a|of)\s/.test(rest)) rest = rest.replace(/^(a|of)\s+/, '');
    }
  }
  if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;
  return { quantity: Math.min(quantity, 50), rest };
}

export function matchFood(phrase: string): { item: FoodItemIndex; score: number } | null {
  const query = tokens(phrase).filter((t) => !MEASURE.has(t));
  if (!query.length) return null;
  const total = query.reduce((s, t) => s + idf(t), 0);
  let best: { item: FoodItemIndex; score: number } | null = null;
  HUGE_FOOD_INDEX.forEach((item, i) => {
    const hit = query.filter((t) => INDEX_TOKENS[i].has(t)).reduce((s, t) => s + idf(t), 0);
    // Coverage of the user's words, lightly penalising very long index names.
    const score = hit / total - 0.01 * Math.max(0, INDEX_TOKENS[i].size - query.length);
    if (hit > 0 && (!best || score > best.score)) best = { item, score };
  });
  return best;
}

// Broad per-unit estimates when nothing in the index matches.
const GENERIC: [RegExp, number, number, number, number][] = [
  [/cookie|donut|doughnut|pastry|candy|chocolate|cake|brownie|muffin/, 160, 2, 22, 8],
  [/egg/, 78, 6.3, 0.6, 5.3],
  [/toast|bread|bagel|bun|roll|tortilla/, 85, 3.5, 15, 1.2],
  [/lemonade|juice|soda|smoothie/, 120, 0.2, 30, 0.1],
  [/chicken|steak|beef|salmon|meat|pork|turkey|fish|lamb/, 220, 28, 1, 10],
  [/rice|pasta|noodle|oat|potato|cereal/, 210, 4.5, 44, 1],
  [/salad|vegetable|veggie|greens/, 60, 2, 10, 2],
  [/fruit|apple|banana|orange|berry|grape/, 90, 1, 23, 0.3],
];

/** Per-unit share of an index item when its portion lists several pieces (e.g. "3 cookies"). */
function unitsInPortion(item: FoodItemIndex): number {
  const m = item.portion.match(COUNTABLE);
  return m ? Math.max(1, parseFloat(m[1])) : 1;
}

export function estimateDescription(text: string): DescribedItem[] {
  return splitDescription(text).map((chunk) => {
    const { quantity, rest } = parseQuantity(chunk);
    const match = matchFood(rest || chunk);
    if (match && match.score >= 0.34) {
      const { item } = match;
      // "3 oreos" against an index portion of "3 cookies" is one portion, not three.
      const countedInPieces = quantity >= 1 && unitsInPortion(item) > 1 && !tokens(rest).some((t) => MEASURE.has(t));
      const portions = countedInPieces ? quantity / unitsInPortion(item) : quantity;
      const r = (v: number) => Math.round(v * portions * 10) / 10;
      return {
        name: item.name, portion: portions === 1 ? item.portion : `${+portions.toFixed(2)} × ${item.portion}`,
        quantity, calories: Math.round(item.calories * portions), proteinG: r(item.protein), carbsG: r(item.carbs),
        fatG: r(item.fat), confidence: Math.min(0.9, 0.45 + match.score * 0.45), matchedId: item.id,
      };
    }
    const low = (rest || chunk).toLowerCase();
    const g = GENERIC.find(([re]) => re.test(low));
    const [c, p, cb, f] = g ? g.slice(1) as number[] : [150, 5, 18, 5];
    const name = (rest || chunk).trim();
    return {
      name: name.charAt(0).toUpperCase() + name.slice(1), portion: `${quantity}x serving`, quantity,
      calories: Math.round(c * quantity), proteinG: Math.round(p * quantity * 10) / 10,
      carbsG: Math.round(cb * quantity * 10) / 10, fatG: Math.round(f * quantity * 10) / 10,
      confidence: g ? 0.35 : 0.2, matchedId: null,
    };
  });
}
