import { test } from "node:test";
import assert from "node:assert/strict";
import { applyGamepad, begin, createSim, hasBoost, readInput, step, type GamepadSample } from "../../src/game/sim.ts";
import { emptyPadUi, maskPadCombat, stepPadUi, type PadUiOpts, type PadUiState } from "../../src/game/padui.ts";
import { SHOP_CATALOG, buyUpgrade, emptyShop } from "../../src/game/shop.ts";

function flatSim(carId: string) {
  const sim = createSim();
  sim.carId = carId;
  begin(sim);
  sim.lull = 1e9;
  sim.keysOverride = null;
  sim.keys.clear();
  return sim;
}

function pad(axes: number[], pressed: number[]): GamepadSample {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  };
}

const opts = (extra?: Partial<PadUiOpts>): PadUiOpts => ({
  pauseCount: 3,
  shopCount: SHOP_CATALOG.length,
  canStart: true,
  ignore: false,
  ...extra,
});

function release(state: PadUiState, mode: "playing" | "paused" | "shop" | "title" | "other", extra?: Partial<PadUiOpts>) {
  stepPadUi(pad([0, 0], []), state, mode, opts(extra));
}

test("Start/buttons[9] toggles pause while playing", () => {
  const sim = flatSim("model3");
  const state = emptyPadUi();
  let ev = stepPadUi(pad([0, 0], [9]), state, "playing", opts());
  assert.equal(ev?.type, "pause");
  sim.phase = "paused";
  release(state, "paused");
  ev = stepPadUi(pad([0, 0], [9]), state, "paused", opts());
  assert.equal(ev?.type, "resume");
  sim.phase = "playing";
  // A held Start does not toggle again.
  ev = stepPadUi(pad([0, 0], [9]), state, "playing", opts());
  assert.equal(ev, null);
  assert.equal(sim.phase, "playing");

  release(state, "playing");
  sim.keysOverride = new Set(["KeyW"]);
  ev = stepPadUi(pad([0, 0], [9]), state, "playing", opts({ ignore: true }));
  assert.equal(ev, null);
  assert.equal(sim.phase, "playing");

  // Start does not grant boost. X/RT still Brake on a non-Roadster.
  sim.keysOverride = null;
  const state2 = emptyPadUi();
  applyGamepad(sim, pad([0, 0], [2, 7, 9]));
  ev = stepPadUi(pad([0, 0], [2, 7, 9]), state2, "playing", opts());
  maskPadCombat(sim, state2);
  const input = readInput(sim);
  assert.equal(ev?.type, "pause");
  assert.equal(input.thrust, false);
  assert.equal(input.throttle, -1);
  assert.equal(hasBoost("model3"), false);
});

test("paused pad moves focus, A activates, and B resumes without mining", () => {
  const sim = flatSim("model3");
  sim.phase = "paused";
  const state = emptyPadUi();
  const menu = opts();
  release(state, "paused");
  assert.equal(state.focus, 0);

  stepPadUi(pad([0, 0], [13]), state, "paused", menu);
  assert.equal(state.focus, 1);
  release(state, "paused");
  stepPadUi(pad([0, 0.9], []), state, "paused", menu);
  assert.equal(state.focus, 2);
  release(state, "paused");
  // Deadzone and the end of the list hold still.
  stepPadUi(pad([0, 0.1], []), state, "paused", menu);
  assert.equal(state.focus, 2);
  stepPadUi(pad([0, 0], [13]), state, "paused", menu);
  assert.equal(state.focus, 2);
  release(state, "paused");
  stepPadUi(pad([0, 0], [12]), state, "paused", menu);
  assert.equal(state.focus, 1);

  release(state, "paused");
  let ev = stepPadUi(pad([0, 0], [0]), state, "paused", menu);
  assert.deepEqual(ev, { type: "activate", index: 1 });
  applyGamepad(sim, pad([0, 0], [0]));
  maskPadCombat(sim, state);
  sim.phase = "playing";
  assert.equal(readInput(sim).fire, false);
  step(sim, 1 / 60);

  release(state, "playing");
  sim.phase = "paused";
  release(state, "paused");
  applyGamepad(sim, pad([0, 0], [1]));
  ev = stepPadUi(pad([0, 0], [1]), state, "paused", menu);
  maskPadCombat(sim, state);
  assert.equal(ev?.type, "resume");
  sim.phase = "playing";
  assert.equal(readInput(sim).mine, false);
  assert.equal(readInput(sim).thrust, false);
  step(sim, 1 / 60);
  assert.equal(sim.mines.some((m) => m.alive), false);

  // The resume hold stays eaten; a later press still mines.
  applyGamepad(sim, pad([0, 0], [1]));
  stepPadUi(pad([0, 0], [1]), state, "playing", menu);
  maskPadCombat(sim, state);
  assert.equal(readInput(sim).mine, false);
  release(state, "playing");
  applyGamepad(sim, pad([0, 0], []));
  applyGamepad(sim, pad([0, 0], [1]));
  stepPadUi(pad([0, 0], [1]), state, "playing", menu);
  maskPadCombat(sim, state);
  assert.equal(readInput(sim).mine, true);
  assert.equal(readInput(sim).thrust, false);
});

