/**
 * Seeded, deterministic PRNG (ADR-011).
 *
 * Every randomized system in the game draws from here, never from `Math.random`. The RNG
 * state is a single serializable integer that lives in `GameState`, so a save fully
 * determines the random sequence that follows it — which is what lets a server-side replay
 * validator be added later without breaking determinism.
 *
 * Implementation is mulberry32: a fast 32-bit generator with good statistical properties for
 * game use. The state is exposed so a tick can read it out and store it back, keeping the
 * `tick` function pure at its boundary while allowing imperative draws internally.
 */

/** The full serializable state of the generator: a single unsigned 32-bit integer. */
export type RngState = number;

/** Hash an arbitrary string seed into an initial 32-bit RNG state (xfnv1a). */
export function hashSeed(seed: string): RngState {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** An imperative draw interface over a snapshot of RNG state. */
export interface Rng {
  /** Next float in [0, 1). */
  float(): number;
  /** Next integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Next float in [min, max). */
  range(min: number, max: number): number;
  /** Returns true with the given probability p (0..1). */
  chance(p: number): boolean;
  /** The current serializable state — store this back into GameState after a tick. */
  readonly state: RngState;
}

/** Create an Rng from a serializable state. Draws advance an internal copy of that state. */
export function makeRng(initial: RngState): Rng {
  let s = initial >>> 0;

  const float = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    float,
    int: (maxExclusive: number): number => Math.floor(float() * maxExclusive),
    range: (min: number, max: number): number => min + float() * (max - min),
    chance: (p: number): boolean => float() < p,
    get state(): RngState {
      return s;
    },
  };
}
