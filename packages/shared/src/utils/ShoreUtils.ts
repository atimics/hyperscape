/**
 * Shore Discovery Utilities
 *
 * Provides functions for detecting valid shore positions where fishing spots
 * can spawn. Uses terrain height sampling to find water edges.
 *
 * A valid shore point is:
 * - On land (height >= water threshold)
 * - Near water level (height <= shore max height)
 * - Adjacent to water (at least one neighbor below water threshold)
 *
 * @see https://oldschool.runescape.wiki/w/Fishing - OSRS fishing spots appear at water edges
 */

/**
 * Represents a valid shore point where a fishing spot can spawn
 */
export interface ShorePoint {
  x: number;
  y: number; // Actual ground height
  z: number;
  waterDirection: "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
}

export interface FindShorePointsOptions {
  /** Grid sampling distance in meters (default: 2m) */
  sampleInterval?: number;
  /** Height below which is considered water (default: 5.4m from TerrainSystem) */
  waterThreshold?: number;
  /** Maximum height for valid shore positions (default: 8.0m) */
  shoreMaxHeight?: number;
  /** Minimum distance between shore points in meters (default: 6m) */
  minSpacing?: number;
}

/**
 * Direction offsets for checking adjacent water
 * Uses 2m offset to sample neighboring terrain
 */
const DIRECTIONS = [
  { dx: 0, dz: -2, name: "N" as const },
  { dx: 0, dz: 2, name: "S" as const },
  { dx: 2, dz: 0, name: "E" as const },
  { dx: -2, dz: 0, name: "W" as const },
  { dx: 2, dz: -2, name: "NE" as const },
  { dx: -2, dz: -2, name: "NW" as const },
  { dx: 2, dz: 2, name: "SE" as const },
  { dx: -2, dz: 2, name: "SW" as const },
];

/**
 * Scans an area and returns valid shore points where fishing spots can spawn.
 *
 * Shore = on land, adjacent to water. The algorithm:
 * 1. Samples terrain in a grid pattern within bounds
 * 2. For each point, checks if it's on land (above water threshold)
 * 3. Checks if it's near water level (below shore max height)
 * 4. Checks if any adjacent tile is underwater
 * 5. Ensures minimum spacing between returned points
 *
 * @param bounds - Rectangle to search within (world coordinates)
 * @param getHeightAt - Function to sample terrain height at (x, z)
 * @param options - Configuration options
 * @returns Array of valid shore points, not guaranteed to be in any order
 */
export function findShorePoints(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  getHeightAt: (x: number, z: number) => number,
  options: FindShorePointsOptions = {},
): ShorePoint[] {
  const {
    sampleInterval = 2,
    waterThreshold = 5.4,
    shoreMaxHeight = 8.0,
    minSpacing = 6,
  } = options;

  const results: ShorePoint[] = [];

  for (let x = bounds.minX; x <= bounds.maxX; x += sampleInterval) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += sampleInterval) {
      const height = getHeightAt(x, z);

      // Must be on land (not underwater)
      if (height < waterThreshold) continue;

      // Must be near water level (shore zone)
      if (height > shoreMaxHeight) continue;

      // Must have adjacent water - check all directions
      let waterDir: ShorePoint["waterDirection"] | null = null;
      for (const dir of DIRECTIONS) {
        const neighborHeight = getHeightAt(x + dir.dx, z + dir.dz);
        if (neighborHeight < waterThreshold) {
          waterDir = dir.name;
          break;
        }
      }
      if (!waterDir) continue;

      // Check minimum spacing from existing points
      const tooClose = results.some((p) => {
        const dist = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
        return dist < minSpacing;
      });
      if (tooClose) continue;

      results.push({
        x,
        y: height,
        z,
        waterDirection: waterDir,
      });
    }
  }

  return results;
}

/**
 * Shuffle array in place using Fisher-Yates algorithm.
 * Used to randomize shore point selection for variety.
 *
 * @param array - Array to shuffle (modified in place)
 * @returns The same array, now shuffled
 */
export function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
