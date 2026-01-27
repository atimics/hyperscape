// Math utilities for movement calculations
import {
  THREE,
  BFSPathfinder,
  worldToTile,
  tileToWorld,
} from "@hyperscape/shared";
import type {
  World,
  Player,
  Vector3,
  TileCoord,
  WalkabilityChecker,
} from "@hyperscape/shared";
import { Entity } from "@hyperscape/shared";
import { EventEmitter } from "events";

// Pre-allocated temp objects for hot path optimizations (avoid GC pressure)
// Each operation gets its own temp vector to allow safe chaining without overwrites
const _subtractResult = new THREE.Vector3();
const _normalizeResult = new THREE.Vector3();
const _multiplyResult = new THREE.Vector3();
const _addResult = new THREE.Vector3();
const _lerpResult = new THREE.Vector3();
const _zeroVelocity = { x: 0, y: 0, z: 0 } as const;

const MathUtils = {
  distance2D: (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2),
  subtract: (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ) => _subtractResult.set(a.x - b.x, a.y - b.y, a.z - b.z),
  normalize: (v: { x: number; y: number; z: number }) => {
    _normalizeResult.set(v.x, v.y, v.z);
    const length = _normalizeResult.length();
    return length > 0
      ? _normalizeResult.divideScalar(length)
      : _normalizeResult.set(0, 0, 0);
  },
  multiply: (v: { x: number; y: number; z: number }, scalar: number) =>
    _multiplyResult.set(v.x * scalar, v.y * scalar, v.z * scalar),
  add: (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ) => _addResult.set(a.x + b.x, a.y + b.y, a.z + b.z),
  lerp: (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    t: number,
  ) =>
    _lerpResult.set(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t,
    ),
};

interface MovablePlayer extends Entity {
  id: string;
  node: THREE.Object3D;
  isMoving?: boolean;
  targetPosition?: Vector3;
  movementPath?: Vector3[];
  velocity: Vector3;
  speed?: number;
}

export class PlayerMovementSystem extends EventEmitter {
  private world: World;
  private movingPlayers: Map<string, { target: Vector3; path?: Vector3[] }> =
    new Map();
  private lastUpdateTime: number = Date.now();
  private updateInterval: number = 50; // Network update interval in ms
  private lastNetworkUpdate: number = Date.now();

  /** Shared BFSPathfinder instance - same algorithm used by server for OSRS-accurate movement */
  private pathfinder: BFSPathfinder = new BFSPathfinder();

  constructor(world: World) {
    super();
    this.world = world;
  }

  async moveTo(playerId: string, target: Vector3): Promise<void> {
    const player =
      this.world.entities.players?.get(playerId) ||
      (playerId === this.world.entities.player?.id
        ? this.world.entities.player
        : null);
    if (!player) return;

    // Find path to target
    const path = this.findPath(player.node.position!, target);
    if (!path) {
      throw new Error("No path found to target");
    }

    // Start movement
    this.startMovement(playerId, target, path);

    // Wait for movement to complete
    return new Promise((resolve) => {
      const checkComplete = () => {
        if (!this.movingPlayers.has(playerId)) {
          resolve();
        } else {
          setTimeout(checkComplete, 50);
        }
      };
      checkComplete();
    });
  }

  startMovement(playerId: string, target: Vector3, path?: Vector3[]): void {
    const player =
      this.world.entities.players?.get(playerId) ||
      (playerId === this.world.entities.player?.id
        ? this.world.entities.player
        : null);
    if (!player) return;

    // Calculate path if not provided
    const finalPath = path ||
      this.findPath(player.node.position!, target) || [target];

    // Set player moving (simulate with custom property)
    const movablePlayer = player as MovablePlayer;
    movablePlayer.isMoving = true;
    movablePlayer.targetPosition = target;
    movablePlayer.movementPath = finalPath;
    this.movingPlayers.set(playerId, { target, path: finalPath });

    // Calculate initial velocity
    this.updatePlayerVelocity(movablePlayer, finalPath[0]);

    // Broadcast movement start via network
    if (this.world.network.send) {
      this.world.network.send("player:moved", {
        playerId,
        position: player.node.position,
        velocity: movablePlayer.velocity,
      });
    }
  }

  stopMovement(playerId: string): void {
    const player =
      this.world.entities.players?.get(playerId) ||
      (playerId === this.world.entities.player?.id
        ? this.world.entities.player
        : null);
    if (!player) return; // Stop player movement (simulate)
    const movablePlayer = player as MovablePlayer;
    movablePlayer.isMoving = false;
    // Reuse pre-allocated zero velocity reference (immutable, safe to share)
    movablePlayer.velocity = _zeroVelocity as Vector3;
    this.movingPlayers.delete(playerId);

    // Broadcast stop via network - use pre-allocated zero velocity
    if (this.world.network.send) {
      this.world.network.send("player:moved", {
        playerId,
        position: player.node.position,
        velocity: _zeroVelocity,
      });
    }
  }

  update(deltaTime: number): void {
    const now = Date.now();

    // Update all moving players
    for (const [playerId, movement] of this.movingPlayers) {
      const player =
        this.world.entities.players?.get(playerId) ||
        (playerId === this.world.entities.player?.id
          ? this.world.entities.player
          : null);
      if (!player) {
        this.movingPlayers.delete(playerId);
        continue;
      }

      // Update player position (simulate)
      this.updatePlayerPosition(player, deltaTime);

      // Check for collisions
      if (this.checkCollisions(player)) {
        // Handle collision - stop or slide
        this.handleCollision(player as MovablePlayer, movement);
      }

      // Check if reached target
      if (!(player as MovablePlayer).isMoving) {
        this.movingPlayers.delete(playerId);
      }
    }

    // Send network updates at intervals
    if (now - this.lastNetworkUpdate >= this.updateInterval) {
      this.sendNetworkUpdates();
      this.lastNetworkUpdate = now;
    }
  }

