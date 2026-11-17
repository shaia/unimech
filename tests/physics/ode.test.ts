import { describe, expect, it } from 'vitest';
import {
  charPoly,
  charRoots,
  emptyTime,
  fromRoots,
  integrate,
  regime,
  relaxRhs,
  relaxSolution,
  relaxTime,
  solveSecondOrder,
  tankK,
  tankRhs,
  tankSolution,
  zeroCrossings,
} from '~/physics/ode';
import { relativeError } from '~/physics/vec';

/** ẍ + γẋ + ω₀²x of a function, by central differences, relative to the size of its terms. */
function residual2(x: (t: number) => number, gamma: number, w2: number, t: number, h = 1e-4) {
  const xp = x(t + h);
  const x0 = x(t);
  const xm = x(t - h);
  const xd = (xp - xm) / (2 * h);
  const xdd = (xp - 2 * x0 + xm) / (h * h);
  const r = xdd + gamma * xd + w2 * x0;
  return Math.abs(r) / Math.max(Math.abs(xdd), Math.abs(gamma * xd), Math.abs(w2 * x0), 1e-12);
}

/** ẏ − f(t, y) of a function, by central differences, relative to |ẏ|. */
function residual1(y: (t: number) => number, f: (t: number, y: number) => number, t: number, h = 1e-5) {
  const yd = (y(t + h) - y(t - h)) / (2 * h);
  return Math.abs(yd - f(t, y(t))) / Math.max(Math.abs(yd), 1e-12);
}

const CASES: [string, number, number][] = [
  ['two real roots', 10, 9],
  ['a double root', 6, 9],
  ['complex roots', 1, 9],
  ['no damping', 0, 9],
  ['an unstable equilibrium (ω₀² < 0)', 0, -4],
];

describe('analytic limits', () => {
  it('relaxation with y_eq = 0 is pure exponential decay: after one τ, a fraction 1/e is left', () => {
    const y = relaxSolution(0, 5, 0, 6);
    expect(relativeError(y(5), 6 / Math.E)).toBeLessThan(1e-12);
  });

  it('relaxation starts at its initial value and tends to the equilibrium, not to zero', () => {
    const T = relaxSolution(20, 10, 0, 90);
    expect(relativeError(T(0), 90)).toBeLessThan(1e-12);
    expect(relativeError(T(1e3), 20)).toBeLessThan(1e-12);
    // the cooling cup of the lesson's ladder: 20 + 70e^(−1.5) after 15 min
    expect(relativeError(T(15), 35.6)).toBeLessThan(2e-3);
  });

  it('as τ → ∞ the relaxation stops: y stays at y₀', () => {
    const y = relaxSolution(20, 1e12, 0, 90);
    expect(relativeError(y(40), 90)).toBeLessThan(1e-9);
  });

  it('a barrel of k = 0.020 m^½/s empties from 1.0 m in 2√h₀/k = 100 s, and stays empty', () => {
    expect(relativeError(emptyTime(0.02, 1), 100)).toBeLessThan(1e-12);
    const h = tankSolution(0.02, 0, 1);
    expect(h(100)).toBe(0);
    expect(h(150)).toBe(0);
    expect(relativeError(h(50), 0.25)).toBeLessThan(1e-12);
  });

  it('with no damping the roots are ±iω₀ and the solution is x₀cos ω₀t + (v₀/ω₀)sin ω₀t', () => {
    const [s1, s2] = charRoots(0, 9);
    expect(s1.re).toBe(-0);
    expect(relativeError(s1.im, 3)).toBeLessThan(1e-12);
    expect(relativeError(s2.im, -3)).toBeLessThan(1e-12);
    const sol = solveSecondOrder(0, 9, 0.1, 0.6);
    for (const t of [0.3, 1.1, 2.7]) expect(relativeError(sol.x(t), 0.1 * Math.cos(3 * t) + 0.2 * Math.sin(3 * t))).toBeLessThan(1e-12);
  });

  it('as γ → 2ω₀ from either side, the over- and under-damped solutions approach the double-root one', () => {
    const crit = solveSecondOrder(6, 9, 0.1, -0.5);
    expect(crit.regime).toBe('critical');
    const gap = (g: number) => Math.max(...[0.2, 0.7, 1.5].map((t) => Math.abs(solveSecondOrder(g, 9, 0.1, -0.5).x(t) - crit.x(t))));
    for (const sign of [1, -1]) {
      expect(solveSecondOrder(6 + sign * 1e-4, 9, 0.1, -0.5).regime).not.toBe('critical');
      // the gap closes in proportion to |γ − 2ω₀|
      expect(gap(6 + sign * 1e-4)).toBeLessThan(2e-6);
      expect(relativeError(gap(6 + sign * 1e-3) / gap(6 + sign * 1e-4), 10)).toBeLessThan(0.05);
    }
  });

  it('ẍ = κ²x (ω₀² < 0) has the real roots ±κ, and v₀ = −κx₀ picks the decaying one alone', () => {
    const [s1, s2] = charRoots(0, -9);
    expect(relativeError(s1.re, 3)).toBeLessThan(1e-12);
    expect(relativeError(s2.re, -3)).toBeLessThan(1e-12);
    const sol = solveSecondOrder(0, -9, 0.001, -0.003);
    expect(Math.abs(sol.C[0])).toBeLessThan(1e-15);
    expect(relativeError(sol.x(2), 0.001 * Math.exp(-6))).toBeLessThan(1e-9);
  });
});

