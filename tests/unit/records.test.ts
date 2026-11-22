import { test } from "node:test";
import assert from "node:assert/strict";
import { raceBestLine, recordRace, sanitizeRaceBests } from "../../src/game/records.ts";
import type { Result } from "../../src/game/sim.ts";

const res = (o: Partial<Result>): Result => ({ time: 60, score: 900, wave: 3, takedowns: 0, falls: 0, mode: "race", dist: 4000, reason: "", ...o }) as Result;

test("records: old saves (no race field / junk) load as empty", () => {
  assert.deepEqual(sanitizeRaceBests(undefined), {});
  assert.deepEqual(sanitizeRaceBests("x"), {});
  assert.deepEqual(sanitizeRaceBests({ coast: { place: 9, time: 3 }, city: { place: 2, time: -1 }, a: null }), {});
  assert.deepEqual(sanitizeRaceBests({ coast: { place: 2, time: 61.5 } }), { coast: { place: 2, time: 61.5 } });
});

test("records: only placed race finishes write, per course; wave runs and DNF never do", () => {
  let b = recordRace({}, "coast", res({ place: 3, time: 70 }));
  assert.deepEqual(b, { coast: { place: 3, time: 70 } });
  assert.equal(recordRace(b, "coast", res({ mode: "waves", place: 1, time: 10 })), b, "wave run ignored");
  assert.equal(recordRace(b, "coast", res({ place: 0, time: 50 })), b, "DNF ignored");
  assert.equal(recordRace(b, "coast", res({ place: 4, time: 40 })), b, "worse place ignored");
  b = recordRace(b, "coast", res({ place: 3, time: 65 }));
  assert.deepEqual(b.coast, { place: 3, time: 65 }, "same place, faster time");
  b = recordRace(b, "coast", res({ place: 1, time: 90 }));
  assert.deepEqual(b.coast, { place: 1, time: 90 }, "better place wins over time");
  b = recordRace(b, "city", res({ place: 2, time: 80 }));
  assert.deepEqual(b, { coast: { place: 1, time: 90 }, city: { place: 2, time: 80 } }, "courses are separate");
});

test("records: card line is that course's race best, no wave text", () => {
  const b = { coast: { place: 1, time: 45.47 } };
  assert.equal(raceBestLine(b, "coast", "Coast Road"), "Coast Road best P1 · 0:45.47");
  assert.equal(raceBestLine(b, "city", "Night City"), "No Night City finish yet — race for a place.");
  assert.ok(!/wave|pts/i.test(raceBestLine(b, "coast", "Coast Road")));
});
