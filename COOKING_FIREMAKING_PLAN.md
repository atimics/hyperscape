# Cooking Distance Checking & Firemaking Movement Plan

This document outlines the implementation plan for two OSRS-accurate features:
1. **Cooking distance checking** - Walk to fire if too far away
2. **Firemaking movement** - Move to adjacent tile after lighting fire

---

## Research Summary

### Woodcutting/Gathering Distance Pattern (Reference Implementation)

The gathering system uses `PendingGatherManager` for server-authoritative "walk then act":

**Key files:**
- `packages/server/src/systems/ServerNetwork/PendingGatherManager.ts` - Server-side pathing manager
- `packages/shared/src/systems/client/interaction/services/ActionQueueService.ts` - Client-side action queue
- `packages/shared/src/systems/client/interaction/handlers/ResourceInteractionHandler.ts` - Client handler
- `packages/shared/src/systems/shared/entities/ResourceSystem.ts` - Cardinal adjacency validation

**Server-Authoritative Flow:**
1. Client sends `resourceInteract` message with just `resourceId` (no position)
2. Server looks up resource's TRUE position from `ResourceSystem.getResource()`
3. Server calculates best cardinal tile using `GATHERING_CONSTANTS.GATHERING_RANGE = 1`
4. Server paths player via `tileMovementManager.movePlayerToward()`
5. Every tick, `PendingGatherManager.processTick()` checks if player arrived
6. When arrived, server sets face direction and starts gathering via `EventType.RESOURCE_GATHER`

**Cardinal Adjacency Check (from PendingGatherManager):**
```typescript
private isOnCardinalTile(
  playerTile: TileCoord,
  resourceAnchor: TileCoord,
  footprintX: number,
  footprintZ: number,
): boolean {
  for (let ox = 0; ox < footprintX; ox++) {
    for (let oz = 0; oz < footprintZ; oz++) {
      const resourceTile = { x: resourceAnchor.x + ox, z: resourceAnchor.z + oz };
      // tilesWithinMeleeRange with GATHERING_RANGE checks cardinal-only
      if (tilesWithinMeleeRange(playerTile, resourceTile, GATHERING_CONSTANTS.GATHERING_RANGE)) {
        return true;
      }
    }
  }
  return false;
}
```

**TileSystem Utilities (already exist):**
- `tilesWithinMeleeRange()` - Cardinal-only range check for GATHERING_RANGE=1
- `worldToTile()` / `tileToWorld()` - Coordinate conversion
- `getCardinalTiles()` - Get N/E/S/W adjacent tiles

### OSRS Firemaking Movement

