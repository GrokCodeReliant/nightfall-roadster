import { test } from "node:test";
import assert from "node:assert/strict";
import { NIGHT_CITY, courseFor, sectionAt, sectionById } from "../../src/game/course.ts";
import {
  RACE_DIST,
  RACE_HP,
  RIVAL_COUNT,
  RIVAL_SPEEDS,
  begin,
  createSim,
  step,
} from "../../src/game/sim.ts";

const dt = 1 / 60;
const HARASS = new Set(["drone", "mine", "spiker", "boss"]);

test("NC §9.1 course table is contiguous, sums to 3600, and finishes at 3600", () => {
  const sections = NIGHT_CITY.sections;
  assert.ok(sections.length >= 2);
  let sum = 0;
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    assert.equal(sec.s0, sum, sec.id);
    assert.ok(sec.len > 0, sec.id);
    assert.equal(sec.width, 24, sec.id);
    if (i > 0) assert.equal(sec.s0, sections[i - 1].s0 + sections[i - 1].len, sec.id);
    sum += sec.len;
  }
  assert.equal(sum, 3600);
  assert.equal(NIGHT_CITY.length, 3600);
  const last = sections[sections.length - 1];
  assert.equal(last.id, "NC-12");
  assert.equal(last.s0 + last.len, 3600);
  assert.equal(sectionAt(NIGHT_CITY, 0)?.id, "NC-0");
  assert.equal(sectionAt(NIGHT_CITY, 3599.9)?.id, "NC-12");
  assert.equal(sectionAt(NIGHT_CITY, 3600)?.id, "NC-12");
  assert.equal(sectionById(NIGHT_CITY, "NC-6")?.type, "tunnel");
  assert.equal(courseFor("classic"), null);
  assert.equal(courseFor("highway"), null);
});

test("NC §9.3 begin(city) arms a 3600 m race with the H3.2 field and no waves", () => {
  assert.equal(RACE_DIST, 2200);
  const sim = createSim();
  sim.stageId = "city";
  begin(sim);
  assert.equal(sim.race.armed, true);
  assert.equal(sim.race.dist, 3600);
  assert.equal(sim.toast, "Race the field — place pays");
  const rivals = sim.cars.filter((c) => c.racer && c.alive);
  assert.equal(rivals.length, RIVAL_COUNT);
  assert.ok(rivals.every((c) => c.hp === RACE_HP && c.maxHp === RACE_HP));
  assert.ok(rivals.every((c) => c.kind === "rammer" || c.kind === "gunner"));
  const speeds = rivals.map((c) => c.raceSpeed).sort((a, b) => a - b);
  assert.deepEqual(speeds, [...RIVAL_SPEEDS].sort((a, b) => a - b));
  assert.equal(sim.cars.filter((c) => c.alive && !c.hero && !c.racer).length, 0);

  sim.lull = 1e9;
  sim.keysOverride = new Set();
  const seen = new Set<string>();
  for (let i = 0; i < 60 * 30; i++) {
    step(sim, dt);
    for (const c of sim.cars) if (!c.hero) seen.add(c.kind);
  }
  assert.equal(sim.wave, 0);
  assert.equal(sim.queue.length, 0);
  // An idle hero stays on the scroll floor and DNFs behind the field. That is still a race, not a wave.
  assert.ok(sim.phase === "playing" || sim.result?.reason === "Fell behind the field", `${sim.phase} ${sim.toast}`);
  for (const kind of HARASS) assert.equal(seen.has(kind), false, kind);

  const again = createSim();
  again.stageId = "city";
  begin(again);
  assert.equal(again.race.armed, true);
  assert.equal(again.race.dist, 3600);
  assert.notEqual(again.track, sim.track);
});

test("classic still runs waves after Night City is a race", () => {
  const sim = createSim();
  sim.stageId = "classic";
  begin(sim);
  assert.equal(sim.race.armed, false);
  assert.equal(sim.race.dist, RACE_DIST);
  assert.equal(sim.toast, "Hunters inbound. Survive.");
  sim.keysOverride = new Set();
  for (let i = 0; i < 60 * 30; i++) step(sim, dt);
  assert.ok(sim.wave >= 1, `wave ${sim.wave}`);
  assert.equal(sim.race.armed, false);
});
