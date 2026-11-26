"""Physique-from-photo models.

1. Silhouette geometry: MediaPipe pose landmarks plus the person-segmentation output of the same
   pose-landmark network (run directly through LiteRT so it works on every mediapipe version).
   Body widths at shoulder / chest / waist / hip / thigh level are measured on the mask and
   normalised by torso length, so they do not depend on camera distance.
2. Photo BMI regressor: a gradient-boosted tree model trained on those features
   (models/photo_bmi_gbm.json; training script training/train_photo_bmi.py).
   Grouped 5-fold cross-validation on 1,122 labelled full-body photos: MAE 4.5 BMI points
   (MAPE 16.6 %); predicting the median would give MAE 6.3. It is a coarse adiposity signal,
   used to cross-check the entered height/weight, never to replace them.
3. Ab visibility: there is no public labelled photo set for visible abs, so it is NOT read from
   pixels. It is a probability derived from the validated body-fat estimate, using the usual
   body-fat bands at which the rectus abdominis becomes visible (see AB_BANDS). This is stated in
   every response.
"""
from __future__ import annotations

import json
import math
import threading
import zipfile
from functools import lru_cache
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
GBM_PATH = HERE / 'models' / 'photo_bmi_gbm.json'
LEVELS = (('w_sh', 0.1), ('w_ch', 0.3), ('w_wa', 0.65), ('w_hp', 1.0), ('w_th', 1.25))
FEATURES = ['sw', 'hw', 'mask_frac', 'w_sh', 'w_ch', 'w_wa', 'w_hp', 'w_th', 'wa_sh', 'hp_sh', 'th_hp']


