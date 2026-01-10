# Inventory Context Menu Improvements Plan

**Goal:** Bring code quality from 7.5/10 to 9/10+ across all criteria
**Branch:** `feature/smithing-skill`
**Files Affected:** 4 primary, 2 new modules
**Last Updated:** Verified against codebase structure

---

## Codebase Context (Verified)

Before implementing, note these patterns discovered during review:

1. **Utils Export Pattern**: `packages/shared/src/index.ts` exports utils **selectively**, not via blanket `export *`. New utils must be explicitly exported.

2. **ClientWorld Type**: Defined in `packages/client/src/types/world.ts` as `InstanceType<typeof World>` - the World class from shared.

3. **Context Menu Flow**: `InventoryPanel` dispatches `CustomEvent("contextmenu")` → `EntityContextMenu` catches it → User clicks → dispatches `CustomEvent("contextmenu:select")` → `InventoryPanel` handler processes action.

4. **Constants Pattern**: Game constants live in `packages/shared/src/constants/GameConstants.ts` with domain-specific files like `CombatConstants.ts`.

5. **Component Structure**: `DraggableInventorySlot` is a proper function component at module level (not nested), so React hooks work correctly.

---

## Executive Summary

| Criterion | Current | Target | Gap |
|-----------|---------|--------|-----|
| Production Quality | 7/10 | 9/10 | Remove dead code, add validation, eliminate duplication |
| Best Practices | 7/10 | 9/10 | Extract utilities, unify checks, add constants |
| OWASP Security | 9/10 | 9/10 | Maintain (already good) |
| Game Studio Audit | 9/10 | 10/10 | Add Cancel option, polish |
| Memory Hygiene | 7/10 | 9/10 | Memoization, caching |
| SOLID Principles | 6/10 | 9/10 | Extract modules, create interfaces |

---

## Phase 1: Quick Wins (Dead Code & Validation)

### 1.1 Remove Dead Code

**File:** `packages/client/src/game/panels/InventoryPanel.tsx`

Remove unused helper functions (lines 149-170):

```typescript
// DELETE these functions - defined but never used:
function isFiremakingItem(item: Item | null): boolean { ... }
function isCookingItem(item: Item | null): boolean { ... }
```

**Rationale:** Dead code confuses maintainers and bloats bundle size.

---

### 1.2 Add Manifest Action Validation

**File:** `packages/client/src/game/panels/InventoryPanel.tsx`

Add warning for unhandled actions in the context menu handler (~line 905):

```typescript
// In the useEffect for contextmenu:select handler
// After all the if (ce.detail.actionId === "...") blocks, add:

// Warn about unhandled actions (catches manifest typos)
const handledActions = new Set([
  "eat", "drink", "bury", "wield", "wear", "drop", "examine", "use"
]);
if (!handledActions.has(ce.detail.actionId)) {
  console.warn(
    `[InventoryPanel] Unhandled inventory action: "${ce.detail.actionId}" for item "${it.itemId}". ` +
    `Check inventoryActions in item manifest.`
  );
}
```

**Rationale:** Prevents silent failures when manifest has typos or new action types.

---

### 1.3 Unify Noted Item Detection

**File:** `packages/client/src/game/panels/InventoryPanel.tsx`

Replace inconsistent check on line 311:

```typescript
// BEFORE (line 311):
const isItemNoted = item?.itemId?.endsWith("_noted") ?? false;

// AFTER:
const itemDataForNoteCheck = item ? getItem(item.itemId) : null;
const isItemNoted = isNotedItem(itemDataForNoteCheck);
```

**Rationale:** Single source of truth for noted item detection.

---

## Phase 2: Extract Shared Utilities

### 2.1 Create Item Type Helpers Module

**New File:** `packages/shared/src/utils/item-helpers.ts`

