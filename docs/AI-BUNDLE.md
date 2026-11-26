# Footprint AI bundle

Only the AI parts of Footprint: servers, models, data, tests and the app-side
client files. Copy each path to the same place in the project (or into
another system that follows the same contracts).

| Path | What it is | Changed? |
| --- | --- | --- |
| `footprint_ai/` | Python package: food photo, meal text, body fat, photo BMI, ab visibility, muscle photos, AI server (port 9001). Models and data included. | New |
| `footprint_ai/models/aiy_food_v1.tflite` + `food_heads.npz` | Google AIY food classifier plus the trained gate and dish head | New |
| `footprint_ai/models/body_fat_model.json` | Body-fat model trained on 14,457 DXA-measured adults (MAE 2.4–2.7 pts held-out, 2.8–3.1 on a different survey) | New |
| `footprint_ai/physique.py` + `models/photo_bmi_gbm.json` | Silhouette measurements and photo-BMI model (CV MAE 4.3 BMI); ab visibility from body fat | New |
| `footprint_ai/models/mobilenetv2_embed.onnx` + `bare_torso_head.json` | Trained bare-skin vs clothing classifier for abs and chest crops (abs: AUC 0.996, precision 0.97) | New |
| `footprint_ai/data/usda_sr28.json`, `food_aliases.json`, `label_nutrition.json` | USDA nutrition database, curated names and recipes, dish-to-nutrition map | New |
| `footprint_ai/training/` | Scripts and benchmark sets that rebuild and re-evaluate everything | New |
| `footprint_ai/tests/` | 44 tests (`python -m pytest footprint_ai/tests`) | New |
| `server/counter.py`, `server/rep_training.py`, `server/training/` | Rep counter with fitted parameters, training pipeline and labels | Updated |
| `server/requirements.txt`, `server/download_model.py` | Installs on Python 3.10–3.13; pose model fallback | Updated |
| `server/vision.py`, `server/pose_geometry.py`, `server/backtest.py` | Pose input path used by the rep counter | Unchanged (needed) |
| `server/tests/*` | Counter unit tests and end-to-end video replay test | Updated / new |
| `constants/aiServer.ts` | One place for the AI server URL, token and request helper | New |
| `constants/foodVisionAI.ts` | Food photo and text client (no hard-coded IP) | Updated |
| `constants/foodTextMatcher.ts` (+ `foodDatabase.ts`) | Offline meal-text fallback | New |
| `constants/muscleIsolationAI.ts` | Real muscle-photo analysis via the server (replaces the fake scores); optional body stats add ab visibility | Rewritten |
| `constants/bodyFatEquations.ts` + `bodyFatModel.json` | Same DXA-trained body-fat model on-device (output identical to the server), plus ab visibility | New |
| `constants/repTrackerProtocol.ts` | Rep server client | Unchanged (needed) |
| `components/AIDescribeFoodModal.tsx` | Fixes the missing `Keyboard` import | 1-line fix |
| `components/BodyFatScannerModal.tsx` | Offline fallback uses the validated equations | Small edit |
| `components/ProgressPhotoGalleryModal.tsx` | Hides the score badge when a score is `null` | Small edit |
| `scripts/ai-dev.cjs`, `scripts/rep-dev.cjs` | `npm run start:ai`; `start:reps` now also starts the AI server | New / updated |

Add these to `package.json` `scripts`:

```json
"start:ai": "node scripts/ai-dev.cjs",
"test:ai": "python -m pytest -q footprint_ai/tests",
"train:reps": "python -m server.rep_training fit --cache .rep-cache",
"eval:reps": "python -m server.rep_training evaluate --cache .rep-cache",
"test:food-matcher": "node --test scripts/test-food-text-matcher.cjs"
```

Read `docs/AI.md` first: it covers setup, the protocol, accuracy and limitations.

## Porting to another system

- **Run as a service (simplest).** Run `python -m footprint_ai.server`
  anywhere and call it from any client:
  - over WebSocket, with the JSON messages in `docs/AI.md`;
  - over HTTP: `POST /v1/food/photo`, `/v1/food/describe`, `/v1/body-fat`,
    `/v1/muscle`.
- **Use as a library.**
  - `from footprint_ai.food_vision import analyze_food, describe_food`
  - `from footprint_ai.body_metrics import estimate_body_fat`
  - `from footprint_ai.muscle import analyze_muscle`
  - `from footprint_ai.physique import silhouette_features, predict_photo_bmi, ab_visibility`
- **Models without Python.** `body_fat_model.json` (polynomial coefficients) and
  `photo_bmi_gbm.json` (decision trees) are plain JSON. `bodyFatEquations.ts`
  shows the 30-line evaluator, and `physique._tree_value` shows the tree one.
  - `from server.counter import RepCounter`
- **Keep the data files with the code.** The models and `data/*.json` are
  loaded by path relative to the package.
- **Do not replace the USDA numbers with model-generated ones.** The nutrition
  values are traceable to USDA SR28 entries, and the `usdaDescription` field
  says which.
