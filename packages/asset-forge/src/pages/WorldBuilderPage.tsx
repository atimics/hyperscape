import {
  Building2,
  RefreshCw,
  Eye,
  EyeOff,
  Grid3x3,
  Download,
  Plus,
  Mountain,
  MapPin,
  Route,
  Save,
  Upload,
} from "lucide-react";
import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/common";
import { notify } from "@/utils/notify";

// ============================================================
// BUILDING RECIPES AND CONSTANTS
// ============================================================

interface BuildingRecipe {
  label: string;
  widthRange: [number, number];
  depthRange: [number, number];
  floors: number;
  floorsRange?: [number, number];
  entranceCount: number;
  archBias: number;
  extraConnectionChance: number;
  entranceArchChance: number;
  roomSpanRange: [number, number];
  minRoomArea: number;
  windowChance: number;
  carveChance?: number;
  carveSizeRange?: [number, number];
  frontSide: string;
  minUpperFloorCells?: number;
  minUpperFloorShrinkCells?: number;
  patioDoorChance?: number;
  patioDoorCountRange?: [number, number];
  footprintStyle?: string;
  foyerDepthRange?: [number, number];
  foyerWidthRange?: [number, number];
  excludeFoyerFromUpper?: boolean;
  upperInsetRange?: [number, number];
  upperCarveChance?: number;
  requireUpperShrink?: boolean;
}

const BUILDING_RECIPES: Record<string, BuildingRecipe> = {
  "simple-house": {
    label: "Simple House",
    widthRange: [2, 3],
    depthRange: [2, 3],
    floors: 1,
    entranceCount: 1,
    archBias: 0.25,
    extraConnectionChance: 0.15,
    entranceArchChance: 0.05,
    roomSpanRange: [1, 2],
    minRoomArea: 2,
    windowChance: 0.6,
    carveChance: 0.2,
    carveSizeRange: [1, 1],
    frontSide: "south",
  },
  "long-house": {
    label: "Long House",
    widthRange: [1, 2],
    depthRange: [4, 6],
    floors: 1,
    entranceCount: 2,
    archBias: 0.45,
    extraConnectionChance: 0.1,
    entranceArchChance: 0.08,
    roomSpanRange: [1, 3],
    minRoomArea: 2,
    windowChance: 0.45,
    carveChance: 0.1,
    carveSizeRange: [1, 2],
    frontSide: "south",
  },
  inn: {
    label: "Inn",
    widthRange: [3, 4],
    depthRange: [3, 5],
    floors: 2,
    floorsRange: [1, 2],
    entranceCount: 2,
    archBias: 0.7,
    extraConnectionChance: 0.35,
    entranceArchChance: 0.2,
    roomSpanRange: [1, 3],
    minRoomArea: 3,
    minUpperFloorCells: 3,
    minUpperFloorShrinkCells: 2,
    windowChance: 0.5,
    patioDoorChance: 0.7,
    patioDoorCountRange: [1, 2],
    carveChance: 0.25,
    carveSizeRange: [1, 2],
    upperInsetRange: [1, 2],
    upperCarveChance: 0.2,
    frontSide: "south",
  },
  bank: {
    label: "Bank",
    widthRange: [3, 4],
    depthRange: [3, 4],
    floors: 2,
    floorsRange: [1, 2],
    entranceCount: 1,
    archBias: 0.8,
    extraConnectionChance: 0.4,
    entranceArchChance: 0.55,
    roomSpanRange: [1, 2],
    minRoomArea: 3,
    minUpperFloorCells: 3,
    minUpperFloorShrinkCells: 2,
    windowChance: 0.35,
    patioDoorChance: 0.6,
    patioDoorCountRange: [1, 1],
    footprintStyle: "foyer",
    foyerDepthRange: [1, 2],
    foyerWidthRange: [1, 2],
    excludeFoyerFromUpper: true,
    upperInsetRange: [1, 2],
    upperCarveChance: 0.1,
    frontSide: "south",
  },
  store: {
    label: "Store",
    widthRange: [2, 3],
    depthRange: [2, 4],
    floors: 1,
    entranceCount: 1,
    archBias: 0.2,
    extraConnectionChance: 0.12,
    entranceArchChance: 0.05,
    roomSpanRange: [1, 2],
    minRoomArea: 2,
    windowChance: 0.65,
    carveChance: 0.3,
    carveSizeRange: [1, 2],
    frontSide: "south",
  },
  smithy: {
    label: "Smithy / Forge",
    widthRange: [2, 3],
    depthRange: [2, 3],
    floors: 1,
    entranceCount: 1,
    archBias: 0.15,
    extraConnectionChance: 0.1,
    entranceArchChance: 0.05,
    roomSpanRange: [1, 2],
    minRoomArea: 2,
    windowChance: 0.5,
    carveChance: 0.2,
    carveSizeRange: [1, 1],
    frontSide: "south",
  },
};

const CELL_SIZE = 4;
const WALL_HEIGHT = 3.2;
const WALL_THICKNESS = 0.22;
const FLOOR_THICKNESS = 0.2;
const ROOF_THICKNESS = 0.22;
const FLOOR_HEIGHT = WALL_HEIGHT + FLOOR_THICKNESS;

const DOOR_WIDTH = CELL_SIZE * 0.4;
const DOOR_HEIGHT = WALL_HEIGHT * 0.7;
const ARCH_WIDTH = CELL_SIZE * 0.5;
const WINDOW_WIDTH = CELL_SIZE * 0.35;
const WINDOW_HEIGHT = WALL_HEIGHT * 0.35;
const WINDOW_SILL_HEIGHT = WALL_HEIGHT * 0.35;
const COUNTER_HEIGHT = 1.05;
const COUNTER_DEPTH = CELL_SIZE * 0.35;
const COUNTER_LENGTH = CELL_SIZE * 1.1;
const NPC_HEIGHT = 1.6;
const NPC_WIDTH = 0.7;
const FORGE_SIZE = 1.5;
const ANVIL_SIZE = 0.75;

const palette = {
  wall: new THREE.Color(0x8f8376),
  trim: new THREE.Color(0x8f8376),
  floor: new THREE.Color(0x5e534a),
  roof: new THREE.Color(0x523c33),
  stairs: new THREE.Color(0x6e6258),
  patio: new THREE.Color(0x3f444c),
  counter: new THREE.Color(0x4b3a2f),
  bar: new THREE.Color(0x3a2b22),
  banker: new THREE.Color(0xff3b30),
  innkeeper: new THREE.Color(0x4cc9f0),
  forge: new THREE.Color(0x7f1d1d),
  anvil: new THREE.Color(0x4b5563),
};

// ============================================================
// RNG AND UTILITY FUNCTIONS
// ============================================================

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

interface RNG {
  next(): number;
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(list: T[]): T | null;
  shuffle<T>(list: T[]): T[];
}

function createRng(seedText: string): RNG {
  let state = hashSeed(seedText);
  return {
    next() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    },
    int(min: number, max: number) {
      const value = this.next();
      return Math.floor(value * (max - min + 1)) + min;
    },
    chance(probability: number) {
      return this.next() < probability;
    },
    pick<T>(list: T[]): T | null {
      if (list.length === 0) return null;
      return list[this.int(0, list.length - 1)];
    },
    shuffle<T>(list: T[]): T[] {
      const array = list.slice();
      for (let i = array.length - 1; i > 0; i -= 1) {
        const j = this.int(0, i);
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    },
  };
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function noise3(x: number, y: number, z: number): number {
  return fract(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453);
}

function layeredNoise(x: number, y: number, z: number): number {
  const n1 = noise3(x, y, z);
  const n2 = noise3(x * 2.15, y * 2.15, z * 2.15) * 0.5;
  const n3 = noise3(x * 4.7, y * 4.7, z * 4.7) * 0.25;
  return (n1 + n2 + n3) / 1.75;
}

function applyVertexColors(
  geometry: THREE.BufferGeometry,
  color: THREE.Color,
  noiseScale = 0.35,
  noiseAmp = 0.35,
  minShade = 0.78,
): void {
  const position = geometry.attributes.position;
  if (!position) return;
  const colors = new Float32Array(position.count * 3);

  const baseR = color.r * minShade;
  const baseG = color.g * minShade;
  const baseB = color.b * minShade;

  if (noiseAmp === 0) {
    for (let i = 0; i < position.count; i += 1) {
      const idx = i * 3;
      colors[idx] = baseR;
      colors[idx + 1] = baseG;
      colors[idx + 2] = baseB;
    }
  } else {
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);

      const noise = layeredNoise(
        x * noiseScale,
        y * noiseScale,
        z * noiseScale,
      );
      const shade = minShade + noise * noiseAmp;
      const r = Math.min(1, color.r * shade);
      const g = Math.min(1, color.g * shade);
      const b = Math.min(1, color.b * shade);

      const idx = i * 3;
      colors[idx] = r;
      colors[idx + 1] = g;
      colors[idx + 2] = b;
    }
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function removeInternalFaces(
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const nonIndexed = geometry.toNonIndexed();
  const position = nonIndexed.attributes.position;
  const color = nonIndexed.attributes.color;
  const posArray = position.array as Float32Array;
  const colorArray = color ? (color.array as Float32Array) : null;
  const triCount = position.count / 3;

  const keyMap = new Map<string, number[]>();
  const precision = 1000;

  const makeKey = (i0: number, i1: number, i2: number): string => {
    const verts = [i0, i1, i2].map((idx) => {
      const x = Math.round(position.getX(idx) * precision);
      const y = Math.round(position.getY(idx) * precision);
      const z = Math.round(position.getZ(idx) * precision);
      return `${x},${y},${z}`;
    });
    verts.sort();
    return verts.join("|");
  };

  for (let tri = 0; tri < triCount; tri += 1) {
    const i0 = tri * 3;
    const i1 = tri * 3 + 1;
    const i2 = tri * 3 + 2;
    const key = makeKey(i0, i1, i2);
    if (!keyMap.has(key)) {
      keyMap.set(key, []);
    }
    keyMap.get(key)!.push(tri);
  }

  const keep = new Array(triCount).fill(true);
  for (const indices of keyMap.values()) {
    if (indices.length > 1) {
      for (const idx of indices) {
        keep[idx] = false;
      }
    }
  }

  let keptCount = 0;
  for (let tri = 0; tri < triCount; tri += 1) {
    if (keep[tri]) keptCount += 1;
  }

  const newPos = new Float32Array(keptCount * 9);
  const newColor = colorArray ? new Float32Array(keptCount * 9) : null;
  let dst = 0;

  for (let tri = 0; tri < triCount; tri += 1) {
    if (!keep[tri]) continue;
    const src = tri * 9;
    for (let i = 0; i < 9; i += 1) {
      newPos[dst + i] = posArray[src + i];
      if (newColor && colorArray) {
        newColor[dst + i] = colorArray[src + i];
      }
    }
    dst += 9;
  }

  const cleaned = new THREE.BufferGeometry();
  cleaned.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
  if (newColor) {
    cleaned.setAttribute("color", new THREE.BufferAttribute(newColor, 3));
  }
  cleaned.computeVertexNormals();
  return cleaned;
}

// ============================================================
// BUILDING GENERATION TYPES
// ============================================================

interface Cell {
  col: number;
  row: number;
}

interface Room {
  id: number;
  area: number;
  cells: Cell[];
  bounds: {
    minCol: number;
    maxCol: number;
    minRow: number;
    maxRow: number;
  };
}

interface FloorPlan {
  footprint: boolean[][];
  roomMap: number[][];
  rooms: Room[];
  internalOpenings: Map<string, string>;
  externalOpenings: Map<string, string>;
}

interface StairPlacement {
  col: number;
  row: number;
  direction: string;
  landing: Cell;
}

interface BuildingLayout {
  width: number;
  depth: number;
  floors: number;
  floorPlans: FloorPlan[];
  stairs: StairPlacement | null;
}

interface BuildingStats {
  wallSegments: number;
  doorways: number;
  archways: number;
  windows: number;
  roofPieces: number;
  floorTiles: number;
  stairSteps: number;
  props: number;
  rooms: number;
  footprintCells: number;
  upperFootprintCells: number;
}

// ============================================================
// FOOTPRINT AND ROOM GENERATION
// ============================================================

function cellId(col: number, row: number, width: number): number {
  return row * width + col;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function createFootprintGrid(
  width: number,
  depth: number,
  fill: boolean,
): boolean[][] {
  const grid: boolean[][] = [];
  for (let row = 0; row < depth; row += 1) {
    const line: boolean[] = [];
    for (let col = 0; col < width; col += 1) {
      line.push(Boolean(fill));
    }
    grid.push(line);
  }
  return grid;
}

function countFootprintCells(grid: boolean[][]): number {
  let count = 0;
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col]) count += 1;
    }
  }
  return count;
}

function getFootprintBounds(grid: boolean[][]): {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
} {
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (!grid[row][col]) continue;
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
    }
  }
  if (!Number.isFinite(minCol)) {
    return { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 };
  }
  return { minCol, maxCol, minRow, maxRow };
}