```typescript
/**
 * OSRS-accurate item type detection helpers.
 * Used for context menu ordering and left-click default actions.
 */

import type { Item } from "../types/game/item-types";

// ============================================================================
// ITEM TYPE DETECTION
// ============================================================================

/** Food items - have healAmount and are consumable (excludes potions) */
export function isFood(item: Item | null): boolean {
  if (!item) return false;
  return (
    item.type === "consumable" &&
    typeof item.healAmount === "number" &&
    item.healAmount > 0 &&
    !item.id.includes("potion")
  );
}

/** Potions - consumable items with "potion" in ID */
export function isPotion(item: Item | null): boolean {
  if (!item) return false;
  return item.type === "consumable" && item.id.includes("potion");
}

/** Bones - items that can be buried for Prayer XP */
export function isBone(item: Item | null): boolean {
  if (!item) return false;
  return item.id === "bones" || item.id.endsWith("_bones");
}

/** Weapons - equipSlot is weapon or 2h, or has weaponType */
export function isWeapon(item: Item | null): boolean {
  if (!item) return false;
  return (
    item.equipSlot === "weapon" ||
    item.equipSlot === "2h" ||
    item.is2h === true ||
    item.weaponType != null
  );
}

/** Shields/Defenders - equipSlot is shield */
export function isShield(item: Item | null): boolean {
  if (!item) return false;
  return item.equipSlot === "shield";
}

/** Equipment that uses "Wield" (weapons + shields) */
export function usesWield(item: Item | null): boolean {
  return isWeapon(item) || isShield(item);
}

/** Equipment that uses "Wear" (all other equipment: head, body, legs, etc.) */
export function usesWear(item: Item | null): boolean {
  if (!item) return false;
  if (!item.equipable && !item.equipSlot) return false;
  return !usesWield(item);
}

/** Bank notes - cannot be eaten/equipped, only Use/Drop/Examine */
export function isNotedItem(item: Item | null): boolean {
  if (!item) return false;
  return item.isNoted === true || item.id.endsWith("_noted");
}

// ============================================================================
// PRIMARY ACTION DETECTION
// ============================================================================

/** Primary action types for inventory left-click */
export type PrimaryActionType = "eat" | "drink" | "bury" | "wield" | "wear" | "use";

/** Valid inventory actions that have handlers */
export const HANDLED_INVENTORY_ACTIONS = new Set<string>([
  "eat", "drink", "bury", "wield", "wear", "drop", "examine", "use"
]);

/**
 * Get primary action from manifest's inventoryActions (OSRS-accurate approach).
 * Returns the first action in the array, or null if no actions defined.
 */
export function getPrimaryActionFromManifest(
  item: Item | null
): PrimaryActionType | null {
  if (!item?.inventoryActions || item.inventoryActions.length === 0) {
    return null;
  }
  const firstAction = item.inventoryActions[0].toLowerCase();
  switch (firstAction) {
    case "eat": return "eat";
    case "drink": return "drink";
    case "bury": return "bury";
    case "wield": return "wield";
    case "wear": return "wear";
    case "use":
    default: return "use";
  }
}

/**
 * Get primary action using manifest-first approach with heuristic fallback.
 * OSRS-accurate: reads from inventoryActions if available.
 */
export function getPrimaryAction(
  item: Item | null,
  isNoted: boolean
): PrimaryActionType {
  if (isNoted) return "use";

  const manifestAction = getPrimaryActionFromManifest(item);
  if (manifestAction) return manifestAction;

  // Fallback to heuristic detection
  if (isFood(item)) return "eat";
  if (isPotion(item)) return "drink";
  if (isBone(item)) return "bury";
  if (usesWield(item)) return "wield";
  if (usesWear(item)) return "wear";

  return "use";
}
```

**Export from shared index (following existing selective pattern):**

```typescript
// packages/shared/src/index.ts - Add these lines in the appropriate sections:

// In the "Types" section (around line 100-200):
export type { PrimaryActionType } from "./utils/item-helpers";

// In a new "Item Helpers" section (around line 350):
// Item type detection helpers (OSRS-accurate inventory actions)
export {
  isFood,
  isPotion,
  isBone,
  isWeapon,
  isShield,
  usesWield,
  usesWear,
  isNotedItem,
  getPrimaryAction,
  getPrimaryActionFromManifest,
  HANDLED_INVENTORY_ACTIONS,
} from "./utils/item-helpers";
```

**Note:** The shared package uses selective exports, not blanket `export *`. This keeps the public API explicit and tree-shakeable.

---

### 2.2 Add Context Menu Constants

**File:** `packages/shared/src/constants/GameConstants.ts` (add to existing file)

Add a new section to the existing GameConstants.ts file (following the established pattern):

