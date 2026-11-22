// Coast seam fix: the drawn road must be ONE continuous surface along the whole course (David: "built off of itself").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { buildCourseTrack, sampleAt, STEP, type Track } from "../../src/game/road.ts";
import { COAST_ROAD, NIGHT_CITY, PINE_WOODS, COURSE_ORIGIN, type Course } from "../../src/game/course.ts";
import { BEND_STEP, BEND_TOL, bendGeometry, bendStep, lerpPose, sliceZ } from "../../src/game/roadbend.ts";
import { SEA_CLIFF_Y } from "../../src/game/coast.ts";

const SEG = 20; // world.ts samples per chunk
const HALF = 12.35; // kit road_straight_40 kerb outer edge

/** stand-in for road_straight_40: same 40 m length, kerb width and z rows (-20/-10/0/10/20) */
function tile() {
  const g = new THREE.PlaneGeometry(HALF * 2, 40, 4, 4).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  return g;
}
/** the world.ts placeKitRoads bend for chunk i: coarsest slicing inside BEND_TOL, then bend */
function bentChunk(track: Track, i: number, base: THREE.BufferGeometry) {
  const i0 = i * SEG;
  const frame = (z: number) => lerpPose((n) => sampleAt(track, n), i0 + SEG / 2 + z / BEND_STEP, i0, i0 + SEG);
  const step = bendStep(frame);
  const src = sliceZ(base, step);
  const g = src.clone();
  bendGeometry(g, frame, true);
  return { p: g.getAttribute("position") as THREE.BufferAttribute, src, step };
}
/** distance of a world point from the true road at sample index k with lateral offset lat (x = driver's left) */
function offRoad(track: Track, k: number, lat: number, x: number, y: number, z: number) {
  const s = sampleAt(track, k);
  return Math.hypot(x - (s.x - s.rx * lat), y - s.y, z - (s.z - s.rz * lat));
}
function chunks(course: Course) {
  return Math.ceil((COURSE_ORIGIN + course.length + course.runout) / (SEG * STEP));
}

for (const course of [COAST_ROAD, NIGHT_CITY, PINE_WOODS]) {
  test(`${course.id}: kit road is continuous at every chunk seam and on the true road edge (whole course)`, () => {
    const track = buildCourseTrack(course);
    const base = tile();
    let worstSeam = 0, worstEdge = 0, worstAt = -1;
    let prev: { p: THREE.BufferAttribute; src: THREE.BufferGeometry } | null = null;
    const steps = new Map<number, number>();
    for (let i = 0; i < chunks(course); i++) {
      const bent = bentChunk(track, i, base);
      const p = bent.p;
      const srcP = bent.src.getAttribute("position");
      steps.set(bent.step, (steps.get(bent.step) ?? 0) + 1);
      for (let v = 0; v < p.count; v++) {
        const lx = srcP.getX(v), lz = srcP.getZ(v);
        // every vertex sits on a 2 m sample plane or inside one; those on a plane must match the true road there
        if (Math.abs(lz / BEND_STEP - Math.round(lz / BEND_STEP)) < 1e-6) {
          const k = i * SEG + SEG / 2 + Math.round(lz / BEND_STEP);
          const d = offRoad(track, k, lx, p.getX(v), p.getY(v), p.getZ(v));
          if (d > worstEdge) { worstEdge = d; worstAt = i; }
        }
      }
      if (prev) {
        // the end row (z = +20) of chunk i-1 and the start row (z = -20) of chunk i are the same points
        const ends = (attr: THREE.BufferAttribute, sp: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, zRow: number) => {
          const out: number[][] = [];
          for (let v = 0; v < attr.count; v++) if (Math.abs(sp.getZ(v) - zRow) < 1e-6) out.push([sp.getX(v), attr.getX(v), attr.getY(v), attr.getZ(v)]);
          return out;
        };
        const a = ends(prev.p, prev.src.getAttribute("position"), 20), b = ends(p, srcP, -20);
        for (const [lx, x, y, z] of a) {
          const m = b.find((q) => Math.abs(q[0] - lx) < 1e-6)!;
          worstSeam = Math.max(worstSeam, Math.hypot(x - m[1], y - m[2], z - m[3]));
        }
      }
      prev = bent;
    }
    assert.ok(steps.get(Infinity)! > 0, "straight chunks are not sliced");
    console.log(`${course.id} slicing per chunk:`, JSON.stringify([...steps]));
    assert.ok(worstSeam < 1e-3, `${course.id} seam step ${worstSeam.toFixed(4)} m`);
    assert.ok(worstEdge < 1e-3, `${course.id} road off the true edge by ${worstEdge.toFixed(4)} m at chunk ${worstAt}`);
  });

  test(`${course.id}: the old rigid mid-chunk tile would leave the road (guards the test itself)`, () => {
    const track = buildCourseTrack(course);
    let worst = 0;
    for (let i = 0; i < chunks(course); i++) {
      const mid = sampleAt(track, i * SEG + SEG / 2);
      for (const k of [0, SEG]) {
        const s = sampleAt(track, i * SEG + k);
        const dz = (k - SEG / 2) * STEP;
        worst = Math.max(worst, Math.abs((s.x - (mid.x + mid.tx * dz)) * mid.rx + (s.z - (mid.z + mid.tz * dz)) * mid.rz));
      }
    }
    assert.ok(worst > 0.3, `rigid tile error ${worst.toFixed(2)} m`);
  });
}

