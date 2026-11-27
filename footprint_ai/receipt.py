"""Receipt reader: photo of a grocery or restaurant receipt -> purchased food items with nutrition.

1. OCR (footprint_ai.ocr) gives printed rows, deskewed.
2. Item rows are the rows above the totals block that carry a price (or whose quantity/price
   sits on the next row, as many till printers do). Store header, dates, phone numbers, tax,
   payment and change rows are dropped.
3. Each item name is cleaned (item codes, quantities, prices), common till abbreviations are
   expanded ("ORG BNLS CHKN BRST" -> "organic boneless chicken breast") and matched to a
   branded product (Open Food Facts) or a USDA food.

The item extraction was developed on CORD receipts 0-49 and scored on 50-99 (training/eval_receipts.py).
"""
from __future__ import annotations

import re

from . import products
from .nutrition import estimate_item

PRICE = re.compile(r'(?<![\w.,])[-$€£₹]?\s?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{2}))?(?![\w%])')
TOTALS = re.compile(r'\b(sub[\s_-]*t\w{0,2}tal|sub\s*ttl|subttl|sttl|net\s*sales|total\s*sales|items?|pb[\s-]?1|grand\s*total|total|subtotal|tax|vat|gst|pb1|ppn|service|svc|cash|change|'
                    r'kembali(?:an)?|tunai|card|visa|master\s*card|mastercard|amex|debit|credit|payment|paid|balance|'
                    r'amount\s*due|tender|rounding|pembulatan|you saved|savings|discount|disc|voucher|items?\s*sold|'
                    r'qty\s*total|bayar|cc\.|tip|gratuity)\b', re.I)
HEADER = re.compile(r'\b(tel|phone|fax|www\.|http|\.com|receipt|invoice|order\s*#?|table|cashier|server|kasir|meja|'
                    r'npwp|store\s*#|st\s*#|op\s*#|te\s*#|tr\s*#|jl\.|jalan|street|avenue|ave\b|blvd|road|rd\.|'
                    r'thank|welcome|member|points|survey|return|guest|check\s*#|trans|terminal|ref\s*#?|approval|auth)\b', re.I)
