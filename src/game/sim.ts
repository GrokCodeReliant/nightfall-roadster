import {
  ensureTrack,
  gapAhead,
  LANES,
  nextPiece,
  buildTrack,
  poseAt,
  queryTrack,
  trimTrack,
  wrapAngle,
  yawFromDir,
  type Track,
} from "./road";
import { emptyShop, heroMineArm, racePayout, type RacePurse, type ShopSave } from "./shop";
import { STEER_SENS_DEFAULT, clampSteerSens } from "./settings";

export type Fx =
  | { t: "shot" }
  | { t: "eshot" }
  | { t: "hit"; x: number; y: number; z: number; big: boolean }
  | { t: "boom"; x: number; y: number; z: number }
  | { t: "mine" }
  | { t: "land"; x: number; y: number; z: number; hard: boolean }
  | { t: "fall" }
  | { t: "scrape" }
  | { t: "wave" }
  | { t: "life" }
  | { t: "over" }
  | { t: "boss" }
  | { t: "rocket" }
  | { t: "emine" }
  | { t: "pickup"; kind: PickupKind }
  | { t: "down" }
  | { t: "track"; on: boolean };

export type Shot = {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  owner: number;
  dmg: number;
  rocket: boolean;
  target: number;
};

export type Mine = {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  life: number;
  arm: number;
  owner: number;
  oil: boolean;
  /** Set on a hero drop. freshHeroMines consumes it so cluster/oil/reserve do not key off 0.38. */
  fresh: boolean;
};

export type PickupKind = "repair" | "armor" | "gun" | "rockets" | "minepack" | "oil" | "nitro" | "shield" | "magnet";

export type Pickup = {
  alive: boolean;
  kind: PickupKind;
  crate: boolean;
  x: number;
  y: number;
  z: number;
  along: number;
  life: number;
};

export type Upgrades = {
  gun: number;
  armor: number;
  rockets: number;
  rocketCd: number;
  reserve: number;
  cluster: boolean;
  oilT: number;
  shieldT: number;
  magnetT: number;
};

export type Kind = "hero" | "rammer" | "gunner" | "mine" | "spiker" | "drone" | "boss";

/**
 * Collision sizes follow the Art GLBs (m5b): r = car-car contact radius (contact at rA+rB; the player is 1.075,
 * so two v0.1-size cars still touch at 2.15 m), hit = bullet radius, hitY/hitH = bullet band centre/half-height,
 * mineR = mine trigger radius, clamp = wall clamp from the road edge (enemies only; the player keeps v0.1's 1.15).
 */
export const ENEMY: Record<
  Exclude<Kind, "hero">,
  { hp: number; tier: number; ram: number; name: string; r: number; hit: number; hitY: number; hitH: number; mineR: number; clamp: number }
> = {
  rammer: { hp: 40, tier: 1, ram: 18, name: "Rammer", r: 1.14, hit: 1.83, hitY: 0.6, hitH: 1.6, mineR: 2.7, clamp: 1.12 }, // 4.73 x 2.13
  gunner: { hp: 55, tier: 2, ram: 6, name: "Gunner", r: 1.12, hit: 1.78, hitY: 0.6, hitH: 1.6, mineR: 2.63, clamp: 1.17 }, // 4.61 long, figure leans out the right side to x +1.116, 1.59 tall
  mine: { hp: 80, tier: 2, ram: 8, name: "Mine Layer", r: 1.1, hit: 1.86, hitY: 0.6, hitH: 1.6, mineR: 2.7, clamp: 1.1 }, // 4.81 x 2.06
  spiker: { hp: 60, tier: 2, ram: 10, name: "Spiker", r: 1.1, hit: 1.78, hitY: 0.6, hitH: 1.6, mineR: 2.63, clamp: 1.72 }, // 4.61, blades ±1.675
  drone: { hp: 30, tier: 3, ram: 0, name: "Drone", r: 0, hit: 1.7, hitY: 0.6, hitH: 1.6, mineR: 0, clamp: 1.15 },
  boss: { hp: 600, tier: 10, ram: 30, name: "Armored Hauler", r: 2.75, hit: 3.25, hitY: 1.4, hitH: 2.6, mineR: 3.68, clamp: 1.62 }, // 8.4 x 3.14 x 2.75
};
export const HERO_R = 1.075;
export function carRadius(c: { kind: Kind }) {
  return c.kind === "hero" ? HERO_R : ENEMY[c.kind].r;
}
export const DRONE_ALT = 6;
const OUT_OF_VIEW = 175;

export type Car = {
  id: number;
  hero: boolean;
  kind: Kind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  lat: number;
  vy: number;
  grounded: boolean;
  along: number;
  lastAlong: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  recover: number;
  spin: number;
  lane: number;
  baseSpeed: number;
  fireCd: number;
  flash: number;
  thrust: number;
  rounds: number;
  mines: number;
  mineCd: number;
  fuel: number;
  maxFuel: number;
  // v0.2 combat
  invuln: number;
  hold: number;
  holdT: number;
  burst: number;
  burstCd: number;
  ramCd: number;
  dropCd: number;
  spikeT: number;
  weaveT: number;
  leaving: boolean;
  leaveT: number;
  /** Highway rival. Not a wave hunter: no respawn, no hero-relative orbit. */
  racer: boolean;
  /** Cruise speed while `racer` is set. Ignored for wave hunters. */
  raceSpeed: number;
  /** Seconds of sidewall slide / steer assist still to run. */
  slideT: number;
  /** Continuous seconds spent more than OFFROAD_M past the road edge. */
  offT: number;
};

export type Phase = "menu" | "playing" | "paused" | "finished";

export type TouchState = {
  steer: number;
  throttle: number;
  fire: boolean;
  mine: boolean;
  thrust: boolean;
  /** non-boost cars: the boost slot is a Brake button */
  brake?: boolean;
};

export type Result = {
  time: number;
  score: number;
  wave: number;
  takedowns: number;
  falls: number;
  /** RaceTrial headline. Absent on a normal wreck. */
  reason?: string;
  /** 1–4 on a placed highway finish. 0 on a highway DNF. Absent off the highway. */
  place?: number;
  /** Place-table Credits, not including the lives bonus. */
  purse?: number;
  /** +20 per life remaining on a placed finish. 0 on DNF. */
  livesBonus?: number;
};

/** Highway RaceTrial. Other stage ids leave `armed` false. */
export const PACE_SPEED = 30;
export const GAP_WARN = 80;
export const GAP_WARN_HOLD = 2;
export const GAP_DNF = 140;
export const GAP_DNF_HOLD = 3;
export const RACE_DIST = 2200;
/** Highway rivals. They race the finish at their own speed; they are not wave hunters. */
export const RIVAL_COUNT = 3;
export const RIVAL_SPEED = 30;
export const RIVAL_OFFSETS = [-40, 20, 60] as const;
/** Forward pace while playing. Brake and reverse cannot go under this. */
export const SCROLL_MIN = 22;
/** Meters past the asphalt edge before an off-road fail can start. */
export const OFFROAD_M = 6;
/** Seconds that far off the road before the mid-track reset. */
export const OFFROAD_T = 0.85;
/** How far back the off-road reset places the car, in meters. */
export const OFFROAD_BACK = 12;
/** Invulnerability after an off-road reset. Lives and upgrades stay. */
export const OFFROAD_INVULN = 1;
/** Sidewall glance steer assist. Long enough to peel off, short of a full turn. */
export const WALL_SLIDE = 0.28;
/** Shown once when a highway RaceTrial begins. */
export const RACE_FIELD_TOAST = "Race the field — place pays";
export const FIELD_DNF = "Fell behind the field";
export const PLACE_NAME = ["", "1st", "2nd", "3rd", "4th"] as const;
/** Enemy mine fuse. Hero drops use MINE_ARM. */
export const ENEMY_MINE_ARM = 0.6;

export type RaceTrial = {
  armed: boolean;
  paceAlong: number;
  originAlong: number;
  warnT: number;
  dnfT: number;
  warning: boolean;
  /** Hero crossed RACE_DIST. Place is frozen. */
  held: boolean;
  /** Frozen place once the hero finishes or DNFs. 0 while the race is live. */
  place: number;
};

function freshRace(): RaceTrial {
  return { armed: false, paceAlong: 0, originAlong: 0, warnT: 0, dnfT: 0, warning: false, held: false, place: 0 };
}

export type Sim = {
  /** hero car id (world.ts CARS); stats, boost vs brake, track mode */
  carId: string;
  /** Model S track mode. Always starts OFF. Ignored unless the car's trackMode flag is set. */
  trackOn: boolean;
  /** edge detect for keyboard T so a held key does not auto-enable track mode */
  prevTrackKey: boolean;
  /** one-shot from the touch Track button or a gamepad Track edge; consumed by step() */
  touchTrack: boolean;
  /** DEV `?debug` Fully upgraded. begin() reapplies it after park so a title press sticks. */
  devFull: boolean;
  /** Persisted meta shop. begin() copies it onto the hero. Not cleared between runs. */
  shop: ShopSave;
  /** Start of a real race spends one shield/magnet/oil charge. Menu resets leave this false. */
  deployCharges: boolean;
  /** This finished run already added Credits. begin() clears it. */
  banked: boolean;
  /** previous frame's gamepad Track buttons, so a hold does not toggle every frame */
  prevPadTrack: boolean;
  /**
   * Last HTML5 gamepad sample. Zeros unless applyGamepad ran.
   * Ignored while keysOverride is set (scripted tests).
   */
  pad: { steer: number; throttle: number; fire: boolean; mine: boolean; thrust: boolean; brake: boolean };
  /** M1 boost state: deck height at take-off, cooldown after landing, air re-light used, floating */
  boostDeck: number;
  boostCd: number;
  relit: boolean;
  floating: boolean;
  track: Track;
  cars: Car[];
  shots: Shot[];
  mines: Mine[];
  phase: Phase;
  time: number;
  score: number;
  takedowns: number;
  falls: number;
  lives: number;
  wave: number;
  queue: Exclude<Kind, "hero">[];
  pickups: Pickup[];
  up: Upgrades;
  nextCrate: number;
  recycled: number;
  spawnCd: number;
  spawnFlip: number;
  lull: number;
  waveHit: boolean;
  toast: string;
  toastT: number;
  hitstop: number;
  events: Fx[];
  keys: Set<string>;
  keysOverride: Set<string> | null;
  touch: TouchState;
  mouseFire: boolean;
  mouseMine: boolean;
  prevMine: boolean;
  autoGas: boolean;
  result: Result | null;
  /** Stage picker id. RaceTrial arms only for `highway`. */
  stageId: string;
  /** Multiplier on hero steer → yaw. Keyboard, touch, and pad share it. */
  steerSens: number;
  race: RaceTrial;
  hinted: number;
  idleT: number;
  scrapeCd: number;
  trauma: number;
};

const GRAVITY = 27;
const THRUST_ACCEL = 40;
const MAX_FUEL = 100;
// M1 boost (Roadster only). BOOST_HOP_MAX = ~2x the Semi mesh height (rig_phone.glb Y max 3.84 m).
export const BOOST_HOP_MAX = 7.5;
export const BOOST_TAKEOFF_VY = 8;
export const BOOST_ACCEL = 30;
export const FLOAT_GRAVITY_SCALE = 0.45;
export const FLOAT_VY_MIN = -9;
export const RAMP_ASSIST = 1.25;
export const BOOST_COOLDOWN = 1.2;
export const BOOST_SPEED_BONUS = 10;
export const BOOST_SPEED_CAP = 58;
export type BoostSpec = { hopMax: number; accel: number };

/**
 * M2 lineup stats (game units). Baseline row is today's shipped feel: topSpeed 48, accel 24,
 * maxHp 100, mineCap 4, handling 1.0. Model S "on" values apply only while trackOn is true.
 * Model X side guns are not stock (M8). Rough terrain is a flag only until M6.
 */
export const CAR_IDS = ["model3", "model_y", "model_x", "model_s", "cybertruck", "roadster"] as const;
export type LineupId = (typeof CAR_IDS)[number];
export type CarStat = {
  topSpeed: number;
  accel: number;
  maxHp: number;
  mineCap: number;
  handling: number;
  boost: boolean;
  trackMode: boolean;
  roughTerrain: boolean;
  track?: { topSpeed: number; accel: number; handling: number };
};
export const CAR_STATS: Record<LineupId, CarStat> = {
  model3: { topSpeed: 48, accel: 24, maxHp: 100, mineCap: 4, handling: 1, boost: false, trackMode: false, roughTerrain: false },
  model_y: { topSpeed: 46, accel: 22, maxHp: 110, mineCap: 7, handling: 0.95, boost: false, trackMode: false, roughTerrain: false },
  model_x: { topSpeed: 50, accel: 26, maxHp: 115, mineCap: 7, handling: 0.92, boost: false, trackMode: false, roughTerrain: false },
  model_s: { topSpeed: 54, accel: 28, maxHp: 105, mineCap: 4, handling: 1.05, boost: false, trackMode: true, roughTerrain: false, track: { topSpeed: 64, accel: 30, handling: 1.15 } },
  cybertruck: { topSpeed: 44, accel: 23, maxHp: 160, mineCap: 12, handling: 0.85, boost: false, trackMode: false, roughTerrain: true },
  roadster: { topSpeed: 52, accel: 34, maxHp: 75, mineCap: 2, handling: 1.1, boost: true, trackMode: false, roughTerrain: false },
};