function isCellOccupied(grid: boolean[][], col: number, row: number): boolean {
  if (row < 0 || row >= grid.length) return false;
  if (col < 0 || col >= grid[row].length) return false;
  return Boolean(grid[row][col]);
}

function getExternalSideCount(
  grid: boolean[][],
  col: number,
  row: number,
): number {
  let count = 0;
  if (!isCellOccupied(grid, col, row)) return 0;
  if (!isCellOccupied(grid, col - 1, row)) count += 1;
  if (!isCellOccupied(grid, col + 1, row)) count += 1;
  if (!isCellOccupied(grid, col, row - 1)) count += 1;
  if (!isCellOccupied(grid, col, row + 1)) count += 1;
  return count;
}

function carveFootprintCorner(
  grid: boolean[][],
  width: number,
  depth: number,
  rng: RNG,
  carveRange: [number, number],
  minFill: number,
): void {
  const minCarve = Math.min(carveRange[0], width - 1, depth - 1);
  const maxCarve = Math.min(carveRange[1], width - 1, depth - 1);
  if (minCarve <= 0 || maxCarve <= 0) return;
  const carveWidth = rng.int(minCarve, maxCarve);
  const carveDepth = rng.int(minCarve, maxCarve);
  const corners = [
    { col: 0, row: 0 },
    { col: width - carveWidth, row: 0 },
    { col: 0, row: depth - carveDepth },
    { col: width - carveWidth, row: depth - carveDepth },
  ];
  const corner = rng.pick(corners)!;
  const totalBefore = countFootprintCells(grid);
  let removed = 0;
  for (let row = corner.row; row < corner.row + carveDepth; row += 1) {
    for (let col = corner.col; col < corner.col + carveWidth; col += 1) {
      if (grid[row][col]) removed += 1;
    }
  }
  const totalAfter = totalBefore - removed;
  if (totalAfter < totalBefore * minFill) return;
  for (let row = corner.row; row < corner.row + carveDepth; row += 1) {
    for (let col = corner.col; col < corner.col + carveWidth; col += 1) {
      grid[row][col] = false;
    }
  }
}

interface BaseFootprint {
  width: number;
  depth: number;
  cells: boolean[][];
  mainDepth: number;
  foyerCells: Set<number>;
  frontSide: string;
}

function generateBaseFootprint(
  recipe: BuildingRecipe,
  rng: RNG,
): BaseFootprint {
  const mainWidth = rng.int(recipe.widthRange[0], recipe.widthRange[1]);
  const mainDepth = rng.int(recipe.depthRange[0], recipe.depthRange[1]);
  const frontSide = recipe.frontSide || "south";
  let width = mainWidth;
  let depth = mainDepth;
  let cells: boolean[][] = [];
  const foyerCells = new Set<number>();

  if (
    recipe.footprintStyle === "foyer" &&
    recipe.foyerDepthRange &&
    recipe.foyerWidthRange
  ) {
    const foyerDepth = rng.int(
      recipe.foyerDepthRange[0],
      recipe.foyerDepthRange[1],
    );
    const maxFoyerWidth = Math.min(recipe.foyerWidthRange[1], mainWidth);
    const foyerWidth = rng.int(recipe.foyerWidthRange[0], maxFoyerWidth);
    depth = mainDepth + foyerDepth;
    cells = createFootprintGrid(width, depth, false);
    for (let row = 0; row < mainDepth; row += 1) {
      for (let col = 0; col < width; col += 1) {
        cells[row][col] = true;
      }
    }
    const startCol = Math.floor((width - foyerWidth) / 2);
    for (let row = mainDepth; row < depth; row += 1) {
      for (let col = startCol; col < startCol + foyerWidth; col += 1) {
        cells[row][col] = true;
        foyerCells.add(cellId(col, row, width));
      }
    }
  } else {
    cells = createFootprintGrid(width, depth, true);
  }

  const carveChance = recipe.carveChance ?? 0;
  if (carveChance > 0 && rng.chance(carveChance)) {
    const carveRange = recipe.carveSizeRange || [1, 2];
    carveFootprintCorner(
      cells,
      width,
      depth,
      rng,
      carveRange as [number, number],
      0.6,
    );
  }

  return {
    width,
    depth,
    cells,
    mainDepth,
    foyerCells,
    frontSide,
  };
}

function getStairPlacements(
  baseGrid: boolean[][],
  upperGrid: boolean[][],
): StairPlacement[] {
  const placements: StairPlacement[] = [];
  const depth = baseGrid.length;
  const width = baseGrid[0]?.length ?? 0;
  const countNeighbors = (
    grid: boolean[][],
    col: number,
    row: number,
  ): number => {
    let count = 0;
    if (isCellOccupied(grid, col - 1, row)) count += 1;
    if (isCellOccupied(grid, col + 1, row)) count += 1;
    if (isCellOccupied(grid, col, row - 1)) count += 1;
    if (isCellOccupied(grid, col, row + 1)) count += 1;
    return count;
  };
  const directions = [
    { dir: "x+", dc: 1, dr: 0 },
    { dir: "x-", dc: -1, dr: 0 },
    { dir: "z+", dc: 0, dr: 1 },
    { dir: "z-", dc: 0, dr: -1 },
  ];

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isCellOccupied(baseGrid, col, row)) continue;
      if (!isCellOccupied(upperGrid, col, row)) continue;
      for (const dir of directions) {
        const nextCol = col + dir.dc;
        const nextRow = row + dir.dr;
        if (!isCellOccupied(baseGrid, nextCol, nextRow)) continue;
        if (!isCellOccupied(upperGrid, nextCol, nextRow)) continue;
        const anchorNeighbors = countNeighbors(baseGrid, col, row);
        const landingNeighbors = countNeighbors(upperGrid, nextCol, nextRow);
        if (anchorNeighbors < 2) continue;
        if (landingNeighbors < 2) continue;
        const landingExits = getExternalSideCount(upperGrid, nextCol, nextRow);
        const connections = 4 - landingExits;
        if (connections < 2) continue;

        placements.push({
          col,
          row,
          direction: dir.dir,
          landing: { col: nextCol, row: nextRow },
        });
      }
    }
  }

  return placements;
}

function generateUpperFootprint(
  baseFootprint: BaseFootprint,
  recipe: BuildingRecipe,
  rng: RNG,
  protectedCells: Cell[],
  requireStairPlacement: boolean,
): boolean[][] | null {
  const { width, depth, cells, mainDepth } = baseFootprint;
  const protectedSet = new Set(
    protectedCells.map((cell) => cellId(cell.col, cell.row, width)),
  );
  const bounds = getFootprintBounds(cells);
  const insetRange = recipe.upperInsetRange || [1, 1];
  const insetMin = Math.max(0, Math.min(insetRange[0], insetRange[1]));
  const insetMax = Math.max(0, Math.max(insetRange[0], insetRange[1]));
  const insetStart = rng.int(insetMin, insetMax);
  const minUpperCells = Math.max(2, recipe.minUpperFloorCells ?? 2);
  const baseCellCount = countFootprintCells(cells);
  const minShrinkCells = Math.max(1, recipe.minUpperFloorShrinkCells ?? 1);
  const requireShrink = recipe.requireUpperShrink !== false;

  const buildUpper = (inset: number, allowCarve: boolean): boolean[][] => {
    let minCol = Math.min(bounds.minCol + inset, bounds.maxCol);
    let maxCol = Math.max(bounds.maxCol - inset, bounds.minCol);
    let minRow = Math.min(bounds.minRow + inset, bounds.maxRow);
    let maxRow = Math.max(bounds.maxRow - inset, bounds.minRow);

    for (const entry of protectedCells) {
      minCol = Math.min(minCol, entry.col);
      maxCol = Math.max(maxCol, entry.col);
      minRow = Math.min(minRow, entry.row);
      maxRow = Math.max(maxRow, entry.row);
    }

    const upper = createFootprintGrid(width, depth, false);
    for (let row = 0; row < depth; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (!cells[row][col]) continue;
        if (col < minCol || col > maxCol || row < minRow || row > maxRow) {
          continue;
        }
        if (recipe.excludeFoyerFromUpper && row >= mainDepth) {
          const key = cellId(col, row, width);
          if (!protectedSet.has(key)) continue;
        }
        upper[row][col] = true;
      }
    }

    if (allowCarve) {
      const carveChance = recipe.upperCarveChance ?? 0;
      if (carveChance > 0 && rng.chance(carveChance)) {
        const carveRange = recipe.carveSizeRange || [1, 2];
        carveFootprintCorner(
          upper,
          width,
          depth,
          rng,
          carveRange as [number, number],
          0.5,
        );
      }
    }

    for (const entry of protectedCells) {
      if (entry.row >= 0 && entry.row < depth) {
        if (entry.col >= 0 && entry.col < width) {
          upper[entry.row][entry.col] = true;
        }
      }
    }

    return upper;
  };

  const validateUpper = (upper: boolean[][]): boolean => {
    const upperCount = countFootprintCells(upper);
    const shrink = baseCellCount - upperCount;
    if (upperCount < minUpperCells) return false;
    if (requireShrink && shrink < minShrinkCells) return false;
    if (requireStairPlacement) {
      const placements = getStairPlacements(cells, upper);
      if (placements.length === 0) return false;
    }
    return true;
  };

  for (let inset = insetStart; inset >= 0; inset -= 1) {
    const carved = buildUpper(inset, true);
    if (validateUpper(carved)) {
      return carved;
    }
    const flat = buildUpper(inset, false);
    if (validateUpper(flat)) {
      return flat;
    }
  }

  return null;
}

// ============================================================
// ROOM GENERATION
// ============================================================

function fitsRoom(
  grid: boolean[][],
  roomMap: number[][],
  col: number,
  row: number,
  spanCol: number,
  spanRow: number,
): boolean {
  for (let r = row; r < row + spanRow; r += 1) {
    for (let c = col; c < col + spanCol; c += 1) {
      if (!isCellOccupied(grid, c, r)) return false;
      if (roomMap[r][c] !== -1) return false;
    }
  }
  return true;
}

function rebuildRooms(
  grid: boolean[][],
  roomMap: number[][],
): { rooms: Room[]; roomMap: number[][] } {
  const depth = grid.length;
  const width = grid[0]?.length ?? 0;
  const idMap = new Map<number, number>();
  let nextId = 0;
  const rooms: Room[] = [];

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const oldId = roomMap[row][col];
      if (oldId < 0) continue;
      if (!idMap.has(oldId)) {
        idMap.set(oldId, nextId);
        rooms.push({
          id: nextId,
          area: 0,
          cells: [],
          bounds: {
            minCol: col,
            maxCol: col,
            minRow: row,
            maxRow: row,
          },
        });
        nextId += 1;
      }
      const newId = idMap.get(oldId)!;
      roomMap[row][col] = newId;
      const room = rooms[newId];
      room.area += 1;
      room.cells.push({ col, row });
      room.bounds.minCol = Math.min(room.bounds.minCol, col);
      room.bounds.maxCol = Math.max(room.bounds.maxCol, col);
      room.bounds.minRow = Math.min(room.bounds.minRow, row);
      room.bounds.maxRow = Math.max(room.bounds.maxRow, row);
    }
  }

  return { rooms, roomMap };
}

function mergeSmallRooms(
  grid: boolean[][],
  roomMap: number[][],
  minArea: number,
): { rooms: Room[]; roomMap: number[][] } {
  if (minArea <= 1) {
    return rebuildRooms(grid, roomMap);
  }
  const depth = grid.length;
  const width = grid[0]?.length ?? 0;
  const roomAreas = new Map<number, number>();

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const roomId = roomMap[row][col];
      if (roomId < 0) continue;
      roomAreas.set(roomId, (roomAreas.get(roomId) || 0) + 1);
    }
  }

  for (const [roomId, area] of roomAreas.entries()) {
    if (area >= minArea) continue;
    const neighbors = new Map<number, number>();
    for (let row = 0; row < depth; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (roomMap[row][col] !== roomId) continue;
        const adj = [
          { c: col - 1, r: row },
          { c: col + 1, r: row },
          { c: col, r: row - 1 },
          { c: col, r: row + 1 },
        ];
        for (const entry of adj) {
          const neighborId = isCellOccupied(grid, entry.c, entry.r)
            ? roomMap[entry.r][entry.c]
            : -1;
          if (neighborId >= 0 && neighborId !== roomId) {
            neighbors.set(neighborId, (neighbors.get(neighborId) || 0) + 1);
          }
        }
      }
    }
    let bestNeighbor: number | null = null;
    let bestCount = -1;
    for (const [neighborId, count] of neighbors.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestNeighbor = neighborId;
      }
    }
    if (bestNeighbor === null) continue;
    for (let row = 0; row < depth; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (roomMap[row][col] === roomId) {
          roomMap[row][col] = bestNeighbor;
        }
      }
    }
  }

  return rebuildRooms(grid, roomMap);
}

