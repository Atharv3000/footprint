"""Photo and text scans built on the food models, returned in the app's result shape.

- analyze_food_photo: barcode -> product; several foods -> one item each; packaged snack -> product
  from the text on the pack; otherwise the single-dish answer from food_vision.
- scan_label: barcode, nutrition-facts panel, or product name on the pack.
- read_receipt_photo: purchased food items from a receipt.
- read_recipe_input: recipe photo or text -> nutrition per serving.
"""
from __future__ import annotations

import logging

from PIL import Image

from . import products
from .barcode import read_barcodes
from .food_vision import PORTIONS, _nutrition_for, analyze_food, decode_image, dietary_tags, health_score

log = logging.getLogger('footprint_ai')
MACROS = ('calories', 'proteinG', 'carbsG', 'fatG')


def _sum(items: list[dict], k: str) -> float:
    return round(sum(i.get(k, 0) or 0 for i in items), 1)


def _totals(items: list[dict]) -> dict:
    t = {k: _sum(items, k) for k in (*MACROS, 'fiberG', 'sugarG')}
    t['calories'] = round(t['calories'])
    return t


def _result(title: str, items: list[dict], confidence: float, tips: str, source: str, **extra) -> dict:
    """The analyze_food result shape the app already reads, plus `items` (one entry per food)."""
    t = _totals(items)
    return {'isFood': True, 'dishTitle': title, 'confidence': round(confidence, 3),
            'portion': ', '.join(i['portion'] for i in items)[:120],
            'totalCalories': t['calories'], 'totalProteinG': t['proteinG'], 'totalCarbsG': t['carbsG'], 'totalFatG': t['fatG'],
            'items': [{k: v for k, v in i.items() if not k.startswith('_')} for i in items], 'candidates': [],
            'portionVariants': PORTIONS, 'servingsPerContainer': extra.pop('servingsPerContainer', 1.0),
            'healthScore': health_score(t['calories'], t['proteinG'], t['fiberG'], t['sugarG'], t['fatG']),
            'dietaryTags': dietary_tags(t), 'tips': tips, 'source': source, **extra}


def _product_result(p: products.Product, how: str, confidence: float) -> dict:
    it = p.as_item(confidence=confidence, how=how)
    servings = None
    try:
        import re
        q = re.match(r'\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\b', p.quantity or '', re.I)
        if q and p.serving_g:
            servings = round(float(q[1].replace(',', '.')) / p.serving_g, 1)
    except ValueError:
        servings = None
    tip = f"Label values from Open Food Facts for one serving ({it['portion']})."
    if servings and servings > 1:
        tip += f' The pack holds about {servings:g} servings; change the amount if you ate more.'
    return _result(p.title, [{**it, 'id': f'prod_{p.code}'}], confidence, tip, f'open-food-facts ({how})',
                   barcode=p.code, brand=p.brand, packageSize=p.quantity or None, isProduct=True,
                   servingsPerContainer=servings or 1.0)


def _ocr_lines(img: Image.Image) -> list[str]:
    from . import ocr
    return [ocr.row_text(r) for r in ocr.rows(ocr.read(img))]


def product_from_text(lines: list[str], min_score: float = .78) -> tuple[float, products.Product] | None:
    text = ' '.join(lines)
    hits = products.search(text, 1, min_score=min_score, mode='pack') if len(products.words(text)) >= 2 else []
    return hits[0] if hits else None


def _food_item(it: dict, k: int, prefix: str = 'item') -> dict:
    c = it['candidate']
    n = _nutrition_for(c['entry'])
    return {'id': f'{prefix}_{k}', 'name': c['title'], 'portion': f"{n['portion']} (~{n['grams']} g)", 'grams': n['grams'],
            'calories': n['calories'], 'proteinG': n['proteinG'], 'carbsG': n['carbsG'], 'fatG': n['fatG'],
            'fiberG': n['fiberG'], 'sugarG': n['sugarG'], 'confidence': round(min(c['confidence'], it['p']), 3),
            'box': it['box'], 'usdaDescription': n['usdaDescription']}


