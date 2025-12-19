# OSRS Gap Implementation Plan

**Created**: December 2024
**Status**: Ready for Implementation
**Estimated Effort**: 1-2 hours

This plan addresses the 2 remaining gaps from the OSRS Implementation Plan.

---

## Executive Summary

| Gap | Priority | Effort | Impact |
|-----|----------|--------|--------|
| **Gap 1: NPC Defense Bonus** | MEDIUM | 30-45 min | More accurate hit chance vs NPCs |
| **Gap 2: Interface Segregation** | VERY LOW | 30-45 min | Test mocking convenience only |

**Note**: The original OSRS-REMAINING-GAPS.md listed 3 gaps, but Gap 2 (processAutoAttackOnTick decomposition) is already complete. The method is ~50 lines calling 6 helper methods.

---

## Gap 1: NPC Defense Bonus from Manifest

### Problem Statement

Combat accuracy calculations hardcode `targetDefenseBonus = 0` for all NPCs, ignoring that some NPCs should have equipment-based defense bonuses (e.g., armored guards, dragons with scales).

**Current Code** (`CombatCalculations.ts:251`):
```typescript
const targetDefenseBonus = 0; // Most NPCs have 0 defense bonus (would come from their equipment)
```

### OSRS Context

In OSRS, NPCs have two separate defense values:
1. **Defense Level** - Affects effective defense (like player levels)
2. **Defense Bonus** - Equipment/natural armor bonus (0 to 300+)

Examples:
- Goblin: Defense Level 1, Defense Bonus 0
- Guard: Defense Level 20, Defense Bonus ~10-20
- Bronze Dragon: Defense Level 100, Defense Bonus ~100

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/types/entities/npc-mob-types.ts` | Add `defenseBonus` to `MobStats` interface |
| `packages/shared/src/utils/game/CombatCalculations.ts` | Add `defenseBonus` to `CombatStats`, read from target |
| `packages/server/world/assets/manifests/npcs.json` | Add `defenseBonus` field to each mob |

### Implementation Steps

#### Step 1: Update MobStats Interface

**File**: `packages/shared/src/types/entities/npc-mob-types.ts`
**Location**: Lines 411-418

```typescript
// BEFORE
export interface MobStats {
  level: number;
  health: number;
  attack: number;
  strength: number;
  defense: number;
  ranged: number;
}

// AFTER
export interface MobStats {
  level: number;
  health: number;
  attack: number;
  strength: number;
  defense: number;
  defenseBonus: number;  // Equipment/armor defense bonus (0 = unarmored)
  ranged: number;
}
```

#### Step 2: Update CombatStats Interface

**File**: `packages/shared/src/utils/game/CombatCalculations.ts`
**Location**: Lines 81-87

```typescript
// BEFORE
export interface CombatStats {
  attack?: number;
  strength?: number;
  defense?: number;
  ranged?: number;
  attackPower?: number;
}

// AFTER
export interface CombatStats {
  attack?: number;
  strength?: number;
  defense?: number;
  defenseBonus?: number;  // Equipment defense bonus
  ranged?: number;
  attackPower?: number;
}
```

#### Step 3: Update calculateDamage Function

**File**: `packages/shared/src/utils/game/CombatCalculations.ts`
**Location**: Lines 250-251

```typescript
// BEFORE
const targetDefense = target.stats?.defense || 1;
const targetDefenseBonus = 0; // Most NPCs have 0 defense bonus

