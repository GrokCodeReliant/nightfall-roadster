/**
 * v0.2 endless one-way highway. Samples every 2 m along a seeded, gently curving
 * spline, generated lazily ahead of the player and trimmed behind. Rare set pieces
 * (kicker ramps and elevated void gaps) keep the thrusters relevant.
 */

export type Sample = {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  rx: number;
  rz: number;
  s: number;
  gap: boolean;
  kicker: boolean;
};

export type Pose = {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  rx: number;
  rz: number;
  s: number;
  gap: boolean;
  kicker: boolean;
  slope: number;
  width: number;
};

export type Piece = { kind: "ramp" | "void"; s: number; len: number; signS: number; label: string };

export type Track = {
  /** samples[k] has index first + k and sits at s = (first + k) * STEP */
  samples: Sample[];
  first: number;
  width: number;
  pieces: Piece[];
  seed: number;
  gen: { i: number; x: number; z: number; h: number };
};

export const STEP = 2;
export const WIDTH = 24;
export const LANES = [-9, -3, 3, 9];
const START_STRAIGHT = 320;

function hash(i: number) {
  const x = Math.sin(i * 127.1 + 3.7) * 43758.5453;
  return x - Math.floor(x);
}

export function wrapAngle(a: number) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** forward = (-sin yaw, -cos yaw); yaw 0 faces world −Z. */
export function yawFromDir(tx: number, tz: number) {
  return Math.atan2(-tx, -tz);
}

function curvature(track: Track, s: number) {
  const p = track.seed;
  const ease = Math.min(1, Math.max(0, (s - START_STRAIGHT) / 260));
  return ease * (0.0042 * Math.sin(s / 330 + p * 6.1) + 0.0028 * Math.sin(s / 151 + p * 2.3));
}

function extendPieces(track: Track, upTo: number) {
  let last = track.pieces[track.pieces.length - 1];
  while (!last || last.s < upTo) {
    const n = track.pieces.length;
    const s = last ? last.s + last.len + 420 + hash(n * 7 + track.seed * 13) * 380 : 760;
    const kind: Piece["kind"] = n % 2 === 0 ? "ramp" : "void";
    const len = kind === "ramp" ? 150 : 250;
    last = { kind, s, len, signS: s - 130, label: kind === "ramp" ? "RAMP" : "VOID  —  THRUST" };
    track.pieces.push(last);
  }
}

