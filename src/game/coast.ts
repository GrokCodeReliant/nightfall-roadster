// Week I: Coast Road stage scenery (art/nightfall-coast-20261120 + shared drop). Visual only; the sim reads the
// same course.ts tables (gates, medians, rocks, kicker K1, sand drift, wave wash), so mesh and collider share one source.
// Placement follows LEVELS/02_coast_road.md zones CR-0..CR-12 on course s (see course.ts). Same merge-per-material
// as city.ts; the only separate meshes are the arch roof (hidden when the camera is above it), the lighthouse beam
// (spins). Foam v2 scrolls in its own shader (cell-local UV wrap, atlas v3) and merges per foam material.
import * as THREE from "three";
import { bakePiece, flushParts, getPiece, inNode, loadPieces, placeMatrix, type Parts, type Pose } from "./city";
import type { ChunkCourse } from "./coastcourse";
import { COAST_GATES, COAST_KICKERS, COAST_OBSTACLES, COAST_ROAD, COAST_SAND, COAST_WASH } from "./course";

const COAST_PIECES: [string, string][] = [
  // new 2026-11-20
  ["coast", "coast_beach_shoulder_40"], ["coast", "coast_sand_drift_6x20"], ["coast", "coast_arch_40"], ["coast", "coast_arch_portal"],
  ["coast", "coast_lighthouse"], ["coast", "coast_umbrella"], ["coast", "coast_beach_hut"], ["coast", "coast_pier_deck_20"],
  ["coast", "coast_boardwalk_40"], ["coast", "coast_dune_mound"], ["coast", "coast_foam_strip_24_v2"],
  // existing coast set, first use
  ["coast", "coast_water_40"], ["coast", "coast_guardrail_4m"], ["coast", "coast_stone_wall_4m"], ["coast", "coast_palm"],
  ["coast", "coast_rock_a"], ["coast", "coast_rock_b"], ["coast", "coast_shrub"], ["coast", "coast_lifeguard_tower"], ["coast", "coast_cliff_40"],
  // shared drop: finish gantry is a city_atlas piece (city_emissive); start grid / ramp lip come in with the road kit
  ["city", "finish_gantry_24"],
  // race course road band (same kit pieces Night City uses): gates / fork signs, median jersey, lane kicker, grid, lip boards
  ["kit", "sign_fork"], ["kit", "barrier_jersey_4m"], ["city", "ramp_kicker_1m"], ["kit", "start_grid_paint_40"], ["kit", "ramp_lip_chevron_24"],
];
let loaded = 0;
let asked = false;
export const coastReady = () => loaded >= COAST_PIECES.length;
export function loadCoast() {
  if (asked) return;
  asked = true;
  loadPieces(COAST_PIECES, () => {
    loaded++;
    if (loaded >= COAST_PIECES.length) foamHook();
  }, new Set([FOAM]));
}

/** sand drift patches on the asphalt: [s0, s1, lane lateral] (LEVELS/02 SD1..SD7; SD4 is not in the course list) */
const SD: [number, number, number][] = COAST_SAND.map((p) => [p.s0, p.s1, p.lat]);
/** CR-7 foam wash windows */
const WASH: [number, number][] = COAST_WASH.map((w) => [w.s0, w.s1]);
/** Fork signs (1090, 1910) and both-side gates get a pair on the kerbs; sea-side gates sit on the sea kerb and the median. */
const SIGN_PAIRS = [1090, 1910, ...COAST_GATES.filter((g) => g.side === "both").map((g) => g.s)];
const SIGN_RIGHT = COAST_GATES.filter((g) => g.side === "right").map((g) => g.s);
const SOFT = new Set(["CR-0", "CR-3", "CR-8", "CR-11", "CR-12", "RUN"]);

/** wash: on-road foam per wave-wash zone (userData.wash = zone id), shown only during the telegraph and the wash. */
export type CoastChunkOut = { roof: THREE.Group | null; spin: THREE.Group | null; wash: THREE.Group[]; placed: string[] };

