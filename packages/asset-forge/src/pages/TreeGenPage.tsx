/**
 * TreeGenPage
 * Page for procedural tree generation using Weber & Penn algorithm
 *
 * Features:
 * - 19 species presets
 * - Custom preset saving (seed + settings)
 * - Batch generation (generate multiple variations)
 * - GLB export
 * - LOD preview
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  TreePine,
  RefreshCw,
  Download,
  Settings2,
  Save,
  FolderOpen,
  Grid3x3,
  Layers,
  Trash2,
  Copy,
  Plus,
  Database,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  generateTree,
  getPresetNames,
  getPreset,
  disposeTreeMesh,
  generateTreeVariations,
  type TreeMeshResult,
} from "@hyperscape/procgen";
import { notify } from "@/utils/notify";
import type { TreePreset, GeneratedProcgenAsset } from "@/types/ProcgenPresets";

// API base
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3401";

export const TreeGenPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentTreeRef = useRef<TreeMeshResult | null>(null);
  const batchTreesRef = useRef<TreeMeshResult[]>([]);

  // Generation state
  const [preset, setPreset] = useState("quakingAspen");
  const [seed, setSeed] = useState(12345);
  const [showLeaves, setShowLeaves] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stats, setStats] = useState<{
    stems: number;
    leaves: number;
    vertices: number;
    triangles: number;
    time: number;
  } | null>(null);

  // Batch generation state
  const [batchMode, setBatchMode] = useState(false);
  const [batchCount, setBatchCount] = useState(10);
  const [batchResults, setBatchResults] = useState<TreeMeshResult[]>([]);
  const [selectedBatchIndex, setSelectedBatchIndex] = useState<number | null>(
    null,
  );

  // Saved presets state
  const [savedPresets, setSavedPresets] = useState<TreePreset[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  // LOD preview state
  const [showLODPreview, setShowLODPreview] = useState(false);
  const [currentLOD, setCurrentLOD] = useState<"lod0" | "lod1" | "lod2">(
    "lod0",
  );

  const presetNames = getPresetNames();

  // Load saved presets on mount
  useEffect(() => {
    loadSavedPresets();
  }, []);

  const loadSavedPresets = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/procgen/presets?category=tree`,
      );
      if (response.ok) {
        const data = await response.json();
        setSavedPresets(data.presets);
      }
    } catch (error) {
      console.error("Failed to load saved presets:", error);
    }
  };

  const saveCurrentAsPreset = async () => {
    if (!newPresetName.trim()) {
      notify.error("Please enter a preset name");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/procgen/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPresetName,
          category: "tree",
          settings: {
            basePreset: preset,
            seed,
            showLeaves,
          },
        }),
      });

      if (response.ok) {
        notify.success(`Saved preset: ${newPresetName}`);
        setShowSaveDialog(false);
        setNewPresetName("");
        loadSavedPresets();
      } else {
        notify.error("Failed to save preset");
      }
    } catch (error) {
      console.error("Failed to save preset:", error);
      notify.error("Failed to save preset");
    }
  };

  const loadSavedPreset = (savedPreset: TreePreset) => {
    setPreset(savedPreset.settings.basePreset);
    setSeed(savedPreset.settings.seed);
    setShowLeaves(savedPreset.settings.showLeaves);
    notify.info(`Loaded preset: ${savedPreset.name}`);
  };

  const deleteSavedPreset = async (presetId: string) => {
    try {
      const response = await fetch(
        `${API_BASE}/api/procgen/presets/${presetId}`,
        {
          method: "DELETE",
        },
      );
      if (response.ok) {
        notify.success("Preset deleted");
        loadSavedPresets();
      }
    } catch (error) {
      console.error("Failed to delete preset:", error);
    }
  };

  // Export to GLB
  const exportToGLB = useCallback(
    async (treeResult?: TreeMeshResult, filename?: string) => {
      const tree = treeResult ?? currentTreeRef.current;
      if (!tree?.group) {
        notify.error("No tree to export");
        return;
      }

      try {
        const exporter = new GLTFExporter();
        const gltf = await exporter.parseAsync(tree.group, { binary: true });

        const blob = new Blob([gltf as ArrayBuffer], {
          type: "model/gltf-binary",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename ?? `${preset}_${seed}.glb`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        notify.success("Tree exported successfully");
      } catch (error) {
        console.error("Export error:", error);
        notify.error("Failed to export tree");
      }
    },
    [preset, seed],
  );

  // Save to assets - saves the GLB to the asset database for LOD/Impostor processing
  const saveToAssets = useCallback(
    async (treeResult?: TreeMeshResult) => {
      const tree = treeResult ?? currentTreeRef.current;
      if (!tree?.group) {
        notify.error("No tree to save");
        return;
      }

      try {
        const exporter = new GLTFExporter();
        const gltf = await exporter.parseAsync(tree.group, { binary: true });

        // Create FormData with GLB file
        const blob = new Blob([gltf as ArrayBuffer], {
          type: "model/gltf-binary",
        });
        const filename = `tree_${preset}_${seed}.glb`;
        const formData = new FormData();
        formData.append("file", blob, filename);
        formData.append("category", "tree");
        formData.append("name", `${preset} Tree (Seed: ${seed})`);
        formData.append(
          "metadata",
          JSON.stringify({
            generator: "procgen",
            preset,
            seed,
            showLeaves,
            vertices: tree.vertexCount,
            triangles: tree.triangleCount,
          }),
        );

        // Upload to assets
        const response = await fetch(`${API_BASE}/api/assets/upload`, {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();

          // Record in procgen manifest
          await fetch(`${API_BASE}/api/procgen/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              presetId: "",
              presetName: preset,
              category: "tree",
              seed,
              modelPath: data.path ?? filename,
              stats: {
                vertices: tree.vertexCount,
                triangles: tree.triangleCount,
                generationTime: stats?.time ?? 0,
              },
            }),
          });

          notify.success(`Saved to assets: ${filename}`);
        } else {
          const error = await response.json();
          notify.error(error.message ?? "Failed to save to assets");
        }
      } catch (error) {
        console.error("Save to assets error:", error);
        notify.error("Failed to save to assets");
      }
    },
    [preset, seed, showLeaves, stats],
  );

  // Export batch to GLB
  const exportBatchToGLB = useCallback(async () => {
    if (batchResults.length === 0) {
      notify.error("No batch results to export");
      return;
    }

    notify.info(`Exporting ${batchResults.length} trees...`);

    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      const batchSeed = seed + i * 1000;
      await exportToGLB(result, `${preset}_${batchSeed}.glb`);
      // Small delay between downloads
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    notify.success(`Exported ${batchResults.length} trees`);
  }, [batchResults, preset, seed, exportToGLB]);

  // Clear batch results
  const clearBatchResults = useCallback(() => {
    if (!sceneRef.current) return;

    for (const tree of batchTreesRef.current) {
      if (tree.group) {
        sceneRef.current.remove(tree.group);
      }
      disposeTreeMesh(tree);
    }
    batchTreesRef.current = [];
    setBatchResults([]);
    setSelectedBatchIndex(null);
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera
    const aspect =
      containerRef.current.clientWidth / containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
    camera.position.set(15, 10, 15);
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
    controls.target.set(0, 5, 0);
    controlsRef.current = controls;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
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

    // Fill light
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-10, 10, -10);
    scene.add(fill);

    // Ground plane
    const groundGeo = new THREE.CircleGeometry(50, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a40,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper
    const grid = new THREE.GridHelper(100, 100, 0x555555, 0x333333);
    grid.position.y = 0.01;
    scene.add(grid);

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

      if (currentTreeRef.current) {
        disposeTreeMesh(currentTreeRef.current);
        currentTreeRef.current = null;
      }

      // Clean up batch trees
      for (const tree of batchTreesRef.current) {
        disposeTreeMesh(tree);
      }
      batchTreesRef.current = [];

      ground.geometry.dispose();
      groundMat.dispose();

      renderer.dispose();

      if (
        containerRef.current &&
        renderer.domElement.parentNode === containerRef.current
      ) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Generate single tree
  const generateTreeMesh = useCallback(() => {
    if (!sceneRef.current) return;

    // Clear batch mode if active
    if (batchMode) {
      clearBatchResults();
    }

    setIsGenerating(true);
    const startTime = performance.now();

    // Remove old tree
    if (currentTreeRef.current) {
      if (currentTreeRef.current.group) {
        sceneRef.current.remove(currentTreeRef.current.group);
      }
      disposeTreeMesh(currentTreeRef.current);
      currentTreeRef.current = null;
    }

    try {
      // Get preset parameters
      const presetParams = getPreset(preset);
      if (!presetParams) {
        console.error(`Preset not found: ${preset}`);
        notify.error(`Preset not found: ${preset}`);
        setIsGenerating(false);
        return;
      }

      // Generate tree
      const result = generateTree(preset, {
        generation: { seed },
        geometry: { radialSegments: 8 },
      });

      if (result.group) {
        // Remove leaves if not showing
        if (!showLeaves && result.leaves) {
          result.group.remove(result.leaves);
        }

        result.group.castShadow = true;
        result.group.receiveShadow = true;
        result.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        sceneRef.current.add(result.group);
        currentTreeRef.current = result;

        // Center camera on tree
        if (cameraRef.current && controlsRef.current) {
          controlsRef.current.target.set(0, 5, 0);
          cameraRef.current.position.set(15, 10, 15);
          controlsRef.current.update();
        }

        // Use stats from result
        const branchCount = result.branches?.length ?? 0;
        const hasLeaves = result.leaves !== null;

        setStats({
          stems: branchCount,
          leaves: hasLeaves ? 1 : 0,
          vertices: result.vertexCount,
          triangles: result.triangleCount,
          time: Math.round(performance.now() - startTime),
        });
      }
    } catch (error) {
      console.error("Tree generation error:", error);
      notify.error("Tree generation failed");
    }

    setIsGenerating(false);
  }, [preset, seed, showLeaves, batchMode, clearBatchResults]);

  // Generate batch of trees
  const generateBatch = useCallback(() => {
    if (!sceneRef.current) return;

    // Clear existing
    clearBatchResults();
    if (currentTreeRef.current) {
      sceneRef.current.remove(currentTreeRef.current.group!);
      disposeTreeMesh(currentTreeRef.current);
      currentTreeRef.current = null;
    }

    setIsGenerating(true);
    const startTime = performance.now();

    try {
      const presetParams = getPreset(preset);
      if (!presetParams) {
        notify.error(`Preset not found: ${preset}`);
        setIsGenerating(false);
        return;
      }

      const results: TreeMeshResult[] = [];
      const gridSize = Math.ceil(Math.sqrt(batchCount));
      const spacing = 15; // Space between trees

      for (let i = 0; i < batchCount; i++) {
        const batchSeed = seed + i * 1000;

        const result = generateTree(preset, {
          generation: { seed: batchSeed },
          geometry: { radialSegments: 8 },
        });

        if (result.group) {
          // Remove leaves if not showing
          if (!showLeaves && result.leaves) {
            result.group.remove(result.leaves);
          }

          // Position in grid
          const row = Math.floor(i / gridSize);
          const col = i % gridSize;
          const x = (col - gridSize / 2) * spacing;
          const z = (row - gridSize / 2) * spacing;
          result.group.position.set(x, 0, z);

          result.group.castShadow = true;
          result.group.receiveShadow = true;
          result.group.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });

          sceneRef.current!.add(result.group);
          results.push(result);
          batchTreesRef.current.push(result);
        }
      }

      setBatchResults(results);

      // Zoom camera out to see all trees
      if (cameraRef.current && controlsRef.current) {
        const viewDistance = gridSize * spacing * 0.8;
        cameraRef.current.position.set(
          viewDistance,
          viewDistance * 0.6,
          viewDistance,
        );
        controlsRef.current.target.set(0, 5, 0);
        controlsRef.current.update();
      }

      // Calculate total stats
      const totalVertices = results.reduce((sum, r) => sum + r.vertexCount, 0);
      const totalTriangles = results.reduce(
        (sum, r) => sum + r.triangleCount,
        0,
      );

      setStats({
        stems: results.length,
        leaves: results.filter((r) => r.leaves !== null).length,
        vertices: totalVertices,
        triangles: totalTriangles,
        time: Math.round(performance.now() - startTime),
      });

      notify.success(`Generated ${results.length} trees`);
    } catch (error) {
      console.error("Batch generation error:", error);
      notify.error("Batch generation failed");
    }

    setIsGenerating(false);
  }, [preset, seed, showLeaves, batchCount, clearBatchResults]);

  // Select a tree from batch
  const selectBatchTree = useCallback(
    (index: number) => {
      if (!batchResults[index]) return;

      setSelectedBatchIndex(index);

      // Center camera on selected tree
      const tree = batchResults[index];
      if (tree.group && cameraRef.current && controlsRef.current) {
        const pos = tree.group.position;
        controlsRef.current.target.set(pos.x, 5, pos.z);
        cameraRef.current.position.set(pos.x + 15, 10, pos.z + 15);
        controlsRef.current.update();
      }
    },
    [batchResults],
  );

  // Generate initial tree
  useEffect(() => {
    generateTreeMesh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <TreePine size={28} />
            Tree Generator
          </h1>
          <p className="text-text-secondary mt-1">
            Generate procedural trees using the Weber & Penn algorithm with 19
            species presets
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Batch Mode Toggle */}
          <button
            onClick={() => setBatchMode(!batchMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              batchMode
                ? "bg-accent text-white"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            <Grid3x3 size={18} />
            Batch
          </button>

          {/* Save Preset */}
          <button
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-secondary hover:text-text-primary rounded-lg transition-all"
          >
            <Save size={18} />
            Save
          </button>

          {/* Save to Assets */}
          <button
            onClick={() => saveToAssets()}
            disabled={!currentTreeRef.current}
            className="flex items-center gap-2 px-4 py-2 bg-green-600/20 text-green-500 hover:bg-green-600/30 rounded-lg transition-all disabled:opacity-50"
            title="Save to Assets for LOD/Impostor processing"
          >
            <Database size={18} />
            Save
          </button>

          {/* Export */}
          <button
            onClick={() => (batchMode ? exportBatchToGLB() : exportToGLB())}
            disabled={!currentTreeRef.current && batchResults.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-secondary hover:text-text-primary rounded-lg transition-all disabled:opacity-50"
          >
            <Download size={18} />
            Export
          </button>

          {/* Generate */}
          <button
            onClick={batchMode ? generateBatch : generateTreeMesh}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw
              size={18}
              className={isGenerating ? "animate-spin" : ""}
            />
            {batchMode ? `Generate ${batchCount}` : "Generate"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6">
        {/* Controls Panel */}
        <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto">
          {/* Generation Settings */}
          <div className="bg-bg-secondary rounded-lg p-4 border border-border-primary">
            <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Settings2 size={18} />
              Generation Settings
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-2">
                  Tree Species
                </label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-text-primary"
                >
                  {presetNames.map((name) => (
                    <option key={name} value={name}>
                      {name
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (s) => s.toUpperCase())
                        .trim()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-2">
                  Seed
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-text-primary"
                  />
                  <button
                    onClick={() => setSeed(Math.floor(Math.random() * 1000000))}
                    className="px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-text-secondary hover:text-text-primary transition-colors"
                    title="Random seed"
                  >
                    🎲
                  </button>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLeaves}
                    onChange={(e) => setShowLeaves(e.target.checked)}
                    className="rounded"
                  />
                  Show Leaves
                </label>
              </div>

              {/* Batch Count */}
              {batchMode && (
                <div>
                  <label className="block text-sm text-text-secondary mb-2">
                    Batch Count
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={25}
                    value={batchCount}
                    onChange={(e) => setBatchCount(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-text-secondary mt-1">
                    <span>2</span>
                    <span className="text-text-primary font-medium">
                      {batchCount}
                    </span>
                    <span>25</span>
                  </div>
                </div>
              )}

              <button
                onClick={batchMode ? generateBatch : generateTreeMesh}
                disabled={isGenerating}
                className="w-full py-2 bg-primary hover:bg-primary-dark text-white rounded-md transition-all disabled:opacity-50"
              >
                {isGenerating
                  ? "Generating..."
                  : batchMode
                    ? `Generate ${batchCount} Trees`
                    : "Generate Tree"}
              </button>
            </div>
          </div>

          {/* Saved Presets */}
          <div className="bg-bg-secondary rounded-lg p-4 border border-border-primary">
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <FolderOpen size={18} />
              Saved Presets
            </h3>

            {savedPresets.length === 0 ? (
              <p className="text-sm text-text-secondary italic">
                No saved presets
              </p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {savedPresets.map((savedPreset) => (
                  <div
                    key={savedPreset.id}
                    className="flex items-center justify-between p-2 bg-bg-tertiary rounded-md group"
                  >
                    <button
                      onClick={() => loadSavedPreset(savedPreset)}
                      className="flex-1 text-left text-sm text-text-primary hover:text-primary truncate"
                    >
                      {savedPreset.name}
                    </button>
                    <button
                      onClick={() => deleteSavedPreset(savedPreset.id)}
                      className="p-1 text-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats Panel */}
          {stats && (
            <div className="bg-bg-secondary rounded-lg p-4 border border-border-primary">
              <h3 className="font-semibold text-text-primary mb-3">
                {batchMode ? "Batch Stats" : "Generation Stats"}
              </h3>
              <div className="space-y-2 text-sm">
                {batchMode ? (
                  <>
                    <div className="flex justify-between text-text-secondary">
                      <span>Trees:</span>
                      <span className="text-text-primary">{stats.stems}</span>
                    </div>
                    <div className="flex justify-between text-text-secondary">
                      <span>With Leaves:</span>
                      <span className="text-text-primary">{stats.leaves}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-text-secondary">
                      <span>Stems:</span>
                      <span className="text-text-primary">
                        {stats.stems.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-text-secondary">
                      <span>Leaves:</span>
                      <span className="text-text-primary">
                        {stats.leaves.toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-text-secondary">
                  <span>Total Vertices:</span>
                  <span className="text-text-primary">
                    {stats.vertices.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Total Triangles:</span>
                  <span className="text-text-primary">
                    {stats.triangles.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Gen Time:</span>
                  <span className="text-text-primary">{stats.time}ms</span>
                </div>
              </div>
            </div>
          )}

          {/* Batch Results Grid */}
          {batchMode && batchResults.length > 0 && (
            <div className="bg-bg-secondary rounded-lg p-4 border border-border-primary">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-text-primary">Results</h3>
                <button
                  onClick={clearBatchResults}
                  className="text-xs text-text-secondary hover:text-red-500"
                >
                  Clear All
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {batchResults.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => selectBatchTree(index)}
                    className={`aspect-square rounded text-xs font-medium ${
                      selectedBatchIndex === index
                        ? "bg-primary text-white"
                        : "bg-bg-tertiary text-text-secondary hover:bg-bg-primary"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              {selectedBatchIndex !== null && (
                <div className="mt-3 pt-3 border-t border-border-primary">
                  <p className="text-xs text-text-secondary mb-2">
                    Tree #{selectedBatchIndex + 1} - Seed:{" "}
                    {seed + selectedBatchIndex * 1000}
                  </p>
                  <button
                    onClick={() =>
                      exportToGLB(
                        batchResults[selectedBatchIndex],
                        `${preset}_${seed + selectedBatchIndex * 1000}.glb`,
                      )
                    }
                    className="w-full py-1.5 text-xs bg-bg-tertiary hover:bg-bg-primary text-text-primary rounded transition-colors flex items-center justify-center gap-1"
                  >
                    <Download size={12} />
                    Export Selected
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Viewer */}
        <div className="flex-1 bg-bg-secondary rounded-xl overflow-hidden border border-border-primary">
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>

      {/* Save Preset Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary rounded-lg p-6 w-96 border border-border-primary">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              Save Preset
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              Save current settings ({preset}, seed: {seed}) as a reusable
              preset.
            </p>
            <input
              type="text"
              placeholder="Preset name..."
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-text-primary mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setNewPresetName("");
                }}
                className="px-4 py-2 text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentAsPreset}
                disabled={!newPresetName.trim()}
                className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-md disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TreeGenPage;
