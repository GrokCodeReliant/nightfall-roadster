// week-i-port Task 1b (David, live Open Highway): the Mesa Cut tunnel / cutting walls rendered like the road (kit tunnel shell
// on the city atlas + white strips = asphalt and lane dashes on their side). The cut now has its own shell + lamps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MESA_CUT } from "../../src/game/highwaycourse.ts";
import { MESA_TUNNEL, mesaTunnelGeometry, mesaTunnelLamps, terrainMaterial, tunnelLampMaterial } from "../../src/game/highwayterrain.ts";

// a straight synthetic stretch of the cut: s along -z, right = +x
const pose = (k: number) => ({ s: MESA_CUT.s0 + k * 2, x: 0, y: 0, z: -(MESA_CUT.s0 + k * 2), tx: 0, tz: -1, rx: 1, rz: 0 }) as never;
const sAt = (k: number) => MESA_CUT.s0 + k * 2;
const ks = Array.from({ length: 21 }, (_, i) => i);

test("Mesa Cut walls use their own wall / lamp materials, never the road, lane paint or kit atlas", () => {
  const src = readFileSync(new URL("../../src/game/highway.ts", import.meta.url), "utf8");
  // the kit tunnel shell and its light strips are no longer baked (they carried the road-looking atlas tiles)
  assert.match(src, /p\.name === "tunnel_40" \|\| p\.name === "tunnel_light_strip_4m"\) \{ out\.placed\.push\(p\.name\); continue; \}/);
  assert.match(src, /mesaTunnelGeometry\(/);
  for (const m of [terrainMaterial(), tunnelLampMaterial()]) {
    assert.equal((m as { map?: unknown }).map ?? null, null, `${m.name} has no texture (no atlas, no lane paint)`);
    assert.doesNotMatch(m.name, /road|paint|lane|city|kit|asphalt/i);
  }
});

test("Mesa Cut shell: walls stand off the road edge, a ceiling over the cam, lamps every 8 m inside", () => {
  const g = mesaTunnelGeometry(pose, ks, sAt, 0, 0)!;
  assert.ok(g);
  const p = g.getAttribute("position");
  let maxY = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    maxY = Math.max(maxY, y);
    // nothing of the shell sits on the carriageway (road half-width 12) below the vault springline
    if (y < MESA_TUNNEL.spring) assert.ok(Math.abs(x) >= 12.5, `shell vertex on the road at x=${x.toFixed(2)} y=${y.toFixed(2)}`);
  }
  assert.ok(maxY >= 19.5 && maxY < MESA_CUT.openTop, `ceiling crown ${maxY} above the 13.5 m chase cam, inside the cliff opening`);
  const l = mesaTunnelLamps(pose, ks, sAt, 0, 0)!;
  assert.ok(l);
  // 40 m chunk of the cut: 5 fixtures a side (6 verts each) + the two crown strips (20 segments x 2 x 6)
  const n = l.getAttribute("position").count;
  assert.ok(n >= 2 * 4 * 6 + 20 * 2 * 6, `lamp verts ${n}`);
});
