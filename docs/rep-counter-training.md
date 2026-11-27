# Rep counter training: 2026-11-24

## What was trained

The pose network (Google's MediaPipe Pose Landmarker Full) is used unchanged.
Retraining it would need tens of thousands of labelled body-keypoint images and
would not address where counts were going wrong. The **counting layer** on top
of it, `server/counter.py`, is now parameterised and fitted to labelled exercise
video by `server/rep_training.py`. The fitted values ship in
`server/training/rep_counter_params.json` and load automatically. Without that
file, the built-in defaults are used.

## Changes to the counting logic

These were found by replaying labelled clips and reading the counter's
decisions frame by frame:

| Exercise | Problem in the previous counter | Change |
| --- | --- | --- |
| Push-ups | Depth was measured in raw screen units. If the user drifted slightly toward or away from the phone, the calibrated "top" was never reached again and counting stopped. | Shoulder-to-wrist drop is now measured in arm lengths, so it does not depend on distance from the phone. |
| Push-ups | In profile, MediaPipe often swaps the left/right label of the near arm. Each swap discarded the calibration and the rep in progress. | The arm is now identified by its horizontal shoulder position, and a swapped label is relabelled instead of reset. |
| Push-ups | Calibration needed 3 straight-arm frames, which takes about 0.75 s at 4 fps. | The number of calibration frames is now a fitted parameter (fitted value: 2). |
| Squats | Only the knee angle was used. Front-on squats foreshorten the knee, so they never reached 100° and counted **0**. | The hip drop relative to standing leg length can now also mark the bottom. An upright gate rejects push-ups, planks and sit-ups. |
| Curls | The angles of both arms were averaged, so alternating dumbbell curls counted **0**. | Each arm now has its own state machine. Reps finishing on both arms within `merge_s` count once (barbell or two dumbbells). |
| Curls | Shoulder presses and pull-ups counted as curls (13 phantom reps across the negative clips). | Three gates were added. The elbows must hang below the shoulders. The hand must rise above the elbow. The hips must stay still (squats and jumps are rejected). |

## Data

`server/training/labels.json` lists every clip with its source, view and
manual reference count, cross-checked against an offline dense-signal counter.
All clips are public sample videos from GitHub repositories:

- shreyanshsatvik/personal_trainer-using-mediapipe
- vinvinz/Machine-Learning-Exercise-Counting-Classification
- RiccardoRiccio/Fitness-AI-Trainer-With-Automatic-Exercise-Recognition-and-Counting
- Kedyi/AI_trainer
- airscholar/AI-Workout-Manager
- Gangadharbhuvan/AI-Gym-with-OpenCV

The provenance of the underlying footage was not independently verified.
Videos and landmark caches are not committed.

| Exercise | Fit + test clips | Held-out test clips | Hard / unsupported (report only) |
| --- | ---: | ---: | ---: |
| Push-ups | 13 | 5 | 3 (head-on views) |
| Squats | 11 | 4 | 0 |
| Bicep curls | 2 | 0 (leave-one-out instead) | 2 (very dark gym; seated, occluded) |

There are 34 negative clips that must count 0: planks, sit-ups, jumping jacks,
pull-ups, crunches, shoulder press, football juggling, a no-person food clip,
and each exercise's clips used as negatives for the other two exercises.

For push-ups, "expected" counts the reps after the first straight-arm hold,
because the app calibrates on that hold. `expected_total` keeps every visible
rep wherever the two differ.

## Training procedure

1. **Extract.** Each clip is decoded through the app's real path: resize to
   640 px, JPEG quality 50, then `Vision.analyze`. Landmarks are cached at about
   12 fps.
2. **Simulate capture.** Landmarks are replayed through `RepCounter` under
   13 capture scenarios:
   - 4, 3 and 2.2 fps
   - random 2–4.5 fps with ±25% timing jitter
   - landmark noise, dropped frames, mirrored bodies, and reps 0.75–1.35× faster or slower
3. **Score.** The loss is relative count error on the positive clips plus
   1.5 × phantom reps on the negative clips, plus a small prior toward the
   defaults.
4. **Constrain.** Hysteresis guards keep the up/down thresholds apart. This
   stops the fit from overfitting a few clips with knife-edge thresholds.
5. **Search.** Random search, then local refinement (300 iterations per fit).
6. **Report, then refit.** Generalisation is reported on test clips the fit
   never saw. The shipped parameters are then refitted on all labelled clips.

## Results

Held-out test clips (fitted on training clips only, averaged over the 13 capture
scenarios):

| Exercise | Previous defaults | Fitted |
| --- | --- | --- |
| Push-ups (5 clips) | MAE 2.20 reps/clip, 17% exact | MAE 1.28 reps/clip, 49% exact |
| Squats (4 clips) | MAE 0.19, 83% exact (after the logic fixes) | MAE 0.10, 90% exact |
| Curls (leave-one-out, 2 clips) | MAE 0.27, 77% exact | MAE 0.27, 77% exact |

All labelled clips, by frame rate. This compares the original counter, the new
logic with default parameters, and the new logic with fitted parameters. The
fitted column is **in-sample**, so use the held-out table above for
generalisation. `ph` is the total phantom reps across all negative clips.

| Exercise | fps | Original | New logic | New logic + fitted |
| --- | ---: | --- | --- | --- |
| Push-ups | 4 | MAE 1.40, 42% exact | MAE 1.22, 40% exact | MAE 0.38, 77% exact |
| Push-ups | 2.2 | MAE 1.98, 8% exact | MAE 1.97, 6% exact | MAE 0.77, 62% exact |
| Squats | 4 | MAE 1.64, 25% exact | MAE 0.16, 84% exact | MAE 0.15, 85% exact |
| Squats | 2.2 | MAE 2.69, 2% exact | MAE 0.44, 58% exact | MAE 0.31, 69% exact, ph 2.0 |
| Curls | 4 | MAE 1.20, 30% exact, ph 13 | MAE 0.00, 100% exact, ph 0 | MAE 0.00, 100% exact, ph 0 |

## Update: 2026-11-26 (faster and more accurate)

### Faster

| Change | Where | Effect |
| --- | --- | --- |
| The phone takes the next photo while the previous one is uploading and being analysed, instead of waiting for the answer first. | `components/CameraFormTrackerModal.tsx` | Camera and network work in parallel, so good connections reach up to 6 frames per second (one photo every 167 ms at most, `MIN_CAPTURE_GAP_MS`) instead of about 4. The cap matches the 2–6 fps range the counter was trained on. A held photo older than 1 s is dropped, so feedback stays current. |
| Each user's working rotation is remembered. A lying body (push-ups, planks) used to run the pose network twice per frame: once upright, then once turned sideways. | `server/vision.py` (`_locate`) | Push-up frames went from 1.98 to 1.01 pose runs and from 54 to 29 ms on the server, measured on the same clips. Standing exercises are unchanged at about 27 ms. |
| A pool of pose detectors replaces the single shared lock. | `server/vision.py` | Several users' frames are analysed at once (2 detectors by default; set `REP_POSE_WORKERS` to change). |

### More accurate

- **Capture-time rep timing.** The phone sends `captured_at` with each photo, and the server times reps by when the photo was taken (`frame_time` in `server/app.py`). Previously it used arrival time, so varying upload delay made reps look faster or slower than they were.
- **Tilted planks are no longer rejected.** A phone placed above and in front of the user makes the plank look tilted. The "standing, not a plank" check rejected any torso steeper than about 35°, which threw away good frames mid-set (`vv_pushup9` counted about 2 of 6). That limit is now the fitted parameter `stand_ratio` (fitted value 0.92, about 43°).
- **Refit for the faster loop.** Training scenarios now cover 2–6 fps, using landmarks extracted through the new tracked path. The new parameters were adopted for push-ups and curls. Squats keep the 2026-11-24 fit, which scored better on the same clips.
- **Reproducible evaluation.** Scenario seeds used Python's `hash()` of a string, which changes on every run. They now use CRC32, so scores can be compared between runs. `evaluate` now also includes the test clips.

All labelled train and test clips, averaged over 6 randomised replays per clip. Both columns use the same tracked landmarks. Both parameter sets were fitted on these clips, so this is in-sample.

| Exercise | fps | 2026-11-24 params | 2026-11-26 params |
| --- | ---: | --- | --- |
| Push-ups | 5 | MAE 0.23, 83% exact | MAE 0.09, 91% exact |
| Push-ups | 4 | MAE 0.41, 78% exact | MAE 0.09, 91% exact |
| Push-ups | 3 | MAE 0.42, 77% exact | MAE 0.27, 81% exact |
| Push-ups | 2.2 | MAE 0.59, 63% exact | MAE 0.54, 63% exact |
| Squats | 4 | MAE 0.12, 88% exact | unchanged |
| Curls | 4 | MAE 0.00, phantom 1.0 | MAE 0.00, phantom 0 |

On the 5 held-out push-up clips, the new fit never saw them, but the old parameters had been fitted on them. Even so, the new fit scores MAE 0.71 against 1.07 for the old parameters. In the end-to-end API replay at 4 fps, `pushup2` counts 5/5, `vv_squats-vid-1` counts 9/9, and `vv_pushup9` counts 7 (7 visible reps; the label's 6 excludes the first rep, which has no calibration hold).

Reproduce:

```bash
python -m server.rep_training extract clips/*.mp4 --cache .rep-cache     # prints ms/frame and pose runs/frame
python -m server.rep_training extract clips/*.mp4 --cache .rep-cache-old --no-track   # previous path, for comparison
npm run train:reps && npm run eval:reps
```

## Limitations

- The dataset is small: about 30 positive clips and two curl clips. These
  numbers show the direction of the change, not a guarantee for every user.
  More of your own labelled clips will help most, especially curls and
  phone-camera push-ups.
- Head-on push-ups remain unsupported, as before. Very dark or heavily occluded
  curls (the hard clips) still undercount.
- Around 2 fps (a degraded network), quick push-ups can lose their brief top
  frame. At the app's normal 4–6 fps they count well.
- There is still no form score.

## Retraining with your own clips

```bash
pip install -r server/requirements-train.txt
python -m server.download_model
python -m server.rep_training extract path/to/*.mp4 --cache .rep-cache
# add each clip to server/training/labels.json (cache = file stem, expected = reps)
npm run train:reps        # writes server/training/rep_counter_params.json + report
npm run eval:reps         # per-clip table for the current params
npm run test:reps         # unit tests also run against the shipped params
```
