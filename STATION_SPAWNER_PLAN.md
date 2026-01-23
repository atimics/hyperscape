# Plan: Data-Driven Station Spawning via world-areas.json

## Overview

Move station definitions (bank, altar, furnace, anvil, range) from hardcoded positions in `EntityManager.ts` to the data-driven `world-areas.json` manifest. This follows the existing pattern used for NPCs, resources, and mob spawns, and introduces a dedicated `StationSpawnerSystem` modeled after `MobNPCSpawnerSystem`.

---

## Current State

### Hardcoded Stations (EntityManager.ts:268-416)

The `spawnWorldObjects()` method hardcodes all station positions:

| Station | Position | Notes |
|---------|----------|-------|
| Bank | (0, y, -25) | Behind player spawn |
| Furnace | (-15, y, 15) | Near mining area |
| Anvil | (-12, y, 15) | Near furnace |
| Altar | (3, y, -25) | Near bank |
| Cooking Range | (-17, y, -13) | Near fisherman NPC |

### Existing Data-Driven Pattern (world-areas.json)

Other entity types already use data-driven spawning:

- **NPCs**: `{ id, type, position, storeId? }` → looks up full data from `npcs.json`
- **Resources**: `{ type, position, resourceId }` → looks up full data from `gathering/*.json`
- **MobSpawns**: `{ mobId, position, spawnRadius, maxCount }` → looks up full data from `npcs.json`

### Station Manifest (stations.json)

Already exists with station definitions:
```json
{
  "stations": [
    { "type": "anvil", "name": "Anvil", "model": "asset://...", "modelScale": 0.5, "modelYOffset": 0.2, "examine": "..." },
    { "type": "furnace", ... },
    { "type": "range", ... },
    { "type": "bank", ... },
    { "type": "altar", ... }
  ]
}
```

---

## Target State

Stations will be defined in `world-areas.json` with positions only, while `stations.json` provides the full station data (model, scale, examine text). A new `StationSpawnerSystem` will spawn them at world start.

---

## Implementation Phases

### Phase 1: Type Definitions

**File: `/packages/shared/src/types/world/world-types.ts`**

#### 1.1 Add StationLocation interface (after line 252)

```typescript
/**
 * Station placement in a world area
 * Position only - full data comes from stations.json manifest
 */
export interface StationLocation {
  /** Unique instance ID for this station */
  id: string;
  /** Station type - must match type in stations.json (anvil, furnace, range, bank, altar) */
  type: "bank" | "furnace" | "anvil" | "altar" | "range";
  /** World position (Y will be grounded to terrain) */
  position: WorldPosition;
  /** Optional rotation in degrees (Y-axis only, default: 0) */
  rotation?: number;
  /** Optional: override bankId for bank stations (default: "spawn_bank") */
  bankId?: string;
}
```

#### 1.2 Update WorldArea interface (add after line 289, before closing brace)

```typescript
export interface WorldArea {
  // ... existing fields (id, name, description, etc.) ...

  /** Station placements for this area (furnaces, anvils, banks, altars, ranges) */
  stations?: StationLocation[];
}
```

---

### Phase 2: Helper Functions

**File: `/packages/shared/src/data/world-areas.ts`**

Add helper function following existing pattern (near other helper functions):

```typescript
/**
 * Get all stations defined in a specific area
 * @param areaId - The area ID to query
 * @returns Array of station locations, or empty array if none
 */
export function getStationsInArea(areaId: string): StationLocation[] {
  const area = getAreaById(areaId);
  return area?.stations ?? [];
}
```

Also add the type import at the top:
```typescript
import type { StationLocation } from "../types/world/world-types";
```

---

### Phase 3: Update world-areas.json

**File: `/packages/server/world/assets/manifests/world-areas.json`**

Add `stations` array to `central_haven` (after `fishing` config, before closing brace):

```json
{
  "starterTowns": {
    "central_haven": {
      "id": "central_haven",
      "name": "Central Haven",
      "description": "...",
      "npcs": [ ... ],
      "resources": [ ... ],
      "mobSpawns": [ ... ],
      "fishing": { ... },
      "stations": [
        {
          "id": "bank_spawn",
          "type": "bank",
          "position": { "x": 0, "y": 0, "z": -25 },
          "bankId": "spawn_bank"
        },
        {
          "id": "furnace_spawn",
          "type": "furnace",
          "position": { "x": -15, "y": 0, "z": 15 }
        },
        {
          "id": "anvil_spawn",
          "type": "anvil",
          "position": { "x": -12, "y": 0, "z": 15 }
        },
        {
          "id": "altar_spawn",
          "type": "altar",
          "position": { "x": 3, "y": 0, "z": -25 }
        },
        {
          "id": "range_spawn",
          "type": "range",
          "position": { "x": -17, "y": 0, "z": -13 }
        }
      ]
    }
  }
}
```

