# Collaborative country quests

**Community → Quests → Country quests** lets a team trace a country/region's simplified outline. Pick from 176 bundled outlines, create a named quest, and share its 12-character invite code. Friends review the goal before joining. Up to 50 walkers contribute to one route, with a team leaderboard, progress marker, completed trail, completed/remaining km, step target and completion state. Manage up to five active quests per local account. A saved walk can contribute to each active quest.

## What counts

Contributions come from raw saved `WalkRecord` entries in the existing walking tracker, never the demo-seeding history loader. Only walks and runs completed after that member joins count. Demo IDs, duplicates, other accounts, cycling, invalid timestamps/steps and future records are excluded. The existing tracker estimates steps from recorded distance. The virtual route uses the matching conversion of 1,310 steps/km. This does not count background pedometer steps or unsaved active walks. Walk duration may begin before joining: eligibility uses the completed-record timestamp.

The client submits each member's absolute eligible step total, so reloading or retrying cannot add a record twice. Deleting a qualifying record reduces its contribution on the next sync, until a quest completes. Completed results freeze. Leaving preserves the contribution and stops future updates; only the creator can end the entire quest. A departed member cannot rejoin that quest from the same device. The creator ends the quest instead of leaving. Screens sync every 15 seconds while focused, after saved-walk changes, and on foregrounding/focus. Offline walks remain stored and sync on reconnect.

The app's existing walking tracker computes steps from recorded distance. This feature is a collaborative virtual route, not verification that anyone physically walked a national border. The supplied goal uses the simplified full outline, including coastline and separate island sections, without adding imaginary connecting sea routes. It is not an authoritative border/coastline measurement or physical walking itinerary. The outline's resolution affects the distance. Tiny territories absent at 1:110m are not in the picker.

## Backend and privacy

Reuses the existing Python development service and Metro proxy. Run/restart `npm run start:reps:tunnel` after Python/Metro changes, then reload all phones from that same Expo server. State persists in ignored `server/data/country-quests.sqlite3`; `COUNTRY_QUEST_DB_PATH` overrides it. No new JavaScript or Python packages are required.

Each local account/device receives a random walker capability in Expo SecureStore, hashed in the server database. Joining the same quest with that capability is idempotent. Invite messages contain only the public join code. Team members see display names and contributed step totals, not GPS tracks, email addresses or food data. The server requires both its development bearer token and the per-walker capability for private quest operations. Contributions remain device-reported. This is development infrastructure; production account authentication, hosting, activity verification and account/device recovery are not implemented. Reinstalling/moving devices creates a new walker identity.

## Map data and reproducibility

Made with Natural Earth, public-domain **1:110m Admin-0 Countries**. The bundled catalog includes its upstream source URL and source SHA-256. Coordinates are projected to an SVG viewport; edge distances use the haversine formula before projection. All polygon rings are kept, with separate paths for disconnected sections. Rendered progress interpolates by geodesic edge distances rather than SVG path length. No map service, API key or runtime map download is needed.

- Source: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
- Terms: https://www.naturalearthdata.com/about/terms-of-use/
- Rebuild: `python scripts/build-country-borders.py input.geojson assets/data/countryBorders.json`
- Verify: `python -m unittest discover -s server/tests -v` and `node scripts/test-country-quests.cjs`
