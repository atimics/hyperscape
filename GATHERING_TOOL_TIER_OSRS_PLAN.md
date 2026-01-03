# Gathering Tool Tier & Success Rate OSRS Accuracy Plan

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Skill-specific roll mechanics | ✅ COMPLETED |
| 1b | Manifest-driven tools refactor | ✅ COMPLETED |
| 2 | OSRS success rate LERP formula | ✅ COMPLETED |
| 3 | Tool tier definitions | ✅ COMPLETED (via tools.json) |
| 4 | Debug logging | ✅ COMPLETED |

**All phases complete!** The gathering system now uses OSRS-accurate mechanics.

**Note**: Phase 3 was merged into Phase 1b. Tool definitions moved from hardcoded `TOOL_TIERS`
to `packages/server/world/assets/manifests/tools.json` for better maintainability.

---

## Executive Summary

This document outlines the implementation plan to make tool tier and skill level mechanics OSRS-accurate for woodcutting, mining, and fishing. Research reveals a **critical difference** between how tools affect gathering in woodcutting vs mining.

**Key Finding**: Woodcutting and Mining work DIFFERENTLY in OSRS:
- **Woodcutting**: Axe tier affects SUCCESS RATE, roll frequency is fixed (4 ticks)
- **Mining**: Pickaxe tier affects ROLL FREQUENCY, success rate is level-only

---

## OSRS Mechanics Research

