# Death System Implementation Plan: Path to 9.5/10+

**Document Version:** 2.0 (Validated)
**Created:** 2026-01-17
**Validated:** 2026-01-17
**Target Score:** 9.5/10 (minimum: 9.0/10)
**Current Score:** 5.0/10
**Estimated Total Effort:** 40-50 hours

---

## Validation Status

This plan has been validated against the actual codebase. Key corrections from v1.0:

| Issue | v1.0 Error | v2.0 Correction |
|-------|------------|-----------------|
| P0-007 | "postDeathCleanup outside transaction is dangerous" | postDeathCleanup has NO database operations - not a bug |
| P1-001 | Drizzle `{ isolationLevel: 'serializable' }` | Drizzle doesn't support this; use `SET TRANSACTION` SQL |
| P0-002 | "No mitigation exists" | lootQueue already serializes requests; enhance with events |
| Tests | "322 new tests needed" | 78 tests already exist; ~70 new tests needed |
| P2-001 | "handlePlayerDeath is 136 lines" | That's `processPlayerDeath` (different function) |

---

## Executive Summary

This document provides a **complete, actionable implementation plan** to elevate the death system from 5.0/10 to 9.5/10+.

### Issue Distribution (Revised)

| Priority | Count | Score Impact | Hours |
|----------|-------|--------------|-------|
| P0 Critical | 7 | +2.0 | 11.5 |
| P1 High | 20 | +1.5 | 15 |
| P2 Medium | 30 | +0.7 | 12 |
| P3 Low | 17 | +0.3 | 6 |
| Architecture | - | +0.5 | 6 |
| **Total** | **74** | **+5.0** | **50.5** |

**Note:** P0-007 removed as invalid (postDeathCleanup is already safe).

---

# PART 1: COMPLETE ISSUE REGISTRY

## P0 Critical Issues (7)

### P0-001: PlayerId Spoofing in Entity Event Handler

**File:** `packages/server/src/systems/ServerNetwork/handlers/entities.ts:69`

**Current Code:**
```typescript
// Line 69: Only sets playerId if client DIDN'T provide one
if (payloadObj && !payloadObj.playerId && socket.player?.id) {
  return { ...payloadObj, playerId: socket.player.id };
}
return payload;  // Client playerId TRUSTED - BUG!
```

**Fix:**
```typescript
// ALWAYS override playerId from authenticated socket - NEVER trust client
if (payloadObj && socket.player?.id) {
  return { ...payloadObj, playerId: socket.player.id };
}
return payload;
```

**Effort:** 5 minutes
**Dependencies:** None
**Verification:**
1. Send entity event with spoofed playerId
2. Verify server uses socket.player.id instead

---

### P0-002: TOCTOU Race + Missing Confirmation Events

**File:** `packages/shared/src/entities/world/HeadstoneEntity.ts:219-295`

**Current State:**
The code already has `lootQueue` that serializes requests (line 77, 208). However:
1. No transaction ID tracking for client confirmation
2. No explicit confirmation/rejection events emitted
3. Client has no way to know if loot succeeded

**Fix - Add Transaction ID and Events:**
```typescript
// In processLootRequest (around line 219)
private async processLootRequest(data: {
  playerId: string;
  itemId: string;
  quantity: number;
  transactionId?: string;  // NEW: Optional transaction ID from client
}): Promise<void> {
  const { playerId, itemId, quantity, transactionId } = data;

  // Existing protection check (line 226)
  if (!this.canPlayerLoot(playerId)) {
    // NEW: Emit rejection event
    if (transactionId) {
      this.world.emit(EventType.LOOT_RESULT, {
        transactionId,
        success: false,
        reason: 'protected',
        playerId,
      });
    }
    return;
  }

  // Existing item find logic (lines 236-247)
  const itemIndex = this.lootItems.findIndex(
    item => item.itemId === itemId && item.quantity >= quantity
  );

  if (itemIndex === -1) {
    if (transactionId) {
      this.world.emit(EventType.LOOT_RESULT, {
        transactionId,
        success: false,
        reason: 'item_not_found',
        playerId,
      });
    }
    return;
  }

  // Existing removal logic (lines 273-282)
  const removed = this.removeItem(itemIndex, quantity);

  // Existing inventory add (lines 285-294)
  this.world.emit(EventType.INVENTORY_ADD_ITEM, {
    playerId,
    itemId: removed.itemId,
    quantity: removed.quantity,
  });

  // NEW: Emit success confirmation
  if (transactionId) {
    this.world.emit(EventType.LOOT_RESULT, {
      transactionId,
      success: true,
      itemId: removed.itemId,
      quantity: removed.quantity,
      playerId,
    });
  }
}
```

