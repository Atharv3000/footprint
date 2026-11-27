# Food scanning: several foods, snacks and brands, labels, receipts, recipes (Nov 2026)

What the Food logging screen can now do, how each part works, and how well it scored. All of it runs on the
Footprint AI server (`footprint_ai/`), on CPU, with no paid API.

| Feature | Where in the app | Server request | Code |
| --- | --- | --- | --- |
| Several foods in one photo, each logged separately | Food mode (automatic) | `analyze_food` | `footprint_ai/multi_food.py`, `scan.py` |
| "Also spotted?" foods to add with one tap | Food mode | `analyze_food` | `multi_food.py` (`suggestions`) |
| Barcodes on packs (snacks, drinks, branded foods) | Label mode: the camera reads the barcode live; also from any photo | `scan_label` (`barcode` or `image`) | `barcode.py`, `products.py` |
| Nutrition Facts panels (US) and per-100 g tables (EU/UK) | Label mode photo | `scan_label` | `label.py`, `ocr.py` |
| Packaged snack recognised from the text on the pack | Food mode (when the dish model is unsure) and Label mode | `analyze_food`, `scan_label` | `scan.py`, `products.py` |
| Brand names when typing ("a bag of doritos", "2 oreos") | Typing | `describe_food` | `food_vision.py` (`_with_brands`) |
| Receipt reader: food bought, with nutrition per serving | Receipt mode | `read_receipt` | `receipt.py` |
| Recipe reader: photo or pasted recipe, nutrition per serving | Recipe mode (photo) or Typing (pasted recipe) | `read_recipe` (`image` or `text`) | `recipe.py` |

The same requests work over the rep server's `/rep-api/ai` route (cloud and Expo tunnel) and as HTTP on the AI
server (`/v1/food/label`, `/v1/food/receipt`, `/v1/food/recipe`).

## Data and models added

- **Open Food Facts** (ODbL): the 250,000 most-scanned products with a barcode and plausible per-100 g
  nutrition (`data/products.sqlite.gz`, 23 MB; unpacked on first use). Built by `training/build_products.py` from
  the full 4.9 M-row export. Rows whose calories do not match their macros (kJ typed as kcal and similar errors)
  are dropped. Product results say "Label values from Open Food Facts", which is the attribution the ODbL asks for.
- **RapidOCR** (Apache-2.0): PP-OCR text detection and recognition models run with ONNX Runtime. They ship
  inside the `rapidocr` wheel, so nothing is downloaded at run time.
- **Multi-item scorer** (`models/multi_item.json`): a small logistic model trained on 1,500 composed table scenes.
- **USDA pantry aliases**: 100+ baking and pantry names (flour, baking soda, brown sugar, chocolate chips…).
  Before this, "chocolate chips" matched potato chips and "baking soda" matched cola.

## Results

### Nutrition labels (`training/eval_label_reader.py`, `training/label_reader_results.json`)

Rendered US panels and EU tables in 8 fonts, degraded like phone photos (tilt up to 6°, blur, JPEG, shading,
backgrounds). Seeds 0–199 were used while writing the parser; the 150 test labels (seeds 10000+) were never looked at.

| | All fields right | Calories | Fat | Carbs | Protein | Sodium | Serving size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Held-out test (150) | **89%** | **100%** | 98% | 100% | 99% | 96% | 100% |

The first version scored 70% on the dev labels. Most errors came from tilted photos, where text rows merged.
Deskewing the OCR layout (`ocr.py`) fixed this, and it helps receipts and recipes too.

### Receipts (`training/eval_receipts.py`, `training/receipt_results.json`)

CORD v2 test receipts (real photos of shop and restaurant receipts, CC-BY-4.0). Receipts 0–49 were used while
writing the parser; 50–99 are held out.

| | Item precision | Item recall | F1 | Quantity right | Whole receipt exact |
| --- | --- | --- | --- | --- | --- |
| Held-out (50 receipts) | 0.85 | 0.84 | **0.85** | 0.92 | 66% |

CORD receipts are Indonesian, so many item names will not match a USDA food or product. Matching is checked
on US grocery lines in the tests (for example "ORG BNLS CHKN BRST" becomes "organic boneless chicken breast").
Non-food lines (bags, paper towels…) are left out.

### Several foods in one photo (`training/train_multi_item.py`, `training/multi_item_results.json`)

Test scenes: 700 scenes built from Food-101 test photos of dish classes the scorer never trained on. They are
2–4 dishes on separate plates, 2–3 dishes sharing one plate, or one unmodified photo.

| | Item precision | Item recall | F1 |
| --- | --- | --- | --- |
| Before (one answer per photo) | 0.48 | 0.23 | 0.31 |
| **Now (auto-split items)** | **0.76** | **0.48** | **0.59** |
| Now, items + "also spotted" suggestions (recall) | | 0.65 | |

- **Single dishes:** a single-dish photo stays one item 93% of the time.
- **Separate plates vs a shared plate:** separate plates (dish recall 0.47) work much better than several
  foods on one plate (0.35).
- **Proposals:** besides grid windows, the detector looks at "object proposals". These are plates and bowls
  that stand out from the table, plus colour regions inside a big plate.
- **What limits it:** the dish classifier itself. In about 30% of cases, no window names the true dish.

### Branded products from typed text

- "2 oreos" is counted as two cookies (the label's per-cookie weight), not two packs.
- "a bag of …" uses the pack size.
- Plain foods ("banana", "greek yogurt") stay with USDA. A product is used only when the text names its brand.
- The three USDA meal-text benchmarks are unchanged: 69/69, 37/40 and 26/30 within 25%.

### Recipes

- **Servings:** read from "Serves 4–6", "Makes 5 dozen", "Yield: 12".
- **Cleanup:** preparation notes are removed ("softened", "(2 sticks)", "drained and rinsed"). Can sizes are
  multiplied out ("2 (15 oz) cans" = 30 oz). "Salt and pepper to taste" counts as nothing.
- **Check:** the Toll House cookie recipe gives 75–110 kcal per cookie, as the tests check (published: about 100).

## Limits

- **Labels:** the label and pack-text results come from rendered images. Real packaging adds glare, curved
  bags and unusual layouts. Barcodes are the most reliable route; the camera reads them natively in Label mode.
- **Product database:** it holds the 250,000 most-scanned products worldwide. Regional or new products may be
  missing; then the app asks for a photo of the label.
- **Photo snacks without a barcode:** packs are found from their printed text. Loose snacks (chips in a bowl)
  are named by the dish model, which knows some snacks (cookies, doughnuts, protein bars…) but not all.
- **Multi-item numbers:** these come from composed scenes. Real meals overlap, have sauces and mixed dishes,
  so expect lower numbers. The app shows each found food with a remove button, plus "also spotted" suggestions.
- **Portions:** every found food uses a typical USDA serving. The quantity stepper and item list are there to fix it.
