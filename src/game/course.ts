/**
 * Authored stage courses. Race s is metres from the start line.
 * Engine absolute s = COURSE_ORIGIN + race s (hero begin() along).
 * Night City layout: docs/levels/01_night_city.md v1.1.
 * Coast Road layout: LEVELS/02_coast_road.md v1.1 (locked).
 * Pine Woods layout: LEVELS/03_pine_woods.md v1.0 (locked).
 * Open Highway layout: LEVELS/04_open_highway.md v1.0 (locked).
 * Industrial Port layout: LEVELS/05_industrial_port.md v1.0 (locked).
 * Mountain Pass layout: LEVELS/06_mountain_pass.md v1.0 (locked).
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
  /** BN-22 ramp profile for a `ramp` section (default: 5.4 m crest at 60 m, kicker 48-60 m, 90 m descent) */
  ramp?: RampProfile;
};
/** BN-22: crest height h at `up` m, kicker from `kick` to `up`, then `down` m back to the road */
export type RampProfile = { h: number; up: number; kick: number; down: number };
export const RAMP_DEFAULT: RampProfile = { h: 5.4, up: 60, kick: 48, down: 90 };
/** the profile of a ramp section (Summit Leap: 9.0 m over 80 m, kicker 68-80 m, 120 m down) */
export const rampOf = (sec: Section): RampProfile => sec.ramp ?? RAMP_DEFAULT;

export type Median = { s0: number; s1: number; half: number };

/** BN-16 width taper (race s): the live road width runs w0 -> w1 over s0-s1. */
export type Taper = { s0: number; s1: number; w0: number; w1: number };
/** BN-15 per-side height: the side lat > latMin (the right roadway of a split) climbs 0 -> h over s0-up, holds to down, and
 *  descends to 0 at s1. The median is a wall on both faces while the sides differ. */
export type SideLift = { s0: number; up: number; down: number; s1: number; h: number; latMin: number };

