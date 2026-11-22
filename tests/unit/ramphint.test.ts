import { test } from "node:test";
import assert from "node:assert/strict";
import { poseAt, yawFromDir } from "../../src/game/road.ts";
import { RAMP_HINT, RAMP_HINT_BOOST, RAMP_HINT_M, begin, createSim, step, type Sim } from "../../src/game/sim.ts";

function quiet(stageId: "coast" | "city") {
  const sim = createSim();
  sim.carId = "model3";
  sim.stageId = stageId;
  begin(sim);
  sim.keysOverride = new Set();
  for (const c of sim.cars) if (!c.hero) c.alive = false;
  sim.nextCrate = 1e9;
  sim.toastT = 0;
  return sim;
}
function plant(sim: Sim, raceS: number) {
  const car = sim.cars[0];
  const p = poseAt(sim.track, sim.race.originAlong + raceS);
  car.x = p.x; car.z = p.z; car.y = p.y; car.along = p.s; car.lastAlong = p.s; car.lane = 0;
  car.yaw = yawFromDir(p.tx, p.tz); car.speed = 30; car.vy = 0; car.lat = 0; car.grounded = true;
}
const hint = (sim: Sim) => sim.toastT > 0 && (sim.toast === RAMP_HINT || sim.toast === RAMP_HINT_BOOST);
const run = (sim: Sim, n: number) => { for (let i = 0; i < n; i++) step(sim, 1 / 60); };

test("ramp hint: window is short (150 m)", () => {
  assert.equal(RAMP_HINT_M, 150);
});

test("ramp hint: Coast shows it inside 150 m of CR-2, not 230 m out or mid-race", () => {
  const sim = quiet("coast");
  plant(sim, 470); // seawall, 230 m before CR-2 (700)
  run(sim, 10);
  assert.ok(!hint(sim), `no hint at 470 m (got "${sim.toast}" ${sim.toastT})`);
  plant(sim, 600); // 100 m before CR-2
  run(sim, 10);
  assert.ok(hint(sim), "hint 100 m before CR-2");
  plant(sim, 2470); // CR-8 pier, 230 m before CR-9 (2700): teleport clears the standing hint
  run(sim, 5);
  assert.ok(!hint(sim), `hint cleared at 2470 (got "${sim.toast}" ${sim.toastT})`);
  plant(sim, 2600);
  run(sim, 10);
  assert.ok(hint(sim), "hint 100 m before CR-9");
});

test("ramp hint: Night City start (500 m before NC-2) has no hint", () => {
  const sim = quiet("city");
  plant(sim, 60);
  run(sim, 30);
  assert.ok(!hint(sim), `no hint at NC 60 m (got "${sim.toast}" ${sim.toastT})`);
  plant(sim, 540); // 80 m before NC-2 (620)
  run(sim, 10);
  assert.ok(hint(sim), "hint 80 m before NC-2");
});
