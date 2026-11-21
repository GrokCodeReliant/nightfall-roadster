# Night City scenery pass — v2 (20 Nov 2026, America/Denver)

Staged art drop only. Nothing here was applied to live game source or to any repository.

Folder: `/workspace/studio/art/nightfall-nightcity-20261120/`

This is the **v2 fix pass** of the Night City off-road scenery drop. v1 meshes, atlas, docs, and renders are kept under `glb/v1/`, `atlas/road_kit_atlas_v1.png`, `docs_v1/`, `renders/v1/`, and `CONTACT_SHEET_v1.jpg`.

## What changed in v2

1. **Puddles** — `atlas/road_kit_atlas.png` (also saved as `atlas/road_kit_atlas_v2.png`) starts from the shipped pass-2.2 atlas, not from v1. Coverage is thinner (~7.9% body vs v1 ~17.8%). Baked neon sheen is quieter. Bottom 512 rows (kit + coast cells) are byte-identical to the shipped file.
2. **`facade_inset_12`** — rebuilt as a 4×4 frame grid lined up with the painted window bays (z = ±1.5, ±4.5; y = 1.5, 4.5, 7.5, 10.5). 384 tris. v1 (2-bay, misaligned, 320 tris) is in `glb/v1/`.
3. **`facade_signbox_12`** — both boxes are now centred at z = 0 so the mesh itself no longer straddles a neighbouring balcony bay. Placement rule: never the same 12 m bay as `facade_balcony_12`.
4. **`roof_clutter_12`** — file kept, **cut from v2 recommended placement** (not visible from gameplay / chase cams; not in LEVELS/ART_LISTS/01).
5. **INTEGRATION.md** is a ready-to-apply BE handoff, with unapplied patches in `patches/city.ts.diff` and `patches/world.ts.diff`.
6. Checked against locked `LEVELS/ART_LISTS/01_night_city_art.md`. Wiring existing trim (fins / balcony / AC) is folded into the city.ts patch. New 01 §C assets are a follow-up list, not built in this pass.

## Contents

| path | role |
|---|---|
| `glb/*.glb` | 10 studio-original pieces (v2 inset + signbox; others unchanged from v1). `roof_clutter_12` is not recommended. |
| `glb/city_atlas.png` | Hash-identical copy of the official city atlas, URI only. Do not ship a regenerated atlas. |
| `atlas/road_kit_atlas.png` | Recommended road-kit atlas (v2 puddles). |
| `patches/` | Unapplied `city.ts.diff`, `world.ts.diff`. |
| `CONTACT_SHEET.jpg` | v2 contact sheet. |
| `BUDGET.md` / `HONEST_LOOK.md` / `INTEGRATION.md` | This pass. |
| `STATUS.md` | Contains `PART_A_DONE`. |

## Rules observed

Studio-original procedural meshes and atlas paint. No text, brands, logos, or real place names. No spend. Stage only. Official `city_atlas.png` left hash-identical (`fa483a654b9d8794…`).
