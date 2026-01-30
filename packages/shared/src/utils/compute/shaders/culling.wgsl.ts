/**
 * GPU Culling Compute Shaders
 *
 * WGSL compute shaders for frustum and distance culling of instanced meshes.
 * Outputs visible instance indices and indirect draw parameters.
 *
 * ## Usage
 * 1. Upload all instance matrices to storage buffer
 * 2. Set frustum planes and camera position uniforms
 * 3. Dispatch culling shader
 * 4. Use output indirect buffer for rendering
 *
 * ## Performance
 * - Single GPU dispatch culls thousands of instances
 * - No CPU read-back required
 * - Indirect draw uses GPU-generated instance count
 */

import { WGSL_COMMON_EXTENDED } from "./common.wgsl";

// ============================================================================
// CULLING PARAMETER STRUCTS
// ============================================================================

export const WGSL_CULLING_STRUCTS = /* wgsl */ `
// Culling parameters uniform buffer
struct CullParams {
  // Camera position (xyz) and padding (w)
  cameraPos: vec4<f32>,
  
  // Cull distance squared (x), uncull distance squared (y), bounding radius (z), instance count (w)
  cullDistanceSq: f32,
  uncullDistanceSq: f32,
  boundingRadius: f32,
  instanceCount: u32,
  
  // Hysteresis distances (prevents flicker)
  fadeStartSq: f32,
  fadeEndSq: f32,
  _padding1: f32,
  _padding2: f32,
}

// Indirect draw parameters (matches WebGPU/Three.js spec)
struct DrawIndirectParams {
  // For non-indexed draws
  vertexCount: u32,
  instanceCount: atomic<u32>,
  firstVertex: u32,
  firstInstance: u32,
}

// Indexed indirect draw parameters
struct DrawIndexedIndirectParams {
  indexCount: u32,
  instanceCount: atomic<u32>,
  firstIndex: u32,
  baseVertex: u32,
  firstInstance: u32,
}

// Instance data structure
struct InstanceData {
  // Transform matrix (16 floats = 64 bytes)
  transform: mat4x4<f32>,
}

// Compact instance for output (position + index + padding)
struct VisibleInstance {
  position: vec3<f32>,
  sourceIndex: u32,
}
`;

// ============================================================================
// BASIC FRUSTUM + DISTANCE CULLING
// ============================================================================

/**
 * Basic culling shader that combines frustum and distance culling.
 * Outputs visible instance indices to a compacted array.
 *
 * Bindings:
 * - 0: instances (storage, read) - All instance transforms
 * - 1: frustumPlanes (uniform) - 6 frustum planes as vec4
 * - 2: params (uniform) - Culling parameters
 * - 3: visibleIndices (storage, read_write) - Output: visible instance indices
 * - 4: drawParams (storage, read_write) - Output: indirect draw parameters
 */
export const CULLING_SHADER = /* wgsl */ `
${WGSL_COMMON_EXTENDED}
${WGSL_CULLING_STRUCTS}

// Input: All instance transforms
@group(0) @binding(0) var<storage, read> instances: array<InstanceData>;

// Input: Frustum planes (6 planes × vec4)
@group(0) @binding(1) var<uniform> frustumPlanes: array<vec4<f32>, 6>;

// Input: Culling parameters
@group(0) @binding(2) var<uniform> params: CullParams;

// Output: Visible instance indices (compacted)
@group(0) @binding(3) var<storage, read_write> visibleIndices: array<u32>;

// Output: Indirect draw parameters
@group(0) @binding(4) var<storage, read_write> drawParams: DrawIndirectParams;

// Test if a sphere intersects the frustum (from common.wgsl)
fn sphereInFrustumLocal(center: vec3<f32>, radius: f32) -> bool {
  for (var i = 0u; i < 6u; i++) {
    let plane = frustumPlanes[i];
    let distance = dot(plane.xyz, center) + plane.w;
    if (distance < -radius) {
      return false;
    }
  }
  return true;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let idx = globalId.x;
  if (idx >= params.instanceCount) {
    return;
  }
  
  // Extract position from transform matrix (column 3)
  let transform = instances[idx].transform;
  let position = transform[3].xyz;
  
  // Distance culling (squared, XZ plane)
  let distSq = distanceSquaredXZ(position, params.cameraPos.xyz);
  if (distSq > params.cullDistanceSq) {
    return;
  }
  
  // Frustum culling with bounding sphere
  if (!sphereInFrustumLocal(position, params.boundingRadius)) {
    return;
  }
  
  // Instance passed culling - atomically append to visible list
  let outIdx = atomicAdd(&drawParams.instanceCount, 1u);
  visibleIndices[outIdx] = idx;
}
`;

// ============================================================================
// CULLING WITH LOD SELECTION
// ============================================================================

