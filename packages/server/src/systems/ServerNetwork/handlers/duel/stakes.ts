/**
 * Duel Stakes Handlers
 *
 * Handles duel stakes negotiation:
 * - handleDuelAddStake: Add an item from inventory to stakes
 * - handleDuelRemoveStake: Remove a staked item
 * - handleDuelAcceptStakes: Accept current stakes configuration
 */

import { type World, getItem } from "@hyperscape/shared";
import type { ServerSocket } from "../../../../shared/types";
import {
  getDuelSystem,
  sendDuelError,
  sendToSocket,
  getPlayerId,
  getSocketByPlayerId,
} from "./helpers";

// ============================================================================
// Add Stake Handler
// ============================================================================

/**
 * Handle adding an item to stakes
 */
export function handleDuelAddStake(
  socket: ServerSocket,
  data: { duelId: string; inventorySlot: number; quantity: number },
  world: World,
): void {
  const playerId = getPlayerId(socket);
  if (!playerId) {
    sendDuelError(socket, "Not authenticated", "NOT_AUTHENTICATED");
    return;
  }

  const duelSystem = getDuelSystem(world);
  if (!duelSystem) {
    sendDuelError(socket, "Duel system unavailable", "SYSTEM_ERROR");
    return;
  }

  const { duelId, inventorySlot, quantity } = data;

  // Get player's inventory to validate the item
  const player = world.entities.players?.get(playerId);
  if (!player) {
    sendDuelError(socket, "Player not found", "PLAYER_NOT_FOUND");
    return;
  }

  // Get inventory system to validate the item
  const inventorySystem = world.getSystem("inventory") as {
    getPlayerInventory?: (
      playerId: string,
    ) => Array<{ slot: number; itemId: string; quantity: number }> | null;
  } | null;

  if (!inventorySystem?.getPlayerInventory) {
    sendDuelError(socket, "Inventory system unavailable", "SYSTEM_ERROR");
    return;
  }

  const inventory = inventorySystem.getPlayerInventory(playerId);
  if (!inventory) {
    sendDuelError(socket, "Could not get inventory", "SYSTEM_ERROR");
    return;
  }

  // Find the item in inventory
  const inventoryItem = inventory.find((item) => item.slot === inventorySlot);
  if (!inventoryItem) {
    sendDuelError(socket, "Item not found in inventory", "ITEM_NOT_FOUND");
    return;
  }

  // Validate quantity
  if (quantity <= 0 || quantity > inventoryItem.quantity) {
    sendDuelError(socket, "Invalid quantity", "INVALID_QUANTITY");
    return;
  }

  // Check if item is tradeable
  const itemData = getItem(inventoryItem.itemId);
  if (itemData?.tradeable === false) {
    sendDuelError(socket, "This item cannot be staked", "ITEM_NOT_TRADEABLE");
    return;
  }

  // Calculate value
  const value = (itemData?.value || 0) * quantity;

  // Add to stakes
  const result = duelSystem.addStake(
    duelId,
    playerId,
    inventorySlot,
    inventoryItem.itemId,
    quantity,
    value,
  );

  if (!result.success) {
    sendDuelError(socket, result.error!, result.errorCode || "UNKNOWN");
    return;
  }

  // Get session to send updates to both players
  const session = duelSystem.getDuelSession(duelId);
  if (!session) return;

  // Notify both players of the stake change
  const updatePayload = {
    duelId,
    challengerStakes: session.challengerStakes,
    targetStakes: session.targetStakes,
    challengerAccepted: session.challengerAccepted,
    targetAccepted: session.targetAccepted,
    modifiedBy: playerId,
  };

  sendToSocket(socket, "duelStakesUpdated", updatePayload);

  const opponentId =
    playerId === session.challengerId ? session.targetId : session.challengerId;
  const opponentSocket = getSocketByPlayerId(world, opponentId);
  if (opponentSocket) {
    sendToSocket(opponentSocket, "duelStakesUpdated", updatePayload);
  }
}

