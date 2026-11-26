"""Build footprint_ai/data/usda_sr28.json from the USDA SR28 ASCII files (public domain)."""
import json, sys
from pathlib import Path
SRC = Path(sys.argv[1])
def rows(name):
    for line in (SRC / name).read_text(encoding='latin-1').splitlines():
        if line.strip():
            yield [f.strip('~') for f in line.rstrip('\r').split('^')]
groups = {r[0]: r[1] for r in rows('FD_GROUP.txt')}
NUT = {'208': 'kcal', '203': 'protein', '204': 'fat', '205': 'carbs', '291': 'fiber', '269': 'sugar', '307': 'sodium_mg'}
nut = {}
for r in rows('NUT_DATA.txt'):
    if r[1] in NUT:
        nut.setdefault(r[0], {})[NUT[r[1]]] = float(r[2])
weights = {}
for r in rows('WEIGHT.txt'):
    try: weights.setdefault(r[0], []).append([float(r[2]), r[3], float(r[4])])
    except ValueError: pass
foods = []
for r in rows('FOOD_DES.txt'):
    n = nut.get(r[0], {})
    if 'kcal' not in n: continue
    foods.append({'id': r[0], 'desc': r[2], 'group': groups.get(r[1], r[1]), 'common': r[4],
                  **{k: round(n.get(k, 0.0), 2) for k in NUT.values()}, 'portions': weights.get(r[0], [])})
out = Path('footprint_ai/data/usda_sr28.json')
out.write_text(json.dumps({'source': 'USDA National Nutrient Database for Standard Reference, Release 28 (public domain). Values per 100 g.', 'foods': foods}, separators=(',', ':')))
print(len(foods), 'foods', out.stat().st_size // 1024, 'KB')
