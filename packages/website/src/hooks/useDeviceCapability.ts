"use client";

import { useState, useEffect } from "react";
import { getGPUTier } from "detect-gpu";

export type DeviceTier = "high" | "medium" | "low";

export function useDeviceCapability(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>("high");

  useEffect(() => {
    async function detectCapability() {
      try {
        const gpuTier = await getGPUTier();
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const memory =
          (navigator as typeof globalThis.navigator & { deviceMemory?: number })
            .deviceMemory || 4;
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

        // Force low tier if user prefers reduced motion
        if (prefersReducedMotion) {
          setTier("low");
          return;
        }

        // Determine tier based on GPU, memory, and device type
        if (gpuTier.tier < 2 || memory < 4 || (isMobile && gpuTier.tier < 3)) {
          setTier("low");
        } else if (isMobile || gpuTier.tier < 3) {
          setTier("medium");
        } else {
          setTier("high");
        }
      } catch {
        // Default to medium if detection fails
        setTier("medium");
      }
    }

    detectCapability();
  }, []);

  return tier;
}

/**
 * Get particle count based on device tier
 */
export function getParticleCount(tier: DeviceTier): number {
  switch (tier) {
    case "high":
      return 2000;
    case "medium":
      return 500;
    case "low":
      return 0; // CSS fallback
  }
}

/**
 * Check if 3D effects should be enabled
 */
export function shouldEnable3D(tier: DeviceTier): boolean {
  return tier !== "low";
}
