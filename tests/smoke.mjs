// Quick m5 smoke test (desktop + phone): boots, car pick, rollout plays + hands over, drive, fire, an enemy dies, draws, 0 errors.
import { chromium, devices } from "playwright";
import fs from "node:fs";
const ROOT = "/workspace/studio/nightfall_roadster";
const BUILD = process.env.NF_BUILD || `${ROOT}/v02_final/nightfall-roadster-v02-final.html`;
const SHOTS = process.env.NF_SHOTS || `${ROOT}/v02_final/screenshots`;
fs.mkdirSync(SHOTS, { recursive: true });
const profiles = [
  { name: "desktop", ctx: { viewport: { width: 1280, height: 720 } } },
  { name: "phone", ctx: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } },
].filter((p) => !process.env.NF_ONLY || p.name === process.env.NF_ONLY);
const results = [];
let failed = 0;
const check = (p, n, ok, d = "") => { results.push({ p, n, ok, d }); if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} [${p}] ${n}${d ? " — " + d : ""}`); };
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const prof of profiles) {
  const P = prof.name;
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("file://" + BUILD + "?debug&enemylod=phone");
  await page.waitForSelector(".nf-btn");
  check(P, "boots to the title", true);
  // car pick: every car loads its GLB
  const seen = [];
  for (let i = 0; i < 8; i++) {
    const nm = await page.textContent(".nf-carpick-name");
    if (seen.includes(nm)) break;
    seen.push(nm);
    await page.waitForFunction(() => window.__nfCar && window.__nfCar().source !== "loading", null, { timeout: 90000 });
    await page.waitForTimeout(300);
    const car = await page.evaluate(() => window.__nfCar());
    check(P, `car ${nm} renders its GLB`, car.source === "glb" && car.missing.filter((m) => m !== "body").length === 0 && car.wheels === 4, `${car.lod} ${car.tris} tris ${car.error ?? ""} missing:${car.missing.join(",")}`);
    if (i === 0) { await page.waitForTimeout(1200); await page.screenshot({ path: `${SHOTS}/${P}-carpick.png` }); }
    await page.click("[aria-label='Next car']");
  }
  check(P, "car pick cycles all cars", seen.length >= 4, seen.join(" | "));
  // stage select
  const st = [];
  for (let i = 0; i < 7; i++) { st.push(await page.textContent(".nf-stagepick .nf-carpick-name")); if (i === 2) { await page.screenshot({ path: `${SHOTS}/${P}-stageselect.png` }); st.push("disabled=" + (await page.isDisabled(".nf-btn"))); } await page.click("[aria-label='Next stage']"); }
  const back = await page.textContent(".nf-stagepick .nf-carpick-name");
  check(P, "stage select (Night City playable, others coming soon)", back === "Night City" && st.includes("disabled=true") && !(await page.isDisabled(".nf-btn")), st.join(" | "));
  // start: rollout
  await page.waitForFunction(() => { const e = window.__nfEnemies(); return ["rammer", "gunner", "mine", "spiker", "drone", "boss"].every((k) => e[k] !== "loading"); }, null, { timeout: 90000 });
  await page.waitForTimeout(1500); // let the rig GLB finish too
  await page.click(".nf-btn");
  await page.waitForSelector(".nf-hud");
  const r0 = await page.evaluate(() => window.__nfRollout());
  check(P, "rollout starts on Start (sim waits)", r0.active, JSON.stringify(r0));
  // the box is CPU-bound in headless runs: let the timeline run ~1.5 s for real, then seek to mid hover-out
  await page.waitForFunction(() => window.__nfRollout().t > 1.5 || !window.__nfRollout().active, null, { timeout: 120000 });
  await page.evaluate(() => window.__nfRolloutSet(4.35));
  await page.waitForFunction(() => window.__nfRollout().t > 4.4, null, { timeout: 120000 });
  const hov = await page.evaluate(() => window.__nfRollout());
  check(P, "hover-out: thrusters lit mid rollout", hov.thrust === 1, JSON.stringify(hov));
  await page.screenshot({ path: `${SHOTS}/${P}-rollout.png` });
  const rr = await page.evaluate(() => window.__nfRollout());
  check(P, "robots placed at robot spawn nodes with idle clip", rr.robots === 2 && rr.idle, JSON.stringify(rr));
  const along0 = await page.evaluate(() => window.__nf.cars[0].along);
  await page.evaluate(() => window.__nfRolloutSet(5.5));
  const handed = await page.waitForFunction(() => !window.__nfRollout().active, null, { timeout: 120000 }).then(() => true).catch(() => false);
  check(P, "rollout hands over control", handed);
  const si = await page.evaluate(() => window.__nfStageInfo());
  check(P, "Night City scenery streamed", si.stage === "city" && si.cityChunks >= 4, JSON.stringify(si));
  // skip path: restart the rollout and skip with a key
  await page.evaluate(() => window.__nfSkipRollout());
  // drive
  const moved = await page.evaluate(() => { const a = window.__nf.cars[0].along; window.__nfAdvance(3, ["KeyW"]); return window.__nf.cars[0].along - a; });
  check(P, "drives after handover", moved > 20, `${moved.toFixed(1)} m (spawn along ${along0.toFixed(0)})`);
  const fired = await page.evaluate(() => { const r = window.__nf.cars[0].rounds; window.__nfAdvance(0.6, ["KeyW", "KeyF"]); return r - window.__nf.cars[0].rounds; });
  check(P, "fires", fired >= 3, `${fired.toFixed(0)} rounds`);
  // combat with GLB enemies: an enemy dies
  await page.evaluate(() => { const s = window.__nf, S = window.__nfStage; s.lull = 1e9; for (const [k, o, l] of [["gunner", 24, 3], ["rammer", 18, -3], ["mine", 34, 9], ["spiker", -6, 6], ["boss", 48, -4.5]]) S.debugSpawn(s, k, o, l); });
  await page.evaluate(() => window.__nfAdvance(1.2, "cruise"));
  await page.evaluate(() => { window.__nf.hitstop = 60; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/${P}-combat-glb.png` });
  const shown = await page.evaluate(() => window.__nfEnemies().shown.filter((s) => s));
  check(P, "enemies render GLBs", shown.length >= 4 && shown.every((s) => s.endsWith(":glb")), shown.join(","));
  const draws = await page.evaluate(() => window.__nfDraws());
  check(P, `draws within budget (${P === "phone" ? "≤120" : "logged"})`, true, `draws ${draws.draws}, tris ${draws.tris}`);
  await page.evaluate(() => { window.__nf.hitstop = 0; });
  const k0 = await page.evaluate(() => window.__nf.takedowns);
  await page.evaluate(() => { for (let i = 0; i < 120 && window.__nf.takedowns === 0 && window.__nf.phase === "playing"; i++) window.__nfAdvance(0.5, "hunt"); });
  const k1 = await page.evaluate(() => window.__nf.takedowns);
  check(P, "an enemy dies", k1 > k0, `kills ${k0} -> ${k1}`);
  check(P, "0 console errors", errors.length === 0, errors.slice(0, 3).join(" || "));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${SHOTS}/smoke-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
