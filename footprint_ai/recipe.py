"""Recipe reader: recipe text or a photo of a recipe -> ingredients, servings and nutrition per serving.

1. A photo is read with OCR (footprint_ai.ocr); typed or pasted text is used as is.
2. The ingredient list is found: the lines under an "Ingredients" heading, or, without
   headings, lines that start with an amount or a bullet and are not cooking steps.
3. Each ingredient line is cleaned of preparation notes ("softened", "chopped", "to taste",
   "(2 sticks)") and costed with the USDA engine (nutrition.estimate_item).
4. Servings come from "Serves 4", "Makes 24 cookies", "Yield: 2 loaves", "4 servings" etc.
"""
from __future__ import annotations

import re

from .nutrition import FRAC, estimate_item

HEAD_ING = re.compile(r'^\W*(ingredients?|you(?:\'ll)? need|what you need)\b\W*$', re.I)
HEAD_STEPS = re.compile(r'^\W*(instructions?|directions?|method|steps?|preparation|how to make( it)?|to make|procedure|notes?)\b\W*$', re.I)
HEAD_OTHER = re.compile(r'^\W*(nutrition( facts| information)?|equipment|tips?|storage|serving suggestions?)\b', re.I)
SERVES = re.compile(r'\b(?:serves|servings?|yield(?:s)?|makes|portions?)\b\s*[:\-]?\s*(?:about\s+|approx\.?\s+)?'
                    r'(\d+(?:\.\d+)?)(?:\s*(?:-|to|–)\s*(\d+(?:\.\d+)?))?', re.I)
SERVES_AFTER = re.compile(r'\b(\d+(?:\.\d+)?)(?:\s*(?:-|to|–)\s*(\d+(?:\.\d+)?))?\s*(?:servings|portions|people)\b', re.I)
VERBS = ('preheat', 'heat', 'bake', 'mix', 'stir', 'add', 'combine', 'whisk', 'beat', 'pour', 'place', 'cook', 'bring',
         'remove', 'let', 'serve', 'cover', 'transfer', 'drain', 'season', 'spread', 'fold', 'cut', 'roll', 'chill',
         'cream', 'sift', 'in a', 'using', 'meanwhile', 'once', 'when', 'repeat', 'top', 'garnish', 'line', 'grease',
         'simmer', 'boil', 'fry', 'saute', 'sauté', 'blend', 'process', 'knead', 'divide', 'shape', 'store', 'enjoy', 'set')
AMOUNT = re.compile(r'^\s*(?:[\-•*▢☐◦·–]\s*)?(?:\d|[½¼¾⅓⅔⅛]|(?:a|an|one|two|three|four|five|six|half|pinch|dash)\b)', re.I)
BULLET = re.compile(r'^\s*[\-•*▢☐◦·–]\s*')
# Preparation words after the ingredient name (they do not change what is eaten).
PREP = re.compile(r'\b(softened|melted|room temperature|at room temperature|chopped|finely|roughly|coarsely|minced|diced|sliced|'
                  r'thinly|grated|shredded|beaten|lightly|packed|firmly|loosely|sifted|divided|separated|peeled|seeded|cored|'
                  r'drained|rinsed|and drained|cubed|halved|quartered|trimmed|toasted|optional|plus more|for serving|'
                  r'for garnish|for dusting|to taste|as needed|if needed|or more|or to taste|at least|about|approximately|heaping|'
                  r'level|scant|fresh(?:ly)? ground|freshly|cold|warm|hot|large egg yolk)\b', re.I)
UNIT_FIX = [(re.compile(r'(?<=\d)\s*T\b'), ' tbsp'), (re.compile(r'(?<=\d)\s*t\b'), ' tsp'), (re.compile(r'\bTbsp\b|\bTBSP\b|\bTbs\b'), 'tbsp'),
            (re.compile(r'(?<=\d)\s*c\.?(?=\s)'), ' cup'), (re.compile(r'\blbs?\.'), 'lb'), (re.compile(r'\boz\.'), 'oz')]
TO_TASTE = re.compile(r'\b(to taste|as needed|for garnish|for serving|optional)\b', re.I)
ZERO_ONLY = re.compile(r'^(salt|pepper|salt and pepper|black pepper|water|ice|cooking spray|nonstick spray|ice cubes?)$', re.I)


def _num(s: str) -> float:
    return float(s)


def find_servings(lines: list[str]) -> tuple[float | None, str | None]:
    for ln in lines:
        m = SERVES.search(ln) or SERVES_AFTER.search(ln)
        if m:
            a = _num(m[1])
            b = _num(m[2]) if m[2] else a
            n = (a + b) / 2
            if re.match(r'\s*dozen', ln[m.end():], re.I):
                n *= 12
            if 0 < n <= 200:
                return n, ln.strip()
    return None, None


def is_step(line: str) -> bool:
    s = BULLET.sub('', line).strip().lower()
    s = re.sub(r'^(step\s*)?\d+[.)]\s+', '', s)
    if len(s.split()) > 16:
        return True
    return s.startswith(VERBS) and not AMOUNT.match(s)


