# Plan: Write-Through Persistence — Zero Data Loss (#733)

## Goal

Eliminate ALL inventory/coin data loss scenarios by switching from write-behind (debounced) persistence to write-through (immediate) persistence. Every mutation is persisted to the database before the operation is considered complete.

## Current Architecture (Write-Behind)

```
Player action → mutate in-memory → scheduleInventoryPersist (300ms debounce) → DB write
                                                    ↑
                                              DATA LOSS WINDOW
```

Any crash, kill, or restart during the 300ms debounce window loses data.

## Target Architecture (Write-Through)

```
Player action → mutate in-memory → await DB write → return to caller
```

No data loss window. The DB is always in sync with memory.

---

## Phase 1: Eliminate the Debounce (Already Done)

These fixes are already implemented on this branch:

- ✅ Dev server waits for process exit instead of 1-second timeout (`dev.mjs`)
- ✅ `InventorySystem.destroyAsync()` awaits DB writes (`savePlayerInventoryAsync`)
- ✅ `CoinPouchSystem.destroyAsync()` awaits DB writes (`savePlayerAsync`)
- ✅ `persistCoinsImmediate()` converted to proper async/await

---

## Phase 2: InventorySystem Write-Through

Convert `scheduleInventoryPersist()` calls to `await persistInventoryImmediate()`. This requires making the calling methods async.

### 2a: Make `addItem()` async

**File**: `packages/shared/src/systems/shared/character/InventorySystem.ts`

`addItem()` currently returns `number` (quantity added) and calls `scheduleInventoryPersist()` at 3 exit points (lines 508, 546, 597). Change to:

- Return type: `number` → `Promise<number>`
- Replace all 3 `scheduleInventoryPersist(playerId)` calls with `await this.persistInventoryImmediate(playerId)`

**Callers to update** (6 total):

| File | Line | Method | Currently Async? |
|------|------|--------|-----------------|
| InventorySystem.ts | 217 | `handleStarterChestLooted()` | No → make async |
| InventorySystem.ts | 352 | `addStarterEquipment()` | No → make async |
| InventorySystem.ts | 1049 | `pickupItem()` | Yes ✅ — add await |
| InventorySystem.ts | 1985 | `loadInventoryFromPayload()` | Yes ✅ — add await |
| InventorySystem.ts | 2066 | `loadPersistedInventoryAsync()` | Yes ✅ — add await |
| InventorySystem.ts | 2346 | `handleInventoryAdd()` | No → make async |

**Note**: `pickupItem()` already calls `persistInventoryImmediate()` AFTER `addItem()`. Once `addItem` persists internally, remove the redundant `persistInventoryImmediate()` call from `pickupItem()` (line 1094).

### 2b: Make `removeItem()` async

Same file. `removeItem()` returns `number` and calls `scheduleInventoryPersist()` at line 738. Change to:

- Return type: `number` → `Promise<number>`
- Replace `scheduleInventoryPersist(playerId)` with `await this.persistInventoryImmediate(playerId)`

**Callers to update** (7 total):

| File | Line | Method | Currently Async? |
|------|------|--------|-----------------|
| InventorySystem.ts | 125 | `init()` event subscriber (INVENTORY_REMOVE) | No → make async |
| InventorySystem.ts | 131 | `init()` event subscriber (USE_ITEM) | No → make async |
| InventorySystem.ts | 769 | `dropItem()` | Yes ✅ — add await |
| InventorySystem.ts | 1080 | `pickupItem()` | Yes ✅ — add await |
| InventorySystem.ts | 1780 | `removeItemDirect()` | No → make async |
| HeadstoneEntity.ts | 360 | `processLootRequest()` | Yes ✅ — add await |
| HeadstoneEntity.ts | 564 | `processLootAllRequest()` | Yes ✅ — add await |

**Note**: `dropItem()` already calls `persistInventoryImmediate()` after `removeItem()` (line 824). Remove redundant call.

### 2c: Make `moveItem()` async

`moveItem()` returns `boolean` and calls `scheduleInventoryPersist()` at line 1217. Change to:

- Return type: `boolean` → `Promise<boolean>`
- Replace with `await this.persistInventoryImmediate(playerId)`

**Callers to update** (1 total):

| File | Line | Method | Currently Async? |
|------|------|--------|-----------------|
| InventorySystem.ts | 149 | `init()` event subscriber (INVENTORY_MOVE) | No → make async |

### 2d: Make `addItemDirect()` async

`addItemDirect()` returns `number` and calls `scheduleInventoryPersist()` at lines 1822, 1850. Change to:

- Return type: `number` → `Promise<number>`
- Replace both with `await this.persistInventoryImmediate(playerId)`

**Callers to update** (1 total):

| File | Line | Method | Currently Async? |
|------|------|--------|-----------------|
| EquipmentSystem.ts | 980 | `unequipItem()` | Yes ✅ — add await |

### 2e: Make `removeItemDirect()` async

`removeItemDirect()` returns `number` and calls `scheduleInventoryPersist()` internally (via `removeItem()`). Since `removeItem()` is now async, this must also become async.

**Callers to update** (1 total):

| File | Line | Method | Currently Async? |
|------|------|--------|-----------------|
| CombatSystem.ts | 1259 | `consumeRunesForSpell()` | No → make async |

### 2f: Make `dropAllItems()` async

`dropAllItems()` calls `scheduleInventoryPersist()` at line 859. Change to:

- Return type: `void` → `Promise<void>`
- Replace with `await this.persistInventoryImmediate(playerId)`

