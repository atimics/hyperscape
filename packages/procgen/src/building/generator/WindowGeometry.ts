/**
 * Window Geometry Generation
 *
 * Creates window frames, panes, mullions, and shutters for procedural buildings.
 */

import * as THREE from "three";
import { applyVertexColors, mergeBufferGeometries } from "./geometry";
import { WINDOW_WIDTH, WINDOW_HEIGHT, WALL_THICKNESS } from "./constants";

// ============================================================================
// TYPES
// ============================================================================

export type WindowStyle =
  | "simple"
  | "crossbar-2x2"
  | "crossbar-2x3"
  | "crossbar-3x3"
  | "arched"
  | "shuttered"
  | "shuttered-open"
  | "leaded"
  | "slit";

export interface ShutterConfig {
  style: "solid" | "louvered" | "paneled";
  openAngle: number;
  thickness: number;
}

export interface WindowConfig {
  width: number;
  height: number;
  frameThickness: number;
  frameDepth: number;
  style: WindowStyle;
  shutterConfig?: ShutterConfig;
  isVertical: boolean;
}

export interface WindowGeometryResult {
  frame: THREE.BufferGeometry | null;
  panes: THREE.BufferGeometry[];
  mullions: THREE.BufferGeometry | null;
  shutters: THREE.BufferGeometry[];
  sill: THREE.BufferGeometry | null;
}

const DEFAULT_WINDOW_CONFIG: WindowConfig = {
  width: WINDOW_WIDTH,
  height: WINDOW_HEIGHT,
  frameThickness: 0.04,
  frameDepth: WALL_THICKNESS * 0.8,
  style: "simple",
  isVertical: false,
};

// Color palette
const palette = {
  frame: new THREE.Color(0x5c4033),
  frameDark: new THREE.Color(0x3c2a1e),
  glass: new THREE.Color(0x87ceeb),
  shutter: new THREE.Color(0x4a3728),
  sill: new THREE.Color(0x808080),
  lead: new THREE.Color(0x3c3c3c),
};

// ============================================================================
// GEOMETRY GENERATION
// ============================================================================

/**
 * Create a window frame (rectangular border)
 */
function createWindowFrame(
  width: number,
  height: number,
  thickness: number,
  depth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Frame dimensions
  const innerHeight = height - thickness * 2;

  // Top frame member
  const topGeo = new THREE.BoxGeometry(
    isVertical ? depth : width,
    thickness,
    isVertical ? width : depth,
  );
  topGeo.translate(0, height / 2 - thickness / 2, 0);
  applyVertexColors(topGeo, palette.frame);
  geometries.push(topGeo);

  // Bottom frame member
  const bottomGeo = new THREE.BoxGeometry(
    isVertical ? depth : width,
    thickness,
    isVertical ? width : depth,
  );
  bottomGeo.translate(0, -height / 2 + thickness / 2, 0);
  applyVertexColors(bottomGeo, palette.frame);
  geometries.push(bottomGeo);

  // Left frame member
  const leftGeo = new THREE.BoxGeometry(
    isVertical ? depth : thickness,
    innerHeight,
    isVertical ? thickness : depth,
  );
  if (isVertical) {
    leftGeo.translate(0, 0, -width / 2 + thickness / 2);
  } else {
    leftGeo.translate(-width / 2 + thickness / 2, 0, 0);
  }
  applyVertexColors(leftGeo, palette.frame);
  geometries.push(leftGeo);

  // Right frame member
  const rightGeo = new THREE.BoxGeometry(
    isVertical ? depth : thickness,
    innerHeight,
    isVertical ? thickness : depth,
  );
  if (isVertical) {
    rightGeo.translate(0, 0, width / 2 - thickness / 2);
  } else {
    rightGeo.translate(width / 2 - thickness / 2, 0, 0);
  }
  applyVertexColors(rightGeo, palette.frame);
  geometries.push(rightGeo);

  // Merge geometries
  const merged = mergeBufferGeometries(geometries);
  geometries.forEach((g) => g.dispose());

  return merged;
}

/**
 * Create a single glass pane
 */
