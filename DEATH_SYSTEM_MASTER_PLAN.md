# Death System Master Implementation Plan

**Version:** 3.0 (Unified)
**Date:** 2026-01-17
**Target Score:** 9.5/10+ (minimum: 9.0/10)
**Current Score:** 5.0/10
**Total Issues:** 103
**Estimated Effort:** 69 hours

---

## Executive Summary

This is the **complete, unified implementation plan** for elevating the death system to 9.5/10+. It combines:

1. **Core Death System Issues** (74 issues) - The death system files themselves
2. **Dependent System Issues** (29 issues) - Systems that death relies on

### Issue Distribution

| Category | Critical | High | Medium | Low | Total | Hours |
|----------|----------|------|--------|-----|-------|-------|
| **Dependent Systems** | 11 | 18 | - | - | 29 | 24.5 |
| **Core Death System** | 7 | 20 | 30 | 17 | 74 | 44.5 |
| **Grand Total** | **18** | **38** | **30** | **17** | **103** | **69** |

### Systems Covered

| System | File Count | Status |
|--------|------------|--------|
| PlayerDeathSystem | 1 | Core - Multiple P0 issues |
| DeathStateManager | 1 | Core - Crash recovery gaps |
| SafeAreaDeathHandler | 1 | Core - Transaction gaps |
| WildernessDeathHandler | 1 | Core - Transaction gaps |
| HeadstoneEntity | 1 | Core - TOCTOU race |
| LootWindow (client) | 1 | Core - No shadow state |
| EquipmentSystem | 1 | Dependent - CRITICAL race conditions |
| GroundItemSystem | 1 | Dependent - CRITICAL transaction gaps |
| InventorySystem | 1 | Dependent - Minor issues |
| CombatSystem | 1 | Dependent - Death trigger issues |
| ZoneDetectionSystem | 1 | Dependent - CRITICAL boundary bugs |
| EntityManager | 1 | Dependent - CRITICAL lifecycle issues |
| Client Death UX | 2 | Dependent - UX/exploit issues |
| Database Schema | 1 | Core - Missing columns |

---

# PART 1: COMPLETE ISSUE REGISTRY

## Critical Issues (18 Total)

### Dependent System Critical Issues (11)

#### DS-C01: Equipment Duplication Race Window
**System:** EquipmentSystem
**File:** `PlayerDeathSystem.ts:446-496`
**Problem:** Equipment read → drops created → 50 lines later → equipment cleared. Server crash in between = duplication.
**Fix:** Atomic `clearAndReturnEquipment()` operation
**Effort:** 2 hours
**Dependencies:** None

---

#### DS-C02: Equipment Save May Not Rollback
**System:** EquipmentSystem
**File:** `EquipmentSystem.ts:561`
**Problem:** `saveEquipmentToDatabase()` called inside transaction but as independent operation.
**Fix:** Pass transaction context to equipment save
**Effort:** 1 hour
**Dependencies:** DS-C01

---

#### DS-C03: Batch Spawn No Rollback
**System:** GroundItemSystem
**File:** `GroundItemSystem.ts:359-407`
**Problem:** If spawning 10 items and item 8 fails, items 1-7 are orphaned.
**Fix:** All-or-nothing spawn with rollback on failure
**Effort:** 2 hours
**Dependencies:** None

---

#### DS-C04: Ground Items Spawned Outside Transaction
**System:** GroundItemSystem
**File:** `SafeAreaDeathHandler.ts:275`, `WildernessDeathHandler.ts:77`
**Problem:** Ground items spawned outside death transaction. Death lock exists but items don't after failed spawn.
**Fix:** Include ground item spawn in death transaction
**Effort:** 3 hours
**Dependencies:** DS-C03

---

#### DS-C05: Concurrent Pickup Race Condition
**System:** GroundItemSystem
**File:** `InventorySystem.ts` pickup flow
**Problem:** Two players picking up same item = both briefly see item in inventory.
**Fix:** Global pickup lock per ground item ID
**Effort:** 1 hour
**Dependencies:** None

---

#### DS-C06: Death Lock Acquisition Race Condition
**System:** CombatSystem
**File:** `PlayerDeathSystem.ts:392-399`
**Problem:** Check-then-create gap (80 lines) allows double death processing.
**Fix:** Atomic `acquireDeathLock()` check-and-create
**Effort:** 1 hour
**Dependencies:** None

---

#### DS-C07: No Respawn Button Disable
**System:** Client Death UX
**File:** `CoreUI.tsx:352-397`
**Problem:** Respawn button spam sends multiple packets.
**Fix:** Add `isRespawning` state to disable button after click
**Effort:** 15 min
**Dependencies:** None

---

#### DS-C08: Inclusive Boundary Collisions
**System:** ZoneDetectionSystem
**File:** `ZoneDetectionSystem.ts:103-108`
**Problem:** Position at zone boundary matches multiple zones non-deterministically.
**Fix:** Make one boundary exclusive: `x > minX && x <= maxX`
**Effort:** 30 min
**Dependencies:** None

---

#### DS-C09: Cache Grid Boundary Bug
**System:** ZoneDetectionSystem
**File:** `ZoneDetectionSystem.ts:184-186`
**Problem:** 10x10 cache grid causes boundary positions to get wrong cached zone.
**Fix:** Reduce cache granularity or skip caching near boundaries
**Effort:** 1 hour
**Dependencies:** DS-C08

---

#### DS-C10: Duplicate entityAdded Packets
**System:** EntityManager
**File:** `EntityManager.ts:514, 531`
**Problem:** Same entity broadcast twice to clients.
**Fix:** Remove duplicate `network.send("entityAdded", ...)`
**Effort:** 5 min
**Dependencies:** None

---

#### DS-C11: ItemEntity Self-Destroy No Network
**System:** EntityManager
**File:** `ItemEntity.ts:325-331`
**Problem:** `checkDespawn()` calls `this.destroy()` directly - no network notification.
**Fix:** Call `EntityManager.destroyEntity()` instead
**Effort:** 15 min
**Dependencies:** None

---

### Core Death System Critical Issues (7)

#### P0-001: PlayerId Spoofing in Entity Event Handler
**File:** `packages/server/src/systems/ServerNetwork/handlers/entities.ts:69`
**Problem:** Client-provided playerId trusted if present.
**Fix:** Always override with `socket.player.id`
**Effort:** 5 min
**Dependencies:** None

---

#### P0-002: TOCTOU Race + Missing Confirmation Events
**File:** `packages/shared/src/entities/world/HeadstoneEntity.ts:219-295`
**Problem:** No transaction ID tracking, no confirmation/rejection events.
**Fix:** Add transactionId parameter, emit LOOT_RESULT events
**Effort:** 2 hours
**Dependencies:** None

---

#### P0-003: No Items Stored in playerDeaths for Crash Recovery
**File:** `packages/server/src/database/schema.ts:717-739`
**Problem:** Missing `items`, `killedBy`, `recovered` columns.
**Fix:** Add columns via migration + CHECK constraints
**Effort:** 4 hours
**Dependencies:** None

---

#### P0-004: Memory Updated Before Database
**File:** `packages/shared/src/systems/shared/death/DeathStateManager.ts:127-158`
**Problem:** Memory set before database write. Crash = lost items.
**Fix:** Database first, memory second
**Effort:** 30 min
**Dependencies:** P0-003

---

#### P0-005: No Server Startup Death Recovery
**File:** `packages/shared/src/systems/shared/death/DeathStateManager.ts:66-88`
**Problem:** No recovery of unfinished deaths on server restart.
**Fix:** Add `recoverUnfinishedDeaths()` in `init()`
**Effort:** 1.5 hours
**Dependencies:** P0-003, P0-004

---

#### P0-006: No Shadow State for Loot Operations
**File:** `packages/client/src/game/panels/LootWindow.tsx:24, 104-133`
**Problem:** Optimistic update with no rollback capability.
**Fix:** Add pending transaction tracking, rollback on rejection/timeout
**Effort:** 3 hours
**Dependencies:** P0-002

---

#### P0-007: Missing Death Operation Audit Logging
**Files:** `PlayerDeathSystem.ts`, `HeadstoneEntity.ts`, `types/events.ts`
**Problem:** No audit trail for death/loot operations.
**Fix:** Add AUDIT_LOG event type and emit on death/loot
**Effort:** 2 hours
**Dependencies:** None

---

## High Priority Issues (38 Total)

### Dependent System High Issues (18)

| ID | System | Issue | Effort |
|----|--------|-------|--------|
| DS-H01 | Inventory | clearInventoryImmediate missing tx context | 1h |
| DS-H02 | Inventory | Death spam check in-memory only | 30m |
| DS-H03 | Equipment | No verify-before-clear pattern | 1h |
| DS-H04 | Equipment | Reload on respawn edge case | 30m |
| DS-H05 | GroundItems | Dual despawn system (ItemEntity vs tick) | 30m |
| DS-H06 | GroundItems | Visibility phases not networked | 2h |
| DS-H07 | Combat | Double death prevention incomplete | 1h |
| DS-H08 | Combat | Cleanup before death event | 1h |
| DS-H09 | Combat | No attacker validation at damage apply | 30m |
| DS-H10 | Client | No server-side death validation | 15m |
| DS-H11 | Client | Death screen before input block | 30m |
| DS-H12 | Client | No timeout for lost PLAYER_RESPAWNED | 30m |
| DS-H13 | Client | No death countdown timer | 1h |
| DS-H14 | Zones | No zone overlap validation | 1h |
| DS-H15 | Zones | Unknown zones default to SAFE | 30m |
| DS-H16 | Entity | Non-atomic entity registration | 30m |
| DS-H17 | Entity | Network send before mesh destruction | 15m |
| DS-H18 | Entity | Events emitted after entity removal | 30m |

