"""Build footprint_ai/data/fndds.json from USDA FNDDS (FoodData Central "Survey foods", public domain).

FNDDS is the database behind NHANES diet interviews: ~5,400 foods as people actually eat them
(mixed dishes, restaurant items, sandwiches, salads), with measured nutrients and real portion
weights ("1 burrito", "1 cup", "1 piece (1/8 of 9" cake)").

Download: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip
Usage:    python -m footprint_ai.training.build_fndds <unzipped folder>
Output has the same shape as usda_sr28.json (values per 100 g), ids prefixed with "F".
"""
import csv
import re
import json
import sys
from pathlib import Path

# This file uses the legacy SR nutrient numbers (208 = energy kcal, ...), like usda_sr28.json.
NUT = {'208': 'kcal', '203': 'protein', '204': 'fat', '205': 'carbs', '291': 'fiber', '269': 'sugar', '307': 'sodium_mg'}


def rows(path: Path):
    with path.open(encoding='utf-8', newline='') as f:
        yield from csv.DictReader(f)


def main(src: str) -> None:
    src = Path(src)
    cats = {r['wweia_food_category']: r['wweia_food_category_description'] for r in rows(src / 'wweia_food_category.csv')}
    nut: dict[str, dict] = {}
    for r in rows(src / 'food_nutrient.csv'):
        k = NUT.get(r['nutrient_id'])
        if k and r['amount']:
            nut.setdefault(r['fdc_id'], {})[k] = float(r['amount'])
    portions: dict[str, list] = {}
    for r in rows(src / 'food_portion.csv'):
        g = float(r['gram_weight'] or 0)
        desc = r['portion_description'].strip()
        if g <= 0 or not desc or desc.lower().startswith('quantity not specified'):
            continue
        m = re.match(r'(\d+(?:\.\d+)?)\s+(.*)', desc)  # "1 small/regular" -> amount 1, "small/regular"
        amount, desc = (float(m[1]), m[2]) if m and not re.match(r'\d*/', m[2]) else (1.0, desc)
        portions.setdefault(r['fdc_id'], []).append([amount, desc, g])
    foods = []
    for r in rows(src / 'food.csv'):
        n = nut.get(r['fdc_id'], {})
        if 'kcal' not in n:
            continue
        foods.append({'id': 'F' + r['fdc_id'], 'desc': r['description'], 'group': 'FNDDS: ' + cats.get(r['food_category_id'], 'Other'),
                      'common': '', **{k: round(n.get(k, 0.0), 2) for k in NUT.values()}, 'portions': portions.get(r['fdc_id'], [])})
    out = Path(__file__).resolve().parents[1] / 'data' / 'fndds.json'
    out.write_text(json.dumps({'source': 'USDA Food and Nutrient Database for Dietary Studies (FNDDS 2021-2023, FoodData Central '
                                         'survey foods, public domain). Values per 100 g.', 'foods': foods}, separators=(',', ':')))
    print(len(foods), 'foods', out.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1])
