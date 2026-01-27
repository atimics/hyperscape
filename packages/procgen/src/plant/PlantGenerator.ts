/**
 * PlantGenerator - Main procedural plant generation API
 *
 * Provides the primary interface for generating procedural plants
 * with full Three.js integration.
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  CanvasTexture,
  DoubleSide,
  type Object3D,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import type {
  Point3D,
  MeshData,
  LeafParamDict,
  LeafBundle,
  PlantGenerationOptions,
  PlantGenerationResult,
  PlantPresetName,
  RenderQuality,
  QualitySettings,
} from "./types.js";
import { LPK, RenderQuality as RQ } from "./types.js";

import { SeededRandom } from "./math/Random.js";
import { getExtents3D, add3D } from "./math/Vector.js";

import { generateLeafShape } from "./shape/LeafShape.js";
import {
  createDefaultParams,
  getParamValue,
} from "./params/LeafParamDefaults.js";
import { generateLeafVeins, getMidrib } from "./veins/LeafVeins.js";
import { triangulateLeaf } from "./mesh/Triangulation.js";
import { extrudeLeafMesh, applyMidribGroove } from "./mesh/Extrusion.js";
import { applyDistortions } from "./distortion/LeafDistortion.js";
import { generateAllTextures } from "./texture/TextureGenerator.js";
import {
  generateTrunk,
  generateStem,
  calculateArrangements,
  applyCollisionAvoidance,
} from "./assembly/Arrangement.js";
import {
  PRESETS,
  getPreset,
  getPresetNames,
  applyPreset,
  createParamsFromPreset,
} from "./presets/PlantPresets.js";

// =============================================================================
// GLB EXPORT TYPES
// =============================================================================

/**
 * Export options for GLB generation
 */
export interface PlantGLBExportOptions {
  /** Filename without extension */
  filename?: string;
  /** Whether to download automatically (browser only) */
  download?: boolean;
  /** Apply transforms to geometry (bake transforms) */
  bakeTransforms?: boolean;
}

/**
 * Export result containing the GLB data
 */
export interface PlantGLBExportResult {
  /** Raw GLB data as ArrayBuffer */
  data: ArrayBuffer;
  /** Suggested filename with extension */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** Statistics about the export */
  stats: {
    vertexCount: number;
    triangleCount: number;
    meshCount: number;
    fileSizeBytes: number;
  };
}

// =============================================================================
// QUALITY SETTINGS
// =============================================================================

const QUALITY_SETTINGS: Record<RenderQuality, QualitySettings> = {
  [RQ.Minimum]: {
    subdivSteps: 0,
    renderLineSteps: 6,
    textureDownsample: 4,
    meshDensity: 0.5,
  },
  [RQ.Medium]: {
    subdivSteps: 1,
    renderLineSteps: 10,
    textureDownsample: 2,
    meshDensity: 0.75,
  },
  [RQ.Maximum]: {
    subdivSteps: 2,
    renderLineSteps: 15,
    textureDownsample: 1,
    meshDensity: 1.0,
  },
  [RQ.Current]: {
    subdivSteps: 1,
    renderLineSteps: 10,
    textureDownsample: 2,
    meshDensity: 0.75,
  },
  [RQ.Custom]: {
    subdivSteps: 1,
    renderLineSteps: 10,
    textureDownsample: 1,
    meshDensity: 1.0,
  },
};

// =============================================================================
// MESH DATA TO BUFFER GEOMETRY
// =============================================================================

/**
 * Convert MeshData to Three.js BufferGeometry
 */
function meshDataToBufferGeometry(meshData: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();

  // Vertices
  const positions = new Float32Array(meshData.vertices.length * 3);
  for (let i = 0; i < meshData.vertices.length; i++) {
    positions[i * 3] = meshData.vertices[i].x;
    positions[i * 3 + 1] = meshData.vertices[i].y;
    positions[i * 3 + 2] = meshData.vertices[i].z;
  }
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  // Normals
  const normals = new Float32Array(meshData.normals.length * 3);
  for (let i = 0; i < meshData.normals.length; i++) {
    normals[i * 3] = meshData.normals[i].x;
    normals[i * 3 + 1] = meshData.normals[i].y;
    normals[i * 3 + 2] = meshData.normals[i].z;
  }
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));

  // UVs
  const uvs = new Float32Array(meshData.uvs.length * 2);
  for (let i = 0; i < meshData.uvs.length; i++) {
    uvs[i * 2] = meshData.uvs[i].x;
    uvs[i * 2 + 1] = meshData.uvs[i].y;
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));

  // Triangles
  geometry.setIndex(
    new Uint32BufferAttribute(new Uint32Array(meshData.triangles), 1),
  );

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Convert ImageData to Three.js CanvasTexture
 */
function imageDataToTexture(imageData: ImageData): CanvasTexture {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);

  // Create a regular canvas for Three.js compatibility
  const regularCanvas = document.createElement("canvas");
  regularCanvas.width = imageData.width;
  regularCanvas.height = imageData.height;
  const regularCtx = regularCanvas.getContext("2d")!;
  regularCtx.putImageData(imageData, 0, 0);

  return new CanvasTexture(regularCanvas);
}

// =============================================================================
// STEM MESH GENERATION
// =============================================================================

/**
 * Calculate stem shape scale at a given percentage along the stem
 * Matches original C# LeafStem.ShapeScaleAtPercent
 * Only tapers in the last 5% (0.95 to 1.0)
 * Exported for testing
 */
export function shapeScaleAtPercent(perc: number): number {
  if (perc <= 0.95) return 1;
  // 1.0 to 0.0 from 0.95 to 1.0
  let ret = 1 - (perc - 0.95) * 20;
  const floor = 0.25;
  // Scale from 1.0 to floor
  ret = ret * (1 - floor) + floor;
  // EaseOutQuad
  ret = 1 - (1 - ret) * (1 - ret);
  return ret;
}

/**
 * Evaluate cubic bezier curve at t
 * Exported for testing
 */
export function evaluateBezierPoint(
  curve: { p0: Point3D; h0: Point3D; h1: Point3D; p1: Point3D },
  t: number,
): Point3D {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  return {
    x:
      mt3 * curve.p0.x +
      3 * mt2 * t * curve.h0.x +
      3 * mt * t2 * curve.h1.x +
      t3 * curve.p1.x,
    y:
      mt3 * curve.p0.y +
      3 * mt2 * t * curve.h0.y +
      3 * mt * t2 * curve.h1.y +
      t3 * curve.p1.y,
    z:
      mt3 * curve.p0.z +
      3 * mt2 * t * curve.h0.z +
      3 * mt * t2 * curve.h1.z +
      t3 * curve.p1.z,
  };
}

