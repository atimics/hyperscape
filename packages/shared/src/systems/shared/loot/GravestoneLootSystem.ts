/**
 * GravestoneLootSystem
 *
 * ECS system that handles all gravestone loot processing.
 * Extracted from HeadstoneEntity to follow ECS architecture:
 * entities are data containers, systems handle logic.
 *
 * Responsibilities:
 * - Processing CORPSE_LOOT_REQUEST (single item loot)
 * - Processing CORPSE_LOOT_ALL_REQUEST (loot all)
 * - Rate limiting loot requests
 * - Inventory space validation
 * - Loot result emission (network + events)
 * - Audit logging
 */

import { SystemBase } from "../infrastructure/SystemBase";
import type { World } from "../../../core/World";
import { EventType } from "../../../types/events";
import type { InventoryItem } from "../../../types/core/core";
import type { LootFailureReason } from "../../../types/death";
import { generateTransactionId } from "../../../utils/IdGenerator";
import { DeathState } from "../../../types/entities";

/** Interface for entities that can be looted (HeadstoneEntity) */
type LootableEntity = {
  id: string;
  canPlayerLoot: (playerId: string) => boolean;
  removeItem: (itemId: string, quantity: number) => boolean;
  getLootItems: () => InventoryItem[];
  hasLoot: () => boolean;
  getPosition: () => { x: number; y: number; z: number };
  getOwnerId: () => string;
};

/** Type for inventory system access */
type InventorySystemAccess = {
  getInventory?: (
    playerId: string,
  ) => { items: Array<{ itemId: string }> } | null;
};

/** Validated loot context returned by shared validation */
type LootContext = {
  entity: LootableEntity;
  ownerId: string;
};

export class GravestoneLootSystem extends SystemBase {
  private lootQueues = new Map<string, Promise<void>>();
  private lootRateLimiter = new Map<string, number>();
  private readonly LOOT_RATE_LIMIT_MS = 100;