```typescript
// === OSRS-STYLE CONTEXT MENU COLORS ===
export const CONTEXT_MENU_COLORS = {
  /** Item name color in context menus (OSRS orange) */
  ITEM: "#ff9040",
  /** NPC name color in context menus (OSRS yellow) */
  NPC: "#ffff00",
  /** Object name color in context menus (OSRS cyan) */
  OBJECT: "#00ffff",
  /** Player name color in context menus */
  PLAYER: "#ffffff",
} as const;
```

**Why GameConstants.ts instead of new file:** Follows existing pattern where related constants are grouped in domain files. UI constants are game-specific, not engine-specific.

---

## Phase 3: Extract Action Dispatching

### 3.1 Create Inventory Action Dispatcher

**New File:** `packages/client/src/game/systems/InventoryActionDispatcher.ts`

```typescript
/**
 * Centralized inventory action dispatching.
 * Eliminates duplication between context menu and left-click handlers.
 */

import { EventType, uuid, getItem } from "@hyperscape/shared";
import type { ClientWorld } from "../../types";

export interface InventoryActionContext {
  world: ClientWorld;
  itemId: string;
  slot: number;
  quantity?: number;
}

export interface ActionResult {
  success: boolean;
  message?: string;
}

/** Actions that are intentionally no-ops (don't warn) */
const SILENT_ACTIONS = new Set(["cancel"]);

/**
 * Dispatch an inventory action to the appropriate handler.
 * Single source of truth for action handling.
 */
export function dispatchInventoryAction(
  action: string,
  ctx: InventoryActionContext
): ActionResult {
  const { world, itemId, slot, quantity = 1 } = ctx;
  const localPlayer = world.getPlayer();

  if (!localPlayer) {
    return { success: false, message: "No local player" };
  }

  switch (action) {
    case "eat":
    case "drink":
      world.emit(EventType.ITEM_ACTION_SELECTED, {
        playerId: localPlayer.id,
        actionId: action,
        itemId,
        slot,
      });
      return { success: true };

    case "bury":
      world.network?.send("buryBones", { itemId, slot });
      return { success: true };

    case "wield":
    case "wear":
      world.network?.send("equipItem", {
        playerId: localPlayer.id,
        itemId,
        inventorySlot: slot,
      });
      return { success: true };

    case "drop":
      if (world.network?.dropItem) {
        world.network.dropItem(itemId, slot, quantity);
      } else {
        world.network?.send("dropItem", { itemId, slot, quantity });
      }
      return { success: true };

    case "examine": {
      // Note: getItem imported at top of file (ESM-compliant)
      const itemData = getItem(itemId);
      const examineText = itemData?.examine || `It's a ${itemId}.`;

      world.emit(EventType.UI_TOAST, {
        message: examineText,
        type: "info",
      });

      if (world.chat?.add) {
        world.chat.add({
          id: uuid(),
          from: "",
          body: examineText,
          createdAt: new Date().toISOString(),
          timestamp: Date.now(),
        });
      }
      return { success: true };
    }

    case "use":
      world.emit(EventType.ITEM_ACTION_SELECTED, {
        playerId: localPlayer.id,
        actionId: "use",
        itemId,
        slot,
      });
      return { success: true };

    case "cancel":
      // Intentional no-op - menu already closed
      return { success: true };

    default:
      // Only warn for truly unhandled actions, not intentional no-ops
      if (!SILENT_ACTIONS.has(action)) {
        console.warn(
          `[InventoryActionDispatcher] Unhandled action: "${action}" for item "${itemId}". ` +
          `Check inventoryActions in item manifest.`
        );
      }
      return { success: false, message: `Unhandled action: ${action}` };
  }
}
```

**Key Fix:** Changed from `require("@hyperscape/shared")` to proper ESM `import { getItem }` at top of file. Also added explicit handling for "cancel" action to avoid spurious warnings.

---

### 3.2 Update InventoryPanel to Use Dispatcher

**File:** `packages/client/src/game/panels/InventoryPanel.tsx`

Replace duplicated action handling with dispatcher:

```typescript
import { dispatchInventoryAction } from "../systems/InventoryActionDispatcher";
import {
  isFood, isPotion, isBone, usesWield, usesWear, isNotedItem,
  getPrimaryAction, HANDLED_INVENTORY_ACTIONS,
  type PrimaryActionType
} from "@hyperscape/shared";
import { CONTEXT_MENU_ITEM_COLOR } from "@hyperscape/shared";

