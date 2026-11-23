// week-i-pass: Mountain Pass (LEVELS/06 v1.0 locked) course data and the §9 headless checks that run on the sim.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSE_ORIGIN, ICE, kickerWindow, LANE_LAT, MOUNTAIN_PASS, PASS_ICE, PASS_ROCKFALL, ROCKFALL, SUMMIT_LEAP, bendAt, widthAt } from "../../src/game/course.ts";
import { buildCourseTrack, poseAt } from "../../src/game/road.ts";
import { freshRocks, stepRocks } from "../../src/game/rockfall.ts";
import { begin, createSim, step, type Sim } from "../../src/game/sim.ts";

const dt = 1 / 60;
function pass() {
  const sim = createSim();
  sim.carId = "model3";
  sim.stageId = "pass";
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set();
  sim.nextCrate = 1e9;
  for (const c of sim.cars) if (c.racer) { c.along = sim.race.originAlong + 60; c.lastAlong = c.along; }
  return sim;
}
function put(sim: Sim, s: number, lat: number, speed: number) {
  const h = sim.cars[0];
  const p = poseAt(sim.track, sim.race.originAlong + s);
  h.x = p.x + p.rx * lat; h.z = p.z + p.rz * lat; h.y = p.y; h.along = p.s; h.lastAlong = p.s; h.lane = lat; h.lat = 0;
  h.speed = speed; h.vy = 0; h.grounded = true; h.yaw = Math.atan2(-p.tx, -p.tz); h.invuln = 0; h.offT = 0;
  if (sim.up) sim.up.shieldT = 0;
}
const latOf = (sim: Sim) => { const h = sim.cars[0], p = poseAt(sim.track, h.along); return (h.x - p.x) * p.rx + (h.z - p.z) * p.rz; };

test("§9.1 course: 4800 m, MP-3 turns +2.89 rad, non-adjacent legs >= 80 m apart (BN-21), widths / tapers", () => {
  assert.equal(MOUNTAIN_PASS.length, 4800);
  assert.equal(MOUNTAIN_PASS.sections.reduce((n, s) => n + s.len, 0), 4800);
  for (let i = 1; i < MOUNTAIN_PASS.sections.length; i++) {
    const a = MOUNTAIN_PASS.sections[i - 1], b = MOUNTAIN_PASS.sections[i];
    assert.equal(a.s0 + a.len, b.s0, b.id);
  }
  let h = 0;
  for (let s = 1000; s < 1260; s += 0.5) h += bendAt(MOUNTAIN_PASS, COURSE_ORIGIN + s + 0.25) * 0.5;
  assert.ok(Math.abs(h - 2.89) <= 0.03, `MP-3 heading ${h.toFixed(3)}`);
  // centreline plot: closest approach between points >= 400 m apart along the course (the hairpin legs)
  const track = buildCourseTrack(MOUNTAIN_PASS);
  const pts: { s: number; x: number; z: number }[] = [];
  for (let s = 0; s <= 4800; s += 10) { const p = poseAt(track, COURSE_ORIGIN + s); pts.push({ s, x: p.x, z: p.z }); }
  let min = Infinity, at = [0, 0];
  for (const a of pts) for (const b of pts) {
    if (b.s - a.s < 400) continue;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < min) { min = d; at = [a.s, b.s]; }
  }
  console.log(`pass legs: closest non-adjacent approach ${min.toFixed(1)} m (s ${at[0]} / ${at[1]})`);
  assert.ok(min >= 80, `legs ${min.toFixed(1)} m apart at ${at}`);
  assert.equal(widthAt(MOUNTAIN_PASS, 1100), 18);
  assert.equal(widthAt(MOUNTAIN_PASS, 1500), 24);
  assert.equal(widthAt(MOUNTAIN_PASS, 2700), 24);
  assert.equal(widthAt(MOUNTAIN_PASS, 3000), 18);
  assert.equal(widthAt(MOUNTAIN_PASS, 3500), 24);
  // §3: no 18 m road under any R1 landing (furthest 2714)
  for (let s = 2582; s <= 2714; s += 2) assert.equal(widthAt(MOUNTAIN_PASS, s), 24, `${s}`);
});

