# Production Readiness Plan: Mob Combat Animation Override Fix

**Current Rating: 6.5/10**
**Target Rating: 9/10**
**Branch: `fix/mob-combat-animation-override`**

---

## Executive Summary

The mob combat animation fix works correctly but contains several issues that prevent it from being production-ready:

1. **14 debug `console.log` statements** that must be removed (across 4 files)
2. **Object allocation in hot path** (`emoteMap` created on every call)
3. **Magic number `600`** instead of using the already-imported `TICK_DURATION_MS` constant
4. **Magic number `4500`** for death animation duration (appears 5+ times in codebase)
5. **Repeated priority emote checks** that violate DRY principle
6. **Dead code in `updateAnimation()`** - VRM block is unreachable (CRITICAL FINDING)

---

## Critical Finding: Dead Code Analysis

During verification, I discovered that the VRM block in `updateAnimation()` (lines 1756-1769) is **dead code**:

```
clientUpdate() flow for VRM mobs:
  Line 1917: if (this._avatarInstance) {    // VRM path starts
  Line 1921-1937: Emote switching logic     // Handles VRM emotes HERE
  Line 2095: return;                         // Returns BEFORE updateAnimation() is called

clientUpdate() flow for GLB mobs:
  Line 2120: this.updateAnimation();         // Called only for GLB

updateAnimation():
  Line 1756: if (this._avatarInstance) {    // NEVER TRUE because only GLB reaches here
```

**Implication:** The override check I added to `updateAnimation()` at lines 1757-1761 is **useless dead code**. The fix actually works because `clientUpdate()` has the override check at line 1924.

**Action:** Remove the VRM block from `updateAnimation()` entirely.

---

## Files Modified

| File | Type of Changes |
|------|-----------------|
| `packages/shared/src/entities/npc/MobEntity.ts` | Core fix + debug logs + dead code |
| `packages/shared/src/systems/shared/combat/CombatAnimationManager.ts` | Debug logs only |
| `packages/shared/src/extras/three/createVRMFactory.ts` | Debug logs only |
| `packages/shared/src/systems/client/ClientNetwork.ts` | Debug logs only |

---

## Task 1: Remove Debug Logging (Priority: HIGH)

### 1.1 MobEntity.ts - Remove 8 debug logs

| Line | Code to Remove | Context |
|------|----------------|---------|
| 829-831 | `console.log(\`[MobEntity] ${this.config.mobType} applying pending emote...\`)` | VRM creation |
| 1719-1722 | `console.log(\`[MobEntity] ${this.config.mobType} ignoring "${serverEmote}"...\`)` | applyServerEmote |
| 1740-1742 | `console.log(\`[MobEntity] Combat emote set for ${this.config.mobType}...\`)` | applyServerEmote |
| 1928-1933 | Full `if` block with `console.log` for punching reset | clientUpdate emote reset |
| 2719-2721 | `console.log(\`[MobEntity] toNetworkData including emote...\`)` | toNetworkData |
| 2739-2741 | `console.log(\`[MobEntity] setServerEmote called...\`)` | setServerEmote |
| 2871-2873 | `console.log(\`[MobEntity] ${this.config.mobType} received emote...\`)` | modify |
| 2877-2879 | `console.log(\`[MobEntity] ${this.config.mobType} avatar not ready...\`)` | modify |

**Note:** Keep the `console.warn` at line 1689 - warnings for unexpected states are appropriate.

### 1.2 CombatAnimationManager.ts - Remove 2 debug logs

| Line | Code to Remove |
|------|----------------|
| 179-182 | `console.log(\`[CombatAnimationManager] setMobCombatEmote: entityId=...\`)` |
| 186-188 | `console.log(\`[CombatAnimationManager] Called setServerEmote with: ...\`)` |

### 1.3 createVRMFactory.ts - Remove 3 debug logs

| Line | Code to Remove |
|------|----------------|
| 516-524 | Full `if` block checking for "punching" with `console.log` |
| 591-596 | `if (url?.includes("punching")) { console.log(...) }` block |
| 612-615 | `} else if (url?.includes("punching")) { console.log(...) }` block |

### 1.4 ClientNetwork.ts - Remove 1 debug log

| Line | Code to Remove |
|------|----------------|
| 924-930 | Full block: `const rawEmote = ...; if (rawEmote && id.includes("goblin")) { console.log(...) }` |

