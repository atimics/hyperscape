# Smithing System: Road to 9/10

**Current Score: 7/10**
**Target Score: 9/10**
**Estimated Effort: ~3-4 hours**

---

## Executive Summary

This plan addresses all identified issues to bring the Smithing system from 7/10 to 9/10 production readiness. Changes are organized by priority and grouped into phases.

> **Plan Audit Status**: ✅ Verified 2024-01 - All phases reviewed for correctness, event types verified, testing approach aligned with project philosophy.

---

## Current Scores → Target Scores

| Category | Current | Target | Gap |
|----------|---------|--------|-----|
| Production Quality Code | 7.0 | 9.0 | +2.0 |
| Best Practices | 6.5 | 9.0 | +2.5 |
| OWASP Security | 8.0 | 9.0 | +1.0 |
| Memory Hygiene | 6.0 | 9.0 | +3.0 |
| SOLID Principles | 7.5 | 9.0 | +1.5 |
| OSRS Likeness | 8.0 | 9.0 | +1.0 |
| **Overall** | **7.0** | **9.0** | **+2.0** |

---

## Phase 1: Critical Fixes (Memory & Correctness)

**Priority: BLOCKING**
**Time: ~30 minutes**

### 1.1 Fix Memory Leak in playerSkills Cache

**Files:** `SmeltingSystem.ts`, `SmithingSystem.ts`

Add cleanup to disconnect handler:
```typescript
// In PLAYER_UNREGISTERED subscription
this.subscribe(
  EventType.PLAYER_UNREGISTERED,
  (data: { playerId: string }) => {
    this.cancelSmelting(data.playerId);
    this.playerSkills.delete(data.playerId); // ADD THIS
  },
);
```

Add cleanup to destroy():
```typescript
destroy(): void {
  for (const playerId of this.activeSessions.keys()) {
    this.completeSmelting(playerId);
  }
  this.activeSessions.clear();
  this.playerSkills.clear(); // ADD THIS
}
```

### 1.2 Fix Typo in Error Message

**File:** `SmeltingSystem.ts:328`

```typescript
// BEFORE (typo)
message: "The ore is too impure andite cannotite into a bar.",

// AFTER (correct OSRS message)
message: "The ore is too impure and you fail to smelt it.",
```

---

## Phase 2: Memory Hygiene Improvements

**Priority: HIGH**
**Time: ~30 minutes**

### 2.1 Store and Cancel setTimeout References (REQUIRED)

**Files:** `SmeltingSystem.ts`, `SmithingSystem.ts`

Add timeout tracking to session interface:
```typescript
interface SmeltingSession {
  playerId: string;
  barItemId: string;
  furnaceId: string;
  startTime: number;
  quantity: number;
  smelted: number;
  failed: number;
  timeoutId: ReturnType<typeof setTimeout> | null; // ADD THIS
}
```

Update processNextSmelt:
```typescript
private processNextSmelt(playerId: string): void {
  const session = this.activeSessions.get(playerId);
  if (!session) return;

  // ... existing checks ...

  // Store timeout reference
  session.timeoutId = setTimeout(() => {
    this.completeSmelt(playerId);
  }, SMELTING_TIME);
}
```

Cancel on session end:
```typescript
private completeSmelting(playerId: string): void {
  const session = this.activeSessions.get(playerId);
  if (!session) return;

  // Cancel pending timeout
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
    session.timeoutId = null;
  }

  this.activeSessions.delete(playerId);
  // ... rest of method ...
}
```

### 2.2 Pre-allocate Reusable Map for Inventory Counts (OPTIONAL - Skip)

> **Note**: This is a micro-optimization. Creating a `new Map()` per inventory check has negligible overhead with modern JS engines. The GC handles small short-lived objects efficiently. This adds complexity for minimal benefit.
>
> **Recommendation**: Skip this unless profiling shows it's a bottleneck.

---

## Phase 3: Server-Only Guards & Efficiency

**Priority: HIGH**
**Time: ~30 minutes**

### 3.1 Add Server-Only Guard to Systems

**Files:** `SmeltingSystem.ts`, `SmithingSystem.ts`

