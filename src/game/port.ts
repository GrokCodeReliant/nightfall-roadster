// week-i-port: Industrial Port stage scenery (LEVELS/05_industrial_port.md v1.0, ART_LISTS/05 §B). Every port_* piece is an
// original procedural mesh built here (vertex colours, no textures, no logos or text). Placement is the authored
// portcourse.ts table on course s. Per 40 m chunk everything opaque merges into ONE vertex-coloured material
// (port_props: containers, cranes, sheds, warehouses, rails, hulls, the yard apron / quay walls / dry-dock basin, the
// Fork A container-top deck), the lit bits into ONE unlit material (port_lamps), plus the oil decals (port_oil) and quay
// water (port_water) where present, plus the shared kit pieces (jersey, rails, signs, crate, grid, chevron, gantry).
// The Long Shed roof / header sit in a separate roof group hidden while the hero is in SHED_HIDE (BN-7).
// The crane loads, their ground shadows and the forklifts are world-level instanced meshes posed per frame (world.ts portFrame).
import * as THREE from "three";
import { bakePiece, bakePieceBent, chunkFrame, flushParts, loadPieces, placeMatrix, type Parts, type Pose } from "./city";
import type { ChunkCourse } from "./coastcourse";
import { INDUSTRIAL_PORT, sideLiftAt, widthAt } from "./course";
import { BOX, PORT_CRANE_S, PORT_DECK, PORT_SHED, portIn, type PortPlace } from "./portcourse";

export const PORT_PIECES: [string, string][] = [
  ["coast", "coast_guardrail_4m"], ["coast", "coast_guardrail_end_4m"], ["coast", "coast_crate"],
  ["kit", "sign_fork"], ["kit", "barrier_jersey_4m"], ["kit", "start_grid_paint_40"], ["kit", "ramp_lip_chevron_24"], ["city", "finish_gantry_24"],
];
let loaded = 0;
let asked = false;
export const portReady = () => loaded >= PORT_PIECES.length;
export function loadPort() {
  if (asked) return;
  asked = true;
  loadPieces(PORT_PIECES, () => { loaded++; });
}

