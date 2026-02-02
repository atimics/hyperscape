/**
 * Grass Geometry Generation
 *
 * Creates grass blade geometry with configurable segments and tapering.
 * Used for both individual blade instancing and LOD card geometry.
 *
 * @module GrassGeometry
 */

import * as THREE from "three";
import type { GrassBladeConfig } from "./types.js";
import { DEFAULT_BLADE_CONFIG } from "./types.js";

/**
 * Options for grass blade geometry generation
 */
export interface GrassBladeGeometryOptions {
  /** Number of vertical segments (more = smoother curve) */
  segments?: number;
  /** Width taper from base to tip (0 = point, 1 = full width) */
  tipTaper?: number;
  /** Add curvature to the blade */
  curvature?: number;
}

/**
 * Create a single grass blade geometry
 *
 * The geometry is created in a normalized space:
 * - X: -0.5 to 0.5 (width, will be scaled by blade width)
 * - Y: 0 to 1 (height, will be scaled by blade height)
 * - Z: 0 (flat, curvature applied via shader)
 *
 * @param config - Blade configuration
 * @returns BufferGeometry for a single grass blade
 */
export function createGrassBladeGeometry(
  config: Partial<GrassBladeConfig> = {},
): THREE.BufferGeometry {
  const segments = config.segments ?? DEFAULT_BLADE_CONFIG.segments;
  const tipTaper = config.tipTaper ?? DEFAULT_BLADE_CONFIG.tipTaper;

  const geometry = new THREE.BufferGeometry();
  const vertexCount = (segments + 1) * 2;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const normals = new Float32Array(vertexCount * 3);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments; // 0 at base, 1 at tip
    const y = t;

    // Width tapers from 1.0 at base to tipTaper at top
    const width = 1.0 - t * (1.0 - tipTaper);

    // Left vertex
    const leftIdx = i * 2;
    positions[leftIdx * 3 + 0] = -0.5 * width;
    positions[leftIdx * 3 + 1] = y;
    positions[leftIdx * 3 + 2] = 0;
    uvs[leftIdx * 2 + 0] = 0;
    uvs[leftIdx * 2 + 1] = t;
    normals[leftIdx * 3 + 0] = 0;
    normals[leftIdx * 3 + 1] = 0;
    normals[leftIdx * 3 + 2] = 1;

    // Right vertex
    const rightIdx = i * 2 + 1;
    positions[rightIdx * 3 + 0] = 0.5 * width;
    positions[rightIdx * 3 + 1] = y;
    positions[rightIdx * 3 + 2] = 0;
    uvs[rightIdx * 2 + 0] = 1;
    uvs[rightIdx * 2 + 1] = t;
    normals[rightIdx * 3 + 0] = 0;
    normals[rightIdx * 3 + 1] = 0;
    normals[rightIdx * 3 + 2] = 1;
  }

  // Create indices for triangle strip
  const triangleCount = segments * 2;
  const indices = new Uint16Array(triangleCount * 3);
  let idx = 0;

  for (let i = 0; i < segments; i++) {
    const base = i * 2;
    // First triangle
    indices[idx++] = base;
    indices[idx++] = base + 1;
    indices[idx++] = base + 2;
    // Second triangle
    indices[idx++] = base + 1;
    indices[idx++] = base + 3;
    indices[idx++] = base + 2;
  }

  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

  return geometry;
}

/**
 * Create a grass card geometry (billboard quad for LOD1)
 *
 * Cards are wider and represent multiple blades of grass
 * for efficient distant rendering.
 *
 * @param width - Card width
 * @param height - Card height
 * @returns BufferGeometry for a grass card
 */
export function createGrassCardGeometry(
  width = 0.8,
  height = 0.5,
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);

  // Shift origin to bottom center (grass grows from ground)
  const positions = geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] += height / 2; // Shift Y up by half height
  }
  geometry.attributes.position.needsUpdate = true;

  return geometry;
}

/**
 * Options for grass patch generation
 */
export interface GrassPatchOptions {
  /** Blade configuration */
  blade?: Partial<GrassBladeConfig>;
  /** Grass density per square meter */
  density?: number;
  /** Patch size in world units */
  patchSize?: number;
  /** Random seed for deterministic generation */
  seed?: number;
}

