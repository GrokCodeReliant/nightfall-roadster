// M1 (d): phone draw-call pass gate (was `true` unconditionally at smoke.mjs:97).
export const PHONE_DRAW_BUDGET = 120;
export function drawGate(profile, draws) {
  if (profile !== "phone") return true; // desktop: logged only
  return Number.isFinite(draws) && draws <= PHONE_DRAW_BUDGET;
}
