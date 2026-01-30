# Crafting Skill — Research & Implementation Plan

## OSRS Crafting Overview

Crafting is a production skill that lets players create leather armor, dragonhide armor, jewelry, pottery, and glassware. The primary sub-categories relevant to our game are:

1. **Leather crafting** — Tanning hides into leather, then sewing leather into ranged armor using a needle + thread
2. **Dragonhide crafting** — Same process but with dragon leather for higher-tier ranged armor
3. **Jewelry crafting** — Using gold bars with optional gems at a furnace to create rings and amulets (OSRS also has silver jewelry — out of scope for us)
4. **Gem cutting** — Cutting uncut gems with a chisel into usable gems

### How It Works in OSRS

**Leather crafting:**
- Kill cows → get cowhide → take to tanner NPC (costs 1gp per hide) → get leather
- Use needle on leather (thread has 5 uses before being consumed) → crafting interface opens → select item → craft at 3 ticks (1.8s) per item
- Items: gloves (1), boots (7), cowl (9), vambraces (11), body (14), chaps (18)

**Dragonhide crafting:**
- Kill green dragons → get green dragonhide → tanner (20gp) → green dragon leather
- Use needle on leather → select item → craft at 3 ticks per item (requires 1-3 leathers per piece)
- Green d'hide: vambraces (57), chaps (60), body (63)

**Jewelry crafting (two-step process in OSRS):**
1. **Craft:** Use gold bar on furnace with mould + optional cut gem → produces unstrung amulet (u) or ring (3 ticks)
2. **String:** Use ball of wool on amulet (u) → wearable amulet (2 ticks, 4 XP)
3. **Enchant (for named amulets):** Cast enchant spell on strung amulet → named amulet (requires Magic)
   - Amulet of strength = Lvl-3 Enchant on ruby amulet (49 Magic)
   - Amulet of power = Lvl-4 Enchant on diamond amulet (57 Magic)
   - Amulet of glory = Lvl-5 Enchant on dragonstone amulet (68 Magic)
   - Amulet of fury = Lvl-6 Enchant on onyx amulet (87 Magic)

**Amulet of accuracy:** Quest reward only (Imp Catcher). Not craftable in OSRS.

**Boss rings (warrior, berserker, archers, seers):** Drop-only from Dagannoth Kings (1/128). Not craftable.

**Gem cutting:**
- Use chisel on uncut gem → cut gem (instant, no interface needed)

---

## What Already Exists in Our Game

### Finished Items (in `armor.json`, already wearable)

**Leather armor (6 pieces):**
- `leather_cowl`, `leather_body`, `leather_chaps`, `leather_boots`, `leather_gloves`, `leather_vambraces`

**Studded armor (3 pieces):**
- `coif`, `studded_body`, `studded_chaps`

**Green dragonhide (3 pieces):**
- `green_dhide_body`, `green_dhide_chaps`, `green_dhide_vambraces`

**Jewelry — Amulets (5):**
- `amulet_of_accuracy`, `amulet_of_strength`, `amulet_of_power`, `amulet_of_glory`, `amulet_of_fury`

**Jewelry — Rings (5):**
- `gold_ring`, `warrior_ring`, `berserker_ring`, `archers_ring`, `seers_ring`

### What Does NOT Exist Yet

- No `crafting` skill in the Skills interface (only: attack, strength, defense, constitution, ranged, magic, prayer, woodcutting, mining, fishing, firemaking, cooking, smithing, agility)
- No raw materials: cowhide, leather, dragon leather, gold bar, gems, thread, needle, chisel, moulds
- No tanning NPC or tanning mechanic
- No crafting interaction object (no spinning wheel, no crafting table — jewelry uses furnace which exists)
- No crafting recipes manifest (`recipes/crafting.json`)

### Existing Architecture to Reuse

The smithing/smelting pattern is the template:

