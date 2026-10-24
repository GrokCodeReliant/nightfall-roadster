// M1 phone screenshots: HUD + Boost (Roadster), Brake (Model 3), ramp across a former void, Roadster hop in the chase cam.
import { chromium } from "playwright";
import fs from "node:fs";
const ROOT = "/workspace/studio/nightfall_roadster";
const BUILD = process.env.NF_BUILD || `${ROOT}/v02_m1/nightfall-roadster-v02-m1.html`;
const SHOTS = `${ROOT}/shots/m1`;
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
let failed = 0;
const log = (ok, n, d = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); };
async function run(vp, car) {
  const tag = `${vp.width}x${vp.height}`;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript((c) => { try { localStorage.setItem("nf-car", c); } catch {} }, car);
  await page.goto("file://" + BUILD + "?debug&enemylod=phone");
  await page.waitForSelector(".nf-btn");
  await page.waitForFunction((id) => window.__nfCar && window.__nfCar().car === id && window.__nfCar().source !== "loading", car, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.click(".nf-btn");
  await page.waitForSelector(".nf-hud");
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction(() => !window.__nfRollout().active);
  const shot = async (name) => { await page.evaluate(() => { window.__nf.hitstop = 60; }); await page.waitForTimeout(2500); const f = `${SHOTS}/${tag}-${name}.png`; await page.screenshot({ path: f }); await page.evaluate(() => { window.__nf.hitstop = 0; }); console.log("shot", f); };
  await page.evaluate(() => { window.__nf.lull = 1e9; window.__nfAdvance(2, ["KeyW"]); });
  const btn = await page.evaluate(() => [...document.querySelectorAll(".nf-actions button")].map((b) => b.textContent.trim()));
  if (car === "roadster2026") {
    log(btn.includes("Boost") && !btn.includes("Brake"), `${tag} Roadster has Boost button`, btn.join(","));
    await shot("hud-boost-roadster");
    // hop: hold boost on the flat until the 7.5 m cap, then freeze and let the chase cam settle
    const hop = await page.evaluate(() => { let top = 0; for (let i = 0; i < 6; i++) { window.__nfAdvance(0.25, ["KeyW", "Space"]); top = Math.max(top, window.__nf.cars[0].y - window.__nf.boostDeck); } return top; });
    log(hop > 6 && hop <= 7.55, `${tag} hop height`, hop.toFixed(2) + " m");
    await shot("roadster-hop-chasecam");
    const inFrame = await page.evaluate(() => window.__nfHeroOnScreen ? window.__nfHeroOnScreen() : null);
    if (inFrame) log(inFrame.inside, `${tag} hero inside the frame at hop peak`, JSON.stringify(inFrame));
  } else {
    log(btn.includes("Brake") && !btn.includes("Boost"), `${tag} Model 3 has Brake button, no Boost`, btn.join(","));
    log(!(await page.$(".nf-meter.is-boost")), `${tag} no boost meter for Model 3`);
    await shot("hud-brake-model3");
    // drive to the deck over a former void (non-boost car, no thrust)
    const r = await page.evaluate(() => {
      for (let k = 0; k < 400; k++) {
        const s = window.__nf, h = s.cars[0];
        const p = s.track.pieces.find((q) => q.kind === "void" && q.s + 150 > h.along);
        if (p && h.along >= p.s + 104) return { ok: true, d: h.along - p.s, y: h.y, grounded: h.grounded, falls: s.falls ?? null };
        window.__nfAdvance(0.25, "cruise"); // bot steering; Space is ignored for a Model 3
      }
      return { ok: false, along: window.__nf.cars[0].along };
    });
    log(r.ok && r.grounded && r.y > 7, `${tag} Model 3 drives across the former void deck`, JSON.stringify(r));
    await shot("ramp-former-gap-model3");
  }
  log(errors.length === 0, `${tag} ${car} 0 console errors`, errors.join(" | "));
  await ctx.close();
}
for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) for (const car of (process.env.NF_CARS || "roadster2026,volt").split(",")) await run(vp, car);
await browser.close();
console.log(failed ? `M1 SHOTS: ${failed} FAILED` : "M1 SHOTS: ALL PASS");
process.exit(failed ? 1 : 0);