/**
 * Instance data for a grass blade
 */
export interface GrassInstanceData {
  /** World position X */
  x: number;
  /** World position Y (ground height) */
  y: number;
  /** World position Z */
  z: number;
  /** Height scale (0.7-1.3 typical) */
  heightScale: number;
  /** Rotation around Y axis */
  rotation: number;
  /** Width scale (0.8-1.2 typical) */
  widthScale: number;
  /** Color variation (0-1) */
  colorVariation: number;
  /** Wind phase offset */
  phaseOffset: number;
}

/**
 * Result of grass patch generation
 */
export interface GrassPatchResult {
  /** Number of grass instances */
  count: number;
  /** Instance position buffer (vec4: x, y, z, heightScale) */
  positionBuffer: Float32Array;
  /** Instance variation buffer (vec4: rotation, widthScale, colorVariation, phaseOffset) */
  variationBuffer: Float32Array;
}

/**
 * Simple seeded random number generator
 */
function createSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Generate grass instance data for a patch
 *
 * Creates randomized but deterministic grass placement within a square patch.
 * The instances are suitable for GPU instanced rendering.
 *
 * @param options - Patch generation options
 * @returns Instance data buffers for GPU rendering
 */
export function generateGrassPatch(
  options: GrassPatchOptions = {},
): GrassPatchResult {
  const density = options.density ?? 8;
  const patchSize = options.patchSize ?? 20;
  const seed = options.seed ?? 12345;

  const random = createSeededRandom(seed);
  const instanceCount = Math.floor(patchSize * patchSize * density);

  const positionBuffer = new Float32Array(instanceCount * 4);
  const variationBuffer = new Float32Array(instanceCount * 4);

  const halfSize = patchSize / 2;
  const spacing = Math.sqrt(1 / density);

  let count = 0;

  for (let gx = 0; gx < patchSize && count < instanceCount; gx += spacing) {
    for (let gz = 0; gz < patchSize && count < instanceCount; gz += spacing) {
      // Jittered grid placement
      const jitterX = (random() - 0.5) * spacing * 0.8;
      const jitterZ = (random() - 0.5) * spacing * 0.8;

      const x = gx - halfSize + jitterX;
      const z = gz - halfSize + jitterZ;
      const y = 0; // Ground height will be set by heightmap

      // Instance variation
      const heightScale = 0.7 + random() * 0.6;
      const rotation = random() * Math.PI * 2;
      const widthScale = 0.8 + random() * 0.4;
      const colorVariation = random();
      const phaseOffset = random() * Math.PI * 2;

      // Pack into buffers
      const i = count * 4;
      positionBuffer[i + 0] = x;
      positionBuffer[i + 1] = y;
      positionBuffer[i + 2] = z;
      positionBuffer[i + 3] = heightScale;

      variationBuffer[i + 0] = rotation;
      variationBuffer[i + 1] = widthScale;
      variationBuffer[i + 2] = colorVariation;
      variationBuffer[i + 3] = phaseOffset;

      count++;
    }
  }

  // Trim buffers to actual count
  return {
    count,
    positionBuffer: positionBuffer.slice(0, count * 4),
    variationBuffer: variationBuffer.slice(0, count * 4),
  };
}

/**
 * Create instanced mesh attributes from patch data
 *
 * Adds instancePosition and instanceVariation attributes to geometry
 * for use with instanced rendering.
 *
 * @param geometry - Base blade geometry
 * @param patchData - Generated patch instance data
 * @returns Geometry with instance attributes attached
 */
export function attachGrassInstanceAttributes(
  geometry: THREE.BufferGeometry,
  patchData: GrassPatchResult,
): THREE.BufferGeometry {
  const cloned = geometry.clone();

  const instancePosition = new THREE.InstancedBufferAttribute(
    patchData.positionBuffer,
    4,
  );
  const instanceVariation = new THREE.InstancedBufferAttribute(
    patchData.variationBuffer,
    4,
  );

  cloned.setAttribute("instancePosition", instancePosition);
  cloned.setAttribute("instanceVariation", instanceVariation);

  return cloned;
}
