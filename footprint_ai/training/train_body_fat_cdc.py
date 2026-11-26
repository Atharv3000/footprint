"""Retrain the body-fat model on every NHANES DXA survey (official CDC files).

Data: wwwn.cdc.gov/Nchs/Data/Nhanes/Public/<year>/DataFiles/{DXX,DEMO,BMX}<suffix>.xpt
  1999 (no suffix), 2001 _B, 2003 _C, 2005 _D, 2011 _G, 2013 _H, 2015 _I  -> training (+ 15 % held out)
  2017 _J                                                                 -> external test only
1999-2006 DXA files hold 5 multiple imputations per person; their mean is used.
Target: DXDTOPF (DXA total body % fat). Adults 18+, not pregnant.

Usage: python -m footprint_ai.training.train_body_fat_cdc <dir with the .xpt files>
Writes models/body_fat_model.json (same format as before, so constants/bodyFatModel.json and the
TypeScript port keep working) and training/body_fat_results.json, and prints old-vs-new on the
same held-out people.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'models' / 'body_fat_model.json'
CYCLES = {'1999': '', '2001': '_B', '2003': '_C', '2005': '_D', '2011': '_G', '2013': '_H', '2015': '_I', '2017': '_J'}


def load_cycle(d: Path, year: str, s: str) -> pd.DataFrame:
    dxx = pd.read_sas(d / f'DXX{s}.xpt', format='xport')
    if '_MULT_' in dxx.columns:  # multiple imputations (1999-2006): average them
        dxx = dxx.groupby('SEQN', as_index=False)['DXDTOPF'].mean()
    dxx = dxx[['SEQN', 'DXDTOPF']].dropna()
    demo = pd.read_sas(d / f'DEMO{s}.xpt', format='xport')
    demo = demo[['SEQN', 'RIAGENDR', 'RIDAGEYR'] + (['RIDEXPRG'] if 'RIDEXPRG' in demo else [])]
    bmx = pd.read_sas(d / f'BMX{s}.xpt', format='xport')[['SEQN', 'BMXWT', 'BMXHT', 'BMXWAIST']]
    m = dxx.merge(demo, on='SEQN').merge(bmx, on='SEQN')
    m = m[(m.RIDAGEYR >= 18)]
    if 'RIDEXPRG' in m:
        m = m[m.RIDEXPRG != 1]
    m = m.dropna(subset=['BMXWT', 'BMXHT', 'DXDTOPF'])
    return pd.DataFrame({'cycle': year, 'male': (m.RIAGENDR == 1).astype(int), 'age': m.RIDAGEYR,
                         'height_cm': m.BMXHT, 'weight_kg': m.BMXWT, 'waist_cm': m.BMXWAIST, 'bf': m.DXDTOPF})


def feats(df, waist):
    h = df.height_cm / 100
    X = pd.DataFrame({'male': df.male.values, 'age': df.age.values})
    X['bmi'] = (df.weight_kg / h ** 2).values
    X['lbmi'] = np.log(X.bmi)
    if waist:
        X['wc'] = (df.waist_cm / 100).values
        X['whtr'] = (df.waist_cm / df.height_cm).values
        X['lwhtr'] = np.log(X.whtr)
    return X


def fit(t, waist, degree):
    X = feats(t, waist)
    return make_pipeline(StandardScaler(), PolynomialFeatures(degree), RidgeCV(alphas=np.logspace(-3, 3, 13))).fit(X, t.bf), X


def baselines(df):
    h = df.height_cm.values; bmi = df.weight_kg.values / (h / 100) ** 2; s = 1 - df.male.values; age = df.age.values
    return {'rfm': 64 - 20 * h / df.waist_cm.values + 12 * s,
            'cun_bae': -44.988 + 0.503 * age + 10.689 * s + 3.172 * bmi - 0.026 * bmi ** 2 + 0.181 * bmi * s
            - 0.02 * bmi * age - 0.005 * bmi ** 2 * s + 0.00021 * bmi ** 2 * age,
            'deurenberg': 1.2 * bmi + 0.23 * age - 10.8 * df.male.values - 5.4}


def predict_json(M, df, waist):
    """Evaluate an exported model exactly like footprint_ai/body_metrics.py does."""
    X = feats(df, waist)
    out = []
    for _, r in X.iterrows():
        z = (np.array([np.clip(r[c], *M['clip'][c]) for c in M['features']]) - np.array(M['mean'])) / np.array(M['scale'])
        out.append(M['intercept'] + np.dot(M['coef'], np.prod(z[None, :] ** np.array(M['powers']), axis=1)))
    return np.array(out)


def export(m, X, q):
    sc, pf, rg = (s[1] for s in m.steps)
    return {'features': list(X.columns), 'mean': sc.mean_.tolist(), 'scale': sc.scale_.tolist(),
            'powers': pf.powers_.tolist(), 'coef': rg.coef_.tolist(), 'intercept': float(rg.intercept_),
            'clip': {c: [float(X[c].quantile(.001)), float(X[c].quantile(.999))] for c in X.columns},
            'interval80_halfwidth': {'female': round(q[0], 2), 'male': round(q[1], 2)}}


def main(d, old_path=None):
    d = Path(d)
    all_ = pd.concat([load_cycle(d, y, s) for y, s in CYCLES.items()], ignore_index=True)
    ext = all_[all_.cycle == '2017']
    dev = all_[all_.cycle != '2017']
    rng = np.random.RandomState(0)
    # Held-out people come only from 2005-2016, which the old model never saw, so old vs new is fair.
    newer = dev[dev.cycle.isin(['2005', '2011', '2013', '2015'])]
    hold_idx = newer.index[rng.rand(len(newer)) < 0.15]
    hold, train = dev.loc[hold_idx], dev.drop(hold_idx)
    print('people per cycle:', all_.cycle.value_counts().sort_index().to_dict())
    print(f'train {len(train)}  held-out {len(hold)}  external 2017-18 {len(ext)}')

    # Compare against the previous model (pass --old <file> once the project copy has been replaced).
    old = json.loads(Path(old_path or OUT).read_text())
    mae = lambda r: round(float(np.mean(np.abs(r))), 2)
    out = {'version': 'bf-nhanes-dxa-2',
           'target': 'DXA whole-body % fat (NHANES 1999-2006 + 2011-2016 adults, non-pregnant; official CDC files)',
           'models': {}, 'metrics': {}}
    for waist in (False, True):
        key = 'with_waist' if waist else 'no_waist'
        t = train.dropna(subset=['waist_cm']) if waist else train
        h = hold.dropna(subset=['waist_cm']) if waist else hold
        e = ext.dropna(subset=['waist_cm']) if waist else ext
        # Degree 4 scored only ~0.01 better on validation; degree 3 is kept as it extrapolates more gently.
        degree = 3
        m, _ = fit(t, waist, degree)
        rh = h.bf.values - m.predict(feats(h, waist))
        re_ = e.bf.values - m.predict(feats(e, waist))
        q = {s: float(np.quantile(np.abs(rh[h.male.values == s]), 0.8)) for s in (0, 1)}
        cov = float(np.mean(np.abs(re_) <= np.where(e.male.values == 1, q[1], q[0])))
        old_h = h.bf.values - predict_json(old['models'][key], h, waist)
        old_e = e.bf.values - predict_json(old['models'][key], e, waist)
        out['metrics'][key] = {'train_n': len(t), 'degree': degree,
                               'holdout_n': len(h), 'holdout_mae': mae(rh), 'old_model_holdout_mae': mae(old_h),
                               'external_n': len(e), 'external_mae': mae(re_), 'old_model_external_mae': mae(old_e),
                               'external_interval80_coverage': round(cov, 3),
                               'baselines_holdout_mae': {k: mae(v - h.bf.values) for k, v in baselines(h).items() if waist or k != 'rfm'},
                               'baselines_external_mae': {k: mae(v - e.bf.values) for k, v in baselines(e).items() if waist or k != 'rfm'}}
        # Final model: all 1999-2016 people (2017-18 stays untouched as the outside test).
        alld = dev.dropna(subset=['waist_cm']) if waist else dev
        mf, X = fit(alld, waist, degree)
        out['models'][key] = export(mf, X, q)
    print(json.dumps(out['metrics'], indent=1))
    return out


if __name__ == '__main__':
    old_arg = sys.argv[sys.argv.index('--old') + 1] if '--old' in sys.argv else None
    result = main(sys.argv[1], old_arg)
    if '--write' in sys.argv:
        OUT.write_text(json.dumps(result))
        (HERE / 'body_fat_results.json').write_text(json.dumps(result['metrics'], indent=1))
        print('wrote', OUT)
