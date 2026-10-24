import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const NF_VERSION = JSON.parse(readFileSync("package.json", "utf8")).version ?? "0.0.0";
let NF_BUILD = "dev";
try { NF_BUILD = execSync("git rev-parse --short HEAD").toString().trim(); } catch { /* no git */ }
export default defineConfig({
  root: "spa",
  base: "./",
  define: { __NF_BUILD__: JSON.stringify(NF_BUILD), __NF_VERSION__: JSON.stringify(NF_VERSION) },
  plugins: [tailwindcss(), viteReact(), { name: "nf-version", apply: "build", closeBundle() {
    writeFileSync("dist/version.json", JSON.stringify({ version: NF_VERSION, build: NF_BUILD }) + "\n");
  } }],
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true, format: "iife" } } },
});