/**
 * Get first derivative (tangent) of cubic bezier at t
 * Exported for testing
 */
export function getBezierTangent(
  curve: { p0: Point3D; h0: Point3D; h1: Point3D; p1: Point3D },
  t: number,
): Point3D {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  // First derivative of cubic bezier
  return {
    x:
      3 * mt2 * (curve.h0.x - curve.p0.x) +
      6 * mt * t * (curve.h1.x - curve.h0.x) +
      3 * t2 * (curve.p1.x - curve.h1.x),
    y:
      3 * mt2 * (curve.h0.y - curve.p0.y) +
      6 * mt * t * (curve.h1.y - curve.h0.y) +
      3 * t2 * (curve.p1.y - curve.h1.y),
    z:
      3 * mt2 * (curve.h0.z - curve.p0.z) +
      6 * mt * t * (curve.h1.z - curve.h0.z) +
      3 * t2 * (curve.p1.z - curve.h1.z),
  };
}

/**
 * Create quaternion that rotates to look along direction
 * Matches Unity's Quaternion.LookRotation(forward, up)
 * Exported for testing
 */
export function lookRotation(
  forward: Point3D,
  up: Point3D = { x: 0, y: 1, z: 0 },
): { x: number; y: number; z: number; w: number } {
  // Normalize forward
  const fLen = Math.sqrt(
    forward.x * forward.x + forward.y * forward.y + forward.z * forward.z,
  );
  if (fLen < 0.0001) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  const fwd = { x: forward.x / fLen, y: forward.y / fLen, z: forward.z / fLen };

  // Calculate right = cross(up, forward)
  let right = {
    x: up.y * fwd.z - up.z * fwd.y,
    y: up.z * fwd.x - up.x * fwd.z,
    z: up.x * fwd.y - up.y * fwd.x,
  };
  const rLen = Math.sqrt(
    right.x * right.x + right.y * right.y + right.z * right.z,
  );
  if (rLen < 0.0001) {
    // up and forward are parallel, pick arbitrary right
    right = { x: 1, y: 0, z: 0 };
  } else {
    right = { x: right.x / rLen, y: right.y / rLen, z: right.z / rLen };
  }

  // Recalculate up = cross(forward, right)
  const newUp = {
    x: fwd.y * right.z - fwd.z * right.y,
    y: fwd.z * right.x - fwd.x * right.z,
    z: fwd.x * right.y - fwd.y * right.x,
  };

  // Build rotation matrix and extract quaternion
  // Matrix is [right, newUp, fwd] as columns
  const m00 = right.x,
    m01 = newUp.x,
    m02 = fwd.x;
  const m10 = right.y,
    m11 = newUp.y,
    m12 = fwd.y;
  const m20 = right.z,
    m21 = newUp.z,
    m22 = fwd.z;

  const trace = m00 + m11 + m22;
  let qw: number, qx: number, qy: number, qz: number;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  return { x: qx, y: qy, z: qz, w: qw };
}

/**
 * Rotate a 3D point by quaternion
 * Exported for testing
 */
