/**
 * VegetationSystem.ts - GPU Instanced Vegetation Rendering
 *
 * Provides efficient rendering of vegetation (trees, bushes, grass, flowers, rocks)
 * using Three.js InstancedMesh for batched GPU rendering.
 *
 * **Features:**
 * - GPU-instanced rendering for thousands of vegetation objects in few draw calls
 * - Procedural placement based on biome vegetation configuration
 * - Automatic LOD culling based on player distance
 * - Deterministic placement using seeded PRNG (same vegetation on client/server)
 * - Per-tile vegetation generation synced with terrain system
 * - Noise-based distribution for natural-looking placement
 * - Clustering support for natural groupings of vegetation
 *
 * **Performance:**
 * - Each vegetation type renders in a single draw call via InstancedMesh
 * - Dynamic visibility culling shows closest N instances
 * - Tile-based generation/unloading tied to terrain system
 *
 * **Integration:**
 * - Listens to TerrainSystem tile events for generation triggers
 * - Uses biome vegetation config from biomes.json
 * - Loads asset definitions from vegetation.json manifest
 *
 * **Runs on:** Client only (vegetation is purely visual)
 */

import THREE from "../../../extras/three/three";
import { System } from "..";
import type { World, WorldOptions } from "../../../types";
import type {
  VegetationAsset,
  VegetationLayer,
  VegetationInstance,
  BiomeVegetationConfig,
} from "../../../types/world/world-types";
import { EventType } from "../../../types/events";
import { modelCache } from "../../../utils/rendering/ModelCache";
import { NoiseGenerator } from "../../../utils/NoiseGenerator";

/**
 * Instanced asset data - tracks one InstancedMesh per loaded GLB
 */
interface InstancedAssetData {
  /** The GLB model scene (cloned for instancing) */
  geometry: THREE.BufferGeometry;
  /** Material(s) from the model */
  material: THREE.Material | THREE.Material[];
  /** The InstancedMesh for GPU batching */
  instancedMesh: THREE.InstancedMesh;
  /** Map from instance ID to matrix index */
  instanceMap: Map<string, number>;
  /** Reverse map: matrix index to instance data */
  instances: VegetationInstance[];
  /** Maximum instances this mesh can hold */
  maxInstances: number;
  /** Current active instance count */
  activeCount: number;
  /** Asset definition */
  asset: VegetationAsset;
}

/**
 * Tile vegetation data - tracks all instances for a terrain tile
 */
interface TileVegetationData {
  /** Tile key (format: "tileX_tileZ") */
  key: string;
  /** All instances in this tile, keyed by instance ID */
  instances: Map<string, VegetationInstance>;
  /** Whether this tile's vegetation has been generated */
  generated: boolean;
  /** Biome this tile belongs to */
  biome: string;
}

/**
 * Configuration for the vegetation system
 */
interface VegetationConfig {
  /** Maximum visible instances per asset type */
  maxInstancesPerAsset: number;
  /** Distance beyond which vegetation is culled */
  cullDistance: number;
  /** How often to update visibility (ms) */
  updateInterval: number;
  /** Minimum player movement to trigger visibility update */
  movementThreshold: number;
}

const DEFAULT_CONFIG: VegetationConfig = {
  maxInstancesPerAsset: 2000,
  cullDistance: 300,
  updateInterval: 500,
  movementThreshold: 10,
};

/**
 * VegetationSystem - GPU Instanced Vegetation Rendering
 */
export class VegetationSystem extends System {
  private scene: THREE.Scene | null = null;
  private vegetationGroup: THREE.Group | null = null;

  // Asset management
  private assetDefinitions = new Map<string, VegetationAsset>();
  private loadedAssets = new Map<string, InstancedAssetData>();
  private pendingAssetLoads = new Set<string>();

  // Tile vegetation tracking
  private tileVegetation = new Map<string, TileVegetationData>();

  // Visibility and culling
  private config: VegetationConfig = DEFAULT_CONFIG;
  private lastUpdateTime = 0;
  private lastPlayerPosition = new THREE.Vector3();
  private didInitialUpdate = false;

