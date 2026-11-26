import json
import os
from pathlib import Path

import numpy as np
import pytest

from footprint_ai.body_metrics import MODEL_PATH, cun_bae, dxa_model, estimate_body_fat, navy, rfm
from footprint_ai.physique import ab_visibility


def test_reference_equations():
    assert rfm(False, 175, 90) == pytest.approx(25.1, abs=.1)        # Woolcott & Bergman 2018 definition
    assert navy(False, 178, 86, 38, None) == pytest.approx(17.2, abs=.3)
    assert cun_bae(False, 40, 25) == pytest.approx(23.4, abs=.3)


def test_model_file_records_validated_metrics():
    m = json.loads(MODEL_PATH.read_text())['metrics']
    assert m['no_waist']['holdout_mae'] < m['no_waist']['baselines_holdout_mae']['cun_bae']
    assert m['with_waist']['holdout_mae'] < m['with_waist']['baselines_holdout_mae']['rfm']
    assert m['with_waist']['external_mae'] < 3.0


def test_dxa_model_regression_values():
    assert dxa_model(False, 30, 180, 80)['bodyFat'] == pytest.approx(23.3, abs=.1)
    assert dxa_model(True, 45, 165, 70, 88)['bodyFat'] == pytest.approx(38.0, abs=.1)


def test_dxa_model_behaves_sensibly():
    base = dxa_model(False, 35, 178, 80, 90)['bodyFat']
    assert dxa_model(False, 35, 178, 80, 100)['bodyFat'] > base          # bigger waist -> more fat
    heavier = dxa_model(False, 35, 178, 90, 90)['bodyFat']                # +10 kg at the same waist: mostly lean mass,
    assert heavier > base - 2                                              # so % fat may dip a little,
    assert heavier * 90 >= base * 80                                       # but fat mass in kg must not go down
    assert dxa_model(True, 35, 178, 80, 90)['bodyFat'] > base + 5        # women carry more essential fat
    for w in range(45, 160, 5):                                           # no polynomial blow-ups across the range
        assert 3 < dxa_model(False, 40, 175, w)['bodyFat'] < 60


def test_waist_narrows_range_and_raises_confidence():
    a = estimate_body_fat({'gender': 'male', 'age': 30, 'weightKg': 80, 'heightCm': 180})
    b = estimate_body_fat({'gender': 'male', 'age': 30, 'weightKg': 80, 'heightCm': 180, 'waistCm': 84, 'neckCm': 38})
    assert b['confidence'] > a['confidence']
    assert a['bodyFatRange'][0] < a['bodyFatPercent'] < a['bodyFatRange'][1]
    assert 'usNavy' in b['methodValues'] and 'rfm' in b['methodValues']


def test_athletes_without_waist_get_wider_range_and_advice():
    r = estimate_body_fat({'gender': 'male', 'age': 25, 'weightKg': 95, 'heightCm': 180, 'athleticLevel': 'bodybuilder'})
    assert any('waist' in n for n in r['visualFeatures']) and r['confidence'] <= .5
    assert r['bodyFatPercent'] - r['bodyFatRange'][0] > 7


def test_requires_height_and_weight_or_photo():
    with pytest.raises(ValueError):
        estimate_body_fat({'gender': 'female'})
    with pytest.raises(ValueError):
        estimate_body_fat({'gender': 'female', 'heightCm': 165})


def test_ab_visibility_follows_body_fat():
    assert ab_visibility(9, False)['absVisibleProbability'] > .8
    assert ab_visibility(30, False)['absVisibleProbability'] < .1
    assert ab_visibility(17, True)['absVisibleProbability'] > ab_visibility(17, False)['absVisibleProbability']
    r = estimate_body_fat({'gender': 'male', 'age': 25, 'weightKg': 72, 'heightCm': 180, 'waistCm': 74})
    assert 'not read from the photo' in r['abs']['method']


DATASET = os.environ.get('FOOTPRINT_BMI_DATASET')  # atoms18/BMI-prediction-from-Human-Photograph checkout


@pytest.mark.skipif(not DATASET, reason='set FOOTPRINT_BMI_DATASET to run photo-model checks')
def test_photo_bmi_on_dataset_images():
    from PIL import Image
    from footprint_ai.physique import predict_photo_bmi, silhouette_features
    import pandas as pd
    lab = pd.read_csv(Path(DATASET) / 'height-weight-chart_dataset.csv').iloc[::25]
    errs = []
    for r in lab.itertuples():
        path = Path(DATASET) / 'raw_datasets' / r.image_filename.replace('.png', '.jpg')
        if not path.exists():
            continue
        img = Image.open(path).convert('RGB')
        img.thumbnail((720, 720))
        f = silhouette_features(np.asarray(img))
        if f:
            bmi = r.weight * 0.4536 / ((r.foot * 12 + r.inch) * 0.0254) ** 2
            errs.append(abs(predict_photo_bmi(f)['bmi'] - bmi))
    assert len(errs) > 30 and np.mean(errs) < 6  # training images: a smoke test, not the CV metric