describe('identities', () => {
  for (const [name, g, w2] of CASES) {
    it(`each root of ${name} solves s² + γs + ω₀² = 0, and Vieta gives γ and ω₀² back`, () => {
      const [s1, s2] = charRoots(g, w2);
      for (const s of [s1, s2]) {
        // p(s) at a complex s: (re² − im² + γre + ω₀²) + i(2 re im + γ im)
        const re = s.re * s.re - s.im * s.im + g * s.re + w2;
        const im = 2 * s.re * s.im + g * s.im;
        expect(Math.hypot(re, im)).toBeLessThan(1e-12 * Math.max(Math.abs(w2), g * g, 1));
      }
      const back = fromRoots(s1, s2);
      expect(Math.abs(back.gamma - g)).toBeLessThan(1e-12 * Math.max(g, 1));
      expect(relativeError(back.omega0sq, w2)).toBeLessThan(1e-12);
    });

    it(`the solution for ${name} solves the equation and meets x(0) = x₀, ẋ(0) = v₀`, () => {
      const sol = solveSecondOrder(g, w2, 0.1, -0.4);
      expect(relativeError(sol.x(0), 0.1)).toBeLessThan(1e-12);
      expect(relativeError(sol.v(0), -0.4)).toBeLessThan(1e-12);
      for (const t of [0.15, 0.6, 1.3]) {
        expect(residual2(sol.x, g, w2, t)).toBeLessThan(1e-5);
        expect(relativeError(sol.parts[0](t) + sol.parts[1](t), sol.x(t))).toBeLessThan(1e-12);
        const h = 1e-6;
        expect(relativeError((sol.x(t + h) - sol.x(t - h)) / (2 * h), sol.v(t))).toBeLessThan(1e-6);
      }
    });
  }

  it('the double root s₀ = −γ/2 makes both e^(s₀t) and te^(s₀t) solutions', () => {
    for (const x of [(t: number) => Math.exp(-3 * t), (t: number) => t * Math.exp(-3 * t)]) {
      for (const t of [0.1, 0.5, 1.2]) expect(residual2(x, 6, 9, t)).toBeLessThan(1e-5);
    }
    // and te^(st) is not a solution when the root is simple
    expect(residual2((t) => t * Math.exp(-1 * t), 10, 9, 0.5)).toBeGreaterThan(0.1);
  });

  it('the vertex of p(s) sits at s = −γ/2, and its height is ω_d² with the opposite sign', () => {
    const [s1] = charRoots(1, 9);
    expect(relativeError(charPoly(1, 9, -0.5), s1.im * s1.im)).toBeLessThan(1e-12);
  });

  it('the closed forms of the first-order models solve their equations', () => {
    const relax = relaxSolution(20, 10, 3, 90);
    const tank = tankSolution(0.02, 0, 1);
    for (const t of [1, 7, 30]) expect(residual1(relax, relaxRhs(20, 10), t)).toBeLessThan(1e-8);
    for (const t of [5, 40, 90]) expect(residual1(tank, tankRhs(0.02), t)).toBeLessThan(1e-6);
  });

  it('two solution curves of a smooth field never cross: their order is kept for all t', () => {
    const lo = relaxSolution(20, 10, 0, 60);
    const hi = relaxSolution(20, 10, 0, 90);
    for (let t = -20; t <= 60; t += 0.5) expect(hi(t)).toBeGreaterThan(lo(t));
  });

  it('a curve that starts later is the same curve shifted in time (the field does not depend on t)', () => {
    // from 90 °C the cup reaches 60 °C after τ ln(70/40) = 5.60 min; from there on it is the 60 °C curve
    const shift = relaxTime(20, 10, 90, 60);
    expect(relativeError(shift, 5.596)).toBeLessThan(1e-3);
    const a = relaxSolution(20, 10, 0, 90);
    const b = relaxSolution(20, 10, 0, 60);
    for (const t of [0, 3, 12]) expect(relativeError(a(t + shift), b(t))).toBeLessThan(1e-12);
  });

  it('two real roots cross x = 0 at most once, and only when v₀ < s₂x₀', () => {
    // γ = 10, ω₀ = 3: s₁ = −1, s₂ = −9; x₀ = 0.10 m, so the threshold is v₀ = −0.9 m/s
    expect(zeroCrossings(solveSecondOrder(10, 9, 0.1, -0.85))).toHaveLength(0);
    const sol = solveSecondOrder(10, 9, 0.1, -2);
    const z = zeroCrossings(sol);
    expect(z).toHaveLength(1);
    expect(Math.abs(sol.x(z[0]))).toBeLessThan(1e-14);
    // complex roots cross again and again, half a damped period apart
    const under = zeroCrossings(solveSecondOrder(1, 9, 0.1, 0));
    expect(under.length).toBeGreaterThan(2);
    expect(relativeError(under[1] - under[0], Math.PI / Math.sqrt(8.75))).toBeLessThan(1e-12);
  });

  it('the regime test reads the sign of γ²/4 − ω₀²', () => {
    expect(regime(10, 9)).toBe('over');
    expect(regime(6, 9)).toBe('critical');
    expect(regime(1, 9)).toBe('under');
    expect(regime(0, -1)).toBe('over');
  });
});

