// v0.2 final: Night City stage scenery (Art's assets_v02/env/city + road_kit). Visual only; no sim changes.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Inline = Record<string, string> | undefined;
const inl = () => (window as unknown as { __NF_GLB?: Inline }).__NF_GLB;
const BASE = () => `${import.meta.env.BASE_URL}assets/v02/`;
const PIECES: [string, string][] = [
  ["city", "bldg_base_12x12"], ["city", "bldg_base_24x12"], ["city", "bldg_base_24x24"],
  ["city", "bldg_mid_12x12"], ["city", "bldg_mid_24x12"], ["city", "bldg_mid_24x24"],
  ["city", "bldg_top_12x12"], ["city", "bldg_top_24x12"], ["city", "bldg_top_24x24"],
  ["city", "sidewalk_12x40"], ["city", "overpass_60x12"], ["city", "billboard_pole_12x6"], ["city", "water_barrier_2m"], ["city", "traffic_cone"],
  ["kit", "sign_fork"], ["city", "streetlight_city_twin_8m"], ["city", "streetlight_city_6m"], ["city", "ramp_launch_2p5m"], ["city", "ramp_kicker_1m"],
  ["city", "neon_arrow"], ["city", "neon_ring"], ["city", "neon_bar"], ["city", "neon_cup"], ["city", "neon_bolt"], ["city", "neon_bowl"],
];
const lib: Record<string, THREE.Object3D> = {};
const mats = new Map<string, THREE.Material>();
let loaded = 0;
export const cityReady = () => loaded >= PIECES.length;
export const cityLoaded = () => loaded;

/** atlas A channel = roughness (KIT_README / CITY_README shader hook) */
function roughHook(m: THREE.MeshStandardMaterial) {
  if (!m.map || m.userData.rough) return;
  m.userData.rough = true;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = texture2D( map, vMapUv ).a;");
  };
  m.needsUpdate = true;
}

export function loadCity() {
  const mgr = new THREE.LoadingManager();
  mgr.setURLModifier((u) => {
    const f = u.split("/").pop() ?? "";
    const d = inl()?.[f];
    return d ?? u;
  });
  for (const [dir, name] of PIECES) {
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
      loaded++;
    }, undefined, () => { loaded++; });
  }
}

type Pose = { x: number; y: number; z: number; rx: number; rz: number; tx: number; tz: number };
const yaw = (p: Pose) => Math.atan2(p.tx, p.tz);
const tmp = new THREE.Matrix4();

/** one chunk of city: all pieces baked into one merged mesh per material (+ separate gate lamps) */
export function buildCityChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, half: number, ox: number, oz: number, rnd: (n: number) => number) {
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
      add(`bldg_base_${key}`, p, lx, 0.22, 0, ry);
      for (let f = 1; f < floors; f++) add(`bldg_mid_${key}`, p, lx, 0.22 + 12 * f, 0, ry + (f % 2 ? 0 : 0));
      add(`bldg_top_${key}`, p, lx, 0.22 + 12 * floors, 0, ry);
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
  // water barriers along the right kerb, sometimes a cone line
  if (rnd(index * 5 + 1) < 0.5) for (let k = 0; k < 6; k++) add("water_barrier_2m", at(Math.floor((k / 6) * seg)), -(half - 0.6), 0, 0, 0);
  if (index % 4 === 2) add("overpass_60x12", mid, 0, 0, 0, 0);
  else if (rnd(index * 9 + 2) < 0.3) add("billboard_pole_12x6", mid, (rnd(index) < 0.5 ? 1 : -1) * (half + 4), 0, 0, Math.PI);
  let lamp: THREE.Mesh | null = null;
  if (index % 6 === 3) {
    // boost gate: sign_fork on both kerbs, status_lamp tinted green/amber/red in code
    for (const side of [1, -1]) add("sign_fork", mid, side * (half - 1.4), 0, 0, Math.PI);
    // set dressing on the sidewalk beside the gate (no jump physics)
    add("ramp_launch_2p5m", at(2), half + 6.3, 0.22, 0, 0);
    add("ramp_kicker_1m", at(seg - 3), -(half + 6.3), 0.22, 0, 0);
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
  for (const [mat, list] of parts) {
    const g = mergeGeometries(list, false);
    if (g) group.add(new THREE.Mesh(g, mat));
  }
  return lamp;
}
