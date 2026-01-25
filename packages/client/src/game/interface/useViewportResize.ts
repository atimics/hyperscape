/**
 * useViewportResize - Handle viewport resize and window repositioning
 *
 * Uses anchor-based positioning (like Unity/Unreal) where windows maintain
 * their position relative to a specific viewport edge/corner.
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useWindowStore } from "@/ui";
import {
  repositionWindowForViewport,
  detectNearestAnchor,
  getDefaultAnchor,
  getDefaultPositionForAnchor,
} from "@/ui/stores/anchorUtils";

/** Mobile breakpoint threshold */
const MOBILE_BREAKPOINT = 768;

/**
 * Hook for handling viewport resize and window repositioning
 *
 * @returns Object with isMobile state and viewport ref
 */
export function useViewportResize() {
  // UI state - detect mobile viewport
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== "undefined"
      ? window.innerWidth < MOBILE_BREAKPOINT
      : false,
  );

  // Track previous viewport size for responsive repositioning
  const prevViewportRef = useRef<{ width: number; height: number }>({
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
  });

  // Track previous mobile state to detect mobile <-> desktop transitions
  const wasMobileRef = useRef<boolean>(
    typeof window !== "undefined"
      ? window.innerWidth < MOBILE_BREAKPOINT
      : false,
  );

  // Viewport resize handling
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      const prevWidth = prevViewportRef.current.width;
      const prevHeight = prevViewportRef.current.height;
      const wasMobile = wasMobileRef.current;
      const nowMobile = newWidth < MOBILE_BREAKPOINT;

      setIsMobile(nowMobile);

      // Debounce the window repositioning
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Detect mobile <-> desktop UI mode transition
        const transitionedFromMobile = wasMobile && !nowMobile;
        const transitionedToMobile = !wasMobile && nowMobile;

        // Update mobile state tracking
        wasMobileRef.current = nowMobile;

        // On mobile <-> desktop transition, reset windows to their default anchor positions
        // Mobile and desktop use completely different layouts, so we can't preserve offsets
        if (transitionedFromMobile || transitionedToMobile) {
          const allWindows = useWindowStore.getState().getAllWindows();
          const windowStoreUpdate = useWindowStore.getState().updateWindow;
          const newViewport = { width: newWidth, height: newHeight };

          // For mobile->desktop transition, place each window at its default anchor position
          // This means flush with the anchor edge (zero offset from anchor)
          allWindows.forEach((win) => {
            // Get anchor from window or determine from ID
            const anchor = win.anchor ?? getDefaultAnchor(win.id);

            // Get the default position for this anchor (flush with edge)
            const newPosition = getDefaultPositionForAnchor(
              win.size,
              anchor,
              newViewport,
            );

            windowStoreUpdate(win.id, {
              position: {
                x: Math.round(newPosition.x),
                y: Math.round(newPosition.y),
              },
              anchor,
            });
          });

          // Update tracked viewport size
          prevViewportRef.current = { width: newWidth, height: newHeight };
          return;
        }

        // Skip if viewport hasn't actually changed
        if (newWidth === prevWidth && newHeight === prevHeight) return;

        // Get all windows and reposition them using anchor-based positioning
        const allWindows = useWindowStore.getState().getAllWindows();
        const windowStoreUpdate = useWindowStore.getState().updateWindow;

        const oldViewport = { width: prevWidth, height: prevHeight };
        const newViewport = { width: newWidth, height: newHeight };

        allWindows.forEach((win) => {
          // Use window's anchor if set, otherwise detect from position or use default
          const anchor =
            win.anchor ??
            detectNearestAnchor(win.position, win.size, oldViewport) ??
            getDefaultAnchor(win.id);

          // Reposition window using anchor-based calculation
          const newPosition = repositionWindowForViewport(
            win.position,
            win.size,
            anchor,
            oldViewport,
            newViewport,
          );

          // Only update if position actually changed
          const roundedX = Math.round(newPosition.x);
          const roundedY = Math.round(newPosition.y);
          if (roundedX !== win.position.x || roundedY !== win.position.y) {
            windowStoreUpdate(win.id, {
              position: { x: roundedX, y: roundedY },
              // Also save the anchor if it wasn't already set
              ...(win.anchor === undefined ? { anchor } : {}),
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
