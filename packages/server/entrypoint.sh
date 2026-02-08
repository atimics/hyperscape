#!/bin/sh
# Server entrypoint - preloads WebGPU polyfill for Three.js compatibility
# --smol: reduces Bun memory overhead (smaller heap pages, more aggressive GC)
exec bun --smol --preload ./webgpu-polyfill.js dist/index.js
