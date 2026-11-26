"""USDA SR28 nutrition engine: food search, portion resolution and meal-text parsing.

All nutrient values come from the USDA National Nutrient Database for Standard
Reference, Release 28 (public domain), stored per 100 g in data/usda_sr28.json.
Free text such as "2 eggs, a cup of rice and a tbsp of olive oil" is split into
items, each item's quantity and unit are parsed, the food is matched to an SR28
entry (curated aliases first, then a ranked search), and the unit is converted
to grams with SR28's own household measures.
"""
from __future__ import annotations

import difflib
import json
import os
import math
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / 'data'

# ---------------------------------------------------------------- text utils

_IRREGULAR = {'leaves': 'leaf', 'loaves': 'loaf', 'knives': 'knife', 'potatoes': 'potato', 'tomatoes': 'tomato',
              'cookies': 'cookie', 'berries': 'berry', 'cherries': 'cherry', 'fries': 'fry', 'pastries': 'pastry',
              'patties': 'patty', 'anchovies': 'anchovy', 'radishes': 'radish', 'sandwiches': 'sandwich',
              'peaches': 'peach', 'dishes': 'dish', 'mice': 'mouse', 'geese': 'goose', 'oz': 'oz', 'chips': 'chip',
              'nachos': 'nacho', 'tacos': 'taco', 'burritos': 'burrito', 'mangoes': 'mango', 'avocados': 'avocado',
              'noodles': 'noodle', 'oats': 'oat', 'grits': 'grits', 'hummus': 'hummus', 'couscous': 'couscous',
              'asparagus': 'asparagus', 'molasses': 'molasses', 'swiss': 'swiss', 'brussels': 'brussels',
              'hash': 'hash', 'quinoa': 'quinoa', 'bass': 'bass', 'grass': 'grass', 'glass': 'glass'}


def stem(word: str) -> str:
    w = word.lower()
    if w in _IRREGULAR:
        return _IRREGULAR[w]
    if len(w) > 4 and w.endswith('ies'):
        return w[:-3] + 'y'
    if len(w) > 4 and re.search(r'(ches|shes|sses|xes|zes)$', w):
        return w[:-2]
    if len(w) > 3 and w.endswith('s') and not w.endswith(('ss', 'us', 'is')):
        return w[:-1]
    return w


def tokens(text: str) -> list[str]:
    return [stem(t) for t in re.findall(r"[a-z]+", text.lower().replace("'", ''))]


STOP = {'a', 'an', 'the', 'of', 'with', 'and', 'or', 'in', 'on', 'for', 'to', 'my', 'some', 'had', 'ate',
        'i', 'from', 'plus', 'serving', 'portion', 'piece', 'pc', 'bowl', 'plate', 'glass', 'side', 'like', 'about',
        'around', 'approx', 'approximately', 'little', 'bit', 'few', 'couple', 'homemade', 'fresh', 'delicious',
        'yummy', 'big', 'huge', 'small', 'medium', 'large', 'regular', 'whole'}
ALIAS_STOP = {'a', 'an', 'the', 'of', 'and', 'with', 'or', 'in', 'on', 'my', 'some', 'had', 'ate', 'i'}

# ---------------------------------------------------------------- database


@dataclass
class Food:
    id: str
    desc: str
    group: str
    kcal: float
    protein: float
    fat: float
    carbs: float
    fiber: float
    sugar: float
    sodium_mg: float
    portions: list
    common: str = ''
    toks: frozenset = field(default_factory=frozenset)
    head: frozenset = field(default_factory=frozenset)

    def per(self, grams: float) -> dict:
        f = grams / 100.0
        return {'calories': round(self.kcal * f), 'proteinG': round(self.protein * f, 1),
                'carbsG': round(self.carbs * f, 1), 'fatG': round(self.fat * f, 1),
                'fiberG': round(self.fiber * f, 1), 'sugarG': round(self.sugar * f, 1),
                'sodiumMg': round(self.sodium_mg * f)}


@lru_cache(maxsize=1)
def db() -> 'NutritionDB':
    return NutritionDB(DATA / 'usda_sr28.json', DATA / 'food_aliases.json')


@lru_cache(maxsize=1)
def dishes() -> 'NutritionDB | None':
    """USDA FNDDS survey foods (data/fndds.json): measured nutrients for ~5,400 dishes as people eat them."""
    p = DATA / 'fndds.json'
    return NutritionDB(p) if p.exists() and os.environ.get('FOOTPRINT_NO_FNDDS') != '1' else None


