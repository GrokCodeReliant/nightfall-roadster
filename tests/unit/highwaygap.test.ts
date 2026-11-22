// Open Highway openhighway-v2: BN-18 Broken Bridge (LEVELS/04 §3 / §8.1 / §9.3, locked gap-fall rule) and the look-pass
// generators (desert variety, salt pans, mesa cut, riverbed footprint).
import { test } from "node:test";
import assert from "node:assert/strict";
import { HIGHWAY_GAP, LANE_LAT, OPEN_HIGHWAY, respawnBlocked, sideGapAt } from "../../src/game/course.ts";
import { BRIDGE, DESERT_MOUND, DESERT_SCATTER, MESA_CUT, desertMounds, desertScatter, highwayPlacements, openGround, rightDeckSpans } from "../../src/game/highwaycourse.ts";
import { poseAt } from "../../src/game/road.ts";
import { GAP_RIVAL_MIN, OFFROAD_INVULN, SCROLL_MIN, begin, createSim, step, type Sim } from "../../src/game/sim.ts";

const dt = 1 / 60;
function highway() {
  const sim = createSim();
  // a non-Roadster (no ramp assist): §3 "needs >= ~38 m/s (Roadster >= ~25)"
  sim.carId = "model3";
  sim.stageId = "highway";
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set(["KeyW"]);
  sim.nextCrate = 1e9;
  // rivals out of the way (far ahead) so the hero runs alone
  for (const c of sim.cars) if (c.racer) { c.along = sim.race.originAlong + 1800; c.lastAlong = c.along; c.lane = -9; }
  return sim;
}
const raceS = (sim: Sim, along: number) => along - sim.race.originAlong;
function put(sim: Sim, s: number, lat: number, speed: number) {
  const h = sim.cars[0];
  const p = poseAt(sim.track, sim.race.originAlong + s);
  h.x = p.x + p.rx * lat; h.z = p.z + p.rz * lat; h.y = p.y; h.along = p.s; h.lastAlong = p.s; h.lane = lat; h.lat = 0;
  h.speed = speed; h.vy = 0; h.grounded = true; h.yaw = Math.atan2(-p.tx, -p.tz); h.invuln = 0; h.offT = 0;
}
/** drive the hero at `speed` (held until the kicker lip) and report what happens over the gap */
function runGap(lat: number, speed: number) {
  const sim = highway();
  const h = sim.cars[0];
  put(sim, 2200, lat, speed);
  const hp = h.hp, lives = sim.lives, tier = JSON.stringify(sim.shop ?? null);
  const ev0 = sim.events.length;
  let reset: null | { s: number; lat: number; speed: number; invuln: number; from: number; hp: number } = null;
  let maxS = 0, prevS = 2200, airborne = false, lastAirS = 0;
  for (let i = 0; i < 60 * 6 && sim.phase === "playing"; i++) {
    const s = raceS(sim, h.along);
    // §9.3 speeds are held through the flight (the spec's flat-kicker table: 38 m/s -> 48 m, 40 -> 53 m)
    if (s < 2310) h.speed = speed;
    step(sim, dt);
    const s2 = raceS(sim, h.along);
    if (!h.grounded) { airborne = true; lastAirS = s2; }
    if (s2 < prevS - 5 && !reset) {
      const p = poseAt(sim.track, h.along);
      const lt = (h.x - p.x) * p.rx + (h.z - p.z) * p.rz;
      reset = { s: s2, lat: lt, speed: h.speed, invuln: h.invuln, from: prevS, hp: h.hp };
    }
    maxS = Math.max(maxS, s2);
    prevS = s2;
    if (s2 > 2340 && !reset) break;
  }
  return { sim, h, hp, lives, tier, reset, maxS, airborne, lastAirS, events: sim.events.slice(ev0), toast: sim.toast };
}

