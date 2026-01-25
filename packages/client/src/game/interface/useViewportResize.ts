/**
 * useViewportResize - Handle viewport resize and window repositioning
 *
 * Extracted from InterfaceManager to reduce file size and improve testability.
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useWindowStore } from "@/ui";

/**
 * Hook for handling viewport resize and window repositioning
 *
 * @returns Object with isMobile state and viewport ref
 */
export function useViewportResize() {
  // UI state - detect mobile viewport
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  // Track previous viewport size for responsive repositioning
  const prevViewportRef = useRef<{ width: number; height: number }>({
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
  });

  // Viewport resize handling
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      const prevWidth = prevViewportRef.current.width;
      const prevHeight = prevViewportRef.current.height;

      setIsMobile(newWidth < 768);

      // Debounce the window repositioning
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Skip if viewport hasn't actually changed
        if (newWidth === prevWidth && newHeight === prevHeight) return;

        // Calculate proportional scale factors
        const scaleX = newWidth / prevWidth;
        const scaleY = newHeight / prevHeight;

        // Get all windows and reposition them based on viewport change
        const allWindows = useWindowStore.getState().getAllWindows();
        const windowStoreUpdate = useWindowStore.getState().updateWindow;
        const minVisible = 50;

        allWindows.forEach((win) => {
          // Check if window was aligned to edges (within 20px threshold)
          const wasRightAligned =
            win.position.x + win.size.width >= prevWidth - 20;
          const wasBottomAligned =
            win.position.y + win.size.height >= prevHeight - 20;
          const wasLeftAligned = win.position.x <= 20;
          const wasTopAligned = win.position.y <= 80; // Account for header/toolbar

          let newX: number;
          let newY: number;

          // Handle edge-aligned windows specially to maintain their edge alignment
          if (wasRightAligned) {
            // Keep window aligned to right edge
            newX = newWidth - win.size.width;
          } else if (wasLeftAligned) {
            // Keep window aligned to left edge
            newX = win.position.x;
          } else {
            // Scale position proportionally for windows in the middle
            newX = win.position.x * scaleX;
          }

          if (wasBottomAligned) {
            // Keep window aligned to bottom edge
            newY = newHeight - win.size.height;
          } else if (wasTopAligned) {
            // Keep window aligned to top
            newY = win.position.y;
          } else {
            // Scale position proportionally for windows in the middle
            newY = win.position.y * scaleY;
          }

          // Clamp to ensure window is still visible (at least minVisible pixels)
          if (newX + win.size.width < minVisible) {
            newX = minVisible - win.size.width + 100;
          }
          if (newX > newWidth - minVisible) {
            newX = newWidth - minVisible;
          }
          if (newY + win.size.height < minVisible) {
            newY = minVisible - win.size.height + 100;
          }
          if (newY > newHeight - minVisible) {
            newY = newHeight - minVisible;
          }

          // Always update positions to ensure proper scaling
          const roundedX = Math.round(newX);
          const roundedY = Math.round(newY);
          if (roundedX !== win.position.x || roundedY !== win.position.y) {
            windowStoreUpdate(win.id, {
              position: { x: roundedX, y: roundedY },
            });
          }
        });

        // Update tracked viewport size
        prevViewportRef.current = { width: newWidth, height: newHeight };
      }, 100);
    };

    // Initial check
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, []);

  return {
    isMobile,
    prevViewportRef,
  };
}

/**
 * Hook for clamping position within viewport bounds
 */
export function usePositionClamping() {
  const clampToViewport = useCallback(
    (
      x: number,
      y: number,
      width: number,
      height: number,
    ): { x: number; y: number } => {
      const viewportWidth =
        typeof window !== "undefined" ? window.innerWidth : 1920;
      const viewportHeight =
        typeof window !== "undefined" ? window.innerHeight : 1080;
      const minVisible = 50;

      let newX = x;
      let newY = y;

      // Ensure window is visible
      if (newX + width < minVisible) {
        newX = minVisible - width + 100;
      }
      if (newX > viewportWidth - minVisible) {
        newX = viewportWidth - minVisible;
      }
      if (newY + height < minVisible) {
        newY = minVisible - height + 100;
      }
      if (newY > viewportHeight - minVisible) {
        newY = viewportHeight - minVisible;
      }

      return { x: Math.round(newX), y: Math.round(newY) };
    },
    [],
  );

  return { clampToViewport };
}
