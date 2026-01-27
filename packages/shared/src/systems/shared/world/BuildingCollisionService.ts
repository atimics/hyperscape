/**
 * BuildingCollisionService - Multi-level Building Collision System
 *
 * Provides tile-based collision detection for procedural buildings with
 * support for multiple floors, stairs, and directional wall blocking.
 *
 * **Features:**
 * - Multi-level collision (ground floor, upper floors, roofs)
 * - Directional wall blocking using CollisionMatrix flags
 * - Stair transitions between floors
 * - Floor-aware pathfinding queries
 * - Player floor tracking
 *
 * **Architecture:**
 * - Buildings register their collision data on spawn
 * - Each floor's walls are registered as directional WALL_* flags
 * - Walkable floor tiles are NOT blocked (allow pathfinding)
 * - External tiles remain their natural state (terrain collision)
 *
 * **Coordinate Flow:**
 * 1. BuildingGenerator outputs cells (col, row) per floor
 * 2. BuildingCollisionService transforms to world tiles (tileX, tileZ)
 * 3. Collision flags written to CollisionMatrix
 * 4. Pathfinder queries CollisionMatrix + floor-aware checks
 *
 * **Runs on:** Server (authoritative), Client (prediction)
 */

import type { World } from "../../../core/World";
import type { CollisionMatrix } from "../movement/CollisionMatrix";
import { CollisionFlag } from "../movement/CollisionFlags";
import type { TileCoord } from "../movement/TileSystem";
import type { EntityID } from "../../../types/core/identifiers";
import {
  type BuildingCollisionData,
  type FloorCollisionData,
  type WallSegment,
  type StairTile,
  type WallDirection,
  type PlayerBuildingState,
  type BuildingCollisionResult,
  type BuildingLayoutInput,
  type CellCoord,
  cellToWorldTile,
  rotateWallDirection,
  getOppositeDirection,
  toWallDirection,
  tileKey,
} from "../../../types/world/building-collision-types";

// Import building constants from procgen to ensure consistency
import {
  CELL_SIZE,
  FLOOR_HEIGHT,
  FOUNDATION_HEIGHT,
  TILES_PER_CELL,
  snapToBuildingGrid,
} from "@hyperscape/procgen/building";

/** Wall direction to CollisionFlag mapping */
const WALL_DIRECTION_TO_FLAG: Record<WallDirection, number> = {
  north: CollisionFlag.WALL_NORTH,
  south: CollisionFlag.WALL_SOUTH,
  east: CollisionFlag.WALL_EAST,
  west: CollisionFlag.WALL_WEST,
};

/** Cardinal directions with delta offsets (reused across methods) */
const CARDINAL_DIRECTIONS: ReadonlyArray<{
  dir: WallDirection;
  dc: number;
  dr: number;
}> = [
  { dir: "north", dc: 0, dr: 1 },
  { dir: "south", dc: 0, dr: -1 },
  { dir: "east", dc: 1, dr: 0 },
  { dir: "west", dc: -1, dr: 0 },
];

/** Default collision result for tiles outside buildings (frozen to prevent mutation) */
const DEFAULT_COLLISION_RESULT: Readonly<BuildingCollisionResult> =
  Object.freeze({
    isInsideBuilding: false,
    buildingId: null,
    isWalkable: true,
    floorIndex: null,
    elevation: null,
    wallBlocking: Object.freeze({
      north: false,
      south: false,
      east: false,
      west: false,
    }),
    stairTile: null,
  });

/**
 * BuildingCollisionService
 *
 * Singleton service managing all building collision data.
 * Provides registration, queries, and player floor tracking.
 */
export class BuildingCollisionService {
  private world: World;

  /** All registered buildings by ID */
  private buildings: Map<string, BuildingCollisionData> = new Map();

  /** Spatial index: tile key -> building IDs that cover this tile */
  private tileToBuildings: Map<string, Set<string>> = new Map();

  /** Player floor states by entity ID */
  private playerFloorStates: Map<EntityID, PlayerBuildingState> = new Map();

