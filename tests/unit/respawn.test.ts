// LEVELS/RACE_RESPAWNS.md v1.0 — §6 constants and the §7 ten checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { poseAt } from "../../src/game/road.ts";
import {
  DIFFICULTY, ELIM_BONUS, KILL_DECAY, RESPAWNS, RESPAWN_BACK, RESPAWN_DELAY, RESPAWN_HERO_BACK, RESPAWN_INVULN, RESPAWN_MAX_BACK,
  RESPAWN_SPEED, RESPAWN_STAGGER, SPARE_PRICE, raceKillScore, respawnBudget, respawnCandidates,
} from "../../src/game/respawn.ts";
import { LIVES, begin, createSim, debugKill, debugResetCar, debugSpawn, raceStandings, step, type Sim } from "../../src/game/sim.ts";
import { bankFinish, buyUpgrade, emptyShop, racePayout, shopMaxed, shopPrice } from "../../src/game/shop.ts";

const dt = 1 / 60;
type Car = Sim["cars"][number];

function race(stageId = "highway", shop = emptyShop()) {
  const sim = createSim();
  sim.stageId = stageId;
  sim.shop = shop;
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set();
  return sim;
}
const rivals = (sim: Sim) => sim.cars.filter((c) => c.racer);
function put(sim: Sim, car: Car, along: number) {
  const p = poseAt(sim.track, along);
  car.x = p.x + p.rx * car.lane;
  car.y = p.y;
  car.z = p.z + p.rz * car.lane;
  car.along = p.s;
  car.lastAlong = p.s;
}
/** step until pred() or the time limit; returns the sim seconds that passed */
function until(sim: Sim, pred: () => boolean, limit: number) {
  const t0 = sim.time;
  while (!pred() && sim.time - t0 < limit && sim.phase === "playing") step(sim, dt);
  return sim.time - t0;
}

test("§6 constants", () => {
  assert.deepEqual(RESPAWNS, { easy: 3, normal: 4, hard: 6 });
  assert.equal(DIFFICULTY, "normal");
  assert.equal(RESPAWN_DELAY, 2.0);
  assert.equal(RESPAWN_STAGGER, 1.0);
  assert.equal(RESPAWN_BACK, 40);
  assert.equal(RESPAWN_HERO_BACK, 60);
  assert.equal(RESPAWN_MAX_BACK, 120);
  assert.equal(RESPAWN_SPEED, 22);
  assert.equal(RESPAWN_INVULN, 1.5);
  assert.deepEqual([...KILL_DECAY], [1, 0.5, 0.25]);
  assert.equal(ELIM_BONUS, 100);
  assert.deepEqual([...SPARE_PRICE], [80, 140]);
  // §1 budget never below the hero's starting lives; difficulty table is the hook
  assert.equal(respawnBudget(3), 4);
  assert.equal(respawnBudget(5), 5);
  assert.equal(respawnBudget(3, "easy"), 3);
  assert.equal(respawnBudget(5, "easy"), 5);
  assert.equal(respawnBudget(3, "hard"), 6);
  // §2 search: first point never ahead of the hero, then 20 m steps up to 120 m back
  assert.deepEqual(respawnCandidates(1000, 1000), [960, 940, 920, 900, 880, 860, 840]);
  assert.deepEqual(respawnCandidates(1000, 1100).slice(0, 2), [1040, 1020]);
  assert.equal(respawnCandidates(1500, 1000)[0], 1000);
});