def _multi_items(img: Image.Image) -> tuple[dict | None, list[dict]]:
    """(multi-item result or None, 'also spotted' suggestions)."""
    from .multi_food import detect
    det = detect(img)
    if det['full']['p_food'] < .5:  # trained on food scenes only: not food overall -> no items, let the gate answer
        return None, []
    suggestions = [_food_item(it, k, 'also') for k, it in enumerate(det['suggestions'])]
    if len(det['items']) < 2:
        keep = {it['key'] for it in det['items']}
        return None, [s for s, it in zip(suggestions, det['suggestions']) if it['key'] not in keep]
    items = [_food_item(it, k) for k, it in enumerate(det['items'])]
    have = {i['name'].lower() for i in items}
    suggestions = [x for x in suggestions if x['name'].lower() not in have]
    title = ' + '.join(i['name'] for i in items[:3]) + (f' + {len(items) - 3} more' if len(items) > 3 else '')
    conf = sum(i['confidence'] for i in items) / len(items)
    return _result(title, items, conf, f'Found {len(items)} separate foods. Each uses a typical USDA serving; '
                   'remove any that are wrong and adjust portions.', 'multi-item', isMultiItem=True, imageSize=list(det['size']),
                   alsoSpotted=suggestions), suggestions


def analyze_food_photo(image_b64: str, hint: str = '') -> dict:
    img = decode_image(image_b64)
    if not (hint or '').strip():
        for code in read_barcodes(img):
            p = products.by_barcode(code)
            if p:
                return _product_result(p, 'barcode', .97)
    also: list[dict] = []
    if not (hint or '').strip():
        try:
            multi, also = _multi_items(img)
            if multi:
                return multi
        except Exception:  # noqa: BLE001 - multi-item is an extra; fall back to the single-dish answer
            log.exception('multi-item detection failed')
    single = analyze_food(image_b64, hint)
    if single.get('isFood') and also:
        top = single.get('dishTitle', '').lower()
        seen = {top}
        single['alsoSpotted'] = [a for a in also if not (a['name'].lower() in seen or seen.add(a['name'].lower()))]
    weak = not single.get('isFood') or single.get('confidence', 0) < .35
    if weak and not (hint or '').strip() and products.available():
        try:
            lines = _ocr_lines(img)
            hit = product_from_text(lines)
            if hit:
                return _product_result(hit[1], 'text on the pack', hit[0] * .9)
        except Exception:  # noqa: BLE001 - OCR is optional
            log.exception('pack text lookup failed')
    if single.get('isFood') and 'items' not in single:
        single['items'] = [{'id': 'item_0', 'name': single['dishTitle'], 'portion': single.get('portion', ''),
                            'calories': single['totalCalories'], 'proteinG': single['totalProteinG'],
                            'carbsG': single['totalCarbsG'], 'fatG': single['totalFatG'], 'confidence': single['confidence']}]
    return single


def scan_label(image_b64: str = '', barcode: str = '') -> dict:
    """Barcode, nutrition label or pack text -> one product's nutrition per serving.

    `barcode` is a code the phone's camera already read (expo-camera); then no photo is needed.
    """
    from .label import read_label_text
    if barcode:
        p = products.by_barcode(barcode)
        if p:
            return _product_result(p, 'barcode', .97)
        if not image_b64:
            raise ValueError(f'Barcode {barcode} is not in the product database yet. Take a photo of the nutrition label instead.')
    img = decode_image(image_b64)
    for code in read_barcodes(img):
        p = products.by_barcode(code)
        if p:
            return _product_result(p, 'barcode', .97)
    lines = _ocr_lines(img)
    label = None
    try:
        label = read_label_text('\n'.join(lines))
    except ValueError:
        pass
    prod = product_from_text(lines) if products.available() else None
    if label and label['macrosAgree']:
        f, ps = label['fields'], label['perServing']
        size = f.get('servingSizeG')
        name = prod[1].title if prod else 'Scanned nutrition label'
        item = {'id': 'label_0', 'name': name, 'portion': f"1 serving ({f.get('servingSizeText') or ''} {size:g} g)".replace('( ', '(')
                if size else '1 serving (as printed)', 'grams': round(size) if size else None,
                'calories': round(ps.get('calories', 0)), 'proteinG': ps.get('proteinG', 0), 'carbsG': ps.get('carbsG', 0),
                'fatG': ps.get('fatG', 0), 'fiberG': ps.get('fiberG', 0), 'sugarG': ps.get('sugarG', 0),
                'sodiumMg': ps.get('sodiumMg'), 'confidence': label['confidence']}
        basis = 'per 100 g, scaled to one serving' if f['basis'] == 'per100g' and size else ('per 100 g' if f['basis'] == 'per100g' else 'per serving')
        return _result(name, [item], label['confidence'], f'Read from the label ({basis}). Check the numbers before saving.',
                       'label-ocr', isLabel=True, label=f, servingsPerContainer=f.get('servingsPerContainer') or 1.0)
    if prod:
        return _product_result(prod[1], 'text on the pack', prod[0] * .9)
    if label:  # numbers found but they do not add up: still show them, flagged
        f, ps = label['fields'], label['perServing']
        item = {'id': 'label_0', 'name': 'Scanned nutrition label', 'portion': '1 serving (as printed)', 'calories': round(ps.get('calories', 0)),
                'proteinG': ps.get('proteinG', 0), 'carbsG': ps.get('carbsG', 0), 'fatG': ps.get('fatG', 0), 'confidence': label['confidence']}
        return _result('Scanned nutrition label', [item], label['confidence'],
                       'Some numbers may be misread (the calories and macros do not add up). Check them before saving.',
                       'label-ocr', isLabel=True, label=f)
    raise ValueError('No barcode, nutrition label or known product was found. Fill the frame with the label or barcode, in good light.')


