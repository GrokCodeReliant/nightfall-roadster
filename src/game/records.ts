/**
 * Per-course race records (optional save field `race`). Only placed race finishes write here; wave runs never do.
 * Old saves have no `race` field and load as {}.
 */
import { formatTime, type Result } from "./sim";

export type RaceBest = { place: number; time: number };
export type RaceBests = Record<string, RaceBest>;

export function sanitizeRaceBests(raw: unknown): RaceBests {
  const out: RaceBests = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const r = v as Partial<RaceBest> | null;
    if (!r || typeof r !== "object") continue;
    const place = Number(r.place);
    const time = Number(r.time);
    if (!Number.isInteger(place) || place < 1 || place > 4 || !Number.isFinite(time) || time <= 0) continue;
    out[id] = { place, time };
  }
  return out;
}

/** Better = lower place, then faster time. DNF (place 0 / missing) and wave runs leave the table unchanged. */
export function recordRace(bests: RaceBests, stageId: string, r: Result): RaceBests {
  if (r.mode !== "race" || !stageId || !r.place || r.place < 1 || r.place > 4 || !(r.time > 0)) return bests;
  const prev = bests[stageId];
  if (prev && (prev.place < r.place || (prev.place === r.place && prev.time <= r.time))) return bests;
  return { ...bests, [stageId]: { place: r.place, time: r.time } };
}

/** Race-card / race-stage title line: that course's own best, never a wave record. */
export function raceBestLine(bests: RaceBests, stageId: string, name: string) {
  const b = bests[stageId];
  if (!b) return `No ${name} finish yet — race for a place.`;
  return `${name} best P${b.place} · ${formatTime(b.time)}`;
}