test("shop pad focus buys the focused row and B, View, or Start closes", () => {
  const state = emptyPadUi();
  const menu = opts();
  release(state, "shop");
  assert.equal(state.focus, 0);

  stepPadUi(pad([0, 0.9], []), state, "shop", menu);
  assert.equal(state.focus, 1);
  // Hold does not repeat.
  stepPadUi(pad([0, 0.9], []), state, "shop", menu);
  assert.equal(state.focus, 1);
  release(state, "shop");
  stepPadUi(pad([0, 0], [13]), state, "shop", menu);
  assert.equal(state.focus, 2);
  release(state, "shop");
  stepPadUi(pad([0, -0.9], []), state, "shop", menu);
  assert.equal(state.focus, 1);

  release(state, "shop");
  let ev = stepPadUi(pad([0, 0], [0]), state, "shop", menu);
  assert.deepEqual(ev, { type: "shopBuy", index: 1 });
  const row = SHOP_CATALOG[1];
  assert.equal(row.id, "gun");
  const bought = buyUpgrade(emptyShop(), 1000, row.id);
  assert.equal(bought.ok, true);
  assert.equal(bought.shop.gun, 1);
  assert.equal(bought.credits, 1000 - row.price);
  const broke = buyUpgrade(emptyShop(), 0, row.id);
  assert.equal(broke.ok, false);
  assert.equal(broke.toast, "Not enough Credits");
  assert.equal(broke.shop.gun, 0);
  let shop = emptyShop();
  let credits = 1000;
  for (let i = 0; i < 4; i++) {
    const result = buyUpgrade(shop, credits, row.id);
    shop = result.shop;
    credits = result.credits;
  }
  assert.equal(shop.gun, 3);
  assert.equal(buyUpgrade(shop, credits, row.id).toast, "Maxed");

  release(state, "shop");
  ev = stepPadUi(pad([0, 0], [1]), state, "shop", menu);
  assert.equal(ev?.type, "shopClose");
  release(state, "shop");
  ev = stepPadUi(pad([0, 0], [8]), state, "shop", menu);
  assert.equal(ev?.type, "shopClose");
  release(state, "shop");
  ev = stepPadUi(pad([0, 0], [9]), state, "shop", menu);
  assert.equal(ev?.type, "shopClose");

  // View close must not leave a Track edge for Model S.
  const modelS = flatSim("model_s");
  applyGamepad(modelS, pad([0, 0], [8]));
  assert.equal(modelS.touchTrack, true);
  const viewState = emptyPadUi();
  release(viewState, "shop");
  ev = stepPadUi(pad([0, 0], [8]), viewState, "shop", menu);
  maskPadCombat(modelS, viewState);
  assert.equal(ev?.type, "shopClose");
  assert.equal(modelS.touchTrack, false);
  assert.equal(readInput(modelS).thrust, false);
});

test("title Start begins the run only when a stage can start", () => {
  const state = emptyPadUi();
  let ev = stepPadUi(pad([0, 0], [9]), state, "title", opts());
  assert.equal(ev?.type, "startRun");
  release(state, "title", { canStart: false });
  ev = stepPadUi(pad([0, 0], [9]), state, "title", opts({ canStart: false }));
  assert.equal(ev, null);
  release(state, "other");
  ev = stepPadUi(pad([0, 0], [9]), state, "other", opts());
  assert.equal(ev, null);
});

test("menu pad sampling does not grant boost to a non-Roadster", () => {
  for (const id of ["model3", "model_y", "model_x", "model_s", "cybertruck"] as const) {
    const sim = flatSim(id);
    const state = emptyPadUi();
    applyGamepad(sim, pad([0, 0], [0, 1, 2, 5, 7]));
    stepPadUi(pad([0, 0], [0, 1, 2, 5, 7]), state, "playing", opts());
    maskPadCombat(sim, state);
    const input = readInput(sim);
    assert.equal(input.thrust, false, id);
    assert.equal(input.throttle, -1, id);
    assert.equal(hasBoost(id), false, id);
  }
  const roadster = flatSim("roadster");
  const state = emptyPadUi();
  applyGamepad(roadster, pad([0, 0], [2]));
  const ev = stepPadUi(pad([0, 0], [2]), state, "playing", opts());
  maskPadCombat(roadster, state);
  assert.equal(ev, null);
  assert.equal(readInput(roadster).thrust, true);
  assert.equal(readInput(roadster).throttle, 0);
});
