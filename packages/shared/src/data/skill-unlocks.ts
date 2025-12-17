/**
 * Skill Unlocks Data - OSRS-style content unlocks per skill level
 *
 * Defines what content is unlocked at each level for display in
 * the level-up notification popup.
 *
 * Data sourced from OSRS Wiki level requirements.
 */

/** Type of unlock */
export type UnlockType = "item" | "ability" | "area" | "quest" | "activity";

/** A single skill unlock entry */
export interface SkillUnlock {
  level: number;
  description: string;
  type: UnlockType;
}

/**
 * Skill unlocks organized by skill name (lowercase)
 * Only includes notable unlocks, not every single item
 */
export const SKILL_UNLOCKS: Readonly<Record<string, readonly SkillUnlock[]>> = {
  // === COMBAT SKILLS ===
  attack: [
    { level: 1, description: "Bronze weapons", type: "item" },
    { level: 5, description: "Steel weapons", type: "item" },
    { level: 10, description: "Black weapons", type: "item" },
    { level: 20, description: "Mithril weapons", type: "item" },
    { level: 30, description: "Adamant weapons", type: "item" },
    { level: 40, description: "Rune weapons", type: "item" },
    { level: 50, description: "Granite maul", type: "item" },
    { level: 60, description: "Dragon weapons", type: "item" },
    { level: 70, description: "Abyssal whip", type: "item" },
    { level: 75, description: "Godswords", type: "item" },
  ],
  strength: [
    { level: 1, description: "Increased max hit", type: "ability" },
    { level: 10, description: "Black equipment bonuses", type: "item" },
    { level: 20, description: "Mithril equipment bonuses", type: "item" },
    { level: 30, description: "Adamant equipment bonuses", type: "item" },
    { level: 40, description: "Rune equipment bonuses", type: "item" },
    { level: 50, description: "Granite maul spec", type: "ability" },
    { level: 60, description: "Dragon equipment bonuses", type: "item" },
    { level: 70, description: "Obsidian equipment", type: "item" },
    { level: 99, description: "Strength cape", type: "item" },
  ],
  defence: [
    { level: 1, description: "Bronze armour", type: "item" },
    { level: 5, description: "Steel armour", type: "item" },
    { level: 10, description: "Black armour", type: "item" },
    { level: 20, description: "Mithril armour", type: "item" },
    { level: 30, description: "Adamant armour", type: "item" },
    { level: 40, description: "Rune armour", type: "item" },
    { level: 45, description: "Berserker helm", type: "item" },
    { level: 60, description: "Dragon armour", type: "item" },
    { level: 65, description: "Bandos armour", type: "item" },
    { level: 70, description: "Barrows armour", type: "item" },
  ],
  ranged: [
    { level: 1, description: "Shortbow", type: "item" },
    { level: 5, description: "Oak shortbow", type: "item" },
    { level: 20, description: "Studded leather", type: "item" },
    { level: 30, description: "Snakeskin armour", type: "item" },
    { level: 40, description: "Green d'hide", type: "item" },
    { level: 50, description: "Magic shortbow", type: "item" },
    { level: 60, description: "Red d'hide", type: "item" },
    { level: 70, description: "Black d'hide", type: "item" },
    { level: 75, description: "Armadyl armour", type: "item" },
  ],
  magic: [
    { level: 1, description: "Wind Strike", type: "ability" },
    { level: 5, description: "Water Strike", type: "ability" },
    { level: 9, description: "Earth Strike", type: "ability" },
    { level: 13, description: "Fire Strike", type: "ability" },
    { level: 17, description: "Wind Bolt", type: "ability" },
    { level: 25, description: "Varrock Teleport", type: "ability" },
    { level: 31, description: "Lumbridge Teleport", type: "ability" },
    { level: 37, description: "Falador Teleport", type: "ability" },
    { level: 45, description: "Camelot Teleport", type: "ability" },
    { level: 55, description: "High Level Alchemy", type: "ability" },
  ],
  prayer: [
    { level: 1, description: "Thick Skin", type: "ability" },
    { level: 4, description: "Burst of Strength", type: "ability" },
    { level: 7, description: "Clarity of Thought", type: "ability" },
    { level: 10, description: "Rock Skin", type: "ability" },
    { level: 13, description: "Superhuman Strength", type: "ability" },
    { level: 25, description: "Protect Item", type: "ability" },
    { level: 37, description: "Protect from Magic", type: "ability" },
    { level: 40, description: "Protect from Missiles", type: "ability" },
    { level: 43, description: "Protect from Melee", type: "ability" },
    { level: 70, description: "Piety", type: "ability" },
  ],
  constitution: [
    { level: 10, description: "100 HP", type: "ability" },
    { level: 20, description: "200 HP", type: "ability" },
    { level: 30, description: "300 HP", type: "ability" },
    { level: 40, description: "400 HP", type: "ability" },
    { level: 50, description: "500 HP", type: "ability" },
    { level: 60, description: "600 HP", type: "ability" },
    { level: 70, description: "700 HP", type: "ability" },
    { level: 80, description: "800 HP", type: "ability" },
    { level: 90, description: "900 HP", type: "ability" },
    { level: 99, description: "990 HP", type: "ability" },
  ],

  // === GATHERING SKILLS ===
  woodcutting: [
    { level: 1, description: "Normal trees", type: "item" },
    { level: 15, description: "Oak trees", type: "item" },
    { level: 30, description: "Willow trees", type: "item" },
    { level: 35, description: "Teak trees", type: "item" },
    { level: 45, description: "Maple trees", type: "item" },
    { level: 50, description: "Mahogany trees", type: "item" },
    { level: 60, description: "Yew trees", type: "item" },
    { level: 75, description: "Magic trees", type: "item" },
    { level: 90, description: "Redwood trees", type: "item" },
  ],
  mining: [
    { level: 1, description: "Copper & Tin ore", type: "item" },
    { level: 15, description: "Iron ore", type: "item" },
    { level: 20, description: "Silver ore", type: "item" },
    { level: 30, description: "Coal", type: "item" },
    { level: 40, description: "Gold ore", type: "item" },
    { level: 55, description: "Mithril ore", type: "item" },
    { level: 70, description: "Adamantite ore", type: "item" },
    { level: 85, description: "Runite ore", type: "item" },
  ],
  fishing: [
    { level: 1, description: "Shrimp", type: "item" },
    { level: 5, description: "Sardine", type: "item" },
    { level: 10, description: "Herring", type: "item" },
    { level: 20, description: "Trout", type: "item" },
    { level: 25, description: "Pike", type: "item" },
    { level: 30, description: "Salmon", type: "item" },
    { level: 35, description: "Tuna", type: "item" },
    { level: 40, description: "Lobster", type: "item" },
    { level: 50, description: "Swordfish", type: "item" },
    { level: 76, description: "Sharks", type: "item" },
  ],

  // === ARTISAN SKILLS ===
  cooking: [
    { level: 1, description: "Shrimp", type: "item" },
    { level: 15, description: "Trout", type: "item" },
    { level: 25, description: "Salmon", type: "item" },
    { level: 30, description: "Tuna", type: "item" },
    { level: 40, description: "Lobster", type: "item" },
    { level: 45, description: "Swordfish", type: "item" },
    { level: 80, description: "Sharks", type: "item" },
    { level: 91, description: "Anglerfish", type: "item" },
  ],
  smithing: [
    { level: 1, description: "Bronze equipment", type: "item" },
    { level: 15, description: "Iron equipment", type: "item" },
    { level: 30, description: "Steel equipment", type: "item" },
    { level: 50, description: "Mithril equipment", type: "item" },
    { level: 70, description: "Adamant equipment", type: "item" },
    { level: 85, description: "Rune equipment", type: "item" },
  ],
  firemaking: [
    { level: 1, description: "Normal logs", type: "item" },
    { level: 15, description: "Oak logs", type: "item" },
    { level: 30, description: "Willow logs", type: "item" },
    { level: 45, description: "Maple logs", type: "item" },
    { level: 60, description: "Yew logs", type: "item" },
    { level: 75, description: "Magic logs", type: "item" },
    { level: 90, description: "Redwood logs", type: "item" },
  ],

  // === SUPPORT SKILLS ===
  agility: [
    { level: 1, description: "Gnome Stronghold Course", type: "activity" },
    { level: 10, description: "Draynor Village Course", type: "activity" },
    { level: 20, description: "Al Kharid Course", type: "activity" },
    { level: 30, description: "Varrock Course", type: "activity" },
    { level: 40, description: "Canifis Course", type: "activity" },
    { level: 52, description: "Wilderness Course", type: "activity" },
    { level: 60, description: "Seers' Village Course", type: "activity" },
    { level: 70, description: "Pollnivneach Course", type: "activity" },
    { level: 80, description: "Rellekka Course", type: "activity" },
    { level: 90, description: "Ardougne Course", type: "activity" },
  ],
  thieving: [
    { level: 1, description: "Man/Woman pickpocket", type: "activity" },
    { level: 5, description: "Cake stalls", type: "activity" },
    { level: 25, description: "Fruit stalls", type: "activity" },
    { level: 32, description: "Rogues' Den", type: "area" },
    { level: 38, description: "Master Farmer", type: "activity" },
    { level: 55, description: "Ardougne knights", type: "activity" },
    { level: 65, description: "Menaphite thugs", type: "activity" },
    { level: 82, description: "TzHaar-Hur", type: "activity" },
  ],
  slayer: [
    { level: 1, description: "Crawling hands", type: "activity" },
    { level: 15, description: "Banshees", type: "activity" },
    { level: 45, description: "Bloodveld", type: "activity" },
    { level: 52, description: "Dust devils", type: "activity" },
    { level: 55, description: "Turoth", type: "activity" },
    { level: 58, description: "Cave horrors", type: "activity" },
    { level: 65, description: "Aberrant spectres", type: "activity" },
    { level: 72, description: "Wyverns", type: "activity" },
    { level: 75, description: "Gargoyles", type: "activity" },
    { level: 85, description: "Abyssal demons", type: "activity" },
    { level: 87, description: "Kraken", type: "activity" },
    { level: 91, description: "Cerberus", type: "activity" },
    { level: 93, description: "Thermonuclear smoke devil", type: "activity" },
    { level: 95, description: "Hydra", type: "activity" },
  ],
} as const;

/**
 * Get unlocks for a specific skill at a specific level
 *
 * @param skill - Skill name (case-insensitive)
 * @param level - The level to get unlocks for
 * @returns Array of unlocks at exactly this level (empty if none)
 */
export function getUnlocksAtLevel(skill: string, level: number): SkillUnlock[] {
  const skillKey = skill.toLowerCase();
  const unlocks = SKILL_UNLOCKS[skillKey];
  if (!unlocks) return [];
  return unlocks.filter((unlock) => unlock.level === level);
}

/**
 * Get all unlocks for a skill up to and including a level
 *
 * @param skill - Skill name (case-insensitive)
 * @param level - Maximum level to include
 * @returns Array of all unlocks up to this level
 */
export function getUnlocksUpToLevel(
  skill: string,
  level: number,
): SkillUnlock[] {
  const skillKey = skill.toLowerCase();
  const unlocks = SKILL_UNLOCKS[skillKey];
  if (!unlocks) return [];
  return unlocks.filter((unlock) => unlock.level <= level);
}
