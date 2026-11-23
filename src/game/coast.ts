// Week I: Coast Road stage scenery (art/nightfall-coast-20261120 + shared drop). Visual only; the sim reads the
// same course.ts tables (gates, medians, rocks, kicker K1, sand drift, wave wash), so mesh and collider share one source.
// Placement follows LEVELS/02_coast_road.md zones CR-0..CR-12 on course s (see course.ts). Same merge-per-material
// as city.ts; the only separate meshes are the arch roof (hidden when the camera is above it), the lighthouse beam
// (spins). Foam v2 scrolls in its own shader (cell-local UV wrap, atlas v3) and merges per foam material.
// Look pass v2 (Art & Assets, art/nightfall-coast-v2-20261121): sea glow / shore foam / horizon, lighthouse blade, arch,
// pier approach, seawall lamps, beach dress, crate + guardrail end. All on the official kit atlas (kit / kit_emissive).
// Look pass v3 (Art & Assets, art/nightfall-coast-v3-20261121): arch v3 (vault baked into tunnel_roof), portal v3
// (lintel on child portal_crown), shorter lighthouse v3 (32 m lamp_beam), broken shore foam v3, cliff v2 (no flat lid).
import * as THREE from "three";
import { bakePiece, bakePieceBent, chunkFrame, flushParts, getPiece, inNode, loadPieces, placeMatrix, type Parts, type Pose } from "./city";
import type { ChunkCourse } from "./coastcourse";
import { COAST_GATES, COAST_KICKERS, COAST_OBSTACLES, COAST_ROAD, COAST_SAND, COAST_WASH } from "./course";

