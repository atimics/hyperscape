import fs from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'url'

const dev = process.argv.includes('--dev')
const typecheck = !process.argv.includes('--no-typecheck')
const dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(dirname, '../')
const buildDir = path.join(rootDir, 'build')

// Ensure build directory exists
await fs.ensureDir(buildDir)

/**
 * TypeScript Plugin for ESBuild
 */
const typescriptPlugin = {
  name: 'typescript',
  setup(build) {
    // Handle .ts and .tsx files
    build.onResolve({ filter: /\.tsx?$/ }, args => {
      return {
        path: path.resolve(args.resolveDir, args.path),
        namespace: 'file',
      }
    })
  },
}

/**
 * Run TypeScript Type Checking
 */
async function runTypeCheck() {
  if (!typecheck) return
  
  console.log('Running TypeScript type checking...')
  execSync('bunx --yes tsc --noEmit', { 
    stdio: 'inherit',
    cwd: rootDir 
  })
  console.log('Type checking passed ✓')
}

/**
 * Plugin to redirect three/webgpu → three for server builds.
 * The server only needs THREE for math (Vector3, Quaternion, etc.),
 * not the WebGPU renderer. This saves ~150MB+ heap at runtime.
 *
 * Also redirects the local three.ts wrapper to three.server.ts
 * which doesn't destructure WebGPU-only TSL functions.
 */
const threeServerPlugin = {
  name: 'three-server-redirect',
  setup(build) {
    // Redirect ALL imports of extras/three/three → extras/three/three.server
    // This catches both:
    // - index.server.ts importing "./extras/three/three"
    // - TerrainSystem.ts importing "../../../extras/three/three"
    // The filter matches the unresolved path string from the source.
    // Redirect ALL relative imports of our three.ts wrapper → three.server.ts
    // The canonical file is: src/extras/three/three.ts
    // Import patterns vary widely:
    //   - "./extras/three/three"      (from index.server.ts)
    //   - "../../../extras/three/three" (from deep shared systems)
    //   - "../three/three"            (from extras/animation/)
    //   - "./three"                   (from extras/three/ siblings like geometryToPxMesh.ts)
    // We use a broad filter and resolve to absolute path to check against the canonical file.
    const canonicalThreeTs = path.join(rootDir, 'src', 'extras', 'three', 'three')
    build.onResolve({ filter: /\/three(?:\.ts)?$/ }, (args) => {
      // Don't redirect if it's already the server version
      if (args.path.includes('three.server')) return null
      // Only redirect relative imports (not npm package 'three')
      if (!args.path.startsWith('.')) return null
      const resolved = path.resolve(args.resolveDir, args.path)
      // Strip .ts extension for comparison
      const resolvedBase = resolved.replace(/\.ts$/, '')
      if (resolvedBase === canonicalThreeTs) {
        return { path: canonicalThreeTs + '.server.ts' }
      }
      return null
    })
    // Redirect three/webgpu → three (for any direct imports in shared source)
    build.onResolve({ filter: /^three\/webgpu$/ }, () => ({
      path: 'three',
      external: true,
    }))
    // Redirect three/tsl → three (type-only, but just in case)
    build.onResolve({ filter: /^three\/tsl$/ }, () => ({
      path: 'three',
      external: true,
    }))
    
    // Stub out the client barrel export (systems/client/index.ts) that is pulled
    // in by SystemLoader.ts at top-level. The actual registration is guarded by
    // world.isClient but ESM imports are static, so esbuild would bundle
    // everything the barrel re-exports (ClientGraphics, ClientLiveKit, etc.)
    // which pulls in three/webgpu, livekit-client, and other heavy deps.
    // We ONLY stub the barrel — individual file imports (like interaction/constants.ts)
    // are allowed through since shared code needs those constants.
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!args.path.startsWith('.')) return null
      const resolved = path.resolve(args.resolveDir, args.path)
      const clientIndex = path.join(rootDir, 'src', 'systems', 'client')
      // Only intercept the barrel import (resolves to client/ or client/index.ts)
      if (resolved === clientIndex || resolved === clientIndex + '/index' || resolved === clientIndex + '/index.ts') {
        return {
          path: 'client-systems-stub',
          namespace: 'client-stub',
        }
      }
      return null
    })
    build.onLoad({ filter: /.*/, namespace: 'client-stub' }, () => {
      return {
        contents: `
          // Stub for client-only systems on server build
          const noop = () => {};
          class StubSystem {
            constructor() {}
            getDependencies() { return {} }
            async init() {}
            start() {}
            destroy() {}
            update() {}
            preTick() {}
            preFixedUpdate() {}
            fixedUpdate() {}
            postFixedUpdate() {}
            preUpdate() {}
            postUpdate() {}
            lateUpdate() {}
            postLateUpdate() {}
            commit() {}
            postTick() {}
            isInitialized() { return false }
            isStarted() { return false }
            on() { return this }
            off() { return this }
            emit() { return false }
          }
          export const InteractionRouter = StubSystem;
          export const DamageSplatSystem = StubSystem;
          export const DuelCountdownSplatSystem = StubSystem;
          export const ProjectileRenderer = StubSystem;
          export const SocialSystem = StubSystem;
          export const DuelArenaVisualsSystem = StubSystem;
          export const ClientInterface = StubSystem;
          export const ClientLoader = StubSystem;
          export const ClientNetwork = StubSystem;
          export const ClientGraphics = StubSystem;
          export const ClientRuntime = StubSystem;
          export const ClientAudio = StubSystem;
          export const ClientLiveKit = StubSystem;
          export const ClientInput = StubSystem;
          export const ClientActions = StubSystem;
          export const ClientCameraSystem = StubSystem;
          export const DevStats = StubSystem;
          export const NodeClient = StubSystem;
          export const ControlPriorities = {};
          export const TileInterpolator = StubSystem;
        `,
        loader: 'js',
      }
    })
  },
}

