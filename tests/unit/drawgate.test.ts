import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore plain .mjs helper shared with tests/smoke.mjs
import { drawGate } from "../draw_gate.mjs";

test("phone draw-call gate can fail: >120 fails, <=120 passes, desktop is log-only", () => {
  assert.equal(drawGate("phone", 121), false);
  assert.equal(drawGate("phone", 230), false);
  assert.equal(drawGate("phone", 120), true);
  assert.equal(drawGate("phone", NaN), false);
  assert.equal(drawGate("desktop", 500), true);
});