// In the context menu useEffect handler:
const onCtxSelect = (e: Event) => {
  const ce = e as CustomEvent<{ targetId: string; actionId: string }>;
  const match = ce.detail.targetId.match(/inventory_slot_(\d+)/);
  if (!match) return;

  const slotIndex = parseInt(match[1], 10);
  if (Number.isNaN(slotIndex)) return;

  const it = slotItems[slotIndex];
  if (!it || !world) return;

  // Single dispatch point - no more duplicated if/else chains
  dispatchInventoryAction(ce.detail.actionId, {
    world,
    itemId: it.itemId,
    slot: slotIndex,
    quantity: it.quantity || 1,
  });
};

// In onPrimaryAction callback:
onPrimaryAction={(clickedItem, slotIndex, actionType) => {
  if (!world) return;

  dispatchInventoryAction(actionType, {
    world,
    itemId: clickedItem.itemId,
    slot: slotIndex,
    quantity: clickedItem.quantity || 1,
  });
}}
```

---

## Phase 4: OSRS Polish

### 4.1 Add Cancel Option to Context Menus

**File:** `packages/client/src/game/panels/InventoryPanel.tsx`

After building menuItems array, always add Cancel at the end:

```typescript
// After all menuItems are built (before dispatching event):
menuItems.push({
  id: "cancel",
  label: "Cancel",
  styledLabel: [{ text: "Cancel" }],
  enabled: true,
});
```

**Note:** The context menu component should handle "cancel" by simply closing the menu (no action).

---

### 4.2 Add "Nothing interesting happens." Handler

Already implemented, but ensure it's consistent:

```typescript
onInvalidTargetClick={() => {
  if (!world) return;

  const message = "Nothing interesting happens.";

  if (world.chat?.add) {
    world.chat.add({
      id: uuid(),
      from: "",
      body: message,
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
    });
  }

  // Cancel targeting mode
  setTargetingState(initialTargetingState);
  setTargetHover(null);
}}
```

---

## Phase 5: Memory Optimization

### 5.1 Memoize Item Data Lookups

**File:** `packages/client/src/game/panels/InventoryPanel.tsx`

Use React.useMemo for item data in render:

```typescript
// In DraggableInventorySlot component:
const itemData = useMemo(() => {
  return item ? getItem(item.itemId) : null;
}, [item?.itemId]);

const isItemNoted = useMemo(() => {
  return isNotedItem(itemData);
}, [itemData]);

const primaryAction = useMemo(() => {
  return getPrimaryAction(itemData, isItemNoted);
}, [itemData, isItemNoted]);
```

---

### 5.2 Stable Event Handler References

Ensure handlers don't recreate on every render:

```typescript
// Use useCallback for event handlers passed as props:
const handlePrimaryAction = useCallback((
  clickedItem: InventorySlotViewItem,
  slotIndex: number,
  actionType: PrimaryActionType
) => {
  if (!world) return;
  dispatchInventoryAction(actionType, {
    world,
    itemId: clickedItem.itemId,
    slot: slotIndex,
    quantity: clickedItem.quantity || 1,
  });
}, [world]);
```

---

## Phase 6: Testing

### 6.1 Unit Tests for Item Helpers

**New File:** `packages/shared/src/utils/__tests__/item-helpers.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  isFood, isPotion, isBone, usesWield, usesWear, isNotedItem,
  getPrimaryAction, getPrimaryActionFromManifest
} from "../item-helpers";

describe("item-helpers", () => {
  describe("isFood", () => {
    it("returns true for consumable with healAmount", () => {
      expect(isFood({ type: "consumable", healAmount: 10, id: "shrimp" })).toBe(true);
    });

    it("returns false for potions", () => {
      expect(isFood({ type: "consumable", healAmount: 10, id: "strength_potion" })).toBe(false);
    });

    it("returns false for null", () => {
      expect(isFood(null)).toBe(false);
    });
  });

  describe("getPrimaryAction", () => {
    it("returns manifest action when available", () => {
      const item = { id: "test", inventoryActions: ["Wield", "Use", "Drop"] };
      expect(getPrimaryAction(item, false)).toBe("wield");
    });

    it("returns use for noted items", () => {
      const item = { id: "test", inventoryActions: ["Eat", "Use", "Drop"] };
      expect(getPrimaryAction(item, true)).toBe("use");
    });

    it("falls back to heuristics when no manifest", () => {
      const food = { id: "shrimp", type: "consumable", healAmount: 10 };
      expect(getPrimaryAction(food, false)).toBe("eat");
    });
  });

  describe("isNotedItem", () => {
    it("returns true for items with isNoted flag", () => {
      expect(isNotedItem({ id: "bronze_sword", isNoted: true })).toBe(true);
    });

    it("returns true for items with _noted suffix", () => {
      expect(isNotedItem({ id: "bronze_sword_noted" })).toBe(true);
    });

    it("returns false for regular items", () => {
      expect(isNotedItem({ id: "bronze_sword" })).toBe(false);
    });
  });
});
```

---

### 6.2 Integration Test for Context Menu

**New File:** `packages/client/src/game/panels/__tests__/InventoryPanel.context-menu.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { dispatchInventoryAction } from "../../systems/InventoryActionDispatcher";

