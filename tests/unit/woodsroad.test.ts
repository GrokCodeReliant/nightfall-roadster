// Pine Woods (LEVELS/03_pine_woods.md v1.0, locked): course table, log rows / kickers / gates / gravel, BN-17 logging
// trucks (spawn, contact, rival avoidance, reset / respawn clearance), the authored scatter table (locked art counts)
// and the Art kit v2 loader inputs (22 GLBs, child nodes, kit / kit_emissive only, inlined by the package step).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GRAVEL, LANE_LAT, PINE_WOODS, WOODS_GATES, WOODS_GRAVEL, WOODS_KICKERS, WOODS_OBSTACLES, COURSE_ORIGIN,
  courseFor, edgeKind, medianAt, obstacleOverlap, respawnBlocked, sandAt, sectionAt, sectionById, surfaceParams, tunnelClearance,
} from "../../src/game/course.ts";
import { FLOOR_PATCH, PW_LEN, PW_ZONES, WOODS_BRIDGE, WOODS_COUNTS, WOODS_SET, floorPatches, woodsFog, woodsIn, woodsPlacements } from "../../src/game/woodscourse.ts";
import { chunkCourse } from "../../src/game/coastcourse.ts";
import { TRUCK, WOODS_TRUCKS, freshTrucks, pullOffAt, stepTrucks, truckAhead } from "../../src/game/trucks.ts";
import { WOODS_PIECES, BRIDGE_HIDE, FLOOR_PATCH_UV, PINE_LOD } from "../../src/game/woods.ts";
import { buildCourseTrack, poseAt, queryTrack, yawFromDir } from "../../src/game/road.ts";
import { RACE_HP, RIVAL_COUNT, SCROLL_MIN, begin, createSim, debugKill, step, type Sim } from "../../src/game/sim.ts";

const dt = 1 / 60;
const track = buildCourseTrack(PINE_WOODS);
const yawAt = (abs: number) => yawFromDir(poseAt(track, abs).tx, poseAt(track, abs).tz);
const turn = (s0: number, s1: number) => yawAt(COURSE_ORIGIN + s1) - yawAt(COURSE_ORIGIN + s0);
type Car = Sim["cars"][number];

function woods() {
  const sim = createSim();
  sim.stageId = "woods";
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = new Set();
  sim.nextCrate = 1e9;
  return sim;
}
function plant(sim: Sim, car: Car, raceS: number, lat: number, speed: number) {
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
  car.grounded = true;
  car.invuln = 0;
  car.offT = 0;
}
const raceS = (sim: Sim, car = sim.cars[0]) => car.along - sim.race.originAlong;

test("PW table: contiguous, 4400 m, matches the zone list, edges and medians as locked", () => {
  let sum = 0;
  for (const sec of PINE_WOODS.sections) {
    assert.equal(sec.s0, sum, sec.id);
    assert.equal(sec.width, 24, sec.id);
    sum += sec.len;
  }
  assert.equal(sum, 4400);
  assert.equal(PINE_WOODS.length, 4400);
  assert.equal(PW_LEN, 4400);
  assert.equal(courseFor("woods"), PINE_WOODS);
  assert.deepEqual(PW_ZONES.map((z) => [z.id, z.s0, z.s1]), PINE_WOODS.sections.map((s) => [s.id, s.s0, s.s0 + s.len]));
  assert.equal(sectionById(PINE_WOODS, "PW-5")?.type, "tunnel");
  for (const id of ["PW-2", "PW-7"]) assert.equal(sectionById(PINE_WOODS, id)?.type, "ramp");
  for (const id of ["PW-4", "PW-8"]) assert.equal(sectionById(PINE_WOODS, id)?.type, "split");
  const rail = ["PW-2", "PW-5", "PW-7", "PW-9"];
  for (const sec of PINE_WOODS.sections) {
    const want = rail.includes(sec.id) ? "rail" : "soft";
    assert.equal(sec.edgeL, want, sec.id);
    assert.equal(sec.edgeR, want, sec.id);
  }
  assert.deepEqual(PINE_WOODS.medians.map((m) => [m.s0, m.s1]), [[1360, 1740], [2520, 2850]]);
  assert.equal(medianAt(PINE_WOODS, 1500)?.half, 0.3);
  assert.equal(sectionAt(PINE_WOODS, 4400)?.id, "PW-11");
  assert.ok(tunnelClearance(PINE_WOODS).ok, JSON.stringify(tunnelClearance(PINE_WOODS)));
});

