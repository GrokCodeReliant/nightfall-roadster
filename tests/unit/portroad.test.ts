// week-i-port: Industrial Port (LEVELS/05 v1.0 locked) course data, locked ART LIST counts, procedural piece budgets
// (ART_LISTS/05 §B) and the §9 headless checks that run on the sim.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CRANE, INDUSTRIAL_PORT, LANE_LAT, PORT_OIL, sideLiftAt, widthAt } from "../../src/game/course.ts";
import { PORT_COUNTS, PORT_LEN, portPlacements } from "../../src/game/portcourse.ts";
import { craneLoadPose, craneShadowGeometry, forkliftGeometry, portPieceTris } from "../../src/game/port.ts";
import { PORT_FORKLIFTS } from "../../src/game/trucks.ts";
import { poseAt } from "../../src/game/road.ts";
import { begin, createSim, step, type Sim } from "../../src/game/sim.ts";

const dt = 1 / 60;
function port() {
  const sim = createSim();
  sim.carId = "model3";
  sim.stageId = "port";
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set();
  sim.nextCrate = 1e9;
  for (const c of sim.cars) if (c.racer) { c.along = sim.race.originAlong + 4400; c.lastAlong = c.along; }
  return sim;
}
function put(sim: Sim, s: number, lat: number, speed: number) {
  const h = sim.cars[0];
  const p = poseAt(sim.track, sim.race.originAlong + s);
  h.x = p.x + p.rx * lat; h.z = p.z + p.rz * lat; h.y = p.y + sideLiftAt(INDUSTRIAL_PORT, s, lat); h.along = p.s; h.lastAlong = p.s; h.lane = lat; h.lat = 0;
  h.speed = speed; h.vy = 0; h.grounded = true; h.yaw = Math.atan2(-p.tx, -p.tz); h.invuln = 0; h.offT = 0;
  if (sim.up) sim.up.shieldT = 0;
}
const latOf = (sim: Sim) => { const h = sim.cars[0], p = poseAt(sim.track, h.along); return (h.x - p.x) * p.rx + (h.z - p.z) * p.rz; };

test("§9.1 course: 4600 m, 18 m canyons (900) / 24 m (1300), tapers, BN-15 tops 5.2 m", () => {
  assert.equal(PORT_LEN, 4600);
  assert.equal(INDUSTRIAL_PORT.sections.reduce((n, s) => n + s.len, 0), 4600);
  assert.equal(widthAt(INDUSTRIAL_PORT, 900), 18);
  assert.equal(widthAt(INDUSTRIAL_PORT, 1300), 24);
  assert.equal(widthAt(INDUSTRIAL_PORT, 4150), 18);
  assert.equal(widthAt(INDUSTRIAL_PORT, 720), 21);
  assert.equal(sideLiftAt(INDUSTRIAL_PORT, 1500, 9), 5.2);
  assert.equal(sideLiftAt(INDUSTRIAL_PORT, 1500, -9), 0);
});

test("locked ART LIST counts: every placement count matches §A", () => {
  const all = portPlacements();
  const n = (name: string, f: (p: (typeof all)[number]) => boolean = () => true) => all.filter((p) => p.name === name && f(p)).length;
  const C = PORT_COUNTS;
  assert.equal(n("port_container_12"), 707);
  assert.equal(n("port_container_12", (p) => p.s >= 700 && p.s < 1240), C.containers.canyon);
  assert.equal(n("port_container_12", (p) => p.s >= 1310 && p.s < 1660), C.containers.deck);
  assert.equal(n("port_container_12", (p) => p.s >= 1950 && p.s < 2550), C.containers.crane);
  assert.equal(n("port_container_12", (p) => p.s >= 4000 && p.s < 4300), C.containers.gauntlet);
  assert.equal(n("port_sts_crane"), 7);
  assert.equal(n("port_oil_decal"), 8);
  assert.equal(n("sign_fork"), 10);
  assert.equal(n("barrier_jersey_4m"), 250);
  assert.equal(n("coast_guardrail_end_4m"), 4);
  assert.equal(n("port_parapet_4m"), 235);
  assert.equal(n("port_bollard"), 140);
  assert.equal(n("coast_guardrail_4m"), 150);
  assert.equal(n("port_shed_tunnel_40"), 6);
  assert.equal(n("port_shed_portal"), 2);
  assert.equal(n("port_racking"), 12);
  assert.equal(n("port_rail_track_40"), 13);
  assert.equal(n("port_rail_crossing_12"), 3);
  assert.equal(n("port_flatcar"), 6);
  assert.equal(n("port_ship_hull_backdrop"), 3);
  assert.equal(n("port_warehouse_block"), 10);
  assert.equal(n("coast_crate"), 1);
  assert.equal(n("port_security_booth"), 1);
  assert.equal(n("port_fence_4m"), 40);
  assert.equal(n("port_water_tile"), 12);
  assert.equal(n("port_container_ramp"), 2);
  assert.equal(n("port_deck_top"), 1);
  assert.equal(PORT_FORKLIFTS.length, 2);
});

