/**
 * Seeded Random Number Generator
 *
 * Implements the Mersenne Twister algorithm (MT19937) to match Python's random module.
 * This is critical for deterministic tree generation - given the same seed, the same
 * tree must be produced regardless of platform.
 *
 * Based on the original MT19937 implementation by Makoto Matsumoto and Takuji Nishimura.
 * Python-compatible seeding uses init_by_array even for single integers.
 */

// MT19937 constants
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

/**
 * Multiply two 32-bit numbers and return lower 32 bits.
 */
function mul32(a: number, b: number): number {
  const aLo = a & 0xffff;
  const aHi = a >>> 16;
  const bLo = b & 0xffff;
  const bHi = b >>> 16;
  const lo = aLo * bLo;
  const mid = aLo * bHi + aHi * bLo;
  return (lo + ((mid << 16) >>> 0)) >>> 0;
}

/**
 * Mersenne Twister seeded random number generator.
 * Produces the same sequence as Python's random module for identical seeds.
 */
export class SeededRandom {
  private mt: Uint32Array;
  private mti: number;

  /**
   * Create a new seeded random number generator.
   * @param seed - Integer seed value (will be converted to 32-bit unsigned)
   */
  constructor(seed: number) {
    this.mt = new Uint32Array(N);
    this.mti = N + 1;
    this.seed(seed);
  }

  /**
   * Initialize with a simple seed (used internally before init_by_array).
   */
  private initGenrand(seed: number): void {
    this.mt[0] = seed >>> 0;
    for (let i = 1; i < N; i++) {
      const s = this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30);
      this.mt[i] = (mul32(s, 1812433253) + i) >>> 0;
    }
    this.mti = N;
  }

  /**
   * Initialize by an array with array-length.
   * This is how Python initializes even for single integer seeds.
   */
  private initByArray(initKey: number[]): void {
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    let k = N > initKey.length ? N : initKey.length;

    for (; k > 0; k--) {
      const s = this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30);
      this.mt[i] = ((this.mt[i]! ^ mul32(s, 1664525)) + initKey[j]! + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]!;
        i = 1;
      }
      if (j >= initKey.length) {
        j = 0;
      }
    }

    for (k = N - 1; k > 0; k--) {
      const s = this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30);
      this.mt[i] = ((this.mt[i]! ^ mul32(s, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]!;
        i = 1;
      }
    }

    this.mt[0] = 0x80000000; // MSB is 1; assuring non-zero initial array
  }

  /**
   * Initialize the generator with a seed.
   * @param seed - Integer seed value
   */
  seed(seed: number): void {
    // Convert to 32-bit unsigned integer
    seed = seed >>> 0;
    // Python uses init_by_array even for single integers
    this.initByArray([seed]);
  }

  /**
   * Generate a random 32-bit unsigned integer.
   */
  private genrandInt32(): number {
    let y: number;
    const mag01 = new Uint32Array([0, MATRIX_A]);

    if (this.mti >= N) {
      let kk: number;

      for (kk = 0; kk < N - M; kk++) {
        y = (this.mt[kk]! & UPPER_MASK) | (this.mt[kk + 1]! & LOWER_MASK);
        this.mt[kk] = this.mt[kk + M]! ^ (y >>> 1) ^ mag01[y & 1]!;
      }
      for (; kk < N - 1; kk++) {
        y = (this.mt[kk]! & UPPER_MASK) | (this.mt[kk + 1]! & LOWER_MASK);
        this.mt[kk] = this.mt[kk + (M - N)]! ^ (y >>> 1) ^ mag01[y & 1]!;
      }
      y = (this.mt[N - 1]! & UPPER_MASK) | (this.mt[0]! & LOWER_MASK);
      this.mt[N - 1] = this.mt[M - 1]! ^ (y >>> 1) ^ mag01[y & 1]!;

      this.mti = 0;
    }

    y = this.mt[this.mti++]!;

    // Tempering
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;

    return y >>> 0;
  }

  /**
   * Generate a random float in [0, 1) - matches Python's random.random()
   */
  random(): number {
    // Use 53 bits of precision like Python
    const a = this.genrandInt32() >>> 5; // 27 bits
    const b = this.genrandInt32() >>> 6; // 26 bits
    return (a * 67108864.0 + b) / 9007199254740992.0; // 2^53
  }

  /**
   * Generate a random float in [a, b) - matches Python's random.uniform(a, b)
   */
  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }

  /**
   * Generate a random integer in [a, b] inclusive
   */
  randint(a: number, b: number): number {
    return Math.floor(this.uniform(a, b + 1));
  }

  /**
   * Get the internal state for saving/restoring.
   * Returns a copy of the state array and current index.
   */
  getState(): { mt: Uint32Array; mti: number } {
    return {
      mt: new Uint32Array(this.mt),
      mti: this.mti,
    };
  }

  /**
   * Restore the internal state from a previous save.
   */
  setState(state: { mt: Uint32Array; mti: number }): void {
    this.mt = new Uint32Array(state.mt);
    this.mti = state.mti;
  }

  /**
   * Clone this random generator with the same state.
   */
  clone(): SeededRandom {
    const clone = new SeededRandom(0);
    clone.setState(this.getState());
    return clone;
  }
}

/**
 * Generate a random number in range [lower, upper)
 * This is a convenience function matching the Python implementation.
 */
export function randInRange(
  rng: SeededRandom,
  lower: number,
  upper: number,
): number {
  return rng.random() * (upper - lower) + lower;
}
