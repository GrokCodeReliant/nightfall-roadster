// week-i-pass: Mountain Pass stage scenery (LEVELS/06_mountain_pass.md v1.0, ART_LISTS/06 §B). Every mtn_* piece is an
// original procedural mesh built here (vertex colours, no textures, no text, names or logos). Placement is the authored
// passcourse.ts table on course s. Per 40 m chunk everything opaque merges into ONE vertex-coloured material (mtn_props:
// rock walls / scree strips, snow guardrail, chevron boards, shed, pines, lodge, station, ski-jump structure, drift row,
// kicker, fence, flags), the lit bits into ONE unlit material (mtn_lamps: chevron faces, windows, shed lamps), the ice
// decals and frozen-lake tiles into ONE glossy material (mtn_ice), plus the shared kit pieces (jersey, terminals, signs,
// crates, grid, lip chevron, gantry). The shed roof sits in a roof group hidden while the hero is under it (BN-7).
// The terrain is world-level tiles (passterrain.ts), the falling rocks / shadows and the peak backdrops world-level meshes.
import * as THREE from "three";
import { bakePiece, bakePieceBent, chunkFrame, flushParts, loadPieces, placeMatrix, type Parts, type Pose } from "./city";
import type { ChunkCourse } from "./coastcourse";
import { SUMMIT_LEAP } from "./course";
import { acc, bake, C, done, G, geo, hash, mix, mul, type Piece, type RGB, type V3 } from "./port";
import { edgeAt, passIn, PASS_SHED, type PassPlace } from "./passcourse";
import { passGroundY, PASS_FLOOR, PASS_LAKE_Y, wallSetback } from "./passterrain";

export const PASS_PIECES: [string, string][] = [
  ["coast", "coast_guardrail_end_4m"], ["coast", "coast_crate"],
  ["kit", "sign_fork"], ["kit", "barrier_jersey_4m"], ["kit", "start_grid_paint_40"], ["kit", "ramp_lip_chevron_24"], ["city", "finish_gantry_24"],
];
let loaded = 0;
let asked = false;
export const passReady = () => loaded >= PASS_PIECES.length;
export function loadPass() {
  if (asked) return;
  asked = true;
  loadPieces(PASS_PIECES, () => { loaded++; });
}

// ---------------------------------------------------------------- palette (night: mid values; the moon rig lifts the snow)
const SNOW = C(0xdfe7f2), SNOW_B = C(0xb7c4d8), ROCK = C(0x5b5650), ROCK_D = C(0x3a3631), CONC = C(0x77797c), CONC_D = C(0x4c4e52);
const STEEL = C(0x8d9399), DARK = C(0x1c1d20), WOOD = C(0x5a3b26), WOOD_D = C(0x3b2618), PINE = C(0x1f3b2c), PINE_D = C(0x15291f);
const RED = C(0xa8342a), BLUE = C(0x2d5d9a), YEL = C(0xe0b030), WHITE = C(0xf2f2ee), WIN = C(0xf0c47a), LAMP = C(0xfff0d0), CHEV = C(0xffd23a);

