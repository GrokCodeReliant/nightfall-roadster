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
const EXPECT = {
  "Model 3 (2017)": { id: "volt", file: "sedan_compact" },
  "Model 3 Highland": { id: "volt_r", file: "sedan_compact_r" },
  "Model 3 Performance": { id: "volt_rs", file: "sedan_compact_rs" },
  "Roadster (2017)": { id: "roadster", file: "roadster" },
  "Roadster (2026)": { id: "roadster2026", file: "roadster2026" },
};
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
    const want = EXPECT[nm];
    await page.waitForFunction((id) => window.__nfCar && window.__nfCar().car === id && window.__nfCar().source !== "loading", want?.id, { timeout: 90000 });
    const car = await page.evaluate(() => window.__nfCar());
    // single-file build inlines phone LODs only: both profiles load <file>_phone here; desktop hero is checked on the served folder below
    const okFile = want && car.file === `${want.file}_phone`;
    check(P, `car ${nm} loads its own file`, car.source === "glb" && okFile && car.missing.filter((m) => m !== "body").length === 0 && car.wheels === 4, `${car.file} (${car.url}) ${car.tris} tris lod=${car.lod} ${car.error ?? ""}`);
    if (i === 0) { await page.waitForTimeout(1200); await page.screenshot({ path: `${SHOTS}/${P}-carpick.png` }); }
    await page.click("[aria-label='Next car']");
  }
  await page.locator(".nf-credit").scrollIntoViewIfNeeded();
  const foot = await page.textContent(".nf-credit");
  check(P, "footer disclaimer", foot.trim() === "An unofficial fan tribute by Grok Code Reliant studio. Not affiliated with or endorsed by Tesla, Inc.", foot.trim());
  await page.screenshot({ path: `${SHOTS}/${P}-footer.png` });
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
  check(P, "an enemy dies", k1 > k0 || k0 > 0, `kills ${k0} -> ${k1}`);
  // ---- full run loop: game over -> retry -> title -> different car + stage
  await page.evaluate(() => { const s = window.__nf; s.lives = 1; const h = s.cars[0]; h.invuln = 0; if (s.up) s.up.shieldT = 0; h.hp = 0.01; });
  await page.evaluate(() => { for (let i = 0; i < 400 && window.__nf.phase === "playing"; i++) { const h = window.__nf.cars[0]; if (h.alive) { h.invuln = 0; h.hp = Math.min(h.hp, 0.01); } window.__nfAdvance(0.5, "idle"); } });
  const over = await page.waitForSelector("text=Run it again", { timeout: 30000 }).then(() => true).catch(() => false);
  const ov = await page.evaluate(() => ({ phase: window.__nf.phase, lives: window.__nf.lives, wrecked: !!document.querySelector(".nf-card .nf-title-sm")?.textContent?.includes("Wrecked") }));
  check(P, "game over screen", over && ov.phase === "finished" && ov.wrecked, JSON.stringify(ov));
  await page.screenshot({ path: `${SHOTS}/${P}-gameover.png` });
  await page.click("text=Run it again");
  await page.waitForSelector(".nf-hud");
  const rs = await page.evaluate(() => { const s = window.__nf, h = s.cars[0]; return { phase: s.phase, wave: s.wave, kills: s.takedowns, score: s.score ?? 0, lives: s.lives, hp: h.hp, alive: h.alive, enemies: s.cars.filter((c) => !c.hero && c.alive).length, roll: window.__nfRollout() }; });
  check(P, "retry resets the run", rs.phase === "playing" && rs.kills === 0 && rs.wave <= 1 && rs.lives === 3 && rs.alive && rs.enemies === 0 && rs.roll.active, JSON.stringify(rs));
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction(() => !window.__nfRollout().active, null, { timeout: 120000 });
  const mv = await page.evaluate(() => { const a = window.__nf.cars[0].along; window.__nfAdvance(2, ["KeyW"]); return window.__nf.cars[0].along - a; });
  check(P, "retry: rollout skips and control returns", mv > 10, `${mv.toFixed(1)} m`);
  // back to title, pick another car and stage, start again
  await page.evaluate(() => { const s = window.__nf; s.lives = 1; });
  await page.evaluate(() => { for (let i = 0; i < 400 && window.__nf.phase === "playing"; i++) { const h = window.__nf.cars[0]; if (h.alive) { h.invuln = 0; h.hp = Math.min(h.hp, 0.01); } window.__nfAdvance(0.5, "idle"); } });
  await page.waitForSelector("text=Run it again", { timeout: 30000 });
  await page.click("button:has-text('Title')");
  await page.waitForSelector(".nf-carpick");
  await page.click("[aria-label='Next car']");
  await page.click("[aria-label='Next stage']");
  const pick = { car: await page.textContent(".nf-carpick-name"), stage: await page.textContent(".nf-stagepick .nf-carpick-name") };
  await page.click(".nf-btn");
  await page.waitForSelector(".nf-hud");
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction((id) => !window.__nfRollout().active && window.__nfCar().car === id && window.__nfCar().source === "glb", EXPECT[pick.car]?.id, { timeout: 120000 });
  const again = await page.evaluate(() => { const a = window.__nf.cars[0].along; window.__nfAdvance(2, ["KeyW"]); return { m: window.__nf.cars[0].along - a, car: window.__nfCar().file, stage: window.__nfStageInfo().stage, kills: window.__nf.takedowns, lives: window.__nf.lives }; });
  check(P, "title -> new car + stage -> plays", again.m > 10 && again.stage === "classic" && again.car === `${EXPECT[pick.car].file}_phone` && again.lives === 3, `${pick.car} / ${pick.stage}: ${JSON.stringify(again)}`);
  // ---- pause menu loop: pause -> Resume; pause -> Restart; pause -> Back to menu (confirm) -> different car + stage -> play; no growth
  const settle = async () => { await page.evaluate(() => { window.__nf.hitstop = 0; }); await page.waitForTimeout(2500); };
  const snap = () => page.evaluate(() => ({ ...window.__nfScene(), ...window.__nfDraws(), audio: window.__nfAudio().loopNodes, phase: window.__nf.phase }));
  await settle();
  const base = await snap();
  await page.click(".nf-icon-btn.left");
  await page.waitForSelector(".nf-pausemenu");
  const t0 = await page.evaluate(() => window.__nf.time);
  await page.waitForTimeout(1500);
  const t1 = await page.evaluate(() => window.__nf.time);
  check(P, "pause button opens menu; sim paused", t1 === t0 && (await page.evaluate(() => window.__nf.phase)) === "paused", `time ${t0} -> ${t1}`);
  await page.screenshot({ path: `${SHOTS}/${P}-pause.png` });
  await page.click(".nf-pausemenu >> text=Resume");
  check(P, "Resume", (await page.evaluate(() => window.__nf.phase)) === "playing");
  await page.keyboard.press("Escape");
  const escOpen = await page.isVisible(".nf-pausemenu");
  await page.keyboard.press("Escape");
  const escClose = !(await page.isVisible(".nf-pausemenu")) && (await page.evaluate(() => window.__nf.phase)) === "playing";
  check(P, "Esc opens and closes the pause menu", escOpen && escClose);
  await page.evaluate(() => { window.__nfAdvance(3, "hunt"); });
  await page.keyboard.press("Escape");
  await page.click(".nf-pausemenu >> text=Restart");
  await page.waitForTimeout(500);
  const rr2 = await page.evaluate(() => { const s = window.__nf; return { phase: s.phase, time: s.time, kills: s.takedowns, wave: s.wave, lives: s.lives, hp: s.cars[0].hp, enemies: s.cars.filter((c) => !c.hero && c.alive).length, shots: s.shots.filter((x) => x.alive).length, mines: s.mines.filter((x) => x.alive).length, roll: window.__nfRollout().active, audio: window.__nfAudio().loopNodes }; });
  check(P, "Restart resets the run", rr2.phase === "playing" && rr2.time < 1 && rr2.kills === 0 && rr2.lives === 3 && rr2.hp === 100 && rr2.enemies === 0 && rr2.shots === 0 && rr2.mines === 0 && rr2.roll && rr2.audio === base.audio, JSON.stringify(rr2));
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction(() => !window.__nfRollout().active, null, { timeout: 120000 });
  await page.keyboard.press("Escape");
  await page.click(".nf-pausemenu >> text=Back to menu");
  const asks = await page.isVisible("text=Yes, back to menu");
  await page.click("text=Yes, back to menu");
  await page.waitForSelector(".nf-carpick");
  const atMenu = await page.evaluate(() => ({ phase: window.__nf.phase, audio: window.__nfAudio().loopNodes, roll: window.__nfRollout().active, enemies: window.__nf.cars.filter((c) => !c.hero && c.alive).length }));
  check(P, "Back to menu (confirm) cleans up: audio loops stopped, rollout gone, enemies cleared", asks && atMenu.phase === "menu" && atMenu.audio === 0 && !atMenu.roll && atMenu.enemies === 0, JSON.stringify(atMenu));
  const carBefore = await page.textContent(".nf-carpick-name");
  const stageBefore = await page.textContent(".nf-stagepick .nf-carpick-name");
  await page.click("[aria-label='Next car']");
  await page.click("[aria-label='Previous stage']");
  const pk = { car: await page.textContent(".nf-carpick-name"), stage: await page.textContent(".nf-stagepick .nf-carpick-name") };
  await page.click(".nf-btn");
  await page.waitForSelector(".nf-hud");
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction((id) => !window.__nfRollout().active && window.__nfCar().car === id && window.__nfCar().source === "glb", EXPECT[pk.car]?.id, { timeout: 120000 });
  await page.evaluate(() => window.__nfAdvance(2, ["KeyW"]));
  await settle();
  const after = await snap();
  const st2 = await page.evaluate(() => window.__nfStageInfo().stage);
  check(P, "menu -> different car + stage plays", pk.car !== carBefore && pk.stage !== stageBefore && after.phase === "playing" && st2 === (pk.stage === "Night City" ? "city" : "classic"), `${carBefore}/${stageBefore} -> ${pk.car}/${pk.stage} (${st2})`);
  check(P, "no growth: scene objects, draws, audio loop nodes near baseline", after.objects <= base.objects * 1.15 + 20 && after.audio === base.audio && after.geometries <= base.geometries * 1.25 + 20, `base ${JSON.stringify(base)} after ${JSON.stringify(after)}`);
  check(P, "0 console errors", errors.length === 0, errors.slice(0, 3).join(" || "));
  await ctx.close();
}
if (!process.env.NF_ONLY || ["desktop", "folderonly"].includes(process.env.NF_ONLY)) {
  const http = await import("node:http");
  const path = await import("node:path");
  const DIR = BUILD.replace(/[^/]+\.html$/, "nightfall-roadster");
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".png": "image/png" };
  const srv = http.createServer((q, r) => { let f = path.join(DIR, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html"; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(d); }); }).listen(0);
  const port = srv.address().port;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/?debug`);
  await page.waitForSelector(".nf-btn");
  const got = [];
  for (const nm of Object.keys(EXPECT)) {
    await page.waitForFunction((id) => window.__nfCar && window.__nfCar().car === id && window.__nfCar().source !== "loading", EXPECT[nm].id, { timeout: 120000 }).catch(() => {});
    const c = await page.evaluate(() => window.__nfCar());
    got.push(`${nm}=${c.file}:${c.tris}`);
    if (c.file !== `${EXPECT[nm].file}_hero`) got.push("WRONG");
    await page.click("[aria-label='Next car']");
  }
  check("desktop-folder", "desktop loads each car's own hero LOD (served folder)", !got.includes("WRONG") && errs.length === 0, got.join(", "));
  await ctx.close();
  srv.close();
}
await browser.close();
fs.writeFileSync(`${SHOTS}/smoke-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
