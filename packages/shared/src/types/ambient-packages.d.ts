/**
 * Ambient type declarations for internal packages
 *
 * These declarations allow TypeScript to resolve imports from internal
 * workspace packages during declaration file generation, even when those
 * packages have circular dependencies with shared.
 *
 * At runtime, the actual package implementations are used.
 * These are intentionally permissive to avoid blocking builds.
 */

declare module "@hyperscape/impostor" {
  import type * as THREE from "three";

  export const OctahedronType: {
    readonly HEMI: 0;
    readonly FULL: 1;
  };
  export type OctahedronTypeValue = 0 | 1;

  export const PBRBakeMode: {
    readonly BASIC: 0;
    readonly STANDARD: 1;
    readonly FULL: 2;
    readonly COMPLETE: 3;
  };
  export type PBRBakeModeValue = 0 | 1 | 2 | 3;

  export interface OctahedronMeshData {
    wireframeMesh: THREE.Mesh;
    filledMesh: THREE.Mesh;
    planePoints: number[];
    octPoints: number[];
  }

  export interface ImpostorBakeConfig {
    atlasWidth: number;
    atlasHeight: number;
    gridSizeX: number;
    gridSizeY: number;
    octType: OctahedronTypeValue;
    backgroundColor?: number;
    backgroundAlpha?: number;
    pbrMode?: PBRBakeModeValue;
    depthNear?: number;
    depthFar?: number;
    verticalPacking?: number;
  }

  export interface ImpostorBakeResult {
    atlasTexture: THREE.Texture;
    renderTarget: THREE.RenderTarget;
    normalAtlasTexture?: THREE.Texture;
    normalRenderTarget?: THREE.RenderTarget;
    depthAtlasTexture?: THREE.Texture;
    depthRenderTarget?: THREE.RenderTarget;
    pbrAtlasTexture?: THREE.Texture;
    pbrRenderTarget?: THREE.RenderTarget;
    gridSizeX: number;
    gridSizeY: number;
    octType: OctahedronTypeValue;
    boundingSphere: THREE.Sphere;
    boundingBox?: THREE.Box3;
    octMeshData?: OctahedronMeshData;
    depthNear?: number;
    depthFar?: number;
    pbrMode?: PBRBakeModeValue;
  }

  export interface ImpostorInstance {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
    update(camera: THREE.Camera): void;
    dispose(): void;
  }

  export interface CompatibleRenderer {
    getRenderTarget(): unknown;
    setRenderTarget(
      target: unknown,
      activeCubeFace?: number,
      activeMipmapLevel?: number,
    ): void;
    getViewport(target: THREE.Vector4): THREE.Vector4;
    setViewport(...args: unknown[]): void;
    setScissorTest(enable: boolean): void;
    setScissor(...args: unknown[]): void;
    setClearColor(color: THREE.ColorRepresentation, alpha?: number): void;
    clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
    render(scene: THREE.Object3D, camera: THREE.Camera): void;
    renderAsync?(scene: THREE.Object3D, camera: THREE.Camera): Promise<void>;
    getPixelRatio(): number;
    setPixelRatio(value: number): void;
  }

  export interface DissolveConfig {
    enabled?: boolean;
    fadeStart?: number;
    fadeEnd?: number;
    playerPos?: THREE.Vector3;
  }

  export interface ImpostorLightingConfig {
    ambientColor: THREE.Vector3;
    ambientIntensity: number;
    directionalLights: Array<{
      direction: THREE.Vector3;
      color: THREE.Vector3;
      intensity: number;
    }>;
    pointLights: Array<{
      position: THREE.Vector3;
      color: THREE.Vector3;
      intensity: number;
      distance: number;
      decay: number;
    }>;
  }

  export class OctahedralImpostor {
    constructor(renderer: CompatibleRenderer);
    bake(
      source: THREE.Object3D,
      config?: Partial<ImpostorBakeConfig>,
    ): Promise<ImpostorBakeResult>;
    createInstance(result: ImpostorBakeResult): ImpostorInstance;
    dispose(): void;
  }

  export class ImpostorBaker {
    constructor(renderer: CompatibleRenderer);
    bake(
      source: THREE.Object3D,
      config?: Partial<ImpostorBakeConfig>,
    ): Promise<ImpostorBakeResult>;
    bakeFull(
      source: THREE.Object3D,
      config?: Partial<ImpostorBakeConfig>,
    ): Promise<ImpostorBakeResult>;
    bakeWithNormals(
      source: THREE.Object3D,
      config?: Partial<ImpostorBakeConfig>,
    ): Promise<ImpostorBakeResult>;
    createBakingSource(source: THREE.Object3D): THREE.Group;
    dispose(): void;
  }