/** placement log for the first lap: zone -> piece -> count (debug / report) */
export const coastLog: Record<string, Record<string, number>> = {};
const logged = new Set<number>();

const FOAM = "coast_foam_strip_24_v2";
/** world.ts sets foamClock.value = seconds every frame once Coast Road is wired */
export const foamClock = { value: 0 };
// Foam rect in atlas UV (mesh UVs, inset inside the 32x32 foam cell at px 224-255 x 576-607 of road_kit_atlas_v3).
const FOAM_MIN = "vec2(226.0 / 1024.0, 578.0 / 1024.0)";
const FOAM_MAX = "vec2(240.0 / 1024.0, 606.0 / 1024.0)";
/** coast INTEGRATION.md foam v2: cell-local v += 1.0 per 0.9 s, wrapped back into the foam rect. Both foam materials
 *  (kit@foam base, kit_emissive@foam glow) are private to this piece because they sample atlas v3, not the live v2. */
function foamHook() {
  const src = getPiece(FOAM);
  src?.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!(o as THREE.Mesh).isMesh || !m || m.userData.foam) return;
    m.userData.foam = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFoam = foamClock;
      const wrap = `vec2 c0 = ${FOAM_MIN}; vec2 c1 = ${FOAM_MAX};\n vec2 fl = (vMapUv - c0) / (c1 - c0);\n fl.y = fract(fl.y + uFoam / 0.9);\n vec2 fUv = c0 + fl * (c1 - c0);\n`;
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", "uniform float uFoam;\nvoid main() {")
        .replace("#include <map_fragment>", `${wrap}#ifdef USE_MAP\n diffuseColor *= texture2D( map, fUv );\n#endif`)
        .replace("#include <emissivemap_fragment>", "#ifdef USE_EMISSIVEMAP\n totalEmissiveRadiance *= texture2D( emissiveMap, fUv ).rgb;\n#endif")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = texture2D( map, fUv ).a;");
    };
    m.customProgramCacheKey = () => `nf_foam_${m.name}`;
    m.needsUpdate = true;
  });
}

