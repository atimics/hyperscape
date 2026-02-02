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
      // Use built client bundle for shared to avoid server-only imports
      "@hyperscape/shared": resolve(
        __dirname,
        "../../shared/build/framework.client.js",
      ),
    },
  },
  optimizeDeps: {
    // Exclude yoga-layout from dep optimization to avoid top-level await issues
    exclude: ["yoga-layout"],
    esbuildOptions: {
      target: "esnext",
    },
  },
  esbuild: {
    target: "esnext",
  },
  build: {
    outDir: resolve(__dirname, "../dist-viewer"),
    emptyOutDir: true,
    target: "esnext",
  },
});
