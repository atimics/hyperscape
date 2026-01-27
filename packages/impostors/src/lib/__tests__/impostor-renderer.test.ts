/**
 * Impostor Renderer Tests
 *
 * Tests for both WebGL and WebGPU impostor materials and baking.
 * These tests verify the core functionality of the impostor system.
 *
 * Runs in browser environment via Playwright for WebGL/WebGPU support.
 */

import * as THREE from "three";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  OctahedralImpostor,
  OctahedronType,
  PBRBakeMode,
  createImpostorMaterial,
  createTSLImpostorMaterial,
  updateImpostorMaterial,
  updateImpostorAAALighting,
} from "../index";
import type { ImpostorViewData } from "../types";
import type { TSLImpostorMaterial } from "../ImpostorMaterialTSL";

// Create a test mesh
function createTestMesh(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  return new THREE.Mesh(geometry, material);
}

// Create a WebGL renderer for testing
function createTestWebGLRenderer(): THREE.WebGLRenderer {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(512, 512);
  return renderer;
}

// WebGL Baking and Instance Tests
describe("OctahedralImpostor (WebGL)", () => {
  let renderer: THREE.WebGLRenderer;
  let impostor: OctahedralImpostor;

  beforeEach(() => {
    renderer = createTestWebGLRenderer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    impostor = new OctahedralImpostor(renderer as any);
  });

  afterEach(() => {
    impostor.dispose();
    renderer.dispose();
  });

  describe("WebGL Baking", () => {
    it("should bake a basic impostor atlas", () => {
      const mesh = createTestMesh();
      const result = impostor.bake(mesh, {
        atlasWidth: 256,
        atlasHeight: 256,
        gridSizeX: 8,
        gridSizeY: 8,
        octType: OctahedronType.HEMI,
      });

      expect(result).toBeDefined();
      expect(result.atlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.gridSizeX).toBe(8);
      expect(result.gridSizeY).toBe(8);
      expect(result.octType).toBe(OctahedronType.HEMI);

      // Clean up
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      result.renderTarget?.dispose();
    });

    it("should bake with normals (Standard mode)", () => {
      const mesh = createTestMesh();
      const result = impostor.bakeWithNormals(mesh, {
        atlasWidth: 256,
        atlasHeight: 256,
        gridSizeX: 8,
        gridSizeY: 8,
        octType: OctahedronType.HEMI,
      });

      expect(result).toBeDefined();
      expect(result.atlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.normalAtlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.normalRenderTarget).toBeDefined();

      // Clean up
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      result.renderTarget?.dispose();
      result.normalRenderTarget?.dispose();
    });

    it("should bake full AAA (depth + normals)", () => {
      const mesh = createTestMesh();
      const result = impostor.bakeFull(mesh, {
        atlasWidth: 256,
        atlasHeight: 256,
        gridSizeX: 8,
        gridSizeY: 8,
        octType: OctahedronType.HEMI,
        pbrMode: PBRBakeMode.FULL,
      });

      expect(result).toBeDefined();
      expect(result.atlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.normalAtlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.depthAtlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.depthNear).toBeDefined();
      expect(result.depthFar).toBeDefined();

      // Clean up
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      result.renderTarget?.dispose();
      result.normalRenderTarget?.dispose();
      result.depthRenderTarget?.dispose();
    });

    it("should bake complete AAA with PBR", () => {
      const mesh = createTestMesh();
      const result = impostor.bakeFull(mesh, {
        atlasWidth: 256,
        atlasHeight: 256,
        gridSizeX: 8,
        gridSizeY: 8,
        octType: OctahedronType.HEMI,
        pbrMode: PBRBakeMode.COMPLETE,
      });

      expect(result).toBeDefined();
      expect(result.atlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.normalAtlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.depthAtlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.pbrAtlasTexture).toBeInstanceOf(THREE.Texture);
      expect(result.pbrMode).toBe(PBRBakeMode.COMPLETE);

      // Clean up
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      result.renderTarget?.dispose();
      result.normalRenderTarget?.dispose();
      result.depthRenderTarget?.dispose();
      result.pbrRenderTarget?.dispose();
    });
  });

  describe("Instance Creation", () => {
    it("should create an impostor instance (GLSL)", () => {
      const mesh = createTestMesh();
      const bakeResult = impostor.bake(mesh, {
        atlasWidth: 256,
        atlasHeight: 256,
        gridSizeX: 8,
        gridSizeY: 8,
      });

      const instance = impostor.createInstance(bakeResult);

      expect(instance).toBeDefined();
      expect(instance.mesh).toBeInstanceOf(THREE.Mesh);
      expect(instance.material).toBeDefined();
      expect(typeof instance.update).toBe("function");

      // Clean up
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      bakeResult.renderTarget?.dispose();
      instance.dispose();
    });

    it("should create an impostor instance (TSL)", () => {
      const mesh = createTestMesh();
      const bakeResult = impostor.bake(mesh, {
        atlasWidth: 256,
        atlasHeight: 256,
        gridSizeX: 8,
        gridSizeY: 8,
      });

      // scale=1, options with useTSL
      const instance = impostor.createInstance(bakeResult, 1, { useTSL: true });

      expect(instance).toBeDefined();
      expect(instance.mesh).toBeInstanceOf(THREE.Mesh);
      expect(instance.material).toBeDefined();
      expect(typeof instance.update).toBe("function");

      // Clean up
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      bakeResult.renderTarget?.dispose();
      instance.dispose();
    });
  });
});