  // Noise generator for procedural placement
  private noise: NoiseGenerator | null = null;

  // Temp objects to avoid allocations
  private _tempMatrix = new THREE.Matrix4();
  private _tempPosition = new THREE.Vector3();
  private _tempQuaternion = new THREE.Quaternion();
  private _tempScale = new THREE.Vector3();
  private _tempEuler = new THREE.Euler();
  private _dummy = new THREE.Object3D();

  constructor(world: World) {
    super(world);
  }

  override getDependencies() {
    return { required: ["stage", "terrain"] };
  }

  async init(_options?: WorldOptions): Promise<void> {
    // Client-only system
    if (!this.world.isClient || typeof window === "undefined") {
      return;
    }

    // Initialize noise generator with world seed
    const seed = this.computeSeedFromWorldId();
    this.noise = new NoiseGenerator(seed);

    // Load vegetation asset definitions
    await this.loadAssetDefinitions();
  }

  /**
   * Compute a deterministic seed from world configuration
   */
  private computeSeedFromWorldId(): number {
    const worldConfig = (this.world as { config?: { terrainSeed?: number } })
      .config;
    if (worldConfig?.terrainSeed !== undefined) {
      return worldConfig.terrainSeed;
    }

    if (typeof process !== "undefined" && process.env?.TERRAIN_SEED) {
      const envSeed = parseInt(process.env.TERRAIN_SEED, 10);
      if (!isNaN(envSeed)) {
        return envSeed;
      }
    }

    return 0; // Fixed seed for deterministic vegetation
  }

  /**
   * Load vegetation asset definitions from manifest
   */
  private async loadAssetDefinitions(): Promise<void> {
    try {
      const assetsUrl = (this.world.assetsUrl || "").replace(/\/$/, "");
      const manifestUrl = `${assetsUrl}/manifests/vegetation.json`;

      const response = await fetch(manifestUrl);
      if (!response.ok) {
        console.warn(
          `[VegetationSystem] Failed to load vegetation manifest: ${response.status}`,
        );
        return;
      }

      const manifest = (await response.json()) as {
        version: number;
        assets: VegetationAsset[];
      };

      for (const asset of manifest.assets) {
        this.assetDefinitions.set(asset.id, asset);
      }

      console.log(
        `[VegetationSystem] Loaded ${this.assetDefinitions.size} vegetation asset definitions`,
      );
    } catch (error) {
      console.error(
        "[VegetationSystem] Error loading vegetation manifest:",
        error,
      );
    }
  }

  start(): void {
    if (!this.world.isClient || typeof window === "undefined") return;
    if (!this.world.stage?.scene) return;

    this.scene = this.world.stage.scene as THREE.Scene;

    // Create root group for all vegetation
    this.vegetationGroup = new THREE.Group();
    this.vegetationGroup.name = "VegetationSystem";
    this.scene.add(this.vegetationGroup);

    // Listen for terrain tile events
    this.world.on(
      EventType.TERRAIN_TILE_GENERATED,
      this.onTileGenerated.bind(this),
    );
    this.world.on(
      EventType.TERRAIN_TILE_UNLOADED,
      this.onTileUnloaded.bind(this),
    );

    console.log("[VegetationSystem] Started - listening for terrain events");
  }

  /**
   * Handle terrain tile generation - spawn vegetation for the tile
   */
  private async onTileGenerated(data: {
    tileX: number;
    tileZ: number;
    biome: string;
  }): Promise<void> {
    const key = `${data.tileX}_${data.tileZ}`;

    // Skip if already generated
    if (this.tileVegetation.has(key)) {
      return;
    }

    // Get biome vegetation configuration
    const biomeConfig = await this.getBiomeVegetationConfig(data.biome);
    if (!biomeConfig || !biomeConfig.enabled) {
      return;
    }

    // Create tile vegetation data
    const tileData: TileVegetationData = {
      key,
      instances: new Map(),
      generated: false,
      biome: data.biome,
    };
    this.tileVegetation.set(key, tileData);

    // Generate vegetation instances for this tile
    await this.generateTileVegetation(data.tileX, data.tileZ, biomeConfig);
    tileData.generated = true;
  }