// ---------------------------------------------------------------- tiny tri builder (local piece space: +X left, +Y up, +Z forward)
type RGB = [number, number, number];
const C = (hex: number): RGB => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function hash(n: number) { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
type V3 = [number, number, number];
class G {
  p: number[] = [];
  c: number[] = [];
  tri(a: V3, b: V3, c: V3, ca: RGB, cb: RGB = ca, cc: RGB = ca) { this.p.push(...a, ...b, ...c); this.c.push(...ca, ...cb, ...cc); }
  quad(a: V3, b: V3, c: V3, d: V3, ca: RGB, cb: RGB = ca, cc: RGB = cb, cd: RGB = ca) { this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd); }
  /** axis box; faces: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z (a face colour or null to skip) */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: RGB | (RGB | null)[]) {
    const f = (i: number) => (Array.isArray(col[0]) || col[0] === null ? (col as (RGB | null)[])[i] : (col as RGB));
    const sh = [0.86, 0.86, 1, 0.5, 0.94, 0.78];
    const face = (i: number, a: V3, b: V3, c: V3, d: V3) => { const k = f(i); if (k) this.quad(a, b, c, d, mul(k, sh[i])); };
    face(0, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
    face(1, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]);
    face(2, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    face(3, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    face(4, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    face(5, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
  }
  /** a beam between two points (square section w) */
  beam(a: V3, b: V3, w: number, col: RGB) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const up = Math.abs(d.y / len) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(w / 2);
    const v = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(w / 2);
    const P = (o: V3, su: number, sv: number): V3 => [o[0] + u.x * su + v.x * sv, o[1] + u.y * su + v.y * sv, o[2] + u.z * su + v.z * sv];
    const rim = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const [s0, t0] = rim[i], [s1, t1] = rim[(i + 1) % 4];
      this.quad(P(a, s0, t0), P(b, s0, t0), P(b, s1, t1), P(a, s1, t1), mul(col, 0.8 + 0.2 * (i % 2)));
    }
  }
}
type Piece = { p: Float32Array; c: Float32Array; lp: Float32Array; lc: Float32Array; rp?: Float32Array; rc?: Float32Array };
const done = (g: G, l?: G, r?: G): Piece => ({ p: new Float32Array(g.p), c: new Float32Array(g.c), lp: new Float32Array(l?.p ?? []), lc: new Float32Array(l?.c ?? []), rp: r ? new Float32Array(r.p) : undefined, rc: r ? new Float32Array(r.c) : undefined });

// ---------------------------------------------------------------- palette (night: mid values; the hemi / moon rig lifts them)
export const CONTAINER_TINTS = [0x8a3324, 0x2e5a8a, 0x3f6b3a, 0x8a8c8e, 0xb8642a, 0x2f7a78].map(C);
const STEEL = C(0x55595e), DARK = C(0x26282b), CONC = C(0x6a6b6a), CRANE_RED = C(0xa8341f), CRANE_WHITE = C(0xc9c6bd), YEL = C(0xd9a520), BLACK = C(0x151617);
const LAMP_W = C(0xfff0d0), LAMP_S = C(0xffb050), LAMP_R = C(0xff3020), WIN = C(0xe8c27a);

// ---------------------------------------------------------------- piece builders
/** port_container_12: 2.44 x 2.6 x 12.2, corrugated sides (6 rib bands a side), doors at +z, bottom rail. 56 tris. */
function container(tint: number): Piece {
  const g = new G(), base = CONTAINER_TINTS[tint % 6];
  const w = BOX.w / 2, h = BOX.h, l = BOX.l / 2;
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) {
    const z0 = -l + (i * BOX.l) / 6, z1 = z0 + BOX.l / 6, k = i % 2 ? 0.78 : 0.95;
    const x = sx * w;
    const a: V3 = [x, 0, z0], b: V3 = [x, h, z0], c: V3 = [x, h, z1], d: V3 = [x, 0, z1];
    const top = mul(base, k), bot = mul(base, k * 0.62);
    if (sx > 0) g.quad(a, b, c, d, bot, top, top, bot); else g.quad(d, c, b, a, bot, top, top, bot);
  }
  g.quad([-w, h, -l], [-w, h, l], [w, h, l], [w, h, -l], mul(base, 0.72));
  // door end: two leaves (slightly darker) + lock bars as colour
  g.quad([w, 0, l], [w, h, l], [0, h, l], [0, 0, l], mul(base, 0.7), mul(base, 0.85));
  g.quad([0, 0, l], [0, h, l], [-w, h, l], [-w, 0, l], mul(base, 0.66), mul(base, 0.82));
  g.quad([-w, 0, -l], [-w, h, -l], [w, h, -l], [w, 0, -l], mul(base, 0.6));
  return done(g);
}
/** port_parapet_4m: 0.3 x 0.9 x 4 rail, yellow top band. 20 tris */
function parapet(): Piece {
  const g = new G();
  g.box(-0.15, 0.15, 0, 0.7, -2, 2, [STEEL, STEEL, null, null, STEEL, STEEL]);
  g.box(-0.15, 0.15, 0.7, 0.9, -2, 2, [YEL, YEL, YEL, null, YEL, YEL]);
  return done(g);
}
/** port_bollard: octagonal mooring post, yellow cap band. 24 tris */
function bollard(): Piece {
  const g = new G(), n = 8, r = 0.28;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p0: V3 = [Math.cos(a0) * r, 0, Math.sin(a0) * r], p1: V3 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
    g.quad([p1[0], 0, p1[2]], [p1[0], 0.7, p1[2]], [p0[0], 0.7, p0[2]], [p0[0], 0, p0[2]], mul(BLACK, 1.6));
    g.tri([0, 0.85, 0], [p0[0] * 1.2, 0.7, p0[2] * 1.2], [p1[0] * 1.2, 0.7, p1[2] * 1.2], YEL);
  }
  return done(g);
}
/** port_fence_4m: two posts + rails + a dark chain-link panel. 28 tris */
function fence(): Piece {
  const g = new G(), post = C(0x7a7d80), mesh = C(0x3a3d40);
  for (const z of [-2, 2]) g.box(-0.05, 0.05, 0, 2.4, z - 0.05, z + 0.05, post);
  g.quad([0, 0.1, 2], [0, 2.3, 2], [0, 2.3, -2], [0, 0.1, -2], mesh);
  g.box(-0.03, 0.03, 2.3, 2.4, -2, 2, post);
  return done(g);
}
/** port_security_booth: booth with lit windows, flat roof, raised striped barrier arm toward the road (-X). ~120 tris */
function booth(): Piece {
  const g = new G(), l = new G(), wall = C(0xb9b4a6), roof = C(0x3b3e42);
  g.box(-2, 2, 0, 2.8, -2.5, 2.5, wall);
  g.box(-2.4, 2.4, 2.8, 3.1, -2.9, 2.9, roof);
  // windows (lit) on the road face and the ends
  l.quad([-2.02, 1.1, -2], [-2.02, 2.3, -2], [-2.02, 2.3, 2], [-2.02, 1.1, 2], WIN);
  for (const z of [-2.52, 2.52]) l.quad([-1.6, 1.1, z], [-1.6, 2.3, z], [1.6, 2.3, z], [1.6, 1.1, z], mul(WIN, 0.8));
  // barrier: post + raised arm (open, ~75 deg) striped red / white
  g.box(-3.2, -2.6, 0, 1.2, -0.3, 0.3, YEL);
  for (let i = 0; i < 6; i++) {
    const a = 1.15 + i * 1.3, b = a + 1.3;
    const k = 0.26, x = -2.9;
    g.beam([x - Math.cos(1.3) * (a - 1.15) * 0.25, a, 0], [x - Math.cos(1.3) * (b - 1.15) * 0.25, b, 0], 0.18, i % 2 ? CRANE_WHITE : CRANE_RED);
    void k;
  }
  l.box(-3.0, -2.8, 7.0, 7.2, -0.1, 0.1, LAMP_R);
  return done(g, l);
}
/** port_warehouse_block: 30 (x) x 14 x 40 (z) shed, ribbed walls, pitched roof, loading bays + dock lamps on the -Z face. ~140 tris */
function warehouse(seed: number): Piece {
  const g = new G(), l = new G();
  const wall = mix(C(0x6d7378), C(0x7a6e5e), hash(seed)), roof = C(0x3a3f45), x = 15, z = 20, h = 11;
  for (let i = 0; i < 4; i++) {
    const z0 = -z + i * 10, z1 = z0 + 10, k = i % 2 ? 0.88 : 1;
    g.quad([x, 0, z0], [x, h, z0], [x, h, z1], [x, 0, z1], mul(wall, 0.86 * k));
    g.quad([-x, 0, z1], [-x, h, z1], [-x, h, z0], [-x, 0, z0], mul(wall, 0.86 * k));
  }
  g.quad([-x, 0, z], [-x, h, z], [x, h, z], [x, 0, z], mul(wall, 0.8));
  g.quad([x, 0, -z], [x, h, -z], [-x, h, -z], [-x, 0, -z], mul(wall, 0.9));
  // gables + roof (ridge along z, 14 m)
  for (const zz of [-z, z]) g.tri([x, h, zz], [0, 14, zz], [-x, h, zz], mul(wall, 0.84));
  g.quad([x, h, -z], [0, 14, -z], [0, 14, z], [x, h, z], roof);
  g.quad([0, 14, -z], [-x, h, -z], [-x, h, z], [0, 14, z], mul(roof, 0.85));
  // loading bays on -Z (dark doors + yellow bumpers) and a lamp over each
  for (let i = 0; i < 4; i++) {
    const cx = -10.5 + i * 7;
    g.quad([cx + 2.2, 0.1, -z - 0.05], [cx + 2.2, 4.2, -z - 0.05], [cx - 2.2, 4.2, -z - 0.05], [cx - 2.2, 0.1, -z - 0.05], mul(DARK, 0.8));
    g.box(cx - 2.4, cx + 2.4, 0, 1.2, -z - 0.6, -z, [YEL, YEL, YEL, null, null, YEL]);
    l.quad([cx + 0.5, 4.7, -z - 0.12], [cx + 0.5, 5.1, -z - 0.12], [cx - 0.5, 5.1, -z - 0.12], [cx - 0.5, 4.7, -z - 0.12], LAMP_S);
  }
  // a band of clerestory windows (some lit) on both long walls
  for (const sx of [1, -1]) for (let i = 0; i < 6; i++) {
    if (hash(seed * 3 + i + sx) < 0.4) continue;
    const z0 = -z + 2 + i * 6.3, xx = sx * (x + 0.05);
    const a: V3 = [xx, 8, z0], b: V3 = [xx, 9.2, z0], c: V3 = [xx, 9.2, z0 + 4], d: V3 = [xx, 8, z0 + 4];
    if (sx > 0) l.quad(a, b, c, d, mul(WIN, 0.75)); else l.quad(d, c, b, a, mul(WIN, 0.75));
  }
  return done(g, l);
}
/** port_sts_crane: ship-to-shore gantry straddling the road. Legs at x +-16 / z +-8 (outside the 24 m), portal beams,
 *  boom across the road at 42 m (x -26..+30), A-frame apex 58 m with stays, machinery house, trolley; aviation + flood lamps. ~420 tris */