function createGlassPane(
  width: number,
  height: number,
  depth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(
    isVertical ? depth : width,
    height,
    isVertical ? width : depth,
  );

  // Glass uses a lighter tint
  applyVertexColors(geometry, palette.glass, 0, 0, 1);

  return geometry;
}

/**
 * Create mullions (dividers) for crossbar windows
 */
function createMullions(
  width: number,
  height: number,
  thickness: number,
  depth: number,
  columns: number,
  rows: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  const innerWidth = width - thickness * 2;
  const innerHeight = height - thickness * 2;
  const mullionThickness = thickness * 0.6;

  // Vertical mullions
  if (columns > 1) {
    const spacing = innerWidth / columns;
    for (let i = 1; i < columns; i++) {
      const x = -innerWidth / 2 + spacing * i;
      const mullion = new THREE.BoxGeometry(
        isVertical ? depth : mullionThickness,
        innerHeight,
        isVertical ? mullionThickness : depth,
      );
      if (isVertical) {
        mullion.translate(0, 0, x);
      } else {
        mullion.translate(x, 0, 0);
      }
      applyVertexColors(mullion, palette.frameDark);
      geometries.push(mullion);
    }
  }

  // Horizontal mullions (muntins)
  if (rows > 1) {
    const spacing = innerHeight / rows;
    for (let i = 1; i < rows; i++) {
      const y = -innerHeight / 2 + spacing * i;
      const muntin = new THREE.BoxGeometry(
        isVertical ? depth : innerWidth,
        mullionThickness,
        isVertical ? innerWidth : depth,
      );
      muntin.translate(0, y, 0);
      applyVertexColors(muntin, palette.frameDark);
      geometries.push(muntin);
    }
  }

  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  const merged = mergeBufferGeometries(geometries);
  geometries.forEach((g) => g.dispose());

  return merged;
}

/**
 * Create divided glass panes for crossbar windows
 */
function createDividedPanes(
  width: number,
  height: number,
  frameThickness: number,
  depth: number,
  columns: number,
  rows: number,
  isVertical: boolean,
): THREE.BufferGeometry[] {
  const panes: THREE.BufferGeometry[] = [];

  const innerWidth = width - frameThickness * 2;
  const innerHeight = height - frameThickness * 2;
  const mullionThickness = frameThickness * 0.6;

  const paneWidth = (innerWidth - mullionThickness * (columns - 1)) / columns;
  const paneHeight = (innerHeight - mullionThickness * (rows - 1)) / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x =
        -innerWidth / 2 + paneWidth / 2 + col * (paneWidth + mullionThickness);
      const y =
        -innerHeight / 2 +
        paneHeight / 2 +
        row * (paneHeight + mullionThickness);

      const pane = createGlassPane(
        paneWidth,
        paneHeight,
        depth * 0.1,
        isVertical,
      );
      if (isVertical) {
        pane.translate(0, y, x);
      } else {
        pane.translate(x, y, 0);
      }
      panes.push(pane);
    }
  }

  return panes;
}

/**
 * Create a window shutter
 */
