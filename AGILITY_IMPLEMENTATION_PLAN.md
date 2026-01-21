# Agility System Implementation Plan

## Overview

This document outlines the implementation plan for adding an Agility skill to Hyperscape. Unlike traditional RuneScape agility (obstacle courses), our Agility system rewards players for traversing the game world and ties into the weight/stamina mechanics.

**Core Features:**
- Agility XP gained by moving (1 XP per 2 tiles traveled)
- Weight affects stamina drain (heavier load = faster drain when running)
- Agility level affects stamina regeneration (higher level = faster regen)

---

## Current System Analysis

### 1. Tile & Movement System

**Location:** `packages/shared/src/systems/shared/movement/TileSystem.ts`

**Key Constants:**
```typescript
const TILE_SIZE = 1.0;           // 1 world unit = 1 tile
const TICK_DURATION_MS = 600;    // Game tick duration
const TILES_PER_TICK_WALK = 2;   // Walk speed: 2 tiles per tick
const TILES_PER_TICK_RUN = 4;    // Run speed: 4 tiles per tick
```

**Core Interfaces:**
```typescript
interface TileCoord {
  x: number;
  z: number;
}

interface TileMovementState {
  currentTile: TileCoord;
  path: TileCoord[];
  pathIndex: number;
  isRunning: boolean;
  moveSeq: number;
}
```

**Movement Flow:**
1. Player clicks destination → pathfinding calculates tile path
2. `TileMovementSystem.update()` processes movement each tick
3. Player moves 2 tiles (walking) or 4 tiles (running) per tick
4. Movement events are broadcast for synchronization

**Hook Point:** The `TileMovementSystem` tracks tiles traversed - we can add XP granting here.

---

### 2. Stamina System

**Server Location:** `packages/shared/src/systems/shared/character/StaminaSystem.ts`
**Client Location:** `packages/shared/src/entities/player/PlayerLocal.ts` (lines 2147-2178)

**Current Constants:**
```typescript
// Stamina range: 0-100
interface PlayerStamina {
  current: number;
  max: number;  // Default: 100
}

// Current rates (per second)
staminaDrainPerSecond = 2;              // While running
staminaRegenWhileWalkingPerSecond = 2;  // While walking
staminaRegenPerSecond = 4;              // While idle
```

**Stamina Behavior:**
- Running drains stamina at 2 points/second
- Walking regenerates stamina at 2 points/second
- Standing idle regenerates at 4 points/second
- When stamina reaches 0, player is forced to walk

**Note:** Weight is NOT currently factored into stamina calculations.

---

### 3. Skills System

**Location:** `packages/shared/src/systems/shared/character/SkillsSystem.ts`

**Current Skills (12 total):**
```typescript
export const Skill = {
  ATTACK: "attack" as keyof Skills,
  STRENGTH: "strength" as keyof Skills,
  DEFENSE: "defense" as keyof Skills,
  RANGE: "ranged" as keyof Skills,
  CONSTITUTION: "constitution" as keyof Skills,
  PRAYER: "prayer" as keyof Skills,
  WOODCUTTING: "woodcutting" as keyof Skills,
  MINING: "mining" as keyof Skills,
  FISHING: "fishing" as keyof Skills,
  FIREMAKING: "firemaking" as keyof Skills,
  COOKING: "cooking" as keyof Skills,
  SMITHING: "smithing" as keyof Skills,
};
```

**Agility Status:** NOT implemented (icon exists in `skill-icons.ts` line 28: `agility: "🏃"`)

**XP System:**
```typescript
// XP formula (RuneScape-based)
getLevelForXP(xp: number): number {
  // Returns level 1-99 based on XP
  // Uses: floor((N - 1 + 300 * 2^((N-1)/7)) / 4)
}

// Granting XP
grantXP(entityId: string, skill: SkillName, amount: number): void;
```

---

### 4. Weight System

**Location:** `packages/shared/src/systems/shared/character/InventorySystem.ts`

**Weight Calculation (lines 1600-1610):**
```typescript
getTotalWeight(playerId: string): number {
  const inventory = this.getInventory(playerId);
  return inventory.items.reduce((total, item) => {
    const itemData = getItem(item.itemId);
    return total + (itemData?.weight || 0) * item.quantity;
  }, 0);
}
```

**Item Weight Definition:**
- Items have `weight` property in item definitions
- Default weight: 0.1 kg
- Weight is currently displayed in UI only - no gameplay effects

---

## Complete File Change Checklist

This section lists EVERY file that needs modification to add a new skill, based on how existing skills (like smithing) are implemented.

### 1. DATABASE LAYER

#### 1.1 Database Schema
**File:** `packages/server/src/database/schema.ts` (lines 190-220)

