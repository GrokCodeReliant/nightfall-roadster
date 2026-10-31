// M2: phone draw-call gate. 120 is a soft target (reported, not a CI fail).
// Hard ceiling stays the M1 combat limit of 160.
export const PHONE_DRAW_SOFT = 120;
export const PHONE_DRAW_HARD = 160;

/** Hard pass/fail. Phone combat must stay ≤160. Desktop is log-only. */
export function drawGate(profile, draws) {
  if (profile !== "phone") return true;
  return Number.isFinite(draws) && draws <= PHONE_DRAW_HARD;
}

/** Soft 120 report. overSoft does not fail the gate; overHard does. */
export function drawReport(profile, draws) {
  const n = Number(draws);
  const finite = Number.isFinite(n);
  const overHard = profile === "phone" && (!finite || n > PHONE_DRAW_HARD);
  const overSoft = profile === "phone" && finite && n > PHONE_DRAW_SOFT;
  const note = !finite
    ? "draw count missing"
    : overHard
      ? `HARD over ceiling ${n} > ${PHONE_DRAW_HARD}`
      : overSoft
        ? `soft target missed ${n} > ${PHONE_DRAW_SOFT} (ceiling ${PHONE_DRAW_HARD})`
        : profile === "phone"
          ? `within soft target ${n} ≤ ${PHONE_DRAW_SOFT}`
          : `desktop logged ${n}`;
  return { profile, draws: finite ? n : null, softTarget: PHONE_DRAW_SOFT, hardCeiling: PHONE_DRAW_HARD, overSoft, overHard, note };
}
