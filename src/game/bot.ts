/** Test/debug autopilot (only reachable through the ?debug hook and the test suites). */
import { gapAhead, poseAt, queryTrack, wrapAngle, yawFromDir } from "./road";
import type { Sim } from "./sim";

export function botKeys(sim: Sim, cruise = false): string[] {
  const hero = sim.cars[0];
  const keys = ["KeyW"];
  const heroQ = queryTrack(sim.track, hero.x, hero.z, hero.along);
  let target = 0;
  let best = Infinity;
  let behind = false;
  let droneNear = false;
  let alongside = false;
  let crateOnly = false;
  for (const c of sim.cars) {
    if (c.hero || !c.alive) continue;
    const dS = c.along - hero.along;
    let lat = queryTrack(sim.track, c.x, c.z, c.along).lateral;
    if (c.kind === "drone") {
      if (Math.abs(dS) < 30) droneNear = true;
      continue;
    }
    if (c.kind === "boss") lat += lat > heroQ.lateral ? -0.5 : 0.5;
    if (Math.abs(dS) < 4 && c.kind === "spiker") alongside = true;
    if (dS > 3 && dS < 70 && dS < best) {
      best = dS;
      target = lat;
    }
    if (dS < -3 && dS > -40) {
      behind = true;
      if (Math.abs(lat - heroQ.lateral) < 3 && dS > -20) keys.push("KeyG");
    }
  }
  if (best === Infinity) {
    // nothing to shoot: go collect the nearest pickup / crate ahead
    let pd = Infinity;
    for (const p of sim.pickups) {
      if (!p.alive) continue;
      const dS = p.along - hero.along;
      if (dS > 4 && dS < 90 && dS < pd) {
        pd = dS;
        target = queryTrack(sim.track, p.x, p.z, p.along).lateral;
        if (p.crate) {
          best = dS;
          crateOnly = true;
        }
      }
    }
  }
  if (best < 70 && Math.abs(target - heroQ.lateral) < 4.5) keys.push("KeyF");
  if (sim.up.rockets > 0 && ((best < 90 && !crateOnly) || droneNear)) keys.push("KeyF");
  if ((best === Infinity && behind && hero.speed > 18) || (alongside && hero.speed > 14)) {
    keys[0] = "KeyS"; // let chasers / a spiker go past into the guns
  }
  if (droneNear && hero.fuel > 45 && !cruise) keys.push("Space", "KeyF");
  const road = poseAt(sim.track, hero.along + 10);
  const err = Math.max(-10, Math.min(10, target)) - heroQ.lateral;
  const desired = yawFromDir(road.tx, road.tz) - Math.max(-0.3, Math.min(0.3, err * 0.05));
  const diff = wrapAngle(desired - hero.yaw);
  if (diff > 0.03) keys.push("KeyA");
  else if (diff < -0.03) keys.push("KeyD");
  if (gapAhead(sim.track, hero.along, 20) || heroQ.gap) keys.push("Space");
  return keys;
}
