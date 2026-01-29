# Persistence Architecture Audit & Implementation Plan

> **Date:** January 2025
> **Status:** Comprehensive audit complete, implementation plan ready
> **Priority:** Critical - Data loss bugs identified

---

## Executive Summary

This document contains a complete audit of the Hyperscape persistence system, identifies critical bugs causing player data loss, and provides a detailed implementation plan for AAA-quality persistence.

### Key Findings

1. **Equipment Loss Bug (Root Cause Identified)**: Players intermittently lose equipment on dev server restart due to a race condition in the loading path, not the saving path
2. **Non-Atomic Operations**: Equipment saves use delete-then-insert without a transaction wrapper
3. **Fire-and-Forget Event Handlers**: EventBus doesn't await async handlers, causing data loss on shutdown
4. **Inconsistent Save Patterns**: Different systems use different persistence strategies (30s auto-save vs immediate vs debounced)

### Impact Assessment

| Issue | Severity | Data Loss Risk |
|-------|----------|----------------|
| Equipment loading race condition | P0 | Complete equipment loss |
| Equipment save not transactional | P0 | Equipment loss on crash |
| EventBus async handlers not awaited | P1 | Any pending saves lost on shutdown |
| 30-second auto-save window | P1 | Up to 30s of progress lost |

---

## Part 1: Equipment Loss Bug - Root Cause Analysis

### The Bug

Players intermittently lose worn equipment when:
1. Dev server restarts
2. Player logs back in quickly
3. Equipment appears empty

**Frequency:** ~1 in 10 restarts

### Root Cause

The bug is in the **loading path**, not the saving path.

**File:** `/packages/server/src/systems/ServerNetwork/character-selection.ts`
**Lines:** 795-797

```typescript
equipmentRows = dbSys?.getPlayerEquipmentAsync
  ? await dbSys.getPlayerEquipmentAsync(persistenceId)
  : [];  // BUG: Returns empty array when DB not ready!
```

**File:** `/packages/shared/src/systems/shared/character/EquipmentSystem.ts`
**Lines:** 182-194

```typescript
if (typedData.equipment && typedData.equipment.length > 0) {
  await this.loadEquipmentFromPayload(...);  // Has items → load them
} else if (typedData.equipment) {
  // Empty array → assumes player has NO equipment
  this.emitEmptyEquipmentEvents(typedData.playerId);  // CLEARS EQUIPMENT!
} else {
  // undefined → falls back to DB query (SAFE)
  await this.loadEquipmentFromDatabase(typedData.playerId);
}
```

### The Sequence

1. Dev server restarts
2. Player reconnects **before DatabaseSystem is fully initialized**
3. `character-selection.ts` tries to get DatabaseSystem → returns `undefined` or not ready
4. Code returns `[]` (empty array) instead of `undefined`
5. EquipmentSystem receives `equipment: []`
6. Condition: `equipment.length > 0` → FALSE
7. Condition: `equipment` (truthy) → TRUE (empty array is truthy!)
8. Calls `emitEmptyEquipmentEvents()` → **Player now has no equipment in memory**
9. Auto-save runs (30 seconds) → **Saves empty equipment to database**
10. Equipment **permanently lost**

### The Fix

**One-line change** in `character-selection.ts:797`:

```typescript
// Before (BUG):
: [];

// After (FIXED):
: undefined;
```

This ensures that when DatabaseSystem isn't ready, EquipmentSystem falls back to querying the DB itself.

---

## Part 2: Complete Persistence Audit

### 2.1 All System Save Patterns

