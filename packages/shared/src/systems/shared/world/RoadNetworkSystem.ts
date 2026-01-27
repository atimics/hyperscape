/**
 * RoadNetworkSystem - Procedural Road Generation
 * Uses MST + BFS pathfinding + Chaikin smoothing for organic roads.
 *
 * Configuration loaded from world-config.json via DataManager.
 * IMPORTANT: DataManager.loadManifests*() must be called BEFORE RoadNetworkSystem.init()
 * otherwise default configuration values will be used.
 *
 * **Worker Optimization:**
 * - Path smoothing (Chaikin algorithm) is offloaded to ProcgenWorker
 * - BFS pathfinding remains on main thread due to terrain height dependency
 * - Future: Could pre-compute passability grid and move BFS to worker
 */

import { System } from "../infrastructure/System";
import type { World } from "../../../core/World";
import type {
  ProceduralRoad,
  ProceduralTown,
  RoadPathPoint,
  RoadTileSegment,
  RoadNetwork,
} from "../../../types/world/world-types";
import { NoiseGenerator } from "../../../utils/NoiseGenerator";
import type { TownSystem } from "./TownSystem";
import { EventType } from "../../../types/events";
import { Logger } from "../../../utils/Logger";
import { DataManager } from "../../../data/DataManager";
import {
  smoothPathAsync,
  isProcgenWorkerAvailable,
} from "../../../utils/workers";

// Default configuration values
const DEFAULTS = {
  roadWidth: 4,
  pathStepSize: 20,
  maxPathIterations: 10000,
  extraConnectionsRatio: 0.25,
  costBase: 1.0,
  costSlopeMultiplier: 5.0,
  costWaterPenalty: 1000,
  smoothingIterations: 2,
  noiseDisplacementScale: 0.01,
  noiseDisplacementStrength: 3,
  minPointSpacing: 4,
  heuristicWeight: 2.5,
} as const;

const DEFAULT_BIOME_COSTS: Record<string, number> = {
  plains: 1.0,
  valley: 1.0,
  forest: 1.3,
  tundra: 1.5,
  desert: 2.0,
  swamp: 2.5,
  mountains: 3.0,
  lakes: 100,
};

/** Road configuration loaded from world-config.json (exported for testing) */
export interface RoadConfig {
  roadWidth: number;
  pathStepSize: number;
  maxPathIterations: number;
  extraConnectionsRatio: number;
  costBase: number;
  costSlopeMultiplier: number;
  costWaterPenalty: number;
  smoothingIterations: number;
  noiseDisplacementScale: number;
  noiseDisplacementStrength: number;
  minPointSpacing: number;
  heuristicWeight: number;
  biomeCosts: Record<string, number>;
}

/** Load road configuration from DataManager (exported for testing) */
export function loadRoadConfig(): RoadConfig {
  const manifest = DataManager.getWorldConfig()?.roads;
  const biomeCosts = { ...DEFAULT_BIOME_COSTS };
  if (manifest?.costBiomeMultipliers) {
    Object.assign(biomeCosts, manifest.costBiomeMultipliers);
  }
  return {
    roadWidth: manifest?.roadWidth ?? DEFAULTS.roadWidth,
    pathStepSize: manifest?.pathStepSize ?? DEFAULTS.pathStepSize,
    maxPathIterations:
      manifest?.maxPathIterations ?? DEFAULTS.maxPathIterations,
    extraConnectionsRatio:
      manifest?.extraConnectionsRatio ?? DEFAULTS.extraConnectionsRatio,
    costBase: manifest?.costBase ?? DEFAULTS.costBase,
    costSlopeMultiplier:
      manifest?.costSlopeMultiplier ?? DEFAULTS.costSlopeMultiplier,
    costWaterPenalty: manifest?.costWaterPenalty ?? DEFAULTS.costWaterPenalty,
    smoothingIterations:
      manifest?.smoothingIterations ?? DEFAULTS.smoothingIterations,
    noiseDisplacementScale:
      manifest?.noiseDisplacementScale ?? DEFAULTS.noiseDisplacementScale,
    noiseDisplacementStrength:
      manifest?.noiseDisplacementStrength ?? DEFAULTS.noiseDisplacementStrength,
    minPointSpacing: manifest?.minPointSpacing ?? DEFAULTS.minPointSpacing,
    heuristicWeight: manifest?.heuristicWeight ?? DEFAULTS.heuristicWeight,
    biomeCosts,
  };
}