**Also Required - Add EventType:**
```typescript
// In packages/shared/src/types/events.ts (or wherever EventType is defined)
LOOT_RESULT = "loot:result",
```

**Effort:** 2 hours
**Dependencies:** None
**Verification:**
1. Send loot request with transactionId
2. Verify LOOT_RESULT event emitted with correct transactionId
3. Verify rejection events for protected/missing items

---

### P0-003: No Items Stored in playerDeaths for Crash Recovery

**File:** `packages/server/src/database/schema.ts:717-739`

**Current Schema (verified):**
```typescript
export const playerDeaths = pgTable("player_deaths", {
  playerId: text("playerId").primaryKey(),  // Missing FK!
  gravestoneId: text("gravestoneId"),
  groundItemIds: text("groundItemIds"),  // Only IDs, not full items
  position: text("position"),  // Should be JSON typed
  timestamp: bigint("timestamp", { mode: "number" }),
  zoneType: text("zoneType"),
  itemCount: integer("itemCount").default(0),
  // MISSING: items, killedBy, recovered
});
```

**Fix - Schema Update:**
```typescript
export const playerDeaths = pgTable("player_deaths", {
  id: serial("id").primaryKey(),
  playerId: text("playerId").notNull().references(() => characters.id),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  position: json("position").$type<{ x: number; y: number; z: number }>().notNull(),
  zoneType: text("zoneType").notNull(),
  itemCount: integer("itemCount").default(0).notNull(),
  items: json("items").$type<Array<{ itemId: string; quantity: number }>>().notNull().default([]),
  gravestoneId: text("gravestoneId"),
  killedBy: text("killedBy").notNull().default('unknown'),
  recovered: boolean("recovered").default(false).notNull(),
});
```

**Fix - Migration:**
```sql
-- Migration: 0015_add_death_recovery_columns.sql

-- Add new columns
ALTER TABLE player_deaths ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]';
ALTER TABLE player_deaths ADD COLUMN IF NOT EXISTS killed_by TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE player_deaths ADD COLUMN IF NOT EXISTS recovered BOOLEAN NOT NULL DEFAULT FALSE;

-- Add foreign key (if not exists)
ALTER TABLE player_deaths
  ADD CONSTRAINT fk_player_deaths_character
  FOREIGN KEY (player_id) REFERENCES characters(id) ON DELETE CASCADE;

-- Add CHECK constraints
ALTER TABLE player_deaths ADD CONSTRAINT chk_zone_type
  CHECK ("zoneType" IN ('safe_area', 'wilderness', 'pvp_zone'));
ALTER TABLE player_deaths ADD CONSTRAINT chk_item_count
  CHECK ("itemCount" >= 0);

-- Index for recovery queries
CREATE INDEX IF NOT EXISTS idx_player_deaths_unrecovered
  ON player_deaths (player_id) WHERE recovered = FALSE;
```

**Effort:** 4 hours (includes migration testing)
**Dependencies:** None
**Verification:**
1. Run migration
2. Insert death record with items
3. Query back and verify items JSON is intact

---

### P0-004: Memory Updated Before Database in DeathStateManager

**File:** `packages/shared/src/systems/shared/death/DeathStateManager.ts:127-158`

**Current Code (verified):**
```typescript
async createDeathLock(playerId: string, data: DeathLockData): Promise<void> {
  // Line 128: Memory FIRST
  this.activeDeaths.set(playerId, deathData);

  // Lines 131-158: Database SECOND (only if databaseSystem exists)
  if (this.databaseSystem) {
    await this.databaseSystem.insert(...);
  }
}
```

**Problem:** If server crashes after memory set but before database write, items are lost.