| System | Save Trigger | Pattern | Awaited? | File |
|--------|-------------|---------|----------|------|
| **Inventory** | Item add/remove | 300ms debounce | No | `InventorySystem.ts` |
| **Inventory** | Periodic | 30s auto-save | No | `InventorySystem.ts:205-251` |
| **Equipment** | Equip/unequip | Immediate async | Yes | `EquipmentSystem.ts:1064,1181` |
| **Equipment** | Periodic | 30s auto-save | No | `EquipmentSystem.ts:2118-2138` |
| **Equipment** | Player disconnect | PLAYER_LEFT handler | No (fire-and-forget) | `EquipmentSystem.ts:205-208` |
| **Skills** | XP gain | Event-driven | No | `event-bridge.ts:316-336` |
| **Bank** | Deposit/withdraw | Immediate transaction | Yes | `BankRepository.ts` |
| **Trades** | Trade complete | Atomic transaction | Yes | `TradingSystem/index.ts` |
| **Death** | Player dies | Atomic with lock | Yes | `DeathRepository.ts` |
| **Coins** | Via inventory | 300ms debounce | No | `InventorySystem.ts` |
| **Activity Log** | Batched | 1s flush interval | No | `ActivityLoggerSystem.ts:51` |

### 2.2 Auto-Save Intervals

| System | Interval | What's Saved | Cleanup on Shutdown |
|--------|----------|--------------|---------------------|
| SaveManager | 60s | World settings + player data | ✅ Yes |
| InventorySystem | 30s | All player inventories | ✅ Yes |
| EquipmentSystem | 30s | All player equipment | ✅ Yes |
| ActivityLogger | 1s | Batched activity logs | ⚠️ No flush on destroy |
| TradingSystem | 10s | Cleanup expired trades | ✅ Yes |
| PersistenceSystem | 30s | World chunks | ❌ No explicit cleanup |

### 2.3 Database Repositories

| Repository | File | Transactional? | Issues |
|------------|------|----------------|--------|
| PlayerRepository | `repositories/PlayerRepository.ts` | No | Partial updates only |
| InventoryRepository | `repositories/InventoryRepository.ts` | Yes | Uses raw SQL for upsert |
| EquipmentRepository | `repositories/EquipmentRepository.ts` | **NO** | Delete/insert not atomic |
| BankRepository | `repositories/BankRepository.ts` | Partial | Tabs/items separate |
| DeathRepository | `repositories/DeathRepository.ts` | Yes | Good pattern - use as template |
| SessionRepository | `repositories/SessionRepository.ts` | No | Not synced with player saves |
| ActivityLogRepository | `repositories/ActivityLogRepository.ts` | No | Batch writes only |
| CharacterRepository | `repositories/CharacterRepository.ts` | No | Creates with defaults |

### 2.4 EventBus Async Handler Issue

**File:** `/packages/shared/src/systems/shared/infrastructure/EventBus.ts`
**Lines:** 86-91

```typescript
const result = handler(event);

// Handle async handlers
if (result instanceof Promise) {
  result; // Let promise rejection propagate naturally <- NO AWAIT!
}
```

**Problem:** Async event handlers are called but never awaited. This means:
- PLAYER_LEFT handlers that save data may not complete before shutdown
- Errors in async handlers are silently swallowed
- No way to track pending async operations from events

**Affected Handlers:**
- `EquipmentSystem.ts:205-208` - PLAYER_LEFT save
- `TradingSystem/index.ts` - PLAYER_LEFT, PLAYER_DIED
- `DuelSystem/index.ts` - PLAYER_LEFT, PLAYER_LOGOUT
- `KillTrackerSystem/index.ts:45-51` - NPC_DIED
- All activity logging handlers

---

## Part 3: Race Conditions Identified

### Critical (P0) - Data Loss Risk

| Race Condition | Location | Window | Result |
|----------------|----------|--------|--------|
| Equipment delete-insert gap | `EquipmentRepository.ts:67-81` | Between delete and insert | Complete equipment loss |
| Character load with empty equipment | `character-selection.ts:795-797` | DB not ready on login | Equipment cleared permanently |
| Bank tabs/items separate | `BankRepository.ts` | Between tab and item saves | Bank data corruption |

### High (P1) - Data Consistency Risk

| Race Condition | Location | Window | Result |
|----------------|----------|--------|--------|
| Inventory-equipment load different times | `handleEnterWorld():786-908` | Between DB queries | Stale data shown to client |
| EventBus async not awaited | `EventBus.ts:90` | During shutdown | Pending saves lost |
| Session-player not atomic | `SessionRepository.ts` | Between creates | Orphaned session records |

