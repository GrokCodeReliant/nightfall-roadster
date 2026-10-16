/** Côte Noire — a closed night circuit with a ramp, a void, and stutter pits. */

export type Sample = {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  rx: number;
  rz: number;
  s: number;
  u: number;
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

export type Track = {
  samples: Sample[];
  length: number;
  width: number;
  cps: number[];
};

const WIDTH = 16;

const CTRL: [number, number][] = [
  [0, 0],
  [0, -58],
  [8, -118],
  [36, -168],
  [92, -192],
  [152, -176],
  [196, -128],
  [204, -68],
  [176, -18],
  [124, 2],
  [136, 52],
  [168, 108],
  [128, 156],
  [58, 176],
  [-18, 168],
  [-92, 132],
  [-142, 72],
  [-162, 8],
  [-148, -56],
  [-96, -96],
  [-42, -78],
  [-16, -38],
];

const HEIGHT: [number, number][] = [
  [0, 0],
  [0.1, 0],
  [0.145, 5.6],
  [0.205, 0.15],
  [0.33, 0],
  [0.365, 0],
  [0.405, 7.4],
  [0.51, 7.4],
  [0.575, 0],
  [1, 0],
];

const GAPS: [number, number][] = [
  [0.16, 0.19],
  [0.422, 0.488],
  [0.628, 0.642],
  [0.658, 0.672],
  [0.688, 0.702],
];

const KICKER: [number, number] = [0.138, 0.15];

function inRange(u: number, a: number, b: number) {
  return u >= a && u <= b;
}

function heightAt(u: number) {
  const x = ((u % 1) + 1) % 1;
  for (let i = 0; i < HEIGHT.length - 1; i++) {
    const [u0, y0] = HEIGHT[i];
    const [u1, y1] = HEIGHT[i + 1];
    if (x >= u0 && x <= u1) {
      const t = (x - u0) / (u1 - u0 || 1);
      return y0 + (y1 - y0) * t;
    }
  }
  return 0;
}

function gapAt(u: number) {
  for (const [a, b] of GAPS) if (inRange(u, a, b)) return true;
  return false;
}

function cm(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
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

export function buildTrack(): Track {
  const n = CTRL.length;
  const steps = 14;
  const raw: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = CTRL[(i - 1 + n) % n];
    const p1 = CTRL[i];
    const p2 = CTRL[(i + 1) % n];
    const p3 = CTRL[(i + 2) % n];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      raw.push({ x: cm(p0[0], p1[0], p2[0], p3[0], t), z: cm(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }

  const samples: Sample[] = [];
  let acc = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 0.0001;
    samples.push({
      x: a.x,
      y: 0,
      z: a.z,
      tx: dx / len,
      tz: dz / len,
      rx: 0,
      rz: 0,
      s: acc,
      u: 0,
      gap: false,
      kicker: false,
    });
    acc += len;
  }
  const length = acc;
  for (const samp of samples) {
    samp.u = samp.s / length;
    samp.y = heightAt(samp.u);
    samp.gap = gapAt(samp.u);
    samp.kicker = inRange(samp.u, KICKER[0], KICKER[1]);
    const yaw = yawFromDir(samp.tx, samp.tz);
    samp.rx = Math.cos(yaw);
    samp.rz = -Math.sin(yaw);
  }

  const cps: number[] = [];
  const CPN = 8;
  for (let i = 0; i < CPN; i++) cps.push((i / CPN) * length);

  return { samples, length, width: WIDTH, cps };
}

function segLen(track: Track, i: number) {
  const a = track.samples[i];
  const n = track.samples.length;
  if (i === n - 1) return track.length - a.s;
  return track.samples[i + 1].s - a.s;
}

export function poseAt(track: Track, s: number): Pose {
  const L = track.length;
  let d = s % L;
  if (d < 0) d += L;
  const samples = track.samples;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].s <= d) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const a = samples[i];
  const b = samples[(i + 1) % samples.length];
  const sl = segLen(track, i) || 0.0001;
  const t = Math.max(0, Math.min(1, (d - a.s) / sl));
  const lerp = (p: number, q: number) => p + (q - p) * t;
  return {
    x: lerp(a.x, b.x),
    y: lerp(a.y, b.y),
    z: lerp(a.z, b.z),
    tx: a.tx,
    tz: a.tz,
    rx: a.rx,
    rz: a.rz,
    s: d,
    gap: a.gap && b.gap,
    kicker: a.kicker || b.kicker,
    slope: (b.y - a.y) / sl,
    width: track.width,
  };
}

export type Query = Pose & { lateral: number };

export function queryTrack(track: Track, x: number, z: number): Query {
  const samples = track.samples;
  const n = samples.length;
  let bestD = Infinity;
  let bestI = 0;
  let bestT = 0;
  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const ab2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / ab2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = a.x + abx * t;
    const cz = a.z + abz * t;
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      bestI = i;
      bestT = t;
    }
  }
  const a = samples[bestI];
  const b = samples[(bestI + 1) % n];
  const sl = segLen(track, bestI) || 0.0001;
  const lerp = (p: number, q: number) => p + (q - p) * bestT;
  const rx = lerp(a.rx, b.rx);
  const rz = lerp(a.rz, b.rz);
  const cx = lerp(a.x, b.x);
  const cz = lerp(a.z, b.z);
  const lateral = (x - cx) * rx + (z - cz) * rz;
  const s = bestI === n - 1 ? a.s + sl * bestT : lerp(a.s, b.s);
  return {
    x: cx,
    y: lerp(a.y, b.y),
    z: cz,
    tx: lerp(a.tx, b.tx),
    tz: lerp(a.tz, b.tz),
    rx,
    rz,
    s: s >= track.length ? s - track.length : s,
    gap: a.gap && b.gap,
    kicker: (a.kicker || b.kicker) && bestT < 0.85,
    slope: (b.y - a.y) / sl,
    width: track.width,
    lateral,
  };
}

export function gapAhead(track: Track, s: number, dist: number) {
  for (let d = 6; d <= dist; d += 6) {
    if (poseAt(track, s + d).gap) return true;
  }
  return false;
}
