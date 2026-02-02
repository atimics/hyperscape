/**
 * Door Trim Geometry Generation
 *
 * Creates door frames, thresholds, lintels, and architraves for procedural buildings.
 */

import * as THREE from "three";
import { applyVertexColors, mergeBufferGeometries } from "./geometry";
import {
  DOOR_WIDTH,
  DOOR_HEIGHT,
  WALL_THICKNESS,
  ARCH_WIDTH,
} from "./constants";

// ============================================================================
// TYPES
// ============================================================================

export type DoorFrameStyle =
  | "simple"
  | "with-lintel"
  | "architrave"
  | "rustic"
  | "arched"
  | "grand";

export interface DoorFrameConfig {
  width: number;
  height: number;
  frameWidth: number;
  frameDepth: number;
  style: DoorFrameStyle;
  isVertical: boolean;
  isArched: boolean;
  includeThreshold: boolean;
}

export interface DoorFrameGeometryResult {
  frame: THREE.BufferGeometry | null;
  threshold: THREE.BufferGeometry | null;
  lintel: THREE.BufferGeometry | null;
  architrave: THREE.BufferGeometry | null;
  archTrim: THREE.BufferGeometry | null;
}

const DEFAULT_DOOR_CONFIG: DoorFrameConfig = {
  width: DOOR_WIDTH,
  height: DOOR_HEIGHT,
  frameWidth: 0.08,
  frameDepth: WALL_THICKNESS * 0.6,
  style: "simple",
  isVertical: false,
  isArched: false,
  includeThreshold: true,
};

// Color palette
const palette = {
  frame: new THREE.Color(0x5c4033),
  frameDark: new THREE.Color(0x3c2a1e),
  threshold: new THREE.Color(0x696969),
  lintel: new THREE.Color(0x808080),
  architrave: new THREE.Color(0x6e5d52),
};

// ============================================================================
// GEOMETRY GENERATION
// ============================================================================

/**
 * Create door jambs (vertical side pieces)
 */
function createDoorJambs(
  width: number,
  height: number,
  frameWidth: number,
  frameDepth: number,
  isVertical: boolean,
): THREE.BufferGeometry[] {
  const jambs: THREE.BufferGeometry[] = [];

  // Left jamb
  const leftJamb = new THREE.BoxGeometry(
    isVertical ? frameDepth : frameWidth,
    height,
    isVertical ? frameWidth : frameDepth,
  );
  if (isVertical) {
    leftJamb.translate(0, height / 2, -width / 2 - frameWidth / 2);
  } else {
    leftJamb.translate(-width / 2 - frameWidth / 2, height / 2, 0);
  }
  applyVertexColors(leftJamb, palette.frame);
  jambs.push(leftJamb);

  // Right jamb
  const rightJamb = new THREE.BoxGeometry(
    isVertical ? frameDepth : frameWidth,
    height,
    isVertical ? frameWidth : frameDepth,
  );
  if (isVertical) {
    rightJamb.translate(0, height / 2, width / 2 + frameWidth / 2);
  } else {
    rightJamb.translate(width / 2 + frameWidth / 2, height / 2, 0);
  }
  applyVertexColors(rightJamb, palette.frame);
  jambs.push(rightJamb);

  return jambs;
}

/**
 * Create door header (horizontal top piece)
 */
function createDoorHeader(
  width: number,
  height: number,
  frameWidth: number,
  frameDepth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const totalWidth = width + frameWidth * 2;

  const header = new THREE.BoxGeometry(
    isVertical ? frameDepth : totalWidth,
    frameWidth,
    isVertical ? totalWidth : frameDepth,
  );
  header.translate(0, height + frameWidth / 2, 0);
  applyVertexColors(header, palette.frame);

  return header;
}

/**
 * Create door threshold
 */
function createDoorThreshold(
  width: number,
  frameWidth: number,
  frameDepth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const thresholdWidth = width + frameWidth;
  const thresholdDepth = frameDepth * 1.5;
  const thresholdHeight = frameWidth * 0.5;

  const threshold = new THREE.BoxGeometry(
    isVertical ? thresholdDepth : thresholdWidth,
    thresholdHeight,
    isVertical ? thresholdWidth : thresholdDepth,
  );

  // Position at floor level, slightly protruding
  if (isVertical) {
    threshold.translate(
      thresholdDepth / 2 - frameDepth / 2,
      thresholdHeight / 2,
      0,
    );
  } else {
    threshold.translate(
      0,
      thresholdHeight / 2,
      thresholdDepth / 2 - frameDepth / 2,
    );
  }
  applyVertexColors(threshold, palette.threshold);

  return threshold;
}

