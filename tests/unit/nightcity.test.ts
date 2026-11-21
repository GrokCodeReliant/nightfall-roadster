import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSE_ORIGIN, NIGHT_CITY, NIGHT_CITY_OBSTACLES, courseFor, gatePhase, medianAt, respawnBlocked, sectionAt, sectionById, tunnelClearance } from "../../src/game/course.ts";
import { concealTunnelRoof } from "../../src/game/city.ts";
import { CAM_BACK, CAM_UP } from "../../src/game/world.ts";
import * as THREE from "three";
import { buildCourseTrack, ensureTrack, poseAt, queryTrack, sampleAt, yawFromDir } from "../../src/game/road.ts";
import {
  FIELD_DNF,
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

function resetsWhile(sim: Sim, frames: number, keys: string[]) {
  const hero = sim.cars[0];
  sim.keysOverride = new Set(keys);
  let prev = hero.along;
  let jumps = 0;
  let scrapes = 0;
  let slow = 0;
  for (let i = 0; i < frames; i++) {
    const n = sim.events.length;
    step(sim, dt);
    for (let k = n; k < sim.events.length; k++) if (sim.events[k].t === "scrape") scrapes += 1;
    if (hero.along < prev - 5) jumps += 1;
    if (hero.speed < 22 - 1e-4) slow += 1;
    prev = hero.along;
  }
  return { jumps, scrapes, slow, invuln: hero.invuln };
}

test("NC §9.7 soft walls slide and rail edges refuse a committed leave", () => {
  const soft = quietCity();
  plant(soft, 900, -11.2, 30);
  const slid = resetsWhile(soft, 60 * 3, ["KeyA"]);
  assert.equal(slid.jumps, 0);
  assert.equal(slid.invuln, 0);
  assert.equal(slid.slow, 0);
  assert.ok(slid.scrapes > 0, `scrapes ${slid.scrapes}`);

  for (const s of [700, 1800, 2060]) {
    const sim = quietCity();
    plant(sim, s, -11.4, 30);
    const rail = resetsWhile(sim, 60 * 8, ["KeyA"]);
    assert.equal(rail.jumps, 0, `reset on race ${s}`);
    assert.equal(rail.invuln, 0, `invuln on race ${s}`);
    assert.equal(rail.slow, 0, `slow on race ${s}`);
  }
});

function lateral(sim: Sim) {
  const car = sim.cars[0];
  return queryTrack(sim.track, car.x, car.z, car.along).lateral;
}

test("NC §9.8 Fork A median holds the inside line", () => {
  const sim = quietCity();
  plant(sim, 1120, -6, 30);
  sim.keysOverride = new Set(["KeyD"]);
  for (let i = 0; i < 60 * 2; i++) {
    step(sim, dt);
    const lat = lateral(sim);
    assert.ok(lat <= -1.45, `lat ${lat} at frame ${i}`);
    assert.ok(sim.cars[0].speed >= 22 - 1e-4, `speed ${sim.cars[0].speed}`);
  }
});

test("NC §9.12 off-road reset inside Fork A lands on the left side centre", () => {
  const sim = quietCity();
  const hero = sim.cars[0];
  plant(sim, 1200, -20, 30);
  const hp = hero.hp;
  sim.keysOverride = new Set(["KeyA"]);
  let frames = 0;
  while (sim.toast !== "Back on track" && frames < 180) {
    step(sim, dt);
    frames += 1;
  }
  assert.equal(sim.toast, "Back on track");
  const lat = lateral(sim);
  assert.ok(Math.abs(lat - -6) <= 0.5, `lat ${lat}`);
  assert.equal(hero.hp, hp);
  assert.ok(hero.invuln > 0);
});

test("a rival on the inside of Fork A stays left, and a Roadster hop clears the median", () => {
  const sim = quietCity();
  const rival = sim.cars[1];
  rival.alive = true;
  rival.racer = true;
  rival.kind = "rammer";
  rival.raceSpeed = 30;
  rival.hp = rival.maxHp = 160;
  rival.fireCd = 9;
  rival.ramCd = 9;
  const origin = sim.race.originAlong;
  const p = poseAt(sim.track, origin + 1070);
  rival.lane = -6;
  rival.x = p.x + p.rx * -6;
  rival.z = p.z + p.rz * -6;
  rival.y = p.y;
  rival.along = p.s;
  rival.lastAlong = p.s;
  rival.yaw = yawFromDir(p.tx, p.tz);
  rival.speed = 30;
  rival.grounded = true;
  sim.keysOverride = new Set();
  const pace = sim.cars[0];
  for (let i = 0; i < 60 * 20 && rival.along - origin < 1460; i++) {
    const back = poseAt(sim.track, Math.max(origin, rival.along - 40));
    pace.x = back.x + back.rx * -6;
    pace.z = back.z + back.rz * -6;
    pace.y = back.y;
    pace.along = back.s;
    pace.lastAlong = back.s;
    pace.speed = 40;
    pace.lane = -6;
    step(sim, dt);
    const lat = queryTrack(sim.track, rival.x, rival.z, rival.along).lateral;
    assert.ok(lat < 0, `rival lat ${lat}`);
  }
  assert.ok(rival.along - origin >= 1460, `along ${rival.along - origin}`);

  const hop = quietCity("roadster");
  const hero = hop.cars[0];
  plant(hop, 1200, -1.6, 36);
  const deck = poseAt(hop.track, hero.along).y;
  hero.y = deck + 3;
  hero.grounded = false;
  hero.vy = 0;
  hero.lat = 12;
  hop.keysOverride = new Set(["KeyD"]);
  let crossed = false;
  for (let i = 0; i < 40; i++) {
    step(hop, dt);
    if (lateral(hop) > 1) crossed = true;
  }
  assert.equal(crossed, true);
});

test("NC §9.9 L4 into HZ-1 glances once and stays moving", () => {
  assert.equal(NIGHT_CITY_OBSTACLES.length, 11);
  const sim = quietCity();
  const hero = sim.cars[0];
  plant(sim, 856, 9, 40);
  const hp = hero.hp;
  sim.keysOverride = new Set(["KeyW"]);
  let hits = 0;
  let ratio = 0;
  let slow = 0;
  let off = false;
  for (let i = 0; i < 90; i++) {
    const before = hero.speed;
    const hpBefore = hero.hp;
    step(sim, dt);
    if (hero.speed < 22 - 1e-3) slow += 1;
    if (hero.hp < hpBefore) {
      hits += 1;
      ratio = hero.speed / before;
      if (Math.abs(lateral(sim) - 9) > 1) off = true;
    }
  }
  assert.equal(hits, 1);
  assert.ok(Math.abs(ratio - 0.85) <= 0.02, `ratio ${ratio}`);
  assert.equal(hero.hp, hp - 6);
  assert.equal(slow, 0);
  assert.equal(off, true);
  assert.ok(hero.speed >= 22);
});

test("no barricade shoves a car toward a wall", () => {
  for (const o of NIGHT_CITY_OBSTACLES) {
    const sim = quietCity();
    plant(sim, o.s - 1, o.lat, 40);
    sim.keysOverride = new Set(["KeyW"]);
    let hit = false;
    for (let i = 0; i < 30 && !hit; i++) {
      step(sim, dt);
      if (sim.cars[0].hp < 100) hit = true;
    }
    assert.equal(hit, true, o.id);
    const lat = lateral(sim);
    assert.ok(Math.abs(lat) <= 10.9, `${o.id} lat ${lat}`);
    const med = medianAt(NIGHT_CITY, o.s);
    if (med) assert.equal(Math.sign(lat), Math.sign(o.lat), `${o.id} crossed the median`);
    else assert.ok(Math.abs(lat) < Math.abs(o.lat) - 0.5, `${o.id} lat ${lat} toward the wall`);
  }
});

test("reset backstep inside Fork A skips the barricade", () => {
  const sim = quietCity();
  const hero = sim.cars[0];
  plant(sim, 1202, -20, 30);
  hero.offT = 0.85 - dt;
  const hp = hero.hp;
  sim.keysOverride = new Set(["KeyA"]);
  step(sim, dt);
  assert.equal(sim.toast, "Back on track");
  const landed = hero.along - sim.race.originAlong;
  const lat = lateral(sim);
  assert.equal(respawnBlocked("city", landed, lat), false);
  assert.equal(respawnBlocked("city", 1190.4, -6), true);
  assert.ok(Math.abs(landed - 1190.4) > 1.5, `landed ${landed}`);
  assert.ok(Math.abs(lat - -6) <= 0.5, `lat ${lat}`);
  assert.equal(hero.hp, hp);
  assert.ok(hero.speed >= 22);
});

function clearsKicker(lip: number, lat: number, speed: number, mark: number) {
  const sim = quietCity();
  const hero = sim.cars[0];
  plant(sim, lip - 2, lat, speed);
  sim.keysOverride = new Set(speed <= 22 ? [] : ["KeyW"]);
  let wasAir = false;
  let high = false;
  let land = -1;
  for (let i = 0; i < 60 * 8 && land < 0; i++) {
    step(sim, dt);
    const race = hero.along - sim.race.originAlong;
    const road = poseAt(sim.track, hero.along).y;
    if (!hero.grounded && Math.abs(race - mark) <= 1.5 && hero.y - road > 1.3) high = true;
    if (wasAir && hero.grounded) land = race;
    wasAir = !hero.grounded;
  }
  assert.equal(high, true, `lip ${lip} speed ${speed} land ${land}`);
  assert.ok(land > mark + 1, `land ${land} mark ${mark}`);
}

test("NC §9.10 lane kickers launch on their lane and nowhere else", () => {
  assert.equal(sampleAt(cityTrack, (COURSE_ORIGIN + 2718) / 2).kicker, false);
  assert.equal(sampleAt(cityTrack, (COURSE_ORIGIN + 2848) / 2).kicker, false);
  for (const speed of [22, 30, 40]) {
    clearsKicker(2717, 9, speed, 2725);
    clearsKicker(2847, 3, speed, 2855);
  }
  const sim = quietCity();
  const hero = sim.cars[0];
  plant(sim, 2710, 3, 40);
  sim.keysOverride = new Set(["KeyW"]);
  let air = false;
  for (let i = 0; i < 60 * 3 && hero.along - sim.race.originAlong < 2760; i++) {
    step(sim, dt);
    const road = poseAt(sim.track, hero.along).y;
    if (!hero.grounded || hero.y - road > 0.4) air = true;
  }
  assert.equal(air, false);
  assert.ok(hero.along - sim.race.originAlong >= 2760);
});

function phaseHold(gateS: number, want: "green" | "red") {
  for (let t = 0; t < 6; t += 0.05) {
    if (gatePhase(gateS, t) === want && gatePhase(gateS, t + 0.4) === want) return t;
  }
  return 0;
}

test("NC §9.13 gates boost on green, hold the raise, and ignore a red or the wrong side", () => {
  const at = (t: number) => [480, 1380, 1600, 3420].map((s) => gatePhase(s, t));
  assert.deepEqual(at(2.5), at(2.5));

  const cross = (phase: "green" | "red", raceS: number, lat: number) => {
    const sim = quietCity();
    const hero = sim.cars[0];
    plant(sim, raceS - 4, lat, 48);
    sim.time = phaseHold(raceS, phase);
    sim.keysOverride = new Set(["KeyW"]);
    let speed = 0;
    for (let i = 0; i < 40 && speed === 0; i++) {
      step(sim, dt);
      if (hero.along - sim.race.originAlong >= raceS) speed = hero.speed;
    }
    return speed;
  };

  const green = cross("green", 480, 0);
  const red = cross("red", 480, 0);
  assert.ok(green <= 60, `green ${green}`);
  assert.ok(green >= red + 8, `green ${green} red ${red}`);
  assert.ok(Math.abs(red - 48) < 1.5, `red ${red}`);

  const sim = quietCity();
  const hero = sim.cars[0];
  plant(sim, 476, 0, 48);
  sim.time = phaseHold(480, "green");
  sim.keysOverride = new Set(["KeyW"]);
  let held = 0;
  let crossed = false;
  for (let i = 0; i < 60 * 3; i++) {
    step(sim, dt);
    if (hero.along - sim.race.originAlong >= 480) crossed = true;
    if (crossed && hero.speed >= 56) held += dt;
  }
  assert.ok(held >= 1.5, `held ${held}`);

  const air = quietCity();
  const flyer = air.cars[0];
  plant(air, 476, 0, 40);
  flyer.y += 3;
  flyer.grounded = false;
  flyer.vy = 4;
  air.time = phaseHold(480, "green");
  air.keysOverride = new Set(["KeyW"]);
  let boosted = false;
  for (let i = 0; i < 40; i++) {
    const before = flyer.speed;
    const airing = !flyer.grounded;
    step(air, dt);
    if (airing && flyer.along - air.race.originAlong >= 480 && flyer.speed >= before + 8) boosted = true;
  }
  assert.equal(boosted, true);

  const left = cross("green", 1380, -6);
  const right = cross("green", 1380, 6);
  assert.ok(Math.abs(left - 48) < 1.5, `G-A left ${left}`);
  assert.ok(right >= left + 8, `G-A right ${right} left ${left}`);
});

test("NC §9.11 tunnel hop stays under the roof and the camera does not move", () => {
  assert.equal(CAM_BACK, 19);
  assert.equal(CAM_UP, 13.5);
  const clear = tunnelClearance(NIGHT_CITY);
  assert.equal(clear.ok, true);
  assert.equal(clear.nearest, "G2");
  assert.equal(clear.gap, 100);

  const roof = new THREE.Group();
  roof.name = "tunnel_roof";
  const shell = new THREE.Group();
  shell.add(roof);
  concealTunnelRoof(shell, CAM_UP);
  assert.equal(roof.visible, false);

  const sim = quietCity("roadster");
  const hero = sim.cars[0];
  plant(sim, 1800, 0, 40);
  sim.keysOverride = new Set(["Space"]);
  let peak = 0;
  for (let i = 0; i < 60 * 4; i++) {
    step(sim, dt);
    const race = hero.along - sim.race.originAlong;
    if (race < 1700 || race > 1940) continue;
    const road = poseAt(sim.track, hero.along).y;
    peak = Math.max(peak, hero.y - road);
  }
  assert.ok(peak > 2, `peak ${peak}`);
  assert.ok(peak <= 6.5 + 1e-6, `peak ${peak}`);
});

test("NC §9.14 reaching 3600 freezes a place from 1st to 4th", () => {
  const sim = quietCity();
  plant(sim, 3588, 0, 48);
  sim.keysOverride = new Set(["KeyW"]);
  for (let i = 0; i < 60 * 4 && sim.phase === "playing"; i++) step(sim, dt);
  assert.equal(sim.phase, "finished");
  assert.ok(sim.race.place >= 1 && sim.race.place <= 4, `place ${sim.race.place}`);
  const place = sim.race.place;
  const reason = sim.result?.reason;
  step(sim, dt);
  assert.equal(sim.race.place, place);
  assert.equal(sim.result?.reason, reason);
  assert.equal(sim.race.held, true);
});

test("NC §9.6 brake held the whole stage never dead-stops", () => {
  const sim = createSim();
  sim.stageId = "city";
  begin(sim);
  sim.keysOverride = new Set(["KeyS"]);
  const hero = sim.cars[0];
  let slow = 0;
  let stalled = 0;
  let prev = hero.along;
  let frames = 0;
  while (sim.phase === "playing" && frames < 60 * 200) {
    const frozen = sim.hitstop > 0;
    step(sim, dt);
    frames += 1;
    if (!frozen && sim.phase === "playing") {
      if (hero.speed < 22 - 1e-3) slow += 1;
      if (hero.along <= prev + 1e-4) stalled += 1;
    }
    prev = hero.along;
  }
  assert.equal(slow, 0);
  assert.equal(stalled, 0);
  assert.equal(sim.phase, "finished");
  const reason = sim.result?.reason ?? "";
  const placed = reason === "1st" || reason === "2nd" || reason === "3rd" || reason === "4th";
  assert.ok(placed || reason === "DNF" || reason === FIELD_DNF, reason);
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
