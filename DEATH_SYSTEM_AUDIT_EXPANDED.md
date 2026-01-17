# Death System Audit: Expanded Criteria Review

**Audit Date:** 2026-01-17
**Previous Score:** 5.2/10
**Updated Score:** 5.0/10 (expanded criteria reduced score)
**Target Score:** 9.0/10
**Status:** Re-reviewed with expanded criteria (Client Responsiveness, PostgreSQL Discipline, Manifest-Driven Architecture)

---

## Executive Summary

The expanded review criteria revealed **significant new gaps** in three previously unaudited areas:

| New Criteria Section | Score | Impact |
|---------------------|-------|--------|
| Client Responsiveness Principles | 3.3/10 | **CRITICAL** - No shadow state, no rollback |
| PostgreSQL Discipline | 6.2/10 | **HIGH** - Missing isolation levels, constraints |
| Manifest-Driven Data Architecture | 6.8/10 | **MEDIUM** - Constants hardcoded, not data-driven |
| Economic Integrity & Anti-Cheat | 6.5/10 | **HIGH** - Audit logging gaps, automation detection missing |

### Updated Issue Count

| Priority | Previous | New | Total | Score Impact |
|----------|----------|-----|-------|--------------|
| **P0 Critical** | 5 | 3 | 8 | +2.0 points |
| **P1 High** | 12 | 8 | 20 | +1.5 points |
| **P2 Medium** | 18 | 12 | 30 | +1.0 points |
| **P3 Low** | 11 | 6 | 17 | +0.3 points |
| **Total** | **46** | **29** | **75** | **+4.8 points** |

---

# NEW CRITICAL ISSUES (P0)

## P0-006: No Shadow State for Loot Operations

### Location
**File:** `packages/client/src/game/panels/LootWindow.tsx`
**Lines:** 24, 104-133

### Current Code
```typescript
// Line 24: Only React state, no shadow/pending tracking
const [items, setItems] = useState<InventoryItem[]>(lootItems);

// Lines 131-132: Optimistic remove with NO transaction ID
setItems((prev) => prev.filter((_, i) => i !== index));
// No: pendingLootRequests.add(transactionId)
// No: shadowState.markPending(itemId)
// No: rollbackTarget = currentItems
```

### Problem
1. Client removes item from UI immediately (optimistic)
2. No transaction ID links request to response
3. No rollback capability if server rejects
4. No pending state tracking
5. Server rejection causes "item reappears" visual glitch

### Attack Vector
```
1. Click loot rapidly 10x on same item
2. Client sends 10 separate requests
3. Server processes first, rejects 2-9 (item gone)
4. Client UI already removed item on click 1
5. Clicks 2-9 have no visual feedback - confusing UX
```

### Implementation Fix

**Step 1:** Add pending transaction state
```typescript
// Add to LootWindow.tsx after line 24
interface PendingLoot {
  transactionId: string;
  itemId: string;
  timestamp: number;
  rollbackItems: InventoryItem[];
}

const [pendingLoots, setPendingLoots] = useState<Map<string, PendingLoot>>(new Map());
const [shadowItems, setShadowItems] = useState<InventoryItem[]>(lootItems);
```

