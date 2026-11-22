# Pip engagement reminders

Account → ⋯ → Pip reminders contains opt-in settings and a five-second test notification. No permission prompt appears automatically on signup. Enabling requests native notification permission; denial keeps reminders off and offers phone settings. Reminders are local scheduled phone notifications, not remote push messages, and need no calorie/AI server or Expo push credentials.

## Behavior

- Original Pip copy inspired by playful habit apps, with Playful and Gentle personalities.
- Meal diary: missing/quiet logging relative to the current plan and saved calorie target, not an assumption that the user did not eat. At or near the daily target, today’s meal reminder is removed. Zero/future/sample entries do not manufacture a check-in.
- Workouts: only when a saved routine exists, at most on alternate planned days, suppressing today’s nudge after training and within 36 hours of recent training. Copy explicitly allows rest days.
- Check-in streak: a factual count of consecutive prior local days with a positive real meal, completed workout set, or recorded activity. One evening reminder if today has no check-in; it disappears after a qualifying log. This is a logging/check-in streak, not the separate walking-goal streak.
- Comeback invitations at three and six days after planning, reset when the app is revisited. Future copy avoids claims about unseen actions.
- Default maximum two per local calendar day, minimum three-hour separation and quiet hours 9 pm–9 am. Settings include one/day, alternate quiet windows, categories, and pause/resume for 24 hours. Priority is current streak, comeback, meal, workout.
- A rolling seven-day plan remains under iOS’s pending-notification limit. Foreground banners, sounds and badges are suppressed; no notification is required to use any feature.
- Normal tap opens the corresponding app tab. Pet reminders open Nutrition → Pet. Destinations are allowlisted; arbitrary URLs, foreign-account payloads and signed-out taps are ignored. A response is handled once and the OS’s last response is cleared.

## Scheduling and privacy

One controller in RootLayoutNav listens for meal/workout/walk changes and preference events, debouncing rebuilds by 500 ms. It also refreshes on foreground/background transitions. There is no polling/render timer in the Fitness Log. Reconciliation reuses unchanged native requests and cancels obsolete ones. A per-account ledger counts elapsed scheduled slots against today’s cap to prevent re-sending after app visits.

Settings, ledger and last-open time use explicit account IDs. Account activation changes a generation token immediately; stale queued jobs check it after awaits. Switching accounts or signing out cancels pending engagement notifications and dismisses old engagement banners. Other notification identifiers are preserved. No push tokens, food photos, diary contents or account data are sent to a notification service.

## Limits

The OS delivers locally scheduled notifications while the app is closed. The app cannot recompute its conditions while terminated: future messages are conditional invitations from the last snapshot. Seven days without revisiting means the plan ends; server-driven campaigns/background remote-data evaluation are not implemented. Time-zone changes are reflected when the app refreshes. iOS Focus/Scheduled Summary and Android battery settings may delay presentation. A physical-device check remains necessary. Local notifications are available in Expo Go; production native builds include the expo-notifications config plugin. Remote push is a separate build/credentials/backend feature.

## Verification

Run `node scripts/test-engagement-plan.cjs`, `node scripts/test-engagement-notifications.cjs`, and `node scripts/test-engagement-routing.cjs`. These exercise actual planning, native scheduler reconciliation and notification response code with controlled clocks and mocked OS APIs. They cover caps/spacing, real history, invalid/sample/future records, target completion, workout/rest suppression, quiet windows, pause, DST/year rollover, opt-in, denial, idempotence, cancellation, account races and tap destinations.

On phone: enable reminders in Account settings, allow notifications, tap Send test notification and background or lock the phone immediately. Pip should notify after about five seconds; tapping should open Pet. Then test a completed meal/workout cancellation, disable, pause and account switch. OS permission and actual delivery have not been tested on a physical device by automated checks.
