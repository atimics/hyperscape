/**
 * ResourceSystem Unit Tests
 *
 * Tests for resource gathering system functionality:
 * - Drop rolling with probability distribution
 * - Resource ID validation (security)
 * - Tool category extraction
 * - Success rate calculation (OSRS-style)
 * - Cycle time calculation
 *
 * Note: Tests access private methods via bracket notation for unit testing.
 * This is acceptable for testing internals that have complex logic.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ResourceSystem } from "../ResourceSystem";
import type { ResourceDrop } from "../../../../types/core/core";

// Mock world object for testing
const createMockWorld = () => ({
  isServer: true,
  currentTick: 0,
  entities: new Map(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  getPlayer: vi.fn(),
  getSystem: vi.fn(),
  $eventBus: {
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    subscribeOnce: vi.fn(() => ({ unsubscribe: vi.fn() })),
    emitEvent: vi.fn(),
    request: vi.fn(),
    respond: vi.fn(),
  },
});

describe("ResourceSystem", () => {
  let system: ResourceSystem;
  let mockWorld: ReturnType<typeof createMockWorld>;

  beforeEach(() => {
    mockWorld = createMockWorld();
    system = new ResourceSystem(mockWorld as never);
  });

  // ===== DROP ROLLING TESTS =====
  describe("rollDrop", () => {
    // Access private method for testing
    const rollDrop = (sys: ResourceSystem, drops: ResourceDrop[]) =>
      (
        sys as unknown as { rollDrop: (drops: ResourceDrop[]) => ResourceDrop }
      ).rollDrop(drops);

    it("should return single drop when only one exists", () => {
      const drops: ResourceDrop[] = [
        {
          itemId: "logs",
          itemName: "Logs",
          quantity: 1,
          chance: 1.0,
          xpAmount: 25,
          stackable: true,
        },
      ];
      const result = rollDrop(system, drops);
      expect(result.itemId).toBe("logs");
    });

    it("should respect chance distribution for multiple drops", () => {
      const drops: ResourceDrop[] = [
        {
          itemId: "shrimp",
          itemName: "Raw Shrimp",
          quantity: 1,
          chance: 0.7,
          xpAmount: 10,
          stackable: false,
        },
        {
          itemId: "anchovies",
          itemName: "Raw Anchovies",
          quantity: 1,
          chance: 0.3,
          xpAmount: 15,
          stackable: false,
        },
      ];

      const results: Record<string, number> = { shrimp: 0, anchovies: 0 };
      for (let i = 0; i < 1000; i++) {
        const drop = rollDrop(system, drops);
        results[drop.itemId]++;
      }

      // Should be roughly 70/30 split (allow 15% variance for randomness)
      expect(results.shrimp).toBeGreaterThan(550);
      expect(results.shrimp).toBeLessThan(850);
      expect(results.anchovies).toBeGreaterThan(150);
      expect(results.anchovies).toBeLessThan(450);
    });

    it("should throw for empty drops array", () => {
      expect(() => rollDrop(system, [])).toThrow();
    });

    it("should return first drop if chances don't sum to 1.0", () => {
      const drops: ResourceDrop[] = [
        {
          itemId: "item1",
          itemName: "Item 1",
          quantity: 1,
          chance: 0.1,
          xpAmount: 10,
          stackable: false,
        },
        {
          itemId: "item2",
          itemName: "Item 2",
          quantity: 1,
          chance: 0.1,
          xpAmount: 10,
          stackable: false,
        },
      ];
      // With only 0.2 total chance, ~80% of rolls should fall through to fallback
      let fallbackCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = rollDrop(system, drops);
        if (result.itemId === "item1") fallbackCount++;
      }
      // First item should be returned more often due to fallback
      expect(fallbackCount).toBeGreaterThan(50);
    });
  });

  // ===== RESOURCE ID VALIDATION TESTS =====
  describe("isValidResourceId", () => {
    const isValidResourceId = (sys: ResourceSystem, id: string) =>
      (
        sys as unknown as { isValidResourceId: (id: string) => boolean }
      ).isValidResourceId(id);

    it("should accept valid alphanumeric resource IDs", () => {
      expect(isValidResourceId(system, "tree_normal")).toBe(true);
      expect(isValidResourceId(system, "ore_copper")).toBe(true);
      expect(isValidResourceId(system, "fishing_spot_1")).toBe(true);
      expect(isValidResourceId(system, "resource-123")).toBe(true);
      expect(isValidResourceId(system, "node.tree.oak")).toBe(true);
    });

    it("should reject empty or null resource IDs", () => {
      expect(isValidResourceId(system, "")).toBe(false);
      expect(isValidResourceId(system, null as unknown as string)).toBe(false);
      expect(isValidResourceId(system, undefined as unknown as string)).toBe(
        false,
      );
    });

    it("should reject resource IDs that are too long", () => {
      const longId = "a".repeat(101);
      expect(isValidResourceId(system, longId)).toBe(false);
      // 100 chars should be fine
      const maxLengthId = "a".repeat(100);
      expect(isValidResourceId(system, maxLengthId)).toBe(true);
    });

    it("should reject resource IDs with special characters", () => {
      expect(isValidResourceId(system, "tree<script>")).toBe(false);
      expect(isValidResourceId(system, "ore;DROP TABLE")).toBe(false);
      expect(isValidResourceId(system, "resource\n\ninjection")).toBe(false);
      expect(isValidResourceId(system, "tree/../../../etc")).toBe(false);
      expect(isValidResourceId(system, "node with spaces")).toBe(false);
    });
  });

  // ===== TOOL CATEGORY TESTS =====
  describe("getToolCategory", () => {
    const getToolCategory = (sys: ResourceSystem, toolRequired: string) =>
      (
        sys as unknown as { getToolCategory: (t: string) => string }
      ).getToolCategory(toolRequired);

    it("should extract hatchet category from various axe names", () => {
      expect(getToolCategory(system, "bronze_hatchet")).toBe("hatchet");
      expect(getToolCategory(system, "dragon_axe")).toBe("hatchet");
      expect(getToolCategory(system, "rune_hatchet")).toBe("hatchet");
    });

    it("should extract pickaxe category from various pickaxe names", () => {
      expect(getToolCategory(system, "bronze_pickaxe")).toBe("pickaxe");
      expect(getToolCategory(system, "dragon_pick")).toBe("pickaxe");
      expect(getToolCategory(system, "rune_pickaxe")).toBe("pickaxe");
    });

    it("should extract fishing category from fishing equipment", () => {
      expect(getToolCategory(system, "fishing_rod")).toBe("fishing");
      expect(getToolCategory(system, "small_fishing_net")).toBe("fishing");
      expect(getToolCategory(system, "harpoon")).toBe("fishing");
    });

    it("should fallback to last segment for unknown tools", () => {
      expect(getToolCategory(system, "bronze_hammer")).toBe("hammer");
      expect(getToolCategory(system, "magic_wand")).toBe("wand");
    });
  });

  // ===== TOOL DISPLAY NAME TESTS =====
  describe("getToolDisplayName", () => {
    const getToolDisplayName = (sys: ResourceSystem, category: string) =>
      (
        sys as unknown as { getToolDisplayName: (c: string) => string }
      ).getToolDisplayName(category);

    it("should return friendly names for known categories", () => {
      expect(getToolDisplayName(system, "hatchet")).toBe("hatchet");
      expect(getToolDisplayName(system, "pickaxe")).toBe("pickaxe");
      expect(getToolDisplayName(system, "fishing")).toBe("fishing equipment");
    });

    it("should return category name for unknown categories", () => {
      expect(getToolDisplayName(system, "hammer")).toBe("hammer");
      expect(getToolDisplayName(system, "chisel")).toBe("chisel");
    });
  });

  // ===== SUCCESS RATE CALCULATION TESTS =====
  describe("computeSuccessRate", () => {
    const computeSuccessRate = (
      sys: ResourceSystem,
      skillLevel: number,
      tuned: { levelRequired: number },
    ) =>
      (
        sys as unknown as {
          computeSuccessRate: (
            s: number,
            t: { levelRequired: number },
          ) => number;
        }
      ).computeSuccessRate(skillLevel, tuned);

    it("should return base rate at requirement level", () => {
      const rate = computeSuccessRate(system, 1, { levelRequired: 1 });
      expect(rate).toBeCloseTo(0.35, 2);
    });

    it("should increase rate above requirement", () => {
      const rate = computeSuccessRate(system, 50, { levelRequired: 1 });
      expect(rate).toBeGreaterThan(0.35);
    });

    it("should cap at maximum rate (0.85)", () => {
      const rate = computeSuccessRate(system, 99, { levelRequired: 1 });
      expect(rate).toBeLessThanOrEqual(0.85);
    });

    it("should not go below minimum rate (0.25)", () => {
      const rate = computeSuccessRate(system, 1, { levelRequired: 99 });
      expect(rate).toBeGreaterThanOrEqual(0.25);
    });

    it("should increase by 1% per level above requirement", () => {
      const baseRate = computeSuccessRate(system, 1, { levelRequired: 1 });
      const rate10Above = computeSuccessRate(system, 11, { levelRequired: 1 });
      // Should be ~10% higher
      expect(rate10Above - baseRate).toBeCloseTo(0.1, 1);
    });
  });

  // ===== CYCLE TIME CALCULATION TESTS =====
  describe("computeCycleTicks", () => {
    const computeCycleTicks = (
      sys: ResourceSystem,
      skillLevel: number,
      tuned: { baseCycleTicks: number; levelRequired: number },
      toolMultiplier: number,
    ) =>
      (
        sys as unknown as {
          computeCycleTicks: (
            s: number,
            t: { baseCycleTicks: number; levelRequired: number },
            m: number,
          ) => number;
        }
      ).computeCycleTicks(skillLevel, tuned, toolMultiplier);

    it("should return base ticks with no bonuses", () => {
      const ticks = computeCycleTicks(
        system,
        1,
        { baseCycleTicks: 4, levelRequired: 1 },
        1.0,
      );
      expect(ticks).toBe(4);
    });

    it("should reduce ticks with better tool multiplier", () => {
      const baseTicks = computeCycleTicks(
        system,
        1,
        { baseCycleTicks: 4, levelRequired: 1 },
        1.0,
      );
      const dragonTicks = computeCycleTicks(
        system,
        1,
        { baseCycleTicks: 4, levelRequired: 1 },
        0.7,
      );
      expect(dragonTicks).toBeLessThan(baseTicks);
    });

    it("should never go below 1 tick", () => {
      const ticks = computeCycleTicks(
        system,
        99,
        { baseCycleTicks: 1, levelRequired: 1 },
        0.5,
      );
      expect(ticks).toBeGreaterThanOrEqual(1);
    });
  });

  // ===== TOOL TIER TESTS =====
  describe("TOOL_TIERS", () => {
    it("should have woodcutting tiers in descending order of power", () => {
      const tiers = (
        ResourceSystem as unknown as {
          TOOL_TIERS: Record<string, Array<{ cycleMultiplier: number }>>;
        }
      ).TOOL_TIERS.woodcutting;

      // Dragon should be first (best)
      expect(tiers[0].cycleMultiplier).toBe(0.7);
      // Bronze should be last (worst)
      expect(tiers[tiers.length - 1].cycleMultiplier).toBe(1.0);

      // Verify descending order
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].cycleMultiplier).toBeGreaterThanOrEqual(
          tiers[i - 1].cycleMultiplier,
        );
      }
    });

    it("should have mining tiers matching woodcutting structure", () => {
      const miningTiers = (
        ResourceSystem as unknown as {
          TOOL_TIERS: Record<string, Array<{ cycleMultiplier: number }>>;
        }
      ).TOOL_TIERS.mining;
      const woodcuttingTiers = (
        ResourceSystem as unknown as {
          TOOL_TIERS: Record<string, Array<{ cycleMultiplier: number }>>;
        }
      ).TOOL_TIERS.woodcutting;

      expect(miningTiers.length).toBe(woodcuttingTiers.length);
      // Same multipliers
      for (let i = 0; i < miningTiers.length; i++) {
        expect(miningTiers[i].cycleMultiplier).toBe(
          woodcuttingTiers[i].cycleMultiplier,
        );
      }
    });

    it("should have fishing with no speed tiers (all 1.0)", () => {
      const fishingTiers = (
        ResourceSystem as unknown as {
          TOOL_TIERS: Record<string, Array<{ cycleMultiplier: number }>>;
        }
      ).TOOL_TIERS.fishing;

      expect(fishingTiers.length).toBe(1);
      expect(fishingTiers[0].cycleMultiplier).toBe(1.0);
    });
  });
});
