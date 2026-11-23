// openhighway-v2 look pass (Sara, Nov 22): Open Highway-only terrain and materials. Nothing here is used by another stage.
//  - terrain material (vertex-coloured Lambert, no specular): gentle rises, the Mesa Cut block, river banks, rocks
//  - salt pans: cracked, colour-varied, edge-blended Lambert (no moon sheen) in place of the flat atlas-white tile
//  - far mesas: silhouette material outside the fog, fading into a horizon haze band near the far plane
//  - tunnel glow: dim amber clone of the shared emissive for the Mesa Cut walls / strips
//  - gap cut: world-space discard box for the road (BN-18 snapped deck) and the desert floor (the riverbed)
import * as THREE from "three";
import type { Pose } from "./city";
import { PAINT_GLSL } from "./roadpaint";
import { BRIDGE, MESA_CUT, type DesertMound } from "./highwaycourse";

const hash = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const c3 = (hex: number) => new THREE.Color(hex);

let terrain: THREE.MeshLambertMaterial | null = null;
export function terrainMaterial() {
  if (!terrain) {
    terrain = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    terrain.name = "highway_terrain";
  }
  return terrain;
}

type Geo = { pos: number[]; col: number[] };
function finish(g: Geo, flat = false): THREE.BufferGeometry {
  let geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(g.col, 3));
  if (flat) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}
function tri(g: Geo, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color) {
  g.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  g.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
}
function quad(g: Geo, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, cd: THREE.Color) {
  tri(g, a, b, c, ca, cb, cc);
  tri(g, a, c, d, ca, cc, cd);
}

const SAND = c3(0x7a6448), SAND_HI = c3(0x9a8260), DUSK = c3(0x5c4a36);
/** A gentle rise: low dome (8 x 4 rings), crest lighter, rim sunk under the floor plane. Local frame (x lateral, z along). */
export function moundGeometry(m: DesertMound): THREE.BufferGeometry {
  const g: Geo = { pos: [], col: [] };
  const N = 10, R = 4;
  const pt = (i: number, j: number) => {
    const a = (i / N) * Math.PI * 2, u = j / R;
    const wob = 1 + 0.18 * Math.sin(a * 3 + m.seed) + 0.1 * Math.sin(a * 5 + m.seed * 1.7);
    const r = u * wob;
    const y = j === R ? -0.35 : m.h * Math.pow(1 - u * u, 1.4) * (0.9 + 0.2 * hash(m.seed * 31 + i * 7 + j));
    return new THREE.Vector3(Math.cos(a) * r * m.rx, y, Math.sin(a) * r * m.rz);
  };
  const col = (v: THREE.Vector3) => DUSK.clone().lerp(SAND_HI, Math.min(1, Math.max(0, v.y / m.h))).multiplyScalar(m.tone);
  const top = new THREE.Vector3(0, m.h, 0);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < R; j++) {
      const a = j === 0 ? top : pt(i, j), b = j === 0 ? top : pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      if (j === 0) tri(g, a, d, c, col(a), col(d), col(c));
      else quad(g, a, d, c, b, col(a), col(d), col(c), col(b));
    }
  }
  return finish(g);
}

/** Small desert rock (flat-shaded squashed icosahedron, unit size; instance scale / tone vary it). */
export function rockGeometry(): THREE.BufferGeometry {
  const src = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  const p = src.getAttribute("position") as THREE.BufferAttribute;
  const col: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.75 + 0.5 * hash(Math.round(x * 7) + Math.round(y * 13) * 3 + Math.round(z * 17) * 5);
    p.setXYZ(i, x * k * 1.2, Math.max(-0.25, y * 0.55 * k) + 0.2, z * k);
    const t = 0.55 + 0.45 * Math.max(0, y);
    col.push(0.26 * t, 0.2 * t, 0.15 * t);
  }
  src.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  src.deleteAttribute("uv");
  src.computeVertexNormals();
  return src;
}
let rockMat: THREE.MeshLambertMaterial | null = null;
export function rockMaterial() {
  if (!rockMat) {
    rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    rockMat.name = "highway_rock";
  }
  return rockMat;
}

/** world point (chunk-local: minus ox / oz) at pose p, course lat (driver's right +), absolute height y */
const P = (p: Pose, lat: number, y: number, ox: number, oz: number) => new THREE.Vector3(p.x + p.rx * lat - ox, y, p.z + p.rz * lat - oz);