/** Save / picker ids from M1 map onto the locked lineup. Unknown ids start as Model 3. */
export function migrateCarId(raw: string | null | undefined): LineupId {
  if (raw === "volt" || raw === "volt_r" || raw === "volt_rs") return "model3";
  if (raw === "roadster" || raw === "roadster2026") return "roadster";
  if (raw && (CAR_IDS as readonly string[]).includes(raw)) return raw as LineupId;
  return "model3";
}

export function resolvedStats(carId: string, trackOn: boolean): CarStat & { id: LineupId } {
  const id = migrateCarId(carId);
  const row = CAR_STATS[id];
  const on = !!(trackOn && row.trackMode && row.track);
  return {
    ...row,
    id,
    topSpeed: on && row.track ? row.track.topSpeed : row.topSpeed,
    accel: on && row.track ? row.track.accel : row.accel,
    handling: on && row.track ? row.track.handling : row.handling,
  };
}

export function supportsTrackMode(carId: string) {
  return CAR_STATS[migrateCarId(carId)].trackMode;
}

/** Boost, hop, takeoff, and thrusters exist only when the migrated id is `roadster`. */
export function hasBoost(carId: string) {
  return migrateCarId(carId) === "roadster";
}

/**
 * Non-Roadster semi exit: height above the road while backing off the trailer.
 * `surface` is the deck or ramp collider height above the road, or null on a miss.
 * A hit stays on that collider and is clamped to the bay — never a hop above it.
 * A miss stays on the bay. The settle from the lip down to the road is separate
 * and only runs after the car has reached the end of the ramp.
 */
export function rollDeckHeight(_u: number, bayY: number, surface: number | null): number {
  if (surface != null && Number.isFinite(surface)) return Math.max(0, Math.min(bayY, surface));
  return bayY;
}

/** Roll-off timeline. Shared with the rig so the drop and the handoff cannot drift. */
export const ROLL_OUT0 = 3.6;
export const ROLL_OUT1 = 5.3;
export const ROLL_HAND = 5.8;
/** Bay-floor local z the hero starts on (rig node `bay_floor`, before the hitch). */
export const ROLL_START_Z = -9.05;
/**
 * Rig origin ahead of the sim spawn. The hero's end local z is the negation,
 * so the mesh is handed over exactly where the sim is already sitting.
 * Roadster keeps 14.6 — that hover path is not the lip fix.
 */
export const ROLL_RIG_ROADSTER = 14.6;
/**
 * Non-Roadster rig offset. With the ramp lowered, its foot is at rig-local
 * z ≈ -15.76 and still about a metre above the road. The longest nose
 * (Cybertruck, +2.85 m) has to be past that foot before y falls, with a
 * small margin: 15.76 + 2.85 + 0.39 = 19.
 */
export const ROLL_RIG_CLEAR = 19;
/** Seconds after OUT1 for the non-Roadster drop. Finishes before ROLL_HAND. */
export const ROLL_SETTLE = 0.36;
/** Probe distance along the nose. Cybertruck half-length is 2.85 m; nothing else is longer. */
export const ROLL_NOSE = 2.85;

export function rollRigBack(boost: boolean): number {
  return boost ? ROLL_RIG_ROADSTER : ROLL_RIG_CLEAR;
}

/** Smoothstep from OUT0 to OUT1. 0 before the roll, 1 once the kinematic path is done. */
export function rollProgress(t: number): number {
  if (t <= ROLL_OUT0) return 0;
  const x = (t - ROLL_OUT0) / (ROLL_OUT1 - ROLL_OUT0);
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

/** Local z along the rig. `u` is `rollProgress` (already eased). `endZ` is negative. */
export function rollLocalZ(u: number, endZ: number): number {
  const x = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return ROLL_START_Z + (endZ - ROLL_START_Z) * x;
}

/**
 * Roadster height after OUT1. `d` is 0 at OUT1 and 1 at handoff.
 * The sine after the drop is the hop. Other cars must not use this.
 */
export function rollRoadsterHeight(d: number, bayY: number): number {
  const u = d <= 0 ? 0 : d >= 1 ? 1 : d;
  return u < 0.45 ? bayY * (1 - (u / 0.45) ** 2) : 0.12 * Math.sin(((u - 0.45) / 0.55) * Math.PI) * (1 - u);
}

/**
 * Non-Roadster height after OUT1. `d` is 0 at OUT1 and 1 at the grounded pose
 * (before handoff). `fromY` is the lip height captured when the drop starts.
 * `surface` is the ramp or trailer still under the hull, or null / ≤0 once past it.
 * While a lip is under the car, y stays on it. Past the lip, y eases to the road
 * and is exactly 0 at d = 1. No hop.
 */
export function rollSettleHeight(d: number, fromY: number, surface: number | null): number {
  const u = d <= 0 ? 0 : d >= 1 ? 1 : d;
  if (u >= 1) return 0;
  const from = Math.max(0, fromY);
  const onLip = surface != null && Number.isFinite(surface) && surface > 0;
  if (onLip) return Math.min(from, surface);
  return from * (1 - u * u);
}

export type RollPoseState = { exitY: number | null; poseY: number | null };

/**
 * Non-Roadster rollout height. Stays on the bay, then the collider, then eases
 * to the road after OUT1. y is monotonic non-increasing after OUT1, and 0 once
 * the settle window completes — which is before handoff.
 */
export function stepNonRoadsterRoll(t: number, bayY: number, surface: number | null, state: RollPoseState): number {
  if (t < ROLL_OUT0) {
    state.poseY = bayY;
    return bayY;
  }
  const lip = surface != null && Number.isFinite(surface) && surface > 0 ? surface : null;
  if (t >= ROLL_OUT1) {
    if (state.exitY == null) state.exitY = lip == null ? 0 : rollDeckHeight(1, bayY, lip);
    const d = Math.min(1, (t - ROLL_OUT1) / ROLL_SETTLE);
    let y = rollSettleHeight(d, state.exitY, lip);
    if (state.poseY != null && y > state.poseY) y = state.poseY;
    state.poseY = y;
    return y;
  }
  let y: number;
  if (lip != null) {
    y = rollDeckHeight(rollProgress(t), bayY, lip);
    state.exitY = y;
  } else if (state.exitY != null) {
    y = state.exitY;
  } else {
    y = rollDeckHeight(rollProgress(t), bayY, null);
  }
  state.poseY = y;
  return y;
}

/** Mine lands just behind the press-time pose. The old 4.3 m offset was a trail. */
export const MINE_DROP_BACK = 1.6;
export const LIVES = 3;
export const ENEMY_SLOTS = 8;
const MAX_ALIVE = 8;
const START_S = 140;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function makeCar(id: number, hero: boolean, lane: number, baseSpeed: number): Car {
  return {
    id,
    hero,
    kind: hero ? "hero" : "rammer",
    x: 0,
    y: hero ? 0 : -40,
    z: 0,
    yaw: 0,
    speed: 0,
    lat: 0,
    vy: 0,
    grounded: true,
    along: 0,
    lastAlong: 0,
    hp: hero ? 100 : 40,
    maxHp: hero ? 100 : 40,
    alive: hero,
    recover: 0,
    spin: 0,
    lane,
    baseSpeed,
    fireCd: 0.4 + id * 0.15,
    flash: 0,
    thrust: 0,
    rounds: hero ? 24 : 99,
    mines: hero ? 4 : 0,
    mineCd: 0,
    fuel: MAX_FUEL,
    maxFuel: MAX_FUEL,
    invuln: 0,
    hold: 0,
    holdT: 0,
    burst: 0,
    burstCd: 0,
    ramCd: 0,
    dropCd: 0,
    spikeT: 0,
    weaveT: 0,
    leaving: false,
    leaveT: 0,
    racer: false,
    raceSpeed: 0,
    slideT: 0,
    offT: 0,
  };
}

function emptyShot(): Shot {
  return { alive: false, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, life: 0, owner: -1, dmg: 16, rocket: false, target: -1 };
}

function emptyMine(): Mine {
  return { alive: false, x: 0, y: 0, z: 0, life: 0, arm: 0, owner: -1, oil: false, fresh: false };
}

function emptyPickup(): Pickup {
  return { alive: false, kind: "repair", crate: false, x: 0, y: 0, z: 0, along: 0, life: 0 };
}

function freshUpgrades(): Upgrades {
  return { gun: 0, armor: 0, rockets: 0, rocketCd: 0, reserve: 0, cluster: false, oilT: 0, shieldT: 0, magnetT: 0 };
}

export function createSim(): Sim {
  const track = buildTrack();
  const cars = [makeCar(0, true, 0, 48)];
  for (let i = 1; i <= ENEMY_SLOTS; i++) cars.push(makeCar(i, false, LANES[i % 4], 40));
  const sim: Sim = {
    track,
    cars,
    shots: Array.from({ length: 96 }, emptyShot),
    mines: Array.from({ length: 24 }, emptyMine),
    pickups: Array.from({ length: 16 }, emptyPickup),
    up: freshUpgrades(),
    nextCrate: 420,
    recycled: 0,
    phase: "menu",
    time: 0,
    score: 0,
    takedowns: 0,
    falls: 0,
    lives: LIVES,
    wave: 0,
    queue: [],
    spawnCd: 0,
    spawnFlip: 0,
    lull: 0,
    waveHit: false,
    toast: "",
    toastT: 0,
    hitstop: 0,
    events: [],
    keys: new Set(),
    keysOverride: null,
    carId: "roadster",
    trackOn: false,
    prevTrackKey: false,
    touchTrack: false,
    devFull: false,
    shop: emptyShop(),
    deployCharges: false,
    banked: false,
    prevPadTrack: false,
    pad: { steer: 0, throttle: 0, fire: false, mine: false, thrust: false, brake: false },
    boostDeck: 0,
    boostCd: 0,
    relit: false,
    floating: false,
    touch: { steer: 0, throttle: 0, fire: false, mine: false, thrust: false, brake: false },
    mouseFire: false,
    mouseMine: false,
    prevMine: false,
    autoGas: false,
    result: null,
    stageId: "",
    steerSens: STEER_SENS_DEFAULT,
    race: freshRace(),
    hinted: -1,
    idleT: 0,
    scrapeCd: 0,
    trauma: 0,
  };
  park(sim);
  return sim;
}

function place(sim: Sim, car: Car, along: number, speed: number) {
  const p = poseAt(sim.track, along);
  car.x = p.x + p.rx * car.lane;
  car.y = p.y;
  car.z = p.z + p.rz * car.lane;
  car.yaw = yawFromDir(p.tx, p.tz);
  car.speed = speed;
  car.lat = 0;
  car.vy = 0;
  car.grounded = !p.gap;
  car.along = p.s;
  car.lastAlong = p.s;
  car.alive = true;
  car.spin = 0;
  car.thrust = 0;
  car.slideT = 0;
  car.offT = 0;
}

function park(sim: Sim) {
  if (sim.track.first > 0 || sim.track.gen.i > 2000) sim.track = buildTrack();
  const hero = sim.cars[0];
  hero.lane = 0;
  place(sim, hero, START_S, 0);
  const st = resolvedStats(sim.carId, sim.trackOn);
  hero.maxHp = st.maxHp + sim.up.armor;
  hero.maxFuel = MAX_FUEL;
  hero.hp = hero.maxHp;
  hero.recover = 0;
  hero.flash = 0;
  hero.fuel = MAX_FUEL;
  hero.rounds = 24;
  hero.mines = st.mineCap;
  hero.invuln = 0;
  for (let i = 1; i < sim.cars.length; i++) {
    const c = sim.cars[i];
    c.alive = false;
    c.y = -40;
    c.racer = false;
    c.raceSpeed = 0;
  }
}

export function begin(sim: Sim) {
  for (const s of sim.shots) s.alive = false;
  for (const m of sim.mines) m.alive = false;
  for (const p of sim.pickups) p.alive = false;
  sim.up = freshUpgrades();
  // Track mode is a player toggle. Never auto-enable, even if T is already held.
  sim.trackOn = false;
  sim.prevTrackKey = (sim.keysOverride ?? sim.keys).has("KeyT");
  sim.touchTrack = false;
  sim.nextCrate = START_S + 280;
  sim.recycled = 0;
  park(sim);
  sim.cars[0].speed = 0;
  sim.banked = false;
  applyPersistedShop(sim);
  if (sim.devFull) grantFullUpgrades(sim);
  sim.phase = "playing";
  sim.time = 0;
  sim.score = 0;
  sim.takedowns = 0;
  sim.falls = 0;
  sim.lives = LIVES;
  sim.wave = 0;
  sim.queue = [];
  sim.spawnCd = 0;
  sim.lull = 2.2;
  sim.waveHit = false;
  sim.hitstop = 0;
  sim.result = null;
  sim.hinted = -1;
  sim.idleT = 0;
  sim.prevMine = false;
  sim.events.length = 0;
  armRace(sim);
  if (sim.race.armed) toast(sim, RACE_FIELD_TOAST, true);
  else toast(sim, "Hunters inbound. Survive.", true);
}

function armRace(sim: Sim) {
  const along = sim.cars[0].along;
  sim.race.warnT = 0;
  sim.race.dnfT = 0;
  sim.race.warning = false;
  sim.race.held = false;
  sim.race.place = 0;
  if (sim.stageId === "highway") {
    sim.race.armed = true;
    sim.race.paceAlong = along;
    sim.race.originAlong = along;
    spawnRivals(sim);
    return;
  }
  sim.race.armed = false;
}

function toast(sim: Sim, text: string, force = false) {
  if (!force && sim.toastT > 1.15) return;
  sim.toast = text;
  sim.toastT = 2.4;
}

/** Max the upgrade fields that exist today. Does not touch CAR_STATS. */
function grantFullUpgrades(sim: Sim) {
  const hero = sim.cars[0];
  const base = resolvedStats(sim.carId, false);
  const u = sim.up;
  u.gun = 3;
  u.armor = 100;
  u.rockets = 12;
  u.reserve = 4;
  u.cluster = true;
  u.oilT = 20;
  u.shieldT = 6;
  u.magnetT = 15;
  hero.maxHp = base.maxHp + u.armor;
  hero.hp = hero.maxHp;
  hero.mines = base.mineCap;
  hero.maxFuel = 160;
  hero.fuel = hero.maxFuel;
  hero.rounds = 24;
  sim.shop.mineArm = 2;
}

/** Copy the persisted shop onto this run. Charge cells arm the existing timers, then one charge is spent if this begin is a real start. */
function applyPersistedShop(sim: Sim) {
  const shop = sim.shop ?? emptyShop();
  sim.shop = shop;
  const hero = sim.cars[0];
  const base = resolvedStats(sim.carId, false);
  const u = sim.up;
  u.armor = clamp(shop.armor, 0, 100);
  u.gun = clamp(shop.gun, 0, 3);
  u.rockets = clamp(shop.rockets, 0, 12);
  u.reserve = clamp(shop.reserve, 0, 4);
  u.cluster = u.reserve > 0;
  hero.maxHp = base.maxHp + u.armor;
  hero.hp = hero.maxHp;
  hero.mines = base.mineCap;
  hero.maxFuel = clamp(shop.maxFuel, MAX_FUEL, 160);
  hero.fuel = hero.maxFuel;
  const useShield = shop.shieldCharges > 0;
  const useMagnet = shop.magnetCharges > 0;
  const useOil = shop.oilCharges > 0;
  if (useShield) u.shieldT = Math.max(u.shieldT, 6);
  if (useMagnet) u.magnetT = Math.max(u.magnetT, 15);
  if (useOil) u.oilT = Math.max(u.oilT, 20);
  if (!sim.deployCharges) return;
  if (useShield) shop.shieldCharges -= 1;
  if (useMagnet) shop.magnetCharges -= 1;
  if (useOil) shop.oilCharges -= 1;
  sim.deployCharges = false;
}

/**
 * DEV cheat. Idempotent. Reapplied by begin() while devFull stays set.
 * Upgrade hooks exist (armor, gun, rockets, mine pack, oil, shield, magnet, nitro),
 * so this does not toast "No upgrades wired yet".
 */
export function applyFullyUpgraded(sim: Sim) {
  sim.devFull = true;
  grantFullUpgrades(sim);
  toast(sim, "Fully upgraded", true);
}

export type Input = { steer: number; throttle: number; fire: boolean; mine: boolean; thrust: boolean };

export function readInput(sim: Sim): Input {
  const keys = sim.keysOverride ?? sim.keys;
  let steer = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) steer += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) steer -= 1;
  let throttle = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) throttle += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) throttle -= 1;
  if (!sim.keysOverride) {
    // Touch wins while the stick is off-center so a pad cannot clobber it.
    const touchDrive = Math.abs(sim.touch.steer) > 0.02 || Math.abs(sim.touch.throttle) > 0.08;
    if (touchDrive) {
      steer += sim.touch.steer;
      if (Math.abs(sim.touch.throttle) > 0.08) throttle = sim.touch.throttle;
    } else {
      steer += sim.pad.steer;
      if (Math.abs(sim.pad.throttle) > 0.08) throttle = sim.pad.throttle;
    }
    if (sim.touch.brake || sim.pad.brake) throttle = -1;
    if (sim.autoGas && throttle > -0.25 && !keys.has("KeyS") && !keys.has("ArrowDown")) {
      throttle = Math.max(throttle, 1);
    }
  }
  const fire =
    keys.has("KeyF") || keys.has("KeyJ") || (!sim.keysOverride && (sim.touch.fire || sim.mouseFire || sim.pad.fire));
  const mine = keys.has("KeyG") || keys.has("KeyQ") || (!sim.keysOverride && (sim.touch.mine || sim.mouseMine || sim.pad.mine));
  const thrust = hasBoost(sim.carId) && (
    keys.has("Space") ||
    keys.has("ShiftLeft") ||
    keys.has("ShiftRight") ||
    (!sim.keysOverride && (!!sim.touch.thrust || sim.pad.thrust)));
  return {
    steer: clamp(steer, -1, 1),
    throttle: clamp(throttle, -1, 1),
    fire,
    mine,
    thrust,
  };
}

