/**
 * BuildingViewer
 * Simple React component for viewing generated buildings
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  BuildingGenerator,
  BUILDING_RECIPES,
  type BuildingStats,
} from "../generator";

export interface BuildingViewerProps {
  /** Initial building type to display */
  initialType?: string;
  /** Initial seed for generation */
  initialSeed?: string;
  /** Width of the viewer */
  width?: number | string;
  /** Height of the viewer */
  height?: number | string;
  /** Background color */
  backgroundColor?: number;
  /** Show stats panel */
  showStats?: boolean;
  /** Show controls panel */
  showControls?: boolean;
  /** Callback when building is generated */
  onGenerate?: (stats: BuildingStats, typeKey: string, seed: string) => void;
}

export const BuildingViewer: React.FC<BuildingViewerProps> = ({
  initialType = "inn",
  initialSeed = "",
  width = "100%",
  height = 400,
  backgroundColor = 0x1a1a2e,
  showStats = true,
  showControls = true,
  onGenerate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const generatorRef = useRef<BuildingGenerator | null>(null);
  const currentBuildingRef = useRef<THREE.Mesh | THREE.Group | null>(null);

  const [buildingType, setBuildingType] = useState(initialType);
  const [seed, setSeed] = useState(initialSeed);
  const [stats, setStats] = useState<BuildingStats | null>(null);
  const [includeRoof, setIncludeRoof] = useState(true);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);
    sceneRef.current = scene;

    // Camera
    const aspect =
      containerRef.current.clientWidth / containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
    camera.position.set(15, 12, 15);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight,
    );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 3, 0);
    controlsRef.current = controls;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(20, 30, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    scene.add(sun);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a40,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper
    const grid = new THREE.GridHelper(50, 50, 0x555555, 0x333333);
    grid.position.y = 0.01;
    scene.add(grid);

    // Generator
    generatorRef.current = new BuildingGenerator();

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);

      // Dispose current building geometry
      if (currentBuildingRef.current) {
        disposeObject(currentBuildingRef.current);
        currentBuildingRef.current = null;
      }

      // Dispose ground plane
      ground.geometry.dispose();
      groundMat.dispose();

      renderer.dispose();
      generatorRef.current?.dispose();
      generatorRef.current = null;

      if (
        containerRef.current &&
        renderer.domElement.parentNode === containerRef.current
      ) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [backgroundColor]);

  // Helper to dispose Three.js objects recursively
  const disposeObject = (obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
    obj.children.forEach((child) => disposeObject(child));
  };

  // Generate building
  const generateBuilding = useCallback(() => {
    if (!sceneRef.current || !generatorRef.current) return;

    // Remove old building and dispose geometry
    if (currentBuildingRef.current) {
      sceneRef.current.remove(currentBuildingRef.current);
      disposeObject(currentBuildingRef.current);
      currentBuildingRef.current = null;
    }

    // Generate new building
    const actualSeed = seed || `${buildingType}_${Date.now()}`;
    const result = generatorRef.current.generate(buildingType, {
      seed: actualSeed,
      includeRoof,
    });

    if (result) {
      result.mesh.castShadow = true;
      result.mesh.receiveShadow = true;
      sceneRef.current.add(result.mesh);
      currentBuildingRef.current = result.mesh;
      setStats(result.stats);
      onGenerate?.(result.stats, buildingType, actualSeed);
    }
  }, [buildingType, seed, includeRoof, onGenerate]);

  // Generate initial building
  useEffect(() => {
    generateBuilding();
  }, [generateBuilding]);

  const buildingTypes = Object.keys(BUILDING_RECIPES);

  return (
    <div style={{ position: "relative", width, height }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {showControls && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "rgba(0,0,0,0.7)",
            padding: 12,
            borderRadius: 8,
            color: "white",
            fontSize: 12,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Building Type
            </label>
            <select
              value={buildingType}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setBuildingType(e.target.value)
              }
              style={{
                width: "100%",
                padding: 4,
                borderRadius: 4,
                border: "none",
                background: "#333",
                color: "white",
              }}
            >
              {buildingTypes.map((type) => (
                <option key={type} value={type}>
                  {BUILDING_RECIPES[type].label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Seed (optional)
            </label>
            <input
              type="text"
              value={seed}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSeed(e.target.value)
              }
              placeholder="Random"
              style={{
                width: "100%",
                padding: 4,
                borderRadius: 4,
                border: "none",
                background: "#333",
                color: "white",
              }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={includeRoof}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setIncludeRoof(e.target.checked)
                }
              />
              Include Roof
            </label>
          </div>

          <button
            onClick={generateBuilding}
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              border: "none",
              background: "#4a9eff",
              color: "white",
              cursor: "pointer",
            }}
          >
            Generate
          </button>
        </div>
      )}

      {showStats && stats && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "rgba(0,0,0,0.7)",
            padding: 12,
            borderRadius: 8,
            color: "white",
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>
            Building Stats
          </div>
          <div>Rooms: {stats.rooms}</div>
          <div>Wall Segments: {stats.wallSegments}</div>
          <div>Doorways: {stats.doorways}</div>
          <div>Archways: {stats.archways}</div>
          <div>Windows: {stats.windows}</div>
          <div>Floor Tiles: {stats.floorTiles}</div>
          <div>Roof Pieces: {stats.roofPieces}</div>
          <div>Stairs: {stats.stairSteps}</div>
          <div>Props: {stats.props}</div>
          <div>Ground Cells: {stats.footprintCells}</div>
          {stats.upperFootprintCells > 0 && (
            <div>Upper Cells: {stats.upperFootprintCells}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default BuildingViewer;
