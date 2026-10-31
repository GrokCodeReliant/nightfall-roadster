import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOST_SPEED_CAP,
  CAR_IDS,
  CAR_STATS,
  MINE_DROP_BACK,
  applyFullyUpgraded,
  applyGamepad,
  begin,
  createSim,
  hasBoost,
  readInput,
  rollDeckHeight,
  step,
  type GamepadSample,
} from "../../src/game/sim.ts";

function flatSim(carId: string) {
  const sim = createSim();
  sim.carId = carId;
  begin(sim);
  sim.lull = 1e9;
  for (const s of sim.track.samples) {
    s.y = 0;
    s.gap = false;
    s.kicker = false;
  }
  sim.track.width = 1000;
  return sim;
}

const hold = (sim: ReturnType<typeof flatSim>, keys: string[], secs: number, each?: (h: (typeof sim.cars)[0]) => void) => {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    sim.keysOverride = new Set(keys);
    step(sim, 1 / 60);
    each?.(sim.cars[0]);
  }
};

function pad(axes: number[], pressed: number[]): GamepadSample {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  };
}

test("hasBoost is roadster-only after migrate", () => {
  for (const id of CAR_IDS) assert.equal(hasBoost(id), id === "roadster", id);
  assert.equal(hasBoost("roadster2026"), true);
  assert.equal(hasBoost("volt"), false);
  assert.equal(hasBoost("volt_r"), false);
  assert.equal(hasBoost("volt_rs"), false);
  assert.equal(CAR_STATS.model3.boost, false);
  assert.equal(CAR_STATS.roadster.topSpeed, 52);
});

test("non-Roadster: Space and Shift do not hop, thrust, or exceed that car's top speed", () => {
  for (const id of ["model3", "model_y", "model_x", "model_s", "cybertruck"] as const) {
    const sim = flatSim(id);
    let maxY = 0;
    let maxVy = 0;
    let maxThrust = 0;
    let maxV = 0;
    hold(sim, ["KeyW", "Space", "ShiftLeft", "ShiftRight"], 2.5, (h) => {
      maxY = Math.max(maxY, h.y);
      maxVy = Math.max(maxVy, h.vy);
      maxThrust = Math.max(maxThrust, h.thrust);
      maxV = Math.max(maxV, h.speed);
    });
    assert.equal(maxY, 0, `${id} hopped`);
    assert.equal(maxVy, 0, `${id} takeoff vy`);
    assert.equal(maxThrust, 0, `${id} thrust`);
    assert.ok(maxV <= CAR_STATS[id].topSpeed + 1e-6, `${id} speed ${maxV}`);
    assert.ok(maxV < BOOST_SPEED_CAP, `${id} reached the boost cap`);
    sim.keysOverride = null;
    sim.keys = new Set(["Space"]);
    sim.touch.thrust = true;
    sim.touch.brake = true;
    const input = readInput(sim);
    assert.equal(input.thrust, false, id);
    assert.equal(input.throttle, -1, id);
  }
});

test("rollDeckHeight stays on the collider and never hops above the bay", () => {
  assert.equal(rollDeckHeight(0, 1.2, null), 1.2);
  assert.equal(rollDeckHeight(0.2, 1.2, 0.8), 0.8);
  assert.equal(rollDeckHeight(0.4, 1.2, 5), 1.2);
  assert.equal(rollDeckHeight(0.4, 1.2, -0.4), 0);
  assert.equal(rollDeckHeight(0.9, 1.2, null), 1.2);
  assert.equal(rollDeckHeight(1, 1.2, 1.15), 1.15);
});

test("mine spawns at the press pose, just behind the car, and arms in place", () => {
  const sim = flatSim("model3");
  hold(sim, ["KeyW"], 0.4);
  sim.keysOverride = new Set(["KeyW", "KeyG"]);
  step(sim, 1 / 60);
  const hero = sim.cars[0];
  const mine = sim.mines.find((m) => m.alive);
  assert.ok(mine);
  const d = Math.hypot(mine.x - hero.x, mine.z - hero.z);
  assert.ok(Math.abs(d - MINE_DROP_BACK) < 1e-6, `drop ${d}`);
  assert.ok(d < 2.2);
  assert.ok(mine.arm <= 0.38 && mine.arm > 0.3, `arm ${mine.arm}`);
  assert.ok(mine.life > 8.9 && mine.life <= 9, `life ${mine.life}`);
  assert.equal(mine.alive, true);
  const x = mine.x;
  const z = mine.z;
  const arm0 = mine.arm;
  hold(sim, ["KeyW"], 0.12);
  assert.equal(mine.x, x);
  assert.equal(mine.z, z);
  assert.ok(mine.arm < arm0);
  assert.ok(mine.arm > 0);
});