def read_receipt_photo(image_b64: str) -> dict:
    from .receipt import read_receipt_rows
    img = decode_image(image_b64)
    r = read_receipt_rows(_ocr_lines(img))
    foods = [i for i in r['items'] if i['isFood']]
    items = [{'id': i['id'], 'name': i['food'] or i['name'], 'receiptLine': i['name'], 'quantity': i['quantity'], 'price': i['price'],
              'portion': i['portion'], 'grams': i['grams'], 'calories': i['calories'], 'proteinG': i['proteinG'], 'carbsG': i['carbsG'],
              'fatG': i['fatG'], 'confidence': i['confidence'], 'source': i['source'], 'barcode': i.get('barcode')} for i in foods]
    if not items:
        raise ValueError(f"Read {len(r['items'])} receipt line(s), but none matched a food. Try a clearer photo or add the items by name.")
    res = _result(f'Receipt: {len(items)} food item(s)', items, sum(i['confidence'] for i in items) / len(items),
                  r['note'] + (f" Skipped {r['otherItems']} non-food or unknown line(s)." if r['otherItems'] else ''),
                  'receipt-ocr', isReceipt=True, receiptLines=r['items'], receiptTotal=r['itemsTotal'])
    return res


def read_recipe_input(image_b64: str = '', text: str = '') -> dict:
    from .recipe import read_recipe
    if (text or '').strip():
        source = text
    else:
        source = '\n'.join(_ocr_lines(decode_image(image_b64)))
    r = read_recipe(source)
    n = r['servings']
    items = [{'id': f'ing_{k}', 'name': i['name'], 'recipeLine': i['line'], 'portion': i['portion'], 'grams': i['grams'],
              'calories': i['calories'], 'proteinG': i['proteinG'], 'carbsG': i['carbsG'], 'fatG': i['fatG'],
              'confidence': i['confidence'], 'matched': i['matched']} for k, i in enumerate(r['ingredients'])]
    per = r['perServing']
    serving = {'id': 'recipe_serving', 'name': f"{r['title']} (1 serving)", 'portion': f"1 of {n:g} servings (~{r['servingGrams']} g)",
               'grams': r['servingGrams'], 'calories': per['calories'], 'proteinG': per['proteinG'], 'carbsG': per['carbsG'],
               'fatG': per['fatG'], 'fiberG': per['fiberG'], 'sugarG': per['sugarG'], 'confidence': r['confidence']}
    tips = (f"Whole recipe: {r['total']['calories']} kcal over {n:g} servings." if r['servingsFound']
            else f"No serving count found, so this is the whole recipe ({r['total']['calories']} kcal). Set the servings to split it.")
    if r['unmatched']:
        tips += f" Not recognised: {', '.join(r['unmatched'][:4])}."
    return _result(r['title'], [serving], r['confidence'], tips, 'recipe-reader', isRecipe=True, servings=n,
                   servingsFound=r['servingsFound'], ingredients=items, recipeTotal=r['total'])