/**
 * Create protruding lintel (stone beam above door)
 */
function createProtrudingLintel(
  width: number,
  height: number,
  frameWidth: number,
  frameDepth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const lintelWidth = width + frameWidth * 4;
  const lintelDepth = frameDepth * 2;
  const lintelHeight = frameWidth * 2;

  const lintel = new THREE.BoxGeometry(
    isVertical ? lintelDepth : lintelWidth,
    lintelHeight,
    isVertical ? lintelWidth : lintelDepth,
  );

  // Position above door opening
  lintel.translate(0, height + lintelHeight / 2, 0);

  // Apply stone color
  applyVertexColors(lintel, palette.lintel);

  return lintel;
}

/**
 * Create decorative architrave (molded surround)
 */
function createArchitrave(
  width: number,
  height: number,
  frameWidth: number,
  frameDepth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  const architraveWidth = frameWidth * 1.5;
  const architraveDepth = frameDepth * 0.3;
  const totalWidth = width + frameWidth * 2 + architraveWidth * 2;

  // Outer frame layer
  // Left
  const leftArchitrave = new THREE.BoxGeometry(
    isVertical ? architraveDepth : architraveWidth,
    height + frameWidth + architraveWidth,
    isVertical ? architraveWidth : architraveDepth,
  );
  if (isVertical) {
    leftArchitrave.translate(
      frameDepth / 2 + architraveDepth / 2,
      (height + frameWidth + architraveWidth) / 2,
      -width / 2 - frameWidth - architraveWidth / 2,
    );
  } else {
    leftArchitrave.translate(
      -width / 2 - frameWidth - architraveWidth / 2,
      (height + frameWidth + architraveWidth) / 2,
      frameDepth / 2 + architraveDepth / 2,
    );
  }
  applyVertexColors(leftArchitrave, palette.architrave);
  geometries.push(leftArchitrave);

  // Right
  const rightArchitrave = new THREE.BoxGeometry(
    isVertical ? architraveDepth : architraveWidth,
    height + frameWidth + architraveWidth,
    isVertical ? architraveWidth : architraveDepth,
  );
  if (isVertical) {
    rightArchitrave.translate(
      frameDepth / 2 + architraveDepth / 2,
      (height + frameWidth + architraveWidth) / 2,
      width / 2 + frameWidth + architraveWidth / 2,
    );
  } else {
    rightArchitrave.translate(
      width / 2 + frameWidth + architraveWidth / 2,
      (height + frameWidth + architraveWidth) / 2,
      frameDepth / 2 + architraveDepth / 2,
    );
  }
  applyVertexColors(rightArchitrave, palette.architrave);
  geometries.push(rightArchitrave);

  // Top
  const topArchitrave = new THREE.BoxGeometry(
    isVertical ? architraveDepth : totalWidth,
    architraveWidth,
    isVertical ? totalWidth : architraveDepth,
  );
  if (isVertical) {
    topArchitrave.translate(
      frameDepth / 2 + architraveDepth / 2,
      height + frameWidth + architraveWidth / 2,
      0,
    );
  } else {
    topArchitrave.translate(
      0,
      height + frameWidth + architraveWidth / 2,
      frameDepth / 2 + architraveDepth / 2,
    );
  }
  applyVertexColors(topArchitrave, palette.architrave);
  geometries.push(topArchitrave);

  return mergeBufferGeometries(geometries);
}

/**
 * Create heavy timber frame (rustic style)
 */
function createRusticFrame(
  width: number,
  height: number,
  frameWidth: number,
  frameDepth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Thicker frame members for rustic look
  const rusticWidth = frameWidth * 2;
  const rusticDepth = frameDepth * 1.5;

  // Left post
  const leftPost = new THREE.BoxGeometry(
    isVertical ? rusticDepth : rusticWidth,
    height + rusticWidth,
    isVertical ? rusticWidth : rusticDepth,
  );
  if (isVertical) {
    leftPost.translate(
      0,
      (height + rusticWidth) / 2,
      -width / 2 - rusticWidth / 2,
    );
  } else {
    leftPost.translate(
      -width / 2 - rusticWidth / 2,
      (height + rusticWidth) / 2,
      0,
    );
  }
  applyVertexColors(leftPost, palette.frameDark);
  geometries.push(leftPost);

  // Right post
  const rightPost = new THREE.BoxGeometry(
    isVertical ? rusticDepth : rusticWidth,
    height + rusticWidth,
    isVertical ? rusticWidth : rusticDepth,
  );
  if (isVertical) {
    rightPost.translate(
      0,
      (height + rusticWidth) / 2,
      width / 2 + rusticWidth / 2,
    );
  } else {
    rightPost.translate(
      width / 2 + rusticWidth / 2,
      (height + rusticWidth) / 2,
      0,
    );
  }
  applyVertexColors(rightPost, palette.frameDark);
  geometries.push(rightPost);

  // Header beam
  const totalWidth = width + rusticWidth * 2;
  const headerBeam = new THREE.BoxGeometry(
    isVertical ? rusticDepth : totalWidth + rusticWidth,
    rusticWidth * 1.5,
    isVertical ? totalWidth + rusticWidth : rusticDepth,
  );
  headerBeam.translate(0, height + rusticWidth * 0.75, 0);
  applyVertexColors(headerBeam, palette.frameDark);
  geometries.push(headerBeam);

  return mergeBufferGeometries(geometries);
}