**Fix:**
```typescript
async createDeathLock(playerId: string, data: DeathLockData): Promise<void> {
  // DATABASE FIRST - ensures crash recovery
  if (this.databaseSystem) {
    await this.databaseSystem.insert(playerDeaths, {
      playerId,
      timestamp: Date.now(),
      position: data.position,
      zoneType: data.zoneType,
      itemCount: data.itemCount,
      items: data.items,  // NEW: Store actual items
      gravestoneId: data.gravestoneId,
      killedBy: data.killedBy,
      recovered: false,
    });
  }

  // Memory SECOND - only after database confirms
  this.activeDeaths.set(playerId, deathData);
}
```

**Effort:** 30 minutes
**Dependencies:** P0-003 (schema must have items column)
**Verification:**
1. Set breakpoint after database insert, before memory set
2. Kill server
3. Restart - verify database has record, memory doesn't (expected)
4. Verify recovery logic finds the record

---

### P0-005: No Server Startup Death Recovery

**File:** `packages/shared/src/systems/shared/death/DeathStateManager.ts:66-88`

**Current `init()` Method (verified):**
```typescript
init(): void {
  this.entityManager = this.world.getSystem("entity-manager");
  this.databaseSystem = this.world.getSystem("database");
  // NO recovery logic!
}
```

**Fix - Add Recovery:**
```typescript
async init(): Promise<void> {
  this.entityManager = this.world.getSystem("entity-manager");
  this.databaseSystem = this.world.getSystem("database");

  // Recover unfinished deaths on server startup
  if (this.world.isServer && this.databaseSystem) {
    await this.recoverUnfinishedDeaths();
  }
}

private async recoverUnfinishedDeaths(): Promise<void> {
  const unrecovered = await this.databaseSystem.query(
    sql`SELECT * FROM player_deaths WHERE recovered = FALSE`
  );

  console.log(`[DeathStateManager] Found ${unrecovered.length} unrecovered deaths`);

  for (const death of unrecovered) {
    try {
      await this.recoverDeath(death);
      console.log(`[DeathStateManager] Recovered death for ${death.playerId}`);
    } catch (error) {
      console.error(`[DeathStateManager] Failed to recover death for ${death.playerId}:`, error);
    }
  }
}

private async recoverDeath(deathRecord: PlayerDeathRecord): Promise<void> {
  const items = deathRecord.items as InventoryItem[];

  if (items.length === 0) {
    // No items to recover - mark as recovered
    await this.markRecovered(deathRecord.id);
    return;
  }

  // Re-spawn gravestone with items
  if (deathRecord.zoneType === 'safe_area') {
    const handler = this.world.getSystem("safe-area-death-handler") as SafeAreaDeathHandler;
    if (handler) {
      await handler.handleDeath(
        deathRecord.playerId,
        deathRecord.position,
        items,
        deathRecord.killedBy || "unknown",
      );
    }
  } else {
    // Wilderness - spawn as ground items
    const groundItemSystem = this.world.getSystem("ground-items") as GroundItemSystem;
    if (groundItemSystem) {
      await groundItemSystem.spawnGroundItems(items, deathRecord.position, {
        despawnTime: COMBAT_CONSTANTS.GROUND_ITEM_DESPAWN_TICKS * 600,
        droppedBy: deathRecord.playerId,
      });
    }
  }

  await this.markRecovered(deathRecord.id);
}

private async markRecovered(deathId: number): Promise<void> {
  await this.databaseSystem.update(playerDeaths)
    .set({ recovered: true })
    .where(eq(playerDeaths.id, deathId));
}
```

**Effort:** 1.5 hours
**Dependencies:** P0-003, P0-004
**Verification:**
1. Create death with items
2. Kill server before gravestone fully spawns
3. Restart server
4. Verify gravestone exists with correct items
5. Verify death record marked as recovered

---

### P0-006: No Shadow State for Loot Operations

**File:** `packages/client/src/game/panels/LootWindow.tsx:24, 104-133`

**Current Code (verified):**
```typescript
// Line 24: Only React state, no pending tracking
const [items, setItems] = useState<InventoryItem[]>(lootItems);

// Line 132: Optimistic remove with NO transaction tracking
setItems((prev) => prev.filter((_, i) => i !== index));
// No rollback capability!
```

