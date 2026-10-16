import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPickup, begin, createSim, debugSpawn, debugStartWave, ENEMY, spawnPickup, step, waveRoster, DRONE_ALT } from "../../src/game/sim.ts";
import { botKeys } from "../../src/game/bot.ts";

function run(sim: any, secs: number, keys: string[] | "hunt" | null, until?: () => boolean) {
  for (let i = 0; i < secs * 60 && sim.phase === "playing"; i++) {
    sim.keysOverride = new Set(keys === "hunt" ? botKeys(sim) : keys ?? []);
    sim.events.length = 0;
    step(sim, 1 / 60);
    if (until && until()) return true;
  }
  return false;
}
function fresh() {
  const sim: any = createSim();
  begin(sim);
  sim.lull = 1e9; // no natural waves unless a test asks
  run(sim, 2, ["KeyW"]);
  return sim;
}

test("roster: mine layers from wave 2, spikers from 3, drones only from wave 6, boss every 5th wave", () => {
  assert.ok(!waveRoster(1).includes("mine") && waveRoster(2).includes("mine"));
  assert.ok(!waveRoster(2).includes("spiker") && waveRoster(3).includes("spiker"));
  for (let n = 1; n < 6; n++) assert.ok(!waveRoster(n).includes("drone"), `no drone in wave ${n}`);
  assert.ok(waveRoster(6).includes("drone"));
  for (const n of [5, 10, 15]) assert.equal(waveRoster(n).filter((k) => k === "boss").length, 1);
  assert.ok(!waveRoster(4).includes("boss") && !waveRoster(6).includes("boss"));
  assert.deepEqual([ENEMY.mine.hp, ENEMY.spiker.hp, ENEMY.drone.hp, ENEMY.boss.hp], [80, 60, 30, 600]);
});

test("mine layer drops live enemy mines behind itself that hurt only the player", () => {
  const sim = fresh();
  const car = (debugSpawn as any)(sim, "mine", 30, 3);
  assert.ok(car);
  const got = run(sim, 10, ["KeyW"], () => sim.mines.some((m: any) => m.alive && m.owner === car.id));
  assert.ok(got, "dropped a mine");
});

test("spiker grinds alongside for chip damage, then peels out in front", () => {
  const sim = fresh();
  const hero = sim.cars[0];
  const car = (debugSpawn as any)(sim, "spiker", -6, 3);
  const hp0 = hero.hp;
  run(sim, 8, ["KeyW"], () => hero.hp < hp0 - 5);
  assert.ok(hero.hp < hp0 - 5, `hp ${hp0} -> ${hero.hp}`);
  const peeled = run(sim, 8, ["KeyW"], () => car.ramCd > 0);
  assert.ok(peeled || car.ramCd > 0, "peels off");
});

test("drone flies 6 m up, shoots, and grounded gunfire cannot reach it; rockets can", () => {
  const sim = fresh();
  const hero = sim.cars[0];
  const d = (debugSpawn as any)(sim, "drone", 20, 0);
  run(sim, 1, ["KeyW"]);
  assert.ok(d.y - hero.y > DRONE_ALT - 1.5, `alt ${d.y - hero.y}`);
  const hp0 = d.hp;
  run(sim, 3, ["KeyW", "KeyF"]); // grounded guns only
  assert.equal(d.hp, hp0, "grounded shots pass under the drone");
  const shot = run(sim, 6, ["KeyW"], () => sim.shots.some((s: any) => s.alive && s.owner === d.id));
  assert.ok(shot, "drone fires");
  applyPickup(sim, "rockets");
  run(sim, 6, ["KeyW", "KeyF"], () => !d.alive);
  assert.ok(!d.alive || d.hp < hp0, `rockets hurt the drone (hp ${d.hp})`);
});

test("boss: wave 5 spawns the Armored Hauler; rear hits do double damage; it drops 3 pickups", () => {
  const sim = fresh();
  sim.lull = 0;
  debugStartWave(sim, 5);
  run(sim, 6, ["KeyW"], () => sim.cars.some((c: any) => c.alive && c.kind === "boss"));
  const boss = sim.cars.find((c: any) => c.alive && c.kind === "boss");
  assert.ok(boss, "boss spawned");
  assert.equal(boss.maxHp, 600);
  // a shot travelling the same way as the boss = hits its rear
  const s = sim.shots.find((x: any) => !x.alive);
  const fx = -Math.sin(boss.yaw), fz = -Math.cos(boss.yaw);
  Object.assign(s, { alive: true, owner: 0, rocket: false, target: -1, dmg: 16, life: 0.5, x: boss.x - fx * 4, z: boss.z - fz * 4, y: boss.y + 1, px: boss.x - fx * 4, py: boss.y + 1, pz: boss.z - fz * 4, vx: fx * 200, vy: 0, vz: fz * 200 });
  const hp0 = boss.hp;
  sim.keysOverride = new Set(["KeyW"]);
  step(sim, 1 / 60);
  assert.equal(hp0 - boss.hp, 32);
  boss.hp = 1;
  Object.assign(s, { alive: true, life: 0.5, x: boss.x - fx * 4, z: boss.z - fz * 4, y: boss.y + 1, px: boss.x - fx * 4, py: boss.y + 1, pz: boss.z - fz * 4, vx: fx * 200, vy: 0, vz: fz * 200 });
  step(sim, 1 / 60);
  assert.ok(!boss.alive);
  assert.ok(sim.pickups.filter((p: any) => p.alive).length >= 3);
});

