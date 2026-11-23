// week-i-port: Industrial Port (LEVELS/05_industrial_port.md v1.0, locked) zones IP-0..IP-11 and the authored placement
// table: every port placement on course s, generated once and deterministically from the locked art counts
// (ART_LISTS/05_industrial_port_art.md §A). port.ts bakes the entries that fall inside each 40 m chunk; the crane loads,
// their ground shadows and the forklifts are world-level meshes posed per frame from the sim (world.ts portFrame).
// Colliders / hazards (oil, rail crossings, cranes, forklifts, gates, width, side lift) live in course.ts / trucks.ts.
// All port_* pieces are original procedural meshes (port.ts), no logos or text; shared kit pieces are named as in the kit.
import type { Zone } from "./coastcourse";
import { CRANE, INDUSTRIAL_PORT, LANE_LAT, PORT_CRANES, PORT_GATES, PORT_OIL, PORT_RAILX, sideLiftAt, widthAt } from "./course";

export const PORT_LEN = 4600;
export const PORT_ZONES: Zone[] = INDUSTRIAL_PORT.sections.map((x) => ({ id: x.id, s0: x.s0, s1: x.s0 + x.len }));

/** One port placement. lx = road-local lateral (driver's LEFT is +; course lat L -> lx = -L), ly above the deck at s
 *  (ground pieces: above the yard floor), tint = colour variant (containers 0-5). */
export type PortPlace = { name: string; s: number; lx: number; ly: number; ry: number; ground: boolean; detail: boolean; tint?: number; sz?: number };

/** Locked ART LIST §A counts (sum checks in tests/unit/portroad.test.ts) */
export const PORT_COUNTS = {
  containers: { canyon: 316, deck: 116, crane: 100, gauntlet: 175 } as Record<string, number>,
  cranes: 7, swinging: 5, oil: 8, signFork: 10, jersey: 250, ends: 4, parapets: 235, bollards: { stack: 80, quay: 60 },
  guardrail: 150, shed: 6, portals: 2, racking: 12, railTiles: 13, crossings: 3, flatcars: 6, hulls: 3, warehouses: 10,
  crate: 2, booth: 1, fence: 40, water: 12, containerRamps: 2, deckTop: 1,
};
/** IP-6 Crane Alley gantries (4) + CS1 / CS-T / CS4 = 7 STS cranes; the swinging ones carry a load (course.ts PORT_CRANES) */
export const PORT_CRANE_S = [1050, 1500, 2050, 2200, 2350, 2500, 4200];
/** Long Shed (IP-7): 6 x 40 m sections, a portal at each mouth; roof hidden while the hero is in this race-s window */
export const PORT_SHED = { s0: 2550, s1: 2790, sections: [2570, 2610, 2650, 2690, 2730, 2770], half: 14.2, h: 9.7 };
export const SHED_HIDE: [number, number] = [PORT_SHED.s0 - 8, PORT_SHED.s1 + 6];
/** Fork A container-top deck (BN-15): course lat 0.3 .. 12, race s 1250-1720 */
export const PORT_DECK = { s0: 1250, s1: 1720, lat0: 0.3, lat1: 12 };
export const PORT_SIGN_PAIRS = [600, 1240, 2790];
export const PORT_SIGN_SIDE: [number, number][] = [
  ...PORT_GATES.filter((g) => g.side === "right").map((g) => [g.s, 1] as [number, number]),
  ...PORT_GATES.filter((g) => g.side === "left").map((g) => [g.s, -1] as [number, number]),
];
/** §2 crates: Fork A quay floor L1 at 1650, Fork B rail spur L4 at 3300 (week-i-polish: the L4 crate was missing; the art
 *  list's "1 crate" total only counts IP-4, the course table places both; same reused kit crate, visual only) */
export const PORT_CRATES: [number, number][] = [[1650, LANE_LAT.L1], [3300, LANE_LAT.L4]];
export const PORT_WATER = { s0: 3400, lat0: 15, tile: 40 };
/** container: 2.44 W x 2.6 H x 12.2 L */
export const BOX = { w: 2.44, h: 2.6, l: 12.2 };

