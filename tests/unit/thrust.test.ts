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
