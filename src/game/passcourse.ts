// week-i-pass: Mountain Pass (LEVELS/06_mountain_pass.md v1.0, locked) zones MP-0..MP-11 and the authored placement table:
// every placement on course s, generated once and deterministically from the locked art counts (ART_LISTS/06 §A).
// mountain.ts bakes the entries inside each 40 m chunk (the rock-wall / scree strips and the ice decals are spline-bent
// there from their start s); the falling rocks, their shadows and the peak backdrops are world-level (world.ts passFrame).
// Colliders / hazards (ice, rockfall, snowdrift, kicker, gates, widths, the Summit Leap profile) live in course.ts.
// Every mtn_* piece is an original procedural mesh (mountain.ts), no text, names or logos; kit pieces are named as in the kit.
import type { Zone } from "./coastcourse";
import { LANE_LAT, MOUNTAIN_PASS, PASS_GATES, PASS_ICE, PASS_KICKERS, PASS_OBSTACLES, widthAt } from "./course";
import { upSide } from "./passterrain";

export const PASS_LEN = 4800;
export const PASS_ZONES: Zone[] = MOUNTAIN_PASS.sections.map((x) => ({ id: x.id, s0: x.s0, s1: x.s0 + x.len }));

/** One placement. lx = road-local lateral (driver's LEFT is +; course lat L -> lx = -L); ly above the deck at s, or
 *  absolute when `ground` (ground pieces stand on the terrain: ly = passGroundY at their spot). len = strip length (m). */
export type PassPlace = { name: string; s: number; lx: number; ly: number; ry: number; ground: boolean; len?: number; side?: number; seed?: number };

/** Locked ART LIST §A counts (sum checks in tests/unit/passroad.test.ts) */
export const PASS_COUNTS = {
  chevrons: 141, guardrail: 1088, walls: 80, scree: 11, jersey: 230, ends: 4, signFork: 8, ice: 6, rocks: 4, shadows: 4,
  shed: 5, portals: 2, lake: 13, flags: 12, peaks: 4, pines: 80, fence: 75, crates: 2, lodge: 1, station: 1, structure: 1,
  kicker: 1, drift: 1,
};
/** Avalanche shed (MP-2): 5 x 40 m sections, a portal at each mouth; the roof hides while the hero is in this window (BN-7) */
export const PASS_SHED = { s0: 800, s1: 1000, sections: [820, 860, 900, 940, 980], half: 14.2, h: 9.7 };
export const PASS_SHED_HIDE: [number, number] = [PASS_SHED.s0 - 8, PASS_SHED.s1 + 6];
/** Summit Leap structure (MP-10) and the summit station (MP-11) */
export const PASS_LEAP = { s0: 4030, len: 200 };
export const PASS_STATION = { s: 4700, lat: -34 };
export const PASS_LODGE = { s: 150, lat: -36 };
export const PASS_CRATES: [number, number][] = [[2200, LANE_LAT.L4], [3900, LANE_LAT.L4]];
export const PASS_LAKE = { s0: 3470, lat: 34, tile: 40 };

