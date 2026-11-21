// v0.2 final: Night City stage scenery (Art's assets_v02/env/city + road_kit). Visual only; no sim changes.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COURSE_ORIGIN, courseFor, sectionAt } from "./course";
import { cityPlacements } from "./citycourse";

type Inline = Record<string, string> | undefined;
const inl = () => (window as unknown as { __NF_GLB?: Inline }).__NF_GLB;
const BASE = () => `${import.meta.env.BASE_URL}assets/v02/`;
const PIECES: [string, string][] = [
  ["city", "bldg_base_12x12"], ["city", "bldg_base_24x12"], ["city", "bldg_base_24x24"],
  ["city", "bldg_mid_12x12"], ["city", "bldg_mid_24x12"], ["city", "bldg_mid_24x24"],
  ["city", "bldg_top_12x12"], ["city", "bldg_top_24x12"], ["city", "bldg_top_24x24"],
  ["city", "sidewalk_12x40"], ["city", "overpass_60x12"], ["city", "billboard_pole_12x6"], ["city", "water_barrier_2m"], ["city", "traffic_cone"],
  ["kit", "sign_fork"], ["kit", "barrier_jersey_4m"], ["city", "streetlight_city_twin_8m"], ["city", "streetlight_city_6m"],
  ["city", "barricade_3m"], ["city", "tunnel_40"], ["city", "tunnel_portal"], ["city", "ramp_kicker_1m"],
  ["city", "facade_fins_12"], ["city", "facade_balcony_12"], ["city", "facade_ac_12"],
  ["city", "facade_ledge_12"], ["city", "facade_signbox_12"], ["city", "facade_inset_12"],
  ["city", "bollard"], ["city", "vending_box"], ["city", "trash_bin"],
  ["city", "utility_cabinet"], ["city", "cable_run_12"], ["city", "hydrant"],
  ["city", "billboard_roof_12x6"], ["city", "billboard_wall_8x4"],
  ["city", "neon_arrow"], ["city", "neon_ring"], ["city", "neon_bar"], ["city", "neon_cup"], ["city", "neon_bolt"], ["city", "neon_bowl"],
  // Week I shared drop (art/nightfall-shared-20261120): citycourse already places these ids
  ["city", "finish_gantry_24"], ["city", "tunnel_light_strip_4m"], ["city", "work_light_tower"],
  ["kit", "start_grid_paint_40"], ["kit", "ramp_lip_chevron_24"],
];
const lib: Record<string, THREE.Object3D> = {};
const mats = new Map<string, THREE.Material>();
let loaded = 0;
export const cityReady = () => loaded >= PIECES.length;
export const cityLoaded = () => loaded;

const ROAD_PIECES: [string, string][] = [
  ["kit", "road_straight_40"], ["kit", "lanepaint_straight_40"],
];
let roadLoaded = 0;
export const roadKitReady = () => roadLoaded >= ROAD_PIECES.length && !!(lib.road_straight_40 && lib.lanepaint_straight_40);

/** Piece ids the city loader asks for. roof_clutter_12 is not in this list. */
export const cityPieceNames = () => PIECES.map(([, name]) => name);
export const roadPieceNames = () => ROAD_PIECES.map(([, name]) => name);

/**
 * A rigid 40 m tile gaps on an authored bend and misses a ramp.
 * Heading change above 4° or more than 0.35 m of relief keeps the ribbon.
 * A gap in the chunk never takes a tile. Non-authored stages still take tiles.
 */
export const ROAD_TILE_BEND = (4 * Math.PI) / 180;
export const ROAD_TILE_RELIEF = 0.35;
export function roadTilesFit(authored: boolean, bendRad: number, relief: number, gap = false) {
  if (gap) return false;
  if (!authored) return true;
  return bendRad <= ROAD_TILE_BEND && relief <= ROAD_TILE_RELIEF;
}

/** atlas A channel = roughness (KIT_README / CITY_README shader hook) */
export function roughHook(m: THREE.MeshStandardMaterial) {
  if (!m.map || m.userData.rough) return;
  m.userData.rough = true;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = texture2D( map, vMapUv ).a;");
  };
  m.needsUpdate = true;
}

