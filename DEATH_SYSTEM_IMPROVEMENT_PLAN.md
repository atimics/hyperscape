# Death/Respawn System Improvement Plan

**Goal:** Achieve 9/10 production readiness score
**Current Score:** 7.5/10
**Target Score:** 9/10+
**Estimated Total Time:** 30-45 minutes for Phase 1-2 (required for 9/10)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Verified Issues](#verified-issues)
3. [Critical Finding: pendingGravestones](#critical-finding-pendinggravestones-cannot-be-deleted)
4. [Phase 1: Critical Fixes](#phase-1-critical-fixes-required-for-910)
5. [Phase 2: Code Consistency](#phase-2-code-consistency-recommended-for-910)
6. [Phase 3: Architecture Improvements](#phase-3-architecture-improvements-for-9510)
7. [Verification & Testing](#verification--testing)
8. [Score Projection](#score-projection)

---

## Executive Summary

The death/respawn system has excellent architecture (server authority, dual persistence, tick-based timing) but has verified bugs that must be fixed for production deployment.

**Safe fixes identified:**
1. Silent promise rejection in `processTick` (async not caught)
2. `lastDeathTime` Map not cleaned on disconnect (memory leak)
3. Inconsistent `currentTick` access pattern

**Unsafe fix identified (DO NOT IMPLEMENT):**
- Deleting `pendingGravestones` on disconnect would cause **item loss**

---

## Verified Issues

### Issue Verification Matrix

| # | Issue | File:Line | Verified | Severity | Safe to Fix? |
|---|-------|-----------|----------|----------|--------------|
| 1 | Async `handleGravestoneExpire` not awaited | `SafeAreaDeathHandler.ts:238` | ✅ | **Critical** | ✅ YES |
| 2 | `lastDeathTime` not cleaned on disconnect | `PlayerDeathSystem.ts:1187-1191` | ✅ | **High** | ✅ YES |
| 3 | `pendingGravestones` not cleaned on disconnect | `PlayerDeathSystem.ts:1187-1191` | ✅ | High | ❌ **NO** |
| 4 | Inconsistent `currentTick` access pattern | Multiple files | ✅ | Medium | ✅ YES |
| 5 | Multiple sources of truth for death state | Architectural | ✅ | Medium | ⚠️ Requires design |
| 6 | ZoneDetectionSystem cache unbounded | `ZoneDetectionSystem.ts:22` | ✅ | Low | ✅ YES |

---

## Critical Finding: pendingGravestones Cannot Be Deleted

### Why Deleting `pendingGravestones` on Disconnect Causes Item Loss

**The Problem:** For safe area deaths, items are stored ONLY in `pendingGravestones` (in-memory) until the player respawns. The gravestone is NOT spawned until AFTER respawn.

**Death Flow Analysis:**
```
SAFE AREA DEATH:
1. Player dies
2. Inventory/equipment cleared from DB
3. Items stored in pendingGravestones (MEMORY ONLY - NOT IN DB!)
4. Death lock created in DB (contains position, but NO ITEMS!)
5. Death animation plays...
6. Player disconnects BEFORE respawning
7. PLAYER_UNREGISTERED fires

WITHOUT pendingGravestones.delete():
8. pendingGravestones still has items ✓
9. Player reconnects
10. initiateRespawn() → pendingGravestones.get(playerId) returns items ✓
11. Gravestone spawned with items ✓

WITH pendingGravestones.delete():
8. pendingGravestones DELETED ← items lost here!
9. Player reconnects
10. initiateRespawn() → pendingGravestones.get(playerId) returns undefined
11. NO gravestone spawned, items PERMANENTLY LOST ✗
```

**Evidence from Code:**

`PlayerDeathSystem.ts:465-481` - Items stored in memory only:
```typescript
if (zoneType === ZoneType.SAFE_AREA) {
  this.pendingGravestones.set(playerId, {
    position: deathPosition,
    items: itemsToDrop,  // ← Items stored here, NOT in DB
    killedBy,
    zoneType,
  });

  await this.deathStateManager.createDeathLock(
    playerId,
    {
      gravestoneId: "",   // ← Empty! No gravestone yet
      position: deathPosition,
      zoneType: ZoneType.SAFE_AREA,
      itemCount: itemsToDrop.length,  // ← Only count, not actual items!
    },
    tx,
  );
}
```

`PlayerDeathSystem.ts:770-778` - Items retrieved on respawn:
```typescript
const gravestoneData = this.pendingGravestones.get(playerId);
if (gravestoneData && gravestoneData.items.length > 0) {
  this.spawnGravestoneAfterRespawn(
    playerId,
    gravestoneData.position,
    gravestoneData.items,  // ← Need this data!
    gravestoneData.killedBy,
  );
  this.pendingGravestones.delete(playerId);
}
```

### Existing Bug (Pre-existing, Not Caused by Our Fixes)

There's already an item loss bug if the **server restarts** between disconnect and reconnect:
- `pendingGravestones` is in-memory only
- Server restart clears all in-memory data
- Items are lost

**This is NOT something we're introducing - it's a pre-existing architectural issue.**

### Proper Fix (Phase 3)

The correct solution is to either:
1. **Persist `pendingGravestones` to database** - Store items in death lock
2. **Spawn gravestone immediately on death** - Not waiting for respawn

This requires architectural changes and is deferred to Phase 3.

---

## Phase 1: Critical Fixes (Required for 9/10)

**Estimated Time:** 10-15 minutes

### Fix 1.1: Add Error Handling to Async Gravestone Expiration

**File:** `packages/shared/src/systems/shared/death/SafeAreaDeathHandler.ts`
**Line:** 238
**Risk:** NONE - purely additive error handling

#### Current Code (Lines 236-239):
```typescript
    // Process expired gravestones
    for (const gravestoneData of expiredGravestones) {
      this.handleGravestoneExpire(gravestoneData, currentTick);
    }
```

#### Fixed Code:
```typescript
    // Process expired gravestones
    for (const gravestoneData of expiredGravestones) {
      this.handleGravestoneExpire(gravestoneData, currentTick).catch((err) => {
        console.error(
          `[SafeAreaDeathHandler] Gravestone expiration failed for ${gravestoneData.gravestoneId}:`,
          err,
        );
      });
    }
```

#### Why This Is Safe:
- The async function was already being called, just without error handling
- Adding `.catch()` doesn't change execution flow
- Errors are now logged instead of silently swallowed
- Each gravestone expiration is independent; one failure shouldn't block others

---

### Fix 1.2: Clean Up `lastDeathTime` on Player Disconnect

**File:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`
**Lines:** 1187-1191
**Risk:** NONE - death cooldown should reset on disconnect

#### Current Code (Lines 1187-1191):
```typescript
  private cleanupPlayerDeath(data: { id: string }): void {
    const playerId = data.id;
    this.clearDeathLocation(playerId);
    this.playerPositions.delete(playerId);
  }
```

#### Fixed Code:
```typescript
  private cleanupPlayerDeath(data: { id: string }): void {
    const playerId = data.id;
    this.clearDeathLocation(playerId);
    this.playerPositions.delete(playerId);
    this.lastDeathTime.delete(playerId);
    // NOTE: Do NOT delete pendingGravestones - items would be lost on reconnect!
    // See DEATH_SYSTEM_IMPROVEMENT_PLAN.md for details.
  }
```

#### Why This Is Safe:
- `lastDeathTime` only affects death cooldown (10 second spam prevention)
- If player disconnects, their death cooldown SHOULD reset
- The cooldown is for preventing rapid deaths in same session, not across sessions
- No item loss, no state corruption

#### Why We Do NOT Delete `pendingGravestones`:
- Contains actual items for safe area deaths
- Items are NOT stored in database until gravestone spawns
- Deleting would cause permanent item loss on reconnect
- See [Critical Finding](#critical-finding-pendinggravestones-cannot-be-deleted) above

---

### Phase 1 Verification

After completing Fix 1.1 and 1.2, run:

```bash
# Build to verify no TypeScript errors
bun run build:shared

# Expected output: "Build completed successfully!"
```

---

## Phase 2: Code Consistency (Recommended for 9/10)

**Estimated Time:** 20-30 minutes
**Risk:** NONE - `currentTick` is initialized to 0, adding `?? 0` is purely defensive

### Fix 2.1: Standardize `currentTick` Access Pattern

**Problem:** Some files use `this.world.currentTick` directly, others use `?? 0` for defensive coding. While `currentTick` is initialized to 0 in World.ts, the inconsistency creates confusion.

**Standard Pattern:**
```typescript
const currentTick = this.world.currentTick ?? 0;
```

#### Files Requiring Updates:

| File | Line | Current | Fixed |
|------|------|---------|-------|
| SafeAreaDeathHandler.ts | 123 | `this.world.currentTick` | `this.world.currentTick ?? 0` |
| GroundItemSystem.ts | 172 | `this.world.currentTick` | `this.world.currentTick ?? 0` |
| InventorySystem.ts | 920 | `this.world.currentTick` | `this.world.currentTick ?? 0` |
| CombatSystem.ts | 347 | `this.world.currentTick` | `this.world.currentTick ?? 0` |
| CombatSystem.ts | 920 | `this.world.currentTick` | `this.world.currentTick ?? 0` |
| CombatSystem.ts | 2209 | `this.world.currentTick` | `this.world.currentTick ?? 0` |
| CombatSystem.ts | 2288 | `this.world.currentTick` | `this.world.currentTick ?? 0` |
| PlayerSystem.ts | 785 | `this.world.currentTick` | `this.world.currentTick ?? 0` |
| PlayerSystem.ts | 1309 | `this.world.currentTick` | `this.world.currentTick ?? 0` |

**Total: 9 changes across 5 files**

#### Detailed Changes:

##### SafeAreaDeathHandler.ts:123
```typescript
// Current:
    const currentTick = this.world.currentTick;
// Fixed:
    const currentTick = this.world.currentTick ?? 0;
```

##### GroundItemSystem.ts:172
```typescript
// Current:
    const currentTick = this.world.currentTick;
// Fixed:
    const currentTick = this.world.currentTick ?? 0;
```

##### InventorySystem.ts:920
```typescript
// Current:
        const currentTick = this.world.currentTick;
// Fixed:
        const currentTick = this.world.currentTick ?? 0;
```

##### CombatSystem.ts:347
```typescript
// Current:
    const currentTick = this.world.currentTick;
// Fixed:
    const currentTick = this.world.currentTick ?? 0;
```

##### CombatSystem.ts:920
```typescript
// Current:
    const currentTick = this.world.currentTick;
// Fixed:
    const currentTick = this.world.currentTick ?? 0;
```

##### CombatSystem.ts:2209
```typescript
// Current:
      currentTick: this.world.currentTick,
// Fixed:
      currentTick: this.world.currentTick ?? 0,
```

##### CombatSystem.ts:2288
```typescript
// Current:
    const tick = this.world.currentTick;
// Fixed:
    const tick = this.world.currentTick ?? 0;
```

##### PlayerSystem.ts:785
```typescript
// Current:
      (playerEntity as unknown as { lastDamageTick: number }).lastDamageTick =
        this.world.currentTick;
// Fixed:
      (playerEntity as unknown as { lastDamageTick: number }).lastDamageTick =
        this.world.currentTick ?? 0;
```

##### PlayerSystem.ts:1309
```typescript
// Current:
      (playerEntity as unknown as { lastDamageTick: number }).lastDamageTick =
        this.world.currentTick;
// Fixed:
      (playerEntity as unknown as { lastDamageTick: number }).lastDamageTick =
        this.world.currentTick ?? 0;
```

---

### Phase 2 Verification

```bash
# Build all changed files
bun run build:shared

# Run tests
bun test
```

---

## Phase 3: Architecture Improvements (For 9.5/10)

**Estimated Time:** 2-4 hours
**Priority:** Optional - addresses pre-existing architectural issues

### Fix 3.1: Persist `pendingGravestones` to Database

**Problem:** Items for safe area deaths are stored only in memory until respawn. If server restarts, items are lost.

**Current State:**
```
Death Lock in DB:
- playerId ✓
- position ✓
- zoneType ✓
- itemCount ✓
- items ✗ (NOT STORED!)
```

**Proposed State:**
```
Death Lock in DB:
- playerId ✓
- position ✓
- zoneType ✓
- itemCount ✓
- items ✓ (STORED AS JSON!)
```

**Implementation:**

1. **Update `DeathLock` type** (`packages/shared/src/types/death/death-types.ts`):
```typescript
export interface DeathLock {
  playerId: string;
  gravestoneId?: string;
  groundItemIds?: string[];
  position: { x: number; y: number; z: number };
  timestamp: number;
  zoneType: ZoneType;
  itemCount: number;
  items?: InventoryItem[];  // ADD THIS
}
```

2. **Update `createDeathLock` call** (`PlayerDeathSystem.ts:472-481`):
```typescript
await this.deathStateManager.createDeathLock(
  playerId,
  {
    gravestoneId: "",
    position: deathPosition,
    zoneType: ZoneType.SAFE_AREA,
    itemCount: itemsToDrop.length,
    items: itemsToDrop,  // ADD THIS
  },
  tx,
);
```

3. **Update `onPlayerReconnect`** to restore items from DB
4. **Update `initiateRespawn`** to use items from death lock if `pendingGravestones` is empty
5. **Update database schema** to store items JSON
6. **NOW it's safe to delete `pendingGravestones` on disconnect**

**Risk:** Medium - requires careful testing of all death flows

---

### Fix 3.2: Add Cache Limits to ZoneDetectionSystem

**File:** `packages/shared/src/systems/shared/death/ZoneDetectionSystem.ts`

**Add after line 23:**
```typescript
private readonly MAX_CACHE_SIZE = 10000;
```

**Add in `getZoneProperties()` before `this.zoneCache.set()`:**
```typescript
// Evict oldest entry if cache is full (simple LRU)
if (this.zoneCache.size >= this.MAX_CACHE_SIZE) {
  const oldestKey = this.zoneCache.keys().next().value;
  if (oldestKey) {
    this.zoneCache.delete(oldestKey);
  }
}
```

---

## Verification & Testing

### Build Verification

```bash
# Clean build
bun run build:shared

# Expected: No errors, "Build completed successfully!"
```

### Manual Test Cases

#### Test Case 1: Gravestone Expiration (Tests Fix 1.1)
1. Die in safe zone (gravestone spawns)
2. Wait for gravestone expiration (or temporarily reduce `GRAVESTONE_TICKS`)
3. **Verify:** Items transition to ground items
4. **Verify:** No errors in server console (errors would now be logged)

#### Test Case 2: Death Cooldown Reset (Tests Fix 1.2)
1. Die and respawn
2. Disconnect
3. Reconnect
4. Immediately attack mob and die
5. **Verify:** Death processes normally (not blocked by stale cooldown)

#### Test Case 3: Safe Area Reconnect (Regression Test)
1. Die in safe zone
2. **Immediately disconnect** (before respawn animation finishes)
3. Reconnect to **same server instance**
4. **Verify:** Player respawns
5. **Verify:** Gravestone spawns with items at death location

#### Test Case 4: Rapid Death/Respawn
1. Die and respawn
2. Immediately attack mob and die again
3. **Verify:** Second death processes correctly
4. **Verify:** No "already has active death lock" warning

---

## Score Projection

| Phase | Fixes Applied | Time | Score | Breaking Changes? |
|-------|---------------|------|-------|-------------------|
| Current | None | - | 7.5/10 | - |
| **Phase 1** | Async error handling + lastDeathTime cleanup | 15 min | **8.5/10** | ❌ None |
| **Phase 2** | currentTick consistency | 20 min | **9.0/10** | ❌ None |
| Phase 3 | Persist items to DB + cache limits | 2-4 hrs | 9.5/10 | ⚠️ DB schema change |

**Minimum for 9/10:** Complete Phase 1 + Phase 2

---

## Quick Reference: All Safe Code Changes

### Phase 1 Changes (Copy-Paste Ready)

#### SafeAreaDeathHandler.ts:236-239
```typescript
    // Process expired gravestones
    for (const gravestoneData of expiredGravestones) {
      this.handleGravestoneExpire(gravestoneData, currentTick).catch((err) => {
        console.error(
          `[SafeAreaDeathHandler] Gravestone expiration failed for ${gravestoneData.gravestoneId}:`,
          err,
        );
      });
    }
```

#### PlayerDeathSystem.ts:1187-1193
```typescript
  private cleanupPlayerDeath(data: { id: string }): void {
    const playerId = data.id;
    this.clearDeathLocation(playerId);
    this.playerPositions.delete(playerId);
    this.lastDeathTime.delete(playerId);
    // NOTE: Do NOT delete pendingGravestones - items would be lost on reconnect!
    // See DEATH_SYSTEM_IMPROVEMENT_PLAN.md for details.
  }
```

---

## Summary of What's Safe vs Unsafe

| Change | Safe? | Why |
|--------|-------|-----|
| Add `.catch()` to async call | ✅ | Purely additive, captures errors that were silently swallowed |
| Delete `lastDeathTime` on disconnect | ✅ | Only affects cooldown, should reset on disconnect |
| Delete `pendingGravestones` on disconnect | ❌ | **Causes item loss** - items not in DB until gravestone spawns |
| Add `?? 0` to currentTick | ✅ | Defensive coding, currentTick already initialized to 0 |
| Add cache limits to ZoneDetection | ✅ | Prevents unbounded memory growth |
| Persist items to DB (Phase 3) | ✅ | Fixes root cause, then pendingGravestones can be safely deleted |

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2024-01-16 | 1.0 | Initial plan created |
| 2024-01-16 | 1.1 | **CRITICAL:** Removed pendingGravestones.delete() - causes item loss |