test("BN-18 gap table: right deck only, 2260-2296; decks split at the gap; floor cut over the riverbed", () => {
  assert.deepEqual([HIGHWAY_GAP.s0, HIGHWAY_GAP.s1], [2260, 2296]);
  assert.ok(sideGapAt("highway", 2270, LANE_LAT.L4) && sideGapAt("highway", 2270, LANE_LAT.L3));
  assert.equal(sideGapAt("highway", 2270, LANE_LAT.L1), null);
  assert.equal(sideGapAt("highway", 2270, LANE_LAT.L2), null);
  assert.equal(sideGapAt("highway", 2259, LANE_LAT.L4), null);
  assert.equal(sideGapAt("highway", 2296, LANE_LAT.L4), null);
  for (const st of ["city", "coast", "woods", "classic"]) assert.equal(sideGapAt(st, 2270, 9), null);
  const spans = rightDeckSpans();
  assert.equal(spans.length, 13);
  for (const [a, b] of spans) assert.ok(b <= HIGHWAY_GAP.s0 || a >= HIGHWAY_GAP.s1, `deck ${a}-${b}`);
  assert.equal(spans.reduce((n, [a, b]) => n + b - a, 0), 520 - 36);
  const all = highwayPlacements();
  const edges = all.filter((p) => p.name === "gap_edge_12");
  assert.deepEqual(edges.map((p) => Math.round(p.s + (p.ry ? -0.92 : 0.92))), [2260, 2296]);
  assert.ok(edges.every((p) => p.lx < 0), "gap edges on the right deck");
  // no right-kerb rail floats over the gap; the left deck keeps all 125
  assert.ok(!all.some((p) => p.name === "coast_guardrail_4m" && p.lx < 0 && p.s > 2258 && p.s < 2298));
  assert.equal(all.filter((p) => p.name === "coast_guardrail_4m" && p.lx > 0 && p.s > 2000 && p.s < 2500).length, 125);
  assert.ok(all.filter((p) => p.name === "riverbed_strip_40").every((p) => p.ly === BRIDGE.bedY));
  assert.equal(openGround(2250, 15, 1), false);
  assert.equal(openGround(2250, 40, 1), true);
});

test("BN-18 §9.3: a hero on L4 at 40 m/s clears the gap off KA4 with hp unchanged", () => {
  const r = runGap(LANE_LAT.L4, 40);
  assert.equal(r.reset, null, `no reset ${JSON.stringify(r.reset)}`);
  assert.ok(r.airborne, "kicked");
  assert.ok(r.maxS > 2300, `on past the gap ${r.maxS}`);
  assert.equal(r.h.hp, r.hp);
  assert.ok(r.h.grounded && r.h.y > poseAt(r.sim.track, r.h.along).y - 0.5, "landed on the far deck");
});

test("BN-18 §9.3: at 34 m/s the hero falls: off-road-style reset at lat -6, 12 m back, hull / lives / tier kept", () => {
  const r = runGap(LANE_LAT.L4, 34);
  assert.ok(r.reset, "reset happened");
  const rs = r.reset!;
  assert.ok(Math.abs(rs.lat - -6) <= 0.5, `lat ${rs.lat}`);
  assert.ok(rs.from >= HIGHWAY_GAP.s0 - 1 && rs.from <= HIGHWAY_GAP.s1 + 9, `fell in the gap ${rs.from}`);
  assert.ok(Math.abs(rs.s - (rs.from - 12)) <= 1.5 || !respawnBlocked("highway", rs.s, -6), `12 m back ${rs.from} -> ${rs.s}`);
  assert.ok(!respawnBlocked("highway", rs.s, -6), `clear of OB-2 ${rs.s}`);
  assert.equal(rs.hp, r.hp, "hull kept");
  assert.equal(r.sim.lives, r.lives);
  assert.equal(JSON.stringify(r.sim.shop ?? null), r.tier);
  assert.ok(rs.speed >= SCROLL_MIN, `speed ${rs.speed}`);
  assert.ok(rs.invuln > OFFROAD_INVULN - 0.05, `invuln ${rs.invuln}`);
  assert.equal(r.events.filter((e) => e.t === "hit" && (e as { big?: boolean }).big).length, 1, "one tire-blow");
  assert.equal(r.events.filter((e) => e.t === "fall").length, 0, "no void fall");
  assert.ok(!/void/i.test(r.toast), `toast ${r.toast}`);
  assert.equal(r.sim.falls, 0);
});

