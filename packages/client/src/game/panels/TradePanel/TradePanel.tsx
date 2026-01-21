/**
 * Trade Panel
 *
 * Main trading interface showing both players' offers side-by-side.
 * Supports drag-and-drop from inventory to trade offer.
 *
 * Layout:
 * - Left side: Local player's offer
 * - Right side: Partner's offer
 * - Bottom: Accept/Cancel buttons
 *
 * Features:
 * - Drag items from inventory to add to trade
 * - Click items in trade to remove
 * - Both players must accept for trade to complete
 * - Acceptance resets if either offer changes
 */

import { useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import {
  getItem,
  type TradeOfferItem,
  type TradeWindowState,
} from "@hyperscape/shared";
import { getItemIcon } from "../utils/item-display";

// ============================================================================
// Constants
// ============================================================================

const TRADE_GRID_COLS = 4;
const TRADE_GRID_ROWS = 7;
const TRADE_SLOTS = TRADE_GRID_COLS * TRADE_GRID_ROWS; // 28 slots

// ============================================================================
// Types
// ============================================================================

interface TradePanelProps {
  state: TradeWindowState;
  inventory: Array<{ slot: number; itemId: string; quantity: number }>;
  onAddItem: (inventorySlot: number, quantity?: number) => void;
  onRemoveItem: (tradeSlot: number) => void;
  onAccept: () => void;
  onCancel: () => void;
}

interface TradeSlotProps {
  item: TradeOfferItem | null;
  slotIndex: number;
  side: "my" | "their";
  onRemove?: () => void;
  isDragging?: boolean;
}

interface DraggableInventoryItemProps {
  item: { slot: number; itemId: string; quantity: number };
  index: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format quantity for OSRS-style display
 */
function formatQuantity(qty: number): { text: string; color: string } {
  if (qty < 100000) {
    return { text: qty.toLocaleString(), color: "rgba(255, 255, 255, 0.95)" };
  } else if (qty < 10000000) {
    const k = Math.floor(qty / 1000);
    return { text: `${k}K`, color: "rgba(0, 255, 128, 0.95)" };
  } else {
    const m = Math.floor(qty / 1000000);
    return { text: `${m}M`, color: "rgba(0, 255, 128, 0.95)" };
  }
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Individual trade slot displaying an item or empty slot
 */
function TradeSlot({
  item,
  slotIndex,
  side,
  onRemove,
  isDragging,
}: TradeSlotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `trade-${side}-${slotIndex}`,
    disabled: side === "their", // Can't drop into partner's offer
  });

  const itemData = item ? getItem(item.itemId) : null;
  const iconUrl = item ? getItemIcon(item.itemId) : null;
  const quantity = item?.quantity ?? 0;
  const qtyDisplay = quantity > 1 ? formatQuantity(quantity) : null;

  return (
    <div
      ref={setNodeRef}
      className="relative flex items-center justify-center"
      style={{
        width: "36px",
        height: "36px",
        background: isOver ? "rgba(46, 204, 113, 0.3)" : "rgba(0, 0, 0, 0.3)",
        border: isOver
          ? "1px solid rgba(46, 204, 113, 0.8)"
          : "1px solid rgba(139, 69, 19, 0.4)",
        borderRadius: "4px",
        opacity: isDragging ? 0.5 : 1,
        cursor: item && side === "my" ? "pointer" : "default",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onClick={() => {
        if (item && side === "my" && onRemove) {
          onRemove();
        }
      }}
      title={itemData?.name || ""}
    >
      {iconUrl && (
        <img
          src={iconUrl}
          alt={itemData?.name || "Item"}
          style={{
            width: "32px",
            height: "32px",
            objectFit: "contain",
            imageRendering: "pixelated",
          }}
          draggable={false}
        />
      )}
      {qtyDisplay && (
        <span
          className="absolute bottom-0 right-0.5 text-xs font-bold"
          style={{
            color: qtyDisplay.color,
            textShadow:
              "1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000",
            fontSize: "10px",
          }}
        >
          {qtyDisplay.text}
        </span>
      )}
    </div>
  );
}

/**
 * Draggable inventory item for the trade panel
 */
function DraggableInventoryItem({
  item,
  index: _index,
}: DraggableInventoryItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `inventory-${item.slot}`,
    data: { type: "inventory", slot: item.slot, itemId: item.itemId },
  });

  const itemData = getItem(item.itemId);
  const iconUrl = getItemIcon(item.itemId);
  const qtyDisplay = item.quantity > 1 ? formatQuantity(item.quantity) : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="relative flex items-center justify-center"
      style={{
        width: "36px",
        height: "36px",
        background: "rgba(0, 0, 0, 0.3)",
        border: "1px solid rgba(139, 69, 19, 0.4)",
        borderRadius: "4px",
        opacity: isDragging ? 0.5 : 1,
        cursor: "grab",
        touchAction: "none",
      }}
      title={itemData?.name || ""}
    >
      {iconUrl && (
        <img
          src={iconUrl}
          alt={itemData?.name || "Item"}
          style={{
            width: "32px",
            height: "32px",
            objectFit: "contain",
            imageRendering: "pixelated",
          }}
          draggable={false}
        />
      )}
      {qtyDisplay && (
        <span
          className="absolute bottom-0 right-0.5 text-xs font-bold"
          style={{
            color: qtyDisplay.color,
            textShadow:
              "1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000",
            fontSize: "10px",
          }}
        >
          {qtyDisplay.text}
        </span>
      )}
    </div>
  );
}

