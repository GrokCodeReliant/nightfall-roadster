// Week I: Pine Woods stage scenery (Art & Assets, art/nightfall-pinewoods-v2-20261121: 22 GLBs on the official kit
// atlas, kit / kit_emissive only, 0 new textures). Placement is the authored woodscourse.ts table on course s
// (LEVELS/03_pine_woods.md v1.0). Same merge-per-material as city.ts / coast.ts; the only separate meshes are the
// covered-bridge roof group (tunnel_roof + portal_crown, hidden while the chase cam is under the bridge) and the four
// world-level pine InstancedMeshes (near A/B + lod_far A/B, switched at 120 m) built in world.ts from woodsPineGeometry().
import * as THREE from "three";
import { bakePiece, flushParts, getPiece, inNode, loadPieces, placeMatrix, type Parts, type Pose } from "./city";
import type { ChunkCourse } from "./coastcourse";
import { woodsIn, type WoodsPlace } from "./woodscourse";

export const WOODS_PIECES: [string, string][] = [
  ["woods", "woods_pine_a"], ["woods", "woods_pine_b"], ["woods", "woods_broadleaf"], ["woods", "woods_fern_clump"],
  ["woods", "woods_stump"], ["woods", "woods_snag"], ["woods", "woods_log_stack"], ["woods", "woods_slash_pile"],
  ["woods", "woods_sawdust_pile"], ["woods", "woods_timber_wall_4m"], ["woods", "woods_fence_4m"], ["woods", "log_row_6"],
  ["woods", "log_kicker_6"], ["woods", "logging_truck"], ["woods", "woods_covered_bridge_40"], ["woods", "woods_covered_bridge_portal"],
  ["woods", "woods_river_40"], ["woods", "woods_gravel_decal"], ["woods", "woods_sawmill_shed"], ["woods", "woods_log_loader"],
  ["woods", "woods_lookout_tower"], ["woods", "woods_cabin"],
  // shared: the woods kit has no guardrail / rock / crate, so the Coast kit's (same kit atlas) stand in; race road band
  // pieces as Night City / Coast Road
  ["coast", "coast_guardrail_4m"], ["coast", "coast_guardrail_end_4m"], ["coast", "coast_rock_a"], ["coast", "coast_rock_b"], ["coast", "coast_crate"],
  ["kit", "sign_fork"], ["kit", "barrier_jersey_4m"], ["kit", "start_grid_paint_40"], ["kit", "ramp_lip_chevron_24"], ["city", "finish_gantry_24"],
];
let loaded = 0;
let asked = false;
export const woodsReady = () => loaded >= WOODS_PIECES.length;
export function loadWoods() {
  if (asked) return;
  asked = true;
  loadPieces(WOODS_PIECES, () => { loaded++; });
}

/** Hero race-s window in which the bridge roof group is hidden: the chase cam (~20 m behind, 13.5 m up) or the hero is
 *  under the bridge or inside the portal throats. Not a camera-height test: the roof ridge (~10 m) and the portal crown
 *  (~13 m) sit under the 13.5 m cam everywhere, and both cut the cam -> hero sight line inside the bridge. */
export const BRIDGE_HIDE: [number, number] = [1750 - 6, 1910 + 6];
/** distance (m) from the hero where a pine swaps to its lod_far child, and where the far band ends (far trim) */
export const PINE_LOD = { near: 120, far: 160 };

export type WoodsChunkOut = { roof: THREE.Group | null; pines: { b: boolean; m: THREE.Matrix4 }[]; placed: string[] };

/** placement log for the first lap: zone -> piece -> count (debug / report) */
export const woodsLog: Record<string, Record<string, number>> = {};
const logged = new Set<number>();

const isPine = (n: string) => n === "woods_pine_a" || n === "woods_pine_b";

/** Near (root) or far (lod_far child) pine geometry, baked to the piece's local frame, for the instanced stands. */
export function woodsPineGeometry(name: "woods_pine_a" | "woods_pine_b", far: boolean): { geo: THREE.BufferGeometry; mat: THREE.Material } | null {
  const src = getPiece(name);
  if (!src) return null;
  src.updateMatrixWorld(true);
  let found: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null;
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (found || !m.isMesh || inNode(o, "lod_far") !== far) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
    const out = new THREE.BufferGeometry();
    for (const a of ["position", "normal", "uv"]) if (g.getAttribute(a)) out.setAttribute(a, g.getAttribute(a));
    out.applyMatrix4(m.matrixWorld);
    found = { geo: out, mat: m.material as THREE.Material };
  });
  return found;
}

