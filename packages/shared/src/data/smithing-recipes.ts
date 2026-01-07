/**
 * Smithing Recipes - OSRS-accurate smithing data
 *
 * Defines what items can be smithed from each bar type at an anvil.
 * Currently limited to: swords, hatchets, pickaxes (bronze through mithril)
 *
 * @see https://oldschool.runescape.wiki/w/Smithing
 */

/**
 * Smithing category types
 */
export type SmithingCategory = "sword" | "hatchet" | "pickaxe";

/**
 * Bar tier types (matches bar IDs without "_bar" suffix)
 */
export type BarTier = "bronze" | "iron" | "steel" | "mithril";

/**
 * A single smithing recipe definition
 */
export interface SmithingRecipe {
  /** Output item ID */
  itemId: string;
  /** Display name for the item */
  name: string;
  /** Bar type required (e.g., "bronze_bar") */
  barType: string;
  /** Number of bars needed */
  barsRequired: number;
  /** Smithing level required */
  levelRequired: number;
  /** XP granted per item made */
  xp: number;
  /** Category for UI grouping */
  category: SmithingCategory;
}

/**
 * Base smithing levels for each bar tier
 */
export const BAR_TIER_BASE_LEVELS: Record<BarTier, number> = {
  bronze: 1,
  iron: 15,
  steel: 30,
  mithril: 50,
};

/**
 * Level offsets from base level for each category
 */
export const CATEGORY_LEVEL_OFFSETS: Record<SmithingCategory, number> = {
  hatchet: 1,
  pickaxe: 4,
  sword: 4,
};

/**
 * Bars required for each category
 */
export const CATEGORY_BARS_REQUIRED: Record<SmithingCategory, number> = {
  sword: 1,
  hatchet: 1,
  pickaxe: 2,
};

/**
 * XP per bar used (OSRS: 12.5 XP per bar for all smithing)
 */
export const XP_PER_BAR = 12.5;

/**
 * Generate a recipe for a specific bar tier and category
 */
function generateRecipe(
  tier: BarTier,
  category: SmithingCategory,
): SmithingRecipe {
  const baseLevel = BAR_TIER_BASE_LEVELS[tier];
  const levelOffset = CATEGORY_LEVEL_OFFSETS[category];
  const barsRequired = CATEGORY_BARS_REQUIRED[category];

  // Build item ID (e.g., "bronze_sword", "steel_pickaxe")
  const itemId = `${tier}_${category}`;

  // Build display name (e.g., "Bronze Sword", "Steel Pickaxe")
  const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
  const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
  const name = `${tierName} ${categoryName}`;

  return {
    itemId,
    name,
    barType: `${tier}_bar`,
    barsRequired,
    levelRequired: baseLevel + levelOffset,
    xp: barsRequired * XP_PER_BAR,
    category,
  };
}

/**
 * Categories available for smithing
 */
const SMITHING_CATEGORIES: SmithingCategory[] = ["sword", "hatchet", "pickaxe"];

/**
 * Bar tiers available for smithing
 */
const BAR_TIERS: BarTier[] = ["bronze", "iron", "steel", "mithril"];

/**
 * Generate all smithing recipes
 */
function generateAllRecipes(): SmithingRecipe[] {
  const recipes: SmithingRecipe[] = [];

  for (const tier of BAR_TIERS) {
    for (const category of SMITHING_CATEGORIES) {
      recipes.push(generateRecipe(tier, category));
    }
  }

  return recipes;
}

/**
 * All smithing recipes (generated at module load)
 */
export const SMITHING_RECIPES: readonly SmithingRecipe[] = generateAllRecipes();

/**
 * Get recipes for a specific bar type
 */
export function getRecipesForBar(barType: string): SmithingRecipe[] {
  return SMITHING_RECIPES.filter((recipe) => recipe.barType === barType);
}

/**
 * Get a specific recipe by item ID
 */
export function getRecipeByItemId(itemId: string): SmithingRecipe | undefined {
  return SMITHING_RECIPES.find((recipe) => recipe.itemId === itemId);
}

/**
 * Get all recipes the player can make with their smithing level
 */
export function getAvailableRecipes(smithingLevel: number): SmithingRecipe[] {
  return SMITHING_RECIPES.filter(
    (recipe) => recipe.levelRequired <= smithingLevel,
  );
}

/**
 * Get recipes grouped by category for UI display
 */
export function getRecipesByCategory(
  barType: string,
): Map<SmithingCategory, SmithingRecipe[]> {
  const recipes = getRecipesForBar(barType);
  const grouped = new Map<SmithingCategory, SmithingRecipe[]>();

  for (const recipe of recipes) {
    const existing = grouped.get(recipe.category) || [];
    existing.push(recipe);
    grouped.set(recipe.category, existing);
  }

  return grouped;
}