**Callers to update** (1 total):

| File | Line | Method | Currently Async? |
|------|------|--------|-----------------|
| InventorySystem.ts | 152 | `init()` event subscriber (DROP_ALL) | No → make async |

---

## Phase 3: CoinPouchSystem Write-Through

Convert `schedulePersist()` calls to `await persistCoinsImmediate()`.

### 3a: Make `addCoins()` async

**File**: `packages/shared/src/systems/shared/character/CoinPouchSystem.ts`

`addCoins()` returns `void` and calls `schedulePersist()` at line 240. Change to:

- Return type: `void` → `Promise<void>`
- Replace `this.schedulePersist(playerId)` with `await this.persistCoinsImmediate(playerId)`

**Callers to update** (2 total):

| File | Line | Method | Currently Async? |
|------|------|--------|-----------------|
| InventorySystem.ts | 476 | `addItem()` | No → already being made async in Phase 2a |
| CoinPouchSystem.ts | 97 | `init()` event subscriber (ADD_COINS) | No → make async |

### 3b: Make `removeCoins()` async

`removeCoins()` returns `boolean` and calls `schedulePersist()` at line 300. Change to:

- Return type: `boolean` → `Promise<boolean>`
- Replace with `await this.persistCoinsImmediate(playerId)`

**Callers to update** (2 total):

| File | Line | Method | Currently Async? |
|------|------|--------|-----------------|
| InventorySystem.ts | 684 | `removeItem()` | No → already being made async in Phase 2b |
| CoinPouchSystem.ts | 102 | `init()` event subscriber (REMOVE_COINS) | No → make async |

### 3c: Make `setCoins()` async

`setCoins()` is private, calls `schedulePersist()` at line 325. Change to:

- Return type: `void` → `Promise<void>`
- Replace with `await this.persistCoinsImmediate(playerId)`

**Callers to update** (1 total):

| File | Line | Method | Currently Async? |
|------|------|--------|-----------------|
| CoinPouchSystem.ts | 109 | `init()` event subscriber (UPDATE_COINS) | No → make async |

---

## Phase 4: Remove Dead Code

With write-through in place, the following become unnecessary:

### 4a: InventorySystem cleanup

- **Delete `scheduleInventoryPersist()`** method (lines 2120-2143) — no longer called
- **Delete `persistTimers` Map** and all references — no more debounce timers
- **Delete `performAutoSave()`** method (lines 242-275) — write-through makes auto-save redundant
- **Delete `startAutoSave()`** method (lines 236-240) — same
- **Delete `AUTO_SAVE_INTERVAL` constant** (line 39) — same
- **Delete `saveInterval` field** and `clearInterval` in `destroyAsync()` — same
- **Simplify `destroyAsync()`** — the save loop is now a no-op since all data is already persisted. Keep the `playerInventories.clear()` and `super.destroy()` calls.

### 4b: CoinPouchSystem cleanup

- **Delete `schedulePersist()`** method (lines 367-381) — no longer called
- **Delete `persistTimers` Map** and all references — no more debounce timers
- **Delete `performAutoSave()`** method (lines 422-437) — write-through makes auto-save redundant
- **Delete `startAutoSave()`** method (lines 420-424) — same
- **Delete `AUTO_SAVE_INTERVAL` constant** (line 64) — same
- **Delete `autoSaveInterval` field** and `clearInterval` in `destroyAsync()` — same
- **Simplify `destroyAsync()`** — same as inventory.

### 4c: Remove redundant persist calls

With write-through, explicit `persistInventoryImmediate()` calls at these sites are now redundant (the mutation methods already persist):

- `pickupItem()` line 1094 — remove `await this.persistInventoryImmediate()`
- `dropItem()` line 824 — remove `await this.persistInventoryImmediate()`
- `clearInventoryImmediate()` line 2206 — review if still needed

**Keep** the `persistInventoryImmediate()` calls in:
- `executeInventoryTransaction()` (transaction.ts line 365) — these flush BEFORE a DB transaction starts, still needed as a pre-transaction barrier
- `executeTradeSwap()` (swap.ts lines 161-162) — same reason

---

## Phase 5: Verification

1. `bun run build` passes with no type errors (TypeScript will catch any missed async conversions)
2. `npm test` passes
3. Manual smoke test:
   - Log in, pick up items, trigger dev restart → items persist
   - Buy items from store, restart → coins and items persist
   - Equip/unequip items, restart → equipment persists
   - Trade with another player, restart → both inventories persist
   - Kill a mob, collect loot, restart → loot persists

---

## Scope Summary

| Metric | Count |
|--------|-------|
| Methods changing signature (async) | ~12 |
| Files modified | ~5 |
| Callers to update | ~17 |
| Dead code methods removed | ~8 |
| New code written | ~0 (replacing debounce calls with await calls) |

## Risk Assessment

- **TypeScript catches missed callers**: If a method returns `Promise<number>` but a caller uses it as `number`, the compiler errors. This is the main safety net.
- **Event subscribers**: Making event subscriber callbacks async is safe — the event system fires them and the returned promise is handled within the callback. The key change is that DB writes now complete within the subscriber rather than being deferred.
- **Performance**: `persistInventoryImmediate()` does one `getPlayerAsync()` + one `savePlayerInventoryAsync()` per call. SQLite: sub-millisecond. PostgreSQL: 1-5ms. Against a 600ms game tick, negligible. Multiple mutations in the same tick (e.g., picking up 3 items) result in 3 DB writes — still well under 1 tick.