export function loadCity() {
  loadPieces(PIECES, () => { loaded++; });
}

/** Road tiles for every stage. Call once at world init. */
export function loadRoadKit() {
  loadPieces(ROAD_PIECES, () => { roadLoaded++; });
}

export function getPiece(name: string): THREE.Object3D | undefined {
  return lib[name];
}

export function loadPieces(list: [string, string][], onDone: () => void) {
  const mgr = new THREE.LoadingManager();
  mgr.setURLModifier((u) => {
    const f = u.split("/").pop() ?? "";
    const d = inl()?.[f];
    if (d) return d;
    // coast + shared kit GLBs point at ../road_kit/road_kit_atlas.png; the atlas ships as kit/
    if (f === "road_kit_atlas.png" && u.includes("/road_kit/")) return `${BASE()}kit/road_kit_atlas.png`;
    return u;
  });
  for (const [dir, name] of list) {
    if (lib[name]) { onDone(); continue; }
    const d = inl()?.[`${dir}_${name}`];
    new GLTFLoader(mgr).load(d ?? `${BASE()}${dir}/${name}.glb`, (g) => {
      // strip hidden collider nodes (UCX_<piece>_NN): never rendered or merged
      const ucx: THREE.Object3D[] = [];
      g.scene.traverse((o) => { if (/^UCX_/i.test(o.name)) ucx.push(o); });
      for (const o of ucx) o.parent?.remove(o);
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        const shared = mats.get(mat.name) ?? mat;
        if (!mats.has(mat.name)) {
          mats.set(mat.name, mat);
          roughHook(mat);
        }
        m.material = shared;
      });
      lib[name] = g.scene;
      onDone();
    }, undefined, () => { onDone(); });
  }
}

export type Pose = { x: number; y: number; z: number; rx: number; rz: number; tx: number; tz: number };
const yaw = (p: Pose) => Math.atan2(p.tx, p.tz);
const tmp = new THREE.Matrix4();

// ---- Week I helpers used by coast.ts (Coast Road scenery, not wired into world.ts yet) ----
export type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
export function inNode(o: THREE.Object3D, name: string) {
  for (let c: THREE.Object3D | null = o; c; c = c.parent) if (c.name === name) return true;
  return false;
}
/** chunk-local placement matrix: road-local (lx left, ly up, lz forward) from pose p, yaw ry on top of the road yaw */
export function placeMatrix(p: Pose, lx: number, ly: number, lz: number, ry: number, ox: number, oz: number, out = new THREE.Matrix4()) {
  const q = new THREE.Object3D();
  q.position.set(p.x - p.rx * lx - ox, p.y + ly, p.z - p.rz * lx - oz);
  q.rotation.set(0, yaw(p) + ry, 0);
  q.translateZ(lz);
  q.updateMatrix();
  return out.copy(q.matrix);
}
export function bakePiece(parts: Parts, name: string, m4: THREE.Matrix4, keep?: (o: THREE.Object3D) => boolean) {
  const src = lib[name];
  if (!src) return false;
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || o.name === "status_lamp") return;
    if (keep && !keep(o)) return;
    const g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const g = new THREE.BufferGeometry();
    for (const a of ["position", "normal", "uv"]) if (g0.getAttribute(a)) g.setAttribute(a, g0.getAttribute(a));
    if (!g.getAttribute("uv") || !g.getAttribute("normal")) return;
    g.applyMatrix4(tmp.multiplyMatrices(m4, m.matrixWorld));
    const l = parts.get(m.material as THREE.Material) ?? [];
    l.push(g);
    parts.set(m.material as THREE.Material, l);
  });
  return true;
}
export function flushParts(parts: Parts, group: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  for (const [mat, list] of parts) {
    const g = mergeGeometries(list, false);
    for (const x of list) x.dispose();
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    group.add(mesh);
    out.push(mesh);
  }
  return out;
}

