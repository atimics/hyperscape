/**
 * Optimized Decimation Module
 *
 * High-performance seam-aware mesh decimation using typed arrays.
 *
 * @module optimized
 */

// Re-export types
export {
  OptimizedMeshData,
  OptimizedEdgeFlaps,
  OptimizedVertexMetrics,
  OptimizedSeamEdgeSet,
  OptimizedSeamVertexMap,
  PlacementBuffer,
  EPS,
  INF,
  NULL_INDEX,
  MATRIX_6X6_SIZE,
  MATRIX_8X8_SIZE,
  MAX_TC_PER_VERTEX,
} from "./types.js";
export type {
  OptimizedDecimationOptions,
  OptimizedDecimationResult,
  StopReason,
} from "./types.js";

// Re-export connectivity functions
export {
  buildEdgeFlaps,
  buildSeamEdges,
  circulation,
  getVertexFaces,
  edgeCollapseIsValid,
  getHalfEdgeBundle,
  type HalfEdgeBundle,
} from "./connectivity.js";

// Re-export quadric functions
export { computeVertexMetrics, getCombinedMetric } from "./quadric.js";

// Re-export priority queue
export { EdgePriorityQueue } from "./priority-queue.js";

// Re-export cost/placement
export { computeCostAndPlacement } from "./cost-placement.js";

// Re-export collapse
export { tryCollapseEdge, type CollapseResult } from "./collapse.js";

// Re-export main decimation function
export { decimateOptimized, cleanMesh } from "./decimate.js";

// Re-export parallel decimation
export {
  decimateParallel,
  workersAvailable,
  getRecommendedWorkerCount,
} from "./decimate-parallel.js";
export type { ParallelDecimationOptions } from "./decimate-parallel.js";

// Re-export worker pool
export { DecimationWorkerPool } from "./worker/index.js";
export type { WorkerPoolOptions, BatchComputeResult } from "./worker/index.js";

// Re-export GPU decimation
export {
  decimateGPU,
  shouldUseGPU,
  GPUDecimationContext,
  isWebGPUAvailable,
  getGPUInfo,
} from "./gpu/index.js";
export type { GPUDecimationOptions, GPUContextOptions } from "./gpu/index.js";

// Re-export off-thread decimation (RECOMMENDED for real-time apps)
export {
  decimateOffThread,
  decimateBatchOffThread,
  decimateTimeSliced,
} from "./decimate-offthread.js";
export type {
  OffThreadDecimationOptions,
  DecimationProgress,
} from "./decimate-offthread.js";

// Re-export SharedArrayBuffer worker pool
export {
  SharedMemoryWorkerPool,
  sharedArrayBufferAvailable,
  decimateSharedMemory,
} from "./worker/shared-worker.js";

// Re-export SIMD math
export {
  simdAvailable,
  initSIMD,
  quadform6SIMD,
  batchQuadform6,
  add6x6InplaceSIMD,
} from "./simd/index.js";

// Re-export spatial indexing
export {
  EdgeSpatialHash,
  buildEdgeSpatialHash,
  VertexEdgeIndex,
  buildVertexEdgeIndex,
} from "./spatial/index.js";
export type { SpatialHashConfig } from "./spatial/index.js";

// ============================================================================
// COMPATIBILITY LAYER
// ============================================================================

import { MeshData, type DecimationOptions } from "../types.js";
import { OptimizedMeshData } from "./types.js";
import type { OptimizedDecimationOptions } from "./types.js";
// Import decimateOptimized for use in compatibility functions
// (also re-exported on line 54)
import { decimateOptimized as _decimateOptimized } from "./decimate.js";

/**
 * Convert legacy MeshData to OptimizedMeshData
 */
export function fromLegacyMeshData(mesh: MeshData): OptimizedMeshData {
  return OptimizedMeshData.fromArrays(mesh.V, mesh.F, mesh.TC, mesh.FT);
}

/**
 * Convert OptimizedMeshData to legacy MeshData
 */
export function toLegacyMeshData(mesh: OptimizedMeshData): MeshData {
  const { V, F, TC, FT } = mesh.toArrays();
  return new MeshData(V, F, TC, FT);
}

/**
 * Convert legacy options to optimized options
 */
export function fromLegacyOptions(
  options: DecimationOptions,
): OptimizedDecimationOptions {
  return {
    targetVertices: options.targetVertices,
    targetPercent: options.targetPercent,
    strictness: options.strictness,
  };
}

/**
 * Decimate using optimized implementation with legacy interface.
 *
 * This is a drop-in replacement for the original decimate function
 * that uses the optimized typed array implementation.
 */
export function decimateLegacy(
  mesh: MeshData,
  options: DecimationOptions = {},
): MeshData {
  const optimizedMesh = fromLegacyMeshData(mesh);
  const optimizedOptions = fromLegacyOptions(options);
  const result = _decimateOptimized(optimizedMesh, optimizedOptions);
  return toLegacyMeshData(result.mesh);
}

// ============================================================================
// THREE.JS INTEGRATION
// ============================================================================

/**
 * Convert Three.js BufferGeometry to OptimizedMeshData
 */
export function fromBufferGeometry(geometry: {
  attributes: {
    position: { array: Float32Array | number[]; count: number };
    uv?: { array: Float32Array | number[]; count: number };
  };
  index?: { array: Uint32Array | Uint16Array | number[] };
}): OptimizedMeshData {
  const posArray = geometry.attributes.position.array;
  const positions =
    posArray instanceof Float32Array
      ? new Float32Array(posArray)
      : new Float32Array(posArray);

  const vertexCount = geometry.attributes.position.count;

  // Handle UVs
  let uvs: Float32Array;
  if (geometry.attributes.uv) {
    const uvArray = geometry.attributes.uv.array;
    uvs =
      uvArray instanceof Float32Array
        ? new Float32Array(uvArray)
        : new Float32Array(uvArray);
  } else {
    // Generate default UVs
    uvs = new Float32Array(vertexCount * 2);
  }

  // Handle indices
  let faceVertices: Uint32Array;
  let faceTexCoords: Uint32Array;

  if (geometry.index) {
    const indexArray = geometry.index.array;
    const indexLen = indexArray.length;
    faceVertices = new Uint32Array(indexLen);
    faceTexCoords = new Uint32Array(indexLen);

    for (let i = 0; i < indexLen; i++) {
      faceVertices[i] = indexArray[i];
      faceTexCoords[i] = indexArray[i]; // Assume shared UV indices
    }
  } else {
    // Non-indexed geometry
    const faceCount = Math.floor(vertexCount / 3);
    faceVertices = new Uint32Array(faceCount * 3);
    faceTexCoords = new Uint32Array(faceCount * 3);

    for (let i = 0; i < faceCount * 3; i++) {
      faceVertices[i] = i;
      faceTexCoords[i] = i;
    }
  }

  return new OptimizedMeshData(positions, uvs, faceVertices, faceTexCoords);
}

/**
 * Create attributes object from OptimizedMeshData for Three.js BufferGeometry
 *
 * Usage:
 * ```typescript
 * const { position, uv, index } = toBufferGeometryData(mesh);
 * geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
 * geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
 * geometry.setIndex(new THREE.BufferAttribute(index, 1));
 * ```
 */
export function toBufferGeometryData(mesh: OptimizedMeshData): {
  position: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
} {
  return {
    position: new Float32Array(mesh.positions),
    uv: new Float32Array(mesh.uvs),
    index: new Uint32Array(mesh.faceVertices),
  };
}
