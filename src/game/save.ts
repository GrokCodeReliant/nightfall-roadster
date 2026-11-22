/**
 * Save blob (localStorage "nightfall-roadster-v2") parse / merge, kept pure so old-save migration is unit-tested.
 * Pre-per-course saves are { bestScore, bestWave, bestTime, credits, shop } with no `race`: those wave-run bests are
 * kept as they are (they never held a race place, so nothing maps into `race`), and `race` defaults to {}.
 * Saves from before Spare chassis (RACE_RESPAWNS v1.0 §5) have no `shop.spareLives`: it migrates to 0 (stock 3 lives);
 * a stored tier is clamped to 0..2 (sanitizeShop / spareLivesTier).
 */
import { sanitizeRaceBests, type RaceBests } from "./records";
import { emptyShop, sanitizeShop, type ShopSave } from "./shop";

/** race: optional per-course race records (records.ts). Missing in older saves; defaults to {}. */
export type Save = { bestScore: number; bestWave: number; bestTime: number; credits: number; shop: ShopSave; race: RaceBests };

export const emptySave = (): Save => ({ bestScore: 0, bestWave: 0, bestTime: 0, credits: 0, shop: emptyShop(), race: {} });

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function parseSave(raw: string | null | undefined): Save {
  if (!raw) return emptySave();
  let p: Partial<Save> | null;
  try {
    p = JSON.parse(raw) as Partial<Save> | null;
  } catch {
    return emptySave();
  }
  if (!p || typeof p !== "object") return emptySave();
  return {
    bestScore: num(p.bestScore),
    bestWave: num(p.bestWave),
    bestTime: num(p.bestTime),
    credits: Math.max(0, Math.floor(num(p.credits))),
    shop: sanitizeShop(p.shop),
    race: sanitizeRaceBests(p.race),
  };
}

export function mergeSave(prev: Save, patch: Partial<Save>): Save {
  return {
    bestScore: patch.bestScore ?? prev.bestScore,
    bestWave: patch.bestWave ?? prev.bestWave,
    bestTime: patch.bestTime ?? prev.bestTime,
    credits: patch.credits ?? prev.credits,
    shop: patch.shop ?? prev.shop,
    race: patch.race ?? prev.race,
  };
}