test("BN-22 Summit Leap profile: 9.0 m at 80 m, kicker 68-80 m (y 7.65 at the lip), down to 0 at 200 m", () => {
  const track = buildCourseTrack(MOUNTAIN_PASS);
  const y = (d: number) => poseAt(track, COURSE_ORIGIN + 4030 + d).y;
  assert.ok(Math.abs(y(68) - 7.65) < 0.01, `lip ${y(68)}`);
  assert.ok(Math.abs(y(80) - 9.0) < 0.01);
  assert.ok(Math.abs(y(200)) < 0.01 && Math.abs(y(140) - 4.5) < 0.01);
  assert.equal(poseAt(track, COURSE_ORIGIN + 4030 + 70).kicker, true);
  assert.equal(poseAt(track, COURSE_ORIGIN + 4030 + 60).kicker, false);
  // the default ramp (R1) is unchanged: 5.4 m at 60 m, kicker from 48 m
  assert.ok(Math.abs(poseAt(track, COURSE_ORIGIN + 2520 + 60).y - 5.4) < 0.01);
  assert.equal(poseAt(track, COURSE_ORIGIN + 2520 + 50).kicker, true);
  assert.equal(kickerWindow("pass", 4030 + SUMMIT_LEAP.kick), true);
  assert.equal(kickerWindow("pass", 4030 + 40), false);
});

test("§9.6 Summit Leap at 40 m/s: lands d 126 +-10, hp unchanged", () => {
  const sim = pass();
  const h = sim.cars[0];
  put(sim, 3990, 0, 40);
  h.invuln = 1e9;
  const hp = h.hp;
  let flew = false, land = -1;
  for (let i = 0; i < 60 * 6 && land < 0; i++) {
    h.speed = 40;
    sim.keysOverride = new Set();
    step(sim, dt);
    if (!h.grounded) flew = true;
    else if (flew) land = h.along - sim.race.originAlong - 4030;
  }
  console.log(`summit leap @40: landed d ${land.toFixed(1)}`);
  assert.ok(flew, "launched");
  assert.ok(Math.abs(land - 126) <= 10, `landed d ${land}`);
  assert.equal(h.hp, hp);
});

test("§9.3 18 m at 1100; rival targets within +-6 on the hairpin", () => {
  assert.equal(widthAt(MOUNTAIN_PASS, 1100), 18);
  const sim = pass();
  let worst = 0, seen = 0;
  sim.cars.forEach((c, i) => { if (c.racer) { c.along = sim.race.originAlong + 1050 + i * 12; c.lastAlong = c.along; c.lane = i % 2 ? 9 : -9; } });
  put(sim, 990, 0, 30);
  for (let i = 0; i < 60 * 4; i++) {
    sim.cars[0].invuln = 1e9;
    step(sim, dt);
    for (const c of sim.cars) {
      if (!c.racer || !c.alive) continue;
      const s = c.along - sim.race.originAlong;
      if (s > 1050 && s < 1250) { worst = Math.max(worst, Math.abs(c.lane)); seen++; }
    }
  }
  assert.ok(seen > 300, `rival samples on the hairpin ${seen}`);
  assert.ok(worst <= 6.5, `rival lane ${worst}`);
});

test("§9.2 bot at 48 m/s through MP-3 (Eagle Bend): no reset, speed >= 22 throughout (wall glances allowed)", async () => {
  const { botKeys } = await import("../../src/game/bot.ts");
  const sim = pass();
  const h = sim.cars[0];
  put(sim, 960, 0, 48);
  h.invuln = 1e9;
  const falls = sim.falls, lives = sim.lives;
  let minSpeed = 99, maxLat = 0;
  for (let i = 0; i < 60 * 10 && h.along - sim.race.originAlong < 1300; i++) {
    sim.keysOverride = new Set(botKeys(sim));
    step(sim, dt);
    minSpeed = Math.min(minSpeed, h.speed);
    maxLat = Math.max(maxLat, Math.abs(latOf(sim)));
  }
  console.log(`MP-3 bot: min speed ${minSpeed.toFixed(1)}, max |lat| ${maxLat.toFixed(2)}`);
  assert.ok(h.along - sim.race.originAlong >= 1300, "through MP-3");
  assert.equal(sim.falls, falls);
  assert.equal(sim.lives, lives);
  assert.ok(minSpeed >= 22 - 1e-6, `speed ${minSpeed}`);
  assert.ok(maxLat <= 9.01, `lat ${maxLat}`);
});

