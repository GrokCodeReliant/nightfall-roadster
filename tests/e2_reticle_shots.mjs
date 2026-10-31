// E2: headless phone-viewport reticle check. Landscape, because the feel rule
// is a landscape phone: the game does not lock orientation.
import { chromium, devices } from "playwright";
import fs from "node:fs";

const BASE = process.env.NF_URL || "http://127.0.0.1:5173/?debug=1";
const OUT = process.env.NF_SHOTS || "/workspace/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

const phones = [
  ["iphone", devices["iPhone 13"], "e2-reticle-iphone-dpr3.png"],
  ["pixel", devices["Pixel 7"], "e2-reticle-pixel-dpr3.png"],
];

let failed = 0;
for (const [name, base, file] of phones) {
  const d = { ...base, deviceScaleFactor: 3 };
  delete d.defaultBrowserType;
  // Shipped play does not lock orientation. WEEK E feel is landscape.
  const vp = d.viewport;
  d.viewport = { width: Math.max(vp.width, vp.height), height: Math.min(vp.width, vp.height) };
  const ctx = await browser.newContext(d);
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(() => {
    try { localStorage.setItem("nf-car", "roadster"); } catch { /* private */ }
  });
  await page.goto(BASE);
  await page.waitForSelector(".nf-btn");
  await page.waitForFunction(() => window.__nfCar && window.__nfCar().source === "glb" && window.__nfCar().car === "roadster");
  const start = await page.getByRole("button", { name: "Start" }).boundingBox();
  if (!start) throw new Error(`${name}: Start button missing`);
  await page.touchscreen.tap(start.x + start.width / 2, start.y + start.height / 2);
  await page.waitForSelector(".nf-hud");
  await page.waitForFunction(() => window.__nfRollout && window.__nfRollout().active);
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction(() => !window.__nfRollout().active);
  await page.evaluate(() => {
    window.__nf.lull = 1e9;
    window.__nfAdvance(1.2, ["KeyW"]);
    window.__nf.hitstop = 30;
  });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const cross = document.querySelector(".nf-cross");
    const r = cross.getBoundingClientRect();
    const cs = getComputedStyle(cross);
    const hud = document.querySelector(".nf-bottom")?.getBoundingClientRect();
    const hero = window.__nfHeroOnScreen();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const heroCss = hero && hero.lo ? {
      x: ((hero.lo.x + 1) * 0.5) * w,
      y: ((1 - hero.lo.y) * 0.5) * h,
      top: hero.hi ? ((1 - hero.hi.y) * 0.5) * h : null,
    } : null;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return {
      phase: window.__nf.phase,
      vis: cs.visibility,
      z: cs.zIndex,
      opacity: cs.opacity,
      rect: { l: r.left, t: r.top, w: r.width, h: r.height, cx, cy },
      vw: w,
      vh: h,
      hero,
      heroCss,
      ahead: heroCss ? cy < heroCss.y - 4 : null,
      overHood: heroCss && heroCss.top != null ? cy <= heroCss.y && cy >= heroCss.top - 48 : null,
      hudTop: hud ? hud.top : null,
      clearOfHud: hud ? r.bottom < hud.top || r.top > hud.bottom : true,
      car: window.__nfCar(),
      dpr: window.devicePixelRatio,
    };
  });
  const path = `${OUT}/${file}`;
  await page.screenshot({ path });
  const ok = info.vis === "visible" && info.ahead === true && info.clearOfHud === true && info.rect.w > 8 && errors.length === 0;
  if (!ok) failed += 1;
  console.log(name, ok ? "PASS" : "FAIL", JSON.stringify({ ...info, errors, path, viewport: d.viewport }));
  await ctx.close();
}
await browser.close();
if (failed) process.exit(1);
