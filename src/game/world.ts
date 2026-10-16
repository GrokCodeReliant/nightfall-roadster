import * as THREE from "three";
import type { Kind, PickupKind, Sim } from "./sim";
import { ensureTrack, poseAt, sampleAt, STEP, type Piece } from "./road";

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
};

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
  glass.rotation.x = -0.62;
  tilt.add(glass);

  if (hero) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.04, 3.3),
      new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.4, metalness: 0.2 }),
    );
    stripe.position.set(0, 0.7, 0.35);
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
  tilt.add(tail);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff6e4,
    emissive: 0xfff1cc,
    emissiveIntensity: hero ? 2.2 : 1.1,
  });
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.06), lampMat);
    lamp.position.set(side * 0.48, 0.46, 2.18);
    tilt.add(lamp);
  }

  const copper = new THREE.MeshStandardMaterial({ color: 0xb5834a, metalness: 0.85, roughness: 0.32 });
  const flames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.26, 10), copper);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.42, 0.4, -2.18);
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
  tilt.add(cock);
  const suit = new THREE.MeshStandardMaterial({ color: hero ? 0x1a120c : 0x101114, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 3, 8), suit);
  torso.position.set(0, 0.98, -0.46);
  tilt.add(torso);
  const helm = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x0e0e10, metalness: 0.4, roughness: 0.35 }),
  );
  helm.position.set(0, 1.2, -0.4);
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
    tilt.add(wheel.pivot);
    return wheel;
  });

  if (hero) {
    const L = new THREE.SpotLight(0xfff3d4, 7, 48, 0.48, 0.6, 1.5);
    L.position.set(-0.4, 0.55, 1.7);
    L.target.position.set(-0.4, 0.15, 14);
    tilt.add(L, L.target);
    const R = new THREE.SpotLight(0xfff3d4, 7, 48, 0.48, 0.6, 1.5);
    R.position.set(0.4, 0.55, 1.7);
    R.target.position.set(0.4, 0.15, 14);
    tilt.add(R, R.target);
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
  type Chunk = { index: number; road: THREE.Mesh; walls: THREE.Mesh; marks: THREE.Mesh };
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
    chunks.push({ index: -1, road: mk(roadMat), walls: mk(wallMat), marks: mk(markMat) });
  }
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
      if (ch.index !== -1) continue;
      ch.road.visible = ch.walls.visible = ch.marks.visible = false;
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
    const hero = sim.cars[0];
    streamRoad(sim, hero.along);
    sea.position.set(hero.x, -1.6, hero.z);
    const k = 1 - Math.exp(-4.2 * Math.max(0.0001, dt));

    for (let i = 0; i < views.length; i++) {
      const car = sim.cars[i];
      const view = views[i];
      if (car.kind !== view.kind) {
        view.kind = car.kind;
        view.body.color.setHex(KIND_COLOR[car.kind]);
        if (view.turret) view.turret.visible = car.kind === "gunner";
        view.chassis.visible = car.kind !== "drone";
        for (const [k, g] of Object.entries(view.parts)) g!.visible = k === car.kind;
        const sc = KIND_SCALE[car.kind] ?? [1, 1, 1];
        view.root.scale.set(sc[0], sc[1], sc[2]);
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
        const covers = projA.z < projB.z && Math.abs(projA.x - projB.x) * camera.aspect < 0.22 && Math.abs(projA.y - projB.y) < 0.2;
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
    if (attractMode) {
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
  return { sync, resize, dispose, project, debugFade: () => views.map((v) => v.fade) };
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