function createShutter(
  width: number,
  height: number,
  config: ShutterConfig,
  isLeft: boolean,
  isVertical: boolean,
): THREE.BufferGeometry {
  const shutterWidth = width / 2 - 0.01; // Slightly smaller to fit
  const geometries: THREE.BufferGeometry[] = [];

  if (config.style === "solid") {
    // Solid panel shutter
    const panel = new THREE.BoxGeometry(
      isVertical ? config.thickness : shutterWidth,
      height,
      isVertical ? shutterWidth : config.thickness,
    );
    applyVertexColors(panel, palette.shutter);
    geometries.push(panel);
  } else if (config.style === "louvered") {
    // Louvered shutter with horizontal slats
    const slats = 8;
    const slatHeight = height / (slats * 2);
    const slatSpacing = height / slats;

    // Frame
    const frameThick = 0.02;

    // Vertical sides
    const leftSide = new THREE.BoxGeometry(
      isVertical ? config.thickness : frameThick,
      height,
      isVertical ? frameThick : config.thickness,
    );
    if (isVertical) {
      leftSide.translate(0, 0, -shutterWidth / 2 + frameThick / 2);
    } else {
      leftSide.translate(-shutterWidth / 2 + frameThick / 2, 0, 0);
    }
    applyVertexColors(leftSide, palette.shutter);
    geometries.push(leftSide);

    const rightSide = new THREE.BoxGeometry(
      isVertical ? config.thickness : frameThick,
      height,
      isVertical ? frameThick : config.thickness,
    );
    if (isVertical) {
      rightSide.translate(0, 0, shutterWidth / 2 - frameThick / 2);
    } else {
      rightSide.translate(shutterWidth / 2 - frameThick / 2, 0, 0);
    }
    applyVertexColors(rightSide, palette.shutter);
    geometries.push(rightSide);

    // Horizontal slats
    for (let i = 0; i < slats; i++) {
      const y = -height / 2 + slatSpacing * (i + 0.5);
      const slat = new THREE.BoxGeometry(
        isVertical ? config.thickness : shutterWidth - frameThick * 2,
        slatHeight,
        isVertical ? shutterWidth - frameThick * 2 : config.thickness,
      );
      slat.translate(0, y, 0);
      applyVertexColors(slat, palette.shutter);
      geometries.push(slat);
    }
  } else {
    // Paneled shutter (default)
    const panel = new THREE.BoxGeometry(
      isVertical ? config.thickness : shutterWidth,
      height,
      isVertical ? shutterWidth : config.thickness,
    );
    applyVertexColors(panel, palette.shutter);
    geometries.push(panel);

    // Add raised panel detail
    const inset = 0.03;
    const raisedPanel = new THREE.BoxGeometry(
      isVertical ? config.thickness + 0.005 : shutterWidth - inset * 2,
      height - inset * 2,
      isVertical ? shutterWidth - inset * 2 : config.thickness + 0.005,
    );
    applyVertexColors(raisedPanel, palette.shutter, 0.3, 0.2, 0.85);
    geometries.push(raisedPanel);
  }

  const merged = mergeBufferGeometries(geometries);
  geometries.forEach((g) => g.dispose());

  // Position shutter at hinge point
  const hingeOffset = (isLeft ? -1 : 1) * (width / 2);

  if (config.openAngle > 0) {
    // Open shutter - rotate around hinge
    // Note: Rotation would need to be applied via matrix transform
    // For now, position the shutter at an angle
    const openOffset = Math.sin(config.openAngle) * shutterWidth;
    const depthOffset = (Math.cos(config.openAngle) * shutterWidth) / 2;

    if (isVertical) {
      merged.translate(
        (isLeft ? 1 : -1) * depthOffset,
        0,
        hingeOffset + (isLeft ? 1 : -1) * (shutterWidth / 2 - openOffset / 2),
      );
    } else {
      merged.translate(
        hingeOffset + (isLeft ? 1 : -1) * (shutterWidth / 2 - openOffset / 2),
        0,
        (isLeft ? -1 : 1) * depthOffset,
      );
    }
  } else {
    // Closed shutter
    if (isVertical) {
      merged.translate(
        0,
        0,
        hingeOffset + ((isLeft ? 1 : -1) * shutterWidth) / 2,
      );
    } else {
      merged.translate(
        hingeOffset + ((isLeft ? 1 : -1) * shutterWidth) / 2,
        0,
        0,
      );
    }
  }

  return merged;
}

/**
 * Create a window sill
 */
function createWindowSill(
  width: number,
  thickness: number,
  depth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const sillWidth = width + thickness * 2;
  const sillDepth = depth * 1.5;
  const sillHeight = thickness * 0.8;

  const geometry = new THREE.BoxGeometry(
    isVertical ? sillDepth : sillWidth,
    sillHeight,
    isVertical ? sillWidth : sillDepth,
  );

  // Position sill at bottom of window, protruding outward
  if (isVertical) {
    geometry.translate(sillDepth / 2 - depth / 2, -sillHeight / 2, 0);
  } else {
    geometry.translate(0, -sillHeight / 2, sillDepth / 2 - depth / 2);
  }

  applyVertexColors(geometry, palette.sill);

  return geometry;
}

