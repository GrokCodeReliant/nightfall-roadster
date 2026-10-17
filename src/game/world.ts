import * as THREE from "three";
import { loadCity, buildCityChunk, cityReady } from "./city";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Kind, PickupKind, Sim } from "./sim";
import { ensureTrack, poseAt, sampleAt, STEP, yawFromDir, type Piece } from "./road";

type Wheel = { pivot: THREE.Group; spin: THREE.Group };
type CarView = {
  root: THREE.Group;
  tilt: THREE.Group;
  body: THREE.MeshPhysicalMaterial;
  flames: THREE.Mesh[];
  wheels: Wheel[];
  shadow: THREE.Mesh;
  steer: number;
  spin: number;
  kind: Kind;
  turret: THREE.Group | null;
  chassis: THREE.Group;
  parts: Partial<Record<Kind, THREE.Group>>;
  mats: THREE.Material[];
  fade: number;
  glb?: THREE.Object3D;
  procWheels?: Wheel[];
  inst?: Partial<Record<Kind, EnemyInst>>;
  kindSrc?: string;
  active?: EnemyInst | null;
};

type EnemyInst = { root: THREE.Object3D; wheels: Wheel[]; rotors: THREE.Object3D[]; turret: THREE.Object3D | null; rearTurret: boolean };

const KIND_COLOR: Record<Kind, number> = {
  hero: 0xc4161c,
  rammer: 0x4a3226,
  gunner: 0x2a303a,
  mine: 0x3a3f2a,
  spiker: 0x5a4a1e,
  drone: 0x22262e,
  boss: 0x1c1f24,
};
export const CAM_BACK = 19;
export const CAM_UP = 13.5;
const CAM_LOOK_BACK = 1.5;

const KIND_SCALE: Partial<Record<Kind, [number, number, number]>> = { boss: [1.55, 1.3, 1.9] };

const PICKUP_COLOR: Record<PickupKind, number> = {
  repair: 0x3ad06a,
  armor: 0xb8c6d4,
  gun: 0xe0b060,
  rockets: 0xff7a2a,
  minepack: 0xe23b2f,
  oil: 0x7a5cff,
  nitro: 0x38d6ff,
  shield: 0x4a8cff,
  magnet: 0xff4ad0,
};

function enemyParts(tilt: THREE.Group) {
  const parts: Partial<Record<Kind, THREE.Group>> = {};
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.6, roughness: 0.45 });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
  // Mine Layer: boxy van body with a rear chute
  const van = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 2.6), new THREE.MeshStandardMaterial({ color: 0x3a3f2a, roughness: 0.7, metalness: 0.2 }));
  box.position.set(0, 1.05, -0.5);
  const chute = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.5), dark);
  chute.position.set(0, 0.55, -2.15);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 2.62), new THREE.MeshBasicMaterial({ color: 0xc6a36a }));
  stripe.position.set(0, 1.2, -0.5);
  van.add(box, chute, stripe);
  parts.mine = van;
  // Spiker: flatbed rails + side blades
  const spk = new THREE.Group();
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 2.2), dark);
    rail.position.set(side * 0.95, 0.8, -0.9);
    spk.add(rail);
    for (let k = 0; k < 4; k++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.75, 6), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.95, roughness: 0.2 }));
      blade.rotation.z = side * -Math.PI / 2;
      blade.position.set(side * 1.3, 0.42, 1.0 - k * 0.8);
      spk.add(blade);
    }
  }
  parts.spiker = spk;
  // Drone: body, 4 rotors, red eye (no chassis)
  const drone = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.7, roughness: 0.3 }));
  core.scale.set(1.2, 0.55, 1.2);
  drone.add(core);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 1.0), dark);
    arm.position.set(x * 0.45, 0, z * 0.45);
    arm.rotation.y = Math.atan2(x, z);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 14), new THREE.MeshBasicMaterial({ color: 0x9aa4b0, transparent: true, opacity: 0.35 }));
    rotor.position.set(x * 0.8, 0.08, z * 0.8);
    rotor.userData.rotor = true;
    drone.add(arm, rotor);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), red);
  eye.position.set(0, -0.12, 0.5);
  drone.add(eye);
  drone.position.y = 0.6;
  parts.drone = drone;
  // Boss: armored cargo box + rear turret + glowing rear weak point
  const boss = new THREE.Group();
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 3.0), new THREE.MeshStandardMaterial({ color: 0x24282e, metalness: 0.75, roughness: 0.35 }));
  cargo.position.set(0, 1.15, -0.7);
  const weak = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.06), new THREE.MeshBasicMaterial({ color: 0xffa43a }));
  weak.position.set(0, 1.05, -2.23);
  const tur = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.22, 10), dark);
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8), dark);
  b1.rotation.x = Math.PI / 2;
  b1.position.set(0.12, 0.08, -0.5);
  const b2 = b1.clone();
  b2.position.x = -0.12;
  tur.add(base, b1, b2);
  tur.position.set(0, 1.82, -1.4);
  boss.add(cargo, weak, tur);
  parts.boss = boss;
  for (const g of Object.values(parts)) {
    g!.visible = false;
    tilt.add(g!);
  }
  return parts;
}

export type World = {
  sync: (sim: Sim, dt: number, attract: boolean) => void;
  resize: (w: number, h: number, dpr: number) => void;
  dispose: () => void;
  debugFade: () => number[];
  carInfo: () => CarInfo;
  setCar: (id: CarId) => void;
  setStage: (id: StageId) => void;
  stageInfo: () => { stage: string; cityChunks: number; gates: number };
  startRollout: (sim: Sim) => boolean;
  skipRollout: () => void;
  rolloutState: () => { thrust: number; bayY: number; active: boolean; t: number; robots: number; idle: boolean };
  drawInfo: () => { draws: number; tris: number };
  enemyInfo: () => Record<string, unknown>;
  project: (sim: Sim, id: number) => { x: number; y: number; on: boolean; w: number; h: number };
};

const reduceMotion =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function hullGeometry() {
  const rings: { z: number; hw: number; y0: number; y1: number }[] = [
    { z: 2.22, hw: 0.1, y0: 0.34, y1: 0.42 },
    { z: 1.82, hw: 0.62, y0: 0.22, y1: 0.5 },
    { z: 1.25, hw: 0.9, y0: 0.16, y1: 0.58 },
    { z: 0.62, hw: 0.98, y0: 0.15, y1: 0.66 },
    { z: 0.12, hw: 0.99, y0: 0.15, y1: 0.76 },
    { z: -0.22, hw: 0.94, y0: 0.16, y1: 0.98 },
    { z: -0.62, hw: 0.9, y0: 0.16, y1: 0.72 },
    { z: -1.15, hw: 0.99, y0: 0.16, y1: 0.64 },
    { z: -1.7, hw: 0.92, y0: 0.22, y1: 0.58 },
    { z: -2.16, hw: 0.7, y0: 0.3, y1: 0.5 },
  ];
  const ringPts = rings.map((r) => {
    const bot = r.hw * 0.78;
    const mid = r.hw;
    const top = r.hw * 0.62;
    const yb = r.y0;
    const yt = r.y1;
    const ym = yb + (yt - yb) * 0.42;
    const ys = yb + (yt - yb) * 0.8;
    return [
      [0, yb, r.z],
      [-bot, yb + 0.04, r.z],
      [-mid, ym, r.z],
      [-top, ys, r.z],
      [0, yt, r.z],
      [top, ys, r.z],
      [mid, ym, r.z],
      [bot, yb + 0.04, r.z],
    ];
  });
  const cols = 8;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of ringPts) {
    for (const p of ring) positions.push(p[0], p[1], p[2]);
  }
  const ringsN = ringPts.length;
  for (let i = 0; i < ringsN - 1; i++) {
    for (let c = 0; c < cols; c++) {
      const c2 = (c + 1) % cols;
      const a = i * cols + c;
      const b = i * cols + c2;
      const d = (i + 1) * cols + c;
      const e = (i + 1) * cols + c2;
      indices.push(a, d, b, b, d, e);
    }
  }
  const nose = 0;
  for (let c = 1; c < cols - 1; c++) indices.push(nose, c, c + 1);
  const tail = (ringsN - 1) * cols;
  for (let c = 1; c < cols - 1; c++) indices.push(tail, tail + c + 1, tail + c);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeWheel(rimColor: number): Wheel {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.26, 18),
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.72, metalness: 0.05 }),
  );
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.28, 10),
    new THREE.MeshStandardMaterial({ color: rimColor, metalness: 0.9, roughness: 0.28 }),
  );
  rim.rotation.z = Math.PI / 2;
  spin.add(tire, rim);
  pivot.add(spin);
  return { pivot, spin };
}

