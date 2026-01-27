/**
 * Geometry Utilities
 * Helper functions for mesh generation and optimization
 */

import * as THREE from "three";

/**
 * Fractional part of a number
 */
export function fract(value: number): number {
  return value - Math.floor(value);
}

/**
 * Simple 3D noise function
 */
export function noise3(x: number, y: number, z: number): number {
  return fract(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453);
}

/**
 * Layered noise for procedural texturing
 */
export function layeredNoise(x: number, y: number, z: number): number {
  const n1 = noise3(x, y, z);
  const n2 = noise3(x * 2.15, y * 2.15, z * 2.15) * 0.5;
  const n3 = noise3(x * 4.7, y * 4.7, z * 4.7) * 0.25;
  return (n1 + n2 + n3) / 1.75;
}

/**
 * Apply vertex colors to a geometry with optional noise variation
 */
export function applyVertexColors(
  geometry: THREE.BufferGeometry,
  color: THREE.Color,
  noiseScale = 0.35,
  noiseAmp = 0.35,
  minShade = 0.78,
): void {
  const position = geometry.attributes.position;
  if (!position) return;
  const colors = new Float32Array(position.count * 3);

  const baseR = color.r * minShade;
  const baseG = color.g * minShade;
  const baseB = color.b * minShade;

  if (noiseAmp === 0) {
    for (let i = 0; i < position.count; i += 1) {
      const idx = i * 3;
      colors[idx] = baseR;
      colors[idx + 1] = baseG;
      colors[idx + 2] = baseB;
    }
  } else {
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);

      const noise = layeredNoise(
        x * noiseScale,
        y * noiseScale,
        z * noiseScale,
      );
      const shade = minShade + noise * noiseAmp;
      const r = Math.min(1, color.r * shade);
      const g = Math.min(1, color.g * shade);
      const b = Math.min(1, color.b * shade);

      const idx = i * 3;
      colors[idx] = r;
      colors[idx + 1] = g;
      colors[idx + 2] = b;
    }
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/**
 * Optimize a merged geometry by:
 * 1. Removing internal/duplicate faces (coplanar overlapping triangles)
 * 2. Removing back-to-back faces (adjacent boxes sharing a face)
 * 3. Merging vertices ONLY where position, color, AND normal match
 * 4. Computing per-face normals (hard edges for architectural geometry)
 *
 * IMPORTANT: This preserves:
 * - Vertex colors at material boundaries (no color bleeding)
 * - Hard edges at corners (no smooth shading on box geometry)
 */
