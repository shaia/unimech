/**
 * Drawing a chapter test: pure and seeded, so the same seed always gives the same test and the
 * rules are unit-tested. Every objective gets at least one question when the pool has one;
 * the rest of the test is filled to favour objectives with the fewest questions so far.
 */

export interface PoolItem {
  id: string;
  objectives: string[];
  level: 'basic' | 'mid' | 'bagrut';
}

/** mulberry32: a small seeded generator, enough for shuffling. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BuiltTest {
  ids: string[];
  /** objectives for which the pool has no question at all */
  uncovered: string[];
}

const LEVEL_RANK = { basic: 0, mid: 1, bagrut: 2 } as const;

/**
 * @param pool        every question the test may draw
 * @param objectives  the objectives the test must cover
 * @param size        how many questions to aim for (never fewer than coverage needs)
 */
export function buildTest(pool: readonly PoolItem[], objectives: readonly string[], seed: number, size = 10): BuiltTest {
  const rand = rng(seed);
  const wanted = new Set(objectives);
  const count = (o: string) => pool.filter((p) => p.objectives.includes(o)).length;
  const uncovered = objectives.filter((o) => count(o) === 0);
  const chosen: PoolItem[] = [];
  const covered = new Set<string>();
  const covers = (p: PoolItem) => p.objectives.filter((o) => wanted.has(o));

  // rarest objectives first, so a topic with one question is never crowded out
  const order = objectives.filter((o) => count(o) > 0).sort((a, b) => count(a) - count(b) || a.localeCompare(b));
  for (const o of order) {
    if (covered.has(o)) continue;
    const cands = pool.filter((p) => p.objectives.includes(o) && !chosen.includes(p));
    const best = pick(cands, (p) => covers(p).filter((x) => !covered.has(x)).length + rand() * 0.9);
    chosen.push(best);
    covers(best).forEach((x) => covered.add(x));
  }

  const target = Math.min(pool.length, Math.max(size, chosen.length));
  while (chosen.length < target) {
    const load = (o: string) => chosen.filter((p) => p.objectives.includes(o)).length;
    const cands = pool.filter((p) => !chosen.includes(p));
    const best = pick(cands, (p) => {
      const os = covers(p);
      const worst = os.length ? Math.max(...os.map(load)) : 99;
      return 1 / (1 + worst) + rand() * 0.6;
    });
    chosen.push(best);
  }

  // easy to hard, shuffled within a level
  const key = new Map(chosen.map((p) => [p.id, rand()]));
  chosen.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || key.get(a.id)! - key.get(b.id)!);
  return { ids: chosen.map((p) => p.id), uncovered };
}

function pick<T>(items: readonly T[], score: (t: T) => number): T {
  let best = items[0];
  let bestScore = -Infinity;
  for (const it of items) {
    const s = score(it);
    if (s > bestScore) {
      best = it;
      bestScore = s;
    }
  }
  return best;
}