### Core Death System High Issues (20)

| ID | Issue | File | Effort |
|----|-------|------|--------|
| P1-001 | Transaction isolation level missing | DatabaseSystem | 30m |
| P1-002 | 100ms polling instead of event-driven | LootWindow.tsx | (in P0-006) |
| P1-003 | No loot request rate limiting | HeadstoneEntity.ts | 30m |
| P1-004 | Integer overflow in respawn tick | PlayerDeathSystem.ts | 15m |
| P1-005 | No CHECK constraints | schema.ts | (in P0-003) |
| P1-006 | Death constants not manifest-driven | CombatConstants.ts | 4h |
| P1-007 | No batch loot operation | LootWindow.tsx | 2h |
| P1-008 | No automation detection for death farming | DeathStateManager.ts | 3h |
| P1-009 | Gravestone entity missing heartbeat | HeadstoneEntity.ts | 1h |
| P1-010 | Death lock cleanup on player disconnect | DeathStateManager.ts | 1h |
| P1-011 | No loot window close confirmation | LootWindow.tsx | 30m |
| P1-012 | Gravestone model loading error handling | HeadstoneEntity.ts | 30m |
| P1-013 | Death position not validated | PlayerDeathSystem.ts | 30m |
| P1-014 | No respawn position validation | PlayerDeathSystem.ts | 1h |
| P1-015 | Memory leak in LootWindow setInterval | LootWindow.tsx | 30m |
| P1-016 | No connection pooling metrics | DatabaseSystem | 1h |
| P1-017 | Query timeout not configured | DatabaseSystem | 30m |
| P1-018 | Death event sequence validation | PlayerDeathSystem.ts | 2h |
| P1-019 | No graceful degradation on DB error | DeathStateManager.ts | 1h |
| P1-020 | Loot protection timer not synced to client | LootWindow.tsx | 1h |

---

## Medium Priority Issues (30) - P2

| ID | Issue | File | Effort |
|----|-------|------|--------|
| P2-001 | Long function processPlayerDeath (137 lines) | PlayerDeathSystem.ts | 1.5h |
| P2-002 | Mixed abstraction in processLootRequest | HeadstoneEntity.ts | 30m |
| P2-003 | Command-Query violation in getDeathLock | DeathStateManager.ts | 30m |
| P2-004 | Deep property chain headstoneData access | HeadstoneEntity.ts | 15m |
| P2-005 | Deep property chain entity.data access | PlayerDeathSystem.ts | 15m |
| P2-006 | 6 scattered Maps with same key | PlayerDeathSystem.ts | 2.5h |
| P2-007 | Date.now() called multiple times in loop | PlayerDeathSystem.ts | 15m |
| P2-008 | Boolean flag parameter isProtected | HeadstoneEntity.ts | 30m |
| P2-009 | Magic number 5000ms timeout | LootWindow.tsx | 5m |
| P2-010 | Inconsistent error logging format | Multiple | 30m |
| P2-011 | No TypeScript strict null checks | tsconfig.json | 2h |
| P2-012 | Unused import ZoneType in client | LootWindow.tsx | 5m |
| P2-013 | Callback hell in handleGravestoneExpire | SafeAreaDeathHandler.ts | 30m |
| P2-014 | No input sanitization for killedBy | PlayerDeathSystem.ts | 15m |
| P2-015 | Inconsistent naming corpseId vs gravestoneId | Multiple | 1h |
| P2-016 | No JSDoc on public methods | DeathStateManager.ts | 30m |
| P2-017 | Repeated position validation logic | PlayerDeathSystem.ts | 30m |
| P2-018 | No error boundary for LootWindow | LootWindow.tsx | 30m |
| P2-019 | Hardcoded gravestone model path | SafeAreaDeathHandler.ts | 15m |
| P2-020 | No cleanup for deathPatterns Map | DeathStateManager.ts | 30m |
| P2-021 | Console.log used for error paths | PlayerDeathSystem.ts | 30m |
| P2-022 | No type guard for HeadstoneEntityConfig | HeadstoneEntity.ts | 30m |
| P2-023 | Inconsistent promise handling | SafeAreaDeathHandler.ts | 30m |
| P2-024 | No defensive copy of items array | SafeAreaDeathHandler.ts | 10m |
| P2-025 | Tick calculation not type-safe | SafeAreaDeathHandler.ts | 10m |
| P2-026 | No validation of manifest schema | death-mechanics.json | 1h |
| P2-027 | No circuit breaker for database calls | DeathStateManager.ts | 1h |
| P2-028 | Event emitter memory leak potential | HeadstoneEntity.ts | 30m |
| P2-029 | No idempotency key for death operations | PlayerDeathSystem.ts | 1h |
| P2-030 | No metrics for death system performance | PlayerDeathSystem.ts | 30m |

---

## Low Priority Issues (17) - P3

| ID | Issue | Effort |
|----|-------|--------|
| P3-001 | Comment spelling error | 1m |
| P3-002 | Inconsistent brace style | 5m |
| P3-003 | Unused variable warning | 2m |
| P3-004 | Missing return type annotation | 15m |
| P3-005 | Long import list | 5m |
| P3-006 | Inconsistent semicolon usage | 5m |
| P3-007 | TODO comment left in code | 5m |
| P3-008 | Duplicate type definition | 15m |
| P3-009 | Verbose console logging | 15m |
| P3-010 | Missing package.json exports | 10m |
| P3-011 | No README for death system | 1h |
| P3-012 | Inconsistent file naming | 30m |
| P3-013 | Missing changelog entry | 15m |
| P3-014 | No type export index | 15m |
| P3-015 | Outdated JSDoc example | 10m |
| P3-016 | Missing eslint-disable justification | 10m |
| P3-017 | No editor config for death files | 5m |

---

# PART 2: UNIFIED DEPENDENCY GRAPH

```
═══════════════════════════════════════════════════════════════════
                    PHASE 0: QUICK WINS (1 hour)
═══════════════════════════════════════════════════════════════════
  No Dependencies - Can All Run in Parallel

  ├── DS-C10: Remove duplicate entityAdded packets (5 min)
  ├── DS-C11: ItemEntity use EntityManager.destroyEntity (15 min)
  ├── DS-C07: Respawn button disable state (15 min)
  ├── DS-C08: Zone boundary exclusive fix (30 min)
  └── P0-001: PlayerId spoofing fix (5 min)

═══════════════════════════════════════════════════════════════════
                    PHASE 1: SCHEMA & DATABASE (5 hours)
═══════════════════════════════════════════════════════════════════
  Foundation for crash recovery

  ├── P0-003: Add items column + CHECK constraints + FK (4h)
  │     └── Creates: items, killedBy, recovered columns
  │
  └── P1-001: Transaction isolation level (30m)
        └── SET TRANSACTION ISOLATION LEVEL SERIALIZABLE

═══════════════════════════════════════════════════════════════════
                    PHASE 2: TRANSACTION SAFETY (8 hours)
═══════════════════════════════════════════════════════════════════
  Prevent item duplication and loss

  ├── DS-C01: Equipment atomic clearAndReturn ←── (Phase 1)
  │     └── Replace 50-line gap with atomic operation (2h)
  │
  ├── DS-C02: Equipment save rollback ←── DS-C01
  │     └── Pass tx context to saveEquipmentToDatabase (1h)
  │
  ├── DS-C06: Death lock atomic acquire ←── (Phase 1)
  │     └── Check-and-create in single operation (1h)
  │
  ├── DS-C04: Ground items in transaction ←── (Phase 1)
  │     └── Include spawn in death transaction (3h)
  │
  └── DS-C03: Batch spawn rollback ←── (Phase 1)
        └── All-or-nothing spawn (2h)

═══════════════════════════════════════════════════════════════════
                    PHASE 3: CRASH RECOVERY (2 hours)
═══════════════════════════════════════════════════════════════════
  Recover from server crashes

  ├── P0-004: Database-first persistence ←── P0-003
  │     └── Write to DB before memory (30m)
  │
  └── P0-005: Server startup recovery ←── P0-003, P0-004
        └── recoverUnfinishedDeaths() in init (1.5h)

═══════════════════════════════════════════════════════════════════
                    PHASE 4: EVENT SYSTEM (5 hours)
═══════════════════════════════════════════════════════════════════
  Client-server communication

  ├── P0-002: Add LOOT_RESULT events ←── (Phase 3)
  │     └── Transaction IDs + confirmation events (2h)
  │
  ├── P0-006: Shadow state for loot ←── P0-002
  │     └── Pending tracking, rollback on rejection (3h)
  │
  └── P0-007: Audit logging (2h) [can run parallel]
        └── AUDIT_LOG event for death/loot

═══════════════════════════════════════════════════════════════════
                    PHASE 5: ZONE & ENTITY FIXES (3.5 hours)
═══════════════════════════════════════════════════════════════════
  Fix remaining critical systems

  ├── DS-C09: Zone cache grid bug ←── DS-C08
  │     └── Reduce cache granularity (1h)
  │
  ├── DS-C05: Concurrent pickup race (1h) [parallel]
  │     └── Global pickup lock per item
  │
  ├── DS-H05: Remove ItemEntity dual despawn (30m) [parallel]
  │     └── Let GroundItemSystem handle all despawns
  │
  └── DS-H16: Atomic entity registration (30m) [parallel]
        └── Single source of truth for entities

═══════════════════════════════════════════════════════════════════
                    PHASE 6: CLIENT UX (3 hours)
═══════════════════════════════════════════════════════════════════
  Polish death experience

  ├── DS-H10: Server-side death validation (15m)
  ├── DS-H11: Input block timing (30m)
  ├── DS-H12: PLAYER_RESPAWNED timeout (30m)
  ├── DS-H13: Death countdown timer (1h)
  └── P1-003: Loot rate limiting (30m)

═══════════════════════════════════════════════════════════════════
                    PHASE 7: REMAINING HIGH PRIORITY (10 hours)
═══════════════════════════════════════════════════════════════════
  Complete P1 and DS-H issues

  ├── DS-H01 through DS-H18 (remaining)
  └── P1-001 through P1-020 (remaining)

═══════════════════════════════════════════════════════════════════
                    PHASE 8: REFACTORING (12 hours)
═══════════════════════════════════════════════════════════════════
  Code quality improvements

  └── P2-001 through P2-030

═══════════════════════════════════════════════════════════════════
                    PHASE 9: POLISH (6 hours)
═══════════════════════════════════════════════════════════════════
  Final cleanup

  └── P3-001 through P3-017
```