const ROCK_LO = c3(0x4e3628), ROCK_MID = c3(0x7a5038), ROCK_HI = c3(0x9a7050), ROCK_CAP = c3(0x6a5844);
function strata(y: number, s: number) {
  const band = 0.5 + 0.5 * Math.sin(y * 0.9 + Math.sin(s * 0.05) * 0.6);
  const base = y < 6 ? ROCK_LO.clone().lerp(ROCK_MID, y / 6) : ROCK_MID.clone().lerp(ROCK_HI, band * 0.7);
  return base.multiplyScalar(0.92 + 0.16 * hash(Math.round(y) * 13 + Math.round(s)));
}
/** Mesa Cut block slice for the samples of one chunk inside MESA_CUT: flanks + flat cap, plus the cliff face (with the tunnel
 *  opening cut out) on whichever end falls inside this chunk. ks: chunk sample indices, sAt: course s of a sample. */
export function mesaBlockGeometry(at: (k: number) => Pose, ks: number[], sAt: (k: number) => number, ox: number, oz: number): THREE.BufferGeometry | null {
  if (ks.length < 2) return null;
  const M = MESA_CUT;
  // cross-section (lat >= 0 half; mirrored): base, three eroded steps, cap edge
  const prof = (s: number): [number, number][] => {
    const j = (n: number) => (hash(Math.round(s / 2) * 7 + n) - 0.5);
    return [
      [M.baseHalf + j(1) * 6, -0.4],
      [M.baseHalf - 14 + j(2) * 5, 6 + j(3) * 2],
      [M.topHalf + 18 + j(4) * 4, 13 + j(5) * 2],
      [M.topHalf + 6 + j(6) * 3, M.h - 4 + j(7) * 2],
      [M.topHalf, M.h + j(8) * 1.5],
    ];
  };
  const g: Geo = { pos: [], col: [] };
  const ring = (k: number) => {
    const s = sAt(k), p = at(k), pr = prof(s);
    const pts: { v: THREE.Vector3; c: THREE.Color }[] = [];
    for (let i = 0; i < pr.length; i++) pts.push({ v: P(p, -pr[i][0], pr[i][1], ox, oz), c: strata(pr[i][1], s) });
    for (let i = pr.length - 1; i >= 0; i--) pts.push({ v: P(p, pr[i][0], pr[i][1], ox, oz), c: strata(pr[i][1], s + 3) });
    pts[pr.length - 1].c = ROCK_CAP.clone();
    pts[pr.length].c = ROCK_CAP.clone();
    return pts;
  };
  let prev = ring(ks[0]);
  for (let n = 1; n < ks.length; n++) {
    const cur = ring(ks[n]);
    for (let i = 0; i + 1 < cur.length; i++) quad(g, prev[i].v, cur[i].v, cur[i + 1].v, prev[i + 1].v, prev[i].c, cur[i].c, cur[i + 1].c, prev[i + 1].c);
    prev = cur;
  }
  // cliff faces with the opening
  for (const k of [ks[0], ks[ks.length - 1]]) {
    const s = sAt(k);
    if (Math.abs(s - M.s0) > 1.01 && Math.abs(s - M.s1) > 1.01) continue;
    const pr = prof(s);
    // one simple U-shaped outline around the portal opening (a hole touching the outline would not triangulate)
    const shape = new THREE.Shape();
    shape.moveTo(-pr[0][0], pr[0][1]);
    for (let i = 1; i < pr.length; i++) shape.lineTo(-pr[i][0], pr[i][1]);
    for (let i = pr.length - 1; i >= 0; i--) shape.lineTo(pr[i][0], pr[i][1]);
    shape.lineTo(M.openHalf, pr[0][1]);
    shape.lineTo(M.openHalf, M.openTop);
    shape.lineTo(-M.openHalf, M.openTop);
    shape.lineTo(-M.openHalf, pr[0][1]);
    shape.closePath();
    const sg = new THREE.ShapeGeometry(shape, 1).toNonIndexed();
    const sp = sg.getAttribute("position") as THREE.BufferAttribute;
    const p = at(k);
    for (let i = 0; i < sp.count; i += 3) {
      const v = [0, 1, 2].map((d) => P(p, sp.getX(i + d), sp.getY(i + d), ox, oz));
      const c = [0, 1, 2].map((d) => strata(sp.getY(i + d), s + d * 11));
      tri(g, v[0], v[1], v[2], c[0], c[1], c[2]);
    }
    sg.dispose();
  }
  return finish(g);
}