/** Generate A* pathfinding directions from step size (exported for testing) */
export function getDirections(
  stepSize: number,
): Array<{ dx: number; dz: number }> {
  return [
    { dx: stepSize, dz: 0 },
    { dx: -stepSize, dz: 0 },
    { dx: 0, dz: stepSize },
    { dx: 0, dz: -stepSize },
    { dx: stepSize, dz: stepSize },
    { dx: stepSize, dz: -stepSize },
    { dx: -stepSize, dz: stepSize },
    { dx: -stepSize, dz: -stepSize },
  ];
}

const TILE_SIZE = 100;
const WATER_THRESHOLD = 5.4;

const dist2D = (x1: number, z1: number, x2: number, z2: number): number =>
  Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);

/** Simple BFS path node */
interface BFSNode {
  x: number;
  z: number;
  parent: BFSNode | null;
}

interface Edge {
  fromId: string;
  toId: string;
  distance: number;
}

export class RoadNetworkSystem extends System {
  private roads: ProceduralRoad[] = [];
  private townSystem?: TownSystem;
  private noise!: NoiseGenerator;
  private seed: number = 0;
  private randomState: number = 0;
  private config!: RoadConfig;
  private directions!: Array<{ dx: number; dz: number }>;
  private terrainSystem?: {
    getHeightAt(x: number, z: number): number;
    getBiomeAtWorldPosition?(x: number, z: number): string;
  };
  private tileRoadCache = new Map<string, RoadTileSegment[]>();

  constructor(world: World) {
    super(world);
  }

  getDependencies() {
    return { required: ["terrain", "towns"], optional: [] };
  }

  async init(): Promise<void> {
    const worldConfig = (this.world as { config?: { terrainSeed?: number } })
      .config;
    this.seed = worldConfig?.terrainSeed ?? 0;
    this.randomState = this.seed;
    this.noise = new NoiseGenerator(this.seed + 54321);
    this.config = loadRoadConfig();
    this.directions = getDirections(this.config.pathStepSize);

    this.terrainSystem = this.world.getSystem("terrain") as
      | {
          getHeightAt(x: number, z: number): number;
          getBiomeAtWorldPosition?(x: number, z: number): string;
        }
      | undefined;
    this.townSystem = this.world.getSystem("towns") as TownSystem | undefined;

    if (DataManager.getWorldConfig()?.roads) {
      Logger.system(
        "RoadNetworkSystem",
        `Config: ${this.config.roadWidth}m roads, ${this.config.extraConnectionsRatio} extra connections`,
      );
    }
  }

  async start(): Promise<void> {
    if (!this.terrainSystem)
      throw new Error("RoadNetworkSystem requires TerrainSystem");
    if (!this.townSystem)
      throw new Error("RoadNetworkSystem requires TownSystem");

    const towns = this.townSystem.getTowns();
    if (towns.length < 2) {
      Logger.systemWarn("RoadNetworkSystem", "Not enough towns for roads");
      return;
    }

    // Generate roads - uses worker for path smoothing when available
    const startTime = performance.now();
    await this.generateRoadNetworkAsync(towns);
    const elapsed = performance.now() - startTime;

    this.validateNetworkConnectivity(towns);
    await this.buildTileCacheAsync();

    Logger.system(
      "RoadNetworkSystem",
      `Generated ${this.roads.length} roads connecting ${towns.length} towns in ${elapsed.toFixed(0)}ms` +
        (isProcgenWorkerAvailable() ? " (worker-assisted)" : ""),
    );
    this.world.emit(EventType.ROADS_GENERATED, {
      roadCount: this.roads.length,
      townCount: towns.length,
    });
  }