**Step 2:** Update handleTakeItem
```typescript
const handleTakeItem = (item: InventoryItem, index: number) => {
  const localPlayer = world.getPlayer();
  if (!localPlayer) return;

  // Generate transaction ID
  const transactionId = `loot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Store rollback state
  setPendingLoots(prev => {
    const next = new Map(prev);
    next.set(transactionId, {
      transactionId,
      itemId: item.itemId,
      timestamp: Date.now(),
      rollbackItems: [...items],
    });
    return next;
  });

  // Update shadow state (optimistic)
  setShadowItems(prev => prev.filter((_, i) => i !== index));

  // Send with transaction ID
  world.network.send("entityEvent", {
    id: "world",
    event: EventType.CORPSE_LOOT_REQUEST,
    payload: {
      transactionId,  // NEW: Server can reference this in response
      corpseId,
      playerId: localPlayer.id,
      itemId: item.itemId,
      quantity: item.quantity,
    },
  });

  // Timeout: rollback if no response in 5 seconds
  setTimeout(() => {
    setPendingLoots(prev => {
      const pending = prev.get(transactionId);
      if (pending) {
        // Rollback shadow state
        setShadowItems(pending.rollbackItems);
        const next = new Map(prev);
        next.delete(transactionId);
        return next;
      }
      return prev;
    });
  }, 5000);
};
```

---

## P0-007: Death Transaction Atomicity Gap

### Location
**File:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
**Lines:** 430-501

### Current Code
```typescript
// Line 430-498: Inside transaction
await databaseSystem.executeInTransaction(async (tx) => {
  // ... inventory clear, death lock creation
  await inventorySystem.clearInventoryImmediate(playerId);  // Line 493
  if (equipmentSystem) {
    await equipmentSystem.clearEquipmentImmediate(playerId);  // Line 496
  }
});

// Line 501: OUTSIDE TRANSACTION!
this.postDeathCleanup(playerId, deathPosition, itemsToDrop, killedBy);
```

### Problem
Server crash between line 499 (transaction ends) and line 501 (cleanup):
- Transaction committed: inventory cleared, death lock created
- `postDeathCleanup()` never runs: no death animation, no respawn timer
- Player stuck in limbo with empty inventory

### Implementation Fix
```typescript
// Move postDeathCleanup INSIDE transaction callback
await databaseSystem.executeInTransaction(async (tx) => {
  // ... existing logic ...

  await inventorySystem.clearInventoryImmediate(playerId);
  if (equipmentSystem) {
    await equipmentSystem.clearEquipmentImmediate(playerId);
  }

  // NOW INSIDE: Death cleanup is atomic with inventory clear
  this.postDeathCleanup(playerId, deathPosition, itemsToDrop, killedBy);
});
```

---

## P0-008: Missing Death Operation Audit Logging

### Location
**Files:**
- `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
- `packages/shared/src/entities/world/HeadstoneEntity.ts`

### Problem
No audit trail for:
- Which player died with which items
- Which player looted which items
- Value of items transferred
- Zone type and killer identity

**Evidence:**
- PlayerDeathSystem.ts:501 - No audit log call
- HeadstoneEntity.ts:285-294 - Item added via event, no logging
- DeathStateManager.ts:145-147 - Only console.log

### Impact
- Cannot investigate item duplication reports
- Cannot detect RMT (Real Money Trading) patterns
- Cannot identify bot farming operations

### Implementation Fix

**Step 1:** Add audit function to PlayerDeathSystem
```typescript
private auditDeath(playerId: string, items: InventoryItem[], killedBy: string, zoneType: ZoneType): void {
  if (!this.world.isServer) return;

  const auditEntry = {
    type: 'PLAYER_DEATH',
    timestamp: Date.now(),
    playerId,
    killedBy,
    zoneType,
    itemCount: items.length,
    items: items.map(i => ({ itemId: i.itemId, quantity: i.quantity })),
    totalValue: items.reduce((sum, i) => sum + this.getItemValue(i), 0),
  };

  // Emit to audit system
  this.world.emit(EventType.AUDIT_LOG, auditEntry);
  console.log(`[AUDIT] Death: ${playerId} killed by ${killedBy}, ${items.length} items dropped`);
}
```

**Step 2:** Add to HeadstoneEntity loot
```typescript
// After line 294 in processLootRequest
this.world.emit(EventType.AUDIT_LOG, {
  type: 'CORPSE_LOOT',
  timestamp: Date.now(),
  looterId: data.playerId,
  corpseOwner: this.config.headstoneData.playerId,
  itemId: data.itemId,
  quantity: quantityToLoot,
});
```

---

# NEW HIGH PRIORITY ISSUES (P1)

## P1-013: No Transaction Isolation Level for Concurrent Deaths

### Location
**File:** `packages/server/src/systems/DatabaseSystem/index.ts`
**Lines:** 236-246

