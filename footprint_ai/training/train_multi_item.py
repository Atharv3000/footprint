"""Train and test the multi-item food detector (footprint_ai/multi_food.py) on composed table scenes.

Scenes are built from Food-101 test photos (ethz/food101 "validation" parquet files; these photos were
never used to train the dish head):
  - plates:  2-4 different dishes, each on its own round plate, on a table background
  - shared:  2-3 different dishes filling sectors of one big plate (rice + curry + salad style)
  - single:  an unmodified Food-101 photo (must stay one item)
File 0 gives the training scenes; files 1 and 2 give the test scenes (different photos).

  python -m footprint_ai.training.train_multi_item extract <val0.parquet> <train.pkl> --n 1500 --seed 1
  python -m footprint_ai.training.train_multi_item extract <val1.parquet> <test.pkl> --n 700 --seed 2
  python -m footprint_ai.training.train_multi_item train <train.pkl> <test.pkl> [--write]
"""
from __future__ import annotations

import argparse
import io
import json
import math
import pickle
import random
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
HERE = Path(__file__).resolve().parent
CLASSES = json.load(open(HERE / 'food_vision_results.json'))['classes']


def background(w: int, h: int, rng: random.Random) -> Image.Image:
    base = np.array([rng.randint(60, 235) for _ in range(3)], dtype=np.float32)
    img = np.ones((h, w, 3), np.float32) * base
    if rng.random() < .5:  # wood-like stripes
        y = np.arange(h)[:, None, None]
        img += 18 * np.sin(y / rng.uniform(6, 30) + rng.uniform(0, 6))
    img += np.random.default_rng(rng.randint(0, 1 << 30)).normal(0, rng.uniform(2, 10), img.shape)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def circle_mask(d: int) -> Image.Image:
    m = Image.new('L', (d, d), 0)
    ImageDraw.Draw(m).ellipse((0, 0, d - 1, d - 1), fill=255)
    return m.filter(ImageFilter.GaussianBlur(1))


def center_square(img: Image.Image, frac: float = 1.0) -> Image.Image:
    s = int(min(img.size) * frac)
    l, t = (img.width - s) // 2, (img.height - s) // 2
    return img.crop((l, t, l + s, t + s))