export type GamepadSample = {
  axes: ArrayLike<number>;
  buttons: ArrayLike<{ pressed: boolean; value: number }>;
};

const PAD_DEAD = 0.18;

function clearPad(sim: Sim) {
  const p = sim.pad;
  p.steer = 0;
  p.throttle = 0;
  p.fire = false;
  p.mine = false;
  p.thrust = false;
  p.brake = false;
}

/**
 * Standard HTML5 mapping. Xbox first; DualSense and DualShock use the same indices.
 *   axes[0] left stick X → steer (stick right is +, negated so it matches A = +steer)
 *   axes[1] left stick Y → throttle (stick up is −, negated)
 *   buttons[0] A / Cross → fire
 *   buttons[1] B / Circle → mine
 *   buttons[2] X / Square → boost if roadster, else Brake
 *   buttons[3] Y / Triangle → Track edge (Model S only; pollTrack ignores the rest)
 *   buttons[4] LB / L1 → mine
 *   buttons[5] RB / R1 → mine
 *   buttons[7] RT / R2 → boost if roadster, else Brake
 *   buttons[8] View / Share → Track edge
 * Deadzone 0.18. No new verbs. Right stick is unused (aim stays the car's facing).
 * Ignored while keysOverride is set.
 * Pause, title Start, and shop focus are stepPadUi (padui.ts), sampled on this
 * same pad. They do not add thrust, and boost stays Roadster-only here.
 */
export function applyGamepad(sim: Sim, sample: GamepadSample | null) {
  if (!sample || sim.keysOverride) {
    clearPad(sim);
    if (!sample) sim.prevPadTrack = false;
    return;
  }
  const axis = (i: number) => {
    const v = sample.axes[i] ?? 0;
    if (!Number.isFinite(v)) return 0;
    const a = Math.abs(v);
    if (a < PAD_DEAD) return 0;
    return Math.sign(v) * Math.min(1, (a - PAD_DEAD) / (1 - PAD_DEAD));
  };
  const down = (i: number) => {
    const b = sample.buttons[i];
    return !!b && (b.pressed || b.value > 0.5);
  };
  const boost = hasBoost(sim.carId);
  const thrustOrBrake = down(2) || down(7);
  const trackDown = down(3) || down(8);
  const p = sim.pad;
  p.steer = -axis(0);
  p.throttle = -axis(1);
  p.fire = down(0);
  p.mine = down(1) || down(4) || down(5);
  p.thrust = boost && thrustOrBrake;
  p.brake = !boost && thrustOrBrake;
  if (trackDown && !sim.prevPadTrack) sim.touchTrack = true;
  sim.prevPadTrack = trackDown;
}


function fxDir(yaw: number) {
  return { fx: -Math.sin(yaw), fz: -Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) };
}


function safeSpawnS(sim: Sim, s: number) {
  // Respawn on solid ground: back up out of (and before) any gap.
  let back = 0;
  while (back < 120 && (gapAhead(sim.track, s - back, 30) || poseAt(sim.track, s - back).gap)) back += 5;
  return Math.max(sim.track.first * 2 + 2, s - back);
}

function scrollFloor(car: Car) {
  if (car.alive && car.speed < SCROLL_MIN) car.speed = SCROLL_MIN;
}

/** Tire-blow, then back to lane center a short way behind. One fail does not end the race. */
function offroadReset(sim: Sim, car: Car) {
  const hp = car.hp;
  const speed = Math.max(SCROLL_MIN, car.speed);
  const back = Math.min(15, OFFROAD_BACK);
  let s = Math.max(sim.track.first * 2 + 2, car.along - back);
  if (poseAt(sim.track, s).gap || gapAhead(sim.track, s, 20)) s = safeSpawnS(sim, car.along - back);
  car.lane = 0;
  place(sim, car, s, speed);
  car.hp = hp;
  car.invuln = OFFROAD_INVULN;
  car.spin = 0.4;
  car.flash = 0.45;
  car.offT = 0;
  car.slideT = 0;
  sim.events.push({ t: "hit", x: car.x, y: car.y + 0.5, z: car.z, big: true });
  sim.events.push({ t: "scrape" });
  toast(sim, "Back on track", true);
}

function respawn(sim: Sim, car: Car, reason: "fall" | "wreck") {
  if (!car.hero) {
    killAI(sim, car, true);
    return;
  }
  if (reason === "fall") {
    sim.falls += 1;
    sim.events.push({ t: "fall" });
    toast(sim, "The void takes you  −40 hull", true);
    sim.trauma = Math.min(1, sim.trauma + 0.55);
    car.invuln = 0;
    car.hp -= 40;
    sim.waveHit = true;
    if (car.hp <= 0) {
      loseLife(sim);
      return;
    }
  }
  const hp = car.hp;
  car.lane = 0;
  place(sim, car, safeSpawnS(sim, car.along), 22);
  car.hp = hp;
  car.recover = reason === "fall" ? 0.85 : 0.65;
  car.flash = 0.4;
  car.invuln = 1.5;
}

function loseLife(sim: Sim) {
  const hero = sim.cars[0];
  sim.lives -= 1;
  sim.events.push({ t: "boom", x: hero.x, y: Math.max(0.6, hero.y), z: hero.z });
  sim.events.push({ t: "life" });
  sim.hitstop = 0.09;
  sim.trauma = 1;
  for (const s of sim.shots) if (s.owner !== 0) s.alive = false;
  if (sim.lives <= 0) {
    hero.hp = 0;
    gameOver(sim);
    return;
  }
  hero.lane = 0;
  place(sim, hero, safeSpawnS(sim, hero.along), 22);
  const lost = dropTier(sim);
  hero.hp = hero.maxHp;
  hero.recover = 0.65;
  hero.flash = 0.4;
  hero.invuln = 1.5;
  toast(sim, `${sim.lives === 1 ? "Wrecked — last life" : `Wrecked — ${sim.lives} lives left`}${lost ? "  · −1 tier" : ""}`, true);
}

/** Losing a life costs one upgrade tier: a gun tier, an armor plate and a nitro cell; timed boosts and ammo packs are lost. */
export function dropTier(sim: Sim) {
  const u = sim.up;
  const hero = sim.cars[0];
  const had = u.gun > 0 || u.armor > 0 || hero.maxFuel > MAX_FUEL || u.rockets > 0 || u.reserve > 0 || u.cluster;
  u.gun = Math.max(0, u.gun - 1);
  u.armor = Math.max(0, u.armor - 25);
  hero.maxHp = resolvedStats(sim.carId, false).maxHp + u.armor;
  hero.maxFuel = Math.max(MAX_FUEL, hero.maxFuel - 20);
  hero.fuel = Math.min(hero.fuel, hero.maxFuel);
  u.rockets = 0;
  u.reserve = 0;
  u.cluster = false;
  u.oilT = 0;
  u.shieldT = 0;
  u.magnetT = 0;
  return had;
}