  constructor(world: World) {
    this.world = world;
  }

  // ============================================================================
  // BUILDING REGISTRATION
  // ============================================================================

  /**
   * Register a building's collision data
   *
   * Converts building layout to collision data and registers with CollisionMatrix.
   *
   * @param buildingId - Unique building ID
   * @param townId - Town this building belongs to
   * @param layout - Building layout from BuildingGenerator
   * @param worldPosition - Building center position in world coords
   * @param rotation - Y-axis rotation in radians
   */
  registerBuilding(
    buildingId: string,
    townId: string,
    layout: BuildingLayoutInput,
    worldPosition: { x: number; y: number; z: number },
    rotation: number,
  ): void {
    // Generate collision data from layout
    const collisionData = this.generateCollisionData(
      buildingId,
      townId,
      layout,
      worldPosition,
      rotation,
    );

    // Store building data
    this.buildings.set(buildingId, collisionData);

    // Update spatial index
    this.updateSpatialIndex(collisionData);

    // Register walls with CollisionMatrix
    this.registerWallsWithCollisionMatrix(collisionData);
  }

  /**
   * Unregister a building (e.g., when destroyed)
   */
  unregisterBuilding(buildingId: string): void {
    const building = this.buildings.get(buildingId);
    if (!building) return;

    // Remove from spatial index
    this.removeSpatialIndex(building);

    // Remove wall flags from CollisionMatrix
    this.unregisterWallsFromCollisionMatrix(building);

    // Remove building data
    this.buildings.delete(buildingId);
  }

  // ============================================================================
  // COLLISION DATA GENERATION
  // ============================================================================

  /**
   * Generate collision data from building layout
   */
  private generateCollisionData(
    buildingId: string,
    townId: string,
    layout: BuildingLayoutInput,
    worldPosition: { x: number; y: number; z: number },
    rotation: number,
  ): BuildingCollisionData {
    const floors: FloorCollisionData[] = [];

    // Track bounding box
    let minTileX = Infinity;
    let maxTileX = -Infinity;
    let minTileZ = Infinity;
    let maxTileZ = -Infinity;

    // Process each floor
    for (let floorIndex = 0; floorIndex < layout.floors; floorIndex++) {
      const floorPlan = layout.floorPlans[floorIndex];
      if (!floorPlan) continue;

      const floorData = this.generateFloorCollisionData(
        floorIndex,
        floorPlan,
        layout,
        worldPosition,
        rotation,
      );

      floors.push(floorData);

      // Update bounding box from walkable tiles
      for (const key of floorData.walkableTiles) {
        const [x, z] = key.split(",").map(Number);
        minTileX = Math.min(minTileX, x);
        maxTileX = Math.max(maxTileX, x);
        minTileZ = Math.min(minTileZ, z);
        maxTileZ = Math.max(maxTileZ, z);
      }
    }

    // Generate roof floor (top of building)
    const roofFloor = this.generateRoofCollisionData(
      layout,
      worldPosition,
      rotation,
    );
    if (roofFloor) {
      floors.push(roofFloor);
    }

    return {
      buildingId,
      townId,
      worldPosition,
      rotation,
      cellWidth: layout.width,
      cellDepth: layout.depth,
      floors,
      boundingBox: {
        minTileX,
        maxTileX,
        minTileZ,
        maxTileZ,
      },
    };
  }