### Current Code
```typescript
async executeInTransaction(fn: (tx) => Promise<void>): Promise<void> {
  await db.transaction(async (tx) => {  // NO isolation level!
    await fn(tx);
  });
}
```

### Problem
PostgreSQL defaults to READ COMMITTED isolation. Two concurrent deaths for same player:
- Both pass `hasActiveDeathLock()` check
- Both create death locks
- Race condition: duplicate items possible

### Fix
```typescript
await db.transaction(async (tx) => {
  await fn(tx);
}, { isolationLevel: 'serializable' });  // Prevent concurrent modifications
```

---

## P1-014: 100ms Polling Instead of Event-Driven Updates

### Location
**File:** `packages/client/src/game/panels/LootWindow.tsx`
**Lines:** 34-99

### Current Code
```typescript
const updateInterval = setInterval(() => {
  const gravestoneEntity = world.entities?.get(corpseId);
  // ... poll every 100ms
}, 100);
```

### Problem
- Wastes bandwidth: 10 requests/second per open loot window
- Scales poorly: 100 players = 1000 polls/second
- No event-driven confirmation

### Fix
```typescript
// Replace polling with event listeners
useEffect(() => {
  const handleLootConfirmed = (data: { transactionId: string; success: boolean }) => {
    setPendingLoots(prev => {
      const next = new Map(prev);
      next.delete(data.transactionId);
      return next;
    });
    if (data.success) {
      // Server confirmed, shadow state is now real state
      setItems(shadowItems);
    }
  };

  const handleLootRejected = (data: { transactionId: string; reason: string }) => {
    const pending = pendingLoots.get(data.transactionId);
    if (pending) {
      // Rollback to pre-loot state
      setShadowItems(pending.rollbackItems);
    }
  };

  world.on('loot:confirmed', handleLootConfirmed);
  world.on('loot:rejected', handleLootRejected);

  return () => {
    world.off('loot:confirmed', handleLootConfirmed);
    world.off('loot:rejected', handleLootRejected);
  };
}, []);
```

---

## P1-015: No Loot Request Rate Limiting

### Location
**File:** `packages/shared/src/entities/world/HeadstoneEntity.ts`
**Lines:** 192-213

### Current Code
```typescript
private handleLootRequest(data: {...}): void {
  // No rate limit check!
  this.lootQueue = this.lootQueue.then(() => this.processLootRequest(data));
}
```

### Problem
- Player can spam-click loot button
- Sends 50+ requests per second
- Server processes all, wasting resources

### Fix
```typescript
private lootRateLimiter = new Map<string, number>();
private readonly LOOT_RATE_LIMIT_MS = 100;

private handleLootRequest(data: {...}): void {
  const now = Date.now();
  const lastRequest = this.lootRateLimiter.get(data.playerId) || 0;
  if (now - lastRequest < this.LOOT_RATE_LIMIT_MS) {
    return; // Rate limited
  }
  this.lootRateLimiter.set(data.playerId, now);

  this.lootQueue = this.lootQueue.then(() => this.processLootRequest(data));
}
```

---

## P1-016: Integer Overflow in Respawn Tick Calculation

### Location
**File:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
**Lines:** 558-559

### Current Code
```typescript
typedPlayerEntity.data.respawnTick =
  currentTick + COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS;
// No overflow check!
```

### Problem
If `currentTick` approaches `Number.MAX_SAFE_INTEGER`, addition overflows.

### Fix
```typescript
const respawnTick = currentTick + COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS;
if (!Number.isSafeInteger(respawnTick)) {
  console.error('[PlayerDeathSystem] Tick overflow, using fallback');
  typedPlayerEntity.data.respawnTick = COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS;
} else {
  typedPlayerEntity.data.respawnTick = respawnTick;
}
```

---

## P1-017: No CHECK Constraints on playerDeaths Table

### Location
**File:** `packages/server/src/database/schema.ts`
**Lines:** 717-739

