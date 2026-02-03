# Multi-stage Dockerfile for Hyperscape Game Server
# Builds the server with all dependencies and creates a lean runtime image

# ============================================================================
# Stage 1: Builder - Install dependencies and build packages
# ============================================================================
FROM oven/bun:1.1.38-alpine AS builder

# Install build dependencies for native modules (canvas, better-sqlite3)
RUN apk add --no-cache python3 py3-setuptools make g++ pkgconfig cairo-dev pango-dev jpeg-dev giflib-dev

WORKDIR /app

# Copy package files for dependency installation
COPY package.json bun.lock ./
COPY packages/physx-js-webidl/package.json ./packages/physx-js-webidl/
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/plugin-hyperscape/package.json ./packages/plugin-hyperscape/
COPY packages/decimation/package.json ./packages/decimation/
COPY packages/impostors/package.json ./packages/impostors/
COPY packages/procgen/package.json ./packages/procgen/

# Install dependencies (skip postinstall scripts)
RUN bun install --ignore-scripts

# Ensure vite-plugin-dts is available for the impostors build
RUN cd packages/impostors && bun add -d vite-plugin-dts@4.5.4 --no-save 2>/dev/null || true

# Copy source code
COPY packages/physx-js-webidl ./packages/physx-js-webidl
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/plugin-hyperscape ./packages/plugin-hyperscape
COPY packages/decimation ./packages/decimation
COPY packages/impostors ./packages/impostors
COPY packages/procgen ./packages/procgen
COPY assets/physx-js-webidl.js ./assets/
COPY assets/physx-js-webidl.wasm ./assets/
COPY turbo.json ./
COPY tsconfig.json ./

# Copy procgen fallback build script
COPY packages/procgen/scripts/docker-build.sh ./packages/procgen/scripts/
RUN chmod +x ./packages/procgen/scripts/docker-build.sh

# Build all packages using Turbo (respects dependency graph + caching)
# Falls back to manual builds for packages that may have vite issues in Alpine
WORKDIR /app
RUN bunx turbo run build --filter=@hyperscape/physx-js-webidl --filter=@hyperscape/decimation --filter=@hyperscape/impostors --filter=@hyperscape/procgen --filter=@hyperscape/shared --filter=@hyperscape/server --concurrency=10 \
    || (echo '=== Turbo failed, falling back to sequential builds ===' && \
        cd packages/physx-js-webidl && (bun run build || true) && \
        cd ../decimation && bun run build && \
        cd ../impostors && (bun run build || bun build src/index.ts --outdir dist --target browser --format esm) && \
        cd ../procgen && (bun run build || ./scripts/docker-build.sh) && \
        cd ../shared && bun run build && \
        cd ../server && bun run build)

# ============================================================================
# Stage 2: Runtime - Minimal production image
# ============================================================================
FROM oven/bun:1.1.38-alpine AS runtime

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 py3-setuptools make g++ pkgconfig cairo-dev pango-dev jpeg-dev giflib-dev

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Copy all built packages from builder
COPY --from=builder /app/packages/physx-js-webidl ./packages/physx-js-webidl
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/server ./packages/server
COPY --from=builder /app/packages/plugin-hyperscape ./packages/plugin-hyperscape
COPY --from=builder /app/packages/decimation ./packages/decimation
COPY --from=builder /app/packages/impostors ./packages/impostors
COPY --from=builder /app/packages/procgen ./packages/procgen

# Install dependencies - this will link workspace packages
RUN bun install --production --ignore-scripts

# Create world directory structure and copy manifests where server expects them
RUN mkdir -p ./packages/server/world/assets/manifests

# Copy manifests (small JSON files needed for server-side logic)
COPY packages/server/world/assets/manifests ./packages/server/world/assets/manifests

# Copy server source files needed at runtime
COPY --from=builder /app/packages/server/src ./packages/server/src

# Set working directory to server
WORKDIR /app/packages/server

# Expose WebSocket port
EXPOSE 5555

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun run -e "fetch('http://localhost:5555/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the server
CMD ["bun", "run", "start"]
