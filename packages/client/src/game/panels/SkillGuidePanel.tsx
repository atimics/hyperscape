/**
 * Skill Guide Panel
 * OSRS-style popup showing skill unlocks at each level
 */

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import type { SkillUnlock } from "@hyperscape/shared";

interface SkillGuidePanelProps {
  visible: boolean;
  skillKey: string;
  skillLabel: string;
  skillIcon: string;
  playerLevel: number;
  unlocks: readonly SkillUnlock[];
  onClose: () => void;
}

interface UnlockRowProps {
  unlock: SkillUnlock;
  isUnlocked: boolean;
}

function UnlockRow({ unlock, isUnlocked }: UnlockRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px",
        borderRadius: "4px",
        background: isUnlocked
          ? "rgba(34, 197, 94, 0.1)"
          : "rgba(0, 0, 0, 0.2)",
        border: isUnlocked
          ? "1px solid rgba(34, 197, 94, 0.3)"
          : "1px solid transparent",
        opacity: isUnlocked ? 1 : 0.6,
      }}
    >
      {/* Status Icon */}
      <span
        style={{
          color: isUnlocked ? "#22c55e" : "#6b7280",
          fontSize: "14px",
          width: "16px",
          textAlign: "center",
        }}
      >
        {isUnlocked ? "✓" : "🔒"}
      </span>

      {/* Level Badge */}
      <span
        style={{
          width: "48px",
          textAlign: "center",
          fontSize: "12px",
          fontWeight: "bold",
          color: isUnlocked ? "#ffff00" : "#9ca3af",
        }}
      >
        Lvl {unlock.level}
      </span>

      {/* Description */}
      <span
        style={{
          flex: 1,
          fontSize: "12px",
          color: isUnlocked ? "#ffffff" : "#9ca3af",
        }}
      >
        {unlock.description}
      </span>

      {/* Type Badge */}
      <span
        style={{
          fontSize: "10px",
          padding: "2px 6px",
          borderRadius: "4px",
          background:
            unlock.type === "item"
              ? "rgba(59, 130, 246, 0.3)"
              : "rgba(147, 51, 234, 0.3)",
          color: unlock.type === "item" ? "#93c5fd" : "#c4b5fd",
        }}
      >
        {unlock.type}
      </span>
    </div>
  );
}

export function SkillGuidePanel({
  visible,
  skillLabel,
  skillIcon,
  playerLevel,
  unlocks,
  onClose,
}: SkillGuidePanelProps) {
  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (visible) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [visible, onClose]);

  if (!visible) return null;

  const sortedUnlocks = [...unlocks].sort((a, b) => a.level - b.level);
  const unlockedCount = unlocks.filter((u) => u.level <= playerLevel).length;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: "relative",
          background: "rgba(20, 15, 10, 0.98)",
          border: "2px solid rgba(139, 69, 19, 0.8)",
          borderRadius: "8px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          width: "320px",
          maxHeight: "500px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px",
            borderBottom: "1px solid rgba(139, 69, 19, 0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "24px" }}>{skillIcon}</span>
            <span
              style={{
                color: "#c9b386",
                fontWeight: "bold",
                fontSize: "14px",
              }}
            >
              {skillLabel} Guide
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#c9b386",
              cursor: "pointer",
              fontSize: "18px",
              padding: "4px",
              lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#c9b386")}
          >
            ✕
          </button>
        </div>

        {/* Current Level */}
        <div
          style={{
            padding: "8px 12px",
            fontSize: "12px",
            color: "#c9b386",
            borderBottom: "1px solid rgba(139, 69, 19, 0.3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            Your Level:{" "}
            <span style={{ color: "#ffff00", fontWeight: "bold" }}>
              {playerLevel}
            </span>
          </span>
          <span style={{ fontSize: "11px", color: "#9ca3af" }}>
            {unlockedCount}/{unlocks.length} unlocked
          </span>
        </div>

        {/* Unlocks List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {sortedUnlocks.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "#9ca3af",
                padding: "16px",
                fontSize: "12px",
              }}
            >
              No unlock data available for this skill.
            </div>
          ) : (
            sortedUnlocks.map((unlock, idx) => (
              <UnlockRow
                key={idx}
                unlock={unlock}
                isUnlocked={playerLevel >= unlock.level}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