function buildCar(hero: boolean, hull: THREE.BufferGeometry): CarView {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const body = new THREE.MeshPhysicalMaterial({
    color: hero ? 0xc4161c : 0x2a303a,
    metalness: hero ? 0.78 : 0.55,
    roughness: hero ? 0.28 : 0.46,
    clearcoat: hero ? 0.85 : 0.25,
    clearcoatRoughness: 0.18,
    emissive: new THREE.Color(hero ? 0x2a0608 : 0x050505),
    emissiveIntensity: 0.35,
  });
  const mesh = new THREE.Mesh(hull, body);
  mesh.castShadow = false;
  tilt.add(mesh);

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.28, 0.62),
    new THREE.MeshStandardMaterial({
      color: 0x10161c,
      metalness: 0.4,
      roughness: 0.08,
      transparent: true,
      opacity: 0.72,
    }),
  );
  glass.position.set(0, 0.86, 0.02);
  mesh.userData.proc = true;
  glass.userData.proc = true;
  glass.rotation.x = -0.62;
  tilt.add(glass);

  if (hero) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.04, 3.3),
      new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.4, metalness: 0.2 }),
    );
    stripe.position.set(0, 0.7, 0.35);
    stripe.userData.proc = true;
    tilt.add(stripe);
  }

  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.08, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xff2a22,
      emissive: 0xff1c14,
      emissiveIntensity: hero ? 1.4 : 0.8,
      roughness: 0.4,
    }),
  );
  tail.position.set(0, 0.48, -2.12);
  tail.userData.tail = true;
  tilt.add(tail);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff6e4,
    emissive: 0xfff1cc,
    emissiveIntensity: hero ? 2.2 : 1.1,
  });
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.06), lampMat);
    lamp.position.set(side * 0.48, 0.46, 2.18);
    lamp.userData.proc = true;
    tilt.add(lamp);
  }

  const copper = new THREE.MeshStandardMaterial({ color: 0xb5834a, metalness: 0.85, roughness: 0.32 });
  const flames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.26, 10), copper);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.42, 0.4, -2.18);
    pod.userData.proc = true;
    tilt.add(pod);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.85, 8),
      new THREE.MeshBasicMaterial({
        color: hero ? 0xffb15a : 0xff7a3a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.set(side * 0.42, 0.4, -2.55);
    flame.scale.set(0.2, 0.05, 0.2);
    tilt.add(flame);
    flames.push(flame);
  }

  const cock = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 14),
    new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 1 }),
  );
  cock.rotation.x = -Math.PI / 2;
  cock.position.set(0, 0.8, -0.42);
  cock.userData.proc = true;
  tilt.add(cock);
  const suit = new THREE.MeshStandardMaterial({ color: hero ? 0x1a120c : 0x101114, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 3, 8), suit);
  torso.position.set(0, 0.98, -0.46);
  torso.userData.driver = "torso";
  tilt.add(torso);
  const helm = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x0e0e10, metalness: 0.4, roughness: 0.35 }),
  );
  helm.position.set(0, 1.2, -0.4);
  helm.userData.driver = "helm";
  tilt.add(helm);

  const rim = hero ? 0xc6a36a : 0x8a9098;
  const wheels = [
    { x: -0.84, z: 1.28, front: true },
    { x: 0.84, z: 1.28, front: true },
    { x: -0.88, z: -1.38, front: false },
    { x: 0.88, z: -1.38, front: false },
  ].map((w) => {
    const wheel = makeWheel(rim);
    wheel.pivot.position.set(w.x, 0.36, w.z);
    wheel.pivot.userData.front = w.front;
    wheel.pivot.userData.proc = true;
    tilt.add(wheel.pivot);
    return wheel;
  });

  if (hero) {
    const L = new THREE.SpotLight(0xfff3d4, 7, 48, 0.48, 0.6, 1.5);
    L.position.set(-0.4, 0.55, 1.7);
    L.target.position.set(-0.4, 0.15, 14);
    tilt.add(L, L.target);
    L.userData.lamp = "lamp_L";
    const R = new THREE.SpotLight(0xfff3d4, 7, 48, 0.48, 0.6, 1.5);
    R.position.set(0.4, 0.55, 1.7);
    R.target.position.set(0.4, 0.15, 14);
    tilt.add(R, R.target);
    R.userData.lamp = "lamp_R";
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;

  let turret: THREE.Group | null = null;
  if (!hero) {
    turret = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.7, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.16, 10), gunMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.06, 0.4);
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xff3a2a }),
    );
    eye.position.set(0, 0.06, 0.2);
    turret.add(base, barrel, eye);
    turret.position.set(0, 1.12, -0.35);
    tilt.add(turret);
  }
  // everything built so far is the car chassis; drones hide it
  const chassis = new THREE.Group();
  for (const c of [...tilt.children]) chassis.add(c);
  tilt.add(chassis);
  const parts = hero ? {} : enemyParts(tilt);
  const mats: THREE.Material[] = [];
  if (!hero) {
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !mats.includes(m)) mats.push(m);
    });
  }
  return { root, tilt, body, flames, wheels, shadow, steer: 0, spin: 0, kind: hero ? "hero" : "rammer", turret, chassis, parts, mats, fade: 1 };
}

function signTexture(label: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#120c0c";
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = "#c6a36a";
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = "#f4efe6";
  g.font = "600 58px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Sign = { group: THREE.Group; board: THREE.Mesh; label: string; at: number };

function makeSign(): Sign {
  const group = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 2.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  board.position.y = 3.3;
  group.add(board);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1c22, metalness: 0.4, roughness: 0.6 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18), postMat);
    post.position.set(side * 3.6, 1.6, 0);
    group.add(post);
  }
  group.visible = false;
  return { group, board, label: "", at: -1 };
}

function hash(i: number) {
  const x = Math.sin(i * 127.1 + 3.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------- m5a: Roadster GLB (Art & Assets stand-in)
export type CarInfo = { source: "procedural" | "glb" | "loading"; car: string; lod: "phone" | "hero"; url: string; wheels: number; nodes: string[]; missing: string[]; error?: string; tris?: number };
const CAR_NODES = ["body", "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR", "thruster_L", "thruster_R", "lamp_L", "lamp_R", "taillight", "turret_mount", "driver_seat"];

/** Playable cars: same handling for all; only the GLB changes. file = assets_v02/car/<file>_<lod>.glb */
export const STAGES = [
  { id: "city", name: "Night City", ready: true, sky: 0x0a0814, fog: 0.0075 },
  { id: "classic", name: "Classic Night", ready: true, sky: 0x07080e, fog: 0.0085 },
  { id: "coast", name: "Coast Road", ready: false, sky: 0x2a1a24, fog: 0.006 },
  { id: "woods", name: "Pine Woods", ready: false, sky: 0x0c1410, fog: 0.012 },
  { id: "highway", name: "Open Highway", ready: false, sky: 0x1a140c, fog: 0.004 },
  { id: "port", name: "Industrial Port", ready: false, sky: 0x0c1014, fog: 0.008 },
  { id: "pass", name: "Mountain Pass", ready: false, sky: 0x10141c, fog: 0.008 },
] as const;
export type StageId = (typeof STAGES)[number]["id"];
export const CARS = [
  { id: "volt", name: "Volt Compact", file: "sedan_compact" },
  { id: "volt_r", name: "Volt Compact R", file: "sedan_compact_r" },
  { id: "roadster", name: "Roadster 2017", file: "roadster" },
  { id: "roadster2026", name: "Roadster 2026", file: "roadster2026" },
] as const;
export type CarId = (typeof CARS)[number]["id"];

function inlineGlb(key: string) {
  const inline = (window as unknown as { __NF_GLB?: Record<string, string> }).__NF_GLB;
  return inline?.[key];
}

function carUrl(car: CarId, lod: "phone" | "hero") {
  const file = CARS.find((c) => c.id === car)?.file ?? "roadster";
  const d = inlineGlb(`${file}_${lod}`) ?? inlineGlb(`${file}_phone`) ?? (file === "roadster" ? inlineGlb(lod) : undefined);
  if (d) return d;
  return `${import.meta.env.BASE_URL}assets/v02/car/${file}_${lod}.glb`;
}

function rigUrl(file: string) {
  return inlineGlb(file) ?? `${import.meta.env.BASE_URL}assets/v02/rig/${file}.glb`;
}

/**
 * Draw-call budget: bake node transforms and merge static meshes per material (one draw per material).
 * Animated/tinted/attach subtrees named by `keep` (wheels, doors, ramp, rotors, turret, blades...) and skinned
 * meshes stay separate. Attach empties are untouched.
 */
const KEEP_RE = /^(wheel_|cab_wheel_|trailer_wheel_|door_|trailer_door_|ramp|rotor_|turret_mount|blades_|chute_hatch|robot)/;
export function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const victims: THREE.Mesh[] = [];
  const kept = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (KEEP_RE.test(p.name)) return true;
    return false;
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh || kept(m) || Array.isArray(m.material)) return;
    const g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", g0.getAttribute("position"));
    if (g0.getAttribute("normal")) g.setAttribute("normal", g0.getAttribute("normal"));
    else return;
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const list = groups.get(m.material as THREE.Material) ?? [];
    list.push(g);
    groups.set(m.material as THREE.Material, list);
    victims.push(m);
  });
  if (victims.length < 2) return;
  for (const v of victims) v.parent?.remove(v);
  for (const [mat, list] of groups) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `merged_${mat.name || "mat"}`;
    root.add(mesh);
  }
}