1. **Recipe manifest** (`recipes/smithing.json`) — data-driven recipes
2. **ProcessingDataProvider** — singleton that loads recipes, provides accessor methods
3. **InteractionSystem** (e.g., `SmithingSystem.ts`) — handles player clicking object, validates, creates tick-based sessions
4. **Client Panel** (e.g., `SmithingPanel.tsx`) — shows available recipes, quantity selector, sends network request
5. **Event bridge** — forwards interface-open events to specific player
6. **XP award** — `SKILLS_XP_GAINED` event with `skill: "crafting"`

---

## Scope: What to Implement

**Goal:** Let players craft the leather, dragonhide, and jewelry items that already exist in the game. Do not add items beyond what we already have.

### Crafting Categories

#### 1. Leather Crafting (Needle + Leather at any location)

| Output | Crafting Level | Materials | XP |
|--------|---------------|-----------|-----|
| `leather_gloves` | 1 | 1 leather | 13.8 |
| `leather_boots` | 7 | 1 leather | 16.3 |
| `leather_cowl` | 9 | 1 leather | 18.5 |
| `leather_vambraces` | 11 | 1 leather | 22 |
| `leather_body` | 14 | 1 leather | 25 |
| `leather_chaps` | 18 | 1 leather | 27 |

#### 2. Studded Armor & Coif

**Studded:** Use steel studs directly on leather armor (no needle needed, 3 ticks):

| Output | Crafting Level | Materials | XP |
|--------|---------------|-----------|-----|
| `studded_body` | 41 | 1 leather_body + 1 steel_studs | 40 |
| `studded_chaps` | 44 | 1 leather_chaps + 1 steel_studs | 42 |

**Coif:** Standard leather crafting (needle + thread, 3 ticks):

| Output | Crafting Level | Materials | XP |
|--------|---------------|-----------|-----|
| `coif` | 38 | 1 leather | 37 |

#### 3. Green Dragonhide (Needle + Green dragon leather)

| Output | Crafting Level | Materials | XP |
|--------|---------------|-----------|-----|
| `green_dhide_vambraces` | 57 | 1 green_dragon_leather | 62 |
| `green_dhide_chaps` | 60 | 2 green_dragon_leather | 124 |
| `green_dhide_body` | 63 | 3 green_dragon_leather | 186 |

#### 4. Jewelry — Gold (Gold bar + optional gem at Furnace, 3 ticks)

These are OSRS-accurate crafting levels and XP values. See "Simplifications" section below for how we map these to our existing named items.

| Output | Crafting Level | Materials | XP | Mould |
|--------|---------------|-----------|-----|-------|
| `gold_ring` | 5 | 1 gold_bar | 15 | ring_mould |
| `amulet_of_accuracy` | 8 | 1 gold_bar | 30 | amulet_mould |
| `amulet_of_strength` | 50 | 1 gold_bar + 1 ruby | 85 | amulet_mould |
| `amulet_of_power` | 70 | 1 gold_bar + 1 diamond | 100 | amulet_mould |
| `amulet_of_glory` | 80 | 1 gold_bar + 1 dragonstone | 150 | amulet_mould |
| `amulet_of_fury` | 90 | 1 gold_bar + 1 onyx | 165 | amulet_mould |

#### 5. Gem Cutting (Chisel + uncut gem, instant)

| Output | Crafting Level | Material | XP |
|--------|---------------|----------|-----|
| `sapphire` | 20 | 1 uncut_sapphire | 50 |
| `emerald` | 27 | 1 uncut_emerald | 67.5 |
| `ruby` | 34 | 1 uncut_ruby | 85 |
| `diamond` | 43 | 1 uncut_diamond | 107.5 |
| `dragonstone` | 55 | 1 uncut_dragonstone | 137.5 |
| `onyx` | 67 | 1 uncut_onyx | 167.5 |

---

## Mapping Existing Items to Crafted Jewelry

### What OSRS Actually Does

