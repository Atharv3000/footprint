"""Nutrition label reader: photo of a US "Nutrition Facts" panel or an EU/UK nutrition table -> numbers.

OCR (footprint_ai.ocr) gives printed rows; each nutrient row is matched by name and its amount
read, allowing for common OCR slips ("8q", "8 9", "O g", "1Og"). A label is accepted when the
calories agree with 4/4/9 kcal per gram of carbs/protein/fat (or when only calories were found).
"""
from __future__ import annotations

import re

NUM = r'(\d+(?:[.,]\d+)?)'
# name pattern -> key. Order matters: the more specific names first.
FIELDS = [
    ('satFatG', r'sat(?:urated)?\.?\s*fat|saturates|of which saturates'),
    ('transFatG', r'trans\s*fat'),
    ('fatG', r'total\s*fat|^fat\b|\bfat\s*(?=\d)|\bfat\b|lipides|fett'),
    ('cholesterolMg', r'cholest'),
    ('sodiumMg', r'sodium'),
    ('saltG', r'\bsalt\b'),
    ('addedSugarG', r'added\s*sugars?|incl(?:udes)?\.?\s*\d+\s*g?\s*added'),
    ('fiberG', r'(?:dietary\s*)?fib(?:er|re)'),
    ('sugarG', r'(?:total\s*)?sugars?|of which sugars'),
    ('carbsG', r'(?:total\s*)?carb(?:ohydrate|ohydrates|s)?\.?|glucides'),
    ('proteinG', r'protein|eiweiss|prot[eé]ines'),
]
MG_FIELDS = {'cholesterolMg', 'sodiumMg'}


def _num(s: str) -> float:
    return float(s.replace(',', '.'))


def _fix_ocr(t: str) -> str:
    t = re.sub(r'(?<=\d)\s*[qQ](?=\b|\s|$)', 'g', t)                 # "8q" -> "8g"
    t = re.sub(r'(?<=\d)[oO](?=\s*m?g\b)', '0', t)                 # "1Og" -> "10g"
    t = re.sub(r'\b[oO](?=\s*m?g\b)', '0', t)                      # "O g" -> "0 g"
    t = re.sub(r'(?<=\d)\s+(?=g\b)', '', t)                         # "8 g" -> "8g"
    t = t.replace('Omg', '0mg').replace('mq', 'mg')
    return t


def _amount(after: str, key: str) -> float | None:
    """First amount after the nutrient name, e.g. '8g 10%' -> 8, '160mg 7%' -> 160, '<1g' -> 0.5."""
    after = after.strip()
    if key in MG_FIELDS:
        m = re.search(r'(<\s*)?' + NUM + r'\s*(m?g)\b', after)
        if m:
            v = _num(m[2]) * (1000 if m[3] == 'g' else 1)
            return v / 2 if m[1] else v
        m = re.match(NUM + r'(?:\s|$)', after)
        return _num(m[1]) if m else None
    m = re.search(r'(<\s*)?' + NUM + r'\s*g\b', after)
    if m:
        v = _num(m[2])
        return v / 2 if m[1] else v
    # OCR read the "g" as a 9: "Total Fat 89 10%" -> 8 g when a % column follows
    m = re.match(r'(\d+(?:[.,]\d)?)9\s+\d+\s*%', after)
    if m:
        return _num(m[1])
    m = re.match(NUM + r'(?:\s|$)', after)
    return _num(m[1]) if m else None


