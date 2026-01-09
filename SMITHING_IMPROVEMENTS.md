# Smithing System Improvements

**Audit Date:** 2026-01-09
**Current Rating:** 7.9/10
**Target Rating:** 10/10

This document outlines recommended improvements to elevate the smithing system to AAA production standards.

---

## Priority 1: Security Hardening

### 1.1 Add Per-Player Rate Limiting

**Location:** `packages/server/src/systems/ServerNetwork/index.ts`

**Issue:** No protection against request spam/flooding.

**Solution:**
```typescript
// Add to ServerNetwork class
private requestCooldowns = new Map<string, Map<string, number>>();
private readonly REQUEST_COOLDOWN_MS = 100; // 10 requests/second max

private isRateLimited(playerId: string, requestType: string): boolean {
  const now = Date.now();
  let playerCooldowns = this.requestCooldowns.get(playerId);

  if (!playerCooldowns) {
    playerCooldowns = new Map();
    this.requestCooldowns.set(playerId, playerCooldowns);
  }

  const lastRequest = playerCooldowns.get(requestType) || 0;
  if (now - lastRequest < this.REQUEST_COOLDOWN_MS) {
    return true; // Rate limited
  }

  playerCooldowns.set(requestType, now);
  return false;
}

// Usage in handlers:
this.handlers["onProcessingSmithing"] = (socket, data) => {
  const player = socket.player;
  if (!player) return;

  if (this.isRateLimited(player.id, "smithing")) {
    return; // Silently drop rate-limited requests
  }
  // ... rest of handler
};
```

### 1.2 Item ID Whitelist Validation

**Location:** `packages/shared/src/constants/SmithingConstants.ts`

**Issue:** Item IDs validated by format only, not against known items.

**Solution:**
```typescript
import { processingDataProvider } from "../data/ProcessingDataProvider";

/**
 * Validate that an item ID exists in the smithing/smelting system
 */
export function isValidSmithingItemId(id: string): boolean {
  if (!isValidItemId(id)) return false;
  return processingDataProvider.isSmithableItem(id);
}

export function isValidSmeltingBarId(id: string): boolean {
  if (!isValidItemId(id)) return false;
  return processingDataProvider.isSmeltableBar(id);
}
```

---

## Priority 2: Architecture Improvements

### 2.1 Integrate with Tick System

**Location:** `packages/shared/src/systems/shared/interaction/SmithingSystem.ts`

**Issue:** Uses `setTimeout` instead of game tick system, causing potential desync.

**Current:**
```typescript
session.timeoutId = setTimeout(() => {
  this.completeSmith(playerId);
}, smithTimeMs);
```

**Recommended Approach:**

The server uses `TickSystem` with priority-based callbacks. SmithingSystem should register
with the tick system for proper synchronization:

```typescript
// In SmithingSystem (server-side initialization)
import { TickSystem, TickPriority } from "../../TickSystem";

// Add to class properties
private tickSystem: TickSystem | null = null;
private unsubscribeTick: (() => void) | null = null;

// Modify session interface
interface SmithingSession {
  // ... existing fields
  completionTick: number; // Replace timeoutId with tick-based completion
}

// In init() - register with tick system
async init(): Promise<void> {
  if (!this.world.isServer) return;

  // Get tick system from world/network
  this.tickSystem = this.world.getTickSystem?.();

  if (this.tickSystem) {
    this.unsubscribeTick = this.tickSystem.onTick(
      (tickNumber: number) => this.processTick(tickNumber),
      TickPriority.RESOURCES // Same priority as other processing systems
    );
  }

  // ... rest of init
}

// Add tick processing method
private processTick(currentTick: number): void {
  for (const [playerId, session] of this.activeSessions) {
    if (currentTick >= session.completionTick) {
      this.completeSmith(playerId);
      // Note: completeSmith calls processNextSmith which sets next completionTick
    }
  }
}

// Modify startSmithing to use tick-based timing
private startSmithing(data: { ... }): void {
  // ... validation code

  const currentTick = this.world.currentTick || 0;
  const smithingData = processingDataProvider.getSmithingRecipe(recipeId);

  const session: SmithingSession = {
    playerId,
    recipeId,
    anvilId,
    startTime: Date.now(),
    quantity: Math.max(1, quantity),
    smithed: 0,
    completionTick: currentTick + smithingData.ticks, // Tick-based instead of setTimeout
  };

  this.activeSessions.set(playerId, session);
  // Remove setTimeout call - tick system handles timing
}

// Clean up on destroy
destroy(): void {
  if (this.unsubscribeTick) {
    this.unsubscribeTick();
    this.unsubscribeTick = null;
  }
  // ... rest of cleanup
}
```

**Benefits:**
- Synchronized with server tick (600ms boundaries)
- No drift from setTimeout inaccuracy
- Proper ordering with other game systems (combat, movement)
- Matches OSRS tick-perfect behavior