  /**
   * Generate collision data for a single floor
   */
  private generateFloorCollisionData(
    floorIndex: number,
    floorPlan: BuildingLayoutInput["floorPlans"][0],
    layout: BuildingLayoutInput,
    worldPosition: { x: number; y: number; z: number },
    rotation: number,
  ): FloorCollisionData {
    const walkableTiles = new Set<string>();
    const wallSegments: WallSegment[] = [];
    const stairTiles: StairTile[] = [];

    // Calculate floor elevation
    const elevation =
      worldPosition.y + FOUNDATION_HEIGHT + floorIndex * FLOOR_HEIGHT;

    // Process each cell in the footprint
    // IMPORTANT: Each cell is CELL_SIZE x CELL_SIZE meters (4m), which covers TILES_PER_CELL x TILES_PER_CELL tiles (4x4 = 16)
    // We need to register ALL tiles within each cell as walkable, not just the center
    // Building positions must be grid-aligned (via snapToBuildingGrid) for this to work correctly
    const tilesPerCell = TILES_PER_CELL;

    for (let row = 0; row < floorPlan.footprint.length; row++) {
      for (let col = 0; col < floorPlan.footprint[row].length; col++) {
        if (!floorPlan.footprint[row][col]) continue;

        const cell: CellCoord = { col, row };

        // Get the center tile of this cell (for reference point)
        const centerTile = cellToWorldTile(
          cell,
          worldPosition.x,
          worldPosition.z,
          layout.width,
          layout.depth,
          rotation,
          CELL_SIZE,
        );

        // Register ALL tiles within this cell as walkable
        // Each cell is tilesPerCell x tilesPerCell tiles
        // Center the tile grid on the cell center
        const halfTiles = Math.floor(tilesPerCell / 2);
        for (let dtx = -halfTiles; dtx < tilesPerCell - halfTiles; dtx++) {
          for (let dtz = -halfTiles; dtz < tilesPerCell - halfTiles; dtz++) {
            const tileX = centerTile.x + dtx;
            const tileZ = centerTile.z + dtz;
            walkableTiles.add(tileKey(tileX, tileZ));
          }
        }

        // Generate walls for this cell (walls are at cell boundaries)
        const cellWalls = this.generateCellWalls(
          cell,
          floorPlan,
          worldPosition,
          rotation,
          layout.width,
          layout.depth,
        );
        wallSegments.push(...cellWalls);
      }
    }

    // Process stairs on this floor
    if (layout.stairs && floorIndex < layout.floors) {
      const stairData = this.generateStairTiles(
        layout.stairs,
        floorIndex,
        worldPosition,
        rotation,
        layout.width,
        layout.depth,
      );
      stairTiles.push(...stairData);
    }

    return {
      floorIndex,
      elevation,
      walkableTiles,
      wallSegments,
      stairTiles,
    };
  }

  /**
   * Generate wall segments for a single cell
   *
   * IMPORTANT: Each cell is CELL_SIZE x CELL_SIZE meters (4x4 tiles).
   * Wall flags should be set on ALL tiles within the cell that have that wall.
   * This ensures movement is blocked in the correct direction from any tile in the cell.
   */
  private generateCellWalls(
    cell: CellCoord,
    floorPlan: BuildingLayoutInput["floorPlans"][0],
    worldPosition: { x: number; y: number; z: number },
    rotation: number,
    buildingWidth: number,
    buildingDepth: number,
  ): WallSegment[] {
    const walls: WallSegment[] = [];
    const { col, row } = cell;
    const footprint = floorPlan.footprint;
    const roomMap = floorPlan.roomMap;
    const roomId = roomMap[row]?.[col] ?? -1;

    // Get center tile of this cell
    const centerTile = cellToWorldTile(
      cell,
      worldPosition.x,
      worldPosition.z,
      buildingWidth,
      buildingDepth,
      rotation,
      CELL_SIZE,
    );

    // Calculate tile coverage for this cell (CELL_SIZE tiles in each direction)
    const tilesPerCell = Math.ceil(CELL_SIZE);
    const halfTiles = Math.floor(tilesPerCell / 2);

    // Check each cardinal direction for walls
    for (const { dir, dc, dr } of CARDINAL_DIRECTIONS) {
      const neighborCol = col + dc;
      const neighborRow = row + dr;
      const neighborExists = footprint[neighborRow]?.[neighborCol] === true;
      const neighborRoomId = roomMap[neighborRow]?.[neighborCol] ?? -1;

      // Determine if there should be a wall
      let shouldHaveWall = false;
      let hasOpening = false;
      let openingType: "door" | "arch" | "window" | undefined;

      if (!neighborExists) {
        // External edge - wall unless there's an external opening
        shouldHaveWall = true;
        const openingKey = `${col},${row},${dir}`;
        const externalOpening = floorPlan.externalOpenings.get(openingKey);
        if (externalOpening) {
          hasOpening = externalOpening !== "window"; // Windows don't allow passage
          openingType = externalOpening as "door" | "arch" | "window";
        }
      } else if (neighborRoomId !== roomId && neighborRoomId !== -1) {
        // Internal wall between rooms - wall unless there's an internal opening
        shouldHaveWall = true;
        const openingKey = `${col},${row},${dir}`;
        const internalOpening = floorPlan.internalOpenings.get(openingKey);
        if (internalOpening) {
          hasOpening = true;
          openingType = internalOpening as "door" | "arch";
        }
      }

      if (shouldHaveWall) {
        // Transform wall direction for rotation
        const worldDir = rotateWallDirection(dir, rotation);

        // Create wall segments for ALL tiles in this cell with this wall direction
        // This ensures that movement from ANY tile in the cell is blocked in that direction
        for (let dtx = -halfTiles; dtx < tilesPerCell - halfTiles; dtx++) {
          for (let dtz = -halfTiles; dtz < tilesPerCell - halfTiles; dtz++) {
            walls.push({
              tileX: centerTile.x + dtx,
              tileZ: centerTile.z + dtz,
              side: worldDir,
              hasOpening,
              openingType,
            });
          }
        }
      }
    }

    return walls;
  }