def dish_match(phrase: str, min_words: int = 2) -> tuple['Food | None', float]:
    """An FNDDS dish whose description contains every content word of the phrase, including the dish noun.

    Kept strict on purpose: it only replaces hand-built recipes or weak matches, and keeps "X with Y"
    together only when USDA lists that exact dish.
    """
    D = dishes()
    if D is None:
        return None, 0.0
    q = {t for t in tokens(phrase) if t not in STOP}
    if len(q) < min_words:
        return None, 0.0
    for _, f in D.search(phrase, 15):
        if q <= f.toks and q & f.head:
            return f, .82
    return None, 0.0


class NutritionDB:
    def __init__(self, path: Path, alias_path: Path | None = None):
        raw = json.loads(path.read_text())['foods']
        self.foods: dict[str, Food] = {}
        for r in raw:
            f = Food(**r)
            f.toks = frozenset(tokens(f.desc + ' ' + f.common))
            f.head = frozenset(tokens(f.desc.split(',')[0]))
            self.foods[f.id] = f
        df: dict[str, int] = {}
        for f in self.foods.values():
            for t in f.toks:
                df[t] = df.get(t, 0) + 1
        n = len(self.foods)
        self.idf = {t: math.log((n + 1) / (c + .5)) for t, c in df.items()}
        self.vocab = set(df)
        self.index: dict[str, list[str]] = {}
        for f in self.foods.values():
            for t in f.toks:
                self.index.setdefault(t, []).append(f.id)
        self.aliases: dict[str, dict] = {}
        self.recipe_parts: dict[str, set] = {}
        if alias_path and alias_path.exists():
            for key, val in json.loads(alias_path.read_text()).items():
                if key.startswith('_'):
                    continue
                if 'recipe' in val:
                    val = {'id': self._add_recipe(key, val)}
                self.aliases[' '.join(t for t in tokens(key) if t not in ALIAS_STOP)] = val
                self.vocab.update(tokens(key))
        self._vocab_list = sorted(self.vocab)

    def correct(self, phrase: str) -> str:
        """Fix misspelt food words ('chiken' -> 'chicken') against the food vocabulary."""
        out = []
        for w in re.findall(r"[a-z]+", phrase.lower()):
            st = stem(w)
            if len(w) < 4 or st in self.vocab or w in self.vocab or w in STOP or w in ALIAS_STOP:
                out.append(w); continue
            m = difflib.get_close_matches(st, self._vocab_list, n=1, cutoff=.8)
            out.append(m[0] if m else w)
        return ' '.join(out)

    def _add_recipe(self, name: str, spec: dict) -> str:
        """A dish made of SR28 ingredients; stored per 100 g like every other food."""
        parts = [(self.foods[i], g) for i, g in spec['recipe']]
        total = sum(g for _, g in parts)
        agg = {k: sum(getattr(f, k) * g / 100 for f, g in parts) * 100 / total
               for k in ('kcal', 'protein', 'fat', 'carbs', 'fiber', 'sugar', 'sodium_mg')}
        fid = 'recipe:' + name.replace(' ', '_')
        f = Food(id=fid, desc=f'{name.capitalize()} (USDA ingredient recipe)', group='Recipes',
                 portions=[[1.0, spec.get('serving', 'serving'), float(total)]], **{k: round(v, 2) for k, v in agg.items()})
        f.toks = frozenset(tokens(name)); f.head = f.toks
        self.foods[fid] = f
        self.recipe_parts[fid] = set().union(*(tokens(pf.desc.split(',')[0]) + tokens(pf.common) for pf, _ in parts)) | {'guac', 'guacamole'} & set()
        return fid

    # -------------------------------------------------- search
    BAD_GROUPS = {'Baby Foods': 3.0, 'American Indian/Alaska Native Foods': 2.0}
    BAD_WORDS = {'infant': 3, 'formula': 2, 'dehydrated': 1.2, 'industrial': 2, 'mechanically': 2,
                 'imitation': 1.0, 'babyfood': 3, 'toddler': 3, 'unprepared': .8, 'concentrate': .8,
                 'canned': .35, 'frozen': .35, 'dry': .5, 'powder': .8, 'flour': .6, 'meal': .3,
                 'variety': .6, 'byproduct': 2, 'liver': .4, 'giblet': 1, 'ns': .2, 'commodity': .6,
                 'school': .6, 'lunch': .3, 'usda': .5, 'separable': .1, 'fat': .1, 'glazed': .2,
                 'heated': .3, 'microwaved': .4, 'reduced': .4, 'low': .3, 'light': .3, 'lite': .3,
                 'diet': .5, 'free': .5, 'unenriched': .3, 'skin': .1, 'canada': .5, 'australian': .5,
                 'new': .2, 'zealand': .5, 'japanese': .2, 'mexican': .1, 'puerto': .4, 'rican': .4}
    COOKED_GROUPS = {'Beef Products', 'Pork Products', 'Poultry Products', 'Lamb, Veal, and Game Products',
                     'Finfish and Shellfish Products', 'Cereal Grains and Pasta', 'Legumes and Legume Products',
                     'Sausages and Luncheon Meats'}

    def search(self, query: str, limit: int = 5) -> list[tuple[float, Food]]:
        q = [t for t in tokens(query) if t not in STOP]
        if not q:
            return []
        qs = set(q)
        cand: set[str] = set()
        for t in qs:
            cand.update(self.index.get(t, ()))
        total = sum(self.idf.get(t, 1.0) for t in qs) or 1.0
        out = []
        for fid in cand:
            f = self.foods[fid]
            hit = sum(self.idf.get(t, 1.0) for t in qs if t in f.toks)
            cover = hit / total
            if cover < .3:
                continue
            score = cover
            score += .35 * len(qs & f.head) / len(qs)  # query words in the primary noun
            if f.head and f.head <= qs:
                score += .15
            extra = f.toks - qs
            score -= .012 * len(extra)  # prefer plain, short descriptions
            score -= self.BAD_GROUPS.get(f.group, 0)
            for w, pen in self.BAD_WORDS.items():
                if w in f.toks and w not in qs:
                    score -= pen * .25
            if f.group in self.COOKED_GROUPS and 'raw' in f.toks and 'raw' not in qs:
                score -= .25
            if f.group in ('Vegetables and Vegetable Products', 'Fruits and Fruit Juices'):
                if 'raw' in f.toks and not qs & {'cooked', 'boiled', 'steamed', 'roasted', 'canned', 'fried'}:
                    score += .1
                if 'juice' in f.toks and 'juice' not in qs:
                    score -= .3
            if qs & {'cooked', 'boiled', 'steamed', 'roasted', 'grilled', 'baked', 'fried'} and 'raw' in f.toks:
                score -= .3
            out.append((score, f))
        # Ties are common (e.g. four "Beef, tenderloin" cuts); break them by description length, then id,
        # so the answer does not depend on Python's per-process hash order.
        out.sort(key=lambda x: (-round(x[0], 6), len(x[1].desc), x[1].id))
        return out[:limit]

    def lookup(self, phrase: str) -> tuple[Food | None, float, str]:
        """Return (food, confidence 0..1, how) for a food phrase."""
        fixed = self.correct(phrase)
        if fixed != ' '.join(re.findall(r"[a-z]+", phrase.lower())):
            food, conf, how = self._lookup(fixed)
            return food, conf * .9, how + ' (spelling corrected)'
        return self._lookup(phrase)

    def _lookup(self, phrase: str) -> tuple[Food | None, float, str]:
        key = ' '.join(t for t in tokens(phrase) if t not in ALIAS_STOP)
        if not key or not [t for t in tokens(phrase) if t not in STOP]:
            return None, 0.0, 'empty'
        # Longest alias contained in the phrase wins ("grilled chicken breast" > "chicken").
        content = [t for t in key.split() if t not in STOP]
        head = content[-1] if content else ''
        best = None
        for alias, val in self.aliases.items():
            if (' ' + key + ' ').find(' ' + alias + ' ') < 0:
                continue
            rank = (alias.split()[-1] == head, len(alias))  # the dish noun beats a modifier
            if best is None or rank > best[0]:
                best = (rank, alias, val)
        if best:
            (has_head, _), alias, val = best
            f = self.foods.get(val['id'])
            if f:
                core = ' '.join(content)
                if alias in (key, core):
                    conf = .92
                elif has_head:
                    conf = .8
                else:  # only a modifier matched ("chicken" in "chicken tikka masala")
                    conf = .45
                return f, conf, 'alias:' + alias + ('' if has_head else ' (partial)')
        hits = self.search(phrase, 2)
        if not hits:
            return None, 0.0, 'none'
        score, f = hits[0]
        margin = score - (hits[1][0] if len(hits) > 1 else 0)
        conf = max(.15, min(.75, .35 + .4 * min(score, 1.2) / 1.2 + .3 * min(margin, .5)))
        return f, conf, 'search'