// ---------------------------------------------------------------- pieces (local: +X left, +Y up, +Z forward; faces toward the
// road are on local -X for pieces placed on the left kerb; right-kerb pieces are turned PI)
function guardrail(): Piece {
  const g = new G();
  for (const z of [-1.6, 1.6]) {
    g.box(-0.08, 0.08, 0, 0.84, z - 0.08, z + 0.08, [STEEL, STEEL, null, null, STEEL, STEEL]);
    g.box(-0.1, 0.1, 0.84, 0.95, z - 0.12, z + 0.12, [SNOW, SNOW, SNOW, null, SNOW, SNOW]);
  }
  g.box(-0.2, -0.08, 0.5, 0.82, -2, 2, [STEEL, mul(STEEL, 1.1), STEEL, mul(STEEL, 0.5), null, null]);
  // snow lying on the beam
  g.box(-0.22, 0.02, 0.82, 0.9, -2, 2, [SNOW, SNOW, SNOW, null, null, null]);
  return done(g);
}
/** chevron board, face toward local -Z (the approaching driver); the arrow points to local +X * dir (the turn) */
function chevron(dir: number): Piece {
  const g = new G(), l = new G();
  g.box(-0.07, 0.07, 0, 1.0, -0.07, 0.07, [DARK, DARK, null, null, DARK, DARK]);
  g.box(-0.8, 0.8, 1.0, 3.2, 0.0, 0.1, [DARK, DARK, SNOW, null, DARK, DARK]);
  // the yellow arrow on the -Z face: two bars meeting at the point
  const z = -0.01, t = 0.28;
  const tip = 0.55 * dir, back = -0.45 * dir;
  const ym = 2.1 - t / 2;
  for (const y0 of [1.35, 2.85 - t]) l.quad([back, y0, z], [tip, ym, z], [tip, ym + t, z], [back, y0 + t, z], CHEV);
  return done(g, l);
}
function fence(): Piece {
  const g = new G();
  for (const z of [-1.9, 1.9]) g.box(-0.08, 0.08, 0, 1.3, z - 0.08, z + 0.08, [WOOD_D, WOOD_D, SNOW, null, WOOD_D, WOOD_D]);
  for (const y of [0.55, 1.05]) {
    g.box(-0.05, 0.05, y, y + 0.14, -2, 2, [WOOD, WOOD, null, WOOD_D, null, null]);
    g.box(-0.06, 0.06, y + 0.14, y + 0.2, -2, 2, [SNOW, SNOW, SNOW, null, null, null]);
  }
  return done(g);
}
function pine(seed: number): Piece {
  const g = new G();
  const k = 0.8 + hash(seed) * 0.45, n = 7;
  g.box(-0.25, 0.25, -0.5, 2.0 * k, -0.25, 0.25, [WOOD_D, WOOD_D, null, null, WOOD_D, WOOD_D]);
  const tiers: [number, number, number][] = [[1.6, 2.6, 6.2], [5.0, 2.0, 9.4], [8.2, 1.35, 13.6]];
  for (const [y0, r, y1] of tiers) {
    const yb = y0 * k, yt = y1 * k, ym = yb + (yt - yb) * 0.45, rm = r * k * 0.6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + seed, a1 = ((i + 1) / n) * Math.PI * 2 + seed;
      const at = (a: number, rr: number, y: number): V3 => [Math.cos(a) * rr, y, Math.sin(a) * rr];
      g.quad(at(a0, r * k, yb), at(a1, r * k, yb), at(a1, rm, ym), at(a0, rm, ym), i % 2 ? PINE : PINE_D, i % 2 ? PINE : PINE_D, SNOW_B, SNOW_B);
      g.tri(at(a0, rm, ym), at(a1, rm, ym), [0, yt, 0], SNOW_B, SNOW_B, SNOW);
    }
  }
  return done(g);
}
/** avalanche shed section (40 m): uphill back wall on the left (+X), valley columns on the right (-X), roof slab in the roof group */
function shedSection(): Piece {
  const g = new G(), l = new G(), r = new G();
  const W = PASS_SHED.half, H = PASS_SHED.h;
  g.box(W - 0.8, W, PASS_FLOOR, H, -20, 20, [CONC_D, CONC, CONC, null, null, null]);
  // ribs on the inner face of the back wall, every 8 m
  for (let z = -16; z <= 16; z += 8) g.box(W - 1.4, W - 0.8, PASS_FLOOR, H - 0.4, z - 0.4, z + 0.4, [CONC, CONC, CONC, null, CONC, CONC]);
  // valley columns + the lintel beam
  for (let z = -16; z <= 16; z += 8) g.box(-W, -W + 0.9, PASS_FLOOR, H - 0.8, z - 0.45, z + 0.45, [CONC, CONC, null, null, CONC, CONC]);
  g.box(-W - 0.2, -W + 1.2, H - 1.6, H - 0.8, -20, 20, [CONC, CONC, null, CONC_D, null, null]);
  // lamps under the roof (two per section, the warm pools read the shed from inside)
  for (const z of [-10, 10]) l.box(-0.6, 0.6, H - 0.95, H - 0.85, z - 1.2, z + 1.2, LAMP);
  // roof slab (+ its snow load), hidden from inside (BN-7)
  r.box(-W - 0.6, W + 0.4, H - 0.8, H, -20, 20, [CONC_D, CONC_D, null, mul(CONC_D, 0.8), null, null]);
  r.box(-W - 0.4, W + 0.2, H, H + 0.7, -20, 20, [SNOW, SNOW, SNOW, null, null, null]);
  return done(g, l, r);
}
function shedPortal(): Piece {
  const g = new G(), r = new G();
  const W = PASS_SHED.half + 1.2, H = PASS_SHED.h;
  g.box(W - 2.0, W, PASS_FLOOR, H + 1.6, -1.2, 1.2, [CONC, CONC, SNOW, null, CONC, CONC]);
  g.box(-W, -W + 1.6, PASS_FLOOR, H + 1.6, -1.2, 1.2, [CONC, CONC, SNOW, null, CONC, CONC]);
  r.box(-W, W, H - 1.0, H + 1.6, -1.2, 1.2, [CONC, CONC, null, CONC_D, CONC, CONC]);
  r.box(-W, W, H + 1.6, H + 2.3, -1.4, 1.4, [SNOW, SNOW, SNOW, null, SNOW, SNOW]);
  // yellow / black clearance band on the header face
  for (let i = 0; i < 10; i++) r.quad([-W + i * W * 0.2, H - 1.0, -1.22], [-W + (i + 1) * W * 0.2, H - 1.0, -1.22], [-W + (i + 1) * W * 0.2, H - 0.4, -1.22], [-W + i * W * 0.2, H - 0.4, -1.22], i % 2 ? YEL : DARK);
  return done(g, undefined, r);
}
/** snow surface tone (week-i-polish, playtest: the drift + kicker read as one flat white slab): wind-packed snow with
 *  sastrugi ripples (bands across the row), blue-grey shading toward the foot / in the hollows and a little dirty road
 *  spray at the base; per-vertex so it costs no texture. u = across (m), v = 0 foot .. 1 crest, r = ripple phase. */
