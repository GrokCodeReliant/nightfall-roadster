// week-i-pass: BN-19 rockfall (LEVELS/06_mountain_pass.md §5 RF). Pure state + rules; sim.ts applies the impact and pushes
// the landed rock into sim.trucks as a static mover (OB rule, rivals steer round it), world.ts draws the falling rock and
// its ground shadow. Deterministic: seeded per zone (rockSeed(stage, zone)), driven by the race clock and the hero's s.
import { ROCKFALL, rockSeed, rockZonesFor, sandFor } from "./course";

export type Rock = { id: string; zone: string; s: number; lat: number; t0: number; tImpact: number; state: "falling" | "down" | "gone" };
export type RockZoneState = { id: string; next: number; rng: number; n: number };
export type RockState = { rocks: Rock[]; zones: RockZoneState[] };

export function freshRocks(stageId: string): RockState {
  return { rocks: [], zones: rockZonesFor(stageId).map((z) => ({ id: z.id, next: -Infinity, rng: rockSeed(stageId, z.id), n: 0 })) };
}

/** mulberry32 step on the zone's own state */
function rnd(z: RockZoneState) {
  z.rng = (z.rng + 0x6d2b79f5) >>> 0;
  let t = z.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** §8.6: no rock target in a lane with ice within 40 m */
function iceNear(stageId: string, s: number, lat: number) {
  return sandFor(stageId).some((p) => p.kind === "ice" && Math.abs(p.lat - lat) < 3.1 && s > p.s0 - ROCKFALL.iceGap && s < p.s1 + ROCKFALL.iceGap);
}

/** One tick. heroS = hero race s; time = race clock. Returns the rocks that land this tick and the ones that crumble. */
export function stepRocks(stageId: string, st: RockState, heroS: number, time: number): { landed: Rock[]; gone: Rock[] } {
  const landed: Rock[] = [];
  const gone: Rock[] = [];
  const zones = rockZonesFor(stageId);
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const zs = st.zones[i];
    if (heroS < z.s0 - ROCKFALL.ahead1 || heroS > z.s1 - ROCKFALL.ahead0 || time < zs.next) continue;
    zs.next = time + ROCKFALL.period;
    const a = rnd(zs), b = rnd(zs);
    const s = heroS + ROCKFALL.ahead0 + (ROCKFALL.ahead1 - ROCKFALL.ahead0) * a;
    if (s < z.s0 || s > z.s1) continue;
    // max one live rock per 40 m window, so at most one lane is ever closed
    if (st.rocks.some((r) => r.state !== "gone" && Math.abs(r.s - s) < ROCKFALL.window)) continue;
    const k0 = Math.floor(b * z.lanes.length);
    let lat: number | null = null;
    for (let k = 0; k < z.lanes.length; k++) {
      const l = z.lanes[(k0 + k) % z.lanes.length];
      if (!iceNear(stageId, s, l)) { lat = l; break; }
    }
    if (lat == null) continue;
    zs.n++;
    st.rocks.push({ id: `${z.id}-${zs.n}`, zone: z.id, s, lat, t0: time, tImpact: time + ROCKFALL.telegraph, state: "falling" });
  }
  for (const r of st.rocks) {
    if (r.state === "falling" && time >= r.tImpact) {
      r.state = "down";
      landed.push(r);
    } else if (r.state === "down" && time >= r.tImpact + ROCKFALL.life) {
      r.state = "gone";
      gone.push(r);
    }
  }
  st.rocks = st.rocks.filter((r) => r.state !== "gone");
  return { landed, gone };
}

/** falling-rock height over the deck (u 0 at spawn -> 1 at impact; accelerating) */
export const rockDropY = (r: Rock, time: number) => ROCKFALL.drop * (1 - Math.min(1, Math.max(0, (time - r.t0) / ROCKFALL.telegraph)) ** 2);
