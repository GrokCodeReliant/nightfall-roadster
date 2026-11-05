import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BURST_SPEED,
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
  assert.ok(moved > rival.raceSpeed * dt, `moved ${moved}`);
  assert.ok(rival.speed > hero.speed + 20, `speed ${rival.speed} vs hero ${hero.speed}`);
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

test("a lined-up car bursts, rams once, and stays ahead at its own pace", () => {
  const sim = playing("highway");
  sim.keysOverride = new Set(["KeyS"]);
  const hero = sim.cars[0];
  hero.speed = SCROLL_MIN;
  hero.invuln = 0;
  const rival = sim.cars.find((c) => c.racer && c.alive);
  assert.ok(rival);
  for (const car of sim.cars) if (car.racer && car !== rival) car.alive = false;
  rival.lane = hero.lane;
  rival.along = hero.along - 6;
  rival.ramCd = 0;
  rival.fireCd = 8;
  const hp = hero.hp;
  let burst = false;
  let bumper = 0;
  let streak = 0;
  let worst = 0;
  for (let i = 0; i < 90; i++) {
    step(sim, dt);
    if (rival.speed >= BURST_SPEED - 1) burst = true;
    const gap = hero.along - rival.along;
    if (gap > 0 && gap < 5.5) {
      bumper += 1;
      streak += 1;
      worst = Math.max(worst, streak);
    } else streak = 0;
  }
  assert.equal(burst, true);
  assert.ok(rival.along > hero.along + 8, `ahead ${rival.along - hero.along}`);
  assert.equal(hero.hp, hp - REAR_RAM_HERO);
  assert.ok(Math.abs(rival.speed - rival.raceSpeed) < 1, `pace ${rival.speed}`);
  assert.ok(worst / 60 <= 0.5, `bumper streak ${worst / 60}`);
  assert.ok(bumper / 60 <= 0.5, `bumper ${bumper / 60}`);
  const held = hero.hp;
  for (let i = 0; i < 60; i++) step(sim, dt);
  assert.equal(hero.hp, held);
  assert.ok(rival.along > hero.along);
});

test("every car behind a braking hero passes within 1.5s", () => {
  const sim = playing("highway");
  sim.keysOverride = new Set(["KeyS"]);
  const hero = sim.cars[0];
  hero.speed = SCROLL_MIN;
  hero.hp = hero.maxHp = 500;
  const behind = sim.cars.filter((c) => c.racer && c.alive);
  assert.ok(behind.length >= 5);
  behind.forEach((car, i) => {
    car.lane = [-6, 6, -3, 3, 9, -9][i] ?? 6;
    car.along = hero.along - 6;
    car.ramCd = 2;
    car.fireCd = 8;
  });
  for (let i = 0; i < 90; i++) step(sim, dt);
  for (const car of behind) {
    assert.equal(car.alive, true);
    assert.ok(car.along > hero.along + 4, `${car.kind} gap ${car.along - hero.along}`);
  }
});

test("no race car sits in bumper range for more than half a second", () => {
  const sim = playing("highway");
  sim.keysOverride = new Set(["KeyS"]);
  const hero = sim.cars[0];
  hero.speed = SCROLL_MIN;
  hero.hp = hero.maxHp = 500;
  const field = sim.cars.filter((c) => c.racer && c.alive);
  field.forEach((car, i) => {
    car.lane = i === 0 ? hero.lane : [-6, 6, -3, 3, 9][i - 1];
    car.along = hero.along - (i === 0 ? 6 : 8 + i * 4);
    car.ramCd = 0;
    car.fireCd = 8;
  });
  const streak = new Map<number, number>();
  const worst = new Map<number, number>();
  for (let i = 0; i < 120; i++) {
    step(sim, dt);
    for (const car of field) {
      const gap = hero.along - car.along;
      const inBumper = gap > 0 && gap < 5.5;
      const next = inBumper ? (streak.get(car.id) ?? 0) + 1 : 0;
      streak.set(car.id, next);
      worst.set(car.id, Math.max(worst.get(car.id) ?? 0, next));
      if (inBumper) assert.ok(car.speed >= BURST_SPEED - 1, `id ${car.id} speed ${car.speed} gap ${gap}`);
    }
  }
  for (const car of field) {
    assert.ok((worst.get(car.id) ?? 0) / 60 <= 0.5, `id ${car.id} bumper ${(worst.get(car.id) ?? 0) / 60}`);
    assert.ok(car.along > hero.along, `id ${car.id} still behind`);
  }
});