const SNOW_SHADE = C(0x7286a2), SNOW_DIRT = C(0x5d636c), SNOW_AO = C(0x2e343d);
function snowTone(u: number, v: number, r: number): RGB {
  // mid values (x0.42-0.72): the moon rig clips full-bright snow to one white. p2: sharper ripple bands (|sin|^0.6 split) and an
  // ambient-occlusion / contact band over the lowest 30 % so the piece sits on the road instead of floating as a pale slab
  const s0 = Math.sin(r * 2.3 + Math.sin(u * 1.7) * 0.8);
  const rip = 0.5 + 0.5 * Math.sign(s0) * Math.abs(s0) ** 0.6;
  let c = mix(SNOW_SHADE, SNOW_B, Math.min(1, 0.15 + 0.85 * v));
  c = mix(c, SNOW, 0.5 * v * rip);
  c = mix(c, SNOW_AO, 0.4 * (1 - rip) * (0.5 + 0.5 * hash(u * 3.7 + r)));
  if (v < 0.3) c = mix(c, SNOW_AO, ((0.3 - v) / 0.3) * 0.7);
  return mul(c, 0.42 + 0.3 * (0.65 * rip + 0.35 * hash(u * 5.1 + r * 1.3)));
}
function driftRow(): Piece {
  const g = new G();
  // 7 columns x 5 profile segments, lumpy crest, end caps: 70 + 8 = 78 tris (budget 80)
  const n = 7, prof: [number, number][] = [[-0.75, 0], [-0.5, 0.45], [-0.25, 0.82], [0.1, 1.0], [0.45, 0.72], [0.75, 0]];
  const W = 6 / n;
  const hAt = (i: number) => 0.85 + 0.12 * Math.sin(i * 1.7) + 0.06 * (hash(i * 2.9) - 0.5);
  const zJit = (i: number, j: number) => (j === 0 || j === prof.length - 1 ? 0 : 0.12 * (hash(i * 7.1 + j * 3.3) - 0.5));
  const V = (i: number, j: number): V3 => [-3 + i * W, prof[j][1] * hAt(i), prof[j][0] * 1.6 + zJit(i, j)];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < prof.length - 1; j++) {
      const t = (k: number, jj: number) => snowTone(-3 + k * W, prof[jj][1], (prof[jj][0] + 0.75) * 4 + k * 0.6);
      g.quad(V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1), t(i, j), t(i + 1, j), t(i + 1, j + 1), t(i, j + 1));
    }
  }
  // end caps (fan from the foot centre): 4 tris each
  for (const i of [0, n]) {
    const base: V3 = [-3 + i * W, 0, 0.0];
    for (let j = 0; j < prof.length - 2; j++) g.tri(base, V(i, j + 1), V(i, j + 2), SNOW_AO, mul(SNOW_SHADE, 0.7), mul(SNOW_SHADE, 0.7));
  }
  return done(g);
}
function snowKicker(): Piece {
  const g = new G(), l = new G();
  const w = 3.02, L = 2.65, h = 1.16;
  // ramp face as a 4 x 6 grid with packed-snow tone, two darker tyre-packed lanes and blue-grey shading at the foot (48 tris)
  const nx = 4, nz = 6;
  const Y = (z: number) => (h * (z + L)) / (2 * L);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = w - (2 * w * i) / nx, x1 = w - (2 * w * (i + 1)) / nx;
    const z0 = -L + (2 * L * j) / nz, z1 = -L + (2 * L * (j + 1)) / nz;
    const t = (x: number, z: number) => { const v = (z + L) / (2 * L); let c = snowTone(x, 0.3 + 0.7 * v, z * 2.2); if (Math.abs(Math.abs(x) - 1.5) < 0.8) c = mul(mix(c, SNOW_DIRT, 0.35), 0.85); return c; };
    g.quad([x0, Y(z0), z0], [x1, Y(z0), z0], [x1, Y(z1), z1], [x0, Y(z1), z1], t(x0, z0), t(x1, z0), t(x1, z1), t(x0, z1));
  }
  // p2: shaded sides / back (x0.6) with AO at the foot, and a dark contact skirt on the road round the footprint (8 tris)
  const SIDE = mul(SNOW_SHADE, 0.6);
  g.tri([w, 0, -L], [w, h, L], [w, 0, L], SNOW_AO, SIDE, SNOW_AO);
  g.tri([-w, 0, -L], [-w, 0, L], [-w, h, L], SNOW_AO, SNOW_AO, SIDE);
  g.quad([w, 0, L], [w, h, L], [-w, h, L], [-w, 0, L], SNOW_AO, SIDE, SIDE, SNOW_AO);
  const k = 0.45, yk = 0.03, ROAD = C(0x1c1f24);
  g.quad([w + k, yk, -L - k], [w, yk, -L], [w, yk, L], [w + k, yk, L + k], ROAD, SNOW_AO, SNOW_AO, ROAD);
  g.quad([-w, yk, -L], [-w - k, yk, -L - k], [-w - k, yk, L + k], [-w, yk, L], SNOW_AO, ROAD, ROAD, SNOW_AO);
  g.quad([w, yk, L], [-w, yk, L], [-w - k, yk, L + k], [w + k, yk, L + k], SNOW_AO, SNOW_AO, ROAD, ROAD);
  g.quad([-w, yk, -L], [w, yk, -L], [w + k, yk, -L - k], [-w - k, yk, -L - k], SNOW_AO, SNOW_AO, ROAD, ROAD);
  for (let i = 0; i < 4; i++) { const z = -L + 0.8 + i * 1.2, y = Y(z) + 0.02; l.quad([w - 0.2, y, z], [-w + 0.2, y, z], [-w + 0.2, y + 0.06, z + 0.3], [w - 0.2, y + 0.06, z + 0.3], CHEV); }
  return done(g, l);
}
function lakeTile(seed: number): Piece {
  const g = new G();
  const k = (a: number, b: number) => mix(C(0x9fc3dd), C(0x5f86a6), hash(seed * 7 + a * 3 + b * 5));
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const x0 = -20 + i * 20, z0 = -20 + j * 20;
    g.quad([x0, 0, z0], [x0, 0, z0 + 20], [x0 + 20, 0, z0 + 20], [x0 + 20, 0, z0], k(i, j), k(i, j + 1), k(i + 1, j + 1), k(i + 1, j));
  }
  return done(g);
}
function flag(seed: number): Piece {
  const g = new G();
  const col = [RED, BLUE, YEL][seed % 3];
  g.box(-0.06, 0.06, 0, 7, -0.06, 0.06, STEEL);
  g.quad([0, 6.8, 0.05], [0, 6.8, 2.2], [0, 5.3, 2.0], [0, 5.3, 0.05], col);
  return done(g);
}
/** ski-jump dressing round the Summit Leap profile: local z = metres from the ramp foot, deck y = the BN-22 profile */
const leapY = (d: number) => (d <= SUMMIT_LEAP.up ? (SUMMIT_LEAP.h * d) / SUMMIT_LEAP.up : SUMMIT_LEAP.h * Math.max(0, 1 - (d - SUMMIT_LEAP.up) / SUMMIT_LEAP.down));
function skiJump(): Piece {
  const g = new G(), l = new G();
  const W = 14.2, len = SUMMIT_LEAP.up + SUMMIT_LEAP.down, seg = 10;
  for (let d = 0; d < len; d += seg) {
    const y0 = leapY(d), y1 = leapY(d + seg);
    for (const sx of [1, -1]) {
      const x = sx * W;
      // side skirt (ground to deck) + a snow lip on top
      g.quad([x, PASS_FLOOR, d], [x, PASS_FLOOR, d + seg], [x, y1 - 0.1, d + seg], [x, y0 - 0.1, d], mix(CONC_D, BLUE, 0.25));
      g.quad([x, y0 - 0.1, d], [x, y1 - 0.1, d + seg], [x + sx * 0.6, y1 + 1.1, d + seg], [x + sx * 0.6, y0 + 1.1, d], WHITE);
      // truss leg every 10 m
      if (y0 > 1.2) g.box(x + sx * 0.6 - 0.3, x + sx * 0.6 + 0.3, PASS_FLOOR, y0, d - 0.3, d + 0.3, [STEEL, STEEL, null, null, STEEL, STEEL]);
      // edge lights
      l.box(x + sx * 0.7 - 0.12, x + sx * 0.7 + 0.12, y0 + 1.1, y0 + 1.3, d + 4.8, d + 5.2, LAMP);
    }
    // underside panel so the deck never floats over the snow
    if (y0 > 0.3 || y1 > 0.3) g.quad([-W, Math.max(PASS_FLOOR, y0 - 0.5), d], [W, Math.max(PASS_FLOOR, y0 - 0.5), d], [W, Math.max(PASS_FLOOR, y1 - 0.5), d + seg], [-W, Math.max(PASS_FLOOR, y1 - 0.5), d + seg], CONC_D);
  }
  // crest kicker band (68-80 m) in red / white
  for (let d = SUMMIT_LEAP.kick; d < SUMMIT_LEAP.up; d += 2) for (const sx of [1, -1]) g.box(sx * W - 0.3, sx * W + 0.3, leapY(d) + 1.1, leapY(d) + 1.8, d, d + 1.8, (d / 2) % 2 ? RED : WHITE);
  // judges' tower on the uphill (left) side at the crest
  const tz = SUMMIT_LEAP.up - 8;
  g.box(W + 4, W + 10, PASS_FLOOR, 16, tz - 3, tz + 3, [CONC, CONC, SNOW, null, CONC, CONC]);
  g.box(W + 3.5, W + 10.5, 16, 16.6, tz - 3.5, tz + 3.5, SNOW);
  l.box(W + 3.98, W + 4.02, 12.5, 14.5, tz - 2.4, tz + 2.4, WIN);
  return done(g, l);
}
function lodge(): Piece {
  const g = new G(), l = new G();
  const W = 10, L = 15, H = 5.5;
  g.box(-W, W, -1.5, H, -L, L, [WOOD, WOOD, null, null, WOOD_D, WOOD_D]);
  // steep gable roof (ridge along z) with snow
  const rt = H + 7, eave = 1.4;
  g.quad([W + eave, H - 0.3, -L - 1], [W + eave, H - 0.3, L + 1], [0, rt, L + 1], [0, rt, -L - 1], SNOW);
  g.quad([-W - eave, H - 0.3, L + 1], [-W - eave, H - 0.3, -L - 1], [0, rt, -L - 1], [0, rt, L + 1], SNOW_B);
  for (const z of [L + 1, -L - 1]) g.tri([W, H, z * 0.99], [-W, H, z * 0.99], [0, rt - 0.4, z * 0.99], WOOD_D);
  g.box(4, 5.4, H, rt + 1.5, 6, 7.4, [ROCK, ROCK, SNOW, null, ROCK, ROCK]);
  // warm windows on the road face (-X) and the gable ends, a porch lamp
  for (let i = 0; i < 6; i++) l.quad([-W - 0.02, 1.2, -L + 2 + i * 4.6], [-W - 0.02, 1.2, -L + 4.6 + i * 4.6], [-W - 0.02, 3.4, -L + 4.6 + i * 4.6], [-W - 0.02, 3.4, -L + 2 + i * 4.6], WIN);
  for (const z of [L + 0.02, -L - 0.02]) l.quad([-2.5, 6.5, z], [2.5, 6.5, z], [1.5, 9.5, z], [-1.5, 9.5, z], WIN);
  g.box(-W - 3, -W, -1.5, 0.3, -4, 4, [WOOD_D, WOOD_D, WOOD, null, WOOD_D, WOOD_D]);
  l.box(-W - 0.3, -W - 0.1, 4.2, 4.6, -0.3, 0.3, LAMP);
  return done(g, l);
}
function station(): Piece {
  const g = new G(), l = new G();
  const W = 7.5, L = 10, H = 8;
  g.box(-W, W, -2, H, -L, L, [CONC, CONC, null, null, CONC_D, CONC_D]);
  g.box(-W - 1, W + 1, H, H + 0.8, -L - 1, L + 1, [SNOW, SNOW, SNOW, CONC_D, SNOW, SNOW]);
  // the cable pylon behind the hut and a cabin hanging from it
  g.box(W + 4, W + 5.2, -2, 22, -0.6, 0.6, [STEEL, STEEL, null, null, STEEL, STEEL]);
  g.box(W - 2, W + 11, 21.5, 22.5, -0.8, 0.8, STEEL);
  g.box(W + 7.5, W + 8, 14.5, 21.5, -0.1, 0.1, DARK);
  g.box(W + 6.2, W + 9.4, 11, 14.5, -1.6, 1.6, [RED, RED, SNOW, DARK, RED, RED]);
  l.box(W + 6.18, W + 9.42, 12.6, 13.8, -1.2, 1.2, [WIN, WIN, null, null, WIN, WIN]);
  // big lit windows on the road face, a red beacon on the pylon
  for (let i = 0; i < 4; i++) l.quad([-W - 0.02, 2, -L + 1.5 + i * 4.5], [-W - 0.02, 2, -L + 4.8 + i * 4.5], [-W - 0.02, 6, -L + 4.8 + i * 4.5], [-W - 0.02, 6, -L + 1.5 + i * 4.5], WIN);
  l.box(W + 4.2, W + 5, 22.5, 23.3, -0.4, 0.4, C(0xff3020));
  return done(g, l);
}

