/**
 * Duel Handler Helpers
 *
 * Shared utilities for duel packet handlers.
 */

import type { World } from "@hyperscape/shared";
import type { ServerSocket } from "../../../../shared/types";
import type { DuelSystem } from "../../../DuelSystem";
import { RateLimitService } from "../../services";

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
 * Get player ID from socket
 */
export function getPlayerId(socket: ServerSocket): string | null {
  return (socket.data?.playerId as string) || null;
}

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
  const serverNetwork = world.getSystem("server-network") as
    | { getSocketByPlayerId?: (id: string) => ServerSocket | undefined }
    | undefined;
  return serverNetwork?.getSocketByPlayerId?.(playerId);
}

// ============================================================================
// Response Utilities
// ============================================================================

/**
 * Send data to a socket
 */
export function sendToSocket(
  socket: ServerSocket,
  event: string,
  data: unknown,
): void {
  socket.emit(event, data);
}

/**
 * Send duel error to socket
 */
export function sendDuelError(
  socket: ServerSocket,
  message: string,
  code: string,
): void {
  socket.emit("duelError", { message, code });
}

/**
 * Send success toast to socket
 */
export function sendSuccessToast(socket: ServerSocket, message: string): void {
  socket.emit("toast", { type: "success", message });
}

// ============================================================================
// Zone Utilities
// ============================================================================

/**
 * Check if player is in Duel Arena zone
 */
export function isInDuelArenaZone(world: World, playerId: string): boolean {
  const player = world.entities.players?.get(playerId);
  if (!player?.position) return false;

  const zoneSystem = world.getSystem("zone-detection") as
    | { getZoneProperties?: (pos: { x: number; z: number }) => { id?: string } }
    | undefined;

  if (!zoneSystem?.getZoneProperties) return false;

  const zoneProps = zoneSystem.getZoneProperties({
    x: player.position.x,
    z: player.position.z,
  });

  return zoneProps.id === "duel_arena";
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
