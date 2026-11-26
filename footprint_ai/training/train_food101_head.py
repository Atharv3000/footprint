"""Train and evaluate the 101-dish food head on Food-101 (AIY embeddings from extract_food101.py).

Everything reported is fitted on Food-101's official TRAIN split (thresholds on a validation slice of it)
and scored on the official TEST split (25,250 photos the model never saw).

Reports:
  head top-1 / top-5                          the trained head alone
  aiy_alone_top1                              the Google AIY model alone (its label mapped to the dish)
  combined_top1                               what the app actually does (head + novelty check + AIY agreement)
  unseen_dishes_*                             dishes held out of the head entirely: how often the head wrongly
                                              claims them vs. how often AIY alone gets them right
Usage: python -m footprint_ai.training.train_food101_head <food101_feats.npz> [--write]
--write saves footprint_ai/models/food_heads.npz (keeping the existing food/non-food gate) and
training/food_vision_results.json.
"""
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from footprint_ai.food_model import labels  # noqa: E402

HERE = Path(__file__).resolve().parent
MODEL = HERE.parent / 'models' / 'food_heads.npz'
N_PROTO = 40  # stored reference photos per dish for the novelty check (float16; ~8 MB total)

# Which AIY labels count as the same dish (regex on the AIY label, case-insensitive). Default: the dish name.
FAMILY = {'baby_back_ribs': r'\bribs?\b', 'beef_tartare': r'tartare', 'beignets': r'beignet', 'churros': r'churro',
          'cup_cakes': r'cupcake', 'donuts': r'doughnut|donut', 'dumplings': r'dumpling|jiaozi|mandu', 'escargots': r'escargot',
          'french_fries': r'french fr|^chips$|^fries', 'gyoza': r'gyoza|potsticker|jiaozi', 'hamburger': r'hamburger|cheeseburger|^burger',
          'macarons': r'macaron', 'omelette': r'omelet', 'pho': r'^ph[oở]', 'spring_rolls': r'spring roll|egg roll', 'steak': r'steak(?! tartare)',
          'sushi': r'^sushi|maki|nigiri', 'ice_cream': r'ice cream|gelato', 'pizza': r'pizza', 'cheese_plate': r'cheese platter|cheese board',
          'peking_duck': r'peking duck|roast duck', 'tacos': r'\btaco', 'nachos': r'nacho', 'waffles': r'waffle', 'pancakes': r'pancake',
          'scallops': r'scallop', 'mussels': r'mussel', 'oysters': r'oyster', 'deviled_eggs': r'devil(l)?ed egg', 'chicken_wings': r'chicken wing|buffalo wing',
          'onion_rings': r'onion ring', 'samosa': r'samosa', 'falafel': r'falafel', 'ramen': r'ramen', 'takoyaki': r'takoyaki'}


def family_map(classes):
    L = labels()
    out = {}
    for c in classes:
        pat = FAMILY.get(c) or re.escape(c.replace('_', ' ').rstrip('s'))
        out[c] = np.array([i for i, l in enumerate(L) if i and re.search(pat, l, re.I)], dtype=np.int32)
    return out


def knn_sim(X, P):
    """Mean of the 5 highest cosine similarities to a class's stored reference photos."""
    S = X @ P.T
    k = min(5, P.shape[0])
    return np.sort(S, axis=1)[:, -k:].mean(1)


def decide(hp, classes, aiy_top, aiy_p, fam_of, sims, th):
    """Vectorised copy of footprint_ai.food_vision.classify's rule. Returns (pred, used_head)."""
    th_h, th_a, th_s = th
    j = hp.argmax(1)
    hc = np.array(classes)[j]
    pj = hp[np.arange(len(hp)), j]
    afam = np.array([fam_of.get(int(a), '') for a in aiy_top])
    use = ((pj >= th_h) & (sims >= th_s) & (aiy_p < th_a)) | (afam == hc)
    pred = np.where(use, hc, afam)  # when the head is not used the answer is AIY's label ('' = not one of these dishes)
    return pred, use


class Head:
    """Standardised logistic regression whose scaling is folded back into plain weights for the app.

    (Unit-norm embeddings have tiny per-feature values; without standardising, lbfgs meets its
    tolerance at step 0 and returns an untrained model.)
    """

    def __init__(self, X, y, C):
        self.mean, self.scale = X.mean(0), X.std(0) + 1e-6
        self.lr = LogisticRegression(C=C, max_iter=300).fit((X - self.mean) / self.scale, y)
        self.classes_ = self.lr.classes_
        self.coef_ = (self.lr.coef_ / self.scale).astype(np.float32)
        self.intercept_ = (self.lr.intercept_ - (self.lr.coef_ * self.mean / self.scale).sum(1)).astype(np.float32)

    def predict_proba(self, X):
        z = X @ self.coef_.T + self.intercept_  # exactly what footprint_ai/food_vision.py computes
        z -= z.max(1, keepdims=True)
        e = np.exp(z)
        return e / e.sum(1, keepdims=True)

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(1)]


