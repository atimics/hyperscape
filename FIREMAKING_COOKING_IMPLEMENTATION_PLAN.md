# Firemaking & Cooking Skills Implementation Plan

## Overview

This document outlines the AAA-quality implementation plan for Firemaking and Cooking skills, modeled after our OSRS-accurate Resource Gathering System architecture.

**Goal**: Implement tick-based, OSRS-accurate firemaking and cooking with server-authoritative validation, data-driven configuration, and comprehensive test coverage.

---

## Current State Analysis

### Existing ProcessingSystem.ts Issues

| Issue | Current State | Required State |
|-------|--------------|----------------|
| Timing | `setTimeout` (real-time) | Tick-based (600ms ticks) |
| Burn Formula | Hardcoded level thresholds | Per-food OSRS burn tables |
| Log Types | Only `normal_logs` | All log types with proper XP |
| Food Types | Only `raw_fish` generic | All fish + meat with burn levels |
| Fire Placement | Static at player position | Walk west after lighting (OSRS) |
| Success Rate | 100% success | OSRS formula: 65/256 → 513/256 linear interpolation |
| Cooking Sources | Only fires | Fires + Ranges (ranges burn less) |
| Equipment | None | FUTURE: Cooking gauntlets, cooking cape |
| Architecture | Monolithic | Modular like gathering system |
| Validation | Client-trusting | Server-authoritative |

---

## OSRS Mechanics Research

### Firemaking Mechanics

**Tick Timing:**
- Lighting logs: **4 game ticks** (2.4 seconds) on success
- Failed attempt: retry immediately (adds ticks)
- Movement after fire: Walk **west** (or east → south → north if blocked)

**Success Rate Formula:**
```
successChance = 65 + (level - 1) * (513 - 65) / 98
// At level 1: 65/256 (25.4%)
// At level 43: 256/256 (100%)
// At level 99: 513/256 (capped at 100%)
```

**XP Values by Log Type:**

| Log Type | Level Req | XP |
|----------|-----------|-----|
| Normal | 1 | 40 |
| Achey | 1 | 40 |
| Oak | 15 | 60 |
| Willow | 30 | 90 |
| Teak | 35 | 105 |
| Arctic Pine | 42 | 125 |
| Maple | 45 | 135 |
| Mahogany | 50 | 157.5 |
| Yew | 60 | 202.5 |
| Magic | 75 | 303.8 |
| Redwood | 90 | 350 |

**Fire Duration:**
- Random/unpredictable duration (not level-dependent)
- OSRS: 60-119 seconds (per Mod Ash)
- For gameplay: Use **60-119 seconds random range**