function stsCrane(): Piece {
  const g = new G(), l = new G();
  const lx = 16, lz = 8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.box(sx * lx - 0.7, sx * lx + 0.7, 0, 40, sz * lz - 0.7, sz * lz + 0.7, CRANE_RED);
    g.box(sx * lx - 1.1, sx * lx + 1.1, 0, 1.6, sz * lz - 1.6, sz * lz + 1.6, DARK); // bogie
  }
  for (const sx of [-1, 1]) {
    g.box(sx * lx - 0.8, sx * lx + 0.8, 36, 40, -lz - 0.8, lz + 0.8, CRANE_RED); // sill / portal beam along z
    g.beam([sx * lx, 8, -lz], [sx * lx, 34, lz], 0.5, CRANE_WHITE); // side bracing
    g.beam([sx * lx, 8, lz], [sx * lx, 34, -lz], 0.5, CRANE_WHITE);
  }
  for (const sz of [-1, 1]) g.box(-lx, lx, 37, 40, sz * lz - 0.7, sz * lz + 0.7, CRANE_RED); // cross beams over the road
  // boom (two girders) across the road
  for (const sz of [-1.6, 1.6]) g.box(-26, 30, 41, 43.4, sz - 0.6, sz + 0.6, CRANE_WHITE);
  g.box(-26, 30, 41, 41.4, -2.2, 2.2, mul(CRANE_WHITE, 0.8));
  // A-frame + stays
  for (const sz of [-lz, lz]) {
    g.beam([lx, 40, sz], [6, 58, sz * 0.4], 0.9, CRANE_RED);
    g.beam([-lx, 40, sz], [6, 58, sz * 0.4], 0.9, CRANE_RED);
  }
  g.box(5, 7, 57, 59, -lz * 0.45, lz * 0.45, CRANE_RED);
  g.beam([6, 58, 0], [30, 43, 0], 0.35, CRANE_WHITE);
  g.beam([6, 58, 0], [-26, 43, 0], 0.35, CRANE_WHITE);
  // machinery house on the boom (land side) + operator cab under the boom
  g.box(14, 24, 43.4, 48, -4, 4, [CRANE_WHITE, CRANE_WHITE, C(0x4a4d52), null, CRANE_WHITE, CRANE_WHITE]);
  g.box(-2, 2, 37.5, 40.8, -1.5, 1.5, CRANE_WHITE);
  l.quad([-2.05, 38.2, -1.2], [-2.05, 39.9, -1.2], [-2.05, 39.9, 1.2], [-2.05, 38.2, 1.2], WIN);
  // aviation reds (apex, boom tips) and flood lamps under the cross beams
  for (const p of [[6, 59.3, 0], [30, 43.6, 0], [-26, 43.6, 0]] as V3[]) l.box(p[0] - 0.5, p[0] + 0.5, p[1], p[1] + 0.8, p[2] - 0.5, p[2] + 0.5, LAMP_R);
  for (const sz of [-1, 1]) for (const x of [-9, -3, 3, 9]) l.quad([x - 0.9, 36.9, sz * lz - 0.5], [x + 0.9, 36.9, sz * lz - 0.5], [x + 0.9, 36.9, sz * lz + 0.5], [x - 0.9, 36.9, sz * lz + 0.5], LAMP_W);
  return done(g, l);
}
/** Long Shed section (port_shed_tunnel_40): inner walls at x +-14.2 (9.7 m), outer walls at +-30, pitched roof (roof group:
 *  hidden from inside). Wall lamps every 10 m at 7 m (main), roof trusses + ceiling lamps (roof group). */