// AFTER
const targetDefense = target.stats?.defense || 1;
const targetDefenseBonus = target.stats?.defenseBonus ?? 0; // Read from stats, default 0
```

#### Step 4: Update npcs.json Manifest

**File**: `packages/server/world/assets/manifests/npcs.json`

Add `defenseBonus` to each mob's stats object:

```json
{
  "id": "goblin",
  "stats": {
    "level": 2,
    "health": 5,
    "attack": 1,
    "strength": 1,
    "defense": 1,
    "defenseBonus": 0,
    "ranged": 1,
    "magic": 1
  }
}
```

**Reference Values for Common NPCs**:

| NPC | Defense Level | Defense Bonus | Notes |
|-----|---------------|---------------|-------|
| Goblin | 1 | 0 | Unarmored |
| Guard | 20-30 | 15 | Chain armor |
| Giant Spider | 5 | 0 | No natural armor |
| Skeleton | 10 | 5 | Some bones act as armor |
| Moss Giant | 40 | 10 | Tough skin |
| Lesser Demon | 70 | 30 | Demonic hide |
| Dragon (any) | 80-200 | 50-150 | Scales provide protection |
| Boss NPCs | Varies | 50-200 | Generally high |

#### Step 5: Update MobInstance Interface (if needed)

**File**: `packages/shared/src/types/entities/npc-mob-types.ts`
**Location**: Lines 526-533

Check if `MobInstance.stats` needs the same field:

```typescript
stats: {
  level: number;
  health: number;
  attack: number;
  strength: number;
  defense: number;
  defenseBonus: number;  // Add this
  ranged: number;
};
```

### Verification

After implementation:

1. **Type Check**: Run `bun run build` - should have no TypeScript errors
2. **Unit Test**: Add test case to `CombatCalculations.test.ts`:

```typescript
describe('defenseBonus from target', () => {
  it('uses defenseBonus when provided', () => {
    const attacker = { stats: { attack: 60, strength: 60 } };
    const armoredTarget = { stats: { defense: 30, defenseBonus: 50 } };
    const unarmoredTarget = { stats: { defense: 30, defenseBonus: 0 } };

    // Armored target should be hit less often (on average over many rolls)
    // This is probabilistic, so we'd test the formula directly
    const hitChanceArmored = calculateAccuracy(60, 0, 30, 50, 'accurate');
    const hitChanceUnarmored = calculateAccuracy(60, 0, 30, 0, 'accurate');

    expect(hitChanceArmored).toBeLessThan(hitChanceUnarmored);
  });
});
```

3. **Integration Test**: Attack a mob in-game, verify damage variance matches expected accuracy

### Rollback

If issues arise:
- Revert `defenseBonus` reads to hardcoded `0`
- Keep interface changes (backward compatible with `??` operator)

---

## Gap 2: Interface Segregation (Optional)

### Problem Statement

The `CombatPlayerEntity` interface has many properties mixed together, making test mocking verbose. This is a code quality improvement, not a functional requirement.

**Current Interface** (`CombatSystem.ts:65-92`):
```typescript
interface CombatPlayerEntity {
  id: string;
  combat?: { inCombat: boolean; combatTarget: string | null; };
  data?: { c?: boolean; ct?: string | null; e?: string; isLoading?: boolean; };
  emote?: string;
  base?: { quaternion: { set(...): void }; };
  node?: { quaternion: { set(...): void; copy(...): void; }; };
  position?: { x: number; y: number; z: number };
  getPosition?: () => { x: number; y: number; z: number };
  markNetworkDirty?: () => void;
  health?: number;
  name?: string;
}
```

### Priority

**VERY LOW** - Only improves test ergonomics. Skip unless refactoring nearby code.

### Proposed Solution

Split into focused interfaces following Interface Segregation Principle:

```typescript
// Core identity
interface CombatEntity {
  id: string;
  name?: string;
}

// Position capabilities
interface Positionable {
  position?: { x: number; y: number; z: number };
  getPosition?: () => { x: number; y: number; z: number };
}

// 3D orientation
interface Rotatable {
  base?: { quaternion: { set(x: number, y: number, z: number, w: number): void }; };
  node?: { quaternion: { set(...): void; copy(...): void; }; };
}

// Combat state tracking
interface CombatCapable {
  combat?: { inCombat: boolean; combatTarget: string | null; };
  data?: { c?: boolean; ct?: string | null; e?: string; isLoading?: boolean; };
  emote?: string;
}

// Health tracking
interface Damageable {
  health?: number;
}

// Network sync
interface NetworkSyncable {
  markNetworkDirty?: () => void;
}

