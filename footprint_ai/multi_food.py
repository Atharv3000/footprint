"""Several foods in one photo: find each one, separate it, and name it.

The photo is classified as a whole, through overlapping square windows at two sizes (half and
two-thirds of the short side), and through object proposals: things that stand out from the table
(plates, bowls, snacks) and colour regions inside one big plate. Each region is classified like a
whole photo (AIY food model + trained dish head + food/non-food gate). Every window votes for its top
3 dishes; a small trained model (models/multi_item.json, training/train_multi_item.py) then scores each
dish: "is this a separate item in the photo?" Dishes that pass become items, each with the region
where it was seen, so the app can show and edit them one by one.

When the whole photo is one dish, the regions agree with the whole-photo answer and the result is a
single item, the same as before.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from .food_model import model

HERE = Path(__file__).parent
SCALES = (.5, .66)
MAX_ITEMS = 6
TOPK = 3


def windows(w: int, h: int) -> list[tuple[int, int, int, int]]:
    """Square windows (left, top, right, bottom) covering the photo at each scale, half-overlapping."""
    out = []
    m = min(w, h)
    for f in SCALES:
        s = int(m * f)
        nx = max(2, math.ceil((w - s) / (s / 2)) + 1)
        ny = max(2, math.ceil((h - s) / (s / 2)) + 1)
        for j in range(ny):
            for i in range(nx):
                x = round(i * (w - s) / (nx - 1)) if nx > 1 else 0
                y = round(j * (h - s) / (ny - 1)) if ny > 1 else 0
                out.append((x, y, x + s, y + s))
    return out


def _iou(a, b) -> float:
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9)


def proposals(img: Image.Image, max_boxes: int = 8) -> list[tuple[int, int, int, int]]:
    """Likely food regions: things that stand out from the table, and colour regions inside a big plate.

    Background = the colour around the photo's border. Pixels far from it form blobs (plates, bowls,
    snacks). A blob that fills much of the photo (one plate holding several foods) is split further by
    colour (k-means in Lab), ignoring plate-white pixels.
    """
    import cv2
    W, H = img.size
    r = 160 / max(W, H)
    small = np.asarray(img.resize((max(8, round(W * r)), max(8, round(H * r))), Image.BILINEAR))
    lab = cv2.cvtColor(small, cv2.COLOR_RGB2LAB).astype(np.float32)
    h, w = lab.shape[:2]
    band = max(2, int(min(h, w) * .06))
    border = np.concatenate([lab[:band].reshape(-1, 3), lab[-band:].reshape(-1, 3),
                             lab[:, :band].reshape(-1, 3), lab[:, -band:].reshape(-1, 3)])
    bg = np.median(border, 0)
    spread = float(np.median(np.abs(border - bg), 0).mean())
    mask = (np.linalg.norm(lab - bg, axis=2) > 22 + 2.5 * spread).astype(np.uint8)
    k3 = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(cv2.morphologyEx(mask, cv2.MORPH_OPEN, k3), cv2.MORPH_CLOSE, k3, iterations=2)
    area = h * w
    boxes: list[tuple[float, tuple]] = []
    n, comp, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    for i in range(1, n):
        x, y, bw, bh, a = stats[i]
        if not .03 * area <= a <= .92 * area:
            continue
        boxes.append((a, (x, y, x + bw, y + bh)))
        if a < .3 * area:
            continue
        # big region: split by colour
        ys, xs = np.nonzero(comp == i)
        pts = lab[ys, xs]
        food = ~((pts[:, 0] > 215) & (np.abs(pts[:, 1] - 128) < 10) & (np.abs(pts[:, 2] - 128) < 10))
        ys, xs, pts = ys[food], xs[food], pts[food]
        if len(pts) < 200:
            continue
        for kk in (2, 3):
            crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
            _, lbl, _ = cv2.kmeans(np.ascontiguousarray(pts), kk, None, crit, 2, cv2.KMEANS_PP_CENTERS)
            lbl = lbl.ravel()
            for c in range(kk):
                m = np.zeros((h, w), np.uint8)
                m[ys[lbl == c], xs[lbl == c]] = 1
                m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k3)
                n2, _, st2, _ = cv2.connectedComponentsWithStats(m, 8)
                for j in range(1, n2):
                    x2, y2, w2, h2, a2 = st2[j]
                    if a2 >= .05 * area:
                        boxes.append((a2, (x2, y2, x2 + w2, y2 + h2)))
    out: list[tuple[int, int, int, int]] = []
    for _, (x0, y0, x1, y1) in sorted(boxes, key=lambda t: -t[0]):
        cx, cy = (x0 + x1) / 2 / r, (y0 + y1) / 2 / r
        side = min(max(max(x1 - x0, y1 - y0) / r * 1.1, .25 * min(W, H)), min(W, H))
        L = int(min(max(cx - side / 2, 0), W - side))
        T = int(min(max(cy - side / 2, 0), H - side))
        box = (L, T, L + int(side), T + int(side))
        if all(_iou(box, o) < .7 for o in out):
            out.append(box)
        if len(out) >= max_boxes:
            break
    return out


def run_windows(img: Image.Image):
    """(whole-photo (embedding, softmax), [(box, embedding, softmax, is_proposal)], photo size)."""
    img = ImageOps.exif_transpose(img).convert('RGB')
    if max(img.size) > 1024:
        r = 1024 / max(img.size)
        img = img.resize((round(img.width * r), round(img.height * r)), Image.BILINEAR)
    M = model()
    full = M.run_tta(img)
    out = []
    for box in windows(*img.size):
        e, p = M.run(img.crop(box), 1.0)
        out.append((box, e, p, False))
    for box in proposals(img):
        e, p = M.run(img.crop(box), 1.0)
        out.append((box, e, p, True))
    return full, out, img.size


def canonical(c: dict) -> str:
    """One key per dish, whichever model named it ('head:pizza' and AIY's 'Pizza' are the same dish)."""
    from .food_vision import heads
    key = c['key']
    if key.startswith('head:'):
        return key[5:]
    fam = heads()['fam_of'].get(int(key)) if key.isdigit() else None
    return fam or 'aiy:' + c['title'].lower()


FEATURES = ['top1_share', 'top3_share', 'max_conf', 'mean_top3', 'small_max', 'max_pfood', 'is_full_top', 'full_conf',
            'full_rank', 'full_top_conf', 'clutter', 'own_region', 'conf_x_share', 'prop_top1_max', 'prop_share', 'n_props',
            'bias']


def group_features(full: dict, regions: list[dict], size: tuple[int, int]) -> list[tuple[str, dict, list[float]]]:
    """Per candidate dish: (key, info, feature vector) from the whole-photo, window and proposal results."""
    full_cands = [(canonical(c), c['confidence']) for c in full['candidates']]
    full_c: dict[str, tuple[float, int]] = {}
    for r, (k, conf) in enumerate(full_cands):
        full_c.setdefault(k, (conf, r))
    full_top = full_cands[0][0] if full_cands else None
    full_top_conf = full_cands[0][1] if full_cands else 0.0
    props = [w for w in regions if w.get('proposal')]
    wins = [w for w in regions if not w.get('proposal')]
    n = max(len(wins), 1)
    small = min(w['box'][2] - w['box'][0] for w in wins) if wins else 0
    groups: dict[str, dict] = {}

    def group(k, c):
        return groups.setdefault(k, {'confs': [], 'top1': [], 'pfood': [], 'boxes': [], 'small': [], 'best': c,
                                     'wins': set(), 'prop': []})
    top1_of = []
    for wi, w in enumerate(wins):
        cands = w['res']['candidates'][:TOPK] if w['res']['p_food'] >= .3 else []
        top1_of.append(canonical(cands[0]) if cands else None)
        for r, c in enumerate(cands):
            g = group(canonical(c), c)
            if wi in g['wins']:
                continue
            g['wins'].add(wi)
            g['confs'].append(c['confidence']); g['pfood'].append(w['res']['p_food'])
            if r == 0:
                g['top1'].append(c['confidence']); g['boxes'].append(w['box'])
            if w['box'][2] - w['box'][0] == small:
                g['small'].append(c['confidence'])
            if c['confidence'] > g['best']['confidence']:
                g['best'] = c
    for w in props:
        cands = w['res']['candidates'] if w['res']['p_food'] >= .3 else []
        if not cands:
            continue
        c = cands[0]
        g = group(canonical(c), c)
        g['prop'].append(c['confidence']); g['pfood'].append(w['res']['p_food']); g['boxes'].append(w['box'])
        if not g['confs']:
            g['confs'].append(c['confidence'])
        if c['confidence'] > g['best']['confidence']:
            g['best'] = c
    clutter = len({k for k in top1_of if k})
    named = max(1, sum(1 for t in top1_of if t))
    out = []
    for k, g in groups.items():
        confs = sorted(g['confs'], reverse=True)
        boxes = g['boxes'] or [wins[i]['box'] for i in g['wins']]
        b = np.array(boxes)
        fc, fr = full_c.get(k, (0.0, 5))
        f = [len(g['top1']) / n, len(g['wins']) / n, confs[0], float(np.mean(confs[:3])), max(g['small'], default=0.0),
             max(g['pfood']), float(k == full_top), fc, fr / 5, full_top_conf, clutter / 5, len(g['top1']) / named,
             confs[0] * len(g['top1']) / n, max(g['prop'], default=0.0), len(g['prop']) / max(1, len(props)),
             len(props) / 8, 1.0]
        out.append((k, {**g, 'box': [int(b[:, 0].min()), int(b[:, 1].min()), int(b[:, 2].max()), int(b[:, 3].max())]}, f))
    out.sort(key=lambda t: -t[2][0] - t[2][2])
    return out


@lru_cache(maxsize=1)
def item_model() -> dict | None:
    p = HERE / 'models' / 'multi_item.json'
    return json.loads(p.read_text()) if p.exists() else None


def score_groups(groups: list, m: dict) -> list[float]:
    """P(separate item) per group: logistic regression, or a one-hidden-layer network when the model has one."""
    if not groups:
        return []
    mu, sd = np.array(m['mu']), np.array(m['sd'])
    Z = (np.array([f for _, _, f in groups], dtype=np.float64) - mu) / sd
    if 'W1' in m:
        h = np.maximum(0, Z @ np.array(m['W1']) + np.array(m['b1']))
        z = h @ np.array(m['W2']) + m['b2']
    else:
        z = Z @ np.array(m['w'])
    return [float(v) for v in 1 / (1 + np.exp(-z))]


def detect(img: Image.Image) -> dict:
    """{'full': whole-photo classification, 'items': [{key, candidate, box, p}], 'suggestions': [...], 'size': (w, h)}.

    `items` are confident separate foods; `suggestions` are less certain ones the app offers to add.
    """
    from .food_vision import classify_vec
    (fe, fp), regions, size = run_windows(img)
    full = classify_vec(fe, fp)
    res = [{'box': b, 'res': classify_vec(e, p), 'proposal': prop} for b, e, p, prop in regions]
    groups = group_features(full, res, size)
    m = item_model()
    items, suggestions = [], []
    if m and groups:
        ps = score_groups(groups, m)
        low = m.get('suggest_threshold', m['threshold'])
        for (k, g, _), p in sorted(zip(groups, ps), key=lambda t: -t[1]):
            entry = {'key': k, 'candidate': g['best'], 'box': g['box'], 'p': round(p, 3)}
            if p >= m['threshold'] and len(items) < MAX_ITEMS:
                items.append(entry)
            elif p >= low and len(suggestions) < 4:
                suggestions.append(entry)
    return {'full': full, 'items': items, 'suggestions': suggestions, 'size': size}
