// Open Highway (LEVELS/04_open_highway.md v1.0, locked) — openhighway-v1: course table + headings, colliders (roadworks,
// bridge-lip kickers, gates incl. the left-side G-B, gravel), RaceTrial at 5200 m with the respawn rule, the authored
// scatter table against the locked ART LIST counts, desert floor footprint, and the Art kit loader inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  COURSE_ORIGIN, HIGHWAY_GATES, HIGHWAY_GRAVEL, HIGHWAY_KICKERS, HIGHWAY_OBSTACLES, LANE_LAT, OPEN_HIGHWAY,
  courseFor, gatesFor, laneKickerAt, medianAt, obstaclesFor, respawnBlocked, sandAt, sectionAt, sectionById,
} from "../../src/game/course.ts";
import { DESERT_PATCH, HIGHWAY_COUNTS, HIGHWAY_FAR, HIGHWAY_SET, OH_LEN, OH_ZONES, desertPatches, highwayIn, highwayPlacements } from "../../src/game/highwaycourse.ts";
import { chunkCourse } from "../../src/game/coastcourse.ts";
import { HIGHWAY_PIECES, DESERT_PATCH_UV } from "../../src/game/highway.ts";
import { buildCourseTrack, poseAt, yawFromDir } from "../../src/game/road.ts";
import { RACE_DIST, RIVAL_COUNT, begin, createSim, debugKill, step, type Sim } from "../../src/game/sim.ts";

const dt = 1 / 60;
const track = buildCourseTrack(OPEN_HIGHWAY);
const yawAt = (abs: number) => yawFromDir(poseAt(track, abs).tx, poseAt(track, abs).tz);
const turn = (s0: number, s1: number) => yawAt(COURSE_ORIGIN + s1) - yawAt(COURSE_ORIGIN + s0);
const deg = (r: number) => (r * 180) / Math.PI;

function highway() {
  const sim = createSim();
  sim.stageId = "highway";
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set();
  sim.nextCrate = 1e9;
  return sim;
}

test("OH §9.1 table: contiguous, 5200 m, sections / edges / medians as locked, heading changes", () => {
  let sum = 0;
  for (const sec of OPEN_HIGHWAY.sections) {
    assert.equal(sec.s0, sum, sec.id);
    assert.equal(sec.width, 24, sec.id);
    sum += sec.len;
  }
  assert.equal(sum, 5200);
  assert.equal(OH_LEN, 5200);
  assert.equal(courseFor("highway"), OPEN_HIGHWAY);
  // zones = the spec's 12 rows (OH-9 carries Ramp R2 as its own section in the table)
  assert.deepEqual(OH_ZONES.map((z) => z.id), ["OH-0", "OH-1", "OH-2", "OH-3", "OH-4", "OH-5", "OH-6a", "OH-6", "OH-7", "OH-8", "OH-9", "OH-10"]);
  for (let s = 0; s < 5200; s += 10) assert.ok(sectionAt(OPEN_HIGHWAY, s), `section at ${s}`);
  assert.equal(sectionById(OPEN_HIGHWAY, "OH-5")?.type, "tunnel");
  for (const id of ["OH-6", "OH-9r"]) assert.equal(sectionById(OPEN_HIGHWAY, id)?.type, "ramp");
  assert.deepEqual([sectionById(OPEN_HIGHWAY, "OH-9r")!.s0, sectionById(OPEN_HIGHWAY, "OH-9r")!.len], [4500, 150]);
  for (const id of ["OH-4", "OH-8"]) assert.equal(sectionById(OPEN_HIGHWAY, id)?.type, "split");
  // OH-6a: exactly 60 m from the Mesa Cut portal to Ramp R1
  assert.equal(sectionById(OPEN_HIGHWAY, "OH-6")!.s0 - (sectionById(OPEN_HIGHWAY, "OH-5")!.s0 + 200), 60);
  const rail = ["OH-4", "OH-5", "OH-6", "OH-9r"];
  for (const sec of OPEN_HIGHWAY.sections) {
    const want = rail.includes(sec.id) ? "rail" : "soft";
    assert.equal(sec.edgeL, want, sec.id);
    assert.equal(sec.edgeR, want, sec.id);
  }
  assert.deepEqual(OPEN_HIGHWAY.medians.map((m) => [m.s0, m.s1]), [[2020, 2480], [3510, 4090]]);
  assert.equal(medianAt(OPEN_HIGHWAY, 2200)?.half, 0.3);
  // §1 cumulative headings −38°, −19° (OH-3 turns back +19°), +15°... per curve: OH-1 −38°, OH-3 +19°, OH-7 +34°, OH-8 −43°
  const t = (a: number, b: number) => deg(turn(a, b));
  assert.ok(Math.abs(t(300, 1100) - deg(-800 / 1200)) < 1.2, `OH-1 ${t(300, 1100)}`);
  assert.ok(Math.abs(t(1500, 2000) - deg(500 / 1500)) < 1.2, `OH-3 ${t(1500, 2000)}`);
  assert.ok(Math.abs(t(2910, 3500) - deg(590 / 1000)) < 1.2, `OH-7 ${t(2910, 3500)}`);
  assert.ok(Math.abs(t(3500, 4100) - deg(-600 / 800)) < 1.2, `OH-8 ${t(3500, 4100)}`);
  for (const [a, b] of [[0, 300], [1100, 1500], [2000, 2910], [4100, 5200]]) assert.ok(Math.abs(t(a, b)) < 0.05, `straight ${a}-${b}`);
});