function damageHero(sim: Sim, dmg: number) {
  const hero = sim.cars[0];
  if (hero.invuln > 0 || sim.up.shieldT > 0 || sim.phase !== "playing") return false;
  hero.hp -= dmg;
  hero.flash = 0.18;
  sim.waveHit = true;
  sim.trauma = Math.min(1, sim.trauma + 0.22);
  if (hero.hp <= 0) loseLife(sim);
  return true;
}

/** Continuous chip damage (spikes): no shake spam. */
function chipHero(sim: Sim, dmg: number) {
  const hero = sim.cars[0];
  if (hero.invuln > 0 || sim.up.shieldT > 0 || sim.phase !== "playing") return;
  hero.hp -= dmg;
  hero.flash = 0.12;
  sim.waveHit = true;
  sim.trauma = Math.min(0.5, sim.trauma + dmg * 0.02);
  if (hero.hp <= 0) loseLife(sim);
}

function killAI(sim: Sim, car: Car, fell = false) {
  const bx = car.x;
  const by = car.y;
  const bz = car.z;
  car.alive = false;
  car.speed = 0;
  car.y = -40;
  const tier = car.kind === "hero" ? 1 : ENEMY[car.kind].tier;
  const pts = fell ? 50 * tier : 100 * tier;
  sim.takedowns += 1;
  sim.score += pts;
  sim.events.push({ t: "boom", x: bx, y: Math.max(0.6, by), z: bz });
  sim.events.push({ t: "down" });
  const name = car.kind === "hero" ? "" : ENEMY[car.kind].name;
  toast(sim, fell ? `Lost to the void  +${pts}` : `${name} down  +${pts}`, true);
  sim.hitstop = car.kind === "boss" ? 0.25 : 0.07;
  sim.trauma = Math.min(1, sim.trauma + (car.kind === "boss" ? 1 : 0.45));
  if (!fell && car.kind === "boss") {
    for (const [k, off] of [["gun", -3], ["armor", 0], ["rockets", 3]] as [PickupKind, number][]) {
      const { rx, rz } = fxDir(car.yaw);
      dropAt(sim, bx + rx * off, by, bz + rz * off, car.along, k);
    }
  } else if (!fell && Math.random() < 0.25) dropAt(sim, bx, by, bz, car.along, null);
}

function fireShot(sim: Sim, car: Car) {
  const slot = sim.shots.find((s) => !s.alive);
  if (!slot || car.fireCd > 0) return;
  if (car.hero && car.rounds < 1) return;
  const spread = (Math.random() - 0.5) * 0.035;
  const aim = car.yaw + spread;
  const { fx: dirx, fz: dirz } = fxDir(aim);
  const muzzle = 2.35;
  const y = car.y + 0.72;
  slot.alive = true;
  slot.owner = car.id;
  slot.x = car.x + dirx * muzzle;
  slot.y = y;
  slot.z = car.z + dirz * muzzle;
  slot.px = slot.x;
  slot.py = slot.y;
  slot.pz = slot.z;
  const spd = 96 + Math.max(0, car.speed);
  slot.vx = dirx * spd;
  slot.vy = 0;
  slot.vz = dirz * spd;
  slot.life = 0.72;
  car.fireCd = car.hero ? 0.13 : 1.35;
  if (car.hero) {
    car.rounds -= 1;
    sim.events.push({ t: "shot" });
  }
}


function enemyShot(sim: Sim, car: Car, fan = 0) {
  const slot = sim.shots.find((s) => !s.alive);
  if (!slot) return;
  const hero = sim.cars[0];
  const hf = fxDir(hero.yaw);
  const lead = 0.25;
  const dx = hero.x + hf.fx * hero.speed * lead - car.x;
  const dz = hero.z + hf.fz * hero.speed * lead - car.z;
  const aim = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.12 + fan;
  const { fx: dirx, fz: dirz } = fxDir(aim);
  const cf = fxDir(car.yaw);
  slot.alive = true;
  slot.owner = car.id;
  slot.x = car.x + dirx * 1.6;
  slot.y = car.y + (car.kind === "boss" ? 2.2 : car.kind === "drone" ? -0.2 : 1.05);
  slot.z = car.z + dirz * 1.6;
  slot.px = slot.x;
  slot.py = slot.y;
  slot.pz = slot.z;
  slot.vx = dirx * 78 + cf.fx * car.speed;
  slot.vy = (hero.y + 0.7 - slot.y) / Math.max(0.15, Math.hypot(dx, dz) / 78);
  slot.vz = dirz * 78 + cf.fz * car.speed;
  slot.life = 0.9;
  slot.dmg = 6;
  slot.rocket = false;
  slot.target = -1;
  sim.events.push({ t: "eshot" });
}

function dropMine(sim: Sim, car: Car) {
  if (car.mines < 1 || car.mineCd > 0) return;
  const slot = sim.mines.find((m) => !m.alive);
  if (!slot) return;
  const { fx, fz } = fxDir(car.yaw);
  const x = car.x - fx * MINE_DROP_BACK;
  const z = car.z - fz * MINE_DROP_BACK;
  const q = queryTrack(sim.track, x, z, car.along);
  slot.alive = true;
  slot.x = x;
  slot.z = z;
  slot.y = q.gap ? car.y : q.y + 0.15;
  slot.life = 9;
  slot.arm = heroMineArm(sim.shop?.mineArm);
  slot.fresh = true;
  car.mines -= 1;
  car.mineCd = 0.45;
  sim.events.push({ t: "mine" });
}


function drive(sim: Sim, car: Car, input: Input, dt: number, infiniteFuel: boolean) {
  if (car.recover > 0) {
    car.recover -= dt;
    input = { steer: 0, throttle: 0, fire: false, mine: false, thrust: false };
  }
  if (car.spin > 0) {
    car.spin -= dt;
    car.yaw += dt * 3.1;
    input = { ...input, steer: 0, throttle: Math.min(input.throttle, 0), thrust: false };
  }

  const boost = car.hero && hasBoost(sim.carId) ? { hopMax: BOOST_HOP_MAX, accel: BOOST_ACCEL } : undefined;
  const st = car.hero ? resolvedStats(sim.carId, sim.trackOn) : null;
  if (car.hero) sim.boostCd = Math.max(0, sim.boostCd - dt);
  // ground take-off needs the post-landing cooldown; one air re-light per jump
  let wantThrust = !!boost && input.thrust && (infiniteFuel || car.fuel > 0.5);
  if (wantThrust && car.grounded && sim.boostCd > 0) wantThrust = false;
  if (wantThrust && !car.grounded && !car.thrust && sim.relit) wantThrust = false;
  if (wantThrust && !car.grounded && !car.thrust) sim.relit = true;
  car.thrust = wantThrust ? 1 : 0;
  if (wantThrust && !infiniteFuel) car.fuel = Math.max(0, car.fuel - 36 * dt);
  else if (!infiniteFuel) car.fuel = Math.min(car.maxFuel, car.fuel + 18 * dt);

  if (input.throttle > 0) {
    if (car.speed < 0) car.speed = Math.min(0, car.speed + 40 * dt);
    else car.speed += (st ? st.accel : 24) * input.throttle * dt;
  } else if (input.throttle < 0) {
    if (car.speed > 2) car.speed = Math.max(0, car.speed - 42 * dt);
    else car.speed -= 16 * dt;
  }
  const drag = input.throttle === 0 ? 1.15 : 0.28;
  car.speed -= car.speed * drag * dt;
  if (wantThrust) car.speed += BOOST_SPEED_BONUS * dt;
  // Enemies stay on the v0.1 48 cap. Hero uses the car row. In-boost cap stays BOOST_SPEED_CAP (58).
  const cap = wantThrust ? BOOST_SPEED_CAP : (st ? st.topSpeed : 48);
  car.speed = clamp(car.speed, -14, cap);
  // Brake and reverse stay in the input, but along-speed cannot dead-stop.
  scrollFloor(car);

  if (wantThrust && car.grounded) {
    car.grounded = false;
    sim.boostDeck = car.y;
    sim.relit = false;
    car.vy = Math.max(car.vy, BOOST_TAKEOFF_VY);
  } else if (wantThrust && !car.grounded) {
    car.vy += boost!.accel * dt;
  }
  if (boost && !car.grounded) sim.floating = !wantThrust;

  if (!car.grounded) {
    if (boost) {
      car.vy -= GRAVITY * (wantThrust ? 1 : FLOAT_GRAVITY_SCALE) * dt;
      car.vy = Math.max(FLOAT_VY_MIN, Math.min(28, car.vy));
      // never above HOP_MAX over the deck under the car (or the take-off deck, whichever is higher)
      const deck = Math.max(sim.boostDeck, queryTrack(sim.track, car.x, car.z, car.along).y);
      const top = deck + boost.hopMax;
      car.y += car.vy * dt;
      if (car.y >= top) { car.y = top; if (car.vy > 0) car.vy = 0; }
    } else {
      car.vy -= GRAVITY * dt;
      car.vy = Math.max(-40, Math.min(28, car.vy));
      car.y += car.vy * dt;
    }
  }

  const sp = Math.abs(car.speed);
  const speedFactor = clamp(sp / 10, 0.18, 1);
  const reverse = car.speed >= -0.4 ? 1 : -1;
  const air = car.grounded ? 1 : 0.7;
  // A → steer +1 → +yaw → nose left under the chase cam.
  // steerSens scales keyboard, touch, and pad equally (they share input.steer).
  const sens = car.hero ? clampSteerSens(sim.steerSens) : 1;
  car.yaw += input.steer * 2.4 * (st ? st.handling : 1) * sens * speedFactor * reverse * air * dt;

  const grip = car.grounded ? 8 : 1.3;
  car.lat *= Math.exp(-grip * dt);
  if (car.grounded) car.lat += -input.steer * sp * 0.5 * dt;
  car.lat = clamp(car.lat, -14, 14);

  const { fx, fz, rx, rz } = fxDir(car.yaw);
  car.x += (fx * car.speed + rx * car.lat) * dt;
  car.z += (fz * car.speed + rz * car.lat) * dt;

  let q = queryTrack(sim.track, car.x, car.z, car.along);
  const inset = car.hero || car.kind === "hero" ? 1.15 : ENEMY[car.kind].clamp;
  const edge = q.width * 0.5 - inset;
  const latAbs = Math.abs(q.lateral);
  if (latAbs > edge) {
    const sign = Math.sign(q.lateral) || 1;
    const depth = latAbs - edge;
    const heroWall = car.hero && car.grounded;
    if (!heroWall) {
      // Hunters stay on the asphalt. No along-speed friction — that was the mine-shaft stop.
      car.x -= q.rx * sign * depth;
      car.z -= q.rz * sign * depth;
      q = queryTrack(sim.track, car.x, car.z, car.along);
    } else {
      // Outward stick means a committed leave. A glance is pushed back toward center.
      const steerOut = -input.steer * sign > 0.55;
      const committed = steerOut && depth > 0.45;
      if (!committed) {
        const push = Math.min(depth, 18 * dt);
        car.x -= q.rx * sign * push;
        car.z -= q.rz * sign * push;
        car.lat = -sign * Math.max(4, Math.abs(car.lat));
        car.slideT = Math.max(car.slideT, WALL_SLIDE);
        if (sim.scrapeCd <= 0 && depth > 0.08) {
          sim.scrapeCd = 0.18;
          sim.events.push({ t: "scrape" });
          sim.trauma = Math.min(1, sim.trauma + 0.08);
        }
        q = queryTrack(sim.track, car.x, car.z, car.along);
        const want = Math.max(SCROLL_MIN, car.speed) * dt;
        const gained = q.s - car.along;
        if (gained < want * 0.85) {
          const p = poseAt(sim.track, car.along + want);
          const latIn = clamp(q.lateral, -(edge - 0.15), edge - 0.15);
          car.x = p.x + p.rx * latIn;
          car.z = p.z + p.rz * latIn;
          if (!p.gap) car.y = p.y;
          q = queryTrack(sim.track, car.x, car.z, p.s);
        }
      } else {
        car.lat += -sign * 3 * dt;
        car.slideT = Math.max(car.slideT, 0.15);
      }
      scrollFloor(car);
    }
  }
  if (car.slideT > 0) {
    car.slideT = Math.max(0, car.slideT - dt);
    const err = wrapAngle(yawFromDir(q.tx, q.tz) - car.yaw);
    car.yaw += clamp(err, -3.2 * dt, 3.2 * dt);
    if (car.hero && Math.abs(q.lateral) > edge * 0.65) {
      const s = Math.sign(q.lateral) || 1;
      car.lat += -s * 11 * dt;
      car.lat = clamp(car.lat, -14, 14);
    }
  }
  if (car.hero && car.alive && car.invuln <= 0) {
    const past = Math.abs(q.lateral) - q.width * 0.5;
    car.offT = past > OFFROAD_M ? car.offT + dt : 0;
    if (car.offT >= OFFROAD_T) {
      offroadReset(sim, car);
      return;
    }
  } else if (car.hero) car.offT = 0;

  if (q.gap) {
    car.grounded = false;
    if (car.y < q.y - 6.2) {
      respawn(sim, car, "fall");
      return;
    }
  } else if (car.y <= q.y + 0.12 || car.grounded) {
    if (car.grounded && q.kicker && car.speed > 15 && !wantThrust) {
      car.grounded = false;
      car.vy = Math.max(8, car.speed * 0.45) * (boost ? RAMP_ASSIST : 1);
      car.y = q.y + 0.15;
      if (boost) { sim.boostDeck = q.y; sim.relit = false; }
    } else if (wantThrust && car.vy > 0) {
      car.grounded = false;
      if (car.y < q.y) car.y = q.y;
    } else {
      const hard = !boost && !car.grounded && car.vy < -10; // boosters always land soft
      const wasAir = !car.grounded;
      if (wasAir && boost) { sim.boostCd = BOOST_COOLDOWN; sim.floating = false; }
      car.y = q.y;
      car.vy = 0;
      car.grounded = true;
      if (wasAir && (hard || sp > 12)) {
        sim.events.push({ t: "land", x: car.x, y: car.y, z: car.z, hard });
        if (hard && car.hero) sim.trauma = Math.min(1, sim.trauma + 0.35);
      }
    }
  } else {
    car.grounded = false;
  }

  car.lastAlong = car.along = q.s;

  if (car.hero && car.alive) {
    const p = nextPiece(sim.track, car.along);
    if (p && sim.hinted !== p.s && car.along > p.signS && car.along < p.s) {
      sim.hinted = p.s;
      toast(sim, boost ? "Ramp — boost if you want more air" : "Ramp ahead", true);
    }
  }

  car.fireCd = Math.max(0, car.fireCd - dt);
  car.mineCd = Math.max(0, car.mineCd - dt);
  car.flash = Math.max(0, car.flash - dt);
  if (car.hero && !input.fire) car.rounds = Math.min(24, car.rounds + 7 * dt);
  if (car.hero) car.mines = Math.min(resolvedStats(sim.carId, false).mineCap, car.mines + dt / 3.1);

  if (input.fire && car.alive && car.recover <= 0) fireShot(sim, car);
  if (car.hero && input.mine && !sim.prevMine && car.recover <= 0) dropMine(sim, car);
}


