"""Barcodes, branded products, nutrition labels, receipts, recipes and multi-item photos."""
import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from footprint_ai import products
from footprint_ai.barcode import read_barcodes, valid_ean
from footprint_ai.label import parse_label, read_label_text
from footprint_ai.multi_food import proposals, windows
from footprint_ai.receipt import expand, extract_items, match_food, prices
from footprint_ai.recipe import clean_line, find_servings, read_recipe
from footprint_ai.server import app
from footprint_ai.tests.render import ean13, text_image

LAYS = '0028400090858'  # Lay's Classic Potato Chips (US), in the Open Food Facts subset


def b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=90)
    return base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(scope='module')
def client():
    with TestClient(app) as c:
        yield c


def ws_call(client, msg):
    with client.websocket_connect('/') as ws:
        ws.send_json(msg)
        return ws.receive_json()


# ---------------------------------------------------------------- barcodes and products

def test_check_digit():
    assert valid_ean(LAYS) and valid_ean('5449000000996') and not valid_ean('5449000000997')


def test_barcode_is_read_from_a_drawn_code():
    assert [c.lstrip('0') for c in read_barcodes(ean13(LAYS))] == [LAYS.lstrip('0')]


def test_barcode_lookup_and_search():
    p = products.by_barcode(LAYS)
    assert p and 'lay' in p.brand.lower() and 500 < p.kcal < 600
    assert products.by_barcode('0000000000000') is None
    top = products.search('quest protein bar cookies and cream', 1)
    assert top and 'quest' in top[0][1].title.lower()


def test_brand_only_when_named():
    assert products.branded('doritos nacho cheese') is not None
    assert products.branded('banana') is None  # plain foods stay with USDA


def test_typed_snacks_use_products():
    from footprint_ai.food_vision import describe_food
    r = describe_food('2 oreos and a glass of milk')
    names = [i['name'].lower() for i in r['items']]
    assert any('oreo' in n for n in names) and len(r['items']) == 2
    oreo = next(i for i in r['items'] if 'oreo' in i['name'].lower())
    assert 80 <= oreo['calories'] <= 200  # two cookies, not two 3-cookie servings
    r = describe_food('kind bar dark chocolate nuts and sea salt')
    assert len(r['items']) == 1 and 150 < r['totalCalories'] < 260


# ---------------------------------------------------------------- nutrition labels

US_LABEL = """Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g"""


def test_us_label_text():
    n = parse_label(US_LABEL)
    assert n['calories'] == 230 and n['fatG'] == 8 and n['carbsG'] == 37 and n['proteinG'] == 3
    assert n['sugarG'] == 12 and n['addedSugarG'] == 10 and n['fiberG'] == 4 and n['sodiumMg'] == 160
    assert n['servingSizeG'] == 55 and n['servingsPerContainer'] == 8
    assert read_label_text(US_LABEL)['macrosAgree']


def test_eu_label_is_scaled_to_a_serving():
    text = "Nutrition\nTypical values Per 100g Per serving (30g)\nEnergy 1046kJ / 250kcal\nFat 12g\nof which saturates 3g\n" \
           "Carbohydrate 30g\nof which sugars 5g\nFibre 2g\nProtein 5g\nSalt 0.5g"
    r = read_label_text(text)
    assert r['fields']['basis'] == 'per100g' and r['fields']['calories'] == 250 and r['fields']['sodiumMg'] == 200
    assert r['perServing']['calories'] == 75 and r['perServing']['fatG'] == 3.6


def test_ocr_slips_are_repaired():
    n = parse_label('Calories 120\nTotal Fat 5q 6%\nTotal Carbohydrate 1Og 4%\nProtein 89 16%')
    assert n['fatG'] == 5 and n['carbsG'] == 10 and n['proteinG'] == 8


def test_label_photo_end_to_end(client):
    img = text_image(US_LABEL.split('\n'), size=28, width=620, bold_first=True)
    r = ws_call(client, {'type': 'scan_label', 'image': b64(img)})
    assert r['type'] == 'label_scan_result' and r['success'], r
    d = r['data']
    assert d['totalCalories'] == 230 and d['totalProteinG'] == 3 and d['isLabel']


def test_barcode_number_needs_no_photo(client):
    r = ws_call(client, {'type': 'scan_label', 'barcode': LAYS})
    assert r['success'] and r['data']['isProduct'] and r['data']['items'][0]['barcode'] == LAYS.lstrip('0')
    r = ws_call(client, {'type': 'scan_label', 'barcode': '4006381333931'})  # a pen, not food
    assert r['success'] is False and 'database' in r['error']


# ---------------------------------------------------------------- receipts

def test_prices_and_quantities():
    assert prices('MILK 2% GAL 3.49 F') == [3.49]
    assert prices('2 @ 1.50  3.00') == [1.5, 3.0]
    assert prices('Nasi Goreng 25,000') == [25000.0]


