"""Test images drawn in code: EAN-13 barcodes, printed text (labels, receipts, recipes, packs)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']


def ean13(code: str, module: int = 3, height: int = 120) -> Image.Image:
    assert len(code) == 13 and code.isdigit()
    d = [int(c) for c in code]
    bits = '101'
    for i, p in enumerate(PARITY[d[0]]):
        bits += (L if p == 'L' else G)[d[i + 1]]
    bits += '01010'
    for x in d[7:]:
        bits += R[x]
    bits += '101'
    q = 12 * module
    img = Image.new('L', (len(bits) * module + 2 * q, height + 2 * q), 255)
    dr = ImageDraw.Draw(img)
    for i, b in enumerate(bits):
        if b == '1':
            dr.rectangle((q + i * module, q, q + (i + 1) * module - 1, q + height), fill=0)
    return img.convert('RGB')


def font(size: int, bold: bool = False):
    for name in (['arialbd.ttf', 'DejaVuSans-Bold.ttf'] if bold else ['arial.ttf', 'DejaVuSans.ttf']):
        for base in ('C:/Windows/Fonts', '/usr/share/fonts/truetype/dejavu'):
            if (Path(base) / name).exists():
                return ImageFont.truetype(str(Path(base) / name), size)
    return ImageFont.load_default(size)


def text_image(lines: list[str], size: int = 26, width: int = 760, bold_first: bool = False) -> Image.Image:
    h = (size + 14) * len(lines) + 40
    img = Image.new('RGB', (width, h), 'white')
    d = ImageDraw.Draw(img)
    y = 20
    for i, ln in enumerate(lines):
        d.text((24, y), ln, font=font(size, bold_first and i == 0), fill='black')
        y += size + 14
    return img