/**
 * Build Library
 */
async function buildLibrary() {
  console.log('Building library...')
  
  // Build full library (server + client)
  console.log('Building framework.js (full)...')
  const ctxFull = await esbuild.context({
    entryPoints: ['src/index.ts'],
    outfile: 'build/framework.js',
    platform: 'neutral',
    format: 'esm',
    bundle: true,
    treeShaking: true,
    minify: false,
    sourcemap: true,
    packages: 'external',
    target: 'esnext',
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    // Mark server-specific modules as external so they can be dynamically imported
    // These paths are relative to the build output location
    external: [
      './PhysXManager.server',
      './PhysXManager.server.js',
      './storage.server',
      './storage.server.js',
    ],
    plugins: [typescriptPlugin],
  })
  
  await ctxFull.rebuild()
  await ctxFull.dispose()
  console.log('✓ framework.js built successfully')
  
  // Build server-only library (no WebGPU renderer, no client systems)
  console.log('Building framework.server.js (server-only)...')
  const ctxServer = await esbuild.context({
    entryPoints: ['src/index.server.ts'],
    outfile: 'build/framework.server.js',
    platform: 'node',
    format: 'esm',
    bundle: true,
    treeShaking: true,
    minify: false,
    sourcemap: true,
    packages: 'external',
    target: 'esnext',
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    external: [
      './PhysXManager.server',
      './PhysXManager.server.js',
      './storage.server',
      './storage.server.js',
    ],
    plugins: [threeServerPlugin, typescriptPlugin],
  })
  
  await ctxServer.rebuild()
  await ctxServer.dispose()
  console.log('✓ framework.server.js built successfully')
  
  // Build server-specific modules separately
  console.log('Building server-specific modules...')
  const ctxServerPhysX = await esbuild.context({
    entryPoints: ['src/physics/PhysXManager.server.ts'],
    outfile: 'build/PhysXManager.server.js',
    platform: 'node',
    format: 'esm',
    bundle: false,
    sourcemap: true,
    target: 'esnext',
  })
  await ctxServerPhysX.rebuild()
  await ctxServerPhysX.dispose()

  const ctxServerStorage = await esbuild.context({
    entryPoints: ['src/platform/server/storage.server.ts'],
    outfile: 'build/storage.server.js',
    platform: 'node',
    format: 'esm',
    bundle: false,
    sourcemap: true,
    target: 'esnext',
  })
  await ctxServerStorage.rebuild()
  await ctxServerStorage.dispose()
  console.log('✓ Server-specific modules built successfully')
  
  // Build client-only library (no Node.js modules)
  console.log('Building framework.client.js (client-only)...')
  const ctxClient = await esbuild.context({
    entryPoints: ['src/index.client.ts'],
    outfile: 'build/framework.client.js',
    platform: 'browser',
    format: 'esm',
    bundle: true,
    treeShaking: true,
    minify: false,
    sourcemap: true,
    packages: 'external',
    target: 'esnext',
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    // Mark server-specific modules as external so they're not bundled
    // These paths are relative to the build output location
    external: [
      './PhysXManager.server',
      './PhysXManager.server.js',
      './storage.server',
      './storage.server.js',
      'node:*',
      'os',
      'fs',
      'path',
      'url'
    ],
    plugins: [typescriptPlugin],
  })
  
  await ctxClient.rebuild()
  await ctxClient.dispose()
  console.log('✓ framework.client.js built successfully')
  
  console.log('✓ All library builds completed')
}

/**
 * Generate TypeScript Declaration Files
 */
async function generateDeclarations() {
  if (!typecheck) return
  
  console.log('Generating TypeScript declarations...')
  
  // Generate declaration files using tsc
  console.log('Creating type definitions...')
  try {
    execSync('bunx --yes tsc --emitDeclarationOnly --outDir build', {
      stdio: 'inherit',
      cwd: rootDir
    })
    console.log('✓ Declaration files generated')
  } catch (error) {
    console.warn('⚠️  Type checking errors found, but declarations may have been partially generated')
    // Don't fail the build - declarations are still useful even with some errors
  }
  
  // Copy index.d.ts to build root as framework.d.ts
  // tsc with --outDir build and rootDir src creates build/index.d.ts
  const indexDts = path.join(buildDir, 'index.d.ts')
  const frameworkDts = path.join(buildDir, 'framework.d.ts')
  
  if (await fs.pathExists(indexDts)) {
    await fs.copy(indexDts, frameworkDts)
    console.log('✓ Copied index.d.ts to framework.d.ts')
  } else {
    console.warn('⚠️  index.d.ts not found at', indexDts)
  }
}

/**
 * Main Build Process
 */
async function main() {
  console.log(`Building @hyperscape/shared in ${dev ? 'development' : 'production'} mode...`)
  
  await buildLibrary()
  
  if (!dev) {
    await generateDeclarations()
  } else {
    await runTypeCheck()
  }
  
  console.log('Build completed successfully!')
}

// Run the build
main().catch(error => {
  console.error('Build failed:', error)
  process.exit(1)
})

