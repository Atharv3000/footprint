# Camera rep tracker and live battles

Open Activity's existing camera rep tracker. Solo retains push-ups, squats and
curls. Challenge a friend creates a private, eight-character room code; send it
using Invite friend. Your friend opens the same app, selects Challenge a friend,
and joins that code. Both phones must use the same running server.

Place the phone steadily at floor level beside you. Turn your body about 90
degrees to the camera, showing one shoulder, elbow, wrist and hip in profile.
Keep the phone upright. Use even light and begin in a straight-arm plank.
Hold until calibrated. Both players tap Ready, then wait for the shared
three-second countdown. A ten-rep lead wins: the bar starts at 50%, moves five
percentage points per completed rep, and the opponent's reps move it back.

The expand icon opens framing controls: zero digital zoom, supported rear
ultra-wide lenses, and a full-camera-view option. Set framing before a set or
battle. The native preview uses the configured camera aspect ratio throughout
the session; incoming JPEG dimensions only affect landmark projection. This
prevents a capture/preview resizing feedback loop.

The status badge distinguishes FINDING BODY, CHECK SETUP, TURN SIDE-ON,
CALIBRATING and COUNTING REPS. Orange joints show a detected body while setup is
incomplete. The overlay displays points down to 40% confidence; rep validation
retains its stricter joint checks. Seeing moving joints does not itself mean a
complete exercise repetition has occurred. Standing in Pushups mode stays at zero.

This is a live, low-frame-rate camera-preview battle, approximately 1-3 updates
per second depending on the phone, network and server, with capture targeting
roughly four frames per second when possible. JPEG quality is 50% rather than
the earlier 18% to preserve pose detail. It has no audio. It works
in Expo Go without a custom WebRTC native build. It is not a full-frame-rate call.

## Start

Use Python 3.10-3.12 and the repository's Node/Expo version.

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server/requirements.txt
.\.venv\Scripts\python.exe -m server.download_model
npm run start:reps:tunnel
```

`npm run start:reps` uses local Wi-Fi. The launcher starts Python on loopback port
9002 and Expo on 8081. Only `/rep-api` routes are proxied through Metro, so the
phone does not need a second tunnel or direct access to port 9002. The existing
food-analysis server configuration is untouched. `REP_PYTHON` can point to a
compatible Python interpreter; `REP_POSE_MODEL` can point to the official model
file. The default checkpoint is now `server/models/pose_landmarker_full.task`;
run the download command once when upgrading from Lite. Stop an existing Expo session before starting the combined launcher.

The optional tunnel helper is `@expo/ngrok`. No friend invitations are sent
automatically; Invite friend opens the phone's share sheet.

## Detection and game rules

Google's pretrained MediaPipe Pose Landmarker Full detects joints. No new model
was trained. Horizontal side-on bodies are rotated upright for inference, then
landmarks are mapped back to the unchanged camera preview. Raw detection is used
to infer body orientation; 90/270-degree fallbacks are tested when no body is found.
The counter locks onto one visible anatomical arm, checks the torso is in a
plank rather than upright, and combines aspect-corrected elbow angle with
calibrated shoulder-to-wrist height. Three clear top samples establish the
initial top state. Two clear frames confirm later transitions. Brief occlusion
is tolerated without erasing an already observed bottom; a long gap resets
calibration. The same arm must remain visible throughout the repetition.
Only a full calibrated top-to-bottom-to-top cycle increments a rep.

Those thresholds are prototype heuristics, not validated form assessment.
Foreshortening, floor perspective, clothing and occlusion can prevent detection.
Keep the phone fixed after calibration. Side-on is the recommended setup based
on public-video development replays. Head-on footage remains unreliable and is
blocked from battle readiness. Solo mode can still display its pose and a warning.
Physical-device testing is still required to establish counting accuracy.
The app does not invent a biomechanical score; saved sessions mark it unassessed.

The server owns both counters and the winner. Clients cannot submit a rep total.
No reps count before the countdown ends, and a finished result cannot reverse.
Leaving/disconnecting during an active battle forfeits it; leaving the lobby or
countdown cancels the match. Lost network sessions expire after about 20 seconds.
Backgrounding the app leaves the battle. Reconnecting starts a new session.

## Data and deployment scope

Starting solo uploads camera frames for pose analysis. Creating/joining a battle
also relays reduced JPEG previews to the other room participant. The server
strips metadata, holds only the newest preview in memory, and does not record
video, audio, photos or room history. Temporary capture files are deleted after
each upload. OS/tunnel caches and interrupted processes are outside that promise.

This is a single-process development service. The launcher makes a fresh bearer
token and injects it into the dev app; each connected device also receives its own
random session capability. A room code is an invitation capability, not verified
friend identity. Share it only with the intended friend. Room capacity, request
size, frame rate and timeouts are bounded. Restarting clears all sessions/rooms.
Before public or ranked deployment, add real server-verified user auth, friend
checks, hosted media infrastructure, quotas and a shared atomic game store.

## Checks

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s server/tests -v
npm run test:rep-client
node scripts/test-camera-framing.cjs
npx tsc --noEmit
npx expo export --platform ios
```

Counter tests use synthetic landmarks to test state transitions, not evidence
of real-world accuracy. API tests use a fake detector to test transport and game
rules; a separate integration check should load the real pretrained detector.

Replay an authorized local video through JPEG compression, the real detector,
rotation correction, and the counter:

```powershell
.\.venv\Scripts\python.exe -m server.backtest path/to/video.mp4 --fps 4 --expected 5 --output result.json
```

Keep private videos and their output traces outside Git. Development clip sources,
manual counts, frame-rate limits and results are recorded in the adjacent replay
report. These replays were used during development and are not an independent
accuracy evaluation.

`CameraView` uses `animateShutter={false}` and `flash="off"`. Muting only the
shutter sound does not disable the per-capture preview opacity animation.

Sources: [MediaPipe Pose Python](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/python),
[official model](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task),
[Expo Camera](https://docs.expo.dev/versions/v58.0.0/sdk/camera/).
