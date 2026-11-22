/**
 * Authored stage courses. Race s is metres from the start line.
 * Engine absolute s = COURSE_ORIGIN + race s (hero begin() along).
 * Night City layout: docs/levels/01_night_city.md v1.1.
 * Coast Road layout: LEVELS/02_coast_road.md v1.1 (locked).
 * Pine Woods layout: LEVELS/03_pine_woods.md v1.0 (locked).
 * Open Highway layout: LEVELS/04_open_highway.md v1.0 (locked).
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

/** Locked Coast Road section table (LEVELS/02_coast_road.md §1). Sea side = lat > 0. */
export const COAST_ROAD: Course = {
  id: "coast",
  length: 4000,
  runout: COURSE_RUNOUT,
  width: 24,
  medians: [
    { s0: 1210, s1: 1580, half: 0.3 },
    { s0: 2030, s1: 2410, half: 0.3 },
  ],
  sections: [
    { id: "CR-0", type: "road", s0: 0, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "harbor", curves: [] },
    { id: "CR-1", type: "road", s0: 300, len: 340, width: 24, edgeL: "rail", edgeR: "rail", zone: "seawall", curves: [curve(300, 340, -500)] },
    { id: "CR-1a", type: "road", s0: 640, len: 60, width: 24, edgeL: "rail", edgeR: "rail", zone: "seawall", curves: [] },
    { id: "CR-2", type: "ramp", s0: 700, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "dune", curves: [] },
    { id: "CR-3", type: "road", s0: 850, len: 350, width: 24, edgeL: "soft", edgeR: "soft", zone: "palm", curves: [curve(850, 350, 600)] },
    { id: "CR-4", type: "split", s0: 1200, len: 400, width: 24, edgeL: "rail", edgeR: "rail", zone: "fork-a", curves: [curve(1200, 400, 220)] },
    { id: "CR-5", type: "tunnel", s0: 1600, len: 120, width: 24, edgeL: "rail", edgeR: "rail", zone: "arch", curves: [] },
    { id: "CR-6", type: "road", s0: 1720, len: 300, width: 24, edgeL: "rail", edgeR: "rail", zone: "lighthouse", curves: [curve(1720, 300, -350)] },
    { id: "CR-7", type: "split", s0: 2020, len: 400, width: 24, edgeL: "rail", edgeR: "rail", zone: "fork-b", curves: [] },
    { id: "CR-8", type: "road", s0: 2420, len: 280, width: 24, edgeL: "soft", edgeR: "soft", zone: "pier", curves: [] },
    { id: "CR-9", type: "ramp", s0: 2700, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "cliff-kick", curves: [] },
    {
      id: "CR-10",
      type: "road",
      s0: 2850,
      len: 400,
      width: 24,
      edgeL: "rail",
      edgeR: "rail",
      zone: "switch",
      curves: [curve(2850, 200, 260), curve(3050, 200, -260)],
    },
    {
      id: "CR-11",
      type: "road",
      s0: 3250,
      len: 450,
      width: 24,
      edgeL: "soft",
      edgeR: "soft",
      zone: "sunset",
      curves: [curve(3250, 170, 700), curve(3560, 140, 700)],
    },
    { id: "CR-12", type: "road", s0: 3700, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "boardwalk", curves: [] },
  ],
};

