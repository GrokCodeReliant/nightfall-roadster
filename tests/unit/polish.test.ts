// week-i-polish (playtest watch items after 77d6418): bridge-gap lip, 3-lane paint on 18 m roads, Port L4 crate, textured
// snowdrift + kicker, MP-4 terrain under the scree, MP-6 rock cut set back. Camera untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { COURSE_ORIGIN, LANE_LAT, MOUNTAIN_PASS, widthAt } from "../../src/game/course.ts";
import { buildCourseTrack, poseAt } from "../../src/game/road.ts";

test("18 m roads paint 3 lanes: dashes at +-3, edges at the kerb, no centre line; 24 m unchanged; continuous in tapers", async () => {
  const { lanePaintX } = await import("../../src/game/roadpaint.ts");
  for (const x of [-11.7, -6.07, -5.93, -0.22, 0.1, 6, 11.5]) assert.equal(lanePaintX(x, 24), x);
  assert.ok(Math.abs(lanePaintX(6.07, 18) - 3.07) < 1e-9 && Math.abs(lanePaintX(-5.93, 18) + 2.93) < 1e-9);
  assert.ok(Math.abs(lanePaintX(11.7, 18) - 8.775) < 1e-9);
  for (const x of [-0.22, -0.06, 0.1, 0.22]) assert.equal(Math.abs(lanePaintX(x, 18)), 0);
  for (let w = 18; w <= 24; w += 0.5) {
    const a = lanePaintX(6, w), b = lanePaintX(6, w + 0.5);
    assert.ok(Math.abs(a - b) <= 0.26, `taper step ${w}`);
    assert.ok(lanePaintX(11.6, w) > lanePaintX(6.07, w) + 5, `edge stays outside the dash at ${w}`);
  }
});

test("bridge gap: gap_edge_12 near lip drops the up-facing flat slabs and blacks out the soffit; other faces leave the flat cell", async () => {
  const { regritGapEdge, GAP_EDGE_SOFFIT_UV, GAP_EDGE_CONCRETE_CELL: C } = await import("../../src/game/highway.ts");
  const tri = (pts: number[][], uv: [number, number]) => ({ pts, uv });
  const tris = [
    tri([[0, 0.3, 0], [2, 0.3, 0], [0, 0.5, -1]], [0.968, 0.969]), // up-facing rubble slab
    tri([[0, -1.2, 0], [0, -1.8, -3], [3, -1.2, 0]], [0.91, 0.97]), // soffit (faces down)
    tri([[0, -1, 0], [0, -2, 0], [2, -1, 0]], [0.91, 0.97]), // a flat-cell side face
    tri([[0, 0, 0], [0, -3, 0], [2, 0, 0]], [0.55, 0.8]), // fracture face (already textured)
  ];
  const mk = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flatMap((t) => t.pts.flat()), 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(tris.flatMap((t) => [...t.uv, ...t.uv, ...t.uv]), 2));
    return g;
  };
  const g = mk();
  assert.equal(regritGapEdge(g, true), 3);
  const p = g.getAttribute("position"), u = g.getAttribute("uv");
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i);
  assert.ok(v(1).equals(v(0)) && v(2).equals(v(0)), "near-lip slab is degenerate");
  for (let i = 3; i < 6; i++) assert.deepEqual([u.getX(i), u.getY(i)].map((x) => +x.toFixed(3)), GAP_EDGE_SOFFIT_UV);
  for (let i = 6; i < 9; i++) assert.ok(u.getX(i) >= C.u0 && u.getX(i) <= C.u1 && u.getY(i) >= C.v0 && u.getY(i) <= C.v1, "side face on the concrete cell");
  for (let i = 9; i < 12; i++) assert.deepEqual([+u.getX(i).toFixed(2), +u.getY(i).toFixed(2)], [0.55, 0.8]);
  assert.equal(regritGapEdge(g, true), 0, "idempotent");
  const far = mk();
  regritGapEdge(far, false);
  const fp = far.getAttribute("position");
  assert.ok(!new THREE.Vector3().fromBufferAttribute(fp, 1).equals(new THREE.Vector3().fromBufferAttribute(fp, 0)), "far lip keeps its slabs");
});

test("Industrial Port §2 crates: L1 at 1650 (Fork A quay) and L4 at 3300 (Fork B rail spur, right side)", async () => {
  const { PORT_CRATES, portPlacements } = await import("../../src/game/portcourse.ts");
  assert.deepEqual(PORT_CRATES, [[1650, LANE_LAT.L1], [3300, LANE_LAT.L4]]);
  const c = portPlacements().filter((p) => p.name === "coast_crate");
  assert.deepEqual(c.map((p) => [p.s, -p.lx]), [[1650, -9], [3300, 9]]);
});

test("snowdrift row + K-B kicker: textured (many tones, not one flat white), within the tri budgets", async () => {
  const { passPieceColours, passPieceTris } = await import("../../src/game/mountain.ts");
  for (const [name, budget] of [["mtn_snowdrift_row_6", 80], ["mtn_snow_kicker_6", 150]] as const) {
    const c = passPieceColours(name);
    const tones = new Set<string>();
    let lo = 1, hi = 0;
    for (let i = 0; i < c.length; i += 3) { tones.add([c[i], c[i + 1], c[i + 2]].map((x) => x.toFixed(2)).join()); const l = (c[i] + c[i + 1] + c[i + 2]) / 3; lo = Math.min(lo, l); hi = Math.max(hi, l); }
    assert.ok(tones.size >= 20, `${name}: ${tones.size} tones`);
    assert.ok(hi - lo >= 0.2, `${name}: tone range ${(hi - lo).toFixed(2)}`);
    assert.ok(passPieceTris(name) <= budget, `${name} tris`);
  }
});

test("MP-4 terrain stays under the scree slope; MP-6 rock cut and terrain rise set back, verge flat; other zones unchanged", async () => {
  const { passGroundY, PASS_FLOOR, WALL_SET, wallSetback, screeK } = await import("../../src/game/passterrain.ts");
  const track = buildCourseTrack(MOUNTAIN_PASS);
  const g = (s: number, lat: number) => { const p = poseAt(track, COURSE_ORIGIN + s); return passGroundY(p.x + p.rx * lat, p.z + p.rz * lat); };
  // MP-4 uphill = right (lat > 0); scree strip from e+0.9 (floor) to e+5.9 (~3.1) to e+12.9 (~8.5)
  for (const s of [1350, 1450, 1549, 1650]) {
    const e = widthAt(MOUNTAIN_PASS, s) / 2;
    assert.equal(screeK(s), 1);
    assert.ok(g(s, e + 5.9) <= 3.1 - 0.3, `scree foot ${s}: ${g(s, e + 5.9).toFixed(2)}`);
    assert.ok(g(s, e + 12.9) <= 8.5 - 0.3, `scree top ${s}: ${g(s, e + 12.9).toFixed(2)}`);
    assert.ok(g(s, e + 40) > 15, `the slope still climbs behind it at ${s}`);
  }
  // MP-6 uphill = left (lat < 0): the verge in front of the set-back cut stays at the floor
  for (const s of [2100, 2200, 2300, 2400]) {
    const e = widthAt(MOUNTAIN_PASS, s) / 2;
    assert.equal(wallSetback(s), WALL_SET);
    assert.ok(g(s, -(e + 0.9 + WALL_SET)) <= PASS_FLOOR + 0.6, `verge ${s}: ${g(s, -(e + 0.9 + WALL_SET)).toFixed(2)}`);
  }
  assert.equal(wallSetback(600), 0);
  assert.equal(screeK(600), 0);
  assert.equal(wallSetback(3000), 0);
});
