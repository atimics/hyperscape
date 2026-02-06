/**
 * WebGPU Polyfill for Server-Side Three.js
 *
 * three/webgpu (three.webgpu.js) accesses WebGPU browser globals at module
 * evaluation time. On server runtimes (Node.js / Bun) these don't exist,
 * causing an immediate crash. This preload script stubs the minimum set of
 * globals so the module can load without errors. The server never actually
 * renders anything — it only uses Three.js math, scene graph, and ECS types.
 *
 * Usage:  bun --preload ./webgpu-polyfill.js dist/index.js
 */

if (typeof globalThis.GPUShaderStage === "undefined") {
  globalThis.GPUShaderStage = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 };
}

if (typeof globalThis.GPUBufferUsage === "undefined") {
  globalThis.GPUBufferUsage = {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
  };
}

if (typeof globalThis.GPUTextureUsage === "undefined") {
  globalThis.GPUTextureUsage = {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  };
}

if (typeof globalThis.GPUColorWrite === "undefined") {
  globalThis.GPUColorWrite = {
    RED: 0x1,
    GREEN: 0x2,
    BLUE: 0x4,
    ALPHA: 0x8,
    ALL: 0xf,
  };
}

if (typeof globalThis.GPUMapMode === "undefined") {
  globalThis.GPUMapMode = {
    READ: 0x0001,
    WRITE: 0x0002,
  };
}

// Stub navigator.gpu so feature-detection doesn't throw
if (typeof globalThis.navigator === "undefined") {
  globalThis.navigator = /** @type {any} */ ({});
}
