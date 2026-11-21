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

export type Course = {
  id: string;
  length: number;
  runout: number;
  width: number;
  sections: Section[];
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