/** Locked Pine Woods section table (LEVELS/03_pine_woods.md §1). Lat < 0 is the driver's left (L1/L2). */
export const PINE_WOODS: Course = {
  id: "woods",
  length: 4400,
  runout: COURSE_RUNOUT,
  width: 24,
  medians: [
    { s0: 1360, s1: 1740, half: 0.3 },
    { s0: 2520, s1: 2850, half: 0.3 },
  ],
  sections: [
    { id: "PW-0", type: "road", s0: 0, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "mill", curves: [] },
    { id: "PW-1", type: "road", s0: 300, len: 340, width: 24, edgeL: "soft", edgeR: "soft", zone: "fern", curves: [curve(300, 340, -400)] },
    { id: "PW-1a", type: "road", s0: 640, len: 60, width: 24, edgeL: "soft", edgeR: "soft", zone: "fern", curves: [] },
    { id: "PW-2", type: "ramp", s0: 700, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "ridge", curves: [] },
    { id: "PW-3", type: "road", s0: 850, len: 500, width: 24, edgeL: "soft", edgeR: "soft", zone: "haul", curves: [curve(850, 500, 900)] },
    { id: "PW-4", type: "split", s0: 1350, len: 400, width: 24, edgeL: "soft", edgeR: "soft", zone: "fork-a", curves: [curve(1350, 400, 300)] },
    { id: "PW-5", type: "tunnel", s0: 1750, len: 160, width: 24, edgeL: "rail", edgeR: "rail", zone: "bridge", curves: [] },
    {
      id: "PW-6",
      type: "road",
      s0: 1910,
      len: 340,
      width: 24,
      edgeL: "soft",
      edgeR: "soft",
      zone: "hollow",
      curves: [curve(1910, 170, 250), curve(2080, 170, -250)],
    },
    { id: "PW-6a", type: "road", s0: 2250, len: 60, width: 24, edgeL: "soft", edgeR: "soft", zone: "hollow", curves: [] },
    { id: "PW-7", type: "ramp", s0: 2310, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "clearcut", curves: [] },
    { id: "PW-8", type: "split", s0: 2460, len: 400, width: 24, edgeL: "soft", edgeR: "soft", zone: "fork-b", curves: [] },
    {
      id: "PW-9",
      type: "road",
      s0: 2860,
      len: 600,
      width: 24,
      edgeL: "rail",
      edgeR: "rail",
      zone: "switch",
      curves: [curve(2860, 200, 200), curve(3060, 200, -200), curve(3260, 200, 300)],
    },
    { id: "PW-10", type: "road", s0: 3460, len: 640, width: 24, edgeL: "soft", edgeR: "soft", zone: "sawdust", curves: [curve(3700, 400, -600)] },
    { id: "PW-11", type: "road", s0: 4100, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "ranger", curves: [] },
  ],
};

/** Locked Open Highway section table (LEVELS/04_open_highway.md §1). Lat > 0 is the driver's right (L3/L4: bridge side
 *  of Fork A, inside of Fork B). */
export const OPEN_HIGHWAY: Course = {
  id: "highway",
  length: 5200,
  runout: COURSE_RUNOUT,
  width: 24,
  medians: [
    { s0: 2020, s1: 2480, half: 0.3 },
    { s0: 3510, s1: 4090, half: 0.3 },
  ],
  sections: [
    { id: "OH-0", type: "road", s0: 0, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "flats", curves: [] },
    { id: "OH-1", type: "road", s0: 300, len: 800, width: 24, edgeL: "soft", edgeR: "soft", zone: "sweep", curves: [curve(300, 800, -1200)] },
    { id: "OH-2", type: "road", s0: 1100, len: 400, width: 24, edgeL: "soft", edgeR: "soft", zone: "gates-1", curves: [] },
    { id: "OH-3", type: "road", s0: 1500, len: 500, width: 24, edgeL: "soft", edgeR: "soft", zone: "pump", curves: [curve(1500, 500, 1500)] },
    { id: "OH-4", type: "split", s0: 2000, len: 500, width: 24, edgeL: "rail", edgeR: "rail", zone: "bridge", curves: [] },
    { id: "OH-5", type: "tunnel", s0: 2500, len: 200, width: 24, edgeL: "rail", edgeR: "rail", zone: "mesa-cut", curves: [] },
    { id: "OH-6a", type: "road", s0: 2700, len: 60, width: 24, edgeL: "soft", edgeR: "soft", zone: "mesa", curves: [] },
    { id: "OH-6", type: "ramp", s0: 2760, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "hump", curves: [] },
    { id: "OH-7", type: "road", s0: 2910, len: 590, width: 24, edgeL: "soft", edgeR: "soft", zone: "gates-2", curves: [curve(2910, 590, 1000)] },
    { id: "OH-8", type: "split", s0: 3500, len: 600, width: 24, edgeL: "soft", edgeR: "soft", zone: "service", curves: [curve(3500, 600, -800)] },
    { id: "OH-9", type: "road", s0: 4100, len: 400, width: 24, edgeL: "soft", edgeR: "soft", zone: "dry-lake", curves: [] },
    // OH-9 carries Ramp R2 at 4500-4650 (§3); split out so the track builds the ramp profile there (rail on the R2 span)
    { id: "OH-9r", type: "ramp", s0: 4500, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "dry-lake", curves: [] },
    { id: "OH-9b", type: "road", s0: 4650, len: 250, width: 24, edgeL: "soft", edgeR: "soft", zone: "dry-lake", curves: [] },
    { id: "OH-10", type: "road", s0: 4900, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "mirage", curves: [] },
  ],
};