test("PW headings: PW-1 -0.85, PW-3 +0.556, PW-4 +1.333, PW-6 net 0, PW-9 net +0.667, PW-10 -0.667 rad", () => {
  const near = (got: number, want: number, id: string) => assert.ok(Math.abs(got - want) <= 0.02, `${id} ${got.toFixed(3)} want ${want}`);
  near(turn(300, 640), -340 / 400, "PW-1");
  near(turn(850, 1350), 500 / 900, "PW-3");
  near(turn(1350, 1750), 400 / 300, "PW-4");
  near(turn(1910, 2250), 0, "PW-6");
  near(turn(2860, 3460), 200 / 200 - 200 / 200 + 200 / 300, "PW-9");
  near(turn(3460, 4100), -400 / 600, "PW-10");
  near(turn(1750, 1910), 0, "PW-5 bridge straight");
});

test("PW logs: 10 rows, 4 kickers 8 m before a row in their lane, gates, gravel GV1/GV2 (cap 36, decel 12, steer 0.85)", () => {
  assert.equal(WOODS_OBSTACLES.length, 10);
  const rows = WOODS_OBSTACLES.map((o) => [o.s, o.lat]);
  assert.deepEqual(rows, [[1428, -3], [1528, -9], [1628, -3], [2000, -9], [2000, -3], [2120, 3], [2200, 9], [3000, -3], [3300, 3], [3568, 9]]);
  for (const o of WOODS_OBSTACLES) assert.deepEqual([o.latHalf, o.alongHalf, o.h], [3, 0.6, 1.0], o.id);
  assert.deepEqual(WOODS_KICKERS.map((k) => [k.id, k.s, k.lat]), [["LK1", 1420, -3], ["LK2", 1520, -9], ["LK3", 1620, -3], ["LK4", 3560, 9]]);
  for (const k of WOODS_KICKERS) assert.ok(WOODS_OBSTACLES.some((o) => o.s === k.s + 8 && o.lat === k.lat), k.id);
  assert.deepEqual(WOODS_GATES.map((g) => [g.id, g.s, g.side]), [["G1", 1100, "both"], ["G-B", 2690, "right"], ["G3", 4180, "both"]]);
  assert.deepEqual(GRAVEL, { cap: 36, decel: 12, steerMul: 0.85, gripMul: 1 });
  assert.equal(sandAt("woods", 2600, LANE_LAT.L3)?.id, "GV1");
  assert.equal(sandAt("woods", 2760, LANE_LAT.L4)?.id, "GV2");
  assert.equal(sandAt("woods", 2600, LANE_LAT.L4), null);
  assert.equal(surfaceParams(WOODS_GRAVEL[0]), GRAVEL);
});

test("PW logs never close more than 2 lanes on the main road or more than 1 lane per fork side (static + trucks every 0.25 s)", () => {
  const lanes = [LANE_LAT.L1, LANE_LAT.L2, LANE_LAT.L3, LANE_LAT.L4];
  const closedAt = (s: number, extra: { s: number; lat: number }[]) => lanes.filter((lat) =>
    WOODS_OBSTACLES.some((o) => obstacleOverlap({ ...o, latHalf: o.latHalf - 0.5 }, s, lat) && Math.abs(o.lat - lat) < 3) ||
    extra.some((t) => Math.abs(t.s - s) <= TRUCK.alongHalf && Math.abs(t.lat - lat) < 3));
  const check = (s: number, extra: { s: number; lat: number }[], tag: string) => {
    const closed = closedAt(s, extra);
    if (medianAt(PINE_WOODS, s)) {
      assert.ok(closed.filter((l) => l < 0).length <= 1 && closed.filter((l) => l > 0).length <= 1, `${tag} fork side closed at ${s}: ${closed}`);
    } else assert.ok(closed.length <= 2, `${tag} ${closed.length} lanes closed at ${s}`);
  };
  for (let s = 0; s <= 4400; s += 1) check(s, [], "static");
  // trucks: hero at a steady 22..40 m/s, sampled every 0.25 s
  for (const v of [22, 30, 40]) {
    const trucks = freshTrucks("woods");
    let hs = 0;
    for (let t = 0; hs < 4400; t += 0.25) {
      stepTrucks("woods", trucks, hs, 0.25);
      hs += v * 0.25;
      const live = trucks.filter((x) => x.alive).map((x) => ({ s: x.s, lat: x.lat }));
      for (const x of live) check(Math.round(x.s), live, `trucks@${v}`);
    }
  }
});

