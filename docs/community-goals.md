# Community goals

Daily and weekly step targets are saved per account on the device. Progress is
recomputed from real saved map walks and runs. Cycling, demonstration records,
duplicate IDs, other accounts, future records, and invalid steps are excluded.
The day rolls over at local midnight; weeks start Monday. Deleting an activity
recomputes progress instead of maintaining an increment-only counter.

Community → Community goals → settings edits the two personal targets and
creates or joins a seven-day shared squad goal. Squad memberships use a secure
device capability and a 12-character invite code. Only shared totals and member
names are sent to the server; GPS coordinates are not uploaded.

The map finish summary appears after the walk is actually saved. It shows the
walk's added steps, resulting totals, and newly completed goals. Squad additions
remain marked pending when offline; retries submit absolute member totals so a
walk is not counted twice.

## Backend deployment

Deploy `server/app.py` and `server/community_goals.py` together. The new
`POST /rep-api/goals` route follows the existing challenge API authentication.
`COMMUNITY_GOALS_DB_PATH` optionally chooses a persistent SQLite path; the
default is `server/data/community-goals.sqlite3`.

An older deployed server returns 404 for squad goals. Daily/weekly goals and
walk saving work without this endpoint. This change does not deploy or change
the configured Railway service.

## Checks

```
node scripts/test-community-goals.cjs
node scripts/test-country-quests.cjs
python -m unittest server.tests.test_community_goals server.tests.test_country_quests server.tests.test_calorie_challenges
```