export function rotatePointByQuat(
  p: Point3D,
  q: { x: number; y: number; z: number; w: number },
): Point3D {
  // Quaternion * vector * quaternion conjugate
  const ix = q.w * p.x + q.y * p.z - q.z * p.y;
  const iy = q.w * p.y + q.z * p.x - q.x * p.z;
  const iz = q.w * p.z + q.x * p.y - q.y * p.x;
  const iw = -q.x * p.x - q.y * p.y - q.z * p.z;

  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

/**
 * Get stem points and normals from all curves
 * Matches original C# StemRenderer.GetStemPoints
 */
/**
 * Get stem points and tangents from curves
 * MATCHES C# StemRenderer.GetStemPoints
 */
function getStemPoints(
  curves: { p0: Point3D; h0: Point3D; h1: Point3D; p1: Point3D }[],
  baseLineSteps: number,
  threshold: number = 0.2,
): { points: Point3D[]; normals: Point3D[] } {
  const points: Point3D[] = [];
  const normals: Point3D[] = [];

  for (let curveIdx = 0; curveIdx < curves.length; curveIdx++) {
    const curve = curves[curveIdx];

    // Calculate curve length for adaptive stepping (like C#)
    const curveLen = fastCurveLength3D(curve);

    // Adaptive lineSteps based on curve length (matches C#)
    // Original: lineSteps = Min(baseLineSteps, Round(len / threshold))
    const lineSteps = Math.min(
      baseLineSteps,
      Math.max(1, Math.round(curveLen / threshold)),
    );

    // Skip first point of subsequent curves to avoid duplicates (matches C#)
    const startIdx = curveIdx === 0 ? 0 : 1;

    for (let i = startIdx; i <= lineSteps; i++) {
      const t = i / lineSteps;
      points.push(evaluateBezierPoint(curve, t));
      normals.push(getBezierTangent(curve, t));
    }
  }

  return { points, normals };
}

/**
 * Fast approximation of 3D bezier curve length
 */
function fastCurveLength3D(curve: {
  p0: Point3D;
  h0: Point3D;
  h1: Point3D;
  p1: Point3D;
}): number {
  // Approximate by averaging chord and control polygon lengths
  const chordLen = Math.sqrt(
    Math.pow(curve.p1.x - curve.p0.x, 2) +
      Math.pow(curve.p1.y - curve.p0.y, 2) +
      Math.pow(curve.p1.z - curve.p0.z, 2),
  );

  const seg1 = Math.sqrt(
    Math.pow(curve.h0.x - curve.p0.x, 2) +
      Math.pow(curve.h0.y - curve.p0.y, 2) +
      Math.pow(curve.h0.z - curve.p0.z, 2),
  );
  const seg2 = Math.sqrt(
    Math.pow(curve.h1.x - curve.h0.x, 2) +
      Math.pow(curve.h1.y - curve.h0.y, 2) +
      Math.pow(curve.h1.z - curve.h0.z, 2),
  );
  const seg3 = Math.sqrt(
    Math.pow(curve.p1.x - curve.h1.x, 2) +
      Math.pow(curve.p1.y - curve.h1.y, 2) +
      Math.pow(curve.p1.z - curve.h1.z, 2),
  );

  const polyLen = seg1 + seg2 + seg3;
  return (chordLen + polyLen) / 2;
}

/**
 * Get leaf attachment info from stem curves
 * Matches original C# StemRenderer.GetAttachmentInfo
 */
function getLeafAttachmentInfo(
  curves: { p0: Point3D; h0: Point3D; h1: Point3D; p1: Point3D }[],
  leafZAngle: number,
): {
  position: Point3D;
  rotation: { x: number; y: number; z: number; w: number };
} {
  const { points, normals } = getStemPoints(curves, 2);

  if (points.length === 0 || normals.length === 0) {
    // Log warning for debugging - this indicates invalid stem curve data
    console.warn(
      "[PlantGenerator] getLeafAttachmentInfo: empty stem points/normals, returning identity",
    );
    return {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    };
  }

  const lastPoint = points[points.length - 1];
  const lastNormal = normals[normals.length - 1];

  // Normalize the normal
  const nLen = Math.sqrt(
    lastNormal.x * lastNormal.x +
      lastNormal.y * lastNormal.y +
      lastNormal.z * lastNormal.z,
  );
  const normalizedNormal =
    nLen > 0.0001
      ? {
          x: lastNormal.x / nLen,
          y: lastNormal.y / nLen,
          z: lastNormal.z / nLen,
        }
      : { x: 0, y: 1, z: 0 };

  // Add small buffer along normal direction (0.02 units)
  const buffer = 0.02;
  const position: Point3D = {
    x: lastPoint.x + normalizedNormal.x * buffer,
    y: lastPoint.y + normalizedNormal.y * buffer,
    z: lastPoint.z + normalizedNormal.z * buffer,
  };

  // Calculate rotation: LookRotation(normal, up) * Euler(0, 180, leafZAngle)
  const lookRot = lookRotation(normalizedNormal, { x: 0, y: 1, z: 0 });

  // Create Euler rotation (0, 180, leafZAngle) in radians
  const eulerRad = { x: 0, y: Math.PI, z: (leafZAngle * Math.PI) / 180 };
  const cx = Math.cos(eulerRad.x / 2);
  const cy = Math.cos(eulerRad.y / 2);
  const cz = Math.cos(eulerRad.z / 2);
  const sx = Math.sin(eulerRad.x / 2);
  const sy = Math.sin(eulerRad.y / 2);
  const sz = Math.sin(eulerRad.z / 2);

  const eulerQuat = {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };

  // Multiply quaternions: lookRot * eulerQuat
  const rotation = {
    x:
      lookRot.w * eulerQuat.x +
      lookRot.x * eulerQuat.w +
      lookRot.y * eulerQuat.z -
      lookRot.z * eulerQuat.y,
    y:
      lookRot.w * eulerQuat.y -
      lookRot.x * eulerQuat.z +
      lookRot.y * eulerQuat.w +
      lookRot.z * eulerQuat.x,
    z:
      lookRot.w * eulerQuat.z +
      lookRot.x * eulerQuat.y -
      lookRot.y * eulerQuat.x +
      lookRot.z * eulerQuat.w,
    w:
      lookRot.w * eulerQuat.w -
      lookRot.x * eulerQuat.x -
      lookRot.y * eulerQuat.y -
      lookRot.z * eulerQuat.z,
  };

  return { position, rotation };
}

/**
 * Create stem shape points - EXACTLY matches C# LeafStem.CreateShape
 * Uses Polar3 spherical coordinates: (len, lat, longi) where
 * Vector = (len * sin(longi) * cos(lat), len * sin(longi) * sin(lat), len * cos(longi))
 * With lat=0: x = len*sin(longi), y = 0, z = len*cos(longi)
 * Exported for testing
 */
export function createStemShape(width: number, sides: number = 6): Point3D[] {
  const shape: Point3D[] = [];
  const PI = Math.PI;
  const PI2 = PI * 2;

  for (let i = 0; i < sides; i++) {
    // Original: new Polar3(s, 0, (float)i / (float)sides * Polar.Pi2 + Polar.Pi).Vector
    // lat=0, longi = (i/sides) * 2π + π
    const longi = (i / sides) * PI2 + PI;

    // Polar3.Vector with lat=0:
    // x = len * sin(longi) * cos(0) = len * sin(longi)
    // y = len * sin(longi) * sin(0) = 0
    // z = len * cos(longi)
    shape.push({
      x: width * Math.sin(longi),
      y: 0,
      z: width * Math.cos(longi),
    });
  }

  return shape;
}

/**
 * Generate stem mesh from ALL curves
 * Matches original C# StemRenderer.Render EXACTLY
 */
function generateStemMesh(
  stem: { curves: { p0: Point3D; h0: Point3D; h1: Point3D; p1: Point3D }[] },
  width: number,
  segments: number = 6,
): MeshData {
  const vertices: Point3D[] = [];
  const triangles: number[] = [];
  const uvs: { x: number; y: number }[] = [];
  const normals: Point3D[] = [];

  // Get all stem points and normals from ALL curves
  const baseLineSteps = 5;
  const { points: stemPoints, normals: stemNormals } = getStemPoints(
    stem.curves,
    baseLineSteps,
  );

  if (stemPoints.length === 0) {
    // Log warning - this indicates invalid stem curve data
    console.warn(
      "[PlantGenerator] generateStemMesh: no stem points from curves, returning empty mesh",
    );
    return {
      vertices: [],
      triangles: [],
      uvs: [],
      normals: [],
      colors: [],
      orderedEdgeVerts: [],
    };
  }

  // Face forward rotation - EXACTLY matches Quaternion.Euler(90, 0, 0)
  // This rotates 90° around X axis
  const faceForward = {
    x: Math.sin(Math.PI / 4), // sin(45°) = 0.7071...
    y: 0,
    z: 0,
    w: Math.cos(Math.PI / 4), // cos(45°) = 0.7071...
  };

  // Create shape points using Polar3 (EXACTLY like original)
  const shapePoints = createStemShape(width, segments);

  // Generate vertices for each stem point
  for (let i = 0; i < stemPoints.length; i++) {
    const stemPoint = stemPoints[i];
    const normal = stemNormals[i];
    const perc = i / (stemPoints.length - 1);

    // Normalize and truncate normal (matches original .normalized.Truncate())
    const nLen = Math.sqrt(
      normal.x * normal.x + normal.y * normal.y + normal.z * normal.z,
    );
    let normalizedNormal: Point3D;
    if (nLen > 0.0001) {
      // Truncate to 3 decimal places like original
      normalizedNormal = {
        x: Math.round((normal.x / nLen) * 1000) / 1000,
        y: Math.round((normal.y / nLen) * 1000) / 1000,
        z: Math.round((normal.z / nLen) * 1000) / 1000,
      };
    } else {
      normalizedNormal = { x: 0, y: 1, z: 0 };
    }

    // Check if normal is not zero/NaN (SoftEquals check from original)
    const isZero =
      Math.abs(normalizedNormal.x) < 0.001 &&
      Math.abs(normalizedNormal.y) < 0.001 &&
      Math.abs(normalizedNormal.z) < 0.001;

    // Get rotation to orient shape along curve direction
    // Original: q = !normal.SoftEquals(Vector3.zero) ? Quaternion.LookRotation(normal, Vector3.up) : Quaternion.identity
    const q = !isZero
      ? lookRotation(normalizedNormal, { x: 0, y: 1, z: 0 })
      : { x: 0, y: 0, z: 0, w: 1 };

    // Width modifier based on position (taper at tip) - matches ShapeScaleAtPercent
    const widthMod = shapeScaleAtPercent(perc);

    for (let j = 0; j < segments; j++) {
      const shapePoint = shapePoints[j];

      // Scale shape point - matches: widthMod * Vector3.Lerp(Vector3.zero, shapePoint, ShapeScaleAtPercent)
      // But ShapeScaleAtPercent is already applied via widthMod
      const scaledPoint: Point3D = {
        x: shapePoint.x * widthMod,
        y: shapePoint.y * widthMod,
        z: shapePoint.z * widthMod,
      };

      // Check for zero scaled point (single point case)
      const isScaledZero =
        scaledPoint.x === 0 && scaledPoint.y === 0 && scaledPoint.z === 0;

      if (isScaledZero) {
        // Single point - just add stem position
        vertices.push({
          x: stemPoint.x,
          y: stemPoint.y,
          z: stemPoint.z,
        });
      } else {
        // Rotate by faceForward then by curve orientation
        // Original: Vector3 rotatedPoint = q * faceForward * scaledPoint;
        const rotatedByFace = rotatePointByQuat(scaledPoint, faceForward);
        const rotatedPoint = rotatePointByQuat(rotatedByFace, q);

        vertices.push({
          x: rotatedPoint.x + stemPoint.x,
          y: rotatedPoint.y + stemPoint.y,
          z: rotatedPoint.z + stemPoint.z,
        });
      }

      uvs.push({
        x: j / segments,
        y: perc,
      });

      // Calculate outward normal
      const lastVert = vertices[vertices.length - 1];
      const outward = {
        x: lastVert.x - stemPoint.x,
        y: lastVert.y - stemPoint.y,
        z: lastVert.z - stemPoint.z,
      };
      const outLen = Math.sqrt(
        outward.x * outward.x + outward.y * outward.y + outward.z * outward.z,
      );
      normals.push(
        outLen > 0.0001
          ? {
              x: outward.x / outLen,
              y: outward.y / outLen,
              z: outward.z / outLen,
            }
          : { x: 0, y: 1, z: 0 },
      );
    }
  }

  // Generate triangles - MUST match C# StemRenderer winding order
  // C# uses: vn -> vn+sides -> lessOne, and vn+sides -> lessOne+sides -> lessOne
  // Where lessOne = vn - 1 (with wraparound)
  for (let ring = 0; ring < stemPoints.length - 1; ring++) {
    const floor = ring * segments;
    const ceil = floor + segments;

    for (let vn = floor; vn < ceil; vn++) {
      // lessOne wraps around within the current ring
      let lessOne = vn - 1;
      if (lessOne < floor) lessOne += segments;

      // Triangle 1: current vertex -> next ring same position -> previous vertex
      // Triangle 2: next ring same position -> next ring previous position -> previous vertex
      triangles.push(vn, vn + segments, lessOne);
      triangles.push(vn + segments, lessOne + segments, lessOne);
    }
  }

  return {
    vertices,
    triangles,
    uvs,
    normals,
    // Colors: white (1,1,1,1) - stem color is applied via material, not vertex colors
    colors: new Array(vertices.length * 4).fill(1),
    // orderedEdgeVerts: empty - not needed for stem meshes (used for leaf edge processing)
    orderedEdgeVerts: [],
  };
}

/**
 * Trunk taper function - MATCHES C# PlantTrunk.ShapeScaleAtPercent
 * Tapers quadratically from taperStartPerc to 1.0
 * Exported for testing
 */
export function trunkShapeScaleAtPercent(
  perc: number,
  taperStartPerc: number,
): number {
  if (perc <= taperStartPerc) return 1;
  if (perc >= 0.99) return 0;

  // Remap perc from [taperStartPerc, 1] to [0, 1]
  const newPerc = (perc - taperStartPerc) / (1.0 - taperStartPerc);
  // Quadratic ease (square)
  const squared = newPerc * newPerc;
  // Taper from 1 to 0
  return 1 - squared;
}

/**
 * Generate trunk mesh with proper trunk taper (different from stem taper)
 * Trunk uses 16 sides and quadratic taper starting from taperStartPerc
 */
function generateTrunkMesh(
  stem: { curves: { p0: Point3D; h0: Point3D; h1: Point3D; p1: Point3D }[] },
  width: number,
  segments: number = 16,
  taperStartPerc: number = 0.9,
): MeshData {
  const vertices: Point3D[] = [];
  const triangles: number[] = [];
  const uvs: { x: number; y: number }[] = [];
  const normals: Point3D[] = [];

  const baseLineSteps = 5;
  const { points: stemPoints, normals: stemNormals } = getStemPoints(
    stem.curves,
    baseLineSteps,
  );

  if (stemPoints.length === 0) {
    // Log warning - this indicates invalid trunk curve data
    console.warn(
      "[PlantGenerator] generateTrunkMesh: no stem points from curves, returning empty mesh",
    );
    return {
      vertices: [],
      triangles: [],
      uvs: [],
      normals: [],
      colors: [],
      orderedEdgeVerts: [],
    };
  }

  const faceForward = {
    x: Math.sin(Math.PI / 4),
    y: 0,
    z: 0,
    w: Math.cos(Math.PI / 4),
  };

  const shapePoints = createStemShape(width, segments);

  for (let i = 0; i < stemPoints.length; i++) {
    const stemPoint = stemPoints[i];
    const normal = stemNormals[i];
    const perc = i / (stemPoints.length - 1);

    const nLen = Math.sqrt(
      normal.x * normal.x + normal.y * normal.y + normal.z * normal.z,
    );
    let normalizedNormal: Point3D;
    if (nLen > 0.0001) {
      normalizedNormal = {
        x: Math.round((normal.x / nLen) * 1000) / 1000,
        y: Math.round((normal.y / nLen) * 1000) / 1000,
        z: Math.round((normal.z / nLen) * 1000) / 1000,
      };
    } else {
      normalizedNormal = { x: 0, y: 1, z: 0 };
    }

    const isZero =
      Math.abs(normalizedNormal.x) < 0.001 &&
      Math.abs(normalizedNormal.y) < 0.001 &&
      Math.abs(normalizedNormal.z) < 0.001;

    const q = !isZero
      ? lookRotation(normalizedNormal, { x: 0, y: 1, z: 0 })
      : { x: 0, y: 0, z: 0, w: 1 };

    // Use trunk taper (quadratic from taperStartPerc)
    const widthMod = trunkShapeScaleAtPercent(perc, taperStartPerc);

    for (let j = 0; j < segments; j++) {
      const shapePoint = shapePoints[j];

      const scaledPoint: Point3D = {
        x: shapePoint.x * widthMod,
        y: shapePoint.y * widthMod,
        z: shapePoint.z * widthMod,
      };

      const isScaledZero =
        scaledPoint.x === 0 && scaledPoint.y === 0 && scaledPoint.z === 0;

      if (isScaledZero) {
        vertices.push({
          x: stemPoint.x,
          y: stemPoint.y,
          z: stemPoint.z,
        });
      } else {
        const rotatedByFace = rotatePointByQuat(scaledPoint, faceForward);
        const rotatedPoint = rotatePointByQuat(rotatedByFace, q);

        vertices.push({
          x: rotatedPoint.x + stemPoint.x,
          y: rotatedPoint.y + stemPoint.y,
          z: rotatedPoint.z + stemPoint.z,
        });
      }

      uvs.push({
        x: j / segments,
        y: perc,
      });

      const lastVert = vertices[vertices.length - 1];
      const outward = {
        x: lastVert.x - stemPoint.x,
        y: lastVert.y - stemPoint.y,
        z: lastVert.z - stemPoint.z,
      };
      const outLen = Math.sqrt(
        outward.x * outward.x + outward.y * outward.y + outward.z * outward.z,
      );
      normals.push(
        outLen > 0.0001
          ? {
              x: outward.x / outLen,
              y: outward.y / outLen,
              z: outward.z / outLen,
            }
          : { x: 0, y: 1, z: 0 },
      );
    }
  }

  // Generate triangles (same winding as stem)
  for (let ring = 0; ring < stemPoints.length - 1; ring++) {
    const floor = ring * segments;
    const ceil = floor + segments;

    for (let vn = floor; vn < ceil; vn++) {
      let lessOne = vn - 1;
      if (lessOne < floor) lessOne += segments;

      triangles.push(vn, vn + segments, lessOne);
      triangles.push(vn + segments, lessOne + segments, lessOne);
    }
  }

  return {
    vertices,
    triangles,
    uvs,
    normals,
    // Colors: white (1,1,1,1) - trunk color is applied via material, not vertex colors
    colors: new Array(vertices.length * 4).fill(1),
    // orderedEdgeVerts: empty - not needed for trunk meshes (used for leaf edge processing)
    orderedEdgeVerts: [],
  };
}

// =============================================================================
// PLANT GENERATOR CLASS
// =============================================================================

/**
 * Main plant generator class
 */
export class PlantGenerator {
  private params: LeafParamDict;
  private options: PlantGenerationOptions;
  private random: SeededRandom;

  constructor(options?: Partial<PlantGenerationOptions>) {
    this.options = {
      seed: Date.now(),
      quality: RQ.Maximum,
      distortionInstances: 1,
      generateTextures: true,
      textureSize: 1024,
      ...options,
    };

    this.random = new SeededRandom(this.options.seed);
    this.params = createDefaultParams();
  }

  /**
   * Set the random seed
   */
  setSeed(seed: number): this {
    this.options.seed = seed;
    this.random.setSeed(seed);
    return this;
  }

  /**
   * Set quality level
   */
  setQuality(quality: RenderQuality): this {
    this.options.quality = quality;
    return this;
  }

  /**
   * Set texture size
   */
  setTextureSize(size: number): this {
    this.options.textureSize = size;
    return this;
  }

  /**
   * Enable/disable texture generation
   */
  setGenerateTextures(enabled: boolean): this {
    this.options.generateTextures = enabled;
    return this;
  }

  /**
   * Set number of distortion instances
   */
  setDistortionInstances(count: number): this {
    this.options.distortionInstances = Math.max(1, count);
    return this;
  }

  /**
   * Load a preset
   */
  loadPreset(presetName: PlantPresetName): this {
    const preset = getPreset(presetName);
    applyPreset(this.params, preset);
    return this;
  }

  /**
   * Get current parameters
   */
  getParams(): LeafParamDict {
    return this.params;
  }

  /**
   * Set parameters (batch update)
   */
  setParams(paramsUpdate: Partial<Record<LPK, number>>): this {
    for (const [key, value] of Object.entries(paramsUpdate)) {
      const lpk = key as LPK;
      if (this.params[lpk] && value !== undefined) {
        const param = this.params[lpk];
        param.value = Math.max(
          param.range.min,
          Math.min(param.range.max, value),
        );
        param.enabled = true;
      }
    }
    return this;
  }

  /**
   * Replace all parameters
   */
  replaceParams(params: LeafParamDict): this {
    this.params = params;
    return this;
  }

  /**
   * Set a single parameter value
   */
  setParam(key: LPK, value: number): this {
    const param = this.params[key];
    if (param) {
      param.value = Math.max(param.range.min, Math.min(param.range.max, value));
      param.enabled = true;
    }
    return this;
  }

  /**
   * Generate a complete plant
   */
  generate(): PlantGenerationResult {
    const startTime = performance.now();

    const quality = QUALITY_SETTINGS[this.options.quality];
    const seed = this.options.seed;

    // Generate leaf shape
    const shape = generateLeafShape(this.params);

    // Generate veins
    const veins = generateLeafVeins(shape, this.params, seed);
    const midrib = getMidrib(veins);

    // Triangulate mesh
    let baseMesh = triangulateLeaf(shape.curves, {
      lineSteps: quality.renderLineSteps,
      addInternalPoints: true,
    });

    // Apply extrusion
    baseMesh = extrudeLeafMesh(baseMesh, this.params);

    // Apply midrib groove if midrib exists
    if (midrib) {
      const midribWidth =
        getParamValue(this.params, LPK.NormalMidribWidth) * 0.1;
      const midribDepth =
        getParamValue(this.params, LPK.NormalMidribDepth) * 0.02;
      applyMidribGroove(baseMesh, midribWidth, midribDepth);
    }

    // Apply distortions
    let leafMesh = baseMesh;
    if (midrib) {
      leafMesh = applyDistortions(baseMesh, midrib, this.params, seed);
    }

    // Generate textures
    let textures: {
      albedo: ImageData | null;
      normal: ImageData | null;
      height: ImageData | null;
    } = {
      albedo: null,
      normal: null,
      height: null,
    };

    if (this.options.generateTextures) {
      const textureSize = this.options.textureSize / quality.textureDownsample;
      const generated = generateAllTextures(
        shape,
        veins,
        this.params,
        textureSize,
        seed,
      );
      textures = generated;
    }

    // Generate trunk
    // Original C# trunk height: topStemPos + NodeDistance (for taper)
    // topStemPos = NodeDistance * (LeafCount - 1) + NodeInitialY + potYAdd
    const leafCount = Math.floor(getParamValue(this.params, LPK.LeafCount));
    const nodeDistance = getParamValue(this.params, LPK.NodeDistance);
    const nodeInitialY = getParamValue(this.params, LPK.NodeInitialY);
    // Top stem position (where the last leaf attaches)
    const topStemPos = nodeDistance * Math.max(0, leafCount - 1) + nodeInitialY;
    // Trunk extends one NodeDistance above last leaf for tapering (matches C#)
    const taperDist = nodeDistance;
    const trunkHeight = topStemPos + taperDist;
    const trunk = generateTrunk(this.params, Math.max(0.1, trunkHeight), seed);

    // Calculate arrangements
    const arrangements = calculateArrangements(this.params, trunk, seed);

    // Generate leaf bundles
    const leafBundles: LeafBundle[] = [];
    const leafGeometry = meshDataToBufferGeometry(leafMesh);
    const baseAABB = {
      min: getExtents3D(leafMesh.vertices).min,
      max: getExtents3D(leafMesh.vertices).max,
    };

    for (let i = 0; i < arrangements.length; i++) {
      const arrangement = arrangements[i];

      // Generate stem
      const direction: Point3D = { x: 1, y: 0, z: 0 };
      const stemData = generateStem(
        arrangement.pos,
        direction,
        this.params,
        arrangement,
        seed + i,
      );

      // Generate stem mesh
      // Original C#: float s = 0.25f * fields[LPK.StemWidth].value * scale
      // The stem width is scaled by arrangement.scale
      const stemWidth =
        0.25 * getParamValue(this.params, LPK.StemWidth) * arrangement.scale;
      const stemMeshData = generateStemMesh(stemData, stemWidth, 6);
      const stemGeometry = meshDataToBufferGeometry(stemMeshData);

      leafBundles.push({
        leafMesh: leafGeometry.clone(),
        stemMesh: stemGeometry,
        leafStem: stemData,
        arrangementData: arrangement,
        collisionAdjustment: { x: 0, y: 0, z: 0 },
        visible: true,
      });
    }

    // Apply collision avoidance
    applyCollisionAvoidance(leafBundles, baseAABB, this.params);

    // Generate trunk mesh with proper taper (different from stem taper)
    // Trunk taper: starts at topStemPos / trunkHeight, goes to 0 at tip
    const taperStartPerc = trunkHeight > 0 ? topStemPos / trunkHeight : 0.9;
    const trunkMeshData = generateTrunkMesh(
      { curves: trunk.curves },
      trunk.width * 0.5,
      16, // 16 sides for trunk (matches C#)
      taperStartPerc,
    );
    const trunkGeometry = meshDataToBufferGeometry(trunkMeshData);

    // Create Three.js group
    const group = new Group();
    group.name = "Plant";

    // Create materials
    const leafMaterial = new MeshStandardMaterial({
      color: 0x228b22,
      roughness: 0.7,
      metalness: 0.0,
      side: DoubleSide,
    });

    if (textures.albedo) {
      leafMaterial.map = imageDataToTexture(textures.albedo);
    }
    if (textures.normal) {
      leafMaterial.normalMap = imageDataToTexture(textures.normal);
    }

    const stemMaterial = new MeshStandardMaterial({
      color: 0x2d5a27,
      roughness: 0.8,
      metalness: 0.0,
    });

    // Add trunk mesh
    const trunkMesh = new Mesh(trunkGeometry, stemMaterial);
    trunkMesh.name = "Trunk";
    group.add(trunkMesh);

    // Add leaf bundles
    for (let i = 0; i < leafBundles.length; i++) {
      const bundle = leafBundles[i];
      if (!bundle.visible) continue;

      const leafGroup = new Group();
      leafGroup.name = `LeafBundle_${i}`;

      // Position bundle at trunk attachment point
      // Original C#: transform.localPosition = d.pos + collisionAdjustment
      const pos = add3D(bundle.arrangementData.pos, bundle.collisionAdjustment);
      leafGroup.position.set(pos.x, pos.y, pos.z);

      // Rotation of the entire bundle (stem rotation around Y)
      // Original C#: transform.localRotation = d.stemRotation
      const q = bundle.arrangementData.stemRotation;
      leafGroup.quaternion.set(q.x, q.y, q.z, q.w);

      // IMPORTANT: Scale is NOT applied to the bundle!
      // Original C# only scales the leaf child, not the stem
      // leafGroup.scale stays at (1, 1, 1)

      // Add stem mesh (unscaled)
      const stemMeshObj = new Mesh(bundle.stemMesh, stemMaterial);
      stemMeshObj.name = "Stem";
      leafGroup.add(stemMeshObj);

      // Add leaf at end of stem with proper attachment
      const leafMeshObj = new Mesh(bundle.leafMesh, leafMaterial);
      leafMeshObj.name = "Leaf";

      // Get leaf attachment info using stem curves (matches StemRenderer.GetAttachmentInfo)
      const stemCurves = bundle.leafStem.curves;
      const attachmentInfo = getLeafAttachmentInfo(
        stemCurves,
        bundle.arrangementData.leafZAngle,
      );

      // Position leaf at attachment point
      leafMeshObj.position.set(
        attachmentInfo.position.x,
        attachmentInfo.position.y,
        attachmentInfo.position.z,
      );

      // Apply attachment rotation
      // Original C#: leafRotation = Quaternion.Euler(0, 0, stemAttachmentAngle) * leafRotation
      const stemAttachmentAngle = getParamValue(
        this.params,
        LPK.StemAttachmentAngle,
      );
      const attachAngleRad = (stemAttachmentAngle * Math.PI) / 180;
      const attachQuat = {
        x: 0,
        y: 0,
        z: Math.sin(attachAngleRad / 2),
        w: Math.cos(attachAngleRad / 2),
      };

      // Multiply: attachQuat * attachmentInfo.rotation
      const finalRot = {
        x:
          attachQuat.w * attachmentInfo.rotation.x +
          attachQuat.x * attachmentInfo.rotation.w +
          attachQuat.y * attachmentInfo.rotation.z -
          attachQuat.z * attachmentInfo.rotation.y,
        y:
          attachQuat.w * attachmentInfo.rotation.y -
          attachQuat.x * attachmentInfo.rotation.z +
          attachQuat.y * attachmentInfo.rotation.w +
          attachQuat.z * attachmentInfo.rotation.x,
        z:
          attachQuat.w * attachmentInfo.rotation.z +
          attachQuat.x * attachmentInfo.rotation.y -
          attachQuat.y * attachmentInfo.rotation.x +
          attachQuat.z * attachmentInfo.rotation.w,
        w:
          attachQuat.w * attachmentInfo.rotation.w -
          attachQuat.x * attachmentInfo.rotation.x -
          attachQuat.y * attachmentInfo.rotation.y -
          attachQuat.z * attachmentInfo.rotation.z,
      };

      leafMeshObj.quaternion.set(
        finalRot.x,
        finalRot.y,
        finalRot.z,
        finalRot.w,
      );

      // Scale ONLY the leaf, not the stem
      // Original C#: t.localScale = new Vector3(d.scale, d.scale, d.scale)
      const scale = bundle.arrangementData.scale;
      leafMeshObj.scale.set(scale, scale, scale);

      leafGroup.add(leafMeshObj);
      group.add(leafGroup);
    }

    const endTime = performance.now();

    // Create dispose function
    const dispose = (): void => {
      group.traverse((obj) => {
        if (obj instanceof Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof MeshStandardMaterial) {
            obj.material.dispose();
            if (obj.material.map) obj.material.map.dispose();
            if (obj.material.normalMap) obj.material.normalMap.dispose();
          }
        }
      });
    };

    // Calculate stats
    let totalVertices = 0;
    let totalTriangles = 0;
    group.traverse((obj) => {
      if (obj instanceof Mesh) {
        const geo = obj.geometry;
        totalVertices += geo.attributes.position?.count ?? 0;
        totalTriangles += (geo.index?.count ?? 0) / 3;
      }
    });

    return {
      group,
      leafBundles,
      trunkMesh: trunkGeometry,
      textures: {
        albedo: textures.albedo,
        normal: textures.normal,
        height: textures.height,
      },
      stats: {
        vertexCount: totalVertices,
        triangleCount: totalTriangles,
        leafCount: leafBundles.filter((b) => b.visible).length,
        generationTimeMs: endTime - startTime,
      },
      dispose,
    };
  }

  /**
   * Generate just the leaf mesh (for LOD or instancing)
   */
  generateLeafOnly(): {
    mesh: MeshData;
    geometry: BufferGeometry;
    textures: {
      albedo: ImageData;
      normal: ImageData;
      height: ImageData;
    } | null;
  } {
    const quality = QUALITY_SETTINGS[this.options.quality];
    const seed = this.options.seed;

    // Generate leaf shape
    const shape = generateLeafShape(this.params);

    // Generate veins
    const veins = generateLeafVeins(shape, this.params, seed);
    const midrib = getMidrib(veins);

    // Triangulate mesh
    let baseMesh = triangulateLeaf(shape.curves, {
      lineSteps: quality.renderLineSteps,
      addInternalPoints: true,
    });

    // Apply extrusion
    baseMesh = extrudeLeafMesh(baseMesh, this.params);

    // Apply distortions
    let leafMesh = baseMesh;
    if (midrib) {
      leafMesh = applyDistortions(baseMesh, midrib, this.params, seed);
    }

    // Generate textures if enabled
    let textures: {
      albedo: ImageData;
      normal: ImageData;
      height: ImageData;
    } | null = null;

    if (
      this.options.generateTextures &&
      typeof OffscreenCanvas !== "undefined"
    ) {
      const textureSize = this.options.textureSize / quality.textureDownsample;
      const generated = generateAllTextures(
        shape,
        veins,
        this.params,
        textureSize,
        seed,
      );
      textures = {
        albedo: generated.albedo!,
        normal: generated.normal!,
        height: generated.height!,
      };
    }

    return {
      mesh: leafMesh,
      geometry: meshDataToBufferGeometry(leafMesh),
      textures,
    };
  }

  /**
   * Generate multiple LOD levels
   */
  generateLODs(): {
    Minimum: MeshData;
    Medium: MeshData;
    Maximum: MeshData;
  } {
    const originalQuality = this.options.quality;
    const originalTextures = this.options.generateTextures;
    this.options.generateTextures = false;

    this.options.quality = RQ.Maximum;
    const Maximum = this.generateLeafOnly().mesh;

    this.options.quality = RQ.Medium;
    const Medium = this.generateLeafOnly().mesh;

    this.options.quality = RQ.Minimum;
    const Minimum = this.generateLeafOnly().mesh;

    this.options.quality = originalQuality;
    this.options.generateTextures = originalTextures;

    return { Minimum, Medium, Maximum };
  }

  /**
   * Export a plant result to GLB format.
   *
   * @param result - Plant generation result to export
   * @param options - Export options
   * @returns Promise resolving to export result
   */
  async exportToGLB(
    result: PlantGenerationResult,
    options: PlantGLBExportOptions = {},
  ): Promise<PlantGLBExportResult> {
    return exportPlantToGLB(result, options);
  }

  /**
   * Export a plant result to a GLB file.
   *
   * @param result - Plant generation result to export
   * @param outputPath - Full path to output file
   * @param options - Export options
   * @returns Promise resolving to export result
   */
  async exportToGLBFile(
    result: PlantGenerationResult,
    outputPath: string,
    options: Omit<PlantGLBExportOptions, "download"> = {},
  ): Promise<PlantGLBExportResult> {
    return exportPlantToGLBFile(result, outputPath, options);
  }

  /**
   * Generate a plant and immediately export it to GLB.
   *
   * @param options - Export options
   * @returns Promise resolving to generation result and GLB data
   */
  async generateAndExport(
    options: PlantGLBExportOptions = {},
  ): Promise<{ plant: PlantGenerationResult; glb: PlantGLBExportResult }> {
    const plant = this.generate();
    const glb = await this.exportToGLB(plant, options);
    return { plant, glb };
  }
}

