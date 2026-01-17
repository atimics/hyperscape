# Death System: Dependent Systems Audit

**Audit Date:** 2026-01-17
**Purpose:** Identify issues in systems that death/respawn relies on
**Status:** Critical issues found in 7 dependent systems

---

## Executive Summary

The death system depends on **7 major subsystems**. Deep analysis revealed **23 additional critical/high issues** not covered in the original death system audit. These must be addressed for the death system to achieve 9.5/10.

| Dependent System | Status | Critical Issues | High Issues |
|------------------|--------|-----------------|-------------|
| InventorySystem | Good | 0 | 2 |
| EquipmentSystem | **CRITICAL** | 2 | 2 |
| GroundItemSystem | **CRITICAL** | 3 | 2 |
| CombatSystem | High Risk | 1 | 3 |
| Client Death UX | High Risk | 1 | 4 |
| ZoneDetectionSystem | **CRITICAL** | 2 | 2 |
| EntityManager | **CRITICAL** | 2 | 3 |
| **Total** | | **11** | **18** |

---

# SYSTEM 1: InventorySystem

**File:** `packages/shared/src/systems/shared/character/InventorySystem.ts`
**Integration Points:** `clearInventoryImmediate()`, transaction locks, pickup atomicity

## Status: GOOD (Minor Issues)

The InventorySystem has excellent death integration with proper atomic operations.

### Issues Found

#### INV-001: clearInventoryImmediate Missing Transaction Context (HIGH)

**Location:** Lines 1848-1865

**Problem:** Method doesn't accept transaction context parameter, preventing true atomicity with death lock creation.

**Current:**
```typescript
async clearInventoryImmediate(playerId: string): Promise<number> {
  // No transaction context
  await this.persistInventoryImmediate(playerId);
}
```

**Fix:**
```typescript
async clearInventoryImmediate(playerId: string, tx?: TransactionContext): Promise<number> {
  await this.persistInventoryImmediate(playerId, tx);
}
```

**Effort:** 1 hour

---

#### INV-002: Death Spam Check In-Memory Only (HIGH)

**Location:** PlayerDeathSystem.ts lines 386-390

**Problem:** `lastDeathTime` Map is lost on server restart, allowing rapid deaths after restart.

**Fix:** Persist death cooldown to database or check death lock existence instead.

**Effort:** 30 min

---

# SYSTEM 2: EquipmentSystem

**File:** `packages/shared/src/systems/shared/character/EquipmentSystem.ts`
**Integration Points:** `clearEquipmentImmediate()`, equipment-to-item conversion

## Status: CRITICAL (Race Conditions)

### Issues Found

#### EQP-001: Equipment Duplication Race Window (CRITICAL)

**Location:** PlayerDeathSystem.ts lines 446-496

**Problem:** Equipment is converted to droppable items BEFORE being cleared:

```typescript
// Line 446-453: Get equipment (READS equipment)
let equipmentItems: InventoryItem[] = [];
if (equipmentSystem) {
  const equipment = equipmentSystem.getPlayerEquipment(playerId);
  equipmentItems = this.convertEquipmentToInventoryItems(equipment);
}

// Line 461: Add to drop list (CREATES drops)
itemsToDrop = [...inventoryItems, ...equipmentItems];

// Line 495-496: Clear equipment (MODIFIES equipment) - 50 lines later!
if (equipmentSystem) {
  await equipmentSystem.clearEquipmentImmediate(playerId);
}
```

**Attack Vector:**
1. Player dies, equipment read
2. Server crashes between line 461 and 496
3. Player reconnects with equipment still equipped
4. Items ALSO appear on ground

**Result:** Item duplication

**Fix:** Clear equipment BEFORE creating drop list, or use single atomic operation:
```typescript
// Atomic: Get and clear in one operation
const equipmentItems = await equipmentSystem.clearAndReturnEquipment(playerId, tx);
```

**Effort:** 2 hours

---

#### EQP-002: Equipment Save May Not Rollback (CRITICAL)

**Location:** EquipmentSystem.ts line 561