### 2.2 Dependency Injection for ProcessingDataProvider

**Location:** `packages/shared/src/data/ProcessingDataProvider.ts`

**Issue:** Direct import of `ITEMS` creates tight coupling.

**Solution:**
```typescript
export interface ItemDataSource {
  get(itemId: string): ItemDefinition | undefined;
  entries(): IterableIterator<[string, ItemDefinition]>;
}

export class ProcessingDataProvider {
  private itemDataSource: ItemDataSource;

  constructor(itemDataSource?: ItemDataSource) {
    this.itemDataSource = itemDataSource || {
      get: (id) => ITEMS.get(id),
      entries: () => ITEMS.entries(),
    };
  }

  // Allows injection for testing
  public static createWithDataSource(source: ItemDataSource): ProcessingDataProvider {
    return new ProcessingDataProvider(source);
  }
}
```

---

## Priority 3: Type Safety Improvements

### 3.1 Strict Player Type Guards

**Location:** `packages/shared/src/systems/shared/interaction/SmithingSystem.ts`

**Issue:** Loose type assertion `player as { skills?: ... }`

**Current:**
```typescript
private getSmithingLevel(playerId: string): number {
  const player = this.world.getPlayer(playerId);
  const playerSkills = (player as { skills?: Record<string, { level: number }> })?.skills;
  return playerSkills?.smithing?.level || 1;
}
```

**Recommended:**
```typescript
// Add to types/entities/player-types.ts
export interface PlayerWithSkills {
  id: string;
  skills?: {
    smithing?: { level: number; xp: number };
    // ... other skills
  };
}

export function hasSkills(player: unknown): player is PlayerWithSkills {
  if (!player || typeof player !== "object") return false;
  if (!("id" in player)) return false;
  const p = player as PlayerWithSkills;
  if (p.skills && typeof p.skills !== "object") return false;
  return true;
}

// Usage:
private getSmithingLevel(playerId: string): number {
  const cachedSkills = this.playerSkills.get(playerId);
  if (cachedSkills?.smithing?.level) {
    return cachedSkills.smithing.level;
  }

  const player = this.world.getPlayer(playerId);
  if (hasSkills(player) && player.skills?.smithing?.level) {
    return player.skills.smithing.level;
  }
  return 1;
}
```

### 3.2 Add Readonly Modifiers

**Location:** Multiple system files

**Issue:** Mutable Maps that should be readonly after initialization.

```typescript
// Before
private activeSessions = new Map<string, SmithingSession>();

// After
private readonly activeSessions = new Map<string, SmithingSession>();
private readonly playerSkills = new Map<string, Record<string, { level: number; xp: number }>>();
```

---

## Priority 4: Memory Optimization

### 4.1 Pre-allocated Inventory Counter

**Location:** `packages/shared/src/data/ProcessingDataProvider.ts`

**Issue:** New `Map` allocation on every inventory check.

**Solution:**
```typescript
export class ProcessingDataProvider {
  // Pre-allocated reusable map for inventory counting
  private readonly inventoryCountBuffer = new Map<string, number>();

  private buildInventoryCounts(
    inventory: Array<{ itemId: string; quantity?: number }>
  ): Map<string, number> {
    // Clear and reuse instead of allocating new
    this.inventoryCountBuffer.clear();

    for (const item of inventory) {
      const current = this.inventoryCountBuffer.get(item.itemId) || 0;
      this.inventoryCountBuffer.set(item.itemId, current + (item.quantity || 1));
    }

    return this.inventoryCountBuffer;
  }
}
```

### 4.2 Object Pool for Session Data

**Location:** `packages/shared/src/systems/shared/interaction/SmithingSystem.ts`

**Issue:** Creates new session objects frequently.

**Solution:**
```typescript
class SessionPool {
  private pool: SmithingSession[] = [];
  private readonly MAX_POOL_SIZE = 100;

  acquire(): SmithingSession {
    return this.pool.pop() || this.createNew();
  }

  release(session: SmithingSession): void {
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }
    // Reset to defaults
    session.playerId = "";
    session.recipeId = "";
    session.anvilId = "";
    session.startTime = 0;
    session.quantity = 0;
    session.smithed = 0;
    session.timeoutId = null;

    if (this.pool.length < this.MAX_POOL_SIZE) {
      this.pool.push(session);
    }
  }

  private createNew(): SmithingSession {
    return {
      playerId: "",
      recipeId: "",
      anvilId: "",
      startTime: 0,
      quantity: 0,
      smithed: 0,
      timeoutId: null,
    };
  }
}
```

---

## Priority 5: Testing Improvements

### 5.1 Remove Conditional Test Skipping

**Location:** `packages/shared/src/data/__tests__/ProcessingDataProvider.test.ts`

