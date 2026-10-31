/**
 * Pause / title / shop pad nav on top of applyGamepad.
 * Combat verbs stay in applyGamepad. This only reads the standard pad and
 * returns one UI event per sample. Sample it outside step(), and pass
 * ignore while keysOverride is set.
 *
 * Title path: Start (buttons[9]) begins the run when the selected stage is
 * ready. The title Shop button stays mouse/touch — there is no title focus
 * list. In-shop pad nav is wired (rows, A buy, B / View / Start close).
 * Pause focus is the existing menu: Resume, Restart, Back to menu
 * (and Fully upgraded when ?debug draws it). Shop is not on the pause menu.
 */
import type { GamepadSample, Sim } from "./sim";

/** Same deadzone as applyGamepad. */
const PAD_DEAD = 0.18;

export type PadUiMode = "playing" | "paused" | "shop" | "title" | "other";

export type PadUiEvent =
  | { type: "pause" }
  | { type: "resume" }
  | { type: "startRun" }
  | { type: "activate"; index: number }
  | { type: "shopBuy"; index: number }
  | { type: "shopClose" };

export type PadUiState = {
  /** Last mode we sampled, so opening pause/shop snaps focus to the first row. */
  mode: PadUiMode | "";
  prevStart: boolean;
  prevA: boolean;
  prevB: boolean;
  prevView: boolean;
  prevNav: number;
  focus: number;
  /** Held after the UI ate A, so the press does not also fire. */
  holdFire: boolean;
  /** Held after the UI ate B, so the press does not also drop a mine. */
  holdMine: boolean;
  /** Held after the UI ate View, so the press does not also toggle Track. */
  holdView: boolean;
};

export type PadUiOpts = {
  pauseCount: number;
  shopCount: number;
  canStart: boolean;
  ignore: boolean;
};

export function emptyPadUi(): PadUiState {
  return {
    mode: "",
    prevStart: false,
    prevA: false,
    prevB: false,
    prevView: false,
    prevNav: 0,
    focus: 0,
    holdFire: false,
    holdMine: false,
    holdView: false,
  };
}

function pressed(sample: GamepadSample, index: number) {
  const button = sample.buttons[index];
  return !!button && (button.pressed || button.value > 0.5);
}

/** D-pad up/down, else left stick Y. Up is −1 (focus toward the first row). */
function verticalNav(sample: GamepadSample) {
  const up = pressed(sample, 12);
  const down = pressed(sample, 13);
  if (up !== down) return up ? -1 : 1;
  const y = sample.axes[1] ?? 0;
  if (!Number.isFinite(y) || Math.abs(y) < PAD_DEAD) return 0;
  return y < 0 ? -1 : 1;
}

function remember(state: PadUiState, start: boolean, a: boolean, b: boolean, view: boolean, nav: number) {
  state.prevStart = start;
  state.prevA = a;
  state.prevB = b;
  state.prevView = view;
  state.prevNav = nav;
}

/**
 * One UI event from a standard-mapping sample.
 * Playing: Start toggles to pause. Paused: Start or B resumes, A activates
 * the focused row, D-pad / left stick Y moves focus. Shop: stick or D-pad
 * moves rows, A buys, B or View or Start closes. Title: Start begins the run
 * when canStart. `ignore` (keysOverride) updates edges and does nothing else.
 */
export function stepPadUi(
  sample: GamepadSample | null,
  state: PadUiState,
  mode: PadUiMode,
  opts: PadUiOpts,
): PadUiEvent | null {
  if (!sample) {
    state.prevStart = false;
    state.prevA = false;
    state.prevB = false;
    state.prevView = false;
    state.prevNav = 0;
    state.holdFire = false;
    state.holdMine = false;
    state.holdView = false;
    return null;
  }

  const start = pressed(sample, 9);
  const a = pressed(sample, 0);
  const b = pressed(sample, 1);
  const view = pressed(sample, 8);
  const nav = verticalNav(sample);
  if (!a) state.holdFire = false;
  if (!b) state.holdMine = false;
  if (!view) state.holdView = false;

  const startEdge = start && !state.prevStart;
  const aEdge = a && !state.prevA;
  const bEdge = b && !state.prevB;
  const viewEdge = view && !state.prevView;

  if (opts.ignore) {
    remember(state, start, a, b, view, nav);
    state.mode = mode;
    return null;
  }

  const entered = state.mode !== mode;
  state.mode = mode;
  if (entered && (mode === "paused" || mode === "shop")) state.focus = 0;

  const count = mode === "shop" ? opts.shopCount : mode === "paused" ? opts.pauseCount : 0;
  if (!entered && (mode === "paused" || mode === "shop") && nav !== 0 && nav !== state.prevNav && count > 0) {
    state.focus += nav;
  }
  if (count > 0) state.focus = Math.max(0, Math.min(count - 1, state.focus));
  remember(state, start, a, b, view, nav);

  if (mode === "playing") {
    if (startEdge) {
      state.focus = 0;
      return { type: "pause" };
    }
    return null;
  }

  if (mode === "paused") {
    if (startEdge || bEdge) {
      if (bEdge) state.holdMine = true;
      return { type: "resume" };
    }
    if (aEdge) {
      state.holdFire = true;
      return { type: "activate", index: state.focus };
    }
    return null;
  }

  if (mode === "shop") {
    if (bEdge || viewEdge || startEdge) {
      if (bEdge) state.holdMine = true;
      if (viewEdge) state.holdView = true;
      return { type: "shopClose" };
    }
    if (aEdge && count > 0) {
      state.holdFire = true;
      return { type: "shopBuy", index: state.focus };
    }
    return null;
  }

  if (mode === "title" && startEdge && opts.canStart) return { type: "startRun" };
  return null;
}

/** Drop combat verbs the menu already consumed this hold. Does not grant thrust. */
export function maskPadCombat(sim: Sim, state: PadUiState) {
  if (state.holdFire) sim.pad.fire = false;
  if (state.holdMine) sim.pad.mine = false;
  if (state.holdView) sim.touchTrack = false;
}
