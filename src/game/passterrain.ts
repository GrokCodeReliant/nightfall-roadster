// week-i-pass: Mountain Pass terrain (LEVELS/06 §1, ART_LISTS/06 budget note: "terrain walls as cheap extruded strips along
// the spline"). One world-space height field for the whole stage, so the folded hairpin legs (>= 163 m apart) never
// overlap: every point looks up its nearest course point (and the nearest point on another leg, blended by distance).
// Near the road it sits just under the deck (a flat corridor); beyond it climbs to the uphill side (rock and snow) or drops
// to the valley side. The frozen-lake shelf (MP-9 right), the lodge meadow (MP-0) and the summit snowfield (MP-11) are
// flattened. world.ts streams it as 192 m tiles around the chase cam (passTerrainTile); placement reads passGroundY.
import * as THREE from "three";
import { COURSE_ORIGIN, MOUNTAIN_PASS, widthAt } from "./course";
import { buildCourseTrack, poseAt } from "./road";

/** course lat sign of the uphill side per race s (hairpins: the inside; Fork B: the cliff road, left; MP-11: the snowfield, right) */
const UP_SIDE: [number, number][] = [[-1e9, -1], [1260, 1], [1960, -1], [2920, 1], [3220, -1], [4230, 1]];
export function upSide(s: number): number {
  let v = -1;
  for (const [s0, side] of UP_SIDE) if (s >= s0) v = side;
  return v;
}
/** smooth version (-1..1) for the terrain: 40 m blend either side of a change */
function upSmooth(s: number): number {
  let v = upSide(UP_SIDE[0][0]);
  for (let i = 1; i < UP_SIDE.length; i++) {
    const [s0, side] = UP_SIDE[i];
    const prev = UP_SIDE[i - 1][1];
    const t = Math.min(1, Math.max(0, (s - (s0 - 40)) / 80));
    if (s >= s0 - 40) v = prev + (side - prev) * t * t * (3 - 2 * t);
  }
  return v;
}

type Pt = { s: number; x: number; z: number; rx: number; rz: number; y: number };
const STEP = 6;
const CELL = 32;
let pts: Pt[] | null = null;
let grid: Map<number, number[]> | null = null;
const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
function index() {
  if (pts) return;
  const track = buildCourseTrack(MOUNTAIN_PASS);
  pts = [];
  grid = new Map();
  for (let s = -COURSE_ORIGIN; s <= MOUNTAIN_PASS.length + MOUNTAIN_PASS.runout; s += STEP) {
    const p = poseAt(track, COURSE_ORIGIN + s);
    const n = pts.length;
    pts.push({ s, x: p.x, z: p.z, rx: p.rx, rz: p.rz, y: p.y });
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    let b = grid.get(k);
    if (!b) grid.set(k, (b = []));
    b.push(n);
  }
}