  private validateNetworkConnectivity(towns: ProceduralTown[]): void {
    if (towns.length === 0) return;

    const adjacency = new Map<string, Set<string>>();
    for (const town of towns) adjacency.set(town.id, new Set());
    for (const road of this.roads) {
      adjacency.get(road.fromTownId)?.add(road.toTownId);
      adjacency.get(road.toTownId)?.add(road.fromTownId);
    }

    const visited = new Set<string>();
    const queue = [towns[0].id];
    visited.add(towns[0].id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const unreachable = towns.filter((t) => !visited.has(t.id));
    if (unreachable.length > 0) {
      Logger.systemError(
        "RoadNetworkSystem",
        `${unreachable.length} towns not connected: ${unreachable.map((t) => t.name).join(", ")}`,
      );
    }
    if (this.roads.length < towns.length - 1) {
      Logger.systemWarn(
        "RoadNetworkSystem",
        `Only ${this.roads.length} roads, expected >= ${towns.length - 1}`,
      );
    }
  }

  private random(): number {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 0xffffffff;
  }

  private resetRandom(seed: number): void {
    this.randomState = seed;
  }

  /**
   * Generate road network asynchronously.
   * Uses worker for path smoothing when available.
   */
  private async generateRoadNetworkAsync(
    towns: ProceduralTown[],
  ): Promise<void> {
    const edges = this.calculateAllEdges(towns);
    const mstEdges = this.buildMST(towns, edges);
    const extraEdges = this.selectExtraEdges(edges, mstEdges, towns.length);
    const allEdges = [...mstEdges, ...extraEdges];
    this.roads = [];

    // Process roads in parallel batches for better performance
    const BATCH_SIZE = 4;
    for (let i = 0; i < allEdges.length; i += BATCH_SIZE) {
      const batch = allEdges.slice(i, i + BATCH_SIZE);
      const roadPromises = batch.map(async (edge, batchIndex) => {
        const roadIndex = i + batchIndex;
        const fromTown = towns.find((t) => t.id === edge.fromId);
        const toTown = towns.find((t) => t.id === edge.toId);
        if (!fromTown || !toTown) return null;

        return this.generateRoadAsync(fromTown, toTown, roadIndex);
      });

      const results = await Promise.all(roadPromises);
      for (let j = 0; j < results.length; j++) {
        const road = results[j];
        if (road) {
          const edge = batch[j];
          const fromTown = towns.find((t) => t.id === edge.fromId);
          const toTown = towns.find((t) => t.id === edge.toId);
          if (fromTown && toTown) {
            this.roads.push(road);
            fromTown.connectedRoads.push(road.id);
            toTown.connectedRoads.push(road.id);
          }
        }
      }
    }
  }

  /** @deprecated Use generateRoadNetworkAsync instead */
  private generateRoadNetwork(towns: ProceduralTown[]): void {
    const edges = this.calculateAllEdges(towns);
    const mstEdges = this.buildMST(towns, edges);
    const extraEdges = this.selectExtraEdges(edges, mstEdges, towns.length);
    const allEdges = [...mstEdges, ...extraEdges];
    this.roads = [];

    for (let i = 0; i < allEdges.length; i++) {
      const edge = allEdges[i];
      const fromTown = towns.find((t) => t.id === edge.fromId);
      const toTown = towns.find((t) => t.id === edge.toId);
      if (!fromTown || !toTown) continue;

      const road = this.generateRoad(fromTown, toTown, i);
      if (road) {
        this.roads.push(road);
        fromTown.connectedRoads.push(road.id);
        toTown.connectedRoads.push(road.id);
      }
    }
  }

  private calculateAllEdges(towns: ProceduralTown[]): Edge[] {
    const edges: Edge[] = [];
    for (let i = 0; i < towns.length; i++) {
      for (let j = i + 1; j < towns.length; j++) {
        edges.push({
          fromId: towns[i].id,
          toId: towns[j].id,
          distance: dist2D(
            towns[i].position.x,
            towns[i].position.z,
            towns[j].position.x,
            towns[j].position.z,
          ),
        });
      }
    }
    return edges;
  }

  /** Prim's algorithm for MST */
  private buildMST(towns: ProceduralTown[], edges: Edge[]): Edge[] {
    const mstEdges: Edge[] = [];
    const inMST = new Set<string>([towns[0].id]);

    while (inMST.size < towns.length) {
      let minEdge: Edge | null = null;
      let minDistance = Infinity;

      for (const edge of edges) {
        const fromInMST = inMST.has(edge.fromId);
        const toInMST = inMST.has(edge.toId);
        if (fromInMST !== toInMST && edge.distance < minDistance) {
          minDistance = edge.distance;
          minEdge = edge;
        }
      }

      if (minEdge) {
        mstEdges.push(minEdge);
        inMST.add(minEdge.fromId);
        inMST.add(minEdge.toId);
      } else {
        break;
      }
    }
    return mstEdges;
  }

  private selectExtraEdges(
    allEdges: Edge[],
    mstEdges: Edge[],
    townCount: number,
  ): Edge[] {
    const mstEdgeSet = new Set<string>();
    for (const edge of mstEdges) {
      mstEdgeSet.add(`${edge.fromId}-${edge.toId}`);
      mstEdgeSet.add(`${edge.toId}-${edge.fromId}`);
    }

    const nonMstEdges = allEdges
      .filter(
        (e) =>
          !mstEdgeSet.has(`${e.fromId}-${e.toId}`) &&
          !mstEdgeSet.has(`${e.toId}-${e.fromId}`),
      )
      .sort((a, b) => a.distance - b.distance);

    return nonMstEdges.slice(
      0,
      Math.floor(townCount * this.config.extraConnectionsRatio),
    );
  }

  /**
   * Generate a single road asynchronously.
   * Uses worker for path smoothing when available.
   */
  private async generateRoadAsync(
    fromTown: ProceduralTown,
    toTown: ProceduralTown,
    roadIndex: number,
  ): Promise<ProceduralRoad | null> {
    // Find the best entry points for each town (closest to the other town)
    const fromEntry = this.findBestEntryPoint(fromTown, toTown.position);
    const toEntry = this.findBestEntryPoint(toTown, fromTown.position);

    // BFS pathfinding - async with yielding to prevent main thread blocking
    // Still on main thread due to terrain height dependency
    // TODO: Could pre-compute passability grid and move to worker entirely
    const rawPath = await this.findPathAsync(
      fromEntry.x,
      fromEntry.z,
      toEntry.x,
      toEntry.z,
    );
    if (rawPath.length < 2) {
      Logger.systemWarn(
        "RoadNetworkSystem",
        `No path between ${fromTown.name} and ${toTown.name}`,
      );
      return null;
    }

    // Try to smooth path using worker (Chaikin algorithm offloaded)
    let smoothedPath: RoadPathPoint[];
    if (isProcgenWorkerAvailable()) {
      const smoothResult = await smoothPathAsync(
        rawPath.map((p) => ({ x: p.x, z: p.z })),
        {
          iterations: this.config.smoothingIterations,
          noiseScale: this.config.noiseDisplacementScale,
          noiseStrength: this.config.noiseDisplacementStrength,
          seed: this.seed + roadIndex * 7793,
        },
      );

      if (smoothResult) {
        // Add Y coordinates from terrain (requires main thread)
        smoothedPath = smoothResult.path.map((p) => ({
          x: p.x,
          z: p.z,
          y: this.terrainSystem!.getHeightAt(p.x, p.z),
        }));
      } else {
        // Fallback to sync smoothing
        smoothedPath = this.smoothPath(rawPath, roadIndex);
      }
    } else {
      // No worker available - use sync path
      smoothedPath = this.smoothPath(rawPath, roadIndex);
    }

    let totalLength = 0;
    for (let i = 1; i < smoothedPath.length; i++) {
      totalLength += dist2D(
        smoothedPath[i - 1].x,
        smoothedPath[i - 1].z,
        smoothedPath[i].x,
        smoothedPath[i].z,
      );
    }

    return {
      id: `road_${roadIndex}`,
      fromTownId: fromTown.id,
      toTownId: toTown.id,
      path: smoothedPath,
      width: this.config.roadWidth,
      material: "dirt",
      length: totalLength,
    };
  }

  /** @deprecated Use generateRoadAsync instead */
  private generateRoad(
    fromTown: ProceduralTown,
    toTown: ProceduralTown,
    roadIndex: number,
  ): ProceduralRoad | null {
    // Find the best entry points for each town (closest to the other town)
    const fromEntry = this.findBestEntryPoint(fromTown, toTown.position);
    const toEntry = this.findBestEntryPoint(toTown, fromTown.position);

    const rawPath = this.findPath(
      fromEntry.x,
      fromEntry.z,
      toEntry.x,
      toEntry.z,
    );
    if (rawPath.length < 2) {
      Logger.systemWarn(
        "RoadNetworkSystem",
        `No path between ${fromTown.name} and ${toTown.name}`,
      );
      return null;
    }

    const smoothedPath = this.smoothPath(rawPath, roadIndex);
    let totalLength = 0;
    for (let i = 1; i < smoothedPath.length; i++) {
      totalLength += dist2D(
        smoothedPath[i - 1].x,
        smoothedPath[i - 1].z,
        smoothedPath[i].x,
        smoothedPath[i].z,
      );
    }

    return {
      id: `road_${roadIndex}`,
      fromTownId: fromTown.id,
      toTownId: toTown.id,
      path: smoothedPath,
      width: this.config.roadWidth,
      material: "dirt",
      length: totalLength,
    };
  }

  /**
   * Find the best entry point for a town when connecting to a target position.
   * Returns the entry point position closest to the target, or the town center
   * offset toward the target if no entry points exist.
   */
  private findBestEntryPoint(
    town: ProceduralTown,
    targetPos: { x: number; z: number },
  ): { x: number; z: number } {
    const entryPoints = town.entryPoints;

    if (!entryPoints || entryPoints.length === 0) {
      // No entry points - calculate position at edge of town toward target
      const dx = targetPos.x - town.position.x;
      const dz = targetPos.z - town.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1) return { x: town.position.x, z: town.position.z };

      // Return position at safe zone edge toward target
      const edgeDist = town.safeZoneRadius * 0.8;
      return {
        x: town.position.x + (dx / dist) * edgeDist,
        z: town.position.z + (dz / dist) * edgeDist,
      };
    }

    // Find entry point closest to target direction
    const angleToTarget = Math.atan2(
      targetPos.z - town.position.z,
      targetPos.x - town.position.x,
    );

    let bestEntry = entryPoints[0];
    let bestAngleDiff = Math.PI * 2;

    for (const entry of entryPoints) {
      let angleDiff = Math.abs(entry.angle - angleToTarget);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

      if (angleDiff < bestAngleDiff) {
        bestAngleDiff = angleDiff;
        bestEntry = entry;
      }
    }

    return bestEntry.position;
  }

