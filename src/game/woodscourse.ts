// Week I: Pine Woods (LEVELS/03_pine_woods.md v1.0, locked) zones PW-0..PW-11 and the authored scatter table: every
// woods placement on course s, generated once and deterministically from the locked art counts (§7 table). woods.ts
// bakes the entries that fall inside each 40 m chunk; the four pine stands go to world-level InstancedMeshes instead.
// Colliders (log rows, kickers, gates, gravel, trucks) live in course.ts / trucks.ts; this file is visual placement.
import type { Zone } from "./coastcourse";
import { LANE_LAT, PINE_WOODS, WOODS_GATES, WOODS_GRAVEL, WOODS_KICKERS, WOODS_OBSTACLES } from "./course";

export const PW_LEN = 4400;
export const PW_ZONES: Zone[] = [
  { id: "PW-0", s0: 0, s1: 300 }, { id: "PW-1", s0: 300, s1: 640 }, { id: "PW-1a", s0: 640, s1: 700 },
  { id: "PW-2", s0: 700, s1: 850 }, { id: "PW-3", s0: 850, s1: 1350 }, { id: "PW-4", s0: 1350, s1: 1750 },
  { id: "PW-5", s0: 1750, s1: 1910 }, { id: "PW-6", s0: 1910, s1: 2250 }, { id: "PW-6a", s0: 2250, s1: 2310 },
  { id: "PW-7", s0: 2310, s1: 2460 }, { id: "PW-8", s0: 2460, s1: 2860 }, { id: "PW-9", s0: 2860, s1: 3460 },
  { id: "PW-10", s0: 3460, s1: 4100 }, { id: "PW-11", s0: 4100, s1: 4400 },
];

/**
 * One woods placement. s = course s, lx = road-local lateral (driver's LEFT is +, like city.ts placeMatrix; so a
 * course lat L becomes lx = -L), lz = forward offset from the pose at s, ry = yaw on top of the road yaw.
 * ground: sit on the ground (y 0) even where the road deck is raised (ramps); otherwise on the road surface.
 * detail: small near-only dress (ferns, stumps, slash, sawdust) that the far trim drops past ~120 m.
 */
export type WoodsPlace = { name: string; s: number; lx: number; ly: number; lz: number; ry: number; ground: boolean; detail: boolean };

/** Locked §7 art counts per section group (sum checks live in tests/unit/woodsroad.test.ts) */
export const WOODS_COUNTS = {
  pines: { "PW-0": 30, "PW-1": 60, "PW-3": 80, "PW-4": 60, "PW-6": 100, "PW-9": 80, "PW-10": 60 } as Record<string, number>,
  broadleaf: 20, ferns: 80, stumps: { "PW-3": 20, "PW-7": 60 } as Record<string, number>, snags: 20,
  rocks: { "PW-2": 6, "PW-6": 30 } as Record<string, number>, slash: 8, sawdust: 6, logStacks: { "PW-0": 6, "PW-3": 4 } as Record<string, number>,
  fence: 75, guardrail: 300, timberWall: 150,
};

/** Set pieces. Shed: 30 x 20 m footprint, rotated so its long side runs along the road and its open (-Z) side faces
 *  the road; near wall at lx 13.5 (just off the 12 m carriageway). Lookout ~55 m ahead of the finish shot pose. */
export const WOODS_SET = {
  shed: { s: 150, lx: 23.5, ry: -Math.PI / 2 },
  loader: { s: 2400, lx: 16, ry: -0.35 },
  lookout: { s: 4410, lx: 16 },
  cabin: { s: 4390, lx: -17, ry: 0.26 },
};
/** PW-5 covered bridge: 4 x 40 m sections, portals at the mouths (far one turned round), river tiles crossing under it. */
export const WOODS_BRIDGE = { s0: 1750, s1: 1910, sections: [1770, 1810, 1850, 1890], portals: [[1750, 0], [1910, Math.PI]] as [number, number][], river: [-60, -20, 20, 60], riverS: 1830 };
/** Fork signs before each split, plus the gate boards (both-side gates get a kerb pair, the right-side gate sits on the
 *  right kerb and the median). Totals 10 sign_fork, as locked. */
export const WOODS_SIGN_PAIRS = [1240, 2400, ...WOODS_GATES.filter((g) => g.side === "both").map((g) => g.s)];
export const WOODS_SIGN_RIGHT = WOODS_GATES.filter((g) => g.side === "right").map((g) => g.s);
export const WOODS_CRATES: [number, number][] = [[1600, LANE_LAT.L4], [2810, LANE_LAT.L3]];