const COAST_PIECES: [string, string][] = [
  // new 2026-11-20
  ["coast", "coast_beach_shoulder_40"], ["coast", "coast_sand_drift_6x20"], ["coast", "coast_arch_40"], ["coast", "coast_arch_portal"],
  ["coast", "coast_lighthouse"], ["coast", "coast_umbrella"], ["coast", "coast_beach_hut"], ["coast", "coast_pier_deck_20"],
  ["coast", "coast_boardwalk_40"], ["coast", "coast_dune_mound"], ["coast", "coast_foam_strip_24_v2"],
  // look pass v2 (art/nightfall-coast-v2-20261121); the v1 pieces above stay loaded as fallback
  // (v2 arch / portal / lighthouse / shore foam are superseded by v3 below and no longer loaded)
  ["coast", "coast_beach_shoulder_40_v2"], ["coast", "coast_water_glow_40"],
  ["coast", "coast_horizon_bar_40"], ["coast", "coast_pier_approach_16"],
  // look pass v3 (art/nightfall-coast-v3-20261121)
  ["coast", "coast_arch_40_v3"], ["coast", "coast_arch_portal_v3"], ["coast", "coast_lighthouse_v3"], ["coast", "coast_shore_foam_40_v3"],
  ["coast", "coast_cliff_40_v2"],
  ["coast", "coast_driftwood"], ["coast", "coast_seawall_lamp"], ["coast", "coast_crate"], ["coast", "coast_guardrail_end_4m"],
  // existing coast set, first use
  ["coast", "coast_water_40"], ["coast", "coast_guardrail_4m"], ["coast", "coast_stone_wall_4m"], ["coast", "coast_palm"],
  ["coast", "coast_rock_a"], ["coast", "coast_rock_b"], ["coast", "coast_shrub"], ["coast", "coast_lifeguard_tower"],
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
/** crown: a merged chunk mesh whose last vertices are the CR-5 entry portal's over-road crown; world.ts cuts them with
 *  drawRange(0, keep) while the hero is just through the portal (the crown sits above the 13.5 m chase cam there and
 *  hides the hero for ~10 m). 0 extra draws. */
export type CoastCrown = { mesh: THREE.Mesh; keep: number; s: number };
export type CoastChunkOut = { roof: THREE.Group | null; spin: THREE.Group | null; wash: THREE.Group[]; crown: CoastCrown[]; placed: string[] };
/** hero race-s window after the entry portal (s 1580) in which the crown is cut; measured hidden 1590..1598 */
export const CROWN_CUT: [number, number] = [6, 22];

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
    // The glow sheet ships at emissive strength 3.2 over the whole strip; under the high chase cam that reads as a
    // flat white slab. Keep the glow as a hint so the scrolling texture (and the telegraph) shows through.
    // The atlas alpha is roughness, not opacity, so the sheet is fully opaque: blend it at half strength so the sea and
    // sand read through and the strip looks like wash, not a slab (same draw, no new material).
    if (m.emissive && m.emissiveMap) m.emissiveIntensity = 0.45;
    m.transparent = true;
    m.opacity = 0.5;
    m.depthWrite = false;
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

/** Spec crates (§2): L4 at 1350 (Fork A sea side) and L4 at 2160 (Fork B sea side). */
const CRATES: [number, number][] = [[1350, 9], [2160, 9]];
const ARCH = "coast_arch_40_v3";
const PORTAL = "coast_arch_portal_v3";
const LH = "coast_lighthouse_v3";
const SHORE = "coast_shore_foam_40_v3";
const CLIFF = "coast_cliff_40_v2";
const beamMats = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();
/** v3 lamp_beam: private additive instance at low intensity (the shared kit_emissive ships at strength 4; the v2 70 m
 *  blade at full strength read as a milky oval over the seawall). The spin group is its own draw either way. */
export const BEAM_LOOK = { emissiveIntensity: 1.1, opacity: 0.55 };
function beamMat(m: THREE.MeshStandardMaterial) {
  let b = beamMats.get(m);
  if (!b) {
    b = m.clone();
    b.name = `${m.name}@beam`;
    b.blending = THREE.AdditiveBlending;
    b.transparent = true;
    b.depthWrite = false;
    b.side = THREE.DoubleSide;
    b.emissiveIntensity = BEAM_LOOK.emissiveIntensity;
    b.opacity = BEAM_LOOK.opacity;
    beamMats.set(m, b);
  }
  return b;
}
/** v3 shore foam dashes: one private dim instance of kit_emissive shared by every chunk (one extra draw per chunk that
 *  shows shore foam; never the full-strength shared kit_emissive, which made v2's band the brightest thing on screen). */
export const SHORE_LOOK = { emissiveIntensity: 0.6, opacity: 0.5 };
const shoreMats = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();
function shoreMat(m: THREE.MeshStandardMaterial) {
  let f = shoreMats.get(m);
  if (!f) {
    f = m.clone();
    f.name = `${m.name}@shore`;
    f.transparent = true;
    f.depthWrite = false;
    f.emissiveIntensity = SHORE_LOOK.emissiveIntensity;
    f.opacity = SHORE_LOOK.opacity;
    shoreMats.set(m, f);
  }
  return f;
}
/** Coast chunks draw kit_emissive through a matte clone: the sea glow cards (and rails) sit on low-roughness atlas cells,
 *  so the moon / env reflection on the flat glow card read as a hot white glint blob over the sea. Same mesh, so 0 draws;
 *  Night City keeps the shared original. */
export const GLINT_ROUGH = 0.8;
const matteMats = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();
/** Coast inland cliff (pw-coast-polish): the land-side rock face sat almost black against the night sky (Sara, hosted
 *  phone shot). A Coast-only clone of its material adds a soft dusk-lit self term (albedo x LAND_CLIFF_LIFT) so the rock
 *  texture reads; the sea cliff, walls and every other stage keep the shared material. */
export const LAND_CLIFF_LIFT = [0.42, 0.34, 0.3] as const;
const landCliffMats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
function landCliffMat(m: THREE.MeshStandardMaterial) {
  let c = landCliffMats.get(m);
  if (!c) {
    c = m.clone();
    c.name = `${m.name}@landcliff`;
    const prev = m.onBeforeCompile;
    c.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vec3( ${LAND_CLIFF_LIFT.map((v) => v.toFixed(3)).join(", ")} );`);
    };
    c.customProgramCacheKey = () => `nf_coast_landcliff_${m.name}`;
    landCliffMats.set(m, c);
  }
  return c;
}
function coastMatte(m: THREE.MeshStandardMaterial) {
  let c = matteMats.get(m);
  if (!c) {
    c = m.clone();
    c.name = `${m.name}@coast`;
    c.envMapIntensity = 0.4;
    c.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n roughnessFactor = max( roughnessFactor, ${GLINT_ROUGH.toFixed(2)} );`);
    };
    c.customProgramCacheKey = () => "nf_coast_matte";
    matteMats.set(m, c);
  }
  return c;
}
/** move the shore foam geometry out of the shared emissive list onto its private dim instance */
export function privateShore(parts: Parts, mk: (m: THREE.MeshStandardMaterial) => THREE.Material = shoreMat) {
  let n = 0;
  for (const [mat, list] of [...parts]) {
    const mine = list.filter((g) => g.userData.piece === SHORE);
    if (!mine.length) continue;
    const dim = mk(mat as THREE.MeshStandardMaterial);
    if (dim === mat) continue;
    parts.set(mat, list.filter((g) => !mine.includes(g)));
    if (!parts.get(mat)!.length) parts.delete(mat);
    parts.set(dim, [...(parts.get(dim) ?? []), ...mine]);
    n += mine.length;
  }
  return n;
}

