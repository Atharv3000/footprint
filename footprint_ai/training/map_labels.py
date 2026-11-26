"""Map every AIY food label (and the trained head classes) to a USDA SR28 food or recipe."""
import json, re, sys
sys.path.insert(0, '.')
from footprint_ai.nutrition import db, default_serving, tokens, STOP
from footprint_ai.food_model import labels
D = db()
HEAD = {'apple_pie': 'apple pie', 'baby_back_ribs': 'spare rib', 'baklava': 'baklava', 'beef_carpaccio': 'beef carpaccio',
        'beef_tartare': 'steak tartare', 'beet_salad': 'beet salad', 'beignets': 'beignet', 'bibimbap': 'bibimbap',
        'bread_pudding': 'bread pudding', 'breakfast_burrito': 'breakfast burrito', 'pizza': 'pizza', 'steak': 'steak', 'sushi': 'sushi'}
# Generic fallbacks by dish word (USDA ids / recipe aliases), used when the label itself is not in USDA.
GENERIC = [(r'pizza', 'pizza'), (r'burger', 'hamburger'), (r'hot dog|chili dog', 'hot dog'), (r'sandwich|sub\b|panini|hoagie|po.boy|torta', 'sandwich'),
           (r'taco', 'taco'), (r'burrito', 'burrito'), (r'enchilada', 'enchilada'), (r'quesadilla', 'quesadilla'), (r'nacho', 'nachos'),
           (r'sushi|maki|nigiri|onigiri|kimbap|gimbap', 'sushi'), (r'ramen|noodle soup|pho\b|udon|soba', 'pho'), (r'noodle|lo mein|chow mein|pad', 'lo mein'),
           (r'fried rice|pilaf|biryani|paella|risotto|jambalaya|rice', 'fried rice'), (r'curry|masala|korma|vindaloo', 'curry'),
           (r'soup|stew|chowder|bisque|gumbo|borscht|broth', 'chicken noodle soup'), (r'salad', 'salad'), (r'pasta|spaghetti|lasagn|ravioli|gnocchi|penne|macaroni', 'spaghetti and meatball'),
           (r'dumpling|gyoza|wonton|pierogi|momo|bao|bun', 'dumpling'), (r'cake|torte|gateau', 'cake'), (r'cheesecake', 'cheesecake'), (r'pie|tart|cobbler|crisp|crumble', 'apple pie'),
           (r'cookie|biscuit|shortbread|macaron', 'cookie'), (r'doughnut|donut|beignet|fritter|churro|berliner|cruller', 'doughnut'), (r'ice cream|gelato|sundae|frozen|split|parfait|sorbet', 'ice cream'),
           (r'pudding|custard|flan|mousse|panna cotta', 'pudding'), (r'bread|roll|loaf|bun|focaccia|naan|flatbread|pita', 'bread'), (r'pancake|crepe|blini', 'pancake'), (r'waffle', 'waffle'),
           (r'chicken|wing|poultry|duck|turkey', 'chicken'), (r'beef|steak|brisket|veal|bulgogi', 'steak'), (r'pork|ham|bacon|ribs?\b|sausage|chorizo', 'pork'),
           (r'lamb|mutton|goat', 'lamb'), (r'fish|salmon|tuna|cod|ceviche|sashimi|trout', 'fish'), (r'shrimp|prawn|crab|lobster|clam|oyster|mussel|scallop|squid|octopus', 'shrimp'),
           (r'egg|omelet|frittata|quiche', 'scrambled egg'), (r'tofu', 'tofu'), (r'bean|lentil|dal|dhal|chickpea|hummus|falafel', 'bean'), (r'potato|fries|hash|latke', 'french fry'),
           (r'candy|chocolate|fudge|truffle|toffee|brittle', 'chocolate'), (r'cracker|chip|crisp', 'chip'), (r'muffin|scone', 'muffin'), (r'smoothie|shake|lassi', 'smoothie')]
def resolve(name):
    food, conf, how = D.lookup(name)
    good = food is not None and conf >= .6 and not how.endswith('(partial)')
    if not good:
        for pat, alias in GENERIC:
            if re.search(pat, name, re.I):
                g, gc, gh = D.lookup(alias)
                if g: return g, min(.55, gc), f'generic:{alias}'
    if food is None:
        return None, 0, 'none'
    return food, conf, how
out = {}
for i, name in enumerate(labels()):
    if i == 0: continue
    f, c, how = resolve(name)
    if f is None: continue
    g, portion = default_serving(f)
    out[str(i)] = {'label': name, 'usdaId': f.id, 'usda': f.desc, 'match': how, 'matchConfidence': round(c, 2), 'servingG': round(g), 'portion': portion}
for k, name in HEAD.items():
    f, c, how = resolve(name)
    g, portion = default_serving(f)
    out['head:' + k] = {'label': name.title(), 'usdaId': f.id, 'usda': f.desc, 'match': how, 'matchConfidence': round(c, 2), 'servingG': round(g), 'portion': portion}
json.dump(out, open('footprint_ai/data/label_nutrition.json', 'w'), indent=0)
n = len(labels()) - 1
print('mapped', sum(1 for k in out if not k.startswith('head')), 'of', n, '| direct', sum(1 for k, v in out.items() if not v['match'].startswith('generic')), '| generic', sum(1 for v in out.values() if v['match'].startswith('generic')))
