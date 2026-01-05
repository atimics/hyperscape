# Dynamic Fishing Spot Placement - Implementation Plan

## Overview

Replace static fishing spot coordinates with dynamic shore detection. Areas define *what* fishing they have, the system finds *where* the water is.

**Problem**: Fishing spots are defined with static positions in `world-areas.json`, but terrain is procedurally generated with noise. Water locations aren't known at design time, causing spots to float over land.

**Solution**: Define fishing config per area (spot count, types), let the system scan for shore points at runtime and spawn spots at valid water edges.

---

## Critical Technical Details

### Terrain System Verification

- **`getHeightAt()` works without tiles loaded** - Uses noise functions directly (line 1337)
- **`WATER_THRESHOLD: 5.4m`** - Defined in `TerrainSystem.CONFIG` (line 518)
- **`SHORELINE_THRESHOLD: 0.25`** normalized = 7.5m (line 563)
- **`this.terrainSystem`** is set in `init()`, available in `start()` when resources spawn

### Shore Zone Definition

A valid fishing spot position must be:
- **On land**: `height >= WATER_THRESHOLD (5.4m)` - Player stands here
- **Near water**: `height <= 8.0m` - Not too far inland
- **Adjacent to water**: At least one cardinal neighbor has `height < 5.4m`

This ensures the player stands on solid ground while fishing into adjacent water.

---

## Phase 1: Shore Discovery Utility

**File**: `packages/shared/src/utils/ShoreUtils.ts` (NEW)

### Interface and Function

```typescript
/**
 * Represents a valid shore point where a fishing spot can spawn
 */
export interface ShorePoint {
  x: number;
  y: number;  // Actual ground height
  z: number;
  waterDirection: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
}

export interface FindShorePointsOptions {
  sampleInterval?: number;    // Grid sampling distance (default: 2m)
  waterThreshold?: number;    // Height below = water (default: 5.4m)
  shoreMaxHeight?: number;    // Max height for shore (default: 8.0m)
  minSpacing?: number;        // Min distance between points (default: 6m)
}

/**
 * Scans an area and returns valid shore points where fishing spots can spawn.
 * Shore = on land, adjacent to water.
 */
export function findShorePoints(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  getHeightAt: (x: number, z: number) => number,
  options?: FindShorePointsOptions
): ShorePoint[]
```

### Algorithm

```typescript
export function findShorePoints(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  getHeightAt: (x: number, z: number) => number,
  options: FindShorePointsOptions = {}
): ShorePoint[] {
  const {
    sampleInterval = 2,
    waterThreshold = 5.4,
    shoreMaxHeight = 8.0,
    minSpacing = 6,
  } = options;

  const results: ShorePoint[] = [];

  // Cardinal + diagonal directions for water detection
  const directions = [
    { dx: 0, dz: -2, name: 'N' },
    { dx: 0, dz: 2, name: 'S' },
    { dx: 2, dz: 0, name: 'E' },
    { dx: -2, dz: 0, name: 'W' },
    { dx: 2, dz: -2, name: 'NE' },
    { dx: -2, dz: -2, name: 'NW' },
    { dx: 2, dz: 2, name: 'SE' },
    { dx: -2, dz: 2, name: 'SW' },
  ];

  for (let x = bounds.minX; x <= bounds.maxX; x += sampleInterval) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += sampleInterval) {
      const height = getHeightAt(x, z);

      // Must be on land (not underwater)
      if (height < waterThreshold) continue;

      // Must be near water level (shore zone)
      if (height > shoreMaxHeight) continue;

      // Must have adjacent water
      let waterDir: string | null = null;
      for (const dir of directions) {
        const neighborHeight = getHeightAt(x + dir.dx, z + dir.dz);
        if (neighborHeight < waterThreshold) {
          waterDir = dir.name;
          break;
        }
      }
      if (!waterDir) continue;

      // Check minimum spacing from existing points
      const tooClose = results.some(p => {
        const dist = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
        return dist < minSpacing;
      });
      if (tooClose) continue;

      results.push({
        x,
        y: height,
        z,
        waterDirection: waterDir as ShorePoint['waterDirection'],
      });
    }
  }

  return results;
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
export function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
```