### Mitigated (Acceptable)

| Race Condition | Location | Mitigation |
|----------------|----------|------------|
| Duplicate player entities | `handleEnterWorld():422-426` | Immediate socket.characterId assignment |
| Death lock acquisition | `DeathRepository.ts` | INSERT ON CONFLICT DO NOTHING |
| Trade item swap | `TradingSystem` | Serializable transaction isolation |

---

## Part 4: Comparison to RuneScape Standard

### How RuneScape Handles Persistence

RuneScape saves **immediately on every action** (subsecond persistence):
- Every item pickup/drop
- Every coin transaction
- Every equipment change
- Every XP gain
- Every bank operation

This is why:
- You can't dupe items by crashing
- You can't rollback trades
- Progress is never lost beyond current tick

### Current Hyperscape vs RuneScape

| Metric | Hyperscape | RuneScape | Gap |
|--------|-----------|-----------|-----|
| Save latency (items) | 300ms debounce | <100ms | 3-10x slower |
| Save latency (equipment) | Immediate on change | <100ms | Acceptable |
| Save latency (coins) | 30s periodic | <100ms | 300x slower |
| Crash data loss (worst) | 30+ seconds | <1 second | 30x worse |
| Item duplication risk | YES | NO | Critical |
| Atomic operations | Trades/death only | All critical ops | Incomplete |

---

## Part 5: Implementation Plan

### Phase 1: Critical Bug Fixes (Do Immediately)

#### 1.1 Fix Equipment Loading Race Condition

**File:** `packages/server/src/systems/ServerNetwork/character-selection.ts`
**Line:** 797

```typescript
// Change from:
: [];
// To:
: undefined;
```

**Impact:** Prevents equipment loss on fast reconnect after server restart.

#### 1.2 Make Equipment Save Transactional

**File:** `packages/server/src/database/repositories/EquipmentRepository.ts`
**Lines:** 55-82

```typescript
// Current (BUG):
async savePlayerEquipmentAsync(playerId: string, items: EquipmentSaveItem[]): Promise<void> {
  // Delete existing
  await this.db.delete(schema.equipment).where(eq(schema.equipment.playerId, playerId));
  // Insert new (NOT ATOMIC!)
  if (items.length > 0) {
    await this.db.insert(schema.equipment).values(...);
  }
}

// Fixed:
async savePlayerEquipmentAsync(playerId: string, items: EquipmentSaveItem[]): Promise<void> {
  await this.db.transaction(async (tx) => {
    await tx.delete(schema.equipment).where(eq(schema.equipment.playerId, playerId));
    if (items.length > 0) {
      await tx.insert(schema.equipment).values(...);
    }
  });
}
```

**Impact:** Prevents equipment loss if server crashes during save.

#### 1.3 Add Inventory to PLAYER_JOINED Payload

**File:** `packages/server/src/systems/ServerNetwork/character-selection.ts`

Load inventory alongside equipment before emitting PLAYER_JOINED, pass in payload:

```typescript
// Load inventory from DB (similar to equipment loading)
let inventoryRows: InventorySyncData[] | undefined;
try {
  inventoryRows = dbSys?.getPlayerInventoryAsync
    ? await dbSys.getPlayerInventoryAsync(persistenceId)
    : undefined;  // undefined triggers fallback, not empty array
} catch (err) {
  inventoryRows = undefined;
}

// Pass in event payload
world.emit(EventType.PLAYER_JOINED, {
  playerId: socket.player.data.id,
  player: socket.player,
  equipment: equipmentRows,
  inventory: inventoryRows,  // NEW
  isLoadTestBot,
});
```

**Impact:** Eliminates inventory/equipment load race condition.

### Phase 2: Persistence Architecture Improvements

#### 2.1 Create Operations Log Table

**File:** `packages/server/src/database/schema.ts`