function gameOver(sim: Sim) {
  sim.phase = "finished";
  sim.result = {
    time: sim.time,
    score: Math.round(sim.score),
    wave: sim.wave,
    takedowns: sim.takedowns,
    falls: sim.falls,
  };
  if (sim.race.armed && !sim.race.held) {
    const pay = racePayout("dnf", sim.lives);
    sim.race.place = 0;
    sim.result.reason = "DNF";
    sim.result.place = 0;
    sim.result.purse = pay.purse;
    sim.result.livesBonus = 0;
    toast(sim, "DNF", true);
  } else {
    toast(sim, "Wrecked for good", true);
  }
  sim.events.push({ t: "over" });
}

function finishRace(sim: Sim, headline: string, place: number) {
  sim.phase = "finished";
  const key: RacePurse = place >= 1 && place <= 4 ? (place as 1 | 2 | 3 | 4) : "dnf";
  const pay = racePayout(key, sim.lives);
  sim.race.place = place;
  sim.result = {
    time: sim.time,
    score: Math.round(sim.score),
    wave: sim.wave,
    takedowns: sim.takedowns,
    falls: sim.falls,
    reason: headline,
    place,
    purse: pay.purse,
    livesBonus: pay.livesBonus,
  };
  sim.events.push({ t: "over" });
  toast(sim, headline, true);
}

/** Last living rival, or the pace ghost when the field is gone. */
function fieldReference(sim: Sim) {
  let last: number | null = null;
  for (let i = 1; i < sim.cars.length; i++) {
    const car = sim.cars[i];
    if (!car.alive || !car.racer) continue;
    if (last == null || car.along < last) last = car.along;
  }
  return last == null ? sim.race.paceAlong : last;
}

export type RaceStanding = {
  place: number;
  /** Metres the hero is behind the furthest living rival. 0 when the hero leads or the field is empty. */
  leaderGap: number;
  /** Metres to the next car: the one ahead, or the one behind when the hero leads. */
  nextGap: number;
  /** hero.along − last living rival. Negative when the hero is behind the field. */
  behindField: number;
};

/** Live place from the hero plus living rivals. Dead rivals do not occupy a place. */
export function raceStandings(sim: Sim): RaceStanding {
  const hero = sim.cars[0];
  const alongs: number[] = [];
  for (let i = 1; i < sim.cars.length; i++) {
    const car = sim.cars[i];
    if (car.alive && car.racer) alongs.push(car.along);
  }
  let ahead = 0;
  let leader = hero.along;
  let nextAhead = Infinity;
  let bestBehind = -Infinity;
  for (const along of alongs) {
    if (along > leader) leader = along;
    if (along > hero.along) {
      ahead += 1;
      const gap = along - hero.along;
      if (gap < nextAhead) nextAhead = gap;
    } else if (along > bestBehind) bestBehind = along;
  }
  const place = ahead + 1;
  const leaderGap = Math.max(0, leader - hero.along);
  const nextGap = place <= 1 ? (bestBehind === -Infinity ? 0 : hero.along - bestBehind) : nextAhead === Infinity ? leaderGap : nextAhead;
  const last = alongs.length ? Math.min(...alongs) : hero.along;
  return { place, leaderGap, nextGap, behindField: hero.along - last };
}

/**
 * Highway race rail. Rivals are the punish: falling 140 m behind the last living
 * rival for 3 s is a DNF. The 30 m/s pace ghost is only the backup when none remain.
 */
function stepRace(sim: Sim, dt: number) {
  const race = sim.race;
  if (!race.armed || sim.phase !== "playing") return;
  race.paceAlong += PACE_SPEED * dt;
  const hero = sim.cars[0];
  const gap = hero.along - fieldReference(sim);
  if (gap < -GAP_WARN) race.warnT += dt;
  else race.warnT = 0;
  if (gap < -GAP_DNF) race.dnfT += dt;
  else race.dnfT = 0;
  const warn = race.warnT >= GAP_WARN_HOLD;
  if (warn && !race.warning) toast(sim, "Falling behind", true);
  race.warning = warn;
  if (race.dnfT >= GAP_DNF_HOLD) {
    finishRace(sim, FIELD_DNF, 0);
    return;
  }
  if (!race.held && hero.along - race.originAlong >= RACE_DIST) {
    race.held = true;
    const place = Math.min(4, raceStandings(sim).place);
    finishRace(sim, PLACE_NAME[place] || "4th", place);
  }
}

// ---------------------------------------------------------------- waves

type EnemyKind = Exclude<Kind, "hero">;

export function waveRoster(n: number): EnemyKind[] {
  if (n % 5 === 0) {
    const r: EnemyKind[] = ["boss", "rammer", "rammer"];
    if (n >= 10) r.push("drone", "gunner");
    return r;
  }
  const specials: EnemyKind[] = [];
  const count0 = 2 + n;
  const gunners = Math.max(1, Math.floor(count0 / 3));
  const layers = n >= 2 ? 1 + Math.floor((n - 2) / 4) : 0;
  const spikers = n >= 3 ? 1 + Math.floor((n - 3) / 4) : 0;
  const drones = n >= 6 ? 1 + Math.floor((n - 6) / 3) : 0;
  for (let i = 0; i < gunners; i++) specials.push("gunner");
  for (let i = 0; i < layers; i++) specials.push("mine");
  for (let i = 0; i < spikers; i++) specials.push("spiker");
  for (let i = 0; i < drones; i++) specials.push("drone");
  const count = Math.max(count0, specials.length + 1);
  const out: EnemyKind[] = [];
  let si = 0;
  for (let i = 0; i < count; i++) {
    const rammersLeft = count - specials.length - out.filter((k) => k === "rammer").length;
    const wantSpecial = si < specials.length && (i % 2 === 1 || rammersLeft <= 0);
    out.push(wantSpecial ? specials[si++] : "rammer");
  }
  while (si < specials.length) out.push(specials[si++]);
  return out;
}

function startWave(sim: Sim, n: number) {
  sim.wave = n;
  sim.queue = waveRoster(n);
  sim.spawnCd = 0.3;
  sim.waveHit = false;
  if (n % 5 === 0) {
    toast(sim, `Wave ${n} — Armored Hauler`, true);
    sim.events.push({ t: "boss" });
  } else toast(sim, `Wave ${n}`, true);
}

function aliveEnemies(sim: Sim) {
  let n = 0;
  for (let i = 1; i < sim.cars.length; i++) if (sim.cars[i].alive) n += 1;
  return n;
}

function spawnPointOk(sim: Sim, s: number) {
  const p = poseAt(sim.track, s);
  return !p.gap && !gapAhead(sim.track, s - 30, 60);
}

function spawnEnemy(sim: Sim, kind: EnemyKind, at?: number, lane?: number) {
  const car = sim.cars.find((c, i) => i > 0 && !c.alive);
  if (!car) return null;
  const hero = sim.cars[0];
  sim.spawnFlip += 1;
  let s = -1;
  if (at != null) s = hero.along + at;
  else {
    const ahead = kind === "boss" || kind === "mine";
    const base = ahead && hero.speed > 15 ? [95, -58] : sim.spawnFlip % 2 === 0 || hero.speed < 15 ? [-58, 95] : [95, -58];
    const order = [...base, -85, -115, 130, 170];
    for (const off of order) {
      if (hero.along + off >= sim.track.first * 2 + 4 && spawnPointOk(sim, hero.along + off)) {
        s = hero.along + off;
        break;
      }
    }
  }
  if (s < sim.track.first * 2 + 4) return null;
  const st = ENEMY[kind];
  car.kind = kind;
  car.lane = lane ?? (kind === "boss" ? 0 : LANES[Math.floor(Math.random() * LANES.length)]);
  place(sim, car, s, s > hero.along ? Math.max(18, hero.speed * 0.6) : Math.max(30, hero.speed + 6));
  car.hp = car.maxHp = st.hp + (kind === "boss" ? 150 * (Math.max(1, Math.floor(sim.wave / 5)) - 1) : 0);
  car.recover = 0.2;
  car.flash = 0.3;
  car.fireCd = 1.0;
  car.burst = 0;
  car.ramCd = 0.6;
  car.dropCd = 1.5;
  car.spikeT = 0;
  car.weaveT = kind === "spiker" ? 0 : 3;
  car.baseSpeed = hero.speed;
  car.leaving = false;
  car.racer = false;
  car.raceSpeed = 0;
  car.hold = kind === "gunner" ? (s > hero.along ? 24 : -12) : kind === "drone" ? 18 : kind === "boss" ? 28 : kind === "mine" ? 30 : s > hero.along ? 1 : -1;
  car.holdT = 6 + Math.random() * 4;
  if (kind === "drone") {
    car.y += DRONE_ALT;
    car.grounded = false;
  }
  return car;
}

function stepWaves(sim: Sim, dt: number) {
  // Highway RaceTrial: no endless hunter farm. Rivals spawned at begin() are the field.
  if (sim.race.armed) return;
  if (sim.lull > 0) {
    sim.lull -= dt;
    if (sim.lull <= 0) startWave(sim, sim.wave + 1);
    return;
  }
  if (sim.queue.length > 0) {
    sim.spawnCd -= dt;
    if (sim.spawnCd <= 0 && aliveEnemies(sim) < MAX_ALIVE) {
      if (spawnEnemy(sim, sim.queue[0])) {
        sim.queue.shift();
        sim.spawnCd = 1.15;
      } else sim.spawnCd = 0.4;
    }
    return;
  }
  if (aliveEnemies(sim) === 0) {
    const bonus = Math.round(500 * sim.wave * (sim.waveHit ? 1 : 1.5));
    sim.score += bonus;
    sim.events.push({ t: "wave" });
    toast(sim, sim.waveHit ? `Wave ${sim.wave} cleared  +${bonus}` : `Clean wave ${sim.wave}  +${bonus}`, true);
    const hero = sim.cars[0];
    spawnPickup(sim, null, hero.along + 70, LANES[Math.floor(Math.random() * 4)], false);
    sim.lull = 3;
  }
}

