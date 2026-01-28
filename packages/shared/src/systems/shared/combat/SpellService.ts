/**
 * SpellService - Manages spell data and validation
 *
 * F2P Scope: Combat spells only (Strike and Bolt tiers)
 *
 * Responsibilities:
 * - Load and provide spell data from manifest
 * - Validate player can cast a spell (level check)
 * - Get available spells for a magic level
 */

import type { RuneRequirement } from "./RuneService";

/**
 * Spell definition from combat-spells.json manifest
 */
export interface Spell {
  id: string;
  name: string;
  level: number;
  baseMaxHit: number;
  baseXp: number;
  element: string;
  attackSpeed: number;
  runes: RuneRequirement[];
}

/**
 * Result of spell validation
 */
export interface SpellValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: "SPELL_NOT_FOUND" | "LEVEL_TOO_LOW" | "NO_SPELL_SELECTED";
}

/**
 * Combat spells data (from combat-spells.json manifest)
 * Embedded here for now - could be loaded from manifest at runtime
 */
const COMBAT_SPELLS: Record<string, Spell> = {
  // Strike tier
  wind_strike: {
    id: "wind_strike",
    name: "Wind Strike",
    level: 1,
    baseMaxHit: 2,
    baseXp: 5.5,
    element: "air",
    attackSpeed: 5,
    runes: [
      { runeId: "air_rune", quantity: 1 },
      { runeId: "mind_rune", quantity: 1 },
    ],
  },
  water_strike: {
    id: "water_strike",
    name: "Water Strike",
    level: 5,
    baseMaxHit: 4,
    baseXp: 7.5,
    element: "water",
    attackSpeed: 5,
    runes: [
      { runeId: "air_rune", quantity: 1 },
      { runeId: "water_rune", quantity: 1 },
      { runeId: "mind_rune", quantity: 1 },
    ],
  },
  earth_strike: {
    id: "earth_strike",
    name: "Earth Strike",
    level: 9,
    baseMaxHit: 6,
    baseXp: 9.5,
    element: "earth",
    attackSpeed: 5,
    runes: [
      { runeId: "air_rune", quantity: 1 },
      { runeId: "earth_rune", quantity: 2 },
      { runeId: "mind_rune", quantity: 1 },
    ],
  },
  fire_strike: {
    id: "fire_strike",
    name: "Fire Strike",
    level: 13,
    baseMaxHit: 8,
    baseXp: 11.5,
    element: "fire",
    attackSpeed: 5,
    runes: [
      { runeId: "air_rune", quantity: 2 },
      { runeId: "fire_rune", quantity: 3 },
      { runeId: "mind_rune", quantity: 1 },
    ],
  },

  // Bolt tier
  wind_bolt: {
    id: "wind_bolt",
    name: "Wind Bolt",
    level: 17,
    baseMaxHit: 9,
    baseXp: 13.5,
    element: "air",
    attackSpeed: 5,
    runes: [
      { runeId: "air_rune", quantity: 2 },
      { runeId: "chaos_rune", quantity: 1 },
    ],
  },
  water_bolt: {
    id: "water_bolt",
    name: "Water Bolt",
    level: 23,
    baseMaxHit: 10,
    baseXp: 16.5,
    element: "water",
    attackSpeed: 5,
    runes: [
      { runeId: "air_rune", quantity: 2 },
      { runeId: "water_rune", quantity: 2 },
      { runeId: "chaos_rune", quantity: 1 },
    ],
  },
  earth_bolt: {
    id: "earth_bolt",
    name: "Earth Bolt",
    level: 29,
    baseMaxHit: 11,
    baseXp: 19.5,
    element: "earth",
    attackSpeed: 5,
    runes: [
      { runeId: "air_rune", quantity: 2 },
      { runeId: "earth_rune", quantity: 3 },
      { runeId: "chaos_rune", quantity: 1 },
    ],
  },
  fire_bolt: {
    id: "fire_bolt",
    name: "Fire Bolt",
    level: 35,
    baseMaxHit: 12,
    baseXp: 22.5,
    element: "fire",
    attackSpeed: 5,
    runes: [
      { runeId: "air_rune", quantity: 3 },
      { runeId: "fire_rune", quantity: 4 },
      { runeId: "chaos_rune", quantity: 1 },
    ],
  },
};

/**
 * All spell IDs in order of level
 */
const SPELL_ORDER = [
  "wind_strike",
  "water_strike",
  "earth_strike",
  "fire_strike",
  "wind_bolt",
  "water_bolt",
  "earth_bolt",
  "fire_bolt",
];

/**
 * SpellService class for managing spell data
 */
export class SpellService {
  /**
   * Get a spell by ID
   *
   * @param spellId - The spell ID
   * @returns Spell data or undefined if not found
   */
  getSpell(spellId: string): Spell | undefined {
    return COMBAT_SPELLS[spellId];
  }

  /**
   * Get all available spells for a given magic level
   *
   * @param magicLevel - Player's magic level
   * @returns Array of available spells, sorted by level
   */
  getAvailableSpells(magicLevel: number): Spell[] {
    return SPELL_ORDER.filter(
      (id) => COMBAT_SPELLS[id].level <= magicLevel,
    ).map((id) => COMBAT_SPELLS[id]);
  }

  /**
   * Get all spells (for UI display)
   *
   * @returns All combat spells sorted by level
   */
  getAllSpells(): Spell[] {
    return SPELL_ORDER.map((id) => COMBAT_SPELLS[id]);
  }

  /**
   * Validate if a player can cast a spell (level check only)
   *
   * @param spellId - The spell ID to validate
   * @param magicLevel - Player's magic level
   * @returns Validation result
   */
  canCastSpell(
    spellId: string | null | undefined,
    magicLevel: number,
  ): SpellValidationResult {
    if (!spellId) {
      return {
        valid: false,
        error: "No spell selected",
        errorCode: "NO_SPELL_SELECTED",
      };
    }

    const spell = COMBAT_SPELLS[spellId];

    if (!spell) {
      return {
        valid: false,
        error: "Unknown spell",
        errorCode: "SPELL_NOT_FOUND",
      };
    }

    if (magicLevel < spell.level) {
      return {
        valid: false,
        error: `You need level ${spell.level} Magic to cast ${spell.name}`,
        errorCode: "LEVEL_TOO_LOW",
      };
    }

    return { valid: true };
  }

  /**
   * Check if a spell ID is valid
   */
  isValidSpell(spellId: string): boolean {
    return spellId in COMBAT_SPELLS;
  }

  /**
   * Get the highest level spell available for a magic level
   */
  getHighestAvailableSpell(magicLevel: number): Spell | undefined {
    const available = this.getAvailableSpells(magicLevel);
    return available[available.length - 1];
  }

  /**
   * Get spells by element
   */
  getSpellsByElement(element: string): Spell[] {
    return SPELL_ORDER.filter(
      (id) => COMBAT_SPELLS[id].element === element,
    ).map((id) => COMBAT_SPELLS[id]);
  }

  /**
   * Get spell tier (strike, bolt)
   */
  getSpellTier(spellId: string): "strike" | "bolt" | null {
    const spell = COMBAT_SPELLS[spellId];
    if (!spell) return null;

    if (spellId.endsWith("_strike")) return "strike";
    if (spellId.endsWith("_bolt")) return "bolt";
    return null;
  }
}

// Export singleton instance
export const spellService = new SpellService();