function generateRoomsForFootprint(
  grid: boolean[][],
  recipe: BuildingRecipe,
  rng: RNG,
): { rooms: Room[]; roomMap: number[][] } {
  const depth = grid.length;
  const width = grid[0]?.length ?? 0;
  const roomMap: number[][] = [];
  for (let row = 0; row < depth; row += 1) {
    const line: number[] = [];
    for (let col = 0; col < width; col += 1) {
      line.push(-1);
    }
    roomMap.push(line);
  }

  const minSpan = recipe.roomSpanRange ? recipe.roomSpanRange[0] : 1;
  const maxSpan = recipe.roomSpanRange ? recipe.roomSpanRange[1] : 2;
  let roomId = 0;

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isCellOccupied(grid, col, row)) continue;
      if (roomMap[row][col] !== -1) continue;

      let maxWidth = 0;
      for (let c = col; c < width; c += 1) {
        if (!isCellOccupied(grid, c, row) || roomMap[row][c] !== -1) break;
        maxWidth += 1;
      }
      let maxDepth = 0;
      for (let r = row; r < depth; r += 1) {
        if (!isCellOccupied(grid, col, r) || roomMap[r][col] !== -1) break;
        maxDepth += 1;
      }

      let spanCol = Math.min(maxWidth, maxSpan);
      let spanRow = Math.min(maxDepth, maxSpan);
      spanCol = Math.max(minSpan, spanCol);
      spanRow = Math.max(minSpan, spanRow);

      let chosenWidth = rng.int(minSpan, spanCol);
      let chosenDepth = rng.int(minSpan, spanRow);

      let attempts = 0;
      while (
        attempts < 6 &&
        !fitsRoom(grid, roomMap, col, row, chosenWidth, chosenDepth)
      ) {
        if (chosenWidth > 1 && chosenWidth >= chosenDepth) {
          chosenWidth -= 1;
        } else if (chosenDepth > 1) {
          chosenDepth -= 1;
        }
        attempts += 1;
      }

      if (!fitsRoom(grid, roomMap, col, row, chosenWidth, chosenDepth)) {
        chosenWidth = 1;
        chosenDepth = 1;
      }

      for (let r = row; r < row + chosenDepth; r += 1) {
        for (let c = col; c < col + chosenWidth; c += 1) {
          roomMap[r][c] = roomId;
        }
      }
      roomId += 1;
    }
  }

  return mergeSmallRooms(grid, roomMap, recipe.minRoomArea || 1);
}

// ============================================================
// ROOM OPENINGS AND EXTERNAL EDGES
// ============================================================

function collectRoomAdjacencies(
  grid: boolean[][],
  roomMap: number[][],
): Array<{ roomA: number; roomB: number; edges: Array<{ a: Cell; b: Cell }> }> {
  const depth = grid.length;
  const width = grid[0]?.length ?? 0;
  const adjacency = new Map<
    string,
    { roomA: number; roomB: number; edges: Array<{ a: Cell; b: Cell }> }
  >();

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isCellOccupied(grid, col, row)) continue;
      const roomId = roomMap[row][col];
      const rightCol = col + 1;
      const downRow = row + 1;

      if (isCellOccupied(grid, rightCol, row)) {
        const neighborId = roomMap[row][rightCol];
        if (neighborId !== roomId) {
          const key = edgeKey(roomId, neighborId);
          if (!adjacency.has(key)) {
            adjacency.set(key, {
              roomA: Math.min(roomId, neighborId),
              roomB: Math.max(roomId, neighborId),
              edges: [],
            });
          }
          adjacency.get(key)!.edges.push({
            a: { col, row },
            b: { col: rightCol, row },
          });
        }
      }

      if (isCellOccupied(grid, col, downRow)) {
        const neighborId = roomMap[downRow][col];
        if (neighborId !== roomId) {
          const key = edgeKey(roomId, neighborId);
          if (!adjacency.has(key)) {
            adjacency.set(key, {
              roomA: Math.min(roomId, neighborId),
              roomB: Math.max(roomId, neighborId),
              edges: [],
            });
          }
          adjacency.get(key)!.edges.push({
            a: { col, row },
            b: { col, row: downRow },
          });
        }
      }
    }
  }

  return Array.from(adjacency.values());
}

function selectRoomOpenings(
  roomCount: number,
  adjacency: Array<{
    roomA: number;
    roomB: number;
    edges: Array<{ a: Cell; b: Cell }>;
  }>,
  archBias: number,
  extraChance: number,
  rng: RNG,
  width: number,
): Map<string, string> {
  const openings = new Map<string, string>();
  if (roomCount <= 1) return openings;
  const parent = Array.from({ length: roomCount }, (_, i) => i);
  const find = (value: number): number => {
    let current = value;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (a: number, b: number): boolean => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootB] = rootA;
      return true;
    }
    return false;
  };

  const shuffled = rng.shuffle(adjacency);
  const used = new Set<string>();

  for (const edge of shuffled) {
    if (union(edge.roomA, edge.roomB)) {
      const choice = rng.pick(edge.edges)!;
      const idA = cellId(choice.a.col, choice.a.row, width);
      const idB = cellId(choice.b.col, choice.b.row, width);
      const type = rng.chance(archBias) ? "arch" : "door";
      openings.set(edgeKey(idA, idB), type);
      used.add(edgeKey(edge.roomA, edge.roomB));
    }
  }

  for (const edge of shuffled) {
    const key = edgeKey(edge.roomA, edge.roomB);
    if (used.has(key)) continue;
    if (rng.chance(extraChance)) {
      const choice = rng.pick(edge.edges)!;
      const idA = cellId(choice.a.col, choice.a.row, width);
      const idB = cellId(choice.b.col, choice.b.row, width);
      const type = rng.chance(archBias) ? "arch" : "door";
      openings.set(edgeKey(idA, idB), type);
    }
  }

  return openings;
}

function collectExternalEdges(
  grid: boolean[][],
): Array<{ col: number; row: number; side: string }> {
  const depth = grid.length;
  const width = grid[0]?.length ?? 0;
  const edges: Array<{ col: number; row: number; side: string }> = [];
  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isCellOccupied(grid, col, row)) continue;
      if (!isCellOccupied(grid, col - 1, row)) {
        edges.push({ col, row, side: "west" });
      }
      if (!isCellOccupied(grid, col + 1, row)) {
        edges.push({ col, row, side: "east" });
      }
      if (!isCellOccupied(grid, col, row - 1)) {
        edges.push({ col, row, side: "north" });
      }
      if (!isCellOccupied(grid, col, row + 1)) {
        edges.push({ col, row, side: "south" });
      }
    }
  }
  return edges;
}

function collectPatioEdges(
  baseGrid: boolean[][],
  upperGrid: boolean[][],
): Array<{ col: number; row: number; side: string }> {
  const depth = baseGrid.length;
  const width = baseGrid[0]?.length ?? 0;
  const edges: Array<{ col: number; row: number; side: string }> = [];
  const directions = [
    { side: "west", dc: -1, dr: 0 },
    { side: "east", dc: 1, dr: 0 },
    { side: "north", dc: 0, dr: -1 },
    { side: "south", dc: 0, dr: 1 },
  ];

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isCellOccupied(upperGrid, col, row)) continue;
      for (const dir of directions) {
        const nextCol = col + dir.dc;
        const nextRow = row + dir.dr;
        if (!isCellOccupied(baseGrid, nextCol, nextRow)) continue;
        if (isCellOccupied(upperGrid, nextCol, nextRow)) continue;
        edges.push({ col, row, side: dir.side });
      }
    }
  }

  return edges;
}

function chooseEntranceRoomId(
  rooms: Room[],
  foyerCells: Set<number>,
  width: number,
): number {
  if (foyerCells && foyerCells.size > 0) {
    let bestRoom: number | null = null;
    let bestCount = 0;
    for (const room of rooms) {
      let count = 0;
      for (const cell of room.cells) {
        if (foyerCells.has(cellId(cell.col, cell.row, width))) {
          count += 1;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestRoom = room.id;
      }
    }
    if (bestRoom !== null) return bestRoom;
  }
  let largestRoom: number | null = null;
  let largestArea = -1;
  for (const room of rooms) {
    if (room.area > largestArea) {
      largestArea = room.area;
      largestRoom = room.id;
    }
  }
  return largestRoom ?? 0;
}

function generateExternalOpenings(
  grid: boolean[][],
  roomMap: number[][],
  recipe: BuildingRecipe,
  rng: RNG,
  entranceCount: number,
  entranceRoomId: number,
  frontSide: string,
  windowChance: number,
  width: number,
  stairs: StairPlacement | null,
): Map<string, string> {
  const edges = collectExternalEdges(grid);
  const openings = new Map<string, string>();
  const entranceCandidates = edges.filter(
    (edge) => roomMap[edge.row][edge.col] === entranceRoomId,
  );
  const frontCandidates = entranceCandidates.filter(
    (edge) => edge.side === frontSide,
  );
  let candidates =
    frontCandidates.length > 0 ? frontCandidates : entranceCandidates;
  if (candidates.length === 0) candidates = edges;
  const shuffled = rng.shuffle(candidates);

  for (let i = 0; i < Math.min(entranceCount, shuffled.length); i += 1) {
    const entry = shuffled[i];
    const type = rng.chance(recipe.entranceArchChance) ? "arch" : "door";
    openings.set(`${cellId(entry.col, entry.row, width)}:${entry.side}`, type);
  }

  for (const edge of edges) {
    const key = `${cellId(edge.col, edge.row, width)}:${edge.side}`;
    if (openings.has(key)) continue;

    if (stairs) {
      const isAnchor = edge.col === stairs.col && edge.row === stairs.row;
      const isLanding =
        stairs.landing &&
        edge.col === stairs.landing.col &&
        edge.row === stairs.landing.row;
      if (isAnchor || isLanding) continue;
    }

    if (rng.chance(windowChance)) {
      openings.set(key, "window");
    }
  }

  return openings;
}

function applyPatioDoors(
  externalOpenings: Map<string, string>,
  baseFootprint: boolean[][],
  upperFootprint: boolean[][],
  recipe: BuildingRecipe,
  rng: RNG,
  width: number,
): number {
  const patioChance =
    typeof recipe.patioDoorChance === "number" ? recipe.patioDoorChance : 0.4;
  if (!rng.chance(patioChance)) return 0;
  const edges = collectPatioEdges(baseFootprint, upperFootprint);
  if (edges.length === 0) return 0;
  const countRange = recipe.patioDoorCountRange || [1, 1];
  const minCount = Math.max(1, countRange[0]);
  const maxCount = Math.max(minCount, countRange[1]);
  const target = Math.min(edges.length, rng.int(minCount, maxCount));
  const shuffled = rng.shuffle(edges);

  let placed = 0;
  for (const edge of shuffled) {
    if (placed >= target) break;
    const key = `${cellId(edge.col, edge.row, width)}:${edge.side}`;
    externalOpenings.set(key, "door");
    placed += 1;
  }
  return placed;
}

function pickStairPlacement(
  baseGrid: boolean[][],
  upperGrid: boolean[][],
  rng: RNG,
): StairPlacement | null {
  const placements = getStairPlacements(baseGrid, upperGrid);
  if (placements.length === 0) return null;

  const bounds = getFootprintBounds(upperGrid);
  const centerCol = (bounds.minCol + bounds.maxCol) / 2;
  const centerRow = (bounds.minRow + bounds.maxRow) / 2;

  let bestScore = -Infinity;
  const best: StairPlacement[] = [];

  for (const placement of placements) {
    const distance =
      Math.abs(placement.col - centerCol) + Math.abs(placement.row - centerRow);
    const landingDistance =
      Math.abs(placement.landing.col - centerCol) +
      Math.abs(placement.landing.row - centerRow);
    const externalSides = getExternalSideCount(
      upperGrid,
      placement.col,
      placement.row,
    );
    const score = -(distance + landingDistance) - externalSides * 0.5;

    if (score > bestScore) {
      bestScore = score;
      best.length = 0;
      best.push(placement);
    } else if (score === bestScore) {
      best.push(placement);
    }
  }

  return rng.pick(best);
}

function ensureStairExit(
  floorPlan: FloorPlan,
  cell: Cell,
  otherCell: Cell,
  width: number,
): boolean {
  const footprint = floorPlan.footprint;
  const roomMap = floorPlan.roomMap;
  const internalOpenings = floorPlan.internalOpenings;
  const directions = [
    { dc: -1, dr: 0 },
    { dc: 1, dr: 0 },
    { dc: 0, dr: -1 },
    { dc: 0, dr: 1 },
  ];

  for (const dir of directions) {
    const col = cell.col + dir.dc;
    const row = cell.row + dir.dr;
    if (!isCellOccupied(footprint, col, row)) continue;
    if (col === otherCell.col && row === otherCell.row) continue;
    if (roomMap[row][col] === roomMap[cell.row][cell.col]) {
      return true;
    }
    const key = edgeKey(
      cellId(cell.col, cell.row, width),
      cellId(col, row, width),
    );
    if (internalOpenings.has(key)) {
      return true;
    }
  }

  for (const dir of directions) {
    const col = cell.col + dir.dc;
    const row = cell.row + dir.dr;
    if (!isCellOccupied(footprint, col, row)) continue;
    if (col === otherCell.col && row === otherCell.row) continue;
    const key = edgeKey(
      cellId(cell.col, cell.row, width),
      cellId(col, row, width),
    );
    internalOpenings.set(key, "arch");
    return true;
  }

  return false;
}

function resolveFloorCount(recipe: BuildingRecipe, rng: RNG): number {
  if (recipe.floorsRange) {
    const minFloors = Math.max(1, recipe.floorsRange[0]);
    const maxFloors = Math.max(minFloors, recipe.floorsRange[1]);
    return rng.int(minFloors, maxFloors);
  }
  return Math.max(1, recipe.floors || 1);
}

// ============================================================
// LAYOUT GENERATION
// ============================================================

function generateLayout(recipe: BuildingRecipe, rng: RNG): BuildingLayout {
  const baseFootprint = generateBaseFootprint(recipe, rng);
  let floors = resolveFloorCount(recipe, rng);
  const floorPlans: FloorPlan[] = [];
  const upperFootprints: boolean[][][] = [];

  upperFootprints.push(baseFootprint.cells);
  if (floors > 1) {
    const protectedCells: Cell[] = [];
    const upper = generateUpperFootprint(
      baseFootprint,
      recipe,
      rng,
      protectedCells,
      true,
    );
    if (upper) {
      upperFootprints.push(upper);
    } else {
      floors = 1;
    }
  }

  let stairs: StairPlacement | null = null;
  if (floors > 1) {
    stairs = pickStairPlacement(baseFootprint.cells, upperFootprints[1], rng);
    if (!stairs) {
      floors = 1;
      upperFootprints.length = 1;
    }
  }

  for (let floor = 0; floor < floors; floor += 1) {
    const footprint = upperFootprints[floor];
    const roomData = generateRoomsForFootprint(footprint, recipe, rng);
    const rooms = roomData.rooms;
    const roomMap = roomData.roomMap;
    const archBias = Math.min(
      0.9,
      Math.max(0.1, recipe.archBias - floor * 0.15),
    );
    const extraChance = recipe.extraConnectionChance * (floor === 0 ? 1 : 0.7);
    const adjacency = collectRoomAdjacencies(footprint, roomMap);
    const internalOpenings = selectRoomOpenings(
      rooms.length,
      adjacency,
      archBias,
      extraChance,
      rng,
      baseFootprint.width,
    );

    const entranceRoomId =
      floor === 0
        ? chooseEntranceRoomId(
            rooms,
            baseFootprint.foyerCells,
            baseFootprint.width,
          )
        : 0;
    const entranceCount = floor === 0 ? recipe.entranceCount : 0;
    const windowChance = recipe.windowChance * (floor === 0 ? 1 : 0.7);
    const externalOpenings = generateExternalOpenings(
      footprint,
      roomMap,
      recipe,
      rng,
      entranceCount,
      entranceRoomId,
      baseFootprint.frontSide,
      windowChance,
      baseFootprint.width,
      stairs,
    );

    if (floors > 1 && floor > 0) {
      applyPatioDoors(
        externalOpenings,
        upperFootprints[0],
        footprint,
        recipe,
        rng,
        baseFootprint.width,
      );
    }

    floorPlans.push({
      footprint,
      roomMap,
      rooms,
      internalOpenings,
      externalOpenings,
    });
  }

  if (stairs && floors > 1) {
    const anchorId = cellId(stairs.col, stairs.row, baseFootprint.width);
    const landingId = cellId(
      stairs.landing.col,
      stairs.landing.row,
      baseFootprint.width,
    );
    const openingKey = edgeKey(anchorId, landingId);
    const openingType = "arch";
    floorPlans[0]?.internalOpenings.set(openingKey, openingType);
    floorPlans[1]?.internalOpenings.set(openingKey, openingType);

    if (floorPlans[0]) {
      ensureStairExit(
        floorPlans[0],
        { col: stairs.col, row: stairs.row },
        { col: stairs.landing.col, row: stairs.landing.row },
        baseFootprint.width,
      );
    }
    if (floorPlans[1]) {
      ensureStairExit(
        floorPlans[1],
        { col: stairs.landing.col, row: stairs.landing.row },
        { col: stairs.col, row: stairs.row },
        baseFootprint.width,
      );
    }
  }

  return {
    width: baseFootprint.width,
    depth: baseFootprint.depth,
    floors,
    floorPlans,
    stairs,
  };
}

// ============================================================
// GEOMETRY BUILDING
// ============================================================

function getCellCenter(
  col: number,
  row: number,
  width: number,
  depth: number,
): { x: number; z: number } {
  const halfWidth = (width * CELL_SIZE) / 2;
  const halfDepth = (depth * CELL_SIZE) / 2;
  return {
    x: -halfWidth + col * CELL_SIZE + CELL_SIZE / 2,
    z: -halfDepth + row * CELL_SIZE + CELL_SIZE / 2,
  };
}

function getSideVector(side: string): { x: number; z: number } {
  switch (side) {
    case "north":
      return { x: 0, z: -1 };
    case "south":
      return { x: 0, z: 1 };
    case "east":
      return { x: 1, z: 0 };
    case "west":
      return { x: -1, z: 0 };
    default:
      return { x: 0, z: 1 };
  }
}

function getOppositeSide(side: string): string {
  switch (side) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    case "west":
      return "east";
    default:
      return "north";
  }
}