export function removeInternalFaces(
  geometry: THREE.BufferGeometry | null,
): THREE.BufferGeometry {
  if (!geometry) {
    return new THREE.BufferGeometry();
  }

  // Step 1: Convert to non-indexed to work with individual triangles
  const nonIndexed = geometry.toNonIndexed();
  const position = nonIndexed.attributes.position;
  const color = nonIndexed.attributes.color;
  const posArray = position.array as Float32Array;
  const colorArray = color ? (color.array as Float32Array) : null;
  const triCount = position.count / 3;

  const precision = 1000; // Snap to 1mm precision
  const colorPrecision = 100; // Color precision (1% increments)

  // Helper to create a sorted vertex key for a triangle (position only)
  const makeVertexKey = (i0: number, i1: number, i2: number): string => {
    const verts = [i0, i1, i2].map((idx) => {
      const x = Math.round(position.getX(idx) * precision);
      const y = Math.round(position.getY(idx) * precision);
      const z = Math.round(position.getZ(idx) * precision);
      return `${x},${y},${z}`;
    });
    verts.sort();
    return verts.join("|");
  };

  // Helper to compute triangle normal
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const getTriNormal = (i0: number, i1: number, i2: number): THREE.Vector3 => {
    v0.set(position.getX(i0), position.getY(i0), position.getZ(i0));
    v1.set(position.getX(i1), position.getY(i1), position.getZ(i1));
    v2.set(position.getX(i2), position.getY(i2), position.getZ(i2));
    edge1.subVectors(v1, v0);
    edge2.subVectors(v2, v0);
    normal.crossVectors(edge1, edge2).normalize();
    return normal.clone();
  };

  // Step 2: Group triangles by their vertex positions (same vertices = same face location)
  const faceGroups = new Map<
    string,
    Array<{ tri: number; normal: THREE.Vector3 }>
  >();

  for (let tri = 0; tri < triCount; tri += 1) {
    const i0 = tri * 3;
    const i1 = tri * 3 + 1;
    const i2 = tri * 3 + 2;
    const key = makeVertexKey(i0, i1, i2);
    const triNormal = getTriNormal(i0, i1, i2);

    if (!faceGroups.has(key)) {
      faceGroups.set(key, []);
    }
    faceGroups.get(key)!.push({ tri, normal: triNormal });
  }

  // Step 3: Mark triangles to remove
  // - Exact duplicates (same vertices, same or similar normal)
  // - Back-to-back faces (same vertices, opposite normals)
  const keep = new Array(triCount).fill(true);

  for (const faces of faceGroups.values()) {
    if (faces.length > 1) {
      // Multiple triangles at the same position
      // Check if they're duplicates or back-to-back

      // Group by normal direction
      const normalGroups: Array<{ normal: THREE.Vector3; tris: number[] }> = [];

      for (const face of faces) {
        let found = false;
        for (const group of normalGroups) {
          // Check if normals are similar (same direction) or opposite
          const dot = face.normal.dot(group.normal);
          if (Math.abs(dot) > 0.99) {
            // Same or opposite direction
            group.tris.push(face.tri);
            found = true;
            break;
          }
        }
        if (!found) {
          normalGroups.push({ normal: face.normal.clone(), tris: [face.tri] });
        }
      }

      // For each group, if there are faces with opposite normals, remove all
      // (they're internal back-to-back faces)
      for (const group of normalGroups) {
        if (group.tris.length > 1) {
          // Check for opposing normals within this group
          let hasOpposing = false;
          for (let i = 0; i < group.tris.length && !hasOpposing; i++) {
            const n1 = faces.find((f) => f.tri === group.tris[i])!.normal;
            for (let j = i + 1; j < group.tris.length; j++) {
              const n2 = faces.find((f) => f.tri === group.tris[j])!.normal;
              if (n1.dot(n2) < -0.99) {
                hasOpposing = true;
                break;
              }
            }
          }

          if (hasOpposing) {
            // Remove all faces in this group (back-to-back internal faces)
            for (const tri of group.tris) {
              keep[tri] = false;
            }
          } else if (group.tris.length > 1) {
            // Exact duplicates (same normal), keep only the first
            for (let i = 1; i < group.tris.length; i++) {
              keep[group.tris[i]] = false;
            }
          }
        }
      }
    }
  }

  let keptCount = 0;
  for (let tri = 0; tri < triCount; tri += 1) {
    if (keep[tri]) keptCount += 1;
  }

  // Step 4: Build cleaned geometry with only external faces
  const newPos = new Float32Array(keptCount * 9);
  const newColor = colorArray ? new Float32Array(keptCount * 9) : null;
  let dst = 0;

  for (let tri = 0; tri < triCount; tri += 1) {
    if (!keep[tri]) continue;
    const src = tri * 9;
    for (let i = 0; i < 9; i += 1) {
      newPos[dst + i] = posArray[src + i];
      if (newColor && colorArray) {
        newColor[dst + i] = colorArray[src + i];
      }
    }
    dst += 9;
  }

  // Dispose the intermediate non-indexed geometry
  nonIndexed.dispose();

  const cleaned = new THREE.BufferGeometry();
  cleaned.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
  if (newColor) {
    cleaned.setAttribute("color", new THREE.BufferAttribute(newColor, 3));
  }

  // Step 5: Compute per-face normals BEFORE any vertex merging
  // This ensures hard edges at corners (correct for architectural geometry)
  cleaned.computeVertexNormals();

  // Step 6: Smart vertex merging - only merge vertices with SAME position, color, AND normal
  // This preserves:
  // - Hard edges (vertices with different normals stay separate)
  // - Material boundaries (vertices with different colors stay separate)
  const optimized = mergeVerticesPreservingAttributes(
    cleaned,
    precision,
    colorPrecision,
  );
  cleaned.dispose();

  return optimized;
}

