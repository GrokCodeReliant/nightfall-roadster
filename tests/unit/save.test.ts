import { test } from "node:test";
import assert from "node:assert/strict";
import { emptySave, mergeSave, parseSave } from "../../src/game/save.ts";
import { raceBestLine, recordRace } from "../../src/game/records.ts";
import type { Result } from "../../src/game/sim.ts";

// exact shape written before per-course race bests (b9aae94^ RoadsterGame Save: no `race` field)
const OLD = JSON.stringify({
  bestScore: 18450, bestWave: 7, bestTime: 312.4, credits: 1260,
  shop: { armor: 40, gun: 2, rockets: 6, reserve: 1, maxFuel: 130, shieldCharges: 1, magnetCharges: 0, oilCharges: 2, mineArm: 1 },
});

test("save: a pre-per-course save loads without a crash, keeps its bests/credits/shop, race defaults to {}", () => {
  const s = parseSave(OLD);
  assert.equal(s.bestScore, 18450);
  assert.equal(s.bestWave, 7);
  assert.equal(s.bestTime, 312.4);
  assert.equal(s.credits, 1260);
  assert.equal(s.shop.gun, 2);
  assert.equal(s.shop.maxFuel, 130);
  assert.equal(s.shop.mineArm, 1);
  assert.deepEqual(s.race, {}, "old wave bests never held a race place: nothing is invented");
  assert.equal(raceBestLine(s.race, "coast", "Coast Road"), "No Coast Road finish yet — race for a place.");
});

test("save: first race after migration adds the course and keeps the old wave bests on write-back", () => {
  const s = parseSave(OLD);
  const res = { time: 45.47, score: 0, wave: 0, takedowns: 0, falls: 0, mode: "race", dist: 4000, reason: "", place: 1 } as unknown as Result;
  const next = mergeSave(s, { race: recordRace(s.race, "coast", res), credits: s.credits + 180 });
  const back = parseSave(JSON.stringify(next));
  assert.deepEqual(back.race, { coast: { place: 1, time: 45.47 } });
  assert.equal(back.bestScore, 18450);
  assert.equal(back.bestWave, 7);
  assert.equal(back.credits, 1440);
});

test("save: missing / corrupt / odd blobs fall back cleanly", () => {
  for (const raw of [null, undefined, "", "{", "null", "42", '"x"', "[]"]) assert.deepEqual(parseSave(raw as string | null), emptySave(), String(raw));
  const s = parseSave(JSON.stringify({ bestScore: "lots", credits: -5.5, race: { coast: { place: 7, time: 1 }, city: { place: 2, time: 80 } } }));
  assert.equal(s.bestScore, 0);
  assert.equal(s.credits, 0);
  assert.deepEqual(s.race, { city: { place: 2, time: 80 } });
});
