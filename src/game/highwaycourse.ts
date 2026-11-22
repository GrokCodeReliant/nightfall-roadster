// Week I: Open Highway (LEVELS/04_open_highway.md v1.0, locked) zones OH-0..OH-10 and the authored scatter table: every
// highway placement on course s, generated once and deterministically from the locked art counts (ART LIST §A).
// highway.ts bakes the entries that fall inside each 40 m chunk; the far backdrop (mesas, turbines) is one world-level
// group built once per race. Colliders (barricades, kickers, gates, gravel) live in course.ts; this file is visual.
//
// openhighway-v1 scope (see week-i-shots/openhighway-v1/GATE.md): Fork A's broken right deck (BN-18 per-side gap + the
// gap-fall reset), the bridge decks / riverbed / gap edges, dust devils (moving surface), the speed sign and the gate
// chain phasing are not built yet; the right deck is intact road and the kickers launch onto it.
import type { Zone } from "./coastcourse";
import { HIGHWAY_GAP, HIGHWAY_GATES, HIGHWAY_GRAVEL, HIGHWAY_KICKERS, HIGHWAY_OBSTACLES, LANE_LAT, OPEN_HIGHWAY } from "./course";
export { HIGHWAY_GAP };

export const OH_LEN = 5200;
export const OH_ZONES: Zone[] = [
  { id: "OH-0", s0: 0, s1: 300 }, { id: "OH-1", s0: 300, s1: 1100 }, { id: "OH-2", s0: 1100, s1: 1500 },
  { id: "OH-3", s0: 1500, s1: 2000 }, { id: "OH-4", s0: 2000, s1: 2500 }, { id: "OH-5", s0: 2500, s1: 2700 },
  { id: "OH-6a", s0: 2700, s1: 2760 }, { id: "OH-6", s0: 2760, s1: 2910 }, { id: "OH-7", s0: 2910, s1: 3500 },
  { id: "OH-8", s0: 3500, s1: 4100 }, { id: "OH-9", s0: 4100, s1: 4900 }, { id: "OH-10", s0: 4900, s1: 5200 },
];

/** Same shape as woodscourse WoodsPlace: lx = road-local lateral (driver's LEFT is +; course lat L -> lx = -L). */
export type HighwayPlace = { name: string; s: number; lx: number; ly: number; lz: number; ry: number; ground: boolean; detail: boolean; sz?: number };

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

/** OH-4 Broken Bridge (§4, BN-18): twin decks over a dry riverbed 12 m down, 2000-2500. The desert floor is cut away over
 *  |lat| < half (river banks slope down to the bed); deck centres at |lx| 6.2. */
export const BRIDGE = { s0: 2000, s1: 2500, half: 22, bedHalf: 19, bedY: -12, deckLx: 6.2 };
/** right-deck spans (course s) either side of the gap, 40 m deck pieces cut at the gap: 6 + split + split + 5 = 13 */
export function rightDeckSpans(): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < 13; k++) {
    const a = BRIDGE.s0 + k * 40, b = a + 40;
    if (b <= HIGHWAY_GAP.s0 || a >= HIGHWAY_GAP.s1) out.push([a, b]);
    else {
      if (a < HIGHWAY_GAP.s0) out.push([a, HIGHWAY_GAP.s0]);
      if (b > HIGHWAY_GAP.s1) out.push([HIGHWAY_GAP.s1, b]);
    }
  }
  return out;
}
/** OH-5 Mesa Cut: the tunnel is raised (y x2.1: roof 15.75-17.85 m) so the 13.5 m chase cam rides UNDER a real roof, inside a
 *  mesa block (flat top, sloped flanks, cliff faces with the portals). Camera unchanged. */
export const MESA_CUT = { s0: 2500, s1: 2700, sy: 2.1, h: 27, topHalf: 36, baseHalf: 78, openHalf: 14.2, openTop: 17.85 };

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
  // BN-18 Broken Bridge (§4 OH-4): 26 half-width decks (13 per side; the right deck is split at the gap), a gap edge on each
  // lip of the right deck, 13 dry-riverbed tiles 12 m down. Right deck = course lat > 0 = lx < 0.
  for (let k = 0; k < 13; k++) add("bridge_deck_12_40", BRIDGE.s0 + 20 + k * 40, BRIDGE.deckLx, 0, { ground: false, ly: -0.05 });
  for (const [a, b] of rightDeckSpans()) add("bridge_deck_12_40", (a + b) / 2, -BRIDGE.deckLx, 0, { ground: false, ly: -0.05, sz: (b - a) / 40 });
  add("gap_edge_12", HIGHWAY_GAP.s0 - 0.92, -BRIDGE.deckLx, 0, { ground: false, ly: -0.05 });
  add("gap_edge_12", HIGHWAY_GAP.s1 + 0.92, -BRIDGE.deckLx, Math.PI, { ground: false, ly: -0.05 });
  for (let k = 0; k < 13; k++) add("riverbed_strip_40", BRIDGE.s0 + 20 + k * 40, 0, 0, { ly: BRIDGE.bedY });
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
  // Mesa Cut interior: amber wall strips (shared NC tunnel_light_strip_4m) every 8 m on both walls, under the raised roof
  for (let s = 2504; s < 2700; s += 8) for (const lx of [13.15, -13.15]) add("tunnel_light_strip_4m", s, lx, lx > 0 ? Math.PI : 0, { ground: false, ly: 10.5 });
  for (const [s, ry] of HIGHWAY_SET.tunnel.portals) add("tunnel_portal", s, 0, ry, { ground: false });
  out.sort((a, b) => a.s - b.s);
  // the right kerb rail stops at the snapped deck: none over the gap (2 m margin each side)
  cache = out.filter((p) => !(p.name === "coast_guardrail_4m" && p.lx < 0 && p.s > HIGHWAY_GAP.s0 - 2 && p.s < HIGHWAY_GAP.s1 + 2));
  return cache;
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
    if (!openGround(s, lx, r + 1)) continue;
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

