# Death/Respawn System - Technical Audit Report

**Date**: 2026-01-16
**Auditor**: Claude Code
**Severity**: Critical - Multiple interconnected bugs affecting core gameplay

---

## Executive Summary

A deep investigation into the death/respawn and combat systems has revealed **6 interconnected bugs** stemming from **4 fundamental design flaws**. The core issue is that **combat state lifecycle is completely decoupled from entity lifecycle** - when an entity dies or respawns, the combat system is not properly notified, and attackers' states are not cleaned up.

### Symptoms Reported
1. Players sometimes don't spawn with full health after dying to a mob
2. Mobs can't attack players after respawn
3. Mobs follow players in their dead state to the respawn point
4. In PvP, killed players spawn chasing their killer immediately
5. Fighting resumes even outside PvP zones

---

## Bug Analysis

### Bug #1: Attacker Combat States NOT Cleared on Target Death

**Location**: `packages/shared/src/systems/shared/combat/CombatSystem.ts:1220-1282`

**The Code**:
```typescript
private handleEntityDied(entityId: string, entityType: string): void {
  // ...

  // Simply remove the dead entity's combat state - they're no longer in combat
  // But DON'T call endCombat() for attackers - let their combat timer expire naturally
  this.stateService.removeCombatState(typedEntityId);  // Line 1235 - ONLY removes dead entity!

  // Find all attackers targeting this dead entity
  for (const [attackerId, state] of combatStatesMap) {
    if (String(state.targetId) === entityId) {
      // Allow attacker to target someone else immediately
      this.nextAttackTicks.delete(attackerId);  // Clears cooldown but NOT combat state

      if (state.attackerType === "mob") {
        mobEntity.onTargetDied(entityId);  // Only mobs get notified!
      }
      // Player attackers get NOTHING - their combat state persists!
    }
  }
}
```

**The Problem**:
- Line 1235: Only removes the DEAD entity's combat state
- Lines 1251-1258: Only calls `onTargetDied()` for MOB attackers
- **Player attackers' combat states are NEVER removed**
- Their `targetId` still points to the dead (and soon respawned) player

**Impact**: When Player A kills Player B:
1. Player B's combat state removed
2. Player A's combat state REMAINS with `targetId = Player B`
3. Player B respawns at spawn point
4. Player A still has active combat targeting Player B
5. If Player A was chasing, they continue chasing to spawn point

---

### Bug #2: AggroSystem Never Checks If Target Is Dead

**Location**: `packages/shared/src/systems/shared/combat/AggroSystem.ts:711-750`

**The Code**:
```typescript
private updateChasing(mobState: MobAIStateData): void {
  if (!mobState.currentTarget) {
    this.stopChasing(mobState);
    return;
  }

  const player = this.world.getPlayer(mobState.currentTarget)!;  // Line 718

  // MISSING: No check if player is dead!
  // if (!player || player.health.current <= 0) { ... }
  // if (player.data?.deathState === DeathState.DYING) { ... }

  if (!player.node?.position) {  // Only checks if node exists
    this.stopChasing(mobState);
    return;
  }

  // Continues chasing regardless of death state...
}
```

**The Problem**:
- Line 718: Gets player without checking if they're dead
- Only checks if player has a node, not if they're alive
- Distance check passes if player exists (even if dead)
- No subscription to `PLAYER_SET_DEAD` or `ENTITY_DEATH` events

**Note**: MobEntity.ts DOES have a death check (line 1687-1694):
```typescript
if (this.config.targetPlayerId) {
  const targetPlayer = this.world.getPlayer(this.config.targetPlayerId);
  if (!targetPlayer || targetPlayer.health.current <= 0) {
    this.clearTargetAndExitCombat();
  }
}
```
But AggroSystem runs independently and doesn't coordinate with MobEntity.

---

### Bug #3: No PLAYER_RESPAWNED Handler in CombatSystem

**Location**: `packages/shared/src/systems/shared/combat/CombatSystem.ts`

**What's Missing**:
```typescript
// CombatSystem subscribes to these events:
this.subscribe(EventType.MOB_DEATH, ...);
this.subscribe(EventType.PLAYER_SET_DEAD, ...);
this.subscribe(EventType.ENTITY_DEATH, ...);
this.subscribe(EventType.UI_AUTO_RETALIATE_CHANGED, ...);

// But NOT:
// this.subscribe(EventType.PLAYER_RESPAWNED, ...);  // MISSING!
```

