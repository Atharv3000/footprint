import os
"""Train the food/non-food gate and the 13-class dish head on AIY embeddings; save as plain numpy weights."""
import json, sys, numpy as np
sys.path.insert(0, '.')
from sklearn.linear_model import LogisticRegression
d = np.load(os.environ.get('FOOD_DATA', 'data_cache') + '/food_feats.npz')
E, lab = d['emb'], d['label']
X = E / np.linalg.norm(E, axis=1, keepdims=True)
food = lab != '__nonfood__'
gate = LogisticRegression(C=1.0, max_iter=3000, class_weight='balanced').fit(X, food)
cls = sorted(set(lab) - {'__nonfood__', '__food_unlabelled__'})
m = np.isin(lab, cls)
head = LogisticRegression(C=4.0, max_iter=5000).fit(X[m], lab[m])
th = np.load(os.environ.get('FOOD_DATA', 'data_cache') + '/combine_thresholds.npy')
# prototypes for the novelty check: keep up to 200 embeddings per class (float16 to keep the file small)
rng = np.random.RandomState(0)
protos = {c: X[m & (lab == c)][rng.permutation((m & (lab == c)).sum())[:200]].astype(np.float16) for c in cls}
np.savez_compressed('footprint_ai/models/food_heads.npz', gate_w=gate.coef_[0].astype(np.float32), gate_b=np.float32(gate.intercept_[0]),
                    head_w=head.coef_.astype(np.float32), head_b=head.intercept_.astype(np.float32), head_classes=np.array(head.classes_),
                    th_head=np.float32(th[0]), th_aiy=np.float32(th[1]), th_sim=np.float32(th[2]),
                    **{f'proto_{c}': v for c, v in protos.items()})
print('saved; classes', list(head.classes_), 'thresholds', th)