const COURSES: Record<string, Course> = { city: NIGHT_CITY, coast: COAST_ROAD, woods: PINE_WOODS, highway: OPEN_HIGHWAY };

export function courseFor(stageId: string): Course | null {
  return COURSES[stageId] ?? null;
}

/** Finish distance armed for this stage (authored course length; 2200 only for a stage without one). */
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

export const LANE_LAT = { L1: -9, L2: -3, L3: 3, L4: 9 } as const;
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

/** Coast Road fallen rocks (§5 RK): 3.6 m lat × 3.0 m along, coast_rock_a is 2.4 m tall. */
const ROCK = { latHalf: 1.8, alongHalf: 1.5, h: 2.4 };
export const COAST_OBSTACLES: Obstacle[] = [
  { id: "RK-1", s: 2120, lat: LANE_LAT.L2, ...ROCK },
  { id: "RK-2", s: 2290, lat: LANE_LAT.L1, ...ROCK },
];

/** Pine Woods fallen-log rows (§5 LOG): log_row_6 collider 6 m lat × 1.2 m along × 1.0 m tall (UCX_log_row_6). */
const LOG_ROW = { latHalf: 3, alongHalf: 0.6, h: 1.0 };
const logRow = (id: string, s: number, lane: keyof typeof LANE_LAT): Obstacle => ({ id, s, lat: LANE_LAT[lane], ...LOG_ROW });
export const WOODS_OBSTACLES: Obstacle[] = [
  logRow("LOG-A1", 1428, "L2"),
  logRow("LOG-A2", 1528, "L1"),
  logRow("LOG-A3", 1628, "L2"),
  logRow("LOG-H1a", 2000, "L1"),
  logRow("LOG-H1b", 2000, "L2"),
  logRow("LOG-H2", 2120, "L3"),
  logRow("LOG-H3", 2200, "L4"),
  logRow("LOG-S1", 3000, "L2"),
  logRow("LOG-S2", 3300, "L3"),
  logRow("LOG-K4", 3568, "L4"),
];

/** Open Highway roadworks (§5 OB): barricade rows on the main (left) side of Fork A. */
export const HIGHWAY_OBSTACLES: Obstacle[] = [barricade("OB-1", 2150, "L2"), barricade("OB-2", 2330, "L1")];

const OBSTACLES: Record<string, readonly Obstacle[]> = { city: NIGHT_CITY_OBSTACLES, coast: COAST_OBSTACLES, woods: WOODS_OBSTACLES, highway: HIGHWAY_OBSTACLES };

export function obstaclesFor(stageId: string): readonly Obstacle[] {
  return OBSTACLES[stageId] ?? [];
}

/** Lane kicker: 5.3 m window starting at the lip, live only within 3 m of the lane. */
export type LaneKicker = { id: string; s: number; lat: number; len: number; half: number };

export const NIGHT_CITY_KICKERS: LaneKicker[] = [
  { id: "K-B1", s: 2717, lat: 9, len: 5.3, half: 3 },
  { id: "K-B2", s: 2847, lat: 3, len: 5.3, half: 3 },
];

export const COAST_KICKERS: LaneKicker[] = [{ id: "K1", s: 3455, lat: 3, len: 5.3, half: 3 }];

/** Pine Woods log kickers (log_kicker_6 on the ramp_kicker_1m footprint), lip 8 m before the row in the closed lane. */
export const WOODS_KICKERS: LaneKicker[] = [
  { id: "LK1", s: 1420, lat: LANE_LAT.L2, len: 5.3, half: 3 },
  { id: "LK2", s: 1520, lat: LANE_LAT.L1, len: 5.3, half: 3 },
  { id: "LK3", s: 1620, lat: LANE_LAT.L2, len: 5.3, half: 3 },
  { id: "LK4", s: 3560, lat: LANE_LAT.L4, len: 5.3, half: 3 },
];