test("BN-17 trucks: 6 placements as locked, 20 m/s, spawn 300 m ahead, max 3 alive, pull off only on soft edges, no row in a truck's run", () => {
  assert.deepEqual(WOODS_TRUCKS.map((t) => [t.id, t.lane, t.s0, t.s1]), [
    ["LT1", "L3", 1000, 1600], ["LT2", "L4", 1200, 1800], ["LT3", "L3", 1360, 1960],
    ["LT4", "L1", 2560, 3160], ["LT5", "L1", 2590, 3190], ["LT6", "L2", 3800, 4300],
  ]);
  assert.equal(TRUCK.speed, 20);
  assert.ok(TRUCK.speed < SCROLL_MIN, "always catchable");
  // rail exits run on to the rail's end (LT2 in the bridge, LT4/LT5 on the switchbacks)
  assert.deepEqual(WOODS_TRUCKS.map((t) => pullOffAt("woods", t)), [1600, 1910, 1960, 3460, 3460, 4300]);
  for (const t of WOODS_TRUCKS) {
    const end = pullOffAt("woods", t);
    assert.equal(edgeKind(PINE_WOODS, end, LANE_LAT[t.lane] < 0 ? "L" : "R"), "soft", t.id);
    for (const o of WOODS_OBSTACLES) assert.ok(!(o.lat === LANE_LAT[t.lane] && o.s >= t.s0 && o.s <= end + TRUCK.pull), `${t.id} meets ${o.id}`);
    // a kicker landing on a truck roof is impossible: no spawn within 60 m after a kicker
    for (const k of WOODS_KICKERS) assert.ok(!(t.s0 - (k.s + k.len) >= 0 && t.s0 - (k.s + k.len) < 60), `${t.id} after ${k.id}`);
  }
  const trucks = freshTrucks("woods");
  stepTrucks("woods", trucks, 690, dt);
  assert.equal(trucks.filter((t) => t.alive).length, 0, "not before hero s 700");
  stepTrucks("woods", trucks, 700, dt);
  assert.deepEqual(trucks.filter((t) => t.alive).map((t) => t.id), ["LT1"]);
  const s0 = trucks[0].s;
  stepTrucks("woods", trucks, 700, 1);
  assert.ok(Math.abs(trucks[0].s - s0 - 20) < 1e-6, "20 m/s");
  let maxAlive = 0;
  const all = freshTrucks("woods");
  for (let hs = 0; hs < 4400; hs += 22 * dt) {
    stepTrucks("woods", all, hs, dt);
    maxAlive = Math.max(maxAlive, all.filter((t) => t.alive).length);
    for (const t of all) if (t.alive) assert.ok(t.s >= hs - TRUCK.behind - 1, `${t.id} kept 150 m behind`);
  }
  assert.ok(maxAlive <= 3, `max alive ${maxAlive}`);
  assert.ok(all.every((t) => t.done && !t.alive), "every truck despawned by the finish");
  assert.equal(truckAhead(all, 0, 0), null);
});

