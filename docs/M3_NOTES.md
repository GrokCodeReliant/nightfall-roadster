# v0.2 M3 — full roster, pickups, M2 fixes

Build/test: `npm run build` (packages to `../v02_m3/`), `npm run test:unit`, `node tests/e2e.mjs` (needs the build; `NF_ONLY=phone|desktop` to run one profile).

## Enemies (src/game/sim.ts)
| Enemy | HP | From | Behaviour / attack |
|---|---|---|---|
| Mine Layer (van, gold stripe) | 80 | wave 2 | holds ~30 m ahead, weaves lanes every 2.5–4 s, drops a mine behind every 2.5 s (22 dmg, hurts only you) |
| Spiker (flatbed with side blades) | 60 | wave 3 | pulls alongside (±2.7 m), grinds 12 hp/s and slows you; after 1.6 s of contact it peels out 16 m in front for 3.2 s (your window). It reacts slowly to your speed: brake and it overshoots into your guns |
| Drone (quad-rotor) | 30 | wave 6 | hovers 6 m up, strafes, fires down every 1.6 s. Grounded gunfire passes underneath: thrust up, or use rockets |
| Armored Hauler (boss) | 600 (+150 per later boss) | every 5th wave | wide armored truck, switches sides every 5 s, rear turret fans 5-shot bursts, drops mines; rear hits do ×2 (glowing rear plate). Drops gun + armor + rockets |

Roster: wave n has 2+n cars (≥ 1 gunner); boss waves are boss + 2 rammers (+ drone + gunner from wave 10).

## Pickups
Drops: 25% per kill, 1 guaranteed on wave clear, boss drops 3, plus roadside crates every ~380–640 m (shoot or ram them open).
Repair +35 · Armor plate +25 max hull (to +100) · Gun tier (Twin → Heavy 24 dmg → Spread 4-way) · Homing rockets ×6 (Fire launches them alongside the guns) · Mine pack (+4 reserve, cluster drops of 3) · Oil slick 20 s (Mine button lays oil: enemies spin out) · Nitro cell (+20 max thrust, refilled) · Shield 6 s · Magnet 15 s.
Active upgrades show as chips under the meters; the Guns label shows the gun tier.

**Death rule:** losing a life costs one tier: −1 gun tier, −1 armor plate, −1 nitro cell; rockets, mine pack and timed boosts are lost.

Handling is untouched: gun tiers, rockets, cluster/oil mines are layered on top of v0.1's fireShot/dropMine output (tier 0 is v0.1 exactly), and the handling test still runs frame-identical.

## M2 known-issue fixes
- **Pop-in when parked:** enemies no longer teleport in view. When you park, enemies ahead drive off forward into the fog (>175 m) and re-enter from behind the camera. Unit test asserts zero visible teleports over 40 s parked.
- **Enemy blocking the camera:** an enemy between the chase camera and your car fades to ~12–40% opacity. Browser test asserts it.