function getRoomCenter(room: Room): { col: number; row: number } {
  let sumCol = 0;
  let sumRow = 0;
  for (const cell of room.cells) {
    sumCol += cell.col;
    sumRow += cell.row;
  }
  const count = room.cells.length || 1;
  return { col: sumCol / count, row: sumRow / count };
}

function pickClosestRoomCell(
  room: Room,
  target: { col: number; row: number },
  rng: RNG,
  avoidCell: Cell | null,
): Cell | null {
  let bestDistance = Infinity;
  const bestCells: Cell[] = [];
  for (const cell of room.cells) {
    if (avoidCell && cell.col === avoidCell.col && cell.row === avoidCell.row) {
      continue;
    }
    const distance =
      Math.abs(cell.col - target.col) + Math.abs(cell.row - target.row);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCells.length = 0;
      bestCells.push(cell);
    } else if (distance === bestDistance) {
      bestCells.push(cell);
    }
  }
  if (bestCells.length === 0) return null;
  return rng ? rng.pick(bestCells) : bestCells[0];
}

function pickRoomCellOnSide(
  room: Room,
  footprint: boolean[][],
  side: string,
  rng: RNG,
): Cell | null {
  const delta = getSideVector(side);
  const candidates = room.cells.filter((cell) => {
    const neighborCol = cell.col + delta.x;
    const neighborRow = cell.row + delta.z;
    return !isCellOccupied(footprint, neighborCol, neighborRow);
  });
  if (candidates.length === 0) return null;
  const center = getRoomCenter(room);
  let bestDistance = Infinity;
  const best: Cell[] = [];
  for (const cell of candidates) {
    const distance =
      Math.abs(cell.col - center.col) + Math.abs(cell.row - center.row);
    if (distance < bestDistance) {
      bestDistance = distance;
      best.length = 0;
      best.push(cell);
    } else if (distance === bestDistance) {
      best.push(cell);
    }
  }
  return rng ? rng.pick(best) : best[0];
}

function pickRoomCellOnSolidSide(
  room: Room,
  footprint: boolean[][],
  externalOpenings: Map<string, string>,
  width: number,
  side: string,
  rng: RNG,
): Cell | null {
  const delta = getSideVector(side);
  const candidates = room.cells.filter((cell) => {
    const neighborCol = cell.col + delta.x;
    const neighborRow = cell.row + delta.z;
    if (isCellOccupied(footprint, neighborCol, neighborRow)) return false;
    const key = `${cellId(cell.col, cell.row, width)}:${side}`;
    return !externalOpenings.has(key);
  });
  if (candidates.length === 0) return null;
  const center = getRoomCenter(room);
  let bestDistance = Infinity;
  const best: Cell[] = [];
  for (const cell of candidates) {
    const distance =
      Math.abs(cell.col - center.col) + Math.abs(cell.row - center.row);
    if (distance < bestDistance) {
      bestDistance = distance;
      best.length = 0;
      best.push(cell);
    } else if (distance === bestDistance) {
      best.push(cell);
    }
  }
  return rng ? rng.pick(best) : best[0];
}

function getWallNpcPlacement(npcGap: number): {
  counterOffset: number;
  npcDistance: number;
} {
  const wallClearance = WALL_THICKNESS / 2 + 0.05;
  const wallInnerDistance = CELL_SIZE / 2 - wallClearance;
  const npcDistance = COUNTER_DEPTH / 2 + NPC_WIDTH / 2 + npcGap;
  const maxCounterOffset = wallInnerDistance - NPC_WIDTH / 2 - npcDistance;
  const counterOffset = Math.max(0, maxCounterOffset);
  return { counterOffset, npcDistance };
}

function createArchTopGeometry(
  radius: number,
  thickness: number,
  bottomTrim = 0,
): THREE.ExtrudeGeometry {
  const topY = radius + bottomTrim;
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.absarc(0, 0, radius, Math.PI, 0, true);
  shape.lineTo(radius, topY);
  shape.lineTo(-radius, topY);
  shape.lineTo(-radius, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.translate(0, -bottomTrim, -thickness / 2);
  return geometry;
}

function createMiteredBoxGeometry(
  width: number,
  height: number,
  depth: number,
  miterNeg: boolean,
  miterPos: boolean,
  invertMiter: boolean,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const pos = geometry.attributes.position;
  const halfDepth = depth / 2;

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const isOuter = invertMiter ? z > 0 : z < 0;

    if (x < 0 && miterNeg) {
      if (isOuter) pos.setX(i, x - halfDepth);
      else pos.setX(i, x + halfDepth);
    } else if (x > 0 && miterPos) {
      if (isOuter) pos.setX(i, x + halfDepth);
      else pos.setX(i, x - halfDepth);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addWallSegment(
  geometries: THREE.BufferGeometry[],
  length: number,
  height: number,
  thickness: number,
  orientation: string,
  center: { x: number; z: number },
  baseY: number,
  offset: number,
  color: THREE.Color,
  stats: BuildingStats,
  miterLeft = false,
  miterRight = false,
  invertMiter = false,
): void {
  if (length <= 0.01 || height <= 0.01) return;
  const geometry = createMiteredBoxGeometry(
    length,
    height,
    thickness,
    miterLeft,
    miterRight,
    invertMiter,
  );
  if (orientation === "z") {
    geometry.rotateY(Math.PI / 2);
  }

  const x = center.x + (orientation === "x" ? offset : 0);
  const y = baseY + height / 2;
  const z = center.z + (orientation === "z" ? offset : 0);

  geometry.translate(x, y, z);
  applyVertexColors(geometry, color, 0.35, 0.35, 0.78);

  geometries.push(geometry);
  stats.wallSegments += 1;
}

function addWallWithOpening(
  geometries: THREE.BufferGeometry[],
  length: number,
  height: number,
  thickness: number,
  orientation: string,
  center: { x: number; z: number },
  baseY: number,
  openingType: string | null,
  stats: BuildingStats,
  miterLeft = false,
  miterRight = false,
  invertMiter = false,
): void {
  if (!openingType) {
    addWallSegment(
      geometries,
      length,
      height,
      thickness,
      orientation,
      center,
      baseY,
      0,
      palette.wall,
      stats,
      miterLeft,
      miterRight,
      invertMiter,
    );
    return;
  }

  const isArch = openingType === "arch";
  const isWindow = openingType === "window";
  const openingWidth = Math.min(
    isWindow ? WINDOW_WIDTH : isArch ? ARCH_WIDTH : DOOR_WIDTH,
    length - thickness * 2,
  );
  const sideLength = (length - openingWidth) / 2;

  addWallSegment(
    geometries,
    sideLength,
    height,
    thickness,
    orientation,
    center,
    baseY,
    -(openingWidth / 2 + sideLength / 2),
    palette.wall,
    stats,
    miterLeft,
    false,
    invertMiter,
  );
  addWallSegment(
    geometries,
    sideLength,
    height,
    thickness,
    orientation,
    center,
    baseY,
    openingWidth / 2 + sideLength / 2,
    palette.wall,
    stats,
    false,
    miterRight,
    invertMiter,
  );

  if (isWindow) {
    const sillHeight = Math.min(WINDOW_SILL_HEIGHT, height - WINDOW_HEIGHT);
    const windowHeight = Math.min(WINDOW_HEIGHT, height - sillHeight);
    const headHeight = sillHeight + windowHeight;
    const topHeight = height - headHeight;

    addWallSegment(
      geometries,
      openingWidth,
      sillHeight,
      thickness,
      orientation,
      center,
      baseY,
      0,
      palette.wall,
      stats,
      false,
      false,
      invertMiter,
    );
    addWallSegment(
      geometries,
      openingWidth,
      topHeight,
      thickness,
      orientation,
      center,
      baseY + headHeight,
      0,
      palette.wall,
      stats,
      false,
      false,
      invertMiter,
    );
    stats.windows += 1;
    return;
  }

  if (isArch) {
    const archRadius = openingWidth / 2;
    const openingHeight = height - archRadius;
    const archBottomTrim = Math.min(thickness * 0.5, archRadius * 0.25);
    const archGeometry = createArchTopGeometry(
      archRadius,
      thickness * 0.9,
      archBottomTrim,
    );
    if (orientation === "z") {
      archGeometry.rotateY(Math.PI / 2);
    }
    archGeometry.translate(center.x, baseY + openingHeight, center.z);
    applyVertexColors(archGeometry, palette.wall, 0.35, 0.35, 0.78);
    geometries.push(archGeometry);
    stats.archways += 1;
    return;
  }

  const openingHeight = DOOR_HEIGHT;
  const topHeight = height - openingHeight;
  addWallSegment(
    geometries,
    openingWidth,
    topHeight,
    thickness,
    orientation,
    center,
    baseY + openingHeight,
    0,
    palette.wall,
    stats,
    false,
    false,
    invertMiter,
  );
  stats.doorways += 1;
}

function addFloorTiles(
  geometries: THREE.BufferGeometry[],
  layout: BuildingLayout,
  floorIndex: number,
  stats: BuildingStats,
): void {
  const { width, depth } = layout;
  const footprint = layout.floorPlans[floorIndex].footprint;
  const baseY = floorIndex * FLOOR_HEIGHT;
  const tileY = baseY + FLOOR_THICKNESS / 2;
  const stair = layout.stairs;
  const stairWidth = CELL_SIZE * 0.5;
  const sideWidth = (CELL_SIZE - stairWidth) / 2;
  const shouldCutStair = Boolean(stair) && floorIndex === 1;

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isCellOccupied(footprint, col, row)) continue;
      const center = getCellCenter(col, row, width, depth);
      const isStairCell =
        shouldCutStair && stair!.col === col && stair!.row === row;

      if (!isStairCell) {
        const geometry = new THREE.BoxGeometry(
          CELL_SIZE,
          FLOOR_THICKNESS,
          CELL_SIZE,
        );
        geometry.translate(center.x, tileY, center.z);
        applyVertexColors(geometry, palette.floor, 0.22, 0.1, 0.88);
        geometries.push(geometry);
        stats.floorTiles += 1;
        continue;
      }

      const stripDepth =
        stair!.direction === "x+" || stair!.direction === "x-"
          ? sideWidth
          : CELL_SIZE;
      const stripWidth =
        stair!.direction === "x+" || stair!.direction === "x-"
          ? CELL_SIZE
          : sideWidth;
      const offset = stairWidth / 2 + sideWidth / 2;

      const stripA = new THREE.BoxGeometry(
        stripWidth,
        FLOOR_THICKNESS,
        stripDepth,
      );
      const stripB = stripA.clone();

      if (stair!.direction === "x+" || stair!.direction === "x-") {
        stripA.translate(center.x, tileY, center.z - offset);
        stripB.translate(center.x, tileY, center.z + offset);
      } else {
        stripA.translate(center.x - offset, tileY, center.z);
        stripB.translate(center.x + offset, tileY, center.z);
      }

      applyVertexColors(stripA, palette.floor, 0.22, 0.1, 0.88);
      applyVertexColors(stripB, palette.floor, 0.22, 0.1, 0.88);
      geometries.push(stripA, stripB);
      stats.floorTiles += 1;
    }
  }
}

