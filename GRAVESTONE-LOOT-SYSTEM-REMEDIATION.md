# Gravestone Loot System — Remediation Plan

**Goal**: Bring the gravestone loot system from **4.3/10** to **9/10** minimum across all audit categories.

**Current Scores**:

| Category | Current | Target |
|----------|---------|--------|
| Production Quality | 3/10 | 9/10 |
| OWASP / Security | 4/10 | 9/10 |
| SOLID | 3/10 | 9/10 |
| Clean Code | 4/10 | 9/10 |
| GRASP | 4/10 | 9/10 |
| ECS Architecture | 5/10 | 9/10 |
| Game Programming | 5/10 | 9/10 |
| Race Conditions | 4/10 | 9/10 |
| Memory Management | 7/10 | 9/10 |

---

## Phase 1 — Critical Bugs (P0)

> Fix show-stopping bugs that cause item loss, item duplication, or security exploits.
> **All 3 CRITICALs and the most dangerous HIGHs.**

### 1.1 Wire `DEATH_RECOVERED` event listener

**Problem**: `DeathStateManager.ts:337` emits `DEATH_RECOVERED` but zero subscribers exist. Server-restart crash recovery for offline players silently marks deaths as "recovered" without recreating gravestones. Items are permanently lost.

**Files**: `PlayerDeathSystem.ts`

**Steps**:
1. In `PlayerDeathSystem.init()`, subscribe to `EventType.DEATH_RECOVERED`
2. The handler should call `spawnGravestoneAfterRespawn` (or the replacement from Phase 2) using the recovered `items`, `position`, and `playerId` from the event payload
3. Only process on server (`this.world.isServer`)
4. Add a guard to prevent double-recovery (check `pendingGravestones` and `activeDeaths`)

**Validates**: Player dies → server crashes → server restarts → player is offline → gravestone is recreated with items from the death lock

---

### 1.2 Cancel gravestone expiration timer when items are looted

**Problem**: `PlayerDeathSystem.ts:1340` uses an un-cancellable `setTimeout` for gravestone expiration. When all items are looted before the timer fires, duplicate ground items are spawned.

**Files**: `PlayerDeathSystem.ts`

**Steps**:
1. Store the `setTimeout` return value in a tracked `Map<string, NodeJS.Timeout>` (e.g., `gravestoneTimers`)
2. When all items are looted from a gravestone (in `handleLootCollection` or when `HeadstoneEntity.lootItems` reaches 0), call `clearTimeout` on the stored timer
3. Clean up the timer map entry on gravestone destruction, player disconnect, and system `destroy()`
4. As an interim measure, add a guard at the top of `handleGravestoneExpire`: check whether the gravestone entity still exists AND still has items before spawning ground items

**Validates**: Loot all items from gravestone → wait for timer duration → no duplicate ground items appear

---

### 1.3 Fix `lootResult` event wiring (broken optimistic UI)

**Problem**: `ClientNetwork.onLootResult` emits via `this.world.emit(EventType.UI_UPDATE, ...)` (Pattern B) but `LootWindowPanel` listens on `world.network.on("lootResult", ...)` (Pattern A). Server confirmations/rejections are silently dropped. All loots auto-rollback after 3s.

**Files**: `ClientNetwork.ts`

**Steps**:
1. In `ClientNetwork.onLootResult`, change `this.world.emit(EventType.UI_UPDATE, ...)` to `this.emit("lootResult", data)` (Pattern A, matching how quest handlers work)
2. Verify `LootWindowPanel`'s `handleLootResult` callback now receives the data correctly
3. Remove the dead `world.network.on("lootWindow", ...)` listener from `useModalPanels.ts`

**Validates**: Loot an item → server confirms → item stays removed (no phantom rollback). Server rejects → item reappears immediately with error message.

---

### 1.4 Validate `playerId` against authenticated session in loot requests

**Problem**: `HeadstoneEntity.ts:140-148` takes `playerId` from event payload without cross-referencing authenticated socket identity. A client could spoof `playerId` to loot as the gravestone owner.

**Files**: `ServerNetwork/handlers/` (loot handler or `onEntityInteract`), `HeadstoneEntity.ts`