/**
 * Extended culling shader with LOD level selection based on distance.
 * Outputs visible instances with their LOD level.
 *
 * LOD Levels:
 * - 0: Full detail (0 - lod1DistanceSq)
 * - 1: Low poly (lod1DistanceSq - lod2DistanceSq)
 * - 2: Very low poly (lod2DistanceSq - lod3DistanceSq)
 * - 3: Impostor/Billboard (lod3DistanceSq - cullDistanceSq)
 */
export const CULLING_WITH_LOD_SHADER = /* wgsl */ `
${WGSL_COMMON_EXTENDED}
${WGSL_CULLING_STRUCTS}

// Extended parameters for LOD
struct CullParamsLOD {
  cameraPos: vec4<f32>,
  cullDistanceSq: f32,
  uncullDistanceSq: f32,
  boundingRadius: f32,
  instanceCount: u32,
  
  // LOD distance thresholds (squared)
  lod1DistanceSq: f32,
  lod2DistanceSq: f32,
  lod3DistanceSq: f32,
  _padding: f32,
}

// Instance with LOD info
struct VisibleInstanceLOD {
  sourceIndex: u32,
  lodLevel: u32,
  distanceSq: f32,
  _padding: f32,
}

@group(0) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(0) @binding(1) var<uniform> frustumPlanes: array<vec4<f32>, 6>;
@group(0) @binding(2) var<uniform> params: CullParamsLOD;
@group(0) @binding(3) var<storage, read_write> visibleInstances: array<VisibleInstanceLOD>;

// Per-LOD draw params (4 LOD levels)
@group(0) @binding(4) var<storage, read_write> lodCounts: array<atomic<u32>, 4>;

fn sphereInFrustumLocal(center: vec3<f32>, radius: f32) -> bool {
  for (var i = 0u; i < 6u; i++) {
    let plane = frustumPlanes[i];
    let distance = dot(plane.xyz, center) + plane.w;
    if (distance < -radius) {
      return false;
    }
  }
  return true;
}

fn selectLODLevel(distSq: f32) -> u32 {
  if (distSq < params.lod1DistanceSq) { return 0u; }
  if (distSq < params.lod2DistanceSq) { return 1u; }
  if (distSq < params.lod3DistanceSq) { return 2u; }
  return 3u;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let idx = globalId.x;
  if (idx >= params.instanceCount) {
    return;
  }
  
  let transform = instances[idx].transform;
  let position = transform[3].xyz;
  
  // Distance culling
  let distSq = distanceSquaredXZ(position, params.cameraPos.xyz);
  if (distSq > params.cullDistanceSq) {
    return;
  }
  
  // Frustum culling
  if (!sphereInFrustumLocal(position, params.boundingRadius)) {
    return;
  }
  
  // Select LOD level
  let lodLevel = selectLODLevel(distSq);
  
  // Atomically increment LOD count and get output index
  let lodCountBase = atomicAdd(&lodCounts[lodLevel], 1u);
  
  // Calculate global output index (sum of previous LOD counts + local index)
  // For simplicity, we write to a shared array with LOD info
  var outInstance: VisibleInstanceLOD;
  outInstance.sourceIndex = idx;
  outInstance.lodLevel = lodLevel;
  outInstance.distanceSq = distSq;
  outInstance._padding = 0.0;
  
  // Note: In practice, you'd want separate output arrays per LOD
  // This simplified version stores LOD level with each instance
  // Atomic add to get total visible count
  let totalIdx = atomicAdd(&lodCounts[0], 1u);
  visibleInstances[totalIdx] = outInstance;
}
`;

// ============================================================================
// CULLING WITH MATRIX COMPACTION
// ============================================================================

/**
 * Culling shader that compacts visible instance matrices for direct rendering.
 * Useful when you need the full transform matrix for each visible instance.
 */
export const CULLING_COMPACT_MATRICES_SHADER = /* wgsl */ `
${WGSL_COMMON_EXTENDED}
${WGSL_CULLING_STRUCTS}

@group(0) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(0) @binding(1) var<uniform> frustumPlanes: array<vec4<f32>, 6>;
@group(0) @binding(2) var<uniform> params: CullParams;
@group(0) @binding(3) var<storage, read_write> visibleMatrices: array<mat4x4<f32>>;
@group(0) @binding(4) var<storage, read_write> drawParams: DrawIndirectParams;

fn sphereInFrustumLocal(center: vec3<f32>, radius: f32) -> bool {
  for (var i = 0u; i < 6u; i++) {
    let plane = frustumPlanes[i];
    let distance = dot(plane.xyz, center) + plane.w;
    if (distance < -radius) {
      return false;
    }
  }
  return true;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let idx = globalId.x;
  if (idx >= params.instanceCount) {
    return;
  }
  
  let transform = instances[idx].transform;
  let position = transform[3].xyz;
  
  // Distance culling
  let distSq = distanceSquaredXZ(position, params.cameraPos.xyz);
  if (distSq > params.cullDistanceSq) {
    return;
  }
  
  // Frustum culling
  if (!sphereInFrustumLocal(position, params.boundingRadius)) {
    return;
  }
  
  // Atomically append full transform matrix
  let outIdx = atomicAdd(&drawParams.instanceCount, 1u);
  visibleMatrices[outIdx] = transform;
}
`;

