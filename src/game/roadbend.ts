// Coast seam fix (week-i-coast-fixes): lay a straight 40 m piece along the curved, sloped road instead of as a rigid block.
//
// Root cause of the "road built off of itself" seams: every 40 m road/strip piece (kit road tile, lane paint, coast
// shoulder / cliff / water / boardwalk, city sidewalk) was placed RIGID at its chunk's mid sample, so on a bend or a
// slope its ends left the true centreline (up to 0.5 m sideways on the Coast curves, 1+ m for the shoulder strips),
// and the next chunk's piece, rotated to its own mid tangent, overlapped one side of the seam and gapped the other. On
// bends > 4 deg the chunk fell back to the 0.05 m ribbon instead, so tile and ribbon alternated with a height step and
// the tile kerb/skirt jutting past the ribbon. Here the piece is first sliced at the 2 m sample planes (so no straight
// span is longer than one track sample), then every vertex is moved into the frame of the track at its own along-track
// position. Neighbouring chunks meet at the same boundary sample, so the seam is shared exactly: one surface.
import * as THREE from "three";

/** track sample spacing (road.ts STEP); slice planes sit on samples so bent edges follow the sample polyline */
export const BEND_STEP = 2;

export type BendPose = { x: number; y: number; z: number; tx: number; tz: number };

/** pose at fractional sample k from an integer-sample accessor (linear between the two samples, tangent renormalised) */
export function lerpPose(at: (k: number) => BendPose, k: number, lo: number, hi: number): BendPose {
  const kk = Math.max(lo, Math.min(hi, k));
  const i = Math.min(hi - 1, Math.max(lo, Math.floor(kk)));
  const f = kk - i;
  const a = at(i);
  if (f <= 1e-6) return a;
  const b = at(i + 1);
  if (f >= 1 - 1e-6) return b;
  const tx = a.tx + (b.tx - a.tx) * f;
  const tz = a.tz + (b.tz - a.tz) * f;
  const l = Math.hypot(tx, tz) || 1;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, tx: tx / l, tz: tz / l };
}

type V = number[]; // x y z nx ny nz u v
function clip(poly: V[], lo: number, keepAbove: boolean): V[] {
  const out: V[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ina = keepAbove ? a[2] >= lo : a[2] <= lo;
    const inb = keepAbove ? b[2] >= lo : b[2] <= lo;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (lo - a[2]) / (b[2] - a[2]);
      out.push(a.map((v, j) => v + (b[j] - v) * t));
      out[out.length - 1][2] = lo;
    }
  }
  return out;
}

/**
 * Slice a non-indexed geometry (position, normal, uv) at z = n * step. Shared edges are cut at the same planes on both
 * sides, so no T-junction (and no crack) appears once the slices are bent.
 */
export function sliceZ(g: THREE.BufferGeometry, step = BEND_STEP): THREE.BufferGeometry {
  const p = g.getAttribute("position"), n = g.getAttribute("normal"), uv = g.getAttribute("uv");
  const P: number[] = [], N: number[] = [], U: number[] = [];
  const emit = (v: V) => { P.push(v[0], v[1], v[2]); N.push(v[3], v[4], v[5]); U.push(v[6], v[7]); };
  const vert = (i: number): V => [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), uv.getX(i), uv.getY(i)];
  for (let t = 0; t + 2 < p.count; t += 3) {
    const tri = [vert(t), vert(t + 1), vert(t + 2)];
    const z0 = Math.min(tri[0][2], tri[1][2], tri[2][2]);
    const z1 = Math.max(tri[0][2], tri[1][2], tri[2][2]);
    const s0 = Math.floor(z0 / step + 1e-6), s1 = Math.ceil(z1 / step - 1e-6);
    if (s1 - s0 <= 1) { tri.forEach(emit); continue; }
    for (let s = s0; s < s1; s++) {
      let poly = clip(tri, s * step, true);
      if (poly.length >= 3) poly = clip(poly, (s + 1) * step, false);
      for (let k = 1; k + 1 < poly.length; k++) { emit(poly[0]); emit(poly[k]); emit(poly[k + 1]); }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  return out;
}

/**
 * Bend road-local geometry (x = driver's left, y up, z forward, z = 0 at `frame(0)`) onto the track, in place.
 * frame(z) is the track pose z metres along from the piece origin. followY: ride the road's height profile (road,
 * paint, shoulder, sidewalk); otherwise keep the origin height (cliffs and sea that sit on the ground, not the ramp).
 * ox/oz: the chunk group origin subtracted from world x/z.
 */
export function bendGeometry(g: THREE.BufferGeometry, frame: (z: number) => BendPose, followY: boolean, ox = 0, oz = 0) {
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  const y0 = frame(0).y;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = frame(z);
    // local +X = (tz, 0, -tx), local +Z = (tx, 0, tz)   (makeRotationY(atan2(tx, tz)))
    p.setXYZ(i, f.x + f.tz * x - ox, (followY ? f.y : y0) + y, f.z - f.tx * x - oz);
    if (n) {
      const nx = n.getX(i), nz = n.getZ(i);
      n.setXYZ(i, f.tz * nx + f.tx * nz, n.getY(i), -f.tx * nx + f.tz * nz);
    }
  }
  p.needsUpdate = true;
  if (n) n.needsUpdate = true;
  g.computeBoundingSphere();
  g.computeBoundingBox();
}