test("OH colliders: roadworks rows, KA3 / KA4, gates (G-A right, G-B left), gravel as §2 / §3 / §5", () => {
  assert.deepEqual(HIGHWAY_OBSTACLES.map((o) => [o.id, o.s, o.lat]), [["OB-1", 2150, LANE_LAT.L2], ["OB-2", 2330, LANE_LAT.L1]]);
  assert.equal(obstaclesFor("highway"), HIGHWAY_OBSTACLES);
  assert.deepEqual(HIGHWAY_KICKERS.map((k) => [k.id, k.s, k.lat]), [["KA3", 2252, 3], ["KA4", 2252, 9]]);
  assert.ok(laneKickerAt("highway", 2254, 9) && laneKickerAt("highway", 2254, 3) && !laneKickerAt("highway", 2254, -3));
  assert.equal(gatesFor("highway"), HIGHWAY_GATES);
  assert.deepEqual(HIGHWAY_GATES.map((g) => [g.id, g.s, g.side]), [
    ["GC1", 1200, "both"], ["GC2", 1320, "both"], ["GC3", 1440, "both"], ["G-A", 2340, "right"],
    ["GC4", 3100, "both"], ["GC5", 3220, "both"], ["GC6", 3340, "both"], ["G-B", 3900, "left"],
  ]);
  assert.deepEqual(HIGHWAY_GRAVEL.map((g) => [g.id, g.s0, g.s1, g.lat]), [["GV1", 2200, 2280, -9], ["GV2", 3600, 3680, 3], ["GV3", 3800, 3880, 9]]);
  assert.equal(sandAt("highway", 3640, 3)?.id, "GV2");
  assert.ok(respawnBlocked("highway", 2150, LANE_LAT.L2) && !respawnBlocked("highway", 2150, LANE_LAT.L3));
});

test("OH §9.2 begin(highway): RaceTrial armed at 5200 m (was 2200), 6 rivals, no waves", () => {
  const sim = highway();
  assert.equal(RACE_DIST, 2200);
  assert.equal(sim.race.armed, true);
  assert.equal(sim.race.dist, 5200);
  assert.equal(sim.cars.filter((c) => c.racer && c.alive).length, RIVAL_COUNT);
  assert.equal(sim.wave, 0);
  assert.equal(sim.track.authored, true);
  for (let i = 0; i < 120; i++) step(sim, dt);
  assert.equal(sim.phase, "playing");
});

test("OH race respawns: a rival killed in Fork A respawns behind, on its own side, never in the roadworks", () => {
  const sim = highway();
  const hero = sim.cars[0];
  const p = poseAt(sim.track, sim.race.originAlong + 2300);
  hero.x = p.x + p.rx * -6; hero.z = p.z + p.rz * -6; hero.along = p.s; hero.lastAlong = p.s; hero.invuln = 1e9;
  const r = sim.cars.find((c) => c.racer && c.alive)!;
  r.along = sim.race.originAlong + 2340; r.lastAlong = r.along; r.lane = -3;
  const left = r.respawnsLeft;
  debugKill(sim, r);
  assert.equal(r.alive, false);
  const t0 = sim.time;
  while (!r.alive && sim.time - t0 < 6 && sim.phase === "playing") { hero.invuln = 1e9; step(sim, dt); }
  assert.equal(r.alive, true, "respawned");
  assert.ok(sim.time - t0 >= 1.95, `delay ${sim.time - t0}`);
  assert.equal(r.respawnsLeft, left - 1);
  const s = r.along - sim.race.originAlong;
  assert.ok(s <= hero.along - sim.race.originAlong + 1, `behind hero ${s}`);
  assert.ok(!respawnBlocked("highway", s, r.lane), `clear ${s} ${r.lane}`);
  if (medianAt(OPEN_HIGHWAY, s)) assert.ok(r.lane < 0, `kept the main side ${r.lane}`);
});