function addFloorEdgeSkirts(
  geometries: THREE.BufferGeometry[],
  layout: BuildingLayout,
  floorIndex: number,
): void {
  const { width, depth } = layout;
  const footprint = layout.floorPlans[floorIndex].footprint;
  const halfWidth = (width * CELL_SIZE) / 2;
  const halfDepth = (depth * CELL_SIZE) / 2;
  const skirtSize = WALL_THICKNESS / 2;
  const tileY = floorIndex * FLOOR_HEIGHT + FLOOR_THICKNESS / 2;
  const nsGeometry = new THREE.BoxGeometry(
    CELL_SIZE,
    FLOOR_THICKNESS,
    skirtSize,
  );
  const ewGeometry = new THREE.BoxGeometry(
    skirtSize,
    FLOOR_THICKNESS,
    CELL_SIZE,
  );

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isCellOccupied(footprint, col, row)) continue;

      if (!isCellOccupied(footprint, col, row - 1)) {
        const center = getCellCenter(col, row, width, depth);
        const geo = nsGeometry.clone();
        geo.translate(
          center.x,
          tileY,
          -halfDepth + row * CELL_SIZE - skirtSize / 2,
        );
        applyVertexColors(geo, palette.floor, 0.22, 0.1, 0.88);
        geometries.push(geo);
      }

      if (!isCellOccupied(footprint, col, row + 1)) {
        const center = getCellCenter(col, row, width, depth);
        const geo = nsGeometry.clone();
        geo.translate(
          center.x,
          tileY,
          -halfDepth + (row + 1) * CELL_SIZE + skirtSize / 2,
        );
        applyVertexColors(geo, palette.floor, 0.22, 0.1, 0.88);
        geometries.push(geo);
      }

      if (!isCellOccupied(footprint, col - 1, row)) {
        const center = getCellCenter(col, row, width, depth);
        const geo = ewGeometry.clone();
        geo.translate(
          -halfWidth + col * CELL_SIZE - skirtSize / 2,
          tileY,
          center.z,
        );
        applyVertexColors(geo, palette.floor, 0.22, 0.1, 0.88);
        geometries.push(geo);
      }

      if (!isCellOccupied(footprint, col + 1, row)) {
        const center = getCellCenter(col, row, width, depth);
        const geo = ewGeometry.clone();
        geo.translate(
          -halfWidth + (col + 1) * CELL_SIZE + skirtSize / 2,
          tileY,
          center.z,
        );
        applyVertexColors(geo, palette.floor, 0.22, 0.1, 0.88);
        geometries.push(geo);
      }
    }
  }
}

function addWallsForFloor(
  geometries: THREE.BufferGeometry[],
  layout: BuildingLayout,
  floorPlan: FloorPlan,
  floorIndex: number,
  stats: BuildingStats,
): void {
  const { width, depth } = layout;
  const footprint = floorPlan.footprint;
  const roomMap = floorPlan.roomMap;
  const baseY = floorIndex * FLOOR_HEIGHT + FLOOR_THICKNESS;
  const halfWidth = (width * CELL_SIZE) / 2;
  const halfDepth = (depth * CELL_SIZE) / 2;

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isCellOccupied(footprint, col, row)) continue;
      const id = cellId(col, row, width);

      const rightOccupied = isCellOccupied(footprint, col + 1, row);
      if (rightOccupied) {
        const neighborId = cellId(col + 1, row, width);
        if (roomMap[row][col + 1] !== roomMap[row][col]) {
          const opening = floorPlan.internalOpenings.get(
            edgeKey(id, neighborId),
          );
          const center = {
            x: -halfWidth + (col + 1) * CELL_SIZE,
            z: -halfDepth + row * CELL_SIZE + CELL_SIZE / 2,
          };
          addWallWithOpening(
            geometries,
            CELL_SIZE,
            WALL_HEIGHT,
            WALL_THICKNESS,
            "z",
            center,
            baseY,
            opening || null,
            stats,
          );
        }
      } else {
        const center = {
          x: -halfWidth + (col + 1) * CELL_SIZE,
          z: -halfDepth + row * CELL_SIZE + CELL_SIZE / 2,
        };
        const opening = floorPlan.externalOpenings.get(`${id}:east`);
        const miterLeft =
          !isCellOccupied(footprint, col, row - 1) &&
          !isCellOccupied(footprint, col + 1, row - 1);
        const miterRight =
          !isCellOccupied(footprint, col, row + 1) &&
          !isCellOccupied(footprint, col + 1, row + 1);
        const invertMiter = true;
        addWallWithOpening(
          geometries,
          CELL_SIZE,
          WALL_HEIGHT,
          WALL_THICKNESS,
          "z",
          center,
          baseY,
          opening || null,
          stats,
          miterLeft,
          miterRight,
          invertMiter,
        );
      }

      const downOccupied = isCellOccupied(footprint, col, row + 1);
      if (downOccupied) {
        const neighborId = cellId(col, row + 1, width);
        if (roomMap[row + 1][col] !== roomMap[row][col]) {
          const opening = floorPlan.internalOpenings.get(
            edgeKey(id, neighborId),
          );
          const center = {
            x: -halfWidth + col * CELL_SIZE + CELL_SIZE / 2,
            z: -halfDepth + (row + 1) * CELL_SIZE,
          };
          addWallWithOpening(
            geometries,
            CELL_SIZE,
            WALL_HEIGHT,
            WALL_THICKNESS,
            "x",
            center,
            baseY,
            opening || null,
            stats,
          );
        }
      } else {
        const center = {
          x: -halfWidth + col * CELL_SIZE + CELL_SIZE / 2,
          z: -halfDepth + (row + 1) * CELL_SIZE,
        };
        const opening = floorPlan.externalOpenings.get(`${id}:south`);
        const miterLeft =
          !isCellOccupied(footprint, col - 1, row) &&
          !isCellOccupied(footprint, col - 1, row + 1);
        const miterRight =
          !isCellOccupied(footprint, col + 1, row) &&
          !isCellOccupied(footprint, col + 1, row + 1);
        const invertMiter = true;
        addWallWithOpening(
          geometries,
          CELL_SIZE,
          WALL_HEIGHT,
          WALL_THICKNESS,
          "x",
          center,
          baseY,
          opening || null,
          stats,
          miterLeft,
          miterRight,
          invertMiter,
        );
      }

      if (!isCellOccupied(footprint, col - 1, row)) {
        const center = {
          x: -halfWidth + col * CELL_SIZE,
          z: -halfDepth + row * CELL_SIZE + CELL_SIZE / 2,
        };
        const opening = floorPlan.externalOpenings.get(`${id}:west`);
        const miterLeft =
          !isCellOccupied(footprint, col, row - 1) &&
          !isCellOccupied(footprint, col - 1, row - 1);
        const miterRight =
          !isCellOccupied(footprint, col, row + 1) &&
          !isCellOccupied(footprint, col - 1, row + 1);
        const invertMiter = false;
        addWallWithOpening(
          geometries,
          CELL_SIZE,
          WALL_HEIGHT,
          WALL_THICKNESS,
          "z",
          center,
          baseY,
          opening || null,
          stats,
          miterLeft,
          miterRight,
          invertMiter,
        );
      }

      if (!isCellOccupied(footprint, col, row - 1)) {
        const center = {
          x: -halfWidth + col * CELL_SIZE + CELL_SIZE / 2,
          z: -halfDepth + row * CELL_SIZE,
        };
        const opening = floorPlan.externalOpenings.get(`${id}:north`);
        const miterLeft =
          !isCellOccupied(footprint, col - 1, row) &&
          !isCellOccupied(footprint, col - 1, row - 1);
        const miterRight =
          !isCellOccupied(footprint, col + 1, row) &&
          !isCellOccupied(footprint, col + 1, row - 1);
        const invertMiter = false;
        addWallWithOpening(
          geometries,
          CELL_SIZE,
          WALL_HEIGHT,
          WALL_THICKNESS,
          "x",
          center,
          baseY,
          opening || null,
          stats,
          miterLeft,
          miterRight,
          invertMiter,
        );
      }
    }
  }
}

function addStairs(
  geometries: THREE.BufferGeometry[],
  layout: BuildingLayout,
  stats: BuildingStats,
): void {
  if (!layout.stairs) return;
  const { width, depth } = layout;
  const { col, row, direction } = layout.stairs;
  const anchorCenter = getCellCenter(col, row, width, depth);
  const center = { x: anchorCenter.x, z: anchorCenter.z };

  const stepCount = Math.max(6, Math.round(FLOOR_HEIGHT / 0.3));
  const stepHeight = FLOOR_HEIGHT / stepCount;
  const runLength = CELL_SIZE;
  const stepDepth = runLength / stepCount;
  const stepWidth = CELL_SIZE * 0.5;

  const directionAngles: Record<string, number> = {
    "z+": 0,
    "z-": Math.PI,
    "x+": -Math.PI / 2,
    "x-": Math.PI / 2,
  };
  const rotationY = directionAngles[direction] || 0;

  for (let i = 0; i < stepCount; i += 1) {
    const geometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
    geometry.translate(
      0,
      stepHeight * (i + 0.5),
      stepDepth * (i + 0.5) - runLength / 2,
    );
    geometry.rotateY(rotationY);
    geometry.translate(center.x, FLOOR_THICKNESS, center.z);
    applyVertexColors(geometry, palette.stairs, 0.18, 0.1, 0.88);
    geometries.push(geometry);
  }

  stats.stairSteps += stepCount;
}

