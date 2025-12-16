# XP Visual Feedback System - Technical Audit & Improvement Plan

## Current Rating: 7/10

**Target Rating: 9/10**

---

## System Overview

The XP Visual Feedback System provides RuneLite-style XP progress orbs and floating XP drops for visual feedback when players gain experience.

### Components

| File | Lines | Purpose |
|------|-------|---------|
| `packages/client/src/game/hud/XPProgressOrb.tsx` | 523 | HUD component with progress orbs and floating drops |
| `packages/shared/src/systems/client/XPDropSystem.ts` | 243 | 3D sprite-based XP drops (disabled, kept for future) |
| `packages/server/src/systems/ServerNetwork/event-bridge.ts` | +36 | Server forwards `SKILLS_XP_GAINED` → `xpDrop` packet |
| `packages/shared/src/systems/client/ClientNetwork.ts` | +11 | Client handler emits `XP_DROP_RECEIVED` event |

### Architecture Flow

```
Server (SkillsSystem)
    ↓ SKILLS_XP_GAINED event
EventBridge
    ↓ xpDrop packet (skill, xpGained, newXp, newLevel, position)
ClientNetwork
    ↓ XP_DROP_RECEIVED event
XPProgressOrb (React HUD)
    → Updates orbs
    → Creates floating drops
```

---

## Detailed Audit by Category

### 1. Production Quality Code (7/10)

**Strengths:**
- Good JSDoc documentation at file level
- Clear interface definitions (`XPDropData`, `ActiveSkill`, `GroupedXPDrop`)
- Proper React hooks usage
- Clean styled-components with transient props

**Issues:**

| Line | Issue | Severity |
|------|-------|----------|
| 352-353 | Unsafe cast `data as XPDropData` from `unknown` - no validation | **HIGH** |
| 54-60 | `calculateXPForLevel()` loops 1→level on EVERY call (see Memory section) | **CRITICAL** |
| 1-10 | Documentation header mentions "level badge" which was removed | Low |

### 2. Best Practices (6/10)

**Strengths:**
- Good separation between orbs and floating drops rendering
- DRY skill normalization function
- Proper cleanup in `useEffect` return statements

**Issues:**

| Issue | Impact |
|-------|--------|
| `SKILL_ICONS` duplicated in `XPProgressOrb.tsx` and `XPDropSystem.ts` | Maintenance burden |
| No unit tests | Cannot verify behavior |
| Single component handles too many responsibilities (SRP violation) | Hard to maintain |

### 3. OWASP Security (9/10)

**Strengths:**
- XP calculation is SERVER-SIDE only (`SkillsSystem.ts`)
- Client is display-only - cannot fabricate XP
- No user input injection vectors

**Issue:**
- Line 352: Should validate data shape before cast

### 4. Game Studio Audit (8/10)

**Strengths:**
- Server authoritative architecture
- Client cannot cheat XP values
- Anti-cheat: XP drops require server packet
- Scalable design (max ~15 concurrent skills)

### 5. Memory & Allocation Hygiene (4/10) - **CRITICAL**

#### The Real Problem: Render Path Performance

The tick interval (600ms) is NOT the critical issue - it's only 1.67 Hz.

**THE CRITICAL ISSUE is in the render path:**

```typescript
// Lines 467-475 - Called on EVERY RENDER for EACH active skill
{activeSkills.map((skill) => {
  const progress = calculateProgress(skill.xp, skill.level);  // Calls calculateXPForLevel 2x
  const xpToLevel = getXPToNextLevel(skill.xp, skill.level);   // Calls calculateXPForLevel 1x
```

**`calculateXPForLevel` (lines 54-60) loops from 1 to level:**
```typescript
function calculateXPForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {  // 98 iterations for level 99!
    total += Math.floor(i + 300 * Math.pow(2, i / 7));
  }
  return Math.floor(total / 4);
}
```

**Impact Calculation:**
- 3 calls to `calculateXPForLevel` per skill per render
- For level 99: 98 loop iterations per call
- For 5 active skills at level 99: **5 × 3 × 98 = 1,470 loop iterations PER RENDER**

**Renders triggered by:**
- Tick interval (every 600ms)
- Hover state changes (mouse movement)
- New XP drops
- Level-up animations

#### Secondary Issue: Tick Interval Allocations

```typescript
// Lines 309-333
setActiveSkills((prev) => {
  const updated = prev.map((s) => {  // Always creates new array
    return { ...s, isFading: true };  // Creates new object per skill
  });
  const stillActive = updated.filter(...);  // Creates another array
});
```

While not as critical (600ms interval), these allocations are unnecessary when no changes occur.

### 6. SOLID Principles (6/10)