**Problem:** `saveEquipmentToDatabase()` called inside transaction but as independent operation:

```typescript
// In clearEquipmentImmediate (line 561):
await this.saveEquipmentToDatabase(playerId);  // Independent DB call
```

If parent transaction rolls back, this save may not roll back.

**Fix:** Pass transaction context to equipment save:
```typescript
async clearEquipmentImmediate(playerId: string, tx?: TransactionContext): Promise<void> {
  // ... clear slots ...
  await this.saveEquipmentToDatabase(playerId, tx);
}
```

**Effort:** 1 hour

---

#### EQP-003: No Verify-Before-Clear Pattern (HIGH)

**Location:** EquipmentSystem.ts lines 506-564

**Problem:** Equipment cleared in memory before verifying drops were successfully created.

**Fix:** Verify gravestone/ground items exist before clearing equipment.

**Effort:** 1 hour

---

#### EQP-004: Equipment Reload on Respawn Edge Case (HIGH)

**Location:** EquipmentSystem.ts lines 179-182

**Problem:** If `clearEquipmentImmediate()` fails but `PLAYER_RESPAWNED` fires, equipment reloads from database (not cleared).

**Fix:** Check death lock exists before reloading equipment on respawn.

**Effort:** 30 min

---

# SYSTEM 3: GroundItemSystem

**File:** `packages/shared/src/systems/shared/economy/GroundItemSystem.ts`
**Integration Points:** `spawnGroundItems()`, loot protection, despawn timing

## Status: CRITICAL (Multiple Race Conditions)

### Issues Found

#### GND-001: Batch Spawn No Rollback (CRITICAL)

**Location:** Lines 359-407

**Problem:** If spawning 10 items and item 8 fails, items 1-7 are orphaned:

```typescript
for (const item of items) {
  const entityId = this.spawnGroundItem(item, scatterPos, options);
  if (entityId) {
    spawnedIds.push(entityId);
  }
  // NO ROLLBACK if spawn fails
}
```

**Impact:** Partial item loss during wilderness death.

**Fix:**
```typescript
// Collect all or rollback all
const spawnedIds: string[] = [];
try {
  for (const item of items) {
    const entityId = this.spawnGroundItem(item, scatterPos, options);
    if (!entityId) throw new Error(`Failed to spawn ${item.itemId}`);
    spawnedIds.push(entityId);
  }
} catch (error) {
  // Rollback: destroy all spawned items
  for (const id of spawnedIds) {
    this.removeGroundItem(id);
  }
  throw error;
}
```

**Effort:** 2 hours

---

#### GND-002: Ground Items Spawned Outside Transaction (CRITICAL)

**Location:** SafeAreaDeathHandler.ts line 275, WildernessDeathHandler.ts line 77

**Problem:** Ground items spawned outside the death transaction:

```typescript
// SafeAreaDeathHandler.handleGravestoneExpire() - called from processTick()
const groundItemIds = await this.groundItemManager.spawnGroundItems(items, position);
// No transaction context!
```

**Impact:** Death lock exists but items don't exist after failed spawn.

**Fix:** Pass transaction context to spawnGroundItems or make atomic with death state update.

**Effort:** 3 hours

---

#### GND-003: Concurrent Pickup Race Condition (CRITICAL)

**Location:** InventorySystem pickup flow

**Problem:** Two players picking up same item simultaneously:

```
Tick 100:
  Player A: passes canPickup() → addItem() → removeGroundItem() SUCCESS
  Player B: passes canPickup() → addItem() → removeGroundItem() FAILS (already gone)
           → Rollback removes item from B's inventory

But both players briefly see item in inventory!
```

**Current Mitigation:** `pickupLocks` Map only prevents same player double-pickup.

**Fix:** Server-side global lock per ground item ID:
```typescript
const globalPickupLocks = new Map<string, string>(); // itemId → playerId

if (globalPickupLocks.has(itemId)) {
  return; // Another player already picking up
}
globalPickupLocks.set(itemId, playerId);
try {
  // ... pickup logic ...
} finally {
  globalPickupLocks.delete(itemId);
}
```

