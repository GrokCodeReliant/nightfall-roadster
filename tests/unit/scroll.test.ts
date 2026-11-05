import { test } from "node:test";
import assert from "node:assert/strict";
import { poseAt, queryTrack, yawFromDir } from "../../src/game/road.ts";
import {
  OFFROAD_BACK,
  OFFROAD_INVULN,
  OFFROAD_M,
  OFFROAD_T,
  SCROLL_MIN,
  WALL_SLIDE,
  begin,
  createSim,
  step,
} from "../../src/game/sim.ts";

const dt = 1 / 60;

function playing(carId = "model3") {
  const sim = createSim();
  sim.carId = carId;
  sim.stageId = "highway";
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set();
  return sim;
}

function plant(sim: ReturnType<typeof playing>, lateral: number, yawOff = 0, speed = 36) {
  const hero = sim.cars[0];
  const p = poseAt(sim.track, hero.along);
  hero.x = p.x + p.rx * lateral;
  hero.z = p.z + p.rz * lateral;
  hero.y = p.y;
  hero.yaw = yawFromDir(p.tx, p.tz) + yawOff;
  hero.speed = speed;
  hero.lat = 0;
  hero.grounded = true;
  hero.invuln = 0;
  hero.offT = 0;
  hero.slideT = 0;
  hero.alive = true;
  return hero;
}

test("scroll-lock constants match the locked H2 defaults", () => {
  assert.equal(SCROLL_MIN, 22);
  assert.equal(OFFROAD_M, 6);
  assert.equal(OFFROAD_T, 0.85);
  assert.equal(OFFROAD_INVULN, 1);
  assert.ok(OFFROAD_BACK <= 15 && OFFROAD_BACK > 0);
  assert.ok(WALL_SLIDE >= 0.15 && WALL_SLIDE <= 0.35);
});

test("brake and reverse cannot drop along-speed under SCROLL_MIN, and throttle still goes faster", () => {
  const sim = playing("cybertruck");
  const hero = sim.cars[0];
  const lives = sim.lives;
  const hp = hero.hp;
  sim.keysOverride = new Set(["KeyS"]);
  let min = Infinity;
  for (let i = 0; i < 90; i++) {
    step(sim, dt);
    min = Math.min(min, hero.speed);
  }
  assert.ok(min >= SCROLL_MIN - 1e-6, `brake min ${min}`);
  assert.equal(sim.lives, lives);
  assert.equal(hero.hp, hp);

  sim.keysOverride = new Set(["ArrowDown"]);
  for (let i = 0; i < 30; i++) step(sim, dt);
  assert.ok(hero.speed >= SCROLL_MIN - 1e-6, `reverse ${hero.speed}`);

  sim.keysOverride = new Set(["KeyW"]);
  for (let i = 0; i < 180; i++) step(sim, dt);
  assert.ok(hero.speed > SCROLL_MIN + 8, `throttle ${hero.speed}`);
});

test("a slow rival is held to SCROLL_MIN and does not freeze", () => {
  const sim = playing();
  const rival = sim.cars.find((c) => c.racer && c.alive);
  assert.ok(rival);
  rival.raceSpeed = 10;
  const before = rival.along;
  step(sim, dt);
  assert.ok(rival.speed >= SCROLL_MIN - 1e-6, `rival speed ${rival.speed}`);
  assert.ok(rival.along - before >= SCROLL_MIN * dt - 1e-6, `rival moved ${rival.along - before}`);
});

test("a sidewall glance slides inward and keeps along-speed", () => {
  const sim = playing();
  const hero = plant(sim, 11.3, 0.7, 34);
  const startAlong = hero.along;
  const startLat = Math.abs(queryTrack(sim.track, hero.x, hero.z, hero.along).lateral);
  sim.keysOverride = new Set();
  let minSpeed = Infinity;
  for (let i = 0; i < 30; i++) {
    step(sim, dt);
    minSpeed = Math.min(minSpeed, hero.speed);
  }
  const lat = Math.abs(queryTrack(sim.track, hero.x, hero.z, hero.along).lateral);
  assert.ok(minSpeed >= SCROLL_MIN - 1e-6, `wall speed ${minSpeed}`);
  assert.ok(lat < startLat - 0.2, `lateral ${lat} from ${startLat}`);
  assert.ok(hero.along - startAlong > SCROLL_MIN * 0.35, `along ${hero.along - startAlong}`);
  assert.equal(sim.phase, "playing");
  assert.notEqual(sim.toast, "Back on track");
});

test("hard off-road resets to mid-track without spending a life", () => {
  for (const id of ["model3", "cybertruck", "roadster"] as const) {
    const sim = playing(id);
    const hero = plant(sim, 20, 0, 30);
    const hp = hero.hp;
    const lives = sim.lives;
    const gun = sim.up.gun;
    const armor = sim.up.armor;
    sim.keysOverride = new Set(["KeyD"]);
    let frames = 0;
    while (sim.toast !== "Back on track" && frames < 180 && sim.phase === "playing") {
      step(sim, dt);
      frames += 1;
    }
    assert.equal(sim.toast, "Back on track", id);
    assert.equal(sim.phase, "playing", id);
    assert.equal(sim.lives, lives, id);
    assert.equal(hero.hp, hp, id);
    assert.equal(sim.up.gun, gun, id);
    assert.equal(sim.up.armor, armor, id);
    assert.ok(hero.invuln > 0.5, `${id} invuln ${hero.invuln}`);
    assert.ok(hero.speed >= SCROLL_MIN - 1e-6, `${id} speed ${hero.speed}`);
    const lat = Math.abs(queryTrack(sim.track, hero.x, hero.z, hero.along).lateral);
    assert.ok(lat < 1.5, `${id} lateral ${lat}`);
    assert.ok(frames * dt >= OFFROAD_T - dt, `${id} tripped at ${frames * dt}`);
    assert.ok(sim.events.some((e) => e.t === "hit" || e.t === "scrape"), id);
  }
});