/**
 * Merge vertices that have the same position, color, AND normal.
 * Unlike Three.js mergeVertices, this preserves hard edges and color boundaries.
 *
 * @param geometry - Non-indexed geometry with position, color, and normal attributes
 * @param posPrecision - Position precision (vertices within 1/precision are considered same)
 * @param colorPrecision - Color precision (colors within 1/colorPrecision are considered same)
 */
function mergeVerticesPreservingAttributes(
  geometry: THREE.BufferGeometry,
  posPrecision: number,
  colorPrecision: number,
): THREE.BufferGeometry {
  const position = geometry.attributes.position;
  const color = geometry.attributes.color;
  const normal = geometry.attributes.normal;

  if (!position) return geometry;

  const vertexCount = position.count;

  // Build a map of unique vertices (position + color + normal)
  const vertexMap = new Map<string, number>();
  const uniquePositions: number[] = [];
  const uniqueColors: number[] = [];
  const uniqueNormals: number[] = [];
  const indexMap: number[] = []; // Maps old vertex index to new index

  for (let i = 0; i < vertexCount; i++) {
    // Create key from position, color, and normal
    const px = Math.round(position.getX(i) * posPrecision);
    const py = Math.round(position.getY(i) * posPrecision);
    const pz = Math.round(position.getZ(i) * posPrecision);

    let key = `${px},${py},${pz}`;

    if (color) {
      const cr = Math.round(color.getX(i) * colorPrecision);
      const cg = Math.round(color.getY(i) * colorPrecision);
      const cb = Math.round(color.getZ(i) * colorPrecision);
      key += `|${cr},${cg},${cb}`;
    }

    if (normal) {
      // Round normals to 2 decimal places (enough for axis-aligned normals)
      const nx = Math.round(normal.getX(i) * 100);
      const ny = Math.round(normal.getY(i) * 100);
      const nz = Math.round(normal.getZ(i) * 100);
      key += `|${nx},${ny},${nz}`;
    }

    let newIndex = vertexMap.get(key);
    if (newIndex === undefined) {
      // New unique vertex
      newIndex = uniquePositions.length / 3;
      vertexMap.set(key, newIndex);

      uniquePositions.push(
        position.getX(i),
        position.getY(i),
        position.getZ(i),
      );
      if (color) {
        uniqueColors.push(color.getX(i), color.getY(i), color.getZ(i));
      }
      if (normal) {
        uniqueNormals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      }
    }

    indexMap.push(newIndex);
  }

  // If no vertices were merged, return original geometry
  if (uniquePositions.length === vertexCount * 3) {
    return geometry;
  }

  // Build indexed geometry
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(uniquePositions), 3),
  );

  if (color && uniqueColors.length > 0) {
    result.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(uniqueColors), 3),
    );
  }

  if (normal && uniqueNormals.length > 0) {
    result.setAttribute(
      "normal",
      new THREE.BufferAttribute(new Float32Array(uniqueNormals), 3),
    );
  }

  // Set index buffer
  const indices = new Uint32Array(indexMap);
  result.setIndex(new THREE.BufferAttribute(indices, 1));

  return result;
}

// ============================================================
// GREEDY MESHING - Optimize large flat surfaces
// ============================================================

/**
 * A rectangular region in a 2D grid
 */
export interface GridRect {
  col: number;
  row: number;
  width: number; // columns
  height: number; // rows
}

/**
 * Greedy mesh a 2D boolean grid into minimal rectangles.
 * This dramatically reduces geometry for floors, ceilings, and other flat surfaces.
 *
 * Algorithm: Scan left-to-right, top-to-bottom. For each unvisited cell,
 * expand right as far as possible, then expand down as far as possible
 * while maintaining a rectangular shape.
 *
 * @param grid - 2D boolean array (true = filled)
 * @returns Array of rectangles that cover all true cells
 */
