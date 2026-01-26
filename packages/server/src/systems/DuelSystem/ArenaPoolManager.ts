/**
 * ArenaPoolManager
 *
 * Manages a pool of duel arenas for player dueling.
 *
 * Responsibilities:
 * - Track which arenas are in use
 * - Reserve arenas for new duels
 * - Release arenas when duels complete
 * - Provide spawn points and bounds for each arena
 *
 * Arena Layout (OSRS-style):
 * - 6 rectangular arenas arranged in a 2x3 grid
 * - Each arena has 2 spawn points (north and south)
 * - Arena bounds used for movement clamping if noMovement rule
 */

import type { Arena, ArenaSpawnPoint, ArenaBounds } from "@hyperscape/shared";

// ============================================================================
// Types
// ============================================================================

interface ArenaState {
  arena: Arena;
  currentDuelId: string | null;
}

// ============================================================================
// Arena Configuration
// ============================================================================

/**
 * Base coordinates for the arena area.
 * These should match the duel_arena zone configuration.
 */
const ARENA_BASE_X = 3360; // Duel Arena x coordinate
const ARENA_BASE_Z = 3240; // Duel Arena z coordinate
const ARENA_Y = 0; // Ground level

/**
 * Arena dimensions
 */
const ARENA_WIDTH = 20; // Width of each arena (x-axis)
const ARENA_LENGTH = 24; // Length of each arena (z-axis)
const ARENA_GAP = 4; // Gap between arenas

/**
 * Spawn offset from arena center
 */
const SPAWN_OFFSET = 8; // Distance from center to spawn point

/**
 * Generate arena configuration for a given arena ID (1-6)
 */
function generateArenaConfig(arenaId: number): Arena {
  // Calculate row and column (2x3 grid, IDs 1-6)
  const row = Math.floor((arenaId - 1) / 2); // 0, 0, 1, 1, 2, 2
  const col = (arenaId - 1) % 2; // 0, 1, 0, 1, 0, 1

  // Calculate center position
  const centerX =
    ARENA_BASE_X + col * (ARENA_WIDTH + ARENA_GAP) + ARENA_WIDTH / 2;
  const centerZ =
    ARENA_BASE_Z + row * (ARENA_LENGTH + ARENA_GAP) + ARENA_LENGTH / 2;

  // Calculate bounds
  const bounds: ArenaBounds = {
    min: {
      x: centerX - ARENA_WIDTH / 2,
      y: ARENA_Y - 1,
      z: centerZ - ARENA_LENGTH / 2,
    },
    max: {
      x: centerX + ARENA_WIDTH / 2,
      y: ARENA_Y + 10,
      z: centerZ + ARENA_LENGTH / 2,
    },
  };

  // Calculate spawn points (north and south)
  const spawnPoints: [ArenaSpawnPoint, ArenaSpawnPoint] = [
    { x: centerX, y: ARENA_Y, z: centerZ - SPAWN_OFFSET }, // North spawn
    { x: centerX, y: ARENA_Y, z: centerZ + SPAWN_OFFSET }, // South spawn
  ];

  return {
    arenaId,
    inUse: false,
    currentDuelId: null,
    spawnPoints,
    bounds,
    center: { x: centerX, z: centerZ },
  };
}

// ============================================================================
// ArenaPoolManager Class
// ============================================================================

export class ArenaPoolManager {
  /** Number of arenas in the pool */
  private static readonly ARENA_COUNT = 6;

  /** Arena states by ID */
  private arenas: Map<number, ArenaState> = new Map();

  constructor() {
    this.initializeArenas();
  }

  /**
   * Initialize all arenas in the pool
   */
  private initializeArenas(): void {
    for (let i = 1; i <= ArenaPoolManager.ARENA_COUNT; i++) {
      const arena = generateArenaConfig(i);
      this.arenas.set(i, {
        arena,
        currentDuelId: null,
      });
    }
  }

  /**
   * Reserve an available arena for a duel
   * @returns Arena ID if one is available, null otherwise
   */
  reserveArena(duelId: string): number | null {
    for (const [arenaId, state] of this.arenas) {
      if (!state.currentDuelId) {
        state.currentDuelId = duelId;
        state.arena.inUse = true;
        state.arena.currentDuelId = duelId;
        return arenaId;
      }
    }
    return null;
  }

  /**
   * Release an arena back to the pool
   */
  releaseArena(arenaId: number): boolean {
    const state = this.arenas.get(arenaId);
    if (!state) return false;

    state.currentDuelId = null;
    state.arena.inUse = false;
    state.arena.currentDuelId = null;
    return true;
  }

  /**
   * Release arena by duel ID (when duel ends)
   */
  releaseArenaByDuelId(duelId: string): boolean {
    for (const [arenaId, state] of this.arenas) {
      if (state.currentDuelId === duelId) {
        return this.releaseArena(arenaId);
      }
    }
    return false;
  }

  /**
   * Get arena configuration by ID
   */
  getArena(arenaId: number): Arena | undefined {
    return this.arenas.get(arenaId)?.arena;
  }

  /**
   * Get spawn points for an arena
   */
  getSpawnPoints(
    arenaId: number,
  ): [ArenaSpawnPoint, ArenaSpawnPoint] | undefined {
    return this.arenas.get(arenaId)?.arena.spawnPoints;
  }

  /**
   * Get arena bounds for movement clamping
   */
  getArenaBounds(arenaId: number): ArenaBounds | undefined {
    return this.arenas.get(arenaId)?.arena.bounds;
  }

  /**
   * Get arena center position
   */
  getArenaCenter(arenaId: number): { x: number; z: number } | undefined {
    return this.arenas.get(arenaId)?.arena.center;
  }

  /**
   * Check if an arena is available
   */
  isArenaAvailable(arenaId: number): boolean {
    const state = this.arenas.get(arenaId);
    return state ? !state.currentDuelId : false;
  }

  /**
   * Get count of available arenas
   */
  getAvailableCount(): number {
    let count = 0;
    for (const state of this.arenas.values()) {
      if (!state.currentDuelId) count++;
    }
    return count;
  }

  /**
   * Get all arena IDs
   */
  getAllArenaIds(): number[] {
    return Array.from(this.arenas.keys());
  }

  /**
   * Get the duel ID currently using an arena
   */
  getDuelIdForArena(arenaId: number): string | null {
    return this.arenas.get(arenaId)?.currentDuelId ?? null;
  }
}
