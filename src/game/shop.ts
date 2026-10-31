/** Meta shop. Prices are locked for the week bite. Does not touch CAR_STATS. */

export const SHOP_CATALOG = [
  { id: "armor", label: "Armor plate", price: 40 },
  { id: "gun", label: "Gun upgrade", price: 60 },
  { id: "minepack", label: "Mine pack", price: 35 },
  { id: "rockets", label: "Rocket pack", price: 45 },
  { id: "nitro", label: "Nitro cell", price: 50 },
  { id: "shield", label: "Shield cell", price: 55 },
  { id: "magnet", label: "Magnet cell", price: 30 },
  { id: "oil", label: "Oil slick kit", price: 40 },
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
  };
}

export function creditsForScore(score: number) {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.floor(score / 10);
}

/** Second call with `already` set gains nothing, so a finished run cannot bank twice. */
export function bankRun(credits: number, score: number, already: boolean) {
  if (already) return { credits, gained: 0 };
  const gained = creditsForScore(score);
  return { credits: Math.max(0, credits) + gained, gained };
}

export type BuyResult = { ok: boolean; credits: number; shop: ShopSave; toast: string };

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(min, Math.min(max, n));
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
  }
}

export function buyUpgrade(shop: ShopSave, credits: number, id: ShopId): BuyResult {
  const row = SHOP_CATALOG.find((item) => item.id === id);
  const next = { ...shop };
  if (!row || shopMaxed(shop, id)) return { ok: false, credits, shop: next, toast: "Maxed" };
  if (credits < row.price) return { ok: false, credits, shop: next, toast: "Not enough Credits" };
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
  }
  return { ok: true, credits: credits - row.price, shop: next, toast: row.label };
}
