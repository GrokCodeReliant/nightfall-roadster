// Week I: Open Highway stage scenery (Art & Assets, art/nightfall-highway-20261120: 15 GLBs on the official kit atlas,
// kit / kit_emissive only, 0 new textures). Placement is the authored highwaycourse.ts table on course s
// (LEVELS/04_open_highway.md v1.0). Same merge-per-material as city.ts / coast.ts / woods.ts. The far backdrop (4 mesas,
// 6 turbines with spinning rotors) is one world-level group built once per race by world.ts from highwayFarGroup().
import * as THREE from "three";
import { bakePiece, bakePieceBent, chunkFrame, flushParts, getPiece, inNode, loadPieces, placeMatrix, type Parts, type Pose } from "./city";
import type { ChunkCourse } from "./coastcourse";
import { DESERT_PATCH, HIGHWAY_FAR, desertPatches, highwayIn, type HighwayPlace } from "./highwaycourse";

export const HIGHWAY_PIECES: [string, string][] = [
  ["highway", "desert_cactus_a"], ["highway", "desert_cactus_b"], ["highway", "desert_scrub"], ["highway", "desert_rock_spire"],
  ["highway", "desert_mesa_backdrop"], ["highway", "fuel_stop_set"], ["highway", "overhead_gantry_24"], ["highway", "wind_turbine_far"],
  ["highway", "salt_flat_tile_40"], ["highway", "billboard_frame_blank"], ["highway", "desert_fence_4m"],
  // shared: Coast kit rails / crate (same kit atlas), Night City tunnel / barricade / kicker, Pine Woods gravel decal, road band
  ["coast", "coast_guardrail_4m"], ["coast", "coast_guardrail_end_4m"], ["coast", "coast_crate"],
  ["city", "tunnel_40"], ["city", "tunnel_portal"], ["city", "barricade_3m"], ["city", "ramp_kicker_1m"], ["woods", "woods_gravel_decal"],
  ["kit", "sign_fork"], ["kit", "barrier_jersey_4m"], ["kit", "start_grid_paint_40"], ["kit", "ramp_lip_chevron_24"], ["city", "finish_gantry_24"],
];
let loaded = 0;
let asked = false;
export const highwayReady = () => loaded >= HIGHWAY_PIECES.length;
export function loadHighway() {
  if (asked) return;
  asked = true;
  loadPieces(HIGHWAY_PIECES, () => { loaded++; });
}

/** near-only dress the far trim drops past ~120 m (cityDetailRange) */
const BENT = new Set(["woods_gravel_decal"]);

