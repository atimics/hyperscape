/**
 * LevelUpNotification - Main composition root for level-up notifications
 *
 * Combines:
 * - useLevelUpState: Event subscription and queue management
 * - LevelUpPopup: Visual popup display
 * - levelUpAudio: Placeholder fanfare sounds
 * - Chat message: OSRS-style game message
 */

import { useEffect, useRef } from "react";
import { uuid } from "@hyperscape/shared";
import type { ClientAudio, Chat, ChatMessage } from "@hyperscape/shared";
import type { ClientWorld } from "../../../types";
import { useLevelUpState } from "./useLevelUpState";
import { LevelUpPopup } from "./LevelUpPopup";
import { playLevelUpFanfare } from "./levelUpAudio";
import { capitalizeSkill } from "./utils";

interface LevelUpNotificationProps {
  world: ClientWorld;
}

export function LevelUpNotification({ world }: LevelUpNotificationProps) {
  const { currentLevelUp, dismissLevelUp } = useLevelUpState(world);

  // Track which level-ups we've already processed (by timestamp)
  const processedRef = useRef<Set<number>>(new Set());

  // Play audio and send chat message when a new level-up appears
  useEffect(() => {
    if (!currentLevelUp) return;

    // Skip if we already processed this level-up
    if (processedRef.current.has(currentLevelUp.timestamp)) return;
    processedRef.current.add(currentLevelUp.timestamp);

    // === AUDIO ===
    const audio = world.audio as ClientAudio | undefined;
    if (audio?.ctx) {
      const sfxVolume = audio.groupGains?.sfx?.gain?.value ?? 1;
      if (sfxVolume > 0) {
        audio.ready(() => {
          playLevelUpFanfare(
            currentLevelUp.newLevel,
            audio.ctx,
            audio.groupGains?.sfx,
          );
        });
      }
    }

    // === CHAT MESSAGE ===
    const chat = world.chat as Chat | undefined;
    if (chat?.add) {
      const messageBody = `Congratulations! You've advanced a ${capitalizeSkill(currentLevelUp.skill)} level. You are now level ${currentLevelUp.newLevel}.`;

      const message: ChatMessage = {
        id: uuid(),
        from: "", // Empty = no [username] prefix, just game text (OSRS style)
        body: messageBody,
        text: messageBody, // For interface compatibility
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
      };

      chat.add(message, false); // false = don't broadcast to server
    }
  }, [currentLevelUp, world]);

  // Cleanup old timestamps periodically to prevent memory leak
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      const threshold = 60000; // 1 minute
      processedRef.current.forEach((timestamp) => {
        if (now - timestamp > threshold) {
          processedRef.current.delete(timestamp);
        }
      });
    }, 30000); // Every 30 seconds

    return () => clearInterval(cleanup);
  }, []);

  // Don't render if no level-up to display
  if (!currentLevelUp) {
    return null;
  }

  return <LevelUpPopup event={currentLevelUp} onDismiss={dismissLevelUp} />;
}