From [OSRS Wiki - Firemaking](https://oldschool.runescape.wiki/w/Firemaking):

> "After lighting a fire, the player will walk one step to the west if there is room there; otherwise, they will take one step east. If both ways are blocked, the player will move south. If all three ways are blocked, the player will travel north."

**Priority order:** West → East → South → North

**Additional mechanics:**
- Logs are dropped on the ground before ignition
- Fire spawns at the log position
- Player moves AFTER fire lights (not during)
- If all 4 directions blocked, player stays in place

---

## Implementation Plan

### Phase 1: Cooking Distance Checking

#### 1.1 Server-Side: Add PendingCookManager to ServerNetwork

**File:** `packages/server/src/systems/ServerNetwork/PendingCookManager.ts`

Follow the same pattern as `PendingGatherManager.ts`:

```typescript
interface PendingCook {
  playerId: string;
  fireId: string;
  firePosition: { x: number; y: number; z: number };
  fireTile: TileCoord;
  lastPlayerTile: TileCoord;
  createdTick: number;
}

export class PendingCookManager {
  private world: World;
  private tileMovementManager: TileMovementManager;
  private pendingCooks: Map<string, PendingCook> = new Map();

  constructor(world: World, tileMovementManager: TileMovementManager) { ... }

  /**
   * Queue a pending cook - paths player to fire first
   */
  queuePendingCook(
    playerId: string,
    fireId: string,
    firePosition: { x: number; y: number; z: number },
    currentTick: number,
    runMode?: boolean,
  ): void {
    // Cancel existing pending cook
    this.cancelPendingCook(playerId);

    // Get player position
    const player = this.world.getPlayer(playerId);
    const playerTile = worldToTile(player.position.x, player.position.z);
    const fireTile = worldToTile(firePosition.x, firePosition.z);

    // Check if already adjacent (cardinal)
    if (tilesWithinMeleeRange(playerTile, fireTile, GATHERING_CONSTANTS.GATHERING_RANGE)) {
      // Already in range - start cooking immediately
      this.startCooking(playerId, fireId);
      return;
    }

    // Path player to fire
    this.tileMovementManager.movePlayerToward(
      playerId,
      firePosition,
      runMode ?? true,
      GATHERING_CONSTANTS.GATHERING_RANGE, // Cardinal-only
    );

    // Store pending cook
    this.pendingCooks.set(playerId, {
      playerId,
      fireId,
      firePosition,
      fireTile,
      lastPlayerTile: playerTile,
      createdTick: currentTick,
    });
  }

  /**
   * Called every tick - check if players arrived at fires
   */
  processTick(currentTick: number): void {
    for (const [playerId, pending] of this.pendingCooks) {
      // Check timeout (20 ticks = 12 seconds)
      if (currentTick - pending.createdTick > 20) {
        this.pendingCooks.delete(playerId);
        continue;
      }

      // Check if fire still exists
      const processingSystem = this.world.getSystem('processing');
      const fire = processingSystem?.activeFires?.get(pending.fireId);
      if (!fire || !fire.isActive) {
        this.pendingCooks.delete(playerId);
        continue;
      }

      // Check if player arrived at cardinal tile
      const player = this.world.getPlayer(playerId);
      const playerTile = worldToTile(player.position.x, player.position.z);

      if (tilesWithinMeleeRange(playerTile, pending.fireTile, GATHERING_CONSTANTS.GATHERING_RANGE)) {
        // Arrived - start cooking
        this.startCooking(playerId, pending.fireId);
        this.pendingCooks.delete(playerId);
      }
    }
  }

  private startCooking(playerId: string, fireId: string): void {
    this.world.emit(EventType.PROCESSING_COOKING_REQUEST, {
      playerId,
      fireId,
      fishSlot: -1, // Server finds first raw_shrimp slot
    });
  }
}
```

#### 1.2 Update ServerNetwork to use PendingCookManager

In `packages/server/src/systems/ServerNetwork/index.ts`:

```typescript
import { PendingCookManager } from './PendingCookManager';

// In constructor
this.pendingCookManager = new PendingCookManager(world, this.tileMovementManager);

// In tick handler
this.pendingCookManager.processTick(this.currentTick);

// Add message handler for cooking
this.onMessage('cookingSourceInteract', (playerId, data) => {
  const { sourceId, sourceType, position } = data;
  this.pendingCookManager.queuePendingCook(
    playerId,
    sourceId,
    { x: position[0], y: position[1], z: position[2] },
    this.currentTick,
  );
});
```

#### 1.3 Client-Side: Simplify CookingSourceInteractionHandler

The client just sends fire ID to server - server handles distance:

```typescript
private executeCook(target: RaycastTarget): void {
  // SERVER-AUTHORITATIVE: Just send fire ID, server handles pathing
  this.send("cookingSourceInteract", {
    sourceId: target.entityId,
    sourceType: target.entityType === "range" ? "range" : "fire",
    position: [target.position.x, target.position.y, target.position.z],
  });
}
```

---

### Phase 2: Firemaking Movement

#### 2.1 Add Movement Logic to ProcessingSystem

The firemaking movement can be added directly to `ProcessingSystem.completeFiremakingProcess()`:

**In `packages/shared/src/systems/shared/interaction/ProcessingSystem.ts`:**

```typescript
// OSRS movement priority: West → East → South → North
private readonly FIREMAKING_MOVE_PRIORITY = [
  { dx: -1, dz: 0 },  // West
  { dx: 1, dz: 0 },   // East
  { dx: 0, dz: 1 },   // South (note: +Z is south in our coordinate system)
  { dx: 0, dz: -1 },  // North
];

/**
 * Find the tile to move to after lighting a fire (OSRS-accurate)
 * Priority: West → East → South → North
 */
private findFiremakingMoveTarget(
  firePosition: { x: number; y: number; z: number },
): { x: number; y: number; z: number } | null {
  const fireTile = worldToTile(firePosition.x, firePosition.z);

  for (const offset of this.FIREMAKING_MOVE_PRIORITY) {
    const targetTile = {
      x: fireTile.x + offset.dx,
      z: fireTile.z + offset.dz,
    };

    // Check if tile is walkable (no fires, no terrain blockers)
    if (this.isTileWalkableForFiremaking(targetTile)) {
      const worldPos = tileToWorld(targetTile);
      return { x: worldPos.x, y: firePosition.y, z: worldPos.z };
    }
  }

  // All 4 directions blocked - stay in place
  return null;
}

/**
 * Check if a tile is walkable for firemaking movement
 */
private isTileWalkableForFiremaking(tile: TileCoord): boolean {
  // Check for existing fires at this tile
  for (const [, fire] of this.activeFires) {
    if (!fire.isActive) continue;
    const fireTile = worldToTile(fire.position.x, fire.position.z);
    if (fireTile.x === tile.x && fireTile.z === tile.z) {
      return false; // Fire already at this tile
    }
  }

  // TODO: Check terrain walkability via TerrainSystem if available
  // const terrain = this.world.getSystem('terrain');
  // if (terrain && !terrain.isWalkable(tile.x, tile.z)) return false;

  return true;
}
```

#### 2.2 Update completeFiremakingProcess to Move Player

```typescript
private completeFiremakingProcess(
  playerId: string,
  action: ProcessingAction,
  position: { x: number; y: number; z: number },
): void {
  // ... existing code to create fire ...

  // OSRS: Move player to adjacent tile after lighting fire
  const moveTarget = this.findFiremakingMoveTarget(position);
  if (moveTarget) {
    this.movePlayerAfterFiremaking(playerId, moveTarget);
  }

  // ... existing success message ...
}

/**
 * Move player to target tile after lighting fire
 * Uses server-authoritative tile movement
 */
private movePlayerAfterFiremaking(
  playerId: string,
  target: { x: number; y: number; z: number },
): void {
  // Emit tile movement request to server's TileMovementManager
  // This ensures proper sync with client interpolation
  this.world.emit(EventType.PLAYER_MOVE_REQUEST, {
    playerId,
    target: [target.x, target.y, target.z],
    instant: true, // Instant move, not pathfinding
  });
}
```

#### 2.3 Helper Method: hasFireAtTile

```typescript
/**
 * Check if there's an active fire at a given tile position
 */
hasFireAtTile(tile: TileCoord): boolean {
  for (const [, fire] of this.activeFires) {
    if (!fire.isActive) continue;
    const fireTile = worldToTile(fire.position.x, fire.position.z);
    if (fireTile.x === tile.x && fireTile.z === tile.z) {
      return true;
    }
  }
  return false;
}
```

---

## File Changes Summary

### New Files
1. `packages/server/src/systems/ServerNetwork/PendingCookManager.ts`
   - Modeled after `PendingGatherManager.ts`
   - Handles walk-to-fire-then-cook pattern
   - Uses `tileMovementManager.movePlayerToward()` with `GATHERING_RANGE = 1`

### Modified Files
1. `packages/shared/src/systems/shared/interaction/ProcessingSystem.ts`
   - Add `FIREMAKING_MOVE_PRIORITY` constant (West → East → South → North)
   - Add `findFiremakingMoveTarget()` method
   - Add `isTileWalkableForFiremaking()` method
   - Add `movePlayerAfterFiremaking()` method
   - Add `hasFireAtTile()` method
   - Call `findFiremakingMoveTarget()` in `completeFiremakingProcess()`

2. `packages/server/src/systems/ServerNetwork/index.ts`
   - Import and instantiate `PendingCookManager`
   - Add `cookingSourceInteract` message handler
   - Call `pendingCookManager.processTick()` each tick

3. `packages/shared/src/systems/client/interaction/handlers/CookingSourceInteractionHandler.ts`
   - Already sends `cookingSourceInteract` - no changes needed

---

## Testing Checklist

### Cooking Distance Checking
- [ ] Player on cardinal tile adjacent to fire → cooking starts immediately
- [ ] Player 2+ tiles away → walks to fire, then cooks
- [ ] Player on diagonal tile → walks to cardinal tile first
- [ ] Fire expires while walking → silently cancels pending cook
- [ ] Player clicks different fire while walking → cancels old pending, starts new
- [ ] Multiple players cooking at same fire → all work correctly
- [ ] Timeout after 12 seconds (20 ticks) → pending cook cancelled

### Firemaking Movement
- [ ] Space west → player moves west after lighting
- [ ] West blocked by fire, space east → player moves east
- [ ] West+East blocked, space south → player moves south
- [ ] West+East+South blocked, space north → player moves north
- [ ] All 4 blocked → player stays in place (on fire tile)
- [ ] Existing fire blocks movement → treated as blocked tile
- [ ] Chain firemaking (multiple logs) → moves correctly each time
- [ ] Player position syncs to client correctly after move

---

## OSRS Reference Links

- [Firemaking - OSRS Wiki](https://oldschool.runescape.wiki/w/Firemaking)
- [Cooking - OSRS Wiki](https://oldschool.runescape.wiki/w/Cooking)
- [Fire - OSRS Wiki](https://oldschool.runescape.wiki/w/Fire)

---

## Implementation Order

**Recommended: Phase 2 first (Firemaking Movement)**

1. **Phase 2 (Firemaking Movement)** - Simpler, contained in ProcessingSystem.ts
   - Only modifies one file in `packages/shared`
   - Uses existing TileSystem utilities (`worldToTile`, `tileToWorld`)
   - No new server message handlers needed
   - Testable immediately after implementation

2. **Phase 1 (Cooking Distance)** - More complex
   - Requires new file in `packages/server` (PendingCookManager)
   - Requires updates to ServerNetwork message handling
   - Follows PendingGatherManager pattern exactly
   - Needs integration with ProcessingSystem's fire tracking

---

## Coordinate System Notes

- `+X` = East, `-X` = West
- `+Z` = South, `-Z` = North (standard Three.js convention)
- OSRS Wiki says "west" priority, so we use `-X` first
- Verify coordinate mapping in-game if movement feels wrong

---

## Complexity Assessment

| Feature | New Files | Modified Files | Pattern Complexity |
|---------|-----------|----------------|-------------------|
| Cooking Distance | 1 | 2 | High (follows PendingGatherManager) |
| Firemaking Movement | 0 | 1 | Low (simple tile iteration) |

Total estimated effort: **Medium** - Primary complexity is in the server-side PendingCookManager.
