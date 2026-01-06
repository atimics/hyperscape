/**
 * Processing Constants
 *
 * Centralized constants for firemaking and cooking systems.
 * OSRS-accurate timing and values.
 *
 * @see https://oldschool.runescape.wiki/w/Firemaking
 * @see https://oldschool.runescape.wiki/w/Cooking
 */

export const PROCESSING_CONSTANTS = {
  // === Skill-Specific Mechanics (OSRS-accurate) ===
  /**
   * FIREMAKING: Fixed 4-tick attempts, level affects success rate
   * COOKING: Fixed 4-tick per item, level affects burn rate
   */
  SKILL_MECHANICS: {
    firemaking: {
      type: "fixed-roll-retry-on-fail" as const,
      /** Attempt to light every 4 ticks */
      baseRollTicks: 4,
      /** On failure, retry immediately (next 4 ticks) */
      retryOnFail: true,
      /** Success rate varies by level */
      levelAffectsSuccess: true,
    },
    cooking: {
      type: "fixed-tick-continuous" as const,
      /** Each item takes 4 ticks to cook */
      ticksPerItem: 4,
      /** Level affects burn chance, not speed */
      levelAffectsBurn: true,
      levelAffectsSpeed: false,
    },
  } as const,

  // === Firemaking Success Rates (OSRS formula) ===
  /**
   * OSRS Firemaking: 65/256 at level 1, 513/256 at level 99
   * 100% success reached at level 43
   *
   * @see https://oldschool.runescape.wiki/w/Firemaking
   */
  FIREMAKING_SUCCESS_RATE: {
    low: 65, // Numerator at level 1 (65/256 = 25.4%)
    high: 513, // Numerator at level 99 (capped to 100%)
  },

  // === Fire Properties ===
  FIRE: {
    /** Minimum fire duration in ticks (60 seconds) - OSRS per Mod Ash */
    minDurationTicks: 100,
    /** Maximum fire duration in ticks (119 seconds) - OSRS per Mod Ash */
    maxDurationTicks: 198,
    /** Maximum fires per player */
    maxFiresPerPlayer: 3,
    /** Maximum fires per tile area (performance limit) */
    maxFiresPerArea: 20,
    /** Fire interaction range in tiles */
    interactionRange: 1,
  },

  // === Walk-West Movement Priority (OSRS) ===
  /**
   * After lighting fire, player walks in this priority order:
   * 1. West (preferred)
   * 2. East (if west blocked)
   * 3. South (if east blocked)
   * 4. North (if south blocked)
   */
  FIRE_WALK_PRIORITY: ["west", "east", "south", "north"] as const,

  // === Cooking Burn Levels (OSRS lookup tables) ===
  /**
   * Stop-burn levels by food type.
   * Format: { fire: level, range: level }
   * FUTURE: Add gauntlets field when cooking equipment is implemented
   */
  COOKING_BURN_LEVELS: {
    // OSRS-accurate stop-burn levels (verified against wiki 2025)
    // Note: Range generally burns less than fire
    raw_shrimp: { fire: 34, range: 33 },
    raw_anchovies: { fire: 34, range: 33 },
    raw_sardine: { fire: 38, range: 35 },
    raw_herring: { fire: 41, range: 37 },
    raw_trout: { fire: 49, range: 46 }, // Wiki: fire=49
    raw_pike: { fire: 54, range: 50 }, // Wiki: fire=54
    raw_salmon: { fire: 58, range: 55 },
    raw_lobster: { fire: 74, range: 74 }, // Wiki: range=74 (same as fire)
    raw_swordfish: { fire: 86, range: 80 }, // Wiki: range=80
    raw_monkfish: { fire: 92, range: 90 },
    raw_shark: { fire: 99, range: 99 },
  } as const,

  // === XP Values ===
  FIREMAKING_XP: {
    logs: 40,
    oak_logs: 60,
    willow_logs: 90,
    teak_logs: 105,
    maple_logs: 135,
    mahogany_logs: 157.5,
    yew_logs: 202.5,
    magic_logs: 303.8,
    redwood_logs: 350,
  } as const,

  COOKING_XP: {
    raw_shrimp: 30,
    raw_anchovies: 30,
    raw_sardine: 40,
    raw_herring: 50,
    raw_trout: 70,
    raw_pike: 80,
    raw_salmon: 90,
    raw_lobster: 120,
    raw_swordfish: 140,
    raw_monkfish: 150,
    raw_shark: 210,
  } as const,

  // === Level Requirements ===
  FIREMAKING_LEVELS: {
    logs: 1,
    oak_logs: 15,
    willow_logs: 30,
    teak_logs: 35,
    maple_logs: 45,
    mahogany_logs: 50,
    yew_logs: 60,
    magic_logs: 75,
    redwood_logs: 90,
  } as const,

  COOKING_LEVELS: {
    raw_shrimp: 1,
    raw_anchovies: 1,
    raw_sardine: 1,
    raw_herring: 5,
    raw_trout: 15,
    raw_pike: 20,
    raw_salmon: 25,
    raw_lobster: 40,
    raw_swordfish: 45,
    raw_monkfish: 62,
    raw_shark: 80,
  } as const,

  // === Cooked Item Mappings ===
  /**
   * Maps raw food ID to cooked food ID.
   */
  RAW_TO_COOKED: {
    raw_shrimp: "shrimp",
    raw_anchovies: "anchovies",
    raw_sardine: "sardine",
    raw_herring: "herring",
    raw_trout: "trout",
    raw_pike: "pike",
    raw_salmon: "salmon",
    raw_lobster: "lobster",
    raw_swordfish: "swordfish",
    raw_monkfish: "monkfish",
    raw_shark: "shark",
  } as const,

  /**
   * Maps raw food ID to burnt food ID.
   */
  RAW_TO_BURNT: {
    raw_shrimp: "burnt_shrimp",
    raw_anchovies: "burnt_anchovies",
    raw_sardine: "burnt_sardine",
    raw_herring: "burnt_herring",
    raw_trout: "burnt_trout",
    raw_pike: "burnt_pike",
    raw_salmon: "burnt_salmon",
    raw_lobster: "burnt_lobster",
    raw_swordfish: "burnt_swordfish",
    raw_monkfish: "burnt_monkfish",
    raw_shark: "burnt_shark",
  } as const,

  // === Timing ===
  // NOTE: All game logic uses TICKS, not milliseconds
  // RATE_LIMIT_MS is ONLY for anti-spam (uses Date.now())
  RATE_LIMIT_MS: 600, // Anti-spam cooldown (ms) - matches GatheringConstants pattern
  MINIMUM_CYCLE_TICKS: 2, // Min ticks between actions (game logic)

  // === Validation Sets ===
  VALID_LOG_IDS: new Set([
    "logs",
    "oak_logs",
    "willow_logs",
    "teak_logs",
    "maple_logs",
    "mahogany_logs",
    "yew_logs",
    "magic_logs",
    "redwood_logs",
  ]),

  VALID_RAW_FOOD_IDS: new Set([
    "raw_shrimp",
    "raw_anchovies",
    "raw_sardine",
    "raw_herring",
    "raw_trout",
    "raw_pike",
    "raw_salmon",
    "raw_lobster",
    "raw_swordfish",
    "raw_monkfish",
    "raw_shark",
  ]),
} as const;

// === Type Exports ===
export type LogId = keyof typeof PROCESSING_CONSTANTS.FIREMAKING_XP;
export type RawFoodId = keyof typeof PROCESSING_CONSTANTS.COOKING_XP;
export type CookedFoodId =
  (typeof PROCESSING_CONSTANTS.RAW_TO_COOKED)[RawFoodId];
export type BurntFoodId = (typeof PROCESSING_CONSTANTS.RAW_TO_BURNT)[RawFoodId];
export type CookingSourceType = "fire" | "range";