# ---------------------------------------------------------------- portions

UNIT_ALIASES = {
    'g': ('g',), 'gram': ('g',), 'gr': ('g',), 'kg': ('kg',), 'kilogram': ('kg',),
    'oz': ('oz',), 'ounce': ('oz',), 'lb': ('lb',), 'pound': ('lb',),
    'ml': ('ml',), 'milliliter': ('ml',), 'l': ('l',), 'liter': ('l',), 'litre': ('l',),
    'cup': ('cup',), 'c': ('cup',), 'mug': ('cup',), 'glass': ('glass',), 'bowl': ('bowl',),
    'tbsp': ('tbsp',), 'tablespoon': ('tbsp',), 'tbs': ('tbsp',), 'tbl': ('tbsp',),
    'tsp': ('tsp',), 'teaspoon': ('tsp',),
    'slice': ('slice',), 'piece': ('piece',), 'pc': ('piece',), 'stick': ('stick',), 'scoop': ('scoop',),
    'can': ('can',), 'bottle': ('bottle',), 'bar': ('bar',), 'packet': ('packet',), 'pack': ('packet',),
    'serving': ('serving',), 'handful': ('handful',), 'fillet': ('fillet',), 'filet': ('fillet',),
    'breast': ('breast',), 'thigh': ('thigh',), 'drumstick': ('drumstick',), 'wing': ('wing',),
    'patty': ('patty',), 'link': ('link',), 'strip': ('slice',), 'clove': ('clove',), 'leaf': ('leaf',),
    'floz': ('floz',), 'shot': ('shot',), 'pint': ('pint',), 'quart': ('quart',), 'container': ('container',),
}
SIZE_WORDS = {'small', 'medium', 'large', 'extra', 'jumbo', 'big', 'regular'}
GRAMS_PER = {'g': 1, 'kg': 1000, 'oz': 28.35, 'lb': 453.6}
ML_PER = {'ml': 1, 'l': 1000, 'floz': 29.57, 'cup': 240, 'tbsp': 14.79, 'tsp': 4.93, 'shot': 44.4, 'pint': 473,
          'quart': 946, 'bowl': 350}
