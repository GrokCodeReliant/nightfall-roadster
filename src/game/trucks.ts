// Week I: Pine Woods logging trucks (LEVELS/03_pine_woods.md §5 LT, BN-17). Neutral, lane-locked, 20 m/s traffic the
// hero always catches (below SCROLL_MIN). Pure state + rules here; sim.ts applies contact, world.ts draws logging_truck.
import { courseFor, edgeKind, LANE_LAT, type Obstacle } from "./course";

export type TruckSpec = { id: string; lane: keyof typeof LANE_LAT; s0: number; s1: number; kind?: "forklift" };
/** spawn -> exit, race s (§5 LT placements) */
export const WOODS_TRUCKS: TruckSpec[] = [
  { id: "LT1", lane: "L3", s0: 1000, s1: 1600 },
  { id: "LT2", lane: "L4", s0: 1200, s1: 1800 },
  { id: "LT3", lane: "L3", s0: 1360, s1: 1960 },
  { id: "LT4", lane: "L1", s0: 2560, s1: 3160 },
  { id: "LT5", lane: "L1", s0: 2590, s1: 3190 },
  { id: "LT6", lane: "L2", s0: 3800, s1: 4300 },
];
/** 12 m × 2.6 m × 3.8 m (logging_truck collider), 20 m/s, spawn 300 m ahead of the hero, gone 150 m behind, max 3 alive */
export const TRUCK = { speed: 20, alongHalf: 6, latHalf: 1.3, h: 3.8, spawnAhead: 300, behind: 150, maxAlive: 3, dmg: 8, pull: 40, pullOut: 7 } as const;

/** Industrial Port forklifts (LEVELS/05 §5 FL, BN-17): 2.2 x 2.4 x 4 m, 12 m/s, OB rule (hero -6 hp). FL1 on the quay floor
 *  (Fork A left), FL2 inside the Long Shed; each drives its section and leaves at the next soft edge. */
export const PORT_FORKLIFTS: TruckSpec[] = [
  { id: "FL1", lane: "L2", s0: 1550, s1: 1740, kind: "forklift" },
  { id: "FL2", lane: "L4", s0: 2600, s1: 2790, kind: "forklift" },
];
export const FORKLIFT = { speed: 12, alongHalf: 2, latHalf: 1.1, h: 2.4, dmg: 6 } as const;
/** collider / pace of one mover (logging truck or forklift) */
export const moverDims = (spec: TruckSpec) => (spec.kind === "forklift" ? FORKLIFT : TRUCK);

export type Truck = { id: string; lane: number; lat: number; s: number; s1: number; alive: boolean; done: boolean; pulling: boolean; spec: TruckSpec };

const TRUCKS: Record<string, readonly TruckSpec[]> = { woods: WOODS_TRUCKS, port: PORT_FORKLIFTS };
export const truckSpecsFor = (stageId: string): readonly TruckSpec[] => TRUCKS[stageId] ?? [];

export function freshTrucks(stageId: string): Truck[] {
  return truckSpecsFor(stageId).map((spec) => ({ id: spec.id, lane: LANE_LAT[spec.lane], lat: LANE_LAT[spec.lane], s: spec.s0, s1: spec.s1, alive: false, done: false, pulling: false, spec }));
}

/** The run ends at s1, but a truck never pulls off through a rail (bridge, switchbacks): it drives on to the rail's end. */
export function pullOffAt(stageId: string, spec: TruckSpec): number {
  const course = courseFor(stageId);
  if (!course) return spec.s1;
  const side = LANE_LAT[spec.lane] < 0 ? "L" : "R";
  let s = Math.min(spec.s1, course.length - 100);
  while (s < course.length && edgeKind(course, s, side) === "rail") s += 10;
  return s;
}

/** Spawn / drive / pull off / despawn. heroS is the hero's race s. Deterministic (no randomness, no wall clock). */
export function stepTrucks(stageId: string, trucks: Truck[], heroS: number, dt: number) {
  const course = courseFor(stageId);
  const edge = course ? course.width / 2 : 12;
  let alive = trucks.filter((t) => t.alive).length;
  for (const t of trucks) {
    if (t.done || t.alive) continue;
    if (heroS < t.spec.s0 - TRUCK.spawnAhead) continue;
    // a slot freed too late (or the hero is already on top of the spawn): never pop a truck into view
    if (heroS > t.spec.s0 - 120 || alive >= TRUCK.maxAlive) {
      if (heroS > t.spec.s0 - 120) t.done = true;
      continue;
    }
    t.alive = true;
    t.s = t.spec.s0;
    t.s1 = pullOffAt(stageId, t.spec);
    alive++;
  }
  for (const t of trucks) {
    if (!t.alive) continue;
    t.s += moverDims(t.spec).speed * dt;
    if (t.s >= t.s1) {
      t.pulling = true;
      const out = Math.sign(t.lane) * (edge + TRUCK.pullOut);
      const k = Math.min(1, (t.s - t.s1) / TRUCK.pull);
      t.lat = t.lane + (out - t.lane) * k * k * (3 - 2 * k);
    }
    if ((t.pulling && Math.abs(t.lat) >= edge + TRUCK.pullOut - 0.01) || t.s < heroS - TRUCK.behind) {
      t.alive = false;
      t.done = true;
    }
  }
}

export function truckObstacle(t: Truck): Obstacle {
  const d = moverDims(t.spec);
  return { id: t.id, s: t.s, lat: t.lat, latHalf: d.latHalf, alongHalf: d.alongHalf, h: d.h };
}

/** BN-17 rival avoidance: a truck within 40 m ahead in this lateral band. */
export function truckAhead(trucks: readonly Truck[], s: number, lat: number, look = 40): Truck | null {
  for (const t of trucks) {
    if (!t.alive) continue;
    const k = moverDims(t.spec);
    const d = t.s - k.alongHalf - s;
    if (d > -k.alongHalf * 2 && d < look && Math.abs(t.lat - lat) < k.latHalf + 1.6) return t;
  }
  return null;
}