// ---------------------------------------------------------------- pickups

export const PICKUP_LABEL: Record<PickupKind, string> = {
  repair: "Repair +35",
  armor: "Armor plate +25",
  gun: "Gun upgrade",
  rockets: "Homing rockets ×6",
  minepack: "Mine pack",
  oil: "Oil slick",
  nitro: "Nitro cell",
  shield: "Shield",
  magnet: "Magnet",
};

const PICKUP_WEIGHT: [PickupKind, number][] = [
  ["repair", 22],
  ["armor", 12],
  ["gun", 14],
  ["rockets", 12],
  ["minepack", 8],
  ["oil", 8],
  ["nitro", 10],
  ["shield", 8],
  ["magnet", 6],
];

function rollPickup(sim: Sim): PickupKind {
  const pool = PICKUP_WEIGHT.filter(([k]) => !(k === "gun" && sim.up.gun >= 3) && !(k === "armor" && sim.up.armor >= 100));
  let total = 0;
  for (const [, w] of pool) total += w;
  let r = Math.random() * total;
  for (const [k, w] of pool) {
    r -= w;
    if (r <= 0) return k;
  }
  return "repair";
}

export function spawnPickup(sim: Sim, kind: PickupKind | null, along: number, lat: number, crate: boolean) {
  const slot = sim.pickups.find((p) => !p.alive);
  if (!slot) return null;
  const p = poseAt(sim.track, along);
  if (p.gap) return null;
  slot.alive = true;
  slot.kind = kind ?? rollPickup(sim);
  slot.crate = crate;
  slot.x = p.x + p.rx * lat;
  slot.z = p.z + p.rz * lat;
  slot.y = p.y + (crate ? 0.55 : 0.9);
  slot.along = p.s;
  slot.life = crate ? 60 : 22;
  return slot;
}

function dropAt(sim: Sim, x: number, y: number, z: number, along: number, kind: PickupKind | null) {
  const slot = sim.pickups.find((p) => !p.alive);
  if (!slot) return;
  const q = queryTrack(sim.track, x, z, along);
  if (q.gap) return;
  slot.alive = true;
  slot.kind = kind ?? rollPickup(sim);
  slot.crate = false;
  slot.x = x;
  slot.z = z;
  slot.y = Math.max(q.y + 0.9, Math.min(y, q.y + 0.9));
  slot.along = q.s;
  slot.life = 22;
}

export function applyPickup(sim: Sim, kind: PickupKind) {
  const hero = sim.cars[0];
  const u = sim.up;
  if (kind === "repair") hero.hp = Math.min(hero.maxHp, hero.hp + 35);
  else if (kind === "armor") {
    if (u.armor < 100) {
      u.armor += 25;
      hero.maxHp = resolvedStats(sim.carId, false).maxHp + u.armor;
      hero.hp += 25;
    } else hero.hp = Math.min(hero.maxHp, hero.hp + 25);
  } else if (kind === "gun") {
    if (u.gun < 3) u.gun += 1;
    else sim.score += 200;
  } else if (kind === "rockets") u.rockets = Math.min(12, u.rockets + 6);
  else if (kind === "minepack") {
    u.reserve = 4;
    u.cluster = true;
    hero.mines = resolvedStats(sim.carId, false).mineCap;
  } else if (kind === "oil") u.oilT = 20;
  else if (kind === "nitro") {
    hero.maxFuel = Math.min(160, hero.maxFuel + 20);
    hero.fuel = hero.maxFuel;
  } else if (kind === "shield") u.shieldT = 6;
  else if (kind === "magnet") u.magnetT = 15;
  sim.score += 25;
  sim.events.push({ t: "pickup", kind });
  const label = kind === "gun" ? GUN_NAMES[u.gun] : PICKUP_LABEL[kind];
  toast(sim, label, true);
}

export const GUN_NAMES = ["Machine gun", "Twin MG", "Heavy MG", "Spread gun"];

function openCrate(sim: Sim, p: Pickup) {
  p.crate = false;
  p.y += 0.35;
  p.life = 22;
  sim.events.push({ t: "hit", x: p.x, y: p.y, z: p.z, big: true });
  sim.score += 20;
}

function stepPickups(sim: Sim, dt: number) {
  const hero = sim.cars[0];
  if (hero.along + 160 > sim.nextCrate) {
    const s = sim.nextCrate;
    sim.nextCrate += 380 + Math.random() * 260;
    if (spawnPointOk(sim, s)) spawnPickup(sim, null, s, LANES[Math.floor(Math.random() * 4)], true);
  }
  for (const p of sim.pickups) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0 || p.along < hero.along - 40) {
      p.alive = false;
      continue;
    }
    const dx = hero.x - p.x;
    const dy = hero.y + 0.6 - p.y;
    const dz = hero.z - p.z;
    const d = Math.hypot(dx, dz);
    if (!p.crate && sim.up.magnetT > 0 && d < 35 && d > 0.01) {
      const pull = Math.min(d, 34 * dt);
      p.x += (dx / d) * pull;
      p.z += (dz / d) * pull;
      p.y += dy * Math.min(1, 4 * dt);
      p.along = queryTrack(sim.track, p.x, p.z, p.along).s;
    }
    if (!hero.alive || Math.abs(dy) > 2.6) continue;
    if (p.crate && d < 2.6) {
      openCrate(sim, p);
      damageHero(sim, 4);
    } else if (!p.crate && d < 2.9) {
      p.alive = false;
      applyPickup(sim, p.kind);
    }
  }
}

// ---------------------------------------------------------------- player weapons

/** Gun tiers act on the shot v0.1's fireShot() just produced (tier 0 is exactly v0.1). */
function upgradeFreshShots(sim: Sim) {
  const hero = sim.cars[0];
  const tier = sim.up.gun;
  for (const s of sim.shots) {
    if (!s.alive || s.owner !== 0 || s.rocket || s.life !== 0.72) continue;
    s.life = 0.7199999; // processed
    s.dmg = tier >= 2 ? 24 : 16;
    s.target = -1;
    aimAssist(sim, s);
    if (tier < 1) continue;
    const { rx, rz } = fxDir(hero.yaw);
    const extra: [number, number, number][] = [[0.42, 0, s.dmg]];
    if (tier >= 3) extra.push([0, 0.12, 16], [0, -0.12, 16]);
    s.x -= rx * 0.42;
    s.z -= rz * 0.42;
    s.px = s.x;
    s.pz = s.z;
    for (const [side, ang, dmg] of extra) {
      const c = sim.shots.find((o) => !o.alive);
      if (!c) break;
      Object.assign(c, s);
      c.dmg = dmg;
      c.x = s.x + rx * (side * 2 + (ang ? 0.42 : 0));
      c.z = s.z + rz * (side * 2 + (ang ? 0.42 : 0));
      c.px = c.x;
      c.pz = c.z;
      if (ang) {
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        c.vx = s.vx * cos + s.vz * sin;
        c.vz = -s.vx * sin + s.vz * cos;
      }
    }
  }
}

function freshHeroMines(sim: Sim) {
  const hero = sim.cars[0];
  for (const m of sim.mines) {
    // Just-dropped hero mine. Cluster copies clear `fresh` before they are written,
    // so oil / cluster / reserve still run once after a fuse upgrade.
    if (!m.alive || !m.fresh) continue;
    m.fresh = false;
    if (m.life !== 9) continue;
    m.life = 8.9999;
    m.owner = 0;
    m.oil = sim.up.oilT > 0;
    if (m.oil) m.life = 7;
    if (sim.up.reserve > 0) {
      sim.up.reserve -= 1;
      hero.mines = Math.min(resolvedStats(sim.carId, false).mineCap, hero.mines + 1);
    }
    if (sim.up.cluster) {
      const { rx, rz } = fxDir(hero.yaw);
      for (const side of [-2.4, 2.4]) {
        const c = sim.mines.find((o) => !o.alive);
        if (!c) break;
        Object.assign(c, m);
        c.fresh = false;
        c.x = m.x + rx * side;
        c.z = m.z + rz * side;
      }
    }
  }
}

function nearestTarget(sim: Sim, x: number, z: number, yaw: number, cone: number, range: number) {
  const { fx, fz } = fxDir(yaw);
  let best: Car | null = null;
  let bestD = range;
  for (const c of sim.cars) {
    if (c.hero || !c.alive) continue;
    const dx = c.x - x;
    const dz = c.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 2 || d > bestD) continue;
    if ((dx * fx + dz * fz) / d < Math.cos(cone)) continue;
    best = c;
    bestD = d;
  }
  return best;
}

function fireRocket(sim: Sim, hero: Car) {
  const slot = sim.shots.find((s) => !s.alive);
  if (!slot) return;
  const { fx, fz } = fxDir(hero.yaw);
  const target = nearestTarget(sim, hero.x, hero.z, hero.yaw, 0.9, 140);
  slot.alive = true;
  slot.owner = 0;
  slot.rocket = true;
  slot.target = target ? target.id : -1;
  slot.dmg = 45;
  slot.x = hero.x + fx * 1.4;
  slot.y = hero.y + 1.1;
  slot.z = hero.z + fz * 1.4;
  slot.px = slot.x;
  slot.py = slot.y;
  slot.pz = slot.z;
  const spd = 58 + Math.max(0, hero.speed);
  slot.vx = fx * spd;
  slot.vy = 3;
  slot.vz = fz * spd;
  slot.life = 2.4;
  sim.up.rockets -= 1;
  sim.up.rocketCd = 0.42;
  sim.events.push({ t: "rocket" });
}

// ---------------------------------------------------------------- enemies

function lateralOf(sim: Sim, car: Car) {
  return queryTrack(sim.track, car.x, car.z, car.along).lateral;
}

function aiInput(sim: Sim, car: Car): Input {
  const hero = sim.cars[0];
  const heroLat = lateralOf(sim, hero);
  const dS = car.along - hero.along;
  let wantLat = car.lane;
  let hold = car.hold;
  if (car.leaving) {
    hold = 400;
  } else if (car.kind === "rammer" || (sim.idleT > 4 && car.kind !== "boss" && car.kind !== "gunner")) {
    // (a parked player gets charged by everything except gunners/boss, which shoot instead)
    // line up in your lane 14-16 m out (in front: in your guns; behind: over your mines), then charge
    const side = car.hold >= 0 && sim.idleT < 1.5 ? 1 : -1;
    if (car.ramCd > 0) hold = side * (side < 0 ? 12 : 16);
    else {
      wantLat = heroLat;
      const lined = Math.abs(lateralOf(sim, car) - heroLat) < 2.5 || (sim.idleT > 1.5 && dS <= 2);
      hold = lined ? 0 : side * (side < 0 ? 11 : 14);
    }
  } else if (car.kind === "gunner") {
    const side = heroLat + 6 <= 9.5 ? 1 : -1;
    wantLat = clamp(heroLat + side * 6 * (car.id % 2 === 0 ? 1 : -1), -9.5, 9.5);
    if (Math.abs(wantLat - heroLat) < 4) wantLat = clamp(heroLat - side * 6, -9.5, 9.5);
  } else if (car.kind === "spiker") {
    if (car.ramCd > 0) {
      // after a grind it peels out in front of you for a few seconds (your window to shoot it)
      wantLat = heroLat;
      hold = 16;
    } else {
      const myLat = lateralOf(sim, car);
      const side = myLat >= heroLat ? 1 : -1;
      wantLat = clamp(heroLat + side * 2.7, -9.8, 9.8);
      if (Math.abs(wantLat - heroLat) < 2) wantLat = clamp(heroLat - side * 2.7, -9.8, 9.8);
      hold = sim.idleT > 1.5 ? -3 : 0;
    }
  } else if (car.kind === "boss") {
    wantLat = Math.floor(sim.time / 5) % 2 === 0 ? 4.5 : -4.5;
  }
  const look = 9 + Math.min(20, Math.abs(car.speed) * 0.32);
  const ahead = poseAt(sim.track, car.along + look);
  const tx = ahead.x + ahead.rx * wantLat;
  const tz = ahead.z + ahead.rz * wantLat;
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz) || 1;
  const desired = Math.atan2(-dx / dist, -dz / dist);
  const diff = wrapAngle(desired - car.yaw);
  const steer = clamp(diff / 0.42, -1, 1);
  const err = hero.along + hold - car.along;
  car.baseSpeed += (hero.speed - car.baseSpeed) * Math.min(1, (car.kind === "spiker" ? 0.7 : 6) * (1 / 60));
  const refSpeed = car.kind === "spiker" ? car.baseSpeed : hero.speed;
  let target = clamp(refSpeed + clamp(err * (car.kind === "spiker" && err < 0 ? 0.35 : 0.7), -16, 16), 0, 48);
  if (car.kind === "rammer" && car.ramCd <= 0 && hold === 0 && Math.abs(dS) < 20) target = Math.max(target, hero.speed + 9);
  if (car.kind === "boss") target = Math.min(target, 44);
  let throttle = 0.15;
  if (car.speed < target - 1) throttle = 1;
  else if (car.speed > target + 3) throttle = -0.5;
  if (!car.leaving && err < -8 && hero.speed < 6) throttle = car.speed > 0.5 ? -0.5 : 0; // player stopped behind us: pull up
  // m3b: only the player's Roadster has thrusters. Enemies never thrust; they brake to a stop
  // before a void instead and are brought back in behind you once you are across (stepEnemy).
  // only gaps before the player matter while the player is ahead (the road up to a parked player is solid)
  const reach = hero.along > car.along ? Math.min(45, hero.along - car.along - 4) : 45;
  if (reach >= 6 && gapAhead(sim.track, car.along, reach)) {
    // parked player beside/behind us and a void ahead: back up behind them (then the charge comes from behind)
    throttle = sim.idleT > 4 && dS > -8 ? -1 : car.speed > 1 ? -1 : 0;
  }
  return { steer, throttle, fire: false, mine: false, thrust: false };
}

