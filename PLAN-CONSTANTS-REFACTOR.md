# Constants Refactoring Plan

> **Created**: 2025-12-26
> **Purpose**: Refactor combat constants so manifests are source of truth with OSRS-accurate fallback defaults

---

## Executive Summary

**Goal**: Manifests (items.json, npcs.json) are the source of truth for entity-specific values. Constants provide OSRS-accurate fallback defaults when manifests omit optional fields.

**Current Problems**:
1. DataManager has hardcoded defaults that ignore constants
2. AggroSystem uses `MOB_BEHAVIORS` lookup, ignoring manifest `aggroRange`/`leashRange`
3. `ATTACK_SPEED_TICKS` tier object defined but never used
4. Duplicate/conflicting respawn time definitions
5. Goblin manifest has wrong respawn time (25 ticks, should be 35)

---

## OSRS Verification Summary

### Verified Values (with sources)

| Constant | Value | OSRS Source |
|----------|-------|-------------|
| `TICK_DURATION_MS` | 600 | [Game tick](https://oldschool.runescape.wiki/w/Game_tick) |
| `DEFAULT_ATTACK_SPEED_TICKS` | 4 | [Chicken](https://oldschool.runescape.wiki/w/Chicken), [Cow](https://oldschool.runescape.wiki/w/Cow), [Goblin](https://oldschool.runescape.wiki/w/Goblin) |
| `COMBAT_RANGE` (melee) | 1 tile | [Attack range](https://oldschool.runescape.wiki/w/Attack_range) |
| `LEASH_RANGE` (max_range) | 7 tiles | [osrs-docs Max Range](https://osrs-docs.com/docs/variables/max-range/) |
| `WANDER_RADIUS` | 5 tiles | [osrs-docs Wander Range](https://osrs-docs.com/docs/variables/wander-range/) |
| `COMBAT_TIMEOUT_TICKS` | 8 | [Flinching](https://oldschool.runescape.wiki/w/Flinching) |
| `LOGOUT_PREVENTION_TICKS` | 16 | [Logout button](https://oldschool.runescape.wiki/w/Logout_button) |
| `HEALTH_REGEN_INTERVAL_TICKS` | 100 | [Hitpoints](https://oldschool.runescape.wiki/w/Hitpoints) (1 HP/minute) |
| `AFK_DISABLE_RETALIATE_TICKS` | 2000 | [Idle](https://oldschool.runescape.wiki/w/Idle) (20 minutes) |
| `GRAVESTONE_TICKS` | 1500 | [Grave](https://oldschool.runescape.wiki/w/Grave) (15 minutes) |
| `GROUND_ITEM_DESPAWN_TICKS` | 300 | [Drop](https://oldschool.runescape.wiki/w/Drop) (3 minutes) |
| `LOOT_PROTECTION_TICKS` | 100 | [Drops](https://oldschool.runescape.wiki/w/Drops) (60 seconds) |

### Unverified Values

| Constant | Value | Notes |
|----------|-------|-------|
| `AGGRO_RANGE` (hunt_range) | 4 tiles | **NOT DOCUMENTED** in OSRS wiki. Varies per NPC. Using 4 as reasonable estimate. |

### Respawn Times (No Universal Default)

OSRS respawn times vary per NPC - there is no universal default:

| NPC | Ticks | Seconds | Source |
|-----|-------|---------|--------|
| Chicken | 25 | 15s | [Chicken](https://oldschool.runescape.wiki/w/Chicken) |
| Goblin | **35** | 21s | [Goblin](https://oldschool.runescape.wiki/w/Goblin) |
| Cow | 45 | 27s | [Cow](https://oldschool.runescape.wiki/w/Cow) |
| GWD NPCs | 60-80 | 36-48s | [Goblin (GWD)](https://oldschool.runescape.wiki/w/Goblin_(God_Wars_Dungeon)) |

**Decision**: Use 25 ticks as fallback default (matches weakest NPCs). Manifests should specify per-NPC values.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CombatConstants.ts                          │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │   GLOBAL CONSTANTS   │  │      DEFAULTS (fallbacks)        │ │
│  │   (always used)      │  │   (used when manifest omits)     │ │
│  ├──────────────────────┤  ├──────────────────────────────────┤ │
│  │ TICK_DURATION_MS     │  │ NPC.ATTACK_SPEED_TICKS: 4        │ │
│  │ COMBAT_TIMEOUT_TICKS │  │ NPC.AGGRO_RANGE: 4               │ │
│  │ GRAVESTONE_TICKS     │  │ NPC.LEASH_RANGE: 7               │ │
│  │ XP formulas          │  │ NPC.RESPAWN_TICKS: 25            │ │
│  │ Combat formulas      │  │ ITEM.ATTACK_SPEED: 4             │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DataManager.ts                             │
│                                                                 │
│  normalizeNPC(npc) {                                            │
│    return {                                                     │
│      attackSpeedTicks: npc.combat?.attackSpeedTicks             │
│                        ?? COMBAT_CONSTANTS.DEFAULTS.NPC.ATTACK_SPEED_TICKS │
│    }                                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     npcs.json / items.json                      │
│                      (SOURCE OF TRUTH)                          │
│                                                                 │
│  { "id": "goblin", "combat": { "respawnTicks": 35 } }           │
│    → Uses manifest value (35 ticks)                             │
│                                                                 │
│  { "id": "weak_npc", "combat": { } }                            │
│    → Uses default (25 ticks)                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Add DEFAULTS Object to CombatConstants.ts

**File**: `packages/shared/src/constants/CombatConstants.ts`

Add new `DEFAULTS` sub-object:

```typescript
// Add after existing constants, before AGGRO_CONSTANTS

/**
 * Default values for manifest normalization
 * Used by DataManager when manifest omits optional fields
 *
 * These are OSRS-accurate fallback values, NOT overrides.
 * Manifests are the source of truth - these only apply when
 * a manifest field is undefined.
 */
DEFAULTS: {
  /**
   * NPC/Mob defaults (used by DataManager.normalizeNPC)
   * @see https://oldschool.runescape.wiki/w/Monster
   */
  NPC: {
    /** Standard attack speed in ticks (verified: all basic NPCs use 4)
     * @see https://oldschool.runescape.wiki/w/Attack_speed */
    ATTACK_SPEED_TICKS: 4,

    /** Detection/hunt range in tiles (NOT DOCUMENTED - estimated)
     * Most aggressive NPCs detect players within ~4 tiles */
    AGGRO_RANGE: 4,

    /** Melee attack range in tiles (verified: standard melee = 1)
     * @see https://oldschool.runescape.wiki/w/Attack_range */
    COMBAT_RANGE: 1,

    /** Max chase range from spawn in tiles (verified: default = 7)
     * @see https://osrs-docs.com/docs/variables/max-range/ */
    LEASH_RANGE: 7,

    /** Default respawn time in ticks (25 = chickens, fastest basic NPC)
     * Note: Varies per NPC. Manifest should specify per-NPC values.
     * @see https://oldschool.runescape.wiki/w/Chicken */
    RESPAWN_TICKS: 25,

    /** Wander radius from spawn in tiles (verified: default = 5)
     * @see https://osrs-docs.com/docs/variables/wander-range/ */
    WANDER_RADIUS: 5,
  },

  /**
   * Item defaults (used by DataManager.normalizeItem)
   * @see https://oldschool.runescape.wiki/w/Attack_speed
   */
  ITEM: {
    /** Standard weapon attack speed in ticks */
    ATTACK_SPEED: 4,

    /** Standard melee attack range in tiles */
    ATTACK_RANGE: 1,
  },
} as const,
```

### Phase 2: Update DataManager.ts

**File**: `packages/shared/src/data/DataManager.ts`

**Step 2a**: Add import at top of file:

```typescript
import { COMBAT_CONSTANTS } from '../constants/CombatConstants';
```

**Step 2b**: Update `normalizeNPC()` method to use constants:

| Line | Current (hardcoded) | Updated (uses constants) |
|------|---------------------|--------------------------|
| 310 | `aggroRange: npc.combat?.aggroRange ?? 0` | `aggroRange: npc.combat?.aggroRange ?? 0` (keep - non-aggressive default) |
| 311 | `combatRange: npc.combat?.combatRange ?? 1.5` | `combatRange: npc.combat?.combatRange ?? COMBAT_CONSTANTS.DEFAULTS.NPC.COMBAT_RANGE` |
| 312 | `attackSpeedTicks: npc.combat?.attackSpeedTicks ?? 4` | `attackSpeedTicks: npc.combat?.attackSpeedTicks ?? COMBAT_CONSTANTS.DEFAULTS.NPC.ATTACK_SPEED_TICKS` |
| 313 | `(npc.combat?.respawnTicks ?? 25) * 600` | `(npc.combat?.respawnTicks ?? COMBAT_CONSTANTS.DEFAULTS.NPC.RESPAWN_TICKS) * COMBAT_CONSTANTS.TICK_DURATION_MS` |
| 321 | `wanderRadius: npc.movement?.wanderRadius ?? 0` | `wanderRadius: npc.movement?.wanderRadius ?? 0` (keep - stationary default) |

**Note**: `aggroRange: 0` and `wanderRadius: 0` are intentional defaults (non-aggressive, stationary) - manifests must explicitly enable these behaviors.

### Phase 3: Fix AggroSystem.ts Bug

**File**: `packages/shared/src/systems/shared/combat/AggroSystem.ts`

**Problem**: AggroSystem ignores manifest values for `aggroRange` and `leashRange`, using `MOB_BEHAVIORS` lookup instead.

**Current code** (around line 204):
```typescript
const behavior =
  AGGRO_CONSTANTS.MOB_BEHAVIORS[mobType] ||
  AGGRO_CONSTANTS.MOB_BEHAVIORS.default;

// ...
detectionRange: behavior.detectionRange,  // Always 4, ignores manifest
leashRange: behavior.leashRange,          // Always 7, ignores manifest
```

**Fix**: Update `registerMob()` to accept and use manifest data:

```typescript
// In registerMob(), use mob data from manifest with constant fallback:
const detectionRange = mobData.combat?.aggroRange ?? COMBAT_CONSTANTS.DEFAULTS.NPC.AGGRO_RANGE;
const leashRange = mobData.combat?.leashRange ?? COMBAT_CONSTANTS.DEFAULTS.NPC.LEASH_RANGE;

const aiState: MobAIStateData = {
  // ...
  detectionRange,
  leashRange,
  // ...
};
```

**Files to check for MOB_BEHAVIORS usage**:
- `AggroSystem.ts` (lines 204-205, 367-368, 794-795)
- `AggroSystem.test.ts` (lines 138, 144, 149, 154, 339)

### Phase 4: Clean Up Redundant Constants

**File**: `packages/shared/src/constants/CombatConstants.ts`

#### Remove (unused):

```typescript
// DELETE - These tier labels are never used at runtime
// Items.json defines actual values per-weapon
ATTACK_SPEED_TICKS: {
  FASTEST: 3,
  FAST: 4,
  MEDIUM: 5,
  SLOW: 6,
  SLOWEST: 7,
},

// DELETE - Duplicate of DEFAULTS.NPC.RESPAWN_TICKS
RESPAWN_TICKS_MIN: 25,
RESPAWN_TICKS_DEFAULT: 25,
```

#### Keep (actively used):

```typescript
// KEEP - Used by TileSystem for attack patterns
MELEE_RANGE_STANDARD: 1,  // Cardinal-only attacks
MELEE_RANGE_HALBERD: 2,   // Diagonal-allowed attacks

// KEEP - Used for spawn variation
RESPAWN_TICKS_RANDOMNESS: 8,

// KEEP - All the global timing constants
DEFAULT_ATTACK_SPEED_TICKS: 4,  // Used by Entity.ts, CombatEntityResolver.ts, etc.
```

#### Deprecate (mark for future removal):

```typescript
// Add deprecation comment to AGGRO_CONSTANTS.MOB_BEHAVIORS
/**
 * @deprecated Use manifest values with COMBAT_CONSTANTS.DEFAULTS fallback instead.
 * This lookup table is legacy and should be removed once AggroSystem is updated.
 */
MOB_BEHAVIORS: {
  // ...
}
```

### Phase 5: Resolve MOB_CONSTANTS Conflict

**File**: `packages/shared/src/constants/GameConstants.ts`

**Problem**: Two conflicting respawn definitions:
- `GameConstants.ts`: `MOB_CONSTANTS.MOB_RESPAWN_TIME: 30000` (30 seconds in ms)
- `CombatConstants.ts`: `RESPAWN_TICKS_DEFAULT: 25` (15 seconds = 15000ms)

**Fix**: Update `MOB_CONSTANTS` to derive from tick-based constant:

```typescript
export const MOB_CONSTANTS = {
  SPAWN_RADIUS: 20,
  MAX_MOBS_PER_AREA: 10,
  // Derive from tick-based constant for consistency
  MOB_RESPAWN_TIME: COMBAT_CONSTANTS.DEFAULTS.NPC.RESPAWN_TICKS * COMBAT_CONSTANTS.TICK_DURATION_MS,
  AI_UPDATE_INTERVAL: 1000,
} as const;
```

### Phase 6: Fix Manifest Data

**File**: `packages/server/world/assets/manifests/npcs.json`

**Fix goblin respawn time** (currently 25, OSRS is 35):

```json
{
  "id": "goblin",
  "combat": {
    "attackSpeedTicks": 4,
    "respawnTicks": 35,  // Changed from 25 to OSRS-accurate 35
    "aggroRange": 4,
    "combatRange": 1,
    "leashRange": 7
  }
}
```

### Phase 7: Update Tests

**File**: `packages/shared/src/systems/shared/combat/__tests__/AggroSystem.test.ts`

Update tests that reference `MOB_BEHAVIORS.default`:

```typescript
// Before:
const defaultBehavior = AGGRO_CONSTANTS.MOB_BEHAVIORS.default;

// After:
const defaultBehavior = {
  behavior: 'passive',
  detectionRange: COMBAT_CONSTANTS.DEFAULTS.NPC.AGGRO_RANGE,
  leashRange: COMBAT_CONSTANTS.DEFAULTS.NPC.LEASH_RANGE,
  levelIgnoreThreshold: 0,
};
```

---

## Execution Checklist

```
[ ] Phase 1: CombatConstants.ts - Add DEFAULTS object
[ ] Phase 2: DataManager.ts - Import and use DEFAULTS
[ ] Phase 3: AggroSystem.ts - Fix bug, use manifest values
[ ] Phase 4: CombatConstants.ts - Remove unused constants
[ ] Phase 5: GameConstants.ts - Resolve MOB_RESPAWN_TIME conflict
[ ] Phase 6: npcs.json - Fix goblin respawnTicks (25 → 35)
[ ] Phase 7: AggroSystem.test.ts - Update test references
[ ] Build & Test - Run `bun run build` and `npm test`
```

---

## Final Constants Structure

```typescript
// CombatConstants.ts (after refactor)
export const COMBAT_CONSTANTS = {
  // === UNIVERSAL GAME TIMING ===
  TICK_DURATION_MS: 600,

  // === GLOBAL COMBAT MECHANICS ===
  DEFAULT_ATTACK_SPEED_TICKS: 4,  // Keep for Entity.ts etc.
  COMBAT_TIMEOUT_TICKS: 8,
  LOGOUT_PREVENTION_TICKS: 16,
  HEALTH_REGEN_INTERVAL_TICKS: 100,
  HEALTH_REGEN_COOLDOWN_TICKS: 17,  // Custom mechanic (not in OSRS)
  AFK_DISABLE_RETALIATE_TICKS: 2000,

  // === ATTACK RANGE PATTERNS (used by TileSystem) ===
  MELEE_RANGE_STANDARD: 1,
  MELEE_RANGE_HALBERD: 2,

  // === DEATH/LOOT SYSTEM (OSRS-accurate) ===
  GRAVESTONE_TICKS: 1500,
  GROUND_ITEM_DESPAWN_TICKS: 300,
  UNTRADEABLE_DESPAWN_TICKS: 300,
  LOOT_PROTECTION_TICKS: 100,
  CORPSE_DESPAWN_TICKS: 200,
  DEATH: { /* ... */ },

  // === COMBAT FORMULAS (OSRS-accurate) ===
  BASE_CONSTANT: 64,
  EFFECTIVE_LEVEL_CONSTANT: 8,
  DAMAGE_DIVISOR: 640,
  HIT_DELAY: { /* ... */ },
  XP: { /* ... */ },

  // === RESPAWN VARIATION ===
  RESPAWN_TICKS_RANDOMNESS: 8,

  // === MANIFEST DEFAULTS ===
  DEFAULTS: {
    NPC: {
      ATTACK_SPEED_TICKS: 4,
      AGGRO_RANGE: 4,        // Unverified - estimated
      COMBAT_RANGE: 1,
      LEASH_RANGE: 7,
      RESPAWN_TICKS: 25,
      WANDER_RADIUS: 5,
    },
    ITEM: {
      ATTACK_SPEED: 4,
      ATTACK_RANGE: 1,
    },
  },
} as const;

// REMOVED:
// - ATTACK_SPEED_TICKS.FASTEST/FAST/MEDIUM/SLOW/SLOWEST (unused)
// - RESPAWN_TICKS_MIN (duplicate)
// - RESPAWN_TICKS_DEFAULT (moved to DEFAULTS.NPC)

// DEPRECATED:
// - AGGRO_CONSTANTS.MOB_BEHAVIORS (legacy, use manifest + DEFAULTS)
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| AggroSystem behavior change | Medium | Mobs may aggro differently if manifest values differ from hardcoded MOB_BEHAVIORS | Test thoroughly with existing mobs |
| Removed constants break imports | High | Search codebase for all usages before removing | Update imports first |
| Goblin respawn time change | Low | Players notice faster respawns | OSRS-accurate is correct behavior |

---

## Testing Plan

1. **Unit Tests**: Run existing test suite after each phase
2. **Integration Test**: Spawn goblin, verify:
   - Respawns in 35 ticks (21 seconds)
   - Aggros at 4 tiles
   - Leashes at 7 tiles from spawn
3. **Regression Test**: Verify combat flow unchanged for:
   - Player attacking mob
   - Mob attacking player
   - Mob returning to spawn when player runs

---

## References

- [OSRS Wiki - Game tick](https://oldschool.runescape.wiki/w/Game_tick)
- [OSRS Wiki - Attack speed](https://oldschool.runescape.wiki/w/Attack_speed)
- [OSRS Wiki - Aggressiveness](https://oldschool.runescape.wiki/w/Aggressiveness)
- [OSRS Wiki - Spawning](https://oldschool.runescape.wiki/w/Spawning)
- [osrs-docs - Max Range](https://osrs-docs.com/docs/variables/max-range/)
- [osrs-docs - Wander Range](https://osrs-docs.com/docs/variables/wander-range/)