**Effort:** 1 hour

---

#### GND-004: ItemEntity Dual Despawn System (HIGH)

**Location:** ItemEntity.ts lines 325-331 vs GroundItemSystem tick processing

**Problem:** Two separate despawn mechanisms:

```typescript
// ItemEntity.checkDespawn() - HARDCODED 10 minutes
const despawnTime = spawnTime + 10 * 60 * 1000;

// GroundItemSystem.processTick() - Configurable (2-3 min for death items)
if (currentTick >= item.despawnTick) { ... }
```

ItemEntity despawn triggers at 10 minutes regardless of GroundItemSystem timer.

**Impact:** Breaks pile management, inconsistent despawn times.

**Fix:** Remove ItemEntity.checkDespawn() entirely, let GroundItemSystem handle all despawns.

**Effort:** 30 min

---

#### GND-005: Visibility Phases Not Network Integrated (HIGH)

**Location:** Lines 558-572

**Problem:** `isVisibleTo()` implements visibility phases but network layer ignores it:

```typescript
// Line 556 comment: "Phase 5: Public - all players can see"
// But ALL clients receive ALL ground items regardless of phase
```

**Impact:** Players see protected items they can't loot (confusing UX).

**Fix:** Filter ground item broadcasts by loot protection phase.

**Effort:** 2 hours

---

# SYSTEM 4: CombatSystem

**File:** `packages/shared/src/systems/shared/combat/CombatSystem.ts`
**Integration Points:** Damage application, ENTITY_DEATH emission, kill tracking

## Status: HIGH RISK (Death Triggering Issues)

### Issues Found

#### CMB-001: Death Lock Acquisition Race Condition (CRITICAL)

**Location:** PlayerDeathSystem.ts lines 392-399

**Problem:** Check-then-create gap allows double death:

```typescript
// Line 392-394: CHECK
const hasActiveDeathLock = await this.deathStateManager.hasActiveDeathLock(playerId);
if (hasActiveDeathLock) return;

// ... 80 lines of code ...

// Line 472: CREATE - Race window!
await this.deathStateManager.createDeathLock(playerId, ...);
```

**Fix:** Atomic check-and-create:
```typescript
const acquired = await this.deathStateManager.acquireDeathLock(playerId, tx);
if (!acquired) return; // Already has lock
```

**Effort:** 1 hour

---

#### CMB-002: Double Death Prevention Incomplete (HIGH)

**Location:** PlayerDeathSystem.ts line 387

**Problem:** `lastDeathTime` cooldown only prevents processing, not ENTITY_DEATH event emission.

Multiple ENTITY_DEATH events can fire on same tick before cooldown check.

**Fix:** Add atomic flag in HealthComponent to prevent multiple ENTITY_DEATH emissions.

**Effort:** 1 hour

---

#### CMB-003: Combat Cleanup Before Death Event (HIGH)

**Location:** CombatSystem.ts lines 873-889

**Problem:** `handleEntityDied()` clears combat state BEFORE PlayerDeathSystem processes death.

**Impact:** Combat state needed for kill attribution may be gone.

**Fix:** Emit ENTITY_DEATH first, then cleanup combat state in listener.

**Effort:** 1 hour

---

#### CMB-004: No Attacker Validation at Damage Apply (HIGH)

**Location:** CombatSystem.ts lines 836-888

**Problem:** Attacker ID not re-validated when damage applied. Dead attacker could register as killer.

**Fix:** Verify attacker still alive before applying damage.

**Effort:** 30 min

---

# SYSTEM 5: Client Death Experience

**Files:** `packages/client/src/game/CoreUI.tsx`, `packages/shared/src/entities/player/PlayerLocal.ts`
**Integration Points:** Death screen, respawn button, input blocking

## Status: HIGH RISK (UX Issues + Exploits)

### Issues Found

#### CLI-001: No Respawn Button Disable (CRITICAL)

**Location:** CoreUI.tsx lines 352-397

