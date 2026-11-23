import * as THREE from "three";
import { CAR_LOD_FAR, carLodFar } from "./carlod";
import { BEND_STEP, bendGeometry, bendStep, lerpPose, sliceZ } from "./roadbend";
import { loadCity, loadRoadKit, roadKitReady, getPiece, buildCityChunk, cityDetailRange, cityReady, roughHook, roadTilesFit } from "./city";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hasBoost, ROLL_HAND, ROLL_NOSE, ROLL_OUT0, ROLL_OUT1, rollLocalZ, rollProgress, rollRigBack, rollRoadsterHeight, stepNonRoadsterRoll, type Kind, type PickupKind, type Sim } from "./sim";
import { ensureTrack, poseAt, sampleAt, STEP, yawFromDir, type Piece } from "./road";
import { courseFor, washFor, washPhase } from "./course";
import { CROWN_CUT, buildCoastChunk, coastReady, foamClock, loadCoast, type CoastCrown } from "./coast";
import { chunkCourse } from "./coastcourse";
import { BRIDGE_HIDE, PINE_LOD, buildWoodsChunk, floorPatchGeometry, loadWoods, makeTruckMesh, woodsPineGeometry, woodsReady } from "./woods";
import { FLOOR_PATCH, woodsFog } from "./woodscourse";
import { PAINT_GLSL } from "./roadpaint";
import { WOODS_LOOK } from "./woodscourse";
import { buildHighwayChunk, desertPatchGeometry, highwayFarGroup, highwayReady, loadHighway } from "./highway";
import { BRIDGE, DESERT_PATCH, DESERT_SCATTER, HIGHWAY_GAP, HIGHWAY_LOOK } from "./highwaycourse";
import { cutMaterial, hazeBand, rockGeometry, rockMaterial } from "./highwayterrain";
import { TRUCK } from "./trucks";

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
  /** procedural cold-gas nozzles; hidden unless this hero is the Roadster */
  nozzles: THREE.Object3D[];
  /** GLB thruster_L / thruster_R. Hidden on every car except the Roadster. */
  thrusters: THREE.Object3D[];
  glb?: THREE.Object3D;
  procWheels?: Wheel[];
  inst?: Partial<Record<Kind, EnemyInst>>;
  /** desktop distant-car LOD: the phone-GLB instance per kind, and whether this view is past the far line */
  instLo?: Partial<Record<Kind, EnemyInst>>;
  lodFar?: boolean;
  kindSrc?: string;
  active?: EnemyInst | null;
};

type EnemyInst = { root: THREE.Object3D; wheels: Wheel[]; rotors: THREE.Object3D[]; turret: THREE.Object3D | null; rearTurret: boolean };

const RIVAL_TINT = [0xf0d38a, 0x8ec8ff, 0xff5a4a];
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
  /** test harness: the next frame puts the chase cam straight on its target (after a teleport). Gameplay easing unchanged. */
  debugSnapCamera: () => void;
  /** test harness: what is under a screen point (NDC): material name, texture, and the pieces merged into that mesh. */
  debugPick: (x: number, y: number) => { mat: string; map: boolean; color: string; emissive: string; pieces: string[]; dist: number; at: number[]; n: number[] }[];
  carInfo: () => CarInfo;
  setCar: (id: CarId) => void;
  setStage: (id: StageId) => void;
  rolloutSeek: (t: number) => void;
  stageInfo: () => { stage: string; cityChunks: number; gates: number };
  /** Pine Woods debug: pine stand counts (near / lod_far), bridge roof state, live trucks, fog density */
  highwayInfo: () => { patches: number; far: boolean; rotors: number; mesas: number[][]; cam: number[]; gapCut: boolean; bedCut: boolean };
  woodsInfo: () => { near: number; far: number; roofHidden: boolean; trucks: number; fog: number; patches: number; stands: number; truckPool: number; roofs: number };
  startRollout: (sim: Sim) => boolean;
  skipRollout: () => void;
  stopRollout: () => void;
  sceneInfo: () => { objects: number; geometries: number; textures: number };
  rolloutState: () => { thrust: number; bayY: number; active: boolean; t: number; robots: number; idle: boolean };
  drawInfo: () => { draws: number; tris: number };
  /** debug: NDC of a world point under the current camera (M1 hop-in-frame check) */
  projectPoint: (x: number, y: number, z: number) => { x: number; y: number; inside: boolean };
  /** NDC of a point in front of the hero nose. Visual only — aim sim stays on facing. */
  aimReticle: (sim: Sim) => { x: number; y: number; inside: boolean };
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
  const nozzles: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.26, 10), copper);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.42, 0.4, -2.18);
    pod.userData.proc = true;
    pod.userData.nozzle = true;
    tilt.add(pod);
    nozzles.push(pod);
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
  return { root, tilt, body, flames, wheels, shadow, steer: 0, spin: 0, kind: hero ? "hero" : "rammer", turret, chassis, parts, mats, fade: 1, nozzles, thrusters: [] };
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
export type CarInfo = { source: "procedural" | "glb" | "loading"; car: string; lod: "phone" | "hero"; url: string; wheels: number; nodes: string[]; missing: string[]; error?: string; tris?: number; file?: string };
const CAR_NODES = ["body", "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR", "thruster_L", "thruster_R", "lamp_L", "lamp_R", "taillight", "turret_mount", "driver_seat"];

/** Playable cars: same handling for all; only the GLB changes. file = assets_v02/car/<file>_<lod>.glb */
export const STAGES = [
  { id: "city", name: "Night City", ready: true, sky: 0x0a0814, fog: 0.0075 },
  { id: "classic", name: "Classic Night", ready: true, sky: 0x07080e, fog: 0.0085 },
  { id: "coast", name: "Coast Road", ready: true, sky: 0x2a1a24, fog: 0.006 },
  { id: "woods", name: "Pine Woods", ready: true, sky: WOODS_LOOK.sky, fog: 0.012 },
  { id: "highway", name: "Open Highway", ready: true, sky: 0x1a140c, fog: 0.004 },
  { id: "port", name: "Industrial Port", ready: true, sky: 0x0c1014, fog: 0.008 },
  { id: "pass", name: "Mountain Pass", ready: true, sky: 0x10141c, fog: 0.008 },
] as const;
export type StageId = (typeof STAGES)[number]["id"];
/**
 * Six-car lineup. GLB stems live in spa/public/assets/v02/car/<file>_{phone,hero}.glb.
 * Model 3 keeps the shipped sedan_compact mesh. Roadster keeps roadster2026.
 * Y / X / S / Cybertruck use Art's M2 meshes (no procedural stand-ins).
 * Model X side-gun empties, if present, are visual only until M8.
 */
export const CARS = [
  { id: "model3", name: "Model 3", file: "sedan_compact" },
  { id: "model_y", name: "Model Y", file: "model_y" },
  { id: "model_x", name: "Model X", file: "model_x" },
  { id: "model_s", name: "Model S", file: "model_s" },
  { id: "cybertruck", name: "Cybertruck", file: "cybertruck" },
  { id: "roadster", name: "Roadster", file: "roadster2026" },
] as const;
export type CarId = (typeof CARS)[number]["id"];

function inlineGlb(key: string) {
  const inline = (window as unknown as { __NF_GLB?: Record<string, string> }).__NF_GLB;
  return inline?.[key];
}

/** the exact file key a car loads: <file>_<lod>, or the phone LOD when only that is inlined (single-file build) */
function carFile(car: CarId, lod: "phone" | "hero") {
  const file = CARS.find((c) => c.id === car)?.file ?? "sedan_compact";
  if (inlineGlb(`${file}_${lod}`)) return `${file}_${lod}`;
  if (inlineGlb(`${file}_phone`)) return `${file}_phone`;
  return `${file}_${lod}`;
}
function carUrl(car: CarId, lod: "phone" | "hero") {
  const file = CARS.find((c) => c.id === car)?.file ?? "sedan_compact";
  const d = inlineGlb(`${file}_${lod}`) ?? inlineGlb(`${file}_phone`);
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

/** Phone enemy LOD: one mesh per wheel material, parented on the root. The wheel_* pivots stay so the rig still finds four wheels. */
function foldWheels(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const victims: THREE.Mesh[] = [];
  const underWheel = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o.parent; p && p !== root; p = p.parent) if (/^wheel_/.test(p.name)) return true;
    return false;
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh || !underWheel(m) || Array.isArray(m.material)) return;
    const g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const g = new THREE.BufferGeometry();
    const pos = g0.getAttribute("position");
    const nrm = g0.getAttribute("normal");
    if (!pos || !nrm) return;
    g.setAttribute("position", pos);
    g.setAttribute("normal", nrm);
    if (g0.getAttribute("uv")) g.setAttribute("uv", g0.getAttribute("uv"));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const list = groups.get(m.material as THREE.Material) ?? [];
    list.push(g);
    groups.set(m.material as THREE.Material, list);
    victims.push(m);
  });
  for (const v of victims) v.parent?.remove(v);
  for (const [mat, list] of groups) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = "merged_wheel";
    mesh.castShadow = false;
    root.add(mesh);
  }
}