  /**
   * Generate stair tiles for floor transitions
   */
  private generateStairTiles(
    stairs: NonNullable<BuildingLayoutInput["stairs"]>,
    floorIndex: number,
    worldPosition: { x: number; y: number; z: number },
    rotation: number,
    buildingWidth: number,
    buildingDepth: number,
  ): StairTile[] {
    const stairTiles: StairTile[] = [];
    const direction = toWallDirection(stairs.direction);

    // Bottom stair tile (departure from this floor)
    const bottomCell: CellCoord = { col: stairs.col, row: stairs.row };
    const bottomWorldTile = cellToWorldTile(
      bottomCell,
      worldPosition.x,
      worldPosition.z,
      buildingWidth,
      buildingDepth,
      rotation,
      CELL_SIZE,
    );

    stairTiles.push({
      tileX: bottomWorldTile.x,
      tileZ: bottomWorldTile.z,
      fromFloor: floorIndex,
      toFloor: floorIndex + 1,
      direction: rotateWallDirection(direction, rotation),
      isLanding: false,
    });

    // Top landing tile (arrival to next floor)
    const topCell: CellCoord = {
      col: stairs.landing.col,
      row: stairs.landing.row,
    };
    const topWorldTile = cellToWorldTile(
      topCell,
      worldPosition.x,
      worldPosition.z,
      buildingWidth,
      buildingDepth,
      rotation,
      CELL_SIZE,
    );

    stairTiles.push({
      tileX: topWorldTile.x,
      tileZ: topWorldTile.z,
      fromFloor: floorIndex + 1,
      toFloor: floorIndex,
      direction: rotateWallDirection(getOppositeDirection(direction), rotation),
      isLanding: true,
    });

    return stairTiles;
  }

