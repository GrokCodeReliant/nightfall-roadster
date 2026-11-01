import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_KEY,
  STEER_SENS_DEFAULT,
  STEER_SENS_MAX,
  STEER_SENS_MIN,
  clampSteerSens,
  loadSettings,
  parseSettings,
  writeSettings,
  type SettingsBox,
} from "../../src/game/settings.ts";
import { begin, createSim, step } from "../../src/game/sim.ts";

function memoryStore(initial?: string): SettingsBox & { raw: () => string | null } {
  const mem = new Map<string, string>();
  if (initial != null) mem.set(SETTINGS_KEY, initial);
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key)! : null),
    setItem: (key, value) => {
      mem.set(key, value);
    },
    raw: () => (mem.has(SETTINGS_KEY) ? mem.get(SETTINGS_KEY)! : null),
  };
}

test("steer sensitivity defaults to 0.75 and clamps to 0.40–1.40 on the 0.05 grid", () => {
  assert.equal(STEER_SENS_DEFAULT, 0.75);
  assert.equal(clampSteerSens(undefined), 0.75);
  assert.equal(clampSteerSens("fast"), 0.75);
  assert.equal(clampSteerSens(Number.NaN), 0.75);
  assert.equal(clampSteerSens(0), STEER_SENS_MIN);
  assert.equal(clampSteerSens(0.4), 0.4);
  assert.equal(clampSteerSens(0.42), 0.4);
  assert.equal(clampSteerSens(0.43), 0.45);
  assert.equal(clampSteerSens(0.75), 0.75);
  assert.equal(clampSteerSens(1.4), 1.4);
  assert.equal(clampSteerSens(9), STEER_SENS_MAX);
  assert.equal(clampSteerSens(-2), STEER_SENS_MIN);
  assert.equal(createSim().steerSens, 0.75);
});

test("steer sensitivity persists round-trip under nightfall-roadster-settings-v1", () => {
  const store = memoryStore();
  const saved = writeSettings({ steerSens: 1.13 }, store);
  assert.equal(saved.steerSens, 1.15);
  assert.equal(store.raw(), JSON.stringify({ steerSens: 1.15 }));
  assert.equal(loadSettings(store).steerSens, 1.15);
  assert.equal(parseSettings(store.raw()).steerSens, 1.15);

  const again = writeSettings({ steerSens: 0.4 }, store);
  assert.equal(again.steerSens, 0.4);
  assert.equal(loadSettings(store).steerSens, 0.4);

  assert.equal(loadSettings(memoryStore()).steerSens, 0.75);
  assert.equal(parseSettings("{").steerSens, 0.75);
  assert.equal(parseSettings(JSON.stringify({ steerSens: 4 })).steerSens, 1.4);
});

function yawDelta(sens: number, setup: (sim: ReturnType<typeof createSim>) => void) {
  const sim = createSim();
  sim.carId = "model3";
  sim.steerSens = sens;
  begin(sim);
  sim.lull = 1e9;
  sim.track.width = 1000;
  setup(sim);
  const y0 = sim.cars[0].yaw;
  for (let i = 0; i < 24; i++) step(sim, 1 / 60);
  return Math.abs(sim.cars[0].yaw - y0);
}

test("steerSens multiplies hero steer into yaw for keyboard, touch, and pad", () => {
  const kbLo = yawDelta(0.4, (sim) => {
    sim.keysOverride = new Set(["KeyW", "KeyA"]);
  });
  const kbHi = yawDelta(1.4, (sim) => {
    sim.keysOverride = new Set(["KeyW", "KeyA"]);
  });
  assert.ok(kbLo > 0.01, `low keyboard yaw ${kbLo}`);
  assert.ok(kbHi > kbLo * 2.5, `keyboard yaw ${kbHi} vs ${kbLo}`);

  const touchLo = yawDelta(0.4, (sim) => {
    sim.touch.steer = 1;
    sim.touch.throttle = 1;
  });
  const touchHi = yawDelta(1.4, (sim) => {
    sim.touch.steer = 1;
    sim.touch.throttle = 1;
  });
  assert.ok(touchHi > touchLo * 2.5, `touch yaw ${touchHi} vs ${touchLo}`);

  const padLo = yawDelta(0.4, (sim) => {
    sim.pad.steer = 1;
    sim.pad.throttle = 1;
  });
  const padHi = yawDelta(1.4, (sim) => {
    sim.pad.steer = 1;
    sim.pad.throttle = 1;
  });
  assert.ok(padHi > padLo * 2.5, `pad yaw ${padHi} vs ${padLo}`);
});
