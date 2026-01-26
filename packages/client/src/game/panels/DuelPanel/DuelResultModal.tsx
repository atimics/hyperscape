/**
 * Duel Result Modal
 *
 * Modal displayed when a duel ends, showing whether the player
 * won or lost, along with the items they received or lost.
 *
 * Uses ModalWindow for consistent styling and behavior.
 */

import { useCallback, useState, type CSSProperties } from "react";
import { ModalWindow, useThemeStore } from "@/ui";
import { getItem } from "@hyperscape/shared";

// ============================================================================
// Types
// ============================================================================

export interface DuelResultItem {
  itemId: string;
  quantity: number;
  value: number;
}

export interface DuelResultState {
  visible: boolean;
  won: boolean;
  opponentName: string;
  itemsReceived: DuelResultItem[];
  itemsLost: DuelResultItem[];
  totalValueWon: number;
  totalValueLost: number;
  forfeit: boolean;
}

interface DuelResultModalProps {
  state: DuelResultState;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function DuelResultModal({ state, onClose }: DuelResultModalProps) {
  const theme = useThemeStore((s) => s.theme);
  const [buttonHover, setButtonHover] = useState(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!state.visible) return null;

  const isWinner = state.won;
  const hasItems = state.itemsReceived.length > 0 || state.itemsLost.length > 0;

  // Format gold value with K/M suffixes
  const formatValue = (value: number): string => {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toLocaleString();
  };

  // Styles
  const resultHeaderStyle: CSSProperties = {
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  };

  const iconStyle: CSSProperties = {
    fontSize: "48px",
    marginBottom: theme.spacing.sm,
  };

  const titleStyle: CSSProperties = {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: isWinner ? theme.colors.state.success : theme.colors.state.danger,
    textShadow: `0 0 10px ${isWinner ? theme.colors.state.success : theme.colors.state.danger}66`,
    marginBottom: theme.spacing.xs,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  };

  const sectionStyle: CSSProperties = {
    background: theme.colors.background.tertiary,
    border: `1px solid ${theme.colors.border.default}`,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    borderBottom: `1px solid ${theme.colors.border.default}`,
    paddingBottom: theme.spacing.xs,
  };

  const itemListStyle: CSSProperties = {
    maxHeight: "150px",
    overflowY: "auto",
  };

  const itemRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: `${theme.spacing.xs}px 0`,
    fontSize: theme.typography.fontSize.sm,
  };

  const totalRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTop: `1px solid ${theme.colors.border.default}`,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
  };

  const buttonStyle: CSSProperties = {
    width: "100%",
    padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    cursor: "pointer",
    transition: "all 0.2s ease",
    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
    background: buttonHover
      ? theme.colors.state.info
      : `${theme.colors.state.info}cc`,
    color: "#fff",
    border: `1px solid ${theme.colors.state.info}`,
    transform: buttonHover ? "translateY(-1px)" : "none",
  };

  const renderItemList = (items: DuelResultItem[], colorOverride?: string) => {
    if (items.length === 0) {
      return (
        <p
          style={{
            color: theme.colors.text.muted,
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          No items
        </p>
      );
    }

    return (
      <div style={itemListStyle}>
        {items.map((item, index) => {
          const itemData = getItem(item.itemId);
          const name = itemData?.name || item.itemId;
          const qtyStr =
            item.quantity > 1 ? ` x${item.quantity.toLocaleString()}` : "";

          return (
            <div key={`${item.itemId}-${index}`} style={itemRowStyle}>
              <span
                style={{ color: colorOverride || theme.colors.text.primary }}
              >
                {name}
                {qtyStr}
              </span>
              <span style={{ color: "#ffd700" }}>
                {formatValue(item.value)} gp
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <ModalWindow
      visible={state.visible}
      onClose={handleClose}
      title="Duel Complete"
      width={380}
      showCloseButton={false}
    >
      <div style={{ padding: theme.spacing.sm }}>
        {/* Result header */}
        <div style={resultHeaderStyle}>
          <div style={iconStyle}>{isWinner ? "🏆" : "💀"}</div>
          <div style={titleStyle}>{isWinner ? "Victory!" : "Defeat"}</div>
          <div style={subtitleStyle}>
            {isWinner
              ? `You defeated ${state.opponentName}!`
              : `You were defeated by ${state.opponentName}`}
            {state.forfeit && !isWinner && " (forfeit)"}
          </div>
        </div>

        {/* Items section */}
        {hasItems && (
          <>
            {isWinner && state.itemsReceived.length > 0 && (
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Items Won</div>
                {renderItemList(
                  state.itemsReceived,
                  theme.colors.state.success,
                )}
                <div style={totalRowStyle}>
                  <span>Total Value:</span>
                  <span style={{ color: theme.colors.state.success }}>
                    +{formatValue(state.totalValueWon)} gp
                  </span>
                </div>
              </div>
            )}

            {!isWinner && state.itemsLost.length > 0 && (
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Items Lost</div>
                {renderItemList(state.itemsLost, theme.colors.state.danger)}
                <div style={totalRowStyle}>
                  <span>Total Value:</span>
                  <span style={{ color: theme.colors.state.danger }}>
                    -{formatValue(state.totalValueLost)} gp
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* No stakes message */}
        {!hasItems && (
          <div style={{ ...sectionStyle, textAlign: "center" }}>
            <p style={{ color: theme.colors.text.muted }}>
              {isWinner
                ? "No items were staked in this duel."
                : "You didn't lose any items."}
            </p>
          </div>
        )}

        {/* Close button */}
        <button
          onClick={handleClose}
          style={buttonStyle}
          onMouseEnter={() => setButtonHover(true)}
          onMouseLeave={() => setButtonHover(false)}
        >
          Continue
        </button>
      </div>
    </ModalWindow>
  );
}

// ============================================================================
// Default State Factory
// ============================================================================

export function createDefaultDuelResultState(): DuelResultState {
  return {
    visible: false,
    won: false,
    opponentName: "",
    itemsReceived: [],
    itemsLost: [],
    totalValueWon: 0,
    totalValueLost: 0,
    forfeit: false,
  };
}
