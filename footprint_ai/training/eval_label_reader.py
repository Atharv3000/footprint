"""End-to-end test of the nutrition label reader (OCR + parser) on rendered label photos.

Draws US "Nutrition Facts" panels and EU/UK per-100 g tables with random but consistent values,
in several fonts, then degrades them like phone photos (tilt, blur, JPEG, shadow, noise, background)
and checks each field the reader returns. Seeds 0-199 are the development set used while writing
the parser; --test uses seeds 10000+ that were never looked at.

Usage: python -m footprint_ai.training.eval_label_reader [--n 120] [--test] [--show 5]
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
FONTS = [f for f in ['arial.ttf', 'arialbd.ttf', 'verdana.ttf', 'tahoma.ttf', 'calibri.ttf', 'segoeui.ttf', 'ARIALN.TTF',
                     'trebuc.ttf'] if (Path('C:/Windows/Fonts') / f).exists()]
BOLD = [f for f in ['arialbd.ttf', 'verdanab.ttf', 'tahomabd.ttf', 'calibrib.ttf', 'segoeuib.ttf', 'ariblk.ttf']
        if (Path('C:/Windows/Fonts') / f).exists()]


def font(name, size):
    return ImageFont.truetype(str(Path('C:/Windows/Fonts') / name), size)


def values(rng: random.Random) -> dict:
    fat = rng.choice([0, .5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 22])
    carbs = rng.choice([0, 1, 2, 4, 6, 8, 10, 12, 15, 17, 19, 22, 24, 27, 30, 33, 37, 41, 45])
    protein = rng.choice([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 24])
    cal = round((9 * fat + 4 * carbs + 4 * protein) * rng.uniform(.95, 1.03) / 10) * 10 if fat + carbs + protein else 0
    sugar = min(carbs, rng.choice([0, 1, 2, 3, 5, 8, 10, 12, 15, 20]))
    fiber = min(carbs - sugar, rng.choice([0, 0, 1, 2, 3, 4, 6]))
    return {'calories': cal, 'fatG': fat, 'satFatG': round(fat * rng.uniform(.1, .5)), 'carbsG': carbs, 'sugarG': sugar,
            'fiberG': fiber, 'proteinG': protein, 'sodiumMg': rng.choice([0, 5, 35, 95, 140, 160, 210, 320, 480, 650]),
            'servingSizeG': rng.choice([28, 30, 40, 52, 55, 85, 113, 150, 240]), 'servingsPerContainer': rng.choice([1, 2, 4, 6, 8, 10, 12])}


def g(v):
    return f'{v:g}g'


def us_panel(v: dict, rng: random.Random) -> Image.Image:
    W = 420
    img = Image.new('RGB', (W, 760), 'white')
    d = ImageDraw.Draw(img)
    reg, bold = rng.choice(FONTS), rng.choice(BOLD)
    y = 12
    d.text((14, y), 'Nutrition Facts', font=font(bold, 38), fill='black'); y += 50
    d.text((14, y), f"{v['servingsPerContainer']} servings per container", font=font(reg, 18), fill='black'); y += 26
    d.text((14, y), 'Serving size', font=font(bold, 20), fill='black')
    d.text((250, y), f"1 cup ({v['servingSizeG']}g)", font=font(bold, 20), fill='black'); y += 30
    d.rectangle((14, y, W - 14, y + 8), fill='black'); y += 14
    d.text((14, y), 'Amount per serving', font=font(bold, 15), fill='black'); y += 18
    d.text((14, y), 'Calories', font=font(bold, 34), fill='black')
    d.text((W - 110, y - 4), str(v['calories']), font=font(bold, 40), fill='black'); y += 50
    d.rectangle((14, y, W - 14, y + 4), fill='black'); y += 10
    d.text((W - 130, y), '% Daily Value*', font=font(bold, 15), fill='black'); y += 22
    rows = [('Total Fat', g(v['fatG']), True, 0), ('Saturated Fat', g(v['satFatG']), False, 20), ('Trans Fat', '0g', False, 20),
            ('Cholesterol', '0mg', True, 0), ('Sodium', f"{v['sodiumMg']}mg", True, 0), ('Total Carbohydrate', g(v['carbsG']), True, 0),
            ('Dietary Fiber', g(v['fiberG']), False, 20), ('Total Sugars', g(v['sugarG']), False, 20), ('Protein', g(v['proteinG']), True, 0)]
    for name, amt, b, ind in rows:
        f1 = font(bold if b else reg, 19)
        d.text((14 + ind, y), name, font=f1, fill='black')
        x = 14 + ind + d.textlength(name + ' ', font=f1)
        d.text((x, y), amt, font=font(reg, 19), fill='black')
        if name != 'Protein':
            d.text((W - 60, y), f"{rng.randint(0, 30)}%", font=font(bold, 19), fill='black')
        y += 28
        d.line((14, y - 4, W - 14, y - 4), fill='black', width=1)
    d.rectangle((6, 6, W - 6, y + 6), outline='black', width=2)
    return img.crop((0, 0, W, y + 14))


def eu_table(v: dict, rng: random.Random) -> Image.Image:
    W = 520
    img = Image.new('RGB', (W, 420), 'white')
    d = ImageDraw.Draw(img)
    reg, bold = rng.choice(FONTS), rng.choice(BOLD)
    f = font(reg, 19)
    y = 12
    d.text((14, y), 'Nutrition', font=font(bold, 24), fill='black'); y += 34
    d.text((14, y), 'Typical values', font=font(bold, 17), fill='black')
    d.text((230, y), 'Per 100g', font=font(bold, 17), fill='black')
    d.text((360, y), f"Per serving ({v['servingSizeG']}g)", font=font(bold, 15), fill='black'); y += 30
    kcal = v['calories']
    rows = [('Energy', f'{round(kcal * 4.184)}kJ / {kcal}kcal'), ('Fat', g(v['fatG'])), ('of which saturates', g(v['satFatG'])),
            ('Carbohydrate', g(v['carbsG'])), ('of which sugars', g(v['sugarG'])), ('Fibre', g(v['fiberG'])),
            ('Protein', g(v['proteinG'])), ('Salt', f"{round(v['sodiumMg'] * 2.5 / 1000, 2):g}g")]
    for name, amt in rows:
        d.text((14, y), name, font=f, fill='black')
        d.text((230, y), amt, font=f, fill='black')
        d.text((380, y), '-', font=f, fill='black')
        y += 30
        d.line((14, y - 5, W - 14, y - 5), fill='gray', width=1)
    return img.crop((0, 0, W, y + 10))


def photo(img: Image.Image, rng: random.Random) -> Image.Image:
    """Make a clean render look like a phone photo of a package."""
    bg = tuple(rng.randint(90, 230) for _ in range(3))
    pad = rng.randint(30, 140)
    canvas = Image.new('RGB', (img.width + 2 * pad, img.height + 2 * pad), bg)
    tint = tuple(rng.randint(225, 255) for _ in range(3))
    tinted = Image.blend(img, Image.new('RGB', img.size, tint), .25) if rng.random() < .6 else img
    canvas.paste(tinted, (pad, pad))
    canvas = canvas.rotate(rng.uniform(-6, 6), resample=Image.BICUBIC, expand=True, fillcolor=bg)
    s = rng.uniform(1.2, 2.6)
    canvas = canvas.resize((int(canvas.width * s), int(canvas.height * s)), Image.BICUBIC)
    if rng.random() < .7:
        canvas = canvas.filter(ImageFilter.GaussianBlur(rng.uniform(.4, 1.6)))
    if rng.random() < .5:  # uneven light
        shade = Image.linear_gradient('L').resize(canvas.size).rotate(rng.choice([0, 90, 180, 270]))
        canvas = Image.composite(canvas, Image.eval(canvas, lambda p: int(p * .7)), shade.point(lambda p: 128 + p // 2))
    import io
    buf = io.BytesIO()
    canvas.save(buf, 'JPEG', quality=rng.randint(45, 85))
    return Image.open(buf).convert('RGB')


def run(n: int, test: bool, show: int) -> dict:
    from footprint_ai import ocr
    from footprint_ai.label import read_label_text
    keys = ['calories', 'fatG', 'carbsG', 'proteinG', 'sugarG', 'fiberG', 'sodiumMg', 'servingSizeG']
    hit = {k: 0 for k in keys}
    tot = {k: 0 for k in keys}
    all_ok = macros = errors = 0
    base = 10000 if test else 0
    for i in range(n):
        rng = random.Random(base + i)
        v = values(rng)
        eu = rng.random() < .35
        img = photo((eu_table if eu else us_panel)(v, rng), rng)
        text = ocr.text_of(img)
        try:
            r = read_label_text(text)
            got = r['fields']
        except ValueError:
            got, r = {}, {'macrosAgree': False}
            errors += 1
        good = True
        for k in keys:
            if k == 'servingsPerContainer' and eu:
                continue
            tot[k] += 1
            want = v[k]
            if k == 'sodiumMg' and eu:
                want = round(v['sodiumMg'] * 2.5 / 1000, 2) * 400
            ok = k in got and abs(got[k] - want) <= max(.51, .02 * want)
            hit[k] += ok
            good &= ok
        all_ok += good
        macros += bool(r.get('macrosAgree'))
        if not good and show > 0:
            show -= 1
            print(f'--- seed {base + i} ({"EU" if eu else "US"}) want', {k: v[k] for k in keys}, '\n got', got, '\n' + text[:600])
    res = {'set': 'test' if test else 'dev', 'labels': n, 'all_fields_right': round(all_ok / n, 3),
           'per_field': {k: round(hit[k] / max(tot[k], 1), 3) for k in keys}, 'macros_agree': round(macros / n, 3),
           'no_calories_found': errors}
    return res


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=120)
    ap.add_argument('--test', action='store_true')
    ap.add_argument('--show', type=int, default=0)
    a = ap.parse_args()
    print(json.dumps(run(a.n, a.test, a.show), indent=1))
