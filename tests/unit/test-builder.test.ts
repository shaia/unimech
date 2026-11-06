import { describe, expect, it } from 'vitest';
import { buildTest, rng, type PoolItem } from '~/assessment/test-builder';

const item = (id: string, objectives: string[], level: PoolItem['level'] = 'basic'): PoolItem => ({ id, objectives, level });

const pool: PoolItem[] = [
  item('a1', ['O1']),
  item('a2', ['O1']),
  item('a3', ['O1'], 'mid'),
  item('b1', ['O2']),
  item('b2', ['O2'], 'bagrut'),
  item('c1', ['O3']),
  item('ab', ['O1', 'O2'], 'mid'),
  item('d1', ['O4']),
  item('d2', ['O4']),
  item('e1', ['O-other']),
];
const objectives = ['O1', 'O2', 'O3', 'O4'];

describe('buildTest', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(buildTest(pool, objectives, 7).ids).toEqual(buildTest(pool, objectives, 7).ids);
    const variants = new Set([1, 2, 3, 4, 5, 6].map((s) => buildTest(pool, objectives, s, 6).ids.join()));
    expect(variants.size).toBeGreaterThan(1);
  });

  it('covers every objective at least once, for many seeds', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { ids } = buildTest(pool, objectives, seed, 5);
      const picked = pool.filter((p) => ids.includes(p.id));
      for (const o of objectives) expect(picked.some((p) => p.objectives.includes(o))).toBe(true);
    }
  });

  it('never repeats a question and respects the size', () => {
    const { ids } = buildTest(pool, objectives, 3, 7);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(7);
  });

  it('grows past the size when coverage needs it, and shrinks to a small pool', () => {
    expect(buildTest(pool, objectives, 1, 2).ids.length).toBeGreaterThanOrEqual(3);
    const tiny = [item('x', ['O1']), item('y', ['O2'])];
    expect(buildTest(tiny, ['O1', 'O2'], 1, 10).ids).toHaveLength(2);
  });

  it('reports an objective the pool cannot cover instead of failing', () => {
    const r = buildTest(pool, [...objectives, 'O9'], 1);
    expect(r.uncovered).toEqual(['O9']);
    expect(r.ids.length).toBeGreaterThan(0);
  });

  it('orders easy to hard', () => {
    const { ids } = buildTest(pool, objectives, 11, 10);
    const rank = { basic: 0, mid: 1, bagrut: 2 };
    const levels = ids.map((id) => rank[pool.find((p) => p.id === id)!.level]);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});

describe('rng', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
