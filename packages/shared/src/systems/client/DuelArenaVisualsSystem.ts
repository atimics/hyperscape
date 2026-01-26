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
 * - Base coordinates: x=60, z=80 (near spawn)
 */

import THREE from "../../extras/three/three";
import { System } from "../shared/infrastructure/System";
import type { World } from "../../core/World";
import type { WorldOptions } from "../../types/index";

// ============================================================================
// Arena Configuration (matches ArenaPoolManager)
// ============================================================================

const ARENA_BASE_X = 60;
const ARENA_BASE_Z = 80;
const ARENA_WIDTH = 20;
const ARENA_LENGTH = 24;
const ARENA_GAP = 4;
const ARENA_COUNT = 6;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.5;
const FLOOR_HEIGHT_OFFSET = 0.2; // How high above terrain to place floors

// Lobby configuration
const LOBBY_CENTER_X = 105;
const LOBBY_CENTER_Z = 62;
const LOBBY_WIDTH = 40;
const LOBBY_LENGTH = 25;

// Hospital configuration
const HOSPITAL_CENTER_X = 65;
const HOSPITAL_CENTER_Z = 62;
const HOSPITAL_WIDTH = 30;
const HOSPITAL_LENGTH = 25;

// Colors - OSRS-style tan/brown
const ARENA_FLOOR_COLOR = 0xd4a574; // Sandy tan
const ARENA_WALL_COLOR = 0x8b6914; // Brown walls
const LOBBY_FLOOR_COLOR = 0xc9b896; // Lighter tan for lobby
const HOSPITAL_FLOOR_COLOR = 0xffffff; // White hospital floor

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

  /** Track if visuals have been created */
  private visualsCreated = false;

  /** Reference to terrain system for height queries */
  private terrainSystem: {
    getHeightAt?: (x: number, z: number) => number;
  } | null = null;

  constructor(world: World) {
    super(world);
  }

  /**
   * Get terrain height at world position, with fallback
   */
  private getTerrainHeight(x: number, z: number): number {
    if (this.terrainSystem?.getHeightAt) {
      try {
        const height = this.terrainSystem.getHeightAt(x, z);
        return height ?? 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  async init(options?: WorldOptions): Promise<void> {
    await super.init(options as WorldOptions);
    console.log(
      "[DuelArenaVisualsSystem] init() called, isClient:",
      this.world.isClient,
    );
  }

  /**
   * Called after all systems are initialized and world is ready
   */
  start(): void {
    // Only run on client
    if (!this.world.isClient) {
      console.log("[DuelArenaVisualsSystem] Skipping - not client");
      return;
    }

    // Get terrain system for height queries
    this.terrainSystem = this.world.getSystem("terrain") as {
      getHeightAt?: (x: number, z: number) => number;
    } | null;

    if (!this.terrainSystem?.getHeightAt) {
      console.warn(
        "[DuelArenaVisualsSystem] TerrainSystem not available, using fallback heights",
      );
    }

    console.log(
      "[DuelArenaVisualsSystem] start() called, creating arena visuals...",
    );
    this.createArenaVisuals();
  }

  /**
   * Create all arena visual geometry
   */
  private createArenaVisuals(): void {
    if (this.visualsCreated) {
      console.log("[DuelArenaVisualsSystem] Visuals already created, skipping");
      return;
    }

    this.arenaGroup = new THREE.Group();
    this.arenaGroup.name = "DuelArenaVisuals";

    // Create a tall beacon so you can find the arena
    this.createBeacon();

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
      this.world.stage.scene.add(this.arenaGroup);
      this.visualsCreated = true;
      console.log(
        `[DuelArenaVisualsSystem] ✅ Added arena visuals to scene at x=${ARENA_BASE_X}, z=${ARENA_BASE_Z}`,
      );
      console.log(
        `[DuelArenaVisualsSystem] Created ${ARENA_COUNT} arenas, lobby at (${LOBBY_CENTER_X}, ${LOBBY_CENTER_Z}), hospital at (${HOSPITAL_CENTER_X}, ${HOSPITAL_CENTER_Z})`,
      );
      console.log(
        `[DuelArenaVisualsSystem] Total meshes in group: ${this.arenaGroup.children.length}, geometries: ${this.geometries.length}, materials: ${this.materials.length}`,
      );
    } else {
      console.warn(
        "[DuelArenaVisualsSystem] ⚠️ No stage/scene available, cannot add arena visuals",
      );
    }
  }

  /**
   * Create a single arena floor - snapped to terrain height
   */
  private createArenaFloor(
    centerX: number,
    centerZ: number,
    arenaId: number,
  ): void {
    // Get terrain height at center of arena
    const terrainY = this.getTerrainHeight(centerX, centerZ);
    const floorY = terrainY + FLOOR_HEIGHT_OFFSET;

    const geometry = new THREE.BoxGeometry(
      ARENA_WIDTH - 1,
      0.3,
      ARENA_LENGTH - 1,
    );

    const material = new THREE.MeshStandardMaterial({
      color: ARENA_FLOOR_COLOR,
      emissive: ARENA_FLOOR_COLOR,
      emissiveIntensity: 0.3,
    });

    const floor = new THREE.Mesh(geometry, material);
    floor.position.set(centerX, floorY, centerZ);
    floor.name = `ArenaFloor_${arenaId}`;

    console.log(
      `[DuelArenaVisualsSystem] Created floor ${arenaId} at (${centerX}, ${floorY.toFixed(1)}, ${centerZ}) - terrain=${terrainY.toFixed(1)}`,
    );

    this.geometries.push(geometry);
    this.materials.push(material);
    this.arenaGroup!.add(floor);
  }

  /**
   * Create walls around a single arena - snapped to terrain height
   */
  private createArenaWalls(centerX: number, centerZ: number): void {
    // Get terrain height at center
    const terrainY = this.getTerrainHeight(centerX, centerZ);

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: ARENA_WALL_COLOR,
      emissive: ARENA_WALL_COLOR,
      emissiveIntensity: 0.3,
    });
    this.materials.push(wallMaterial);

    // North wall
    this.createWall(
      centerX,
      centerZ - ARENA_LENGTH / 2,
      ARENA_WIDTH,
      WALL_THICKNESS,
      wallMaterial,
      terrainY,
    );

    // South wall
    this.createWall(
      centerX,
      centerZ + ARENA_LENGTH / 2,
      ARENA_WIDTH,
      WALL_THICKNESS,
      wallMaterial,
      terrainY,
    );

    // West wall
    this.createWall(
      centerX - ARENA_WIDTH / 2,
      centerZ,
      WALL_THICKNESS,
      ARENA_LENGTH,
      wallMaterial,
      terrainY,
    );

    // East wall
    this.createWall(
      centerX + ARENA_WIDTH / 2,
      centerZ,
      WALL_THICKNESS,
      ARENA_LENGTH,
      wallMaterial,
      terrainY,
    );
  }

  /**
   * Create a single wall segment at terrain height
   */
  private createWall(
    x: number,
    z: number,
    width: number,
    depth: number,
    material: THREE.Material,
    terrainY: number,
  ): void {
    const geometry = new THREE.BoxGeometry(width, WALL_HEIGHT, depth);
    const wall = new THREE.Mesh(geometry, material);
    // Position wall on top of terrain
    wall.position.set(x, terrainY + FLOOR_HEIGHT_OFFSET + WALL_HEIGHT / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;

    this.geometries.push(geometry);
    this.arenaGroup!.add(wall);
  }

  /**
   * Create a tall beacon to help locate the arena (temporary debug helper)
   */
  private createBeacon(): void {
    // Get terrain height at beacon position
    const terrainY = this.getTerrainHeight(ARENA_BASE_X, ARENA_BASE_Z);
    const beaconHeight = 30;

    const geometry = new THREE.CylinderGeometry(1, 1, beaconHeight, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffff00, // Bright yellow
      emissive: 0xffff00,
      emissiveIntensity: 0.5,
    });

    const beacon = new THREE.Mesh(geometry, material);
    // Position beacon starting from terrain height
    beacon.position.set(
      ARENA_BASE_X,
      terrainY + beaconHeight / 2,
      ARENA_BASE_Z,
    );
    beacon.name = "ArenaBeacon";

    this.geometries.push(geometry);
    this.materials.push(material);
    this.arenaGroup!.add(beacon);

    console.log(
      `[DuelArenaVisualsSystem] Created beacon at (${ARENA_BASE_X}, ${(terrainY + beaconHeight / 2).toFixed(1)}, ${ARENA_BASE_Z}) - terrain=${terrainY.toFixed(1)}`,
    );
  }

  /**
   * Create the lobby floor - snapped to terrain height
   */
  private createLobbyFloor(): void {
    const terrainY = this.getTerrainHeight(LOBBY_CENTER_X, LOBBY_CENTER_Z);
    const floorY = terrainY + FLOOR_HEIGHT_OFFSET;

    const geometry = new THREE.BoxGeometry(LOBBY_WIDTH, 0.3, LOBBY_LENGTH);

    const material = new THREE.MeshStandardMaterial({
      color: LOBBY_FLOOR_COLOR,
      emissive: LOBBY_FLOOR_COLOR,
      emissiveIntensity: 0.3,
    });

    const floor = new THREE.Mesh(geometry, material);
    floor.position.set(LOBBY_CENTER_X, floorY, LOBBY_CENTER_Z);
    floor.name = "LobbyFloor";

    console.log(
      `[DuelArenaVisualsSystem] Created lobby floor at (${LOBBY_CENTER_X}, ${floorY.toFixed(1)}, ${LOBBY_CENTER_Z}) - terrain=${terrainY.toFixed(1)}`,
    );

    this.geometries.push(geometry);
    this.materials.push(material);
    this.arenaGroup!.add(floor);
  }

  /**
   * Create the hospital floor - snapped to terrain height
   */
  private createHospitalFloor(): void {
    const terrainY = this.getTerrainHeight(
      HOSPITAL_CENTER_X,
      HOSPITAL_CENTER_Z,
    );
    const floorY = terrainY + FLOOR_HEIGHT_OFFSET;

    const geometry = new THREE.BoxGeometry(
      HOSPITAL_WIDTH,
      0.3,
      HOSPITAL_LENGTH,
    );

    const material = new THREE.MeshStandardMaterial({
      color: HOSPITAL_FLOOR_COLOR,
      emissive: HOSPITAL_FLOOR_COLOR,
      emissiveIntensity: 0.3,
    });

    const floor = new THREE.Mesh(geometry, material);
    floor.position.set(HOSPITAL_CENTER_X, floorY, HOSPITAL_CENTER_Z);
    floor.name = "HospitalFloor";

    console.log(
      `[DuelArenaVisualsSystem] Created hospital floor at (${HOSPITAL_CENTER_X}, ${floorY.toFixed(1)}, ${HOSPITAL_CENTER_Z}) - terrain=${terrainY.toFixed(1)}`,
    );

    // Add a red cross marker
    this.createHospitalCross(HOSPITAL_CENTER_X, HOSPITAL_CENTER_Z, floorY);

    this.geometries.push(geometry);
    this.materials.push(material);
    this.arenaGroup!.add(floor);
  }

  /**
   * Create a red cross on the hospital floor
   */
  private createHospitalCross(x: number, z: number, floorY: number): void {
    const crossMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
    });
    this.materials.push(crossMaterial);

    // Vertical bar of cross
    const vertGeom = new THREE.PlaneGeometry(2, 8);
    vertGeom.rotateX(-Math.PI / 2);
    const vertBar = new THREE.Mesh(vertGeom, crossMaterial);
    vertBar.position.set(x, floorY + 0.2, z);
    this.geometries.push(vertGeom);
    this.arenaGroup!.add(vertBar);

    // Horizontal bar of cross
    const horizGeom = new THREE.PlaneGeometry(8, 2);
    horizGeom.rotateX(-Math.PI / 2);
    const horizBar = new THREE.Mesh(horizGeom, crossMaterial);
    horizBar.position.set(x, floorY + 0.2, z);
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
    this.visualsCreated = false;
    super.destroy();
  }
}
