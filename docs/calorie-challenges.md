# Calorie challenges

Open **Calorie Tracker → Calorie challenges** or **Community → Quests**. Create a cut/bulk challenge with a 1,000–10,000 kcal daily target for 1, 7, 14 or 30 days. Targets are user-selected, not nutritional recommendations. Choosing a friend personalizes the system share-sheet invite; it does not send an in-app notification. Share the 12-character code, then the friend reviews the target and accepts under **Join a friend**. Joining starts the challenge on that calendar day. Unaccepted invites expire after seven days.

The same daily target applies to both participants. Most days completed within ±10% of the target wins. No points for under-eating or excess calories. Tap **Finish today** after logging food. Editing/deleting food can revoke that day's point. Outcomes freeze after the final day; equal scores draw. Either person can cancel without a winner. Cut and bulk are challenge labels; they do not overwrite personal macro targets.

Progress uses the existing device-local meal diary (which is currently shared across local app accounts), summing `MealLog.calories` by the diary's date key. Challenge memberships are scoped to the signed-in local account. Challenges use the creator's time zone to determine day boundaries; participants should use matching diary date keys when travelling. They share daily calorie totals and completion scores only, not photos or food descriptions. Data is self-reported, not verified nutrition measurement. Screens refresh every ten seconds while focused, on foregrounding, and after food edits. Offline logs remain in the diary and sync on retry/next connection.

## Development server

Run `npm run start:reps:tunnel` and load both phones from that same Expo server. This reuses the existing Python battle service and Metro proxy; plain `npm start` alone does not run the challenge backend. Restart this command after changing Python routes or Metro config, then reload both phones. No Supabase schema migration or new JavaScript package is required. Install Python dependencies with `pip install -r server/requirements.txt`; `tzdata` supplies time-zone rules on Windows.

Challenge state persists in ignored `server/data/calories.sqlite3`; `CALORIE_DB_PATH` can override it. Membership capabilities are stored in Expo SecureStore and hashed in SQLite. A code allows one second participant to join; keep invites private. Keys are never included in share messages. Membership is device-bound: reinstalling or moving to another phone requires a new challenge. This is development-server infrastructure, not hosted production infrastructure or authenticated account recovery. Host deployment, real account authentication and device recovery remain prerequisites for release.

Checks: `python -m unittest server.tests.test_calorie_challenges -v`, plus existing server tests and `node scripts/test-calorie-challenges.cjs`.