  /**
   * Find a path from start to end using the shared BFSPathfinder.
   *
   * Uses the same OSRS-accurate pathfinding algorithm as the server:
   * - Naive diagonal pathing first (walk diagonally toward target, then straight)
   * - Falls back to BFS if obstacles block the naive path
   *
   * @see packages/shared/src/systems/shared/movement/BFSPathfinder.ts
   */
  findPath(start: Vector3, end: Vector3): Vector3[] | null {
    // Convert world coordinates to tile coordinates
    const startTile = worldToTile(start.x, start.z);
    const endTile = worldToTile(end.x, end.z);

    // Create walkability checker that uses world collision
    const isWalkable: WalkabilityChecker = (
      tile: TileCoord,
      _fromTile?: TileCoord,
    ): boolean => {
      // Convert tile back to world position for collision check
      const worldPos = tileToWorld(tile);
      return !this.checkWorldCollision(worldPos as Vector3);
    };

    // Use shared BFSPathfinder (same as server uses for player movement)
    const tilePath = this.pathfinder.findPath(startTile, endTile, isWalkable);

    // No path found
    if (tilePath.length === 0) {
      return null;
    }

    // Convert tile path back to world coordinates
    const worldPath: Vector3[] = tilePath.map((tile) => {
      const worldPos = tileToWorld(tile);
      return {
        x: worldPos.x,
        y: start.y, // Preserve original Y height
        z: worldPos.z,
      } as Vector3;
    });

    return worldPath;
  }

  private updatePlayerVelocity(player: MovablePlayer, target: Vector3): void {
    if (!player.node.position) {
      return;
    }

    const direction = MathUtils.subtract(target, player.node.position);
    const normalized = MathUtils.normalize(direction);

    if (player.speed) {
      player.velocity = MathUtils.multiply(normalized, player.speed) as Vector3;
    }
  }

  private checkCollisions(player: Player): boolean {
    // Check ahead of player
    if (!player.node.position || !player.velocity) {
      return false;
    }

    const lookAhead = MathUtils.add(
      player.node.position,
      MathUtils.multiply(MathUtils.normalize(player.velocity), 0.5),
    ) as Vector3;

    return this.checkWorldCollision(lookAhead);
  }

  private handleCollision(
    player: MovablePlayer,
    _movement: { target: Vector3; path?: Vector3[] },
  ): void {
    // Try to slide along obstacle
    const slideVelocity = this.calculateSlideVelocity(player);

    if (slideVelocity) {
      player.velocity = slideVelocity;
    } else {
      // Can't slide, stop
      this.stopMovement(player.id);
    }
  }

  // Pre-allocated perpendicular vectors for slide velocity calculation
  private readonly _perpendicular1 = { x: 0, y: 0, z: 0 };
  private readonly _perpendicular2 = { x: 0, y: 0, z: 0 };
  // Pre-allocated array to avoid allocation in calculateSlideVelocity loop
  private readonly _perps: Array<{ x: number; y: number; z: number }> = [
    this._perpendicular1,
    this._perpendicular2,
  ];

  private calculateSlideVelocity(player: MovablePlayer): Vector3 | null {
    if (!player.velocity || !player.node.position || !player.speed) {
      return null;
    }

    // Try perpendicular directions - reuse pre-allocated objects
    const vel = player.velocity;
    this._perpendicular1.x = -(vel.z as number);
    this._perpendicular1.y = 0;
    this._perpendicular1.z = vel.x as number;

    this._perpendicular2.x = vel.z as number;
    this._perpendicular2.y = 0;
    this._perpendicular2.z = -(vel.x as number);

    // Test both directions - use pre-allocated array reference
    for (let i = 0; i < this._perps.length; i++) {
      const perp = this._perps[i];
      const testPos = MathUtils.add(
        player.node.position,
        MathUtils.multiply(MathUtils.normalize(perp), 0.5),
      ) as Vector3;

      if (!this.checkWorldCollision(testPos)) {
        return MathUtils.multiply(
          MathUtils.normalize(perp),
          player.speed * 0.7,
        ) as Vector3;
      }
    }

    return null;
  }

  // Pre-allocated network update payload to avoid allocation per update
  private readonly _networkUpdatePayload: {
    playerId: string;
    position: THREE.Vector3 | null;
    velocity: Vector3 | null;
  } = {
    playerId: "",
    position: null,
    velocity: null,
  };

  private sendNetworkUpdates(): void {
    // Send position updates for all moving players
    for (const [playerId, movement] of this.movingPlayers) {
      const player =
        this.world.entities.players?.get(playerId) ||
        (playerId === this.world.entities.player?.id
          ? this.world.entities.player
          : null);
      if (!player) continue;

      // Send via network - reuse pre-allocated payload object
      if (this.world.network.send) {
        this._networkUpdatePayload.playerId = playerId;
        this._networkUpdatePayload.position = player.node.position;
        this._networkUpdatePayload.velocity = (
          player as MovablePlayer
        ).velocity;
        this.world.network.send("player:moved", this._networkUpdatePayload);
      }
    }
  }

  // Helper methods to simulate missing World functionality
  private checkWorldCollision(position: Vector3): boolean {
    // Simulate basic collision detection
    // In a real implementation, this would check against world geometry
    return false;
  }

  private updatePlayerPosition(player: Player, deltaTime: number): void {
    // Simulate player position update based on velocity
    if (player.velocity && player.node.position) {
      player.node.position.x += player.velocity.x * deltaTime;
      player.node.position.y += player.velocity.y * deltaTime;
      player.node.position.z += player.velocity.z * deltaTime;
    }
  }
}
