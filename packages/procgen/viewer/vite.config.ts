import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname),
  server: {
    port: 3500,
    open: true,
  },
  resolve: {
    alias: {
      "@hyperscape/procgen": resolve(__dirname, "../src"),
      "@hyperscape/impostor": resolve(__dirname, "../../impostors/src"),
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist-viewer"),
    emptyOutDir: true,
  },
});
