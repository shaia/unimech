/**
 * Deterministic shuffling of answer choices. Authors tend to write the correct choice first;
 * students notice. The order is seeded by the question id, so it is the same on every build and
 * for every student, and grading (which indexes into the shuffled array) never sees the YAML order.
 */

/** 32-bit FNV-1a hash of a string: the seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, well-mixed PRNG returning floats in [0, 1). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Fisher–Yates permutation of `items`, fixed by `key`. The input is not modified. */
export function seededShuffle<T>(items: readonly T[], key: string): T[] {
  const out = [...items];
  const next = rng(hash(key));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
