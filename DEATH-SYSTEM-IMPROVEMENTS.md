# Death System Improvement Plan

> **Goal:** Bring both Production Readiness and OSRS Accuracy scores to 9/10 minimum
>
> **Scope:** Fix/improve EXISTING features only — no new systems (skull, prayers, Death's Office, etc.)
>
> **Style:** 2007-era gravestone system (not modern OSRS with Death's Office)

---

## Current Scores

| Category | Current Score | Target Score |
|----------|---------------|--------------|
| Production Readiness | 8.2/10 | 9.0/10 |
| OSRS Accuracy | 5.8/10 | 9.0/10 |

---

## Part 1: Production Readiness Improvements

### 1.1 Critical Issues (0 items)
None identified.

### 1.2 High Priority Issues (0 items)
None identified.

### 1.3 Medium Priority Issues (5 items)

#### Issue 1: Inventory Space Race Condition
- **Location:** `packages/shared/src/entities/world/HeadstoneEntity.ts`
- **Problem:** Window between inventory space check and item removal where player could drop items, making inventory full again
- **Current Flow:**
  ```
  1. checkInventorySpace() → true
  2. [RACE WINDOW - player drops items, picks up others]
  3. removeItem() → item removed from grave
  4. INVENTORY_ITEM_ADDED → fails (inventory now full)
  5. Item LOST
  ```
- **Fix:** Re-check inventory space inside `processLootRequest` immediately before removal
- **Code Change:**
  ```typescript
  // In processLootRequest, after death state check, before removeItem:

  // Step 3.5: RE-CHECK inventory space (closes race window)
  const hasSpaceNow = this.checkInventorySpace(playerId, itemId, quantityToLoot);
  if (!hasSpaceNow) {
    this.emitLootResult(playerId, transactionId, false, "INVENTORY_FULL");
    return;
  }

  // Step 4: Now safe to remove
  const removed = this.removeItem(itemId, quantityToLoot);
  ```
- **Effort:** 30 minutes
- **Risk:** Medium

---

#### Issue 2: JSON.parse Error Handling in DeathRepository
- **Location:** `packages/server/src/database/repositories/DeathRepository.ts`
- **Problem:** JSON.parse calls can throw on corrupted data, crashing the server
- **Current Code:**
  ```typescript
  groundItemIds: JSON.parse(row.groundItemIds || "[]")  // Can throw!
  position: JSON.parse(row.position)  // Can throw!
  items: JSON.parse(row.items || "[]")  // Can throw!
  ```
- **Fix:** Wrap all JSON.parse calls in try-catch with fallback values
- **Code Change:**
  ```typescript
  function safeJsonParse<T>(json: string | null, fallback: T): T {
    if (!json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch (error) {
      console.error(`[DeathRepository] Failed to parse JSON: ${json}`, error);
      return fallback;
    }
  }

  // Usage:
  groundItemIds: safeJsonParse(row.groundItemIds, []),
  position: safeJsonParse(row.position, { x: 0, y: 0, z: 0 }),
  items: safeJsonParse(row.items, []),
  ```
- **Effort:** 45 minutes
- **Risk:** Low

---

#### Issue 3: LootWindow Uses Polling Instead of Events
- **Location:** `packages/client/src/game/panels/LootWindow.tsx`
- **Problem:** 100ms polling interval is wasteful, should use event-based updates
- **Current Code:**
  ```typescript
  const updateInterval = setInterval(() => {
    // Check if gravestone exists every 100ms
    const gravestoneEntity = world.entities?.get(corpseId);
    if (!gravestoneEntity) { onClose(); }
  }, 100);
  ```
- **Fix:** Listen to `ENTITY_REMOVED` event instead of polling
- **Code Change:**
  ```typescript
  useEffect(() => {
    const handleEntityRemoved = (data: { entityId: string }) => {
      if (data.entityId === corpseId) {
        onClose();
      }
    };

    world.on(EventType.ENTITY_REMOVED, handleEntityRemoved);

    return () => {
      world.off(EventType.ENTITY_REMOVED, handleEntityRemoved);
    };
  }, [corpseId, onClose, world]);
  ```
- **Effort:** 1 hour
- **Risk:** Low

---

#### Issue 4: Missing Items Re-hydration in DeathStateManager
- **Location:** `packages/shared/src/systems/shared/death/DeathStateManager.ts`
- **Problem:** `onItemLooted` doesn't properly track remaining items for crash recovery
- **Current Code:**
  ```typescript
  // onItemLooted updates deathData.items but deathData doesn't have items field
  items: deathData.items || []  // ← Wrong reference
  ```
- **Fix:** Properly track items array in death lock, remove looted items
- **Code Change:**
  ```typescript
  async onItemLooted(playerId: string, itemId: string): Promise<void> {
    const deathLock = this.activeDeaths.get(playerId);
    if (!deathLock || !deathLock.items) return;

    // Remove looted item from tracking
    deathLock.items = deathLock.items.filter(item => item.itemId !== itemId);

    // Update database for crash recovery
    await this.updateDeathLockItems(playerId, deathLock.items);
  }
  ```
- **Effort:** 30 minutes
- **Risk:** Medium

---

#### Issue 5: Stale Death Lock Timeout Too Long
- **Location:** `packages/shared/src/constants/CombatConstants.ts`
- **Problem:** `STALE_LOCK_AGE_TICKS: 6000` = 1 hour, too long for active servers
- **Current Value:** 6000 ticks = 60 minutes
- **Fix:** Reduce to 30 minutes (3000 ticks)
- **Code Change:**
  ```typescript
  DEATH: {
    // ...
    STALE_LOCK_AGE_TICKS: 3000,  // 30 minutes (was 6000 = 1 hour)
  }
  ```
- **Effort:** 5 minutes
- **Risk:** Low

---

### 1.4 Low Priority Issues (8 items)

#### Issue 6: Loot Transaction Timeout Too Long
- **Location:** `packages/client/src/game/panels/LootWindow.tsx:12`
- **Problem:** 5 second timeout is too long for good UX
- **Fix:** Reduce `LOOT_TRANSACTION_TIMEOUT_MS` from 5000 to 3000
- **Effort:** 5 minutes

#### Issue 7: Zone Cache Grid Size Too Aggressive
- **Location:** `packages/shared/src/systems/shared/death/ZoneDetectionSystem.ts`
- **Problem:** `CACHE_GRID_SIZE = 2` causes many cache misses
- **Fix:** Increase to 4-5 for better hit rate while maintaining boundary safety
- **Effort:** 5 minutes

#### Issue 8: activeDeaths Map Has No Size Limit
- **Location:** `packages/shared/src/systems/shared/death/DeathStateManager.ts`
- **Problem:** Map could grow unbounded on long-running servers
- **Fix:** Add LRU eviction or max size limit (1000 entries)
- **Effort:** 1 hour

#### Issue 9: Deep Property Chain Access
- **Location:** Various files
- **Problem:** `entity.data.deathState`, `world.entities.player.id` violate Law of Demeter
- **Fix:** Add helper methods like `getDeathState(entity)`, `getLocalPlayerId(world)`
- **Effort:** 2 hours

#### Issue 10: Hardcoded "safe_area" in Audit Log
- **Location:** `packages/shared/src/entities/world/HeadstoneEntity.ts:411, 575`
- **Problem:** All audit logs show "safe_area" regardless of actual zone
- **Fix:** Pass zone type from death handler to HeadstoneEntity config
- **Effort:** 30 minutes

#### Issue 11: Missing Load Tests
- **Location:** Test suite
- **Problem:** No tests for 100+ simultaneous deaths
- **Fix:** Add load test with concurrent death scenarios
- **Effort:** 2 hours

#### Issue 12: Missing Database Integration Tests
- **Location:** Test suite
- **Problem:** Death repository tests use mocks, not real PostgreSQL
- **Fix:** Add integration tests with test database
- **Effort:** 3 hours

#### Issue 13: No Death Event Rate Limiting
- **Location:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
- **Problem:** No rate limiting on death events (only on loot)
- **Fix:** Add death event rate limiting similar to loot rate limiting
- **Effort:** 30 minutes

---

### 1.5 Production Readiness Checklist

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Fix inventory space race condition | Medium | 30 min | ⬜ TODO |
| Add JSON.parse error handling | Medium | 45 min | ✅ DONE |
| Replace LootWindow polling with events | Medium | 1 hr | ⬜ TODO |
| Fix items re-hydration tracking | Medium | 30 min | ⬜ TODO |
| Reduce stale lock timeout | Medium | 5 min | ✅ DONE |
| Reduce loot transaction timeout | Low | 5 min | ✅ DONE |
| Increase zone cache grid size | Low | 5 min | ⬜ TODO |
| Add activeDeaths size limit | Low | 1 hr | ⬜ TODO |
| Add helper methods for property chains | Low | 2 hrs | ⬜ TODO |
| Fix hardcoded zone in audit log | Low | 30 min | ⬜ TODO |
| Add load tests | Low | 2 hrs | ⬜ TODO |
| Add database integration tests | Low | 3 hrs | ⬜ TODO |
| Add death event rate limiting | Low | 30 min | ⬜ TODO |

**Total Effort for 9/10:** ~6-8 hours (Medium priority only)
**Total Effort for 10/10:** ~15-18 hours (All issues)

---

## Part 2: OSRS Accuracy Improvements

> **Note:** Focus on making EXISTING features accurate, not adding new systems.
>
> **Excluded:** Death's Office, skull system, Protect Item prayer, reclaim fees, untradeable conversion

### 2.1 Critical: Items Kept on Death

**Current:** ALL items go to gravestone
**OSRS (2007):** Keep 3 most valuable items, rest go to gravestone

#### Implementation Plan

##### Step 1: Add Item Value System
- **Location:** `packages/shared/src/data/items/` or item manifest
- **Requirement:** Each item needs a `value` property for sorting
- **Code Change:**
  ```typescript
  // In item definition/manifest
  interface ItemDefinition {
    id: string;
    name: string;
    value: number;  // GP value for death sorting
    // ...
  }
  ```
- **Effort:** 1 hour (if values exist in manifest, just need accessor)

##### Step 2: Create ItemsKeptOnDeath Calculator
- **Location:** `packages/shared/src/utils/death/ItemsKeptCalculator.ts` (new file)
- **Code:**
  ```typescript
  import { getItem } from "../../data/items";
  import type { InventoryItem } from "../../types/core/core";

  interface DeathItemSplit {
    kept: InventoryItem[];      // Items player keeps (3 most valuable)
    dropped: InventoryItem[];   // Items that go to gravestone
  }

  /**
   * Calculate which items are kept on death (OSRS 2007-style)
   *
   * Rules:
   * - Keep 3 most valuable items (by individual item value, not stack)
   * - Stacks count as 1 item (e.g., 1000 coins = 1 kept item)
   * - Sorted by value descending
   *
   * @param inventory - Player's inventory items
   * @param equipment - Player's equipped items
   * @returns Split of kept vs dropped items
   */
  export function calculateItemsKeptOnDeath(
    inventory: InventoryItem[],
    equipment: InventoryItem[],
  ): DeathItemSplit {
    const ITEMS_KEPT = 3;  // Default without Protect Item

    // Combine all items
    const allItems = [...inventory, ...equipment];

    // Sort by value (highest first)
    const sorted = allItems
      .map(item => ({
        item,
        value: getItem(item.itemId)?.value ?? 0
      }))
      .sort((a, b) => b.value - a.value);

    // Split into kept and dropped
    const kept = sorted.slice(0, ITEMS_KEPT).map(x => x.item);
    const dropped = sorted.slice(ITEMS_KEPT).map(x => x.item);

    return { kept, dropped };
  }
  ```
- **Effort:** 1 hour

##### Step 3: Integrate into PlayerDeathSystem
- **Location:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
- **Change:** In `processPlayerDeath`, use calculator to split items
- **Code Change:**
  ```typescript
  // After getting inventory and equipment items:
  const { kept, dropped } = calculateItemsKeptOnDeath(
    inventoryItems,
    equipmentItems
  );

  // Only drop items that aren't kept
  const itemsToDrop = dropped;

  // Clear inventory but restore kept items after respawn
  // ... (need to track kept items for respawn)
  ```
- **Effort:** 2 hours

##### Step 4: Restore Kept Items on Respawn
- **Location:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
- **Change:** Store kept items in death lock, restore on respawn
- **Code Change:**
  ```typescript
  // In death lock data:
  interface DeathLockData {
    // ... existing fields
    keptItems: InventoryItem[];  // Items to restore on respawn
  }

  // In respawn handler:
  private async handleRespawn(playerId: string): Promise<void> {
    const deathLock = await this.deathStateManager.getDeathLock(playerId);
    if (deathLock?.keptItems) {
      // Restore kept items to inventory
      for (const item of deathLock.keptItems) {
        inventorySystem.addItem({
          playerId,
          itemId: item.itemId,
          quantity: item.quantity,
          silent: true
        });
      }
    }
    // ... rest of respawn logic
  }
  ```
- **Effort:** 2 hours

##### Step 5: Add "Items Kept on Death" UI (Optional)
- **Location:** `packages/client/src/game/panels/`
- **Description:** Show player which items they'll keep before death (like OSRS interface)
- **Effort:** 3-4 hours (can defer)

**Total Effort for Items Kept:** ~6-8 hours

---

### 2.2 Critical: Ground Item Timer (Wilderness)

**Current:** 300 ticks = 3 minutes
**OSRS:** 6000 ticks = 60 minutes

#### Implementation

- **Location:** `packages/shared/src/constants/CombatConstants.ts`
- **Code Change:**
  ```typescript
  // Current:
  GROUND_ITEM_DESPAWN_TICKS: 300,  // 3 minutes

  // Fix:
  GROUND_ITEM_DESPAWN_TICKS: 6000,  // 60 minutes (OSRS-accurate)
  ```
- **Consideration:** May need separate constant for PvE vs PvP deaths
- **Effort:** 5 minutes

---

### 2.3 Medium: Gravestone Timer Pause Mechanics

**Current:** Timer always counts down
**OSRS:** Timer pauses when logged out, idle >10s, or grave UI open

#### Implementation Plan

##### Option A: Simple Pause on Logout (Recommended)
- **Location:** `packages/shared/src/systems/shared/death/SafeAreaDeathHandler.ts`
- **Change:** Track remaining ticks instead of expiration tick, pause on disconnect
- **Code Change:**
  ```typescript
  interface GravestoneData {
    gravestoneId: string;
    playerId: string;
    position: { x: number; y: number; z: number };
    items: InventoryItem[];
    remainingTicks: number;  // Changed from expirationTick
    isPaused: boolean;       // New field
  }

  processTick(currentTick: number): void {
    for (const gravestoneData of this.gravestones.values()) {
      // Skip if player offline (paused)
      if (gravestoneData.isPaused) continue;

      // Decrement remaining ticks
      gravestoneData.remainingTicks--;

      if (gravestoneData.remainingTicks <= 0) {
        expiredGravestones.push(gravestoneData);
      }
    }
  }

  // On player disconnect:
  onPlayerDisconnect(playerId: string): void {
    const grave = this.findGravestoneByPlayer(playerId);
    if (grave) grave.isPaused = true;
  }

  // On player reconnect:
  onPlayerReconnect(playerId: string): void {
    const grave = this.findGravestoneByPlayer(playerId);
    if (grave) grave.isPaused = false;
  }
  ```
- **Effort:** 2 hours

##### Option B: Full OSRS Parity (Idle + UI)
- Additional tracking for idle time and grave UI state
- **Effort:** 4-6 hours (can defer)

---

### 2.4 Medium: Fix Comment/Code Mismatch

**Current:** SafeAreaDeathHandler header says "500 ticks = 5 minutes"
**Actual:** Code uses `GRAVESTONE_TICKS: 1500` = 15 minutes

#### Implementation

- **Location:** `packages/shared/src/systems/shared/death/SafeAreaDeathHandler.ts:5-6`
- **Code Change:**
  ```typescript
  // Current (wrong):
  * 1. Items → gravestone (500 ticks = 5 minutes)
  * 2. Gravestone expires → ground items (200 ticks = 2 minutes)

  // Fix:
  * 1. Items → gravestone (1500 ticks = 15 minutes)
  * 2. Gravestone expires → ground items (6000 ticks = 60 minutes)
  ```
- **Effort:** 5 minutes

---

### 2.5 Low: Multiple Respawn Locations

**Current:** Single spawn location ("Central Haven")
**OSRS:** Multiple unlockable spawn points

#### Implementation (Simplified)

- **Location:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
- **Change:** Add spawn location to player data, use it on respawn
- **Code Change:**
  ```typescript
  // In player data or database:
  interface PlayerData {
    // ...
    respawnLocation: string;  // "central_haven" | "other_town" etc.
  }

  // In respawn handler:
  const spawnPoint = getSpawnPoint(player.respawnLocation ?? "central_haven");
  ```
- **Effort:** 2 hours (basic), 4-6 hours (with NPC dialogue to change)
- **Priority:** Can defer for MVP

---

### 2.6 OSRS Accuracy Checklist

| Task | Priority | Effort | Impact on Score | Status |
|------|----------|--------|-----------------|--------|
| Implement "Items Kept on Death" (3 items) | Critical | 6-8 hrs | +2.5 points | ⬜ TODO |
| Fix ground item timer (60 min) | Critical | 5 min | +0.5 points | ✅ DONE |
| Add gravestone pause on logout | Medium | 2 hrs | +0.3 points | ⬜ TODO |
| Fix header comment mismatch | Low | 5 min | +0.1 points | ✅ DONE |
| Multiple respawn locations | Low | 4-6 hrs | +0.2 points | ⬜ DEFER |

**Minimum for 9/10:** Items Kept + Ground Item Timer + Pause on Logout
**Total Effort:** ~8-10 hours

---

## Part 3: Combined Priority List

### Immediate (Do Now)
| Task | Type | Effort | Status |
|------|------|--------|--------|
| Fix ground item timer to 60 minutes | OSRS | 5 min | ✅ DONE |
| Fix header comment mismatch | OSRS | 5 min | ✅ DONE |
| Reduce stale lock timeout to 30 min | Prod | 5 min | ✅ DONE |
| Reduce loot transaction timeout to 3s | Prod | 5 min | ✅ DONE |
| Add JSON.parse error handling | Prod | 45 min | ✅ DONE |

### This Sprint
| Task | Type | Effort |
|------|------|--------|
| Implement Items Kept on Death | OSRS | 6-8 hrs |
| Fix inventory space race condition | Prod | 30 min |
| Add JSON.parse error handling | Prod | 45 min |
| Fix items re-hydration tracking | Prod | 30 min |

### Next Sprint
| Task | Type | Effort |
|------|------|--------|
| Add gravestone pause on logout | OSRS | 2 hrs |
| Replace LootWindow polling with events | Prod | 1 hr |
| Increase zone cache grid size | Prod | 5 min |
| Add activeDeaths size limit | Prod | 1 hr |

### Backlog
| Task | Type | Effort |
|------|------|--------|
| Multiple respawn locations | OSRS | 4-6 hrs |
| Add helper methods for property chains | Prod | 2 hrs |
| Fix hardcoded zone in audit log | Prod | 30 min |
| Add load tests | Prod | 2 hrs |
| Add database integration tests | Prod | 3 hrs |
| Add death event rate limiting | Prod | 30 min |

---

## Part 4: Expected Scores After Improvements

### After Immediate Tasks (~20 min)
| Category | Before | After |
|----------|--------|-------|
| Production Readiness | 8.2 | 8.3 |
| OSRS Accuracy | 5.8 | 6.3 |

### After This Sprint (~10 hrs)
| Category | Before | After |
|----------|--------|-------|
| Production Readiness | 8.3 | 8.7 |
| OSRS Accuracy | 6.3 | 8.8 |

### After Next Sprint (~4 hrs)
| Category | Before | After |
|----------|--------|-------|
| Production Readiness | 8.7 | 9.1 |
| OSRS Accuracy | 8.8 | 9.2 |

---

## Appendix: Key Files Reference

| File | Purpose |
|------|---------|
| `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts` | Death orchestration |
| `packages/shared/src/systems/shared/death/DeathStateManager.ts` | State persistence |
| `packages/shared/src/systems/shared/death/SafeAreaDeathHandler.ts` | Safe zone deaths |
| `packages/shared/src/systems/shared/death/WildernessDeathHandler.ts` | PvP deaths |
| `packages/shared/src/entities/world/HeadstoneEntity.ts` | Gravestone entity |
| `packages/shared/src/constants/CombatConstants.ts` | Timing constants |
| `packages/client/src/game/panels/LootWindow.tsx` | Loot UI |
| `packages/server/src/database/repositories/DeathRepository.ts` | DB persistence |

---

*Last Updated: 2026-01-17*
*Audit By: Claude Opus 4.5*
