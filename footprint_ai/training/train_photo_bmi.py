"""Train the photo-BMI gradient-boosted model and export it as portable JSON trees.

Usage: python -m footprint_ai.training.train_photo_bmi <feats.csv>  (from extract_photo_bmi)
Validation: 5-fold GroupKFold over height/weight groups (no group in both train and test), 3 repeats.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor as HGB
from sklearn.model_selection import GroupKFold

from footprint_ai.physique import FEATURES, GBM_PATH

PARAMS = dict(loss='absolute_error', max_iter=400, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=20, random_state=0)


def export(model) -> list[dict]:
    trees = []
    for (pred,) in model._predictors:
        n = pred.nodes
        trees.append({'f': n['feature_idx'].astype(int).tolist(), 't': n['num_threshold'].astype(float).tolist(),
                      'l': n['left'].astype(int).tolist(), 'r': n['right'].astype(int).tolist(),
                      'leaf': n['is_leaf'].astype(bool).tolist(), 'v': n['value'].astype(float).tolist(),
                      'ml': n['missing_go_to_left'].astype(bool).tolist()})
    return trees


def main(path: str):
    df = pd.read_csv(path)
    df = df[df.ok].reset_index(drop=True)
    X, y, t, g = df[FEATURES].values, np.log(df.bmi.values), df.bmi.values, df.group
    preds = np.zeros(len(df))
    for rep in range(3):
        perm = dict(zip(g.unique(), np.random.RandomState(rep).permutation(g.nunique())))
        p = np.zeros(len(df))
        for tr, te in GroupKFold(5).split(X, y, g.map(perm)):
            p[te] = HGB(**PARAMS).fit(X[tr], y[tr]).predict(X[te])
        preds += np.exp(p) / 3
    err = np.abs(preds - t)
    metrics = {'n_images': int(len(df)), 'n_groups': int(g.nunique()), 'cv_mae': round(float(err.mean()), 2),
               'cv_mape': round(float((err / t).mean() * 100), 1),
               'baseline_median_mae': round(float(np.abs(t - np.median(t)).mean()), 2),
               'within_3_bmi': round(float((err <= 3).mean()), 3),
               'by_band_mae': {f'{lo}-{hi}': round(float(err[(t >= lo) & (t < hi)].mean()), 2)
                               for lo, hi in [(15, 25), (25, 30), (30, 35), (35, 70)]}}
    final = HGB(**PARAMS).fit(X, y)
    out = {'version': 'photo-bmi-gbm-1', 'features': FEATURES, 'log_target': True,
           'baseline': float(final._baseline_prediction.ravel()[0]), 'trees': export(final), 'metrics': metrics}
    # check the exported trees reproduce sklearn
    from footprint_ai import physique
    physique._gbm.cache_clear()
    GBM_PATH.write_text(json.dumps(out))
    diff = max(abs(physique.predict_photo_bmi(dict(zip(FEATURES, row)))['bmi'] - round(float(np.exp(final.predict(row[None])[0])), 1))
               for row in X[:100])
    print(json.dumps(metrics, indent=1), 'export diff', diff)
    (Path(__file__).parent / 'photo_bmi_results.json').write_text(json.dumps(metrics, indent=1))


if __name__ == '__main__':
    main(sys.argv[1])
