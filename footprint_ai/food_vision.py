"""Food photo analysis: food/non-food gate, dish recognition, USDA nutrition.

Pipeline
1. Google AIY food classifier (2023 dishes) gives a softmax and a 1024-d embedding.
2. A logistic gate on the embedding decides food vs non-food (trained on
   Food-101 photos vs. people/gym frames/objects/scenes).
3. A trained 13-class head covers common dishes AIY lacks or confuses (steak,
   ribs, pizza, beet salad, ...). It may override AIY only when its prediction
   is confident AND the photo is close to that class's training photos
   (novelty check), so it does not steal dishes it never saw.
4. Each candidate dish maps to a USDA SR28 food or USDA-ingredient recipe with
   a typical serving; macros come from USDA values.
5. An optional text hint from the user ("2 eggs and toast") takes priority:
   it is parsed by the nutrition engine and the photo candidates stay as
   alternatives.
"""
from __future__ import annotations

import base64
import io
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from .food_model import labels, model
from .nutrition import db, dishes, estimate_meal

HERE = Path(__file__).parent
MAX_B64 = 12_000_000


class ImageError(ValueError):
    pass


def decode_image(b64: str) -> Image.Image:
    if not isinstance(b64, str) or not b64:
        raise ImageError('No image was sent.')
    if len(b64) > MAX_B64:
        raise ImageError('Image is too large; send a JPEG under ~8 MB.')
    if b64.startswith('data:'):
        b64 = b64.split(',', 1)[-1]
    try:
        raw = base64.b64decode(b64, validate=False)
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:  # noqa: BLE001 - any decode failure is a bad image
        raise ImageError('Could not read the image.') from exc
    if img.width * img.height > 40_000_000 or min(img.size) < 64:
        raise ImageError('Unsupported image size.')
    return img


@lru_cache(maxsize=1)
def heads():
    z = np.load(HERE / 'models' / 'food_heads.npz')
    classes = [str(c) for c in z['head_classes']]
    return {
        'gate_w': z['gate_w'], 'gate_b': float(z['gate_b']),
        'head_w': z['head_w'], 'head_b': z['head_b'], 'classes': classes,
        'th_head': float(z['th_head']), 'th_aiy': float(z['th_aiy']), 'th_sim': float(z['th_sim']),
        'protos': {c: z[f'proto_{c}'].astype(np.float32) for c in classes},
        # AIY label index -> dish, for "AIY agrees with the head" (stored with the 101-dish head)
        'fam_of': {int(i): c for c in classes if f'family_{c}' in z.files for i in z[f'family_{c}']},
    }


@lru_cache(maxsize=1)
def label_map() -> dict:
    return json.loads((HERE / 'data' / 'label_nutrition.json').read_text())


# Which AIY labels belong to the head's dish families (so agreement counts as support).
_FAMILY_WORDS = {'pizza': ('pizza', 'pepperoni'), 'steak': ('steak', 'roast beef', 'churrasco'), 'sushi': ('sushi', 'onigiri', 'kimbap'),
                 'apple_pie': ('apple pie',), 'baklava': ('baklava',), 'beef_tartare': ('tartare',), 'beignets': ('beignet',),
                 'bibimbap': ('bibimbap',), 'bread_pudding': ('bread pudding',), 'breakfast_burrito': ('burrito',)}


def _family_of(label: str) -> str | None:
    low = label.lower()
    for fam, words in _FAMILY_WORDS.items():
        if any(w in low for w in words):
            return fam
    return None


def _sigmoid(x: float) -> float:
    return float(1 / (1 + np.exp(-x)))


def _softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


def _nutrition_for(entry: dict, multiplier: float = 1.0) -> dict:
    fid = entry['usdaId']
    food = dishes().foods[fid] if fid.startswith('F') and dishes() is not None else db().foods[fid]  # 'F…' = USDA FNDDS dish
    grams = entry['servingG'] * multiplier
    return {'grams': round(grams), 'portion': entry['portion'], 'usdaId': food.id, 'usdaDescription': food.desc, **food.per(grams)}


def health_score(cal: float, protein: float, fiber: float, sugar: float, fat: float) -> int:
    """Simple, transparent heuristic (0-100): rewards protein and fiber per 100 kcal,
    penalises sugar and very high fat share. Not a medical rating."""
    if cal <= 0:
        return 50
    per = 100.0 / cal
    score = 60 + 6 * protein * per + 8 * fiber * per - 2.5 * sugar * per
    fat_share = fat * 9 / cal
    if fat_share > .45:
        score -= (fat_share - .45) * 60
    return int(max(5, min(98, round(score))))


