import * as THREE from "three";
import type { Sim } from "./sim";
import { poseAt, type Track } from "./track";

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
};

export type World = {
  sync: (sim: Sim, dt: number, attract: boolean) => void;
  resize: (w: number, h: number, dpr: number) => void;
  dispose: () => void;
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

  return { root, tilt, body, flames, wheels, shadow, steer: 0, spin: 0 };
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

function addSign(scene: THREE.Scene, track: Track, u: number, label: string) {
  const tex = signTexture(label);
  if (!tex) return;
  const p = poseAt(track, u * track.length);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 2.05),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  board.position.set(p.x, p.y + 3.3, p.z);
  board.lookAt(p.x + p.tx * 10, p.y + 3.1, p.z + p.tz * 10);
  scene.add(board);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 3.2, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x1a1c22, metalness: 0.4, roughness: 0.6 }),
    );
    post.position.set(p.x + p.rx * side * 3.6, p.y + 1.6, p.z + p.rz * side * 3.6);
    scene.add(post);
  }
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
  const shotPos = new Float32Array(48 * 2 * 3);
  shotGeo.setAttribute("position", new THREE.BufferAttribute(shotPos, 3));
  shotGeo.setDrawRange(0, 0);
  const shots = new THREE.LineSegments(
    shotGeo,
    new THREE.LineBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.9 }),
  );
  scene.add(shots);

  const mineMeshes: THREE.Mesh[] = [];
  const mineGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 10);
  for (let i = 0; i < 10; i++) {
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

  function buildTrackMeshes(sim: Sim) {
    if (trackReady) return;
    trackReady = true;
    const track = sim.track;
    const samples = track.samples;
    const n = samples.length;
    const half = track.width / 2;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      pos.push(s.x - s.rx * half, s.y + 0.05, s.z - s.rz * half);
      pos.push(s.x + s.rx * half, s.y + 0.05, s.z + s.rz * half);
    }
    for (let i = 0; i < n; i++) {
      const a = samples[i];
      const b = samples[(i + 1) % n];
      if (a.gap && b.gap) continue;
      const i0 = i * 2;
      const i1 = ((i + 1) % n) * 2;
      idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
    }
    const road = new THREE.BufferGeometry();
    road.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    road.setIndex(idx);
    road.computeVertexNormals();
    scene.add(
      new THREE.Mesh(
        road,
        new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.92, metalness: 0.05 }),
      ),
    );

    const wallPos: number[] = [];
    const wallIdx: number[] = [];
    const pushWall = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, h: number) => {
      const base = wallPos.length / 3;
      wallPos.push(ax, ay, az, bx, by, bz, ax, ay + h, az, bx, by + h, bz);
      wallIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    };
    for (let i = 0; i < n; i++) {
      const a = samples[i];
      const b = samples[(i + 1) % n];
      if (a.gap && b.gap) continue;
      const o = half + 0.35;
      pushWall(a.x - a.rx * o, a.y, a.z - a.rz * o, b.x - b.rx * o, b.y, b.z - b.rz * o, 0.72);
      pushWall(a.x + a.rx * o, a.y, a.z + a.rz * o, b.x + b.rx * o, b.y, b.z + b.rz * o, 0.72);
    }
    const walls = new THREE.BufferGeometry();
    walls.setAttribute("position", new THREE.Float32BufferAttribute(wallPos, 3));
    walls.setIndex(wallIdx);
    walls.computeVertexNormals();
    scene.add(
      new THREE.Mesh(
        walls,
        new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.8, metalness: 0.2 }),
      ),
    );

    const edgeCount = n * 2;
    const edge = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.18, 0.06, 1),
      new THREE.MeshStandardMaterial({ color: 0xc6a36a, emissive: 0x6a4a22, emissiveIntensity: 0.6, roughness: 0.45 }),
      edgeCount,
    );
    const dummy = new THREE.Object3D();
    let e = 0;
    for (let i = 0; i < n; i++) {
      const a = samples[i];
      const b = samples[(i + 1) % n];
      if (a.gap && b.gap) {
        dummy.scale.set(0.001, 0.001, 0.001);
        dummy.position.set(0, -20, 0);
        dummy.updateMatrix();
        edge.setMatrixAt(e++, dummy.matrix);
        edge.setMatrixAt(e++, dummy.matrix);
        continue;
      }
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      for (const side of [-1, 1]) {
        dummy.scale.set(1, 1, len);
        dummy.position.set(
          (a.x + b.x) / 2 + a.rx * side * (half - 0.28),
          (a.y + b.y) / 2 + 0.1,
          (a.z + b.z) / 2 + a.rz * side * (half - 0.28),
        );
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        edge.setMatrixAt(e++, dummy.matrix);
      }
    }
    edge.count = e;
    scene.add(edge);

    let dashes = 0;
    for (let i = 0; i < n; i += 4) dashes += 1;
    const dash = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.05, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xf4efe6, emissive: 0x888074, emissiveIntensity: 0.25, roughness: 0.5 }),
      dashes,
    );
    let di = 0;
    for (let i = 0; i < n; i += 4) {
      const a = samples[i];
      if (a.gap) continue;
      const b = samples[(i + 1) % n];
      dummy.scale.set(1, 1, 1);
      dummy.position.set(a.x, a.y + 0.1, a.z);
      dummy.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
      dummy.updateMatrix();
      dash.setMatrixAt(di++, dummy.matrix);
    }
    dash.count = di;
    scene.add(dash);

    const buildings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.9, metalness: 0.08 }),
      160,
    );
    const colors = new Float32Array(160 * 3);
    let bi = 0;
    for (let i = 0; i < n && bi < 160; i += 3) {
      const s = samples[i];
      for (const side of [-1, 1]) {
        if (bi >= 160) break;
        if (hash(i + side + 4) < 0.25) continue;
        const dist = 28 + hash(i * 3 + side) * 46;
        const h = 8 + hash(i + 9 + side) * 38;
        const w = 6 + hash(i + 2) * 10;
        const d = 6 + hash(i + 5) * 10;
        dummy.position.set(s.x + s.rx * side * dist, h * 0.5 - 1.5, s.z + s.rz * side * dist);
        dummy.scale.set(w, h, d);
        dummy.rotation.set(0, hash(i) * 0.4, 0);
        dummy.updateMatrix();
        buildings.setMatrixAt(bi, dummy.matrix);
        const lit = hash(i + side * 13) > 0.55;
        colors[bi * 3] = lit ? 0.45 : 0.07;
        colors[bi * 3 + 1] = lit ? 0.28 : 0.08;
        colors[bi * 3 + 2] = lit ? 0.16 : 0.1;
        bi += 1;
      }
    }
    buildings.count = bi;
    buildings.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    scene.add(buildings);

    addSign(scene, track, 0.012, "NIGHTFALL");
    addSign(scene, track, 0.118, "RAMP");
    addSign(scene, track, 0.385, "VOID  —  THRUST");
    addSign(scene, track, 0.6, "PITFALLS");

    const start = poseAt(track, track.length * 0.012);
    for (let k = 0; k < 10; k++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(track.width / 10 - 0.08, 0.04, 1.15),
        new THREE.MeshStandardMaterial({ color: k % 2 === 0 ? 0xf4efe6 : 0x111111, roughness: 0.55 }),
      );
      const across = (k + 0.5) / 10 - 0.5;
      stripe.position.set(start.x + start.rx * across * (track.width - 0.8), start.y + 0.1, start.z + start.rz * across * (track.width - 0.8));
      stripe.rotation.y = Math.atan2(start.tx, start.tz);
      scene.add(stripe);
    }

    for (let i = 0; i < 5; i++) {
      const view = buildCar(i === 0, hull);
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
    buildTrackMeshes(sim);
    const hero = sim.cars[0];
    const k = 1 - Math.exp(-4.2 * Math.max(0.0001, dt));

    for (let i = 0; i < views.length; i++) {
      const car = sim.cars[i];
      const view = views[i];
      view.root.visible = car.alive && car.y > -5;
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
      const thrust = car.thrust;
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
      count += 1;
    }
    shotGeo.setDrawRange(0, count * 2);
    attr.needsUpdate = true;

    for (let i = 0; i < mineMeshes.length; i++) {
      const m = sim.mines[i];
      const mesh = mineMeshes[i];
      mesh.visible = !!m?.alive;
      if (!m?.alive) continue;
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
      const dist = 9.6 + Math.min(1.1, Math.abs(hero.speed) * 0.018);
      const desired = new THREE.Vector3(hero.x - fx * dist, hero.y + 3.35, hero.z - fz * dist);
      const look = new THREE.Vector3(hero.x + fx * 8.5, hero.y + 0.85, hero.z + fz * 8.5);
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

  return { sync, resize, dispose };
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
