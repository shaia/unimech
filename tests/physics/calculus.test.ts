import { describe, expect, it } from 'vitest';
import { accumulate, derivative, riemann, riemannPieces, secantSlope, tangentLine } from '~/physics/calculus';
import { relativeError } from '~/physics/vec';

describe('analytic limits', () => {
  it('the derivative of a power x^n is n·x^(n−1)', () => {
    for (const n of [2, 3, 5]) expect(relativeError(derivative((x) => x ** n, 1.7), n * 1.7 ** (n - 1))).toBeLessThan(1e-8);
  });

  it('the derivative of sin is cos, and of cos is −sin', () => {
    expect(relativeError(derivative(Math.sin, 0.4), Math.cos(0.4))).toBeLessThan(1e-8);
    expect(relativeError(derivative(Math.cos, 0.4), -Math.sin(0.4))).toBeLessThan(1e-8);
  });

  it('the chain rule: d/dx sin(3x²) = cos(3x²)·6x', () => {
    const x = 0.8;
    expect(relativeError(derivative((t) => Math.sin(3 * t * t), x), Math.cos(3 * x * x) * 6 * x)).toBeLessThan(1e-7);
  });

  it('the integral of x² from 0 to 3 is 9, of sin from 0 to π is 2', () => {
    expect(relativeError(riemann((x) => x * x, 0, 3, 1000), 9)).toBeLessThan(1e-6);
    expect(relativeError(riemann(Math.sin, 0, Math.PI, 1000), 2)).toBeLessThan(1e-6);
  });

  it('the area under a constant is height × width for every rule', () => {
    for (const rule of ['left', 'right', 'mid', 'trapezoid'] as const) expect(riemann(() => 4, 1, 3.5, 7, rule)).toBeCloseTo(10, 12);
  });

  it('the tangent line touches the curve and has its slope', () => {
    const f = (x: number) => x ** 3;
    const t = tangentLine(f, 2);
    expect(t(2)).toBeCloseTo(8, 10);
    expect(relativeError(t(3) - t(2), 12)).toBeLessThan(1e-8);
  });
});

describe('conservation (fundamental theorem)', () => {
  it('the accumulated integral of f has f as its derivative', () => {
    const f = (x: number) => Math.cos(x) + x;
    const { x, F } = accumulate(f, 0, 2, 4000);
    const i = 2000;
    const slope = (F[i + 1] - F[i - 1]) / (x[i + 1] - x[i - 1]);
    expect(relativeError(slope, f(x[i]))).toBeLessThan(1e-5);
  });

  it('the integral of a derivative is the change in the function', () => {
    const f = (x: number) => Math.exp(0.5 * x);
    const df = (x: number) => derivative(f, x);
    expect(relativeError(riemann(df, 0, 2, 2000), f(2) - f(0))).toBeLessThan(1e-6);
  });

  it('the pieces add up to the sum', () => {
    const pieces = riemannPieces(Math.sin, 0, 2, 13, 'left');
    const s = pieces.reduce((a, p) => a + p.height * (p.x1 - p.x0), 0);
    expect(s).toBeCloseTo(riemann(Math.sin, 0, 2, 13, 'left'), 12);
  });
});

describe('convergence', () => {
  const exact = 9;
  const f = (x: number) => x * x;
  const err = (n: number, rule: 'left' | 'mid' | 'trapezoid') => Math.abs(riemann(f, 0, 3, n, rule) - exact);

  it('left sums converge as 1/N: doubling N halves the error', () => {
    expect(err(100, 'left') / err(200, 'left')).toBeCloseTo(2, 1);
  });

  it('midpoint and trapezoid sums converge as 1/N²: doubling N quarters the error', () => {
    expect(err(100, 'mid') / err(200, 'mid')).toBeCloseTo(4, 2);
    expect(err(100, 'trapezoid') / err(200, 'trapezoid')).toBeCloseTo(4, 2);
  });

  it('the secant slope approaches the derivative as h shrinks, with error ∝ h', () => {
    const f = (x: number) => x ** 3;
    const e1 = Math.abs(secantSlope(f, 1, 1e-2) - 3);
    const e2 = Math.abs(secantSlope(f, 1, 5e-3) - 3);
    expect(e1 / e2).toBeCloseTo(2, 1);
  });
});

describe('scaling', () => {
  it('the integral is linear: doubling f doubles the area', () => {
    expect(riemann((x) => 2 * Math.exp(x), 0, 1, 500)).toBeCloseTo(2 * riemann(Math.exp, 0, 1, 500), 12);
  });

  it('reversing the limits flips the sign', () => {
    expect(riemann(Math.exp, 1, 0, 500)).toBeCloseTo(-riemann(Math.exp, 0, 1, 500), 12);
  });
});