---

# PART 3: IMPLEMENTATION SCHEDULE

## Week 1: Critical Foundation (20 hours)

| Day | Phase | Issues | Hours | Score |
|-----|-------|--------|-------|-------|
| Mon | 0 | DS-C10, DS-C11, DS-C07, DS-C08, P0-001 | 1 | 5.0→5.3 |
| Mon | 1 | P0-003 (schema) | 4 | 5.3→5.8 |
| Tue | 2 | DS-C01, DS-C02, DS-C06 | 4 | 5.8→6.5 |
| Wed | 2 | DS-C04, DS-C03 | 5 | 6.5→7.2 |
| Thu | 3 | P0-004, P0-005 | 2 | 7.2→7.5 |
| Thu | 4 | P0-002 | 2 | 7.5→7.8 |
| Fri | 4 | P0-006, P0-007 | 5 | 7.8→8.2 |

**End of Week 1:** Score 8.2/10, all Critical issues resolved

## Week 2: High Priority (18 hours)

| Day | Phase | Issues | Hours | Score |
|-----|-------|--------|-------|-------|
| Mon | 5 | DS-C09, DS-C05, DS-H05, DS-H16 | 3.5 | 8.2→8.5 |
| Tue | 6 | Client UX issues | 3 | 8.5→8.7 |
| Wed-Fri | 7 | Remaining P1 + DS-H | 11.5 | 8.7→9.2 |

**End of Week 2:** Score 9.2/10, all High issues resolved

## Week 3: Refactoring (12 hours)

| Day | Phase | Issues | Hours | Score |
|-----|-------|--------|-------|-------|
| Mon-Wed | 8 | P2-001 through P2-030 | 12 | 9.2→9.5 |

**End of Week 3:** Score 9.5/10, all Medium issues resolved

## Week 4: Polish + Testing (6 hours)

| Day | Phase | Issues | Hours | Score |
|-----|-------|--------|-------|-------|
| Mon | 9 | P3-001 through P3-017 | 3 | 9.5→9.6 |
| Tue | - | Final testing, documentation | 3 | 9.6→9.7 |

**Final Score:** 9.7/10

---

# PART 4: TESTING STRATEGY

## Existing Tests (78 tests - DO NOT RECREATE)

| File | Tests | Coverage |
|------|-------|----------|
| DeathStateManager.test.ts | 28 | Death lock lifecycle |
| SafeAreaDeathHandler.test.ts | 20 | Gravestone mechanics |
| WildernessDeathHandler.test.ts | 14 | Ground item drops |
| PvPDeath.integration.test.ts | 16 | Full PvP death flow |

## New Tests Required (~70 tests)

| File | Tests | Coverage |
|------|-------|----------|
| PlayerDeathSystem.test.ts | 20 | P0-007, P2-001, DS-C06 |
| HeadstoneEntity.test.ts | 25 | P0-002, P1-003, TOCTOU |
| LootWindow.test.tsx | 15 | P0-006 shadow state |
| death-security.test.ts | 10 | P0-001, DS-C05 |

## Critical Test Scenarios

### Transaction Safety Tests
```typescript
describe('Transaction Safety', () => {
  it('should rollback equipment if death lock fails');
  it('should rollback ground items if partial spawn fails');
  it('should prevent double death processing');
  it('should recover deaths after server restart');
});
```

### Race Condition Tests
```typescript
describe('Race Conditions', () => {
  it('should prevent concurrent pickup of same item');
  it('should prevent double loot via rapid clicking');
  it('should handle zone boundary deaths deterministically');
  it('should handle respawn button spam');
});
```

### Crash Recovery Tests
```typescript
describe('Crash Recovery', () => {
  it('should recover gravestone after server crash during death');
  it('should recover ground items after crash');
  it('should not duplicate items on recovery');
  it('should mark deaths as recovered after processing');
});
```

---

# PART 5: FILES MODIFIED BY PHASE

## Phase 0-1 (Foundation)
- `packages/server/src/systems/ServerNetwork/handlers/entities.ts`
- `packages/server/src/database/schema.ts`
- `packages/server/src/database/migrations/0015_add_death_recovery.sql` (new)
- `packages/shared/src/systems/shared/entities/EntityManager.ts`
- `packages/shared/src/entities/world/ItemEntity.ts`
- `packages/client/src/game/CoreUI.tsx`
- `packages/shared/src/systems/shared/death/ZoneDetectionSystem.ts`

## Phase 2-3 (Transaction Safety + Recovery)
- `packages/shared/src/systems/shared/character/EquipmentSystem.ts`
- `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
- `packages/shared/src/systems/shared/death/DeathStateManager.ts`
- `packages/shared/src/systems/shared/death/SafeAreaDeathHandler.ts`
- `packages/shared/src/systems/shared/death/WildernessDeathHandler.ts`
- `packages/shared/src/systems/shared/economy/GroundItemSystem.ts`

## Phase 4-5 (Events + Entity Fixes)
- `packages/shared/src/entities/world/HeadstoneEntity.ts`
- `packages/shared/src/types/events.ts`
- `packages/client/src/game/panels/LootWindow.tsx`
- `packages/shared/src/systems/shared/character/InventorySystem.ts`

## Phase 6 (Client UX)
- `packages/client/src/game/CoreUI.tsx`
- `packages/shared/src/entities/player/PlayerLocal.ts`

---

# PART 6: VERIFICATION CHECKLIST

## After Phase 1 (Schema)
- [ ] Migration runs without errors
- [ ] `items` column accepts JSON array
- [ ] CHECK constraints reject invalid zoneType
- [ ] FK constraint cascades on character delete

## After Phase 2 (Transaction Safety)
- [ ] Equipment cleared atomically with drops
- [ ] Ground items rollback on partial failure
- [ ] Death lock acquired atomically
- [ ] No item duplication possible

## After Phase 3 (Crash Recovery)
- [ ] Server restart recovers unfinished deaths
- [ ] Gravestones respawn with correct items
- [ ] Deaths marked as recovered
- [ ] No duplicate gravestones

## After Phase 4 (Events)
- [ ] LOOT_RESULT events emit on loot
- [ ] Client receives confirmation/rejection
- [ ] Rollback works on timeout
- [ ] Audit log contains death/loot entries

## After Phase 5 (Zone + Entity)
- [ ] Zone boundary returns deterministic result
- [ ] No phantom items on client
- [ ] Concurrent pickup prevented
- [ ] Entity lifecycle atomic

## Final Verification
- [ ] All 148 tests pass
- [ ] No item duplication in 1000 death cycles
- [ ] Crash recovery works 100%
- [ ] Client UX smooth

---

# PART 7: COMMANDS

```bash
# Run all death system tests
bun test --grep "death|Death|loot|Loot|gravestone|Gravestone"

# Run specific phase tests
bun test packages/shared/src/systems/shared/death/__tests__/

# Verify schema migration
bun run db:migrate

# Check for item duplication (load test)
bun run test:death-stress

# Full verification
bun test && echo "All 148 tests passing - Score: 9.5/10+"
```

---

# APPENDIX A: QUICK REFERENCE

## Issue ID Mapping

| Prefix | Meaning |
|--------|---------|
| DS-C## | Dependent System - Critical |
| DS-H## | Dependent System - High |
| P0-### | Core Death System - Critical |
| P1-### | Core Death System - High |
| P2-### | Core Death System - Medium |
| P3-### | Core Death System - Low |

## Priority Definitions

| Priority | Criteria | Action |
|----------|----------|--------|
| Critical | Item loss, duplication, crash vulnerability | Fix immediately |
| High | Race conditions, UX issues, security | Fix in Week 1-2 |
| Medium | Code quality, maintainability | Fix in Week 3 |
| Low | Polish, documentation | Fix in Week 4 |

## Effort Estimates

| Hours | Complexity | Example |
|-------|------------|---------|
| 5-15 min | Trivial | Remove duplicate line |
| 30 min | Simple | Add parameter to function |
| 1-2 hours | Moderate | Add new method with tests |
| 3-4 hours | Complex | Refactor flow with transaction |
| 4+ hours | Major | Schema migration + code changes |

---

**Document Version:** 3.1 (Unified Master Plan + Code Snippets)
**Total Issues:** 103
**Estimated Hours:** 69
**Target Score:** 9.5/10+
**Status:** Ready for Implementation

---

# APPENDIX B: DETAILED CODE SPECIFICATIONS

This appendix provides **before/after code snippets** for the 6 most complex issues that require architectural clarity. These specifications eliminate ambiguity and enable direct implementation.

---

## B.1: NEW TYPE SCHEMAS

### B.1.1: LOOT_RESULT Event (Required for P0-002, P0-006)

**File:** `packages/shared/src/types/events/event-types.ts`

Add to EventType enum:
```typescript
// Death System - Loot Results (NEW)
LOOT_RESULT = "loot:result",
LOOT_TIMEOUT = "loot:timeout",
```

**File:** `packages/shared/src/types/death/death-types.ts`

Add new interfaces:
```typescript
/**
 * Loot operation result - sent from server to client
 * Used for shadow state confirmation/rejection
 */
