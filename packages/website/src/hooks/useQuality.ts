"use client";

import { useState, useEffect } from "react";
import { getGPUTier, type TierResult } from "detect-gpu";

export type QualityTier = "potato" | "console" | "ultra";

interface QualityState {
  tier: QualityTier;
  details: {
    pixelRatio: number | [number, number];
    particles: number;
    postProcessing: boolean;
    physics: boolean;
  };
}

const QUALITY_SETTINGS: Record<QualityTier, QualityState["details"]> = {
  potato: {
    pixelRatio: 1,
    particles: 0,
    postProcessing: false,
    physics: false,
  },
  console: {
    pixelRatio: [1, 1.5],
    particles: 25,
    postProcessing: false,
    physics: true,
  },
  ultra: {
    pixelRatio: [1, 2],
    particles: 50,
    postProcessing: true,
    physics: true,
  },
};

export function useQuality() {
  const [quality, setQuality] = useState<QualityState>({
    tier: "console", // Default sage
    details: QUALITY_SETTINGS.console,
  });

  useEffect(() => {
    async function detect() {
      // Fallback for SSR or initial load
      if (typeof window === "undefined") return;

      try {
        const tier = await getGPUTier();

        // Logic to map GPU tier to our quality tiers
        let qualityTier: QualityTier = "console";

        if (tier.isMobile || tier.tier < 2) {
          qualityTier = "potato";
        } else if (tier.tier >= 3 && !tier.isMobile) {
          qualityTier = "ultra";
        }

        // Allow manual override via URL param for testing
        const params = new URLSearchParams(window.location.search);
        if (params.get("quality")) {
          const paramTier = params.get("quality") as QualityTier;
          if (QUALITY_SETTINGS[paramTier]) {
            qualityTier = paramTier;
          }
        }

        setQuality({
          tier: qualityTier,
          details: QUALITY_SETTINGS[qualityTier],
        });
      } catch (e) {
        console.warn("GPU detection failed, falling back to console tier", e);
      }
    }

    detect();
  }, []);

  return quality;
}