In OSRS, jewelry crafting is a multi-step process:
1. **Craft** gem amulet (u) at furnace (Crafting skill)
2. **String** with ball of wool → wearable gem amulet (Crafting, 4 XP)
3. **Enchant** with Magic spell → named amulet (Magic skill, separate spell per tier)

The named amulets in our game correspond to enchanted versions:

| Our Item | OSRS Process | Crafting Lvl | Magic Lvl |
|----------|-------------|-------------|-----------|
| `amulet_of_accuracy` | Quest reward (Imp Catcher) — not crafted | N/A | N/A |
| `amulet_of_strength` | Craft ruby amulet (u) → string → Lvl-3 Enchant | 50 | 49 |
| `amulet_of_power` | Craft diamond amulet (u) → string → Lvl-4 Enchant | 70 | 57 |
| `amulet_of_glory` | Craft dragonstone amulet (u) → string → Lvl-5 Enchant | 80 | 68 |
| `amulet_of_fury` | Craft onyx amulet (u) → string → Lvl-6 Enchant | 90 | 87 |

Boss rings are drop-only in OSRS:

| Our Item | OSRS Source |
|----------|------------|
| `warrior_ring` | Dagannoth Rex drop (1/128) — **not craftable** |
| `berserker_ring` | Dagannoth Rex drop (1/128) — **not craftable** |
| `archers_ring` | Dagannoth Supreme drop (1/128) — **not craftable** |
| `seers_ring` | Dagannoth Prime drop (1/128) — **not craftable** |

### Our Simplifications

We make three deliberate simplifications:

1. **No enchanting step.** Crafting produces the final named amulet directly. We use the OSRS Crafting level requirements for the base gem amulet, but skip the separate Magic enchanting step. This avoids needing an enchanting system.

2. **No stringing step.** Crafting produces the wearable amulet directly. No ball of wool or unstrung intermediary.

3. **Amulet of accuracy is craftable.** In OSRS it's a quest reward, but since we don't have quests, we make it the gold amulet equivalent (level 8, gold bar only, 30 XP). This gives players a low-level amulet to craft.

---

## New Items Required

### Raw Materials (add to `resources.json`)

| ID | Name | Type | Stackable | Value | Source |
|----|------|------|-----------|-------|--------|
| `cowhide` | Cowhide | resource | false | 2 | Cow drops |
| `leather` | Leather | resource | false | 5 | Tanned cowhide (1gp) |
| `green_dragonhide` | Green dragonhide | resource | false | 1500 | Store/future dragon drops |
| `green_dragon_leather` | Green dragon leather | resource | false | 1800 | Tanned green dragonhide (20gp) |
| `gold_bar` | Gold bar | resource | false | 300 | Store (smelting gold ore is out of scope) |
| `uncut_sapphire` | Uncut sapphire | resource | false | 125 | Store/mining/drops |
| `uncut_emerald` | Uncut emerald | resource | false | 250 | Store/mining/drops |
| `uncut_ruby` | Uncut ruby | resource | false | 500 | Store/mining/drops |
| `uncut_diamond` | Uncut diamond | resource | false | 1500 | Store/drops |
| `uncut_dragonstone` | Uncut dragonstone | resource | false | 10000 | Store/drops |
| `uncut_onyx` | Uncut onyx | resource | false | 50000 | Store (very rare) |
| `sapphire` | Sapphire | resource | false | 250 | Cut from uncut |
| `emerald` | Emerald | resource | false | 500 | Cut from uncut |
| `ruby` | Ruby | resource | false | 1000 | Cut from uncut |
| `diamond` | Diamond | resource | false | 3000 | Cut from uncut |
| `dragonstone` | Dragonstone | resource | false | 20000 | Cut from uncut |
| `onyx` | Onyx | resource | false | 75000 | Cut from uncut |
| `steel_studs` | Steel studs | resource | false | 20 | Store (smithing out of scope for studs) |

### Tools (add to `tools.json`)