/** Look pass v2 pieces whose kit_emissive faces may fold into the chunk's kit draw. */
const V2_FOLD = new Set([
  "coast_water_glow_40", "coast_shore_foam_40", "coast_horizon_bar_40", "coast_beach_shoulder_40_v2", ARCH, PORTAL, LH,
  "coast_pier_approach_16", "coast_seawall_lamp", "coast_guardrail_end_4m",
]);
const V2_DROP = new Set(["coast_water_glow_40", "coast_horizon_bar_40"]);
/** 0 new draws for the v2 pass: on chunks where kit_emissive comes only from v2 pieces (beach and arch chunks had no
 *  emissive draw before), bake those faces into the kit draw instead (same atlas, lit instead of glowing). Chunks that
 *  already draw kit_emissive (rails, lifeguard tower, boardwalk, gantry) keep the glow at no extra cost. */
export function foldV2Emissive(parts: Parts) {
  const mats = [...parts.keys()];
  const kit = mats.find((m) => m.name === "kit");
  const em = mats.find((m) => m.name === "kit_emissive");
  const list = em && parts.get(em);
  if (!kit || !em || !list || !list.every((g) => V2_FOLD.has(g.userData.piece as string))) return 0;
  // the water glow / horizon cards are dark teal cells: lit (not glowing) they would black out the water tiles' sparkle,
  // so on these chunks they are dropped instead of folded; foam line, shoulder lip, arch and portal lamps fold
  const keep = list.filter((g) => !V2_DROP.has(g.userData.piece as string));
  for (const g of list) if (!keep.includes(g)) g.dispose();
  parts.get(kit)!.push(...keep);
  parts.delete(em);
  return keep.length;
}

/** Flat brown swatch (u,v ~ 0.140/0.172, 0.610) that v2 uses as point-UVs on the arch buttresses, portal jambs and
 *  lighthouse rock base (v3 keeps them, and cliff v2's terrace tops use it too): from the high cam those read as
 *  untextured brown boxes (BROWN_BOX.txt). Until Art bakes real
 *  UVs, re-project those faces into the rock cell the arch shell already samples (no new texture, same material). */