export function greedyMesh2D(grid: boolean[][]): GridRect[] {
  if (grid.length === 0) return [];

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (cols === 0) return [];

  // Track which cells have been included in a rectangle
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  );

  const rects: GridRect[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Skip if not filled or already visited
      if (!grid[row][col] || visited[row][col]) continue;

      // Find max width (expand right)
      let width = 1;
      while (
        col + width < cols &&
        grid[row][col + width] &&
        !visited[row][col + width]
      ) {
        width++;
      }

      // Find max height (expand down) while maintaining width
      let height = 1;
      outer: while (row + height < rows) {
        // Check if entire row segment is available
        for (let c = col; c < col + width; c++) {
          if (!grid[row + height][c] || visited[row + height][c]) {
            break outer;
          }
        }
        height++;
      }

      // Mark all cells in this rect as visited
      for (let r = row; r < row + height; r++) {
        for (let c = col; c < col + width; c++) {
          visited[r][c] = true;
        }
      }

      rects.push({ col, row, width, height });
    }
  }

  return rects;
}

/**
 * Greedy mesh with color support - groups cells by color before meshing.
 * Use when different cells have different vertex colors.
 *
 * @param grid - 2D boolean array (true = filled)
 * @param colorGrid - 2D array of color indices (cells with same index are merged)
 * @returns Map of color index to rectangles
 */
export function greedyMesh2DWithColors(
  grid: boolean[][],
  colorGrid: number[][],
): Map<number, GridRect[]> {
  if (grid.length === 0) return new Map();

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (cols === 0) return new Map();

  // Group cells by color
  const colorGroups = new Map<number, boolean[][]>();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!grid[row][col]) continue;

      const colorIdx = colorGrid[row]?.[col] ?? 0;
      if (!colorGroups.has(colorIdx)) {
        colorGroups.set(
          colorIdx,
          Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => false),
          ),
        );
      }
      colorGroups.get(colorIdx)![row][col] = true;
    }
  }

  // Greedy mesh each color group
  const result = new Map<number, GridRect[]>();
  for (const [colorIdx, colorMask] of colorGroups) {
    result.set(colorIdx, greedyMesh2D(colorMask));
  }

  return result;
}

/**
 * Create a single flat quad geometry (floor/ceiling tile)
 * More efficient than BoxGeometry for thin slabs
 */
export function createFlatQuad(
  width: number,
  depth: number,
  thickness: number,
  _faceUp: boolean = true,
): THREE.BufferGeometry {
  // Use BoxGeometry with 1,1,1 segments for minimal triangles
  const geometry = new THREE.BoxGeometry(width, thickness, depth, 1, 1, 1);
  return geometry;
}

/**
 * Create geometry for a merged floor/ceiling region
 */
export function createMergedFloorGeometry(
  rect: GridRect,
  cellSize: number,
  thickness: number,
  y: number,
  gridWidth: number,
  gridDepth: number,
  inset: number = 0,
): THREE.BufferGeometry {
  const halfGridWidth = (gridWidth * cellSize) / 2;
  const halfGridDepth = (gridDepth * cellSize) / 2;

  // Calculate world position and size
  const startX = rect.col * cellSize - halfGridWidth + inset;
  const startZ = rect.row * cellSize - halfGridDepth + inset;
  const width = rect.width * cellSize - inset * 2;
  const depth = rect.height * cellSize - inset * 2;

  const centerX = startX + width / 2;
  const centerZ = startZ + depth / 2;

  const geometry = new THREE.BoxGeometry(width, thickness, depth, 1, 1, 1);
  geometry.translate(centerX, y, centerZ);

  return geometry;
}

// ============================================================
// WALL SEGMENT MERGING
// ============================================================

/**
 * A wall segment that can be merged with adjacent segments
 */
export interface WallSegment {
  x: number;
  z: number;
  length: number;
  isVertical: boolean;
  hasOpening: boolean;
  openingType?: string;
}

/**
 * Merge adjacent wall segments into longer walls.
 * Only merges segments that don't have openings (doors/windows).
 *
 * @param segments - Array of wall segments on the same edge
 * @param isVertical - Whether walls run along Z axis
 * @returns Merged wall segments
 */
