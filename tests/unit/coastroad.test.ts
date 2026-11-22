import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COAST_GATES,
  COAST_KICKERS,
  COAST_OBSTACLES,
  COAST_ROAD,
  COAST_SAND,
  COAST_WASH,
  COURSE_ORIGIN,
  NIGHT_CITY,
  SAND,
  WASH,
  burstWindows,
  courseFor,
  edgeKind,
  gatePhase,
  kickerWindow,
  medianAt,
  obstacleOverlap,
  respawnBlocked,
  sectionAt,
  sectionById,
  tunnelClearance,
  washAt,
  washPhase,
} from "../../src/game/course.ts";
import { botKeys } from "../../src/game/bot.ts";
import { chunkCourse, CR_ZONES } from "../../src/game/coastcourse.ts";
import { buildCourseTrack, poseAt, queryTrack, sampleAt, yawFromDir } from "../../src/game/road.ts";
import { CAR_IDS, RACE_HP, RIVAL_COUNT, RIVAL_SPEEDS, SCROLL_MIN, begin, createSim, step, type Sim } from "../../src/game/sim.ts";

const dt = 1 / 60;
const track = buildCourseTrack(COAST_ROAD);
const yawAt = (abs: number) => yawFromDir(poseAt(track, abs).tx, poseAt(track, abs).tz);
const turn = (s0: number, s1: number) => yawAt(COURSE_ORIGIN + s1) - yawAt(COURSE_ORIGIN + s0);

