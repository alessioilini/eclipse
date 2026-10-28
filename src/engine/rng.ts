export type Rng = {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  pick<T>(arr: T[]): T;
  /** Fisher-Yates on a copy; the input is not mutated. */
  shuffle<T>(arr: T[]): T[];
  /** Current 32-bit state (for saving in MatchState.rngState). */
  state(): number;
};

/** Seeded PRNG (mulberry32). Passing a previously saved state() as seed resumes the sequence. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive);

  const pick = <T>(arr: T[]): T => {
    if (arr.length === 0) throw new Error('rng.pick: empty array');
    return arr[int(arr.length)] as T;
  };

  const shuffle = <T>(arr: T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };

  return { next, int, pick, shuffle, state: () => s };
}

/**
 * Restores an Rng from a value previously returned by `state()` (e.g. MatchState.rngState).
 * mulberry32's whole state is that 32-bit integer, so the generator resumes exactly where it stopped.
 */
export function createRngFromState(state: number): Rng {
  return createRng(state);
}
