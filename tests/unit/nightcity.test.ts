import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSE_ORIGIN, NIGHT_CITY, courseFor, sectionAt, sectionById } from "../../src/game/course.ts";
import { buildCourseTrack, ensureTrack, poseAt, sampleAt, yawFromDir } from "../../src/game/road.ts";
import {
  RACE_DIST,
  RACE_HP,
  RIVAL_COUNT,
  RIVAL_SPEEDS,
  begin,
  createSim,
  step,
  type Sim,
} from "../../src/game/sim.ts";

const dt = 1 / 60;
const HARASS = new Set(["drone", "mine", "spiker", "boss"]);

test("NC §9.1 course table is contiguous, sums to 3600, and finishes at 3600", () => {
  const sections = NIGHT_CITY.sections;
  assert.ok(sections.length >= 2);
  let sum = 0;
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    assert.equal(sec.s0, sum, sec.id);
    assert.ok(sec.len > 0, sec.id);
    assert.equal(sec.width, 24, sec.id);
    if (i > 0) assert.equal(sec.s0, sections[i - 1].s0 + sections[i - 1].len, sec.id);
    sum += sec.len;
  }
  assert.equal(sum, 3600);
  assert.equal(NIGHT_CITY.length, 3600);
  const last = sections[sections.length - 1];
  assert.equal(last.id, "NC-12");
  assert.equal(last.s0 + last.len, 3600);
  assert.equal(sectionAt(NIGHT_CITY, 0)?.id, "NC-0");
  assert.equal(sectionAt(NIGHT_CITY, 3599.9)?.id, "NC-12");
  assert.equal(sectionAt(NIGHT_CITY, 3600)?.id, "NC-12");
  assert.equal(sectionById(NIGHT_CITY, "NC-6")?.type, "tunnel");
  assert.equal(courseFor("classic"), null);
  assert.equal(courseFor("highway"), null);
});

test("NC §9.3 begin(city) arms a 3600 m race with the H3.2 field and no waves", () => {
  assert.equal(RACE_DIST, 2200);
  const sim = createSim();
  sim.stageId = "city";
  begin(sim);
  assert.equal(sim.race.armed, true);
  assert.equal(sim.race.dist, 3600);
  assert.equal(sim.toast, "Race the field — place pays");
  const rivals = sim.cars.filter((c) => c.racer && c.alive);
  assert.equal(rivals.length, RIVAL_COUNT);
  assert.ok(rivals.every((c) => c.hp === RACE_HP && c.maxHp === RACE_HP));
  assert.ok(rivals.every((c) => c.kind === "rammer" || c.kind === "gunner"));
  const speeds = rivals.map((c) => c.raceSpeed).sort((a, b) => a - b);
  assert.deepEqual(speeds, [...RIVAL_SPEEDS].sort((a, b) => a - b));
  assert.equal(sim.cars.filter((c) => c.alive && !c.hero && !c.racer).length, 0);

  sim.lull = 1e9;
  sim.keysOverride = new Set();
  const seen = new Set<string>();
  for (let i = 0; i < 60 * 30; i++) {
    step(sim, dt);
    for (const c of sim.cars) if (!c.hero) seen.add(c.kind);
  }
  assert.equal(sim.wave, 0);
  assert.equal(sim.queue.length, 0);
  // An idle hero stays on the scroll floor and DNFs behind the field. That is still a race, not a wave.
  assert.ok(sim.phase === "playing" || sim.result?.reason === "Fell behind the field", `${sim.phase} ${sim.toast}`);
  for (const kind of HARASS) assert.equal(seen.has(kind), false, kind);

  const again = createSim();
  again.stageId = "city";
  begin(again);
  assert.equal(again.race.armed, true);
  assert.equal(again.race.dist, 3600);
  assert.notEqual(again.track, sim.track);
});

function yawAt(abs: number) {
  return yawFromDir(poseAt(cityTrack, abs).tx, poseAt(cityTrack, abs).tz);
}

const cityTrack = buildCourseTrack(NIGHT_CITY);

test("NC §9.2 heading matches the eased section curves", () => {
  const turn = (s0: number, s1: number) => yawAt(COURSE_ORIGIN + s1) - yawAt(COURSE_ORIGIN + s0);
  const nc4 = turn(1070, 1470);
  const nc3 = turn(770, 1070);
  const nc8 = turn(2190, 2430);
  assert.ok(Math.abs(nc4 - 1.6) <= 0.02, `NC-4 ${nc4}`);
  assert.ok(Math.abs(nc3 - -1) <= 0.02, `NC-3 ${nc3}`);
  assert.ok(Math.abs(nc8) <= 0.02, `NC-8 ${nc8}`);
});