function quietCoast(carId = "model3") {
  const sim = createSim();
  sim.carId = carId;
  sim.stageId = "coast";
  begin(sim);
  sim.keysOverride = new Set();
  for (const c of sim.cars) if (!c.hero) c.alive = false;
  // random roadside crates (4 hp on contact) would make hp checks flaky
  sim.nextCrate = 1e9;
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

function lateral(sim: Sim) {
  const car = sim.cars[0];
  return queryTrack(sim.track, car.x, car.z, car.along).lateral;
}

const race = (sim: Sim) => sim.cars[0].along - sim.race.originAlong;

test("CR §9.1 course table is contiguous, sums to 4000, finishes at 4000, and matches the zone list", () => {
  let sum = 0;
  for (const sec of COAST_ROAD.sections) {
    assert.equal(sec.s0, sum, sec.id);
    assert.equal(sec.width, 24, sec.id);
    sum += sec.len;
  }
  assert.equal(sum, 4000);
  assert.equal(COAST_ROAD.length, 4000);
  assert.equal(courseFor("coast"), COAST_ROAD);
  // the scenery zone list (coastcourse.ts) and the sim table agree section for section
  assert.deepEqual(CR_ZONES.map((z) => [z.id, z.s0, z.s1]), COAST_ROAD.sections.map((s) => [s.id, s.s0, s.s0 + s.len]));
  assert.equal(sectionById(COAST_ROAD, "CR-5")?.type, "tunnel");
  assert.equal(sectionById(COAST_ROAD, "CR-2")?.type, "ramp");
  assert.equal(sectionById(COAST_ROAD, "CR-9")?.type, "ramp");
  assert.equal(sectionAt(COAST_ROAD, 4000)?.id, "CR-12");
  // edges: rail on cliff, ramp, tunnel and split; soft on the beaches
  const soft = ["CR-0", "CR-3", "CR-8", "CR-11", "CR-12"];
  for (const sec of COAST_ROAD.sections) {
    const want = soft.includes(sec.id) ? "soft" : "rail";
    assert.equal(sec.edgeL, want, sec.id);
    assert.equal(sec.edgeR, want, sec.id);
  }
  assert.deepEqual(COAST_ROAD.medians.map((m) => [m.s0, m.s1]), [[1210, 1580], [2030, 2410]]);
  assert.equal(medianAt(COAST_ROAD, 1300)?.half, 0.3);
  assert.equal(NIGHT_CITY.length, 3600, "Night City untouched");
});

test("CR §9.2 heading over CR-4, CR-1 and CR-10 matches the eased curves", () => {
  const cr4 = turn(1200, 1600);
  const cr1 = turn(300, 640);
  const cr10 = turn(2850, 3250);
  assert.ok(Math.abs(cr4 - 1.818) <= 0.02, `CR-4 ${cr4}`);
  assert.ok(Math.abs(cr1 - -0.68) <= 0.02, `CR-1 ${cr1}`);
  assert.ok(Math.abs(cr10) <= 0.02, `CR-10 ${cr10}`);
});

test("CR §9.3 begin(coast) arms a 4000 m race with 6 rivals and no waves; the title says race", () => {
  const sim = createSim();
  sim.stageId = "coast";
  begin(sim);
  assert.equal(sim.race.armed, true);
  assert.equal(sim.race.dist, 4000);
  assert.equal(sim.toast, "Race the field — place pays");
  const rivals = sim.cars.filter((c) => c.racer && c.alive);
  assert.equal(rivals.length, RIVAL_COUNT);
  assert.ok(rivals.every((c) => c.hp === RACE_HP));
  // The +1 m/s stage bonus in §6 is a rival-speed (WEEK_H) change: flagged, not built. Field speeds stay H3.2.
  assert.deepEqual(rivals.map((c) => c.raceSpeed).sort((a, b) => a - b), [...RIVAL_SPEEDS].sort((a, b) => a - b));
  sim.lull = 1e9;
  for (let i = 0; i < 60 * 10; i++) step(sim, dt);
  assert.equal(sim.wave, 0);
  assert.equal(sim.queue.length, 0);
});

test("CR §9.4 sand drift SD1: 46 m/s on L4 ends at <= 35, never below 22, no damage", () => {
  const sim = quietCoast();
  const hero = sim.cars[0];
  plant(sim, 948, 9, 46);
  const hp = hero.hp;
  sim.keysOverride = new Set(["KeyW"]);
  let min = 99;
  let seen = false;
  while (race(sim) < 1010) {
    step(sim, dt);
    if (hero.surf === "SD1") seen = true;
    min = Math.min(min, hero.speed);
  }
  assert.equal(seen, true);
  assert.ok(hero.speed <= SAND.cap + 1, `exit ${hero.speed}`);
  assert.ok(min >= SCROLL_MIN - 1e-6, `min ${min}`);
  assert.equal(hero.hp, hp);
  // the floor case: a car at 22 is not slowed further
  const slow = quietCoast();
  plant(slow, 948, 9, 22);
  while (race(slow) < 1010) {
    step(slow, dt);
    assert.ok(slow.cars[0].speed >= SCROLL_MIN - 1e-6);
  }
  // off the patch (L3 next to SD1) nothing happens
  const beside = quietCoast();
  plant(beside, 948, 3, 46);
  beside.keysOverride = new Set(["KeyW"]);
  while (race(beside) < 1010) step(beside, dt);
  assert.ok(beside.cars[0].speed > 44, `beside ${beside.cars[0].speed}`);
});

test("CR §9.4 rivals slow in sand drift too, and recover after", () => {
  const sim = createSim();
  sim.stageId = "coast";
  begin(sim);
  sim.keysOverride = new Set();
  const r = sim.cars.find((c) => c.racer)!;
  for (const c of sim.cars) if (c !== r && !c.hero) c.alive = false;
  r.raceSpeed = 40;
  r.lane = 9;
  const p = poseAt(sim.track, sim.race.originAlong + 948);
  r.along = p.s;
  r.lastAlong = p.s;
  // park the hero far ahead so no pass logic owns the rival
  sim.cars[0].along = sim.race.originAlong + 1600;
  let min = 99;
  while (r.along - sim.race.originAlong < 1010) {
    step(sim, dt);
    min = Math.min(min, r.speed);
  }
  assert.ok(r.speed <= SAND.cap + 1, `rival exit ${r.speed}`);
  assert.ok(min >= SCROLL_MIN);
  for (let i = 0; i < 60 * 2; i++) step(sim, dt);
  assert.ok(Math.abs(r.speed - 40) < 1e-6, `rival recovered ${r.speed}`);
});

test("CR §9.5 wave wash W1: on costs 6–10 m/s with no push, off costs nothing, phases are fixed", () => {
  assert.equal(washPhase(COAST_WASH[0], 0.1), "on");
  assert.equal(washPhase(COAST_WASH[0], 4.0), "telegraph");
  assert.equal(washPhase(COAST_WASH[0], 2.0), "off");
  assert.equal(washPhase(COAST_WASH[1], 1.6), "on");
  assert.equal(washPhase(COAST_WASH[2], 3.1), "on");
  assert.equal(washAt("coast", 2100, -6), null, "land side never washes");
  assert.equal(washAt("coast", 2100, 6)?.id, "W1");
  assert.equal(WASH.period, 4.5);
  const cross = (time: number) => {
    const sim = quietCoast();
    const hero = sim.cars[0];
    plant(sim, 2079, 6, 40);
    sim.time = time;
    sim.keysOverride = new Set(["KeyW"]);
    const v0 = hero.speed;
    let lat = 0;
    let min = v0;
    while (race(sim) < 2121) {
      step(sim, dt);
      lat = Math.max(lat, Math.abs(lateral(sim) - 6));
      min = Math.min(min, hero.speed);
    }
    // the loss is read at the slowest point; throttle wins speed back once the wash is off
    return { lost: v0 - min, lat, speed: hero.speed };
  };
  // start so the 0.9 s wash covers the crossing (W1 phase 0)
  const on = cross(4.5 - 0.02);
  assert.ok(on.lost >= 6 && on.lost <= 10, `lost ${on.lost}`);
  assert.ok(on.lat < 0.3, `push ${on.lat}`);
  const off = cross(1.2);
  assert.ok(off.lost <= 0.5, `off lost ${off.lost}`);
  assert.deepEqual(cross(4.5 - 0.02), on, "deterministic");
});

test("CR §9.6 rail edges refuse a committed leave; the soft beach on CR-3 resets once", () => {
  for (const s of [400, 1300, 1800, 2950]) {
    const sim = quietCoast();
    const side = s === 1300 ? -11.2 : -11.4;
    plant(sim, s, side, 30);
    sim.keysOverride = new Set(["KeyA"]);
    let resets = 0;
    let slow = 0;
    for (let i = 0; i < 60 * 3; i++) {
      step(sim, dt);
      if (sim.toast === "Back on track") resets += 1;
      if (sim.cars[0].speed < SCROLL_MIN - 1e-4) slow += 1;
    }
    assert.equal(resets, 0, `reset on CR s ${s}`);
    assert.equal(slow, 0, `slow on CR s ${s}`);
    assert.equal(edgeKind(COAST_ROAD, s, "L"), "rail");
  }
  const soft = quietCoast();
  plant(soft, 900, -20, 30);
  soft.keysOverride = new Set(["KeyA"]);
  let frames = 0;
  while (soft.toast !== "Back on track" && frames < 60 * 3) {
    step(soft, dt);
    frames += 1;
  }
  assert.equal(soft.toast, "Back on track");
  assert.ok(frames <= 0.85 * 60 + 30, `frames ${frames}`);
});

test("CR §9.7 rock RK-1 at 2120 L2: one contact, x0.85, -6 hp, no stop", () => {
  assert.equal(COAST_OBSTACLES.length, 2);
  assert.ok(obstacleOverlap(COAST_OBSTACLES[0], 2120, -3));
  const sim = quietCoast();
  const hero = sim.cars[0];
  plant(sim, 2116, -3, 40);
  const hp = hero.hp;
  sim.keysOverride = new Set(["KeyW"]);
  let hits = 0;
  let ratio = 0;
  for (let i = 0; i < 90; i++) {
    const before = hero.speed;
    const hpBefore = hero.hp;
    step(sim, dt);
    if (hero.hp < hpBefore) {
      hits += 1;
      ratio = hero.speed / before;
    }
    assert.ok(hero.speed >= SCROLL_MIN - 1e-6);
  }
  assert.equal(hits, 1);
  assert.ok(Math.abs(ratio - 0.85) <= 0.02, `ratio ${ratio}`);
  assert.equal(hero.hp, hp - 6);
});

test("CR §9.8 K1 on L3 at 40 m/s: airborne over SD7, no drift slowdown", () => {
  assert.equal(COAST_KICKERS[0].s, 3455);
  const sim = quietCoast();
  const hero = sim.cars[0];
  plant(sim, 3450, 3, 40);
  sim.keysOverride = new Set(["KeyW"]);
  let sand = false;
  let airOver = true;
  while (race(sim) < 3495) {
    step(sim, dt);
    const s = race(sim);
    if (hero.surf.startsWith("SD")) sand = true;
    if (s >= 3460 && s <= 3490 && hero.grounded) airOver = false;
  }
  assert.equal(sand, false);
  assert.equal(airOver, true);
  // at the floor the kicker lands inside SD7, which is allowed (§8.4)
  assert.equal(COAST_SAND.find((p) => p.id === "SD7")?.s0, 3460);
});

test("CR §9.9 R1 and R2 at 40 m/s land near d 105 with no damage", () => {
  for (const s0 of [700, 2700]) {
    const sim = quietCoast();
    const hero = sim.cars[0];
    plant(sim, s0 + 46, 0, 40);
    const hp = hero.hp;
    sim.keysOverride = new Set(["KeyW"]);
    let wasAir = false;
    let land = -1;
    for (let i = 0; i < 60 * 6 && land < 0; i++) {
      step(sim, dt);
      if (wasAir && hero.grounded) land = race(sim) - s0;
      wasAir = !hero.grounded;
    }
    assert.ok(Math.abs(land - 105) <= 10, `ramp ${s0} land d ${land}`);
    assert.equal(hero.hp, hp);
  }
});

test("CR §9.10 Arch Rock: Roadster hop stays <= 6.5 m and no feature sits within 60 m", () => {
  const clear = tunnelClearance(COAST_ROAD);
  assert.equal(clear.ok, true);
  assert.equal(clear.nearest, "G-A");
  assert.equal(clear.gap, 100);
  const sim = quietCoast("roadster");
  const hero = sim.cars[0];
  plant(sim, 1610, 0, 40);
  sim.keysOverride = new Set(["Space"]);
  let peak = 0;
  for (let i = 0; i < 60 * 3; i++) {
    step(sim, dt);
    const s = race(sim);
    if (s < 1600 || s > 1720) continue;
    peak = Math.max(peak, hero.y - poseAt(sim.track, hero.along).y);
  }
  assert.ok(peak > 2, `peak ${peak}`);
  assert.ok(peak <= 6.5 + 1e-6, `peak ${peak}`);
});

test("CR §9.11 off-road reset on the left of CR-7 lands at lat -6, never on a rock or in a wash", () => {
  // CR-7 is rail-edged, so a leave cannot happen by steering (§8.1). Force the timer like a reset would see it.
  const sim = quietCoast();
  plant(sim, 2300, -20, 30);
  sim.cars[0].offT = 10;
  sim.keysOverride = new Set(["KeyA"]);
  let frames = 0;
  while (sim.toast !== "Back on track" && frames < 180) {
    step(sim, dt);
    frames += 1;
  }
  assert.equal(sim.toast, "Back on track");
  const lat = lateral(sim);
  assert.ok(Math.abs(lat - -6) <= 0.5, `lat ${lat}`);
  for (const o of COAST_OBSTACLES) assert.equal(obstacleOverlap(o, race(sim), lat), false);
  for (const w of COAST_WASH) assert.equal(respawnBlocked("coast", (w.s0 + w.s1) / 2, 6), true, w.id);
  assert.equal(respawnBlocked("coast", 2290, -9), true);
  assert.equal(respawnBlocked("coast", 2290, 6), false);
});

test("CR §9.12 reaching 4000 freezes a place from 1st to 4th", () => {
  const sim = quietCoast();
  plant(sim, 3988, 0, 48);
  sim.keysOverride = new Set(["KeyW"]);
  for (let i = 0; i < 60 * 4 && sim.phase === "playing"; i++) step(sim, dt);
  assert.equal(sim.phase, "finished");
  assert.ok(sim.race.place >= 1 && sim.race.place <= 4);
  const place = sim.race.place;
  step(sim, dt);
  assert.equal(sim.race.place, place);
  assert.equal(sim.race.held, true);
});

test("CR gates boost on green; G-A and G-B fire only on the sea side", () => {
  assert.deepEqual(COAST_GATES.map((g) => [g.id, g.s, g.side]), [
    ["G1", 1100, "both"], ["G-A", 1500, "right"], ["G2", 1950, "both"], ["G-B", 2300, "right"], ["G3", 3760, "both"],
  ]);
  const cross = (gateS: number, lat: number, time: number) => {
    const sim = quietCoast();
    const hero = sim.cars[0];
    plant(sim, gateS - 4, lat, 48);
    sim.time = time;
    sim.keysOverride = new Set(["KeyW"]);
    let speed = 0;
    for (let i = 0; i < 40 && speed === 0; i++) {
      step(sim, dt);
      if (race(sim) >= gateS) speed = hero.speed;
    }
    return speed;
  };
  for (const g of COAST_GATES.filter((x) => x.side === "right")) {
    const greenT = (() => {
      for (let u = 0; u < 6; u += 0.05) {
        let good = true;
        for (const d of [0, 0.2, 0.4]) if (gatePhase(g.s, u + d) !== "green") good = false;
        if (good) return u;
      }
      return 0;
    })();
    // land side: no boost. Sea side: boost (G-B sits between W2 and W3, so no wash under it).
    const left = cross(g.s, -6, greenT);
    const right = cross(g.s, 6, greenT);
    assert.ok(Math.abs(left - 48) < 1.5, `${g.id} left ${left}`);
    assert.ok(right >= left + 8, `${g.id} right ${right} left ${left}`);
  }
});

test("CR burst-ram suppression covers R1, R2, K1 and both rocks; respawn windows cover the lips", () => {
  const w = burstWindows("coast");
  for (const s of [700, 2700, 3455, 2120, 2290]) assert.ok(w.some(([a, b]) => a === s - 30 && b === s), `window ${s}`);
  // Night City windows are unchanged by the generalisation
  const nc = burstWindows("city").map((x) => x.join("-"));
  for (const want of ["590-620", "2460-2490", "2687-2717", "2817-2847"]) assert.ok(nc.includes(want), want);
  assert.equal(kickerWindow("city", 662), true);
  assert.equal(kickerWindow("city", 2556), true);
  assert.equal(kickerWindow("city", 700), false);
  assert.equal(kickerWindow("coast", 742), true);
  assert.equal(kickerWindow("coast", 2766), true);
  assert.equal(kickerWindow("coast", 3456, 3), true);
  assert.equal(kickerWindow("coast", 3456, -9), false);
});

test("CR scenery chunk context lines up with the course (grid, ramp lips, finish)", () => {
  const ramps = track.pieces.filter((p) => p.kind === "ramp").map((p) => p.s);
  assert.deepEqual(ramps, [COURSE_ORIGIN + 700, COURSE_ORIGIN + 2700]);
  const grid = chunkCourse("coast", 120, 40, 2, () => true, ramps);
  assert.equal(grid.grid, true);
  assert.equal(grid.zone, "CR-0");
  const lip = chunkCourse("coast", 880, 40, 2, () => false, ramps);
  assert.deepEqual(lip.kick, [4]);
  assert.equal(lip.zone, "CR-2");
  const fin = chunkCourse("coast", 4120, 40, 2, () => true, ramps);
  assert.equal(fin.finishK, 10);
  assert.equal(sampleAt(track, (COURSE_ORIGIN + 754) / 2).kicker, true);
  assert.equal(sampleAt(track, (COURSE_ORIGIN + 2754) / 2).kicker, true);
});

test("CR §9.13 the bot finishes Coast Road in each of the six cars", () => {
  for (const carId of CAR_IDS) {
    const sim = createSim();
    sim.carId = carId;
    sim.stageId = "coast";
    begin(sim);
    let frames = 0;
    while (sim.phase === "playing" && frames < 60 * 240) {
      sim.keysOverride = new Set(botKeys(sim, true));
      step(sim, dt);
      frames += 1;
    }
    assert.equal(sim.phase, "finished", `${carId} ${sim.toast}`);
    assert.ok(sim.race.place >= 1 && sim.race.place <= 4, `${carId} ${sim.result?.reason}`);
  }
});