  /**
   * Generate roof collision data (walkable roof surface)
   */
  private generateRoofCollisionData(
    layout: BuildingLayoutInput,
    worldPosition: { x: number; y: number; z: number },
    rotation: number,
  ): FloorCollisionData | null {
    // Get the top floor footprint
    const topFloorPlan = layout.floorPlans[layout.floors - 1];
    if (!topFloorPlan) return null;

    const walkableTiles = new Set<string>();
    const wallSegments: WallSegment[] = [];

    // Roof elevation is at top of the building
    const elevation =
      worldPosition.y + FOUNDATION_HEIGHT + layout.floors * FLOOR_HEIGHT;

    // Each cell is CELL_SIZE x CELL_SIZE meters (4x4 tiles)
    const tilesPerCell = Math.ceil(CELL_SIZE);
    const halfTiles = Math.floor(tilesPerCell / 2);

    // Process each cell in the top floor footprint
    for (let row = 0; row < topFloorPlan.footprint.length; row++) {
      for (let col = 0; col < topFloorPlan.footprint[row].length; col++) {
        if (!topFloorPlan.footprint[row][col]) continue;

        const cell: CellCoord = { col, row };
        const centerTile = cellToWorldTile(
          cell,
          worldPosition.x,
          worldPosition.z,
          layout.width,
          layout.depth,
          rotation,
          CELL_SIZE,
        );

        // Register ALL tiles within this cell as walkable
        for (let dtx = -halfTiles; dtx < tilesPerCell - halfTiles; dtx++) {
          for (let dtz = -halfTiles; dtz < tilesPerCell - halfTiles; dtz++) {
            walkableTiles.add(tileKey(centerTile.x + dtx, centerTile.z + dtz));
          }
        }

        // Add edge walls (roof has walls on all external edges)
        for (const { dir, dc, dr } of CARDINAL_DIRECTIONS) {
          const neighborCol = col + dc;
          const neighborRow = row + dr;
          const neighborExists =
            topFloorPlan.footprint[neighborRow]?.[neighborCol] === true;

          if (!neighborExists) {
            const worldDir = rotateWallDirection(dir, rotation);

            // Create wall segments for ALL tiles in this cell with this wall direction
            for (let dtx = -halfTiles; dtx < tilesPerCell - halfTiles; dtx++) {
              for (
                let dtz = -halfTiles;
                dtz < tilesPerCell - halfTiles;
                dtz++
              ) {
                wallSegments.push({
                  tileX: centerTile.x + dtx,
                  tileZ: centerTile.z + dtz,
                  side: worldDir,
                  hasOpening: false,
                });
              }
            }
          }
        }
      }
    }

    return {
      floorIndex: layout.floors, // Roof is one floor above top floor
      elevation,
      walkableTiles,
      wallSegments,
      stairTiles: [], // Roof has no stairs (access via terrace or ladder)
    };
  }

  // ============================================================================
  // COLLISION MATRIX INTEGRATION
  // ============================================================================

  /**
   * Register building walls with the world's CollisionMatrix
   *
   * This adds directional WALL_* flags for walls that don't have openings.
   * Floors are NOT blocked - they remain walkable.
   *
   * **Important:** Only ground floor (floorIndex 0) walls are registered in
   * CollisionMatrix. This is because CollisionMatrix is 2D tile-based and
   * doesn't have floor awareness. Upper floor walls are handled by
   * queryCollision() which accepts a floor parameter.
   */
  private registerWallsWithCollisionMatrix(
    building: BuildingCollisionData,
  ): void {
    const collision = this.world.collision as CollisionMatrix;
    if (!collision) return;

    // Only register ground floor walls - CollisionMatrix is 2D and doesn't
    // have floor awareness. Upper floor collision is handled by queryCollision()
    const groundFloor = building.floors.find((f) => f.floorIndex === 0);
    if (!groundFloor) return;

    for (const wall of groundFloor.wallSegments) {
      // Only register walls that block movement (no openings)
      if (!wall.hasOpening) {
        const flag = WALL_DIRECTION_TO_FLAG[wall.side];
        if (flag) {
          collision.addFlags(wall.tileX, wall.tileZ, flag);
        }
      }
    }
  }

  /**
   * Remove building walls from CollisionMatrix
   */
  private unregisterWallsFromCollisionMatrix(
    building: BuildingCollisionData,
  ): void {
    const collision = this.world.collision as CollisionMatrix;
    if (!collision) return;

    // Only ground floor walls are registered in CollisionMatrix
    const groundFloor = building.floors.find((f) => f.floorIndex === 0);
    if (!groundFloor) return;

    for (const wall of groundFloor.wallSegments) {
      if (!wall.hasOpening) {
        const flag = WALL_DIRECTION_TO_FLAG[wall.side];
        if (flag) {
          collision.removeFlags(wall.tileX, wall.tileZ, flag);
        }
      }
    }
  }