export interface LootResult {
  /** Unique ID matching the client's request */
  transactionId: string;
  /** Whether the loot was successful */
  success: boolean;
  /** Item that was looted (on success) */
  itemId?: string;
  /** Quantity looted (on success) */
  quantity?: number;
  /** Failure reason (on failure) */
  reason?: LootFailureReason;
  /** Server timestamp for ordering */
  timestamp: number;
}

export type LootFailureReason =
  | 'ITEM_NOT_FOUND'      // Item already looted by someone else
  | 'INVENTORY_FULL'      // Player's inventory is full
  | 'PROTECTED'           // Loot protection still active
  | 'GRAVESTONE_GONE'     // Gravestone despawned
  | 'RATE_LIMITED'        // Too many requests
  | 'INVALID_REQUEST';    // Malformed request

/**
 * Pending loot transaction for client shadow state
 */
export interface PendingLootTransaction {
  transactionId: string;
  itemId: string;
  quantity: number;
  requestedAt: number;
  /** Optimistically removed item index for rollback */
  originalIndex: number;
}
```

### B.1.2: AUDIT_LOG Event (Required for P0-007)

**File:** `packages/shared/src/types/events/event-types.ts`

Add to EventType enum:
```typescript
// Audit System (NEW)
AUDIT_LOG = "audit:log",
```

**File:** `packages/shared/src/types/death/death-types.ts`

Add new interface:
```typescript
/**
 * Audit log entry for death/loot operations
 * Stored in database for forensic analysis
 */
export interface DeathAuditEntry {
  /** Unique audit entry ID */
  id: string;
  /** Type of operation */
  action: DeathAuditAction;
  /** Player who died or is looting */
  playerId: string;
  /** Player performing the action (for loot, may differ from playerId) */
  actorId: string;
  /** Gravestone or ground item entity ID */
  entityId?: string;
  /** Items involved in operation */
  items?: Array<{ itemId: string; quantity: number }>;
  /** Zone where action occurred */
  zoneType: ZoneType;
  /** Position of action */
  position: { x: number; y: number; z: number };
  /** Success or failure */
  success: boolean;
  /** Failure reason if applicable */
  failureReason?: string;
  /** Server timestamp */
  timestamp: number;
}

export type DeathAuditAction =
  | 'DEATH_STARTED'       // Player death initiated
  | 'DEATH_COMPLETED'     // Death processing finished
  | 'GRAVESTONE_CREATED'  // Gravestone spawned
  | 'GRAVESTONE_EXPIRED'  // Gravestone → ground items
  | 'LOOT_ATTEMPTED'      // Loot request received
  | 'LOOT_SUCCESS'        // Item successfully looted
  | 'LOOT_FAILED'         // Loot attempt failed
  | 'DEATH_RECOVERED';    // Crash recovery processed death
```

---

## B.2: P0-002 - TOCTOU Race + Confirmation Events

**File:** `packages/shared/src/entities/world/HeadstoneEntity.ts`

### BEFORE (Current - Lines 192-295):
```typescript
private handleLootRequest(data: {
  playerId: string;
  itemId: string;
  quantity: number;
  slot?: number;
}): void {
  if (!this.world.isServer) {
    return;
  }
  // Queue without tracking - NO transactionId!
  this.lootQueue = this.lootQueue
    .then(() => this.processLootRequest(data))
    .catch((error) => {
      console.error(`[HeadstoneEntity] Loot request failed:`, error);
    });
}

private async processLootRequest(data: {
  playerId: string;
  itemId: string;
  quantity: number;
  slot?: number;
}): Promise<void> {
  // Step 1: Check loot protection
  if (!this.canPlayerLoot(data.playerId)) {
    this.world.emit(EventType.UI_MESSAGE, {
      playerId: data.playerId,
      message: "This loot is protected!",
      type: "error",
    });
    return; // NO confirmation event - client doesn't know!
  }

  // Step 2: Check if item exists
  const itemIndex = this.lootItems.findIndex(
    (item) => item.itemId === data.itemId,
  );
  if (itemIndex === -1) {
    this.world.emit(EventType.UI_MESSAGE, {
      playerId: data.playerId,
      message: "Item already looted!",
      type: "warning",
    });
    return; // NO confirmation event - client shadow state stuck!
  }

  // ... Steps 3-5: Check space, remove, add to inventory ...
  // NO LOOT_RESULT event emitted - client never knows outcome!
}
```

### AFTER (Fixed):
```typescript
import type { LootResult, LootFailureReason } from "../../types/death";
import { generateTransactionId } from "../../utils/IdGenerator";

private handleLootRequest(data: {
  playerId: string;
  itemId: string;
  quantity: number;
  slot?: number;
  transactionId?: string;  // NEW: Client-provided transaction ID
}): void {
  if (!this.world.isServer) {
    return;
  }

  // Generate transactionId if client didn't provide one (backwards compat)
  const transactionId = data.transactionId || generateTransactionId();

  this.lootQueue = this.lootQueue
    .then(() => this.processLootRequest({ ...data, transactionId }))
    .catch((error) => {
      console.error(`[HeadstoneEntity] Loot request failed:`, error);
      // Even on error, send rejection so client can rollback
      this.emitLootResult(data.playerId, transactionId, false, 'INVALID_REQUEST');
    });
}

private async processLootRequest(data: {
  playerId: string;
  itemId: string;
  quantity: number;
  slot?: number;
  transactionId: string;  // REQUIRED
}): Promise<void> {
  const { playerId, itemId, quantity, transactionId } = data;

  // Step 1: Check loot protection
  if (!this.canPlayerLoot(playerId)) {
    this.emitLootResult(playerId, transactionId, false, 'PROTECTED');
    return;
  }

  // Step 2: ATOMIC check-and-remove (compare-and-swap pattern)
  const itemIndex = this.lootItems.findIndex((item) => item.itemId === itemId);
  if (itemIndex === -1) {
    this.emitLootResult(playerId, transactionId, false, 'ITEM_NOT_FOUND');
    return;
  }

  const item = this.lootItems[itemIndex];
  const quantityToLoot = Math.min(quantity, item.quantity);

  // Step 3: Check inventory space BEFORE removal
  const hasSpace = this.checkInventorySpace(playerId, itemId, quantityToLoot);
  if (!hasSpace) {
    this.emitLootResult(playerId, transactionId, false, 'INVENTORY_FULL');
    return;
  }

  // Step 4: Atomic remove (already inside queue lock)
  const removed = this.removeItem(itemId, quantityToLoot);
  if (!removed) {
    // Race condition: item removed between find and remove
    this.emitLootResult(playerId, transactionId, false, 'ITEM_NOT_FOUND');
    return;
  }

  // Step 5: Add to inventory
  this.world.emit(EventType.INVENTORY_ITEM_ADDED, {
    playerId,
    item: {
      id: `loot_${playerId}_${Date.now()}`,
      itemId,
      quantity: quantityToLoot,
      slot: -1,
      metadata: null,
    },
  });

  // Step 6: EMIT SUCCESS - Client can confirm shadow state
  this.emitLootResult(playerId, transactionId, true, undefined, itemId, quantityToLoot);

  // Step 7: Audit log
  this.world.emit(EventType.AUDIT_LOG, {
    action: 'LOOT_SUCCESS',
    playerId: this.config.headstoneData.playerId,  // Owner of gravestone
    actorId: playerId,  // Who looted
    entityId: this.id,
    items: [{ itemId, quantity: quantityToLoot }],
    zoneType: ZoneType.SAFE_AREA,
    position: this.getPosition(),
    success: true,
    timestamp: Date.now(),
  });
}

/**
 * Emit loot result to client for shadow state resolution
 */
private emitLootResult(
  playerId: string,
  transactionId: string,
  success: boolean,
  reason?: LootFailureReason,
  itemId?: string,
  quantity?: number,
): void {
  const result: LootResult = {
    transactionId,
    success,
    itemId,
    quantity,
    reason,
    timestamp: Date.now(),
  };

  // Send directly to the requesting player
  if (this.world.network && 'sendTo' in this.world.network) {
    (this.world.network as { sendTo: (id: string, event: string, data: unknown) => void })
      .sendTo(playerId, 'lootResult', result);
  }

  // Also emit event for any listeners
  this.world.emit(EventType.LOOT_RESULT, { playerId, ...result });
}
```

### NEW UTILITY FUNCTION:

**File:** `packages/shared/src/utils/IdGenerator.ts`

```typescript
/**
 * Generate unique transaction ID for loot operations
 * Format: loot_{timestamp}_{random}
 */
