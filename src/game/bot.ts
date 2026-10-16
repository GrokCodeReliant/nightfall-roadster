/** Test/debug autopilot (only reachable through the ?debug hook and the test suites). */
import { gapAhead, poseAt, queryTrack, wrapAngle, yawFromDir } from "./road";
import type { Sim } from "./sim";

export function botKeys(sim: Sim): string[] {
  const hero = sim.cars[0];
  const keys = ["KeyW"];
  const heroQ = queryTrack(sim.track, hero.x, hero.z, hero.along);
  let target = 0;
  let best = Infinity;
  let behind = false;
  for (const c of sim.cars) {
    if (c.hero || !c.alive) continue;
    const dS = c.along - hero.along;
    const lat = queryTrack(sim.track, c.x, c.z, c.along).lateral;
    if (dS > 3 && dS < 70 && dS < best) {
      best = dS;
      target = lat;
    }
    if (dS < -3 && dS > -40) {
      behind = true;
      if (Math.abs(lat - heroQ.lateral) < 3 && dS > -20) keys.push("KeyG");
    }
  }
  if (best < 60 && Math.abs(target - heroQ.lateral) < 3) keys.push("KeyF");
  if (best === Infinity && behind && hero.speed > 18) {
    keys[0] = "KeyS"; // let the chasers come past into the guns
  }
  const road = poseAt(sim.track, hero.along + 10);
  const err = Math.max(-9, Math.min(9, target)) - heroQ.lateral;
  const desired = yawFromDir(road.tx, road.tz) - Math.max(-0.3, Math.min(0.3, err * 0.05));
  const diff = wrapAngle(desired - hero.yaw);
  if (diff > 0.03) keys.push("KeyA");
  else if (diff < -0.03) keys.push("KeyD");
  if (gapAhead(sim.track, hero.along, 20) || heroQ.gap) keys.push("Space");
  return keys;
}
