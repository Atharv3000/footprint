"""Extract silhouette features for photo-BMI training.

Usage: python -m footprint_ai.training.extract_photo_bmi <dataset_root> <out.csv>
<dataset_root> holds height-weight-chart_dataset.csv and raw_datasets/*.jpg
(github.com/atoms18/BMI-prediction-from-Human-Photograph). Labels: self-reported height/weight.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from footprint_ai.physique import FEATURES, silhouette_features


def main(root: str, out: str):
    root = Path(root)
    lab = pd.read_csv(root / 'height-weight-chart_dataset.csv')
    rows = []
    for r in lab.itertuples():
        f = root / 'raw_datasets' / r.image_filename.replace('.png', '.jpg')
        if not f.exists():
            continue
        img = Image.open(f).convert('RGB'); img.thumbnail((720, 720))
        feats = silhouette_features(np.asarray(img))
        row = {'file': f.name, 'group': f.stem.rsplit('-', 1)[0],
               'bmi': r.weight * 0.4536 / ((r.foot * 12 + r.inch) * 0.0254) ** 2, 'ok': feats is not None}
        if feats:
            row.update({k: feats[k] for k in FEATURES})
        rows.append(row)
    pd.DataFrame(rows).to_csv(out, index=False)
    print(len(rows), sum(r['ok'] for r in rows))


if __name__ == '__main__':
    main(*sys.argv[1:3])
