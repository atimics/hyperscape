/**
 * Gathering Constants
 *
 * Centralized constants for the resource gathering system.
 * OSRS-accurate timing and gathering values.
 *
 * @see https://oldschool.runescape.wiki/w/Woodcutting
 * @see https://oldschool.runescape.wiki/w/Mining
 * @see https://oldschool.runescape.wiki/w/Fishing
 */

export const GATHERING_CONSTANTS = {
  // === Tile-Based Range (tiles) ===
  /**
   * Gathering interaction range in tiles.
   * Uses cardinal-only adjacent tiles (N/S/E/W) like standard melee combat.
   *
   * OSRS: Players must stand on a cardinal adjacent tile to gather resources.
   * This is equivalent to COMBAT_CONSTANTS.MELEE_RANGE_STANDARD.
   *
   * @see https://oldschool.runescape.wiki/w/Pathfinding
   */
  GATHERING_RANGE: 1,

  // === Proximity and Range (world units - legacy) ===
  /** Maximum distance to search for nearby resources when exact match fails */
  PROXIMITY_SEARCH_RADIUS: 15,
  /** Default interaction range for gathering (world units, legacy) */
  DEFAULT_INTERACTION_RANGE: 4.0,
  /** Floating point tolerance for position comparison (OSRS: any movement cancels) */
  POSITION_EPSILON: 0.01,

  // === Timing (ticks/ms) ===
  /** Minimum ticks between gather attempts (prevents instant gathering) */
  MINIMUM_CYCLE_TICKS: 2,
  /** Rate limit cooldown in milliseconds (matches 1 tick) */
  RATE_LIMIT_MS: 600,
  /** Stale rate limit threshold for cleanup (10 seconds) */
  STALE_RATE_LIMIT_MS: 10000,
  /** Rate limit cleanup interval (60 seconds) */
  RATE_LIMIT_CLEANUP_INTERVAL_MS: 60000,

  // === Success Rate Formula ===
  /** Base success rate at exactly required level */
  BASE_SUCCESS_RATE: 0.35,
  /** Additional success rate per level above requirement */
  PER_LEVEL_SUCCESS_BONUS: 0.01,
  /** Minimum possible success rate */
  MIN_SUCCESS_RATE: 0.25,
  /** Maximum possible success rate */
  MAX_SUCCESS_RATE: 0.85,

  // === Cycle Time Formula ===
  /** Maximum level factor for cycle reduction */
  MAX_LEVEL_FACTOR: 0.3,
  /** Level factor per level above requirement */
  LEVEL_FACTOR_PER_LEVEL: 0.005,

  // === Resource ID Validation ===
  /** Maximum allowed length for resource IDs */
  MAX_RESOURCE_ID_LENGTH: 100,
  /** Pattern for valid resource IDs (alphanumeric, underscore, hyphen, dot) */
  VALID_RESOURCE_ID_PATTERN: /^[a-zA-Z0-9_.-]+$/,

  // === Tree Despawn Times (ticks) - Forestry System ===
  /**
   * OSRS Forestry-style tree depletion timer.
   * Timer starts on FIRST LOG, counts down while chopping, regenerates when idle.
   * Tree only depletes when timer=0 AND player receives a log.
   *
   * @see https://oldschool.runescape.wiki/w/Forestry
   * @see https://github.com/runelite/runelite/discussions/16894
   */
  TREE_DESPAWN_TICKS: {
    tree: 0, // Regular trees use 1/8 chance, not timer
    oak: 45, // 27 seconds
    willow: 50, // 30 seconds
    teak: 50, // 30 seconds
    maple: 100, // 60 seconds
    yew: 190, // 114 seconds
    magic: 390, // 234 seconds
    redwood: 440, // 264 seconds
  } as const,

  // === Tree Respawn Times (ticks) ===
  /**
   * Time for depleted trees to respawn.
   *
   * @see https://oldschool.runescape.wiki/w/Tree
   */
  TREE_RESPAWN_TICKS: {
    tree: 10, // ~6 seconds
    oak: 14, // ~8.4 seconds
    willow: 14, // ~8.4 seconds
    teak: 15, // ~9 seconds
    maple: 59, // ~35.4 seconds
    yew: 100, // ~60 seconds
    magic: 199, // ~119.4 seconds
    redwood: 199, // ~119.4 seconds
  } as const,

  // === Mining Depletion (chance-based, NOT timer) ===
  /**
   * Mining uses chance-based depletion, not timer-based like Forestry trees.
   * Each ore mined has a chance to deplete the rock.
   *
   * @see https://oldschool.runescape.wiki/w/Mining
   */
  MINING_DEPLETE_CHANCE: 0.125, // 1/8 for most rocks
  MINING_REDWOOD_DEPLETE_CHANCE: 0.091, // 1/11 for redwood stumps

  // === Timer Regeneration ===
  /**
   * Rate at which tree timers regenerate when no one is gathering.
   * OSRS: 1 tick of regeneration per 1 tick of not being gathered.
   */
  TIMER_REGEN_PER_TICK: 1,
} as const;

export type GatheringConstants = typeof GATHERING_CONSTANTS;