// Full player entity (composition)
interface CombatPlayerEntity extends
  CombatEntity,
  Positionable,
  Rotatable,
  CombatCapable,
  Damageable,
  NetworkSyncable {}
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/systems/shared/combat/CombatSystem.ts` | Split interface at lines 65-92 |
| `packages/shared/src/systems/shared/combat/CombatStateService.ts` | Update duplicate interface at lines 35-48 |
| Test files | Update mocks to use smaller interfaces |

### Benefits

1. **Easier Testing**: Mock only what you need
   ```typescript
   // Before: Mock everything
   const mockPlayer = { id: '1', combat: null, data: null, emote: null, ... };

   // After: Mock only what's needed
   const mockPlayer: CombatEntity & Positionable = {
     id: '1',
     position: { x: 0, y: 0, z: 0 }
   };
   ```

2. **Better Documentation**: Interface names describe capabilities
3. **Reusability**: Smaller interfaces can be reused in other systems

### Implementation Notes

- This is a **non-breaking refactor** - the composed interface is identical
- All existing code continues to work
- Only new tests would benefit from smaller interfaces
- Consider doing this when modifying CombatSystem for other reasons

### Skip Criteria

Skip this gap if:
- No other CombatSystem changes are planned
- Test coverage is already adequate
- Team prefers single large interfaces

---

## Implementation Order

```
1. Gap 1: NPC Defense Bonus (30-45 min)
   ├── Update MobStats interface
   ├── Update CombatStats interface
   ├── Update calculateDamage function
   ├── Update npcs.json manifest
   ├── Add unit tests
   └── Verify with integration test

2. Gap 2: Interface Segregation (OPTIONAL, 30-45 min)
   ├── Split CombatPlayerEntity interface
   ├── Update CombatStateService interface
   └── Update test mocks (as needed)
```

---

## Pre-Implementation Checklist

### Gap 1: NPC Defense Bonus

- [ ] Confirm `npcs.json` is the only manifest needing updates (no other mob sources)
- [ ] Check if `MobNPCSpawnerSystem.ts` passes stats through correctly
- [ ] Verify `MobEntity.getMobData()` returns stats correctly
- [ ] Ensure no other hardcoded `defenseBonus = 0` exists in codebase

### Gap 2: Interface Segregation

- [ ] Confirm no external packages depend on `CombatPlayerEntity` shape
- [ ] Check if `CombatStateService` interface is also used elsewhere
- [ ] Review existing tests to understand mock patterns

---

## Post-Implementation Verification

```bash
# Type check
bun run build

# Run combat tests
npm test -- --grep "Combat"

# Run full test suite
npm test

# Lint check
npm run lint
```

---

## Acceptance Criteria

### Gap 1: NPC Defense Bonus

- [ ] `MobStats` interface includes `defenseBonus: number`
- [ ] `CombatStats` interface includes `defenseBonus?: number`
- [ ] `calculateDamage` reads `defenseBonus` from target stats
- [ ] All mobs in `npcs.json` have `defenseBonus` field
- [ ] Unit test verifies armored targets are hit less often
- [ ] Build passes with no TypeScript errors

### Gap 2: Interface Segregation (if implemented)

- [ ] `CombatPlayerEntity` is composed from smaller interfaces
- [ ] All existing code compiles without changes
- [ ] At least one test uses smaller interface for mocking

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missing `defenseBonus` in some mob definitions | Medium | Low | Default to 0 via `??` operator |
| Interface split breaks external code | Low | Medium | Search for imports before splitting |
| Accuracy formula changes affect game balance | Low | Medium | Values chosen to match OSRS feel |

---

## Conclusion

Gap 1 (NPC Defense Bonus) is a straightforward data flow fix that improves OSRS accuracy. It should be implemented.

Gap 2 (Interface Segregation) is optional code quality improvement. Implement only if modifying CombatSystem for other reasons.

After completing Gap 1, the OSRS Implementation Plan will be **25/26 complete (96%)** with only the optional interface refactor remaining.