| ID | Name | Value | Purpose |
|----|------|-------|---------|
| `needle` | Needle | 5 | Required for leather/dragonhide crafting (not consumed) |
| `thread` | Thread | 4 | Has 5 uses; each craft action uses 1 charge; consumed after 5 crafts |
| `chisel` | Chisel | 10 | Required for gem cutting (not consumed) |
| `ring_mould` | Ring mould | 15 | Required for crafting rings at furnace (not consumed) |
| `amulet_mould` | Amulet mould | 15 | Required for crafting amulets at furnace (not consumed) |

### NPC — Tanner

A tanner NPC at or near the existing town. Clicking the tanner opens a tanning interface:
- Cowhide → Leather (1gp)
- Green dragonhide → Green dragon leather (20gp)

(Hard leather omitted — no items in the game use it. Can be added later with hardleather body.)

---

## Implementation Plan

### Phase 1: Add `crafting` Skill to the Game

**Files to modify:**
- `packages/shared/src/types/entities/entity-types.ts` — Add `crafting: SkillData` to `Skills` interface and `MobStats` type
- Database schema/migration — Add crafting level + XP columns
- Client skill panel — Add crafting to displayed skills
- Any skill iteration code that lists all skills

### Phase 2: Add Raw Materials & Tools

**Files to modify:**
- `packages/server/world/assets/manifests/items/resources.json` — Add cowhide, leather, green_dragonhide, green_dragon_leather, gold_bar, all uncut gems, all cut gems, steel_studs
- `packages/server/world/assets/manifests/items/tools.json` — Add needle, thread, chisel, ring_mould, amulet_mould
- `packages/server/world/assets/manifests/stores.json` — Add tools and some materials to shops
- `packages/server/world/assets/manifests/npcs.json` — Add cowhide to cow drop table, uncut gems to appropriate monster drop tables

### Phase 3: Add Crafting Recipes

**New file:** `packages/server/world/assets/manifests/recipes/crafting.json`

Recipe categories:
- `leather` — leather armor items
- `studded` — studded armor items
- `dragonhide` — green d'hide items
- `jewelry` — rings and amulets at furnace
- `gem_cutting` — instant gem cutting

Recipe format (follows smithing pattern):
```json
{
  "recipes": [
    {
      "output": "leather_body",
      "category": "leather",
      "inputs": [{ "item": "leather", "amount": 1 }],
      "tools": ["needle"],
      "consumables": [{ "item": "thread", "uses": 5 }],
      "level": 14,
      "xp": 25,
      "ticks": 3,
      "station": "none"
    },
    {
      "output": "gold_ring",
      "category": "jewelry",
      "inputs": [{ "item": "gold_bar", "amount": 1 }],
      "tools": ["ring_mould"],
      "level": 5,
      "xp": 15,
      "ticks": 3,
      "station": "furnace"
    },
    {
      "output": "sapphire",
      "category": "gem_cutting",
      "inputs": [{ "item": "uncut_sapphire", "amount": 1 }],
      "tools": ["chisel"],
      "level": 20,
      "xp": 50,
      "ticks": 2,
      "station": "none"
    }
  ]
}
```

**Tick timing (OSRS-accurate):**
- Leather/dragonhide/studded: **3 ticks** (1.8s) per craft
- Jewelry at furnace: **3 ticks** (1.8s) per craft
- Gem cutting: **2 ticks** (1.2s) per gem

### Phase 4: Extend ProcessingDataProvider

**File:** `packages/shared/src/data/ProcessingDataProvider.ts`

Add crafting recipe loading and accessor methods:
- `getCraftingRecipe(outputItemId)` → recipe data
- `getCraftableItemsFromInventory(inventory, level)` → available recipes
- `getCraftingRecipesByCategory(category)` → recipes grouped for UI
- `getCraftingLevel(outputItemId)`, `getCraftingXP(outputItemId)`

### Phase 5: CraftingSystem (Server Logic)