// =============================================================================
// GLB EXPORT FUNCTIONS
// =============================================================================

/**
 * Export a plant result to GLB format.
 *
 * @param result - Plant generation result to export
 * @param options - Export options
 * @returns Promise resolving to export result
 */
export async function exportPlantToGLB(
  result: PlantGenerationResult,
  options: PlantGLBExportOptions = {},
): Promise<PlantGLBExportResult> {
  const exporter = new GLTFExporter();
  const filename = options.filename || "plant";

  // Clone the group to avoid modifying the original
  const exportGroup = result.group.clone(true);

  // Reset root position for export
  exportGroup.position.set(0, 0, 0);
  exportGroup.rotation.set(0, 0, 0);
  exportGroup.scale.set(1, 1, 1);
  exportGroup.updateMatrixWorld(true);

  // Bake transforms if requested
  if (options.bakeTransforms) {
    bakeTransformsToGeometry(exportGroup);
  }

  // Collect statistics
  const stats = collectPlantStats(exportGroup);

  return new Promise((resolve, reject) => {
    exporter.parse(
      exportGroup,
      (gltf) => {
        const data = gltf as ArrayBuffer;
        stats.fileSizeBytes = data.byteLength;

        const exportResult: PlantGLBExportResult = {
          data,
          filename: `${filename}.glb`,
          mimeType: "model/gltf-binary",
          stats,
        };

        // Download in browser if requested
        if (
          options.download &&
          typeof window !== "undefined" &&
          typeof document !== "undefined"
        ) {
          const blob = new Blob([data], { type: exportResult.mimeType });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = exportResult.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }

        // Clean up cloned group
        disposePlantGroup(exportGroup);

        resolve(exportResult);
      },
      (error) => {
        disposePlantGroup(exportGroup);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
      { binary: true },
    );
  });
}

/**
 * Export a plant result to a GLB file.
 *
 * @param result - Plant generation result to export
 * @param outputPath - Full path to output file
 * @param options - Export options
 * @returns Promise resolving to export result
 */
export async function exportPlantToGLBFile(
  result: PlantGenerationResult,
  outputPath: string,
  options: Omit<PlantGLBExportOptions, "download"> = {},
): Promise<PlantGLBExportResult> {
  const glbResult = await exportPlantToGLB(result, {
    ...options,
    download: false,
  });

  // Write file using available runtime APIs
  const globalObj = globalThis as Record<string, unknown>;
  if (
    globalObj.Bun &&
    typeof (globalObj.Bun as { write: unknown }).write === "function"
  ) {
    const BunRuntime = globalObj.Bun as {
      write: (path: string, data: ArrayBuffer) => Promise<void>;
    };
    await BunRuntime.write(outputPath, glbResult.data);
  } else {
    // Node.js fallback using dynamic import
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outputPath, Buffer.from(glbResult.data));
  }

  return glbResult;
}

