import pytest
from footprint_ai.nutrition import db, estimate_item, estimate_meal, parse_item, split_meal


@pytest.mark.parametrize('text,qty,unit', [('2 eggs', 2, None), ('1 1/2 cups rice', 1.5, 'cup'), ('half a bagel', .5, None),
                                           ('200g chicken', 200, 'g'), ('chicken breast 200g', 200, 'g'), ('3 tbsp hummus', 3, 'tbsp'),
                                           ('had 3 scrambled eggs', 3, None), ('a glass of wine', 1, 'glass')])
def test_parse_quantities(text, qty, unit):
    p = parse_item(text)
    assert p.quantity == pytest.approx(qty) and p.unit == unit


def test_split_keeps_named_dishes():
    assert split_meal('mac and cheese and a coke') == ['mac and cheese', 'a coke']


@pytest.mark.parametrize('text,lo,hi', [('2 large eggs', 130, 160), ('1 cup of white rice', 190, 220), ('a medium banana', 95, 115),
                                        ('1 tbsp olive oil', 110, 130), ('8 oz sirloin steak', 480, 620), ('a can of coke', 130, 160),
                                        ('glass of red wine', 110, 140), ('2 slices pizza', 500, 650), ('chiken breast', 250, 320),
                                        ('3 oreos', 140, 180), ('10 chicken wings', 800, 1000)])
def test_known_portions(text, lo, hi):
    kcal = estimate_meal(text)['totals']['calories']
    assert lo <= kcal <= hi, (text, kcal)


def test_unknown_food_is_reported_not_invented():
    r = estimate_meal('2 zorbleflax')
    assert r['totals']['calories'] == 0 or r['confidence'] < .5


def test_modifier_only_match_has_low_confidence():
    it = estimate_item('chicken vindaloo surprise')
    assert it['confidence'] <= .5


def test_recipes_are_usda_ingredient_based():
    f = db().foods['recipe:pad_thai']
    assert f.group == 'Recipes' and f.portions[0][2] > 300


# --- Nov 2026: USDA FNDDS dishes, deterministic search, dish names that start with a unit word ---

def test_fndds_fills_dishes_sr28_lacks():
    from footprint_ai.nutrition import estimate_item
    r = estimate_item('beef stroganoff')
    assert r['matched'] and r['match'] == 'fndds-dish' and 250 < r['calories'] < 550
    assert estimate_item('sloppy joe')['matched']


def test_fndds_does_not_override_full_sr28_match():
    from footprint_ai.nutrition import estimate_item
    assert estimate_item('a snickers bar')['match'] != 'fndds-dish'


def test_search_ties_are_deterministic():
    import subprocess, sys
    code = "import sys; sys.path.insert(0, '.'); from footprint_ai.nutrition import estimate_item; print(estimate_item('beef tenderloin roast')['usdaId'])"
    outs = {subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, env={**__import__('os').environ, 'PYTHONHASHSEED': s}).stdout
            for s in ('1', '2', '3')}
    assert len(outs) == 1


def test_unit_word_dish_names():
    from footprint_ai.nutrition import estimate_item
    assert 300 < estimate_item('filet mignon')['calories'] < 600       # not "a fillet of mignon"
    assert 50 < estimate_item('1 shot of vodka')['calories'] < 130      # "shot" is still a unit


def test_new_dish_recipes():
    from footprint_ai.nutrition import estimate_item
    for dish, lo, hi in (('poutine', 600, 900), ('caprese salad', 250, 450), ('spaghetti carbonara', 500, 800), ('lobster roll', 350, 600)):
        assert lo < estimate_item(dish)['calories'] < hi, dish


def test_every_food_head_dish_has_reviewed_nutrition():
    from footprint_ai.food_vision import heads, label_map, _nutrition_for
    H, LM = heads(), label_map()
    assert len(H['classes']) == 101
    for c in H['classes']:
        n = _nutrition_for(LM['head:' + c])
        assert 20 <= n['calories'] <= 1200, (c, n['calories'])
    assert H['fam_of'], 'AIY label -> dish families should ship with the head'