**Action:** Add two columns to the `characters` table definition:
```typescript
// After smithingLevel/smithingXp (around line 206)
agilityLevel: integer("agilityLevel").default(1),
agilityXp: integer("agilityXp").default(0),
```

#### 1.2 Database Migration
**File:** `packages/server/src/database/migrations/0018_add_agility_skill.sql` (NEW FILE)

**Action:** Create new migration file:
```sql
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "agilityLevel" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "agilityXp" integer DEFAULT 0;--> statement-breakpoint
```

#### 1.2.1 Migration Journal (REQUIRED for migrations to run)
**File:** `packages/server/src/database/migrations/meta/_journal.json`

**Action:** Add new entry to the `entries` array (after idx 17):
```json
{
  "idx": 18,
  "version": "7",
  "when": 1769000000000,
  "tag": "0018_add_agility_skill",
  "breakpoints": true
}
```

**Note:** The `when` timestamp should be current time in milliseconds. Use `Date.now()` in browser console to get current timestamp.

#### 1.3 Player Repository
**File:** `packages/server/src/database/repositories/PlayerRepository.ts` (lines 94-160)

**Action:** Add agility field mappings in `savePlayerAsync()`:
```typescript
// After smithingLevel/smithingXp mappings (around line 126)
if (data.agilityLevel !== undefined) {
  updateData.agilityLevel = data.agilityLevel;
}
if (data.agilityXp !== undefined) {
  updateData.agilityXp = data.agilityXp;
}
```

#### 1.4 Character Repository (CRITICAL - Previously Missed)
**File:** `packages/server/src/database/repositories/CharacterRepository.ts` (lines 203-275)

This file has `getCharacterSkills()` method that explicitly lists all skills. THREE places need changes:

**Action 1:** Update return type definition (lines 203-215):
```typescript
async getCharacterSkills(characterId: string): Promise<{
  attack: { level: number; xp: number };
  strength: { level: number; xp: number };
  defense: { level: number; xp: number };
  constitution: { level: number; xp: number };
  ranged: { level: number; xp: number };
  woodcutting: { level: number; xp: number };
  mining: { level: number; xp: number };
  fishing: { level: number; xp: number };
  firemaking: { level: number; xp: number };
  cooking: { level: number; xp: number };
  smithing: { level: number; xp: number };
  agility: { level: number; xp: number };  // NEW
} | null>
```

**Action 2:** Add to select columns (after line 241):
```typescript
agilityLevel: schema.characters.agilityLevel,
agilityXp: schema.characters.agilityXp,
```

**Action 3:** Add to return mapping (after line 273):
```typescript
agility: { level: row.agilityLevel || 1, xp: row.agilityXp || 0 },
```

---

### 2. TYPE DEFINITIONS

#### 2.1 Skills Interface (Core Type)
**File:** `packages/shared/src/types/entities/entity-types.ts` (lines 17-30)

**Action:** Add agility to the `Skills` interface:
```typescript
export interface Skills {
  attack: SkillData;
  strength: SkillData;
  defense: SkillData;
  constitution: SkillData;
  ranged: SkillData;
  prayer: SkillData;
  woodcutting: SkillData;
  mining: SkillData;
  fishing: SkillData;
  firemaking: SkillData;
  cooking: SkillData;
  smithing: SkillData;
  agility: SkillData;  // NEW
}
```

#### 2.2 StatsComponent Interface
**File:** `packages/shared/src/types/entities/entity-types.ts` (lines 105-122)

**Action:** Add agility to the `StatsComponent` interface:
```typescript
// After smithing: SkillData; (around line 121)
agility: SkillData;
```

#### 2.3 PlayerRow Type (Database Row)
**File:** `packages/shared/src/types/network/database.ts` (lines 35-77)

**Action:** Add agility fields to `PlayerRow` interface:
```typescript
// After smithingLevel/smithingXp (around line 76)
agilityLevel: number;
agilityXp: number;
```

#### 2.4 Player Migration Utilities
**File:** `packages/shared/src/types/entities/player-types.ts`

**Action 1:** Update `fromPlayerRow()` method (lines 167-189):
```typescript
// After smithing mapping (around line 188)
agility: { level: old.agilityLevel || 1, xp: old.agilityXp || 0 },
```

**Action 2:** Update `getDefaultSkills()` method (lines 279-295):
```typescript
// After smithing: defaultSkill (around line 293)
agility: defaultSkill,
```

---

### 3. COMPONENTS

#### 3.1 StatsComponent Class
**File:** `packages/shared/src/components/StatsComponent.ts`

**Action 1:** Add property declaration (after line 38):
```typescript
public agility: SkillData;
```

**Action 2:** Add initialization in constructor (after line 112):
```typescript
this.agility = initialData.agility || { ...defaultSkill };
```