test("§9.4 rockfall: deterministic per stage; shadow 1.0 s before impact; a hit is -14 hp, no lateral change; obstacle 6 +-0.1 s", () => {
  // pure: the same hero inputs give the same rocks
  const run = () => { const st = freshRocks("pass"); const out: string[] = []; for (let t = 0; t < 12; t += dt) { stepRocks("pass", st, 1340 + t * 30, t); for (const r of st.rocks) if (!out.includes(r.id + r.s.toFixed(2))) out.push(r.id + r.s.toFixed(2)); } return out; };
  const a = run(), b = run();
  assert.ok(a.length >= 2, `rocks ${a.length}`);
  assert.deepEqual(a, b);
  // every target lies in its zone and is >= 40 m from the other live rock
  const sim = pass();
  const h = sim.cars[0];
  put(sim, 1330, LANE_LAT.L2, 30);
  h.invuln = 0;
  let rock: { id: string; t0: number; tImpact: number; s: number; lat: number } | null = null;
  for (let i = 0; i < 60 * 4 && !rock; i++) { h.speed = 30; step(sim, dt); rock = sim.rocks.rocks[0] ?? null; }
  assert.ok(rock, "a rock spawned in RF1");
  assert.ok(Math.abs(rock!.tImpact - rock!.t0 - ROCKFALL.telegraph) < 1e-9, "1.0 s telegraph");
  const z = PASS_ROCKFALL[0];
  assert.ok(rock!.s >= z.s0 && rock!.s <= z.s1);
  // park the hero under it until impact (speed 0 via a held position)
  const s2 = pass();
  const h2 = s2.cars[0];
  put(s2, 1330, 0, 30);
  let r2: { id: string; t0: number; tImpact: number; s: number; lat: number } | null = null;
  for (let i = 0; i < 60 * 4 && !r2; i++) { h2.speed = 30; step(s2, dt); r2 = s2.rocks.rocks[0] ?? null; }
  assert.ok(r2);
  put(s2, r2!.s, r2!.lat, 0);
  h2.invuln = 0;
  const hp = h2.hp, lat0 = latOf(s2);
  for (let g = 0; g < 600 && s2.time < r2!.tImpact + dt * 2; g++) { put(s2, r2!.s, r2!.lat, 0); h2.speed = 0; step(s2, dt); }
  assert.equal(hp - h2.hp, ROCKFALL.heroDmg);
  assert.ok(Math.abs(latOf(s2) - lat0) < 0.05, "no push");
  // the obstacle persists 6 +- 0.1 s
  const t0 = s2.time;
  const obs = () => s2.trucks.some((t) => t.id === r2!.id && t.alive);
  assert.ok(obs(), "landed rock is an obstacle");
  put(s2, r2!.s - 300, -9, 0);
  for (let g = 0; g < 600 && obs() && s2.time < t0 + 8; g++) { h2.speed = 0; put(s2, r2!.s - 300, -9, 0); step(s2, dt); }
  const life = s2.time - r2!.tImpact;
  assert.ok(Math.abs(life - ROCKFALL.life) <= 0.1, `obstacle ${life.toFixed(2)} s`);
});

test("§8.6 rock targets stay off lanes with ice within 40 m; RF2 / RF3 only on the left roadway", () => {
  for (const z of PASS_ROCKFALL) {
    const st = freshRocks("pass");
    for (let t = 0; t < 30; t += dt) {
      stepRocks("pass", st, z.s0 - 90 + t * 20, t);
      for (const r of st.rocks) {
        assert.ok(z.lanes.includes(r.lat), `${r.id} lane ${r.lat}`);
        for (const p of PASS_ICE) assert.ok(!(Math.abs(p.lat - r.lat) < 3.1 && r.s > p.s0 - 40 && r.s < p.s1 + 40), `${r.id} on ice ${p.id}`);
        for (const o of st.rocks) if (o !== r) assert.ok(Math.abs(o.s - r.s) >= ROCKFALL.window, "two live rocks within 40 m");
      }
    }
  }
  assert.ok(PASS_ROCKFALL.every((z) => z.s1 < 800 || z.s0 > 1000), "no rockfall in the shed");
});

