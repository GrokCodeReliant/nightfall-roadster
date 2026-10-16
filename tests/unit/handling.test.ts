/**
 * Handling lock: the v0.2 sim must drive EXACTLY like v0.1 (tests/fixtures/sim_v01.ts is the
 * untouched v0.1 source). Same scripted inputs through readInput() -> drive(), compared frame by
 * frame: speed, yaw, lateral slip, vertical speed, height, fuel, ammo regen, grounded, distance.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as v1 from "../fixtures/sim_v01.ts";
import * as v2 from "../../src/game/sim.ts";

type Frame = number[];
const script: [number, string[]][] = [
  [1.6, ["KeyW"]],
  [0.35, ["KeyW", "KeyA"]],
  [0.35, ["KeyW", "KeyD"]],
  [0.25, ["KeyW", "ArrowLeft"]],
  [0.25, ["KeyW", "ArrowRight"]],
  [0.5, ["KeyW", "Space"]],
  [0.4, ["KeyW", "KeyF"]],
  [0.6, []],
  [0.45, ["KeyS"]],
  [0.3, ["ArrowUp", "ShiftLeft"]],
];

function run(mod: typeof v1 | typeof v2, prep: (sim: any) => void): Frame[] {
  const sim: any = mod.createSim();
  mod.begin(sim);
  prep(sim);
  // Walls are road geometry, not handling (v0.1 circuit is 16 m and curved, v0.2 is 24 m):
  // open both roads up so the comparison isolates the car itself.
  sim.track.width = 1000;
  const hero = sim.cars[0];
  let path = 0;
  let px = hero.x;
  let pz = hero.z;
  const yaw0 = hero.yaw;
  const out: Frame[] = [];
  const dt = 1 / 60;
  for (const [secs, keys] of script) {
    sim.keysOverride = new Set(keys);
    for (let i = 0; i < Math.round(secs * 60); i++) {
      mod.step(sim, dt);
      path += Math.hypot(hero.x - px, hero.z - pz);
      px = hero.x;
      pz = hero.z;
      out.push([hero.speed, hero.yaw - yaw0, hero.lat, hero.vy, hero.y, hero.fuel, hero.rounds, hero.grounded ? 1 : 0, hero.thrust, path]);
    }
  }
  return out;
}

test("v0.2 driving is frame-identical to v0.1 (handling constants, input, thrust, fuel, guns)", () => {
  const a = run(v1, (sim) => {
    for (const s of sim.track.samples) {
      s.y = 0; // flatten v0.1's ramp/void so both cars drive the same flat open slab
      s.gap = false;
      s.kicker = false;
    }
    for (const c of sim.cars.slice(1)) {
      c.alive = false;
      c.respawnIn = 1e9;
      c.y = -40;
    }
  });
  const b = run(v2, (sim) => {
    sim.lull = 1e9; // no waves during the comparison
  });
  assert.equal(a.length, b.length);
  const names = ["speed", "yaw", "lat", "vy", "y", "fuel", "rounds", "grounded", "thrust", "path length"];
  for (let f = 0; f < a.length; f++) {
    for (let k = 0; k < names.length; k++) {
      const tol = 1e-9;
      assert.ok(Math.abs(a[f][k] - b[f][k]) <= tol, `frame ${f} ${names[k]}: v0.1=${a[f][k]} v0.2=${b[f][k]}`);
    }
  }
  // sanity: the script actually exercised the car
  const maxSpeed = Math.max(...a.map((r) => r[0]));
  const maxAir = Math.max(...a.map((r) => r[4]));
  assert.ok(maxSpeed > 40, `reached speed ${maxSpeed}`);
  assert.ok(maxAir > 1, `thrust lifted the car ${maxAir}`);
});

test("readInput maps the same keys as v0.1", () => {
  const combos = [["KeyA"], ["KeyD"], ["ArrowLeft"], ["ArrowRight"], ["KeyW"], ["KeyS"], ["ArrowUp"], ["ArrowDown"], ["KeyF"], ["KeyJ"], ["KeyG"], ["KeyQ"], ["Space"], ["ShiftLeft"], ["ShiftRight"], ["KeyW", "KeyA", "KeyF", "Space"]];
  const s1: any = v1.createSim();
  const s2: any = v2.createSim();
  for (const autoGas of [false, true]) {
    for (const c of combos) {
      s1.keys = new Set(c);
      s2.keys = new Set(c);
      s1.autoGas = s2.autoGas = autoGas;
      s1.touch = { steer: 0.3, throttle: 0, fire: false, mine: false, thrust: false };
      s2.touch = { ...s1.touch };
      assert.deepEqual(v2.readInput(s2), v1.readInput(s1), c.join("+"));
    }
  }
});