const ROCK_CELL = { u0: 0.51, u1: 0.74, v0: 0.775, v1: 0.995 };
const ROCK_TILE = 6; // metres of rock per cell repeat
const SWATCH_FIX = [ARCH, PORTAL, LH, CLIFF];
let swatchFixed = false;
export function isSwatch(u: number, v: number) {
  return Math.abs(v - 0.61) < 0.006 && ((u > 0.134 && u < 0.146) || (u > 0.165 && u < 0.178));
}
export function rockSwatchUvs(g: THREE.BufferGeometry) {
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
  if (!uv || g.index) return 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let fixed = 0;
  for (let t = 0; t < pos.count; t += 3) {
    if (![0, 1, 2].every((k) => isSwatch(uv.getX(t + k), uv.getY(t + k)))) continue;
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const pick = (p: THREE.Vector3): [number, number] => (ax >= ay && ax >= az ? [p.z, p.y] : ay >= az ? [p.x, p.z] : [p.x, p.y]);
    const q = [a, b, c].map(pick);
    const span = Math.max(ROCK_TILE, ...q.map((x) => x[0]).map((x, _, l) => Math.max(...l) - Math.min(...l)), ...q.map((x) => x[1]).map((y, _, l) => Math.max(...l) - Math.min(...l)));
    const o0 = Math.floor(Math.min(...q.map((x) => x[0])) / ROCK_TILE) * ROCK_TILE, o1 = Math.floor(Math.min(...q.map((x) => x[1])) / ROCK_TILE) * ROCK_TILE;
    q.forEach(([s0, s1], k) => {
      const fu = Math.min(1, (s0 - o0) / (span + ROCK_TILE)), fv = Math.min(1, (s1 - o1) / (span + ROCK_TILE));
      uv.setXY(t + k, ROCK_CELL.u0 + fu * (ROCK_CELL.u1 - ROCK_CELL.u0), ROCK_CELL.v0 + fv * (ROCK_CELL.v1 - ROCK_CELL.v0));
    });
    fixed++;
  }
  uv.needsUpdate = true;
  return fixed;
}
/** CR-6 lighthouse v3 (Art INTEGRATION v3): s 1880, just seaward of the rail at x -16, base on the cliff-sea
 *  (y -12 - mid.y, dy 0). The shorter tower (lantern world y ~8) does the lowering; the whole tower and beam read
 *  45-85 m before it, so the lighthouse shot is taken ~55 m before (race s 1825). */
/** sea cliff drop under the deck (coast seam fix: was -24.15, its 24.20 cap ridge then stood 0.05 m over the road) */
export const SEA_CLIFF_Y = -24.45;
export const LIGHTHOUSE = { s: 1880, lx: -16, dy: 0 };
/** tris re-projected per piece (report / debug) */
export const swatchLog: Record<string, number> = {};
function fixSwatches() {
  if (swatchFixed) return;
  swatchFixed = true;
  for (const name of SWATCH_FIX) {
    getPiece(name)?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m.material as THREE.Material).name !== "kit") return; // tunnel_roof / portal_crown included
      if (m.geometry.index) m.geometry = m.geometry.toNonIndexed();
      swatchLog[name] = (swatchLog[name] ?? 0) + rockSwatchUvs(m.geometry);
    });
  }
}