// ---------------------------------------------------------------- BN-18 gorge (week-i-port riverbed look pass)
/** The dry-river gorge under the Broken Bridge: rocky sloped banks from the desert rim (|lat| ~22, where the floor is cut)
 *  down to a pebbly bed (|lat| < ~9.5) at BRIDGE.bedY, a meandering shallow channel with dark water, wet sand / rock
 *  margins, scattered boulders. All analytic in (s, lat) so chunk seams match. Look only: the gap / fall rules are in sim. */
export const RIVER = { bedEdge: 9.5, rim: 22, chanHalf: 3.2, chanDip: 0.75, water: -0.32, rocksPer40: 9 };
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** channel centre (course lat) and half-width at course s */
export function riverChannel(s: number): { c: number; w: number } {
  return { c: 3.2 * Math.sin(s * 0.013 + 0.6) + 1.4 * Math.sin(s * 0.041 + 2.1), w: RIVER.chanHalf + 1.1 * Math.sin(s * 0.027 + 1.3) };
}
const bedEdgeAt = (s: number, side: number) => RIVER.bedEdge + 1.4 * Math.sin(s * 0.019 + side * 1.7) + 0.6 * Math.sin(s * 0.053 + side);
const rimAt = (s: number, side: number) => RIVER.rim + 1.2 * hash(Math.round(s / 2) * 0.7 + side * 3.1);
/** bed height (absolute y) at (s, lat) inside the bed: gentle swells, the channel dip */
export function riverBedY(s: number, lat: number): number {
  const ch = riverChannel(s);
  const swell = 0.22 * Math.sin(s * 0.07 + lat * 0.4) + 0.14 * Math.sin(s * 0.21 - lat * 0.9) + 0.08 * Math.sin(s * 0.5 + lat * 1.7);
  const dip = RIVER.chanDip * sm(ch.w + 2.4, ch.w - 0.6, Math.abs(lat - ch.c));
  return BRIDGE.bedY + 0.1 + swell - dip;
}
const BANK_T = [0, 0.07, 0.18, 0.32, 0.47, 0.62, 0.77, 0.9, 1];
const BED_N = 16;
/** lateral columns at s, driver's-left to right in course lat, with their heights */
function gorgeCols(s: number): { l: number; y: number; bank: number }[] {
  const si = Math.round(s / 2);
  const out: { l: number; y: number; bank: number }[] = [];
  const bank = (side: number, rev: boolean) => {
    const T = rimAt(s, side), B = bedEdgeAt(s, side), yb = riverBedY(s, side * B);
    const ts = rev ? [...BANK_T].reverse() : BANK_T;
    for (const t of ts) {
      if (t === 1) continue; // the bed edge column belongs to the bed
      const j = Math.sin(Math.PI * t);
      const l = T - t * (T - B) + (hash(si * 1.9 + t * 17 + side * 5) - 0.5) * 1.1 * j;
      // rounded lip, steep rocky middle, a softer toe; ledges from the hash
      const f = t < 0.07 ? 0.02 * (t / 0.07) : t < 0.8 ? 0.02 + 0.86 * Math.pow((t - 0.07) / 0.73, 0.85) : 0.88 + 0.12 * ((t - 0.8) / 0.2);
      const y = t === 0 ? -0.08 : -0.08 + (yb + 0.08) * f + (hash(si * 3.7 + t * 23 + side * 11) - 0.5) * 1.3 * j;
      out.push({ l: side * l, y, bank: 1 - t });
    }
  };
  bank(-1, false);
  const BL = bedEdgeAt(s, -1), BR = bedEdgeAt(s, 1);
  for (let i = 0; i <= BED_N; i++) {
    const l = -BL + ((BL + BR) * i) / BED_N + (i > 0 && i < BED_N ? (hash(si * 5.3 + i * 7) - 0.5) * 0.6 : 0);
    out.push({ l, y: riverBedY(s, l), bank: 0 });
  }
  bank(1, true);
  return out;
}
const G_RIM = c3(0x6a5840), G_ROCK = c3(0x6e5440), G_ROCK2 = c3(0x58402e), G_DRY = c3(0x7c6a52), G_PEB = c3(0x8a7a64), G_WET = c3(0x2c2620), G_WET2 = c3(0x3a3028);
function gorgeColour(s: number, l: number, y: number, bank: number): THREE.Color {
  const n = hash(Math.round(s * 1.3) * 3.1 + Math.round(l * 2) * 7.7);
  if (bank > 0) {
    // rim matches the desert floor, the face is strata rock with jitter
    const band = 0.5 + 0.5 * Math.sin(y * 1.3 + Math.sin(s * 0.04) * 0.8);
    const rock = G_ROCK2.clone().lerp(G_ROCK, band).multiplyScalar(0.85 + 0.3 * n);
    return rock.lerp(G_RIM, sm(0.82, 1, bank));
  }
  const ch = riverChannel(s);
  const d = Math.abs(l - ch.c) - ch.w;
  const dry = G_DRY.clone().lerp(G_PEB, n * n).multiplyScalar(0.8 + 0.35 * hash(Math.round(s * 0.5) * 13 + Math.round(l) * 3));
  const wet = G_WET.clone().lerp(G_WET2, n);
  return dry.lerp(wet, sm(2.8, 0.2, d));
}
/** Gorge banks + bed + boulders for one chunk's samples inside the bridge (both sides), plus the rock end walls under the
 *  abutments. Draws on riverbedMaterial (vertex colours, world-noise grain, depth falloff). */