export function generateTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `loot_${timestamp}_${random}`;
}
```

---

## B.3: P0-005 - Server Startup Death Recovery

**File:** `packages/shared/src/systems/shared/death/DeathStateManager.ts`

### BEFORE (Current - Lines 66-88):
```typescript
async init(): Promise<void> {
  this.entityManager = this.world.getSystem(
    "entity-manager",
  ) as EntityManager | null;

  if (this.world.isServer) {
    this.databaseSystem = this.world.getSystem(
      "database",
    ) as unknown as DatabaseSystem | null;
    if (this.databaseSystem) {
      console.log(
        "[DeathStateManager] Initialized with database persistence (server)",
      );
    } else {
      console.warn(
        "[DeathStateManager] DatabaseSystem not available - running without persistence!",
      );
    }
  } else {
    console.log("[DeathStateManager] Initialized (client, in-memory only)");
  }
  // NO RECOVERY! Unfinished deaths are lost on restart!
}
```

### AFTER (Fixed):
```typescript
async init(): Promise<void> {
  this.entityManager = this.world.getSystem(
    "entity-manager",
  ) as EntityManager | null;

  if (this.world.isServer) {
    this.databaseSystem = this.world.getSystem(
      "database",
    ) as unknown as DatabaseSystem | null;

    if (this.databaseSystem) {
      console.log(
        "[DeathStateManager] Initialized with database persistence (server)",
      );

      // CRITICAL: Recover unfinished deaths from previous server session
      await this.recoverUnfinishedDeaths();
    } else {
      console.warn(
        "[DeathStateManager] DatabaseSystem not available - running without persistence!",
      );
    }
  } else {
    console.log("[DeathStateManager] Initialized (client, in-memory only)");
  }
}

/**
 * Recover unfinished deaths from database after server restart
 *
 * CRITICAL: Prevents item loss when server crashes during death handling.
 *
 * Recovery logic:
 * 1. Query all player_deaths where recovered = false
 * 2. For each death, check if gravestone/ground items still exist
 * 3. If not, recreate them from stored items
 * 4. Mark death as recovered
 */
private async recoverUnfinishedDeaths(): Promise<void> {
  if (!this.databaseSystem) return;

  console.log("[DeathStateManager] Checking for unfinished deaths to recover...");

  try {
    // Query unrecovered deaths (requires P0-003 schema changes)
    const unrecoveredDeaths = await this.databaseSystem.getUnrecoveredDeathsAsync();

    if (unrecoveredDeaths.length === 0) {
      console.log("[DeathStateManager] No unfinished deaths to recover");
      return;
    }

    console.log(
      `[DeathStateManager] Found ${unrecoveredDeaths.length} unfinished deaths to recover`,
    );

    for (const death of unrecoveredDeaths) {
      await this.recoverSingleDeath(death);
    }

    console.log(
      `[DeathStateManager] Recovery complete: ${unrecoveredDeaths.length} deaths processed`,
    );
  } catch (error) {
    console.error("[DeathStateManager] Death recovery failed:", error);
    // Don't throw - server should start even if recovery fails
    // Items may be lost but server remains functional
  }
}

/**
 * Recover a single unfinished death
 */
private async recoverSingleDeath(death: {
  playerId: string;
  gravestoneId: string | null;
  groundItemIds: string[];
  position: { x: number; y: number; z: number };
  zoneType: string;
  items: Array<{ itemId: string; quantity: number }>;  // From P0-003
  killedBy: string;  // From P0-003
}): Promise<void> {
  const { playerId, gravestoneId, groundItemIds, position, zoneType, items, killedBy } = death;

  console.log(
    `[DeathStateManager] Recovering death for ${playerId}: ${items.length} items, zone: ${zoneType}`,
  );

  // Check if gravestone still exists
  let gravestoneExists = false;
  if (gravestoneId && this.entityManager) {
    const entity = this.world.entities?.get(gravestoneId);
    gravestoneExists = !!entity;
  }

  // Check if ground items still exist
  const existingGroundItems = groundItemIds.filter((id) => {
    return !!this.world.entities?.get(id);
  });

  // If items are already recovered (entities exist), just restore memory state
  if (gravestoneExists || existingGroundItems.length > 0) {
    console.log(
      `[DeathStateManager] Death for ${playerId} partially recovered - entities exist`,
    );

    // Restore to in-memory cache
    this.activeDeaths.set(playerId, {
      playerId,
      gravestoneId: gravestoneExists ? gravestoneId! : undefined,
      groundItemIds: existingGroundItems,
      position,
      timestamp: Date.now(),
      zoneType: zoneType as ZoneType,
      itemCount: items.length,
    });
  } else if (items.length > 0) {
    // Items were stored but entities don't exist - recreate them
    console.log(
      `[DeathStateManager] Recreating items for ${playerId} death recovery`,
    );

    // Convert stored items back to InventoryItem format
    const inventoryItems: InventoryItem[] = items.map((item, index) => ({
      id: `recovery_${playerId}_${Date.now()}_${index}`,
      itemId: item.itemId,
      quantity: item.quantity,
      slot: -1,
      metadata: null,
    }));

    // Use appropriate handler based on zone type
    if (zoneType === ZoneType.SAFE_AREA) {
      // Emit event to spawn gravestone (handled by SafeAreaDeathHandler)
      this.world.emit(EventType.DEATH_RECOVERED, {
        playerId,
        position,
        items: inventoryItems,
        killedBy,
        zoneType: ZoneType.SAFE_AREA,
      });
    } else {
      // Emit event to spawn ground items (handled by WildernessDeathHandler)
      this.world.emit(EventType.DEATH_RECOVERED, {
        playerId,
        position,
        items: inventoryItems,
        killedBy,
        zoneType: zoneType as ZoneType,
      });
    }
  }

  // Mark death as recovered in database
  await this.databaseSystem!.markDeathRecoveredAsync(playerId);

  // Emit audit log
  this.world.emit(EventType.AUDIT_LOG, {
    action: 'DEATH_RECOVERED',
    playerId,
    actorId: 'system',
    items: items,
    zoneType: zoneType as ZoneType,
    position,
    success: true,
    timestamp: Date.now(),
  });
}
```

### NEW DATABASE METHODS (Required):

**File:** `packages/server/src/systems/database/DatabaseSystem.ts`

Add to DatabaseSystem interface:
```typescript
/**
 * Get all unrecovered deaths for crash recovery
 */
async getUnrecoveredDeathsAsync(): Promise<Array<{
  playerId: string;
  gravestoneId: string | null;
  groundItemIds: string[];
  position: { x: number; y: number; z: number };
  zoneType: string;
  items: Array<{ itemId: string; quantity: number }>;
  killedBy: string;
}>>;

/**
 * Mark a death as recovered after crash recovery processing
 */
async markDeathRecoveredAsync(playerId: string): Promise<void>;
```

---

## B.4: P0-006 - Shadow State for Loot Operations

**File:** `packages/client/src/game/panels/LootWindow.tsx`

### BEFORE (Current - Lines 24-133):
```typescript
export function LootWindow({ ... }: LootWindowProps) {
  const [items, setItems] = useState<InventoryItem[]>(lootItems);
  // NO pending transaction tracking!
  // NO rollback capability!

  const handleTakeItem = (item: InventoryItem, index: number) => {
    const localPlayer = world.getPlayer();
    if (!localPlayer) return;

    // Send loot request
    if (world.network?.send) {
      world.network.send("entityEvent", {
        id: "world",
        event: EventType.CORPSE_LOOT_REQUEST,
        payload: {
          corpseId,
          playerId: localPlayer.id,
          itemId: item.itemId,
          quantity: item.quantity,
          slot: index,
          // NO transactionId!
        },
      });
    }

    // Optimistic remove - NO WAY TO ROLLBACK!
    setItems((prev) => prev.filter((_, i) => i !== index));
  };
  // ...
}
```

### AFTER (Fixed):
```typescript
import { generateTransactionId } from "@hyperscape/shared";
import type { LootResult, PendingLootTransaction } from "@hyperscape/shared";

const LOOT_TIMEOUT_MS = 5000;  // 5 seconds before auto-rollback

