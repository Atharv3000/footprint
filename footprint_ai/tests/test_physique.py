import json

import numpy as np

from footprint_ai.muscle import bare_skin_probability
from footprint_ai.physique import FEATURES, GBM_PATH, _run_width, predict_photo_bmi


def test_run_width_measures_the_segment_under_the_body_centre():
    row = np.array([0, 1, 1, 0, 0, 1, 1, 1, 1, 0], float)
    assert _run_width(row, 6) == 4 and _run_width(row, 1) == 2
    assert _run_width(row, 3.4) == 2          # off-body centre snaps to the nearest segment
    assert _run_width(np.zeros(5), 2) == 0


def test_photo_bmi_model_is_validated_and_stays_in_range():
    g = json.loads(GBM_PATH.read_text())
    assert g['features'] == FEATURES and g['metrics']['cv_mae'] < g['metrics']['baseline_median_mae']
    lean = dict(sw=.7, hw=.38, mask_frac=.2, w_sh=.95, w_ch=.85, w_wa=.62, w_hp=.75, w_th=.6, wa_sh=.65, hp_sh=.79, th_hp=.8)
    wide = dict(sw=.7, hw=.45, mask_frac=.45, w_sh=1.3, w_ch=1.45, w_wa=1.45, w_hp=1.4, w_th=1.4, wa_sh=1.12, hp_sh=1.08, th_hp=1.0)
    a, b = predict_photo_bmi(lean)['bmi'], predict_photo_bmi(wide)['bmi']
    assert 14 < a < b < 70


def test_bare_skin_classifier_loads_and_is_bounded():
    rng = np.random.default_rng(0)
    p = bare_skin_probability(rng.integers(0, 255, (120, 100, 3), dtype=np.uint8), 'abs')
    assert p is not None and 0 <= p <= 1
    assert bare_skin_probability(np.zeros((50, 50, 3), np.uint8), 'arms') is None   # no trained head for arms
