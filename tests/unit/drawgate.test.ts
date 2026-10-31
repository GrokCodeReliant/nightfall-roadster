import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore plain .mjs helper shared with tests/smoke.mjs
import { drawGate, drawReport, PHONE_DRAW_HARD, PHONE_DRAW_SOFT } from "../draw_gate.mjs";

test("phone draw gate: 120 is soft, hard fail only above 160, desktop is log-only", () => {
  assert.equal(PHONE_DRAW_SOFT, 120);
  assert.equal(PHONE_DRAW_HARD, 160);
  assert.equal(drawGate("phone", 120), true);
  assert.equal(drawGate("phone", 121), true, "soft miss must not fail CI");
  assert.equal(drawGate("phone", 160), true);
  assert.equal(drawGate("phone", 161), false);
  assert.equal(drawGate("phone", 230), false);
  assert.equal(drawGate("phone", NaN), false);
  assert.equal(drawGate("desktop", 500), true);
  const soft = drawReport("phone", 140);
  assert.equal(soft.overSoft, true);
  assert.equal(soft.overHard, false);
  assert.match(soft.note, /soft target missed/);
  const hard = drawReport("phone", 161);
  assert.equal(hard.overHard, true);
  const ok = drawReport("phone", 100);
  assert.equal(ok.overSoft, false);
  assert.match(ok.note, /within soft target/);
});
