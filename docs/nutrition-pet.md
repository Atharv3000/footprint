# Nutrition companion

Pip follows the current account's real calorie diary, saved target and cut/maintain/bulk plan. Pet always shows the current local day, even if Tracker is showing history. Feed opens the existing meal logger; the plan chip opens nutrition settings. Names and appearances remain account-specific. Existing cat head rubs, fox wagging and bunny hopping remain available.

## Daily mood engine

The mood is derived from diary progress, local clock time and the last valid positive-calorie meal timestamp. A one-minute clock runs only while the pet is visible and the app is foregrounded. Resume refreshes immediately. Midnight resets daily fullness without losing care history. No separately persisted mood can leak across users, survive a deleted meal, or become stale after edits.

- **7–10 am: cheerful morning.** Pip starts happy even with an empty diary.
- **Daytime: a loose rhythm.** Expected progress interpolates between 0% at 7 am, 15% at 10 am, 45% at 2 pm, 70% at 6 pm, 95% at 9 pm, and 100% at 11 pm. These are virtual-pet design values, not prescribed meal times.
- **Curious:** at least a 12-percentage-point diary shortfall plus two hours since a log. Neutral expression and a gentle question about missing logs.
- **Hungry:** at least a 20-point shortfall plus four hours without a log. Sad expression and slower bobbing.
- **Low:** at least a 30-point shortfall plus six hours without a log. More subdued dialogue and expression. For an empty diary the gap starts at 9 am, so the typical empty-day sequence is cheerful at 9, curious at 11, hungry at 1 pm, and subdued at 3 pm.
- **Recovering:** a positive meal logged within the last 45 minutes perks Pip up. This is a temporary grace period, not extra care XP. Zero-calorie entries and invalid/future/mismatched timestamps cannot trigger it. Untimed legacy entries get no invented timestamp or long-gap penalty.
- **Energized:** progress or recent logging is comfortable for the time of day. A low fraction of the full daily target does not by itself cause a sad morning face.
- **Satisfied:** 90–110% of the saved target keeps Pip content regardless of logging gaps. This outranks recent-log recovery.
- **Full / stuffed:** over 110% / over 130% changes the virtual fullness expression. It outranks recovery; logging is always available. Cut dialogue mentions the reached cut target; bulk dialogue references the bulk plan. No second deficit or surplus is applied.
- **11 pm–7 am: sleepy.** Closed eyes, slow bobbing, restful dialogue and no hunger reminders, even after an empty diary. Quiet hours take precedence over fullness expressions.

The mood badge, face, bobbing and three rotating dialogue lines agree with the same computed state. A small context line shows the day period, time since the last meal log and why Pip feels this way. Head rubs temporarily cheer any mood for 3.5 seconds; they never alter calories or the underlying diary. Reduced-motion and off-screen animation behavior are preserved.

This feature represents the diary, not measured human hunger or whether the user has eaten. Copy asks about unlogged meals and never asks users to compensate tomorrow or eat extra to rescue the pet. Fixed rhythm defaults currently assume a daytime schedule; there is no automatic inference of sleep or meal timing.

## Care progression

Each unique calendar day with a positive-calorie entry earns one care day; every three care days adds a level. Repeated entries, calorie amounts, petting and mood changes add no extra care days. A streak includes yesterday until today is logged. Deleting or correcting history recomputes progression.

## Validation

Run `node scripts/test-pip-daily-rhythm.cjs`, `node scripts/test-nutrition-pet.cjs`, `node scripts/test-pet-head-rub.cjs`, and `node scripts/test-pet-appearance.cjs`. Rhythm tests supply explicit local clock values and cover the full daily sequence, dual-condition mood gates, recovery expiry, target precedence, quiet hours, midnight, malformed timestamps, duplicate IDs, correction/deletion, affection, plan-specific copy, DST calendar dates, and historical/invalid targets.

On device: open Nutrition → Pet in the morning; verify a happy empty diary. Later check the mood context, log a real meal and see Pip perk up; delete it and check recomputation. Rub each species, background/resume, and enable Reduce Motion. Change the Tracker date: Pet must still follow today.