function h(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
/** the edge line (course |lat|) just outside the live road at s: where rails, walls and chevrons stand */
export const edgeAt = (s: number) => widthAt(MOUNTAIN_PASS, s) / 2;

let cache: PassPlace[] | null = null;
export function passPlacements(): PassPlace[] {
  if (cache) return cache;
  const out: PassPlace[] = [];
  const add = (name: string, s: number, lat: number, ry = 0, o: Partial<PassPlace> = {}) => out.push({ name, s, lx: -lat, ly: 0, ry, ground: false, ...o });
  // rock / cliff wall strips (80) on the uphill side: n strips evenly over [a, b), each one strip-length long
  const walls = (a: number, b: number, n: number, name = "mtn_rock_wall_strip") => {
    const step = (b - a) / n;
    for (let i = 0; i < n; i++) {
      const s = a + step * i;
      const side = upSide(s + step / 2);
      add(name, s, side * (edgeAt(s) + 1.2), 0, { len: step, side, seed: Math.round(s) });
    }
  };
  walls(300, 800, 13);
  walls(1000, 1260, 7);
  walls(1700, 1960, 7);
  walls(1960, 2460, 13);
  walls(2460, 2670, 5);
  // MP-8: 20 strips; each bend's inside is the uphill side (upSide flips on the 100 m straights)
  walls(2670, 3470, 20);
  walls(3470, 3970, 13);
  walls(3970, 4050, 2);
  // MP-4 scree slope (rock source) on the uphill side: 11 strips
  walls(1260, 1700, 11, "mtn_scree_strip");
  // snow-capped guardrail (4 m) on every non-wall rail edge: the valley side, both sides on the ramps
  const rails = (a: number, n: number, side: number | "valley") => {
    for (let i = 0; i < n; i++) {
      const s = a + 2 + i * 4;
      const sd = side === "valley" ? -upSide(s) : side;
      add("mtn_guardrail_snow_4m", s, sd * (edgeAt(s) + 0.6), sd > 0 ? Math.PI : 0, { side: sd });
    }
  };
  rails(300, 125, "valley"); // MP-1
  rails(1000, 65, "valley"); // MP-3
  rails(1260, 110, "valley"); // MP-4
  rails(1700, 65, "valley"); // MP-5
  rails(1960, 125, "valley"); // MP-6
  rails(2460, 15, "valley"); // MP-7a
  rails(2520, 38, -1); // MP-7 ramp: both sides at deck height (38 + 37)
  rails(2520 + 2, 37, 1);
  rails(2670, 200, "valley"); // MP-8
  rails(3470, 125, 1); // MP-9: the lake edge (right)
  rails(3970, 15, "valley"); // MP-10a
  rails(4030, 50, -1); // MP-10 Summit Leap: both sides at deck height (50 + 50)
  rails(4030, 50, 1);
  rails(4230, 68, -1); // MP-11: left
  // chevron boards every 8 m on the hairpin / switchback outer walls (outside of each bend = the valley side)
  const chev = (a: number, n: number, side: number) => { for (let i = 0; i < n; i++) { const s = a + 4 + i * 8; add("mtn_chevron_board", s, side * (edgeAt(s) + 1.6), side > 0 ? -0.35 : 0.35, { side }); } };
  chev(1000, 33, 1); // Eagle Bend R+90: outer = right
  chev(1700, 33, -1); // Kettle Turn R-90: outer = left
  chev(2670, 25, 1); // switchback 1 R+100
  chev(2970, 25, -1); // switchback 2 R-100
  chev(3270, 25, 1); // switchback 3 R+120
  // forks: kit jersey median every 4 m (110 + 120), a terminal at each end, sign_fork pair at each fork mouth + the gate side
  for (const m of MOUNTAIN_PASS.medians) {
    for (let s = m.s0; s < m.s1; s += 4) add("barrier_jersey_4m", s, 0);
    add("coast_guardrail_end_4m", m.s0 - 2, 0);
    add("coast_guardrail_end_4m", m.s1 + 2, 0, Math.PI);
  }
  for (const s of [2000, 3480]) for (const lat of [10.6, -10.6]) add("sign_fork", s, lat, Math.PI);
  for (const g of PASS_GATES) for (const lat of [10.6, 1.6]) add("sign_fork", g.s, lat * (g.side === "left" ? -1 : 1), Math.PI);
  // ice decals (spline-bent from s0) on their lane
  for (const p of PASS_ICE) add("mtn_ice_decal", p.s0, p.lat, 0, { len: p.s1 - p.s0, ly: 0.05 });
  // K-B snow kicker (5.3 m window from the lip; the mesh is centred) and the snowdrift row it hops
  for (const k of PASS_KICKERS) add("mtn_snow_kicker_6", k.s + k.len / 2, k.lat);
  for (const o of PASS_OBSTACLES) add("mtn_snowdrift_row_6", o.s, o.lat);
  for (const [s, lat] of PASS_CRATES) add("coast_crate", s, lat, 0.3);
  // MP-2 avalanche shed: 5 sections + 2 portals (open on the valley side, right)
  for (const s of PASS_SHED.sections) add("mtn_snow_shed_40", s, 0);
  add("mtn_snow_shed_portal", PASS_SHED.s0, 0);
  add("mtn_snow_shed_portal", PASS_SHED.s1, 0, Math.PI);
  // MP-9 frozen lake shelf: 13 tiles beside the right kerb
  for (let i = 0; i < 13; i++) add("mtn_frozen_lake_40", PASS_LAKE.s0 + 20 + i * 40, PASS_LAKE.lat, 0, { ground: true, seed: i });
  // MP-10 ski-jump structure (follows the Summit Leap profile exactly; origin at the ramp foot) and 12 flags along it
  add("mtn_skijump_structure", PASS_LEAP.s0, 0, 0, { len: PASS_LEAP.len });
  for (let i = 0; i < 12; i++) add("mtn_flag", PASS_LEAP.s0 + 10 + Math.floor(i / 2) * 30, (i % 2 ? 1 : -1) * 15.6, 0, { seed: i });
  // MP-0 valley lodge, fence (75 x 4 m on the valley side), 40 snow pines; MP-1 40 pines below the valley rail
  add("mtn_lodge", PASS_LODGE.s, PASS_LODGE.lat, -Math.PI / 2, { ground: true });
  for (let i = 0; i < 75; i++) add("mtn_fence_4m", 2 + i * 4, 15.5, Math.PI, { ground: true });
  for (let i = 0; i < 40; i++) {
    const side = i % 3 === 0 ? -1 : 1;
    add("mtn_snow_pine", 8 + i * 7.3 + h(i) * 4, side * (19 + h(i * 7.1) * 38), h(i * 3.3) * 6, { ground: true, seed: i });
  }
  for (let i = 0; i < 40; i++) add("mtn_snow_pine", 305 + i * 12.3 + h(i + 50) * 5, 24 + h(i * 5.7 + 9) * 34, h(i * 2.9) * 6, { ground: true, seed: 100 + i });
  // MP-11 summit station (valley side, left) and its snowfield
  add("mtn_summit_station", PASS_STATION.s, PASS_STATION.lat, -Math.PI / 2, { ground: true });
  out.sort((a, b) => a.s - b.s);
  cache = out;
  return out;
}

/** placements whose start s lies in [s0, s1) (strips start in a chunk and are bent past it) */
export function passIn(s0: number, s1: number): PassPlace[] {
  const all = passPlacements();
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid].s < s0) lo = mid + 1;
    else hi = mid;
  }
  const out: PassPlace[] = [];
  for (let i = lo; i < all.length && all[i].s < s1; i++) out.push(all[i]);
  return out;
}

/** Mountain Pass night rig on the shared lights (pass only): cold blue sky, a bright moon so the snow carries the scene. */
export const PASS_LOOK = {
  hemiSky: 0x5a6e90,
  hemiGround: 0x2a2f3a,
  hemi: 1.35,
  moonColor: 0xd2def2,
  moon: 1.9,
  fill: 0.4,
} as const;