/**
 * Create arched door trim
 */
function createArchTrim(
  width: number,
  height: number,
  frameWidth: number,
  frameDepth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  // For arched doors, create a semicircular trim piece
  // Using extruded arch shape

  const archRadius = width / 2;
  const segments = 16;
  const geometries: THREE.BufferGeometry[] = [];

  // Create arch segments
  for (let i = 0; i < segments; i++) {
    const angle1 = Math.PI * (i / segments);
    const angle2 = Math.PI * ((i + 1) / segments);

    const x1 = Math.cos(angle1) * archRadius;
    const y1 = Math.sin(angle1) * archRadius;
    const x2 = Math.cos(angle2) * archRadius;
    const y2 = Math.sin(angle2) * archRadius;

    // Create box segment approximating the arch curve
    const segLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * 1.1;
    const midAngle = (angle1 + angle2) / 2;

    const segment = new THREE.BoxGeometry(
      isVertical ? frameDepth : frameWidth,
      segLength,
      isVertical ? frameWidth : frameDepth,
    );

    // Position at midpoint of segment
    const midX = Math.cos(midAngle) * (archRadius + frameWidth / 2);
    const midY = Math.sin(midAngle) * (archRadius + frameWidth / 2);

    // Rotate to follow arch curve
    segment.rotateX(isVertical ? 0 : 0);
    segment.rotateY(isVertical ? 0 : 0);
    segment.rotateZ(midAngle - Math.PI / 2);

    if (isVertical) {
      segment.translate(0, height + midY, midX);
    } else {
      segment.translate(midX, height + midY, 0);
    }

    applyVertexColors(segment, palette.frame);
    geometries.push(segment);
  }

  // Add vertical jambs that connect to the arch
  const jambHeight = height;
  const jambs = createDoorJambs(
    width,
    jambHeight,
    frameWidth,
    frameDepth,
    isVertical,
  );
  geometries.push(...jambs);

  return mergeBufferGeometries(geometries);
}

/**
 * Create grand entrance frame (large decorative)
 */