---

### Phase 4: Create StationSpawnerSystem

**New File: `/packages/shared/src/systems/shared/entities/StationSpawnerSystem.ts`**

Create a new system following the `MobNPCSpawnerSystem` pattern:

```typescript
/**
 * StationSpawnerSystem - Spawns world stations from world-areas.json
 *
 * Spawns permanent stations (banks, furnaces, anvils, altars, ranges)
 * defined in world-areas.json. Uses stations.json for model/config data.
 *
 * Pattern follows MobNPCSpawnerSystem:
 * - Extends SystemBase
 * - Depends on entity-manager and terrain
 * - Spawns at world start (not reactively like mobs)
 */

import { ALL_WORLD_AREAS } from "../../../data/world-areas";
import { stationDataProvider } from "../../../data/StationDataProvider";
import type { World } from "../../../types/index";
import { SystemBase } from "../infrastructure/SystemBase";
import { TerrainSystem } from "..";
import { EntityType } from "../../../types/entities";

export class StationSpawnerSystem extends SystemBase {
  constructor(world: World) {
    super(world, {
      name: "station-spawner",
      dependencies: {
        required: ["entity-manager", "terrain"],
        optional: [],
      },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {
    // No event subscriptions needed - stations are static
  }

  async start(): Promise<void> {
    // Only server spawns stations
    if (this.world.isServer) {
      await this.spawnAllStationsFromManifest();
    }
  }

  /**
   * Spawn all stations defined in world-areas.json
   * Similar to MobNPCSpawnerSystem.spawnAllNPCsFromManifest()
   */
  private async spawnAllStationsFromManifest(): Promise<void> {
    // Wait for EntityManager to be ready (same pattern as MobNPCSpawnerSystem)
    let entityManager = this.world.getSystem("entity-manager") as {
      spawnEntity?: (config: unknown) => Promise<unknown>;
    } | null;
    let attempts = 0;

    while ((!entityManager || !entityManager.spawnEntity) && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      entityManager = this.world.getSystem("entity-manager") as {
        spawnEntity?: (config: unknown) => Promise<unknown>;
      } | null;
      attempts++;
    }

    if (!entityManager?.spawnEntity) {
      console.error(
        "[StationSpawnerSystem] EntityManager not available for station spawning"
      );
      return;
    }

    // Get terrain height function
    const terrainSystem = this.world.getSystem("terrain") as {
      getHeightAt?: (x: number, z: number) => number | null;
    } | null;

    // Iterate through all world areas
    for (const [areaId, area] of Object.entries(ALL_WORLD_AREAS)) {
      if (!area.stations || area.stations.length === 0) continue;

      for (const station of area.stations) {
        // Get ground height at station position
        const groundY =
          terrainSystem?.getHeightAt?.(station.position.x, station.position.z) ?? 40;
        const spawnY = groundY + 0.1; // Slight offset to sit on ground

        // Get station manifest data for display name
        const stationData = stationDataProvider.getStationData(station.type);
        const stationName = stationData?.name ?? station.type;

        // Build entity config based on station type
        const baseConfig = {
          id: `station_${station.id}`,
          name: stationName,
          position: { x: station.position.x, y: spawnY, z: station.position.z },
        };

        // Map station type to EntityType
        const entityTypeMap: Record<string, string> = {
          bank: EntityType.BANK,
          furnace: EntityType.FURNACE,
          anvil: EntityType.ANVIL,
          altar: EntityType.ALTAR,
          range: EntityType.RANGE,
        };

        const entityType = entityTypeMap[station.type] ?? station.type;

        // Add type-specific properties
        const stationConfig = {
          ...baseConfig,
          type: entityType,
          // Bank-specific: include bankId
          ...(station.type === "bank" && {
            bankId: station.bankId ?? "spawn_bank",
          }),
        };

        try {
          await entityManager.spawnEntity(stationConfig);
          console.log(
            `[StationSpawnerSystem] Spawned ${station.type} "${stationName}" at (${station.position.x}, ${spawnY.toFixed(2)}, ${station.position.z})`
          );
        } catch (err) {
          console.error(
            `[StationSpawnerSystem] Failed to spawn ${station.type} ${station.id}:`,
            err
          );
        }
      }
    }
  }
}
```

---

### Phase 5: Register the System

#### 5.1 Export from entities index

**File: `/packages/shared/src/systems/shared/entities/index.ts`**

Add export:
```typescript
export * from "./StationSpawnerSystem";
```

#### 5.2 Register in SystemLoader

**File: `/packages/shared/src/systems/shared/infrastructure/SystemLoader.ts`**

Add import (near other entity system imports, ~line 102):
```typescript
import { StationSpawnerSystem } from "..";
```

Add to Systems interface (~line 163):
```typescript
export interface Systems {
  // ... existing systems ...
  stationSpawner?: StationSpawnerSystem;
}
```