---

## Phase 2: Manifest Schema Update

### Update `world-areas.json`

**Remove** static fishing spot entries from `resources` array (lines 111-163 in central_haven).

**Add** new `fishing` config per area:

```json
{
  "central_haven": {
    "id": "central_haven",
    "bounds": { "minX": -20, "maxX": 20, "minZ": -20, "maxZ": 20 },
    "fishing": {
      "enabled": true,
      "spotCount": 6,
      "spotTypes": ["fishing_spot_net", "fishing_spot_bait", "fishing_spot_fly"]
    },
    "resources": [
      // Trees, ores only - NO fishing spots
    ]
  }
}
```

### Update `DataManager.ts`

Add to `ExternalWorldArea` interface (around line 130):

```typescript
export interface ExternalWorldArea {
  id: string;
  name: string;
  description: string;
  difficultyLevel: number;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  biomeType: string;
  safeZone: boolean;
  pvpEnabled?: boolean;
  npcs?: Array<{ /* ... */ }>;
  resources?: Array<{ /* ... */ }>;
  mobSpawns?: Array<{ /* ... */ }>;
  // NEW: Dynamic fishing configuration
  fishing?: {
    enabled: boolean;
    spotCount: number;
    spotTypes: string[];  // Resource IDs like "fishing_spot_net"
  };
}
```

---

## Phase 3: ResourceSystem Integration

### Modify `initializeWorldAreaResources()` (around line 594)

After processing static resources for each area, add fishing spot spawning:

```typescript
private initializeWorldAreaResources(): void {
  // ... existing type mapping code ...

  for (const [areaId, area] of Object.entries(ALL_WORLD_AREAS)) {
    // ... existing static resource processing (lines 548-601) ...

    if (spawnPoints.length > 0) {
      console.log(
        `[ResourceSystem] Spawning ${spawnPoints.length} explicit resources for area "${areaId}"`,
      );
      this.registerTerrainResources({ spawnPoints, isManifest: true });
    }

    // NEW: Spawn dynamic fishing spots
    if (area.fishing?.enabled) {
      this.spawnDynamicFishingSpots(areaId, area);
    }
  }
}
```

### New Method: `spawnDynamicFishingSpots()`

```typescript
import { findShorePoints, shuffleArray, ShorePoint } from "../../utils/ShoreUtils";

/**
 * Dynamically spawn fishing spots at detected shore positions within an area.
 * Uses terrain height sampling to find valid water edges.
 */
private spawnDynamicFishingSpots(
  areaId: string,
  area: ExternalWorldArea
): void {
  if (!this.terrainSystem) {
    console.warn(
      `[ResourceSystem] No terrain system available - skipping fishing for ${areaId}`
    );
    return;
  }

  const fishing = area.fishing!;

  // Find shore points within area bounds
  const shorePoints = findShorePoints(
    area.bounds,
    this.terrainSystem.getHeightAt.bind(this.terrainSystem),
    {
      waterThreshold: 5.4,  // TerrainSystem.CONFIG.WATER_THRESHOLD
      shoreMaxHeight: 8.0,
      minSpacing: 6,
    }
  );

  if (shorePoints.length === 0) {
    console.warn(
      `[ResourceSystem] No shore points found in ${areaId} - no fishing spots spawned`
    );
    return;
  }

  // Randomize order for variety
  shuffleArray(shorePoints);

  // Determine how many spots to spawn
  const spotsToSpawn = Math.min(fishing.spotCount, shorePoints.length);

  // Build spawn points (round-robin through spot types)
  const spawnPoints: TerrainResourceSpawnPoint[] = [];

  for (let i = 0; i < spotsToSpawn; i++) {
    const point = shorePoints[i];
    const spotTypeId = fishing.spotTypes[i % fishing.spotTypes.length];

    // Extract subType: "fishing_spot_net" -> "net"
    const subType = spotTypeId.replace("fishing_spot_", "");

    spawnPoints.push({
      position: { x: point.x, y: point.y + 0.1, z: point.z },
      type: "fish",
      subType: subType as TerrainResourceSpawnPoint["subType"],
    });
  }

  // Use existing spawn infrastructure
  if (spawnPoints.length > 0) {
    console.log(
      `[ResourceSystem] Spawning ${spawnPoints.length} dynamic fishing spots in ${areaId} ` +
      `(found ${shorePoints.length} shore points)`
    );
    this.registerTerrainResources({ spawnPoints, isManifest: true });
  }
}
```