/** Open Highway bridge-lip kickers KA3 / KA4 (L3, L4, lip at 2252, §3). */
export const HIGHWAY_KICKERS: LaneKicker[] = [
  { id: "KA3", s: 2252, lat: LANE_LAT.L3, len: 5.3, half: 3 },
  { id: "KA4", s: 2252, lat: LANE_LAT.L4, len: 5.3, half: 3 },
];

export function laneKickerAt(stageId: string, raceS: number, lat: number): boolean {
  for (const k of stageIdKickers(stageId)) {
    if (raceS >= k.s && raceS <= k.s + k.len && Math.abs(lat - k.lat) <= k.half) return true;
  }
  return false;
}

/** `right` fires only for lat > 0 (the right roadway), `left` only for lat < 0. */
export type Gate = { id: string; s: number; side: "both" | "right" | "left" };

export const NIGHT_CITY_GATES: Gate[] = [
  { id: "G1", s: 480, side: "both" },
  { id: "G-A", s: 1380, side: "right" },
  { id: "G2", s: 1600, side: "both" },
  { id: "G3", s: 3420, side: "both" },
];

/** G-A sits on the sea kerb of Cove Cut, G-B on the sea side of Breaker Run between W2 and W3. */
export const COAST_GATES: Gate[] = [
  { id: "G1", s: 1100, side: "both" },
  { id: "G-A", s: 1500, side: "right" },
  { id: "G2", s: 1950, side: "both" },
  { id: "G-B", s: 2300, side: "right" },
  { id: "G3", s: 3760, side: "both" },
];

/** Pine Woods: G1 on the Haul Road, G-B on the gravel (right) side of Firebreak, G3 at the Ranger Finish. */
export const WOODS_GATES: Gate[] = [
  { id: "G1", s: 1100, side: "both" },
  { id: "G-B", s: 2690, side: "right" },
  { id: "G3", s: 4180, side: "both" },
];

/** Open Highway: gate chains GC1-3 (OH-2) and GC4-6 (OH-7), G-A on the bridge (right) side of Fork A, G-B on the
 *  outside (left) of Fork B. Chain phasing (GC2 = GC1 + 2.3 s ...) and the BN-9 cap raise are not wired yet. */
export const HIGHWAY_GATES: Gate[] = [
  { id: "GC1", s: 1200, side: "both" },
  { id: "GC2", s: 1320, side: "both" },
  { id: "GC3", s: 1440, side: "both" },
  { id: "G-A", s: 2340, side: "right" },
  { id: "GC4", s: 3100, side: "both" },
  { id: "GC5", s: 3220, side: "both" },
  { id: "GC6", s: 3340, side: "both" },
  { id: "G-B", s: 3900, side: "left" },
];

/** BN-18 per-side gap (LEVELS/04 §3, locked): the right deck of Fork A is snapped over 2260-2296 (course lat > median).
 *  A car over it has no ground; one that drops 6.2 m below the deck gets the off-road-style reset (sim.ts). */
export type SideGap = { id: string; s0: number; s1: number; latMin: number; latMax: number };
export const HIGHWAY_GAP: SideGap = { id: "GAP-A", s0: 2260, s1: 2296, latMin: 0.3, latMax: 13 };
const SIDE_GAPS: Record<string, readonly SideGap[]> = { highway: [HIGHWAY_GAP] };
/** the per-side gap under course s / lat on this stage, or null */
export function sideGapAt(stage: string, s: number, lat: number): SideGap | null {
  for (const g of SIDE_GAPS[stage] ?? []) if (s >= g.s0 && s < g.s1 && lat > g.latMin && lat < g.latMax) return g;
  return null;
}
const GATES: Record<string, readonly Gate[]> = { city: NIGHT_CITY_GATES, coast: COAST_GATES, woods: WOODS_GATES, highway: HIGHWAY_GATES };

export function gatesFor(stageId: string): readonly Gate[] {
  return GATES[stageId] ?? [];
}

