// Quick m5 smoke test (desktop + phone): boots, car pick, rollout plays + hands over, drive, fire, an enemy dies, draws, 0 errors.
import { chromium, devices } from "playwright";
import fs from "node:fs";
import { drawGate, drawReport } from "./draw_gate.mjs";
const ROOT = "/workspace/studio/nightfall_roadster";
const BUILD = process.env.NF_BUILD || `${ROOT}/v02_final/nightfall-roadster-v02-final.html`;
const SHOTS = process.env.NF_SHOTS || `${ROOT}/v02_final/screenshots`;
fs.mkdirSync(SHOTS, { recursive: true });
const profiles = [
  { name: "desktop", ctx: { viewport: { width: 1280, height: 720 } } },
  { name: "phone", ctx: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } },
].filter((p) => !process.env.NF_ONLY || p.name === process.env.NF_ONLY);
const EXPECT = {
  "Model 3": { id: "model3", file: "sedan_compact" },
  "Model Y": { id: "model_y", file: "model_y" },
  "Model X": { id: "model_x", file: "model_x" },
  "Model S": { id: "model_s", file: "model_s" },
  Cybertruck: { id: "cybertruck", file: "cybertruck" },
  Roadster: { id: "roadster", file: "roadster2026" },
};
const results = [];
let failed = 0;
const check = (p, n, ok, d = "") => { results.push({ p, n, ok, d }); if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} [${p}] ${n}${d ? " — " + d : ""}`); };
// Week I compact menus: on phone, a menu screen fits with no scrolling or clipping and every button is
// ≥ 44x44 CSS px, in portrait (390x844) and landscape (844x390). Root = last element matching rootSel.
const menuFit = async (page, P, name, rootSel) => {
  if (P !== "phone") return;
  const measure = () => page.evaluate((rootSel) => {
    const roots = [...document.querySelectorAll(rootSel)];
    const root = roots[roots.length - 1];
    if (!root) return { missing: rootSel };
    const vw = innerWidth, vh = innerHeight;
    const boxes = [root, ...root.querySelectorAll(".nf-panel, .nf-card, .nf-scroll, .nf-foot")];
    const overflow = boxes.filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map((e) => `${e.className.split(" ")[0]} ${e.scrollWidth}x${e.scrollHeight}>${e.clientWidth}x${e.clientHeight}`);
    const btns = [...root.querySelectorAll("button, input[type=range]")].map((e) => ({ n: (e.getAttribute("aria-label") || e.textContent || e.type).trim().slice(0, 18), b: e.getBoundingClientRect() })).filter((x) => x.b.width > 0 && x.b.height > 0);
    const outside = btns.filter(({ b }) => b.left < -0.5 || b.top < -0.5 || b.right > vw + 0.5 || b.bottom > vh + 0.5).map((x) => x.n);
    const small = btns.filter(({ b }) => b.width < 43.99 || b.height < 43.99).map(({ n, b }) => `${n} ${b.width.toFixed(1)}x${b.height.toFixed(1)}`);
    return { vw, vh, buttons: btns.length, overflow, outside, small };
  }, rootSel);
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const portrait = await measure();
  await page.setViewportSize({ width: 844, height: 390 });
  await settle();
  const landscape = await measure();
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  const ok = (m) => !m.missing && m.buttons > 0 && !m.overflow.length && !m.outside.length && !m.small.length;
  check(P, `menu fits on phone: ${name} (portrait + landscape: no scroll/clip, buttons in view, ≥44x44)`, ok(portrait) && ok(landscape), JSON.stringify({ portrait, landscape }));
};
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
  check(P, "stage select (all seven playable, no Coming soon)", back === "Night City" && !st.some((s) => String(s).includes("Coming soon") || s === "disabled=true") && !(await page.isDisabled(".nf-btn")), st.join(" | "));
  {
    const lede = () => page.evaluate(() => { const e = document.querySelector(".nf-menu .nf-lede"); return { mode: e?.getAttribute("data-mode"), text: (e?.textContent || "").trim() }; });
    const nc = await lede();
    await page.click("[aria-label='Next stage']");
    const classic = { stage: await page.textContent(".nf-stagepick .nf-carpick-name"), ...(await lede()) };
    await page.click("[aria-label='Previous stage']");
    const back = await page.textContent(".nf-stagepick .nf-carpick-name");
    check(P, "title blurb: race stage (Night City) shows the race blurb, wave stage (Classic Night) keeps the wave blurb", nc.mode === "race" && /^Race six rivals to the finish\./.test(nc.text) && !/wave|thruster/i.test(nc.text) && classic.stage === "Classic Night" && classic.mode === "waves" && /^Hunters in waves\./.test(classic.text) && back === "Night City", JSON.stringify({ nc, classic, back }));
  }
  await menuFit(page, P, "title (car + stage pick)", ".nf-menu");
  if (P === "phone") {
    await page.click(".nf-launch >> text=Shop");
    await page.waitForSelector(".nf-shop");
    await menuFit(page, P, "shop (title)", ".nf-shop");
    await page.click(".nf-shop-close");
    await page.click(".nf-launch >> text=Settings");
    await page.waitForSelector(".nf-settings");
    await menuFit(page, P, "settings (title)", ".nf-settings");
    await page.click(".nf-settings .nf-foot .nf-btn");
    await page.waitForSelector(".nf-settings", { state: "detached" });
  }
  // start: rollout
  await page.waitForFunction(() => { const e = window.__nfEnemies(); return ["rammer", "gunner", "mine", "spiker", "drone", "boss"].every((k) => e[k] !== "loading"); }, null, { timeout: 90000 });
  await page.waitForTimeout(1500); // let the rig GLB finish too
  // Credits banked per finish must equal what the results card shows (race purse) or floor(score/10) (waves)
  const cardBank = () => page.evaluate(() => {
    const card = document.querySelector(".nf-overlay .nf-card");
    const num = (q) => { const m = (card?.querySelector(q)?.textContent || "").match(/-?\d+/); return m ? Number(m[0]) : null; };
    const score = [...(card?.querySelectorAll(".nf-rows div") || [])].find((d) => /score/i.test(d.textContent || ""))?.querySelector("strong")?.textContent;
    return { purse: num(".nf-race-purse"), lives: num(".nf-race-lives"), credits: num(".nf-credits"), score: score == null ? null : Number(score), title: (card?.querySelector(".nf-title-sm")?.textContent || "").trim() };
  });
  let creditsBefore = await page.evaluate(() => Number(((document.querySelector(".nf-launch .nf-credits")?.textContent) || "").match(/\d+/)?.[0] ?? NaN));
  await page.click(".nf-btn");
  await page.waitForSelector(".nf-hud");
  const r0 = await page.evaluate(() => window.__nfRollout());
  check(P, "rollout starts on Start (sim waits)", r0.active, JSON.stringify(r0));
  // the box is CPU-bound in headless runs: let the timeline run ~1.5 s for real, then seek to mid hover-out
  await page.waitForFunction(() => window.__nfRollout().t > 1.5 || !window.__nfRollout().active, null, { timeout: 120000 });
  await page.evaluate(() => window.__nfRolloutSet(4.35));
  await page.waitForFunction(() => window.__nfRollout().t > 4.4, null, { timeout: 120000 });
  const hov = await page.evaluate(() => ({ roll: window.__nfRollout(), car: window.__nf.carId }));
  const wantThrust = hov.car === "roadster" ? 1 : 0;
  check(P, "hover-out: thrusters only if Roadster", hov.roll.thrust === wantThrust, JSON.stringify(hov));
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
  // M1 (b): HUD at the edges, no overlaps, inside the viewport, centre clear for the car
  const rects = await page.evaluate(() => {
    const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
    return { vw: innerWidth, vh: innerHeight, bottom: r(".nf-bottom"), top: r(".nf-readout"), map: r(".nf-map-wrap"), touch: r(".nf-touch.is-live .nf-actions"), stick: r(".nf-touch.is-live .nf-stick"), pl: r(".nf-icon-btn.left"), pr: r(".nf-icon-btn.right"), center: !!document.querySelector(".nf-center") };
  });
  {
    const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const ins = (a) => !a || (a.l >= 0 && a.t >= 0 && a.r <= rects.vw && a.b <= rects.vh);
    const tops = [rects.touch, rects.stick].filter(Boolean).map((x) => x.t);
    const gapOk = !tops.length || rects.bottom.b <= Math.min(...tops) - 8;
    const ok = !rects.center && rects.bottom && !hit(rects.bottom, rects.top) && !hit(rects.bottom, rects.touch) && !hit(rects.bottom, rects.stick) && ![rects.top, rects.map].some((t) => hit(t, rects.pl) || hit(t, rects.pr) || hit(t, rects.bottom)) && gapOk && [rects.bottom, rects.top, rects.map, rects.touch, rects.stick, rects.pl, rects.pr].every(ins);
    check(P, "HUD on the edges: no overlaps, ≥8 px above touch row, inside viewport, centre clear", ok, JSON.stringify(rects));
  }
  // Week I compact phone HUD: readouts are thin pills that never overlap each other or the touch controls,
  // and every touch target is at least 44x44 CSS px. Portrait (the profile) and landscape (844x390).
  if (P === "phone") {
    const phoneHud = () => page.evaluate(() => {
      const box = (e) => { const b = e.getBoundingClientRect(); return { n: (e.className || "").toString().split(" ")[0] + ":" + (e.textContent || "").trim().slice(0, 12), l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
      const all = (q) => [...document.querySelectorAll(q)].filter(vis).map(box);
      return {
        vw: innerWidth, vh: innerHeight,
        groups: [all(".nf-readout"), all(".nf-map-wrap"), ...all(".nf-bottom .nf-meter").map((x) => [x]), ...all(".nf-bottom .nf-chip").map((x) => [x])],
        controls: all(".nf-touch.is-live .nf-stick, .nf-touch.is-live button, .nf-icon-btn"),
      };
    });
    const judge = (h) => {
      const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const bad = [];
      const g = h.groups.filter((x) => x.length);
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) for (const a of g[i]) for (const b of g[j]) if (hit(a, b)) bad.push(`${a.n}x${b.n}`);
      for (const a of g.flat()) { for (const c of h.controls) if (hit(a, c)) bad.push(`${a.n}x${c.n}`); if (a.l < 0 || a.t < 0 || a.r > h.vw || a.b > h.vh) bad.push(`${a.n} off-screen`); }
      const small = h.controls.filter((c) => c.w < 43.99 || c.h < 43.99).map((c) => `${c.n} ${c.w.toFixed(0)}x${c.h.toFixed(0)}`);
      const hasCtl = h.controls.length >= 7;
      return { ok: !bad.length && !small.length && hasCtl && g.length >= 5, bad, small, controls: h.controls.length, readouts: g.length };
    };
    const portrait = judge(await phoneHud());
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const landscape = judge(await phoneHud());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    check(P, "phone HUD: readouts clear of each other and of touch controls, touch targets ≥44x44 (portrait + landscape)", portrait.ok && landscape.ok, JSON.stringify({ portrait, landscape }));
  }
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
  const rep = drawReport(P, draws.draws);
  console.log(`DRAW [${P}] ${rep.note}`);
  check(P, `draws hard ceiling (${P === "phone" ? "≤160, soft ≤120 reported" : "logged"})`, drawGate(P, draws.draws), `${rep.note}, tris ${draws.tris}`);
  await page.evaluate(() => { window.__nf.hitstop = 0; });
  const k0 = await page.evaluate(() => window.__nf.takedowns);
  await page.evaluate(() => { for (let i = 0; i < 120 && window.__nf.takedowns === 0 && window.__nf.phase === "playing"; i++) window.__nfAdvance(0.5, "hunt"); });
  const k1 = await page.evaluate(() => window.__nf.takedowns);
  check(P, "an enemy dies", k1 > k0 || k0 > 0, `kills ${k0} -> ${k1}`);
  // Night City is a 3600 m race. Idling DNFs or finishes; it does not wreck. Cover finish -> results -> retry here.
  const finished = await page.evaluate(() => {
    const s = window.__nf;
    const h = s.cars[0];
    h.alive = true;
    h.invuln = 0;
    if (s.up) s.up.shieldT = 0;
    h.hp = Math.max(h.hp, 1);
    const target = s.race.originAlong + s.race.dist + 6;
    const i = Math.round(target / 2);
    const sample = s.track.samples[i - s.track.first];
    if (!sample) return { ok: false, target, first: s.track.first, n: s.track.samples.length };
    h.x = sample.x;
    h.y = sample.y;
    h.z = sample.z;
    h.along = sample.s;
    h.lastAlong = sample.s;
    h.speed = 30;
    window.__nfAdvance(0.2, "idle");
    return { ok: true, phase: s.phase, reason: s.result && s.result.reason, along: h.along };
  });
  const over = await page.waitForSelector("text=Run it again", { timeout: 30000 }).then(() => true).catch(() => false);
  const ov = await page.evaluate(() => ({ phase: window.__nf.phase, title: (document.querySelector(".nf-card .nf-title-sm")?.textContent || "").trim() }));
  check(P, "finish results", over && finished.ok && ov.phase === "finished" && /^(1st|2nd|3rd|4th)$/.test(ov.title), JSON.stringify({ ov, finished }));
  // Night City is a course race (no waves): results show place + finish time, never "Wave"; best line never says "wave 0"
  const ncCard = await page.evaluate(() => {
    const card = document.querySelector(".nf-overlay .nf-card");
    const row = (q) => (card?.querySelector(q)?.textContent || "").trim();
    return { text: (card?.textContent || "").replace(/\s+/g, " ").trim(), place: card?.querySelector(".nf-row-place strong")?.textContent?.trim() || "", time: row(".nf-row-time"), best: (card?.querySelector(".nf-best")?.textContent || "").trim() };
  });
  check(P, "NC results: no Wave text, shows Place + Finish time (best line has no wave 0)", !!ncCard.text && !/wave/i.test(ncCard.text) && /^P[1-4]$/.test(ncCard.place) && /^Finish time\s*\d+:\d{2}/.test(ncCard.time) && /course/i.test(ncCard.text) && !/wave 0/i.test(ncCard.best), JSON.stringify(ncCard));
  {
    const c = await cardBank();
    const shown = (c.purse ?? 0) + (c.lives ?? 0);
    check(P, "NC finish banks the shown purse: credits gained == purse + lives bonus", c.purse != null && c.purse > 0 && c.credits - creditsBefore === shown, JSON.stringify({ before: creditsBefore, ...c, shown, gained: c.credits - creditsBefore }));
    creditsBefore = c.credits;
  }
  await menuFit(page, P, "race results", ".nf-overlay");
  if (P === "phone") {
    await page.click(".nf-foot >> text=Shop");
    await page.waitForSelector(".nf-shop");
    await menuFit(page, P, "shop (results)", ".nf-shop");
    await page.click(".nf-shop-close");
    await page.waitForSelector(".nf-shop", { state: "detached" });
  }
  await page.screenshot({ path: `${SHOTS}/${P}-gameover.png` });
  await page.click("text=Run it again");
  await page.waitForSelector(".nf-hud");
  const rs = await page.evaluate(() => { const s = window.__nf, h = s.cars[0]; return { phase: s.phase, wave: s.wave, kills: s.takedowns, score: s.score ?? 0, lives: s.lives, hp: h.hp, alive: h.alive, enemies: s.cars.filter((c) => !c.hero && c.alive).length, roll: window.__nfRollout() }; });
  check(P, "retry after finish resets the run", rs.phase === "playing" && rs.kills === 0 && rs.wave <= 1 && rs.lives === 3 && rs.alive && rs.enemies >= 6 && rs.roll.active, JSON.stringify(rs));
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction(() => !window.__nfRollout().active, null, { timeout: 120000 });
  const mv = await page.evaluate(() => { const a = window.__nf.cars[0].along; window.__nfAdvance(2, ["KeyW"]); return window.__nf.cars[0].along - a; });
  check(P, "retry: rollout skips and control returns", mv > 10, `${mv.toFixed(1)} m`);
  // back to title, pick another car and stage, start again
  await page.evaluate(() => { const s = window.__nf; s.lives = 1; });
  await page.evaluate(() => { for (let i = 0; i < 400 && window.__nf.phase === "playing"; i++) { const h = window.__nf.cars[0]; if (h.alive) { h.invuln = 0; h.hp = Math.min(h.hp, 0.01); } window.__nfAdvance(0.5, "idle"); } });
  await page.waitForSelector("text=Run it again", { timeout: 30000 });
  {
    const c = await cardBank();
    check(P, "NC DNF banks the shown 25 (no lives bonus)", /^(DNF|Fell behind the field)$/.test(c.title) && c.purse === 25 && c.lives == null && c.credits - creditsBefore === 25, JSON.stringify({ before: creditsBefore, ...c, gained: c.credits - creditsBefore }));
    creditsBefore = c.credits;
  }
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
  // Classic Night is still the wave loop: a lethal hit with no lives left is Wrecked, then retry spawns no field.
  await page.evaluate(() => { const s = window.__nf; s.lives = 1; s.score = Math.max(s.score, 537); const h = s.cars[0]; h.invuln = 0; if (s.up) s.up.shieldT = 0; h.hp = 0.01; }); // non-zero score so the floor(score/10) bank is visible
  await page.evaluate(() => { for (let i = 0; i < 80 && window.__nf.phase === "playing"; i++) { const h = window.__nf.cars[0]; if (h.alive) { h.invuln = 0; h.hp = Math.min(h.hp, 0.01); } window.__nfAdvance(0.5, "idle"); } });
  const wreckOver = await page.waitForSelector("text=Run it again", { timeout: 30000 }).then(() => true).catch(() => false);
  const wv = await page.evaluate(() => ({ phase: window.__nf.phase, title: (document.querySelector(".nf-card .nf-title-sm")?.textContent || "").trim() }));
  check(P, "wrecked game over", wreckOver && wv.phase === "finished" && wv.title.includes("Wrecked"), JSON.stringify(wv));
  const wvCard = await page.evaluate(() => (document.querySelector(".nf-overlay .nf-card")?.textContent || "").replace(/\s+/g, " ").trim());
  check(P, "wave-mode results still show Wave (kicker + Wave reached row), no Place row", /· wave \d+/i.test(wvCard) && /Wave reached\s*\d+/i.test(wvCard) && !/Finish time/.test(wvCard) && !(await page.$(".nf-overlay .nf-row-place")), wvCard);
  {
    const c = await cardBank();
    check(P, "wave-mode wreck still banks floor(score/10), no purse shown", c.purse == null && c.score > 0 && c.credits - creditsBefore === Math.floor(c.score / 10), JSON.stringify({ before: creditsBefore, ...c, gained: c.credits - creditsBefore }));
  }
  await menuFit(page, P, "wrecked game over", ".nf-overlay");
  await page.click("text=Run it again");
  await page.waitForSelector(".nf-hud");
  const wrs = await page.evaluate(() => { const s = window.__nf, h = s.cars[0]; return { phase: s.phase, wave: s.wave, kills: s.takedowns, lives: s.lives, alive: h.alive, enemies: s.cars.filter((c) => !c.hero && c.alive).length, roll: window.__nfRollout().active }; });
  check(P, "wreck retry resets the run", wrs.phase === "playing" && wrs.kills === 0 && wrs.wave <= 1 && wrs.lives === 3 && wrs.alive && wrs.enemies === 0 && wrs.roll, JSON.stringify(wrs));
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction(() => !window.__nfRollout().active, null, { timeout: 120000 });
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
  await menuFit(page, P, "pause", ".nf-overlay");
  if (P === "phone") {
    await page.click(".nf-pausemenu >> text=Settings");
    await page.waitForSelector(".nf-settings");
    await menuFit(page, P, "settings (pause)", ".nf-settings");
    await page.click(".nf-settings .nf-foot .nf-btn");
    await page.waitForSelector(".nf-settings", { state: "detached" });
  }
  await page.click(".nf-pausemenu >> text=Resume");
  check(P, "Resume", (await page.evaluate(() => window.__nf.phase)) === "playing");
  await page.keyboard.press("Escape");
  const escOpen = await page.waitForSelector(".nf-pausemenu", { timeout: 20000 }).then(() => true).catch(() => false);
  await page.keyboard.press("Escape");
  const escClose = (await page.waitForSelector(".nf-pausemenu", { state: "detached", timeout: 20000 }).then(() => true).catch(() => false)) && (await page.evaluate(() => window.__nf.phase)) === "playing";
  check(P, "Esc opens and closes the pause menu", escOpen && escClose);
  await page.evaluate(() => { window.__nfAdvance(3, "hunt"); });
  await page.keyboard.press("Escape");
  await page.click(".nf-pausemenu >> text=Restart");
  // Let the frame that was already queued finish, then give a slow box up to a second to show 0:00.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => /^0:00/.test(document.querySelector(".nf-map-wrap .nf-sub")?.textContent || ""), null, { timeout: 1000 }).catch(() => {});
  const rr2 = await page.evaluate(() => {
    const s = window.__nf;
    const h = s.cars[0];
    const race = document.querySelector(".nf-race");
    return {
      phase: s.phase, time: s.time, kills: s.takedowns, wave: s.wave, lives: s.lives,
      hp: h.hp, maxHp: h.maxHp,
      enemies: s.cars.filter((c) => !c.hero && c.alive).length,
      shots: s.shots.filter((x) => x.alive).length,
      mines: s.mines.filter((x) => x.alive).length,
      roll: window.__nfRollout().active,
      audio: window.__nfAudio().loopNodes,
      hudWave: document.querySelector(".nf-readout .nf-stat")?.textContent ?? "",
      hudKills: document.querySelector(".nf-readout .nf-sub")?.textContent ?? "",
      hudTime: document.querySelector(".nf-map-wrap .nf-sub")?.textContent ?? "",
      raceHidden: !race || race.hidden,
    };
  });
  check(P, "Restart resets the run", rr2.phase === "playing" && rr2.time < 1 && rr2.kills === 0 && rr2.lives === 3 && rr2.hp === rr2.maxHp && rr2.hp > 0 && rr2.enemies === 0 && rr2.shots === 0 && rr2.mines === 0 && rr2.roll && rr2.audio === base.audio && rr2.hudWave === "1" && rr2.hudKills === "Kills 0" && /^0:00/.test(rr2.hudTime) && rr2.raceHidden, JSON.stringify(rr2));
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction(() => !window.__nfRollout().active, null, { timeout: 120000 });
  await page.keyboard.press("Escape");
  await page.click(".nf-pausemenu >> text=Back to menu");
  const asks = await page.isVisible("text=Yes, back to menu");
  await menuFit(page, P, "pause: back-to-menu confirm", ".nf-overlay");
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
  // second round trip back to the baseline stage so the comparison is like for like
  await page.keyboard.press("Escape");
  await page.click(".nf-pausemenu >> text=Back to menu");
  await page.click("text=Yes, back to menu");
  await page.waitForSelector(".nf-carpick");
  await page.click("[aria-label='Next stage']");
  await page.click(".nf-btn");
  await page.waitForSelector(".nf-hud");
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction(() => !window.__nfRollout().active && window.__nfCar().source === "glb", null, { timeout: 120000 });
  await page.evaluate(() => window.__nfAdvance(2, ["KeyW"]));
  await settle();
  const after2 = await snap();
  check(P, "no growth after 2 menu round trips: scene objects, geometries, audio loop nodes near baseline", after2.objects <= base.objects + 10 && after2.audio === base.audio && after2.geometries <= base.geometries + 30, `base ${JSON.stringify(base)} city ${JSON.stringify(after)} back ${JSON.stringify(after2)}`);
  if (false) check(P, "x", after.objects <= base.objects * 1.15 + 20 && after.audio === base.audio && after.geometries <= base.geometries * 1.25 + 20, `base ${JSON.stringify(base)} after ${JSON.stringify(after)}`);
  check(P, "0 console errors", errors.length === 0, errors.slice(0, 3).join(" || "));
  await ctx.close();
}
if (!process.env.NF_ONLY || ["desktop", "folderonly"].includes(process.env.NF_ONLY)) {
  const http = await import("node:http");
  const path = await import("node:path");
  const DIR = BUILD.replace(/[^/]+\.html$/, "nightfall-roadster");
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".png": "image/png" };
  const srv = http.createServer((q, r) => { let f = path.join(DIR, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html"; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(d); }); }).listen(4180, "127.0.0.1");
  await new Promise((res) => srv.once("listening", res));
  const port = 4180; // M1: fixed port (4173-4177 belong to other projects)
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
  // Week I distant-car LOD (desktop hero-LOD build): rivals/enemies past the far line draw the phone GLB, near ones and the hero never do
  await page.click(".nf-launch .nf-btn");
  await page.waitForSelector(".nf-hud");
  await page.evaluate(() => window.__nfSkipRollout());
  await page.waitForFunction(() => !window.__nfRollout().active, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__nfEnemies().carLod?.loLoaded >= 6, null, { timeout: 120000 });
  await page.evaluate(() => { const s = window.__nf, S = window.__nfStage; s.lull = 1e9; window.__nfAdvance(1, ["KeyW"]); for (const [k, o, l] of [["gunner", 12, 3], ["rammer", 70, -3], ["boss", 90, 0], ["mine", 60, 6]]) S.debugSpawn(s, k, o, l); window.__nfAdvance(0.3, "cruise"); s.hitstop = 1e9; });
  // let a few frames render (the LOD state is picked in world.sync) and settle: no near/far state left stale
  await page.waitForFunction(() => { const l = window.__nfEnemies().carLod; return l.views.length > 3 && l.views.every((r) => { const [, st, d] = r.split(":"); return st === "hero" || (+d < l.far - 5 ? st === "near" : +d > l.far ? st === "far" : true); }); }, null, { timeout: 15000 }).catch(() => {});
  const lod = await page.evaluate(() => window.__nfEnemies().carLod);
  const rows = lod.views.map((r) => { const [id, st, d] = r.split(":"); return { id: +id, st, d: +d }; });
  const heroOk = rows.some((r) => r.id === 0 && r.st === "hero") && !rows.some((r) => r.st === "hero-LOW");
  const farOk = rows.some((r) => r.st === "far") && rows.filter((r) => r.st === "far").every((r) => r.d > lod.far - 5);
  const nearOk = rows.filter((r) => r.id !== 0 && r.d < lod.far - 5).length > 0 && rows.filter((r) => r.id !== 0 && r.d < lod.far - 5).every((r) => r.st === "near");
  check("desktop-folder", "distant-car LOD: far rivals/enemies use the low model, near ones and the hero never do", lod.on && heroOk && farOk && nearOk && errs.length === 0, JSON.stringify(lod));
  await ctx.close();
  srv.close();
}
await browser.close();
fs.writeFileSync(`${SHOTS}/smoke-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
