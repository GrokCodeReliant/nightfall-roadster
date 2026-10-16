import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  root: "spa",
  base: "./",
  plugins: [tailwindcss(), viteReact()],
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true, format: "iife" } } },
});