WORD_NUM = {'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7,
            'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'half': .5, 'quarter': .25,
            'couple': 2, 'few': 3, 'dozen': 12, 'some': 1, 'several': 3, 'double': 2, 'triple': 3}
FRAC = {'½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3}


@dataclass
class Parsed:
    text: str
    quantity: float
    unit: str | None
    size: str | None
    food_phrase: str
    counted: bool = False


FILLER = re.compile(r'^(?:(?:i\s+)?(?:had|ate|drank|eaten|having|got|just|also|then|for\s+(?:breakfast|lunch|dinner|snack))\s+)+')


def parse_item(text: str) -> Parsed:
    s = text.strip().lower()
    s = FILLER.sub('', s)
    tail = re.search(r'\s(?:x\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(g|grams?|kg|oz|ounces?|lbs?|ml)\b)\s*$', s)
    if tail and not re.match(r'^\s*[\d½¼¾⅓⅔]', s):  # "chicken breast 200g", "eggs x2": move to the front
        s = (f'{tail[1]} ' if tail[1] else f'{tail[2]} {tail[3]} ') + s[:tail.start()]
    for k, v in FRAC.items():
        s = s.replace(k, f' {v} ')
    s = re.sub(r'(\d)\s*-\s*(\d)', lambda m: f'{(int(m[1]) + int(m[2])) / 2}', s)  # "2-3" -> 2.5
    s = re.sub(r'(\d+(?:\.\d+)?)\s*(g|kg|oz|lb|ml|l)\b', r'\1 \2', s)  # "200g" -> "200 g"
    s = s.replace('fl oz', 'floz').replace('fluid ounce', 'floz')
    words = s.replace(',', ' ').split()
    qty, i = None, 0
    # leading quantity: "1 1/2", "1.5", "3/4", "two", "half a"
    while i < len(words):
        w = words[i]
        m = re.fullmatch(r'(\d+)/(\d+)', w)
        if m and int(m[2]):
            qty = (qty or 0) + int(m[1]) / int(m[2]); i += 1; continue
        if re.fullmatch(r'\d+(?:\.\d+)?', w):
            qty = (qty or 0) + float(w); i += 1; continue
        if re.fullmatch(r'\d+(?:\.\d+)?x', w):
            qty = (qty or 0) + float(w[:-1]); i += 1; continue
        if w in WORD_NUM and (qty is None or w in ('half', 'quarter')):
            val = WORD_NUM[w]
            qty = val if qty is None else qty + val
            i += 1
            if i < len(words) and words[i] in ('a', 'an', 'of'):
                i += 1
            continue
        if w == 'x' and qty is not None:
            i += 1; continue
        break
    rest = words[i:]
    size = None
    if rest and rest[0] in SIZE_WORDS:
        size = 'large' if rest[0] in ('big', 'jumbo', 'extra') else rest[0]
        rest = rest[1:]
    unit = None
    if rest:
        u = stem(rest[0])
        two = ' '.join(t for t in tokens(' '.join(rest[:2])) if t not in ALIAS_STOP)
        named_dish = len(rest) >= 2 and len(two.split()) == 2 and two in db().aliases  # "filet mignon" is a dish, not "a fillet of mignon"
        if (u in UNIT_ALIASES or rest[0] in UNIT_ALIASES) and not named_dish:
            unit = UNIT_ALIASES.get(u, UNIT_ALIASES.get(rest[0]))[0]
            rest = rest[1:]
            if rest and rest[0] == 'of':
                rest = rest[1:]
    if rest and rest[0] in SIZE_WORDS and size is None:
        size = 'large' if rest[0] in ('big', 'jumbo', 'extra') else rest[0]
        rest = rest[1:]
    phrase = ' '.join(rest).strip()
    return Parsed(text=text.strip(), quantity=qty if qty and qty > 0 else 1.0, unit=unit, size=size,
                  food_phrase=phrase or s, counted=qty is not None and not (words and words[0] in ('a', 'an', 'some')))


_MEASURE_UNIT = {'cup': ('cup',), 'tbsp': ('tbsp',), 'tsp': ('tsp',), 'slice': ('slice',), 'piece': ('piece', 'pie'),
                 'stick': ('stick',), 'scoop': ('scoop',), 'can': ('can',), 'bottle': ('bottle',), 'bar': ('bar',),
                 'packet': ('packet', 'package'), 'serving': ('serving',), 'fillet': ('fillet',),
                 'breast': ('breast',), 'thigh': ('thigh',), 'drumstick': ('drumstick',), 'wing': ('wing',),
                 'patty': ('patty',), 'link': ('link', 'sausage'), 'clove': ('clove',), 'leaf': ('leaf',),
                 'floz': ('fl oz',), 'container': ('container',)}


def _measure_fraction(desc: str, unit_pos: int) -> float:
    """'serving 1/2 cup' -> 0.5 for the cup; '1 1/2 cup' -> 1.5."""
    head = desc[:unit_pos]
    m = re.search(r'(\d+)\s+(\d+)/(\d+)\s*$', head) or re.search(r'(\d+)/(\d+)\s*$', head) or re.search(r'(\d+(?:\.\d+)?)\s*$', head)
    if not m:
        return 1.0
    g = m.groups()
    if len(g) == 3:
        return int(g[0]) + int(g[1]) / int(g[2])
    if len(g) == 2:
        return int(g[0]) / int(g[1]) if int(g[1]) else 1.0
    return float(g[0]) or 1.0


def _portion_weight(food: Food, keys: tuple[str, ...], size: str | None) -> tuple[float, str] | None:
    best = None
    for amount, desc, grams in food.portions:
        d = desc.lower()
        hit = None
        for k in keys:
            m = re.search(r'\b' + re.escape(k), d)
            if m:
                hit = m; break
        if not hit:
            continue
        rank = 0
        if size and size in d:
            rank += 2
        if not size and 'medium' in d:
            rank += 1
        if 'nlea' in d:
            rank -= .5
        if hit.start() == 0:
            rank += .5
        if not size and re.search(r'fun size|mini|bite|snack size|king size|share size|extra large', d):
            rank -= 1.5
        per_unit = grams / ((amount or 1) * _measure_fraction(d, hit.start()))
        if best is None or rank > best[0]:
            best = (rank, per_unit, desc)
    return (best[1], best[2]) if best else None


_PIECES = re.compile(r'(\d+(?:\.\d+)?)\s+(?:large |medium |small )?(pancakes|cookies|pieces|items|crackers|chips|crisps|wings|nuggets|strips|links|slices|tenders|shrimp|pretzels|eggs)\b')


CONDIMENT = re.compile(r'\b(honey|syrup|jam|jelly|preserves|sauce|dressing|mayonnaise|oil|butter|margarine|ketchup|catsup|mustard|spread|sugar|cream cheese|salsa|dip|gravy|creamer|hummus|cream|nutella)\b', re.I)
PROTEIN_GROUPS = {'Beef Products', 'Pork Products', 'Poultry Products', 'Finfish and Shellfish Products',
                  'Lamb, Veal, and Game Products'}


def default_serving(food: Food, size: str | None = None, phrase: str = '', counted: bool = False) -> tuple[float, str]:
    """A sensible single serving in grams when the user gave no unit."""
    d0 = food.desc.split(',')[0].lower()
    if CONDIMENT.search(d0) and not re.search(r'\b(sandwich|soup|pasta|cake|pie)\b', d0):
        tb = _portion_weight(food, ('tbsp',), None)
        if tb:
            return tb[0], 'tbsp'
    g, desc = _default_serving(food, size, phrase, counted)
    if food.id.startswith('F') and g < 60 and not counted and not size:  # FNDDS "1 shrimp" in shrimp scampi: serve a cup
        cup = _portion_weight(food, ('cup',), None)
        if cup:
            return cup[0], 'cup'
    if g < 15 and not counted:  # "with blueberries": a normal serving, not one berry
        cup = _portion_weight(food, ('cup',), None)
        if cup and 'oz' not in desc:
            return cup[0] * .5, '1/2 cup'
        return max(g, 28.0), '1 oz' if g < 28 else desc
    if food.group in PROTEIN_GROUPS and g > 200 and not size:
        return 170.0, '6 oz cooked (typical serving)'
    return g, desc


def _default_serving(food: Food, size: str | None, phrase: str, counted: bool = False) -> tuple[float, str]:
    # The user named the unit inside the food word ("3 wings", "2 eggs"): use that measure.
    toks = [t for t in tokens(phrase) if t not in STOP]
    noun = toks[-1] if toks else ''
    for amount, desc, grams in (food.portions if not size else []):
        first = tokens(desc)[:1]
        if first and first[0] == noun and noun not in ('cup', 'oz', 'tbsp', 'tsp', 'serving') and grams / (amount or 1) < 400:
            return grams / (amount or 1), desc
    countable = []
    for amount, desc, grams in food.portions:
        d = desc.lower()
        if re.match(r'(cup|tbsp|tsp|oz|lb|fl oz|pint|quart|g)\b', d):  # a measure, not a countable item
            continue
        countable.append((amount, desc, grams))
    pool = [x for x in (countable or food.portions) if 'yield' not in x[1].lower()] or countable or food.portions
    if not size:  # snack-size variants only when asked for
        full = [x for x in pool if not re.search(r'fun size|mini|bite|snack size|miniature|bar, small|nugget|king size|share size', x[1].lower())]
        pool = full or pool
    if size:
        for amount, desc, grams in pool:
            if size in desc.lower():
                return grams / (amount or 1), desc
    prefs = ('medium', 'serving', 'large', 'slice', 'piece', 'item')
    if food.id.startswith('F'):  # FNDDS portions: "small/regular", "large", "full circle", ...
        prefs = ('regular', 'medium', 'serving', 'slice', 'piece', 'item', 'large')
    if food.group == 'Beverages' or 'beverage' in food.desc.lower():
        prefs = ('can', 'bottle', 'cup', 'serving', 'medium')
    for pref in prefs:
        for amount, desc, grams in pool:
            d = desc.lower()
            if pref in d:
                pieces = _PIECES.search(d)  # "serving (3 pancakes)" -> one pancake, if the user counted pancakes
                counted = pieces and stem(pieces[2]) in tokens(phrase)
                n = float(pieces[1]) if counted else 1.0
                return grams / ((amount or 1) * n), (desc if n == 1 else f'1 of {desc}')
    if pool:
        amount, desc, grams = pool[0]
        return grams / (amount or 1), desc
    return 100.0, '100 g'


def grams_for(food: Food, p: Parsed) -> tuple[float, str, str]:
    """Return (grams, portion label, how) for a parsed quantity of food."""
    q = p.quantity
    if p.unit in GRAMS_PER:
        g = q * GRAMS_PER[p.unit]
        return g, f'{q:g} {p.unit}', 'mass'
    if p.unit in _MEASURE_UNIT:
        hit = _portion_weight(food, _MEASURE_UNIT[p.unit], p.size)
        if hit:
            return q * hit[0], f'{q:g} × {hit[1]}', 'usda-measure'
    if p.unit == 'bowl' and (food.kcal > 300 or re.search(r'\bdry\b|powder', food.desc.lower())):
        per, desc = default_serving(food, p.size, p.food_phrase, p.counted)  # "a bowl of ramen" = one prepared portion
        return q * per, f'{q:g} bowl ({desc})', 'usda-default'
    if p.unit in ML_PER:
        # volume without a USDA measure: use the cup measure for density if present, else water-like
        cup = _portion_weight(food, ('cup',), None)
        density = (cup[0] / 240.0) if cup else 1.0
        g = q * ML_PER[p.unit] * density
        return g, f'{q:g} {p.unit}', 'volume'
    if p.unit == 'glass':
        d = food.desc.lower()
        ml = 148 if 'wine' in d else 355 if 'beer' in d else 240  # 5 fl oz wine, 12 fl oz beer, 8 fl oz otherwise
        cup = _portion_weight(food, ('cup', 'fl oz'), None)
        fl = _portion_weight(food, ('fl oz',), None)
        density = (fl[0] / 29.57) if fl else (cup[0] / 240.0) if cup else 1.0
        return q * ml * density, f'{q:g} glass ({ml} ml)', 'volume'
    if p.unit == 'scoop':
        hit = _portion_weight(food, ('scoop',), None)
        if hit:
            return q * hit[0], f'{q:g} × {hit[1]}', 'usda-measure'
        d = food.desc.lower()
        g = 66 if ('ice cream' in d or 'frozen yogurt' in d) else 30  # 1/2 cup ice cream; powder scoop ~30 g
        return q * g, f'{q:g} scoop (~{g} g)', 'estimate'
    if p.unit in ('handful',):
        return q * 30, f'{q:g} handful', 'estimate'
    per, desc = default_serving(food, p.size, p.food_phrase, p.counted)
    return q * per, (f'{q:g} × {desc}' if q != 1 else desc), 'usda-default'


# ---------------------------------------------------------------- meal text

SPLIT = re.compile(r',|;|\n|\+|&|\bwith\b|\band\b|\bplus\b|\balso\b|\bthen\b|\bon\b|\btopped\b', re.I)
KEEP_TOGETHER = ['mac and cheese', 'macaroni and cheese', 'peanut butter and jelly', 'pb and j', 'pb&j',
                 'fish and chips', 'rice and beans', 'bread and butter', 'salt and pepper', 'chips and salsa',
                 'chicken and rice', 'spaghetti and meatballs', 'biscuits and gravy', 'cookies and cream',
                 'ham and cheese', 'bacon and eggs', 'sweet and sour', 'half and half', 'franks and beans',
                 'pork and beans', 'liver and onions', 'surf and turf', 'grilled cheese with tomato']


def split_meal(text: str) -> list[str]:
    s = text
    protected = {}
    for i, phrase in enumerate(KEEP_TOGETHER):
        pat = re.compile(re.escape(phrase), re.I)
        if pat.search(s):
            token = f'§{i}§'
            s = pat.sub(token, s)
            protected[token] = phrase
    parts = [p.strip(' .') for p in SPLIT.split(s)]
    out = []
    for p in parts:
        for token, phrase in protected.items():
            p = p.replace(token, phrase)
        if p and re.search(r'[a-z]', p, re.I):
            out.append(p)
    return out


def estimate_item(text: str, topping: bool = False) -> dict:
    p = parse_item(text)
    food, conf, how = db().lookup(p.food_phrase)
    # Nothing good in SR28 or the curated aliases: try a measured USDA (FNDDS) dish.
    # (Replacing the hand-built recipes with FNDDS was tested and scored worse: FNDDS often lists
    # only small portions such as "1 cup", so it is used only where the lookup is weak.)
    words = {t for t in tokens(db().correct(p.food_phrase)) if t not in STOP}
    weak = food is None or how.endswith('(partial)') or (how.startswith('search') and (conf < .6 or not words <= food.toks))
    if weak and not (food is not None and words <= food.toks):  # SR28 already names every word: keep it
        dish, dconf = dish_match(db().correct(p.food_phrase))
        if dish is not None:
            food, conf, how = dish, dconf, 'fndds-dish'
    if food is not None and how.endswith('(spelling corrected)'):
        p.food_phrase = db().correct(p.food_phrase)
    if food is None:
        return {'name': p.text, 'matched': False, 'confidence': 0.0, 'portion': p.text,
                'calories': 0, 'proteinG': 0, 'carbsG': 0, 'fatG': 0, 'grams': 0, 'usdaId': None}
    grams, label, measure = grams_for(food, p)
    if topping and not p.counted and p.unit is None and food.kcal >= 300 and grams > 30:
        grams, label, measure = 30.0, 'topping (~30 g)', 'estimate'
    grams = max(1.0, min(grams, 3000.0))
    if measure in ('estimate', 'volume') or (measure == 'usda-default' and not food.portions):
        conf *= .85
    return {'name': p.food_phrase.strip().capitalize() or food.desc, 'matched': True, 'usdaId': food.id,
            'usdaDescription': food.desc, 'confidence': round(conf, 2), 'portion': label,
            'grams': round(grams), 'match': how, 'measure': measure, **food.per(grams)}


def _whole_alias(segment: str) -> bool:
    p = parse_item(segment)
    key = ' '.join(t for t in tokens(db().correct(p.food_phrase)) if t not in ALIAS_STOP)
    return key in db().aliases


def _topping_flags(text: str, parts: list[str]) -> list[bool]:
    """True for parts introduced by 'with'/'on'/'topped with' (add-ons, not mains)."""
    low, flags, pos = text.lower(), [], 0
    for part in parts:
        i = low.find(part.lower(), pos)
        before = low[max(0, pos - 1):i if i >= 0 else pos]
        flags.append(bool(re.search(r'\b(with|on|topped)\b[\s\w]*$', before)) and i > 0)
        if i >= 0:
            pos = i + len(part)
    return flags


def plan_items(text: str) -> list[str]:
    parts: list[str] = []
    for seg in re.split(r'[,;\n]', text):
        seg = seg.strip(' .')
        if not seg:
            continue
        if _whole_alias(seg):
            parts.append(seg); continue
        if re.search(r'(with|and)', seg, re.I) and dish_match(db().correct(parse_item(seg).food_phrase))[0] is not None:
            parts.append(seg); continue  # a named dish such as "chili with beans" stays one item
        pieces = split_meal(seg)
        # "burrito bowl with chicken, rice and beans": ingredients of a recipe dish are already counted
        head = pieces[0] if pieces else ''
        hf, _, _ = db().lookup(parse_item(head).food_phrase) if head else (None, 0, '')
        own = db().recipe_parts.get(hf.id, set()) if hf else set()
        kept = [head] if head else []
        for extra in pieces[1:]:
            et = {t for t in tokens(db().correct(extra)) if t not in STOP}
            if own and et and et <= own | {'guac', 'guacamole', 'avocado', 'salsa', 'cheese', 'sauce'}:
                continue
            kept.append(extra)
        parts.extend(kept)
    return parts


def estimate_meal(text: str) -> dict:
    parts = plan_items(text)
    toppings = _topping_flags(text, parts)
    items = [estimate_item(part, top) for part, top in zip(parts, toppings)]
    matched = [i for i in items if i['matched']]
    tot = {k: round(sum(i[k] for i in matched), 1) for k in ('calories', 'proteinG', 'carbsG', 'fatG')}
    tot['calories'] = round(tot['calories'])
    conf = round(sum(i['confidence'] for i in items) / len(items), 2) if items else 0.0
    return {'items': items, 'totals': tot, 'confidence': conf,
            'unmatched': [i['name'] for i in items if not i['matched']]}