### Current Schema
```typescript
export const playerDeaths = pgTable("player_deaths", {
  zoneType: text("zoneType").notNull(),  // No constraint!
  itemCount: integer("itemCount").default(0).notNull(),  // Can be negative!
});
```

### Problem
- `zoneType` accepts any string, not just valid enum values
- `itemCount` can be negative if code has bug
- `timestamp` can be 0 or negative

### Fix - Add Migration
```sql
ALTER TABLE player_deaths
ADD CONSTRAINT chk_zone_type CHECK (
  "zoneType" IN ('safe_area', 'wilderness', 'pvp_zone')
);

ALTER TABLE player_deaths
ADD CONSTRAINT chk_item_count CHECK ("itemCount" >= 0);

ALTER TABLE player_deaths
ADD CONSTRAINT chk_timestamp CHECK ("timestamp" > 0);
```

---

## P1-018: Death Constants Not Manifest-Driven

### Location
**File:** `packages/shared/src/constants/CombatConstants.ts`
**Lines:** 65-78

### Current Code
```typescript
DEATH: {
  ANIMATION_TICKS: 7,           // Hardcoded!
  COOLDOWN_TICKS: 17,           // Hardcoded!
  DEFAULT_RESPAWN_POSITION: { x: 0, y: 0, z: 0 },  // Hardcoded!
  DEFAULT_RESPAWN_TOWN: "Central Haven",            // Hardcoded string!
}
```

### Problem
- Balance tuning requires code changes
- No versioning for constants
- Respawn position not per-zone configurable

### Fix - Create Manifest
```json
// packages/server/world/assets/manifests/death-mechanics.json
{
  "version": "1.0",
  "timing": {
    "animationTicks": 7,
    "cooldownTicks": 17,
    "gravestoneTicks": 1500,
    "groundItemDespawnTicks": 300
  },
  "respawnPoints": {
    "default": {
      "position": [0, 10, 0],
      "town": "Central Haven"
    }
  },
  "zones": {
    "safe_area": {
      "deathMechanics": "gravestone",
      "lootProtectionTicks": 0
    },
    "wilderness": {
      "deathMechanics": "ground_drop",
      "lootProtectionTicks": 100
    }
  }
}
```

---

## P1-019: No Batch Loot Operation

### Location
**File:** `packages/client/src/game/panels/LootWindow.tsx`
**Lines:** 135-170

### Current Code
```typescript
const handleTakeAll = () => {
  itemsToTake.forEach((item, index) => {
    world.network.send("entityEvent", {...});  // Separate message per item!
  });
  setItems([]);
};
```

### Problem
- 10 items = 10 network messages
- No atomic "loot all" operation
- Partial failure leaves inconsistent state

### Fix - Add Batch Handler
```typescript
// Client
const handleTakeAll = () => {
  world.network.send("entityEvent", {
    event: EventType.CORPSE_LOOT_ALL,  // NEW event type
    payload: {
      corpseId,
      playerId: localPlayer.id,
    },
  });
};

// Server (HeadstoneEntity.ts)
private handleLootAllRequest(playerId: string): void {
  for (const item of this.lootItems) {
    this.lootQueue = this.lootQueue.then(() =>
      this.processLootRequest({ playerId, itemId: item.itemId, quantity: item.quantity })
    );
  }
}
```

---

## P1-020: No Automation Detection for Death Farming

### Location
**File:** `packages/shared/src/systems/shared/death/DeathStateManager.ts`

### Problem
No detection for:
- Repeated deaths at same location (farming)
- Death→respawn cycles under 2 seconds
- Synchronized multi-account deaths
- Systematic loot collection patterns