/**
 * Inventory mini-panel for selecting items to trade
 */
function InventoryMiniPanel({
  items,
  offeredSlots,
}: {
  items: Array<{ slot: number; itemId: string; quantity: number }>;
  offeredSlots: Set<number>;
}) {
  // Filter out items already offered
  const availableItems = items.filter((item) => !offeredSlots.has(item.slot));

  return (
    <div className="mt-3">
      <h4
        className="text-xs font-bold mb-2"
        style={{ color: "rgba(242, 208, 138, 0.8)" }}
      >
        Your Inventory (drag to trade)
      </h4>
      <div
        className="grid gap-1 p-2 rounded"
        style={{
          gridTemplateColumns: "repeat(7, 36px)",
          background: "rgba(0, 0, 0, 0.2)",
          border: "1px solid rgba(139, 69, 19, 0.3)",
          maxHeight: "120px",
          overflowY: "auto",
        }}
      >
        {availableItems.map((item) => (
          <DraggableInventoryItem
            key={item.slot}
            item={item}
            index={item.slot}
          />
        ))}
        {availableItems.length === 0 && (
          <p
            className="col-span-7 text-center text-xs py-2"
            style={{ color: "rgba(255, 255, 255, 0.5)" }}
          >
            No items to trade
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TradePanel({
  state,
  inventory,
  onAddItem,
  onRemoveItem,
  onAccept,
  onCancel,
}: TradePanelProps) {
  const [draggedItem, setDraggedItem] = useState<{
    slot: number;
    itemId: string;
  } | null>(null);

  // Sensors for drag and drop
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 100, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // Get set of inventory slots already offered
  const offeredSlots = useMemo(() => {
    return new Set(state.myOffer.map((item) => item.inventorySlot));
  }, [state.myOffer]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as {
      type: string;
      slot: number;
      itemId: string;
    };
    if (data?.type === "inventory") {
      setDraggedItem({ slot: data.slot, itemId: data.itemId });
    }
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setDraggedItem(null);

      if (!over) return;

      const activeData = active.data.current as {
        type: string;
        slot: number;
        itemId: string;
      };

      // Dropping inventory item onto trade area
      if (activeData?.type === "inventory") {
        const overId = over.id as string;
        if (overId.startsWith("trade-my-") || overId === "trade-my-drop-zone") {
          onAddItem(activeData.slot);
        }
      }
    },
    [onAddItem],
  );

  if (!state.isOpen || !state.partner) return null;

  // Convert offers to slot-indexed arrays for rendering
  const myOfferBySlot = new Map<number, TradeOfferItem>();
  for (const item of state.myOffer) {
    myOfferBySlot.set(item.tradeSlot, item);
  }

  const theirOfferBySlot = new Map<number, TradeOfferItem>();
  for (const item of state.theirOffer) {
    theirOfferBySlot.set(item.tradeSlot, item);
  }

  // Get dragged item data for overlay
  const _draggedItemData = draggedItem ? getItem(draggedItem.itemId) : null;
  const draggedItemIcon = draggedItem ? getItemIcon(draggedItem.itemId) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="rounded-lg shadow-xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(30, 25, 20, 0.98) 0%, rgba(20, 15, 10, 0.98) 100%)",
            border: "2px solid rgba(139, 69, 19, 0.8)",
            width: "480px",
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 rounded-t-lg flex items-center justify-between"
            style={{
              background: "rgba(0, 0, 0, 0.3)",
              borderBottom: "1px solid rgba(139, 69, 19, 0.5)",
            }}
          >
            <h2
              className="text-lg font-bold"
              style={{ color: "rgba(242, 208, 138, 0.95)" }}
            >
              Trading with{" "}
              <span style={{ color: "#ffffff" }}>{state.partner.name}</span>
            </h2>
            <button
              onClick={onCancel}
              className="text-xl font-bold px-2 rounded transition-colors"
              style={{ color: "rgba(255, 255, 255, 0.6)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "rgba(255, 255, 255, 1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)";
              }}
            >
              ×
            </button>
          </div>

          {/* Trade areas */}
          <div className="p-4">
            <div className="flex gap-4">
              {/* My offer */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3
                    className="text-sm font-bold"
                    style={{ color: "rgba(242, 208, 138, 0.9)" }}
                  >
                    Your Offer
                  </h3>
                  {state.myAccepted && (
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        background: "rgba(46, 204, 113, 0.3)",
                        color: "#2ecc71",
                        border: "1px solid rgba(46, 204, 113, 0.5)",
                      }}
                    >
                      Accepted
                    </span>
                  )}
                </div>
                <TradeDropZone id="trade-my-drop-zone">
                  <div
                    className="grid gap-1 p-2 rounded"
                    style={{
                      gridTemplateColumns: `repeat(${TRADE_GRID_COLS}, 36px)`,
                      background: "rgba(0, 0, 0, 0.2)",
                      border: "1px solid rgba(139, 69, 19, 0.4)",
                    }}
                  >
                    {Array.from({ length: TRADE_SLOTS }).map((_, i) => (
                      <TradeSlot
                        key={i}
                        item={myOfferBySlot.get(i) || null}
                        slotIndex={i}
                        side="my"
                        onRemove={() => onRemoveItem(i)}
                      />
                    ))}
                  </div>
                </TradeDropZone>
              </div>

              {/* Divider */}
              <div
                className="w-px"
                style={{ background: "rgba(139, 69, 19, 0.4)" }}
              />

              {/* Their offer */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3
                    className="text-sm font-bold"
                    style={{ color: "rgba(242, 208, 138, 0.9)" }}
                  >
                    {state.partner.name}'s Offer
                  </h3>
                  {state.theirAccepted && (
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        background: "rgba(46, 204, 113, 0.3)",
                        color: "#2ecc71",
                        border: "1px solid rgba(46, 204, 113, 0.5)",
                      }}
                    >
                      Accepted
                    </span>
                  )}
                </div>
                <div
                  className="grid gap-1 p-2 rounded"
                  style={{
                    gridTemplateColumns: `repeat(${TRADE_GRID_COLS}, 36px)`,
                    background: "rgba(0, 0, 0, 0.2)",
                    border: "1px solid rgba(139, 69, 19, 0.4)",
                  }}
                >
                  {Array.from({ length: TRADE_SLOTS }).map((_, i) => (
                    <TradeSlot
                      key={i}
                      item={theirOfferBySlot.get(i) || null}
                      slotIndex={i}
                      side="their"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Inventory mini-panel */}
            <InventoryMiniPanel items={inventory} offeredSlots={offeredSlots} />

            {/* Action buttons */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={onAccept}
                disabled={state.myAccepted}
                className="flex-1 py-2.5 rounded text-sm font-bold transition-all"
                style={{
                  background: state.myAccepted
                    ? "rgba(100, 100, 100, 0.5)"
                    : "linear-gradient(135deg, rgba(46, 204, 113, 0.8) 0%, rgba(39, 174, 96, 0.8) 100%)",
                  color: "#fff",
                  border: state.myAccepted
                    ? "1px solid rgba(100, 100, 100, 0.6)"
                    : "1px solid rgba(46, 204, 113, 0.9)",
                  textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                  opacity: state.myAccepted ? 0.7 : 1,
                  cursor: state.myAccepted ? "default" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!state.myAccepted) {
                    e.currentTarget.style.background =
                      "linear-gradient(135deg, rgba(46, 204, 113, 1) 0%, rgba(39, 174, 96, 1) 100%)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!state.myAccepted) {
                    e.currentTarget.style.background =
                      "linear-gradient(135deg, rgba(46, 204, 113, 0.8) 0%, rgba(39, 174, 96, 0.8) 100%)";
                  }
                }}
              >
                {state.myAccepted ? "Waiting for partner..." : "Accept Trade"}
              </button>
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded text-sm font-bold transition-all"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(192, 57, 43, 0.8) 0%, rgba(169, 50, 38, 0.8) 100%)",
                  color: "#fff",
                  border: "1px solid rgba(192, 57, 43, 0.9)",
                  textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, rgba(192, 57, 43, 1) 0%, rgba(169, 50, 38, 1) 100%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, rgba(192, 57, 43, 0.8) 0%, rgba(169, 50, 38, 0.8) 100%)";
                }}
              >
                Cancel
              </button>
            </div>

            {/* Status message */}
            {state.myAccepted && state.theirAccepted && (
              <p
                className="text-center text-sm mt-3"
                style={{ color: "#2ecc71" }}
              >
                Both players accepted - completing trade...
              </p>
            )}
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {draggedItemIcon && (
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  background: "rgba(0, 0, 0, 0.8)",
                  border: "1px solid rgba(139, 69, 19, 0.8)",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={draggedItemIcon}
                  alt=""
                  style={{
                    width: "32px",
                    height: "32px",
                    objectFit: "contain",
                    imageRendering: "pixelated",
                  }}
                />
              </div>
            )}
          </DragOverlay>
        </div>
      </DndContext>
    </div>,
    document.body,
  );
}

/**
 * Drop zone wrapper for trade area
 */
function TradeDropZone({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        borderRadius: "4px",
        transition: "box-shadow 0.15s",
        boxShadow: isOver ? "0 0 8px rgba(46, 204, 113, 0.5)" : "none",
      }}
    >
      {children}
    </div>
  );
}