/** Nearest ramp, kicker, or gate to a tunnel mouth. Night City's nearest is G2, 100 m before NC-6. */
export function tunnelClearance(course: Course): { ok: boolean; nearest: string; gap: number } {
  const features: { name: string; s: number }[] = [];
  for (const sec of course.sections) {
    if (sec.type !== "ramp") continue;
    features.push({ name: sec.id, s: sec.s0 }, { name: `${sec.id}-end`, s: sec.s0 + sec.len });
  }
  for (const k of stageIdKickers(course.id)) features.push({ name: k.id, s: k.s });
  for (const g of gatesFor(course.id)) features.push({ name: g.id, s: g.s });
  let nearest = "";
  let gap = Infinity;
  for (const t of course.sections) {
    if (t.type !== "tunnel") continue;
    const mouth0 = t.s0;
    const mouth1 = t.s0 + t.len;
    for (const f of features) {
      const d = Math.min(Math.abs(f.s - mouth0), Math.abs(f.s - mouth1));
      if (d < gap) {
        gap = d;
        nearest = f.name;
      }
      if (f.s >= mouth0 - 60 && f.s <= mouth1 + 60) return { ok: false, nearest: f.name, gap: d };
    }
  }
  return { ok: true, nearest, gap };
}

const KICKERS: Record<string, readonly LaneKicker[]> = { city: NIGHT_CITY_KICKERS, coast: COAST_KICKERS, woods: WOODS_KICKERS, highway: HIGHWAY_KICKERS };

export function stageIdKickers(id: string): readonly LaneKicker[] {
  return KICKERS[id] ?? [];
}

/** Full-width ramp kicker strip (road.ts ramp profile: lip 48–60 m into the piece). */
export const RAMP_KICK0 = 48;
export const RAMP_KICK1 = 60;

/** 6 s cycle: green 3, amber 1.2, red 1.8. Offset is a hash of the gate s, not the wall clock. */
export function gatePhase(gateS: number, time: number): "green" | "amber" | "red" {
  const x = Math.sin(gateS * 127.1 + 3.7) * 43758.5453;
  const offset = (x - Math.floor(x)) * 6;
  const c = (((time + offset) % 6) + 6) % 6;
  if (c < 3) return "green";
  if (c < 4.2) return "amber";
  return "red";
}

export function obstacleOverlap(o: Obstacle, raceS: number, lat: number): boolean {
  return Math.abs(raceS - o.s) <= o.alongHalf + CAR_ALONG && Math.abs(lat - o.lat) <= o.latHalf + CAR_LAT;
}

/** Ramp lips and lane kickers, expanded ±6 m so a 12 m backstep does not plant on the lip. */
export function kickerWindow(stageId: string, raceS: number, lat = 0): boolean {
  const course = courseFor(stageId);
  if (!course) return false;
  for (const sec of course.sections) {
    if (sec.type !== "ramp") continue;
    if (raceS >= sec.s0 + RAMP_KICK0 - 6 && raceS <= sec.s0 + RAMP_KICK1 + 6) return true;
  }
  for (const k of stageIdKickers(stageId)) {
    if (raceS >= k.s - 6 && raceS <= k.s + k.len + 6 && Math.abs(lat - k.lat) <= k.half) return true;
  }
  return false;
}

