/**
 * Geometry generation for trees.
 */

export {
  generateLeafGeometry,
  generateSeparateLeafGeometry,
  // Instanced rendering (optimized)
  generateInstancedLeaves,
  generateInstancedLeavesAndBlossoms,
  createLeafCardGeometry,
  createInstancedLeafMaterial,
  type InstancedLeafResult,
  type InstancedLeafOptions,
  type ProceduralLeafShape,
} from "./LeafGeometry.js";
export {
  generateBranchGeometry,
  generateBranchGeometryByDepth,
} from "./BranchGeometry.js";
export {
  getLeafShape,
  getBlossomShape,
  ALL_LEAF_SHAPES,
  ALL_BLOSSOM_SHAPES,
} from "./LeafShapes.js";
export {
  computeVertexAO,
  computeQuickVertexAO,
  enableVertexColorMaterials,
  type VertexAOOptions,
} from "./VertexAO.js";
