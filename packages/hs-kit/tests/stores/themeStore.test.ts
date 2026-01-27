/**
 * Tests for theme store
 *
 * Theme system uses "base" and "hyperscape" themes (both dark variants).
 * Legacy "dark"/"light" aliases map to base theme for backwards compatibility.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "../../src/stores/themeStore";
import { baseTheme, hyperscapeTheme } from "../../src/styled/themes";

describe("themeStore", () => {
  beforeEach(() => {
    // Reset to default hyperscape theme
    useThemeStore.getState().setTheme("hyperscape");
  });

  describe("initial state", () => {
    it("should default to hyperscape theme", () => {
      const state = useThemeStore.getState();
      expect(state.themeName).toBe("hyperscape");
      expect(state.theme.name).toBe("hyperscape");
    });
  });

  describe("setTheme", () => {
    it("should change to base theme", () => {
      useThemeStore.getState().setTheme("base");

      const state = useThemeStore.getState();
      expect(state.themeName).toBe("base");
      expect(state.theme).toEqual(baseTheme);
    });

    it("should change back to hyperscape theme", () => {
      useThemeStore.getState().setTheme("base");
      useThemeStore.getState().setTheme("hyperscape");

      const state = useThemeStore.getState();
      expect(state.themeName).toBe("hyperscape");
      expect(state.theme).toEqual(hyperscapeTheme);
    });
  });

  describe("toggleTheme", () => {
    it("should toggle from hyperscape to base", () => {
      useThemeStore.getState().toggleTheme();

      expect(useThemeStore.getState().themeName).toBe("base");
    });

    it("should toggle from base to hyperscape", () => {
      useThemeStore.getState().setTheme("base");
      useThemeStore.getState().toggleTheme();

      expect(useThemeStore.getState().themeName).toBe("hyperscape");
    });
  });

  describe("isBase/isHyperscape", () => {
    it("should correctly identify hyperscape theme", () => {
      expect(useThemeStore.getState().isHyperscape()).toBe(true);
      expect(useThemeStore.getState().isBase()).toBe(false);
    });

    it("should correctly identify base theme", () => {
      useThemeStore.getState().setTheme("base");

      expect(useThemeStore.getState().isHyperscape()).toBe(false);
      expect(useThemeStore.getState().isBase()).toBe(true);
    });
  });

  describe("isDark/isLight (legacy)", () => {
    it("should always report dark for both themes", () => {
      // Both themes are dark variants
      expect(useThemeStore.getState().isDark()).toBe(true);
      expect(useThemeStore.getState().isLight()).toBe(false);

      useThemeStore.getState().setTheme("base");
      expect(useThemeStore.getState().isDark()).toBe(true);
      expect(useThemeStore.getState().isLight()).toBe(false);
    });
  });
});

describe("theme objects", () => {
  describe("baseTheme", () => {
    it("should have required color properties", () => {
      expect(baseTheme.colors.background.primary).toBeDefined();
      expect(baseTheme.colors.text.primary).toBeDefined();
      expect(baseTheme.colors.accent.primary).toBeDefined();
    });

    it("should have spacing values", () => {
      expect(baseTheme.spacing.xs).toBe(4);
      expect(baseTheme.spacing.sm).toBe(8);
      expect(baseTheme.spacing.md).toBe(16);
    });

    it("should have typography values", () => {
      expect(baseTheme.typography.fontFamily).toBeDefined();
      expect(baseTheme.typography.fontSize.base).toBeDefined();
    });
  });

  describe("hyperscapeTheme", () => {
    it("should have different background colors than base", () => {
      expect(hyperscapeTheme.colors.background.primary).not.toBe(
        baseTheme.colors.background.primary,
      );
    });

    it("should have same spacing as base theme", () => {
      expect(hyperscapeTheme.spacing).toEqual(baseTheme.spacing);
    });
  });
});
