# Skill Quests Implementation Plan

This document outlines the plan for adding three new skill-based quests that pair gathering with processing skills.

## Events Available for Quest Tracking

| Action | Event | Key Payload Fields |
|--------|-------|-------------------|
| Gather resource | `INVENTORY_ITEM_ADDED` | `playerId`, `item.itemId`, `item.quantity` |
| Light fire | `FIRE_CREATED` | `playerId` |
| Cook food | `COOKING_COMPLETED` | `playerId`, `resultItemId`, `wasBurnt` |
| Smelt bar | `SMELTING_SUCCESS` | `playerId`, `barItemId` |
| Smith item | `SMITHING_COMPLETE` | `playerId`, `outputItemId` |

## Items Needed (All Exist)

| Category | Item ID | Name |
|----------|---------|------|
| Tool | `bronze_hatchet` | Bronze Hatchet |
| Tool | `tinderbox` | Tinderbox |
| Tool | `small_fishing_net` | Small Fishing Net |
| Tool | `bronze_pickaxe` | Bronze Pickaxe |
| Tool | `hammer` | Hammer |
| Resource | `logs` | Logs |
| Resource | `raw_shrimp` | Raw Shrimp |
| Resource | `copper_ore` | Copper Ore |
| Resource | `tin_ore` | Tin Ore |
| Resource | `bronze_bar` | Bronze Bar |
| Smithed | `bronze_sword` | Bronze Sword |
| Food | `shrimp` | Shrimp (cooked) |

---

## Quest 1: Lumberjack's First Lesson (Woodcutting + Firemaking)

**Objective**: Chop 6 logs, then burn 6 logs

```json
{
  "id": "lumberjacks_first_lesson",
  "name": "Lumberjack's First Lesson",
  "description": "Forester Wilma needs help gathering and burning firewood.",
  "difficulty": "novice",
  "questPoints": 1,
  "replayable": false,
  "requirements": { "quests": [], "skills": {}, "items": [] },
  "startNpc": "forester_wilma",
  "stages": [
    {
      "id": "start",
      "type": "dialogue",
      "description": "Speak to Forester Wilma",
      "npcId": "forester_wilma"
    },
    {
      "id": "chop_logs",
      "type": "gather",
      "description": "Chop 6 logs",
      "target": "logs",
      "count": 6
    },
    {
      "id": "burn_logs",
      "type": "interact",
      "description": "Light 6 fires",
      "target": "fire",
      "count": 6
    },
    {
      "id": "return",
      "type": "dialogue",
      "description": "Return to Forester Wilma",
      "npcId": "forester_wilma"
    }
  ],
  "onStart": {
    "items": [
      { "itemId": "bronze_hatchet", "quantity": 1 },
      { "itemId": "tinderbox", "quantity": 1 }
    ]
  },
  "rewards": {
    "questPoints": 1,
    "items": [
      { "itemId": "xp_lamp_100", "quantity": 1 }
    ],
    "xp": {}
  }
}
```

**NPC: Forester Wilma**

```json
{
  "id": "forester_wilma",
  "name": "Forester Wilma",
  "description": "A skilled woodcutter who maintains the forest near town",
  "category": "neutral",
  "faction": "town",
  "combat": { "attackable": false },
  "movement": { "type": "stationary", "speed": 0, "wanderRadius": 0 },
  "dialogue": {
    "entryNodeId": "greeting",
    "questOverrides": {
      "lumberjacks_first_lesson": {
        "in_progress": "progress_check",
        "ready_to_complete": "quest_complete",
        "completed": "post_quest"
      }
    },
    "nodes": [
      {
        "id": "greeting",
        "text": "Hello there! The village needs firewood, but I've hurt my back. Could you help?",
        "responses": [
          { "text": "Sure, what do you need?", "nextNodeId": "quest_offer" },
          { "text": "Not right now.", "nextNodeId": "farewell" }
        ]
      },
      {
        "id": "quest_offer",
        "text": "Chop 6 logs from the trees nearby, then light them on fire to prove you can do it. Here's a hatchet and tinderbox.",
        "responses": [
          { "text": "I'll help.", "nextNodeId": "quest_accepted", "effect": "startQuest:lumberjacks_first_lesson" },
          { "text": "Maybe later.", "nextNodeId": "farewell" }
        ]
      },
      {
        "id": "quest_accepted",
        "text": "Thank you! The trees are just outside town. Use the tinderbox on the logs to light a fire."
      },
      {
        "id": "progress_check",
        "text": "How's it going? Chopped and burned those logs yet?",
        "responses": [
          { "text": "Still working on it.", "nextNodeId": "encouragement" }
        ]
      },
      {
        "id": "encouragement",
        "text": "Keep at it! Chop trees for logs, then use the tinderbox on the logs to light fires."
      },
      {
        "id": "quest_complete",
        "text": "Wonderful! You've proven you can gather and use firewood. Here's your reward.",
        "effect": "completeQuest:lumberjacks_first_lesson"
      },
      {
        "id": "post_quest",
        "text": "Thanks again for the help! Feel free to keep chopping trees anytime."
      },
      {
        "id": "farewell",
        "text": "Come back if you change your mind."
      }
    ]
  }
}
```

