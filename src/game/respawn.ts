/**
 * Race respawns — LEVELS/RACE_RESPAWNS.md v1.0 (Systems Designer, LOCKED for Build, Nov 22 2026).
 * Race runs only (Open Highway + authored courses); wave runs never read any of this.
 * All tuning lives here (§6). Systems owns the numbers; change them here, not in sim.ts.
 */

/** §1 respawn budget per car per race, by difficulty. */
export const RESPAWNS = { easy: 3, normal: 4, hard: 6 } as const;
export type Difficulty = keyof typeof RESPAWNS;
/**
 * §1: no difficulty select exists yet, so Normal ships as the only value. HOOK: a future Easy/Hard menu toggle
 * (flagged to Sara as its own bite) only has to set this per run; respawnBudget() already takes it.
 */
export const DIFFICULTY: Difficulty = "normal";
/** §2 seconds from the kill to the respawn */
export const RESPAWN_DELAY = 2.0;
/** §2 at most one respawn per this many seconds across the whole field (queued ones stagger) */
export const RESPAWN_STAGGER = 1.0;
/** §2 back from the death point */
export const RESPAWN_BACK = 40;
/** §2 back from the hero */
export const RESPAWN_HERO_BACK = 60;
/** §2 step-back search: 20 m steps, up to this far behind the first candidate */
export const RESPAWN_MAX_BACK = 120;
export const RESPAWN_STEP = 20;
/** §2 nothing passed: wait this long and retry */
export const RESPAWN_RETRY = 0.5;
/** §2 respawn speed (the hero's respawn value), then the car's own cruise */
export const RESPAWN_SPEED = 22;
/** §3 invulnerability after a respawn (the hero's loseLife value) */
export const RESPAWN_INVULN = 1.5;
/** §4 score multiplier for the 1st, 2nd, 3rd+ kill of the same car (25 % floor) */
export const KILL_DECAY = [1, 0.5, 0.25] as const;
/** §4 elimination bonus × tier on the final kill */
export const ELIM_BONUS = 100;
/** §5 Spare chassis (shop id `spare`): tier 1 then tier 2 */
export const SPARE_PRICE = [80, 140] as const;
export const SPARE_MAX = 2;

/** §1 + §5: per-car budget = max(table[difficulty], hero starting lives incl. Spare chassis). */
export function respawnBudget(heroStartLives: number, difficulty: Difficulty = DIFFICULTY) {
  const lives = Number.isFinite(heroStartLives) ? Math.max(0, Math.floor(heroStartLives)) : 0;
  return Math.max(RESPAWNS[difficulty], lives);
}

/** §4 multiplier for the kill with 0-based index n on the same car */
export function killDecay(n: number) {
  return KILL_DECAY[Math.max(0, Math.min(KILL_DECAY.length - 1, Math.floor(n)))];
}

/** §4 score for one race kill: base 100×tier (void 50×tier) × decay, plus +100×tier when it eliminates the car. */
export function raceKillScore(tier: number, killIndex: number, fell: boolean, eliminated: boolean) {
  const base = (fell ? 50 : 100) * tier;
  return Math.round(base * killDecay(killIndex)) + (eliminated ? ELIM_BONUS * tier : 0);
}

/**
 * §2 respawn search order: first max(deathAlong − 40, hero.along − 60), never ahead of the hero, then 20 m steps
 * back until RESPAWN_MAX_BACK. The caller takes the first one that passes its spawn checks.
 */
export function respawnCandidates(deathAlong: number, heroAlong: number): number[] {
  const first = Math.min(heroAlong, Math.max(deathAlong - RESPAWN_BACK, heroAlong - RESPAWN_HERO_BACK));
  const out: number[] = [];
  for (let back = 0; back <= RESPAWN_MAX_BACK; back += RESPAWN_STEP) out.push(first - back);
  return out;
}