function createGrandFrame(
  width: number,
  height: number,
  frameWidth: number,
  frameDepth: number,
  isVertical: boolean,
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Base frame
  const baseFrame = createDoorJambs(
    width,
    height,
    frameWidth * 1.5,
    frameDepth,
    isVertical,
  );
  geometries.push(...baseFrame);

  // Header
  const header = createDoorHeader(
    width,
    height,
    frameWidth * 1.5,
    frameDepth,
    isVertical,
  );
  geometries.push(header);

  // Decorative capitals (top of jambs)
  const capitalSize = frameWidth * 2;
  const capitalDepth = frameDepth * 1.5;

  // Left capital
  const leftCapital = new THREE.BoxGeometry(
    isVertical ? capitalDepth : capitalSize,
    capitalSize,
    isVertical ? capitalSize : capitalDepth,
  );
  if (isVertical) {
    leftCapital.translate(
      0,
      height - capitalSize / 2,
      -width / 2 - (frameWidth * 1.5) / 2,
    );
  } else {
    leftCapital.translate(
      -width / 2 - (frameWidth * 1.5) / 2,
      height - capitalSize / 2,
      0,
    );
  }
  applyVertexColors(leftCapital, palette.lintel, 0.3, 0.2, 0.9);
  geometries.push(leftCapital);

  // Right capital
  const rightCapital = new THREE.BoxGeometry(
    isVertical ? capitalDepth : capitalSize,
    capitalSize,
    isVertical ? capitalSize : capitalDepth,
  );
  if (isVertical) {
    rightCapital.translate(
      0,
      height - capitalSize / 2,
      width / 2 + (frameWidth * 1.5) / 2,
    );
  } else {
    rightCapital.translate(
      width / 2 + (frameWidth * 1.5) / 2,
      height - capitalSize / 2,
      0,
    );
  }
  applyVertexColors(rightCapital, palette.lintel, 0.3, 0.2, 0.9);
  geometries.push(rightCapital);

  // Cornice (decorative top)
  const corniceWidth = width + frameWidth * 5;
  const corniceHeight = frameWidth * 1.5;
  const corniceDepth = frameDepth * 2;

  const cornice = new THREE.BoxGeometry(
    isVertical ? corniceDepth : corniceWidth,
    corniceHeight,
    isVertical ? corniceWidth : corniceDepth,
  );
  cornice.translate(0, height + frameWidth * 1.5 + corniceHeight / 2, 0);
  applyVertexColors(cornice, palette.lintel);
  geometries.push(cornice);

  return mergeBufferGeometries(geometries);
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Create door frame geometry for a given style and configuration
 */
export function createDoorFrameGeometry(
  config: Partial<DoorFrameConfig> = {},
): DoorFrameGeometryResult {
  const fullConfig: DoorFrameConfig = { ...DEFAULT_DOOR_CONFIG, ...config };
  const {
    width,
    height,
    frameWidth,
    frameDepth,
    style,
    isVertical,
    isArched,
    includeThreshold,
  } = fullConfig;

  const result: DoorFrameGeometryResult = {
    frame: null,
    threshold: null,
    lintel: null,
    architrave: null,
    archTrim: null,
  };

  // Handle arched doors specially
  if (isArched) {
    result.archTrim = createArchTrim(
      width,
      height,
      frameWidth,
      frameDepth,
      isVertical,
    );
    if (includeThreshold) {
      result.threshold = createDoorThreshold(
        width,
        frameWidth,
        frameDepth,
        isVertical,
      );
    }
    return result;
  }

  // Build frame based on style
  switch (style) {
    case "simple": {
      const jambs = createDoorJambs(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      const header = createDoorHeader(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      result.frame = mergeBufferGeometries([...jambs, header]);
      break;
    }

    case "with-lintel": {
      const jambs = createDoorJambs(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      const header = createDoorHeader(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      result.frame = mergeBufferGeometries([...jambs, header]);
      result.lintel = createProtrudingLintel(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      break;
    }

    case "architrave": {
      const jambs = createDoorJambs(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      const header = createDoorHeader(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      result.frame = mergeBufferGeometries([...jambs, header]);
      result.architrave = createArchitrave(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      break;
    }

    case "rustic": {
      result.frame = createRusticFrame(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      break;
    }

    case "grand": {
      result.frame = createGrandFrame(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      break;
    }

    default: {
      const jambs = createDoorJambs(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      const header = createDoorHeader(
        width,
        height,
        frameWidth,
        frameDepth,
        isVertical,
      );
      result.frame = mergeBufferGeometries([...jambs, header]);
    }
  }

  // Add threshold if requested
  if (includeThreshold) {
    result.threshold = createDoorThreshold(
      width,
      frameWidth,
      frameDepth,
      isVertical,
    );
  }

  return result;
}

/** Get recommended door frame style for a building type */
export function getDoorFrameStyleForBuildingType(
  buildingType: string,
  isEntrance: boolean = false,
): DoorFrameStyle {
  if (!isEntrance) return "simple";

  const styleMap: Record<string, DoorFrameStyle> = {
    // Grand entrances for religious buildings
    church: "grand",
    cathedral: "grand",
    // Formal architrave for wealthy/official buildings
    bank: "architrave",
    "guild-hall": "architrave",
    mansion: "architrave",
    // Heavy lintel for fortified buildings
    keep: "with-lintel",
    fortress: "with-lintel",
    // Rustic style for common buildings
    inn: "rustic",
    tavern: "rustic",
    store: "simple",
    shop: "simple",
    smithy: "with-lintel",
    blacksmith: "with-lintel",
    // Residential
    house: "simple",
    cottage: "rustic",
    farmhouse: "rustic",
    "long-house": "rustic",
    "simple-house": "simple",
    // Other
    warehouse: "simple",
    barracks: "with-lintel",
    stable: "rustic",
  };
  const style = styleMap[buildingType];
  if (!style) {
    // Default to simple for unknown types instead of throwing
    console.warn(
      `[DoorTrimGeometry] Unknown building type: ${buildingType}, using 'simple' style.`,
    );
    return "simple";
  }
  return style;
}

/** Get door frame config for arch openings */
export function getArchDoorConfig(isVertical: boolean): DoorFrameConfig {
  return {
    ...DEFAULT_DOOR_CONFIG,
    width: ARCH_WIDTH,
    isVertical,
    isArched: true,
    style: "arched",
  };
}