test("BN-17 hero contact: -8 hp, x0.85 speed (floor 22), glance to a free lane; trucks are not cars and never respawn", () => {
  const sim = woods();
  const hero = sim.cars[0];
  const cars = sim.cars.length;
  for (const c of sim.cars) if (!c.hero) c.alive = false;
  const lt1 = sim.trucks.find((t) => t.id === "LT1")!;
  plant(sim, hero, 1050, LANE_LAT.L3, 40);
  lt1.alive = true;
  lt1.s = 1064;
  const hp = hero.hp;
  sim.keysOverride = new Set(["KeyW"]);
  let hit = false;
  for (let i = 0; i < 120 && !hit; i++) {
    step(sim, dt);
    hit = hero.hp < hp;
  }
  assert.ok(hit, "hero met the truck");
  assert.equal(hp - hero.hp, TRUCK.dmg);
  assert.ok(hero.speed >= SCROLL_MIN);
  const lat = queryTrack(sim.track, hero.x, hero.z, hero.along).lateral;
  assert.ok(Math.abs(lat - lt1.lat) >= TRUCK.latHalf + 1.1, `glanced clear (lat ${lat.toFixed(2)})`);
  assert.equal(sim.cars.length, cars, "trucks live outside sim.cars");
  assert.ok(sim.cars.every((c) => typeof c.id === "number"), "no truck in the car list (never racers, never respawned)");
  // a finished truck stays gone for the rest of the race
  lt1.alive = false;
  lt1.done = true;
  for (let i = 0; i < 60 * 3; i++) step(sim, dt);
  assert.equal(lt1.alive, false);
});

test("BN-17 rivals change lane within 40 m behind a truck and never hit it; a rival never respawns within 15 m of one", () => {
  const sim = woods();
  const hero = sim.cars[0];
  const rivals = sim.cars.filter((c) => c.racer);
  assert.equal(rivals.length, RIVAL_COUNT);
  for (const c of rivals.slice(1)) c.alive = false;
  const r = rivals[0];
  plant(sim, hero, 880, LANE_LAT.L1, 22); // just behind the rival (a 300 m gap would DNF the hero)
  plant(sim, r, 900, LANE_LAT.L3, 30);
  r.hp = RACE_HP;
  const lt1 = sim.trucks.find((t) => t.id === "LT1")!;
  for (const t of sim.trucks) t.done = true;
  lt1.done = false;
  lt1.alive = true;
  lt1.s = 1000;
  lt1.s1 = 1600;
  let changedAt = -1;
  for (let i = 0; i < 60 * 12; i++) {
    hero.speed = 22;
    step(sim, dt);
    const gap = lt1.s - (r.along - sim.race.originAlong);
    if (changedAt < 0 && Math.abs(r.lane - LANE_LAT.L3) > 2) changedAt = gap;
    if (raceS(sim, r) > lt1.s + 20) break;
  }
  assert.ok(changedAt > 0 && changedAt <= 40 + TRUCK.alongHalf * 2, `changed lane ${changedAt} m behind`);
  assert.equal(r.hp, RACE_HP, "no contact");
  assert.ok(raceS(sim, r) > lt1.s, "rival passed the truck");

  // respawn: the rival dies in L3 with a truck parked on its first respawn candidates
  const s2 = woods();
  const h2 = s2.cars[0];
  const a = s2.cars.filter((c) => c.racer)[0];
  for (const t of s2.trucks) t.done = true;
  const lt6 = s2.trucks.find((t) => t.id === "LT6")!;
  plant(s2, h2, 3900, 0, 0);
  plant(s2, a, 3900, LANE_LAT.L2, 30);
  h2.invuln = 1e9;
  assert.ok(debugKill(s2, a));
  for (let i = 0; i < 60 * 6 && !a.alive; i++) {
    lt6.alive = true;
    lt6.done = false;
    lt6.s = 3860;
    lt6.lat = LANE_LAT.L2;
    h2.speed = 0;
    step(s2, dt);
  }
  assert.ok(a.alive, "rival respawned in the woods race");
  const rs = raceS(s2, a);
  assert.ok(Math.abs(rs - 3860) >= 15 + TRUCK.alongHalf || Math.abs(a.lane - LANE_LAT.L2) >= 3 + TRUCK.latHalf, `respawned at ${rs.toFixed(1)} lane ${a.lane}`);
  // hero reset clearance uses the same rule; the static course check is unchanged
  assert.equal(respawnBlocked("woods", 1428, LANE_LAT.L2), true, "log row");
});