**Action 3:** Add to serialize() method (after line 140):
```typescript
agility: this.agility,
```

---

### 4. SKILLS SYSTEM

#### 4.1 Skill Constant
**File:** `packages/shared/src/systems/shared/character/SkillsSystem.ts` (lines 47-60)

**Action:** Add AGILITY to the `Skill` constant object:
```typescript
export const Skill = {
  ATTACK: "attack" as keyof Skills,
  STRENGTH: "strength" as keyof Skills,
  DEFENSE: "defense" as keyof Skills,
  RANGE: "ranged" as keyof Skills,
  CONSTITUTION: "constitution" as keyof Skills,
  PRAYER: "prayer" as keyof Skills,
  WOODCUTTING: "woodcutting" as keyof Skills,
  MINING: "mining" as keyof Skills,
  FISHING: "fishing" as keyof Skills,
  FIREMAKING: "firemaking" as keyof Skills,
  COOKING: "cooking" as keyof Skills,
  SMITHING: "smithing" as keyof Skills,
  AGILITY: "agility" as keyof Skills,  // NEW
};
```

#### 4.2 Total Level Calculation
**File:** `packages/shared/src/systems/shared/character/SkillsSystem.ts` (lines 348-375)

**Action:** Add `Skill.AGILITY` to the skills array in `getTotalLevel()`:
```typescript
const skills: (keyof Skills)[] = [
  Skill.ATTACK,
  Skill.STRENGTH,
  Skill.DEFENSE,
  Skill.RANGE,
  Skill.CONSTITUTION,
  Skill.WOODCUTTING,
  Skill.MINING,
  Skill.FISHING,
  Skill.FIREMAKING,
  Skill.COOKING,
  Skill.SMITHING,
  Skill.PRAYER,
  Skill.AGILITY,  // NEW
];
```

#### 4.3 Total XP Calculation
**File:** `packages/shared/src/systems/shared/character/SkillsSystem.ts` (lines 377-400)

**Action:** Add `Skill.AGILITY` to the skills array in `getTotalXP()`:
```typescript
const skills: (keyof Skills)[] = [
  Skill.ATTACK,
  Skill.STRENGTH,
  Skill.DEFENSE,
  Skill.RANGE,
  Skill.CONSTITUTION,
  Skill.WOODCUTTING,
  Skill.MINING,
  Skill.FISHING,
  Skill.FIREMAKING,
  Skill.COOKING,
  Skill.SMITHING,
  Skill.PRAYER,
  Skill.AGILITY,  // NEW
];
```

#### 4.4 Skill Milestones
**File:** `packages/shared/src/systems/shared/character/SkillsSystem.ts` (lines 502-535)

**Action:** Add `Skill.AGILITY` to the skills array in `setupSkillMilestones()`:
```typescript
const skills: (keyof Skills)[] = [
  Skill.ATTACK,
  Skill.STRENGTH,
  Skill.DEFENSE,
  Skill.RANGE,
  Skill.CONSTITUTION,
  Skill.WOODCUTTING,
  Skill.MINING,
  Skill.FISHING,
  Skill.FIREMAKING,
  Skill.COOKING,
  Skill.SMITHING,
  Skill.PRAYER,
  Skill.AGILITY,  // NEW
];
```

---

### 5. CLIENT UI

#### 5.1 Skills Panel
**File:** `packages/client/src/game/panels/SkillsPanel.tsx` (lines 380-459)

**Action:** Add agility skill object to the skills array:
```typescript
// After smithing entry (around line 451)
{
  key: "agility",
  label: "Agility",
  icon: "🏃",
  level: s?.agility?.level || 1,
  xp: s?.agility?.xp || 0,
},
```

#### 5.2 Agent Skills Panel (Dashboard)
**File:** `packages/client/src/components/dashboard/AgentSkillsPanel.tsx`

This file has THREE hardcoded skill lists that need updating:

**Action 1:** Update `AgentSkills` interface (lines 54-64):
```typescript
interface AgentSkills {
  attack?: SkillData;
  strength?: SkillData;
  defense?: SkillData;
  constitution?: SkillData;
  woodcutting?: SkillData;
  fishing?: SkillData;
  firemaking?: SkillData;
  cooking?: SkillData;
  agility?: SkillData;  // NEW
}
```

**Action 2:** Add agility to `SKILL_CONFIG` array (lines 72-82):
```typescript
const SKILL_CONFIG = [
  { key: "attack", label: "Attack", icon: "⚔️" },
  { key: "strength", label: "Strength", icon: "💪" },
  { key: "defense", label: "Defense", icon: "🛡️" },
  { key: "constitution", label: "HP", icon: "❤️" },
  { key: "woodcutting", label: "Woodcut", icon: "🪓" },
  { key: "fishing", label: "Fishing", icon: "🎣" },
  { key: "firemaking", label: "Fire", icon: "🔥" },
  { key: "cooking", label: "Cooking", icon: "🍳" },
  { key: "agility", label: "Agility", icon: "🏃" },  // NEW
] as const;
```

