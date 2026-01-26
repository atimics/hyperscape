/**
 * Duel Handler Helpers
 *
 * Shared utilities for duel packet handlers.
 * IMPORTANT: This module imports common utilities from ../common to ensure
 * consistent socket handling patterns across all handlers.
 */

import { type World, ALL_WORLD_AREAS } from "@hyperscape/shared";
import type { ServerSocket } from "../../../../shared/types";
import type { DuelSystem } from "../../../DuelSystem";
import { RateLimitService } from "../../services";
import {
  sendToSocket,
  getPlayerId,
  sendErrorToast,
  sendSuccessToast as sendSuccessToastCommon,
} from "../common";

// ============================================================================
// Rate Limiter
// ============================================================================

/** Single rate limiter instance shared across all duel modules */
export const rateLimiter = new RateLimitService();

// ============================================================================
// System Getters
// ============================================================================

/**
 * Get DuelSystem from world
 */
export function getDuelSystem(world: World): DuelSystem | undefined {
  const worldWithDuel = world as { duelSystem?: DuelSystem };
  return worldWithDuel.duelSystem;
}

// ============================================================================
// Player Utilities
// ============================================================================

/**
 * Get player name from world
 */
export function getPlayerName(world: World, playerId: string): string {
  const player = world.entities.players?.get(playerId);
  if (!player) return "Unknown";

  // Try various name properties
  const entity = player as unknown as {
    name?: string;
    data?: { name?: string };
    characterName?: string;
  };

  return entity.name || entity.data?.name || entity.characterName || "Unknown";
}

/**
 * Get player combat level from world
 */
export function getPlayerCombatLevel(world: World, playerId: string): number {
  const player = world.entities.players?.get(playerId);
  if (!player) return 3;

  const entity = player as unknown as {
    combatLevel?: number;
    data?: { combatLevel?: number };
    combat?: { combatLevel?: number };
  };

  return (
    entity.combatLevel ||
    entity.data?.combatLevel ||
    entity.combat?.combatLevel ||
    3
  );
}

/**
 * Check if player is online
 */
export function isPlayerOnline(world: World, playerId: string): boolean {
  return world.entities.players?.has(playerId) ?? false;
}

/**
 * Get socket by player ID
 */
export function getSocketByPlayerId(
  world: World,
  playerId: string,
): ServerSocket | undefined {
  // Try getting from network system (same pattern as trade helpers)
  const serverNetwork = world.getSystem("network") as
    | {
        broadcastManager?: {
          getPlayerSocket: (id: string) => ServerSocket | undefined;
        };
        sockets?: Map<string, ServerSocket>;
      }
    | undefined;

  if (!serverNetwork) return undefined;

  if (serverNetwork.broadcastManager?.getPlayerSocket) {
    return serverNetwork.broadcastManager.getPlayerSocket(playerId);
  }

  if (serverNetwork.sockets) {
    for (const [, socket] of serverNetwork.sockets) {
      if (getPlayerId(socket) === playerId) {
        return socket;
      }
    }
  }

  return undefined;
}

// ============================================================================
// Response Utilities
// ============================================================================

/**
 * Send duel error to socket
 */
export function sendDuelError(
  socket: ServerSocket,
  message: string,
  code: string,
): void {
  sendToSocket(socket, "duelError", { message, code });
}

/**
 * Send success toast to socket
 */
export function sendSuccessToast(socket: ServerSocket, message: string): void {
  sendToSocket(socket, "showToast", { type: "success", message });
}

// Re-export common utilities for convenience
export { sendToSocket, getPlayerId } from "../common";

// ============================================================================
// Zone Utilities
// ============================================================================

/**
 * Check if player is in Duel Arena zone
 * Uses ALL_WORLD_AREAS directly since zone detection system may not be available on server
 */
export function isInDuelArenaZone(world: World, playerId: string): boolean {
  const player = world.entities.players?.get(playerId);
  if (!player?.position) {
    console.log("[DuelZone] No player or position for:", playerId);
    return false;
  }

  const { x, z } = player.position;

  // Get duel_arena bounds from ALL_WORLD_AREAS
  const duelArena = ALL_WORLD_AREAS["duel_arena"];
  if (!duelArena?.bounds) {
    console.log("[DuelZone] duel_arena not found in ALL_WORLD_AREAS");
    return false;
  }

  const { minX, maxX, minZ, maxZ } = duelArena.bounds;
  const inBounds = x >= minX && x <= maxX && z >= minZ && z <= maxZ;

  console.log(
    "[DuelZone] Player",
    playerId,
    "at position",
    { x, z },
    "duel_arena bounds:",
    { minX, maxX, minZ, maxZ },
    "inBounds:",
    inBounds,
  );

  return inBounds;
}

/**
 * Check if two players are within challenge range (15 tiles)
 */
export function arePlayersInChallengeRange(
  world: World,
  player1Id: string,
  player2Id: string,
): boolean {
  const player1 = world.entities.players?.get(player1Id);
  const player2 = world.entities.players?.get(player2Id);

  if (!player1?.position || !player2?.position) return false;

  const dx = Math.abs(player1.position.x - player2.position.x);
  const dz = Math.abs(player1.position.z - player2.position.z);
  const distance = Math.max(dx, dz); // Chebyshev distance

  return distance <= 15;
}
