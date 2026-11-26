# Footprint AI: what it is, how to run it, how well it works

There are two Python servers. The app talks to both on your Wi-Fi.

| Server | Port | Features | Start |
| --- | --- | --- | --- |
| Rep tracker (`server/app.py`) | 9002, behind the Metro proxy | Push-ups, squats and curls counted from the camera; battles; boxing | `npm run start:reps` (also starts the AI server) |
| Footprint AI (`footprint_ai/server.py`) | 9001 | Food photo, meal text, body fat and muscle photos | `npm run start:ai` |

## Setup (Windows PowerShell; on macOS or Linux use `.venv/bin/python`)

```powershell
python -m venv .venv                                     # Python 3.10-3.13
.\.venv\Scripts\python.exe -m pip install -r server/requirements.txt
.\.venv\Scripts\python.exe -m server.download_model     # pose model; falls back to the copy inside mediapipe
npm run start:reps                                        # rep server + AI server + Expo
```

The phone must be on the same Wi-Fi as the computer. The app reaches the AI
server at `ws://<Metro host>:9001`. To point it somewhere else, set
`EXPO_PUBLIC_AI_SERVER_URL`, for example `wss://ai.example.com`. For anything
outside your home network, also set `FOOTPRINT_AI_TOKEN` on the server and
`EXPO_PUBLIC_AI_TOKEN` in the app.

### Why it "didn't work" before

- **The food, meal-text and body-fat AI pointed at a server that didn't exist.**
  The app expected `ws://<pc>:9001`, which was not in the repo, and fell back
  to a hard-coded IP, `10.18.2.130`. Every food scan showed "AI server
  unreachable". `footprint_ai/` is that server now.
- **The Python install failed on Python 3.13.**
  `server/requirements.txt` pinned `mediapipe==0.10.21` and `numpy<2`, and
  neither has 3.13 wheels. The pins now cover 3.10–3.13. Tests pass on 3.12
  and 3.13.
- **The meal-description screen could throw an error.**
  It called `Keyboard` without importing it. That import is fixed.
- **The muscle-photo "classifier" never looked at the photos.**
  Its scores came from the photo's date order, caption keywords and logged
  weight, so later photos always scored higher. It now analyses the photos.
- **The body-fat fallback faked its results.**
  It added fixed "athletic" modifiers, invented ab descriptions, and always
  reported 94% confidence. It now uses validated equations with an honest
  range.

## What each AI does

### Food photo: `analyze_food`

1. **Base model.** Google's AIY food classifier (MobileNet V1, 2,023 dishes)
   runs on the image twice: once full-frame and once centre-cropped. It
   produces a probability for each dish and a 1,024-number image embedding.
2. **Food / non-food gate.** A logistic model on the embedding. It was trained
   on Food-101 photos against people, gym frames, objects and scenes.
3. **Dish head.** A trained 13-class head covers common dishes the base model
   lacks or confuses: steak, ribs, pizza, beet salad, bread pudding, carpaccio
   and others.
4. **Novelty check.** The head may override the base model only when it is
   confident and the photo resembles its training photos. This stops it
   hijacking dishes it has never seen.
5. **Nutrition.** Every candidate maps to a USDA SR28 food, or to a recipe
   built from USDA ingredients, with a typical serving size. The app receives
   up to five candidates and Small/Regular/Large/Extra-large portion options.
6. **Text hint.** If the user typed a hint ("2 eggs and toast"), the hint is
   used for the nutrition and the photo candidates stay as alternatives.

### Meal text: `describe_food`

The parser understands quantities ("2", "1 1/2", "half a", "200g",
"chicken 200g"), units (cup, tbsp, slice, oz, glass of wine, scoop, bowl),
sizes, typos ("chiken"), filler ("I had") and add-ons ("with honey").

Matching goes through 511 curated aliases first, then a ranked search over all
8,789 USDA SR28 foods. Unknown foods are listed as not recognised; they are
never given made-up numbers.

### Body fat: `estimate_body_fat`

A model **trained on measured body fat**: a degree-3 polynomial ridge regression
fitted to 27,905 NHANES 1999-2006 and 2011-2016 adults whose body fat was measured by DXA (official CDC files; `training/train_body_fat_cdc.py`)
(the clinical reference scan). Inputs: sex, age, height, weight, and waist when
given. One model with waist, one without (`models/body_fat_model.json`,
`training/train_body_fat.py`). It is tested on a held-out 20% and on a
different survey (NHANES 2017-18, 2,148 adults) that it never saw.

- The range is a per-sex 80% conformal interval. It covers 80% of held-out
  people and about 74% on the 2017-18 survey.
- US Navy (needs neck) and RFM are returned in `methodValues` for comparison
  only. Navy was built against underwater weighing, which reads about 5 points
  lower than DXA, so it is not averaged in.
- Muscular users without a waist measurement get a wider range and a prompt to
  add their waist.
- Photo: silhouette features feed the photo-BMI model (below). It flags a photo
  that looks heavier or lighter than the typed weight. If no weight is typed,
  it stands in for the weight with a much wider range.
