/**
 * XPProgressOrb - RuneScape 3 / RuneLite XP Globes-style XP Progress Display
 *
 * Shows multiple circular progress orbs at the top-center of the screen:
 * - Separate orb for each active skill (displayed side by side)
 * - Each orb has its own progress ring, skill icon, and level badge
 * - Floating XP numbers (grouped by game tick) rise toward the orbs
 * - Hover tooltip on each orb shows current XP and XP to next level
 * - Orbs fade after a number of game ticks (600ms each) without XP gain
 */

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import styled, { keyframes, css } from "styled-components";
import { EventType } from "@hyperscape/shared";
import type { ClientWorld } from "../../types";

// Skill icons mapping
const SKILL_ICONS: Record<string, string> = {
  attack: "\u2694\uFE0F",
  strength: "\uD83D\uDCAA",
  defence: "\uD83D\uDEE1\uFE0F",
  defense: "\uD83D\uDEE1\uFE0F",
  constitution: "\u2764\uFE0F",
  hitpoints: "\u2764\uFE0F",
  ranged: "\uD83C\uDFF9",
  prayer: "\u2728",
  magic: "\uD83D\uDD2E",
  cooking: "\uD83C\uDF56",
  woodcutting: "\uD83E\uDE93",
  fishing: "\uD83D\uDC1F",
  firemaking: "\uD83D\uDD25",
  mining: "\u26CF\uFE0F",
  smithing: "\uD83D\uDD28",
};

// Game tick duration in ms (OSRS-style)
const GAME_TICK_MS = 600;
// Duration before orb starts fading (in ms) - ~10 seconds like RuneLite default
const ORB_VISIBLE_DURATION_MS = 10000;
// Duration of the fade-out animation (in ms)
const ORB_FADE_DURATION_MS = 1000;
// Time window to group XP drops (same game tick - use full tick duration)
const GROUP_WINDOW_MS = 600;

// Normalize skill names (hitpoints/constitution, defence/defense are the same)
function normalizeSkillName(skill: string): string {
  const lower = skill.toLowerCase();
  if (lower === "hitpoints") return "constitution";
  if (lower === "defense") return "defence";
  return lower;
}

// Pre-computed XP table for O(1) lookups (OSRS formula)
// Computed once at module load instead of looping on every render
const XP_TABLE: readonly number[] = (() => {
  const table: number[] = new Array(100).fill(0); // Level 0 and 1 = 0 XP
  for (let level = 2; level <= 99; level++) {
    let total = 0;
    for (let i = 1; i < level; i++) {
      total += Math.floor(i + 300 * Math.pow(2, i / 7));
    }
    table[level] = Math.floor(total / 4);
  }
  return table;
})();

// O(1) lookup for XP required at a given level
function getXPForLevel(level: number): number {
  if (level < 1) return 0;
  if (level > 99) return XP_TABLE[99];
  return XP_TABLE[level];
}

interface XPDropData {
  skill: string;
  xpGained: number;
  newXp: number;
  newLevel: number;
}

// Grouped XP drop - multiple skills combined into one floating element
interface GroupedXPDrop {
  id: number;
  skills: Array<{ skill: string; amount: number }>; // Multiple skills in one drop
  totalAmount: number;
  startTime: number;
}

// Animation keyframes
const levelUpCelebration = keyframes`
  0% { transform: scale(1); filter: brightness(1); }
  25% { transform: scale(1.3); filter: brightness(1.5); }
  50% { transform: scale(1.1); filter: brightness(1.2); }
  100% { transform: scale(1); filter: brightness(1); }
`;

// Fade-out animation for orbs
const fadeOutAnimation = keyframes`
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.8); }
`;

// Floating XP drop animation - plain text rising up
const floatUpAnimation = keyframes`
  0% {
    top: 33vh;
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    top: 80px;
    opacity: 0;
  }
`;

// Styled components

// Container for multiple orbs displayed side by side
const OrbsRow = styled.div`
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  pointer-events: none;
`;