test("NC §9.4 ramp crest, kicker window, and deck height", () => {
  const crest = poseAt(cityTrack, COURSE_ORIGIN + 680);
  assert.ok(Math.abs(crest.y - 5.4) <= 0.05, `crest ${crest.y}`);
  for (let s = 620; s <= 770; s += 2) {
    const sample = sampleAt(cityTrack, (COURSE_ORIGIN + s) / 2);
    const on = s >= 668 && s <= 680;
    assert.equal(sample.kicker, on, `kicker at race ${s}`);
  }
  for (let s = 2010; s <= 2120; s += 10) {
    const y = poseAt(cityTrack, COURSE_ORIGIN + s).y;
    assert.ok(Math.abs(y - 7.4) <= 0.05, `deck ${s} y ${y}`);
  }
  assert.equal(cityTrack.authored, true);
  assert.equal(cityTrack.pieces.length, 3);
  const before = cityTrack.pieces.length;
  ensureTrack(cityTrack, COURSE_ORIGIN + NIGHT_CITY.length + NIGHT_CITY.runout + 800);
  assert.equal(cityTrack.pieces.length, before);
  const runout = poseAt(cityTrack, COURSE_ORIGIN + 3600 + 300);
  assert.ok(Math.abs(runout.y) < 0.05, `run-out y ${runout.y}`);
});

test("authored centreline is deterministic and stays 250 m off itself", () => {
  const a = buildCourseTrack(NIGHT_CITY);
  const b = buildCourseTrack(NIGHT_CITY);
  assert.equal(a.samples.length, b.samples.length);
  for (let i = 0; i < a.samples.length; i += 17) {
    assert.equal(a.samples[i].x, b.samples[i].x);
    assert.equal(a.samples[i].y, b.samples[i].y);
    assert.equal(a.samples[i].z, b.samples[i].z);
    assert.equal(a.samples[i].kicker, b.samples[i].kicker);
  }
  const step = 8;
  const pts: { s: number; x: number; z: number }[] = [];
  for (let s = 0; s <= 3600; s += step) {
    const p = poseAt(a, COURSE_ORIGIN + s);
    pts.push({ s, x: p.x, z: p.z });
  }
  let closest = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (pts[j].s - pts[i].s <= 300) continue;
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z);
      if (d < closest) closest = d;
    }
  }
  assert.ok(closest >= 250, `closest ${closest}`);
});

function quietCity(carId = "model3") {
  const sim = createSim();
  sim.carId = carId;
  sim.stageId = "city";
  begin(sim);
  sim.keysOverride = new Set();
  for (const c of sim.cars) if (!c.hero) c.alive = false;
  return sim;
}

function plant(sim: Sim, raceS: number, lat: number, speed: number) {
  const car = sim.cars[0];
  const p = poseAt(sim.track, sim.race.originAlong + raceS);
  car.x = p.x + p.rx * lat;
  car.z = p.z + p.rz * lat;
  car.y = p.y;
  car.along = p.s;
  car.lastAlong = p.s;
  car.lane = lat;
  car.yaw = yawFromDir(p.tx, p.tz);
  car.speed = speed;
  car.vy = 0;
  car.lat = 0;
  car.grounded = !p.gap;
  car.hp = car.maxHp;
  car.invuln = 0;
  car.offT = 0;
}

test("NC §9.5 a straight 40 m/s run off R1 lands once near d 105 with no damage", () => {
  const sim = quietCity("model3");
  const hero = sim.cars[0];
  plant(sim, 666, 0, 40);
  const hp = hero.hp;
  sim.keysOverride = new Set(["KeyW"]);
  let airs = 0;
  let wasAir = false;
  let landRace = -1;
  for (let i = 0; i < 60 * 6 && landRace < 0; i++) {
    step(sim, dt);
    const air = !hero.grounded;
    if (air && !wasAir) airs += 1;
    if (wasAir && !air) landRace = hero.along - sim.race.originAlong - 620;
    wasAir = air;
  }
  assert.equal(airs, 1);
  assert.ok(Math.abs(landRace - 105) <= 10, `land d ${landRace}`);
  assert.equal(hero.hp, hp);
  assert.equal(hero.invuln, 0);
  assert.notEqual(sim.toast, "Back on track");
});

test("classic still runs waves after Night City is a race", () => {
  const sim = createSim();
  sim.stageId = "classic";
  begin(sim);
  assert.equal(sim.race.armed, false);
  assert.equal(sim.race.dist, RACE_DIST);
  assert.equal(sim.toast, "Hunters inbound. Survive.");
  sim.keysOverride = new Set();
  for (let i = 0; i < 60 * 30; i++) step(sim, dt);
  assert.ok(sim.wave >= 1, `wave ${sim.wave}`);
  assert.equal(sim.race.armed, false);
});
