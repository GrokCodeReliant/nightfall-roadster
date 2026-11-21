// Week I: Coast Road stage scenery (art/nightfall-coast-20261120 + shared drop). Visual only; no sim changes.
// Placement follows LEVELS/02_coast_road.md zones CR-0..CR-12 on course s (see course.ts). Same merge-per-material
// as city.ts; the only separate meshes are the arch roof (hidden when the camera is above it), the lighthouse beam
// (spins) and the foam ribs (travel + UV scroll).
import * as THREE from "three";
import { bakePiece, flushParts, getPiece, inNode, loadPieces, placeMatrix, type Parts, type Pose } from "./city";
import type { ChunkCourse } from "./coastcourse";

const COAST_PIECES: [string, string][] = [
  // new 2026-11-20
  ["coast", "coast_beach_shoulder_40"], ["coast", "coast_sand_drift_6x20"], ["coast", "coast_arch_40"], ["coast", "coast_arch_portal"],
  ["coast", "coast_lighthouse"], ["coast", "coast_umbrella"], ["coast", "coast_beach_hut"], ["coast", "coast_pier_deck_20"],
  ["coast", "coast_boardwalk_40"], ["coast", "coast_dune_mound"], ["coast", "coast_foam_strip_24"],
  // existing coast set, first use
  ["coast", "coast_water_40"], ["coast", "coast_guardrail_4m"], ["coast", "coast_stone_wall_4m"], ["coast", "coast_palm"],
  ["coast", "coast_rock_a"], ["coast", "coast_rock_b"], ["coast", "coast_shrub"], ["coast", "coast_lifeguard_tower"], ["coast", "coast_cliff_40"],
  // shared drop: finish gantry is a city_atlas piece (city_emissive); start grid / ramp lip come in with the road kit
  ["city", "finish_gantry_24"],
];
let loaded = 0;
let asked = false;
export const coastReady = () => loaded >= COAST_PIECES.length;
export function loadCoast() {
  if (asked) return;
  asked = true;
  loadPieces(COAST_PIECES, () => { loaded++; });
}

/** sand drift patches on the asphalt: [s0, s1, lane lateral] (LEVELS/02 SD1..SD7; SD4 is not in the course list) */
const SD: [number, number, number][] = [
  [950, 1010, 9], [1280, 1340, -9], [1420, 1480, -3], [3000, 3040, -3], [3150, 3190, 3], [3460, 3490, 3],
];
/** CR-7 foam wash windows */
const WASH: [number, number][] = [[2080, 2120], [2220, 2260], [2360, 2400]];
const SOFT = new Set(["CR-0", "CR-3", "CR-8", "CR-11", "CR-12", "RUN"]);

export type CoastChunkOut = { roof: THREE.Group | null; spin: THREE.Group | null; ribs: THREE.Group[]; placed: string[] };

/** placement log for the first lap: zone -> piece -> count (debug / report) */
export const coastLog: Record<string, Record<string, number>> = {};
const logged = new Set<number>();

let ribMat: THREE.MeshStandardMaterial | null = null;
export const foamClock = { value: 0 };
function foamMaterial(src: THREE.Material) {
  if (ribMat) return ribMat;
  const m = (src as THREE.MeshStandardMaterial).clone();
  m.name = "kit_emissive_foam";
  // Spec: UV.v +1.0 every 0.9 s. A raw +1.0 scroll would sweep the whole atlas, so it is wrapped inside the
  // foam swatch (atlas rows 576-607). That swatch is a flat colour, so the visible telegraph is the rib travel (world.ts).
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFoam = foamClock;
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "uniform float uFoam;\nvoid main() {")
      .replace("#include <map_fragment>", "vec2 fUv = vec2(vMapUv.x, 0.5625 + mod(vMapUv.y - 0.5625 + fract(uFoam / 0.9) * 0.03125, 0.03125));\n#ifdef USE_MAP\n diffuseColor *= texture2D( map, fUv );\n#endif")
      .replace("#include <emissivemap_fragment>", "#ifdef USE_EMISSIVEMAP\n totalEmissiveRadiance *= texture2D( emissiveMap, fUv ).rgb;\n#endif")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = texture2D( map, fUv ).a;");
  };
  m.customProgramCacheKey = () => "nf_foam";
  ribMat = m;
  return m;
}

export function buildCoastChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, half: number, ox: number, oz: number,
  rnd: (n: number) => number, c: ChunkCourse): CoastChunkOut {
  const out: CoastChunkOut = { roof: null, spin: null, ribs: [], placed: [] };
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
    put("coast_cliff_40", mid, -(half + 1), -24 - (ramp ? mid.y : 0), 0, Math.PI);
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
  // CR-7 foam wash: base strip merges with the chunk, emissive ribs are their own mesh (travel + UV scroll)
  for (const [a, b] of WASH) {
    const cs = (a + b) / 2;
    if (cs < s0 || cs >= s1) continue;
    const p = at(kAt(cs));
    put("coast_foam_strip_24", p, 0, 0, 0, 0, (o) => (o as THREE.Mesh).material && ((o as THREE.Mesh).material as THREE.Material).name !== "kit_emissive");
    const rp: Parts = new Map();
    const src = getPiece("coast_foam_strip_24");
    if (src && bakePiece(rp, "coast_foam_strip_24", new THREE.Matrix4(), (o) => ((o as THREE.Mesh).material as THREE.Material)?.name === "kit_emissive")) {
      const ribs = new THREE.Group();
      placeMatrix(p, 0, 0, 0, 0, ox, oz, m4).decompose(ribs.position, ribs.quaternion, ribs.scale);
      ribs.userData.base = ribs.position.clone();
      ribs.userData.dir = new THREE.Vector3(p.tx, 0, p.tz).normalize();
      for (const mesh of flushParts(rp, ribs)) mesh.material = foamMaterial(mesh.material as THREE.Material);
      group.add(ribs);
      out.ribs.push(ribs);
    }
  }
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
