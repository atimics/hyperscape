/**
 * EntityHighlightService
 *
 * Manages RS3-style entity outline highlighting on mouse hover.
 * Maps entity types to highlight colors and drives the post-processing
 * outline pass via the PostProcessingComposer.
 *
 * Color scheme:
 * - Red: Items, lootable corpses/headstones
 * - Yellow: Hostile mobs
 * - Cyan: Friendly NPCs
 * - White: Other players
 * - Green: Resources, stations, interactable objects
 */

import * as THREE from "three";
import type { World } from "../../../../core/World";
import type { PostProcessingComposer } from "../../../../utils/rendering/PostProcessingFactory";
import type { RaycastTarget, InteractableEntityType } from "../types";

// Pre-allocated color objects to avoid per-hover allocations
const HIGHLIGHT_COLORS: Record<string, THREE.Color> = {
  // Items — most important to spot
  item: new THREE.Color(0xff0000),

  // Hostile mobs
  mob: new THREE.Color(0xffff00),

  // Friendly NPCs
  npc: new THREE.Color(0x00ffff),

  // Other players
  player: new THREE.Color(0xffffff),

  // Gatherable resources (trees, rocks, fishing spots)
  resource: new THREE.Color(0x00ff00),

  // Interactable stations/objects
  bank: new THREE.Color(0x00ff00),
  furnace: new THREE.Color(0x00ff00),
  anvil: new THREE.Color(0x00ff00),
  altar: new THREE.Color(0x00ff00),
  runecrafting_altar: new THREE.Color(0x00ff00),
  fire: new THREE.Color(0x00ff00),
  range: new THREE.Color(0x00ff00),
  starter_chest: new THREE.Color(0x00ff00),
  forfeit_pillar: new THREE.Color(0x00ff00),

  // Lootable
  corpse: new THREE.Color(0xff0000),
  headstone: new THREE.Color(0xff0000),
};

const DEFAULT_COLOR = new THREE.Color(0xffffff);

// Reusable array to avoid allocations when collecting meshes
const _meshBuffer: THREE.Object3D[] = [];

export class EntityHighlightService {
  private currentTargetId: string | null = null;
  private composer: PostProcessingComposer | null = null;

  constructor(private world: World) {}

  /**
   * Set the composer reference (called when graphics initializes)
   */
  setComposer(composer: PostProcessingComposer | null): void {
    this.composer = composer;
  }

  /**
   * Get the highlight color for a given entity type
   */
  getHighlightColor(entityType: InteractableEntityType): THREE.Color {
    return HIGHLIGHT_COLORS[entityType] ?? DEFAULT_COLOR;
  }

  /**
   * Update the hover target. Pass null to clear.
   * Only updates the outline pass when the target changes.
   */
  setHoverTarget(target: RaycastTarget | null): void {
    // Same target — no work needed
    const newId = target?.entityId ?? null;
    if (newId === this.currentTargetId) return;

    this.currentTargetId = newId;

    if (!this.composer) return;

    if (!target || !target.entity) {
      // Clear outline
      this.composer.setOutlineObjects([]);
      return;
    }

    // Check interactability via userData
    const mesh = target.entity.mesh;
    const node = target.entity.node;
    const root = mesh ?? node;
    if (!root) {
      this.composer.setOutlineObjects([]);
      return;
    }

    const userData = root.userData;
    if (userData && userData.interactable === false) {
      this.composer.setOutlineObjects([]);
      return;
    }

    // Collect all mesh children for the outline pass
    const meshes = this.collectMeshes(root);
    if (meshes.length === 0) {
      this.composer.setOutlineObjects([]);
      return;
    }

    // Set color based on entity type
    const color = this.getHighlightColor(target.entityType);
    this.composer.setOutlineColor(color);
    this.composer.setOutlineObjects(meshes);
  }

  /**
   * Clear the current hover highlight
   */
  clearHover(): void {
    if (this.currentTargetId === null) return;
    this.currentTargetId = null;
    if (this.composer) {
      this.composer.setOutlineObjects([]);
    }
  }

  /**
   * Collect all Mesh objects from an entity's scene graph node.
   * Uses the visual mesh (not raycast proxies) for accurate outlines.
   */
  private collectMeshes(root: THREE.Object3D): THREE.Object3D[] {
    _meshBuffer.length = 0;

    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        _meshBuffer.push(child);
      }
    });

    // If no child meshes found, use the root itself (e.g. simple geometry)
    if (_meshBuffer.length === 0 && root instanceof THREE.Mesh) {
      _meshBuffer.push(root);
    }

    return _meshBuffer;
  }
}
