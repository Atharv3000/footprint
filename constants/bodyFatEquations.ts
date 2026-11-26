/**
 * On-device body-fat estimate: the same DXA-trained model as footprint_ai/body_metrics.py.
 * Model (constants/bodyFatModel.json, copied from footprint_ai/models/body_fat_model.json):
 *   degree-3 polynomial ridge on sex, age, BMI (+ waist, waist/height), fitted to 27,905 NHANES
 *   1999-2006 and 2011-2016 adults with DXA-measured body fat (official CDC files). MAE vs DXA on
 *   NHANES 2017-18, a survey it never saw: 3.05 pts (2.66 with waist); the previous model scored 3.14 / 2.77.
 *   US Navy and RFM are reported for comparison only.
 * Photos never change the number on-device.
 */
import bodyFatModel from './bodyFatModel.json';

export interface BodyFatInput {
  gender: string;
  age?: number;
  weightKg: number;
  heightCm: number;
  waistCm?: number;
  neckCm?: number;
  hipCm?: number;
  athleticLevel?: string;
}

export interface BodyFatEstimate {
  bodyFatPercent: number;
  bodyFatRange: [number, number];
  category: string;
  fatMassKg: number;
  leanMassKg: number;
  confidence: number;
  bmi: number;
  visualFeatures: string[];
  evaluationMethod: string;
  methodValues?: Record<string, number>;
  abs?: AbsVisibility;
}

export interface AbsVisibility {
  absVisibility: string;
  absVisibleProbability: number;
  bodyFatForVisibleAbs: number;
  clearlyVisibleBelow: number;
  method: string;
}

type PolyModel = {
  features: string[]; mean: number[]; scale: number[]; powers: number[][]; coef: number[]; intercept: number;
  clip: Record<string, [number, number]>; interval80_halfwidth: { female: number; male: number };
};

/** DXA-trained model: body-fat % and its 80 % half-width. */
export function dxaBodyFat(female: boolean, age: number, heightCm: number, weightKg: number, waistCm?: number) {
  const key = waistCm ? 'with_waist' : 'no_waist';
  const M = (bodyFatModel as unknown as { models: Record<string, PolyModel> }).models[key];
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  const raw: Record<string, number> = { male: female ? 0 : 1, age, bmi, lbmi: Math.log(bmi) };
  if (waistCm) { const wc = waistCm / 100; raw.wc = wc; raw.whtr = wc / h; raw.lwhtr = Math.log(wc / h); }
  let outOfRange = false;
  const z = M.features.map((c, i) => {
    const [lo, hi] = M.clip[c];
    const v = Math.min(hi, Math.max(lo, raw[c]));
    if (c !== 'lbmi' && c !== 'lwhtr' && Math.abs(v - raw[c]) > 1e-9) outOfRange = true;
    return (v - M.mean[i]) / M.scale[i];
  });
  let bf = M.intercept;
  for (let t = 0; t < M.coef.length; t++) {
    let term = 1;
    const p = M.powers[t];
    for (let i = 0; i < p.length; i++) if (p[i]) term *= z[i] ** p[i];
    bf += M.coef[t] * term;
  }
  return { bodyFat: bf, halfWidth: M.interval80_halfwidth[female ? 'female' : 'male'], outOfRange };
}

// Body-fat bands at which abdominal definition usually shows; not read from photos.
const AB_BANDS: Record<'male' | 'female', [number, string, number][]> = {
  male: [[10, 'clearly visible', 0.9], [13, 'visible in good lighting', 0.65], [16, 'outline only', 0.3], [20, 'faint / upper abs only', 0.12], [99, 'not visible', 0.03]],
  female: [[16, 'clearly visible', 0.85], [19, 'visible in good lighting', 0.6], [23, 'outline only', 0.3], [27, 'faint / upper abs only', 0.1], [99, 'not visible', 0.03]],
};

export function absVisibility(bf: number, female: boolean, range?: [number, number]): AbsVisibility {
  const bands = AB_BANDS[female ? 'female' : 'male'];
  const band = (v: number) => bands.find((b) => v < b[0]) ?? bands[bands.length - 1];
  let prob = band(bf)[2];
  if (range) {
    let s = 0;
    for (let i = 0; i <= 20; i++) s += band(range[0] + ((range[1] - range[0]) * i) / 20)[2];
    prob = s / 21;
  }
  return {
    absVisibility: band(bf)[1], absVisibleProbability: Math.round(prob * 100) / 100,
    bodyFatForVisibleAbs: bands[1][0], clearlyVisibleBelow: bands[0][0],
    method: 'Derived from the body-fat estimate using typical visibility bands; not read from the photo pixels.',
  };
}

const log10 = Math.log10;