  /**
   * BFS pathfinding - Simple and reliable path finding (sync version).
   * Finds path avoiding water tiles without complex heuristics.
   * @deprecated Use findPathAsync for non-blocking operation
   */
  private findPath(
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
  ): RoadPathPoint[] {
    const { pathStepSize, maxPathIterations } = this.config;
    const gridStartX = Math.round(startX / pathStepSize) * pathStepSize;
    const gridStartZ = Math.round(startZ / pathStepSize) * pathStepSize;
    const gridEndX = Math.round(endX / pathStepSize) * pathStepSize;
    const gridEndZ = Math.round(endZ / pathStepSize) * pathStepSize;

    // BFS uses a simple queue (FIFO)
    const queue: BFSNode[] = [];
    const visited = new Set<string>();

    const startNode: BFSNode = {
      x: gridStartX,
      z: gridStartZ,
      parent: null,
    };
    queue.push(startNode);
    visited.add(`${gridStartX},${gridStartZ}`);

    let iterations = 0;
    while (queue.length > 0 && iterations < maxPathIterations) {
      iterations++;
      const current = queue.shift()!;

      // Check if we reached the goal
      if (
        Math.abs(current.x - gridEndX) <= pathStepSize &&
        Math.abs(current.z - gridEndZ) <= pathStepSize
      ) {
        return this.reconstructBFSPath(current, endX, endZ);
      }

      // Explore neighbors
      for (const dir of this.directions) {
        const neighborX = current.x + dir.dx;
        const neighborZ = current.z + dir.dz;
        const neighborKey = `${neighborX},${neighborZ}`;

        if (visited.has(neighborKey)) continue;

        // Check if tile is passable (not water)
        if (!this.isPassable(neighborX, neighborZ)) continue;

        visited.add(neighborKey);
        queue.push({
          x: neighborX,
          z: neighborZ,
          parent: current,
        });
      }
    }

    // BFS completed without finding path - use direct path as fallback
    Logger.systemWarn(
      "RoadNetworkSystem",
      `BFS completed in ${iterations} iterations, using direct path`,
    );
    return this.generateDirectPath(startX, startZ, endX, endZ);
  }