---

## Quest 2: Fresh Catch (Fishing + Cooking)

**Objective**: Catch 6 raw shrimp, then cook 6 shrimp

```json
{
  "id": "fresh_catch",
  "name": "Fresh Catch",
  "description": "Fisherman Pete needs help catching and cooking fish.",
  "difficulty": "novice",
  "questPoints": 1,
  "replayable": false,
  "requirements": { "quests": [], "skills": {}, "items": [] },
  "startNpc": "fisherman_pete",
  "stages": [
    {
      "id": "start",
      "type": "dialogue",
      "description": "Speak to Fisherman Pete",
      "npcId": "fisherman_pete"
    },
    {
      "id": "catch_shrimp",
      "type": "gather",
      "description": "Catch 6 raw shrimp",
      "target": "raw_shrimp",
      "count": 6
    },
    {
      "id": "cook_shrimp",
      "type": "interact",
      "description": "Cook 6 shrimp",
      "target": "shrimp",
      "count": 6
    },
    {
      "id": "return",
      "type": "dialogue",
      "description": "Return to Fisherman Pete",
      "npcId": "fisherman_pete"
    }
  ],
  "onStart": {
    "items": [
      { "itemId": "small_fishing_net", "quantity": 1 }
    ]
  },
  "rewards": {
    "questPoints": 1,
    "items": [
      { "itemId": "xp_lamp_100", "quantity": 1 }
    ],
    "xp": {}
  }
}
```

**NPC: Fisherman Pete**

```json
{
  "id": "fisherman_pete",
  "name": "Fisherman Pete",
  "description": "A weathered fisherman who supplies the local market",
  "category": "neutral",
  "faction": "town",
  "combat": { "attackable": false },
  "movement": { "type": "stationary", "speed": 0, "wanderRadius": 0 },
  "dialogue": {
    "entryNodeId": "greeting",
    "questOverrides": {
      "fresh_catch": {
        "in_progress": "progress_check",
        "ready_to_complete": "quest_complete",
        "completed": "post_quest"
      }
    },
    "nodes": [
      {
        "id": "greeting",
        "text": "Ahoy! The tavern needs cooked shrimp. Care to help an old fisherman?",
        "responses": [
          { "text": "What do you need?", "nextNodeId": "quest_offer" },
          { "text": "Not today.", "nextNodeId": "farewell" }
        ]
      },
      {
        "id": "quest_offer",
        "text": "Catch 6 shrimp from the fishing spots, then cook them on a fire or range. Here's a net.",
        "responses": [
          { "text": "I'll do it.", "nextNodeId": "quest_accepted", "effect": "startQuest:fresh_catch" },
          { "text": "Maybe another time.", "nextNodeId": "farewell" }
        ]
      },
      {
        "id": "quest_accepted",
        "text": "Excellent! The fishing spots are by the water. Cook the shrimp on a fire when you're done."
      },
      {
        "id": "progress_check",
        "text": "Any luck with the fishing and cooking?",
        "responses": [
          { "text": "Still working on it.", "nextNodeId": "encouragement" }
        ]
      },
      {
        "id": "encouragement",
        "text": "Use the net at fishing spots for shrimp, then cook them on any fire."
      },
      {
        "id": "quest_complete",
        "text": "Perfect! Those shrimp look delicious. The tavern will be pleased. Here's your reward.",
        "effect": "completeQuest:fresh_catch"
      },
      {
        "id": "post_quest",
        "text": "Thanks for the help! Come back anytime you want to fish."
      },
      {
        "id": "farewell",
        "text": "Come back if you want to help."
      }
    ]
  }
}
```

---

## Quest 3: Torvin's Tools (Mining + Smithing)

**Objective**: Mine ore, smelt bars, then forge a complete set of bronze tools

Bars needed: sword (1) + hatchet (1) + pickaxe (2) = 4 bronze bars = 4 copper + 4 tin

