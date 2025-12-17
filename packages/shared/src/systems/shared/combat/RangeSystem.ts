/**
 * RangeSystem - OSRS-accurate range calculations
 *
 * OSRS has THREE distinct range types:
 * 1. Hunt Range: Where NPC searches for targets (origin: SW tile)
 * 2. Attack Range: Where NPC can perform attacks (origin: ALL occupied tiles)
 * 3. Max Range: Maximum distance from spawn (origin: spawn point)
 *
 * Key differences from naive implementations:
 * - Hunt range uses only the SW tile as origin
 * - Attack range checks from ALL tiles the NPC occupies
 * - Large NPCs (2x2, 3x3) occupy multiple tiles
 * - Melee range 1 excludes diagonals (cardinal only)
 *
 * @see https://oldschool.runescape.wiki/w/Aggressiveness
 * @see MOB_AGGRO_IMPLEMENTATION_PLAN.md Phase 2.2
 */

import type { TileCoord } from "../movement/TileSystem";
import {
  worldToTile,
  tileChebyshevDistance,
  tilesWithinMeleeRange,
} from "../movement/TileSystem";
import { AttackType } from "../../../types/core/core";
import type { Position3D } from "../../../types";
import { TILE_SIZE } from "../movement/TileSystem";

/**
 * NPC size configuration
 */
export interface NPCSize {
  width: number; // tiles in X direction
  depth: number; // tiles in Z direction
}

/**
 * NPC data required for range calculations
 */
export interface NPCRangeData {
  position: Position3D;
  size: NPCSize;
  huntRange: number; // tiles
  attackRange: number; // tiles
  maxRange: number; // tiles from spawn
  attackType: AttackType;
}

/**
 * Default NPC sizes for common mob types
 */
export const NPC_SIZES: Record<string, NPCSize> = {
  // 1x1 (default)
  goblin: { width: 1, depth: 1 },
  cow: { width: 1, depth: 1 },
  chicken: { width: 1, depth: 1 },
  rat: { width: 1, depth: 1 },
  spider: { width: 1, depth: 1 },
  skeleton: { width: 1, depth: 1 },
  zombie: { width: 1, depth: 1 },
  imp: { width: 1, depth: 1 },

  // 2x2
  general_graardor: { width: 2, depth: 2 },
  kril_tsutsaroth: { width: 2, depth: 2 },
  commander_zilyana: { width: 2, depth: 2 },
  kreearra: { width: 2, depth: 2 },
  giant_mole: { width: 2, depth: 2 },
  kalphite_queen: { width: 2, depth: 2 },

  // 3x3
  corporeal_beast: { width: 3, depth: 3 },
  cerberus: { width: 3, depth: 3 },
  king_black_dragon: { width: 3, depth: 3 },

  // 4x4
  vorkath: { width: 4, depth: 4 },

  // 5x5
  olm_head: { width: 5, depth: 5 },
};

/**
 * Get NPC size by mob type, defaulting to 1x1
 */
export function getNPCSize(mobType: string): NPCSize {
  return NPC_SIZES[mobType.toLowerCase()] ?? { width: 1, depth: 1 };
}

/**
 * RangeSystem - OSRS-accurate range calculations
 *
 * Provides methods for all three OSRS range types with zero allocations
 * in the hot path (uses pre-allocated buffers).
 */
export class RangeSystem {
  // Pre-allocated for zero-GC range checks
  private readonly _tileBuffer: TileCoord = { x: 0, z: 0 };
  private readonly _occupiedTiles: TileCoord[] = [];

  // Pre-allocate occupied tiles buffer for largest expected NPC (5x5 = 25 tiles)
  constructor() {
    for (let i = 0; i < 25; i++) {
      this._occupiedTiles.push({ x: 0, z: 0 });
    }
  }

  /**
   * Check if player is within hunt range (NPC initiates aggro)
   *
   * OSRS: Hunt range is measured from the NPC's SW tile only.
   * This is the tile with the smallest X and Z coordinates.
   *
   * @param npc - NPC data including position and size
   * @param playerPos - Player's world position
   * @returns true if player is within hunt range
   */
  isInHuntRange(npc: NPCRangeData, playerPos: Position3D): boolean {
    // Hunt range originates from SW tile only
    const npcSWTile = this.getSWTile(npc.position);
    const playerTile = worldToTile(playerPos.x, playerPos.z);
    const distance = tileChebyshevDistance(npcSWTile, playerTile);
    return distance <= npc.huntRange;
  }

