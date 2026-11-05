import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REAR_RAM_HERO,
  REAR_RAM_SELF,
  SCROLL_MIN,
  begin,
  createSim,
  debugSpawn,
  step,
  type Sim,
} from "../../src/game/sim.ts";

const dt = 1 / 60;

function playing(stageId = "city") {
  const sim = createSim();
  sim.stageId = stageId;
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set();
  return sim;
}

function plant(sim: Sim, owner: number) {
  const hero = sim.cars[0];
  const mine = sim.mines[0];
  mine.alive = true;
  mine.owner = owner;
  mine.oil = false;
  mine.arm = 0;
  mine.life = 8;
  mine.fresh = false;
  mine.x = hero.x;
  mine.y = hero.y;
  mine.z = hero.z;
}

test("a mine hurts the hero and does not yaw or shove him", () => {
  for (const owner of [1, 0]) {
    const sim = playing();
    const hero = sim.cars[0];
    hero.invuln = 0;
    hero.spin = 0;
    hero.lat = 0;
    const yaw = hero.yaw;
    const hp = hero.hp;
    const speed = Math.max(hero.speed, SCROLL_MIN);
    hero.speed = speed;
    plant(sim, owner);
    sim.events.length = 0;
    sim.trauma = 0;
    sim.toastT = 0;
    step(sim, dt);
    assert.ok(hero.hp < hp, `owner ${owner} hp ${hero.hp}`);
    assert.equal(hero.hp, hp - (owner > 0 ? 22 : 28));
    assert.equal(hero.spin, 0);
    assert.ok(Math.abs(hero.yaw - yaw) < 0.05, `yaw ${hero.yaw - yaw}`);
    assert.ok(Math.abs(hero.lat) < 0.5, `lat ${hero.lat}`);
    assert.ok(hero.flash > 0 || sim.trauma > 0, "flash or shake");
    assert.ok(sim.events.some((e) => e.t === "hit"));
    if (owner === 0) assert.equal(sim.toast, "Own mine");
    assert.ok(hero.alive);
  }
});

test("a rival behind a slow hero keeps racing and does not pace-match", () => {
  const sim = playing("highway");
  const hero = sim.cars[0];
  hero.speed = SCROLL_MIN;
  const rival = sim.cars.find((c) => c.racer && c.alive);
  assert.ok(rival);
  rival.lane = hero.lane + 6;
  rival.along = hero.along - 30;
  rival.ramCd = 5;
  rival.fireCd = 5;
  const before = rival.along;
  step(sim, dt);
  const moved = rival.along - before;
  assert.ok(Math.abs(moved - rival.raceSpeed * dt) < 1e-4, `moved ${moved}`);
  assert.ok(rival.speed > hero.speed, `speed ${rival.speed} vs hero ${hero.speed}`);
});

test("a rival close behind bursts and rams the hero harder than itself", () => {
  const sim = playing("highway");
  const hero = sim.cars[0];
  hero.speed = SCROLL_MIN;
  hero.invuln = 0;
  hero.spin = 0;
  const yaw = hero.yaw;
  const rival = sim.cars.find((c) => c.racer && c.kind === "rammer");
  assert.ok(rival);
  rival.lane = hero.lane;
  rival.along = hero.along - 10;
  rival.ramCd = 0;
  rival.fireCd = 8;
  const heroHp = hero.hp;
  const rivalHp = rival.hp;
  let burst = false;
  for (let i = 0; i < 90; i++) {
    step(sim, dt);
    if (rival.speed > rival.raceSpeed + 8) burst = true;
    if (hero.hp < heroHp) break;
  }
  assert.equal(burst, true);
  assert.ok(hero.hp <= heroHp - REAR_RAM_HERO, `hero hp ${hero.hp}`);
  assert.ok(rival.hp <= rivalHp - REAR_RAM_SELF, `rival hp ${rival.hp}`);
  assert.ok(heroHp - hero.hp > rivalHp - rival.hp);
  assert.equal(hero.spin, 0);
  assert.ok(Math.abs(hero.lat) < 1, `lat ${hero.lat}`);
  assert.ok(Math.abs(hero.yaw - yaw) < 0.08, `yaw ${hero.yaw - yaw}`);
  assert.equal(rival.alive, true);
  assert.equal(hero.alive, true);
});

test("a hunter just behind a floored hero passes and does not hold the bumper", () => {
  const sim = playing("highway");
  sim.keysOverride = new Set(["KeyS"]);
  for (let i = 0; i < 30; i++) step(sim, dt);
  for (const car of sim.cars) if (!car.hero) car.alive = false;
  const hero = sim.cars[0];
  hero.speed = SCROLL_MIN;
  const foe = debugSpawn(sim, "rammer", -6, hero.lane);
  assert.ok(foe);
  assert.equal(foe.racer, false);
  let bumper = 0;
  const secs = 10;
  for (let i = 0; i < 60 * secs; i++) {
    step(sim, dt);
    const gap = hero.along - foe.along;
    if (gap > -1.5 && gap < 5.5) bumper += 1;
  }
  const ahead = foe.along - hero.along;
  assert.equal(foe.alive, true);
  assert.ok(ahead > 40, `ended ${ahead.toFixed(1)} m ahead`);
  assert.ok(bumper / 60 < 1.5, `bumper ${(bumper / 60).toFixed(2)} s`);
  assert.ok(foe.speed > SCROLL_MIN + 6, `speed ${foe.speed}`);
});