// Individual orb container (one per skill) - supports fade-out animation
const SingleOrbContainer = styled.div<{ $fading?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  ${({ $fading }) =>
    $fading &&
    css`
      animation: ${fadeOutAnimation} ${ORB_FADE_DURATION_MS}ms ease-out forwards;
    `}
`;

const OrbWrapper = styled.div<{ $isLevelUp?: boolean }>`
  position: relative;
  width: 64px;
  height: 64px;
  pointer-events: auto;
  cursor: pointer;
  ${({ $isLevelUp }) =>
    $isLevelUp &&
    css`
      animation: ${levelUpCelebration} 0.6s ease-out;
    `}
`;

const ProgressRing = styled.svg`
  transform: rotate(-90deg);
  width: 100%;
  height: 100%;
`;

const BackgroundCircle = styled.circle`
  fill: rgba(0, 0, 0, 0.7);
  stroke: rgba(255, 255, 255, 0.2);
  stroke-width: 3;
`;

const ProgressCircle = styled.circle<{ $progress: number }>`
  fill: none;
  stroke: #ffd700;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: ${({ $progress }) => {
    const circumference = 2 * Math.PI * 27;
    const filled = (circumference * $progress) / 100;
    return `${filled} ${circumference}`;
  }};
  transition: stroke-dasharray 0.3s ease;
`;

// Single skill icon centered in the orb
const SkillIcon = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 24px;
  line-height: 1;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
`;

// Tooltip for hover info on individual orb
const Tooltip = styled.div`
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid #ffd700;
  border-radius: 6px;
  padding: 8px 12px;
  white-space: nowrap;
  z-index: 1001;
  pointer-events: none;

  color: #fff;
  font-size: 12px;
  line-height: 1.5;
`;

const TooltipRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
`;

const TooltipLabel = styled.span`
  color: #aaa;
`;

const TooltipValue = styled.span`
  color: #ffd700;
  font-weight: bold;
`;

// Floating XP drop element - plain text, no background
// RS3 style: multiple skill icons grouped together with total XP
const FloatingXP = styled.div`
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999;
  pointer-events: none;
  animation: ${floatUpAnimation} 1.5s ease-out forwards;

  display: flex;
  align-items: center;
  gap: 2px;

  color: #ffd700;
  font-size: 20px;
  font-weight: bold;
  text-shadow:
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000,
    1px 1px 0 #000,
    0 0 8px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
`;

const FloatingXPIcons = styled.span`
  display: flex;
  align-items: center;
  gap: 1px;
  font-size: 18px;
`;

const FloatingXPAmount = styled.span`
  margin-left: 4px;
