# Budget — Night City scenery pass v2, 20 Nov 2026 (America/Denver)

Two kinds of numbers are in this file. Do not mix them up.

- **Measured offline (Blender, this drop):** triangle counts, primitive counts, material names, AABB size, and file bytes read from the exported GLBs.
- **Untested runtime estimates:** draw-call impact in the live game. Not measured with `renderer.info` or a phone capture. These assume the current `city.ts` path (static meshes merged per material per chunk) is kept.

Phone caps on file (from `SCENE_BUDGET.md`, Oct 16): ≤120 draws, ≤250k visible tris, ≤6 MB download. Combat is already over 120 draws. Cars and enemies are still the main draw problem.

## Measured: pieces (v2 recommended set)

All use one primitive and one material, `city_emissive`, and the official `city_atlas.png` by URI. No new atlas cells, no new materials.

| piece | ver | tris (measured) | size m (W × H × L) | prims | bytes | v2 placement |
|---|---|---:|---|---:|---:|---|
| facade_ledge_12 | v1 unchanged | 100 | 0.65 × 9.06 × 12.26 | 1 | 8,588 | yes |
| facade_signbox_12 | **v2** | 104 | 0.30 × 4.94 × 2.85 | 1 | 8,872 | yes, never on a balcony bay |
| facade_inset_12 | **v2 4×4** | 384 | 0.16 × 11.20 × 11.20 | 1 | 28,472 | yes, sparsely, fins/glass bays only |
| roof_clutter_12 | v1, **CUT from v2 placement** | 134 | 7.60 × 3.18 × 6.97 | 1 | 10,648 | no |
| bollard | v1 unchanged | 64 | 0.28 × 0.90 × 0.28 | 1 | 5,932 | yes |
| vending_box | v1 unchanged | 100 | 0.76 × 1.90 × 0.96 | 1 | 8,584 | yes |
| trash_bin | v1 unchanged | 60 | 0.59 × 0.96 × 0.59 | 1 | 5,524 | yes |
| utility_cabinet | v1 unchanged | 70 | 0.50 × 1.36 × 0.95 | 1 | 6,464 | yes |
| cable_run_12 | v1 unchanged | 294 | 0.44 × 4.70 × 12.24 | 1 | 22,040 | yes, sparse |
| hydrant | v1 unchanged | 112 | 0.54 × 0.86 × 0.30 | 1 | 9,100 | yes |
| **10 GLBs on disk** |  | **1,422** |  |  | **114,224** |  |
| **recommended unique mesh (no roof)** |  | **1,288** |  |  | **103,576** |  |

Heavier pieces: `facade_inset_12` (384) and `cable_run_12` (294). Use those sparingly.

Existing unused trim, already in `assets_v02/env/city/` (from CITY_README, not re-measured here): `facade_fins_12` 80 tris, `facade_balcony_12` 252, `facade_ac_12` 176. Also 1 prim, `city_emissive`. First use is in this pass's city.ts patch (LEVELS/01 §B).

## Measured: atlas / download

| file | role | bytes | sha256 (prefix) |
|---|---|---:|---|
| atlas/road_kit_atlas_BEFORE.png | shipped pass 2.2 copy | 1,163,005 | ff31e187… |
| atlas/road_kit_atlas_v1.png | v1 puddles (superseded) | 1,210,091 | bb57f279… |
| atlas/road_kit_atlas.png (= _v2) | **recommended** | 1,174,019 | c02a8d32… |
| glb/city_atlas.png | official, unchanged | 664,008 | fa483a65… |
| 10 new GLBs |  | 114,224 |  |

Atlas delta versus shipped is **+11,014 bytes** (v1 was +47,086). New meshes are +0.11 MB. The previous city-stage download concern (~6.09 MB raw, already over the 6 MB cap before KTX2/meshopt) is only slightly worse. Compression is still required to ship, as noted in the Oct 16 budget. This pass does not add a third atlas or a new material.

Bottom 512 rows of the v2 atlas are byte-identical to the shipped file (kit + coast cells unchanged).

## Untested: draw calls

The live Night City loader already merges each chunk to one mesh per material (typically `city` + `city_emissive`, plus `kit` / `kit_emissive` when a boost gate uses `sign_fork`, plus separate gate-lamp draws).

If that merge path is kept, and all new dressing plus the existing facade trim stay on `city_emissive` (they do), **this pass is estimated to add 0 environment draw calls per chunk.** That is an estimate, not a measurement.

If pieces are instanced per type instead of merged, a dressed chunk could add on the order of 9–12 instanced meshes. Do not do that on phone.

The `world.ts` road swap is a separate question. The unapplied patch clones `road_straight_40` + `lanepaint_straight_40` per chunk as a first wire (lanepaint is two prims: kit + kit_emissive). That would be on the order of **2–3 extra draws per streamed chunk**, untested, and is worse than today's procedural road if the procedural path already uses one road + one marks mesh per chunk. **Preferred phone path:** one InstancedMesh per kit primitive for the whole pool (about 3 draws for all road tiles). Alternative: keep the procedural ribbon, project this atlas, run `roughHook` — 0 added draws versus today, and no curve gaps. See INTEGRATION.md.

Cars, enemies, and FX remain the draw-call problem (STATE.md: ≈140–230 in combat). This drop does not change those.

## Untested: triangles in a live scene

Recommended density per 40 m chunk (see INTEGRATION.md), using measured per-piece tris. No roof clutter.

| group | placement | measured tris added |
|---|---|---:|
| Existing trim (fins / balcony / AC) | ~8 mid-bay placements, mixed | ~1,180 |
| New ledge or inset | 4 ledges + 2 insets (fins bays only) | 1,168 |
| Sign boxes | 1 (base, non-balcony) | 104 |
| Bollards | every 10 m, both kerbs (8) | 512 |
| Vending / trash / utility / hydrant / cable | 2 + 2 + 1 + 1 + 1 | 796 |
| **Typical dressed chunk, added** |  | **~3,760** |

Times ~10 live chunks ahead: **~38k added tris** (estimate). Existing city was already estimated at ~42k over 12 chunks, road kit ~30k, hero + enemies + FX ~93k, total ~165k (Oct 16). A dressed city run would land around **~200k visible tris** if those earlier estimates still hold — under the 250k cap, with less headroom. This combined figure is an estimate built from mixed sources; only the per-piece counts above were measured in this pass.

The heavier placement used in the after-street preview (insets on more modules, denser bollards) is above this typical figure. Prefer the recommended density.

`facade_inset_12` and `cable_run_12` are the first things to thin out if a chunk feels fat.
