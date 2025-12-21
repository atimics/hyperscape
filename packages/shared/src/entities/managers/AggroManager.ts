/**
 * AggroManager - Manages mob targeting and aggro behavior
 *
 * Responsibilities:
 * - Target acquisition (scanning for nearby players)
 * - Target validation (checking if target exists and is in range)
 * - Range checking (aggro range vs combat range)
 * - Aggro-on-damage behavior (auto-target attacker)
 * - Target clearing on death/respawn
 *
 * OSRS-Accurate Target Selection:
 * 1. Mob scans for ALL players within aggro range
 * 2. Random selection from valid candidates (not first-found)
 * 3. If attacked while idle, attacker becomes target
 * 4. Target is cleared on death or when out of range
 *
 * @see https://oldschool.runescape.wiki/w/Aggressiveness
 */

import type { Position3D } from "../../types";
import {
  worldToTile,
  tilesWithinRange,
  tileChebyshevDistance,
} from "../../systems/shared/movement/TileSystem";

export interface AggroConfig {
  /** Range at which mob detects and chases players */
  aggroRange: number;
  /** Range at which mob can attack target (in meters, 1 tile = 1 meter) */
  combatRange: number;
}

export interface PlayerTarget {
  id: string;
  position: Position3D;
}

export class AggroManager {
  private currentTarget: string | null = null;
  private config: AggroConfig;

  // Pre-allocated buffer for valid targets (zero-allocation target selection)
  // OSRS selects randomly from all valid candidates, not first-found
  private readonly _validTargetsBuffer: PlayerTarget[] = [];

  constructor(config: AggroConfig) {
    this.config = config;
  }

  /**
   * Find nearby player within aggro range (OSRS-accurate random selection)
   *
   * OSRS selects targets randomly from all valid candidates within range,
   * NOT by proximity or first-found. This ensures fair targeting behavior.
   *
   * @param currentPos - Mob's current position
   * @param players - Array of potential targets
   * @returns Random valid target, or null if none in range
   */
  findNearbyPlayer(
    currentPos: Position3D,
    players: Array<{
      id: string;
      position?: Position3D;
      node?: { position?: Position3D };
    }>,
  ): PlayerTarget | null {
    // Early exit if no players
    if (players.length === 0) return null;

    // Find all valid targets (no allocation - reuses buffer)
    this.findValidTargets(currentPos, players);

    // Random selection from valid candidates (OSRS-accurate)
    return this.selectRandomTarget();
  }

  /**
   * Find all valid aggro targets within range (zero-allocation)
   *
   * Populates the internal buffer with all valid targets.
   * Call selectRandomTarget() after to pick one.
   *
   * @param currentPos - Mob's current position
   * @param players - Array of potential targets
   */
  findValidTargets(
    currentPos: Position3D,
    players: Array<{
      id: string;
      position?: Position3D;
      node?: { position?: Position3D };
    }>,
  ): void {
    // Clear buffer (no allocation)
    this._validTargetsBuffer.length = 0;

    const mobTile = worldToTile(currentPos.x, currentPos.z);

    for (const player of players) {
      // Check both direct position AND node.position for compatibility
      // Server-side players may have position directly, client-side may use node.position
      const playerPos = player.position || player.node?.position;
      if (!playerPos) continue;

      // CRITICAL: Skip dead players (RuneScape-style: mobs don't aggro on corpses)
      if (!this.isValidTarget(player)) {
        continue;
      }

      // OSRS-accurate: Use tile-based Chebyshev distance (not Euclidean)
      const playerTile = worldToTile(playerPos.x, playerPos.z);
      const tileDistance = tileChebyshevDistance(mobTile, playerTile);

      if (tileDistance <= this.config.aggroRange) {
        this._validTargetsBuffer.push({
          id: player.id,
          position: {
            x: playerPos.x,
            y: playerPos.y,
            z: playerPos.z,
          },
        });
      }
    }
  }