  /**
   * Handle terrain tile unload - remove vegetation instances
   */
  private onTileUnloaded(data: { tileX: number; tileZ: number }): void {
    const key = `${data.tileX}_${data.tileZ}`;
    const tileData = this.tileVegetation.get(key);

    if (!tileData) return;

    // Remove all instances for this tile
    for (const instance of tileData.instances.values()) {
      this.removeInstance(instance);
    }

    this.tileVegetation.delete(key);
  }

  /**
   * Get biome vegetation configuration from BIOMES data
   */
  private async getBiomeVegetationConfig(
    biomeId: string,
  ): Promise<BiomeVegetationConfig | null> {
    // Access BIOMES data through the terrain system or data manager
    const terrainSystem = this.world.getSystem("terrain") as {
      getBiomeData?: (id: string) => { vegetation?: BiomeVegetationConfig };
    };

    if (terrainSystem?.getBiomeData) {
      const biomeData = terrainSystem.getBiomeData(biomeId);
      return biomeData?.vegetation ?? null;
    }

    // Fallback: try to get from global BIOMES using dynamic import
    try {
      const worldStructure = await import("../../../data/world-structure");
      const biome = worldStructure.BIOMES[biomeId];
      return biome?.vegetation ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Generate vegetation instances for a terrain tile
   */
  private async generateTileVegetation(
    tileX: number,
    tileZ: number,
    config: BiomeVegetationConfig,
  ): Promise<void> {
    const tileKey = `${tileX}_${tileZ}`;
    const tileData = this.tileVegetation.get(tileKey);
    if (!tileData) return;

    const terrainSystemRaw = this.world.getSystem("terrain");
    if (!terrainSystemRaw) {
      console.warn("[VegetationSystem] TerrainSystem not available");
      return;
    }

    // Type assertion through unknown to satisfy TypeScript
    const terrainSystem = terrainSystemRaw as unknown as {
      getHeightAt: (x: number, z: number) => number;
      getNormalAt?: (x: number, z: number) => THREE.Vector3;
      getTileSize: () => number;
    };

    if (!terrainSystem.getHeightAt) {
      console.warn("[VegetationSystem] TerrainSystem missing getHeightAt");
      return;
    }

    const tileSize = terrainSystem.getTileSize();
    const tileWorldX = tileX * tileSize;
    const tileWorldZ = tileZ * tileSize;

    // Process each vegetation layer
    for (const layer of config.layers) {
      await this.generateLayerVegetation(
        tileKey,
        tileWorldX,
        tileWorldZ,
        tileSize,
        layer,
        terrainSystem,
      );
    }
  }

  /**
   * Generate vegetation for a single layer within a tile
   */
  private async generateLayerVegetation(
    tileKey: string,
    tileWorldX: number,
    tileWorldZ: number,
    tileSize: number,
    layer: VegetationLayer,
    terrainSystem: {
      getHeightAt: (x: number, z: number) => number;
      getNormalAt?: (x: number, z: number) => THREE.Vector3;
    },
  ): Promise<void> {
    const tileData = this.tileVegetation.get(tileKey);
    if (!tileData) return;

    // Compute number of instances to generate based on density
    const targetCount = Math.floor(layer.density * (tileSize / 100) ** 2);

    // Create deterministic RNG for this tile/layer
    const rng = this.createTileLayerRng(tileKey, layer.category);

    // Get valid asset definitions for this layer
    const validAssets = layer.assets
      .map((id) => this.assetDefinitions.get(id))
      .filter((a): a is VegetationAsset => a !== undefined);

    if (validAssets.length === 0) {
      return;
    }

    // Calculate total weight for weighted random selection
    const totalWeight = validAssets.reduce((sum, a) => sum + a.weight, 0);

    // Generate candidate positions with clustering support
    const positions = this.generatePlacementPositions(
      tileWorldX,
      tileWorldZ,
      tileSize,
      targetCount,
      layer,
      rng,
    );

    // Place instances at valid positions
    let placedCount = 0;
    for (const pos of positions) {
      if (placedCount >= targetCount) break;

      // Get terrain height at position
      const height = terrainSystem.getHeightAt(pos.x, pos.z);

      // Check height constraints
      if (layer.minHeight !== undefined && height < layer.minHeight) continue;
      if (layer.maxHeight !== undefined && height > layer.maxHeight) continue;

      // Check water avoidance
      if (layer.avoidWater) {
        // Water threshold check (assumes water at y < some threshold)
        const waterThreshold = 0.5; // Configurable
        if (height < waterThreshold) continue;
      }

      // Check slope constraints
      if (layer.avoidSteepSlopes) {
        const slope = this.estimateSlope(
          pos.x,
          pos.z,
          terrainSystem.getHeightAt,
        );
        if (slope > 0.6) continue; // Skip steep slopes
      }

      // Select asset based on weighted random
      const asset = this.selectWeightedAsset(validAssets, totalWeight, rng);
      if (!asset) continue;

      // Check asset-specific slope constraints
      const slope = this.estimateSlope(pos.x, pos.z, terrainSystem.getHeightAt);
      if (asset.minSlope !== undefined && slope < asset.minSlope) continue;
      if (asset.maxSlope !== undefined && slope > asset.maxSlope) continue;

      // Calculate instance transform
      const scale =
        asset.baseScale *
        (asset.scaleVariation[0] +
          rng() * (asset.scaleVariation[1] - asset.scaleVariation[0]));

      const rotationY = asset.randomRotation ? rng() * Math.PI * 2 : 0;
      let rotationX = 0;
      let rotationZ = 0;

      // Align to terrain normal if requested
      if (asset.alignToNormal && terrainSystem.getNormalAt) {
        const normal = terrainSystem.getNormalAt(pos.x, pos.z);
        // Calculate rotation to align with normal
        this._tempEuler.setFromRotationMatrix(
          new THREE.Matrix4().lookAt(
            new THREE.Vector3(0, 0, 0),
            normal,
            new THREE.Vector3(0, 1, 0),
          ),
        );
        rotationX = this._tempEuler.x;
        rotationZ = this._tempEuler.z;
      }

      // Create instance
      const instance: VegetationInstance = {
        id: `${tileKey}_${layer.category}_${placedCount}`,
        assetId: asset.id,
        category: layer.category,
        position: {
          x: pos.x,
          y: height + (asset.yOffset ?? 0),
          z: pos.z,
        },
        rotation: { x: rotationX, y: rotationY, z: rotationZ },
        scale,
        tileKey,
      };

      // Add instance to tile data
      tileData.instances.set(instance.id, instance);

      // Add to instanced mesh (will load asset if needed)
      await this.addInstance(instance);

      placedCount++;
    }
  }

  /**
   * Generate placement positions with optional clustering
   */
  private generatePlacementPositions(
    tileWorldX: number,
    tileWorldZ: number,
    tileSize: number,
    targetCount: number,
    layer: VegetationLayer,
    rng: () => number,
  ): Array<{ x: number; z: number }> {
    const positions: Array<{ x: number; z: number }> = [];
    const noiseScale = layer.noiseScale ?? 0.05;
    const noiseThreshold = layer.noiseThreshold ?? 0.3;
    const minSpacing = layer.minSpacing;

    // Generate more candidates than needed, then filter
    const candidateMultiplier = 3;
    const maxCandidates = targetCount * candidateMultiplier;

    for (let i = 0; i < maxCandidates && positions.length < targetCount; i++) {
      let x: number;
      let z: number;

      if (layer.clustering && layer.clusterSize) {
        // Clustering: generate cluster centers, then scatter around them
        const clusterCount = Math.max(
          1,
          Math.floor(targetCount / layer.clusterSize),
        );
        const clusterIndex = Math.floor(rng() * clusterCount);

        // Deterministic cluster center
        const clusterRng = this.createTileLayerRng(
          `${tileWorldX}_${tileWorldZ}_cluster_${clusterIndex}`,
          layer.category,
        );
        const clusterCenterX =
          tileWorldX + tileSize * 0.1 + clusterRng() * tileSize * 0.8;
        const clusterCenterZ =
          tileWorldZ + tileSize * 0.1 + clusterRng() * tileSize * 0.8;

        // Scatter around cluster center with Gaussian-like distribution
        const angle = rng() * Math.PI * 2;
        const radius = rng() * rng() * minSpacing * layer.clusterSize;
        x = clusterCenterX + Math.cos(angle) * radius;
        z = clusterCenterZ + Math.sin(angle) * radius;
      } else {
        // Uniform random distribution
        x = tileWorldX + rng() * tileSize;
        z = tileWorldZ + rng() * tileSize;
      }

      // Ensure within tile bounds
      if (
        x < tileWorldX ||
        x >= tileWorldX + tileSize ||
        z < tileWorldZ ||
        z >= tileWorldZ + tileSize
      ) {
        continue;
      }

      // Noise-based filtering
      if (this.noise) {
        const noiseValue =
          (this.noise.perlin2D(x * noiseScale, z * noiseScale) + 1) / 2;
        if (noiseValue < noiseThreshold) continue;
      }

      // Minimum spacing check
      let tooClose = false;
      for (const existing of positions) {
        const dx = existing.x - x;
        const dz = existing.z - z;
        if (dx * dx + dz * dz < minSpacing * minSpacing) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      positions.push({ x, z });
    }

    return positions;
  }

  /**
   * Estimate terrain slope at a position
   */
  private estimateSlope(
    x: number,
    z: number,
    getHeight: (x: number, z: number) => number,
  ): number {
    const delta = 1.0;
    const _hCenter = getHeight(x, z); // Not used but called for consistency
    const hN = getHeight(x, z - delta);
    const hS = getHeight(x, z + delta);
    const hE = getHeight(x + delta, z);
    const hW = getHeight(x - delta, z);

    const dhdx = (hE - hW) / (2 * delta);
    const dhdz = (hS - hN) / (2 * delta);

    return Math.sqrt(dhdx * dhdx + dhdz * dhdz);
  }

  /**
   * Select a vegetation asset based on weighted probability
   */
  private selectWeightedAsset(
    assets: VegetationAsset[],
    totalWeight: number,
    rng: () => number,
  ): VegetationAsset | null {
    let random = rng() * totalWeight;
    for (const asset of assets) {
      random -= asset.weight;
      if (random <= 0) {
        return asset;
      }
    }
    return assets[assets.length - 1] ?? null;
  }

  /**
   * Create a deterministic RNG for a tile and layer
   */
  private createTileLayerRng(tileKey: string, category: string): () => number {
    // Hash the tile key and category into a seed
    let hash = 5381;
    const str = `${tileKey}_${category}`;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }

    let state = (hash >>> 0) ^ this.computeSeedFromWorldId();

    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
  }

  /**
   * Add a vegetation instance to the scene
   */
  private async addInstance(instance: VegetationInstance): Promise<void> {
    const asset = this.assetDefinitions.get(instance.assetId);
    if (!asset) {
      console.warn(`[VegetationSystem] Unknown asset: ${instance.assetId}`);
      return;
    }

    // Ensure asset is loaded
    let assetData: InstancedAssetData | undefined = this.loadedAssets.get(
      instance.assetId,
    );
    if (!assetData) {
      const loadedAsset = await this.loadAsset(asset);
      if (!loadedAsset) return;
      assetData = loadedAsset;
    }

    // Check if we have room for more instances
    if (assetData.activeCount >= assetData.maxInstances) {
      // Need to expand or skip
      console.warn(
        `[VegetationSystem] Max instances reached for ${instance.assetId}`,
      );
      return;
    }

    // Compute transformation matrix
    this._tempPosition.set(
      instance.position.x,
      instance.position.y,
      instance.position.z,
    );
    this._tempEuler.set(
      instance.rotation.x,
      instance.rotation.y,
      instance.rotation.z,
    );
    this._tempQuaternion.setFromEuler(this._tempEuler);
    this._tempScale.set(instance.scale, instance.scale, instance.scale);

    this._tempMatrix.compose(
      this._tempPosition,
      this._tempQuaternion,
      this._tempScale,
    );

    // Add to instanced mesh
    const matrixIndex = assetData.activeCount;
    assetData.instancedMesh.setMatrixAt(matrixIndex, this._tempMatrix);
    assetData.instancedMesh.instanceMatrix.needsUpdate = true;

    // Track instance
    assetData.instanceMap.set(instance.id, matrixIndex);
    assetData.instances[matrixIndex] = instance;
    instance.matrixIndex = matrixIndex;
    assetData.activeCount++;

    // Update instance count
    assetData.instancedMesh.count = assetData.activeCount;
  }

  /**
   * Remove a vegetation instance from the scene
   */
  private removeInstance(instance: VegetationInstance): void {
    const assetData = this.loadedAssets.get(instance.assetId);
    if (!assetData) return;

    const matrixIndex = assetData.instanceMap.get(instance.id);
    if (matrixIndex === undefined) return;

    // Swap with last instance to maintain contiguous array
    const lastIndex = assetData.activeCount - 1;
    if (matrixIndex !== lastIndex) {
      // Get last instance's matrix
      assetData.instancedMesh.getMatrixAt(lastIndex, this._tempMatrix);
      assetData.instancedMesh.setMatrixAt(matrixIndex, this._tempMatrix);

      // Update tracking for swapped instance
      const lastInstance = assetData.instances[lastIndex];
      if (lastInstance) {
        assetData.instanceMap.set(lastInstance.id, matrixIndex);
        assetData.instances[matrixIndex] = lastInstance;
        lastInstance.matrixIndex = matrixIndex;
      }
    }

    // Remove from tracking
    assetData.instanceMap.delete(instance.id);
    assetData.instances.pop();
    assetData.activeCount--;

    // Update instance count
    assetData.instancedMesh.count = assetData.activeCount;
    assetData.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Load a vegetation asset and create InstancedMesh
   */
  private async loadAsset(
    asset: VegetationAsset,
  ): Promise<InstancedAssetData | null> {
    // Prevent duplicate loads
    if (this.pendingAssetLoads.has(asset.id)) {
      // Wait for existing load to complete
      while (this.pendingAssetLoads.has(asset.id)) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return this.loadedAssets.get(asset.id) ?? null;
    }

    this.pendingAssetLoads.add(asset.id);

    try {
      const assetsUrl = this.world.assetsUrl || "";
      const modelPath = `${assetsUrl}/${asset.model}`;

      // Load the GLB model
      const { scene } = await modelCache.loadModel(modelPath, this.world);

      // Extract geometry and material from the loaded model
      let geometry: THREE.BufferGeometry | null = null;
      let material: THREE.Material | THREE.Material[] | null = null;

      // Find the first mesh in the scene hierarchy
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && !geometry) {
          geometry = child.geometry;
          material = child.material;
        }
      });

      if (!geometry || !material) {
        console.warn(`[VegetationSystem] No mesh found in asset: ${asset.id}`);
        return null;
      }

      // Create InstancedMesh
      const instancedMesh = new THREE.InstancedMesh(
        geometry,
        material,
        this.config.maxInstancesPerAsset,
      );
      instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instancedMesh.count = 0;
      instancedMesh.frustumCulled = false; // Handle culling ourselves
      instancedMesh.castShadow = asset.category === "tree"; // Only trees cast shadows
      instancedMesh.receiveShadow = true;
      instancedMesh.name = `Vegetation_${asset.id}`;

      // Add to scene
      if (this.vegetationGroup) {
        this.vegetationGroup.add(instancedMesh);
      }

      const assetData: InstancedAssetData = {
        geometry,
        material,
        instancedMesh,
        instanceMap: new Map(),
        instances: [],
        maxInstances: this.config.maxInstancesPerAsset,
        activeCount: 0,
        asset,
      };

      this.loadedAssets.set(asset.id, assetData);
      console.log(`[VegetationSystem] Loaded asset: ${asset.id}`);

      return assetData;
    } catch (error) {
      console.error(
        `[VegetationSystem] Error loading asset ${asset.id}:`,
        error,
      );
      return null;
    } finally {
      this.pendingAssetLoads.delete(asset.id);
    }
  }