function shedSection(): Piece {
  const g = new G(), l = new G(), r = new G();
  const wall = C(0x9a958a), band = C(0x6c6a64), ow = C(0x5d6670), roof = C(0x3a4048);
  for (const sx of [-1, 1]) {
    const x = sx * 14.2;
    for (let i = 0; i < 4; i++) {
      const z0 = -20 + i * 10, z1 = z0 + 10;
      const quad = (a: V3, b: V3, c: V3, d: V3, k: RGB, k2: RGB) => (sx > 0 ? g.quad(d, c, b, a, k, k2, k2, k) : g.quad(a, b, c, d, k, k2, k2, k));
      quad([x, 0, z0], [x, 1.2, z0], [x, 1.2, z1], [x, 0, z1], mul(YEL, 0.7), mul(YEL, 0.7)); // kerb band
      quad([x, 1.2, z0], [x, 9.7, z0], [x, 9.7, z1], [x, 1.2, z1], mul(i % 2 ? band : wall, 0.9), i % 2 ? band : wall);
      l.box(x - sx * 0.25 - 0.1, x - sx * 0.25 + 0.1, 7.6, 8.1, z0 + 4.4, z0 + 5.6, LAMP_S);
    }
    g.quad([sx * 30, 0, -20], [sx * 30, 12, -20], [sx * 30, 12, 20], [sx * 30, 0, 20], ow);
    g.quad([sx * 14.2, 9.7, -20], [sx * 30, 12, -20], [sx * 30, 12, 20], [sx * 14.2, 9.7, 20], mul(ow, 0.7)); // upper side-bay roof (low, outside the road)
    r.quad([sx * 30, 12, -20], [0, 16, -20], [0, 16, 20], [sx * 30, 12, 20], mul(roof, sx > 0 ? 1 : 0.86));
  }
  // trusses + ceiling lamp rows (roof group: hidden from inside, so the chase cam never sees a lid)
  for (const z of [-10, 0, 10]) {
    r.beam([-14.2, 9.7, z], [0, 13.5, z], 0.35, STEEL);
    r.beam([14.2, 9.7, z], [0, 13.5, z], 0.35, STEEL);
    r.beam([-14.2, 9.7, z], [14.2, 9.7, z], 0.35, STEEL);
  }
  return { ...done(g, l, r) };
}
/** shed portal (at a mouth, facing -Z): facade x +-30 with the 28.4 x 9.7 opening; header above 9.7 in the roof group */
function shedPortal(): Piece {
  const g = new G(), l = new G(), r = new G(), f = C(0x707a84), trim = YEL;
  for (const sx of [-1, 1]) {
    const a = sx * 14.2, b = sx * 30;
    const q = (p0: V3, p1: V3, p2: V3, p3: V3, k: RGB) => (sx > 0 ? g.quad(p0, p1, p2, p3, k) : g.quad(p3, p2, p1, p0, k));
    q([b, 0, -0.1], [b, 12, -0.1], [a, 12, -0.1], [a, 0, -0.1], f);
    g.box(a - 0.4, a + 0.4, 0, 9.7, -0.6, 0, trim);
    l.box(sx * 22 - 1.2, sx * 22 + 1.2, 10.4, 10.9, -0.4, -0.2, LAMP_S);
  }
  r.quad([14.2, 9.7, -0.1], [14.2, 16, -0.1], [-14.2, 16, -0.1], [-14.2, 9.7, -0.1], f);
  r.box(-14.6, 14.6, 9.7, 10.3, -0.6, 0, trim);
  for (const sx of [-1, 1]) r.tri([sx * 30, 12, -0.1], [0, 16, -0.1], [sx * 14.2, 12, -0.1], f);
  return done(g, l, r);
}
/** port_racking: 20 m pallet racking, 6 m tall, 1.8 deep; orange uprights, blue beams, wrapped pallets. ~190 tris */
function racking(seed: number): Piece {
  const g = new G(), up = C(0xd0661c), bm = C(0x2d5aa0), wrap = [C(0xc8c2b4), C(0x8a6a44), C(0x5c7a8c)];
  for (let i = 0; i <= 4; i++) for (const x of [-0.9, 0.9]) g.box(x - 0.08, x + 0.08, 0, 6, -10 + i * 5 - 0.08, -10 + i * 5 + 0.08, up);
  for (const y of [0.2, 2.2, 4.2]) for (const x of [-0.9, 0.9]) g.box(x - 0.06, x + 0.06, y, y + 0.16, -10, 10, bm);
  for (const y of [0.36, 2.36, 4.36]) for (let i = 0; i < 4; i++) {
    if (hash(seed + y * 7 + i) < 0.2) continue;
    g.box(-0.75, 0.75, y, y + 1.4, -9.4 + i * 5, -6.0 + i * 5, wrap[Math.floor(hash(seed * 2 + i + y) * 3)]);
  }
  return done(g);
}
/** port_rail_track_40: ballast bed with sleeper bands + two rails (gauge 1.5) along z. ~64 tris */
function railTrack(): Piece {
  const g = new G(), bal = C(0x4a4642), sl = C(0x3a2e24), rail = C(0x9aa0a6);
  for (let i = 0; i < 20; i++) {
    const z0 = -20 + i * 2, z1 = z0 + 2;
    g.quad([1.5, 0.12, z0], [-1.5, 0.12, z0], [-1.5, 0.12, z1], [1.5, 0.12, z1], i % 2 ? bal : sl, i % 2 ? bal : sl);
  }
  g.quad([1.5, 0.12, -20], [1.5, 0.12, 20], [1.9, 0, 20], [1.9, 0, -20], mul(bal, 0.8));
  g.quad([-1.9, 0, -20], [-1.9, 0, 20], [-1.5, 0.12, 20], [-1.5, 0.12, -20], mul(bal, 0.8));
  for (const x of [-0.75, 0.75]) g.box(x - 0.05, x + 0.05, 0.12, 0.3, -20, 20, [rail, rail, mul(rail, 1.3), null, null, null]);
  return done(g);
}
/** port_rail_crossing_12: 8 m concrete panel strip across a side (12 m), two rails across the road (local x). ~24 tris */
function railCrossing(): Piece {
  const g = new G(), pan = C(0x77746e), rail = C(0xa8adb2);
  g.quad([6, 0, -4], [-6, 0, -4], [-6, 0, 4], [6, 0, 4], pan, mul(pan, 0.85));
  for (const z of [-0.75, 0.75]) g.box(-6, 6, 0, 0.06, z - 0.05, z + 0.05, [null, null, rail, null, rail, rail]);
  for (const z of [-3.6, 3.6]) g.quad([6, 0.01, z - 0.15], [-6, 0.01, z - 0.15], [-6, 0.01, z + 0.15], [6, 0.01, z + 0.15], YEL);
  return done(g);
}
/** port_flatcar: 3 x 2 x 15 flat wagon on two bogies, stake posts. ~150 tris */
function flatcar(): Piece {
  const g = new G(), deck = C(0x5a3a2a), frame = C(0x2c2e31);
  g.box(-1.5, 1.5, 1.1, 1.4, -7.5, 7.5, [frame, frame, deck, null, frame, frame]);
  for (const z of [-5.2, 5.2]) g.box(-1.1, 1.1, 0.2, 1.1, z - 1.2, z + 1.2, frame);
  for (const sx of [-1.4, 1.4]) for (let i = 0; i < 5; i++) g.box(sx - 0.07, sx + 0.07, 1.4, 2.0, -6 + i * 3 - 0.07, -6 + i * 3 + 0.07, frame);
  return done(g);
}
/** port_ship_hull_backdrop: 200 m hull (keel -10, deck +18, bow at +z), stern superstructure with lit windows, two masts. ~260 tris */
function hull(seed: number): Piece {
  const g = new G(), l = new G();
  const body = mix(C(0x1e2a36), C(0x2e2a26), hash(seed)), boot = C(0x7a2a22), sup = C(0xb9b6ac);
  const sec = (z: number) => { const t = z > 60 ? (z - 60) / 40 : 0; return 15 * (1 - t * t * 0.95); };
  const zs = [-100, -60, -20, 20, 60, 75, 88, 100];
  for (let i = 0; i + 1 < zs.length; i++) {
    const za = zs[i], zb = zs[i + 1], wa = sec(za), wb = sec(zb);
    for (const sx of [-1, 1]) {
      const q = (a: V3, b: V3, c: V3, d: V3, k: RGB) => (sx > 0 ? g.quad(a, b, c, d, k) : g.quad(d, c, b, a, k));
      q([sx * wa * 0.75, -10, za], [sx * wa, -1.2, za], [sx * wb, -1.2, zb], [sx * wb * 0.75, -10, zb], boot);
      q([sx * wa, -1.2, za], [sx * wa, 18, za], [sx * wb, 18, zb], [sx * wb, -1.2, zb], body);
    }
    g.quad([wa, 18, za], [-wa, 18, za], [-wb, 18, zb], [wb, 18, zb], C(0x3a3c3e));
  }
  g.quad([15, -10, -100], [15, 18, -100], [-15, 18, -100], [-15, -10, -100], mul(body, 0.8));
  // superstructure (stern) + funnel
  g.box(-12, 12, 18, 34, -96, -78, sup);
  g.box(-14, 14, 34, 35.5, -97, -77, mul(sup, 0.8));
  g.box(-3, 3, 35.5, 44, -92, -86, C(0x8a2a20));
  for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) {
    if (hash(seed * 11 + row * 7 + i) < 0.35) continue;
    const y = 21 + row * 3.4, x0 = -10 + i * 3.6;
    l.quad([x0, y, -78 + 0.06], [x0 + 2.2, y, -78 + 0.06], [x0 + 2.2, y + 1.4, -78 + 0.06], [x0, y + 1.4, -78 + 0.06], WIN);
  }
  for (const z of [-20, 40]) { g.box(-0.6, 0.6, 18, 40, z - 0.6, z + 0.6, sup); l.box(-0.4, 0.4, 40, 40.8, z - 0.4, z + 0.4, LAMP_R); }
  for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) { const x = sx * 15.08, z = -80 + i * 18; l.quad([x, 16, z], [x, 16.4, z], [x, 16.4, z + 0.8], [x, 16, z + 0.8], LAMP_W); }
  return done(g, l);
}
/** IP-9 quay water tile (40 x 40), slight ripple shading; drawn on port_water (y -1.5, over the -1.6 harbour plane) */
function waterTile(seed: number): Piece {
  const g = new G(), n = 4, s = 10;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x0 = -20 + i * s, z0 = -20 + j * s;
    const k = (a: number, b: number) => mul(C(0x2c4a66), 0.8 + 0.4 * hash(seed + (i + a) * 7 + (j + b) * 13));
    g.quad([x0 + s, 0, z0], [x0, 0, z0], [x0, 0, z0 + s], [x0 + s, 0, z0 + s], k(1, 0), k(0, 0), k(0, 1), k(1, 1));
  }
  return done(g);
}
/** port_oil_decal: 6 x 30 irregular slick (18-gon fan), dark core, iridescent rim (port_oil material) */
function oilDecal(seed: number): Piece {
  const g = new G(), n = 18, core: RGB = [0.008, 0.008, 0.011], rim: RGB = [0.07, 0.06, 0.08];
  const rimAt = (k: number): V3 => {
    const a = (k / n) * Math.PI * 2, r = 0.82 + 0.18 * hash(seed + k * 3.3);
    return [Math.cos(a) * 3 * r, 0, Math.sin(a) * 15 * r];
  };
  for (let k = 0; k < n; k++) g.tri([0, 0, 0], rimAt(k + 1), rimAt(k), core, rim, rim);
  return done(g);
}