**Impact**: When `respawnPlayer()` is called in PlayerDeathSystem:
- Health is restored
- Position is teleported
- Death state is cleared
- **But CombatSystem is never notified**
- Any lingering combat states targeting the respawned player remain active

---

### Bug #4: COMBAT_ENDED Event Not Emitted on Death

**Location**: `packages/shared/src/systems/shared/combat/CombatSystem.ts:1233-1234`

**The Code**:
```typescript
private handleEntityDied(entityId: string, entityType: string): void {
  // ...

  // Simply remove the dead entity's combat state - they're no longer in combat
  // But DON'T call endCombat() for attackers - let their combat timer expire naturally
  this.stateService.removeCombatState(typedEntityId);

  // Note: COMBAT_ENDED is NOT emitted here!
  // Only forceEndCombat() emits it (line 1183)
}
```

**The Problem**:
- `COMBAT_ENDED` event is only emitted in `forceEndCombat()` (line 1183)
- `handleEntityDied()` intentionally does NOT call `forceEndCombat()`
- AggroSystem listens for `COMBAT_ENDED` to clear mob state (line 777-793)
- But since the event isn't emitted on death, AggroSystem's cleanup never fires

**AggroSystem's Handler** (that never gets called on death):
```typescript
private onCombatEnded(data: { attackerId: string; targetId: string; reason?: string; }): void {
  const mobState = this.mobStates.get(data.attackerId) || this.mobStates.get(data.targetId);
  if (mobState) {
    mobState.isInCombat = false;
    if (data.reason === "death" || data.reason === "flee") {
      mobState.currentTarget = null;
      mobState.aggroTargets.clear();
    }
  }
}
```

---

### Bug #5: No PvP Zone Validation in Combat

**Location**: `packages/shared/src/systems/shared/combat/CombatSystem.ts`

**What Exists**:
```typescript
// ZoneDetectionSystem has this method:
isPvPEnabled(position: { x: number; z: number }): boolean {
  const props = this.getZoneProperties(position);
  return props.isPvPEnabled;
}
```

**What's Missing in CombatSystem**:
```typescript
// enterCombat() - NO zone check
private enterCombat(attackerId: EntityID, targetId: EntityID, attackerSpeedTicks?: number): void {
  // Checks if target is alive
  // Checks if target is dead
  // Does NOT check: isPvPEnabled()
}

// handleAutoRetaliateEnabled() - NO zone check
private handleAutoRetaliateEnabled(playerId: string): void {
  // Checks if attacker exists
  // Checks if attacker is alive
  // Does NOT check: isPvPEnabled()
}
```

**Impact**:
- Player A kills Player B in PvP zone
- Player B respawns in safe zone
- Player A's combat state persists with auto-retaliate
- Player B enters combat with Player A (who followed)
- Combat occurs in safe zone

---

### Bug #6: Combat Timeout Extends Indefinitely During Pursuit

**Location**: `packages/shared/src/systems/shared/combat/CombatSystem.ts:1727-1728`

**The Code**:
```typescript
// In checkRangeAndFollow(), called every tick:
combatState.combatEndTick = tickNumber + COMBAT_CONSTANTS.COMBAT_TIMEOUT_TICKS;
```

**The Problem**:
- Every tick, while chasing, combat timeout is extended
- Even if target is dead/fled/unreachable
- Creates "immortal" combat states that never expire naturally
- 8-tick timeout (4.8s) becomes effectively infinite during pursuit

---

## Root Cause Analysis

### Design Flaw #1: Combat State Lifecycle ≠ Entity Lifecycle

| Event | What SHOULD Happen | What ACTUALLY Happens |
|-------|-------------------|----------------------|
| Entity dies | Clear ALL combat states involving this entity | Only clears dead entity's own state |
| Entity respawns | Notify combat system, clear lingering states | CombatSystem not notified at all |

### Design Flaw #2: No Cross-System Death Notification

```
PlayerDeathSystem          CombatSystem              AggroSystem
      |                         |                        |
  [Player Dies]                 |                        |
      |                         |                        |
  ENTITY_DEATH ──────────────> [Remove dead entity      |
      |                         combat state only]       |
      |                         |                        |
  PLAYER_SET_DEAD ────────────> [handled, but            |
      |                         attackers not cleared]   |
      |                         |                        |
  [Respawn]                     |                        |
      |                         |                        |
  PLAYER_RESPAWNED              X (not subscribed!)      X (not subscribed!)
```

### Design Flaw #3: Inconsistent Mob AI Coordination

```
MobEntity                  AggroSystem
    |                          |
[serverUpdate]             [updateChasing]
    |                          |
[checks target.health <=0]  [NO death check!]
    |                          |
[clearTargetAndExitCombat]  [continues chasing]
    |                          |
    --------------------------->  (no coordination)
```