  // ============================================================================
  // SPATIAL INDEX
  // ============================================================================

  /**
   * Update spatial index with building tiles
   */
  private updateSpatialIndex(building: BuildingCollisionData): void {
    for (const floor of building.floors) {
      for (const key of floor.walkableTiles) {
        let buildings = this.tileToBuildings.get(key);
        if (!buildings) {
          buildings = new Set();
          this.tileToBuildings.set(key, buildings);
        }
        buildings.add(building.buildingId);
      }
    }
  }

  /**
   * Remove building from spatial index
   */
  private removeSpatialIndex(building: BuildingCollisionData): void {
    for (const floor of building.floors) {
      for (const key of floor.walkableTiles) {
        const buildings = this.tileToBuildings.get(key);
        if (buildings) {
          buildings.delete(building.buildingId);
          if (buildings.size === 0) {
            this.tileToBuildings.delete(key);
          }
        }
      }
    }
  }

  // ============================================================================
  // COLLISION QUERIES
  // ============================================================================

  /**
   * Query collision state for a tile at a specific floor
   *
   * @param tileX - World tile X coordinate
   * @param tileZ - World tile Z coordinate
   * @param floorIndex - Floor to check (0 = ground floor)
   * @returns Collision result with walkability and wall data
   */
  queryCollision(
    tileX: number,
    tileZ: number,
    floorIndex: number,
  ): BuildingCollisionResult {
    const key = tileKey(tileX, tileZ);

    // Check spatial index for buildings at this tile
    const buildingIds = this.tileToBuildings.get(key);
    if (!buildingIds || buildingIds.size === 0) {
      return DEFAULT_COLLISION_RESULT;
    }

    // Check each building (usually just one)
    for (const buildingId of buildingIds) {
      const building = this.buildings.get(buildingId);
      if (!building) continue;

      // Find the floor
      const floor = building.floors.find((f) => f.floorIndex === floorIndex);
      if (!floor) continue;

      // Check if tile is walkable on this floor
      const isWalkable = floor.walkableTiles.has(key);

      // Get wall blocking for this tile
      const wallBlocking = {
        north: false,
        south: false,
        east: false,
        west: false,
      };

      for (const wall of floor.wallSegments) {
        if (wall.tileX === tileX && wall.tileZ === tileZ && !wall.hasOpening) {
          wallBlocking[wall.side] = true;
        }
      }

      // Check for stairs
      const stairTile =
        floor.stairTiles.find((s) => s.tileX === tileX && s.tileZ === tileZ) ||
        null;

      return {
        isInsideBuilding: true,
        buildingId,
        isWalkable,
        floorIndex,
        elevation: floor.elevation,
        wallBlocking,
        stairTile,
      };
    }

    // No matching floor found
    return DEFAULT_COLLISION_RESULT;
  }

  /**
   * Check if a tile is walkable at a specific floor
   *
   * This is the main query for pathfinding integration.
   *
   * @param tileX - World tile X coordinate
   * @param tileZ - World tile Z coordinate
   * @param floorIndex - Floor to check
   * @returns true if walkable at this floor
   */
  isWalkableAtFloor(tileX: number, tileZ: number, floorIndex: number): boolean {
    const result = this.queryCollision(tileX, tileZ, floorIndex);
    if (!result.isInsideBuilding) {
      return true; // Defer to terrain collision
    }
    return result.isWalkable;
  }

