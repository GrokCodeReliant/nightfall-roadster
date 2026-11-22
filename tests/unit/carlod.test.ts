import { test } from "node:test";
import assert from "node:assert/strict";
import { CAR_LOD_FAR, CAR_LOD_NEAR, carLodFar } from "../../src/game/carlod";

test("distant-car LOD: far cars use the low model, near cars and the hero never do", () => {
  assert.ok(CAR_LOD_NEAR < CAR_LOD_FAR, "hysteresis band");
  assert.ok(CAR_LOD_FAR >= 30 && CAR_LOD_FAR <= 40);
  // rivals/enemies
  assert.equal(carLodFar(false, 10, false, true), false);
  assert.equal(carLodFar(false, CAR_LOD_FAR + 0.1, false, true), true);
  assert.equal(carLodFar(false, 80, false, true), true);
  // hero: never the low model, at any distance or state
  for (const d of [0, 20, 29, 31, 100, 1e6]) for (const prev of [false, true]) assert.equal(carLodFar(prev, d, true, true), false);
  // disabled (phone / ?enemylod override): never switches
  assert.equal(carLodFar(false, 200, false, false), false);
  assert.equal(carLodFar(true, 200, false, false), false);
  assert.equal(carLodFar(true, NaN, false, true), false);
});

test("distant-car LOD hysteresis: no flicker inside the band", () => {
  let far = false;
  const seq: boolean[] = [];
  // a car hovering around the far line (30 m, back at 25 m)
  for (const d of [29, 31, 28, 31, 26, 25.5, 24]) seq.push((far = carLodFar(far, d, false, true)));
  assert.deepEqual(seq, [false, true, true, true, true, true, false]);
  // flips at most once each way over a jittery approach
  let flips = 0;
  far = false;
  for (let i = 0; i < 200; i++) {
    const d = 27.5 + Math.sin(i * 0.7) * 2.2; // 25.3..29.7: inside the band, starting near
    const n = carLodFar(far, d, false, true);
    if (n !== far) flips++;
    far = n;
  }
  assert.equal(flips, 0);
});