def fit_head(X, y, C):
    return Head(X, y, C)


def protos_for(X, y, classes, rng):
    return {c: X[y == c][rng.permutation((y == c).sum())[:N_PROTO]].astype(np.float16).astype(np.float32) for c in classes}


def main(path, write=False):
    t0 = time.time()
    d = np.load(path)
    E = d['emb'].astype(np.float32)
    X = E / np.linalg.norm(E, axis=1, keepdims=True)
    y, split = d['label'], d['split']
    top_idx, top_p = d['top_idx'].astype(int), d['top_p'].astype(np.float32)
    # AIY's best real label (index 0 is "background")
    first = np.where(top_idx[:, 0] == 0, 1, 0)
    aiy_top = top_idx[np.arange(len(y)), first]
    aiy_p = top_p[np.arange(len(y)), first]
    classes = sorted(set(y))
    fams = family_map(classes)
    fam_of = {int(i): c for c, idx in fams.items() for i in idx}
    tr, te = split == 'train', split == 'test'
    rng = np.random.RandomState(0)
    val = tr & (rng.rand(len(y)) < .1)
    fit = tr & ~val
    print(f'{len(y)} photos, {len(classes)} dishes; train {fit.sum()} / validation {val.sum()} / test {te.sum()}')
    print('dishes AIY has no label for:', [c for c in classes if len(fams[c]) == 0])

    # 1) regularisation chosen on validation (or fixed with --C)
    best = None
    for C in ((FIXED_C,) if FIXED_C else (0.05, 0.2, 1.0)):
        h = fit_head(X[fit], y[fit], C)
        acc = float((h.predict(X[val]) == y[val]).mean())
        print(f'C={C}: validation top-1 {acc:.3f}  ({time.time() - t0:.0f}s)', flush=True)
        if best is None or acc > best[1]:
            best = (C, acc, h)
    C, _, h = best
    P = protos_for(X[fit], y[fit], classes, rng)
    out = {'data': 'Food-101 (101 dishes x 1,000 photos; official split)', 'n_train': int(tr.sum()), 'n_test': int(te.sum()),
           'classes': classes, 'C': C}

    def sims_for(Xs, hp, cls_list, Pd):
        j = hp.argmax(1)
        s = np.empty(len(Xs), np.float32)
        for k, c in enumerate(cls_list):
            m = j == k
            if m.any():
                s[m] = knn_sim(Xs[m], Pd[c])
        return s

    # 2) leave-dishes-out on the TRAIN split: tune thresholds so unseen dishes are rarely hijacked
    held_sets = [classes[k::4] for k in range(4)]  # 4 folds of ~25 dishes held out of the head entirely

    CACHE = {}

    def fold_data(hold, which, mask_name, mask_eval):
        """Head probabilities + similarities for one fold, computed once and reused for every threshold."""
        key = (tuple(hold), which, mask_name)
        if key not in CACHE:
            kc = [c for c in classes if c not in hold]
            if tuple(hold) not in LOO_HEADS:  # train each held-out-dishes model once
                mt = fit & np.isin(y, kc)
                LOO_HEADS[tuple(hold)] = fit_head(X[mt], y[mt], C)
                print(f'  held-out fold trained ({time.time() - t0:.0f}s)', flush=True)
            hk = LOO_HEADS[tuple(hold)]
            m = mask_eval & np.isin(y, kc if which == 'known' else hold)
            hp = hk.predict_proba(X[m])
            CACHE[key] = (m, hp, list(hk.classes_), sims_for(X[m], hp, list(hk.classes_), {c: P[c] for c in kc}))
        return CACHE[key]

    def lco(th, mask_eval, mask_name):
        known_acc, hij, oos_acc, aiy_oos = [], [], [], []
        for hold in held_sets:
            for which in ('known', 'held'):
                m, hp, cl_k, sims = fold_data(hold, which, mask_name, mask_eval)
                pred, use = decide(hp, cl_k, aiy_top[m], aiy_p[m], fam_of, sims, th)
                if which == 'known':
                    known_acc.append((pred == y[m]).mean())
                else:
                    hij.append(use.mean()); oos_acc.append((pred == y[m]).mean())
                    aiy_oos.append((np.array([fam_of.get(int(a), '') for a in aiy_top[m]]) == y[m]).mean())
        return [float(np.mean(v)) for v in (known_acc, hij, oos_acc, aiy_oos)]

    LOO_HEADS = {}
    # (head confidence, AIY confidence above which AIY wins, similarity to stored photos); 1.01 / 0.0 switch a check off
    grid = [(a, b, s) for a in (.2, .3, .4, .5, .6, .7) for b in (.3, .5, .7, 1.01) for s in (0.0, .55, .65, .75)]
    scored = []
    for th in grid:
        k, hj, o, _ = lco(th, val, 'val')
        scored.append((th, k, hj, o))
    # Equal weight on dishes the head knows and dishes it does not (photos of other food are common in real use).
    th, k_v, hj_v, o_v = max(scored, key=lambda r: r[1] + r[3])
    print(f'validation: known {k_v:.3f}, unseen {o_v:.3f}, head claims unseen {hj_v:.3f}', flush=True)
    print('chosen thresholds (head p, AIY p, similarity):', th, f'({time.time() - t0:.0f}s)')

    # 3) final scores on the TEST split
    hp = h.predict_proba(X[te])
    top5 = np.argsort(-hp, 1)[:, :5]
    cl = np.array(h.classes_)
    out['head_top1'] = round(float((cl[top5[:, 0]] == y[te]).mean()), 3)
    out['head_top5'] = round(float(np.mean([y[te][i] in cl[top5[i]] for i in range(te.sum())])), 3)
    pred, use = decide(hp, list(cl), aiy_top[te], aiy_p[te], fam_of, sims_for(X[te], hp, list(cl), P), th)
    out['combined_top1'] = round(float((pred == y[te]).mean()), 3)
    out['aiy_alone_top1'] = round(float((np.array([fam_of.get(int(a), '') for a in aiy_top[te]]) == y[te]).mean()), 3)
    out['per_dish_combined_top1'] = {c: round(float((pred[y[te] == c] == c).mean()), 3) for c in classes}
    k, hj, o, a = lco(th, te, 'test')
    out['unseen_dishes'] = {'head_wrongly_claims': round(hj, 3), 'top1_with_head': round(o, 3), 'top1_aiy_alone': round(a, 3),
                            'known_dishes_top1_in_these_folds': round(k, 3)}
    out['thresholds'] = list(th)
    if OLD_PATH:  # the previous 13-dish head, same rule, same test photos (AIY gets the same label-matching credit)
        o_ = np.load(OLD_PATH)
        ocls = [str(c) for c in o_['head_classes']]
        z = X[te] @ o_['head_w'].T + o_['head_b']; z -= z.max(1, keepdims=True); ohp = np.exp(z); ohp /= ohp.sum(1, keepdims=True)
        oP = {c: o_[f'proto_{c}'].astype(np.float32) for c in ocls}
        opred, _ = decide(ohp, ocls, aiy_top[te], aiy_p[te], fam_of, sims_for(X[te], ohp, ocls, oP),
                          (float(o_['th_head']), float(o_['th_aiy']), float(o_['th_sim'])))
        out['old_13_dish_system_top1_same_test'] = round(float((opred == y[te]).mean()), 3)
    # food/non-food gate (kept from before): does it still accept real food photos?
    old = np.load(MODEL)
    pf = 1 / (1 + np.exp(-(X[te] @ old['gate_w'] + float(old['gate_b']))))
    out['gate_accepts_food101_test'] = round(float((pf >= .5).mean()), 4)
    print(json.dumps({k: v for k, v in out.items() if k not in ('classes', 'per_dish_combined_top1')}, indent=1))
    worst = sorted(out['per_dish_combined_top1'].items(), key=lambda kv: kv[1])[:8]
    print('hardest dishes:', worst)

    if write:
        # final head on ALL training photos (validation slice included)
        hf = fit_head(X[tr], y[tr], C)
        Pf = protos_for(X[tr], y[tr], classes, np.random.RandomState(1))
        np.savez_compressed(MODEL, gate_w=old['gate_w'], gate_b=old['gate_b'], head_w=hf.coef_.astype(np.float32),
                            head_b=hf.intercept_.astype(np.float32), head_classes=np.array(hf.classes_),
                            th_head=np.float32(th[0]), th_aiy=np.float32(th[1]), th_sim=np.float32(th[2]),
                            **{f'proto_{c}': v.astype(np.float16) for c, v in Pf.items()},
                            **{f'family_{c}': fams[c] for c in classes})
        (HERE / 'food_vision_results.json').write_text(json.dumps(out, indent=1))
        print('wrote', MODEL, f'{MODEL.stat().st_size / 1e6:.1f} MB')


FIXED_C = None
OLD_PATH = None

if __name__ == '__main__':
    if '--C' in sys.argv:
        FIXED_C = float(sys.argv[sys.argv.index('--C') + 1])
    if '--old' in sys.argv:
        OLD_PATH = sys.argv[sys.argv.index('--old') + 1]
    main(sys.argv[1], '--write' in sys.argv)