  /**
   * Check if movement is blocked by a wall
   *
   * @param fromX - Source tile X
   * @param fromZ - Source tile Z
   * @param toX - Destination tile X
   * @param toZ - Destination tile Z
   * @param floorIndex - Current floor
   * @returns true if movement is blocked by a wall
   */
  isWallBlocked(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    floorIndex: number,
  ): boolean {
    const dx = toX - fromX;
    const dz = toZ - fromZ;

    // Determine movement direction
    let exitDir: WallDirection | null = null;
    let entryDir: WallDirection | null = null;

    if (dx === 0 && dz === 1) {
      exitDir = "north";
      entryDir = "south";
    } else if (dx === 0 && dz === -1) {
      exitDir = "south";
      entryDir = "north";
    } else if (dx === 1 && dz === 0) {
      exitDir = "east";
      entryDir = "west";
    } else if (dx === -1 && dz === 0) {
      exitDir = "west";
      entryDir = "east";
    }

    if (!exitDir || !entryDir) {
      // Diagonal movement - not handled by wall collision.
      // Returns false (not blocked) because diagonal movement requires
      // checking two separate wall directions, which isn't supported yet.
      // The pathfinder handles diagonal blocking via terrain/collision matrix.
      return false;
    }

    // Check source tile for exit wall
    const fromResult = this.queryCollision(fromX, fromZ, floorIndex);
    if (fromResult.wallBlocking[exitDir]) {
      return true;
    }

    // Check destination tile for entry wall
    const toResult = this.queryCollision(toX, toZ, floorIndex);
    if (toResult.wallBlocking[entryDir]) {
      return true;
    }

    return false;
  }

  /**
   * Get the floor elevation at a tile position
   *
   * @param tileX - World tile X coordinate
   * @param tileZ - World tile Z coordinate
   * @param floorIndex - Floor to check
   * @returns Elevation in world Y units, or null if not in building
   */
  getFloorElevation(
    tileX: number,
    tileZ: number,
    floorIndex: number,
  ): number | null {
    const result = this.queryCollision(tileX, tileZ, floorIndex);
    return result.elevation;
  }

  /**
   * Find which building (if any) contains a tile
   */
  getBuildingAtTile(tileX: number, tileZ: number): string | null {
    const key = tileKey(tileX, tileZ);
    const buildingIds = this.tileToBuildings.get(key);
    if (!buildingIds || buildingIds.size === 0) return null;
    return buildingIds.values().next().value ?? null;
  }

  // ============================================================================
  // PLAYER FLOOR TRACKING
  // ============================================================================

  /**
   * Get or create player building state
   */
  getPlayerBuildingState(entityId: EntityID): PlayerBuildingState {
    let state = this.playerFloorStates.get(entityId);
    if (!state) {
      state = {
        insideBuildingId: null,
        currentFloor: 0,
        onStairs: false,
        stairData: null,
      };
      this.playerFloorStates.set(entityId, state);
    }
    return state;
  }

  /**
   * Update player's building state based on their current tile
   *
   * Call this when player moves to update their floor tracking.
   *
   * @param entityId - Player entity ID
   * @param tileX - Current tile X
   * @param tileZ - Current tile Z
   * @param worldY - Current world Y position (for floor detection)
   */
  updatePlayerBuildingState(
    entityId: EntityID,
    tileX: number,
    tileZ: number,
    worldY: number,
  ): void {
    const state = this.getPlayerBuildingState(entityId);
    const key = tileKey(tileX, tileZ);

    // Check if player is in a building
    const buildingIds = this.tileToBuildings.get(key);
    if (!buildingIds || buildingIds.size === 0) {
      // Player left building
      state.insideBuildingId = null;
      state.currentFloor = 0;
      state.onStairs = false;
      state.stairData = null;
      return;
    }

    const buildingId = buildingIds.values().next().value;
    if (!buildingId) return;

    const building = this.buildings.get(buildingId);
    if (!building) return;

    state.insideBuildingId = buildingId;

    // Find which floor the player is on based on elevation
    let bestFloor = 0;
    let bestElevationDiff = Infinity;

    for (const floor of building.floors) {
      if (!floor.walkableTiles.has(key)) continue;

      const diff = Math.abs(worldY - floor.elevation);
      if (diff < bestElevationDiff) {
        bestElevationDiff = diff;
        bestFloor = floor.floorIndex;
      }
    }

    state.currentFloor = bestFloor;

    // Check if on stairs
    const floor = building.floors.find((f) => f.floorIndex === bestFloor);
    if (floor) {
      const stair = floor.stairTiles.find(
        (s) => s.tileX === tileX && s.tileZ === tileZ,
      );
      state.onStairs = !!stair;
      state.stairData = stair || null;
    } else {
      state.onStairs = false;
      state.stairData = null;
    }
  }

