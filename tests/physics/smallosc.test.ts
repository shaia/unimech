import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { period, simulate } from '~/physics/energy';
import {
  WELLS,
  beadOmega,
  beadPeriod,
  boundMotion,
  correctedOmega,
  cycloid,
  graphCurve,
  lennardJones,
  minimumNear,
  morseOmega,
  morsePeriod,
  parabolaAt,
  pendulumPeriod,
  pendulumWell,
  quarticWell,
  smallOmega,
  snapMinimum,
  snapOmega,
  snapSpring,
  stiffWell,
  taylorCoefficients,
  taylorPolynomial,
  timeAverages,
} from '~/physics/smallosc';
import { relativeError } from '~/physics/vec';

describe('analytic limits', () => {
  it('the Taylor coefficients of the pendulum are those of mgL(1 − cos θ): 0, 0, mg/(2L), 0, −mg/(24L³)', () => {
    const m = 1;
    const L = 0.8;
    const t = taylorCoefficients(pendulumWell(m, L), 0);
    expect(Math.abs(t.c0)).toBeLessThan(1e-15);
    expect(Math.abs(t.c1)).toBeLessThan(1e-15);
    expect(relativeError(t.c2, (m * G) / (2 * L))).toBeLessThan(1e-12);
    expect(Math.abs(t.c3)).toBeLessThan(1e-9);
    expect(relativeError(t.c4, -(m * G) / (24 * L ** 3))).toBeLessThan(1e-5);
  });

  it('the osculating parabola matches U, U′ and U″ at the minimum, and the Morse curvature is 2D/w²', () => {
    const p = WELLS.morse.potential;
    const P = parabolaAt(p, 1);
    const h = 1e-4;
    expect(relativeError(P(1), p.U(1))).toBeLessThan(1e-15);
    expect(Math.abs((P(1 + h) - P(1 - h)) / (2 * h) - p.dU(1))).toBeLessThan(1e-9);
    expect(relativeError((P(1 + h) - 2 * P(1) + P(1 - h)) / (h * h), (2 * 2) / 0.25)).toBeLessThan(1e-6);
    expect(relativeError(smallOmega(p, 1), morseOmega(2, 0.5, 1))).toBeLessThan(1e-14);
  });

  it('a spring has the same period at every energy: the parabola is the potential', () => {
    const w = WELLS.spring;
    for (const E of [0.1, 1, 4.5]) {
      const b = boundMotion(w.potential, 0, E)!;
      expect(relativeError(b.T, Math.PI)).toBeLessThan(1e-6);
      expect(relativeError(b.T0, Math.PI)).toBeLessThan(1e-14);
    }
  });

  it('the pendulum period from the energy integral is the exact AGM period, and tends to 2π√(L/g) at small amplitude', () => {
    const L = 0.8;
    const p = pendulumWell(1, L);
    for (const th of [0.05, 0.5, 1.5, 2.5]) {
      const E = p.U(L * th);
      const b = boundMotion(p, 0, E)!;
      expect(relativeError(b.T, pendulumPeriod(L, th))).toBeLessThan(1e-6);
    }
    expect(relativeError(pendulumPeriod(L, 1e-4), 2 * Math.PI * Math.sqrt(L / G))).toBeLessThan(1e-8);
  });

  it('the Morse period is T₀/√(−E/D) at every bound energy', () => {
    const p = WELLS.morse.potential;
    for (const E of [-1.9, -1, -0.2]) {
      const b = boundMotion(p, 1, E)!;
      expect(relativeError(b.T, morsePeriod(2, 0.5, 1, E))).toBeLessThan(1e-5);
    }
  });

  it('the Lennard-Jones curvature at r₀ is 72ε/r₀², and the minimum is found at r₀', () => {
    const eps = 1;
    const r0 = 1.5;
    const p = lennardJones(eps, r0, 1, [1, 5]);
    expect(relativeError(minimumNear(p, 1.6), r0)).toBeLessThan(1e-12);
    expect(relativeError(smallOmega(p, r0) ** 2, (72 * eps) / r0 ** 2)).toBeLessThan(1e-12);
  });

  it('the snap-through spring has its minima at ±√(ℓ₀² − d²) with ω₀² = (k/m)(1 − d²/ℓ₀²), and a maximum at 0', () => {
    const k = 50;
    const l0 = 0.3;
    const d = 0.18;
    const m = 0.2;
    const p = snapSpring(k, l0, d, m, 0.5);
    const xm = minimumNear(p, 0.2);
    expect(relativeError(xm, snapMinimum(l0, d))).toBeLessThan(1e-12);
    expect(relativeError(smallOmega(p, xm), snapOmega(k, l0, d, m))).toBeLessThan(1e-12);
    expect(p.d2U!(0)).toBeLessThan(0);
  });

  it('a bead at the bottom of y = f(x) oscillates with ω₀² = g f″(x₀): the true period tends to 2π/√(g f″)', () => {
    const b = 0.2;
    const c = 0.5;
    const curve = graphCurve(
      (x) => b * (1 - Math.cos(x / c)),
      (x) => (b / c) * Math.sin(x / c),
    );
    const T = beadPeriod(curve, -1e-3, 1e-3);
    expect(relativeError(T, (2 * Math.PI) / beadOmega(b / (c * c)))).toBeLessThan(1e-6);
  });

  it('a bead on a cycloid has the period 2π√(4R/g) at every amplitude (Huygens)', () => {
    const R = 0.5;
    const T0 = 2 * Math.PI * Math.sqrt((4 * R) / G);
    for (const f of [0.01, 1, 2.5, 3.1]) expect(relativeError(beadPeriod(cycloid(R), -f, f), T0)).toBeLessThan(1e-6);
  });

  it('a pure quartic well has no harmonic approximation (U″ = 0) and ⟨U⟩ = E/3 (virial theorem, U ∝ x⁴)', () => {
    const p = quarticWell(2, 1, 2);
    expect(Number.isNaN(smallOmega(p, 0))).toBe(true);
    const E = 1;
    const a = (E / 2) ** 0.25;
    const av = timeAverages(p, E, -a, a, 0);
    expect(relativeError(av.U, E / 3)).toBeLessThan(1e-4);
  });
});