**Fix:**
```typescript
// Add types
interface PendingLoot {
  transactionId: string;
  itemId: string;
  timestamp: number;
  rollbackSnapshot: InventoryItem[];
}

// Add state
const [pendingLoots, setPendingLoots] = useState<Map<string, PendingLoot>>(new Map());
const [displayItems, setDisplayItems] = useState<InventoryItem[]>(lootItems);

// Generate transaction ID
const generateTransactionId = () =>
  `loot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// Updated handleTakeItem
const handleTakeItem = (item: InventoryItem, index: number) => {
  const localPlayer = world.getPlayer();
  if (!localPlayer) return;

  const transactionId = generateTransactionId();

  // Store rollback state BEFORE optimistic update
  setPendingLoots(prev => {
    const next = new Map(prev);
    next.set(transactionId, {
      transactionId,
      itemId: item.itemId,
      timestamp: Date.now(),
      rollbackSnapshot: [...displayItems],
    });
    return next;
  });

  // Optimistic update
  setDisplayItems(prev => prev.filter((_, i) => i !== index));

  // Send with transaction ID
  world.network.send("entityEvent", {
    id: corpseId,
    event: EventType.CORPSE_LOOT_REQUEST,
    payload: {
      transactionId,
      corpseId,
      playerId: localPlayer.id,
      itemId: item.itemId,
      quantity: item.quantity,
    },
  });
};

// Event handlers for server responses
useEffect(() => {
  const handleLootResult = (data: {
    transactionId: string;
    success: boolean;
    reason?: string;
    playerId: string;
  }) => {
    // Only handle our transactions
    const pending = pendingLoots.get(data.transactionId);
    if (!pending) return;

    if (data.success) {
      // Server confirmed - remove from pending, keep optimistic state
      setPendingLoots(prev => {
        const next = new Map(prev);
        next.delete(data.transactionId);
        return next;
      });
    } else {
      // Server rejected - rollback to snapshot
      setDisplayItems(pending.rollbackSnapshot);
      setPendingLoots(prev => {
        const next = new Map(prev);
        next.delete(data.transactionId);
        return next;
      });
      // Show error toast
      console.warn(`Loot failed: ${data.reason}`);
    }
  };

  world.on(EventType.LOOT_RESULT, handleLootResult);

  return () => {
    world.off(EventType.LOOT_RESULT, handleLootResult);
  };
}, [pendingLoots, displayItems]);

// Timeout fallback for lost messages
useEffect(() => {
  const TIMEOUT_MS = 5000;
  const checkTimeouts = setInterval(() => {
    const now = Date.now();
    setPendingLoots(prev => {
      let hasChanges = false;
      const next = new Map(prev);

      for (const [txId, pending] of prev) {
        if (now - pending.timestamp > TIMEOUT_MS) {
          // Timed out - rollback
          setDisplayItems(pending.rollbackSnapshot);
          next.delete(txId);
          hasChanges = true;
          console.warn(`Loot request ${txId} timed out, rolling back`);
        }
      }

      return hasChanges ? next : prev;
    });
  }, 1000);

  return () => clearInterval(checkTimeouts);
}, []);
```

**Effort:** 3 hours
**Dependencies:** P0-002 (server must emit LOOT_RESULT events)
**Verification:**
1. Click loot while server is throttled/slow
2. Verify item disappears optimistically
3. Verify rollback on rejection/timeout
4. Verify pending indicator (optional enhancement)

---

### P0-007: Missing Death Operation Audit Logging

**Files:**
- `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
- `packages/shared/src/entities/world/HeadstoneEntity.ts`
- `packages/shared/src/types/events.ts` (add EventType.AUDIT_LOG)

**Note:** The original P0-007 (transaction atomicity) was removed as invalid - `postDeathCleanup` does no database operations.

**Fix - Add EventType:**
```typescript
// In types/events.ts
AUDIT_LOG = "audit:log",
```

