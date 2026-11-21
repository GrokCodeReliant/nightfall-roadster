/**
 * Authored stage courses. Race s is metres from the start line.
 * Engine absolute s = COURSE_ORIGIN + race s (hero begin() along).
 * Night City layout: docs/levels/01_night_city.md v1.1.
 */
export const COURSE_ORIGIN = 140;
export const COURSE_RUNOUT = 300;
const EASE = 40;

export type SectionType = "road" | "ramp" | "deck" | "split" | "tunnel";
export type EdgeKind = "rail" | "soft";

export type Curve = { s0: number; len: number; /** Signed nominal radius. R+ (left) is positive. */ R: number };

export type Section = {
  id: string;
  type: SectionType;
  s0: number;
  len: number;
  width: number;
  edgeL: EdgeKind;
  edgeR: EdgeKind;
  zone: string;
  curves: Curve[];
};

export type Median = { s0: number; s1: number; half: number };

export type Course = {
  id: string;
  length: number;
  runout: number;
  width: number;
  sections: Section[];
  medians: Median[];
};

function curve(s0: number, len: number, R: number): Curve {
  return { s0, len, R };
}

/** Locked Night City section table. s is race distance. */
export const NIGHT_CITY: Course = {
  id: "city",
  length: 3600,
  runout: COURSE_RUNOUT,
  width: 24,
  medians: [
    { s0: 1080, s1: 1460, half: 0.3 },
    { s0: 2700, s1: 2950, half: 0.3 },
  ],
  sections: [
    { id: "NC-0", type: "road", s0: 0, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "lantern", curves: [] },
    { id: "NC-1", type: "road", s0: 300, len: 260, width: 24, edgeL: "soft", edgeR: "soft", zone: "glass", curves: [curve(300, 260, 450)] },
    { id: "NC-1a", type: "road", s0: 560, len: 60, width: 24, edgeL: "soft", edgeR: "soft", zone: "glass", curves: [] },
    { id: "NC-2", type: "ramp", s0: 620, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "hump", curves: [] },
    { id: "NC-3", type: "road", s0: 770, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "market", curves: [curve(770, 300, -300)] },
    { id: "NC-4", type: "split", s0: 1070, len: 400, width: 24, edgeL: "soft", edgeR: "soft", zone: "fork-a", curves: [curve(1070, 400, 250)] },
    { id: "NC-5", type: "road", s0: 1470, len: 230, width: 24, edgeL: "soft", edgeR: "soft", zone: "overpass", curves: [] },
    { id: "NC-6", type: "tunnel", s0: 1700, len: 240, width: 24, edgeL: "rail", edgeR: "rail", zone: "tunnel", curves: [curve(1800, 140, -800)] },
    { id: "NC-7", type: "deck", s0: 1940, len: 250, width: 24, edgeL: "rail", edgeR: "rail", zone: "bridge", curves: [] },
    {
      id: "NC-8",
      type: "road",
      s0: 2190,
      len: 240,
      width: 24,
      edgeL: "soft",
      edgeR: "soft",
      zone: "chicane",
      curves: [curve(2190, 120, 220), curve(2310, 120, -220)],
    },
    { id: "NC-8a", type: "road", s0: 2430, len: 60, width: 24, edgeL: "soft", edgeR: "soft", zone: "chicane", curves: [] },
    { id: "NC-9", type: "ramp", s0: 2490, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "rooftop", curves: [] },
    { id: "NC-10", type: "split", s0: 2640, len: 320, width: 24, edgeL: "soft", edgeR: "soft", zone: "fork-b", curves: [] },
    { id: "NC-11", type: "road", s0: 2960, len: 400, width: 24, edgeL: "soft", edgeR: "soft", zone: "finale", curves: [curve(2960, 400, -400)] },
    { id: "NC-12", type: "road", s0: 3360, len: 240, width: 24, edgeL: "soft", edgeR: "soft", zone: "plaza", curves: [] },
  ],
};

const COURSES: Record<string, Course> = { city: NIGHT_CITY };

export function courseFor(stageId: string): Course | null {
  return COURSES[stageId] ?? null;
}

/** Finish distance armed for this stage. Highway keeps the shipped 2200 constant. */
export function raceDistance(stageId: string, highwayDist: number): number {
  return courseFor(stageId)?.length ?? highwayDist;
}

export function sectionAt(course: Course, raceS: number): Section | null {
  const sections = course.sections;
  if (raceS < 0) return null;
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const end = sec.s0 + sec.len;
    if (raceS >= sec.s0 && (raceS < end || (i === sections.length - 1 && raceS <= end))) return sec;
  }
  return null;
}

export function sectionById(course: Course, id: string): Section | null {
  return course.sections.find((s) => s.id === id) ?? null;
}

export function medianAt(course: Course, raceS: number): Median | null {
  for (const m of course.medians) if (raceS >= m.s0 && raceS <= m.s1) return m;
  return null;
}

/** One static barricade collider. lat/s are race-space. */
export type Obstacle = {
  id: string;
  s: number;
  lat: number;
  latHalf: number;
  alongHalf: number;
  h: number;
};

