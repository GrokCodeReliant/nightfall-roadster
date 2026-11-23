// Week I: course-distance zones (LEVELS/01_night_city.md, LEVELS/02_coast_road.md) mapped onto the endless track.
// Visual placement only. BN-12 (zone-driven track generation) is not in yet, so zones are read from course s and
// the track's own ramp/deck pieces stay where road.ts puts them.

import { PW_LEN, PW_ZONES } from "./woodscourse";
import { OH_LEN, OH_ZONES } from "./highwaycourse";
import { PORT_LEN, PORT_ZONES } from "./portcourse";
import { PASS_LEN, PASS_ZONES } from "./passcourse";

/** Hero start (sim START_S). Course s = along - START. */
export const COURSE_START = 140;
/** Run-out after the finish gantry before the course wraps (endless loop). Multiple of 40 keeps chunk alignment. */
export const RUNOUT = 400;

export type Zone = { id: string; s0: number; s1: number };

export const NC_LEN = 3600;
export const NC_ZONES: Zone[] = [
  { id: "NC-0", s0: 0, s1: 300 }, { id: "NC-1", s0: 300, s1: 560 }, { id: "NC-1a", s0: 560, s1: 620 },
  { id: "NC-2", s0: 620, s1: 770 }, { id: "NC-3", s0: 770, s1: 1070 }, { id: "NC-4", s0: 1070, s1: 1470 },
  { id: "NC-5", s0: 1470, s1: 1700 }, { id: "NC-6", s0: 1700, s1: 1940 }, { id: "NC-7", s0: 1940, s1: 2190 },
  { id: "NC-8", s0: 2190, s1: 2430 }, { id: "NC-8a", s0: 2430, s1: 2490 }, { id: "NC-9", s0: 2490, s1: 2640 },
  { id: "NC-10", s0: 2640, s1: 2960 }, { id: "NC-11", s0: 2960, s1: 3360 }, { id: "NC-12", s0: 3360, s1: 3600 },
];

export const CR_LEN = 4000;
export const CR_ZONES: Zone[] = [
  { id: "CR-0", s0: 0, s1: 300 }, { id: "CR-1", s0: 300, s1: 640 }, { id: "CR-1a", s0: 640, s1: 700 },
  { id: "CR-2", s0: 700, s1: 850 }, { id: "CR-3", s0: 850, s1: 1200 }, { id: "CR-4", s0: 1200, s1: 1600 },
  { id: "CR-5", s0: 1600, s1: 1720 }, { id: "CR-6", s0: 1720, s1: 2020 }, { id: "CR-7", s0: 2020, s1: 2420 },
  { id: "CR-8", s0: 2420, s1: 2700 }, { id: "CR-9", s0: 2700, s1: 2850 }, { id: "CR-10", s0: 2850, s1: 3250 },
  { id: "CR-11", s0: 3250, s1: 3700 }, { id: "CR-12", s0: 3700, s1: 4000 },
];

/** Per-chunk course context handed to the scenery builders. */
export type ChunkCourse = {
  /** wrapped course s at the chunk's first sample (may be negative before the start line on lap 0) */
  cs0: number;
  lap: number;
  len: number;
  /** zone id at the chunk midpoint ("RUN" in the run-out after the finish) */
  zone: string;
  /** every sample of the chunk is at ground level (no ramp / deck) */
  flat: boolean;
  /** sample offsets (0..seg-1) where a ramp kicker starts (track ramp piece s+48) */
  kick: number[];
  /** sample offset of the finish line in this chunk, or -1 */
  finishK: number;
  /** this is the start-grid chunk (lap 0, hero start at its midpoint) */
  grid: boolean;
};

export function zoneOf(zones: Zone[], len: number, s: number) {
  if (s < 0) return zones[0].id;
  if (s >= len) return "RUN";
  for (const z of zones) if (s >= z.s0 && s < z.s1) return z.id;
  return zones[zones.length - 1].id;
}

/** course context for a 40 m chunk starting at track distance along0 */
export function chunkCourse(stage: "city" | "coast" | "woods" | "highway" | "port" | "pass", along0: number, chunk: number, step: number,
  flatAt: (k: number) => boolean, rampStarts: number[]): ChunkCourse {
  const zones = stage === "city" ? NC_ZONES : stage === "woods" ? PW_ZONES : stage === "highway" ? OH_ZONES : stage === "port" ? PORT_ZONES : stage === "pass" ? PASS_ZONES : CR_ZONES;
  const len = stage === "city" ? NC_LEN : stage === "woods" ? PW_LEN : stage === "highway" ? OH_LEN : stage === "port" ? PORT_LEN : stage === "pass" ? PASS_LEN : CR_LEN;
  const cyc = len + RUNOUT;
  const raw = along0 - COURSE_START;
  const lap = raw < 0 ? 0 : Math.floor(raw / cyc);
  const cs0 = raw < 0 ? raw : raw - lap * cyc;
  const seg = Math.round(chunk / step);
  let flat = true;
  for (let k = 0; k <= seg; k++) if (!flatAt(k)) { flat = false; break; }
  const kick: number[] = [];
  for (const s of rampStarts) {
    const k = Math.round((s + 48 - along0) / step);
    if (k >= 0 && k < seg) kick.push(k);
  }
  const fk = Math.round((len - cs0) / step);
  return {
    cs0, lap, len,
    zone: zoneOf(zones, len, cs0 + chunk / 2),
    flat, kick,
    finishK: fk >= 0 && fk < seg ? fk : -1,
    grid: lap === 0 && cs0 + chunk / 2 === 0,
  };
}