Add registration (after mob-npc-spawner registration, ~line 393):
```typescript
world.register("station-spawner", StationSpawnerSystem);
```

Add to initialization section (after mob-npc-spawner, ~line 447):
```typescript
refs.stationSpawner = world.getSystem("station-spawner") as StationSpawnerSystem;
```

---

### Phase 6: Remove Hardcoded Spawning

**File: `/packages/shared/src/systems/shared/entities/EntityManager.ts`**

#### 6.1 Delete spawnWorldObjects() method

Remove the entire `spawnWorldObjects()` method (lines 268-416), which includes:
- Bank spawning
- Furnace spawning
- Anvil spawning
- Altar spawning
- Range spawning

#### 6.2 Update start() method

Change `start()` method from:
```typescript
async start(): Promise<void> {
  if (this.world.isServer) {
    await this.spawnWorldObjects();
  }
}
```

To:
```typescript
async start(): Promise<void> {
  // Stations are now spawned by StationSpawnerSystem from world-areas.json
}
```

Or remove the method entirely if it's empty.

#### 6.3 Clean up imports

Remove unused imports that were only used by `spawnWorldObjects()`:
- `BankEntityConfig` (if unused elsewhere)
- `FurnaceEntityConfig` (if unused elsewhere)
- `AnvilEntityConfig` (if unused elsewhere)
- `AltarEntityConfig` (if unused elsewhere)
- `RangeEntityConfig` (if unused elsewhere)

---

### Phase 7: Testing Checklist

1. **Build**: Run `bun run build` - verify TypeScript compiles without errors
2. **Server Startup**: Run `bun run dev` - verify stations spawn with correct log messages
3. **Visual Check**: Verify all 5 stations appear at correct positions with correct models
4. **Interactions**: Test each station type:
   - [ ] Bank: Opens bank interface
   - [ ] Furnace: Opens smelting interface
   - [ ] Anvil: Opens smithing interface
   - [ ] Altar: Restores prayer points
   - [ ] Range: Opens cooking interface
5. **Collision**: Verify player cannot walk through stations
6. **Models**: Verify 3D models load correctly (not placeholder boxes)

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `world-types.ts` | Modify | Add `StationLocation` interface, update `WorldArea` |
| `world-areas.ts` | Modify | Add `getStationsInArea()` helper function |
| `world-areas.json` | Modify | Add `stations` array to `central_haven` |
| `StationSpawnerSystem.ts` | **Create** | New system for station spawning |
| `entities/index.ts` | Modify | Export `StationSpawnerSystem` |
| `SystemLoader.ts` | Modify | Import, register, and initialize new system |
| `EntityManager.ts` | Modify | Remove `spawnWorldObjects()` method |

---

## Reference: MobNPCSpawnerSystem Pattern

The new `StationSpawnerSystem` follows these patterns from `MobNPCSpawnerSystem`:

| Aspect | MobNPCSpawnerSystem | StationSpawnerSystem |
|--------|---------------------|----------------------|
| Base Class | `SystemBase` | `SystemBase` |
| System Name | `"mob-npc-spawner"` | `"station-spawner"` |
| Dependencies | `entity-manager`, `terrain` | `entity-manager`, `terrain` |
| Data Source | `ALL_WORLD_AREAS.npcs` | `ALL_WORLD_AREAS.stations` |
| Manifest Lookup | `getNPCById()` from `npcs.json` | `stationDataProvider.getStationData()` from `stations.json` |
| Spawn Timing | `start()` - immediate | `start()` - immediate |
| Terrain Grounding | `terrainSystem.getHeightAt()` | `terrainSystem.getHeightAt()` |
| EntityManager Wait | Polls with 100ms timeout, 50 attempts | Same pattern |

---

## Benefits

1. **Data-driven**: Station positions configurable via JSON without code changes
2. **Consistent**: Follows same pattern as NPCs, resources, mob spawns
3. **Extensible**: Easy to add stations to new areas (just add JSON entries)
4. **Maintainable**: Single source of truth for world layout
5. **Designer-friendly**: Non-programmers can edit JSON to place stations
6. **Separation of Concerns**: Dedicated system handles station spawning

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking station interactions | Low | High | Test all 5 station types after implementation |
| Missing stations on spawn | Low | Medium | Add logging, verify ALL_WORLD_AREAS loads before spawning |
| Incorrect Y positioning | Low | Low | Use proven terrain grounding pattern from NPC spawning |
| System initialization order | Low | Medium | Use dependency declaration and EntityManager wait loop |
| Duplicate station IDs | Low | Low | Use unique IDs like `station_{type}_{area}` |

---

## Future Considerations

- Add station rotation support if needed
- Consider adding stations to other world areas as they're created
- Could extend to support custom station properties per-instance
- Could add a station editor UI in asset-forge