- `abs`: how likely visible abs are, from the body-fat estimate and its range.
  Bands: men clearly visible under 10%, visible under 13%; women under 16% and
  19%. **It is not read from the pixels**; see Limitations.

### Photo BMI (inside `estimate_body_fat`)

Pipeline:

1. MediaPipe Pose finds the person.
2. The pose network's own segmentation output gives the silhouette.
3. Body widths at shoulder, chest, waist, hip and thigh are measured,
   normalised by torso length.
4. A gradient-boosted model (`models/photo_bmi_gbm.json`, portable JSON trees)
   predicts BMI.

It is trained on 1,120 full-body photos labelled with self-reported height and
weight. A coarse signal, never a replacement for the scale.

### Muscle photos: `analyze_muscle`

1. MediaPipe Pose places a crop box for the muscle group from the user's real
   joint positions.
2. **Bare skin or clothing** is decided by a trained classifier, not a colour
   rule. It is a logistic head on MobileNetV2 embeddings
   (`models/mobilenetv2_embed.onnx` + `models/bare_torso_head.json`), trained
   on 641 hand-labelled abs and chest crops (`training/labels/`,
   `training/train_bare_torso.py`).
   - Shoulders and back use the chest head.
   - Arms and legs keep the colour rule; the response marks it
     `visibilityMethod: "colour rule (not validated)"`.
3. Photos where the region is out of frame or covered are reported as such.
4. The "detail" score ranks surface texture across the user's own photos only.
   It depends on lighting, so it is labelled as relative.
5. For `abs`, pass `body: {gender, age, heightCm, weightKg, waistCm?}` to also
   get `absVisibility` from the body-fat model.

Vascularity cannot be measured from a photo, so it is returned as `null`.

### Rep counter

MediaPipe Pose Landmarker feeds a counting layer whose parameters are fitted
to labelled video. See [rep-counter-training.md](rep-counter-training.md).

## Measured accuracy

Every number below comes from data the model was not fitted on, unless marked
otherwise.

