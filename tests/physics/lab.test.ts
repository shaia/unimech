import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  DATASETS,
  fallDistance,
  fallTime,
  fitLine,
  fitThroughOrigin,
  measure,
  seededRandom,
  springLength,
  TRANSFORMS,
  type Transform,
} from '~/physics/lab';
import { relativeError } from '~/physics/vec';

const range = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

describe('analytic limits', () => {
  it('the least-squares line through exact points is the line itself', () => {
    const xs = [0, 1, 2, 3, 4];
    const { slope, intercept } = fitLine(xs, xs.map((x) => 0.02 * x + 0.12));
    expect(relativeError(slope, 0.02)).toBeLessThan(1e-12);
    expect(relativeError(intercept, 0.12)).toBeLessThan(1e-12);
    expect(relativeError(fitThroughOrigin(xs, xs.map((x) => 7.5 * x)), 7.5)).toBeLessThan(1e-12);
  });

  it('free fall plotted as d against t² is a line of slope g/2 through the origin', () => {
    const ts = range(6, 0.1, 0.5);
    const line = fitLine(ts.map(TRANSFORMS.x2), ts.map(fallDistance));
    expect(relativeError(line.slope, G / 2)).toBeLessThan(1e-12);
    expect(Math.abs(line.intercept)).toBeLessThan(1e-12);
    expect(relativeError(fallDistance(fallTime(0.8)), 0.8)).toBeLessThan(1e-12);
  });

  it('a fall time read for set heights, plotted as t² against d, is a line of slope 2/g', () => {
    const ds = range(6, 0.2, 1.6);
    const slope = fitThroughOrigin(ds, ds.map((d) => fallTime(d) ** 2));
    expect(relativeError(slope, 2 / G)).toBeLessThan(1e-12);
  });

  it('a spring under no load has its natural length: the intercept', () => {
    expect(springLength(0, 0.12, 50)).toBe(0.12);
  });
});

describe('fit identities (the least-squares conditions)', () => {
  it('residuals sum to zero and are uncorrelated with x', () => {
    const xs = range(9, 1, 5);
    const ys = measure((x) => 3 * x + 1, xs, 0.05, 42);
    const { slope, intercept } = fitLine(xs, ys);
    const res = xs.map((x, i) => ys[i] - (slope * x + intercept));
    const scale = Math.max(...ys);
    expect(Math.abs(res.reduce((a, r) => a + r, 0)) / scale).toBeLessThan(1e-12);
    expect(Math.abs(res.reduce((a, r, i) => a + r * xs[i], 0)) / (scale * 5)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('scaling y by c scales slope and intercept by c; scaling x by c divides the slope by c', () => {
    const xs = [1, 2, 3, 5, 8];
    const ys = [2.1, 3.9, 6.2, 9.8, 16.1];
    const base = fitLine(xs, ys);
    const ty = fitLine(xs, ys.map((y) => 1e-6 * y));
    expect(relativeError(ty.slope, 1e-6 * base.slope)).toBeLessThan(1e-12);
    expect(relativeError(ty.intercept, 1e-6 * base.intercept)).toBeLessThan(1e-12);
    const tx = fitLine(xs.map((x) => 100 * x), ys);
    expect(relativeError(tx.slope, base.slope / 100)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the fitted slope approaches the true slope as noisy readings accumulate', () => {
    // RMS over 20 tables: one table can be lucky, the average error falls like 1/√n
    const err = (n: number) => {
      const xs = range(n, 1, 10);
      let s = 0;
      for (let seed = 1; seed <= 20; seed++) s += relativeError(fitLine(xs, measure((x) => 2 * x, xs, 0.05, seed)).slope, 2) ** 2;
      return Math.sqrt(s / 20);
    };
    expect(err(10000)).toBeLessThan(err(10) / 10);
    expect(err(10000)).toBeLessThan(1e-3);
  });
});

describe('measurements', () => {
  it('are reproducible for a seed and stay within the stated scatter', () => {
    const xs = range(50, 1, 2);
    const a = measure((x) => x, xs, 0.02, 3);
    expect(measure((x) => x, xs, 0.02, 3)).toEqual(a);
    a.forEach((v, i) => expect(relativeError(v, xs[i])).toBeLessThanOrEqual(0.02 + 1e-12));
    const r = seededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const u = r();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('the spring’s L–F line meets the L axis at the natural length and rises with slope 1/k', () => {
    const d = DATASETS.spring;
    const { slope, intercept } = fitLine(d.x, d.y);
    expect(relativeError(intercept, 0.12)).toBeLessThan(0.02);
    expect(relativeError(slope, 1 / 50)).toBeLessThan(0.05);
  });

  it('each lesson dataset is straight only under its own transform, and its slope is the law', () => {
    for (const d of Object.values(DATASETS)) {
      const curvature = (t: Transform) => {
        const X = d.x.map(TRANSFORMS[t]);
        const { slope, intercept } = fitLine(X, d.y);
        const span = Math.max(...d.y) - Math.min(...d.y);
        return Math.max(...d.y.map((y, i) => Math.abs(y - (slope * X[i] + intercept)))) / span;
      };
      expect(curvature(d.linear)).toBeLessThan(0.03);
      const X = d.x.map(TRANSFORMS[d.linear]);
      expect(relativeError(fitLine(X, d.y).slope, d.law.slope)).toBeLessThan(0.04);
    }
  });
});