test("§7.1 a killed rival respawns 2.0 s later, at or behind max(deathAlong−40, hero.along−60), speed 22, invuln 1.5", () => {
  const sim = race();
  const a = rivals(sim)[0];
  until(sim, () => false, 1);
  const deathAlong = a.along;
  const t0 = sim.time;
  assert.ok(debugKill(sim, a));
  assert.ok(!a.alive && a.pending);
  assert.equal(a.respawnsLeft, 3);
  until(sim, () => a.alive, 5);
  assert.ok(a.alive);
  assert.ok(Math.abs(sim.time - t0 - RESPAWN_DELAY) <= dt + 1e-9, `respawned after ${(sim.time - t0).toFixed(3)} s`);
  const hero = sim.cars[0];
  const log = sim.respawnLog.at(-1)!;
  assert.ok(log.s <= Math.max(deathAlong - 40, log.heroS - 60) + 1e-6, `s ${log.s.toFixed(1)} death ${deathAlong.toFixed(1)} hero ${log.heroS.toFixed(1)}`);
  assert.ok(log.s <= log.heroS + 1e-6);
  assert.equal(a.speed, RESPAWN_SPEED);
  assert.equal(a.invuln, RESPAWN_INVULN);
  assert.ok(hero.alive);
});

test("§7.2 kill A five times on Normal: 4 respawns, then eliminated and dropped from placing", () => {
  const sim = race();
  const a = rivals(sim)[0];
  for (let k = 0; k < 5; k++) {
    until(sim, () => a.alive && a.invuln <= 0, 6);
    assert.ok(debugKill(sim, a), `kill ${k + 1}`);
  }
  assert.ok(a.eliminated);
  assert.ok(!a.pending);
  assert.equal(sim.respawnLog.filter((r) => r.id === a.id).length, 4);
  until(sim, () => false, 3);
  assert.ok(!a.alive, "an eliminated car never comes back");
  // placing: put A's corpse far ahead; it must not count
  a.along = sim.cars[0].along + 500;
  a.deathAlong = a.along;
  const hero = sim.cars[0];
  const ahead = rivals(sim).filter((c) => c !== a && c.alive && c.along > hero.along).length;
  assert.equal(raceStandings(sim).place, ahead + 1);
});

test("§7.3 hero parked, kill all 6 once: one passes the hero within 15 s and place > 1", () => {
  const sim = race();
  until(sim, () => false, 1);
  for (const c of rivals(sim)) debugKill(sim, c);
  assert.equal(raceStandings(sim).place, 1 + rivals(sim).filter((c) => c.deathAlong > sim.cars[0].along).length);
  let passed = false;
  let place = 1;
  const hero = sim.cars[0];
  until(sim, () => {
    hero.speed = Math.min(hero.speed, 22); // parked = the scroll floor, no throttle
    for (const c of rivals(sim)) if (c.alive && c.along > hero.along + 5 && sim.respawnLog.some((r) => r.id === c.id)) passed = true;
    place = raceStandings(sim).place;
    return passed && place > 1;
  }, 15);
  assert.ok(passed, "a respawned rival passed the parked hero");
  assert.ok(place > 1, `place ${place}`);
});

test("§7.4 during the respawn delay the place count still includes the dead rival", () => {
  const sim = race();
  const hero = sim.cars[0];
  const a = rivals(sim).reduce((x, y) => (x.along > y.along ? x : y)); // the leader, ~110 m up the road
  const before = raceStandings(sim).place;
  debugKill(sim, a);
  assert.equal(raceStandings(sim).place, before);
  until(sim, () => false, 1.0);
  assert.ok(!a.alive && a.pending);
  const aliveAhead = rivals(sim).filter((c) => c.alive && c.along > hero.along).length;
  const deadAhead = a.deathAlong > hero.along ? 1 : 0;
  assert.equal(deadAhead, 1, "A died ahead of the hero and the hero has not reached that point");
  assert.equal(raceStandings(sim).place, 1 + aliveAhead + deadAhead);
});

test("§7.5 kill score for the same tier-1 car: 100, 50, 25, 25, 25 + 100 elimination", () => {
  assert.deepEqual([0, 1, 2, 3].map((n) => raceKillScore(1, n, false, false)), [100, 50, 25, 25]);
  assert.equal(raceKillScore(1, 4, false, true), 125);
  const sim = race();
  const a = rivals(sim).find((c) => c.kind === "rammer")!;
  const got: number[] = [];
  for (let k = 0; k < 5; k++) {
    until(sim, () => a.alive && a.invuln <= 0, 6);
    const s0 = sim.score;
    debugKill(sim, a);
    got.push(sim.score - s0);
  }
  assert.deepEqual(got, [100, 50, 25, 25, 125]);
  assert.equal(sim.takedowns, 5);
  assert.match(sim.toast, /eliminated/);
});

