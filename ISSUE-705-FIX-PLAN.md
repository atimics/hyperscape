# Issue #705: Fix Plan — Gravestone Loot Permissions & Duel Arena Combat

## Problem Summary

A player was able to:
1. Attack another player inside the duel arena when no duel was active
2. Kill them, causing a regular death (gravestone spawned instead of duel death handling)
3. Loot the gravestone even though it wasn't theirs

This reveals **two bugs**:
- **Bug 1:** Gravestones can be looted by anyone (no owner validation)
- **Bug 2:** Combat was allowed in duel arena without an active duel session

---

## Bug 1: Gravestone Loot Permissions (High Priority)

### Current Behavior

**File:** `packages/shared/src/entities/world/HeadstoneEntity.ts`

```typescript
// Lines 171-184
private canPlayerLoot(playerId: string): boolean {
  const now = Date.now();

  // Check if loot protection is active
  if (this.lootProtectionUntil && now < this.lootProtectionUntil) {
    // Loot is protected
    if (this.protectedFor && this.protectedFor !== playerId) {
      return false;
    }
  }

  // Player can loot
  return true;  // ← BUG: No owner check!
}
```

**Problem:** The function only checks time-based protection (`lootProtectionUntil`) and killer protection (`protectedFor`). It **never validates that the looting player is the gravestone owner**.

For safe area deaths:
- `lootProtectionUntil: 0` (set in `SafeAreaDeathHandler.ts:197` and `PlayerDeathSystem.ts:1301`)
- `protectedFor: undefined`

Since `lootProtectionUntil` is `0` (falsy), the protection check is skipped entirely, and `return true` allows **anyone** to loot.

### OSRS Reference Behavior

In OSRS:
- Gravestones are protected for the owner for ~15 minutes
- After protection expires, items become visible to others
- After longer (~60 minutes), items disappear

### Fix Plan

**Step 1:** Add owner validation to `canPlayerLoot()` in `HeadstoneEntity.ts`

```typescript
private canPlayerLoot(playerId: string): boolean {
  const now = Date.now();
  const ownerId = this.headstoneData.playerId;

  // Owner can always loot their own gravestone
  if (playerId === ownerId) {
    return true;
  }

  // Non-owners: check if loot protection is active
  if (this.lootProtectionUntil && now < this.lootProtectionUntil) {
    // During protection period, only protectedFor (killer in PvP) can loot
    if (this.protectedFor && this.protectedFor === playerId) {
      return true;
    }
    return false;
  }

  // Protection expired — allow anyone (OSRS behavior after ~15 min)
  // For safe areas with no protection (lootProtectionUntil: 0),
  // only owner can loot (no expiration)
  if (!this.lootProtectionUntil || this.lootProtectionUntil === 0) {
    return false;  // Safe area: owner-only forever
  }

  return true;  // Wilderness: protection expired, anyone can loot
}
```

**Step 2:** Update safe area gravestone creation to include protection duration

**File:** `packages/shared/src/systems/shared/death/SafeAreaDeathHandler.ts`

```typescript
// Line 196-198: Change from no protection to owner-only protection
lootProtectionUntil: Date.now() + (15 * 60 * 1000),  // 15 minutes
protectedFor: playerId,  // Owner gets protection
```

**File:** `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`

```typescript
// Line 1301-1302: Same change
lootProtectionUntil: Date.now() + (15 * 60 * 1000),  // 15 minutes
protectedFor: playerId,  // Owner gets protection
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/entities/world/HeadstoneEntity.ts` | Update `canPlayerLoot()` with owner validation |
| `packages/shared/src/systems/shared/death/SafeAreaDeathHandler.ts` | Add protection duration for safe area deaths |
| `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts` | Add protection duration for gravestone spawning |

### Testing Checklist

- [ ] Owner can loot their own gravestone immediately
- [ ] Non-owner cannot loot another player's gravestone in safe areas
- [ ] Non-owner cannot loot during protection period in wilderness
- [ ] Non-owner CAN loot after protection expires in wilderness
- [ ] Killer can loot during protection period in wilderness (PvP death)

---

## Bug 2: Duel Arena Combat Validation (Medium Priority)

### Current Behavior

**File:** `packages/server/src/systems/ServerNetwork/handlers/combat.ts`

```typescript
// Lines 143-208: Combat validation flow
let isDuelCombat = false;
if (duelSystem?.isPlayerInActiveDuel && duelSystem?.getPlayerDuel) {
  const attackerInDuel = duelSystem.isPlayerInActiveDuel(attackerId);
  const targetInDuel = duelSystem.isPlayerInActiveDuel(targetPlayerId);

  if (attackerInDuel && targetInDuel) {
    // Verify opponents, set isDuelCombat = true
  } else if (attackerInDuel) {
    // Block: "You can only attack your duel opponent."
  } else if (targetInDuel) {
    // Block: "That player is in a duel."
  }
}

// Skip PvP zone checks for duel combat
if (!isDuelCombat) {
  // Check if attacker is in PvP zone
  // Check if target is in PvP zone
}
```

