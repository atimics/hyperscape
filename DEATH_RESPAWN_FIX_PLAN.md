# Death/Respawn System - AAA Quality Fix Plan

**Based on**: `DEATH_RESPAWN_SYSTEM_AUDIT.md`
**Goal**: Implement a robust, OSRS-accurate death/respawn system with proper combat state management

---

## Architecture Overview

### Current State (Broken)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ PlayerDeathSystem│     │   CombatSystem   │     │   AggroSystem   │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│ ENTITY_DEATH ───────> │ handleEntityDied │     │                 │
│                 │     │ (removes ONLY    │     │ updateChasing   │
│                 │     │  dead entity's   │     │ (NO death check)│
│                 │     │  combat state)   │     │                 │
│                 │     │                  │     │                 │
│ PLAYER_RESPAWNED│     │ NOT SUBSCRIBED   │     │ NOT SUBSCRIBED  │
│ (emitted but    │     │                  │     │                 │
│  nobody listens)│     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Target State (Fixed)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ PlayerDeathSystem│     │   CombatSystem   │     │   AggroSystem   │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│                 │     │                  │     │                 │
│ ENTITY_DEATH ───────> │ handleEntityDied │     │                 │
│                 │     │ ├─ clear dead    │     │                 │
│                 │     │ │  entity state  │     │                 │
│                 │     │ └─ clear ALL     │     │                 │
│                 │     │    attackers'    │     │                 │
│                 │     │    states ◄──────────> │ onPlayerDied    │
│                 │     │                  │     │ (clear mob      │
│                 │     │                  │     │  targets)       │
│                 │     │                  │     │                 │
│ PLAYER_RESPAWNED────> │ onPlayerRespawn  │────>│ onPlayerRespawn │
│                 │     │ (clear any       │     │ (clear any      │
│                 │     │  lingering       │     │  lingering      │
│                 │     │  states)         │     │  aggro)         │
│                 │     │                  │     │                 │
│                 │     │ Zone Validation  │     │                 │
│                 │     │ (PvP checks)     │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## Implementation Phases

### Phase 1: CombatStateService Enhancement
**Priority**: Critical
**Estimated Complexity**: Low

Add method to clear all combat states targeting a specific entity.

#### File: `packages/shared/src/systems/shared/combat/CombatStateService.ts`

**Add new method after `getAttackersTargeting()` (around line 383):**

```typescript
/**
 * Clear all combat states where the target is the specified entity.
 * Used when an entity dies or respawns to ensure no attackers retain stale targeting.
 *
 * @param targetEntityId - The entity ID that was being targeted
 * @returns Array of attacker IDs whose states were cleared (for logging/debugging)
 */
clearStatesTargeting(targetEntityId: EntityID | string): EntityID[] {
  const targetIdStr = String(targetEntityId);
  const clearedAttackers: EntityID[] = [];

  for (const [attackerId, state] of this.combatStates) {
    if (String(state.targetId) === targetIdStr) {
      // Remove the attacker's combat state
      this.combatStates.delete(attackerId);
      clearedAttackers.push(attackerId);

      // Clear combat state from attacker entity
      this.clearCombatStateFromEntity(attackerId, state.attackerType);
    }
  }

  return clearedAttackers;
}
```

---

### Phase 2: CombatSystem Death Handling Fix
**Priority**: Critical
**Estimated Complexity**: Medium

Fix `handleEntityDied()` to properly clear all attackers' combat states.

#### File: `packages/shared/src/systems/shared/combat/CombatSystem.ts`

**Replace lines 1233-1261 in `handleEntityDied()`:**