export function buildCoastChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, half: number, ox: number, oz: number,
  rnd: (n: number) => number, c: ChunkCourse): CoastChunkOut {
  const out: CoastChunkOut = { roof: null, spin: null, wash: [], placed: [] };
  if (!coastReady()) return out;
  const parts: Parts = new Map();
  const m4 = new THREE.Matrix4();
  const put = (name: string, p: Pose, lx: number, ly: number, lz: number, ry: number, keep?: (o: THREE.Object3D) => boolean, into = parts) => {
    if (bakePiece(into, name, placeMatrix(p, lx, ly, lz, ry, ox, oz, m4), keep)) out.placed.push(name);
  };
  const mid = at(Math.floor(seg / 2));
  const s0 = c.cs0;
  const s1 = c.cs0 + seg * 2;
  const kAt = (s: number) => Math.round((s - s0) / 2);
  const overlaps = (a: number, b: number) => a < s1 && b > s0;
  const z = c.zone;
  const wash = WASH.some(([a, b]) => overlaps(a, b));
  const soft = SOFT.has(z) || wash;
  const arch = z === "CR-5" && c.flat;
  const ramp = z === "CR-2" || z === "CR-9";
  const R = (n: number) => rnd(index * 41 + n);

  if (soft) {
    // beach: sand shoulder at the chunk origin, sea at y -1.5 beyond the water edge (x -32)
    put("coast_beach_shoulder_40", mid, 0, 0, 0, 0);
    put("coast_water_40", mid, -52, -1.5, 0, 0);
    put("coast_water_40", mid, -92, -1.5, 0, 0);
    if (!wash) {
      for (const lz of [-12, 8]) if (R(lz) < 0.7) put("coast_palm", mid, half + 5 + R(lz + 3) * 3, 0, lz, R(lz + 5) * 6.28);
      put("coast_shrub", mid, half + 3, 0, R(7) * 30 - 15, R(8) * 6.28);
      if (z !== "CR-12" && z !== "RUN") {
        const n = 1 + Math.floor(R(11) * 3);
        for (let u = 0; u < n; u++) put("coast_umbrella", mid, -(20 + R(u * 3 + 12) * 6), 0, -15 + u * 12 + R(u + 30) * 4, R(u + 40) * 6.28);
        if ((z === "CR-0" || z === "CR-3") && R(50) < 0.5) put("coast_beach_hut", mid, -28, 0, R(51) * 20 - 10, -Math.PI / 2);
      }
    }
    // lifeguard towers: CR-0 x1, CR-8 x2, CR-11 x1, on the sand facing the sea
    if (s0 === 180 || s0 === 2460 || s0 === 2620 || s0 === 3500) put("coast_lifeguard_tower", mid, -24, 0, 0, -Math.PI / 2);
    // CR-8 pier: 8 x 20 m modules straight out to sea from the shoulder water edge, end_hut on the last only
    if (s0 <= 2560 && 2560 < s1) {
      const p = at(kAt(2560));
      for (let j = 0; j < 8; j++) put("coast_pier_deck_20", p, -(32 + 10 + 20 * j), 0, 0, -Math.PI / 2, j === 7 ? undefined : (o) => !inNode(o, "end_hut"));
      put("coast_water_40", p, -132, -1.5, 0, 0);
      put("coast_water_40", p, -172, -1.5, 0, 0);
      put("coast_water_40", p, -212, -1.5, 0, 0);
    }
    // CR-12 boardwalk (with its string lights) on the sand; beach huts land side stand in for the shopfront row
    if (z === "CR-12" || z === "RUN") {
      put("coast_boardwalk_40", mid, -16, 0, 0, 0);
      if (R(60) < 0.6) put("coast_beach_hut", mid, half + 8, 0, R(61) * 20 - 10, Math.PI / 2);
    }
  } else {
    // cliff road: guardrail on the sea edge, stone wall on the land edge, sea far below at y -12
    if (!arch) {
      for (let k = 1; k < seg; k += 2) {
        const p = at(k);
        put("coast_guardrail_4m", p, -(half + 0.6), 0, 0, 0);
        put("coast_stone_wall_4m", p, half + 1, 0, 0, 0);
      }
    }
    put("coast_cliff_40", mid, half + 5, ramp ? -mid.y : 0, 0, Math.PI);
    // sea cliff: its 14 m top sits under the sea lanes (lat +1.6..+16), so drop it 0.15 m below the deck or its
    // flat top z-fights over the road tiles on straight chunks
    put("coast_cliff_40", mid, -(half + 1), -24.15 - (ramp ? mid.y : 0), 0, Math.PI);
    put("coast_water_40", mid, -40, -12 - mid.y, 0, 0);
    put("coast_water_40", mid, -80, -12 - mid.y, 0, 0);
    put(R(70) < 0.5 ? "coast_rock_a" : "coast_rock_b", mid, -(30 + R(71) * 30), -12.4 - mid.y, R(72) * 30 - 15, R(73) * 6.28);
    if (R(74) < 0.5) put("coast_rock_b", mid, -(45 + R(75) * 20), -12.4 - mid.y, R(76) * 30 - 15, R(77) * 6.28);
    if (ramp) {
      // dunes around the ramp at ground level
      for (const side of [1, -1]) put("coast_dune_mound", mid, side * (half + 8), -mid.y, R(side + 80) * 20 - 10, R(side + 81) * 6.28);
    }
  }
  if (arch) {
    put("coast_arch_40", mid, 0, 0, 0, 0, (o) => !inNode(o, "tunnel_roof"));
    const rp: Parts = new Map();
    put("coast_arch_40", mid, 0, 0, 0, 0, (o) => inNode(o, "tunnel_roof"), rp);
    const roof = new THREE.Group();
    roof.userData.roofY = mid.y + 6.08;
    flushParts(rp, roof);
    group.add(roof);
    out.roof = roof;
    if (s0 === 1580) put("coast_arch_portal", mid, 0, 0, -20, 0);
    if (s0 === 1660) put("coast_arch_portal", mid, 0, 0, 20, Math.PI);
  }
  // CR-6 lighthouse on the sea side headland, beam spins about the tower axis
  if (s0 <= 1880 && 1880 < s1) {
    const p = at(kAt(1880));
    put("coast_lighthouse", p, -60, -12 - p.y, 0, 0, (o) => !inNode(o, "lamp_beam"));
    const bp: Parts = new Map();
    if (bakePiece(bp, "coast_lighthouse", new THREE.Matrix4(), (o) => inNode(o, "lamp_beam"))) {
      const spin = new THREE.Group();
      placeMatrix(p, -60, -12 - p.y, 0, 0, ox, oz, m4).decompose(spin.position, spin.quaternion, spin.scale);
      flushParts(bp, spin);
      group.add(spin);
      out.spin = spin;
    }
  }
  // sand drift on the asphalt (slow-lane patches), 20 m tiles across each SD window
  for (const [a, b, lat] of SD) {
    for (let cs = a + 10; cs - 10 < b; cs += 20) {
      if (cs < s0 || cs >= s1) continue;
      put("coast_sand_drift_6x20", at(Math.min(seg, kAt(cs))), -lat, 0.06, 0, 0);
    }
  }
  // CR-7 foam wash v2: base + glow merge per (private) foam material with the chunk; motion is the shader scroll
  for (const w of COAST_WASH) {
    const cs = (w.s0 + w.s1) / 2;
    if (cs < s0 || cs >= s1) continue;
    put(FOAM, at(kAt(cs)), 0, 0, 0, 0);
    // telegraph on the asphalt: the same strip shifted onto the two sea lanes (mesh x -25.6..-13.6 -> lat 0..12)
    const wp: Parts = new Map();
    put(FOAM, at(kAt(cs)), 13.6, 0.08, 0, 0, undefined, wp);
    const g = new THREE.Group();
    g.userData.wash = w.id;
    flushParts(wp, g);
    g.visible = false;
    group.add(g);
    out.wash.push(g);
  }
  // race road band: median jersey every 4 m, fork signs and gates, fallen rocks, lane kicker K1 (colliders live in course.ts)
  const inChunk = (s: number) => s >= s0 && s < s1;
  const atS = (s: number) => at(Math.max(0, Math.min(seg, kAt(s))));
  for (const m of COAST_ROAD.medians) {
    for (let s = m.s0; s <= m.s1; s += 4) if (inChunk(s)) put("barrier_jersey_4m", atS(s), 0, 0, 0, 0);
  }
  for (const s of SIGN_PAIRS) if (inChunk(s)) for (const lat of [10.6, -10.6]) put("sign_fork", atS(s), -lat, 0, 0, Math.PI);
  for (const s of SIGN_RIGHT) if (inChunk(s)) for (const lat of [10.6, 1.6]) put("sign_fork", atS(s), -lat, 0, 0, Math.PI);
  for (const o of COAST_OBSTACLES) if (inChunk(o.s)) put("coast_rock_a", atS(o.s), -o.lat, 0, 0, 0);
  for (const k of COAST_KICKERS) if (inChunk(k.s)) put("ramp_kicker_1m", atS(k.s), -k.lat, 0, 0, 0);
  if (c.grid) put("start_grid_paint_40", mid, 0, 0.05, 0, 0);
  for (const k of c.kick) put("ramp_lip_chevron_24", at(k), 0, 0.05, 0, 0);
  if (c.finishK >= 0) put("finish_gantry_24", at(c.finishK), 0, 0.05, 0, 0);
  flushParts(parts, group);
  if (c.lap === 0 && !logged.has(index)) {
    logged.add(index);
    const row = (coastLog[z] ??= {});
    for (const n of out.placed) row[n] = (row[n] ?? 0) + 1;
  }
  return out;
}