```json
{
  "id": "torvins_tools",
  "name": "Torvin's Tools",
  "description": "The dwarf Torvin needs help forging a set of bronze tools.",
  "difficulty": "novice",
  "questPoints": 1,
  "replayable": false,
  "requirements": { "quests": [], "skills": {}, "items": [] },
  "startNpc": "torvin",
  "stages": [
    {
      "id": "start",
      "type": "dialogue",
      "description": "Speak to Torvin",
      "npcId": "torvin"
    },
    {
      "id": "mine_copper",
      "type": "gather",
      "description": "Mine 4 copper ore",
      "target": "copper_ore",
      "count": 4
    },
    {
      "id": "mine_tin",
      "type": "gather",
      "description": "Mine 4 tin ore",
      "target": "tin_ore",
      "count": 4
    },
    {
      "id": "smelt_bronze",
      "type": "interact",
      "description": "Smelt 4 bronze bars",
      "target": "bronze_bar",
      "count": 4
    },
    {
      "id": "smith_sword",
      "type": "interact",
      "description": "Smith a bronze sword",
      "target": "bronze_sword",
      "count": 1
    },
    {
      "id": "smith_hatchet",
      "type": "interact",
      "description": "Smith a bronze hatchet",
      "target": "bronze_hatchet",
      "count": 1
    },
    {
      "id": "smith_pickaxe",
      "type": "interact",
      "description": "Smith a bronze pickaxe",
      "target": "bronze_pickaxe",
      "count": 1
    },
    {
      "id": "return",
      "type": "dialogue",
      "description": "Return to Torvin",
      "npcId": "torvin"
    }
  ],
  "onStart": {
    "items": [
      { "itemId": "bronze_pickaxe", "quantity": 1 },
      { "itemId": "hammer", "quantity": 1 }
    ]
  },
  "rewards": {
    "questPoints": 1,
    "items": [
      { "itemId": "xp_lamp_100", "quantity": 1 }
    ],
    "xp": {}
  }
}
```

**NPC: Torvin**

```json
{
  "id": "torvin",
  "name": "Torvin",
  "description": "A gruff dwarven smith who runs the local forge",
  "category": "neutral",
  "faction": "town",
  "combat": { "attackable": false },
  "movement": { "type": "stationary", "speed": 0, "wanderRadius": 0 },
  "dialogue": {
    "entryNodeId": "greeting",
    "questOverrides": {
      "torvins_tools": {
        "in_progress": "progress_check",
        "ready_to_complete": "quest_complete",
        "completed": "post_quest"
      }
    },
    "nodes": [
      {
        "id": "greeting",
        "text": "Hail, traveler! I've got orders piling up and not enough hands. Care to learn the trade?",
        "responses": [
          { "text": "What do you need?", "nextNodeId": "quest_offer" },
          { "text": "Not right now.", "nextNodeId": "farewell" }
        ]
      },
      {
        "id": "quest_offer",
        "text": "I need a full set of bronze tools - a sword, hatchet, and pickaxe. Mine the ore, smelt the bars, and forge them yourself. Here's a pickaxe and hammer to get started.",
        "responses": [
          { "text": "I'll do it.", "nextNodeId": "quest_accepted", "effect": "startQuest:torvins_tools" },
          { "text": "That sounds like a lot of work.", "nextNodeId": "farewell" }
        ]
      },
      {
        "id": "quest_accepted",
        "text": "Good! You'll need 4 copper and 4 tin ore. Smelt them at the furnace, then use the anvil to forge the tools."
      },
      {
        "id": "progress_check",
        "text": "How's the smithing coming along?",
        "responses": [
          { "text": "Still working on it.", "nextNodeId": "encouragement" }
        ]
      },
      {
        "id": "encouragement",
        "text": "Copper rocks are orange, tin is grey. Smelt the ore at the furnace, then hammer the bars into shape at the anvil."
      },
      {
        "id": "quest_complete",
        "text": "Ha! Fine work for a beginner. You've got the makings of a smith. Keep the tools - you've earned them.",
        "effect": "completeQuest:torvins_tools"
      },
      {
        "id": "post_quest",
        "text": "Good to see you again! Feel free to use the forge anytime."
      },
      {
        "id": "farewell",
        "text": "Come back when you're ready to work."
      }
    ]
  }
}
```

---

## Implementation: QuestSystem Changes

Add handlers for `gather` and `interact` stage types:

```typescript
// In init() - add these subscriptions:

// Track item gathering (woodcutting, fishing, mining)
this.subscribe(EventType.INVENTORY_ITEM_ADDED, (data: {
  playerId: string;
  item: { itemId: string; quantity: number }
}) => {
  this.handleGatherStage(data.playerId, data.item.itemId, data.item.quantity);
});

// Track fires lit (firemaking)
this.subscribe(EventType.FIRE_CREATED, (data: { playerId: string }) => {
  this.handleInteractStage(data.playerId, "fire", 1);
});

// Track cooking (cooking)
this.subscribe(EventType.COOKING_COMPLETED, (data: {
  playerId: string;
  resultItemId: string;
  wasBurnt: boolean
}) => {
  if (!data.wasBurnt) {
    this.handleInteractStage(data.playerId, data.resultItemId, 1);
  }
});

// Track smelting (smelting ore into bars)
this.subscribe(EventType.SMELTING_SUCCESS, (data: {
  playerId: string;
  barItemId: string
}) => {
  this.handleInteractStage(data.playerId, data.barItemId, 1);
});

// Track smithing (forging bars into items)
this.subscribe(EventType.SMITHING_COMPLETE, (data: {
  playerId: string;
  outputItemId: string
}) => {
  this.handleInteractStage(data.playerId, data.outputItemId, 1);
});
```

```typescript
/**
 * Handle gather stage progress (woodcutting, fishing, mining)
 */
private handleGatherStage(playerId: string, itemId: string, quantity: number): void {
  const state = this.playerStates.get(playerId);
  if (!state) return;

  for (const [questId, progress] of state.activeQuests) {
    const definition = this.questDefinitions.get(questId);
    if (!definition) continue;

    const stage = definition.stages.find(s => s.id === progress.currentStage);
    if (!stage || stage.type !== "gather" || stage.target !== itemId) continue;

    const gathered = (progress.stageProgress.gathered || 0) + quantity;
    progress.stageProgress = { ...progress.stageProgress, gathered };

    this.logger.info(`[QuestSystem] ${playerId} gathered ${itemId}: ${gathered}/${stage.count}`);

    if (stage.count && gathered >= stage.count) {
      this.advanceToNextStage(playerId, questId, progress, definition);
    }

    this.saveQuestProgress(playerId, questId, progress.currentStage, progress.stageProgress, false);
    this.emitTypedEvent(EventType.QUEST_PROGRESSED, {
      playerId,
      questId,
      stage: progress.currentStage,
      progress: progress.stageProgress,
      description: stage.description,
    });
  }
}

/**
 * Handle interact stage progress (firemaking, cooking, smelting)
 */
private handleInteractStage(playerId: string, target: string, count: number): void {
  const state = this.playerStates.get(playerId);
  if (!state) return;

  for (const [questId, progress] of state.activeQuests) {
    const definition = this.questDefinitions.get(questId);
    if (!definition) continue;

    const stage = definition.stages.find(s => s.id === progress.currentStage);
    if (!stage || stage.type !== "interact" || stage.target !== target) continue;

    const interacted = (progress.stageProgress.interacted || 0) + count;
    progress.stageProgress = { ...progress.stageProgress, interacted };

    this.logger.info(`[QuestSystem] ${playerId} interacted ${target}: ${interacted}/${stage.count}`);

    if (stage.count && interacted >= stage.count) {
      this.advanceToNextStage(playerId, questId, progress, definition);
    }

    this.saveQuestProgress(playerId, questId, progress.currentStage, progress.stageProgress, false);
    this.emitTypedEvent(EventType.QUEST_PROGRESSED, {
      playerId,
      questId,
      stage: progress.currentStage,
      progress: progress.stageProgress,
      description: stage.description,
    });
  }
}

/**
 * Advance to next stage or mark ready to complete
 */
private advanceToNextStage(
  playerId: string,
  questId: string,
  progress: QuestProgress,
  definition: QuestDefinition
): void {
  const stageIndex = definition.stages.findIndex(s => s.id === progress.currentStage);
  const nextStage = definition.stages[stageIndex + 1];

  if (nextStage && nextStage.type !== "dialogue") {
    // Move to next non-dialogue stage
    progress.currentStage = nextStage.id;
    progress.stageProgress = {};

    this.emitTypedEvent(EventType.CHAT_MESSAGE, {
      playerId,
      message: `New objective: ${nextStage.description}`,
      type: "game",
    });
  } else {
    // Final stage is dialogue - quest is ready to complete
    progress.status = "ready_to_complete";

    this.emitTypedEvent(EventType.CHAT_MESSAGE, {
      playerId,
      message: `Quest objective complete! Return to ${definition.startNpc.replace(/_/g, " ")}.`,
      type: "game",
    });
  }
}
```

Also update `computeQuestStatus()`:

```typescript
// Add to computeQuestStatus():
if (stage.type === "gather" && stage.count && stage.target) {
  const gathered = row.stageProgress.gathered || 0;
  if (gathered >= stage.count) {
    return "ready_to_complete";
  }
}

if (stage.type === "interact" && stage.count && stage.target) {
  const interacted = row.stageProgress.interacted || 0;
  if (interacted >= stage.count) {
    return "ready_to_complete";
  }
}
```

