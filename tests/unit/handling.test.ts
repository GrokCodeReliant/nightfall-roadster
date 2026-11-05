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
  // M1 fixture change (Sara's call 2): boost was retuned on purpose (Roadster-only, 7.5 m hop cap,
  // float gravity, speed bonus 18->10), so held-Space frames can no longer match v0.1. Space is
  // dropped from the shared script; the new boost feel is locked in thrust.test.ts instead.
  [0.5, ["KeyW"]],
  [0.4, ["KeyW", "KeyF"]],
  [0.6, []],
  // H2 scroll-lock floors along-speed at 22, so a brake-to-stop no longer matches v0.1.
  // That floor is locked in scroll.test.ts. This tape stays in the band above 22.
];

function run(mod: typeof v1 | typeof v2, prep: (sim: any) => void): Frame[] {
  const sim: any = mod.createSim();
  mod.begin(sim);
  prep(sim);
  // Walls are road geometry, not handling (v0.1 circuit is 16 m and curved, v0.2 is 24 m):
  // open both roads up so the comparison isolates the car itself.
  sim.track.width = 1000;
  // H2 floors speed at 22 from a standstill, so the launch no longer matches v0.1.
  // Both cars are brought up to the Model 3 cap first; the tape below stays above that floor.
  sim.keysOverride = new Set(["KeyW"]);
  for (let i = 0; i < 180; i++) mod.step(sim, 1 / 60);
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
    // M2 fixture: Roadster stats (accel 34, topSpeed 52, handling 1.10) are a deliberate
    // divergence from v0.1. The lock stays on Model 3, the baseline row (48 / 24 / 1.0).
    // Track mode is off and Model 3 has no track toggle, so the scripted frames stay identical.
    sim.carId = "model3";
    sim.trackOn = false;
    v2.begin(sim);
    sim.lull = 1e9; // begin() arms the first wave; keep the comparison clear of hunters
    // Player default steerSens is 0.75. This lock is the v0.1 yaw rate, which is sensitivity 1.
    sim.steerSens = 1;
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
  assert.ok(maxSpeed > 40, `reached speed ${maxSpeed}`);
  // M1 fixture change: the "thrust lifted the car" sanity check moved to thrust.test.ts (no Space here now).
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
      // M1 fixture change: v0.2 touch has a Brake flag (non-boost cars); off here, so input is unchanged.
      // The default sim car is the Roadster (a booster), so Space/Shift still map to thrust as in v0.1.
      s2.touch = { ...s1.touch, brake: false };
      assert.deepEqual(v2.readInput(s2), v1.readInput(s1), c.join("+"));
    }
  }
});