**Fix - PlayerDeathSystem:**
```typescript
// Add after successful death processing (around line 450)
private auditDeath(
  playerId: string,
  items: InventoryItem[],
  killedBy: string,
  zoneType: ZoneType,
  position: Position
): void {
  if (!this.world.isServer) return;

  this.world.emit(EventType.AUDIT_LOG, {
    type: 'PLAYER_DEATH',
    timestamp: Date.now(),
    playerId,
    killedBy,
    zoneType,
    position,
    itemCount: items.length,
    items: items.map(i => ({ itemId: i.itemId, quantity: i.quantity })),
  });
}
```

**Fix - HeadstoneEntity (after successful loot):**
```typescript
// Add after line 294 (successful inventory add)
this.world.emit(EventType.AUDIT_LOG, {
  type: 'CORPSE_LOOT',
  timestamp: Date.now(),
  looterId: data.playerId,
  corpseOwner: this.config.headstoneData.playerId,
  itemId: removed.itemId,
  quantity: removed.quantity,
  gravestoneId: this.config.id,
});
```

**Effort:** 2 hours
**Dependencies:** None
**Verification:**
1. Die with items
2. Loot gravestone
3. Check audit log contains PLAYER_DEATH and CORPSE_LOOT entries

---

## P1 High Priority Issues (20)

### P1-001: Transaction Isolation Level Missing (CORRECTED)

**File:** `packages/server/src/systems/DatabaseSystem/index.ts:245`

**IMPORTANT:** Drizzle ORM does NOT support isolation level as a parameter to `transaction()`.

**Wrong (v1.0 plan):**
```typescript
await db.transaction(async (tx) => { ... }, { isolationLevel: 'serializable' })
```

**Correct Fix:**
```typescript
async executeInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return await this.db.transaction(async (tx) => {
    // Set isolation level as first operation in transaction
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    return await fn(tx);
  });
}
```

**Alternative - Connection Pool Level:**
```typescript
// In pool configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Set default isolation for all connections
  options: '-c default_transaction_isolation=serializable',
});
```

**Effort:** 30 min
**Dependencies:** None

---

### P1-002: 100ms Polling Instead of Event-Driven

**File:** `packages/client/src/game/panels/LootWindow.tsx:34-99`

**Current (verified):**
```typescript
const updateInterval = setInterval(() => {
  // Poll every 100ms for loot updates
}, 100);
```

**Fix:** Replace polling with event listeners (already covered in P0-006).

**Effort:** Included in P0-006
**Dependencies:** P0-002, P0-006

---

### P1-003: No Loot Request Rate Limiting

**File:** `packages/shared/src/entities/world/HeadstoneEntity.ts:207-213`

**Fix:**
```typescript
private lootRateLimiter = new Map<string, number>();
private readonly LOOT_RATE_LIMIT_MS = 100;

private handleLootRequest(data: {...}): void {
  const now = Date.now();
  const lastRequest = this.lootRateLimiter.get(data.playerId) || 0;

  if (now - lastRequest < this.LOOT_RATE_LIMIT_MS) {
    // Rate limited - emit rejection if transactionId provided
    if (data.transactionId) {
      this.world.emit(EventType.LOOT_RESULT, {
        transactionId: data.transactionId,
        success: false,
        reason: 'rate_limited',
        playerId: data.playerId,
      });
    }
    return;
  }

  this.lootRateLimiter.set(data.playerId, now);
  this.lootQueue = this.lootQueue.then(() => this.processLootRequest(data));
}
```

**Effort:** 30 min
**Dependencies:** P0-002 (for LOOT_RESULT event)

---

### P1-004: Integer Overflow in Respawn Tick

