import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CROWN_CUT, VAULT_X, VAULT_Y, foldV2Emissive } from "../../src/game/coast.ts";

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

test("arch vault split and portal crown window match the Art notes / measured occlusion", () => {
  assert.equal(VAULT_Y, 4.5);
  assert.ok(VAULT_X >= 6 && VAULT_X < 12, "over the road only, side walls stay");
  // measured: hero hidden by the entry-portal crown at race s 1590..1598 (portal at 1580)
  assert.ok(CROWN_CUT[0] <= 10 && CROWN_CUT[1] >= 18);
  assert.ok(CROWN_CUT[0] > 4, "portal shot (hero 2 m past the portal) keeps the crown");
});
