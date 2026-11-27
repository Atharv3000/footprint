"""Branded snacks and packaged foods (Open Food Facts subset in data/products.sqlite).

- by_barcode("0028400090858") -> exact product with the label's per-100 g nutrition.
- search("doritos nacho cheese") -> ranked products for typed names, receipt lines or packaging text.

Data: Open Food Facts (https://world.openfoodfacts.org), Open Database License (ODbL); built by
training/build_products.py. Values are what manufacturers print on the pack, entered by contributors.
"""
from __future__ import annotations

import json
import re
import sqlite3
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

PATH = Path(__file__).parent / 'data' / 'products.sqlite'
GZ = PATH.with_name('products.sqlite.gz')  # what is checked in (23 MB); unpacked on first use
_lock = threading.Lock()
# Words on packs that say nothing about which product it is.
NOISE = {'the', 'and', 'with', 'of', 'a', 'an', 'in', 'for', 'new', 'net', 'wt', 'oz', 'g', 'kg', 'ml', 'l', 'lb', 'fl',
         'natural', 'naturally', 'flavored', 'flavor', 'flavour', 'artificially', 'made', 'real', 'no', 'free', 'gluten',
         'non', 'gmo', 'organic', 'size', 'family', 'party', 'pack', 'bag', 'value', 'contains', 'servings', 'per',
         'container', 'calories', 'serving', 'total', 'fat', 'sodium', 'snack', 'snacks', 'food', 'foods', 'brand', 'original',
         'classic', 'great', 'taste', 'delicious', 'crunchy', 'best', 'more', 'less', 'by', 'from', 'to', 'de', 'et', 'la', 'le'}


ENGLISH = re.compile(r'united-states|united-kingdom|canada|australia|india|ireland|new-zealand|south-africa|singapore')


@dataclass
class Product:
    code: str
    name: str
    brand: str
    quantity: str
    serving: str
    serving_g: float | None
    kcal: float
    protein: float
    carbs: float
    fat: float
    fiber: float | None
    sugar: float | None
    sodium: float | None  # g per 100 g
    scans: int
    countries: str
    category: str

    @property
    def title(self) -> str:
        b = self.brand.strip()
        return f'{b} {self.name}' if b and b.lower() not in self.name.lower() else self.name

    def serving_grams(self) -> tuple[float, str]:
        if self.serving_g:
            label = self.serving if self.serving else f'{self.serving_g:g} g'
            return float(self.serving_g), f'1 serving ({label})' if not label.lower().startswith(('1 ', 'one')) else label
        return 30.0, '1 serving (~30 g, label serving size unknown)'

    def per(self, grams: float) -> dict:
        f = grams / 100.0
        return {'calories': round(self.kcal * f), 'proteinG': round(self.protein * f, 1), 'carbsG': round(self.carbs * f, 1),
                'fatG': round(self.fat * f, 1), 'fiberG': round((self.fiber or 0) * f, 1), 'sugarG': round((self.sugar or 0) * f, 1),
                'sodiumMg': round((self.sodium or 0) * 1000 * f)}

    def as_item(self, grams: float | None = None, confidence: float = .9, how: str = 'product') -> dict:
        g, label = (grams, f'{grams:g} g') if grams else self.serving_grams()
        return {'name': self.title, 'matched': True, 'barcode': self.code, 'brand': self.brand, 'productName': self.name,
                'packageSize': self.quantity or None, 'portion': label, 'grams': round(g), 'confidence': round(confidence, 2),
                'usdaDescription': None, 'source': 'open-food-facts', 'match': how, **self.per(g)}


def _unpack() -> Path | None:
    """products.sqlite, unpacked from products.sqlite.gz when needed (next to it, or in the temp folder)."""
    if PATH.exists() and (not GZ.exists() or PATH.stat().st_mtime >= GZ.stat().st_mtime):
        return PATH
    if not GZ.exists():
        return PATH if PATH.exists() else None
    import gzip
    import shutil
    import tempfile
    for target in (PATH, Path(tempfile.gettempdir()) / 'footprint_products.sqlite'):
        if target.exists() and target.stat().st_mtime >= GZ.stat().st_mtime:
            return target
        try:
            tmp = target.with_suffix('.part')
            with gzip.open(GZ, 'rb') as src, open(tmp, 'wb') as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
            tmp.replace(target)
            return target
        except OSError:
            continue
    return None


@lru_cache(maxsize=1)
def _conn() -> sqlite3.Connection | None:
    path = _unpack()
    if path is None:
        return None
    c = sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def available() -> bool:
    return _conn() is not None


def stats() -> dict:
    c = _conn()
    if c is None:
        return {}
    with _lock:
        row = c.execute("SELECT v FROM meta WHERE k='stats'").fetchone()
    return json.loads(row[0]) if row else {}


def _row(r: sqlite3.Row) -> Product:
    return Product(**{k: r[k] for k in r.keys() if k in Product.__dataclass_fields__})


def normalize_barcode(code: str) -> str | None:
    d = re.sub(r'\D', '', str(code or ''))
    k = d.lstrip('0')
    return k if 8 <= len(d) <= 14 and len(k) >= 6 else None


def by_barcode(code: str) -> Product | None:
    c, key = _conn(), normalize_barcode(code)
    if c is None or not key:
        return None
    with _lock:
        r = c.execute('SELECT * FROM products WHERE code=?', (key,)).fetchone()
    return _row(r) if r else None


