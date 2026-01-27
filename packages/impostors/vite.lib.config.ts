import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      include: ["src/lib/**/*.ts", "src/index.ts"],
      outDir: "dist",
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        // Viewer excluded from lib build due to WIP WebGPU support
        // 'viewer/index': resolve(__dirname, 'src/viewer/index.ts'),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "three",
        "three/webgpu", // WebGPU-specific exports for TSL materials
        "three/examples/jsm/controls/OrbitControls.js",
        "tweakpane",
        "troika-three-text",
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
      },
    },
    outDir: "dist",
    sourcemap: true,
  },
});
