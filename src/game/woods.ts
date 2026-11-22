// Week I: Pine Woods stage scenery (Art & Assets, art/nightfall-pinewoods-v2-20261121: 22 GLBs on the official kit
// atlas, kit / kit_emissive only, 0 new textures). Placement is the authored woodscourse.ts table on course s
// (LEVELS/03_pine_woods.md v1.0). Same merge-per-material as city.ts / coast.ts; the only separate meshes are the
// covered-bridge roof group (tunnel_roof + portal_crown, hidden while the chase cam is under the bridge) and the four
// world-level pine InstancedMeshes (near A/B + lod_far A/B, switched at 120 m) built in world.ts from woodsPineGeometry().
import * as THREE from "three";
import { bakePiece, bakePieceBent, chunkFrame, flushParts, getPiece, inNode, loadPieces, placeMatrix, type Parts, type Pose } from "./city";
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

/** 40 m road-following strips: baked with the bent-road builder (bakePieceBent), not rigid at one pose */
const BENT = new Set(["woods_covered_bridge_40", "woods_gravel_decal", "woods_river_40"]);
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

/**
 * Over-road beams outside the hide-able children: the bridge module's 3 tie beams (y 7.8-8.0, z -10/0/10, 24 tris) and
 * the portal lintel (y 8.4-8.6, 8 tris) sit in the root mesh, so with tunnel_roof / portal_crown hidden they still cut
 * the 13.5 m chase cam -> hero line under the bridge (pinewoods-v1 bridge-under shot). Once at first build, triangles
 * over the carriageway (|x| < 11.5, centroid y > 3) move into a mesh parented to the roof / crown node, so the same
 * hide takes them. Visual only; the rest of the module (walls, lamps) is untouched. Per piece: [triangles moved].
 */
export const beamSplit: Record<string, number> = {};
function splitBeams() {
  for (const [piece, node] of [["woods_covered_bridge_40", "tunnel_roof"], ["woods_covered_bridge_portal", "portal_crown"]] as const) {
    if (beamSplit[piece] != null) continue;
    const src = getPiece(piece);
    if (!src) continue;
    beamSplit[piece] = 0;
    let host: THREE.Object3D | null = null;
    src.traverse((o) => { if (o.name === node) host = o; });
    const meshes: THREE.Mesh[] = [];
    src.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !inNode(o, node) && (m.material as THREE.Material).name === "kit") meshes.push(m); });
    for (const m of meshes) {
      if (!host) break;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const pos = g.getAttribute("position");
      const keep: number[] = [];
      const move: number[] = [];
      for (let t = 0; t < pos.count; t += 3) {
        let x = 0, y = 0;
        for (let k = 0; k < 3; k++) { x += pos.getX(t + k) / 3; y += pos.getY(t + k) / 3; }
        (Math.abs(x) < 11.5 && y > 3 ? move : keep).push(t);
      }
      if (!move.length) continue;
      const pick = (list: number[]) => {
        const out = new THREE.BufferGeometry();
        for (const name of ["position", "normal", "uv"]) {
          const a = g.getAttribute(name);
          if (!a) continue;
          const arr = new Float32Array(list.length * 3 * a.itemSize);
          list.forEach((t, i) => { for (let k = 0; k < 3 * a.itemSize; k++) arr[i * 3 * a.itemSize + k] = (a.array as Float32Array)[t * a.itemSize + k]; });
          out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
        }
        return out;
      };
      m.geometry = pick(keep);
      const beams = new THREE.Mesh(pick(move), m.material);
      beams.name = `${node}_beams`;
      // host (roof / crown node) and the root mesh share the module frame (both identity in the GLB)
      (host as THREE.Object3D).add(beams);
      beamSplit[piece] += move.length;
    }
  }
}

export function buildWoodsChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, ox: number, oz: number,
  c: ChunkCourse): WoodsChunkOut {
  const out: WoodsChunkOut = { roof: null, pines: [], placed: [] };
  if (!woodsReady()) return out;
  splitBeams();
  const parts: Parts = new Map();
  const detail: Parts = new Map();
  const roofParts: Parts = new Map();
  const m4 = new THREE.Matrix4();
  const s0 = c.cs0;
  const s1 = c.cs0 + seg * 2;
  const kAt = (s: number) => Math.max(0, Math.min(seg, Math.round((s - s0) / 2)));
  const put = (p: WoodsPlace, into: Parts, keep?: (o: THREE.Object3D) => boolean) => {
    const pose = at(kAt(p.s));
    if (BENT.has(p.name)) {
      // coast seam fix (week-i-coast-fixes): 40 m strips bend along the road from their sample, so they meet the next
      // chunk's strip and the bent kit road exactly; road-level strips ride the road profile
      const ly = p.ly + (p.ground ? -pose.y : 0);
      if (bakePieceBent(into, p.name, chunkFrame(at, kAt(p.s), seg), !p.ground, p.lx, ly, p.ry, ox, oz, keep)) out.placed.push(p.name);
      return;
    }
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
  if (c.grid && bakePieceBent(parts, "start_grid_paint_40", chunkFrame(at, Math.floor(seg / 2), seg), true, 0, 0.05, 0, ox, oz)) out.placed.push("start_grid_paint_40");
  for (const k of c.kick) if (bakePieceBent(parts, "ramp_lip_chevron_24", chunkFrame(at, k, seg), true, 0, 0.05, 0, ox, oz)) out.placed.push("ramp_lip_chevron_24");
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