  constructor(world: World) {
    super(world, {
      name: "gravestone-loot",
      dependencies: {
        required: [],
        optional: ["inventory"],
      },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {
    this.subscribe(
      EventType.CORPSE_LOOT_REQUEST,
      (data: {
        corpseId: string;
        playerId: string;
        itemId: string;
        quantity: number;
        slot?: number;
        transactionId?: string;
      }) =>
        this.validateAndQueueLoot(data, (d) =>
          this.processLootRequest(d as typeof data & { transactionId: string }),
        ),
    );

    this.subscribe(
      EventType.CORPSE_LOOT_ALL_REQUEST,
      (data: { corpseId: string; playerId: string; transactionId?: string }) =>
        this.validateAndQueueLoot(data, (d) =>
          this.processLootAllRequest(
            d as { corpseId: string; playerId: string; transactionId: string },
          ),
        ),
    );
  }

  // --- Shared Validation ---

  /**
   * Shared preamble for all loot requests:
   * server check, transaction ID, rate limiting, queue serialization
   */
  private validateAndQueueLoot(
    data: { corpseId: string; playerId: string; transactionId?: string },
    processor: (
      data: {
        corpseId: string;
        playerId: string;
        transactionId: string;
      } & Record<string, unknown>,
    ) => Promise<void>,
  ): void {
    if (!this.world.isServer) return;

    const transactionId = data.transactionId || generateTransactionId();

    if (this.isRateLimited(data.playerId)) {
      this.emitLootResult(
        data.playerId,
        transactionId,
        false,
        data.corpseId,
        "",
        "RATE_LIMITED",
      );
      return;
    }

    const enrichedData = { ...data, transactionId };
    const queue = this.lootQueues.get(data.corpseId) || Promise.resolve();
    const newQueue = queue
      .then(() => processor(enrichedData))
      .catch((error) => {
        console.error(`[GravestoneLootSystem] Loot operation failed:`, error);
        this.emitLootResult(
          data.playerId,
          transactionId,
          false,
          data.corpseId,
          "",
          "INVALID_REQUEST",
        );
      });
    this.lootQueues.set(data.corpseId, newQueue);
  }

  /**
   * Shared permission validation for all loot processors:
   * entity lookup, loot permission, death state check
   */
  private validateLootPermissions(
    corpseId: string,
    playerId: string,
    transactionId: string,
  ): LootContext | null {
    const entity = this.getLootableEntity(corpseId);
    if (!entity) return null;

    const ownerId = entity.getOwnerId();

    if (!entity.canPlayerLoot(playerId)) {
      this.emitLootResult(
        playerId,
        transactionId,
        false,
        corpseId,
        ownerId,
        "PROTECTED",
      );
      return null;
    }

    if (this.isPlayerInDeathState(playerId)) {
      this.emitLootResult(
        playerId,
        transactionId,
        false,
        corpseId,
        ownerId,
        "PLAYER_DYING",
      );
      return null;
    }

    return { entity, ownerId };
  }

  // --- Helpers ---

  private getLootableEntity(entityId: string): LootableEntity | null {
    const entity = this.world.entities?.get?.(entityId);
    if (
      !entity ||
      !("canPlayerLoot" in entity) ||
      !("removeItem" in entity) ||
      !("getLootItems" in entity) ||
      !("getOwnerId" in entity)
    ) {
      return null;
    }
    return entity as unknown as LootableEntity;
  }

  private isRateLimited(playerId: string): boolean {
    const now = Date.now();
    const lastRequest = this.lootRateLimiter.get(playerId) || 0;
    if (now - lastRequest < this.LOOT_RATE_LIMIT_MS) {
      return true;
    }
    this.lootRateLimiter.set(playerId, now);
    return false;
  }

  private isPlayerInDeathState(playerId: string): boolean {
    const playerEntity = this.world.entities?.get?.(playerId) as
      | { data?: { deathState?: DeathState } }
      | undefined;
    if (!playerEntity?.data?.deathState) return false;
    return (
      playerEntity.data.deathState === DeathState.DYING ||
      playerEntity.data.deathState === DeathState.DEAD
    );
  }

  private checkInventorySpace(
    playerId: string,
    itemId: string,
  ): { hasSpace: boolean; reason?: string } {
    const inventorySystem = this.world.getSystem(
      "inventory",
    ) as unknown as InventorySystemAccess;
    if (!inventorySystem?.getInventory) {
      return { hasSpace: false, reason: "InventorySystem not available" };
    }

    const inventory = inventorySystem.getInventory(playerId);
    if (!inventory) {
      return { hasSpace: false, reason: "No inventory" };
    }

    const isFull = inventory.items.length >= 28;
    if (isFull) {
      const existingItem = inventory.items.find(
        (item: { itemId: string }) => item.itemId === itemId,
      );
      if (existingItem) {
        return { hasSpace: true };
      }
      return { hasSpace: false, reason: "INVENTORY_FULL" };
    }

    return { hasSpace: true };
  }

  private emitLootResult(
    playerId: string,
    transactionId: string,
    success: boolean,
    entityId: string,
    ownerId: string,
    reason?: LootFailureReason,
    itemId?: string,
    quantity?: number,
  ): void {
    const result = {
      transactionId,
      success,
      itemId,
      quantity,
      reason,
      timestamp: Date.now(),
    };

    if (this.world.network && "sendTo" in this.world.network) {
      (
        this.world.network as {
          sendTo: (id: string, event: string, data: unknown) => void;
        }
      ).sendTo(playerId, "lootResult", result);
    }

    this.world.emit(EventType.LOOT_RESULT, { playerId, ...result });

    if (!success) {
      this.world.emit(EventType.AUDIT_LOG, {
        action: "LOOT_FAILED",
        playerId: ownerId,
        actorId: playerId,
        entityId,
        items: itemId ? [{ itemId, quantity: quantity || 1 }] : undefined,
        zoneType: "safe_area",
        position: undefined,
        success: false,
        failureReason: reason,
        transactionId,
        timestamp: Date.now(),
      });
    }
  }

  // --- Single Item Loot ---

  private async processLootRequest(data: {
    corpseId: string;
    playerId: string;
    itemId: string;
    quantity: number;
    slot?: number;
    transactionId: string;
  }): Promise<void> {
    const { corpseId, playerId, itemId, quantity, transactionId } = data;

    const ctx = this.validateLootPermissions(corpseId, playerId, transactionId);
    if (!ctx) return;
    const { entity, ownerId } = ctx;

    const lootItems = entity.getLootItems();
    const item = lootItems.find((i) => i.itemId === itemId);
    if (!item) {
      this.emitLootResult(
        playerId,
        transactionId,
        false,
        corpseId,
        ownerId,
        "ITEM_NOT_FOUND",
      );
      return;
    }

    const quantityToLoot = Math.min(quantity, item.quantity);
    if (quantityToLoot <= 0) {
      this.emitLootResult(
        playerId,
        transactionId,
        false,
        corpseId,
        ownerId,
        "INVALID_REQUEST",
      );
      return;
    }

    const spaceCheck = this.checkInventorySpace(playerId, itemId);
    if (!spaceCheck.hasSpace) {
      if (spaceCheck.reason === "INVENTORY_FULL") {
        this.world.emit(EventType.UI_MESSAGE, {
          playerId,
          message: "Your inventory is full!",
          type: "error",
        });
      }
      this.emitLootResult(
        playerId,
        transactionId,
        false,
        corpseId,
        ownerId,
        "INVENTORY_FULL",
      );
      return;
    }

    const removed = entity.removeItem(itemId, quantityToLoot);
    if (!removed) {
      this.emitLootResult(
        playerId,
        transactionId,
        false,
        corpseId,
        ownerId,
        "ITEM_NOT_FOUND",
      );
      return;
    }

    // Defensive re-check (Phase 5.1 will improve rollback)
    const recheck = this.checkInventorySpace(playerId, itemId);
    if (!recheck.hasSpace) {
      this.emitLootResult(
        playerId,
        transactionId,
        false,
        corpseId,
        ownerId,
        "INVENTORY_FULL",
      );
      return;
    }

    this.world.emit(EventType.INVENTORY_ITEM_ADDED, {
      playerId,
      item: {
        id: `loot_${playerId}_${Date.now()}`,
        itemId,
        quantity: quantityToLoot,
        slot: -1,
        metadata: null,
      },
    });

    this.emitLootResult(
      playerId,
      transactionId,
      true,
      corpseId,
      ownerId,
      undefined,
      itemId,
      quantityToLoot,
    );

    this.world.emit(EventType.AUDIT_LOG, {
      action: "LOOT_SUCCESS",
      playerId: ownerId,
      actorId: playerId,
      entityId: corpseId,
      items: [{ itemId, quantity: quantityToLoot }],
      zoneType: "safe_area",
      position: entity.getPosition(),
      success: true,
      transactionId,
      timestamp: Date.now(),
    });
  }

  // --- Loot All ---

  private async processLootAllRequest(data: {
    corpseId: string;
    playerId: string;
    transactionId: string;
  }): Promise<void> {
    const { corpseId, playerId, transactionId } = data;

    const ctx = this.validateLootPermissions(corpseId, playerId, transactionId);
    if (!ctx) return;
    const { entity, ownerId } = ctx;

    const lootItems = entity.getLootItems();
    if (lootItems.length === 0) {
      this.emitLootResult(playerId, transactionId, true, corpseId, ownerId);
      return;
    }

    const inventorySystem = this.world.getSystem(
      "inventory",
    ) as unknown as InventorySystemAccess;
    if (!inventorySystem?.getInventory) {
      this.emitLootResult(
        playerId,
        transactionId,
        false,
        corpseId,
        ownerId,
        "INVALID_REQUEST",
      );
      return;
    }

    const inventory = inventorySystem.getInventory(playerId);
    if (!inventory) {
      this.emitLootResult(
        playerId,
        transactionId,
        false,
        corpseId,
        ownerId,
        "INVALID_REQUEST",
      );
      return;
    }

    const maxSlots = 28;
    let usedSlots = inventory.items.length;
    const existingItemIds = new Set(inventory.items.map((i) => i.itemId));

    const itemsToLoot: Array<{ itemId: string; quantity: number }> = [];

    for (const item of lootItems) {
      const canStack = existingItemIds.has(item.itemId);
      const hasSpace = usedSlots < maxSlots || canStack;

      if (!hasSpace) break;

      itemsToLoot.push({ itemId: item.itemId, quantity: item.quantity });

      if (!canStack) {
        usedSlots++;
        existingItemIds.add(item.itemId);
      }
    }

    const successfullyLooted: Array<{ itemId: string; quantity: number }> = [];

    for (const item of itemsToLoot) {
      const spaceCheck = this.checkInventorySpace(playerId, item.itemId);
      if (!spaceCheck.hasSpace) break;

      const removed = entity.removeItem(item.itemId, item.quantity);
      if (removed) {
        this.world.emit(EventType.INVENTORY_ITEM_ADDED, {
          playerId,
          item: {
            id: `loot_${playerId}_${Date.now()}_${item.itemId}`,
            itemId: item.itemId,
            quantity: item.quantity,
            slot: -1,
            metadata: null,
          },
        });
        successfullyLooted.push(item);
      }
    }

    this.emitLootResult(
      playerId,
      transactionId,
      true,
      corpseId,
      ownerId,
      undefined,
      undefined,
      successfullyLooted.length,
    );

    if (successfullyLooted.length > 0) {
      this.world.emit(EventType.AUDIT_LOG, {
        action: "LOOT_ALL_SUCCESS",
        playerId: ownerId,
        actorId: playerId,
        entityId: corpseId,
        items: successfullyLooted,
        zoneType: "safe_area",
        position: entity.getPosition(),
        success: true,
        transactionId,
        timestamp: Date.now(),
      });
    }
  }

  destroy(): void {
    this.lootQueues.clear();
    this.lootRateLimiter.clear();
    super.destroy();
  }
}
