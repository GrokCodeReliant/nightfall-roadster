Unapplied patches for Build Engineer. Do not apply from this art drop.

- `city.ts.diff` — piece list, facade trim + new dressing placement, `loadRoadKit` / `placeRoadKit` / `roadKitReady`, export `roughHook`.
- `world.ts.diff` — load the road kit at init; swap the procedural road+marks for instanced `road_straight_40` + `lanepaint_straight_40` with the roughness hook.

See `../INTEGRATION.md` for file copy paths, placement rules, the curve caveat, and the LEVELS/01 follow-up list.

Target tree: `repo_v02/src/game/` at the Week H3.2 read (city.ts / world.ts as of this drop). Line numbers may have drifted; apply by context, not blindly.