function ancestorNamed(o: THREE.Object3D, root: THREE.Object3D, re: RegExp) {
  for (let p: THREE.Object3D | null = o.parent; p && p !== root; p = p.parent) if (re.test(p.name)) return p;
  return null;
}

/**
 * Phone enemy LOD. The phone GLBs are already the low mesh, but each wheel is four
 * materials and the body is five, so a full field is a draw each. Collapse trim into
 * the body paint, wheels into one tire mesh, and each turret into one mesh. Glass stays.
 * The hero car does not come through here.
 */
function phoneEnemyLod(root: THREE.Object3D) {
  const named = new Map<string, THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const name = m.material.name;
    if (name && !named.has(name)) named.set(name, m.material);
  });
  const body = named.get("body");
  const tire = named.get("tire") ?? body;
  if (body) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      if (ancestorNamed(m, root, /rotor_/)) return;
      if (ancestorNamed(m, root, /wheel_/)) {
        if (tire) m.material = tire;
        return;
      }
      const matName = m.material.name;
      if (matName === "lamp" || matName === "trim" || matName === "rim" || matName === "taillight") m.material = body;
    });
  }
  mergeStatic(root);
  foldWheels(root);
  const mounts: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (/^turret_/.test(o.name)) mounts.push(o);
  });
  for (const mount of mounts) {
    mount.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(mount.matrixWorld).invert();
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const victims: THREE.Mesh[] = [];
    mount.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m === mount || Array.isArray(m.material)) return;
      const g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      const g = new THREE.BufferGeometry();
      const pos = g0.getAttribute("position");
      const nrm = g0.getAttribute("normal");
      if (!pos || !nrm) return;
      g.setAttribute("position", pos);
      g.setAttribute("normal", nrm);
      if (g0.getAttribute("uv")) g.setAttribute("uv", g0.getAttribute("uv"));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const list = groups.get(m.material as THREE.Material) ?? [];
      list.push(g);
      groups.set(m.material as THREE.Material, list);
      victims.push(m);
    });
    if (victims.length < 2) continue;
    for (const v of victims) v.parent?.remove(v);
    for (const [mat, list] of groups) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = "merged_turret";
      mesh.castShadow = false;
      mount.add(mesh);
    }
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
  const thrusters: THREE.Object3D[] = [];
  view.flames.forEach((flame, i) => {
    const n = node(i === 0 ? "thruster_L" : "thruster_R");
    if (!n) return;
    thrusters.push(n);
    n.add(flame);
    flame.position.set(0, 0, -0.37);
  });
  view.thrusters = thrusters;
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

  const hemi = new THREE.HemisphereLight(0x2e4460, 0x14110e, 0.9);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xc5d4ea, 1.35);
  moon.position.set(-30, 48, 18);
  scene.add(moon);
  const fill = new THREE.DirectionalLight(0xffc9a0, 0.22);
  fill.position.set(20, 12, -10);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 700);
  let snapCam = false;
  const camPos = new THREE.Vector3(0, 4, 12);
  const projA = new THREE.Vector3();
  const projB = new THREE.Vector3();
  const lookPos = new THREE.Vector3();
  let attract = 0;

  const hull = hullGeometry();
  const carLod: "phone" | "hero" = coarse ? "phone" : "hero";
  const carInfo: CarInfo = { source: "loading", car: "model3", lod: carLod, url: "", wheels: 4, nodes: [], missing: [] };
  const carModels: Partial<Record<CarId, THREE.Object3D>> = {};
  const carFailed: Partial<Record<CarId, string>> = {};
  let carId: CarId = "model3";
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
    if ((views[0] as (CarView & { carId?: string }) | undefined)?.carId !== id) {
      carInfo.source = "loading";
      carInfo.file = undefined;
    }
    carInfo.car = id;
    loadCar(id);
  }
  loadCar("model3");
  const views: CarView[] = [];

  const seaMat = new THREE.MeshStandardMaterial({ color: 0x0b1420, metalness: 0.72, roughness: 0.22 });
  let seaY = -1.6;
  const sea = new THREE.Mesh(new THREE.CircleGeometry(900, 48), seaMat);
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
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, toneMapped: false }),
  );
  scene.add(shots);
  // enemy rounds: unlit streak so incoming fire reads at night without bloom
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xff5a32, toneMapped: false });
  const boltMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), boltMat, 96);
  boltMesh.renderOrder = 3;
  // player bolts: unlit capsule (lines are 1 px and vanish on a phone at night)
  const playerBoltGeo = new THREE.CylinderGeometry(0.11, 0.07, 1.15, 6);
  playerBoltGeo.rotateX(Math.PI / 2);
  const playerBoltMesh = new THREE.InstancedMesh(
    playerBoltGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, toneMapped: false }),
    96,
  );
  playerBoltMesh.frustumCulled = false;
  playerBoltMesh.renderOrder = 3;
  playerBoltMesh.count = 0;
  scene.add(playerBoltMesh);
  const rocketMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.9, 8).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffc56a, toneMapped: false }),
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
  const mineGeo = new THREE.CylinderGeometry(0.78, 0.62, 0.32, 12);
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
      new THREE.MeshBasicMaterial({ color: 0xffb03a, toneMapped: false }),
    );
    m.renderOrder = 2;
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
  /** desktop Night City dressing window (chunks ahead of the hero's chunk); the phone window is c-1..c+3 */
  const CITY_AHEAD_DESKTOP = 5;
  /** desktop: chunks further ahead than this draw without CITY_DETAIL (props, awnings, parapets, facade trim); past ~120 m the fog hides >55%, ~80-120 m about 30-55% */
  const CITY_DETAIL_AHEAD = 2;
  const POOL = BEHIND + AHEAD + 1;
  const BLD_PER = 4;
  const roadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  // Single-file HTML inlines the atlas on window.__NF_GLB. A path fetch from file:// is a CORS error and the road stays untextured.
  const roadMap = new THREE.TextureLoader().load(inlineGlb("road_kit_atlas.png") ?? `${import.meta.env.BASE_URL}assets/v02/kit/road_kit_atlas.png`);
  roadMap.colorSpace = THREE.SRGBColorSpace;
  roadMap.flipY = false;
  roadMap.wrapS = THREE.ClampToEdgeWrapping;
  roadMap.wrapT = THREE.ClampToEdgeWrapping;
  roadMat.map = roadMap;
  roughHook(roadMat);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.8, metalness: 0.2 });
  const markMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  /** city: the stage scenery group (Night City GLB kit or Coast Road kit). roof/spin/wash are Coast Road extras. */
  type Chunk = {
    index: number; road: THREE.Mesh; walls: THREE.Mesh; marks: THREE.Mesh; city: THREE.Group; built: boolean; lamp: THREE.Mesh | null;
    roof: THREE.Group | null; spin: THREE.Group | null; wash: THREE.Group[]; crown: CoastCrown[];
    /** Pine Woods: this chunk's pine placements (world matrices) for the shared stand InstancedMeshes */
    pines: { b: boolean; m: THREE.Matrix4 }[];
    patches: { m: THREE.Matrix4; tone: number; kind?: number }[];
  };
  const chunks: Chunk[] = [];
  /** Pine Woods: near A, near B, lod_far A, lod_far B stands (world-level InstancedMeshes) and the logging truck pool */
  const pineStands: THREE.InstancedMesh[] = [];
  /** Pine Woods forest-floor patches: one InstancedMesh (one draw) on the kit atlas, rebuilt per frame like the stands */
  let floorPatchMesh: THREE.InstancedMesh | null = null;
  /** Open Highway: desert floor patches: one InstancedMesh (one draw), rebuilt per frame from the live chunks' patch lists */
  let desertPatchMesh: THREE.InstancedMesh | null = null;
  let far: { group: THREE.Group; rotors: THREE.Object3D[] } | null = null;
  let farTrack: unknown = null;
  /** openhighway-v2: scrub tufts / rocks (one InstancedMesh each), horizon haze band, BN-18 cut boxes (road gap, riverbed floor) */
  let scrubMesh: THREE.InstancedMesh | null = null;
  let rockMesh: THREE.InstancedMesh | null = null;
  let haze: THREE.Mesh | null = null;
  const gapCut = { box: { value: new THREE.Vector4(0, 0, 0, 1) }, half: { value: new THREE.Vector2(0, 0) } };
  const bedCut = { box: { value: new THREE.Vector4(0, 0, 0, 1) }, half: { value: new THREE.Vector2(0, 0) } };
  let hwFloorMat: THREE.MeshStandardMaterial | null = null;
  const hwRoadMats = new Map<string, THREE.MeshStandardMaterial>();
  const trucks: THREE.Group[] = [];
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
    chunks.push({ index: -1, road: mk(roadMat), walls: mk(wallMat), marks: mk(markMat), city, built: false, lamp: null, roof: null, spin: null, wash: [], crown: [], pines: [], patches: [] });
  }
  loadRoadKit();
  // kit road + lane paint, bent along the track per chunk and merged into ONE mesh per material (coast seam fix: was a
  // rigid InstancedMesh tile at each chunk midpoint, with the 0.05 m ribbon on bends > 4 deg / ramps). Same draws.
  type KitRoad = { mesh: THREE.Mesh; base: THREE.BufferGeometry; sliced: Map<number, THREE.BufferGeometry>; cache: Map<number, { p: Float32Array; n: Float32Array; uv: Float32Array }>; track: unknown };
  let kitRoads: KitRoad[] | null = null;
  let kitKey = "";
  // ---------------------------------------------------------------- stages: city keeps the GLB kit; every other id uses Classic procedural buildings plus its own sky/fog
  let stage: StageId = "city";
  let gateBoost = 0;
  /** Stages dressed by a GLB kit (Night City, Coast Road, Pine Woods). Every other id keeps the procedural skyline. */
  const scenic = () => stage === "city" || stage === "coast" || stage === "woods" || stage === "highway";
  const sceneryReady = () => (stage === "coast" ? coastReady() : stage === "woods" ? woodsReady() : stage === "highway" ? highwayReady() : cityReady());
  function releaseScenery(ch: Chunk) {
    ch.lamp = null;
    ch.roof = null;
    ch.spin = null;
    ch.wash = [];
    ch.crown = [];
    ch.pines = [];
    ch.patches = [];
    for (const c of [...ch.city.children]) {
      ch.city.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        if (m.material instanceof THREE.MeshBasicMaterial) m.material.dispose();
      });
    }
  }
  function applyStage() {
    const st = STAGES.find((x) => x.id === stage) ?? STAGES[0];
    (scene.background as THREE.Color).setHex(st.sky);
    (scene.fog as THREE.FogExp2).color.setHex(st.sky);
    (scene.fog as THREE.FogExp2).density = st.fog;
    renderer.setClearColor(st.sky);
    // Coast Road: sunset fill so the rock arch and cliffs read; sea plane drops to the cliff-foot sea level (-12) in a
    // lit blue so the sea side is water, not a black void. Intensity/colour only: no new lights, no shader recompile.
    const coastLook = stage === "coast";
    hemi.intensity = coastLook ? 1.6 : 0.9;
    fill.intensity = coastLook ? 0.9 : 0.22;
    seaMat.color.setHex(coastLook ? 0x1d4d6b : 0x0b1420);
    // Coast: rougher, less metallic sea so the moon glint is a soft wide sheen, not a hot blob
    seaMat.metalness = coastLook ? 0.2 : 0.72;
    seaMat.roughness = coastLook ? 0.72 : 0.22;
    seaY = coastLook ? -12.4 : -1.6; // just under the -12 cliff water tiles (no z-fight)
    // Pine Woods: the plane is the forest floor (matte dark green) just under the road at y 0, so ground-level dress
    // stands on it and the PW-5 river tiles (y -0.03) read under the covered bridge. Colour / height only.
    // every stage but Pine Woods: the shared night rig as built (hemi / moon colours + moon strength)
    hemi.color.setHex(0x2e4460);
    hemi.groundColor.setHex(0x14110e);
    moon.color.setHex(0xc5d4ea);
    moon.intensity = 1.35;
    if (stage === "woods") {
      // pw-look: moonlit forest. Brighter blue-grey sky / olive bounce hemisphere and a stronger cool moon so the pine
      // crowns read green with lit edges; the lighter fog / sky colour (STAGES) lets the stands layer instead of
      // going black. Same lights (no new light, no program change), Pine Woods only.
      hemi.color.setHex(WOODS_LOOK.hemiSky);
      hemi.groundColor.setHex(WOODS_LOOK.hemiGround);
      hemi.intensity = WOODS_LOOK.hemi;
      moon.color.setHex(WOODS_LOOK.moonColor);
      moon.intensity = WOODS_LOOK.moon;
      fill.intensity = WOODS_LOOK.fill;
      // pinewoods-v2 floor lift (0x333d29), pw-look: stronger needle-bed tint so the floor reads on a phone
      seaMat.color.setHex(WOODS_LOOK.floor);
      seaMat.metalness = 0;
      seaMat.roughness = 1;
      seaY = -0.08;
    }
    if (stage === "highway") {
      // openhighway-v1: night desert. The plane is the desert floor (matte sand) just under the road; brighter hemi /
      // moon so the open terrain, cacti and the far mesas read under the long 0.004 fog. Open Highway only.
      hemi.color.setHex(HIGHWAY_LOOK.hemiSky);
      hemi.groundColor.setHex(HIGHWAY_LOOK.hemiGround);
      hemi.intensity = HIGHWAY_LOOK.hemi;
      moon.color.setHex(HIGHWAY_LOOK.moonColor);
      moon.intensity = HIGHWAY_LOOK.moon;
      fill.intensity = HIGHWAY_LOOK.fill;
      hwFloorMat ??= cutMaterial(seaMat, "highway_floor", bedCut);
      hwFloorMat.color.setHex(HIGHWAY_LOOK.floor);
      hwFloorMat.metalness = 0;
      hwFloorMat.roughness = 1;
      seaY = -0.08;
    }
    // Open Highway's floor is its own clone (the riverbed is cut out of it); every other stage keeps seaMat
    sea.material = stage === "highway" && hwFloorMat ? hwFloorMat : seaMat;
    // Open Highway: the floor is the lowest surface, drawn right after the haze band without writing depth, so the mesa
    // backdrop (drawn next) shows over its fogged far reach and every prop / road piece still draws over both
    if (hwFloorMat) hwFloorMat.depthWrite = false;
    sea.renderOrder = stage === "highway" ? -90 : 0;
    if (haze) haze.visible = false;
    sea.position.y = seaY;
    buildings.visible = !scenic();
    applyRoadLook();
    for (const ch of chunks) {
      ch.built = false;
      ch.city.visible = scenic();
      // leaving/entering a stage: release this chunk's merged scenery meshes (geometry + gate lamp materials)
      releaseScenery(ch);
    }
    if (stage === "city") loadCity();
    if (stage === "coast") loadCoast();
    if (stage === "woods") loadWoods();
    if (stage === "highway") loadHighway();
    if (desertPatchMesh) desertPatchMesh.count = 0;
    if (scrubMesh) scrubMesh.count = 0;
    if (rockMesh) rockMesh.count = 0;
    if (far) far.group.visible = false;
    farTrack = null;
    for (const t of trucks) t.visible = false;
    for (const m of pineStands) m.count = 0;
    if (floorPatchMesh) floorPatchMesh.count = 0;
  }
  function cityChunk(ch: Chunk, sim: Sim) {
    if (!scenic() || ch.index < 0 || ch.built || !sceneryReady()) return;
    const i0 = ch.index * SEG;
    const o = sampleAt(sim.track, i0);
    if (stage === "coast") {
      releaseScenery(ch);
      const at = (k: number) => sampleAt(sim.track, i0 + k);
      const ramps = sim.track.pieces.filter((p) => p.kind === "ramp").map((p) => p.s);
      const cc = chunkCourse("coast", i0 * STEP, CHUNK, STEP, (k) => Math.abs(at(k).y) < 0.05, ramps);
      const out = buildCoastChunk(ch.city, ch.index, at, SEG, sim.track.width / 2, o.x, o.z, (n) => hash(n), cc);
      ch.roof = out.roof;
      ch.spin = out.spin;
      ch.wash = out.wash;
      ch.crown = out.crown;
      ch.city.position.set(o.x, 0, o.z);
      ch.built = true;
      return;
    }
    if (stage === "highway") {
      releaseScenery(ch);
      const at = (k: number) => sampleAt(sim.track, i0 + k);
      const ramps = sim.track.pieces.filter((p) => p.kind === "ramp").map((p) => p.s);
      const cc = chunkCourse("highway", i0 * STEP, CHUNK, STEP, (k) => Math.abs(at(k).y) < 0.05, ramps);
      const out = buildHighwayChunk(ch.city, ch.index, at, SEG, o.x, o.z, cc);
      ch.patches = out.patches;
      ch.city.position.set(o.x, 0, o.z);
      ch.built = true;
      return;
    }
    if (stage === "woods") {
      releaseScenery(ch);
      const at = (k: number) => sampleAt(sim.track, i0 + k);
      const ramps = sim.track.pieces.filter((p) => p.kind === "ramp").map((p) => p.s);
      const cc = chunkCourse("woods", i0 * STEP, CHUNK, STEP, (k) => Math.abs(at(k).y) < 0.05, ramps);
      const out = buildWoodsChunk(ch.city, ch.index, at, SEG, o.x, o.z, cc);
      ch.roof = out.roof;
      ch.pines = out.pines;
      ch.patches = out.patches;
      ch.city.position.set(o.x, 0, o.z);
      ch.built = true;
      return;
    }
        ch.lamp = buildCityChunk(ch.city, ch.index, (k) => sampleAt(sim.track, i0 + k), SEG, sim.track.width / 2, o.x, o.z, (n) => hash(n), sim.track.courseId === "city", coarse);
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
    const ru: number[] = [];
    for (let k = 0; k <= SEG; k++) {
      const s = sampleAt(track, i0 + k);
      rp.push(s.x - s.rx * half - ox, s.y + 0.05, s.z - s.rz * half - oz, s.x + s.rx * half - ox, s.y + 0.05, s.z + s.rz * half - oz);
      const v = ((index * CHUNK + k * STEP) / 10) % 1 * 0.5;
      ru.push(0, v, 1, v);
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
    ch.road.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(ru, 2));
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
    // Phone keeps the road stream and drops city dressing outside a short window. Desktop dresses up to CITY_AHEAD_DESKTOP
    // chunks ahead: past ~200 m the Night City fog (exp2 0.0075) hides ~90% of a chunk, so the last streamed chunks only cost
    // triangles (props v4 trim: offsets the v4 prop tris on desktop). The road itself still streams AHEAD.
    const cityLo = coarse ? Math.max(0, c - 1) : lo;
    // (Night City only: the trim is sized to the NC fog; Coast Road's lighter sea fog keeps its full desktop stream so the
    // coastline / lighthouse do not pop in, and its tri budget already fits with car LOD)
    // (Pine Woods: exp2 0.012 fog leaves ~2.5% at 160 m, so desktop dresses to c+4 and the pine stands end at 160 m)
    // (Open Highway, openhighway-v2: the 0.004 desert fog is the longest sightline, so phone dresses to c+5 (~240 m) instead
    // of c+3 (props popped in at ~160 m); scatter grows in over its last 50 m)
    const cityHi = coarse ? (stage === "highway" ? Math.min(hi, c + 5) : c + 3) : stage === "coast" ? hi : stage === "woods" ? Math.min(hi, c + WOODS_AHEAD_DESKTOP) : Math.min(hi, c + CITY_AHEAD_DESKTOP);
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
    let cityBudget = 1;
    for (const ch of chunks) {
      if (ch.index !== -1) {
        if (scenic() && (ch.index < cityLo || ch.index > cityHi)) continue;
        if (!cityBudget && scenic() && !ch.built) continue;
        if (!cityBudget) continue;
        if (scenic() && !ch.built && sceneryReady()) cityBudget = 0;
        cityChunk(ch, sim);
        continue;
      }
      ch.road.visible = ch.walls.visible = ch.marks.visible = false;
      ch.city.visible = false;
    }
    placeKitRoads(sim);
    if (stage === "coast") coastFrame(sim);
    if (stage === "woods") woodsFrame(sim, cityLo, cityHi);
    if (stage === "highway") highwayFrame(sim, cityLo, cityHi);
    if (scenic()) {
      const now = performance.now() / 1000;
      for (const ch of chunks) {
        if (ch.index < 0) continue;
        ch.city.visible = ch.index >= cityLo && ch.index <= cityHi;
        // desktop: chunks past CITY_DETAIL_AHEAD draw only their core range (no CITY_DETAIL props/trim); phone unchanged
        if (!coarse && ch.built) cityDetailRange(ch.city, ch.index <= c + CITY_DETAIL_AHEAD);
        // Pine Woods far trim (both platforms): ferns / stumps / slash / sawdust only within ~120 m (chunk c+2)
        else if ((stage === "woods" || stage === "highway") && ch.built) cityDetailRange(ch.city, ch.index <= c + CITY_DETAIL_AHEAD);
        if (!ch.lamp) continue;
        const col = gateColor(now + ch.index);
        ch.lamp.parent?.children.forEach((l) => ((l as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(col));
        // boost gate: pass the sign_fork pair while green for a short speed boost (visual stage feature)
        const gs = ch.index * CHUNK + CHUNK / 2;
        const hero = sim.cars[0];
        if (!courseFor(sim.stageId) && sim.phase === "playing" && hero.alive && hero.along > gs && hero.along - gs < 3 && gateBoost <= 0 && col === 0x33ff66) {
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

  /** Coast Road per frame: foam scroll, arch roof hidden while the chase cam is above it, lighthouse beam, wash telegraph. */
  // ---------------------------------------------------------------- Pine Woods: pine stands, bridge roof, fog hollow, trucks
  // ---------------------------------------------------------------- Open Highway: desert floor patches, far backdrop
  const highwayStat = { patches: 0, far: false, rotors: 0, mesas: [] as number[][], cam: [] as number[], gapCut: false, bedCut: false };
  const scatterM = new THREE.Matrix4();
  const scatterS = new THREE.Matrix4();
  function highwayFrame(sim: Sim, cityLo: number, cityHi: number) {
    if (!desertPatchMesh && highwayReady()) {
      const src = desertPatchGeometry();
      if (src) {
        desertPatchMesh = new THREE.InstancedMesh(src.geo, src.mat, DESERT_PATCH.cap);
        desertPatchMesh.name = "highway_desert_patches";
        desertPatchMesh.count = 0;
        desertPatchMesh.frustumCulled = false;
        desertPatchMesh.setColorAt(0, new THREE.Color(1, 1, 1));
        scene.add(desertPatchMesh);
      }
    }
    if (!scrubMesh && highwayReady()) {
      const src = getPiece("desert_scrub");
      let geo: THREE.BufferGeometry | null = null, mat: THREE.Material | null = null;
      src?.traverse((o) => { const m = o as THREE.Mesh; if (!geo && m.isMesh) { geo = m.geometry; mat = m.material as THREE.Material; } });
      if (geo && mat) {
        scrubMesh = new THREE.InstancedMesh(geo, mat, DESERT_SCATTER.cap);
        scrubMesh.name = "highway_scrub";
        rockMesh = new THREE.InstancedMesh(rockGeometry(), rockMaterial(), DESERT_SCATTER.cap);
        rockMesh.name = "highway_rocks";
        for (const m of [scrubMesh, rockMesh]) { m.count = 0; m.frustumCulled = false; m.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(m); }
      }
    }
    if (!haze) { haze = hazeBand(); scene.add(haze); }
    haze.visible = true;
    haze.position.set(camera.position.x, 0, camera.position.z);
    const hero = sim.cars[0];
    if (scrubMesh && rockMesh) {
      // grow in over the last DESERT_SCATTER.fade metres instead of popping at the far edge
      const sm = [0, 0];
      const meshes = [scrubMesh, rockMesh];
      for (const ch of chunks) {
        if (ch.index < cityLo || ch.index > cityHi || !ch.built) continue;
        for (const p of ch.patches) {
          if (!p.kind) continue;
          const i = p.kind - 1;
          if (sm[i] >= DESERT_SCATTER.cap) continue;
          const e = p.m.elements;
          const d = Math.hypot(e[12] - hero.x, e[14] - hero.z);
          if (d > DESERT_SCATTER.far) continue;
          const g = Math.min(1, (DESERT_SCATTER.far - d) / DESERT_SCATTER.fade);
          scatterM.copy(p.m);
          if (g < 1) scatterM.multiply(scatterS.makeScale(g, g, g));
          meshes[i].setMatrixAt(sm[i], scatterM);
          meshes[i].setColorAt(sm[i]++, patchTone.setScalar(p.tone));
        }
      }
      meshes.forEach((m, i) => { m.count = sm[i]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }
    if (desertPatchMesh) {
      let n = 0;
      for (const ch of chunks) {
        if (ch.index < cityLo || ch.index > cityHi || !ch.built) continue;
        for (const p of ch.patches) {
          if (p.kind) continue;
          if (n >= DESERT_PATCH.cap) break;
          const e = p.m.elements;
          if (Math.hypot(e[12] - hero.x, e[14] - hero.z) > DESERT_PATCH.far) continue;
          desertPatchMesh.setMatrixAt(n, p.m);
          desertPatchMesh.setColorAt(n++, patchTone.setScalar(p.tone));
        }
      }
      desertPatchMesh.count = n;
      desertPatchMesh.instanceMatrix.needsUpdate = true;
      if (desertPatchMesh.instanceColor) desertPatchMesh.instanceColor.needsUpdate = true;
      highwayStat.patches = n;
    }
    // far backdrop: built once per race track (course s -> track pose, absolute world coords)
    if (highwayReady() && sim.race.armed && farTrack !== sim.track) {
      if (far) { scene.remove(far.group); far.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !far!.rotors.includes(m)) m.geometry.dispose(); }); }
      const origin = sim.race.originAlong;
      far = highwayFarGroup((s) => { const n = Math.round((origin + s) / STEP) - sim.track.first; return sim.track.samples[n] ?? null; });
      if (far) scene.add(far.group);
      farTrack = sim.track;
      // BN-18 cut boxes on this track: the snapped right deck (road) and the riverbed under the bridge (floor)
      const box = (sMid: number, lat: number, halfS: number, halfL: number, u: typeof gapCut) => {
        const p = sim.track.samples[Math.round((origin + sMid) / STEP) - sim.track.first];
        if (!p) { u.half.value.set(0, 0); return; }
        const tl = Math.hypot(p.tx, p.tz) || 1;
        u.box.value.set(p.x + p.rx * lat, p.z + p.rz * lat, p.tx / tl, p.tz / tl);
        u.half.value.set(halfS, halfL);
      };
      box((HIGHWAY_GAP.s0 + HIGHWAY_GAP.s1) / 2, 6.4, (HIGHWAY_GAP.s1 - HIGHWAY_GAP.s0) / 2, 6.1, gapCut);
      box((BRIDGE.s0 + BRIDGE.s1) / 2, 0, (BRIDGE.s1 - BRIDGE.s0) / 2, BRIDGE.half, bedCut);
    }
    if (far) {
      far.group.visible = sim.race.armed;
      const t = performance.now() / 1000;
      far.rotors.forEach((r, i) => (r.rotation.z = t * 0.35 + i * 0.7));
      highwayStat.far = far.group.visible;
      highwayStat.rotors = far.rotors.length;
      highwayStat.mesas = far.group.userData.mesas ?? [];
      highwayStat.gapCut = gapCut.half.value.x > 0;
      highwayStat.bedCut = bedCut.half.value.x > 0;
      highwayStat.cam = [camera.position.x, camera.position.y, camera.position.z, camera.fov, camera.far];
    }
  }
  const WOODS_AHEAD_DESKTOP = 4;
  /** near A, near B, lod_far A, lod_far B: one draw each, rebuilt every frame from the live chunks' pine lists */
  const PINE_CAP = 512;
  function ensurePineStands() {
    if (pineStands.length || !woodsReady()) return;
    for (const [name, far] of [["woods_pine_a", false], ["woods_pine_b", false], ["woods_pine_a", true], ["woods_pine_b", true]] as const) {
      const src = woodsPineGeometry(name, far);
      if (!src) continue;
      const inst = new THREE.InstancedMesh(src.geo, src.mat, PINE_CAP);
      inst.name = `${name}${far ? "_lod_far" : ""}`;
      inst.count = 0;
      inst.frustumCulled = false;
      scene.add(inst);
      pineStands.push(inst);
    }
  }
  function ensureFloorPatches() {
    if (floorPatchMesh || !woodsReady()) return;
    const src = floorPatchGeometry();
    if (!src) return;
    floorPatchMesh = new THREE.InstancedMesh(src.geo, src.mat, FLOOR_PATCH.cap);
    floorPatchMesh.name = "woods_floor_patches";
    floorPatchMesh.count = 0;
    floorPatchMesh.frustumCulled = false;
    floorPatchMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(floorPatchMesh);
  }
  const patchTone = new THREE.Color();
  function ensureTrucks() {
    if (trucks.length || !woodsReady()) return;
    for (let i = 0; i < TRUCK.maxAlive; i++) {
      const g = makeTruckMesh();
      if (!g) return;
      g.visible = false;
      scene.add(g);
      trucks.push(g);
    }
  }
  /** debug / smoke: what the woods frame drew last */
  const woodsStat = { near: 0, far: 0, roofHidden: false, trucks: 0, fog: 0, patches: 0 };
  function woodsFrame(sim: Sim, cityLo: number, cityHi: number) {
    ensurePineStands();
    ensureFloorPatches();
    ensureTrucks();
    const hero = sim.cars[0];
    const heroS = hero.along - sim.race.originAlong;
    // pine LOD: near mesh inside 120 m, lod_far 120-160 m, nothing past 160 m (fog ~97%)
    const counts = [0, 0, 0, 0];
    if (pineStands.length === 4) {
      for (const ch of chunks) {
        if (ch.index < cityLo || ch.index > cityHi || !ch.built) continue;
        for (const p of ch.pines) {
          const e = p.m.elements;
          const d = Math.hypot(e[12] - hero.x, e[14] - hero.z);
          if (d > PINE_LOD.far) continue;
          const k = (d > PINE_LOD.near ? 2 : 0) + (p.b ? 1 : 0);
          if (counts[k] >= PINE_CAP) continue;
          pineStands[k].setMatrixAt(counts[k]++, p.m);
        }
      }
      pineStands.forEach((m, k) => {
        m.count = counts[k];
        m.instanceMatrix.needsUpdate = true;
      });
    }
    if (floorPatchMesh) {
      let n = 0;
      for (const ch of chunks) {
        if (ch.index < cityLo || ch.index > cityHi || !ch.built) continue;
        for (const p of ch.patches) {
          const e = p.m.elements;
          if (n >= FLOOR_PATCH.cap || Math.hypot(e[12] - hero.x, e[14] - hero.z) > FLOOR_PATCH.far) continue;
          floorPatchMesh.setMatrixAt(n, p.m);
          floorPatchMesh.setColorAt(n++, patchTone.setScalar(p.tone));
        }
      }
      floorPatchMesh.count = n;
      floorPatchMesh.instanceMatrix.needsUpdate = true;
      if (floorPatchMesh.instanceColor) floorPatchMesh.instanceColor.needsUpdate = true;
    }
    woodsStat.patches = floorPatchMesh?.count ?? 0;
    woodsStat.near = counts[0] + counts[1];
    woodsStat.far = counts[2] + counts[3];
    // covered bridge: tunnel_roof + portal_crown hidden while the chase cam or the hero is under the bridge
    const camS = heroS - Math.hypot(camera.position.x - hero.x, camera.position.z - hero.z);
    const under = sim.race.armed && heroS >= BRIDGE_HIDE[0] && camS <= BRIDGE_HIDE[1];
    woodsStat.roofHidden = under;
    for (const ch of chunks) if (ch.roof) ch.roof.visible = !under;
    // BN-20 fog hollow (PW-6): 0.012 -> 0.016
    const fog = sim.race.armed ? woodsFog(heroS) : 0.012;
    (scene.fog as THREE.FogExp2).density = fog;
    woodsStat.fog = fog;
    // BN-17 logging trucks (sim.trucks): pose on the course, cab +Z forward
    let n = 0;
    for (const t of sim.trucks) {
      if (!t.alive || n >= trucks.length) continue;
      const g = trucks[n++];
      const p = poseAt(sim.track, sim.race.originAlong + t.s);
      g.position.set(p.x + p.rx * t.lat, p.y, p.z + p.rz * t.lat);
      g.rotation.set(0, Math.atan2(p.tx, p.tz), 0);
      g.visible = true;
    }
    for (let i = n; i < trucks.length; i++) trucks[i].visible = false;
    woodsStat.trucks = n;
  }

  let beamYaw = 0;
  function coastFrame(sim: Sim) {
    const now = performance.now() / 1000;
    foamClock.value = now;
    beamYaw = (now * 0.6) % (Math.PI * 2);
    const washes = washFor("coast");
    const heroS = sim.cars[0].along - sim.race.originAlong;
    for (const ch of chunks) {
      if (ch.index < 0 || !ch.built) continue;
      if (ch.roof) ch.roof.visible = camera.position.y <= (ch.roof.userData.roofY as number);
      if (ch.spin) ch.spin.children.forEach((m) => (m.rotation.y = beamYaw));
      for (const c of ch.crown) {
        const d = heroS - c.s;
        c.mesh.geometry.setDrawRange(0, d > CROWN_CUT[0] && d < CROWN_CUT[1] ? c.keep : Infinity);
      }
      for (const g of ch.wash) {
        const w = washes.find((x) => x.id === g.userData.wash);
        g.visible = !!w && washPhase(w, sim.time) !== "off";
      }
    }
  }

  /** a chunk takes the kit road unless the track has a bridge gap in it (the ribbon skips gap segments) */
  function chunkTileFit(sim: Sim, index: number) {
    const track = sim.track;
    for (let k = 0; k <= SEG; k++) if (sampleAt(track, index * SEG + k).gap) return roadTilesFit(!!track.authored, 0, 0, true);
    return true;
  }

  function ensureKitRoads() {
    if (kitRoads || !roadKitReady()) return;
    const list: KitRoad[] = [];
    for (const name of ["road_straight_40", "lanepaint_straight_40"] as const) {
      const src = getPiece(name);
      if (!src) continue;
      src.updateMatrixWorld(true);
      src.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g0 = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        const g1 = new THREE.BufferGeometry();
        for (const a of ["position", "normal", "uv"]) if (g0.getAttribute(a)) g1.setAttribute(a, g0.getAttribute(a));
        if (!g1.getAttribute("uv") || !g1.getAttribute("normal")) return;
        g1.applyMatrix4(mesh.matrixWorld);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) roughHook(mat);
        // capacity: every chunk at the finest slicing; chunks take the coarsest slicing their bend allows (bendStep)
        const nv = sliceZ(g1, BEND_STEP).getAttribute("position").count;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nv * 3 * POOL), 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nv * 3 * POOL), 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(nv * 2 * POOL), 2).setUsage(THREE.DynamicDrawUsage));
        geo.setDrawRange(0, 0);
        const m = new THREE.Mesh(geo, mat);
        m.frustumCulled = false;
        m.name = `kitroad:${name}`;
        scene.add(m);
        list.push({ mesh: m, base: g1, sliced: new Map(), cache: new Map(), track: null });
      });
    }
    kitRoads = list;
    kitKey = "";
    applyRoadLook();
  }
  // Coast Road only: a damped clone of each road material (wet-asphalt puddles stay matte enough that the sky/env
  // reflection does not read as a white blob). Night City and every other stage keep the shared originals untouched.
  const coastRoadMats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  function coastRoadMat(base: THREE.MeshStandardMaterial) {
    let m = coastRoadMats.get(base);
    if (!m) {
      m = base.clone();
      m.name = `${base.name || "road"}@coast`;
      m.envMapIntensity = 0.55;
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = max( texture2D( map, vMapUv ).a, 0.72 );");
      };
      m.customProgramCacheKey = () => "nf_coast_road";
      coastRoadMats.set(base, m);
    }
    return m;
  }
  // Coast Road + Pine Woods: the lane-paint piece's centre double line (atlas magenta paint cell) and centre studs
  // (magenta glow cell) are recoloured to road yellow / amber in a per-stage clone of the paint materials. The road
  // surface, the white edge / lane lines and the red edge studs keep their texels. Night City keeps the shared originals.
  const paintMats = new Map<string, THREE.MeshStandardMaterial>();
  function yellowPaintMat(base: THREE.MeshStandardMaterial, coast: boolean) {
    const key = `${base.uuid}:${coast ? "coast" : "plain"}`;
    let m = paintMats.get(key);
    if (!m) {
      m = base.clone();
      m.name = `${base.name || "paint"}@yellow${coast ? "-coast" : ""}`;
      if (coast) m.envMapIntensity = 0.55;
      const rough = coast ? "max( texture2D( map, vMapUv ).a, 0.72 )" : "texture2D( map, vMapUv ).a";
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader
          .replace("void main() {", `${PAINT_GLSL}\nvoid main() {`)
          .replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = nfPaint( diffuseColor.rgb, NF_YELLOW );")
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance = nfPaint( totalEmissiveRadiance, NF_AMBER );")
          .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n roughnessFactor = ${rough};`);
      };
      m.customProgramCacheKey = () => `nf_yellow_paint_${coast ? "coast" : "plain"}`;
      paintMats.set(key, m);
    }
    return m;
  }
  // Open Highway: the kit road (and its yellow-centre paint) with the BN-18 gap cut out of the right deck. Own clones,
  // so the other stages' road programs are untouched.
  function highwayRoadMat(base: THREE.MeshStandardMaterial, paint: boolean) {
    const key = `${base.uuid}:${paint ? "paint" : "road"}`;
    let m = hwRoadMats.get(key);
    if (!m) {
      m = cutMaterial(base, paint ? `highway_paint_${base.name}` : `highway_road_${base.name}`, gapCut, paint ? (sh) => {
        sh.fragmentShader = sh.fragmentShader
          .replace("void main() {", `${PAINT_GLSL}\nvoid main() {`)
          .replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = nfPaint( diffuseColor.rgb, NF_YELLOW );")
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance = nfPaint( totalEmissiveRadiance, NF_AMBER );")
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = texture2D( map, vMapUv ).a;");
      } : undefined);
      hwRoadMats.set(key, m);
    }
    return m;
  }
  // Pine Woods (pw-coast-polish): the kit road's warm brown grime / oil streak along the right lane read as a bright dirt
  // patch under the woods moon (Sara, hosted phone shot). Pine Woods' own clone of the road surface: warm, dark texels
  // (brown grime, not the saturated red studs or white lines) are pulled toward neutral asphalt; the wet sheen (fog hollow) is kept.
  const woodsRoadMats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  function woodsRoadMat(base: THREE.MeshStandardMaterial) {
    let m = woodsRoadMats.get(base);
    if (!m) {
      m = base.clone();
      m.name = `${base.name || "road"}@woods`;
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <map_fragment>", `#include <map_fragment>
 { float nfW = diffuseColor.r - diffuseColor.b;
   float nfL = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
   float nfK = smoothstep( 0.015, 0.09, nfW ) * ( 1.0 - smoothstep( 0.28, 0.45, nfW ) ) * ( 1.0 - smoothstep( 0.35, 0.6, nfL ) );
   diffuseColor.rgb = mix( diffuseColor.rgb, vec3( nfL * 0.9 ) * vec3( 0.97, 0.99, 1.03 ), nfK * 0.85 ); }`)
          ;
      };
      m.customProgramCacheKey = () => "nf_woods_road";
      woodsRoadMats.set(base, m);
    }
    return m;
  }
  function applyRoadLook() {
    const on = stage === "coast";
    const yellow = stage === "coast" || stage === "woods" || stage === "highway";
    const swap = (mesh: THREE.Mesh) => {
      const base = (mesh.userData.baseMat ??= mesh.material) as THREE.MeshStandardMaterial;
      const paint = yellow && mesh.name === "kitroad:lanepaint_straight_40" && base.isMeshStandardMaterial && !!base.map;
      if (stage === "highway" && mesh.name.startsWith("kitroad:") && base.isMeshStandardMaterial) {
        mesh.material = highwayRoadMat(base, paint);
        return;
      }
      if (stage === "woods" && mesh.name === "kitroad:road_straight_40" && base.isMeshStandardMaterial && base.map) {
        mesh.material = woodsRoadMat(base);
        return;
      }
      mesh.material = paint ? yellowPaintMat(base, on) : on && base.isMeshStandardMaterial && base.map ? coastRoadMat(base) : base;
    };
    for (const k of kitRoads ?? []) swap(k.mesh);
    for (const ch of chunks) swap(ch.road);
  }

  function placeKitRoads(sim: Sim) {
    ensureKitRoads();
    if (!kitRoads) return;
    const idx: number[] = [];
    for (const ch of chunks) {
      if (ch.index < 0) continue;
      const fit = chunkTileFit(sim, ch.index);
      ch.road.visible = !fit;
      ch.marks.visible = !fit;
      if (fit) idx.push(ch.index);
    }
    idx.sort((a, b) => a - b);
    const key = idx.join(",");
    if (key === kitKey && kitRoads.every((k) => k.track === sim.track)) return;
    kitKey = key;
    for (const k of kitRoads) {
      const pos = k.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const nor = k.mesh.geometry.getAttribute("normal") as THREE.BufferAttribute;
      const uvs = k.mesh.geometry.getAttribute("uv") as THREE.BufferAttribute;
      if (k.track !== sim.track) { k.cache.clear(); k.track = sim.track; }
      for (const i of [...k.cache.keys()]) if (!idx.includes(i)) k.cache.delete(i);
      let at = 0;
      for (const i of idx) {
        let c = k.cache.get(i);
        if (!c) {
          const i0 = i * SEG;
          const frame = (z: number) => lerpPose((n) => sampleAt(sim.track, n), i0 + SEG / 2 + z / BEND_STEP, i0, i0 + SEG);
          const step = bendStep(frame);
          let src = k.sliced.get(step);
          if (!src) { src = sliceZ(k.base, step); k.sliced.set(step, src); }
          const g = src.clone();
          bendGeometry(g, frame, true);
          c = { p: g.getAttribute("position").array as Float32Array, n: g.getAttribute("normal").array as Float32Array, uv: g.getAttribute("uv").array as Float32Array };
          g.dispose();
          k.cache.set(i, c);
        }
        if ((at + c.p.length / 3) * 3 > pos.array.length) break;
        (pos.array as Float32Array).set(c.p, at * 3);
        (nor.array as Float32Array).set(c.n, at * 3);
        (uvs.array as Float32Array).set(c.uv, at * 2);
        at += c.p.length / 3;
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
      uvs.needsUpdate = true;
      k.mesh.geometry.setDrawRange(0, at);
    }
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
          if (coarse) phoneEnemyLod(g.scene);
          else mergeStatic(g.scene);
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

  // Desktop distant-car LOD: also load the phone enemy GLBs (same nodes/pivots/bbox/materials as the desktop GLBs,
  // ~half the tris). Rivals and enemies past CAR_LOD_FAR m from the hero draw these (the chase cam sits behind the hero,
  // so a car ahead is even further from the camera; one that far behind is behind the camera). Off on phone and with ?enemylod.
  // single file: only the phone enemy GLBs are inlined, so the "hero" enemy is already the phone mesh: nothing to switch
  const singleFilePhoneOnly = !!inlineGlb("rammer_phone") && !inlineGlb("rammer_hero");
  const carLodOn = !coarse && enemyLod === "hero" && lodParam !== "hero" && !singleFilePhoneOnly;
  const enemyModelsLo: Partial<Record<Kind, THREE.Object3D>> = {};
  if (carLodOn) {
    for (const kind of Object.keys(ENEMY_FILE) as Exclude<Kind, "hero">[]) {
      new GLTFLoader().load(
        enemyUrl(kind, "phone"),
        (g) => {
          mergeStatic(g.scene); // desktop merge (not phoneEnemyLod): keeps trim/rim/lamp/tire materials as on the desktop GLB
          enemyModelsLo[kind] = g.scene;
        },
        undefined,
        () => {},
      );
    }
  }
  const carLodInfo = { on: carLodOn, far: CAR_LOD_FAR, views: [] as string[] };
  /** pick the desktop or phone GLB instance for a non-hero view (hysteresis in carLodFar); copies turret/rotor pose on a switch */
  function applyCarLod(view: CarView, kind: Kind, dist: number, hero: boolean) {
    const hi = view.inst?.[kind];
    if (!hi || !carLodOn || hero) {
      view.lodFar = false;
      return;
    }
    const far = carLodFar(!!view.lodFar, dist, hero, true);
    let lo = view.instLo?.[kind];
    if (far && !lo && enemyModelsLo[kind]) {
      try {
        view.instLo ??= {};
        lo = view.instLo[kind] = makeEnemyInst(view, kind, enemyModelsLo[kind]!);
      } catch {
        lo = undefined;
      }
    }
    const want = far && lo ? lo : hi;
    view.lodFar = want === lo && !!lo;
    if (view.active === want) return;
    const prev = view.active;
    for (const i of Object.values(view.instLo ?? {})) i!.root.visible = false;
    hi.root.visible = false;
    want.root.visible = true;
    if (prev) {
      if (prev.turret && want.turret) want.turret.rotation.copy(prev.turret.rotation);
      want.rotors.forEach((r, n) => prev.rotors[n] && r.rotation.copy(prev.rotors[n].rotation));
    }
    view.active = want;
    view.wheels = want.wheels;
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
    for (const i of Object.values(view.instLo ?? {})) i!.root.visible = false;
    view.lodFar = false;
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
      let tris = 0;
      inst.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      });
      const names: string[] = [];
      inst.traverse((o) => {
        if (o.name) names.push(o.name);
      });
      carInfo.missing = applyCarGlb(hv, inst);
      carInfo.nodes = names;
      carInfo.tris = Math.round(tris);
      carInfo.wheels = hv.wheels.length;
      carInfo.source = "glb";
      const u = carUrl(carId, carLod);
      carInfo.car = carId;
      carInfo.file = carFile(carId, carLod);
      carInfo.url = u.startsWith("data:") ? "inline:" + carInfo.file : u;
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
  type Rollout = { t: number; spawnS: number; rig: THREE.Object3D; ramp: THREE.Object3D | null; bay: THREE.Object3D | null; deck: THREE.Object3D | null; doorL: THREE.Object3D | null; doorR: THREE.Object3D | null; mixers: THREE.AnimationMixer[]; handed: boolean; robots: number; idle: boolean; wheels: THREE.Object3D[]; bayY: number; back: number; exitY: number | null; poseY: number | null };
  let roll: Rollout | null = null;
  const deckRay = new THREE.Raycaster();
  const deckFrom = new THREE.Vector3();
  const deckDown = new THREE.Vector3(0, -1, 0);
  const reticleV = new THREE.Vector3();
  const HAND = ROLL_HAND;
  const OUT0 = ROLL_OUT0;
  const OUT1 = ROLL_OUT1;
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
    roll = { bayY, t: 0, spawnS: sim.cars[0].along, rig, ramp: rig.getObjectByName("ramp") ?? null, bay: bayN ?? null, deck: rig.getObjectByName("trailer_body") ?? null, doorL: rig.getObjectByName("trailer_door_L") ?? null, doorR: rig.getObjectByName("trailer_door_R") ?? null, mixers, handed: false, robots, idle, wheels, back: rollRigBack(hasBoost(sim.carId)), exitY: null, poseY: null };
    return true;
  }
  function stopRollout() {
    if (roll) {
      for (const m of roll.mixers) {
        m.stopAllAction();
        m.uncacheRoot(m.getRoot());
      }
      // the rig/robots are clones sharing the loaded GLB geometry and materials: detach only (the source stays cached)
      scene.remove(roll.rig);
    }
    roll = null;
  }
  function skipRollout() {
    if (roll && !roll.handed) roll.t = HAND;
  }
  const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  function rigS(r: Rollout, t: number) {
    const stop = r.spawnS + r.back;
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
  function rollThrust(t: number) {
    return t >= OUT0 - 0.15 && t < OUT1 ? 1 : 0;
  }
  /** Height of the bay or ramp under (x,z), relative to roadY. Faces are double-sided for the probe. */
  function rampSurface(x: number, z: number, roadY: number): number | null {
    const r = roll;
    if (!r) return null;
    const roots: THREE.Object3D[] = [];
    if (r.deck) roots.push(r.deck);
    if (r.ramp) roots.push(r.ramp);
    if (!roots.length) return null;
    r.rig.updateMatrixWorld(true);
    deckFrom.set(x, roadY + 8, z);
    deckRay.set(deckFrom, deckDown);
    deckRay.far = 16;
    const hits: THREE.Intersection[] = [];
    for (const root of roots) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const prev = mats.map((mat) => mat.side);
        for (const mat of mats) mat.side = THREE.DoubleSide;
        mesh.raycast(deckRay, hits);
        mats.forEach((mat, i) => {
          mat.side = prev[i];
        });
      });
    }
    // Roof and walls are above the bay. Stand on the highest surface that is not over the deck.
    const ceil = roadY + r.bayY + 0.45;
    let best: THREE.Intersection | null = null;
    for (const h of hits) {
      if (h.point.y > ceil) continue;
      if (!best || h.point.y > best.point.y) best = h;
    }
    return best ? best.point.y - roadY : null;
  }
  function applyThrusterVfx(view: CarView, amount: number, allow: boolean, hero: boolean) {
    const lit = allow && amount > 0;
    view.flames.forEach((f, idx) => {
      const len = lit ? 0.7 + Math.sin(performance.now() * 0.03 + idx) * 0.15 : 0.02;
      f.scale.set(lit ? 1 : 0.15, len, lit ? 1 : 0.15);
      (f.material as THREE.MeshBasicMaterial).opacity = lit ? 0.85 : 0;
      f.visible = !hero || allow;
    });
    if (!hero) return;
    for (const n of view.thrusters) n.visible = allow;
    for (const n of view.nozzles) n.visible = allow;
  }
  /** Highest deck or ramp under the nose, the origin, and the tail. Null once the hull is past the lip. */
  function footprintSurface(sim: Sim, s: number): number | null {
    let best: number | null = null;
    for (const ds of [ROLL_NOSE, 0, -ROLL_NOSE]) {
      const q = poseAt(sim.track, s + ds);
      const h = rampSurface(q.x, q.z, q.y);
      if (h == null || !Number.isFinite(h)) continue;
      if (best == null || h > best) best = h;
    }
    return best;
  }
  function poseHeroInRollout(sim: Sim) {
    if (!roll || roll.handed || !views[0]) return;
    const r = roll;
    const t = r.t;
    const stop = r.spawnS + r.back;
    // Starts on bay_floor. Roadster keeps the 14.6 m hover. Other cars extend `back`
    // so the hull is past the ramp foot before the drop, and still finish on the sim spawn.
    const localZ = rollLocalZ(rollProgress(t), -r.back);
    const sNow = (t < 2.2 ? rigS(r, t) : stop) + localZ;
    const p = poseAt(sim.track, sNow);
    const allow = hasBoost(sim.carId);
    let y = r.bayY;
    if (allow) {
      if (t >= OUT1) {
        const d = Math.min(1, (t - OUT1) / (HAND - OUT1));
        y = rollRoadsterHeight(d, r.bayY);
      }
    } else {
      // On the collider until the lip is behind the hull, then a monotonic drop to the road.
      y = stepNonRoadsterRoll(t, r.bayY, t >= OUT0 ? footprintSurface(sim, sNow) : null, r);
    }
    const v = views[0];
    v.root.position.set(p.x, p.y + y, p.z);
    v.root.rotation.set(0, yawFromDir(p.tx, p.tz) + Math.PI, 0);
    v.shadow.position.set(p.x, p.y + 0.08, p.z);
    applyThrusterVfx(v, allow ? rollThrust(t) : 0, allow, true);
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
    const lit = !!roll && !roll.handed && hasBoost(carId) && rollThrust(roll.t) > 0;
    return roll ? { thrust: lit ? 1 : 0, bayY: roll.bayY, active: !roll.handed, t: roll.t, robots: roll.robots, idle: roll.idle } : { thrust: 0, bayY: 0, active: false, t: -1, robots: 0, idle: false };
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

  let lastSim: Sim | null = null;
  function sync(sim: Sim, dt: number, attractMode: boolean) {
    lastSim = sim;
    ensureViews(sim);
    attachCar();
    const hero = sim.cars[0];
    gateBoost -= dt;
    streamRoad(sim, hero.along);
    sea.position.set(hero.x, seaY, hero.z);
    const k = 1 - Math.exp(-4.2 * Math.max(0.0001, dt));

    for (let i = 0; i < views.length; i++) {
      const car = sim.cars[i];
      const view = views[i];
      if (!car.hero && (car.kind !== view.kind || view.kindSrc !== `${car.kind}:${enemyModels[car.kind] ? "glb" : "proc"}`)) {
        view.kind = car.kind;
        view.body.color.setHex(KIND_COLOR[car.kind]);
        useKind(view, car.kind);
      }
      if (!car.hero) view.body.color.setHex(car.racer ? RIVAL_TINT[(car.id - 1) % RIVAL_TINT.length] : KIND_COLOR[car.kind]);
      if (!car.hero) applyCarLod(view, car.kind, Math.hypot(car.x - hero.x, car.y - hero.y, car.z - hero.z), false);
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
      // RACE_RESPAWNS §3: a respawned race rival blinks with the hero's blink while invulnerable
      const blink = (car.hero || car.racer) && car.invuln > 0 && Math.floor(performance.now() / 90) % 2 === 0;
      view.root.visible = car.alive && car.y > -5 && !blink;
      view.shadow.visible = view.root.visible;
      if (!view.root.visible) continue;
      view.root.position.set(car.x, car.y, car.z);
      view.root.rotation.set(0, car.yaw + Math.PI, 0);
      const q = poseAt(sim.track, car.along);
      const pitch = car.grounded ? -Math.atan(q.slope) * 0.85 : clampPitch(car.vy);
      const targetSteer = car.hero ? readSteer(sim) : 0;
      view.steer += (targetSteer - view.steer) * k;
      // Model S track mode: cheap nose-down settle. Positive X pitches the +Z nose down.
      view.tilt.rotation.x = pitch + (car.hero && sim.trackOn ? 0.05 : 0);
      view.tilt.rotation.z = view.steer * 0.07;
      view.spin += car.speed * dt * 2.6;
      for (const w of view.wheels) {
        if (w.pivot.userData.front) w.pivot.rotation.y = view.steer * 0.28;
        w.spin.rotation.x = view.spin;
      }
      const allowThrust = car.hero && hasBoost(sim.carId);
      applyThrusterVfx(view, allowThrust ? car.thrust : 0, allowThrust, car.hero);
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
        shotCol[o + v * 3] = 1;
        shotCol[o + v * 3 + 1] = enemy ? 0.42 : 0.96;
        shotCol[o + v * 3 + 2] = enemy ? 0.22 : 0.55;
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
    let playerBolts = 0;
    for (const s of sim.shots) {
      if (!s.alive || s.rocket) continue;
      const vx = s.x - s.px;
      const vz = s.z - s.pz;
      boltDummy.position.set(s.x, s.y, s.z);
      if (s.owner === 0) {
        boltDummy.lookAt(s.x + (vx || s.vx), s.y, s.z + (vz || s.vz));
        boltDummy.scale.set(1.45, 1.45, 1.7);
        boltDummy.updateMatrix();
        playerBoltMesh.setMatrixAt(playerBolts++, boltDummy.matrix);
      } else {
        boltDummy.rotation.set(0, Math.atan2(vx, vz), 0);
        boltDummy.scale.set(1.7, 1.7, 4.4);
        boltDummy.updateMatrix();
        boltMesh.setMatrixAt(bolts++, boltDummy.matrix);
      }
    }
    boltMesh.count = bolts;
    boltMesh.instanceMatrix.needsUpdate = true;
    playerBoltMesh.count = playerBolts;
    playerBoltMesh.instanceMatrix.needsUpdate = true;
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
      mesh.position.set(m.x, m.y + 0.22, m.z);
      const armed = m.arm <= 0;
      const pulse = armed ? 1 + Math.sin(performance.now() * 0.012) * 0.12 : 1;
      mesh.scale.setScalar(pulse);
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(armed ? 0xff3a1c : 0xffb03a);
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
      const kk = snapCam ? 1 : k;
      snapCam = false;
      camPos.lerp(desired, kk);
      lookPos.lerp(look, kk);
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
    debugSnapCamera: () => { snapCam = true; },
    debugPick: (x: number, y: number) => {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(x, y), camera);
      const shown = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
      return ray.intersectObjects(scene.children, true).filter((h) => shown(h.object)).slice(0, 6).map((h) => {
        const m = (h.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
        return { mat: m?.name ?? "", map: !!m?.map, color: m?.color?.getHexString?.() ?? "", emissive: m?.emissive?.getHexString?.() ?? "", pieces: (h.object.userData.pieces as string[]) ?? [h.object.name], dist: Math.round(h.distance), at: [h.point.x, h.point.y, h.point.z].map((v) => Math.round(v * 10) / 10), n: h.face ? [h.face.normal.x, h.face.normal.y, h.face.normal.z].map((v) => Math.round(v * 100) / 100) : [] };
      });
    },
    carInfo: () => carInfo,
    setCar,
    rolloutSeek(t: number) {
      if (roll && !roll.handed) roll.t = t;
    },
    setStage(id: StageId) {
      if (id === stage) return;
      stage = id;
      applyStage();
    },
    stageInfo: () => ({ stage, cityChunks: chunks.filter((c) => c.built && c.city.children.length > 0).length, gates: chunks.filter((c) => c.built && c.lamp).length }),
    highwayInfo: () => ({ ...highwayStat }),
    woodsInfo: () => ({ ...woodsStat, stands: pineStands.length, truckPool: trucks.length, roofs: chunks.filter((c) => c.roof).length }),
    startRollout,
    skipRollout,
    stopRollout,
    sceneInfo: () => {
      let objects = 0;
      scene.traverse(() => objects++);
      return { objects, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    },
    rolloutState,
    drawInfo: () => ({ draws: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    projectPoint: (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: v.x, y: v.y, inside: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 };
    },
    aimReticle: (sim: Sim) => {
      const view = views[0];
      let x: number;
      let y: number;
      let z: number;
      let yaw: number;
      if (roll && !roll.handed && view) {
        x = view.root.position.x;
        y = view.root.position.y;
        z = view.root.position.z;
        yaw = view.root.rotation.y - Math.PI;
      } else {
        const h = sim.cars[0];
        x = h.x;
        y = h.y;
        z = h.z;
        yaw = h.yaw;
      }
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      // Past the nose (Cybertruck half-length ~2.85). Does not move the shot origin.
      reticleV.set(x + fx * 4.15, y + 0.9, z + fz * 4.15);
      reticleV.project(camera);
      return {
        x: reticleV.x,
        y: reticleV.y,
        inside: reticleV.z < 1 && Math.abs(reticleV.x) <= 1.05 && Math.abs(reticleV.y) <= 1.05,
      };
    },
    enemyInfo: () => ({
      ...enemyInfo,
      lod: enemyLod,
      shown: views.slice(1).map((v) => v.kindSrc ?? ""),
      // distant-car LOD per view: "<id>:<hero|near|far>:<distance to hero m>" (alive, visible cars only)
      carLod: {
        ...carLodInfo,
        loLoaded: Object.keys(enemyModelsLo).length,
        views: views.map((v, i) => {
          const c = lastSim?.cars[i];
          if (!c || !v.root.visible) return "";
          const h = lastSim!.cars[0];
          const d = Math.hypot(c.x - h.x, c.y - h.y, c.z - h.z);
          const lo = !!v.active && Object.values(v.instLo ?? {}).includes(v.active);
          return `${i}:${i === 0 ? (lo ? "hero-LOW" : "hero") : lo ? "far" : "near"}:${d.toFixed(1)}`;
        }).filter(Boolean),
      },
    }),
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
  if (!sim.keysOverride) {
    if (Math.abs(sim.touch.steer) > 0.02) steer += sim.touch.steer;
    else steer += sim.pad.steer;
  }
  return Math.max(-1, Math.min(1, steer));
}