const cache = new Map<string, Piece>();
function piece(p: PassPlace): Piece | null {
  const key = p.name === "mtn_snow_pine" || p.name === "mtn_frozen_lake_40" || p.name === "mtn_flag" ? `${p.name}:${p.seed}` : p.name === "mtn_chevron_board" ? `${p.name}:${p.side}` : p.name;
  let c = cache.get(key);
  if (c) return c;
  switch (p.name) {
    case "mtn_guardrail_snow_4m": c = guardrail(); break;
    case "mtn_chevron_board": c = chevron(p.side ?? 1); break;
    case "mtn_fence_4m": c = fence(); break;
    case "mtn_snow_pine": c = pine(p.seed ?? 0); break;
    case "mtn_snow_shed_40": c = shedSection(); break;
    case "mtn_snow_shed_portal": c = shedPortal(); break;
    case "mtn_snowdrift_row_6": c = driftRow(); break;
    case "mtn_snow_kicker_6": c = snowKicker(); break;
    case "mtn_frozen_lake_40": c = lakeTile(p.seed ?? 0); break;
    case "mtn_flag": c = flag(p.seed ?? 0); break;
    case "mtn_skijump_structure": c = skiJump(); break;
    case "mtn_lodge": c = lodge(); break;
    case "mtn_summit_station": c = station(); break;
    default: return null;
  }
  cache.set(key, c);
  return c;
}
/** triangle counts of the procedural pieces (budget check, tests); strips are measured on a 40 m strip */
export function passPieceTris(name: string, o: Partial<PassPlace> = {}): number {
  if (name === "mtn_rock_wall_strip" || name === "mtn_scree_strip" || name === "mtn_ice_decal") {
    const g = new G();
    const pose = (k: number): Pose => ({ x: 0, y: 0, z: -k * 2, rx: 1, rz: 0, tx: 0, tz: -1 });
    strip(g, g, name, { name, s: 0, lx: -12, ly: 0, ry: 0, ground: false, len: 40, side: 1, seed: 1, ...o }, pose, 0, 0, 0);
    return g.p.length / 9;
  }
  const c = piece({ name, s: 0, lx: 0, ly: 0, ry: 0, ground: true, seed: 1, side: 1, ...o });
  return c ? (c.p.length + c.lp.length + (c.rp?.length ?? 0)) / 9 : -1;
}

