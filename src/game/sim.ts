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

export type Kind = "hero" | "rammer" | "gunner";

export const ENEMY: Record<Exclude<Kind, "hero">, { hp: number; tier: number; ram: number }> = {
  rammer: { hp: 40, tier: 1, ram: 18 },
  gunner: { hp: 55, tier: 2, ram: 6 },
};

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
  wave: number;
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
  lives: number;
  wave: number;
  queue: Exclude<Kind, "hero">[];
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
  hinted: number;
  idleT: number;
  scrapeCd: number;
  trauma: number;
};

const GRAVITY = 27;
const THRUST_ACCEL = 40;
const MAX_FUEL = 100;
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
  const cars = [makeCar(0, true, 0, 48)];
  for (let i = 1; i <= ENEMY_SLOTS; i++) cars.push(makeCar(i, false, LANES[i % 4], 40));
  const sim: Sim = {
    track,
    cars,
    shots: Array.from({ length: 64 }, emptyShot),
    mines: Array.from({ length: 10 }, emptyMine),
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
    touch: { steer: 0, throttle: 0, fire: false, mine: false, thrust: false },
    mouseFire: false,
    mouseMine: false,
    prevMine: false,
    autoGas: false,
    result: null,
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
}

function park(sim: Sim) {
  if (sim.track.first > 0 || sim.track.gen.i > 2000) sim.track = buildTrack();
  const hero = sim.cars[0];
  hero.lane = 0;
  place(sim, hero, START_S, 0);
  hero.hp = hero.maxHp;
  hero.recover = 0;
  hero.flash = 0;
  hero.fuel = MAX_FUEL;
  hero.rounds = 24;
  hero.mines = 4;
  hero.invuln = 0;
  for (let i = 1; i < sim.cars.length; i++) {
    const c = sim.cars[i];
    c.alive = false;
    c.y = -40;
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
  toast(sim, "Hunters inbound. Survive.", true);
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


function fxDir(yaw: number) {
  return { fx: -Math.sin(yaw), fz: -Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) };
}


function safeSpawnS(sim: Sim, s: number) {
  // Respawn on solid ground: back up out of (and before) any gap.
  let back = 0;
  while (back < 120 && (gapAhead(sim.track, s - back, 30) || poseAt(sim.track, s - back).gap)) back += 5;
  return Math.max(sim.track.first * 2 + 2, s - back);
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
  hero.hp = hero.maxHp;
  hero.recover = 0.65;
  hero.flash = 0.4;
  hero.invuln = 1.5;
  toast(sim, sim.lives === 1 ? "Wrecked — last life" : `Wrecked — ${sim.lives} lives left`, true);
}

function damageHero(sim: Sim, dmg: number) {
  const hero = sim.cars[0];
  if (hero.invuln > 0 || sim.phase !== "playing") return false;
  hero.hp -= dmg;
  hero.flash = 0.18;
  sim.waveHit = true;
  sim.trauma = Math.min(1, sim.trauma + 0.22);
  if (hero.hp <= 0) loseLife(sim);
  return true;
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
  toast(sim, fell ? `Lost to the void  +${pts}` : `${car.kind === "gunner" ? "Gunner" : "Rammer"} down  +${pts}`, true);
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


function enemyShot(sim: Sim, car: Car) {
  const slot = sim.shots.find((s) => !s.alive);
  if (!slot) return;
  const hero = sim.cars[0];
  const hf = fxDir(hero.yaw);
  const lead = 0.25;
  const dx = hero.x + hf.fx * hero.speed * lead - car.x;
  const dz = hero.z + hf.fz * hero.speed * lead - car.z;
  const aim = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.12;
  const { fx: dirx, fz: dirz } = fxDir(aim);
  const cf = fxDir(car.yaw);
  slot.alive = true;
  slot.owner = car.id;
  slot.x = car.x + dirx * 1.6;
  slot.y = car.y + 1.05;
  slot.z = car.z + dirz * 1.6;
  slot.px = slot.x;
  slot.py = slot.y;
  slot.pz = slot.z;
  slot.vx = dirx * 78 + cf.fx * car.speed;
  slot.vy = (hero.y + 0.7 - slot.y) * 1.2;
  slot.vz = dirz * 78 + cf.fz * car.speed;
  slot.life = 0.9;
  sim.events.push({ t: "eshot" });
}

function dropMine(sim: Sim, car: Car) {
  if (car.mines < 1 || car.mineCd > 0) return;
  const slot = sim.mines.find((m) => !m.alive);
  if (!slot) return;
  const { fx, fz } = fxDir(car.yaw);
  const q = queryTrack(sim.track, car.x - fx * 4.3, car.z - fz * 4.3, car.along);
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

  let q = queryTrack(sim.track, car.x, car.z, car.along);
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
    q = queryTrack(sim.track, car.x, car.z, car.along);
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

  car.lastAlong = car.along = q.s;

  if (car.hero && car.alive) {
    const p = nextPiece(sim.track, car.along);
    if (p && sim.hinted !== p.s && car.along > p.signS && car.along < p.s) {
      sim.hinted = p.s;
      toast(sim, p.kind === "void" ? "Void ahead — hold thrust" : "Ramp — thrust if you want more air", true);
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


function gameOver(sim: Sim) {
  sim.phase = "finished";
  sim.result = {
    time: sim.time,
    score: Math.round(sim.score),
    wave: sim.wave,
    takedowns: sim.takedowns,
    falls: sim.falls,
  };
  sim.events.push({ t: "over" });
  toast(sim, "Wrecked for good", true);
}

export function waveRoster(n: number): Exclude<Kind, "hero">[] {
  const count = 2 + n;
  const gunners = Math.max(1, Math.floor(count / 3));
  const out: Exclude<Kind, "hero">[] = [];
  for (let i = 0; i < count; i++) out.push(i % 3 === 2 && out.filter((k) => k === "gunner").length < gunners ? "gunner" : "rammer");
  while (out.filter((k) => k === "gunner").length < gunners) out[out.lastIndexOf("rammer")] = "gunner";
  return out;
}

function startWave(sim: Sim, n: number) {
  sim.wave = n;
  sim.queue = waveRoster(n);
  sim.spawnCd = 0.3;
  sim.waveHit = false;
  toast(sim, `Wave ${n}`, true);
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

function spawnEnemy(sim: Sim, kind: Exclude<Kind, "hero">) {
  const car = sim.cars.find((c, i) => i > 0 && !c.alive);
  if (!car) return false;
  const hero = sim.cars[0];
  sim.spawnFlip += 1;
  const order = sim.spawnFlip % 2 === 0 || hero.speed < 15 ? [-58, 95] : [95, -58];
  let s = -1;
  for (const off of order) {
    if (hero.along + off >= sim.track.first * 2 + 4 && spawnPointOk(sim, hero.along + off)) {
      s = hero.along + off;
      break;
    }
  }
  if (s < sim.track.first * 2 + 4) return false;
  const st = ENEMY[kind];
  car.kind = kind;
  car.lane = LANES[Math.floor(Math.random() * LANES.length)];
  place(sim, car, s, s > hero.along ? Math.max(18, hero.speed * 0.6) : Math.max(30, hero.speed + 6));
  car.hp = car.maxHp = st.hp;
  car.recover = 0.2;
  car.flash = 0.3;
  car.fireCd = 1.0;
  car.burst = 0;
  car.ramCd = 0.6;
  car.hold = kind === "gunner" ? (s > hero.along ? 24 : -22) : s > hero.along ? 1 : -1;
  car.holdT = 6 + Math.random() * 4;
  return true;
}

function stepWaves(sim: Sim, dt: number) {
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
    sim.lull = 3;
  }
}

function lateralOf(sim: Sim, car: Car) {
  return queryTrack(sim.track, car.x, car.z, car.along).lateral;
}

function aiInput(sim: Sim, car: Car): Input {
  const hero = sim.cars[0];
  const heroLat = lateralOf(sim, hero);
  const dS = car.along - hero.along;
  let wantLat = car.lane;
  let hold = car.hold;
  if (car.kind === "rammer") {
    // line up in your lane 14-16 m out (in front: in your guns; behind: over your mines), then charge
    const side = car.hold >= 0 && sim.idleT < 1.5 ? 1 : -1;
    if (car.ramCd > 0) hold = side * 16;
    else {
      wantLat = heroLat;
      const lined = Math.abs(lateralOf(sim, car) - heroLat) < 2.5 || (sim.idleT > 1.5 && dS <= 2);
      hold = lined ? 0 : side * 14;
    }
  } else {
    const side = heroLat + 6 <= 9.5 ? 1 : -1;
    wantLat = clamp(heroLat + side * 6 * (car.id % 2 === 0 ? 1 : -1), -9.5, 9.5);
    if (Math.abs(wantLat - heroLat) < 4) wantLat = clamp(heroLat - side * 6, -9.5, 9.5);
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
  let target = clamp(hero.speed + clamp(err * 0.7, -16, 16), 0, 48);
  if (car.kind === "rammer" && car.ramCd <= 0 && hold === 0 && Math.abs(dS) < 20) target = Math.max(target, hero.speed + 9);
  let throttle = 0.15;
  if (car.speed < target - 1) throttle = 1;
  else if (car.speed > target + 3) throttle = -0.5;
  if (err < -8 && hero.speed < 6) throttle = car.speed > 0.5 ? -0.5 : 0; // player stopped behind us: pull up and wait
  const q = queryTrack(sim.track, car.x, car.z, car.along);
  const thrust = gapAhead(sim.track, car.along, 26) || q.gap || (!car.grounded && car.y < q.y + 2);
  return { steer, throttle, fire: false, mine: false, thrust };
}

function stepEnemy(sim: Sim, car: Car, dt: number) {
  const hero = sim.cars[0];
  car.ramCd = Math.max(0, car.ramCd - dt);
  drive(sim, car, aiInput(sim, car), dt, true);
  if (!car.alive) return;
  // Catch-up assist (enemies only; never applied to the player): drive() caps cars at
  // 48 m/s, so an enemy behind its hold point gets a little extra forward travel.
  const err = hero.along + car.hold - car.along;
  if (err > 6 && car.recover <= 0 && car.spin <= 0) {
    const { fx, fz } = fxDir(car.yaw);
    const extra = Math.min(16, err * 0.5) * dt;
    car.x += fx * extra;
    car.z += fz * extra;
  }
  const dS = car.along - hero.along;
  if (dS < -170 || dS > 320 || (sim.idleT > 4 && dS > 8)) {
    // out of the fight (or the player parked behind it): bring it back in behind the player
    for (const off of [-60, -80, -100, -45, -125]) {
      const s = hero.along + off;
      if (s > sim.track.first * 2 + 4 && spawnPointOk(sim, s)) {
        place(sim, car, s, hero.speed + 6);
        car.hold = -Math.abs(car.hold) || -1;
        break;
      }
    }
    return;
  }
  if (car.kind === "gunner") {
    car.holdT -= dt;
    if (car.holdT <= 0) {
      car.hold = car.hold > 0 ? -22 : 24;
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
  }
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
        if (a.hero && !b.hero && b.ramCd <= 0) ram(sim, a, b);
      }
    }
  }
}

function ram(sim: Sim, hero: Car, enemy: Car) {
  if (enemy.kind === "hero") return;
  enemy.ramCd = 2.6;
  const { rx, rz } = fxDir(hero.yaw);
  const side = Math.sign((hero.x - enemy.x) * rx + (hero.z - enemy.z) * rz) || 1;
  const x = (hero.x + enemy.x) / 2;
  const z = (hero.z + enemy.z) / 2;
  sim.events.push({ t: "hit", x, y: hero.y + 0.6, z, big: true });
  if (damageHero(sim, ENEMY[enemy.kind].ram)) hero.lat += side * 7;
  enemy.hp -= 6;
  enemy.flash = 0.2;
  if (enemy.hp <= 0) killAI(sim, enemy);
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

function stepShots(sim: Sim, dt: number) {
  for (const s of sim.shots) {
    if (!s.alive) continue;
    if (s.owner === 0 && s.life === 0.72) aimAssist(sim, s);
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
      if (s.owner !== 0 && !car.hero) continue; // no enemy friendly fire
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
        sim.events.push({ t: "hit", x: cx, y: s.y, z: cz, big: false });
        if (car.hero) {
          damageHero(sim, 6);
        } else {
          car.hp -= 16;
          car.flash = 0.18;
          car.speed *= 0.86;
          sim.score += 10;
          if (car.hp <= 0) killAI(sim, car);
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
        sim.events.push({ t: "hit", x: m.x, y: m.y, z: m.z, big: true });
        sim.trauma = Math.min(1, sim.trauma + (car.hero ? 0.4 : 0.2));
        if (car.hero) {
          if (car.invuln > 0) break;
          car.speed *= 0.25;
          car.spin = 0.7;
          toast(sim, "Own mine");
          damageHero(sim, 28);
        } else {
          car.hp -= 28;
          car.speed *= 0.25;
          car.spin = 0.7;
          car.flash = 0.3;
          sim.score += 30;
          if (car.hp <= 0) killAI(sim, car);
        }
        break;
      }
    }
  }
}

export function step(sim: Sim, dt: number) {
  if (sim.phase !== "playing") return;
  if (sim.hitstop > 0) {
    sim.hitstop -= dt;
    return;
  }
  sim.time += dt;
  sim.toastT = Math.max(0, sim.toastT - dt);
  sim.scrapeCd = Math.max(0, sim.scrapeCd - dt);
  sim.trauma = Math.max(0, sim.trauma - dt * 1.5);

  const hero = sim.cars[0];
  ensureTrack(sim.track, hero.along + 800);
  trimTrack(sim.track, hero.along - 260);

  const input = readInput(sim);
  hero.invuln = Math.max(0, hero.invuln - dt);
  sim.idleT = Math.abs(hero.speed) < 6 ? sim.idleT + dt : 0;
  if (hero.alive) drive(sim, hero, input, dt, false);
  sim.prevMine = input.mine;
  if (sim.phase !== "playing") return;

  for (let i = 1; i < sim.cars.length; i++) {
    const car = sim.cars[i];
    if (car.alive) stepEnemy(sim, car, dt);
  }
  separate(sim);
  stepShots(sim, dt);
  stepMines(sim, dt);
  if (sim.phase === "playing") stepWaves(sim, dt);
}

export function formatTime(t: number) {
  if (!Number.isFinite(t) || t < 0) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}