**Problem:** Respawn button stays clickable after click - spam-clicking sends multiple packets.

```typescript
const handleRespawn = () => {
  network.send("requestRespawn", { playerId: ... });
  // NO: setIsRespawning(true) to disable button
};
```

**Fix:**
```typescript
const [isRespawning, setIsRespawning] = useState(false);

const handleRespawn = () => {
  if (isRespawning) return;
  setIsRespawning(true);
  network.send("requestRespawn", { playerId: ... });
};

<Button disabled={isRespawning}>Click here to respawn</Button>
```

**Effort:** 15 min

---

#### CLI-002: No Server-Side Death Validation (HIGH)

**Location:** PlayerDeathSystem.ts lines 1024-1037

**Problem:** Respawn handler only checks timer exists, not that player is dead:

```typescript
private handleRespawnRequest(data: { playerId: string }): void {
  const timer = this.respawnTimers.get(data.playerId);
  if (timer) {  // Only checks timer, not isPlayerDead()!
    this.initiateRespawn(data.playerId);
  }
}
```

**Fix:**
```typescript
if (!this.isPlayerDead(data.playerId)) {
  console.warn(`[PlayerDeathSystem] Respawn request from non-dead player`);
  return;
}
```

**Effort:** 15 min

---

#### CLI-003: Death Screen Before Input Block (HIGH)

**Location:** CoreUI.tsx + PlayerLocal.ts event handlers

**Problem:** `UI_DEATH_SCREEN` and `PLAYER_SET_DEAD` events arrive independently. Input could slip through.

**Fix:** Block input immediately on death screen display, not just on PLAYER_SET_DEAD.

**Effort:** 30 min

---

#### CLI-004: No Timeout for Lost PLAYER_RESPAWNED (HIGH)

**Location:** PlayerLocal.ts lines 2462-2556

**Problem:** If `PLAYER_RESPAWNED` event lost, player stays invisible/frozen forever.

**Fix:** Add 30-second timeout to auto-unfreeze:
```typescript
setTimeout(() => {
  if (this.isDying) {
    console.warn('[PlayerLocal] Respawn event lost, forcing unfreeze');
    this.handlePlayerRespawned({ playerId: this.id });
  }
}, 30000);
```

**Effort:** 30 min

---

#### CLI-005: No Death Countdown Timer (HIGH)

**Location:** CoreUI.tsx

**Problem:** Death screen receives `respawnTime` but never displays it. Players don't know when they can respawn.

**Fix:** Add countdown timer display.

**Effort:** 1 hour

---

# SYSTEM 6: ZoneDetectionSystem

**File:** `packages/shared/src/systems/shared/death/ZoneDetectionSystem.ts`
**Integration Points:** Zone type determination for death mechanics

## Status: CRITICAL (Boundary Issues)

### Issues Found

#### ZON-001: Inclusive Boundary Collisions (CRITICAL)

**Location:** Lines 103-108, 143-148

**Problem:** Both zone boundaries are inclusive, causing non-deterministic results at boundaries:

```typescript
// Zone A: minX=-150, maxX=150
// Zone B: minX=150, maxX=250
// Position x=150 matches BOTH zones!
// First match wins, but iteration order is non-deterministic
```

**Impact:** Player dying at x=150 could get gravestone OR ground items randomly.

**Fix:** Make one boundary exclusive:
```typescript
// Exclusive on min, inclusive on max
if (position.x > minX && position.x <= maxX) { ... }
```

**Effort:** 30 min

---

#### ZON-002: Cache Grid Boundary Bug (CRITICAL)

**Location:** Lines 184-186

**Problem:** Cache uses 10x10 grid. Positions at boundary within same grid get cached result:

```
Zone boundary at x=100
Position x=99: gridX=9, returns Zone A
Position x=100: gridX=10, could return Zone A or B (boundary)
Position x=105: gridX=10, returns CACHED result from x=100!

If x=100 was cached as Zone A, x=105 also becomes Zone A
But x=105 is clearly in Zone B!
```

