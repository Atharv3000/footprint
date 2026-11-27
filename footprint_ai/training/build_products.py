"""Build footprint_ai/data/products.sqlite (branded snacks and packaged foods) from Open Food Facts.

Source: Open Food Facts full CSV export (ODbL; https://world.openfoodfacts.org/data),
https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz (~1.5 GB).

Keeps products that have a barcode, a name and plausible per-100 g nutrition, then the most
scanned ones up to --max products. Writes a `products` table (barcode lookup) and an FTS5
index over brand + name (packaging text, receipts and typed snack names).

Usage:
  python -m footprint_ai.training.build_products <products.csv.gz> [--max 250000] [--stats]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import sqlite3
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'data' / 'products.sqlite'
NUM = ('energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'fiber_100g', 'sugars_100g', 'sodium_100g')
# Not food, or not something a person logs as a snack/meal item.
SKIP_CATEGORY = re.compile(r'en:(pet-food|dog-food|cat-food|cosmetics|food-additives|baby-milks|infant-formulas|'
                           r'dietary-supplements|non-food-products)', re.I)


def _f(v: str) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x else None  # NaN -> None


def clean_name(s: str) -> str:
    s = re.sub(r'\s+', ' ', (s or '').replace(' ', ' ')).strip(' -,;')
    return s[:120]


def rows(path: Path):
    csv.field_size_limit(1 << 30)
    with gzip.open(path, 'rt', encoding='utf-8', errors='replace', newline='') as f:
        r = csv.reader(f, delimiter='\t', quoting=csv.QUOTE_NONE)
        head = next(r)
        ix = {k: i for i, k in enumerate(head)}
        need = ['code', 'product_name', 'abbreviated_product_name', 'brands', 'quantity', 'serving_size',
                'serving_quantity', 'countries_tags', 'unique_scans_n', 'categories_tags', 'main_category', *NUM]
        miss = [k for k in need if k not in ix]
        if miss:
            sys.exit(f'Missing columns: {miss}')
        for rec in r:
            if len(rec) < len(head):
                continue
            yield {k: rec[ix[k]] for k in need}


def keep(d: dict) -> dict | None:
    code = d['code'].strip()
    if not code.isdigit() or not 8 <= len(code) <= 14:
        return None
    name = clean_name(d['product_name'] or d['abbreviated_product_name'])
    if len(name) < 2 or SKIP_CATEGORY.search(d['categories_tags'] or ''):
        return None
    n = {k: _f(d[k]) for k in NUM}
    kcal, p, c, fat = n['energy-kcal_100g'], n['proteins_100g'], n['carbohydrates_100g'], n['fat_100g']
    if None in (kcal, p, c, fat) or not 0 <= kcal <= 900 or min(p, c, fat) < 0 or p + c + fat > 101:
        return None
    # Energy must roughly agree with the macros (catches kJ typed as kcal and unit errors).
    est = 4 * p + 4 * c + 9 * fat
    if kcal > 20 and not .6 * est - 25 <= kcal <= 1.4 * est + 25:
        return None
    sq = _f(d['serving_quantity'])
    scans = int(_f(d['unique_scans_n']) or 0)
    brand = clean_name((d['brands'] or '').split(',')[0])
    countries = ','.join(t.removeprefix('en:') for t in (d['countries_tags'] or '').split(',')[:6] if t)
    return {'code': code.lstrip('0') or '0', 'name': name, 'brand': brand, 'quantity': clean_name(d['quantity'])[:40],
            'serving': clean_name(d['serving_size'])[:40], 'serving_g': sq if sq and 1 <= sq <= 2000 else None,
            'kcal': kcal, 'protein': p, 'carbs': c, 'fat': fat, 'fiber': n['fiber_100g'], 'sugar': n['sugars_100g'],
            'sodium': n['sodium_100g'], 'scans': scans, 'countries': countries,
            'category': (d['main_category'] or '').removeprefix('en:')[:60]}


def build(src: Path, limit: int, out: Path = OUT) -> dict:
    best: dict[str, dict] = {}
    seen = kept = 0
    for d in rows(src):
        seen += 1
        k = keep(d)
        if k:
            kept += 1
            old = best.get(k['code'])
            if not old or k['scans'] > old['scans']:
                best[k['code']] = k
        if seen % 500_000 == 0:
            print(f'{seen:,} rows, {kept:,} usable', flush=True)
    items = sorted(best.values(), key=lambda x: (-x['scans'], x['code']))[:limit]
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix('.tmp')
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    cols = list(items[0])
    db.execute(f"CREATE TABLE products ({', '.join(c + (' TEXT PRIMARY KEY' if c == 'code' else '') for c in cols)})")
    db.executemany(f"INSERT INTO products VALUES ({','.join('?' * len(cols))})", [tuple(i[c] for c in cols) for i in items])
    db.execute("CREATE VIRTUAL TABLE products_fts USING fts5(brand, name, content='products', content_rowid='rowid', "
               "tokenize='unicode61 remove_diacritics 2')")
    db.execute("INSERT INTO products_fts(rowid, brand, name) SELECT rowid, brand, name FROM products")
    db.execute("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)")
    stats = {'source': 'Open Food Facts (ODbL)', 'rows_read': seen, 'usable': len(best), 'kept': len(items),
             'min_scans_kept': items[-1]['scans'] if items else 0}
    db.execute("INSERT INTO meta VALUES ('stats', ?)", (json.dumps(stats),))
    db.commit()
    db.execute('VACUUM')
    db.close()
    tmp.replace(out)
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('src', type=Path)
    ap.add_argument('--max', type=int, default=250_000)
    ap.add_argument('--out', type=Path, default=OUT)
    a = ap.parse_args()
    print(json.dumps(build(a.src, a.max, a.out), indent=1))
    print(f'{a.out} {a.out.stat().st_size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