function enemyMine(sim: Sim, car: Car) {
  const slot = sim.mines.find((m) => !m.alive);
  if (!slot) return;
  const { fx, fz } = fxDir(car.yaw);
  const back = car.kind === "boss" ? 6.5 : 3.8;
  const q = queryTrack(sim.track, car.x - fx * back, car.z - fz * back, car.along);
  if (q.gap) return;
  slot.alive = true;
  slot.owner = car.id;
  slot.oil = false;
  slot.x = car.x - fx * back;
  slot.z = car.z - fz * back;
  slot.y = q.y + 0.15;
  slot.life = 12;
  slot.arm = ENEMY_MINE_ARM;
  slot.fresh = false;
  sim.events.push({ t: "emine" });
}

/** Out of the fight, or the player has parked: peel off forward into the fog, then re-enter from behind (never pops in view). */
function recycleIfNeeded(sim: Sim, car: Car) {
  const hero = sim.cars[0];
  const dS = car.along - hero.along;
  if (sim.idleT > 4 && dS > 2) car.leaving = true;
  if (sim.idleT === 0 && car.leaving && dS < OUT_OF_VIEW) car.leaving = false;
  // m3b: enemies no longer thrust over voids, so a car peeling away can get stuck at a void edge: recycle it once it's far out
  car.leaveT = car.leaving ? car.leaveT + 1 / 60 : 0;
  const stuckAtVoid = car.kind !== "drone" && car.leaving && dS > 60 && ((Math.abs(car.speed) < 3 && gapAhead(sim.track, car.along, 45)) || car.leaveT > 12);
  const gone = dS < -170 || dS > 320 || (car.leaving && dS > OUT_OF_VIEW) || stuckAtVoid;
  if (!gone) return false;
  for (const off of [-60, -80, -100, -45, -125]) {
    const s = hero.along + off;
    if (s > sim.track.first * 2 + 4 && (car.kind === "drone" || spawnPointOk(sim, s))) {
      place(sim, car, s, hero.speed + 6);
      if (car.kind === "drone") car.y += DRONE_ALT;
      car.leaving = false;
      if (car.kind === "rammer") car.hold = -1;
      sim.recycled += 1;
      break;
    }
  }
  return true;
}

function stepDrone(sim: Sim, car: Car, dt: number) {
  const hero = sim.cars[0];
  car.holdT -= dt;
  if (car.holdT <= 0) {
    car.hold = car.hold > 0 ? -16 : 18;
    car.holdT = 6 + Math.random() * 3;
  }
  const hold = car.leaving ? 400 : car.hold;
  const err = hero.along + hold - car.along;
  car.speed = clamp(hero.speed + clamp(err * 1.4, -22, 22), -10, 70);
  car.along += car.speed * dt;
  const heroLat = lateralOf(sim, hero);
  const wantLat = clamp(heroLat + Math.sin(sim.time * 0.9 + car.id) * 6, -10, 10);
  car.lane += clamp(wantLat - car.lane, -7 * dt, 7 * dt);
  const p = poseAt(sim.track, car.along);
  car.x = p.x + p.rx * car.lane;
  car.z = p.z + p.rz * car.lane;
  car.y = p.y + DRONE_ALT + Math.sin(sim.time * 2.1 + car.id) * 0.5;
  car.yaw = yawFromDir(p.tx, p.tz);
  car.lastAlong = car.along;
  car.flash = Math.max(0, car.flash - dt);
  car.fireCd = Math.max(0, car.fireCd - dt);
  if (car.fireCd <= 0 && hero.alive && !car.leaving) {
    const dist = Math.hypot(hero.x - car.x, hero.z - car.z);
    if (dist < 45) {
      enemyShot(sim, car);
      car.fireCd = 1.6;
    }
  }
}

const RIVAL_LANES = [-6, 0, 6];
const RIVAL_KINDS: EnemyKind[] = ["rammer", "gunner", "rammer"];
const RIVAL_SHOT_GAP = 3.2;

function spawnRivals(sim: Sim) {
  const hero = sim.cars[0];
  for (let i = 0; i < RIVAL_COUNT; i++) {
    let off: number = RIVAL_OFFSETS[i];
    if (!spawnPointOk(sim, hero.along + off)) {
      for (const tweak of [20, -20, 40, -40]) {
        if (spawnPointOk(sim, hero.along + off + tweak)) {
          off += tweak;
          break;
        }
      }
    }
    const car = spawnEnemy(sim, RIVAL_KINDS[i], off, RIVAL_LANES[i]);
    if (!car) continue;
    car.racer = true;
    car.raceSpeed = RIVAL_SPEED + (i - 1) * 2;
    car.speed = car.raceSpeed;
    car.baseSpeed = car.raceSpeed;
    car.fireCd = 2.4 + i * 0.35;
    car.recover = 0;
    car.leaving = false;
    car.hold = 0;
    car.burst = 0;
  }
}

/** Keep racing the finish. One shot every few seconds inside a short cone. No orbit, no respawn. */
function stepRival(sim: Sim, car: Car, dt: number) {
  if (car.hp <= 0) {
    killAI(sim, car);
    return;
  }
  car.ramCd = Math.max(0, car.ramCd - dt);
  car.fireCd = Math.max(0, car.fireCd - dt);
  car.flash = Math.max(0, car.flash - dt);
  car.leaving = false;
  const cruise = Math.max(SCROLL_MIN, car.raceSpeed > 0 ? car.raceSpeed : RIVAL_SPEED);
  car.speed = cruise;
  car.along += cruise * dt;
  const p = poseAt(sim.track, car.along);
  car.x = p.x + p.rx * car.lane;
  car.z = p.z + p.rz * car.lane;
  car.y = p.y;
  car.grounded = true;
  car.yaw = yawFromDir(p.tx, p.tz);
  car.lastAlong = car.along;
  car.lat = 0;
  car.vy = 0;
  if (!car.alive || sim.phase !== "playing") return;
  const hero = sim.cars[0];
  if (!hero.alive) return;
  const { fx, fz } = fxDir(car.yaw);
  const dx = hero.x - car.x;
  const dz = hero.z - car.z;
  const dist = Math.hypot(dx, dz);
  const ahead = dx * fx + dz * fz;
  const lat = Math.abs(lateralOf(sim, car) - lateralOf(sim, hero));
  const dS = hero.along - car.along;
  const inCone = dist < 22 && ahead > -8 && ahead < 20 && lat < 8 && Math.abs(hero.y - car.y) < 3.5;
  if (!inCone) return;
  if (car.ramCd <= 0 && dist < 4.6 && Math.abs(dS) < 4) ram(sim, hero, car);
  if (car.alive && car.fireCd <= 0 && hero.alive && sim.phase === "playing") {
    enemyShot(sim, car);
    car.fireCd = RIVAL_SHOT_GAP;
  }
}

function stepEnemy(sim: Sim, car: Car, dt: number) {
  if (car.racer) {
    stepRival(sim, car, dt);
    return;
  }
  const hero = sim.cars[0];
  car.ramCd = Math.max(0, car.ramCd - dt);
  car.dropCd = Math.max(0, car.dropCd - dt);
  if (recycleIfNeeded(sim, car)) return;
  // waiting at a void you already jumped: re-enter behind you, out of view
  if (car.kind !== "drone" && hero.along - car.along > 40 && gapAhead(sim.track, car.along, 45) && !gapAhead(sim.track, hero.along - 130, 125)) {
    for (const off of [-60, -80, -100]) {
      const s = hero.along + off;
      if (s > car.along && spawnPointOk(sim, s)) {
        place(sim, car, s, hero.speed + 4);
        sim.recycled += 1;
        break;
      }
    }
    return;
  }
  if (car.kind === "drone") {
    stepDrone(sim, car, dt);
    return;
  }
  drive(sim, car, aiInput(sim, car), dt, true);
  if (!car.alive) return;
  // Catch-up assist (enemies only; never applied to the player): drive() caps cars at
  // 48 m/s, so an enemy behind its hold point gets a little extra forward travel.
  const err = hero.along + (car.leaving ? 400 : car.hold) - car.along;
  if (err > (car.kind === "spiker" ? 1.5 : 6) && car.recover <= 0 && car.spin <= 0) {
    const { fx, fz } = fxDir(car.yaw);
    const extra = Math.min(16, err * (car.kind === "spiker" ? 1.2 : 0.5)) * dt;
    car.x += fx * extra;
    car.z += fz * extra;
  }
  if (car.leaving) return;
  const dS = car.along - hero.along;
  // a player parked >6 s with an enemy right alongside gets side-swiped (no stalemates beside voids)
  if (sim.idleT > 6 && car.ramCd <= 0 && car.kind !== "gunner" && car.kind !== "boss" && Math.abs(dS) < 4 && Math.abs(hero.y - car.y) < 1.6 && Math.hypot(hero.x - car.x, hero.z - car.z) < 4.6) ram(sim, hero, car);
  if (car.kind === "gunner") {
    car.holdT -= dt;
    if (car.holdT <= 0) {
      car.hold = car.hold > 0 ? -12 : 24;
      car.holdT = 6 + Math.random() * 4;
    }
    if (car.burst > 0) {
      car.burstCd -= dt;
      if (car.burstCd <= 0) {
        enemyShot(sim, car);
        car.burst -= 1;
        car.burstCd = 0.12;
        if (car.burst === 0) car.fireCd = 2.0;
      }
    } else if (car.fireCd <= 0 && hero.alive && car.recover <= 0) {
      const dist = Math.hypot(hero.x - car.x, hero.z - car.z);
      if (dist > 6 && dist < 42 && Math.abs(hero.y - car.y) < 4) {
        car.burst = 3;
        car.burstCd = 0;
      }
    }
  } else if (car.kind === "mine") {
    car.weaveT -= dt;
    if (car.weaveT <= 0) {
      car.lane = LANES[Math.floor(Math.random() * LANES.length)];
      car.weaveT = 2.5 + Math.random() * 1.5;
    }
    if (car.dropCd <= 0 && dS > 6 && dS < 70) {
      enemyMine(sim, car);
      car.dropCd = 2.5;
    }
  } else if (car.kind === "spiker") {
    const latGap = Math.abs(lateralOf(sim, car) - lateralOf(sim, hero));
    if (car.ramCd <= 0 && Math.abs(dS) < 3.6 && latGap < 3.1 && Math.abs(hero.y - car.y) < 1.6 && hero.alive) {
      car.spikeT -= dt;
      car.weaveT -= dt;
      if (car.weaveT <= -1.6) {
        car.weaveT = 0;
        car.ramCd = 3.2;
      }
      chipHero(sim, 12 * dt);
      hero.speed *= 1 - 0.45 * dt;
      if (car.spikeT <= 0) {
        car.spikeT = 0.2;
        sim.events.push({ t: "hit", x: (hero.x + car.x) / 2, y: hero.y + 0.5, z: (hero.z + car.z) / 2, big: false });
        sim.events.push({ t: "scrape" });
      }
    }
  } else if (car.kind === "boss") {
    if (car.burst > 0) {
      car.burstCd -= dt;
      if (car.burstCd <= 0) {
        enemyShot(sim, car, (car.burst - 3) * 0.12);
        car.burst -= 1;
        car.burstCd = 0.09;
        if (car.burst === 0) car.fireCd = 2.4;
      }
    } else if (car.fireCd <= 0 && dS > 4 && dS < 55 && hero.alive) {
      car.burst = 5;
      car.burstCd = 0;
    }
    if (car.dropCd <= 0 && dS > 6 && dS < 60) {
      enemyMine(sim, car);
      car.dropCd = 3.5;
    }
  }
}