class _Segmenter:
    """Runs the segmentation head of pose_landmark_full on a square crop around the person."""

    def __init__(self):
        from ai_edge_litert.interpreter import Interpreter
        from .pose import model_path
        blob = zipfile.ZipFile(model_path()).read('pose_landmarks_detector.tflite')
        self.it = Interpreter(model_content=blob)
        self.it.allocate_tensors()
        self.inp = self.it.get_input_details()[0]['index']
        self.out = next(o['index'] for o in self.it.get_output_details() if tuple(o['shape']) == (1, 256, 256, 1))
        self.lock = threading.Lock()

    def mask(self, rgb: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
        """Person probability (H x W, 0..1) inside `box` (x0, y0, side, side), zero elsewhere."""
        from PIL import Image
        h, w = rgb.shape[:2]
        x0, y0, side = box[0], box[1], box[2]
        canvas = np.zeros((side, side, 3), np.uint8)
        sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(w, x0 + side), min(h, y0 + side)
        canvas[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = rgb[sy0:sy1, sx0:sx1]
        x = np.asarray(Image.fromarray(canvas).resize((256, 256), Image.BILINEAR), np.float32)[None] / 255.0
        with self.lock:
            self.it.set_tensor(self.inp, x)
            self.it.invoke()
            m = self.it.get_tensor(self.out)[0, :, :, 0].copy()
        if m.min() < 0 or m.max() > 1:  # logits
            m = 1 / (1 + np.exp(-np.clip(m, -30, 30)))
        big = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((side, side), Image.BILINEAR), np.float32) / 255
        full = np.zeros((h, w), np.float32)
        full[sy0:sy1, sx0:sx1] = big[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
        return full


@lru_cache(maxsize=1)
def segmenter() -> _Segmenter:
    return _Segmenter()


def _run_width(row: np.ndarray, cx: float) -> float:
    on = row > 0.5
    if not on.any():
        return 0.0
    c = int(np.clip(cx, 0, len(on) - 1))
    if not on[c]:
        idx = np.where(on)[0]
        c = int(idx[np.argmin(np.abs(idx - c))])
    lo = c
    while lo > 0 and on[lo - 1]:
        lo -= 1
    hi = c
    while hi < len(on) - 1 and on[hi + 1]:
        hi += 1
    return float(hi - lo + 1)


def silhouette_features(rgb: np.ndarray, pts: dict | None = None) -> dict | None:
    """Scale-free body-shape features, or None when shoulders and hips are not clearly visible."""
    h, w = rgb.shape[:2]
    if pts is None:
        from .pose import detector
        pts, people = detector().detect(rgb)
        if not people:
            return None
    need = ('shoulder_l', 'shoulder_r', 'hip_l', 'hip_r')
    if any(pts.get(n, {}).get('visibility', 0) < .5 for n in need):
        return None
    P = {n: np.array([p['x'] * w, p['y'] * h]) for n, p in pts.items()}
    sh = (P['shoulder_l'] + P['shoulder_r']) / 2
    hp = (P['hip_l'] + P['hip_r']) / 2
    torso = float(np.linalg.norm(sh - hp))
    if torso < 20:
        return None
    xs = [p[0] for p in P.values()]; ys = [p[1] for p in P.values()]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    side = int(max(max(xs) - min(xs), max(ys) - min(ys), 2.2 * torso) * 1.35)
    box = (int(cx - side / 2), int(cy - side / 2), side, side)
    m = segmenter().mask(rgb, box)
    f = {'sw': float(np.linalg.norm(P['shoulder_l'] - P['shoulder_r']) / torso),
         'hw': float(np.linalg.norm(P['hip_l'] - P['hip_r']) / torso),
         'mask_frac': float((m > .5).mean())}
    for key, t in LEVELS:
        y = sh[1] + t * (hp[1] - sh[1]); x = sh[0] + t * (hp[0] - sh[0])
        f[key] = _run_width(m[int(np.clip(y, 0, h - 1))], x) / torso
    f['wa_sh'] = f['w_wa'] / f['w_sh'] if f['w_sh'] else 0.0
    f['hp_sh'] = f['w_hp'] / f['w_sh'] if f['w_sh'] else 0.0
    f['th_hp'] = f['w_th'] / f['w_hp'] if f['w_hp'] else 0.0
    f['frontal'] = bool(f['sw'] > 0.45)  # side-on photos have narrow shoulder spans
    return f


@lru_cache(maxsize=1)
def _gbm() -> dict:
    return json.loads(GBM_PATH.read_text())


def _tree_value(tree: dict, x: list[float]) -> float:
    i = 0
    feat, thr, left, right, leaf, val, miss = (tree[k] for k in ('f', 't', 'l', 'r', 'leaf', 'v', 'ml'))
    while not leaf[i]:
        xv = x[feat[i]]
        go_left = miss[i] if (xv is None or (isinstance(xv, float) and math.isnan(xv))) else xv <= thr[i]
        i = left[i] if go_left else right[i]
    return val[i]


def predict_photo_bmi(features: dict) -> dict:
    g = _gbm()
    x = [float(features.get(k, float('nan'))) for k in g['features']]
    z = g['baseline'] + sum(_tree_value(t, x) for t in g['trees'])
    bmi = math.exp(z) if g.get('log_target') else z
    return {'bmi': round(bmi, 1), 'mae': g['metrics']['cv_mae'], 'mape': g['metrics']['cv_mape']}


# Body-fat bands at which abdominal definition usually shows (male, female). Not trained on photos.
AB_BANDS = {'male': [(10, 'clearly visible', .9), (13, 'visible in good lighting', .65), (16, 'outline only', .3),
                     (20, 'faint / upper abs only', .12), (99, 'not visible', .03)],
            'female': [(16, 'clearly visible', .85), (19, 'visible in good lighting', .6), (23, 'outline only', .3),
                       (27, 'faint / upper abs only', .1), (99, 'not visible', .03)]}


def ab_visibility(bf_percent: float, female: bool, bf_range: tuple[float, float] | None = None) -> dict:
    bands = AB_BANDS['female' if female else 'male']

    def band(v):
        return next(b for b in bands if v < b[0])
    lab, prob = band(bf_percent)[1:]
    if bf_range:  # average over the uncertainty range so the probability reflects it
        grid = np.linspace(bf_range[0], bf_range[1], 21)
        prob = float(np.mean([band(v)[2] for v in grid]))
    return {'absVisibility': lab, 'absVisibleProbability': round(prob, 2),
            'bodyFatForVisibleAbs': bands[1][0], 'clearlyVisibleBelow': bands[0][0],
            'method': 'Derived from the body-fat estimate using typical visibility bands; not read from the photo pixels.'}