export function buildWoodsChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, ox: number, oz: number,
  c: ChunkCourse): WoodsChunkOut {
  const out: WoodsChunkOut = { roof: null, pines: [], placed: [] };
  if (!woodsReady()) return out;
  const parts: Parts = new Map();
  const detail: Parts = new Map();
  const roofParts: Parts = new Map();
  const m4 = new THREE.Matrix4();
  const s0 = c.cs0;
  const s1 = c.cs0 + seg * 2;
  const kAt = (s: number) => Math.max(0, Math.min(seg, Math.round((s - s0) / 2)));
  const put = (p: WoodsPlace, into: Parts, keep?: (o: THREE.Object3D) => boolean) => {
    const pose = at(kAt(p.s));
    const ly = p.ly + (p.ground ? -pose.y : 0);
    if (bakePiece(into, p.name, placeMatrix(pose, p.lx, ly, p.lz + (p.s - (s0 + kAt(p.s) * 2)), p.ry, ox, oz, m4), keep)) out.placed.push(p.name);
  };
  // lap 0 only: the course is dressed once; the run-out / next lap stays plain forest (no second finish set)
  const list = c.lap === 0 ? woodsIn(s0, s1) : [];
  for (const p of list) {
    const pose = at(kAt(p.s));
    if (!p.ground && (pose as Pose & { gap?: boolean }).gap) continue;
    if (isPine(p.name)) {
      const ly = p.ly - pose.y;
      // world-space matrix (chunk offset added back) for the stand InstancedMeshes
      const m = placeMatrix(pose, p.lx, ly, p.lz + (p.s - (s0 + kAt(p.s) * 2)), p.ry, 0, 0, new THREE.Matrix4());
      out.pines.push({ b: p.name === "woods_pine_b", m });
      out.placed.push(p.name);
      continue;
    }
    if (p.name === "woods_covered_bridge_40") {
      put(p, parts, (o) => !inNode(o, "tunnel_roof"));
      put(p, roofParts, (o) => inNode(o, "tunnel_roof"));
      continue;
    }
    if (p.name === "woods_covered_bridge_portal") {
      put(p, parts, (o) => !inNode(o, "portal_crown"));
      put(p, roofParts, (o) => inNode(o, "portal_crown"));
      continue;
    }
    put(p, p.detail ? detail : parts);
  }
  if (c.grid) bakeAt("start_grid_paint_40", at(Math.floor(seg / 2)), 0.05);
  for (const k of c.kick) bakeAt("ramp_lip_chevron_24", at(k), 0.05);
  if (c.finishK >= 0) bakeAt("finish_gantry_24", at(c.finishK), 0.05);
  function bakeAt(name: string, p: Pose, ly: number) {
    if (bakePiece(parts, name, placeMatrix(p, 0, ly, 0, 0, ox, oz, m4))) out.placed.push(name);
  }
  // detail last in each material's list: vertices [0, core) are the core, the rest is near-only dress (cityDetailRange)
  const core = new Map<THREE.Material, number>();
  for (const [mat, l] of parts) core.set(mat, l.reduce((n, g) => n + g.getAttribute("position").count, 0));
  for (const [mat, l] of detail) {
    const target = parts.get(mat) ?? [];
    if (!parts.has(mat)) core.set(mat, 0);
    target.push(...l);
    parts.set(mat, target);
  }
  for (const mesh of flushParts(parts, group)) mesh.userData.core = core.get(mesh.material as THREE.Material) ?? mesh.geometry.getAttribute("position").count;
  if (roofParts.size) {
    const roof = new THREE.Group();
    roof.userData.bridge = true;
    flushParts(roofParts, roof);
    group.add(roof);
    out.roof = roof;
  }
  if (!logged.has(index) && c.lap === 0) {
    logged.add(index);
    const row = (woodsLog[c.zone] ??= {});
    for (const n of out.placed) row[n] = (row[n] ?? 0) + 1;
  }
  return out;
}

/** Truck visual: logging_truck body (root, tint target) + load child, merged per material (kit, kit_emissive) into one
 *  reusable group. Cab / forward faces +Z. world.ts keeps a pool of TRUCK.maxAlive of these. */
export function makeTruckMesh(): THREE.Group | null {
  if (!getPiece("logging_truck")) return null;
  const parts: Parts = new Map();
  bakePiece(parts, "logging_truck", new THREE.Matrix4());
  const g = new THREE.Group();
  flushParts(parts, g);
  g.name = "logging_truck";
  return g;
}
