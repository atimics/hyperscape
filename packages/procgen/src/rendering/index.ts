/**
 * Tree rendering utilities.
 */

export {
  generateTreeMesh,
  createDefaultBranchMaterial,
  createDefaultLeafMaterial,
  createDefaultBlossomMaterial,
  createInstancedLeafMaterial,
  disposeTreeMesh,
  type TreeMeshOptions,
  type TreeMeshResult,
} from "./TreeMesh.js";

export {
  TreeGenerator,
  generateTree,
  generateTreeVariations,
  addTreeToScene,
  exportTreeToGLB,
  exportTreeToGLBFile,
  generateAndExportTree,
  type TreeGeneratorOptions,
  type GLBExportOptions,
  type GLBExportResult,
} from "./TreeGenerator.js";
