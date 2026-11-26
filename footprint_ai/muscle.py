"""Progress-photo muscle-group analysis from pose landmarks.

For each photo: find the person with MediaPipe Pose, place the crop box for the
requested muscle group from the actual joint positions (not a fixed template),
check that the region is in frame and shows bare skin, and measure local
surface detail (high-frequency texture) inside the crop.

Bare skin vs clothing: logistic heads on MobileNetV2 (ImageNet) embeddings plus the YCrCb skin
ratio (models/bare_torso_head.json), trained on hand-labelled crops (training/labels/).
Cross-validated (5x5-fold): abs 414 crops, AUC 0.996, precision 0.97, recall 0.93;
chest 227 crops, AUC 0.94, precision 0.90, recall 0.69 (conservative).
The old colour-only rule had precision 0.24 on the abs crops (skin-coloured shirts passed as skin).
Shoulders/back use the chest head (not separately validated); arms/legs keep the colour rule.

The detail score is *relative across the user's own photos* (0-100). It reflects
lighting and photo quality as much as muscle definition, so it is labelled as
"surface detail", not body fat or muscle size. Photos where the region is not
visible or is covered by clothing are reported as such instead of being scored.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from .food_vision import decode_image

GROUPS = ('abs', 'chest', 'arms', 'shoulders', 'back', 'legs')


def _box(pts: dict, group: str, aspect: float) -> tuple[float, float, float, float] | None:
    g = lambda n: pts.get(n) if pts.get(n, {}).get('visibility', 0) >= .5 else None
    sl, sr, hl, hr = g('shoulder_l'), g('shoulder_r'), g('hip_l'), g('hip_r')
    if group in ('abs', 'chest', 'back', 'shoulders') and not (sl and sr and (hl or hr)):
        return None
    if sl and sr:
        sx0, sx1 = sorted([sl['x'], sr['x']])
        sy = (sl['y'] + sr['y']) / 2
    if group in ('abs', 'chest', 'back', 'shoulders'):
        hy = np.mean([h['y'] for h in (hl, hr) if h])
        torso = hy - sy
        w = sx1 - sx0
        if group == 'abs':
            return sx0 + .12 * w, sy + .38 * torso, .76 * w, .62 * torso
        if group == 'chest':
            return sx0 + .02 * w, sy - .02 * torso, .96 * w, .42 * torso
        if group == 'shoulders':
            return sx0 - .18 * w, sy - .18 * torso, 1.36 * w, .38 * torso
        return sx0 - .05 * w, sy - .05 * torso, 1.1 * w, 1.0 * torso  # back: whole torso from behind
    if group == 'arms':
        best = None
        for side in ('l', 'r'):
            s, e, wr = g('shoulder_' + side), g('elbow_' + side), g('wrist_' + side)
            if s and e:
                xs = [p['x'] for p in (s, e, wr) if p]; ys = [p['y'] for p in (s, e, wr) if p]
                vis = sum(p['visibility'] for p in (s, e, wr) if p)
                if best is None or vis > best[0]:
                    pad = .06
                    best = (vis, (min(xs) - pad, min(ys) - pad, max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad))
        return best[1] if best else None
    if group == 'legs':
        legs = [p for p in (g('hip_l'), g('hip_r'), g('knee_l'), g('knee_r'), g('ankle_l'), g('ankle_r')) if p]
        if len(legs) < 4:
            return None
        xs = [p['x'] for p in legs]; ys = [p['y'] for p in legs]
        return min(xs) - .06, min(ys) - .02, max(xs) - min(xs) + .12, max(ys) - min(ys) + .06
    return None


def _clip(b):
    x, y, w, h = b
    x0, y0 = max(0.0, x), max(0.0, y)
    x1, y1 = min(1.0, x + w), min(1.0, y + h)
    inside = max(0.0, (x1 - x0) * (y1 - y0)) / max(w * h, 1e-6)
    return (x0, y0, max(0.0, x1 - x0), max(0.0, y1 - y0)), inside


def _skin_ratio(rgb: np.ndarray) -> float:
    """Classic YCrCb skin rule (Chai & Ngan); works across skin tones in normal light."""
    img = Image.fromarray(rgb).convert('YCbCr')
    _, cb, cr = [np.asarray(c, dtype=np.int16) for c in img.split()]
    mask = (cr >= 133) & (cr <= 173) & (cb >= 77) & (cb <= 127)
    return float(mask.mean())


_HEAD = Path(__file__).parent / 'models' / 'bare_torso_head.json'
_BACKBONE = Path(__file__).parent / 'models' / 'mobilenetv2_embed.onnx'
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)


@lru_cache(maxsize=1)
def _bare_model():
    import onnxruntime as ort
    head = json.loads(_HEAD.read_text())
    sess = ort.InferenceSession(str(_BACKBONE), providers=['CPUExecutionProvider'])
    return sess, head


HEAD_FOR = {'abs': 'abs', 'chest': 'chest', 'shoulders': 'chest', 'back': 'chest'}


def bare_skin_probability(rgb: np.ndarray, group: str = 'abs') -> float | None:
    """P(region shows bare skin rather than clothing); None if no trained head applies or it cannot load."""
    if group not in HEAD_FOR:
        return None
    try:
        sess, heads = _bare_model()
        head = heads['heads'][HEAD_FOR[group]]
    except Exception:  # noqa: BLE001 - onnxruntime missing: caller falls back to the colour rule
        return None
    x = (np.asarray(Image.fromarray(rgb).resize((224, 224), Image.BILINEAR), np.float32) / 255 - _MEAN) / _STD
    e = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})[0][0]
    f = np.append(e / (np.linalg.norm(e) + 1e-9), _skin_ratio(rgb))
    z = float(np.dot((f - np.array(head['mean'])) / np.array(head['scale']), head['coef']) + head['intercept'])
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


def _detail(rgb: np.ndarray) -> float:
    g = np.asarray(Image.fromarray(rgb).convert('L').resize((128, 128)), dtype=np.float32)
    lap = g[1:-1, 1:-1] * 4 - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]
    return float(lap.std() / (g.mean() + 10))


def analyze_photo(image_b64: str, group: str) -> dict:
    from .pose import detector
    img = decode_image(image_b64).convert('RGB')
    img.thumbnail((900, 900))
    rgb = np.asarray(img)
    pts, people = detector().detect(rgb)
    if not people:
        return {'hasMuscleVisibility': False, 'reason': 'No person found in the photo.'}
    b = _box(pts, group, img.width / img.height)
    if b is None:
        return {'hasMuscleVisibility': False, 'reason': f'The {group} region is not visible in this photo.'}
    box, inside = _clip(b)
    if inside < .7 or box[2] < .05 or box[3] < .05:
        return {'hasMuscleVisibility': False, 'reason': f'The {group} region is cut off by the frame.', 'cropBox': box}
    H, W = rgb.shape[:2]
    crop = rgb[int(box[1] * H):int((box[1] + box[3]) * H), int(box[0] * W):int((box[0] + box[2]) * W)]
    skin = _skin_ratio(crop)
    p_bare = bare_skin_probability(crop, group)
    visible = (p_bare >= .5) if p_bare is not None else skin >= .3
    return {'hasMuscleVisibility': visible, 'skinRatio': round(skin, 2),
            'bareSkinProbability': None if p_bare is None else round(p_bare, 3),
            'visibilityMethod': 'trained classifier' if p_bare is not None else 'colour rule (not validated)',
            'detail': _detail(crop) if visible else None,
            'cropBox': {'x': round(box[0], 4), 'y': round(box[1], 4), 'width': round(box[2], 4), 'height': round(box[3], 4),
                        'zoomScale': round(min(3.0, max(1.0, .6 / max(box[2], box[3]))), 2)},
            'reason': None if visible else f'The {group} region looks covered by clothing.'}


def analyze_muscle(photos: list[dict], group: str, body: dict | None = None) -> dict:
    """photos: [{id, image(base64), date?}] -> per-photo results with a relative detail score.

    body (optional): {gender, age, heightCm, weightKg, waistCm, ...}. For the abs group it adds an
    ab-visibility estimate derived from the DXA-trained body-fat model.
    """
    if group not in GROUPS:
        raise ValueError(f'Unknown muscle group: {group}')
    results = []
    for p in photos[:24]:
        try:
            r = analyze_photo(p.get('image', ''), group)
        except ValueError as exc:
            r = {'hasMuscleVisibility': False, 'reason': str(exc)}
        results.append({'photoId': p.get('id'), 'date': p.get('date'), **r})
    scored = [r for r in results if r.get('detail') is not None]
    if scored:
        vals = np.array([r['detail'] for r in scored])
        ranks = vals.argsort().argsort()
        for r, k in zip(scored, ranks):
            r['definitionScore'] = int(round(100 * (k + 1) / len(scored))) if len(scored) > 1 else 50
    for r in results:
        r.pop('detail', None)
        r.setdefault('definitionScore', None)
    n = len(scored)
    extra = {}
    if group == 'abs' and body and body.get('heightCm') and body.get('weightKg'):
        from .body_metrics import estimate_body_fat
        bf = estimate_body_fat({k: v for k, v in body.items() if k != 'image'})
        extra = {'absVisibility': bf['abs'], 'bodyFatPercent': bf['bodyFatPercent'], 'bodyFatRange': bf['bodyFatRange']}
    return {'muscleGroup': group, 'photos': results, **extra,
            'summary': f'{n} of {len(results)} photos show the {group} clearly.',
            'scoreMeaning': 'definitionScore ranks surface detail across your own photos (0-100). It depends on lighting and pose, so compare photos taken in similar conditions.'}