describe('conservation', () => {
  it('in the harmonic well ⟨K⟩ = ⟨U⟩ = E/2, and in every well ⟨K⟩ + ⟨U⟩ = E', () => {
    const s = WELLS.spring.potential;
    const a = Math.sqrt(2 * 2 / 4);
    const av = timeAverages(s, 2, -a, a, 0);
    expect(relativeError(av.K, 1)).toBeLessThan(1e-6);
    expect(relativeError(av.U, 1)).toBeLessThan(1e-6);
    const m = WELLS.morse.potential;
    const b = boundMotion(m, 1, -1)!;
    const am = timeAverages(m, -1, b.x1, b.x2, -2);
    expect(relativeError(am.K + am.U, 1)).toBeLessThan(1e-12);
    // the Morse well is softer than its parabola, so the particle lingers where U is high: ⟨U⟩ > ⟨K⟩
    expect(am.U).toBeGreaterThan(am.K);
  });

  it('the RK4 motion of the pendulum at 120° conserves the energy and returns to its start after the exact period', () => {
    const L = 0.8;
    const p = pendulumWell(1, L);
    const th = (2 * Math.PI) / 3;
    const T = pendulumPeriod(L, th);
    const run = simulate(p, { x0: L * th, dt: T / 4000, tEnd: T });
    const E0 = run.samples[0].E;
    const end = run.samples[run.samples.length - 1];
    expect(relativeError(end.E, E0)).toBeLessThan(1e-9);
    expect(relativeError(end.x, L * th)).toBeLessThan(1e-7);
  });
});