test("§9.5 ice IC1: grip lowered while inside and 0.3 s after; speed unchanged", () => {
  const sim = pass();
  const h = sim.cars[0];
  put(sim, 1100, -6, 30);
  h.invuln = 1e9;
  sim.keysOverride = new Set(["KeyW"]);
  let inside = false, after = -1, left = -1, v0 = h.speed, vMin = 99;
  for (let i = 0; i < 60 * 3; i++) {
    // hold the lane (IC1 is mid-bend: unsteered, the car drifts out of the patch toward the outer wall, which is intended)
    put(sim, h.along - sim.race.originAlong, -6, h.speed);
    h.invuln = 1e9;
    step(sim, dt);
    const s = h.along - sim.race.originAlong;
    vMin = Math.min(vMin, h.speed);
    if (s > 1125 && s < 1145) inside ||= h.slickT > 0 && h.slickIce;
    if (s > 1150 && left < 0) left = sim.time;
    if (s > 1150 && after < 0 && h.slickT <= 0) after = sim.time - left;
  }
  assert.ok(inside, "ice grip inside IC1");
  // the 0.3 s residue after leaving the patch
  assert.ok(Math.abs(after - 0.3) <= 2.5 * dt, `residue ${after.toFixed(3)} s`);
  assert.ok(vMin >= v0 - 0.5, `speed ${vMin} vs ${v0}`);
  assert.equal(ICE.gripMul, 0.3);
  assert.equal(ICE.steerMul, 0.55);
});

test("K-B kicker on L3 clears the snowdrift row at 3688 at 22 m/s (no OB hit)", () => {
  const sim = pass();
  const h = sim.cars[0];
  put(sim, 3640, LANE_LAT.L3, 22);
  h.invuln = 0;
  const hp = h.hp;
  let flew = false;
  for (let i = 0; i < 60 * 3; i++) { h.speed = Math.max(22, h.speed); sim.keysOverride = new Set(); step(sim, dt); if (!h.grounded) flew = true; }
  assert.ok(flew, "kicked");
  assert.ok(h.along - sim.race.originAlong > 3700);
  assert.equal(h.hp, hp);
});

test("§9.7 bot completes Mountain Pass with the six-rival field", async () => {
  const { botKeys } = await import("../../src/game/bot.ts");
  const sim = createSim();
  sim.carId = "model3";
  sim.stageId = "pass";
  begin(sim);
  sim.lull = 1e9;
  let i = 0;
  for (; i < 60 * 260 && sim.phase === "playing"; i++) {
    sim.keysOverride = new Set(botKeys(sim));
    step(sim, dt);
  }
  const rivals = sim.cars.filter((c) => c.racer);
  console.log(`pass bot: phase ${sim.phase} after ${(i / 60).toFixed(1)} s, place ${sim.race.place}, rivals ${rivals.length} (alive ${rivals.filter((c) => c.alive).length}), hp ${sim.cars[0].hp}, lives ${sim.lives}, falls ${sim.falls}`);
  assert.equal(sim.phase, "finished");
  assert.equal(rivals.length, 6);
});

test("locked ART LIST counts: every placement count matches §A", async () => {
  const { passPlacements, PASS_COUNTS: C } = await import("../../src/game/passcourse.ts");
  const all = passPlacements();
  const n = (name: string, f: (p: (typeof all)[number]) => boolean = () => true) => all.filter((p) => p.name === name && f(p)).length;
  assert.equal(n("mtn_chevron_board"), C.chevrons);
  assert.equal(n("mtn_guardrail_snow_4m"), C.guardrail);
  assert.equal(n("mtn_rock_wall_strip"), C.walls);
  assert.equal(n("mtn_scree_strip"), C.scree);
  assert.equal(n("barrier_jersey_4m"), C.jersey);
  assert.equal(n("barrier_jersey_4m", (p) => p.s < 3000), 110);
  assert.equal(n("coast_guardrail_end_4m"), C.ends);
  assert.equal(n("sign_fork"), C.signFork);
  assert.equal(n("mtn_ice_decal"), C.ice);
  assert.equal(n("mtn_snow_shed_40"), C.shed);
  assert.equal(n("mtn_snow_shed_portal"), C.portals);
  assert.equal(n("mtn_frozen_lake_40"), C.lake);
  assert.equal(n("mtn_flag"), C.flags);
  assert.equal(n("mtn_snow_pine"), C.pines);
  assert.equal(n("mtn_snow_pine", (p) => p.s < 300), 40);
  assert.equal(n("mtn_fence_4m"), C.fence);
  assert.equal(n("coast_crate"), C.crates);
  assert.equal(n("mtn_lodge"), 1);
  assert.equal(n("mtn_summit_station"), 1);
  assert.equal(n("mtn_skijump_structure"), 1);
  assert.equal(n("mtn_snow_kicker_6"), 1);
  assert.equal(n("mtn_snowdrift_row_6"), 1);
  // per-section guardrail / wall / chevron splits (§A)
  const inS = (a: number, b: number) => (p: (typeof all)[number]) => p.s >= a && p.s < b;
  assert.equal(n("mtn_guardrail_snow_4m", inS(300, 800)), 125);
  assert.equal(n("mtn_guardrail_snow_4m", inS(2670, 3470)), 200);
  assert.equal(n("mtn_guardrail_snow_4m", inS(4230, 4800)), 68);
  assert.equal(n("mtn_rock_wall_strip", inS(2670, 3470)), 20);
  assert.equal(n("mtn_chevron_board", inS(1000, 1260)), 33);
  assert.equal(n("mtn_chevron_board", inS(2670, 3470)), 75);
});

