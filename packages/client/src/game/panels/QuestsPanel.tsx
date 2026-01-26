/**
 * QuestsPanel - Quest Log panel for the game interface
 *
 * Connects the QuestLog component to the server's quest system via network.
 * Displays available, active, and completed quests with filtering and sorting.
 * Uses COLORS constants for consistent styling with other panels.
 *
 * When a quest is clicked, it opens the QuestDetailPanel in a separate window.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { EventType } from "@hyperscape/shared";
import { useWindowStore, useQuestSelectionStore } from "@/ui";
import { QuestLog } from "@/game/components/quest";
import {
  type Quest,
  type QuestState,
  type QuestCategory,
  type QuestSortOption,
  type SortDirection,
  sortQuests,
  filterQuests,
} from "@/game/systems";
import { panelStyles } from "../../constants";
import type { ClientWorld } from "../../types";

interface QuestsPanelProps {
  world: ClientWorld;
}

/** Server quest list item structure */
interface ServerQuestListItem {
  id: string;
  name: string;
  status: "not_started" | "in_progress" | "ready_to_complete" | "completed";
  difficulty: string;
  questPoints: number;
}

/** Server quest detail structure */
interface ServerQuestDetail {
  id: string;
  name: string;
  description: string;
  status: "not_started" | "in_progress" | "ready_to_complete" | "completed";
  difficulty: string;
  questPoints: number;
  currentStage: string;
  stageProgress: Record<string, number>;
  stages: Array<{
    id: string;
    description: string;
    type: string;
    target?: string;
    count?: number;
  }>;
}

/** Map server status to client state */
function mapStatusToState(status: ServerQuestListItem["status"]): QuestState {
  switch (status) {
    case "not_started":
      return "available";
    case "in_progress":
    case "ready_to_complete":
      return "active";
    case "completed":
      return "completed";
    default:
      return "available";
  }
}

/** Map server difficulty to category (best effort mapping) */
function mapDifficultyToCategory(difficulty: string): QuestCategory {
  // Default to "main" for now - could be extended with server-side category data
  return "main";
}

/** Transform server quest list item to client Quest type */
function transformServerQuest(serverQuest: ServerQuestListItem): Quest {
  return {
    id: serverQuest.id,
    title: serverQuest.name,
    description: "", // Will be filled in from detail request
    state: mapStatusToState(serverQuest.status),
    category: mapDifficultyToCategory(serverQuest.difficulty),
    level: 1, // Default level - could be added to server response
    objectives: [], // Will be filled in from detail request
    rewards: [
      {
        type: "quest_points",
        name: "Quest Points",
        amount: serverQuest.questPoints,
      },
    ],
    pinned: false,
    questGiver: undefined,
    questGiverLocation: undefined,
  };
}

/** Transform server quest detail to client Quest type */
function transformServerQuestDetail(detail: ServerQuestDetail): Quest {
  const state = mapStatusToState(detail.status);

  // Transform stages to objectives
  const objectives = detail.stages.map((stage, index) => {
    // Determine progress for this stage
    let current = 0;
    const target = stage.count || 1;

    // Check if this stage is before current stage (completed)
    const currentStageIndex = detail.stages.findIndex(
      (s) => s.id === detail.currentStage,
    );
    const isCompleted =
      detail.status === "completed" || index < currentStageIndex;
    const isCurrent = index === currentStageIndex;

    if (isCompleted) {
      current = target;
    } else if (isCurrent && stage.count) {
      // Get progress from stageProgress
      if (stage.type === "kill") {
        current = detail.stageProgress.kills || 0;
      } else if (stage.target) {
        current = detail.stageProgress[stage.target] || 0;
      }
    }

    return {
      id: stage.id,
      type: stage.type as Quest["objectives"][0]["type"],
      description: stage.description,
      current,
      target,
      optional: false,
    };
  });

  return {
    id: detail.id,
    title: detail.name,
    description: detail.description,
    state,
    category: mapDifficultyToCategory(detail.difficulty),
    level: 1,
    objectives,
    rewards: [
      {
        type: "quest_points",
        name: "Quest Points",
        amount: detail.questPoints,
      },
    ],
    pinned: false,
    questGiver: undefined,
    questGiverLocation: undefined,
  };
}

/**
 * QuestsPanel Component
 *
 * Displays the quest log with filtering, sorting, and quest management.
 * Connects to the game world for quest data and actions via network.
 */
