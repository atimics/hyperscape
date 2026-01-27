/**
 * Polar coordinate utilities
 */

import type { Point2D, Point3D, Polar } from "../types.js";

/** Pi constant */
export const PI = Math.PI;

/** 2 * Pi */
export const PI2 = Math.PI * 2;

/** Pi / 2 */
export const HALF_PI = Math.PI / 2;

/** Degrees to radians conversion factor */
export const DEG_TO_RAD = Math.PI / 180;

/** Radians to degrees conversion factor */
export const RAD_TO_DEG = 180 / Math.PI;

/**
 * Convert degrees to radians
 */
export function radians(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

/**
 * Convert radians to degrees
 */
export function degrees(radians: number): number {
  return radians * RAD_TO_DEG;
}

/**
 * Create a polar coordinate
 */
export function polar(
  radius: number,
  angle: number,
  inDegrees: boolean = false,
): Polar {
  return {
    radius,
    angle: inDegrees ? radians(angle) : angle,
  };
}

/**
 * Convert polar to cartesian coordinates
 */
export function polarToCartesian(p: Polar): Point2D {
  return {
    x: Math.cos(p.angle) * p.radius,
    y: Math.sin(p.angle) * p.radius,
  };
}

/**
 * Convert cartesian to polar coordinates
 */
export function cartesianToPolar(x: number, y: number): Polar {
  return {
    radius: Math.sqrt(x * x + y * y),
    angle: Math.atan2(y, x),
  };
}

/**
 * Add polar offset to a point
 */
export function addPolar(point: Point2D, p: Polar): Point2D {
  const offset = polarToCartesian(p);
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}

/**
 * Add polar offset with degrees
 */
export function addPolarDeg(
  point: Point2D,
  radius: number,
  angleDeg: number,
): Point2D {
  return addPolar(point, polar(radius, angleDeg, true));
}

/**
 * Get angle between two points in radians
 */
export function angleBetween(p0: Point2D, p1: Point2D): number {
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

/**
 * Get angle between two 3D points in radians (XY plane)
 */
export function angleBetween3D(p0: Point3D, p1: Point3D): number {
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

/**
 * Normalize angle to [0, 2π)
 */
export function normalizeAngle(angle: number): number {
  while (angle < 0) angle += PI2;
  while (angle >= PI2) angle -= PI2;
  return angle;
}

/**
 * Normalize angle to [-π, π)
 */
export function normalizeAngleSigned(angle: number): number {
  while (angle < -PI) angle += PI2;
  while (angle >= PI) angle -= PI2;
  return angle;
}

/**
 * Interpolate between two angles (shortest path)
 */
export function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > PI) diff -= PI2;
  while (diff < -PI) diff += PI2;
  return a + diff * t;
}
