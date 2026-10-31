// Semi lip smoke: five non-Roadsters roll off rig_phone with the ramp lowered.
// The hull must not sink through the ramp, y must fall monotonically after OUT1,
// and the pose is on the road before handoff. Roadster keeps the old hover.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  hasBoost,
  ROLL_HAND,
  ROLL_NOSE,
  ROLL_OUT1,
  ROLL_SETTLE,
  rollLocalZ,
  rollProgress,
  rollRigBack,
  rollRoadsterHeight,
  stepNonRoadsterRoll,
  type RollPoseState,
} from "../../src/game/sim.ts";

type Node = {
  name?: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  mesh?: number;
  children?: number[];
};
type Gltf = {
  nodes: Node[];
  meshes: { primitives: { attributes: { POSITION?: number } }[] }[];
  accessors: { bufferView?: number; byteOffset?: number; count: number; componentType: number }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
  scenes: { nodes: number[] }[];
  scene?: number;
};

const ROOT = new URL("../../", import.meta.url);

function readGlb(rel: string): { json: Gltf; bin: Buffer } {
  const d = fs.readFileSync(new URL(rel, ROOT));
  let o = 12;
  let json: Gltf | null = null;
  let bin: Buffer | null = null;
  while (o < d.length) {
    const len = d.readUInt32LE(o);
    const type = d.readUInt32LE(o + 4);
    const chunk = d.subarray(o + 8, o + 8 + len);
    o += 8 + len;
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8")) as Gltf;
    else bin = chunk;
  }
  if (!json || !bin) throw new Error(rel);
  return { json, bin };
}