**Total: 14 debug logs to remove**

---

## Task 2: Remove Dead Code from updateAnimation() (Priority: HIGH)

### Problem
The VRM block in `updateAnimation()` (lines 1756-1769) is unreachable dead code:

```typescript
private updateAnimation(): void {
  // VRM path: Use emote-based animation
  if (this._avatarInstance) {                    // DEAD CODE - never reached for VRM
    // Skip AI-based emote updates if manual override is active
    if (Date.now() < this._manualEmoteOverrideUntil) {
      return;
    }
    const targetEmote = this.getEmoteForAIState(this.config.aiState);
    if (this._currentEmote !== targetEmote) {
      this._currentEmote = targetEmote;
      this._avatarInstance.setEmote(targetEmote);
    }
    return;
  }

  // GLB path: Use mixer-based animation (this is the only code that executes)
  // ...
}
```

### Solution
Remove the entire VRM block (lines 1755-1769). The method should start directly with GLB handling.

**Before:**
```typescript
private updateAnimation(): void {
  // VRM path: Use emote-based animation
  if (this._avatarInstance) {
    // ... 14 lines of dead code
    return;
  }

  // GLB path: Use mixer-based animation
```

**After:**
```typescript
private updateAnimation(): void {
  // GLB path: Use mixer-based animation
  // Note: VRM mobs handle emotes in clientUpdate() directly, not here
```

---

## Task 3: Fix Memory Allocation in Hot Path (Priority: HIGH)

### Problem
```typescript
// Line 1700-1707 - NEW OBJECT CREATED EVERY CALL
private applyServerEmote(serverEmote: string): void {
  // ...
  const emoteMap: Record<string, string> = {  // <-- ALLOCATION!
    idle: Emotes.IDLE,
    walk: Emotes.WALK,
    run: Emotes.RUN,
    combat: Emotes.COMBAT,
    death: Emotes.DEATH,
  };
```

### Solution
Move `emoteMap` to a private readonly instance constant (following existing pattern in MobEntity):

```typescript
// Add near line 195 with other private readonly constants
private readonly _emoteMap: Record<string, string> = {
  idle: Emotes.IDLE,
  walk: Emotes.WALK,
  run: Emotes.RUN,
  combat: Emotes.COMBAT,
  death: Emotes.DEATH,
};
```

Then update `applyServerEmote()` to use `this._emoteMap`:

```typescript
emoteUrl = this._emoteMap[serverEmote] || Emotes.IDLE;
```

---

## Task 4: Use Existing Constants (Priority: MEDIUM)

### 4.1 Replace hardcoded `600` with `TICK_DURATION_MS`

**Location:** Line 1738 in `applyServerEmote()`

```typescript
// BEFORE (line 1738)
const protectionMs = protectionTicks * 600;

// AFTER
const protectionMs = protectionTicks * TICK_DURATION_MS;
```

`TICK_DURATION_MS` is already imported at line 112.

### 4.2 Add constant for death animation duration

The value `4500` appears in 5+ places in the codebase. Add a constant:

```typescript
// Add near line 195 with other private readonly constants
private readonly DEATH_ANIMATION_DURATION_MS = 4500;
```

Then update line 1744:

```typescript
// BEFORE
this._manualEmoteOverrideUntil = Date.now() + 4500;

// AFTER
this._manualEmoteOverrideUntil = Date.now() + this.DEATH_ANIMATION_DURATION_MS;
```

**Note:** This constant is also used elsewhere (lines 554, 1891-1892, 2793). Consider consolidating in a future refactor, but for this fix, just address our new code.

---

## Task 5: Extract Priority Emote Check (Priority: MEDIUM)

### Problem
The priority emote check is repeated in multiple places:

```typescript
// Line 1711-1714 in applyServerEmote
const isPriorityEmote =
  emoteUrl.includes("combat") ||
  emoteUrl.includes("punching") ||
  emoteUrl.includes("death");

// Line 1730 in applyServerEmote (similar check)
if (emoteUrl.includes("combat") || emoteUrl.includes("punching")) {

// Line 1929 in clientUpdate (similar check)
if (this._currentEmote?.includes("punching")) {
```

### Solution
Add a private helper method:

