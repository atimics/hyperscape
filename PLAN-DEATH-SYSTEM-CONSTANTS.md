






# Death System Constants Extraction Plan

> **Objective**: Extract all magic numbers from death system into centralized `CombatConstants.ts`
> **Estimated Effort**: 1-2 hours
> **Risk Level**: Low (constants only, no logic changes)

---

## Current State Analysis

### Files Audited

| File | Lines | Magic Numbers Found |
|------|-------|---------------------|
| `PlayerDeathSystem.ts` | 1,101 | 7 magic numbers |
| `MobDeathSystem.ts` | 65 | 0 (delegates to other systems) |
| `SafeAreaDeathHandler.ts` | 322 | 0 (already uses COMBAT_CONSTANTS) |
| `WildernessDeathHandler.ts` | 130 | 0 (already uses COMBAT_CONSTANTS) |
| `DeathStateManager.ts` | 369 | 0 (no timing constants) |
| `CombatConstants.ts` | 186 | Already has some death constants |
| `world-structure.ts` | 126 | 2 death constants (duplicated) |

### Magic Numbers in PlayerDeathSystem.ts

| Line | Current Code | Value | Description |
|------|--------------|-------|-------------|
| 113 | `DEATH_COOLDOWN = 10000` | 10s | Prevents death spam |
| 502 | `DEATH_ANIMATION_DURATION = 4500` | 4.5s | Death animation before respawn |
| 773 | `GRAVESTONE_DURATION = 5 * 60 * 1000` | 5min | **Duplicates** COMBAT_CONSTANTS.GRAVESTONE_TICKS |
| 854 | `GROUND_ITEM_DURATION = 2 * 60 * 1000` | 2min | **Duplicates** COMBAT_CONSTANTS.GROUND_ITEM_DESPAWN_TICKS |
| 893 | `MAX_DEATH_LOCK_AGE = 60 * 60 * 1000` | 1hr | Stale death lock cleanup |
| 911 | `setTimeout(..., 500)` | 0.5s | Reconnect respawn delay |

### Existing Constants (CombatConstants.ts:100-112)

```typescript
// Already exists - tick-based (OSRS-accurate)
RESPAWN_TICKS_MIN: 25,           // 15 seconds - mob respawn
RESPAWN_TICKS_DEFAULT: 25,       // 15 seconds - standard mob respawn
RESPAWN_TICKS_RANDOMNESS: 8,     // +0-8 ticks randomness
GRAVESTONE_TICKS: 500,           // 5 minutes (300s / 0.6)
GROUND_ITEM_DESPAWN_TICKS: 200,  // 2 minutes (120s / 0.6)
UNTRADEABLE_DESPAWN_TICKS: 300,  // 3 minutes (180s / 0.6)
LOOT_PROTECTION_TICKS: 100,      // 1 minute (60s / 0.6)
CORPSE_DESPAWN_TICKS: 200,       // 2 minutes - mob corpse
```

### Duplicate Constants (world-structure.ts:123-124)

```typescript
// Duplicates that should be deprecated
RESPAWN_TIME: 30000,             // 30 seconds (conflicts with GDD?)
DEATH_ITEM_DESPAWN_TIME: 300000, // 5 minutes (same as GRAVESTONE_TICKS)
```

---

## Implementation Plan

### Phase 1: Add New Constants to CombatConstants.ts

**Location**: `packages/shared/src/constants/CombatConstants.ts`

Add new `DEATH` section after existing death/loot timing (around line 113):

```typescript
// Death/Loot timing in ticks (OSRS-style)
// ... existing constants ...

// Player death timing constants
// @see https://oldschool.runescape.wiki/w/Death
DEATH: {
  /** Death animation duration before respawn in ms */
  ANIMATION_DURATION_MS: 4500,

  /** Cooldown between deaths to prevent spam in ms */
  COOLDOWN_MS: 10000,

  /** Delay before respawn after reconnecting in ms */
  RECONNECT_RESPAWN_DELAY_MS: 500,

  /** Maximum age of death lock before considered stale (1 hour) */
  STALE_LOCK_AGE_MS: 60 * 60 * 1000,

  /** Default respawn position */
  DEFAULT_RESPAWN_POSITION: { x: 0, y: 0, z: 0 } as const,

  /** Default respawn town name */
  DEFAULT_RESPAWN_TOWN: "Central Haven",
} as const,
```

### Phase 2: Update PlayerDeathSystem.ts

**File**: `packages/shared/src/systems/shared/combat/PlayerDeathSystem.ts`

#### Task 2.1: Add import
```typescript
// Line ~4 - Add to existing import
import { COMBAT_CONSTANTS } from "../../../constants/CombatConstants";
import { ticksToMs } from "../../../utils/game/CombatCalculations";
```