```typescript
private handleEntityDied(entityId: string, entityType: string): void {
  const typedEntityId = createEntityID(entityId);

  const deathEventType =
    entityType === "player"
      ? GameEventType.DEATH_PLAYER
      : GameEventType.DEATH_MOB;
  const combatState = this.stateService.getCombatData(entityId);
  this.recordCombatEvent(deathEventType, entityId, {
    entityType,
    killedBy: combatState ? String(combatState.targetId) : "unknown",
  });

  // PHASE 2 FIX: Clear ALL combat states targeting this dead entity
  // This ensures attackers don't continue chasing/attacking the dead entity
  const clearedAttackers = this.stateService.clearStatesTargeting(typedEntityId);

  // Notify each cleared attacker's mob AI (if applicable)
  for (const attackerId of clearedAttackers) {
    const attackerIdStr = String(attackerId);
    const mobEntity = this.world.entities.get(attackerIdStr);

    if (isMobEntity(mobEntity) && typeof mobEntity.onTargetDied === "function") {
      mobEntity.onTargetDied(entityId);
    }

    // Clear attack cooldown so they can immediately target something else
    this.nextAttackTicks.delete(attackerId);

    // Reset emote for attacker
    const attackerType = this.entityResolver.resolveType(attackerIdStr);
    this.animationManager.resetEmote(attackerIdStr, attackerType as "player" | "mob");
  }

  // Remove the dead entity's own combat state
  this.stateService.removeCombatState(typedEntityId);

  // Clear the dead entity's attack cooldown (for when they respawn)
  this.nextAttackTicks.delete(typedEntityId);

  // Clear any scheduled emote resets for the dead entity
  this.animationManager.cancelEmoteReset(entityId);

  // Clear face target for players who had this as pending attacker
  if (entityType === "mob") {
    for (const player of this.world.entities.players.values()) {
      const pendingAttacker = getPendingAttacker(player);
      if (pendingAttacker === entityId) {
        clearPendingAttacker(player);
        this.emitTypedEvent(EventType.COMBAT_CLEAR_FACE_TARGET, {
          playerId: player.id,
        });
      }
    }
  }

  // Reset dead entity's emote
  this.animationManager.resetEmote(entityId, entityType as "player" | "mob");

  // Emit COMBAT_ENDED for each cleared attacker (for AggroSystem and other listeners)
  for (const attackerId of clearedAttackers) {
    this.emitTypedEvent(EventType.COMBAT_ENDED, {
      attackerId: String(attackerId),
      targetId: entityId,
      reason: "target_died",
    });
  }
}
```

---

### Phase 3: CombatSystem Respawn Handler
**Priority**: Critical
**Estimated Complexity**: Low

Add subscription to `PLAYER_RESPAWNED` event to clear any lingering combat states.

#### File: `packages/shared/src/systems/shared/combat/CombatSystem.ts`

**Add in `init()` method (around line 200, after other subscriptions):**

```typescript
// Subscribe to player respawn to clear any lingering combat states
// This handles edge cases where states persist through the death -> respawn cycle
this.subscribe(
  EventType.PLAYER_RESPAWNED,
  (data: { playerId: string; spawnPosition: { x: number; y: number; z: number } }) => {
    this.handlePlayerRespawned(data.playerId, data.spawnPosition);
  },
);
```

**Add new method (after `handleEntityDied()`):**

```typescript
/**
 * Handle player respawn - ensure clean combat state
 * Clears any lingering combat states that might cause issues:
 * - States where this player is the target (shouldn't exist after death, but safety check)
 * - States where this player is the attacker (shouldn't auto-resume combat)
 * - Pending attacker references
 *
 * @param playerId - The player who just respawned
 * @param spawnPosition - Where they respawned (for zone validation)
 */
private handlePlayerRespawned(
  playerId: string,
  spawnPosition: { x: number; y: number; z: number },
): void {
  const typedPlayerId = createEntityID(playerId);

  // Safety: Clear any states still targeting this player
  // (shouldn't exist if handleEntityDied worked correctly, but defense in depth)
  const staleAttackers = this.stateService.clearStatesTargeting(typedPlayerId);
  if (staleAttackers.length > 0) {
    console.warn(
      `[CombatSystem] Cleared ${staleAttackers.length} stale attacker states on respawn for ${playerId}`,
    );
  }

  // Clear this player's own combat state (shouldn't have one, but safety check)
  const ownState = this.stateService.getCombatData(playerId);
  if (ownState) {
    console.warn(
      `[CombatSystem] Cleared own combat state on respawn for ${playerId}`,
    );
    this.stateService.removeCombatState(typedPlayerId);
  }

  // Clear attack cooldown
  this.nextAttackTicks.delete(typedPlayerId);

  // Clear pending attacker reference
  const playerEntity = this.world.getPlayer?.(playerId);
  if (playerEntity) {
    clearPendingAttacker(playerEntity);
  }

  // Clear combat UI state
  this.stateService.clearCombatStateFromEntity(playerId, "player");

  // Clear face target
  this.emitTypedEvent(EventType.COMBAT_CLEAR_FACE_TARGET, {
    playerId,
  });
}
```

---

### Phase 4: AggroSystem Death State Check
**Priority**: High
**Estimated Complexity**: Low

Add death state validation in `updateChasing()` and subscribe to death events.

#### File: `packages/shared/src/systems/shared/combat/AggroSystem.ts`

**Add imports at top of file:**

```typescript
import { DeathState } from "../../../types/entities";
```

**Add subscriptions in `init()` method:**

