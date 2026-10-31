import { test } from "node:test";
import assert from "node:assert/strict";
import { begin, createSim, debugSpawn, step } from "../../src/game/sim.ts";
import { botKeys } from "../../src/game/bot.ts";
import { gapAhead } from "../../src/game/road.ts";

test("player thrust does not lift enemies: their vy and height are unchanged", () => {
  const sim: any = createSim();
  begin(sim);
  sim.lull = 1e9;
  for (let i = 0; i < 120; i++) { sim.keysOverride = new Set(["KeyW"]); step(sim, 1 / 60); }
  const es = [["rammer", 8, -9], ["gunner", -8, 9], ["spiker", 3, 6], ["mine", 14, -3], ["boss", 20, 3]].map(([k, o, l]) => (debugSpawn as any)(sim, k, o, l));
  for (const e of es) e.ramCd = 99;
  for (let i = 0; i < 40; i++) { sim.keysOverride = new Set(["KeyW"]); step(sim, 1 / 60); }
  const flatAhead = !gapAhead(sim.track, sim.cars[0].along - 20, 120);
  assert.ok(flatAhead, "test stretch is flat");
  const before = es.map((e: any) => [e.y, e.vy]);
  let heroRose = 0;
  for (let i = 0; i < 90; i++) {
    sim.keysOverride = new Set(["KeyW", "Space"]);
    step(sim, 1 / 60);
    heroRose = Math.max(heroRose, sim.cars[0].y);
    es.forEach((e: any, k: number) => {
      if (!e.alive) return;
      assert.equal(e.thrust, 0, `${e.kind} thrust`);
      assert.equal(e.vy, before[k][1], `${e.kind} vy changed on frame ${i}`);
      assert.ok(Math.abs(e.y - before[k][0]) < 1e-9, `${e.kind} y changed on frame ${i}`);
    });
  }
  assert.ok(heroRose > 5, "the player really did thrust");
});

test("enemies never use thrusters, even at voids during a long fight", () => {
  const sim: any = createSim();
  begin(sim);
  for (let i = 0; i < 60 * 90 && sim.phase === "playing"; i++) {
    sim.keysOverride = new Set(botKeys(sim));
    step(sim, 1 / 60);
    for (const c of sim.cars) if (!c.hero && c.alive) assert.equal(c.thrust, 0, `${c.kind} thrusting at t=${(i / 60).toFixed(1)}`);
  }
});

// ---- M1 boost rules (M1_SPEC.md (c))
import { BOOST_COOLDOWN, BOOST_HOP_MAX, FLOAT_VY_MIN, readInput } from "../../src/game/sim.ts";
import { isNewer } from "../../src/game/update.ts";

function flatSim(carId: string) {
  const sim: any = createSim();
  sim.carId = carId;
  begin(sim);
  sim.lull = 1e9;
  // The first crate sits ~2.56 m off the racing line and the open radius is 2.6,
  // so a straight hop sometimes pays 4 hull. This stretch is about the landing.
  sim.nextCrate = 1e9;
  for (const s of sim.track.samples ?? []) { s.y = 0; s.gap = false; s.kicker = false; }
  sim.track.width = 1000;
  return sim;
}
const hold = (sim: any, keys: string[], secs: number, each?: (h: any) => void) => {
  for (let i = 0; i < Math.round(secs * 60); i++) { sim.keysOverride = new Set(keys); step(sim, 1 / 60); each?.(sim.cars[0]); }
};

test("Roadster hop: 10 s held never exceeds BOOST_HOP_MAX (+0.05) over the deck", () => {
  const sim = flatSim("roadster2026");
  hold(sim, ["KeyW"], 1);
  let top = 0;
  hold(sim, ["KeyW", "Space"], 10, (h) => { top = Math.max(top, h.y - sim.boostDeck); });
  assert.ok(top <= BOOST_HOP_MAX + 0.05, `peak ${top}`);
  assert.ok(top > 6, `really hopped ${top}`);
});

test("release at peak: soft landing, vy >= FLOAT_VY_MIN, no hard event, HP unchanged", () => {
  const sim = flatSim("roadster");
  hold(sim, ["KeyW"], 1);
  hold(sim, ["KeyW", "Space"], 1.2);
  const hp = sim.cars[0].hp;
  let minVy = 0, hard = false;
  hold(sim, ["KeyW"], 4, (h) => { minVy = Math.min(minVy, h.vy); for (const e of sim.events) if (e.t === "land" && e.hard) hard = true; });
  assert.ok(sim.cars[0].grounded, "landed");
  assert.ok(minVy >= FLOAT_VY_MIN - 1e-9, `vy ${minVy}`);
  assert.equal(hard, false);
  assert.equal(sim.cars[0].hp, hp);
});

test("Model 3s (volt*) with Space held: no lift, speed cap 48, Brake slows", () => {
  for (const id of ["volt", "volt_r", "volt_rs"]) {
    const sim = flatSim(id);
    let maxY = 0, maxV = 0;
    hold(sim, ["KeyW", "Space", "ShiftLeft"], 4, (h) => { maxY = Math.max(maxY, h.y); maxV = Math.max(maxV, h.speed); });
    assert.equal(maxY, 0, id);
    assert.ok(maxV <= 48 + 1e-9, `${id} ${maxV}`);
    sim.keysOverride = null; sim.keys = new Set(["Space"]); sim.touch.brake = true;
    assert.equal(readInput(sim).thrust, false);
    assert.equal(readInput(sim).throttle, -1);
  }
});

test("cooldown blocks a second take-off for BOOST_COOLDOWN after landing", () => {
  const sim = flatSim("roadster");
  hold(sim, ["KeyW"], 1);
  hold(sim, ["KeyW", "Space"], 0.4);
  hold(sim, ["KeyW"], 4);
  assert.ok(sim.cars[0].grounded);
  // landed long ago -> cooldown expired; make a fresh landing then try at once
  sim.boostCd = BOOST_COOLDOWN;
  hold(sim, ["KeyW", "Space"], BOOST_COOLDOWN - 0.1, (h) => assert.ok(h.grounded, "blocked during cooldown"));
  hold(sim, ["KeyW", "Space"], 0.3);
  assert.ok(!sim.cars[0].grounded, "takes off after cooldown");
});

test("update banner compare: same / newer / older / missing fields", () => {
  const local = { version: "0.2.0", build: "abc1234" };
  assert.equal(isNewer({ version: "0.2.0", build: "abc1234" }, local), false);
  assert.equal(isNewer({ version: "0.2.0", build: "def5678" }, local), true);
  assert.equal(isNewer({ version: "0.3.0", build: "def5678" }, local), true);
  assert.equal(isNewer({ version: "0.1.9", build: "def5678" }, local), false);
  assert.equal(isNewer({ build: "def5678" }, local), false);
  assert.equal(isNewer({ version: "0.3.0" }, local), false);
  assert.equal(isNewer(null, local), false);
});