### Fix - Add Pattern Tracking
```typescript
// Add to DeathStateManager
private deathPatterns = new Map<string, {
  locations: Array<{x: number, y: number, z: number}>,
  timestamps: number[],
  suspicionScore: number,
}>();

async trackDeathPattern(playerId: string, position: Position): Promise<void> {
  const pattern = this.deathPatterns.get(playerId) || {
    locations: [],
    timestamps: [],
    suspicionScore: 0,
  };

  pattern.timestamps.push(Date.now());
  pattern.locations.push(position);

  // Keep last 10 deaths
  if (pattern.timestamps.length > 10) {
    pattern.timestamps.shift();
    pattern.locations.shift();
  }

  // Check for suspicious patterns
  const recentDeaths = pattern.timestamps.filter(t => Date.now() - t < 60000);
  if (recentDeaths.length >= 5) {
    pattern.suspicionScore += 10;
    console.warn(`[AntiCheat] Player ${playerId} died ${recentDeaths.length}x in 1 minute`);
  }

  // Check location clustering
  const sameLocation = pattern.locations.filter(loc =>
    Math.abs(loc.x - position.x) < 5 && Math.abs(loc.z - position.z) < 5
  );
  if (sameLocation.length >= 3) {
    pattern.suspicionScore += 20;
    console.warn(`[AntiCheat] Player ${playerId} dying repeatedly at same location`);
  }

  if (pattern.suspicionScore >= 50) {
    this.world.emit(EventType.ANTI_CHEAT_ALERT, {
      playerId,
      type: 'DEATH_FARMING',
      score: pattern.suspicionScore,
    });
  }

  this.deathPatterns.set(playerId, pattern);
}
```

---

# SCORE BREAKDOWN BY CRITERIA

## Production Quality Code: 6/10
- Readability: 7/10 - Good naming, clear structure
- Error handling: 5/10 - Errors logged but not always propagated
- Performance: 7/10 - Tick-based, but polling in LootWindow
- Documentation: 6/10 - Inconsistent comments
- Type safety: 7/10 - Strong types but some `as unknown as`

## Best Practices: 5/10
- DRY: 6/10 - Some duplication between handlers
- KISS: 5/10 - Dual persistence adds complexity
- YAGNI: 7/10 - Focused implementation
- Testing: 3/10 - No unit tests for death system

## OWASP Security: 6/10
- Injection: 8/10 - No SQL injection (ORM)
- Auth: 7/10 - Server checks player ID
- Access Control: 6/10 - Loot protection works but rate limiting missing
- Input Validation: 5/10 - Quantity validated, but not all inputs

## Client Responsiveness: 3.3/10
- Feedback Classification: 3/10 - No transaction IDs
- Shadow State: 2/10 - No pending state tracking
- Optimistic Prediction: 2/10 - Hardcoded, no validation
- Batching: 4/10 - Take All sends individual messages
- Rejection Handling: 5/10 - Implicit rollback only
- Network Resilience: 4/10 - Polling-based, no offline queue

## PostgreSQL Discipline: 6.2/10
- Connection Management: 6/10 - Pool configured, no metrics
- Transaction Discipline: 7/10 - Transactions exist but no isolation level
- Query Performance: 7/10 - Indexes exist, JSON parsing overhead
- Data Integrity: 6/10 - FK constraints, no CHECK constraints
- Schema Design: 6/10 - JSON storage anti-pattern
- Operational Readiness: 5/10 - No query timeouts, monitoring

## Manifest-Driven Architecture: 6.8/10
- Core Principles: 7/10 - Constants centralized but hardcoded
- Schema Validation: 4/10 - No manifest schema
- Referential Integrity: 8/10 - Database FK, but string refs not validated
- No Magic Values: 6/10 - Most in constants, some scattered
- Versioning: 7/10 - DB migrations versioned, constants not
- Runtime Performance: 9/10 - Tick-based, cached lookups

## Economic Integrity: 6.5/10
- Transaction Atomicity: 8/10 - Transactions exist, boundary issues
- Server Authority: 9/10 - Excellent client rejection
- Rate Limiting: 6/10 - Death cooldown exists, loot missing
- Sequence Validation: 7/10 - Death lock prevents re-death
- Overflow Protection: 5/10 - Coins capped, items not
- Audit Logging: 4/10 - Missing for death operations

---

# PATH TO 9/10

## Phase 1: Critical Fixes (P0) - Score +2.0

