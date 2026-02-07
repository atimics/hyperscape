#!/bin/sh
# Server entrypoint - preloads WebGPU polyfill for Three.js compatibility
exec bun --preload ./webgpu-polyfill.js dist/index.js