**Fix:** Reduce cache granularity or don't cache boundary positions:
```typescript
const CACHE_GRID_SIZE = 1; // Per-position caching
// OR: Skip cache for positions within 1 unit of any boundary
```

**Effort:** 1 hour

---

#### ZON-003: No Zone Overlap Validation (HIGH)

**Location:** Zone loading code

**Problem:** Overlapping zones not detected at startup. Silent wrong results.

**Fix:** Validate no overlaps when loading zone configuration.

**Effort:** 1 hour

---

#### ZON-004: Unknown Zones Default to SAFE (HIGH)

**Location:** Lines 168-175

**Problem:** Positions not in any zone silently default to SAFE_AREA:

```typescript
// Default fallback
return { type: ZoneType.SAFE_AREA, ... };
```

**Impact:** Configuration errors masked. Wilderness areas might be treated as safe.

**Fix:** Log warning or throw error for unknown positions in production.

**Effort:** 30 min

---

# SYSTEM 7: EntityManager

**File:** `packages/shared/src/systems/shared/entities/EntityManager.ts`
**Integration Points:** Gravestone spawning, ground item entities

## Status: CRITICAL (Entity Lifecycle Issues)

### Issues Found

#### ENT-001: Duplicate entityAdded Packets (CRITICAL)

**Location:** Lines 514 and 531

**Problem:** Same entity broadcast twice:

```typescript
// Line 514
network.send("entityAdded", entity.serialize());

// Line 531 - DUPLICATE!
network.send("entityAdded", entity.serialize());
```

**Impact:** Clients may create duplicate entities or process spawn twice.

**Fix:** Remove duplicate broadcast.

**Effort:** 5 min

---

#### ENT-002: Non-Atomic Entity Registration (CRITICAL)

**Location:** Lines 502-506

**Problem:** Entity added to two maps sequentially:

```typescript
this.entities.set(config.id, entity);           // Map 1
this.world.entities.set(config.id, entity);     // Map 2 - race window!
```

**Impact:** Entity queries between these lines may get inconsistent results.

**Fix:** Use single source of truth or atomic update.

**Effort:** 30 min

---

#### ENT-003: ItemEntity Self-Destroy No Network (CRITICAL)

**Location:** ItemEntity.ts lines 325-331

**Problem:** `ItemEntity.checkDespawn()` calls `this.destroy()` directly instead of `EntityManager.destroyEntity()`:

```typescript
if (this.world.getTime() > despawnTime) {
  this.destroy();  // NO network notification!
}
```

**Impact:** Clients still see item after 10 minutes. Phantom ground items.

**Fix:** Call `EntityManager.destroyEntity()` instead:
```typescript
const entityManager = this.world.getSystem("entity-manager");
entityManager?.destroyEntity(this.id);
```

**Effort:** 15 min

---

#### ENT-004: Network Send Before Mesh Destruction (HIGH)

**Location:** Lines 554, 564

**Problem:** `entityRemoved` packet sent before `entity.destroy()` called.

**Impact:** Client receives remove packet but entity still rendering briefly.

**Fix:** Call `entity.destroy()` first, then send network packet.

**Effort:** 15 min

---

#### ENT-005: Entity Events After Removal (HIGH)

**Location:** Lines 575-578

**Problem:** ENTITY_DEATH event emitted AFTER entity removed from maps:

```typescript
this.entities.delete(entityId);      // Remove first
this.world.entities.delete(entityId);
// ...
this.emitTypedEvent(EventType.ENTITY_DEATH, ...);  // Event after!
```

**Impact:** Event listeners can't access entity data.

**Fix:** Emit event before removal, or include entity data in event payload.

**Effort:** 30 min

---

#### ENT-006: Gravestone Spawn After Respawn Timing (HIGH)

**Location:** PlayerDeathSystem.ts lines 771-778, 978

**Problem:** Gravestone spawned AFTER respawn animation completes:

```
1. Player dies → starts death animation
2. Respawn timer expires → player teleports to spawn
3. THEN gravestone spawns at death location
```