  /**
   * Check if player is within attack range (NPC can attack)
   *
   * OSRS: Attack range is measured from ALL tiles the NPC occupies.
   * For a 2x2 NPC, the player can be attacked if they're within range
   * of ANY of the 4 tiles the NPC stands on.
   *
   * @param npc - NPC data including position and size
   * @param playerPos - Player's world position
   * @returns true if player is within attack range
   */
  isInAttackRange(npc: NPCRangeData, playerPos: Position3D): boolean {
    const playerTile = worldToTile(playerPos.x, playerPos.z);

    // Get all tiles NPC occupies
    const occupiedCount = this.getOccupiedTiles(npc.position, npc.size);

    // Player must be in range of ANY occupied tile
    for (let i = 0; i < occupiedCount; i++) {
      const npcTile = this._occupiedTiles[i];
      if (
        this.checkAttackRange(
          npcTile,
          playerTile,
          npc.attackType,
          npc.attackRange,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if NPC is within max range from spawn
   *
   * Used for leashing - NPC should return to spawn if too far.
   * Measured from SW tile to spawn point.
   *
   * @param npc - NPC data including position
   * @param spawnPoint - Spawn tile coordinates
   * @returns true if within max range
   */
  isWithinMaxRange(npc: NPCRangeData, spawnPoint: TileCoord): boolean {
    const npcSWTile = this.getSWTile(npc.position);
    const distance = tileChebyshevDistance(npcSWTile, spawnPoint);
    return distance <= npc.maxRange;
  }

  /**
   * Get distance from NPC to target (for pathfinding priority)
   *
   * Uses SW tile as origin for consistency with hunt range.
   *
   * @param npcPos - NPC's world position
   * @param targetPos - Target's world position
   * @returns Distance in tiles (Chebyshev)
   */
  getDistanceToTarget(npcPos: Position3D, targetPos: Position3D): number {
    const npcTile = worldToTile(npcPos.x, npcPos.z);
    const targetTile = worldToTile(targetPos.x, targetPos.z);
    return tileChebyshevDistance(npcTile, targetTile);
  }

  /**
   * Get SW tile for NPC (true position for hunt range calculations)
   *
   * The SW tile is the tile containing the NPC's position,
   * which is typically the SW corner of large NPCs.
   */
  getSWTile(npcPos: Position3D): TileCoord {
    this._tileBuffer.x = Math.floor(npcPos.x / TILE_SIZE);
    this._tileBuffer.z = Math.floor(npcPos.z / TILE_SIZE);
    return this._tileBuffer;
  }

  /**
   * Get all tiles occupied by NPC
   *
   * Size 1 = 1 tile, Size 2 = 4 tiles (2x2), etc.
   * Returns the count of tiles filled into the buffer.
   *
   * @param npcPos - NPC's world position (SW corner)
   * @param size - NPC's size in tiles
   * @returns Number of tiles filled
   */
  getOccupiedTiles(npcPos: Position3D, size: NPCSize): number {
    const swTile = this.getSWTile(npcPos);
    const width = size.width || 1;
    const depth = size.depth || 1;

    let index = 0;
    for (let dx = 0; dx < width; dx++) {
      for (let dz = 0; dz < depth; dz++) {
        if (index < this._occupiedTiles.length) {
          this._occupiedTiles[index].x = swTile.x + dx;
          this._occupiedTiles[index].z = swTile.z + dz;
          index++;
        }
      }
    }

    return index;
  }

  /**
   * Get the occupied tiles buffer (read-only)
   *
   * Use the count returned by getOccupiedTiles() to know how many are valid.
   */
  getOccupiedTilesBuffer(): readonly TileCoord[] {
    return this._occupiedTiles;
  }

  /**
   * Check if a tile is occupied by a large NPC
   *
   * @param tile - Tile to check
   * @param npcPos - NPC's world position (SW corner)
   * @param size - NPC's size
   * @returns true if tile is occupied
   */
  isTileOccupied(tile: TileCoord, npcPos: Position3D, size: NPCSize): boolean {
    const swTile = this.getSWTile(npcPos);
    return (
      tile.x >= swTile.x &&
      tile.x < swTile.x + (size.width || 1) &&
      tile.z >= swTile.z &&
      tile.z < swTile.z + (size.depth || 1)
    );
  }

  /**
   * Check attack range from a single tile
   *
   * Uses OSRS-accurate melee rules:
   * - Range 1: Cardinal only (N/S/E/W)
   * - Range 2+: Includes diagonals
   *
   * @param attackerTile - Attacker's tile
   * @param targetTile - Target's tile
   * @param attackType - Melee or ranged
   * @param range - Attack range in tiles
   * @returns true if in range
   */
  private checkAttackRange(
    attackerTile: TileCoord,
    targetTile: TileCoord,
    attackType: AttackType,
    range: number,
  ): boolean {
    if (attackType === AttackType.MELEE) {
      return tilesWithinMeleeRange(attackerTile, targetTile, range);
    }

    // Ranged/magic uses Chebyshev distance
    const distance = tileChebyshevDistance(attackerTile, targetTile);
    return distance <= range && distance > 0;
  }
}

// Singleton instance for convenience (no state except pre-allocated buffers)
let _rangeSystemInstance: RangeSystem | null = null;

/**
 * Get the shared RangeSystem instance
 */
export function getRangeSystem(): RangeSystem {
  if (!_rangeSystemInstance) {
    _rangeSystemInstance = new RangeSystem();
  }
  return _rangeSystemInstance;
}