def dietary_tags(n: dict) -> list[str]:
    tags = []
    cal = max(n['calories'], 1)
    if n['proteinG'] * 4 / cal >= .25:
        tags.append('High protein')
    if n.get('fiberG', 0) >= 5:
        tags.append('High fiber')
    if n['carbsG'] * 4 / cal <= .1:
        tags.append('Low carb')
    if n.get('sugarG', 0) * 4 / cal >= .3:
        tags.append('High sugar')
    if n['fatG'] * 9 / cal >= .5:
        tags.append('High fat')
    return tags or ['Balanced']


PORTIONS = [{'label': 'Small', 'sublabel': '~0.7× typical serving', 'multiplier': .7},
            {'label': 'Regular', 'sublabel': 'Typical USDA serving', 'multiplier': 1.0},
            {'label': 'Large', 'sublabel': '~1.4× typical serving', 'multiplier': 1.4},
            {'label': 'Extra large', 'sublabel': '~1.8× typical serving', 'multiplier': 1.8}]


def classify(img: Image.Image) -> dict:
    """Vision-only result: food probability and ranked dish candidates (with nutrition)."""
    emb, prob = model().run_tta(img)
    x = emb / (np.linalg.norm(emb) + 1e-9)
    H = heads()
    p_food = _sigmoid(float(x @ H['gate_w'] + H['gate_b']))
    hp = _softmax(H['head_w'] @ x + H['head_b'])
    hj = int(hp.argmax())
    head_cls, head_p = H['classes'][hj], float(hp[hj])
    sims = H['protos'][head_cls] @ x
    head_sim = float(np.sort(sims)[-5:].mean())
    L, LM = labels(), label_map()
    order = np.argsort(-prob)
    a_top = int(order[0]) if order[0] != 0 else int(order[1])
    a_p = float(prob[a_top])
    a_fam = H['fam_of'].get(a_top) if H['fam_of'] else _family_of(L[a_top])
    use_head = (head_p >= H['th_head'] and head_sim >= H['th_sim'] and a_p < H['th_aiy']) or a_fam == head_cls
    cands: list[dict] = []
    seen: set[str] = set()

    def add(key: str, title: str, conf: float, source: str):
        entry = LM.get(key)
        if not entry or title.lower() in seen:
            return
        seen.add(title.lower())
        cands.append({'key': key, 'title': title, 'confidence': round(conf, 3), 'source': source, 'entry': entry})

    head_title = LM.get('head:' + head_cls, {}).get('label', head_cls.replace('_', ' ').title())
    if use_head:
        add('head:' + head_cls, head_title, max(head_p, a_p if a_fam == head_cls else 0), 'trained-head')
    for i in order[:12]:
        if i == 0:
            continue
        add(str(int(i)), L[i], float(prob[i]), 'aiy-food-v1')
        if len(cands) >= 5:
            break
    if not use_head and head_p >= .6 and head_sim >= H['th_sim'] - .05:
        add('head:' + head_cls, head_title, head_p * .5, 'trained-head (alternative)')
    return {'p_food': p_food, 'candidates': cands[:5], 'background_p': float(prob[0]),
            'aiy_top': L[a_top], 'aiy_top_p': a_p, 'head': {'class': head_cls, 'p': head_p, 'sim': head_sim, 'used': use_head}}


