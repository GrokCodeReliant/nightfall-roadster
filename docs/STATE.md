# Nightfall Roadster v0.2: STATE (handoff, paused after Oct 16 2026)

## Preview URLs (GitHub Pages, repo GrokCodeReliant/nightfall-roadster)
- Live game (v0.1, untouched): https://grokcodereliant.github.io/nightfall-roadster/
- **v0.2 final:** https://grokcodereliant.github.io/nightfall-roadster/preview/v02-final/
- Earlier: /preview/v02-m3b/, /preview/v02-m5a/ (unlinked)
- Source: branch `v02` (never merged to main). Main gets only `preview/<name>/` folders.

## What works
- Vehicle combat on an endless procedural road (`src/game/road.ts`): waves; 6 enemy types (Rammer, Gunner, Mine Layer, Spiker, Drone w6+, Boss every 5th wave); pickups; lose one upgrade tier on death; 3 lives; pause menu (pause button or Esc; Resume / Restart / Back to menu with confirm; the sim and rollout freeze while open). Restart and Back to menu tear down the run: looping audio nodes stopped and disconnected (`audio.stopLoops`), rollout rig/robots detached and mixers uncached, city chunk meshes disposed on stage change, sim reset by `begin()`. Smoke checks no growth in scene objects, geometries or audio loop nodes after 2 menu round trips. Game over with Retry and Title (smoke-tested: reset, rollout replay/skip, new car + stage).
- Handling, input, HUD and v0.1 feel are frozen (proved by `tests/unit/handling.test.ts`). Camera: m3b pulled-back high chase cam; off-screen threat chevrons pulse red.
- Cars (title picker, same handling): Model 3 (2017), Model 3 Highland, Model 3 Performance, Roadster (2017), Roadster (2026) (display names; internal ids volt/volt_r/volt_rs/roadster/roadster2026, files sedan_compact*/roadster*). Phone loads <file>_phone; desktop loads <file>_hero from the folder build (the single-file HTML inlines phone LODs only). Title footer: 'An unofficial fan tribute by Grok Code Reliant studio. Not affiliated with or endorsed by Tesla, Inc.' No logos or badges anywhere. In on-screen text the robots are 'Optimus' and the rig is 'Semi' (none shown in-game today). GLBs with attach points read from nodes (wheels, thrusters, lamps, taillight, turret_mount, driver_seat); `body` material tinted red. Procedural hull fallback.
- All 6 enemy GLBs, collision radii/clamps sized to the meshes (`ENEMY` in `sim.ts`), placeholder fallback.
- EV audio (procedural WebAudio: motor whine, thruster roar, fan hum, tyre noise), mute respected.
- Run-start rollout (timeline in `world.ts`, outside the sim, skippable by tap/key): the rig arrives, the ramp lowers, then the doors open; robots (pass 5) idle at robot_spawn_A/B; the car starts on `bay_floor`, backs out hovering at bay height with thrusters lit and roaring, drops onto the road with a bounce, then hands over. Rear 3/4 camera blends into the gameplay camera.
- Stage select on the title: **Night City** (playable; `src/game/city.ts`: Art's city and road-kit GLBs, building rows on the 12 m grid, sidewalks, streetlights, water barriers, overpasses every 4th chunk, pole billboards, City v2 neon wall signs and city streetlights (twin 8 m + 6 m), ramp_launch/ramp_kicker as sidewalk set dressing (UCX_ collider nodes stripped at load, not used), boost gates = sign_fork pair with status_lamp cycling green/amber/red; pass on green = speed boost), Classic Night (the m5 slab scenery). Coast Road / Pine Woods / Open Highway / Industrial Port / Mountain Pass appear as "Coming soon".

## Known issues
- Puddles read as dark slashes on the road kit atlas; city facades are flat (no relief/trim; City v2 from Art addresses some).
- Draw calls over the 120 phone budget in combat (≈140-230 with enemies; city chunks are merged per material, ~3 draws/chunk). David's phone runs smooth.
- Not used yet: facade trim (fins_12, balcony_12, ac_12), jump_scaffold_4m, jump_overpass_gap, ramp_landing, all coast/ pieces (Coast Road stays 'Coming soon'), meshopt/KTX2 compression (city download ~6 MB as is).
- Tunnels (tunnel_40/portal) are not placed; the boost-gate "shortcut" is a speed boost on the main road, not a forked route (M8).
- The boost gate pokes hero speed from the render layer (world.ts), not the sim; move it into sim if gates become gameplay.
- Shipped CREDITS_LICENSE.md files (car/, rig/, enemies/) still contain internal notes such as 'license TBD' and 'pending IP Gate'; Art/Sara should clean them before itch or the live root.
- Headless tests are slow when the box is loaded (Blender jobs); run profiles separately with `NF_ONLY=phone|desktop`.

## What's next
1. Rest of M4/M8: real stages (Coast Road etc.), forks/shortcuts with stat gates, tunnels (hide `tunnel_roof` node while the camera is above), ramps.
2. M6 garage and progression (car unlocks, upgrade persistence).
3. M7 rig upgrade scene (robots wave/work clips exist).
4. Draw-call merging: instancing per enemy type, merge hero car further, KTX2 atlases.

## Build, test, publish
```
cd /workspace/studio/nightfall_roadster/repo_v02   # branch v02
npm ci && npx playwright install chromium          # after a box reboot (gh may also need reinstalling)
npm run typecheck && npm run test:unit             # handling, combat, m3, thrust
NF_TAG=final npm run build                         # -> ../v02_final/{nightfall-roadster/, *.html (single file, phone GLBs inlined), *.zip (index.html at zip root)}
NF_ONLY=phone node tests/smoke.mjs                 # smoke (boot, cars, stages, rollout, drive, fire, kill, 0 errors) + screenshots
node tests/e2e.mjs                                 # older full e2e (m3-era scenes)
```
Publish a preview: `git clone --depth 1 -b main https://github.com/GrokCodeReliant/nightfall-roadster /tmp/x`, copy the static folder to `preview/<name>/`, `git add preview/<name>` ONLY, commit, push; wait ~60 s; curl every file (200) and the root.

## Assets and conventions
- Source of truth: `/workspace/studio/nightfall_roadster/assets_v02/` (car/, enemies/, rig/, env/city/, env/road_kit/; READMEs: ENEMY_SPEC.md, CITY_README.md, KIT_README.md). Art sources: `/workspace/studio/art/`.
- Copied into `spa/public/assets/v02/{car,enemies,rig,city,kit}/`. `*_phone.glb` are inlined in the single-file HTML; atlases inlined via a LoadingManager URL modifier.
- Conventions: metres, +Y up, +Z forward, origin at ground centre, ≤6 materials, 1k textures; phone LOD on mobile (and `?enemylod=phone`), hero LOD on desktop. Atlas alpha = roughness (onBeforeCompile hook in city.ts). Node names are the attach contract (see world.ts `CAR_NODES`, rig `bay_floor`, `ramp`, `trailer_door_L/R`, `robot_spawn_A/B`).
