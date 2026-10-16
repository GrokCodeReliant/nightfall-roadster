// Headless e2e for the packaged single-file build (desktop + phone 390x844).
// boots, drives, fires, an enemy dies, a wave advances, a life is lost, game over, restart; 0 console errors.
// Also proves the HUD layout matches v0.1 (same nf-* boxes) and saves screenshots.
import { chromium, devices } from "playwright";
import fs from "node:fs";

const ROOT = "/workspace/studio/nightfall_roadster";
const BUILD = process.env.NF_BUILD || `${ROOT}/v02_m3b/nightfall-roadster-v02-m3b.html`;
const V01 = `${ROOT}/release/nightfall-roadster-single.html`;
const SHOTS = process.env.NF_SHOTS || `${ROOT}/v02_m3b/screenshots`;
fs.mkdirSync(SHOTS, { recursive: true });

const ONLY = process.env.NF_ONLY;
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

// run the real sim forward (autopilot "hunt", "idle" or explicit keys) until cond() or timeout (game seconds)
async function runUntil(page, keys, cond, secs) {
  return page.evaluate(([keys, cond, secs]) => {
    const f = new Function("sim", "return (" + cond + ")");
    for (let i = 0; i < secs * 20; i++) {
      window.__nfAdvance(0.05, keys);
      if (f(window.__nf)) return true;
      if (window.__nf.phase !== "playing") return false;
    }
    return false;
  }, [keys, cond, secs]);
}

async function capture(page, path, settleMs = 3500) {
  await page.evaluate(() => { window.__nf.hitstop = 60; });
  await page.waitForTimeout(settleMs);
  await page.screenshot({ path });
  await page.evaluate(() => { window.__nf.hitstop = 0; });
}

async function flat(page, len = 230) {
  await runUntil(page, "cruise", `window.__nfStage.flat(${len})`, 40);
}

async function clearField(page) {
  await page.evaluate(() => {
    const sim = window.__nf;
    for (const c of sim.cars.slice(1)) { c.alive = false; c.y = -40; }
    for (const s of sim.shots) s.alive = false;
    for (const m of sim.mines) m.alive = false;
    for (const p of sim.pickups) p.alive = false;
    sim.queue = [];
    sim.lull = 1e9;
    sim.cars[0].hp = sim.cars[0].maxHp;
    sim.cars[0].invuln = 0;
    sim.toastT = 0;
  });
}