describe("WebGL GLSL Material", () => {
  let texture: THREE.Texture;

  beforeEach(() => {
    // Create a simple test texture
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 256, 256);
    texture = new THREE.CanvasTexture(canvas);
  });

  afterEach(() => {
    texture.dispose();
  });

  it("should create a basic GLSL impostor material", () => {
    const material = createImpostorMaterial({
      atlasTexture: texture,
      gridSizeX: 8,
      gridSizeY: 8,
    });

    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.uniforms.atlasTexture.value).toBe(texture);
    expect(material.uniforms.gridSize.value).toEqual(new THREE.Vector2(8, 8));
    expect(material.transparent).toBe(true);
  });

  it("should create an AAA GLSL material with normal atlas", () => {
    const normalTexture = texture.clone();
    const material = createImpostorMaterial({
      atlasTexture: texture,
      normalAtlasTexture: normalTexture,
      gridSizeX: 8,
      gridSizeY: 8,
      enableLighting: true,
    });

    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.uniforms.normalAtlasTexture.value).toBe(normalTexture);
    // Note: 'useLighting' is set based on enableLighting config

    normalTexture.dispose();
  });

  it("should create an AAA GLSL material with depth blending", () => {
    const depthTexture = texture.clone();
    const material = createImpostorMaterial({
      atlasTexture: texture,
      depthAtlasTexture: depthTexture,
      gridSizeX: 8,
      gridSizeY: 8,
      enableDepthBlending: true,
    });

    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.uniforms.depthAtlasTexture.value).toBe(depthTexture);
    expect(material.uniforms.useDepthBlending.value).toBe(true);

    depthTexture.dispose();
  });

  it("should update view data", () => {
    const material = createImpostorMaterial({
      atlasTexture: texture,
      gridSizeX: 8,
      gridSizeY: 8,
    });

    const viewData: ImpostorViewData = {
      faceIndices: new THREE.Vector3(0, 1, 2),
      faceWeights: new THREE.Vector3(0.5, 0.3, 0.2),
    };

    updateImpostorMaterial(material, viewData);

    expect(material.uniforms.faceIndices.value).toEqual(
      new THREE.Vector3(0, 1, 2),
    );
    expect(material.uniforms.faceWeights.value).toEqual(
      new THREE.Vector3(0.5, 0.3, 0.2),
    );
  });

  it("should update AAA lighting", () => {
    const normalTexture = texture.clone();
    const material = createImpostorMaterial({
      atlasTexture: texture,
      normalAtlasTexture: normalTexture,
      gridSizeX: 8,
      gridSizeY: 8,
      enableLighting: true,
    });

    updateImpostorAAALighting(material, {
      ambientColor: new THREE.Vector3(0.5, 0.5, 0.5),
      ambientIntensity: 0.6,
      directionalLights: [
        {
          direction: new THREE.Vector3(1, 0, 0),
          color: new THREE.Vector3(1, 1, 0),
          intensity: 2.0,
        },
      ],
      specular: {
        shininess: 64,
        intensity: 0.8,
      },
    });

    expect(material.uniforms.ambientColor.value).toEqual(
      new THREE.Vector3(0.5, 0.5, 0.5),
    );
    expect(material.uniforms.ambientIntensity.value).toBe(0.6);

    normalTexture.dispose();
  });
});