test("BN-18 §8.1: a short landing on the far lip (y >= deck - 0.5 at s >= 2296) counts as a landing", () => {
  const sim = highway();
  const h = sim.cars[0];
  put(sim, 2294, LANE_LAT.L4, 38);
  h.grounded = false; h.y = poseAt(sim.track, h.along).y - 0.3; h.vy = -2;
  for (let i = 0; i < 30; i++) step(sim, dt);
  assert.ok(raceS(sim, h.along) > 2296, "carried on");
  assert.ok(h.grounded, "landed");
  // one that is lower meets the lip face and drops
  const sim2 = highway();
  const h2 = sim2.cars[0];
  put(sim2, 2290, LANE_LAT.L4, 30);
  h2.grounded = false; h2.y = poseAt(sim2.track, h2.along).y - 2; h2.vy = -4;
  let reset = false;
  for (let i = 0; i < 120 && !reset; i++) { const a = h2.along; step(sim2, dt); if (h2.along < a - 5) reset = true; }
  assert.ok(reset, "fell and was reset");
});

test("BN-18 rivals: a forced rival fall gets the same reset and stays racing; slow rivals keep off the bridge side", () => {
  const sim = highway();
  const hero = sim.cars[0];
  put(sim, 2100, -6, 30);
  hero.invuln = 1e9;
  const r = sim.cars.find((c) => c.racer && c.alive)!;
  r.along = sim.race.originAlong + 2270; r.lastAlong = r.along; r.lane = 9; r.grounded = true; r.raceSpeed = 34; r.speed = 34;
  let reset = false;
  for (let i = 0; i < 240 && !reset; i++) { const a = r.along; hero.invuln = 1e9; step(sim, dt); if (r.along < a - 5) reset = true; }
  assert.ok(reset, "rival reset");
  assert.ok(r.racer && r.alive, "still racing");
  assert.ok(Math.abs(r.lane - -6) <= 0.5, `main side ${r.lane}`);
  // §9.4: a rival at 34 m/s never enters the bridge side
  const sim2 = highway();
  put(sim2, 1600, -6, 30);
  const r2 = sim2.cars.find((c) => c.racer && c.alive)!;
  r2.along = sim2.race.originAlong + 1650; r2.lastAlong = r2.along; r2.lane = 9; r2.raceSpeed = 34;
  let onBridge = false;
  for (let i = 0; i < 60 * 25 && raceS(sim2, r2.along) < 2320; i++) {
    sim2.cars[0].invuln = 1e9;
    step(sim2, dt);
    const s = raceS(sim2, r2.along);
    if (s > 2020 && s < 2300 && r2.lane > 0) onBridge = true;
  }
  assert.ok(!onBridge, "kept left below 42 m/s");
  assert.equal(GAP_RIVAL_MIN, 42);
});

test("look pass generators: desert variety off the road / riverbed / mesa / salt, mounds clear of the shoulder, deterministic", () => {
  let scrub = 0, rock = 0, mounds = 0;
  for (let s = 0; s < 5200; s += 40) {
    for (const b of desertScatter(s, s + 40)) {
      assert.ok(Math.abs(b.lx) - b.r >= 13 - 1e-6, `${b.kind} ${b.s} ${b.lx}`);
      assert.ok(Math.abs(b.lx) <= DESERT_SCATTER.lxMax + 1e-6);
      assert.ok(openGround(b.s, b.lx, b.r, b.kind === "scrub"));
      b.kind === "scrub" ? scrub++ : rock++;
    }
    for (const m of desertMounds(s, s + 40)) {
      assert.ok(Math.abs(m.lx) - Math.max(m.rx, m.rz) >= 15 - 1e-6, `mound ${m.s} ${m.lx}`);
      assert.ok(m.h >= DESERT_MOUND.hMin && m.h <= DESERT_MOUND.hMax);
      mounds++;
    }
  }
  assert.ok(scrub > 1000 && rock > 500 && mounds > 60, `${scrub} ${rock} ${mounds}`);
  assert.deepEqual(desertScatter(800, 840), desertScatter(800, 840));
  assert.ok(MESA_CUT.openTop < MESA_CUT.h && MESA_CUT.openTop - 13.5 > 2, "roof clears the 13.5 m chase cam");
  assert.equal(OPEN_HIGHWAY.sections.find((x) => x.id === "OH-5")!.s0, MESA_CUT.s0);
});
