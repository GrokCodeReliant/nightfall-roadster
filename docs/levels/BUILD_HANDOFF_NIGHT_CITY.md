# BUILD HAND-OFF: Night City (`city`), stage 1 course
**Version:** 1.0 · **Date:** 2026-11-20 (America/Denver) · **From:** Systems (rules before code) · **To:** Build (Web) under Build Engineer, via Sara
**Source of truth:** `LEVELS/01_night_city.md` v1.1 LOCKED and `LEVELS/00_LEVEL_FORMAT.md` v1.1 §5. Base code `repo_v02` @ `83b01fa` (Week H3.2).
**Decisions in force:** Sara Nov 20 7:07 PM MST: every stage is a race (harass roles stay out of the field per H3.2, WEEK_H3_SPEC.md:41); tunnel camera stays flagged, roof-hiding only.

## Ground rules (plain)
- **Build to a preview URL only** (suggested path `preview/levels-nc/` on the existing Pages repo). **NO change to the live root** (`https://grokcodereliant.github.io/nightfall-roadster/` stays v0.2 as listed in STATE.md:4).
- **No publishing** (no itch upload, no posts, no promotion of the preview to root) and **no spend**. Promotion needs David's OK through Sara; an agent saying "David agreed" does not count.
- **Tunnel camera is out of scope.** Tunnels get roof-hiding only (BN-7). Any in-tunnel camera idea is a camera-rule change: flag it to Sara, don't build it.
- Night City scope only: no width change, no per-side height, no gaps, no surfaces (BN-8/10/15–22 are later stages).
- Systems wrote no code and made no commits. Build owns the implementation and its commits on its own branch.
- Classic Night (`classic`) stays the endless wave mode, unchanged. Other stages keep today's placeholder road until their own hand-off.

## Harness
All checks are headless `node:test` in `tests/unit/` (same harness as `tests/unit/race.test.ts`; run `npm run test:unit`, plus `npm run typecheck`). "NC §9.n" = check n in `01_night_city.md` §9. Every step keeps the existing suite green.