def analyze_food(image_b64: str, hint: str = '') -> dict:
    """Response `data` for the app's analyze_food WebSocket message."""
    img = decode_image(image_b64)
    v = classify(img)
    hint = (hint or '').strip()
    if v['p_food'] < .5 and not hint:
        return {'isFood': False, 'confidence': round((1 - v['p_food']) * 100, 1), 'detectedSubject': 'Not food',
                'error': 'This does not look like food. Point the camera at the meal, filling most of the frame.',
                'debug': {'foodProbability': round(v['p_food'], 3)}}
    cands = []
    for c in v['candidates']:
        n = _nutrition_for(c['entry'])
        cands.append({'id': c['key'], 'title': c['title'], 'confidence': c['confidence'], 'calories': n['calories'],
                      'proteinG': n['proteinG'], 'carbsG': n['carbsG'], 'fatG': n['fatG'], 'portion': n['portion'],
                      'grams': n['grams'], 'usdaDescription': n['usdaDescription'], 'source': c['source'],
                      'tags': dietary_tags(n), '_n': n})
    if hint:
        meal = estimate_meal(hint)
        if meal['items'] and any(i['matched'] for i in meal['items']):
            t = meal['totals']
            fiber = sum(i.get('fiberG', 0) for i in meal['items'] if i['matched'])
            sugar = sum(i.get('sugarG', 0) for i in meal['items'] if i['matched'])
            return {'isFood': True, 'dishTitle': hint[:1].upper() + hint[1:], 'confidence': meal['confidence'],
                    'portion': ', '.join(i['portion'] for i in meal['items'] if i['matched']),
                    'totalCalories': t['calories'], 'totalProteinG': t['proteinG'], 'totalCarbsG': t['carbsG'], 'totalFatG': t['fatG'],
                    'candidates': [{k: c[k] for k in c if k != '_n'} for c in cands], 'portionVariants': PORTIONS,
                    'healthScore': health_score(t['calories'], t['proteinG'], fiber, sugar, t['fatG']),
                    'dietaryTags': dietary_tags({**t, 'fiberG': fiber, 'sugarG': sugar}) + ['From your description'],
                    'scannedIngredients': [{'name': i['name'], 'portion': i['portion'], 'calories': i['calories'], 'proteinG': i['proteinG'],
                                            'carbsG': i['carbsG'], 'fatG': i['fatG'], 'confidence': i['confidence']} for i in meal['items'] if i['matched']],
                    'isLabel': True, 'source': 'text-hint+usda'}
    if not cands:
        return {'isFood': False, 'confidence': 0, 'detectedSubject': 'Unrecognized dish',
                'error': 'Could not identify this dish. Describe it in words instead (e.g. "chicken curry with rice").'}
    top = cands[0]
    n = top['_n']
    conf = top['confidence']
    if conf < .25:
        tip = 'Low confidence: check the suggestions or describe the meal in words.'
    else:
        tip = f'Estimated with USDA values for a typical serving ({n["portion"]}). Adjust the portion if yours is bigger or smaller.'
    return {'isFood': True, 'dishTitle': top['title'], 'confidence': conf, 'portion': f"{n['portion']} (~{n['grams']} g)",
            'totalCalories': n['calories'], 'totalProteinG': n['proteinG'], 'totalCarbsG': n['carbsG'], 'totalFatG': n['fatG'],
            'candidates': [{k: c[k] for k in c if k != '_n'} for c in cands], 'portionVariants': PORTIONS,
            'servingsPerContainer': 1.0, 'healthScore': health_score(n['calories'], n['proteinG'], n['fiberG'], n['sugarG'], n['fatG']),
            'dietaryTags': dietary_tags(n), 'tips': tip, 'usdaDescription': n['usdaDescription'], 'source': top['source']}


def describe_food(text: str) -> dict:
    """Response `data` for the app's describe_food message."""
    text = (text or '').strip()[:500]
    meal = estimate_meal(text) if text else {'items': [], 'totals': {}, 'confidence': 0, 'unmatched': []}
    items = [{'id': f'desc_{k}', 'name': i['name'], 'portion': i['portion'], 'calories': i['calories'], 'proteinG': i['proteinG'],
              'carbsG': i['carbsG'], 'fatG': i['fatG'], 'confidence': i['confidence'], 'usdaDescription': i.get('usdaDescription')}
             for k, i in enumerate(meal['items']) if i['matched']]
    t = meal.get('totals') or {'calories': 0, 'proteinG': 0, 'carbsG': 0, 'fatG': 0}
    fiber = sum(i.get('fiberG', 0) for i in meal['items'] if i['matched'])
    sugar = sum(i.get('sugarG', 0) for i in meal['items'] if i['matched'])
    tips = f'USDA-based estimate for {len(items)} item(s).'
    if meal.get('unmatched'):
        tips += ' Not recognised: ' + ', '.join(meal['unmatched'][:5]) + '.'
    return {'dishTitle': text[:1].upper() + text[1:] if text else 'Meal', 'confidence': meal['confidence'], 'items': items,
            'totalCalories': round(t.get('calories', 0)), 'totalProteinG': t.get('proteinG', 0), 'totalCarbsG': t.get('carbsG', 0),
            'totalFatG': t.get('fatG', 0), 'healthScore': health_score(t.get('calories', 0), t.get('proteinG', 0), fiber, sugar, t.get('fatG', 0)),
            'dietaryTags': dietary_tags({'calories': t.get('calories', 0), 'proteinG': t.get('proteinG', 0), 'carbsG': t.get('carbsG', 0),
                                         'fatG': t.get('fatG', 0), 'fiberG': fiber, 'sugarG': sugar}),
            'tips': tips, 'unmatched': meal.get('unmatched', [])}
