# Integration notes — Night City scenery pass v2, 20 Nov 2026 (America/Denver)

Art drop only. Ready-to-apply handoff for Build Engineer. Nothing in this folder was applied to the live game or to any repository.

Unapplied patches (apply by context, line numbers may have drifted):

- `patches/city.ts.diff`
- `patches/world.ts.diff`
- `patches/README.md`

Target tree: `repo_v02/src/game/` as of this drop (Week H3.2 read).

Checked against locked `LEVELS/ART_LISTS/01_night_city_art.md`. This pass wires first-use facade trim and the new dressing / puddle atlas. It does **not** implement the authored NC-0–NC-12 course (that needs BN-2 / BN-12). Leftover 01 items are listed in §7.

## 1. Copy files

### Road-kit atlas (puddles)

Replace:

- `assets_v02/env/road_kit/road_kit_atlas.png`
- the shipped copy at `assets/v02/kit/road_kit_atlas.png` (and the spa/public packaged copy)

with `atlas/road_kit_atlas.png` from this drop (v2).

Do not retouch UVs or re-export kit / coast GLBs. The bottom 512 rows are byte-identical to the current shipped atlas.

Keep the roughness hook: atlas A is roughness (`roughnessFactor = texture2D(map, vMapUv).a`). `roughHook` already exists in `city.ts`. It must also run on whatever material draws the road surface, or the gloss half of the puddles will not appear. The world.ts patch exports / reuses `roughHook`.

### Road tiles into the packaged kit folder

The packaged `spa/public/assets/v02/kit/` (and the repo `assets/v02/kit/` copy) currently has the atlas, `streetlight`, `sign_fork`, and `barrier_jersey`, but **not** `road_straight_40` or `lanepaint_straight_40`. Copy those two GLBs from `assets_v02/env/road_kit/` into both packaged kit folders, together with the new atlas. Without them the world.ts swap cannot load.

### New city pieces

Copy these from `glb/` to `assets/v02/city/` (and the packaged city folder):

`facade_ledge_12`, `facade_signbox_12`, `facade_inset_12`, `bollard`, `vending_box`, `trash_bin`, `utility_cabinet`, `cable_run_12`, `hydrant`.

Optionally copy `roof_clutter_12` for the archive; **do not place it** in v2.

They all reference `city_atlas.png` by URI. Leave them next to the official city atlas. Do not use a regenerated atlas. The copy in this drop's `glb/city_atlas.png` is hash-identical (`fa483a654b9d8794…`, 664,008 bytes) and is only there so the URI resolves in previews.

Existing trim is already in that folder: `facade_fins_12`, `facade_balcony_12`, `facade_ac_12`. Do not replace those files. Just start placing them (first use, LEVELS/01 §B).

## 2. `city.ts` — piece list, trim, dressing, road-kit loader

See `patches/city.ts.diff`. Intent:

Add to `PIECES` (paths `assets/v02/city/<name>.glb`):

```
["city", "facade_fins_12"], ["city", "facade_balcony_12"], ["city", "facade_ac_12"],
["city", "facade_ledge_12"], ["city", "facade_signbox_12"], ["city", "facade_inset_12"],
["city", "bollard"], ["city", "vending_box"], ["city", "trash_bin"],
["city", "utility_cabinet"], ["city", "cable_run_12"], ["city", "hydrant"],
```

Do **not** put the road tiles in the city `PIECES` list (`loadCity` only runs on the city stage). Add a separate `ROAD_PIECES` / `loadRoadKit()` / `roadKitReady()` / `getPiece(name)` so every stage can load `road_straight_40` and `lanepaint_straight_40` from `assets/v02/kit/`. Export `roughHook`.

### Facade attach

- Front face: local `x ≈ side * (half + 12.35)` (neon already uses ~12.3). Yaw with the building (right-side x<0 as-is, left-side yaw 180°).
- Pivot is the module ground centre. Attach y = module base (`0.22 + 12 * f` for mid floors).
- 12 m frontage: one bay at z = 0. 24 m frontage: two bays at z = ±6.
- Window grid (for insets only): 4 floors × 4 bays of 3 m; bay centres z = ±1.5, ±4.5; floor centres y = 1.5, 4.5, 7.5, 10.5. The inset mesh is authored on that grid, so place the piece at the **module** origin (bay z = 0 on a 12 m front, or each 12 m half at z = ±6 on a 24 m front) — not at a window-bay centre.

### Which bay may use which piece

| piece | allowed bays | notes |
|---|---|---|
| facade_fins_12 | glass / office | LEVELS/01: every 2nd front in Glassline (NC-1). Until authored sections land, use 24×24 glass always and 24×12 office 50%. |
| facade_balcony_12 | residential | LEVELS/01: 50% of Market Arc (NC-3) fronts. Stand-in: 12×12, 50% balcony / 50% AC. |
| facade_ac_12 | residential, office, some bases | May share a stack with fins on a different floor; do not stack two trim types in the same bay of the same floor. |
| facade_ledge_12 | same bay as fins or AC | **Never** the same bay as a balcony slab (it fights the slab). |
| facade_inset_12 | fins / glass bays only, not every module (384 tris) | 4×4 frames match the painted office/glass grid. Looser on residential painted windows — skip those. Never on a balcony bay. |
| facade_signbox_12 | base module, or a mid fins / AC bay | **Never the same 12 m bay as `facade_balcony_12`.** v2 geometry is centred at z = 0 (lower box y ≈ 5.15, w = 2.80, h = 1.35, `bb_mag`; upper y ≈ 8.80, w = 2.40, h = 1.15, `bb_cyan`). One sign stack per front is enough. |
| roof_clutter_12 | — | **Do not place in v2.** |