#### Task 2.2: Replace local constants (line 113)
```typescript
// Before:
private readonly DEATH_COOLDOWN = 10000;

// After:
private readonly DEATH_COOLDOWN = COMBAT_CONSTANTS.DEATH.COOLDOWN_MS;
```

#### Task 2.3: Replace death animation duration (line 502)
```typescript
// Before:
const DEATH_ANIMATION_DURATION = 4500;

// After:
const DEATH_ANIMATION_DURATION = COMBAT_CONSTANTS.DEATH.ANIMATION_DURATION_MS;
```

#### Task 2.4: Replace respawn position/town (lines 614-615)
```typescript
// Before:
const DEATH_RESPAWN_POSITION = { x: 0, y: 0, z: 0 };
const DEATH_RESPAWN_TOWN = "Central Haven";

// After:
const DEATH_RESPAWN_POSITION = COMBAT_CONSTANTS.DEATH.DEFAULT_RESPAWN_POSITION;
const DEATH_RESPAWN_TOWN = COMBAT_CONSTANTS.DEATH.DEFAULT_RESPAWN_TOWN;
```

#### Task 2.5: Replace gravestone duration (line 773)
```typescript
// Before:
const GRAVESTONE_DURATION = 5 * 60 * 1000; // 5 minutes

// After:
const GRAVESTONE_DURATION = ticksToMs(COMBAT_CONSTANTS.GRAVESTONE_TICKS);
```

#### Task 2.6: Replace ground item duration (line 854)
```typescript
// Before:
const GROUND_ITEM_DURATION = 2 * 60 * 1000;

// After:
const GROUND_ITEM_DURATION = ticksToMs(COMBAT_CONSTANTS.GROUND_ITEM_DESPAWN_TICKS);
```

#### Task 2.7: Replace max death lock age (line 893)
```typescript
// Before:
const MAX_DEATH_LOCK_AGE = 60 * 60 * 1000; // 1 hour

// After:
const MAX_DEATH_LOCK_AGE = COMBAT_CONSTANTS.DEATH.STALE_LOCK_AGE_MS;
```

#### Task 2.8: Replace reconnect delay (line 911)
```typescript
// Before:
setTimeout(() => {
  this.initiateRespawn(playerId);
}, 500);

// After:
setTimeout(() => {
  this.initiateRespawn(playerId);
}, COMBAT_CONSTANTS.DEATH.RECONNECT_RESPAWN_DELAY_MS);
```

### Phase 3: Deprecate WORLD_STRUCTURE_CONSTANTS Death Values

**File**: `packages/shared/src/data/world-structure.ts`

Add deprecation comments (don't remove yet for backwards compatibility):

```typescript
export const WORLD_STRUCTURE_CONSTANTS = {
  // ... other constants ...

  /** @deprecated Use COMBAT_CONSTANTS.RESPAWN_TICKS_DEFAULT instead */
  RESPAWN_TIME: 30000,

  /** @deprecated Use COMBAT_CONSTANTS.GRAVESTONE_TICKS instead */
  DEATH_ITEM_DESPAWN_TIME: 300000,
} as const;
```

### Phase 4: Verify and Test

1. Run build: `bun run build:shared`
2. Run existing death system tests
3. Verify no regressions in death flow

---

## Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `CombatConstants.ts` | Add | New `DEATH` section with 6 constants |
| `PlayerDeathSystem.ts` | Edit | Replace 7 magic numbers with constants |
| `world-structure.ts` | Edit | Add deprecation comments to 2 constants |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Build failure | Low | Constants are simple values |
| Runtime regression | Low | Values unchanged, only source location |
| Test failures | Low | No logic changes |

---

## Success Criteria

- [ ] All magic numbers in PlayerDeathSystem.ts use COMBAT_CONSTANTS
- [ ] Build passes (`bun run build:shared`)
- [ ] Death flow works (manual test or existing tests)
- [ ] No duplicate constants across files
- [ ] Deprecation warnings on old WORLD_STRUCTURE_CONSTANTS values

---

## OSRS Accuracy Notes

| Constant | OSRS Value | Our Value | Match? |
|----------|------------|-----------|--------|
| Gravestone duration | 5 minutes | 500 ticks (5 min) | ✓ |
| Ground item despawn | 2 minutes | 200 ticks (2 min) | ✓ |
| Loot protection | 1 minute | 100 ticks (1 min) | ✓ |
| Death animation | ~3-4 seconds | 4.5 seconds | ~✓ |

---

## Commit Message Template

```
refactor(death): extract magic numbers to COMBAT_CONSTANTS.DEATH

- Add DEATH section to CombatConstants with 6 new constants
- Replace 7 hardcoded values in PlayerDeathSystem
- Deprecate duplicate constants in WORLD_STRUCTURE_CONSTANTS
- No logic changes, values unchanged
```