Add guard to event handlers that should only run on server:
```typescript
async init(): Promise<void> {
  // Only process smelting logic on server
  if (!this.world.isServer) {
    return; // Client doesn't need these handlers
  }

  this.subscribe(EventType.SMELTING_INTERACT, ...);
  this.subscribe(EventType.PROCESSING_SMELTING_REQUEST, ...);
  this.subscribe(EventType.SKILLS_UPDATED, ...);
  this.subscribe(EventType.PLAYER_UNREGISTERED, ...);
}
```

This prevents:
- Wasted client-side computation
- Potential client/server desync
- Unnecessary event subscriptions on client

---

## Phase 4: Input Validation Hardening

**Priority: MEDIUM**
**Time: ~45 minutes**

### 4.1 Add Input Validation to ServerNetwork Handlers

**File:** `ServerNetwork/index.ts`

```typescript
this.handlers["onProcessingSmelting"] = (socket, data) => {
  const player = socket.player;
  if (!player) return;

  const payload = data as {
    barItemId?: unknown;
    furnaceId?: unknown;
    quantity?: unknown;
  };

  // Type validation
  if (typeof payload.barItemId !== 'string' ||
      typeof payload.furnaceId !== 'string') {
    return;
  }

  // Length validation (prevent memory abuse)
  if (payload.barItemId.length > 64 || payload.furnaceId.length > 64) {
    return;
  }

  // Quantity validation
  const quantity = typeof payload.quantity === 'number'
    ? Math.floor(Math.max(1, Math.min(payload.quantity, 10000)))
    : 1;

  // Sanitize for logging (prevent log injection)
  const safeBarId = payload.barItemId.replace(/[^\w_-]/g, '');
  console.log(
    `[ServerNetwork] Smelting request from ${player.id}: ${quantity}x ${safeBarId}`,
  );

  this.world.emit(EventType.PROCESSING_SMELTING_REQUEST, {
    playerId: player.id,
    barItemId: payload.barItemId,
    furnaceId: payload.furnaceId,
    quantity,
  });
};
```

### 4.2 Extract Constants for Hardcoded Strings

**File:** Create `SmithingConstants.ts`

```typescript
// packages/shared/src/constants/SmithingConstants.ts

export const SMITHING_CONSTANTS = {
  // Item IDs
  HAMMER_ITEM_ID: "hammer",
  COAL_ITEM_ID: "coal",

  // Timing (milliseconds)
  SMELTING_TIME_MS: 2400,  // ~4 game ticks
  SMITHING_TIME_MS: 2400,

  // Limits
  MAX_QUANTITY: 10000,
  MAX_ITEM_ID_LENGTH: 64,

  // Messages
  MESSAGES: {
    ALREADY_SMELTING: "You are already smelting.",
    ALREADY_SMITHING: "You are already smithing.",
    NO_HAMMER: "You need a hammer to work the metal on this anvil.",
    NO_ORES: "You don't have the ores to smelt anything.",
    NO_BARS: "You don't have the bars to smith anything.",
    OUT_OF_MATERIALS: "You have run out of materials.",
    OUT_OF_BARS: "You have run out of bars.",
    IRON_SMELT_FAIL: "The ore is too impure and you fail to smelt it.",
    INVALID_RECIPE: "Invalid smithing recipe.",
    INVALID_BAR: "Invalid bar type.",
  },
} as const;
```

Update systems to use constants:
```typescript
import { SMITHING_CONSTANTS } from "../../../constants/SmithingConstants";

// Replace hardcoded values
if (!this.hasHammer(playerId)) {
  this.emitTypedEvent(EventType.UI_MESSAGE, {
    playerId,
    message: SMITHING_CONSTANTS.MESSAGES.NO_HAMMER,
    type: "error",
  });
  return;
}
```

---

## Phase 5: Type Safety Improvements

**Priority: MEDIUM**
**Time: ~30 minutes**

### 5.1 Create Proper Types for Inventory Items

**File:** Create or update types