/** nearest course point (projected on the 6 m polyline): race s, course lat (right +), distance; and the nearest on another leg */
export type Near = { s: number; lat: number; d: number; s2: number; lat2: number; d2: number };
const R = 5; // search radius in cells (160 m)
export function nearCourse(x: number, z: number): Near {
  index();
  const P = pts!, G = grid!;
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
  let best = Infinity, bi = -1;
  const cand: number[] = [];
  for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
    const b = G.get(key(i, j));
    if (!b) continue;
    for (const n of b) {
      cand.push(n);
      const d = (P[n].x - x) ** 2 + (P[n].z - z) ** 2;
      if (d < best) { best = d; bi = n; }
    }
  }
  if (bi < 0) return { s: -1e4, lat: 1e4, d: 1e4, s2: -1e4, lat2: 1e4, d2: 1e4 };
  const proj = (n: number) => {
    // project on the segments either side of sample n
    let bs = P[n].s, bl = 0, bd = Infinity;
    for (const m of [n - 1, n]) {
      if (m < 0 || m + 1 >= P.length) continue;
      const a = P[m], b = P[m + 1];
      const ax = b.x - a.x, az = b.z - a.z, l2 = ax * ax + az * az || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ax + (z - a.z) * az) / l2));
      const px = a.x + ax * t, pz = a.z + az * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) {
        bd = d;
        bs = a.s + (b.s - a.s) * t;
        const rx = a.rx + (b.rx - a.rx) * t, rz = a.rz + (b.rz - a.rz) * t;
        bl = (x - px) * rx + (z - pz) * rz;
      }
    }
    return { s: bs, lat: bl, d: bd };
  };
  const p1 = proj(bi);
  // nearest point at least 250 m of course away (another leg / the other side of a hairpin)
  let b2 = Infinity, bi2 = -1;
  for (const n of cand) {
    if (Math.abs(P[n].s - P[bi].s) < 250) continue;
    const d = (P[n].x - x) ** 2 + (P[n].z - z) ** 2;
    if (d < b2) { b2 = d; bi2 = n; }
  }
  const p2 = bi2 >= 0 ? proj(bi2) : { s: -1e4, lat: 1e4, d: 1e4 };
  return { s: p1.s, lat: p1.lat, d: p1.d, s2: p2.s, lat2: p2.lat, d2: p2.d };
}

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function noise(x: number, z: number) {
  return (Math.sin(x * 0.043 + Math.sin(z * 0.021) * 2.1) * Math.cos(z * 0.037 - x * 0.012) + 0.5 * Math.sin(x * 0.11 + z * 0.093) * Math.sin(z * 0.13 - x * 0.05)) / 1.5;
}
/**
 * week-i-polish (playtest). MP-6 Goat Track: the rock cut stood 0.9 m off the left kerb, 11-13.5 m tall, and on the outside of
 * the R+250 bend it filled ~40 % of the left-lane frame. It now stands WALL_SET m further out behind a snowy verge (the
 * terrain's uphill rise moves out with it) and its face is lower (mountain.ts strip). Camera unchanged.
 * MP-4 Scree Traverse: the terrain's uphill rise (13 m by 21 m out) buried the scree strip (rubble slope 7-9 m high by 12 m
 * out), so the side read as a smooth, flat grey wall; the terrain now stays under the scree slope out to its top.
 */
export const WALL_SET = 4.5;
const MP6: [number, number] = [1960, 2460];
const MP4: [number, number] = [1260, 1700];
const zoneK = (s: number, [a, b]: [number, number], blend = 25) => ss(a - blend, a + blend, s) * (1 - ss(b - blend, b + blend, s));
/** extra lateral set-back (m) of the uphill rock-cut strips + the terrain rise at race s */
export function wallSetback(s: number): number {
  return WALL_SET * zoneK(s, MP6);
}
/** 0..1: the MP-4 scree slope owns the uphill side at s */
export function screeK(s: number): number {
  return zoneK(s, MP4, 20);
}
/** scree strip surface height (mountain.ts) d m from the centre, e = kerb edge; the terrain caps 0.8 m under it */
function screeCap(d: number, e: number): number {
  const a = e + 0.9, b = a + 5, c = a + 12;
  if (d <= a) return PASS_FLOOR;
  if (d <= b) return PASS_FLOOR + ((d - a) / 5) * (3.1 - PASS_FLOOR) - 0.8;
  if (d <= c) return 3.1 + ((d - b) / 7) * (8.5 - 3.1) - 0.8;
  return 7.7 + (d - c) * 0.9;
}
/** the corridor sits this far under the deck (the kit road and its kerbs cover it) */
export const PASS_FLOOR = -0.6;
export const PASS_LAKE_Y = -1.25;
/** height of one leg's field at course (s, lat) */
function legY(s: number, lat: number, x: number, z: number): number {
  const d = Math.abs(lat);
  const n = noise(x, z);
  const u = upSmooth(s) * Math.sign(lat || 1); // +1 uphill, -1 valley
  const set = wallSetback(s);
  let up = PASS_FLOOR + 13 * ss(13.5 + set, 21 + set, d) + Math.min(70, 0.42 * Math.max(0, d - 21 - set)) + n * 7 * ss(21 + set, 60 + set, d);
  const sk = screeK(s);
  if (sk > 0) up += (Math.max(PASS_FLOOR, Math.min(up, screeCap(d, widthAt(MOUNTAIN_PASS, s) / 2))) - up) * sk;
  const val = PASS_FLOOR - 32 * ss(15, 52, d) - Math.min(40, 0.18 * Math.max(0, d - 52)) + n * 5 * ss(30, 70, d);
  let y = val + (up - val) * (0.5 + 0.5 * u);
  // MP-0 lodge meadow / MP-11 summit snowfield: gentle, open
  const open = Math.max(1 - ss(250, 330, s), ss(4440, 4560, s));
  if (open > 0) {
    const meadow = PASS_FLOOR + 0.12 * Math.max(0, d - 20) * (lat * upSide(s) > 0 ? 1 : 0.25) + n * 2.5 * ss(25, 70, d);
    y = y + (meadow - y) * open;
  }
  // MP-9 frozen-lake shelf (right of Fork B): flat under the ice tiles out to 58 m
  if (lat > 12 && s > 3450 && s < 3990) {
    const k = ss(3450, 3480, s) * (1 - ss(3960, 3990, s)) * (1 - ss(54, 64, d));
    y = y + (PASS_LAKE_Y - 0.25 - y) * k;
  }
  return y;
}
/** absolute ground height at world (x, z) */
export function passGroundY(x: number, z: number): number {
  const n = nearCourse(x, z);
  if (n.d > 900) return -40;
  const y1 = legY(n.s, n.lat, x, z);
  if (n.d2 > 400) return y1;
  const y2 = legY(n.s2, n.lat2, x, z);
  const w1 = 1 / Math.max(1, n.d - 12) ** 3, w2 = 1 / Math.max(1, n.d2 - 12) ** 3;
  return (y1 * w1 + y2 * w2) / (w1 + w2);
}

