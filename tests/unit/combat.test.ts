import { test } from "node:test";
import assert from "node:assert/strict";
import { begin, createSim, step, waveRoster, ENEMY } from "../../src/game/sim.ts";
import { botKeys } from "../../src/game/bot.ts";
import { poseAt, queryTrack, buildTrack, ensureTrack, trimTrack } from "../../src/game/road.ts";

function advance(sim: any, secs: number, mode: "hunt" | "idle") {
  for (let i = 0; i < secs * 60 && sim.phase === "playing"; i++) {
    sim.keysOverride = new Set(mode === "hunt" ? botKeys(sim) : []);
    sim.events.length = 0;
    step(sim, 1 / 60);
  }
}

test("road is endless, 24 m wide, and local queries agree with poses", () => {
  const t = buildTrack();
  ensureTrack(t, 20000);
  trimTrack(t, 19000);
  for (const s of [19100, 19500, 19990]) {
    const p = poseAt(t, s);
    const q = queryTrack(t, p.x + p.rx * 5, p.z + p.rz * 5, s - 3);
    assert.ok(Math.abs(q.s - s) < 0.5, `s ${q.s} vs ${s}`);
    assert.ok(Math.abs(q.lateral - 5) < 0.2);
    assert.equal(q.width, 24);
  }
});

test("wave roster grows and always has a gunner", () => {
  assert.equal(waveRoster(1).length, 3);
  assert.equal(waveRoster(5).length, 7);
  for (let n = 1; n < 10; n++) assert.ok(waveRoster(n).includes("gunner"));
  assert.equal(ENEMY.rammer.hp, 40);
  assert.equal(ENEMY.gunner.hp, 55);
});

test("bot clears waves: kills happen and the wave advances", () => {
  const sim: any = createSim();
  begin(sim);
  advance(sim, 120, "hunt");
  assert.ok(sim.takedowns >= 3, `takedowns ${sim.takedowns}`);
  assert.ok(sim.wave >= 2, `wave ${sim.wave}`);
});

test("idle player loses lives, then the run ends and restarts clean", () => {
  const sim: any = createSim();
  begin(sim);
  advance(sim, 30, "idle");
  assert.ok(sim.lives < 3, `lives ${sim.lives}`);
  advance(sim, 300, "idle");
  assert.equal(sim.phase, "finished");
  assert.equal(sim.lives, 0);
  assert.ok(sim.result && sim.result.wave >= 1);
  begin(sim);
  assert.equal(sim.phase, "playing");
  assert.equal(sim.lives, 3);
  assert.equal(sim.wave, 0);
  assert.equal(sim.cars.slice(1).filter((c: any) => c.alive).length, 0);
});