```typescript
// packages/shared/src/types/inventory/inventory-types.ts

export interface InventoryItem {
  itemId: string;
  quantity?: number;  // Optional - defaults to 1 throughout codebase
  slot?: number;
  metadata?: Record<string, unknown> | null;
}

// Type guard - validates structure, allows missing quantity (defaults to 1)
export function isInventoryItem(item: unknown): item is InventoryItem {
  if (typeof item !== 'object' || item === null) return false;
  if (!('itemId' in item)) return false;
  if (typeof (item as InventoryItem).itemId !== 'string') return false;

  // quantity is optional, but if present must be a number
  const qty = (item as InventoryItem).quantity;
  if (qty !== undefined && typeof qty !== 'number') return false;

  return true;
}
```

Update systems to use type guard:
```typescript
private hasRequiredMaterials(playerId: string, barItemId: string): boolean {
  const inventory = this.world.getInventory?.(playerId);
  if (!inventory || !Array.isArray(inventory)) return false;

  const itemCounts = new Map<string, number>();

  for (const item of inventory) {
    if (!isInventoryItem(item)) continue; // Type-safe check

    itemCounts.set(
      item.itemId,
      (itemCounts.get(item.itemId) || 0) + (item.quantity ?? 1)
    );
  }
  // ...
}
```

---

## Phase 6: Test Coverage

**Priority: HIGH**
**Time: ~1.5 hours**

> **Project Philosophy**: Per CLAUDE.md, this project follows a "NO MOCKS" approach for feature tests. However, pure data provider unit tests (like `skill-unlocks.test.ts`) are acceptable since they test data transformations without world dependencies.

### 6.1 Create Unit Tests for ProcessingDataProvider (Pure Data - No Mocks)

**File:** `packages/shared/src/data/__tests__/ProcessingDataProvider.test.ts`

This follows the same pattern as `skill-unlocks.test.ts` - testing pure data functions without mocking:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessingDataProvider } from '../ProcessingDataProvider';

