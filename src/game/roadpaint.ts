// Per-stage centre-line colour for the shared lane-paint piece (lanepaint_straight_40 on road_kit_atlas).
// Night City keeps its magenta paint; Coast Road and Pine Woods recolour the magenta texels to road yellow in a
// material clone (world.ts yellowPaintMat). The kit atlas has no yellow paint cell, so the swap is a colour remap.

/** Atlas paint cells (sRGB 0-255) the remap must keep or change. */
export const PAINT_CELLS = {
  centreMagenta: [255, 26, 158], // kit cell u 0.438: centre double line (Night City)
  studMagenta: [255, 64, 191], // kit_emissive cell u 0.563: centre studs
  white: [240, 240, 245], // edge + lane lines
  studRed: [255, 46, 38], // edge studs
  asphalt: [38, 39, 41],
} as const;
/** Road yellow for the centre double line, amber for the centre studs (sRGB). */
export const YELLOW = [242, 186, 24] as const;
export const AMBER = [255, 170, 40] as const;

const lin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
export const linear = (c: readonly number[]) => c.map(lin) as [number, number, number];
/** JS twin of the GLSL mask (linear-space input, any brightness): 1 on magenta paint, 0 on white / red / gold / asphalt. */
export function magentaMask(r: number, g: number, b: number) {
  const l = Math.max(r, g, b, 1e-4);
  const [R, G, B] = [r / l, g / l, b / l];
  return Math.min(1, Math.max(0, (Math.min(R, B * 2.2) - G - 0.12) / 0.1));
}
/** Remap a linear colour: magenta texels take the target hue at the texel's own brightness. */
export function remap(c: readonly number[], target: readonly number[]) {
  const m = magentaMask(c[0], c[1], c[2]);
  const l = Math.max(c[0], c[1], c[2]);
  const t = linear(target);
  return c.map((v, i) => v + (t[i] * l - v) * m);
}

const f = (c: readonly number[]) => linear(c).map((x) => x.toFixed(4)).join(", ");
/** Linear-space remap: the base colour goes road yellow, the emissive radiance (centre studs) amber. */
export const PAINT_GLSL = `
vec3 nfPaint( vec3 c, vec3 t ) {
  float l = max( c.r, max( c.g, max( c.b, 1e-4 ) ) );
  vec3 n = c / l;
  float m = clamp( ( min( n.r, n.b * 2.2 ) - n.g - 0.12 ) / 0.1, 0.0, 1.0 );
  return mix( c, t * l, m );
}
#define NF_YELLOW vec3( ${f(YELLOW)} )
#define NF_AMBER vec3( ${f(AMBER)} )`;
