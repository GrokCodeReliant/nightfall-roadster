/** Meta shop. Prices are locked for the week bite. Does not touch CAR_STATS. */
import { SPARE_MAX, SPARE_PRICE } from "./respawn";

/** Hero mine fuse by `shop.mineArm`. Enemy mines stay 0.6. */
export const MINE_ARM = { 0: 0.38, 1: 0.20, 2: 0.10 } as const;
export type MineArmTier = keyof typeof MINE_ARM;

/** Quick-arm mines: first buy, then the second. */
export const MINE_FUSE_PRICE = [45, 65] as const;

/**
 * Highway RaceTrial purse. Score does not convert to Credits on that finish.
 * Placed finishes also add RACE_LIFE_BONUS per life remaining, capped at RACE_LIFE_BONUS_MAX.
 * DNF pays the flat row and ignores lives.
 */
export const RACE_PLACE_PURSE = { 1: 180, 2: 120, 3: 70, 4: 40 } as const;
export const RACE_PURSE_DNF = 25;
export const RACE_LIFE_BONUS = 20;
export const RACE_LIFE_BONUS_MAX = 60;
export type RacePurse = 1 | 2 | 3 | 4 | "dnf";

export const SHOP_CATALOG = [
  { id: "armor", label: "Armor plate", price: 40 },
  { id: "gun", label: "Gun upgrade", price: 60 },
  { id: "minepack", label: "Mine pack", price: 35, note: "Mine pack + cluster" },
  { id: "rockets", label: "Rocket pack", price: 45 },
  { id: "nitro", label: "Nitro cell", price: 50 },
  { id: "shield", label: "Shield cell", price: 55 },
  { id: "magnet", label: "Magnet cell", price: 30 },
  { id: "oil", label: "Oil slick kit", price: 40 },
  { id: "minefuse", label: "Quick-arm mines", price: 45 },
  // RACE_RESPAWNS §5: +1 starting life per tier (80 then 140), every run. Lives bonus stays +20/life, cap 60.
  { id: "spare", label: "Spare chassis", price: 80, note: "+1 starting life" },
  { id: "xguns", label: "Model X side guns", price: 0, coming: true },
  { id: "ctgun", label: "Cybertruck roof gun", price: 0, coming: true },
  { id: "thrust", label: "Roadster thrusters+", price: 0, coming: true },
] as const;

export type ShopId = (typeof SHOP_CATALOG)[number]["id"];

export type ShopSave = {
  armor: number;
  gun: number;
  rockets: number;
  reserve: number;
  maxFuel: number;
  shieldCharges: number;
  magnetCharges: number;
  oilCharges: number;
  /** 0 stock 0.38s, 1 is 0.20s, 2 is 0.10s. */
  mineArm: MineArmTier;
  /** Spare chassis tiers bought (RACE_RESPAWNS §5): extra starting lives, 0..2. */
  spareLives: number;
};

export function emptyShop(): ShopSave {
  return {
    armor: 0,
    gun: 0,
    rockets: 0,
    reserve: 0,
    maxFuel: 100,
    shieldCharges: 0,
    magnetCharges: 0,
    oilCharges: 0,
    mineArm: 0,
    spareLives: 0,
  };
}

export function creditsForScore(score: number) {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.floor(score / 10);
}

export function highwayPurse(result: { reason?: string; place?: number } | null | undefined): RacePurse | null {
  if (!result) return null;
  const place = result.place;
  if (place === 1 || place === 2 || place === 3 || place === 4) return place;
  if (place === 0 || result.reason === "DNF" || result.reason === "Fell behind the field") return "dnf";
  return null;
}

/** Place table plus the lives bonus. DNF is 25 and never adds lives. */
export function racePayout(purse: RacePurse, lives: number) {
  if (purse === "dnf") return { purse: RACE_PURSE_DNF, livesBonus: 0, total: RACE_PURSE_DNF };
  const base = RACE_PLACE_PURSE[purse];
  const n = Number.isFinite(lives) ? Math.max(0, Math.floor(lives)) : 0;
  const livesBonus = Math.min(RACE_LIFE_BONUS_MAX, n * RACE_LIFE_BONUS);
  return { purse: base, livesBonus, total: base + livesBonus };
}

/**
 * Non-highway finishes bank floor(score/10).
 * A highway RaceTrial finish banks only the place table (1st 180 … 4th 40, DNF 25)
 * plus 20 Credits per life remaining on a placed finish.
 * `already` gains nothing, so a finished run cannot bank twice.
 */
export function bankRun(
  credits: number,
  score: number,
  already: boolean,
  race?: { highway: boolean; purse: RacePurse | null; lives?: number } | null,
) {
  if (already) return { credits, gained: 0 };
  const base = Math.max(0, credits);
  if (race?.highway) {
    if (race.purse == null) return { credits: base, gained: 0 };
    const gained = racePayout(race.purse, race.lives ?? 0).total;
    return { credits: base + gained, gained };
  }
  const gained = creditsForScore(score);
  return { credits: base + gained, gained };
}

/** What a results card shows as the race purse: place purse plus the lives bonus. null when no purse is shown. */
export function shownPurse(result: { purse?: number; livesBonus?: number } | null | undefined): number | null {
  if (!result || result.purse == null) return null;
  return result.purse + (result.livesBonus ?? 0);
}

/**
 * Bank a finished run. Every RaceTrial (Open Highway and authored courses like Night City, result.mode "race")
 * banks the purse its results card shows, through the same highway path: place table + lives bonus,
 * DNF 25 with no lives bonus. Wave runs bank floor(score/10) as before.
 */
export function bankFinish(
  credits: number,
  result: { score: number; mode?: "race" | "waves"; reason?: string; place?: number },
  lives: number,
  already = false,
) {
  const race = result.mode === "race";
  return bankRun(credits, result.score, already, race ? { highway: true, purse: highwayPurse(result), lives } : null);
}

