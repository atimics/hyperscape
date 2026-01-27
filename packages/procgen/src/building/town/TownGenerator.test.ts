/**
 * TownGenerator Tests
 *
 * Comprehensive tests for procedural town generation including
 * terrain integration, building placement, and town features.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TownGenerator } from "./TownGenerator";
import { createTerrainProviderFromGenerator } from "./types";
import type { TerrainProvider, TownGenerationOptions } from "./types";

// Create a mock terrain generator that implements the interface needed
const createMockTerrainGenerator = (seed: number = 12345) => ({
  getHeightAt: (x: number, z: number): number => {
    // Simple deterministic height function
    const hash = Math.sin(x * 0.01 + seed) * Math.cos(z * 0.01 + seed);
    return 10 + hash * 5; // Heights between 5 and 15
  },
  queryPoint: (x: number, z: number) => {
    // Deterministic biome assignment based on position
    const biomeVal = Math.sin(x * 0.005 + z * 0.007 + seed) * 0.5 + 0.5;
    if (biomeVal > 0.7) return { biome: "plains" };
    if (biomeVal > 0.4) return { biome: "forest" };
    return { biome: "valley" };
  },
  getWaterThreshold: () => 5.4,
  isUnderwater: (x: number, z: number) => {
    const height =
      10 + Math.sin(x * 0.01 + seed) * Math.cos(z * 0.01 + seed) * 5;
    return height < 5.4;
  },
});

describe("TownGenerator", () => {
  let generator: TownGenerator;

  beforeEach(() => {
    generator = new TownGenerator({ seed: 12345 });
  });

  describe("initialization", () => {
    it("should create generator with default options", () => {
      const gen = new TownGenerator();
      const config = gen.getConfig();
      expect(config.townCount).toBe(25);
      expect(config.worldSize).toBe(10000);
    });

    it("should create generator with custom seed", () => {
      const gen = new TownGenerator({ seed: 54321 });
      expect(gen).toBeDefined();
    });

    it("should create generator with custom config", () => {
      const gen = new TownGenerator({
        seed: 12345,
        config: {
          townCount: 10,
          minTownSpacing: 500,
        },
      });
      const config = gen.getConfig();
      expect(config.townCount).toBe(10);
      expect(config.minTownSpacing).toBe(500);
    });
  });

  describe("fromTerrainGenerator factory", () => {
    it("should create TownGenerator from mock terrain generator", () => {
      const mockTerrain = createMockTerrainGenerator(12345);
      const townGen = TownGenerator.fromTerrainGenerator(mockTerrain, {
        seed: 12345,
      });
      expect(townGen).toBeInstanceOf(TownGenerator);
    });

    it("should use terrain height provider from generator", () => {
      const mockTerrain = createMockTerrainGenerator(12345);
      const townGen = TownGenerator.fromTerrainGenerator(mockTerrain, {
        seed: 12345,
        config: { townCount: 3 },
      });
      const result = townGen.generate();
      expect(result.towns.length).toBeGreaterThan(0);
      // All towns should have height > 0
      for (const town of result.towns) {
        expect(town.position.y).toBeGreaterThan(0);
      }
    });
  });

  describe("createTerrainProviderFromGenerator helper", () => {
    it("should create valid TerrainProvider from mock", () => {
      const mockTerrain = createMockTerrainGenerator(12345);
      const provider = createTerrainProviderFromGenerator(mockTerrain);

      expect(provider.getHeightAt(0, 0)).toBeTypeOf("number");
      expect(provider.getBiomeAt?.(0, 0)).toBeTypeOf("string");
      expect(provider.getWaterThreshold?.()).toBe(5.4);
    });

    it("should use queryPoint for biome when available", () => {
      const mockTerrain = createMockTerrainGenerator(12345);
      const provider = createTerrainProviderFromGenerator(mockTerrain);

      const biome = provider.getBiomeAt?.(0, 0);
      expect(["plains", "forest", "valley"]).toContain(biome);
    });
  });

  describe("town generation", () => {
    it("should generate deterministic towns", () => {
      const gen1 = new TownGenerator({ seed: 12345 });
      const gen2 = new TownGenerator({ seed: 12345 });

      const result1 = gen1.generate();
      const result2 = gen2.generate();

      expect(result1.towns.length).toBe(result2.towns.length);
      for (let i = 0; i < result1.towns.length; i++) {
        expect(result1.towns[i].position.x).toBe(result2.towns[i].position.x);
        expect(result1.towns[i].position.z).toBe(result2.towns[i].position.z);
        expect(result1.towns[i].name).toBe(result2.towns[i].name);
      }
    });

    it("should produce different towns with different seeds", () => {
      const gen1 = new TownGenerator({ seed: 111 });
      const gen2 = new TownGenerator({ seed: 222 });

      const result1 = gen1.generate();
      const result2 = gen2.generate();

      // Towns should be at different positions
      const positions1 = result1.towns.map(
        (t) => `${t.position.x},${t.position.z}`,
      );
      const positions2 = result2.towns.map(
        (t) => `${t.position.x},${t.position.z}`,
      );

      // At least one position should be different
      const commonPositions = positions1.filter((p) => positions2.includes(p));
      expect(commonPositions.length).toBeLessThan(positions1.length);
    });

    it("should respect minTownSpacing", () => {
      const gen = new TownGenerator({
        seed: 12345,
        config: { minTownSpacing: 1000 },
      });

      const result = gen.generate();

      // Check all pairs of towns for spacing
      for (let i = 0; i < result.towns.length; i++) {
        for (let j = i + 1; j < result.towns.length; j++) {
          const t1 = result.towns[i];
          const t2 = result.towns[j];
          const dist = Math.sqrt(
            (t2.position.x - t1.position.x) ** 2 +
              (t2.position.z - t1.position.z) ** 2,
          );
          expect(dist).toBeGreaterThanOrEqual(1000);
        }
      }
    });

    it("should generate towns with valid sizes", () => {
      const result = generator.generate();

      for (const town of result.towns) {
        expect(["hamlet", "village", "town"]).toContain(town.size);
        expect(town.safeZoneRadius).toBeGreaterThan(0);
      }
    });
  });

  describe("town features", () => {
    let town: ReturnType<typeof generator.generate>["towns"][0];
    let result: ReturnType<typeof generator.generate>;

    beforeEach(() => {
      result = generator.generate();
      town = result.towns[0];
    });

    it("should generate buildings for some towns", () => {
      // With flat terrain provider, building placement may be limited
      // At minimum, there should be at least some buildings generated overall
      const totalBuildings = result.towns.reduce(
        (sum, t) => sum + t.buildings.length,
        0,
      );
      expect(totalBuildings).toBeGreaterThan(0);
    });

    it("should generate essential building types", () => {
      const result = generator.generate();

      // At least some towns should have essential buildings
      const allBuildingTypes = new Set(
        result.towns.flatMap((t) => t.buildings.map((b) => b.type)),
      );
      expect(allBuildingTypes.has("bank")).toBe(true);
      expect(allBuildingTypes.has("store")).toBe(true);
    });

    it("should generate town layout with internal roads", () => {
      expect(town.internalRoads).toBeDefined();
      expect(town.internalRoads!.length).toBeGreaterThan(0);
    });

    it("should generate entry points for towns", () => {
      expect(town.entryPoints).toBeDefined();
      expect(town.entryPoints!.length).toBeGreaterThan(0);
    });

    it("should generate paths from roads to buildings", () => {
      expect(town.paths).toBeDefined();
      // Some towns should have paths
      const result = generator.generate();
      const townsWithPaths = result.towns.filter(
        (t) => t.paths && t.paths.length > 0,
      );
      expect(townsWithPaths.length).toBeGreaterThan(0);
    });

    it("should generate landmarks for villages and towns", () => {
      const result = generator.generate();
      const villagesAndTowns = result.towns.filter(
        (t) => t.size === "village" || t.size === "town",
      );

      // Villages and towns should have landmarks
      for (const t of villagesAndTowns) {
        expect(t.landmarks).toBeDefined();
        expect(t.landmarks!.length).toBeGreaterThan(0);
      }
    });

    it("should generate plazas for villages and towns", () => {
      const result = generator.generate();
      const villagesAndTowns = result.towns.filter(
        (t) => t.size === "village" || t.size === "town",
      );

      // Villages and towns should have plazas
      for (const t of villagesAndTowns) {
        expect(t.plaza).toBeDefined();
        expect(t.plaza!.radius).toBeGreaterThan(0);
      }
    });
  });

  describe("generateSingleTown", () => {
    it("should generate a single town at specified location", () => {
      const town = generator.generateSingleTown(500, 500, "village");

      expect(town.position.x).toBe(500);
      expect(town.position.z).toBe(500);
      expect(town.size).toBe("village");
    });

    it("should accept custom name and id", () => {
      const town = generator.generateSingleTown(100, 200, "town", {
        id: "custom-town-123",
        name: "Test Town",
      });

      expect(town.id).toBe("custom-town-123");
      expect(town.name).toBe("Test Town");
    });

    it("should generate complete town features", () => {
      const town = generator.generateSingleTown(0, 0, "town");

      expect(town.buildings.length).toBeGreaterThan(0);
      expect(town.internalRoads).toBeDefined();
      expect(town.entryPoints).toBeDefined();
      expect(town.plaza).toBeDefined();
      expect(town.landmarks).toBeDefined();
    });
  });

  describe("statistics", () => {
    it("should return generation statistics", () => {
      const result = generator.generate();

      expect(result.stats).toBeDefined();
      expect(result.stats.totalTowns).toBe(result.towns.length);
      expect(result.stats.candidatesEvaluated).toBeGreaterThan(0);
      expect(result.stats.generationTime).toBeGreaterThan(0);
    });

    it("should count town sizes correctly", () => {
      const result = generator.generate();

      const hamlets = result.towns.filter((t) => t.size === "hamlet").length;
      const villages = result.towns.filter((t) => t.size === "village").length;
      const towns = result.towns.filter((t) => t.size === "town").length;

      expect(result.stats.hamlets).toBe(hamlets);
      expect(result.stats.villages).toBe(villages);
      expect(result.stats.towns).toBe(towns);
    });

    it("should count buildings correctly", () => {
      const result = generator.generate();

      const totalBuildings = result.towns.reduce(
        (sum, t) => sum + t.buildings.length,
        0,
      );
      expect(result.stats.totalBuildings).toBe(totalBuildings);
    });
  });

  describe("configuration updates", () => {
    it("should update terrain provider", () => {
      const mockTerrain: TerrainProvider = {
        getHeightAt: () => 15,
        getBiomeAt: () => "desert",
      };

      generator.setTerrain(mockTerrain);
      const town = generator.generateSingleTown(0, 0, "hamlet");

      expect(town.position.y).toBe(15);
      expect(town.biome).toBe("desert");
    });

    it("should update seed", () => {
      generator.setSeed(99999);
      const result1 = generator.generate();

      generator.setSeed(99999);
      const result2 = generator.generate();

      // Same seed should produce same results
      expect(result1.towns.length).toBe(result2.towns.length);
    });
  });

  describe("avoiding existing towns", () => {
    it("should avoid existing towns when generating", () => {
      const gen = new TownGenerator({
        seed: 12345,
        config: { townCount: 5, minTownSpacing: 500 },
      });

      // Generate first batch
      const result1 = gen.generate();

      // Generate second batch avoiding first batch
      const result2 = gen.generate(result1.towns);

      // Second batch should not overlap with first
      for (const newTown of result2.towns) {
        for (const existingTown of result1.towns) {
          const dist = Math.sqrt(
            (newTown.position.x - existingTown.position.x) ** 2 +
              (newTown.position.z - existingTown.position.z) ** 2,
          );
          expect(dist).toBeGreaterThanOrEqual(500);
        }
      }
    });
  });
});