/**
 * Swap the hero view's procedural hull for the GLB. Every attachment is found by node name
 * (wheel_*, thruster_*, lamp_*, taillight, turret_mount, driver_seat), so a re-export with the
 * same node names drops straight in. Returns the names that were missing.
 */
function applyCarGlb(view: CarView, model: THREE.Object3D): string[] {
  const missing: string[] = [];
  const node = (name: string) => {
    const n = model.getObjectByName(name);
    if (!n) missing.push(name);
    return n ?? null;
  };
  // paint: the GLB's "body" material becomes the existing hero paint (0xc4161c, clearcoat)
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat?.name === "body") m.material = view.body;
    else if (mat?.name === "taillight") mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.4);
    else if (mat?.name === "lamp") mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 2);
    m.castShadow = false;
  });
  // hide the procedural hull parts (keep flames, spotlights, tail bar and driver: they get re-parented)
  for (const c of view.chassis.children) if (c.userData.proc) c.visible = false;
  view.chassis.add(model);
  // wheels: pivot = node (steer yaw on the front pair), a spin group inserted between it and the mesh (spin about X)
  const wheels: Wheel[] = [];
  for (const name of ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"]) {
    const pivot = node(name);
    if (!pivot) continue;
    const spin = new THREE.Group();
    for (const ch of [...pivot.children]) spin.add(ch);
    pivot.add(spin);
    pivot.userData.front = name === "wheel_FL" || name === "wheel_FR";
    wheels.push({ pivot: pivot as THREE.Group, spin });
  }
  if (wheels.length === 4) view.wheels = wheels;
  // thruster flames point -Z out of thruster_L / thruster_R
  view.flames.forEach((flame, i) => {
    const n = node(i === 0 ? "thruster_L" : "thruster_R");
    if (!n) return;
    n.add(flame);
    flame.position.set(0, 0, -0.37);
  });
  // headlight spots ride on lamp_L / lamp_R
  for (const c of [...view.chassis.children]) {
    const key = c.userData.lamp as string | undefined;
    if (!key) continue;
    const n = node(key);
    if (!n) continue;
    const spot = c as THREE.SpotLight;
    n.add(spot, spot.target);
    spot.position.set(0, 0.03, 0.05);
    spot.target.position.set(0, -0.4, 12.3);
  }
  // the stand-in has a taillight node but no taillight geometry: hang the existing emissive bar on it
  const tl = node("taillight");
  const tail = view.chassis.children.find((c) => c.userData.tail);
  if (tl && tail) {
    tl.add(tail);
    tail.position.set(0, 0, 0.02);
  }
  // driver sits on driver_seat
  const seat = node("driver_seat");
  if (seat) {
    for (const c of [...view.chassis.children]) {
      if (c.userData.driver === "torso") {
        seat.add(c);
        c.position.set(0, 0.34, 0.02);
      } else if (c.userData.driver === "helm") {
        seat.add(c);
        c.position.set(0, 0.57, 0.08);
      }
    }
  }
  node("turret_mount"); // hero weapon mount: no hero turret mesh yet; reserved for the gun upgrade visuals
  node("body");
  view.glb = model;
  return missing;
}

// ---------------------------------------------------------------- m5b: enemy GLBs (ENEMY_SPEC.md)
const ENEMY_FILE: Record<Exclude<Kind, "hero">, string> = { rammer: "rammer", gunner: "gunner", mine: "mine_layer", spiker: "spiker", drone: "drone", boss: "boss" };

function enemyUrl(kind: Exclude<Kind, "hero">, lod: "phone" | "hero") {
  const inline = (window as unknown as { __NF_GLB?: Record<string, string> }).__NF_GLB;
  const f = ENEMY_FILE[kind];
  if (inline) {
    const d = inline[`${f}_${lod}`] ?? inline[`${f}_phone`];
    if (d) return d;
  }
  return `${import.meta.env.BASE_URL}assets/v02/enemies/${f}_${lod}.glb`;
}

/** One per (view, kind): a clone with per-instance materials (fade/flash are per car); "body" uses the view's runtime-tinted paint. */
function makeEnemyInst(view: CarView, kind: Kind, model: THREE.Object3D): EnemyInst {
  const root = model.clone(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.Material;
    if (src.name === "body") m.material = view.body;
    else {
      const c = src.clone();
      if (src.name === "lamp") (c as THREE.MeshStandardMaterial).emissiveIntensity = Math.max((c as THREE.MeshStandardMaterial).emissiveIntensity, 1.4);
      m.material = c;
      view.mats.push(c);
    }
    m.castShadow = false;
  });
  if (!view.mats.includes(view.body)) view.mats.push(view.body);
  const wheels: Wheel[] = [];
  for (const name of ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR", "wheel_RL2", "wheel_RR2"]) {
    const pivot = root.getObjectByName(name);
    if (!pivot) continue;
    const spin = new THREE.Group();
    for (const ch of [...pivot.children]) spin.add(ch);
    pivot.add(spin);
    pivot.userData.front = name === "wheel_FL" || name === "wheel_FR";
    wheels.push({ pivot: pivot as THREE.Group, spin });
  }
  const rotors = ["rotor_FL", "rotor_FR", "rotor_RL", "rotor_RR"].map((n) => root.getObjectByName(n)).filter((n): n is THREE.Object3D => !!n);
  if (kind === "drone") root.position.y = 0.6; // spec: origin at the drone's underside, code lifts it 0.6
  root.visible = false;
  view.tilt.add(root);
  return { root, wheels, rotors, turret: root.getObjectByName("turret_mount") ?? null, rearTurret: kind === "boss" };
}