**Problem:** The check only considers players "in active duel" if their session state is `FIGHTING` or `FINISHED`. If a player is physically inside the combat arena but:
- Their duel session was cleaned up
- Their duel never started (stuck in `COUNTDOWN`, `CONFIRMING`, etc.)
- They were teleported there incorrectly

...they would NOT be considered "in active duel", and the combat handler falls through to PvP zone checks.

### Zone Configuration

**File:** `packages/server/world/assets/manifests/world-areas.json`

```json
"duel_arena": {
  "safeZone": true,
  "pvpEnabled": false,  // Regular PvP disabled
  "subZones": {
    "arenas": {
      "safeZone": false,
      "duelOnly": true   // Intent: only duel combat allowed
    }
  }
}
```

The `duelOnly: true` flag exists but is **not enforced** in the combat handler.

### Fix Plan

**Step 1:** Add combat arena check to combat handler

**File:** `packages/server/src/systems/ServerNetwork/handlers/combat.ts`

Add after the duel system checks (around line 208):

```typescript
// Import at top
import { isPositionInsideCombatArena } from "@hyperscape/shared";

// After duel checks, before PvP zone checks:

// Block combat inside duel arena combat zones without active duel
if (!isDuelCombat) {
  const attackerPos = playerEntity.position;
  const targetPos = targetPlayerEntity.position;

  const attackerInArena = attackerPos &&
    isPositionInsideCombatArena(attackerPos.x, attackerPos.z);
  const targetInArena = targetPos &&
    isPositionInsideCombatArena(targetPos.x, targetPos.z);

  if (attackerInArena || targetInArena) {
    sendCombatError(socket, "Combat in the arena requires an active duel.");
    return;
  }
}
```

**Step 2:** Add safety teleport for players stuck in combat arena

When a player is detected inside the combat arena without an active duel (e.g., on login, after disconnect), teleport them to the lobby.

**File:** `packages/server/src/systems/ServerNetwork/character-selection.ts`

This already exists (lines 710-718):
```typescript
// Check if player logged out inside a combat arena (server restart edge case)
if (isPositionInsideCombatArena(position[0], position[2])) {
  // Teleport to lobby
}
```

Verify this is working correctly and add similar checks to:
- Duel session cleanup (when session ends/times out)
- Duel forfeit handling
- Any disconnect handlers

**Step 3:** Add periodic arena cleanup (optional, defensive)

Create a system that periodically checks for players inside combat arenas without active duels and teleports them out.

### Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/systems/ServerNetwork/handlers/combat.ts` | Add `isPositionInsideCombatArena` check before allowing combat |
| `packages/server/src/systems/DuelSystem/index.ts` | Ensure session cleanup teleports players out of arena |
| `packages/server/src/systems/DuelSystem/DuelCombatResolver.ts` | Verify teleport-to-lobby on duel end |

### Testing Checklist

- [ ] Cannot attack player in combat arena without active duel
- [ ] Cannot attack FROM combat arena without active duel
- [ ] Players in combat arena without duel are teleported to lobby on login
- [ ] Players are teleported to lobby when duel session ends/cleans up
- [ ] Normal duel combat still works correctly

---

## Implementation Order

1. **Bug 1 First** — Gravestone permissions is the more critical fix (direct item theft)
2. **Bug 2 Second** — Combat arena validation prevents the scenario that created the bad gravestone

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| `canPlayerLoot()` modification | Medium — could break existing loot flows | Test thoroughly with owner/non-owner/killer scenarios |
| Protection duration change | Low — additive change | Ensure existing gravestones still work |
| Combat arena check | Low — only adds restriction | Test that normal duels still work |
| Teleport safety checks | Low — defensive measure | Already partially implemented |

---

## Related Files Reference

### Gravestone System
- `packages/shared/src/entities/world/HeadstoneEntity.ts` — Main gravestone entity
- `packages/shared/src/types/entities/entities.ts` — HeadstoneData interface (lines 414-430)
- `packages/shared/src/systems/shared/death/SafeAreaDeathHandler.ts` — Safe area death handling
- `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts` — General death handling

### Duel System
- `packages/server/src/systems/DuelSystem/index.ts` — Main duel system
- `packages/server/src/systems/DuelSystem/DuelCombatResolver.ts` — Combat resolution & teleports
- `packages/server/src/systems/ServerNetwork/handlers/combat.ts` — Combat validation
- `packages/server/src/systems/ServerNetwork/handlers/duel/helpers.ts` — Duel helper functions
- `packages/shared/src/data/duel-manifest.ts` — Arena position helpers

### Zone Detection
- `packages/shared/src/systems/shared/death/ZoneDetectionSystem.ts` — Zone property lookup
- `packages/server/world/assets/manifests/world-areas.json` — Zone definitions