### Design Flaw #4: Missing Zone Validation Layer

```
ZoneDetectionSystem         CombatSystem
        |                        |
 isPvPEnabled() ─────────────>  NEVER CALLED
        |                        |
 getZoneType()                   enterCombat()
        |                        handleAutoRetaliateEnabled()
        |                        (no zone checks anywhere)
```

---

## Files Requiring Changes

| File | Change Required |
|------|-----------------|
| `CombatSystem.ts` | Clear ALL attacker states when target dies; Subscribe to PLAYER_RESPAWNED; Add zone validation |
| `CombatStateService.ts` | Add `clearStatesTargeting(entityId)` method |
| `AggroSystem.ts` | Add death state check in `updateChasing()`; Subscribe to PLAYER_SET_DEAD |
| `PlayerDeathSystem.ts` | Emit event that triggers combat state cleanup before respawn |

---

## Recommended Fix Order

### Priority 1: Critical (Fixes bugs #1, #2, #3)
1. **Add `clearStatesTargeting(entityId)` to CombatStateService**
   - Clears all combat states where `targetId === entityId`

2. **Call it in `handleEntityDied()`**
   ```typescript
   this.stateService.clearStatesTargeting(entityId);
   ```

3. **Subscribe to PLAYER_RESPAWNED in CombatSystem**
   ```typescript
   this.subscribe(EventType.PLAYER_RESPAWNED, (data) => {
     this.stateService.clearStatesTargeting(data.playerId);
   });
   ```

### Priority 2: High (Fixes bug #2 completely)
4. **Add death check to AggroSystem.updateChasing()**
   ```typescript
   const player = this.world.getPlayer(mobState.currentTarget);
   if (!player || player.health?.current <= 0) {
     this.stopChasing(mobState);
     return;
   }
   ```

5. **Subscribe to PLAYER_SET_DEAD in AggroSystem**
   ```typescript
   this.subscribe(EventType.PLAYER_SET_DEAD, (data) => {
     if (data.isDead) {
       for (const [mobId, state] of this.mobStates) {
         if (state.currentTarget === data.playerId) {
           this.stopChasing(state);
         }
       }
     }
   });
   ```

### Priority 3: Medium (Fixes bug #5)
6. **Add zone validation to enterCombat()**
   ```typescript
   if (attackerType === "player" && targetType === "player") {
     const zone = this.world.getSystem("zone-detection") as ZoneDetectionSystem;
     if (zone && !zone.isPvPEnabled(attackerPosition)) {
       return; // Can't start PvP in safe zone
     }
   }
   ```

### Priority 4: Low (Prevents ghost combat)
7. **Don't extend timeout for dead/invalid targets**
   ```typescript
   // In checkRangeAndFollow():
   if (!this.entityResolver.isAlive(target, combatState.targetType)) {
     // Don't extend timeout - let combat expire
     return;
   }
   combatState.combatEndTick = tickNumber + COMBAT_TIMEOUT_TICKS;
   ```

---

## Testing Checklist

After fixes, verify:

- [ ] When player dies to mob, mob stops chasing immediately
- [ ] When player dies to mob, mob returns to spawn area
- [ ] When player respawns, no mobs are targeting them
- [ ] When player dies in PvP, killer's combat state is cleared
- [ ] When player respawns after PvP death, they don't auto-attack killer
- [ ] Combat cannot start or resume outside PvP zones
- [ ] Player spawns with full health after respawn
- [ ] Mobs can attack respawned players normally (not "invulnerable" bug)

---

## Appendix: Key Code Locations

| System | File | Key Lines |
|--------|------|-----------|
| Death handling | `CombatSystem.ts` | 1220-1282 (`handleEntityDied`) |
| Combat state clear | `CombatStateService.ts` | 374-383 (`getAttackersTargeting`) |
| Mob chasing | `AggroSystem.ts` | 711-750 (`updateChasing`) |
| Mob death listener | `MobEntity.ts` | 636-644 (`PLAYER_SET_DEAD` handler) |
| Player respawn | `PlayerDeathSystem.ts` | 772-898 (`respawnPlayer`) |
| Auto-retaliate | `CombatSystem.ts` | 665-711 (`handleAutoRetaliateEnabled`) |
| Combat enter | `CombatSystem.ts` | 902-1000 (`enterCombat`) |
| Zone detection | `ZoneDetectionSystem.ts` | 60-63 (`isPvPEnabled`) |