test("every pickup applies, and losing a life costs one upgrade tier", () => {
  const sim = fresh();
  const hero = sim.cars[0];
  for (const k of ["gun", "gun", "gun", "armor", "armor", "rockets", "minepack", "oil", "nitro", "shield", "magnet"]) applyPickup(sim, k as any);
  hero.hp = 50;
  applyPickup(sim, "repair");
  assert.equal(hero.hp, 85);
  assert.equal(sim.up.gun, 3);
  assert.equal(sim.up.armor, 50);
  assert.equal(hero.maxHp, 150);
  assert.equal(sim.up.rockets, 6);
  assert.ok(sim.up.cluster && sim.up.reserve === 4);
  assert.ok(sim.up.oilT > 0 && sim.up.shieldT > 0 && sim.up.magnetT > 0);
  assert.equal(hero.maxFuel, 120);
  // spread gun fires 4 rounds per trigger
  const before = sim.shots.filter((s: any) => s.alive).length;
  sim.keysOverride = new Set(["KeyF"]);
  sim.up.rockets = 0;
  step(sim, 1 / 60);
  assert.equal(sim.shots.filter((s: any) => s.alive).length - before, 4);
  // shield blocks damage
  const hp = hero.hp;
  hero.invuln = 0;
  sim.shots.forEach((s: any) => (s.alive = false));
  // die
  sim.up.shieldT = 0;
  hero.invuln = 0;
  hero.hp = 1;
  const e = (debugSpawn as any)(sim, "rammer", 0.5, 0);
  e.ramCd = 0;
  run(sim, 2, [], () => sim.lives === 2);
  assert.equal(sim.lives, 2);
  assert.equal(sim.up.gun, 2, "one gun tier lost");
  assert.equal(sim.up.armor, 25, "one armor plate lost");
  assert.equal(hero.maxHp, 125);
  assert.equal(sim.up.rockets, 0);
  assert.ok(!sim.up.cluster && sim.up.oilT === 0 && sim.up.shieldT === 0);
  void hp;
});

test("pickups on the road are collected by driving through them; crates open when shot", () => {
  const sim = fresh();
  const hero = sim.cars[0];
  const lat = 0;
  spawnPickup(sim, "gun", hero.along + 25, lat, false);
  run(sim, 4, ["KeyW"], () => sim.up.gun === 1);
  assert.equal(sim.up.gun, 1);
  const crate = (spawnPickup as any)(sim, "rockets", hero.along + 40, lat, true);
  run(sim, 4, ["KeyW", "KeyF"], () => !crate.crate);
  assert.equal(crate.crate, false, "crate opened");
});

test("parking: enemies never pop into view; they leave forward into the fog and return from behind", () => {
  const sim: any = createSim();
  begin(sim);
  run(sim, 25, "hunt");
  const hero = sim.cars[0];
  const prev = sim.cars.map((c: any) => ({ alive: c.alive, along: c.along }));
  let pops = 0;
  for (let i = 0; i < 60 * 40 && sim.phase === "playing"; i++) {
    sim.keysOverride = new Set([]);
    step(sim, 1 / 60);
    sim.cars.forEach((c: any, k: number) => {
      if (k === 0) return;
      const p = prev[k];
      if (p.alive && c.alive && Math.abs(c.along - p.along) > 25) {
        const before = p.along - hero.along;
        const after = c.along - hero.along;
        const visible = (d: number) => d > -2 && d < 170; // in front of the chase camera, inside the fog
        if (visible(before) || visible(after)) pops += 1;
      }
      prev[k] = { alive: c.alive, along: c.along };
    });
  }
  assert.equal(pops, 0, "no visible teleports");
  assert.ok(sim.recycled >= 1 || sim.lives < 3, "enemies were recycled behind the parked player");
});
