# ART LIST · Stage 01: Night City (`city`)
**Version:** 1.1 · **Date:** 2026-11-20 (America/Denver) · **Status:** LOCKED (rules and layout). v1.1: race mode confirmed for this stage and tunnel = roof-hiding only (Sara Nov 20 7:07 PM); no layout or number changes. Buildable once the Build needs below land; no other engine change.
**For:** Art & Assets. Copied from `LEVELS/01_night_city.md` § ART LIST (the spec is the source of truth; re-copy if it changes).
**Lock notice:** LOCKED stage: counts are locked (scatter targets may trim ≤ 10% for the phone budget only). Ready to build.

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
