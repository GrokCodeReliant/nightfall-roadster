/**
 * Desktop distant-car LOD (Week I, NC-4 desktop combat tri cap 250k).
 * Rivals and enemies further than CAR_LOD_FAR m from the hero (the chase cam sits behind the hero) draw the phone enemy GLB
 * (same nodes, pivots, bbox and materials as the desktop GLB, ~half the triangles); they come back to
 * the desktop GLB inside CAR_LOD_NEAR m. The 5 m band is the hysteresis so a car near the line does not flicker.
 * The hero never switches. Phone (coarse) already uses the phone GLB for everything, so this is off there.
 */
export const CAR_LOD_FAR = 30;
export const CAR_LOD_NEAR = 25;

/** next far/near state for one car view */
export function carLodFar(prevFar: boolean, dist: number, hero: boolean, enabled: boolean): boolean {
  if (hero || !enabled || !Number.isFinite(dist)) return false;
  return prevFar ? dist > CAR_LOD_NEAR : dist > CAR_LOD_FAR;
}