  /**
   * Update visibility based on player distance (LOD culling)
   */
  private updateVisibility(): void {
    const now = Date.now();
    if (now - this.lastUpdateTime < this.config.updateInterval) {
      return;
    }
    this.lastUpdateTime = now;

    const playerPos = this.getPlayerPosition();
    if (!playerPos) return;

    // Check if player moved enough to warrant update
    if (
      this.didInitialUpdate &&
      playerPos.distanceTo(this.lastPlayerPosition) <
        this.config.movementThreshold
    ) {
      return;
    }

    this.lastPlayerPosition.copy(playerPos);
    this.didInitialUpdate = true;

    // Update visibility for each loaded asset
    for (const assetData of this.loadedAssets.values()) {
      this.updateAssetVisibility(assetData, playerPos);
    }
  }

  /**
   * Update visibility for a single asset type
   */
  private updateAssetVisibility(
    assetData: InstancedAssetData,
    playerPos: THREE.Vector3,
  ): void {
    // Sort instances by distance and show only closest ones within cull distance
    const instancesWithDistance: Array<{
      instance: VegetationInstance;
      distance: number;
    }> = [];

    for (const instance of assetData.instances) {
      if (!instance) continue;
      const dx = instance.position.x - playerPos.x;
      const dz = instance.position.z - playerPos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= this.config.cullDistance) {
        instancesWithDistance.push({ instance, distance });
      }
    }

