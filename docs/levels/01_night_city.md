# Stage 01: Night City (`city`)
**Version:** 1.1 · **Date:** 2026-11-20 (America/Denver) · **Status:** LOCKED (rules and layout). v1.1: race mode confirmed for this stage and tunnel = roof-hiding only (Sara Nov 20 7:07 PM); no layout or number changes. Buildable once the Build needs below land; no other engine change.
**Teaches:** *the course itself.* Ramps live on the road, walls glance, and you race a field to a finish line.
**Course length L:** 3600 m · **Time:** 90 s at V_REF 40 m/s (164 s worst case at SCROLL_MIN 22) · **Width:** 24 m, 4 lanes throughout · **Min radius:** nominal 220 m (peak 147 m on the 120 m chicane halves, inside today's ~143 m envelope)
**Shared rules and engine facts:** `00_LEVEL_FORMAT.md` (§1 table, §4 rules). Code read at `repo_v02` 83b01fa.

## Engine facts this stage relies on
- Road 24 m / lanes −9, −3, +3, +9 (road.ts:48-49). lat + = driver's right (road.ts:249). R+ = left turn (road.ts:72, 147).
- Full-width ramp piece 150 m, 5.4 m crest, kicker on 48–60 m (road.ts:104-108). Deck piece 250 m at 7.4 m (road.ts:109-115). Both are already on the driveable road, so ramps-inside-the-course works today. H2c chose "OUT" for the old sidewalk ramps (city.ts:154-156); this stage brings `ramp_kicker_1m` back **IN** as lane kickers (BN-4).
- Kicker launch `vy = max(8, 0.45·v)` (sim.ts:1317-1319). Every car always launches, because SCROLL_MIN 22 > the 15 m/s threshold.
- Airborne clamp keeps cars over the road (sim.ts:1252-1257). Hard landing shakes only (sim.ts:1326-1334).
- Wall glance and slide (sim.ts:1258-1290). Off-road reset 6 m / 0.85 s / 12 m back / 1.0 s invuln (sim.ts:227-233, 947-960).
- Race field: 6 rivals (sim.ts:204-209). Burst-ram (sim.ts:213-225). DNF at 140 m for 3 s (sim.ts:200-201).
- Boost gate: 6 s cycle, +10 m/s capped at 60, 2 s cooldown (world.ts:971-974, 1116-1122). **Today a gate does nothing for a car already at its top speed**, because `drive()` re-clamps to the car cap (sim.ts:1196-1197). BN-9 makes a green pass a 2.0 s cap raise of +10 m/s (≤ 60). Every gate in these specs assumes BN-9.
- City kit: building rows on a 12 m grid, sidewalks at ±(12 + 6.35) (city.ts:107-132), deck barriers (city.ts:141-147).
- Stage id `city` already exists and is `ready: true` (world.ts:474). Today it runs the endless wave loop with random pieces; this spec replaces that with an authored race course (BN-1, BN-2).

---

## 1. Track layout (ordered sections)
s is measured from the race start line. Time is at 40 m/s.

| # | Name | s0–s1 (m) | Len | Time | Curve | Piece | Edges L/R | Notes |
|---|---|---|---|---|---|---|---|---|
| NC-0 | Lantern Row (grid) | 0–300 | 300 | 7.5 s | straight | road | soft/soft | Rollout lands here. Field on the grid. No hazards |
| NC-1 | Glassline Avenue | 300–560 | 260 | 6.5 s | R+450 (θ 33°) | road | soft/soft | Gate G1 at 480 |
| NC-1a | Hump approach | 560–620 | 60 | 1.5 s | straight | road | soft/soft | RAMP sign board at 490 (130 m before) |
| NC-2 | Hump Street (Ramp R1) | 620–770 | 150 | 3.75 s | straight | **ramp** | rail/rail | Full-width ramp. Crest 5.4 m at 680 |
| NC-3 | Market Arc | 770–1070 | 300 | 7.5 s | R−300 (θ 57°) | road | soft/soft | 3 single-lane barricades (hazards §5) |
| NC-4 | Twin Arc (**Fork A**) | 1070–1470 | 400 | 10 s | R+250 (θ 92°) | **split** | soft/soft | Median 1080–1460 |
| NC-5 | Overpass Mile | 1470–1700 | 230 | 5.75 s | straight | road | soft/soft | Overpasses at 1500 / 1560 / 1640. Gate G2 at 1600 |
| NC-6 | Underpass Nine (**tunnel**) | 1700–1940 | 240 | 6 s | straight to 1800, then R−800 (θ 10°) | tunnel | rail/rail | 6 × tunnel_40 |
| NC-7 | Spire Bridge (**deck**) | 1940–2190 | 250 | 6.25 s | straight | **deck** | rail/rail | 7.4 m flyover over the district |
| NC-8 | Chicane Blocks | 2190–2430 | 240 | 6 s | R+220 for 120 m, then R−220 for 120 m (θ ±31°) | road | soft/soft | 2 two-lane barricade rows |
| NC-8a | Rooftop approach | 2430–2490 | 60 | 1.5 s | straight | road | soft/soft | RAMP board at 2360 |
| NC-9 | Rooftop Hop (Ramp R2) | 2490–2640 | 150 | 3.75 s | straight | **ramp** | rail/rail | Crest at 2550 |
| NC-10 | Works Cut (**Fork B**) | 2640–2960 | 320 | 8 s | straight | **split** | soft/soft | Median 2700–2950 (60 m buffer after R2; furthest landing 2684) |
| NC-11 | Finale Sweep | 2960–3360 | 400 | 10 s | R−400 (θ 57°) | road | soft/soft | Clean, so rivals can be fought |
| NC-12 | Finish Plaza | 3360–3600 | 240 | 6 s | straight | road | soft/soft | Gate G3 at 3420. **Finish gantry at 3600.** 300 m run-out after |

Sum = 3600 m. Net heading never loops (cumulative +33°, −24°, +68°, +58°, +58°, +1°), so the road never crosses itself (centreline check: closest non-adjacent approach 278 m). All curves ease over 40 m with peak curvature scaled (00_LEVEL_FORMAT §2).

## 2. Forks and shortcuts
Both forks are **median splits** on the standard 24 m road (BN-3): a jersey-barrier line at lat 0, collider half-width 0.3 m. Each side is 2 lanes (12 m). The main road is always passable on both sides, and both sides rejoin when the median ends (a guardrail_end nose at each end). A fork sign with a status lamp sits 120 m before each median.

### Fork A: Twin Arc (NC-4, median 1080–1460, rejoin at 1460)
| Side | Lanes | Path length (lane centre) | Risk | Reward |
|---|---|---|---|---|
| **Inside (left, lat < 0)** | L1 −9, L2 −3 | 385.6 m (L1) / 395.2 m (L2) | Barricade block on L2 at 1190 and on L1 at 1330: a forced lane swap on a tight arc. A glance costs ×0.85 speed and 6 hp | Up to **28.8 m (0.72 s)** shorter than the outer lane. Typically 9.6–19 m |
| Outside (right, lat > 0) | L3 +3, L4 +9 | 404.8 m (L3) / 414.4 m (L4) | Longer line. 3 rivals usually take it (lanes +3, +6, +9), so burst-ram traffic | Pickup crate on L4 at 1260. **Gate G-A at 1380** (right kerb + median): +10 m/s if green |
Path length = (R + lat) · θ, with R = 250 and θ = 1.6 rad.

### Fork B: Works Cut (NC-10, median 2700–2950, rejoin at 2950)
| Side | Risk | Reward |
|---|---|---|
| **Construction (right, lat > 0)** | Barricade row 1 closes L4 at 2725; row 2 closes L3 at 2855. Only one lane is open at each row, so mis-weaving means a glance | **Lane kickers** K-B1 (L4, lip at 2717) and K-B2 (L3, lip at 2847) launch you over each row at full speed: no weave, no speed loss. Crate on L4 at 2905 |
| Clean (left, lat < 0) | No hazards. 3 rivals by default (lanes −3, −6, −9) mean burst-ram exposure | Safe and predictable |
Both sides are the same length (the section is straight). The risk/reward is speed kept versus a clean line.

## 3. Ramps inside the course
| Ramp | Type | Position | Approach | Launch | Landing |
|---|---|---|---|---|---|
| R1 Hump Street | Full-width `ramp` piece (engine-ready) | 620–770. Kicker flag 668–680, crest 5.4 m | 60 m straight (NC-1a) plus a sign board at 490 | All 4 lanes. Any car ≥ 15 m/s, so always | On the descent or flat run-out (table below). Rail edges |
| R2 Rooftop Hop | Full-width `ramp` piece | 2490–2640. Kicker 2538–2550 | 60 m straight (NC-8a) plus a board at 2360 | All lanes | Same table, offset +1870 m |
| K-B1 | Lane kicker `ramp_kicker_1m` (6.04 × 1.16 × 5.3 m) | L4 (lat +9 ± 3.0), lip at 2717 | 17 m in-lane after the median start (lane is straight from 2640) | vy = max(8, 0.45·v) | Barricade row at lip + 8 m. Cleared at every speed (at 22 m/s the car is 1.96 m up at +8 m; a barricade is 1.26 m) |
| K-B2 | Lane kicker | L3 (lat +3 ± 3.0), lip at 2847 | 122 m after the K-B1 landing | same | Row at lip + 8 m |

**Landing table for the full-width ramps** (from the engine formula, launch at 48 m into the piece; d = distance from the piece start):
| Speed | Air time | Landing d (R1 s / R2 s) | Apex (world y) | Landing vy |
|---|---|---|---|---|
| 22 m/s (floor) | 0.62 s | 62 (682 / 2552) | 6.3 m | −6.8 (soft) |
| 30 | 1.00 s | 78 (698 / 2568) | 7.8 m | −13.6 (hard: shake) |
| 40 | 1.42 s | 105 (725 / 2595) | 10.5 m | −20.3 (hard) |
| 48 (Model 3 cap) | 1.74 s | 131 (751 / 2621) | 13.1 m | −25.3 (hard) |
| 54 (Model S cap) | 1.96 s | 154 (774 / 2644) | 15.4 m | −28.7 (hard) |
| 64 (Model S track mode, or a gate boost to 60+) | 2.27 s | 194 (814 / 2684) | 19.8 m | −32.6 (hard) |
| Roadster 40 (float) | 1.84 s | 122 (742 / 2612) | 11.8 m (hop cap) | soft (Roadster) |
| Roadster 58 boosting | 1.91 s | 159 (779 / 2649) | 11.8 m | soft |
**Lane kicker flight on flat road:** 22 m/s → 16 m, apex 2.0 m · 30 → 30 m, 3.5 m · 40 → 53 m, 6.1 m · 48 → 77 m, 8.8 m.

**Bad landing:**
1. Off-road landing is impossible, because the airborne clamp keeps the car inside the edge.
2. A hard landing (vy < −10) gives shake only and no damage, as today.
3. A yawed landing (> 35°) uses the tire-blow reset **in place**: no backstep, 1.0 s invuln, hp kept (BN-13, should). It is the same feedback and rules as the off-road reset.
4. Landing on the median band is prevented by the buffer: the furthest R2 landing is 2684 (64 m/s), and the median starts at 2700.
5. Ramp and deck sides are `rail`, so no committed leave from height.

## 4. Tunnels and set pieces
- **Underpass Nine (NC-6, 1700–1940):** 6 × `tunnel_40` plus 2 × `tunnel_portal`. Edges are rail (the tunnel walls).
  - No gates, ramps or kickers within ±60 m (data check: nearest is G2 at 1600).
  - Roadster hop clamp: y ≤ road + 6.5 m inside (BN-7). The tunnel is 9.7 m tall.
  - Camera: unchanged. The chase cam sits 13.5 m above the car (world.ts:49), so it is above the 9.7 m roof. The roof node hides while the camera is above it (STATE.md:27). **Roof-hiding only; an in-tunnel camera stays flagged and out of scope (Sara Nov 20 7:07 PM).**
  - Lighting: emissive strip every 8 m. Exit flare at 1940 hands straight onto the Spire Bridge climb.
- **Spire Bridge (NC-7):** the deck piece flies 7.4 m over a lower street grid. Water barriers line both kerbs at deck height (existing city.ts:141-147). The district skyline opens up below on both sides.
- **Overpass Mile (NC-5):** 3 × `overpass_60x12` across the road at 1500, 1560 and 1640. Decor only, overhead. None within 80 m of a ramp span.
- **Finish Plaza (NC-12):** finish gantry at 3600, neon district wall both sides, start/finish checker paint.

## 5. Hazards
All obstacles follow the OB rule (00_LEVEL_FORMAT §4.8): glance to the free side, ×0.85 along-speed (floor 22), hero −6 hp, AI −4 hp, 0.5 s cooldown, not shootable. No hazard shoves toward a wall.

| ID | Hazard | Where | Size / collider | Behaviour |
|---|---|---|---|---|
| HZ-1 | Single-lane barricade (2 × `barricade_3m`) | NC-3: L4 at 860, L1 at 940, L4 at 1010 | 5.8 m lat × 0.73 m along | Static, OB rule |
| HZ-2 | Fork A blocks | L2 at 1190, L1 at 1330 | 5.8 × 0.73 | Static |
| HZ-3 | Chicane rows (4 × `barricade_3m` each) | NC-8: L1+L2 at 2260; L3+L4 at 2380 | 11.6 m lat × 0.73 m | Static. 12 m always open |
| HZ-4 | Works rows | NC-10: L4 at 2725, L3 at 2855 | 5.8 × 0.73 | Static, with kickers 8 m before |
| — | Water barriers, cones, kerb decor | kerbs | none | Decor only, no collision |
Total colliders: 11 rows. Lanes never closed > 2 of 4 (main) or 1 of 2 (fork side).

## 6. Rival behaviour (Night City)
- Field unchanged: 6 rivals, 160 HP, speeds 29 / 32 / 30 / 34 / 28 / 33 m/s. **Stage rival bonus +0 m/s** (first stage).
- **This stage is a race** (resolved, Sara Nov 20 7:07 PM): place pays, combat is secondary. Waves and hunters are muted while the race is armed (sim.ts:1582). **Harass roles stay out of the race field** per H3.2 (WEEK_H3_SPEC.md:41; WEEK_H_TRIAL_NOTES.md:35): no Drone, Mine Layer, Spiker or Armored Hauler.
- Forks: a rival takes the side of its current lateral sign (spawn lanes −6, −3, −9 go inside/left; +6, +3, +9 go outside/right). Rivals glance off the barricades under the same OB rule. That is the inside line's real risk for them too.
- Rivals launch off R1, R2 and the kickers with the same formula (the kicker check is not hero-only, sim.ts:1317).
- Burst-ram (should, BN-14): not while either car is airborne, nor within 30 m before R1, R2, K-B1, K-B2 or a barricade row. This avoids a burst landing the rival on an obstacle.
- Tunnel: no special rule. It is a natural pack-up point, where the burst-ram happens most.
- Race purse: WEEK_H H2 table unchanged (economy not in scope).

## 7. Difficulty position
Stage 1 of 6. New thing taught: **ramps on the road plus walls that glance**. Hazards are static and sparse (11 rows), there are no surfaces, curves are wide (R ≥ 220), and the rival bonus is 0. Forks are introduced gently: both sides are safe enough to finish clean.

## 8. Edge cases
1. **Off-road reset inside a fork** must land at lat ±6 on the side the car was on, not lane 0 (the median). Same for the wreck respawn (`loseLife`, sim.ts:1008) and `safeSpawnS` (sim.ts:935-940).
2. **Reset backstep onto an obstacle or kicker:** the 12 m backstep must skip forward or back to a clear spot if the target overlaps a collider or a kicker window ±6 m.
3. **Committed leave through a soft edge in a city section:** the sidewalk spans lat 12.35–24.35 and buildings start at 24.35. The reset fires at 18 m. At the lateral cap of 14 m/s the car can reach 24 m before the 0.85 s timer ends. Build should confirm the car never renders inside a facade (cheap fix: in city zones, clamp hero lat to ≤ 22 m while off-road).
4. **Roadster hop over the median:** allowed. A car more than 1.0 m above the deck passes over, so switching sides by hopping is legal.
5. **Roadster in the tunnel:** hop clamp 6.5 m. Boost may still add speed.
6. **Model S track mode (64 m/s) on R2:** furthest landing 2684, apex 19.8 m. The median starts at 2700, so it is safe. If Build ever raises a cap above 64, re-check this buffer.
7. **Gate pass while airborne:** counts (the gate is an along-line test).
8. **Rival killed on a ramp:** its wreck falls to the road. Not a collider.
9. **Brake held all stage:** the car runs at 22 m/s and finishes in ~164 s. Rivals finish first, giving the 4th purse or a DNF if 140 m behind the last rival for 3 s (expected DNF; that is correct race feel).
10. **Stage switch:** the course table must rebuild the track at `begin()` (today `park()` only rebuilds when the track was trimmed, sim.ts:675).
11. **Procedural city rules off:** no auto overpass every 4th chunk (city.ts:148) and no auto gate every 6th (city.ts:151) on the authored course.

## 9. Headless test checks (node:test, same harness as tests/unit/race.test.ts)
1. Course table: sections are contiguous, sum to 3600, and the finish is at 3600.
2. Heading change over NC-4 = +1.60 rad ± 0.02 (left). Over NC-3 = −1.00 ± 0.02. Over NC-8 the net is ≈ 0.
3. `begin()` with `stageId = "city"`: `race.armed`, RACE_DIST 3600, 6 rivals, no wave spawns after 30 s.
4. `poseAt(140 + 680).y` = 5.4 ± 0.05; kicker true only on s 668–680 (+140 absolute); deck y = 7.4 on 2010–2120.
5. Bot straight at 40 m/s through R1: airborne once, lands at d = 105 ± 10, hp unchanged, no off-road reset.
6. Hold brake the whole stage: along-speed ≥ 22 every frame; finish or DNF reached; zero dead-stops.
7. Steer into the left wall through NC-3 for 3 s: along-speed ≥ 22, slide events fire, no reset. On NC-2, NC-6 and NC-7 (rail), a full committed steer-out never triggers `offroadReset`.
8. Fork A, inside side: steer right into the median for 2 s. lat stays ≤ −1.45, speed ≥ 22.
9. Drive L4 into HZ-1 at 860: one contact, speed ×0.85 ± 0.02 (≥ 22), hp −6, lateral moved off L4, no stop.
10. K-B1: a car on L4 at 22, 30 and 40 m/s is airborne over s 2725 (y > 1.3 m above road) and lands after 2726.
11. Roadster boosting inside NC-6: max (y − road y) ≤ 6.5.
12. Off-road reset forced inside NC-4 on the left side: reset lat = −6 ± 0.5.
13. Gate G1 deterministic phase: crossing at a green time → +10 m/s (cap 60); at red → no change.
14. Reaching s 3600 → phase `finished`, place 1–4 frozen.
15. Bot completes the stage with each of the 6 cars, with no thrown errors. Phone smoke: report draws and tris on NC-0, NC-6 and NC-12 (soft gate 120 draws).

## 10. Build needs for this stage
BN-1, BN-2, BN-3, BN-4, BN-5, BN-6, BN-7, BN-9, BN-11, BN-12 (must) · BN-13, BN-14 (should). See `00_LEVEL_FORMAT.md` §5. Nothing else: no width change, no per-side height, no gaps, no surfaces.

---

## ART LIST: Night City
**Licence rule:** every asset is original studio work (Art & Assets) or a free asset cleared for commercial use (CC0 preferred), logged in CREDITS. No real brands, logos, text or real place names. Billboards and neon use generic art only. Open Kit candidacy of new pieces is Art/Veil's call; this list doesn't change the Open Kit.
**Budget:** ≤ 120 draws, ≤ 250k visible tris, ≤ 6 MB for the city environment on phone (V02_PLAN.md:165). Reuse `city_atlas.png` / `road_kit_atlas.png`; no new texture unless noted.
**Axes:** GLB +X = driver's LEFT (KIT_README). "Left/right" below means the driver's view.

### A. Scenery zones per section
| Section | Zone | Both sides | Counts (approx.) |
|---|---|---|---|
| NC-0 Lantern Row | Neon storefront grid | `bldg_*` rows 1–2 floors on storefront cells, neon signs on 70% of fronts, twin 8 m streetlights every 20 m. **Start grid paint** on the road | 8 chunks × 2 sidewalks = 16 `sidewalk_12x40`, ~24 building stacks, ~16 neon, 15 streetlights |
| NC-1/1a Glassline Ave | Glass curtain-wall offices, 3–4 floors | `bldg_mid/top` glass cells, `facade_fins_12` on every 2nd front, pole billboards ×3 | 8 chunks: 16 sidewalks, ~24 stacks, 12 fins, 3 billboards |
| NC-2 Hump Street | Ramp dressing | **Ramp lip chevron board** across 24 m at the kicker, hazard-stripe kerb paint, water barriers at deck height (existing), 1 RAMP sign board (existing) | 1 chevron board, ~60 water barriers |
| NC-3 Market Arc | Market street: residential over shops | `facade_balcony_12` and `facade_ac_12` on 50% of fronts, neon cup/bowl signs, traffic cones by barricades | 8 chunks; 12 balcony, 12 AC, 10 neon, 18 cones |
| NC-4 Twin Arc | Median and fork | `barrier_jersey_4m` median line, 2 `guardrail_end_4m` noses, `sign_fork` ×2 at 960, gate G-A pair at 1380 | 95 jersey, 2 ends, 4 sign_fork |
| NC-5 Overpass Mile | Elevated rail district | `overpass_60x12` ×3, roof billboards ×4, gate G2 pair | 3 overpasses, 4 `billboard_roof_12x6`, 2 sign_fork |
| NC-6 Underpass Nine | Tunnel | `tunnel_40` ×6, `tunnel_portal` ×2, **tunnel light strip** every 8 m (both walls) | 6 + 2, 60 strips |
| NC-7 Spire Bridge | Skyline below the deck | Low skyline slabs (existing procedural or `bldg_top_24x24` at −10 m), deck water barriers (existing), wall billboards on 2 towers | ~90 water barriers, 8 tall stacks, 2 `billboard_wall_8x4` |
| NC-8/8a Chicane Blocks | Construction blocks | `barricade_3m` rows, cones, **work-light tower** ×4, plywood hoarding (reuse `bldg_base` industrial cells) | 8 barricades, 30 cones, 4 light towers |
| NC-9 Rooftop Hop | Ramp dressing | Same as NC-2 | 1 chevron board, ~60 water barriers |
| NC-10 Works Cut | Fork and construction | Median jersey line, 2 ends, `sign_fork` ×2, **`ramp_kicker_1m` ×2 in-lane** (moved IN from the sidewalk), barricades, cones | 63 jersey, 2 ends, 2 kickers, 4 barricades, 20 cones |
| NC-11 Finale Sweep | Dense neon towers | Tallest stacks (4 floors), neon on 80%, pole billboards ×4 | 10 chunks; ~30 stacks, ~24 neon, 4 billboards |
| NC-12 Finish Plaza | Plaza | **Finish gantry**, checker paint, neon walls both sides, gate G3 pair | 1 gantry, 2 sign_fork |

### B. Props and set-piece counts (totals)
| Asset | Status | Count | Size (W × H × L m) |
|---|---|---|---|
| `sidewalk_12x40` | existing | ~150 | 12 × 1.4 × 40 |
| `bldg_base/mid/top_*` | existing | ~250 stacks (procedural rows) | 12/24 m grid, 12 m floors |
| `facade_fins_12` / `facade_balcony_12` / `facade_ac_12` | existing, **first use** | 24 / 12 / 12 | see CITY_README |
| `neon_*` (6 kinds) | existing | ~70 | 0.2 × 1.2–2.9 × 2–4.4 |
| `streetlight_city_twin_8m` / `_6m` | existing | ~180 / ~180 | 3.55 × 8 / 1.98 × 6 |
| `billboard_pole_12x6` / `_roof_12x6` / `_wall_8x4` | existing | 10 / 4 / 2 | per README |
| `overpass_60x12` | existing | 3 | 60 × 17.7 × 12 |
| `tunnel_40` / `tunnel_portal` | existing, **first placement** | 6 / 2 | 28.4 × 9.7 × 40 / 32 × 13.2 × 1.1 |
| `barrier_jersey_4m` | existing (kit) | 158 | 0.6 × 0.85 × 4 |
| `guardrail_end_4m` | existing (kit) | 4 | 0.45 × 0.95 × 4.2 |
| `sign_fork` (+ status_lamp) | existing (kit) | 14 | 3.6 × 4.45 × 0.16 |
| `barricade_3m` | existing | 22 | 2.9 × 1.26 × 0.73 |
| `ramp_kicker_1m` | existing, **IN-lane** | 2 | 6.04 × 1.16 × 5.3 |
| `traffic_cone` | existing | ~70 | 0.42 × 0.75 × 0.42 |
| `water_barrier_2m` | existing | ~210 | 0.5 × 0.9 × 1.96 |
| `crate` | existing (kit) | 2 | 1.44 cube |

### C. New assets needed (original, studio-made)
| Asset | Size | Budget | Notes |
|---|---|---|---|
| `finish_gantry_24` | 30 W × 10 H × 2 D m, spans 24 m road plus kerbs | ≤ 600 tris, city_emissive, 1 draw | Checker band plus neon edge. **No text or logos.** Shared by all stages (palette swap per stage OK) |
| `start_grid_paint_40` | 24 × 40 m overlay | ≤ 150 tris, kit atlas | Staggered grid boxes for 7 cars plus a start line. Shared |
| `ramp_lip_chevron_24` | 24 W × 1.2 H × 0.3 m | ≤ 200 tris | Chevron board along the full-width ramp kicker (48–60 m in) so the ramp reads as intentional |
| `tunnel_light_strip_4m` | 0.15 × 0.1 × 4 m | ≤ 24 tris, city_emissive | Instanced; 60 placed |
| `work_light_tower` | 2 × 6 × 2 m | ≤ 400 tris | Construction zone dressing. Not a collider |
Not needed this stage: `ramp_launch_2p5m`, `ramp_landing_2p5m`, `jump_scaffold_4m` and `jump_overpass_gap` stay unused (they need per-lane height, BN-15). Keep them for Port and Pass.
