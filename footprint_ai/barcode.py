"""Product barcodes (EAN-13, EAN-8, UPC-A, UPC-E) in a photo, read with OpenCV's barcode detector."""
from __future__ import annotations

import threading
from functools import lru_cache

import numpy as np
from PIL import Image, ImageOps

_lock = threading.Lock()


@lru_cache(maxsize=1)
def _detector():
    import cv2
    return cv2.barcode.BarcodeDetector()


def valid_ean(code: str) -> bool:
    """GS1 check digit (EAN-8, UPC-A, EAN-13, GTIN-14)."""
    if not code.isdigit() or len(code) not in (8, 12, 13, 14):
        return False
    digits = [int(c) for c in code]
    body, check = digits[:-1], digits[-1]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def read_barcodes(img: Image.Image) -> list[str]:
    """Valid product codes found in the photo (tries the photo, then a sharpened and an upscaled copy)."""
    import cv2
    img = ImageOps.exif_transpose(img).convert('L')
    if max(img.size) > 1600:
        r = 1600 / max(img.size)
        img = img.resize((round(img.width * r), round(img.height * r)), Image.BILINEAR)
    gray = np.asarray(img)
    # OpenCV's locator is picky about scale and margins, so a few cheap variants are tried in turn.
    m = max(60, int(max(gray.shape) * .6))
    tries = [gray, cv2.GaussianBlur(gray, (0, 0), 1.2), cv2.resize(gray, None, fx=.6, fy=.6, interpolation=cv2.INTER_AREA),
             cv2.copyMakeBorder(gray, m, m, m, m, cv2.BORDER_CONSTANT, value=255),
             cv2.addWeighted(gray, 1.6, cv2.GaussianBlur(gray, (0, 0), 3), -.6, 0)]
    if max(gray.shape) < 900:
        tries.append(cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
    found: list[str] = []
    for g in tries:
        with _lock:
            try:
                ok, infos, _types, _pts = _detector().detectAndDecodeWithType(g)
            except Exception:  # noqa: BLE001 - OpenCV raises on odd inputs; treat as "no barcode"
                ok, infos = False, ()
        for code in (infos or ()) if ok else ():
            code = str(code).strip()
            if valid_ean(code) and code not in found:
                found.append(code)
        if found:
            break
    return found