**Action 3:** Update default skills object in first fallback (lines 260-269):
```typescript
setSkills({
  attack: { level: 1, xp: 0 },
  strength: { level: 1, xp: 0 },
  defense: { level: 1, xp: 0 },
  constitution: { level: 10, xp: 0 },
  woodcutting: { level: 1, xp: 0 },
  fishing: { level: 1, xp: 0 },
  firemaking: { level: 1, xp: 0 },
  cooking: { level: 1, xp: 0 },
  agility: { level: 1, xp: 0 },  // NEW
});
```

**Action 4:** Update default skills object in second fallback (lines 304-313):
```typescript
setSkills({
  attack: { level: 1, xp: 0 },
  strength: { level: 1, xp: 0 },
  defense: { level: 1, xp: 0 },
  constitution: { level: 10, xp: 0 },
  woodcutting: { level: 1, xp: 0 },
  fishing: { level: 1, xp: 0 },
  firemaking: { level: 1, xp: 0 },
  cooking: { level: 1, xp: 0 },
  agility: { level: 1, xp: 0 },  // NEW
});
```

**Note:** Agility should be grouped with Gathering skills in the UI since it's a non-combat traversal skill.

#### 5.3 Character Routes (API Default Skills)
**File:** `packages/server/src/startup/routes/character-routes.ts` (lines 353-365)

This file has a fallback default skills object returned when skills aren't found in database.

**Action:** Add agility to the default skills fallback:
```typescript
return reply.send({
  success: true,
  skills: {
    attack: { level: 1, xp: 0 },
    strength: { level: 1, xp: 0 },
    defense: { level: 1, xp: 0 },
    constitution: { level: 10, xp: 0 },
    ranged: { level: 1, xp: 0 },
    woodcutting: { level: 1, xp: 0 },
    mining: { level: 1, xp: 0 },
    fishing: { level: 1, xp: 0 },
    firemaking: { level: 1, xp: 0 },
    cooking: { level: 1, xp: 0 },
    smithing: { level: 1, xp: 0 },
    agility: { level: 1, xp: 0 },  // NEW
  },
});
```

#### 5.4 Skill Icons (NO CHANGE NEEDED)
**File:** `packages/shared/src/data/skill-icons.ts` (line 28)

**Status:** Already has agility icon defined:
```typescript
agility: "🏃",
```

---

### 6. MANIFESTS

#### 6.1 Skill Unlocks (REQUIRED)
**File:** `packages/server/world/assets/manifests/skill-unlocks.json`

This manifest defines level-based unlocks for each skill. Currently has entries for all 11 implemented skills. Agility needs to be added.

**Action:** Add agility section after smithing (line 556):
```json
"agility": [
  {
    "level": 1,
    "description": "Basic stamina regeneration (+1% per level)",
    "type": "ability"
  },
  {
    "level": 10,
    "description": "+10% stamina regeneration",
    "type": "ability"
  },
  {
    "level": 25,
    "description": "+25% stamina regeneration",
    "type": "ability"
  },
  {
    "level": 50,
    "description": "+50% stamina regeneration",
    "type": "ability"
  },
  {
    "level": 75,
    "description": "+75% stamina regeneration",
    "type": "ability"
  },
  {
    "level": 99,
    "description": "Agility cape, +99% stamina regeneration",
    "type": "item"
  }
]
```

**Note:** `tier-requirements.json` does NOT need changes - it's for equipment level requirements and agility isn't an equipment skill.

---

### 7. TEST FILES

#### 7.1 Skill Unlocks Test
**File:** `packages/shared/src/data/__tests__/skill-unlocks.test.ts` (lines 167-192)

**Action 1:** Add agility to implementedSkills array (line 167-179):
```typescript
const implementedSkills = [
  "attack",
  "strength",
  "defence",
  "constitution",
  "prayer",
  "woodcutting",
  "mining",
  "fishing",
  "cooking",
  "firemaking",
  "smithing",
  "agility",  // NEW
];
```

**Action 2:** Update skill count test (line 192):
```typescript
// Change from:
expect(skillCount).toBe(11);
// To:
expect(skillCount).toBe(12);
```

#### 7.2 Skills XP Test (Optional Review)
**File:** `packages/shared/src/systems/shared/character/__tests__/SkillsSystem.xp.test.ts` (line 82)

