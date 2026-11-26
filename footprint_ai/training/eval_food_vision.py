"""Reproduce the food-vision evaluation from cached features (see extract_food_feats.py).

All numbers come from models fitted on the TRAIN split only and scored on the TEST split.
Writes footprint_ai/training/food_vision_results.json.
"""
import itertools, json, os, re, sys
import numpy as np
sys.path.insert(0, '.')
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from footprint_ai.food_model import labels

L = labels()
d = np.load(os.environ.get('FOOD_FEATS', 'data_cache/food_feats.npz'))
E, P, lab, split, src = d['emb'], d['prob'], d['label'], d['split'], d['source']
X = E / np.linalg.norm(E, axis=1, keepdims=True)
tr, te = split == 'train', split == 'test'
food = lab != '__nonfood__'
cls = sorted(set(lab) - {'__nonfood__', '__food_unlabelled__'})
out = {'n_train': int(tr.sum()), 'n_test': int(te.sum()), 'classes': cls}
# gate
g = LogisticRegression(C=1.0, max_iter=3000, class_weight='balanced').fit(X[tr], food[tr])
pf = g.predict_proba(X[te])[:, 1]
m = src != 'exercise_video'
g2 = LogisticRegression(C=1.0, max_iter=3000, class_weight='balanced').fit(X[m & tr], food[m & tr])
ev = src == 'exercise_video'
out['gate'] = {'auc': round(float(roc_auc_score(food[te], pf)), 4), 'food_recall@0.5': round(float((pf[food[te]] >= .5).mean()), 4),
               'nonfood_rejected@0.5': round(float((pf[~food[te]] < .5).mean()), 4),
               'gym_frames_rejected_when_never_trained_on_them': round(float((g2.predict_proba(X[ev])[:, 1] < .5).mean()), 4)}
# zero-shot AIY families
fam = {'pizza': r'pizza$|^Neapolitan pizza|^Pepperoni$', 'steak': r'steak(?! tartare)|Steak Diane|Roast beef|Churrasco', 'sushi': r'^Sushi$|Onigiri|Kimbap|Gimbap',
       'apple_pie': r'^Apple pie', 'baklava': r'Baklava', 'beef_tartare': r'tartare', 'beignets': r'Beignet', 'bibimbap': r'Bibimbap',
       'bread_pudding': r'Bread pudding', 'breakfast_burrito': r'burrito'}
famidx = {c: {i for i, l in enumerate(L) if re.search(p, l, re.I)} for c, p in fam.items()}
lf = lambda i: next((c for c, s in famidx.items() if i in s), None)
zs = {}
for c in cls:
    mm = te & (lab == c)
    zs[c] = round(float(np.mean([lf(a.argmax()) == c for a in P[mm]])), 3)
out['aiy_zero_shot_top1'] = zs
# head
mtr, mte = tr & np.isin(lab, cls), te & np.isin(lab, cls)
h = LogisticRegression(C=4.0, max_iter=4000).fit(X[mtr], lab[mtr])
out['head_top1'] = round(float((h.predict(X[mte]) == lab[mte]).mean()), 3)
out['head_top3'] = round(float(np.mean([y in h.classes_[np.argsort(-p)[:3]] for p, y in zip(h.predict_proba(X[mte]), lab[mte])])), 3)
out['head_per_class'] = {c: round(float((h.predict(X[mte & (lab == c)]) == c).mean()), 3) for c in cls}
# combined with novelty check, leave-classes-out
def knn(x, R): return float(np.sort(R @ x)[-5:].mean())
def combine(h, refs, Xs, Ps, th):
    th_h, th_a, th_s = th; res = []
    for x, a in zip(Xs, Ps):
        p = h.predict_proba(x[None])[0]; j = p.argmax(); hc = h.classes_[j]
        i = a.argmax(); la = lf(i)
        res.append(hc if ((p[j] >= th_h and knn(x, refs[hc]) >= th_s and a[i] < th_a) or la == hc) else (la or L[i]))
    return np.array(res)
held = ['sushi', 'bibimbap', 'baklava', 'beignets', 'beef_tartare', 'breakfast_burrito']
th = tuple(float(v) for v in os.environ.get('COMBINE_TH', '0.5,0.5,0.75').split(','))
ind, oos, hij, aiy_oos = [], [], [], []
for k in range(3):
    hold = held[k::3]; tc = [c for c in cls if c not in hold]
    mt = tr & np.isin(lab, tc); hk = LogisticRegression(C=4.0, max_iter=3000).fit(X[mt], lab[mt])
    refs = {c: X[mt & (lab == c)] for c in tc}
    mi, mo = te & np.isin(lab, tc), te & np.isin(lab, hold)
    ind.append((combine(hk, refs, X[mi], P[mi], th) == lab[mi]).mean())
    po = combine(hk, refs, X[mo], P[mo], th); oos.append((po == lab[mo]).mean()); hij.append(np.isin(po, tc).mean())
    aiy_oos.append(np.mean([lf(a.argmax()) == y for a, y in zip(P[mo], lab[mo])]))
out['combined'] = {'thresholds': th, 'known_classes_top1': round(float(np.mean(ind)), 3),
                   'unseen_dishes_top1': round(float(np.mean(oos)), 3), 'unseen_dishes_top1_aiy_alone': round(float(np.mean(aiy_oos)), 3),
                   'unseen_dishes_hijacked_by_head': round(float(np.mean(hij)), 3),
                   'aiy_alone_known_classes_top1': round(float(np.mean([(lf(a.argmax()) or '') == y for a, y in zip(P[te & np.isin(lab, cls)], lab[te & np.isin(lab, cls)])])), 3)}
json.dump(out, open('footprint_ai/training/food_vision_results.json', 'w'), indent=1)
print(json.dumps(out, indent=1))