export function respawnBlocked(stageId: string, raceS: number, lat: number): boolean {
  if (kickerWindow(stageId, raceS, lat)) return true;
  // §8.2: never reset into a wave-wash zone (any phase, so the pick stays deterministic)
  if (washAt(stageId, raceS, lat)) return true;
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

/** Burst-ram suppression windows (BN-14): 30 m before each ramp, lane kicker and obstacle. */
export function burstWindows(stageId: string): [number, number][] {
  const course = courseFor(stageId);
  if (!course) return [];
  const out: [number, number][] = [];
  for (const sec of course.sections) if (sec.type === "ramp") out.push([sec.s0 - 30, sec.s0]);
  for (const k of stageIdKickers(stageId)) out.push([k.s - 30, k.s]);
  for (const o of obstaclesFor(stageId)) out.push([o.s - 30, o.s]);
  return out;
}

// ---------------------------------------------------------------- BN-8 surfaces, BN-10 timed zones (Coast Road §5)

/** Lane-wide surface patch. lat is the lane centre; the patch covers lat ± half. kind defaults to sand. */
export type Surface = { id: string; s0: number; s1: number; lat: number; half: number; kind?: "sand" | "gravel" };
export const SAND = { cap: 34, decel: 14, steerMul: 0.8, gripMul: 1 } as const;
/** Pine Woods gravel firebreak (§5 GV): cap 36, decel 12 above the cap, steerMul 0.85, no damage. */
export const GRAVEL = { cap: 36, decel: 12, steerMul: 0.85, gripMul: 1 } as const;
export const surfaceParams = (p: Surface) => (p.kind === "gravel" ? GRAVEL : SAND);
export const WOODS_GRAVEL: Surface[] = [
  { id: "GV1", s0: 2580, s1: 2660, lat: LANE_LAT.L3, half: 3, kind: "gravel" },
  { id: "GV2", s0: 2720, s1: 2800, lat: LANE_LAT.L4, half: 3, kind: "gravel" },
];
export const COAST_SAND: Surface[] = [
  { id: "SD1", s0: 950, s1: 1010, lat: LANE_LAT.L4, half: 3 },
  { id: "SD2", s0: 1280, s1: 1340, lat: LANE_LAT.L1, half: 3 },
  { id: "SD3", s0: 1420, s1: 1480, lat: LANE_LAT.L2, half: 3 },
  { id: "SD5", s0: 3000, s1: 3040, lat: LANE_LAT.L2, half: 3 },
  { id: "SD6", s0: 3150, s1: 3190, lat: LANE_LAT.L3, half: 3 },
  { id: "SD7", s0: 3460, s1: 3490, lat: LANE_LAT.L3, half: 3 },
];
/** Open Highway gravel (§5 GV): GV1 roadworks lane, GV2 / GV3 staggered on the inside of Fork B. */
export const HIGHWAY_GRAVEL: Surface[] = [
  { id: "GV1", s0: 2200, s1: 2280, lat: LANE_LAT.L1, half: 3, kind: "gravel" },
  { id: "GV2", s0: 3600, s1: 3680, lat: LANE_LAT.L3, half: 3, kind: "gravel" },
  { id: "GV3", s0: 3800, s1: 3880, lat: LANE_LAT.L4, half: 3, kind: "gravel" },
];
const SANDS: Record<string, readonly Surface[]> = { coast: COAST_SAND, woods: WOODS_GRAVEL, highway: HIGHWAY_GRAVEL };
export function sandFor(stageId: string): readonly Surface[] {
  return SANDS[stageId] ?? [];
}
export function sandAt(stageId: string, raceS: number, lat: number): Surface | null {
  for (const p of sandFor(stageId)) if (raceS >= p.s0 && raceS <= p.s1 && Math.abs(lat - p.lat) <= p.half) return p;
  return null;
}

/** Wave wash across both sea lanes (lat > 0). Phase is seconds on the race clock (sim.time since begin). */
export type Wash = { id: string; s0: number; s1: number; phase: number };
export const WASH = { period: 4.5, on: 0.9, telegraph: 0.9, decel: 10, gripMul: 0.4, steerMul: 0.7 } as const;
export const COAST_WASH: Wash[] = [
  { id: "W1", s0: 2080, s1: 2120, phase: 0 },
  { id: "W2", s0: 2220, s1: 2260, phase: 1.5 },
  { id: "W3", s0: 2360, s1: 2400, phase: 3 },
];
const WASHES: Record<string, readonly Wash[]> = { coast: COAST_WASH };
export function washFor(stageId: string): readonly Wash[] {
  return WASHES[stageId] ?? [];
}
/** Zone under (raceS, lat), regardless of phase. Sea lanes only (lat > 0, inside the carriageway). */
export function washAt(stageId: string, raceS: number, lat: number): Wash | null {
  if (lat <= 0) return null;
  for (const w of washFor(stageId)) if (raceS >= w.s0 && raceS <= w.s1) return w;
  return null;
}
/** "on" for 0.9 s each 4.5 s from the zone phase; "telegraph" the 0.9 s before that; else "off". */
export function washPhase(w: Wash, time: number): "on" | "telegraph" | "off" {
  const c = (((time - w.phase) % WASH.period) + WASH.period) % WASH.period;
  if (c < WASH.on) return "on";
  if (c >= WASH.period - WASH.telegraph) return "telegraph";
  return "off";
}