describe("InventoryPanel context menu", () => {
  it("dispatches eat action correctly", () => {
    const mockWorld = {
      getPlayer: () => ({ id: "player1" }),
      emit: vi.fn(),
      network: { send: vi.fn() },
    };

    const result = dispatchInventoryAction("eat", {
      world: mockWorld as any,
      itemId: "shrimp",
      slot: 0,
    });

    expect(result.success).toBe(true);
    expect(mockWorld.emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionId: "eat", itemId: "shrimp" })
    );
  });

  it("warns for unhandled actions", () => {
    const consoleSpy = vi.spyOn(console, "warn");
    const mockWorld = {
      getPlayer: () => ({ id: "player1" }),
      emit: vi.fn(),
      network: { send: vi.fn() },
    };

    const result = dispatchInventoryAction("invalid_action", {
      world: mockWorld as any,
      itemId: "test",
      slot: 0,
    });

    expect(result.success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unhandled action")
    );
  });
});
```

---

## Implementation Checklist

### Phase 1: Quick Wins (~30 min)
- [ ] Remove `isFiremakingItem` function (lines 150-158)
- [ ] Remove `isCookingItem` function (lines 161-164)
- [ ] Add unhandled action warning in context menu handler (~line 905)
- [ ] Change line 311 to use `isNotedItem()` helper instead of string check
- [ ] Run `bun run build:client` to verify

### Phase 2: Extract Utilities (~45 min)
- [ ] Create `packages/shared/src/utils/item-helpers.ts` with all helpers
- [ ] Add selective exports to `packages/shared/src/index.ts`
- [ ] Add `CONTEXT_MENU_COLORS` to `packages/shared/src/constants/GameConstants.ts`
- [ ] Run `bun run build:shared` to verify exports
- [ ] Update InventoryPanel to import from `@hyperscape/shared`

### Phase 3: Extract Dispatcher (~1 hr)
- [ ] Create `packages/client/src/game/systems/InventoryActionDispatcher.ts`
- [ ] Replace context menu useEffect handler (~line 787) with dispatcher call
- [ ] Replace onPrimaryAction callback (~line 1256) with dispatcher call
- [ ] Delete the duplicated if/else chains for eat, drink, bury, wield, wear, drop, examine, use
- [ ] Run `bun run dev` and manually test all actions

### Phase 4: OSRS Polish (~15 min)
- [ ] Add Cancel option to menuItems before dispatching context menu event
- [ ] Verify dispatcher handles "cancel" silently (already in plan)
- [ ] Test "Nothing interesting happens." still works for invalid targets

### Phase 5: Memory Optimization (~30 min)
- [ ] Add `useMemo` for `itemData` in DraggableInventorySlot (around line 295)
- [ ] Add `useMemo` for `isItemNoted` derived from itemData
- [ ] Add `useCallback` for `onPrimaryAction` in InventoryPanel (around line 1230)
- [ ] Use React DevTools to verify no unnecessary re-renders

### Phase 6: Testing (~1 hr)
- [ ] Create `packages/shared/src/utils/__tests__/item-helpers.test.ts`
- [ ] Create `packages/client/src/game/systems/__tests__/InventoryActionDispatcher.test.ts`
- [ ] Run `bun test` to verify all tests pass
- [ ] Manual QA: test all inventory actions in game

---

## Expected Final Scores

| Criterion | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Production Quality | 7/10 | 9/10 | Validation, no dead code, DRY |
| Best Practices | 7/10 | 9/10 | Shared utilities, consistent patterns |
| OWASP Security | 9/10 | 9/10 | Maintained |
| Game Studio Audit | 9/10 | 10/10 | Cancel option, polished |
| Memory Hygiene | 7/10 | 9/10 | Memoization, stable refs |
| SOLID Principles | 6/10 | 9/10 | SRP via extraction |
| **Overall** | **7.5/10** | **9.2/10** | +1.7 points |

---

## File Summary

| Action | File | Purpose |
|--------|------|---------|
| **CREATE** | `packages/shared/src/utils/item-helpers.ts` | Shared type detection helpers |
| **CREATE** | `packages/client/src/game/systems/InventoryActionDispatcher.ts` | Centralized action handling |
| **CREATE** | `packages/shared/src/utils/__tests__/item-helpers.test.ts` | Unit tests for helpers |
| **MODIFY** | `packages/client/src/game/panels/InventoryPanel.tsx` | Remove dead code, use dispatcher |
| **MODIFY** | `packages/shared/src/index.ts` | Export item helpers |
| **MODIFY** | `packages/shared/src/constants/GameConstants.ts` | Add context menu colors |

---

## Risk Assessment & Pitfalls

### High Risk (Test Carefully)

| Risk | Mitigation |
|------|------------|
| Breaking action handlers during extraction | Keep old code commented until dispatcher verified working |
| Import cycles between shared ↔ client | item-helpers.ts only imports types, no circular deps |
| Missing action in dispatcher switch | SILENT_ACTIONS set + default warning catches all cases |

### Medium Risk

| Risk | Mitigation |
|------|------------|
| React hook rule violation | DraggableInventorySlot is module-level component, hooks are safe |
| Stale closure in useCallback | Include `world` in dependency array |
| Type mismatch ClientWorld vs World | ClientWorld = InstanceType<typeof World>, same thing |

### Low Risk

| Risk | Mitigation |
|------|------------|
| Bundle size increase | Tree-shaking handles unused exports |
| Test coverage gap | Existing manual QA + new unit tests |

### What NOT to Change

- **Do not modify manifest files** - inventoryActions data is correct
- **Do not change EquipmentSystem.ts** - the fix is already correct
- **Do not refactor EntityContextMenu.tsx** - it's working correctly
- **Do not change network message formats** - server expects current format

---

## Verification Checklist (Post-Implementation)

Run these checks after implementing each phase:

### After Phase 1
```bash
# Verify dead code removed
grep -n "isFiremakingItem\|isCookingItem" packages/client/src/game/panels/InventoryPanel.tsx
# Should return nothing

