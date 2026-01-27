/**
 * Random Number Generation Utilities
 * Seeded RNG for deterministic building generation
 */

import type { RNG } from "./types";

/**
 * Hash a string to a seed number using FNV-1a algorithm
 */
export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Create a seeded random number generator
 */
export function createRng(seedText: string): RNG {
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
