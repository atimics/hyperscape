# Plan: OSRS-Accurate Inventory Item Context Menus

## Overview

Make inventory item right-click context menus match OSRS behavior exactly, including proper menu options, correct ordering based on item type, and left-click default action execution.

---

## Research Summary (Verified Against OSRS Wiki)

### Sources Consulted
- [OSRS Wiki - Choose Option](https://oldschool.runescape.wiki/w/Choose_Option)
- [OSRS Wiki - Game Controls](https://oldschool.runescape.wiki/w/Game_controls)
- [OSRS Wiki - Worn Equipment](https://oldschool.runescape.wiki/w/Worn_Equipment)
- [RuneScape Wiki - Use](https://runescape.fandom.com/wiki/Use)

### Key OSRS Rules Confirmed

1. **"Use" is available on ALL items** - "Use is one of the functions that every item in the game serves" - even if it does nothing
2. **"Nothing interesting happens."** - Standard message for invalid Use combinations
3. **Left-click = top menu option** - "On an item in your inventory, left-clicking will: Wear, wield, or eat it, or 'use with' if no other action applies"
4. **Wield vs Wear distinction**:
   - **"Wield"** = weapons (main hand) AND shields/defenders (off-hand)
   - **"Wear"** = all other equipment (head, body, legs, cape, gloves, boots, ring, amulet, ammo)
5. **"Cancel"** - Traditionally the last option in all menus (can be hidden in newer clients)
6. **Orange item color** - Items in context menus are orange (#ff9040) ✓ (already implemented)

---

## Current State Analysis

### What's Already Implemented
- Orange item name color (`#ff9040`) ✓
- `styledLabel` format with colored item names ✓
- "Wear" for some equipment ✓
- Drop action ✓
- Examine action ✓
- "Use" option for tinderbox, logs, and raw food only

### What's Missing/Incorrect
1. **"Use" option not universal** - Should be on ALL items
2. **Menu order incorrect** - Should match OSRS priority per item type
3. **Missing "Eat" option** - Food items need "Eat" as primary action
4. **Missing "Drink" option** - Potions need "Drink" as primary action
5. **Missing "Wield" for weapons** - Currently all equipment uses "Wear"
6. **Missing "Wield" for shields** - Shields/defenders need "Wield" not "Wear"
7. **Left-click doesn't execute first option** - Should auto-execute top menu option
8. **Missing "Bury" for bones** - Bones need "Bury" as primary action
9. **No "Nothing interesting happens" feedback** - Invalid Use combinations need feedback

---

## OSRS Context Menu Rules (Verified)

### Menu Order by Item Type

**Food Items (healAmount > 0):**
1. Eat `<item>` (orange)
2. Use `<item>` (orange)
3. Drop `<item>` (orange)
4. Examine `<item>` (orange)
5. Cancel

**Potions:**
1. Drink `<item>` (orange)
2. Use `<item>` (orange)
3. Drop `<item>` (orange)
4. Examine `<item>` (orange)
5. Cancel

**Weapons (equipSlot: weapon, 2h) & Shields (equipSlot: shield):**
1. Wield `<item>` (orange)
2. Use `<item>` (orange)
3. Drop `<item>` (orange)
4. Examine `<item>` (orange)
5. Cancel

**Other Equipment (head, body, legs, cape, hands, feet, ring, neck, ammo):**
1. Wear `<item>` (orange)
2. Use `<item>` (orange)
3. Drop `<item>` (orange)
4. Examine `<item>` (orange)
5. Cancel

**Bones:**
1. Bury `<item>` (orange)
2. Use `<item>` (orange)
3. Drop `<item>` (orange)
4. Examine `<item>` (orange)
5. Cancel

**Logs/Tinderbox/Raw Food (firemaking/cooking items):**
1. Use `<item>` (orange)
2. Drop `<item>` (orange)
3. Examine `<item>` (orange)
4. Cancel

**Generic Items (no special action):**
1. Use `<item>` (orange)
2. Drop `<item>` (orange)
3. Examine `<item>` (orange)
4. Cancel

### Left-Click Behavior (Confirmed)
- Left-click on inventory item = execute the **first/top** context menu option
- Priority order: Eat/Drink/Bury → Wear/Wield → Use
- If no specific action, Use is default (enters targeting mode)

### Wield vs Wear Rules (Confirmed)
| Equipment Slot | Action |
|----------------|--------|
| weapon | Wield |
| 2h (two-handed) | Wield |
| shield | Wield |
| head | Wear |
| body | Wear |
| legs | Wear |
| cape | Wear |
| hands | Wear |
| feet | Wear |
| ring | Wear |
| neck | Wear |
| ammo | Wear |

---

## Implementation Plan

### Phase 1: Update Item Type Detection

Create helper functions in InventoryPanel.tsx:

```typescript
import type { Item } from "@hyperscape/shared";

/** Food items - have healAmount and are consumable */
function isFood(item: Item | null): boolean {
  if (!item) return false;
  return item.type === "consumable" &&
         typeof item.healAmount === "number" &&
         item.healAmount > 0 &&
         !item.id.includes("potion"); // Exclude potions
}

/** Potions - consumable items with "potion" in ID */
function isPotion(item: Item | null): boolean {
  if (!item) return false;
  return item.type === "consumable" && item.id.includes("potion");
}

/** Bones - items that can be buried for Prayer XP */
function isBone(item: Item | null): boolean {
  if (!item) return false;
  const boneIds = ["bones", "big_bones", "dragon_bones", "babydragon_bones",
                   "wyrm_bones", "wyvern_bones", "lava_dragon_bones"];
  return boneIds.includes(item.id) || item.id.endsWith("_bones");
}

/** Weapons - equipSlot is weapon or 2h, or has weaponType */
function isWeapon(item: Item | null): boolean {
  if (!item) return false;
  return item.equipSlot === "weapon" ||
         item.equipSlot === "2h" ||
         item.is2h === true ||
         item.weaponType != null;
}

/** Shields/Defenders - equipSlot is shield */
function isShield(item: Item | null): boolean {
  if (!item) return false;
  return item.equipSlot === "shield";
}

/** Equipment that uses "Wield" (weapons + shields) */
function usesWield(item: Item | null): boolean {
  return isWeapon(item) || isShield(item);
}

/** Equipment that uses "Wear" (all other equipment) */
function usesWear(item: Item | null): boolean {
  if (!item) return false;
  if (!item.equipable && !item.equipSlot) return false;
  return !usesWield(item);
}

/** Firemaking items - tinderbox and logs */
function isFiremakingItem(item: Item | null): boolean {
  if (!item) return false;
  return item.id === "tinderbox" ||
         item.id === "logs" ||
         item.id.endsWith("_logs") ||
         item.firemaking != null;
}

/** Cooking items - raw food */
function isCookingItem(item: Item | null): boolean {
  if (!item) return false;
  return item.id.startsWith("raw_") || item.cooking != null;
}

/** Bank notes - cannot be eaten/equipped */
function isNotedItem(item: Item | null): boolean {
  if (!item) return false;
  return item.isNoted === true || item.id.endsWith("_noted");
}
```

### Phase 2: Update Context Menu Builder

Replace current `onContextMenu` logic:

```typescript
onContextMenu={(e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!item) return;

  const itemData = getItem(item.itemId);
  const itemName = itemData?.name || item.itemId;
  const ITEM_COLOR = "#ff9040";
  const isNoted = isNotedItem(itemData);

  // Build menu items in OSRS order
  const menuItems: ContextMenuItem[] = [];

  // 1. Primary action (type-specific) - NOT for noted items
  if (!isNoted) {
    if (isFood(itemData)) {
      menuItems.push({
        id: "eat",
        label: `Eat ${itemName}`,
        styledLabel: [{ text: "Eat " }, { text: itemName, color: ITEM_COLOR }],
        enabled: true,
      });
    } else if (isPotion(itemData)) {
      menuItems.push({
        id: "drink",
        label: `Drink ${itemName}`,
        styledLabel: [{ text: "Drink " }, { text: itemName, color: ITEM_COLOR }],
        enabled: true,
      });
    } else if (isBone(itemData)) {
      menuItems.push({
        id: "bury",
        label: `Bury ${itemName}`,
        styledLabel: [{ text: "Bury " }, { text: itemName, color: ITEM_COLOR }],
        enabled: true,
      });
    } else if (usesWield(itemData)) {
      menuItems.push({
        id: "wield",
        label: `Wield ${itemName}`,
        styledLabel: [{ text: "Wield " }, { text: itemName, color: ITEM_COLOR }],
        enabled: true,
      });
    } else if (usesWear(itemData)) {
      menuItems.push({
        id: "wear",
        label: `Wear ${itemName}`,
        styledLabel: [{ text: "Wear " }, { text: itemName, color: ITEM_COLOR }],
        enabled: true,
      });
    }
  }

  // 2. Use (ALWAYS present for ALL items - OSRS rule)
  menuItems.push({
    id: "use",
    label: `Use ${itemName}`,
    styledLabel: [{ text: "Use " }, { text: itemName, color: ITEM_COLOR }],
    enabled: true,
  });

  // 3. Drop
  menuItems.push({
    id: "drop",
    label: `Drop ${itemName}`,
    styledLabel: [{ text: "Drop " }, { text: itemName, color: ITEM_COLOR }],
    enabled: true,
  });

  // 4. Examine (always last before Cancel)
  menuItems.push({
    id: "examine",
    label: `Examine ${itemName}`,
    styledLabel: [{ text: "Examine " }, { text: itemName, color: ITEM_COLOR }],
    enabled: true,
  });

  // Cancel is added by context menu system automatically

  const evt = new CustomEvent("contextmenu", {
    detail: {
      target: {
        id: `inventory_slot_${index}`,
        type: "inventory",
        name: itemName,
      },
      mousePosition: { x: e.clientX, y: e.clientY },
      items: menuItems,
    },
  });
  window.dispatchEvent(evt);
}}
```

### Phase 3: Add Left-Click Handler

Update the onClick handler to execute the first menu option:

```typescript
onClick={(e) => {
  // Handle targeting mode clicks first
  if (isTargetingActive && onTargetClick) {
    e.preventDefault();
    e.stopPropagation();
    if (isValidTarget && item) {
      onTargetClick(item, index);
    }
    return;
  }

  // Shift-click to drop instantly (OSRS-style)
  if (e.shiftKey && item && onShiftClick) {
    e.preventDefault();
    e.stopPropagation();
    onShiftClick(item, index);
    return;
  }

  // Left-click: execute first/primary context menu action
  if (item && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();

    const itemData = getItem(item.itemId);
    const isNoted = isNotedItem(itemData);
    const localPlayer = world?.getPlayer();

    if (!localPlayer || !world) return;

    // Execute primary action based on item type (same logic as context menu)
    if (!isNoted) {
      if (isFood(itemData)) {
        // Eat food
        world.emit(EventType.ITEM_ACTION_SELECTED, {
          playerId: localPlayer.id,
          actionId: "eat",
          itemId: item.itemId,
          slot: index,
        });
        return;
      } else if (isPotion(itemData)) {
        // Drink potion
        world.emit(EventType.ITEM_ACTION_SELECTED, {
          playerId: localPlayer.id,
          actionId: "drink",
          itemId: item.itemId,
          slot: index,
        });
        return;
      } else if (isBone(itemData)) {
        // Bury bones
        world.network?.send("buryBones", {
          itemId: item.itemId,
          slot: index,
        });
        return;
      } else if (usesWield(itemData) || usesWear(itemData)) {
        // Equip item (wield or wear)
        world.network?.send("equipItem", {
          playerId: localPlayer.id,
          itemId: item.itemId,
          inventorySlot: index,
        });
        return;
      }
    }

    // Default: enter Use targeting mode
    world.emit(EventType.ITEM_ACTION_SELECTED, {
      playerId: localPlayer.id,
      actionId: "use",
      itemId: item.itemId,
      slot: index,
    });
  }
}}
```

### Phase 4: Update Event Handler for Context Menu Actions

Add cases for new actions in `onCtxSelect`:

```typescript
// Handle eat action
if (ce.detail.actionId === "eat") {
  const localPlayer = world?.getPlayer();
  if (localPlayer) {
    world?.emit(EventType.ITEM_ACTION_SELECTED, {
      playerId: localPlayer.id,
      actionId: "eat",
      itemId: it.itemId,
      slot: slotIndex,
    });
  }
}

// Handle drink action
if (ce.detail.actionId === "drink") {
  const localPlayer = world?.getPlayer();
  if (localPlayer) {
    world?.emit(EventType.ITEM_ACTION_SELECTED, {
      playerId: localPlayer.id,
      actionId: "drink",
      itemId: it.itemId,
      slot: slotIndex,
    });
  }
}

// Handle bury action
if (ce.detail.actionId === "bury") {
  world?.network?.send("buryBones", {
    itemId: it.itemId,
    slot: slotIndex,
  });
}

// Handle wield/wear actions (both equip the item)
if (ce.detail.actionId === "wield" || ce.detail.actionId === "wear") {
  const localPlayer = world?.getPlayer();
  if (localPlayer && world?.network?.send) {
    world.network.send("equipItem", {
      playerId: localPlayer.id,
      itemId: it.itemId,
      inventorySlot: slotIndex,
    });
  }
}
```

### Phase 5: Handle "Nothing Interesting Happens"

Update targeting system to show message for invalid uses.

**Option A: In InventoryInteractionSystem** (if targeting is handled there)
```typescript
// When Use is selected on invalid target or cancelled without valid target
private showNothingInterestingHappens(): void {
  const message = "Nothing interesting happens.";

  // Show in chat (OSRS style)
  this.world.chat?.add({
    id: uuid(),
    from: "",
    body: message,
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
  });
}
```

**Option B: When targeting mode completes without action**
```typescript
// In targeting complete/cancel handler
if (targetingState.active && !validActionPerformed) {
  showNothingInterestingHappens();
}
```

---

## Files to Modify

### Primary Changes
1. **packages/client/src/game/panels/InventoryPanel.tsx**
   - Add item type detection helper functions
   - Update `onContextMenu` handler with OSRS-accurate menu building
   - Add left-click handler to execute primary action
   - Update `onCtxSelect` event handler for new actions (eat, drink, bury, wield, wear)

### Secondary Changes (if needed)
2. **packages/shared/src/systems/client/inventory/InventoryInteractionSystem.ts**
   - Handle "eat", "drink", "bury" action events
   - Show "Nothing interesting happens." for invalid Use targets

3. **packages/server/** (potentially)
   - Ensure "buryBones" message handler exists (for Prayer skill)
   - Ensure "eat"/"drink" action handlers work correctly

---

## Edge Cases to Handle

1. **Noted items** - Cannot Eat/Drink/Wear/Wield, only Use/Drop/Examine
2. **Quest items** - Some may have "Destroy" instead of "Drop"
3. **Stackable items** - Work the same as regular items
4. **Two-handed weapons** - Use "Wield" (equipSlot: "2h" or is2h: true)
5. **Ammunition** - Uses "Wear" (equipped to ammo slot, not held)

---

## Testing Checklist

### Context Menu Order
- [ ] Right-click cooked food shows: Eat, Use, Drop, Examine
- [ ] Right-click potion shows: Drink, Use, Drop, Examine
- [ ] Right-click sword/bow shows: Wield, Use, Drop, Examine
- [ ] Right-click shield shows: Wield, Use, Drop, Examine
- [ ] Right-click helmet/body/legs shows: Wear, Use, Drop, Examine
- [ ] Right-click arrows shows: Wear, Use, Drop, Examine
- [ ] Right-click bones shows: Bury, Use, Drop, Examine
- [ ] Right-click logs shows: Use, Drop, Examine
- [ ] Right-click tinderbox shows: Use, Drop, Examine
- [ ] Right-click raw fish shows: Use, Drop, Examine
- [ ] Right-click generic item shows: Use, Drop, Examine
- [ ] Right-click noted item shows: Use, Drop, Examine (NO Eat/Wear/Wield)

### Left-Click Behavior
- [ ] Left-click food → eats the food
- [ ] Left-click potion → drinks the potion
- [ ] Left-click bones → buries the bones
- [ ] Left-click weapon → equips (wields) the weapon
- [ ] Left-click armor → equips (wears) the armor
- [ ] Left-click shield → equips (wields) the shield
- [ ] Left-click logs → enters Use targeting mode
- [ ] Left-click generic item → enters Use targeting mode
- [ ] Left-click noted item → enters Use targeting mode

### Targeting Mode
- [ ] Using tinderbox on logs → starts fire
- [ ] Using logs on tinderbox → starts fire
- [ ] Using raw fish on fire → cooks fish
- [ ] Using item on invalid target → shows "Nothing interesting happens."

### Visual
- [ ] All item names are orange (#ff9040) in context menu
- [ ] Action text is white, item name is orange

---

## Notes

- Cancel option is automatically added by the context menu system
- OSRS has many more context menu options we're not implementing yet:
  - Release (pets)
  - Destroy (degradables, some quest items)
  - Read (scrolls, books)
  - Empty (vials, containers)
  - Check (degradable equipment charges)
- These can be added later as needed
