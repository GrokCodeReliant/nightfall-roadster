import { test } from "node:test";
import assert from "node:assert/strict";
import { begin, createSim, debugSpawn, step, waveRoster, ENEMY } from "../../src/game/sim.ts";
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

test("wave roster grows, non-boss waves always have a gunner", () => {
  assert.equal(waveRoster(1).length, 3);
  assert.equal(waveRoster(4).length, 6);
  for (let n = 1; n < 12; n++) if (n % 5) assert.ok(waveRoster(n).includes("gunner"), `wave ${n}`);
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
  advance(sim, 45, "idle");
  // Hunters race past a floored hero instead of camping on the bumper, so coasting is not a wipe.
  assert.equal(sim.phase, "playing");
  assert.ok(sim.cars[0].speed >= 22, `speed ${sim.cars[0].speed}`);
  // One overlapping ram on the last life still wrecks it, and begin() comes back clean.
  sim.lives = 1;
  const hero = sim.cars[0];
  hero.hp = 1;
  hero.invuln = 0;
  const slot = sim.cars.find((c: any) => !c.hero);
  slot.alive = false;
  const foe = debugSpawn(sim, "rammer", 0, hero.lane);
  assert.ok(foe);
  foe.x = hero.x;
  foe.y = hero.y;
  foe.z = hero.z;
  foe.along = hero.along;
  foe.ramCd = 0;
  foe.alive = true;
  advance(sim, 2, "idle");
  assert.equal(sim.phase, "finished");
  assert.equal(sim.lives, 0);
  assert.ok(sim.result && sim.result.wave >= 1);
  begin(sim);
  assert.equal(sim.phase, "playing");
  assert.equal(sim.lives, 3);
  assert.equal(sim.wave, 0);
  assert.equal(sim.cars.slice(1).filter((c: any) => c.alive).length, 0);
});