  export interface TSLImpostorMaterialOptions {
    atlasTexture: THREE.Texture;
    gridSizeX: number;
    gridSizeY: number;
    normalAtlasTexture?: THREE.Texture;
    depthAtlasTexture?: THREE.Texture;
    pbrAtlasTexture?: THREE.Texture;
    transparent?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    side?: THREE.Side;
    enableLighting?: boolean;
    enableDepthBlending?: boolean;
    enableSpecular?: boolean;
    depthNear?: number;
    depthFar?: number;
    objectScale?: number;
  }

  export interface TSLImpostorMaterial extends THREE.Material {
    atlasTexture: THREE.Texture;
    gridSizeX: number;
    gridSizeY: number;
    impostorUniforms?: Record<string, unknown>;
    updateView?(camera: THREE.Camera, objectMatrix: THREE.Matrix4): void;
    updateLighting?(config: ImpostorLightingConfig): void;
  }

  export function createTSLImpostorMaterial(
    options: TSLImpostorMaterialOptions,
  ): TSLImpostorMaterial;

  export function isTSLImpostorMaterial(
    material: THREE.Material,
  ): material is TSLImpostorMaterial;

  export class ImpostorMaterialTSL {
    material: THREE.Material;
    constructor(options?: Record<string, unknown>);
    dispose(): void;
  }

  export class AnimatedImpostorBaker {
    constructor(renderer: CompatibleRenderer);
    bake(
      source: THREE.Object3D,
      clip: THREE.AnimationClip,
      config?: Record<string, unknown>,
    ): Promise<unknown>;
    dispose(): void;
  }

  export class InstancedAnimatedImpostor {
    mesh: THREE.Mesh;
    parent?: THREE.Object3D;
    constructor(config: Record<string, unknown>);
    setInstanceCount(count: number): void;
    update(deltaTime: number): void;
    dispose(): void;
  }

  export class GlobalMobAtlasBuilder {
    constructor(renderer: CompatibleRenderer);
    dispose(): void;
  }

  export class GlobalMobAtlasManager {
    dispose(): void;
  }

  export function buildOctahedronMesh(
    gridSizeX: number,
    gridSizeY?: number,
    octType?: OctahedronTypeValue,
  ): OctahedronMeshData;

  export function lerpOctahedronGeometry(
    octMeshData: OctahedronMeshData,
    direction: THREE.Vector3,
  ): { faceIndices: THREE.Vector3; faceWeights: THREE.Vector3 };

  export function getViewDirection(
    camera: THREE.Camera,
    objectMatrix: THREE.Matrix4,
  ): THREE.Vector3;

  export function directionToUV(
    direction: THREE.Vector3,
    octType?: OctahedronTypeValue,
  ): THREE.Vector2;

  export function directionToGridCell(
    direction: THREE.Vector3,
    gridSizeX: number,
    gridSizeY: number,
    octType?: OctahedronTypeValue,
  ): { col: number; row: number };

  export const DEFAULT_BAKE_CONFIG: ImpostorBakeConfig;
}

declare module "@hyperscape/procgen" {
  import type * as THREE from "three";

  export interface BranchCluster {
    position: THREE.Vector3;
    direction: THREE.Vector3;
    radius: number;
    leaves: unknown[];
  }

  export interface BranchClusterResult {
    clusters: BranchCluster[];
    geometry?: THREE.BufferGeometry;
  }

  export interface BranchClusterOptions {
    maxClusters?: number;
    clusterRadius?: number;
  }

  export class BranchClusterGenerator {
    constructor(options?: BranchClusterOptions);
    generate(branches: unknown[]): BranchClusterResult;
  }

  export interface TreeGeneratorOptions {
    seed?: number;
    preset?: string;
    scale?: number;
  }

  export interface TreeGeneratorResult {
    group: THREE.Group;
    trunk: THREE.Mesh;
    leaves: THREE.Mesh;
    bounds: THREE.Box3;
  }

  export class TreeGenerator {
    constructor(options?: TreeGeneratorOptions);
    generate(): TreeGeneratorResult;
  }

  export function generateTree(
    options?: TreeGeneratorOptions,
  ): TreeGeneratorResult;

  // Namespace exports
  export namespace PlantGen {
    export function generate(options?: unknown): unknown;
  }

  export namespace RockGen {
    export interface RockGeneratorOptions {
      seed?: number;
      size?: number;
      detail?: number;
      type?: string;
    }

    export interface RockGeneratorResult {
      geometry: THREE.BufferGeometry;
      bounds: THREE.Box3;
    }

    export class RockGenerator {
      constructor(options?: RockGeneratorOptions);
      generate(): RockGeneratorResult;
    }

    export function generateRock(
      options?: RockGeneratorOptions,
    ): RockGeneratorResult;
  }

  export namespace BuildingGen {
    export function generate(options?: unknown): unknown;
  }

  export namespace TerrainGen {
    export function generate(options?: unknown): unknown;
  }

  export namespace VegetationGen {
    export function generate(options?: unknown): unknown;
  }
}

declare module "@hyperscape/procgen/building" {
  import type * as THREE from "three";