---

## Summary

| Quest | Stages | Starting Items | Reward |
|-------|--------|----------------|--------|
| Lumberjack's First Lesson | Chop 6 logs → Burn 6 logs | bronze_hatchet, tinderbox | 1 QP, xp_lamp_100 |
| Fresh Catch | Catch 6 shrimp → Cook 6 shrimp | small_fishing_net | 1 QP, xp_lamp_100 |
| Torvin's Tools | Mine 4 copper → Mine 4 tin → Smelt 4 bars → Smith sword, hatchet, pickaxe | bronze_pickaxe, hammer | 1 QP, xp_lamp_100 |

Each quest:
1. Gives starting tools needed for both skills
2. Has multiple skill stages (gather then process)
3. Teaches both skills in the pair
4. Rewards 1 quest point + 100 XP lamp (player chooses skill)
5. Player keeps what they make (tools from Torvin's quest are useful!)

---

## Detailed Implementation Guide

### How the Goblin Slayer Quest Works (Reference)

Understanding the existing flow is critical. Here's the complete event chain:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GOBLIN SLAYER QUEST FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. QUEST START                                                              │
│  ─────────────────                                                           │
│  Player clicks Captain Rowan                                                 │
│       ↓                                                                      │
│  NPC_INTERACTION event fires                                                 │
│       ↓                                                                      │
│  DialogueSystem.handleNPCInteraction()                                       │
│       ↓                                                                      │
│  Checks questOverrides → status is "not_started" → uses "greeting" entry     │
│       ↓                                                                      │
│  Player selects "I'll do it" response                                        │
│       ↓                                                                      │
│  Response has effect: "startQuest:goblin_slayer"                             │
│       ↓                                                                      │
│  DialogueSystem.executeEffect() parses effect                                │
│       ↓                                                                      │
│  Calls QuestSystem.requestQuestStart(playerId, "goblin_slayer")              │
│       ↓                                                                      │
│  QuestSystem emits QUEST_START_CONFIRM event                                 │
│       ↓                                                                      │
│  Client shows quest accept/decline UI                                        │
│       ↓                                                                      │
│  Player clicks Accept → client sends "questAccept" network message           │
│       ↓                                                                      │
│  Server handler emits QUEST_START_ACCEPTED event                             │
│       ↓                                                                      │
│  QuestSystem.startQuest() executes:                                          │
│    - Creates QuestProgress with currentStage = "kill_goblins"                │
│    - Saves to database                                                       │
│    - Grants onStart items (bronze_sword)                                     │
│    - Emits QUEST_STARTED event                                               │
│    - Sends chat message                                                      │
│                                                                              │
│  2. QUEST PROGRESS (KILL TRACKING)                                           │
│  ──────────────────────────────────                                          │
│  Player kills a goblin                                                       │
│       ↓                                                                      │
│  NPC_DIED event fires with { killedBy, mobType: "goblin" }                   │
│       ↓                                                                      │
│  QuestSystem.handleNPCDied() executes:                                       │
│    - Gets player's active quests                                             │
│    - For each quest, finds current stage                                     │
│    - If stage.type === "kill" && stage.target === mobType:                   │
│        - Increments stageProgress.kills                                      │
│        - If kills >= stage.count: status = "ready_to_complete"               │
│        - Saves progress to database                                          │
│        - Emits QUEST_PROGRESSED event                                        │
│                                                                              │
│  3. QUEST COMPLETION                                                         │
│  ────────────────────                                                        │
│  Player talks to Captain Rowan again                                         │
│       ↓                                                                      │
│  DialogueSystem checks questOverrides                                        │
│       ↓                                                                      │
│  Status is "ready_to_complete" → uses "quest_complete" entry                 │
│       ↓                                                                      │
│  Terminal node has effect: "completeQuest:goblin_slayer"                     │
│       ↓                                                                      │
│  DialogueSystem.executeEffect() calls QuestSystem.completeQuest()            │
│       ↓                                                                      │
│  QuestSystem.completeQuest() executes:                                       │
│    - Verifies status is "ready_to_complete"                                  │
│    - Moves quest to completedQuests set                                      │
│    - Awards quest points                                                     │
│    - Grants reward items (xp_lamp_100)                                       │
│    - Emits QUEST_COMPLETED event                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/systems/shared/interaction/SmithingSystem.ts` | **BUG FIX**: Add missing `outputItemId` to event |
| `packages/server/world/assets/manifests/quests.json` | Add 3 new quest definitions |
| `packages/server/world/assets/manifests/npcs.json` | Add 3 new NPCs with dialogue |
| `packages/server/world/assets/manifests/world-areas.json` | Add NPC spawn positions |
| `packages/shared/src/systems/shared/progression/QuestSystem.ts` | Add gather/interact handlers |
| `packages/client/src/game/panels/QuestJournal.tsx` | Add gather/interact progress display |

### What Doesn't Need Changes

- **Database**: `stageProgress` is JSONB, already stores any keys (kills, gathered, interacted)
- **Network packets**: `getQuestDetail` handler passes all stage data generically
- **Quest types**: "gather" and "interact" already defined in `quest-types.ts`
- **Furnace/Anvil**: Already spawned by `EntityManager.ts` at (-15, y, 15) and (-10, y, 15)

### Bug Fix Required (Pre-requisite)

**SmithingSystem.ts is missing `outputItemId` in SMITHING_COMPLETE event!**

Location: `packages/shared/src/systems/shared/interaction/SmithingSystem.ts` line 384-389

Current (buggy):
```typescript
this.emitTypedEvent(EventType.SMITHING_COMPLETE, {
  playerId,
  recipeId: session.recipeId,
  totalSmithed: session.smithed,
  totalXp: session.smithed * (recipe?.xp || 0),
});
```

Fixed:
```typescript
this.emitTypedEvent(EventType.SMITHING_COMPLETE, {
  playerId,
  recipeId: session.recipeId,
  outputItemId: recipe?.output || session.recipeId, // Add this line
  totalSmithed: session.smithed,
  totalXp: session.smithed * (recipe?.xp || 0),
});
```

This fix is required because the quest system tracks `outputItemId` to detect when specific items are smithed.

### Step-by-Step Implementation

#### Step 0: Fix SmithingSystem Bug (Pre-requisite)

Location: `packages/shared/src/systems/shared/interaction/SmithingSystem.ts` in `completeSmithing()` method (line 384)

Add `outputItemId` to the SMITHING_COMPLETE event:

```typescript
const recipe = processingDataProvider.getSmithingRecipe(session.recipeId);

// Emit completion event
this.emitTypedEvent(EventType.SMITHING_COMPLETE, {
  playerId,
  recipeId: session.recipeId,
  outputItemId: recipe?.output || session.recipeId, // ADD THIS LINE
  totalSmithed: session.smithed,
  totalXp: session.smithed * (recipe?.xp || 0),
});
```

#### Step 1: Add Event Subscriptions to QuestSystem.init()

Location: `packages/shared/src/systems/shared/progression/QuestSystem.ts` in `init()` method (after line 96)

```typescript
// === NEW: Subscribe to events for gather/interact stage tracking ===

// Track item gathering (woodcutting logs, fishing shrimp, mining ore)
this.subscribe(EventType.INVENTORY_ITEM_ADDED, (data: {
  playerId: string;
  item: { itemId: string; quantity: number };
}) => {
  this.handleGatherStage(data.playerId, data.item.itemId, data.item.quantity);
});

// Track fires lit (firemaking)
this.subscribe(EventType.FIRE_CREATED, (data: { playerId: string }) => {
  this.handleInteractStage(data.playerId, "fire", 1);
});

// Track cooking (only successful cooks, not burns)
this.subscribe(EventType.COOKING_COMPLETED, (data: {
  playerId: string;
  resultItemId: string;
  wasBurnt: boolean;
}) => {
  if (!data.wasBurnt) {
    this.handleInteractStage(data.playerId, data.resultItemId, 1);
  }
});

// Track smelting (ore → bars)
this.subscribe(EventType.SMELTING_SUCCESS, (data: {
  playerId: string;
  barItemId: string;
}) => {
  this.handleInteractStage(data.playerId, data.barItemId, 1);
});

// Track smithing (bars → items)
this.subscribe(EventType.SMITHING_COMPLETE, (data: {
  playerId: string;
  outputItemId: string;
}) => {
  this.handleInteractStage(data.playerId, data.outputItemId, 1);
});
```

#### Step 2: Add handleGatherStage() Method

Location: After `handleNPCDied()` method (around line 673)

```typescript
/**
 * Handle gather stage progress (woodcutting, fishing, mining)
 * Triggered by INVENTORY_ITEM_ADDED when player receives gathered resources
 */
private handleGatherStage(playerId: string, itemId: string, quantity: number): void {
  const state = this.playerStates.get(playerId);
  if (!state) return;

  for (const [questId, progress] of state.activeQuests) {
    const definition = this.questDefinitions.get(questId);
    if (!definition) continue;

    const stage = definition.stages.find(s => s.id === progress.currentStage);
    if (!stage || stage.type !== "gather" || stage.target !== itemId) continue;

    // Increment gather count
    const gathered = (progress.stageProgress.gathered || 0) + quantity;
    progress.stageProgress = { ...progress.stageProgress, gathered };

    this.logger.info(
      `[QuestSystem] ${playerId} gathered ${itemId}: ${gathered}/${stage.count}`,
    );

    // Check if stage complete
    if (stage.count && gathered >= stage.count) {
      this.advanceToNextStage(playerId, questId, progress, definition);
    }

    // Save and emit progress
    this.saveQuestProgress(playerId, questId, progress.currentStage, progress.stageProgress, false);
    this.emitTypedEvent(EventType.QUEST_PROGRESSED, {
      playerId,
      questId,
      stage: progress.currentStage,
      progress: progress.stageProgress,
      description: stage.description,
    });
  }
}
```

#### Step 3: Add handleInteractStage() Method

Location: After `handleGatherStage()`

```typescript
/**
 * Handle interact stage progress (firemaking, cooking, smelting, smithing)
 * Triggered by skill-specific events when player creates items
 */
private handleInteractStage(playerId: string, target: string, count: number): void {
  const state = this.playerStates.get(playerId);
  if (!state) return;

  for (const [questId, progress] of state.activeQuests) {
    const definition = this.questDefinitions.get(questId);
    if (!definition) continue;

    const stage = definition.stages.find(s => s.id === progress.currentStage);
    if (!stage || stage.type !== "interact" || stage.target !== target) continue;

    // Increment interact count
    const interacted = (progress.stageProgress.interacted || 0) + count;
    progress.stageProgress = { ...progress.stageProgress, interacted };

    this.logger.info(
      `[QuestSystem] ${playerId} interacted ${target}: ${interacted}/${stage.count}`,
    );

    // Check if stage complete
    if (stage.count && interacted >= stage.count) {
      this.advanceToNextStage(playerId, questId, progress, definition);
    }

    // Save and emit progress
    this.saveQuestProgress(playerId, questId, progress.currentStage, progress.stageProgress, false);
    this.emitTypedEvent(EventType.QUEST_PROGRESSED, {
      playerId,
      questId,
      stage: progress.currentStage,
      progress: progress.stageProgress,
      description: stage.description,
    });
  }
}
```

#### Step 4: Add advanceToNextStage() Method

Location: After `handleInteractStage()`

```typescript
/**
 * Advance quest to next stage, or mark ready_to_complete if at final objective
 */
private advanceToNextStage(
  playerId: string,
  questId: string,
  progress: QuestProgress,
  definition: QuestDefinition,
): void {
  const currentIndex = definition.stages.findIndex(s => s.id === progress.currentStage);

  // Find next non-dialogue stage (or the final dialogue stage for completion)
  let nextStage = definition.stages[currentIndex + 1];

  // Skip dialogue stages to find next objective
  while (nextStage && nextStage.type === "dialogue") {
    const afterDialogue = definition.stages[definition.stages.indexOf(nextStage) + 1];
    if (!afterDialogue || afterDialogue.type === "dialogue") {
      // This is the final "return to NPC" dialogue - quest is ready to complete
      progress.status = "ready_to_complete";
      this.emitTypedEvent(EventType.CHAT_MESSAGE, {
        playerId,
        message: `Quest objective complete! Return to ${definition.startNpc.replace(/_/g, " ")}.`,
        type: "game",
      });
      return;
    }
    nextStage = afterDialogue;
  }

  if (nextStage && (nextStage.type === "gather" || nextStage.type === "interact" || nextStage.type === "kill")) {
    // Move to next objective stage
    progress.currentStage = nextStage.id;
    progress.stageProgress = {}; // Reset progress for new stage

    this.emitTypedEvent(EventType.CHAT_MESSAGE, {
      playerId,
      message: `New objective: ${nextStage.description}`,
      type: "game",
    });
  } else {
    // No more objective stages - ready to complete
    progress.status = "ready_to_complete";
    this.emitTypedEvent(EventType.CHAT_MESSAGE, {
      playerId,
      message: `Quest objective complete! Return to ${definition.startNpc.replace(/_/g, " ")}.`,
      type: "game",
    });
  }
}
```

#### Step 5: Update computeQuestStatus()

Location: In `computeQuestStatus()` method (around line 302), add after the kill check:

```typescript
// Existing kill stage check
if (stage.type === "kill" && stage.count && stage.target) {
  const kills = row.stageProgress.kills || 0;
  if (kills >= stage.count) {
    return "ready_to_complete";
  }
}

// NEW: Gather stage check
if (stage.type === "gather" && stage.count && stage.target) {
  const gathered = row.stageProgress.gathered || 0;
  if (gathered >= stage.count) {
    return "ready_to_complete";
  }
}

// NEW: Interact stage check
if (stage.type === "interact" && stage.count && stage.target) {
  const interacted = row.stageProgress.interacted || 0;
  if (interacted >= stage.count) {
    return "ready_to_complete";
  }
}
```

#### Step 6: Add Quest Definitions to quests.json

Location: `packages/server/world/assets/manifests/quests.json`

Add the three quest definitions from this document after the existing `goblin_slayer` entry.

#### Step 7: Add NPCs to npcs.json

Location: `packages/server/world/assets/manifests/npcs.json`

Add the three NPC definitions (Forester Wilma, Fisherman Pete, Torvin) from this document.

#### Step 8: Add NPC Spawn Positions to world-areas.json

Location: `packages/server/world/assets/manifests/world-areas.json`

Add the three NPCs to `starterTowns.central_haven.npcs[]`:

```json
{
  "id": "forester_wilma",
  "type": "quest_giver",
  "position": {
    "x": 20,
    "y": 0,
    "z": -8
  }
},
{
  "id": "fisherman_pete",
  "type": "quest_giver",
  "position": {
    "x": -15,
    "y": 0,
    "z": -15
  }
},
{
  "id": "torvin",
  "type": "quest_giver",
  "position": {
    "x": -10,
    "y": 0,
    "z": 15
  }
}
```

Position rationale:
- **Forester Wilma**: Near the tree line (x: 20) where woodcutting resources are
- **Fisherman Pete**: Near the fishing area (away from other NPCs)
- **Torvin**: Near the mining rocks (z: 15 is mining area)

#### Step 9: Update QuestJournal.tsx Progress Display

Location: `packages/client/src/game/panels/QuestJournal.tsx` in `getProgressText()` function (around line 333)

The current function only handles "kill" stages. Update it to handle all stage types:

```typescript
// Get progress text for current stage
const getProgressText = (): string | null => {
  const currentStage = quest.stages.find((s) => s.id === quest.currentStage);
  if (!currentStage) return null;

  if (currentStage.type === "kill" && currentStage.count) {
    const kills = quest.stageProgress.kills || 0;
    return `${currentStage.target || "Enemies"} killed: ${kills}/${currentStage.count}`;
  }

  // NEW: Handle gather stages (woodcutting, fishing, mining)
  if (currentStage.type === "gather" && currentStage.count) {
    const gathered = quest.stageProgress.gathered || 0;
    return `${formatTarget(currentStage.target)} gathered: ${gathered}/${currentStage.count}`;
  }

  // NEW: Handle interact stages (firemaking, cooking, smelting, smithing)
  if (currentStage.type === "interact" && currentStage.count) {
    const interacted = quest.stageProgress.interacted || 0;
    return `${formatTarget(currentStage.target)} created: ${interacted}/${currentStage.count}`;
  }

  return null;
};

// Helper to format target IDs for display (e.g., "bronze_bar" -> "Bronze Bar")
const formatTarget = (target?: string): string => {
  if (!target) return "Items";
  return target
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
```

### Testing Checklist

For each quest, verify:

- [ ] NPC spawns at correct location in world
- [ ] NPC shows correct dialogue based on quest status
- [ ] Accepting quest grants starting items
- [ ] Progress tracks correctly for each stage type
- [ ] Quest Journal shows correct progress text (e.g., "Logs gathered: 3/6")
- [ ] Stage transitions happen automatically when objective met
- [ ] Chat message appears for new objectives
- [ ] "ready_to_complete" status triggers correct dialogue
- [ ] Completing quest grants rewards (1 QP + xp_lamp_100)
- [ ] Quest shows as completed in quest journal
- [ ] NPC shows post-completion dialogue

**Smithing Quest Specific:**
- [ ] SMITHING_COMPLETE event includes `outputItemId` field (bug fix verification)

### Event Flow for New Quests

```
LUMBERJACK'S FIRST LESSON:
  Start → [INVENTORY_ITEM_ADDED: logs x6] → [FIRE_CREATED x6] → Complete

FRESH CATCH:
  Start → [INVENTORY_ITEM_ADDED: raw_shrimp x6] → [COOKING_COMPLETED: shrimp x6] → Complete

TORVIN'S TOOLS:
  Start → [INVENTORY_ITEM_ADDED: copper_ore x4]
        → [INVENTORY_ITEM_ADDED: tin_ore x4]
        → [SMELTING_SUCCESS: bronze_bar x4]
        → [SMITHING_COMPLETE: bronze_sword x1]
        → [SMITHING_COMPLETE: bronze_hatchet x1]
        → [SMITHING_COMPLETE: bronze_pickaxe x1]
        → Complete
```