function mul(a: number[], b: number[]): number[] {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function trs(n: Node): number[] {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation ?? [0, 0, 0];
  const q = n.rotation ?? [0, 0, 0, 1];
  const s = n.scale ?? [1, 1, 1];
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  const [sx, sy, sz] = s;
  return [
    (1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0,
    (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0,
    (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function apply(m: number[], x: number, y: number, z: number) {
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12],
    y: m[1] * x + m[5] * y + m[9] * z + m[13],
    z: m[2] * x + m[6] * y + m[10] * z + m[14],
  };
}

function worldMats(json: Gltf): number[][] {
  const parent = new Array<number | null>(json.nodes.length).fill(null);
  for (let i = 0; i < json.nodes.length; i++) {
    for (const c of json.nodes[i].children ?? []) parent[c] = i;
  }
  const wm = new Array<number[]>(json.nodes.length);
  const world = (i: number): number[] => {
    if (wm[i]) return wm[i];
    const local = trs(json.nodes[i]);
    const p = parent[i];
    wm[i] = p == null ? local : mul(world(p), local);
    return wm[i];
  };
  for (let i = 0; i < json.nodes.length; i++) world(i);
  return wm;
}

function positions(json: Gltf, bin: Buffer, accessor: number): { x: number; y: number; z: number }[] {
  const a = json.accessors[accessor];
  if (a.componentType !== 5126) throw new Error(`accessor ${accessor} not float`);
  const view = json.bufferViews[a.bufferView ?? 0];
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = view.byteStride ?? 12;
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < a.count; i++) {
    out.push({
      x: bin.readFloatLE(start + i * stride),
      y: bin.readFloatLE(start + i * stride + 4),
      z: bin.readFloatLE(start + i * stride + 8),
    });
  }
  return out;
}

function meshVerts(json: Gltf, bin: Buffer, wm: number[][], accept: (name: string) => boolean) {
  const out: { x: number; y: number; z: number }[] = [];
  json.nodes.forEach((n, ni) => {
    if (n.mesh == null || !accept(n.name ?? "")) return;
    const m = wm[ni];
    for (const prim of json.meshes[n.mesh].primitives) {
      const ai = prim.attributes.POSITION;
      if (ai == null) continue;
      for (const p of positions(json, bin, ai)) out.push(apply(m, p.x, p.y, p.z));
    }
  });
  return out;
}

function bounds(rel: string) {
  const { json, bin } = readGlb(rel);
  const verts = meshVerts(json, bin, worldMats(json), () => true);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

const CARS = [
  ["model3", "spa/public/assets/v02/car/sedan_compact_hero.glb"],
  ["model_y", "spa/public/assets/v02/car/model_y_hero.glb"],
  ["model_x", "spa/public/assets/v02/car/model_x_hero.glb"],
  ["model_s", "spa/public/assets/v02/car/model_s_hero.glb"],
  ["cybertruck", "spa/public/assets/v02/car/cybertruck_hero.glb"],
] as const;

test("five non-Roadsters clear the lowered semi lip; Roadster hop is unchanged", () => {
  const rig = readGlb("spa/public/assets/v02/rig/rig_phone.glb");
  const ramp = rig.json.nodes.find((n) => n.name === "ramp");
  assert.ok(ramp);
  const theta = (-94 * Math.PI) / 180;
  ramp.rotation = [Math.sin(theta / 2), 0, 0, Math.cos(theta / 2)];
  const wm = worldMats(rig.json);
  const bay = rig.json.nodes.findIndex((n) => n.name === "bay_floor");
  const bayY = wm[bay][13];
  const bayZ = wm[bay][14];
  assert.ok(Math.abs(bayY - 1.205) < 0.01, `bayY ${bayY}`);
  assert.ok(Math.abs(bayZ + 10.95) < 0.02, `bayZ ${bayZ}`);

  const rampVerts = meshVerts(rig.json, rig.bin, wm, (name) => name === "ramp_mesh");
  assert.ok(rampVerts.length > 100);
  let foot = Infinity;
  let rampHi = -Infinity;
  for (const v of rampVerts) {
    if (v.z < foot) foot = v.z;
    if (v.y > rampHi) rampHi = v.y;
  }
  // Foot is still about a metre up — that lip is the bug, not a slope down to the road.
  assert.ok(foot < -15.7 && foot > -16.2, `foot ${foot}`);
  assert.ok(rampHi > 1 && rampHi < bayY + 0.15, `ramp top ${rampHi}`);

  const probe = (z: number): number | null => {
    let best: number | null = null;
    for (const ds of [ROLL_NOSE, 0, -ROLL_NOSE]) {
      const at = z + ds;
      for (const v of rampVerts) {
        if (Math.abs(v.z - at) > 0.35 || Math.abs(v.x) > 0.8) continue;
        if (best == null || v.y > best) best = v.y;
      }
    }
    return best;
  };

  for (const [id, file] of CARS) {
    assert.equal(hasBoost(id), false, id);
    const car = bounds(file);
    assert.ok(car.minY > -0.02 && car.minY < 0.05, `${id} ground ${car.minY}`);
    const end = rollLocalZ(1, -rollRigBack(false));
    assert.ok(end + car.maxZ < foot - 0.05, `${id} nose ${end + car.maxZ} foot ${foot}`);
    assert.equal(end + rollRigBack(false), 0);

    const state: RollPoseState = { exitY: null, poseY: null };
    let prev = Infinity;
    let settled = false;
    for (let i = 0; i <= Math.round(ROLL_HAND * 60); i++) {
      const t = i / 60;
      const z = rollLocalZ(rollProgress(t), -rollRigBack(false));
      const y = stepNonRoadsterRoll(t, bayY, probe(z), state);
      for (const v of rampVerts) {
        if (v.z < z + car.minZ - 0.02 || v.z > z + car.maxZ + 0.02) continue;
        if (v.x < car.minX - 0.02 || v.x > car.maxX + 0.02) continue;
        assert.ok(y >= v.y - 0.05, `${id} clips the ramp at t=${t.toFixed(3)} y=${y.toFixed(3)} mesh=${v.y.toFixed(3)} z=${v.z.toFixed(2)}`);
      }
      if (t + 1e-9 >= ROLL_OUT1) {
        assert.ok(y <= prev + 1e-6, `${id} y rose ${prev} -> ${y} at t=${t}`);
        prev = y;
      }
      if (t + 1e-9 >= ROLL_OUT1 + ROLL_SETTLE) {
        assert.equal(y, 0, `${id} not grounded at t=${t}`);
        settled = true;
        assert.ok(z + car.maxZ < foot, `${id} still over the foot while grounded`);
      }
    }
    assert.equal(settled, true, id);
  }

  assert.equal(hasBoost("roadster"), true);
  assert.equal(rollLocalZ(1, -rollRigBack(true)), -14.6);
  assert.ok(rollRoadsterHeight(0.725, bayY) > rollRoadsterHeight(0.45, bayY));
  assert.equal(rollRoadsterHeight(1, bayY), 0);
});