/** open desert at (s, lx) with clearance r: not the riverbed cut (OH-4), the mesa block (OH-5), the fuel-stop lot or the salt pans */
export function openGround(s: number, lx: number, r: number, salt = true) {
  const a = Math.abs(lx);
  if (s > BRIDGE.s0 - r - 6 && s < BRIDGE.s1 + r && a < BRIDGE.half + r + 2) return false;
  if (s > MESA_CUT.s0 - r - 4 && s < MESA_CUT.s1 + r + 4 && a < MESA_CUT.baseHalf + r) return false;
  const f = HIGHWAY_SET.fuel;
  if (lx < -8 && lx > -60 - r && Math.abs(s - f.s) < 32 + r) return false;
  if (salt && s > 4100 - r && s < 4900 + r && a > 11 - r && a < 55 + r) return false;
  return a > 13 + r;
}

/** openhighway-v2 desert variety: instanced scrub tufts + rocks (one draw each), and gentle rises (low mounds baked into the
 *  chunk on the terrain material). Deterministic per 40 m chunk; everything stays off the road, riverbed, mesa and lot. */
export const DESERT_SCATTER = { scrubPerChunk: 14, rockPerChunk: 7, lxMax: 95, cap: 320, far: 230, fade: 50 };
export type DesertBit = { kind: "scrub" | "rock"; s: number; lx: number; r: number; ry: number; tone: number };
export function desertScatter(s0: number, s1: number): DesertBit[] {
  const out: DesertBit[] = [];
  for (const [kind, per, seed] of [["scrub", DESERT_SCATTER.scrubPerChunk, 61], ["rock", DESERT_SCATTER.rockPerChunk, 83]] as const) {
    const step = 40 / per;
    for (let i = Math.ceil(s0 / step); i * step < s1; i++) {
      const s = i * step + (h(i * 2.3 + seed) - 0.5) * step;
      const side = h(i * 5.1 + seed) < 0.5 ? 1 : -1;
      // denser near the shoulders, thinning out
      const u = h(i * 3.3 + seed + 7);
      const lx = side * (14 + u * u * (DESERT_SCATTER.lxMax - 14));
      const r = kind === "scrub" ? 0.7 + h(i * 7.9 + seed) * 1.1 : 0.35 + Math.pow(h(i * 7.9 + seed), 2) * 1.6;
      if (!openGround(s, lx, r, kind === "scrub")) continue;
      out.push({ kind, s, lx, r, ry: h(i * 4.7 + seed) * Math.PI * 2, tone: 0.6 + h(i * 9.1 + seed) * 0.4 });
    }
  }
  return out;
}
export const DESERT_MOUND = { every: 28, rMin: 12, rMax: 34, hMin: 1.2, hMax: 5.5, lxMin: 26, lxMax: 150 };
export type DesertMound = { s: number; lx: number; rx: number; rz: number; h: number; ry: number; tone: number; seed: number };
/** gentle rises: one candidate every 28 m, alternate-ish sides, kept clear of the road (edge >= 15 m out) */
export function desertMounds(s0: number, s1: number): DesertMound[] {
  const out: DesertMound[] = [];
  const m = DESERT_MOUND;
  for (let i = Math.ceil(s0 / m.every); i * m.every < s1; i++) {
    const s = i * m.every + (h(i * 1.7 + 401) - 0.5) * m.every * 0.8;
    const side = h(i * 2.9 + 409) < 0.5 ? 1 : -1;
    const rx = m.rMin + h(i * 3.1 + 419) * (m.rMax - m.rMin);
    const rz = rx * (0.7 + h(i * 4.3 + 421) * 0.9);
    const lx = side * Math.max(m.lxMin + rx * 0.6, m.lxMin + h(i * 5.9 + 431) * (m.lxMax - m.lxMin));
    if (Math.abs(lx) - Math.max(rx, rz) < 15) continue;
    if (!openGround(s, lx, Math.max(rx, rz) * 0.8)) continue;
    out.push({ s, lx, rx, rz, h: m.hMin + h(i * 6.1 + 433) * (m.hMax - m.hMin), ry: h(i * 7.3 + 439) * Math.PI, tone: 0.8 + h(i * 8.7 + 443) * 0.25, seed: i });
  }
  return out;
}