**File:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts:558-559`

**Fix:**
```typescript
const respawnTick = currentTick + COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS;
if (!Number.isSafeInteger(respawnTick)) {
  console.error('[PlayerDeathSystem] Tick overflow detected, using fallback');
  typedPlayerEntity.data.respawnTick = COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS;
} else {
  typedPlayerEntity.data.respawnTick = respawnTick;
}
```

**Effort:** 15 min
**Dependencies:** None

---

### P1-005: No CHECK Constraints on playerDeaths

**Merged into P0-003 migration.**

---

### P1-006: Death Constants Not Manifest-Driven

**File:** `packages/shared/src/constants/CombatConstants.ts:63-78`

**Current (verified):**
```typescript
RESPAWN_TICKS_RANDOMNESS: 8,
GRAVESTONE_TICKS: 1500,
GROUND_ITEM_DESPAWN_TICKS: 300,
DEATH: {
  ANIMATION_TICKS: 7,
  COOLDOWN_TICKS: 17,
  DEFAULT_RESPAWN_POSITION: { x: 0, y: 0, z: 0 },
  DEFAULT_RESPAWN_TOWN: "Central Haven",
}
```

**Fix - Create Manifest:**
```json
// packages/server/world/assets/manifests/death-mechanics.json
{
  "$schema": "./death-mechanics.schema.json",
  "version": "1.0.0",
  "timing": {
    "animationTicks": 7,
    "cooldownTicks": 17,
    "gravestoneTicks": 1500,
    "groundItemDespawnTicks": 300,
    "respawnRandomnessTicks": 8
  },
  "respawnPoints": {
    "default": {
      "position": { "x": 0, "y": 10, "z": 0 },
      "town": "Central Haven"
    }
  },
  "zones": {
    "safe_area": {
      "mechanic": "gravestone",
      "lootProtectionTicks": 0
    },
    "wilderness": {
      "mechanic": "ground_drop",
      "lootProtectionTicks": 100
    },
    "pvp_zone": {
      "mechanic": "ground_drop",
      "lootProtectionTicks": 50
    }
  }
}
```

**Effort:** 4 hours (includes loader and integration)
**Dependencies:** None

---

### P1-007 through P1-020

*(Remaining P1 issues unchanged from v1.0 - see original document)*

---

## P2 Medium Priority Issues (30)

### P2-001: Long Function - processPlayerDeath (137 lines) (CORRECTED)

**File:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts:373-509`

**Note:** v1.0 incorrectly named this as `handlePlayerDeath`. The actual long function is `processPlayerDeath`.

**Fix:** Extract into focused functions:
- `validateDeathConditions()` - ~20 lines
- `calculateItemsToDrop()` - ~30 lines
- `persistDeathState()` - ~25 lines
- `spawnDeathEntities()` - ~30 lines
- `emitDeathEvents()` - ~20 lines

**Effort:** 1.5 hours
**Dependencies:** None

---

### P2-006: Scattered Maps with Same Key (CORRECTED)

**File:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts:108-128`

**Actual Maps (6, not 5):**
```typescript
private deathLocations = new Map<string, DeathLocationData>();
private respawnTimers = new Map<string, NodeJS.Timeout>();
private playerPositions = new Map<string, {...}>();
private playerInventories = new Map<string, {...}>();
private pendingGravestones = new Map<string, {...}>();
private lastDeathTime = new Map<string, number>();
```

**Fix:** Consolidate into DeathComponent on player entity.

**Effort:** 2.5 hours
**Dependencies:** None

---

### P2-015: Inconsistent Naming - corpseId vs gravestoneId (VERIFIED)

**Confirmed inconsistency:**
- HeadstoneEntity uses `corpseId` in events
- Database schema uses `gravestoneId`
- PlayerDeathSystem uses `gravestoneId`

**Fix:** Standardize on `gravestoneId` everywhere.

**Effort:** 1 hour
**Dependencies:** None

---

*(Remaining P2/P3 issues unchanged from v1.0)*

---

# PART 2: DEPENDENCY GRAPH (CORRECTED)

```
Phase 0: Foundation (No Dependencies)
├── P0-001: PlayerId Spoofing Fix
├── P1-003: Loot Rate Limiting (basic, no events)
├── P1-004: Integer Overflow
└── P0-007: Audit Logging (EventType must be added)

Phase 1: Schema Changes
└── P0-003: Add items Column + CHECK Constraints + FK

Phase 2: Core Recovery
├── P0-004: Database-First Persistence ←── P0-003
└── P0-005: Server Startup Recovery ←── P0-003, P0-004

Phase 3: Event System
├── P0-002: Add Transaction IDs + LOOT_RESULT Events ←── (Phase 2 complete)
└── P1-001: Transaction Isolation Level

Phase 4: Client Architecture
├── P0-006: Shadow State ←── P0-002 (requires LOOT_RESULT events)
├── P1-002: Remove Polling ←── P0-006 (included in P0-006)
└── P1-003: Rate Limiting with Events ←── P0-002

