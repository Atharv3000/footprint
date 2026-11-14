# Nutrition companion

Calorie Tracker now has Tracker and Pet tabs. The Pet tab shows today's diary even when a historical date is selected in Tracker. Feed opens the existing food logger; saving/deleting meals reloads both views. The plan chip opens the existing cut/maintain/bulk questionnaire. Calorie targets come directly from nutrition settings; no second deficit or surplus is applied.

Pip is a code-drawn, animated mint cat with editable, locally persisted account-specific name. Expressions, bobbing, belly fullness, dialogue and headband color follow the current plan and logged progress. Animations stop off-screen, behind nutrition modals, in the background, or when reduced motion is enabled. No image or model downloads are needed.

Fullness: empty diary = ready; below 35% = hungry; below 70% = getting fueled; below 90% = energized; 90–110% = satisfied; above 110–130% = full; above 130% = very full. This is a virtual daily fullness indicator, not a prediction of weight or obesity. Logging remains available above the target. Logging more calories never increases care XP.

Each unique calendar day with a positive-calorie entry earns one care day, with a new level every three days. Repeated entries on one day do not accelerate levels. A streak includes yesterday until today is logged. Fullness resets at the next local day; history determines care progress and survives app restarts. Deleting history also updates care progress. The app's existing food diary is device-local and not account-scoped; this feature uses that diary without changing its storage model. The pet name is account-scoped and device-local; no friend synchronization is added.

Validation: `node --test scripts/test-nutrition-pet.cjs` covers state boundaries, cut/bulk dialogue, saved-target usage, invalid entries, deduplication, rollover, care progression, corrections, deletion and calendar streaks.

Device check: open Nutrition → Pet; log a meal through Feed, verify totals and expression; change plan using the plan chip; delete a meal in Tracker; switch historical dates and confirm Pet still shows today; rename and relaunch; enable Reduce Motion to verify the cat stays still.
