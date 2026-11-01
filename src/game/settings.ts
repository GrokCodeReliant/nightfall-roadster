/**
 * Player settings. A vertical list in the Settings sheet; add fields here
 * and a row in that list when the next option lands.
 */
export const SETTINGS_KEY = "nightfall-roadster-settings-v1";

export const STEER_SENS_MIN = 0.4;
export const STEER_SENS_MAX = 1.4;
export const STEER_SENS_STEP = 0.05;
export const STEER_SENS_DEFAULT = 0.75;

export type Settings = { steerSens: number };

export type SettingsBox = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function clampSteerSens(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.NaN;
  const base = Number.isFinite(n) ? n : STEER_SENS_DEFAULT;
  const clamped = Math.min(STEER_SENS_MAX, Math.max(STEER_SENS_MIN, base));
  const steps = Math.round((clamped - STEER_SENS_MIN) / STEER_SENS_STEP);
  const snapped = STEER_SENS_MIN + steps * STEER_SENS_STEP;
  const fixed = Math.round(snapped * 100) / 100;
  return Math.min(STEER_SENS_MAX, Math.max(STEER_SENS_MIN, fixed));
}

export function defaultSettings(): Settings {
  return { steerSens: STEER_SENS_DEFAULT };
}

export function parseSettings(raw: string | null): Settings {
  if (!raw) return defaultSettings();
  try {
    const parsed = JSON.parse(raw) as { steerSens?: unknown };
    return { steerSens: clampSteerSens(parsed?.steerSens) };
  } catch {
    return defaultSettings();
  }
}

function boxOr(store?: SettingsBox | null): SettingsBox | null {
  if (store) return store;
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    return null;
  }
  return null;
}

export function loadSettings(store?: SettingsBox | null): Settings {
  const box = boxOr(store);
  if (!box) return defaultSettings();
  try {
    return parseSettings(box.getItem(SETTINGS_KEY));
  } catch {
    return defaultSettings();
  }
}

export function writeSettings(next: Settings, store?: SettingsBox | null): Settings {
  const saved: Settings = { steerSens: clampSteerSens(next.steerSens) };
  const box = boxOr(store);
  try {
    box?.setItem(SETTINGS_KEY, JSON.stringify(saved));
  } catch {
    /* private mode */
  }
  return saved;
}