```typescript
/**
 * Check if an emote URL is a priority emote (combat/death) that should override protection
 */
private isPriorityEmote(emoteUrl: string | null): boolean {
  if (!emoteUrl) return false;
  return (
    emoteUrl.includes("combat") ||
    emoteUrl.includes("punching") ||
    emoteUrl.includes("death")
  );
}

/**
 * Check if an emote URL is a combat emote (for timing calculation)
 */
private isCombatEmote(emoteUrl: string | null): boolean {
  if (!emoteUrl) return false;
  return emoteUrl.includes("combat") || emoteUrl.includes("punching");
}
```

Then update usages:

```typescript
// Line 1711-1714
const isPriorityEmote = this.isPriorityEmote(emoteUrl);

// Line 1730
if (this.isCombatEmote(emoteUrl)) {

// Line 1929 (after removing debug log, the check itself can use the helper)
// This check may be removed entirely after Task 1 removes the debug log block
```

---

## Implementation Order

1. **Task 1** - Remove all debug logging (14 instances across 4 files)
2. **Task 2** - Remove dead code VRM block from `updateAnimation()`
3. **Task 3** - Move `emoteMap` to instance constant
4. **Task 4.1** - Replace `600` with `TICK_DURATION_MS`
5. **Task 4.2** - Add `DEATH_ANIMATION_DURATION_MS` constant
6. **Task 5** - Extract `isPriorityEmote()` and `isCombatEmote()` helpers

---

## Verification Checklist

After implementation:

- [ ] `npx tsc --noEmit` passes type checking
- [ ] `npm run build` succeeds with no errors
- [ ] `grep -r "console.log" packages/shared/src/entities/npc/MobEntity.ts` shows no debug logs we added
- [ ] `grep -r "console.log" packages/shared/src/systems/shared/combat/CombatAnimationManager.ts` shows no debug logs we added
- [ ] Mob punch animation plays fully (~1.8 seconds for default 4-tick attack speed)
- [ ] Mob punch animation is not immediately overwritten by idle/walk
- [ ] Death animation plays fully (~4.5 seconds)
- [ ] No regression in GLB mob animations (if any exist)

---

## Expected Rating After Fixes

| Criteria | Before | After | Notes |
|----------|--------|-------|-------|
| Production Quality Code | 6/10 | 9/10 | No debug logs, clean code |
| Best Practices (DRY/KISS) | 5/10 | 9/10 | Helper methods, no duplication |
| Memory & Allocation Hygiene | 4/10 | 9/10 | No allocations in hot paths |
| SOLID Principles | 6/10 | 8/10 | Better SRP with helpers |
| Code Clarity | 5/10 | 9/10 | Dead code removed |
| **Overall** | **6.5/10** | **9/10** | |

---

## Git Commands (After Implementation)

```bash
# Create branch
git checkout -b fix/mob-combat-animation-override

# Stage changes
git add packages/shared/src/entities/npc/MobEntity.ts \
        packages/shared/src/systems/shared/combat/CombatAnimationManager.ts \
        packages/shared/src/extras/three/createVRMFactory.ts \
        packages/shared/src/systems/client/ClientNetwork.ts

# Commit
git commit -m "fix(combat): prevent idle/walk emotes from overriding mob combat animations"

# Push
git push -u origin fix/mob-combat-animation-override
```

---

## Appendix: Code Flow Reference

```
SERVER SIDE:
  CombatAnimationManager.setCombatEmote()
    → setMobCombatEmote()
      → mobEntity.setServerEmote(Emotes.COMBAT)
        → _serverEmote = emote
        → markNetworkDirty()

  MobEntity.toNetworkData()
    → includes _serverEmote in packet
    → clears _serverEmote

CLIENT SIDE:
  ClientNetwork.onEntityModified()
    → entity.modify(data)

  MobEntity.modify()
    → if emote in data:
      → if no avatar: queue in _pendingServerEmote
      → if avatar: applyServerEmote()
        → check isPriorityEmote
        → if not priority && override active: ignore
        → set emote on VRM
        → set _manualEmoteOverrideUntil for combat/death

  MobEntity.clientUpdate() [called every frame]
    → VRM path (line 1917):
      → if not DEAD:
        → if override expired:
          → getEmoteForAIState()
          → set AI-based emote
      → return (never calls updateAnimation)

    → GLB path (line 2120):
      → updateAnimation() [GLB only]
```
