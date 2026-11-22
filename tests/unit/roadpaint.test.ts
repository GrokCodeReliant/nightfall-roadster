import test from "node:test";
import assert from "node:assert/strict";
import { PAINT_CELLS, YELLOW, AMBER, linear, magentaMask, remap, PAINT_GLSL } from "../../src/game/roadpaint";
import { WOODS_LOOK } from "../../src/game/woodscourse";
import { STAGES } from "../../src/game/world";

test("centre-line remap: magenta paint + studs go yellow / amber, every other lane-paint cell is untouched", () => {
  for (const k of ["centreMagenta", "studMagenta"] as const) {
    const c = linear(PAINT_CELLS[k]);
    assert.equal(magentaMask(...c), 1, k);
    // emissive radiance is ~4x the texel; the mask is brightness independent
    assert.equal(magentaMask(c[0] * 4, c[1] * 4, c[2] * 4), 1, `${k} x4`);
    const y = remap(c, k === "centreMagenta" ? YELLOW : AMBER);
    assert.ok(y[1] > y[2] * 4 && y[0] > y[1], `${k} reads yellow/amber ${y}`);
  }
  for (const k of ["white", "studRed", "asphalt"] as const) {
    const c = linear(PAINT_CELLS[k]);
    assert.equal(magentaMask(...c), 0, k);
    assert.deepEqual(remap(c, YELLOW), c, k);
  }
  assert.equal(magentaMask(...linear([255, 217, 166])), 0, "gold stud cell");
  assert.match(PAINT_GLSL, /vec3 nfPaint\( vec3 c, vec3 t \)/);
});

test("pw-look light rig: Pine Woods only, brighter than d8c1085; Night City / Coast skies unchanged", () => {
  assert.equal(STAGES.find((s) => s.id === "woods")!.sky, WOODS_LOOK.sky);
  assert.equal(STAGES.find((s) => s.id === "city")!.sky, 0x0a0814);
  assert.equal(STAGES.find((s) => s.id === "coast")!.sky, 0x2a1a24);
  const lum = (h: number) => ((h >> 16) & 255) + ((h >> 8) & 255) + (h & 255);
  assert.ok(lum(WOODS_LOOK.sky) > lum(0x0c1410) && lum(WOODS_LOOK.floor) > lum(0x333d29));
  assert.ok(WOODS_LOOK.hemi > 1.25 && WOODS_LOOK.moon > 1.35);
});
