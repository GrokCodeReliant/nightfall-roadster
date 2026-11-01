import { test } from "node:test";
import assert from "node:assert/strict";
import { CAR_STATS, ENEMY_MINE_ARM, MINE_DROP_BACK, applyFullyUpgraded, begin, createSim, debugSpawn, step } from "../../src/game/sim.ts";
import { STAGES } from "../../src/game/world.ts";
import {
  MINE_ARM,
  MINE_FUSE_PRICE,
  RACE_PURSE_DNF,
  RACE_PURSE_HELD,
  SHOP_CATALOG,
  bankRun,
  buyUpgrade,
  creditsForScore,
  emptyShop,
  heroMineArm,
  sanitizeShop,
  shopComing,
  type ShopId,
} from "../../src/game/shop.ts";

const price = (id: ShopId) => SHOP_CATALOG.find((row) => row.id === id)!.price;

test("every stage is playable and reads as its own sky", () => {
  const ids = ["city", "classic", "coast", "woods", "highway", "port", "pass"];
  assert.deepEqual(STAGES.map((s) => s.id), ids);
  assert.ok(STAGES.every((s) => s.ready));
  assert.equal(new Set(STAGES.map((s) => s.sky)).size, STAGES.length);
  assert.ok(STAGES.every((s) => s.name && !s.name.includes("Coming soon")));
});

test("credits bank floor(score/10) once per run", () => {
  assert.equal(creditsForScore(0), 0);
  assert.equal(creditsForScore(9), 0);
  assert.equal(creditsForScore(10), 1);
  assert.equal(creditsForScore(25), 2);
  assert.equal(creditsForScore(500), 50);
  assert.equal(creditsForScore(-40), 0);
  const first = bankRun(5, 25, false);
  assert.deepEqual(first, { credits: 7, gained: 2 });
  const again = bankRun(first.credits, 25, true);
  assert.equal(again.gained, 0);
  assert.equal(again.credits, 7);
  const classic = bankRun(0, 500, false);
  assert.equal(classic.gained, 50);
  assert.equal(bankRun(classic.credits, 500, true).gained, 0);
});

test("highway RaceTrial banks a flat purse and ignores score", () => {
  assert.equal(RACE_PURSE_HELD, 100);
  assert.equal(RACE_PURSE_DNF, 25);
  const held = bankRun(10, 5000, false, { highway: true, purse: "held" });
  assert.deepEqual(held, { credits: 110, gained: 100 });
  const dnf = bankRun(10, 5000, false, { highway: true, purse: "dnf" });
  assert.deepEqual(dnf, { credits: 35, gained: 25 });
  const wreck = bankRun(10, 5000, false, { highway: true, purse: null });
  assert.deepEqual(wreck, { credits: 10, gained: 0 });
  const twice = bankRun(held.credits, 5000, true, { highway: true, purse: "held" });
  assert.equal(twice.gained, 0);
  assert.equal(twice.credits, 110);
});