  /**
   * Async BFS pathfinding with yielding to prevent main thread blocking.
   * Yields every YIELD_INTERVAL iterations to allow frame rendering.
   */
  private async findPathAsync(
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
  ): Promise<RoadPathPoint[]> {
    const { pathStepSize, maxPathIterations } = this.config;
    const gridStartX = Math.round(startX / pathStepSize) * pathStepSize;
    const gridStartZ = Math.round(startZ / pathStepSize) * pathStepSize;
    const gridEndX = Math.round(endX / pathStepSize) * pathStepSize;
    const gridEndZ = Math.round(endZ / pathStepSize) * pathStepSize;

    // Yield every 200 iterations to allow frame rendering
    const YIELD_INTERVAL = 200;

    // BFS uses a simple queue (FIFO)
    const queue: BFSNode[] = [];
    const visited = new Set<string>();

    const startNode: BFSNode = {
      x: gridStartX,
      z: gridStartZ,
      parent: null,
    };
    queue.push(startNode);
    visited.add(`${gridStartX},${gridStartZ}`);

    let iterations = 0;
    while (queue.length > 0 && iterations < maxPathIterations) {
      iterations++;
      const current = queue.shift()!;

      // Check if we reached the goal
      if (
        Math.abs(current.x - gridEndX) <= pathStepSize &&
        Math.abs(current.z - gridEndZ) <= pathStepSize
      ) {
        return this.reconstructBFSPath(current, endX, endZ);
      }

      // Explore neighbors
      for (const dir of this.directions) {
        const neighborX = current.x + dir.dx;
        const neighborZ = current.z + dir.dz;
        const neighborKey = `${neighborX},${neighborZ}`;

        if (visited.has(neighborKey)) continue;

        // Check if tile is passable (not water)
        if (!this.isPassable(neighborX, neighborZ)) continue;

        visited.add(neighborKey);
        queue.push({
          x: neighborX,
          z: neighborZ,
          parent: current,
        });
      }

      // Yield to main thread periodically to prevent blocking
      if (iterations % YIELD_INTERVAL === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    // BFS completed without finding path - use direct path as fallback
    Logger.systemWarn(
      "RoadNetworkSystem",
      `BFS completed in ${iterations} iterations, using direct path`,
    );
    return this.generateDirectPath(startX, startZ, endX, endZ);
  }

  /**
   * Check if a tile is passable (not underwater)
   */
  private isPassable(x: number, z: number): boolean {
    if (!this.terrainSystem) return true;
    const height = this.terrainSystem.getHeightAt(x, z);
    return height >= WATER_THRESHOLD;
  }

  /**
   * Reconstruct path from BFS end node
   */
  private reconstructBFSPath(
    endNode: BFSNode,
    finalX: number,
    finalZ: number,
  ): RoadPathPoint[] {
    const path: RoadPathPoint[] = [];
    let current: BFSNode | null = endNode;
    while (current) {
      path.unshift({
        x: current.x,
        z: current.z,
        y: this.terrainSystem!.getHeightAt(current.x, current.z),
      });
      current = current.parent;
    }
    path.push({
      x: finalX,
      z: finalZ,
      y: this.terrainSystem!.getHeightAt(finalX, finalZ),
    });
    return path;
  }

  private generateDirectPath(
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
  ): RoadPathPoint[] {
    const path: RoadPathPoint[] = [];
    const dx = endX - startX;
    const dz = endZ - startZ;
    const steps = Math.ceil(
      Math.sqrt(dx * dx + dz * dz) / this.config.pathStepSize,
    );
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startX + dx * t;
      const z = startZ + dz * t;
      path.push({ x, z, y: this.terrainSystem!.getHeightAt(x, z) });
    }
    return path;
  }

  /** Chaikin smoothing + noise displacement */
  private smoothPath(
    rawPath: RoadPathPoint[],
    roadIndex: number,
  ): RoadPathPoint[] {
    if (rawPath.length < 3) return rawPath;

    const {
      smoothingIterations,
      noiseDisplacementScale,
      noiseDisplacementStrength,
    } = this.config;
    let smoothed = [...rawPath];

    for (let iter = 0; iter < smoothingIterations; iter++) {
      const newPath: RoadPathPoint[] = [smoothed[0]];
      for (let i = 0; i < smoothed.length - 1; i++) {
        const p0 = smoothed[i];
        const p1 = smoothed[i + 1];
        const q = {
          x: p0.x * 0.75 + p1.x * 0.25,
          z: p0.z * 0.75 + p1.z * 0.25,
          y: 0,
        };
        const r = {
          x: p0.x * 0.25 + p1.x * 0.75,
          z: p0.z * 0.25 + p1.z * 0.75,
          y: 0,
        };
        q.y = this.terrainSystem!.getHeightAt(q.x, q.z);
        r.y = this.terrainSystem!.getHeightAt(r.x, r.z);
        newPath.push(q, r);
      }
      newPath.push(smoothed[smoothed.length - 1]);
      smoothed = newPath;
    }

    this.resetRandom(this.seed + roadIndex * 7793);
    const displaced: RoadPathPoint[] = [smoothed[0]];

    for (let i = 1; i < smoothed.length - 1; i++) {
      const point = smoothed[i];
      const prev = smoothed[i - 1];
      const next = smoothed[i + 1];
      const dirX = next.x - prev.x;
      const dirZ = next.z - prev.z;
      const length = dist2D(0, 0, dirX, dirZ);

      if (length > 0.001) {
        const perpX = -dirZ / length;
        const perpZ = dirX / length;
        const displacement =
          this.noise.simplex2D(
            point.x * noiseDisplacementScale,
            point.z * noiseDisplacementScale,
          ) * noiseDisplacementStrength;
        const newX = point.x + perpX * displacement;
        const newZ = point.z + perpZ * displacement;
        const newY = this.terrainSystem!.getHeightAt(newX, newZ);
        displaced.push(
          newY >= WATER_THRESHOLD ? { x: newX, z: newZ, y: newY } : point,
        );
      } else {
        displaced.push(point);
      }
    }
    displaced.push(smoothed[smoothed.length - 1]);

    const finalPath: RoadPathPoint[] = [displaced[0]];
    for (let i = 1; i < displaced.length; i++) {
      const last = finalPath[finalPath.length - 1];
      if (
        i === displaced.length - 1 ||
        dist2D(displaced[i].x, displaced[i].z, last.x, last.z) >=
          this.config.minPointSpacing
      ) {
        finalPath.push(displaced[i]);
      }
    }
    return finalPath;
  }

  /**
   * Build tile cache synchronously (deprecated - use buildTileCacheAsync)
   * @deprecated Use buildTileCacheAsync for non-blocking operation
   */
  private buildTileCache(): void {
    this.tileRoadCache.clear();

    for (const road of this.roads) {
      for (let i = 0; i < road.path.length - 1; i++) {
        const p1 = road.path[i];
        const p2 = road.path[i + 1];

        const minTileX = Math.floor(Math.min(p1.x, p2.x) / TILE_SIZE);
        const maxTileX = Math.floor(Math.max(p1.x, p2.x) / TILE_SIZE);
        const minTileZ = Math.floor(Math.min(p1.z, p2.z) / TILE_SIZE);
        const maxTileZ = Math.floor(Math.max(p1.z, p2.z) / TILE_SIZE);

        for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
          for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ++) {
            const tileKey = `${tileX}_${tileZ}`;
            const tileMinX = tileX * TILE_SIZE;
            const tileMaxX = (tileX + 1) * TILE_SIZE;
            const tileMinZ = tileZ * TILE_SIZE;
            const tileMaxZ = (tileZ + 1) * TILE_SIZE;

            const clipped = this.clipSegmentToTile(
              p1.x,
              p1.z,
              p2.x,
              p2.z,
              tileMinX,
              tileMaxX,
              tileMinZ,
              tileMaxZ,
            );
            if (clipped) {
              const segment: RoadTileSegment = {
                start: { x: clipped.x1 - tileMinX, z: clipped.z1 - tileMinZ },
                end: { x: clipped.x2 - tileMinX, z: clipped.z2 - tileMinZ },
                width: road.width,
                roadId: road.id,
              };
              if (!this.tileRoadCache.has(tileKey))
                this.tileRoadCache.set(tileKey, []);
              this.tileRoadCache.get(tileKey)!.push(segment);
            }
          }
        }
      }
    }
  }

  /**
   * Build tile cache asynchronously with yielding to prevent main thread blocking.
   * Processes roads in batches, yielding between batches.
   */
  private async buildTileCacheAsync(): Promise<void> {
    this.tileRoadCache.clear();
    const ROAD_BATCH_SIZE = 5; // Process 5 roads per batch

    for (
      let roadIdx = 0;
      roadIdx < this.roads.length;
      roadIdx += ROAD_BATCH_SIZE
    ) {
      const batchEnd = Math.min(roadIdx + ROAD_BATCH_SIZE, this.roads.length);

      for (let r = roadIdx; r < batchEnd; r++) {
        const road = this.roads[r];

        for (let i = 0; i < road.path.length - 1; i++) {
          const p1 = road.path[i];
          const p2 = road.path[i + 1];

          const minTileX = Math.floor(Math.min(p1.x, p2.x) / TILE_SIZE);
          const maxTileX = Math.floor(Math.max(p1.x, p2.x) / TILE_SIZE);
          const minTileZ = Math.floor(Math.min(p1.z, p2.z) / TILE_SIZE);
          const maxTileZ = Math.floor(Math.max(p1.z, p2.z) / TILE_SIZE);

          for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
            for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ++) {
              const tileKey = `${tileX}_${tileZ}`;
              const tileMinX = tileX * TILE_SIZE;
              const tileMaxX = (tileX + 1) * TILE_SIZE;
              const tileMinZ = tileZ * TILE_SIZE;
              const tileMaxZ = (tileZ + 1) * TILE_SIZE;

              const clipped = this.clipSegmentToTile(
                p1.x,
                p1.z,
                p2.x,
                p2.z,
                tileMinX,
                tileMaxX,
                tileMinZ,
                tileMaxZ,
              );
              if (clipped) {
                const segment: RoadTileSegment = {
                  start: { x: clipped.x1 - tileMinX, z: clipped.z1 - tileMinZ },
                  end: { x: clipped.x2 - tileMinX, z: clipped.z2 - tileMinZ },
                  width: road.width,
                  roadId: road.id,
                };
                if (!this.tileRoadCache.has(tileKey))
                  this.tileRoadCache.set(tileKey, []);
                this.tileRoadCache.get(tileKey)!.push(segment);
              }
            }
          }
        }
      }

      // Yield to main thread between batches
      if (batchEnd < this.roads.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  /** Cohen-Sutherland line clipping */
  private clipSegmentToTile(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
  ): { x1: number; z1: number; x2: number; z2: number } | null {
    const INSIDE = 0,
      LEFT = 1,
      RIGHT = 2,
      BOTTOM = 4,
      TOP = 8;

    const computeCode = (x: number, z: number): number => {
      let code = INSIDE;
      if (x < minX) code |= LEFT;
      else if (x > maxX) code |= RIGHT;
      if (z < minZ) code |= BOTTOM;
      else if (z > maxZ) code |= TOP;
      return code;
    };

    let code1 = computeCode(x1, z1);
    let code2 = computeCode(x2, z2);

    while (true) {
      if ((code1 | code2) === 0) return { x1, z1, x2, z2 };
      if ((code1 & code2) !== 0) return null;

      const codeOut = code1 !== 0 ? code1 : code2;
      let x: number, z: number;

      if (codeOut & TOP) {
        x = x1 + ((x2 - x1) * (maxZ - z1)) / (z2 - z1);
        z = maxZ;
      } else if (codeOut & BOTTOM) {
        x = x1 + ((x2 - x1) * (minZ - z1)) / (z2 - z1);
        z = minZ;
      } else if (codeOut & RIGHT) {
        z = z1 + ((z2 - z1) * (maxX - x1)) / (x2 - x1);
        x = maxX;
      } else {
        z = z1 + ((z2 - z1) * (minX - x1)) / (x2 - x1);
        x = minX;
      }

      if (codeOut === code1) {
        x1 = x;
        z1 = z;
        code1 = computeCode(x1, z1);
      } else {
        x2 = x;
        z2 = z;
        code2 = computeCode(x2, z2);
      }
    }
  }

  getRoadSegmentsForTile(tileX: number, tileZ: number): RoadTileSegment[] {
    return this.tileRoadCache.get(`${tileX}_${tileZ}`) || [];
  }

  getRoads(): ProceduralRoad[] {
    return this.roads;
  }

  getRoadById(id: string): ProceduralRoad | undefined {
    return this.roads.find((r) => r.id === id);
  }

  /**
   * Get distance to nearest road segment.
   *
   * OPTIMIZATION: Uses tile-based spatial cache to avoid checking all road segments.
   * Only checks segments in the current tile and adjacent tiles (9 tiles total).
   * Falls back to full search if no cached segments found nearby.
   */
  getDistanceToNearestRoad(x: number, z: number): number {
    // Get tile coordinates (assuming 100-unit tiles like TerrainSystem)
    const tileSize = 100;
    const tileX = Math.floor(x / tileSize);
    const tileZ = Math.floor(z / tileSize);

    // Check current tile and 8 adjacent tiles (3x3 grid)
    let minDistance = Infinity;
    let foundSegments = false;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const segments = this.tileRoadCache.get(`${tileX + dx}_${tileZ + dz}`);
        if (!segments) continue;

        foundSegments = true;
        for (const segment of segments) {
          // RoadTileSegment uses local tile coordinates, convert to world
          const worldStartX = (tileX + dx) * tileSize + segment.start.x;
          const worldStartZ = (tileZ + dz) * tileSize + segment.start.z;
          const worldEndX = (tileX + dx) * tileSize + segment.end.x;
          const worldEndZ = (tileZ + dz) * tileSize + segment.end.z;

          minDistance = Math.min(
            minDistance,
            this.distanceToSegment(
              x,
              z,
              worldStartX,
              worldStartZ,
              worldEndX,
              worldEndZ,
            ),
          );
        }
      }
    }

    // If we found segments in nearby tiles, use that result
    if (foundSegments) {
      return minDistance;
    }

    // Fallback: full search if no cached segments (roads not yet generated for this area)
    for (const road of this.roads) {
      for (let i = 0; i < road.path.length - 1; i++) {
        const p1 = road.path[i];
        const p2 = road.path[i + 1];
        minDistance = Math.min(
          minDistance,
          this.distanceToSegment(x, z, p1.x, p1.z, p2.x, p2.z),
        );
      }
    }
    return minDistance;
  }

  isOnRoad(x: number, z: number): boolean {
    return this.getDistanceToNearestRoad(x, z) <= this.config.roadWidth / 2;
  }

  private distanceToSegment(
    px: number,
    pz: number,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
  ): number {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lengthSq = dx * dx + dz * dz;
    if (lengthSq === 0) return dist2D(px, pz, x1, z1);
    const t = Math.max(
      0,
      Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lengthSq),
    );
    return dist2D(px, pz, x1 + t * dx, z1 + t * dz);
  }

  getRoadNetwork(): RoadNetwork | null {
    if (!this.townSystem) return null;
    return {
      towns: this.townSystem.getTowns(),
      roads: this.roads,
      seed: this.seed,
      generatedAt: Date.now(),
    };
  }

  destroy(): void {
    this.roads = [];
    this.tileRoadCache.clear();
    super.destroy();
  }
}
