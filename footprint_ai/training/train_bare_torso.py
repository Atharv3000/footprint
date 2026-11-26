"""Train the bare-skin vs clothing heads used by muscle.py (abs and chest regions).

Two ways to get labelled crops:
  A) Reproduce the shipped model from the photo set + the hand labels in training/labels/:
       python -m footprint_ai.training.train_bare_torso --dataset <atoms18 repo root>
     (github.com/atoms18/BMI-prediction-from-Human-Photograph, raw_datasets/*.jpg)
  B) Add your own labelled crops (recommended as real user photos arrive):
       python -m footprint_ai.training.train_bare_torso --dataset ... --extra <dir>
     where <dir>/{abs,chest}/{bare,covered}/*.jpg are region crops.
Writes models/bare_torso_head.json and prints 5x repeated stratified 5-fold CV metrics.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, recall_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from footprint_ai import muscle
from footprint_ai.pose import detector

LAB = Path(__file__).parent / 'labels'


def features(rgb: np.ndarray) -> np.ndarray:
    sess, _ = muscle._bare_model()
    x = (np.asarray(Image.fromarray(rgb).resize((224, 224), Image.BILINEAR), np.float32) / 255 - muscle._MEAN) / muscle._STD
    e = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})[0][0]
    return np.append(e / (np.linalg.norm(e) + 1e-9), muscle._skin_ratio(rgb))


def crop(path: Path, group: str) -> np.ndarray | None:
    img = Image.open(path).convert('RGB'); img.thumbnail((900, 900))
    rgb = np.asarray(img)
    pts, n = detector().detect(rgb)
    if not n:
        return None
    b = muscle._box(pts, group, img.width / img.height)
    if b is None:
        return None
    box, inside = muscle._clip(b)
    H, W = rgb.shape[:2]
    c = rgb[int(box[1] * H):int((box[1] + box[3]) * H), int(box[0] * W):int((box[0] + box[2]) * W)]
    return c if c.size else None


def shipped_labels():
    ns = {}
    exec((LAB / 'labels_abs.py').read_text(), ns); exec((LAB / 'labels_round2.py').read_text(), ns)
    out = []
    for i, r in enumerate(json.loads((LAB / 'label_set.json').read_text())):
        if i not in ns['SKIP']:
            out.append((r['crop'], 'abs', int(i in ns['BARE'])))
    for i, r in enumerate(json.loads((LAB / 'round2.json').read_text())):
        if i not in ns['R2_SKIP']:
            out.append((r['crop'], r['group'], int(i in ns['R2_BARE'])))
    for i, r in enumerate(json.loads((LAB / 'round2_low.json').read_text())):
        if i not in ns['LOW_SKIP']:
            out.append((r['crop'], r['group'], 0))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset', required=True)
    ap.add_argument('--extra')
    a = ap.parse_args()
    F, y, g = [], [], []
    for name, group, label in shipped_labels():
        src = Path(a.dataset) / 'raw_datasets' / name.split('_', 1)[1]
        c = crop(src, group)
        if c is not None:
            F.append(features(c)); y.append(label); g.append(group)
    if a.extra:
        for group in ('abs', 'chest'):
            for label, cls in ((1, 'bare'), (0, 'covered')):
                for f in sorted((Path(a.extra) / group / cls).glob('*')):
                    F.append(features(np.asarray(Image.open(f).convert('RGB')))); y.append(label); g.append(group)
    F, y, g = np.array(F), np.array(y), np.array(g)
    heads, metrics = {}, {}
    for reg in ('abs', 'chest'):
        X, Y = F[g == reg], y[g == reg]
        make = lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.03, max_iter=5000, class_weight='balanced'))
        p = np.mean([cross_val_predict(make(), X, Y, cv=StratifiedKFold(5, shuffle=True, random_state=r), method='predict_proba')[:, 1]
                     for r in range(5)], 0)
        metrics[reg] = {'n': int(len(Y)), 'n_bare': int(Y.sum()), 'cv_auc': round(roc_auc_score(Y, p), 3),
                        'cv_precision': round(precision_score(Y, p > .5), 3), 'cv_recall': round(recall_score(Y, p > .5), 3)}
        m = make().fit(X, Y); sc, lr = m.steps[0][1], m.steps[1][1]
        heads[reg] = {'mean': sc.mean_.tolist(), 'scale': sc.scale_.tolist(), 'coef': lr.coef_[0].tolist(), 'intercept': float(lr.intercept_[0])}
    out = json.loads(muscle._HEAD.read_text())
    out.update(heads=heads, metrics=metrics)
    muscle._HEAD.write_text(json.dumps(out))
    print(json.dumps(metrics, indent=1))


if __name__ == '__main__':
    main()
