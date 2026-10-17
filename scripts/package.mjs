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
// release hygiene: no internal credit notes in the public build; sanitize GLB metadata (generator, extras)
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
const stripExtras = (o) => {
  if (Array.isArray(o)) o.forEach(stripExtras);
  else if (o && typeof o === "object") {
    delete o.extras;
    Object.values(o).forEach(stripExtras);
  }
};
for (const root of [dist + "/assets/v02", folder + "/assets/v02"]) {
  if (!fs.existsSync(root)) continue;
  for (const f of walk(root)) {
    // allowlist: runtime files only (README/CREDITS/notes .md, INTERNAL_*, refs/, .blend, .py ... never ship)
    if (!/\.(glb|gltf|bin|png|jpe?g|webp|ktx2|mp3|ogg|wav)$/i.test(f) || /(^|\/)(refs|INTERNAL_[^/]*)(\/|$)/i.test(f)) fs.rmSync(f);
    else if (f.endsWith(".png")) {
      // drop ancillary metadata chunks (eXIf/tEXt/iTXt/zTXt/tIME/oFFs/pHYs...); keep the image and colour chunks
      const b = fs.readFileSync(f);
      const keep = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND", "sRGB", "gAMA", "cHRM"]);
      const parts = [b.subarray(0, 8)];
      for (let i = 8; i < b.length; ) {
        const l = b.readUInt32BE(i);
        const t = b.toString("latin1", i + 4, i + 8);
        if (keep.has(t)) parts.push(b.subarray(i, i + 12 + l));
        i += 12 + l;
      }
      fs.writeFileSync(f, Buffer.concat(parts));
    } else if (f.endsWith(".glb")) {
      const b = fs.readFileSync(f);
      const jl = b.readUInt32LE(12);
      const j = JSON.parse(b.subarray(20, 20 + jl).toString("utf8"));
      stripExtras(j);
      j.asset.generator = "Grok Code Reliant studio";
      let t = Buffer.from(JSON.stringify(j), "utf8");
      const pad = (4 - (t.length % 4)) % 4;
      t = Buffer.concat([t, Buffer.alloc(pad, 0x20)]);
      const rest = b.subarray(20 + jl);
      const head = Buffer.alloc(20);
      head.writeUInt32LE(0x46546c67, 0);
      head.writeUInt32LE(2, 4);
      head.writeUInt32LE(20 + t.length + rest.length, 8);
      head.writeUInt32LE(t.length, 12);
      head.writeUInt32LE(0x4e4f534a, 16);
      fs.writeFileSync(f, Buffer.concat([head, t, rest]));
    }
  }
}
for (const root of [dist + "/assets/v02", folder + "/assets/v02"]) {
  if (!fs.existsSync(root)) continue;
  for (const d of fs.readdirSync(root, { recursive: true, withFileTypes: true })) if (d.isDirectory() && /^refs$/i.test(d.name)) fs.rmSync(`${d.parentPath ?? d.path}/${d.name}`, { recursive: true, force: true });
}
fs.writeFileSync(folder + "/CREDITS.txt", [
  "Nightfall Roadster v0.2 - credits",
  "",
  "All 3D models, textures and sounds were made by Grok Code Reliant studio.",
  "Tesla-styled vehicles (Model 3 and Roadster), the Semi rig and the Optimus robot are studio-made fan models and are not part of the CC0 Open Kit. No logos, badges or wordmarks are used.",
  "Original enemy vehicles, road and city props: planned for free release (CC0) as part of the studio's Open Kit.",
  "AI tools were used in developing this game.",
  "An unofficial fan tribute by Grok Code Reliant studio. Not affiliated with or endorsed by Tesla, Inc.",
  "",
].join("\n"));
const page = html
  .replace(js[0], "")
  .replace(css[0], `<link rel="stylesheet" href="./${css[1]}">`)
  .replace("</body>", `<script defer src="./${js[1]}"></script>\n</body>`);
fs.writeFileSync(folder + "/index.html", page);
const jsTxt = fs.readFileSync(`${folder}/${js[1]}`, "utf8").replace(/<\/script/gi, "<\\/script");
// single file: both Roadster LODs inlined as base64 data URIs (world.ts reads window.__NF_GLB first)
const glbDir = dist + "/assets/v02/car";
// enemies: only the phone LODs are inlined (the single file uses them on desktop too, to keep it ~10 MB)
const enDir = dist + "/assets/v02/enemies";
const b64 = (p) => "data:model/gltf-binary;base64," + fs.readFileSync(p).toString("base64");
const inlineMap = {};
for (const [dir, test] of [[glbDir, (f) => f.endsWith("_phone.glb")], [enDir, (f) => f.endsWith("_phone.glb")], [dist + "/assets/v02/rig", (f) => f.endsWith("_phone.glb")]]) {
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (test(f)) inlineMap[f.replace(".glb", "")] = b64(`${dir}/${f}`);
}
for (const d of ["city", "kit"]) {
  const dir = `${dist}/assets/v02/${d}`;
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".glb")) inlineMap[`${d}_${f.replace(".glb", "")}`] = b64(`${dir}/${f}`);
    else if (f.endsWith(".png")) inlineMap[f] = "data:image/png;base64," + fs.readFileSync(`${dir}/${f}`).toString("base64");
  }
}
const glbInline = "window.__NF_GLB=" + JSON.stringify(inlineMap) + ";";
const cssTxt = fs.readFileSync(`${folder}/${css[1]}`, "utf8");
const single = html
  .replace(js[0], "")
  .replace(css[0], () => `<style>${cssTxt}</style>`)
  .replace("</body>", () => `<script>${glbInline}</script>\n<script>${jsTxt}</script>\n</body>`);
fs.writeFileSync(`${out}/nightfall-roadster-v02-${tag}.html`, single);
fs.rmSync(`${out}/nightfall-roadster-v02-${tag}.zip`, { force: true });
execSync(`cd "${out}/nightfall-roadster" && python3 -c "import zipfile,os\nz=zipfile.ZipFile('../nightfall-roadster-v02-${tag}.zip','w',zipfile.ZIP_DEFLATED)\nfor r,_,fs in os.walk('.'):\n  [z.write(os.path.join(r,f), os.path.relpath(os.path.join(r,f),'.')) for f in fs]"`); // index.html at the zip root
console.log("packaged", out, fs.statSync(`${out}/nightfall-roadster-v02-${tag}.html`).size);
