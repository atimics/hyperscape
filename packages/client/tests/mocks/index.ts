/**
 * Test mocks for client tests
 */

import { vi } from "vitest";

interface MockNetwork {
  send: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  calls: Array<{ type: string; payload: Record<string, unknown> }>;
}

export interface MockClientWorld {
  getPlayer: ReturnType<typeof vi.fn>;
  network: MockNetwork;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
}

interface MockPlayer {
  inventory: {
    items: Array<{ slot: number; itemId: string; quantity: number }>;
    coins: number;
  };
  equipment: {
    helmet: null | { id: string; slot: string };
    body: null | { id: string; slot: string };
    legs: null | { id: string; slot: string };
    weapon: null | { id: string; slot: string };
    shield: null | { id: string; slot: string };
    arrows: null | { id: string; slot: string };
  };
  stats: {
    totalLevel: number;
    totalXp: number;
  };
}

let mockWorldInstance: MockClientWorld | null = null;

export function createMockWorld(): MockClientWorld {
  const networkCalls: Array<{
    type: string;
    payload: Record<string, unknown>;
  }> = [];

  mockWorldInstance = {
    getPlayer: vi.fn(() => ({
      inventory: {
        items: [],
        coins: 1000,
      },
      equipment: {
        helmet: null,
        body: null,
        legs: null,
        weapon: null,
        shield: null,
        arrows: null,
      },
      stats: {
        totalLevel: 35,
        totalXp: 50000,
      },
    })),
    network: {
      send: vi.fn((type: string, payload: Record<string, unknown>) => {
        networkCalls.push({ type, payload });
      }),
      on: vi.fn(),
      off: vi.fn(),
      calls: networkCalls,
    },
    on: vi.fn(),
    off: vi.fn(),
  };
  return mockWorldInstance;
}

export function createMockWorldWithoutNetwork(): Partial<MockClientWorld> {
  return {
    getPlayer: vi.fn(() => ({
      inventory: { items: [], coins: 1000 },
      equipment: {
        helmet: null,
        body: null,
        legs: null,
        weapon: null,
        shield: null,
        arrows: null,
      },
      stats: { totalLevel: 35, totalXp: 50000 },
    })),
    network: undefined,
    on: vi.fn(),
    off: vi.fn(),
  };
}

export function getLastNetworkCall(
  world: MockClientWorld,
): { type: string; payload: Record<string, unknown> } | undefined {
  const calls = world.network.calls;
  return calls[calls.length - 1];
}

export function clearMockWorldCalls(): void {
  if (mockWorldInstance) {
    mockWorldInstance.getPlayer.mockClear();
    mockWorldInstance.network.send.mockClear();
    mockWorldInstance.network.on.mockClear();
    mockWorldInstance.network.off.mockClear();
    mockWorldInstance.network.calls.length = 0;
    mockWorldInstance.on.mockClear();
    mockWorldInstance.off.mockClear();
  }
}

// NOTE: Performance mocks are handled by setup.ts
// Do not duplicate them here to avoid conflicting spy implementations

// Drag event helpers for testing drag-drop functionality

/**
 * Create a mock element with getBoundingClientRect
 */
function createMockElement(
  width: number = 40,
  height: number = 40,
  left: number = 0,
  top: number = 0,
): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({
    width,
    height,
    left,
    top,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
  return el;
}

/**
 * Create a drag event at a specific position within an element
 * Used to test swap vs insert zone detection based on horizontal position
 *
 * @param type - Event type ("dragover", "drop", etc.)
 * @param position - Either a ratio (0.0-1.0 of element width) or named position
 * @param elementWidth - Width of the element in pixels (default 40)
 */
export function createDragEventAtPosition(
  type: string,
  position: "left" | "center" | "right" | number,
  elementWidth: number = 40,
): DragEvent {
  // Calculate clientX based on position (relative to element left edge at 0)
  // Left 40% = insert before, Right 60% = swap (per hook logic)
  let clientX: number;

  if (typeof position === "number") {
    // Numeric ratio: 0.2 means 20% from left
    clientX = elementWidth * position;
  } else {
    switch (position) {
      case "left":
        clientX = elementWidth * 0.2; // 20% from left (in insert zone)
        break;
      case "center":
        clientX = elementWidth * 0.5; // Center (in swap zone)
        break;
      case "right":
        clientX = elementWidth * 0.8; // 80% from left (in swap zone)
        break;
    }
  }

  const event = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY: 20,
  });

  // Attach mock currentTarget with getBoundingClientRect
  const mockElement = createMockElement(elementWidth, 40, 0, 0);
  Object.defineProperty(event, "currentTarget", {
    value: mockElement,
    writable: false,
  });

  return event;
}

/**
 * Create a drag event in the insert zone (left or right edge)
 */
export function createInsertZoneDragEvent(
  type: string,
  side: "left" | "right" = "left",
): DragEvent {
  return createDragEventAtPosition(type, side, 40);
}

/**
 * Create a drag event in the swap zone (center)
 */
export function createSwapZoneDragEvent(type: string): DragEvent {
  return createDragEventAtPosition(type, "center", 40);
}

/**
 * Create a basic mock drag event with currentTarget and spy on preventDefault
 */
export function createMockDragEvent(type: string): DragEvent {
  const event = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 20,
    clientY: 20,
  });

  const mockElement = createMockElement(40, 40, 0, 0);
  Object.defineProperty(event, "currentTarget", {
    value: mockElement,
    writable: false,
  });

  // Make preventDefault a spy so tests can verify it was called
  event.preventDefault = vi.fn();

  return event;
}

/**
 * Create a drag event with custom options
 */
export function createDragEvent(
  type: string,
  options: {
    dataTransfer?: DataTransfer;
    clientX?: number;
    clientY?: number;
  } = {},
): DragEvent {
  const event = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    dataTransfer: options.dataTransfer,
    clientX: options.clientX ?? 20,
    clientY: options.clientY ?? 20,
  });

  const mockElement = createMockElement(40, 40, 0, 0);
  Object.defineProperty(event, "currentTarget", {
    value: mockElement,
    writable: false,
  });

  return event;
}

export function createMockDragStartEvent(slotIndex: number): DragEvent {
  const event = createDragEvent("dragstart");
  if (event.dataTransfer) {
    event.dataTransfer.setData("text/plain", String(slotIndex));
  }
  return event;
}
