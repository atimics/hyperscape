import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: "var(--gold-essence)",
          light: "var(--gold-flame)",
          dark: "var(--gold-dim)",
        },
        bg: {
          darkest: "var(--bg-depth)",
          primary: "var(--bg-surface)",
          secondary: "#18181a", // Keeping for legacy support for now
        },
        glass: {
          DEFAULT: "var(--glass-surface)",
          border: "var(--glass-border)",
          highlight: "var(--glass-highlight)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      fontSize: {
        hero: ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "hero-mobile": [
          "2.25rem",
          { lineHeight: "1.2", letterSpacing: "-0.01em" },
        ],
      },
      backdropBlur: {
        glass: "var(--blur-glass)",
        deep: "var(--blur-deep)",
      },
      dropShadow: {
        gold: "0 0 20px rgba(212, 168, 75, 0.6)",
        "gold-lg": "0 0 40px rgba(212, 168, 75, 0.8)",
      },
      animation: {
        "slow-zoom": "slowZoom 60s ease-in-out infinite alternate",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        slowZoom: {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(1.08)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      backgroundImage: {
        "gradient-gold":
          "linear-gradient(90deg, transparent, rgba(212, 168, 75, 0.4) 14%, rgba(255, 216, 102, 0.6) 50%, rgba(212, 168, 75, 0.4) 86%, transparent)",
      },
      boxShadow: {
        panel:
          "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 90, 43, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
