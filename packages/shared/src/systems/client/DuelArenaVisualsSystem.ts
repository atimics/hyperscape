/**
 * DuelArenaVisualsSystem - Procedural Duel Arena Rendering
 *
 * Creates visual geometry for the duel arena without requiring external models.
 * Uses procedural Three.js geometry to render:
 * - 6 arena floors (tan colored planes)
 * - Arena walls (brown colored boxes)
 * - Lobby floor area
 * - Hospital floor area
 *
 * This is a temporary visual system until proper building assets are created.
 *
 * Arena Layout (OSRS-style):
 * - 6 rectangular arenas in a 2x3 grid
 * - Each arena is 20m wide x 24m long
 * - 4m gap between arenas
 * - Base coordinates: x=3360, z=3240
 */

import THREE from "../../extras/three/three";
import { System } from "../shared/infrastructure/System";
import type { World } from "../../core/World";
import type { WorldOptions } from "../../types/index";

// ============================================================================
// Arena Configuration (matches ArenaPoolManager)
// ============================================================================

const ARENA_BASE_X = 3360;
const ARENA_BASE_Z = 3240;
const ARENA_Y = 0.05; // Slightly above ground to prevent z-fighting
const ARENA_WIDTH = 20;
const ARENA_LENGTH = 24;
const ARENA_GAP = 4;
const ARENA_COUNT = 6;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.5;

// Lobby configuration
const LOBBY_CENTER_X = 3375;
const LOBBY_CENTER_Z = 3217;
const LOBBY_WIDTH = 70;
const LOBBY_LENGTH = 35;

// Hospital configuration
const HOSPITAL_CENTER_X = 3200;
const HOSPITAL_CENTER_Z = 3200;
const HOSPITAL_WIDTH = 40;
const HOSPITAL_LENGTH = 30;

// Colors
const ARENA_FLOOR_COLOR = 0xd4a574; // Tan/sand color
const ARENA_WALL_COLOR = 0x8b4513; // Saddle brown
const LOBBY_FLOOR_COLOR = 0xc4956a; // Slightly darker tan
const HOSPITAL_FLOOR_COLOR = 0xe8e8e8; // Light gray (hospital)

// ============================================================================
// DuelArenaVisualsSystem
// ============================================================================

export class DuelArenaVisualsSystem extends System {
  name = "duel-arena-visuals";

  /** Container for all arena geometry */
  private arenaGroup: THREE.Group | null = null;

  /** Materials (cached for cleanup) */
  private materials: THREE.Material[] = [];

  /** Geometries (cached for cleanup) */
  private geometries: THREE.BufferGeometry[] = [];

  constructor(world: World) {
    super(world);
  }

  async init(options?: WorldOptions): Promise<void> {
    await super.init(options as WorldOptions);

    // Only run on client
    if (!this.world.isClient) {
      return;
    }

    this.createArenaVisuals();
  }

  /**
   * Create all arena visual geometry
   */
  private createArenaVisuals(): void {
    this.arenaGroup = new THREE.Group();
    this.arenaGroup.name = "DuelArenaVisuals";

    // Create lobby floor
    this.createLobbyFloor();

    // Create hospital floor
    this.createHospitalFloor();

    // Create 6 arena floors and walls
    for (let i = 0; i < ARENA_COUNT; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;

      const centerX =
        ARENA_BASE_X + col * (ARENA_WIDTH + ARENA_GAP) + ARENA_WIDTH / 2;
      const centerZ =
        ARENA_BASE_Z + row * (ARENA_LENGTH + ARENA_GAP) + ARENA_LENGTH / 2;

      this.createArenaFloor(centerX, centerZ, i + 1);
      this.createArenaWalls(centerX, centerZ);
    }

    // Add to scene
    if (this.world.stage?.scene) {
      this.world.stage?.scene.add(this.arenaGroup);
    }
  }