    // Sort by distance
    instancesWithDistance.sort((a, b) => a.distance - b.distance);

    // Rebuild instance matrices in sorted order
    // (This is expensive - only do occasionally)
    const maxVisible = Math.min(
      instancesWithDistance.length,
      assetData.maxInstances,
    );

    for (let i = 0; i < maxVisible; i++) {
      const { instance } = instancesWithDistance[i];

      this._tempPosition.set(
        instance.position.x,
        instance.position.y,
        instance.position.z,
      );
      this._tempEuler.set(
        instance.rotation.x,
        instance.rotation.y,
        instance.rotation.z,
      );
      this._tempQuaternion.setFromEuler(this._tempEuler);
      this._tempScale.set(instance.scale, instance.scale, instance.scale);

      this._tempMatrix.compose(
        this._tempPosition,
        this._tempQuaternion,
        this._tempScale,
      );

      assetData.instancedMesh.setMatrixAt(i, this._tempMatrix);
    }

    assetData.instancedMesh.count = maxVisible;
    assetData.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Get current player position
   */
  private getPlayerPosition(): THREE.Vector3 | null {
    const players = this.world.getPlayers();
    if (!players || players.length === 0) return null;

    const player = players[0];
    if (player.node?.position) {
      return this._tempPosition.set(
        player.node.position.x,
        player.node.position.y,
        player.node.position.z,
      );
    }

    return null;
  }

