# v0.2 M1 + M2 notes

Branch `v02` only. `main` / GitHub Pages (the v0.1 release files at the repo root) are untouched.

## Build and test
    npm install
    npm run build        # vite -> dist/, then packages /workspace/studio/nightfall_roadster/v02_m2 (folder + single HTML + zip)
    npm run test:unit    # handling lock vs v0.1, road, waves, lives/game over
    npm run test:e2e     # headless Playwright on desktop 1280x720 + phone 390x844 against the single-file build

## M1: wide endless road (src/game/road.ts)
- 24 m, 4 lanes, seeded gentle curves, samples every 2 m, generated ahead and trimmed behind. Queries are local (search near the car's last distance).
- Rare set pieces: kicker ramps and elevated 50 m void gaps (thrust), with warning boards.
- Renderer streams pooled 40 m chunks (2 behind + 9 ahead, or 7 ahead on phones). Chunk geometry is built in local coordinates. The v0.1 slab skyline stays until M4.
- Handling lock: `tests/unit/handling.test.ts` runs the untouched v0.1 sim (`tests/fixtures/sim_v01.ts`) and the v0.2 sim with the same scripted keys. They must match to 1e-9 every frame: speed, yaw, slip, vy, height, fuel, ammo, grounded, thrust and path length. `readInput()` is compared on every binding.
- `drive()` motion code and `readInput()` are copied verbatim from v0.1. The only edit is the road query hint argument. The camera code and HUD DOM/CSS are unchanged; e2e checks the HUD boxes against the v0.1 build within 3 px.

## M2: combat core
- Waves: wave n = 2+n enemies (at least one gunner), spawned 1.15 s apart, ahead or behind. 3 s lull between waves. Clear bonus 500×wave (×1.5 if you took no damage).
- Rammer (40 HP): lines up in your lane 14-16 m out, then charges. 18 dmg per ram plus a side shove, 2.6 s cooldown.
- Gunner (55 HP): holds 22-24 m ahead or behind in an adjacent lane and swaps sides every 6-10 s. Fires 3-round bursts (6 dmg each) every 2 s at up to 42 m.
- Player: 3 lives, 1.5 s invulnerability after a respawn. The void costs 40 hull. Hero shots do 16 dmg with a light aim assist (6° cone); mines do 28.
- HUD: the Lap slot shows Wave, the position slot shows Kills, Hull shows ×lives, and the minimap is the local road with enemy blips. The result card shows survived time, wave reached, kills, falls and score.

## For M5 (car hull)
Follow the Roadster's real silhouette as closely as possible: no logos, badges or brand marks. M2 only adds a small roof turret on gunners and recolours enemies; the hull is unchanged.