def test_grocery_receipt_rows():
    rows = ['WALMART SUPERCENTER', 'ST# 1234 OP# 0001 TE# 07', '06/21/26 14:32', 'GV WHL MLK 1GAL 3.48 N', 'BANANAS 1.24 N',
            '2 @ 0.99', 'YOPLAIT YGRT 1.98 N', 'ORG BNLS CHKN BRST 9.87 N', 'PAPER TOWELS 6.97 X', 'SUBTOTAL 23.54', 'TAX 0.49',
            'TOTAL 24.03', 'VISA TEND 24.03']
    items = extract_items(rows)
    names = [i['name'] for i in items]
    assert names[:2] == ['GV WHL MLK 1GAL', 'BANANAS'] and len(items) == 5, names
    assert expand('ORG BNLS CHKN BRST') == 'organic boneless chicken breast'
    assert match_food('PAPER TOWELS') is None
    assert match_food('BANANAS')['calories'] > 50
    assert 'chicken' in (match_food('ORG BNLS CHKN BRST')['usdaDescription'] or '').lower()


def test_restaurant_receipt_with_wrapped_name():
    rows = ['Mozarella Hot 38,000', 'Dog', 'Chili Pepper 14,000', 'Croquette', 'Subtotal 52,000', 'TOTAL Rp. 52,000']
    items = extract_items(rows)
    assert [i['name'] for i in items] == ['Mozarella Hot Dog', 'Chili Pepper Croquette']


def test_receipt_photo_end_to_end(client):
    img = text_image(['FRESH MARKET', '06/21/26 14:32', 'BANANAS            1.24', 'GREEK YOGURT       4.99',
                      'WHOLE MILK         3.48', 'SUBTOTAL           9.71', 'TOTAL              9.71'], size=26, width=620)
    r = ws_call(client, {'type': 'read_receipt', 'image': b64(img)})
    assert r['type'] == 'receipt_result' and r['success'], r
    names = ' '.join(i['name'].lower() for i in r['data']['items'])
    assert 'banana' in names and 'yogurt' in names and 'milk' in names and r['data']['isReceipt']


# ---------------------------------------------------------------- recipes

COOKIES = """Chocolate Chip Cookies
Makes about 5 dozen cookies
INGREDIENTS
2 1/4 cups all-purpose flour
1 teaspoon baking soda
1 teaspoon salt
1 cup (2 sticks) butter, softened
3/4 cup granulated sugar
3/4 cup packed brown sugar
1 teaspoon vanilla extract
2 large eggs
2 cups (12-oz. pkg.) semi-sweet chocolate morsels
DIRECTIONS
Preheat oven to 375 F.
Combine flour, baking soda and salt in small bowl."""


def test_recipe_servings_and_cleaning():
    assert find_servings(['Makes about 5 dozen cookies'])[0] == 60
    assert find_servings(['Serves 4-6'])[0] == 5
    assert find_servings(['Yield: 12 muffins'])[0] == 12
    assert clean_line('1 cup (2 sticks) butter, softened') == '1 cup butter'
    assert clean_line('2 (15 oz) cans black beans, drained and rinsed') == '30 oz black beans'
    assert clean_line('2 T chili powder') == '2 tbsp chili powder'


def test_cookie_recipe_per_cookie():
    r = read_recipe(COOKIES)
    assert r['servings'] == 60 and len(r['ingredients']) == 9 and not r['unmatched']
    descs = ' '.join((i['usdaDescription'] or '').lower() for i in r['ingredients'])
    assert 'semisweet chocolate' in descs and 'potato chips' not in descs and 'carbonated' not in descs
    assert 75 <= r['perServing']['calories'] <= 110  # Toll House: ~100 kcal per cookie


def test_to_taste_seasoning_adds_nothing():
    r = read_recipe('Chili\nServes 4\n- 1 lb lean ground beef\n- 1 (28 oz) can crushed tomatoes\n- salt and pepper to taste')
    salt = r['ingredients'][-1]
    assert salt['grams'] == 0 and r['total']['sodiumMg'] < 2000
    assert 'crushed' in r['ingredients'][1]['usdaDescription'].lower()


def test_recipe_without_ingredients_is_an_error():
    with pytest.raises(ValueError):
        read_recipe('Preheat the oven.\nBake for 20 minutes.')


def test_recipe_text_and_photo_routes(client):
    r = ws_call(client, {'type': 'read_recipe', 'text': COOKIES})
    assert r['type'] == 'recipe_result' and r['success'] and r['data']['isRecipe'] and r['data']['servings'] == 60
    img = text_image(['Pancakes', 'Serves 4', 'Ingredients', '2 cups all-purpose flour', '2 tablespoons sugar',
                      '2 teaspoons baking powder', '1 3/4 cups milk', '2 large eggs', '3 tablespoons melted butter'], size=26, width=640)
    r = ws_call(client, {'type': 'read_recipe', 'image': b64(img)})
    assert r['success'], r
    assert r['data']['servings'] == 4 and 300 <= r['data']['totalCalories'] <= 550


# ---------------------------------------------------------------- multi-item photos

def test_windows_and_proposals_cover_the_photo():
    ws = windows(640, 480)
    assert len(ws) >= 8 and all(0 <= x0 < x1 <= 640 and 0 <= y0 < y1 <= 480 for x0, y0, x1, y1 in ws)
    img = Image.new('RGB', (640, 480), (150, 120, 90))
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    d.ellipse((40, 60, 280, 300), fill=(240, 200, 60))
    d.ellipse((360, 150, 600, 390), fill=(60, 160, 60))
    boxes = proposals(img)
    assert len(boxes) >= 2  # one box per plate
    centers = sorted(((b[0] + b[2]) / 2 for b in boxes[:2]))
    assert centers[0] < 320 < centers[1]