**Steps**:
1. In the server-side handler that processes `CORPSE_LOOT_REQUEST` events (the `onEntityInteract` path in ServerNetwork), overwrite `data.playerId` with the authenticated `socket.player.id` before forwarding to the entity
2. Do the same for `CORPSE_LOOT_ALL_REQUEST`
3. Add a comment explaining why `playerId` is server-enforced

**Validates**: Malicious client sends loot request with spoofed playerId → server replaces with real playerId → loot permission check uses real identity

---

### 1.5 Await `processPlayerDeath` and handle transaction failures

**Problem**: `PlayerDeathSystem.ts:549` calls `processPlayerDeath` without `await`. If the transaction fails, the player is stuck in `DeathState.DYING` with inventory cleared but no death lock or gravestone.

**Files**: `PlayerDeathSystem.ts`

**Steps**:
1. `await` the call to `processPlayerDeath` in `handlePlayerDeath`
2. Wrap in try/catch: on failure, reset the player's death state back to `ALIVE`, emit `PLAYER_SET_DEAD { isDead: false }`, and log the error
3. If items were already cleared (they shouldn't be if the transaction rolled back), restore from the pre-death inventory snapshot

**Validates**: Transaction fails → player is reset to alive state → can still play normally

---

### 1.6 Pass `tx` to `clearInventoryImmediate` for transactional integrity

**Problem**: `clearInventoryImmediate` at `InventorySystem.ts:2117` persists via its own DB connection, outside the death transaction's scope.

**Files**: `InventorySystem.ts`, `PlayerDeathSystem.ts`

**Steps**:
1. Add an optional `tx` parameter to `clearInventoryImmediate`
2. Pass `tx` through to `persistInventoryImmediate`
3. In `PlayerDeathSystem.processPlayerDeath`, pass the transaction context when calling `clearInventoryImmediate`

**Validates**: Death transaction fails → inventory is NOT cleared (rolls back with the transaction)

---

## Phase 2 — Architecture (P1)

> Consolidate parallel systems, fix timing model, extract responsibilities.
> **Addresses SOLID, ECS, Game Programming, and GRASP scores.**

### 2.1 Consolidate gravestone creation into a single system

**Problem**: Two parallel gravestone systems exist:
- `SafeAreaDeathHandler` (tick-based, has `cancelGravestoneTimer`, tracks in a Map)
- `PlayerDeathSystem.spawnGravestoneAfterRespawn` (setTimeout-based, un-cancellable, no tracking)

The actual safe-area death path uses `spawnGravestoneAfterRespawn`, making `SafeAreaDeathHandler` effectively dead code for the main flow.

**Files**: `PlayerDeathSystem.ts`, `SafeAreaDeathHandler.ts`

**Steps**:
1. Remove `spawnGravestoneAfterRespawn` from `PlayerDeathSystem`
2. Route the safe-area `pendingGravestones` flow through `SafeAreaDeathHandler.handleDeath` instead
3. This gives us tick-based expiration with proper tracking and `cancelGravestoneTimer` support for free
4. After spawning via `SafeAreaDeathHandler`, update the death lock's `gravestoneId` from `""` to the real ID
5. Remove the dead `handleGravestoneExpire` and related `setTimeout` code from `PlayerDeathSystem`
6. Ensure `DEATH_RECOVERED` handler (from 1.1) also routes through `SafeAreaDeathHandler`

**Validates**: Only one gravestone creation path exists. All gravestones use tick-based expiration. `cancelGravestoneTimer` works.

---

### 2.2 Consolidate on tick-based timing (remove all gravestone `setTimeout` usage)

**Problem**: Mixed timing models — `setTimeout` (wall-clock) vs tick-based. Under server load, gravestone lifetimes drift.

**Files**: `PlayerDeathSystem.ts`, `SafeAreaDeathHandler.ts`

**Steps**:
1. After completing 2.1, verify ALL gravestone expiration goes through `SafeAreaDeathHandler.processTick`
2. Remove the stale death lock cleanup `setTimeout` at `PlayerDeathSystem.ts:1389-1398`; replace with a tick-based check in `processTick`
3. Audit for any remaining `setTimeout` calls related to gravestones and convert to tick-based

**Validates**: No `setTimeout` calls remain in gravestone code. All timing is tick-based.

---

### 2.3 Extract `LootSystem` from `HeadstoneEntity`

**Problem**: `HeadstoneEntity` is a 970-line God Class with 12+ responsibilities. Per the project's ECS rules: "All game logic runs through systems, not entity methods."

**Files**: New `LootSystem.ts`, `HeadstoneEntity.ts`

**Steps**:
1. Create `packages/shared/src/systems/shared/loot/LootSystem.ts`
2. Move the following out of `HeadstoneEntity` into `LootSystem`:
   - `handleLootRequest` / `processLootRequest` → `LootSystem.processLoot()`
   - `handleLootAllRequest` / `processLootAllRequest` → `LootSystem.processLootAll()`
   - `canPlayerLoot` → `LootSystem.canPlayerLoot(entityId, playerId)`
   - `checkInventorySpace` → `LootSystem.checkInventorySpace(playerId, itemId)`
   - `lootQueue` (Promise chain) → `LootSystem` owns the queue per entity
   - `lootRateLimiter` → `LootSystem` owns rate limiting
   - `emitLootResult` → `LootSystem.sendLootResult()`
   - Audit log emission
3. `HeadstoneEntity` retains ONLY:
   - `lootItems` array (data)
   - `headstoneData` (data)
   - `removeItem` (data mutation, made private — see 3.2)
   - `getLootItems` (data query)
   - Rendering (mesh, name label, animation)
   - `handleInteraction` (delegates to LootSystem)
4. Register `LootSystem` as `"loot"` system in the World
5. `LootSystem` subscribes to `CORPSE_LOOT_REQUEST` and `CORPSE_LOOT_ALL_REQUEST` events

**Validates**: `HeadstoneEntity` is under 300 lines. All loot business logic is in `LootSystem`. Entity is a data container + renderer.

---

### 2.4 Extract `LootPermissionService`

**Problem**: Loot permission logic is embedded in the entity. Other systems that need permission checks (e.g., future ground item looting) can't reuse it.

**Files**: New `LootPermissionService.ts`, `LootSystem.ts`

**Steps**:
1. Create `packages/shared/src/systems/shared/loot/LootPermissionService.ts`
2. Move `canPlayerLoot` logic here as a pure function: `canPlayerLoot(headstoneData, playerId): { allowed: boolean; reason?: string }`
3. `LootSystem` and `HeadstoneEntity.handleInteraction` both call this service
4. Include owner check, safe-area protection, wilderness timer logic, and the `protectedFor` validation

**Validates**: Permission logic is in one place. Adding new zone types only requires changing one file.

---

### 2.5 Unify loot request preamble (DRY fix)

**Problem**: `handleLootRequest` and `handleLootAllRequest` in HeadstoneEntity duplicate the entire preamble (server check, rate limit, queue chain, error emission). Same for `processLootRequest` and `processLootAllRequest` (canPlayerLoot, deathState, audit log).

**Files**: `LootSystem.ts` (after 2.3 extraction)

**Steps**:
1. Create a shared `validateAndQueueLoot(data, processor)` method that handles:
   - Server authority check
   - Rate limiting
   - Queue chaining
   - Error emission in catch
2. Create a shared `validateLootPermissions(playerId, entityId)` that handles:
   - `canPlayerLoot` check
   - `isPlayerInDeathState` check
   - Common audit log fields
3. Both `processLoot` and `processLootAll` call through these shared methods

**Validates**: Zero duplicated validation code between single-loot and loot-all paths.

---

## Phase 3 — Security Hardening (P1)

> Fix information leaks, access control, and input validation.

### 3.1 Strip `lootItems` from network broadcast for non-owners

**Problem**: `getNetworkData()` sends full `lootItems` array (item IDs, quantities, metadata) and `protectedFor` (killer identity) to ALL connected clients. Information leak that enables targeted PvP.

**Files**: `HeadstoneEntity.ts`

**Steps**:
1. Override `getNetworkData()` to EXCLUDE `lootItems` from the broadcast payload
2. Only include `lootItemCount` (integer) for display purposes (e.g., "5 items")
3. Send full `lootItems` only to the owner via the targeted `corpseLoot` packet (already exists in `handleInteraction`)
4. Keep `protectedFor` server-side only — clients don't need to know who has protection
5. Apply the same stripping to `serialize()`

**Validates**: Non-owner client inspects network traffic → sees only item count, not item details. Owner opens loot panel → sees full item list.

---

### 3.2 Make `removeItem` private and enforce access through LootSystem

**Problem**: `HeadstoneEntity.removeItem` is public. Any code with an entity reference can bypass the loot queue, permission checks, rate limiting, and inventory validation.

**Files**: `HeadstoneEntity.ts`, `LootSystem.ts`

**Steps**:
1. Change `removeItem` visibility to `private`
2. If external systems need to remove items (e.g., gravestone expiration converting to ground items), expose a controlled `consumeAllItems(): InventoryItem[]` method that:
   - Returns and clears all items atomically
   - Can only be called by server
   - Marks the entity for despawn
3. `LootSystem` accesses `removeItem` via a friend pattern or by being the only caller within the entity's module

**Validates**: External code cannot call `removeItem` directly. All loot goes through `LootSystem`.

---

### 3.3 Add runtime validation on event payloads

**Problem**: Event handlers cast `data: unknown` directly to structured types with no runtime type checking.

**Files**: `LootSystem.ts`, `HeadstoneEntity.ts`, `ClientNetwork.ts`

**Steps**:
1. Create a `validateLootRequestPayload(data: unknown): LootRequestData | null` type guard
2. Create a `validateLootAllPayload(data: unknown): LootAllRequestData | null` type guard
3. Use these in `LootSystem` event handlers before processing
4. On the client side, add `validateCorpseLootPacket(data: unknown)` in `ClientNetwork.onCorpseLoot`
5. Log and reject malformed payloads

**Validates**: Malformed event data → rejected with log → no silent undefined propagation

---

## Phase 4 — Client Robustness (P1)

> Fix the loot panel race conditions and dead code.

### 4.1 Add double-click guard on loot items

**Problem**: No debounce on individual item clicks. Rapid double-click can loot the wrong item due to array index shifting after optimistic removal.

**Files**: `LootWindowPanel.tsx`

**Steps**:
1. Track which item indices have pending transactions in a `Set<number>`
2. Before processing a click, check if the index is already pending — if so, ignore
3. Alternatively, disable (grey out) items that have pending transactions using a `pendingIndices` state
4. Use `itemId` instead of array index as the transaction key to avoid index-shift issues

**Validates**: Double-click same item → second click ignored. No wrong-item loots.

---

### 4.2 Remove dead code from client loot path

**Problem**: `world.network.on("lootWindow", ...)` in `useModalPanels.ts` is dead code. `_isValidHeadstoneConfig` in `HeadstoneEntity.ts` is dead code.

**Files**: `useModalPanels.ts`, `HeadstoneEntity.ts`

**Steps**:
1. Remove the `world.network.on("lootWindow", ...)` listener from `useModalPanels.ts`
2. Remove the `_isValidHeadstoneConfig` function from `HeadstoneEntity.ts`
3. Clean up any imports that become unused

**Validates**: No dead code remains in the loot path.

---

### 4.3 Fix hardcoded `zoneType: "safe_area"` in audit logs

**Problem**: All three audit log emissions in `HeadstoneEntity` hardcode `"safe_area"` regardless of actual death zone.

**Files**: `HeadstoneEntity.ts` (or `LootSystem.ts` after Phase 2)

**Steps**:
1. Add a `zoneType` field to `HeadstoneData` (set at gravestone creation based on the actual death zone)
2. Use `this.headstoneData.zoneType` in audit log emissions instead of hardcoded `"safe_area"`
3. Update `SafeAreaDeathHandler` and `WildernessDeathHandler` to pass the correct zone type

**Validates**: Wilderness death gravestone → audit log shows `"wilderness"`, not `"safe_area"`

---

## Phase 5 — Race Condition Fixes (P2)

### 5.1 Fix partial-stack rollback corruption

**Problem**: `processLootRequest` at `HeadstoneEntity.ts:384-413` — after `removeItem` decrements a partial stack, if `checkInventorySpace` fails, the rollback uses `push()` which appends a NEW entry, splitting the item into two entries with the same ID.

**Files**: `LootSystem.ts` (after Phase 2)

**Steps**:
1. Before calling `removeItem`, snapshot the item's current state (index, quantity)
2. On rollback, restore the item at its original index with the correct quantity (use `splice` instead of `push`)
3. If the item was fully removed (not a partial stack), re-insert at the original index
4. Add a unit-testable helper: `rollbackItem(items, snapshot)`

**Validates**: Partial stack loot → inventory full → item restored at original position with correct quantity. No duplicate entries.

---

### 5.2 Fix despawn `setTimeout` double-fire

**Problem**: If two items are looted in rapid succession both reducing `lootItems` to 0, two `setTimeout` despawn calls fire.

**Files**: `HeadstoneEntity.ts`

**Steps**:
1. Add a `despawnScheduled` flag to `HeadstoneEntity`
2. In `removeItem`, only schedule the despawn `setTimeout` if `!this.despawnScheduled`
3. Set `despawnScheduled = true` when scheduling
4. Guard the `setTimeout` callback with `if (this.destroyed) return`

**Validates**: Loot last two items rapidly → only one despawn fires → no double-destroy attempt

---

### 5.3 Separate `checkInventorySpace` from UI side effects

**Problem**: `checkInventorySpace` is a query that also emits "Your inventory is full!" messages. The defensive re-check during rollback sends duplicate messages.

**Files**: `LootSystem.ts` (after Phase 2)

**Steps**:
1. Make `checkInventorySpace` a pure query — returns `{ hasSpace: boolean; reason?: string }` with NO side effects
2. The caller (processLoot) sends the UI message based on the return value
3. The defensive re-check skips the UI message

**Validates**: Rollback path → no "inventory full" message sent to player

---

## Phase 6 — Memory & Cleanup (P2)

### 6.1 Register HeadstoneEntity listeners via `worldListeners`

**Problem**: HeadstoneEntity registers listeners via `this.world.on()` but doesn't add them to `this.worldListeners`. Cleanup depends on the override `destroy()` always being called.

**Files**: `HeadstoneEntity.ts`

**Steps**:
1. Use the base class `addWorldListener` method (or manually add to `this.worldListeners`) for all `this.world.on()` calls
2. This ensures `clearEventListeners()` in the base class automatically cleans up even if the subclass `destroy()` is bypassed

**Validates**: Base class `destroy()` called → all listeners cleaned up. No leak.

---

### 6.2 Clean `pendingGravestones` on player disconnect

**Problem**: If `initiateRespawn` throws before consuming the `pendingGravestones` entry, the entry leaks until system destroy.

**Files**: `PlayerDeathSystem.ts`

**Steps**:
1. In `cleanupPlayerDeath` (called on `PLAYER_UNREGISTERED`), also delete from `pendingGravestones`

**Validates**: Player disconnects during death → no `pendingGravestones` entry remains

---

### 6.3 Fix `clearDeathLock` DB failure handling

**Problem**: `DeathStateManager.clearDeathLock` clears in-memory state first, then if DB delete fails, the death lock persists in DB and gets "recovered" on restart (potential item duplication).

**Files**: `DeathStateManager.ts`

**Steps**:
1. Attempt DB delete first
2. Only clear in-memory state after DB succeeds
3. On DB failure, keep in-memory state so the system stays consistent
4. Add a retry mechanism or flag for later cleanup

**Validates**: DB delete fails → in-memory state preserved → no inconsistency on restart

---

## Phase 7 — Final Polish (P3)

### 7.1 Replace magic string system lookups with typed accessors

**Problem**: All system access uses `this.world.getSystem("string") as unknown as { ... }` double-cast pattern.

**Files**: `HeadstoneEntity.ts`, `LootSystem.ts`, `PlayerDeathSystem.ts`, `SafeAreaDeathHandler.ts`

**Steps**:
1. Define typed system interfaces (e.g., `IInventorySystemAccess`, `IEntityManagerAccess`)
2. Create a typed accessor on World: `getTypedSystem<T>(name: string): T | null`
3. Replace all double-cast patterns with typed accessor calls
4. Compile-time detection of API changes

---

### 7.2 Remove `SafeAreaDeathHandler` duplication after consolidation

**Problem**: After Phase 2.1 consolidation, verify no dead paths remain.

**Steps**:
1. Audit all callers of `SafeAreaDeathHandler` and `PlayerDeathSystem` gravestone methods
2. Remove any unused methods, dead imports, and orphaned code
3. Verify the `processTick` forwarding chain is clean

---

### 7.3 Make death state transitions atomic with the transaction

**Problem**: `DeathState.DYING` is set before the transaction. If the transaction fails, the state is not rolled back.

**Files**: `PlayerDeathSystem.ts`

**Steps**:
1. Move the `DeathState.DYING` assignment inside the transaction block
2. On transaction failure (with the catch from 1.5), reset to `DeathState.ALIVE`
3. Ensure `PLAYER_SET_DEAD` event emission is also gated on transaction success

---

### 7.4 Stackability check fix

**Problem**: `checkInventorySpace` assumes any item with the same `itemId` is stackable. Non-stackable items with the same ID would incorrectly stack.

**Files**: `LootSystem.ts` (after Phase 2)

**Steps**:
1. Look up the item definition to check a `stackable` property before allowing stacking
2. If no `stackable` flag exists in the item definition schema, add one
3. Non-stackable items with the same ID should each occupy a separate inventory slot

---

## Verification Checklist

After all phases are complete, re-audit against each category:

- [ ] **Production Quality (9/10)**: Zero CRITICALs, zero HIGHs. Crash recovery works. No item duplication or loss paths. Optimistic UI correctly reflects server state.
- [ ] **OWASP / Security (9/10)**: playerId validated server-side. Loot data not broadcast. removeItem not publicly accessible. Runtime validation on all event payloads.
- [ ] **SOLID (9/10)**: HeadstoneEntity under 300 lines (data + rendering only). LootSystem handles all loot logic. Single gravestone creation path. Typed system accessors.
- [ ] **Clean Code (9/10)**: Zero DRY violations in loot path. No dead code. CQS respected (queries don't emit UI messages). No hardcoded values.
- [ ] **GRASP (9/10)**: Information Expert respected (inventory checks delegated to InventorySystem). Low coupling (typed interfaces). High cohesion (rendering separate from logic).
- [ ] **ECS Architecture (9/10)**: Entity is data container + renderer. All business logic in systems. Event wiring is correct and complete.
- [ ] **Game Programming (9/10)**: All timing is tick-based. Death state machine is atomic. Observer pattern fully wired (DEATH_RECOVERED has a listener, lootResult reaches the panel).
- [ ] **Race Conditions (9/10)**: Rollback restores items correctly. Double-click guarded. removeItem is private. Despawn can't double-fire. Loot queue covers all mutation paths.
- [ ] **Memory Management (9/10)**: All listeners tracked via worldListeners. pendingGravestones cleaned on disconnect. clearDeathLock is DB-first. No timer leaks.

---

## Execution Order

```
Phase 1 (Critical Bugs)     ████████████  — Do first, these are live issues
  1.1  DEATH_RECOVERED listener
  1.2  Cancel gravestone timer
  1.3  Fix lootResult wiring
  1.4  Validate playerId
  1.5  Await processPlayerDeath
  1.6  Pass tx to clearInventoryImmediate

Phase 2 (Architecture)      ████████████  — Structural changes, do as a batch
  2.1  Consolidate gravestone creation
  2.2  Tick-based timing only
  2.3  Extract LootSystem
  2.4  Extract LootPermissionService
  2.5  Unify loot preamble (DRY)

Phase 3 (Security)          ████████      — After architecture is clean
  3.1  Strip lootItems from broadcast
  3.2  Make removeItem private
  3.3  Runtime payload validation

Phase 4 (Client)            ██████        — Can parallel with Phase 3
  4.1  Double-click guard
  4.2  Remove dead code
  4.3  Fix hardcoded zoneType

Phase 5 (Race Conditions)   ██████        — After LootSystem exists
  5.1  Fix rollback corruption
  5.2  Fix despawn double-fire
  5.3  Separate query from side effects

Phase 6 (Memory/Cleanup)    ████          — After main refactors settle
  6.1  worldListeners registration
  6.2  pendingGravestones cleanup
  6.3  clearDeathLock ordering

Phase 7 (Polish)            ████          — Final pass
  7.1  Typed system accessors
  7.2  Remove dead paths
  7.3  Atomic death state transitions
  7.4  Stackability check
```
