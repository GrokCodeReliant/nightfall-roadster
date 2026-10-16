import { buildTrack, gapAhead, poseAt, queryTrack, wrapAngle, yawFromDir, type Track } from "./track";

export type Fx =
  | { t: "shot" }
  | { t: "hit"; x: number; y: number; z: number; big: boolean }
  | { t: "boom"; x: number; y: number; z: number }
  | { t: "mine" }
  | { t: "land"; x: number; y: number; z: number; hard: boolean }
  | { t: "fall" }
  | { t: "scrape" }
  | { t: "lap" }
  | { t: "finish" }
  | { t: "down" };

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
};

export type Mine = {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  life: number;
  arm: number;
};

export type Car = {
  id: number;
  hero: boolean;
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
  lap: number;
  nextCp: number;
  lastCp: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnIn: number;
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
};

export type Phase = "menu" | "playing" | "paused" | "finished";

export type TouchState = {
  steer: number;
  throttle: number;
  fire: boolean;
  mine: boolean;
  thrust: boolean;
};

export type Result = {
  time: number;
  score: number;
  position: number;
  bestLap: number | null;
  takedowns: number;
  falls: number;
};

export type Sim = {
  track: Track;
  cars: Car[];
  shots: Shot[];
  mines: Mine[];
  phase: Phase;
  time: number;
  score: number;
  takedowns: number;
  falls: number;
  lapClock: number;
  bestLap: number | null;
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
  hintedRamp: boolean;
  hintedVoid: boolean;
  hintedPits: boolean;
  scrapeCd: number;
  trauma: number;
};

const GRAVITY = 27;
const THRUST_ACCEL = 40;
const MAX_FUEL = 100;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function makeCar(id: number, hero: boolean, lane: number, baseSpeed: number): Car {
  return {
    id,
    hero,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    lat: 0,
    vy: 0,
    grounded: true,
    along: 0,
    lastAlong: 0,
    lap: 0,
    nextCp: 1,
    lastCp: 0,
    hp: hero ? 100 : 48,
    maxHp: hero ? 100 : 48,
    alive: true,
    respawnIn: 0,
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
  };
}

function emptyShot(): Shot {
  return { alive: false, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, life: 0, owner: -1 };
}

function emptyMine(): Mine {
  return { alive: false, x: 0, y: 0, z: 0, life: 0, arm: 0 };
}

export function createSim(): Sim {
  const track = buildTrack();
  const cars = [
    makeCar(0, true, 0, 48),
    makeCar(1, false, 2.3, 37),
    makeCar(2, false, -2.1, 39),
    makeCar(3, false, 1.4, 35),
    makeCar(4, false, -2.6, 36.5),
  ];
  const sim: Sim = {
    track,
    cars,
    shots: Array.from({ length: 48 }, emptyShot),
    mines: Array.from({ length: 10 }, emptyMine),
    phase: "menu",
    time: 0,
    score: 0,
    takedowns: 0,
    falls: 0,
    lapClock: 0,
    bestLap: null,
    toast: "",
    toastT: 0,
    hitstop: 0,
    events: [],
    keys: new Set(),
    keysOverride: null,
    touch: { steer: 0, throttle: 0, fire: false, mine: false, thrust: false },
    mouseFire: false,
    mouseMine: false,
    prevMine: false,
    autoGas: false,
    result: null,
    hintedRamp: false,
    hintedVoid: false,
    hintedPits: false,
    scrapeCd: 0,
    trauma: 0,
  };
  park(sim);
  return sim;
}

function nextCheckpoint(track: Track, along: number) {
  for (let i = 0; i < track.cps.length; i++) {
    if (track.cps[i] > along + 2) return i;
  }
  return 0;
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
  car.nextCp = nextCheckpoint(sim.track, p.s);
  car.lastCp = (car.nextCp - 1 + sim.track.cps.length) % sim.track.cps.length;
  car.alive = true;
  car.spin = 0;
  car.thrust = 0;
}

function park(sim: Sim) {
  const L = sim.track.length;
  const start = L * 0.045;
  place(sim, sim.cars[0], start, 0);
  place(sim, sim.cars[1], start + 22, 0);
  place(sim, sim.cars[2], start + 36, 0);
  place(sim, sim.cars[3], start - 16, 0);
  place(sim, sim.cars[4], start - 32, 0);
  for (const c of sim.cars) {
    c.lap = 0;
    c.hp = c.maxHp;
    c.recover = 0;
    c.flash = 0;
    c.fuel = MAX_FUEL;
    c.rounds = c.hero ? 24 : 99;
    c.mines = c.hero ? 4 : 0;
  }
}