  export const CELL_SIZE: number;
  export const FOUNDATION_HEIGHT: number;
  export const COUNTER_DEPTH: number;
  export const NPC_WIDTH: number;

  export function snapToBuildingGrid(value: number): number;
  export function getCellCenter(col: number, row: number): THREE.Vector3;
  export function getSideVector(side: number): THREE.Vector3;

  export interface BuildingLayout {
    width: number;
    depth: number;
    floors: number;
    cells: unknown[][];
    doors: unknown[];
    windows: unknown[];
  }

  export interface PropPlacements {
    counters: unknown[];
    shelves: unknown[];
    decorations: unknown[];
  }

  export interface BuildingLOD {
    mesh: THREE.Mesh;
    distance: number;
  }

  export interface BuildingConfig {
    width: number;
    depth: number;
    floors: number;
    roofType?: string;
    style?: string;
  }

  export interface BuildingResult {
    mesh: THREE.Mesh;
    collider: THREE.Box3;
    layout: BuildingLayout;
    propPlacements?: PropPlacements;
    lods?: BuildingLOD[];
  }

  export class BuildingGenerator {
    constructor();
    generate(config: BuildingConfig, terrain?: unknown): BuildingResult;
  }

  export function generateBuilding(
    config: BuildingConfig,
    terrain?: unknown,
  ): BuildingResult;
}

declare module "@hyperscape/procgen/building/town" {
  import type * as THREE from "three";

  export interface TownConfig {
    size: number;
    density: number;
    seed?: number;
  }

  export interface TownSizeConfig {
    minSize: number;
    maxSize: number;
  }

  export interface TownGeneratorConfig {
    townConfig: TownConfig;
    sizeConfig?: TownSizeConfig;
  }

  export interface GeneratedTown {
    buildings: Array<{
      position: THREE.Vector3;
      config: unknown;
      result: unknown;
    }>;
    roads: Array<{ start: THREE.Vector3; end: THREE.Vector3 }>;
    bounds: THREE.Box3;
  }

  export interface TerrainProvider {
    getHeightAt(x: number, z: number): number;
    getNormalAt?(x: number, z: number): THREE.Vector3;
  }

  export class TownGenerator {
    constructor(config?: TownGeneratorConfig);
    generate(terrain?: TerrainProvider): GeneratedTown;
  }

  export function generateTownLayout(config: TownConfig): unknown;
}

declare module "@hyperscape/procgen/terrain" {
  import type * as THREE from "three";

  export interface BiomeDefinition {
    name: string;
    heightRange: [number, number];
    moisture: number;
    temperature: number;
    color: THREE.Color;
  }

  export interface TerrainConfig {
    width: number;
    depth: number;
    resolution: number;
    seed?: number;
    tileSize?: number;
    heightScale?: number;
    octaves?: number;
  }

  export interface TerrainResult {
    geometry: THREE.BufferGeometry;
    heightMap: Float32Array;
    normalMap?: Float32Array;
  }

  export class TerrainGenerator {
    constructor(config?: Partial<TerrainConfig>);
    generate(biome?: BiomeDefinition): TerrainResult;
    getHeightAt(x: number, z: number): number;
    getNormalAt(x: number, z: number): THREE.Vector3;
  }
}

declare module "@hyperscape/procgen/rock" {
  import type * as THREE from "three";

  export interface RockConfig {
    seed?: number;
    size?: number;
    detail?: number;
    type?: "boulder" | "cliff" | "pebble";
  }

  export interface RockResult {
    geometry: THREE.BufferGeometry;
    bounds: THREE.Box3;
  }

  export class RockGenerator {
    constructor(options?: RockConfig);
    generate(): RockResult;
  }

  export function generateRock(config?: RockConfig): RockResult;

  export class RockCache {
    constructor();
    get(key: string): RockResult | undefined;
    set(key: string, result: RockResult): void;
    clear(): void;
  }
}

declare module "@hyperscape/procgen/plant" {
  import type * as THREE from "three";

  export interface PlantConfig {
    seed?: number;
    type?: "grass" | "flower" | "bush" | "fern";
    scale?: number;
  }

  export interface PlantResult {
    geometry: THREE.BufferGeometry;
    bounds: THREE.Box3;
  }

  export function generatePlant(config?: PlantConfig): PlantResult;

  export class PlantCache {
    constructor();
    get(key: string): PlantResult | undefined;
    set(key: string, result: PlantResult): void;
    clear(): void;
  }

  export class StumpGenerator {
    constructor();
    generate(options?: unknown): THREE.Mesh;
  }
}

declare module "@hyperscape/procgen/items" {
  export interface ItemConfig {
    type: string;
    quality?: number;
  }

  export function generateItemModel(config: ItemConfig): unknown;
}

declare module "@hyperscape/procgen/items/dock" {
  import type * as THREE from "three";

  export interface DockConfig {
    length: number;
    width: number;
    posts?: number;
  }

  export function generateDock(config: DockConfig): THREE.Group;
  export function createDock(config: DockConfig): THREE.Group;
}