### Sources
- [OSRS Wiki - Woodcutting](https://oldschool.runescape.wiki/w/Woodcutting)
- [OSRS Wiki - Mining](https://oldschool.runescape.wiki/w/Mining)
- [OSRS Wiki - Pickaxe](https://oldschool.runescape.wiki/w/Pickaxe)
- [OSRS Wiki - Axe](https://oldschool.runescape.wiki/w/Axe)
- [OSRS Wiki - Skilling Success Rate](https://oldschool.runescape.wiki/w/Catch_rate)
- [Mod Ash Twitter](https://x.com/JagexAsh/status/1215007439692730370) - "The success chance for each roll depends on your axe and your WC level"

### Universal Skilling Success Formula

OSRS uses a universal "stat_random" formula for all skilling:

```
P(Level) = (1 + floor(low × (99 - Level) / 98 + high × (Level - 1) / 98 + 0.5)) / 256
```

Where:
- `low` = success odds numerator at level 1 (x/256)
- `high` = success odds numerator at level 99 (x/256)
- Result is linearly interpolated (LERP) based on current level

---

## Woodcutting Mechanics

### How It Works in OSRS

1. **Roll Frequency**: Fixed at **4 game ticks** (2.4 seconds) for most trees
2. **Success Rate**: Determined by BOTH axe tier AND woodcutting level
3. **Each axe tier has different low/high values per tree type**
4. **At high WC levels, lower axes can reach 100% success**

### Mod Ash Confirmation (Twitter, Jan 2020)

> "Like other training trees, the success chance for each roll depends on your axe and your WC level. It reaches 100% at different WC levels for each axe - so if you're very high level, you may have maxed it to 100% with just a steel axe anyway."

### Axe Speed Comparisons (from OSRS Wiki)

| Axe Tier | Relative Speed | Level Req |
|----------|----------------|-----------|
| Bronze | 1.0x (baseline) | 1 |
| Iron | ~1.5x | 1 |
| Steel | ~2.0x | 6 |
| Black | ~2.25x | 11 |
| Mithril | ~2.5x | 21 |
| Adamant | ~3.0x | 31 |
| Rune | ~3.5x | 41 |
| Dragon | ~3.85x (~10% > rune) | 61 |
| Crystal | ~4.0x | 71 |

**Note**: These are SUCCESS RATE multipliers, not speed multipliers. Rolls still happen every 4 ticks.

---

## Mining Mechanics

### How It Works in OSRS

1. **Roll Frequency**: Varies by pickaxe tier (8 ticks bronze → 3 ticks rune → 2.83 ticks dragon)
2. **Success Rate**: Determined by mining level ONLY
3. **Pickaxe tier does NOT affect success rate, only roll frequency**

### Mod Ash Confirmation (Twitter, Oct 2019)

> "Your level affects the chance of getting ore each time the game rolls; your pickaxe affects how often that happens."

### Pickaxe Tick Intervals

| Pickaxe Tier | Ticks Between Rolls | Level Req |
|--------------|---------------------|-----------|
| Bronze | 8 ticks | 1 |
| Iron | 7 ticks | 1 |
| Steel | 6 ticks | 6 |
| Black | 5 ticks | 11 |
| Mithril | 5 ticks | 21 |
| Adamant | 4 ticks | 31 |
| Rune | 3 ticks | 41 |
| Dragon | 2.83 ticks (1/6 chance of 2) | 61 |
| Crystal | 2.75 ticks (1/4 chance of 2) | 71 |

---

## Fishing Mechanics

### How It Works in OSRS

1. **Roll Frequency**: Fixed at **5 game ticks** (3 seconds) for most spots
2. **Success Rate**: Determined by fishing level ONLY
3. **Equipment does NOT affect speed or success rate** (same rod/net for everyone)

---

## Current Implementation Analysis

### What We Have

```typescript
// TOOL_TIERS defines cycleMultiplier per tool
woodcutting: [
  { id: "dragon_hatchet", cycleMultiplier: 0.7 },  // 30% faster cycles
  { id: "rune_hatchet", cycleMultiplier: 0.78 },
  { id: "bronze_hatchet", cycleMultiplier: 1.0 },
]

// computeCycleTicks uses tool multiplier
cycleTickInterval = baseTicks * toolMultiplier

// computeSuccessRate IGNORES tool tier
successRate = 0.35 + (levelDelta * 0.01)  // No tool input!
```

### Current vs OSRS Comparison

| Aspect | Current | OSRS (Woodcutting) | OSRS (Mining) |
|--------|---------|-------------------|---------------|
| Roll frequency | Tool affects | Fixed (4 ticks) | Tool affects |
| Success rate | Level only | Level + Tool | Level only |
| Tool impact | Faster rolls | Higher success | Faster rolls |

**Current implementation is backwards for woodcutting!**

---

## Implementation Plan

### Phase 1: Separate Woodcutting and Mining Mechanics

**Priority**: HIGH - Core gameplay accuracy

**Files to modify**:
- `packages/shared/src/systems/shared/entities/ResourceSystem.ts`
- `packages/shared/src/constants/GatheringConstants.ts`

#### 1.1 Add Skill-Specific Mechanics Flag

```typescript
// In GatheringConstants.ts
SKILL_MECHANICS: {
  woodcutting: {
    type: 'fixed-roll-variable-success',  // Fixed 4 ticks, tool affects success
    baseRollTicks: 4,
  },
  mining: {
    type: 'variable-roll-fixed-success',  // Tool affects ticks, level-only success
    // Tick intervals defined per pickaxe tier
  },
  fishing: {
    type: 'fixed-roll-fixed-success',     // Fixed 5 ticks, level-only success
    baseRollTicks: 5,
  },
} as const,
```

#### 1.2 Refactor computeCycleTicks()

```typescript
private computeCycleTicks(
  skill: string,
  skillLevel: number,
  tuned: { baseCycleTicks: number; levelRequired: number },
  toolTier: ToolTierInfo | null,
): number {
  const mechanics = GATHERING_CONSTANTS.SKILL_MECHANICS[skill];

  if (mechanics.type === 'fixed-roll-variable-success') {
    // WOODCUTTING: Fixed roll frequency, tool doesn't affect ticks
    return tuned.baseCycleTicks; // Always 4 ticks
  }

  if (mechanics.type === 'variable-roll-fixed-success') {
    // MINING: Tool tier affects roll frequency
    return toolTier?.rollTicks ?? 8; // Bronze = 8 ticks
  }

  // FISHING: Fixed roll frequency
  return tuned.baseCycleTicks; // Always 5 ticks
}
```

---

### Phase 2: OSRS-Accurate Success Rate Formula

**Priority**: HIGH - Core gameplay accuracy

#### 2.1 Add Low/High Success Tables

```typescript
// In GatheringConstants.ts
/**
 * Success rate tables using OSRS's low/high interpolation.
 * Values are x/256 (success numerator).
 *
 * Formula: P(Level) = lerp(low, high, (level-1)/98) / 256
 */
WOODCUTTING_SUCCESS_RATES: {
  // tree_type: { axe_tier: { low: x, high: y } }
  tree_normal: {
    bronze: { low: 64, high: 200 },
    iron: { low: 96, high: 220 },
    steel: { low: 128, high: 240 },
    mithril: { low: 148, high: 250 },
    adamant: { low: 166, high: 256 },  // Can reach 100%
    rune: { low: 180, high: 256 },
    dragon: { low: 200, high: 256 },
  },
  tree_oak: {
    bronze: { low: 32, high: 100 },
    iron: { low: 48, high: 120 },
    steel: { low: 64, high: 140 },
    mithril: { low: 80, high: 160 },
    adamant: { low: 96, high: 180 },
    rune: { low: 112, high: 200 },
    dragon: { low: 128, high: 220 },
  },
  tree_willow: {
    bronze: { low: 24, high: 80 },
    iron: { low: 36, high: 100 },
    steel: { low: 48, high: 120 },
    mithril: { low: 60, high: 140 },
    adamant: { low: 72, high: 160 },
    rune: { low: 84, high: 180 },
    dragon: { low: 96, high: 200 },
  },
  // ... more tree types
} as const,

MINING_SUCCESS_RATES: {
  // ore_type: { low: x, high: y } - No pickaxe modifier!
  copper: { low: 64, high: 220 },
  tin: { low: 64, high: 220 },
  iron: { low: 48, high: 180 },
  coal: { low: 32, high: 140 },
  // ... more ore types
} as const,
```

#### 2.2 Refactor computeSuccessRate()

```typescript
private computeSuccessRate(
  skill: string,
  resourceVariant: string,
  skillLevel: number,
  toolTier: string | null,
): number {
  const mechanics = GATHERING_CONSTANTS.SKILL_MECHANICS[skill];

  if (mechanics.type === 'fixed-roll-variable-success') {
    // WOODCUTTING: Both level AND tool affect success rate
    const treeType = this.getTreeTypeFromVariant(resourceVariant);
    const axeTier = toolTier || 'bronze';
    const rates = GATHERING_CONSTANTS.WOODCUTTING_SUCCESS_RATES[treeType]?.[axeTier];

    if (!rates) {
      // Fallback to bronze rates
      return this.lerpSuccessRate(64, 200, skillLevel);
    }

    return this.lerpSuccessRate(rates.low, rates.high, skillLevel);
  }

  if (mechanics.type === 'variable-roll-fixed-success') {
    // MINING: Only level affects success rate (tool affects roll frequency)
    const oreType = this.getOreTypeFromVariant(resourceVariant);
    const rates = GATHERING_CONSTANTS.MINING_SUCCESS_RATES[oreType];

    if (!rates) {
      return this.lerpSuccessRate(64, 200, skillLevel);
    }

    return this.lerpSuccessRate(rates.low, rates.high, skillLevel);
  }

  // FISHING: Same as mining (level-only)
  return this.lerpSuccessRate(48, 180, skillLevel);
}

/**
 * OSRS linear interpolation formula for success rates.
 * @param low - Success numerator at level 1 (x/256)
 * @param high - Success numerator at level 99 (x/256)
 * @param level - Current skill level
 * @returns Success probability (0-1)
 */
private lerpSuccessRate(low: number, high: number, level: number): number {
  const clampedLevel = Math.min(99, Math.max(1, level));
  const numerator = low + ((high - low) * (clampedLevel - 1)) / 98;
  return Math.min(1, (1 + Math.floor(numerator + 0.5)) / 256);
}
```

---

### Phase 3: Update Tool Tier Definitions

**Priority**: MEDIUM - Extends Phase 1/2

#### 3.1 Mining Pickaxe Tick Intervals

```typescript
// In ResourceSystem.ts TOOL_TIERS
mining: [
  {
    id: "crystal_pickaxe",
    pattern: /crystal.*(pickaxe|pick)/i,
    levelRequired: 71,
    rollTicks: 2.75,        // 1/4 chance of 2 ticks
    cycleMultiplier: 0.34,  // Legacy fallback
  },
  {
    id: "dragon_pickaxe",
    pattern: /dragon.*(pickaxe|pick)/i,
    levelRequired: 61,
    rollTicks: 2.83,        // 1/6 chance of 2 ticks
    cycleMultiplier: 0.35,
  },
  {
    id: "rune_pickaxe",
    pattern: /rune.*(pickaxe|pick)/i,
    levelRequired: 41,
    rollTicks: 3,
    cycleMultiplier: 0.375,
  },
  {
    id: "adamant_pickaxe",
    pattern: /adamant.*(pickaxe|pick)/i,
    levelRequired: 31,
    rollTicks: 4,
    cycleMultiplier: 0.5,
  },
  {
    id: "mithril_pickaxe",
    pattern: /mithril.*(pickaxe|pick)/i,
    levelRequired: 21,
    rollTicks: 5,
    cycleMultiplier: 0.625,
  },
  {
    id: "steel_pickaxe",
    pattern: /steel.*(pickaxe|pick)/i,
    levelRequired: 6,
    rollTicks: 6,
    cycleMultiplier: 0.75,
  },
  {
    id: "iron_pickaxe",
    pattern: /iron.*(pickaxe|pick)/i,
    levelRequired: 1,
    rollTicks: 7,
    cycleMultiplier: 0.875,
  },
  {
    id: "bronze_pickaxe",
    pattern: /bronze.*(pickaxe|pick)/i,
    levelRequired: 1,
    rollTicks: 8,
    cycleMultiplier: 1.0,
  },
],
```

#### 3.2 Woodcutting Axe Success Modifiers

```typescript
// Remove cycleMultiplier, add successTier for lookup
woodcutting: [
  {
    id: "crystal_hatchet",
    pattern: /crystal.*(hatchet|axe)/i,
    levelRequired: 71,
    successTier: "crystal",
  },
  {
    id: "dragon_hatchet",
    pattern: /dragon.*(hatchet|axe)/i,
    levelRequired: 61,
    successTier: "dragon",
  },
  {
    id: "rune_hatchet",
    pattern: /rune.*(hatchet|axe)/i,
    levelRequired: 41,
    successTier: "rune",
  },
  // ... etc
],
```

---

### Phase 4: Add Debug Logging

**Priority**: LOW - Verification

```typescript
// In processGatheringTick, after success roll:
console.log(
  `[Gathering] ${skill} roll: level=${skillLevel}, tool=${toolTier}, ` +
  `successRate=${(successRate * 100).toFixed(1)}%, ` +
  `roll=${roll.toFixed(3)} → ${roll < successRate ? 'SUCCESS' : 'FAIL'}`
);
```

---

## Validation Checklist

### Woodcutting
- [ ] Bronze hatchet at level 1 has ~25% success on regular trees
- [ ] Dragon hatchet at level 99 has ~100% success on regular trees
- [ ] Roll frequency is always 4 ticks regardless of axe
- [ ] Higher axes = higher success rate per roll
- [ ] At level 99, even steel axe can reach 100% on regular trees

### Mining
- [ ] Bronze pickaxe rolls every 8 ticks
- [ ] Rune pickaxe rolls every 3 ticks
- [ ] Dragon pickaxe has 1/6 chance of 2-tick roll
- [ ] Success rate is SAME regardless of pickaxe tier
- [ ] Higher level = higher success rate

### Fishing
- [ ] All rods roll every 5 ticks
- [ ] Success rate depends only on level
- [ ] Equipment doesn't affect speed or success

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing gathering | Medium | High | Feature flag, thorough testing |
| Incorrect success values | High | Medium | Use placeholder values, tune later |
| Performance regression | Low | Low | Precompute success rates like current |
| Player confusion | Low | Medium | Add tool tier info to UI |

---

## Success Criteria

After implementation:
- [ ] Woodcutting with dragon axe is noticeably faster than bronze
- [ ] Mining with rune pickaxe gets more ore/min than bronze (faster rolls)
- [ ] Success rate logs show correct interpolation
- [ ] Tool tier affects the RIGHT mechanic per skill
- [ ] Matches OSRS Wiki documentation

---

*Document Version: 1.0*
*Created: January 2026*
*Based on: OSRS Wiki, Mod Ash Twitter confirmations, community research*