test("xbox pad maps onto the existing verbs and does not clobber keysOverride", () => {
  const model3 = flatSim("model3");
  model3.keysOverride = null;
  model3.keys.clear();
  applyGamepad(model3, pad([1, -1], []));
  let input = readInput(model3);
  assert.ok(input.steer < -0.9, `steer ${input.steer}`);
  assert.ok(input.throttle > 0.9, `throttle ${input.throttle}`);

  applyGamepad(model3, pad([0.1, 0.1], []));
  input = readInput(model3);
  assert.equal(input.steer, 0);
  assert.equal(input.throttle, 0);

  applyGamepad(model3, pad([0, 0], [0, 1, 2]));
  input = readInput(model3);
  assert.equal(input.fire, true);
  assert.equal(input.mine, true);
  assert.equal(input.thrust, false);
  assert.equal(input.throttle, -1);

  applyGamepad(model3, pad([0, 0], [5, 7]));
  input = readInput(model3);
  assert.equal(input.mine, true);
  assert.equal(input.thrust, false);
  assert.equal(input.throttle, -1);

  const roadster = flatSim("roadster");
  roadster.keysOverride = null;
  roadster.keys.clear();
  applyGamepad(roadster, pad([0, 0], [2]));
  input = readInput(roadster);
  assert.equal(input.thrust, true);
  assert.equal(input.throttle, 0);

  const s = flatSim("model_s");
  s.keysOverride = null;
  s.keys.clear();
  applyGamepad(s, pad([0, 0], [3]));
  assert.equal(s.touchTrack, true);
  step(s, 1 / 60);
  assert.equal(s.trackOn, true);
  applyGamepad(s, pad([0, 0], [3]));
  step(s, 1 / 60);
  assert.equal(s.trackOn, true);
  applyGamepad(s, pad([0, 0], []));
  applyGamepad(s, pad([0, 0], [8]));
  step(s, 1 / 60);
  assert.equal(s.trackOn, false);

  const y = flatSim("model_y");
  y.keysOverride = null;
  applyGamepad(y, pad([0, 0], [3, 8]));
  step(y, 1 / 60);
  assert.equal(y.trackOn, false);

  const locked = flatSim("model3");
  locked.keysOverride = new Set(["KeyW"]);
  applyGamepad(locked, pad([1, 0], [0, 2, 3]));
  input = readInput(locked);
  assert.equal(input.steer, 0);
  assert.equal(input.throttle, 1);
  assert.equal(input.fire, false);
  assert.equal(input.thrust, false);
  assert.equal(locked.touchTrack, false);
});

test("Fully upgraded maxes today's hooks and survives begin()", () => {
  const sim = flatSim("model_y");
  applyFullyUpgraded(sim);
  const hero = sim.cars[0];
  assert.equal(sim.toast, "Fully upgraded");
  assert.equal(sim.up.armor, 100);
  assert.equal(sim.up.gun, 3);
  assert.equal(sim.up.rockets, 12);
  assert.equal(sim.up.reserve, 4);
  assert.equal(sim.up.cluster, true);
  assert.equal(sim.up.oilT, 20);
  assert.equal(sim.up.shieldT, 6);
  assert.equal(sim.up.magnetT, 15);
  assert.equal(hero.maxHp, CAR_STATS.model_y.maxHp + 100);
  assert.equal(hero.hp, hero.maxHp);
  assert.equal(hero.mines, CAR_STATS.model_y.mineCap);
  assert.equal(hero.maxFuel, 160);
  assert.equal(hero.fuel, 160);
  assert.equal(hero.rounds, 24);
  const snap = JSON.stringify(sim.up);
  applyFullyUpgraded(sim);
  assert.equal(JSON.stringify(sim.up), snap);
  assert.equal(hero.maxHp, CAR_STATS.model_y.maxHp + 100);
  begin(sim);
  assert.equal(sim.devFull, true);
  assert.equal(sim.up.armor, 100);
  assert.equal(sim.up.gun, 3);
  assert.equal(sim.cars[0].maxHp, CAR_STATS.model_y.maxHp + 100);
  assert.equal(sim.cars[0].maxFuel, 160);
  assert.equal(sim.cars[0].mines, CAR_STATS.model_y.mineCap);
});
