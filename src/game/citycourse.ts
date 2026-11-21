/**
 * Night City scenery placements. Race s, engine lateral (+ is the driver's right).
 * Meshes are visual. Colliders stay in the sim (barricades, kickers, median).
 * Counts follow ART_LISTS/01_night_city_art.md. Missing studio meshes are stand-ins.
 */
export type CityProp = {
  id: string;
  s: number;
  lat: number;
  /** Scenery never collides. Road hazards are separate sim boxes. */
  collider: false;
  /** Merged-material group used for the phone draw estimate. */
  draw: string;
};

const TRIS: Record<string, number> = {
  sidewalk_12x40: 64,
  bldg_stack: 200,
  facade_fins_12: 80,
  facade_balcony_12: 252,
  facade_ac_12: 176,
  neon: 120,
  streetlight_city_twin_8m: 108,
  streetlight_city_6m: 58,
  billboard_pole_12x6: 78,
  billboard_roof_12x6: 74,
  billboard_wall_8x4: 12,
  overpass_60x12: 182,
  tunnel_40: 126,
  tunnel_portal: 60,
  tunnel_light_strip_4m: 24,
  barrier_jersey_4m: 92,
  guardrail_end_4m: 92,
  sign_fork: 138,
  barricade_3m: 92,
  ramp_kicker_1m: 182,
  traffic_cone: 64,
  water_barrier_2m: 30,
  crate: 48,
  finish_gantry_24: 600,
  start_grid_paint_40: 150,
  ramp_lip_chevron_24: 200,
  work_light_tower: 400,
};

const DRAW: Record<string, string> = {
  neon: "emissive",
  tunnel_light_strip_4m: "emissive",
  finish_gantry_24: "emissive",
  ramp_lip_chevron_24: "emissive",
  sign_fork: "kit",
  barrier_jersey_4m: "kit",
  guardrail_end_4m: "kit",
  crate: "kit",
};

function prop(id: string, s: number, lat: number): CityProp {
  return { id, s, lat, collider: false, draw: DRAW[id] ?? "city" };
}

function inTunnel(s: number) {
  return s >= 1700 && s < 1940;
}

function pairs(out: CityProp[], id: string, sites: number[], lat: number) {
  for (const s of sites) {
    out.push(prop(id, s, lat), prop(id, s, -lat));
  }
}