const SNOW = new THREE.Color(0xd9e1ec), SNOW2 = new THREE.Color(0xb9c6d8), ROCK = new THREE.Color(0x55504a), ROCK2 = new THREE.Color(0x3b3833), BED = new THREE.Color(0x2f3236);
/** one terrain tile: size x size m at (x0, z0), res m grid, vertex-coloured (snow on the gentle ground, rock on the steep) */
export function passTerrainTile(x0: number, z0: number, size: number, res: number): THREE.BufferGeometry {
  const n = Math.round(size / res);
  const H: number[] = [];
  const D: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = x0 + i * res, z = z0 + j * res;
    const nc = nearCourse(x, z);
    D.push(nc.d);
    H.push(passGroundY(x, z));
  }
  const pos = new Float32Array((n + 1) * (n + 1) * 3);
  const col = new Float32Array((n + 1) * (n + 1) * 3);
  const c = new THREE.Color();
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const k = j * (n + 1) + i;
    const x = x0 + i * res, z = z0 + j * res, y = H[k];
    pos.set([x, y, z], k * 3);
    const hx = H[j * (n + 1) + Math.min(n, i + 1)] - H[j * (n + 1) + Math.max(0, i - 1)];
    const hz = H[Math.min(n, j + 1) * (n + 1) + i] - H[Math.max(0, j - 1) * (n + 1) + i];
    const slope = Math.hypot(hx, hz) / (2 * res);
    const nz = noise(x * 3.1, z * 3.1);
    const rock = ss(0.55, 1.1, slope + nz * 0.25);
    c.copy(SNOW).lerp(SNOW2, 0.5 + 0.5 * nz).lerp(nz > 0 ? ROCK : ROCK2, rock);
    // week-i-polish: strata / weathering on the steep rock (2.5 m bands + per-vertex jitter) so a big slope is not one flat grey
    if (rock > 0.05) {
      const band = Math.sin(y * 2.4 + nz * 3.0) * 0.5 + 0.5, jit = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      c.multiplyScalar(1 + rock * (0.26 * (band - 0.5) + 0.16 * (jit - Math.floor(jit) - 0.5)));
    }
    // packed, dirty snow along the corridor under / beside the road
    if (D[k] < 15) c.lerp(BED, 1 - ss(11, 15, D[k]));
    col.set([c.r, c.g, c.b], k * 3);
  }
  const idx: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.piece = "mtn_terrain";
  return g;
}
let terrainMat: THREE.MeshLambertMaterial | null = null;
export function passTerrainMaterial() {
  if (!terrainMat) {
    terrainMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    terrainMat.name = "mtn_terrain";
  }
  return terrainMat;
}