```typescript
export const operationsLog = pgTable("operations_log", {
  id: text("id").primaryKey(),  // UUID or hash
  playerId: text("playerId").notNull(),
  operationType: text("operationType").notNull(),
  operationState: jsonb("operationState").notNull(),
  completed: boolean("completed").default(false),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
});

// Index for recovery queries
// CREATE INDEX idx_operations_incomplete ON operations_log(playerId, completed) WHERE completed = false;
```

#### 2.2 Create Unified Persistence Service

**File:** `packages/server/src/persistence/PersistenceService.ts`

```typescript
export class PersistenceService {
  private queue: Map<string, PendingChange> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;

  private readonly FLUSH_INTERVAL_MS = 50;  // 50ms max latency
  private readonly BATCH_SIZE = 100;

  async queueChange(playerId: string, changeType: string, data: unknown): Promise<void> {
    // 1. Write to operations log (durability point)
    const operationId = await this.logOperationStart(playerId, changeType, data);

    // 2. Queue for batched execution
    this.queue.set(operationId, { playerId, changeType, data, operationId });

    // 3. Trigger flush if needed
    if (this.queue.size >= this.BATCH_SIZE) {
      await this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
    }
  }

  private async flush(): Promise<void> {
    const operations = Array.from(this.queue.values());
    this.queue.clear();
    this.flushTimer = null;

    await this.db.transaction(async (tx) => {
      for (const op of operations) {
        await this.executeOperation(tx, op);
        await this.markOperationComplete(tx, op.operationId);
      }
    });
  }

  async recoverOnStartup(): Promise<void> {
    const incomplete = await this.db.select()
      .from(operationsLog)
      .where(eq(operationsLog.completed, false));

    for (const op of incomplete) {
      await this.executeOperation(null, op);
      await this.markOperationComplete(null, op.id);
    }
  }
}
```

#### 2.3 Fix EventBus Async Handler Tracking

**File:** `packages/shared/src/systems/shared/infrastructure/EventBus.ts`

```typescript
// Add pending promises tracking
private pendingAsyncHandlers: Set<Promise<unknown>> = new Set();

// In handler execution:
const result = handler(event);
if (result instanceof Promise) {
  this.pendingAsyncHandlers.add(result);
  result.finally(() => this.pendingAsyncHandlers.delete(result));
}

// Add method for shutdown
async waitForPendingHandlers(): Promise<void> {
  await Promise.allSettled(Array.from(this.pendingAsyncHandlers));
}
```

#### 2.4 Add Flush on Shutdown to ActivityLogger

**File:** `packages/server/src/systems/ActivityLoggerSystem/index.ts`

```typescript
destroy(): void {
  // Force flush before clearing timer
  if (this.pendingEntries.length > 0) {
    this.flushSync();  // Synchronous flush for shutdown
  }

  if (this.flushInterval) {
    clearInterval(this.flushInterval);
    this.flushInterval = undefined;
  }
}
```

### Phase 3: Reduce Data Loss Window

#### 3.1 Reduce Auto-Save Interval

Change from 30 seconds to 5 seconds:

**Files:**
- `InventorySystem.ts`: `AUTO_SAVE_INTERVAL = 5000`
- `EquipmentSystem.ts`: `AUTO_SAVE_INTERVAL = 5000`

#### 3.2 Remove Debounce for Critical Operations

**File:** `packages/shared/src/systems/shared/character/InventorySystem.ts`

For item pickups and drops, call `persistInventoryImmediate()` instead of `scheduleInventoryPersist()`.

### Phase 4: Bank Atomicity

**File:** `packages/server/src/database/repositories/BankRepository.ts`

Wrap tab and item operations in single transaction:

```typescript
async savePlayerBankAsync(playerId: string, data: BankSaveData): Promise<void> {
  await this.db.transaction(async (tx) => {
    // Save tabs
    await this.saveTabsInTransaction(tx, playerId, data.tabs);
    // Save items
    await this.saveItemsInTransaction(tx, playerId, data.items);
  });
}
```

---

## Part 6: Testing Plan

### Unit Tests