test("PW scatter table: locked art counts, nothing on the carriageway but road pieces, deterministic", () => {
  const all = woodsPlacements();
  const n = (name: string | RegExp) => all.filter((p) => (typeof name === "string" ? p.name === name : name.test(p.name))).length;
  assert.equal(n(/^woods_pine_[ab]$/), 470);
  assert.equal(Object.values(WOODS_COUNTS.pines).reduce((a, b) => a + b, 0), 470);
  assert.ok(n("woods_pine_b") > 60 && n("woods_pine_b") < 200, "pine a/b mix");
  assert.equal(n("woods_broadleaf"), 20);
  assert.equal(n("woods_fern_clump"), 80);
  assert.equal(n("woods_stump"), 80);
  assert.equal(n("woods_snag"), 20);
  assert.equal(n(/^coast_rock_[ab]$/), 36);
  assert.equal(n("log_row_6"), 10);
  assert.equal(n("log_kicker_6"), 4);
  assert.equal(n("barrier_jersey_4m"), 178);
  assert.equal(n("coast_guardrail_end_4m"), 4);
  assert.equal(n("coast_guardrail_4m"), 300);
  assert.equal(n("woods_timber_wall_4m"), 150);
  assert.equal(n("woods_fence_4m"), 75);
  assert.equal(n("sign_fork"), 10);
  assert.equal(n("coast_crate"), 2);
  assert.equal(n("woods_log_stack"), 10);
  assert.equal(n("woods_slash_pile"), 8);
  assert.equal(n("woods_sawdust_pile"), 6);
  for (const one of ["woods_sawmill_shed", "woods_log_loader", "woods_lookout_tower", "woods_cabin"]) assert.equal(n(one), 1, one);
  assert.equal(n("woods_covered_bridge_40"), 4);
  assert.equal(n("woods_covered_bridge_portal"), 2);
  assert.equal(n("woods_river_40"), 4);
  // scatter clears the 12 m carriageway (+ kerb); road pieces (rows, kickers, jersey, signs, crates, decals, bridge) may sit on it
  const onRoad = new Set(["log_row_6", "log_kicker_6", "barrier_jersey_4m", "coast_guardrail_end_4m", "sign_fork", "coast_crate", "woods_gravel_decal", "woods_covered_bridge_40", "woods_covered_bridge_portal", "woods_river_40"]);
  for (const p of all) if (!onRoad.has(p.name)) assert.ok(Math.abs(p.lx) >= 12.5, `${p.name} at s ${p.s.toFixed(0)} lx ${p.lx.toFixed(1)}`);
  for (const p of all.filter((x) => /pine/.test(x.name))) assert.ok(Math.abs(p.lx) >= 16, "pines clear of the kerb");
  // shed: 30 x 20 footprint turned 90 deg, near wall off the carriageway; lookout ~16 m off the road past the finish
  assert.ok(WOODS_SET.shed.lx - 10 >= 13, "shed near wall clear of the road");
  assert.equal(Math.abs(WOODS_SET.lookout.lx), 16);
  assert.deepEqual(woodsPlacements(), all, "cached and deterministic");
  const chunk = woodsIn(1740, 1780).map((p) => p.name);
  assert.ok(chunk.includes("woods_covered_bridge_40") && chunk.includes("woods_covered_bridge_portal"));
  assert.deepEqual(WOODS_BRIDGE.sections, [1770, 1810, 1850, 1890]);
  assert.ok(BRIDGE_HIDE[0] <= WOODS_BRIDGE.s0 && BRIDGE_HIDE[1] >= WOODS_BRIDGE.s1);
  assert.deepEqual(PINE_LOD, { near: 120, far: 160 });
  // BN-20 fog hollow
  assert.equal(woodsFog(1000), 0.012);
  assert.equal(woodsFog(2100), 0.016);
  assert.ok(woodsFog(1880) > 0.012 && woodsFog(1880) < 0.016);
  // chunk zones
  const cc = chunkCourse("woods", 140 + 1760, 40, 2, () => true, []);
  assert.equal(cc.zone, "PW-5");
  assert.equal(cc.len, 4400);
});