If player disconnects during animation, `pendingGravestones` cleared and no gravestone spawns.

**Fix:** Spawn gravestone immediately on death, not after respawn.

**Effort:** 2 hours

---

# SUMMARY: All New Issues

## Critical (11)

| ID | System | Issue | Effort |
|----|--------|-------|--------|
| EQP-001 | Equipment | Duplication race window | 2h |
| EQP-002 | Equipment | Save may not rollback | 1h |
| GND-001 | GroundItems | Batch spawn no rollback | 2h |
| GND-002 | GroundItems | Spawn outside transaction | 3h |
| GND-003 | GroundItems | Concurrent pickup race | 1h |
| CMB-001 | Combat | Death lock race condition | 1h |
| CLI-001 | Client | Respawn button spam | 15m |
| ZON-001 | Zones | Boundary collisions | 30m |
| ZON-002 | Zones | Cache grid boundary bug | 1h |
| ENT-001 | Entity | Duplicate packets | 5m |
| ENT-003 | Entity | Self-destroy no network | 15m |

## High (18)

| ID | System | Issue | Effort |
|----|--------|-------|--------|
| INV-001 | Inventory | Missing transaction context | 1h |
| INV-002 | Inventory | Death spam in-memory | 30m |
| EQP-003 | Equipment | No verify-before-clear | 1h |
| EQP-004 | Equipment | Reload on respawn edge case | 30m |
| GND-004 | GroundItems | Dual despawn system | 30m |
| GND-005 | GroundItems | Visibility not networked | 2h |
| CMB-002 | Combat | Double death incomplete | 1h |
| CMB-003 | Combat | Cleanup before event | 1h |
| CMB-004 | Combat | No attacker validation | 30m |
| CLI-002 | Client | No server death validation | 15m |
| CLI-003 | Client | Input block timing | 30m |
| CLI-004 | Client | No respawn timeout | 30m |
| CLI-005 | Client | No countdown timer | 1h |
| ZON-003 | Zones | No overlap validation | 1h |
| ZON-004 | Zones | Unknown defaults to safe | 30m |
| ENT-002 | Entity | Non-atomic registration | 30m |
| ENT-004 | Entity | Network before destroy | 15m |
| ENT-005 | Entity | Events after removal | 30m |

---

# REVISED EFFORT ESTIMATE

## Original Death System Issues
- P0 (7 issues): 11.5 hours
- P1 (20 issues): 15 hours
- P2 (30 issues): 12 hours
- P3 (17 issues): 6 hours

## New Dependent System Issues
- Critical (11 issues): 12 hours
- High (18 issues): 12.5 hours

## Grand Total
**Original:** 44.5 hours
**New:** 24.5 hours
**Combined:** **69 hours** to achieve 9.5/10+

---

# PRIORITY ORDER

## Phase 0: Critical Blockers (Must Fix First)
1. ENT-001: Duplicate packets (5 min)
2. ENT-003: ItemEntity self-destroy (15 min)
3. CLI-001: Respawn button spam (15 min)
4. ZON-001: Boundary collisions (30 min)

## Phase 1: Transaction Safety
1. EQP-001: Equipment duplication race (2h)
2. EQP-002: Equipment rollback (1h)
3. GND-002: Ground items outside transaction (3h)
4. CMB-001: Death lock race (1h)

## Phase 2: Data Integrity
1. GND-001: Batch spawn rollback (2h)
2. GND-003: Concurrent pickup race (1h)
3. ZON-002: Cache grid bug (1h)
4. INV-001: Transaction context (1h)

## Phase 3: Death System Core (Original P0)
*(As documented in DEATH_SYSTEM_IMPLEMENTATION_PLAN.md)*

## Phase 4: Polish & UX
1. CLI-002 through CLI-005 (Client issues)
2. Remaining HIGH issues

---

**Document Version:** 1.0
**Total New Issues:** 29 (11 Critical, 18 High)
**Recommended:** Fix dependent system issues BEFORE or IN PARALLEL with death system fixes