### Roadside dressing (recommended density per 40 m chunk)

The after-street preview is heavier than this. Prefer these counts for the live game:

- Bollards every 8–12 m, both kerbs (~8).
- 1–2 `vending_box`, 1–2 `trash_bin`, 0–1 `utility_cabinet`, 0–1 `cable_run_12`, 0–1 `hydrant`.
- Vending and utility face the road: faces +X; left sidewalk (x>0) yaw 180, right sidewalk as-is.

Keep the current merge-per-material path. Every new piece is `city_emissive` only, so under that path the estimated added environment draw calls are **zero** (untested — not measured with `renderer.info`). Do not instance one mesh per prop type on phone if that bypasses the chunk merge. No UCX nodes on these pieces.

The patch's footprint-based trim mix is a stand-in for LEVELS/01 zones until BN-12 authored placement lands. It is not the NC-0–NC-12 course.

## 3. `world.ts` — road swap + roughness hook

See `patches/world.ts.diff`. Intent:

- Import `loadRoadKit`, `roadKitReady`, `getPiece`, `roughHook`.
- Call `loadRoadKit()` once at world init (every stage, not only city).
- In `buildChunk`, when the kit is ready, place `road_straight_40` and `lanepaint_straight_40` at the chunk midpoint pose (`sampleAt(track, index * SEG + SEG/2)`, yaw = `atan2(tx, tz)`), hide the procedural `ch.road` and `ch.marks`. Leave `ch.walls` as a temporary edge until a later rail pass (BN-6). That is a BE call.

### Curve caveat

`road_straight_40` is a rigid 40 m tile. The track curves within chunks (min R ≈ 150–220 m, on the order of 8–15° per 40 m). Rigid placement will gap or overlap on curves. If that reads badly, **fallback:** keep the procedural ribbon, UV-project this atlas onto it (u across 24 m, v = 10 m along z, v-periodic) and run `roughHook` on `roadMat`. Puddles will still show and the spline stays tight.

### Draw-call note (untested)

The patch clones the two kit roots per chunk as a clear first wire. Lanepaint has two prims, so that can be ~2–3 draws per streamed chunk — worse than necessary. Preferred phone path: one `InstancedMesh` per kit primitive for the whole pool (~3 draws for all road tiles). The UV-ribbon fallback adds 0 draws versus today.

## 4. What not to replace

- Do not replace `bldg_*` modules. This pass does not bake trim into the buildings.
- Do not replace `city_atlas.png`.
- Do not replace any road-kit or coast GLB; only the road-kit atlas (asphalt half).
- Do not apply these patches from this art drop; BE applies them.

## 5. Existing first-use still needed on the authored course (not fully placed by this patch)

These already exist and are listed in LEVELS/01 §A–B. This pass does not author the NC-0–NC-12 layout. Flag for BN-2 / BN-12 / BE:

`tunnel_40` / `tunnel_portal` (NC-6), `barricade_3m`, `billboard_roof_12x6` / `billboard_wall_8x4`, in-lane `ramp_kicker_1m` (NC-10), `barrier_jersey_4m` median + `guardrail_end_4m`, `overpass_60x12`, pole billboards, `sign_fork` at the listed gates. The live city loader also does not place ramps as driveable geometry (H2c dropped the sidewalk ramps).

## 6. Shared / new assets in LEVELS/01 §C — follow-up list (not built this pass)

Do not wait on these to wire v2 dressing and puddles.

| asset | budget (from 01) | notes |
|---|---|---|
| `finish_gantry_24` | ≤600 tris, city_emissive, 1 draw | 30 × 10 × 2 m, spans 24 m plus kerbs. Checker + neon edge. No text or logos. Shared by all stages. |
| `start_grid_paint_40` | ≤150 tris, kit atlas | 24 × 40 m overlay, staggered boxes for 7 cars + start line. Shared. |
| `ramp_lip_chevron_24` | ≤200 tris | 24 × 1.2 × 0.3 m chevron board at the kicker. Shared. |
| `tunnel_light_strip_4m` | ≤24 tris, city_emissive | Instanced; 60 placed in NC-6. |
| `work_light_tower` | ≤400 tris | 2 × 6 × 2 m, construction dressing, not a collider. NC-8/8a ×4. |

Not needed this stage (01): `ramp_launch_2p5m`, `ramp_landing_2p5m`, `jump_scaffold_4m`, `jump_overpass_gap` stay unused (per-lane height, BN-15).

## 7. Coast Road

Coast is a separate drop: `/workspace/studio/art/nightfall-coast-20261120/`. That kit reuses this v2 road-kit atlas via `../road_kit/road_kit_atlas.png`. Shared 01 §C pieces above are also required by LEVELS/ART_LISTS/02 and are not in either drop yet.
