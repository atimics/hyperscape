/**
 * Trade Request Modal
 *
 * Modal displayed when another player sends a trade request.
 * Shows the requesting player's name and combat level with
 * Accept/Decline buttons.
 *
 * Design follows OSRS/RS3 style with dark fantasy theme.
 */

import { createPortal } from "react-dom";
import type { TradeRequestModalState } from "@hyperscape/shared";

interface TradeRequestModalProps {
  state: TradeRequestModalState;
  onAccept: () => void;
  onDecline: () => void;
}

export function TradeRequestModal({
  state,
  onAccept,
  onDecline,
}: TradeRequestModalProps) {
  if (!state.visible || !state.fromPlayer) return null;

  const { name, level } = state.fromPlayer;

  // Use yellow for trade requests since combat isn't involved
  const levelColor = "#ffff00";

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={onDecline}
    >
      <div
        className="rounded-lg p-5 shadow-xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(30, 25, 20, 0.98) 0%, rgba(20, 15, 10, 0.98) 100%)",
          border: "2px solid rgba(139, 69, 19, 0.8)",
          minWidth: "320px",
          maxWidth: "400px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h3
          className="text-lg font-bold mb-4 text-center"
          style={{ color: "rgba(242, 208, 138, 0.95)" }}
        >
          Trade Request
        </h3>

        {/* Player info */}
        <div
          className="mb-5 p-3 rounded text-center"
          style={{
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(139, 69, 19, 0.4)",
          }}
        >
          <p
            className="text-base mb-1"
            style={{ color: "rgba(255, 255, 255, 0.9)" }}
          >
            <span style={{ color: "#ffffff", fontWeight: "bold" }}>{name}</span>
            <span style={{ color: "rgba(255, 255, 255, 0.7)" }}> (Level: </span>
            <span style={{ color: levelColor, fontWeight: "bold" }}>
              {level}
            </span>
            <span style={{ color: "rgba(255, 255, 255, 0.7)" }}>)</span>
          </p>
          <p className="text-sm" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
            wishes to trade with you
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 rounded text-sm font-bold transition-all"
            style={{
              background:
                "linear-gradient(135deg, rgba(46, 204, 113, 0.8) 0%, rgba(39, 174, 96, 0.8) 100%)",
              color: "#fff",
              border: "1px solid rgba(46, 204, 113, 0.9)",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(135deg, rgba(46, 204, 113, 1) 0%, rgba(39, 174, 96, 1) 100%)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(135deg, rgba(46, 204, 113, 0.8) 0%, rgba(39, 174, 96, 0.8) 100%)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Accept
          </button>
          <button
            onClick={onDecline}
            className="flex-1 py-2.5 rounded text-sm font-bold transition-all"
            style={{
              background:
                "linear-gradient(135deg, rgba(192, 57, 43, 0.8) 0%, rgba(169, 50, 38, 0.8) 100%)",
              color: "#fff",
              border: "1px solid rgba(192, 57, 43, 0.9)",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(135deg, rgba(192, 57, 43, 1) 0%, rgba(169, 50, 38, 1) 100%)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(135deg, rgba(192, 57, 43, 0.8) 0%, rgba(169, 50, 38, 0.8) 100%)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Decline
          </button>
        </div>

        {/* Timeout hint */}
        <p
          className="text-xs mt-3 text-center"
          style={{ color: "rgba(255, 255, 255, 0.4)" }}
        >
          Request expires in 30 seconds
        </p>
      </div>
    </div>,
    document.body,
  );
}