  /**
   * Handle stair transition when player moves between stair tiles
   *
   * @param entityId - Player entity ID
   * @param fromTile - Previous tile
   * @param toTile - New tile
   * @returns New floor index if floor changed, null otherwise
   */
  handleStairTransition(
    entityId: EntityID,
    fromTile: TileCoord,
    toTile: TileCoord,
  ): number | null {
    const state = this.getPlayerBuildingState(entityId);
    if (!state.insideBuildingId) return null;

    const building = this.buildings.get(state.insideBuildingId);
    if (!building) return null;

    const floor = building.floors.find(
      (f) => f.floorIndex === state.currentFloor,
    );
    if (!floor) return null;

    // Check if moving onto a stair tile
    for (const stair of floor.stairTiles) {
      if (stair.tileX === toTile.x && stair.tileZ === toTile.z) {
        // Player stepped onto stair tile
        if (stair.isLanding && stair.fromFloor !== state.currentFloor) {
          // Arrived at landing from below/above
          state.currentFloor = stair.fromFloor;
          return stair.fromFloor;
        } else if (!stair.isLanding) {
          // Starting to climb stairs
          // Don't change floor yet - they need to reach the landing
          state.onStairs = true;
          state.stairData = stair;
        }
      }
    }

    // Check adjacent floor for arrival at landing
    const nextFloor = building.floors.find(
      (f) => f.floorIndex === state.currentFloor + 1,
    );
    if (nextFloor) {
      for (const stair of nextFloor.stairTiles) {
        if (
          stair.tileX === toTile.x &&
          stair.tileZ === toTile.z &&
          stair.isLanding
        ) {
          // Arrived at upper floor landing
          state.currentFloor = nextFloor.floorIndex;
          state.onStairs = false;
          state.stairData = null;
          return nextFloor.floorIndex;
        }
      }
    }

    // Check floor below for descending
    const prevFloor = building.floors.find(
      (f) => f.floorIndex === state.currentFloor - 1,
    );
    if (prevFloor) {
      for (const stair of prevFloor.stairTiles) {
        if (
          stair.tileX === toTile.x &&
          stair.tileZ === toTile.z &&
          !stair.isLanding
        ) {
          // Arrived at lower floor stair base
          state.currentFloor = prevFloor.floorIndex;
          state.onStairs = false;
          state.stairData = null;
          return prevFloor.floorIndex;
        }
      }
    }

    return null;
  }

  /**
   * Remove player state (on disconnect/despawn)
   */
  removePlayerState(entityId: EntityID): void {
    this.playerFloorStates.delete(entityId);
  }

  // ============================================================================
  // DEBUG / UTILITY
  // ============================================================================

  /**
   * Get all registered buildings
   */
  getAllBuildings(): BuildingCollisionData[] {
    return Array.from(this.buildings.values());
  }

  /**
   * Get building by ID
   */
  getBuilding(buildingId: string): BuildingCollisionData | undefined {
    return this.buildings.get(buildingId);
  }

  /**
   * Get count of registered buildings
   */
  getBuildingCount(): number {
    return this.buildings.size;
  }

  /**
   * Clear all registered buildings
   */
  clear(): void {
    // Unregister all walls from collision matrix
    for (const building of this.buildings.values()) {
      this.unregisterWallsFromCollisionMatrix(building);
    }

    this.buildings.clear();
    this.tileToBuildings.clear();
    this.playerFloorStates.clear();
  }
}
