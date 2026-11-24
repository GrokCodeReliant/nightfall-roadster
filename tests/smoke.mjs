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
// Per-check filter: SMOKE_ONLY=<id> or --only=<id>. A known id (see ISOLATED below, e.g. PW-5, MP-8) boots straight into that
// stage and replays the same probe sequence up to that spot, so one flaky check reruns in about a minute. Any other value is a
// case-insensitive substring of check names: the full flow still runs, but only matching checks are counted / reported.
const ONLY = process.env.SMOKE_ONLY || (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const onlyRe = ONLY ? { test: (n) => n.toLowerCase().includes(ONLY.toLowerCase()) } : null;
let skipped = 0;
const check = (p, n, ok, d = "") => {
  if (onlyRe && !onlyRe.test(n)) { skipped++; return; }
  results.push({ p, n, ok, d }); if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} [${p}] ${n}${d ? " — " + d : ""}`);
};
// Shared race-stage probe (Pine Woods / Open Highway / Mountain Pass, full and isolated runs): frozen-sim teleport to race s at
// lateral offset lat (hopping ahead at hopLat while the track streams), real frames, then draws + stage info + framing.
// extra: "woods" adds __nfWoods() and the covered-bridge pick, "hw" adds __nfHighway(), "pass" adds __nfHighway() + __nfPass().
const probeAt = async (page, P, raceS, lat, hopLat, extra) => {
  await page.evaluate(({ raceS, lat, hopLat }) => {
    const s = window.__nf, h = s.cars[0];
    const idx = () => Math.round((s.race.originAlong + raceS) / 2) - s.track.first;
    for (let g = 0; g < 20 && !s.track.samples[idx()]; g++) {
      const last = s.track.samples[s.track.samples.length - 40];
      // invulnerable while hopping ahead (lane 0 crosses the fork medians); dropped again at the probe pose below
      h.x = last.x + last.rx * hopLat; h.y = last.y; h.z = last.z + last.rz * hopLat; h.along = last.s; h.lastAlong = last.s; h.lane = hopLat; h.speed = 36; h.invuln = 1e9; h.hp = h.maxHp;
      s.hitstop = 0; window.__nfAdvance(0.02, ["KeyW"]);
    }
    const sm = s.track.samples[idx()];
    h.x = sm.x + sm.rx * lat; h.y = sm.y; h.z = sm.z + sm.rz * lat; h.along = sm.s; h.lastAlong = sm.s; h.lane = lat; h.speed = 36; h.lat = 0; h.vy = 0; h.grounded = true;
    // invuln 0: an invulnerable hero blinks (hidden every other 90 ms), which would skew draws and the bridge pick
    h.yaw = Math.atan2(-sm.tx, -sm.tz); h.invuln = 0; h.hp = h.maxHp; h.offT = 0; s.race.dnfT = 0;
    s.hitstop = 0; window.__nfAdvance(0.05, ["KeyW"]); s.hitstop = 1e9;
    // snap the chase cam onto the frozen hero (debug hook; the game camera is unchanged). The follow lerp is per rendered frame
    // with dt capped at 50 ms (k = 0.19/frame), so after a 500-900 m teleport on a slow swiftshader frame rate it was still flying
    // in after the 3 s settle: hero off screen (framed false, "blocked" by the bridge at PW-5) and only 14-28 draws.
    window.__nfSnapCam();
  }, { raceS, lat, hopLat });
  await page.waitForFunction(() => window.__nfHeroOnScreen().inside, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(P === "phone" ? 5000 : 3000);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate((extra) => {
    const h = window.__nf.cars[0];
    const out = { ...window.__nfDraws(), ...window.__nfStageInfo(), framed: window.__nfHeroOnScreen().inside,
      hero: { alive: h.alive, hp: h.hp, lat: +h.lat.toFixed(2), s: +(h.along - window.__nf.race.originAlong).toFixed(1), phase: window.__nf.phase } };
    if (extra === "woods") {
      const ndc = window.__nfProjectXYZ(h.x, h.y + 0.8, h.z);
      const first = window.__nfPick(ndc.x, ndc.y)[0] || null;
      out.blocked = !!first && ((first.pieces || []).some((p) => /^woods_covered_bridge/.test(p)));
      out.woods = window.__nfWoods();
    }
    if (extra === "hw" || extra === "pass") out.hw = window.__nfHighway();
    if (extra === "pass") out.pass = window.__nfPass();
    return out;
  }, extra);
};
const pwSpotOk = (d) => d.stage === "woods" && d.cityChunks >= 4 && d.framed && d.draws > 20 && d.woods.stands === 4 && d.woods.near > 0;
const pw5Ok = (pw0, pw5) => pw5.woods.roofHidden && pw5.woods.roofs >= 1 && pw5.framed && !pw5.blocked && !pw0.woods.roofHidden;
const mpSpotOk = (k, d) => d.stage === "pass" && d.cityChunks >= (k === "mp11" ? 1 : 3) && d.framed && d.draws > 15 && d.pass.pieces.mtn_props >= (k === "mp11" ? 1 : 3) && d.pass.tiles >= 4 && d.pass.peaks && d.hero.alive;
const PW_SPOTS = { pw0: 60, pw3: 870, pw5: 1800, pw6: 2080 };
const MP_SPOTS = { mp0: [150, 0], pre2: [760, 0], mp2: [900, 0], mp3: [1130, -3], mp8: [3000, 0], mp9: [3600, 6], mp10: [4090, 0], mp11: [4680, 0] };
const PW5_NAME = "Pine Woods PW-5 covered bridge: roof + crown hidden under it, hero framed and not behind the bridge";
// isolated reruns: stage name on the picker, then the same probe sequence as the full run up to the target spot
const ISOLATED = {
  "PW-5": { stage: "Pine Woods", run: async (page, P) => {
    const d = {};
    for (const k of ["pw0", "pw3", "pw5"]) d[k] = await probeAt(page, P, PW_SPOTS[k], 0, 0, "woods");
    return [[PW5_NAME + " [isolated]", pw5Ok(d.pw0, d.pw5) && pwSpotOk(d.pw5), JSON.stringify({ pw5: d.pw5.woods, blocked: d.pw5.blocked, framed: d.pw5.framed, hero: d.pw5.hero, draws: d.pw5.draws })]];
  } },
  "MP-8": { stage: "Mountain Pass", run: async (page, P) => {
    const d = {};
    for (const k of ["mp0", "pre2", "mp2", "mp3", "mp8"]) d[k] = await probeAt(page, P, MP_SPOTS[k][0], MP_SPOTS[k][1], -6, "pass");
    const m = d.mp8;
    return [["Mountain Pass scenery streams at MP-8 (framed, alive, pieces + tiles + peaks, draws gate, tris ≤250k desktop) [isolated]", mpSpotOk("mp8", m) && drawGate(P, m.draws) && (P === "phone" || m.tris <= 250000),
      JSON.stringify({ draws: m.draws, tris: m.tris, framed: m.framed, alive: m.hero.alive, hero: m.hero, cityChunks: m.cityChunks, tiles: m.pass.tiles, pieces: m.pass.pieces })]];
  } },
};
const iso = ONLY && ISOLATED[ONLY.toUpperCase()];
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
  if (iso) {
    for (let i = 0; i < 9 && (await page.textContent(".nf-stagepick .nf-carpick-name")) !== iso.stage; i++) await page.click("[aria-label='Next stage']");
    await page.click(".nf-btn");
    await page.waitForSelector(".nf-hud");
    await page.evaluate(() => window.__nfSkipRollout());
    await page.waitForFunction(() => !window.__nfRollout().active && window.__nfCar().source === "glb", null, { timeout: 120000 });
    await page.evaluate(() => window.__nfAdvance(2, ["KeyW"]));
    for (const [n, ok, d] of await iso.run(page, P)) { results.push({ p: P, n, ok, d }); if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} [${P}] ${n} — ${d}`); }
    await ctx.close();
    continue;
  }
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
  // RACE_RESPAWNS v1.0: a killed race rival waits 2.0 s (still placed), comes back behind the hero with 1.5 s invuln
  const rsp = await page.evaluate(() => {
    const s = window.__nf;
    s.hitstop = 0;
    const r0 = window.__nfRespawns();
    const v = r0.rivals.find((c) => c.alive && c.invuln <= 0 && c.left > 0);
    if (!v) return { ok: false, why: "no live rival", r0 };
    const n0 = r0.log.length;
    window.__nfKill(v.id);
    const toast = s.toast;
    const mid = window.__nfRespawns().rivals.find((c) => c.id === v.id);
    const t0 = s.time;
    const queued = r0.rivals.filter((c) => c.pending).length; // an earlier kill may be ahead of it in the 1 s field stagger
    window.__nfAdvance(1.9, "idle");
    const early = window.__nfRespawns().rivals.find((c) => c.id === v.id).alive;
    for (let i = 0; i < 40 && s.phase === "playing" && !window.__nfRespawns().rivals.find((c) => c.id === v.id).alive; i++) window.__nfAdvance(0.1, "idle");
    const r1 = window.__nfRespawns();
    const back = r1.rivals.find((c) => c.id === v.id);
    const entry = r1.log.slice(n0).find((e) => e.id === v.id);
    return { ok: true, budget: r0.budget, toast, mid, back, entry, phase: s.phase, early, queued, after: entry ? +(entry.t - t0).toFixed(2) : null };
  });
  check(P, "race rival respawn: budget 4, waits 2 s while placed, returns behind the hero, invulnerable", rsp.ok && rsp.budget === 4 && /down\s+\+\d+ · back in 2s/.test(rsp.toast) && rsp.mid.pending && !rsp.mid.alive && rsp.mid.left === 3 && !rsp.early && (rsp.phase !== "playing" || (rsp.back.alive && !!rsp.entry && rsp.entry.s <= rsp.entry.heroS + 1e-6 && rsp.after >= 1.99 && rsp.after <= 2.05 + rsp.queued)), JSON.stringify(rsp));
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
  check(P, "NC results best line is Night City's race best (place + time, no wave/pts)", /^Night City best P[1-4] · \d+:\d{2}/.test(ncCard.best) && !/wave|pts/i.test(ncCard.best), ncCard.best);
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
  // ---- Coast Road (LEVELS/02): an authored 4000 m race like Night City. Start, scenery + draws at CR-0/5/8, finish,
  // results (place + time, banks the shown purse), restart, lives-out DNF (banks 25). Then back to Classic for the pause loop.
  {
    await page.keyboard.press("Escape");
    await page.click(".nf-pausemenu >> text=Back to menu");
    await page.click("text=Yes, back to menu");
    await page.waitForSelector(".nf-carpick");
    await page.click("[aria-label='Next stage']");
    const crStage = await page.textContent(".nf-stagepick .nf-carpick-name");
    const crLede = await page.evaluate(() => { const e = document.querySelector(".nf-menu .nf-lede"); return { mode: e?.getAttribute("data-mode"), text: (e?.textContent || "").trim() }; });
    check(P, "Coast Road title shows the race blurb", crStage === "Coast Road" && crLede.mode === "race" && /^Race six rivals to the finish\./.test(crLede.text) && !/wave/i.test(crLede.text), JSON.stringify({ crStage, crLede }));
    const crCredits0 = await page.evaluate(() => Number(((document.querySelector(".nf-launch .nf-credits")?.textContent) || "").match(/\d+/)?.[0] ?? NaN));
    await page.click(".nf-btn");
    await page.waitForSelector(".nf-hud");
    await page.evaluate(() => window.__nfSkipRollout());
    await page.waitForFunction(() => !window.__nfRollout().active && window.__nfCar().source === "glb", null, { timeout: 120000 });
    const crStart = await page.evaluate(() => { const a = window.__nf.cars[0].along; window.__nfAdvance(2, ["KeyW"]); const s = window.__nf; return { m: s.cars[0].along - a, stage: s.stageId, armed: s.race.armed, dist: s.race.dist, rivals: s.cars.filter((c) => c.racer && c.alive).length, wave: s.wave, phase: s.phase, lives: s.lives }; });
    check(P, "Coast Road start: race armed at 4000 m, 6 rivals, no waves, drives", crStart.stage === "coast" && crStart.armed && crStart.dist === 4000 && crStart.rivals === 6 && crStart.wave === 0 && crStart.phase === "playing" && crStart.m > 10 && crStart.lives === 3, JSON.stringify(crStart));
    // frozen-sim teleport to race s (ascending: the track trims behind the hero); real frames stream the chunks
    const crAt = async (raceS) => {
      await page.evaluate((raceS) => {
        const s = window.__nf, h = s.cars[0];
        const sm = s.track.samples[Math.round((s.race.originAlong + raceS) / 2) - s.track.first];
        h.x = sm.x; h.y = sm.y; h.z = sm.z; h.along = sm.s; h.lastAlong = sm.s; h.lane = 0; h.speed = 36; h.lat = 0; h.vy = 0; h.grounded = true;
        h.yaw = Math.atan2(-sm.tx, -sm.tz); h.invuln = 0; h.offT = 0; s.race.dnfT = 0;
        s.hitstop = 0; window.__nfAdvance(0.05, ["KeyW"]); s.hitstop = 1e9;
      }, raceS);
      // the chase cam eases after a long teleport: wait until the hero is framed again, then let the chunks settle
      await page.waitForFunction(() => window.__nfHeroOnScreen().inside, null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(P === "phone" ? 5000 : 3000);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return page.evaluate(() => ({ ...window.__nfDraws(), ...window.__nfStageInfo(), framed: window.__nfHeroOnScreen().inside }));
    };
    const crDraws = { cr0: await crAt(60), cr5: await crAt(1640), cr8: await crAt(2470) };
    await page.screenshot({ path: `${SHOTS}/${P}-coast-cr8.png` });
    // "Ramp ahead" only inside 150 m of a ramp: none at CR-8 (230 m before CR-9), shown at 2610 (90 m before it)
    const rampToast = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r((document.querySelector(".nf-toast")?.textContent || "").trim())))));
    const hint8 = await rampToast();
    await page.evaluate(() => {
      const s = window.__nf, h = s.cars[0];
      const sm = s.track.samples[Math.round((s.race.originAlong + 2610) / 2) - s.track.first];
      h.x = sm.x; h.y = sm.y; h.z = sm.z; h.along = sm.s; h.lastAlong = sm.s; h.lane = 0; h.speed = 36; h.lat = 0; h.vy = 0; h.grounded = true;
      h.yaw = Math.atan2(-sm.tx, -sm.tz); h.invuln = 0; h.offT = 0; s.race.dnfT = 0;
      s.hitstop = 0; window.__nfAdvance(0.05, ["KeyW"]); s.hitstop = 1e9;
    });
    const hint9 = await rampToast();
    check(P, "Coast Road ramp hint: hidden at CR-8 (230 m out), \"Ramp ahead\" 90 m before CR-9", !/^ramp/i.test(hint8) && /^Ramp/.test(hint9), JSON.stringify({ hint8, hint9 }));
    for (const [k, d] of Object.entries(crDraws)) console.log(`DRAW [${P}] coast ${k}: ${d.draws} draws, ${d.tris} tris`);
    const worst = Math.max(...Object.values(crDraws).map((d) => d.draws));
    check(P, `Coast Road scenery streams and draws stay under the ceiling at CR-0 / CR-5 / CR-8 (${P === "phone" ? "≤160" : "logged"})`, Object.values(crDraws).every((d) => d.stage === "coast" && d.cityChunks >= 4 && d.framed && d.draws > 20) && drawGate(P, worst), JSON.stringify(crDraws));
    await page.evaluate(() => { window.__nf.hitstop = 0; });
    const crFin = await page.evaluate(() => {
      const s = window.__nf, h = s.cars[0];
      h.alive = true; h.invuln = 0; if (s.up) s.up.shieldT = 0; h.hp = Math.max(h.hp, 1);
      const sm = s.track.samples[Math.round((s.race.originAlong + s.race.dist + 6) / 2) - s.track.first];
      if (!sm) return { ok: false };
      h.x = sm.x; h.y = sm.y; h.z = sm.z; h.along = sm.s; h.lastAlong = sm.s; h.speed = 30;
      window.__nfAdvance(0.2, "idle");
      return { ok: true, phase: s.phase, place: s.race.place, mode: s.result && s.result.mode };
    });
    const crOver = await page.waitForSelector("text=Run it again", { timeout: 30000 }).then(() => true).catch(() => false);
    const crCard = await page.evaluate(() => {
      const card = document.querySelector(".nf-overlay .nf-card");
      const best = (card?.querySelector(".nf-best")?.textContent || "").trim();
      const body = (card?.textContent || "").replace(best, "").replace(/\s+/g, " ").trim();
      return { text: body, best, title: (card?.querySelector(".nf-title-sm")?.textContent || "").trim(), place: card?.querySelector(".nf-row-place strong")?.textContent?.trim() || "", time: (card?.querySelector(".nf-row-time")?.textContent || "").trim() };
    });
    check(P, "Coast Road finish -> results: place + finish time, Coast Road 4.0 km, no Wave text (best line has no wave 0)", crOver && crFin.ok && crFin.mode === "race" && /^(1st|2nd|3rd|4th)$/.test(crCard.title) && /^P[1-4]$/.test(crCard.place) && /^Finish time\s*\d+:\d{2}/.test(crCard.time) && /Coast Road · 4\.0 km course/.test(crCard.text) && !/wave/i.test(crCard.text) && !/wave 0/i.test(crCard.best), JSON.stringify({ crFin, crCard }));
    check(P, "Coast Road results best line is the course's race best (place + time, no wave/pts)", /^Coast Road best P[1-4] · \d+:\d{2}/.test(crCard.best) && !/wave|pts/i.test(crCard.best), crCard.best);
    {
      const c = await cardBank();
      const shown = (c.purse ?? 0) + (c.lives ?? 0);
      check(P, "Coast Road finish banks the shown purse: credits gained == purse + lives bonus", c.purse != null && c.purse > 0 && c.credits - crCredits0 === shown, JSON.stringify({ before: crCredits0, ...c, shown, gained: c.credits - crCredits0 }));
      creditsBefore = c.credits;
    }
    await menuFit(page, P, "Coast Road results", ".nf-overlay");
    await page.screenshot({ path: `${SHOTS}/${P}-coast-results.png` });
    await page.click("text=Run it again");
    await page.waitForSelector(".nf-hud");
    const crRs = await page.evaluate(() => { const s = window.__nf, h = s.cars[0]; return { phase: s.phase, stage: s.stageId, armed: s.race.armed, dist: s.race.dist, time: s.time, kills: s.takedowns, lives: s.lives, hp: h.hp, maxHp: h.maxHp, alive: h.alive, rivals: s.cars.filter((c) => c.racer && c.alive).length, roll: window.__nfRollout().active, race: h.along - s.race.originAlong }; });
    check(P, "Coast Road restart resets the race (rollout, 6 rivals, 3 lives, full hull, back on the grid)", crRs.phase === "playing" && crRs.stage === "coast" && crRs.armed && crRs.dist === 4000 && crRs.time < 1 && crRs.kills === 0 && crRs.lives === 3 && crRs.alive && crRs.hp === crRs.maxHp && crRs.rivals === 6 && crRs.roll && Math.abs(crRs.race) < 5, JSON.stringify(crRs));
    await page.evaluate(() => window.__nfSkipRollout());
    await page.waitForFunction(() => !window.__nfRollout().active, null, { timeout: 120000 });
    await page.evaluate(() => { window.__nf.lives = 1; });
    await page.evaluate(() => { for (let i = 0; i < 400 && window.__nf.phase === "playing"; i++) { const s = window.__nf, h = s.cars[0]; if (h.alive) { h.invuln = 0; if (s.up) s.up.shieldT = 0; h.hp = Math.min(h.hp, 0.01); } s.race.dnfT = 0; window.__nfAdvance(0.5, "idle"); } });
    const crDnfOver = await page.waitForSelector("text=Run it again", { timeout: 30000 }).then(() => true).catch(() => false);
    {
      const c = await cardBank();
      const txt = await page.evaluate(() => { const card = document.querySelector(".nf-overlay .nf-card"); const best = (card?.querySelector(".nf-best")?.textContent || "").trim(); return (card?.textContent || "").replace(best, "").replace(/\s+/g, " ").trim(); });
      check(P, "Coast Road DNF -> results banks the shown 25 (no lives bonus), no Wave text outside the best-record line", crDnfOver && /^(DNF|Fell behind the field)$/.test(c.title) && c.purse === 25 && c.lives == null && c.credits - creditsBefore === 25 && !/wave/i.test(txt), JSON.stringify({ before: creditsBefore, ...c, gained: c.credits - creditsBefore }));
      creditsBefore = c.credits;
    }
    await page.click("button:has-text('Title')");
    await page.waitForSelector(".nf-carpick");
    // ---- Pine Woods (LEVELS/03): authored 4400 m race on Art's woods kit v2. Title blurb, start, PW-0 / PW-3 truck /
    // PW-5 under the covered bridge (roof + crown hidden, hero framed and not behind the bridge) / PW-6 fog hollow, draws,
    // finish -> results + course best. Then back past Coast to Classic.
    {
      await page.click("[aria-label='Next stage']");
      const pwStage = await page.textContent(".nf-stagepick .nf-carpick-name");
      const pwLede = await page.evaluate(() => { const e = document.querySelector(".nf-menu .nf-lede"); return { mode: e?.getAttribute("data-mode"), text: (e?.textContent || "").trim() }; });
      check(P, "Pine Woods title shows the race blurb", pwStage === "Pine Woods" && pwLede.mode === "race" && /^Race six rivals to the finish\./.test(pwLede.text) && !/wave/i.test(pwLede.text), JSON.stringify({ pwStage, pwLede }));
      await page.click(".nf-btn");
      await page.waitForSelector(".nf-hud");
      await page.evaluate(() => window.__nfSkipRollout());
      await page.waitForFunction(() => !window.__nfRollout().active && window.__nfCar().source === "glb", null, { timeout: 120000 });
      const pwStart = await page.evaluate(() => { const a = window.__nf.cars[0].along; window.__nfAdvance(2, ["KeyW"]); const s = window.__nf; return { m: s.cars[0].along - a, stage: s.stageId, armed: s.race.armed, dist: s.race.dist, rivals: s.cars.filter((c) => c.racer && c.alive).length, wave: s.wave, phase: s.phase, lives: s.lives, trucks: s.trucks.length }; });
      check(P, "Pine Woods start: race armed at 4400 m, 6 rivals, no waves, 6 logging trucks queued, drives", pwStart.stage === "woods" && pwStart.armed && pwStart.dist === 4400 && pwStart.rivals === 6 && pwStart.wave === 0 && pwStart.phase === "playing" && pwStart.m > 10 && pwStart.lives === 3 && pwStart.trucks === 6, JSON.stringify(pwStart));
      const pwAt = (raceS) => probeAt(page, P, raceS, 0, 0, "woods");
      const pwDraws = {}; for (const [k, sAt] of Object.entries(PW_SPOTS)) pwDraws[k] = await pwAt(sAt);
      await page.screenshot({ path: `${SHOTS}/${P}-woods-pw6.png` });
      for (const [k, d] of Object.entries(pwDraws)) console.log(`DRAW [${P}] woods ${k}: ${d.draws} draws, ${d.tris} tris, pines ${d.woods.near}/${d.woods.far}, trucks ${d.woods.trucks}`);
      const pwWorst = Math.max(...Object.values(pwDraws).map((d) => d.draws));
      check(P, `Pine Woods scenery streams, 4 pine stands, draws under the ceiling at PW-0 / PW-3 / PW-5 / PW-6 (${P === "phone" ? "≤160" : "logged"})`, Object.values(pwDraws).every(pwSpotOk) && drawGate(P, pwWorst), JSON.stringify(pwDraws));
      check(P, "Pine Woods BN-17: a logging truck spawns ahead at PW-3 and is drawn (pool of 3)", pwDraws.pw3.woods.truckPool === 3 && pwDraws.pw3.woods.trucks >= 1 && pwDraws.pw3.woods.trucksSim.some((t) => t.id === "LT1" && t.alive), JSON.stringify(pwDraws.pw3.woods));
      check(P, PW5_NAME, pw5Ok(pwDraws.pw0, pwDraws.pw5), JSON.stringify({ pw5: pwDraws.pw5.woods, blocked: pwDraws.pw5.blocked }));
      check(P, "Pine Woods PW-6 fog hollow thickens to 0.016 (PW-0 stays 0.012)", Math.abs(pwDraws.pw6.woods.fog - 0.016) < 1e-6 && Math.abs(pwDraws.pw0.woods.fog - 0.012) < 1e-6, JSON.stringify([pwDraws.pw0.woods.fog, pwDraws.pw6.woods.fog]));
      await page.evaluate(() => { window.__nf.hitstop = 0; });
      const pwFin = await page.evaluate(() => {
        const s = window.__nf, h = s.cars[0];
        h.alive = true; h.invuln = 0; if (s.up) s.up.shieldT = 0; h.hp = Math.max(h.hp, 1);
        for (let g = 0; g < 20 && !s.track.samples[Math.round((s.race.originAlong + s.race.dist + 6) / 2) - s.track.first]; g++) {
          const last = s.track.samples[s.track.samples.length - 40];
          h.x = last.x; h.y = last.y; h.z = last.z; h.along = last.s; h.lastAlong = last.s; h.speed = 36; h.invuln = 1e9;
          window.__nfAdvance(0.02, ["KeyW"]);
        }
        h.invuln = 0;
        const sm = s.track.samples[Math.round((s.race.originAlong + s.race.dist + 6) / 2) - s.track.first];
        if (!sm) return { ok: false };
        h.x = sm.x; h.y = sm.y; h.z = sm.z; h.along = sm.s; h.lastAlong = sm.s; h.speed = 30;
        window.__nfAdvance(0.2, "idle");
        return { ok: true, phase: s.phase, place: s.race.place, mode: s.result && s.result.mode };
      });
      const pwOver = await page.waitForSelector("text=Run it again", { timeout: 30000 }).then(() => true).catch(() => false);
      const pwCard = await page.evaluate(() => {
        const card = document.querySelector(".nf-overlay .nf-card");
        const best = (card?.querySelector(".nf-best")?.textContent || "").trim();
        const body = (card?.textContent || "").replace(best, "").replace(/\s+/g, " ").trim();
        return { text: body, best, title: (card?.querySelector(".nf-title-sm")?.textContent || "").trim() };
      });
      check(P, "Pine Woods finish -> results: place, Pine Woods 4.4 km, course race best, no Wave text", pwOver && pwFin.ok && pwFin.mode === "race" && /^(1st|2nd|3rd|4th)$/.test(pwCard.title) && /Pine Woods · 4\.4 km course/.test(pwCard.text) && !/wave/i.test(pwCard.text) && /^Pine Woods best P[1-4] · \d+:\d{2}/.test(pwCard.best), JSON.stringify({ pwFin, pwCard }));
      creditsBefore = (await cardBank()).credits;
      await page.screenshot({ path: `${SHOTS}/${P}-woods-results.png` });
      await page.click("button:has-text('Title')");
      await page.waitForSelector(".nf-carpick");
      // ---- Open Highway (LEVELS/04, openhighway-v1): authored 5200 m race on Art's highway kit. Title blurb, start,
      // OH-0 / OH-3 Pump Stop / OH-4 Fork A (main side) / OH-5 Mesa Cut / OH-9 Dry Lake draws, desert floor + far
      // backdrop, finish -> results. Then back to Pine Woods.
      {
        await page.click("[aria-label='Next stage']");
        const ohStage = await page.textContent(".nf-stagepick .nf-carpick-name");
        const ohLede = await page.evaluate(() => { const e = document.querySelector(".nf-menu .nf-lede"); return { mode: e?.getAttribute("data-mode"), text: (e?.textContent || "").trim() }; });
        check(P, "Open Highway title shows the race blurb", ohStage === "Open Highway" && ohLede.mode === "race" && /^Race six rivals to the finish\./.test(ohLede.text), JSON.stringify({ ohStage, ohLede }));
        await page.click(".nf-btn");
        await page.waitForSelector(".nf-hud");
        await page.evaluate(() => window.__nfSkipRollout());
        await page.waitForFunction(() => !window.__nfRollout().active && window.__nfCar().source === "glb", null, { timeout: 120000 });
        const ohStart = await page.evaluate(() => { const a = window.__nf.cars[0].along; window.__nfAdvance(2, ["KeyW"]); const s = window.__nf; return { m: s.cars[0].along - a, stage: s.stageId, armed: s.race.armed, dist: s.race.dist, rivals: s.cars.filter((c) => c.racer && c.alive).length, wave: s.wave, phase: s.phase, lives: s.lives, authored: s.track.authored }; });
        check(P, "Open Highway start: race armed at 5200 m on the authored course, 6 rivals, no waves, drives", ohStart.stage === "highway" && ohStart.armed && ohStart.dist === 5200 && ohStart.authored && ohStart.rivals === 6 && ohStart.wave === 0 && ohStart.phase === "playing" && ohStart.m > 10 && ohStart.lives === 3, JSON.stringify(ohStart));
        const ohAt = (raceS, lat) => probeAt(page, P, raceS, lat, -6, "hw");
        const ohDraws = { oh0: await ohAt(60, 3), oh3: await ohAt(1740, 3), oh4: await ohAt(2140, -6), oh5: await ohAt(2600, 3), oh9: await ohAt(4300, 3) };
        await page.screenshot({ path: `${SHOTS}/${P}-highway-oh9.png` });
        for (const [k, d] of Object.entries(ohDraws)) console.log(`DRAW [${P}] highway ${k}: ${d.draws} draws, ${d.tris} tris, patches ${d.hw.patches}, far ${d.hw.far}`);
        const ohWorst = Math.max(...Object.values(ohDraws).map((d) => d.draws));
        // openhighway-v2: floor patches stay off the OH-9 salt pans, so the lake stop carries ~18-21 (was > 20)
        check(P, `Open Highway scenery streams, desert floor + far backdrop, draws under the ceiling at OH-0 / OH-3 / OH-4 / OH-5 / OH-9 (${P === "phone" ? "≤160" : "logged"})`, Object.values(ohDraws).every((d) => d.stage === "highway" && d.cityChunks >= 4 && d.framed && d.draws > 20 && d.hw.patches > 10 && d.hw.far && d.hw.rotors === 6 && d.hero.alive) && drawGate(P, ohWorst), JSON.stringify(ohDraws));
        // week-i-port Task 1b (David): at OH-5 the Mesa Cut walls are the dedicated rock-cut shell (terrain material, no texture)
        // plus the lamp fixtures; no live mesh carries the kit tunnel shell / white strips or a road / lane-paint / atlas material
        {
          const tun = ohDraws.oh5.hw.tunnel || [];
          const shell = tun.filter((t) => t.pieces.includes("mesa_tunnel_shell")), lamps = tun.filter((t) => t.pieces.includes("mesa_tunnel_lamps"));
          const bad = tun.filter((t) => t.map || /road|paint|lane|city|kit|asphalt/i.test(t.mat) || t.pieces.some((n) => /tunnel_40|tunnel_light_strip/.test(n)));
          check(P, "Open Highway Mesa Cut: tunnel walls on their own rock-cut wall material + lamp fixtures, never the road / lane material", shell.length > 0 && lamps.length > 0 && bad.length === 0 && shell.every((t) => t.mat === "highway_terrain") && lamps.every((t) => t.mat === "highway_tunnel_lamps"), JSON.stringify(tun));
        }
        // BN-18 (openhighway-v2): the right deck is cut at 2260-2296 (road + riverbed cut boxes live) and a slow hero rolling
        // into the gap falls and gets the off-road reset: lat -6 (main side), ~12 m back, hull / lives kept
        const ohGap = await page.evaluate(() => {
          const s = window.__nf, h = s.cars[0];
          const smp = (a) => s.track.samples[Math.round(a / 2) - s.track.first];
          const p = smp(s.race.originAlong + 2266);
          if (!p) return { ok: false, why: "no sample" };
          s.hitstop = 0; h.alive = true; h.invuln = 0; h.lat = 0; if (s.up) s.up.shieldT = 0;
          h.x = p.x + p.rx * 6.4; h.z = p.z + p.rz * 6.4; h.y = p.y; h.vy = 0; h.along = p.s; h.lastAlong = p.s; h.speed = 14; h.lane = 6.4;
          const hp = h.hp, lives = s.lives, from = h.along;
          let reset = null, minY = h.y;
          for (let i = 0; i < 240 && !reset; i++) {
            const a = h.along; s.hitstop = 0; window.__nfAdvance(1 / 60, []); minY = Math.min(minY, h.y);
            if (h.along < a - 5) { const q = smp(h.along); reset = { back: Math.round(a - h.along), lat: q ? +(((h.x - q.x) * q.rx + (h.z - q.z) * q.rz)).toFixed(2) : null, hp: h.hp, lives: s.lives, alive: h.alive }; }
          }
          return { ok: true, hw: window.__nfHighway(), hp, lives, minY: +minY.toFixed(1), phase: s.phase, end: { along: Math.round(h.along - s.race.originAlong), y: +h.y.toFixed(1), speed: +h.speed.toFixed(1) }, reset };
        });
        check(P, "Open Highway BN-18: gap cut on the right deck + riverbed live; a slow hero falls in and is reset to the main side, hull / lives kept", ohGap.ok && ohGap.hw.gapCut && ohGap.hw.bedCut && ohGap.reset && ohGap.reset.alive && Math.abs(ohGap.reset.lat - -6) <= 1 && ohGap.reset.back >= 6 && ohGap.reset.back <= 30 && ohGap.reset.hp === ohGap.hp && ohGap.reset.lives === ohGap.lives && ohGap.minY < -2, JSON.stringify(ohGap));
        await page.evaluate(() => { window.__nf.hitstop = 0; });
        const ohFin = await page.evaluate(() => {
          const s = window.__nf, h = s.cars[0];
          h.alive = true; h.invuln = 0; if (s.up) s.up.shieldT = 0; h.hp = Math.max(h.hp, 1);
          for (let g = 0; g < 20 && !s.track.samples[Math.round((s.race.originAlong + s.race.dist + 6) / 2) - s.track.first]; g++) {
            const last = s.track.samples[s.track.samples.length - 40];
            h.x = last.x; h.y = last.y; h.z = last.z; h.along = last.s; h.lastAlong = last.s; h.speed = 36; h.invuln = 1e9;
            window.__nfAdvance(0.02, ["KeyW"]);
          }
          h.invuln = 0;
          const sm = s.track.samples[Math.round((s.race.originAlong + s.race.dist + 6) / 2) - s.track.first];
          if (!sm) return { ok: false };
          h.x = sm.x; h.y = sm.y; h.z = sm.z; h.along = sm.s; h.lastAlong = sm.s; h.speed = 30;
          window.__nfAdvance(0.2, "idle");
          return { ok: true, phase: s.phase, place: s.race.place, mode: s.result && s.result.mode };
        });
        const ohOver = await page.waitForSelector("text=Run it again", { timeout: 30000 }).then(() => true).catch(() => false);
        const ohCard = await page.evaluate(() => {
          const card = document.querySelector(".nf-overlay .nf-card");
          const best = (card?.querySelector(".nf-best")?.textContent || "").trim();
          const body = (card?.textContent || "").replace(best, "").replace(/\s+/g, " ").trim();
          return { text: body, best, title: (card?.querySelector(".nf-title-sm")?.textContent || "").trim() };
        });
        check(P, "Open Highway finish -> results: place, Open Highway 5.2 km, no Wave text", ohOver && ohFin.ok && ohFin.mode === "race" && /^(1st|2nd|3rd|4th)$/.test(ohCard.title) && /Open Highway · 5\.2 km course/.test(ohCard.text) && !/wave/i.test(ohCard.text), JSON.stringify({ ohFin, ohCard }));
        creditsBefore = (await cardBank()).credits;
        await page.click("button:has-text('Title')");
        await page.waitForSelector(".nf-carpick");
        // ---- Industrial Port (LEVELS/05, week-i-port): authored 4600 m race. Title blurb, start, IP-2 canyon / IP-4 tops /
        // IP-6 crane alley / IP-7 Long Shed / IP-9 quay draws (procedural port scenery), crane loads + telegraph shadows,
        // shed roof hidden inside, FL2 forklift drawn, finish -> results. Then back to Open Highway.
        {
          await page.click("[aria-label='Next stage']");
          const ipStage = await page.textContent(".nf-stagepick .nf-carpick-name");
          const ipLede = await page.evaluate(() => { const e = document.querySelector(".nf-menu .nf-lede"); return { mode: e?.getAttribute("data-mode"), text: (e?.textContent || "").trim() }; });
          check(P, "Industrial Port title shows the race blurb", ipStage === "Industrial Port" && ipLede.mode === "race" && /^Race six rivals to the finish\./.test(ipLede.text), JSON.stringify({ ipStage, ipLede }));
          await page.click(".nf-btn");
          await page.waitForSelector(".nf-hud");
          await page.evaluate(() => window.__nfSkipRollout());
          await page.waitForFunction(() => !window.__nfRollout().active && window.__nfCar().source === "glb", null, { timeout: 120000 });
          const ipStart = await page.evaluate(() => { const a = window.__nf.cars[0].along; window.__nfAdvance(2, ["KeyW"]); const s = window.__nf; return { m: s.cars[0].along - a, stage: s.stageId, armed: s.race.armed, dist: s.race.dist, rivals: s.cars.filter((c) => c.racer && c.alive).length, wave: s.wave, phase: s.phase, authored: s.track.authored }; });
          check(P, "Industrial Port start: race armed at 4600 m on the authored course, 6 rivals, no waves, drives", ipStart.stage === "port" && ipStart.armed && ipStart.dist === 4600 && ipStart.authored && ipStart.rivals === 6 && ipStart.wave === 0 && ipStart.phase === "playing" && ipStart.m > 10, JSON.stringify(ipStart));
          const ipAt = async (raceS, lat) => ({ ...(await ohAt(raceS, lat)), port: await page.evaluate(() => window.__nfPort()), y: await page.evaluate(() => +window.__nf.cars[0].y.toFixed(2)) });
          // FL2 spawns while the hero is 120-300 m short of 2600: pass 2400 first so it is alive in the shed
          const ipDraws = { ip2: await ipAt(900, 0), ip4: await ipAt(1500, 6), ip6: await ipAt(2200, 3), pre7: await ipAt(2400, 3), ip7: await ipAt(2640, -3), ip9: await ipAt(3500, 3), ip10: await ipAt(4150, 0) };
          await page.screenshot({ path: `${SHOTS}/${P}-port-ip10.png` });
          for (const [k, d] of Object.entries(ipDraws)) console.log(`DRAW [${P}] port ${k}: ${d.draws} draws, ${d.tris} tris, chunks ${d.port.chunks}, loads ${d.port.loads.length}, forklifts ${d.port.forklifts}`);
          const ipWorst = Math.max(...Object.values(ipDraws).map((d) => d.draws));
          const ipTris = Math.max(...Object.values(ipDraws).map((d) => d.tris));
          check(P, `Industrial Port scenery streams (procedural port pieces + yard), draws under the ceiling at IP-2 / IP-4 / IP-6 / IP-7 / IP-9 / IP-10 (${P === "phone" ? "≤160" : "tris ≤250k"})`, Object.values(ipDraws).every((d) => d.stage === "port" && d.cityChunks >= 3 && d.framed && d.draws > 20 && d.port.pieces.port_props >= 3 && d.hero.alive) && drawGate(P, ipWorst) && (P === "phone" || ipTris <= 250000), JSON.stringify(Object.fromEntries(Object.entries(ipDraws).map(([k, d]) => [k, { draws: d.draws, tris: d.tris, chunks: d.port.chunks, pieces: d.port.pieces, loads: d.port.loads, roofHidden: d.port.roofHidden, forklifts: d.port.forklifts, y: d.y }]))));
          check(P, "Industrial Port pieces: canyon containers + crane at IP-2, Fork A tops (hero at 5.2 m), crane loads posed, oil decals, Long Shed roof hidden inside / shown outside, FL2 drawn in the shed",
            ipDraws.ip2.port.pieces.port_container_12 > 0 && ipDraws.ip2.port.pieces.port_sts_crane > 0 && ipDraws.ip2.port.loads.some((l) => l.id === "CS1") &&
            Math.abs(ipDraws.ip4.y - 5.2) <= 0.15 && ipDraws.ip4.port.pieces.port_parapet_4m > 0 && ipDraws.ip4.port.loads.some((l) => l.id === "CS-T") &&
            ipDraws.ip6.port.loads.some((l) => l.id === "CS2") && ipDraws.ip2.port.pieces.port_oil_decal > 0 &&
            ipDraws.ip7.port.roofHidden && ipDraws.ip7.port.roofs > 0 && !ipDraws.pre7.port.roofHidden && ipDraws.ip7.port.forklifts >= 1 && ipDraws.ip9.port.pieces.port_bollard > 0,
            JSON.stringify({ ip2: ipDraws.ip2.port, ip4y: ipDraws.ip4.y, ip7: { roofHidden: ipDraws.ip7.port.roofHidden, roofs: ipDraws.ip7.port.roofs, forklifts: ipDraws.ip7.port.forklifts }, pre7: ipDraws.pre7.port.roofHidden }));
          // BN-19 telegraph: step the race clock through a CS4 cycle at IP-10; the shadow shows in the telegraph / sweep and is gone when idle
          // (the port frame poses the loads on render, so step the sim and let a frame draw between reads)
          const ipTel = {};
          await page.evaluate(() => { const h = window.__nf.cars[0]; window.__ipHold = { a: h.along, x: h.x, z: h.z }; });
          for (let i = 0; i < 70; i++) {
            const l = await page.evaluate(() => new Promise((r) => {
              const s = window.__nf, h = s.cars[0], k = window.__ipHold;
              s.hitstop = 0; h.invuln = 1e9; h.speed = 0; h.x = k.x; h.z = k.z; h.along = k.a; h.lastAlong = k.a;
              window.__nfAdvance(0.1, "idle"); s.hitstop = 1e9;
              requestAnimationFrame(() => requestAnimationFrame(() => r(window.__nfPort().loads.find((x) => x.id === "CS4") || null)));
            }));
            if (l) ipTel[l.state] = Math.max(ipTel[l.state] ?? 0, l.shadow);
          }
          await page.evaluate(() => { window.__nf.cars[0].invuln = 0; });
          check(P, "Industrial Port BN-19: crane shadow telegraph shows before / during the sweep, never while idle", (ipTel.telegraph ?? 0) > 0.5 && (ipTel.active ?? 0) > 0.5 && (ipTel.idle ?? 1) === 0, JSON.stringify(ipTel));
          await page.evaluate(() => { window.__nf.hitstop = 0; });
          const ipFin = await page.evaluate(() => {
            const s = window.__nf, h = s.cars[0];
            h.alive = true; h.invuln = 0; if (s.up) s.up.shieldT = 0; h.hp = Math.max(h.hp, 1);
            for (let g = 0; g < 20 && !s.track.samples[Math.round((s.race.originAlong + s.race.dist + 6) / 2) - s.track.first]; g++) {
              const last = s.track.samples[s.track.samples.length - 40];
              h.x = last.x; h.y = last.y; h.z = last.z; h.along = last.s; h.lastAlong = last.s; h.speed = 36; h.invuln = 1e9;
              window.__nfAdvance(0.02, ["KeyW"]);
            }
            h.invuln = 0;
            const sm = s.track.samples[Math.round((s.race.originAlong + s.race.dist + 6) / 2) - s.track.first];
            if (!sm) return { ok: false };
            h.x = sm.x; h.y = sm.y; h.z = sm.z; h.along = sm.s; h.lastAlong = sm.s; h.speed = 30;
            window.__nfAdvance(0.2, "idle");
            return { ok: true, phase: s.phase, place: s.race.place, mode: s.result && s.result.mode };
          });
          const ipOver = await page.waitForSelector("text=Run it again", { timeout: 30000 }).then(() => true).catch(() => false);
          const ipCard = await page.evaluate(() => {
            const card = document.querySelector(".nf-overlay .nf-card");
            const best = (card?.querySelector(".nf-best")?.textContent || "").trim();
            const body = (card?.textContent || "").replace(best, "").replace(/\s+/g, " ").trim();
            return { text: body, best, title: (card?.querySelector(".nf-title-sm")?.textContent || "").trim() };
          });
          check(P, "Industrial Port finish -> results: place, Industrial Port 4.6 km, no Wave text", ipOver && ipFin.ok && ipFin.mode === "race" && /^(1st|2nd|3rd|4th)$/.test(ipCard.title) && /Industrial Port · 4\.6 km course/.test(ipCard.text) && !/wave/i.test(ipCard.text), JSON.stringify({ ipFin, ipCard }));
          creditsBefore = (await cardBank()).credits;
          await page.click("button:has-text('Title')");
          await page.waitForSelector(".nf-carpick");
          // (summit MP-11 is the open snowfield 120 m before the course end: station + gantry only, 1-2 built chunks there)
          // ---- Mountain Pass (LEVELS/06, week-i-pass): authored 4800 m race. Title blurb, start, MP-0 lodge / MP-2 shed (roof
          // hidden inside) / MP-3 hairpin / MP-8 switchbacks / MP-9 lake / MP-10 Summit Leap / MP-11 station draws (procedural
          // mountain scenery + streamed terrain tiles + peak backdrops), rockfall telegraph, finish -> results. Back to the port.
          {
            await page.click("[aria-label='Next stage']");
            const mpStage = await page.textContent(".nf-stagepick .nf-carpick-name");
            const mpLede = await page.evaluate(() => { const e = document.querySelector(".nf-menu .nf-lede"); return { mode: e?.getAttribute("data-mode"), text: (e?.textContent || "").trim() }; });
            check(P, "Mountain Pass title shows the race blurb", mpStage === "Mountain Pass" && mpLede.mode === "race" && /^Race six rivals to the finish\./.test(mpLede.text), JSON.stringify({ mpStage, mpLede }));
            await page.click(".nf-btn");
            await page.waitForSelector(".nf-hud");
            await page.evaluate(() => window.__nfSkipRollout());
            await page.waitForFunction(() => !window.__nfRollout().active && window.__nfCar().source === "glb", null, { timeout: 120000 });
            const mpStart = await page.evaluate(() => { const a = window.__nf.cars[0].along; window.__nfAdvance(2, ["KeyW"]); const s = window.__nf; return { m: s.cars[0].along - a, stage: s.stageId, armed: s.race.armed, dist: s.race.dist, rivals: s.cars.filter((c) => c.racer && c.alive).length, wave: s.wave, phase: s.phase, authored: s.track.authored }; });
            check(P, "Mountain Pass start: race armed at 4800 m on the authored course, 6 rivals, no waves, drives", mpStart.stage === "pass" && mpStart.armed && mpStart.dist === 4800 && mpStart.authored && mpStart.rivals === 6 && mpStart.wave === 0 && mpStart.phase === "playing" && mpStart.m > 10, JSON.stringify(mpStart));
            const mpAt = (raceS, lat) => probeAt(page, P, raceS, lat, -6, "pass");
            const mpDraws = {}; for (const [k, [sAt, lat]] of Object.entries(MP_SPOTS)) mpDraws[k] = await mpAt(sAt, lat);
            await page.screenshot({ path: `${SHOTS}/${P}-pass-mp3.png` });
            for (const [k, d] of Object.entries(mpDraws)) console.log(`DRAW [${P}] pass ${k}: ${d.draws} draws, ${d.tris} tris, chunks ${d.pass.chunks}, tiles ${d.pass.tiles}`);
            const mpWorst = Math.max(...Object.values(mpDraws).map((d) => d.draws));
            const mpTris = Math.max(...Object.values(mpDraws).map((d) => d.tris));
            check(P, `Mountain Pass scenery streams (procedural mountain pieces + terrain tiles + peaks), draws under the ceiling at MP-0 / MP-2 / MP-3 / MP-8 / MP-9 / MP-10 / MP-11 (${P === "phone" ? "≤160" : "tris ≤250k"})`,
              Object.entries(mpDraws).every(([k, d]) => mpSpotOk(k, d)) && drawGate(P, mpWorst) && (P === "phone" || mpTris <= 250000),
              JSON.stringify(Object.fromEntries(Object.entries(mpDraws).map(([k, d]) => [k, { stage: d.stage, cityChunks: d.cityChunks, draws: d.draws, tris: d.tris, chunks: d.pass.chunks, tiles: d.pass.tiles, framed: d.framed, peaks: d.pass.peaks, alive: d.hero.alive, pieces: d.pass.pieces, roofHidden: d.pass.roofHidden }]))));
            check(P, "Mountain Pass pieces: lodge at MP-0, shed roof hidden inside / shown outside, chevrons + ice at Eagle Bend, frozen lake at MP-9, ski-jump structure at MP-10, summit station at MP-11",
              mpDraws.mp0.pass.pieces.mtn_lodge > 0 && mpDraws.mp2.pass.roofHidden && mpDraws.mp2.pass.roofs > 0 && !mpDraws.pre2.pass.roofHidden && mpDraws.mp3.pass.pieces.mtn_chevron_board > 0 && mpDraws.mp3.pass.pieces.mtn_ice_decal > 0 &&
              mpDraws.mp9.pass.pieces.mtn_frozen_lake_40 > 0 && mpDraws.mp10.pass.pieces.mtn_skijump_structure > 0 && mpDraws.mp11.pass.pieces.mtn_summit_station > 0,
              JSON.stringify({ mp0: mpDraws.mp0.pass.pieces, mp2: mpDraws.mp2.pass.roofHidden, pre2: mpDraws.pre2.pass.roofHidden, mp3: mpDraws.mp3.pass.pieces, mp9: mpDraws.mp9.pass.pieces, mp10: mpDraws.mp10.pass.pieces, mp11: mpDraws.mp11.pass.pieces }));
            // BN-19 rockfall: hold the hero at the RF1 mouth and step the race clock; a rock shows its shadow while falling, then lands (no shadow)
            await mpAt(1360, 9);
            const mpRock = { falling: 0, down: 0, shadowWhileFalling: true, shadowAfter: false };
            await page.evaluate(() => { const h = window.__nf.cars[0]; window.__mpHold = { a: h.along, x: h.x, z: h.z }; });
            for (let i = 0; i < 60; i++) {
              const rs = await page.evaluate(() => new Promise((r) => {
                const s = window.__nf, h = s.cars[0], k = window.__mpHold;
                s.hitstop = 0; h.invuln = 1e9; h.speed = 0; h.x = k.x; h.z = k.z; h.along = k.a; h.lastAlong = k.a;
                window.__nfAdvance(0.1, "idle"); s.hitstop = 1e9;
                requestAnimationFrame(() => requestAnimationFrame(() => r(window.__nfPass().rocks)));
              }));
              for (const r of rs) {
                if (r.state === "falling") { mpRock.falling++; if (!r.shadow) mpRock.shadowWhileFalling = false; }
                if (r.state === "down") { mpRock.down++; if (r.shadow) mpRock.shadowAfter = true; }
              }
            }
            await page.evaluate(() => { window.__nf.cars[0].invuln = 0; window.__nf.hitstop = 0; });
            check(P, "Mountain Pass BN-19: rockfall shadow telegraph while a rock falls, landed rock drawn without it", mpRock.falling > 2 && mpRock.down > 2 && mpRock.shadowWhileFalling && !mpRock.shadowAfter, JSON.stringify(mpRock));
            const mpFin = await page.evaluate(() => {
              const s = window.__nf, h = s.cars[0];
              h.alive = true; h.invuln = 0; if (s.up) s.up.shieldT = 0; h.hp = Math.max(h.hp, 1);
              for (let g = 0; g < 20 && !s.track.samples[Math.round((s.race.originAlong + s.race.dist + 6) / 2) - s.track.first]; g++) {
                const last = s.track.samples[s.track.samples.length - 40];
                h.x = last.x; h.y = last.y; h.z = last.z; h.along = last.s; h.lastAlong = last.s; h.speed = 36; h.invuln = 1e9;
                window.__nfAdvance(0.02, ["KeyW"]);
              }
              h.invuln = 0;
              const sm = s.track.samples[Math.round((s.race.originAlong + s.race.dist + 6) / 2) - s.track.first];
              if (!sm) return { ok: false };
              h.x = sm.x; h.y = sm.y; h.z = sm.z; h.along = sm.s; h.lastAlong = sm.s; h.speed = 30;
              window.__nfAdvance(0.2, "idle");
              return { ok: true, phase: s.phase, place: s.race.place, mode: s.result && s.result.mode };
            });
            const mpOver = await page.waitForSelector("text=Run it again", { timeout: 30000 }).then(() => true).catch(() => false);
            const mpCard = await page.evaluate(() => {
              const card = document.querySelector(".nf-overlay .nf-card");
              const best = (card?.querySelector(".nf-best")?.textContent || "").trim();
              const body = (card?.textContent || "").replace(best, "").replace(/\s+/g, " ").trim();
              return { text: body, best, title: (card?.querySelector(".nf-title-sm")?.textContent || "").trim() };
            });
            check(P, "Mountain Pass finish -> results: place, Mountain Pass 4.8 km, no Wave text", mpOver && mpFin.ok && mpFin.mode === "race" && /^(1st|2nd|3rd|4th)$/.test(mpCard.title) && /Mountain Pass · 4\.8 km course/.test(mpCard.text) && !/wave/i.test(mpCard.text), JSON.stringify({ mpFin, mpCard }));
            creditsBefore = (await cardBank()).credits;
            await page.click("button:has-text('Title')");
            await page.waitForSelector(".nf-carpick");
            await page.click("[aria-label='Previous stage']");
          }
          await page.click("[aria-label='Previous stage']");
        }
        await page.click("[aria-label='Previous stage']");
      }
      await page.click("[aria-label='Previous stage']");
    }
    await page.click("[aria-label='Previous stage']");
    const backTo = await page.textContent(".nf-stagepick .nf-carpick-name");
    // wave stages keep the old best line (score/wave record), not a course race best
    const clBest = await page.evaluate(() => (document.querySelector(".nf-best")?.textContent || "").trim());
    check(P, "Classic Night title keeps the wave best line (Best … pts), not a race best", /^(Best \d+ pts|No record yet)/.test(clBest) && !/ best P\d/.test(clBest), clBest);
    await page.click(".nf-btn");
    await page.waitForSelector(".nf-hud");
    await page.evaluate(() => window.__nfSkipRollout());
    await page.waitForFunction(() => !window.__nfRollout().active && window.__nfCar().source === "glb", null, { timeout: 120000 });
    const cl = await page.evaluate(() => ({ stage: window.__nfStageInfo().stage, armed: window.__nf.race.armed }));
    check(P, "after Coast Road, Classic Night still runs waves (scenery released, no race armed)", backTo === "Classic Night" && cl.stage === "classic" && !cl.armed, JSON.stringify({ backTo, cl }));
  }
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
if (!iso && (!process.env.NF_ONLY || ["desktop", "folderonly"].includes(process.env.NF_ONLY))) {
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
console.log(`\n${results.length - failed}/${results.length} checks passed${ONLY ? ` (SMOKE_ONLY=${ONLY}${iso ? ", isolated" : `, ${skipped} skipped`})` : ""}`);
process.exit(failed ? 1 : 0);
