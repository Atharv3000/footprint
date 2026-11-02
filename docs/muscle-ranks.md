# Profile muscle ranks

The first Profile sub-tab is **ranks**, selected by default when the screen
mounts. Activity, Insights and Badges follow it in that order.
The muscle map has front/back views and selectable body parts. Tapping a body part
shows its tier, lifetime training-day count and progress within the next tier.
Rank-colored muscle panels and shield emblems are native SVGs, with no generated
images or additional packages.

## Progression

| Rank | Training days for that body part |
| --- | ---: |
| Wood | 0 |
| Bronze | 1 |
| Silver | 3 |
| Gold | 7 |
| Platinum | 15 |
| Diamond | 30 |
| Champion | 60 |
| Titan | 100 |
| Olympian | 150 |

One body part earns at most one credit per local calendar day with a saved
workout containing positive integer reps and a valid nonnegative weight.
Bodyweight workouts with zero external weight count. Multiple sets and multiple
exercises for the same body part on one day remain one credit. Three distinct
arm-training days earn Silver; three sets in one session earn one day.

The existing exercise library's primary muscles map to Arms, Chest, Shoulders,
Back, Core and Legs. When primary labels are unavailable, the library category or
an explicit legacy exercise-ID mapping is used. Unknown exercises do not receive
arbitrary credit. A compound with multiple primary target groups can credit each
group, once per day. Both sides of a muscle share a rank because logs do not
record reliable left/right training history.

Ranks are computed from saved workout history, not cached XP. Existing real
history counts, and deleting history recalculates the corresponding rank.
Demonstration IDs (`demo_*`), duplicate IDs, malformed data, future dates and
other-account records are excluded. Steps and badges do not award muscle credit.
These are consistency ranks, not measured strength or physique scores.

## Storage and refresh

`loadRankableWorkoutLogs` reads only the current user's existing workout key;
it does not seed the activity screen's demonstration logs or perform migration.
The rank engine also understands guest records already copied into that key by
the app's existing guest-history migration.

Successful workout saves/deletes emit a scoped `WORKOUT_LOGS_CHANGED` event.
The section refreshes on that event, profile focus and Ranks-tab activation.
Async generation checks prevent stale requests from replacing the displayed
account's history. Storage errors produce a retry state instead of made-up ranks.

Run `node scripts/test-muscle-ranks.cjs` to check thresholds, day deduplication,
exercise mapping, input exclusion, deletion, raw storage reads and update events.
The development artwork preview uses test ranks only; those examples are never
inserted into the user's workout history.

## Reference palette

Rank gradients visually match the supplied screenshots: Wood brown, Bronze copper, Silver blue-gray, Gold yellow, Platinum turquoise, Diamond violet, Champion pink-purple, Titan deep red, Olympian cyan. These are visual matches rather than official extracted hex codes. Base, highlight and shadow values are centralized in `constants/muscleRanks.ts` and shared by the muscle map, emblems, progress bars and tier list. The old random account palette no longer overrides earned rank colors. The starter tier keeps its legacy `iron` ID while displaying Wood; training-day thresholds are unchanged.