HEADER_IDS = re.compile(r'\b(?:st|op|te|tr|store|check|ref|order|trans|term|reg)\s*#|www\.|\bjl\.|\brd\.', re.I)
DATE = re.compile(r'\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b|\b(am|pm)\b', re.I)
QTY_LEAD = re.compile(r'^\s*(\d{1,2})\s*(?:x|X|pcs?|@)?\s+(?=[A-Za-z])|^\s*(\d{1,2})\s*[xX]\s*(?=[A-Za-z])')
QTY_ANY = re.compile(r'(?:^|\s)(?:[xX]\s*(\d{1,2})|(\d{1,2})\s*[xX])(?=\s|$)|(?:^|\s)(?:qty|jml)\.?\s*(\d{1,2})\b', re.I)
CODE = re.compile(r'^\s*(?:\d{3,}[-\s]?\d*|[A-Z]?\d{4,})\s+')
ABBREV = {
    'org': 'organic', 'orgnc': 'organic', 'bnls': 'boneless', 'sknls': 'skinless', 'chkn': 'chicken', 'chk': 'chicken',
    'brst': 'breast', 'grnd': 'ground', 'bf': 'beef', 'trky': 'turkey', 'tky': 'turkey', 'whl': 'whole', 'mlk': 'milk',
    'yog': 'yogurt', 'ygrt': 'yogurt', 'yogrt': 'yogurt', 'chs': 'cheese', 'chse': 'cheese', 'shrd': 'shredded',
    'mozz': 'mozzarella', 'ched': 'cheddar', 'brd': 'bread', 'wht': 'white', 'whw': 'whole wheat', 'ww': 'whole wheat',
    'ban': 'banana', 'bana': 'banana', 'bnna': 'banana', 'appl': 'apple', 'aple': 'apple', 'strwb': 'strawberries',
    'strwbry': 'strawberries', 'blubry': 'blueberries', 'bluebry': 'blueberries', 'tom': 'tomato', 'tomat': 'tomato',
    'pot': 'potato', 'swt': 'sweet', 'pep': 'pepper', 'grn': 'green', 'onn': 'onion', 'oni': 'onion', 'let': 'lettuce',
    'rom': 'romaine', 'spin': 'spinach', 'brocc': 'broccoli', 'broc': 'broccoli', 'carr': 'carrots', 'crt': 'carrots',
    'avoc': 'avocado', 'avo': 'avocado', 'oj': 'orange juice', 'juc': 'juice', 'jce': 'juice', 'pb': 'peanut butter',
    'pnt': 'peanut', 'btr': 'butter', 'bttr': 'butter', 'marg': 'margarine', 'crm': 'cream', 'sr': 'sour',
    'ckie': 'cookies', 'cky': 'cookies', 'ckies': 'cookies', 'crkr': 'crackers', 'crk': 'crackers', 'cer': 'cereal',
    'grnla': 'granola', 'ot': 'oat', 'oatml': 'oatmeal', 'pst': 'pasta', 'spag': 'spaghetti', 'sce': 'sauce', 'sc': 'sauce',
    'frz': 'frozen', 'froz': 'frozen', 'veg': 'vegetables', 'vgtbl': 'vegetables', 'pz': 'pizza', 'pzza': 'pizza',
    'ic': 'ice cream', 'icecrm': 'ice cream', 'chc': 'chocolate', 'choc': 'chocolate', 'van': 'vanilla', 'vnla': 'vanilla',
    'stwbry': 'strawberry', 'sftdrk': 'soft drink', 'sda': 'soda', 'wtr': 'water', 'spkl': 'sparkling', 'cof': 'coffee',
    'cff': 'coffee', 'tea': 'tea', 'egg': 'eggs', 'lg': 'large', 'med': 'medium', 'sm': 'small', 'xl': 'extra large',
    'dz': 'dozen', 'doz': 'dozen', 'pk': 'pack', 'ct': 'count', 'gal': 'gallon', 'hlf': 'half', 'hf': 'half',
    'rf': 'reduced fat', 'lf': 'low fat', 'ff': 'fat free', 'nf': 'nonfat', 'sw': 'sweet', 'unsw': 'unsweetened',
    'slcd': 'sliced', 'sl': 'sliced', 'shrmp': 'shrimp', 'slmn': 'salmon', 'tlpa': 'tilapia', 'psta': 'pasta',
    'rce': 'rice', 'brn': 'brown', 'bns': 'beans', 'blk': 'black', 'chkpea': 'chickpeas', 'hmmus': 'hummus',
    'tort': 'tortillas', 'tortla': 'tortillas', 'bgl': 'bagels', 'bgls': 'bagels', 'mfn': 'muffins', 'dnut': 'donut',
    'gv': 'great value', 'ks': 'kirkland signature', 'tj': "trader joe's", 'mm': "member's mark",
}
NON_FOOD = re.compile(r'\b(bag|bags|shopping|plastic|battery|batteries|detergent|soap|shampoo|tissue|toilet|paper towel|'
                      r'napkins?|foil|wrap|trash|bleach|cleaners?|toothpaste|razors?|lotion|deposit|crv|bottle dep|gift card|paper towels?|towels?|'
                      r'blus|shirt|kaos|celana|sock|lighter|cigarette|rokok|parking|delivery fee|service charge)\b', re.I)


def _price_val(m: re.Match) -> float:
    whole = re.sub(r'[.,]', '', m[1])
    return float(whole + ('.' + m[2] if m[2] else ''))


def prices(text: str) -> list[float]:
    out = []
    for m in PRICE.finditer(text):
        raw = m.group(0)
        if not (m[2] or re.search(r'[.,]\d{3}', m[1]) or len(m[1]) >= 3 or raw.strip().startswith(('$', '€', '£', '₹'))):
            continue  # a bare "2" or "12" is a quantity or code, not a price
        out.append(_price_val(m))
    return out