test("shop spends, caps, and refuses a short balance", () => {
  let shop = emptyShop();
  let credits = 1000;
  const buy = (id: ShopId) => {
    const result = buyUpgrade(shop, credits, id);
    shop = result.shop;
    credits = result.credits;
    return result;
  };
  assert.equal(price("armor"), 40);
  assert.equal(price("gun"), 60);
  assert.equal(price("minepack"), 35);
  assert.equal(price("rockets"), 45);
  assert.equal(price("nitro"), 50);
  assert.equal(price("shield"), 55);
  assert.equal(price("magnet"), 30);
  assert.equal(price("oil"), 40);

  const broke = buyUpgrade(shop, 10, "armor");
  assert.equal(broke.ok, false);
  assert.equal(broke.toast, "Not enough Credits");
  assert.equal(broke.credits, 10);
  assert.equal(broke.shop.armor, 0);

  assert.equal(buy("armor").ok, true);
  assert.equal(shop.armor, 25);
  buy("armor");
  buy("armor");
  buy("armor");
  assert.equal(shop.armor, 100);
  const maxArmor = buy("armor");
  assert.equal(maxArmor.toast, "Maxed");
  assert.equal(maxArmor.shop.armor, 100);

  buy("gun");
  buy("gun");
  buy("gun");
  assert.equal(shop.gun, 3);
  assert.equal(buy("gun").toast, "Maxed");

  buy("rockets");
  buy("rockets");
  buy("rockets");
  assert.equal(shop.rockets, 12);
  assert.equal(buy("rockets").toast, "Maxed");

  buy("nitro");
  buy("nitro");
  buy("nitro");
  assert.equal(shop.maxFuel, 160);
  assert.equal(buy("nitro").toast, "Maxed");

  buy("minepack");
  buy("minepack");
  buy("minepack");
  buy("minepack");
  assert.equal(shop.reserve, 4);
  assert.equal(buy("minepack").toast, "Maxed");

  buy("shield");
  buy("shield");
  buy("shield");
  assert.equal(shop.shieldCharges, 3);
  assert.equal(buy("shield").toast, "Maxed");

  assert.equal(price("minefuse"), MINE_FUSE_PRICE[0]);
  assert.equal(MINE_FUSE_PRICE[0], 45);
  assert.equal(MINE_FUSE_PRICE[1], 65);
  let fuseShop = emptyShop();
  let fuseCredits = 200;
  const buyFuse = () => {
    const result = buyUpgrade(fuseShop, fuseCredits, "minefuse");
    fuseShop = result.shop;
    fuseCredits = result.credits;
    return result;
  };
  assert.equal(buyFuse().ok, true);
  assert.equal(fuseShop.mineArm, 1);
  assert.equal(fuseCredits, 155);
  assert.equal(buyFuse().ok, true);
  assert.equal(fuseShop.mineArm, 2);
  assert.equal(fuseCredits, 90);
  assert.equal(buyFuse().toast, "Maxed");
  assert.equal(fuseShop.mineArm, 2);
  assert.equal(fuseCredits, 90);

  const brokeFuse = buyUpgrade(emptyShop(), 44, "minefuse");
  assert.equal(brokeFuse.ok, false);
  assert.equal(brokeFuse.toast, "Not enough Credits");
  assert.equal(brokeFuse.shop.mineArm, 0);
  assert.equal(brokeFuse.credits, 44);

  for (const id of ["xguns", "ctgun", "thrust"] as const) {
    assert.equal(shopComing(id), true);
    const coming = buyUpgrade(shop, credits, id);
    assert.equal(coming.ok, false);
    assert.equal(coming.toast, "Coming");
    assert.equal(coming.credits, credits);
    assert.equal(coming.shop.mineArm, shop.mineArm);
  }
  assert.ok(credits >= 0);
});

test("mine arm tiers persist and old saves without mineArm stay stock", () => {
  assert.deepEqual(MINE_ARM, { 0: 0.38, 1: 0.20, 2: 0.10 });
  assert.equal(heroMineArm(0), 0.38);
  assert.equal(heroMineArm(1), 0.20);
  assert.equal(heroMineArm(2), 0.10);
  assert.equal(ENEMY_MINE_ARM, 0.6);
  const saved = sanitizeShop({ armor: 25, mineArm: 2 });
  assert.equal(saved.mineArm, 2);
  assert.equal(saved.armor, 25);
  assert.equal(sanitizeShop({ mineArm: 9 }).mineArm, 2);
  assert.equal(sanitizeShop({}).mineArm, 0);
  assert.equal(sanitizeShop(null).mineArm, 0);
  assert.deepEqual(
    SHOP_CATALOG.map((row) => row.id),
    ["armor", "gun", "minepack", "rockets", "nitro", "shield", "magnet", "oil", "minefuse", "xguns", "ctgun", "thrust"],
  );
});