**Note:** This test specifically tests combat XP distribution across 4 combat skills. Agility is NOT a combat skill, so this test does NOT need modification. However, if there are other tests in this file that test total level/XP calculations, those should be verified to work with agility.

---

## Implementation Phases

### Phase 1: Add Agility Skill Infrastructure

Complete all files in the checklist above to add agility as a functional skill that can receive XP and level up. This phase adds NO behavior - just the data structures.

**Verification:**
- [ ] Database migration runs without errors
- [ ] Player can be created with agility skill
- [ ] Agility appears in skills panel at level 1
- [ ] Manual XP grant via console works

---

### Phase 2: Movement XP Tracking

**IMPORTANT:** The movement system is in the SERVER package, not shared.

**Files to Modify:**
- `packages/server/src/systems/ServerNetwork/tile-movement.ts` (TileMovementManager class)

**Current Code Location:**
- `onTick()` method (line 446) - processes all player movement each tick
- `processPlayerTick()` method (line 617) - moves individual player along path

---

#### XP Batching Design (Prevents Visual Spam)

**Problem:** At 1 XP per 2 tiles, running players would see XP drops every 300ms - incredibly spammy.

**Solution:** Batch XP grants at a tile threshold.

| Setting | Value | Reasoning |
|---------|-------|-----------|
| Threshold | 100 tiles | ~15 sec running, ~30 sec walking between drops |
| XP per threshold | 50 XP | Same rate (1 XP per 2 tiles), just batched |
| Overflow handling | Preserve (tiles % 100) | Fair to player, earned steps count |
| On death | Reset counter to 0 | Small consequence, adds risk |
| On logout/disconnect | Reset counter (lost) | Simplifies persistence, max ~50 XP lost |

**Visual XP Drop Frequency:**
- Running (4 tiles/tick): XP drop every ~15 seconds
- Walking (2 tiles/tick): XP drop every ~30 seconds

**Grind Progression (at running speed):**
- Level 2 (83 XP): ~25 seconds
- Level 10 (1,154 XP): ~6 minutes
- Level 50 (101,333 XP): ~8.5 hours
- Level 99 (13M XP): ~1,000+ hours

---

#### Implementation

**Step 1:** Add tile counter Map to TileMovementManager class (around line 53):
```typescript
// Agility XP tracking: tiles traveled per player (batched at 100 tiles = 50 XP)
private tilesTraveledForXP: Map<string, number> = new Map();
```

**Step 2:** In `processPlayerTick()`, after player moves to new tile, track tiles and grant XP:
```typescript
// After the player has moved to a new tile (around line 680-700):
// Track tiles for agility XP (100 tiles = 50 XP, batched to reduce visual spam)
const TILES_PER_XP_GRANT = 100;
const XP_PER_GRANT = 50;

const newTileCount = (this.tilesTraveledForXP.get(playerId) || 0) + tilesMovedThisTick;

if (newTileCount >= TILES_PER_XP_GRANT) {
  // Grant XP and preserve overflow
  const grantsEarned = Math.floor(newTileCount / TILES_PER_XP_GRANT);
  const xpToGrant = grantsEarned * XP_PER_GRANT;
  this.tilesTraveledForXP.set(playerId, newTileCount % TILES_PER_XP_GRANT);

  // Grant agility XP via event (triggers visual XP drop)
  this.world.emit(EventType.SKILLS_XP_GAINED, {
    playerId,
    skill: 'agility',
    amount: xpToGrant,
  });
} else {
  // Accumulate tiles silently
  this.tilesTraveledForXP.set(playerId, newTileCount);
}
```

**Step 3:** Reset on death - subscribe to death event or add to death handling:
```typescript
// In death handling (PlayerDeathSystem or similar):
this.tilesTraveledForXP.set(playerId, 0);
```

**Step 4:** Clean up on player disconnect (in cleanup/removal methods):
```typescript
this.tilesTraveledForXP.delete(playerId);
```