export function LootWindow({
  visible,
  corpseId,
  corpseName,
  lootItems,
  onClose,
  world,
}: LootWindowProps) {
  const [items, setItems] = useState<InventoryItem[]>(lootItems);

  // NEW: Shadow state tracking
  const [pendingTransactions, setPendingTransactions] = useState<Map<string, PendingLootTransaction>>(
    new Map()
  );
  const [removedItems, setRemovedItems] = useState<Map<string, InventoryItem>>(
    new Map()  // For rollback: transactionId -> original item
  );

  // Update items when prop changes
  useEffect(() => {
    setItems(lootItems);
  }, [lootItems, corpseId]);

  // NEW: Listen for loot results from server
  useEffect(() => {
    const handleLootResult = (result: LootResult) => {
      const pending = pendingTransactions.get(result.transactionId);
      if (!pending) return;  // Not our transaction

      if (result.success) {
        // Confirmed! Remove from pending, keep item removed
        setPendingTransactions((prev) => {
          const next = new Map(prev);
          next.delete(result.transactionId);
          return next;
        });
        setRemovedItems((prev) => {
          const next = new Map(prev);
          next.delete(result.transactionId);
          return next;
        });
      } else {
        // Rejected! Rollback the item
        rollbackTransaction(result.transactionId, result.reason);
      }
    };

    // Listen for network loot results
    const handleNetworkMessage = (event: { type: string; data: unknown }) => {
      if (event.type === 'lootResult') {
        handleLootResult(event.data as LootResult);
      }
    };

    world.on('network:message', handleNetworkMessage);
    world.on(EventType.LOOT_RESULT, handleLootResult);

    return () => {
      world.off('network:message', handleNetworkMessage);
      world.off(EventType.LOOT_RESULT, handleLootResult);
    };
  }, [pendingTransactions, world]);

  // NEW: Timeout handler for lost responses
  useEffect(() => {
    const timeoutInterval = setInterval(() => {
      const now = Date.now();
      pendingTransactions.forEach((pending, transactionId) => {
        if (now - pending.requestedAt > LOOT_TIMEOUT_MS) {
          console.warn(`[LootWindow] Transaction ${transactionId} timed out, rolling back`);
          rollbackTransaction(transactionId, 'TIMEOUT');
        }
      });
    }, 1000);  // Check every second

    return () => clearInterval(timeoutInterval);
  }, [pendingTransactions]);

  /**
   * Rollback a failed or timed-out loot transaction
   */
  const rollbackTransaction = (transactionId: string, reason?: string) => {
    const originalItem = removedItems.get(transactionId);
    const pending = pendingTransactions.get(transactionId);

    if (originalItem && pending) {
      // Restore item to its original position
      setItems((prev) => {
        const next = [...prev];
        // Insert at original index (or end if index invalid)
        const insertIndex = Math.min(pending.originalIndex, next.length);
        next.splice(insertIndex, 0, originalItem);
        return next;
      });

      // Show error message
      world.emit(EventType.UI_MESSAGE, {
        message: reason === 'TIMEOUT'
          ? "Loot request timed out, try again"
          : `Failed to loot: ${reason}`,
        type: "error",
      });
    }

    // Clean up tracking
    setPendingTransactions((prev) => {
      const next = new Map(prev);
      next.delete(transactionId);
      return next;
    });
    setRemovedItems((prev) => {
      const next = new Map(prev);
      next.delete(transactionId);
      return next;
    });
  };

  const handleTakeItem = (item: InventoryItem, index: number) => {
    const localPlayer = world.getPlayer();
    if (!localPlayer) return;

    // Generate transaction ID for tracking
    const transactionId = generateTransactionId();

    // Track pending transaction BEFORE sending
    const pending: PendingLootTransaction = {
      transactionId,
      itemId: item.itemId,
      quantity: item.quantity,
      requestedAt: Date.now(),
      originalIndex: index,
    };
    setPendingTransactions((prev) => new Map(prev).set(transactionId, pending));

    // Store original item for rollback
    setRemovedItems((prev) => new Map(prev).set(transactionId, item));

    // Send loot request WITH transactionId
    if (world.network?.send) {
      world.network.send("entityEvent", {
        id: "world",
        event: EventType.CORPSE_LOOT_REQUEST,
        payload: {
          corpseId,
          playerId: localPlayer.id,
          itemId: item.itemId,
          quantity: item.quantity,
          slot: index,
          transactionId,  // NEW: Include transaction ID
        },
      });
    }

    // Optimistic remove (can be rolled back)
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTakeAll = () => {
    const localPlayer = world.getPlayer();
    if (!localPlayer) return;

    // Take each item with its own transaction
    items.forEach((item, index) => {
      // Small delay between requests to avoid overwhelming server
      setTimeout(() => handleTakeItem(item, index), index * 50);
    });
  };

  // ... rest of component unchanged ...
}
```

---

## B.5: DS-C01 - Equipment Duplication Race Window

**File:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`

### BEFORE (Current - Lines 446-497):
```typescript
// Line 446-454: Equipment READ
let equipmentItems: InventoryItem[] = [];
if (equipmentSystem) {
  const equipment = equipmentSystem.getPlayerEquipment(playerId);
  if (equipment) {
    equipmentItems = this.convertEquipmentToInventoryItems(equipment, playerId);
  }
}

itemsToDrop = [...inventoryItems, ...equipmentItems];

// ... 40 LINES OF OTHER CODE ...
// Lines 461-491: Gravestone/wilderness handling, death lock creation

// Line 493-497: Equipment CLEARED (50 lines later!)
await inventorySystem.clearInventoryImmediate(playerId);

if (equipmentSystem && equipmentSystem.clearEquipmentImmediate) {
  await equipmentSystem.clearEquipmentImmediate(playerId);
}
// RACE WINDOW: Server crash between 454 and 497 = items duplicated!
```

### AFTER (Fixed):
```typescript
// NEW: Atomic equipment operation that reads AND clears in one call
// This MUST happen inside the transaction to prevent duplication

await databaseSystem.executeInTransaction(async (tx: TransactionContext) => {
  // Step 1: Get inventory items (same as before)
  const inventory = inventorySystem.getInventory(playerId);
  const inventoryItems = inventory?.items.map((item, index) => ({
    id: `death_${playerId}_${Date.now()}_${index}`,
    itemId: item.itemId,
    quantity: item.quantity,
    slot: item.slot,
    metadata: null,
  })) || [];

  // Step 2: ATOMIC equipment read-and-clear
  // Equipment is read AND cleared in a single operation
  let equipmentItems: InventoryItem[] = [];
  if (equipmentSystem && equipmentSystem.clearEquipmentAndReturn) {
    // NEW METHOD: Returns items AND clears in one atomic operation
    equipmentItems = await equipmentSystem.clearEquipmentAndReturn(playerId, tx);
  } else if (equipmentSystem) {
    // Fallback for backwards compatibility (less safe)
    const equipment = equipmentSystem.getPlayerEquipment(playerId);
    if (equipment) {
      equipmentItems = this.convertEquipmentToInventoryItems(equipment, playerId);
    }
  }

  // Step 3: ATOMIC inventory clear (pass transaction!)
  await inventorySystem.clearInventoryImmediate(playerId, tx);

  // Step 4: All items to drop (now safe - equipment already cleared)
  itemsToDrop = [...inventoryItems, ...equipmentItems];

  // Step 5: Zone detection and handler dispatch
  const zoneType = this.zoneDetection.getZoneType(deathPosition);

  if (zoneType === ZoneType.SAFE_AREA) {
    // Store for gravestone creation after respawn
    this.pendingGravestones.set(playerId, {
      position: deathPosition,
      items: itemsToDrop,
      killedBy,
      zoneType,
    });

    await this.deathStateManager.createDeathLock(
      playerId,
      {
        gravestoneId: "",
        position: deathPosition,
        zoneType: ZoneType.SAFE_AREA,
        itemCount: itemsToDrop.length,
        items: itemsToDrop,  // NEW: Store actual items for recovery (P0-003)
        killedBy,            // NEW: Store killer for recovery (P0-003)
      },
      tx,
    );
  } else {
    // Wilderness: spawn ground items inside transaction
    await this.wildernessHandler.handleDeath(
      playerId,
      deathPosition,
      itemsToDrop,
      killedBy,
      zoneType,
      tx,  // CRITICAL: Pass transaction context!
    );
  }
});
// If we reach here, transaction committed - items safely dropped, equipment cleared
```

### NEW EQUIPMENT METHOD:

**File:** `packages/shared/src/systems/shared/character/EquipmentSystem.ts`

```typescript
/**
 * Atomically clear equipment and return the items
 *
 * CRITICAL: This operation must be atomic to prevent duplication.
 * Items are removed from equipment in the same operation that returns them.
 *
 * @param playerId - Player whose equipment to clear
 * @param tx - Transaction context for database atomicity
 * @returns Array of inventory items that were equipped
 */
async clearEquipmentAndReturn(
  playerId: string,
  tx?: TransactionContext,
): Promise<InventoryItem[]> {
  const equipment = this.playerEquipment.get(playerId);
  if (!equipment) {
    return [];
  }

  // Convert equipment to inventory items FIRST
  const items: InventoryItem[] = [];
  const timestamp = Date.now();
  const slots = ["weapon", "shield", "helmet", "body", "legs", "arrows"];

  for (const slotName of slots) {
    const equipSlot = equipment[slotName as keyof typeof equipment];
    if (equipSlot && equipSlot.item) {
      items.push({
        id: `death_equipped_${playerId}_${slotName}_${timestamp}`,
        itemId: equipSlot.item.id,
        quantity: equipSlot.item.quantity || 1,
        slot: -1,
        metadata: null,
      });

      // Clear the slot IMMEDIATELY after capturing
      equipment[slotName as keyof typeof equipment] = { item: null };
    }
  }

  // Clear bonus cache
  equipment.bonuses = {
    attack: 0,
    strength: 0,
    defense: 0,
    ranged: 0,
    constitution: 0,
  };

  // Persist to database INSIDE transaction
  if (this.world.isServer && this.databaseSystem) {
    await this.saveEquipmentToDatabase(playerId, tx);
  }

  // Emit UI update
  this.emitTypedEvent(EventType.UI_EQUIPMENT_UPDATE, {
    playerId,
    equipment: {
      weapon: null,
      shield: null,
      helmet: null,
      body: null,
      legs: null,
      arrows: null,
    },
  });

  return items;
}

private async saveEquipmentToDatabase(
  playerId: string,
  tx?: TransactionContext,  // NEW: Accept transaction context
): Promise<void> {
  // ... existing implementation but use tx if provided ...
  await this.databaseSystem.savePlayerEquipmentAsync(playerId, dbEquipment, tx);
}
```

---

## B.6: DS-C04 - Ground Items Spawned Inside Transaction

**File:** `packages/shared/src/systems/shared/death/WildernessDeathHandler.ts`

### BEFORE (Current - Approximate):
```typescript
async handleDeath(
  playerId: string,
  position: { x: number; y: number; z: number },
  items: InventoryItem[],
  killedBy: string,
  zoneType: ZoneType,
  tx?: TransactionContext,  // Transaction passed but not used for spawn!
): Promise<void> {
  // Death lock created inside transaction
  await this.deathStateManager.createDeathLock(
    playerId,
    { groundItemIds: [], position, zoneType, itemCount: items.length },
    tx,  // Uses transaction
  );

  // Ground items spawned OUTSIDE transaction!
  const groundItemIds = await this.groundItemManager.spawnGroundItems(
    items,
    position,
    {
      despawnTime: ticksToMs(COMBAT_CONSTANTS.GROUND_ITEM_DESPAWN_TICKS),
      droppedBy: playerId,
      lootProtection: 0,
      scatter: true,
      scatterRadius: 2.0,
    },
  );
  // If spawnGroundItems fails, death lock exists but items don't!
}
```

### AFTER (Fixed):
```typescript
async handleDeath(
  playerId: string,
  position: { x: number; y: number; z: number },
  items: InventoryItem[],
  killedBy: string,
  zoneType: ZoneType,
  tx?: TransactionContext,
): Promise<void> {
  if (!this.world.isServer) {
    console.error(`[WildernessDeathHandler] Client attempted server-only operation - BLOCKED`);
    return;
  }

  if (items.length === 0) {
    console.log(`[WildernessDeathHandler] No items to drop for ${playerId}`);
    return;
  }

  // CRITICAL: All operations must be inside transaction for atomicity
  // If spawn fails, death lock should also rollback

  // Step 1: Spawn ground items FIRST (can fail)
  // This is the operation most likely to fail, so do it first
  const groundItemIds = await this.groundItemManager.spawnGroundItems(
    items,
    position,
    {
      despawnTime: ticksToMs(COMBAT_CONSTANTS.GROUND_ITEM_DESPAWN_TICKS),
      droppedBy: playerId,
      lootProtection: this.calculateLootProtection(zoneType, killedBy),
      scatter: true,
      scatterRadius: 2.0,
    },
    tx,  // NEW: Pass transaction to ground item system
  );

  // If spawn failed (returned empty array when items existed), throw to rollback
  if (groundItemIds.length === 0 && items.length > 0) {
    const errorMsg = `Failed to spawn ground items for ${playerId}`;
    console.error(`[WildernessDeathHandler] ${errorMsg}`);
    if (tx) {
      throw new Error(errorMsg);  // Trigger transaction rollback
    }
    return;
  }

  // Step 2: Create death lock with ground item IDs (inside same transaction)
  await this.deathStateManager.createDeathLock(
    playerId,
    {
      groundItemIds,
      position,
      zoneType,
      itemCount: items.length,
      items: items.map(i => ({ itemId: i.itemId, quantity: i.quantity })),  // For recovery
      killedBy,
    },
    tx,
  );

  console.log(
    `[WildernessDeathHandler] Dropped ${groundItemIds.length} ground items for ${playerId}`,
  );
}

private calculateLootProtection(zoneType: ZoneType, killedBy: string): number {
  // PvP kills: 60 seconds protection for killer
  if (killedBy.startsWith('player_') || killedBy.startsWith('user_')) {
    return ticksToMs(100);  // 100 ticks = 60 seconds
  }
  // PvE deaths: no protection
  return 0;
}
```

### UPDATED GROUND ITEM SYSTEM:

**File:** `packages/shared/src/systems/shared/economy/GroundItemSystem.ts`

```typescript
/**
 * Spawn multiple ground items with optional transaction context
 *
 * @param items - Items to spawn
 * @param position - Base position for spawning
 * @param options - Spawn options (despawn time, scatter, etc.)
 * @param tx - Optional transaction context for atomic operations
 * @returns Array of spawned entity IDs (empty on failure)
 */
async spawnGroundItems(
  items: InventoryItem[],
  position: { x: number; y: number; z: number },
  options: GroundItemOptions,
  tx?: TransactionContext,  // NEW: Accept transaction context
): Promise<string[]> {
  if (!this.world.isServer) {
    console.error(`[GroundItemSystem] Client attempted server-only spawn - BLOCKED`);
    return [];
  }

  const entityIds: string[] = [];
  const spawnedItems: Array<{ id: string; data: GroundItemData }> = [];

  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      let itemPosition = { ...position };
      if (options.scatter) {
        const radius = options.scatterRadius || 2.0;
        itemPosition = {
          x: position.x + (Math.random() - 0.5) * radius,
          y: position.y,
          z: position.z + (Math.random() - 0.5) * radius,
        };
      }

      const entityId = await this.spawnGroundItem(
        item.itemId,
        item.quantity,
        itemPosition,
        options,
        tx,  // Pass transaction through
      );

      if (entityId) {
        entityIds.push(entityId);
        spawnedItems.push({
          id: entityId,
          data: this.groundItems.get(entityId)!,
        });
      }
    }

    // All items spawned successfully
    return entityIds;
  } catch (error) {
    // Spawn failed - clean up any items that were created
    console.error(`[GroundItemSystem] Batch spawn failed, cleaning up ${spawnedItems.length} items`);

    for (const { id } of spawnedItems) {
      this.groundItems.delete(id);
      // Remove entity if it was created
      if (this.entityManager) {
        this.entityManager.destroyEntity(id);
      }
    }

    // If in transaction, re-throw to trigger rollback
    if (tx) {
      throw error;
    }

    return [];
  }
}
```

---

## B.7: DS-C06 - Death Lock Acquisition Race Condition

**File:** `packages/shared/src/systems/shared/death/DeathStateManager.ts`

### BEFORE (Current - Lines 98-164 + 243-281):
```typescript
// Line 243-281: Check for existing death lock
async hasActiveDeathLock(playerId: string): Promise<boolean> {
  if (this.activeDeaths.has(playerId)) {
    return true;
  }
  // ... database fallback check ...
  return false;
}

// In PlayerDeathSystem.ts (Line 392-399):
const hasActiveDeathLock = await this.deathStateManager.hasActiveDeathLock(playerId);
if (hasActiveDeathLock) {
  return;  // Already dead
}

// ... 80 LINES OF CODE ...

// Line 472-481: Create death lock
await this.deathStateManager.createDeathLock(playerId, {...}, tx);
// RACE WINDOW: Two deaths can both pass hasActiveDeathLock check!
```

### AFTER (Fixed):
```typescript
/**
 * Atomically acquire a death lock for a player
 *
 * CRITICAL: This is a compare-and-swap operation that checks AND creates
 * in a single atomic operation to prevent race conditions.
 *
 * @param playerId - Player to acquire death lock for
 * @param options - Death lock options
 * @param tx - Transaction context for atomicity
 * @returns true if lock acquired, false if player already has active death
 */
async acquireDeathLock(
  playerId: string,
  options: {
    gravestoneId?: string;
    groundItemIds?: string[];
    position: { x: number; y: number; z: number };
    zoneType: ZoneType;
    itemCount: number;
    items?: Array<{ itemId: string; quantity: number }>;
    killedBy?: string;
  },
  tx?: TransactionContext,
): Promise<boolean> {
  if (!this.world.isServer) {
    console.error(`[DeathStateManager] Client attempted lock acquisition - BLOCKED`);
    return false;
  }

  // Step 1: Check in-memory cache (fast path)
  if (this.activeDeaths.has(playerId)) {
    console.warn(`[DeathStateManager] Player ${playerId} already has in-memory death lock`);
    return false;
  }

  // Step 2: Atomic check-and-create in database
  if (this.databaseSystem) {
    try {
      // Use database-level atomicity (INSERT with ON CONFLICT)
      const acquired = await this.databaseSystem.acquireDeathLockAsync(
        {
          playerId,
          gravestoneId: options.gravestoneId || null,
          groundItemIds: options.groundItemIds || [],
          position: options.position,
          timestamp: Date.now(),
          zoneType: options.zoneType,
          itemCount: options.itemCount,
          items: options.items || [],
          killedBy: options.killedBy || 'unknown',
        },
        tx,
      );

      if (!acquired) {
        console.warn(`[DeathStateManager] Database rejected death lock for ${playerId} (already exists)`);
        return false;
      }
    } catch (error) {
      console.error(`[DeathStateManager] Failed to acquire death lock for ${playerId}:`, error);
      if (tx) throw error;
      return false;
    }
  }

  // Step 3: Add to in-memory cache (after database confirms)
  const deathData: DeathLock = {
    playerId,
    gravestoneId: options.gravestoneId,
    groundItemIds: options.groundItemIds,
    position: options.position,
    timestamp: Date.now(),
    zoneType: options.zoneType,
    itemCount: options.itemCount,
  };
  this.activeDeaths.set(playerId, deathData);

  console.log(
    `[DeathStateManager] Acquired death lock for ${playerId}: ${options.itemCount} items, zone: ${options.zoneType}`,
  );

  return true;
}
```

### NEW DATABASE METHOD:

**File:** `packages/server/src/systems/database/DatabaseSystem.ts`

```typescript
/**
 * Atomically acquire a death lock using INSERT ... ON CONFLICT DO NOTHING
 *
 * This prevents race conditions by using database-level atomicity.
 * If a lock already exists, the INSERT is rejected and we return false.
 *
 * @returns true if lock acquired, false if already exists
 */
async acquireDeathLockAsync(
  data: {
    playerId: string;
    gravestoneId: string | null;
    groundItemIds: string[];
    position: { x: number; y: number; z: number };
    timestamp: number;
    zoneType: string;
    itemCount: number;
    items: Array<{ itemId: string; quantity: number }>;
    killedBy: string;
  },
  tx?: TransactionContext,
): Promise<boolean> {
  const db = tx || this.db;

  try {
    // Use INSERT with ON CONFLICT to atomically check-and-create
    const result = await db.execute(sql`
      INSERT INTO player_deaths (
        "playerId",
        "gravestoneId",
        "groundItemIds",
        position,
        timestamp,
        "zoneType",
        "itemCount",
        items,
        "killedBy",
        recovered,
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${data.playerId},
        ${data.gravestoneId},
        ${JSON.stringify(data.groundItemIds)},
        ${JSON.stringify(data.position)},
        ${data.timestamp},
        ${data.zoneType},
        ${data.itemCount},
        ${JSON.stringify(data.items)},
        ${data.killedBy},
        false,
        ${Date.now()},
        ${Date.now()}
      )
      ON CONFLICT ("playerId") DO NOTHING
      RETURNING "playerId"
    `);

    // If INSERT succeeded, result will have the playerId
    // If ON CONFLICT triggered, result will be empty
    return result.rows.length > 0;
  } catch (error) {
    console.error(`[DatabaseSystem] acquireDeathLockAsync failed:`, error);
    throw error;
  }
}
```

### UPDATED PLAYERDEATH SYSTEM:

**File:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`

```typescript
private async processPlayerDeath(
  playerId: string,
  deathPosition: { x: number; y: number; z: number },
  killedBy: string,
): Promise<void> {
  if (!this.world.isServer) {
    return;
  }

  // Death cooldown check (still use timestamp)
  const lastDeath = this.lastDeathTime.get(playerId) || 0;
  if (Date.now() - lastDeath < this.DEATH_COOLDOWN) {
    console.warn(`[PlayerDeathSystem] Death spam: ${playerId}`);
    return;
  }

  // Get database system
  const databaseSystem = this.world.getSystem("database") as DatabaseSystemLike | null;
  if (!databaseSystem?.executeInTransaction) {
    console.error("[PlayerDeathSystem] DatabaseSystem not available");
    return;
  }

  // ... get inventory and equipment systems ...

  let itemsToDrop: InventoryItem[] = [];

  try {
    await databaseSystem.executeInTransaction(async (tx: TransactionContext) => {
      // Collect items first
      const inventoryItems = /* ... */;
      const equipmentItems = await equipmentSystem?.clearEquipmentAndReturn(playerId, tx) || [];
      await inventorySystem.clearInventoryImmediate(playerId, tx);
      itemsToDrop = [...inventoryItems, ...equipmentItems];

      const zoneType = this.zoneDetection.getZoneType(deathPosition);

      // ATOMIC LOCK ACQUISITION (replaces separate check + create)
      const lockAcquired = await this.deathStateManager.acquireDeathLock(
        playerId,
        {
          gravestoneId: zoneType === ZoneType.SAFE_AREA ? "" : undefined,
          position: deathPosition,
          zoneType,
          itemCount: itemsToDrop.length,
          items: itemsToDrop.map(i => ({ itemId: i.itemId, quantity: i.quantity })),
          killedBy,
        },
        tx,
      );

      if (!lockAcquired) {
        // Player already has active death - abort transaction
        throw new Error(`Player ${playerId} already has active death lock`);
      }

      // Safe area: store for gravestone after respawn
      if (zoneType === ZoneType.SAFE_AREA) {
        this.pendingGravestones.set(playerId, {
          position: deathPosition,
          items: itemsToDrop,
          killedBy,
          zoneType,
        });
      } else {
        // Wilderness: spawn ground items inside transaction
        await this.wildernessHandler.handleDeath(
          playerId,
          deathPosition,
          itemsToDrop,
          killedBy,
          zoneType,
          tx,
        );
      }
    });

    // Update death cooldown AFTER successful commit
    this.lastDeathTime.set(playerId, Date.now());

    // Post-death cleanup (entity state, animations, etc.)
    this.postDeathCleanup(playerId, deathPosition, itemsToDrop, killedBy);
  } catch (error) {
    if ((error as Error).message.includes('already has active death lock')) {
      console.warn(`[PlayerDeathSystem] ${error}`);
      return;  // Not an error - player just died twice quickly
    }
    console.error(`[PlayerDeathSystem] Death transaction failed:`, error);
    throw error;
  }
}
```

---

## B.8: TRANSACTION FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DEATH SYSTEM TRANSACTION FLOW                          │
│                         (After All Fixes Applied)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Player Health → 0                                                          │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                 DATABASE TRANSACTION START                          │   │
│  │                                                                     │   │
│  │  1. Equipment: clearEquipmentAndReturn(playerId, tx)                │   │
│  │     └── Returns items AND clears atomically                         │   │
│  │                                                                     │   │
│  │  2. Inventory: clearInventoryImmediate(playerId, tx)                │   │
│  │     └── Returns items AND clears atomically                         │   │
│  │                                                                     │   │
│  │  3. Death Lock: acquireDeathLock(playerId, items, tx)               │   │
│  │     └── Atomic check-and-create (INSERT ON CONFLICT)                │   │
│  │     └── Stores items[] and killedBy for crash recovery              │   │
│  │                                                                     │   │
│  │  4a. IF Safe Zone:                                                  │   │
│  │      └── Store in pendingGravestones (memory)                       │   │
│  │      └── Gravestone spawned AFTER respawn                           │   │
│  │                                                                     │   │
│  │  4b. IF Wilderness:                                                 │   │
│  │      └── spawnGroundItems(items, position, tx)                      │   │
│  │      └── Ground items tracked in death lock                         │   │
│  │                                                                     │   │
│  │  5. COMMIT (all changes atomic)                                     │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                    │
│        ▼ On Success                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                 POST-DEATH CLEANUP (Non-Transactional)              │   │
│  │                                                                     │   │
│  │  - Set player death state (entity.data.deathState = DYING)          │   │
│  │  - Play death animation                                             │   │
│  │  - Schedule respawn tick                                            │   │
│  │  - Emit AUDIT_LOG event                                             │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         RESPAWN TICK                                │   │
│  │                                                                     │   │
│  │  - Teleport to spawn point                                          │   │
│  │  - Restore health                                                   │   │
│  │  - IF Safe Zone: Spawn gravestone now                               │   │
│  │  - Emit PLAYER_RESPAWNED                                            │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                          CRASH RECOVERY FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Server Restart                                                             │
│        │                                                                    │
│        ▼                                                                    │
│  DeathStateManager.init()                                                   │
│        │                                                                    │
│        ▼                                                                    │
│  recoverUnfinishedDeaths()                                                  │
│        │                                                                    │
│        ▼                                                                    │
│  SELECT * FROM player_deaths WHERE recovered = false                        │
│        │                                                                    │
│        ▼ For each death:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. Check if gravestone/ground items still exist                    │   │
│  │                                                                     │   │
│  │  2. IF entities exist: Just restore in-memory state                 │   │
│  │                                                                     │   │
│  │  3. IF entities missing: Recreate from items[] column               │   │
│  │     └── Safe zone: Emit DEATH_RECOVERED → spawn gravestone          │   │
│  │     └── Wilderness: Emit DEATH_RECOVERED → spawn ground items       │   │
│  │                                                                     │   │
│  │  4. Mark recovered = true in database                               │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                           LOOT OPERATION FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Client: Click Item in LootWindow                                           │
│        │                                                                    │
│        ▼                                                                    │
│  1. Generate transactionId                                                  │
│  2. Store in pendingTransactions (shadow state)                             │
│  3. Optimistically remove from UI                                           │
│  4. Send CORPSE_LOOT_REQUEST with transactionId                             │
│        │                                                                    │
│        ▼                                                                    │
│  Server: HeadstoneEntity.processLootRequest()                               │
│        │                                                                    │
│        ├── Check loot protection                                            │
│        ├── Check item exists (atomic)                                       │
│        ├── Check inventory space                                            │
│        ├── Remove from gravestone                                           │
│        ├── Add to player inventory                                          │
│        │                                                                    │
│        ▼                                                                    │
│  Emit LOOT_RESULT { transactionId, success, itemId, quantity }              │
│        │                                                                    │
│        ▼                                                                    │
│  Client: handleLootResult()                                                 │
│        │                                                                    │
│        ├── IF success: Remove from pendingTransactions (confirm)            │
│        │                                                                    │
│        └── IF failure: rollbackTransaction()                                │
│              └── Restore item to UI at original index                       │
│              └── Show error message                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## B.9: VERIFICATION CHECKLIST

### After Implementing P0-002 (TOCTOU):
- [ ] transactionId flows from client to server
- [ ] LOOT_RESULT event emitted on success AND failure
- [ ] Client receives confirmation within 5 seconds
- [ ] UI shows error on loot failure

### After Implementing P0-005 (Recovery):
- [ ] Server startup loads unrecovered deaths
- [ ] Gravestones recreated from stored items
- [ ] Deaths marked recovered after processing
- [ ] No duplicate items on restart

### After Implementing P0-006 (Shadow State):
- [ ] pendingTransactions tracks all in-flight loot requests
- [ ] Items rollback after 5 second timeout
- [ ] Items rollback on LOOT_RESULT failure
- [ ] No stuck "optimistically removed" items

### After Implementing DS-C01 (Equipment Race):
- [ ] Equipment cleared INSIDE transaction
- [ ] clearEquipmentAndReturn() is atomic
- [ ] No 50-line gap between read and clear
- [ ] Server crash during death = no equipment duplication

### After Implementing DS-C04 (Ground Items Tx):
- [ ] spawnGroundItems() accepts transaction context
- [ ] Spawn failure triggers transaction rollback
- [ ] Death lock not created if spawn fails
- [ ] Partial spawns cleaned up on failure

### After Implementing DS-C06 (Death Lock Race):
- [ ] acquireDeathLock() is atomic check-and-create
- [ ] Uses INSERT ON CONFLICT DO NOTHING
- [ ] Returns false if lock already exists
- [ ] No hasActiveDeathLock() + createDeathLock() gap

---

**Appendix Version:** B.1
**Code Snippets:** 6 complex issues
**New Types:** 5 interfaces, 3 enums
**New Methods:** 4 database methods, 2 system methods
