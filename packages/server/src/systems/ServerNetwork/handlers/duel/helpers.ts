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
// Entity Interfaces
// ============================================================================

/**
 * Player entity interface for duel handlers.
 * Defines the shape of player entities as accessed by this module.
 */
interface DuelPlayerEntity {
  id: string;
  position?: { x: number; y: number; z: number };
  name?: string;
  characterName?: string;
  combatLevel?: number;
  data?: {
    name?: string;
    combatLevel?: number;
  };
  combat?: {
    combatLevel?: number;
  };
}

/**
 * Type guard to check if an entity has player-like properties
 */
function isDuelPlayerEntity(entity: unknown): entity is DuelPlayerEntity {
  return (
    typeof entity === "object" &&
    entity !== null &&
    "id" in entity &&
    typeof (entity as DuelPlayerEntity).id === "string"
  );
}

/**
 * Server network interface for socket lookups.
 * Encapsulates the network system shape to reduce Law of Demeter violations.
 */
interface ServerNetworkInterface {
  broadcastManager?: {
    getPlayerSocket: (id: string) => ServerSocket | undefined;
  };
  sockets?: Map<string, ServerSocket>;
}

/**
 * Type guard for server network
 */
function isServerNetwork(system: unknown): system is ServerNetworkInterface {
  return typeof system === "object" && system !== null;
}

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
  if (!player || !isDuelPlayerEntity(player)) return "Unknown";

  return player.name || player.data?.name || player.characterName || "Unknown";
}

/**
 * Get player combat level from world
 */
export function getPlayerCombatLevel(world: World, playerId: string): number {
  const player = world.entities.players?.get(playerId);
  if (!player || !isDuelPlayerEntity(player)) return 3;

  return (
    player.combatLevel ||
    player.data?.combatLevel ||
    player.combat?.combatLevel ||
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
  const serverNetwork = world.getSystem("network");
  if (!serverNetwork || !isServerNetwork(serverNetwork)) return undefined;

  // Prefer broadcastManager.getPlayerSocket for direct lookup
  if (serverNetwork.broadcastManager?.getPlayerSocket) {
    return serverNetwork.broadcastManager.getPlayerSocket(playerId);
  }

  // Fallback to iterating sockets map
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
