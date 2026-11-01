import { test } from "node:test";
import assert from "node:assert/strict";
import { poseAt } from "../../src/game/road.ts";
import {
  GAP_DNF,
  GAP_DNF_HOLD,
  GAP_WARN,
  GAP_WARN_HOLD,
  PACK_HELD_BONUS,
  PACE_SPEED,
  RACE_DIST,
  RACE_HOLD_TOAST,
  begin,
  createSim,
  step,
} from "../../src/game/sim.ts";

const dt = 1 / 60;

function quiet(stageId: string) {
  const sim = createSim();
  sim.stageId = stageId;
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set();
  return sim;
}

test("highway begin arms a 30 m/s pace; other stage ids do not", () => {
  assert.equal(PACE_SPEED, 30);
  assert.equal(GAP_WARN, 80);
  assert.equal(GAP_WARN_HOLD, 2);
  assert.equal(GAP_DNF, 140);
  assert.equal(GAP_DNF_HOLD, 3);
  assert.equal(RACE_DIST, 2200);
  assert.equal(PACK_HELD_BONUS, 800);

  const highway = createSim();
  highway.stageId = "highway";
  begin(highway);
  assert.equal(highway.toast, RACE_HOLD_TOAST);
  assert.equal(highway.race.armed, true);
  assert.equal(highway.lull, 2.2);
  const origin = highway.cars[0].along;
  assert.equal(highway.race.paceAlong, origin);
  assert.equal(highway.race.originAlong, origin);
  highway.lull = 1e9;
  highway.keysOverride = new Set();
  for (let i = 0; i < 120; i++) step(highway, dt);
  const moved = highway.race.paceAlong - origin;
  assert.ok(Math.abs(moved - PACE_SPEED * 2) < 1e-4, `pace moved ${moved}`);
  const gap = highway.cars[0].along - highway.race.paceAlong;
  assert.ok(gap < -50 && gap > -70, `gap ${gap}`);
  assert.equal(highway.phase, "playing");

  for (const id of ["", "city", "classic", "coast", "woods", "port", "pass"]) {
    const sim = createSim();
    sim.stageId = id;
    begin(sim);
    assert.equal(sim.toast, "Hunters inbound. Survive.", id);
    assert.equal(sim.race.armed, false, id);
    assert.equal(sim.lull, 2.2, id);
    sim.lull = 1e9;
    sim.keysOverride = new Set();
    for (let i = 0; i < 60 * 8; i++) step(sim, dt);
    assert.equal(sim.phase, "playing", id);
    assert.notEqual(sim.toast, "Fell behind the pack", id);
    assert.notEqual(sim.toast, "Pack held", id);
  }
});

test("highway DNF when gap stays below -140 for at least 3s of sim time", () => {
  const sim = quiet("highway");
  let sawWarn = false;
  while (sim.phase === "playing" && sim.time < 20) {
    step(sim, dt);
    if (sim.phase === "playing" && (sim.race.warning || sim.toast === "Falling behind")) sawWarn = true;
  }
  assert.equal(sawWarn, true);
  assert.equal(sim.phase, "finished");
  assert.equal(sim.toast, "Fell behind the pack");
  assert.equal(sim.result?.reason, "Fell behind the pack");
  assert.ok(sim.race.dnfT >= GAP_DNF_HOLD, `dnfT ${sim.race.dnfT}`);
  assert.ok(sim.race.dnfT < GAP_DNF_HOLD + dt + 1e-6, `dnfT ${sim.race.dnfT}`);
  const gap = sim.cars[0].along - sim.race.paceAlong;
  assert.ok(gap < -GAP_DNF, `gap ${gap}`);
  // Banking uses the same finished result; no extra score penalty.
  assert.equal(sim.result?.score, Math.round(sim.score));
  assert.ok((sim.result?.score ?? 1) < PACK_HELD_BONUS);
});

test("gap timers reset once the hero is back above the threshold", () => {
  const sim = quiet("highway");
  while (sim.phase === "playing" && !sim.race.warning && sim.time < 20) step(sim, dt);
  assert.equal(sim.race.warning, true);
  assert.ok(sim.race.warnT >= GAP_WARN_HOLD);
  const hero = sim.cars[0];
  const p = poseAt(sim.track, sim.race.paceAlong + 40);
  hero.x = p.x;
  hero.y = p.y;
  hero.z = p.z;
  hero.along = p.s;
  hero.speed = 0;
  hero.lat = 0;
  step(sim, dt);
  assert.equal(sim.phase, "playing");
  assert.equal(sim.race.warnT, 0);
  assert.equal(sim.race.dnfT, 0);
  assert.equal(sim.race.warning, false);
  const gap = hero.along - sim.race.paceAlong;
  assert.ok(gap > -GAP_WARN, `gap ${gap}`);
});

test("highway packs held at 2200 m of hero along-delta and pays +800 once", () => {
  const sim = quiet("highway");
  const hero = sim.cars[0];
  sim.race.originAlong = hero.along - RACE_DIST;
  const before = sim.score;
  step(sim, dt);
  assert.equal(sim.phase, "finished");
  assert.equal(sim.toast, "Pack held");
  assert.equal(sim.result?.reason, "Pack held");
  assert.equal(sim.score, before + PACK_HELD_BONUS);
  assert.equal(sim.result?.score, Math.round(before + PACK_HELD_BONUS));
  const locked = sim.score;
  step(sim, dt);
  assert.equal(sim.score, locked);
  assert.equal(sim.phase, "finished");
});