describe('scaling', () => {
  it('the small-oscillation period of a pendulum grows as √L, and does not depend on the mass', () => {
    const T = (m: number, L: number) => (2 * Math.PI) / smallOmega(pendulumWell(m, L), 0);
    expect(relativeError(T(1, 1.6) / T(1, 0.4), 2)).toBeLessThan(1e-12);
    expect(relativeError(T(5, 0.8), T(0.2, 0.8))).toBeLessThan(1e-12);
  });

  it('in a pure quartic well the period falls as 1/A: doubling the amplitude halves it', () => {
    const p = quarticWell(2, 1, 3);
    const Tat = (A: number) => period(p, p.U(A), -A, A);
    expect(relativeError(Tat(1) / Tat(2), 2)).toBeLessThan(1e-6);
  });

  it('the pendulum lengthens and the stiffening well shortens with amplitude, the Morse well lengthens', () => {
    const pend = boundMotion(WELLS.pendulum.potential, 0, 8)!;
    const stiff = boundMotion(WELLS.stiff.potential, 0, 4)!;
    const mor = boundMotion(WELLS.morse.potential, 1, -0.5)!;
    expect(pend.T / pend.T0).toBeGreaterThan(1.05);
    expect(stiff.T / stiff.T0).toBeLessThan(0.95);
    expect(mor.T / mor.T0).toBeGreaterThan(1.05);
  });
});

describe('convergence', () => {
  it('T/T₀ − 1 is quadratic in the amplitude: halving A quarters it (pendulum)', () => {
    const L = 0.8;
    const r = (th: number) => pendulumPeriod(L, th) / pendulumPeriod(L, 1e-9) - 1;
    expect(relativeError(r(0.1) / r(0.05), 4)).toBeLessThan(2e-3);
  });

  it('the leading frequency correction agrees with the exact frequency to O(A⁴): pendulum, stiffening well and Morse', () => {
    const L = 0.8;
    const pt = taylorCoefficients(pendulumWell(1, L), 0);
    const th = 0.1;
    const exact = (2 * Math.PI) / pendulumPeriod(L, th);
    const w0 = Math.sqrt(G / L);
    // the correction is −ω₀θ²/16; the residual is of order θ⁴
    expect(Math.abs(correctedOmega(pt, 1, L * th) - exact) / w0).toBeLessThan(th ** 4);
    expect(relativeError(correctedOmega(pt, 1, L * th), w0 * (1 - th * th / 16))).toBeLessThan(1e-6);

    const sp = stiffWell(4, 4, 1, 2);
    const st = taylorCoefficients(sp, 0);
    const A = 0.05;
    const bs = boundMotion(sp, 0, sp.U(A))!;
    const ws = (2 * Math.PI) / bs.T;
    expect(Math.abs(correctedOmega(st, 1, A) - ws) / 2).toBeLessThan(5 * A ** 4);

    // Morse, released on the right at x₀ + A: the cubic term enters as −5α²/(12ω₀³)
    const mp = WELLS.morse.potential;
    const mt = taylorCoefficients(mp, 1, 1e-3);
    const Am = 0.01;
    const bm = boundMotion(mp, 1, mp.U(1 + Am))!;
    const wm = (2 * Math.PI) / bm.T;
    const w0m = morseOmega(2, 0.5, 1);
    const shiftExact = wm - w0m;
    const shiftPred = correctedOmega(mt, 1, Am) - w0m;
    expect(relativeError(shiftPred, shiftExact)).toBeLessThan(0.05);
  });

  it('the third-order Taylor polynomial of cos errs as h⁴, the second as h⁴ too (the cubic term of cos is zero)', () => {
    const p = pendulumWell(1, 1, 1);
    const t = taylorCoefficients(p, 0.3, 1e-3);
    const P2 = taylorPolynomial(t, 2);
    const e = (h: number) => Math.abs(P2(0.3 + h) - p.U(0.3 + h));
    // about 0.3 the cubic term is not zero: the error of the parabola falls as h³
    expect(relativeError(e(0.02) / e(0.01), 8)).toBeLessThan(0.05);
  });
});
