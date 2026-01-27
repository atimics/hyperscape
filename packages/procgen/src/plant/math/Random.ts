/**
 * Seeded random number generator using Mersenne Twister algorithm.
 * Provides deterministic random values for reproducible plant generation.
 */

/**
 * Mersenne Twister PRNG with seeding support
 */
export class SeededRandom {
  private mt: Uint32Array;
  private mti: number;

  private static readonly N = 624;
  private static readonly M = 397;
  private static readonly MATRIX_A = 0x9908b0df;
  private static readonly UPPER_MASK = 0x80000000;
  private static readonly LOWER_MASK = 0x7fffffff;

  private currentSeed: number;

  constructor(seed?: number) {
    this.mt = new Uint32Array(SeededRandom.N);
    this.mti = SeededRandom.N + 1;
    this.currentSeed = seed ?? Date.now();
    this.setSeed(this.currentSeed);
  }

  /**
   * Set the random seed
   */
  setSeed(seed: number): void {
    this.currentSeed = seed;
    this.mt[0] = seed >>> 0;
    for (this.mti = 1; this.mti < SeededRandom.N; this.mti++) {
      const s = this.mt[this.mti - 1] ^ (this.mt[this.mti - 1] >>> 30);
      this.mt[this.mti] =
        ((((s & 0xffff0000) >>> 16) * 1812433253) << 16) +
        (s & 0x0000ffff) * 1812433253 +
        this.mti;
      this.mt[this.mti] >>>= 0;
    }
  }

  /**
   * Get the current seed
   */
  getSeed(): number {
    return this.currentSeed;
  }

  /**
   * Generate a random 32-bit unsigned integer
   */
  private genrandInt32(): number {
    let y: number;
    const mag01 = [0x0, SeededRandom.MATRIX_A];

    if (this.mti >= SeededRandom.N) {
      let kk: number;

      for (kk = 0; kk < SeededRandom.N - SeededRandom.M; kk++) {
        y =
          (this.mt[kk] & SeededRandom.UPPER_MASK) |
          (this.mt[kk + 1] & SeededRandom.LOWER_MASK);
        this.mt[kk] = this.mt[kk + SeededRandom.M] ^ (y >>> 1) ^ mag01[y & 0x1];
      }
      for (; kk < SeededRandom.N - 1; kk++) {
        y =
          (this.mt[kk] & SeededRandom.UPPER_MASK) |
          (this.mt[kk + 1] & SeededRandom.LOWER_MASK);
        this.mt[kk] =
          this.mt[kk + (SeededRandom.M - SeededRandom.N)] ^
          (y >>> 1) ^
          mag01[y & 0x1];
      }
      y =
        (this.mt[SeededRandom.N - 1] & SeededRandom.UPPER_MASK) |
        (this.mt[0] & SeededRandom.LOWER_MASK);
      this.mt[SeededRandom.N - 1] =
        this.mt[SeededRandom.M - 1] ^ (y >>> 1) ^ mag01[y & 0x1];

      this.mti = 0;
    }

    y = this.mt[this.mti++];

    // Tempering
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;

    return y >>> 0;
  }

  /**
   * Generate a random float in [0, 1)
   */
  random(): number {
    return this.genrandInt32() * (1.0 / 4294967296.0);
  }

  /**
   * Generate a random float in [min, max)
   */
  range(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  /**
   * Generate a random float with additive offset [-range, range]
   */
  rangeAdd(range: number): number {
    return this.range(-range, range);
  }

  /**
   * Generate a random float with multiplicative offset [1-range, 1+range]
   */
  rangeMult(range: number): number {
    return 1.0 + this.rangeAdd(range);
  }

  /**
   * Generate a random integer in [min, max]
   */
  rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Generate an array of random floats
   */
  manyFloats(count: number): number[] {
    const result: number[] = new Array(count);
    for (let i = 0; i < count; i++) {
      result[i] = this.random();
    }
    return result;
  }

  /**
   * Generate a gaussian-distributed random number using Box-Muller transform
   */
  gaussian(mean: number = 0, stdDev: number = 1): number {
    let u = 0,
      v = 0;
    while (u === 0) u = this.random();
    while (v === 0) v = this.random();
    const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return num * stdDev + mean;
  }

  /**
   * Random boolean with given probability of true
   */
  boolean(probability: number = 0.5): boolean {
    return this.random() < probability;
  }

  /**
   * Pick a random element from an array
   */
  pick<T>(array: T[]): T {
    return array[Math.floor(this.random() * array.length)];
  }

  /**
   * Shuffle an array in place using Fisher-Yates algorithm
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

/**
 * Global seeded random instance
 */
let globalRandom = new SeededRandom(12345);

/**
 * Set the global random seed
 */
export function setGlobalSeed(seed: number): void {
  globalRandom.setSeed(seed);
}

/**
 * Get the global random instance
 */
export function getGlobalRandom(): SeededRandom {
  return globalRandom;
}

/**
 * Generate a typed seed for a specific parameter type
 * Ensures different random streams for different aspects of generation
 */
export function genTypedSeed(
  baseSeed: number,
  type: string,
  index: number = 0,
): number {
  // Simple hash combining
  let hash = baseSeed;
  for (let i = 0; i < type.length; i++) {
    hash = (hash << 5) - hash + type.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash + index * 7919); // 7919 is a prime
}