describe('ProcessingDataProvider', () => {
  let provider: ProcessingDataProvider;

  beforeEach(() => {
    provider = ProcessingDataProvider.getInstance();
    provider.rebuild(); // Reset state
  });

  // ============================================================================
  // SMITHING RECIPE TESTS
  // ============================================================================

  describe('getSmithingRecipe', () => {
    it('returns null for non-existent recipe', () => {
      expect(provider.getSmithingRecipe('fake_item')).toBeNull();
    });

    it('returns recipe data for valid item', () => {
      const recipe = provider.getSmithingRecipe('bronze_sword');
      expect(recipe).not.toBeNull();
      expect(recipe?.barType).toBe('bronze_bar');
    });

    it('has correct structure for all recipes', () => {
      const recipes = provider.getAllSmithingRecipes();
      for (const recipe of recipes) {
        expect(recipe.itemId).toBeTruthy();
        expect(recipe.barType).toBeTruthy();
        expect(recipe.barsRequired).toBeGreaterThan(0);
        expect(recipe.levelRequired).toBeGreaterThanOrEqual(1);
        expect(recipe.xp).toBeGreaterThan(0);
      }
    });
  });

  describe('getSmithableItemsFromInventory', () => {
    it('returns empty array when no bars in inventory', () => {
      const result = provider.getSmithableItemsFromInventory([], 99);
      expect(result).toEqual([]);
    });

    it('filters by smithing level', () => {
      const inventory = [{ itemId: 'bronze_bar', quantity: 10 }];
      const level1 = provider.getSmithableItemsFromInventory(inventory, 1);
      const level99 = provider.getSmithableItemsFromInventory(inventory, 99);
      expect(level99.length).toBeGreaterThanOrEqual(level1.length);
    });

    it('respects bar quantity requirements', () => {
      const oneBar = [{ itemId: 'bronze_bar', quantity: 1 }];
      const tenBars = [{ itemId: 'bronze_bar', quantity: 10 }];

      const withOne = provider.getSmithableItemsFromInventory(oneBar, 99);
      const withTen = provider.getSmithableItemsFromInventory(tenBars, 99);

      // More bars = more recipes available (platebodies need 5 bars)
      expect(withTen.length).toBeGreaterThanOrEqual(withOne.length);
    });
  });

  // ============================================================================
  // SMELTING RECIPE TESTS
  // ============================================================================

  describe('getSmeltingData', () => {
    it('returns null for non-existent bar', () => {
      expect(provider.getSmeltingData('fake_bar')).toBeNull();
    });

    it('returns smelting data for bronze bar', () => {
      const data = provider.getSmeltingData('bronze_bar');
      expect(data).not.toBeNull();
      expect(data?.primaryOre).toBe('copper_ore');
      expect(data?.secondaryOre).toBe('tin_ore');
      expect(data?.coalRequired).toBe(0);
    });

    it('iron bar has 50% success rate', () => {
      const data = provider.getSmeltingData('iron_bar');
      expect(data?.successRate).toBe(0.5);
    });
  });

  describe('getSmeltableBarsFromInventory', () => {
    it('returns bronze bar when copper and tin present', () => {
      const inventory = [
        { itemId: 'copper_ore', quantity: 1 },
        { itemId: 'tin_ore', quantity: 1 },
      ];
      const result = provider.getSmeltableBarsFromInventory(inventory, 1);
      expect(result.some(b => b.barItemId === 'bronze_bar')).toBe(true);
    });

    it('respects coal requirements for steel', () => {
      const noCoal = [{ itemId: 'iron_ore', quantity: 1 }];
      const withCoal = [
        { itemId: 'iron_ore', quantity: 1 },
        { itemId: 'coal', quantity: 2 },
      ];

      // Steel requires coal - should only be available with coal
      const steelNoCoal = provider.getSmeltableBarsFromInventory(noCoal, 99)
        .some(b => b.barItemId === 'steel_bar');
      const steelWithCoal = provider.getSmeltableBarsFromInventory(withCoal, 99)
        .some(b => b.barItemId === 'steel_bar');

      expect(steelNoCoal).toBe(false);
      expect(steelWithCoal).toBe(true);
    });

    it('respects level requirements', () => {
      const inventory = [
        { itemId: 'iron_ore', quantity: 10 },
        { itemId: 'coal', quantity: 20 },
      ];

      // Steel requires level 30
      const level1 = provider.getSmeltableBarsFromInventory(inventory, 1);
      const level30 = provider.getSmeltableBarsFromInventory(inventory, 30);

      const steelAtLevel1 = level1.some(b => b.barItemId === 'steel_bar');
      const steelAtLevel30 = level30.some(b => b.barItemId === 'steel_bar');

      expect(steelAtLevel1).toBe(false);
      expect(steelAtLevel30).toBe(true);
    });
  });

  // ============================================================================
  // DATA INTEGRITY TESTS
  // ============================================================================

  describe('data integrity', () => {
    it('all smeltable bars have valid ore references', () => {
      const barIds = provider.getSmeltableBarIds();
      for (const barId of barIds) {
        const data = provider.getSmeltingData(barId);
        expect(data?.primaryOre).toBeTruthy();
        expect(data?.levelRequired).toBeGreaterThanOrEqual(1);
        expect(data?.successRate).toBeGreaterThan(0);
        expect(data?.successRate).toBeLessThanOrEqual(1);
      }
    });

    it('all smithing recipes have valid bar references', () => {
      const recipes = provider.getAllSmithingRecipes();
      const barIds = provider.getSmeltableBarIds();

      for (const recipe of recipes) {
        expect(barIds.has(recipe.barType)).toBe(true);
      }
    });
  });
});
```

### 6.2 E2E Tests for Smithing Flow (Playwright - Project Standard)

Per CLAUDE.md, feature tests should use real Hyperscape instances with Playwright. Add to existing E2E test suite:

**File:** `packages/server/tests/e2e/smithing.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Smithing System E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to game and wait for world to load
    await page.goto('/');
    await page.waitForSelector('[data-testid="game-loaded"]', { timeout: 30000 });
  });

  test('can smelt bronze bar at furnace', async ({ page }) => {
    // 1. Ensure player has copper and tin ore (via debug command or setup)
    await page.keyboard.type('/give copper_ore 5');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/give tin_ore 5');
    await page.keyboard.press('Enter');

    // 2. Navigate to furnace and click it
    await page.click('[data-entity-type="furnace"]');

    // 3. Wait for smelting panel to open
    await expect(page.locator('[data-testid="smelting-panel"]')).toBeVisible();

    // 4. Select bronze bar and click smelt
    await page.click('[data-bar-id="bronze_bar"]');
    await page.click('[data-testid="smelt-1"]');

    // 5. Verify success message appears
    await expect(page.locator('text=You smelt a bronze bar')).toBeVisible();

    // 6. Verify bar is in inventory
    await expect(page.locator('[data-item-id="bronze_bar"]')).toBeVisible();
  });

  test('can smith bronze hatchet at anvil', async ({ page }) => {
    // 1. Give player bronze bar and hammer
    await page.keyboard.type('/give bronze_bar 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/give hammer 1');
    await page.keyboard.press('Enter');

    // 2. Navigate to anvil and click it
    await page.click('[data-entity-type="anvil"]');

    // 3. Wait for smithing panel to open
    await expect(page.locator('[data-testid="smithing-panel"]')).toBeVisible();

    // 4. Select bronze hatchet and smith
    await page.click('[data-item-id="bronze_hatchet"]');
    await page.click('[data-testid="smith-1"]');

    // 5. Verify success message
    await expect(page.locator('text=You hammer the bronze')).toBeVisible();

    // 6. Verify hatchet is in inventory
    await expect(page.locator('[data-item-id="bronze_hatchet"]')).toBeVisible();
  });

  test('shows error when missing hammer', async ({ page }) => {
    // 1. Give player bronze bar but NO hammer
    await page.keyboard.type('/give bronze_bar 1');
    await page.keyboard.press('Enter');

    // 2. Click anvil
    await page.click('[data-entity-type="anvil"]');

    // 3. Should show error message
    await expect(page.locator('text=You need a hammer')).toBeVisible();

    // 4. Smithing panel should NOT open
    await expect(page.locator('[data-testid="smithing-panel"]')).not.toBeVisible();
  });
});
```

> **Note**: The exact selectors (`[data-entity-type="furnace"]`, `[data-testid="smelting-panel"]`, etc.) should be added to the UI components to enable test targeting. This follows accessibility best practices.

---

## Phase 7: OSRS Polish

**Priority: LOW**
**Time: ~30 minutes**

### 7.1 Add "Make X" Memory

Store last custom quantity per player for UI convenience:

**File:** `SmeltingPanel.tsx`, `SmithingPanel.tsx`

```typescript
// Use localStorage to remember last X value
const [lastCustomQuantity, setLastCustomQuantity] = useState(() => {
  return parseInt(localStorage.getItem('smithing_last_x') || '10', 10);
});