test("begin applies the shop, spends one charge on a real start, and Fully upgraded still wins", () => {
  const sim = createSim();
  sim.carId = "model_y";
  sim.shop = {
    ...emptyShop(),
    armor: 50,
    gun: 2,
    rockets: 8,
    reserve: 3,
    maxFuel: 140,
    shieldCharges: 2,
    magnetCharges: 1,
    oilCharges: 1,
  };
  sim.deployCharges = true;
  begin(sim);
  const hero = sim.cars[0];
  assert.equal(hero.maxHp, CAR_STATS.model_y.maxHp + 50);
  assert.equal(hero.hp, hero.maxHp);
  assert.equal(sim.up.gun, 2);
  assert.equal(sim.up.rockets, 8);
  assert.equal(sim.up.reserve, 3);
  assert.equal(sim.up.cluster, true);
  assert.equal(hero.mines, CAR_STATS.model_y.mineCap);
  assert.equal(hero.maxFuel, 140);
  assert.equal(hero.fuel, 140);
  assert.equal(sim.up.shieldT, 6);
  assert.equal(sim.up.magnetT, 15);
  assert.equal(sim.up.oilT, 20);
  assert.equal(sim.shop.shieldCharges, 1);
  assert.equal(sim.shop.magnetCharges, 0);
  assert.equal(sim.shop.oilCharges, 0);
  assert.equal(CAR_STATS.model_y.topSpeed, 46);

  sim.deployCharges = false;
  begin(sim);
  assert.equal(sim.shop.shieldCharges, 1);
  assert.equal(sim.up.armor, 50);
  assert.equal(sim.cars[0].maxHp, CAR_STATS.model_y.maxHp + 50);
  assert.equal(sim.up.shieldT, 6);

  applyFullyUpgraded(sim);
  begin(sim);
  assert.equal(sim.up.armor, 100);
  assert.equal(sim.up.gun, 3);
  assert.equal(sim.cars[0].maxHp, CAR_STATS.model_y.maxHp + 100);
  assert.equal(sim.cars[0].maxFuel, 160);
  assert.equal(sim.shop.mineArm, 2);
});

test("hero mine arm follows the fuse tier and cluster/oil/reserve still key off a fresh drop", () => {
  const sim = createSim();
  sim.carId = "model3";
  begin(sim);
  sim.lull = 1e9;
  for (const s of sim.track.samples) {
    s.y = 0;
    s.gap = false;
    s.kicker = false;
  }
  sim.shop.mineArm = 2;
  sim.up.reserve = 1;
  sim.up.cluster = true;
  sim.up.oilT = 20;
  sim.keysOverride = new Set(["KeyW"]);
  step(sim, 0.4);
  sim.keysOverride = new Set(["KeyW", "KeyG"]);
  step(sim, 1 / 60);
  const hero = sim.cars[0];
  const mines = sim.mines.filter((m) => m.alive);
  assert.equal(mines.length, 3);
  const heroMine = mines.find((m) => Math.hypot(m.x - hero.x, m.z - hero.z) < 2.2);
  assert.ok(heroMine);
  assert.ok(Math.abs(heroMine.arm - (0.10 - 1 / 60)) < 1e-6, `arm ${heroMine.arm}`);
  assert.equal(heroMine.oil, true);
  assert.equal(heroMine.fresh, false);
  assert.equal(heroMine.owner, 0);
  assert.ok(heroMine.life < 7 && heroMine.life > 6.9, `life ${heroMine.life}`);
  assert.equal(sim.up.reserve, 0);
  assert.ok(hero.mines > 0);
  assert.ok(mines.every((m) => m.oil && !m.fresh));
  assert.ok(Math.abs(Math.hypot(heroMine.x - hero.x, heroMine.z - hero.z) - MINE_DROP_BACK) < 0.05);

  sim.shop.mineArm = 0;
  sim.up.cluster = false;
  sim.up.oilT = 0;
  sim.up.reserve = 0;
  sim.keysOverride = new Set(["KeyW"]);
  step(sim, 0.5);
  sim.keysOverride = new Set(["KeyW", "KeyG"]);
  step(sim, 1 / 60);
  const stock = sim.mines.filter((m) => m.alive && m.owner === 0 && Math.abs(m.arm - (0.38 - 1 / 60)) < 1e-4);
  assert.ok(stock.length >= 1, `stock arms ${sim.mines.filter((m) => m.alive).map((m) => m.arm).join(",")}`);

  const layer = debugSpawn(sim, "mine", 30, 0);
  assert.ok(layer);
  layer.dropCd = 0;
  sim.keysOverride = new Set(["KeyW"]);
  step(sim, 1 / 60);
  const enemy = sim.mines.find((m) => m.alive && m.owner === layer.id);
  assert.ok(enemy);
  assert.ok(Math.abs(enemy.arm - (ENEMY_MINE_ARM - 1 / 60)) < 1e-6, `enemy arm ${enemy.arm}`);
  assert.equal(enemy.fresh, false);
});
