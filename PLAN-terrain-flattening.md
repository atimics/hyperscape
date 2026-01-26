# Terrain Flattening for World Stations

> **Issue:** #643 - Flatten ground where objects are (like prayer altar)

## Problem Statement

World stations (altars, furnaces, anvils, ranges, banks) spawn on procedurally generated terrain that may be sloped or uneven. This causes visual artifacts where objects appear to float above the ground or clip into hillsides.

**Before:**
```
     Station
        ▓▓
    ___/▓▓\___    <- Station floating/clipping on slope
   /          \
```

**After:**
```
     Station
        ▓▓
    ___████___    <- Flat ground pad under station
   /          \
```

---

## Solution Overview

**Manifest-driven terrain flattening** - Load station positions and footprints from existing JSON manifests, register "flat zones" in the terrain system before any tiles generate, and blend heights smoothly at zone edges.

### Why This Approach?

1. **Data-driven** - Configuration lives in JSON, not code
2. **Deterministic** - Same manifest = identical terrain on client/server
3. **Zero runtime cost** - Flat zones loaded once at startup
4. **Seamless integration** - Uses existing manifest pipeline
5. **Opt-in per station** - Some stations may look fine on slopes

---

## Current Architecture

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/server/world/assets/manifests/stations.json` | Station type definitions (model, scale, etc.) |
| `packages/server/world/assets/manifests/world-areas.json` | Station placements (positions per area) |
| `packages/server/world/assets/manifests/model-bounds.json` | Auto-generated model dimensions |
| `packages/shared/src/data/StationDataProvider.ts` | Runtime access to station data + footprint calculation |
| `packages/shared/src/systems/shared/world/TerrainSystem.ts` | Terrain generation, `getHeightAt()` |
| `packages/shared/src/systems/shared/entities/StationSpawnerSystem.ts` | Spawns station entities from manifest |

### Current Flow

```
1. DataManager loads manifests (stations.json, world-areas.json, model-bounds.json)
2. TerrainSystem.init() initializes noise and biomes
3. TerrainSystem generates tiles via getHeightAt() [procedural noise + mountain boost]
4. StationSpawnerSystem spawns stations at terrain height + 0.1
5. Stations may float or clip on sloped terrain
```

### Key Units

| System | Tile Size | Usage |
|--------|-----------|-------|
| **Movement/Collision** (TileSystem) | 1m = 1 tile | Station footprints (e.g., 2x2 = 2m x 2m) |
| **Terrain** (TerrainSystem) | 100m = 1 tile | Terrain chunk loading, spatial indexing |

Station footprints from `resolveFootprint()` return **movement tiles** (1m units), NOT terrain tiles.

### Key Insight

`getHeightAt(x, z)` is called for every terrain vertex. By checking flat zones before procedural generation, we can override heights in specific areas with zero additional per-vertex cost outside those areas.

---

## Implementation Plan

### Phase 1: Manifest Schema Update

**File:** `packages/server/world/assets/manifests/stations.json`

Add flattening configuration to station type definitions:

```json
{
  "stations": [
    {
      "type": "altar",
      "name": "Altar",
      "model": "asset://models/altar/altar.glb",
      "modelScale": 1.2,
      "modelYOffset": 0.5,
      "examine": "An altar for prayer.",
      "flattenGround": true,
      "flattenPadding": 0.4,
      "flattenBlendRadius": 0.5
    }
  ]
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `flattenGround` | boolean | `false` | Enable terrain flattening under this station type |
| `flattenPadding` | number | `0.3` | Extra meters around footprint to flatten |
| `flattenBlendRadius` | number | `0.5` | Meters over which to blend from flat to procedural |

**File:** `packages/shared/src/data/StationDataProvider.ts`

Update `StationManifestEntry` interface:

```typescript
export interface StationManifestEntry {
  type: string;
  name: string;
  model: string | null;
  modelScale: number;
  modelYOffset: number;
  examine: string;
  footprint?: FootprintSpec;
  // NEW: Terrain flattening options
  flattenGround?: boolean;
  flattenPadding?: number;
  flattenBlendRadius?: number;
}
```

---

### Phase 2: Flat Zone Data Structure

**File:** `packages/shared/src/types/world/terrain-types.ts` (new file or add to existing)

```typescript
/**
 * Defines a rectangular area where terrain should be flattened
 */
export interface FlatZone {
  /** Unique identifier (e.g., "station_furnace_spawn") */
  id: string;
  /** Center X position in world coordinates */
  centerX: number;
  /** Center Z position in world coordinates */
  centerZ: number;
  /** Width in meters (X axis) */
  width: number;
  /** Depth in meters (Z axis) */
  depth: number;
  /** Target height for the flat area */
  height: number;
  /** Blend radius for smooth transition to procedural terrain */
  blendRadius: number;
}

/**
 * Spatial index key for flat zone lookup
 */
export type FlatZoneKey = `${number}_${number}`; // "tileX_tileZ"
```

---

### Phase 3: TerrainSystem Integration

**File:** `packages/shared/src/systems/shared/world/TerrainSystem.ts`

#### 3.1 Add Required Imports

```typescript
// Add to existing imports at top of file
import { ALL_WORLD_AREAS } from "../../../data/world-areas";
import { stationDataProvider } from "../../../data/StationDataProvider";
import { resolveFootprint } from "../../../types/game/resource-processing-types";
import type { FlatZone } from "../../../types/world/terrain-types";
```

#### 3.2 Add Flat Zone Storage

```typescript
// Add to class properties (around line 55)
private flatZones: Map<string, FlatZone> = new Map();
private flatZonesByTile: Map<string, FlatZone[]> = new Map(); // Spatial index by terrain tile
```

#### 3.3 Load Flat Zones from Manifest

```typescript
/**
 * Load flat zones from world-areas manifest during initialization.
 * Called before any tiles are generated.
 *
 * Note: Station footprints are in movement tiles (1m = 1 tile).
 * Terrain tiles are 100m each, used only for spatial indexing.
 */
private loadFlatZonesFromManifest(): void {
  // Movement tile size (1m) - used for station footprints
  const MOVEMENT_TILE_SIZE = 1.0;

  for (const area of Object.values(ALL_WORLD_AREAS)) {
    if (!area.stations) continue;

    for (const station of area.stations) {
      const stationData = stationDataProvider.getStationData(station.type);

      // Skip if station type doesn't want ground flattening
      if (!stationData?.flattenGround) continue;

      // Get footprint from model bounds (returns movement tiles, e.g., {x: 2, z: 2})
      const footprint = stationDataProvider.getFootprint(station.type);
      const size = resolveFootprint(footprint);

      // Calculate flat zone dimensions in world units (meters)
      const padding = stationData.flattenPadding ?? 0.3;
      const blendRadius = stationData.flattenBlendRadius ?? 0.5;
      const width = size.x * MOVEMENT_TILE_SIZE + padding * 2;
      const depth = size.z * MOVEMENT_TILE_SIZE + padding * 2;

      // Sample procedural height at center BEFORE mountain boost
      // Use getBaseHeightAt to get raw noise-based height, then apply boost manually
      // This ensures flat zones use consistent base height
      const baseHeight = this.getBaseHeightAt(
        station.position.x,
        station.position.z
      );

      // Apply mountain boost to match what getHeightAt would return
      // (simplified - full logic should match getHeightAt)
      const flatHeight = this.applyMountainBoost(
        baseHeight,
        station.position.x,
        station.position.z
      );

      const zone: FlatZone = {
        id: `station_${station.id}`,
        centerX: station.position.x,
        centerZ: station.position.z,
        width,
        depth,
        height: flatHeight,
        blendRadius,
      };

      this.registerFlatZone(zone);
    }
  }

  console.log(
    `[TerrainSystem] Loaded ${this.flatZones.size} flat zones from manifest`
  );
}

/**
 * Apply mountain biome height boost (extracted from getHeightAt for reuse)
 */
private applyMountainBoost(baseHeight: number, worldX: number, worldZ: number): number {
  let height = baseHeight / this.CONFIG.MAX_HEIGHT; // Normalize

  let mountainBoost = 0;
  for (const center of this.biomeCenters) {
    if (center.type === "mountains") {
      const dx = worldX - center.x;
      const dz = worldZ - center.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const normalizedDist = distance / center.influence;

      if (normalizedDist < 2.5) {
        const boost = Math.exp(-normalizedDist * normalizedDist * 0.3);
        mountainBoost = Math.max(mountainBoost, boost);
      }
    }
  }

  height = height * (1 + mountainBoost * this.CONFIG.MOUNTAIN_HEIGHT_BOOST);
  height = Math.min(1, height);

  return height * this.CONFIG.MAX_HEIGHT;
}

/**
 * Register a flat zone and update spatial index.
 * Spatial index uses TERRAIN tiles (100m) for efficient lookup.
 */
private registerFlatZone(zone: FlatZone): void {
  this.flatZones.set(zone.id, zone);

  // Calculate affected terrain tiles (100m each)
  const totalRadius = Math.max(zone.width, zone.depth) / 2 + zone.blendRadius;
  const minTileX = Math.floor((zone.centerX - totalRadius) / this.CONFIG.TILE_SIZE);
  const maxTileX = Math.floor((zone.centerX + totalRadius) / this.CONFIG.TILE_SIZE);
  const minTileZ = Math.floor((zone.centerZ - totalRadius) / this.CONFIG.TILE_SIZE);
  const maxTileZ = Math.floor((zone.centerZ + totalRadius) / this.CONFIG.TILE_SIZE);

  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let tz = minTileZ; tz <= maxTileZ; tz++) {
      const key = `${tx}_${tz}`;
      const zones = this.flatZonesByTile.get(key) ?? [];
      zones.push(zone);
      this.flatZonesByTile.set(key, zones);
    }
  }
}
```

#### 3.4 Modify Height Calculation

The key change is in `getHeightAt()` - check flat zones first, before procedural generation.

```typescript
/**
 * Get terrain height at world position.
 * MODIFIED: Check flat zones before procedural generation.
 */
getHeightAt(worldX: number, worldZ: number): number {
  // Ensure biome centers are initialized (existing code)
  if (!this.biomeCenters || this.biomeCenters.length === 0) {
    if (!this.noise) {
      this.noise = new NoiseGenerator(this.computeSeedFromWorldId());
    }
    this.initializeBiomeCenters();
  }

  // NEW: Check flat zones first (early exit for most terrain)
  const flatHeight = this.getFlatZoneHeight(worldX, worldZ);
  if (flatHeight !== null) {
    return flatHeight;
  }

  // Existing procedural generation code follows...
  const baseHeight = this.getBaseHeightAt(worldX, worldZ);
  let height = baseHeight / this.CONFIG.MAX_HEIGHT;

  // Apply mountain biome height boost (existing logic)
  let mountainBoost = 0;
  for (const center of this.biomeCenters) {
    if (center.type === "mountains") {
      const dx = worldX - center.x;
      const dz = worldZ - center.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const normalizedDist = distance / center.influence;

      if (normalizedDist < 2.5) {
        const boost = Math.exp(-normalizedDist * normalizedDist * 0.3);
        mountainBoost = Math.max(mountainBoost, boost);
      }
    }
  }

  height = height * (1 + mountainBoost * this.CONFIG.MOUNTAIN_HEIGHT_BOOST);
  height = Math.min(1, height);

  return height * this.CONFIG.MAX_HEIGHT;
}

/**
 * Check if position is within a flat zone and return modified height.
 * Returns null if no flat zone applies.
 *
 * Uses terrain tile spatial index (100m tiles) for fast lookup.
 */
private getFlatZoneHeight(worldX: number, worldZ: number): number | null {
  // Quick terrain-tile-based lookup (100m tiles)
  const tileX = Math.floor(worldX / this.CONFIG.TILE_SIZE);
  const tileZ = Math.floor(worldZ / this.CONFIG.TILE_SIZE);
  const key = `${tileX}_${tileZ}`;

  const zones = this.flatZonesByTile.get(key);
  if (!zones || zones.length === 0) {
    return null; // No flat zones overlap this terrain tile
  }

  // Check each zone that overlaps this terrain tile
  for (const zone of zones) {
    const dx = Math.abs(worldX - zone.centerX);
    const dz = Math.abs(worldZ - zone.centerZ);

    const halfWidth = zone.width / 2;
    const halfDepth = zone.depth / 2;

    // Inside core flat area - return exact flat height
    if (dx <= halfWidth && dz <= halfDepth) {
      return zone.height;
    }

    // Check blend area
    const blendHalfWidth = halfWidth + zone.blendRadius;
    const blendHalfDepth = halfDepth + zone.blendRadius;

    if (dx <= blendHalfWidth && dz <= blendHalfDepth) {
      // Get procedural height for blending (with mountain boost)
      const baseHeight = this.getBaseHeightAt(worldX, worldZ);
      const proceduralHeight = this.applyMountainBoost(baseHeight, worldX, worldZ);

      // Calculate blend factor (0 at edge of flat zone, 1 at edge of blend zone)
      const blendX = dx > halfWidth ? (dx - halfWidth) / zone.blendRadius : 0;
      const blendZ = dz > halfDepth ? (dz - halfDepth) / zone.blendRadius : 0;
      const blend = Math.max(blendX, blendZ);

      // Smoothstep for natural transition
      const t = blend * blend * (3 - 2 * blend);

      return zone.height + (proceduralHeight - zone.height) * t;
    }
  }

  return null;
}
```

#### 3.5 Call During Initialization

Flat zones must be loaded **after** noise and biome centers are initialized, but **before** any tiles are generated.

```typescript
async init(): Promise<void> {
  // Initialize tile size
  this.tileSize = this.CONFIG.TILE_SIZE;

  // Initialize deterministic noise from world id
  this.noise = new NoiseGenerator(this.computeSeedFromWorldId());

  // Initialize biome centers using deterministic random placement
  this.initializeBiomeCenters();

  // NEW: Load flat zones from manifest (after noise/biomes, before tiles)
  this.loadFlatZonesFromManifest();

  // Initialize terrain material (client-side only)
  if (this.world.isClient) {
    this.initTerrainMaterial();
  }

  // ... rest of existing init code ...
}
```

---

### Phase 4: Update Stations Manifest

**File:** `packages/server/world/assets/manifests/stations.json`

Add flattening to all station types:

```json
{
  "stations": [
    {
      "type": "anvil",
      "name": "Anvil",
      "model": "asset://models/anvil/anvil.glb",
      "modelScale": 1.0,
      "modelYOffset": 0.0,
      "examine": "An anvil for smithing metal.",
      "flattenGround": true,
      "flattenPadding": 0.3,
      "flattenBlendRadius": 0.5
    },
    {
      "type": "furnace",
      "name": "Furnace",
      "model": "asset://models/furnace/furnace.glb",
      "modelScale": 1.5,
      "modelYOffset": 1.0,
      "examine": "A furnace for smelting ores into metal bars.",
      "flattenGround": true,
      "flattenPadding": 0.5,
      "flattenBlendRadius": 0.6
    },
    {
      "type": "range",
      "name": "Cooking Range",
      "model": "asset://models/range/range.glb",
      "modelScale": 1.0,
      "modelYOffset": 0.5,
      "examine": "A range for cooking food.",
      "flattenGround": true,
      "flattenPadding": 0.4,
      "flattenBlendRadius": 0.5
    },
    {
      "type": "altar",
      "name": "Altar",
      "model": "asset://models/altar/altar.glb",
      "modelScale": 1.2,
      "modelYOffset": 0.5,
      "examine": "An altar for prayer.",
      "flattenGround": true,
      "flattenPadding": 0.5,
      "flattenBlendRadius": 0.6
    },
    {
      "type": "bank",
      "name": "Bank Booth",
      "model": "asset://models/bank/bank-booth.glb",
      "modelScale": 1.0,
      "modelYOffset": 0.0,
      "examine": "A bank booth for storing items.",
      "flattenGround": true,
      "flattenPadding": 0.3,
      "flattenBlendRadius": 0.4
    }
  ]
}
```

---

### Phase 5: Interface Updates

**File:** `packages/shared/src/types/systems/system-interfaces.ts`

Add flat zone methods to TerrainSystem interface:

```typescript
export interface TerrainSystem extends System {
  // ... existing methods ...

  /**
   * Register a flat zone for terrain flattening.
   * Used for dynamic flat zone registration (e.g., player-placed structures).
   */
  registerFlatZone?(zone: FlatZone): void;

  /**
   * Remove a flat zone by ID.
   * Used when dynamic structures are removed.
   */
  unregisterFlatZone?(id: string): void;

  /**
   * Check if a position is within a flat zone.
   * Returns the zone if found, null otherwise.
   */
  getFlatZoneAt?(worldX: number, worldZ: number): FlatZone | null;
}
```

---

## Performance Considerations

### Spatial Indexing

Flat zones are indexed by tile key (`"tileX_tileZ"`). This means:
- **O(1) lookup** to check if current tile has any flat zones
- **O(n) per tile** where n = zones overlapping that tile (typically 0-2)
- **Zero cost** for tiles with no flat zones (vast majority)

### Memory Usage

For 50 stations with average 4 tiles each = 200 spatial index entries.
Each entry is a reference to a FlatZone object (negligible memory).

### Tile Regeneration

Flat zones are loaded **before** tiles generate, so no regeneration needed.
For future dynamic flat zones (player structures), affected tiles would need invalidation.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Overlapping stations | Use first matching zone (zones from same area won't overlap) |
| Station at tile boundary | Spatial index includes all overlapping tiles |
| Station in unloaded tile | Flat zone still applies when tile eventually generates |
| Very large station | Spatial index handles arbitrary zone sizes |
| Station removed at runtime | Call `unregisterFlatZone()` (future feature) |

---

## Testing Plan

### Unit Tests

```typescript
describe("TerrainSystem flat zones", () => {
  it("should return flat height inside zone", () => {
    const zone = { centerX: 0, centerZ: 0, width: 4, depth: 4, height: 10, blendRadius: 1 };
    terrain.registerFlatZone(zone);
    expect(terrain.getHeightAt(0, 0)).toBe(10);
    expect(terrain.getHeightAt(1, 1)).toBe(10);
  });

  it("should blend height at zone edges", () => {
    const zone = { centerX: 0, centerZ: 0, width: 4, depth: 4, height: 10, blendRadius: 1 };
    terrain.registerFlatZone(zone);
    const edgeHeight = terrain.getHeightAt(2.5, 0); // In blend zone
    expect(edgeHeight).toBeGreaterThan(10); // Blending toward procedural
    expect(edgeHeight).toBeLessThan(proceduralHeight);
  });

  it("should return procedural height outside zone", () => {
    const zone = { centerX: 0, centerZ: 0, width: 4, depth: 4, height: 10, blendRadius: 1 };
    terrain.registerFlatZone(zone);
    const farHeight = terrain.getHeightAt(100, 100);
    expect(farHeight).toBe(terrain.getProceduralHeight(100, 100));
  });
});
```

### Visual Testing

1. Spawn all station types on sloped terrain
2. Verify stations sit flat on ground
3. Verify smooth blend to surrounding terrain
4. Check from multiple camera angles
5. Verify no visible seams at tile boundaries

### Integration Testing

1. Start server and client
2. Walk around all stations in world-areas.json
3. Verify collision matches visual (player doesn't clip through flat area)
4. Verify station interaction ranges still work correctly

---

## Implementation Checklist

- [ ] **Phase 1:** Update `stations.json` schema with flatten options
- [ ] **Phase 1:** Update `StationManifestEntry` interface in `StationDataProvider.ts`
- [ ] **Phase 2:** Create `FlatZone` interface in terrain types
- [ ] **Phase 3:** Add `flatZones` and `flatZonesByTile` to `TerrainSystem`
- [ ] **Phase 3:** Implement `loadFlatZonesFromManifest()`
- [ ] **Phase 3:** Implement `registerFlatZone()` with spatial indexing
- [ ] **Phase 3:** Implement `getFlatZoneHeight()` with blend logic
- [ ] **Phase 3:** Modify `getHeightAt()` to check flat zones
- [ ] **Phase 3:** Extract procedural height to `getProceduralHeight()`
- [ ] **Phase 3:** Call `loadFlatZonesFromManifest()` in `init()`
- [ ] **Phase 4:** Add flatten config to all stations in manifest
- [ ] **Phase 5:** Update `TerrainSystem` interface
- [ ] **Testing:** Write unit tests for flat zone logic
- [ ] **Testing:** Visual verification of all station types
- [ ] **Testing:** Build and lint pass

---

## Future Enhancements

1. **Player-placed structures** - Dynamic flat zone registration/unregistration
2. **Circular flat zones** - For round structures (wells, fountains)
3. **Height averaging** - Sample multiple points to find optimal flat height
4. **Terrain texturing** - Apply different ground texture under stations (cobblestone, etc.)
5. **Debug visualization** - Show flat zone boundaries in dev mode

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `stations.json` | Add `flattenGround`, `flattenPadding`, `flattenBlendRadius` |
| `StationDataProvider.ts` | Update `StationManifestEntry` interface |
| `TerrainSystem.ts` | Add flat zone storage, loading, lookup, and height modification |
| `system-interfaces.ts` | Add flat zone methods to interface |
| `terrain-types.ts` | Add `FlatZone` interface (new or existing file) |
