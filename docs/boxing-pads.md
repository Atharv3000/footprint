# Boxing pads prototype

Open **Rep tracker → Boxing** and tap **Start 60s boxing round**. Place the phone at chest height, facing you, with both shoulders, elbows and hands visible. Raise both hands near your cheeks for three tracked samples. Blue pads request the anatomical left hand; pink pads the right. Shadowbox into open space; do not aim at the physical phone.

Leather-style focus mitts grow toward you and cycle through a shuffled bag of left/right straights, hooks and uppercuts. Upright mitts request straights, angled mitts request hooks, and horizontal mitts request uppercuts. A colored edge glow and HIT NOW cue mark the scoring window. Mitt artwork includes padded leather panels, stitching and wrist straps; there are no circular targets. Strike during **HIT NOW**, then return to guard. Each hit earns 100 points plus 10 per combo step up to a 100-point bonus. Misses reset the combo. Save Hits logs a zero-weight Shadowboxing workout with hit count, score, misses and best combo. Starting again starts a new round.

## Detection and limits

Reuses the existing pretrained MediaPipe Pose Landmarker Full model and HTTP camera relay; no new model training or asset is needed. Boxing frames skip the push-up rotation fallback. Image landmarks now include MediaPipe's inferred `z`. The game uses shoulder-relative wrist trajectories and 3D elbow angles: forward depth/extension for straights, inward lateral motion with a bent elbow for hooks, and upward motion with a bent elbow for uppercuts. Correct hand, confidence, screen-space pad overlap, movement and timing must all agree. Holding a hand over a pad cannot repeatedly score.

Pads approach over 3 seconds, with a forgiving 1.9–3.8-second scoring window. Only accepted camera frames advance the 60-second clock (at most 0.45 seconds each). Missing joints or long network gaps clear movement history and freeze progress. The overlay animates separately at about 30 fps, extrapolating at most 0.45 seconds; it never changes camera geometry. Requests still use the existing roughly 4-fps-at-best snapshot relay. The camera must see the punch across multiple samples: fast punches, occlusion, poor light and tunnel latency can cause missed or misclassified hits.

MediaPipe depth is inferred from a single image, not a measured physical distance. This is a forgiving motion game, not a validated boxing classifier, form score, impact detector or power measurement. Thresholds have synthetic landmark and HTTP integration coverage; accuracy on real boxing footage and devices has not been established. Future faster gameplay needs on-device video inference in a development build.

Run/restart `npm run start:reps:tunnel`, then reload Expo Go to pick up Python changes. Tests: `python -m unittest discover -s server/tests -v`.

## Mitt presentation research

The mitt now has visible depth and a projected striking surface, rather than only a rotation in the screen plane. Straights use an almost front-facing surface with a slight inward angle. Hooks yaw to face the incoming lateral punch, narrowing the visible palm and exposing the padded edge. Uppercuts pitch downward, compressing the visible palm vertically and exposing the top/back thickness. Mirroring follows the tracked hand's inward direction. The display labels identify the user's punching hand, not the coach's mitt hand.

These choices follow the pad positions described by England Boxing and Ringside. The specific render angles (roughly 68° yaw for hooks and 64° downward pitch for uppercuts) are visual presentation choices, not prescribed universal coaching angles. England Boxing describes a 45° presentation for some uppercuts and a downward face for short-range uppercuts. This game uses a downward-facing head/chin-level cue, without claiming to simulate every padwork variation.

The mitt moves into its presented position before HIT NOW; its scoring centre and the existing motion classification stay unchanged. This adds no new accuracy claim to the camera classifier.

- England Boxing, Basic Pad Positions, p. 146: https://www.englandboxing.org/wp-content/uploads/2022/03/Level-2-Coaching-Handbook-compressed.pdf
- Ringside, Position the Mitts Properly: https://blog.ringside.com/holding-punch-mitts/
- Geometry checks: `node scripts/test-boxing-pad-presentation.cjs`

MediaPipe output documentation: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/python