describe("WebGPU TSL Material", () => {
  let texture: THREE.Texture;

  beforeEach(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    texture = new THREE.CanvasTexture(canvas);
  });

  afterEach(() => {
    texture.dispose();
  });

  it("should create a basic TSL impostor material", () => {
    const material = createTSLImpostorMaterial({
      atlasTexture: texture,
      gridSizeX: 8,
      gridSizeY: 8,
    });

    expect(material).toBeDefined();
    expect(material.impostorUniforms).toBeDefined();
    expect(material.impostorUniforms.faceIndices).toBeDefined();
    expect(material.impostorUniforms.faceWeights).toBeDefined();
    expect(typeof material.updateView).toBe("function");
  });

  it("should create an AAA TSL material", () => {
    const normalTexture = texture.clone();
    const depthTexture = texture.clone();

    const material = createTSLImpostorMaterial({
      atlasTexture: texture,
      normalAtlasTexture: normalTexture,
      depthAtlasTexture: depthTexture,
      gridSizeX: 8,
      gridSizeY: 8,
      enableAAA: true,
      enableDepthBlending: true,
      enableSpecular: true,
    });

    expect(material).toBeDefined();
    expect(material.impostorUniforms.ambientColor).toBeDefined();
    expect(material.impostorUniforms.specularShininess).toBeDefined();
    expect(typeof material.updateLighting).toBe("function");

    normalTexture.dispose();
    depthTexture.dispose();
  });

  it("should update view via TSL material", () => {
    const material = createTSLImpostorMaterial({
      atlasTexture: texture,
      gridSizeX: 8,
      gridSizeY: 8,
    });

    const faceIndices = new THREE.Vector3(5, 6, 7);
    const faceWeights = new THREE.Vector3(0.4, 0.35, 0.25);

    material.updateView(faceIndices, faceWeights);

    // TSL uniforms are stored differently, just verify no error
    expect(material.impostorUniforms.faceIndices).toBeDefined();
    expect(material.impostorUniforms.faceWeights).toBeDefined();
  });

  it("should update AAA lighting via TSL material", () => {
    const normalTexture = texture.clone();

    const material = createTSLImpostorMaterial({
      atlasTexture: texture,
      normalAtlasTexture: normalTexture,
      gridSizeX: 8,
      gridSizeY: 8,
      enableAAA: true,
    }) as TSLImpostorMaterial;

    expect(material.updateLighting).toBeDefined();

    material.updateLighting!({
      ambientColor: new THREE.Vector3(0.3, 0.3, 0.4),
      ambientIntensity: 0.5,
      directionalLights: [
        {
          direction: new THREE.Vector3(0, 1, 0),
          color: new THREE.Vector3(1, 1, 1),
          intensity: 1.5,
        },
      ],
    });

    // Verify no errors occurred
    expect(material.impostorUniforms.ambientColor).toBeDefined();

    normalTexture.dispose();
  });

  it("should support multiple directional lights (4 max)", () => {
    const normalTexture = texture.clone();

    const material = createTSLImpostorMaterial({
      atlasTexture: texture,
      normalAtlasTexture: normalTexture,
      gridSizeX: 8,
      gridSizeY: 8,
      enableAAA: true,
    }) as TSLImpostorMaterial;

    expect(material.updateLighting).toBeDefined();

    // Configure all 4 directional lights
    material.updateLighting!({
      ambientColor: new THREE.Vector3(0.2, 0.2, 0.25),
      ambientIntensity: 0.3,
      directionalLights: [
        {
          direction: new THREE.Vector3(1, 1, 0),
          color: new THREE.Vector3(1, 0.9, 0.8),
          intensity: 1.0,
        },
        {
          direction: new THREE.Vector3(-1, 1, 0),
          color: new THREE.Vector3(0.5, 0.5, 1.0),
          intensity: 0.5,
        },
        {
          direction: new THREE.Vector3(0, -1, 0),
          color: new THREE.Vector3(0.3, 0.2, 0.1),
          intensity: 0.2,
        },
        {
          direction: new THREE.Vector3(0, 0, 1),
          color: new THREE.Vector3(1, 1, 1),
          intensity: 0.1,
        },
      ],
    });

    // Verify uniforms exist for multi-light support
    expect(material.impostorUniforms.numDirectionalLights).toBeDefined();
    expect(material.impostorUniforms.directionalLightDirs).toBeDefined();
    expect(material.impostorUniforms.directionalLightColors).toBeDefined();
    expect(material.impostorUniforms.directionalLightIntensities).toBeDefined();

    normalTexture.dispose();
  });

  it("should support multiple point lights (4 max)", () => {
    const normalTexture = texture.clone();

    const material = createTSLImpostorMaterial({
      atlasTexture: texture,
      normalAtlasTexture: normalTexture,
      gridSizeX: 8,
      gridSizeY: 8,
      enableAAA: true,
    }) as TSLImpostorMaterial;

    expect(material.updateLighting).toBeDefined();

    // Configure all 4 point lights
    material.updateLighting!({
      ambientColor: new THREE.Vector3(0.1, 0.1, 0.1),
      ambientIntensity: 0.2,
      pointLights: [
        {
          position: new THREE.Vector3(5, 3, 0),
          color: new THREE.Vector3(1, 0.8, 0.6),
          intensity: 2.0,
          distance: 10,
          decay: 2,
        },
        {
          position: new THREE.Vector3(-5, 3, 0),
          color: new THREE.Vector3(0.6, 0.8, 1),
          intensity: 1.5,
          distance: 8,
          decay: 2,
        },
        {
          position: new THREE.Vector3(0, 5, 5),
          color: new THREE.Vector3(1, 1, 0.8),
          intensity: 1.0,
          distance: 15,
          decay: 1,
        },
        {
          position: new THREE.Vector3(0, 0, -5),
          color: new THREE.Vector3(1, 0.5, 0.5),
          intensity: 0.5,
          distance: 5,
          decay: 2,
        },
      ],
    });

    // Verify uniforms exist for multi-light support
    expect(material.impostorUniforms.numPointLights).toBeDefined();
    expect(material.impostorUniforms.pointLightPositions).toBeDefined();
    expect(material.impostorUniforms.pointLightColors).toBeDefined();
    expect(material.impostorUniforms.pointLightIntensities).toBeDefined();
    expect(material.impostorUniforms.pointLightDistances).toBeDefined();
    expect(material.impostorUniforms.pointLightDecays).toBeDefined();

    normalTexture.dispose();
  });

  it("should support combined directional and point lights", () => {
    const normalTexture = texture.clone();

    const material = createTSLImpostorMaterial({
      atlasTexture: texture,
      normalAtlasTexture: normalTexture,
      gridSizeX: 8,
      gridSizeY: 8,
      enableAAA: true,
      enableSpecular: true,
    }) as TSLImpostorMaterial;

    expect(material.updateLighting).toBeDefined();

    // Configure both directional and point lights together
    material.updateLighting!({
      ambientColor: new THREE.Vector3(0.15, 0.15, 0.2),
      ambientIntensity: 0.25,
      directionalLights: [
        {
          direction: new THREE.Vector3(0.5, 0.8, 0.3),
          color: new THREE.Vector3(1, 0.98, 0.95),
          intensity: 1.2,
        },
        {
          direction: new THREE.Vector3(-0.5, 0.3, -0.8),
          color: new THREE.Vector3(0.7, 0.8, 1.0),
          intensity: 0.4,
        },
      ],
      pointLights: [
        {
          position: new THREE.Vector3(3, 2, 3),
          color: new THREE.Vector3(1, 0.9, 0.7),
          intensity: 1.5,
          distance: 8,
          decay: 2,
        },
        {
          position: new THREE.Vector3(-3, 2, -3),
          color: new THREE.Vector3(0.7, 0.9, 1.0),
          intensity: 1.0,
          distance: 6,
          decay: 2,
        },
      ],
      specular: {
        f0: 0.04,
        shininess: 64,
        intensity: 0.6,
      },
    });

    // Verify specular uniforms
    expect(material.impostorUniforms.specularF0).toBeDefined();
    expect(material.impostorUniforms.specularShininess).toBeDefined();
    expect(material.impostorUniforms.specularIntensity).toBeDefined();

    normalTexture.dispose();
  });
});

describe("Bounding Sphere Calculation", () => {
  it("should calculate correct bounding sphere for simple mesh", () => {
    const renderer = createTestWebGLRenderer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const impostor = new OctahedralImpostor(renderer as any);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(2, 16, 16),
      new THREE.MeshBasicMaterial(),
    );

    const result = impostor.bake(mesh, {
      atlasWidth: 128,
      atlasHeight: 128,
      gridSizeX: 4,
      gridSizeY: 4,
    });

    expect(result.boundingSphere).toBeDefined();
    expect(result.boundingSphere!.radius).toBeGreaterThan(0);

    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    result.renderTarget?.dispose();
    impostor.dispose();
    renderer.dispose();
  });
});
