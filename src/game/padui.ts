/**
 * Pause / title / shop pad nav on top of applyGamepad.
 * Combat verbs stay in applyGamepad. This only reads the standard pad and
 * returns one UI event per sample. Sample it outside step(), and pass
 * ignore while keysOverride is set.
 *
 * Title hub rows (same Confirm / Back as the in-race menus): car, stage,
 * Start, Shop, Settings, and Fully upgraded when that row is in the count.
 * Left/right cycles the focused picker. A cycles the car, starts, or opens
 * Shop / Settings. B on the title is a no-op. The first standard pad sample
 * on the title snaps focus to Start. Shop / Settings opened from the title
 * restore that row when they close. In-shop pad nav is unchanged (rows, A
 * buy, B / View / Start close).
 * Pause focus is the existing menu: Resume, Restart, Back to menu, Settings
 * (and Fully upgraded when ?debug draws it). Shop is not on the pause menu.
 * Settings: D-pad / stick moves rows, left/right steps the focused slider,
 * A steps it up or closes on the last row, B closes.
 */
import type { GamepadSample, Sim } from "./sim";

/** Same deadzone as applyGamepad. */
const PAD_DEAD = 0.18;

export type PadUiMode = "playing" | "paused" | "shop" | "title" | "settings" | "other";

/** Title hub row order. Fully upgraded is appended only when the count includes it. */
export const TITLE_CAR = 0;
export const TITLE_STAGE = 1;
export const TITLE_START = 2;
export const TITLE_SHOP = 3;
export const TITLE_SETTINGS = 4;
export const TITLE_FULL = 5;

export type PadUiEvent =
  | { type: "pause" }
  | { type: "resume" }
  | { type: "startRun" }
  | { type: "activate"; index: number }
  | { type: "shopBuy"; index: number }
  | { type: "shopClose" }
  | { type: "settingsClose" }
  | { type: "settingsStep"; delta: number }
  | { type: "cycleCar"; delta: number }
  | { type: "cycleStage"; delta: number }
  | { type: "openShop" }
  | { type: "openSettings" }
  | { type: "fullyUpgraded" };

export type PadUiState = {
  /** Last mode we sampled, so opening pause/shop snaps focus to the first row. */
  mode: PadUiMode | "";
  prevStart: boolean;
  prevA: boolean;
  prevB: boolean;
  prevView: boolean;
  prevNav: number;
  prevHoriz: number;
  focus: number;
  /** True after the first live sample, so the title snap happens once. */
  padSeen: boolean;
  /** Title row to restore when Shop or Settings closes back to the hub. */
  titleFocus: number;
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
  /** Settings rows, including the Close row. Defaults to 2. */
  settingsCount?: number;
  /** Title hub rows. Defaults to 5 (car, stage, Start, Shop, Settings). */
  titleCount?: number;
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
    prevHoriz: 0,
    focus: 0,
    padSeen: false,
    titleFocus: TITLE_START,
    holdFire: false,
    holdMine: false,
    holdView: false,
  };
}

function pressed(sample: GamepadSample, index: number) {
  const button = sample.buttons[index];
  return !!button && (button.pressed || button.value > 0.5);
}