`;

interface XPProgressOrbProps {
  world: ClientWorld;
}

// Track active skills with their data for orb display
interface ActiveSkill {
  skill: string;
  level: number;
  xp: number;
  lastGainTime: number;
  isFading: boolean; // Whether the orb is currently fading out
}

export function XPProgressOrb({ world }: XPProgressOrbProps) {
  // Track multiple active skills - each gets its own orb
  const [activeSkills, setActiveSkills] = useState<ActiveSkill[]>([]);
  const [levelUpSkill, setLevelUpSkill] = useState<string | null>(null);
  const [floatingDrops, setFloatingDrops] = useState<GroupedXPDrop[]>([]);
  // Track which orb is being hovered (by skill name)
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  const dropIdRef = useRef(0);
  // Track pending XP drops to group within time window
  const pendingDropRef = useRef<GroupedXPDrop | null>(null);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track previous levels for level-up detection
  const previousLevelsRef = useRef<Record<string, number>>({});

  // Calculate progress to next level (uses pre-computed XP table)
  const calculateProgress = useCallback((xp: number, level: number): number => {
    if (level >= 99) return 100;
    const currentLevelXP = getXPForLevel(level);
    const nextLevelXP = getXPForLevel(level + 1);
    const xpInLevel = xp - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;
    return Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));
  }, []);

  // Calculate XP to next level (uses pre-computed XP table)
  const getXPToNextLevel = useCallback((xp: number, level: number): number => {
    if (level >= 99) return 0;
    const nextLevelXP = getXPForLevel(level + 1);
    return nextLevelXP - xp;
  }, []);

  // Memoize derived skill data to avoid recalculating on every render (hover, animation, etc.)
  // This prevents expensive calculations from running on mouse movements
  const skillsWithProgress = useMemo(() => {
    return activeSkills.map((skill) => {
      const skillKey = normalizeSkillName(skill.skill);
      return {
        ...skill,
        skillKey,
        icon:
          SKILL_ICONS[skillKey] ||
          SKILL_ICONS[skill.skill.toLowerCase()] ||
          "\u2B50",
        progress: calculateProgress(skill.xp, skill.level),
        xpToLevel: getXPToNextLevel(skill.xp, skill.level),
      };
    });
  }, [activeSkills, calculateProgress, getXPToNextLevel]);

  // Game tick timer - each orb fades independently based on its own lastGainTime
  // Two-phase approach:
  // 1. After ORB_VISIBLE_DURATION_MS, mark skill as "fading" to trigger fade animation
  // 2. After additional ORB_FADE_DURATION_MS, remove the skill from the list
  useEffect(() => {
    const tickInterval = setInterval(() => {
      const now = Date.now();

      setActiveSkills((prev) => {
        let changed = false;
        const updated = prev.map((s) => {
          const timeSinceGain = now - s.lastGainTime;

          // If not fading yet and past visible duration, start fading
          if (!s.isFading && timeSinceGain >= ORB_VISIBLE_DURATION_MS) {
            changed = true;
            return { ...s, isFading: true };
          }
          return s;
        });

        // Remove skills that have finished fading (visible duration + fade duration)
        const totalDuration = ORB_VISIBLE_DURATION_MS + ORB_FADE_DURATION_MS;
        const stillActive = updated.filter(
          (s) => now - s.lastGainTime < totalDuration,
        );

        if (stillActive.length !== updated.length) {
          return stillActive;
        }

        return changed ? updated : prev;
      });
    }, GAME_TICK_MS);

    return () => clearInterval(tickInterval);
  }, []);

  // Function to finalize and display a grouped drop
  const finalizeGroupedDrop = useCallback((drop: GroupedXPDrop) => {
    setFloatingDrops((prev) => [...prev, drop]);

    // Remove the drop after animation completes (1.5s)
    setTimeout(() => {
      setFloatingDrops((prev) => prev.filter((d) => d.id !== drop.id));
    }, 1500);
  }, []);

  useEffect(() => {
    let levelUpTimeout: ReturnType<typeof setTimeout>;

    const handleXPDrop = (data: unknown) => {
      const xpData = data as XPDropData;
      const now = Date.now();
      // Normalize skill name (hitpoints → constitution, defense → defence)
      const skillKey = normalizeSkillName(xpData.skill);

      // Check for level up - track which specific skill leveled
      const prevLevel = previousLevelsRef.current[skillKey];
      if (prevLevel !== undefined && xpData.newLevel > prevLevel) {
        setLevelUpSkill(skillKey);
        clearTimeout(levelUpTimeout);
        levelUpTimeout = setTimeout(() => {
          setLevelUpSkill(null);
        }, 600);
      }
      previousLevelsRef.current[skillKey] = xpData.newLevel;

      // Update active skills for orb display
      // Use normalized skill key for matching but display original name
      setActiveSkills((prev) => {
        const existingIdx = prev.findIndex(
          (s) => normalizeSkillName(s.skill) === skillKey,
        );
        const newSkill: ActiveSkill = {
          skill: xpData.skill,
          level: xpData.newLevel,
          xp: xpData.newXp,
          lastGainTime: now,
          isFading: false, // Reset fading state when receiving new XP
        };

        if (existingIdx >= 0) {
          // Update existing skill - refresh lastGainTime and reset fading
          const updated = [...prev];
          updated[existingIdx] = newSkill;
          return updated;
        } else {
          // Add new skill to active list
          return [...prev, newSkill];
        }
      });

      // RS3-style grouping: combine XP drops within GROUP_WINDOW_MS into single drop
      // This groups combat XP (Attack/Strength/etc + Hitpoints) into one floating element
      if (
        pendingDropRef.current &&
        now - pendingDropRef.current.startTime < GROUP_WINDOW_MS
      ) {
        // Add to existing pending drop
        pendingDropRef.current.skills.push({
          skill: xpData.skill,
          amount: xpData.xpGained,
        });
        pendingDropRef.current.totalAmount += xpData.xpGained;
      } else {
        // Finalize any existing pending drop
        if (pendingDropRef.current) {
          if (pendingTimeoutRef.current) {
            clearTimeout(pendingTimeoutRef.current);
          }
          finalizeGroupedDrop(pendingDropRef.current);
        }

        // Create new pending drop
        pendingDropRef.current = {
          id: ++dropIdRef.current,
          skills: [{ skill: xpData.skill, amount: xpData.xpGained }],
          totalAmount: xpData.xpGained,
          startTime: now,
        };

        // Set timeout to finalize the drop after GROUP_WINDOW_MS
        pendingTimeoutRef.current = setTimeout(() => {
          if (pendingDropRef.current) {
            finalizeGroupedDrop(pendingDropRef.current);
            pendingDropRef.current = null;
          }
        }, GROUP_WINDOW_MS);
      }
    };

    // Subscribe to XP drop events
    world.on(EventType.XP_DROP_RECEIVED, handleXPDrop);

    return () => {
      world.off(EventType.XP_DROP_RECEIVED, handleXPDrop);
      clearTimeout(levelUpTimeout);
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
      }
    };
  }, [world, finalizeGroupedDrop]);

  // Don't render if no skill has been trained yet
  if (skillsWithProgress.length === 0) {
    return null;
  }

  return (
    <>
      {/* Floating XP drops - RS3 style: grouped skills with multiple icons */}
      {floatingDrops.map((drop) => (
        <FloatingXP key={drop.id}>
          <FloatingXPIcons>
            {drop.skills.map((s, i) => {
              const dropIcon = SKILL_ICONS[s.skill.toLowerCase()] || "\u2B50";
              return <span key={`${drop.id}-${s.skill}-${i}`}>{dropIcon}</span>;
            })}
          </FloatingXPIcons>
          <FloatingXPAmount>+{drop.totalAmount}</FloatingXPAmount>
        </FloatingXP>
      ))}

      {/* Multiple orbs side by side - one for each active skill */}
      <OrbsRow>
        {skillsWithProgress.map((skill) => {
          // Use memoized values - no calculations in render
          const isThisLevelUp = levelUpSkill === skill.skillKey;
          const isHovered = hoveredSkill === skill.skillKey;

          return (
            <SingleOrbContainer
              key={`orb-${skill.skillKey}`}
              $fading={skill.isFading}
            >
              <OrbWrapper
                $isLevelUp={isThisLevelUp}
                onMouseEnter={() => setHoveredSkill(skill.skillKey)}
                onMouseLeave={() => setHoveredSkill(null)}
              >
                <ProgressRing viewBox="0 0 64 64">
                  <BackgroundCircle cx="32" cy="32" r="27" />
                  <ProgressCircle
                    cx="32"
                    cy="32"
                    r="27"
                    $progress={skill.progress}
                  />
                </ProgressRing>
                <SkillIcon>{skill.icon}</SkillIcon>

                {/* Hover tooltip for this specific skill */}
                {isHovered && (
                  <Tooltip>
                    <TooltipRow>
                      <TooltipLabel>Level:</TooltipLabel>
                      <TooltipValue>{skill.level}</TooltipValue>
                    </TooltipRow>
                    <TooltipRow>
                      <TooltipLabel>Current XP:</TooltipLabel>
                      <TooltipValue>{skill.xp.toLocaleString()}</TooltipValue>
                    </TooltipRow>
                    <TooltipRow>
                      <TooltipLabel>XP to level:</TooltipLabel>
                      <TooltipValue>
                        {skill.xpToLevel.toLocaleString()}
                      </TooltipValue>
                    </TooltipRow>
                    <TooltipRow>
                      <TooltipLabel>Progress:</TooltipLabel>
                      <TooltipValue>{skill.progress.toFixed(1)}%</TooltipValue>
                    </TooltipRow>
                  </Tooltip>
                )}
              </OrbWrapper>
            </SingleOrbContainer>
          );
        })}
      </OrbsRow>
    </>
  );
}
