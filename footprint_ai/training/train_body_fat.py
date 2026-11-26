"""Train the body-fat model on measured DXA data and export portable coefficients.

Data (all from public GitHub mirrors; git clone):
  NHANES 1999-2004 DXA, adults: github.com/rpruim/NHANES  data/NHANES.rda      (training + held-out test)
  NHANES 2017-2018 DXA, 20-59 y: github.com/cran/gmgm     data/data_body.rda   (external test only)
Usage: python -m footprint_ai.training.train_body_fat <NHANES.rda> <data_body.rda>
Needs: pyreadr pandas scikit-learn.
Model: degree-3 polynomial ridge on (male, age, BMI, log BMI[, waist, waist/height, log waist/height]),
       one model with waist and one without. 80 % ranges are split-conformal half-widths per sex.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyreadr
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

OUT = Path(__file__).resolve().parents[1] / 'models' / 'body_fat_model.json'


def load(nh, ext):
    d = pyreadr.read_r(nh)['NHANES']
    a = d[(d.age >= 18) & (d.pregnant.astype(str) != 'yes')].dropna(subset=['height', 'weight', 'pfat'])
    tr = pd.DataFrame({'male': (a.sex.astype(str) == 'male').astype(int), 'age': a.age, 'height_cm': a.height * 100,
                       'weight_kg': a.weight, 'waist_cm': a.waist * 100, 'bf': a.pfat})
    b = pyreadr.read_r(ext)['data_body']
    ex = pd.DataFrame({'male': (b.GENDER == 0).astype(int), 'age': b.AGE, 'height_cm': b.HEIGHT,
                       'weight_kg': b.WEIGHT, 'waist_cm': b.WAIST, 'bf': b.FAT})
    return tr, ex


def feats(df, waist):
    h = df.height_cm / 100
    X = pd.DataFrame({'male': df.male, 'age': df.age})
    X['bmi'] = df.weight_kg / h ** 2; X['lbmi'] = np.log(X.bmi)
    if waist:
        X['wc'] = df.waist_cm / 100; X['whtr'] = X.wc / h; X['lwhtr'] = np.log(X.whtr)
    return X


def baselines(df):
    h = df.height_cm; bmi = df.weight_kg / (h / 100) ** 2; s = 1 - df.male; age = df.age
    return {'rfm': 64 - 20 * h / df.waist_cm + 12 * s,
            'cun_bae': -44.988 + 0.503 * age + 10.689 * s + 3.172 * bmi - 0.026 * bmi ** 2 + 0.181 * bmi * s
            - 0.02 * bmi * age - 0.005 * bmi ** 2 * s + 0.00021 * bmi ** 2 * age,
            'deurenberg': 1.2 * bmi + 0.23 * age - 10.8 * df.male - 5.4}


def fit(t, waist):
    X = feats(t, waist)
    return make_pipeline(StandardScaler(), PolynomialFeatures(3), RidgeCV(alphas=np.logspace(-3, 3, 13))).fit(X, t.bf), X


def main(nh, ext_path):
    data, ext = load(nh, ext_path)
    tr, te = train_test_split(data, test_size=0.2, random_state=0)
    out = {'version': 'bf-nhanes-dxa-1', 'target': 'DXA whole-body % fat (NHANES 1999-2004 adults, non-pregnant)',
           'models': {}, 'metrics': {}}
    mae = lambda a, b: round(float(np.mean(np.abs(np.asarray(a) - np.asarray(b)))), 2)
    for waist in (False, True):
        key = 'with_waist' if waist else 'no_waist'
        t = tr.dropna(subset=['waist_cm']) if waist else tr
        h = te.dropna(subset=['waist_cm']) if waist else te
        m, _ = fit(t, waist)
        rh = h.bf - m.predict(feats(h, waist))
        q = {s: float(np.quantile(np.abs(rh[h.male == s]), 0.8)) for s in (0, 1)}
        re_ = ext.bf - m.predict(feats(ext, waist))
        cov = float(np.mean(np.abs(re_) <= np.where(ext.male == 1, q[1], q[0])))
        bh, be = baselines(h), baselines(ext)
        out['metrics'][key] = {'holdout_n': len(h), 'holdout_mae': mae(rh, 0), 'external_n': len(ext),
                               'external_mae': mae(re_, 0), 'external_interval80_coverage': round(cov, 3),
                               'baselines_holdout_mae': {k: mae(v, h.bf) for k, v in bh.items() if waist or k != 'rfm'},
                               'baselines_external_mae': {k: mae(v, ext.bf) for k, v in be.items() if waist or k != 'rfm'}}
        allt = data.dropna(subset=['waist_cm']) if waist else data
        m, X = fit(allt, waist)
        sc, pf, rg = (s[1] for s in m.steps)
        out['models'][key] = {'features': list(X.columns), 'mean': sc.mean_.tolist(), 'scale': sc.scale_.tolist(),
                              'powers': pf.powers_.tolist(), 'coef': rg.coef_.tolist(), 'intercept': float(rg.intercept_),
                              'clip': {c: [float(X[c].quantile(.001)), float(X[c].quantile(.999))] for c in X.columns},
                              'interval80_halfwidth': {'female': round(q[0], 2), 'male': round(q[1], 2)}}
    OUT.write_text(json.dumps(out))
    print(json.dumps(out['metrics'], indent=1))
    (Path(__file__).parent / 'body_fat_results.json').write_text(json.dumps(out['metrics'], indent=1))


if __name__ == '__main__':
    main(*sys.argv[1:3])