```typescript
// Subscribe to player death to immediately stop chasing dead players
this.subscribe(
  EventType.PLAYER_SET_DEAD,
  (data: { playerId: string; isDead: boolean }) => {
    if (data.isDead) {
      this.handlePlayerDied(data.playerId);
    }
  },
);

// Subscribe to player respawn to clear any lingering aggro
this.subscribe(
  EventType.PLAYER_RESPAWNED,
  (data: { playerId: string }) => {
    this.handlePlayerRespawned(data.playerId);
  },
);
```

**Add new handler methods:**

```typescript
/**
 * Handle player death - immediately stop all mobs chasing this player
 * OSRS-accurate: Mobs disengage instantly when target dies
 *
 * @param playerId - The player who died
 */
private handlePlayerDied(playerId: string): void {
  for (const [mobId, mobState] of this.mobStates) {
    if (mobState.currentTarget === playerId) {
      this.stopChasing(mobState);
      mobState.aggroTargets.delete(playerId);
      mobState.isInCombat = false;
    }
  }
}

/**
 * Handle player respawn - clear any lingering aggro references
 * Safety check to ensure clean state after respawn
 *
 * @param playerId - The player who respawned
 */
private handlePlayerRespawned(playerId: string): void {
  for (const [mobId, mobState] of this.mobStates) {
    // Clear this player from aggro targets
    mobState.aggroTargets.delete(playerId);

    // If somehow still targeting this player, stop
    if (mobState.currentTarget === playerId) {
      this.stopChasing(mobState);
      mobState.isInCombat = false;
    }
  }
}
```

**Modify `updateChasing()` method (around line 711):**

```typescript
private updateChasing(mobState: MobAIStateData): void {
  // Ensure we have a valid target
  if (!mobState.currentTarget) {
    this.stopChasing(mobState);
    return;
  }

  const player = this.world.getPlayer(mobState.currentTarget);

  // PHASE 4 FIX: Check if player exists and is alive
  if (!player) {
    this.stopChasing(mobState);
    return;
  }

  // Check player death state (primary check)
  const playerData = player.data as { deathState?: DeathState } | undefined;
  if (playerData?.deathState === DeathState.DYING || playerData?.deathState === DeathState.DEAD) {
    this.stopChasing(mobState);
    mobState.aggroTargets.delete(mobState.currentTarget);
    return;
  }

  // Check player health (backup check)
  const playerHealth = (player as { health?: { current: number } }).health;
  if (playerHealth && playerHealth.current <= 0) {
    this.stopChasing(mobState);
    mobState.aggroTargets.delete(mobState.currentTarget);
    return;
  }

  // Strong type assumption - player.node.position is always Vector3
  if (!player.node?.position) {
    console.warn(`[AggroSystem] Player ${player.id} has no node`);
    this.stopChasing(mobState);
    return;
  }

  // ... rest of method unchanged ...
}
```

---

### Phase 5: PvP Zone Validation
**Priority**: Medium
**Estimated Complexity**: Medium

Add zone validation to prevent PvP combat in safe zones.

#### File: `packages/shared/src/systems/shared/combat/CombatSystem.ts`

**Add import at top:**

```typescript
import { ZoneDetectionSystem } from "../death/ZoneDetectionSystem";
```

**Add private member:**

```typescript
private zoneSystem?: ZoneDetectionSystem;
```

**Add in `init()` method:**

```typescript
// Cache ZoneDetectionSystem for PvP validation (may not exist on client)
this.zoneSystem = this.world.getSystem("zone-detection") as ZoneDetectionSystem | undefined;
```

**Add helper method:**

```typescript
/**
 * Check if PvP combat is allowed at the given position
 * @param position - World position to check
 * @returns true if PvP is allowed, false if in safe zone
 */
private isPvPAllowedAt(position: { x: number; y?: number; z: number }): boolean {
  if (!this.zoneSystem) {
    // No zone system (e.g., client-side) - assume PvP allowed, server will validate
    return true;
  }
  return this.zoneSystem.isPvPEnabled({ x: position.x, z: position.z });
}
```

**Modify `enterCombat()` (around line 902) - add zone check for PvP:**

