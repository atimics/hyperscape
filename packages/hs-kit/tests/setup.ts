import { afterEach, vi } from "vitest";

// Mock window dimensions without replacing the entire window object
// This preserves the jsdom environment needed by testing-library
Object.defineProperty(window, "innerWidth", { value: 1920, writable: true });
Object.defineProperty(window, "innerHeight", { value: 1080, writable: true });

// Reset document between tests
afterEach(() => {
  document.body.innerHTML = "";
});