const zoneSpan = (id: string) => PW_ZONES.find((z) => z.id === id)!;
/** Span of a section group: "PW-1" covers PW-1 + PW-1a, "PW-6" covers PW-6 + PW-6a. */
function span(id: string): [number, number] {
  const a = zoneSpan(id);
  const b = PW_ZONES.find((z) => z.id === `${id}a`);
  return [a.s0, (b ?? a).s1];
}

/** deterministic [0,1) hash (no Math.random: the same course every run and in tests) */
function h(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

let cache: WoodsPlace[] | null = null;
export function woodsPlacements(): WoodsPlace[] {
  if (cache) return cache;
  const out: WoodsPlace[] = [];
  const add = (name: string, s: number, lx: number, ry = 0, o: Partial<WoodsPlace> = {}) =>
    out.push({ name, s, lx, ly: 0, lz: 0, ry, ground: true, detail: false, ...o });
  const shed = WOODS_SET.shed;
  const clearOfShed = (s: number, lx: number) => !(lx > 10 && lx < 37 && Math.abs(s - shed.s) < 19);
  /** n items spread evenly over [a, b) with jitter, alternating sides, |lx| in [lo, hi] */
  const scatter = (name: string, n: number, a: number, b: number, lo: number, hi: number, seed: number, o: Partial<WoodsPlace> = {}, ok = (_s: number, _lx: number) => true) => {
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
  // pines (near/far instanced; a:b about 3:1, b is the 20 m variant)
  let seed = 11;
  for (const [id, n] of Object.entries(WOODS_COUNTS.pines)) {
    const [a, b] = span(id);
    const rail = PINE_WOODS.sections.find((x) => x.id === id)?.edgeL === "rail";
    scatter("woods_pine", n, a, b, rail ? 19 : 16.5, rail ? 40 : 38, seed, {}, clearOfShed);
    seed += 101;
  }
  for (const p of out) if (p.name === "woods_pine") p.name = h(p.s * 0.37 + p.lx) < 0.27 ? "woods_pine_b" : "woods_pine_a";
  // PW-1 Fern Gully
  const [f0, f1] = span("PW-1");
  scatter("woods_broadleaf", WOODS_COUNTS.broadleaf, f0, f1, 19, 30, 501);
  scatter("woods_fern_clump", WOODS_COUNTS.ferns, f0, f1, 13.2, 15.5, 601, { detail: true });
  // stumps (PW-3 Haul Road, PW-7 Clearcut)
  for (const [id, n] of Object.entries(WOODS_COUNTS.stumps)) {
    const [a, b] = span(id);
    scatter("woods_stump", n, a, b, 13.6, 22, 700 + n, { detail: true });
  }
  // rocks (PW-2 ridge, PW-6 Fog Hollow): the shared coast rock pair
  for (const [id, n] of Object.entries(WOODS_COUNTS.rocks)) {
    const [a, b] = span(id);
    scatter("coast_rock_a", n, a, b, 15, 24, 800 + n);
  }
  for (const p of out) if (p.name === "coast_rock_a" && h(p.s) < 0.5) p.name = "coast_rock_b";
  // log stacks (PW-0 yard, PW-3 log piles), slash (PW-7), snags (PW-8), sawdust (PW-10)
  for (let i = 0; i < WOODS_COUNTS.logStacks["PW-0"]; i++) add("woods_log_stack", 40 + i * 14, 16 + (i % 2) * 0.5, i % 2 ? Math.PI / 2 : 0);
  scatter("woods_log_stack", WOODS_COUNTS.logStacks["PW-3"], ...span("PW-3"), 17, 22, 901);
  scatter("woods_slash_pile", WOODS_COUNTS.slash, ...span("PW-7"), 15, 20, 1001, { detail: true });
  scatter("woods_snag", WOODS_COUNTS.snags, ...span("PW-8"), 15, 26, 1101);
  scatter("woods_sawdust_pile", WOODS_COUNTS.sawdust, ...span("PW-10"), 14, 17, 1201, { detail: true });
  // PW-0 yard fence: 75 x 4 m panels on the driver's right kerb (300 m)
  for (let i = 0; i < WOODS_COUNTS.fence; i++) add("woods_fence_4m", 2 + i * 4, -14.5, 0);
  // rail edges: PW-2 / PW-7 ramps both sides (75 each), PW-9 switchbacks guardrail right + timber wall left (150 + 150)
  for (const id of ["PW-2", "PW-7"]) {
    const [a] = span(id);
    for (let i = 0; i < 75; i++) {
      const side = i % 2 ? 1 : -1;
      add("coast_guardrail_4m", a + 2 + Math.floor(i / 2) * 4, side * 12.6, side > 0 ? Math.PI : 0, { ground: false });
    }
  }
  {
    const [a] = span("PW-9");
    for (let i = 0; i < 150; i++) {
      add("coast_guardrail_4m", a + 2 + i * 4, -12.6, 0, { ground: false });
      add("woods_timber_wall_4m", a + 2 + i * 4, 13, 0, { ground: false });
    }
  }
  // fork medians: kit jersey every 4 m, a guardrail terminal at each end
  for (const m of PINE_WOODS.medians) {
    for (let s = m.s0; s <= m.s1; s += 4) add("barrier_jersey_4m", s, 0, 0, { ground: false });
    add("coast_guardrail_end_4m", m.s0 - 2, 0, 0, { ground: false });
    add("coast_guardrail_end_4m", m.s1 + 2, 0, Math.PI, { ground: false });
  }
  for (const s of WOODS_SIGN_PAIRS) for (const lat of [10.6, -10.6]) add("sign_fork", s, -lat, Math.PI, { ground: false });
  for (const s of WOODS_SIGN_RIGHT) for (const lat of [10.6, 1.6]) add("sign_fork", s, -lat, Math.PI, { ground: false });
  // course pieces (colliders in course.ts): log rows, log kickers (5.3 m window from the lip, mesh is centred), crates, gravel
  for (const o of WOODS_OBSTACLES) add("log_row_6", o.s, -o.lat, 0, { ground: false });
  for (const k of WOODS_KICKERS) add("log_kicker_6", k.s + k.len / 2, -k.lat, 0, { ground: false });
  for (const [s, lat] of WOODS_CRATES) add("coast_crate", s, -lat, 0.3, { ground: false });
  for (const g of WOODS_GRAVEL) for (let s = g.s0 + 20; s < g.s1; s += 40) add("woods_gravel_decal", s, -g.lat, 0, { ground: false, ly: 0.04 });
  // set pieces
  add("woods_sawmill_shed", shed.s, shed.lx, shed.ry);
  add("woods_log_loader", WOODS_SET.loader.s, WOODS_SET.loader.lx, WOODS_SET.loader.ry);
  add("woods_lookout_tower", WOODS_SET.lookout.s, WOODS_SET.lookout.lx, 0);
  add("woods_cabin", WOODS_SET.cabin.s, WOODS_SET.cabin.lx, WOODS_SET.cabin.ry);
  // PW-5 covered bridge (bridge walls / lamps stay in the chunk; tunnel_roof + portal_crown go to the hide-able group)
  for (const s of WOODS_BRIDGE.sections) add("woods_covered_bridge_40", s, 0, 0, { ground: false });
  for (const [s, ry] of WOODS_BRIDGE.portals) add("woods_covered_bridge_portal", s, 0, ry, { ground: false });
  for (const x of WOODS_BRIDGE.river) add("woods_river_40", WOODS_BRIDGE.riverS, x, 0, { ly: -0.03 });
  out.sort((a, b) => a.s - b.s);
  cache = out;
  return out;
}

/** Placements whose s falls in [s0, s1) */
export function woodsIn(s0: number, s1: number): WoodsPlace[] {
  const all = woodsPlacements();
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid].s < s0) lo = mid + 1;
    else hi = mid;
  }
  const out: WoodsPlace[] = [];
  for (let i = lo; i < all.length && all[i].s < s1; i++) out.push(all[i]);
  return out;
}

/** BN-20 fog zone: PW-6 Fog Hollow thickens to 0.016, eased over 60 m at each end. */
export const WOODS_FOG = { base: 0.012, hollow: 0.016, s0: 1910, s1: 2250, ease: 60 };
export function woodsFog(s: number) {
  const { base, hollow, s0, s1, ease } = WOODS_FOG;
  const k = Math.max(0, Math.min(1, (s - (s0 - ease)) / ease, (s1 + ease - s) / ease));
  return base + (hollow - base) * k;
}