```typescript
private enterCombat(
  attackerId: EntityID,
  targetId: EntityID,
  attackerSpeedTicks?: number,
): void {
  const currentTick = this.world.currentTick;

  const attackerEntity = this.world.entities.get(String(attackerId));
  const targetEntity = this.world.entities.get(String(targetId));

  // Don't enter combat if target is dead
  if (isEntityDead(targetEntity)) {
    return;
  }

  // Detect entity types
  const attackerType =
    attackerEntity?.type === "mob" ? ("mob" as const) : ("player" as const);
  const targetType =
    targetEntity?.type === "mob" ? ("mob" as const) : ("player" as const);

  // PHASE 5 FIX: PvP zone validation
  if (attackerType === "player" && targetType === "player") {
    const attackerPos = getEntityPosition(attackerEntity);
    const targetPos = getEntityPosition(targetEntity);

    if (attackerPos && !this.isPvPAllowedAt(attackerPos)) {
      // Attacker is in safe zone - cannot initiate PvP
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: String(attackerId),
        message: "You cannot attack players in a safe zone.",
        type: "error",
      });
      return;
    }

    if (targetPos && !this.isPvPAllowedAt(targetPos)) {
      // Target is in safe zone - cannot be attacked
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: String(attackerId),
        message: "That player is in a safe zone.",
        type: "error",
      });
      return;
    }
  }

  // ... rest of method unchanged ...
}
```

**Modify `handleAutoRetaliateEnabled()` - add zone check:**

```typescript
private handleAutoRetaliateEnabled(playerId: string): void {
  const playerEntity = this.world.getPlayer?.(playerId);
  if (!playerEntity) return;

  const pendingAttacker = getPendingAttacker(playerEntity);
  if (!pendingAttacker) return;

  // Detect attacker type
  const attackerType = this.entityResolver.resolveType(pendingAttacker);
  const attackerEntity = this.entityResolver.resolve(pendingAttacker, attackerType);

  if (!attackerEntity || !this.entityResolver.isAlive(attackerEntity, attackerType)) {
    clearPendingAttacker(playerEntity);
    return;
  }

  // PHASE 5 FIX: PvP zone validation for auto-retaliate
  if (attackerType === "player") {
    const playerPos = getEntityPosition(playerEntity);
    if (playerPos && !this.isPvPAllowedAt(playerPos)) {
      // Player is in safe zone - cannot auto-retaliate against another player
      clearPendingAttacker(playerEntity);
      return;
    }
  }

  // ... rest of method unchanged ...
}
```

---

### Phase 6: Combat Timeout Fix
**Priority**: Low
**Estimated Complexity**: Low

Prevent combat timeout from extending when target is dead or invalid.

#### File: `packages/shared/src/systems/shared/combat/CombatSystem.ts`

**Modify `checkRangeAndFollow()` (around line 1700):**

Find the line that extends combat timeout:
```typescript
combatState.combatEndTick = tickNumber + COMBAT_CONSTANTS.COMBAT_TIMEOUT_TICKS;
```

Replace with:
```typescript
// PHASE 6 FIX: Only extend timeout if target is still valid and alive
const target = this.entityResolver.resolve(
  String(combatState.targetId),
  combatState.targetType,
);

if (target && this.entityResolver.isAlive(target, combatState.targetType)) {
  combatState.combatEndTick = tickNumber + COMBAT_CONSTANTS.COMBAT_TIMEOUT_TICKS;
} else {
  // Target is dead or gone - let combat expire naturally
  // Don't extend timeout, combat will end when combatEndTick is reached
}
```

---

## Testing Plan

### Unit Tests

#### CombatStateService Tests
```typescript
describe("clearStatesTargeting", () => {
  it("clears all combat states where targetId matches", () => {
    // Setup: Create multiple attackers targeting same entity
    // Action: Call clearStatesTargeting(targetId)
    // Assert: All attacker states cleared, returns correct attacker IDs
  });

  it("does not affect combat states targeting other entities", () => {
    // Setup: Create attackers targeting different entities
    // Action: Call clearStatesTargeting(oneTargetId)
    // Assert: Only states targeting that ID are cleared
  });

  it("returns empty array when no states target the entity", () => {
    // Setup: Create states targeting other entities
    // Action: Call clearStatesTargeting(nonTargetedId)
    // Assert: Returns empty array, no states modified
  });
});
```

#### CombatSystem Death Handling Tests
```typescript
describe("handleEntityDied", () => {
  it("clears all attacker combat states when player dies", () => {
    // Setup: Multiple mobs attacking player
    // Action: Player dies
    // Assert: All mob combat states cleared
  });

  it("emits COMBAT_ENDED for each cleared attacker", () => {
    // Setup: Multiple attackers
    // Action: Target dies
    // Assert: COMBAT_ENDED emitted for each attacker
  });

  it("calls onTargetDied for mob attackers", () => {
    // Setup: Mob attacking player
    // Action: Player dies
    // Assert: mob.onTargetDied() called
  });
});
```