  /**
   * Create a single arena floor
   */
  private createArenaFloor(
    centerX: number,
    centerZ: number,
    arenaId: number,
  ): void {
    const geometry = new THREE.PlaneGeometry(ARENA_WIDTH - 1, ARENA_LENGTH - 1);
    geometry.rotateX(-Math.PI / 2); // Lay flat

    const material = new THREE.MeshStandardMaterial({
      color: ARENA_FLOOR_COLOR,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const floor = new THREE.Mesh(geometry, material);
    floor.position.set(centerX, ARENA_Y, centerZ);
    floor.receiveShadow = true;
    floor.name = `ArenaFloor_${arenaId}`;

    this.geometries.push(geometry);
    this.materials.push(material);
    this.arenaGroup!.add(floor);
  }

  /**
   * Create walls around a single arena
   */
  private createArenaWalls(centerX: number, centerZ: number): void {
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: ARENA_WALL_COLOR,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.materials.push(wallMaterial);

    // North wall
    this.createWall(
      centerX,
      centerZ - ARENA_LENGTH / 2,
      ARENA_WIDTH,
      WALL_THICKNESS,
      wallMaterial,
    );

    // South wall
    this.createWall(
      centerX,
      centerZ + ARENA_LENGTH / 2,
      ARENA_WIDTH,
      WALL_THICKNESS,
      wallMaterial,
    );

    // West wall
    this.createWall(
      centerX - ARENA_WIDTH / 2,
      centerZ,
      WALL_THICKNESS,
      ARENA_LENGTH,
      wallMaterial,
    );

    // East wall
    this.createWall(
      centerX + ARENA_WIDTH / 2,
      centerZ,
      WALL_THICKNESS,
      ARENA_LENGTH,
      wallMaterial,
    );
  }

  /**
   * Create a single wall segment
   */
  private createWall(
    x: number,
    z: number,
    width: number,
    depth: number,
    material: THREE.Material,
  ): void {
    const geometry = new THREE.BoxGeometry(width, WALL_HEIGHT, depth);
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(x, WALL_HEIGHT / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;

    this.geometries.push(geometry);
    this.arenaGroup!.add(wall);
  }

  /**
   * Create the lobby floor
   */
  private createLobbyFloor(): void {
    const geometry = new THREE.PlaneGeometry(LOBBY_WIDTH, LOBBY_LENGTH);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: LOBBY_FLOOR_COLOR,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const floor = new THREE.Mesh(geometry, material);
    floor.position.set(LOBBY_CENTER_X, ARENA_Y - 0.01, LOBBY_CENTER_Z);
    floor.receiveShadow = true;
    floor.name = "LobbyFloor";

    this.geometries.push(geometry);
    this.materials.push(material);
    this.arenaGroup!.add(floor);
  }

  /**
   * Create the hospital floor
   */
  private createHospitalFloor(): void {
    const geometry = new THREE.PlaneGeometry(HOSPITAL_WIDTH, HOSPITAL_LENGTH);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: HOSPITAL_FLOOR_COLOR,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const floor = new THREE.Mesh(geometry, material);
    floor.position.set(HOSPITAL_CENTER_X, ARENA_Y - 0.01, HOSPITAL_CENTER_Z);
    floor.receiveShadow = true;
    floor.name = "HospitalFloor";

    // Add a red cross marker
    this.createHospitalCross(HOSPITAL_CENTER_X, HOSPITAL_CENTER_Z);

    this.geometries.push(geometry);
    this.materials.push(material);
    this.arenaGroup!.add(floor);
  }

  /**
   * Create a red cross on the hospital floor
   */
  private createHospitalCross(x: number, z: number): void {
    const crossMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      roughness: 0.6,
      metalness: 0.0,
    });
    this.materials.push(crossMaterial);

    // Vertical bar of cross
    const vertGeom = new THREE.PlaneGeometry(2, 8);
    vertGeom.rotateX(-Math.PI / 2);
    const vertBar = new THREE.Mesh(vertGeom, crossMaterial);
    vertBar.position.set(x, ARENA_Y + 0.01, z);
    this.geometries.push(vertGeom);
    this.arenaGroup!.add(vertBar);

    // Horizontal bar of cross
    const horizGeom = new THREE.PlaneGeometry(8, 2);
    horizGeom.rotateX(-Math.PI / 2);
    const horizBar = new THREE.Mesh(horizGeom, crossMaterial);
    horizBar.position.set(x, ARENA_Y + 0.01, z);
    this.geometries.push(horizGeom);
    this.arenaGroup!.add(horizBar);
  }

  /**
   * Update (called each frame) - no-op for static geometry
   */
  update(_deltaTime: number): void {
    // Static geometry, no updates needed
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    // Remove from scene
    if (this.arenaGroup && this.world.stage?.scene) {
      this.world.stage?.scene.remove(this.arenaGroup);
    }

    // Dispose geometries
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    this.geometries = [];

    // Dispose materials
    for (const material of this.materials) {
      material.dispose();
    }
    this.materials = [];

    this.arenaGroup = null;
    super.destroy();
  }
}
