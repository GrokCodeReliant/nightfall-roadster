// Packages dist/ into a static folder + single-file HTML + zip (file:// safe: classic deferred script).
import fs from "node:fs";
import { execSync } from "node:child_process";
const dist = "dist";
const out = process.env.NF_OUT || "/workspace/studio/nightfall_roadster/v02_m2";
const folder = out + "/nightfall-roadster";
fs.rmSync(folder, { recursive: true, force: true });
fs.mkdirSync(folder + "/assets", { recursive: true });
const html = fs.readFileSync(dist + "/index.html", "utf8");
const js = html.match(/<script[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/);
const css = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)">/);
for (const f of fs.readdirSync(dist + "/assets")) {
  const t = fs.readFileSync(`${dist}/assets/${f}`, "utf8").replace(/revealOrder/g, "rvlOrder");
  fs.writeFileSync(`${folder}/assets/${f}`, t);
}
const page = html
  .replace(js[0], "")
  .replace(css[0], `<link rel="stylesheet" href="./${css[1]}">`)
  .replace("</body>", `<script defer src="./${js[1]}"></script>\n</body>`);
fs.writeFileSync(folder + "/index.html", page);
const jsTxt = fs.readFileSync(`${folder}/${js[1]}`, "utf8").replace(/<\/script/gi, "<\\/script");
const cssTxt = fs.readFileSync(`${folder}/${css[1]}`, "utf8");
const single = html
  .replace(js[0], "")
  .replace(css[0], () => `<style>${cssTxt}</style>`)
  .replace("</body>", () => `<script>${jsTxt}</script>\n</body>`);
fs.writeFileSync(out + "/nightfall-roadster-v02-m2.html", single);
fs.rmSync(out + "/nightfall-roadster-v02-m2.zip", { force: true });
execSync(`cd "${out}" && python3 -c "import shutil,zipfile,os\nz=zipfile.ZipFile('nightfall-roadster-v02-m2.zip','w',zipfile.ZIP_DEFLATED)\nfor r,_,fs in os.walk('nightfall-roadster'):\n  [z.write(os.path.join(r,f)) for f in fs]\nz.write('nightfall-roadster-v02-m2.html')"`);
console.log("packaged", out, fs.statSync(out + "/nightfall-roadster-v02-m2.html").size);
