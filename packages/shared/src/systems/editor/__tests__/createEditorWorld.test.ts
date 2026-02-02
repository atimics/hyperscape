/**
 * createEditorWorld Tests
 *
 * Comprehensive tests for the editor world factory including:
 * - World creation with default options
 * - Conditional system registration
 * - Camera position/target initialization
 * - EditorWorld class properties
 * - Integration between systems
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as THREE from "three";
import {
  createEditorWorld,
  initEditorWorld,
  EditorWorld,
  type EditorWorldOptions,
} from "../../../runtime/createEditorWorld";

// We need to partially mock THREE.js controls
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

vi.mock("three/examples/jsm/controls/TransformControls.js", () => {
  class MockTransformControls {
    object = null;
    mode = "translate";
    space = "world";
    enabled = true;
    setMode = vi.fn();
    setSpace = vi.fn();
    setSize = vi.fn();
    setTranslationSnap = vi.fn();
    setRotationSnap = vi.fn();
    setScaleSnap = vi.fn();
    attach = vi.fn();
    detach = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    dispose = vi.fn();
  }
  return { TransformControls: MockTransformControls };
});

describe("createEditorWorld", () => {
  // ============================================================================
  // BASIC CREATION TESTS
  // ============================================================================
  describe("basic creation", () => {
    it("should create an EditorWorld instance", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world).toBeInstanceOf(EditorWorld);
      expect(world.isEditor).toBe(true);
    });

    it("should store viewport reference", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world.editorViewport).toBe(viewport);
    });

    it("should store options", () => {
      const viewport = document.createElement("div");
      const options: EditorWorldOptions = {
        viewport,
        enableTerrain: true,
        enableGrass: false,
      };
      const world = createEditorWorld(options);

      expect(world.editorOptions).toBeDefined();
      expect(world.editorOptions?.enableGrass).toBe(false);
    });

    it("should set initial camera position from options", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({
        viewport,
        cameraPosition: { x: 200, y: 100, z: 200 },
      });

      expect(world.camera.position.x).toBe(200);
      expect(world.camera.position.y).toBe(100);
      expect(world.camera.position.z).toBe(200);
    });

    it("should use default camera position when not specified", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      // Default is (100, 100, 100)
      expect(world.camera.position.x).toBe(100);
      expect(world.camera.position.y).toBe(100);
      expect(world.camera.position.z).toBe(100);
    });

    it("should store initial camera target for later application", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({
        viewport,
        cameraTarget: { x: 50, y: 0, z: 50 },
      });

      expect(world._initialCameraTarget).toBeDefined();
      expect(world._initialCameraTarget?.x).toBe(50);
      expect(world._initialCameraTarget?.z).toBe(50);
    });
  });

  // ============================================================================
  // SYSTEM REGISTRATION TESTS
  // ============================================================================
  describe("system registration", () => {
    it("should register core systems by default", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      // Check core systems are registered
      expect(world.getSystem("settings")).toBeDefined();
      expect(world.getSystem("stage")).toBeDefined();
      expect(world.getSystem("graphics")).toBeDefined();
      expect(world.getSystem("environment")).toBeDefined();
      expect(world.getSystem("wind")).toBeDefined();
      expect(world.getSystem("lods")).toBeDefined();
    });

    it("should register editor systems", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world.getSystem("editor-camera")).toBeDefined();
      expect(world.getSystem("editor-selection")).toBeDefined();
      expect(world.getSystem("editor-gizmo")).toBeDefined();
    });

    it("should register terrain when enableTerrain is true (default)", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world.getSystem("terrain")).toBeDefined();
    });

    it("should not register terrain when enableTerrain is false", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport, enableTerrain: false });

      expect(world.getSystem("terrain")).toBeUndefined();
    });

    it("should register vegetation when enableVegetation is true (default)", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world.getSystem("vegetation")).toBeDefined();
    });

    it("should not register vegetation when enableVegetation is false", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport, enableVegetation: false });

      expect(world.getSystem("vegetation")).toBeUndefined();
    });

    it("should register grass when enableGrass is true (default)", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world.getSystem("grass")).toBeDefined();
    });

    it("should not register grass when enableGrass is false", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport, enableGrass: false });

      expect(world.getSystem("grass")).toBeUndefined();
    });

    it("should register flowers when enableFlowers is true (default)", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world.getSystem("flowers")).toBeDefined();
    });

    it("should not register flowers when enableFlowers is false", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport, enableFlowers: false });

      expect(world.getSystem("flowers")).toBeUndefined();
    });

    it("should register towns when enableTowns is true (default)", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world.getSystem("towns")).toBeDefined();
      expect(world.getSystem("pois")).toBeDefined();
    });

    it("should not register towns when enableTowns is false", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport, enableTowns: false });

      expect(world.getSystem("towns")).toBeUndefined();
      expect(world.getSystem("pois")).toBeUndefined();
    });

    it("should register roads when enableRoads is true (default)", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world.getSystem("roads")).toBeDefined();
    });

    it("should not register roads when enableRoads is false", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport, enableRoads: false });

      expect(world.getSystem("roads")).toBeUndefined();
    });

    it("should register buildings when enableBuildings is true (default)", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });

      expect(world.getSystem("building-rendering")).toBeDefined();
    });

    it("should not register buildings when enableBuildings is false", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport, enableBuildings: false });

      expect(world.getSystem("building-rendering")).toBeUndefined();
    });

    it("should create minimal world with all optional systems disabled", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({
        viewport,
        enableTerrain: false,
        enableVegetation: false,
        enableGrass: false,
        enableFlowers: false,
        enableTowns: false,
        enableRoads: false,
        enableBuildings: false,
        enableWater: false,
      });

      // Core systems should still be present
      expect(world.getSystem("settings")).toBeDefined();
      expect(world.getSystem("stage")).toBeDefined();
      expect(world.getSystem("graphics")).toBeDefined();

      // Editor systems should still be present
      expect(world.getSystem("editor-camera")).toBeDefined();
      expect(world.getSystem("editor-selection")).toBeDefined();
      expect(world.getSystem("editor-gizmo")).toBeDefined();

      // Optional systems should be absent
      expect(world.getSystem("terrain")).toBeUndefined();
      expect(world.getSystem("vegetation")).toBeUndefined();
      expect(world.getSystem("grass")).toBeUndefined();
    });
  });

  // ============================================================================
  // EDITORWORLD CLASS TESTS
  // ============================================================================
  describe("EditorWorld class", () => {
    it("should have isEditor flag set to true", () => {
      const world = new EditorWorld();
      expect(world.isEditor).toBe(true);
    });

    it("should start with null editor system references", () => {
      const world = new EditorWorld();
      expect(world.editorCamera).toBeNull();
      expect(world.editorSelection).toBeNull();
      expect(world.editorGizmo).toBeNull();
    });

    it("should start with null editorViewport", () => {
      const world = new EditorWorld();
      expect(world.editorViewport).toBeNull();
    });

    it("should start with null editorOptions", () => {
      const world = new EditorWorld();
      expect(world.editorOptions).toBeNull();
    });

    it("should start with undefined _initialCameraTarget", () => {
      const world = new EditorWorld();
      expect(world._initialCameraTarget).toBeUndefined();
    });
  });

  // ============================================================================
  // OPTION DEFAULT TESTS
  // ============================================================================
  describe("option defaults", () => {
    it("should default enableTerrain to true", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });
      expect(world.getSystem("terrain")).toBeDefined();
    });

    it("should default enableVegetation to true", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });
      expect(world.getSystem("vegetation")).toBeDefined();
    });

    it("should default enableGrass to true", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });
      expect(world.getSystem("grass")).toBeDefined();
    });

    it("should default enableFlowers to true", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });
      expect(world.getSystem("flowers")).toBeDefined();
    });

    it("should default enableTowns to true", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });
      expect(world.getSystem("towns")).toBeDefined();
    });

    it("should default enableRoads to true", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });
      expect(world.getSystem("roads")).toBeDefined();
    });

    it("should default enableBuildings to true", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });
      expect(world.getSystem("building-rendering")).toBeDefined();
    });

    it("should default enableWater to false", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({ viewport });
      // Water system would be under "water" key if enabled
      // Since default is false, it shouldn't be registered
      expect(world.getSystem("water")).toBeUndefined();
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================
  describe("edge cases", () => {
    it("should handle empty viewport gracefully", () => {
      const viewport = document.createElement("div");
      // Empty viewport (no size)
      expect(() => createEditorWorld({ viewport })).not.toThrow();
    });

    it("should handle camera position with negative values", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({
        viewport,
        cameraPosition: { x: -100, y: -50, z: -100 },
      });

      expect(world.camera.position.x).toBe(-100);
      expect(world.camera.position.y).toBe(-50);
      expect(world.camera.position.z).toBe(-100);
    });

    it("should handle zero camera position", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({
        viewport,
        cameraPosition: { x: 0, y: 0, z: 0 },
      });

      expect(world.camera.position.x).toBe(0);
      expect(world.camera.position.y).toBe(0);
      expect(world.camera.position.z).toBe(0);
    });

    it("should handle very large camera position", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({
        viewport,
        cameraPosition: { x: 10000, y: 5000, z: 10000 },
      });

      expect(world.camera.position.x).toBe(10000);
      expect(world.camera.position.y).toBe(5000);
      expect(world.camera.position.z).toBe(10000);
    });

    it("should handle partial camera target", () => {
      const viewport = document.createElement("div");
      const world = createEditorWorld({
        viewport,
        cameraTarget: { x: 100, y: 0, z: 100 },
      });

      expect(world._initialCameraTarget).toBeDefined();
      expect(world._initialCameraTarget?.y).toBe(0);
    });
  });

  // ============================================================================
  // MULTIPLE WORLDS
  // ============================================================================
  describe("multiple worlds", () => {
    it("should create independent world instances", () => {
      const viewport1 = document.createElement("div");
      const viewport2 = document.createElement("div");

      const world1 = createEditorWorld({
        viewport: viewport1,
        cameraPosition: { x: 100, y: 100, z: 100 },
      });
      const world2 = createEditorWorld({
        viewport: viewport2,
        cameraPosition: { x: 200, y: 200, z: 200 },
      });

      expect(world1.camera.position.x).toBe(100);
      expect(world2.camera.position.x).toBe(200);
      expect(world1).not.toBe(world2);
    });

    it("should have independent system registrations", () => {
      const viewport1 = document.createElement("div");
      const viewport2 = document.createElement("div");

      const world1 = createEditorWorld({
        viewport: viewport1,
        enableTerrain: true,
      });
      const world2 = createEditorWorld({
        viewport: viewport2,
        enableTerrain: false,
      });

      expect(world1.getSystem("terrain")).toBeDefined();
      expect(world2.getSystem("terrain")).toBeUndefined();
    });
  });
});

describe("initEditorWorld", () => {
  // Note: Full integration tests for initEditorWorld would require
  // mocking the entire system initialization chain, which is complex.
  // These tests focus on the function's basic behavior.

  it("should be a function", () => {
    expect(typeof initEditorWorld).toBe("function");
  });

  it("should return a Promise", () => {
    const viewport = document.createElement("div");
    const result = initEditorWorld({ viewport });
    expect(result).toBeInstanceOf(Promise);
    // Clean up - destroy world to avoid hanging promises
    result.then((world) => world.destroy()).catch(() => {});
  });
});