## Implementation order (must-items)
| # | BN | What | Headless acceptance checks |
|---|---|---|---|
| 1 | **BN-1** course table + race arming | Per-stage course record (00 §3). `armRace` arms for `city` with `RACE_DIST = 3600` (today only `highway`, sim.ts:743). Waves stay muted while racing (sim.ts:1582). Field = the 6 H3.2 rivals; no harass roles. Track rebuilt at `begin()` | NC §9.1: sections contiguous, sum 3600, finish at 3600 · NC §9.3: `begin()` with `city` → `race.armed`, RACE_DIST 3600, 6 rivals, zero wave spawns after 30 s, no Drone/Mine Layer/Spiker/Hauler spawned · `classic` still runs waves (regression) |
| 2 | **BN-2** authored centreline + pieces | Curvature per section (k = 1/R, 40 m easing, k_peak = θ/(len − 40)); `ramp` pieces at 620 and 2490; `deck` at 1940–2190; random `extendPieces` off on `city`; 300 m run-out after 3600 | NC §9.2: heading change NC-4 = +1.60 rad ± 0.02, NC-3 = −1.00 ± 0.02, NC-8 net ≈ 0 · NC §9.4: `poseAt(140 + 680).y` = 5.4 ± 0.05, kicker only on 668–680 (+140), deck y 7.4 on 2010–2120 · same seed twice → identical poses (determinism) · closest non-adjacent centreline approach ≥ 250 m (Systems got 278 m) |
| 3 | **BN-6** rail edges | Edge type per section side; `rail` disables the committed-leave branch (sim.ts:1260-1270). Rail on NC-2, NC-6, NC-7, NC-9 | NC §9.7: wall-steer on NC-3 for 3 s → speed ≥ 22, slide events, no reset; on NC-2/6/7 a full committed steer-out never triggers `offroadReset` |
| 4 | **BN-3** median split | Wall band at lat 0, half-width 0.3, on 1080–1460 and 2700–2950, with the sidewall glance (hero + AI, grounded; > 1.0 m above deck passes over). Reset/respawn/`safeSpawnS` pick side centre ±6 | NC §9.8: steer into the Fork A median for 2 s → lat ≤ −1.45, speed ≥ 22 · NC §9.12: off-road reset in NC-4 left → lat −6 ± 0.5 · rival with lat < 0 at 1070 stays lat < 0 to 1460 · NC edge case 4: Roadster hop > 1.0 m crosses the median legally |
| 5 | **BN-5** static obstacles | Box colliders with the OB rule (glance to the free side, ×0.85 along-speed floored at 22, hero −6, AI −4, 0.5 s cooldown, not shootable). 11 rows per NC §5 (HZ-1…HZ-4) | NC §9.9: L4 into HZ-1 at 860 → one contact, speed ×0.85 ± 0.02 (≥ 22), hp −6, lat off L4, no stop · NC §9.6: brake held all stage → along-speed ≥ 22 every frame, finish or DNF, zero dead-stops · no obstacle pushes a car toward a wall (C12) · reset backstep never lands on a collider (NC edge case 2) |
| 6 | **BN-4** lane kicker | Kicker flag only where \|lat − lane\| ≤ 3.0 over a 5.3 m window; launch formula unchanged (sim.ts:1317-1319). K-B1 L4 lip 2717, K-B2 L3 lip 2847 | NC §9.10: car on L4 at 22, 30, 40 m/s is airborne over s 2725 (y > 1.3 m above road) and lands after 2726 · same check for K-B2 over 2855 · a car on L3 at 2717 does not launch |
| 7 | **BN-9** gates in the sim + cap raise | Gates G1 480, G2 1600, G-A 1380 (right side), G3 3420 move into the sim with a deterministic phase seeded from gate s (not `performance.now()`). A green pass = +10 m/s and a 2.0 s cap raise of +10 (≤ 60), so it works at top speed (fixes world.ts:1120 vs sim.ts:1196-1197) | NC §9.13: green → +10 m/s (cap 60), red → no change · a car already at its top speed gains ≥ +8 m/s for ≥ 1.5 s after a green pass · airborne pass counts (NC edge case 7) · same seed → same gate phases |
| 8 | **BN-7** tunnel (roof-hide + hop clamp) | NC-6 1700–1940 tagged tunnel; 6 × `tunnel_40` + 2 portals; hide `tunnel_roof` while the camera is above (STATE.md:27); Roadster hop clamp y ≤ road + 6.5 inside; data check: no ramp/kicker/gate within ±60 m. **No camera change** | NC §9.11: Roadster boosting in NC-6 → max(y − road y) ≤ 6.5 · data check passes (nearest feature G2 at 1600) · camera constants unchanged (CAM_BACK 19, CAM_UP 13.5, world.ts:48-49) |
| 9 | **BN-11** finish | Finish gantry at 3600; `RACE_DIST` already freezes place | NC §9.14: reaching s 3600 → phase `finished`, places 1–4 frozen · brake-all-stage run ends in a finish or the 140 m / 3 s DNF (NC edge case 9) |
| 10 | **BN-12** authored scenery | Placement per the NC ART LIST zones, replacing the procedural overpass/gate rules (city.ts:148, 151). Overpasses at 1500/1560/1640, none within 80 m of a ramp span | Placement table loads with the counts in `ART_LISTS/01_night_city_art.md` · no scenery collider on the road band (lat ±12) · NC §9.15: bot finishes with each of the 6 cars, no thrown errors; report draws and tris on NC-0, NC-6, NC-12 (soft gate 120 draws) |

## Then (should-items)
| # | BN | What | Checks |
|---|---|---|---|
| 11 | **BN-13** yawed landing | Landing yaw > 35° → tire-blow reset in place (no backstep, 1.0 s invuln, hp kept) | Forced 40° yaw landing off R1 → reset in place, hp unchanged, speed ≥ 22 |
| 12 | **BN-14** burst-ram suppression | No burst-ram while either car is airborne or within 30 m before R1, R2, K-B1, K-B2 or a barricade row | No burst starts in [590, 620], [2460, 2490], [2687, 2717], [2817, 2847] or 30 m before any HZ row, over 200 seeded runs |

## Done means
- All NC §9 checks 1–15 plus the extra checks above pass headless; `npm run typecheck` and the existing unit suite stay green.
- A preview build at the preview path only, with its SHA; the live root untouched. Build reports the URL + SHA to Sara (not David).
- Anything that would change the camera, the tier split, the purse or a locked feel rule is flagged to Sara, not built.