export function begin(sim: Sim) {
  for (const s of sim.shots) s.alive = false;
  for (const m of sim.mines) m.alive = false;
  park(sim);
  sim.cars[0].speed = 0;
  sim.phase = "playing";
  sim.time = 0;
  sim.score = 0;
  sim.takedowns = 0;
  sim.falls = 0;
  sim.lapClock = 0;
  sim.bestLap = null;
  sim.hitstop = 0;
  sim.result = null;
  sim.hintedRamp = false;
  sim.hintedVoid = false;
  sim.hintedPits = false;
  sim.prevMine = false;
  sim.events.length = 0;
  toast(sim, "Three laps. Don't drop into the void.", true);
}

function toast(sim: Sim, text: string, force = false) {
  if (!force && sim.toastT > 1.15) return;
  sim.toast = text;
  sim.toastT = 2.4;
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
    steer += sim.touch.steer;
    if (Math.abs(sim.touch.throttle) > 0.08) throttle = sim.touch.throttle;
    if (sim.autoGas && throttle > -0.25 && !keys.has("KeyS") && !keys.has("ArrowDown")) {
      throttle = Math.max(throttle, 1);
    }
  }
  const fire =
    keys.has("KeyF") || keys.has("KeyJ") || (!sim.keysOverride && (sim.touch.fire || sim.mouseFire));
  const mine = keys.has("KeyG") || keys.has("KeyQ") || (!sim.keysOverride && (sim.touch.mine || sim.mouseMine));
  const thrust =
    keys.has("Space") ||
    keys.has("ShiftLeft") ||
    keys.has("ShiftRight") ||
    (!sim.keysOverride && sim.touch.thrust);
  return {
    steer: clamp(steer, -1, 1),
    throttle: clamp(throttle, -1, 1),
    fire,
    mine,
    thrust,
  };
}

function passedForward(prev: number, curr: number, gate: number, L: number) {
  let d = curr - prev;
  if (d < -L * 0.5) d += L;
  else if (d > L * 0.5) return false;
  if (d <= 0.02) return false;
  const g = gate < prev ? gate + L : gate;
  return g > prev + 0.02 && g <= prev + d + 0.001;
}

function fxDir(yaw: number) {
  return { fx: -Math.sin(yaw), fz: -Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) };
}

function respawn(sim: Sim, car: Car, reason: "fall" | "wreck") {
  // Respawn on solid ground: if the checkpoint sits right before a gap (pitfalls at 0.625),
  // back the spawn up so the car isn't dropped straight into the hole again (respawn loop).
  const L = sim.track.length;
  let s = sim.track.cps[car.lastCp] + 1;
  if (car.lastCp !== 0) {
    let back = 0;
    while (back < 60 && (gapAhead(sim.track, s - back, 30) || poseAt(sim.track, s - back).gap)) back += 5;
    s = Math.max(1, s - back);
  }
  place(sim, car, s % L, 22);
  car.hp = car.maxHp;
  car.recover = reason === "fall" ? 0.85 : 0.65;
  car.flash = 0.4;
  if (car.hero && reason === "fall") {
    sim.falls += 1;
    sim.score = Math.max(0, sim.score - 150);
    sim.events.push({ t: "fall" });
    toast(sim, "The void takes you", true);
    sim.trauma = Math.min(1, sim.trauma + 0.55);
  }
}