def plates_scene(foods: list[Image.Image], rng: random.Random) -> Image.Image:
    W, H = rng.choice([(640, 480), (600, 600), (480, 640), (720, 540)])
    bg = background(W, H, rng)
    k = len(foods)
    placed = []
    for f in foods:
        for _ in range(200):
            d = int(min(W, H) * rng.uniform(.36, .52 if k <= 3 else .44))
            x, y = rng.randint(0, W - d), rng.randint(0, H - d)
            if all(math.hypot(x + d / 2 - px, y + d / 2 - py) > (d + pd) / 2 * .92 for px, py, pd in placed):
                break
        placed.append((x + d / 2, y + d / 2, d))
        if rng.random() < .7:  # white plate rim
            rim = int(d * 1.12)
            ImageDraw.Draw(bg).ellipse((x - (rim - d) // 2, y - (rim - d) // 2, x - (rim - d) // 2 + rim, y - (rim - d) // 2 + rim),
                                       fill=tuple(rng.randint(225, 255) for _ in range(3)))
        food = center_square(f, rng.uniform(.75, 1)).resize((d, d), Image.BILINEAR)
        bg.paste(food, (x, y), circle_mask(d))
    return bg


def shared_scene(foods: list[Image.Image], rng: random.Random) -> Image.Image:
    W, H = rng.choice([(640, 480), (600, 600), (480, 640)])
    bg = background(W, H, rng)
    d = int(min(W, H) * rng.uniform(.82, .95))
    x, y = (W - d) // 2 + rng.randint(-20, 20), (H - d) // 2 + rng.randint(-20, 20)
    x, y = max(0, min(W - d, x)), max(0, min(H - d, y))
    plate = Image.new('RGB', (d, d), (245, 245, 245))
    k = len(foods)
    start = rng.uniform(0, 360)
    for i, f in enumerate(foods):
        m = Image.new('L', (d, d), 0)
        ImageDraw.Draw(m).pieslice((d * .04, d * .04, d * .96, d * .96), start + i * 360 / k, start + (i + 1) * 360 / k - 2, fill=255)
        plate.paste(center_square(f, rng.uniform(.7, 1)).resize((d, d), Image.BILINEAR), (0, 0), m)
    bg.paste(plate, (x, y), circle_mask(d))
    return bg


def make_scene(images: list[tuple[Image.Image, int]], rng: random.Random) -> tuple[Image.Image, list[str], str]:
    r = rng.random()
    if r < .35:
        img, lab = images[0]
        return img, [CLASSES[lab]], 'single'
    if r < .75:
        k = rng.choice([2, 2, 3, 3, 4])
        return plates_scene([i for i, _ in images[:k]], rng), [CLASSES[l] for _, l in images[:k]], 'plates'
    k = rng.choice([2, 2, 3])
    return shared_scene([i for i, _ in images[:k]], rng), [CLASSES[l] for _, l in images[:k]], 'shared'


def _work(job):
    from footprint_ai.multi_food import run_windows
    seed, blobs = job
    rng = random.Random(seed)
    images = [(Image.open(io.BytesIO(b)).convert('RGB'), lab) for b, lab in blobs]
    img, truth, kind = make_scene(images, rng)
    (fe, fp), wins, size = run_windows(img)

    def pack(e, p):
        top = np.argsort(-p)[:20]
        return e.astype(np.float16), top.astype(np.int16), p[top].astype(np.float16)
    return {'seed': seed, 'truth': truth, 'kind': kind, 'size': size, 'full': pack(fe, fp),
            'wins': [(b, *pack(e, p), prop) for b, e, p, prop in wins]}


def extract(parquet: str, out: str, n: int, seed: int, workers: int = 4) -> None:
    import pyarrow.parquet as pq
    t = pq.read_table(parquet).to_pylist()
    rng = random.Random(seed)
    jobs = []
    for i in range(n):
        picks, used = [], set()
        while len(picks) < 4:
            r = t[rng.randrange(len(t))]
            if r['label'] not in used:
                used.add(r['label']); picks.append((r['image']['bytes'], r['label']))
        jobs.append((seed * 1_000_000 + i, picks))
    res = []
    with Pool(workers) as pool:
        for k, r in enumerate(pool.imap(_work, jobs, chunksize=4)):
            res.append(r)
            if (k + 1) % 100 == 0:
                print(k + 1, 'scenes', flush=True)
    pickle.dump(res, open(out, 'wb'))


def unpack(e, top, vals) -> tuple[np.ndarray, np.ndarray]:
    p = np.zeros(2024, np.float32)
    p[top.astype(int)] = vals.astype(np.float32)
    return e.astype(np.float32), p


def norm(s: str) -> str:
    return ''.join(ch for ch in s.lower() if ch.isalnum())


def scene_groups(s: dict):
    from footprint_ai.food_vision import classify_vec
    from footprint_ai.multi_food import group_features
    full = classify_vec(*unpack(*s['full']))
    wres = [{'box': w[0], 'res': classify_vec(*unpack(*w[1:4])), 'proposal': bool(w[4]) if len(w) > 4 else False} for w in s['wins']]
    return full, group_features(full, wres, s['size'])


def is_true(key: str, truth: list[str]) -> bool:
    if key.startswith('aiy:'):
        return norm(key[4:]) in {norm(t) for t in truth}
    return key in truth


def build(scenes: list[dict]):
    X, y, idx, meta = [], [], [], []
    for si, s in enumerate(scenes):
        full, groups = scene_groups(s)
        meta.append({'full': full, 'groups': groups})
        for k, g, f in groups:
            X.append(f); y.append(float(is_true(k, s['truth']))); idx.append(si)
    return np.array(X, np.float64), np.array(y), np.array(idx), meta


def fit_mlp(X, y, hidden=24, l2=1e-3, epochs=60, lr=3e-3, seed=0):
    """One hidden ReLU layer, Adam, class-balanced log loss. Small enough to run in numpy at serve time."""
    rng = np.random.default_rng(seed)
    mu, sd = X.mean(0), X.std(0) + 1e-9
    mu[-1], sd[-1] = 0, 1
    Z = (X - mu) / sd
    d = Z.shape[1]
    P = {'W1': rng.normal(0, np.sqrt(2 / d), (d, hidden)), 'b1': np.zeros(hidden), 'W2': rng.normal(0, np.sqrt(1 / hidden), hidden), 'b2': np.zeros(1)}
    M = {k: np.zeros_like(v) for k, v in P.items()}
    V = {k: np.zeros_like(v) for k, v in P.items()}
    pos_w = (len(y) - y.sum()) / max(y.sum(), 1) ** 1 * .5  # partly re-balance the rare positives
    sw = np.where(y > 0, pos_w, 1.0)
    t = 0
    for ep in range(epochs):
        order = rng.permutation(len(y))
        for i in range(0, len(y), 256):
            b = order[i:i + 256]
            h_pre = Z[b] @ P['W1'] + P['b1']
            h = np.maximum(0, h_pre)
            p = 1 / (1 + np.exp(-(h @ P['W2'] + P['b2'][0])))
            g = (p - y[b]) * sw[b] / sw[b].sum()
            G = {'W2': h.T @ g + l2 * P['W2'], 'b2': np.array([g.sum()])}
            gh = np.outer(g, P['W2']) * (h_pre > 0)
            G['W1'] = Z[b].T @ gh + l2 * P['W1']
            G['b1'] = gh.sum(0)
            t += 1
            for k in P:
                M[k] = .9 * M[k] + .1 * G[k]
                V[k] = .999 * V[k] + .001 * G[k] ** 2
                P[k] -= lr * (M[k] / (1 - .9 ** t)) / (np.sqrt(V[k] / (1 - .999 ** t)) + 1e-8)
    return {'W1': P['W1'].tolist(), 'b1': P['b1'].tolist(), 'W2': P['W2'].tolist(), 'b2': float(P['b2'][0]),
            'mu': mu.tolist(), 'sd': sd.tolist()}


def fit_logistic(X, y, l2=1e-2, iters=3000, lr=.5):
    mu, sd = X.mean(0), X.std(0) + 1e-9
    mu[-1], sd[-1] = 0, 1  # bias column
    Z = (X - mu) / sd
    w = np.zeros(Z.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Z @ w))
        grad = Z.T @ (p - y) / len(y) + l2 * np.r_[w[:-1], 0]
        w -= lr * grad
    return w, mu, sd