export function navyBodyFat(female: boolean, heightCm: number, waistCm: number, neckCm: number, hipCm?: number): number | null {
  if (!female) {
    if (waistCm - neckCm <= 0) return null;
    return 495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
  }
  if (!hipCm || waistCm + hipCm - neckCm <= 0) return null;
  return 495 / (1.29579 - 0.35004 * log10(waistCm + hipCm - neckCm) + 0.221 * log10(heightCm)) - 450;
}

export function relativeFatMass(female: boolean, heightCm: number, waistCm: number): number | null {
  return waistCm > 0 ? 64 - (20 * heightCm) / waistCm + (female ? 12 : 0) : null;
}

export function cunBae(female: boolean, age: number, bmi: number): number {
  const s = female ? 1 : 0;
  return -44.988 + 0.503 * age + 10.689 * s + 3.172 * bmi - 0.026 * bmi ** 2 + 0.181 * bmi * s
    - 0.02 * bmi * age - 0.005 * bmi ** 2 * s + 0.00021 * bmi ** 2 * age;
}

export function bodyFatCategory(bf: number, female: boolean): string {
  if (!female) return bf < 6 ? 'Essential / very lean' : bf < 14 ? 'Athletic' : bf < 18 ? 'Fitness' : bf < 25 ? 'Average' : 'Above average';
  return bf < 14 ? 'Essential / very lean' : bf < 21 ? 'Athletic' : bf < 25 ? 'Fitness' : bf < 32 ? 'Average' : 'Above average';
}

const inRange = (v: number | undefined, lo: number, hi: number) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : undefined);

export function estimateBodyFat(input: BodyFatInput): BodyFatEstimate {
  const female = /^(f|w)/i.test(input.gender || '');
  const ageIn = inRange(input.age, 13, 100);
  const age = ageIn ?? 35;
  const weight = inRange(input.weightKg, 25, 350) ?? 70;
  const height = inRange(input.heightCm, 100, 250) ?? 175;
  const waist = inRange(input.waistCm, 40, 250);
  const neck = inRange(input.neckCm, 20, 70);
  const hip = inRange(input.hipCm, 50, 250);
  const athletic = input.athleticLevel === 'athletic' || input.athleticLevel === 'bodybuilder';
  const bmi = weight / (height / 100) ** 2;
  const notes: string[] = [];
  let extra = 0;
  if (ageIn == null) notes.push('Age not given; assumed 35.');
  if (age < 18) { notes.push('The model was trained on adults (18+); results for teenagers are less reliable.'); extra += 2; }
  const pred = dxaBodyFat(female, age, height, weight, waist);
  if (pred.outOfRange) { notes.push('Some inputs are outside the range of the training data; the estimate is less certain.'); extra += 2; }
  const bf = Math.min(60, Math.max(3, pred.bodyFat));
  let half = pred.halfWidth + extra;
  const methods = [`DXA-trained model (sex, age, BMI${waist ? ', waist' : ''})`];
  const methodValues: Record<string, number> = {};
  const round1 = (v: number) => Math.round(v * 10) / 10;
  methodValues.dxaModel = round1(bf);
  let lowShift = 0;
  if (athletic) {
    if (waist) notes.push('Muscular build: the waist measurement keeps the estimate from being inflated by muscle weight.');
    else {
      notes.push('Muscular build: estimates without a waist measurement can read high for muscular people. Add your waist for a better estimate.');
      half += 3; lowShift = 3;
    }
  }
  if (waist) {
    const r = relativeFatMass(female, height, waist);
    if (r != null) methodValues.rfm = round1(r);
    if (neck) {
      const n = navyBodyFat(female, height, waist, neck, hip);
      if (n != null && isFinite(n)) {
        methodValues.usNavy = round1(n);
        methods.push('US Navy tape method (shown for comparison)');
        if (Math.abs(n - bf) > 6) notes.push('The US Navy tape formula differs by more than 6 points; re-measure waist (at the navel) and neck.');
      }
    }
  }
  const low = Math.max(3, bf - half - lowShift);
  const high = Math.min(60, bf + half);
  const confidence = Math.min(0.9, Math.max(0.2, 1 - (half - 2) / 10));
  const fat = (weight * bf) / 100;
  return {
    bodyFatPercent: round1(bf),
    bodyFatRange: [round1(low), round1(high)],
    category: bodyFatCategory(bf, female),
    fatMassKg: round1(fat),
    leanMassKg: round1(weight - fat),
    confidence: Math.round(confidence * 100) / 100,
    bmi: round1(bmi),
    visualFeatures: [...notes, 'Estimated on this device from your measurements (AI server unreachable).'],
    evaluationMethod: methods.join(' + '),
    methodValues,
    abs: absVisibility(bf, female, [low, high]),
  };
}
