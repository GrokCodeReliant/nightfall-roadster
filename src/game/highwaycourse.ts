// Week I: Open Highway (LEVELS/04_open_highway.md v1.0, locked) zones OH-0..OH-10 and the authored scatter table: every
// highway placement on course s, generated once and deterministically from the locked art counts (ART LIST §A).
// highway.ts bakes the entries that fall inside each 40 m chunk; the far backdrop (mesas, turbines) is one world-level
// group built once per race. Colliders (barricades, kickers, gates, gravel) live in course.ts; this file is visual.
//
// openhighway-v1 scope (see week-i-shots/openhighway-v1/GATE.md): Fork A's broken right deck (BN-18 per-side gap + the
// gap-fall reset), the bridge decks / riverbed / gap edges, dust devils (moving surface), the speed sign and the gate
// chain phasing are not built yet; the right deck is intact road and the kickers launch onto it.
import type { Zone } from "./coastcourse";
import { HIGHWAY_GATES, HIGHWAY_GRAVEL, HIGHWAY_KICKERS, HIGHWAY_OBSTACLES, LANE_LAT, OPEN_HIGHWAY } from "./course";

export const OH_LEN = 5200;
export const OH_ZONES: Zone[] = [
  { id: "OH-0", s0: 0, s1: 300 }, { id: "OH-1", s0: 300, s1: 1100 }, { id: "OH-2", s0: 1100, s1: 1500 },
  { id: "OH-3", s0: 1500, s1: 2000 }, { id: "OH-4", s0: 2000, s1: 2500 }, { id: "OH-5", s0: 2500, s1: 2700 },
  { id: "OH-6a", s0: 2700, s1: 2760 }, { id: "OH-6", s0: 2760, s1: 2910 }, { id: "OH-7", s0: 2910, s1: 3500 },
  { id: "OH-8", s0: 3500, s1: 4100 }, { id: "OH-9", s0: 4100, s1: 4900 }, { id: "OH-10", s0: 4900, s1: 5200 },
];

/** Same shape as woodscourse WoodsPlace: lx = road-local lateral (driver's LEFT is +; course lat L -> lx = -L). */
export type HighwayPlace = { name: string; s: number; lx: number; ly: number; lz: number; ry: number; ground: boolean; detail: boolean };

/** Locked ART LIST §A counts (sum checks in tests/unit/highwayroad.test.ts) */
export const HIGHWAY_COUNTS = {
  cacti: { "OH-0": 20, "OH-1": 40, "OH-3": 10 } as Record<string, number>,
  scrub: 30, spires: 12, mesas: 4, turbines: 6,
  signFork: 20, gantries: 3, jersey: 260, guardrail: 400, fence: 150, salt: 40, billboards: 2,
  tunnel: 5, portals: 2, barricades: 4, kickers: 2, gravel: 3, crate: 1,
};

/** Set pieces (§4). Fuel stop: lot pivot centre, canopy on its -X half, so on the right (lx < 0) it is turned 180 so the
 *  canopy faces the road; lot centre 12 + 20 m out. Gantries span the road (icons only). */
export const HIGHWAY_SET = {
  fuel: { s: 1750, lx: -34, ry: Math.PI },
  gantries: [1100, 3000, 4850],
  billboards: [[4300, 26], [4700, -26]] as [number, number][],
  /** OH-5 Mesa Cut: five 40 m tunnel_40 sections and a portal at each mouth (far one turned round) */
  tunnel: { sections: [2520, 2560, 2600, 2640, 2680], portals: [[2500, 0], [2700, Math.PI]] as [number, number][] },
};
/** Far backdrop (world-level, built once): mesas 400-650 m out on OH-1 (left), turbines on OH-7 (left, beyond the fence
 *  line). lat in metres off the centreline (driver's left = +lx). */
export const HIGHWAY_FAR = {
  mesas: [[420, 470, 0.3], [640, 560, -0.2], [860, 420, 0.5], [1000, 620, 0.1]] as [number, number, number][],
  turbines: [[2950, 190], [3050, 230], [3150, 205], [3250, 250], [3350, 215], [3450, 240]] as [number, number][],
};
export const HIGHWAY_SIGN_PAIRS = [1200, 1320, 1440, 2100, 3100, 3220, 3340, 3390];
export const HIGHWAY_SIGN_SIDE = [
  ...HIGHWAY_GATES.filter((g) => g.side === "right").map((g) => [g.s, 1] as [number, number]),
  ...HIGHWAY_GATES.filter((g) => g.side === "left").map((g) => [g.s, -1] as [number, number]),
];
export const HIGHWAY_CRATES: [number, number][] = [[3700, LANE_LAT.L1]];