function separate(sim: Sim) {
  const cars = sim.cars.filter((c) => c.alive && c.kind !== "drone");
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      const min = carRadius(a) + carRadius(b);
      if (d < 0.0001) {
        dx = 0.01;
        dz = 0;
        d = 0.01;
      }
      if (d < min && Math.abs(a.y - b.y) < 2.2) {
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        const wa = b.kind === "boss" ? 1.8 : a.kind === "boss" ? 0.2 : 1;
        a.x -= nx * push * wa;
        a.z -= nz * push * wa;
        b.x += nx * push * (2 - wa);
        b.z += nz * push * (2 - wa);
        if (a.speed > b.speed) b.speed *= 0.98;
        else a.speed *= 0.98;
        if (a.hero && !b.hero && b.ramCd <= 0) ram(sim, a, b);
      }
    }
  }
}

function ram(sim: Sim, hero: Car, enemy: Car) {
  if (enemy.kind === "hero") return;
  enemy.ramCd = enemy.kind === "boss" ? 1.4 : 2.6;
  const { rx, rz } = fxDir(hero.yaw);
  const side = Math.sign((hero.x - enemy.x) * rx + (hero.z - enemy.z) * rz) || 1;
  const x = (hero.x + enemy.x) / 2;
  const z = (hero.z + enemy.z) / 2;
  sim.events.push({ t: "hit", x, y: hero.y + 0.6, z, big: true });
  if (damageHero(sim, ENEMY[enemy.kind].ram)) hero.lat += side * 7;
  if (enemy.kind !== "boss") hurtEnemy(sim, enemy, 6, false);
}

function hurtEnemy(sim: Sim, car: Car, dmg: number, rear: boolean) {
  car.hp -= dmg;
  car.flash = 0.18;
  if (car.kind !== "boss" && car.kind !== "drone") car.speed *= 0.86;
  if (rear && sim.toastT < 1.4) toast(sim, "Weak point ×2");
  if (car.hp <= 0) killAI(sim, car);
}

/** Light aim assist: a fresh player shot bends toward an enemy inside a narrow cone ahead. */
function aimAssist(sim: Sim, s: Shot) {
  const sp = Math.hypot(s.vx, s.vz) || 1;
  const fx = s.vx / sp;
  const fz = s.vz / sp;
  let best: Car | null = null;
  let bestCos = Math.cos(0.11);
  for (const c of sim.cars) {
    if (c.hero || !c.alive || Math.abs(c.y - s.y + 0.7) > 2.5) continue;
    const dx = c.x - s.x;
    const dz = c.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d < 3 || d > 65) continue;
    const cos = (dx * fx + dz * fz) / d;
    if (cos > bestCos) {
      bestCos = cos;
      best = c;
    }
  }
  if (!best) return;
  const dx = best.x - s.x;
  const dz = best.z - s.z;
  const d = Math.hypot(dx, dz) || 1;
  s.vx = (dx / d) * sp;
  s.vz = (dz / d) * sp;
}

function homing(sim: Sim, s: Shot, dt: number) {
  let t = s.target >= 0 ? sim.cars[s.target] : null;
  if (!t || !t.alive) {
    t = nearestTarget(sim, s.x, s.z, Math.atan2(-s.vx, -s.vz), 0.8, 120);
    s.target = t ? t.id : -1;
  }
  if (!t) return;
  const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
  const dx = t.x - s.x;
  const dy = t.y + 0.6 - s.y;
  const dz = t.z - s.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const k = Math.min(1, 5 * dt);
  s.vx += ((dx / d) * sp - s.vx) * k;
  s.vy += ((dy / d) * sp - s.vy) * k;
  s.vz += ((dz / d) * sp - s.vz) * k;
}

function stepShots(sim: Sim, dt: number) {
  for (const s of sim.shots) {
    if (!s.alive) continue;
    if (s.rocket) homing(sim, s, dt);
    s.px = s.x;
    s.py = s.y;
    s.pz = s.z;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    if (s.life <= 0) {
      if (s.rocket) sim.events.push({ t: "boom", x: s.x, y: s.y, z: s.z });
      s.alive = false;
      s.rocket = false;
      continue;
    }
    const abx = s.x - s.px;
    const abz = s.z - s.pz;
    const ab2 = abx * abx + abz * abz || 1;
    if (s.owner === 0) {
      for (const p of sim.pickups) {
        if (!p.alive || !p.crate || Math.abs(p.y - s.y) > 1.4) continue;
        const t = clamp(((p.x - s.px) * abx + (p.z - s.pz) * abz) / ab2, 0, 1);
        const ex = p.x - (s.px + abx * t);
        const ez = p.z - (s.pz + abz * t);
        if (ex * ex + ez * ez < 1.2 * 1.2) {
          openCrate(sim, p);
          s.alive = false;
          s.rocket = false;
          break;
        }
      }
      if (!s.alive) continue;
    }
    for (const car of sim.cars) {
      if (!car.alive || car.id === s.owner) continue;
      if (s.owner !== 0 && !car.hero) continue; // no enemy friendly fire
      const big = car.kind === "boss";
      const st = car.kind === "hero" ? null : ENEMY[car.kind];
      if (Math.abs(car.y + (st ? st.hitY : 0.6) - s.y) > (st ? st.hitH : 1.6)) continue;
      let t = ((car.x - s.px) * abx + (car.z - s.pz) * abz) / ab2;
      t = clamp(t, 0, 1);
      const cx = s.px + abx * t;
      const cz = s.pz + abz * t;
      const dx = car.x - cx;
      const dz = car.z - cz;
      const r = st ? st.hit : 1.7;
      if (dx * dx + dz * dz < r * r) {
        s.alive = false;
        sim.events.push(s.rocket ? { t: "boom", x: cx, y: s.y, z: cz } : { t: "hit", x: cx, y: s.y, z: cz, big: false });
        if (car.hero) {
          damageHero(sim, s.dmg);
        } else {
          let dmg = s.dmg;
          let rear = false;
          if (big) {
            const { fx, fz } = fxDir(car.yaw);
            rear = s.vx * fx + s.vz * fz > 0;
            if (rear) dmg *= 2;
          }
          sim.score += 10;
          hurtEnemy(sim, car, dmg, rear);
        }
        s.rocket = false;
        break;
      }
    }
  }
}

function stepMines(sim: Sim, dt: number) {
  for (const m of sim.mines) {
    if (!m.alive) continue;
    m.life -= dt;
    m.arm -= dt;
    if (m.life <= 0) {
      m.alive = false;
      continue;
    }
    if (m.arm > 0) continue;
    for (const car of sim.cars) {
      if (!car.alive || car.kind === "drone") continue;
      if (m.owner > 0 && !car.hero) continue; // enemy mines only hunt the player
      if (m.oil && car.hero) continue;
      const dx = car.x - m.x;
      const dz = car.z - m.z;
      const r = m.oil ? 3.0 : car.kind === "hero" ? 2.55 : ENEMY[car.kind].mineR;
      if (dx * dx + dz * dz < r * r && Math.abs(car.y - m.y) < 2.4) {
        if (m.oil) {
          if (car.spin <= 0 && car.kind !== "boss") {
            car.spin = 1.1;
            car.speed *= 0.5;
            if (car.hero) scrollFloor(car);
            sim.score += 15;
          }
          continue;
        }
        m.alive = false;
        sim.events.push({ t: "hit", x: m.x, y: m.y, z: m.z, big: true });
        sim.trauma = Math.min(1, sim.trauma + (car.hero ? 0.4 : 0.2));
        if (car.hero) {
          if (car.invuln > 0 || sim.up.shieldT > 0) break;
          car.speed *= m.owner > 0 ? 0.5 : 0.25;
          scrollFloor(car);
          car.spin = m.owner > 0 ? 0.5 : 0.7;
          if (m.owner === 0) toast(sim, "Own mine");
          damageHero(sim, m.owner > 0 ? 22 : 28);
        } else {
          if (car.kind !== "boss") {
            car.speed *= 0.25;
            car.spin = 0.7;
          }
          sim.score += 30;
          hurtEnemy(sim, car, 28, false);
        }
        break;
      }
    }
  }
}

/** Keyboard T (edge) and the touch Track pulse. Non-S cars ignore both and stay off. */
function pollTrack(sim: Sim) {
  if (!supportsTrackMode(sim.carId)) {
    sim.trackOn = false;
    sim.prevTrackKey = false;
    sim.touchTrack = false;
    return;
  }
  const keys = sim.keysOverride ?? sim.keys;
  const down = keys.has("KeyT");
  if ((down && !sim.prevTrackKey) || sim.touchTrack) {
    sim.trackOn = !sim.trackOn;
    sim.events.push({ t: "track", on: sim.trackOn });
  }
  sim.prevTrackKey = down;
  sim.touchTrack = false;
}

export function step(sim: Sim, dt: number) {
  if (sim.phase !== "playing") return;
  pollTrack(sim);
  if (sim.hitstop > 0) {
    sim.hitstop -= dt;
    return;
  }
  sim.time += dt;
  sim.toastT = Math.max(0, sim.toastT - dt);
  sim.scrapeCd = Math.max(0, sim.scrapeCd - dt);
  sim.trauma = Math.max(0, sim.trauma - dt * 1.5);

  const hero = sim.cars[0];
  let fore = hero.along;
  let back = hero.along;
  if (sim.race.armed) {
    for (let i = 1; i < sim.cars.length; i++) {
      const car = sim.cars[i];
      if (!car.alive || !car.racer) continue;
      if (car.along > fore) fore = car.along;
      if (car.along < back) back = car.along;
    }
  }
  ensureTrack(sim.track, fore + 800);
  trimTrack(sim.track, back - 260);

  const input = readInput(sim);
  hero.invuln = Math.max(0, hero.invuln - dt);
  const u = sim.up;
  u.oilT = Math.max(0, u.oilT - dt);
  u.shieldT = Math.max(0, u.shieldT - dt);
  u.magnetT = Math.max(0, u.magnetT - dt);
  u.rocketCd = Math.max(0, u.rocketCd - dt);
  sim.idleT = Math.abs(hero.speed) < 6 ? sim.idleT + dt : 0;
  if (hero.alive) drive(sim, hero, input, dt, false);
  sim.prevMine = input.mine;
  if (sim.phase !== "playing") return;
  upgradeFreshShots(sim);
  freshHeroMines(sim);
  if (input.fire && u.rockets > 0 && u.rocketCd <= 0 && hero.alive && hero.recover <= 0) fireRocket(sim, hero);

  for (let i = 1; i < sim.cars.length; i++) {
    const car = sim.cars[i];
    if (car.alive) stepEnemy(sim, car, dt);
  }
  separate(sim);
  stepShots(sim, dt);
  stepMines(sim, dt);
  stepPickups(sim, dt);
  if (sim.phase === "playing") stepWaves(sim, dt);
  if (sim.phase === "playing") stepRace(sim, dt);
  if (hero.alive) scrollFloor(hero);
}

// ---------------------------------------------------------------- debug/test staging (used by ?debug and tests)

export function debugStartWave(sim: Sim, n: number) {
  for (let i = 1; i < sim.cars.length; i++) {
    sim.cars[i].alive = false;
    sim.cars[i].y = -40;
  }
  sim.lull = 0;
  startWave(sim, n);
}

export function debugSpawn(sim: Sim, kind: EnemyKind, offset: number, lane?: number) {
  const car = spawnEnemy(sim, kind, offset, lane);
  if (car) car.speed = sim.cars[0].speed;
  return car;
}

export function formatTime(t: number) {
  if (!Number.isFinite(t) || t < 0) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

/** HUD threat state: is this enemy firing, about to fire, or lining up a ram right now? */
export function threatHot(sim: Sim, car: Car) {
  if (!car.alive || car.leaving) return false;
  const hero = sim.cars[0];
  const dS = car.along - hero.along;
  const d = Math.hypot(hero.x - car.x, hero.z - car.z);
  if (car.racer) return car.fireCd < 0.45 && d < 24 && dS > -20 && dS < 22;
  switch (car.kind) {
    case "gunner":
      return car.burst > 0 || (car.fireCd < 0.45 && d < 42);
    case "boss":
      return car.burst > 0 || (car.fireCd < 0.5 && dS > 4 && dS < 55);
    case "drone":
      return car.fireCd < 0.4 && d < 45;
    case "rammer":
      return car.ramCd <= 0 && Math.abs(dS) < 22;
    case "spiker":
      return car.ramCd <= 0 && Math.abs(dS) < 8;
    case "mine":
      return car.dropCd < 0.5 && dS > 6 && dS < 70;
    default:
      return false;
  }
}