// ---------------------------------------------------------------- spline-bent strips (built straight into chunk space)
/** chunk-local point at road pose p, course lat (right +), absolute y */
const P = (p: Pose, lat: number, y: number, ox: number, oz: number): V3 => [p.x + p.rx * lat - ox, y, p.z + p.rz * lat - oz];
/** pose at a fractional chunk sample index (strips start on odd metres: k = (s - s0) / 2 is not always whole) */
export function poseAtK(at: (k: number) => Pose, k: number): Pose {
  const i = Math.floor(k), f = k - i;
  const a = at(i);
  if (f <= 1e-6) return a;
  const b = at(i + 1), l = (u: number, v: number) => u + (v - u) * f;
  const tx = l(a.tx, b.tx), tz = l(a.tz, b.tz), tn = Math.hypot(tx, tz) || 1;
  const rx = l(a.rx, b.rx), rz = l(a.rz, b.rz), rn = Math.hypot(rx, rz) || 1;
  return { x: l(a.x, b.x), y: l(a.y, b.y), z: l(a.z, b.z), tx: tx / tn, tz: tz / tn, rx: rx / rn, rz: rz / rn };
}
function strip(g: G, ice: G, name: string, pl: PassPlace, atK: (k: number) => Pose, k0: number, ox: number, oz: number) {
  const at = (k: number) => poseAtK(atK, k);
  const len = pl.len ?? 40, side = pl.side ?? Math.sign(-pl.lx) ?? 1, seed = pl.seed ?? 0;
  if (name === "mtn_ice_decal") {
    const n = 8, lat = -pl.lx;
    for (let i = 0; i < n; i++) {
      const a = at(k0 + (i * len) / n / 2), b = at(k0 + ((i + 1) * len) / n / 2);
      const y = 0.05;
      const ca = mix(C(0x7fb2d8), C(0xbfe3f5), hash(seed + i)), cb = mix(C(0x7fb2d8), C(0xbfe3f5), hash(seed + i + 1));
      const rim = i === 0 || i === n - 1 ? 0.75 : 1;
      ice.quad(P(a, lat - 3, a.y + y, ox, oz), P(b, lat - 3, b.y + y, ox, oz), P(b, lat + 3, b.y + y, ox, oz), P(a, lat + 3, a.y + y, ox, oz), mul(ca, rim * 0.8), mul(cb, 0.8), mul(cb, 1), mul(ca, rim));
    }
    return;
  }
  const segL = 5, n = Math.max(1, Math.round(len / segL));
  const scree = name === "mtn_scree_strip";
  for (let i = 0; i < n; i++) {
    const sa = (i * len) / n, sb = ((i + 1) * len) / n;
    const a = at(k0 + sa / 2), b = at(k0 + sb / 2);
    // week-i-polish: MP-6 rock cut set back behind a snowy verge (wallSetback; 0 elsewhere and for the scree)
    const wa = scree ? 0 : wallSetback(pl.s + sa), wb = scree ? 0 : wallSetback(pl.s + sb);
    const ea = edgeAt(pl.s + sa) + 0.9 + wa, eb = edgeAt(pl.s + sb) + 0.9 + wb;
    const na = hash(seed + i * 3.1), nb = hash(seed + (i + 1) * 3.1);
    const L = (p: Pose, e: number, y: number) => P(p, side * e, y, ox, oz);
    if (!scree) {
      // rock cut: foot -> face (5 m) -> brow (11-13 m) -> snow back
      // set-back sections carry a lower, laid-back face (brow 8.5-10.5 instead of 11-13.5)
      const la = 1 - 0.22 * (wa / 4.5), lb = 1 - 0.22 * (wb / 4.5);
      const fa = (5 + na * 2) * la, fb = (5 + nb * 2) * lb, ta = (11 + na * 2.5) * la, tb = (11 + nb * 2.5) * lb;
      g.quad(L(a, ea, PASS_FLOOR), L(b, eb, PASS_FLOOR), L(b, eb + 0.7, fb), L(a, ea + 0.7, fa), ROCK_D, ROCK_D, mul(ROCK, 0.9 + nb * 0.2), mul(ROCK, 0.9 + na * 0.2));
      g.quad(L(a, ea + 0.7, fa), L(b, eb + 0.7, fb), L(b, eb + 2.2, tb), L(a, ea + 2.2, ta), mul(ROCK, 0.9 + na * 0.2), mul(ROCK, 0.9 + nb * 0.2), mix(ROCK, SNOW_B, 0.3), mix(ROCK, SNOW_B, 0.3));
      g.quad(L(a, ea + 2.2, ta), L(b, eb + 2.2, tb), L(b, eb + 7, tb + 1.5), L(a, ea + 7, ta + 1.5), SNOW_B, SNOW_B, SNOW, SNOW);
    } else {
      // scree: a loose rubble slope from the kerb up 7 m over 11 m, with a boulder per segment
      g.quad(L(a, ea, PASS_FLOOR), L(b, eb, PASS_FLOOR), L(b, eb + 5, 2.6 + nb), L(a, ea + 5, 2.6 + na), mix(ROCK, ROCK_D, nb), mix(ROCK, ROCK_D, na));
      g.quad(L(a, ea + 5, 2.6 + na), L(b, eb + 5, 2.6 + nb), L(b, eb + 12, 7.5 + nb * 2), L(a, ea + 12, 7.5 + na * 2), mix(ROCK, SNOW_B, 0.2), mix(ROCK, SNOW_B, 0.2), mix(SNOW_B, ROCK, 0.3), mix(SNOW_B, ROCK, 0.3));
      const m = at(k0 + (sa + sb) / 4), e = ea + 2 + na * 6, y = 0.6 + na * 2.5, r = 0.6 + nb * 0.7;
      const c0 = L(m, e, y + r), c1 = L(m, e - r, y - r * 0.4), c2 = L(m, e + r, y - r * 0.4);
      const c3: V3 = [c0[0] + m.tx * r, y - r * 0.4, c0[2] + m.tz * r];
      g.tri(c0, c1, c2, ROCK); g.tri(c0, c2, c3, ROCK_D); g.tri(c0, c3, c1, mul(ROCK, 0.8)); g.tri(c1, c3, c2, ROCK_D);
    }
  }
}