const span = (id: string): [number, number] => { const z = OH_ZONES.find((x) => x.id === id)!; return [z.s0, z.s1]; };

function h(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

let cache: HighwayPlace[] | null = null;
export function highwayPlacements(): HighwayPlace[] {
  if (cache) return cache;
  const out: HighwayPlace[] = [];
  const add = (name: string, s: number, lx: number, ry = 0, o: Partial<HighwayPlace> = {}) =>
    out.push({ name, s, lx, ly: 0, lz: 0, ry, ground: true, detail: false, ...o });
  const fuel = HIGHWAY_SET.fuel;
  const clearOfFuel = (s: number, lx: number) => !(lx < -10 && lx > -56 && Math.abs(s - fuel.s) < 28);
  const scatter = (name: string, n: number, a: number, b: number, lo: number, hi: number, seed: number, o: Partial<HighwayPlace> = {}, ok = (_s: number, _lx: number) => true) => {
    const step = (b - a) / n;
    let placed = 0;
    for (let i = 0; placed < n && i < n * 4; i++) {
      const k = placed;
      const s = a + step * (k + 0.15 + 0.7 * h(seed + i * 3.1));
      const side = (k + Math.floor(seed)) % 2 === 0 ? 1 : -1;
      const lx = side * (lo + (hi - lo) * h(seed + i * 7.7 + 1));
      if (!ok(s, lx)) continue;
      add(name, s, lx, h(seed + i * 5.3 + 2) * Math.PI * 2, o);
      placed++;
    }
  };
  // cacti (a:b about 2:1), scrub on the start flats, rock spires on the long sweep (right)
  let seed = 21;
  for (const [id, n] of Object.entries(HIGHWAY_COUNTS.cacti)) {
    scatter("desert_cactus", n, ...span(id), 15, 46, seed, {}, clearOfFuel);
    seed += 97;
  }
  for (const p of out) if (p.name === "desert_cactus") p.name = h(p.s * 0.31 + p.lx) < 0.35 ? "desert_cactus_b" : "desert_cactus_a";
  scatter("desert_scrub", HIGHWAY_COUNTS.scrub, ...span("OH-0"), 13.5, 30, 401, { detail: true });
  {
    const [a, b] = span("OH-1");
    const step = (b - a) / HIGHWAY_COUNTS.spires;
    for (let i = 0; i < HIGHWAY_COUNTS.spires; i++) add("desert_rock_spire", a + step * (i + 0.2 + 0.6 * h(503 + i)), -(30 + 40 * h(511 + i * 3.3)), h(519 + i) * Math.PI * 2);
  }
  // rails (400 coast_guardrail_4m): Fork A both kerbs (125 each), R1 + R2 ramp spans (75 each, alternating sides)
  for (let i = 0; i < 125; i++) for (const side of [-1, 1]) add("coast_guardrail_4m", 2000 + 2 + i * 4, side * 12.6, side > 0 ? Math.PI : 0, { ground: false });
  for (const a of [2760, 4500]) {
    for (let i = 0; i < 75; i++) {
      const side = i % 2 ? 1 : -1;
      add("coast_guardrail_4m", a + 2 + Math.floor(i / 2) * 4, side * 12.6, side > 0 ? Math.PI : 0, { ground: false });
    }
  }
  // fork medians: kit jersey every 4 m, a guardrail terminal at each end (115 + 145 = 260 jersey)
  for (const m of OPEN_HIGHWAY.medians) {
    for (let s = m.s0; s < m.s1; s += 4) add("barrier_jersey_4m", s, 0, 0, { ground: false });
    add("coast_guardrail_end_4m", m.s0 - 2, 0, 0, { ground: false });
    add("coast_guardrail_end_4m", m.s1 + 2, 0, Math.PI, { ground: false });
  }
  // OH-8 frontage fence: 150 x 4 m panels on the outside (left) verge, 3500-4100
  for (let i = 0; i < HIGHWAY_COUNTS.fence; i++) add("desert_fence_4m", 3500 + 2 + i * 4, 16, 0);
  // fork / gate / speed signs (20 sign_fork): kerb pairs, single-side gates on their kerb + the median
  for (const s of HIGHWAY_SIGN_PAIRS) for (const lat of [10.6, -10.6]) add("sign_fork", s, -lat, Math.PI, { ground: false });
  for (const [s, side] of HIGHWAY_SIGN_SIDE) for (const lat of [10.6, 1.6]) add("sign_fork", s, -lat * side, Math.PI, { ground: false });
  // course pieces (colliders in course.ts): roadworks barricades (two 3 m per 6 m lane row), bridge-lip kickers, gravel, crate
  for (const o of HIGHWAY_OBSTACLES) for (const d of [-1.5, 1.5]) add("barricade_3m", o.s, -(o.lat + d), 0, { ground: false });
  for (const k of HIGHWAY_KICKERS) add("ramp_kicker_1m", k.s + k.len / 2, -k.lat, 0, { ground: false });
  for (const g of HIGHWAY_GRAVEL) add("woods_gravel_decal", (g.s0 + g.s1) / 2, -g.lat, 0, { ground: false, ly: 0.04 });
  for (const [s, lat] of HIGHWAY_CRATES) add("coast_crate", s, -lat, 0.3, { ground: false });
  // OH-9 dry lake: 40 salt-flat tiles beside the road (20 per side, 4100-4900), blank billboard frames
  for (let i = 0; i < 20; i++) for (const side of [-1, 1]) add("salt_flat_tile_40", 4100 + 20 + i * 40, side * 33, 0, { ly: 0.01 });
  for (const [s, lx] of HIGHWAY_SET.billboards) add("billboard_frame_blank", s, lx, lx > 0 ? -0.25 : 0.25);
  // set pieces: gantries, fuel stop, Mesa Cut tunnel (roof node skipped at bake: the chase cam stays above it)
  for (const s of HIGHWAY_SET.gantries) add("overhead_gantry_24", s, 0, 0, { ground: false });
  add("fuel_stop_set", fuel.s, fuel.lx, fuel.ry);
  for (const s of HIGHWAY_SET.tunnel.sections) add("tunnel_40", s, 0, 0, { ground: false });
  for (const [s, ry] of HIGHWAY_SET.tunnel.portals) add("tunnel_portal", s, 0, ry, { ground: false });
  out.sort((a, b) => a.s - b.s);
  cache = out;
  return out;
}

export function highwayIn(s0: number, s1: number): HighwayPlace[] {
  const all = highwayPlacements();
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid].s < s0) lo = mid + 1;
    else hi = mid;
  }
  const out: HighwayPlace[] = [];
  for (let i = lo; i < all.length && all[i].s < s1; i++) out.push(all[i]);
  return out;
}