/** Set pieces the procedural fill does not already scatter. Tunnels stay unmerged so the roof can hide. */
const AUTHORED_IDS = new Set([
  "overpass_60x12", "tunnel_40", "tunnel_portal", "barricade_3m", "ramp_kicker_1m", "sign_fork",
  "barrier_jersey_4m", "billboard_pole_12x6", "billboard_roof_12x6", "billboard_wall_8x4",
  // Week I shared drop: merged per material into the chunk like the rest (the ~60 NC-6 tunnel strips add 0 draws this way)
  "finish_gantry_24", "tunnel_light_strip_4m", "work_light_tower", "start_grid_paint_40", "ramp_lip_chevron_24",
]);

function chunkZone(index: number, k: number, seg: number) {
  const course = courseFor("city");
  if (!course) return "";
  return sectionAt(course, index * seg * 2 + k * 2 - COURSE_ORIGIN)?.zone ?? "";
}

/** Authored Night City turns the old every-4th overpass and every-6th gate off. */
export function cityChunkRules(index: number, authored: boolean) {
  return { overpass: !authored && index % 4 === 2, gate: !authored && index % 6 === 3 };
}

/** one chunk of city: all pieces baked into one merged mesh per material (+ separate gate lamps) */
export function buildCityChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, half: number, ox: number, oz: number, rnd: (n: number) => number, authored = false) {
  for (const c of [...group.children]) {
    group.remove(c);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry !== (lib.sign_fork?.getObjectByName("status_lamp") as THREE.Mesh | undefined)?.geometry) m.geometry.dispose();
      if (m.material instanceof THREE.MeshBasicMaterial) m.material.dispose();
    });
  }
  if (!cityReady()) return null;
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (name: string, p: Pose, lx: number, ly: number, lz: number, ry: number) => {
    const src = lib[name];
    if (!src) return;
    const q = new THREE.Object3D();
    const yw = yaw(p);
    // local +X is the driver's LEFT when facing +Z; road right vector r points to x<0 in that frame
    q.position.set(p.x - p.rx * lx - ox, p.y + ly, p.z - p.rz * lx - oz);
    q.rotation.set(0, yw + ry, 0);
    q.translateZ(lz);
    q.updateMatrixWorld(true);
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || o.name === "status_lamp") return;
      const g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      const g = new THREE.BufferGeometry();
      for (const a of ["position", "normal", "uv"]) if (g0.getAttribute(a)) g.setAttribute(a, g0.getAttribute(a));
      if (!g.getAttribute("uv") || !g.getAttribute("normal")) return;
      g.applyMatrix4(tmp.multiplyMatrices(q.matrixWorld, m.matrixWorld));
      const l = parts.get(m.material as THREE.Material) ?? [];
      l.push(g);
      parts.set(m.material as THREE.Material, l);
    });
  };
  const mid = at(Math.floor(seg / 2));
  // sidewalks both sides
  for (const side of [1, -1]) add("sidewalk_12x40", mid, side * (half + 6.35), 0, 0, 0);
  // building rows on the 12 m grid
  for (const side of [1, -1]) {
    let z = -20;
    let n = 0;
    while (z < 20) {
      const r = rnd(index * 31 + n * 7 + (side > 0 ? 3 : 0));
      const front = r < 0.5 ? 12 : 24;
      if (z + front > 20.01) break;
      const depth = front === 24 && r < 0.8 ? 24 : 12;
      const key = `${front}x${depth}`;
      const lx = side * (half + 12.35 + depth / 2);
      const p = at(Math.min(seg, Math.max(0, Math.round(((z + front / 2 + 20) / 40) * seg))));
      const ry = side > 0 ? Math.PI : 0;
      const floors = 1 + Math.floor(rnd(index * 13 + n * 5 + side) * 4);
      const zone = authored ? chunkZone(index, Math.min(seg, Math.max(0, Math.round(((z + front / 2 + 20) / 40) * seg))), seg) : "";
      // Authored zones pick the trim. The bay offsets are the art-pass attach rules.
      let trim: string | null = null;
      if (zone === "glass" && n % 2 === 0) trim = "facade_fins_12";
      else if (zone === "market") trim = rnd(index * 19 + n * 5 + side) < 0.5 ? "facade_balcony_12" : "facade_ac_12";
      const frontLx = side * (half + 12.35);
      const bays = front === 12 ? [0] : [-6, 6];
      add(`bldg_base_${key}`, p, lx, 0.22, 0, ry);
      for (let f = 1; f < floors; f++) {
        add(`bldg_mid_${key}`, p, lx, 0.22 + 12 * f, 0, ry);
        if (!trim) continue;
        for (const bz of bays) {
          add(trim, p, frontLx, 0.22 + 12 * f, bz, ry);
          if (trim === "facade_balcony_12") continue;
          add("facade_ledge_12", p, frontLx, 0.22 + 12 * f, bz, ry);
          if (trim === "facade_fins_12" && rnd(index * 29 + n * 3 + f + side) < 0.45) {
            add("facade_inset_12", p, frontLx, 0.22 + 12 * f, bz, ry);
          }
        }
      }
      add(`bldg_top_${key}`, p, lx, 0.22 + 12 * floors, 0, ry);
      if (trim && trim !== "facade_balcony_12") add("facade_signbox_12", p, frontLx, 0.22, bays[0], ry);
      if (rnd(index * 17 + n * 3 + side) < 0.6) {
        const ns = ["neon_arrow", "neon_ring", "neon_bar", "neon_cup", "neon_bolt", "neon_bowl"][Math.floor(rnd(index * 23 + n) * 6)];
        add(ns, p, side * (half + 12.3), 6 + rnd(index + n * 11) * 10, 0, ry);
      }
      z += front;
      n++;
    }
  }
  // streetlights every 20 m, alternating sides
  for (let k = 0; k < 2; k++) {
    const p = at(Math.floor((k * seg) / 2));
    add("streetlight_city_twin_8m", p, k % 2 ? half + 1.2 : -(half + 1.2), 0.22, 0, k % 2 ? Math.PI : 0);
    add("streetlight_city_6m", at(Math.floor(((k + 0.5) * seg) / 2)), k % 2 ? -(half + 10) : half + 10, 0.22, 0, k % 2 ? 0 : Math.PI);
  }
  if (authored && chunkZone(index, Math.floor(seg / 2), seg) !== "tunnel") {
    for (let k = 0; k < 4; k++) {
      const p = at(Math.floor(((k + 0.5) / 4) * seg));
      add("bollard", p, half + 1.6, 0.22, 0, 0);
      add("bollard", p, -(half + 1.6), 0.22, 0, Math.PI);
    }
    if (rnd(index * 11 + 3) < 0.5) {
      add("vending_box", mid, half + 10.4, 0.22, -8, Math.PI);
      add("vending_box", mid, -(half + 10.4), 0.22, 8, 0);
    }
    if (rnd(index * 13 + 5) < 0.6) {
      add("trash_bin", mid, half + 3.8, 0.22, 6, 0);
      add("trash_bin", mid, -(half + 3.8), 0.22, -6, 0);
    }
    if (index % 5 === 1) add("utility_cabinet", mid, half + 10.8, 0.22, 12, Math.PI);
    if (index % 6 === 2) add("cable_run_12", mid, half + 9.5, 0.22, 0, Math.PI);
    if (index % 4 === 1) add("hydrant", mid, -(half + 2.4), 0.22, 4, 0);
  }
  // water barriers along the right kerb, sometimes a cone line
  if (rnd(index * 5 + 1) < 0.5) for (let k = 0; k < 6; k++) add("water_barrier_2m", at(Math.floor((k / 6) * seg)), -(half - 0.6), 0, 0, 0);
  // M1: raised ramp deck (former void) reads as a deck: barriers on both kerbs at deck height
  // wherever the road is elevated, so the ramp and the car on it are visible against the city
  for (let k = 0; k < seg; k += 2) {
    const p = at(k);
    if (p.y < 0.6) continue;
    for (const side of [1, -1]) add("water_barrier_2m", p, side * (half - 0.6), 0, 0, 0);
  }
  const rules = cityChunkRules(index, authored);
  if (rules.overpass) add("overpass_60x12", mid, 0, 0, 0, 0);
  else if (!authored && rnd(index * 9 + 2) < 0.3) add("billboard_pole_12x6", mid, (rnd(index) < 0.5 ? 1 : -1) * (half + 4), 0, 0, Math.PI);
  let lamp: THREE.Mesh | null = null;
  if (rules.gate) {
    // boost gate: sign_fork on both kerbs, status_lamp tinted green/amber/red in code
    for (const side of [1, -1]) add("sign_fork", mid, side * (half - 1.4), 0, 0, Math.PI);
    // H2c OUT: ramp_launch / ramp_kicker used to sit on the sidewalk, outside the
    // driveable road, and read as a jump the sim would not drive. Dropped. The
    // sidewalk stays flat. No new ramp art.
    const src = lib.sign_fork?.getObjectByName("status_lamp") as THREE.Mesh | undefined;
    if (src) {
      const gate = new THREE.Group();
      for (const side of [1, -1]) {
        const o = src.clone(true) as THREE.Mesh;
        o.traverse((c) => {
          const cm = c as THREE.Mesh;
          if (cm.isMesh) cm.material = new THREE.MeshBasicMaterial({ color: 0x33ff66 });
        });
        const q = new THREE.Object3D();
        q.position.set(mid.x - mid.rx * side * (half - 1.4) - ox, mid.y, mid.z - mid.rz * side * (half - 1.4) - oz);
        q.rotation.set(0, yaw(mid) + Math.PI, 0);
        q.updateMatrixWorld(true);
        lib.sign_fork.updateMatrixWorld(true);
        o.matrixAutoUpdate = false;
        o.matrix.multiplyMatrices(q.matrixWorld, src.matrixWorld);
        gate.add(o);
        if (!lamp) lamp = o;
      }
      group.add(gate);
    }
  }
  if (authored) {
    const chunkS = index * seg * 2;
    for (const piece of cityPlacements()) {
      if (!AUTHORED_IDS.has(piece.id)) continue;
      const abs = COURSE_ORIGIN + piece.s;
      if (abs < chunkS || abs >= chunkS + seg * 2) continue;
      const k = Math.round((abs - chunkS) / 2);
      const p = at(Math.max(0, Math.min(seg, k)));
      if (piece.id === "tunnel_40" || piece.id === "tunnel_portal") {
        const src = lib[piece.id];
        if (!src) continue;
        const clone = src.clone(true);
        concealTunnelRoof(clone, 13.5);
        const q = new THREE.Group();
        q.position.set(p.x - ox, p.y, p.z - oz);
        q.rotation.set(0, yaw(p), 0);
        q.add(clone);
        group.add(q);
      } else if (piece.id === "tunnel_light_strip_4m") {
        // shared drop INTEGRATION.md: pivot on the wall plane, lamp faces +X, y 6-7, yaw 180 on the opposite wall
        const lx = -Math.sign(piece.lat) * 13.15;
        add(piece.id, p, lx, 6.5, 0, lx > 0 ? Math.PI : 0);
      } else {
        add(piece.id, p, -piece.lat, 0, 0, 0);
      }
    }
  }
  for (const [mat, list] of parts) {
    const g = mergeGeometries(list, false);
    if (g) group.add(new THREE.Mesh(g, mat));
  }
  return lamp;
}

/** Chase cam sits above the 9.7 m roof, so the roof node stays hidden. Camera itself does not move. */
export const TUNNEL_ROOF_Y = 9.7;

export function concealTunnelRoof(root: THREE.Object3D, cameraUp: number) {
  if (cameraUp <= TUNNEL_ROOF_Y) return;
  root.traverse((o) => {
    if (o.name === "tunnel_roof") o.visible = false;
  });
}
