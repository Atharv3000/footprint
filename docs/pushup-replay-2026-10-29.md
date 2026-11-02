# Push-up replay and flicker investigation: 2026-10-29

## Outcome

The repeated blanking was Expo Camera's default shutter animation. The installed
iOS implementation explicitly sets preview-layer opacity to zero for each photo.
`shutterSound: false` only muted the sound. The app now sets
`animateShutter={false}` and `flash="off"` on the existing CameraView. No native
package edits or visual redesign were made. Physical-iPhone confirmation is still
needed; desktop checks cannot establish the absence of device-specific flicker.

The previous counter required both arms, a visible centered nose, and a frontal
shoulder layout. It rejected valid profile views and lost cycles on brief landmark
dropouts. All three public clips produced zero reps under those rules, including
when the detector inputs were rotated 90/270 degrees.

The selected solution uses Google's existing Pose Landmarker Full checkpoint,
corrects horizontal body orientation for inference, and maps joints back into
the original preview coordinate space. The counter tracks one anatomical arm,
requires a plank-like torso, calibrates height from three top samples, and combines
elbow bend with shoulder-to-wrist height. Short dropouts can preserve an already
observed bottom; long gaps erase the incomplete cycle and require calibration.
Capture JPEG quality increased from 18% to 50%; the capture scheduler checks every
60 ms with a 220 ms minimum interval, no overlapping captures, and backpressure.
Actual frame rate still depends on capture, inference, and network latency.

Head-on counting remains unreliable. The app explains this and blocks head-on
battle readiness. Users should turn their body side-on to the camera; they should
keep the phone upright. This changes the recommended capture setup, not the app's
original full-screen camera, controls, HUD or action-deck design.

## Sources and procedure

Public clips came from [personal_trainer-using-mediapipe](https://github.com/shreyanshsatvik/personal_trainer-using-mediapipe),
revision `010a20c12542aa7067b885ae525a882e5702660a`. The repository reports Apache-2.0;
the underlying video provenance was not independently verified. Source videos
were downloaded only for local evaluation and are not redistributed in this app.
No sample footage was used to train a model or change model weights.

Manual review of timestamped contact sheets counted complete visible cycles.
These manual reference counts are not supplied benchmark labels. The clips were
used during implementation, so these are development replays, not independent
accuracy validation. The sample is only three push-up subjects and two negative
clips. It does not establish general performance or full-form verification.

`python -m server.backtest` sequentially decodes the video, samples frames near the
requested rate, resizes to at most 640 pixels, JPEG-encodes at the selected quality,
then uses the actual image decode, inference, orientation, and counter code.
Clip 3 shows a diagonal/modified push-up; it is not evidence of full toe-supported
push-up verification. Slow or partial reps, occlusion and foreshortening remain
limitations. No automated form score is produced.

## Final pipeline results: JPEG quality 50

| Clip | View / action | Manual push-up count | Count near 4 fps | Count near 2 fps |
| --- | --- | ---: | ---: | ---: |
| pushup1.mp4 | Head-on | 5 | 0 | Not rerun; unsupported for battles |
| pushup2.mp4 | Side / oblique | 5 | 5 | 5 |
| pushup3.mp4 | Diagonal modified push-ups | 3 | 3 | 2 |
| squats2.mp4 | Squats, negative control | 0 | 0 | Not run |
| weight lifting 2.mp4 | Arm exercise, negative control | 0 | 0 | Not run |

Sampling near 4 fps yielded 4.17, 4.28, 4.17, 4.17, and 4.00 fps respectively.
Near 2 fps, the two side clips yielded 2.00 and 2.08 fps. Inference averaged
approximately 65-130 ms per sampled frame on this computer in these runs; those
numbers exclude phone capture, network, and multi-user contention.

At the old JPEG quality 18, the same new pipeline counted 5 and 2 in the two side
clips near 4 fps, and 4 and 1 near 2 fps. This is why compression quality changed.
Uncompressed landmark replays also compared Lite/Full and rotations; the results
were exploratory and are not a substitute for the JPEG-path results above.

## Reproducibility

Use the official checkpoint:
[Pose Landmarker Full v1](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task).

Example:

```powershell
.\.venv\Scripts\python.exe -m server.backtest path/to/pushup2.mp4 --fps 4 --expected 5 --jpeg-quality 50 --output result.json
```

The JSON records input SHA-256, sampled rate, count, reference count, validity,
view classification, inference time and the timestamped counter trace. Keep
private videos and their traces outside Git. The local evaluation copies and
full result JSONs are in the workspace's ignored browser-check directory.

| File | SHA-256 |
| --- | --- |
| pushup1.mp4 | d79877f8ae5663f3cb148df53a2fcd7941b46dcdeaa4ae864b28785c2743b674 |
| pushup2.mp4 | 87757a92a63661ecbbefa31df26ad2df32f3404d608fc5f5814f87a54827ca8c |
| pushup3.mp4 | b2f7087a7fbd6935ce5ea3b299d7dfbf38eb7457772f298ab48e4d41890af600 |
| squats2.mp4 | 5974e890a41ecead1081206fc3db60405968be0248649016880328306b654284 |
| weight lifting 2.mp4 | e4fdfb341aa62beceb42810efc221f005b0082f0c74ba4e1e858dd9499294887 |
