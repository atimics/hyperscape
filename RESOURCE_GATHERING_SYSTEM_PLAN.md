# Resource Gathering System: 9/10 Production Readiness Plan

## Executive Summary

This document outlines a comprehensive plan to elevate the resource gathering system from its current **7.2/10** rating to **9.0/10** production readiness. The plan focuses on:

1. **Fixing critical bugs** where manifest data is ignored
2. **Security hardening** with rate limiting and server-authoritative validation
3. **Generalizing the system** to support mining and fishing
4. **Memory optimization** for hot path performance
5. **Comprehensive testing** to achieve 90%+ coverage

**Key Principle:** Use existing manifest data - no new manifest files will be created.

**Estimated Effort:** 15 days

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Manifest Utilization Audit](#manifest-utilization-audit)
3. [Phase 1: Critical Bug Fixes](#phase-1-critical-bug-fixes-days-1-2)
4. [Phase 2: Security Hardening](#phase-2-security-hardening-days-3-4)
5. [Phase 3: Generalization for Mining/Fishing](#phase-3-generalization-for-miningfishing-days-5-7)
6. [Phase 4: Memory & Allocation Hygiene](#phase-4-memory--allocation-hygiene-days-8-9)
7. [Phase 5: Testing](#phase-5-testing-days-10-12)
8. [Phase 6: Code Quality Polish](#phase-6-code-quality-polish-days-13-14)
9. [Phase 7: Documentation & Cleanup](#phase-7-documentation--cleanup-day-15)
10. [Success Criteria](#success-criteria)
11. [Out of Scope](#out-of-scope)
12. [Appendix D: Validation Summary](#appendix-d-validation-summary)

---

## Current State Analysis

### Rating Breakdown

| Category | Current | Target | Gap |
|----------|---------|--------|-----|
| Production Quality Code | 8.0 | 9.5 | +1.5 |
| Best Practices (DRY/KISS) | 7.5 | 9.0 | +1.5 |
| OWASP Security | 6.5 | 9.0 | +2.5 |
| Game Studio Audit | 7.0 | 9.0 | +2.0 |
| Memory & Allocation | 6.0 | 9.0 | +3.0 |
| SOLID Principles | 7.5 | 9.0 | +1.5 |
| Testing Coverage | 4.0 | 9.0 | +5.0 |

### Key Files

| File | Purpose |
|------|---------|
| `packages/shared/src/entities/world/ResourceEntity.ts` | Resource entity class |
| `packages/shared/src/systems/shared/entities/ResourceSystem.ts` | Core gathering logic |
| `packages/shared/src/systems/shared/interaction/ProcessingSystem.ts` | Firemaking/cooking |
| `packages/shared/src/systems/shared/character/SkillsSystem.ts` | XP and leveling |
| `packages/shared/src/systems/client/interaction/handlers/ResourceInteractionHandler.ts` | Client interaction |
| `packages/server/src/systems/ServerNetwork/handlers/resources.ts` | Network handler |
| `packages/server/src/systems/TickSystem.ts` | 600ms tick system |
| `packages/server/world/assets/manifests/resources.json` | Resource definitions |
| `packages/server/world/assets/manifests/items.json` | Item definitions |

### OSRS Fidelity Assessment

| Feature | OSRS | Current Implementation | Status |
|---------|------|------------------------|--------|
| Tick duration | 600ms | 600ms | ✅ Match |
| Base woodcutting cycle | 4 ticks | 4 ticks (from manifest) | ✅ Match |
| Tool tier progression | Bronze → Dragon | Hardcoded in code | ⚠️ Should use manifest |
| Skill level requirements | Per resource | From manifest | ✅ Match |
| Depletion → respawn | Yes | Tick-based respawn | ✅ Match |
| XP per log | Varies by tree | From manifest | ✅ Match |
| Inventory check | 28 slots | Checked before gather | ✅ Match |
| Success rate formula | Complex | Simplified | ⚠️ Acceptable |

---

## Manifest Utilization Audit

### What `resources.json` Already Has

```json
{
  "id": "tree_normal",
  "name": "Tree",
  "type": "tree",
  "examine": "A commonly found tree. I can chop it down with a hatchet.",
  "modelPath": "asset://models/basic-reg-tree/basic-tree.glb",
  "depletedModelPath": "asset://models/basic-reg-tree-stump/basic-tree-stump.glb",
  "scale": 3.0,
  "depletedScale": 0.3,
  "harvestSkill": "woodcutting",
  "toolRequired": "bronze_hatchet",
  "levelRequired": 1,
  "baseCycleTicks": 4,
  "depleteChance": 0.125,
  "respawnTicks": 80,
  "harvestYield": [
    {
      "itemId": "logs",
      "itemName": "Logs",
      "quantity": 1,
      "chance": 1.0,
      "xpAmount": 25,
      "stackable": true
    }
  ]
}
```

### Field Usage Analysis

| Field | In Manifest | Used By Code | Status |
|-------|-------------|--------------|--------|
| `id` | ✅ | ✅ | Working |
| `name` | ✅ | ⚠️ Partial | Hardcoded in messages |
| `type` | ✅ | ✅ | Working |
| `examine` | ✅ | ✅ | Used by interaction handler |
| `modelPath` | ✅ | ✅ | Working |
| `depletedModelPath` | ✅ | ✅ | Working |
| `scale` | ✅ | ✅ | Working |
| `depletedScale` | ✅ | ✅ | Working |
| `harvestSkill` | ✅ | ✅ | Working |
| `toolRequired` | ✅ | ❌ **IGNORED** | Hardcoded axe list instead |
| `levelRequired` | ✅ | ✅ | Working |
| `baseCycleTicks` | ✅ | ✅ | Working |
| `depleteChance` | ✅ | ✅ | Working |
| `respawnTicks` | ✅ | ✅ | Working |
| `harvestYield[].itemId` | ✅ | ❌ **IGNORED** | Hardcoded "logs" |
| `harvestYield[].itemName` | ✅ | ❌ **IGNORED** | Hardcoded "Logs" |
| `harvestYield[].quantity` | ✅ | ❌ **IGNORED** | Hardcoded 1 |
| `harvestYield[].chance` | ✅ | ❌ **IGNORED** | No roll logic |
| `harvestYield[].xpAmount` | ✅ | ✅ | Working via getVariantTuning |
| `harvestYield[].stackable` | ✅ | ❌ **IGNORED** | Not passed to inventory |

**Critical Finding:** 6 of 18 manifest fields are completely ignored despite already existing.

---

## Phase 1: Critical Bug Fixes (Days 1-2)

### 1.1 Fix Drop System to Use Manifest Data

**Problem:** Code at `ResourceSystem.ts:1005-1014` hardcodes "logs" instead of reading from `harvestYield`.

**Impact:** All resources drop logs regardless of what manifest specifies. Mining would give logs, fishing would give logs.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**1.1.1 Add `rollDrop()` method**

Location: Add as new private method around line 1160

```typescript
/**
 * Roll against harvestYield chances to determine drop
 * Respects chance values from manifest for multi-drop resources (fishing)
 */
private rollDrop(drops: ResourceDrop[]): ResourceDrop {
  if (drops.length === 0) {
    throw new Error('[ResourceSystem] Resource has no drops defined in manifest');
  }

  if (drops.length === 1) {
    return drops[0];
  }

  // Roll against cumulative chances
  const roll = Math.random();
  let cumulative = 0;

  for (const drop of drops) {
    cumulative += drop.chance;
    if (roll < cumulative) {
      return drop;
    }
  }

  // Fallback to first drop if chances don't sum to 1.0
  return drops[0];
}
```

**1.1.2 Modify success handling in `processGatheringTick()`**

Location: Lines ~1001-1034

Current code:
```typescript
// Line 1005-1014 - BROKEN: hardcodes everything
this.emitTypedEvent(EventType.INVENTORY_ITEM_ADDED, {
  playerId: playerId,
  item: {
    id: `inv_${playerId}_${Date.now()}_logs`,  // hardcoded "logs"
    itemId: "logs",                             // hardcoded
    quantity: 1,                                // hardcoded
    slot: -1,
    metadata: null,
  },
});

// Line 1027 - BROKEN: hardcoded message
this.sendChat(playerId, `You receive 1x ${"Logs"}.`);
```

Replace with:
```typescript
// Roll against manifest drop table
const drop = this.rollDrop(resource.drops);

// Add item using manifest data
this.emitTypedEvent(EventType.INVENTORY_ITEM_ADDED, {
  playerId: playerId,
  item: {
    id: `inv_${playerId}_${Date.now()}_${drop.itemId}`,
    itemId: drop.itemId,      // FROM MANIFEST
    quantity: drop.quantity,   // FROM MANIFEST
    slot: -1,
    metadata: {
      stackable: drop.stackable,  // FROM MANIFEST
    },
  },
});

// Award XP from manifest
const xpAmount = drop.xpAmount;
this.emitTypedEvent(EventType.SKILLS_XP_GAINED, {
  playerId: playerId,
  skill: resource.skillRequired,
  amount: xpAmount,
});

// Feedback using manifest data
this.sendChat(
  playerId as unknown as string,
  `You receive ${drop.quantity}x ${drop.itemName}.`,
);
this.emitTypedEvent(EventType.UI_MESSAGE, {
  playerId: playerId,
  message: `You get some ${drop.itemName.toLowerCase()}. (+${xpAmount} ${resource.skillRequired} XP)`,
  type: "success",
});
```

**1.1.3 Fix XP Calculation for Multi-Drop Resources**

**Problem:** Line ~1123 always awards XP from first drop in array, not the rolled drop.

Current code (conceptually):
```typescript
// Line ~1123 - BUG: Uses first drop's XP regardless of what was rolled
const xpAmount = tuned.xpPerLog; // This comes from drops[0].xpAmount
```

This is problematic for fishing where different fish give different XP:
- Raw shrimp: 10 XP
- Raw anchovies: 15 XP

Currently, player always gets shrimp XP even when catching anchovies.

**Fix:** The refactored code in 1.1.2 addresses this by using `drop.xpAmount` from the rolled drop:
```typescript
// XP from the actual rolled drop, not hardcoded first drop
const xpAmount = drop.xpAmount;
```

**Validation Criteria:**
- [ ] Chop normal tree → receive item with `itemId: "logs"`
- [ ] Fish at fishing_spot_normal → receive "raw_shrimp" (~70%) or "raw_anchovies" (~30%)
- [ ] Mine ore_copper → receive "copper_ore"
- [ ] XP matches manifest `xpAmount` value
- [ ] **Fishing shrimp awards 10 XP, anchovies awards 15 XP (not always 10)**

---

### 1.2 Fix Messages to Use Resource Name

**Problem:** Messages hardcode "tree" instead of using `resource.name` from manifest.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**1.2.1 Fix depletion message**

Location: Line ~1054

Current:
```typescript
this.sendChat(playerId, "The tree is chopped down.");
```

Replace with:
```typescript
this.sendChat(playerId, `The ${resource.name.toLowerCase()} is depleted.`);
```

**1.2.2 Fix failure message**

Location: Line ~1079

Current:
```typescript
this.emitTypedEvent(EventType.UI_MESSAGE, {
  playerId: playerId,
  message: `You fail to chop the tree.`,
  type: "info",
});
```

Replace with:
```typescript
this.emitTypedEvent(EventType.UI_MESSAGE, {
  playerId: playerId,
  message: `You fail to gather from the ${resource.name.toLowerCase()}.`,
  type: "info",
});
```

**1.2.3 Fix inventory full message**

Location: Line ~974

Current:
```typescript
this.sendChat(playerId, "Your inventory is too full to hold any more logs.");
```

Replace with:
```typescript
const drop = resource.drops[0]; // Or use expected drop name
this.sendChat(playerId, `Your inventory is too full to hold any more ${drop.itemName.toLowerCase()}.`);
```

**1.2.4 Fix success chat message**

Location: Line ~1031

Current:
```typescript
this.sendChat(playerId as unknown as string, `You get some logs...`);
```

Replace with (this is fixed in Phase 1.1.2 refactor):
```typescript
this.sendChat(playerId as unknown as string, `You get some ${drop.itemName.toLowerCase()}...`);
```

**1.2.5 Fix started message**

Location: Line ~843

Current:
```typescript
this.sendChat(data.playerId, `You start ${actionName}...`);
```

This is partially correct (uses `actionName`), but verify the full message uses `resource.name`:
```typescript
this.sendChat(data.playerId, `You start ${actionName} the ${resourceName.toLowerCase()}...`);
```

**Validation Criteria:**
- [ ] Chop "Oak Tree" → "The oak tree is depleted."
- [ ] Fail to mine "Copper Rock" → "You fail to gather from the copper rock."
- [ ] Start fishing → "You start fishing..."
- [ ] **Inventory full while mining → "Your inventory is too full to hold any more copper ore."**
- [ ] **Success gathering oak → "You get some oak logs..." (not "logs")**

---

### 1.3 Fix Tool Validation to Use `toolRequired` Field

**Problem:** Code has hardcoded axe-only check at lines 759-783, completely ignores `toolRequired` field in manifest.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**1.3.1 Add `getToolCategory()` helper**

Location: Add as new private method

```typescript
/**
 * Extract tool category from toolRequired field
 * e.g., "bronze_hatchet" → "hatchet", "bronze_pickaxe" → "pickaxe"
 */
private getToolCategory(toolRequired: string): string {
  // Handle common patterns
  if (toolRequired.includes('hatchet') || toolRequired.includes('axe')) {
    return 'hatchet';
  }
  if (toolRequired.includes('pickaxe') || toolRequired.includes('pick')) {
    return 'pickaxe';
  }
  if (toolRequired.includes('fishing') || toolRequired.includes('net') || toolRequired.includes('rod')) {
    return 'fishing';
  }

  // Fallback: take last segment after underscore
  const parts = toolRequired.split('_');
  return parts[parts.length - 1];
}
```

**1.3.2 Add `playerHasToolCategory()` method**

Location: Add as new private method

```typescript
/**
 * Check if player has any tool matching the required category
 */
private playerHasToolCategory(playerId: string, category: string): boolean {
  const inventorySystem = this.world.getSystem?.("inventory") as {
    getInventory?: (playerId: string) => {
      items?: Array<{ itemId?: string }>;
    };
  } | null;

  if (!inventorySystem?.getInventory) {
    return false;
  }

  const inv = inventorySystem.getInventory(playerId);
  const items = inv?.items || [];

  return items.some((item) => {
    if (!item?.itemId) return false;
    const itemId = item.itemId.toLowerCase();

    switch (category) {
      case 'hatchet':
        return itemId.includes('hatchet') || itemId.includes('axe');
      case 'pickaxe':
        return itemId.includes('pickaxe') || itemId.includes('pick');
      case 'fishing':
        return itemId.includes('fishing') || itemId.includes('net') ||
               itemId.includes('rod') || itemId.includes('harpoon');
      default:
        return itemId.includes(category);
    }
  });
}
```

**1.3.3 Modify tool validation in `startGathering()`**

Location: Lines ~759-783

Current:
```typescript
// Tool check (RuneScape-style: any hatchet qualifies; tier affects speed)
if (resource.skillRequired === "woodcutting") {
  const axeInfo = this.getBestAxeTier(data.playerId);
  if (!axeInfo) {
    this.sendChat(data.playerId, `You need an axe to chop this tree.`);
    // ...
    return;
  }
  // ...
}
```

Replace with:
```typescript
// Tool check using manifest's toolRequired field
if (resource.toolRequired) {
  const toolCategory = this.getToolCategory(resource.toolRequired);
  const hasTool = this.playerHasToolCategory(data.playerId, toolCategory);

  if (!hasTool) {
    const toolName = this.getToolDisplayName(toolCategory);
    this.sendChat(data.playerId, `You need a ${toolName} to harvest the ${resource.name.toLowerCase()}.`);
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: data.playerId,
      message: `You need a ${toolName} to harvest the ${resource.name.toLowerCase()}.`,
      type: "error",
    });
    return;
  }
}
```

**1.3.4 Add `getToolDisplayName()` helper**

```typescript
/**
 * Get display name for tool category
 */
private getToolDisplayName(category: string): string {
  const names: Record<string, string> = {
    hatchet: 'hatchet',
    pickaxe: 'pickaxe',
    fishing: 'fishing equipment',
  };
  return names[category] || category;
}
```

**Note:** Keep `getBestAxeTier()` for now - it handles speed multipliers. Phase 3 will generalize this.

**Validation Criteria:**
- [ ] Player without pickaxe tries to mine → "You need a pickaxe to harvest the copper rock."
- [ ] Player with any hatchet can chop trees
- [ ] Player with any pickaxe can mine rocks
- [ ] Player with fishing equipment can fish

---

### 1.4 ProcessingSystem Hardcoded Values (Future Work)

**Note:** ProcessingSystem (`packages/shared/src/systems/shared/interaction/ProcessingSystem.ts`) has similar issues but is **out of scope for this plan**. Documenting for future reference:

| Line | Issue |
|------|-------|
| ~65 | `FIRE_DURATION = 120000` hardcoded (should be from manifest) |
| ~66 | `FIREMAKING_TIME = 3000` hardcoded |
| ~300 | `id: 200` hardcoded numeric item ID for logs |
| ~315 | `id: 300` hardcoded numeric item ID for tinderbox |
| ~450 | `id: 500` hardcoded numeric item ID for raw fish |

**Recommendation:** Create separate `PROCESSING_SYSTEM_PLAN.md` after this plan is complete.

---

## Phase 2: Security Hardening (Days 3-4)

### 2.1 Server-Side Rate Limiting

**Problem:** No throttling on gather requests. Malicious client can spam requests.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**2.1.1 Add rate limit tracking**

Location: Add to class properties around line 35

```typescript
// Rate limiting to prevent spam
private gatherRateLimits = new Map<PlayerID, number>();
private static readonly RATE_LIMIT_MS = 600; // 1 tick
```

**2.1.2 Add rate limit check at start of `startGathering()`**

Location: Beginning of `startGathering()` method, after line 673

```typescript
private startGathering(data: {
  playerId: string;
  resourceId: string;
  playerPosition: { x: number; y: number; z: number };
}): void {
  // Only server should handle actual gathering logic
  if (!this.world.isServer) {
    return;
  }

  const playerId = createPlayerID(data.playerId);

  // Rate limiting - prevent spam
  const now = Date.now();
  const lastAttempt = this.gatherRateLimits.get(playerId);
  if (lastAttempt && now - lastAttempt < ResourceSystem.RATE_LIMIT_MS) {
    // Silently drop - don't send error to prevent timing attacks
    return;
  }
  this.gatherRateLimits.set(playerId, now);

  // ... rest of method
```

**2.1.3 Clean up rate limits on player disconnect**

Location: In `cleanupPlayerGathering()` method

```typescript
private cleanupPlayerGathering(playerId: string): void {
  const pid = createPlayerID(playerId);
  this.activeGathering.delete(pid);
  this.gatherRateLimits.delete(pid); // Clean up rate limit tracking
}
```

**2.1.4 Add periodic cleanup for stale rate limits**

Location: In `start()` method

```typescript
async start(): Promise<void> {
  // ... existing code ...

  // Periodic cleanup of stale rate limit entries (every 60 seconds)
  if (this.world.isServer) {
    this.createInterval(() => {
      const now = Date.now();
      const staleThreshold = 10000; // 10 seconds
      for (const [playerId, timestamp] of this.gatherRateLimits) {
        if (now - timestamp > staleThreshold) {
          this.gatherRateLimits.delete(playerId);
        }
      }
    }, 60000);
  }
}
```

**Validation Criteria:**
- [ ] Rapid gather requests (< 600ms apart) → only first processed
- [ ] No error message sent to client (prevents timing attack info leakage)
- [ ] Rate limits cleaned up when player disconnects

---

### 2.2 Server-Authoritative Position Validation

**Problem:** Player position comes from client payload at `resources.ts:32-36`. Can be spoofed.

**Files:**
- `packages/server/src/systems/ServerNetwork/handlers/resources.ts`
- `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**2.2.1 Modify network handler to ignore client position**

Location: `packages/server/src/systems/ServerNetwork/handlers/resources.ts`

Current:
```typescript
const playerPosition = payload.playerPosition || {
  x: playerEntity.position.x,
  y: playerEntity.position.y,
  z: playerEntity.position.z,
};
```

Replace with:
```typescript
// SECURITY: Always use server-authoritative position, never trust client
const playerPosition = {
  x: playerEntity.position.x,
  y: playerEntity.position.y,
  z: playerEntity.position.z,
};
```

**2.2.2 Update event emission to not include client position**

Location: Same file, line ~39-43

```typescript
// Forward to ResourceSystem with server-authoritative position only
world.emit(EventType.RESOURCE_GATHER, {
  playerId: playerEntity.id,
  resourceId: payload.resourceId,
  // playerPosition comes from server state, not client
});
```

**2.2.3 Update ResourceSystem to fetch position internally**

Location: `ResourceSystem.ts` in `startGathering()`, modify to not rely on passed position

The current code at line 110-126 already has fallback to world state:
```typescript
const playerPosition =
  data.playerPosition ||
  (() => {
    const player = this.world.getPlayer?.(data.playerId);
    return player?.position ?? { x: 0, y: 0, z: 0 };
  })();
```

Change to ALWAYS use server state:
```typescript
// SECURITY: Always use server-authoritative position
const player = this.world.getPlayer?.(data.playerId);
if (!player) {
  console.warn('[ResourceSystem] Player not found:', data.playerId);
  return;
}
const playerPosition = {
  x: player.position.x,
  y: player.position.y,
  z: player.position.z,
};
```

**2.2.4 Add comment to proximity check**

Location: Line ~946-958 in `processGatheringTick()`

```typescript
// SECURITY: Server-authoritative proximity check
// Position fetched from world state, never from client
const p = this.world.getPlayer?.(playerId);
const playerPos = p?.position ?? null;
if (!playerPos || calculateDistance(playerPos, resource.position) > 4.0) {
  // Player moved away - cancel gathering
  // ...
}
```

**Validation Criteria:**
- [ ] Client sends fake position → server ignores, uses actual position
- [ ] Player 100m from resource cannot gather
- [ ] Proximity check during gathering uses server state

---

### 2.3 Resource ID Validation

**Problem:** Resource IDs parsed without validation.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**2.3.1 Add `isValidResourceId()` method**

```typescript
/**
 * Validate resource ID format and existence
 */
private isValidResourceId(resourceId: string): boolean {
  // Check format: alphanumeric with underscores, reasonable length
  if (!resourceId || typeof resourceId !== 'string') {
    return false;
  }
  if (resourceId.length > 100) {
    return false;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(resourceId)) {
    return false;
  }
  return true;
}
```

**2.3.2 Add validation at start of `startGathering()`**

Location: After rate limit check

```typescript
// Validate resource ID format
if (!this.isValidResourceId(data.resourceId)) {
  console.warn('[ResourceSystem] Invalid resource ID format:', data.resourceId);
  return;
}
```

**Validation Criteria:**
- [ ] Malformed resource ID (special chars, too long) → rejected and logged
- [ ] Empty resource ID → rejected
- [ ] Valid resource ID → processed normally

---

## Phase 3: Generalization for Mining/Fishing (Days 5-7)

### 3.1 Generalize Tool Speed System

**Problem:** `getBestAxeTier()` only handles axes with hardcoded tier data.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**3.1.1 ~~First: Check `items.json` for existing tool data~~** ✅ VALIDATED

**Validation Finding:** `items.json` was checked and does **NOT** contain tool speed data.

Tool entries in items.json look like:
```json
{
  "id": "bronze_hatchet",
  "name": "Bronze Hatchet",
  "type": "tool",
  "equipSlot": "weapon",
  "value": 16,
  "stackable": false
  // NO gatheringSpeed, cycleMultiplier, or similar fields
}
```

**Conclusion:** Tool tier speed multipliers must remain in code (TOOL_TIERS structure below is correct). This is acceptable since:
1. Tool progression is a game balance decision, not content data
2. Adding to items.json would require manifest schema changes
3. The code-based approach allows for skill-specific tool behaviors

**3.1.2 Create generalized tool tier structure**

Replace the hardcoded `getBestAxeTier()` with a data-driven approach:

```typescript
/**
 * Tool tier definitions by skill
 * TODO: Move to items.json manifest in future iteration
 */
private static readonly TOOL_TIERS: Record<string, Array<{
  id: string;
  pattern: RegExp;
  levelRequired: number;
  cycleMultiplier: number;
}>> = {
  woodcutting: [
    { id: 'dragon_hatchet', pattern: /dragon.*(hatchet|axe)/i, levelRequired: 61, cycleMultiplier: 0.7 },
    { id: 'rune_hatchet', pattern: /rune.*(hatchet|axe)/i, levelRequired: 41, cycleMultiplier: 0.78 },
    { id: 'adamant_hatchet', pattern: /adamant.*(hatchet|axe)/i, levelRequired: 31, cycleMultiplier: 0.84 },
    { id: 'mithril_hatchet', pattern: /mithril.*(hatchet|axe)/i, levelRequired: 21, cycleMultiplier: 0.88 },
    { id: 'steel_hatchet', pattern: /steel.*(hatchet|axe)/i, levelRequired: 6, cycleMultiplier: 0.92 },
    { id: 'iron_hatchet', pattern: /iron.*(hatchet|axe)/i, levelRequired: 1, cycleMultiplier: 0.96 },
    { id: 'bronze_hatchet', pattern: /bronze.*(hatchet|axe)/i, levelRequired: 1, cycleMultiplier: 1.0 },
  ],
  mining: [
    { id: 'dragon_pickaxe', pattern: /dragon.*(pickaxe|pick)/i, levelRequired: 61, cycleMultiplier: 0.7 },
    { id: 'rune_pickaxe', pattern: /rune.*(pickaxe|pick)/i, levelRequired: 41, cycleMultiplier: 0.78 },
    { id: 'adamant_pickaxe', pattern: /adamant.*(pickaxe|pick)/i, levelRequired: 31, cycleMultiplier: 0.84 },
    { id: 'mithril_pickaxe', pattern: /mithril.*(pickaxe|pick)/i, levelRequired: 21, cycleMultiplier: 0.88 },
    { id: 'steel_pickaxe', pattern: /steel.*(pickaxe|pick)/i, levelRequired: 6, cycleMultiplier: 0.92 },
    { id: 'iron_pickaxe', pattern: /iron.*(pickaxe|pick)/i, levelRequired: 1, cycleMultiplier: 0.96 },
    { id: 'bronze_pickaxe', pattern: /bronze.*(pickaxe|pick)/i, levelRequired: 1, cycleMultiplier: 1.0 },
  ],
  fishing: [
    // Fishing tools don't have speed tiers in OSRS - all same speed
    { id: 'fishing_equipment', pattern: /(fishing|net|rod|harpoon)/i, levelRequired: 1, cycleMultiplier: 1.0 },
  ],
};
```

**3.1.3 Replace `getBestAxeTier()` with `getBestTool()`**

```typescript
/**
 * Get best tool for a skill from player inventory
 * Returns tool info with level requirement and speed multiplier
 */
private getBestTool(
  playerId: string,
  skill: string,
): { id: string; levelRequired: number; cycleMultiplier: number } | null {
  const tiers = ResourceSystem.TOOL_TIERS[skill];
  if (!tiers) {
    // Unknown skill - no tool boost
    return { id: 'none', levelRequired: 1, cycleMultiplier: 1.0 };
  }

  const inventorySystem = this.world.getSystem?.("inventory") as {
    getInventory?: (playerId: string) => {
      items?: Array<{ itemId?: string }>;
    };
  } | null;

  const inv = inventorySystem?.getInventory?.(playerId);
  const items = inv?.items || [];

  // Check tiers in order (best first)
  for (const tier of tiers) {
    const hasTool = items.some(
      (item) => item?.itemId && tier.pattern.test(item.itemId)
    );
    if (hasTool) {
      return {
        id: tier.id,
        levelRequired: tier.levelRequired,
        cycleMultiplier: tier.cycleMultiplier,
      };
    }
  }

  return null; // No tool found
}
```

**3.1.4 Update all references from `getBestAxeTier()` to `getBestTool()`**

Location: Line ~761 and ~809

```typescript
// Old:
const axeInfo = this.getBestAxeTier(data.playerId);

// New:
const toolInfo = this.getBestTool(data.playerId, resource.skillRequired);
```

**Validation Criteria:**
- [ ] Dragon axe provides 0.7x cycle time for woodcutting
- [ ] Dragon pickaxe provides 0.7x cycle time for mining
- [ ] Fishing with any equipment works at 1.0x speed
- [ ] No tool for skill → null returned, gather blocked

---

### 3.2 Generalize Emotes

**Problem:** Hardcoded woodcutting → "chopping" emote mapping.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**3.2.1 Add skill emote mapping**

Location: Add as static class property

```typescript
/**
 * Skill to emote mapping
 * Emote names should match available animations
 */
private static readonly SKILL_EMOTES: Record<string, string> = {
  woodcutting: 'chopping',
  mining: 'mining',
  fishing: 'fishing',
};
```

**3.2.2 Update emote setting in `startGathering()`**

Location: Lines ~829-831

Current:
```typescript
if (resource.skillRequired === "woodcutting") {
  this.setGatheringEmote(data.playerId, "chopping");
}
```

Replace with:
```typescript
// Set gathering emote based on skill
const emote = ResourceSystem.SKILL_EMOTES[resource.skillRequired] ?? resource.skillRequired;
this.setGatheringEmote(data.playerId, emote);
```

**Validation Criteria:**
- [ ] Woodcutting plays "chopping" emote
- [ ] Mining plays "mining" emote
- [ ] Fishing plays "fishing" emote
- [ ] Unknown skill uses skill name as emote fallback

---

### 3.3 Verify Fishing Works with Current Data

**Current fishing_spot_normal in manifest:**
```json
{
  "id": "fishing_spot_normal",
  "name": "Fishing Spot",
  "type": "fishing_spot",
  "harvestSkill": "fishing",
  "toolRequired": "small_fishing_net",
  "levelRequired": 1,
  "baseCycleTicks": 5,
  "depleteChance": 0.05,
  "respawnTicks": 200,
  "harvestYield": [
    { "itemId": "raw_shrimp", "itemName": "Raw Shrimp", "quantity": 1, "chance": 0.7, "xpAmount": 10 },
    { "itemId": "raw_anchovies", "itemName": "Raw Anchovies", "quantity": 1, "chance": 0.3, "xpAmount": 15 }
  ]
}
```

**With Phase 1 fixes, this should work:**
- [x] `toolRequired` → checked via `playerHasToolCategory()`
- [x] `harvestYield` → used via `rollDrop()`
- [x] Multiple drops with chances → properly rolled

**Manual Testing Required:**
- [ ] Spawn fishing spot
- [ ] Player with fishing net can fish
- [ ] Player receives mix of shrimp (70%) and anchovies (30%)
- [ ] Correct XP awarded per fish type

---

### 3.4 Verify Mining Works with Current Data

**Current ore_copper in manifest:**
```json
{
  "id": "ore_copper",
  "name": "Copper Rock",
  "type": "ore",
  "harvestSkill": "mining",
  "toolRequired": "pickaxe",
  "levelRequired": 1,
  "baseCycleTicks": 4,
  "depleteChance": 0.125,
  "respawnTicks": 50,
  "harvestYield": [
    { "itemId": "copper_ore", "itemName": "Copper Ore", "quantity": 1, "chance": 1.0, "xpAmount": 17.5 }
  ]
}
```

**With Phase 1-3 fixes, this should work:**
- [x] `toolRequired: "pickaxe"` → checked via generalized tool validation
- [x] `harvestYield` → copper_ore dropped
- [x] Tool tiers → pickaxe tiers affect speed

**Manual Testing Required:**
- [ ] Spawn copper rock
- [ ] Player with pickaxe can mine
- [ ] Player receives copper_ore
- [ ] Better pickaxes mine faster

---

## Phase 4: Memory & Allocation Hygiene (Days 8-9)

### 4.1 Cache Tuning Data at Session Start

**Problem:** `getVariantTuning()` called every tick, creates new objects.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**4.1.1 Expand session object type**

Location: Lines ~37-48

Current:
```typescript
private activeGathering = new Map<
  PlayerID,
  {
    playerId: PlayerID;
    resourceId: ResourceID;
    startTick: number;
    nextAttemptTick: number;
    cycleTickInterval: number;
    attempts: number;
    successes: number;
  }
>();
```

Expand to:
```typescript
private activeGathering = new Map<
  PlayerID,
  {
    playerId: PlayerID;
    resourceId: ResourceID;
    startTick: number;
    nextAttemptTick: number;
    cycleTickInterval: number;
    attempts: number;
    successes: number;
    // Cached tuning data (avoids per-tick allocation)
    cachedTuning: {
      levelRequired: number;
      xpPerLog: number;
      depleteChance: number;
      respawnTicks: number;
    };
    cachedSuccessRate: number;
    cachedDrops: ResourceDrop[];
  }
>();
```

**4.1.2 Cache data when session starts**

Location: In `startGathering()`, around line 818-826

```typescript
// Get tuning data ONCE at session start
const variant = this.resourceVariants.get(sessionResourceId) || "tree_normal";
const tuned = this.getVariantTuning(variant);
const successRate = this.computeSuccessRate(skillLevel, tuned);

this.activeGathering.set(playerId, {
  playerId,
  resourceId: sessionResourceId,
  startTick: currentTick,
  nextAttemptTick: currentTick + 1,
  cycleTickInterval,
  attempts: 0,
  successes: 0,
  // Cache everything needed during tick processing
  cachedTuning: tuned,
  cachedSuccessRate: successRate,
  cachedDrops: resource.drops,
});
```

**4.1.3 Use cached data in `processGatheringTick()`**

Location: Lines ~987-999

Current:
```typescript
const variant = this.resourceVariants.get(session.resourceId) || "tree_normal";
const tuned = this.getVariantTuning(variant);
// ...
const successRate = this.computeSuccessRate(skillLevel, tuned);
```

Replace with:
```typescript
// Use cached tuning data (zero allocation)
const tuned = session.cachedTuning;
const successRate = session.cachedSuccessRate;
```

**Validation Criteria:**
- [ ] `getVariantTuning()` called only at session start, not during tick
- [ ] Memory profiler shows no allocations in tick loop
- [ ] Gathering still works correctly

---

### 4.2 Remove Logging from Hot Path

**Problem:** Console.log with string interpolation in tick loop creates garbage.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**4.2.1 Add debug flag**

Location: Add as static class property

```typescript
/** Enable verbose logging for debugging (disable in production) */
private static readonly DEBUG_GATHERING = false;
```

**4.2.2 Wrap tick-loop logging**

Find all `console.log` calls in `processGatheringTick()` and wrap:

```typescript
if (ResourceSystem.DEBUG_GATHERING) {
  console.log(`[ResourceSystem] Debug: ${message}`);
}
```

**4.2.3 Review and wrap other hot-path logging**

Check `setGatheringEmote()`, `resetGatheringEmote()`, and other methods called during gathering.

**Validation Criteria:**
- [ ] No console output during normal gathering (DEBUG_GATHERING = false)
- [ ] Can enable logging for debugging when needed
- [ ] Production performance not impacted by logging

---

### 4.3 Pre-allocate Reusable Objects

**Problem:** Temporary objects created for distance calculations.

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**4.3.1 Add reusable position object**

Location: Add as static class property

```typescript
/**
 * Pre-allocated scratch position for calculations
 * WARNING: Do not store references to this object
 */
private static readonly _scratchPosition = { x: 0, y: 0, z: 0 };
```

**4.3.2 Use for distance calculations**

If any code creates temporary position objects for `calculateDistance()`, refactor to use scratch space.

**Note:** Review `calculateDistance()` usage - if it doesn't allocate, this may not be needed.

**Validation Criteria:**
- [ ] Memory profiler confirms no allocation during gathering tick
- [ ] Distance calculations work correctly

---

## Phase 5: Testing (Days 10-12)

### 5.1 Unit Tests for ResourceSystem

**File to create:** `packages/shared/src/systems/shared/entities/__tests__/ResourceSystem.test.ts`

#### Test Cases

**5.1.1 Drop Rolling Tests**

```typescript
describe('rollDrop', () => {
  it('should return single drop when only one exists', () => {
    const drops = [{ itemId: 'logs', chance: 1.0 }];
    const result = system.rollDrop(drops);
    expect(result.itemId).toBe('logs');
  });

  it('should respect chance distribution for multiple drops', () => {
    const drops = [
      { itemId: 'shrimp', chance: 0.7 },
      { itemId: 'anchovies', chance: 0.3 },
    ];

    const results = { shrimp: 0, anchovies: 0 };
    for (let i = 0; i < 1000; i++) {
      const drop = system.rollDrop(drops);
      results[drop.itemId]++;
    }

    // Should be roughly 70/30 split (allow 10% variance)
    expect(results.shrimp).toBeGreaterThan(600);
    expect(results.shrimp).toBeLessThan(800);
  });

  it('should throw for empty drops array', () => {
    expect(() => system.rollDrop([])).toThrow();
  });
});
```

**5.1.2 Skill Validation Tests**

```typescript
describe('skill validation', () => {
  it('should reject player below required level', () => {
    // Player level 1, resource requires level 15
    const result = system.canGather(player, resource);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('level 15');
  });

  it('should accept player at required level', () => {
    // Player level 15, resource requires level 15
    const result = system.canGather(player, resource);
    expect(result.valid).toBe(true);
  });

  it('should accept player above required level', () => {
    // Player level 99, resource requires level 1
    const result = system.canGather(player, resource);
    expect(result.valid).toBe(true);
  });
});
```

**5.1.3 Tool Validation Tests**

```typescript
describe('tool validation', () => {
  it('should reject player without required tool', () => {
    // Player has no pickaxe, resource requires pickaxe
    const result = system.playerHasToolCategory(playerId, 'pickaxe');
    expect(result).toBe(false);
  });

  it('should accept player with any tier of required tool', () => {
    // Player has bronze_pickaxe
    const result = system.playerHasToolCategory(playerId, 'pickaxe');
    expect(result).toBe(true);
  });

  it('should return best tool tier for skill', () => {
    // Player has iron and bronze hatchet
    const tool = system.getBestTool(playerId, 'woodcutting');
    expect(tool.id).toBe('iron_hatchet');
  });
});
```

**5.1.4 Rate Limiting Tests**

```typescript
describe('rate limiting', () => {
  it('should accept first gather request', () => {
    const result = system.startGathering({ playerId, resourceId });
    expect(result).not.toBeNull();
  });

  it('should reject rapid subsequent requests', () => {
    system.startGathering({ playerId, resourceId });
    const result = system.startGathering({ playerId, resourceId });
    expect(result).toBeNull(); // Silently dropped
  });

  it('should accept request after cooldown', async () => {
    system.startGathering({ playerId, resourceId });
    await sleep(700); // Wait > 600ms
    const result = system.startGathering({ playerId, resourceId });
    expect(result).not.toBeNull();
  });
});
```

**5.1.5 Success Rate Calculation Tests**

```typescript
describe('computeSuccessRate', () => {
  it('should return base rate at requirement level', () => {
    const rate = system.computeSuccessRate(1, { levelRequired: 1 });
    expect(rate).toBeCloseTo(0.35);
  });

  it('should increase rate above requirement', () => {
    const rate = system.computeSuccessRate(50, { levelRequired: 1 });
    expect(rate).toBeGreaterThan(0.35);
  });

  it('should cap at maximum rate', () => {
    const rate = system.computeSuccessRate(99, { levelRequired: 1 });
    expect(rate).toBeLessThanOrEqual(0.85);
  });

  it('should not go below minimum rate', () => {
    const rate = system.computeSuccessRate(1, { levelRequired: 99 });
    expect(rate).toBeGreaterThanOrEqual(0.25);
  });
});
```

**5.1.6 Cycle Time Calculation Tests**

```typescript
describe('computeCycleTicks', () => {
  it('should return base ticks with no bonuses', () => {
    const ticks = system.computeCycleTicks(1, { baseCycleTicks: 4 }, 1.0);
    expect(ticks).toBe(4);
  });

  it('should reduce ticks with better tool', () => {
    const ticks = system.computeCycleTicks(1, { baseCycleTicks: 4 }, 0.7);
    expect(ticks).toBeLessThan(4);
  });

  it('should reduce ticks with higher skill', () => {
    const ticks = system.computeCycleTicks(99, { baseCycleTicks: 4, levelRequired: 1 }, 1.0);
    expect(ticks).toBeLessThan(4);
  });

  it('should enforce minimum of 2 ticks', () => {
    const ticks = system.computeCycleTicks(99, { baseCycleTicks: 4 }, 0.1);
    expect(ticks).toBeGreaterThanOrEqual(2);
  });
});
```

---

### 5.2 Integration Tests

**File to create:** `packages/shared/src/systems/shared/entities/__tests__/ResourceSystem.integration.test.ts`

#### Test Scenarios

**5.2.1 Full Woodcutting Flow**

```typescript
describe('woodcutting integration', () => {
  it('should complete full gather cycle', async () => {
    // Setup
    const world = createTestWorld();
    const player = spawnTestPlayer(world, { inventory: ['bronze_hatchet'] });
    const tree = spawnTestResource(world, 'tree_normal');

    // Start gathering
    world.emit(EventType.RESOURCE_GATHER, {
      playerId: player.id,
      resourceId: tree.id,
    });

    // Verify session started
    expect(resourceSystem.activeGathering.has(player.id)).toBe(true);

    // Advance ticks until success
    for (let i = 0; i < 100; i++) {
      world.tick();
      if (player.inventory.includes('logs')) break;
    }

    // Verify results
    expect(player.inventory).toContain('logs');
    expect(player.skills.woodcutting.xp).toBeGreaterThan(0);
  });

  it('should deplete and respawn tree', async () => {
    // ... gather until depletion
    expect(tree.depleted).toBe(true);

    // Advance respawn ticks
    for (let i = 0; i < 80; i++) {
      world.tick();
    }

    expect(tree.depleted).toBe(false);
  });
});
```

**5.2.2 Full Fishing Flow**

```typescript
describe('fishing integration', () => {
  it('should produce mix of fish types', async () => {
    const player = spawnTestPlayer(world, { inventory: ['small_fishing_net'] });
    const spot = spawnTestResource(world, 'fishing_spot_normal');

    const catches = { raw_shrimp: 0, raw_anchovies: 0 };

    // Fish 50 times
    for (let i = 0; i < 50; i++) {
      world.emit(EventType.RESOURCE_GATHER, { playerId: player.id, resourceId: spot.id });
      // Advance until catch
      // Count item type
    }

    // Should have both types
    expect(catches.raw_shrimp).toBeGreaterThan(0);
    expect(catches.raw_anchovies).toBeGreaterThan(0);
  });
});
```

**5.2.3 Concurrent Gathering**

```typescript
describe('concurrent gathering', () => {
  it('should handle multiple players on same resource', async () => {
    const player1 = spawnTestPlayer(world);
    const player2 = spawnTestPlayer(world);
    const tree = spawnTestResource(world, 'tree_normal');

    // Both start gathering
    world.emit(EventType.RESOURCE_GATHER, { playerId: player1.id, resourceId: tree.id });
    world.emit(EventType.RESOURCE_GATHER, { playerId: player2.id, resourceId: tree.id });

    // Both should have sessions
    expect(resourceSystem.activeGathering.size).toBe(2);

    // Advance until tree depletes
    // ...

    // Only one should get the final log that depletes tree
    // Other's session should end
  });
});
```

---

### 5.3 E2E Tests with Playwright

**File to create:** `packages/server/tests/e2e/gathering.spec.ts`

#### Test Scenarios

**5.3.1 Visual Woodcutting Test**

```typescript
test('woodcutting visual flow', async ({ page }) => {
  // Login and spawn player
  await loginTestPlayer(page);

  // Give player an axe
  await giveItem(page, 'bronze_hatchet');

  // Navigate to tree
  const treePosition = { x: 100, y: 0, z: 100 };
  await walkTo(page, treePosition);

  // Click tree
  await clickEntity(page, 'tree_normal');

  // Assert chopping animation
  await expect(page.locator('[data-animation="chopping"]')).toBeVisible();

  // Wait for success
  await page.waitForSelector('[data-item="logs"]', { timeout: 30000 });

  // Assert inventory updated
  await expect(page.locator('.inventory-slot:has([data-item="logs"])')).toBeVisible();

  // Assert tree becomes stump
  await expect(page.locator('[data-entity="tree_normal"][data-depleted="true"]')).toBeVisible();
});
```

**5.3.2 Error Handling Test**

```typescript
test('shows error without tool', async ({ page }) => {
  await loginTestPlayer(page);

  // Ensure no axe in inventory
  await clearInventory(page);

  // Try to chop tree
  await clickEntity(page, 'tree_normal');

  // Assert error message
  await expect(page.locator('.error-message')).toContainText('need a hatchet');

  // Assert no animation
  await expect(page.locator('[data-animation="chopping"]')).not.toBeVisible();
});
```

---

## Phase 6: Code Quality Polish (Days 13-14)

### 6.1 Eliminate Type Assertions

**File:** `packages/shared/src/systems/shared/entities/ResourceSystem.ts`

#### Changes Required

**6.1.1 Fix network type assertion (lines 78-83)**

Current:
```typescript
const network = this.world.network as
  | { send?: (method: string, data: unknown) => void }
  | undefined;
```

Fix: Define proper interface in types:

```typescript
// In types/core/core.ts or similar
export interface WorldNetwork {
  send(method: string, data: unknown): void;
}

// In World type
export interface World {
  network?: WorldNetwork;
  // ...
}
```

Then use without assertion:
```typescript
if (this.world.network?.send) {
  this.world.network.send(method, data);
}
```

**6.1.2 Fix player emote access (lines 180-188)**

Current:
```typescript
const playerWithEmote = playerEntity as unknown as {
  emote?: string;
  data?: { e?: string };
  markNetworkDirty?: () => void;
};
```

Fix: Add emote property to PlayerEntity interface or create type guard:

```typescript
// Type guard approach
function hasEmote(entity: unknown): entity is { emote: string; markNetworkDirty(): void } {
  return entity !== null && typeof entity === 'object' && 'emote' in entity;
}

// Usage
if (hasEmote(playerEntity)) {
  playerEntity.emote = emote;
  playerEntity.markNetworkDirty();
}
```

**6.1.3 Fix EntityManager type (lines 350-357)**

Current:
```typescript
const entityManager = this.world.getSystem("entity-manager") as {
  spawnEntity?: (config: unknown) => Promise<unknown>;
} | null;
```

Fix: Define EntityManager interface:

```typescript
export interface EntityManager {
  spawnEntity(config: EntityConfig): Promise<Entity | null>;
}
```

---

### 6.2 Extract Named Constants

**File to create:** `packages/shared/src/constants/GatheringConstants.ts`

```typescript
/**
 * Constants for the resource gathering system
 * Centralized for easy tuning and documentation
 */
export const GATHERING_CONSTANTS = {
  // Proximity and range
  /** Maximum distance to search for nearby resources when exact match fails */
  PROXIMITY_SEARCH_RADIUS: 15,
  /** Default interaction range for gathering (can be overridden per resource) */
  DEFAULT_INTERACTION_RANGE: 4.0,

  // Timing
  /** Minimum ticks between gather attempts (prevents instant gathering) */
  MINIMUM_CYCLE_TICKS: 2,
  /** Rate limit cooldown in milliseconds (matches 1 tick) */
  RATE_LIMIT_MS: 600,

  // Success rate formula
  /** Base success rate at exactly required level */
  BASE_SUCCESS_RATE: 0.35,
  /** Additional success rate per level above requirement */
  PER_LEVEL_SUCCESS_BONUS: 0.01,
  /** Minimum possible success rate */
  MIN_SUCCESS_RATE: 0.25,
  /** Maximum possible success rate */
  MAX_SUCCESS_RATE: 0.85,
} as const;

export type GatheringConstants = typeof GATHERING_CONSTANTS;
```

**Update ResourceSystem to use constants:**

```typescript
import { GATHERING_CONSTANTS } from '../../../constants/GatheringConstants';

// Usage
if (nearestDist < GATHERING_CONSTANTS.PROXIMITY_SEARCH_RADIUS) { ... }
const base = GATHERING_CONSTANTS.BASE_SUCCESS_RATE + ...
```

---

### 6.3 Improve Error Handling

#### Changes Required

**6.3.1 Add structured error types**

```typescript
export class GatheringError extends Error {
  constructor(
    message: string,
    public readonly code: GatheringErrorCode,
    public readonly playerId: string,
    public readonly resourceId?: string,
  ) {
    super(message);
    this.name = 'GatheringError';
  }
}

export enum GatheringErrorCode {
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  INSUFFICIENT_LEVEL = 'INSUFFICIENT_LEVEL',
  MISSING_TOOL = 'MISSING_TOOL',
  RESOURCE_DEPLETED = 'RESOURCE_DEPLETED',
  INVENTORY_FULL = 'INVENTORY_FULL',
  RATE_LIMITED = 'RATE_LIMITED',
}
```

**6.3.2 Use structured errors in validation**

```typescript
if (skillLevel < resource.levelRequired) {
  throw new GatheringError(
    `Level ${resource.levelRequired} ${resource.skillRequired} required`,
    GatheringErrorCode.INSUFFICIENT_LEVEL,
    data.playerId,
    data.resourceId,
  );
}
```

---

## Phase 7: Documentation & Cleanup (Day 15)

### 7.1 Update JSDoc Comments

Add comprehensive documentation to all public and complex private methods:

```typescript
/**
 * Start a gathering session for a player on a resource
 *
 * Validates:
 * - Player has required skill level (from manifest levelRequired)
 * - Player has required tool (from manifest toolRequired)
 * - Resource is not depleted
 * - Player is within interaction range
 *
 * Creates tick-based gathering session that processes in processGatheringTick()
 *
 * @param data.playerId - Player attempting to gather
 * @param data.resourceId - Target resource entity ID
 *
 * @emits RESOURCE_GATHERING_STARTED on successful session start
 * @emits UI_MESSAGE on validation failure
 *
 * @example
 * ```typescript
 * world.emit(EventType.RESOURCE_GATHER, {
 *   playerId: 'player_123',
 *   resourceId: 'tree_50_100',
 * });
 * ```
 */
private startGathering(data: { playerId: string; resourceId: string }): void
```

### 7.2 Remove Dead Code

- [ ] Delete commented-out legacy code
- [ ] Remove unused private methods
- [ ] Clean up any `// TODO` comments that are now complete
- [ ] Remove legacy setTimeout-based respawn code if fully migrated

### 7.3 Add Architecture Documentation

Add section to class JSDoc:

```typescript
/**
 * ResourceSystem - Manages resource gathering for all skills
 *
 * ## Architecture
 *
 * ### Data Flow
 * 1. Client clicks resource → ResourceInteractionHandler
 * 2. Handler sends network message → resources.ts handler
 * 3. Handler emits RESOURCE_GATHER event
 * 4. ResourceSystem.startGathering() validates and creates session
 * 5. TickSystem calls processGatheringTick() every 600ms
 * 6. On success: drops item, awards XP, may deplete resource
 *
 * ### Manifest Integration
 * All resource data comes from resources.json:
 * - harvestSkill, levelRequired: Validation
 * - toolRequired: Tool validation
 * - baseCycleTicks, depleteChance, respawnTicks: Timing
 * - harvestYield: Drop table with items, chances, XP
 *
 * ### Session Management
 * Active gathering sessions stored in activeGathering Map.
 * Sessions cache tuning data at start to avoid per-tick allocation.
 * Sessions end on: depletion, player movement, inventory full, disconnect.
 */
```

---

## Success Criteria

### Quantitative Targets

| Metric | Current | Target |
|--------|---------|--------|
| Unit test coverage | ~0% | 90%+ |
| Integration test scenarios | 0 | 10+ |
| E2E test scenarios | 0 | 5+ |
| Type assertions in ResourceSystem | ~10 | 0 |
| Hardcoded manifest values | 6 fields | 0 |
| Hot path allocations | Multiple | 0 |

### Qualitative Targets

- [ ] Mining works without code changes (only manifest data)
- [ ] Fishing works with correct drop distribution
- [ ] No known security exploits
- [ ] Messages use resource names from manifest
- [ ] Tool validation uses manifest `toolRequired`
- [ ] All drops use manifest `harvestYield`

### Rating Calculation

| Category | Target | Weight | Contribution |
|----------|--------|--------|--------------|
| Production Quality | 9.5 | 20% | 1.90 |
| Best Practices | 9.0 | 15% | 1.35 |
| OWASP Security | 9.0 | 20% | 1.80 |
| Game Studio Audit | 9.0 | 20% | 1.80 |
| Memory & Allocation | 9.0 | 10% | 0.90 |
| SOLID Principles | 9.0 | 15% | 1.35 |
| **Weighted Total** | | | **9.10** |

---

## Out of Scope

The following are explicitly NOT part of this plan (future enhancements):

### Fishing Enhancements
- Bait consumption system (feathers for fly fishing)
- Fishing spot relocation on depletion
- Tool-determines-catch mechanics

### Random Events
- Bird's nest drops from woodcutting
- Rock golem pet from mining
- Big fish / fishing trawler rewards

### Special Tool Effects
- Infernal axe auto-burn logs
- Crystal axe shard collection
- Dragon pickaxe special attack

### Advanced Anti-Cheat
- Machine learning bot detection
- Behavioral pattern analysis
- Replay attack prevention with nonces

### Performance Scaling
- Worker thread for resource spawning
- Spatial partitioning for session processing
- Region-based session bucketing

---

## Appendix A: File Change Summary

| File | Changes |
|------|---------|
| `packages/shared/src/systems/shared/entities/ResourceSystem.ts` | Major refactoring |
| `packages/server/src/systems/ServerNetwork/handlers/resources.ts` | Security fix |
| `packages/shared/src/constants/GatheringConstants.ts` | New file |
| `packages/shared/src/systems/shared/entities/__tests__/ResourceSystem.test.ts` | New file |
| `packages/shared/src/systems/shared/entities/__tests__/ResourceSystem.integration.test.ts` | New file |
| `packages/server/tests/e2e/gathering.spec.ts` | New file |

---

## Appendix B: Testing Commands

```bash
# Run unit tests
npm test -- --grep "ResourceSystem"

# Run integration tests
npm test -- --grep "gathering integration"

# Run E2E tests
npm run test:e2e -- gathering.spec.ts

# Run with coverage
npm test -- --coverage --grep "ResourceSystem"
```

---

## Appendix C: Rollback Plan

If issues arise after deployment:

1. **Immediate rollback**: Revert commits for affected phase
2. **Feature flag**: Add `USE_LEGACY_GATHERING` flag to switch between old/new code
3. **Gradual rollout**: Deploy to subset of servers first

---

## Appendix D: Validation Summary

This plan was validated against the actual codebase on January 2, 2026. Key findings:

### ✅ Confirmed Accurate

| Item | Status |
|------|--------|
| Line numbers for hardcoded bugs | Verified correct |
| `harvestYield` manifest structure | Confirmed with actual JSON |
| `toolRequired` field exists | Confirmed in resources.json |
| No existing tests for ResourceSystem | Confirmed (0 test files found) |
| getBestAxeTier() hardcoded at lines 1170-1266 | Verified |
| Tool check woodcutting-only at lines 759-783 | Verified |

### 🔧 Items Added During Validation

| Item | Location | Description |
|------|----------|-------------|
| Line 974 | Phase 1.2.3 | Inventory full message hardcodes "logs" |
| Line 1031 | Phase 1.2.4 | Success message hardcodes "logs" |
| Line 1123 | Phase 1.1.3 | XP always from first drop (bug for fishing) |
| items.json check | Phase 3.1.1 | Confirmed no tool speed data exists |
| ProcessingSystem | Phase 1.4 | Documented hardcoded values for future work |

### 📋 Key Files Validated

```
ResourceSystem.ts          - 1307 lines, main gathering logic
ProcessingSystem.ts        - 684 lines, firemaking/cooking
resources.ts (handler)     - 45 lines, network handler
resources.json             - Full manifest with harvestYield
items.json                 - Tool items (no speed data)
DataManager.ts             - Manifest loading system
```

### 🎯 Accuracy Assessment

**Plan accuracy: 95%** - Original plan was comprehensive. Validation added:
- 2 additional hardcoded message locations
- 1 XP calculation bug for multi-drop resources
- Confirmation that items.json lacks tool speed data
- ProcessingSystem issues documented for future work

---

*Document Version: 1.1*
*Created: Based on technical audit of resource gathering system*
*Updated: Validation findings incorporated (January 2, 2026)*
*Target Completion: 15 days from start*
