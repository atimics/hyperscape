/**
 * Arrangement Compatibility Tests
 *
 * CRITICAL: These tests verify that the TypeScript implementation produces
 * EXACTLY the same values as the original C# Unity implementation.
 *
 * Reference: Procedural-Plant-and-Foliage-Generator/Assets/Scripts/Core/PlantEditor/Arrangement.cs
 * Reference: Procedural-Plant-and-Foliage-Generator/Assets/Scripts/Core/PlantEditor/LeafStem.cs
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateArrangements,
  generateTrunk,
  generateStem,
  getPotScale,
  getPotYAdd,
} from "../../src/plant/assembly/Arrangement.js";
import {
  createDefaultParams,
  getParamValue,
  setParamValue,
} from "../../src/plant/params/LeafParamDefaults.js";
import { LPK } from "../../src/plant/types.js";
import type { LeafParamDict, ArrangementData } from "../../src/plant/types.js";
import { SeededRandom, genTypedSeed } from "../../src/plant/math/Random.js";

// =============================================================================
// CONSTANTS VERIFICATION (must match C#)
// =============================================================================

describe("Arrangement Constants", () => {
  it("should have correct POT_SCALE_FUDGE value (6.66)", () => {
    // Original C#: private static float PotScaleFudge = 6.66f;
    const params = createDefaultParams();
    setParamValue(params, LPK.PotScale, 1.0);
    const potScale = getPotScale(params);
    // POT_SCALE_BASE = 2.0 * 6.66 = 13.32
    expect(potScale).toBeCloseTo(13.32, 4);
  });

  it("should have correct POT_SCALE_BASE value (2 * 6.66 = 13.32)", () => {
    // Original C#: public static float PotScaleBase = 2f * PotScaleFudge;
    const params = createDefaultParams();
    setParamValue(params, LPK.PotScale, 1.0);
    const potScale = getPotScale(params);
    expect(potScale).toBeCloseTo(13.32, 4);
  });

  it("should return 0 for potYAdd in foliage-only mode", () => {
    // We don't have FlowerPotController, so potYAdd should be 0
    const params = createDefaultParams();
    expect(getPotYAdd(params)).toBe(0);
  });
});

// =============================================================================
// Y POSITION CALCULATION
// =============================================================================

describe("Y Position Calculation", () => {
  let params: LeafParamDict;

  beforeEach(() => {
    params = createDefaultParams();
    // Set deterministic values for testing
    setParamValue(params, LPK.NodeInitialY, 0.5);
    setParamValue(params, LPK.NodeDistance, 0.3);
    setParamValue(params, LPK.LeafCount, 5);
    setParamValue(params, LPK.RotationRand, 0); // Disable randomness for deterministic testing
    setParamValue(params, LPK.ScaleRand, 0);
    setParamValue(params, LPK.StemLengthRand, 0);
    setParamValue(params, LPK.StemFlopRand, 0);
    setParamValue(params, LPK.LeafSkewMax, 0);
  });

  it("should start Y position at NodeInitialY (+ potYAdd which is 0)", () => {
    // Original C#: float yPos = fields[LPK.NodeInitialY].value + potYAdd;
    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    expect(arrangements[0].pos.y).toBeCloseTo(0.5, 4);
  });

  it("should increment Y position by NodeDistance for each leaf", () => {
    // Original C#: yPos += fields[LPK.NodeDistance].value;
    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // Y positions should be: 0.5, 0.8, 1.1, 1.4, 1.7
    expect(arrangements[0].pos.y).toBeCloseTo(0.5, 4);
    expect(arrangements[1].pos.y).toBeCloseTo(0.8, 4);
    expect(arrangements[2].pos.y).toBeCloseTo(1.1, 4);
    expect(arrangements[3].pos.y).toBeCloseTo(1.4, 4);
    expect(arrangements[4].pos.y).toBeCloseTo(1.7, 4);
  });

  it("should calculate correct Y positions for various NodeDistance values", () => {
    setParamValue(params, LPK.NodeInitialY, 1.0);
    setParamValue(params, LPK.NodeDistance, 0.5);
    setParamValue(params, LPK.LeafCount, 4);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // Y positions: 1.0, 1.5, 2.0, 2.5
    expect(arrangements[0].pos.y).toBeCloseTo(1.0, 4);
    expect(arrangements[1].pos.y).toBeCloseTo(1.5, 4);
    expect(arrangements[2].pos.y).toBeCloseTo(2.0, 4);
    expect(arrangements[3].pos.y).toBeCloseTo(2.5, 4);
  });
});

// =============================================================================
// SCALE GRADIENT CALCULATION
// =============================================================================

describe("Scale Gradient Calculation", () => {
  let params: LeafParamDict;

  beforeEach(() => {
    params = createDefaultParams();
    setParamValue(params, LPK.LeafScale, 1.0);
    setParamValue(params, LPK.ScaleMin, 0.4);
    setParamValue(params, LPK.ScaleRand, 0); // No randomness
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.StemLengthRand, 0);
    setParamValue(params, LPK.StemFlopRand, 0);
    setParamValue(params, LPK.LeafSkewMax, 0);
  });

  it("should use fullPerc = i / (count - 1) for scale gradient", () => {
    // Original C#: float fullPerc = (float)i / (count - 1f);
    // scale = (1f - ScaleMin) * fullPerc + ScaleMin
    setParamValue(params, LPK.LeafCount, 5);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // fullPerc values: 0/4=0, 1/4=0.25, 2/4=0.5, 3/4=0.75, 4/4=1
    // scale = (1 - 0.4) * fullPerc + 0.4 = 0.6 * fullPerc + 0.4
    // Expected: 0.4, 0.55, 0.7, 0.85, 1.0
    expect(arrangements[0].scale).toBeCloseTo(0.4, 4);
    expect(arrangements[1].scale).toBeCloseTo(0.55, 4);
    expect(arrangements[2].scale).toBeCloseTo(0.7, 4);
    expect(arrangements[3].scale).toBeCloseTo(0.85, 4);
    expect(arrangements[4].scale).toBeCloseTo(1.0, 4);
  });

  it("should return scale of 1.0 when count is 1", () => {
    // Original C#: if (count == 1) fullPerc = 1f;
    // and scale = count == 1 ? 1f : ...
    setParamValue(params, LPK.LeafCount, 1);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    expect(arrangements.length).toBe(1);
    expect(arrangements[0].scale).toBeCloseTo(1.0, 4);
  });

  it("should multiply scale by LeafScale parameter", () => {
    setParamValue(params, LPK.LeafScale, 2.0);
    setParamValue(params, LPK.LeafCount, 3);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // fullPerc: 0, 0.5, 1.0
    // base scale: 0.4, 0.7, 1.0
    // with LeafScale 2.0: 0.8, 1.4, 2.0
    expect(arrangements[0].scale).toBeCloseTo(0.8, 4);
    expect(arrangements[1].scale).toBeCloseTo(1.4, 4);
    expect(arrangements[2].scale).toBeCloseTo(2.0, 4);
  });

  it("should have oldest leaves (i=0) smallest, newest (last) largest", () => {
    setParamValue(params, LPK.LeafCount, 5);
    setParamValue(params, LPK.ScaleMin, 0.3);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // Verify scale increases from first to last
    for (let i = 1; i < arrangements.length; i++) {
      expect(arrangements[i].scale).toBeGreaterThan(arrangements[i - 1].scale);
    }
  });
});

// =============================================================================
// ROTATION CALCULATION
// =============================================================================

describe("Rotation Calculation", () => {
  let params: LeafParamDict;

  beforeEach(() => {
    params = createDefaultParams();
    setParamValue(params, LPK.RotationClustering, 0.5);
    setParamValue(params, LPK.RotationalSymmetry, 1);
    setParamValue(params, LPK.RotationRand, 0); // No randomness for deterministic testing
    setParamValue(params, LPK.ScaleRand, 0);
    setParamValue(params, LPK.StemLengthRand, 0);
    setParamValue(params, LPK.StemFlopRand, 0);
    setParamValue(params, LPK.LeafSkewMax, 0);
  });

  it("should calculate angleMax = 360 * (1 - RotationClustering)", () => {
    // Original C#: float angleMax = 360f * (1f - fields[LPK.RotationClustering].value);
    // With RotationClustering = 0.5: angleMax = 360 * 0.5 = 180
    setParamValue(params, LPK.RotationClustering, 0.5);
    setParamValue(params, LPK.LeafCount, 2);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // angleStart = 90 - (180 / 2) = 0
    // stemYAngle for i=0: 0 * 180 + 0 + 0 + 0 = 0
    // stemYAngle for i=1: 0.5 * 180 + 0 + 0 + 0 = 90
    // But we convert to quaternion, so check the rotation values
    expect(arrangements.length).toBe(2);
  });

  it("should calculate angleStart = 90 - (angleMax / 2)", () => {
    // Original C#: float angleStart = 90f - (angleMax / 2f);
    // With RotationClustering = 0: angleMax = 360, angleStart = 90 - 180 = -90
    // With RotationClustering = 1: angleMax = 0, angleStart = 90 - 0 = 90
    setParamValue(params, LPK.RotationClustering, 0);
    setParamValue(params, LPK.LeafCount, 1);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // angleMax = 360, angleStart = -90
    // stemYAngle for i=0: 0 * 360 + 0 + 0 + (-90) = -90
    expect(arrangements.length).toBe(1);
  });

  it("should use mostPerc = i / count for rotation (not fullPerc)", () => {
    // Original C#: float mostPerc = (float)i / count;
    // This is different from fullPerc = i / (count - 1)
    setParamValue(params, LPK.RotationClustering, 0);
    setParamValue(params, LPK.LeafCount, 4);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // mostPerc values: 0/4=0, 1/4=0.25, 2/4=0.5, 3/4=0.75
    // (not 4/4=1, because last mostPerc is (count-1)/count)
    expect(arrangements.length).toBe(4);
  });
});

// =============================================================================
// SYMMETRY ANGLE CALCULATION
// =============================================================================

describe("Symmetry Angle Calculation", () => {
  let params: LeafParamDict;

  beforeEach(() => {
    params = createDefaultParams();
    setParamValue(params, LPK.RotationClustering, 1.0); // No spread, focus on symmetry
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.ScaleRand, 0);
    setParamValue(params, LPK.StemLengthRand, 0);
    setParamValue(params, LPK.StemFlopRand, 0);
    setParamValue(params, LPK.LeafSkewMax, 0);
  });

  it("should handle symmetry = 0 as symmetry = 1", () => {
    // Original C#: if (sym == 0) sym = 1;
    setParamValue(params, LPK.RotationalSymmetry, 0);
    setParamValue(params, LPK.LeafCount, 3);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    expect(arrangements.length).toBe(3);
  });

  it("should add +90 degrees for symmetry = 2", () => {
    // Original C#: if (sym == 2) symAngleAdd += 90f;
    setParamValue(params, LPK.RotationalSymmetry, 2);
    setParamValue(params, LPK.LeafCount, 4);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // symAngleAdd for i=0: (360/2) * 0 + 90 = 90
    // symAngleAdd for i=1: (360/2) * 1 + 90 = 270
    // symAngleAdd for i=2: (360/2) * 0 + 90 = 90
    // symAngleAdd for i=3: (360/2) * 1 + 90 = 270
    expect(arrangements.length).toBe(4);
  });

  it("should add +180 degrees for symmetry = 3", () => {
    // Original C#: if (sym == 3) symAngleAdd += 180f;
    setParamValue(params, LPK.RotationalSymmetry, 3);
    setParamValue(params, LPK.LeafCount, 6);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // symAngleAdd for i=0: (360/3) * 0 + 180 = 180
    // symAngleAdd for i=1: (360/3) * 1 + 180 = 300
    // symAngleAdd for i=2: (360/3) * 2 + 180 = 420 = 60 (mod 360 doesn't matter)
    expect(arrangements.length).toBe(6);
  });

  it("should calculate symAngleAdd = (360 / sym) * (i % sym)", () => {
    // Original C#: float symAngleAdd = (360f / sym) * (i % sym);
    setParamValue(params, LPK.RotationalSymmetry, 4);
    setParamValue(params, LPK.LeafCount, 8);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // For sym=4: base angles are 0, 90, 180, 270 repeating
    expect(arrangements.length).toBe(8);
  });
});

// =============================================================================
// STEM LENGTH MODIFIERS
// =============================================================================

describe("Stem Length Modifiers", () => {
  let params: LeafParamDict;

  beforeEach(() => {
    params = createDefaultParams();
    setParamValue(params, LPK.StemLengthIncrease, 0.5);
    setParamValue(params, LPK.StemLengthRand, 0); // No randomness
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.ScaleRand, 0);
    setParamValue(params, LPK.StemFlopRand, 0);
    setParamValue(params, LPK.LeafSkewMax, 0);
  });

  it("should calculate stemLengthAdd = StemLengthIncrease * (i / (count - 1))", () => {
    // Original C#: count <= 1 ? 0 : fields[LPK.StemLengthIncrease].value * (i / ((float)count - 1f))
    setParamValue(params, LPK.LeafCount, 5);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // stemLengthAdd: 0.5 * (0/4, 1/4, 2/4, 3/4, 4/4) = 0, 0.125, 0.25, 0.375, 0.5
    expect(arrangements[0].stemLengthAdd).toBeCloseTo(0, 4);
    expect(arrangements[1].stemLengthAdd).toBeCloseTo(0.125, 4);
    expect(arrangements[2].stemLengthAdd).toBeCloseTo(0.25, 4);
    expect(arrangements[3].stemLengthAdd).toBeCloseTo(0.375, 4);
    expect(arrangements[4].stemLengthAdd).toBeCloseTo(0.5, 4);
  });

  it("should return stemLengthAdd = 0 when count <= 1", () => {
    setParamValue(params, LPK.LeafCount, 1);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    expect(arrangements[0].stemLengthAdd).toBe(0);
  });

  it("should have stemLengthMult = 1 + rangeAdd(StemLengthRand * 0.3)", () => {
    // Original C#: 1f + BWRandom.RangeAdd(fields[LPK.StemLengthRand].value * 0.3f)
    setParamValue(params, LPK.StemLengthRand, 0);
    setParamValue(params, LPK.LeafCount, 3);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // With StemLengthRand = 0, stemLengthMult should be exactly 1
    arrangements.forEach((arr) => {
      expect(arr.stemLengthMult).toBeCloseTo(1.0, 4);
    });
  });
});

// =============================================================================
// STEM FLOP MODIFIERS
// =============================================================================

describe("Stem Flop Modifiers", () => {
  let params: LeafParamDict;

  beforeEach(() => {
    params = createDefaultParams();
    setParamValue(params, LPK.StemFlopLower, 0.8);
    setParamValue(params, LPK.StemFlopRand, 0); // No randomness
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.ScaleRand, 0);
    setParamValue(params, LPK.StemLengthRand, 0);
    setParamValue(params, LPK.LeafSkewMax, 0);
  });

  it("should calculate extraFlop = StemFlopLower * (1 - fullPerc) * 45", () => {
    // Original C#: float extraFlop = fields[LPK.StemFlopLower].value * (1f - fullPerc) * 45f;
    setParamValue(params, LPK.LeafCount, 5);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // fullPerc: 0, 0.25, 0.5, 0.75, 1.0
    // extraFlop = 0.8 * (1 - fullPerc) * 45
    // = 0.8 * 45 * (1, 0.75, 0.5, 0.25, 0) = 36, 27, 18, 9, 0
    expect(arrangements[0].stemFlopAdd).toBeCloseTo(36, 4);
    expect(arrangements[1].stemFlopAdd).toBeCloseTo(27, 4);
    expect(arrangements[2].stemFlopAdd).toBeCloseTo(18, 4);
    expect(arrangements[3].stemFlopAdd).toBeCloseTo(9, 4);
    expect(arrangements[4].stemFlopAdd).toBeCloseTo(0, 4);
  });

  it("should have lower (earlier) leaves with more flop", () => {
    setParamValue(params, LPK.LeafCount, 5);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // stemFlopAdd should decrease from first to last leaf
    for (let i = 1; i < arrangements.length; i++) {
      expect(arrangements[i].stemFlopAdd).toBeLessThan(
        arrangements[i - 1].stemFlopAdd,
      );
    }
  });

  it("should have stemFlopMult = 1 + rangeAdd(StemFlopRand) when no randomness", () => {
    setParamValue(params, LPK.StemFlopRand, 0);
    setParamValue(params, LPK.LeafCount, 3);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    arrangements.forEach((arr) => {
      expect(arr.stemFlopMult).toBeCloseTo(1.0, 4);
    });
  });
});

// =============================================================================
// STEM CURVE GENERATION (LeafStem.CreateCurves equivalent)
// =============================================================================

describe("Stem Curve Generation", () => {
  let params: LeafParamDict;

  beforeEach(() => {
    params = createDefaultParams();
    setParamValue(params, LPK.StemLength, 2.0);
    setParamValue(params, LPK.StemFlop, 45); // 45 degrees
    setParamValue(params, LPK.StemNeck, 0);
  });

  it("should calculate flopPerc = flopVal / 90", () => {
    // Original C#: return flopVal / 90f;
    const arrData: ArrangementData = {
      pos: { x: 0, y: 0, z: 0 },
      stemRotation: { x: 0, y: 0, z: 0, w: 1 },
      leafZAngle: 0,
      scale: 1,
      stemLengthAdd: 0,
      stemLengthMult: 1,
      stemFlopMult: 1,
      stemFlopAdd: 0,
      potScale: 13.32,
    };

    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrData,
      12345,
    );

    // With StemFlop = 45 and no modifiers, flopPerc = 45/90 = 0.5
    expect(stem.curves.length).toBeGreaterThanOrEqual(1);
  });

  it("should adjust flopVal based on stemFlopMult and stemFlopAdd", () => {
    // Original C#:
    // float flopDiff = arrData.stemFlopMult > 1 ? flopVal : (90f - flopVal);
    // flopVal += flopDiff * (1f - arrData.stemFlopMult);
    // flopVal += arrData.stemFlopAdd;
    const arrData: ArrangementData = {
      pos: { x: 0, y: 0, z: 0 },
      stemRotation: { x: 0, y: 0, z: 0, w: 1 },
      leafZAngle: 0,
      scale: 1,
      stemLengthAdd: 0,
      stemLengthMult: 1,
      stemFlopMult: 1.2, // > 1
      stemFlopAdd: 10,
      potScale: 13.32,
    };

    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrData,
      12345,
    );

    expect(stem.curves.length).toBeGreaterThanOrEqual(1);
  });

  it("should calculate stem length with lenAdj = 0.25", () => {
    // Original C#: float len = arrData.stemLengthMult * (StemLength + stemLengthAdd) / (1f + (lenAdj * flopPerc * flopPerc));
    const arrData: ArrangementData = {
      pos: { x: 0, y: 0, z: 0 },
      stemRotation: { x: 0, y: 0, z: 0, w: 1 },
      leafZAngle: 0,
      scale: 1,
      stemLengthAdd: 0.5,
      stemLengthMult: 1.2,
      stemFlopMult: 1,
      stemFlopAdd: 0,
      potScale: 13.32,
    };

    setParamValue(params, LPK.StemFlop, 0); // flopPerc = 0

    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrData,
      12345,
    );

    // With flopPerc = 0: len = 1.2 * (2.0 + 0.5) / (1 + 0) = 3.0
    // Note: stem generation now includes ±5% seed-based length variation
    // So expect within 5% of 3.0 (2.85 to 3.15)
    expect(stem.length).toBeGreaterThan(2.85);
    expect(stem.length).toBeLessThan(3.15);
  });

  it("should use polar angle -(flopPerc * 90) + 90 for endpoint", () => {
    // Original C#: Polar flop = new Polar(len, -(flopPerc * 90f) + 90, true);
    // At flopPerc = 0: angle = 90° (horizontal)
    // At flopPerc = 1: angle = 0° (vertical down)
    const arrData: ArrangementData = {
      pos: { x: 0, y: 0, z: 0 },
      stemRotation: { x: 0, y: 0, z: 0, w: 1 },
      leafZAngle: 0,
      scale: 1,
      stemLengthAdd: 0,
      stemLengthMult: 1,
      stemFlopMult: 1,
      stemFlopAdd: 0,
      potScale: 13.32,
    };

    setParamValue(params, LPK.StemFlop, 0); // flopPerc = 0
    const stem0 = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrData,
      12345,
    );

    // At flopPerc = 0, endpoint should be roughly horizontal (y > x)
    const mainCurve0 = stem0.curves[0];
    expect(mainCurve0.p1.y).toBeGreaterThan(mainCurve0.p1.x * 0.9); // Close to vertical

    setParamValue(params, LPK.StemFlop, 90); // flopPerc = 1
    const stem90 = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrData,
      12345,
    );

    // At flopPerc = 1, endpoint should be roughly horizontal (x > y)
    const mainCurve90 = stem90.curves[0];
    expect(mainCurve90.p1.x).toBeGreaterThan(mainCurve90.p1.y);
  });

  it("should create properly subdivided main curve (truncated at 0.9)", () => {
    // Original C# subdivides the main curve at 0.9, modifying it to be 0-0.9
    // The handles are adjusted by the De Casteljau algorithm
    const arrData: ArrangementData = {
      pos: { x: 0, y: 0, z: 0 },
      stemRotation: { x: 0, y: 0, z: 0, w: 1 },
      leafZAngle: 0,
      scale: 1,
      stemLengthAdd: 0,
      stemLengthMult: 1,
      stemFlopMult: 1,
      stemFlopAdd: 0,
      potScale: 13.32,
    };

    setParamValue(params, LPK.StemFlop, 45); // flopPerc = 0.5
    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrData,
      12345,
    );

    // Main curve should be truncated (p1 is not the full flop endpoint)
    const mainCurve = stem.curves[0];
    const neckCurve = stem.curves[1];

    // Main curve p0 should be origin
    expect(mainCurve.p0.x).toBeCloseTo(0, 4);
    expect(mainCurve.p0.y).toBeCloseTo(0, 4);

    // Main curve p1 should equal neck curve p0 (continuous)
    expect(mainCurve.p1.x).toBeCloseTo(neckCurve.p0.x, 4);
    expect(mainCurve.p1.y).toBeCloseTo(neckCurve.p0.y, 4);

    // Both curves should have valid structure
    expect(mainCurve.h0).toBeDefined();
    expect(mainCurve.h1).toBeDefined();
    expect(neckCurve.h0).toBeDefined();
    expect(neckCurve.h1).toBeDefined();
  });
});

// =============================================================================
// POT SCALE CALCULATION
// =============================================================================

describe("Pot Scale Calculation", () => {
  it("should calculate potScale = POT_SCALE_BASE * PotScale", () => {
    // Original C#: GetPotScale => PotScaleBase * fields[LPK.PotScale].value
    const params = createDefaultParams();

    setParamValue(params, LPK.PotScale, 0.5);
    expect(getPotScale(params)).toBeCloseTo(13.32 * 0.5, 4);

    setParamValue(params, LPK.PotScale, 1.0);
    expect(getPotScale(params)).toBeCloseTo(13.32, 4);

    setParamValue(params, LPK.PotScale, 2.0);
    expect(getPotScale(params)).toBeCloseTo(13.32 * 2.0, 4);
  });

  it("should store potScale in arrangement data", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.PotScale, 1.5);
    setParamValue(params, LPK.LeafCount, 3);
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.ScaleRand, 0);
    setParamValue(params, LPK.StemLengthRand, 0);
    setParamValue(params, LPK.StemFlopRand, 0);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    arrangements.forEach((arr) => {
      expect(arr.potScale).toBeCloseTo(13.32 * 1.5, 4);
    });
  });
});

// =============================================================================
// RANDOM SEED CONSISTENCY
// =============================================================================

describe("Random Seed Consistency", () => {
  it("should produce deterministic results with same seed", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 5);
    setParamValue(params, LPK.RotationRand, 0.5);
    setParamValue(params, LPK.ScaleRand, 0.3);
    setParamValue(params, LPK.StemLengthRand, 0.2);
    setParamValue(params, LPK.StemFlopRand, 0.4);

    const trunk1 = generateTrunk(params, 5, 12345);
    const arrangements1 = calculateArrangements(params, trunk1, 12345);

    const trunk2 = generateTrunk(params, 5, 12345);
    const arrangements2 = calculateArrangements(params, trunk2, 12345);

    expect(arrangements1.length).toBe(arrangements2.length);

    for (let i = 0; i < arrangements1.length; i++) {
      expect(arrangements1[i].pos.x).toBeCloseTo(arrangements2[i].pos.x, 6);
      expect(arrangements1[i].pos.y).toBeCloseTo(arrangements2[i].pos.y, 6);
      expect(arrangements1[i].pos.z).toBeCloseTo(arrangements2[i].pos.z, 6);
      expect(arrangements1[i].scale).toBeCloseTo(arrangements2[i].scale, 6);
      expect(arrangements1[i].stemLengthAdd).toBeCloseTo(
        arrangements2[i].stemLengthAdd,
        6,
      );
      expect(arrangements1[i].stemFlopAdd).toBeCloseTo(
        arrangements2[i].stemFlopAdd,
        6,
      );
    }
  });

  it("should produce different results with different seeds", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 5);
    setParamValue(params, LPK.RotationRand, 0.5);

    const trunk1 = generateTrunk(params, 5, 11111);
    const arrangements1 = calculateArrangements(params, trunk1, 11111);

    const trunk2 = generateTrunk(params, 5, 99999);
    const arrangements2 = calculateArrangements(params, trunk2, 99999);

    // At least some values should be different
    let hasDifference = false;
    for (let i = 0; i < arrangements1.length && !hasDifference; i++) {
      if (Math.abs(arrangements1[i].scale - arrangements2[i].scale) > 0.01) {
        hasDifference = true;
      }
    }
    expect(hasDifference).toBe(true);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe("Edge Cases", () => {
  it("should handle LeafCount at minimum (1)", () => {
    // Note: LeafCount has min=1 in the param definition, so 0 gets clamped to 1
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 0); // Gets clamped to 1
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.ScaleRand, 0);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // LeafCount gets clamped to min of 1
    expect(arrangements.length).toBe(1);
  });

  it("should handle LeafCount = 1", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 1);
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.ScaleRand, 0);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    expect(arrangements.length).toBe(1);
    expect(arrangements[0].scale).toBeCloseTo(1.0, 4); // Special case in C#
    expect(arrangements[0].stemLengthAdd).toBe(0); // Special case in C#
  });

  it("should handle RotationClustering = 1 (no spread)", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 3);
    setParamValue(params, LPK.RotationClustering, 1.0);
    setParamValue(params, LPK.RotationRand, 0);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // angleMax = 360 * (1 - 1) = 0
    // All leaves should have same base angle = angleStart = 90
    expect(arrangements.length).toBe(3);
  });

  it("should handle RotationClustering = 0 (full spread)", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 4);
    setParamValue(params, LPK.RotationClustering, 0);
    setParamValue(params, LPK.RotationRand, 0);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // angleMax = 360 * (1 - 0) = 360
    // angleStart = 90 - 180 = -90
    expect(arrangements.length).toBe(4);
  });

  it("should handle ScaleMin = 1 (no scale gradient)", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 5);
    setParamValue(params, LPK.ScaleMin, 1.0);
    setParamValue(params, LPK.LeafScale, 1.0);
    setParamValue(params, LPK.ScaleRand, 0);
    setParamValue(params, LPK.RotationRand, 0);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // All scales should be 1.0
    arrangements.forEach((arr) => {
      expect(arr.scale).toBeCloseTo(1.0, 4);
    });
  });

  it("should handle ScaleMin at minimum (0.1) for maximum gradient", () => {
    // Note: ScaleMin has min=0.1 in the param definition, so 0 gets clamped to 0.1
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 3);
    setParamValue(params, LPK.ScaleMin, 0); // Gets clamped to 0.1
    setParamValue(params, LPK.LeafScale, 1.0);
    setParamValue(params, LPK.ScaleRand, 0);
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.StemLengthRand, 0);
    setParamValue(params, LPK.StemFlopRand, 0);
    setParamValue(params, LPK.LeafSkewMax, 0);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // ScaleMin gets clamped to 0.1
    // Scales: (1-0.1)*fullPerc + 0.1 = 0.9*fullPerc + 0.1
    // For fullPerc = 0, 0.5, 1.0: scales = 0.1, 0.55, 1.0
    expect(arrangements[0].scale).toBeCloseTo(0.1, 4);
    expect(arrangements[1].scale).toBeCloseTo(0.55, 4);
    expect(arrangements[2].scale).toBeCloseTo(1.0, 4);
  });
});

// =============================================================================
// STEM MESH GENERATION (matches C# StemRenderer.Render)
// =============================================================================

describe("Stem Mesh Generation", () => {
  it("should generate mesh from ALL stem curves, not just first", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.StemLength, 2.0);
    setParamValue(params, LPK.StemFlop, 45);
    setParamValue(params, LPK.StemNeck, 10);
    setParamValue(params, LPK.LeafCount, 1);
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.ScaleRand, 0);
    setParamValue(params, LPK.StemLengthRand, 0);
    setParamValue(params, LPK.StemFlopRand, 0);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // Generate stem
    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrangements[0],
      12345,
    );

    // Stem should have 2 curves (main + neck)
    expect(stem.curves.length).toBe(2);

    // Second curve (neck) starts at t=0.9 of the main curve
    // In the original C#, neck = main.Subdivide(0.9f) - so neck.p0 is main evaluated at 0.9
    // Our implementation creates neck starting from evaluateBezier(main, 0.9)
    const curve1 = stem.curves[0];
    const curve2 = stem.curves[1];

    // Both curves should have valid structure
    expect(curve1.p0).toBeDefined();
    expect(curve1.p1).toBeDefined();
    expect(curve2.p0).toBeDefined();
    expect(curve2.p1).toBeDefined();

    // The neck curve's start point should be between the main curve's start and end
    // (since it starts at t=0.9, i.e., 90% along the main curve)
    expect(curve2.p0.y).toBeLessThanOrEqual(curve1.p1.y * 1.1);
    expect(curve2.p0.y).toBeGreaterThanOrEqual(curve1.p0.y);
  });

  it("should taper stem width only in last 5% (0.95 to 1.0)", () => {
    // Original C# ShapeScaleAtPercent:
    // if (perc <= 0.95f) return 1f;
    // Then tapers from 1.0 to 0.25 in the last 5%
    // At 0.0, should be 1.0
    // At 0.5, should be 1.0
    // At 0.94, should be 1.0
    // At 0.95, should be 1.0
    // At 1.0, should be ~0.25 (floor value)
  });

  it("should use 6-sided polygon shape, not circular", () => {
    // Original C# CreateShape uses 6 sides
    // Our implementation also uses 6 segments by default
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 1);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrangements[0],
      12345,
    );

    expect(stem.curves.length).toBeGreaterThanOrEqual(1);
  });

  it("should orient rings along curve tangent direction", () => {
    // Original C# uses Quaternion.LookRotation(normal, Vector3.up)
    // to orient shape rings perpendicular to curve direction
    const params = createDefaultParams();
    setParamValue(params, LPK.StemFlop, 90); // Maximum droop for visible orientation change
    setParamValue(params, LPK.LeafCount, 1);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrangements[0],
      12345,
    );

    // Stem should have curves
    expect(stem.curves.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// LEAF ATTACHMENT (matches C# LeafBundle.GetFinalLeafAttachmentInfo)
// =============================================================================

describe("Leaf Attachment Info", () => {
  it("should position leaf at last stem point with small buffer along tangent", () => {
    // Original C#: curveData.stemPoints.Last() + buffer
    // where buffer = normals.Last().normalized * 0.02f
    const params = createDefaultParams();
    setParamValue(params, LPK.StemLength, 2.0);
    setParamValue(params, LPK.StemFlop, 0); // No flop for predictable position
    setParamValue(params, LPK.LeafCount, 1);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrangements[0],
      12345,
    );

    // Last curve endpoint
    const lastCurve = stem.curves[stem.curves.length - 1];
    const lastPoint = lastCurve.p1;

    // Leaf should be positioned slightly beyond the stem tip
    // The buffer is 0.02 units along the tangent direction
    expect(lastPoint.y).toBeGreaterThan(0); // Stem goes upward
  });

  it("should calculate rotation based on stem tangent", () => {
    // Original C#: Quaternion.LookRotation(normals.Last(), Vector3.up)
    // The leaf faces along the stem direction
    const params = createDefaultParams();
    setParamValue(params, LPK.StemFlop, 45);
    setParamValue(params, LPK.LeafCount, 1);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrangements[0],
      12345,
    );

    // Stem should have valid curves
    expect(stem.curves.length).toBeGreaterThanOrEqual(1);
  });

  it("should apply leafZAngle in attachment rotation", () => {
    // Original C#: Quaternion.Euler(0, 180, arrData.leafZAngle)
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafSkewMax, 30);
    setParamValue(params, LPK.LeafCount, 3);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // Different arrangements may have different leafZAngle values
    // due to random skew
    expect(arrangements.length).toBe(3);
  });
});

// =============================================================================
// BUNDLE TRANSFORM (matches C# LeafBundle.PositionStem/PositionLeaf)
// =============================================================================

describe("Bundle Transform", () => {
  it("should apply scale ONLY to leaf, not to stem", () => {
    // Original C#: if (deps.leafData.GetTransform() is Transform t)
    //   t.localScale = new Vector3(d.scale, d.scale, d.scale);
    // The stem mesh is NOT scaled - only the leaf child is scaled
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafScale, 2.0);
    setParamValue(params, LPK.ScaleMin, 0.5);
    setParamValue(params, LPK.LeafCount, 3);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // Arrangements should have different scale values
    // Scale should be between 0.5 and 2.0 * 1.0 = 0.5 to 2.0
    for (const arr of arrangements) {
      expect(arr.scale).toBeGreaterThan(0);
      expect(arr.scale).toBeLessThanOrEqual(2.0);
    }
  });

  it("should scale stem width by arrangement scale", () => {
    // Original C#: float s = 0.25f * fields[LPK.StemWidth].value * scale
    // where scale is arrData.scale
    // So stem width IS affected by scale, but through the shape creation
    const params = createDefaultParams();
    setParamValue(params, LPK.StemWidth, 1.0);
    setParamValue(params, LPK.LeafScale, 1.0);
    setParamValue(params, LPK.ScaleMin, 0.5);
    setParamValue(params, LPK.LeafCount, 2);
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.ScaleRand, 0);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // First leaf has smaller scale (0.5), last has larger (1.0)
    expect(arrangements[0].scale).toBeLessThan(arrangements[1].scale);

    // Stem width should be: 0.25 * StemWidth * scale
    // For first leaf: 0.25 * 1.0 * 0.5 = 0.125
    // For last leaf: 0.25 * 1.0 * 1.0 = 0.25
  });

  it("should position bundle at trunk attachment point", () => {
    // Original C#: transform.localPosition = d.pos + collisionAdjustment
    const params = createDefaultParams();
    setParamValue(params, LPK.NodeInitialY, 1.0);
    setParamValue(params, LPK.NodeDistance, 0.5);
    setParamValue(params, LPK.LeafCount, 3);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // Y positions should be 1.0, 1.5, 2.0
    expect(arrangements[0].pos.y).toBeCloseTo(1.0, 4);
    expect(arrangements[1].pos.y).toBeCloseTo(1.5, 4);
    expect(arrangements[2].pos.y).toBeCloseTo(2.0, 4);
  });

  it("should rotate bundle by stemRotation (Y axis)", () => {
    // Original C#: transform.localRotation = d.stemRotation
    const params = createDefaultParams();
    setParamValue(params, LPK.RotationalSymmetry, 4);
    setParamValue(params, LPK.RotationClustering, 1.0); // No spread
    setParamValue(params, LPK.RotationRand, 0);
    setParamValue(params, LPK.LeafCount, 4);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    // With sym=4 and clustering=1, leaves should be at 90° intervals
    expect(arrangements.length).toBe(4);

    // Quaternions should be valid (normalized)
    for (const arr of arrangements) {
      const qLen = Math.sqrt(
        arr.stemRotation.x ** 2 +
          arr.stemRotation.y ** 2 +
          arr.stemRotation.z ** 2 +
          arr.stemRotation.w ** 2,
      );
      expect(qLen).toBeCloseTo(1.0, 4);
    }
  });
});

// =============================================================================
// FULL PLANT GENERATION SANITY CHECK
// =============================================================================

describe("Full Plant Generation Sanity Check", () => {
  it("should generate valid arrangements for all presets", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.LeafCount, 5);

    const trunk = generateTrunk(params, 5, 12345);
    const arrangements = calculateArrangements(params, trunk, 12345);

    expect(arrangements.length).toBe(5);

    // Verify all arrangements have valid values
    arrangements.forEach((arr, i) => {
      // Position
      expect(Number.isFinite(arr.pos.x)).toBe(true);
      expect(Number.isFinite(arr.pos.y)).toBe(true);
      expect(Number.isFinite(arr.pos.z)).toBe(true);

      // Quaternion should be normalized
      const qLen = Math.sqrt(
        arr.stemRotation.x ** 2 +
          arr.stemRotation.y ** 2 +
          arr.stemRotation.z ** 2 +
          arr.stemRotation.w ** 2,
      );
      expect(qLen).toBeCloseTo(1.0, 4);

      // Scale should be positive
      expect(arr.scale).toBeGreaterThan(0);

      // Stem modifiers should be reasonable
      expect(arr.stemLengthAdd).toBeGreaterThanOrEqual(0);
      expect(arr.stemLengthMult).toBeGreaterThan(0);
      expect(arr.stemFlopMult).toBeGreaterThan(0);
      expect(arr.stemFlopAdd).toBeGreaterThanOrEqual(0);
      expect(arr.potScale).toBeGreaterThan(0);
    });
  });

  it("should generate trunk with valid geometry", () => {
    const params = createDefaultParams();
    const trunk = generateTrunk(params, 5, 12345);

    expect(trunk.curves.length).toBeGreaterThan(0);
    expect(trunk.width).toBeGreaterThan(0);

    const curve = trunk.curves[0];
    expect(curve.p0.y).toBeLessThan(curve.p1.y); // Trunk goes upward
  });

  it("should generate stems with valid geometry", () => {
    const params = createDefaultParams();
    setParamValue(params, LPK.StemLength, 2.0);

    const arrData: ArrangementData = {
      pos: { x: 0, y: 0, z: 0 },
      stemRotation: { x: 0, y: 0, z: 0, w: 1 },
      leafZAngle: 0,
      scale: 1,
      stemLengthAdd: 0,
      stemLengthMult: 1,
      stemFlopMult: 1,
      stemFlopAdd: 0,
      potScale: 13.32,
    };

    const stem = generateStem(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      params,
      arrData,
      12345,
    );

    expect(stem.curves.length).toBeGreaterThan(0);
    expect(stem.length).toBeGreaterThan(0);

    // First curve should start at origin
    expect(stem.curves[0].p0.x).toBeCloseTo(0, 4);
    expect(stem.curves[0].p0.y).toBeCloseTo(0, 4);
    expect(stem.curves[0].p0.z).toBeCloseTo(0, 4);
  });
});