/**
 * Generate a plant from a preset and immediately export it to GLB.
 *
 * @param presetName - Name of the preset to use
 * @param seed - Random seed
 * @param options - Export options
 * @returns Promise resolving to generation result and GLB data
 */
export async function generateAndExportPlant(
  presetName: PlantPresetName,
  seed: number = Date.now(),
  options: PlantGLBExportOptions & {
    generateTextures?: boolean;
    textureSize?: number;
    quality?: RenderQuality;
  } = {},
): Promise<{ plant: PlantGenerationResult; glb: PlantGLBExportResult }> {
  const generator = new PlantGenerator({
    seed,
    generateTextures: options.generateTextures ?? true,
    textureSize: options.textureSize ?? 1024,
    quality: options.quality ?? RQ.Maximum,
  });
  generator.loadPreset(presetName);
  const plant = generator.generate();
  const glb = await exportPlantToGLB(plant, options);
  return { plant, glb };
}

/**
 * Bake world transforms into geometry vertices
 */
function bakeTransformsToGeometry(object: Object3D): void {
  object.updateMatrixWorld(true);

  object.traverse((child) => {
    if (child instanceof Mesh && child.geometry) {
      const geometry = child.geometry;
      geometry.applyMatrix4(child.matrixWorld);

      child.position.set(0, 0, 0);
      child.rotation.set(0, 0, 0);
      child.scale.set(1, 1, 1);
      child.updateMatrix();
      child.updateMatrixWorld(true);
    }
  });
}

