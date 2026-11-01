/** Meta shop. Prices are locked for the week bite. Does not touch CAR_STATS. */

/** Hero mine fuse by `shop.mineArm`. Enemy mines stay 0.6. */
export const MINE_ARM = { 0: 0.38, 1: 0.20, 2: 0.10 } as const;
export type MineArmTier = keyof typeof MINE_ARM;

/** Quick-arm mines: first buy, then the second. */
export const MINE_FUSE_PRICE = [45, 65] as const;

/** Highway RaceTrial purse. Score does not convert to Credits on that finish. */
export const RACE_PURSE_HELD = 100;
export const RACE_PURSE_DNF = 25;
export type RacePurse = "held" | "dnf";

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
  };
}

export function creditsForScore(score: number) {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.floor(score / 10);
}

export function highwayPurse(reason: string | undefined): RacePurse | null {
  if (reason === "Pack held") return "held";
  if (reason === "Fell behind the pack") return "dnf";
  return null;
}

/**
 * Non-highway finishes bank floor(score/10).
 * A highway RaceTrial finish banks only the flat purse (Pack held 100, DNF 25).
 * `already` gains nothing, so a finished run cannot bank twice.
 */
export function bankRun(
  credits: number,
  score: number,
  already: boolean,
  race?: { highway: boolean; purse: RacePurse | null } | null,
) {
  if (already) return { credits, gained: 0 };
  const base = Math.max(0, credits);
  if (race?.highway) {
    const gained = race.purse === "held" ? RACE_PURSE_HELD : race.purse === "dnf" ? RACE_PURSE_DNF : 0;
    return { credits: base + gained, gained };
  }
  const gained = creditsForScore(score);
  return { credits: base + gained, gained };
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

export function shopPrice(shop: ShopSave, id: ShopId) {
  if (id === "minefuse") return shop.mineArm >= 1 ? MINE_FUSE_PRICE[1] : MINE_FUSE_PRICE[0];
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
    case "xguns":
    case "ctgun":
    case "thrust":
      return { ok: false, credits, shop: next, toast: "Coming" };
  }
  return { ok: true, credits: credits - price, shop: next, toast: row.label };
}