export function riverbankGeometry(at: (k: number) => Pose, ks: number[], sAt: (k: number) => number, ox: number, oz: number): THREE.BufferGeometry | null {
  if (ks.length < 2) return null;
  const B = BRIDGE;
  const g: Geo = { pos: [], col: [] };
  const rows = ks.map((k) => {
    const s = sAt(k), p = at(k);
    return gorgeCols(s).map((c) => ({ v: P(p, c.l, c.y, ox, oz), c: gorgeColour(s, c.l, c.y, c.bank) }));
  });
  for (let n = 1; n < rows.length; n++) {
    const a = rows[n - 1], b = rows[n];
    for (let i = 0; i + 1 < a.length; i++) quad(g, a[i].v, a[i + 1].v, b[i + 1].v, b[i].v, a[i].c, a[i + 1].c, b[i + 1].c, b[i].c);
  }
  // end walls: rock face from the gorge profile up to the desert floor
  for (const k of [ks[0], ks[ks.length - 1]]) {
    const s = sAt(k);
    if (Math.abs(s - B.s0) > 1.01 && Math.abs(s - B.s1) > 1.01) continue;
    const p = at(k), cols = gorgeCols(s);
    for (let i = 0; i + 1 < cols.length; i++) {
      const c0 = cols[i], c1 = cols[i + 1];
      const t0 = P(p, c0.l, -0.08, ox, oz), t1 = P(p, c1.l, -0.08, ox, oz), b0 = P(p, c0.l, c0.y, ox, oz), b1 = P(p, c1.l, c1.y, ox, oz);
      quad(g, t0, t1, b1, b0, G_RIM, G_RIM, strata(c1.y - B.bedY, s + i), strata(c0.y - B.bedY, s + i + 1));
    }
  }
  // boulders on the bed and the bank toes (a rock icosahedron per placement)
  const s0 = sAt(ks[0]), s1 = sAt(ks[ks.length - 1]);
  const rock = rockGeometry();
  const rp = rock.getAttribute("position") as THREE.BufferAttribute, rc = rock.getAttribute("color") as THREE.BufferAttribute;
  const step = 40 / RIVER.rocksPer40;
  for (let i = Math.ceil(s0 / step); i * step < s1; i++) {
    const s = i * step + (hash(i * 2.7 + 5) - 0.5) * step;
    if (s < B.s0 + 1 || s > B.s1 - 1 || s < s0 || s >= s1) continue;
    const ch = riverChannel(s);
    const side = hash(i * 4.1 + 9) < 0.5 ? -1 : 1;
    const u = hash(i * 6.3 + 13);
    // bed edge to bank toe, kept out of the open water
    let l = side * (bedEdgeAt(s, side) * (0.15 + 0.95 * u));
    if (Math.abs(l - ch.c) < ch.w + 0.4) l = ch.c + side * (ch.w + 0.6 + u * 1.5);
    const r = 0.3 + Math.pow(hash(i * 8.9 + 17), 2) * 1.5;
    const k = ks[0] + Math.max(0, Math.min(ks.length - 1, Math.round((s - s0) / 2)));
    const p = at(k);
    const base = P(p, l, riverBedY(s, l) - 0.12 * r, ox, oz);
    const ry = hash(i * 3.3 + 21) * Math.PI * 2, cr = Math.cos(ry), sr = Math.sin(ry);
    const tone = 0.7 + 0.5 * hash(i * 9.7 + 23);
    for (let v = 0; v < rp.count; v += 3) {
      const q = [0, 1, 2].map((d) => {
        const x = rp.getX(v + d) * r, y = rp.getY(v + d) * r, z = rp.getZ(v + d) * r;
        return new THREE.Vector3(base.x + x * cr - z * sr, base.y + y, base.z + x * sr + z * cr);
      });
      const cc = [0, 1, 2].map((d) => new THREE.Color(rc.getX(v + d) * tone * 1.5, rc.getY(v + d) * tone * 1.45, rc.getZ(v + d) * tone * 1.4));
      tri(g, q[0], q[1], q[2], cc[0], cc[1], cc[2]);
    }
  }
  rock.dispose();
  return finish(g, true);
}
/** the shallow channel water for one chunk's samples inside the bridge: a strip over the channel at BRIDGE.bedY + water */
export function riverWaterGeometry(at: (k: number) => Pose, ks: number[], sAt: (k: number) => number, ox: number, oz: number): THREE.BufferGeometry | null {
  if (ks.length < 2) return null;
  const pos: number[] = [], nor: number[] = [];
  const y = BRIDGE.bedY + RIVER.water;
  const edge = (k: number) => {
    const s = sAt(k), p = at(k), ch = riverChannel(s);
    return [P(p, ch.c - ch.w - 1.6, y, ox, oz), P(p, ch.c + ch.w + 1.6, y, ox, oz)];
  };
  let prev = edge(ks[0]);
  for (let n = 1; n < ks.length; n++) {
    const cur = edge(ks[n]);
    for (const v of [prev[0], prev[1], cur[1], prev[0], cur[1], cur[0]]) { pos.push(v.x, v.y, v.z); nor.push(0, 1, 0); }
    prev = cur;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}
let bedMat: THREE.MeshLambertMaterial | null = null;
/** gorge material: vertex colours x world-space grain (gravel speckle, sand ripples), darker with depth below the rim */
export function riverbedMaterial() {
  if (bedMat) return bedMat;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
  m.name = "highway_riverbed";
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", "varying vec3 vWp;\nvoid main() {")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", `varying vec3 vWp;\n${NOISE_GLSL}\nvoid main() {`)
      .replace("#include <color_fragment>", `#include <color_fragment>
  vec2 q = vWp.xz;
  float grain = 0.78 + 0.22 * nfNoise(q * 0.45) + 0.16 * nfNoise(q * 1.7) - 0.14 * step(0.82, nfH(floor(q * 3.0)));
  float ripple = 0.94 + 0.06 * sin(dot(q, vec2(0.83, 0.57)) * 2.6 + nfNoise(q * 0.3) * 4.0);
  float depth = smoothstep(${(BRIDGE.bedY - 0.4).toFixed(2)}, -0.6, vWp.y);
  diffuseColor.rgb *= grain * ripple * mix(0.38, 1.0, depth);`);
  };
  m.customProgramCacheKey = () => "nf_highway_riverbed";
  bedMat = m;
  return m;
}
let waterMat: THREE.MeshPhongMaterial | null = null;
/** shallow dark water: near-black teal, moonlit specular broken up by a world-noise ripple normal */
export function riverWaterMaterial() {
  if (waterMat) return waterMat;
  const m = new THREE.MeshPhongMaterial({ color: 0x0b1519, specular: 0x5a6c7a, shininess: 70, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.name = "highway_river_water";
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", "varying vec3 vWp;\nvoid main() {")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", `varying vec3 vWp;\n${NOISE_GLSL}\nvoid main() {`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  vec2 nq = vWp.xz;
  vec3 rip = vec3(nfNoise(nq * 0.8) - 0.5 + 0.5 * (nfNoise(nq * 2.9) - 0.5), 0.0, nfNoise(nq * 0.8 + 17.0) - 0.5 + 0.5 * (nfNoise(nq * 2.9 + 9.0) - 0.5));
  normal = normalize(normal + (viewMatrix * vec4(rip * 0.35, 0.0)).xyz);`)
      .replace("#include <color_fragment>", `#include <color_fragment>
  diffuseColor.rgb *= 0.85 + 0.3 * nfNoise(vWp.xz * 0.15);`);
  };
  m.customProgramCacheKey = () => "nf_highway_river_water";
  waterMat = m;
  return m;
}

// ---------------------------------------------------------------- salt pans
const SALT = { s0: 4100, s1: 4900, inner: 12.6, outer: 53, blend: 9, y: 0.0 };
/** A salt-pan tile (40 x 40 at course s / lat, rigid on OH-9's straight) as an 8 x 8 grid with an edge-blend attribute. */
export function saltGeometry(at: (s: number) => Pose, sMid: number, lat: number, ox: number, oz: number): THREE.BufferGeometry {
  const N = 8, pos: number[] = [], edge: number[] = [], idx: number[] = [];
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const s = sMid - 20 + (40 * j) / N, l = lat - 20 + (40 * i) / N;
      const p = at(s);
      const v = P(p, l, SALT.y, ox, oz);
      pos.push(v.x, v.y, v.z);
      const a = Math.abs(l);
      edge.push(Math.max(0, Math.min(1, Math.min(a - SALT.inner, SALT.outer - a, s - SALT.s0, SALT.s1 - s) / SALT.blend)));
    }
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aEdge", new THREE.Float32BufferAttribute(edge, 1));
  geo.setIndex(idx);
  const flat = geo.toNonIndexed();
  geo.dispose();
  const n: number[] = [];
  for (let i = 0; i < flat.getAttribute("position").count; i++) n.push(0, 1, 0);
  flat.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  return flat;
}

const NOISE_GLSL = /* glsl */ `
float nfH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 nfH2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float nfNoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(nfH(i), nfH(i + vec2(1, 0)), u.x), mix(nfH(i + vec2(0, 1)), nfH(i + vec2(1, 1)), u.x), u.y); }
// distance to the nearest Voronoi cell border (crack lines)
float nfCrack(vec2 p) {
  vec2 n = floor(p), f = fract(p), mg, mr; float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 o = nfH2(n + g); vec2 r = g + o - f; float d = dot(r, r); if (d < md) { md = d; mr = r; mg = g; } }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec2 g = mg + vec2(float(i), float(j)); vec2 o = nfH2(n + g); vec2 r = g + o - f; if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr))); }
  return md;
}`;
let salt: THREE.MeshLambertMaterial | null = null;
export function saltMaterial() {
  if (salt) return salt;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.name = "highway_salt";
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", "attribute float aEdge;\nvarying float vEdge;\nvarying vec3 vWp;\nvoid main() {")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vEdge = aEdge;\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", `varying float vEdge;\nvarying vec3 vWp;\n${NOISE_GLSL}\nvoid main() {`)
      .replace("#include <color_fragment>", `#include <color_fragment>
  vec2 q = vWp.xz;
  vec2 w = q + vec2(nfNoise(q * 0.09), nfNoise(q * 0.09 + 31.0)) * 4.0;
  float tone = 0.80 + 0.26 * nfNoise(q * 0.035) + 0.12 * nfNoise(q * 0.21) - 0.10 * nfNoise(q * 0.9);
  vec3 salt = vec3(0.235, 0.22, 0.2) * tone;
  salt = mix(salt, vec3(0.23, 0.19, 0.15), smoothstep(0.45, 0.85, nfNoise(q * 0.05 + 7.0)) * 0.7);
  salt = mix(salt, vec3(0.31, 0.295, 0.27), smoothstep(0.6, 0.9, nfNoise(q * 0.12 + 3.0)) * 0.3);
  float big = nfCrack(w * 0.34), small = nfCrack(w * 0.95 + 5.0);
  float dense = smoothstep(0.25, 0.75, nfNoise(q * 0.03 + 11.0));
  float crack = max((1.0 - smoothstep(0.015, 0.06, big)) * 0.75, (1.0 - smoothstep(0.01, 0.05, small)) * 0.4 * dense);
  salt = mix(salt, salt * vec3(0.62, 0.56, 0.5), crack);
  float a = clamp(vEdge * 1.5 - 0.25 + (nfNoise(q * 0.09) - 0.5) * 0.9, 0.0, 1.0);
  diffuseColor = vec4(salt, smoothstep(0.0, 1.0, a));`);
  };
  m.customProgramCacheKey = () => "nf_highway_salt";
  salt = m;
  return m;
}

// ---------------------------------------------------------------- far mesas + horizon haze
export const HAZE = { color: 0x4a3b30, sky: 0x1a140c, radius: 640, proxy: 400, fadeFrom: 1500, fadeTo: 1900 };
/** backdrop band for the mesa silhouettes, in degrees below the chase cam's eye line (the camera sees ~0.8 deg above
 *  it on desktop): mesa base 5.2 deg down, flat tops 1.4 deg down, so the outline sits in the haze with sky haze above */
export const MESA_BAND = { baseDeg: -5.5, topDeg: -0.9, h: 80 };
let mesaMat: THREE.MeshBasicMaterial | null = null;
/** Far mesas: unfogged silhouettes (dark rock, faint moonlit top) drawn as a backdrop. The pitched-down chase cam only
 *  sees < 1 deg above its eye line and the floor stops ~130-200 m out, so a mesa at its true 0.5-1.4 km shows as a strip
 *  cut by the frame top. Each mesa (aAnchor = its ground centre) is drawn as a backdrop card: projected to HAZE.proxy m
 *  along its bearing (true angular width kept) and fitted into MESA_BAND, so its outline reads against the haze above;
 *  it dissolves into the haze once its true distance passes ~1.5 km. */
export function mesaSilhouetteMaterial() {
  if (mesaMat) return mesaMat;
  const m = new THREE.MeshBasicMaterial({ color: 0x120e0b, fog: false });
  m.name = "highway_mesa_silhouette";
  const yBase = HAZE.proxy * Math.tan((MESA_BAND.baseDeg * Math.PI) / 180);
  const ySpan = (HAZE.proxy * (Math.tan((MESA_BAND.topDeg * Math.PI) / 180) - Math.tan((MESA_BAND.baseDeg * Math.PI) / 180))) / MESA_BAND.h;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", "attribute vec2 aAnchor;\nvarying vec3 vWp;\nvarying float vTrueD;\nvoid main() {")
      .replace("#include <project_vertex>", `vec4 nfW = modelMatrix * vec4( transformed, 1.0 );
  vWp = nfW.xyz;
  vec2 nfRel = aAnchor - cameraPosition.xz;
  vTrueD = length( nfRel );
  float nfK = ${HAZE.proxy.toFixed(1)} / max( vTrueD, 1.0 );
  nfW.xz = cameraPosition.xz + ( nfW.xz - cameraPosition.xz ) * nfK;
  nfW.y = cameraPosition.y + ${yBase.toFixed(3)} + ( nfW.y + 0.5 ) * ${ySpan.toFixed(4)};
  vec4 mvPosition = viewMatrix * nfW;
  gl_Position = projectionMatrix * mvPosition;`);
    const hz = c3(HAZE.color);
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "varying vec3 vWp;\nvarying float vTrueD;\nvoid main() {")
      .replace("#include <color_fragment>", `#include <color_fragment>
  float top = smoothstep(30.0, 80.0, vWp.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.12, 0.10), top * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${hz.r.toFixed(4)}, ${hz.g.toFixed(4)}, ${hz.b.toFixed(4)}), smoothstep(${HAZE.fadeFrom.toFixed(1)}, ${HAZE.fadeTo.toFixed(1)}, vTrueD));`);
  };
  m.customProgramCacheKey = () => "nf_highway_mesa";
  mesaMat = m;
  return m;
}
/** Horizon haze band: an open cylinder (camera-centred), vertex colours pre-blended over the sky, drawn first, no depth write, no fog. */
export function hazeBand(): THREE.Mesh {
  const rings: [number, number, number][] = [[-40, 1, 1], [0, 1, 1], [18, 0.9, 1], [45, 0.6, 1], [100, 0.25, 1], [190, 0, 1]];
  const N = 48, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const hz = c3(HAZE.color), sk = c3(HAZE.sky);
  for (let j = 0; j < rings.length; j++) {
    const [y, t] = rings[j];
    const c = sk.clone().lerp(hz, t);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pos.push(Math.cos(a) * HAZE.radius, y, Math.sin(a) * HAZE.radius);
      col.push(c.r, c.g, c.b, t);
    }
  }
  for (let j = 0; j + 1 < rings.length; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  // opaque pass, drawn first with no depth write (colours are pre-blended over the sky), so the mesas and every prop draw
  // over it; a transparent band would be drawn after the opaque pass and paint over them
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "highway_haze";
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- Mesa Cut glow
const glowMats = new WeakMap<THREE.Material, THREE.Material>();
/** Mesa Cut shell (Open Highway only): the shared NC tunnel's magenta neon (base trim, paint) recoloured to a dim warm
 *  sodium tone in both albedo and glow, and the white top trim glow damped, so no bright side trim shows. */
export function tunnelGlowMat(m: THREE.Material) {
  let c = glowMats.get(m);
  if (!c) {
    const s = (m as THREE.MeshStandardMaterial).clone();
    const glow = /emissive/i.test(m.name);
    s.name = `${m.name}@mesacut`;
    const prev = (m as THREE.MeshStandardMaterial).onBeforeCompile;
    s.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.vertexShader = sh.vertexShader
        .replace("void main() {", "varying float vNfY;\nvoid main() {")
        .replace("#include <project_vertex>", "#include <project_vertex>\n vNfY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;");
      // upper shell (crowns, header faces, roof: above the 13.5 m chase cam) reads as one dark rock ceiling, not a lit slab
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", `${PAINT_GLSL}\nvarying float vNfY;\nvoid main() {`)
        .replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = nfPaint( diffuseColor.rgb, vec3( 0.16, 0.11, 0.07 ) );\n diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.075, 0.058, 0.045 ), smoothstep( 14.0, 18.0, vNfY ) );")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n totalEmissiveRadiance = nfPaint( totalEmissiveRadiance, vec3( 0.30, 0.16, 0.05 ) ) * ${glow ? "0.18" : "1.0"} * ( 1.0 - smoothstep( 14.0, 18.0, vNfY ) );`);
    };
    s.customProgramCacheKey = () => `nf_mesacut_${glow ? "glow" : "shell"}`;
    glowMats.set(m, s);
    c = s;
  }
  return c;
}