**Step 5:** Ensure teleportation does NOT add tiles (verify teleport doesn't go through normal movement path)

**XP Rate Analysis:**
| Movement | Tiles/Tick | Tiles/Second | XP/Second | XP/Minute |
|----------|------------|--------------|-----------|-----------|
| Walking  | 2          | 3.33         | 1.67      | 100       |
| Running  | 4          | 6.67         | 3.33      | 200       |

---

### Phase 3: Weight-Based Stamina Drain

**IMPORTANT:** There is NO `StaminaSystem.ts` file. All stamina logic is **client-side only** in `PlayerLocal.ts` (lines 2144-2178). The stamina is purely for UI display - the server doesn't track it.

**Files to Modify:**
- `packages/shared/src/entities/player/PlayerLocal.ts` (main stamina logic)
- `packages/shared/src/systems/shared/character/InventorySystem.ts` (weight calculation exists)
- `packages/shared/src/types/entities/player-types.ts` (add totalWeight to Player interface)

**Current Code Location (PlayerLocal.ts lines 350-355):**
```typescript
public stamina: number = 100;
private readonly staminaDrainPerSecond: number = 2; // drain while running
private readonly staminaRegenWhileWalkingPerSecond: number = 2; // regen while walking
private readonly staminaRegenPerSecond: number = 4; // regen while idle
```

**Current Drain Logic (PlayerLocal.ts lines 2147-2152):**
```typescript
if (currentEmote === "run") {
  this.stamina = THREE.MathUtils.clamp(
    this.stamina - this.staminaDrainPerSecond * dt,
    0,
    100,
  );
}
```

**Design:**
- Base drain rate: 2 stamina/second (current)
- Weight modifier: +0.5% drain per kg carried
- Example: 20kg load = +10% drain = 2.2 stamina/second

**Implementation Steps:**

**Step 1:** Add totalWeight to Player interface and sync from server
```typescript
// In player-types.ts - add to Player interface
totalWeight?: number;  // Calculated by server, synced to client
```

**Step 2:** Server calculates and sends weight on inventory changes
```typescript
// In InventorySystem.ts - emit weight update when inventory changes
const weight = this.getTotalWeight(playerId);
this.emitTypedEvent(EventType.PLAYER_WEIGHT_CHANGED, { playerId, weight });
```

**Step 3:** PlayerLocal tracks weight and uses it for drain calculation
```typescript
// In PlayerLocal.ts - add property
public totalWeight: number = 0;

// In PlayerLocal.ts - modify drain calculation (around line 2149)
private calculateDrainRate(): number {
  const weightMultiplier = 1 + (this.totalWeight * 0.005); // 0.5% per kg
  return this.staminaDrainPerSecond * weightMultiplier;
}

// In stamina update:
this.stamina = THREE.MathUtils.clamp(
  this.stamina - this.calculateDrainRate() * dt,
  0,
  100,
);
```

**Weight Impact Table:**
| Weight (kg) | Drain Multiplier | Drain/Second |
|-------------|------------------|--------------|
| 0           | 1.0x             | 2.0          |
| 10          | 1.05x            | 2.1          |
| 20          | 1.1x             | 2.2          |
| 40          | 1.2x             | 2.4          |
| 60          | 1.3x             | 2.6          |
| 100         | 1.5x             | 3.0          |

---

### Phase 4: Agility-Based Stamina Regeneration

**Files to Modify:**
- `packages/shared/src/entities/player/PlayerLocal.ts` (main stamina logic)

**Current Regen Logic (PlayerLocal.ts lines 2159-2177):**
```typescript
} else if (currentEmote === "walk") {
  this.stamina = THREE.MathUtils.clamp(
    this.stamina + this.staminaRegenWhileWalkingPerSecond * dt,
    0,
    100,
  );
} else {
  // Idle
  this.stamina = THREE.MathUtils.clamp(
    this.stamina + this.staminaRegenPerSecond * dt,
    0,
    100,
  );
}
```

**Design:**
- Base regen rates remain (2/sec walking, 4/sec idle)
- Agility bonus: +1% regen per agility level
- Level 1: 1% bonus, Level 99: 99% bonus (nearly double regen)

**Implementation:**

PlayerLocal already has `this.skills` which will include agility once added.

```typescript
// In PlayerLocal.ts - add helper method
private calculateRegenRate(baseRate: number): number {
  const agilityLevel = this.skills?.agility?.level || 1;
  const agilityMultiplier = 1 + (agilityLevel * 0.01); // 1% per level
  return baseRate * agilityMultiplier;
}

// Modify walking regen (around line 2161):
this.stamina = THREE.MathUtils.clamp(
  this.stamina + this.calculateRegenRate(this.staminaRegenWhileWalkingPerSecond) * dt,
  0,
  100,
);

// Modify idle regen (around line 2171):
this.stamina = THREE.MathUtils.clamp(
  this.stamina + this.calculateRegenRate(this.staminaRegenPerSecond) * dt,
  0,
  100,
);
```

**Agility Regen Bonus Table:**
| Agility Level | Regen Multiplier | Idle Regen/Sec | Walk Regen/Sec |
|---------------|------------------|----------------|----------------|
| 1             | 1.01x            | 4.04           | 2.02           |
| 10            | 1.10x            | 4.40           | 2.20           |
| 25            | 1.25x            | 5.00           | 2.50           |
| 50            | 1.50x            | 6.00           | 3.00           |
| 75            | 1.75x            | 7.00           | 3.50           |
| 99            | 1.99x            | 7.96           | 3.98           |

---

## Complete File Change Summary

| # | File | Location | Change Type | Description |
|---|------|----------|-------------|-------------|
| 1 | `schema.ts` | `packages/server/src/database/` | Database | Add agilityLevel, agilityXp columns |
| 2 | `0018_add_agility_skill.sql` | `packages/server/src/database/migrations/` | Database | NEW migration file |
| 3 | `_journal.json` | `packages/server/src/database/migrations/meta/` | Database | Add entry for migration to run |
| 4 | `PlayerRepository.ts` | `packages/server/src/database/repositories/` | Database | Add agility save/load mappings |
| 5 | `CharacterRepository.ts` | `packages/server/src/database/repositories/` | Database | Add agility to getCharacterSkills() (3 places) |
| 6 | `entity-types.ts` | `packages/shared/src/types/entities/` | Types | Add agility to Skills interface |
| 7 | `entity-types.ts` | `packages/shared/src/types/entities/` | Types | Add agility to StatsComponent interface |
| 8 | `database.ts` | `packages/shared/src/types/network/` | Types | Add agility to PlayerRow interface |
| 9 | `player-types.ts` | `packages/shared/src/types/entities/` | Types | Add agility to fromPlayerRow() |
| 10 | `player-types.ts` | `packages/shared/src/types/entities/` | Types | Add agility to getDefaultSkills() |
| 11 | `StatsComponent.ts` | `packages/shared/src/components/` | Component | Add agility property + serialization |
| 12 | `SkillsSystem.ts` | `packages/shared/src/systems/shared/character/` | System | Add AGILITY constant |
| 13 | `SkillsSystem.ts` | `packages/shared/src/systems/shared/character/` | System | Add to getTotalLevel() |
| 14 | `SkillsSystem.ts` | `packages/shared/src/systems/shared/character/` | System | Add to getTotalXP() |
| 15 | `SkillsSystem.ts` | `packages/shared/src/systems/shared/character/` | System | Add to setupSkillMilestones() |
| 16 | `SkillsPanel.tsx` | `packages/client/src/game/panels/` | UI | Add agility to skills display |
| 17 | `AgentSkillsPanel.tsx` | `packages/client/src/components/dashboard/` | UI | Add agility to interface, config, and defaults (4 places) |
| 18 | `character-routes.ts` | `packages/server/src/startup/routes/` | API | Add agility to default skills fallback |
| 19 | `skill-unlocks.json` | `packages/server/world/assets/manifests/` | Manifest | Add agility skill unlock entries |
| 20 | `skill-unlocks.test.ts` | `packages/shared/src/data/__tests__/` | Tests | Add agility to implementedSkills + update count |
| 21 | `tile-movement.ts` | `packages/server/src/systems/ServerNetwork/` | Feature | Add tile tracking + XP grant |
| 22 | `PlayerLocal.ts` | `packages/shared/src/entities/player/` | Feature | Weight-based drain + agility-based regen |
| 23 | `InventorySystem.ts` | `packages/shared/src/systems/shared/character/` | Feature | Emit weight change events |
| 24 | `event-types.ts` | `packages/shared/src/types/events/` | Feature | Add PLAYER_WEIGHT_CHANGED event (optional) |

**Total: 24 file changes (20 for skill infrastructure, 4 for feature behavior)**

**Note:** There is NO `StaminaSystem.ts` - all stamina logic is client-side in `PlayerLocal.ts`

---

## Constants Configuration

All tunable values should be centralized:

```typescript
// packages/shared/src/constants/agility-constants.ts

export const AGILITY_CONSTANTS = {
  // ===========================================
  // XP Batching Settings (prevents visual spam)
  // ===========================================
  TILES_PER_XP_GRANT: 100,      // Tiles needed before XP is granted
  XP_PER_GRANT: 50,             // XP granted per threshold (effectively 1 XP per 2 tiles)

  // Effective rate: 50 XP / 100 tiles = 0.5 XP per tile = 1 XP per 2 tiles
  // Visual frequency: ~15 sec running, ~30 sec walking

  // ===========================================
  // Weight-Stamina Settings
  // ===========================================
  WEIGHT_DRAIN_MODIFIER: 0.005, // 0.5% extra drain per kg carried

  // ===========================================
  // Agility-Stamina Settings
  // ===========================================
  AGILITY_REGEN_BONUS: 0.01,    // 1% extra regen per agility level

  // ===========================================
  // Base Stamina (existing, for reference)
  // ===========================================
  BASE_STAMINA_DRAIN: 2,        // per second while running
  BASE_STAMINA_REGEN_WALK: 2,   // per second while walking
  BASE_STAMINA_REGEN_IDLE: 4,   // per second while idle
};
```

**XP Rate Breakdown:**
| Metric | Value |
|--------|-------|
| Tiles per XP grant | 100 |
| XP per grant | 50 |
| Effective rate | 1 XP per 2 tiles |
| Running XP/minute | ~200 XP |
| Walking XP/minute | ~100 XP |

---

## Testing Requirements

### Unit Tests
1. **Agility XP Grant**
   - Verify 1 XP granted per 2 tiles
   - Verify walking and running both grant XP
   - Verify XP accumulates correctly

2. **Weight-Stamina Drain**
   - Verify drain increases with weight
   - Verify formula accuracy at weight breakpoints
   - Verify 0 weight uses base drain

3. **Agility-Stamina Regen**
   - Verify regen increases with agility level
   - Verify formula accuracy at level breakpoints
   - Verify level 1 uses near-base regen

### Integration Tests (Playwright)
1. Player moves across map → agility XP increases
2. Player with heavy inventory → stamina drains faster
3. High agility player → stamina regens faster
4. Combined test: weighted player with high agility

---

## Implementation Verification Checklist

### Phase 1: Skill Infrastructure
- [ ] Migration file created (`0018_add_agility_skill.sql`)
- [ ] Migration journal updated (`_journal.json` has entry for idx 18)
- [ ] Migration runs on `bun run dev` without errors
- [ ] `bun run build` completes without TypeScript errors
- [ ] New player has agility skill at level 1, XP 0
- [ ] Agility appears in SkillsPanel UI
- [ ] Agility appears in AgentSkillsPanel (dashboard) UI
- [ ] Total level calculation includes agility
- [ ] Database saves/loads agility correctly on reconnect
- [ ] CharacterRepository.getCharacterSkills() returns agility
- [ ] skill-unlocks.json has agility entries
- [ ] skill-unlocks.test.ts passes with 12 skills

### Phase 2: Movement XP
- [ ] Tiles are tracked silently while moving
- [ ] XP drop appears after 100 tiles (50 XP)
- [ ] Overflow is preserved (walking 150 tiles = 50 XP + 50 tiles remaining)
- [ ] Running shows XP drop every ~15 seconds
- [ ] Walking shows XP drop every ~30 seconds
- [ ] Death resets tile counter to 0
- [ ] Logout/disconnect clears tile counter
- [ ] Teleportation does NOT add to tile counter
- [ ] Level up notification works correctly

### Phase 3: Weight Drain
- [ ] Empty inventory uses base drain rate (2/sec)
- [ ] Heavy inventory increases drain rate
- [ ] Weight syncs from server to client on inventory changes
- [ ] PlayerLocal.totalWeight updates correctly
- [ ] UI stamina bar reflects faster drain when heavy

### Phase 4: Agility Regen
- [ ] Level 1 agility has minimal bonus (~1%)
- [ ] Higher agility levels regen faster
- [ ] Idle regen affected (4/sec base)
- [ ] Walking regen affected (2/sec base)
- [ ] PlayerLocal correctly reads agility level from this.skills

---

## Considerations

### Balance Notes
- XP rate is fairly fast (100-200 XP/min) - adjust `TILES_FOR_XP` if needed
- Weight penalty is mild (50% extra drain at 100kg) - adjust `WEIGHT_DRAIN_MODIFIER` if needed
- Agility bonus caps at ~2x regen at level 99 - feels significant but not overpowered

### Edge Cases
- Teleportation should NOT grant agility XP (no tiles traversed)
- Death/respawn should reset tile counter
- Disconnection should persist current XP but reset tile counter
- Running out of stamina mid-path should continue walking (already handled)
- AFK prevention: Consider max XP per minute cap to prevent botting

### Future Enhancements
- Agility shortcuts (locked paths requiring agility level)
- Weight reduction from agility (high level = carry more efficiently)
- Run energy potions affected by agility level
- Graceful outfit (reduces weight while worn)

---

## Notes

- Skill icon already exists: `packages/shared/src/data/skill-icons.ts` line 28 has `agility: "🏃"`
- XP drops and level-up notifications work automatically through existing SkillsSystem
- Combat level is NOT affected by agility (matches OSRS design)
- **IMPORTANT:** CharacterRepository.ts has hardcoded skill return type - must be updated alongside PlayerRepository
- Event system is generic and works with any skill name - no changes needed to event-types.ts or event-payloads.ts
- The prayer skill is missing from CharacterRepository.getCharacterSkills() (existing bug, not related to agility)
- **STAMINA IS CLIENT-SIDE ONLY:** There is no StaminaSystem.ts - all stamina drain/regen logic is in `PlayerLocal.ts` (lines 2144-2178). Server doesn't track stamina.
- **WEIGHT SYNC REQUIRED:** To use weight in stamina calculations, server must sync totalWeight to client when inventory changes
- PlayerLocal already has `this.skills` which will include agility once the skill infrastructure is added