// ---------------------------------------------------------------- materials
let propsMat: THREE.MeshLambertMaterial | null = null;
export function passPropsMaterial() {
  if (!propsMat) {
    propsMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    propsMat.name = "mtn_props";
  }
  return propsMat;
}
let lampMat: THREE.MeshBasicMaterial | null = null;
export function passLampMaterial() {
  if (!lampMat) {
    lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    lampMat.name = "mtn_lamps";
  }
  return lampMat;
}
/** ice: glossy pale-blue sheen with a cold emissive floor and a grazing-angle glint, so a patch reads from 120 m */
let iceMat: THREE.MeshStandardMaterial | null = null;
export function passIceMaterial() {
  if (!iceMat) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.name = "mtn_ice";
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
 { float nfGraze = 1.0 - abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
   totalEmissiveRadiance += vColor.rgb * ( 0.16 + 0.42 * nfGraze * nfGraze ); }`);
    };
    m.customProgramCacheKey = () => "nf_mtn_ice";
    iceMat = m;
  }
  return iceMat;
}

// ---------------------------------------------------------------- per-chunk baking
export type PassChunkOut = { roof: THREE.Group | null; placed: string[] };
export const passLog: Record<string, Record<string, number>> = {};
const logged = new Set<number>();
const STRIPS = new Set(["mtn_rock_wall_strip", "mtn_scree_strip", "mtn_ice_decal"]);

export function buildPassChunk(group: THREE.Group, index: number, at: (k: number) => Pose, seg: number, ox: number, oz: number, c: ChunkCourse): PassChunkOut {
  const out: PassChunkOut = { roof: null, placed: [] };
  if (!passReady()) return out;
  const parts: Parts = new Map();
  const props = acc(), lamps = acc(), roof = acc(), ice = acc();
  const g = new G(), gi = new G();
  const m4 = new THREE.Matrix4();
  const s0 = c.cs0, s1 = c.cs0 + seg * 2;
  const kAt = (s: number) => Math.max(0, Math.min(seg, Math.round((s - s0) / 2)));
  for (const p of passIn(s0, s1)) {
    if (STRIPS.has(p.name)) {
      strip(g, gi, p.name, p, at, (p.s - s0) / 2, ox, oz);
      out.placed.push(p.name);
      continue;
    }
    const pose = at(kAt(p.s));
    const dz = p.s - (s0 + kAt(p.s) * 2);
    let ly = p.ly;
    if (p.ground) {
      // ground pieces stand on the terrain (lake tiles at the ice level; buildings on the lowest of five footprint samples)
      const wx = pose.x - pose.rx * p.lx + pose.tx * dz, wz = pose.z - pose.rz * p.lx + pose.tz * dz;
      if (p.name === "mtn_frozen_lake_40") ly = PASS_LAKE_Y;
      else if (p.name === "mtn_lodge" || p.name === "mtn_summit_station") ly = Math.min(...[[0, 0], [9, 9], [-9, 9], [9, -9], [-9, -9]].map(([a, b]) => passGroundY(wx + a, wz + b)));
      else ly = passGroundY(wx, wz) - 0.2;
      ly -= pose.y;
    }
    const pc = piece(p);
    if (pc) {
      placeMatrix(pose, p.lx, ly, dz, p.ry, ox, oz, m4);
      bake(p.name === "mtn_frozen_lake_40" ? ice : props, pc.p, pc.c, m4);
      bake(lamps, pc.lp, pc.lc, m4);
      if (pc.rp && pc.rc) bake(roof, pc.rp, pc.rc, m4);
      out.placed.push(p.name);
      continue;
    }
    if (p.name === "barrier_jersey_4m") {
      if (bakePieceBent(parts, p.name, chunkFrame(at, kAt(p.s), seg), true, p.lx, ly, p.ry, ox, oz)) out.placed.push(p.name);
      continue;
    }
    if (bakePiece(parts, p.name, placeMatrix(pose, p.lx, ly, dz, p.ry, ox, oz, m4))) out.placed.push(p.name);
  }
  props.p.push(...g.p);
  props.c.push(...g.c);
  ice.p.push(...gi.p);
  ice.c.push(...gi.c);
  if (c.grid && bakePiece(parts, "start_grid_paint_40", placeMatrix(at(0), 0, 0.02, 0, 0, ox, oz, m4))) out.placed.push("start_grid_paint_40");
  for (const k of c.kick) if (bakePieceBent(parts, "ramp_lip_chevron_24", chunkFrame(at, k, seg), true, 0, 0.05, 0, ox, oz)) out.placed.push("ramp_lip_chevron_24");
  if (c.finishK >= 0 && bakePiece(parts, "finish_gantry_24", placeMatrix(at(c.finishK), 0, 0.05, 0, 0, ox, oz, m4))) out.placed.push("finish_gantry_24");
  const gp = geo(props, true, "mtn_props"), gl = geo(lamps, false, "mtn_lamps"), gc = geo(ice, true, "mtn_ice");
  if (gp) parts.set(passPropsMaterial(), [gp]);
  if (gl) parts.set(passLampMaterial(), [gl]);
  if (gc) parts.set(passIceMaterial(), [gc]);
  const procedural = [...new Set(out.placed.filter((n) => n.startsWith("mtn_")))];
  for (const mesh of flushParts(parts, group)) {
    mesh.userData.core = mesh.geometry.getAttribute("position").count;
    if (mesh.material === passPropsMaterial()) mesh.userData.pieces = ["mtn_props", ...procedural];
  }
  const gr = geo(roof, true, "mtn_snow_shed_roof");
  if (gr) {
    const rg = new THREE.Group();
    rg.userData.shed = true;
    const mesh = new THREE.Mesh(gr, passPropsMaterial());
    mesh.userData.pieces = ["mtn_snow_shed_roof"];
    rg.add(mesh);
    group.add(rg);
    out.roof = rg;
  }
  if (!logged.has(index)) {
    logged.add(index);
    const row: Record<string, number> = {};
    for (const n of out.placed) row[n] = (row[n] ?? 0) + 1;
    passLog[`${c.lap}:${Math.round(c.cs0)}`] = row;
  }
  return out;
}

// ---------------------------------------------------------------- world-level: falling rock, its shadow, the peak backdrops
export function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1.5, 0).toNonIndexed();
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const col: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * (1 + 0.25 * Math.sin(i * 1.7)), pos.getY(i) * 0.85, pos.getZ(i) * (1 + 0.2 * Math.cos(i * 2.3)));
    const c = mix(ROCK, ROCK_D, hash(Math.floor(i / 3)));
    const top = pos.getY(i) > 0.6 ? 0.5 : 0;
    const k = mix(c, SNOW_B, top);
    col.push(...k);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.userData.piece = "mtn_rock_falling";
  return g;
}
/** 4 m telegraph disc (8 tris), coloured per instance */
export function rockShadowGeometry(): THREE.BufferGeometry {
  const g = new G();
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
    g.tri([0, 0, 0], [Math.cos(a1) * 2, 0, Math.sin(a1) * 2], [Math.cos(a0) * 2, 0, Math.sin(a0) * 2], [1, 1, 1], [0.6, 0.6, 0.6], [0.6, 0.6, 0.6]);
  }
  const geo2 = new THREE.BufferGeometry();
  geo2.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
  geo2.setAttribute("color", new THREE.Float32BufferAttribute(g.c, 3));
  geo2.userData.piece = "mtn_rock_shadow";
  return geo2;
}
/** four 500 x 250 m peak silhouettes (<= 200 tris each), one merged mesh; world.ts keeps it centred on the camera at 520 m */
export function peakBackdropGeometry(): THREE.BufferGeometry {
  const g = new G();
  const body = C(0x1b2232), cap = C(0x56647c), foot = C(0x141a26);
  for (let q = 0; q < 4; q++) {
    const yaw = (q / 4) * Math.PI * 2 + 0.4;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const D = 520;
    const at = (u: number, y: number): V3 => [fx * D + rx * u, y, fz * D + rz * u];
    const n = 24;
    let prevU = -250, prevY = 30;
    for (let i = 1; i <= n; i++) {
      const u = -250 + (500 * i) / n;
      const t = i / n;
      const y = 40 + 210 * Math.max(0, Math.sin(Math.PI * t)) ** 1.4 * (0.55 + 0.45 * Math.abs(Math.sin(t * 9.1 + q * 2.3))) + (i % 2 ? -18 : 0);
      g.quad(at(prevU, -20), at(u, -20), at(u, y), at(prevU, prevY), foot, foot, body, body);
      // snow caps on the high points
      if (y > 120 && prevY > 120) g.tri(at(prevU, prevY), at(u, y), at((prevU + u) / 2, Math.min(prevY, y) - 30), cap, cap, body);
      prevU = u;
      prevY = y;
    }
  }
  const geo2 = new THREE.BufferGeometry();
  geo2.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
  geo2.setAttribute("color", new THREE.Float32BufferAttribute(g.c, 3));
  geo2.userData.piece = "mtn_peak_backdrop";
  return geo2;
}
export type { RGB };
/** test hook (week-i-polish): a procedural piece's vertex colours (distinct-tone checks) */
export function passPieceColours(name: string): ArrayLike<number> {
  const c = piece({ name, s: 0, lx: 0, ly: 0, ry: 0, ground: true, seed: 1, side: 1 });
  return c ? c.c : [];
}