| Issue | File | Effort | Impact |
|-------|------|--------|--------|
| P0-001 | entities.ts | 5 min | Security |
| P0-002 | HeadstoneEntity.ts | 2 hr | Item loss |
| P0-003 | schema.ts, DeathStateManager.ts | 4 hr | Crash recovery |
| P0-004 | DeathStateManager.ts | 30 min | Data consistency |
| P0-005 | DeathStateManager.ts | 1 hr | Crash recovery |
| P0-006 | LootWindow.tsx | 3 hr | UX, rollback |
| P0-007 | PlayerDeathSystem.ts | 1 hr | Atomicity |
| P0-008 | Multiple | 2 hr | Audit trail |

**Subtotal:** 13.5 hours, Score: 5.0 → 7.0

## Phase 2: High Priority (P1) - Score +1.5

| Issue | File | Effort | Impact |
|-------|------|--------|--------|
| P1-013 | DatabaseSystem | 30 min | Concurrency |
| P1-014 | LootWindow.tsx | 2 hr | Network efficiency |
| P1-015 | HeadstoneEntity.ts | 30 min | Rate limiting |
| P1-016 | PlayerDeathSystem.ts | 15 min | Overflow |
| P1-017 | schema.ts | 30 min | Data integrity |
| P1-018 | Manifest + loader | 4 hr | Balance tuning |
| P1-019 | Multiple | 2 hr | Batch operations |
| P1-020 | DeathStateManager.ts | 3 hr | Anti-cheat |

**Subtotal:** 12.75 hours, Score: 7.0 → 8.5

## Phase 3: Medium Priority (P2) - Score +0.5

- Function refactoring (long methods)
- SOLID principle improvements
- Additional test coverage
- Memory cleanup patterns

**Subtotal:** 15-20 hours, Score: 8.5 → 9.0+

---

# IMPLEMENTATION PRIORITY

## Week 1: P0 Critical
1. ✅ P0-001: Fix playerId spoofing (5 min)
2. ✅ P0-007: Move cleanup inside transaction (1 hr)
3. ✅ P0-002: Add addItemDirect for atomic loot (2 hr)
4. ✅ P0-004: Database-first persistence order (30 min)
5. ✅ P0-003: Add items column to schema (4 hr)
6. ✅ P0-005: Server startup recovery (1 hr)
7. ✅ P0-006: Shadow state for LootWindow (3 hr)
8. ✅ P0-008: Audit logging (2 hr)

## Week 2: P1 High
1. P1-013: Transaction isolation level (30 min)
2. P1-014: Event-driven loot updates (2 hr)
3. P1-015: Loot rate limiting (30 min)
4. P1-020: Automation detection (3 hr)
5. P1-017: CHECK constraints (30 min)
6. P1-018: Death mechanics manifest (4 hr)

## Week 3: P2 Medium + Testing
- Remaining P1 issues
- Unit tests for death system
- Integration tests
- Load testing

---

# CONCLUSION

The expanded criteria revealed **29 new issues** across four previously unaudited areas:

| Area | Previous | New Issues | Severity |
|------|----------|------------|----------|
| Client Responsiveness | Not audited | 7 issues | P0-P1 |
| PostgreSQL Discipline | Not audited | 8 issues | P1-P2 |
| Manifest Architecture | Not audited | 6 issues | P1-P2 |
| Economic/Anti-Cheat | Partial | 8 issues | P0-P1 |

**Key Takeaways:**
1. **Client architecture needs complete redesign** - Shadow state, transaction IDs, rollback capability
2. **Database layer needs hardening** - Isolation levels, CHECK constraints, audit logging
3. **Balance tuning requires code changes** - Should be manifest-driven
4. **Anti-cheat missing for death system** - Bot farming undetectable

**Estimated Effort to 9/10:** 41-47 hours (up from 51-60 hours with previous criteria due to overlapping fixes)

---

**Document Version:** 3.0 (Expanded Criteria)
**Audit Status:** Complete
**Next Steps:** Begin Phase 1 implementation