function killAI(sim: Sim, car: Car) {
  const bx = car.x;
  const by = car.y;
  const bz = car.z;
  car.alive = false;
  car.respawnIn = 2.1;
  car.speed = 0;
  car.y = -40;
  sim.takedowns += 1;
  sim.score += 500;
  sim.events.push({ t: "boom", x: bx, y: Math.max(0.6, by), z: bz });
  sim.events.push({ t: "down" });
  toast(sim, "Agent down  +500", true);
  sim.hitstop = 0.07;
  sim.trauma = Math.min(1, sim.trauma + 0.45);
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

function dropMine(sim: Sim, car: Car) {
  if (car.mines < 1 || car.mineCd > 0) return;
  const slot = sim.mines.find((m) => !m.alive);
  if (!slot) return;
  const { fx, fz } = fxDir(car.yaw);
  const q = queryTrack(sim.track, car.x - fx * 4.3, car.z - fz * 4.3);
  slot.alive = true;
  slot.x = car.x - fx * 4.3;
  slot.z = car.z - fz * 4.3;
  slot.y = q.gap ? car.y : q.y + 0.15;
  slot.life = 9;
  slot.arm = 0.38;
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

  const wantThrust = input.thrust && (infiniteFuel || car.fuel > 0.5);
  car.thrust = wantThrust ? 1 : 0;
  if (wantThrust && !infiniteFuel) car.fuel = Math.max(0, car.fuel - 36 * dt);
  else if (!infiniteFuel) car.fuel = Math.min(car.maxFuel, car.fuel + 18 * dt);

  if (input.throttle > 0) {
    if (car.speed < 0) car.speed = Math.min(0, car.speed + 40 * dt);
    else car.speed += 24 * input.throttle * dt;
  } else if (input.throttle < 0) {
    if (car.speed > 2) car.speed = Math.max(0, car.speed - 42 * dt);
    else car.speed -= 16 * dt;
  }
  const drag = input.throttle === 0 ? 1.15 : 0.28;
  car.speed -= car.speed * drag * dt;
  if (wantThrust) car.speed += 18 * dt;
  const cap = wantThrust ? 64 : 48;
  car.speed = clamp(car.speed, -14, cap);

  if (wantThrust && car.grounded) {
    car.grounded = false;
    car.vy = Math.max(car.vy, 10);
  } else if (wantThrust && !car.grounded) {
    car.vy += THRUST_ACCEL * dt;
  }

  if (!car.grounded) {
    car.vy -= GRAVITY * dt;
    car.vy = Math.max(-40, Math.min(28, car.vy));
    car.y += car.vy * dt;
  }

  const sp = Math.abs(car.speed);
  const speedFactor = clamp(sp / 10, 0.18, 1);
  const reverse = car.speed >= -0.4 ? 1 : -1;
  const air = car.grounded ? 1 : 0.7;
  // A → steer +1 → +yaw → nose left under the chase cam.
  car.yaw += input.steer * 2.4 * speedFactor * reverse * air * dt;

  const grip = car.grounded ? 8 : 1.3;
  car.lat *= Math.exp(-grip * dt);
  if (car.grounded) car.lat += -input.steer * sp * 0.5 * dt;
  car.lat = clamp(car.lat, -14, 14);

  const { fx, fz, rx, rz } = fxDir(car.yaw);
  car.x += (fx * car.speed + rx * car.lat) * dt;
  car.z += (fz * car.speed + rz * car.lat) * dt;

  let q = queryTrack(sim.track, car.x, car.z);
  const limit = q.width * 0.5 - 1.15;
  if (Math.abs(q.lateral) > limit) {
    const sign = Math.sign(q.lateral);
    const overflow = Math.abs(q.lateral) - limit;
    car.x -= q.rx * sign * overflow;
    car.z -= q.rz * sign * overflow;
    if (car.grounded && sp > 8) {
      car.speed *= 0.965;
      if (car.hero && sim.scrapeCd <= 0 && overflow > 0.08) {
        sim.scrapeCd = 0.18;
        sim.events.push({ t: "scrape" });
        sim.trauma = Math.min(1, sim.trauma + 0.08);
      }
    }
    q = queryTrack(sim.track, car.x, car.z);
  }

  if (q.gap) {
    car.grounded = false;
    if (car.y < q.y - 6.2) {
      respawn(sim, car, "fall");
      return;
    }
  } else if (car.y <= q.y + 0.12 || car.grounded) {
    if (car.grounded && q.kicker && car.speed > 15 && !wantThrust) {
      car.grounded = false;
      car.vy = Math.max(8, car.speed * 0.45);
      car.y = q.y + 0.15;
    } else if (wantThrust && car.vy > 0) {
      car.grounded = false;
      if (car.y < q.y) car.y = q.y;
    } else {
      const hard = !car.grounded && car.vy < -10;
      const wasAir = !car.grounded;
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

  const prev = car.lastAlong;
  car.along = q.s;
  const L = sim.track.length;
  const cps = sim.track.cps;
  let hops = 0;
  while (car.alive && hops < 8 && passedForward(prev, car.along, cps[car.nextCp], L)) {
    hops += 1;
    const hit = car.nextCp;
    car.lastCp = hit;
    car.nextCp = (hit + 1) % cps.length;
    if (hit === 0) {
      car.lap += 1;
      if (car.hero) {
        const lapTime = sim.lapClock;
        sim.lapClock = 0;
        if (lapTime > 1 && (sim.bestLap == null || lapTime < sim.bestLap)) sim.bestLap = lapTime;
        sim.score += 250;
        if (car.lap >= 3) {
          finish(sim);
          break;
        }
        sim.events.push({ t: "lap" });
        toast(sim, `Lap ${car.lap + 1} of 3`, true);
      }
    }
  }
  car.lastAlong = car.along;

  if (car.hero && car.alive) {
    const u = car.along / L;
    if (!sim.hintedRamp && u > 0.1 && u < 0.13) {
      sim.hintedRamp = true;
      toast(sim, "Ramp — thrust if you want more air");
    }
    if (!sim.hintedVoid && u > 0.36 && u < 0.4) {
      sim.hintedVoid = true;
      toast(sim, "Void ahead — hold thrust", true);
    }
    if (!sim.hintedPits && u > 0.59 && u < 0.62) {
      sim.hintedPits = true;
      toast(sim, "Pitfalls — tap thrust");
    }
  }

  car.fireCd = Math.max(0, car.fireCd - dt);
  car.mineCd = Math.max(0, car.mineCd - dt);
  car.flash = Math.max(0, car.flash - dt);
  if (car.hero && !input.fire) car.rounds = Math.min(24, car.rounds + 7 * dt);
  if (car.hero) car.mines = Math.min(4, car.mines + dt / 3.1);

  if (input.fire && car.alive && car.recover <= 0) fireShot(sim, car);
  if (car.hero && input.mine && !sim.prevMine && car.recover <= 0) dropMine(sim, car);
}

function finish(sim: Sim) {
  sim.phase = "finished";
  const pos = rankOf(sim, sim.cars[0]);
  sim.score += Math.max(0, 180 - sim.time) * 8 + (5 - pos) * 400;
  sim.result = {
    time: sim.time,
    score: Math.round(sim.score),
    position: pos,
    bestLap: sim.bestLap,
    takedowns: sim.takedowns,
    falls: sim.falls,
  };
  sim.events.push({ t: "finish" });
  toast(sim, pos === 1 ? "Clean getaway" : `Finished P${pos}`, true);
}

export function progress(car: Car, L: number) {
  return car.lap * L + car.along;
}

export function rankOf(sim: Sim, car: Car) {
  const L = sim.track.length;
  const p = progress(car, L);
  let rank = 1;
  for (const o of sim.cars) {
    if (o !== car && o.alive && progress(o, L) > p) rank += 1;
  }
  return rank;
}

function aiInput(sim: Sim, car: Car): Input {
  const L = sim.track.length;
  const look = 9 + Math.min(20, Math.abs(car.speed) * 0.32);
  const ahead = poseAt(sim.track, car.along + look);
  const tx = ahead.x + ahead.rx * car.lane;
  const tz = ahead.z + ahead.rz * car.lane;
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz) || 1;
  const desired = Math.atan2(-dx / dist, -dz / dist);
  const diff = wrapAngle(desired - car.yaw);
  const steer = clamp(diff / 0.42, -1, 1);
  const hero = sim.cars[0];
  const delta = progress(hero, L) - progress(car, L);
  let target = car.baseSpeed;
  if (delta > 50) target += 5;
  if (delta < -40) target -= 3;
  if (Math.abs(diff) > 0.55) target *= 0.7;
  const q = queryTrack(sim.track, car.x, car.z);
  const thrust = gapAhead(sim.track, car.along, 26) || q.gap || (!car.grounded && car.y < q.y + 2);
  let throttle = 1;
  if (car.speed > target) throttle = 0.15;
  const heroAhead = delta > 4 && delta < 42;
  const fire = heroAhead && Math.abs(diff) < 0.35 && car.fireCd <= 0;
  return { steer, throttle, fire, mine: false, thrust };
}

function separate(sim: Sim) {
  const cars = sim.cars.filter((c) => c.alive);
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      const min = 2.15;
      if (d < 0.0001) {
        dx = 0.01;
        dz = 0;
        d = 0.01;
      }
      if (d < min && Math.abs(a.y - b.y) < 2.2) {
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        if (a.speed > b.speed) b.speed *= 0.98;
        else a.speed *= 0.98;
      }
    }
  }
}