const LANE_LAT = { L1: -9, L2: -3, L3: 3, L4: 9 } as const;
const BARRICADE = { latHalf: 2.9, alongHalf: 0.365, h: 1.26 };
const CAR_ALONG = 1.2;
const CAR_LAT = 1.15;

function barricade(id: string, s: number, lane: keyof typeof LANE_LAT): Obstacle {
  return { id, s, lat: LANE_LAT[lane], ...BARRICADE };
}

/**
 * Eleven collider rows. HZ-3 is two lanes at one s, so each lane is its own box
 * (the sheet lists 9 sites and "11 rows").
 */
export const NIGHT_CITY_OBSTACLES: Obstacle[] = [
  barricade("HZ-1a", 860, "L4"),
  barricade("HZ-1b", 940, "L1"),
  barricade("HZ-1c", 1010, "L4"),
  barricade("HZ-2a", 1190, "L2"),
  barricade("HZ-2b", 1330, "L1"),
  barricade("HZ-3a", 2260, "L1"),
  barricade("HZ-3b", 2260, "L2"),
  barricade("HZ-3c", 2380, "L3"),
  barricade("HZ-3d", 2380, "L4"),
  barricade("HZ-4a", 2725, "L4"),
  barricade("HZ-4b", 2855, "L3"),
];

export function obstaclesFor(stageId: string): readonly Obstacle[] {
  return stageId === "city" ? NIGHT_CITY_OBSTACLES : [];
}

/** Lane kicker: 5.3 m window starting at the lip, live only within 3 m of the lane. */
export type LaneKicker = { id: string; s: number; lat: number; len: number; half: number };

export const NIGHT_CITY_KICKERS: LaneKicker[] = [
  { id: "K-B1", s: 2717, lat: 9, len: 5.3, half: 3 },
  { id: "K-B2", s: 2847, lat: 3, len: 5.3, half: 3 },
];

export function laneKickerAt(stageId: string, raceS: number, lat: number): boolean {
  if (stageId !== "city") return false;
  for (const k of NIGHT_CITY_KICKERS) {
    if (raceS >= k.s && raceS <= k.s + k.len && Math.abs(lat - k.lat) <= k.half) return true;
  }
  return false;
}

export function obstacleOverlap(o: Obstacle, raceS: number, lat: number): boolean {
  return Math.abs(raceS - o.s) <= o.alongHalf + CAR_ALONG && Math.abs(lat - o.lat) <= o.latHalf + CAR_LAT;
}

/** Ramp lips and lane kickers, expanded ±6 m so a 12 m backstep does not plant on the lip. */
export function kickerWindow(stageId: string, raceS: number, lat = 0): boolean {
  if (stageId !== "city") return false;
  if (raceS >= 662 && raceS <= 686) return true;
  if (raceS >= 2532 && raceS <= 2556) return true;
  for (const k of NIGHT_CITY_KICKERS) {
    if (raceS >= k.s - 6 && raceS <= k.s + k.len + 6 && Math.abs(lat - k.lat) <= k.half) return true;
  }
  return false;
}

export function respawnBlocked(stageId: string, raceS: number, lat: number): boolean {
  if (kickerWindow(stageId, raceS, lat)) return true;
  return obstaclesFor(stageId).some((o) => obstacleOverlap(o, raceS, lat));
}

/**
 * Free side is the larger gap inside the carriageway (median splits the road).
 * The landing stays on that side and short of the kerb.
 */
export function ejectLat(stageId: string, raceS: number, o: Obstacle, carLat: number): number {
  const course = courseFor(stageId);
  const med = course ? medianAt(course, raceS) : null;
  const road = 12;
  let lo = -road;
  let hi = road;
  if (med) {
    const side = Math.sign(o.lat) || Math.sign(carLat) || -1;
    if (side < 0) hi = -med.half;
    else lo = med.half;
  }
  const leftGap = o.lat - o.latHalf - lo;
  const rightGap = hi - (o.lat + o.latHalf);
  const sign = rightGap > leftGap ? 1 : -1;
  const raw = sign < 0 ? o.lat - o.latHalf - CAR_LAT - 0.1 : o.lat + o.latHalf + CAR_LAT + 0.1;
  return Math.max(lo + CAR_LAT, Math.min(hi - CAR_LAT, raw));
}

/** Edge on the driver's left (lateral < 0) or right. Missing road is soft. */
export function edgeKind(course: Course, raceS: number, side: "L" | "R"): EdgeKind {
  const sec = sectionAt(course, raceS);
  if (!sec) return "soft";
  return side === "L" ? sec.edgeL : sec.edgeR;
}

/** Signed curvature (rad/m) at an engine absolute s. Positive turns left. */
export function bendAt(course: Course, absS: number): number {
  const s = absS - COURSE_ORIGIN;
  if (s < 0 || s > course.length + course.runout) return 0;
  const sec = sectionAt(course, s);
  if (!sec) return 0;
  for (const c of sec.curves) {
    const d = s - c.s0;
    if (d < 0 || d > c.len || c.R === 0 || c.len <= EASE) continue;
    const theta = c.len / c.R;
    const peak = theta / (c.len - EASE);
    let scale = 1;
    if (d < EASE) scale = d / EASE;
    else if (d > c.len - EASE) scale = (c.len - d) / EASE;
    return peak * Math.max(0, scale);
  }
  return 0;
}
