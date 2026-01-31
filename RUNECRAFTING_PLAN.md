# Runecrafting Skill Implementation Plan

## Table of Contents

1. [OSRS Research Summary](#1-osrs-research-summary)
2. [Codebase Analysis](#2-codebase-analysis)
3. [Scope Definition](#3-scope-definition)
4. [Implementation Plan](#4-implementation-plan)
5. [Complete File-by-File Changes](#5-complete-file-by-file-changes)
6. [Data Files](#6-data-files)
7. [Verification Checklist](#7-verification-checklist)

---

## 1. OSRS Research Summary

### How Runecrafting Works in OSRS

Runecrafting is a production skill where players convert **rune essence** or **pure essence** into **runes** at specialized **runic altars** scattered across the world.

**Core Loop:**
1. Obtain rune essence (from mining or purchasing)
2. Travel to a runic altar (one altar per rune type)
3. Click the altar — **all** essence in inventory converts to runes instantly
4. Bank runes, get more essence, repeat

**Key Mechanics:**
- **Instant conversion**: Unlike smelting/smithing, there is NO tick-based processing. Clicking the altar converts all essence at once.
- **One essence = one rune** (at base level). At higher levels, each essence can yield multiple runes.
- **No tools required**: No chisel, needle, or hammer needed. Just essence in inventory.
- **Two essence types**:
  - **Rune essence**: Can craft the basic 4 elemental runes + mind rune (levels 1-9)
  - **Pure essence**: Can craft ALL runes including higher-level ones like chaos

### Rune Data (Only the 6 We Need)

| Rune | Level | XP per Essence | Essence Type | 2x Rune Level | 3x Level | 4x Level |
|------|-------|----------------|--------------|----------------|----------|----------|
| Air | 1 | 5.0 | Rune or Pure | 11 | 22 | 33 |
| Mind | 2 | 5.5 | Rune or Pure | 14 | 28 | 42 |
| Water | 5 | 6.0 | Rune or Pure | 19 | 38 | 57 |
| Earth | 9 | 6.5 | Rune or Pure | 26 | 52 | 78 |
| Fire | 14 | 7.0 | Rune or Pure | 35 | 70 | 95 |
| Chaos | 35 | 8.5 | Pure only | 74 | — | — |

**Multi-rune formula**: At specific level thresholds, each essence produces multiple runes. The multiplier is 1 + (number of thresholds the player's level meets or exceeds). For example, at level 30 for air runes: thresholds met = [11, 22] → multiplier = 3 (1 base + 2 thresholds).

### What We DON'T Need (Out of Scope)

- Talismans and tiaras (altar access items) — our altars will be directly clickable
- Mysterious ruins / portal entry system — altars are placed directly in the world
- Combination runes (lava, mud, steam, etc.)
- Rune pouches (carry extra essence)
- The Abyss (dangerous shortcut)
- Ourania altar / ZMI altar
- Runes beyond the 6 we have: nature, law, death, blood, soul, wrath

---

## 2. Codebase Analysis

### Existing Runes (6 items in `runes.json`)

```
air_rune    — "A rune for casting air spells"     (value: 4, stackable, common)
water_rune  — "A rune for casting water spells"    (value: 4, stackable, common)
earth_rune  — "A rune for casting earth spells"    (value: 4, stackable, common)
fire_rune   — "A rune for casting fire spells"     (value: 4, stackable, common)
mind_rune   — "A rune for low-level combat spells" (value: 3, stackable, common)
chaos_rune  — "A rune for mid-level combat spells" (value: 90, stackable, uncommon)
```

All runes are `type: "misc"`, stackable to 10,000, with icons at `asset://icons/{name}.png`.

### Existing Rune Usage (SpellService + RuneService)

- `SpellService.ts` — Defines spells using these runes (Strike + Bolt tiers)
- `RuneService.ts` — Validates rune requirements, handles elemental staff infinite rune supplies
- Runes are already consumed in combat; runecrafting gives players a way to **produce** them

### What Does NOT Exist Yet

| Component | Status | Notes |
|-----------|--------|-------|
| Rune essence items | Missing | Need `rune_essence` and `pure_essence` items |
| Runecrafting altars | Missing | Prayer altar exists but is unrelated |
| Runecrafting skill in `Skills` interface | Missing | 16 skills exist, no runecrafting |
| `Skill.RUNECRAFTING` constant | Missing | Not in SkillsSystem Skill object |
| Runecrafting in `SKILL_DEFINITIONS` | Missing | Not in skill-icons.ts (but `SKILL_ICONS` legacy map has `runecrafting: "🔮"`) |
| Runecrafting DB columns | Missing | No `runecraftingLevel` / `runecraftingXp` in schema |
| Runecrafting event types | Missing | No `RUNECRAFTING_*` events |
| RunecraftingSystem | Missing | No system file |
| `"runecrafting_altar"` station type | Missing | `StationLocation.type` only has: bank, furnace, anvil, altar, range |

### Architecture Pattern: Instant Action (Not Panel-Based)

Unlike smelting/smithing which open a UI panel for recipe selection, runecrafting is **instant** — click altar, all essence converts at once. This is similar to how prayer altar works (click → instant effect → message). **No UI panel needed.**

**Simplified runecrafting flow:**
```
Player clicks runecrafting altar → RunecraftingAltarEntity.handleInteraction()
  → client sends "runecraftingSourceInteract" packet { altarId, runeType }
  → ServerNetwork.onRunecraftingSourceInteract() validates + emits RUNECRAFTING_INTERACT
  → RunecraftingSystem.handleAltarInteract()
    → checks inventory for essence
    → checks level requirement
    → calculates multi-rune multiplier
    → removes all valid essence from inventory
    → adds runes to inventory
    → grants XP via SKILLS_XP_GAINED event
    → emits RUNECRAFTING_COMPLETE (bridged to client for chat message)
```

---

## 3. Scope Definition

### In Scope

- **2 new items**: `rune_essence`, `pure_essence`
- **6 runecrafting altars** (one per rune type): air, mind, water, earth, fire, chaos
- **1 new skill**: Runecrafting added everywhere skills are registered (17+ touchpoints)
- **1 new system**: `RunecraftingSystem` (server-side, instant conversion)
- **1 new entity**: `RunecraftingAltarEntity` (world station entity)
- **1 new station type**: `"runecrafting_altar"` in StationLocation
- **Multi-rune support**: Higher levels = more runes per essence
- **Full pipeline**: Types, DB, entities, system, network, persistence, client deserialization
- **World placement**: Runecrafting altars placed in world areas

### Out of Scope

- Talismans / tiaras (altar access tokens)
- Combination runes
- Rune pouches
- Mining essence (essence available from stores/drops)
- Any runes beyond the existing 6
- **No UI panel** — runecrafting is instant, no recipe selection needed

---

## 4. Implementation Plan

### Phase 1: Data Foundation

**Step 1.1 — New item definitions**
- Add `rune_essence` and `pure_essence` to `resources.json` (existing file — avoids needing to update `REQUIRED_ITEM_FILES` in DataManager.ts)
- Both are non-stackable (OSRS-accurate: inventory limits = skill balance)
- Weight: 0

**Step 1.2 — Runecrafting recipe manifest** (`recipes/runecrafting.json`)
- Define each altar's rune type, level requirement, XP per essence, accepted essence types, and multi-rune thresholds

**Step 1.3 — Station manifest entry** (update `stations.json`)
- Add `"runecrafting_altar"` station type with model/scale/examine text

### Phase 2: Type System & Skill Registration (All Touchpoints)

**Step 2.1 — `Skills` interface** → `packages/shared/src/types/entities/entity-types.ts`
- Add `runecrafting: SkillData` to the Skills interface (line ~33)

**Step 2.2 — `Skill` constant** → `packages/shared/src/systems/shared/character/SkillsSystem.ts`
- Add `RUNECRAFTING: "runecrafting" as keyof Skills` to Skill object (line ~63)
- Add `Skill.RUNECRAFTING` to total level skill array (line ~383)
- Add `Skill.RUNECRAFTING` to total XP skill array (line ~416)
- Add `runecrafting` to `getSkills()` return mapping (line ~896)

**Step 2.3 — `SKILL_DEFINITIONS`** → `packages/shared/src/data/skill-icons.ts`
- Add runecrafting entry: `{ key: "runecrafting", label: "Runecrafting", icon: "🔮", category: "production", defaultLevel: 1 }` (line ~163)

**Step 2.4 — Skill name union type** → `packages/shared/src/types/systems/system-interfaces.ts`
- Add `| "runecrafting"` to the skill name union (line ~711)

**Step 2.5 — `StatsComponent`** → `packages/shared/src/components/StatsComponent.ts`
- Add `public runecrafting: SkillData;` property (line ~41)
- Add `this.runecrafting = initialData.runecrafting || { ...defaultSkill };` in constructor (line ~118)
- Add `runecrafting: this.runecrafting,` in serialize() (line ~149)

**Step 2.6 — `EventType` entries** → `packages/shared/src/types/events/event-types.ts`
- Add `RUNECRAFTING_INTERACT = "runecrafting:interact"` (after fletching events ~line 481)
- Add `RUNECRAFTING_COMPLETE = "runecrafting:complete"`

**Step 2.7 — Event payload interfaces** → `packages/shared/src/types/events/event-payloads.ts`
- Add `RunecraftingInteractPayload` interface
- Add `RunecraftingCompletePayload` interface
- Add both to the event payload type map (line ~1162)

**Step 2.8 — Station type union** → `packages/shared/src/types/world/world-types.ts`
- Add `"runecrafting_altar"` to `StationLocation.type` union (line ~262)

**Step 2.9 — `EntityType` enum** → `packages/shared/src/types/entities/entities.ts`
- Add `RUNECRAFTING_ALTAR = "runecrafting_altar"` to EntityType enum (line ~41)
- Add `RUNECRAFTING = "runecrafting"` to InteractionType enum (line ~59)

### Phase 3: Player Entity Initialization (All Paths)

**Step 3.1 — `PlayerEntity.ts`** → `packages/shared/src/entities/player/PlayerEntity.ts`
- Add `runecrafting: { level: 1, xp: 0 }` to default skills (line ~128)
- Add `runecrafting: playerData.skills.runecrafting || { level: 1, xp: 0 }` to statsComponent init (line ~216)
- Add `runecrafting: defaultSkill` to fallback skills (line ~366)
- Add `runecrafting: playerData.skills.runecrafting || defaultSkill` to addComponent("stats") (line ~516)

**Step 3.2 — `PlayerLocal.ts`** → `packages/shared/src/entities/player/PlayerLocal.ts`
- Add `runecrafting: { level: 1, xp: 0 }` to skills property default (line ~390)

**Step 3.3 — `player-types.ts`** → `packages/shared/src/types/entities/player-types.ts`
- Add `runecrafting: { level: old.runecraftingLevel || 1, xp: old.runecraftingXp || 0 }` in fromDatabaseRow (line ~189)
- Add `runecrafting: defaultSkill` in getDefaultSkills (line ~298)

**Step 3.4 — Character selection** → `packages/server/src/systems/ServerNetwork/character-selection.ts`
- Add runecrafting skill initialization from saved data (line ~692):
  ```
  runecrafting: {
    level: (savedData as { runecraftingLevel?: number }).runecraftingLevel || 1,
    xp: (savedData as { runecraftingXp?: number }).runecraftingXp || 0,
  },
  ```

### Phase 4: Database & Persistence

**Step 4.1 — DB schema** → `packages/server/src/database/schema.ts`
- Add `runecraftingLevel: integer("runecraftingLevel").default(1)` (after fletchingLevel ~line 210)
- Add `runecraftingXp: integer("runecraftingXp").default(0)` (after fletchingXp ~line 228)

**Step 4.2 — Database migration**
- Create `0031_add_runecrafting_skill.sql`:
  ```sql
  ALTER TABLE characters ADD COLUMN "runecraftingLevel" integer DEFAULT 1;
  ALTER TABLE characters ADD COLUMN "runecraftingXp" integer DEFAULT 0;
  ```
- Update `meta/_journal.json` with the new migration entry

**Step 4.3 — Server DB types** → `packages/server/src/shared/types/database.types.ts`
- Add `runecraftingLevel: number` and `runecraftingXp: number` to `PlayerRow` (after fletching ~line 52, 67)

**Step 4.4 — Shared network DB types** → `packages/shared/src/types/network/database.ts`
- Add `runecraftingLevel: number` and `runecraftingXp: number` (after fletching ~line 84-85)

**Step 4.5 — `PlayerRepository`** → `packages/server/src/database/repositories/PlayerRepository.ts`
- Add `if (data.runecraftingLevel !== undefined) { updateData.runecraftingLevel = data.runecraftingLevel; }` (after fletchingLevel ~line 136)
- Add `if (data.runecraftingXp !== undefined) { updateData.runecraftingXp = data.runecraftingXp; }` (after fletchingXp ~line 182)

**Step 4.6 — `CharacterRepository`** → `packages/server/src/database/repositories/CharacterRepository.ts`
- Add `runecraftingLevel: schema.characters.runecraftingLevel` to SELECT (line ~237)
- Add `runecraftingXp: schema.characters.runecraftingXp` to SELECT (line ~252)
- Add `runecrafting: { level: row.runecraftingLevel || 1, xp: row.runecraftingXp || 0 }` to return mapping (line ~289)

### Phase 5: Entity & World

**Step 5.1 — RunecraftingAltarEntity** (NEW FILE: `packages/shared/src/entities/world/RunecraftingAltarEntity.ts`)
- Modeled after `FurnaceEntity.ts` / `AltarEntity.ts`
- Constructor takes `runeType` from config (e.g., `"air"`, `"chaos"`)
- Context menu: "Craft-rune" (primary action), "Examine"
- `handleInteraction()` emits `RUNECRAFTING_INTERACT` with `{ playerId, altarId, runeType }`
- Also sends packet directly via `this.world.network?.send("runecraftingSourceInteract", ...)` for client-side
- Interaction type: `InteractionType.RUNECRAFTING`
- Interaction range: 2 tiles
- Visual: colored cube proxy (teal `0x00CED1`)

**Step 5.2 — Entity exports** → `packages/shared/src/entities/world/index.ts`
- Add `export * from "./RunecraftingAltarEntity";`

**Step 5.3 — EntityManager** → `packages/shared/src/systems/shared/entities/EntityManager.ts`
- Add import: `import { RunecraftingAltarEntity, type RunecraftingAltarEntityConfig } from "../../../entities/world/RunecraftingAltarEntity";`
- Add case in switch:
  ```
  case EntityType.RUNECRAFTING_ALTAR:
  case "runecrafting_altar":
    entity = new RunecraftingAltarEntity(this.world, config as RunecraftingAltarEntityConfig);
    break;
  ```

**Step 5.4 — Client-side entity deserialization** → `packages/shared/src/systems/shared/entities/Entities.ts`
- Add import for `RunecraftingAltarEntity` and config type
- Add `else if (data.type === "runecrafting_altar")` block in entity creation (after altar ~line 919):
  ```
  } else if (data.type === "runecrafting_altar") {
    const positionArray = (data.position || [0, 40, 0]) as [number, number, number];
    const name = data.name || "Runecrafting Altar";
    const config: RunecraftingAltarEntityConfig = {
      id: data.id,
      name: name,
      position: { x: positionArray[0], y: positionArray[1], z: positionArray[2] },
      runeType: (data as { runeType?: string }).runeType,
    };
    const entity = new RunecraftingAltarEntity(this.world, config);
    this.items.set(entity.id, entity);
    if (entity.init) {
      (entity.init() as Promise<void>)?.catch(err =>
        this.logger.error(`Entity ${entity.id} async init failed`, err),
      );
    }
    return entity;
  }
  ```

**Step 5.5 — StationSpawnerSystem** → `packages/shared/src/systems/shared/entities/StationSpawnerSystem.ts`
- Add `runecrafting_altar: EntityType.RUNECRAFTING_ALTAR` to entityTypeMap (line ~96)
- Pass `runeType` through station config to entity config (special handling like bank's `bankId`)

**Step 5.6 — World placement** → `packages/server/world/assets/manifests/world-areas.json`
- Place runecrafting altars in world area stations arrays
- Each entry includes `runeType` field

### Phase 6: Core System

**Step 6.1 — RunecraftingSystem** (NEW FILE: `packages/shared/src/systems/shared/interaction/RunecraftingSystem.ts`)
- Extends `SystemBase`
- Server-only (returns early on client)
- Subscribes to `RUNECRAFTING_INTERACT`
- `handleAltarInteract(data)`:
  1. Validate player exists and has skills
  2. Look up recipe from ProcessingDataProvider by `runeType`
  3. Check player's runecrafting level meets requirement
  4. Count essence in inventory (filter by allowed `essenceTypes`)
  5. If no valid essence → send "You don't have any rune essence." message
  6. Calculate multi-rune multiplier from level + thresholds
  7. Remove all valid essence from inventory
  8. Add runes to inventory (essenceCount * multiplier)
  9. Grant XP via SKILLS_XP_GAINED (xpPerEssence * essenceCount)
  10. Emit RUNECRAFTING_COMPLETE with crafted count for chat message

**Step 6.2 — System export** → `packages/shared/src/systems/shared/interaction/index.ts`
- Add `export * from "./RunecraftingSystem";`

**Step 6.3 — System registration** → `packages/shared/src/systems/shared/infrastructure/SystemLoader.ts`
- Add import: `import { RunecraftingSystem } from "..";` (line ~141)
- Add registration: `world.register("runecrafting", RunecraftingSystem);` (line ~351)

**Step 6.4 — ProcessingDataProvider** → `packages/shared/src/data/ProcessingDataProvider.ts`
- Add `RunecraftingManifest` and `RunecraftingRecipe` interfaces (line ~95)
- Add `private runecraftingManifest` property (line ~382)
- Add `loadRunecraftingRecipes(manifest)` method (line ~460)
- Add `buildRunecraftingDataFromManifest()` method with lookup Maps
- Add accessor methods: `getRunecraftingRecipe(runeType)`, `getRunecraftingRecipes()`

**Step 6.5 — DataManager recipe loading** → `packages/shared/src/data/DataManager.ts`
- Add CDN loading block for `recipes/runecrafting.json` (after fletching ~line 935)
- Add filesystem loading block for `recipes/runecrafting.json` (after fletching ~line 1071)
- Both paths: parse as `RunecraftingManifest`, call `processingDataProvider.loadRunecraftingRecipes()`

### Phase 7: Networking

**Step 7.1 — Packet definitions** → `packages/shared/src/platform/shared/packets.ts`
- Add `'runecraftingSourceInteract'` (client → server: player clicked altar)
- Add `'runecraftingComplete'` (server → client: crafting result feedback)

**Step 7.2 — ServerNetwork handler** → `packages/server/src/systems/ServerNetwork/index.ts`
- Add `onRunecraftingSourceInteract` handler:
  - Validate player exists
  - Validate payload: `altarId` (string, max 64), `runeType` (string, max 32)
  - Rate limit check
  - Emit `RUNECRAFTING_INTERACT` event with `{ playerId, altarId, runeType }`

**Step 7.3 — EventBridge** → `packages/server/src/systems/ServerNetwork/event-bridge.ts`
- Add `setupRunecraftingEvents()` method
- Bridge `RUNECRAFTING_COMPLETE` → send `runecraftingComplete` packet to player
- Call `this.setupRunecraftingEvents()` in `setupEventListeners()`

**Step 7.4 — ClientNetwork** → `packages/shared/src/systems/client/ClientNetwork.ts`
- Add `onRunecraftingComplete` handler
- Emit UI_MESSAGE with "You craft X runes." chat message

### Phase 8: Shared Package Exports

**Step 8.1 — Export from shared index** → `packages/shared/src/index.ts`
- Export `RunecraftingSystem` from systems
- Export any new payload types if needed by server

### Phase 9: Client UI (Minimal — No Panel Needed)

**Step 9.1 — XpLampPanel** → `packages/client/src/game/panels/XpLampPanel.tsx`
- Add `{ id: "runecrafting", label: "Runecrafting", icon: "🔮" }` to hardcoded SKILLS array (line ~46)

**Note**: The following client files auto-update from shared data and need NO changes:
- `SkillsPanel.tsx` — iterates `SKILL_DEFINITIONS` (auto-picks up new skills)
- `XPProgressOrbs.tsx` — uses `SKILL_ICONS` (auto-picks up new icons)
- `FloatingXPDrops.tsx` — uses `SKILL_ICONS` (auto-picks up new icons)
- `LevelUpNotification.tsx` — uses dynamic skill names from events

**Note**: No panel state management needed (no useModalPanels, InterfaceModals, useInterfaceEvents, or MobileInterfaceManager changes) since runecrafting has no UI panel.

---

## 5. Complete File-by-File Changes

### New Files (4)

| # | File | Description |
|---|------|-------------|
| 1 | `packages/server/world/assets/manifests/recipes/runecrafting.json` | Runecrafting recipe data |
| 2 | `packages/shared/src/entities/world/RunecraftingAltarEntity.ts` | World entity for runecrafting altars |
| 3 | `packages/shared/src/systems/shared/interaction/RunecraftingSystem.ts` | Core runecrafting logic |
| 4 | `packages/server/src/database/migrations/0031_add_runecrafting_skill.sql` | DB migration |

### Modified Files — Shared Package (20)

| # | File | Change | Lines |
|---|------|--------|-------|
| 1 | `types/entities/entity-types.ts` | Add `runecrafting: SkillData` to Skills interface | ~33 |
| 2 | `types/entities/entities.ts` | Add `RUNECRAFTING_ALTAR` to EntityType, `RUNECRAFTING` to InteractionType | ~41, ~59 |
| 3 | `types/events/event-types.ts` | Add `RUNECRAFTING_INTERACT`, `RUNECRAFTING_COMPLETE` | ~481 |
| 4 | `types/events/event-payloads.ts` | Add payload interfaces + type map entries | ~778, ~1166 |
| 5 | `types/systems/system-interfaces.ts` | Add `"runecrafting"` to skill name union | ~711 |
| 6 | `types/world/world-types.ts` | Add `"runecrafting_altar"` to StationLocation type | ~262 |
| 7 | `types/entities/player-types.ts` | Add runecrafting to `fromDatabaseRow()` + `getDefaultSkills()` | ~189, ~298 |
| 8 | `types/network/database.ts` | Add `runecraftingLevel`, `runecraftingXp` to network DB types | ~84 |
| 9 | `components/StatsComponent.ts` | Add `runecrafting` property, constructor init, serialize | ~41, ~118, ~149 |
| 10 | `data/skill-icons.ts` | Add runecrafting to `SKILL_DEFINITIONS` | ~163 |
| 11 | `data/ProcessingDataProvider.ts` | Add manifest type, loader, build method, accessors | ~95, ~382, ~460 |
| 12 | `data/DataManager.ts` | Add recipe loading (CDN + filesystem paths) | ~935, ~1071 |
| 13 | `systems/shared/character/SkillsSystem.ts` | Add to Skill constant, total level array, total XP array, getSkills() | ~63, ~383, ~416, ~896 |
| 14 | `systems/shared/entities/EntityManager.ts` | Add import + switch case for RunecraftingAltarEntity | ~20, ~399 |
| 15 | `systems/shared/entities/Entities.ts` | Add client-side entity deserialization for runecrafting_altar | ~88, ~920 |
| 16 | `systems/shared/entities/StationSpawnerSystem.ts` | Add entityTypeMap entry + runeType passthrough | ~96 |
| 17 | `systems/shared/interaction/index.ts` | Export RunecraftingSystem | ~31 |
| 18 | `systems/shared/infrastructure/SystemLoader.ts` | Import + register RunecraftingSystem | ~141, ~351 |
| 19 | `systems/client/ClientNetwork.ts` | Add `onRunecraftingComplete` handler | ~2100 |
| 20 | `platform/shared/packets.ts` | Add `runecraftingSourceInteract`, `runecraftingComplete` | ~148 |
| 21 | `entities/world/index.ts` | Export RunecraftingAltarEntity | ~11 |
| 22 | `entities/player/PlayerEntity.ts` | Add runecrafting defaults in 4 initialization paths | ~128, ~216, ~366, ~516 |
| 23 | `entities/player/PlayerLocal.ts` | Add runecrafting to skills default | ~390 |
| 24 | `index.ts` | Export RunecraftingSystem + types | varies |

### Modified Files — Server Package (8)

| # | File | Change | Lines |
|---|------|--------|-------|
| 1 | `database/schema.ts` | Add `runecraftingLevel`, `runecraftingXp` columns | ~210, ~228 |
| 2 | `database/migrations/meta/_journal.json` | Add migration entry | end |
| 3 | `shared/types/database.types.ts` | Add runecrafting to `PlayerRow` | ~52, ~67 |
| 4 | `database/repositories/PlayerRepository.ts` | Add field mappings to `savePlayerAsync()` | ~136, ~182 |
| 5 | `database/repositories/CharacterRepository.ts` | Add to `getCharacterSkills()` SELECT + return | ~237, ~252, ~289 |
| 6 | `systems/ServerNetwork/index.ts` | Add `onRunecraftingSourceInteract` handler | ~1833 |
| 7 | `systems/ServerNetwork/event-bridge.ts` | Bridge `RUNECRAFTING_COMPLETE`, add setup call | ~101, ~1208 |
| 8 | `systems/ServerNetwork/character-selection.ts` | Add runecrafting skill init from saved data | ~692 |

### Modified Files — Server Data (3)

| # | File | Change |
|---|------|--------|
| 1 | `world/assets/manifests/items/resources.json` | Add `rune_essence` and `pure_essence` items |
| 2 | `world/assets/manifests/stations.json` | Add `runecrafting_altar` station definition |
| 3 | `world/assets/manifests/world-areas.json` | Place runecrafting altars in world areas |

### Modified Files — Client Package (1)

| # | File | Change | Lines |
|---|------|--------|-------|
| 1 | `game/panels/XpLampPanel.tsx` | Add runecrafting to hardcoded SKILLS array | ~46 |

### Files Already Correct (1)

| File | Why |
|------|-----|
| `server/systems/ServerNetwork/handlers/commands.ts` | Already has `"runecrafting"` in validSkills array (line 1118) |

### Total: 4 new files + 36 modified files

---

## 6. Data Files

### Essence Items (added to `resources.json`)

```json
{
  "id": "rune_essence",
  "name": "Rune essence",
  "type": "misc",
  "stackable": false,
  "value": 4,
  "weight": 0,
  "description": "An essence for crafting basic runes",
  "examine": "A blank rune stone. Can be crafted into basic runes at a runecrafting altar.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/rune-essence.png",
  "inventoryActions": ["Use", "Drop", "Examine"]
},
{
  "id": "pure_essence",
  "name": "Pure essence",
  "type": "misc",
  "stackable": false,
  "value": 6,
  "weight": 0,
  "description": "A pure essence for crafting any rune",
  "examine": "A concentrated rune stone. Can be crafted into any rune at a runecrafting altar.",
  "tradeable": true,
  "rarity": "common",
  "modelPath": null,
  "iconPath": "asset://icons/pure-essence.png",
  "inventoryActions": ["Use", "Drop", "Examine"]
}
```

### `recipes/runecrafting.json`

```json
{
  "recipes": [
    {
      "runeType": "air",
      "runeItemId": "air_rune",
      "levelRequired": 1,
      "xpPerEssence": 5.0,
      "essenceTypes": ["rune_essence", "pure_essence"],
      "multiRuneLevels": [11, 22, 33, 44, 55, 66, 77, 88, 99]
    },
    {
      "runeType": "mind",
      "runeItemId": "mind_rune",
      "levelRequired": 2,
      "xpPerEssence": 5.5,
      "essenceTypes": ["rune_essence", "pure_essence"],
      "multiRuneLevels": [14, 28, 42, 56, 70, 84, 98]
    },
    {
      "runeType": "water",
      "runeItemId": "water_rune",
      "levelRequired": 5,
      "xpPerEssence": 6.0,
      "essenceTypes": ["rune_essence", "pure_essence"],
      "multiRuneLevels": [19, 38, 57, 76, 95]
    },
    {
      "runeType": "earth",
      "runeItemId": "earth_rune",
      "levelRequired": 9,
      "xpPerEssence": 6.5,
      "essenceTypes": ["rune_essence", "pure_essence"],
      "multiRuneLevels": [26, 52, 78]
    },
    {
      "runeType": "fire",
      "runeItemId": "fire_rune",
      "levelRequired": 14,
      "xpPerEssence": 7.0,
      "essenceTypes": ["rune_essence", "pure_essence"],
      "multiRuneLevels": [35, 70, 95]
    },
    {
      "runeType": "chaos",
      "runeItemId": "chaos_rune",
      "levelRequired": 35,
      "xpPerEssence": 8.5,
      "essenceTypes": ["pure_essence"],
      "multiRuneLevels": [74]
    }
  ]
}
```

### Station Entry (added to `stations.json`)

```json
{
  "type": "runecrafting_altar",
  "name": "Runecrafting Altar",
  "model": "asset://models/runecrafting-altar/runecrafting-altar.glb",
  "modelScale": 1.0,
  "modelYOffset": 0.25,
  "examine": "A mysterious altar pulsing with runic energy.",
  "flattenGround": true,
  "flattenPadding": 3.0,
  "flattenBlendRadius": 3.0
}
```

### World Placement (in `world-areas.json` stations arrays)

Each altar specifies its `runeType`:
```json
{
  "id": "air_runecrafting_altar_1",
  "type": "runecrafting_altar",
  "position": { "x": 110, "y": 0, "z": 95 },
  "runeType": "air"
}
```

Placement strategy:
- **Air altar** — Closest to spawn (level 1, most accessible)
- **Mind altar** — Near spawn area
- **Water altar** — Near a water/lake area
- **Earth altar** — Near mining area
- **Fire altar** — Near the furnace area
- **Chaos altar** — In a more dangerous/remote area (level 35)

---

## 7. Production Hardening (9/10 Audit Compliance)

This section details requirements beyond basic functionality that ensure a 9/10 minimum
rating against the full production audit criteria.

---

### 7.1 Security & Input Validation (OWASP / CWE)

**ServerNetwork handler (`onRunecraftingSourceInteract`) must validate:**

```
1. Player exists and is authenticated (socket.player check)
2. altarId — typeof string, max 64 chars, non-empty
3. runeType — typeof string, WHITELIST ONLY against ["air","mind","water","earth","fire","chaos"]
   (reject anything not in the whitelist — prevents injection and invalid recipe lookups)
4. Rate limit via canProcessRequest(playerId) — reuses existing pattern
5. Reject if player is in death state, in trade, or in bank transaction
```

**RunecraftingSystem (`handleAltarInteract`) server-side validation:**

```
1. Player entity exists in world
2. Recipe exists for runeType (from ProcessingDataProvider — server's own data, NOT from client)
3. Player's runecrafting level >= recipe.levelRequired (from server's stats, NOT client-sent)
4. Essence count from server's inventory state (NOT client-sent)
5. At least 1 valid essence in inventory
6. Verify inventory can receive runes BEFORE removing essence:
   - If player already has a stack of the target rune → always fits (stackable)
   - If no existing stack → need at least 1 free slot after essence removal
     (essence removal frees slots, so this is virtually always satisfied,
      but verify explicitly to prevent edge-case item loss)
```

**Key principle**: The client sends ONLY `{ altarId, runeType }`. Every other value
(recipe data, level, essence count, XP amount, rune quantity) is computed server-side
from authoritative state. The client has zero influence over outcomes.

---

### 7.2 Economic Integrity & Anti-Exploit

**Atomic-ish inventory mutation (matching existing pattern):**

The codebase processes inventory events synchronously within a single tick.
Follow the same pattern as CraftingSystem/FletchingSystem:

```
1. Re-verify essence count immediately before removal (guard against race conditions)
2. Emit INVENTORY_ITEM_REMOVED for each essence slot (synchronous within tick)
3. Emit INVENTORY_ITEM_ADDED for runes (synchronous within tick)
4. Emit SKILLS_XP_GAINED (synchronous within tick)
```

Per existing codebase comment: "A crash between events would require SIGKILL mid-function,
which is acceptable loss for a single craft action."

**Overflow protection:**
- Rune stack max is 10,000 (from runes.json `maxStackSize`).
  If adding crafted runes would exceed max stack, cap at maxStackSize.
  Remaining runes overflow to additional inventory slots or are lost
  with a "Your inventory is too full" message.
- Use `Math.min(currentStack + craftedAmount, maxStackSize)` for stack arithmetic.
- Quantity calculations must use integer math only — `Math.floor()` all multiplier results.

**Cooldown enforcement:**
- Use existing `canProcessRequest()` rate limiter in ServerNetwork handler.
- Add a server-side cooldown in RunecraftingSystem: minimum 1 tick (600ms) between
  successful crafts per player. Use `Map<string, number>` tracking last craft tick
  (matching EatDelayManager pattern).

**Audit logging:**
- Use `Logger.system("RunecraftingSystem", "runecraft_complete", { ... })` for every
  successful craft, matching FletchingSystem/CraftingSystem pattern:
  ```
  Logger.system("RunecraftingSystem", "runecraft_complete", {
    playerId,
    runeType,
    runeItemId,
    essenceConsumed: essenceCount,
    runesProduced: totalRunes,
    multiplier,
    xpAwarded: totalXp,
    playerLevel: currentLevel,
  });
  ```

---

### 7.3 Error Handling & Edge Cases

**RunecraftingSystem must handle:**

| Scenario | Response |
|----------|----------|
| Player not found | Silent return (player disconnected) |
| Recipe not found for runeType | Log warning, return (should never happen with whitelist) |
| Level too low | UI_MESSAGE: "You need a Runecrafting level of X to craft Y runes." |
| No valid essence | UI_MESSAGE: "You don't have any rune essence to craft with." |
| Wrong essence type (rune_essence at chaos altar) | UI_MESSAGE: "You need pure essence to craft chaos runes." |
| Inventory full (can't fit runes) | UI_MESSAGE: "Your inventory is too full." (don't remove essence) |
| Player in death state | Silent return |
| Player in trade/bank transaction | Silent return (transaction lock check) |
| Zero multiplier (should never happen) | Clamp to minimum 1 |

**Player disconnect cleanup:**
- Subscribe to `PLAYER_UNREGISTERED` to clean up any per-player state
  (cooldown map entry, cached skills). Since runecrafting is instant (no session),
  this is minimal — just `playerSkills.delete(playerId)` and cooldown map cleanup.

**Movement/combat cancellation:**
- Not needed for runecrafting since it's instant (no ongoing session).
  The action completes in a single function call within one tick.

---

### 7.4 Manifest Validation (ProcessingDataProvider)

`buildRunecraftingDataFromManifest()` must validate each recipe with accumulated errors
(matching existing fletching/crafting validation pattern):

```
For each recipe in manifest.recipes:
  1. runeType — typeof string, non-empty
  2. runeItemId — typeof string, exists in ITEMS manifest (cross-reference check)
  3. levelRequired — typeof number, isFinite, 1-99 range
  4. xpPerEssence — typeof number, isFinite, > 0
  5. essenceTypes — Array.isArray, non-empty, each entry exists in ITEMS manifest
  6. multiRuneLevels — Array.isArray, each entry is integer 1-99, ascending order
  7. No duplicate runeType across recipes
```

Skip invalid recipes (don't crash), accumulate errors, log warnings at end:
```
if (errors.length > 0) {
  console.warn(
    `[ProcessingDataProvider] Runecrafting manifest validation errors (${errors.length}):\n  ${errors.join("\n  ")}`
  );
}
```

**Runtime lookup structures (built at load time, not per-access):**
- `Map<string, RunecraftingRecipe>` keyed by `runeType` — O(1) recipe lookup
- `Set<string>` of all valid essence item IDs — O(1) essence type check

---

### 7.5 Testing Plan

**Unit tests** (`RunecraftingSystem.test.ts`) matching FletchingSystem.test.ts pattern:

| Test Case | What It Verifies |
|-----------|-----------------|
| Craft air runes with rune essence | Basic flow: removes essence, adds runes, grants XP |
| Craft air runes with pure essence | Pure essence works for basic runes |
| Craft chaos runes with pure essence | Higher-level rune works with correct essence |
| Reject rune essence at chaos altar | Wrong essence type → error message, no state change |
| Reject if level too low | Level check → error message, no state change |
| Reject if no essence in inventory | Empty inventory → error message |
| Multi-rune at level 11 (air) | 2x multiplier: N essence → 2N runes |
| Multi-rune at level 22 (air) | 3x multiplier: N essence → 3N runes |
| Mixed essence types at basic altar | Both rune and pure essence consumed |
| XP calculation accuracy | xpPerEssence * essenceCount = total XP |
| Inventory full prevention | Don't remove essence if runes can't be added |
| Rate limiting / cooldown | Second request within cooldown → rejected |
| Player disconnect cleanup | PLAYER_UNREGISTERED → state cleaned up |
| Manifest validation: missing fields | Invalid recipe skipped, valid ones loaded |
| Manifest validation: invalid runeItemId | Cross-reference failure logged, recipe skipped |

**Test setup pattern** (from existing FletchingSystem.test.ts):
- Mock world with event bus
- Mock inventory state
- Mock player skills
- Emit events, assert emitted events
- Use `processingDataProvider.loadRunecraftingRecipes()` with test manifest

---

### 7.6 Type Safety & TypeScript Rigor

- **No `any` types** — all payloads strongly typed
- **Discriminated union for essence validation**: recipe.essenceTypes is `string[]`,
  checked against inventory item IDs
- **Exhaustive runeType handling**: if ProcessingDataProvider returns null for a runeType,
  handle gracefully (never assume recipe exists)
- **Readonly recipe data**: `RunecraftingRecipe` interface should use `readonly` on arrays:
  ```typescript
  interface RunecraftingRecipe {
    readonly runeType: string;
    readonly runeItemId: string;
    readonly levelRequired: number;
    readonly xpPerEssence: number;
    readonly essenceTypes: readonly string[];
    readonly multiRuneLevels: readonly number[];
  }
  ```
- **Event payload interfaces** use strict types, not inline objects
- **Const assertion** on recipe lookup map (populated once at load time)

---

### 7.7 Memory & Performance

- **Zero allocations in handleAltarInteract hot path**:
  - Recipe lookup via pre-built Map (O(1), no allocation)
  - Essence counting iterates inventory array (unavoidable, but no temp arrays)
  - Multiplier calculation is pure arithmetic (no allocation)
  - Avoid creating intermediate arrays for essence slots — count and track indices in-place
- **Pre-built lookup structures**: Built once in `buildRunecraftingDataFromManifest()`,
  never rebuilt during gameplay
- **playerSkills cache**: Reuse existing `Map<string, Record<string, SkillData>>` pattern
  from SmeltingSystem (updated via SKILLS_UPDATED subscription)
- **No closures in event handlers**: Use bound methods or direct references

---

### 7.8 SOLID & Clean Code Compliance

| Principle | How It's Met |
|-----------|-------------|
| **Single Responsibility** | RunecraftingSystem handles ONLY runecrafting logic. Entity handles ONLY interaction/rendering. ProcessingDataProvider handles ONLY data loading. |
| **Open/Closed** | New runes added by editing runecrafting.json — no code changes needed. Multi-rune thresholds are data-driven. |
| **Liskov Substitution** | RunecraftingAltarEntity extends same base as FurnaceEntity/AltarEntity — substitutable in entity collections. RunecraftingSystem extends SystemBase. |
| **Interface Segregation** | RunecraftingSystem only subscribes to events it needs (RUNECRAFTING_INTERACT, SKILLS_UPDATED, PLAYER_UNREGISTERED). |
| **Dependency Inversion** | System depends on ProcessingDataProvider abstraction (not raw JSON). Uses EventType constants (not string literals). |
| **Information Expert** | RunecraftingSystem has the data (recipe + skills + inventory) to make crafting decisions. |
| **Low Coupling** | System communicates only via events. No direct references to InventorySystem or SkillsSystem. |
| **High Cohesion** | All runecrafting logic in one system. All altar entity logic in one entity class. |
| **Command Query Separation** | `handleAltarInteract()` mutates state (command). `getMultiplier()` returns data (query). |
| **Fail Fast** | Validate inputs at the top of handleAltarInteract, return early on any failure. |
| **Law of Demeter** | Access skills via cached playerSkills map, not by reaching through world → entity → component → data. |

---

### 7.9 Server Authority & Client Responsiveness

**Server-gated action** (correct classification for item creation):
- Client sends request, server decides outcome
- Client does NOT optimistically predict rune creation
- Client receives RUNECRAFTING_COMPLETE with result after server processes
- XP drops handled via existing SKILLS_XP_GAINED → XP_DROP_BROADCAST pipeline

**Client feedback flow:**
```
Client: clicks altar → sends "runecraftingSourceInteract" packet
Server: processes → emits RUNECRAFTING_COMPLETE + SKILLS_XP_GAINED
Server→Client: "runecraftingComplete" packet (chat message)
Server→Client: "inventorySync" packet (inventory update)
Server→Client: "xpDrop" packet (XP drop visual)
```

Latency is acceptable because:
1. Runecrafting is a deliberate action (walk to altar, click)
2. The result (chat message + XP drop + inventory update) arrives within one round-trip
3. No prediction needed — player expects a brief pause while server processes

---

### 7.10 Manifest-Driven Architecture

| Principle | How It's Met |
|-----------|-------------|
| **Data in files, not code** | All rune recipes, levels, XP values, multi-rune thresholds in runecrafting.json |
| **Schema validation at load time** | buildRunecraftingDataFromManifest() validates all fields |
| **Cross-reference validation** | runeItemId checked against ITEMS manifest, essenceTypes checked against ITEMS |
| **No magic values** | Level requirements, XP rates, thresholds all from manifest. Code uses recipe.levelRequired, not hardcoded `35`. |
| **Balance tuning without code changes** | Adjust any value in runecrafting.json — XP rates, level requirements, multi-rune thresholds |
| **Indexed at load time** | Map<runeType, recipe> built once, O(1) access during gameplay |

---

### 7.11 Criteria NOT Applicable (No Changes Needed)

These audit categories require no runecrafting-specific work because the feature
uses existing infrastructure that already handles them:

| Category | Why N/A |
|----------|---------|
| **Rendering / GPU** | Altar uses existing colored cube proxy system — no new shaders, textures, or GPU resources |
| **UI Framework Integration** | No new UI panel. Chat messages and XP drops use existing decoupled systems |
| **Spatial Partitioning** | Altar entities use existing spatial query system |
| **Double Buffering** | Uses existing tick-based game loop |
| **Object Pooling** | Altar entities are long-lived (not frequently spawned/despawned) |
| **Connection Pooling / PostgreSQL** | Uses existing Drizzle ORM + connection pool |
| **Distributed Systems** | Single-server architecture, no new distributed concerns |
| **AI / NPC Behavior** | No NPC involvement in runecrafting |
| **Pathfinding** | Uses existing walk-to-target system |
| **Network Resilience** | Instant action — no ongoing state to recover. If packet lost, player just clicks again |

---

## 8. Verification Checklist

### Build
- [ ] `bun run build:shared` — no errors
- [ ] `bun run build:server` — no errors
- [ ] `bun run build:client` — no errors

### Unit Tests
- [ ] All RunecraftingSystem.test.ts tests pass (15+ test cases per Section 7.5)
- [ ] Manifest validation tests pass (invalid/missing fields handled)

### Skill Registration
- [ ] Runecrafting appears in skills panel (auto from SKILL_DEFINITIONS)
- [ ] Runecrafting shows correct icon (🔮), label, and starting level (1)
- [ ] Runecrafting appears in XP lamp skill list
- [ ] XP drops display correctly when crafting runes
- [ ] Level-up notification fires correctly

### Gameplay
- [ ] Clicking air altar with rune essence → crafts air runes (level 1)
- [ ] Clicking air altar with pure essence → crafts air runes (level 1)
- [ ] Clicking chaos altar with rune essence → error (needs pure essence)
- [ ] Clicking chaos altar with pure essence + level 35 → crafts chaos runes
- [ ] Clicking altar with no essence → "You don't have any rune essence" message
- [ ] Clicking altar below level requirement → "You need level X Runecrafting" message
- [ ] Multi-rune: At level 11+, air altar produces 2 runes per essence
- [ ] All essence in inventory consumed in one click
- [ ] Runes stack correctly in inventory

### Security & Economic Integrity
- [ ] runeType validated against whitelist (invalid values rejected)
- [ ] Rate limiting prevents spam-clicking altar
- [ ] Invalid/malformed payloads rejected gracefully
- [ ] Audit log emitted for every successful craft (Logger.system)
- [ ] Rune stack overflow capped at maxStackSize (10,000)
- [ ] Essence NOT removed if runes can't be added (inventory full pre-check)
- [ ] Player in death/trade/bank state → silently rejected

### Persistence
- [ ] Runecrafting level persists across server restarts
- [ ] Runecrafting XP persists across server restarts
- [ ] New characters start at runecrafting level 1, XP 0
- [ ] DB migration runs without error

### Network
- [ ] No console warnings for unhandled packet types
- [ ] Runecrafting altar entities render on client (deserialized correctly)
- [ ] Player disconnect cleans up per-player state

### Edge Cases
- [ ] Full inventory (27 non-essence + 1 essence) — works (essence slot freed, runes stack)
- [ ] Mixed essence types at basic altar — all consumed
- [ ] Player walks away during interaction — no crash
- [ ] Multiple players at same altar — each crafts independently
- [ ] Server command `::setlevel runecrafting 50` — works (already in valid skills)
- [ ] Rapid double-click on altar — second request rate-limited

---

## Implementation Order Summary

1. **Data**: essence items in resources.json, recipes/runecrafting.json, stations.json
2. **Types (shared)**: Skills interface, EntityType, InteractionType, EventType, event payloads, StationLocation, skill name union, StatsComponent
3. **Player init (shared)**: PlayerEntity, PlayerLocal, player-types defaults
4. **Skill registration (shared)**: SkillsSystem Skill constant + arrays, SKILL_DEFINITIONS
5. **Database (server)**: schema, migration, journal, PlayerRow types (server + shared), PlayerRepository, CharacterRepository
6. **Character selection (server)**: character-selection.ts skill init
7. **Data loading (shared)**: ProcessingDataProvider types + methods, DataManager loading
8. **Entity (shared)**: RunecraftingAltarEntity, entity exports, EntityManager, Entities.ts deserialization, StationSpawnerSystem
9. **System (shared)**: RunecraftingSystem, system export, SystemLoader registration
10. **Network**: packets, ServerNetwork handler, EventBridge, ClientNetwork handler
11. **Exports**: shared index.ts
12. **World data**: Place altars in world-areas.json
13. **Client**: XpLampPanel hardcoded skills
14. **Build & Test**: `bun run build`, manual verification