test("OH scatter table: locked ART LIST §A counts, every item on course, nothing on the carriageway", () => {
  const all = highwayPlacements();
  const n = (name: string | RegExp) => all.filter((p) => (typeof name === "string" ? p.name === name : name.test(p.name))).length;
  const cactiTotal = Object.values(HIGHWAY_COUNTS.cacti).reduce((a, b) => a + b, 0);
  assert.equal(cactiTotal, 70);
  assert.equal(n(/^desert_cactus_[ab]$/), 70);
  assert.ok(n("desert_cactus_a") > n("desert_cactus_b") && n("desert_cactus_b") > 10);
  assert.equal(n("desert_scrub"), 30);
  assert.equal(n("desert_rock_spire"), 12);
  assert.equal(n("sign_fork"), 20);
  assert.equal(n("overhead_gantry_24"), 3);
  assert.equal(n("barrier_jersey_4m"), 260);
  assert.equal(n("coast_guardrail_end_4m"), 4);
  assert.equal(n("coast_guardrail_4m"), 400);
  assert.equal(n("desert_fence_4m"), 150);
  assert.equal(n("salt_flat_tile_40"), 40);
  assert.equal(n("billboard_frame_blank"), 2);
  assert.equal(n("fuel_stop_set"), 1);
  assert.equal(n("tunnel_40"), 5);
  assert.equal(n("tunnel_portal"), 2);
  assert.equal(n("barricade_3m"), 4);
  assert.equal(n("ramp_kicker_1m"), 2);
  assert.equal(n("woods_gravel_decal"), 3);
  assert.equal(n("coast_crate"), 1);
  assert.equal(HIGHWAY_FAR.mesas.length, 4);
  assert.equal(HIGHWAY_FAR.turbines.length, 6);
  for (const m of HIGHWAY_FAR.mesas) assert.ok(m[1] >= 400 && m[1] <= 650, `mesa ${m}`);
  // gantries: never within 80 m of a ramp span (R1 2760-2910, R2 4500-4650), nothing overhead in 2760-2990
  for (const s of HIGHWAY_SET.gantries) for (const [a, b] of [[2760, 2990], [4500, 4650]]) assert.ok(s < a - 80 || s > b + 80 || (s > b && a === 2760 && s >= 2990), `gantry ${s}`);
  // scatter / set dress stays off the 12 m carriageway (+ shoulder); course pieces and spanning sets are exempt
  const onRoad = new Set(["barrier_jersey_4m", "coast_guardrail_end_4m", "coast_guardrail_4m", "sign_fork", "barricade_3m", "ramp_kicker_1m", "woods_gravel_decal", "coast_crate", "overhead_gantry_24", "tunnel_40", "tunnel_portal"]);
  for (const p of all) {
    assert.ok(p.s >= 0 && p.s <= 5200, `${p.name} ${p.s}`);
    if (!onRoad.has(p.name)) assert.ok(Math.abs(p.lx) >= 13, `${p.name} at lx ${p.lx}`);
  }
  // fuel stop: right side (lx < 0), canopy half toward the road, in OH-3
  const fuel = all.find((p) => p.name === "fuel_stop_set")!;
  assert.ok(fuel.lx < -12 - 20 + 0.5 && fuel.s > 1500 && fuel.s < 2000);
  assert.equal(highwayIn(2500, 2700).filter((p) => p.name === "tunnel_40").length, 5);
});

test("OH desert floor: patches clear of road + shoulder, deterministic, chunkCourse maps the zones", () => {
  for (let s = 0; s < 5600; s += 40) {
    const ps = desertPatches(s, s + 40);
    assert.ok(ps.length >= DESERT_PATCH.perChunk - 1 && ps.length <= DESERT_PATCH.perChunk + 1);
    for (const p of ps) assert.ok(Math.abs(p.lx) - p.r * p.sx >= DESERT_PATCH.clear - 1e-6 - p.r * (p.sx - 1), `patch ${s}`);
  }
  assert.deepEqual(desertPatches(400, 440), desertPatches(400, 440));
  assert.deepEqual(DESERT_PATCH_UV, [0.234, 0.515]);
  const cc = chunkCourse("highway", COURSE_ORIGIN + 1740, 40, 2, () => true, []);
  assert.equal(cc.zone, "OH-3");
  assert.equal(chunkCourse("highway", COURSE_ORIGIN - 20, 40, 2, () => true, []).grid, true);
  const fin = chunkCourse("highway", COURSE_ORIGIN + 5180, 40, 2, () => true, []);
  assert.equal(fin.finishK, 10);
});

test("OH Art kit: every highway GLB the loader asks for ships under spa/public/assets/v02, kit / kit_emissive only", () => {
  for (const [dir, name] of HIGHWAY_PIECES) {
    const f = `spa/public/assets/v02/${dir}/${name}.glb`;
    assert.ok(fs.existsSync(f), f);
    if (dir !== "highway") continue;
    const b = fs.readFileSync(f);
    const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    for (const m of j.materials) assert.ok(["kit", "kit_emissive"].includes(m.name), `${name} ${m.name}`);
  }
  const rotor = fs.readFileSync("spa/public/assets/v02/highway/wind_turbine_far.glb");
  assert.ok(rotor.includes(Buffer.from('"rotor"')));
});