function addRoofPieces(
  geometries: THREE.BufferGeometry[],
  layout: BuildingLayout,
  stats: BuildingStats,
): void {
  const { width, depth, floors, floorPlans } = layout;
  const topLevels: number[][] = [];

  for (let row = 0; row < depth; row += 1) {
    const rowLevels: number[] = [];
    for (let col = 0; col < width; col += 1) {
      let topFloorIndex = -1;
      for (let floor = floors - 1; floor >= 0; floor -= 1) {
        const footprint = floorPlans[floor].footprint;
        if (isCellOccupied(footprint, col, row)) {
          topFloorIndex = floor;
          break;
        }
      }
      rowLevels.push(topFloorIndex);
    }
    topLevels.push(rowLevels);
  }

  const skirtSize = WALL_THICKNESS / 2;
  const nsGeometry = new THREE.BoxGeometry(
    CELL_SIZE,
    ROOF_THICKNESS,
    skirtSize,
  );
  const ewGeometry = new THREE.BoxGeometry(
    skirtSize,
    ROOF_THICKNESS,
    CELL_SIZE,
  );

  for (let row = 0; row < depth; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const topFloorIndex = topLevels[row][col];
      if (topFloorIndex < 0) continue;
      const center = getCellCenter(col, row, width, depth);
      const roofY = (topFloorIndex + 1) * FLOOR_HEIGHT + ROOF_THICKNESS / 2;
      const geometry = new THREE.BoxGeometry(
        CELL_SIZE,
        ROOF_THICKNESS,
        CELL_SIZE,
      );
      const isPatio = floors > 1 && topFloorIndex < floors - 1;

      geometry.translate(center.x, roofY, center.z);
      const color = isPatio ? palette.patio : palette.roof;
      if (isPatio) {
        applyVertexColors(geometry, color, 0.12, 0.05, 0.92);
      } else {
        applyVertexColors(geometry, color, 0.55, 0.45, 0.75);
      }
      geometries.push(geometry);
      stats.roofPieces += 1;

      const northLevel = row > 0 ? topLevels[row - 1][col] : -1;
      const southLevel = row < depth - 1 ? topLevels[row + 1][col] : -1;
      const westLevel = col > 0 ? topLevels[row][col - 1] : -1;
      const eastLevel = col < width - 1 ? topLevels[row][col + 1] : -1;

      if (northLevel !== topFloorIndex) {
        const skirt = nsGeometry.clone();
        skirt.translate(
          center.x,
          roofY,
          center.z - CELL_SIZE / 2 - skirtSize / 2,
        );
        if (isPatio) {
          applyVertexColors(skirt, color, 0.12, 0.05, 0.92);
        } else {
          applyVertexColors(skirt, color, 0.55, 0.45, 0.75);
        }
        geometries.push(skirt);
      }
      if (southLevel !== topFloorIndex) {
        const skirt = nsGeometry.clone();
        skirt.translate(
          center.x,
          roofY,
          center.z + CELL_SIZE / 2 + skirtSize / 2,
        );
        if (isPatio) {
          applyVertexColors(skirt, color, 0.12, 0.05, 0.92);
        } else {
          applyVertexColors(skirt, color, 0.55, 0.45, 0.75);
        }
        geometries.push(skirt);
      }
      if (westLevel !== topFloorIndex) {
        const skirt = ewGeometry.clone();
        skirt.translate(
          center.x - CELL_SIZE / 2 - skirtSize / 2,
          roofY,
          center.z,
        );
        if (isPatio) {
          applyVertexColors(skirt, color, 0.12, 0.05, 0.92);
        } else {
          applyVertexColors(skirt, color, 0.55, 0.45, 0.75);
        }
        geometries.push(skirt);
      }
      if (eastLevel !== topFloorIndex) {
        const skirt = ewGeometry.clone();
        skirt.translate(
          center.x + CELL_SIZE / 2 + skirtSize / 2,
          roofY,
          center.z,
        );
        if (isPatio) {
          applyVertexColors(skirt, color, 0.12, 0.05, 0.92);
        } else {
          applyVertexColors(skirt, color, 0.55, 0.45, 0.75);
        }
        geometries.push(skirt);
      }
    }
  }
}

function getMainRoom(rooms: Room[]): Room | null {
  if (!rooms || rooms.length === 0) return null;
  let best = rooms[0];
  for (const room of rooms) {
    if (room.area > best.area) best = room;
  }
  return best;
}

interface PropPlacement {
  cell: Cell;
  side: string;
}

interface PropPlacements {
  innBar?: PropPlacement | null;
  bankCounter?: PropPlacement | null;
}

function reserveInnBarPlacement(
  layout: BuildingLayout,
  recipe: BuildingRecipe,
  rng: RNG,
): PropPlacement | null {
  const floorPlan = layout.floorPlans[0];
  if (!floorPlan) return null;
  const rooms = floorPlan.rooms.slice().sort((a, b) => b.area - a.area);
  if (rooms.length === 0) return null;
  const footprint = floorPlan.footprint;
  const frontSide = recipe.frontSide || "south";
  const backSide = getOppositeSide(frontSide);
  const sideOrder = [backSide, frontSide, "east", "west", "north", "south"];
  const sides: string[] = [];
  for (const side of sideOrder) {
    if (!sides.includes(side)) sides.push(side);
  }

  let barCell: Cell | null = null;
  let barSide: string | null = null;
  for (const room of rooms) {
    for (const side of sides) {
      const candidate = pickRoomCellOnSolidSide(
        room,
        footprint,
        floorPlan.externalOpenings,
        layout.width,
        side,
        rng,
      );
      if (candidate) {
        barCell = candidate;
        barSide = side;
        break;
      }
    }
    if (barCell) break;
  }

  if (!barCell) {
    for (const room of rooms) {
      for (const side of sides) {
        const candidate = pickRoomCellOnSide(room, footprint, side, rng);
        if (candidate) {
          barCell = candidate;
          barSide = side;
          break;
        }
      }
      if (barCell) break;
    }
  }

  if (!barCell || !barSide) return null;
  const key = `${cellId(barCell.col, barCell.row, layout.width)}:${barSide}`;
  floorPlan.externalOpenings.delete(key);
  return { cell: barCell, side: barSide };
}

function reserveBankCounterPlacement(
  layout: BuildingLayout,
  recipe: BuildingRecipe,
  rng: RNG,
): PropPlacement | null {
  const floorPlan = layout.floorPlans[0];
  if (!floorPlan) return null;
  const rooms = floorPlan.rooms.slice().sort((a, b) => b.area - a.area);
  if (rooms.length === 0) return null;
  const footprint = floorPlan.footprint;
  const frontSide = recipe.frontSide || "south";
  const backSide = getOppositeSide(frontSide);
  const sideOrder = [frontSide, backSide, "east", "west", "north", "south"];
  const sides: string[] = [];
  for (const side of sideOrder) {
    if (!sides.includes(side)) sides.push(side);
  }

  let counterCell: Cell | null = null;
  let counterSide: string | null = null;
  for (const room of rooms) {
    for (const side of sides) {
      const candidate = pickRoomCellOnSolidSide(
        room,
        footprint,
        floorPlan.externalOpenings,
        layout.width,
        side,
        rng,
      );
      if (candidate) {
        counterCell = candidate;
        counterSide = side;
        break;
      }
    }
    if (counterCell) break;
  }

  if (!counterCell) {
    for (const room of rooms) {
      for (const side of sides) {
        const candidate = pickRoomCellOnSide(room, footprint, side, rng);
        if (candidate) {
          counterCell = candidate;
          counterSide = side;
          break;
        }
      }
      if (counterCell) break;
    }
  }

  if (!counterCell || !counterSide) return null;
  const key = `${cellId(counterCell.col, counterCell.row, layout.width)}:${counterSide}`;
  floorPlan.externalOpenings.delete(key);
  return { cell: counterCell, side: counterSide };
}

function addCounterWithNpc(
  geometries: THREE.BufferGeometry[],
  layout: BuildingLayout,
  floorIndex: number,
  cell: Cell | null,
  side: string,
  counterColor: THREE.Color,
  npcColor: THREE.Color,
  stats: BuildingStats,
  options: { npcSide?: string; npcGap?: number; counterOffset?: number },
): {
  counterPos: { x: number; z: number };
  npcPos: { x: number; z: number };
} | null {
  if (!cell) return null;
  const placement = options || {};
  const npcSide = placement.npcSide || "interior";
  const npcGap = typeof placement.npcGap === "number" ? placement.npcGap : 0.2;
  const defaultOffset =
    CELL_SIZE / 2 - COUNTER_DEPTH / 2 - WALL_THICKNESS * 0.3;
  let counterOffset =
    typeof placement.counterOffset === "number"
      ? placement.counterOffset
      : defaultOffset;
  let npcDistance = COUNTER_DEPTH / 2 + NPC_WIDTH / 2 + npcGap;
  const center = getCellCenter(cell.col, cell.row, layout.width, layout.depth);
  const normal = getSideVector(side);
  const interior = getSideVector(getOppositeSide(side));
  if (npcSide === "wall") {
    const wallPlacement = getWallNpcPlacement(npcGap);
    counterOffset = wallPlacement.counterOffset;
    npcDistance = wallPlacement.npcDistance;
  }
  const counterPos = {
    x: center.x + normal.x * counterOffset,
    z: center.z + normal.z * counterOffset,
  };
  const floorY = floorIndex * FLOOR_HEIGHT + FLOOR_THICKNESS;
  const counterGeometry = new THREE.BoxGeometry(
    side === "north" || side === "south" ? COUNTER_LENGTH : COUNTER_DEPTH,
    COUNTER_HEIGHT,
    side === "north" || side === "south" ? COUNTER_DEPTH : COUNTER_LENGTH,
  );
  counterGeometry.translate(
    counterPos.x,
    floorY + COUNTER_HEIGHT / 2,
    counterPos.z,
  );
  applyVertexColors(counterGeometry, counterColor, 0.22, 0.12, 0.86);
  geometries.push(counterGeometry);
  stats.props += 1;

  const npcDirection = npcSide === "wall" ? normal : interior;
  const npcPos = {
    x: counterPos.x + npcDirection.x * npcDistance,
    z: counterPos.z + npcDirection.z * npcDistance,
  };
  const npcGeometry = new THREE.BoxGeometry(NPC_WIDTH, NPC_HEIGHT, NPC_WIDTH);
  npcGeometry.translate(npcPos.x, floorY + NPC_HEIGHT / 2, npcPos.z);
  applyVertexColors(npcGeometry, npcColor, 0, 0, 1);
  geometries.push(npcGeometry);
  stats.props += 1;

  return { counterPos, npcPos };
}

function addForgeProps(
  geometries: THREE.BufferGeometry[],
  layout: BuildingLayout,
  floorIndex: number,
  room: Room,
  footprint: boolean[][],
  frontSide: string,
  rng: RNG,
  stats: BuildingStats,
): void {
  const backSide = getOppositeSide(frontSide);
  const furnaceCell =
    pickRoomCellOnSide(room, footprint, backSide, rng) ||
    pickClosestRoomCell(room, getRoomCenter(room), rng, null);
  if (!furnaceCell) return;
  const furnaceCenter = getCellCenter(
    furnaceCell.col,
    furnaceCell.row,
    layout.width,
    layout.depth,
  );
  const furnaceNormal = getSideVector(backSide);
  const furnaceOffset = CELL_SIZE / 2 - FORGE_SIZE / 2 - WALL_THICKNESS * 0.3;
  const floorY = floorIndex * FLOOR_HEIGHT + FLOOR_THICKNESS;
  const furnaceGeometry = new THREE.BoxGeometry(
    FORGE_SIZE,
    FORGE_SIZE,
    FORGE_SIZE,
  );
  furnaceGeometry.translate(
    furnaceCenter.x + furnaceNormal.x * furnaceOffset,
    floorY + FORGE_SIZE / 2,
    furnaceCenter.z + furnaceNormal.z * furnaceOffset,
  );
  applyVertexColors(furnaceGeometry, palette.forge, 0.2, 0.12, 0.86);
  geometries.push(furnaceGeometry);
  stats.props += 1;

  const anvilCell = pickClosestRoomCell(
    room,
    getRoomCenter(room),
    rng,
    furnaceCell,
  );
  if (!anvilCell) return;
  const anvilCenter = getCellCenter(
    anvilCell.col,
    anvilCell.row,
    layout.width,
    layout.depth,
  );
  const anvilGeometry = new THREE.BoxGeometry(
    ANVIL_SIZE,
    ANVIL_SIZE * 0.6,
    ANVIL_SIZE,
  );
  anvilGeometry.translate(
    anvilCenter.x,
    floorY + (ANVIL_SIZE * 0.6) / 2,
    anvilCenter.z,
  );
  applyVertexColors(anvilGeometry, palette.anvil, 0.18, 0.1, 0.9);
  geometries.push(anvilGeometry);
  stats.props += 1;
}