test("§B piece budgets (tris)", () => {
  const budget: [string, number][] = [
    ["port_container_12", 60], ["port_parapet_4m", 40], ["port_sts_crane", 3000], ["port_warehouse_block", 300], ["port_shed_tunnel_40", 300],
    ["port_shed_portal", 300], ["port_oil_decal", 20], ["port_rail_crossing_12", 60], ["port_rail_track_40", 80], ["port_flatcar", 300],
    ["port_ship_hull_backdrop", 300], ["port_bollard", 60], ["port_security_booth", 300], ["port_fence_4m", 40],
  ];
  for (const [name, max] of budget) {
    const t = portPieceTris(name);
    assert.ok(t > 0 && t <= max, `${name}: ${t} tris (budget ${max})`);
  }
  for (let k = 0; k < 6; k++) assert.ok(portPieceTris("port_container_12", k) <= 60);
  assert.ok(forkliftGeometry().getAttribute("position").count / 3 <= 800);
  assert.ok(craneShadowGeometry().getAttribute("position").count / 3 <= 10);
});

test("§3 no oil within 60 m of a ramp landing range; forklift + oil never stack in a lane within 40 m", () => {
  for (const [a, b] of [[1862, 1994], [3662, 3794]]) for (const o of PORT_OIL) assert.ok(o.s1 < a - 60 || o.s0 > b + 60, `${o.id} near landing ${a}-${b}`);
  for (const f of PORT_FORKLIFTS) for (const o of PORT_OIL) {
    if (Math.abs(o.lat - LANE_LAT[f.lane]) > 3) continue;
    assert.ok(o.s1 < f.s0 - 40 || o.s0 > f.s1 + 40, `${f.id} + ${o.id}`);
  }
});

test("crane load pose: sweeps across in the active window, hoisted when idle, shadow only in telegraph / active", () => {
  const both = [-15, 15];
  const a = craneLoadPose(both, { n: 0, state: "active", u: 0 }), b = craneLoadPose(both, { n: 0, state: "active", u: 1 });
  assert.ok(Math.abs(b.lat - a.lat) > 30 && a.bottom < CRANE.h && a.shadow === 1);
  assert.equal(craneLoadPose(both, { n: 1, state: "telegraph", u: 0 }).lat, b.lat);
  assert.equal(craneLoadPose(both, { n: 1, state: "idle", u: 0.9 }).shadow, 0);
  assert.ok(craneLoadPose(both, { n: 1, state: "idle", u: 0.9 }).bottom > CRANE.h);
});

test("§9.3 crane CS1: in the active band -14 hp once per sweep, no lateral change; out of the band nothing", () => {
  const sim = port();
  const h = sim.cars[0];
  put(sim, 1049, 0, 1);
  sim.time = 5.0; // CS1 phase 0: telegraph 4.2-5.2, active 5.2-6.0
  const hp = h.hp, lat0 = latOf(sim);
  for (let i = 0; i < 60; i++) { h.speed = 1; step(sim, dt); }
  assert.equal(hp - h.hp, CRANE.heroDmg);
  assert.ok(Math.abs(latOf(sim) - lat0) < 0.05, "no push");
  const s2 = port();
  put(s2, 1070, 0, 1);
  s2.time = 5.0;
  const hp2 = s2.cars[0].hp;
  for (let i = 0; i < 60; i++) { s2.cars[0].speed = 1; step(s2, dt); }
  assert.equal(s2.cars[0].hp, hp2);
});