export function mergeWallSegments(
  segments: WallSegment[],
  isVertical: boolean,
): WallSegment[] {
  if (segments.length <= 1) return segments;

  // Sort by position
  const sorted = [...segments].sort((a, b) =>
    isVertical ? a.z - b.z : a.x - b.x,
  );

  const merged: WallSegment[] = [];
  let current: WallSegment | null = null;

  for (const seg of sorted) {
    if (seg.hasOpening) {
      // Can't merge segments with openings
      if (current) {
        merged.push(current);
        current = null;
      }
      merged.push(seg);
      continue;
    }

    if (!current) {
      current = { ...seg };
      continue;
    }

    // Check if segments are adjacent
    const currentEnd = isVertical
      ? current.z + current.length / 2
      : current.x + current.length / 2;
    const segStart = isVertical
      ? seg.z - seg.length / 2
      : seg.x - seg.length / 2;

    const gap = Math.abs(currentEnd - segStart);

    if (gap < 0.01) {
      // Merge: extend current segment
      current.length += seg.length;
      // Update center position
      if (isVertical) {
        current.z = (current.z + seg.z) / 2 + seg.length / 4;
      } else {
        current.x = (current.x + seg.x) / 2 + seg.length / 4;
      }
    } else {
      // Gap too large, start new segment
      merged.push(current);
      current = { ...seg };
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

// ============================================================
// LOD GENERATION
// ============================================================

// LODLevel enum is defined in ./types.ts - import from there if needed

/**
 * Create a simplified LOD1 building geometry (merged walls, no openings)
 */
export function createLOD1Geometry(
  width: number,
  depth: number,
  height: number,
  foundationHeight: number,
): THREE.BufferGeometry {
  // Single box for the entire building shell
  const geometry = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
  geometry.translate(0, foundationHeight + height / 2, 0);
  return geometry;
}

/**
 * Create a minimal LOD2 building geometry (just a box)
 */
export function createLOD2Geometry(
  width: number,
  depth: number,
  totalHeight: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, totalHeight, depth, 1, 1, 1);
  geometry.translate(0, totalHeight / 2, 0);
  return geometry;
}

// ============================================================
// GEOMETRY CACHING
// ============================================================

/**
 * Simple geometry cache for reusable building elements
 */
class GeometryCache {
  private cache = new Map<string, THREE.BufferGeometry>();

  /**
   * Get or create a cached geometry
   */
  getOrCreate(
    key: string,
    factory: () => THREE.BufferGeometry,
  ): THREE.BufferGeometry {
    let geometry = this.cache.get(key);
    if (!geometry) {
      geometry = factory();
      this.cache.set(key, geometry);
    }
    // Return a clone so the cached version isn't modified
    return geometry.clone();
  }

  /**
   * Clear all cached geometries
   */
  clear(): void {
    for (const geometry of this.cache.values()) {
      geometry.dispose();
    }
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { count: number; keys: string[] } {
    return {
      count: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/** Global geometry cache instance */
export const geometryCache = new GeometryCache();

/**
 * Get cached box geometry
 */
export function getCachedBox(
  width: number,
  height: number,
  depth: number,
): THREE.BufferGeometry {
  // Round dimensions to avoid floating point key issues
  const w = Math.round(width * 1000) / 1000;
  const h = Math.round(height * 1000) / 1000;
  const d = Math.round(depth * 1000) / 1000;
  const key = `box_${w}_${h}_${d}`;

  return geometryCache.getOrCreate(
    key,
    () => new THREE.BoxGeometry(w, h, d, 1, 1, 1),
  );
}

// ============================================================
// ORIGINAL GEOMETRY FUNCTIONS
// ============================================================

/**
 * Create an arch top geometry (half-circle)
 */
export function createArchTopGeometry(
  width: number,
  thickness: number,
  _segments = 12,
): THREE.BufferGeometry {
  const radius = width / 2;
  const shape = new THREE.Shape();

  shape.moveTo(-radius, 0);
  shape.absarc(0, 0, radius, Math.PI, 0, true);
  shape.lineTo(-radius, 0);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    steps: 1,
    depth: thickness,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/**
 * Create a mitered box geometry for wall corners
 */
export function createMiteredBoxGeometry(
  width: number,
  height: number,
  depth: number,
  miterSide: "left" | "right" | "both" | "none" = "none",
): THREE.BufferGeometry {
  if (miterSide === "none") {
    return new THREE.BoxGeometry(width, height, depth);
  }

  const shape = new THREE.Shape();
  const halfW = width / 2;
  const halfD = depth / 2;

  if (miterSide === "both") {
    shape.moveTo(-halfW + depth, -halfD);
    shape.lineTo(halfW - depth, -halfD);
    shape.lineTo(halfW, -halfD + depth);
    shape.lineTo(halfW, halfD - depth);
    shape.lineTo(halfW - depth, halfD);
    shape.lineTo(-halfW + depth, halfD);
    shape.lineTo(-halfW, halfD - depth);
    shape.lineTo(-halfW, -halfD + depth);
    shape.closePath();
  } else if (miterSide === "left") {
    shape.moveTo(-halfW + depth, -halfD);
    shape.lineTo(halfW, -halfD);
    shape.lineTo(halfW, halfD);
    shape.lineTo(-halfW + depth, halfD);
    shape.lineTo(-halfW, halfD - depth);
    shape.lineTo(-halfW, -halfD + depth);
    shape.closePath();
  } else {
    shape.moveTo(-halfW, -halfD);
    shape.lineTo(halfW - depth, -halfD);
    shape.lineTo(halfW, -halfD + depth);
    shape.lineTo(halfW, halfD - depth);
    shape.lineTo(halfW - depth, halfD);
    shape.lineTo(-halfW, halfD);
    shape.closePath();
  }

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    steps: 1,
    depth: height,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * Get the center position of a cell in world coordinates
 */
export function getCellCenter(
  col: number,
  row: number,
  cellSize: number,
  width: number,
  depth: number,
): { x: number; z: number } {
  const halfWidth = (width * cellSize) / 2;
  const halfDepth = (depth * cellSize) / 2;
  return {
    x: col * cellSize + cellSize / 2 - halfWidth,
    z: row * cellSize + cellSize / 2 - halfDepth,
  };
}

/**
 * Corner chamfer configuration for wall segments
 */
export type ChamferConfig = {
  startChamfer: "none" | "left" | "right"; // Chamfer at the negative end of the wall
  endChamfer: "none" | "left" | "right"; // Chamfer at the positive end of the wall
};

/**
 * Create a wall geometry with chamfered corners for proper joining
 * Uses BoxGeometry for compatibility with mergeGeometries
 *
 * Instead of actual chamfers, we use a simplified approach:
 * - Full-length walls meet at 90-degree corners
 * - The removeInternalFaces function handles overlapping geometry
 *
 * @param length - Length of the wall (along its primary axis)
 * @param height - Height of the wall
 * @param thickness - Thickness of the wall
 * @param isVertical - If true, wall runs along Z axis; if false, along X axis
 * @param chamfer - Configuration for chamfered corners (determines if we need to adjust length)
 */
export function createChamferedWallGeometry(
  length: number,
  height: number,
  thickness: number,
  isVertical: boolean,
  chamfer: ChamferConfig,
): THREE.BufferGeometry {
  // For simplicity and compatibility, we create standard box geometry
  // The removeInternalFaces step handles overlapping faces at corners

  // Calculate adjusted length based on chamfer configuration
  // At corners, we shorten walls by full thickness to prevent overlap
  // This ensures perpendicular walls meet cleanly without intersection
  let adjustedLength = length;
  let offset = 0;

  // At corners, shorten the wall by the full thickness
  // This eliminates the corner overlap region
  if (chamfer.startChamfer !== "none") {
    adjustedLength -= thickness;
    offset += thickness / 2;
  }
  if (chamfer.endChamfer !== "none") {
    adjustedLength -= thickness;
    offset -= thickness / 2;
  }

  const geometry = isVertical
    ? new THREE.BoxGeometry(thickness, height, adjustedLength)
    : new THREE.BoxGeometry(adjustedLength, height, thickness);

  // Apply offset to center the shortened wall properly
  if (isVertical) {
    geometry.translate(0, height / 2, offset);
  } else {
    geometry.translate(offset, height / 2, 0);
  }

  return geometry;
}