**Sources:**
- [OSRS Wiki - Firemaking](https://oldschool.runescape.wiki/w/Firemaking)
- [OSRS Wiki - Pay-to-play Firemaking training](https://oldschool.runescape.wiki/w/Pay-to-play_Firemaking_training)

---

### Cooking Mechanics

**Tick Timing:**
- Standard cooking: **4 game ticks** (2.4 seconds) per item
- 1,300-1,400 items cookable per hour with banking

**Burn Rate Mechanics:**
- No exact formula known - uses lookup tables
- Burn chance decreases as level increases
- Reaches 0% at specific "stop-burn" levels per food
- **Ranges burn less than fires**
**FUTURE (not in initial implementation):**
- Cooking gauntlets - reduce burn levels for high-tier food
- Cooking cape (level 99) - never burn any food

**Burn Level Table (Fire vs Range):**

| Food | Cook Lvl | Stop Burn (Fire) | Stop Burn (Range) |
|------|----------|------------------|-------------------|
| Shrimp | 1 | 34 | 33 |
| Anchovies | 1 | 34 | 33 |
| Sardine | 1 | 38 | 35 |
| Herring | 5 | 41 | 37 |
| Trout | 15 | 49 | 46 |
| Pike | 20 | 54 | 50 |
| Salmon | 25 | 58 | 55 |
| Lobster | 40 | 74 | 74 |
| Swordfish | 45 | 86 | 80 |
| Monkfish | 62 | 92 | 90 |
| Shark | 80 | 99+ | 99+ |

**XP Values:**

| Food | Raw → Cooked | XP |
|------|--------------|-----|
| Shrimp | raw_shrimp → shrimp | 30 |
| Anchovies | raw_anchovies → anchovies | 30 |
| Sardine | raw_sardine → sardine | 40 |
| Herring | raw_herring → herring | 50 |
| Trout | raw_trout → trout | 70 |
| Pike | raw_pike → pike | 80 |
| Salmon | raw_salmon → salmon | 90 |
| Lobster | raw_lobster → lobster | 120 |

**Special Ranges:**
- **Hosidius Kitchen**: 5% success bonus (10% with Elite diary)
- **Lumbridge Range**: Reduced burn for low-level foods (post Cook's Assistant)

**Sources:**
- [OSRS Wiki - Cooking](https://oldschool.runescape.wiki/w/Cooking)
- [OSRS Wiki - Cooking/Burn level](https://oldschool.runescape.wiki/w/Cooking/Burn_level)

---

## Architecture Design

### Module Structure (Matching Gathering System Pattern)

```
packages/shared/src/systems/shared/processing/
├── index.ts                    # Module exports
├── debug.ts                    # Environment-based debug flags
├── types.ts                    # Type definitions
├── FiremakingCalculator.ts     # OSRS firemaking formulas
├── CookingCalculator.ts        # OSRS burn rate calculations
├── LogUtils.ts                 # Log type validation & mapping
├── FoodUtils.ts                # Food type validation & cooking data
├── FireManager.ts              # Fire object lifecycle management
└── README.md                   # Architecture documentation

packages/shared/src/systems/shared/processing/
├── ProcessingSystem.ts         # Main orchestrator (refactored)
└── __tests__/
    ├── ProcessingSystem.test.ts
    ├── ProcessingSystem.integration.test.ts
    ├── FiremakingCalculator.test.ts
    └── CookingCalculator.test.ts

packages/server/src/systems/ServerNetwork/
├── PendingFiremakingManager.ts # Server-side firemaking queue
├── PendingCookingManager.ts    # Server-side cooking queue
└── handlers/
    └── processing.ts           # Network packet handlers
```

### Data-Driven Configuration

**SIMPLIFIED: No New Manifest Files Needed**

The plan originally proposed `logs.json`, `cookables.json`, and `cooking-sources.json`. After analysis, these are **NOT NEEDED** because:

1. **`PROCESSING_CONSTANTS`** (Appendix A) already contains all skill data:
   - `FIREMAKING_LEVELS`, `FIREMAKING_XP`, `FIREMAKING_SUCCESS_RATE`
   - `COOKING_LEVELS`, `COOKING_XP`, `COOKING_BURN_LEVELS`
   - `VALID_LOG_IDS`, `VALID_RAW_FOOD_IDS`

2. **Firemaking/Cooking are PROCESSING skills**, not GATHERING skills:
   - `resources.json` is for world nodes (trees, ores, fishing spots)
   - Processing transforms existing items, doesn't harvest from world
   - Skill data belongs in constants, not manifests

3. **Cooking sources** are trivial:
   - Fires: Always 0 burn reduction (dynamic entities, not manifest data)
   - Ranges: Fixed burn reduction per type (constant)
   - Special ranges: Can use `burnReduction` field in area manifests if needed

**What IS needed in items.json:**
```
packages/server/world/assets/manifests/items.json
├── ADD: Cooked fish items (shrimp, trout, lobster, etc.)
├── ADD: Burnt fish items (burnt_shrimp, burnt_trout, etc.)
├── ADD: Missing log variants (willow_logs, maple_logs, etc.)
└── EXISTING: tinderbox, logs, oak_logs, raw_fish (already present)
```

**Why this is better:**
- Zero new DataManager loading code
- Type-safe constants catch errors at compile time
- Single source of truth for skill mechanics
- Items.json stays focused on item definitions only

**All skill data lives in PROCESSING_CONSTANTS (see Appendix A):**
```typescript
// Example from ProcessingConstants.ts - NO manifest files needed
export const PROCESSING_CONSTANTS = {
  // Level requirements (type-safe, compile-time checked)
  FIREMAKING_LEVELS: { logs: 1, oak_logs: 15, willow_logs: 30, ... },
  COOKING_LEVELS: { raw_shrimp: 1, raw_lobster: 40, raw_shark: 80, ... },

  // XP values (OSRS-accurate)
  FIREMAKING_XP: { logs: 40, oak_logs: 60, willow_logs: 90, ... },
  COOKING_XP: { raw_shrimp: 30, raw_lobster: 120, raw_shark: 210, ... },

  // Burn stop levels (OSRS lookup tables)
  // FUTURE: Add gauntlets field when cooking equipment is implemented
  COOKING_BURN_LEVELS: {
    raw_shrimp: { fire: 34, range: 33 },
    raw_lobster: { fire: 74, range: 74 },
    raw_shark: { fire: 99, range: 99 },
    ...
  },

  // Item ID validation sets
  VALID_LOG_IDS: new Set(["logs", "oak_logs", "willow_logs", ...]),
  VALID_RAW_FOOD_IDS: new Set(["raw_shrimp", "raw_lobster", ...]),
};
```

**Benefits over manifest files:**
- Compile-time type safety (TypeScript catches typos)
- Zero DataManager changes needed
- Single source of truth for mechanics
- Easier to unit test (import directly)

---

## Production Quality Requirements

**CRITICAL**: These requirements are MANDATORY for AAA-quality code. Every phase must adhere to these patterns.

### Memory & Allocation Hygiene

The codebase has strict allocation hygiene patterns. **ALL code must follow these patterns.**

#### Pre-Allocated Reusables Pattern

From existing codebase (`WanderBehavior.ts`, `NPCTickProcessor.ts`, `ClientInput.ts`):

```typescript
// ✅ CORRECT: Pre-allocate at class level
class ProcessingSystem {
  // Pre-allocated temporaries - NEVER allocate in hot paths
  private readonly _tempPosition: Position3D = { x: 0, y: 0, z: 0 };
  private readonly _tempTile: TileCoord = { x: 0, z: 0 };
  private readonly _tempTargetInfo: TargetInfo = {
    type: "idle",
    id: "",
    slot: 0,
    entityType: "",
    position: null,
  };

  // Reusable event payloads - mutate instead of creating new
  private readonly _firemakingPayload = {
    playerId: "",
    logSlot: 0,
    tinderboxSlot: 0,
    position: { x: 0, y: 0, z: 0 },
  };

  private readonly _cookingPayload = {
    playerId: "",
    rawFoodSlot: 0,
    sourceId: "",
    quantity: 0,
  };
}
```

#### Object Pooling (Required for FireEntity)

From existing codebase (`packages/shared/src/utils/pools/EntityPool.ts`):

```typescript
import { EntityPool, PoolableEntity } from "../../utils/pools/EntityPool";

/**
 * FireEntity must implement PoolableEntity interface for pooling.
 */
export class FireEntity extends BaseEntity implements PoolableEntity {
  public id: string = "";
  public position: Position3D = { x: 0, y: 0, z: 0 };
  public createdByPlayerId: string = "";
  public expiresAtTick: number = 0;
  public isActive: boolean = false;

  /**
   * Reset entity to initial state for reuse.
   * Called when entity is acquired from pool.
   */
  reset(): void {
    this.id = "";
    this.position.x = 0;
    this.position.y = 0;
    this.position.z = 0;
    this.createdByPlayerId = "";
    this.expiresAtTick = 0;
    this.isActive = true;
  }

  /**
   * Deactivate entity before returning to pool.
   * Called when entity is released back to pool.
   */
  deactivate(): void {
    this.isActive = false;
    // Remove from scene if has mesh
    if (this.mesh?.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}

/**
 * Fire entity pool - eliminates allocations for fire creation/destruction.
 * Fires are frequently created (firemaking) and destroyed (expiration).
 */
export const fireEntityPool = new EntityPool<FireEntity>({
  factory: () => new FireEntity(),
  initialSize: 50,
  maxSize: 200,
  growthSize: 10,
  name: "fires",
});
```

#### Shared Geometry/Material (Required for Highlights)

```typescript
// ✅ CORRECT: Create once, reuse everywhere
// In a module-level constants file or singleton

// Shared highlight geometry - created ONCE at module load
const HIGHLIGHT_GEOMETRY = new THREE.RingGeometry(0.6, 0.8, 32);
HIGHLIGHT_GEOMETRY.rotateX(-Math.PI / 2);

// Shared highlight material - created ONCE at module load
const HIGHLIGHT_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x00ff00,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,
});

// ✅ CORRECT: Reuse shared geometry/material
private createHighlightMesh(): THREE.Mesh {
  // Uses shared geometry/material - no allocation
  return new THREE.Mesh(HIGHLIGHT_GEOMETRY, HIGHLIGHT_MATERIAL);
}

// ❌ WRONG: Creates new geometry/material each time
private createHighlightMesh(): THREE.Mesh {
  const geometry = new THREE.RingGeometry(0.6, 0.8, 32); // ALLOCATION!
  const material = new THREE.MeshBasicMaterial({...});    // ALLOCATION!
  return new THREE.Mesh(geometry, material);
}
```

#### Zero-Allocation Event Emission

```typescript
// ✅ CORRECT: Mutate pre-allocated payload
private emitFiremakingStart(playerId: string, logSlot: number): void {
  // Mutate existing object instead of creating new
  this._firemakingPayload.playerId = playerId;
  this._firemakingPayload.logSlot = logSlot;
  this._firemakingPayload.tinderboxSlot = this.currentTinderboxSlot;

  this.world.$eventBus.emitEvent({
    type: EventType.FIREMAKING_START,
    payload: this._firemakingPayload,  // Reused object
  });
}

// ❌ WRONG: Creates new object for every event
private emitFiremakingStart(playerId: string, logSlot: number): void {
  this.world.$eventBus.emitEvent({
    type: EventType.FIREMAKING_START,
    payload: { playerId, logSlot },  // NEW ALLOCATION every call!
  });
}
```

---

### Rate Limiting Implementation

**Constants are not enough - must have actual implementation.**

```typescript
/**
 * Rate limiter for processing requests.
 * Prevents spam and ensures fair tick distribution.
 */
export class ProcessingRateLimiter {
  // Pre-allocated Map - no allocations during gameplay
  private readonly lastRequestTick: Map<string, number> = new Map();
  private readonly RATE_LIMIT_TICKS = 1; // Minimum 1 tick between requests

  /**
   * Check if player can make a request.
   * @returns true if allowed, false if rate limited
   */
  canRequest(playerId: string, currentTick: number): boolean {
    const lastTick = this.lastRequestTick.get(playerId);
    if (lastTick !== undefined && currentTick - lastTick < this.RATE_LIMIT_TICKS) {
      return false; // Rate limited
    }
    return true;
  }

  /**
   * Record a request (call after validation passes).
   */
  recordRequest(playerId: string, currentTick: number): void {
    this.lastRequestTick.set(playerId, currentTick);
  }

  /**
   * Clear stale entries (call periodically to prevent memory leak).
   * Removes entries older than 100 ticks.
   */
  cleanup(currentTick: number): void {
    const staleThreshold = currentTick - 100;
    for (const [playerId, tick] of this.lastRequestTick) {
      if (tick < staleThreshold) {
        this.lastRequestTick.delete(playerId);
      }
    }
  }
}
```

---

### Anti-Cheat & Security Validation

**Server must validate ALL client claims. Trust nothing from client.**

```typescript
/**
 * Anti-cheat validation for processing actions.
 * ALL checks run server-side - client is untrusted.
 */
export class ProcessingValidator {
  private readonly COOKING_RANGE_SQ = 4; // 2 tiles squared
  private readonly FIREMAKING_RANGE_SQ = 1; // Must be on tile

  /**
   * Validate firemaking request.
   * Returns error message or null if valid.
   */
  validateFiremaking(
    player: PlayerEntity,
    logSlot: number,
    tinderboxSlot: number,
    currentTick: number
  ): string | null {
    // 1. Inventory validation - items exist in claimed slots
    const logs = player.inventory.getItemAtSlot(logSlot);
    if (!logs || !PROCESSING_CONSTANTS.VALID_LOG_IDS.has(logs.id)) {
      return "Invalid logs";
    }

    const tinderbox = player.inventory.getItemAtSlot(tinderboxSlot);
    if (!tinderbox || tinderbox.id !== "tinderbox") {
      return "Invalid tinderbox";
    }

    // 2. Level validation
    const logData = getLogData(logs.id);
    if (!logData) return "Unknown log type";

    const firemakingLevel = player.stats.getLevel("firemaking");
    if (firemakingLevel < logData.levelRequired) {
      return `Requires level ${logData.levelRequired} Firemaking`;
    }

    // 3. Position validation - can't light fire while moving
    if (player.isMoving()) {
      return "Cannot light fire while moving";
    }

    // 4. Tile validation - tile must be valid for fire
    const tile = worldToTile(player.position);
    if (!this.canPlaceFireAtTile(tile)) {
      return "Cannot light fire here";
    }

    // 5. Existing fire check - can't light on existing fire
    if (this.fireManager.getFireAtTile(tile)) {
      return "Fire already exists here";
    }

    return null; // Valid
  }

  /**
   * Validate cooking request.
   */
  validateCooking(
    player: PlayerEntity,
    rawFoodSlot: number,
    sourceId: string,
    quantity: number
  ): string | null {
    // 1. Inventory validation
    const rawFood = player.inventory.getItemAtSlot(rawFoodSlot);
    if (!rawFood || !PROCESSING_CONSTANTS.VALID_RAW_FOOD_IDS.has(rawFood.id)) {
      return "Invalid raw food";
    }

    // 2. Quantity validation - can't cook more than you have
    const availableQuantity = player.inventory.countItemsById(rawFood.id);
    if (quantity > availableQuantity || quantity < 1) {
      return "Invalid quantity";
    }

    // 3. Level validation
    const foodData = getCookableData(rawFood.id);
    if (!foodData) return "Unknown food type";

    const cookingLevel = player.stats.getLevel("cooking");
    if (cookingLevel < foodData.levelRequired) {
      return `Requires level ${foodData.levelRequired} Cooking`;
    }

    // 4. Cooking source validation - must exist and be in range
    const source = this.getCookingSource(sourceId);
    if (!source) {
      return "Invalid cooking source";
    }

    // 5. Range validation - CRITICAL anti-cheat
    const distSq = this.distanceSquared(player.position, source.position);
    if (distSq > this.COOKING_RANGE_SQ) {
      return "Too far from cooking source";
    }

    // 6. Fire validity - if fire, must still be active
    if (source.type === "fire" && !source.isActive) {
      return "Fire has gone out";
    }

    return null; // Valid
  }

  /**
   * Distance squared (avoids sqrt allocation).
   */
  private distanceSquared(a: Position3D, b: Position3D): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
  }
}
```

---

### Scalability Limits

**Must prevent unbounded growth that could crash server.**

```typescript
// Add to ProcessingConstants
SCALABILITY_LIMITS: {
  // Fire limits
  fire: {
    /** Maximum fires per player (prevents spam) */
    maxPerPlayer: 3,
    /** Maximum fires per 64x64 tile area (prevents area DoS) */
    maxPerArea: 20,
    /** Server-wide fire limit (prevents memory exhaustion) */
    maxGlobal: 500,
    /** Cleanup interval in ticks (removes expired fires) */
    cleanupIntervalTicks: 100,
  },

  // Session limits
  sessions: {
    /** Maximum concurrent firemaking sessions */
    maxFiremakingSessions: 200,
    /** Maximum concurrent cooking sessions */
    maxCookingSessions: 500,
    /** Session timeout in ticks (auto-cancel stale sessions) */
    sessionTimeoutTicks: 50,
  },

  // Area throttling
  area: {
    /** Area size for throttling (64x64 tiles) */
    areaSizeTiles: 64,
    /** Maximum processing actions per area per tick */
    maxActionsPerAreaPerTick: 10,
  },
} as const,
```

**FireManager with Limits:**

```typescript
export class FireManager {
  private readonly fires: Map<string, Fire> = new Map();
  private readonly firesByPlayer: Map<string, Set<string>> = new Map();
  private readonly firesByArea: Map<string, Set<string>> = new Map();

  createFire(playerId: string, position: Position3D): Fire | null {
    const limits = PROCESSING_CONSTANTS.SCALABILITY_LIMITS.fire;

    // Check player limit
    const playerFires = this.firesByPlayer.get(playerId);
    if (playerFires && playerFires.size >= limits.maxPerPlayer) {
      return null; // Player limit reached
    }

    // Check area limit
    const areaKey = this.getAreaKey(position);
    const areaFires = this.firesByArea.get(areaKey);
    if (areaFires && areaFires.size >= limits.maxPerArea) {
      return null; // Area limit reached
    }

    // Check global limit
    if (this.fires.size >= limits.maxGlobal) {
      return null; // Global limit reached
    }

    // Create fire using pool
    const fire = fireEntityPool.acquire();
    fire.id = generateId();
    fire.position.x = position.x;
    fire.position.y = position.y;
    fire.position.z = position.z;
    fire.createdByPlayerId = playerId;
    fire.expiresAtTick = this.currentTick + this.getRandomDuration();
    fire.isActive = true;

    // Track in all indexes
    this.fires.set(fire.id, fire);
    this.addToPlayerIndex(playerId, fire.id);
    this.addToAreaIndex(areaKey, fire.id);

    return fire;
  }

  /**
   * Cleanup expired fires - call every cleanupIntervalTicks.
   */
  cleanup(currentTick: number): void {
    for (const [fireId, fire] of this.fires) {
      if (currentTick >= fire.expiresAtTick) {
        this.extinguishFire(fireId);
      }
    }
  }

  private getAreaKey(position: Position3D): string {
    const areaSize = PROCESSING_CONSTANTS.SCALABILITY_LIMITS.area.areaSizeTiles;
    const ax = Math.floor(position.x / areaSize);
    const az = Math.floor(position.z / areaSize);
    return `${ax},${az}`;
  }
}
```

---

### Error Handling Patterns

**All operations must handle errors gracefully. Never crash the tick loop.**

```typescript
/**
 * Safe wrapper for processing operations.
 * Catches errors and logs without crashing tick loop.
 */
export function safeProcessTick<T>(
  operation: () => T,
  context: string,
  logger: Logger
): T | null {
  try {
    return operation();
  } catch (error) {
    logger.error(`[${context}] Error in tick processing`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}

// Usage in ProcessingSystem
processTick(currentTick: number): void {
  // Process firemaking sessions
  for (const [playerId, session] of this.firemakingSessions) {
    safeProcessTick(
      () => this.processFiremakingSession(session, currentTick),
      `Firemaking:${playerId}`,
      this.logger
    );
  }

  // Process cooking sessions
  for (const [playerId, session] of this.cookingSessions) {
    safeProcessTick(
      () => this.processCookingSession(session, currentTick),
      `Cooking:${playerId}`,
      this.logger
    );
  }
}

/**
 * Error response to client.
 */
private sendError(
  playerId: string,
  errorCode: ProcessingErrorCode,
  message: string
): void {
  this.world.$eventBus.emitEvent({
    type: EventType.PROCESSING_ERROR,
    payload: {
      playerId,
      errorCode,
      message,
      timestamp: this.currentTick,
    },
  });
}

// Error codes enum
export enum ProcessingErrorCode {
  INVALID_ITEM = "INVALID_ITEM",
  LEVEL_TOO_LOW = "LEVEL_TOO_LOW",
  OUT_OF_RANGE = "OUT_OF_RANGE",
  RATE_LIMITED = "RATE_LIMITED",
  LIMIT_REACHED = "LIMIT_REACHED",
  FIRE_EXPIRED = "FIRE_EXPIRED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
}
```

---

## Implementation Phases

### Phase 1: Foundation & Data Layer (Day 1-2)

**Tasks:**
1. Create `PROCESSING_CONSTANTS` in `ProcessingConstants.ts` (see Appendix A)
2. Create type definitions in `processing/types.ts`
3. Create `processing/debug.ts` with environment flag
4. Add all cooked/burnt fish items to `items.json` (see Appendix I)
5. Add missing log items (willow_logs, maple_logs, etc.) to `items.json`
6. FUTURE: Add cooking equipment to `items.json` (cooking_gauntlets, cooking_cape)

**Deliverables:**
- [ ] `ProcessingConstants.ts` with all OSRS-accurate values
- [ ] `items.json` updated with cooked fish (11 items)
- [ ] `items.json` updated with burnt fish (11 items)
- [ ] `items.json` updated with missing logs (5 items)
- [ ] FUTURE: `items.json` updated with cooking equipment (gauntlets, cape)
- [ ] Type definitions for `FiremakingSession`, `CookingSession`, `ProcessingTuning`

**NO NEW MANIFEST FILES** - All skill data in `PROCESSING_CONSTANTS` (type-safe, no DataManager changes)

---

### Phase 2: Calculator Modules (Day 2-3)

**FiremakingCalculator.ts:**
```typescript
export function calculateFiremakingSuccess(level: number): number {
  // OSRS formula: 65/256 at level 1, 513/256 at level 99
  const low = 65;
  const high = 513;
  const successNumerator = low + (high - low) * (level - 1) / 98;
  return Math.min(successNumerator / 256, 1.0);
}

export function getLogData(logId: string): LogData | null;
export function getFiremakingXP(logId: string): number;
export function meetsFiremakingLevel(level: number, logId: string): boolean;
```

**CookingCalculator.ts:**
```typescript
export function calculateBurnChance(
  cookingLevel: number,
  food: CookableData,
  source: CookingSource
  // FUTURE: hasGauntlets: boolean, hasCape: boolean
): number {
  // FUTURE: Cooking cape = never burn
  // if (hasCape) return 0;

  // Get stop-burn level based on source type (fire vs range)
  const stopBurnLevel = getStopBurnLevel(food, source);

  if (cookingLevel >= stopBurnLevel) return 0;

  // Linear interpolation between levelRequired and stopBurnLevel
  const range = stopBurnLevel - food.levelRequired;
  const progress = cookingLevel - food.levelRequired;
  return Math.max(0, 1 - (progress / range));
}

export function getCookableData(rawItemId: string): CookableData | null;
export function getCookingXP(rawItemId: string): number;
export function meetsCookingLevel(level: number, rawItemId: string): boolean;
```

**Deliverables:**
- [ ] `FiremakingCalculator.ts` with OSRS formula
- [ ] `CookingCalculator.ts` with burn rate lookup
- [ ] `LogUtils.ts` for log validation
- [ ] `FoodUtils.ts` for food validation
- [ ] Unit tests for all calculators (target: 30+ tests)

---

### Phase 3: Fire Manager (Day 3-4)

**FireManager.ts:**
- Manages fire object lifecycle
- Handles fire placement with OSRS walk-west behavior
- Tracks fire duration with random variance
- Provides fire lookup by position/range

```typescript
export class FireManager {
  private fires: Map<string, Fire> = new Map();

  createFire(playerId: string, position: Position3D): Fire;
  getFireAtPosition(position: Position3D): Fire | null;
  getFiresInRange(position: Position3D, range: number): Fire[];
  extinguishFire(fireId: string): void;

  // OSRS walk-west behavior
  calculatePostFirePosition(
    playerPos: Position3D,
    world: World
  ): Position3D;
}
```

**Fire Duration (TICK-BASED):**
```typescript
// Random duration in TICKS (OSRS-accurate per Mod Ash)
// 60 seconds = 100 ticks, 119 seconds = 198 ticks (at 600ms/tick)
const { minDurationTicks, maxDurationTicks } = PROCESSING_CONSTANTS.FIRE;
const durationTicks = minDurationTicks +
  Math.floor(Math.random() * (maxDurationTicks - minDurationTicks + 1));

// Fire expires at: currentTick + durationTicks
fire.expiresAtTick = this.currentTick + durationTicks;
```

**Deliverables:**
- [ ] `FireManager.ts` with full lifecycle management
- [ ] OSRS walk-west movement calculation
- [ ] Fire entity visual (improved from orange cube)
- [ ] Unit tests for fire manager

---

### Phase 4: Tick-Based Processing (Day 4-5)

**Refactor ProcessingSystem.ts:**
- Remove all `setTimeout` usage
- Integrate with game tick system (600ms)
- Add tick counter for action progress
- Support action cancellation (movement, combat)

```typescript
interface ProcessingSession {
  playerId: string;
  actionType: 'firemaking' | 'cooking';
  startTick: number;
  targetTicks: number;  // 4 ticks for firemaking, 4 for cooking
  itemId: string;
  targetId?: string;    // fireId for cooking, null for firemaking
  cachedSuccessRate?: number;
}

// In update() - called every tick
processFiremakingTick(session: ProcessingSession): void {
  const elapsed = currentTick - session.startTick;

  if (elapsed >= session.targetTicks) {
    // Roll success using cached rate
    if (Math.random() < session.cachedSuccessRate) {
      this.completeFiremaking(session);
    } else {
      // Failed - retry immediately (OSRS behavior)
      session.startTick = currentTick;
    }
  }
}
```

**Deliverables:**
- [ ] Tick-based firemaking (4 ticks)
- [ ] Tick-based cooking (4 ticks)
- [ ] Session management like ResourceSystem
- [ ] Movement cancellation
- [ ] Integration tests

---

### Phase 5: Server-Authoritative Validation (Day 5-6)

**PendingFiremakingManager.ts:**
```typescript
export class PendingFiremakingManager {
  queueFiremaking(
    playerId: string,
    logSlot: number,
    tinderboxSlot: number,
    currentTick: number
  ): void;

  processTick(currentTick: number): void;
  cancelPending(playerId: string): void;
}
```

**PendingCookingManager.ts:**
```typescript
export class PendingCookingManager {
  queueCooking(
    playerId: string,
    rawFoodSlot: number,
    cookingSourceId: string,  // fire or range
    currentTick: number
  ): void;

  processTick(currentTick: number): void;
  cancelPending(playerId: string): void;
}
```

**Validation Checks:**
1. Player has required items in inventory
2. Player has required level
3. Player is in range of cooking source
4. Cooking source is valid (fire active, range exists)
5. Rate limiting (1 tick minimum between requests)

**Deliverables:**
- [ ] Server-side pending managers
- [ ] Rate limiting (matches gathering system)
- [ ] Position validation
- [ ] Inventory validation
- [ ] Integration with event-bridge

---

### Phase 6: Item Targeting & Interaction System (Day 6-8)

**CRITICAL**: This phase implements the missing "Use [item] on [target]" system that enables firemaking and cooking interactions.

#### 6.1: ItemTargetingSystem Architecture

The current `InventoryInteractionSystem.ts` has a "Use" action that only emits `UI_MESSAGE`. We need a complete item-on-target selection system:

```
packages/shared/src/systems/shared/interaction/
├── ItemTargetingSystem.ts      # NEW: Core targeting state machine
├── TargetValidator.ts          # NEW: Validates item+target combinations
├── TargetingCursor.ts          # NEW: Visual cursor/highlight management
└── types.ts                    # Extended with targeting types
```

**State Machine Flow:**
```
[IDLE] → "Use" clicked → [SELECTING_TARGET] → valid target clicked → [EXECUTING]
                              ↓
                    ESC/right-click → [IDLE]
```

**ItemTargetingSystem.ts Core:**
```typescript
export type TargetingState = "idle" | "selecting_target" | "executing";
export type TargetType = "inventory_item" | "world_entity" | "ground_tile";

interface TargetingContext {
  state: TargetingState;
  sourceItem: { id: string; slot: number } | null;
  validTargetTypes: TargetType[];
  validTargetIds: Set<string>;  // e.g., valid log IDs, fire entity IDs
  onTargetSelected: ((target: TargetInfo) => void) | null;
}

export class ItemTargetingSystem {
  private context: TargetingContext = { state: "idle", ... };

  /**
   * Enter targeting mode when player clicks "Use" on an item.
   * Called from InventoryInteractionSystem's "Use" action.
   */
  startTargeting(
    sourceItem: { id: string; slot: number },
    validTargets: TargetType[],
    validTargetIds: Set<string>,
    onSelect: (target: TargetInfo) => void
  ): void;

  /**
   * Called when player clicks during targeting mode.
   * Validates target and executes callback if valid.
   */
  handleClick(clickInfo: ClickInfo): boolean;

  /**
   * Cancel targeting (ESC, right-click, movement).
   */
  cancelTargeting(): void;

  /**
   * Check if a target would be valid for current context.
   * Used for highlighting valid targets.
   */
  isValidTarget(targetInfo: TargetInfo): boolean;
}
```

#### 6.2: Firemaking Interaction Flow

**Complete Flow: Tinderbox → Logs**

```
1. Player right-clicks tinderbox in inventory
2. Context menu shows: "Use", "Drop", "Examine"
3. Player clicks "Use"
4. ItemTargetingSystem.startTargeting({
     sourceItem: { id: "tinderbox", slot: 5 },
     validTargets: ["inventory_item"],
     validTargetIds: VALID_LOG_IDS,  // from ProcessingConstants
     onSelect: handleFiremakingTarget
   })
5. Cursor changes to targeting cursor (crosshair + tinderbox icon)
6. Valid log items in inventory get highlight effect
7. Player clicks on logs in inventory slot 12
8. ItemTargetingSystem validates: logs ∈ VALID_LOG_IDS ✓
9. handleFiremakingTarget() called with target info
10. Client sends packet: firemakingRequest { logSlot: 12, tinderboxSlot: 5 }
11. Server validates and creates FiremakingSession
```

**InventoryInteractionSystem Integration:**
```typescript
// In registerDefaultActions(), modify the "Use" action for tools:
this.registerAction("tool", {
  id: "use",
  label: "Use",
  priority: 1,
  condition: (item) => item.type === ItemType.TOOL,
  callback: (playerId, itemId, slot) => {
    const item = this.getItemById(itemId);
    if (!item) return;

    // Determine valid targets based on tool type
    if (item.toolCategory === "firemaking") {
      // Tinderbox - targets logs in inventory
      this.itemTargetingSystem.startTargeting(
        { id: itemId, slot },
        ["inventory_item"],
        PROCESSING_CONSTANTS.VALID_LOG_IDS,
        (target) => this.handleFiremakingUse(playerId, slot, target)
      );
    }
    // ... other tool types
  },
});
```

#### 6.3: Cooking Interaction Flow

**Complete Flow: Raw Fish → Fire/Range**

```
1. Player right-clicks raw_shrimp in inventory
2. Context menu shows: "Use", "Drop", "Examine"
3. Player clicks "Use"
4. ItemTargetingSystem.startTargeting({
     sourceItem: { id: "raw_shrimp", slot: 8 },
     validTargets: ["world_entity"],
     validTargetIds: activeFires ∪ rangeEntityIds,
     onSelect: handleCookingTarget
   })
5. Cursor changes to targeting cursor (crosshair + fish icon)
6. Valid fire/range entities in world get highlight effect
7. Player clicks on fire entity in world
8. ItemTargetingSystem validates: fire.id ∈ validTargetIds ✓
9. handleCookingTarget() called with target info
10. UI opens "Cook" interface: quantity selector, "Cook All", "Cook X", "Cook 1"
11. Player selects quantity → client sends cookingRequest packet
12. Server validates and creates CookingSession
```

**Alternative Flow: Raw Fish Context Menu on Fire**
```
1. Player right-clicks fire entity in world (with raw fish in inventory)
2. Context menu shows: "Cook [Raw Shrimp]", "Cook [Raw Trout]", ...
3. Player clicks "Cook [Raw Shrimp]"
4. UI opens "Cook" interface directly
5. Player selects quantity → sends cookingRequest
```

#### 6.4: Fire Entity as Interactable World Object

**FireEntity.ts (extends BaseEntity):**
```typescript
export class FireEntity extends BaseEntity {
  public readonly entityType = "fire";
  public readonly isInteractable = true;

  // Fire-specific data
  public createdByPlayerId: string;
  public expiresAtTick: number;
  public isActive: boolean = true;

  /**
   * Get context menu actions for this fire.
   * Called by InteractionSystem when player right-clicks.
   */
  getContextMenuActions(player: PlayerEntity): ContextMenuAction[] {
    const actions: ContextMenuAction[] = [];

    // Add "Cook [item]" for each raw food in player inventory
    const rawFoods = player.inventory.getItemsByPredicate(
      item => PROCESSING_CONSTANTS.VALID_RAW_FOOD_IDS.has(item.id)
    );

    for (const food of rawFoods) {
      actions.push({
        id: `cook_${food.id}`,
        label: `Cook ${food.name}`,
        priority: 10,
        handler: () => this.startCooking(player, food),
      });
    }

    actions.push({
      id: "examine",
      label: "Examine",
      priority: 0,
      handler: () => this.examine(player),
    });

    return actions;
  }
}
```

**Fire Visual Component:**
```typescript
// Fire uses particle system + point light, not just orange cube
export function createFireVisual(): THREE.Group {
  const group = new THREE.Group();

  // Animated fire mesh (billboard sprite or particle system)
  const fireSprite = createFireSprite(); // Animated texture
  group.add(fireSprite);

  // Dynamic point light
  const light = new THREE.PointLight(0xff6600, 1, 5);
  light.position.set(0, 0.5, 0);
  group.add(light);

  // Highlight mesh for targeting mode (hidden by default)
  const highlightMesh = createHighlightRing();
  highlightMesh.visible = false;
  highlightMesh.name = "targetHighlight";
  group.add(highlightMesh);

  return group;
}
```

#### 6.5: Range Entity as Permanent Cooking Station

**RangeEntity.ts:**
```typescript
export class RangeEntity extends BaseEntity {
  public readonly entityType = "range";
  public readonly isInteractable = true;
  public readonly isPermanent = true;  // Doesn't expire like fires

  // Range bonus (reduces burn rate)
  public burnReduction: number = 0;  // Standard range
  // Special ranges: Hosidius = 0.05, Lumbridge = varies

  getContextMenuActions(player: PlayerEntity): ContextMenuAction[] {
    // Same pattern as FireEntity
    const actions: ContextMenuAction[] = [];

    const rawFoods = player.inventory.getItemsByPredicate(
      item => PROCESSING_CONSTANTS.VALID_RAW_FOOD_IDS.has(item.id)
    );

    for (const food of rawFoods) {
      actions.push({
        id: `cook_${food.id}`,
        label: `Cook ${food.name}`,
        priority: 10,
        handler: () => this.startCooking(player, food),
      });
    }

    return actions;
  }
}
```

**Range Placement in World:**
```json
// In world area manifest (e.g., lumbridge.json)
{
  "entities": [
    {
      "type": "range",
      "id": "lumbridge_range_1",
      "position": { "x": 123, "y": 0, "z": 456 },
      "burnReduction": 0.03,
      "name": "Lumbridge Range"
    }
  ]
}
```

#### 6.6: Target Selection Visual Feedback

**Cursor States:**
```typescript
export enum CursorState {
  DEFAULT = "default",
  TARGETING_ITEM = "targeting_item",      // Selecting inventory item
  TARGETING_ENTITY = "targeting_entity",  // Selecting world entity
  TARGETING_INVALID = "targeting_invalid" // Hovering invalid target
}

// CSS cursor definitions
const CURSOR_STYLES = {
  [CursorState.DEFAULT]: "default",
  [CursorState.TARGETING_ITEM]: "url(/cursors/use-item.png) 16 16, crosshair",
  [CursorState.TARGETING_ENTITY]: "url(/cursors/use-entity.png) 16 16, crosshair",
  [CursorState.TARGETING_INVALID]: "not-allowed",
};
```

**Highlight Effects:**
```typescript
// Valid target highlighting during targeting mode
export class TargetHighlighter {
  private highlightedEntities: Set<string> = new Set();

  highlightValidTargets(validIds: Set<string>): void {
    for (const entityId of validIds) {
      const entity = this.world.getEntity(entityId);
      if (entity?.mesh) {
        // Add pulsing outline effect
        this.addHighlightEffect(entity.mesh);
        this.highlightedEntities.add(entityId);
      }
    }
  }

  clearHighlights(): void {
    for (const entityId of this.highlightedEntities) {
      const entity = this.world.getEntity(entityId);
      if (entity?.mesh) {
        this.removeHighlightEffect(entity.mesh);
      }
    }
    this.highlightedEntities.clear();
  }

  // For inventory items, highlight slots
  highlightInventorySlots(validItemIds: Set<string>): void {
    // Dispatch event for React inventory UI
    window.dispatchEvent(new CustomEvent("inventory:highlightSlots", {
      detail: { validItemIds }
    }));
  }
}
```

#### 6.7: Cook Interface UI

**CookInterface.tsx:**
```tsx
interface CookInterfaceProps {
  food: CookableData;
  source: CookingSource;
  maxQuantity: number;
  onCook: (quantity: number) => void;
  onClose: () => void;
}

export function CookInterface({ food, source, maxQuantity, onCook, onClose }: CookInterfaceProps) {
  const [quantity, setQuantity] = useState(maxQuantity);

  return (
    <Dialog onClose={onClose}>
      <Header>
        <ItemIcon itemId={food.id} />
        <Title>Cook {food.name}</Title>
      </Header>

      <QuantitySelector
        value={quantity}
        max={maxQuantity}
        onChange={setQuantity}
      />

      <ButtonRow>
        <Button onClick={() => onCook(1)}>Cook 1</Button>
        <Button onClick={() => onCook(quantity)}>Cook {quantity}</Button>
        <Button onClick={() => onCook(maxQuantity)}>Cook All</Button>
      </ButtonRow>

      <InfoText>
        Cooking on: {source.type === "fire" ? "Fire" : "Range"}
        {source.burnReduction > 0 && ` (-${source.burnReduction * 100}% burn)`}
      </InfoText>
    </Dialog>
  );
}
```

#### 6.8: Progress Indicator

**ProcessingProgressBar.tsx:**
```tsx
interface ProcessingProgressProps {
  skill: "firemaking" | "cooking";
  itemName: string;
  progress: number;  // 0-1
  onCancel: () => void;
}

export function ProcessingProgressBar({ skill, itemName, progress, onCancel }: ProcessingProgressProps) {
  const label = skill === "firemaking"
    ? `Lighting ${itemName}...`
    : `Cooking ${itemName}...`;

  return (
    <ProgressContainer>
      <Label>{label}</Label>
      <ProgressBar value={progress} />
      <CancelButton onClick={onCancel}>Cancel</CancelButton>
    </ProgressContainer>
  );
}
```

#### Phase 6 Deliverables

- [ ] `ItemTargetingSystem.ts` - Core targeting state machine
- [ ] `TargetValidator.ts` - Item+target validation rules
- [ ] `TargetHighlighter.ts` - Visual highlighting for valid targets
- [ ] Modify `InventoryInteractionSystem.ts` - Integrate targeting for "Use" action
- [ ] `FireEntity.ts` - Fire as interactable world entity with context menu
- [ ] `RangeEntity.ts` - Range as permanent cooking station
- [ ] Fire visual (particle system + point light)
- [ ] Range visual (3D model)
- [ ] Custom cursors for targeting mode
- [ ] Inventory slot highlighting for valid targets
- [ ] `CookInterface.tsx` - Quantity selection UI
- [ ] `ProcessingProgressBar.tsx` - Progress indicator
- [ ] Register Fire/Range in entity factory
- [ ] Add ranges to world area manifests
- [ ] OSRS-style chat messages

---

### Phase 7: Testing & Polish (Day 7-8)

**Test Coverage Targets:**

| Module | Target Tests |
|--------|-------------|
| FiremakingCalculator | 15 |
| CookingCalculator | 20 |
| FireManager | 15 |
| ProcessingSystem | 25 |
| Integration | 15 |
| **Total** | **90+** |

**Test Scenarios:**
1. Firemaking success at various levels
2. Firemaking failure and retry
3. Fire placement walk-west behavior
4. Cooking burn rates at threshold levels
5. Cooking on fire vs range
6. Movement cancellation
7. Multi-item cooking (cook all)
8. FUTURE: Cooking with gauntlets vs without
9. Fire expiration during cooking
10. Level requirement validation

**Deliverables:**
- [ ] 90+ unit/integration tests
- [ ] README.md documentation
- [ ] Debug logging with environment flag
- [ ] Performance profiling

---

## New Items Required

### Items to Add to items.json

**Cooked Fish:**
```json
{ "id": "shrimp", "name": "Shrimp", "type": "food", "healAmount": 3 },
{ "id": "anchovies", "name": "Anchovies", "type": "food", "healAmount": 1 },
{ "id": "sardine", "name": "Sardine", "type": "food", "healAmount": 4 },
{ "id": "herring", "name": "Herring", "type": "food", "healAmount": 5 },
{ "id": "trout", "name": "Trout", "type": "food", "healAmount": 7 },
{ "id": "pike", "name": "Pike", "type": "food", "healAmount": 8 },
{ "id": "salmon", "name": "Salmon", "type": "food", "healAmount": 9 },
{ "id": "lobster", "name": "Lobster", "type": "food", "healAmount": 12 }
```

**Burnt Fish:**
```json
{ "id": "burnt_shrimp", "name": "Burnt Shrimp", "type": "junk" },
{ "id": "burnt_anchovies", "name": "Burnt Anchovies", "type": "junk" },
{ "id": "burnt_sardine", "name": "Burnt Sardine", "type": "junk" },
{ "id": "burnt_herring", "name": "Burnt Herring", "type": "junk" },
{ "id": "burnt_trout", "name": "Burnt Trout", "type": "junk" },
{ "id": "burnt_pike", "name": "Burnt Pike", "type": "junk" },
{ "id": "burnt_salmon", "name": "Burnt Salmon", "type": "junk" },
{ "id": "burnt_lobster", "name": "Burnt Lobster", "type": "junk" }
```

**Log Types:**
```json
{ "id": "oak_logs", "name": "Oak Logs", "type": "resource" },
{ "id": "willow_logs", "name": "Willow Logs", "type": "resource" },
{ "id": "maple_logs", "name": "Maple Logs", "type": "resource" },
{ "id": "yew_logs", "name": "Yew Logs", "type": "resource" },
{ "id": "magic_logs", "name": "Magic Logs", "type": "resource" },
{ "id": "redwood_logs", "name": "Redwood Logs", "type": "resource" }
```

**Tools:**
```json
{ "id": "tinderbox", "name": "Tinderbox", "type": "tool", "toolCategory": "firemaking" }
```

**Equipment (FUTURE):**
```
// NOT IN INITIAL IMPLEMENTATION
// cooking_gauntlets, cooking_cape - add in future update
```

---

## Event Types Required

Add to `event-types.ts`:
```typescript
// === Item Targeting System ===
TARGETING_START = "targeting:start",
TARGETING_COMPLETE = "targeting:complete",
TARGETING_CANCEL = "targeting:cancel",

// === Firemaking ===
FIREMAKING_REQUEST = "firemaking:request",    // Client → Server
FIREMAKING_START = "firemaking:start",
FIREMAKING_SUCCESS = "firemaking:success",
FIREMAKING_FAILURE = "firemaking:failure",
FIRE_CREATED = "fire:created",
FIRE_EXTINGUISHED = "fire:extinguished",

// === Cooking ===
COOKING_REQUEST = "cooking:request",          // Client → Server
COOKING_START = "cooking:start",
COOKING_SUCCESS = "cooking:success",
COOKING_BURN = "cooking:burn",
COOKING_COMPLETE = "cooking:complete",        // Batch complete

// === Processing (generic) ===
PROCESSING_CANCEL = "processing:cancel",
```

---

## Network Packets Required

Add to `packets.ts`:
```typescript
// Client → Server
firemakingRequest: { logSlot: number; tinderboxSlot: number };
cookingRequest: { rawFoodSlot: number; sourceId: string; quantity: number };
cookingCancel: {};

// Server → Client
firemakingStart: { playerId: string; logType: string; targetTicks: number };
firemakingComplete: { playerId: string; fireId: string; position: Position3D };
cookingStart: { playerId: string; foodType: string; quantity: number };
cookingProgress: { playerId: string; cooked: number; burnt: number; remaining: number };
cookingComplete: { playerId: string; results: CookingResult[] };
fireCreated: { fireId: string; position: Position3D; createdBy: string };
fireExtinguished: { fireId: string };
```

---

## Success Metrics (9/10 Production Quality)

### Code Quality Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Test Coverage | 120+ tests (90 unit + 30 integration) | `npm test --coverage` |
| OSRS Accuracy | Formulas match wiki exactly | Manual wiki comparison |
| Tick Precision | 600ms ± 10ms | Performance profiling |
| Code Modularity | 8+ pure utility modules | File count |
| Documentation | README + JSDoc all exports | ESLint doc rules |
| Type Safety | 0 `any` types | ESLint `@typescript-eslint/no-explicit-any` |

### Memory & Performance Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Allocations per tick | 0 in hot paths | Heap profiler |
| GC pressure | <5ms GC pause during gameplay | Chrome DevTools |
| Tick processing time | <1ms for 100 concurrent sessions | Performance.now() |
| Fire entity pooling | 100% pool reuse after warmup | EntityPool.getStats() |
| Memory leak | <10% growth over 1 hour | Long-running test |

### Security Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Server validation | 100% of actions validated server-side | Code audit |
| Rate limiting | All endpoints rate limited | Integration test |
| Range checks | All cooking sources range-validated | Integration test |
| Inventory checks | All item operations validated | Integration test |

### Scalability Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Concurrent fires | 500 server-wide without degradation | Load test |
| Fire cleanup | <10ms for 500 fire expiration check | Performance profiling |
| Concurrent sessions | 200 firemaking + 500 cooking | Load test |
| FPS with 50 fires | >55 FPS | Playwright FPS test |

### Integration Test Coverage

| Test Category | Required Tests | Status |
|---------------|----------------|--------|
| Firemaking flow | 5 | - |
| Cooking flow | 5 | - |
| Anti-cheat | 3 | - |
| Performance | 2 | - |
| Rate limiting | 2 | - |
| Fire limits | 2 | - |
| Error handling | 3 | - |
| **Total Integration** | **22** | - |

---

## Risk Mitigation

| Risk | Mitigation | Verification |
|------|-----------|--------------|
| Burn formula inaccuracy | Use lookup tables, not formula estimation | Unit tests at boundary levels |
| Fire visual performance | LOD system, max fire limit per area | 50-fire FPS test |
| Race conditions | Server-authoritative with tick synchronization | Multi-client integration test |
| Inventory desync | Event-based validation before each action | Rapid request spam test |
| Memory leaks | EntityPool for fires, pre-allocated temporaries | 1-hour memory test |
| DoS via fire spam | Per-player, per-area, global limits | Limit enforcement test |
| Position spoofing | Server-side range validation | Out-of-range request test |

---

## Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | 1-2 days | Data layer & manifests |
| Phase 2 | 1-2 days | Calculator modules |
| Phase 3 | 1-2 days | Fire manager |
| Phase 4 | 1-2 days | Tick-based processing |
| Phase 5 | 1-2 days | Server validation |
| Phase 6 | 2-3 days | **Item Targeting System, Fire/Range entities, UI** |
| Phase 7 | 1-2 days | Testing & polish |
| **Total** | **9-16 days** | |

**Phase 6 Expanded Scope:**
Phase 6 now includes the critical `ItemTargetingSystem` that enables "Use [item] on [target]" interactions. This is the most complex phase as it requires:
- New `ItemTargetingSystem` state machine
- Fire & Range entities as interactable world objects
- Target highlighting system (inventory + world)
- Cook interface UI with quantity selection
- Integration with existing `InventoryInteractionSystem`

---

## References

- [OSRS Wiki - Firemaking](https://oldschool.runescape.wiki/w/Firemaking)
- [OSRS Wiki - Cooking](https://oldschool.runescape.wiki/w/Cooking)
- [OSRS Wiki - Cooking/Burn level](https://oldschool.runescape.wiki/w/Cooking/Burn_level)
- [OSRS Wiki - Tick manipulation](https://oldschool.runescape.wiki/w/Tick_manipulation)
- [OSRS Wiki - Pay-to-play Firemaking training](https://oldschool.runescape.wiki/w/Pay-to-play_Firemaking_training)
- [OSRS Wiki - Pay-to-play Cooking training](https://oldschool.runescape.wiki/w/Pay-to-play_Cooking_training)

---

## Appendix A: ProcessingConstants.ts (Critical - Matches GatheringConstants Pattern)

This file is **CRITICAL** for AAA quality. It must match the pattern of `GatheringConstants.ts`:

```typescript
/**
 * Processing Constants
 *
 * Centralized constants for firemaking and cooking systems.
 * OSRS-accurate timing and values.
 *
 * @see https://oldschool.runescape.wiki/w/Firemaking
 * @see https://oldschool.runescape.wiki/w/Cooking
 */

export const PROCESSING_CONSTANTS = {
  // === Skill-Specific Mechanics (OSRS-accurate) ===
  /**
   * FIREMAKING: Fixed 4-tick attempts, level affects success rate
   * COOKING: Fixed 4-tick per item, level affects burn rate
   */
  SKILL_MECHANICS: {
    firemaking: {
      type: "fixed-roll-retry-on-fail" as const,
      /** Attempt to light every 4 ticks */
      baseRollTicks: 4,
      /** On failure, retry immediately (next 4 ticks) */
      retryOnFail: true,
      /** Success rate varies by level */
      levelAffectsSuccess: true,
    },
    cooking: {
      type: "fixed-tick-continuous" as const,
      /** Each item takes 4 ticks to cook */
      ticksPerItem: 4,
      /** Level affects burn chance, not speed */
      levelAffectsBurn: true,
      levelAffectsSpeed: false,
    },
  } as const,

  // === Firemaking Success Rates (OSRS formula) ===
  /**
   * OSRS Firemaking: 65/256 at level 1, 513/256 at level 99
   * 100% success reached at level 43
   *
   * @see https://oldschool.runescape.wiki/w/Firemaking
   */
  FIREMAKING_SUCCESS_RATE: {
    low: 65,   // Numerator at level 1 (65/256 = 25.4%)
    high: 513, // Numerator at level 99 (capped to 100%)
  },

  // === Fire Properties ===
  FIRE: {
    /** Minimum fire duration in ticks (60 seconds) - OSRS per Mod Ash */
    minDurationTicks: 100,
    /** Maximum fire duration in ticks (119 seconds) - OSRS per Mod Ash */
    maxDurationTicks: 198,
    /** Maximum fires per player */
    maxFiresPerPlayer: 3,
    /** Maximum fires per tile area (performance limit) */
    maxFiresPerArea: 20,
    /** Fire interaction range in tiles */
    interactionRange: 1,
  },

  // === Walk-West Movement Priority (OSRS) ===
  /**
   * After lighting fire, player walks in this priority order:
   * 1. West (preferred)
   * 2. East (if west blocked)
   * 3. South (if east blocked)
   * 4. North (if south blocked)
   */
  FIRE_WALK_PRIORITY: ["west", "east", "south", "north"] as const,

  // === Cooking Burn Levels (OSRS lookup tables) ===
  /**
   * Stop-burn levels by food type.
   * Format: { fire: level, range: level }
   * FUTURE: Add gauntlets field when cooking equipment is implemented
   */
  COOKING_BURN_LEVELS: {
    // OSRS-accurate stop-burn levels (verified against wiki 2025)
    // Note: Range generally burns less than fire
    raw_shrimp: { fire: 34, range: 33 },
    raw_anchovies: { fire: 34, range: 33 },
    raw_sardine: { fire: 38, range: 35 },
    raw_herring: { fire: 41, range: 37 },
    raw_trout: { fire: 49, range: 46 },      // Wiki: fire=49
    raw_pike: { fire: 54, range: 50 },       // Wiki: fire=54
    raw_salmon: { fire: 58, range: 55 },
    raw_lobster: { fire: 74, range: 74 },    // Wiki: range=74 (same as fire)
    raw_swordfish: { fire: 86, range: 80 },  // Wiki: range=80
    raw_monkfish: { fire: 92, range: 90 },
    raw_shark: { fire: 99, range: 99 },
  } as const,

  // === XP Values ===
  FIREMAKING_XP: {
    logs: 40,
    oak_logs: 60,
    willow_logs: 90,
    teak_logs: 105,
    maple_logs: 135,
    mahogany_logs: 157.5,
    yew_logs: 202.5,
    magic_logs: 303.8,
    redwood_logs: 350,
  } as const,

  COOKING_XP: {
    raw_shrimp: 30,
    raw_anchovies: 30,
    raw_sardine: 40,
    raw_herring: 50,
    raw_trout: 70,
    raw_pike: 80,
    raw_salmon: 90,
    raw_lobster: 120,
    raw_swordfish: 140,
    raw_monkfish: 150,
    raw_shark: 210,
  } as const,

  // === Level Requirements ===
  FIREMAKING_LEVELS: {
    logs: 1,
    oak_logs: 15,
    willow_logs: 30,
    teak_logs: 35,
    maple_logs: 45,
    mahogany_logs: 50,
    yew_logs: 60,
    magic_logs: 75,
    redwood_logs: 90,
  } as const,

  COOKING_LEVELS: {
    raw_shrimp: 1,
    raw_anchovies: 1,
    raw_sardine: 1,
    raw_herring: 5,
    raw_trout: 15,
    raw_pike: 20,
    raw_salmon: 25,
    raw_lobster: 40,
    raw_swordfish: 45,
    raw_monkfish: 62,
    raw_shark: 80,
  } as const,

  // === Timing ===
  // NOTE: All game logic uses TICKS, not milliseconds
  // RATE_LIMIT_MS is ONLY for anti-spam (uses Date.now())
  RATE_LIMIT_MS: 600,          // Anti-spam cooldown (ms) - matches GatheringConstants pattern
  MINIMUM_CYCLE_TICKS: 2,      // Min ticks between actions (game logic)

  // === Validation ===
  VALID_LOG_IDS: new Set([
    "logs", "oak_logs", "willow_logs", "teak_logs",
    "maple_logs", "mahogany_logs", "yew_logs",
    "magic_logs", "redwood_logs",
  ]),

  VALID_RAW_FOOD_IDS: new Set([
    "raw_shrimp", "raw_anchovies", "raw_sardine", "raw_herring",
    "raw_trout", "raw_pike", "raw_salmon", "raw_lobster",
    "raw_swordfish", "raw_monkfish", "raw_shark",
  ]),
} as const;
```

---

## Appendix B: Processing Session Interface (Matches GatheringSession Pattern)

```typescript
/**
 * Processing System Types
 *
 * Type definitions matching GatheringSession pattern for consistency.
 */

import type { PlayerID } from "../../../../types/core/identifiers";

/**
 * Cached tuning data for a processing session.
 * Pre-computed at session start to avoid per-tick allocations.
 */
export interface ProcessingTuning {
  levelRequired: number;
  xpAmount: number;
  tickDuration: number;
}

/**
 * Debug information (only used when DEBUG_PROCESSING=true)
 */
export interface ProcessingDebugInfo {
  skill: "firemaking" | "cooking";
  itemType: string;
  sourceType?: "fire" | "range";
}

/**
 * Active firemaking session data.
 *
 * PERFORMANCE: All data cached at session start to avoid per-tick allocations.
 * OSRS-ACCURACY: Start position cached for movement detection (cancels action).
 */
export interface FiremakingSession {
  playerId: PlayerID;
  startTick: number;
  nextAttemptTick: number;
  attempts: number;

  // PERFORMANCE: Cached at session start
  cachedLogId: string;
  cachedLogSlot: number;
  cachedTinderboxSlot: number;
  cachedSuccessRate: number;
  cachedXpAmount: number;
  cachedStartPosition: { x: number; y: number; z: number };

  // DEBUG: Only populated when DEBUG_PROCESSING=true
  debugInfo?: ProcessingDebugInfo;
}

/**
 * Active cooking session data.
 *
 * Supports "Cook All" with quantity tracking.
 */
export interface CookingSession {
  playerId: PlayerID;
  startTick: number;
  nextCookTick: number;

  // Quantity tracking for "Cook All"
  totalQuantity: number;
  cookedCount: number;
  burntCount: number;

  // PERFORMANCE: Cached at session start
  cachedFoodId: string;
  cachedCookedId: string;
  cachedBurntId: string;
  cachedSourceId: string;
  cachedSourceType: "fire" | "range";
  cachedBurnChance: number;
  cachedXpAmount: number;
  cachedStartPosition: { x: number; y: number; z: number };

  // Equipment flags (checked at session start)
  // FUTURE: hasGauntlets: boolean;
  // FUTURE: hasCookingCape: boolean;

  // DEBUG
  debugInfo?: ProcessingDebugInfo;
}

/**
 * Fire object data.
 */
export interface Fire {
  id: string;
  position: { x: number; y: number; z: number };
  tile: { x: number; z: number };
  playerId: PlayerID;
  createdAtTick: number;
  expiresAtTick: number;
  isActive: boolean;
}

/**
 * Cooking source (fire or range).
 */
export interface CookingSource {
  id: string;
  type: "fire" | "range";
  position: { x: number; y: number; z: number };
  burnReduction: number; // 0 for fire, varies for special ranges
}
```

---

## Appendix C: PendingFiremakingManager Pattern (Matches PendingGatherManager)

```typescript
/**
 * PendingFiremakingManager - Server-Authoritative Firemaking
 *
 * Modeled after PendingGatherManager for resource gathering.
 * Handles the item-on-item flow when player uses tinderbox on logs.
 *
 * SERVER-AUTHORITATIVE FLOW:
 * 1. Player uses tinderbox on logs → client sends firemakingRequest
 * 2. Server validates inventory slots contain correct items
 * 3. Server validates player has required firemaking level
 * 4. Server validates current tile is valid for fire placement
 * 5. Server creates FiremakingSession, starts tick processing
 * 6. Every 4 ticks: roll success, on fail retry, on success create fire
 * 7. After fire creation: walk player west (OSRS behavior)
 *
 * @see PendingGatherManager - resource gathering equivalent
 */

interface PendingFiremaking {
  playerId: string;
  logSlot: number;
  tinderboxSlot: number;
  logId: string;
  createdTick: number;
  lastAttemptTick: number;
  cachedSuccessRate: number;
  cachedXpAmount: number;
  playerTile: { x: number; z: number };
}

/** Timeout for pending firemaking (in ticks) */
const PENDING_FIREMAKING_TIMEOUT_TICKS = 30; // 18 seconds
```

---

## Appendix D: Test Patterns (Matches ResourceSystem.test.ts)

```typescript
/**
 * ProcessingSystem Unit Tests
 *
 * Tests matching the pattern from ResourceSystem.test.ts:
 * - Pure function tests imported directly from modules
 * - Mock world object for system tests
 * - Probability distribution tests with statistical validation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calculateFiremakingSuccess,
  lerpSuccessRate,
} from "../processing/FiremakingCalculator";
import {
  calculateBurnChance,
  getStopBurnLevel,
} from "../processing/CookingCalculator";

// Mock world object (matches gathering tests)
const createMockWorld = () => ({
  isServer: true,
  currentTick: 0,
  emit: vi.fn(),
  on: vi.fn(),
  getPlayer: vi.fn(),
  getSystem: vi.fn(),
  $eventBus: {
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    emitEvent: vi.fn(),
  },
});

describe("FiremakingCalculator", () => {
  describe("calculateFiremakingSuccess", () => {
    it("should return 25.4% at level 1", () => {
      const rate = calculateFiremakingSuccess(1);
      expect(rate).toBeCloseTo(65 / 256, 3);
    });

    it("should return 100% at level 43", () => {
      const rate = calculateFiremakingSuccess(43);
      expect(rate).toBeGreaterThanOrEqual(1.0);
    });

    it("should cap at 100% for level 99", () => {
      const rate = calculateFiremakingSuccess(99);
      expect(rate).toBe(1.0);
    });

    it("should interpolate linearly between levels", () => {
      const rate1 = calculateFiremakingSuccess(1);
      const rate50 = calculateFiremakingSuccess(50);
      const rate99 = calculateFiremakingSuccess(99);
      expect(rate50).toBeGreaterThan(rate1);
      expect(rate50).toBeLessThan(rate99);
    });
  });
});

describe("CookingCalculator", () => {
  describe("calculateBurnChance", () => {
    it("should return 0 at stop-burn level", () => {
      // Shrimp stops burning at level 34 on fire
      const chance = calculateBurnChance(34, "raw_shrimp", "fire");
      expect(chance).toBe(0);
    });

    it("should return higher burn on fire than range", () => {
      const fireBurn = calculateBurnChance(30, "raw_shrimp", "fire");
      const rangeBurn = calculateBurnChance(30, "raw_shrimp", "range");
      expect(fireBurn).toBeGreaterThan(rangeBurn);
    });

    it("should decrease burn chance as level increases", () => {
      const burnAt10 = calculateBurnChance(10, "raw_shrimp", "fire");
      const burnAt20 = calculateBurnChance(20, "raw_shrimp", "fire");
      const burnAt30 = calculateBurnChance(30, "raw_shrimp", "fire");
      expect(burnAt10).toBeGreaterThan(burnAt20);
      expect(burnAt20).toBeGreaterThan(burnAt30);
    });

    // FUTURE: Test cooking gauntlets and cape when implemented
  });
});
```

---

## Appendix D.2: Integration Test Patterns (Real Server/Client)

**CRITICAL: Unit tests are necessary but not sufficient. Integration tests with real Hyperscape instances are REQUIRED.**

Per CLAUDE.md: "NO MOCKS - Use real Hyperscape instances with Playwright."

```typescript
/**
 * ProcessingSystem Integration Tests
 *
 * These tests use real Hyperscape server/client instances.
 * NO MOCKS - actual game server, actual browser, actual gameplay.
 *
 * @see packages/shared/src/systems/__tests__/ for existing patterns
 */

import { test, expect, Page } from "@playwright/test";
import { HyperspaceTestHarness } from "../../test-utils/HyperspaceTestHarness";

// Test harness handles server/client lifecycle
let harness: HyperspaceTestHarness;

test.beforeAll(async () => {
  harness = new HyperspaceTestHarness();
  await harness.startServer();
});

test.afterAll(async () => {
  await harness.shutdown();
});

test.describe("Firemaking Integration", () => {
  test("should light fire when tinderbox used on logs", async ({ page }) => {
    // Connect player to real server
    await harness.connectPlayer(page, "test-player-1");

    // Give player tinderbox and logs via admin command
    await harness.giveItem(page, "tinderbox", 1);
    await harness.giveItem(page, "logs", 5);

    // Set firemaking level
    await harness.setSkillLevel(page, "firemaking", 10);

    // Execute firemaking action
    await harness.useItemOnItem(page, "tinderbox", "logs");

    // Wait for fire to appear (4 ticks = 2.4 seconds)
    await page.waitForTimeout(3000);

    // Verify fire entity exists in world
    const fireCount = await harness.countEntitiesOfType(page, "fire");
    expect(fireCount).toBeGreaterThanOrEqual(1);

    // Verify logs consumed
    const logCount = await harness.countItemsInInventory(page, "logs");
    expect(logCount).toBe(4); // Started with 5, used 1

    // Verify XP gained
    const xp = await harness.getSkillXP(page, "firemaking");
    expect(xp).toBeGreaterThanOrEqual(40); // Normal logs = 40 XP
  });

  test("should fail firemaking at low level", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-2");

    // Give player oak logs (requires level 15)
    await harness.giveItem(page, "tinderbox", 1);
    await harness.giveItem(page, "oak_logs", 1);

    // Set firemaking level below requirement
    await harness.setSkillLevel(page, "firemaking", 5);

    // Try to light oak logs
    await harness.useItemOnItem(page, "tinderbox", "oak_logs");

    // Verify error message shown
    const message = await harness.getLastChatMessage(page);
    expect(message).toContain("Requires level 15 Firemaking");

    // Verify no fire created
    const fireCount = await harness.countEntitiesOfType(page, "fire");
    expect(fireCount).toBe(0);
  });

  test("should walk west after lighting fire (OSRS behavior)", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-3");
    await harness.giveItem(page, "tinderbox", 1);
    await harness.giveItem(page, "logs", 1);
    await harness.setSkillLevel(page, "firemaking", 50);

    // Get initial position
    const startPos = await harness.getPlayerPosition(page);

    // Light fire
    await harness.useItemOnItem(page, "tinderbox", "logs");
    await page.waitForTimeout(3000);

    // Get final position
    const endPos = await harness.getPlayerPosition(page);

    // Verify player moved west (x decreased)
    expect(endPos.x).toBeLessThan(startPos.x);
  });

  test("should respect fire limit per player", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-4");
    await harness.giveItem(page, "tinderbox", 1);
    await harness.giveItem(page, "logs", 10);
    await harness.setSkillLevel(page, "firemaking", 99);

    // Light 3 fires (the limit)
    for (let i = 0; i < 3; i++) {
      await harness.teleportPlayer(page, { x: i * 5, y: 0, z: 0 });
      await harness.useItemOnItem(page, "tinderbox", "logs");
      await page.waitForTimeout(2500);
    }

    // Try to light 4th fire
    await harness.teleportPlayer(page, { x: 20, y: 0, z: 0 });
    await harness.useItemOnItem(page, "tinderbox", "logs");
    await page.waitForTimeout(2500);

    // Verify only 3 fires exist (limit enforced)
    const fireCount = await harness.countEntitiesOfType(page, "fire");
    expect(fireCount).toBe(3);
  });
});

test.describe("Cooking Integration", () => {
  test("should cook raw shrimp on fire", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-5");

    // Create fire first
    await harness.giveItem(page, "tinderbox", 1);
    await harness.giveItem(page, "logs", 1);
    await harness.setSkillLevel(page, "firemaking", 50);
    await harness.useItemOnItem(page, "tinderbox", "logs");
    await page.waitForTimeout(3000);

    // Give raw shrimp
    await harness.giveItem(page, "raw_shrimp", 5);
    await harness.setSkillLevel(page, "cooking", 10);

    // Use raw shrimp on fire
    const fireId = await harness.getNearestEntityId(page, "fire");
    await harness.useItemOnEntity(page, "raw_shrimp", fireId);

    // Select "Cook All" in interface
    await page.click('[data-testid="cook-all-button"]');

    // Wait for cooking to complete (5 items × 4 ticks = 12 seconds)
    await page.waitForTimeout(15000);

    // Verify cooked shrimp in inventory (some may be burnt)
    const cookedCount = await harness.countItemsInInventory(page, "shrimp");
    const burntCount = await harness.countItemsInInventory(page, "burnt_shrimp");
    expect(cookedCount + burntCount).toBe(5);

    // Verify raw shrimp consumed
    const rawCount = await harness.countItemsInInventory(page, "raw_shrimp");
    expect(rawCount).toBe(0);
  });

  // FUTURE: Test cooking cape when equipment is implemented
  test.skip("should never burn with cooking cape", async ({ page }) => {
    // await harness.equipItem(page, "cooking_cape");
    // ... test cooking cape never-burn effect
  });

  test("should cancel cooking on movement", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-7");
    await harness.createFire(page, { x: 0, y: 0, z: 0 });
    await harness.giveItem(page, "raw_shrimp", 10);
    await harness.setSkillLevel(page, "cooking", 50);

    // Start cooking
    const fireId = await harness.getNearestEntityId(page, "fire");
    await harness.useItemOnEntity(page, "raw_shrimp", fireId);
    await page.click('[data-testid="cook-all-button"]');

    // Wait for 2 items to cook
    await page.waitForTimeout(5000);

    // Move player (should cancel cooking)
    await harness.clickTile(page, { x: 10, z: 10 });
    await page.waitForTimeout(2000);

    // Verify not all shrimp cooked (cooking was cancelled)
    const rawCount = await harness.countItemsInInventory(page, "raw_shrimp");
    expect(rawCount).toBeGreaterThan(0);
  });

  test("should fail cooking if fire expires", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-8");

    // Create fire with short duration IN TICKS (for testing)
    // 8 ticks = 4.8 seconds, enough for ~2 cooked items before expiry
    const fireId = await harness.createFireWithDurationTicks(page, { x: 0, y: 0, z: 0 }, 8);

    await harness.giveItem(page, "raw_shrimp", 20);
    await harness.setSkillLevel(page, "cooking", 50);

    // Start cooking
    await harness.useItemOnEntity(page, "raw_shrimp", fireId);
    await page.click('[data-testid="cook-all-button"]');

    // Wait for fire to expire (8 ticks = 4.8s, wait 10s to be safe)
    await page.waitForTimeout(10000);

    // Verify error message about fire expiring
    const message = await harness.getLastChatMessage(page);
    expect(message).toContain("Fire has gone out");

    // Verify not all shrimp cooked
    const rawCount = await harness.countItemsInInventory(page, "raw_shrimp");
    expect(rawCount).toBeGreaterThan(0);
  });
});

test.describe("Anti-Cheat Integration", () => {
  test("should reject cooking request when out of range", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-9");
    await harness.createFire(page, { x: 0, y: 0, z: 0 });
    await harness.giveItem(page, "raw_shrimp", 1);
    await harness.setSkillLevel(page, "cooking", 50);

    // Move player far from fire
    await harness.teleportPlayer(page, { x: 100, y: 0, z: 100 });

    // Try to cook (should be rejected by server)
    const fireId = await harness.getEntityIdAtPosition(page, { x: 0, y: 0, z: 0 });
    await harness.sendRawPacket(page, {
      type: "cookingRequest",
      rawFoodSlot: 0,
      sourceId: fireId,
      quantity: 1,
    });

    await page.waitForTimeout(1000);

    // Verify cooking rejected
    const rawCount = await harness.countItemsInInventory(page, "raw_shrimp");
    expect(rawCount).toBe(1); // Not consumed

    const message = await harness.getLastChatMessage(page);
    expect(message).toContain("Too far from cooking source");
  });

  test("should rate limit rapid firemaking requests", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-10");
    await harness.giveItem(page, "tinderbox", 1);
    await harness.giveItem(page, "logs", 10);
    await harness.setSkillLevel(page, "firemaking", 99);

    // Send 5 rapid firemaking requests (should be rate limited)
    for (let i = 0; i < 5; i++) {
      await harness.sendRawPacket(page, {
        type: "firemakingRequest",
        logSlot: i,
        tinderboxSlot: 0,
      });
    }

    await page.waitForTimeout(500);

    // Verify only 1 request processed (rest rate limited)
    // Check server logs or count fires
    const logs = await harness.getServerLogs(page, "rate");
    expect(logs.filter(l => l.includes("RATE_LIMITED")).length).toBeGreaterThanOrEqual(4);
  });
});

test.describe("Performance Integration", () => {
  test("should maintain 60fps with 50 fires", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-11");

    // Create 50 fires via admin
    for (let i = 0; i < 50; i++) {
      await harness.createFire(page, { x: (i % 10) * 2, y: 0, z: Math.floor(i / 10) * 2 });
    }

    // Measure FPS over 5 seconds
    const fps = await harness.measureFPS(page, 5000);

    // Verify performance maintained
    expect(fps).toBeGreaterThanOrEqual(55);
  });

  test("should not leak memory during firemaking cycle", async ({ page }) => {
    await harness.connectPlayer(page, "test-player-12");
    await harness.giveItem(page, "tinderbox", 1);
    await harness.giveItem(page, "logs", 100);
    await harness.setSkillLevel(page, "firemaking", 99);

    // Get initial memory
    const initialMemory = await harness.getHeapUsage(page);

    // Light and let expire 20 fires
    for (let i = 0; i < 20; i++) {
      await harness.teleportPlayer(page, { x: i * 5, y: 0, z: 0 });
      await harness.useItemOnItem(page, "tinderbox", "logs");
      await page.waitForTimeout(2500);
    }

    // Wait for fires to expire
    await page.waitForTimeout(120000); // 2 minutes

    // Force GC
    await harness.forceGC(page);

    // Get final memory
    const finalMemory = await harness.getHeapUsage(page);

    // Verify no significant memory leak (allow 10% growth)
    expect(finalMemory).toBeLessThan(initialMemory * 1.1);
  });
});
```

---

## Appendix E: Existing Code Reference

### Gathering System Architecture (Reference Pattern)

```
packages/shared/src/systems/shared/entities/gathering/
├── index.ts              # Module exports
├── debug.ts              # DEBUG_GATHERING flag
├── types.ts              # GatheringSession, etc.
├── DropRoller.ts         # lerpSuccessRate, rollDrop
├── ToolUtils.ts          # Tool validation
├── SuccessRateCalculator.ts  # OSRS LERP formula
└── README.md             # Documentation
```

### Key Patterns to Replicate

1. **Session caching**: All data computed at session start, stored in session object
2. **Pure utility functions**: Calculators are pure, no system dependencies
3. **Constants file**: All OSRS-accurate values in centralized file with JSDoc
4. **Movement cancellation**: `cachedStartPosition` compared each tick
5. **Debug info optional**: Only populated when environment flag set
6. **Server-authoritative**: All validation on server, client is display-only
7. **Tick-based timing**: No setTimeout, integrated with game tick system

---

## Appendix F: ItemTargetingSystem Complete Implementation (Zero-Allocation)

This system enables "Use [item] on [target]" interactions for firemaking and cooking.

**CRITICAL: This implementation follows zero-allocation patterns for hot paths.**

```typescript
/**
 * ItemTargetingSystem - Handles "Use item on target" interactions
 *
 * MEMORY HYGIENE: This system uses pre-allocated objects to avoid GC pressure.
 * - _tempTargetInfo: Reusable target info object
 * - _eventPayload: Reusable event payload
 * - Shared geometry/material for highlights
 *
 * State machine for item targeting:
 * - IDLE: Normal gameplay, no item selected for use
 * - SELECTING_TARGET: Player has selected "Use" and is choosing target
 * - EXECUTING: Target selected, action in progress
 *
 * @see InventoryInteractionSystem - integrates with this for "Use" action
 */

import { EventType } from "../../../../types/events/event-types";
import { PROCESSING_CONSTANTS } from "../../../../constants/ProcessingConstants";

// === Shared Resources (module-level, created ONCE) ===

// Shared highlight geometry - created ONCE at module load
const HIGHLIGHT_GEOMETRY = new THREE.RingGeometry(0.6, 0.8, 32);
HIGHLIGHT_GEOMETRY.rotateX(-Math.PI / 2);

// Shared highlight material - created ONCE at module load
const HIGHLIGHT_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x00ff00,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,
});

// === Types ===

export type TargetingState = "idle" | "selecting_target" | "executing";
export type TargetType = "inventory_item" | "world_entity" | "ground_tile";

export interface TargetInfo {
  type: TargetType;
  id: string;
  slot: number;
  entityType: string;
  positionX: number;
  positionY: number;
  positionZ: number;
}

export interface SourceItem {
  id: string;
  slot: number;
  name: string;
}

// === Main System ===

export class ItemTargetingSystem {
  private world: World;
  private highlighter: TargetHighlighter;

  // === PRE-ALLOCATED CONTEXT (mutated, never recreated) ===
  private readonly context = {
    state: "idle" as TargetingState,
    sourceItemId: "",
    sourceItemSlot: 0,
    sourceItemName: "",
    validTargetTypes: [] as TargetType[],
    validTargetIds: new Set<string>(),
    validTargetEntityTypes: new Set<string>(),
    onTargetSelected: null as ((target: TargetInfo) => void) | null,
    startTime: 0,
  };

  // === PRE-ALLOCATED TEMPORARIES (zero allocations in hot paths) ===
  private readonly _tempTargetInfo: TargetInfo = {
    type: "idle" as TargetType,
    id: "",
    slot: 0,
    entityType: "",
    positionX: 0,
    positionY: 0,
    positionZ: 0,
  };

  // Pre-allocated event payloads (mutate, don't create new)
  private readonly _startEventPayload = {
    sourceItemId: "",
    sourceItemSlot: 0,
    sourceItemName: "",
    validTargetTypes: [] as string[],
  };

  private readonly _completeEventPayload = {
    sourceItemId: "",
    sourceItemSlot: 0,
    targetType: "",
    targetId: "",
    targetSlot: 0,
  };

  // Event subscriptions for cleanup
  private subscriptions: Array<{ unsubscribe: () => void }> = [];

  constructor(world: World) {
    this.world = world;
    this.highlighter = new TargetHighlighter(world);
    this.setupEventListeners();
  }

  /**
   * Reset context to idle state (mutates existing object).
   */
  private resetContext(): void {
    this.context.state = "idle";
    this.context.sourceItemId = "";
    this.context.sourceItemSlot = 0;
    this.context.sourceItemName = "";
    this.context.validTargetTypes.length = 0;
    this.context.validTargetIds.clear();
    this.context.validTargetEntityTypes.clear();
    this.context.onTargetSelected = null;
    this.context.startTime = 0;
  }

  // === Public API ===

  /**
   * Enter targeting mode. Called when player clicks "Use" on an item.
   * ZERO ALLOCATIONS - mutates pre-allocated context.
   */
  startTargeting(
    sourceItem: SourceItem,
    validTargetTypes: TargetType[],
    validTargetIds: Set<string>,
    validTargetEntityTypes: Set<string>,
    onSelect: (target: TargetInfo) => void
  ): void {
    // Cancel any existing targeting
    if (this.context.state !== "idle") {
      this.cancelTargeting();
    }

    // Mutate existing context (no new object allocation)
    this.context.state = "selecting_target";
    this.context.sourceItemId = sourceItem.id;
    this.context.sourceItemSlot = sourceItem.slot;
    this.context.sourceItemName = sourceItem.name;

    // Copy arrays/sets (reuse existing containers)
    this.context.validTargetTypes.length = 0;
    for (const t of validTargetTypes) {
      this.context.validTargetTypes.push(t);
    }

    this.context.validTargetIds.clear();
    for (const id of validTargetIds) {
      this.context.validTargetIds.add(id);
    }

    this.context.validTargetEntityTypes.clear();
    for (const et of validTargetEntityTypes) {
      this.context.validTargetEntityTypes.add(et);
    }

    this.context.onTargetSelected = onSelect;
    this.context.startTime = Date.now();

    // Update cursor
    this.setCursor(CursorState.TARGETING_ENTITY);

    // Highlight valid targets
    if (this.context.validTargetTypes.includes("inventory_item")) {
      this.highlighter.highlightInventorySlots(this.context.validTargetIds);
    }
    if (this.context.validTargetTypes.includes("world_entity")) {
      this.highlighter.highlightWorldEntities(this.context.validTargetEntityTypes);
    }

    // Show status message
    this.showMessage(`Use ${sourceItem.name} with...`);

    // Emit event for UI (using pre-allocated payload)
    this._startEventPayload.sourceItemId = sourceItem.id;
    this._startEventPayload.sourceItemSlot = sourceItem.slot;
    this._startEventPayload.sourceItemName = sourceItem.name;
    this._startEventPayload.validTargetTypes.length = 0;
    for (const t of validTargetTypes) {
      this._startEventPayload.validTargetTypes.push(t);
    }

    this.world.$eventBus.emitEvent({
      type: EventType.TARGETING_START,
      payload: this._startEventPayload,  // Reused object
    });
  }

  /**
   * Check if currently in targeting mode.
   */
  isTargeting(): boolean {
    return this.context.state === "selecting_target";
  }

  /**
   * Get current source item info (for UI display).
   * Returns reference to internal data - do not modify.
   */
  getSourceItemId(): string {
    return this.context.sourceItemId;
  }

  getSourceItemSlot(): number {
    return this.context.sourceItemSlot;
  }

  /**
   * Handle click during targeting mode.
   * Returns true if click was consumed by targeting system.
   * ZERO ALLOCATIONS - uses _tempTargetInfo.
   */
  handleClick(clickInfo: ClickInfo): boolean {
    if (this.context.state !== "selecting_target") {
      return false; // Not targeting, let click pass through
    }

    const target = this.resolveTarget(clickInfo);
    if (!target) {
      // Clicked on nothing - cancel targeting
      this.cancelTargeting();
      return true;
    }

    if (this.isValidTarget(target)) {
      // Valid target - execute action
      this.executeTarget(target);
      return true;
    } else {
      // Invalid target - show message, stay in targeting mode
      this.showMessage("You can't use that on this.");
      return true;
    }
  }

  /**
   * Handle right-click during targeting mode (cancels targeting).
   */
  handleRightClick(): boolean {
    if (this.context.state !== "selecting_target") {
      return false;
    }
    this.cancelTargeting();
    return true;
  }

  /**
   * Handle ESC key (cancels targeting).
   */
  handleEscape(): boolean {
    if (this.context.state !== "selecting_target") {
      return false;
    }
    this.cancelTargeting();
    return true;
  }

  /**
   * Cancel targeting mode and return to idle.
   * ZERO ALLOCATIONS - uses resetContext().
   */
  cancelTargeting(): void {
    if (this.context.state === "idle") return;

    // Clear highlights
    this.highlighter.clearAllHighlights();

    // Reset cursor
    this.setCursor(CursorState.DEFAULT);

    // Reset context (mutates existing, no allocation)
    this.resetContext();

    // Emit event for UI (empty payload is fine - no data needed)
    this.world.$eventBus.emitEvent({
      type: EventType.TARGETING_CANCEL,
      payload: null,  // No allocation needed
    });
  }

  /**
   * Check if a target is valid for current targeting context.
   */
  isValidTarget(target: TargetInfo): boolean {
    if (this.context.state !== "selecting_target") {
      return false;
    }

    // Check target type is valid
    if (!this.context.validTargetTypes.includes(target.type)) {
      return false;
    }

    // Check specific target ID or entity type
    if (target.type === "inventory_item") {
      return this.context.validTargetIds.has(target.id);
    }

    if (target.type === "world_entity") {
      // Check entity type (fire, range) OR specific entity ID
      return (
        this.context.validTargetEntityTypes.has(target.entityType || "") ||
        this.context.validTargetIds.has(target.id)
      );
    }

    return false;
  }

  // === Private Methods ===

  private setupEventListeners(): void {
    // Listen for movement (cancels targeting)
    this.subscriptions.push(
      this.world.$eventBus.subscribe(EventType.PLAYER_MOVE_START, () => {
        if (this.context.state === "selecting_target") {
          this.cancelTargeting();
        }
      })
    );

    // Listen for combat (cancels targeting)
    this.subscriptions.push(
      this.world.$eventBus.subscribe(EventType.COMBAT_START, () => {
        if (this.context.state === "selecting_target") {
          this.cancelTargeting();
        }
      })
    );

    // Listen for inventory close
    this.subscriptions.push(
      this.world.$eventBus.subscribe(EventType.UI_INVENTORY_CLOSE, () => {
        if (this.context.state === "selecting_target") {
          this.cancelTargeting();
        }
      })
    );
  }

  /**
   * Resolve click to target info.
   * ZERO ALLOCATIONS - mutates _tempTargetInfo instead of creating new objects.
   * Returns reference to _tempTargetInfo or null.
   */
  private resolveTarget(clickInfo: ClickInfo): TargetInfo | null {
    // Check if click is on inventory slot
    if (clickInfo.inventorySlot !== null) {
      const item = this.world.localPlayer?.inventory.getItemAtSlot(
        clickInfo.inventorySlot
      );
      if (item) {
        // Mutate pre-allocated object
        this._tempTargetInfo.type = "inventory_item";
        this._tempTargetInfo.id = item.id;
        this._tempTargetInfo.slot = clickInfo.inventorySlot;
        this._tempTargetInfo.entityType = "";
        this._tempTargetInfo.positionX = 0;
        this._tempTargetInfo.positionY = 0;
        this._tempTargetInfo.positionZ = 0;
        return this._tempTargetInfo;
      }
    }

    // Check if click is on world entity
    if (clickInfo.worldEntity) {
      // Mutate pre-allocated object
      this._tempTargetInfo.type = "world_entity";
      this._tempTargetInfo.id = clickInfo.worldEntity.id;
      this._tempTargetInfo.slot = 0;
      this._tempTargetInfo.entityType = clickInfo.worldEntity.entityType;
      this._tempTargetInfo.positionX = clickInfo.worldEntity.position.x;
      this._tempTargetInfo.positionY = clickInfo.worldEntity.position.y;
      this._tempTargetInfo.positionZ = clickInfo.worldEntity.position.z;
      return this._tempTargetInfo;
    }

    // Check if click is on ground tile
    if (clickInfo.groundPosition) {
      // Mutate pre-allocated object
      this._tempTargetInfo.type = "ground_tile";
      this._tempTargetInfo.id = ""; // Don't allocate string for tile ID
      this._tempTargetInfo.slot = 0;
      this._tempTargetInfo.entityType = "";
      this._tempTargetInfo.positionX = clickInfo.groundPosition.x;
      this._tempTargetInfo.positionY = clickInfo.groundPosition.y;
      this._tempTargetInfo.positionZ = clickInfo.groundPosition.z;
      return this._tempTargetInfo;
    }

    return null;
  }

  /**
   * Execute target action.
   * ZERO ALLOCATIONS - uses pre-allocated _completeEventPayload.
   */
  private executeTarget(target: TargetInfo): void {
    if (!this.context.onTargetSelected) return;

    // Transition to executing state
    this.context.state = "executing";

    // Clear highlights
    this.highlighter.clearAllHighlights();

    // Reset cursor
    this.setCursor(CursorState.DEFAULT);

    // Execute callback (pass reference to _tempTargetInfo)
    this.context.onTargetSelected(target);

    // Emit event using pre-allocated payload
    this._completeEventPayload.sourceItemId = this.context.sourceItemId;
    this._completeEventPayload.sourceItemSlot = this.context.sourceItemSlot;
    this._completeEventPayload.targetType = target.type;
    this._completeEventPayload.targetId = target.id;
    this._completeEventPayload.targetSlot = target.slot;

    this.world.$eventBus.emitEvent({
      type: EventType.TARGETING_COMPLETE,
      payload: this._completeEventPayload,  // Reused object
    });

    // Return to idle (mutates existing, no allocation)
    this.resetContext();
  }

  private setCursor(state: CursorState): void {
    document.body.style.cursor = CURSOR_STYLES[state];
  }

  private showMessage(text: string): void {
    this.world.$eventBus.emitEvent({
      type: EventType.CHAT_MESSAGE,
      payload: { text, type: "game" },
    });
  }

  destroy(): void {
    this.cancelTargeting();
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions = [];
  }
}

// === Cursor States ===

export enum CursorState {
  DEFAULT = "default",
  TARGETING_ITEM = "targeting_item",
  TARGETING_ENTITY = "targeting_entity",
  TARGETING_INVALID = "targeting_invalid",
}

const CURSOR_STYLES: Record<CursorState, string> = {
  [CursorState.DEFAULT]: "default",
  [CursorState.TARGETING_ITEM]: "url(/cursors/use-item.png) 16 16, crosshair",
  [CursorState.TARGETING_ENTITY]: "url(/cursors/use-entity.png) 16 16, crosshair",
  [CursorState.TARGETING_INVALID]: "not-allowed",
};

// === Target Highlighter (Zero-Allocation) ===

/**
 * TargetHighlighter - Manages visual highlights for valid targets.
 *
 * MEMORY HYGIENE:
 * - Uses module-level HIGHLIGHT_GEOMETRY and HIGHLIGHT_MATERIAL (shared)
 * - Pre-allocated validSlots array (reused, not reallocated)
 * - Pre-allocated CustomEvent detail object (reused)
 */
export class TargetHighlighter {
  private world: World;
  private highlightedEntities: Set<string> = new Set();
  private highlightedSlots: Set<number> = new Set();

  // Pre-allocated arrays for event dispatch (avoid allocations)
  private readonly _validSlotsArray: number[] = [];
  private readonly _highlightEventDetail = { slots: [] as number[], highlight: true };
  private readonly _clearEventDetail = { slots: [] as number[], highlight: false };

  constructor(world: World) {
    this.world = world;
  }

  /**
   * Highlight inventory slots containing valid items.
   * ZERO ALLOCATIONS - reuses _validSlotsArray.
   */
  highlightInventorySlots(validItemIds: Set<string>): void {
    const inventory = this.world.localPlayer?.inventory;
    if (!inventory) return;

    // Reuse array (clear length, don't create new)
    this._validSlotsArray.length = 0;

    for (let slot = 0; slot < inventory.size; slot++) {
      const item = inventory.getItemAtSlot(slot);
      if (item && validItemIds.has(item.id)) {
        this._validSlotsArray.push(slot);
        this.highlightedSlots.add(slot);
      }
    }

    // Dispatch event using pre-allocated detail
    this._highlightEventDetail.slots = this._validSlotsArray;
    this._highlightEventDetail.highlight = true;
    window.dispatchEvent(
      new CustomEvent("inventory:highlightSlots", {
        detail: this._highlightEventDetail,
      })
    );
  }

  highlightWorldEntities(validEntityTypes: Set<string>): void {
    for (const entity of this.world.getAllEntities()) {
      if (validEntityTypes.has(entity.entityType)) {
        this.addHighlightEffect(entity);
        this.highlightedEntities.add(entity.id);
      }
    }
  }

  clearAllHighlights(): void {
    // Clear world entity highlights
    for (const entityId of this.highlightedEntities) {
      const entity = this.world.getEntity(entityId);
      if (entity) {
        this.removeHighlightEffect(entity);
      }
    }
    this.highlightedEntities.clear();

    // Dispatch clear event using pre-allocated detail
    this._clearEventDetail.slots.length = 0;
    this._clearEventDetail.highlight = false;
    window.dispatchEvent(
      new CustomEvent("inventory:highlightSlots", {
        detail: this._clearEventDetail,
      })
    );
    this.highlightedSlots.clear();
  }

  private addHighlightEffect(entity: BaseEntity): void {
    if (!entity.mesh) return;

    // Find or create highlight mesh
    let highlight = entity.mesh.getObjectByName("targetHighlight");
    if (!highlight) {
      // Uses SHARED geometry/material (module-level constants)
      highlight = new THREE.Mesh(HIGHLIGHT_GEOMETRY, HIGHLIGHT_MATERIAL);
      highlight.name = "targetHighlight";
      entity.mesh.add(highlight);
    }
    highlight.visible = true;
  }

  private removeHighlightEffect(entity: BaseEntity): void {
    if (!entity.mesh) return;

    const highlight = entity.mesh.getObjectByName("targetHighlight");
    if (highlight) {
      highlight.visible = false;
    }
  }

  private createHighlightMesh(): THREE.Mesh {
    // Pulsing ring around entity
    const geometry = new THREE.RingGeometry(0.6, 0.8, 32);
    geometry.rotateX(-Math.PI / 2); // Lay flat on ground

    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geometry, material);
  }
}

// === Click Info Type ===

export interface ClickInfo {
  screenX: number;
  screenY: number;
  inventorySlot: number | null;
  worldEntity: {
    id: string;
    entityType: string;
    position: { x: number; y: number; z: number };
  } | null;
  groundPosition: { x: number; y: number; z: number } | null;
}
```

---

## Appendix G: Firemaking & Cooking Targeting Integration

This shows how to integrate `ItemTargetingSystem` with `InventoryInteractionSystem` for firemaking and cooking.

```typescript
/**
 * Integration code for InventoryInteractionSystem.ts
 *
 * Add this to registerDefaultActions() to enable
 * "Use tinderbox on logs" and "Use raw food on fire" flows.
 */

// Add ItemTargetingSystem as a dependency
private itemTargetingSystem: ItemTargetingSystem;

constructor(world: World) {
  // ... existing code ...
  this.itemTargetingSystem = new ItemTargetingSystem(world);
}

// In registerDefaultActions(), replace the existing "use" action for tools:
private registerToolActions(): void {
  this.registerAction("tool", {
    id: "use",
    label: "Use",
    priority: 1,
    condition: (item: Item) => item.type === ItemType.TOOL,
    callback: (playerId: string, itemId: string, slot: number | null) => {
      const item = this.getItemById(itemId);
      if (!item || slot === null) return;

      // Route based on tool category
      if (item.toolCategory === "firemaking") {
        this.startFiremakingTargeting(playerId, item, slot);
      }
      // Add other tool categories as needed (e.g., chisel, knife)
    },
  });
}

/**
 * Start targeting mode for firemaking (tinderbox → logs).
 */
private startFiremakingTargeting(
  playerId: string,
  tinderbox: Item,
  tinderboxSlot: number
): void {
  this.itemTargetingSystem.startTargeting(
    { id: tinderbox.id, slot: tinderboxSlot, name: tinderbox.name },
    ["inventory_item"],              // Target type: inventory items only
    PROCESSING_CONSTANTS.VALID_LOG_IDS,  // Valid target IDs (logs)
    new Set(),                       // No entity types (targeting inventory)
    (target: TargetInfo) => {
      // Target selected - send firemaking request
      if (target.type === "inventory_item" && target.slot !== undefined) {
        this.sendFiremakingRequest(playerId, tinderboxSlot, target.slot);
      }
    }
  );
}

/**
 * Send firemaking request to server.
 */
private sendFiremakingRequest(
  playerId: string,
  tinderboxSlot: number,
  logSlot: number
): void {
  this.world.$eventBus.emitEvent({
    type: EventType.FIREMAKING_REQUEST,
    payload: {
      playerId,
      tinderboxSlot,
      logSlot,
    },
  });
}

// === Raw Food "Use" Action ===

// Register "Use" action for raw food (cookable items)
private registerFoodActions(): void {
  this.registerAction("food", {
    id: "use",
    label: "Use",
    priority: 2,
    condition: (item: Item) =>
      PROCESSING_CONSTANTS.VALID_RAW_FOOD_IDS.has(item.id),
    callback: (playerId: string, itemId: string, slot: number | null) => {
      const item = this.getItemById(itemId);
      if (!item || slot === null) return;

      this.startCookingTargeting(playerId, item, slot);
    },
  });
}

/**
 * Start targeting mode for cooking (raw food → fire/range).
 */
private startCookingTargeting(
  playerId: string,
  rawFood: Item,
  rawFoodSlot: number
): void {
  this.itemTargetingSystem.startTargeting(
    { id: rawFood.id, slot: rawFoodSlot, name: rawFood.name },
    ["world_entity"],                // Target type: world entities only
    new Set(),                       // No specific IDs (accept any fire/range)
    new Set(["fire", "range"]),      // Valid entity types
    (target: TargetInfo) => {
      // Target selected - open cook interface
      if (target.type === "world_entity") {
        this.openCookInterface(playerId, rawFood, rawFoodSlot, target);
      }
    }
  );
}

/**
 * Open the cooking quantity selection interface.
 */
private openCookInterface(
  playerId: string,
  rawFood: Item,
  rawFoodSlot: number,
  cookingSource: TargetInfo
): void {
  // Count how many of this food player has
  const inventory = this.world.localPlayer?.inventory;
  const quantity = inventory?.countItemsById(rawFood.id) ?? 1;

  // Get cooking source data
  const sourceEntity = this.world.getEntity(cookingSource.id);
  const sourceType = cookingSource.entityType as "fire" | "range";
  const burnReduction = (sourceEntity as FireEntity | RangeEntity)?.burnReduction ?? 0;

  // Dispatch event to show React UI
  window.dispatchEvent(
    new CustomEvent("ui:showCookInterface", {
      detail: {
        food: {
          id: rawFood.id,
          name: rawFood.name,
          slot: rawFoodSlot,
        },
        source: {
          id: cookingSource.id,
          type: sourceType,
          burnReduction,
        },
        maxQuantity: quantity,
        onCook: (cookQuantity: number) => {
          this.sendCookingRequest(
            playerId,
            rawFoodSlot,
            cookingSource.id,
            cookQuantity
          );
        },
      },
    })
  );
}

/**
 * Send cooking request to server.
 */
private sendCookingRequest(
  playerId: string,
  rawFoodSlot: number,
  sourceId: string,
  quantity: number
): void {
  this.world.$eventBus.emitEvent({
    type: EventType.COOKING_REQUEST,
    payload: {
      playerId,
      rawFoodSlot,
      sourceId,
      quantity,
    },
  });
}
```

---

## Appendix K: Database Persistence (No Changes Required)

**GOOD NEWS**: The database schema ALREADY supports firemaking and cooking skills. **NO migrations needed. NO journal updates needed.**

### Migration Verification

Checked `0000_numerous_korvac.sql` (initial migration, lines 14-15, 23-24):
```sql
-- Firemaking and cooking were in the ORIGINAL schema from day one!
"firemakingLevel" integer DEFAULT 1,
"cookingLevel" integer DEFAULT 1,
...
"firemakingXp" integer DEFAULT 0,
"cookingXp" integer DEFAULT 0,
```

Compare to mining (added later via `0014_add_mining_skill.sql`):
```sql
-- Mining required a migration because it wasn't in original schema
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "miningLevel" integer DEFAULT 1;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "miningXp" integer DEFAULT 0;
```

**Firemaking/cooking ≠ mining**: No ALTER TABLE needed, no new migration file, no journal update.

### Existing Schema Support

The `characters` table in `packages/server/src/database/schema.ts` already includes:

```typescript
// Gathering skills (lines 196-200)
woodcuttingLevel: integer("woodcuttingLevel").default(1),
miningLevel: integer("miningLevel").default(1),
fishingLevel: integer("fishingLevel").default(1),
firemakingLevel: integer("firemakingLevel").default(1),  // ✅ Already exists
cookingLevel: integer("cookingLevel").default(1),       // ✅ Already exists

// Experience points (lines 203-212)
woodcuttingXp: integer("woodcuttingXp").default(0),
miningXp: integer("miningXp").default(0),
fishingXp: integer("fishingXp").default(0),
firemakingXp: integer("firemakingXp").default(0),       // ✅ Already exists
cookingXp: integer("cookingXp").default(0),             // ✅ Already exists
```

### Existing Loading/Saving Support

**Character Loading** (`packages/server/src/systems/ServerNetwork/character-selection.ts:632-639`):
```typescript
firemaking: {
  level: savedData.firemakingLevel || 1,
  xp: savedData.firemakingXp || 0,
},
cooking: {
  level: savedData.cookingLevel || 1,
  xp: savedData.cookingXp || 0,
},
```

**Character Saving** (`packages/server/src/database/repositories/PlayerRepository.ts:149-153`):
```typescript
if (data.firemakingXp !== undefined) {
  updateData.firemakingXp = data.firemakingXp;
}
if (data.cookingXp !== undefined) {
  updateData.cookingXp = data.cookingXp;
}
```

### What About Items?

New items (cooked fish, burnt fish, logs) are stored as **item IDs** in existing tables:
- `inventory` table: `itemId` column stores string IDs (e.g., "shrimp", "burnt_lobster")
- `bank_storage` table: Same pattern
- **NO schema changes needed** - just add items to `items.json` manifest

### What About Fire Entities?

Fire entities are **temporary** and do NOT need database persistence:
- Fires exist for 60-119 seconds then despawn (OSRS-accurate)
- On server restart, fires naturally disappear (acceptable behavior)
- No `fires` table needed

### Summary

| Component | Database Change Needed |
|-----------|----------------------|
| Firemaking skill/XP | ❌ No - already exists |
| Cooking skill/XP | ❌ No - already exists |
| Cooked/burnt fish items | ❌ No - stored as itemId strings |
| Fire entities | ❌ No - temporary, no persistence |
| Range entities | ❌ No - world objects, not player data |

**Phase 1 database work: NONE**

---

## Appendix H: XP System Integration (Critical)

**CRITICAL**: The plan must integrate with the existing `SkillsSystem` via the `EventType.SKILLS_XP_GAINED` event. This is the pattern used by `ResourceSystem` for gathering skills.

### XP Awarding Pattern

```typescript
/**
 * XP System Integration for ProcessingSystem
 *
 * IMPORTANT: All XP must be awarded via EventType.SKILLS_XP_GAINED
 * to integrate with the existing SkillsSystem in:
 * packages/shared/src/systems/shared/character/SkillsSystem.ts
 *
 * The SkillsSystem:
 * - Listens for SKILLS_XP_GAINED events
 * - Updates player XP and level
 * - Emits SKILLS_LEVEL_UP on level-up
 * - Triggers XPDropSystem for visual feedback
 *
 * @see SkillsSystem.handleExternalXPGain() - the handler for this event
 * @see ResourceSystem line 2375 - existing pattern for gathering XP
 */

import { EventType } from "../../../../types/events";
import { PROCESSING_CONSTANTS } from "../../../../constants/ProcessingConstants";

// === XP AWARDING - FIREMAKING ===

/**
 * Award firemaking XP after successful fire creation.
 *
 * PATTERN: Matches ResourceSystem.ts line 2375
 */
private awardFiremakingXP(playerId: string, logId: string): void {
  // Get XP amount from constants
  const xpAmount = PROCESSING_CONSTANTS.FIREMAKING_XP[
    logId as keyof typeof PROCESSING_CONSTANTS.FIREMAKING_XP
  ];

  if (!xpAmount) {
    console.warn(`[ProcessingSystem] Unknown log type for XP: ${logId}`);
    return;
  }

  // Emit XP event - SkillsSystem will handle the rest
  this.emitTypedEvent(EventType.SKILLS_XP_GAINED, {
    playerId: playerId,
    skill: "firemaking",   // keyof Skills type
    amount: xpAmount,
  });
}

// === XP AWARDING - COOKING ===

/**
 * Award cooking XP after successful cook (not burnt).
 *
 * IMPORTANT: Only award XP when food is successfully cooked, NOT when burnt.
 * This matches OSRS behavior.
 */
private awardCookingXP(playerId: string, rawFoodId: string): void {
  // Get XP amount from constants
  const xpAmount = PROCESSING_CONSTANTS.COOKING_XP[
    rawFoodId as keyof typeof PROCESSING_CONSTANTS.COOKING_XP
  ];

  if (!xpAmount) {
    console.warn(`[ProcessingSystem] Unknown food type for XP: ${rawFoodId}`);
    return;
  }

  // Emit XP event - SkillsSystem will handle the rest
  this.emitTypedEvent(EventType.SKILLS_XP_GAINED, {
    playerId: playerId,
    skill: "cooking",   // keyof Skills type
    amount: xpAmount,
  });
}

// === INTEGRATION IN PROCESSING TICK ===

/**
 * In processFiremakingTick(), after successful fire creation:
 */
private onFiremakingSuccess(session: FiremakingSession): void {
  const { playerId, cachedLogId, cachedLogSlot } = session;

  // 1. Consume log from inventory
  this.consumeItem(playerId, cachedLogSlot, 1);

  // 2. Create fire entity
  const fireId = this.createFireAtPosition(session.cachedStartPosition);

  // 3. Award XP
  this.awardFiremakingXP(playerId, cachedLogId);

  // 4. Send success event for UI/animations
  this.emitTypedEvent(EventType.FIREMAKING_SUCCESS, {
    playerId,
    fireId,
    logType: cachedLogId,
    xpGained: session.cachedXpAmount,
  });

  // 5. Walk player west (OSRS behavior)
  this.walkPlayerWest(playerId, session.cachedStartPosition);
}

/**
 * In processCookingTick(), after successful cook:
 */
private onCookSuccess(session: CookingSession): void {
  const { playerId, cachedFoodId, cachedCookedId } = session;

  // 1. Remove raw food, add cooked food
  this.replaceItem(playerId, cachedFoodId, cachedCookedId);

  // 2. Award XP (only for successful cook, NOT burnt)
  this.awardCookingXP(playerId, cachedFoodId);

  // 3. Update session counts
  session.cookedCount++;
}

/**
 * In processCookingTick(), after burn:
 */
private onCookBurn(session: CookingSession): void {
  const { playerId, cachedFoodId, cachedBurntId } = session;

  // 1. Remove raw food, add burnt food
  this.replaceItem(playerId, cachedFoodId, cachedBurntId);

  // 2. NO XP awarded for burning (OSRS-accurate)
  // Do NOT call awardCookingXP() here

  // 3. Update session counts
  session.burntCount++;
}
```

### XP Drop Visual Feedback

The `XPDropSystem` automatically provides visual feedback:

```typescript
/**
 * XPDropSystem Integration (packages/shared/src/systems/client/XPDropSystem.ts)
 *
 * NO ADDITIONAL CODE NEEDED - XPDropSystem already:
 * 1. Listens for SKILLS_XP_GAINED events
 * 2. Creates floating XP text at player position
 * 3. Animates XP counter in HUD
 *
 * The visual feedback is automatic when using SKILLS_XP_GAINED events.
 */
```

### Skills Already Defined

The `firemaking` and `cooking` skills are already defined in SkillsSystem:

```typescript
// From packages/shared/src/systems/shared/character/SkillsSystem.ts line 47-57
const Skill = {
  ATTACK: "attack" as keyof Skills,
  STRENGTH: "strength" as keyof Skills,
  DEFENSE: "defense" as keyof Skills,
  RANGE: "ranged" as keyof Skills,
  CONSTITUTION: "constitution" as keyof Skills,
  WOODCUTTING: "woodcutting" as keyof Skills,
  FISHING: "fishing" as keyof Skills,
  FIREMAKING: "firemaking" as keyof Skills,  // ✅ Already defined
  COOKING: "cooking" as keyof Skills,         // ✅ Already defined
};
```

---

## Appendix I: Complete Manifest Edits (items.json)

**CRITICAL**: The current items.json does NOT contain cooked fish or burnt fish. These must be added.

### Complete Cooked Fish Entries

Add to `packages/server/world/assets/manifests/items.json`:

```json
{
  "id": "shrimp",
  "name": "Shrimp",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 10,
  "weight": 0.2,
  "description": "Some nicely cooked shrimp",
  "examine": "Some nicely cooked shrimp.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/shrimp.png",
  "healAmount": 3
},
{
  "id": "anchovies",
  "name": "Anchovies",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 15,
  "weight": 0.2,
  "description": "Some nicely cooked anchovies",
  "examine": "Some nicely cooked anchovies.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/anchovies.png",
  "healAmount": 1
},
{
  "id": "sardine",
  "name": "Sardine",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 20,
  "weight": 0.2,
  "description": "A nicely cooked sardine",
  "examine": "A nicely cooked sardine.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/sardine.png",
  "healAmount": 4
},
{
  "id": "herring",
  "name": "Herring",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 25,
  "weight": 0.2,
  "description": "A nicely cooked herring",
  "examine": "A nicely cooked herring.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/herring.png",
  "healAmount": 5
},
{
  "id": "trout",
  "name": "Trout",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 30,
  "weight": 0.3,
  "description": "A nicely cooked trout",
  "examine": "A nicely cooked trout.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/trout.png",
  "healAmount": 7
},
{
  "id": "pike",
  "name": "Pike",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 40,
  "weight": 0.4,
  "description": "A nicely cooked pike",
  "examine": "A nicely cooked pike.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/pike.png",
  "healAmount": 8
},
{
  "id": "salmon",
  "name": "Salmon",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 50,
  "weight": 0.3,
  "description": "A nicely cooked salmon",
  "examine": "A nicely cooked salmon.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/salmon.png",
  "healAmount": 9
},
{
  "id": "lobster",
  "name": "Lobster",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 150,
  "weight": 0.5,
  "description": "A nicely cooked lobster",
  "examine": "A nicely cooked lobster.",
  "tradeable": true,
  "rarity": "uncommon",
  "modelPath": null,
  "iconPath": "asset://icons/lobster.png",
  "healAmount": 12
},
{
  "id": "swordfish",
  "name": "Swordfish",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 200,
  "weight": 0.6,
  "description": "A nicely cooked swordfish",
  "examine": "A nicely cooked swordfish.",
  "tradeable": true,
  "rarity": "uncommon",
  "modelPath": null,
  "iconPath": "asset://icons/swordfish.png",
  "healAmount": 14
},
{
  "id": "monkfish",
  "name": "Monkfish",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 300,
  "weight": 0.5,
  "description": "A nicely cooked monkfish",
  "examine": "A nicely cooked monkfish.",
  "tradeable": true,
  "rarity": "uncommon",
  "modelPath": null,
  "iconPath": "asset://icons/monkfish.png",
  "healAmount": 16
},
{
  "id": "shark",
  "name": "Shark",
  "type": "consumable",
  "stackable": false,
  "maxStackSize": 1,
  "value": 500,
  "weight": 0.8,
  "description": "A nicely cooked shark",
  "examine": "A nicely cooked shark.",
  "tradeable": true,
  "rarity": "rare",
  "modelPath": null,
  "iconPath": "asset://icons/shark.png",
  "healAmount": 20
}
```

### Complete Burnt Fish Entries

```json
{
  "id": "burnt_shrimp",
  "name": "Burnt Shrimp",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.2,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_anchovies",
  "name": "Burnt Anchovies",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.2,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_sardine",
  "name": "Burnt Sardine",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.2,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_herring",
  "name": "Burnt Herring",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.2,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_trout",
  "name": "Burnt Trout",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.3,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_pike",
  "name": "Burnt Pike",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.4,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_salmon",
  "name": "Burnt Salmon",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.3,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_lobster",
  "name": "Burnt Lobster",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.5,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_swordfish",
  "name": "Burnt Swordfish",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.6,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_monkfish",
  "name": "Burnt Monkfish",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.5,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
},
{
  "id": "burnt_shark",
  "name": "Burnt Shark",
  "type": "junk",
  "stackable": false,
  "maxStackSize": 1,
  "value": 0,
  "weight": 0.8,
  "description": "Oops! It's ruined",
  "examine": "Oops! It's ruined.",
  "tradeable": false,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/burnt-fish.png"
}
```

### Complete Log Entries (Missing Variants)

Verify these log types exist. If not, add them:

```json
{
  "id": "willow_logs",
  "name": "Willow Logs",
  "type": "resource",
  "stackable": false,
  "maxStackSize": 100,
  "value": 15,
  "weight": 0.5,
  "description": "Logs from a willow tree",
  "examine": "Logs cut from a willow tree.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/willow-logs.png"
},
{
  "id": "maple_logs",
  "name": "Maple Logs",
  "type": "resource",
  "stackable": false,
  "maxStackSize": 100,
  "value": 25,
  "weight": 0.5,
  "description": "Logs from a maple tree",
  "examine": "Logs cut from a maple tree.",
  "tradeable": true,
  "rarity": "uncommon",
  "modelPath": null,
  "iconPath": "asset://icons/maple-logs.png"
},
{
  "id": "yew_logs",
  "name": "Yew Logs",
  "type": "resource",
  "stackable": false,
  "maxStackSize": 100,
  "value": 50,
  "weight": 0.5,
  "description": "Logs from a yew tree",
  "examine": "Logs cut from a yew tree.",
  "tradeable": true,
  "rarity": "rare",
  "modelPath": null,
  "iconPath": "asset://icons/yew-logs.png"
},
{
  "id": "magic_logs",
  "name": "Magic Logs",
  "type": "resource",
  "stackable": false,
  "maxStackSize": 100,
  "value": 150,
  "weight": 0.5,
  "description": "Logs from a magic tree",
  "examine": "Logs cut from a magic tree.",
  "tradeable": true,
  "rarity": "rare",
  "modelPath": null,
  "iconPath": "asset://icons/magic-logs.png"
},
{
  "id": "redwood_logs",
  "name": "Redwood Logs",
  "type": "resource",
  "stackable": false,
  "maxStackSize": 100,
  "value": 200,
  "weight": 0.5,
  "description": "Logs from a redwood tree",
  "examine": "Logs cut from a redwood tree.",
  "tradeable": true,
  "rarity": "rare",
  "modelPath": null,
  "iconPath": "asset://icons/redwood-logs.png"
}
```

### Equipment Entries (FUTURE)

**NOT IN INITIAL IMPLEMENTATION** - Add cooking gauntlets and cape in a future update:
- `cooking_gauntlets` - Reduces burn chance for lobster+ tier food
- `cooking_cape` - Level 99 cape, never burn any food

---

## Appendix J: DataManager Updates

**NO DATAMANAGER CHANGES REQUIRED**

After simplification, no new manifest files are needed:

| Original Plan | Simplified Approach |
|--------------|---------------------|
| `logs.json` | Use `PROCESSING_CONSTANTS.FIREMAKING_*` |
| `cookables.json` | Use `PROCESSING_CONSTANTS.COOKING_*` |
| `cooking-sources.json` | Not needed - fires are dynamic, ranges use constants |

**Why no DataManager changes:**
1. `items.json` is already loaded - just add new items there
2. Skill data is in TypeScript constants (type-safe, no runtime loading)
3. Zero new manifest files = zero new loading code

**What you DO need to update:**
- `packages/server/world/assets/manifests/items.json` - Add cooked/burnt fish, missing logs, equipment (see Appendix I)

---

## Summary: Simplified Implementation

**After analysis, the implementation is significantly simpler:**

### What's NOT Needed (Removed from Plan)
- ❌ `logs.json` - Use `PROCESSING_CONSTANTS.FIREMAKING_*` instead
- ❌ `cookables.json` - Use `PROCESSING_CONSTANTS.COOKING_*` instead
- ❌ `cooking-sources.json` - Fires are dynamic, ranges use constants
- ❌ DataManager changes - No new manifest loading code
- ❌ Database migrations - Schema already has firemaking/cooking columns

### What IS Needed

**1. Create ProcessingConstants.ts** (see Appendix A)
- All OSRS-accurate skill data
- Type-safe, compile-time checked
- Zero runtime loading

**2. Update items.json** (see Appendix I)

| Category | Items to Add | Status |
|----------|-------------|--------|
| Cooked fish | shrimp, anchovies, sardine, herring, trout, pike, salmon, lobster, swordfish, monkfish, shark | ❌ MISSING |
| Burnt fish | burnt_shrimp through burnt_shark (11 items) | ❌ MISSING |
| Log variants | willow_logs, maple_logs, yew_logs, magic_logs, redwood_logs | ❌ MISSING |
| Equipment | FUTURE: cooking_gauntlets, cooking_cape | ⏭️ DEFERRED |

**Items already in items.json:**
- ✅ `tinderbox` - exists
- ✅ `logs`, `oak_logs` - exist
- ✅ `raw_shrimp`, `raw_anchovies`, `raw_trout`, etc. - exist

### Implementation Complexity Reduction

| Aspect | Original Plan | Simplified |
|--------|--------------|------------|
| New manifest files | 3 | 0 |
| DataManager changes | Yes | No |
| Database migrations | Unknown | None needed |
| Total new lines in manifests | ~500 | ~400 (items.json only) |

---

## OSRS Accuracy Verification (January 2026)

**All mechanics verified against OSRS Wiki and Mod Ash tweets.**

### Firemaking ✅ Verified
| Mechanic | Plan Value | Wiki Source | Status |
|----------|------------|-------------|--------|
| Success formula | 65/256 → 513/256 LERP | [Firemaking wiki](https://oldschool.runescape.wiki/w/Firemaking) | ✅ Correct |
| 100% success level | Level 43 | Wiki + formula | ✅ Correct |
| Tick timing | 4 ticks (2.4s) | Wiki | ✅ Correct |
| Walk priority | W → E → S → N | Wiki | ✅ Correct |
| Fire duration | 60-119 seconds | Per Mod Ash | ✅ Corrected |
| Normal logs XP | 40 | Wiki | ✅ Correct |
| Oak logs XP | 60 | Wiki | ✅ Correct |
| Willow logs XP | 90 | Wiki | ✅ Correct |
| Yew logs XP | 202.5 | Wiki | ✅ Correct |
| Magic logs XP | 303.8 | Wiki | ✅ Correct |

### Cooking ✅ Verified
| Mechanic | Plan Value | Wiki Source | Status |
|----------|------------|-------------|--------|
| Tick timing | 4 ticks (2.4s) | Wiki (2-tick is advanced tech) | ✅ Correct |
| Shrimp XP | 30 | Wiki | ✅ Correct |
| Lobster XP | 120 | Wiki | ✅ Correct |
| Shark XP | 210 | Wiki | ✅ Correct |

### Burn Levels ✅ Corrected
| Food | Original Fire | Corrected Fire | Wiki |
|------|---------------|----------------|------|
| Trout | 50 | **49** | 49 |
| Pike | 64 | **54** | 54 |
| Lobster (range) | 68 | **74** | 74 |
| Swordfish (range) | 81 | **80** | 80 |

### Architecture ✅ Sound
- Follows `GatheringConstants.ts` pattern (verified against codebase)
- Zero-allocation patterns match existing systems
- Server-authoritative validation
- Rate limiting implementation
- Object pooling ready

### Tick-Based Timing ✅ Verified
All game logic uses **game ticks** (600ms), NOT milliseconds:

| Value | Type | Usage |
|-------|------|-------|
| `startTick`, `nextAttemptTick` | Ticks | Session timing |
| `expiresAtTick` | Ticks | Fire expiration |
| `minDurationTicks`, `maxDurationTicks` | Ticks | Fire duration (100-198) |
| `baseRollTicks`, `ticksPerItem` | Ticks | Skill mechanics (4) |
| `MINIMUM_CYCLE_TICKS` | Ticks | Min action interval (2) |
| `RATE_LIMIT_MS` | **MS** | Anti-spam only (Date.now()) |

**Pattern**: Only `RATE_LIMIT_MS` uses milliseconds (for anti-spam with `Date.now()`).
All other timing is tick-based, matching `GatheringConstants.ts` and `ResourceSystem.ts`.