/**
 * Create leaded glass pattern (diamond pattern)
 */
function createLeadedGlass(
  width: number,
  height: number,
  frameThickness: number,
  depth: number,
  isVertical: boolean,
): { panes: THREE.BufferGeometry[]; leads: THREE.BufferGeometry } {
  const innerWidth = width - frameThickness * 2;
  const innerHeight = height - frameThickness * 2;

  const panes: THREE.BufferGeometry[] = [];
  const leadGeometries: THREE.BufferGeometry[] = [];

  // Diamond size
  const diamondSize = 0.08;
  const leadThickness = 0.005;

  // Create diagonal lead lines
  const numDiagonals =
    Math.ceil(Math.max(innerWidth, innerHeight) / diamondSize) * 2;

  for (let i = -numDiagonals; i <= numDiagonals; i++) {
    // Positive slope diagonal
    const startX = -innerWidth / 2 + i * diamondSize;
    const lineLength = Math.sqrt(2) * Math.min(innerWidth, innerHeight);

    if (
      startX >= -innerWidth / 2 - diamondSize &&
      startX <= innerWidth / 2 + diamondSize
    ) {
      const lead1 = new THREE.BoxGeometry(
        isVertical ? depth * 0.1 : leadThickness,
        lineLength,
        isVertical ? leadThickness : depth * 0.1,
      );
      lead1.rotateZ(Math.PI / 4);
      if (isVertical) {
        lead1.translate(0, 0, startX);
      } else {
        lead1.translate(startX, 0, 0);
      }
      applyVertexColors(lead1, palette.lead);
      leadGeometries.push(lead1);

      // Negative slope diagonal
      const lead2 = new THREE.BoxGeometry(
        isVertical ? depth * 0.1 : leadThickness,
        lineLength,
        isVertical ? leadThickness : depth * 0.1,
      );
      lead2.rotateZ(-Math.PI / 4);
      if (isVertical) {
        lead2.translate(0, 0, startX);
      } else {
        lead2.translate(startX, 0, 0);
      }
      applyVertexColors(lead2, palette.lead);
      leadGeometries.push(lead2);
    }
  }

  // Single glass pane behind the leads
  const pane = createGlassPane(
    innerWidth,
    innerHeight,
    depth * 0.08,
    isVertical,
  );
  panes.push(pane);

  const leads = mergeBufferGeometries(leadGeometries);
  leadGeometries.forEach((g) => g.dispose());

  return { panes, leads };
}

/**
 * Create an arrow slit window (narrow vertical opening)
 */