const handleCustomQuantitySubmit = () => {
  const qty = parseInt(customQuantity, 10);
  if (qty > 0 && selectedRecipe) {
    localStorage.setItem('smithing_last_x', String(qty));
    setLastCustomQuantity(qty);
    handleSmith(selectedRecipe, qty);
  }
  // ...
};

// Show last X value as placeholder
<input
  placeholder={`Amount (last: ${lastCustomQuantity})`}
  // ...
/>
```

### 7.2 Add Animation Event Hooks

Emit events for client-side animation effects. Use existing `ANIMATION_PLAY` event:

```typescript
// SmeltingSystem.ts - in completeSmelt
this.emitTypedEvent(EventType.ANIMATION_PLAY, {
  entityId: playerId,
  animation: 'smelting',
  loop: false,
});

// SmithingSystem.ts - in completeSmith
this.emitTypedEvent(EventType.ANIMATION_PLAY, {
  entityId: playerId,
  animation: 'smithing',
  loop: false,
});
```

> **Note**: `EventType.ANIMATION_PLAY` exists (verified in `event-types.ts:559`). Sound events would require adding a new `SOUND_PLAY` event type to `event-types.ts` if needed in the future - out of scope for this plan.

---

## Implementation Checklist

### Phase 1: Critical Fixes
- [ ] Fix playerSkills memory leak in SmeltingSystem (add delete to PLAYER_UNREGISTERED)
- [ ] Fix playerSkills memory leak in SmithingSystem (add delete to PLAYER_UNREGISTERED)
- [ ] Add playerSkills.clear() to destroy() in both systems
- [ ] Fix typo in SmeltingSystem error message (line 328)

### Phase 2: Memory Hygiene
- [ ] Add timeoutId to SmeltingSession interface
- [ ] Add timeoutId to SmithingSession interface
- [ ] Store setTimeout references in sessions
- [ ] Cancel timeouts on session end (completeSmelting/completeSmithing)
- [ ] ~~Add pre-allocated _itemCountsBuffer~~ (SKIPPED - premature optimization)

### Phase 3: Server-Only Guards
- [ ] Add `if (!this.world.isServer) return;` to SmeltingSystem.init()
- [ ] Add `if (!this.world.isServer) return;` to SmithingSystem.init()

### Phase 4: Input Validation
- [ ] Add type validation to ServerNetwork smelting handler
- [ ] Add type validation to ServerNetwork smithing handler
- [ ] Add length limits (64 char max for IDs)
- [ ] Add quantity bounds (1-10000)
- [ ] Sanitize logging output
- [ ] Create SmithingConstants.ts
- [ ] Update systems to use constants

### Phase 5: Type Safety
- [ ] Create InventoryItem interface (quantity optional)
- [ ] Create isInventoryItem type guard
- [ ] Update SmeltingSystem to use type guard
- [ ] Update SmithingSystem to use type guard

### Phase 6: Test Coverage
- [ ] Create ProcessingDataProvider.test.ts (unit tests, no mocks)
- [ ] Create smithing.spec.ts (Playwright E2E tests)
- [ ] Add data-testid attributes to UI components for test targeting

### Phase 7: OSRS Polish
- [ ] Add Make X memory to SmeltingPanel (localStorage)
- [ ] Add Make X memory to SmithingPanel (localStorage)
- [ ] Add ANIMATION_PLAY event emission in SmeltingSystem
- [ ] Add ANIMATION_PLAY event emission in SmithingSystem

---

## Expected Final Scores

| Category | Before | After | Improvement |
|----------|--------|-------|-------------|
| Production Quality Code | 7.0 | 9.0 | +2.0 |
| Best Practices | 6.5 | 9.5 | +3.0 |
| OWASP Security | 8.0 | 9.0 | +1.0 |
| Memory Hygiene | 6.0 | 9.5 | +3.5 |
| SOLID Principles | 7.5 | 9.0 | +1.5 |
| OSRS Likeness | 8.0 | 9.0 | +1.0 |
| **Overall** | **7.0** | **9.2** | **+2.2** |

---

## Files to Create/Modify

### New Files
- `packages/shared/src/constants/SmithingConstants.ts` - Centralized constants
- `packages/shared/src/types/inventory/inventory-types.ts` - InventoryItem interface + type guard
- `packages/shared/src/data/__tests__/ProcessingDataProvider.test.ts` - Unit tests (no mocks)
- `packages/server/tests/e2e/smithing.spec.ts` - Playwright E2E tests

### Modified Files
- `packages/shared/src/systems/shared/interaction/SmeltingSystem.ts` - Memory fixes, server guard, animation
- `packages/shared/src/systems/shared/interaction/SmithingSystem.ts` - Memory fixes, server guard, animation
- `packages/server/src/systems/ServerNetwork/index.ts` - Input validation
- `packages/client/src/game/panels/SmeltingPanel.tsx` - Make X memory, data-testid attrs
- `packages/client/src/game/panels/SmithingPanel.tsx` - Make X memory, data-testid attrs

---

## Definition of Done

- [ ] All phases completed (1-7)
- [ ] ProcessingDataProvider unit tests passing (`bun test`)
- [ ] Playwright E2E tests passing (smithing.spec.ts)
- [ ] No TypeScript errors (`bun run build`)
- [ ] Build succeeds for all packages
- [ ] Manual testing: smelt bronze bar → smith bronze hatchet works end-to-end
- [ ] Code review passed
- [ ] Memory profiling shows no leaks over 10 minute session (playerSkills cleanup verified)