def looks_like_ingredient(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 140 or HEAD_ING.match(s) or HEAD_STEPS.match(s) or SERVES.search(s) and len(s.split()) < 6:
        return False
    if re.match(r'^\s*(step\s*)?\d+[.)]\s+[A-Za-z]', s) and is_step(s):  # numbered cooking step
        return False
    if is_step(s):
        return False
    return bool(AMOUNT.match(s) or BULLET.match(s))


def ingredient_lines(text: str) -> tuple[list[str], str]:
    """(ingredient lines, how they were found)."""
    lines = [l.rstrip() for l in text.replace('\r', '').split('\n')]
    out, mode = [], None
    found_heading = any(HEAD_ING.match(l) for l in lines)
    if found_heading:
        for l in lines:
            if HEAD_ING.match(l):
                mode = 'ing'; continue
            if HEAD_STEPS.match(l) or HEAD_OTHER.match(l):
                mode = None; continue
            if mode == 'ing' and l.strip() and not is_step(l) and not re.match(r'^\s*for the\b.*:?\s*$', l, re.I):
                if l.strip().endswith(':') and not AMOUNT.match(l):
                    continue  # sub-heading such as "Frosting:"
                out.append(l.strip())
        if out:
            return out, 'heading'
    return [l.strip() for l in lines if looks_like_ingredient(l)], 'amount lines'


def clean_line(line: str) -> str:
    s = BULLET.sub('', line).strip()
    s = re.sub(r'\bsemi-sweet\b', 'semisweet', s, flags=re.I)
    s = re.sub(r'\bmorsels?\b', 'chips', s, flags=re.I)
    for pat, rep in UNIT_FIX:
        s = pat.sub(rep, s)
    for k, v in FRAC.items():
        s = s.replace(k, f' {v:g} ')
    s = s.replace('⅛', ' 0.125 ')
    # "1 (15 oz) can black beans" / "2 (14.5-ounce) cans tomatoes" -> "30 oz black beans"
    m = re.match(r'^\s*(\d+(?:\.\d+)?)\s*\(\s*(\d+(?:\.\d+)?)[\s-]*(oz|ounces?|g|grams?|ml)\.?\s*\)\s*(?:cans?|jars?|packages?|pkgs?|boxes|box|bags?|containers?|cartons?)?\s+(.*)$', s, re.I)
    if m:
        s = f'{float(m[1]) * float(m[2]):g} {m[3]} {m[4]}'
    s = re.sub(r'\([^)]*\)', ' ', s)                # other notes in brackets: "(2 sticks)", "(optional)"
    s = re.split(r',|;|\bor\b(?!\s+(?:more|less|to taste))', s, maxsplit=1)[0] if not re.match(r'^\s*salt\s+and\s+pepper', s, re.I) else s
    s = PREP.sub(' ', s)
    s = re.sub(r'\b(of|for|the)\s*$', '', s.strip())
    s = re.sub(r'\s+', ' ', s).strip(' -.:')
    return s


def read_recipe(text: str) -> dict:
    text = (text or '').strip()[:20_000]
    if not text:
        raise ValueError('No recipe text was found.')
    lines = [l for l in text.split('\n')]
    raw, how = ingredient_lines(text)
    servings, serving_line = find_servings(lines)
    title = next((l.strip(' #*') for l in lines if l.strip() and not HEAD_ING.match(l) and not looks_like_ingredient(l)
                  and not SERVES.search(l) and len(l.split()) <= 10 and not is_step(l)), 'Recipe')
    items, unmatched = [], []
    for ln in raw[:80]:
        c = clean_line(ln)
        if not c or not re.search(r'[a-z]{2}', c, re.I):
            continue
        r = estimate_item(c)
        to_taste = bool(TO_TASTE.search(ln)) and not AMOUNT.match(BULLET.sub('', ln))
        if not r['matched']:
            unmatched.append(ln)
        elif to_taste or ZERO_ONLY.match(re.sub(r'^[\d.\s]*(?:tsp|tbsp|cup|pinch|dash)?\s*', '', c, flags=re.I).strip()):
            r = {**r, 'confidence': max(r['confidence'], .9)}
            if to_taste:  # "salt and pepper to taste": no amount given, too little to count
                r.update(grams=0, portion='to taste', calories=0, proteinG=0, carbsG=0, fatG=0, fiberG=0, sugarG=0, sodiumMg=0)
        items.append({'line': ln, 'cleaned': c, **r})
    if not items:
        raise ValueError('No ingredient lines were found. Paste the ingredient list, one ingredient per line.')
    matched = [i for i in items if i['matched']]
    keys = ('calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg')
    total = {k: round(sum(i.get(k, 0) for i in matched), 1) for k in keys}
    n = servings or 1.0
    per = {k: round(v / n, 1) for k, v in total.items()}
    total['calories'], per['calories'] = round(total['calories']), round(per['calories'])
    grams = sum(i['grams'] for i in matched)
    conf = round(sum(i['confidence'] for i in items) / len(items) * (len(matched) / len(items)), 2)
    return {'title': title[:80], 'servings': n, 'servingsFound': servings is not None, 'servingsText': serving_line,
            'ingredientsFoundBy': how, 'ingredients': [
                {'line': i['line'], 'name': i['name'], 'matched': i['matched'], 'portion': i['portion'], 'grams': i['grams'],
                 'calories': i['calories'], 'proteinG': i['proteinG'], 'carbsG': i['carbsG'], 'fatG': i['fatG'],
                 'usdaDescription': i.get('usdaDescription'), 'confidence': i['confidence']} for i in items],
            'total': total, 'perServing': per, 'servingGrams': round(grams / n), 'unmatched': unmatched, 'confidence': conf}
