/**
 * Town Generation Constants
 * Default values and configuration for town generation
 */

import type {
  TownGeneratorConfig,
  TownSizeConfig,
  TownSize,
  BuildingConfig,
  TownBuildingType,
} from "./types";

// ============================================================
// DEFAULT CONFIGURATION VALUES
// ============================================================

export const DEFAULT_TOWN_COUNT = 25;
export const DEFAULT_WORLD_SIZE = 10000;
export const DEFAULT_MIN_TOWN_SPACING = 800;
export const DEFAULT_FLATNESS_SAMPLE_RADIUS = 40;
export const DEFAULT_FLATNESS_SAMPLE_COUNT = 16;
export const DEFAULT_WATER_THRESHOLD = 5.4;
export const DEFAULT_OPTIMAL_WATER_DISTANCE_MIN = 30;
export const DEFAULT_OPTIMAL_WATER_DISTANCE_MAX = 150;

// ============================================================
// TOWN SIZE CONFIGURATIONS
// ============================================================

export const DEFAULT_TOWN_SIZES: Record<TownSize, TownSizeConfig> = {
  hamlet: {
    buildingCount: { min: 3, max: 5 },
    radius: 25,
    safeZoneRadius: 40,
  },
  village: {
    buildingCount: { min: 6, max: 10 },
    radius: 40,
    safeZoneRadius: 60,
  },
  town: {
    buildingCount: { min: 11, max: 16 },
    radius: 60,
    safeZoneRadius: 80,
  },
};

// ============================================================
// BIOME SUITABILITY SCORES
// ============================================================

export const DEFAULT_BIOME_SUITABILITY: Record<string, number> = {
  plains: 1.0,
  valley: 0.95,
  forest: 0.7,
  tundra: 0.4,
  desert: 0.3,
  swamp: 0.2,
  mountains: 0.15,
  lakes: 0.0,
};

// ============================================================
// BUILDING TYPE CONFIGURATIONS
// ============================================================

export const DEFAULT_BUILDING_CONFIGS: Record<
  TownBuildingType,
  BuildingConfig
> = {
  bank: { width: 8, depth: 6, priority: 1 },
  store: { width: 7, depth: 5, priority: 2 },
  anvil: { width: 5, depth: 4, priority: 3 },
  well: { width: 3, depth: 3, priority: 4 },
  house: { width: 6, depth: 5, priority: 5 },
  inn: { width: 10, depth: 12, priority: 2 },
  smithy: { width: 7, depth: 7, priority: 3 },
  "simple-house": { width: 6, depth: 6, priority: 6 },
  "long-house": { width: 5, depth: 12, priority: 6 },
};

// ============================================================
// NAME GENERATION
// ============================================================

export const NAME_PREFIXES = [
  "Oak",
  "River",
  "Stone",
  "Green",
  "High",
  "Low",
  "North",
  "South",
  "East",
  "West",
  "Iron",
  "Gold",
  "Silver",
  "Crystal",
  "Shadow",
  "Sun",
  "Moon",
  "Star",
  "Thunder",
  "Frost",
  "Fire",
  "Wind",
  "Storm",
  "Cloud",
  "Lake",
];

export const NAME_SUFFIXES = [
  "haven",
  "ford",
  "wick",
  "ton",
  "bridge",
  "vale",
  "hollow",
  "reach",
  "fall",
  "watch",
  "keep",
  "stead",
  "dale",
  "brook",
  "field",
  "grove",
  "hill",
  "cliff",
  "port",
  "gate",
  "marsh",
  "moor",
  "wood",
  "mere",
  "crest",
];

// ============================================================
// DEFAULT CONFIGURATION
// ============================================================

export function createDefaultConfig(): TownGeneratorConfig {
  return {
    townCount: DEFAULT_TOWN_COUNT,
    worldSize: DEFAULT_WORLD_SIZE,
    minTownSpacing: DEFAULT_MIN_TOWN_SPACING,
    flatnessSampleRadius: DEFAULT_FLATNESS_SAMPLE_RADIUS,
    flatnessSampleCount: DEFAULT_FLATNESS_SAMPLE_COUNT,
    waterThreshold: DEFAULT_WATER_THRESHOLD,
    optimalWaterDistanceMin: DEFAULT_OPTIMAL_WATER_DISTANCE_MIN,
    optimalWaterDistanceMax: DEFAULT_OPTIMAL_WATER_DISTANCE_MAX,
    townSizes: { ...DEFAULT_TOWN_SIZES },
    biomeSuitability: { ...DEFAULT_BIOME_SUITABILITY },
    buildingTypes: { ...DEFAULT_BUILDING_CONFIGS },
  };
}

// ============================================================
// GRID CONFIGURATION
// ============================================================

export const PLACEMENT_GRID_SIZE = 15;
export const BUILDING_PLACEMENT_BUFFER = 2;
export const MAX_BUILDING_PLACEMENT_ATTEMPTS = 50;
export const WATER_CHECK_DIRECTIONS = 8;
export const WATER_CHECK_MAX_DISTANCE = 300;
export const WATER_CHECK_STEP = 20;
