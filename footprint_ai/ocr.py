"""Text reading for packaging, nutrition labels, receipts and recipe photos.

Uses RapidOCR (PP-OCR detection + recognition models run with ONNX Runtime; Apache-2.0).
The models ship inside the `rapidocr` wheel, so nothing is downloaded at run time.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from PIL import Image, ImageOps

MAX_SIDE = 1600  # longer side in pixels; bigger photos are shrunk (text stays readable, OCR is ~3x faster)


@dataclass
class Line:
    text: str
    score: float
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def h(self) -> float:
        return self.y1 - self.y0

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2


class _Engine:
    def __init__(self):
        import logging
        from rapidocr import RapidOCR
        logging.getLogger('RapidOCR').setLevel(logging.ERROR)
        self.ocr = RapidOCR()
        self.lock = threading.Lock()

    def __call__(self, bgr: np.ndarray):
        with self.lock:
            return self.ocr(bgr)


@lru_cache(maxsize=1)
def engine() -> _Engine:
    return _Engine()


def available() -> bool:
    try:
        engine()
        return True
    except Exception:  # noqa: BLE001 - OCR is optional; callers fall back
        return False


def prepare(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert('RGB')
    scale = MAX_SIDE / max(img.size)
    if scale < 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.BILINEAR)
    return img


def _skew(boxes) -> float:
    """Median text angle (radians) of the wider boxes; photos of packs and receipts are often a few degrees off."""
    angles = []
    for b in boxes:
        (x0, y0), (x1, y1) = b[0], b[1]
        w = np.hypot(x1 - x0, y1 - y0)
        h = np.hypot(b[3][0] - x0, b[3][1] - y0)
        if w > 2 * h and w > 20:
            angles.append(np.arctan2(y1 - y0, x1 - x0))
    return float(np.median(angles)) if angles else 0.0


def read(img: Image.Image, min_score: float = .5) -> list[Line]:
    """All text lines in reading order (top to bottom, then left to right), in deskewed coordinates."""
    img = prepare(img)
    out = engine()(np.asarray(img)[:, :, ::-1].copy())
    lines = []
    if out is None or out.boxes is None:
        return lines
    keep = [(np.asarray(b, dtype=float), str(t).strip(), float(sc)) for b, t, sc in zip(out.boxes, out.txts, out.scores)
            if str(t).strip() and float(sc) >= min_score]
    a = _skew([b for b, _, _ in keep])
    c, s_ = np.cos(-a), np.sin(-a)
    rot = np.array([[c, -s_], [s_, c]])
    for box, text, score in keep:
        pts = box @ rot.T  # rotate so text lines are horizontal
        lines.append(Line(text, score, float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 0].max()), float(pts[:, 1].max())))
    lines.sort(key=lambda l: (l.cy, l.x0))
    return lines


def rows(lines: list[Line], tol: float = .5) -> list[list[Line]]:
    """Group text boxes that sit on the same printed line, each row left to right.

    A box joins a row when its centre is within `tol` x the smaller text height of the row's median
    centre (comparing with the whole row's extent would chain neighbouring lines together).
    """
    out: list[list[Line]] = []
    for ln in sorted(lines, key=lambda l: l.cy):
        best, best_d = None, None
        for row in out[-4:]:
            cy = float(np.median([l.cy for l in row]))
            h = float(np.median([l.h for l in row]))
            d = abs(ln.cy - cy) / max(1e-6, min(h, ln.h))
            if d <= tol and (best_d is None or d < best_d):
                best, best_d = row, d
        if best is not None:
            best.append(ln)
        else:
            out.append([ln])
    for row in out:
        row.sort(key=lambda l: l.x0)
    out.sort(key=lambda r: float(np.median([l.cy for l in r])))
    return out


def row_text(row: list[Line]) -> str:
    return ' '.join(l.text for l in row)


def text_of(img: Image.Image) -> str:
    """Plain text, one printed line per line."""
    return '\n'.join(row_text(r) for r in rows(read(img)))
