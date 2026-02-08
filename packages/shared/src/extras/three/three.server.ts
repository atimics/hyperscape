/**
 * three.server.ts - Lightweight Three.js for Server
 *
 * Server-only Three.js import that uses the STANDARD three.js build
 * instead of three/webgpu. This avoids loading the WebGPU renderer,
 * TSL (Three Shading Language), and Node Materials, saving ~150MB+ of
 * heap memory at runtime.
 *
 * The server only needs Three.js for:
 * - Vector3, Quaternion, Matrix4 math (tile movement, physics)
 * - Object3D scene graph (entity nodes)
 * - BufferGeometry/Mesh (raycasting, collision)
 *
 * WebGPU-only exports (NodeMaterials, TSL functions, CSM) are stubbed
 * as empty classes/functions since the server never renders.
 */

import * as THREE from "three";

import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "three-mesh-bvh";

// Install three-mesh-bvh for accelerated raycasting (used by physics/terrain)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Export the THREE namespace as the default export (matches three.ts interface)
export default THREE;

// Re-export the full standard three.js surface
export * from "three";

// ============================================================================
// STUBS for WebGPU-only exports that shared systems import but never
// call on the server. These prevent runtime "export not found" errors.
// ============================================================================

// Node Materials (WebGPU-only) — stubbed as classes extending MeshStandardMaterial
class NodeMaterialStub extends THREE.MeshStandardMaterial {
  constructor(params?: THREE.MeshStandardMaterialParameters) {
    super(params);
  }
}

export const MeshStandardNodeMaterial = NodeMaterialStub;
export const MeshBasicNodeMaterial = NodeMaterialStub;
export const MeshPhysicalNodeMaterial = NodeMaterialStub;
export const SpriteNodeMaterial = NodeMaterialStub;
export const LineBasicNodeMaterial = NodeMaterialStub;

// CSM (Cascaded Shadow Maps) — WebGPU-only, stub as empty class
export class CSMShadowNode {
  constructor(..._args: unknown[]) {}
}
export class CSMHelper {
  constructor(..._args: unknown[]) {}
}

// TSL function stubs — these return dummy values that support chaining.
// The server never evaluates shader graphs, so these are safe no-ops.
// We use a Proxy-based approach so any method call or property access
// continues to return a chainable noop, preventing runtime TypeErrors
// when shared code tries to build shader node graphs.
const noopNode: any = new Proxy(
  function (..._args: unknown[]) {
    return noopNode;
  },
  {
    get(_target, _prop) {
      // Any property access returns the same chainable noop
      return noopNode;
    },
  },
);
const noop = (..._args: unknown[]): any => noopNode;
const noopNum = (..._args: unknown[]): any => noopNode;

export const TSL = {
  Fn: noop,
  If: noop,
  uv: noop,
  positionLocal: noop,
  positionWorld: noop,
  positionView: noop,
  normalLocal: noop,
  normalWorld: noop,
  normalView: noop,
  cameraPosition: noop,
  uniform: noop,
  attribute: noop,
  float: noopNum,
  int: noopNum,
  uint: noopNum,
  vec2: noop,
  vec3: noop,
  vec4: noop,
  mat2: noop,
  mat3: noop,
  mat4: noop,
  add: noop,
  sub: noop,
  mul: noop,
  div: noop,
  mod: noop,
  abs: noop,
  mix: noop,
  clamp: noop,
  normalize: noop,
  dot: noop,
  cross: noop,
  sin: noop,
  cos: noop,
  texture: noop,
  output: noop,
  renderOutput: noop,
  pass: noop,
  mrt: noop,
  reflector: noop,
};

// TSL function exports at top level (matches what three.ts destructures)
export const Fn = noop;
export const If = noop;
export const uv = noop;
export const positionLocal = noop;
export const positionWorld = noop;
export const positionView = noop;
export const normalLocal = noop;
export const normalWorld = noop;
export const normalView = noop;
export const cameraPosition = noop;
export const cameraProjectionMatrix = noop;
export const cameraViewMatrix = noop;
export const cameraNear = noop;
export const cameraFar = noop;
export const modelViewMatrix = noop;
export const modelWorldMatrix = noop;
export const modelNormalMatrix = noop;
export const instanceIndex = noop;
export const uniform = noop;
export const attribute = noop;
export const instancedBufferAttribute = noop;
export const vertexColor = noop;
export const float = noopNum;
export const int = noopNum;
export const uint = noopNum;
export const vec2 = noop;
export const vec3 = noop;
export const vec4 = noop;
export const mat2 = noop;
export const mat3 = noop;
export const mat4 = noop;
export const add = noop;
export const sub = noop;
export const mul = noop;
export const div = noop;
export const mod = noop;
export const abs = noop;
export const acos = noop;
export const asin = noop;
export const atan = noop;
export const ceil = noop;
export const clamp = noop;
export const cos = noop;
export const cross = noop;
export const degrees = noop;
export const distance = noop;
export const dot = noop;
export const exp = noop;
export const exp2 = noop;
export const floor = noop;
export const fract = noop;
export const inversesqrt = noop;
export const length = noop;
export const log = noop;
export const log2 = noop;
export const max = noop;
export const min = noop;
export const mix = noop;
export const normalize = noop;
export const pow = noop;
export const radians = noop;
export const reflect = noop;
export const refract = noop;
export const round = noop;
export const saturate = noop;
export const sign = noop;
export const sin = noop;
export const smoothstep = noop;
export const sqrt = noop;
export const step = noop;
export const tan = noop;
export const texture = noop;
export const texture3D = noop;
export const Discard = noop;
export const output = noop;
export const renderOutput = noop;
export const pass = noop;
export const mrt = noop;
export const reflector = noop;
