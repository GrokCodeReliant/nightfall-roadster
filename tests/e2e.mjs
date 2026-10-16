// Headless e2e for the packaged single-file build (desktop + phone 390x844).
// boots, drives, fires, an enemy dies, a wave advances, a life is lost, game over, restart; 0 console errors.
// Also proves the HUD layout matches v0.1 (same nf-* boxes) and saves screenshots.
import { chromium, devices } from "playwright";
import fs from "node:fs";

const ROOT = "/workspace/studio/nightfall_roadster";
const BUILD = process.env.NF_BUILD || `${ROOT}/v02_m2/nightfall-roadster-v02-m2.html`;
const V01 = `${ROOT}/release/nightfall-roadster-single.html`;
const SHOTS = process.env.NF_SHOTS || `${ROOT}/v02_m2/screenshots`;
fs.mkdirSync(SHOTS, { recursive: true });

const profiles = [
  { name: "desktop", ctx: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } },
  { name: "phone", ctx: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } },
];
const HUD = [".nf-top", ".nf-readout", ".nf-map-wrap", ".nf-center", ".nf-bottom", ".nf-icon-btn.left", ".nf-icon-btn.right", ".nf-stick", ".nf-actions"];

const results = [];
let failed = 0;
function check(profile, name, ok, detail = "") {
  results.push({ profile, name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} [${profile}] ${name}${detail ? " — " + detail : ""}`);
}

async function hudBoxes(page) {
  await page.evaluate(() => { window.__nf.toastT = 0; });
  await page.waitForTimeout(800);
  return page.evaluate((sels) => sels.map((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [s, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  }), HUD);
}

async function waitFor(page, fn, arg, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function start(page, url) {
  await page.goto(url);
  await page.waitForSelector(".nf-btn", { timeout: 15000 });
  await page.click(".nf-btn");
  await page.waitForSelector(".nf-hud", { timeout: 5000 });
}

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const prof of profiles) {
  const P = prof.name;
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  // v0.1 reference HUD boxes
  const ref = await ctx.newPage();
  await start(ref, "file://" + V01 + "?debug");
  await ref.waitForTimeout(400);
  const refBoxes = await hudBoxes(ref);
  await ref.close();

  await start(page, "file://" + BUILD + "?debug");
  check(P, "boots into play", await page.evaluate(() => window.__nf.phase === "playing"));
  const boxes = await hudBoxes(page);
  // same boxes within 3 px (labels changed text: "Lap" -> "Wave", "1st" -> "Kills 0"); toasts cleared on both
  const same = boxes.length === refBoxes.length && boxes.every((b, i) => b && refBoxes[i] && b[0] === refBoxes[i][0] && b.slice(1).every((v, k) => Math.abs(v - refBoxes[i][k + 1]) <= 3));
  check(P, "HUD layout identical to v0.1", same, same ? `${boxes.filter(Boolean).length} boxes` : JSON.stringify({ boxes, refBoxes }));
  const labels = await page.evaluate(() => [document.querySelector(".nf-readout .nf-kicker")?.textContent, document.querySelector(".nf-readout .nf-sub")?.textContent]);
  check(P, "HUD shows Wave / Kills", labels[0] === "Wave" && /^Kills \d+$/.test(labels[1] || ""), labels.join(" | "));

  // drive (real input path: keyboard on desktop, joystick + Cruise on phone)
  const s0 = await page.evaluate(() => window.__nf.cars[0].along);
  if (P === "desktop") {
    await page.keyboard.down("KeyW");
    await waitFor(page, () => window.__nf.cars[0].speed > 12 && window.__nf.cars[0].along > 160, null, 40000);
    await page.keyboard.up("KeyW");
  } else {
    const cruiseOn = await page.evaluate(() => window.__nf.autoGas);
    check(P, "phone starts with Cruise on", cruiseOn);
    const stick = await page.locator(".nf-stick").boundingBox();
    await page.touchscreen.tap(stick.x + stick.width / 2, stick.y + 4);
    await waitFor(page, () => window.__nf.cars[0].speed > 12 && window.__nf.cars[0].along > 160, null, 40000);
  }
  const drove = await page.evaluate((s0) => ({ d: window.__nf.cars[0].along - s0, v: window.__nf.cars[0].speed }), s0);
  check(P, "drives", drove.d > 10 && drove.v > 10, `moved ${drove.d.toFixed(1)} m at ${drove.v.toFixed(1)} m/s`);

  // fire (real input path)
  const r0 = await page.evaluate(() => window.__nf.cars[0].rounds);
  if (P === "desktop") {
    await page.keyboard.down("KeyF");
    await waitFor(page, (r0) => window.__nf.cars[0].rounds < r0 - 3, r0, 20000);
    await page.keyboard.up("KeyF");
  } else {
    const fire = page.locator(".nf-actions button", { hasText: "Fire" });
    const b = await fire.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await fire.dispatchEvent("pointerdown", { pointerType: "touch" });
    await waitFor(page, (r0) => window.__nf.cars[0].rounds < r0 - 3, r0, 20000);
    await fire.dispatchEvent("pointerup", { pointerType: "touch" });
  }
  const r1 = await page.evaluate(() => window.__nf.cars[0].rounds);
  check(P, "fires", r1 < r0 - 2, `rounds ${r0.toFixed(1)} -> ${r1.toFixed(1)}`);

  // combat screenshot: wave running, an enemy tracer in the air, HUD visible
  await page.evaluate(() => window.__nfAdvance(5, "hunt"));
  let firing = false;
  for (let i = 0; i < 1200 && !firing; i++) {
    firing = await page.evaluate(() => {
      window.__nfAdvance(0.05, "hunt");
      const sim = window.__nf;
      const hero = sim.cars[0];
      // an enemy tracer in the air, fired by an enemy that is in front of the camera
      return sim.shots.some((s) => s.alive && s.owner !== 0 && s.life < 0.8 && (() => { const c = sim.cars[s.owner]; const d = c.along - hero.along; return c.alive && d > 6 && d < 40; })());
    });
  }
  check(P, "enemies fire at the player", firing);
  // freeze the sim (hitstop, no pause overlay) so the chase camera settles, then capture
  await page.evaluate(() => { window.__nf.keysOverride = new Set(["KeyW"]); window.__nf.hitstop = 30; });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${SHOTS}/${P}-combat.png` });
  await page.evaluate(() => { window.__nf.hitstop = 0; });

  // an enemy dies
  const k0 = await page.evaluate(() => window.__nf.takedowns);
  await page.evaluate(() => { for (let i = 0; i < 120 && window.__nf.takedowns === 0; i++) window.__nfAdvance(0.5, "hunt"); });
  const k1 = await page.evaluate(() => window.__nf.takedowns);
  check(P, "an enemy dies", k1 >= 1, `kills ${k0} -> ${k1}`);

  // a wave advances
  await page.evaluate(() => { for (let i = 0; i < 400 && window.__nf.wave < 2 && window.__nf.phase === "playing"; i++) window.__nfAdvance(0.5, "hunt"); });
  const wave = await page.evaluate(() => ({ w: window.__nf.wave, phase: window.__nf.phase }));
  check(P, "a wave advances", wave.w >= 2, `wave ${wave.w} (${wave.phase})`);
  await page.evaluate(() => { window.__nf.keysOverride = new Set(["KeyW", "KeyF"]); window.__nf.hitstop = 30; });
  await page.waitForTimeout(3500);
  const hudText = await page.evaluate(() => [document.querySelector(".nf-readout .nf-stat")?.textContent, document.querySelector(".nf-readout .nf-sub")?.textContent]);
  check(P, "HUD tracks wave/kills", Number(hudText[0]) >= 2 && /Kills [1-9]/.test(hudText[1] || ""), hudText.join(" | "));
  await page.screenshot({ path: `${SHOTS}/${P}-wave${wave.w}.png` });
  await page.evaluate(() => { window.__nf.hitstop = 0; });

  // lose a life
  const l0 = await page.evaluate(() => window.__nf.lives);
  await page.evaluate((l0) => { for (let i = 0; i < 240 && window.__nf.lives === l0 && window.__nf.phase === "playing"; i++) window.__nfAdvance(0.5, "idle"); }, l0);
  const l1 = await page.evaluate(() => window.__nf.lives);
  check(P, "loses a life", l1 === l0 - 1, `lives ${l0} -> ${l1}`);

  // game over
  await page.evaluate(() => { for (let i = 0; i < 1200 && window.__nf.phase === "playing"; i++) window.__nfAdvance(0.5, "idle"); });
  await page.waitForSelector("text=Run it again", { timeout: 5000 }).catch(() => {});
  const over = await page.evaluate(() => ({ phase: window.__nf.phase, lives: window.__nf.lives, card: !!document.querySelector(".nf-card .nf-title-sm")?.textContent?.includes("Wrecked") }));
  check(P, "game over card", over.phase === "finished" && over.lives === 0 && over.card, JSON.stringify(over));
  await page.screenshot({ path: `${SHOTS}/${P}-gameover.png` });

  // restart
  await page.click("text=Run it again");
  await page.waitForTimeout(500);
  const re = await page.evaluate(() => ({ phase: window.__nf.phase, lives: window.__nf.lives, wave: window.__nf.wave, alive: window.__nf.cars.slice(1).filter((c) => c.alive).length, kills: window.__nf.takedowns }));
  check(P, "restart resets the run", re.phase === "playing" && re.lives === 3 && re.wave <= 1 && re.kills === 0, JSON.stringify(re));

  check(P, "0 console errors", errors.length === 0, errors.slice(0, 5).join(" || "));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${SHOTS}/e2e-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