Phase 5: Anti-Cheat & Monitoring
├── P1-008: Automation Detection
├── P1-016: Connection Metrics
└── P1-017: Query Timeout

Phase 6: P2 Refactoring (after all P0/P1)
└── All P2 issues

Phase 7: P3 Polish (after all P2)
└── All P3 issues
```

**Key Clarifications:**
- P0-002 MUST complete before P0-006 (client needs server events)
- P0-003 MUST complete before P0-004/P0-005 (schema must exist)
- P1-001 can be done anytime (isolated database change)

---

# PART 3: TESTING STRATEGY (CORRECTED)

## Existing Tests (78 tests - DO NOT RECREATE)

| File | Location | Tests |
|------|----------|-------|
| DeathStateManager.test.ts | `shared/src/systems/shared/death/__tests__/` | 28 |
| SafeAreaDeathHandler.test.ts | `shared/src/systems/shared/death/__tests__/` | 20 |
| WildernessDeathHandler.test.ts | `shared/src/systems/shared/death/__tests__/` | 14 |
| PvPDeath.integration.test.ts | `shared/src/systems/shared/death/__tests__/` | 16 |

## New Tests Needed (~70 tests)

| File | Location | Tests | Purpose |
|------|----------|-------|---------|
| PlayerDeathSystem.test.ts | `shared/src/systems/shared/combat/__tests__/` | 20 | P0-007, P2-001 |
| HeadstoneEntity.test.ts | `shared/src/entities/world/__tests__/` | 25 | P0-002, P1-003 |
| LootWindow.test.tsx | `client/tests/unit/panels/` | 15 | P0-006 |
| death-security.test.ts | `server/tests/security/` | 10 | P0-001 |

**Total: ~148 tests** (78 existing + 70 new)

**Correct File Structure:**
- Shared package: Use `__tests__/` colocated with source
- Server/Client: Use separate `tests/unit/`, `tests/integration/`, `tests/e2e/` folders

---

# PART 4: VERIFICATION CRITERIA (UNCHANGED)

*(See v1.0 document)*

---

# PART 5: REMOVED/INVALID ISSUES

## P0-007 (v1.0): Transaction Atomicity Gap - REMOVED

**Original Claim:** `postDeathCleanup` runs outside transaction, causing crash recovery issues.

**Investigation Result:** `postDeathCleanup` (lines 517-604) only:
- Updates entity state (`entity.data.isDead = true`)
- Sets timers (`respawnTimers.set()`)
- Emits events (`this.world.emit()`)

**None of these are database operations.** The actual database work (inventory clear, death lock creation) IS inside the transaction. Moving `postDeathCleanup` inside the transaction would have no effect on crash recovery.

**Status:** Issue removed from P0 list. Original P0-008 (audit logging) renumbered to P0-007.

---

# APPENDIX: QUICK REFERENCE

## Files Modified (by priority)

### P0
- `packages/server/src/systems/ServerNetwork/handlers/entities.ts` (P0-001)
- `packages/shared/src/entities/world/HeadstoneEntity.ts` (P0-002)
- `packages/server/src/database/schema.ts` (P0-003)
- `packages/shared/src/systems/shared/death/DeathStateManager.ts` (P0-004, P0-005)
- `packages/client/src/game/panels/LootWindow.tsx` (P0-006)
- `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts` (P0-007)
- `packages/shared/src/types/events.ts` (P0-002, P0-007 - add EventTypes)

### P1
- `packages/server/src/systems/DatabaseSystem/index.ts` (P1-001)
- `packages/shared/src/constants/CombatConstants.ts` (P1-006)
- `packages/server/world/assets/manifests/death-mechanics.json` (P1-006 - new file)

## Commands

```bash
# Run existing death system tests
bun test --grep "Death|death|Gravestone|gravestone"

# Run specific test file
bun test packages/shared/src/systems/shared/death/__tests__/DeathStateManager.test.ts

# Verify all tests pass
bun test && echo "All tests passing"
```

---

**Document Version:** 2.0 (Validated)
**Validation Status:** Complete
**Ready for Implementation:** Yes
**Review Required:** No (corrections applied)