/**
 * Collect statistics about the plant
 */
function collectPlantStats(object: Object3D): PlantGLBExportResult["stats"] {
  let vertexCount = 0;
  let triangleCount = 0;
  let meshCount = 0;

  object.traverse((child) => {
    if (child instanceof Mesh && child.geometry) {
      meshCount++;
      const geometry = child.geometry;
      const positions = geometry.attributes.position;

      if (positions) {
        vertexCount += positions.count;
      }

      if (geometry.index) {
        triangleCount += geometry.index.count / 3;
      } else if (positions) {
        triangleCount += positions.count / 3;
      }
    }
  });

  return {
    vertexCount,
    triangleCount,
    meshCount,
    fileSizeBytes: 0,
  };
}

/**
 * Dispose of all resources in a plant group
 */
function disposePlantGroup(group: Group): void {
  group.traverse((child) => {
    if (child instanceof Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const mat of materials) {
          mat.dispose();
        }
      }
    }
  });
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick generation from preset
 */
export function generateFromPreset(
  presetName: PlantPresetName,
  seed: number = Date.now(),
  options?: {
    generateTextures?: boolean;
    textureSize?: number;
    leafCount?: number;
    quality?: RenderQuality;
  },
): PlantGenerationResult {
  const generator = new PlantGenerator({
    seed,
    generateTextures: options?.generateTextures ?? true,
    textureSize: options?.textureSize ?? 1024,
    quality: options?.quality ?? RQ.Maximum,
  });
  generator.loadPreset(presetName);
  if (options?.leafCount !== undefined) {
    generator.setParam(LPK.LeafCount, options.leafCount);
  }
  return generator.generate();
}

/**
 * Generate a random plant
 */
export function generateRandom(
  seed: number = Date.now(),
  options?: {
    generateTextures?: boolean;
    textureSize?: number;
    leafCount?: number;
    quality?: RenderQuality;
  },
): PlantGenerationResult {
  const presets = getPresetNames();
  const random = new SeededRandom(seed);
  const presetName = random.pick(presets);

  const generator = new PlantGenerator({
    seed,
    generateTextures: options?.generateTextures ?? true,
    textureSize: options?.textureSize ?? 1024,
    quality: options?.quality ?? RQ.Maximum,
  });
  generator.loadPreset(presetName);
  if (options?.leafCount !== undefined) {
    generator.setParam(LPK.LeafCount, options.leafCount);
  }
  return generator.generate();
}

/**
 * Create a generator with default settings
 */
export function createGenerator(
  options?: Partial<PlantGenerationOptions>,
): PlantGenerator {
  return new PlantGenerator(options);
}

// Re-export key types and utilities
export {
  PRESETS,
  getPreset,
  getPresetNames,
  createParamsFromPreset,
  createDefaultParams,
};
