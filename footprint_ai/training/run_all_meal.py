import json, sys; sys.path.insert(0,'.')
from footprint_ai.nutrition import estimate_meal
res = {}
for name in ('meal_benchmark', 'meal_heldout', 'meal_final_test'):
    B=json.load(open(f'footprint_ai/training/{name}.json')); ok=0; errs=[]
    for text, ref, note in B:
        r=estimate_meal(text); kc=r['totals']['calories']
        err=abs(kc-ref)/max(ref,30); errs.append(err); good = err <= .25 or abs(kc-ref) <= 25; ok+=good
        if not good and '-q' not in sys.argv: print(f"  MISS [{name}] {text:<44} got {kc:>5} ref {ref:>4} conf {r['confidence']}")
    errs.sort(); res[name]=(ok,len(B),errs[len(errs)//2])
    print(f'{name}: {ok}/{len(B)} within 25%; median abs error {errs[len(errs)//2]:.0%}')
json.dump({k: {'within_25pct': v[0], 'n': v[1], 'median_abs_err': round(v[2],3)} for k,v in res.items()}, open('footprint_ai/training/meal_results.json','w'), indent=1)
