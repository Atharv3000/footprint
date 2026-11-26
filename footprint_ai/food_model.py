"""Google AIY food classifier (MobileNet V1, 2023 dishes) run with LiteRT.

Returns the full 2024-way softmax and the 1024-d pooled image embedding, which
the trained food head (food_head.npz) and the food/non-food gate consume.
"""
from __future__ import annotations

import csv
import threading
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

MODELS = Path(__file__).parent / 'models'


@lru_cache(maxsize=1)
def labels() -> list[str]:
    with open(MODELS / 'aiy_food_v1_labels.csv', encoding='utf-8') as f:
        return [r['name'].strip() for r in csv.DictReader(f)]


def _interpreter_cls():
    try:
        from ai_edge_litert.interpreter import Interpreter
    except ImportError:  # pragma: no cover - older environments
        from tflite_runtime.interpreter import Interpreter  # type: ignore
    return Interpreter


class FoodModel:
    SIZE = 192

    def __init__(self, path: Path | str = MODELS / 'aiy_food_v1.tflite'):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            self.it = _interpreter_cls()(str(path), experimental_preserve_all_tensors=True, num_threads=2)
        self.it.allocate_tensors()
        self.inp = self.it.get_input_details()[0]['index']
        names = {t['name']: t['index'] for t in self.it.get_tensor_details()}
        self.emb_idx = names['MobilenetV1/Logits/AvgPool_1a/AvgPool']
        self.prob_idx = names['MobilenetV1/Predictions/Softmax1']
        self.lock = threading.Lock()

    @staticmethod
    def prepare(image: Image.Image, crop: float = 1.0) -> np.ndarray:
        img = ImageOps.exif_transpose(image).convert('RGB')
        w, h = img.size
        side = int(min(w, h) * crop)
        left, top = (w - side) // 2, (h - side) // 2
        img = img.crop((left, top, left + side, top + side)).resize((FoodModel.SIZE, FoodModel.SIZE), Image.BILINEAR)
        return np.asarray(img, dtype=np.uint8)[None]

    def run(self, image: Image.Image, crop: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
        x = self.prepare(image, crop)
        with self.lock:
            self.it.set_tensor(self.inp, x)
            self.it.invoke()
            emb = self.it.get_tensor(self.emb_idx).reshape(-1).astype(np.float32).copy()
            prob = self.it.get_tensor(self.prob_idx).reshape(-1).astype(np.float32).copy()
        return emb, prob

    def run_tta(self, image: Image.Image) -> tuple[np.ndarray, np.ndarray]:
        """Average of full-frame and centre-crop views (small, cheap accuracy gain)."""
        e1, p1 = self.run(image, 1.0)
        e2, p2 = self.run(image, 0.8)
        return (e1 + e2) / 2, (p1 + p2) / 2


@lru_cache(maxsize=1)
def model() -> FoodModel:
    return FoodModel()