test("sliceZ: no triangle spans more than one 2 m sample slab, area is preserved", () => {
  const g = tile();
  const s = sliceZ(g);
  const p = s.getAttribute("position");
  const area = (geo: THREE.BufferGeometry) => {
    const q = geo.getAttribute("position"); let a = 0;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    for (let t = 0; t < q.count; t += 3) { A.fromBufferAttribute(q, t); B.fromBufferAttribute(q, t + 1); C.fromBufferAttribute(q, t + 2); a += B.sub(A).cross(C.sub(A)).length() / 2; }
    return a;
  };
  for (let t = 0; t < p.count; t += 3) {
    const zs = [p.getZ(t), p.getZ(t + 1), p.getZ(t + 2)];
    assert.ok(Math.max(...zs) - Math.min(...zs) <= BEND_STEP + 1e-6);
  }
  assert.ok(Math.abs(area(s) - area(g)) < 1e-3);
});

test("coast sea cliff v2 top stays under the deck (its 24.20 cap stood 0.05 m over the road at -24.15)", () => {
  const b = fs.readFileSync(new URL("../../spa/public/assets/v02/coast/coast_cliff_40_v2.glb", import.meta.url));
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString());
  let top = -Infinity;
  for (const m of j.meshes) for (const pr of m.primitives) top = Math.max(top, j.accessors[pr.attributes.POSITION].max[1]);
  assert.ok(top + SEA_CLIFF_Y <= -0.2, `sea cliff top at ${(top + SEA_CLIFF_Y).toFixed(2)} m vs deck 0`);
});

test("bendStep: straight track is not sliced; a 250 m bend slices just enough to stay inside BEND_TOL", () => {
  const straight = (z: number) => ({ x: 0, y: 0, z, tx: 0, tz: 1 });
  assert.equal(bendStep(straight), Infinity);
  for (const R of [140, 250, 600]) {
    const arc = (z: number) => ({ x: R - R * Math.cos(z / R), y: 0, z: R * Math.sin(z / R), tx: Math.sin(z / R), tz: Math.cos(z / R) });
    const step = bendStep(arc);
    assert.ok(step >= BEND_STEP && (!Number.isFinite(step) || (step * step) / (8 * R) <= BEND_TOL + 1e-3), `R ${R}: step ${step}`);
  }
});