function addBuildingProps(
  geometries: THREE.BufferGeometry[],
  layout: BuildingLayout,
  recipe: BuildingRecipe,
  typeKey: string,
  rng: RNG,
  stats: BuildingStats,
  propPlacements: PropPlacements,
): void {
  const floorPlan = layout.floorPlans[0];
  if (!floorPlan) return;
  const room = getMainRoom(floorPlan.rooms);
  if (!room) return;
  const footprint = floorPlan.footprint;
  const frontSide = recipe.frontSide || "south";

  if (typeKey === "bank") {
    const placement = propPlacements ? propPlacements.bankCounter : null;
    let counterCell: Cell | null = null;
    let counterSide = frontSide;
    if (placement) {
      counterCell = placement.cell;
      counterSide = placement.side;
    } else {
      counterCell =
        pickRoomCellOnSolidSide(
          room,
          footprint,
          floorPlan.externalOpenings,
          layout.width,
          frontSide,
          rng,
        ) ||
        pickRoomCellOnSide(room, footprint, frontSide, rng) ||
        pickClosestRoomCell(room, getRoomCenter(room), rng, null);
    }
    const bankerGap = 0.12;
    addCounterWithNpc(
      geometries,
      layout,
      0,
      counterCell,
      counterSide,
      palette.counter,
      palette.banker,
      stats,
      {
        npcSide: "wall",
        npcGap: bankerGap,
      },
    );
    return;
  }

  if (typeKey === "inn") {
    const placement = propPlacements ? propPlacements.innBar : null;
    let barCell: Cell | null = null;
    let barSide = frontSide;
    if (placement) {
      barCell = placement.cell;
      barSide = placement.side;
    } else {
      barCell =
        pickRoomCellOnSolidSide(
          room,
          footprint,
          floorPlan.externalOpenings,
          layout.width,
          frontSide,
          rng,
        ) ||
        pickRoomCellOnSide(room, footprint, frontSide, rng) ||
        pickClosestRoomCell(room, getRoomCenter(room), rng, null);
    }
    const innkeeperGap = 0.12;
    addCounterWithNpc(
      geometries,
      layout,
      0,
      barCell,
      barSide,
      palette.bar,
      palette.innkeeper,
      stats,
      {
        npcSide: "wall",
        npcGap: innkeeperGap,
      },
    );
    return;
  }

  if (typeKey === "smithy") {
    addForgeProps(
      geometries,
      layout,
      0,
      room,
      footprint,
      frontSide,
      rng,
      stats,
    );
  }
}

function buildBuilding(
  layout: BuildingLayout,
  recipe: BuildingRecipe,
  typeKey: string,
  rng: RNG,
  includeRoof: boolean,
  uberMaterial: THREE.MeshStandardMaterial,
): { building: THREE.Mesh | THREE.Group; stats: BuildingStats } {
  const geometries: THREE.BufferGeometry[] = [];

  const stats: BuildingStats = {
    wallSegments: 0,
    doorways: 0,
    archways: 0,
    windows: 0,
    roofPieces: 0,
    floorTiles: 0,
    stairSteps: 0,
    props: 0,
    rooms: 0,
    footprintCells: 0,
    upperFootprintCells: 0,
  };

  const propPlacements: PropPlacements = {};
  if (typeKey === "inn") {
    propPlacements.innBar = reserveInnBarPlacement(layout, recipe, rng);
  }
  if (typeKey === "bank") {
    propPlacements.bankCounter = reserveBankCounterPlacement(
      layout,
      recipe,
      rng,
    );
  }

  for (let floor = 0; floor < layout.floors; floor += 1) {
    addFloorTiles(geometries, layout, floor, stats);
    addFloorEdgeSkirts(geometries, layout, floor);
    addWallsForFloor(
      geometries,
      layout,
      layout.floorPlans[floor],
      floor,
      stats,
    );
  }

  addStairs(geometries, layout, stats);
  if (includeRoof) {
    addRoofPieces(geometries, layout, stats);
  }
  addBuildingProps(
    geometries,
    layout,
    recipe,
    typeKey,
    rng,
    stats,
    propPlacements,
  );

  stats.rooms = layout.floorPlans.reduce(
    (count, plan) => count + plan.rooms.length,
    0,
  );
  stats.footprintCells = countFootprintCells(layout.floorPlans[0].footprint);
  if (layout.floors > 1) {
    stats.upperFootprintCells = countFootprintCells(
      layout.floorPlans[layout.floors - 1].footprint,
    );
  }

  let mesh: THREE.Mesh | THREE.Group;
  if (geometries.length > 0) {
    const mergedGeometry = mergeGeometries(geometries, false);
    const cleanedGeometry = removeInternalFaces(mergedGeometry);
    mergedGeometry.dispose();
    for (const geometry of geometries) {
      geometry.dispose();
    }
    mesh = new THREE.Mesh(cleanedGeometry, uberMaterial);
    mesh.userData = { layout, recipe, stats };
  } else {
    mesh = new THREE.Group();
  }

  return { building: mesh, stats };
}

// ============================================================
// REACT COMPONENT
// ============================================================

interface GeneratedBuilding {
  id: string;
  name: string;
  type: string;
  seed: string;
  stats: BuildingStats;
  mesh: THREE.Mesh | THREE.Group;
}

// World Configuration Types
interface TerrainConfig {
  tileSize: number;
  worldSize: number;
  tileResolution: number;
  maxHeight: number;
  waterThreshold: number;
  biomeScale: number;
}

interface TownConfig {
  townCount: number;
  minTownSpacing: number;
  flatnessRadius: number;
  townSizes: {
    hamlet: { minBuildings: number; maxBuildings: number; radius: number };
    village: { minBuildings: number; maxBuildings: number; radius: number };
    town: { minBuildings: number; maxBuildings: number; radius: number };
  };
  buildingTypes: string[];
}

interface RoadConfig {
  roadWidth: number;
  pathStepSize: number;
  extraConnectionsRatio: number;
  smoothingIterations: number;
}

interface WorldConfig {
  terrain: TerrainConfig;
  towns: TownConfig;
  roads: RoadConfig;
  seed: number;
}

const DEFAULT_WORLD_CONFIG: WorldConfig = {
  terrain: {
    tileSize: 100,
    worldSize: 100,
    tileResolution: 64,
    maxHeight: 30,
    waterThreshold: 5.4,
    biomeScale: 1.0,
  },
  towns: {
    townCount: 25,
    minTownSpacing: 800,
    flatnessRadius: 40,
    townSizes: {
      hamlet: { minBuildings: 3, maxBuildings: 5, radius: 25 },
      village: { minBuildings: 6, maxBuildings: 10, radius: 40 },
      town: { minBuildings: 11, maxBuildings: 16, radius: 60 },
    },
    buildingTypes: ["bank", "store", "smithy", "inn", "house", "well"],
  },
  roads: {
    roadWidth: 4,
    pathStepSize: 20,
    extraConnectionsRatio: 0.25,
    smoothingIterations: 2,
  },
  seed: 12345,
};

type WorldBuilderTab = "buildings" | "terrain" | "towns" | "roads";

