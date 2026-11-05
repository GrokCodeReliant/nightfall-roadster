import { test } from "node:test";
import assert from "node:assert/strict";
import { poseAt } from "../../src/game/road.ts";
import {
  FIELD_DNF,
  GAP_DNF,
  GAP_DNF_HOLD,
  GAP_WARN,
  GAP_WARN_HOLD,
  PACE_SPEED,
  PLACE_NAME,
  RACE_DIST,
  RACE_FIELD_TOAST,
  RACE_HP,
  RIVAL_COUNT,
  RIVAL_OFFSETS,
  RIVAL_SPEED,
  RIVAL_SPEEDS,
  SCROLL_MIN,
  begin,
  createSim,
  raceStandings,
  step,
  type Sim,
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

function rivals(sim: Sim) {
  return sim.cars.filter((c) => c.racer && c.alive);
}

function put(sim: Sim, car: Sim["cars"][number], along: number) {
  const p = poseAt(sim.track, along);
  car.x = p.x + p.rx * car.lane;
  car.y = p.y;
  car.z = p.z + p.rz * car.lane;
  car.along = p.s;
  car.lastAlong = p.s;
  car.speed = car.hero ? 0 : car.raceSpeed;
}

test("highway begin arms the race field and a 30 m/s pace; other stages do not", () => {
  assert.equal(PACE_SPEED, 30);
  assert.equal(RIVAL_SPEED, 30);
  assert.equal(RIVAL_COUNT, 6);
  assert.equal(RACE_HP, 160);
  assert.deepEqual(RIVAL_OFFSETS, [-36, -10, 18, 42, 72, 110]);
  assert.deepEqual(RIVAL_SPEEDS, [29, 32, 30, 34, 28, 33]);
  assert.equal(GAP_WARN, 80);
  assert.equal(GAP_WARN_HOLD, 2);
  assert.equal(GAP_DNF, 140);
  assert.equal(GAP_DNF_HOLD, 3);
  assert.equal(RACE_DIST, 2200);
  assert.deepEqual(PLACE_NAME, ["", "1st", "2nd", "3rd", "4th"]);

  const highway = createSim();
  highway.stageId = "highway";
  begin(highway);
  assert.equal(highway.toast, RACE_FIELD_TOAST);
  assert.equal(highway.race.armed, true);
  assert.equal(highway.lull, 2.2);
  const origin = highway.cars[0].along;
  assert.equal(highway.race.paceAlong, origin);
  assert.equal(highway.race.originAlong, origin);
  const field = rivals(highway);
  assert.equal(field.length, RIVAL_COUNT);
  const offs = field.map((c) => c.along - origin).sort((a, b) => a - b);
  RIVAL_OFFSETS.forEach((off, i) => assert.ok(Math.abs(offs[i] - off) < 1, `offs ${offs}`));
  const speeds = field.map((c) => c.raceSpeed).sort((a, b) => a - b);
  assert.deepEqual(speeds, [...RIVAL_SPEEDS].sort((a, b) => a - b));
  assert.ok(field.every((c) => c.hp === RACE_HP && c.maxHp === RACE_HP));
  assert.ok(field.every((c) => c.kind === "rammer" || c.kind === "gunner"));
  assert.equal(raceStandings(highway).place, 5);
  assert.equal(highway.cars.filter((c) => c.alive && !c.hero && !c.racer).length, 0);

  highway.lull = 1e9;
  highway.keysOverride = new Set();
  for (let i = 0; i < 120; i++) step(highway, dt);
  const moved = highway.race.paceAlong - origin;
  assert.ok(Math.abs(moved - PACE_SPEED * 2) < 1e-4, `pace moved ${moved}`);
  const gap = highway.cars[0].along - highway.race.paceAlong;
  assert.ok(highway.cars[0].speed >= SCROLL_MIN - 1e-6, `speed ${highway.cars[0].speed}`);
  // Scroll-lock keeps the hero at >= 22 m/s, so the 30 m/s pace only pulls away at ~8 m/s.
  assert.ok(gap < -12 && gap > -24, `gap ${gap}`);
  assert.equal(highway.phase, "playing");
  assert.equal(highway.wave, 0);

  for (const id of ["", "city", "classic", "coast", "woods", "port", "pass"]) {
    const sim = createSim();
    sim.stageId = id;
    begin(sim);
    assert.equal(sim.toast, "Hunters inbound. Survive.", id);
    assert.equal(sim.race.armed, false, id);
    assert.equal(sim.lull, 2.2, id);
    assert.equal(rivals(sim).length, 0, id);
    sim.lull = 1e9;
    sim.keysOverride = new Set();
    for (let i = 0; i < 60 * 8; i++) step(sim, dt);
    assert.equal(sim.phase, "playing", id);
    assert.notEqual(sim.toast, FIELD_DNF, id);
    assert.notEqual(sim.toast, "1st", id);
    assert.equal(rivals(sim).length, 0, id);
  }
});

test("braking hero stays on the scroll pace; faster rivals still pull ahead", () => {
  const sim = quiet("highway");
  const origin = sim.race.originAlong;
  const field = rivals(sim);
  const started = field.map((c) => ({ car: c, along: c.along, speed: c.raceSpeed }));
  assert.equal(raceStandings(sim).place, 5);
  sim.keysOverride = new Set(["KeyS"]);
  const secs = 9;
  for (let i = 0; i < 60 * secs; i++) step(sim, dt);
  assert.equal(sim.phase, "playing");
  assert.equal(sim.wave, 0);
  assert.equal(sim.queue.length, 0);
  assert.equal(sim.cars.filter((c) => c.alive && !c.hero && !c.racer).length, 0);
  assert.ok(sim.cars[0].speed >= SCROLL_MIN - 1e-6, `speed ${sim.cars[0].speed}`);
  const heroMoved = sim.cars[0].along - origin;
  assert.ok(heroMoved > SCROLL_MIN * (secs - 0.4), `hero moved ${heroMoved}`);
  for (const row of started) {
    assert.equal(row.car.alive, true);
    const moved = row.car.along - row.along;
    // Cruise is the floor. A rival that catches the hero from behind may burst past it.
    assert.ok(moved >= row.speed * secs - 0.05, `rival moved ${moved} expected at least ${row.speed * secs}`);
  }
  assert.equal(raceStandings(sim).place, RIVAL_COUNT + 1);
  assert.ok(raceStandings(sim).leaderGap > 60);
});

test("a rival in the cone fires once and keeps its cruise speed", () => {
  const sim = quiet("highway");
  const hero = sim.cars[0];
  const rival = rivals(sim)[0];
  rival.lane = hero.lane;
  rival.fireCd = 0;
  rival.ramCd = 10;
  rival.along = hero.along + 5;
  const before = rival.along;
  const speed = rival.raceSpeed;
  sim.events.length = 0;
  step(sim, dt);
  assert.equal(sim.phase, "playing");
  assert.ok(Math.abs(rival.along - before - speed * dt) < 1e-6, `moved ${rival.along - before}`);
  assert.equal(sim.events.filter((e) => e.t === "eshot").length, 1);
  assert.ok(rival.fireCd > 3);
  sim.events.length = 0;
  const mid = rival.along;
  step(sim, dt);
  assert.equal(sim.events.filter((e) => e.t === "eshot").length, 0);
  assert.ok(Math.abs(rival.along - mid - speed * dt) < 1e-6);
  assert.equal(rival.alive, true);
});

test("killing a rival drops them out of the field with no respawn", () => {
  const sim = quiet("highway");
  const field = rivals(sim);
  const victim = field.reduce((a, b) => (a.along > b.along ? a : b));
  const score = sim.score;
  const before = raceStandings(sim).place;
  victim.hp = 0;
  step(sim, dt);
  assert.equal(victim.alive, false);
  assert.ok(sim.score > score, "glory score still counts");
  assert.equal(sim.takedowns, 1);
  assert.equal(raceStandings(sim).place, before - 1);
  for (let i = 0; i < 120; i++) step(sim, dt);
  assert.equal(victim.alive, false);
  assert.equal(rivals(sim).length, RIVAL_COUNT - 1);
  assert.equal(sim.wave, 0);
  assert.equal(sim.cars.filter((c) => c.alive && !c.hero && !c.racer).length, 0);
});

test("highway DNF when the hero stays 140 m behind the last living rival for 3s", () => {
  const sim = quiet("highway");
  let sawWarn = false;
  while (sim.phase === "playing" && sim.time < 45) {
    step(sim, dt);
    if (sim.phase === "playing" && (sim.race.warning || sim.toast === "Falling behind")) sawWarn = true;
  }
  assert.equal(sawWarn, true);
  assert.equal(sim.phase, "finished");
  assert.equal(sim.toast, FIELD_DNF);
  assert.equal(sim.result?.reason, FIELD_DNF);
  assert.equal(sim.result?.place, 0);
  assert.equal(sim.result?.purse, 25);
  assert.equal(sim.result?.livesBonus, 0);
  assert.equal(sim.lives, 3);
  assert.ok(sim.race.dnfT >= GAP_DNF_HOLD, `dnfT ${sim.race.dnfT}`);
  assert.ok(sim.race.dnfT < GAP_DNF_HOLD + dt + 1e-6, `dnfT ${sim.race.dnfT}`);
  const gap = sim.cars[0].along - sim.race.paceAlong;
  assert.ok(gap < -GAP_DNF, `pace gap ${gap}`);
  const last = Math.min(...rivals(sim).map((c) => c.along));
  assert.ok(sim.cars[0].along - last < -GAP_DNF, `field gap ${sim.cars[0].along - last}`);
  assert.equal(sim.result?.score, Math.round(sim.score));
});

test("gap timers reset once the hero is back above the threshold", () => {
  const sim = quiet("highway");
  while (sim.phase === "playing" && !sim.race.warning && sim.time < 45) step(sim, dt);
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
  const gap = hero.along - fieldLast(sim);
  assert.ok(gap > -GAP_WARN, `gap ${gap}`);
});

test("highway finish freezes place from living rivals and does not add a pack score bonus", () => {
  const sim = quiet("highway");
  const hero = sim.cars[0];
  const origin = sim.race.originAlong;
  const before = sim.score;
  for (const car of rivals(sim)) car.alive = false;
  put(sim, hero, origin + RACE_DIST + 5);
  step(sim, dt);
  assert.equal(sim.phase, "finished");
  assert.equal(sim.toast, "1st");
  assert.equal(sim.result?.reason, "1st");
  assert.equal(sim.result?.place, 1);
  assert.equal(sim.result?.purse, 180);
  assert.equal(sim.result?.livesBonus, 60);
  assert.equal(sim.score, before);
  assert.equal(sim.result?.score, Math.round(before));
  const locked = sim.score;
  step(sim, dt);
  assert.equal(sim.score, locked);
  assert.equal(sim.phase, "finished");
});

test("place at the line is 2nd, 3rd, or 4th from living rivals only", () => {
  const finishAt = (ahead: number) => {
    const sim = quiet("highway");
    const hero = sim.cars[0];
    const origin = sim.race.originAlong;
    const field = rivals(sim).sort((a, b) => a.along - b.along);
    put(sim, hero, origin + RACE_DIST + 5);
    field.forEach((car, i) => {
      const lead = i >= field.length - ahead;
      put(sim, car, origin + RACE_DIST + (lead ? 80 + i * 40 : -400));
    });
    const score = sim.score;
    step(sim, dt);
    return { sim, score };
  };
  const second = finishAt(1);
  assert.equal(second.sim.result?.place, 2);
  assert.equal(second.sim.result?.reason, "2nd");
  assert.equal(second.sim.result?.purse, 120);
  assert.equal(second.sim.result?.livesBonus, 60);
  assert.equal(second.sim.score, second.score);
  const third = finishAt(2);
  assert.equal(third.sim.result?.place, 3);
  assert.equal(third.sim.result?.reason, "3rd");
  assert.equal(third.sim.result?.purse, 70);
  const fourth = finishAt(3);
  assert.equal(fourth.sim.result?.place, 4);
  assert.equal(fourth.sim.result?.reason, "4th");
  assert.equal(fourth.sim.result?.purse, 40);
  assert.equal(fourth.sim.result?.livesBonus, 60);
});

test("highway wreck before the line is a DNF with no lives bonus", () => {
  const sim = quiet("highway");
  const hero = sim.cars[0];
  sim.lives = 1;
  hero.hp = 1;
  const rival = rivals(sim).find((c) => c.kind === "rammer");
  assert.ok(rival);
  rival.ramCd = 0;
  rival.lane = hero.lane;
  rival.along = hero.along;
  rival.raceSpeed = 30;
  step(sim, dt);
  assert.equal(sim.phase, "finished");
  assert.equal(sim.result?.reason, "DNF");
  assert.equal(sim.result?.place, 0);
  assert.equal(sim.result?.purse, 25);
  assert.equal(sim.result?.livesBonus, 0);
  assert.equal(sim.lives, 0);
});

function fieldLast(sim: Sim) {
  const alive = rivals(sim);
  if (!alive.length) return sim.race.paceAlong;
  return Math.min(...alive.map((c) => c.along));
}
