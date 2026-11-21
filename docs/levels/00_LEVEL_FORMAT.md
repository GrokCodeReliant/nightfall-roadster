# Nightfall Roadster: level format, shared rules and Build needs (Systems)
**Version:** 1.1 · **Date:** 2026-11-20 (America/Denver) · **Status:** LOCKED (shared by every stage spec in this folder)
**v1.1:** Sara's calls folded in (Nov 20 7:07 PM MST): (a) all six stages are races; (b) a bridge-gap fall resets like off-road; the tunnel camera stays flagged (roof-hiding only). All six stage specs are now LOCKED.
**Source:** David GO via Sara, Nov 20 2026 6:41 PM MST: Nightfall unparked for level design.
**Code read:** `repo_v02` branch `v02`, detached at **83b01fa** (Week H3.2, 2026-11-05 MST). Text design only; no production code.

---

## 1. Engine facts every stage relies on (file:line in `repo_v02/src/game/`)
| Fact | Value | Where |
|---|---|---|
| Track sample step | 2 m | road.ts:47 `STEP` |
| Road width / lanes | 24 m, 4 lanes of 6 m, lane centres −9 / −3 / +3 / +9 | road.ts:48-49 |
| Lateral sign | `lateral > 0` = driver's RIGHT (road right vector) | road.ts:249 |
| Curvature sign | positive curvature turns LEFT (heading `h` grows, forward = (−sin h, −cos h)) | road.ts:72, 130, 147 |
| Today's curvature envelope | ≤ ~0.007 rad/m (R ≈ 143 m), seeded sines | road.ts:69-73 |
| Start straight | first 320 m have no curvature | road.ts:50 |
| Hero start | `START_S = 140` m along | sim.ts:522 |
| Full-width ramp piece | 150 m: 0→5.4 m over 60 m, kicker flag on 48–60 m, 90 m descent | road.ts:104-108 |
| Elevated deck piece (old void) | 250 m: up to 7.4 m over 70 m, solid deck, 70 m down. No hole | road.ts:109-115 |
| Warning sign | board 130 m before a piece | road.ts:82 |
| Kicker launch | grounded, speed > 15 → `vy = max(8, 0.45·v)` (× 1.25 Roadster) | sim.ts:1317-1319, RAMP_ASSIST sim.ts:341 |
| Gravity | 27 m/s² (Roadster floats at 0.45×, hop ≤ 7.5 m) | sim.ts:332, 336, 339 |
| Hard landing | vy < −10, non-Roadster → shake (+0.35 trauma), **no damage** | sim.ts:1326-1334 |
| Airborne clamp | airborne hero is pushed back inside the road edge (can't land off-road) | sim.ts:1252-1257 |
| Scroll floor | along-speed never below `SCROLL_MIN = 22` m/s | sim.ts:218, 942-944 |
| Wall glance | push ≤ 18 m/s·dt back in, lat ≥ 4 m/s inward, 0.28 s slide assist, along-speed kept | sim.ts:1258-1290, `WALL_SLIDE` sim.ts:235 |
| Committed leave | steer-out > 0.55 and depth > 0.45 m passes the edge | sim.ts:1260-1261 |
| Off-road reset | > 6 m past edge for 0.85 s → tire-blow, lane 0, 12 m back, 1.0 s invuln, hp kept | sim.ts:227-233, 947-960, 1301-1308 |
| Void fall (unused today) | −40 hull + respawn on solid road | sim.ts:966-990, 1310-1314 |
| Speed caps | Model 3 48 / Y 46 / X 50 / S 54 (64 track) / Cybertruck 44 / Roadster 52 (58 boosting) | sim.ts:365-372, 344 |
| Race field | 6 rivals, 160 HP, offsets −36…+110 m, speeds 29/32/30/34/28/33 m/s | sim.ts:204-209 |
| Rival lanes | −6, +6, −3, +3, +9, −9 | sim.ts:2053 |
| Burst-ram | same lane ≤ 12 m → 64 m/s burst, rear ram 28 / self 8 | sim.ts:213-225 |
| Race distance / DNF | 2200 m; DNF if 140 m behind last rival for 3 s | sim.ts:197-202, 1457-1482 |
| Race armed only on | `stageId === "highway"`; other ids run waves | sim.ts:743, 1582 |
| Boost gate (render layer) | 6 s cycle: green 3 / amber 1.2 / red 1.8; green pass = +10 m/s (cap 60), 2 s cooldown | world.ts:971-974, 1116-1122 |
| Chunk streaming | 40 m chunks (20 samples), 2 behind, 7 ahead phone / 9 desktop | world.ts:905-908 |
| Camera | chase cam 19 m back, 13.5 m up, FOV 66–79, far plane 700 | world.ts:48-49, 739, 1727 |
| Stage list | 7 ids, **all `ready: true`** (city, classic, coast, woods, highway, port, pass) | world.ts:473-481 |
| Phone budget | ≤ 120 draws, ≤ 250k tris, ≤ 6 MB per environment | V02_PLAN.md:165 |

## 2. Units and conventions used in every spec
- **s** = metres along the centreline, measured from the **race start line** (race origin = hero `along` at `begin()` = 140 m absolute). Engine absolute s = 140 + s.
- **Seconds** are at the reference speed **V_REF = 40 m/s** (between SCROLL_MIN 22 and the 44–54 car caps). Worst-case time = L / 22.
- **R** = signed **nominal** curve radius. **R+ = left turn, R− = right turn.** Total turn θ = len / R (rad), exactly. Curvature eases in and out linearly over the first and last 40 m of each curve section, so Build sets the peak curvature to **k_peak = θ / (len − 40)**. The tightest point is therefore R_peak = R · (len − 40) / len (each spec lists its minimum R_peak). Fork path-length differences (= Δlat · θ) are exact under this rule.
- **Centreline check (done for all six stages, Systems, Nov 20):** integrating every section table with this rule gives no self-overlap. The closest approach between points more than 300 m apart along the road is 278 m (Night City), 272 m (Coast), 278 m (Woods), 298 m (Highway), 293 m (Port) and **163 m (Mountain Pass)**. All are ≥ 80 m.
- **lat** = engine lateral, **+ = driver's right**. Lanes: L1 = −9, L2 = −3, L3 = +3, L4 = +9.
- Asset kit axes are mirrored: in GLB space +X = driver's LEFT (KIT_README). Art lists say "left/right of driver" in words to avoid sign mix-ups.

## 3. Section record (proposed data, matches V02_PLAN §M8 `{type, len, env, params}`)
```
{ id, type: road | ramp | deck | split | tunnel, s0, len, R, width: 24, edgeL: rail|soft, edgeR: rail|soft, zone }
placements: [{ kind: gate | kicker | obstacle | surface | wash | crate | scenery, s, lat or lane, size, params }]
```
- `ramp` and `deck` reuse the existing profiles (road.ts:104-115) at authored s, not the random schedule (road.ts:76-84).
- A course ends at **L** (finish line) followed by a 300 m straight run-out so the finish never sits in the last streamed chunk.

## 4. Shared rules (all stages)
1. **Always forward.** No placement may close more than **2 of 4 lanes (12 m open)** at any s. A fork side (12 m wide) may close at most **1 of its 2 lanes**. Nothing can dead-stop a car; SCROLL_MIN applies everywhere.
2. **Walls glance.** Sidewalls, medians, tunnel walls and obstacles all use the H2b §B glance (push back in, keep along-speed ≥ SCROLL_MIN).
3. **Edge types.** `soft` = today's behaviour (committed leave possible → off-road reset). `rail` = the committed-leave branch is disabled: every contact glances. Required on decks, tunnels, bridges and cliff edges, where leaving would float the car over nothing.
4. **Off-road reset** stays exactly as shipped (6 m / 0.85 s / 12 m back / 1.0 s invuln). In split sections the reset lands at the centre of the **side the car was on** (lat ±6), never lane 0 (that is the median).
5. **Ramps are on the course.** Ramps are either the full-width `ramp` piece or lane kickers inside a lane. No ramp art outside the driveable 24 m. Ramps need ≥ 60 m straight approach, no overhead object within the ramp span + 80 m, and are never inside a tunnel ±60 m.
6. **Landings.** The airborne clamp means no car can land off-road. Hard landings shake only. **Bad landing** (should, BN-13): if a car lands with yaw error > 35° to the track tangent, run the existing tire-blow reset **in place** (no backstep, 1.0 s invuln, hp kept). It is the same feedback as off-road.
7. **Hazards hurt or slow; they never shove a car into a wall** (WEEK_H3 note 5 spirit, sim.ts:2476).
8. **Obstacle contact (OB rule):** glance toward the free side (away from the obstacle centre) at the wall push rate; along-speed × 0.85 (floor SCROLL_MIN); hero −6 hp (invuln and shield respected), AI −4 hp; 0.5 s per-obstacle cooldown. Obstacles are not shootable unless a stage says so.
9. **Every stage is a race (resolved, Sara Nov 20 7:07 PM).** All enemies try to win; combat is secondary; finishing place pays (Mario Kart style, David via WEEK_H3 amends, WEEK_H3_SPEC.md:23-39). Rivals keep their WEEK_H3.2 race logic: a fixed field of tough race cars (WEEK_H3_SPEC.md:39), burst-ram then race on (WEEK_H3_SPEC.md:35), brake → they blow past (WEEK_H3_SPEC.md:37). **Harass roles stay out of the race field**, exactly as H3.2: "OUT: Cheater/harass roles (drones, mine-droppers as anti-player) — later, after race feel lands" (WEEK_H3_SPEC.md:41), and Build's H3.2 field note "Drones/mine-layers/spikers out of race field" (WEEK_H_TRIAL_NOTES.md:35). In code the field is rammer/gunner bodies only (sim.ts:2054) and wave spawns are skipped while racing (sim.ts:1582). So no Drone, Mine Layer, Spiker or Armored Hauler appears on any of the six stages. Fork choice: a rival takes the side matching the sign of its current lateral. Rivals use kickers, surfaces and obstacles under the same rules as the hero.
10. **Every car can finish every stage.** No gated levels (M2_SPEC.md:39). Car-specific lines may be visible but never required. Roadster-only hop lines are optional only.
11. **Originality.** Original district names only. No real brands, logos or text on any asset. Studio-made assets first; external assets only CC0 or otherwise cleared for commercial use, logged in CREDITS (V02_PLAN.md:154).

## 5. Build needs (master list)
Sizes use the WEEK bite scale. Each stage spec lists the subset it needs.

| ID | Need | Size | Used by |
|---|---|---|---|
| BN-1 | Per-stage course table and race arming: `armRace` arms for city, coast, woods, highway, port and pass with `RACE_DIST = course L` (all six are races: Sara Nov 20 7:07 PM). Classic stays endless waves. Track rebuilt per stage at `begin()` | S | all |
| BN-2 | Authored centreline: per-section curvature (k = 1/R, 40 m easing) and `ramp`/`deck` pieces at authored s (random `extendPieces` off on authored stages); 300 m run-out | S | all |
| BN-3 | Median split: lateral wall band over [s0, s1] with the sidewall glance response (hero + AI, grounded; a car more than 1.0 m above the deck passes over). Reset/respawn picks the side centre (±6) | S | all |
| BN-4 | Lane kicker: kicker flag limited to \|lat − lane\| ≤ 3.0 m over a 5.3 m window. Launch formula unchanged | XS–S | all |
| BN-5 | Static obstacles: lat × along box colliders with the OB rule | S | all |
| BN-6 | Edge type per section side (`rail` disables the committed-leave branch at sim.ts:1260-1270) | XS | all |
| BN-7 | Tunnels: section tag; render `tunnel_40`/`tunnel_portal`; hide the roof node while the camera is above (STATE.md:27; **roof-hiding only, tunnel camera out of scope**, Sara Nov 20 7:07 PM); Roadster hop clamp y ≤ road + 6.5 m inside; data check bans ramps/kickers/gates within ±60 m | S | all |
| BN-8 | Surface patches: rectangles with {capSpeed, decel, gripMul, steerMul}, floored at SCROLL_MIN | S | Coast, Woods, Highway, Port, Pass |
| BN-9 | Boost gates authored at s and moved into the sim (STATE.md:23), with a deterministic phase seeded from gate s instead of `performance.now()` so headless tests can check them. **Gate effect fix:** today the gate adds +10 m/s from the render layer (world.ts:1120), but `drive()` re-clamps to the car's top speed on the next step (sim.ts:1196-1197). So a gate does nothing for a car already at its cap. Rule: a green pass grants a **2.0 s temporary cap raise of +10 m/s** (cap = car top + 10, ≤ 60) plus the +10 m/s kick | S | all |
| BN-10 | Timed zones: periodic on/off of a surface patch with a telegraph event (0.8 s foam/shadow) | S | Coast, Woods, Highway, Port, Pass |
| BN-11 | Finish gantry placed at L; RACE_DIST already freezes place | XS | all |
| BN-12 | Authored scenery placement per section zone, replacing procedural rules (city.ts:148 overpass every 4th chunk, city.ts:151 gate every 6th) | M | all |
| BN-13 | (should) Yawed landing (> 35°) → tire-blow reset in place | XS | all |
| BN-14 | (should) Suppress burst-ram while either car is airborne, or within 30 m before a ramp, kicker or obstacle row | XS | all |
| BN-15 | Per-side height (split sides at different heights) | M | Port |
| BN-16 | Variable road width per section (12 / 18 / 24 m) with per-section lane tables (hero, rivals, kickers) | M | Port, Pass |
| BN-17 | Moving obstacles on a lane at a fixed speed (logging trucks, haul carts) using the OB rule | S–M | Woods, Port |
| BN-18 | Per-side gap (gap flag limited to one split side). **Gap fall = the off-road reset** (resolved, Sara Nov 20 7:07 PM): back 12 m (`OFFROAD_BACK`) to the centre of the main side, speed = max(22, speed), 1.0 s invuln, tire-blow feedback, **hull kept, no life or tier lost**. Applies to the hero and rivals (a rival stays in the race). Replaces the −40 hull void fall (sim.ts:971-978) for stage gaps only | S | Highway |
| BN-19 | Falling hazards with a ground-shadow telegraph (rockfall, swinging load) | S | Port, Pass |
| BN-20 | Fog density override per section | XS | Woods |
| BN-21 | Hairpin safety: review the `queryTrack` hint window (road.ts:204-205, −48/+80 m) for R < 120 m. Hairpin legs ≥ 80 m apart | XS–S | Pass |
| BN-22 | Tall-ramp parameter: the `ramp` profile takes {crest height, rise length, descent length}; kicker on the last 12 m of the rise | XS | Pass (Summit Leap: 9.0 m / 80 m / 120 m) |

**Per stage (all LOCKED):** Night City BN-1–7, 9, 11, 12 · Coast + BN-8, BN-10 · Woods + BN-8, BN-17, BN-20 · Highway + BN-8, BN-10, BN-18 · Port + BN-8, BN-10, BN-15, BN-16, BN-17, BN-19 · Pass + BN-8, BN-16, BN-19, BN-21, BN-22. Should-items BN-13 and BN-14 everywhere. Build order follows stage order; Night City first (`BUILD_HANDOFF_NIGHT_CITY.md`).
**Camera:** the tunnel camera stays flagged and out of scope (Sara Nov 20 7:07 PM). Tunnels use roof-hiding only (BN-7).

## 6. Conflicts found (also in the README)
See `README.md` § Conflicts.
