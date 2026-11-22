import { test } from "node:test";
import assert from "node:assert/strict";
import { poseAt } from "../../src/game/road.ts";
import { NIGHT_CITY } from "../../src/game/course.ts";
import { FIELD_DNF, RACE_DIST, begin, createSim, step, type Sim } from "../../src/game/sim.ts";
import { bankFinish, bankRun, creditsForScore, highwayPurse, shownPurse } from "../../src/game/shop.ts";

const dt = 1 / 60;

function quiet(stageId: string) {
  const sim = createSim();
  sim.stageId = stageId;
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set();
  return sim;
}

function finishFirst(stageId: string, dist: number) {
  const sim = quiet(stageId);
  const hero = sim.cars[0];
  for (const car of sim.cars) if (car.racer) car.alive = false;
  const p = poseAt(sim.track, sim.race.originAlong + dist + 5);
  hero.x = p.x;
  hero.y = p.y;
  hero.z = p.z;
  hero.along = p.s;
  hero.lastAlong = p.s;
  hero.speed = 0;
  step(sim, dt);
  return sim;
}

function fieldDnf(stageId: string) {
  const sim = quiet(stageId);
  while (sim.phase === "playing" && sim.time < 90) step(sim, dt);
  return sim;
}

test("Night City P1 banks exactly the purse + lives bonus the results card shows", () => {
  const sim = finishFirst("city", NIGHT_CITY.length);
  assert.equal(sim.phase, "finished");
  const r = sim.result!;
  assert.equal(r.mode, "race");
  assert.equal(r.place, 1);
  assert.equal(r.purse, 180);
  assert.equal(r.livesBonus, 60);
  const bank = bankFinish(10, r, sim.lives);
  assert.equal(shownPurse(r), 240);
  assert.equal(bank.gained, 240);
  assert.equal(bank.credits, 250);
  assert.notEqual(bank.gained, creditsForScore(r.score), "no longer the score path");
  assert.equal(bankFinish(bank.credits, r, sim.lives, true).gained, 0, "never banks twice");
});

test("Night City field DNF banks the shown 25, no lives bonus, like Open Highway", () => {
  const sim = fieldDnf("city");
  assert.equal(sim.phase, "finished");
  const r = sim.result!;
  assert.equal(r.reason, FIELD_DNF);
  assert.equal(r.place, 0);
  assert.equal(shownPurse(r), 25);
  assert.equal(bankFinish(0, r, sim.lives).gained, 25);
});

test("Night City out-of-lives DNF banks the shown 25", () => {
  const sim = quiet("city");
  sim.lives = 1;
  for (let i = 0; i < 4000 && sim.phase === "playing"; i++) {
    const h = sim.cars[0];
    if (h.alive) { h.invuln = 0; sim.up.shieldT = 0; h.hp = Math.min(h.hp, 0.01); }
    sim.race.dnfT = 0; // keep the field DNF out of it: this test is the lives-out path
    step(sim, dt);
  }
  assert.equal(sim.phase, "finished");
  const r = sim.result!;
  assert.equal(r.mode, "race");
  assert.equal(r.reason, "DNF");
  assert.equal(shownPurse(r), 25);
  assert.equal(bankFinish(0, r, sim.lives).gained, 25);
});

test("Open Highway banking is unchanged (same as the old highway bankRun path) and matches the card", () => {
  for (const sim of [finishFirst("highway", RACE_DIST), fieldDnf("highway")]) {
    const r = sim.result!;
    const old = bankRun(7, r.score, false, { highway: true, purse: highwayPurse(r), lives: sim.lives });
    const now = bankFinish(7, r, sim.lives);
    assert.deepEqual(now, old);
    assert.equal(now.gained, shownPurse(r));
  }
});

test("wave-mode runs still bank floor(score/10) and show no purse", () => {
  const r = { score: 537, mode: "waves" as const, wave: 3 };
  assert.equal(bankFinish(5, r, 0).gained, 53);
  assert.deepEqual(bankFinish(5, r, 0), bankRun(5, 537, false));
  assert.equal(shownPurse({}), null);
  const sim: Sim = quiet("classic");
  assert.equal(sim.race.armed, false);
});