// ============================================================================
// Remove Stake Handler
// ============================================================================

/**
 * Handle removing a staked item
 */
export function handleDuelRemoveStake(
  socket: ServerSocket,
  data: { duelId: string; stakeIndex: number },
  world: World,
): void {
  const playerId = getPlayerId(socket);
  if (!playerId) {
    sendDuelError(socket, "Not authenticated", "NOT_AUTHENTICATED");
    return;
  }

  const duelSystem = getDuelSystem(world);
  if (!duelSystem) {
    sendDuelError(socket, "Duel system unavailable", "SYSTEM_ERROR");
    return;
  }

  const { duelId, stakeIndex } = data;

  const result = duelSystem.removeStake(duelId, playerId, stakeIndex);

  if (!result.success) {
    sendDuelError(socket, result.error!, result.errorCode || "UNKNOWN");
    return;
  }

  // Get session to send updates to both players
  const session = duelSystem.getDuelSession(duelId);
  if (!session) return;

  // Notify both players of the stake change
  const updatePayload = {
    duelId,
    challengerStakes: session.challengerStakes,
    targetStakes: session.targetStakes,
    challengerAccepted: session.challengerAccepted,
    targetAccepted: session.targetAccepted,
    modifiedBy: playerId,
  };

  sendToSocket(socket, "duelStakesUpdated", updatePayload);

  const opponentId =
    playerId === session.challengerId ? session.targetId : session.challengerId;
  const opponentSocket = getSocketByPlayerId(world, opponentId);
  if (opponentSocket) {
    sendToSocket(opponentSocket, "duelStakesUpdated", updatePayload);
  }
}

// ============================================================================
// Accept Stakes Handler
// ============================================================================

/**
 * Handle accepting current stakes configuration
 */
export function handleDuelAcceptStakes(
  socket: ServerSocket,
  data: { duelId: string },
  world: World,
): void {
  const playerId = getPlayerId(socket);
  if (!playerId) {
    sendDuelError(socket, "Not authenticated", "NOT_AUTHENTICATED");
    return;
  }

  const duelSystem = getDuelSystem(world);
  if (!duelSystem) {
    sendDuelError(socket, "Duel system unavailable", "SYSTEM_ERROR");
    return;
  }

  const { duelId } = data;

  const result = duelSystem.acceptStakes(duelId, playerId);

  if (!result.success) {
    sendDuelError(socket, result.error!, result.errorCode || "UNKNOWN");
    return;
  }

  // Get session to send updates to both players
  const session = duelSystem.getDuelSession(duelId);
  if (!session) return;

  // Check if both players accepted and we moved to CONFIRMING
  const movedToConfirm = session.state === "CONFIRMING";

  // Notify both players
  const updatePayload = {
    duelId,
    challengerAccepted: session.challengerAccepted,
    targetAccepted: session.targetAccepted,
    state: session.state,
    movedToConfirm,
  };

  sendToSocket(socket, "duelAcceptanceUpdated", updatePayload);

  const opponentId =
    playerId === session.challengerId ? session.targetId : session.challengerId;
  const opponentSocket = getSocketByPlayerId(world, opponentId);
  if (opponentSocket) {
    sendToSocket(opponentSocket, "duelAcceptanceUpdated", updatePayload);
  }

  // If moved to confirm screen, send state change notification
  if (movedToConfirm) {
    const statePayload = {
      duelId,
      state: "CONFIRMING",
      rules: session.rules,
      equipmentRestrictions: session.equipmentRestrictions,
      challengerStakes: session.challengerStakes,
      targetStakes: session.targetStakes,
    };

    sendToSocket(socket, "duelStateChanged", statePayload);
    if (opponentSocket) {
      sendToSocket(opponentSocket, "duelStateChanged", statePayload);
    }
  }
}
