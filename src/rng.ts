/*
 * Random numbers. Anything that changes the game (a fight, a roll, a bot's army) takes an Rng made from a
 * seed, so it can be replayed and simulated headless. Effects (sparks, wobbles, which death) use the cosmetic
 * generator below, so tuning an effect never changes how a fight goes.
 */

export interface Rng {
  /** 0 <= n < 1 */
  next(): number;
  /** a <= n < b */
  range(a: number, b: number): number;
  /** whole number, a <= n <= b */
  int(a: number, b: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  /** index picked by weight (weights need not sum to 1) */
  weighted(weights: readonly number[]): number;
  /** a new generator split off this one (does not disturb this one's later numbers more than one draw) */
  fork(): Rng;
}

/** mulberry32 */
export function makeRng(seed: number): Rng {
  let s = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (weights) => {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r < 0 && weights[i] > 0) return i;
      }
      return Math.max(0, weights.findIndex((w) => w > 0));
    },
    fork: () => makeRng(Math.floor(next() * 4294967296)),
  };
  return rng;
}

/** Mixes numbers into one seed. */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

// ------------------------------------------------------------------ cosmetic randomness

let fs = 0x9e3779b9;
/** Cosmetic random number in a..b (never use it for anything that changes the game). */
export const frand = (a: number, b: number) => {
  fs ^= fs << 13;
  fs ^= fs >>> 17;
  fs ^= fs << 5;
  return a + ((fs >>> 0) / 4294967296) * (b - a);
};
export const fpick = <T>(arr: readonly T[]): T => arr[Math.floor(frand(0, arr.length))];
export const fchance = (p: number) => frand(0, 1) < p;
export const fseed = (s: number) => {
  fs = s >>> 0 || 0x9e3779b9;
};
