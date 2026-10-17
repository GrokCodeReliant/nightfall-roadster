import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage();
p.setDefaultTimeout(120000);
p.on("pageerror", e => console.log("ERR", e)); p.on("console", m => m.type()==="error" && console.log("CERR", m.text()));
await p.goto("file:///workspace/studio/nightfall_roadster/v02_final/nightfall-roadster-v02-final.html?debug&enemylod=phone");
await p.waitForSelector(".nf-btn"); await p.waitForTimeout(8000);
await p.click(".nf-btn"); await p.waitForTimeout(2000);
await p.evaluate(()=>{ const r=window.__nfRollout(); }); 
const T = process.env.T ? +process.env.T : 0;
if (T) { await p.evaluate((T)=>{ /* jump rollout */ window.__nfRolloutSet && window.__nfRolloutSet(T); }, T); await p.waitForTimeout(6000); await p.screenshot({path:"/tmp/roll.png"}); }
await p.evaluate(()=>window.__nfSkipRollout()); await p.waitForTimeout(3000);
await p.evaluate(()=>window.__nfAdvance(4, ["KeyW"])); await p.waitForTimeout(6000);
await p.screenshot({path:"/tmp/city.png"}); console.log(JSON.stringify(await p.evaluate(()=>[window.__nfStageInfo(), window.__nfDraws()]))); await b.close();