function stepShots(sim: Sim, dt: number) {
  for (const s of sim.shots) {
    if (!s.alive) continue;
    s.px = s.x;
    s.py = s.y;
    s.pz = s.z;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    if (s.life <= 0) {
      s.alive = false;
      continue;
    }
    for (const car of sim.cars) {
      if (!car.alive || car.id === s.owner) continue;
      if (Math.abs(car.y + 0.6 - s.y) > 1.6) continue;
      const abx = s.x - s.px;
      const abz = s.z - s.pz;
      const ab2 = abx * abx + abz * abz || 1;
      let t = ((car.x - s.px) * abx + (car.z - s.pz) * abz) / ab2;
      t = clamp(t, 0, 1);
      const cx = s.px + abx * t;
      const cz = s.pz + abz * t;
      const dx = car.x - cx;
      const dz = car.z - cz;
      if (dx * dx + dz * dz < 1.7 * 1.7) {
        s.alive = false;
        const dmg = s.owner === 0 ? 16 : 9;
        car.hp -= dmg;
        car.flash = 0.18;
        car.speed *= 0.86;
        sim.events.push({ t: "hit", x: cx, y: s.y, z: cz, big: false });
        if (car.hero) sim.trauma = Math.min(1, sim.trauma + 0.22);
        if (s.owner === 0) sim.score += 40;
        if (car.hp <= 0) {
          if (car.hero) respawn(sim, car, "wreck");
          else killAI(sim, car);
        }
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
      if (!car.alive) continue;
      const dx = car.x - m.x;
      const dz = car.z - m.z;
      if (dx * dx + dz * dz < 2.55 * 2.55 && Math.abs(car.y - m.y) < 2.4) {
        m.alive = false;
        car.hp -= 28;
        car.speed *= 0.25;
        car.spin = 0.7;
        car.flash = 0.3;
        sim.events.push({ t: "hit", x: m.x, y: m.y, z: m.z, big: true });
        sim.trauma = Math.min(1, sim.trauma + (car.hero ? 0.4 : 0.2));
        if (car.hero) {
          toast(sim, "Own mine");
        } else {
          sim.score += 80;
        }
        if (car.hp <= 0) {
          if (car.hero) respawn(sim, car, "wreck");
          else killAI(sim, car);
        }
        break;
      }
    }
  }
}

function reviveAI(sim: Sim, car: Car) {
  const hero = sim.cars[0];
  let along = hero.along - 26 - car.id * 7;
  let lap = hero.lap;
  if (along < 0) {
    along += sim.track.length;
    lap -= 1;
  }
  if (lap < 0) {
    lap = 0;
    along = Math.max(2, hero.along * 0.45);
  }
  place(sim, car, along, 30);
  car.lap = lap;
  car.hp = car.maxHp;
  car.recover = 0.35;
}

export function step(sim: Sim, dt: number) {
  if (sim.phase !== "playing") return;
  if (sim.hitstop > 0) {
    sim.hitstop -= dt;
    return;
  }
  sim.time += dt;
  sim.lapClock += dt;
  sim.toastT = Math.max(0, sim.toastT - dt);
  sim.scrapeCd = Math.max(0, sim.scrapeCd - dt);
  sim.trauma = Math.max(0, sim.trauma - dt * 1.5);

  const input = readInput(sim);
  const hero = sim.cars[0];
  if (hero.alive) drive(sim, hero, input, dt, false);
  sim.prevMine = input.mine;

  for (let i = 1; i < sim.cars.length; i++) {
    const car = sim.cars[i];
    if (!car.alive) {
      car.respawnIn -= dt;
      if (car.respawnIn <= 0) reviveAI(sim, car);
      continue;
    }
    drive(sim, car, aiInput(sim, car), dt, true);
  }
  separate(sim);
  stepShots(sim, dt);
  stepMines(sim, dt);
}

export function formatTime(t: number) {
  if (!Number.isFinite(t) || t < 0) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}