const cache = new Map<string, Piece>();
function piece(p: PortPlace): Piece | null {
  const key = p.name === "port_container_12" ? `c${p.tint ?? 0}` : p.name === "port_warehouse_block" || p.name === "port_racking" || p.name === "port_ship_hull_backdrop" || p.name === "port_water_tile" || p.name === "port_oil_decal" ? `${p.name}:${Math.round(p.s)}` : p.name;
  let c = cache.get(key);
  if (c) return c;
  const seed = Math.round(p.s);
  switch (p.name) {
    case "port_container_12": c = container(p.tint ?? 0); break;
    case "port_parapet_4m": c = parapet(); break;
    case "port_bollard": c = bollard(); break;
    case "port_fence_4m": c = fence(); break;
    case "port_security_booth": c = booth(); break;
    case "port_warehouse_block": c = warehouse(seed); break;
    case "port_sts_crane": c = stsCrane(); break;
    case "port_shed_tunnel_40": c = shedSection(); break;
    case "port_shed_portal": c = shedPortal(); break;
    case "port_racking": c = racking(seed); break;
    case "port_rail_track_40": c = railTrack(); break;
    case "port_rail_crossing_12": c = railCrossing(); break;
    case "port_flatcar": c = flatcar(); break;
    case "port_ship_hull_backdrop": c = hull(seed); break;
    case "port_water_tile": c = waterTile(seed); break;
    case "port_oil_decal": c = oilDecal(seed); break;
    default: return null;
  }
  cache.set(key, c);
  return c;
}
/** triangle counts of the procedural pieces (budget check, tests) */
export function portPieceTris(name: string, tint = 0): number {
  const c = piece({ name, s: 0, lx: 0, ly: 0, ry: 0, ground: true, detail: false, tint });
  return c ? (c.p.length + c.lp.length + (c.rp?.length ?? 0)) / 9 : -1;
}

// ---------------------------------------------------------------- materials
let propsMat: THREE.MeshLambertMaterial | null = null;
export function portPropsMaterial() {
  if (!propsMat) {
    propsMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    propsMat.name = "port_props";
  }
  return propsMat;
}
let lampMat: THREE.MeshBasicMaterial | null = null;
export function portLampMaterial() {
  if (!lampMat) {
    lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    lampMat.name = "port_lamps";
  }
  return lampMat;
}
let waterMat: THREE.MeshStandardMaterial | null = null;
export function portWaterMaterial() {
  if (!waterMat) {
    waterMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.32, metalness: 0.35, emissive: 0x050b12 });
    waterMat.name = "port_water";
  }
  return waterMat;
}
/** oil: near-black glossy slick with a thin-film rainbow sheen (world-space bands, stronger at grazing view and on the rim).
 *  Emissive so it reads from 120 m under the port fog. */
