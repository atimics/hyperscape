#!/bin/bash
# Fallback build script for procgen package in Docker
# Used when standard bun run build fails (missing vite config, etc.)

set -e

echo "=== Procgen Docker Fallback Build ==="

rm -rf dist

# Create output directories
mkdir -p dist/plant dist/rock dist/building/town dist/terrain dist/vegetation dist/items/dock

# Build all entry points
bun build src/index.ts --outfile dist/index.js --target browser --format esm
bun build src/plant/index.ts --outfile dist/plant/index.js --target browser --format esm
bun build src/rock/index.ts --outfile dist/rock/index.js --target browser --format esm
bun build src/building/index.ts --outfile dist/building/index.js --target browser --format esm
bun build src/building/town/index.ts --outfile dist/building/town/index.js --target browser --format esm
bun build src/terrain/index.ts --outfile dist/terrain/index.js --target browser --format esm
bun build src/vegetation/index.ts --outfile dist/vegetation/index.js --target browser --format esm
bun build src/items/index.ts --outfile dist/items/index.js --target browser --format esm
bun build src/items/dock/index.ts --outfile dist/items/dock/index.js --target browser --format esm

echo "=== Procgen build complete ==="