function h(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

let cache: PortPlace[] | null = null;
export function portPlacements(): PortPlace[] {
  if (cache) return cache;
  const out: PortPlace[] = [];
  const add = (name: string, s: number, lx: number, ry = 0, o: Partial<PortPlace> = {}) =>
    out.push({ name, s, lx, ly: 0, ry, ground: true, detail: false, ...o });
  const C = PORT_COUNTS;
  // container walls: n columns per side over [a, b), tiers from `tiers(i, side)`, inner face at the live half-width
  const wall = (a: number, b: number, cols: number, tiers: (i: number, side: number) => number, sides: number[], seed: number, gap = 0.3) => {
    const step = (b - a) / cols;
    for (const side of sides) for (let i = 0; i < cols; i++) {
      const s = a + step * (i + 0.5);
      const half = widthAt(INDUSTRIAL_PORT, s) / 2;
      const lat = side * (half + gap + BOX.w / 2);
      const n = tiers(i, side);
      for (let t = 0; t < n; t++) {
        const jit = (h(seed + i * 3.7 + t * 11 + side) - 0.5) * 0.5;
        add("port_container_12", s, -(lat + side * jit * 0.4), 0, { ly: t * BOX.h, tint: Math.floor(h(seed + i * 5.1 + t * 7 + side * 3) * 6), ground: true, ry: (h(seed + i + t) - 0.5) * 0.03 });
      }
    }
  };
  // IP-2/3 canyon 700-1240: 45 columns a side, 4 / 3 tiers alternating (23 x 4 + 22 x 3 = 158 a side, 316)
  wall(700, 1240, 45, (i) => (i % 2 === 0 ? 4 : 3), [-1, 1], 31);
  // IP-10/11 gauntlet 4000-4300: 25 columns a side; left 13 x 4 + 12 x 3 = 88, right 12 x 4 + 13 x 3 = 87 (175)
  wall(4000, 4300, 25, (i, side) => ((i % 2 === 0) === (side < 0) ? 4 : 3), [-1, 1], 47);
  // IP-6 crane alley: 50 columns x 2 tiers on the left (100), set back off the soft kerb
  wall(1950, 2550, 50, () => 2, [-1], 61, 6);
  // IP-4 container-top deck faces: 29 columns x 2 tiers on the median face and the outer face (116), 1310-1660 (full height)
  {
    const a = 1310, b = 1660, cols = 29, step = (b - a) / cols;
    for (const lat of [PORT_DECK.lat0 + BOX.w / 2 - 0.05, PORT_DECK.lat1 - BOX.w / 2 + 0.05]) for (let i = 0; i < cols; i++) for (let t = 0; t < 2; t++)
      add("port_container_12", a + step * (i + 0.5), -lat, 0, { ly: t * BOX.h, tint: Math.floor(h(71 + i * 5.1 + t * 7 + lat) * 6) });
  }
  add("port_deck_top", PORT_DECK.s0, 0, 0, { ground: false });
  add("port_container_ramp", 1280, -6.15, 0, { ground: false });
  add("port_container_ramp", 1690, -6.15, Math.PI, { ground: false });
  // parapets on both edges of the tops (235 x 4 m over 1250-1720: 118 outer + 117 median side)
  for (let i = 0; i < 118; i++) add("port_parapet_4m", 1250 + 2 + i * 4, -(PORT_DECK.lat1 + 0.15), 0, { ground: false });
  for (let i = 0; i < 117; i++) add("port_parapet_4m", 1250 + 4 + i * 4, -(PORT_DECK.lat0 + 0.15), 0, { ground: false });
  // quay-floor bollards (Fork A left kerb, 80) and the quay edge (IP-9 right, 60)
  for (let i = 0; i < C.bollards.stack; i++) add("port_bollard", 1250 + 3 + i * 6, 13.2, 0);
  for (let i = 0; i < C.bollards.quay; i++) add("port_bollard", 3400 + 4 + i * 10, -14.2, 0);
  // fork medians: kit jersey every 4 m (120 + 130), a guardrail terminal at each end
  for (const m of INDUSTRIAL_PORT.medians) {
    for (let s = m.s0; s < m.s1; s += 4) add("barrier_jersey_4m", s, 0, 0, { ground: false });
    add("coast_guardrail_end_4m", m.s0 - 2, 0, 0, { ground: false });
    add("coast_guardrail_end_4m", m.s1 + 2, 0, Math.PI, { ground: false });
  }
  // signs (10 sign_fork): kerb pairs at G1 / Fork A / Fork B, single-side gates on their kerb + the median (G-A on the tops)
  for (const s of PORT_SIGN_PAIRS) for (const lat of [10.6, -10.6]) add("sign_fork", s, -lat, Math.PI, { ground: false });
  // (deck pieces take the BN-15 side lift at their own lat in port.ts, so G-A stands on the tops)
  for (const [s, side] of PORT_SIGN_SIDE) for (const lat of [10.6, 1.6]) add("sign_fork", s, -lat * side, Math.PI, { ground: false });
  // rails: R1 Dry Dock Hump and R2 Quay Kick spans, alternating sides (75 each)
  for (const a of [1800, 3600]) for (let i = 0; i < 75; i++) {
    const side = i % 2 ? 1 : -1;
    add("coast_guardrail_4m", a + 2 + Math.floor(i / 2) * 4, side * 12.6, side > 0 ? Math.PI : 0, { ground: false });
  }
  // IP-0 gate house: security booth + raised barrier arm (left), 40 fence panels on the right kerb (0-160)
  add("port_security_booth", 150, 15.5, 0);
  for (let i = 0; i < C.fence; i++) add("port_fence_4m", 2 + i * 4, -14.8, 0);
  // IP-1 warehouses: 5 a side, loading bays facing the road
  for (let i = 0; i < C.warehouses; i++) {
    const side = i % 2 ? -1 : 1;
    add("port_warehouse_block", 320 + Math.floor(i / 2) * 76 + (side > 0 ? 0 : 38), side * (12 + 9 + 15 + h(i * 3.1) * 6), side > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // STS cranes (legs outside the 24 m), oil decals, forklift / crane loads are world-level
  for (const s of PORT_CRANE_S) add("port_sts_crane", s, 0, 0, { ground: true, ly: s === 1500 ? 0 : 0 });
  for (const o of PORT_OIL) add("port_oil_decal", (o.s0 + o.s1) / 2, -o.lat, 0, { ground: false, ly: 0.06, sz: (o.s1 - o.s0) / 30 });
  for (const [s, lat] of PORT_CRATES) add("coast_crate", s, -lat, 0.3, { ground: false });
  // IP-5 dry dock: dock walls left, the basin hull right
  add("port_ship_hull_backdrop", 1880, -70, 0);
  // IP-7 Long Shed: 6 sections + 2 portals, 12 racking units against the walls
  for (const s of PORT_SHED.sections) add("port_shed_tunnel_40", s, 0, 0, { ground: false });
  add("port_shed_portal", PORT_SHED.s0, 0, 0, { ground: false });
  add("port_shed_portal", PORT_SHED.s1, 0, Math.PI, { ground: false });
  for (let i = 0; i < C.racking; i++) add("port_racking", PORT_SHED.s0 + 10 + Math.floor(i / 2) * 40 + (i % 2) * 20, (i % 2 ? -1 : 1) * 13.1, i % 2 ? Math.PI : 0, { ground: false });
  // IP-8 rail spur: 13 track tiles beside the right kerb (2860-3380), 3 crossing strips across the right side, 6 flatcars
  for (let i = 0; i < C.railTiles; i++) add("port_rail_track_40", 2860 + 20 + i * 40, -17, 0);
  for (const x of PORT_RAILX) add("port_rail_crossing_12", (x.s0 + x.s1) / 2, -x.lat, 0, { ground: false, ly: 0.04 });
  for (let i = 0; i < C.flatcars; i++) add("port_flatcar", 2900 + i * 80 + (i % 2) * 15, -17, 0);
  // IP-9 quay: 12 water tiles (2 rows x 6) beyond the quay edge, 2 hulls moored off it
  for (let i = 0; i < 6; i++) for (let r = 0; r < 2; r++) add("port_water_tile", PORT_WATER.s0 + 20 + i * 40, -(PORT_WATER.lat0 + 20 + r * 40), 0, { ly: -1.5 });
  add("port_ship_hull_backdrop", 3520, -130, 0);
  add("port_ship_hull_backdrop", 3760, -140, 0.04);
  out.sort((a, b) => a.s - b.s);
  cache = out;
  return out;
}

export function portIn(s0: number, s1: number): PortPlace[] {
  const all = portPlacements();
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid].s < s0) lo = mid + 1;
    else hi = mid;
  }
  const out: PortPlace[] = [];
  for (let i = lo; i < all.length && all[i].s < s1; i++) out.push(all[i]);
  return out;
}

/** Industrial Port night rig on the shared lights (port only): cool hemi with a sodium-orange ground bounce, a pale moon.
 *  STAGES keeps sky 0x0c1014 / fog 0.008. The floor plane is the concrete yard. */
export const PORT_LOOK = {
  hemiSky: 0x40506a,
  hemiGround: 0x3a2a18,
  hemi: 1.45,
  moonColor: 0xc8d2e6,
  moon: 1.7,
  fill: 0.45,
  floor: 0x2c2e31,
} as const;

/** the swinging cranes (CS1, CS-T, CS2, CS3, CS4) with their load parking side and deck lift */
export const PORT_SWING = PORT_CRANES.map((c) => ({ ...c, lift: c.side === "right" ? sideLiftAt(INDUSTRIAL_PORT, c.s, 6) : 0, reach: c.side === "right" ? [1, 13] : [-15, 15] }));
export const CRANE_BAND = CRANE;
