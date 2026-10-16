# Nightfall Roadster v0.2 — "Night Hunter" design + plan

Status: plan only. No code changes, pushes, or publishing. Based on `work/src/game/{sim,track,world,RoadsterGame,audio}.ts(x)`.

## 0. What doesn't change (brief item 1)
- **Controls:** `readInput()` stays as is: WASD/arrows, F/J/LMB fire, G/Q/RMB mine, Space/Shift thrust, touch stick + Cruise/Fire/Mine/Thrust buttons, auto-gas.
- **Feel:** the constants and code in `drive()` don't change (accel 24, brake 42, drag 1.15/0.28, cap 48/64 with thrust, steer 2.4·speedFactor, grip 8/1.3, lat clamp 14, gravity 27, thrust 40, fuel 36↓/18↑, wall scrape 0.965), and neither does the chase cam, FOV, trauma shake or hitstop.
- **UI:** the HUD layout, `nf-*` classes, fonts, menu and pause card stay. Only the *text* in existing slots gets repurposed: "Lap 1/3" → "Wave 3", "1st" → "Kills 12", the timer stays the timer, and the minimap shows enemy blips. A small pickup chip row reuses the `nf-meter` style. No new screens.

## 1. Core loop
Endless one-way highway (Spy Hunter), always moving forward. Waves of hostile cars spawn behind or ahead of you and try to wreck you. You kill them for score and drops, grab pickups to upgrade, and survive as long as you can. Every 5th wave is a boss. Hull at 0 costs a life (3 lives; respawn with 1.5 s of invulnerability, upgrades kept minus one tier). Run ends at 0 lives → result card shows score, wave, kills, time, best (saved via the existing `loadSave`).
- Road is **24 m wide** (was 16) with 4 lanes. Gentle curves only. Ramps and void gaps come back as rare set pieces (thrust still matters), with a "VOID — THRUST" sign 150 m ahead.
- Scoring: kill = 100·tier, wave clear = 500·wave, no-damage wave ×1.5. Civilian traffic (optional, M5) costs −250 if you kill it, like Spy Hunter.
- Wave pacing: 8–12 s spawn bursts, 3 + wave·1.5 enemies (capped at 8 alive). Short lull with a guaranteed drop between waves.

## 2. Enemy types
| Type | HP | Behavior | Attack |
|---|---|---|---|
| **Rammer** (sedan) | 40 | Matches your speed and lane, then swerves in | Contact 18 dmg + shove (uses `separate()` impulse) |
| **Gunner** (coupe) | 55 | Holds 15–35 m ahead or behind in an adjacent lane | Bursts of 3 shots, 7 dmg, 1.4 s cooldown, ±0.06 rad spread (existing Shot pool) |
| **Mine Layer** (van) | 80 | Drives ahead of you, weaves | Drops mines every 2.5 s (existing Mine pool, enemy-owned) |
| **Spiker** (pickup truck) | 60 | Pulls alongside | Side blades: 12 dps while within 2.2 m laterally, plus a slow |
| **Interceptor Drone** (wave 6+) | 30 | Flies 6 m up and strafes | Shots from above; you can only hit it while airborne with thrust, or with Homing |
| **Boss: Armored Hauler** (every 5 waves) | 600 + 150/boss | Big truck that blocks 2 lanes | Rear turret cone + rear mine drop. Weak point is the rear (×2 dmg) |
Enemy AI is a lane-target steering function built from `aiInput()`, driving through the same `drive()` with infinite fuel.