async function start(page, url) {
  await page.goto(url);
  await page.waitForSelector(".nf-btn", { timeout: 15000 });
  await page.click(".nf-btn");
  await page.waitForSelector(".nf-hud", { timeout: 5000 });
}

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const prof of profiles.filter((p) => !ONLY || p.name === ONLY)) {
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

  // ---------------- M3 staged scenes (real sim, staged spawns via the ?debug hook)
  const W = "cruise";
  await clearField(page);
  await runUntil(page, W, "sim.cars[0].speed > 40", 10);

  // Mine Layer
  await flat(page);
  await page.evaluate(() => { const ml = window.__nfStage.debugSpawn(window.__nf, "mine", 20, 3); ml.hold = 14; window.__mlId = ml.id; });
  const layer = await runUntil(page, W, "(() => { const c = sim.cars[window.__mlId]; const d = c.along - sim.cars[0].along; return c.alive && sim.mines.some((m) => m.alive && m.owner === c.id && m.arm <= 0) && d > 9 && d < 18; })()", 25);
  check(P, "Mine Layer lays mines", layer);
  await capture(page, `${SHOTS}/${P}-mine-layer.png`);

  // Spiker
  await flat(page);
  await clearField(page);
  await page.evaluate(() => { window.__spId = window.__nfStage.debugSpawn(window.__nf, "spiker", -5, 3).id; window.__hp0 = window.__nf.cars[0].hp; });
  const spike = await runUntil(page, W, "sim.cars[0].hp < window.__hp0 - 3 && Math.abs(sim.cars[window.__spId].along - sim.cars[0].along) < 3.6", 20);
  check(P, "Spiker grinds you for chip damage", spike);
  await capture(page, `${SHOTS}/${P}-spiker.png`);

  // Drone
  await flat(page);
  await clearField(page);
  await page.evaluate(() => { const dr = window.__nfStage.debugSpawn(window.__nf, "drone", 20, 0); dr.hold = 20; dr.holdT = 99; window.__drId = dr.id; });
  const drone = await runUntil(page, W, "(() => { const d = sim.cars[window.__drId]; const dd = d.along - sim.cars[0].along; return d.alive && dd > 16 && dd < 26 && sim.shots.some((s) => s.alive && s.owner === d.id); })()", 25);
  const alt = await page.evaluate(() => window.__nfStage.alt(window.__drId));
  check(P, "Drone flies ~6 m up and fires", drone && alt > 4, `altitude ${alt.toFixed(1)} m`);
  await capture(page, `${SHOTS}/${P}-drone.png`);
  const roster6 = await page.evaluate(() => { window.__nfStage.debugStartWave(window.__nf, 6); const q = [...window.__nf.queue]; window.__nf.queue = []; window.__nf.lull = 1e9; return q; });
  check(P, "wave 6 roster brings drones", roster6.includes("drone"), roster6.join(","));

  // Boss (wave 5)
  await flat(page);
  await clearField(page);
  await page.evaluate(() => { window.__nfStage.debugStartWave(window.__nf, 5); });
  const boss = await runUntil(page, W, "(() => { const b = sim.cars.find((c) => c.alive && c.kind === 'boss'); if (!b) return false; b.hold = 11; const d = b.along - sim.cars[0].along; window.__bossId = b.id; return sim.cars[0].grounded && window.__nfStage.flat(20) && d > 6 && d < 18 && sim.shots.some((s) => s.alive && s.owner === b.id); })()", 60);
  check(P, "Boss (Armored Hauler) spawns on wave 5 and fires", boss);
  await capture(page, `${SHOTS}/${P}-boss.png`);
  await page.evaluate(() => { const b = window.__nf.cars[window.__bossId]; b.hp = 40; for (const c of window.__nf.cars.slice(1)) if (c.id !== b.id) { c.alive = false; c.y = -40; } window.__nf.cars[0].invuln = 999; });
  const bossDead = await runUntil(page, "hunt", "!sim.cars[window.__bossId].alive && ((window.__drops = sim.pickups.filter((p) => p.alive && !p.crate).length), true)", 40);
  const drops = await page.evaluate(() => window.__drops ?? 0);
  check(P, "Boss dies and drops 3 pickups", bossDead && drops >= 3, `drops ${drops}`);
  await page.evaluate(() => { window.__nf.cars[0].invuln = 0; });

  // Pickups row + crate, then drive through
  await flat(page);
  await clearField(page);
  await page.evaluate(() => {
    const sim = window.__nf, S = window.__nfStage, h = sim.cars[0];
    sim.up.gun = 0; sim.up.rockets = 0;
    const lat = Math.max(-9, Math.min(9, S.lat()));
    const off = (d) => (lat > 0 ? lat - d : lat + d);
    S.spawnPickup(sim, "gun", h.along + 24, lat, false);
    S.spawnPickup(sim, "rockets", h.along + 34, lat, false);
    S.spawnPickup(sim, "shield", h.along + 44, lat, false);
    S.spawnPickup(sim, "repair", h.along + 62, off(6), false);
    S.spawnPickup(sim, "armor", h.along + 66, off(12), false);
    S.spawnPickup(sim, "nitro", h.along + 70, off(9), false);
    S.spawnPickup(sim, "magnet", h.along + 74, off(15), false);
    S.spawnPickup(sim, "oil", h.along + 78, off(6), false);
    S.spawnPickup(sim, "minepack", h.along + 82, off(12), false);
    S.spawnPickup(sim, null, h.along + 90, off(3), true);
  });
  await page.evaluate(() => { const sim = window.__nf; for (const p of sim.pickups) if (p.alive) { const q = p; } sim.cars[0].speed = 20; });
  await capture(page, `${SHOTS}/${P}-pickups.png`, 2500);
  await page.evaluate(() => { const sim = window.__nf, h = sim.cars[0]; for (const p of sim.pickups) if (p.alive && ["gun", "rockets", "shield"].includes(p.kind)) { p.x = p.x - (p.x - h.x) * 0; } });
  // steer onto the pickup line: the bot collects pickups when nothing is hostile
  await page.evaluate(() => { window.__nf.up.magnetT = 12; }); // magnet makes the drive-through independent of the racing line
  const got = await runUntil(page, "cruise", "sim.up.gun >= 1 && sim.up.rockets > 0 && sim.up.shieldT > 0", 10);
  const up = await page.evaluate(() => ({ gun: window.__nf.up.gun, rockets: window.__nf.up.rockets, shield: window.__nf.up.shieldT.toFixed(1) }));
  check(P, "drive-through pickups apply (gun, rockets, shield)", got, JSON.stringify(up));
  const chips = await page.evaluate(() => [...document.querySelectorAll(".nf-chip")].map((c) => c.textContent));
  await page.waitForTimeout(400);
  const chips2 = await page.evaluate(() => [...document.querySelectorAll(".nf-chip")].map((c) => c.textContent));
  check(P, "HUD upgrade chips show", chips2.some((c) => /Rockets/.test(c)) || chips.some((c) => /Rockets/.test(c)), chips2.join(", "));
  // rockets fire and home
  await page.evaluate(() => { window.__nfStage.debugSpawn(window.__nf, "gunner", 40, 6); });
  const rocket = await runUntil(page, ["KeyW", "KeyF"], "sim.shots.some((s) => s.alive && s.rocket)", 5);
  check(P, "homing rockets launch on Fire", rocket);
  await capture(page, `${SHOTS}/${P}-rockets.png`, 2000);

  // losing a life costs one tier
  await clearField(page);
  await page.evaluate(() => { const sim = window.__nf; sim.up.gun = 2; sim.up.armor = 25; sim.up.shieldT = 0; sim.cars[0].maxHp = 125; sim.cars[0].hp = 3; sim.cars[0].invuln = 0; window.__l0 = sim.lives; const c = window.__nfStage.debugSpawn(sim, "gunner", 20, 3); });
  const lostLife = await runUntil(page, "idle", "sim.lives < window.__l0", 40);
  const tier = await page.evaluate(() => ({ gun: window.__nf.up.gun, armor: window.__nf.up.armor, maxHp: window.__nf.cars[0].maxHp }));
  check(P, "death costs one upgrade tier", lostLife && tier.gun === 1 && tier.armor === 0 && tier.maxHp === 100, JSON.stringify(tier));

  // m3b camera: an enemy close behind is on screen below the car; an enemy far behind gets an edge chevron that pulses while it fires
  await clearField(page);
  await flat(page);
  await runUntil(page, "cruise", "sim.cars[0].speed > 30", 10);
  const ids = await page.evaluate(() => {
    const sim = window.__nf, S = window.__nfStage;
    const lat = S.lat();
    const near = S.debugSpawn(sim, "rammer", -10, Math.max(-9, Math.min(9, lat + 3)));
    near.ramCd = 99; near.hold = -10;
    const far = S.debugSpawn(sim, "gunner", -45, Math.max(-9, Math.min(9, lat - 4)));
    far.hold = -45; far.holdT = 99;
    return { near: near.id, far: far.id };
  });
  await page.evaluate(() => window.__nfAdvance(0.3, "cruise"));
  // freeze with the far gunner mid-burst so its chevron is hot
  await page.evaluate((id) => { const g = window.__nf.cars[id]; g.burst = 3; g.burstCd = 0.05; window.__nf.hitstop = 60; }, ids.far);
  await page.waitForTimeout(3500);
  const geo = await page.evaluate((ids) => ({ hero: window.__nfProject(0), near: window.__nfProject(ids.near), far: window.__nfProject(ids.far), fade: window.__nfFade()[ids.near] }), ids);
  check(P, "camera: enemy 10 m behind is on screen, below the car, unfaded", geo.near.on && geo.near.y > geo.hero.y + 10 && geo.fade > 0.9, `hero y ${geo.hero.y.toFixed(0)} enemy y ${geo.near.y.toFixed(0)} of ${geo.near.h}, opacity ${geo.fade.toFixed(2)}`);
  const ind = await page.evaluate(() => [...document.querySelectorAll(".nf-threat")].filter((e) => e.style.display !== "none").map((e) => ({ id: +e.dataset.id, on: e.dataset.on, hot: e.classList.contains("is-hot"), r: e.getBoundingClientRect() })));
  const farInd = ind.find((i) => i.id === ids.far);
  const nearInd = ind.find((i) => i.id === ids.near);
  check(P, "off-screen enemy behind gets an edge chevron, pulsing red while firing", !geo.far.on && !!farInd && farInd.on === "0" && farInd.hot, JSON.stringify(farInd ? { on: farInd.on, hot: farInd.hot, x: Math.round(farInd.r.x), y: Math.round(farInd.r.y) } : null));
  check(P, "visible enemy behind is marked too", !!nearInd && nearInd.on === "1");
  await page.screenshot({ path: `${SHOTS}/${P}-enemy-behind.png` });
  await page.evaluate(() => { window.__nf.hitstop = 0; });
  const noFlames = await page.evaluate(() => { window.__nfAdvance(1, ["KeyW", "Space"]); return window.__nf.cars.filter((c) => !c.hero && c.alive).every((c) => c.thrust === 0); });
  check(P, "player thrust: no enemy fires thrusters", noFlames);
  await clearField(page);
  await page.evaluate(() => { window.__nf.lull = 2; window.__nf.wave = 0; window.__nf.lives = 3; });

  // combat screenshot: wave running, an enemy tracer in the air, HUD visible
  await page.evaluate(() => window.__nfAdvance(5, "hunt"));
  let firing = false;
  for (let i = 0; i < 1200 && !firing; i++) {
    firing = await page.evaluate((i) => {
      window.__nfAdvance(0.05, "hunt");
      const sim = window.__nf;
      const hero = sim.cars[0];
      // an enemy tracer in the air, fired by an enemy that is in front of the camera
      return sim.shots.some((s) => s.alive && s.owner !== 0 && s.life < 0.8 && (() => { const c = sim.cars[s.owner]; const d = c.along - hero.along; return c.alive && d > (i > 600 ? -30 : 6) && d < 40; })());
    }, i);
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
  await flat(page, 60);
  await page.evaluate(() => { for (let i = 0; i < 400 && window.__nf.wave < 2 && window.__nf.phase === "playing"; i++) window.__nfAdvance(0.5, "hunt"); });
  const wave = await page.evaluate(() => ({ w: window.__nf.wave, phase: window.__nf.phase }));
  const dbg = await page.evaluate(() => { const s = window.__nf, h = s.cars[0]; return JSON.stringify({ q: s.queue, lull: s.lull, cd: s.spawnCd, hero: { a: h.alive, sp: h.speed.toFixed(0), al: h.along.toFixed(0) }, e: s.cars.filter((c) => c.alive && !c.hero).map((c) => `${c.kind}:${(c.along - h.along).toFixed(0)}:${c.leaving}:${c.hp}`) }); });
  check(P, "a wave advances", wave.w >= 2, `wave ${wave.w} (${wave.phase}) ${wave.w < 2 ? dbg : ""}`);
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