| Principle | Rating | Issue |
|-----------|--------|-------|
| **SRP** | 5/10 | Component handles: orb state, floating drops state, hover state, XP calculations, level-up tracking, rendering both orbs AND drops, event subscriptions |
| **OCP** | 8/10 | Good - new skills just add to `SKILL_ICONS` |
| **LSP** | N/A | No inheritance |
| **ISP** | 8/10 | Good - only depends on `world.on/off` |
| **DIP** | 7/10 | Depends on concrete `ClientWorld` type |

---

## Improvement Plan (Prioritized)

### Phase 1: Critical Performance Fix (Priority: **CRITICAL**)

#### 1.1 Pre-compute XP Table at Module Level

**Current Problem:** 1,470+ loop iterations per render with 5 skills

```typescript
// BEFORE: Loops on every call (98 iterations for level 99)
function calculateXPForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.floor(i + 300 * Math.pow(2, i / 7));
  }
  return Math.floor(total / 4);
}

// AFTER: O(1) lookup from pre-computed table (computed once at module load)
const XP_TABLE: readonly number[] = (() => {
  const table: number[] = new Array(100).fill(0); // Level 0 and 1 = 0 XP
  for (let level = 2; level <= 99; level++) {
    let total = 0;
    for (let i = 1; i < level; i++) {
      total += Math.floor(i + 300 * Math.pow(2, i / 7));
    }
    table[level] = Math.floor(total / 4);
  }
  return table;
})();

function getXPForLevel(level: number): number {
  if (level < 1) return 0;
  if (level > 99) return XP_TABLE[99];
  return XP_TABLE[level];
}
```

**Verified Output:**
- Level 1: 0 XP ✓
- Level 2: 83 XP ✓
- Level 50: 101,333 XP ✓
- Level 99: 13,034,431 XP ✓

**Impact:** Eliminates ~1,470 loop iterations per render → O(1) lookups

#### 1.2 Memoize Progress Calculations with useMemo

```typescript
// BEFORE: Recalculates on EVERY render (hover, animation, tick)
{activeSkills.map((skill) => {
  const progress = calculateProgress(skill.xp, skill.level);  // Expensive!
  const xpToLevel = getXPToNextLevel(skill.xp, skill.level);  // Expensive!
  // ... render
})}

// AFTER: Memoize derived data - only recalculate when activeSkills changes
const skillsWithProgress = useMemo(() => {
  return activeSkills.map((skill) => {
    const skillKey = normalizeSkillName(skill.skill);
    return {
      ...skill,
      progress: calculateProgress(skill.xp, skill.level),
      xpToLevel: getXPToNextLevel(skill.xp, skill.level),
      skillKey,
      icon: getSkillIcon(skillKey),
    };
  });
}, [activeSkills, calculateProgress, getXPToNextLevel]);

// Then in render, use the memoized values:
{skillsWithProgress.map((skill) => (
  <SingleOrbContainer key={`orb-${skill.skillKey}`} $fading={skill.isFading}>
    {/* Use skill.progress, skill.xpToLevel, skill.icon directly */}
  </SingleOrbContainer>
))}
```

**Impact:** Calculations only run when `activeSkills` changes, not on every hover/render

### Phase 2: Type Safety (Priority: HIGH)

#### 2.1 Add Runtime Validation for XP Drop Data

```typescript
function isValidXPDropData(data: unknown): data is XPDropData {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.skill === "string" &&
    typeof obj.xpGained === "number" &&
    typeof obj.newXp === "number" &&
    typeof obj.newLevel === "number" &&
    obj.skill.length > 0 &&
    obj.xpGained >= 0 &&
    obj.newXp >= 0 &&
    obj.newLevel >= 1 &&
    obj.newLevel <= 99
  );
}

const handleXPDrop = (data: unknown) => {
  if (!isValidXPDropData(data)) {
    console.warn("[XPProgressOrb] Invalid XP drop data received:", data);
    return;
  }
  // Now TypeScript knows data is XPDropData
};
```

### Phase 3: Memory Optimization (Priority: MEDIUM)

#### 3.1 Avoid Unnecessary Allocations in Tick Interval

```typescript
useEffect(() => {
  const tickInterval = setInterval(() => {
    const now = Date.now();
    const fadeThreshold = ORB_VISIBLE_DURATION_MS;
    const removeThreshold = ORB_VISIBLE_DURATION_MS + ORB_FADE_DURATION_MS;

    setActiveSkills((prev) => {
      // Early exit if empty
      if (prev.length === 0) return prev;

      let hasChanges = false;
      let hasRemovals = false;

      // First pass: check what needs to change (no allocations)
      for (const skill of prev) {
        const elapsed = now - skill.lastGainTime;
        if (!skill.isFading && elapsed >= fadeThreshold) hasChanges = true;
        if (elapsed >= removeThreshold) hasRemovals = true;
      }

      // Early exit if nothing changed
      if (!hasChanges && !hasRemovals) return prev;

      // Only allocate if we have changes
      if (hasRemovals) {
        return prev
          .filter((s) => now - s.lastGainTime < removeThreshold)
          .map((s) =>
            !s.isFading && now - s.lastGainTime >= fadeThreshold
              ? { ...s, isFading: true }
              : s
          );
      }

      // Only fading changes, no removals
      return prev.map((s) =>
        !s.isFading && now - s.lastGainTime >= fadeThreshold
          ? { ...s, isFading: true }
          : s
      );
    });
  }, GAME_TICK_MS);

  return () => clearInterval(tickInterval);
}, []);
```

