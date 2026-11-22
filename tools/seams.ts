// Road seam audit (coast seam fix): walks every 40 m chunk of an authored course and reports where the OLD rigid pieces
// (straight kit tile at the chunk midpoint, the 0.05 m ribbon, straight 40 m coast strips) left the true centreline.
// Run: npx tsx tools/seams.ts   (the bent pieces from roadbend.ts are checked by tests/unit/roadseams.test.ts)
import { buildCourseTrack, sampleAt, STEP } from "../src/game/road";
import { COAST_ROAD, NIGHT_CITY, COURSE_ORIGIN } from "../src/game/course";
import { roadTilesFit } from "../src/game/city";
const SEG = 20;
for (const course of [COAST_ROAD, NIGHT_CITY]) {
  const t = buildCourseTrack(course);
  const end = COURSE_ORIGIN + course.length + course.runout;
  const rows: string[] = [];
  let prevMode = "";
  let prevEnd: { x: number; z: number; y: number; yaw: number } | null = null;
  for (let c = 0; c * SEG * STEP < end; c++) {
    const a = sampleAt(t, c * SEG), b = sampleAt(t, c * SEG + SEG), mid = sampleAt(t, c * SEG + SEG / 2);
    let bend = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
    while (bend > Math.PI) bend -= 2 * Math.PI; while (bend < -Math.PI) bend += 2 * Math.PI;
    let lo = 1e9, hi = -1e9;
    for (let k = 0; k <= SEG; k++) { const s = sampleAt(t, c * SEG + k); lo = Math.min(lo, s.y); hi = Math.max(hi, s.y); }
    const tile = roadTilesFit(true, Math.abs(bend), hi - lo, false);
    // straight-piece error vs the true samples: lateral (along mid.r) and vertical (flat at mid.y)
    let lat = 0, dy = 0;
    for (let k = 0; k <= SEG; k++) {
      const s = sampleAt(t, c * SEG + k);
      const dz = (k - SEG / 2) * STEP;
      const px = mid.x + mid.tx * dz, pz = mid.z + mid.tz * dz;
      lat = Math.max(lat, Math.abs((s.x - px) * mid.rx + (s.z - pz) * mid.rz));
      dy = Math.max(dy, Math.abs(s.y - mid.y));
    }
    const mode = tile ? "tile" : "ribbon";
    const rs = c * SEG * STEP - COURSE_ORIGIN;
    const notes: string[] = [];
    if (tile && (lat > 0.05 || dy > 0.02)) notes.push(`tile off-curve lat ${lat.toFixed(2)} m, end dy ${dy.toFixed(2)} m, bend ${(bend * 180 / Math.PI).toFixed(1)}°`);
    if (prevMode && prevMode !== mode) notes.push(`${prevMode}->${mode} seam (surface step 0.05 m, kerb/skirt vs ribbon)`);
    if (!tile && lat > 0.3) notes.push(`straight 40 m strips (shoulder/cliff/water) off-curve ${lat.toFixed(2)} m`);
    if (tile && lat > 0.3) notes.push(`straight 40 m strips off-curve ${lat.toFixed(2)} m`);
    if (notes.length) rows.push(`${course.id} chunk ${c} race s ${rs}..${rs + 40}: ${mode}; ${notes.join("; ")}`);
    prevMode = mode;
  }
  console.log(`== ${course.id}: ${rows.length} flagged chunks`);
  for (const r of rows) console.log(r);
}
