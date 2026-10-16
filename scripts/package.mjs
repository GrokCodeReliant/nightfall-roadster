// Packages dist/ into a static folder + single-file HTML + zip (file:// safe: classic deferred script).
import fs from "node:fs";
import { execSync } from "node:child_process";
const dist = "dist";
const tag = process.env.NF_TAG || "m5a";
const out = process.env.NF_OUT || `/workspace/studio/nightfall_roadster/v02_${tag}`;
const folder = out + "/nightfall-roadster";
fs.rmSync(folder, { recursive: true, force: true });
fs.mkdirSync(folder + "/assets", { recursive: true });
const html = fs.readFileSync(dist + "/index.html", "utf8");
const js = html.match(/<script[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/);
const css = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)">/);
for (const f of fs.readdirSync(dist + "/assets")) {
  if (fs.statSync(`${dist}/assets/${f}`).isDirectory()) continue;
  const t = fs.readFileSync(`${dist}/assets/${f}`, "utf8").replace(/revealOrder/g, "rvlOrder");
  fs.writeFileSync(`${folder}/assets/${f}`, t);
}
// binary public assets (the Roadster GLBs) are copied byte for byte
if (fs.existsSync(dist + "/assets/v02")) fs.cpSync(dist + "/assets/v02", folder + "/assets/v02", { recursive: true });
const page = html
  .replace(js[0], "")
  .replace(css[0], `<link rel="stylesheet" href="./${css[1]}">`)
  .replace("</body>", `<script defer src="./${js[1]}"></script>\n</body>`);
fs.writeFileSync(folder + "/index.html", page);
const jsTxt = fs.readFileSync(`${folder}/${js[1]}`, "utf8").replace(/<\/script/gi, "<\\/script");
// single file: both Roadster LODs inlined as base64 data URIs (world.ts reads window.__NF_GLB first)
const glbDir = dist + "/assets/v02/car";
const glbInline = "window.__NF_GLB=" + JSON.stringify(
  Object.fromEntries(["phone", "hero"].filter((l) => fs.existsSync(`${glbDir}/roadster_${l}.glb`)).map((l) => [l, "data:model/gltf-binary;base64," + fs.readFileSync(`${glbDir}/roadster_${l}.glb`).toString("base64")])),
) + ";";
const cssTxt = fs.readFileSync(`${folder}/${css[1]}`, "utf8");
const single = html
  .replace(js[0], "")
  .replace(css[0], () => `<style>${cssTxt}</style>`)
  .replace("</body>", () => `<script>${glbInline}</script>\n<script>${jsTxt}</script>\n</body>`);
fs.writeFileSync(`${out}/nightfall-roadster-v02-${tag}.html`, single);
fs.rmSync(`${out}/nightfall-roadster-v02-${tag}.zip`, { force: true });
execSync(`cd "${out}" && python3 -c "import shutil,zipfile,os\nz=zipfile.ZipFile('nightfall-roadster-v02-${tag}.zip','w',zipfile.ZIP_DEFLATED)\nfor r,_,fs in os.walk('nightfall-roadster'):\n  [z.write(os.path.join(r,f)) for f in fs]\nz.write('nightfall-roadster-v02-${tag}.html')"`);
console.log("packaged", out, fs.statSync(`${out}/nightfall-roadster-v02-${tag}.html`).size);