// ---------------------------------------------------------------- BN-18 cut-outs
/** world-space boxes (centre xz, unit along-dir xz, half along, half across); a zero half disables a box */
export const cutUniforms = {
  nfCutA: { value: new THREE.Vector4(0, 0, 0, 1) }, nfCutAH: { value: new THREE.Vector2(0, 0) },
};
export const CUT_GLSL = /* glsl */ `
uniform vec4 nfCutA; uniform vec2 nfCutAH;
bool nfInCut(vec3 w) {
  if (nfCutAH.x <= 0.0) return false;
  vec2 d = w.xz - nfCutA.xy; vec2 t = nfCutA.zw; vec2 r = vec2(-t.y, t.x);
  return abs(dot(d, t)) < nfCutAH.x && abs(dot(d, r)) < nfCutAH.y;
}`;
/** a clone of `base` that discards fragments inside `box` uniforms (road: the gap on the right deck; floor: the riverbed) */
export function cutMaterial<T extends THREE.Material>(base: T, key: string, uniforms: { box: { value: THREE.Vector4 }; half: { value: THREE.Vector2 } }, extra?: (sh: THREE.WebGLProgramParametersWithUniforms) => void): T {
  const m = base.clone() as T;
  m.name = `${base.name || "mat"}@${key}`;
  const prev = base.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(base, sh, r);
    extra?.(sh);
    sh.uniforms.nfCutA = uniforms.box;
    sh.uniforms.nfCutAH = uniforms.half;
    sh.vertexShader = sh.vertexShader
      .replace("void main() {", "varying vec3 vCutW;\nvoid main() {")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", `varying vec3 vCutW;\n${CUT_GLSL}\nvoid main() {\n if (nfInCut(vCutW)) discard;`);
  };
  m.customProgramCacheKey = () => `nf_cut_${key}`;
  return m;
}