export function QuestsPanel({ world }: QuestsPanelProps) {
  // Filter state
  const [searchText, setSearchText] = useState("");
  const [stateFilter, setStateFilter] = useState<QuestState[]>([
    "available",
    "active",
  ]);
  const [categoryFilter, setCategoryFilter] = useState<QuestCategory[]>([]);
  const [sortBy, setSortBy] = useState<QuestSortOption>("category");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Quest data from server
  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [questDetails, setQuestDetails] = useState<Map<string, Quest>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  // Fetch quest data from server
  useEffect(() => {
    const fetchQuestList = () => {
      if (world.network?.send) {
        world.network.send("getQuestList", {});
      }
    };

    // Handle quest list response
    const onQuestListUpdate = (data: unknown) => {
      const payload = data as {
        quests: ServerQuestListItem[];
        questPoints: number;
      };

      const quests = (payload.quests || []).map(transformServerQuest);
      setAllQuests(quests);
      setLoading(false);
    };

    // Handle quest detail response - merge with existing quests
    const onQuestDetailUpdate = (data: unknown) => {
      const detail = data as ServerQuestDetail;
      const quest = transformServerQuestDetail(detail);

      setQuestDetails((prev) => {
        const newMap = new Map(prev);
        newMap.set(quest.id, quest);
        return newMap;
      });
    };

    // Refresh on quest events
    const onQuestEvent = () => {
      fetchQuestList();
    };

    // Register handlers
    world.network?.on("questList", onQuestListUpdate);
    world.network?.on("questDetail", onQuestDetailUpdate);
    world.on(EventType.QUEST_STARTED, onQuestEvent);
    world.on(EventType.QUEST_PROGRESSED, onQuestEvent);
    world.on(EventType.QUEST_COMPLETED, onQuestEvent);

    // Initial fetch
    fetchQuestList();

    return () => {
      world.network?.off("questList", onQuestListUpdate);
      world.network?.off("questDetail", onQuestDetailUpdate);
      world.off(EventType.QUEST_STARTED, onQuestEvent);
      world.off(EventType.QUEST_PROGRESSED, onQuestEvent);
      world.off(EventType.QUEST_COMPLETED, onQuestEvent);
    };
  }, [world]);

  // Merge quest list with detailed quest data
  const mergedQuests = useMemo(() => {
    return allQuests.map((quest) => {
      const detail = questDetails.get(quest.id);
      if (detail) {
        return { ...quest, ...detail };
      }
      return quest;
    });
  }, [allQuests, questDetails]);

  // Filter and sort quests
  const filteredQuests = useMemo(() => {
    let quests = [...mergedQuests];

    // Apply filters
    quests = filterQuests(quests, {
      searchText: searchText,
      states: stateFilter.length > 0 ? stateFilter : undefined,
      categories: categoryFilter.length > 0 ? categoryFilter : undefined,
    });

    // Apply sorting
    quests = sortQuests(quests, sortBy, sortDirection);

    return quests;
  }, [
    mergedQuests,
    searchText,
    stateFilter,
    categoryFilter,
    sortBy,
    sortDirection,
  ]);

  // Quest counts
  const questCounts = useMemo(
    () => ({
      active: mergedQuests.filter((q) => q.state === "active").length,
      available: mergedQuests.filter((q) => q.state === "available").length,
      completed: mergedQuests.filter((q) => q.state === "completed").length,
    }),
    [mergedQuests],
  );

  // Quest actions
  const handleAcceptQuest = useCallback(
    (quest: Quest) => {
      // Send accept quest request to server
      world.network?.send?.("questAccept", { questId: quest.id });
    },
    [world],
  );

  const handleAbandonQuest = useCallback(
    (quest: Quest) => {
      // Send abandon quest request to server
      world.network?.send?.("questAbandon", { questId: quest.id });
    },
    [world],
  );

  const handleTogglePin = useCallback(
    (quest: Quest) => {
      // Toggle pinned state - this could be client-side only or synced
      world.network?.send?.("questTogglePin", { questId: quest.id });
    },
    [world],
  );

  const handleTrackQuest = useCallback(
    (quest: Quest) => {
      // Track quest on screen
      world.network?.send?.("questTrack", { questId: quest.id });
    },
    [world],
  );

  // Get quest selection store and window store for opening quest detail
  const setSelectedQuest = useQuestSelectionStore((s) => s.setSelectedQuest);
  const createWindow = useWindowStore((s) => s.createWindow);
  const windows = useWindowStore((s) => s.windows);

  // Handle quest click - fetch details and open quest detail in separate window
  const handleQuestClick = useCallback(
    (quest: Quest) => {
      // Request quest detail from server (will update questDetails state)
      if (world.network?.send) {
        world.network.send("getQuestDetail", { questId: quest.id });
      }

      // Set the selected quest in the store (use detail if available, otherwise basic quest)
      const detailedQuest = questDetails.get(quest.id) || quest;
      setSelectedQuest(detailedQuest);

      // Check if quest-detail window already exists
      const existingWindow = windows.get("quest-detail-window");

      if (existingWindow) {
        // If window exists, just make it visible and bring to front
        useWindowStore.getState().updateWindow("quest-detail-window", {
          visible: true,
        });
        useWindowStore.getState().bringToFront("quest-detail-window");
      } else {
        // Create new quest detail window
        const viewport = {
          width: typeof window !== "undefined" ? window.innerWidth : 1920,
          height: typeof window !== "undefined" ? window.innerHeight : 1080,
        };

        createWindow({
          id: "quest-detail-window",
          position: {
            x: Math.floor(viewport.width / 2 - 200),
            y: Math.floor(viewport.height / 2 - 250),
          },
          size: { width: 400, height: 500 },
          minSize: { width: 320, height: 400 },
          maxSize: { width: 500, height: 700 },
          tabs: [
            { id: "quest-detail", label: "Quest", content: "quest-detail" },
          ],
          transparency: 0,
        });
      }
    },
    [setSelectedQuest, createWindow, windows, world, questDetails],
  );

  // Container style using COLORS constants for consistency
  const containerStyle: React.CSSProperties = {
    height: "100%",
    background: panelStyles.container.background,
    display: "flex",
    flexDirection: "column",
  };

  // Show loading state
  if (loading) {
    return (
      <div style={containerStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#888",
          }}
        >
          Loading quests...
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <QuestLog
        quests={filteredQuests}
        questCounts={questCounts}
        searchText={searchText}
        onSearchChange={setSearchText}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
        stateFilter={stateFilter}
        onStateFilterChange={setStateFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        onTogglePin={handleTogglePin}
        onAcceptQuest={handleAcceptQuest}
        onAbandonQuest={handleAbandonQuest}
        onTrackQuest={handleTrackQuest}
        groupByCategory
        showSearch
        showFilters
        showSort
        showHeader
        title="Quest Log"
        emptyMessage="No quests available. Talk to NPCs to discover new quests!"
        useExternalPopup
        onQuestClick={handleQuestClick}
        style={{
          height: "100%",
          border: "none",
          background: "transparent",
        }}
      />
    </div>
  );
}

export default QuestsPanel;