// ============================================================================
// RESET INDIRECT DRAW PARAMS SHADER
// ============================================================================

/**
 * Simple shader to reset indirect draw parameters before culling.
 * Call this before each culling pass.
 */
export const RESET_DRAW_PARAMS_SHADER = /* wgsl */ `
struct DrawIndirectParams {
  vertexCount: u32,
  instanceCount: u32,
  firstVertex: u32,
  firstInstance: u32,
}

@group(0) @binding(0) var<storage, read_write> drawParams: DrawIndirectParams;
@group(0) @binding(1) var<uniform> vertexCount: u32;

@compute @workgroup_size(1)
fn main() {
  drawParams.vertexCount = vertexCount;
  drawParams.instanceCount = 0u;
  drawParams.firstVertex = 0u;
  drawParams.firstInstance = 0u;
}
`;

// ============================================================================
// VEGETATION-SPECIFIC CULLING
// ============================================================================

/**
 * Specialized culling shader for vegetation with density-based LOD.
 * Uses golden ratio hash for deterministic instance culling at distance.
 */
export const VEGETATION_CULLING_SHADER = /* wgsl */ `
${WGSL_COMMON_EXTENDED}
${WGSL_CULLING_STRUCTS}

struct VegetationParams {
  cameraPos: vec4<f32>,
  cullDistanceSq: f32,
  boundingRadius: f32,
  instanceCount: u32,
  _padding1: f32,
  
  // LOD density thresholds (distance squared → density multiplier)
  // Closer = higher density (1.0), farther = lower density (0.125)
  lodHalfDensitySq: f32,     // 50% density starts
  lodQuarterDensitySq: f32,  // 25% density starts  
  lodEighthDensitySq: f32,   // 12.5% density starts
  _padding2: f32,
}

@group(0) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(0) @binding(1) var<uniform> frustumPlanes: array<vec4<f32>, 6>;
@group(0) @binding(2) var<uniform> params: VegetationParams;
@group(0) @binding(3) var<storage, read_write> visibleIndices: array<u32>;
@group(0) @binding(4) var<storage, read_write> drawParams: DrawIndirectParams;

fn sphereInFrustumLocal(center: vec3<f32>, radius: f32) -> bool {
  for (var i = 0u; i < 6u; i++) {
    let plane = frustumPlanes[i];
    let distance = dot(plane.xyz, center) + plane.w;
    if (distance < -radius) {
      return false;
    }
  }
  return true;
}

// Calculate LOD density threshold based on distance
fn calculateLODThreshold(distSq: f32) -> f32 {
  // Full density below lodHalfDensitySq
  if (distSq < params.lodHalfDensitySq) {
    return 1.0;
  }
  
  // Interpolate between density levels
  let t1 = smoothstep(params.lodHalfDensitySq, params.lodQuarterDensitySq, distSq);
  let threshold1 = mix(1.0, 0.5, t1);
  
  let t2 = smoothstep(params.lodQuarterDensitySq, params.lodEighthDensitySq, distSq);
  let threshold2 = mix(threshold1, 0.25, t2);
  
  let t3 = smoothstep(params.lodEighthDensitySq, params.cullDistanceSq, distSq);
  return mix(threshold2, 0.125, t3);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let idx = globalId.x;
  if (idx >= params.instanceCount) {
    return;
  }
  
  let transform = instances[idx].transform;
  let position = transform[3].xyz;
  
  // Distance culling
  let distSq = distanceSquaredXZ(position, params.cameraPos.xyz);
  if (distSq > params.cullDistanceSq) {
    return;
  }
  
  // Frustum culling
  if (!sphereInFrustumLocal(position, params.boundingRadius)) {
    return;
  }
  
  // Density-based LOD culling using golden ratio hash
  let instanceHash = fract(f32(idx) * GOLDEN_RATIO);
  let lodThreshold = calculateLODThreshold(distSq);
  
  // Skip instance if hash exceeds threshold (deterministic sparse culling)
  if (instanceHash > lodThreshold) {
    return;
  }
  
  // Instance passed all culling - add to visible list
  let outIdx = atomicAdd(&drawParams.instanceCount, 1u);
  visibleIndices[outIdx] = idx;
}
`;

// ============================================================================
// EXPORTS
// ============================================================================

export const CULLING_SHADERS = {
  basic: CULLING_SHADER,
  withLOD: CULLING_WITH_LOD_SHADER,
  compactMatrices: CULLING_COMPACT_MATRICES_SHADER,
  resetDrawParams: RESET_DRAW_PARAMS_SHADER,
  vegetation: VEGETATION_CULLING_SHADER,
} as const;
