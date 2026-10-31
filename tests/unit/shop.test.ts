import { test } from "node:test";
import assert from "node:assert/strict";
import { CAR_STATS, applyFullyUpgraded, begin, createSim } from "../../src/game/sim.ts";
import { STAGES } from "../../src/game/world.ts";
import {
  SHOP_CATALOG,
  bankRun,
  buyUpgrade,
  creditsForScore,
  emptyShop,
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
  assert.equal(creditsForScore(-40), 0);
  const first = bankRun(5, 25, false);
  assert.deepEqual(first, { credits: 7, gained: 2 });
  const again = bankRun(first.credits, 25, true);
  assert.equal(again.gained, 0);
  assert.equal(again.credits, 7);
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
  assert.ok(credits >= 0);
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
});
