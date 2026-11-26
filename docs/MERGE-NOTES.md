# How this project was put together (Nov 25, 2026)

Base: **footprint-main (2).zip** (newest UI: log, nutrition, profile, food logging,
steps charts, workout carousel/start panel, onboarding changes).

On top of it, everything from **footprint-ai-bundle.zip** (= footprint-ai-code.zip
plus the two model zips), which holds the trained AI:

| AI | Source kept | Why |
| --- | --- | --- |
| Rep counter | `server/counter.py` + fitted params (same in all versions) | identical everywhere |
| Food photo | `footprint_ai/` (AIY food classifier + trained gate and dish head + USDA) | (2) had replaced it with a colour/edge heuristic that guessed dishes from photo colours |
| Meal text | `footprint_ai/` USDA parser, with on-device fallback | same |
| Body fat | DXA-trained model (`footprint_ai/models/body_fat_model.json`, TS port in `constants/bodyFatEquations.ts`) | (2) still had Navy/Deurenberg formulas with made-up "athletic" offsets |
| Photo BMI, bare-skin heads, ab visibility | `footprint_ai/` | only in the bundle |
| Muscle photos | `constants/muscleIsolationAI.ts` from the bundle | (2) had fake scores |

What changed while merging:

- `server/food_ai.py` (added in (2) for the `/rep-api/food-*` routes) now calls the
  trained `footprint_ai` models instead of the colour heuristic. The routes stay,
  so food AI also works through the Metro proxy / Expo tunnel.
- `constants/foodVisionAI.ts`: tries the AI server directly (port 9001), then the
  `/rep-api` proxy. If neither answers, a photo says "AI server unreachable"
  instead of inventing a meal (the (2) version showed a fake "chicken salad").
  Text falls back to the on-device index, labelled "Offline estimate".
- `BodyFatScannerModal.tsx`: shows the likely range, ab visibility, photo BMI and
  the Navy/RFM comparison. Missing age/weight are no longer replaced with 26 y / 70 kg
  before sending, so the server can use the photo-BMI model when weight is unknown.
- `ProgressPhotoGalleryModal.tsx`: passes profile sex/height/weight so the abs view
  shows ab-visibility probability.
- `package.json`: added `start:ai`, `test:ai`, `train:reps`, `eval:reps`, `test:food-matcher`.
- `server/tests/test_food_ai.py`: rewritten to test the real models.

Read `docs/AI.md` for accuracy numbers and limits, `docs/AI-BUNDLE.md` for the file list.

## Hosting (added after the merge)

- The rep server now also serves every AI feature at `POST /rep-api/ai`
  (`{"type": "analyze_food" | "describe_food" | "estimate_body_fat" | "analyze_muscle", ...}`),
  behind the same Supabase login check as the rep tracker. It loads the models in the
  background at startup (`FOOTPRINT_AI_WARMUP=0` turns that off).
- `Dockerfile` copies `footprint_ai/`, so one Railway/Render service runs everything.
- `constants/aiServer.ts` `aiRequest()` picks the route:
  - cloud build (`EXPO_PUBLIC_REP_SERVER_URL` set): straight to `/rep-api/ai`
  - local: AI server on port 9001 first, then `/rep-api/ai` through the Metro proxy (works over `--tunnel`)
- `BodyFatScannerModal.tsx` now uses `aiRequest()` too (it had its own WebSocket code).
- Memory: the AI models plus MediaPipe need more than a 512 MB free instance. Not measured;
  plan on a 1–2 GB instance.

## Retrained on more data (Nov 26, 2026)

| Model | New data | Result on data it never saw |
| --- | --- | --- |
| Body fat | All NHANES DXA surveys 1999-2016 (27,905 adults, official CDC files) | NHANES 2017-18: 3.05 / 2.66 pts (was 3.14 / 2.77); 80 % range covers 78-79 % (was 74 %) |
| Food photo | Food-101: 101 dishes x 1,000 photos; head grows from 13 to 101 dishes | Same 25,250 test photos: 74.6 % top-1 (old system 41.1 %, AIY alone 37.8 %) |
| Meal text | USDA FNDDS (5,431 dishes) for phrases the old database could not match, + 16 new recipes | Old benchmarks unchanged (69/69, 37/40, 26/30); e.g. beef stroganoff 73 -> 384 kcal |

Trade-off: photos of food outside the 101 dishes are now claimed by the head 40 % of the time (28.6 % right vs 37.7 % for AIY alone); AIY's answer stays in the candidate list.
Bugs fixed on the way: meal-search ties depended on Python's hash order (same food, different calories per server start); "filet mignon" was parsed as "a fillet of mignon".

Rebuild (data folders are not in the repo):
```
python -m footprint_ai.training.train_body_fat_cdc <folder with DXX/DEMO/BMX .xpt> --old <previous model json> --write
python -m footprint_ai.training.build_fndds <FoodData_Central_survey_food_csv folder>
python footprint_ai/training/build_aliases.py
python -m footprint_ai.training.extract_food101 <food-101 folder> food101_feats.npz --workers 4
python -m footprint_ai.training.map_food101 <food-101 folder>
python -m footprint_ai.training.train_food101_head food101_feats.npz --C 0.05 --old <previous food_heads.npz> --write
```
Copy footprint_ai/models/body_fat_model.json to constants/bodyFatModel.json after retraining body fat.