def parse_label(text: str) -> dict:
    """Numbers from label text (one printed row per line)."""
    rows = [_fix_ocr(r.strip()) for r in text.split('\n') if r.strip()]
    low = [r.lower() for r in rows]
    out: dict = {}
    eu = any(re.search(r'per\s*100\s*(g|ml)|/\s*100\s*g|100\s*g\b.*\bper\b|\bkj\b', r) for r in low)
    out['basis'] = 'per100g' if eu else 'perServing'
    # Serving size: "Serving size 2/3 cup (55g)" / "Serving Size 1 bar (40 g)" / "per serving (30 g)"
    for r in low:
        if re.search(r'serv(?:ing)?\.?\s*size|per serving|portion', r):
            m = re.search(r'\(\s*' + NUM + r'\s*(g|ml)\s*\)', r) or re.search(NUM + r'\s*(g|ml)\b', r)
            if m:
                out['servingSizeG'] = _num(m[1])
                hh = re.search(r'size\s*[:\-]?\s*(.+?)\s*\(', r)
                if hh:
                    out['servingSizeText'] = hh[1][:40]
                break
    for r in low:
        m = re.search(r'(?:about\s*)?' + NUM + r'\s*servings?\s*per\s*(?:container|pack(?:age)?)', r) or \
            re.search(r'servings?\s*per\s*(?:container|pack(?:age)?)\s*[:\-]?\s*(?:about\s*)?' + NUM, r)
        if m:
            out['servingsPerContainer'] = _num(m[1]); break
    # Calories: "Calories 230", "Calories from Fat" excluded; EU "Energy 1046 kJ / 250 kcal"
    for i, r in enumerate(low):
        if 'from fat' in r:
            continue
        m = re.search(NUM + r'\s*kcal', r)
        if m and ('energy' in r or 'kcal' in r):
            out['calories'] = _num(m[1]); break
        m = re.search(r'calories\s*[:\-]?\s*' + NUM, r)
        if m:
            out['calories'] = _num(m[1]); break
        if re.match(r'\W*(amount per serving\W*)?calories\b', r):
            nums = [x for x in re.findall(r'(?<![\d.%])(\d{1,4})(?![\d.%*])', r[r.index('calories'):]) if 0 <= int(x) <= 2000]
            if nums:  # "Calories % Daily Value* 220": the calorie number printed at the far right
                out['calories'] = float(nums[-1]); break
        if re.fullmatch(r'\W*calories\W*', r) and i + 1 < len(low):
            m = re.match(r'\s*' + NUM + r'\b', low[i + 1])
            if m:
                out['calories'] = _num(m[1]); break
    for key, pat in FIELDS:
        for r in low:
            m = re.search(pat, r)
            if not m or key in out:
                continue
            if key == 'fatG' and re.search(r'sat|trans|calories from', r):
                continue
            if key == 'sugarG' and 'added' in r:
                continue
            if key == 'carbsG' and re.search(r'sugar|fib', r[:m.start()]):
                continue
            inc = re.search(r'incl\w*\.?\s*' + NUM + r'\s*g\s*added', r) if key == 'addedSugarG' else None
            v = _num(inc[1]) if inc else _amount(r[m.end():], key)  # "Includes 10g Added Sugars"
            if v is not None and v < 5000:
                out[key] = v
                break
    if 'sodiumMg' not in out and 'saltG' in out:
        out['sodiumMg'] = round(out['saltG'] * 400)  # salt = sodium x 2.5
    return out


def check(n: dict) -> tuple[bool, float]:
    """Do the macros explain the calories? (ok, ratio). Fibre and polyols make labels run a little low."""
    if 'calories' not in n:
        return False, 0.0
    if not any(k in n for k in ('fatG', 'carbsG', 'proteinG')):
        return True, 1.0
    est = 9 * n.get('fatG', 0) + 4 * n.get('carbsG', 0) + 4 * n.get('proteinG', 0)
    if n['calories'] <= 10 and est <= 20:
        return True, 1.0
    ratio = est / max(n['calories'], 1)
    return .7 <= ratio <= 1.3, ratio


def read_label_text(text: str) -> dict:
    n = parse_label(text)
    ok, ratio = check(n)
    found = [k for k in ('calories', 'fatG', 'carbsG', 'proteinG') if k in n]
    if 'calories' not in n:
        raise ValueError('Could not find the calories on this label. Hold the camera closer so the label fills the frame.')
    if n['basis'] == 'per100g' and n.get('servingSizeG'):
        f = n['servingSizeG'] / 100
        per_serving = {k: round(v * f, 1) for k, v in n.items() if isinstance(v, float) and k not in ('servingSizeG', 'servingsPerContainer')}
    else:
        per_serving = {k: v for k, v in n.items() if isinstance(v, float) and k not in ('servingSizeG', 'servingsPerContainer')}
    conf = (.55 + .1 * len(found)) * (1 if ok else .6)
    return {'fields': n, 'perServing': per_serving, 'macrosAgree': ok, 'macroRatio': round(ratio, 2), 'confidence': round(min(conf, .95), 2)}
