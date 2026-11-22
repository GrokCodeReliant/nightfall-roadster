import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BEAM_LOOK, CROWN_CUT, LIGHTHOUSE, SHORE_LOOK, foldV2Emissive, isSwatch, privateShore, rockSwatchUvs } from "../../src/game/coast.ts";

const geo = (piece: string) => { const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); g.userData.piece = piece; return g; };
const mats = () => { const kit = new THREE.MeshStandardMaterial(); kit.name = "kit"; const em = new THREE.MeshStandardMaterial(); em.name = "kit_emissive"; return { kit, em }; };

test("v2 look pass: beach/arch chunk emissive from v2 pieces only folds into the kit draw (0 new draws)", () => {
  const { kit, em } = mats();
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>([[kit, [geo("coast_water_40")]], [em, [geo("coast_water_glow_40"), geo("coast_shore_foam_40"), geo("coast_beach_shoulder_40_v2")]]]);
  assert.equal(foldV2Emissive(parts), 2, "foam + shoulder fold; the dark glow card is dropped");
  assert.equal(parts.size, 1);
  assert.equal(parts.get(kit)!.length, 3);
  assert.ok(!parts.get(kit)!.some((g) => g.userData.piece === "coast_water_glow_40"));
});

test("v2 look pass: chunks that already draw kit_emissive (rails) keep the glow", () => {
  const { kit, em } = mats();
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>([[kit, [geo("coast_cliff_40")]], [em, [geo("coast_guardrail_4m"), geo("coast_water_glow_40")]]]);
  assert.equal(foldV2Emissive(parts), 0);
  assert.equal(parts.size, 2);
});

test("portal crown window matches the Art notes / measured occlusion", () => {
  // measured: hero hidden by the entry-portal crown at race s 1590..1598 (portal at 1580)
  assert.ok(CROWN_CUT[0] <= 10 && CROWN_CUT[1] >= 18);
  assert.ok(CROWN_CUT[0] > 4, "portal shot (hero 2 m past the portal) keeps the crown");
});

test("v4: flat brown swatch faces re-project into the rock cell with real UV area", () => {
  const g = new THREE.BoxGeometry(2.2, 4.8, 3.2).toNonIndexed();
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, i % 2 ? 0.140 : 0.172, 0.610);
  assert.equal(rockSwatchUvs(g), 12);
  for (let i = 0; i < uv.count; i++) {
    assert.ok(!isSwatch(uv.getX(i), uv.getY(i)));
    assert.ok(uv.getX(i) >= 0.51 && uv.getX(i) <= 0.74 && uv.getY(i) >= 0.775 && uv.getY(i) <= 0.995);
  }
  const a = new THREE.Vector2(uv.getX(0), uv.getY(0)), b = new THREE.Vector2(uv.getX(1), uv.getY(1)), c = new THREE.Vector2(uv.getX(2), uv.getY(2));
  assert.ok(Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) > 1e-3, "no longer a point UV");
  const ok = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  assert.equal(rockSwatchUvs(ok), 0, "non-swatch faces untouched");
});

test("v4: shore foam v3 moves to one private dim instance; rails keep the shared kit_emissive", () => {
  const { kit, em } = mats();
  const dim = new THREE.MeshStandardMaterial(); dim.name = "kit_emissive@shore";
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>([[kit, [geo("coast_cliff_40_v2")]], [em, [geo("coast_guardrail_4m"), geo("coast_shore_foam_40_v3")]]]);
  assert.equal(privateShore(parts, () => dim), 1);
  assert.deepEqual(parts.get(em)!.map((g) => g.userData.piece), ["coast_guardrail_4m"]);
  assert.deepEqual(parts.get(dim)!.map((g) => g.userData.piece), ["coast_shore_foam_40_v3"]);
  assert.ok(SHORE_LOOK.emissiveIntensity <= 1 && SHORE_LOOK.opacity <= 0.6, "well under the shipped strength 4");
  assert.ok(BEAM_LOOK.emissiveIntensity <= 1.5 && BEAM_LOOK.opacity < 1);
});

test("v4: lighthouse v3 at Art's recommended pose (x -16 in the [-22,-14] band, s 1880, hook y unchanged)", () => {
  assert.equal(LIGHTHOUSE.s, 1880);
  assert.ok(LIGHTHOUSE.lx >= -22 && LIGHTHOUSE.lx <= -14);
  assert.equal(LIGHTHOUSE.dy, 0);
});