---

## Phase 4: Fix `relocateFishingSpot()`

The existing method (line 1813) moves spots randomly without validating water edges. Update to use shore detection:

```typescript
private relocateFishingSpot(
  resourceId: ResourceID,
  currentTick: number,
): void {
  const resource = this.resources.get(resourceId);
  if (!resource) {
    this.fishingSpotMoveTimers.delete(resourceId);
    return;
  }

  if (!this.terrainSystem) {
    // No terrain system - just reset timer and stay put
    this.initializeFishingSpotTimer(resourceId, resource.position);
    return;
  }

  const timer = this.fishingSpotMoveTimers.get(resourceId);
  if (!timer) return;

  // Search for valid shore points near current position
  const searchRadius = 15;
  const searchBounds = {
    minX: resource.position.x - searchRadius,
    maxX: resource.position.x + searchRadius,
    minZ: resource.position.z - searchRadius,
    maxZ: resource.position.z + searchRadius,
  };

  const nearbyShores = findShorePoints(
    searchBounds,
    this.terrainSystem.getHeightAt.bind(this.terrainSystem),
    {
      waterThreshold: 5.4,
      shoreMaxHeight: 8.0,
      minSpacing: 3,  // Smaller spacing for relocation candidates
    }
  );

  // Filter out positions too close to current location
  const candidates = nearbyShores.filter(p => {
    const dist = Math.sqrt(
      (p.x - resource.position.x) ** 2 +
      (p.z - resource.position.z) ** 2
    );
    return dist >= 5;  // At least 5m away
  });

  if (candidates.length === 0) {
    // No valid spots nearby - stay put, try again later
    console.log(
      `[Fishing] Spot ${resourceId} couldn't find new position - staying put`
    );
    this.initializeFishingSpotTimer(resourceId, resource.position);
    return;
  }

  // Pick random candidate
  const newPos = candidates[Math.floor(Math.random() * candidates.length)];
  const oldPos = { ...resource.position };

  // Update resource position
  resource.position.x = newPos.x;
  resource.position.y = newPos.y;
  resource.position.z = newPos.z;

  // Update entity position if it exists
  const entity = this.world.entities.get(resource.id);
  if (entity) {
    entity.position.x = newPos.x;
    entity.position.y = newPos.y;
    entity.position.z = newPos.z;
  }

  // Broadcast to clients
  this.sendNetworkMessage("fishingSpotMoved", {
    resourceId: resourceId,
    oldPosition: oldPos,
    newPosition: resource.position,
  });

  console.log(
    `[Fishing] Spot ${resourceId} moved from ` +
    `(${oldPos.x.toFixed(1)}, ${oldPos.z.toFixed(1)}) to ` +
    `(${newPos.x.toFixed(1)}, ${newPos.z.toFixed(1)})`
  );

  // Reset timer for next movement
  this.initializeFishingSpotTimer(resourceId, resource.position);
}
```

---

## Phase 5: Cleanup

### Remove Static Fishing Spots

In `world-areas.json`, remove these entries from `central_haven.resources`:

```json
// DELETE these 6 entries (lines 111-163):
{
  "type": "fishing_spot",
  "position": { "x": -10, "y": 0, "z": -15 },
  "resourceId": "fishing_spot_net"
},
// ... and the other 5 fishing spots
```

### Add Fishing Config

```json
"central_haven": {
  // ... existing fields ...
  "fishing": {
    "enabled": true,
    "spotCount": 6,
    "spotTypes": ["fishing_spot_net", "fishing_spot_bait", "fishing_spot_fly"]
  }
}
```

### The Wastes (Optional)

```json
"wilderness_test": {
  // ... existing fields ...
  "fishing": {
    "enabled": true,
    "spotCount": 2,
    "spotTypes": ["fishing_spot_fly"]
  }
}
```

---

## Phase 6: Visual Representation (Particle Effects)

### Problem

Currently fishing spots render as flat cyan `PlaneGeometry` tiles - a placeholder that breaks immersion. OSRS fishing spots have distinctive swirling water animations with occasional fish jumping.

### Existing Infrastructure

**Good news**: The codebase has a full GPU particle system ready to use.

**Particle System Location**: `packages/shared/src/systems/shared/presentation/Particles.ts`

**Architecture**:
- Web Worker physics (no main thread blocking)
- GPU-accelerated rendering via `THREE.InstancedMesh`
- Handles 10,000+ particles at 60 FPS
- Object pooling to minimize GC pressure

**Available Features**:
| Feature | Description |
|---------|-------------|
| Emission shapes | `point`, `sphere`, `hemisphere`, `cone`, `box`, `circle`, `rectangle` |
| Billboard modes | `full`, `y-axis`, `direction` |
| Blending | `additive`, `normal` |
| Bursts | Timed particle bursts `{ time: 0, count: 10 }` |
| Curves | `sizeOverLife`, `alphaOverLife`, `colorOverLife`, `rotateOverLife` |
| Forces | Gravity, wind, orbital velocity, radial velocity |
| Spritesheets | Animated textures `[rows, cols, frameRate, loops]` |

**Existing Textures** (in `packages/client/public/textures/`):
- `particle.png` (19KB) - Default soft white circle, perfect for bubbles
- `Flare32.png` (49KB) - Glowing flare effect
- `waterNormal.png` (542KB) - Water normal map

### Visual Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| 1. Improved Placeholder | Pulsing cyan plane with animation | Zero new systems | Still looks placeholder |
| 2. **Particle Bubbles** | Bubbles rising from water surface | Already built, GPU-accelerated, looks alive | Needs integration |
| 3. Animated Water Decal | UV-scrolling shader material | Lightweight | Needs shader work |
| 4. Full OSRS Style | Bubbles + fish jump animation | Most authentic | Most complex |

### Recommended Approach: Option 2 (Particle Bubbles)

Start with particle bubbles because:
1. Particle system already exists and is battle-tested
2. Runs on web worker - zero main thread cost
3. GPU-accelerated - can have many spots without lag
4. Can be enhanced later (add fish jump as Option 4)
5. Existing `particle.png` texture works perfectly

### Particle Configuration for Fishing Spots

```typescript
// Bubble effect configuration for fishing spots
const FISHING_SPOT_PARTICLES = {
  // Emission
  shape: ['circle', 0.8, 0],        // 0.8m radius circle at water surface
  rate: 4,                           // 4 bubbles per second (subtle)
  max: 50,                           // Max particles per emitter

  // Particle properties
  life: '1.5~2.5',                   // 1.5-2.5 second lifetime
  speed: '0.3~0.6',                  // Rise slowly
  size: '0.08~0.2',                  // Small bubbles (8-20cm)

  // Visual
  color: 'white',
  alpha: '0.5~0.7',                  // Semi-transparent
  alphaOverLife: '0,0|0.1,1|0.8,1|1,0',  // Fade in, hold, fade out
  sizeOverLife: '0,0.5|0.5,1|1,0.8',     // Grow then shrink slightly

  // Physics
  force: [0, 0.8, 0],               // Float upward (buoyancy)
  velocityRadial: 0.1,              // Slight outward spread

  // Rendering
  image: 'asset://textures/particle.png',
  blending: 'additive',             // Glowy effect
  billboard: 'full',                // Always face camera
  space: 'world',                   // World space (not local to emitter)
  lit: false,                       // Unlit for consistent look

  // Behavior
  emitting: true,
  loop: true,
  duration: null,                   // Emit forever
};
```

### Spot Type Variations

Different fishing methods should have subtly different visuals:

```typescript
const FISHING_SPOT_VARIANTS = {
  net: {
    // Calm, gentle bubbles (shallow water fishing)
    rate: 3,
    size: '0.05~0.15',
    color: '#e0f0ff',               // Slightly blue-tinted
  },
  bait: {
    // Medium activity (standard fishing)
    rate: 4,
    size: '0.08~0.2',
    color: 'white',
  },
  fly: {
    // More active (river/moving water)
    rate: 6,
    size: '0.1~0.25',
    color: '#f0f8ff',
    velocityRadial: 0.2,            // More spread (turbulent water)
  },
};
```

### Implementation in ResourceEntity

**File**: `packages/shared/src/entities/world/ResourceEntity.ts`

Modify `createMesh()` to attach particle emitter for fishing spots:

```typescript
import { Particles as ParticleNode } from "../../nodes/Particles";

