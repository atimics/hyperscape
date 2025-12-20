/**
 * Type Guards Unit Tests
 *
 * Tests for runtime type validation functions that replace unsafe `as unknown as` casts.
 * Each guard provides type narrowing for TypeScript while validating at runtime.
 */

import { describe, it, expect } from "vitest";
import {
  // System guards
  isTerrainSystem,
  isMobSystem,
  isEquipmentSystem,
  // Mob entity guards
  isMobLike,
  hasMobConfig,
  getMobRetaliates,
  hasServerEmote,
  // Player entity guards
  hasNetworkDirty,
  // AI state machine guards
  hasAIDamageHandler,
  // Combat state manager guards
  hasPlayerCombatManager,
  hasDeathStateManager,
  // Generic utility guards
  isObject,
  hasMethod,
  hasProperty,
} from "../typeGuards";

describe("Type Guards", () => {
  // ===========================================================================
  // SYSTEM TYPE GUARDS
  // ===========================================================================

  describe("isTerrainSystem", () => {
    it("returns true for valid terrain system", () => {
      const system = {
        isPositionWalkable: (x: number, z: number) => ({ walkable: true }),
      };
      expect(isTerrainSystem(system)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isTerrainSystem(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isTerrainSystem(undefined)).toBe(false);
    });

    it("returns false for object without isPositionWalkable", () => {
      expect(isTerrainSystem({})).toBe(false);
    });

    it("returns false for non-function isPositionWalkable", () => {
      expect(isTerrainSystem({ isPositionWalkable: "not a function" })).toBe(
        false,
      );
    });

    it("narrows type correctly after check", () => {
      const system: unknown = {
        isPositionWalkable: () => ({ walkable: true }),
      };
      if (isTerrainSystem(system)) {
        // TypeScript should allow this without error
        const result = system.isPositionWalkable(0, 0);
        expect(result.walkable).toBe(true);
      }
    });
  });

  describe("isMobSystem", () => {
    it("returns true for valid mob system", () => {
      const system = {
        getMob: (id: string) => ({ id }),
      };
      expect(isMobSystem(system)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isMobSystem(null)).toBe(false);
    });

    it("returns false for object without getMob", () => {
      expect(isMobSystem({})).toBe(false);
    });
  });

  describe("isEquipmentSystem", () => {
    it("returns true for valid equipment system", () => {
      const system = {
        getPlayerEquipment: (playerId: string) => ({
          weapon: { item: { weaponType: "SWORD", id: "bronze_sword" } },
        }),
      };
      expect(isEquipmentSystem(system)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isEquipmentSystem(null)).toBe(false);
    });

    it("returns false for object without getPlayerEquipment", () => {
      expect(isEquipmentSystem({})).toBe(false);
    });
  });

  // ===========================================================================
  // MOB ENTITY GUARDS
  // ===========================================================================

  describe("isMobLike", () => {
    it("returns true for entity with all mob methods", () => {
      const mob = {
        getHealth: () => 100,
        isDead: () => false,
        takeDamage: (damage: number) => false,
      };
      expect(isMobLike(mob)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isMobLike(null)).toBe(false);
    });

    it("returns false for entity missing takeDamage", () => {
      const partial = {
        getHealth: () => 100,
        isDead: () => false,
      };
      expect(isMobLike(partial)).toBe(false);
    });

    it("returns false for entity missing getHealth", () => {
      const partial = {
        isDead: () => false,
        takeDamage: () => false,
      };
      expect(isMobLike(partial)).toBe(false);
    });

    it("returns false for entity missing isDead", () => {
      const partial = {
        getHealth: () => 100,
        takeDamage: () => false,
      };
      expect(isMobLike(partial)).toBe(false);
    });
  });

  describe("hasMobConfig", () => {
    it("returns true for mob with config.retaliates defined", () => {
      const mob = {
        config: { retaliates: true },
      };
      expect(hasMobConfig(mob)).toBe(true);
    });

    it("returns true for mob with config.retaliates false", () => {
      const mob = {
        config: { retaliates: false },
      };
      expect(hasMobConfig(mob)).toBe(true);
    });

    it("returns false for null", () => {
      expect(hasMobConfig(null)).toBe(false);
    });

    it("returns false for entity without config", () => {
      expect(hasMobConfig({})).toBe(false);
    });

    it("returns false for entity with empty config", () => {
      expect(hasMobConfig({ config: {} })).toBe(false);
    });
  });

  describe("getMobRetaliates", () => {
    it("returns true for mob with retaliates: true", () => {
      const mob = { config: { retaliates: true } };
      expect(getMobRetaliates(mob)).toBe(true);
    });

    it("returns false for mob with retaliates: false", () => {
      const mob = { config: { retaliates: false } };
      expect(getMobRetaliates(mob)).toBe(false);
    });

    it("returns true (default) for mob without config", () => {
      expect(getMobRetaliates({})).toBe(true);
    });

    it("returns true (default) for null", () => {
      expect(getMobRetaliates(null)).toBe(true);
    });

    it("returns true (default) for mob with empty config", () => {
      expect(getMobRetaliates({ config: {} })).toBe(true);
    });
  });

  describe("hasServerEmote", () => {
    it("returns true for entity with setServerEmote function", () => {
      const entity = {
        setServerEmote: (emote: string) => {},
      };
      expect(hasServerEmote(entity)).toBe(true);
    });

    it("returns false for null", () => {
      expect(hasServerEmote(null)).toBe(false);
    });

    it("returns false for entity without setServerEmote", () => {
      expect(hasServerEmote({})).toBe(false);
    });

    it("returns false for non-function setServerEmote", () => {
      expect(hasServerEmote({ setServerEmote: "not a function" })).toBe(false);
    });
  });

  // ===========================================================================
  // PLAYER ENTITY GUARDS
  // ===========================================================================

  describe("hasNetworkDirty", () => {
    it("returns true for entity with markNetworkDirty function", () => {
      const entity = {
        markNetworkDirty: () => {},
      };
      expect(hasNetworkDirty(entity)).toBe(true);
    });

    it("returns false for null", () => {
      expect(hasNetworkDirty(null)).toBe(false);
    });

    it("returns false for entity without markNetworkDirty", () => {
      expect(hasNetworkDirty({})).toBe(false);
    });
  });

  // ===========================================================================
  // AI STATE MACHINE GUARDS
  // ===========================================================================

  describe("hasAIDamageHandler", () => {
    it("returns true for entity with AI damage handler", () => {
      const entity = {
        aiStateMachine: {
          onReceiveDamage: (attackerId: string, damage: number) => {},
        },
      };
      expect(hasAIDamageHandler(entity)).toBe(true);
    });

    it("returns false for null", () => {
      expect(hasAIDamageHandler(null)).toBe(false);
    });

    it("returns false for entity without aiStateMachine", () => {
      expect(hasAIDamageHandler({})).toBe(false);
    });

    it("returns false for entity with incomplete aiStateMachine", () => {
      const entity = { aiStateMachine: {} };
      expect(hasAIDamageHandler(entity)).toBe(false);
    });

    it("returns false for non-function onReceiveDamage", () => {
      const entity = {
        aiStateMachine: { onReceiveDamage: "not a function" },
      };
      expect(hasAIDamageHandler(entity)).toBe(false);
    });
  });

  // ===========================================================================
  // COMBAT STATE MANAGER GUARDS
  // ===========================================================================

  describe("hasPlayerCombatManager", () => {
    it("returns true for entity with full combat state manager", () => {
      const entity = {
        combatStateManager: {
          onReceiveAttack: (attackerId: string, tick: number) => {},
          isAutoRetaliateEnabled: () => true,
          getTargetId: () => "target1",
        },
      };
      expect(hasPlayerCombatManager(entity)).toBe(true);
    });

    it("returns false for null", () => {
      expect(hasPlayerCombatManager(null)).toBe(false);
    });

    it("returns false for entity without combatStateManager", () => {
      expect(hasPlayerCombatManager({})).toBe(false);
    });

    it("returns false for incomplete combatStateManager", () => {
      const entity = {
        combatStateManager: {
          onReceiveAttack: () => {},
          // Missing isAutoRetaliateEnabled and getTargetId
        },
      };
      expect(hasPlayerCombatManager(entity)).toBe(false);
    });
  });

  describe("hasDeathStateManager", () => {
    it("returns true for entity with death state manager", () => {
      const entity = {
        deathStateManager: {
          isDead: () => false,
          die: (killerId: string) => {},
        },
      };
      expect(hasDeathStateManager(entity)).toBe(true);
    });

    it("returns false for null", () => {
      expect(hasDeathStateManager(null)).toBe(false);
    });

    it("returns false for entity without deathStateManager", () => {
      expect(hasDeathStateManager({})).toBe(false);
    });

    it("returns false for incomplete deathStateManager", () => {
      const entity = {
        deathStateManager: {
          isDead: () => false,
          // Missing die
        },
      };
      expect(hasDeathStateManager(entity)).toBe(false);
    });
  });

  // ===========================================================================
  // GENERIC UTILITY GUARDS
  // ===========================================================================

  describe("isObject", () => {
    it("returns true for plain object", () => {
      expect(isObject({})).toBe(true);
    });

    it("returns true for object with properties", () => {
      expect(isObject({ foo: "bar" })).toBe(true);
    });

    it("returns true for array", () => {
      expect(isObject([])).toBe(true);
    });

    it("returns false for null", () => {
      expect(isObject(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isObject(undefined)).toBe(false);
    });

    it("returns false for string", () => {
      expect(isObject("string")).toBe(false);
    });

    it("returns false for number", () => {
      expect(isObject(123)).toBe(false);
    });

    it("returns false for boolean", () => {
      expect(isObject(true)).toBe(false);
    });
  });

  describe("hasMethod", () => {
    it("returns true for object with specified method", () => {
      const obj = {
        myMethod: () => {},
      };
      expect(hasMethod(obj, "myMethod")).toBe(true);
    });

    it("returns false for null", () => {
      expect(hasMethod(null, "anything")).toBe(false);
    });

    it("returns false for object without method", () => {
      expect(hasMethod({}, "missing")).toBe(false);
    });

    it("returns false for non-function property", () => {
      expect(hasMethod({ prop: "value" }, "prop")).toBe(false);
    });
  });

  describe("hasProperty", () => {
    it("returns true for object with specified property", () => {
      const obj = { myProp: "value" };
      expect(hasProperty(obj, "myProp")).toBe(true);
    });

    it("returns true for undefined property value", () => {
      const obj = { myProp: undefined };
      expect(hasProperty(obj, "myProp")).toBe(true);
    });

    it("returns false for null", () => {
      expect(hasProperty(null, "anything")).toBe(false);
    });

    it("returns false for object without property", () => {
      expect(hasProperty({}, "missing")).toBe(false);
    });
  });

  // ===========================================================================
  // TYPE NARROWING TESTS
  // ===========================================================================

  describe("Type Narrowing", () => {
    it("isTerrainSystem narrows correctly in conditional", () => {
      const maybeSystem: unknown = {
        isPositionWalkable: () => ({ walkable: true }),
      };

      if (isTerrainSystem(maybeSystem)) {
        // This should compile without errors - TypeScript knows the type
        const result = maybeSystem.isPositionWalkable(10, 20);
        expect(result.walkable).toBe(true);
      } else {
        // Should not reach here
        expect(true).toBe(false);
      }
    });

    it("hasServerEmote narrows correctly in conditional", () => {
      let emoteCalled = false;
      const maybeEntity: unknown = {
        setServerEmote: (emote: string) => {
          emoteCalled = true;
        },
      };

      if (hasServerEmote(maybeEntity)) {
        maybeEntity.setServerEmote("combat");
        expect(emoteCalled).toBe(true);
      } else {
        expect(true).toBe(false);
      }
    });

    it("isMobLike narrows correctly in conditional", () => {
      const maybeMob: unknown = {
        getHealth: () => 50,
        isDead: () => false,
        takeDamage: (dmg: number) => dmg >= 50,
      };

      if (isMobLike(maybeMob)) {
        expect(maybeMob.getHealth()).toBe(50);
        expect(maybeMob.isDead()).toBe(false);
        expect(maybeMob.takeDamage(100)).toBe(true);
      } else {
        expect(true).toBe(false);
      }
    });
  });
});