describe('scaling', () => {
  it('the barrel takes twice as long from four times the height (t ∝ √h₀)', () => {
    expect(relativeError(emptyTime(0.02, 1) / emptyTime(0.02, 0.25), 2)).toBeLessThan(1e-12);
  });

  it('k = (a/A)√(2g) is proportional to the hole and inversely to the barrel', () => {
    expect(relativeError(tankK(2e-4, 0.1, 9.8) / tankK(1e-4, 0.1, 9.8), 2)).toBeLessThan(1e-12);
    expect(relativeError(tankK(1e-4, 0.2, 9.8) / tankK(1e-4, 0.1, 9.8), 0.5)).toBeLessThan(1e-12);
  });

  it('relaxation halves the distance from equilibrium every τ ln 2, whatever the start', () => {
    for (const y0 of [90, 60, 5]) expect(relativeError(relaxTime(20, 10, y0, 20 + (y0 - 20) / 2), 10 * Math.LN2)).toBeLessThan(1e-12);
  });

  it('running time twice as fast (γ → 2γ, ω₀² → 4ω₀²) doubles both roots', () => {
    const [a] = charRoots(1, 9);
    const [b] = charRoots(2, 36);
    expect(relativeError(b.re, 2 * a.re)).toBeLessThan(1e-12);
    expect(relativeError(b.im, 2 * a.im)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  const f = relaxRhs(20, 10);
  const exact = relaxSolution(20, 10, 0, 90)(15);
  const err = (n: number, m: 'rk4' | 'euler') => Math.abs(integrate(f, 0, 90, 15, n, m).y[n] - exact);

  it('RK4 converges at fourth order: halving the step cuts the error about 16-fold', () => {
    const ratio = err(10, 'rk4') / err(20, 'rk4');
    expect(ratio).toBeGreaterThan(14);
    expect(ratio).toBeLessThan(18);
    expect(relativeError(integrate(f, 0, 90, 15, 200).y[200], exact)).toBeLessThan(1e-9);
  });

  it('forward Euler converges at first order: halving the step only halves the error', () => {
    const ratio = err(100, 'euler') / err(200, 'euler');
    expect(ratio).toBeGreaterThan(1.9);
    expect(ratio).toBeLessThan(2.1);
  });

  it('RK4 backward in time retraces the closed form of the barrel before it empties', () => {
    const path = integrate(tankRhs(0.02), 50, 0.25, 0, 500);
    expect(relativeError(path.y[500], 1)).toBeLessThan(1e-9);
  });
});