export function createWorld(canvas: HTMLCanvasElement): World {
  const coarse = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 820);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !coarse,
    alpha: false,
    powerPreference: coarse ? "low-power" : "default",
    precision: coarse ? "mediump" : "highp",
  });
  let contextLost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.setClearColor(0x07080e);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080e);
  scene.fog = new THREE.FogExp2(0x07080e, 0.0085);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.HemisphereLight(0x1c3048, 0x070605, 0.7));
  const key = new THREE.DirectionalLight(0xd7e2f2, 2.2);
  key.position.set(8, 12, 4);
  env.add(key);
  const warm = new THREE.PointLight(0xffb070, 8, 18);
  warm.position.set(-4, 2, -3);
  env.add(warm);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0x2e4460, 0x14110e, 0.9));
  const moon = new THREE.DirectionalLight(0xc5d4ea, 1.35);
  moon.position.set(-30, 48, 18);
  scene.add(moon);
  const fill = new THREE.DirectionalLight(0xffc9a0, 0.22);
  fill.position.set(20, 12, -10);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 700);
  const camPos = new THREE.Vector3(0, 4, 12);
  const projA = new THREE.Vector3();
  const projB = new THREE.Vector3();
  const lookPos = new THREE.Vector3();
  let attract = 0;

  const hull = hullGeometry();
  const carLod: "phone" | "hero" = coarse ? "phone" : "hero";
  const carInfo: CarInfo = { source: "loading", car: "volt", lod: carLod, url: "", wheels: 4, nodes: [], missing: [] };
  const carModels: Partial<Record<CarId, THREE.Object3D>> = {};
  const carFailed: Partial<Record<CarId, string>> = {};
  let carId: CarId = "volt";
  function loadCar(id: CarId) {
    if (carModels[id] || carFailed[id]) return;
    try {
      new GLTFLoader().load(
        carUrl(id, carLod),
        (gltf) => {
          mergeStatic(gltf.scene);
          carModels[id] = gltf.scene;
        },
        undefined,
        (err) => {
          carFailed[id] = String((err as Error)?.message ?? err).slice(0, 160);
        },
      );
    } catch (err) {
      carFailed[id] = String(err).slice(0, 160);
    }
  }
  function setCar(id: CarId) {
    carId = id;
    carInfo.car = id;
    loadCar(id);
  }
  loadCar("volt");
  const views: CarView[] = [];

  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(900, 48),
    new THREE.MeshStandardMaterial({ color: 0x0b1420, metalness: 0.72, roughness: 0.22 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.6;
  scene.add(sea);

  const sparkGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffb15a });
  const sparks: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, v: new THREE.Vector3(), life: 0 });
  }

  const shotGeo = new THREE.BufferGeometry();
  const shotPos = new Float32Array(96 * 2 * 3);
  const shotCol = new Float32Array(96 * 2 * 3);
  shotGeo.setAttribute("position", new THREE.BufferAttribute(shotPos, 3));
  shotGeo.setAttribute("color", new THREE.BufferAttribute(shotCol, 3));
  shotGeo.setDrawRange(0, 0);
  const shots = new THREE.LineSegments(
    shotGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }),
  );
  scene.add(shots);
  // enemy rounds get a glowing head so incoming fire reads at a glance (lines are 1 px)
  const boltMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4a32, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    96,
  );
  const rocketMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.9, 8).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffb15a }),
    24,
  );
  rocketMesh.frustumCulled = false;
  rocketMesh.count = 0;
  scene.add(rocketMesh);
  // pickups: glowing gem + halo; crates are boxes you shoot open
  const gemGeo = new THREE.OctahedronGeometry(0.55, 0);
  const haloGeo = new THREE.TorusGeometry(0.85, 0.06, 6, 24);
  const crateGeo = new THREE.BoxGeometry(1.3, 1.1, 1.3);
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8, metalness: 0.1, emissive: 0x2a1a0a, emissiveIntensity: 0.6 });
  const pickupViews: { group: THREE.Group; gem: THREE.Mesh; halo: THREE.Mesh; crate: THREE.Mesh }[] = [];
  for (let i = 0; i < 16; i++) {
    const group = new THREE.Group();
    const gem = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    halo.rotation.x = Math.PI / 2;
    const crate = new THREE.Mesh(crateGeo, crateMat);
    group.add(gem, halo, crate);
    group.visible = false;
    scene.add(group);
    pickupViews.push({ group, gem, halo, crate });
  }
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x4a8cff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  shield.scale.set(1, 0.6, 1.25);
  shield.visible = false;
  scene.add(shield);
  boltMesh.frustumCulled = false;
  boltMesh.count = 0;
  scene.add(boltMesh);
  const boltDummy = new THREE.Object3D();

  const mineMeshes: THREE.Mesh[] = [];
  const mineGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 10);
  const oilGeo = new THREE.CircleGeometry(2.6, 18);
  const oilMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.05, metalness: 0.9, emissive: 0x1a0f3a, emissiveIntensity: 0.6 });
  const oilMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 24; i++) {
    const o = new THREE.Mesh(oilGeo, oilMat);
    o.rotation.x = -Math.PI / 2;
    o.visible = false;
    scene.add(o);
    oilMeshes.push(o);
  }
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(
      mineGeo,
      new THREE.MeshStandardMaterial({ color: 0x1a100e, emissive: 0xe23b2f, emissiveIntensity: 0.8, roughness: 0.5 }),
    );
    m.visible = false;
    scene.add(m);
    mineMeshes.push(m);
  }

  let trackReady = false;

  function burst(x: number, y: number, z: number, n: number, speed: number, color: number) {
    let left = n;
    for (const s of sparks) {
      if (left <= 0) break;
      if (s.life > 0) continue;
      s.life = 0.35 + Math.random() * 0.25;
      s.mesh.visible = true;
      s.mesh.position.set(x, y, z);
      (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      s.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
      s.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
      left -= 1;
    }
  }

  // ---- v0.2 streamed road: 40 m chunks, pooled, rebuilt in place as the player advances ----
  const SEG = 20; // samples per chunk (2 m each)
  const CHUNK = SEG * STEP;
  const BEHIND = 2;
  const AHEAD = coarse ? 7 : 9;
  const POOL = BEHIND + AHEAD + 1;
  const BLD_PER = 4;
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.92, metalness: 0.05 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.8, metalness: 0.2 });
  const markMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  type Chunk = { index: number; road: THREE.Mesh; walls: THREE.Mesh; marks: THREE.Mesh; city: THREE.Group; built: boolean; lamp: THREE.Mesh | null };
  const chunks: Chunk[] = [];
  const buildings = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.9, metalness: 0.08 }),
    POOL * BLD_PER,
  );
  buildings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(POOL * BLD_PER * 3), 3);
  buildings.frustumCulled = false;
  scene.add(buildings);
  const dummy = new THREE.Object3D();
  for (let k = 0; k < POOL; k++) {
    const mk = (mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      m.visible = false;
      scene.add(m);
      return m;
    };
    const city = new THREE.Group();
    scene.add(city);
    chunks.push({ index: -1, road: mk(roadMat), walls: mk(wallMat), marks: mk(markMat), city, built: false, lamp: null });
  }
  // ---------------------------------------------------------------- stages (v0.2 final): Night City is the playable one
  let stage: StageId = "city";
  let gateBoost = 0;
  function applyStage() {
    const st = STAGES.find((x) => x.id === stage) ?? STAGES[0];
    (scene.background as THREE.Color).setHex(st.sky);
    (scene.fog as THREE.FogExp2).color.setHex(st.sky);
    (scene.fog as THREE.FogExp2).density = st.fog;
    renderer.setClearColor(st.sky);
    buildings.visible = stage !== "city";
    for (const ch of chunks) {
      ch.built = false;
      ch.city.visible = stage === "city";
    }
    if (stage === "city") loadCity();
  }
  function cityChunk(ch: Chunk, sim: Sim) {
    if (stage !== "city" || ch.index < 0 || ch.built || !cityReady()) return;
    const i0 = ch.index * SEG;
    const o = sampleAt(sim.track, i0);
    ch.lamp = buildCityChunk(ch.city, ch.index, (k) => sampleAt(sim.track, i0 + k), SEG, sim.track.width / 2, o.x, o.z, (n) => hash(n));
    ch.city.position.set(o.x, 0, o.z);
    ch.built = true;
  }
  function gateColor(t: number) {
    const c = t % 6;
    return c < 3 ? 0x33ff66 : c < 4.2 ? 0xffb020 : 0xff2a2a;
  }
  applyStage();
  const signs: Sign[] = [makeSign(), makeSign(), makeSign()];
  for (const s of signs) scene.add(s.group);
  const signTex = new Map<string, THREE.Texture | null>();

  const GOLD = [0.78, 0.6, 0.36];
  const WHITE = [0.85, 0.83, 0.8];
  function quad(pos: number[], col: number[], idx: number[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, rx: number, rz: number, w: number, c: number[]) {
    const base = pos.length / 3;
    const h = w / 2;
    pos.push(ax - rx * h, ay, az - rz * h, ax + rx * h, ay, az + rz * h, bx - rx * h, by, bz - rz * h, bx + rx * h, by, bz + rz * h);
    for (let i = 0; i < 4; i++) col.push(c[0], c[1], c[2]);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  function setGeo(mesh: THREE.Mesh, pos: number[], idx: number[], col?: number[]) {
    const g = mesh.geometry as THREE.BufferGeometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    if (col) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    if (!col) g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  function buildChunk(slot: number, index: number, sim: Sim) {
    const ch = chunks[slot];
    ch.index = index;
    ch.built = false;
    const track = sim.track;
    const i0 = index * SEG;
    ensureTrack(track, (i0 + SEG + 2) * STEP);
    const o = sampleAt(track, i0);
    const ox = o.x;
    const oz = o.z;
    const half = track.width / 2;
    const rp: number[] = [];
    const ri: number[] = [];
    const wp: number[] = [];
    const wi: number[] = [];
    const mp: number[] = [];
    const mc: number[] = [];
    const mi: number[] = [];
    for (let k = 0; k <= SEG; k++) {
      const s = sampleAt(track, i0 + k);
      rp.push(s.x - s.rx * half - ox, s.y + 0.05, s.z - s.rz * half - oz, s.x + s.rx * half - ox, s.y + 0.05, s.z + s.rz * half - oz);
    }
    for (let k = 0; k < SEG; k++) {
      const a = sampleAt(track, i0 + k);
      const b = sampleAt(track, i0 + k + 1);
      if (a.gap && b.gap) continue;
      const i = k * 2;
      ri.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      const wo = half + 0.35;
      for (const side of [-1, 1]) {
        const base = wp.length / 3;
        const ax = a.x + a.rx * side * wo - ox;
        const az = a.z + a.rz * side * wo - oz;
        const bx = b.x + b.rx * side * wo - ox;
        const bz = b.z + b.rz * side * wo - oz;
        wp.push(ax, a.y, az, bx, b.y, bz, ax, a.y + 0.72, az, bx, b.y + 0.72, bz);
        wi.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
      for (const side of [-1, 1]) {
        const e = half - 0.28;
        quad(mp, mc, mi, a.x + a.rx * side * e - ox, a.y + 0.11, a.z + a.rz * side * e - oz, b.x + b.rx * side * e - ox, b.y + 0.11, b.z + b.rz * side * e - oz, a.rx, a.rz, 0.22, GOLD);
      }
      if ((i0 + k) % 4 < 2) {
        for (const lane of [-6, 0, 6]) {
          quad(mp, mc, mi, a.x + a.rx * lane - ox, a.y + 0.1, a.z + a.rz * lane - oz, b.x + b.rx * lane - ox, b.y + 0.1, b.z + b.rz * lane - oz, a.rx, a.rz, 0.16, WHITE);
        }
      }
    }
    setGeo(ch.road, rp, ri);
    setGeo(ch.walls, wp, wi);
    setGeo(ch.marks, mp, mc.length ? mi : [], mc);
    for (const m of [ch.road, ch.walls, ch.marks]) {
      m.position.set(ox, 0, oz);
      m.visible = true;
    }
    // skyline: a few slabs per chunk (the real CC0 scenery lands in M4)
    const colors = buildings.instanceColor!.array as Float32Array;
    for (let b = 0; b < BLD_PER; b++) {
      const id = slot * BLD_PER + b;
      const side = b % 2 === 0 ? -1 : 1;
      const h1 = hash(index * 7 + b * 13 + 1);
      const s = sampleAt(track, i0 + Math.floor((b / BLD_PER) * SEG));
      if (h1 < 0.22) {
        dummy.position.set(0, -50, 0);
        dummy.scale.set(0.001, 0.001, 0.001);
      } else {
        const dist = 30 + hash(index * 3 + b) * 44;
        const h = 8 + hash(index + 9 + b * 5) * 38;
        dummy.position.set(s.x + s.rx * side * dist, h * 0.5 - 1.5, s.z + s.rz * side * dist);
        dummy.scale.set(6 + hash(index + 2 + b) * 10, h, 6 + hash(index + 5 + b) * 10);
        dummy.rotation.set(0, hash(index + b) * 0.4, 0);
      }
      dummy.updateMatrix();
      buildings.setMatrixAt(id, dummy.matrix);
      const lit = hash(index * 11 + b) > 0.55;
      colors[id * 3] = lit ? 0.45 : 0.07;
      colors[id * 3 + 1] = lit ? 0.28 : 0.08;
      colors[id * 3 + 2] = lit ? 0.16 : 0.1;
    }
    buildings.instanceMatrix.needsUpdate = true;
    buildings.instanceColor!.needsUpdate = true;
  }

  function streamRoad(sim: Sim, along: number) {
    const c = Math.floor(along / CHUNK);
    const lo = Math.max(0, c - BEHIND);
    const hi = c + AHEAD;
    const have = new Set<number>();
    for (const ch of chunks) {
      if (ch.index >= lo && ch.index <= hi) have.add(ch.index);
      else ch.index = -1;
    }
    for (let i = lo; i <= hi; i++) {
      if (have.has(i)) continue;
      const slot = chunks.findIndex((ch) => ch.index === -1);
      if (slot < 0) break;
      buildChunk(slot, i, sim);
    }
    for (const ch of chunks) {
      if (ch.index !== -1) {
        cityChunk(ch, sim);
        continue;
      }
      ch.road.visible = ch.walls.visible = ch.marks.visible = false;
      ch.city.visible = false;
    }
    if (stage === "city") {
      const now = performance.now() / 1000;
      for (const ch of chunks) {
        if (ch.index < 0) continue;
        ch.city.visible = true;
        if (!ch.lamp) continue;
        const col = gateColor(now + ch.index);
        ch.lamp.parent?.children.forEach((l) => ((l as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(col));
        // boost gate: pass the sign_fork pair while green for a short speed boost (visual stage feature)
        const gs = ch.index * CHUNK + CHUNK / 2;
        const hero = sim.cars[0];
        if (sim.phase === "playing" && hero.alive && hero.along > gs && hero.along - gs < 3 && gateBoost <= 0 && col === 0x33ff66) {
          hero.speed = Math.min(hero.speed + 10, 60);
          gateBoost = 2;
        }
      }
    }
    // set-piece warning boards
    const near: Piece[] = sim.track.pieces.filter((p) => p.signS > along - 40 && p.signS < along + AHEAD * CHUNK);
    signs.forEach((sg, k) => {
      const p = near[k];
      if (!p) {
        sg.group.visible = false;
        return;
      }
      if (sg.at !== p.signS) {
        sg.at = p.signS;
        if (!signTex.has(p.label)) signTex.set(p.label, signTexture(p.label));
        const mat = sg.board.material as THREE.MeshBasicMaterial;
        mat.map = signTex.get(p.label) ?? null;
        mat.needsUpdate = true;
        const q = poseAt(sim.track, p.signS);
        sg.group.position.set(q.x, q.y, q.z);
        sg.group.rotation.set(0, Math.atan2(-q.tx, -q.tz), 0); // face the oncoming player
        sg.board.rotation.y = 0;
      }
      sg.group.visible = true;
    });
  }

  // ?enemylod=phone|hero overrides the enemy LOD (used by the headless tests on software GL)
  const lodParam = new URLSearchParams(window.location.search).get("enemylod");
  const enemyLod: "phone" | "hero" = lodParam === "phone" || lodParam === "hero" ? lodParam : carLod;
  const enemyModels: Partial<Record<Kind, THREE.Object3D>> = {};
  const enemyInfo: Record<string, string> = {};
  for (const kind of Object.keys(ENEMY_FILE) as Exclude<Kind, "hero">[]) {
    enemyInfo[kind] = "loading";
    try {
      new GLTFLoader().load(
        enemyUrl(kind, enemyLod),
        (g) => {
          mergeStatic(g.scene);
          enemyModels[kind] = g.scene;
          enemyInfo[kind] = "glb";
        },
        undefined,
        (err) => {
          enemyInfo[kind] = "placeholder: " + String((err as Error)?.message ?? err).slice(0, 80);
        },
      );
    } catch (err) {
      enemyInfo[kind] = "placeholder: " + String(err).slice(0, 80);
    }
  }

  /** Show the GLB for this kind if it has loaded, else the procedural placeholder (with its boss scale). */
  function useKind(view: CarView, kind: Kind) {
    if (!view.procWheels) view.procWheels = view.wheels;
    if (!view.inst) view.inst = {};
    const model = enemyModels[kind];
    let inst = view.inst[kind] ?? null;
    if (!inst && model) {
      try {
        inst = view.inst[kind] = makeEnemyInst(view, kind, model);
      } catch {
        inst = null;
      }
    }
    for (const i of Object.values(view.inst)) i!.root.visible = i === inst;
    view.active = inst;
    if (inst) {
      view.chassis.visible = false;
      for (const g of Object.values(view.parts)) g!.visible = false;
      if (view.turret) view.turret.visible = false;
      view.root.scale.set(1, 1, 1); // GLBs are modelled at final size
      view.wheels = inst.wheels;
    } else {
      if (view.turret) view.turret.visible = kind === "gunner";
      view.chassis.visible = kind !== "drone";
      for (const [k, g] of Object.entries(view.parts)) g!.visible = k === kind;
      const sc = KIND_SCALE[kind] ?? [1, 1, 1];
      view.root.scale.set(sc[0], sc[1], sc[2]);
      view.wheels = view.procWheels;
    }
    view.kindSrc = `${kind}:${inst ? "glb" : "proc"}`;
  }

  function attachCar() {
    const v = views[0] as (CarView & { carId?: string }) | undefined;
    if (!v) return;
    if (carFailed[carId]) {
      if (v.glb) rebuildHero(); // fallback: procedural hull
      (views[0] as CarView & { carId?: string }).carId = carId;
      carInfo.source = "procedural";
      carInfo.error = carFailed[carId];
      return;
    }
    const model = carModels[carId];
    if (!model) {
      if (!v.glb) carInfo.source = "loading";
      return;
    }
    if (v.carId === carId && v.glb) return;
    if (v.glb) rebuildHero();
    const hv = views[0] as CarView & { carId?: string };
    try {
      const inst = model.clone(true);
      const names: string[] = [];
      inst.traverse((o) => {
        if (o.name) names.push(o.name);
      });
      carInfo.missing = applyCarGlb(hv, inst);
      let tris = 0;
      inst.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      });
      carInfo.nodes = names;
      carInfo.tris = Math.round(tris);
      carInfo.wheels = hv.wheels.length;
      carInfo.source = "glb";
      const u = carUrl(carId, carLod);
      carInfo.url = u.startsWith("data:") ? "inline" : u;
      carInfo.error = undefined;
    } catch (err) {
      carInfo.source = "procedural";
      carInfo.error = String(err).slice(0, 160);
    }
    hv.carId = carId;
  }

  function rebuildHero() {
    const old = views[0];
    scene.remove(old.root);
    scene.remove(old.shadow);
    const v = buildCar(true, hull);
    scene.add(v.root);
    scene.add(v.shadow);
    views[0] = v;
  }

  // ---------------------------------------------------------------- m5: hauler rig rollout (timeline outside the sim)
  let rigModel: THREE.Object3D | null = null;
  let robotGltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null = null;
  try {
    new GLTFLoader().load(rigUrl("rig_phone"), (g) => {
      mergeStatic(g.scene);
      rigModel = g.scene;
    }, undefined, () => {});
    new GLTFLoader().load(rigUrl("robot_phone"), (g) => (robotGltf = g), undefined, () => {});
  } catch {
    /* rollout simply won't play */
  }
  type Rollout = { t: number; spawnS: number; rig: THREE.Object3D; ramp: THREE.Object3D | null; doorL: THREE.Object3D | null; doorR: THREE.Object3D | null; mixers: THREE.AnimationMixer[]; handed: boolean; robots: number; idle: boolean; wheels: THREE.Object3D[]; bayY: number };
  let roll: Rollout | null = null;
  const RIG_BACK = 14.6; // the car ends 14.6 m behind the rig origin (past the ramp foot)
  const HAND = 5.8;
  function startRollout(sim: Sim): boolean {
    stopRollout();
    if (!rigModel) return false;
    const rig = rigModel.clone(true);
    scene.add(rig);
    const mixers: THREE.AnimationMixer[] = [];
    let robots = 0;
    let idle = false;
    if (robotGltf) {
      for (const n of ["robot_spawn_A", "robot_spawn_B"]) {
        const at = rig.getObjectByName(n);
        if (!at) continue;
        try {
          const r = skeletonClone(robotGltf.scene);
          at.add(r);
          robots += 1;
          const clip = robotGltf.animations.find((a) => a.name === "idle");
          if (clip) {
            const mx = new THREE.AnimationMixer(r);
            mx.clipAction(clip).play();
            mx.update(Math.random());
            mixers.push(mx);
            idle = true;
          }
        } catch {
          /* robots are optional */
        }
      }
    }
    const wheels: THREE.Object3D[] = [];
    rig.traverse((o) => {
      if (/wheel/.test(o.name) && !/_mesh/.test(o.name)) wheels.push(o);
    });
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    rig.updateMatrixWorld(true);
    const bayN = rig.getObjectByName("bay_floor");
    const bayY = bayN ? bayN.getWorldPosition(new THREE.Vector3()).y : 1.2;
    roll = { bayY, t: 0, spawnS: sim.cars[0].along, rig, ramp: rig.getObjectByName("ramp") ?? null, doorL: rig.getObjectByName("trailer_door_L") ?? null, doorR: rig.getObjectByName("trailer_door_R") ?? null, mixers, handed: false, robots, idle, wheels };
    return true;
  }
  function stopRollout() {
    if (roll) scene.remove(roll.rig);
    roll = null;
  }
  function skipRollout() {
    if (roll && !roll.handed) roll.t = HAND;
  }
  const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  function rigS(r: Rollout, t: number) {
    const stop = r.spawnS + RIG_BACK;
    if (t < 2.2) return stop - 45 * (1 - ease(t / 2.2)); // drives in ahead and stops
    if (t < HAND) return stop;
    const u = t - HAND;
    return stop + 9 * u * u + 6 * u; // pulls away after handover
  }
  function updateRollout(sim: Sim, dt: number) {
    if (!roll) return;
    const r = roll;
    r.t += dt;
    for (const m of r.mixers) m.update(dt);
    const t = r.t;
    const s = rigS(r, t);
    const p = poseAt(sim.track, s);
    r.rig.position.set(p.x, p.y, p.z);
    r.rig.rotation.set(0, yawFromDir(p.tx, p.tz) + Math.PI, 0);
    const rigSpeed = (rigS(r, t + 0.02) - s) / 0.02;
    for (const w of r.wheels) w.rotation.x += (rigSpeed * dt) / 0.52;
    // ramp drops BEFORE the doors open; the doors close BEFORE the ramp is raised
    const rampDown = t < 2.2 ? 0 : t < 3.0 ? ease((t - 2.2) / 0.8) : t < HAND + 0.6 ? 1 : 1 - ease((t - HAND - 0.6) / 0.8);
    const doors = t < 3.0 ? 0 : t < 3.6 ? ease((t - 3.0) / 0.6) : t < HAND ? 1 : 1 - ease((t - HAND) / 0.6);
    if (r.ramp) r.ramp.rotation.x = ((-94 * Math.PI) / 180) * rampDown;
    if (r.doorL) r.doorL.rotation.y = ((100 * Math.PI) / 180) * doors;
    if (r.doorR) r.doorR.rotation.y = ((-100 * Math.PI) / 180) * doors;
    if (!r.handed && t >= HAND) r.handed = true;
    if (t > HAND + 9) stopRollout();
  }
  /** while the rollout runs the hero car is posed by the timeline, not by the sim */
  const OUT0 = 3.6, OUT1 = 5.3; // hover-out window (thrusters lit); then drop + bounce until HAND
  function rollThrust(t: number) {
    return t >= OUT0 - 0.15 && t < OUT1 ? 1 : 0;
  }
  function poseHeroInRollout(sim: Sim) {
    if (!roll || roll.handed || !views[0]) return;
    const r = roll;
    const t = r.t;
    const stop = r.spawnS + RIG_BACK;
    // starts on bay_floor (local z -9.05, bay height), backs out rearward HOVERING at bay height past the trailer end, then drops
    const u = t < OUT0 ? 0 : ease((t - OUT0) / (OUT1 - OUT0));
    const localZ = -9.05 + (-RIG_BACK + 9.05) * u;
    const sNow = (t < 2.2 ? rigS(r, t) : stop) + localZ;
    const p = poseAt(sim.track, sNow);
    let y = r.bayY;
    if (t >= OUT1) {
      const d = Math.min(1, (t - OUT1) / (HAND - OUT1));
      y = d < 0.45 ? r.bayY * (1 - (d / 0.45) ** 2) : 0.12 * Math.sin(((d - 0.45) / 0.55) * Math.PI) * (1 - d);
    }
    const v = views[0];
    v.root.position.set(p.x, p.y + y, p.z);
    v.root.rotation.set(0, yawFromDir(p.tx, p.tz) + Math.PI, 0);
    v.shadow.position.set(p.x, p.y + 0.08, p.z);
    const th = rollThrust(t);
    v.flames.forEach((f, idx) => {
      const len = th ? 0.7 + Math.sin(performance.now() * 0.03 + idx) * 0.15 : 0.02;
      f.scale.set(th ? 1 : 0.15, len, th ? 1 : 0.15);
      (f.material as THREE.MeshBasicMaterial).opacity = th ? 0.85 : 0;
    });
    // rear three-quarter camera: behind and above the trailer's rear-left corner, pulled back for phone portrait
    const cs = poseAt(sim.track, stop - 11.6 - 15);
    const narrow = camera.aspect < 0.8;
    const side = narrow ? 5.5 : 7.5;
    camera.position.set(cs.x + cs.rx * side, cs.y + (narrow ? 7.5 : 6), cs.z + cs.rz * side);
    const lk = poseAt(sim.track, stop - 10.5);
    const lx = (lk.x + p.x) / 2, ly = Math.max(lk.y, p.y) + 1.2, lz = (lk.z + p.z) / 2;
    camera.lookAt(lx, ly, lz);
    const fov = narrow ? 62 : 50;
    if (Math.abs(camera.fov - fov) > 0.4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camPos.copy(camera.position);
    lookPos.set(lx, ly, lz);
  }
  function rolloutState() {
    return roll ? { thrust: roll.handed ? 0 : rollThrust(roll.t), bayY: roll.bayY, active: !roll.handed, t: roll.t, robots: roll.robots, idle: roll.idle } : { thrust: 0, bayY: 0, active: false, t: -1, robots: 0, idle: false };
  }


  function ensureViews(sim: Sim) {
    while (views.length < sim.cars.length) {
      const view = buildCar(views.length === 0, hull);
      scene.add(view.root);
      scene.add(view.shadow);
      views.push(view);
    }
  }

  function resize(w: number, h: number, dpr: number) {
    renderer.setPixelRatio(Math.min(dpr, coarse ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function sync(sim: Sim, dt: number, attractMode: boolean) {
    ensureViews(sim);
    attachCar();
    const hero = sim.cars[0];
    gateBoost -= dt;
    streamRoad(sim, hero.along);
    sea.position.set(hero.x, -1.6, hero.z);
    const k = 1 - Math.exp(-4.2 * Math.max(0.0001, dt));

    for (let i = 0; i < views.length; i++) {
      const car = sim.cars[i];
      const view = views[i];
      if (!car.hero && (car.kind !== view.kind || view.kindSrc !== `${car.kind}:${enemyModels[car.kind] ? "glb" : "proc"}`)) {
        view.kind = car.kind;
        view.body.color.setHex(KIND_COLOR[car.kind]);
        useKind(view, car.kind);
      }
      const act = view.active;
      if (act && !car.hero) {
        for (const r of act.rotors) r.rotation.y += dt * 40;
        if (act.turret) {
          // turret yaws toward the player (boss turret faces the rear)
          const a = Math.atan2(hero.x - car.x, hero.z - car.z) - (car.yaw + Math.PI) - (act.rearTurret ? Math.PI : 0);
          act.turret.rotation.y = Math.atan2(Math.sin(a), Math.cos(a));
        }
      }
      if (car.kind === "drone") {
        view.parts.drone?.children.forEach((c) => {
          if (c.userData.rotor) c.rotation.y += dt * 40;
        });
      }
      // M2 issue fix: an enemy between the chase camera and the player fades out instead of blocking the view
      if (!car.hero) {
        // fade only when the enemy actually covers the player's car on screen and is nearer the camera
        projA.set(car.x, car.y + 0.6, car.z).project(camera);
        projB.set(hero.x, hero.y + 0.6, hero.z).project(camera);
        const cw = renderer.domElement.clientWidth || 1;
        const ch = renderer.domElement.clientHeight || 1;
        // in CSS px: the enemy's centre sits on top of the car (within ~60 x 36 px)
        const covers = projA.z < projB.z && Math.abs(projA.x - projB.x) * cw * 0.5 < 60 && Math.abs(projA.y - projB.y) * ch * 0.5 < 36;
        const target = covers ? 0.25 : 1;
        view.fade += (target - view.fade) * Math.min(1, dt * 10);
        const op = view.fade > 0.98 ? 1 : view.fade;
        for (const m of view.mats) {
          const tr = op < 1 || (m as THREE.MeshBasicMaterial).userData.wasTransparent === true;
          if (m.userData.wasTransparent === undefined) m.userData.wasTransparent = m.transparent;
          if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
          if (m.transparent !== tr) {
            m.transparent = tr;
            m.needsUpdate = true;
          }
          m.opacity = m.userData.baseOpacity * op;
        }
      }
      const blink = car.hero && car.invuln > 0 && Math.floor(performance.now() / 90) % 2 === 0;
      view.root.visible = car.alive && car.y > -5 && !blink;
      view.shadow.visible = view.root.visible;
      if (!view.root.visible) continue;
      view.root.position.set(car.x, car.y, car.z);
      view.root.rotation.set(0, car.yaw + Math.PI, 0);
      const q = poseAt(sim.track, car.along);
      const pitch = car.grounded ? -Math.atan(q.slope) * 0.85 : clampPitch(car.vy);
      const targetSteer = car.hero ? readSteer(sim) : 0;
      view.steer += (targetSteer - view.steer) * k;
      view.tilt.rotation.x = pitch;
      view.tilt.rotation.z = view.steer * 0.07;
      view.spin += car.speed * dt * 2.6;
      for (const w of view.wheels) {
        if (w.pivot.userData.front) w.pivot.rotation.y = view.steer * 0.28;
        w.spin.rotation.x = view.spin;
      }
      const thrust = car.hero ? car.thrust : 0; // only the Roadster has thrusters
      view.flames.forEach((f, idx) => {
        const len = thrust > 0 ? 0.7 + Math.sin(performance.now() * 0.03 + idx) * 0.15 : 0.02;
        f.scale.set(thrust > 0 ? 1 : 0.15, len, thrust > 0 ? 1 : 0.15);
        (f.material as THREE.MeshBasicMaterial).opacity = thrust > 0 ? 0.85 : 0;
      });
      view.body.emissiveIntensity = car.flash > 0 ? 1.6 : i === 0 ? 0.35 : 0.2;
      const deck = q.gap ? q.y : car.grounded ? car.y : q.y;
      const airH = Math.max(0, car.y - deck);
      view.shadow.position.set(car.x, deck + 0.08, car.z);
      const sc = 1 + Math.min(1.4, airH * 0.15);
      view.shadow.scale.setScalar(sc);
      (view.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.05, 0.38 - airH * 0.04);
    }

    let count = 0;
    const attr = shotGeo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (const s of sim.shots) {
      if (!s.alive) continue;
      const o = count * 6;
      arr[o] = s.px;
      arr[o + 1] = s.py;
      arr[o + 2] = s.pz;
      arr[o + 3] = s.x;
      arr[o + 4] = s.y;
      arr[o + 5] = s.z;
      const enemy = s.owner !== 0;
      for (let v = 0; v < 2; v++) {
        shotCol[o + v * 3] = enemy ? 1 : 1;
        shotCol[o + v * 3 + 1] = enemy ? 0.25 : 0.89;
        shotCol[o + v * 3 + 2] = enemy ? 0.18 : 0.69;
      }
      count += 1;
    }
    let rockets = 0;
    for (const s of sim.shots) {
      if (!s.alive || !s.rocket || rockets >= 24) continue;
      boltDummy.position.set(s.x, s.y, s.z);
      boltDummy.lookAt(s.x + s.vx, s.y + s.vy, s.z + s.vz);
      boltDummy.scale.set(1, 1, 1);
      boltDummy.updateMatrix();
      rocketMesh.setMatrixAt(rockets++, boltDummy.matrix);
      if (Math.random() < 0.5) burst(s.x - s.vx * 0.02, s.y, s.z - s.vz * 0.02, 1, 1.5, 0xffb15a);
    }
    rocketMesh.count = rockets;
    rocketMesh.instanceMatrix.needsUpdate = true;
    const now = performance.now() * 0.001;
    sim.pickups.forEach((p, i) => {
      const v = pickupViews[i];
      if (!v) return;
      v.group.visible = p.alive;
      if (!p.alive) return;
      v.group.position.set(p.x, p.y + (p.crate ? 0 : Math.sin(now * 3 + i) * 0.15), p.z);
      v.crate.visible = p.crate;
      v.gem.visible = v.halo.visible = !p.crate;
      if (!p.crate) {
        const c = PICKUP_COLOR[p.kind];
        (v.gem.material as THREE.MeshBasicMaterial).color.setHex(c);
        (v.halo.material as THREE.MeshBasicMaterial).color.setHex(c);
        v.gem.rotation.y = now * 2.2;
        v.halo.rotation.z = now;
      } else v.crate.rotation.y = i;
    });
    shield.visible = sim.up.shieldT > 0 && hero.alive;
    if (shield.visible) {
      shield.position.set(hero.x, hero.y + 0.7, hero.z);
      shield.rotation.y = hero.yaw;
      (shield.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(now * 8) * 0.05 + (sim.up.shieldT < 1.5 ? Math.sin(now * 30) * 0.08 : 0);
    }
    let bolts = 0;
    for (const s of sim.shots) {
      if (!s.alive || s.owner === 0) continue;
      const vx = s.x - s.px;
      const vz = s.z - s.pz;
      boltDummy.position.set(s.x, s.y, s.z);
      boltDummy.rotation.set(0, Math.atan2(vx, vz), 0);
      boltDummy.scale.set(1, 1, 3.2);
      boltDummy.updateMatrix();
      boltMesh.setMatrixAt(bolts++, boltDummy.matrix);
    }
    boltMesh.count = bolts;
    boltMesh.instanceMatrix.needsUpdate = true;
    shotGeo.setDrawRange(0, count * 2);
    attr.needsUpdate = true;
    (shotGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    for (let i = 0; i < mineMeshes.length; i++) {
      const m = sim.mines[i];
      const mesh = mineMeshes[i];
      const oil = oilMeshes[i];
      mesh.visible = !!m?.alive && !m.oil;
      oil.visible = !!m?.alive && m.oil;
      if (oil.visible) oil.position.set(m.x, m.y + 0.06, m.z);
      if (!mesh.visible) continue;
      mesh.position.set(m.x, m.y + 0.08, m.z);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = m.arm > 0 ? 0.15 : 0.45 + Math.sin(performance.now() * 0.012) * 0.45;
    }

    for (const e of sim.events) {
      if (e.t === "boom") burst(e.x, e.y + 0.4, e.z, 14, 9, 0xff6a32);
      else if (e.t === "hit") burst(e.x, e.y, e.z, e.big ? 8 : 4, 6, 0xffd2a1);
      else if (e.t === "land" && e.hard) burst(e.x, e.y + 0.2, e.z, 6, 4, 0xc6a36a);
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      if (s.life <= 0) s.mesh.visible = false;
    }

    const shake = reduceMotion ? 0 : sim.trauma * sim.trauma;
    const beauty = (window as unknown as { __nfBeauty?: number }).__nfBeauty;
    if (beauty !== undefined) {
      // debug/test only: close three-quarter beauty shot of the hero car
      const a = hero.yaw + Math.PI + beauty;
      camPos.set(hero.x + Math.sin(a) * 6.2, hero.y + 1.55, hero.z + Math.cos(a) * 6.2);
      lookPos.set(hero.x, hero.y + 0.55, hero.z);
      camera.position.copy(camPos);
      camera.lookAt(lookPos);
      if (Math.abs(camera.fov - 38) > 0.4) {
        camera.fov = 38;
        camera.updateProjectionMatrix();
      }
    } else if (attractMode) {
      attract += dt * 0.28;
      const r = 12.4;
      camPos.set(hero.x + Math.sin(attract) * r, hero.y + 4.1, hero.z + Math.cos(attract) * r);
      lookPos.set(hero.x, hero.y + 0.35, hero.z);
      camera.position.copy(camPos);
      camera.lookAt(lookPos);
      if (Math.abs(camera.fov - 52) > 0.4) {
        camera.fov = 52;
        camera.updateProjectionMatrix();
      }
    } else {
      const fx = -Math.sin(hero.yaw);
      const fz = -Math.cos(hero.yaw);
      // m3b: pulled back and raised (higher, more overhead, not top-down) so ~14 m behind the car is on screen
      const dist = CAM_BACK + Math.min(1.5, Math.abs(hero.speed) * 0.025);
      const desired = new THREE.Vector3(hero.x - fx * dist, hero.y + CAM_UP, hero.z - fz * dist);
      const look = new THREE.Vector3(hero.x - fx * CAM_LOOK_BACK, hero.y + 0.5, hero.z - fz * CAM_LOOK_BACK);
      camPos.lerp(desired, k);
      lookPos.lerp(look, k);
      const t = performance.now() * 0.001;
      camera.position.set(
        camPos.x + Math.sin(t * 18) * 0.22 * shake,
        camPos.y + Math.cos(t * 15) * 0.14 * shake,
        camPos.z + Math.cos(t * 13) * 0.22 * shake,
      );
      camera.lookAt(lookPos);
      camera.rotateZ(views[0].steer * -0.035);
      const fov = 66 + clamp01(Math.abs(hero.speed) / 48) * 8 + hero.thrust * 5;
      if (Math.abs(camera.fov - fov) > 0.4) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    // P0 fix: the frame was never drawn (no render call) -> black 3D view on every device.
    if (roll) {
      updateRollout(sim, dt);
      poseHeroInRollout(sim);
    }
    if (!contextLost) renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
    hull.dispose();
  }

  /** screen position of a car in CSS px (x,y), and whether it is inside the view */
  function project(sim: Sim, id: number) {
    const c = sim.cars[id];
    projA.set(c.x, c.y + 0.6, c.z).project(camera);
    const w = renderer.domElement.clientWidth || 1;
    const h = renderer.domElement.clientHeight || 1;
    const behindCam = projA.z > 1;
    const on = !behindCam && Math.abs(projA.x) < 0.97 && Math.abs(projA.y) < 0.97;
    let nx = projA.x;
    let ny = projA.y;
    if (behindCam) {
      nx = -nx;
      ny = -Math.abs(ny) - 1;
    }
    return { x: ((nx + 1) / 2) * w, y: ((1 - ny) / 2) * h, on, w, h };
  }
  return {
    sync,
    resize,
    dispose,
    project,
    debugFade: () => views.map((v) => v.fade),
    carInfo: () => carInfo,
    setCar,
    setStage(id: StageId) {
      if (id === stage) return;
      stage = id;
      applyStage();
    },
    stageInfo: () => ({ stage, cityChunks: chunks.filter((c) => c.built && c.city.children.length > 0).length, gates: chunks.filter((c) => c.built && c.lamp).length }),
    startRollout,
    skipRollout,
    rolloutState,
    drawInfo: () => ({ draws: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    enemyInfo: () => ({ ...enemyInfo, lod: enemyLod, shown: views.slice(1).map((v) => v.kindSrc ?? "") }),
  };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function clampPitch(vy: number) {
  return Math.max(-0.35, Math.min(0.28, -vy * 0.012));
}

function readSteer(sim: Sim) {
  const keys = sim.keysOverride ?? sim.keys;
  let steer = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) steer += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) steer -= 1;
  if (!sim.keysOverride) steer += sim.touch.steer;
  return Math.max(-1, Math.min(1, steer));
}