test("§7.6 an off-road or bridge-gap reset of a rival leaves its budget unchanged", () => {
  const sim = race();
  const a = rivals(sim)[1];
  until(sim, () => false, 0.5);
  debugResetCar(sim, a, "offroad");
  debugResetCar(sim, a, "fall");
  assert.ok(a.alive);
  assert.equal(a.respawnsLeft, 4);
  assert.equal(a.kills, 0);
  assert.ok(!a.pending);
  assert.equal(sim.takedowns, 0);
});

test("§7.7 Spare 1 and 2: −80 then −140, ×5 lives, rival budget 5, lives bonus capped at 60", () => {
  assert.equal(shopPrice(emptyShop(), "spare"), 80);
  const b1 = buyUpgrade(emptyShop(), 300, "spare");
  assert.ok(b1.ok);
  assert.equal(b1.credits, 220);
  assert.equal(shopPrice(b1.shop, "spare"), 140);
  const b2 = buyUpgrade(b1.shop, b1.credits, "spare");
  assert.ok(b2.ok);
  assert.equal(b2.credits, 80);
  assert.equal(b2.shop.spareLives, 2);
  assert.ok(shopMaxed(b2.shop, "spare"));
  assert.equal(buyUpgrade(b2.shop, 999, "spare").ok, false);
  const sim = race("highway", b2.shop);
  assert.equal(sim.lives, LIVES + 2);
  assert.equal(sim.lives, 5);
  assert.equal(sim.rivalBudget, 5);
  for (const c of rivals(sim)) assert.equal(c.respawnsLeft, 5);
  assert.equal(racePayout(1, 5).livesBonus, 60);
});

test("§7.8 a 1st-place purse with 5 lives left banks 240, the same as with 3", () => {
  assert.equal(racePayout(1, 5).total, 240);
  assert.equal(racePayout(1, 3).total, 240);
  const r = { score: 5000, mode: "race" as const, reason: "1st", place: 1 };
  assert.equal(bankFinish(0, r, 5).gained, 240);
  assert.equal(bankFinish(0, r, 3).gained, 240);
});

test("§7.9 wave runs unchanged: no budget, no decay, no respawn", () => {
  const sim = race("classic");
  assert.equal(sim.race.armed, false);
  assert.equal(sim.rivalBudget, 0);
  const got: number[] = [];
  for (let k = 0; k < 3; k++) {
    const c = debugSpawn(sim, "rammer", 40)!;
    const s0 = sim.score;
    debugKill(sim, c);
    got.push(sim.score - s0);
    assert.ok(!c.pending && !c.eliminated);
  }
  assert.deepEqual(got, [100, 100, 100]);
  until(sim, () => false, 3);
  assert.equal(sim.respawnLog.length, 0);
});

test("§7.10 never more than one respawn per 1.0 s, and none ahead of the hero", () => {
  for (const stage of ["highway", "coast", "city"]) {
    const sim = race(stage);
    until(sim, () => false, 1);
    // three rounds of killing the whole field at once
    for (let round = 0; round < 3; round++) {
      until(sim, () => rivals(sim).every((c) => c.eliminated || (c.alive && c.invuln <= 0)), 12);
      for (const c of rivals(sim)) if (c.alive) debugKill(sim, c);
    }
    until(sim, () => rivals(sim).every((c) => !c.pending), 12);
    const log = sim.respawnLog;
    assert.ok(log.length >= 12, `${stage}: ${log.length} respawns`);
    for (let i = 1; i < log.length; i++) assert.ok(log[i].t - log[i - 1].t >= RESPAWN_STAGGER - 1e-6, `${stage}: stagger ${(log[i].t - log[i - 1].t).toFixed(3)}`);
    for (const r of log) assert.ok(r.s <= r.heroS + 1e-6, `${stage}: respawn ${r.s.toFixed(1)} ahead of hero ${r.heroS.toFixed(1)}`);
  }
});