**New file:** `packages/shared/src/systems/shared/interaction/CraftingSystem.ts`

Follow the SmithingSystem pattern:
1. Player uses needle on leather (or clicks furnace with gold bar) → system detects intent
2. System validates: has tools, has materials, meets level
3. Emits `CRAFTING_INTERFACE_OPEN` with available recipes
4. Client selects item + quantity → sends `PROCESSING_CRAFTING_REQUEST`
5. Server creates `CraftingSession` with tick-based timing
6. Each completion: remove inputs, optionally consume thread (1 per 5 crafts), add output, grant XP
7. Session complete event

**Interaction triggers:**
- **Leather/dragonhide:** Player uses needle on leather item (or has both and clicks "Craft" from inventory right-click menu)
- **Jewelry:** Player uses gold bar on furnace (already has furnace interaction for smelting — add crafting as secondary option)
- **Gem cutting:** Player uses chisel on uncut gem (instant, no session needed, just consumes and produces)

### Phase 6: Tanning System

**New file or addition to existing NPC interaction:** `packages/shared/src/systems/shared/interaction/TanningSystem.ts`

Simple NPC shop-style interface:
1. Player clicks tanner NPC → opens tanning interface
2. Shows available hides with costs
3. Player selects hide type + quantity → instant conversion (deduct coins + hide, add leather)
4. No tick delay — tanning is instant in OSRS

### Phase 7: Client UI — CraftingPanel

**New file:** `packages/client/src/game/panels/CraftingPanel.tsx`

Follow SmithingPanel pattern:
- Groups recipes by category tabs (Leather, Studded, Dragonhide, Jewelry)
- Shows: item icon, name, level req, materials, XP
- Quantity selector: 1, 5, 10, All, Make X
- Sends network event to server

**New file:** `packages/client/src/game/panels/TanningPanel.tsx`

Simple grid of tannables with cost and "Tan" / "Tan All" buttons.

### Phase 8: Event Types & Network Wiring

**Files to modify:**
- `packages/shared/src/types/events/event-types.ts` — Add `CRAFTING_INTERACT`, `CRAFTING_INTERFACE_OPEN`, `CRAFTING_START`, `CRAFTING_COMPLETE`, `PROCESSING_CRAFTING_REQUEST`, `TANNING_INTERACT`, `TANNING_INTERFACE_OPEN`, `TANNING_REQUEST`
- `packages/shared/src/types/events/event-payloads.ts` — Add payload types
- `packages/server/src/systems/ServerNetwork/event-bridge.ts` — Wire crafting/tanning events to client
- Network handler registration for `processingCrafting` and `tanning` messages

### Phase 9: Cow Drops & Gem Drops

- Add `cowhide` to cow drop table (100% drop)
- Add uncut gems as rare drops from various monsters (sapphire from goblins, emerald from guards, etc.)
- Add uncut gems as rare mining drops (already an OSRS mechanic — chance of gem while mining any rock)

### Phase 10: Testing

- Unit tests for crafting recipes (validate manifest, level requirements, material costs)
- Integration test for leather crafting flow (have materials → craft → get item + XP)
- Integration test for jewelry crafting at furnace
- Integration test for gem cutting
- Integration test for tanning

---

## Key Design Decisions

### OSRS-Accurate

1. **Boss rings stay as drops** — warrior_ring, berserker_ring, archers_ring, seers_ring are not craftable. They come from Dagannoth Kings drops only, matching OSRS.

2. **Thread has 5 uses** — Each thread item has 5 charges. Each craft action (regardless of how many hides it uses) consumes 1 charge. After 5 crafts, the thread is consumed. Needle is not consumed. This matches OSRS exactly.

3. **Moulds not consumed** — Ring mould and amulet mould are reusable tools, matching OSRS.

4. **Tick timing** — Leather/dragonhide/studded: 3 ticks (1.8s). Jewelry: 3 ticks (1.8s). Gem cutting: 2 ticks (1.2s). All OSRS-accurate.