  override update(_delta: number): void {
    if (!this.world.isClient) return;

    // Update visibility culling periodically
    this.updateVisibility();
  }

  /**
   * Configure the vegetation system
   */
  setConfig(config: Partial<VegetationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get statistics about vegetation system
   */
  getStats(): {
    totalAssets: number;
    loadedAssets: number;
    totalInstances: number;
    visibleInstances: number;
    tilesWithVegetation: number;
  } {
    let totalInstances = 0;
    let visibleInstances = 0;

    for (const assetData of this.loadedAssets.values()) {
      totalInstances += assetData.instances.length;
      visibleInstances += assetData.instancedMesh.count;
    }

    return {
      totalAssets: this.assetDefinitions.size,
      loadedAssets: this.loadedAssets.size,
      totalInstances,
      visibleInstances,
      tilesWithVegetation: this.tileVegetation.size,
    };
  }

  override destroy(): void {
    // Remove from scene
    if (this.vegetationGroup && this.vegetationGroup.parent) {
      this.vegetationGroup.parent.remove(this.vegetationGroup);
    }

    // Dispose all instanced meshes
    for (const assetData of this.loadedAssets.values()) {
      assetData.instancedMesh.dispose();
    }

    this.loadedAssets.clear();
    this.tileVegetation.clear();
    this.assetDefinitions.clear();
    this.vegetationGroup = null;
    this.scene = null;
  }
}

export default VegetationSystem;
