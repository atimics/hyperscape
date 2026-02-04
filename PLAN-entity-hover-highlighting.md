# Plan: RS3-Style Entity Hover Highlighting

## Summary

Add colored outline highlighting to interactable entities when the player hovers over them. Inspired by RS3's "Entity Highlight Mode", this uses Three.js's TSL-based `outline()` node integrated into the existing WebGPU post-processing pipeline.

## Reference

- [RS3 Dev Blog — Highlighting & Canopy Cutout](https://secure.runescape.com/m=news/a=870/dev-blog---highlighting--canopy-cutout)
- [Three.js WebGPU Outline Pass Example](https://threejs.org/examples/webgpu_postprocessing_outline.html)
- [Three.js OutlinePass Docs](https://threejs.org/docs/pages/OutlinePass.html)

## How RS3 Does It

RS3's highlighting system:
- **Modes**: Mouse-over (desktop), proximity (mobile), always-on
- **Color-coded by entity type**: Different colors for friendly NPCs, hostile mobs, interactable objects, players, items
- **Rendering technique**: Each highlighted object is drawn twice — once enlarged with color, then smaller with black — composited using the depth buffer so outlines don't bleed through walls. A blur pass softens artifacts.
- **Excludes non-interactable objects** (examine-only) to reduce visual noise
- **Performance note**: "Always-on" mode impacts performance in busy areas; mouse-over is the lightest option

## Our Architecture Match

The codebase uses **Three.js 0.180** with a **WebGPU renderer** and **TSL-based post-processing** (`PostProcessingFactory.ts`). Three.js provides a TSL-compatible `outline()` function:

```typescript
import { outline } from 'three/addons/tsl/display/OutlineNode.js';
```

This integrates directly with the existing `THREE.PostProcessing` pipeline — no EffectComposer needed.

## Existing Infrastructure We Build On

| System | File | What it gives us |
|--------|------|-----------------|
| **RaycastService** | `shared/src/systems/client/interaction/services/RaycastService.ts` | Already raycasts on every click; has `getEntityAtPosition()` returning entity type, mesh reference, and `RaycastTarget` |
| **InteractionRouter** | `shared/src/systems/client/interaction/InteractionRouter.ts` | Already has `mousemove` listener (line 212), currently only tracks drag state |
| **PostProcessingFactory** | `shared/src/utils/rendering/PostProcessingFactory.ts` | TSL pipeline with `pass()` → `renderOutput()` → `PostProcessing.outputNode`. We chain outline into this |
| **ClientGraphics** | `shared/src/systems/client/ClientGraphics.ts` | `render()` method calls `composer.render()`. Composer interface is `PostProcessingComposer` |
| **Entity userData** | `shared/src/entities/Entity.ts` (line 261-274) | Every entity mesh has `userData.entityId`, `userData.type`, `userData.interactable` |
| **VisualFeedbackService** | `shared/src/systems/client/interaction/services/VisualFeedbackService.ts` | Existing pattern for visual interaction feedback (target markers, click indicators) |
| **InteractableEntityType** | `shared/src/systems/client/interaction/types.ts` | Type enum: `item`, `npc`, `mob`, `resource`, `bank`, `player`, `furnace`, `anvil`, etc. |

## Implementation Plan

### Phase 1: Outline Node Integration into Post-Processing Pipeline

**File: `packages/shared/src/utils/rendering/PostProcessingFactory.ts`**

1. Add `outline` import:
   ```typescript
   import { outline } from 'three/addons/tsl/display/OutlineNode.js';
   ```

2. Add outline configuration to `PostProcessingOptions`:
   ```typescript
   outline?: {
     enabled?: boolean;
     edgeStrength?: number;    // Default: 3.0
     edgeThickness?: number;   // Default: 1.0
     edgeGlow?: number;        // Default: 0.0
   };
   ```

3. In `createPostProcessing()`, create the outline pass:
   ```typescript
   // Create outline pass with empty selectedObjects array
   const selectedObjects: THREE.Object3D[] = [];
   const edgeStrengthUniform = uniform(3.0);
   const edgeThicknessUniform = uniform(1.0);
   const edgeGlowUniform = uniform(0.0);
   const visibleEdgeColorUniform = uniform(new THREE.Color(0xffffff));
   const hiddenEdgeColorUniform = uniform(new THREE.Color(0x190a05));

   const outlineNode = outline(scene, camera, {
     selectedObjects,
     edgeGlow: edgeGlowUniform,
     edgeThickness: edgeThicknessUniform,
   });

   const { visibleEdge, hiddenEdge } = outlineNode;
   const outlineColor = visibleEdge.mul(visibleEdgeColorUniform)
     .add(hiddenEdge.mul(hiddenEdgeColorUniform))
     .mul(edgeStrengthUniform);
   ```

4. Chain outline into the output node:
   ```typescript
   // Before (current):
   postProcessing.outputNode = lutPassNode;

   // After:
   postProcessing.outputNode = outlineColor.add(lutPassNode);
   // (or outlineColor.add(outputPass) when LUT is disabled)
   ```

5. Expose outline control methods on `PostProcessingComposer`:
   ```typescript
   setOutlineObjects: (objects: THREE.Object3D[]) => void;
   setOutlineColor: (visible: THREE.Color, hidden?: THREE.Color) => void;
   setOutlineStrength: (strength: number) => void;
   ```

   Implementation:
   ```typescript
   setOutlineObjects: (objects: THREE.Object3D[]) => {
     selectedObjects.length = 0;
     selectedObjects.push(...objects);
     outlineNode.selectedObjects = selectedObjects;
   },
   setOutlineColor: (visible: THREE.Color, hidden?: THREE.Color) => {
     visibleEdgeColorUniform.value.copy(visible);
     if (hidden) hiddenEdgeColorUniform.value.copy(hidden);
   },
   ```

### Phase 2: Entity Highlight Color Mapping

**File: `packages/shared/src/systems/client/interaction/services/EntityHighlightService.ts`** (new file)

Create a service that maps entity types to highlight colors, following RS3's color scheme:

```typescript
const HIGHLIGHT_COLORS: Record<string, THREE.Color> = {
  // Items — most important to spot
  item:       new THREE.Color(0xff0000),   // Red

  // Hostile mobs
  mob:        new THREE.Color(0xffff00),   // Yellow

  // Friendly NPCs
  npc:        new THREE.Color(0x00ffff),   // Cyan

  // Other players
  player:     new THREE.Color(0xffffff),   // White

  // Gatherable resources (trees, rocks, fishing spots)
  resource:   new THREE.Color(0x00ff00),   // Green

  // Interactable stations/objects
  bank:       new THREE.Color(0x00ff00),   // Green
  furnace:    new THREE.Color(0x00ff00),   // Green
  anvil:      new THREE.Color(0x00ff00),   // Green
  altar:      new THREE.Color(0x00ff00),   // Green
  fire:       new THREE.Color(0x00ff00),   // Green
  range:      new THREE.Color(0x00ff00),   // Green

  // Lootable
  corpse:     new THREE.Color(0xff0000),   // Red
  headstone:  new THREE.Color(0xff0000),   // Red
};
```

The service exposes:
```typescript
class EntityHighlightService {
  /** Get all meshes for an entity (traverse its node tree) */
  getEntityMeshes(entity: Entity): THREE.Object3D[];

  /** Get the highlight color for an entity type */
  getHighlightColor(entityType: InteractableEntityType): THREE.Color;

  /** Get the current hover target (if any) */
  getCurrentTarget(): RaycastTarget | null;

  /** Set the current hover target and update outline pass */
  setHoverTarget(target: RaycastTarget | null): void;

  /** Clear the hover highlight */
  clearHover(): void;
}
```

Key implementation details:
- When `setHoverTarget()` is called, traverse the entity's `node` tree to collect all `THREE.Mesh` children
- Pass collected meshes to `composer.setOutlineObjects()`
- Set the outline color based on entity type via `composer.setOutlineColor()`
- When clearing, call `composer.setOutlineObjects([])`
- Skip entities where `userData.interactable === false`

### Phase 3: Hover Detection in InteractionRouter

**File: `packages/shared/src/systems/client/interaction/InteractionRouter.ts`**

1. Import and initialize `EntityHighlightService` in the InteractionRouter constructor.

2. Modify `onMouseMove` (line 453) to perform hover raycasting:

   ```typescript
   private onMouseMove = (event: MouseEvent): void => {
     // Existing drag detection logic stays
     if (this.mouseDownButton !== null && this.mouseDownClientPos) {
       const dx = event.clientX - this.mouseDownClientPos.x;
       const dy = event.clientY - this.mouseDownClientPos.y;
       if (!this.isDragging &&
           (Math.abs(dx) > INPUT.DRAG_THRESHOLD_PX ||
            Math.abs(dy) > INPUT.DRAG_THRESHOLD_PX)) {
         this.isDragging = true;
       }
     }

     // NEW: Hover highlighting (skip if dragging or controls disabled)
     if (this.isDragging || !this.areControlsEnabled()) return;

     this.updateHoverHighlight(event.clientX, event.clientY);
   };
   ```

3. Add throttled hover update method:

   ```typescript
   private lastHoverTime = 0;
   private static readonly HOVER_THROTTLE_MS = 50; // 20 checks/sec max

   private updateHoverHighlight(screenX: number, screenY: number): void {
     const now = performance.now();
     if (now - this.lastHoverTime < InteractionRouter.HOVER_THROTTLE_MS) return;
     this.lastHoverTime = now;

     if (!this.canvas) return;

     const target = this.raycastService.getEntityAtPosition(
       screenX, screenY, this.canvas
     );

     this.highlightService.setHoverTarget(target);
   }
   ```

4. Clear highlights on `mousedown` (combat/action takes priority) and when controls are disabled.

### Phase 4: Cursor Change on Hover

**File: `packages/shared/src/systems/client/interaction/InteractionRouter.ts`**

When an interactable entity is under the cursor, change the cursor to indicate it's clickable:

```typescript
// In updateHoverHighlight():
if (target && target.entityType) {
  this.canvas.style.cursor = 'pointer';
} else {
  this.canvas.style.cursor = 'default';
}
```

### Phase 5: Settings Integration

**File: `packages/shared/src/types/settings.ts`** (or wherever player preferences live)

Add settings for the highlight feature:

```typescript
entityHighlighting: {
  enabled: boolean;           // Default: true
  mode: 'hover' | 'always';  // Default: 'hover' (always = RS3's always-on)
  edgeStrength: number;       // Default: 3.0
  edgeThickness: number;      // Default: 1.0
  // Per-type toggles (optional, Phase 2+)
}
```

Wire these into `ClientGraphics.onPrefsChange()` to dynamically enable/disable the outline pass.

## File Change Summary

| File | Change |
|------|--------|
| `shared/src/utils/rendering/PostProcessingFactory.ts` | Add `outline()` TSL node to pipeline, expose `setOutlineObjects`/`setOutlineColor`/`setOutlineStrength` on composer |
| `shared/src/systems/client/interaction/services/EntityHighlightService.ts` | **New file** — entity-type → color mapping, mesh collection, hover state management |
| `shared/src/systems/client/interaction/InteractionRouter.ts` | Add hover raycasting in `onMouseMove`, throttled at 50ms, drives `EntityHighlightService` |
| `shared/src/systems/client/ClientGraphics.ts` | Pass composer to InteractionRouter or expose outline methods on world.graphics |
| `shared/src/utils/rendering/PostProcessingFactory.ts` (types) | Extend `PostProcessingComposer` type with outline methods |

## Performance Considerations

1. **Throttled hover raycasting** at 50ms (20 checks/sec) — raycasting every frame is unnecessary for hover UX
2. **RaycastService cache** already prevents duplicate raycasts within 16ms
3. **Outline pass runs every frame** but only processes `selectedObjects` (0–1 objects on hover) — negligible cost for a single entity
4. **No allocations in hot path** — reuse pre-allocated Color objects and arrays
5. **Skip when not hovering** — `selectedObjects = []` means the outline pass does minimal work
6. **Layer filtering** — raycaster already only checks layer 1 (entities), not terrain

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `OutlineNode.js` may not be bundled with Three.js 0.180 | Verify the import exists; if not, use the WebGL `OutlinePass` as fallback when running in WebGL mode |
| Outline doesn't work with instanced meshes (merged static geometry) | Entity meshes are NOT instanced — only static terrain uses `mergeStaticMeshes()`. Entity models are individual scene graph nodes |
| GLB models with many submeshes cause outline artifacts | Traverse full hierarchy and pass ALL child meshes to `selectedObjects`, not just the root |
| WebGL fallback path (no WebGPU) | When using WebGL backend, either skip outline or use the traditional `EffectComposer` + `OutlinePass` from `three/examples/jsm/postprocessing/` |
| Raycast proxy meshes (mobs/NPCs use capsule proxies for perf) | When collecting meshes for outline, use `entity.mesh` (the visual model), not the proxy |

## Testing

1. Hover over each entity type (mob, NPC, item, resource, bank, furnace, anvil, altar, player) → colored outline appears
2. Move cursor away → outline disappears immediately
3. Right-click drag (camera rotation) → no outline flickering
4. Hover over non-interactable scenery → no outline
5. Performance: FPS stays stable in busy areas with many entities
6. WebGL fallback: feature gracefully degrades (no crash)
