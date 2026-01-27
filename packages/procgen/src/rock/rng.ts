/**
 * Random Number Generator
 *
 * Seeded RNG for deterministic rock generation.
 * Uses Mulberry32 algorithm for fast, high-quality random numbers.
 */

import type { RNG } from "./types";
import { hashSeed } from "./noise";

/**
 * Mulberry32 PRNG - fast, high-quality 32-bit generator
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded RNG instance
 * @param seed - String or numeric seed
 */
export function createRng(seed: string | number): RNG {
  const numericSeed = typeof seed === "string" ? hashSeed(seed) : seed;
  const random = mulberry32(numericSeed);

  return {
    next(): number {
      return random();
    },

    int(min: number, max: number): number {
      return Math.floor(random() * (max - min + 1)) + min;
    },

    chance(probability: number): boolean {
      return random() < probability;
    },

    pick<T>(list: T[]): T | null {
      if (list.length === 0) return null;
      return list[Math.floor(random() * list.length)];
    },
  };
}