def evaluate(scenes, meta, model, threshold):
    from footprint_ai.multi_food import score_groups
    tp = fp = fn = exact = 0
    by_kind: dict[str, list] = {}
    base_tp = base_fp = base_fn = base_exact = 0
    for s, m in zip(scenes, meta):
        truth = s['truth']
        groups = m['groups']
        ps = score_groups(groups, model) if groups else []
        chosen = [k for (k, _, _), p in sorted(zip(groups, ps), key=lambda t: -t[1]) if p >= threshold][:6]
        if not chosen and m['full']['candidates']:
            from footprint_ai.multi_food import canonical
            chosen = [canonical(m['full']['candidates'][0])]
        hits = sum(any(is_true(k, [t]) for k in chosen) for t in truth)
        wrong = sum(not is_true(k, truth) for k in chosen)
        tp += hits; fn += len(truth) - hits; fp += wrong
        ex = hits == len(truth) and wrong == 0 and len(chosen) == len(truth)
        exact += ex
        # baseline: today's single answer (whole-photo top candidate)
        from footprint_ai.multi_food import canonical
        b = [canonical(m['full']['candidates'][0])] if m['full']['candidates'] else []
        bh = sum(any(is_true(k, [t]) for k in b) for t in truth)
        base_tp += bh; base_fn += len(truth) - bh; base_fp += sum(not is_true(k, truth) for k in b)
        base_exact += bh == len(truth) and len(b) == len(truth)
        k = by_kind.setdefault(s['kind'], [0, 0, 0, 0])
        k[0] += 1; k[1] += ex; k[2] += len(chosen) == len(truth); k[3] += hits / len(truth)
    P, R = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
    bP, bR = base_tp / max(base_tp + base_fp, 1), base_tp / max(base_tp + base_fn, 1)
    return {'scenes': len(scenes), 'item_precision': round(P, 3), 'item_recall': round(R, 3), 'item_f1': round(2 * P * R / max(P + R, 1e-9), 3),
            'exact_scene': round(exact / len(scenes), 3),
            'by_kind': {k: {'scenes': v[0], 'exact': round(v[1] / v[0], 3), 'right_item_count': round(v[2] / v[0], 3),
                            'dish_recall': round(v[3] / v[0], 3)} for k, v in sorted(by_kind.items())},
            'baseline_single_answer': {'item_precision': round(bP, 3), 'item_recall': round(bR, 3),
                                       'item_f1': round(2 * bP * bR / max(bP + bR, 1e-9), 3), 'exact_scene': round(base_exact / len(scenes), 3)}}


def train(train_pkl: str, test_pkl: str, write: bool, kind: str = 'mlp') -> None:
    from footprint_ai.multi_food import FEATURES
    tr, te = pickle.load(open(train_pkl, 'rb')), pickle.load(open(test_pkl, 'rb'))
    X, y, idx, meta_tr = build(tr)
    print('groups', len(y), 'positives', int(y.sum()))
    if kind == 'mlp':
        model = {'features': FEATURES, 'kind': 'mlp', **fit_mlp(X, y)}
    else:
        w, mu, sd = fit_logistic(X, y)
        model = {'features': FEATURES, 'kind': 'logistic', 'w': w.tolist(), 'mu': mu.tolist(), 'sd': sd.tolist()}
    # threshold: best item F1 on the training scenes while single-dish photos still stay one item >= 88% of the time
    def pick(t):
        e = evaluate(tr, meta_tr, model, t)
        return (e['item_f1'] if e['by_kind']['single']['right_item_count'] >= .88 else 0, t)
    best = max((pick(t) for t in np.arange(.2, .99, .02)), key=lambda x: x[0])
    model['threshold'] = round(float(best[1]), 2)
    _, _, _, meta_te = build(te)
    res = {'train': evaluate(tr, meta_tr, model, model['threshold']), 'test': evaluate(te, meta_te, model, model['threshold']),
           'threshold': model['threshold'], 'model': model['kind']}
    print(json.dumps(res, indent=1))
    if write:
        (HERE.parent / 'models' / 'multi_item.json').write_text(json.dumps(model))
        (HERE / 'multi_item_results.json').write_text(json.dumps(res, indent=1))
        print('wrote models/multi_item.json')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['extract', 'train'])
    ap.add_argument('a')
    ap.add_argument('b')
    ap.add_argument('--n', type=int, default=1000)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--model', default='mlp', choices=['mlp', 'logistic'])
    x = ap.parse_args()
    if x.cmd == 'extract':
        extract(x.a, x.b, x.n, x.seed, x.workers)
    else:
        train(x.a, x.b, x.write, x.model)