function createArrowSlit(
  height: number,
  depth: number,
  isVertical: boolean,
): WindowGeometryResult {
  const slitWidth = 0.15;
  const frameThickness = 0.03;

  // Frame
  const frame = createWindowFrame(
    slitWidth,
    height,
    frameThickness,
    depth,
    isVertical,
  );

  return {
    frame,
    panes: [], // Arrow slits have no glass
    mullions: null,
    shutters: [],
    sill: null,
  };
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Create window geometry for a given style and configuration
 */
export function createWindowGeometry(
  config: Partial<WindowConfig> = {},
): WindowGeometryResult {
  const fullConfig: WindowConfig = { ...DEFAULT_WINDOW_CONFIG, ...config };
  const {
    width,
    height,
    frameThickness,
    frameDepth,
    style,
    isVertical,
    shutterConfig,
  } = fullConfig;

  // Handle special cases
  if (style === "slit") {
    return createArrowSlit(height, frameDepth, isVertical);
  }

  // Create frame
  const frame = createWindowFrame(
    width,
    height,
    frameThickness,
    frameDepth,
    isVertical,
  );

  // Create sill
  const sill = createWindowSill(width, frameThickness, frameDepth, isVertical);

  // Style-specific components
  let panes: THREE.BufferGeometry[] = [];
  let mullions: THREE.BufferGeometry | null = null;
  let shutters: THREE.BufferGeometry[] = [];

  switch (style) {
    case "simple":
      // Single pane
      panes = [
        createGlassPane(
          width - frameThickness * 2,
          height - frameThickness * 2,
          frameDepth * 0.1,
          isVertical,
        ),
      ];
      break;

    case "crossbar-2x2":
      mullions = createMullions(
        width,
        height,
        frameThickness,
        frameDepth,
        2,
        2,
        isVertical,
      );
      panes = createDividedPanes(
        width,
        height,
        frameThickness,
        frameDepth,
        2,
        2,
        isVertical,
      );
      break;

    case "crossbar-2x3":
      mullions = createMullions(
        width,
        height,
        frameThickness,
        frameDepth,
        2,
        3,
        isVertical,
      );
      panes = createDividedPanes(
        width,
        height,
        frameThickness,
        frameDepth,
        2,
        3,
        isVertical,
      );
      break;

    case "crossbar-3x3":
      mullions = createMullions(
        width,
        height,
        frameThickness,
        frameDepth,
        3,
        3,
        isVertical,
      );
      panes = createDividedPanes(
        width,
        height,
        frameThickness,
        frameDepth,
        3,
        3,
        isVertical,
      );
      break;

    case "shuttered":
    case "shuttered-open": {
      // Single pane with shutters
      panes = [
        createGlassPane(
          width - frameThickness * 2,
          height - frameThickness * 2,
          frameDepth * 0.1,
          isVertical,
        ),
      ];

      const shutterConf: ShutterConfig = shutterConfig ?? {
        style: "louvered",
        openAngle: style === "shuttered-open" ? Math.PI / 3 : 0,
        thickness: 0.02,
      };

      shutters = [
        createShutter(width, height, shutterConf, true, isVertical),
        createShutter(width, height, shutterConf, false, isVertical),
      ];
      break;
    }

    case "leaded": {
      const leaded = createLeadedGlass(
        width,
        height,
        frameThickness,
        frameDepth,
        isVertical,
      );
      panes = leaded.panes;
      mullions = leaded.leads;
      break;
    }

    case "arched":
      // For arched windows, we'd need ExtrudeGeometry with an arch shape
      // For now, use simple style as fallback
      panes = [
        createGlassPane(
          width - frameThickness * 2,
          height - frameThickness * 2,
          frameDepth * 0.1,
          isVertical,
        ),
      ];
      break;

    default:
      panes = [
        createGlassPane(
          width - frameThickness * 2,
          height - frameThickness * 2,
          frameDepth * 0.1,
          isVertical,
        ),
      ];
  }

  return {
    frame,
    panes,
    mullions,
    shutters,
    sill,
  };
}

/** Get recommended window style for a building type */
export function getWindowStyleForBuildingType(
  buildingType: string,
): WindowStyle {
  const styleMap: Record<string, WindowStyle> = {
    // Religious - ornate leaded glass
    church: "leaded",
    cathedral: "leaded",
    // Fortified - defensive slits
    keep: "slit",
    fortress: "slit",
    barracks: "slit",
    // Wealthy/Official - large divided windows
    mansion: "crossbar-3x3",
    "guild-hall": "crossbar-3x3",
    // Commercial/Common - medium divided windows
    inn: "crossbar-2x3",
    tavern: "crossbar-2x3",
    bank: "crossbar-2x3",
    // Working buildings - shuttered
    store: "shuttered",
    shop: "shuttered",
    smithy: "shuttered",
    blacksmith: "shuttered",
    warehouse: "shuttered",
    stable: "shuttered",
    // Residential
    house: "crossbar-2x3",
    cottage: "shuttered",
    farmhouse: "shuttered",
    "long-house": "shuttered",
    "simple-house": "crossbar-2x3",
  };
  const style = styleMap[buildingType];
  if (!style) {
    // Default to crossbar-2x3 for unknown types instead of throwing
    console.warn(
      `[WindowGeometry] Unknown building type: ${buildingType}, using 'crossbar-2x3' style.`,
    );
    return "crossbar-2x3";
  }
  return style;
}