/** Desert floor (terrain beyond the shoulders): flat sand / caliche / rock patches on the floor plane, one InstancedMesh on
 *  the kit atlas tan cell (instance tone). Same generator shape as the Pine Woods floor patches, wider and sparser. */
export const DESERT_PATCH = { perChunk: 20, clear: 13.5, lxMax: 70, rMin: 1.8, rMax: 4.5, y: -0.04, cap: 256, far: 200 };
export type DesertPatch = { s: number; lx: number; r: number; ry: number; tone: number; sx: number };
export function desertPatches(s0: number, s1: number): DesertPatch[] {
  const out: DesertPatch[] = [];
  const step = 40 / DESERT_PATCH.perChunk;
  for (let i = Math.ceil(s0 / step); i * step < s1; i++) {
    const s = i * step + (h(i * 3.7 + 5) - 0.5) * step;
    const side = i % 2 ? 1 : -1;
    const r = DESERT_PATCH.rMin + h(i * 1.9 + 11) * (DESERT_PATCH.rMax - DESERT_PATCH.rMin);
    const lx = side * (DESERT_PATCH.clear + r + h(i * 2.9 + 17) * (DESERT_PATCH.lxMax - DESERT_PATCH.clear - 2 * r));
    out.push({ s, lx, r, ry: h(i * 4.3 + 23) * Math.PI * 2, tone: 0.5 + h(i * 6.7 + 29) * 0.3, sx: 1 + h(i * 8.1 + 31) * 0.8 });
  }
  return out;
}

/** openhighway-v1 night-desert rig on the shared lights (Open Highway only). STAGES keeps sky 0x1a140c / fog 0.004. */
export const HIGHWAY_LOOK = {
  hemiSky: 0x4a5a78,
  hemiGround: 0x3a2e22,
  hemi: 1.5,
  moonColor: 0xc8d4ee,
  moon: 2.0,
  fill: 0.45,
  floor: 0x6a5840, // desert floor plane
} as const;