5. **Crafting levels and XP** — All level requirements and XP values match OSRS wiki data for the base crafting step (before enchanting).

6. **Tanning costs** — Leather 1gp, green dragon leather 20gp. OSRS-accurate.

### Simplifications (Deviations from OSRS)

7. **No enchanting step** — In OSRS, named amulets (strength, power, glory, fury) require a separate Magic enchanting step after crafting + stringing. We skip this entirely — crafting produces the final named item. This means a level 50 crafter gets amulet_of_strength without needing 49 Magic.

8. **No stringing step** — In OSRS, amulets are crafted as unstrung (u) versions and must be combined with a ball of wool. We skip this — crafting produces the wearable amulet directly.

9. **Amulet of accuracy is craftable** — In OSRS this is exclusively a quest reward (Imp Catcher). Since we don't have quests, we treat it as our gold amulet equivalent (level 8, gold bar only).

10. **Gem cutting uses 2-tick sessions** — In OSRS, gem cutting has no interface and is done by clicking rapidly. We use a 2-tick session for consistency with our processing system.

### Practical

11. **Furnace shared with smelting** — Jewelry crafting uses the same furnace object. The system detects whether the player has gold bars (crafting) vs ore (smelting) and opens the appropriate interface, or offers a choice.

12. **Tanning is instant** — No animation/wait. Click tanner, select hides, instant conversion. Costs coins. Matches OSRS.

13. **Gold bars from store only (for now)** — We don't have gold ore or gold mining. Players buy gold bars from the store. Can be expanded later when we add gold ore to mining.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/types/entities/entity-types.ts` | Modify | Add `crafting: SkillData` to Skills |
| `packages/server/world/assets/manifests/items/resources.json` | Modify | Add 17 new materials |
| `packages/server/world/assets/manifests/items/tools.json` | Modify | Add 5 new tools |
| `packages/server/world/assets/manifests/recipes/crafting.json` | **New** | ~25 crafting recipes |
| `packages/shared/src/data/ProcessingDataProvider.ts` | Modify | Add crafting recipe loading + accessors |
| `packages/shared/src/systems/shared/interaction/CraftingSystem.ts` | **New** | Main crafting logic (~400 lines) |
| `packages/shared/src/systems/shared/interaction/TanningSystem.ts` | **New** | Tanning NPC logic (~150 lines) |
| `packages/client/src/game/panels/CraftingPanel.tsx` | **New** | Crafting UI panel |
| `packages/client/src/game/panels/TanningPanel.tsx` | **New** | Tanning UI panel |
| `packages/shared/src/types/events/event-types.ts` | Modify | Add crafting/tanning events |
| `packages/shared/src/types/events/event-payloads.ts` | Modify | Add payload types |
| `packages/server/src/systems/ServerNetwork/event-bridge.ts` | Modify | Wire events to client |
| `packages/server/world/assets/manifests/stores.json` | Modify | Add crafting materials + tools to shops |
| `packages/server/world/assets/manifests/npcs.json` | Modify | Add cowhide/gem drops |
| Database migration | Modify | Add crafting skill columns |

---

## Sources

- [OSRS Wiki — Crafting](https://oldschool.runescape.wiki/w/Crafting)
- [OSRS Wiki — Jewellery](https://oldschool.runescape.wiki/w/Jewellery)
- [OSRS Wiki — Green dragonhide armour](https://oldschool.runescape.wiki/w/Green_dragonhide_armour)
- [OSRS Wiki — Leather armour](https://oldschool.runescape.wiki/w/Leather_armour)
- [OSRS Wiki — Crafting/Jewellery Calculator](https://oldschool.runescape.wiki/w/Calculator:Crafting/Jewellery)
- [OSRS Wiki — P2P Crafting Training](https://oldschool.runescape.wiki/w/Pay-to-play_Crafting_training)