/** Locked named sites plus the scatter needed to hit the prop totals. */
export function cityPlacements(): CityProp[] {
  const out: CityProp[] = [];
  for (let s = 20; s < 3600; s += 40) {
    if (s >= 1700 && s < 2190) continue;
    out.push(prop("sidewalk_12x40", s, 18.35), prop("sidewalk_12x40", s, -18.35));
  }
  let stacks = 0;
  for (let s = 18; stacks < 250 && s < 3600; s += 13.2) {
    if (inTunnel(s)) continue;
    const side = stacks % 2 === 0 ? 1 : -1;
    out.push(prop("bldg_stack", s, side * 24));
    stacks += 1;
  }
  for (let i = 0; i < 12; i++) {
    const s = 312 + i * 20;
    out.push(prop("facade_fins_12", s, 22), prop("facade_fins_12", s, -22));
  }
  for (let i = 0; i < 12; i++) {
    const s = 790 + i * 22;
    out.push(prop("facade_balcony_12", s, i % 2 ? 22 : -22));
    out.push(prop("facade_ac_12", s, i % 2 ? -22 : 22));
  }
  for (let i = 0; i < 70; i++) {
    const s = 30 + i * 48;
    if (s >= 3600 || inTunnel(s)) continue;
    out.push(prop("neon", s, i % 2 ? 20 : -20));
  }
  let neon = out.filter((p) => p.id === "neon").length;
  for (let s = 40; neon < 70 && s < 3600; s += 17) {
    if (inTunnel(s)) continue;
    out.push(prop("neon", s, neon % 2 ? 21 : -21));
    neon += 1;
  }
  for (let s = 10; s < 3600; s += 20) {
    if (inTunnel(s)) continue;
    out.push(prop("streetlight_city_twin_8m", s, s % 40 === 10 ? 14 : -14));
    out.push(prop("streetlight_city_6m", s + 10, s % 40 === 10 ? -16 : 16));
  }
  const poles = [80, 160, 240, 340, 420, 500, 1520, 3020, 3140, 3260];
  for (const s of poles) out.push(prop("billboard_pole_12x6", s, s % 2 === 0 ? 20 : -20));
  for (const s of [1480, 1540, 1620, 1680]) out.push(prop("billboard_roof_12x6", s, 26));
  for (const s of [2000, 2100]) out.push(prop("billboard_wall_8x4", s, s === 2000 ? 22 : -22));
  for (const s of [1500, 1560, 1640]) out.push(prop("overpass_60x12", s, 0));
  for (let i = 0; i < 6; i++) out.push(prop("tunnel_40", 1700 + i * 40, 0));
  out.push(prop("tunnel_portal", 1700, 0), prop("tunnel_portal", 1940, 0));
  for (let s = 1704; s < 1940; s += 8) {
    out.push(prop("tunnel_light_strip_4m", s, 11), prop("tunnel_light_strip_4m", s, -11));
  }
  for (let s = 1080; s <= 1456; s += 4) out.push(prop("barrier_jersey_4m", s, 0));
  for (let s = 2700; s <= 2948; s += 4) out.push(prop("barrier_jersey_4m", s, 0));
  for (const s of [1080, 1460, 2700, 2950]) out.push(prop("guardrail_end_4m", s, 0));
  pairs(out, "sign_fork", [480, 960, 1600, 2760, 3420], 10.6);
  out.push(prop("sign_fork", 1380, 10.6), prop("sign_fork", 1380, 1.6));
  const rows: [number, number][] = [
    [860, 9], [940, -9], [1010, 9], [1190, -3], [1330, -9],
    [2260, -9], [2260, -3], [2380, 3], [2380, 9], [2725, 9], [2855, 3],
  ];
  for (const [s, lat] of rows) {
    out.push(prop("barricade_3m", s, lat - 1.45), prop("barricade_3m", s, lat + 1.45));
  }
  out.push(prop("ramp_kicker_1m", 2717, 9), prop("ramp_kicker_1m", 2847, 3));
  let cones = 0;
  for (const s of [860, 940, 1010]) {
    for (let k = 0; k < 6; k++) out.push(prop("traffic_cone", s + k * 3, k % 2 ? 14 : -14));
    cones += 6;
  }
  for (let s = 2200; cones < 48; s += 8) {
    out.push(prop("traffic_cone", s, cones % 2 ? 14 : -14));
    cones += 1;
  }
  for (let s = 2660; cones < 68; s += 12) {
    out.push(prop("traffic_cone", s, 14));
    cones += 1;
  }
  const waters: [number, number, number][] = [
    [620, 770, 60],
    [1940, 2190, 90],
    [2490, 2640, 60],
  ];
  for (const [a, b, n] of waters) {
    const step = (b - a) / (n / 2);
    for (let i = 0; i < n / 2; i++) {
      const s = a + step * (i + 0.5);
      out.push(prop("water_barrier_2m", s, 11.2), prop("water_barrier_2m", s, -11.2));
    }
  }
  out.push(prop("crate", 1260, 9), prop("crate", 2900, 9));
  out.push(prop("start_grid_paint_40", 20, 0));
  out.push(prop("ramp_lip_chevron_24", 668, 0), prop("ramp_lip_chevron_24", 2538, 0));
  out.push(prop("finish_gantry_24", 3600, 0));
  for (const s of [2220, 2300, 2360, 2420]) out.push(prop("work_light_tower", s, s % 2 === 0 ? 20 : -20));
  return out;
}

export function tally(props: CityProp[]): Record<string, number> {
  const n: Record<string, number> = {};
  for (const p of props) n[p.id] = (n[p.id] ?? 0) + 1;
  return n;
}

/** Phone window: 2 chunks behind and 7 ahead. Draws are merged material groups plus the road. */
export function windowBudget(raceS: number, props = cityPlacements()): { draws: number; tris: number; instances: number } {
  const lo = raceS - 80;
  const hi = raceS + 280;
  const seen = new Set<string>(["road", "walls", "marks"]);
  let tris = 0;
  let instances = 0;
  for (const p of props) {
    if (p.s < lo || p.s > hi) continue;
    instances += 1;
    seen.add(p.draw);
    tris += TRIS[p.id] ?? 0;
  }
  return { draws: seen.size, tris, instances };
}