protected async createMesh(): Promise<void> {
  if (this.world.isServer) return;

  // ... existing model loading code ...

  // For fishing spots, add particle effect
  if (this.config.resourceType === "fishing_spot") {
    this.createFishingSpotVisual();
    return;  // Skip placeholder geometry
  }

  // ... rest of existing placeholder code ...
}

/**
 * Create particle-based visual for fishing spots
 */
private createFishingSpotVisual(): void {
  // Determine variant based on resourceId
  const variant = this.getFishingSpotVariant();

  // Create particle emitter node
  const particles = new ParticleNode({
    // Base config
    shape: ['circle', 0.8, 0],
    rate: variant.rate,
    max: 50,
    life: '1.5~2.5',
    speed: '0.3~0.6',
    size: variant.size,
    color: variant.color,
    alpha: '0.5~0.7',
    alphaOverLife: '0,0|0.1,1|0.8,1|1,0',
    sizeOverLife: '0,0.5|0.5,1|1,0.8',
    force: [0, 0.8, 0],
    velocityRadial: variant.velocityRadial || 0.1,
    image: 'asset://textures/particle.png',
    blending: 'additive',
    billboard: 'full',
    space: 'world',
    lit: false,
    emitting: true,
    loop: true,
  });

  // Position at water surface (slightly below ground level)
  particles.position = [0, -0.3, 0];

  // Add to node hierarchy
  this.node.add(particles);

  // Store reference for cleanup
  this.particleEmitter = particles;

  // Also add a subtle glow plane for visibility from distance
  this.createGlowIndicator();
}