# Verify build still works
bun run build:client
```

### After Phase 2
```bash
# Verify exports work
bun run build:shared

# Test import in a scratch file or console
# import { isFood, getPrimaryAction } from "@hyperscape/shared"
```

### After Phase 3
```bash
# Verify no duplicate action handling
grep -c "actionId.*eat" packages/client/src/game/panels/InventoryPanel.tsx
# Should be 0 (all handled in dispatcher)

# Run client to verify actions still work
bun run dev:client
```

### After All Phases
```bash
# Full build
bun run build

# Run tests
bun test

# Manual test: right-click items in inventory, verify all actions work
```

---

## Issues Identified and Addressed

| Issue | Found In | Fixed By |
|-------|----------|----------|
| Dead code (`isFiremakingItem`, `isCookingItem`) | InventoryPanel.tsx:150-164 | Phase 1.1 |
| No validation for manifest actions | Context menu handler | Phase 1.2 |
| Inconsistent noted item detection | Lines 311 vs 434 | Phase 1.3 |
| Helpers not in shared package | InventoryPanel.tsx | Phase 2.1 |
| Magic color string `#ff9040` | InventoryPanel.tsx:95 | Phase 2.2 |
| Duplicated action handling | Context menu + onPrimaryAction | Phase 3.1-3.2 |
| Missing Cancel option (OSRS) | Context menu | Phase 4.1 |
| No memoization of item lookups | DraggableInventorySlot | Phase 5.1 |
| `require()` in ESM code | Original dispatcher plan | Fixed in plan revision |

---

## Notes

- All changes are backward compatible
- Manifest data remains unchanged
- Server-side validation unaffected
- No breaking changes to existing functionality
- ESM-compliant (no require() calls)
- Follows existing codebase patterns for exports and constants