### Phase 4: Code Organization (Priority: MEDIUM)

#### 4.1 Extract SKILL_ICONS to Shared Constants

```typescript
// packages/shared/src/data/skill-icons.ts
export const SKILL_ICONS: Readonly<Record<string, string>> = {
  attack: "⚔️",
  strength: "💪",
  defence: "🛡️",
  defense: "🛡️",
  constitution: "❤️",
  hitpoints: "❤️",
  ranged: "🏹",
  prayer: "✨",
  magic: "🔮",
  cooking: "🍖",
  woodcutting: "🪓",
  fishing: "🐟",
  firemaking: "🔥",
  mining: "⛏️",
  smithing: "🔨",
} as const;

export function getSkillIcon(skill: string): string {
  return SKILL_ICONS[skill.toLowerCase()] ?? "⭐";
}
```

#### 4.2 Update Documentation Header

```typescript
/**
 * XPProgressOrb - XP Progress Display (RuneLite XP Globes-style)
 *
 * Shows circular progress orbs at top-center of screen:
 * - Separate orb per active skill (side by side)
 * - Progress ring shows XP to next level
 * - Floating XP numbers (grouped by game tick) rise toward orbs
 * - Hover tooltip shows detailed XP info
 * - Orbs fade after ~10 seconds of inactivity
 * - Smooth fade-out animation (1 second)
 *
 * @see XPDropSystem for alternative 3D sprite-based drops (disabled)
 */
```

### Phase 5: SRP Refactor (Priority: LOW - Optional for 9/10)

Split into focused components:
- `useXPOrbState.ts` - State management hook
- `FloatingXPDrops.tsx` - Just the floating drops
- `XPProgressOrbs.tsx` - Just the orbs
- `XPProgressOrb.tsx` - Composition root

---

## Implementation Checklist

### Required for 9/10:
- [ ] **1.1** Pre-compute XP table at module level (eliminates loop iterations)
- [ ] **1.2** Memoize progress calculations with useMemo
- [ ] **2.1** Add `isValidXPDropData` validation function
- [ ] **3.1** Optimize tick interval to avoid allocations when unchanged
- [ ] **4.1** Extract SKILL_ICONS to shared constants
- [ ] **4.2** Update documentation header

### Optional (polish):
- [ ] **5.x** SRP refactor into sub-components

---

## Expected Rating After Improvements

| Category | Before | After | Key Change |
|----------|--------|-------|------------|
| Production Quality | 7/10 | 9/10 | Validation + memoization |
| Best Practices | 6/10 | 8/10 | DRY constants + clearer code |
| OWASP Security | 9/10 | 9/10 | Already strong |
| Game Studio Audit | 8/10 | 9/10 | Performance improvements |
| Memory Hygiene | 4/10 | 9/10 | **Critical fix: XP table + memoization** |
| SOLID Principles | 6/10 | 8/10 | Better organization |

**Overall: 7/10 → 9/10**

---

## Summary of Critical Fixes

1. **XP Table Pre-computation** - The single most impactful fix. Currently doing ~1,470 loop iterations per render. Pre-computing makes it O(1).

2. **useMemo for Progress** - Prevents recalculating derived values on every hover/animation.

3. **Input Validation** - Type safety and defense against malformed data.

4. **DRY Constants** - Extract duplicated SKILL_ICONS.

5. **Optimized Tick Interval** - Early exits when no changes needed.

---

## Files to Create/Modify

### New Files:
| File | Purpose |
|------|---------|
| `packages/shared/src/data/skill-icons.ts` | Shared SKILL_ICONS constant and `getSkillIcon()` helper |

### Modified Files:
| File | Changes |
|------|---------|
| `packages/shared/src/data/index.ts` | Export skill-icons |
| `packages/client/src/game/hud/XPProgressOrb.tsx` | XP table, useMemo, validation, tick optimization, import shared icons |
| `packages/shared/src/systems/client/XPDropSystem.ts` | Import shared SKILL_ICONS (DRY) |

### Implementation Order:
1. Create `skill-icons.ts` and update `data/index.ts`
2. Update `XPProgressOrb.tsx` (all changes)
3. Update `XPDropSystem.ts` (use shared icons)
4. Build and verify