export function buildCoastChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, half: number, ox: number, oz: number,
  rnd: (n: number) => number, c: ChunkCourse): CoastChunkOut {
  const out: CoastChunkOut = { roof: null, spin: null, wash: [], crown: [], placed: [] };
  const crown: Parts = new Map();
  if (!coastReady()) return out;
  fixSwatches();
  const parts: Parts = new Map();
  const landCliff: Parts = new Map();
  const m4 = new THREE.Matrix4();
  const put = (name: string, p: Pose, lx: number, ly: number, lz: number, ry: number, keep?: (o: THREE.Object3D) => boolean, into = parts) => {
    if (bakePiece(into, name, placeMatrix(p, lx, ly, lz, ry, ox, oz, m4), keep)) out.placed.push(name);
  };
  const mid = at(Math.floor(seg / 2));
  // coast seam fix: 40 m strips (shoulder, cliffs, sea, shore, boardwalk, arch, paint) are bent along the road from
  // sample k0 instead of laid rigid at one pose; followY rides the road profile, otherwise the strip keeps k0's height
  const midK = Math.floor(seg / 2);
  const putB = (name: string, k0: number, lx: number, ly: number, ry: number, followY: boolean, keep?: (o: THREE.Object3D) => boolean, into = parts) => {
    if (bakePieceBent(into, name, chunkFrame(at, k0, seg), followY, lx, ly, ry, ox, oz, keep)) out.placed.push(name);
  };
  const s0 = c.cs0;
  const s1 = c.cs0 + seg * 2;
  const kAt = (s: number) => Math.round((s - s0) / 2);
  const overlaps = (a: number, b: number) => a < s1 && b > s0;
  const z = c.zone;
  const wash = WASH.some(([a, b]) => overlaps(a, b));
  // wash (CR-7 Breaker Run) is a rail-edged zone with sea, not a beach: no sand pad there (look pass v2)
  const soft = SOFT.has(z);
  const arch = z === "CR-5" && c.flat;
  const ramp = z === "CR-2" || z === "CR-9";
  const R = (n: number) => rnd(index * 41 + n);

  if (soft) {
    // beach: sand shoulder at the chunk origin, sea at y -1.5 beyond the water edge (x -32)
    putB("coast_beach_shoulder_40_v2", midK, 0, 0, 0, true);
    putB("coast_water_40", midK, -52, -1.5, 0, false);
    putB("coast_water_40", midK, -92, -1.5, 0, false);
    putB("coast_water_glow_40", midK, -52, -1.45, 0, false);
    putB("coast_water_glow_40", midK, -92, -1.45, 0, false);
    // coast_moon_glint_80 is staged but not placed: one 80 m glint per 40 m chunk reads in-engine as white bars across
    // the sea every chunk (Art's HONEST_LOOK "hot dart" risk), and it shares kit_emissive so it cannot be dimmed alone.
    putB("coast_horizon_bar_40", midK, -108, -1.5, 0, false);
    putB(SHORE, midK, -32, -1.45, 0, false);
    if (!wash) {
      for (const lz of [-12, 8]) if (R(lz) < 0.7) put("coast_palm", mid, half + 5 + R(lz + 3) * 3, 0, lz, R(lz + 5) * 6.28);
      put("coast_shrub", mid, half + 3, 0, R(7) * 30 - 15, R(8) * 6.28);
      if (z !== "CR-12" && z !== "RUN") {
        const n = 1 + Math.floor(R(11) * 3);
        for (let u = 0; u < n; u++) put("coast_umbrella", mid, -(20 + R(u * 3 + 12) * 6), 0, -15 + u * 12 + R(u + 30) * 4, R(u + 40) * 6.28);
        if ((z === "CR-0" || z === "CR-3") && R(50) < 0.5) put("coast_beach_hut", mid, -28, 0, R(51) * 20 - 10, -Math.PI / 2);
        if (R(90) < 0.7) put("coast_driftwood", mid, -(16 + R(91) * 8), 0, R(92) * 24 - 12, R(93) * 6.28);
        if (R(94) < 0.6) put("coast_rock_a", mid, -(20 + R(95) * 6), -0.15, R(96) * 24 - 12, R(97) * 6.28);
      }
    }
    // lifeguard towers: CR-0 x1, CR-8 x2, CR-11 x1, on the sand facing the sea
    if (s0 === 180 || s0 === 2460 || s0 === 2620 || s0 === 3500) put("coast_lifeguard_tower", mid, -24, 0, 0, -Math.PI / 2);
    // CR-8 pier: 8 x 20 m modules straight out to sea from the shoulder water edge, end_hut on the last only
    if (s0 <= 2560 && 2560 < s1) {
      const p = at(kAt(2560));
      // approach sits on the sand (centre x=-24) and meets the first 20 m module at the water edge (x=-32)
      put("coast_pier_approach_16", p, -24, 0, 0, -Math.PI / 2);
      for (let j = 0; j < 8; j++) put("coast_pier_deck_20", p, -(32 + 10 + 20 * j), 0, 0, -Math.PI / 2, j === 7 ? undefined : (o) => !inNode(o, "end_hut"));
      put("coast_water_40", p, -132, -1.5, 0, 0);
      put("coast_water_40", p, -172, -1.5, 0, 0);
      put("coast_water_40", p, -212, -1.5, 0, 0);
      for (const x of [-132, -172, -212]) put("coast_water_glow_40", p, x, -1.45, 0, 0);
    }
    // CR-12 boardwalk (with its string lights) on the sand; beach huts land side stand in for the shopfront row
    if (z === "CR-12" || z === "RUN") {
      putB("coast_boardwalk_40", midK, -16, 0, 0, true);
      if (R(60) < 0.6) put("coast_beach_hut", mid, half + 8, 0, R(61) * 20 - 10, Math.PI / 2);
    }
  } else {
    // cliff road: guardrail on the sea edge, stone wall on the land edge, sea far below at y -12
    if (!arch) {
      for (let k = 1; k < seg; k += 2) {
        const p = at(k);
        put("coast_guardrail_4m", p, -(half + 0.6), 0, 0, 0);
        put("coast_stone_wall_4m", p, half + 1, 0, 0, 0);
        if (k % 4 === 1) put("coast_seawall_lamp", p, -(half + 0.9), 0, 0, 0);
      }
    }
    // inland cliff (pw-coast-polish): its own parts so it gets the Coast-only lifted rock material (landCliffMat)
    putB(CLIFF, midK, half + 5, ramp ? -mid.y : 0, Math.PI, false, undefined, landCliff);
    // sea cliff: it sits under the sea lanes. Cliff v2 still has a 24.20 m cap ridge (lateral 9.2..13.0 after the
    // flip), so at -24.15 the ridge stood 0.05 m ABOVE the kit deck (deck top y 0) along the sea lane edge on every
    // cliff chunk (coast seam spot "cliff cap"). -24.45 keeps the whole cliff top >= 0.25 m under the deck.
    putB(CLIFF, midK, -(half + 1), SEA_CLIFF_Y - (ramp ? mid.y : 0), Math.PI, false);
    putB("coast_water_40", midK, -40, -12 - mid.y, 0, false);
    putB("coast_water_40", midK, -80, -12 - mid.y, 0, false);
    putB("coast_water_glow_40", midK, -40, -11.95 - mid.y, 0, false);
    putB("coast_water_glow_40", midK, -80, -11.95 - mid.y, 0, false);
    putB("coast_horizon_bar_40", midK, -96, -12 - mid.y, 0, false);
    putB(SHORE, midK, -22, -11.9 - mid.y, 0, false);
    put(R(70) < 0.5 ? "coast_rock_a" : "coast_rock_b", mid, -(30 + R(71) * 30), -12.4 - mid.y, R(72) * 30 - 15, R(73) * 6.28);
    if (R(74) < 0.5) put("coast_rock_b", mid, -(45 + R(75) * 20), -12.4 - mid.y, R(76) * 30 - 15, R(77) * 6.28);
    if (ramp) {
      // dunes around the ramp at ground level
      for (const side of [1, -1]) put("coast_dune_mound", mid, side * (half + 8), -mid.y, R(side + 80) * 20 - 10, R(side + 81) * 6.28);
    }
  }
  if (arch) {
    const rp: Parts = new Map();
    // v3 bakes the over-road vault into tunnel_roof: walls (and side-wall vault lamps) stay in the chunk, the roof child
    // goes to the hide-able group (no load-time triangle split any more)
    putB(ARCH, midK, 0, 0, 0, true, (o) => !inNode(o, "tunnel_roof"));
    putB(ARCH, midK, 0, 0, 0, true, (o) => inNode(o, "tunnel_roof"), rp);
    const roof = new THREE.Group();
    roof.userData.roofY = mid.y + 8; // v2 crown is taller (was +6.08)
    flushParts(rp, roof);
    group.add(roof);
    out.roof = roof;
    // portals sit on the chunk's end samples (not mid + lz ±20 along the mid tangent), so they meet the bent arch ends
    if (s0 === 1580) {
      put(PORTAL, at(0), 0, 0, 0, 0, (o) => !inNode(o, "portal_crown"));
      put(PORTAL, at(0), 0, 0, 0, 0, (o) => inNode(o, "portal_crown"), crown);
    }
    if (s0 === 1660) put(PORTAL, at(seg), 0, 0, 0, Math.PI);
  }
  // CR-6 lighthouse on the sea side headland, beam spins about the tower axis
  if (s0 <= LIGHTHOUSE.s && LIGHTHOUSE.s < s1) {
    const p = at(kAt(LIGHTHOUSE.s));
    const ly = -12 + LIGHTHOUSE.dy - p.y;
    put(LH, p, LIGHTHOUSE.lx, ly, 0, 0, (o) => !inNode(o, "lamp_beam"));
    const bp: Parts = new Map();
    if (bakePiece(bp, LH, new THREE.Matrix4(), (o) => inNode(o, "lamp_beam"))) {
      const spin = new THREE.Group();
      placeMatrix(p, LIGHTHOUSE.lx, ly, 0, 0, ox, oz, m4).decompose(spin.position, spin.quaternion, spin.scale);
      // v3 32 m lamp_beam along +Z: additive, low intensity, no depth write. Own material instance (the spin group is
      // already its own mesh/draw), so the shared kit_emissive is untouched.
      for (const mesh of flushParts(bp, spin)) mesh.material = beamMat(mesh.material as THREE.MeshStandardMaterial);
      group.add(spin);
      out.spin = spin;
    }
  }
  // sand drift on the asphalt (slow-lane patches), 20 m tiles across each SD window
  for (const [a, b, lat] of SD) {
    for (let cs = a + 10; cs - 10 < b; cs += 20) {
      if (cs < s0 || cs >= s1) continue;
      putB("coast_sand_drift_6x20", Math.min(seg, kAt(cs)), -lat, 0.06, 0, true);
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
  // Art v2 crate + guardrail terminal (merged per material, visual only like Night City's crates). The terminal's end
  // is local -Z: at a median's start it faces oncoming traffic, at its end it is turned round.
  for (const m of COAST_ROAD.medians) {
    if (inChunk(m.s0 - 2)) put("coast_guardrail_end_4m", atS(m.s0 - 2), 0, 0, 0, 0);
    if (inChunk(m.s1 + 2)) put("coast_guardrail_end_4m", atS(m.s1 + 2), 0, 0, 0, Math.PI);
  }
  for (const [s, lat] of CRATES) if (inChunk(s)) put("coast_crate", atS(s), -lat, 0, 0, 0.3);
  if (c.grid) putB("start_grid_paint_40", midK, 0, 0.05, 0, true);
  for (const k of c.kick) putB("ramp_lip_chevron_24", k, 0, 0.05, 0, true);
  if (c.finishK >= 0) put("finish_gantry_24", at(c.finishK), 0, 0.05, 0, 0);
  privateShore(parts);
  foldV2Emissive(parts);
  // entry-portal crown last in its material's list (kit_emissive faces go to kit if the chunk's glow was folded)
  const cut = new Map<THREE.Material, number>();
  for (const [mat, list] of crown) {
    const target = parts.has(mat) ? mat : [...parts.keys()].find((m) => m.name === "kit") ?? mat;
    const l = parts.get(target) ?? [];
    l.push(...list);
    parts.set(target, l);
    cut.set(target, (cut.get(target) ?? 0) + list.reduce((n, g) => n + g.getAttribute("position").count, 0));
  }
  for (const mesh of flushParts(landCliff, group)) mesh.material = landCliffMat(mesh.material as THREE.MeshStandardMaterial);
  for (const mesh of flushParts(parts, group)) {
    const n = cut.get(mesh.material as THREE.Material);
    if ((mesh.material as THREE.Material).name === "kit_emissive") mesh.material = coastMatte(mesh.material as THREE.MeshStandardMaterial);
    if (n) out.crown.push({ mesh, keep: mesh.geometry.getAttribute("position").count - n, s: 1580 });
  }
  if (c.lap === 0 && !logged.has(index)) {
    logged.add(index);
    const row = (coastLog[z] ??= {});
    for (const n of out.placed) row[n] = (row[n] ?? 0) + 1;
  }
  return out;
}
