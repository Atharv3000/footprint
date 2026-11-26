"""Body-fat estimation trained on measured DXA body composition.

Primary model (models/body_fat_model.json, trained by training/train_body_fat.py):
  degree-3 polynomial ridge regression on sex, age, BMI (+ waist and waist/height when given),
  fitted to 27,905 NHANES 1999-2006 + 2011-2016 adults whose body fat was measured by DXA
  (official CDC files; training/train_body_fat_cdc.py).
  Mean absolute error vs DXA:
    without waist: 2.95 pts held-out (2005-16), 3.05 on NHANES 2017-18 (external)   [CUN-BAE: 4.07 / 4.16]
    with waist:    2.56 pts held-out (2005-16), 2.66 on NHANES 2017-18 (external)   [RFM:     3.01 / 3.16]
    (previous model, 1999-2004 only, on the same people: 3.02 / 3.14 and 2.66 / 2.77)
  The range returned is the per-sex 80 % conformal interval from the held-out set
  (covers about 78-79 % on the 2017-18 survey).

US Navy (tape: waist/neck[/hip]) is reported alongside when a neck measurement is given; it was
validated against hydrostatic weighing, a different reference, so it is not averaged in.

Photos: silhouette features feed the photo-BMI model (physique.py). It cross-checks the entered
weight and can stand in for a missing weight (with a much wider range). Ab visibility is derived
from the body-fat estimate (physique.ab_visibility), not read from the pixels.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_PATH = Path(__file__).parent / 'models' / 'body_fat_model.json'


@lru_cache(maxsize=1)
def _model() -> dict:
    return json.loads(MODEL_PATH.read_text())


def dxa_model(female: bool, age: float, height_cm: float, weight_kg: float, waist_cm: float | None = None) -> dict:
    """Body-fat % predicted by the NHANES-DXA model plus its 80 % half-width."""
    key = 'with_waist' if waist_cm else 'no_waist'
    M = _model()['models'][key]
    h = height_cm / 100
    bmi = weight_kg / h ** 2
    raw = {'male': 0.0 if female else 1.0, 'age': age, 'bmi': bmi, 'lbmi': math.log(bmi)}
    if waist_cm:
        wc = waist_cm / 100
        raw.update(wc=wc, whtr=wc / h, lwhtr=math.log(wc / h))
    clipped = {c: float(np.clip(raw[c], *M['clip'][c])) for c in M['features']}
    extrapolated = [c for c in M['features'] if abs(clipped[c] - raw[c]) > 1e-9 and c != 'lbmi' and c != 'lwhtr']
    z = (np.array([clipped[c] for c in M['features']]) - np.array(M['mean'])) / np.array(M['scale'])
    terms = np.prod(z[None, :] ** np.array(M['powers']), axis=1)
    bf = float(M['intercept'] + np.dot(M['coef'], terms))
    return {'bodyFat': bf, 'halfWidth': M['interval80_halfwidth']['female' if female else 'male'],
            'model': key, 'outOfRange': extrapolated}


def navy(sex_female: bool, height_cm: float, waist_cm: float, neck_cm: float, hip_cm: float | None) -> float | None:
    try:
        if not sex_female:
            if waist_cm - neck_cm <= 0:
                return None
            d = 1.0324 - 0.19077 * math.log10(waist_cm - neck_cm) + 0.15456 * math.log10(height_cm)
        else:
            if not hip_cm or waist_cm + hip_cm - neck_cm <= 0:
                return None
            d = 1.29579 - 0.35004 * math.log10(waist_cm + hip_cm - neck_cm) + 0.22100 * math.log10(height_cm)
        return 495.0 / d - 450.0
    except (ValueError, ZeroDivisionError):
        return None


def rfm(sex_female: bool, height_cm: float, waist_cm: float) -> float | None:
    if waist_cm <= 0:
        return None
    return 64 - 20 * height_cm / waist_cm + (12 if sex_female else 0)


def cun_bae(sex_female: bool, age: float, bmi: float) -> float:
    s = 1 if sex_female else 0
    return (-44.988 + 0.503 * age + 10.689 * s + 3.172 * bmi - 0.026 * bmi ** 2 + 0.181 * bmi * s
            - 0.02 * bmi * age - 0.005 * bmi ** 2 * s + 0.00021 * bmi ** 2 * age)


def category(bf: float, female: bool) -> str:
    if not female:
        return ('Essential / very lean' if bf < 6 else 'Athletic' if bf < 14 else 'Fitness' if bf < 18
                else 'Average' if bf < 25 else 'Above average')
    return ('Essential / very lean' if bf < 14 else 'Athletic' if bf < 21 else 'Fitness' if bf < 25
            else 'Average' if bf < 32 else 'Above average')


def _num(v, lo, hi):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if lo <= f <= hi else None


def photo_analysis(image_b64: str | None) -> dict:
    """Framing notes plus silhouette-based photo BMI (None when the photo is unusable)."""
    if not image_b64:
        return {'notes': [], 'photoBmi': None}
    try:
        from .food_vision import decode_image
        from .physique import predict_photo_bmi, silhouette_features
        from .pose import detector
        img = decode_image(image_b64).convert('RGB')
        img.thumbnail((720, 720))
        rgb = np.asarray(img)
        pts, people = detector().detect(rgb)
    except Exception:  # noqa: BLE001 - the photo is optional
        return {'notes': ['Photo could not be analysed; the estimate uses your measurements only.'], 'photoBmi': None}
    if people == 0:
        return {'notes': ['No person found in the photo; the estimate uses your measurements only.'], 'photoBmi': None}
    notes = ['More than one person in the photo; using the largest.'] if people > 1 else []
    feats = silhouette_features(rgb, pts)
    if not feats:
        notes.append('Torso not fully visible; step back so shoulders and hips are in frame.')
        return {'notes': notes, 'photoBmi': None}
    if not feats['frontal']:
        notes.append('Photo looks side-on; a front-facing photo gives a better body-shape reading.')
        return {'notes': notes, 'photoBmi': None}
    notes.append('Torso fully in frame (shoulders and hips detected).')
    return {'notes': notes, 'photoBmi': predict_photo_bmi(feats)}


def estimate_body_fat(req: dict) -> dict:
    female = str(req.get('gender', 'male')).lower().startswith(('f', 'w'))
    age_in = _num(req.get('age'), 13, 100)
    age = age_in or 35
    height = _num(req.get('heightCm'), 100, 250)
    weight = _num(req.get('weightKg'), 25, 350)
    waist = _num(req.get('waistCm'), 40, 250)
    neck = _num(req.get('neckCm'), 20, 70)
    hip = _num(req.get('hipCm'), 50, 250)
    level = str(req.get('athleticLevel', 'intermediate'))
    if not height:
        raise ValueError('Height is required for a body-fat estimate.')
    photo = photo_analysis(req.get('image'))
    notes = list(photo['notes'])
    extra = 0.0
    weight_from_photo = False
    if not weight:
        if not photo['photoBmi']:
            raise ValueError('Weight is required (or a clear, front-facing full-body photo).')
        weight = photo['photoBmi']['bmi'] * (height / 100) ** 2
        weight_from_photo = True
        extra += photo['photoBmi']['mae']  # roughly 1 body-fat point per BMI point
        notes.append(f"No weight given: weight estimated from the photo (photo-BMI error is about ±{photo['photoBmi']['mae']}), so the range is wide.")
    bmi = weight / (height / 100) ** 2
    if photo['photoBmi'] and not weight_from_photo:
        diff = photo['photoBmi']['bmi'] - bmi
        if abs(diff) > 1.5 * photo['photoBmi']['mae']:
            notes.append('The photo looks ' + ('heavier' if diff > 0 else 'lighter') +
                         ' than the entered height/weight suggest; check the numbers (clothing and camera angle also affect this).')
    if not age_in:
        notes.append('Age not given; assumed 35.')
    if age < 18:
        notes.append('The model was trained on adults (18+); results for teenagers are less reliable.')
        extra += 2
    pred = dxa_model(female, age, height, weight, waist)
    if pred['outOfRange']:
        notes.append('Some inputs are outside the range of the training data; the estimate is less certain.')
        extra += 2
    bf = float(np.clip(pred['bodyFat'], 3.0, 60.0))
    half = pred['halfWidth'] + extra
    methods = ['DXA-trained model (sex, age, BMI' + (', waist' if waist else '') + ')']
    method_values = {'dxaModel': round(bf, 1)}
    if level in ('athletic', 'bodybuilder'):
        if waist:
            notes.append('Muscular build: the waist measurement keeps the estimate from being inflated by muscle weight.')
        else:
            notes.append('Muscular build: estimates without a waist measurement can read high for muscular people. Add your waist for a better estimate.')
            half += 3
    if waist:
        r = rfm(female, height, waist)
        if r is not None:
            method_values['rfm'] = round(r, 1)
    if waist and neck:
        n = navy(female, height, waist, neck, hip)
        if n is not None:
            method_values['usNavy'] = round(n, 1)
            methods.append('US Navy tape method (shown for comparison)')
            if abs(n - bf) > 6:
                notes.append('The US Navy tape formula differs by more than 6 points; re-measure waist (at the navel) and neck.')
    low = max(3.0, bf - half - (3 if level in ('athletic', 'bodybuilder') and not waist else 0))
    high = min(60.0, bf + half)
    # confidence: 1 at a ±2 range, falling as the range widens
    conf = float(np.clip(1.0 - (half - 2.0) / 10.0, 0.2, 0.9))
    from .physique import ab_visibility
    abs_info = ab_visibility(bf, female, (low, high))
    fat = weight * bf / 100
    return {'bodyFatPercent': round(bf, 1), 'bodyFatRange': [round(low, 1), round(high, 1)], 'category': category(bf, female),
            'fatMassKg': round(fat, 1), 'leanMassKg': round(weight - fat, 1), 'confidence': round(conf, 2), 'bmi': round(bmi, 1),
            'visualFeatures': notes, 'evaluationMethod': ' + '.join(methods), 'methods': methods,
            'methodValues': method_values, 'photoBmi': photo['photoBmi'], 'weightFromPhoto': weight_from_photo,
            'abs': abs_info, 'modelVersion': _model()['version']}