export const WorldBuilderPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const currentBuildingRef = useRef<THREE.Mesh | THREE.Group | null>(null);
  const uberMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const animationIdRef = useRef<number>(0);

  const [buildingType, setBuildingType] = useState<string>("inn");
  const [seed, setSeed] = useState<string>("inn-001");
  const [showRoof, setShowRoof] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [stats, setStats] = useState<BuildingStats | null>(null);
  const [layout, setLayout] = useState<BuildingLayout | null>(null);
  const [collection, setCollection] = useState<GeneratedBuilding[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Tab and World Config State
  const [activeTab, setActiveTab] = useState<WorldBuilderTab>("buildings");
  const [worldConfig, setWorldConfig] =
    useState<WorldConfig>(DEFAULT_WORLD_CONFIG);
  const [configDirty, setConfigDirty] = useState<boolean>(false);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight,
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      55,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      200,
    );
    camera.position.set(14, 12, 14);
    cameraRef.current = camera;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 2, 0);
    controls.update();
    controlsRef.current = controls;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.95);
    sun.position.set(12, 18, 10);
    scene.add(sun);

    // Grid
    const grid = new THREE.GridHelper(90, 90, 0x2b3a4a, 0x1c242f);
    grid.position.y = 0;
    scene.add(grid);
    gridRef.current = grid;

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    // Uber material
    uberMaterialRef.current = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
    });

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationIdRef.current);
      renderer.dispose();
      if (
        containerRef.current &&
        renderer.domElement.parentNode === containerRef.current
      ) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Generate building
  const generateBuilding = useCallback(() => {
    if (!sceneRef.current || !uberMaterialRef.current) return;

    const recipe = BUILDING_RECIPES[buildingType];
    if (!recipe) return;

    const rng = createRng(`${buildingType}-${seed}`);
    const newLayout = generateLayout(recipe, rng);
    const { building, stats: newStats } = buildBuilding(
      newLayout,
      recipe,
      buildingType,
      rng,
      showRoof,
      uberMaterialRef.current,
    );

    // Remove old building
    if (currentBuildingRef.current) {
      sceneRef.current.remove(currentBuildingRef.current);
      if (currentBuildingRef.current instanceof THREE.Mesh) {
        currentBuildingRef.current.geometry.dispose();
      }
    }

    // Add new building
    currentBuildingRef.current = building;
    sceneRef.current.add(building);

    // Frame camera on building
    if (cameraRef.current && controlsRef.current) {
      const box = new THREE.Box3().setFromObject(building);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = Math.max(10, maxDim * 1.6);
      cameraRef.current.position.set(
        center.x + distance,
        center.y + distance * 0.7,
        center.z + distance,
      );
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }

    setStats(newStats);
    setLayout(newLayout);
  }, [buildingType, seed, showRoof]);

  // Initial generation
  useEffect(() => {
    generateBuilding();
  }, [generateBuilding]);

  // Toggle grid visibility
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
    }
  }, [showGrid]);

  const handleRandomSeed = () => {
    setSeed(Math.random().toString(36).slice(2, 8));
  };

  const handleAddToCollection = () => {
    if (!currentBuildingRef.current || !stats) return;

    const id = `${buildingType}-${seed}-${Date.now()}`;
    const newBuilding: GeneratedBuilding = {
      id,
      name: `${BUILDING_RECIPES[buildingType].label} (${seed})`,
      type: buildingType,
      seed,
      stats,
      mesh: currentBuildingRef.current.clone(),
    };
    setCollection((prev) => [...prev, newBuilding]);
    notify.success(`Added ${newBuilding.name} to collection`);
  };

  const handleExportGLB = async () => {
    if (!currentBuildingRef.current) return;

    setIsExporting(true);
    try {
      const exporter = new GLTFExporter();
      const gltf = await exporter.parseAsync(currentBuildingRef.current, {
        binary: true,
      });
      const blob = new Blob([gltf as ArrayBuffer], {
        type: "model/gltf-binary",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `building-${buildingType}-${seed}.glb`;
      link.click();
      URL.revokeObjectURL(url);
      notify.success("Building exported successfully");
    } catch (error) {
      console.error("Export failed:", error);
      notify.error("Failed to export building");
    } finally {
      setIsExporting(false);
    }
  };

  // World Config Helpers
  const updateTerrainConfig = (key: keyof TerrainConfig, value: number) => {
    setWorldConfig((prev) => ({
      ...prev,
      terrain: { ...prev.terrain, [key]: value },
    }));
    setConfigDirty(true);
  };

  const updateTownConfig = <K extends keyof TownConfig>(
    key: K,
    value: TownConfig[K],
  ) => {
    setWorldConfig((prev) => ({
      ...prev,
      towns: { ...prev.towns, [key]: value },
    }));
    setConfigDirty(true);
  };

  const updateRoadConfig = (key: keyof RoadConfig, value: number) => {
    setWorldConfig((prev) => ({
      ...prev,
      roads: { ...prev.roads, [key]: value },
    }));
    setConfigDirty(true);
  };

  const handleExportWorldConfig = () => {
    const configJson = JSON.stringify(worldConfig, null, 2);
    const blob = new Blob([configJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "world-config.json";
    link.click();
    URL.revokeObjectURL(url);
    notify.success("World config exported");
    setConfigDirty(false);
  };

  const handleImportWorldConfig = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target?.result as string) as WorldConfig;
        setWorldConfig(config);
        notify.success("World config imported");
        setConfigDirty(false);
      } catch (error) {
        console.error("Import failed:", error);
        notify.error("Failed to import world config");
      }
    };
    reader.readAsText(file);
  };

  const handleResetConfig = () => {
    setWorldConfig(DEFAULT_WORLD_CONFIG);
    setConfigDirty(false);
    notify.info("Config reset to defaults");
  };

  // Tab button component
  const TabButton: React.FC<{
    tab: WorldBuilderTab;
    icon: React.ReactNode;
    label: string;
  }> = ({ tab, icon, label }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
        activeTab === tab
          ? "bg-primary text-white"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  // Number input helper
  const NumberInput: React.FC<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
  }> = ({ label, value, onChange, min, max, step = 1 }) => (
    <div className="flex items-center justify-between">
      <label className="text-xs text-text-secondary">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-20 px-2 py-1 bg-bg-primary border border-border-primary rounded text-text-primary text-xs text-right"
      />
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] bg-bg-primary">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-96 bg-bg-secondary border-r border-border-primary flex flex-col">
          {/* Tab Navigation */}
          <div className="p-2 border-b border-border-primary flex gap-1 flex-wrap">
            <TabButton
              tab="buildings"
              icon={<Building2 className="w-3 h-3" />}
              label="Buildings"
            />
            <TabButton
              tab="terrain"
              icon={<Mountain className="w-3 h-3" />}
              label="Terrain"
            />
            <TabButton
              tab="towns"
              icon={<MapPin className="w-3 h-3" />}
              label="Towns"
            />
            <TabButton
              tab="roads"
              icon={<Route className="w-3 h-3" />}
              label="Roads"
            />
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {/* Buildings Tab */}
              {activeTab === "buildings" && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">
                      Building Generator
                    </h2>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Building Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <select
                        value={buildingType}
                        onChange={(e) => setBuildingType(e.target.value)}
                        className="w-full px-3 py-2 bg-bg-primary border border-border-primary rounded-md text-text-primary text-sm"
                      >
                        {Object.entries(BUILDING_RECIPES).map(
                          ([key, recipe]) => (
                            <option key={key} value={key}>
                              {recipe.label}
                            </option>
                          ),
                        )}
                      </select>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Seed</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <input
                        type="text"
                        value={seed}
                        onChange={(e) => setSeed(e.target.value)}
                        className="w-full px-3 py-2 bg-bg-primary border border-border-primary rounded-md text-text-primary text-sm"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleRandomSeed}
                        className="w-full"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Randomize
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Options</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showRoof}
                          onChange={(e) => setShowRoof(e.target.checked)}
                          className="w-4 h-4"
                        />
                        {showRoof ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                        Show Roof
                      </label>
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showGrid}
                          onChange={(e) => setShowGrid(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <Grid3x3 className="w-4 h-4" />
                        Show Grid
                      </label>
                    </CardContent>
                  </Card>

                  <Button onClick={generateBuilding} className="w-full">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generate Building
                  </Button>

                  {stats && layout && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Statistics</CardTitle>
                      </CardHeader>
                      <CardContent className="text-xs text-text-secondary space-y-1">
                        <p>
                          Grid: {layout.width} x {layout.depth} cells
                        </p>
                        <p>Floors: {layout.floors}</p>
                        <p>Rooms: {stats.rooms}</p>
                        <p>Walls: {stats.wallSegments}</p>
                        <p>Doorways: {stats.doorways}</p>
                        <p>Archways: {stats.archways}</p>
                        <p>Windows: {stats.windows}</p>
                        <p>Props: {stats.props}</p>
                        <p>Floor Tiles: {stats.floorTiles}</p>
                        <p>Roof Pieces: {stats.roofPieces}</p>
                        {stats.stairSteps > 0 && (
                          <p>Stair Steps: {stats.stairSteps}</p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <div className="space-y-2">
                    <Button
                      onClick={handleAddToCollection}
                      variant="secondary"
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add to Collection
                    </Button>
                    <Button
                      onClick={handleExportGLB}
                      variant="secondary"
                      className="w-full"
                      disabled={isExporting}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {isExporting ? "Exporting..." : "Export GLB"}
                    </Button>
                  </div>

                  {collection.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">
                          Collection ({collection.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 max-h-40 overflow-y-auto">
                        {collection.map((building) => (
                          <div
                            key={building.id}
                            className="text-xs text-text-secondary p-2 bg-bg-primary rounded border border-border-primary"
                          >
                            {building.name}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {/* Terrain Tab */}
              {activeTab === "terrain" && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <Mountain className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">
                      Terrain Config
                    </h2>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">World Size</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <NumberInput
                        label="Tile Size (m)"
                        value={worldConfig.terrain.tileSize}
                        onChange={(v) => updateTerrainConfig("tileSize", v)}
                        min={50}
                        max={200}
                      />
                      <NumberInput
                        label="World Size (tiles)"
                        value={worldConfig.terrain.worldSize}
                        onChange={(v) => updateTerrainConfig("worldSize", v)}
                        min={10}
                        max={200}
                      />
                      <NumberInput
                        label="Tile Resolution"
                        value={worldConfig.terrain.tileResolution}
                        onChange={(v) =>
                          updateTerrainConfig("tileResolution", v)
                        }
                        min={16}
                        max={128}
                      />
                      <div className="text-xs text-text-muted pt-2 border-t border-border-primary">
                        Total World:{" "}
                        {(worldConfig.terrain.tileSize *
                          worldConfig.terrain.worldSize) /
                          1000}
                        km x{" "}
                        {(worldConfig.terrain.tileSize *
                          worldConfig.terrain.worldSize) /
                          1000}
                        km
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Height & Water</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <NumberInput
                        label="Max Height (m)"
                        value={worldConfig.terrain.maxHeight}
                        onChange={(v) => updateTerrainConfig("maxHeight", v)}
                        min={10}
                        max={100}
                      />
                      <NumberInput
                        label="Water Threshold (m)"
                        value={worldConfig.terrain.waterThreshold}
                        onChange={(v) =>
                          updateTerrainConfig("waterThreshold", v)
                        }
                        min={0}
                        max={worldConfig.terrain.maxHeight}
                        step={0.1}
                      />
                      <NumberInput
                        label="Biome Scale"
                        value={worldConfig.terrain.biomeScale}
                        onChange={(v) => updateTerrainConfig("biomeScale", v)}
                        min={0.1}
                        max={5.0}
                        step={0.1}
                      />
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Towns Tab */}
              {activeTab === "towns" && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">
                      Town Config
                    </h2>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Town Generation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <NumberInput
                        label="Town Count"
                        value={worldConfig.towns.townCount}
                        onChange={(v) => updateTownConfig("townCount", v)}
                        min={5}
                        max={100}
                      />
                      <NumberInput
                        label="Min Spacing (m)"
                        value={worldConfig.towns.minTownSpacing}
                        onChange={(v) => updateTownConfig("minTownSpacing", v)}
                        min={200}
                        max={2000}
                      />
                      <NumberInput
                        label="Flatness Sample Radius"
                        value={worldConfig.towns.flatnessRadius}
                        onChange={(v) => updateTownConfig("flatnessRadius", v)}
                        min={10}
                        max={100}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Hamlet Size</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <NumberInput
                        label="Min Buildings"
                        value={worldConfig.towns.townSizes.hamlet.minBuildings}
                        onChange={(v) =>
                          updateTownConfig("townSizes", {
                            ...worldConfig.towns.townSizes,
                            hamlet: {
                              ...worldConfig.towns.townSizes.hamlet,
                              minBuildings: v,
                            },
                          })
                        }
                        min={1}
                        max={10}
                      />
                      <NumberInput
                        label="Max Buildings"
                        value={worldConfig.towns.townSizes.hamlet.maxBuildings}
                        onChange={(v) =>
                          updateTownConfig("townSizes", {
                            ...worldConfig.towns.townSizes,
                            hamlet: {
                              ...worldConfig.towns.townSizes.hamlet,
                              maxBuildings: v,
                            },
                          })
                        }
                        min={1}
                        max={20}
                      />
                      <NumberInput
                        label="Radius (m)"
                        value={worldConfig.towns.townSizes.hamlet.radius}
                        onChange={(v) =>
                          updateTownConfig("townSizes", {
                            ...worldConfig.towns.townSizes,
                            hamlet: {
                              ...worldConfig.towns.townSizes.hamlet,
                              radius: v,
                            },
                          })
                        }
                        min={10}
                        max={100}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Village Size</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <NumberInput
                        label="Min Buildings"
                        value={worldConfig.towns.townSizes.village.minBuildings}
                        onChange={(v) =>
                          updateTownConfig("townSizes", {
                            ...worldConfig.towns.townSizes,
                            village: {
                              ...worldConfig.towns.townSizes.village,
                              minBuildings: v,
                            },
                          })
                        }
                        min={1}
                        max={20}
                      />
                      <NumberInput
                        label="Max Buildings"
                        value={worldConfig.towns.townSizes.village.maxBuildings}
                        onChange={(v) =>
                          updateTownConfig("townSizes", {
                            ...worldConfig.towns.townSizes,
                            village: {
                              ...worldConfig.towns.townSizes.village,
                              maxBuildings: v,
                            },
                          })
                        }
                        min={1}
                        max={30}
                      />
                      <NumberInput
                        label="Radius (m)"
                        value={worldConfig.towns.townSizes.village.radius}
                        onChange={(v) =>
                          updateTownConfig("townSizes", {
                            ...worldConfig.towns.townSizes,
                            village: {
                              ...worldConfig.towns.townSizes.village,
                              radius: v,
                            },
                          })
                        }
                        min={20}
                        max={150}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Town Size</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <NumberInput
                        label="Min Buildings"
                        value={worldConfig.towns.townSizes.town.minBuildings}
                        onChange={(v) =>
                          updateTownConfig("townSizes", {
                            ...worldConfig.towns.townSizes,
                            town: {
                              ...worldConfig.towns.townSizes.town,
                              minBuildings: v,
                            },
                          })
                        }
                        min={5}
                        max={30}
                      />
                      <NumberInput
                        label="Max Buildings"
                        value={worldConfig.towns.townSizes.town.maxBuildings}
                        onChange={(v) =>
                          updateTownConfig("townSizes", {
                            ...worldConfig.towns.townSizes,
                            town: {
                              ...worldConfig.towns.townSizes.town,
                              maxBuildings: v,
                            },
                          })
                        }
                        min={5}
                        max={50}
                      />
                      <NumberInput
                        label="Radius (m)"
                        value={worldConfig.towns.townSizes.town.radius}
                        onChange={(v) =>
                          updateTownConfig("townSizes", {
                            ...worldConfig.towns.townSizes,
                            town: {
                              ...worldConfig.towns.townSizes.town,
                              radius: v,
                            },
                          })
                        }
                        min={30}
                        max={200}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Building Types</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {["bank", "store", "smithy", "inn", "house", "well"].map(
                        (type) => (
                          <label
                            key={type}
                            className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={worldConfig.towns.buildingTypes.includes(
                                type,
                              )}
                              onChange={(e) => {
                                const newTypes = e.target.checked
                                  ? [...worldConfig.towns.buildingTypes, type]
                                  : worldConfig.towns.buildingTypes.filter(
                                      (t) => t !== type,
                                    );
                                updateTownConfig("buildingTypes", newTypes);
                              }}
                              className="w-4 h-4"
                            />
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </label>
                        ),
                      )}
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Roads Tab */}
              {activeTab === "roads" && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <Route className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">
                      Road Config
                    </h2>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Road Generation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <NumberInput
                        label="Road Width (m)"
                        value={worldConfig.roads.roadWidth}
                        onChange={(v) => updateRoadConfig("roadWidth", v)}
                        min={2}
                        max={10}
                      />
                      <NumberInput
                        label="Path Step Size (m)"
                        value={worldConfig.roads.pathStepSize}
                        onChange={(v) => updateRoadConfig("pathStepSize", v)}
                        min={5}
                        max={50}
                      />
                      <NumberInput
                        label="Extra Connections Ratio"
                        value={worldConfig.roads.extraConnectionsRatio}
                        onChange={(v) =>
                          updateRoadConfig("extraConnectionsRatio", v)
                        }
                        min={0}
                        max={1}
                        step={0.05}
                      />
                      <NumberInput
                        label="Smoothing Iterations"
                        value={worldConfig.roads.smoothingIterations}
                        onChange={(v) =>
                          updateRoadConfig("smoothingIterations", v)
                        }
                        min={0}
                        max={5}
                      />
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Config Actions (shown on all tabs except buildings) */}
              {activeTab !== "buildings" && (
                <div className="space-y-2 pt-4 border-t border-border-primary">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-medium text-text-primary">
                      World Seed
                    </h3>
                  </div>
                  <input
                    type="number"
                    value={worldConfig.seed}
                    onChange={(e) => {
                      setWorldConfig((prev) => ({
                        ...prev,
                        seed: Number(e.target.value),
                      }));
                      setConfigDirty(true);
                    }}
                    className="w-full px-3 py-2 bg-bg-primary border border-border-primary rounded-md text-text-primary text-sm"
                  />

                  <div className="flex gap-2 mt-4">
                    <Button
                      onClick={handleExportWorldConfig}
                      variant="secondary"
                      className="flex-1"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Export
                    </Button>
                    <label className="flex-1">
                      <Button variant="secondary" className="w-full" as="span">
                        <Upload className="w-4 h-4 mr-1" />
                        Import
                      </Button>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportWorldConfig}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <Button
                    onClick={handleResetConfig}
                    variant="ghost"
                    className="w-full text-text-muted"
                  >
                    Reset to Defaults
                  </Button>

                  {configDirty && (
                    <div className="text-xs text-amber-500 text-center mt-2">
                      Config has unsaved changes
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3D Viewport */}
        <div ref={containerRef} className="flex-1 relative" />
      </div>
    </div>
  );
};

export default WorldBuilderPage;
