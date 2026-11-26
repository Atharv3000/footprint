import json, sys
sys.path.insert(0, 'footprint_ai/training'); from aliases_src import A
F = {f['id'] for f in json.load(open('footprint_ai/data/usda_sr28.json'))['foods']}
for k, v in A.items():
    for i in ([v] if isinstance(v, str) else [i for i, _ in v['recipe']]):
        assert i in F, (k, i)
out = {'_about': 'Curated everyday names -> USDA SR28 NDB numbers, or recipes of SR28 ingredients in grams per serving.'}
for k, v in A.items(): out[k] = {'id': v} if isinstance(v, str) else v
json.dump(out, open('footprint_ai/data/food_aliases.json', 'w'), indent=0)
print(len(A), 'aliases ok')
