"""Score receipt item extraction (OCR + footprint_ai.receipt.extract_items) on CORD v2 test receipts.

CORD v2 (Park et al. 2019, CC-BY-4.0; https://huggingface.co/datasets/naver-clova-ix/cord-v2): photos of
Indonesian shop and restaurant receipts, with each purchased item's name, count and price labelled.
Receipts 0-49 were used while writing the parser ("dev"); 50-99 are the held-out "test" set.

First cache the OCR once (slow), then score (fast):
  python -m footprint_ai.training.eval_receipts cache <cord test.parquet> <cord_ocr.json>
  python -m footprint_ai.training.eval_receipts score <cord_ocr.json> [--set dev|test|all] [--show 5]
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def norm(s: str) -> str:
    return re.sub(r'[^A-Z0-9]', '', (s or '').upper())


def gt_items(gt: dict) -> list[dict]:
    m = gt.get('menu') or []
    m = m if isinstance(m, list) else [m]
    out = []
    for x in m:
        if not isinstance(x, dict) or not x.get('nm'):
            continue
        nm = x['nm'] if isinstance(x['nm'], str) else ' '.join(x['nm'])
        cnt = x.get('cnt')
        cnt = cnt if isinstance(cnt, str) else (cnt[0] if isinstance(cnt, list) and cnt else '')
        c = re.search(r'\d+', cnt or '')
        out.append({'name': nm, 'qty': int(c[0]) if c and int(c[0]) < 100 else 1})
    return out


def cache(parquet: str, out: str) -> None:
    import io
    import pyarrow.parquet as pq
    from PIL import Image
    from footprint_ai import ocr
    rows = pq.read_table(parquet).to_pylist()
    res = []
    for i, r in enumerate(rows):
        lines = ocr.read(Image.open(io.BytesIO(r['image']['bytes'])))
        res.append({'i': i, 'gt': json.loads(r['ground_truth'])['gt_parse'], 'lines': [l.__dict__ for l in lines]})
    json.dump(res, open(out, 'w'))


def score(path: str, which: str, show: int) -> dict:
    from footprint_ai.ocr import Line, row_text, rows
    from footprint_ai.receipt import extract_items
    data = json.load(open(path))
    pick = {'dev': range(0, 50), 'test': range(50, 100), 'all': range(0, 100)}[which]
    tp = fp = fn = qty_ok = 0
    perfect = 0
    for d in (data[i] for i in pick):
        want = gt_items(d['gt'])
        rr = [row_text(r) for r in rows([Line(**l) for l in d['lines']])]
        got = extract_items(rr)
        used = set()
        hits = 0
        for w in want:
            best, bj = 0.0, None
            for j, g in enumerate(got):
                if j in used:
                    continue
                r = difflib.SequenceMatcher(None, norm(w['name']), norm(g['name'])).ratio()
                if r > best:
                    best, bj = r, j
            if bj is not None and best >= .7:
                used.add(bj); hits += 1
                qty_ok += got[bj]['qty'] == w['qty']
        tp += hits
        fn += len(want) - hits
        fp += len(got) - len(used)
        perfect += hits == len(want) and len(got) == len(want)
        if show and (hits < len(want) or len(got) > len(used)):
            show -= 1
            print(f"--- receipt {d['i']}\n rows: {rr}\n want: {[(w['name'], w['qty']) for w in want]}\n got:  {[(g['name'], g['qty'], g['price']) for g in got]}")
    p, r = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
    return {'set': which, 'receipts': len(pick), 'item_precision': round(p, 3), 'item_recall': round(r, 3),
            'item_f1': round(2 * p * r / max(p + r, 1e-9), 3), 'quantity_right_on_found_items': round(qty_ok / max(tp, 1), 3),
            'receipts_all_items_exact': round(perfect / len(pick), 3)}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['cache', 'score'])
    ap.add_argument('a')
    ap.add_argument('b', nargs='?')
    ap.add_argument('--set', default='dev')
    ap.add_argument('--show', type=int, default=0)
    x = ap.parse_args()
    if x.cmd == 'cache':
        cache(x.a, x.b)
    else:
        print(json.dumps(score(x.a, x.set, x.show), indent=1))