export type Course = {
  id: string;
  length: number;
  runout: number;
  width: number;
  sections: Section[];
  medians: Median[];
  tapers?: Taper[];
  lifts?: SideLift[];
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

/** Locked Industrial Port section table (LEVELS/05_industrial_port.md §1). 18 m (3-lane) container canyons IP-2 / IP-10
 *  with 40 m tapers (BN-16); Fork A's right side climbs onto the container tops (BN-15, 5.2 m); Long Shed tunnel IP-7. */
export const INDUSTRIAL_PORT: Course = {
  id: "port",
  length: 4600,
  runout: COURSE_RUNOUT,
  width: 24,
  medians: [
    { s0: 1250, s1: 1730, half: 0.3 },
    { s0: 2860, s1: 3380, half: 0.3 },
  ],
  tapers: [
    { s0: 700, s1: 740, w0: 24, w1: 18 },
    { s0: 1200, s1: 1240, w0: 18, w1: 24 },
    { s0: 4000, s1: 4040, w0: 24, w1: 18 },
    { s0: 4300, s1: 4340, w0: 18, w1: 24 },
  ],
  lifts: [{ s0: 1250, up: 1310, down: 1660, s1: 1720, h: 5.2, latMin: 0.3 }],
  sections: [
    { id: "IP-0", type: "road", s0: 0, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "gate", curves: [] },
    { id: "IP-1", type: "road", s0: 300, len: 400, width: 24, edgeL: "soft", edgeR: "soft", zone: "warehouse", curves: [curve(300, 400, 450)] },
    { id: "IP-2", type: "road", s0: 700, len: 500, width: 18, edgeL: "rail", edgeR: "rail", zone: "canyon", curves: [] },
    { id: "IP-3", type: "road", s0: 1200, len: 40, width: 24, edgeL: "rail", edgeR: "rail", zone: "canyon-exit", curves: [] },
    { id: "IP-4", type: "split", s0: 1240, len: 500, width: 24, edgeL: "rail", edgeR: "rail", zone: "stack", curves: [curve(1240, 500, -600)] },
    { id: "IP-5a", type: "road", s0: 1740, len: 60, width: 24, edgeL: "soft", edgeR: "soft", zone: "dock", curves: [] },
    { id: "IP-5", type: "ramp", s0: 1800, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "drydock", curves: [] },
    { id: "IP-6", type: "road", s0: 1950, len: 600, width: 24, edgeL: "soft", edgeR: "soft", zone: "crane", curves: [curve(1950, 600, 500)] },
    { id: "IP-7", type: "tunnel", s0: 2550, len: 240, width: 24, edgeL: "rail", edgeR: "rail", zone: "shed", curves: [] },
    { id: "IP-8", type: "split", s0: 2790, len: 600, width: 24, edgeL: "soft", edgeR: "soft", zone: "rail-spur", curves: [] },
    { id: "IP-9", type: "road", s0: 3390, len: 210, width: 24, edgeL: "soft", edgeR: "rail", zone: "quay", curves: [] },
    // IP-9 carries Ramp R2 Quay Kick at 3600-3750 (§3); split out so the track builds the ramp profile there
    { id: "IP-9r", type: "ramp", s0: 3600, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "quay", curves: [] },
    { id: "IP-9b", type: "road", s0: 3750, len: 250, width: 24, edgeL: "soft", edgeR: "rail", zone: "quay", curves: [curve(3750, 250, -700)] },
    { id: "IP-10", type: "road", s0: 4000, len: 300, width: 18, edgeL: "rail", edgeR: "rail", zone: "gauntlet", curves: [] },
    { id: "IP-11", type: "road", s0: 4300, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "finish", curves: [] },
  ],
};

/** Locked Mountain Pass section table (LEVELS/06_mountain_pass.md §1). Hairpins R 90 (peak 76 m with the 40 m easing),
 *  switchbacks R 100 / 120, 18 m (3-lane) roads on the hairpins and switchbacks (BN-16), the BN-22 Summit Leap. */
export const SUMMIT_LEAP: RampProfile = { h: 9.0, up: 80, kick: 68, down: 120 };
export const MOUNTAIN_PASS: Course = {
  id: "pass",
  length: 4800,
  runout: COURSE_RUNOUT,
  width: 24,
  medians: [
    { s0: 2010, s1: 2450, half: 0.3 },
    { s0: 3480, s1: 3960, half: 0.3 },
  ],
  tapers: [
    { s0: 1000, s1: 1040, w0: 24, w1: 18 },
    { s0: 1260, s1: 1300, w0: 18, w1: 24 },
    { s0: 1700, s1: 1740, w0: 24, w1: 18 },
    { s0: 1960, s1: 2000, w0: 18, w1: 24 },
    // MP-8 holds 24 m through the R1 landing (furthest 2714), then tapers to 18 from 2720 (§3)
    { s0: 2670, s1: 2720, w0: 24, w1: 24 },
    { s0: 2720, s1: 2760, w0: 24, w1: 18 },
    { s0: 3430, s1: 3470, w0: 18, w1: 24 },
  ],
  sections: [
    { id: "MP-0", type: "road", s0: 0, len: 300, width: 24, edgeL: "soft", edgeR: "soft", zone: "lodge", curves: [] },
    { id: "MP-1", type: "road", s0: 300, len: 500, width: 24, edgeL: "rail", edgeR: "rail", zone: "climb", curves: [curve(300, 250, 300), curve(550, 250, -300)] },
    { id: "MP-2", type: "tunnel", s0: 800, len: 200, width: 24, edgeL: "rail", edgeR: "rail", zone: "shed", curves: [curve(800, 200, 800)] },
    { id: "MP-3", type: "road", s0: 1000, len: 260, width: 18, edgeL: "rail", edgeR: "rail", zone: "eagle", curves: [curve(1000, 260, 90)] },
    { id: "MP-4", type: "road", s0: 1260, len: 440, width: 24, edgeL: "rail", edgeR: "rail", zone: "scree", curves: [] },
    { id: "MP-5", type: "road", s0: 1700, len: 260, width: 18, edgeL: "rail", edgeR: "rail", zone: "kettle", curves: [curve(1700, 260, -90)] },
    { id: "MP-6", type: "split", s0: 1960, len: 500, width: 24, edgeL: "rail", edgeR: "rail", zone: "fork-a", curves: [curve(1960, 500, 250)] },
    { id: "MP-7a", type: "road", s0: 2460, len: 60, width: 24, edgeL: "rail", edgeR: "rail", zone: "ridge", curves: [] },
    { id: "MP-7", type: "ramp", s0: 2520, len: 150, width: 24, edgeL: "rail", edgeR: "rail", zone: "ridge", curves: [] },
    {
      id: "MP-8",
      type: "road",
      s0: 2670,
      len: 800,
      width: 18,
      edgeL: "rail",
      edgeR: "rail",
      zone: "switch",
      curves: [curve(2670, 200, 100), curve(2970, 200, -100), curve(3270, 200, 120)],
    },
    { id: "MP-9", type: "split", s0: 3470, len: 500, width: 24, edgeL: "rail", edgeR: "rail", zone: "fork-b", curves: [] },
    { id: "MP-10a", type: "road", s0: 3970, len: 60, width: 24, edgeL: "rail", edgeR: "rail", zone: "leap", curves: [] },
    { id: "MP-10", type: "ramp", s0: 4030, len: 200, width: 24, edgeL: "rail", edgeR: "rail", zone: "leap", curves: [], ramp: SUMMIT_LEAP },
    { id: "MP-11", type: "road", s0: 4230, len: 570, width: 24, edgeL: "rail", edgeR: "soft", zone: "summit", curves: [curve(4230, 270, -500)] },
  ],
};

const COURSES: Record<string, Course> = { city: NIGHT_CITY, coast: COAST_ROAD, woods: PINE_WOODS, highway: OPEN_HIGHWAY, port: INDUSTRIAL_PORT, pass: MOUNTAIN_PASS };

/** BN-16: live road width at race s (tapers first, then the section's width; 24 off-course). */
export function widthAt(course: Course, raceS: number): number {
  for (const t of course.tapers ?? []) if (raceS >= t.s0 && raceS <= t.s1) return t.w0 + ((t.w1 - t.w0) * (raceS - t.s0)) / (t.s1 - t.s0);
  const sec = sectionAt(course, raceS);
  return sec ? sec.width : course.width;
}
/** BN-15: extra deck height at race s / lat (0 on the ground side). Smoothstep climb / descent. */
export function sideLiftAt(course: Course, raceS: number, lat: number): number {
  for (const l of course.lifts ?? []) {
    if (lat <= l.latMin || raceS <= l.s0 || raceS >= l.s1) continue;
    const ease = (t: number) => t * t * (3 - 2 * t);
    if (raceS < l.up) return l.h * ease((raceS - l.s0) / (l.up - l.s0));
    if (raceS > l.down) return l.h * ease((l.s1 - raceS) / (l.s1 - l.down));
    return l.h;
  }
  return 0;
}

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

/** Mountain Pass snowdrift row SD (§5): mtn_snowdrift_row_6 on L3 at 3688, 6 m x 1.2 m x 1.0 m tall, OB rule; K-B hops it. */
export const PASS_OBSTACLES: Obstacle[] = [{ id: "SD", s: 3688, lat: LANE_LAT.L3, latHalf: 3, alongHalf: 0.6, h: 1.0 }];

const OBSTACLES: Record<string, readonly Obstacle[]> = { city: NIGHT_CITY_OBSTACLES, coast: COAST_OBSTACLES, woods: WOODS_OBSTACLES, highway: HIGHWAY_OBSTACLES, pass: PASS_OBSTACLES };

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

/** Mountain Pass lane kicker K-B (§3): L3, lip 3680, clears the snowdrift row at 3688 at every speed >= 22. */
export const PASS_KICKERS: LaneKicker[] = [{ id: "K-B", s: 3680, lat: LANE_LAT.L3, len: 5.3, half: 3 }];

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
/** Industrial Port: G1 on Warehouse Row, G-A on the container tops (right) of Fork A, G-B on the yard road (left) of Fork B. */
export const PORT_GATES: Gate[] = [
  { id: "G1", s: 600, side: "both" },
  { id: "G-A", s: 1600, side: "right" },
  { id: "G-B", s: 3070, side: "left" },
];
/** Mountain Pass: G-A on the outside (right) of Fork A, G-B on the frozen-lake shelf (right) of Fork B. No finish gate. */
export const PASS_GATES: Gate[] = [
  { id: "G-A", s: 2300, side: "right" },
  { id: "G-B", s: 3850, side: "right" },
];
const GATES: Record<string, readonly Gate[]> = { city: NIGHT_CITY_GATES, coast: COAST_GATES, woods: WOODS_GATES, highway: HIGHWAY_GATES, port: PORT_GATES, pass: PASS_GATES };

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

const KICKERS: Record<string, readonly LaneKicker[]> = { city: NIGHT_CITY_KICKERS, coast: COAST_KICKERS, woods: WOODS_KICKERS, highway: HIGHWAY_KICKERS, pass: PASS_KICKERS };

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
    const r = rampOf(sec);
    if (raceS >= sec.s0 + r.kick - 6 && raceS <= sec.s0 + r.up + 6) return true;
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
  const road = course ? widthAt(course, raceS) / 2 : 12;
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
export type Surface = { id: string; s0: number; s1: number; lat: number; half: number; kind?: "sand" | "gravel" | "oil" | "rail" | "ice" };
export const SAND = { cap: 34, decel: 14, steerMul: 0.8, gripMul: 1 } as const;
/** Pine Woods gravel firebreak (§5 GV): cap 36, decel 12 above the cap, steerMul 0.85, no damage. */
export const GRAVEL = { cap: 36, decel: 12, steerMul: 0.85, gripMul: 1 } as const;
/** Industrial Port oil slick (§5 OS): grip x0.25, steer x0.6 while inside and for OIL_RESIDUE s after; no speed change,
 *  no damage, no spin. The cap is out of reach so the shared surface path never slows a car on oil. */
export const OIL = { cap: 999, decel: 0, steerMul: 0.6, gripMul: 0.25 } as const;
export const OIL_RESIDUE = 0.5;
/** Industrial Port rail crossing (§5 RX): 8 m strip, cap 38, steer x0.8, slows only. */
export const RAILX = { cap: 38, decel: 12, steerMul: 0.8, gripMul: 1 } as const;
/** Mountain Pass ice (§5 IC): grip x0.3, steer x0.55 while inside and for ICE_RESIDUE s after; no speed change, no damage,
 *  no spin (the same slick path as the port oil). */
export const ICE = { cap: 999, decel: 0, steerMul: 0.55, gripMul: 0.3 } as const;
export const ICE_RESIDUE = 0.3;
export const surfaceParams = (p: Surface) => (p.kind === "gravel" ? GRAVEL : p.kind === "oil" ? OIL : p.kind === "ice" ? ICE : p.kind === "rail" ? RAILX : SAND);
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
/** Industrial Port oil OS1-OS8 (§5; lane 0 / lane +6 are the canyon lanes) and rail crossings RX1-RX3 (Fork B right side). */
const oil = (id: string, s0: number, s1: number, lat: number): Surface => ({ id, s0, s1, lat, half: 3, kind: "oil" });
export const PORT_OIL: Surface[] = [
  oil("OS1", 500, 530, LANE_LAT.L2),
  oil("OS2", 900, 930, 0),
  oil("OS3", 1400, 1440, LANE_LAT.L1),
  oil("OS4", 2150, 2185, LANE_LAT.L3),
  oil("OS5", 2400, 2435, LANE_LAT.L2),
  oil("OS6", 2950, 2990, LANE_LAT.L2),
  oil("OS7", 3150, 3190, LANE_LAT.L1),
  oil("OS8", 4150, 4180, 6),
];
export const PORT_RAILX: Surface[] = [2950, 3100, 3250].map((s, i) => ({ id: `RX${i + 1}`, s0: s - 4, s1: s + 4, lat: 6, half: 6, kind: "rail" as const }));
/** Mountain Pass ice IC1-IC6 (§5): lane-wide patches (18 m sections use the -6 / 0 / +6 lanes). */
const ice = (id: string, s0: number, s1: number, lat: number): Surface => ({ id, s0, s1, lat, half: 3, kind: "ice" });
export const PASS_ICE: Surface[] = [
  ice("IC1", 1120, 1150, -6),
  ice("IC2", 1820, 1850, 6),
  ice("IC3", 3050, 3080, 0),
  ice("IC4", 2150, 2190, LANE_LAT.L2),
  ice("IC5", 3560, 3620, LANE_LAT.L3),
  ice("IC6", 3700, 3760, LANE_LAT.L4),
];
const SANDS: Record<string, readonly Surface[]> = { coast: COAST_SAND, woods: WOODS_GRAVEL, highway: HIGHWAY_GRAVEL, port: [...PORT_OIL, ...PORT_RAILX], pass: PASS_ICE };
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

// ---------------------------------------------------------------- BN-19 telegraphed overhead hazards (Industrial Port §5 CS)
/** Crane swing: a container load sweeps across the road in an 8 m band. 6 s cycle on the race clock: idle, 1.0 s ground-shadow
 *  telegraph, 0.8 s active sweep. In the active band (0-6 m over the deck): hero -14 hp, AI -8, once per sweep; no push, no
 *  speed change; invuln / shield respected. `side: "right"` = the container tops only (CS-T). */
export type Crane = { id: string; s: number; side: "both" | "right"; phase: number };
export const CRANE = { period: 6, telegraph: 1.0, active: 0.8, half: 4, h: 6, heroDmg: 14, aiDmg: 8 } as const;
export const PORT_CRANES: Crane[] = [
  { id: "CS1", s: 1050, side: "both", phase: 0 },
  { id: "CS-T", s: 1500, side: "right", phase: 1.5 },
  { id: "CS2", s: 2200, side: "both", phase: 3 },
  { id: "CS3", s: 2350, side: "both", phase: 4.5 },
  { id: "CS4", s: 4200, side: "both", phase: 2.25 },
];
const CRANES: Record<string, readonly Crane[]> = { port: PORT_CRANES };
export function cranesFor(stageId: string): readonly Crane[] {
  return CRANES[stageId] ?? [];
}
/** phase of a crane at race-clock `time`: cycle index n, state, and u (0..1 through the telegraph or the sweep) */
export function cranePhase(c: Crane, time: number): { n: number; state: "idle" | "telegraph" | "active"; u: number } {
  const t = time - c.phase;
  const n = Math.floor(t / CRANE.period);
  const k = t - n * CRANE.period;
  const a0 = CRANE.period - CRANE.active, t0 = a0 - CRANE.telegraph;
  if (k >= a0) return { n, state: "active", u: (k - a0) / CRANE.active };
  if (k >= t0) return { n, state: "telegraph", u: (k - t0) / CRANE.telegraph };
  return { n, state: "idle", u: k / t0 };
}
/** the crane band under (race s, lat), or null (CS-T only over the container tops, lat > median) */
export function craneAt(stageId: string, raceS: number, lat: number): Crane | null {
  for (const c of cranesFor(stageId)) {
    if (Math.abs(raceS - c.s) > CRANE.half) continue;
    if (c.side === "right" && lat <= 0.3) continue;
    return c;
  }
  return null;
}

// ---------------------------------------------------------------- BN-19 rockfall (Mountain Pass §5 RF)
/** A rockfall zone: while the hero is in range, every 2.5 s a rock targets a lane at hero s + 60-90 m (seeded per zone).
 *  1.0 s shadow telegraph, then the impact (radius 3 m: hero -14 hp, AI -8, no push), then a 3 x 3 m static obstacle
 *  (OB rule) for 6 s, then it crumbles. Max one live rock per 40 m window; never in the shed. */
export type RockZone = { id: string; s0: number; s1: number; lanes: number[] };
export const ROCKFALL = { period: 2.5, telegraph: 1.0, ahead0: 60, ahead1: 90, radius: 3, heroDmg: 14, aiDmg: 8, life: 6, window: 40, drop: 24, half: 1.5, h: 3, iceGap: 40 } as const;
export const PASS_ROCKFALL: RockZone[] = [
  { id: "RF1", s0: 1400, s1: 1600, lanes: [LANE_LAT.L1, LANE_LAT.L2, LANE_LAT.L3, LANE_LAT.L4] },
  // RF2: the inside (left) roadway of Fork A only; RF3: the cliff road (left) of Fork B
  { id: "RF2", s0: 2250, s1: 2400, lanes: [LANE_LAT.L1, LANE_LAT.L2] },
  { id: "RF3", s0: 3550, s1: 3850, lanes: [LANE_LAT.L1, LANE_LAT.L2] },
];
const ROCKZONES: Record<string, readonly RockZone[]> = { pass: PASS_ROCKFALL };
export function rockZonesFor(stageId: string): readonly RockZone[] {
  return ROCKZONES[stageId] ?? [];
}
/** seed = hash(stage id, zone id): a small deterministic string hash (same inputs, same rocks) */
export function rockSeed(stageId: string, zoneId: string): number {
  let h = 2166136261;
  for (const ch of `${stageId}:${zoneId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
