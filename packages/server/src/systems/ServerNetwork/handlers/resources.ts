/**
 * Resource Handler
 *
 * Handles resource gathering events from clients
 *
 * SECURITY: Always uses server-authoritative player position.
 * Client-provided position is ignored to prevent position spoofing exploits.
 *
 * SERVER-AUTHORITATIVE FLOW (like combat):
 * 1. Client sends resourceInteract with just resourceId
 * 2. Server looks up resource's TRUE position
 * 3. Server calculates correct cardinal tile
 * 4. Server paths player to that tile
 * 5. Server starts gathering when player arrives
 */

import type { ServerSocket } from "../../../shared/types";
import {
  EventType,
  World,
  worldToTile,
  tileToWorld,
  findBestCardinalInteractionTile,
  isCardinallyAdjacentToResource,
  FOOTPRINT_SIZES,
  type ResourceFootprint,
} from "@hyperscape/shared";

/**
 * SERVER-AUTHORITATIVE: Handle resource interaction request
 * Client just sends resourceId - server calculates where to walk
 */
export function handleResourceInteract(
  socket: ServerSocket,
  data: unknown,
  world: World,
  queueMovement: (
    socket: ServerSocket,
    data: { target: number[]; runMode?: boolean },
  ) => void,
  getIsRunning: (playerId: string) => boolean,
): void {
  const playerEntity = socket.player;
  if (!playerEntity) {
    console.warn("[Resources] handleResourceInteract: no player entity");
    return;
  }

  const payload = data as { resourceId?: string };
  if (!payload.resourceId) {
    console.warn("[Resources] handleResourceInteract: no resourceId");
    return;
  }

  // Get resource system to look up resource position
  const resourceSystem = world.getSystem("resource") as {
    getResource?: (id: string) => {
      id: string;
      position: { x: number; y: number; z: number };
      footprint?: ResourceFootprint;
      isAvailable?: boolean;
    } | null;
  } | null;

  if (!resourceSystem?.getResource) {
    console.warn("[Resources] handleResourceInteract: no resource system");
    return;
  }

  // Look up resource using SERVER's authoritative data
  const resource = resourceSystem.getResource(payload.resourceId);
  if (!resource) {
    console.warn(
      `[Resources] handleResourceInteract: resource ${payload.resourceId} not found`,
    );
    return;
  }

  if (!resource.isAvailable) {
    // Resource is depleted - just ignore silently
    return;
  }

  // Get player's current tile (server-authoritative position)
  const playerTile = worldToTile(
    playerEntity.position.x,
    playerEntity.position.z,
  );

  // Get resource's anchor tile and footprint (SERVER's authoritative data!)
  const footprint: ResourceFootprint = resource.footprint || "standard";
  const size = FOOTPRINT_SIZES[footprint];
  const resourceAnchorTile = worldToTile(
    resource.position.x,
    resource.position.z,
  );

  console.log(
    `[Resources] SERVER-AUTHORITATIVE: Player ${playerEntity.id} wants to interact with resource ${payload.resourceId}`,
  );
  console.log(
    `[Resources]   Resource at anchor (${resourceAnchorTile.x}, ${resourceAnchorTile.z}), footprint ${size.x}x${size.z}`,
  );
  console.log(
    `[Resources]   Player at tile (${playerTile.x}, ${playerTile.z})`,
  );

  // Check if player is already on a cardinal tile
  const isOnCardinal = isCardinallyAdjacentToResource(
    playerTile,
    resourceAnchorTile,
    size.x,
    size.z,
  );

  if (isOnCardinal) {
    // Already in position - start gathering immediately
    console.log(
      `[Resources]   Player already on cardinal tile - starting gather`,
    );
    world.emit(EventType.RESOURCE_GATHER, {
      playerId: playerEntity.id,
      resourceId: payload.resourceId,
      playerPosition: {
        x: playerEntity.position.x,
        y: playerEntity.position.y,
        z: playerEntity.position.z,
      },
    });
    return;
  }

  // Calculate the best cardinal tile (SERVER calculates, not client!)
  const cardinalTile = findBestCardinalInteractionTile(
    playerTile,
    resourceAnchorTile,
    size.x,
    size.z,
    () => true, // TODO: Add walkability check from terrain system
  );

  if (!cardinalTile) {
    console.warn(`[Resources]   No valid cardinal tile found`);
    return;
  }

  // Convert cardinal tile to world position
  const cardinalWorldPos = tileToWorld(cardinalTile);

  console.log(
    `[Resources]   Calculated cardinal tile: (${cardinalTile.x}, ${cardinalTile.z}) → world (${cardinalWorldPos.x.toFixed(1)}, ${cardinalWorldPos.z.toFixed(1)})`,
  );

  // Get player's current run mode setting
  const runMode = getIsRunning(playerEntity.id);

  console.log(
    `[Resources]   Movement mode: ${runMode ? "running" : "walking"}`,
  );

  // Queue movement to the cardinal tile (server-authoritative!)
  queueMovement(socket, {
    target: [cardinalWorldPos.x, cardinalWorldPos.y, cardinalWorldPos.z],
    runMode,
  });

  // Store pending gather to execute when player arrives
  // The ResourceSystem will start gathering when it receives RESOURCE_GATHER
  // and validates that player is on cardinal tile
  const pendingGatherKey = `pending_gather:${playerEntity.id}`;
  const existingTimeout = (
    world as { _pendingGathers?: Map<string, NodeJS.Timeout> }
  )._pendingGathers?.get(pendingGatherKey);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Initialize pending gathers map if needed
  if (
    !(world as { _pendingGathers?: Map<string, NodeJS.Timeout> })
      ._pendingGathers
  ) {
    (
      world as { _pendingGathers?: Map<string, NodeJS.Timeout> }
    )._pendingGathers = new Map();
  }

  // Check periodically if player has arrived at cardinal tile
  const checkInterval = setInterval(() => {
    const currentPlayerTile = worldToTile(
      playerEntity.position.x,
      playerEntity.position.z,
    );
    const isNowOnCardinal = isCardinallyAdjacentToResource(
      currentPlayerTile,
      resourceAnchorTile,
      size.x,
      size.z,
    );

    if (isNowOnCardinal) {
      console.log(
        `[Resources]   Player arrived at cardinal tile - starting gather`,
      );
      clearInterval(checkInterval);
      (
        world as { _pendingGathers?: Map<string, NodeJS.Timeout> }
      )._pendingGathers?.delete(pendingGatherKey);

      // Now emit the gather event
      world.emit(EventType.RESOURCE_GATHER, {
        playerId: playerEntity.id,
        resourceId: payload.resourceId,
        playerPosition: {
          x: playerEntity.position.x,
          y: playerEntity.position.y,
          z: playerEntity.position.z,
        },
      });
    }
  }, 100); // Check every 100ms

  // Timeout after 10 seconds if player never arrives
  const timeoutId = setTimeout(() => {
    clearInterval(checkInterval);
    (
      world as { _pendingGathers?: Map<string, NodeJS.Timeout> }
    )._pendingGathers?.delete(pendingGatherKey);
    console.log(
      `[Resources]   Pending gather timed out for ${playerEntity.id}`,
    );
  }, 10000);

  (
    world as { _pendingGathers?: Map<string, NodeJS.Timeout> }
  )._pendingGathers?.set(pendingGatherKey, timeoutId);
}

export function handleResourceGather(
  socket: ServerSocket,
  data: unknown,
  world: World,
): void {
  const playerEntity = socket.player;
  if (!playerEntity) {
    console.warn(
      "[Resources] handleResourceGather: no player entity for socket",
    );
    return;
  }

  const payload = data as {
    resourceId?: string;
    // Note: playerPosition from client is intentionally ignored for security
  };
  if (!payload.resourceId) {
    console.warn("[Resources] handleResourceGather: no resourceId in payload");
    return;
  }

  // SECURITY: Always use server-authoritative position, never trust client
  const playerPosition = {
    x: playerEntity.position.x,
    y: playerEntity.position.y,
    z: playerEntity.position.z,
  };

  // Forward to ResourceSystem - emit RESOURCE_GATHER which ResourceSystem subscribes to
  world.emit(EventType.RESOURCE_GATHER, {
    playerId: playerEntity.id,
    resourceId: payload.resourceId,
    playerPosition: playerPosition,
  });
}