private getFishingSpotVariant(): { rate: number; size: string; color: string; velocityRadial?: number } {
  const resourceId = this.config.resourceId || '';

  if (resourceId.includes('net')) {
    return { rate: 3, size: '0.05~0.15', color: '#e0f0ff' };
  } else if (resourceId.includes('fly')) {
    return { rate: 6, size: '0.1~0.25', color: '#f0f8ff', velocityRadial: 0.2 };
  }
  // Default: bait
  return { rate: 4, size: '0.08~0.2', color: 'white' };
}

/**
 * Subtle glow indicator visible from distance when particles aren't
 */
private createGlowIndicator(): void {
  const geometry = new THREE.CircleGeometry(0.6, 16);
  const material = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });

  const glow = new THREE.Mesh(geometry, material);
  glow.rotation.x = -Math.PI / 2;  // Horizontal
  glow.position.y = 0.05;           // Just above water
  glow.name = 'FishingSpotGlow';

  this.node.add(glow);
  this.glowMesh = glow;
}
```

### Cleanup on Destroy

```typescript
destroy(local?: boolean): void {
  // Clean up particle emitter
  if (this.particleEmitter) {
    this.particleEmitter.unmount();
    this.particleEmitter = undefined;
  }

  // Clean up glow mesh
  if (this.glowMesh) {
    this.glowMesh.geometry.dispose();
    (this.glowMesh.material as THREE.Material).dispose();
    this.node.remove(this.glowMesh);
    this.glowMesh = undefined;
  }

  // ... existing cleanup ...
  super.destroy(local);
}
```

### Future Visual Enhancements

1. **Fish Jump Animation**: Occasional fish model arcs up and splashes back
2. **Ripple Shader**: Animated concentric rings on water surface
3. **Spot Type Icons**: Small UI indicator showing fishing method (net/rod/fly)
4. **Night Glow**: Brighter glow effect at night for visibility
5. **Depletion Visual**: Particles slow/stop when spot is "fished out" temporarily

---

## File Change Summary

| File | Changes |
|------|---------|
| `packages/shared/src/utils/ShoreUtils.ts` | **NEW** - `findShorePoints()`, `shuffleArray()` |
| `packages/shared/src/data/DataManager.ts` | Add `fishing` to `ExternalWorldArea` interface |
| `packages/server/world/assets/manifests/world-areas.json` | Add `fishing` config, remove static fishing spots |
| `packages/shared/src/systems/shared/entities/ResourceSystem.ts` | Add `spawnDynamicFishingSpots()`, update `relocateFishingSpot()`, add import |
| `packages/shared/src/entities/world/ResourceEntity.ts` | Add `createFishingSpotVisual()`, `getFishingSpotVariant()`, `createGlowIndicator()`, particle cleanup |

---

## Edge Cases Handled

| Case | Solution |
|------|----------|
| No water in area | Log warning, spawn 0 spots |
| Fewer shore points than spotCount | Spawn as many as available |
| Spots too close together | `minSpacing` parameter (6m default) |
| Spot relocation finds no valid position | Stay put, reset timer, try again later |
| TerrainSystem not available | Log warning, skip fishing spawning |
| Area has no fishing config | Skip (existing behavior) |

---

## Testing Checklist

### Placement (Phases 1-5)
- [ ] ShoreUtils correctly identifies water edges
- [ ] Fishing spots appear at water's edge (not floating, not underwater)
- [ ] Correct number of spots per area config
- [ ] Mix of spot types (net, bait, fly) distributed correctly
- [ ] Spot relocation moves to valid shore positions
- [ ] Works in Central Haven
- [ ] Works in The Wastes (if water exists there)
- [ ] No spots spawn if area has no water
- [ ] Server logs show shore discovery results
- [ ] Existing fishing mechanics still work (catching fish, XP, bait consumption)

### Visuals (Phase 6)
- [ ] Particle bubbles render at fishing spot locations
- [ ] Bubbles rise upward from water surface
- [ ] Different spot types have distinct visual variations (net=calm, fly=active)
- [ ] Glow indicator visible from distance
- [ ] Particles clean up properly when spot is destroyed/relocated
- [ ] No performance degradation with multiple fishing spots
- [ ] Particles don't render on server (client-only)

---

## Future Enhancements

### Placement Improvements
1. **Spot facing**: Use `waterDirection` to calculate quaternion so spots face water
2. **Biome-specific fishing**: Different fish availability based on biome type
3. **Spot density control**: More spots in larger water bodies
4. **Deep water spots**: Extend detection for boat-based fishing in deeper water

### Visual Improvements
5. **Fish Jump Animation**: Occasional fish model arcs up and splashes back (full OSRS style)
6. **Ripple Shader**: Animated concentric rings on water surface
7. **Spot Type Icons**: Small UI indicator showing fishing method (net/rod/fly)
8. **Night Glow**: Brighter glow effect at night for visibility
9. **Depletion Visual**: Particles slow/stop when spot is "fished out" temporarily
10. **Weather Effects**: Rain interaction with fishing spot particles