def clean_name(text: str) -> str:
    s = DATE.sub(' ', text)
    s = CODE.sub('', s)
    s = re.sub(r'@\s*[\d.,]+', ' ', s)
    s = PRICE.sub(' ', s)
    s = re.sub(r'\b\d+\s*%', ' ', s)
    s = QTY_LEAD.sub('', s)
    s = re.sub(r'(?:^|\s)[xX](?=\s|$)', ' ', s)
    s = re.sub(r'\s+[A-Z]$', '', s.strip())  # trailing tax flag: "MILK 3.49 F"
    s = re.sub(r'^[\W_]+|[\W_]+$', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def quantity(text: str) -> int | None:
    m = QTY_LEAD.match(text)
    if m:
        return int(m[1] or m[2])
    m = QTY_ANY.search(text)
    if m:
        v = int(next(g for g in m.groups() if g))
        return v if 0 < v <= 50 else None
    return None


def expand(name: str) -> str:
    out = []
    for w in re.findall(r"[A-Za-z']+|\d+(?:\.\d+)?%?", name):
        lw = w.lower()
        out.append(ABBREV.get(lw, lw))
    return ' '.join(out)


def extract_items(rows: list[str]) -> list[dict]:
    """Item rows (name, quantity, price) from the printed rows of a receipt."""
    end = len(rows)
    for i, r in enumerate(rows):
        if TOTALS.search(r) and i > 0:
            end = i
            break
    body = [r for r in rows[:end] if not (HEADER.search(r) or HEADER_IDS.search(r) or (DATE.search(r) and len(re.findall(r'[A-Za-z]', r)) < 12))]
    info = []
    for r in body:
        name = clean_name(r)
        info.append({'raw': r, 'name': name, 'letters': len(re.findall(r'[A-Za-z]', name)), 'prices': prices(r), 'qty': quantity(r)})
    any_price = any(x['prices'] and x['letters'] >= 2 for x in info)
    items: list[dict] = []
    pending: dict | None = None  # name row waiting for a quantity/price-only row below it

    def new(x):
        it = {'raw': x['raw'], 'name': x['name'], 'qty': x['qty'] or 1, 'price': x['prices'][-1] if x['prices'] else None}
        pr = x['prices']
        if len(pr) >= 2 and pr[0] > 0 and x['qty'] is None:
            ratio = pr[-1] / pr[0]
            if abs(ratio - round(ratio)) < .02 and 1 < round(ratio) <= 50:
                it['qty'] = int(round(ratio))  # "2 @ 1.50  3.00"
        return it

    for i, x in enumerate(info):
        nxt = info[i + 1] if i + 1 < len(info) else None
        if x['letters'] < 2:
            if pending and (x['prices'] or x['qty']):
                if x['prices']:
                    pending['price'] = x['prices'][-1]
                if x['qty']:
                    pending['qty'] = x['qty']
                items.append(pending)
            pending = None
            continue
        if x['prices'] or not any_price:
            items.append(new(x)); pending = None
            continue
        # A name row without a price.
        if nxt is not None and nxt['letters'] < 2 and (nxt['prices'] or nxt['qty']):
            pending = new(x)                       # its quantity/price is on the next row
        elif items and items[-1]['raw'] == info[i - 1]['raw'] and len(x['name'].split()) <= 3:
            items[-1]['name'] += ' ' + x['name']   # long item name wrapped onto a second row
            items[-1]['raw'] += ' / ' + x['raw']
        pending = pending if pending and pending['raw'] == x['raw'] else None
    if not any_price and len(items) > 2:
        items = items[1:]  # first row of a price-less list is usually the store name
    return [it for it in items if len(it['name']) >= 2]


def match_food(name: str) -> dict | None:
    if NON_FOOD.search(name):
        return None
    hits = products.search(name, 1, min_score=.8)
    if hits:
        score, p = hits[0]
        return p.as_item(confidence=score * .9, how='product name')
    q = expand(name)
    r = estimate_item(q)
    if r['matched'] and r['confidence'] >= .6:
        return {**r, 'source': 'usda', 'expanded': q}
    hits = products.search(q, 1, min_score=.8)
    if hits:
        score, p = hits[0]
        return p.as_item(confidence=score * .85, how='product name (expanded)')
    return None


def read_receipt_rows(rows: list[str]) -> dict:
    items = extract_items(rows)
    if not items:
        raise ValueError('No items were found on this receipt. Flatten it, fill the frame and avoid glare.')
    out, total = [], 0.0
    for k, it in enumerate(items):
        food = match_food(it['name'])
        entry = {'id': f'rcpt_{k}', 'line': it['raw'], 'name': it['name'], 'quantity': it['qty'], 'price': it['price'],
                 'isFood': food is not None}
        if food:
            entry.update(food=food['name'], portion=food['portion'], grams=food['grams'], calories=food['calories'],
                         proteinG=food['proteinG'], carbsG=food['carbsG'], fatG=food['fatG'], confidence=food['confidence'],
                         source=food.get('source', 'usda'), usdaDescription=food.get('usdaDescription'), barcode=food.get('barcode'))
        out.append(entry)
        total += it['price'] or 0
    foods = [e for e in out if e['isFood']]
    return {'items': out, 'foodItems': len(foods), 'otherItems': len(out) - len(foods),
            'itemsTotal': round(total, 2) if total else None,
            'note': 'Nutrition is per typical serving of each item (not the whole package). Tick what you ate.'}