function pieceAt(track: Track, s: number): Piece | null {
  extendPieces(track, s + 400);
  for (const p of track.pieces) {
    if (s >= p.s && s <= p.s + p.len) return p;
    if (p.s > s) break;
  }
  return null;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function profile(track: Track, s: number) {
  const p = pieceAt(track, s);
  if (!p) return { y: 0, gap: false, kicker: false };
  const d = s - p.s;
  if (p.kind === "ramp") {
    // up 0→5.4 over 60 m, kicker on the last 12 m, then a long descent to land on
    if (d <= 60) return { y: lerp(0, 5.4, d / 60), gap: false, kicker: d >= 48 };
    return { y: lerp(5.4, 0, (d - 60) / 90), gap: false, kicker: false };
  }
  // void: climb to an elevated deck, a 50 m hole, deck, descent
  if (d <= 70) return { y: lerp(0, 7.4, d / 70), gap: false, kicker: false };
  if (d <= 100) return { y: 7.4, gap: false, kicker: false };
  if (d <= 150) return { y: 7.4, gap: true, kicker: false };
  if (d <= 180) return { y: 7.4, gap: false, kicker: false };
  return { y: lerp(7.4, 0, (d - 180) / 70), gap: false, kicker: false };
}

export function buildTrack(seed = 0.37): Track {
  const track: Track = { samples: [], first: 0, width: WIDTH, pieces: [], seed, gen: { i: 0, x: 0, z: 0, h: 0 } };
  ensureTrack(track, 900);
  return track;
}

/** Make sure samples exist up to distance s. */
export function ensureTrack(track: Track, s: number) {
  const need = Math.ceil(s / STEP) + 2;
  const g = track.gen;
  while (g.i <= need) {
    const sd = g.i * STEP;
    const tx = -Math.sin(g.h);
    const tz = -Math.cos(g.h);
    const pr = profile(track, sd);
    track.samples.push({
      x: g.x,
      y: pr.y,
      z: g.z,
      tx,
      tz,
      rx: Math.cos(g.h),
      rz: -Math.sin(g.h),
      s: sd,
      gap: pr.gap,
      kicker: pr.kicker,
    });
    g.x += tx * STEP;
    g.z += tz * STEP;
    g.h += curvature(track, sd + STEP * 0.5) * STEP;
    g.i += 1;
  }
}

/** Drop samples well behind distance s (keeps memory flat on long runs). */
export function trimTrack(track: Track, s: number) {
  const keepFrom = Math.floor(s / STEP);
  const drop = keepFrom - track.first;
  if (drop > 200) {
    track.samples.splice(0, drop);
    track.first += drop;
    while (track.pieces.length > 2 && track.pieces[0].s + track.pieces[0].len < s - 50) track.pieces.shift();
  }
}

export function sampleAt(track: Track, i: number): Sample {
  if (i - track.first >= track.samples.length) ensureTrack(track, (i + 4) * STEP);
  const k = Math.max(0, Math.min(track.samples.length - 1, i - track.first));
  return track.samples[k];
}

export function poseAt(track: Track, s: number): Pose {
  const minS = track.first * STEP;
  const d = Math.max(minS, s);
  const i = Math.floor(d / STEP);
  const a = sampleAt(track, i);
  const b = sampleAt(track, i + 1);
  const t = Math.max(0, Math.min(1, (d - a.s) / STEP));
  const l = (p: number, q: number) => p + (q - p) * t;
  return {
    x: l(a.x, b.x),
    y: l(a.y, b.y),
    z: l(a.z, b.z),
    tx: a.tx,
    tz: a.tz,
    rx: a.rx,
    rz: a.rz,
    s: d,
    gap: a.gap && b.gap,
    kicker: a.kicker || b.kicker,
    slope: (b.y - a.y) / STEP,
    width: track.width,
  };
}

export type Query = Pose & { lateral: number };

/** Nearest point on the road to (x, z). `hint` is a nearby distance (the car's last `along`). */
export function queryTrack(track: Track, x: number, z: number, hint?: number): Query {
  let i0: number;
  let i1: number;
  if (hint == null) {
    i0 = track.first;
    i1 = track.first + track.samples.length - 2;
  } else {
    const hi = Math.floor(hint / STEP);
    i0 = Math.max(track.first, hi - 24);
    i1 = hi + 40;
    ensureTrack(track, (i1 + 2) * STEP);
  }
  let bestD = Infinity;
  let bestI = i0;
  let bestT = 0;
  for (let i = i0; i <= i1; i++) {
    const a = sampleAt(track, i);
    const b = sampleAt(track, i + 1);
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const ab2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / ab2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const dx = x - (a.x + abx * t);
    const dz = z - (a.z + abz * t);
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      bestI = i;
      bestT = t;
    }
  }
  const a = sampleAt(track, bestI);
  const b = sampleAt(track, bestI + 1);
  const l = (p: number, q: number) => p + (q - p) * bestT;
  const rx = l(a.rx, b.rx);
  const rz = l(a.rz, b.rz);
  const cx = l(a.x, b.x);
  const cz = l(a.z, b.z);
  return {
    x: cx,
    y: l(a.y, b.y),
    z: cz,
    tx: l(a.tx, b.tx),
    tz: l(a.tz, b.tz),
    rx,
    rz,
    s: a.s + STEP * bestT,
    gap: a.gap && b.gap,
    kicker: (a.kicker || b.kicker) && bestT < 0.85,
    slope: (b.y - a.y) / STEP,
    width: track.width,
    lateral: (x - cx) * rx + (z - cz) * rz,
  };
}

export function gapAhead(track: Track, s: number, dist: number) {
  for (let d = 6; d <= dist; d += 6) {
    if (poseAt(track, s + d).gap) return true;
  }
  return false;
}

export function nextPiece(track: Track, s: number): Piece | null {
  extendPieces(track, s + 600);
  for (const p of track.pieces) if (p.s + p.len >= s) return p;
  return null;
}