export type BuyResult = { ok: boolean; credits: number; shop: ShopSave; toast: string };

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(min, Math.min(max, n));
}

export function mineArmTier(v: unknown): MineArmTier {
  const n = clampInt(v, 0, 2, 0);
  return n === 2 ? 2 : n === 1 ? 1 : 0;
}

export function heroMineArm(tier: unknown): number {
  return MINE_ARM[mineArmTier(tier)];
}

export function shopComing(id: ShopId) {
  const row = SHOP_CATALOG.find((item) => item.id === id);
  return !!row && "coming" in row && row.coming;
}

/** Spare chassis tier as a safe 0..2 integer (old saves have none: 0). */
export function spareLivesTier(v: unknown): number {
  return clampInt(v, 0, SPARE_MAX, 0);
}

export function shopPrice(shop: ShopSave, id: ShopId) {
  if (id === "minefuse") return shop.mineArm >= 1 ? MINE_FUSE_PRICE[1] : MINE_FUSE_PRICE[0];
  if (id === "spare") return SPARE_PRICE[Math.min(SPARE_PRICE.length - 1, spareLivesTier(shop.spareLives))];
  return SHOP_CATALOG.find((item) => item.id === id)?.price ?? 0;
}

export function sanitizeShop(raw: unknown): ShopSave {
  const s = emptyShop();
  if (!raw || typeof raw !== "object") return s;
  const p = raw as Partial<ShopSave>;
  s.armor = clampInt(p.armor, 0, 100, 0);
  s.gun = clampInt(p.gun, 0, 3, 0);
  s.rockets = clampInt(p.rockets, 0, 12, 0);
  s.reserve = clampInt(p.reserve, 0, 4, 0);
  s.maxFuel = clampInt(p.maxFuel, 100, 160, 100);
  s.shieldCharges = clampInt(p.shieldCharges, 0, 3, 0);
  s.magnetCharges = clampInt(p.magnetCharges, 0, 3, 0);
  s.oilCharges = clampInt(p.oilCharges, 0, 3, 0);
  s.mineArm = mineArmTier(p.mineArm);
  s.spareLives = spareLivesTier(p.spareLives);
  return s;
}

export function shopOwned(shop: ShopSave, id: ShopId) {
  switch (id) {
    case "armor":
      return `+${shop.armor} / 100`;
    case "gun":
      return `${shop.gun} / 3`;
    case "minepack":
      return `${shop.reserve} / 4`;
    case "rockets":
      return `${shop.rockets} / 12`;
    case "nitro":
      return `${shop.maxFuel} / 160`;
    case "shield":
      return `${shop.shieldCharges} / 3`;
    case "magnet":
      return `${shop.magnetCharges} / 3`;
    case "oil":
      return `${shop.oilCharges} / 3`;
    case "minefuse":
      return `${shop.mineArm} / 2`;
    case "spare":
      return `${spareLivesTier(shop.spareLives)} / ${SPARE_MAX}`;
    case "xguns":
    case "ctgun":
    case "thrust":
      return "Coming";
  }
}

export function shopMaxed(shop: ShopSave, id: ShopId) {
  switch (id) {
    case "armor":
      return shop.armor >= 100;
    case "gun":
      return shop.gun >= 3;
    case "minepack":
      return shop.reserve >= 4;
    case "rockets":
      return shop.rockets >= 12;
    case "nitro":
      return shop.maxFuel >= 160;
    case "shield":
      return shop.shieldCharges >= 3;
    case "magnet":
      return shop.magnetCharges >= 3;
    case "oil":
      return shop.oilCharges >= 3;
    case "minefuse":
      return shop.mineArm >= 2;
    case "spare":
      return spareLivesTier(shop.spareLives) >= SPARE_MAX;
    case "xguns":
    case "ctgun":
    case "thrust":
      return true;
  }
}

export function buyUpgrade(shop: ShopSave, credits: number, id: ShopId): BuyResult {
  const row = SHOP_CATALOG.find((item) => item.id === id);
  const next = { ...shop };
  if (!row) return { ok: false, credits, shop: next, toast: "" };
  if (shopComing(id)) return { ok: false, credits, shop: next, toast: "Coming" };
  if (shopMaxed(shop, id)) return { ok: false, credits, shop: next, toast: "Maxed" };
  const price = shopPrice(shop, id);
  if (credits < price) return { ok: false, credits, shop: next, toast: "Not enough Credits" };
  switch (id) {
    case "armor":
      next.armor = Math.min(100, next.armor + 25);
      break;
    case "gun":
      next.gun = Math.min(3, next.gun + 1);
      break;
    case "minepack":
      next.reserve = Math.min(4, next.reserve + 1);
      break;
    case "rockets":
      next.rockets = Math.min(12, next.rockets + 4);
      break;
    case "nitro":
      next.maxFuel = Math.min(160, next.maxFuel + 20);
      break;
    case "shield":
      next.shieldCharges = Math.min(3, next.shieldCharges + 1);
      break;
    case "magnet":
      next.magnetCharges = Math.min(3, next.magnetCharges + 1);
      break;
    case "oil":
      next.oilCharges = Math.min(3, next.oilCharges + 1);
      break;
    case "minefuse":
      next.mineArm = mineArmTier(next.mineArm + 1);
      break;
    case "spare":
      next.spareLives = spareLivesTier(spareLivesTier(next.spareLives) + 1);
      break;
    case "xguns":
    case "ctgun":
    case "thrust":
      return { ok: false, credits, shop: next, toast: "Coming" };
  }
  return { ok: true, credits: credits - price, shop: next, toast: row.label };
}
