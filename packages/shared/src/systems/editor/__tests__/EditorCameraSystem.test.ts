/**
 * EditorCameraSystem Tests
 *
 * Comprehensive tests for camera controls including:
 * - Mode switching (orbit/pan/fly)
 * - Camera focus functionality
 * - Bookmark management
 * - Fly mode movement calculations
 * - Edge cases and boundary conditions
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import {
  EditorCameraSystem,
  type EditorCameraMode,
  type EditorCameraConfig,
  type CameraBookmark,
} from "../EditorCameraSystem";

// Mock OrbitControls
vi.mock("three/examples/jsm/controls/OrbitControls.js", () => {
  class MockOrbitControls {
    target = new THREE.Vector3();
    enableDamping = false;
    dampingFactor = 0.1;
    minDistance = 1;
    maxDistance = 2000;
    enableZoom = true;
    enablePan = true;
    enableRotate = true;
    panSpeed = 1;
    rotateSpeed = 1;
    zoomSpeed = 1;
    screenSpacePanning = false;
    mouseButtons: Record<string, unknown> = {};
    update = vi.fn();
    dispose = vi.fn();
  }
  return { OrbitControls: MockOrbitControls };
});

// Create a minimal mock world for testing
function createMockWorld() {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(50, 50, 50);

  return {
    camera,
    graphics: {
      renderer: {
        domElement: document.createElement("canvas"),
      },
    },
    stage: {
      scene: new THREE.Scene(),
    },
    getSystem: vi.fn(),
  };
}

describe("EditorCameraSystem", () => {
  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const world = createMockWorld();
      const system = new EditorCameraSystem(world as never);

      expect(system.getMode()).toBe("orbit");
    });

    it("should accept custom config", () => {
      const world = createMockWorld();
      const config: Partial<EditorCameraConfig> = {
        initialMode: "fly",
        flySpeed: 100,
        flyFastMultiplier: 5,
      };
      const system = new EditorCameraSystem(world as never, config);

      expect(system.getMode()).toBe("fly");
    });

    it("should declare correct dependencies", () => {
      const world = createMockWorld();
      const system = new EditorCameraSystem(world as never);
      const deps = system.getDependencies();

      expect(deps.required).toContain("stage");
      expect(deps.required).toContain("graphics");
    });
  });

  // ============================================================================
  // MODE SWITCHING TESTS
  // ============================================================================
  describe("mode switching", () => {
    let world: ReturnType<typeof createMockWorld>;
    let system: EditorCameraSystem;

    beforeEach(async () => {
      world = createMockWorld();
      system = new EditorCameraSystem(world as never);
      await system.init({});
    });

    it("should switch to orbit mode", () => {
      system.setMode("orbit");
      expect(system.getMode()).toBe("orbit");
    });

    it("should switch to pan mode", () => {
      system.setMode("pan");
      expect(system.getMode()).toBe("pan");
    });

    it("should switch to fly mode", () => {
      system.setMode("fly");
      expect(system.getMode()).toBe("fly");
    });

    it("should emit mode-changed event on mode switch", async () => {
      const listener = vi.fn();
      system.on("mode-changed", listener);

      system.setMode("fly");

      expect(listener).toHaveBeenCalledWith({ mode: "fly" });
    });

    it("should handle rapid mode switching", () => {
      const modes: EditorCameraMode[] = ["orbit", "pan", "fly", "orbit", "pan"];
      modes.forEach((mode) => system.setMode(mode));

      expect(system.getMode()).toBe("pan");
    });
  });

  // ============================================================================
  // CAMERA FOCUS TESTS
  // ============================================================================
  describe("camera focus", () => {
    let world: ReturnType<typeof createMockWorld>;
    let system: EditorCameraSystem;

    beforeEach(async () => {
      world = createMockWorld();
      system = new EditorCameraSystem(world as never);
      await system.init({});
    });

    it("should focus on a specific point", () => {
      const target = new THREE.Vector3(100, 0, 100);
      system.focusOn(target);

      const resultTarget = system.getTarget();
      expect(resultTarget.x).toBe(100);
      expect(resultTarget.z).toBe(100);
    });

    it("should focus with custom distance", () => {
      const target = new THREE.Vector3(0, 0, 0);
      system.focusOn(target, 50);

      // Camera should be at specified distance
      const distance = world.camera.position.distanceTo(target);
      expect(distance).toBeCloseTo(50, 1);
    });

    it("should clamp focus distance to min/max", () => {
      const target = new THREE.Vector3(0, 0, 0);

      // Try to focus with distance less than min (1)
      system.focusOn(target, 0.1);
      let distance = world.camera.position.distanceTo(target);
      expect(distance).toBeGreaterThanOrEqual(0.99); // Allow for floating point

      // Try to focus with distance greater than max (2000)
      system.focusOn(target, 5000);
      distance = world.camera.position.distanceTo(target);
      expect(distance).toBeLessThanOrEqual(2001); // Allow for floating point
    });

    it("should emit focus-changed event", () => {
      const listener = vi.fn();
      system.on("focus-changed", listener);

      const target = new THREE.Vector3(10, 20, 30);
      system.focusOn(target);

      expect(listener).toHaveBeenCalled();
      const event = listener.mock.calls[0][0];
      expect(event.target.x).toBe(10);
      expect(event.target.y).toBe(20);
      expect(event.target.z).toBe(30);
    });

    it("should focus on bounding box", () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-10, -10, -10),
        new THREE.Vector3(10, 10, 10),
      );

      system.focusOnBounds(box);

      // Target should be at box center (0, 0, 0)
      const target = system.getTarget();
      expect(target.x).toBeCloseTo(0, 5);
      expect(target.y).toBeCloseTo(0, 5);
      expect(target.z).toBeCloseTo(0, 5);
    });

    it("should handle degenerate bounding box (single point)", () => {
      const point = new THREE.Vector3(5, 5, 5);
      const box = new THREE.Box3(point.clone(), point.clone());

      // Should not throw
      expect(() => system.focusOnBounds(box)).not.toThrow();
    });
  });

  // ============================================================================
  // BOOKMARK TESTS
  // ============================================================================
  describe("bookmarks", () => {
    let world: ReturnType<typeof createMockWorld>;
    let system: EditorCameraSystem;

    beforeEach(async () => {
      world = createMockWorld();
      system = new EditorCameraSystem(world as never);
      await system.init({});
    });

    it("should save a bookmark", () => {
      world.camera.position.set(100, 50, 100);
      system.saveBookmark("test-view");

      const bookmarks = system.getBookmarks();
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].name).toBe("test-view");
    });

    it("should load a bookmark", () => {
      // Save bookmark at specific position
      world.camera.position.set(100, 50, 100);
      system.saveBookmark("saved-pos");

      // Move camera elsewhere
      world.camera.position.set(0, 0, 0);

      // Load bookmark
      const loaded = system.loadBookmark("saved-pos");
      expect(loaded).toBe(true);
      expect(world.camera.position.x).toBe(100);
      expect(world.camera.position.y).toBe(50);
      expect(world.camera.position.z).toBe(100);
    });

    it("should return false when loading non-existent bookmark", () => {
      const loaded = system.loadBookmark("does-not-exist");
      expect(loaded).toBe(false);
    });

    it("should delete a bookmark", () => {
      system.saveBookmark("to-delete");
      expect(system.getBookmarks()).toHaveLength(1);

      const deleted = system.deleteBookmark("to-delete");
      expect(deleted).toBe(true);
      expect(system.getBookmarks()).toHaveLength(0);
    });

    it("should return false when deleting non-existent bookmark", () => {
      const deleted = system.deleteBookmark("does-not-exist");
      expect(deleted).toBe(false);
    });

    it("should emit events for bookmark operations", () => {
      const saveListener = vi.fn();
      const loadListener = vi.fn();
      const deleteListener = vi.fn();

      system.on("bookmark-saved", saveListener);
      system.on("bookmark-loaded", loadListener);
      system.on("bookmark-deleted", deleteListener);

      system.saveBookmark("test");
      expect(saveListener).toHaveBeenCalled();

      system.loadBookmark("test");
      expect(loadListener).toHaveBeenCalled();

      system.deleteBookmark("test");
      expect(deleteListener).toHaveBeenCalled();
    });

    it("should handle multiple bookmarks", () => {
      for (let i = 0; i < 10; i++) {
        world.camera.position.set(i * 10, i * 5, i * 10);
        system.saveBookmark(`view-${i}`);
      }

      expect(system.getBookmarks()).toHaveLength(10);
    });

    it("should overwrite bookmark with same name", () => {
      world.camera.position.set(100, 0, 0);
      system.saveBookmark("same-name");

      world.camera.position.set(200, 0, 0);
      system.saveBookmark("same-name");

      const bookmarks = system.getBookmarks();
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].position.x).toBe(200);
    });
  });

  // ============================================================================
  // FLY MODE MOVEMENT TESTS
  // ============================================================================
  describe("fly mode movement", () => {
    let world: ReturnType<typeof createMockWorld>;
    let system: EditorCameraSystem;

    beforeEach(async () => {
      world = createMockWorld();
      system = new EditorCameraSystem(world as never, { flySpeed: 50 });
      await system.init({});
      system.setMode("fly");
    });

    it("should not move when no keys pressed", () => {
      const startPos = world.camera.position.clone();
      system.update(0.016); // ~60 FPS
      const endPos = world.camera.position.clone();

      expect(endPos.distanceTo(startPos)).toBeLessThan(0.001);
    });

    it("should update controls on each tick", () => {
      system.update(0.016);
      const controls = system.getControls();
      expect(controls?.update).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // EDGE CASES AND ERROR HANDLING
  // ============================================================================
  describe("edge cases", () => {
    it("should handle initialization without graphics", async () => {
      const world = {
        camera: new THREE.PerspectiveCamera(),
        graphics: null,
        stage: { scene: new THREE.Scene() },
        getSystem: vi.fn(),
      };

      const system = new EditorCameraSystem(world as never);
      // Should not throw
      await expect(system.init({})).resolves.not.toThrow();
    });

    it("should handle focus when controls not initialized", async () => {
      const world = {
        camera: new THREE.PerspectiveCamera(),
        graphics: null,
        stage: { scene: new THREE.Scene() },
        getSystem: vi.fn(),
      };

      const system = new EditorCameraSystem(world as never);
      await system.init({});

      // Should not throw, just do nothing
      expect(() => system.focusOn(new THREE.Vector3(0, 0, 0))).not.toThrow();
    });

    it("should handle setTarget when controls not initialized", async () => {
      const world = {
        camera: new THREE.PerspectiveCamera(),
        graphics: null,
        stage: { scene: new THREE.Scene() },
        getSystem: vi.fn(),
      };

      const system = new EditorCameraSystem(world as never);
      await system.init({});

      expect(() => system.setTarget(new THREE.Vector3(0, 0, 0))).not.toThrow();
    });

    it("should cleanup properly on destroy", async () => {
      const world = createMockWorld();
      const system = new EditorCameraSystem(world as never);
      await system.init({});

      system.saveBookmark("test");
      expect(system.getBookmarks()).toHaveLength(1);

      system.destroy();
      expect(system.getBookmarks()).toHaveLength(0);
    });

    it("should return empty target when controls not initialized", () => {
      const world = {
        camera: new THREE.PerspectiveCamera(),
        graphics: null,
        stage: { scene: new THREE.Scene() },
        getSystem: vi.fn(),
      };

      const system = new EditorCameraSystem(world as never);
      const target = system.getTarget();

      expect(target.x).toBe(0);
      expect(target.y).toBe(0);
      expect(target.z).toBe(0);
    });
  });

  // ============================================================================
  // CONCURRENT/ASYNC BEHAVIOR
  // ============================================================================
  describe("concurrent operations", () => {
    it("should handle rapid bookmark save/load cycles", async () => {
      const world = createMockWorld();
      const system = new EditorCameraSystem(world as never);
      await system.init({});

      // Rapid save/load cycle
      for (let i = 0; i < 100; i++) {
        world.camera.position.set(i, i, i);
        system.saveBookmark("rapid");
        system.loadBookmark("rapid");
      }

      expect(world.camera.position.x).toBe(99);
    });

    it("should handle mode changes during update", async () => {
      const world = createMockWorld();
      const system = new EditorCameraSystem(world as never);
      await system.init({});

      // Shouldn't throw even with rapid state changes
      for (let i = 0; i < 10; i++) {
        system.setMode(i % 2 === 0 ? "fly" : "orbit");
        system.update(0.016);
      }
    });
  });
});
