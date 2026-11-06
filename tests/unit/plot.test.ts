import { describe, expect, it } from 'vitest';
import { decadeTicks, insetBox, makePlot, niceTicks } from '~/sims/core/plot';

describe('plot mapping', () => {
  const box = { x: 50, y: 10, w: 200, h: 100 };

  it('a linear axis maps its ends to the box edges, y growing upward', () => {
    const p = makePlot(box, { min: 0, max: 10 }, { min: 0, max: 4 });
    expect(p.px(0)).toBe(50);
    expect(p.px(10)).toBe(250);
    expect(p.py(0)).toBe(110);
    expect(p.py(4)).toBe(10);
    expect(p.px(5)).toBe(150);
  });

  it('the axis always runs left to right: a larger value is never further left', () => {
    const p = makePlot(box, { min: 1, max: 100, scale: 'log' }, { min: 1, max: 1e6, scale: 'log' });
    expect(p.px(2)).toBeGreaterThan(p.px(1));
    expect(p.py(1e3)).toBeLessThan(p.py(10));
  });

  it('a log axis puts equal ratios at equal distances', () => {
    const p = makePlot(box, { min: 1, max: 1000, scale: 'log' }, { min: 1, max: 1000, scale: 'log' });
    expect(p.px(10) - p.px(1)).toBeCloseTo(p.px(1000) - p.px(100), 9);
    expect(p.px(10)).toBeCloseTo(50 + 200 / 3, 9);
  });

  it('insetBox reserves the margins', () => {
    expect(insetBox({ x: 0, y: 0, w: 300, h: 200 }, { l: 50, r: 10, t: 8, b: 40 })).toEqual({ x: 50, y: 8, w: 240, h: 152 });
  });
});

describe('ticks', () => {
  it('niceTicks gives 1-2-5 steps inside the range', () => {
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(10, 60, 5)).toEqual([10, 20, 30, 40, 50, 60]);
    const t = niceTicks(0, 1.6, 4);
    expect(t[0]).toBe(0);
    expect(t.every((v) => v >= 0 && v <= 1.6)).toBe(true);
  });

  it('decadeTicks lists powers of ten and thins a very long range', () => {
    expect(decadeTicks(1, 1e4)).toEqual([1, 10, 100, 1000, 1e4]);
    const wide = decadeTicks(1e-50, 1e-10);
    expect(wide.length).toBeLessThanOrEqual(7);
    expect(wide[0]).toBe(1e-50);
  });
});