test("§9.4 Fork A tops: a car on L4 rides at 5.2 m at s 1500; the median blocks crossing while grounded", () => {
  const sim = port();
  const h = sim.cars[0];
  put(sim, 1490, LANE_LAT.L4, 20);
  for (let i = 0; i < 30; i++) step(sim, dt);
  const p = poseAt(sim.track, h.along);
  assert.ok(Math.abs(h.y - p.y - 5.2) <= 0.1, `y ${(h.y - p.y).toFixed(2)}`);
  put(sim, 1450, 2, 20);
  sim.keysOverride = new Set(["KeyA"]);
  let minLat = 99;
  for (let i = 0; i < 90; i++) { step(sim, dt); if (h.grounded) minLat = Math.min(minLat, latOf(sim)); }
  assert.ok(minLat > 0, `crossed to ${minLat.toFixed(2)}`);
});

test("§9.6 18 m canyon: rivals never target lateral +-9", () => {
  const sim = port();
  let worst = 0, seen = 0;
  sim.cars.forEach((c, i) => { if (c.racer) { c.along = sim.race.originAlong + 760 + i * 12; c.lastAlong = c.along; c.lane = i % 2 ? 9 : -9; } });
  put(sim, 700, 0, 30);
  for (let i = 0; i < 60 * 8; i++) {
    sim.cars[0].invuln = 1e9;
    step(sim, dt);
    for (const c of sim.cars) {
      if (!c.racer || !c.alive) continue;
      const s = c.along - sim.race.originAlong;
      if (s > 760 && s < 1190) { worst = Math.max(worst, Math.abs(c.lane)); seen++; }
    }
  }
  assert.ok(seen > 600, `rival samples in the canyon ${seen}`);
  assert.ok(worst <= 6.5, `rival lane ${worst}`);
});

test("§9.2 oil OS1: entering at 40 m/s with full steer, the sliding drift is >= 1.5x a dry control over 30 m; speed kept, no spin", () => {
  const run = (s0: number) => {
    const sim = port();
    const h = sim.cars[0];
    put(sim, s0, LANE_LAT.L2, 40);
    h.invuln = 1e9;
    sim.keysOverride = new Set(["KeyW", "KeyD"]);
    let t = 0, slide = 0;
    while (h.along - sim.race.originAlong < s0 + 30) {
      t += dt;
      if (t > 0.3) sim.keysOverride = new Set(["KeyW"]);
      step(sim, dt);
      slide += Math.abs(h.lat) * dt; // the lateral momentum that lingers (grip decay), not the steering yaw
    }
    return { slide, speed: h.speed, spin: (h as { spin?: number }).spin ?? 0 };
  };
  const oil = run(500), dry = run(440);
  assert.ok(oil.slide >= 1.5 * dry.slide, `oil ${oil.slide.toFixed(2)} vs dry ${dry.slide.toFixed(2)}`);
  assert.ok(Math.abs(oil.speed - dry.speed) < 1, `speed ${oil.speed} vs ${dry.speed}`);
  assert.equal(oil.spin, 0);
});

test("§9.5 forklift FL1: contact is the OB rule (hero -6 hp), speed stays >= 22", () => {
  const sim = port();
  const h = sim.cars[0];
  const fl = sim.trucks.find((t) => t.id === "FL1")!;
  assert.ok(fl, "FL1 in the port truck list");
  fl.alive = true; fl.s = 1585; fl.s1 = 1740;
  put(sim, 1570, LANE_LAT.L2, 30);
  sim.keysOverride = new Set(["KeyW"]);
  const hp = h.hp;
  let minSpeed = 99;
  for (let i = 0; i < 150; i++) { step(sim, dt); minSpeed = Math.min(minSpeed, h.speed); }
  assert.equal(hp - h.hp, 6);
  assert.ok(minSpeed >= 22, `speed ${minSpeed}`);
});