test("§B piece budgets (tris)", async () => {
  const { passPieceTris } = await import("../../src/game/mountain.ts");
  const B: [string, number][] = [
    ["mtn_rock_wall_strip", 80], ["mtn_scree_strip", 80], ["mtn_guardrail_snow_4m", 96], ["mtn_chevron_board", 40], ["mtn_snow_shed_40", 300],
    ["mtn_snow_shed_portal", 300], ["mtn_snow_pine", 200], ["mtn_ice_decal", 20], ["mtn_snowdrift_row_6", 80], ["mtn_snow_kicker_6", 150],
    ["mtn_frozen_lake_40", 8], ["mtn_skijump_structure", 1500], ["mtn_lodge", 800], ["mtn_summit_station", 900],
  ];
  for (const [name, max] of B) {
    const t = passPieceTris(name);
    assert.ok(t > 0 && t <= max, `${name} ${t} > ${max}`);
  }
  assert.ok(passPieceTris("mtn_ice_decal", { len: 60 }) <= 20);
  const { rockGeometry, rockShadowGeometry, peakBackdropGeometry } = await import("../../src/game/mountain.ts");
  assert.ok(rockGeometry().getAttribute("position").count / 3 <= 120);
  assert.ok(rockShadowGeometry().getAttribute("position").count / 3 <= 8);
  assert.ok(peakBackdropGeometry().getAttribute("position").count / 3 <= 4 * 200);
});

test("terrain: the corridor sits under the deck on every leg; uphill walls climb, valley sides drop", async () => {
  const { passGroundY, PASS_FLOOR } = await import("../../src/game/passterrain.ts");
  const track = buildCourseTrack(MOUNTAIN_PASS);
  for (let s = 0; s <= 4800; s += 20) {
    const p = poseAt(track, COURSE_ORIGIN + s);
    for (const lat of [-10, 0, 10]) {
      const y = passGroundY(p.x + p.rx * lat, p.z + p.rz * lat);
      assert.ok(y <= PASS_FLOOR + 0.05 && y >= PASS_FLOOR - 1.2, `ground ${y.toFixed(2)} at s ${s} lat ${lat}`);
    }
  }
  const p = poseAt(track, COURSE_ORIGIN + 600);
  const up = passGroundY(p.x - p.rx * 40, p.z - p.rz * 40), down = passGroundY(p.x + p.rx * 40, p.z + p.rz * 40);
  assert.ok(up > 10 && down < -10, `MP-1 uphill ${up.toFixed(1)} / valley ${down.toFixed(1)}`);
});

test("pass strips sample fractional chunk indices (odd-metre starts) without reading past the sample array", async () => {
  const { poseAtK } = await import("../../src/game/mountain.ts");
  const at = (k: number) => {
    assert.ok(Number.isInteger(k), `integer sample index, got ${k}`);
    return { x: k * 2, y: k * 0.1, z: 0, tx: 1, tz: 0, rx: 0, rz: 1 };
  };
  const p = poseAtK(at, 3.5);
  assert.ok(Math.abs(p.x - 7) < 1e-9 && Math.abs(p.y - 0.35) < 1e-9 && p.tx === 1 && p.rz === 1);
  assert.equal(poseAtK(at, 4).x, 8);
});