#### AggroSystem Tests
```typescript
describe("updateChasing death checks", () => {
  it("stops chasing when player dies", () => {
    // Setup: Mob chasing player
    // Action: Set player deathState to DYING
    // Trigger: updateChasing()
    // Assert: Mob stops chasing
  });

  it("stops chasing when player health reaches 0", () => {
    // Setup: Mob chasing player
    // Action: Set player health to 0
    // Trigger: updateChasing()
    // Assert: Mob stops chasing
  });
});

describe("PLAYER_SET_DEAD handler", () => {
  it("immediately stops all mobs chasing the dead player", () => {
    // Setup: Multiple mobs chasing player
    // Action: Emit PLAYER_SET_DEAD
    // Assert: All mobs stop chasing
  });
});
```

#### PvP Zone Tests
```typescript
describe("PvP zone validation", () => {
  it("prevents combat initiation in safe zone", () => {
    // Setup: Player in safe zone
    // Action: Try to attack another player
    // Assert: Combat not started, error message shown
  });

  it("prevents auto-retaliate in safe zone", () => {
    // Setup: Player in safe zone with pending attacker
    // Action: Toggle auto-retaliate ON
    // Assert: Combat not started
  });

  it("allows PvP in wilderness/PvP zone", () => {
    // Setup: Both players in PvP zone
    // Action: Initiate attack
    // Assert: Combat starts normally
  });
});
```

### Integration Tests

```typescript
describe("Death -> Respawn full cycle", () => {
  it("mob stops chasing immediately when player dies", async () => {
    // Setup: Mob attacking player
    // Action: Kill player
    // Assert: Mob immediately disengages and returns to spawn
  });

  it("player respawns with clean combat state", async () => {
    // Setup: Player killed by mob
    // Action: Wait for respawn
    // Assert: No combat states, full health, at spawn point
  });

  it("PvP combat fully clears on death", async () => {
    // Setup: Player A kills Player B
    // Action: Player B respawns
    // Assert: Neither player in combat, no auto-retaliate
  });

  it("mob can attack respawned player normally", async () => {
    // Setup: Player respawns near aggressive mob
    // Action: Wait for aggro
    // Assert: Mob aggros and attacks normally
  });
});
```

### Manual Testing Checklist

- [ ] **Mob disengagement on death**
  - Attack a mob until it starts chasing you
  - Let the mob kill you
  - Verify: Mob immediately stops and returns to spawn area

- [ ] **No ghost following**
  - Get multiple mobs to chase you
  - Die to one of them
  - Verify: ALL mobs stop chasing, don't follow to spawn

- [ ] **Clean respawn state**
  - Die to a mob
  - Respawn
  - Verify: Full health, no combat indicators, can be attacked normally

- [ ] **PvP death cleanup**
  - Have another player kill you in PvP zone
  - Respawn
  - Verify: Not auto-chasing killer, no combat state

- [ ] **Safe zone protection**
  - Enter safe zone after being in combat
  - Verify: Cannot be attacked, cannot attack players

- [ ] **Mob re-aggro after respawn**
  - Respawn near aggressive mobs
  - Verify: Mobs can detect and attack you normally

---

## Rollback Plan

If issues arise after deployment:

1. **Immediate**: Revert Phase 2 changes (handleEntityDied) - most impactful
2. **If needed**: Revert Phase 4 (AggroSystem death checks)
3. **Low risk**: Phase 1, 3, 5, 6 are additive and low-risk

Each phase is designed to be independently revertible.

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Mob chase on death | 0% (should never happen) |
| Ghost combat states after respawn | 0% |
| PvP in safe zones | 0% |
| Combat re-engagement bugs | 0% |
| Respawn with incorrect health | 0% |
| Player invulnerability after respawn | 0% |

---

## File Summary

| File | Changes |
|------|---------|
| `CombatStateService.ts` | Add `clearStatesTargeting()` method |
| `CombatSystem.ts` | Rewrite `handleEntityDied()`, add `handlePlayerRespawned()`, add zone validation, fix timeout extension |
| `AggroSystem.ts` | Add death state check in `updateChasing()`, add `PLAYER_SET_DEAD` and `PLAYER_RESPAWNED` handlers |

---

## Implementation Order

```
Phase 1: CombatStateService.clearStatesTargeting()
    ↓
Phase 2: CombatSystem.handleEntityDied() rewrite
    ↓
Phase 3: CombatSystem.handlePlayerRespawned()
    ↓
Phase 4: AggroSystem death checks and handlers
    ↓
Phase 5: PvP zone validation
    ↓
Phase 6: Combat timeout fix
    ↓
Testing & Verification
```

Phases 1-4 are critical and should be implemented together.
Phases 5-6 can be deferred if needed but are recommended for AAA quality.