def words(text: str) -> list[str]:
    t = re.sub(r"[’']", '', (text or '').lower())
    return [w for w in re.findall(r'[a-z0-9]+', t) if len(w) > 1 and not w.isdigit()]


def _stem(w: str) -> str:
    return w[:-1] if len(w) > 3 and w.endswith('s') and not w.endswith('ss') else w


def search(text: str, limit: int = 5, min_score: float = .55, mode: str = 'name') -> list[tuple[float, Product]]:
    """Products that `text` names.

    mode='name': short typed text or a receipt line ("doritos nacho cheese"); most query words must be in the product.
    mode='pack': OCR text from a package photo (long, noisy); most product-name words must be in the text.
    """
    c = _conn()
    q = [w for w in words(text) if w not in NOISE]
    if c is None or not q:
        return []
    qs = {_stem(w) for w in q}
    terms = sorted(set(q), key=len, reverse=True)[:24]
    match = ' OR '.join(f'"{w}"' + ('*' if len(w) >= 4 and mode == 'name' else '') for w in terms)
    with _lock:
        rows = c.execute('SELECT p.*, bm25(products_fts, 2.0, 1.0) AS rank FROM products_fts JOIN products p '
                         'ON p.rowid = products_fts.rowid WHERE products_fts MATCH ? ORDER BY rank LIMIT 300', (match,)).fetchall()
    out = []
    for r in rows:
        p = _row(r)
        name_w = {_stem(w) for w in words(p.name) if w not in NOISE}
        brand_w = {_stem(w) for w in words(p.brand) if w not in NOISE}
        if not name_w:
            continue
        prod_w = name_w | brand_w
        name_cov = len(name_w & qs) / len(name_w)
        brand_hit = 1.0 if brand_w and brand_w <= qs else (.5 if brand_w & qs else 0.0)
        if mode == 'pack':
            score = .65 * name_cov + .35 * brand_hit
        else:
            q_cov = len(qs & prod_w) / len(qs)  # how much of what was typed the product explains
            score = .5 * q_cov + .3 * name_cov + .2 * brand_hit
            if q_cov < .6:
                score *= .7
        score += min(.05, (p.scans or 0) / 20000)  # popular products break ties
        score += .03 * bool(p.serving_g) + .02 * bool(ENGLISH.search(p.countries or ''))  # usable serving size, English-speaking market
        if score >= min_score:
            out.append((score, p))
    out.sort(key=lambda t: (-t[0], -(t[1].scans or 0)))  # rank on the raw score so the small bonuses still count
    seen, uniq = set(), []
    for s, p in out:
        key = p.title.lower()
        if key not in seen:
            seen.add(key); uniq.append((round(min(s, 1.0), 3), p))
        if len(uniq) >= limit:
            break
    return uniq


PIECE = re.compile(r'^\s*(\d+(?:\.\d+)?)\s*(cookies?|biscuits?|crackers?|chips|crisps|pieces?|pcs?|bars?|candies|candy|'
                   r'gummies|pretzels|wafers?|cakes?|squares?|fingers?|sticks?|pods?|sweets?|nuggets?|slices?)\b', re.I)
PACK_UNITS = {'packet', 'bag', 'pack', 'package', 'can', 'bottle', 'container', 'box', 'carton', 'bar', 'tub', 'pouch'}


def _grams_in(text: str) -> float | None:
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*(g|ml|oz|fl oz)\b', text or '', re.I)
    if not m:
        return None
    v = float(m[1].replace(',', '.'))
    return v * 28.35 if m[2].lower() in ('oz', 'fl oz') else v


def grams_for(p: Product, qty: float, unit: str | None) -> tuple[float, str]:
    """Grams eaten for '2 oreos' (2 cookies), 'a bag of doritos' (the pack), '3 servings of ...' etc."""
    serving_g, serving_label = p.serving_grams()
    if unit in PACK_UNITS:
        pack = _grams_in(p.quantity)
        if pack and pack <= 2000:
            return qty * pack, f'{qty:g} × {p.quantity}'
        return qty * serving_g, f'{qty:g} × {serving_label}'
    if unit in ('g', 'ml'):
        return qty, f'{qty:g} {unit}'
    if unit == 'oz':
        return qty * 28.35, f'{qty:g} oz'
    piece = PIECE.match(p.serving or '')
    if unit is None and piece and p.serving_g and float(piece[1]) > 0:
        each = p.serving_g / float(piece[1])
        return qty * each, f'{qty:g} {piece[2].rstrip("s")}{"s" if qty != 1 else ""} (~{qty * each:.0f} g)'
    return qty * serving_g, (serving_label if qty == 1 else f'{qty:g} × {serving_label}')


def branded(phrase: str, pieces: bool = False) -> tuple[float, Product] | None:
    """A product only when the text names its brand ('doritos', 'kind bar'), so plain foods stay with USDA.

    pieces=True ("2 oreos"): prefer a close match whose serving is counted in pieces ("3 cookies (34 g)"),
    so the count means cookies rather than packs.
    """
    qw = {_stem(w) for w in words(phrase)}

    def named(p):
        bw = {_stem(w) for w in words(p.brand) if w not in NOISE}
        return bool(bw) and bw <= qw
    hits = [(s, p) for s, p in search(phrase, 6, min_score=.8) if named(p)]
    if not hits:
        return None
    if pieces:
        for s, p in hits:
            if s >= hits[0][0] - .12 and PIECE.match(p.serving or '') and p.serving_g:
                return s, p
    return hits[0]