/** Tan sand cell on road_kit_atlas (px 224-255 x 512-543, ~rgb 158,140,107), sampled by every desert-patch vertex. */
export const DESERT_PATCH_UV: [number, number] = [0.234, 0.515];
/** Unit desert patch: flat irregular 9-gon on the tan cell, kit material (instance colour = tone). */
export function desertPatchGeometry(): { geo: THREE.BufferGeometry; mat: THREE.Material } | null {
  const src = getPiece("desert_scrub");
  if (!src) return null;
  let mat: THREE.Material | null = null;
  src.traverse((o) => { const m = o as THREE.Mesh; if (!mat && m.isMesh) mat = m.material as THREE.Material; });
  if (!mat) return null;
  const n = 9, pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const rim = (k: number) => { const a = (k / n) * Math.PI * 2, r = 0.78 + 0.22 * Math.sin(k * 2.3 + 0.7); return [Math.cos(a) * r, Math.sin(a) * r]; };
  for (let k = 0; k < n; k++) {
    const [ax, az] = rim(k), [bx, bz] = rim(k + 1);
    pos.push(0, 0, 0, bx, 0, bz, ax, 0, az);
    for (let v = 0; v < 3; v++) { nor.push(0, 1, 0); uv.push(...DESERT_PATCH_UV); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return { geo, mat };
}

export type HighwayChunkOut = { patches: { m: THREE.Matrix4; tone: number }[]; placed: string[] };
export const highwayLog: Record<string, Record<string, number>> = {};
const logged = new Set<number>();

export function buildHighwayChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, ox: number, oz: number,
  c: ChunkCourse): HighwayChunkOut {
  const out: HighwayChunkOut = { patches: [], placed: [] };
  if (!highwayReady()) return out;
  const parts: Parts = new Map();
  const detail: Parts = new Map();
  const m4 = new THREE.Matrix4();
  const s0 = c.cs0;
  const s1 = c.cs0 + seg * 2;
  const kAt = (s: number) => Math.max(0, Math.min(seg, Math.round((s - s0) / 2)));
  const put = (p: HighwayPlace, into: Parts, keep?: (o: THREE.Object3D) => boolean) => {
    const pose = at(kAt(p.s));
    const ly = p.ly + (p.ground ? -pose.y : 0);
    if (BENT.has(p.name)) {
      if (bakePieceBent(into, p.name, chunkFrame(at, kAt(p.s), seg), !p.ground, p.lx, ly, p.ry, ox, oz, keep)) out.placed.push(p.name);
      return;
    }
    if (bakePiece(into, p.name, placeMatrix(pose, p.lx, ly, p.lz + (p.s - (s0 + kAt(p.s) * 2)), p.ry, ox, oz, m4), keep)) out.placed.push(p.name);
  };
  // desert floor patches (every lap)
  for (const f of desertPatches(s0, s1)) {
    const pose = at(kAt(f.s));
    const m = placeMatrix(pose, f.lx, DESERT_PATCH.y - pose.y, f.s - (s0 + kAt(f.s) * 2), f.ry, 0, 0, new THREE.Matrix4());
    m.multiply(new THREE.Matrix4().makeScale(f.r * f.sx, 1, f.r));
    out.patches.push({ m, tone: f.tone });
  }
  const list = c.lap === 0 ? highwayIn(s0, s1) : [];
  for (const p of list) {
    const pose = at(kAt(p.s));
    if (!p.ground && (pose as Pose & { gap?: boolean }).gap) continue;
    // Mesa Cut: the chase cam rides above the 9.7 m roof (as Night City's tunnel on phone), so the roof node is not baked
    if (p.name === "tunnel_40") { put(p, parts, (o) => !inNode(o, "tunnel_roof")); continue; }
    put(p, p.detail ? detail : parts);
  }
  if (c.grid && bakePieceBent(parts, "start_grid_paint_40", chunkFrame(at, Math.floor(seg / 2), seg), true, 0, 0.05, 0, ox, oz)) out.placed.push("start_grid_paint_40");
  for (const k of c.kick) if (bakePieceBent(parts, "ramp_lip_chevron_24", chunkFrame(at, k, seg), true, 0, 0.05, 0, ox, oz)) out.placed.push("ramp_lip_chevron_24");
  if (c.finishK >= 0 && bakePiece(parts, "finish_gantry_24", placeMatrix(at(c.finishK), 0, 0.05, 0, 0, ox, oz, m4))) out.placed.push("finish_gantry_24");
  const core = new Map<THREE.Material, number>();
  for (const [mat, l] of parts) core.set(mat, l.reduce((n, g) => n + g.getAttribute("position").count, 0));
  for (const [mat, l] of detail) {
    const target = parts.get(mat) ?? [];
    if (!parts.has(mat)) core.set(mat, 0);
    target.push(...l);
    parts.set(mat, target);
  }
  for (const mesh of flushParts(parts, group)) mesh.userData.core = core.get(mesh.material as THREE.Material) ?? mesh.geometry.getAttribute("position").count;
  if (!logged.has(index) && c.lap === 0) {
    logged.add(index);
    const row = (highwayLog[c.zone] ??= {});
    for (const n of out.placed) row[n] = (row[n] ?? 0) + 1;
  }
  return out;
}

/**
 * Far backdrop: 4 mesa silhouettes (merged, 1 draw) and 6 turbine masts (merged) + 6 rotor meshes sharing one geometry,
 * spun around their hub in world.ts. at(s) = the track pose at course s (built once at race start, absolute world coords).
 */
export function highwayFarGroup(at: (s: number) => Pose | null): { group: THREE.Group; rotors: THREE.Object3D[] } | null {
  if (!getPiece("desert_mesa_backdrop") || !getPiece("wind_turbine_far")) return null;
  const group = new THREE.Group();
  group.name = "highway_far";
  const parts: Parts = new Map();
  const m4 = new THREE.Matrix4();
  for (const [s, lat, ry] of HIGHWAY_FAR.mesas) {
    const p = at(s);
    if (p) bakePiece(parts, "desert_mesa_backdrop", placeMatrix(p, lat, -p.y - 0.5, 0, ry, 0, 0, m4));
  }
  const hubs: THREE.Matrix4[] = [];
  for (const [s, lat] of HIGHWAY_FAR.turbines) {
    const p = at(s);
    if (!p) continue;
    const m = placeMatrix(p, lat, -p.y, 0, 0.4, 0, 0, new THREE.Matrix4());
    bakePiece(parts, "wind_turbine_far", m, (o) => !inNode(o, "rotor"));
    hubs.push(m);
  }
  flushParts(parts, group);
  const rotors: THREE.Object3D[] = [];
  const rotorParts: Parts = new Map();
  bakePiece(rotorParts, "wind_turbine_far", new THREE.Matrix4().makeTranslation(0, -54, 0), (o) => inNode(o, "rotor"));
  const tmp = new THREE.Group();
  flushParts(rotorParts, tmp);
  const proto = tmp.children[0] as THREE.Mesh | undefined;
  if (proto) {
    hubs.forEach((m, i) => {
      const hub = new THREE.Group();
      hub.matrixAutoUpdate = false;
      hub.matrix.copy(m).multiply(new THREE.Matrix4().makeTranslation(0, 54, 0));
      const r = new THREE.Mesh(proto.geometry, proto.material);
      r.rotation.z = i * 0.7;
      hub.add(r);
      group.add(hub);
      rotors.push(r);
    });
  }
  return { group, rotors };
}