  /**
   * Select random target from valid candidates (OSRS-accurate)
   *
   * OSRS selects targets randomly among all valid candidates,
   * NOT by priority or first-found.
   *
   * @returns Random target from buffer, or null if empty
   */
  selectRandomTarget(): PlayerTarget | null {
    const count = this._validTargetsBuffer.length;
    if (count === 0) return null;
    if (count === 1) return this._validTargetsBuffer[0];

    // Random selection (uniform distribution)
    const index = Math.floor(Math.random() * count);
    return this._validTargetsBuffer[index];
  }

  /**
   * Get count of valid targets in buffer
   * Useful for debugging and testing
   */
  getValidTargetCount(): number {
    return this._validTargetsBuffer.length;
  }

  /**
   * Check if a player is a valid target (not dead, not loading)
   */
  private isValidTarget(player: {
    id: string;
    position?: Position3D;
    node?: { position?: Position3D };
  }): boolean {
    // PlayerEntity has isDead() method and health as a number (not { current, max })
    const playerObj = player as Record<string, unknown>;

    // Check isDead() method
    if (
      typeof playerObj.isDead === "function" &&
      (playerObj.isDead as () => boolean)()
    ) {
      return false;
    }

    // Check health as number
    if (typeof playerObj.health === "number" && playerObj.health <= 0) {
      return false;
    }

    // Check health.current for legacy/network data formats
    const health = playerObj.health as { current?: number } | undefined;
    if (health?.current !== undefined && health.current <= 0) {
      return false;
    }

    // Check alive flag
    if (playerObj.alive === false) {
      return false;
    }

    // Check isLoading flag (skip players still loading)
    if (playerObj.isLoading === true) {
      return false;
    }

    return true;
  }

  /**
   * Get specific player by ID and return their position
   */
  getPlayer(
    playerId: string,
    getPlayerFn: (id: string) => {
      id: string;
      position?: Position3D;
      node?: { position?: Position3D };
    } | null,
  ): PlayerTarget | null {
    const player = getPlayerFn(playerId);
    if (!player) return null;

    // Check both direct position AND node.position for compatibility
    // Server-side players may have position directly, client-side may use node.position
    const playerPos = player.position || player.node?.position;
    if (!playerPos) return null;

    // CRITICAL: Return null if player is dead (RuneScape-style: clear target when player dies)
    if (!this.isValidTarget(player)) {
      return null;
    }

    return {
      id: player.id,
      position: {
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
      },
    };
  }

  /**
   * Check if target is within aggro range
   * Uses tile-based Chebyshev distance (OSRS-accurate)
   */
  isInAggroRange(mobPos: Position3D, targetPos: Position3D): boolean {
    const mobTile = worldToTile(mobPos.x, mobPos.z);
    const targetTile = worldToTile(targetPos.x, targetPos.z);
    const tileDistance = tileChebyshevDistance(mobTile, targetTile);
    return tileDistance <= this.config.aggroRange;
  }

  /**
   * Check if target is within combat range
   * Uses combatRange from config (in tiles, minimum 1)
   */
  isInCombatRange(mobPos: Position3D, targetPos: Position3D): boolean {
    const mobTile = worldToTile(mobPos.x, mobPos.z);
    const targetTile = worldToTile(targetPos.x, targetPos.z);
    const rangeTiles = Math.max(1, Math.floor(this.config.combatRange));
    return tilesWithinRange(mobTile, targetTile, rangeTiles);
  }

  /**
   * Set current target
   */
  setTarget(playerId: string): void {
    this.currentTarget = playerId;
  }

  /**
   * Get current target
   */
  getTarget(): string | null {
    return this.currentTarget;
  }

  /**
   * Clear current target
   */
  clearTarget(): void {
    this.currentTarget = null;
  }

  /**
   * Set target if none is currently set (used for aggro-on-damage)
   */
  setTargetIfNone(playerId: string): void {
    if (!this.currentTarget) {
      this.currentTarget = playerId;
    }
  }

  /**
   * Reset to initial state (for cleanup/respawn)
   */
  reset(): void {
    this.currentTarget = null;
  }

  /**
   * Get aggro range for external use
   */
  getAggroRange(): number {
    return this.config.aggroRange;
  }

  /**
   * Get combat range for external use
   */
  getCombatRange(): number {
    return this.config.combatRange;
  }
}