/** D-pad left/right, else left stick X. Left is −1. */
function horizontalNav(sample: GamepadSample) {
  const left = pressed(sample, 14);
  const right = pressed(sample, 15);
  if (left !== right) return left ? -1 : 1;
  const x = sample.axes[0] ?? 0;
  if (!Number.isFinite(x) || Math.abs(x) < PAD_DEAD) return 0;
  return x < 0 ? -1 : 1;
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

function remember(state: PadUiState, start: boolean, a: boolean, b: boolean, view: boolean, nav: number, horiz: number) {
  state.prevStart = start;
  state.prevA = a;
  state.prevB = b;
  state.prevView = view;
  state.prevNav = nav;
  state.prevHoriz = horiz;
}

/**
 * One UI event from a standard-mapping sample.
 * Playing: Start toggles to pause. Paused: Start or B resumes, A activates
 * the focused row, D-pad / left stick Y moves focus. Shop: stick or D-pad
 * moves rows, A buys, B or View or Start closes. Settings: rows, A steps the
 * slider or closes, left/right steps the slider, B closes. Title: D-pad / stick
 * moves the hub rows, left/right cycles car and stage, A confirms the focused
 * row, B is a no-op, Start (buttons[9]) begins the run when canStart. The first
 * sample on the title snaps focus to Start. `ignore` (keysOverride) updates
 * edges and does nothing else. A and B are masked while title, shop, or
 * settings are up so they cannot fire or mine.
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
    state.prevHoriz = 0;
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
  const horiz = horizontalNav(sample);
  if (!a) state.holdFire = false;
  if (!b) state.holdMine = false;
  if (!view) state.holdView = false;

  const startEdge = start && !state.prevStart;
  const aEdge = a && !state.prevA;
  const bEdge = b && !state.prevB;
  const viewEdge = view && !state.prevView;

  if (opts.ignore) {
    remember(state, start, a, b, view, nav, horiz);
    state.mode = mode;
    return null;
  }

  const prevMode = state.mode;
  const entered = prevMode !== mode;
  state.mode = mode;
  const titleCount = Math.max(1, opts.titleCount ?? 5);
  const restoringTitle = entered && mode === "title" && (prevMode === "shop" || prevMode === "settings");
  if (restoringTitle) state.focus = Math.max(0, Math.min(titleCount - 1, state.titleFocus));
  else if (entered && (mode === "paused" || mode === "shop" || mode === "settings")) state.focus = 0;

  let snapped = false;
  if (!state.padSeen) {
    state.padSeen = true;
    if (mode === "title" && !restoringTitle) {
      const startRow = Math.min(TITLE_START, titleCount - 1);
      state.focus = opts.canStart ? startRow : Math.min(TITLE_SHOP, titleCount - 1);
      snapped = true;
    }
  }

  const count =
    mode === "shop" ? opts.shopCount
    : mode === "paused" ? opts.pauseCount
    : mode === "settings" ? (opts.settingsCount ?? 2)
    : mode === "title" ? titleCount
    : 0;
  const menuNav = mode === "paused" || mode === "shop" || mode === "settings" || mode === "title";
  if (!entered && !snapped && menuNav && nav !== 0 && nav !== state.prevNav && count > 0) state.focus += nav;
  if (count > 0) state.focus = Math.max(0, Math.min(count - 1, state.focus));
  const horizEdge = horiz !== 0 && horiz !== state.prevHoriz;
  remember(state, start, a, b, view, nav, horiz);

  if ((mode === "title" || mode === "shop" || mode === "settings") && a) state.holdFire = true;
  if ((mode === "title" || mode === "shop" || mode === "settings") && b) state.holdMine = true;

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

  if (mode === "settings") {
    if (bEdge) {
      state.holdMine = true;
      return { type: "settingsClose" };
    }
    if (aEdge) {
      state.holdFire = true;
      if (state.focus >= count - 1) return { type: "settingsClose" };
      return { type: "settingsStep", delta: 1 };
    }
    if (horizEdge && state.focus === 0) return { type: "settingsStep", delta: horiz };
    return null;
  }

  if (mode === "title") {
    state.titleFocus = state.focus;
    if (startEdge && opts.canStart) return { type: "startRun" };
    if (horizEdge && !snapped) {
      if (state.focus === TITLE_CAR) return { type: "cycleCar", delta: horiz };
      if (state.focus === TITLE_STAGE) return { type: "cycleStage", delta: horiz };
    }
    if (aEdge) {
      const row = state.focus;
      if (row === TITLE_CAR) return { type: "cycleCar", delta: 1 };
      if (row === TITLE_START && opts.canStart) return { type: "startRun" };
      if (row === TITLE_SHOP) return { type: "openShop" };
      if (row === TITLE_SETTINGS) return { type: "openSettings" };
      if (row === TITLE_FULL) return { type: "fullyUpgraded" };
      return null;
    }
    return null;
  }
  return null;
}

/** Drop combat verbs the menu already consumed this hold. Does not grant thrust. */
export function maskPadCombat(sim: Sim, state: PadUiState) {
  if (state.holdFire) sim.pad.fire = false;
  if (state.holdMine) sim.pad.mine = false;
  if (state.holdView) sim.touchTrack = false;
}