## 3. Pickups and upgrades
Drops come from kills (25%), wave clears (guaranteed) and roadside crates (shoot to open). Rendered as glowing rotating icons. You collect them by driving through.
- **Repair** +35 hull · **Armor plate** +25 max hull (cap +100) and a visible bolt-on panel
- **Gun tiers:** Twin MG (2 barrels) → Heavy MG (dmg 16→24) → **Spread** (3-way). Each tier is kept until you die.
- **Homing rockets:** 6 rounds, fired with the same Fire button when selected (Fire still means fire; it auto-switches to rockets when they're loaded, then back)
- **Mine pack** max 4→8, cluster mines · **Oil slick** (replaces the mine type for 20 s; enemies spin out via the existing `spin`)
- **Nitro cell:** refills fuel and adds 20 max fuel · **Shield:** 6 s invulnerable bubble · **Magnet:** pulls in pickups for 15 s
No new input bindings: weapon choice is automatic (always the best available), so the controls stay identical.

## 4. Environment overhaul
**Assets (all CC0, licenses checked by fetching the pages on 2026-10-16):**
- Kenney City Kit (Roads): https://kenney.nl/assets/city-kit-roads (CC0). Road tiles, barriers, streetlights, signs, traffic lights.
- Kenney City Kit Commercial / Suburban (same CC0 Kenney license): building facades instead of the black slabs.
- Kenney Nature Kit: palms, rocks, shrubs for the coastal stretches.
- Quaternius packs (CC0): https://quaternius.com/packs/ultimatetexturedcars.html, plus nature and buildings packs.
- Poly Haven (https://polyhaven.com/license, CC0): one low-res 1k night HDRI for `scene.environment`, plus asphalt and concrete textures.
- ambientCG (https://ambientcg.com, CC0): asphalt, wet-road roughness, guardrail metal (1k JPG, KTX2-compressed).
- Pipeline: convert to glTF/GLB, merge with `gltf-transform` (dedup, `meshopt`, KTX2/ETC1S), put in `public/assets/v02/`, and keep a `CREDITS.md` even though CC0 doesn't require it. Total download budget **≤ 6 MB**.

**Road streaming:** `track.ts` becomes `road.ts`: a procedural spline generated chunk by chunk (seeded). There are **40 m chunks**, with 12 alive (3 behind, 9 ahead, about 360 m, which fits the 700 far plane and fog). Each chunk is a road mesh plus edge lines, two guardrails, and scatter (lamps every 20 m, buildings/trees from a biome table: downtown → harbor → coastal cliffs → industrial). Chunks are pooled and recycled with no per-frame allocation. Scatter uses one `InstancedMesh` per prop type. `queryTrack()` becomes a local search over the live chunks instead of an O(n) scan over every sample. The sim stores distance as a float64 `s` and rebases the world origin every 2 km to avoid float jitter.

**Lighting:** keep the night mood, fog color and ACES tone mapping. Use one moon DirectionalLight with **no real-time shadows on mobile** (desktop gets a single 1024 shadow map that follows the car). Streetlights are emissive bulbs plus baked light pools: a decal quad with an additive texture on the road, and *no* per-lamp lights. The hero keeps its 2 headlight SpotLights. Window emissive maps on buildings, a wet-asphalt roughness map for reflections from the HDRI, and optional bloom on desktop only.

**Mobile budget (the `coarse` path, already in `createWorld`):** DPR ≤ 1.5 (existing), no AA (existing), ≤ **120 draw calls**, ≤ **250k tris** visible, textures ≤ 1k, no shadows/bloom, 9 chunks ahead instead of 12, fog density 0.011. Target 60 fps on an iPhone 12-class device and 45 on a mid-range Android. Add an auto quality drop if the frame average is over 20 ms for 2 s.

## 5. Car model
Recommendation: **hand-build a better procedural Roadster** in code, refining the current `hullGeometry()` ring loft (10 rings → ~24 rings, 8 → 16 columns), plus separate meshes for windshield, cockpit, headlight pods, side vents, rear diffuser, exhausts, and the existing wheels and flames. Why: it matches the current silhouette and proportions exactly, has no logos or brand lookalikes by construction, costs 0 KB, and the armor and gun upgrades can bolt on as child meshes. Tris about 4k.
Optional (only if the procedural look falls short): export the same shape from Blender as GLB, or use **Kenney Car Kit** (https://kenney.nl/assets/car-kit, CC0, verified) "sports/race" body as a base. Enemies come from the Kenney Car Kit (sedan, van, truck, police-free variants recolored) and the Quaternius Ultimate Textured Cars (https://quaternius.com/packs/ultimatetexturedcars.html, CC0, verified). Remove any decals and recolor them in the Nightfall palette. No brand names are claimed anywhere.

## 6. Milestones (each one testable)
- **M1 Wide endless road.** `road.ts` chunk streaming, 24 m width, the old slab visuals kept. *Test:* drive 10 min with no hitch above 50 ms, `queryTrack` under 0.05 ms, the feel constants unchanged (a unit test asserts the `drive()` output for a scripted input matches v0.1).
- **M2 Combat core.** Rammer + Gunner, waves, lives, score, game over. HUD text repurposed. *Test:* scripted wave 1–3 is clearable; the hero dies in about 60 s with idle input; the result card shows the saved best.
- **M3 Full roster + pickups.** Mine Layer, Spiker, Drone, Boss on wave 5, and every pickup. *Test:* a debug key spawns each type and each pickup; unit tests for damage, drop tables and upgrade caps.
- **M4 Environment.** CC0 asset pipeline, biomes, lighting, mobile budget. *Test:* Playwright screenshots desktop and mobile; `renderer.info` shows ≤120 calls / ≤250k tris on coarse; Lighthouse asset weight ≤6 MB.
- **M5 Roadster model + polish.** New hero mesh with upgrade bolt-ons, enemy recolors, audio cues (reusing `audio.ts`), optional civilians, balance pass. *Test:* side-by-side silhouette check against v0.1, FPS check on a real phone, a 15-min playtest checklist.

## 7. Files that change
- `src/game/sim.ts`: biggest change. Waves, enemies, pickups, lives. `drive()` and `readInput()` are frozen and copied verbatim.
- `src/game/track.ts` → `road.ts`: chunked endless spline (keep the `poseAt`/`queryTrack`/`gapAhead` signatures).
- `src/game/world.ts`: chunk pool, asset loading (GLTFLoader + KTX2 + meshopt), lighting, new car meshes, pickup and enemy views. The renderer and `coarse` settings are extended, not replaced.
- `src/game/RoadsterGame.tsx`: HUD text and bindings only (wave, kills, pickup chips), result card fields, menu copy.
- `src/game/audio.ts`: pickup, boss, and wave sounds (synth, no files).
- New: `src/game/enemies.ts`, `src/game/pickups.ts`, `src/game/assets.ts`, `public/assets/v02/*`, `CREDITS.md`, plus tests.

## 8. Risks
- **Feel drift:** wider road and endless driving change how speed reads → keep the constants, test with a regression test, and add lane markings and streetlights for a sense of speed.
- **Mobile perf** with real assets → instancing, KTX2, a hard budget and auto-quality fallback. Fall back to stylized flat-shaded props if needed.
- **Asset style mismatch** (Kenney vs Quaternius vs PBR textures) → standardize on low-poly flat colors plus a few PBR road textures, all retinted in one palette.
- **Fire button overload** (guns + rockets on one key) → auto-select. Revisit only if playtests complain, because the brief freezes the controls.
- **Float precision / endless track** → origin rebasing every 2 km.
- **Bundle size / GitHub Pages caching** → hashed asset names, lazy-load biomes after the menu.
- **Licensing:** every asset must be CC0. Record the source URL per file in `CREDITS.md`, and reject anything CC-BY or "free for personal use".