1. **Equipment Loading**
   - Test with undefined DatabaseSystem → should fall back to DB query
   - Test with empty array from DB → should load empty (new player)
   - Test with valid equipment → should load correctly

2. **Equipment Saving**
   - Test transaction rollback on error
   - Test concurrent saves don't corrupt data

3. **Operations Log**
   - Test write-ahead log creation
   - Test recovery on startup
   - Test duplicate operation prevention

### Integration Tests

1. **Server Restart Scenarios**
   - Restart with player connected → equipment preserved
   - Restart during equipment change → no data loss
   - Restart during trade → trade either completes or rolls back

2. **Crash Simulation**
   - Kill -9 during save → data recovered from operations log
   - Kill -9 during trade → trade rolled back cleanly

### Load Tests

1. **Concurrent Operations**
   - 100 players equipping items simultaneously
   - 50 trades executing simultaneously
   - Measure persistence latency percentiles

---

## Part 7: Monitoring & Alerting

### Metrics to Track

```typescript
// Persistence latency histogram
persistence_save_duration_ms{system="equipment|inventory|bank"}

// Operations log depth (should stay near 0)
persistence_operations_pending_count

// Save failures
persistence_save_errors_total{system, error_type}

// Recovery events on startup
persistence_recovery_operations_total
```

### Alerts

1. **Persistence Latency > 100ms** (P95) - Warning
2. **Persistence Latency > 500ms** (P95) - Critical
3. **Operations Log Depth > 100** - Critical (operations backing up)
4. **Save Error Rate > 1%** - Critical

---

## Part 8: File Reference

### Files to Modify (Phase 1)

| File | Change | Priority |
|------|--------|----------|
| `packages/server/src/systems/ServerNetwork/character-selection.ts:797` | Change `[]` to `undefined` | P0 |
| `packages/server/src/database/repositories/EquipmentRepository.ts:55-82` | Wrap in transaction | P0 |
| `packages/shared/src/systems/shared/character/InventorySystem.ts` | Add to PLAYER_JOINED payload | P0 |

### Files to Create (Phase 2)

| File | Purpose |
|------|---------|
| `packages/server/src/database/schema.ts` | Add operations_log table |
| `packages/server/src/persistence/PersistenceService.ts` | Unified persistence with WAL |
| `packages/server/src/persistence/OperationsLog.ts` | Operations log queries |

### Files to Modify (Phase 2-4)

| File | Change |
|------|--------|
| `packages/shared/src/systems/shared/infrastructure/EventBus.ts` | Track async handlers |
| `packages/server/src/systems/ActivityLoggerSystem/index.ts` | Flush on destroy |
| `packages/server/src/database/repositories/BankRepository.ts` | Atomic tab+item saves |
| `packages/shared/src/systems/shared/character/InventorySystem.ts` | Reduce auto-save to 5s |
| `packages/shared/src/systems/shared/character/EquipmentSystem.ts` | Reduce auto-save to 5s |

---

## Appendix A: Good Patterns to Follow

### Death System (Best Example)

**File:** `packages/server/src/database/repositories/DeathRepository.ts`

```typescript
// Atomic check-and-create prevents race conditions
async acquireDeathLockAsync(data: DeathLockData, tx?: Transaction): Promise<boolean> {
  // Uses INSERT ... ON CONFLICT DO NOTHING with RETURNING
  // If another request already inserted, returns false
}
```

### Trade System (Good Example)

**File:** `packages/server/src/systems/TradingSystem/index.ts`

```typescript
// Serializable isolation prevents all race conditions
await dbSystem.executeInTransaction(async (tx) => {
  // All trade operations atomic
}, { isolationLevel: 'serializable' });
```

---

## Appendix B: Commands

```bash
# Run database migrations after schema changes
bun run db:migrate

# Test persistence under load
bun run test:persistence

# Monitor persistence metrics (if Prometheus/Grafana configured)
curl localhost:9090/metrics | grep persistence
```

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| Jan 2025 | Claude | Initial audit and implementation plan |
