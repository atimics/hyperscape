/**
 * Theme constants for Hyperscape website
 * Based on the game client's design system
 */

export const colors = {
  // Brand / Accent
  gold: {
    DEFAULT: "#d4a84b",
    light: "#ffd866",
    dark: "#c49530",
  },
  // Backgrounds
  bg: {
    darkest: "#0a0a0c",
    primary: "#141416",
    secondary: "#18181a",
    tertiary: "#1e1e22",
    overlay: "rgba(0, 0, 0, 0.75)",
  },
  // Text
  text: {
    primary: "#f5f0e8",
    secondary: "#c4b896",
    muted: "#7d7460",
  },
  // Borders
  border: {
    subtle: "#2d2820",
    bronze: "#8b6914",
    focus: "#e8c55a",
  },
  // Semantic
  success: "#4ade80",
  error: "#f87171",
  warning: "#fbbf24",
  info: "#60a5fa",
};

export const effects = {
  glassmorphism: {
    background: "rgba(10, 10, 12, 0.85)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(45, 40, 32, 0.5)",
  },
  goldGlow: "drop-shadow(0 0 20px rgba(212, 168, 75, 0.6))",
  goldGlowLarge: "drop-shadow(0 0 40px rgba(212, 168, 75, 0.8))",
  panelShadow:
    "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 90, 43, 0.2)",
};

export const gradients = {
  gold: "linear-gradient(90deg, transparent, rgba(212, 168, 75, 0.4) 14%, rgba(255, 216, 102, 0.6) 50%, rgba(212, 168, 75, 0.4) 86%, transparent)",
  button: "linear-gradient(135deg, #d4a84b 0%, #c49530 100%)",
  buttonHover: "linear-gradient(135deg, #e8be5a 0%, #d4a84b 100%)",
  panel: "linear-gradient(180deg, #1e1e22 0%, #141416 100%)",
};

export const animation = {
  duration: {
    fast: "150ms",
    normal: "300ms",
    slow: "500ms",
  },
  easing: {
    default: "cubic-bezier(0.4, 0, 0.2, 1)",
    spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
    bounce: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
  },
};
