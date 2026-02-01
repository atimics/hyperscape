# Implementation Plan: Combat Spell Visual Upgrade

## Research Summary

### Combat Rotation: No Changes Needed
Deep analysis of `CombatRotationManager.ts` and `CombatSystem.ts` confirms that **rotation already works identically for melee, ranged, and magic**. All three attack types call `rotateTowardsTarget()` before animation:
- Melee: `CombatSystem.handleMeleeAttack()` calls `rotationManager.rotateTowardsTarget()` before animation
- Ranged: `CombatSystem.handleRangedAttack()` line 947 — same call
- Magic: `CombatSystem.handleMagicAttack()` line 1119 — same call

The `CombatRotationManager.rotateTowardsTarget()` method works universally (VRM quaternion + network sync). No changes required.

### Spell Colors: Already Element-Based
`spell-visuals.ts` already defines per-element colors. Trail sprites already use `color: new THREE.Color(spellConfig.color)` for tinting. The color system works — the visual quality needs improvement.

### Current Spell Projectile Visual (What Needs Improving)
**File:** `packages/shared/src/systems/client/ProjectileRenderer.ts`

Current implementation:
- Single `THREE.Sprite` with a 64x64 `CanvasTexture` radial gradient (lines 278-336)
- 3-5 trailing sprites using a **shared white** trail texture tinted via `material.color` (lines 341-370, 596-617)
- No impact/hit effect
- No ambient particles around the orb during flight
- CanvasTexture approach doesn't work reliably in WebGPU renderer path (as documented in RunecraftingAltarEntity)

### Reference Pattern: RunecraftingAltarEntity
**File:** `packages/shared/src/entities/world/RunecraftingAltarEntity.ts`

The altar uses a superior particle approach:
- **DataTexture** with color baked into RGBA pixels (WebGPU-safe)
- **CircleGeometry + MeshBasicMaterial** instead of Sprite + SpriteMaterial
- **AdditiveBlending** + `depthWrite: false`
- **Billboard rotation** via `quaternion.copy(camera.quaternion)`
- **4 distinct particle layers** with varying sharpness/opacity/motion
- **`getRuneColors(runeType)`** returning `{core, mid, outer}` hex color palette

---

## Plan: Upgrade Spell Projectile Visuals

### File: `packages/shared/src/systems/client/ProjectileRenderer.ts`

#### Change 1: DataTexture Factory Method

Add a static method matching the RunecraftingAltarEntity pattern to replace CanvasTexture:

```typescript
private createColoredGlowTexture(colorHex: number, size: number, sharpness: number): THREE.DataTexture
```

- Extract RGB from hex color
- Create `Uint8Array(size * size * 4)` for RGBA
- For each pixel: compute radial distance from center, apply `Math.pow(falloff, sharpness)`, bake color * strength into RGB, alpha = 255 * strength
- Return `THREE.DataTexture` with `LinearFilter`

This replaces `createSpellTexture()` (lines 278-336) and `createTrailTexture()` (lines 341-370).

#### Change 2: Element Color Palette

Add a method to get a 3-color palette from a spell's base color (similar to `getRuneColors`):

```typescript
private getSpellColorPalette(config: SpellVisualConfig): { core: number; mid: number; outer: number }
```

- `core` = `config.coreColor ?? 0xffffff` (bright center)
- `mid` = `config.color` (primary element color)
- `outer` = darken `config.color` by ~40% (for trail/ambient glow)

This gives us three distinct tones per element for layered effects.

#### Change 3: Multi-Layer Projectile

Replace the single sprite with a 3-layer composite:

1. **Core orb** — DataTexture with `core` color, sharpness 3.0, size = `config.size`
2. **Outer glow** — DataTexture with `mid` color, sharpness 1.5, size = `config.size * 2.0`, opacity 0.4
3. **2 orbiting sparks** (bolt spells only) — DataTexture with `core` color, sharpness 4.0, tiny size

Group these as a `THREE.Group` with billboard rotation in the update loop (copy camera quaternion, same pattern as RunecraftingAltarEntity lines 824-836).

Use `CircleGeometry(0.5, 16) + MeshBasicMaterial` instead of Sprite for WebGPU compatibility.

#### Change 4: Colored Trail Sprites

Replace the single shared white trail texture with per-spell colored DataTextures:

- Use `outer` color from palette, sharpness 2.0
- Trail sprites already follow the projectile — just swap the texture source
- Remove the shared `trailTexture` member, use `spellTrailTextures: Map<string, THREE.DataTexture>`

#### Change 5: Impact Effect on Hit

When `COMBAT_PROJECTILE_HIT` is received (line 481), instead of just removing the projectile:

1. Spawn 4-6 burst particles at hit position using `mid` color
2. Each particle: random outward velocity (XZ) + upward drift, rapid fade (0.3-0.5s lifetime)
3. Use same CircleGeometry + colored DataTexture + AdditiveBlending
4. Track in a separate `impactParticles` array, update in `update()`, remove when faded

This gives visual feedback at the moment of impact.

#### Change 6: Pulsing Enhancement

For bolt-tier spells (which already have `pulseSpeed` and `pulseAmount` configured):

- Apply sine-wave scale oscillation to the outer glow layer (not core)
- Apply slight opacity oscillation to orbiting sparks
- This creates a "breathing" effect during flight

### Performance Considerations

- **Geometry reuse:** Single shared `CircleGeometry(0.5, 16)` instance (same as RunecraftingAltarEntity)
- **Texture caching:** DataTextures cached per spell ID (same as current CanvasTexture cache)
- **Particle count per projectile:** 3 layers + 3-5 trail = 6-8 objects (vs current 4-6). Marginal increase.
- **Impact particles:** 4-6 short-lived particles, at most a few active at once
- **Billboard rotation:** One `quaternion.copy()` per particle per frame. RunecraftingAltarEntity does 30 per altar with no issues.

### Cleanup

- Remove `createSpellTexture()` method (CanvasTexture approach)
- Remove `createTrailTexture()` method (shared white texture)
- Remove `spellTextures: Map<string, THREE.CanvasTexture>` — replace with `spellGlowTextures: Map<string, THREE.DataTexture>`
- Remove `trailTexture: THREE.CanvasTexture | null`

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/systems/client/ProjectileRenderer.ts` | All changes above (DataTexture, multi-layer, colored trail, impact, cleanup) |
| `packages/shared/src/data/spell-visuals.ts` | No changes needed — existing configs work with the new renderer |

**Only 1 file needs modification.** The spell-visuals.ts data layer remains untouched.

---

## Verification

1. `bun run build` — shared package compiles without errors
2. Cast each element spell (wind/water/earth/fire strike + bolt) — verify correct element colors
3. Verify core orb has bright center with colored outer glow
4. Verify trail is element-colored (not white)
5. Verify impact particles spawn at target position on hit
6. Verify bolt spells have pulsing outer glow
7. Verify no visual artifacts or z-fighting between layers
8. Verify arrow projectiles still render correctly (unchanged)
9. Test with multiple simultaneous projectiles (no texture cache issues)
10. Verify particles clean up when projectile is removed (no leaks)