**Issue:** Tests skip when data not loaded instead of ensuring data loads.

**Current:**
```typescript
it("returns recipe data for valid bronze item (if data loaded)", () => {
  const recipe = provider.getSmithingRecipe("bronze_sword");
  if (recipe) { /* test */ }
  else if (hasSmithingData) { throw new Error(...); }
});
```

**Recommended:**
```typescript
// In vitest.setup.ts - ensure data loads before all tests
beforeAll(async () => {
  await dataManager.initialize();
  const provider = ProcessingDataProvider.getInstance();
  provider.rebuild();

  // Fail fast if data didn't load
  if (provider.getSmithableItemIds().size === 0) {
    throw new Error("Test setup failed: No smithing data loaded");
  }
});

// Tests can then be unconditional
it("returns recipe data for bronze sword", () => {
  const recipe = provider.getSmithingRecipe("bronze_sword");
  expect(recipe).not.toBeNull();
  expect(recipe!.barType).toBe("bronze_bar");
});
```

### 5.2 Add Integration Tests

**Location:** `packages/shared/src/systems/shared/interaction/__tests__/SmithingSystem.integration.test.ts` (new file)

```typescript
describe("SmithingSystem Integration", () => {
  it("completes full smithing flow: interact -> select -> smith -> receive item", async () => {
    // 1. Setup world with player, anvil, inventory with bars + hammer
    // 2. Emit SMITHING_INTERACT
    // 3. Verify SMITHING_INTERFACE_OPEN emitted with correct recipes
    // 4. Emit PROCESSING_SMITHING_REQUEST
    // 5. Wait for ticks
    // 6. Verify INVENTORY_ITEM_ADDED with smithed item
    // 7. Verify SKILLS_XP_GAINED with correct XP
  });

  it("prevents smithing without hammer", async () => {
    // Setup player without hammer
    // Attempt smithing
    // Verify UI_MESSAGE with hammer required error
  });

  it("handles disconnect during smithing session", async () => {
    // Start smithing session
    // Emit PLAYER_UNREGISTERED
    // Verify session cleaned up, no orphaned timeouts
  });
});
```

---

## Priority 6: OSRS Accuracy Enhancements

### 6.1 Add Ring of Forging Support

**Location:** `packages/shared/src/systems/shared/interaction/SmeltingSystem.ts`

OSRS has a "Ring of Forging" that makes iron smelting 100% success.

```typescript
private getSmeltingSuccessRate(playerId: string, baseRate: number): number {
  if (baseRate >= 1.0) return 1.0; // Already 100%

  // Check for Ring of Forging
  const equipment = this.world.getEquipment?.(playerId);
  if (equipment?.ring?.itemId === "ring_of_forging") {
    // Ring of forging grants 100% success for iron
    this.emitTypedEvent(EventType.EQUIPMENT_CONSUME_CHARGE, {
      playerId,
      slot: "ring",
      charges: 1,
    });
    return 1.0;
  }

  return baseRate;
}
```

### 6.2 Add Superheat Item Spell Support

Future enhancement: Magic spell that smelts ore without furnace.

```typescript
// Event type for magic integration
MAGIC_SUPERHEAT_ITEM = "magic:superheat_item",

// In SmeltingSystem, listen for superheat events
this.subscribe(EventType.MAGIC_SUPERHEAT_ITEM, (data) => {
  // Single instant smelt without furnace
  this.instantSmelt(data.playerId, data.oreItemId);
});
```

---

## Implementation Checklist

- [ ] **P1.1** Rate limiting in ServerNetwork
- [ ] **P1.2** Item ID whitelist validation
- [ ] **P2.1** Tick system integration
- [ ] **P2.2** Dependency injection for data source
- [ ] **P3.1** Strict player type guards
- [ ] **P3.2** Readonly modifiers on Maps
- [ ] **P4.1** Pre-allocated inventory counter
- [ ] **P4.2** Session object pool
- [ ] **P5.1** Unconditional test assertions
- [ ] **P5.2** Integration tests
- [ ] **P6.1** Ring of Forging (optional)
- [ ] **P6.2** Superheat Item spell (optional)

---

## Expected Rating After Improvements

| Category | Current | After |
|----------|---------|-------|
| Production Quality Code | 8/10 | 9/10 |
| Best Practices | 8/10 | 9/10 |
| OWASP Security | 7/10 | 9/10 |
| Game Studio Audit | 8/10 | 10/10 |
| Memory & Allocation | 7/10 | 9/10 |
| SOLID Principles | 8/10 | 9/10 |
| OSRS Likeness | 9/10 | 10/10 |
| **Overall** | **7.9/10** | **9.3/10** |

---

## Notes

- Priority 1-3 items are recommended before production launch
- Priority 4-5 items improve maintainability and performance
- Priority 6 items are feature enhancements for OSRS parity
- All changes should include corresponding test updates
