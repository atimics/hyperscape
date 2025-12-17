/**
 * UnlocksSection - Displays what content is unlocked at a skill level
 *
 * Shows OSRS-style unlock information in the level-up popup:
 * - New items that can be equipped/used
 * - New abilities unlocked
 * - New areas accessible
 * - New activities available
 */

import styled from "styled-components";
import { getUnlocksAtLevel } from "@hyperscape/shared";
import type { SkillUnlock, UnlockType } from "@hyperscape/shared";

// === ICONS FOR UNLOCK TYPES ===

const UNLOCK_TYPE_ICONS: Record<UnlockType, string> = {
  item: "📦",
  ability: "⚡",
  area: "🗺️",
  quest: "📜",
  activity: "🎯",
};

// === STYLED COMPONENTS ===

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 215, 0, 0.3);
  width: 100%;
`;

const Title = styled.div`
  font-size: 12px;
  color: rgba(255, 215, 0, 0.8);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
`;

const UnlockList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
`;

const UnlockItem = styled.li`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.05);
  padding: 6px 12px;
  border-radius: 4px;
  border-left: 3px solid #4ecdc4;
`;

const UnlockIcon = styled.span`
  font-size: 16px;
`;

const UnlockText = styled.span`
  flex: 1;
`;

// === COMPONENT ===

interface UnlocksSectionProps {
  skill: string;
  level: number;
}

export function UnlocksSection({ skill, level }: UnlocksSectionProps) {
  const unlocks = getUnlocksAtLevel(skill, level);

  // Don't render if no unlocks at this level
  if (unlocks.length === 0) {
    return null;
  }

  return (
    <Container>
      <Title>New Unlocks</Title>
      <UnlockList>
        {unlocks.map((unlock: SkillUnlock, index: number) => (
          <UnlockItem key={`${unlock.level}-${index}`}>
            <UnlockIcon>{UNLOCK_TYPE_ICONS[unlock.type]}</UnlockIcon>
            <UnlockText>{unlock.description}</UnlockText>
          </UnlockItem>
        ))}
      </UnlockList>
    </Container>
  );
}