| AI | Test | Result |
| --- | --- | --- |
| Food / non-food gate | 1,646 test images | AUC 1.00; food kept 100%; non-food rejected 99.4% |
| Food / non-food gate | Gym frames never seen in training | 99.2% rejected |
| Food photo, 101 trained dishes (Food-101, 75,750 training photos) | 25,250 Food-101 test photos | **74.6% top-1** with all safeguards (previous 13-dish system on the same photos: 41.1%; Google AIY alone: 37.8%; head alone: 82.9% top-1, 96.1% top-5) |
| Food photo, dishes outside the 101 | Leave-dishes-out (4 folds of ~25 dishes) | 28.6% top-1 vs 37.7% for AIY alone: the head claims 40% of such photos (AIY's answer stays in the candidate list). Stricter safeguards cut this to 15% but drop the 101-dish score to 62%; equal weight on both picked the current setting |
| Meal text | Final held-out set, 30 messy descriptions, first run | **20/30 within 25%**, median error 12% (26/30 after fixing the general issues it exposed) |
| Meal text | Second held-out set, first run | 27/40 within 25%, median error 16% (37/40 after fixes) |
| Rep counter, end to end through the real server at 4 fps | 8 held-out clips | **5/8 exact, 8/8 within ±1 rep** |
| Rep counter, end to end through the real server at 4 fps | 9 fitted clips (in-sample) | 8/9 exact |
| Body fat, no waist | 2,092 held-out NHANES 2005-16 adults (DXA) | **MAE 2.95 pts** (previous model 3.02; CUN-BAE 4.07, Deurenberg 4.64) |
| Body fat, no waist | NHANES 2017-18, 2,442 adults, never used for training | **MAE 3.05** (previous model 3.14; CUN-BAE 4.16) |
| Body fat, with waist | 2,054 held-out NHANES 2005-16 adults (DXA) | **MAE 2.56 pts** (previous model 2.66; RFM 3.01) |
| Body fat, with waist | NHANES 2017-18, never used for training | **MAE 2.66** (previous model 2.77; RFM 3.16) |
| Body-fat 80% range | NHANES 2017-18 | Covers 78-79% of people (previous model 74%) |
| Photo BMI | 1,120 photos, 5-fold CV grouped by height/weight | **MAE 4.3 BMI** (MAPE 16%; guessing the median: 6.3). 3.5 for BMI under 30; 7.0 above 35 |
| Abs region: bare skin vs clothing | 414 hand-labelled crops, 5×5-fold CV | **AUC 0.996, precision 0.97, recall 0.93** (old colour rule: precision 0.24) |
| Chest region: bare skin vs clothing | 227 hand-labelled crops, 5×5-fold CV | AUC 0.94, precision 0.90, recall 0.69 |
| Equations kept for comparison | Published reference values | RFM, Navy and CUN-BAE reproduce them to ±0.3% |

You can reproduce these with:

- `footprint_ai/training/eval_food_vision.py`
- `footprint_ai/training/train_body_fat.py <NHANES.rda> <data_body.rda>`
- `footprint_ai/training/extract_photo_bmi.py` then `train_photo_bmi.py`
- `footprint_ai/training/train_bare_torso.py --dataset <photo set>`
- `footprint_ai/training/run_all_meal.py`
- `server/tests/test_rep_e2e.py`

## Limitations to know

- **The food model covers named dishes better than plain single foods.**
  Grilled chicken breast or a bowl of oatmeal may come back as a related dish.
  The candidates list and the text hint are the fix, and meal text is the most
  reliable way to log basics.
- **The food model does not use a general ImageNet backbone yet.** MobileNetV2
  now ships for the skin classifier and could also feed a food head. A hosted
  vision LLM is the other upgrade path for plain foods.
- **Portion size comes from typical USDA servings.** The photo is not used to
  measure the amount; users adjust it with the portion options.
- **No public dataset pairs body photos with measured body fat**, and none
  labels visible abs. So:
  - Body fat comes from the DXA-trained measurement model.
  - The photo contributes a BMI cross-check.
  - Ab visibility is derived from body fat, not from pixels.
  - To train a real pixel-based ab or physique model, collect labelled user
    photos (abs visible yes/no, ideally with a DXA or tape result).
    `train_bare_torso.py --extra` shows the folder layout. The same embeddings
    plus a logistic head need roughly 300+ labelled photos.
- **DXA vs other methods.** The model predicts what a DXA scan would read. Smart
  scales and calipers typically read lower, so users comparing to those will
  see a gap.
- **Photo BMI is weakest above BMI 35**, and is affected by baggy clothing and
  camera angle. Side-on photos are rejected.
- **Head-on push-ups remain unsupported.** Very dark or occluded videos
  undercount.

## Protocol (WebSocket `ws://host:9001/`; the same operations over HTTP)

```text
-> {"type":"analyze_food","image":"<base64 jpeg>","hint":"optional text"}
<- {"type":"food_analysis_result","success":true,"data":{isFood, dishTitle, confidence(0-1), portion,
     totalCalories,totalProteinG,totalCarbsG,totalFatG, candidates[{id,title,confidence,calories,proteinG,carbsG,fatG,portion,grams,usdaDescription,tags}],
     portionVariants[{label,sublabel,multiplier}], healthScore, dietaryTags[], tips}}
   non-food: data = {isFood:false, confidence(0-100), detectedSubject, error}
-> {"type":"describe_food","description":"2 eggs and toast"}       <- describe_food_result {items[], totals, unmatched[]}
-> {"type":"estimate_body_fat","gender","age","weightKg","heightCm","waistCm?","neckCm?","hipCm?","athleticLevel?","image?"}
<- body_fat_result {bodyFatPercent, bodyFatRange[lo,hi], category, fatMassKg, leanMassKg, confidence, bmi, visualFeatures[], evaluationMethod,
     methodValues{dxaModel, rfm?, usNavy?}, photoBmi{bmi,mae,mape}|null, weightFromPhoto, abs{absVisibility, absVisibleProbability, bodyFatForVisibleAbs, clearlyVisibleBelow, method}, modelVersion}
   (weightKg may be omitted if a clear front-facing full-body image is sent)
-> {"type":"analyze_muscle","muscle":"abs|chest|arms|shoulders|back|legs","photos":[{"id","image","date"}],"body?":{gender,age,heightCm,weightKg,waistCm?}}
<- muscle_analysis_result {photos[{photoId, hasMuscleVisibility, bareSkinProbability, visibilityMethod, cropBox, definitionScore|null, reason}], summary, scoreMeaning,
     absVisibility?, bodyFatPercent?, bodyFatRange?}
HTTP: POST /v1/food/photo  /v1/food/describe  /v1/body-fat  /v1/muscle   GET /health
Errors: {"success":false,"error":"..."}. Limit: 30 requests/min per client (FOOTPRINT_AI_RATE).
```

## Data and model sources

| Source | Licence | Notes |
| --- | --- | --- |
| Google AIY "food_V1" classifier (TF Hub) | Apache 2.0 | Mirrored on GitHub |
| MediaPipe Pose Landmarker Full | Apache 2.0 | |
| USDA SR28 nutrient database | Public domain | |
| Food-101 photos | Not redistributed | Used only to train the head and gate. `food_heads.npz` contains weights and image embeddings, not images. |
| NHANES 1999-2018 DXA body composition (CDC) | Public domain | Official CDC .xpt files; only fitted coefficients ship |
| USDA FNDDS 2021-2023 survey foods | Public domain | `data/fndds.json`: 5,431 dishes with measured nutrients and portions, used for meal text and dish nutrition |
| MobileNetV2-1.0 (ONNX Model Zoo) | Apache 2.0 | Embedding output exposed; used by the skin classifier |
| BMI photo set (`atoms18/BMI-prediction-from-Human-Photograph`) | MIT repo; photos from a public height/weight gallery | Not redistributed; only tree weights and labels of crop indices ship |
| Exercise videos (rep counter) | — | Public GitHub sample clips, listed in `server/training/labels.json` |