test("Art kit v2 loader inputs: 22 woods GLBs on disk, child nodes for the hooks, kit / kit_emissive only, no textures, inlined by package", () => {
  const woodsList = WOODS_PIECES.filter(([d]) => d === "woods");
  assert.equal(woodsList.length, 22);
  const glb = (dir: string, name: string) => {
    const b = fs.readFileSync(`spa/public/assets/v02/${dir}/${name}.glb`);
    const n = b.readUInt32LE(12);
    return JSON.parse(b.subarray(20, 20 + n).toString()) as { nodes: { name: string; children?: number[] }[]; materials?: { name: string }[]; images?: { uri?: string }[] };
  };
  for (const [dir, name] of WOODS_PIECES) assert.ok(fs.existsSync(`spa/public/assets/v02/${dir}/${name}.glb`), `${dir}/${name}`);
  for (const [, name] of woodsList) {
    const j = glb("woods", name);
    for (const m of j.materials ?? []) assert.ok(m.name === "kit" || m.name === "kit_emissive", `${name}: ${m.name}`);
    for (const im of j.images ?? []) assert.ok(!im.uri || /road_kit_atlas\.png$/.test(im.uri), `${name}: image ${im.uri}`);
  }
  const child = (name: string, parent: string, kid: string) => {
    const j = glb("woods", name);
    const p = j.nodes.find((x) => x.name === parent)!;
    assert.ok(p && (p.children ?? []).some((i) => j.nodes[i].name === kid), `${name}: ${parent} > ${kid}`);
  };
  child("woods_covered_bridge_40", "woods_covered_bridge_40", "tunnel_roof");
  child("woods_covered_bridge_portal", "woods_covered_bridge_portal", "portal_crown");
  child("woods_pine_a", "woods_pine_a", "lod_far");
  child("woods_pine_b", "woods_pine_b", "lod_far");
  child("logging_truck", "body", "load");
  child("log_row_6", "log_row_6", "UCX_log_row_6");
  child("woods_sawmill_shed", "woods_sawmill_shed", "shed_roof");
  assert.match(fs.readFileSync("scripts/package.mjs", "utf8"), /\["city", "kit", "coast", "woods"(, "highway")?\]/);
  // the official atlas is not overwritten or duplicated into woods/
  assert.ok(!fs.existsSync("spa/public/assets/v02/woods/road_kit_atlas.png"));
});

test("PW floor patches (v2 floor lift): every footprint clear of road + shoulder, deterministic, within the instance cap, atlas swatch", () => {
  const all = floorPatches(-200, PW_LEN + 400);
  assert.ok(all.length > 2000);
  for (const f of all) {
    assert.ok(Math.abs(f.lx) - f.r >= FLOOR_PATCH.clear - 1e-9, `patch at s ${f.s.toFixed(1)} lx ${f.lx.toFixed(2)} r ${f.r.toFixed(2)} reaches the shoulder`);
    assert.ok(Math.abs(f.lx) + f.r <= FLOOR_PATCH.lxMax + 1e-9);
    assert.ok(f.tone >= 0.35 && f.tone <= 0.65 && f.r >= FLOOR_PATCH.rMin && f.r <= FLOOR_PATCH.rMax);
  }
  // 13 m clear: outside the 12.6 m guardrail line / 13 m timber wall and the 12.5 m dress line the scatter test holds
  assert.ok(FLOOR_PATCH.clear >= 13);
  assert.deepEqual(floorPatches(400, 520), floorPatches(400, 520));
  // per 40 m chunk; 8 live chunks within 120 m fit the cap
  assert.equal(floorPatches(400, 440).length, FLOOR_PATCH.perChunk);
  assert.ok(FLOOR_PATCH.perChunk * 8 <= FLOOR_PATCH.cap);
  // wood cell on road_kit_atlas (also used by woods_log_stack / slash): no new texture
  const [u, v] = FLOOR_PATCH_UV;
  assert.ok(u > 0 && u < 1 && v > 0 && v < 1);
});