let oilMat: THREE.MeshStandardMaterial | null = null;
export function portOilMaterial() {
  if (!oilMat) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.94, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.name = "port_oil";
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("void main() {", "varying vec3 vNfW;\nvoid main() {")
        .replace("#include <project_vertex>", "#include <project_vertex>\n vNfW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", "varying vec3 vNfW;\nvoid main() {")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
 { float nfB = vNfW.x * 0.37 + vNfW.z * 0.29 + sin( vNfW.x * 0.9 ) * 0.8 + sin( vNfW.z * 0.7 + vNfW.x * 0.3 ) * 0.9;
   vec3 nfRain = 0.5 + 0.5 * cos( 6.2831 * ( nfB * 0.35 + vec3( 0.0, 0.33, 0.67 ) ) );
   float nfRim = smoothstep( 0.02, 0.06, vColor.r );
   float nfGraze = 1.0 - abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
   totalEmissiveRadiance += nfRain * ( 0.025 + 0.11 * nfRim + 0.07 * nfGraze ); }`);
    };
    m.customProgramCacheKey = () => "nf_port_oil";
    oilMat = m;
  }
  return oilMat;
}

// ---------------------------------------------------------------- per-chunk baking
type Acc = { p: number[]; c: number[] };
const acc = (): Acc => ({ p: [], c: [] });
const tv = new THREE.Vector3();
function bake(into: Acc, src: Float32Array, col: Float32Array, m: THREE.Matrix4) {
  for (let i = 0; i < src.length; i += 3) {
    tv.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(m);
    into.p.push(tv.x, tv.y, tv.z);
  }
  for (let i = 0; i < col.length; i++) into.c.push(col[i]);
}
function geo(a: Acc, normals: boolean, piece: string): THREE.BufferGeometry | null {
  if (!a.p.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(a.p, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(a.c, 3));
  if (normals) g.computeVertexNormals();
  g.userData.piece = piece;
  return g;
}

/** chunk-local point at road pose p, course lat (right +), absolute y */
const P = (p: Pose, lat: number, y: number, ox: number, oz: number): V3 => [p.x + p.rx * lat - ox, y, p.z + p.rz * lat - oz];
export const PORT_YARD = { left: 140, right: 80, quay: { s0: 3390, s1: 4000, lat: 15 }, dock: { s0: 1790, s1: 1990, lat0: 28, lat1: 112, floor: -10 }, water: -1.7 };
const APRON = C(0x55575a), APRON2 = C(0x4a4b4d), STAIN = C(0x34312d), POOL = C(0xb0844e), QUAY = C(0x5c5a56);
/** sodium light pools on the yard: under every crane and a high-mast pool every 60 m, alternating sides */
function apronLight(s: number, lat: number) {
  let k = 0;
  for (const cs of PORT_CRANE_S) k = Math.max(k, Math.max(0, 1 - Math.abs(s - cs) / 26) * Math.max(0, 1 - Math.max(0, Math.abs(lat) - 12) / 14));
  const m = ((s % 60) + 60) % 60, side = Math.floor(s / 60) % 2 ? 1 : -1;
  k = Math.max(k, Math.max(0, 1 - Math.abs(m - 30) / 18) * Math.max(0, 1 - Math.abs(lat - side * 24) / 16) * 0.8);
  return k;
}
function apronColour(s: number, lat: number): RGB {
  const cell = hash(Math.floor(s / 6) * 7.1 + Math.floor(lat / 6) * 3.3);
  let c = mix(APRON2, APRON, cell);
  if (hash(Math.floor(s / 9) * 1.7 + Math.floor(lat / 5) * 9.1) > 0.86) c = mix(c, STAIN, 0.6);
  return mix(c, POOL, 0.55 * apronLight(s, lat));
}
/** yard apron (both sides out to the harbour), quay wall at IP-9, dry-dock basin at IP-5, painted bay lines */
function apron(g: G, at: (k: number) => Pose, seg: number, cs0: number, ox: number, oz: number) {
  const lats = (s: number, side: number) => {
    const half = widthAt(INDUSTRIAL_PORT, s) / 2;
    let out = side < 0 ? [half + 0.3, half + 3, 18, 26, 36, 50, 70, 100, PORT_YARD.left] : [half + 0.3, half + 3, 18, 26, 36, 50, 70, PORT_YARD.right, PORT_YARD.right];
    if (side > 0 && s >= PORT_YARD.quay.s0 && s <= PORT_YARD.quay.s1) out = out.map((l) => Math.min(l, PORT_YARD.quay.lat));
    if (side > 0 && s >= PORT_YARD.dock.s0 && s <= PORT_YARD.dock.s1) out = out.map((l) => Math.min(l, PORT_YARD.dock.lat0));
    return out;
  };
  for (const side of [-1, 1]) {
    for (let k = 0; k < seg; k++) {
      const pa = at(k), pb = at(k + 1), sa = cs0 + k * 2, sb = sa + 2;
      const la = lats(sa, side), lb = lats(sb, side);
      for (let i = 0; i + 1 < la.length; i++) {
        const a0 = P(pa, side * la[i], 0, ox, oz), a1 = P(pa, side * la[i + 1], 0, ox, oz), b0 = P(pb, side * lb[i], 0, ox, oz), b1 = P(pb, side * lb[i + 1], 0, ox, oz);
        g.quad(a0, a1, b1, b0, apronColour(sa, side * la[i]), apronColour(sa, side * la[i + 1]), apronColour(sb, side * lb[i + 1]), apronColour(sb, side * lb[i]));
      }
      // quay wall face down to the water at the outer edge
      const ea = la[la.length - 1], eb = lb[lb.length - 1];
      const dockA = side > 0 && sa >= PORT_YARD.dock.s0 && sa <= PORT_YARD.dock.s1, dockB = side > 0 && sb >= PORT_YARD.dock.s0 && sb <= PORT_YARD.dock.s1;
      const bottom = dockA && dockB ? PORT_YARD.dock.floor : PORT_YARD.water;
      g.quad(P(pa, side * ea, 0, ox, oz), P(pa, side * ea, bottom, ox, oz), P(pb, side * eb, bottom, ox, oz), P(pb, side * eb, 0, ox, oz), QUAY, mul(QUAY, 0.45), mul(QUAY, 0.45), QUAY);
      // quay edge: a yellow safety kerb along the drop (reads the harbour edge at night)
      g.quad(P(pa, side * (ea - 0.5), 0.03, ox, oz), P(pa, side * ea, 0.03, ox, oz), P(pb, side * eb, 0.03, ox, oz), P(pb, side * (eb - 0.5), 0.03, ox, oz), mul(YEL, 0.8));
      // painted bay lines (dashed yellow at 22 / 30 m), off the quay / dock clamps
      if (k % 2 === 0) for (const bl of [22, 30]) {
        if (bl > la[la.length - 1] - 1 || bl > lb[lb.length - 1] - 1) continue;
        const y = 0.02;
        g.quad(P(pa, side * (bl - 0.12), y, ox, oz), P(pa, side * (bl + 0.12), y, ox, oz), P(pb, side * (bl + 0.12), y, ox, oz), P(pb, side * (bl - 0.12), y, ox, oz), mul(YEL, 0.7));
      }
      // dry-dock basin: floor at -10, far wall, keel blocks under the hull line (lat 70)
      if (dockA && dockB) {
        const f0 = P(pa, PORT_YARD.dock.lat0, PORT_YARD.dock.floor, ox, oz), f1 = P(pa, PORT_YARD.dock.lat1, PORT_YARD.dock.floor, ox, oz);
        const g0 = P(pb, PORT_YARD.dock.lat0, PORT_YARD.dock.floor, ox, oz), g1 = P(pb, PORT_YARD.dock.lat1, PORT_YARD.dock.floor, ox, oz);
        const fl = mul(QUAY, 0.55 + 0.1 * hash(sa));
        g.quad(f0, f1, g1, g0, fl);
        g.quad(f1, P(pa, PORT_YARD.dock.lat1, 0, ox, oz), P(pb, PORT_YARD.dock.lat1, 0, ox, oz), g1, mul(QUAY, 0.45), QUAY, QUAY, mul(QUAY, 0.45));
        // the far quay beyond the basin
        g.quad(P(pa, PORT_YARD.dock.lat1, 0, ox, oz), P(pa, PORT_YARD.right + 60, 0, ox, oz), P(pb, PORT_YARD.right + 60, 0, ox, oz), P(pb, PORT_YARD.dock.lat1, 0, ox, oz), APRON2);
      }
    }
    // dock end walls where the basin starts / stops inside this chunk
    for (const ds of [PORT_YARD.dock.s0, PORT_YARD.dock.s1]) {
      const k = Math.round((ds - cs0) / 2);
      if (side < 0 || k < 0 || k > seg) continue;
      const p = at(k);
      g.quad(P(p, PORT_YARD.dock.lat0, 0, ox, oz), P(p, PORT_YARD.dock.lat1, 0, ox, oz), P(p, PORT_YARD.dock.lat1, PORT_YARD.dock.floor, ox, oz), P(p, PORT_YARD.dock.lat0, PORT_YARD.dock.floor, ox, oz), QUAY, QUAY, mul(QUAY, 0.45), mul(QUAY, 0.45));
    }
  }
}
/** Fork A container-top deck (BN-15): steel top at the side lift over lat 0.3..12, lane dash at 6, yellow edges; the
 *  climb / descent (port_container_ramp, 1250-1310 / 1660-1720) get braced steel side faces (the containers face 1310-1660). */
function deckTop(g: G, at: (k: number) => Pose, seg: number, cs0: number, ox: number, oz: number) {
  const plate = C(0x3e4246), dash = C(0xd8d8d0), edge = YEL, side = C(0x5a5048);
  const lift = (s: number) => sideLiftAt(INDUSTRIAL_PORT, s, 6);
  const bands: [number, number, (s: number) => RGB][] = [
    [PORT_DECK.lat0, PORT_DECK.lat0 + 0.35, () => edge],
    [PORT_DECK.lat0 + 0.35, 5.88, (s) => mul(plate, 0.9 + 0.2 * hash(Math.floor(s / 12.2)))],
    [5.88, 6.12, (s) => (Math.floor(s / 6) % 2 ? dash : plate)],
    [6.12, PORT_DECK.lat1 - 0.35, (s) => mul(plate, 0.9 + 0.2 * hash(Math.floor(s / 12.2) + 3))],
    [PORT_DECK.lat1 - 0.35, PORT_DECK.lat1, () => edge],
  ];
  for (let k = 0; k < seg; k++) {
    const sa = cs0 + k * 2, sb = sa + 2;
    if (sb <= PORT_DECK.s0 || sa >= PORT_DECK.s1) continue;
    const ha = lift(sa), hb = lift(sb);
    if (ha < 0.02 && hb < 0.02) continue;
    const pa = at(k), pb = at(k + 1), ya = pa.y + ha + 0.06, yb = pb.y + hb + 0.06;
    for (const [l0, l1, col] of bands) g.quad(P(pa, l0, ya, ox, oz), P(pa, l1, ya, ox, oz), P(pb, l1, yb, ox, oz), P(pb, l0, yb, ox, oz), col(sa));
    const ramp = sa < 1310 || sb > 1660;
    if (ramp) for (const l of [PORT_DECK.lat0, PORT_DECK.lat1]) {
      const brace = Math.floor(sa / 6) % 2 ? 1 : 0.75;
      g.quad(P(pa, l, pa.y, ox, oz), P(pa, l, ya, ox, oz), P(pb, l, yb, ox, oz), P(pb, l, pb.y, ox, oz), mul(side, 0.6), mul(side, brace), mul(side, brace), mul(side, 0.6));
    }
  }
}

export type PortChunkOut = { roof: THREE.Group | null; placed: string[] };
export const portLog: Record<string, Record<string, number>> = {};
const logged = new Set<number>();
/** procedural pieces the chunk draws from its own samples (the placement still counts as placed) */
const CHUNK_DRAWN = new Set(["port_deck_top", "port_container_ramp"]);

export function buildPortChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, ox: number, oz: number, c: ChunkCourse): PortChunkOut {
  const out: PortChunkOut = { roof: null, placed: [] };
  if (!portReady()) return out;
  const parts: Parts = new Map();
  const props = acc(), lamps = acc(), roof = acc(), roofLamps = acc(), oil = acc(), water = acc();
  const m4 = new THREE.Matrix4(), sc = new THREE.Matrix4();
  const s0 = c.cs0, s1 = c.cs0 + seg * 2;
  const kAt = (s: number) => Math.max(0, Math.min(seg, Math.round((s - s0) / 2)));
  for (const p of portIn(s0, s1)) {
    if (CHUNK_DRAWN.has(p.name)) { out.placed.push(p.name); continue; }
    const pose = at(kAt(p.s));
    const dz = p.s - (s0 + kAt(p.s) * 2);
    // ground pieces sit on the yard (absolute y = ly); deck pieces ride the road deck plus any BN-15 side lift at their lat
    const ly = p.ground ? p.ly - pose.y : p.ly + sideLiftAt(INDUSTRIAL_PORT, p.s, -p.lx);
    const pc = piece(p);
    if (pc) {
      placeMatrix(pose, p.lx, ly, dz, p.ry, ox, oz, m4);
      if (p.sz) m4.multiply(sc.makeScale(1, 1, p.sz));
      const into = p.name === "port_oil_decal" ? oil : p.name === "port_water_tile" ? water : props;
      bake(into, pc.p, pc.c, m4);
      bake(lamps, pc.lp, pc.lc, m4);
      if (pc.rp && pc.rc) bake(roof, pc.rp, pc.rc, m4);
      out.placed.push(p.name);
      continue;
    }
    // shared kit pieces
    if (p.name === "barrier_jersey_4m" || p.name === "coast_guardrail_4m") {
      if (bakePieceBent(parts, p.name, chunkFrame(at, kAt(p.s), seg), true, p.lx, ly, p.ry, ox, oz)) out.placed.push(p.name);
      continue;
    }
    if (bakePiece(parts, p.name, placeMatrix(pose, p.lx, ly, dz, p.ry, ox, oz, m4))) out.placed.push(p.name);
  }
  void roofLamps;
  const g = new G();
  apron(g, at, seg, s0, ox, oz);
  deckTop(g, at, seg, s0, ox, oz);
  props.p.push(...g.p);
  props.c.push(...g.c);
  if (c.grid && bakePieceBent(parts, "start_grid_paint_40", chunkFrame(at, Math.floor(seg / 2), seg), true, 0, 0.05, 0, ox, oz)) out.placed.push("start_grid_paint_40");
  for (const k of c.kick) if (bakePieceBent(parts, "ramp_lip_chevron_24", chunkFrame(at, k, seg), true, 0, 0.05, 0, ox, oz)) out.placed.push("ramp_lip_chevron_24");
  if (c.finishK >= 0 && bakePiece(parts, "finish_gantry_24", placeMatrix(at(c.finishK), 0, 0.05, 0, 0, ox, oz, m4))) out.placed.push("finish_gantry_24");
  const gp = geo(props, true, "port_props"), gl = geo(lamps, false, "port_lamps"), go = geo(oil, true, "port_oil_decal"), gw = geo(water, true, "port_water_tile");
  if (gp) parts.set(portPropsMaterial(), [gp]);
  if (gl) parts.set(portLampMaterial(), [gl]);
  if (go) parts.set(portOilMaterial(), [go]);
  if (gw) parts.set(portWaterMaterial(), [gw]);
  for (const mesh of flushParts(parts, group)) mesh.userData.core = mesh.geometry.getAttribute("position").count;
  const gr = geo(roof, true, "port_shed_roof");
  if (gr) {
    const rg = new THREE.Group();
    rg.userData.shed = true;
    const mesh = new THREE.Mesh(gr, portPropsMaterial());
    mesh.userData.pieces = ["port_shed_roof"];
    rg.add(mesh);
    group.add(rg);
    out.roof = rg;
  }
  if (!logged.has(index)) {
    logged.add(index);
    const row: Record<string, number> = {};
    for (const n of out.placed) row[n] = (row[n] ?? 0) + 1;
    portLog[`${c.lap}:${Math.round(c.cs0)}`] = row;
  }
  return out;
}

// ---------------------------------------------------------------- world-level movers (instanced, posed per frame by world.ts)
/** a hanging crane load: one container (length across the road, local x) + spreader bar; origin at the spreader top */
export function craneLoadGeometry(): THREE.BufferGeometry {
  const g = new G(), base = CONTAINER_TINTS[4];
  g.box(-BOX.l / 2, BOX.l / 2, -BOX.h - 0.5, -0.5, -BOX.w / 2, BOX.w / 2, [mul(base, 0.8), mul(base, 0.8), mul(base, 0.7), mul(base, 0.5), base, base]);
  g.box(-BOX.l / 2 - 0.2, BOX.l / 2 + 0.2, -0.5, 0, -BOX.w / 2 - 0.15, BOX.w / 2 + 0.15, YEL);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(g.c, 3));
  geo.computeVertexNormals();
  return geo;
}
/** unit cable bundle (4 thin cables, 1 m tall from y 0 to 1), scaled in y to the boom */
export function craneCableGeometry(): THREE.BufferGeometry {
  const g = new G(), k = C(0x1a1a1a);
  for (const [x, z] of [[-4, -0.9], [-4, 0.9], [4, -0.9], [4, 0.9]]) g.box(x - 0.05, x + 0.05, 0, 1, z - 0.05, z + 0.05, k);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(g.c, 3));
  geo.computeVertexNormals();
  return geo;
}
/** port_crane_shadow_decal: 8 m (along) x 24 m (across) telegraph: dark core with a red-amber hazard rim. 8 tris */
export function craneShadowGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  const v = (x: number, z: number, c: number) => { pos.push(x, 0, z); col.push(c, c, c); };
  const o = [[-12, -4], [12, -4], [12, 4], [-12, 4]], i = [[-10, -2.6], [10, -2.6], [10, 2.6], [-10, 2.6]];
  for (let k = 0; k < 4; k++) {
    const a = o[k], b = o[(k + 1) % 4], c = i[(k + 1) % 4], d = i[k];
    v(a[0], a[1], 1); v(b[0], b[1], 1); v(c[0], c[1], 0.35);
    v(a[0], a[1], 1); v(c[0], c[1], 0.35); v(d[0], d[1], 0.35);
  }
  v(-10, -2.6, 0.35); v(10, -2.6, 0.35); v(10, 2.6, 0.35);
  v(-10, -2.6, 0.35); v(10, 2.6, 0.35); v(-10, 2.6, 0.35);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
/** port_forklift: 2.2 x 2.4 x 4 m, yellow body, overhead guard, mast + forks at the front (+Z), counterweight. ~300 tris */
export function forkliftGeometry(): THREE.BufferGeometry {
  const g = new G(), body = C(0xe0a81e), dark = C(0x2a2b2d), tyre = C(0x111111);
  g.box(-1.1, 1.1, 0.35, 1.3, -1.6, 1.2, body);
  g.box(-1.0, 1.0, 0.35, 1.5, -2.0, -1.4, mul(body, 0.7)); // counterweight
  g.box(-0.8, 0.8, 1.3, 1.7, -1.0, 0.6, dark); // seat / cowl
  for (const [x, z] of [[-1, -1.2], [1, -1.2], [-1, 0.9], [1, 0.9]]) g.box(x - 0.09, x + 0.09, 1.3, 2.4, z - 0.09, z + 0.09, dark);
  g.box(-1.05, 1.05, 2.3, 2.4, -1.3, 1.0, dark); // guard roof
  for (const x of [-0.6, 0.6]) g.box(x - 0.1, x + 0.1, 0.1, 3.4, 1.3, 1.5, dark); // mast
  g.box(-0.65, 0.65, 2.9, 3.05, 1.3, 1.5, dark);
  for (const x of [-0.45, 0.45]) g.box(x - 0.08, x + 0.08, 0.15, 0.25, 1.5, 2.6, mul(dark, 1.4)); // forks
  g.box(-0.7, 0.7, 0.15, 1.2, 1.5, 1.6, mul(dark, 1.2));
  for (const [x, z] of [[-1.05, -1.3], [1.05, -1.3], [-1.05, 0.8], [1.05, 0.8]]) g.box(x - 0.2, x + 0.2, 0, 0.7, z - 0.35, z + 0.35, tyre);
  // amber beacon + head lamps (vertex colour pushed past 1 so they read as lit under the Lambert)
  g.box(-0.12, 0.12, 2.4, 2.65, -0.5, -0.26, [3, 1.6, 0.3]);
  for (const x of [-0.8, 0.8]) g.box(x - 0.14, x + 0.14, 1.0, 1.2, 1.2, 1.25, [3, 3, 2.6]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(g.c, 3));
  geo.computeVertexNormals();
  return geo;
}
/** crane load pose at race clock: lateral of the load centre and bottom height above the deck, and the shadow state.
 *  Sweeps alternate direction each cycle; idle parks the load hoisted at the side the last sweep ended on. */
export function craneLoadPose(reach: number[], ph: { n: number; state: "idle" | "telegraph" | "active"; u: number }) {
  const [a, b] = reach[0] < 0 ? [-22, 22] : [19.5, -0.5];
  const from = ph.n % 2 ? b : a, to = ph.n % 2 ? a : b;
  const ease = (t: number) => t * t * (3 - 2 * t);
  if (ph.state === "active") return { lat: from + (to - from) * ease(ph.u), bottom: 1.0, shadow: 1 };
  if (ph.state === "telegraph") return { lat: from, bottom: 1.0 + 9 * (1 - ease(Math.min(1, ph.u * 1.6))), shadow: 0.6 + 0.4 * Math.abs(Math.sin(ph.u * Math.PI * 3)) };
  // idle: hoist up after the sweep, hold high
  return { lat: from, bottom: 1.0 + 9 * ease(Math.min(1, ph.u * 2.5)), shadow: 0 };
}
export const CRANE_BOOM_Y = 41;
