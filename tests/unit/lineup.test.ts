/**
 * M2 lineup: locked stats, save migration, Model S track toggle, mine cap, boost exclusivity.
 * Ranking order is M2_SPEC § Ranking checks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOST_HOP_MAX,
  BOOST_SPEED_CAP,
  CAR_IDS,
  CAR_STATS,
  begin,
  createSim,
  hasBoost,
  migrateCarId,
  resolvedStats,
  step,
  supportsTrackMode,
} from "../../src/game/sim.ts";

const ids = CAR_IDS;

test("migrate: volt family → model3, both roadsters → roadster, unknown → model3", () => {
  for (const id of ["volt", "volt_r", "volt_rs"]) assert.equal(migrateCarId(id), "model3");
  assert.equal(migrateCarId("roadster"), "roadster");
  assert.equal(migrateCarId("roadster2026"), "roadster");
  assert.equal(migrateCarId(null), "model3");
  assert.equal(migrateCarId(undefined), "model3");
  assert.equal(migrateCarId(""), "model3");
  assert.equal(migrateCarId("highland"), "model3");
  for (const id of ids) assert.equal(migrateCarId(id), id);
});

test("ranking checks 1–7 and the locked stat rows", () => {
  const off = (id: (typeof ids)[number]) => resolvedStats(id, false);
  const on = (id: (typeof ids)[number]) => resolvedStats(id, true);
  const a = {
    roadster: off("roadster").accel,
    sOn: on("model_s").accel,
    sOff: off("model_s").accel,
    x: off("model_x").accel,
    m3: off("model3").accel,
    ct: off("cybertruck").accel,
    y: off("model_y").accel,
  };
  assert.ok(a.roadster > a.sOn && a.sOn > a.sOff && a.sOff >= a.x && a.x > a.m3 && a.m3 > a.ct && a.ct >= a.y, JSON.stringify(a));
  const t = {
    sOn: on("model_s").topSpeed,
    roadster: off("roadster").topSpeed,
    sOff: off("model_s").topSpeed,
    x: off("model_x").topSpeed,
    m3: off("model3").topSpeed,
    y: off("model_y").topSpeed,
    ct: off("cybertruck").topSpeed,
  };
  // Locked rows put Model S off (54) above Roadster (52). The spec sentence
  // "roadster ≥ model_s(off)" does not match that table; this assert follows the rows:
  // S on > S off > roadster > X > 3 > Y > cybertruck.
  assert.ok(t.sOn > t.sOff && t.sOff > t.roadster && t.roadster > t.x && t.x > t.m3 && t.m3 > t.y && t.y > t.ct, JSON.stringify(t));
  const hp = Object.fromEntries(ids.map((id) => [id, off(id).maxHp]));
  assert.ok(hp.cybertruck > hp.model_x && hp.model_x >= hp.model_y && hp.model_y > hp.model_s && hp.model_s >= hp.model3 && hp.model3 > hp.roadster, JSON.stringify(hp));
  const mines = Object.fromEntries(ids.map((id) => [id, off(id).mineCap]));
  assert.ok(mines.cybertruck > mines.model_y && mines.model_y === mines.model_x && mines.model_x > mines.model3 && mines.model3 === mines.model_s && mines.model_s > mines.roadster, JSON.stringify(mines));
  for (const id of ids) {
    assert.equal(hasBoost(id), id === "roadster", id);
    assert.equal(supportsTrackMode(id), id === "model_s", id);
    assert.equal(CAR_STATS[id].roughTerrain, id === "cybertruck", id);
    assert.equal(off(id).trackMode, id === "model_s");
  }
  assert.equal(hasBoost("roadster2026"), true);
  assert.equal(hasBoost("volt_rs"), false);
  assert.deepEqual(
    ids.map((id) => [id, off(id).topSpeed, off(id).accel, off(id).maxHp, off(id).mineCap, off(id).handling]),
    [
      ["model3", 48, 24, 100, 4, 1],
      ["model_y", 46, 22, 110, 7, 0.95],
      ["model_x", 50, 26, 115, 7, 0.92],
      ["model_s", 54, 28, 105, 4, 1.05],
      ["cybertruck", 44, 23, 160, 12, 0.85],
      ["roadster", 52, 34, 75, 2, 1.1],
    ],
  );
  assert.deepEqual([on("model_s").topSpeed, on("model_s").accel, on("model_s").handling], [64, 30, 1.15]);
  assert.equal(on("model3").topSpeed, 48, "track flag does nothing off Model S");
  assert.equal(BOOST_HOP_MAX, 7.5);
  assert.equal(BOOST_SPEED_CAP, 58);
});

function flat(carId: string) {
  const sim = createSim();
  sim.carId = carId;
  begin(sim);
  sim.lull = 1e9;
  for (const s of sim.track.samples) {
    s.y = 0;
    s.gap = false;
    s.kicker = false;
  }
  sim.track.width = 1000;
  return sim;
}

test("Model S track toggle: default off, T and touch flip stats, other cars ignore T", () => {
  const sim = flat("model_s");
  assert.equal(sim.trackOn, false);
  assert.equal(resolvedStats(sim.carId, sim.trackOn).topSpeed, 54);
  sim.trackOn = true;
  begin(sim);
  sim.lull = 1e9;
  assert.equal(sim.trackOn, false, "begin does not auto-enable");
  sim.keys = new Set(["KeyT"]);
  begin(sim);
  sim.lull = 1e9;
  step(sim, 1 / 60);
  assert.equal(sim.trackOn, false, "a key already held at the start is not a press");
  sim.keysOverride = new Set(["KeyW"]);
  step(sim, 1 / 60);
  sim.keysOverride = new Set(["KeyW", "KeyT"]);
  step(sim, 1 / 60);
  assert.equal(sim.trackOn, true);
  assert.equal(resolvedStats(sim.carId, sim.trackOn).topSpeed, 64);
  assert.equal(resolvedStats(sim.carId, sim.trackOn).accel, 30);
  assert.equal(resolvedStats(sim.carId, sim.trackOn).handling, 1.15);
  step(sim, 1 / 60);
  assert.equal(sim.trackOn, true, "held T does not toggle every frame");
  sim.keysOverride = new Set(["KeyW"]);
  step(sim, 1 / 60);
  sim.touchTrack = true;
  step(sim, 1 / 60);
  assert.equal(sim.trackOn, false);
  assert.equal(sim.touchTrack, false);
  const other = flat("model_x");
  other.keysOverride = new Set(["KeyT"]);
  other.touchTrack = true;
  step(other, 1 / 60);
  assert.equal(other.trackOn, false);
  assert.equal(resolvedStats(other.carId, true).topSpeed, 50);
});

test("drive caps follow the stat row; track-on S exceeds stock S; boost cap stays 58", () => {
  const peak = (carId: string, track: boolean, keys: string[], secs = 8) => {
    const sim = flat(carId);
    sim.trackOn = track;
    let max = 0;
    for (let i = 0; i < secs * 60; i++) {
      sim.keysOverride = new Set(keys);
      step(sim, 1 / 60);
      max = Math.max(max, sim.cars[0].speed);
    }
    return max;
  };
  const sOff = peak("model_s", false, ["KeyW"]);
  const sOn = peak("model_s", true, ["KeyW"]);
  const road = peak("roadster", false, ["KeyW"]);
  const y = peak("model_y", false, ["KeyW"]);
  const ct = peak("cybertruck", false, ["KeyW"]);
  assert.ok(sOff <= 54 + 1e-6 && sOff > 50, `S off ${sOff}`);
  assert.ok(sOn <= 64 + 1e-6 && sOn > 54, `S on ${sOn}`);
  assert.ok(road <= 52 + 1e-6 && road > 48, `roadster ${road}`);
  assert.ok(y <= 46 + 1e-6, `model y ${y}`);
  assert.ok(ct <= 44 + 1e-6, `cybertruck ${ct}`);
  const hop = peak("roadster", false, ["KeyW", "Space"], 3);
  assert.ok(hop <= BOOST_SPEED_CAP + 1e-6 && hop > 52, `boost cap ${hop}`);
  const m3 = flat("volt_r");
  let yMax = 0;
  let vMax = 0;
  for (let i = 0; i < 4 * 60; i++) {
    m3.keysOverride = new Set(["KeyW", "Space"]);
    step(m3, 1 / 60);
    yMax = Math.max(yMax, m3.cars[0].y);
    vMax = Math.max(vMax, m3.cars[0].speed);
  }
  assert.equal(yMax, 0, "legacy Model 3 ids do not boost");
  assert.ok(vMax <= 48 + 1e-6, `legacy cap ${vMax}`);
});

test("mine regen clamps to mineCap (cybertruck 12, roadster 2, not the old hard 4)", () => {
  const ct = flat("cybertruck");
  assert.equal(ct.cars[0].mines, 12);
  assert.equal(ct.cars[0].maxHp, 160);
  ct.cars[0].mines = 11.5;
  for (let i = 0; i < 180; i++) {
    ct.keysOverride = new Set(["KeyW"]);
    step(ct, 1 / 60);
  }
  assert.ok(ct.cars[0].mines <= 12 && ct.cars[0].mines > 11.5);
  const rs = flat("roadster");
  assert.equal(rs.cars[0].mines, 2);
  assert.equal(rs.cars[0].maxHp, 75);
  rs.cars[0].mines = 1.2;
  for (let i = 0; i < 180; i++) {
    rs.keysOverride = new Set(["KeyW"]);
    step(rs, 1 / 60);
  }
  assert.ok(rs.cars[0].mines <= 2 && rs.cars[0].mines > 1.2);
});
