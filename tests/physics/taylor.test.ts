import { describe, expect, it } from 'vitest';
import { derivative } from '~/physics/calculus';
import {
  COS,
  LN1P,
  SIN,
  TAYLOR_PRESETS,
  THROW,
  binomial,
  centralDifference,
  expOf,
  firstNeglectedTerm,
  powerOf,
  secant,
  taylorCoefficients,
  taylorOf,
  throwHeight,
  throwVelocity,
  validInterval,
  vectorDerivative,
  type Expandable,
} from '~/physics/taylor';
import { relativeError } from '~/physics/vec';

const presets = Object.entries(TAYLOR_PRESETS) as [string, Expandable][];

describe('analytic limits', () => {
  it('every closed-form derivative of the presets agrees with a numerical derivative', () => {
    for (const [name, g] of presets) {
      for (const x of [0, 0.3, 0.8]) {
        for (let k = 0; k <= 3; k++) {
          const numeric = derivative((t) => g.d(t, k), x, 1e-5);
          expect(relativeError(numeric, g.d(x, k + 1)), `${name}, k = ${k}, x = ${x}`).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('a Taylor polynomial has the value and the first n derivatives of the function at x₀', () => {
    for (const [name, g] of presets) {
      const x0 = 0.4;
      const P = taylorOf(g, x0, 3);
      expect(relativeError(P(x0), g.d(x0, 0)), name).toBeLessThan(1e-12);
      expect(relativeError(derivative(P, x0, 1e-4), g.d(x0, 1)), name).toBeLessThan(1e-7);
      const second = (P(x0 + 1e-3) - 2 * P(x0) + P(x0 - 1e-3)) / 1e-6;
      expect(relativeError(second, g.d(x0, 2)), name).toBeLessThan(1e-5);
    }
  });

  it('the standard expansions about 0: sin θ ≈ θ − θ³/6, cos θ ≈ 1 − θ²/2, e^(−x) ≈ 1 − x + x²/2, ln(1 + x) ≈ x − x²/2', () => {
    const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 12));
    near(taylorCoefficients(SIN, 0, 3), [0, 1, 0, -1 / 6]);
    near(taylorCoefficients(COS, 0, 3), [1, 0, -1 / 2, 0]);
    near(taylorCoefficients(expOf(-1), 0, 3), [1, -1, 1 / 2, -1 / 6]);
    near(taylorCoefficients(LN1P, 0, 3), [0, 1, -1 / 2, 1 / 3]);
  });

  it('the binomial coefficients of (1 + x)ⁿ are those of the Taylor expansion, for n = ½, −2 and −½', () => {
    for (const n of [0.5, -2, -0.5]) {
      const c = taylorCoefficients(powerOf(n), 0, 4);
      for (let k = 0; k <= 4; k++) expect(c[k]).toBeCloseTo(binomial(n, k), 12);
    }
    // √(1 + x) ≈ 1 + x/2 − x²/8; 1/(1 + x)² ≈ 1 − 2x + 3x²
    expect(binomial(0.5, 2)).toBeCloseTo(-1 / 8, 14);
    expect(binomial(-2, 2)).toBeCloseTo(3, 14);
  });

  it('at the top of the throw the tangent is horizontal: ẏ = 0 at t = v₀/g', () => {
    const tTop = THROW.v0 / THROW.g;
    expect(Math.abs(derivative(throwHeight, tTop))).toBeLessThan(1e-8);
    expect(throwVelocity(tTop)).toBeCloseTo(0, 12);
  });
});

describe('identities', () => {
  it('the chain rule: d/dt √(d² + v²t²) = v²t/√(d² + v²t²)', () => {
    const d = 30;
    const v = 20;
    const r = (t: number) => Math.sqrt(d * d + v * v * t * t);
    for (const t of [0.5, 2, 7]) expect(relativeError(derivative(r, t), (v * v * t) / r(t))).toBeLessThan(1e-8);
  });

  it('the chain rule: d/dt cos ωt = −ω sin ωt, so the derivative carries the extra factor ω', () => {
    const w = 4;
    for (const t of [0.1, 0.7]) expect(relativeError(derivative((s) => Math.cos(w * s), t), -w * Math.sin(w * t))).toBeLessThan(1e-8);
  });

  it('a vector is differentiated component by component: on a circle a = −ω²r, though |v| is constant', () => {
    const R = 1.5;
    const w = 2;
    const r = (t: number): [number, number] => [R * Math.cos(w * t), R * Math.sin(w * t)];
    const v = (t: number) => vectorDerivative(r, t, 1e-4);
    for (const t of [0.2, 1.1]) {
      const a = vectorDerivative(v, t, 1e-4);
      const p = r(t);
      expect(relativeError(a[0], -w * w * p[0])).toBeLessThan(1e-5);
      expect(relativeError(a[1], -w * w * p[1])).toBeLessThan(1e-5);
      expect(relativeError(Math.hypot(...v(t)), R * w)).toBeLessThan(1e-8);
      // |v| constant ⇔ v ⊥ a
      const vt = v(t);
      expect(Math.abs(vt[0] * a[0] + vt[1] * a[1])).toBeLessThan(1e-5 * R * R * w ** 3);
    }
  });

  it('for a parabola y(t) the forward secant is off by exactly ½·(−g)·h, and the central difference is exact', () => {
    const t0 = 1;
    for (const h of [1, 0.5, 0.1, -0.5]) {
      expect(secant(throwHeight, t0, h) - throwVelocity(t0)).toBeCloseTo(-0.5 * THROW.g * h, 10);
      expect(centralDifference(throwHeight, t0, h)).toBeCloseTo(throwVelocity(t0), 10);
    }
  });

  it('the first neglected term of sin θ ≈ θ is −θ³/6 (order 3, not 2), and of cos θ ≈ 1 − θ²/2 it is θ⁴/24', () => {
    const s = firstNeglectedTerm(SIN, 0, 1, 0.2);
    expect(s.order).toBe(3);
    expect(s.value).toBeCloseTo(-(0.2 ** 3) / 6, 14);
    const c = firstNeglectedTerm(COS, 0, 2, 0.5);
    expect(c.order).toBe(4);
    expect(c.value).toBeCloseTo(0.5 ** 4 / 24, 14);
  });
});

describe('scaling', () => {
  it('the error of the order-n polynomial shrinks like |x − x₀|ⁿ⁺¹: halving the distance divides it by 2ⁿ⁺¹', () => {
    const g = expOf(-1);
    for (const n of [1, 2, 3]) {
      const P = taylorOf(g, 0, n);
      const err = (x: number) => Math.abs(P(x) - g.d(x, 0));
      const ratio = err(0.02) / err(0.01);
      expect(relativeError(ratio, 2 ** (n + 1))).toBeLessThan(0.02);
    }
  });

  it('near x₀ the error equals the first neglected term (their ratio → 1)', () => {
    for (const [name, g] of presets) {
      for (const n of [1, 2]) {
        const x = 0.01;
        const P = taylorOf(g, 0, n);
        const t = firstNeglectedTerm(g, 0, n, x);
        expect(relativeError(g.d(x, 0) - P(x), t.value), `${name}, order ${n}`).toBeLessThan(0.05);
      }
    }
  });

  it('the forward secant error is ∝ h and the central-difference error ∝ h² (for e^(−x) about 1)', () => {
    const f = (x: number) => Math.exp(-x);
    const exact = -Math.exp(-1);
    const fwd = (h: number) => Math.abs(secant(f, 1, h) - exact);
    const ctr = (h: number) => Math.abs(centralDifference(f, 1, h) - exact);
    expect(relativeError(fwd(0.02) / fwd(0.01), 2)).toBeLessThan(0.02);
    expect(relativeError(ctr(0.02) / ctr(0.01), 4)).toBeLessThan(0.02);
  });

  it('(1 + x)ⁿ ≈ 1 + nx needs |nx| ≪ 1, not just |x| ≪ 1: with x = 0.001, n = 2000 it is off by a factor 2.5', () => {
    const exact = 1.001 ** 2000;
    const linear = taylorOf(powerOf(2000), 0, 1)(0.001);
    expect(linear).toBeCloseTo(3, 10);
    expect(relativeError(exact, Math.exp(2000 * Math.log1p(0.001)))).toBeLessThan(1e-12);
    expect(exact / linear).toBeGreaterThan(2.4);
    // with n = 20 the same x is fine
    expect(relativeError(1.001 ** 20, taylorOf(powerOf(20), 0, 1)(0.001))).toBeLessThan(2e-4);
  });
});

describe('convergence', () => {
  it('the secant slope converges to the derivative as h → 0, from both sides', () => {
    const t0 = 1;
    const v = throwVelocity(t0);
    let last = Infinity;
    for (const h of [1, 0.1, 0.01, 0.001]) {
      const e = Math.abs(secant(throwHeight, t0, h) - v);
      expect(e).toBeLessThan(last);
      last = e;
      expect(secant(throwHeight, t0, h)).toBeLessThan(v);
      expect(secant(throwHeight, t0, -h)).toBeGreaterThan(v);
    }
    expect(last).toBeLessThan(0.005);
  });

  it('sin θ ≈ θ is within 1% up to 14.0° (θ²/6 = 0.01 gives 0.245 rad)', () => {
    const r = validInterval(SIN, 0, 1, 0.01, [-Math.PI, Math.PI]);
    expect(r.hiBounded && r.loBounded).toBe(true);
    expect((r.hi * 180) / Math.PI).toBeCloseTo(13.99, 1);
    expect(r.lo).toBeCloseTo(-r.hi, 9);
    expect(relativeError(r.hi, Math.sqrt(0.06))).toBeLessThan(0.005);
  });

  it('inside the radius of convergence a higher order widens the 1% interval (√(1 + x), e^(−x), cos θ)', () => {
    for (const [g, win] of [
      [powerOf(0.5), [-0.95, 3]],
      [expOf(-1), [-2, 4]],
      [COS, [-1.5, 1.5]],
    ] as [Expandable, [number, number]][]) {
      const w1 = validInterval(g, 0, 1, 0.01, win);
      const w3 = validInterval(g, 0, 3, 0.01, win);
      expect(w3.hi).toBeGreaterThan(w1.hi);
      expect(w3.lo).toBeLessThan(w1.lo);
    }
  });

  it('beyond the radius of convergence a higher order does not help: ln(1 + x) at x = 2', () => {
    const err = (n: number) => Math.abs(taylorOf(LN1P, 0, n)(2) - Math.log(3));
    expect(err(3)).toBeGreaterThan(err(1));
    expect(err(6)).toBeGreaterThan(err(3));
  });
});
