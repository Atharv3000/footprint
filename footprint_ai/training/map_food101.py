"""Link each Food-101 dish to USDA nutrition for a typical serving (written into data/label_nutrition.json as 'head:<dish>').

Uses the same lookup as meal text (curated aliases + SR28 + FNDDS dishes), with a readable phrase per
dish where the folder name is not how people say it. Prints every mapping for review.
Usage: python -m footprint_ai.training.map_food101 <food-101 folder>
"""
import json
import sys
from pathlib import Path

from footprint_ai.nutrition import db, dishes, estimate_item

# Folder name -> how the dish is usually written (only where they differ).
SAY = {'baby_back_ribs': 'spare rib', 'beef_tartare': 'steak tartare', 'beignets': 'beignet', 'chicken_wings': '6 chicken wings',
       'churros': '2 churros', 'dumplings': '6 dumplings', 'escargots': 'escargot', 'caprese_salad': 'caprese salad', 'croque_madame': 'croque madame', 'cannoli': 'cannoli',
       'lobster_bisque': 'lobster bisque', 'lobster_roll_sandwich': 'lobster roll', 'panna_cotta': 'panna cotta', 'poutine': 'poutine',
       'shrimp_and_grits': 'shrimp and grits', 'risotto': 'risotto', 'spaghetti_carbonara': 'spaghetti carbonara',
       'tuna_tartare': 'tuna tartare', 'prime_rib': 'prime rib', 'gyoza': '6 gyoza', 'macarons': '3 macarons',
       'mussels': '1 cup mussels', 'oysters': '6 oysters', 'scallops': '5 scallops', 'spring_rolls': '2 spring rolls',
       'takoyaki': 'takoyaki', 'cannoli': 'cannoli', 'donuts': 'doughnut', 'french_fries': 'medium french fries',
       'deviled_eggs': '4 deviled eggs', 'chicken_quesadilla': 'chicken quesadilla', 'fried_calamari': 'fried calamari',
       'onion_rings': 'onion rings', 'garlic_bread': '2 slices garlic bread', 'pizza': '2 slices pizza', 'tacos': '2 tacos',
       'sushi': '8 piece sushi roll', 'samosa': '2 samosas', 'falafel': '4 falafel', 'edamame': '1 cup edamame',
       'ice_cream': '1 cup ice cream', 'frozen_yogurt': '1 cup frozen yogurt', 'miso_soup': '1 cup miso soup',
       'hot_and_sour_soup': '1 cup hot and sour soup', 'french_onion_soup': '1 bowl french onion soup', 'pho': '1 bowl pho',
       'ramen': '1 bowl ramen', 'clam_chowder': '1 bowl clam chowder', }

# Reviewed by hand (Nov 2026): where the automatic match was wrong (e.g. crab cakes -> layer cake,
# samosa -> Samoas cookies, oysters -> oyster mushrooms) or the serving was unrealistic for a plated dish.
# dish -> (USDA id or None to keep the matched food, grams, portion label). 'F...' ids are FNDDS dishes.
OVERRIDE = {
    'bruschetta': ('F2707652', 120, '2 pieces'), 'carrot_cake': ('F2707859', 110, '1 slice'), 'ceviche': ('F2706463', 200, '1 cup'),
    'cheese_plate': ('F2705704', 60, 'about 2 oz of cheese'), 'chocolate_mousse': ('F2705698', 150, '1 serving'),
    'churros': ('F2708070', 80, '2 churros'), 'clam_chowder': ('F2707139', 248, '1 cup'), 'club_sandwich': ('F2706993', 250, '1 sandwich'),
    'crab_cakes': ('F2706549', 120, '2 small crab cakes'), 'creme_brulee': ('F2705684', 130, '1 ramekin'),
    'cup_cakes': ('F2707853', 75, '1 frosted cupcake'), 'donuts': ('F2708062', 65, '1 medium doughnut'),
    'dumplings': ('F2708705', 150, '6 dumplings'), 'gyoza': ('F2708705', 150, '6 gyoza'), 'french_toast': ('F2708335', 130, '2 slices'),
    'garlic_bread': ('F2707626', 60, '2 slices'), 'gnocchi': ('F2708722', 250, '1 plate (no sauce)'),
    'greek_salad': ('F2709830', 300, '1 bowl (no dressing)'), 'hamburger': ('F2706920', 200, '1 burger'),
    'huevos_rancheros': ('F2707191', 300, '1 plate'), 'hummus': ('F2707402', 60, '1/4 cup'), 'macarons': ('F2707936', 45, '3 macarons'),
    'mussels': (None, 150, '1 bowl (~150 g meat)'), 'oysters': ('F2706351', 85, '6 raw oysters'), 'paella': ('F2706723', 350, '1 plate'),
    'pancakes': (None, 114, '3 pancakes'), 'peking_duck': ('F2706139', 150, '1 serving with skin'), 'pho': ('F2707124', 600, '1 large bowl'),
    'prime_rib': (None, 250, '1 cut (~9 oz)'), 'pulled_pork_sandwich': ('F2706975', 200, '1 sandwich'),
    'ramen': ('F2709153', 550, '1 restaurant bowl'), 'red_velvet_cake': ('F2707884', 110, '1 slice'), 'samosa': ('F2708730', 100, '1 large samosa'),
    'scallops': ('F2706356', 120, '5 scallops'), 'seaweed_salad': ('F2710100', 100, '1 side'),
    'strawberry_shortcake': ('F2707896', 150, '1 serving'), 'tiramisu': ('F2705702', 120, '1 slice'), 'omelette': (None, 150, '3-egg omelette'),
}


def main(root):
    classes = sorted(p.name for p in (Path(root) / 'images').iterdir() if p.is_dir())
    path = Path(__file__).resolve().parents[1] / 'data' / 'label_nutrition.json'
    LM = json.loads(path.read_text())
    weak = []
    for c in classes:
        phrase = SAY.get(c, c.replace('_', ' '))
        r = estimate_item(phrase)
        if c in OVERRIDE:
            fid, grams, portion = OVERRIDE[c]
            fid = fid or r['usdaId']
            f = (dishes() if fid.startswith('F') else db()).foods[fid]
            r = {'matched': True, 'usdaId': fid, 'usdaDescription': f.desc, 'match': 'reviewed', 'confidence': .9,
                 'grams': grams, 'portion': portion, **f.per(grams)}
        if not r['matched']:
            weak.append(c); print(f'{c:24} UNMATCHED'); continue
        LM['head:' + c] = {'label': c.replace('_', ' ').title(), 'usdaId': r['usdaId'], 'usda': r['usdaDescription'], 'match': r['match'],
                           'matchConfidence': r['confidence'], 'servingG': r['grams'], 'portion': r['portion']}
        flag = '  <-- check' if r['confidence'] < .6 else ''
        print(f"{c:24} {r['calories']:>5} kcal {r['grams']:>4} g  {r['usdaDescription'][:60]}  [{r['match']}, {r['confidence']}]{flag}")
    path.write_text(json.dumps(LM, indent=0))
    print('mapped', len(classes) - len(weak), 'of', len(classes))


if __name__ == '__main__':
    main(sys.argv[1])
