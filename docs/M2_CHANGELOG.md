# M2 lineup (partial sign-off notes)

Branch off `track/nr-m1`. Does not touch `main` or the GitHub Pages root release.

## Landed
- One Model 3 (`model3`, mesh `sedan_compact`) and one Roadster (`roadster`, mesh `roadster2026`).
- Save migrate: `volt` / `volt_r` / `volt_rs` → `model3`; `roadster` / `roadster2026` → `roadster`; unknown → `model3`.
- Six picker rows, all playable from real GLBs (no procedural stand-ins for Y / X / S / Cybertruck):
  - `model_y_{phone,hero}.glb`
  - `model_x_{phone,hero}.glb`
  - `model_s_{phone,hero}.glb`
  - `cybertruck_{phone,hero}.glb`
- Locked stats table (top speed, accel, HP, mine cap, handling, boost / track / rough flags). Mine regen clamps to `mineCap`. Armor still adds on top of base HP.
- Top-speed order from those rows is Model S track-on, then Model S off (54), then Roadster (52). The spec sentence that puts Roadster at or above Model S off does not match the table; the unit test follows the table.
- Model S track mode: keyboard `T` and a touch **Track** button on the action row (not on the stick). Default OFF. Hidden and ignored on every other car. HUD chip `TRACK`. Short confirm blip. Slight nose-down while on.
- Boost stays Roadster-only (M1 `BOOST_*` constants). Other cars keep Brake.
- Model X side guns are not fired (M8). Rough terrain is a title chip only (M6).
- Aim reticle stacks above the WebGL canvas, on the camera look point (hood / nose).
- Player bolts and mines are unlit and larger so they read at night without bloom.
- Phone draw calls: soft target 120 is reported (`drawReport`); hard fail remains above 160.

## Handling lock
`tests/unit/handling.test.ts` still matches v0.1 frame-for-frame, but the v0.2 side of that run is pinned to **Model 3** (48 / 24 / handling 1.0). Roadster’s new row would no longer match v0.1. Track mode is off for that comparison.

## Still later
- M3 garage / winnings. M6 rough patches. M8 Model X side guns and Cybertruck minigun.
- Portrait HUD polish (M10).
