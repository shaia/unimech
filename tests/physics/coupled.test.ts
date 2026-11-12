import { describe, expect, it } from 'vitest';
import {
  beats,
  energies,
  integrateCoupled,
  modeCoefficients,
  modeOmegaSquared,
  motion,
  normalModes,
  stiffness,
  symmetric,
  symmetricFrequencies,
  transferAmplitude,
  weakSplitting,
  type Coupled,
  type State2,
} from '~/physics/coupled';
import { relativeError } from '~/physics/vec';

const EQ = symmetric(1.0, 10, 1.0);
const UNEQ: Coupled = { m1: 0.6, m2: 1.4, k1: 12, k2: 7, kc: 3 };
const ONE: State2 = { x1: 0.1, x2: 0, v1: 0, v2: 0 };

describe('analytic limits', () => {
  it('equal bodies: the in-phase mode (1, 1) has ω² = k/m and the opposite mode (1, −1) has ω² = (k + 2k_c)/m', () => {
    const [a, b] = normalModes(EQ);
    const [w1, w2] = symmetricFrequencies(1.0, 10, 1.0);
    expect(relativeError(a.omega, w1)).toBeLessThan(1e-14);
    expect(relativeError(b.omega, w2)).toBeLessThan(1e-14);
    expect(a.shape[0]).toBeCloseTo(1, 14);
    expect(a.shape[1]).toBeCloseTo(1, 14);
    expect(b.shape[0]).toBeCloseTo(1, 14);
    expect(b.shape[1]).toBeCloseTo(-1, 14);
  });

  it('without coupling each body is its own mode with its own √(k/m)', () => {
    const [a, b] = normalModes({ m1: 2, m2: 1, k1: 8, k2: 9, kc: 0 });
    expect(relativeError(a.omega, 2)).toBeLessThan(1e-14);
    expect(a.shape).toEqual([1, 0]);
    expect(relativeError(b.omega, 3)).toBeLessThan(1e-14);
    expect(b.shape).toEqual([0, 1]);
  });

  it('a wall–k–m–k–m chain with a free end has ω² = (k/m)(3 ∓ √5)/2 and the low mode shape (1, golden ratio)', () => {
    const [a, b] = normalModes({ m1: 1, m2: 1, k1: 100, k2: 0, kc: 100 });
    expect(relativeError(a.omega ** 2, (100 * (3 - Math.sqrt(5))) / 2)).toBeLessThan(1e-13);
    expect(relativeError(b.omega ** 2, (100 * (3 + Math.sqrt(5))) / 2)).toBeLessThan(1e-13);
    expect(relativeError(a.shape[1] / a.shape[0], (1 + Math.sqrt(5)) / 2)).toBeLessThan(1e-13);
  });

  it('a free two-body "molecule" has a zero mode (translation) and ω² = k_c/μ with the centre of mass at rest', () => {
    const s: Coupled = { m1: 0.3, m2: 0.6, k1: 0, k2: 0, kc: 54 };
    const [a, b] = normalModes(s);
    const mu = (0.3 * 0.6) / 0.9;
    expect(a.omega).toBe(0);
    expect(relativeError(b.omega ** 2, 54 / mu)).toBeLessThan(1e-14);
    expect(Math.abs(s.m1 * b.shape[0] + s.m2 * b.shape[1])).toBeLessThan(1e-14);
  });

  it('a very stiff coupling leaves the in-phase frequency of equal bodies at √(k/m) and sends the opposite one to infinity', () => {
    const [a, b] = normalModes(symmetric(1, 10, 1e6));
    expect(relativeError(a.omega, Math.sqrt(10))).toBeLessThan(1e-12);
    expect(b.omega).toBeGreaterThan(1e3);
  });

  it('each mode is a null vector of K − ω²M, and the closed form satisfies the equations of motion', () => {
    for (const s of [EQ, UNEQ]) {
      const K = stiffness(s);
      for (const { omega, shape: [a1, a2] } of normalModes(s)) {
        const w2 = omega * omega;
        expect(Math.abs((K[0][0] - s.m1 * w2) * a1 + K[0][1] * a2)).toBeLessThan(1e-12 * K[0][0]);
        expect(Math.abs(K[1][0] * a1 + (K[1][1] - s.m2 * w2) * a2)).toBeLessThan(1e-12 * K[1][1]);
      }
    }
  });

  it('the closed-form motion reproduces the initial state', () => {
    const s0: State2 = { x1: 0.07, x2: -0.02, v1: 0.3, v2: 0.5 };
    const st = motion(UNEQ, s0, 0);
    for (const k of ['x1', 'x2', 'v1', 'v2'] as const) expect(Math.abs(st[k] - s0[k])).toBeLessThan(1e-14);
  });

  it('a start in one mode stays in that mode: the other coefficient is zero', () => {
    const [a] = normalModes(UNEQ);
    const co = modeCoefficients(UNEQ, { x1: 0.1 * a.shape[0], x2: 0.1 * a.shape[1], v1: 0, v2: 0 });
    expect(Math.abs(co[1].C)).toBeLessThan(1e-15);
    expect(relativeError(co[0].C, 0.1)).toBeLessThan(1e-14);
  });

  it('from (a, 0) at rest, equal bodies: x₁ = a cos(Δωt/2) cos(ω̄t); at T_s = π/Δω body 1 keeps only a share of order (Δω/ω̄)²', () => {
    const { dOmega, transferTime, meanOmega } = beats(EQ);
    for (const t of [0.3, 2.9, 7.7]) {
      const st = motion(EQ, ONE, t);
      expect(Math.abs(st.x1 - 0.1 * Math.cos((dOmega * t) / 2) * Math.cos(meanOmega * t))).toBeLessThan(1e-14);
      expect(Math.abs(st.x2 - 0.1 * Math.sin((dOmega * t) / 2) * Math.sin(meanOmega * t))).toBeLessThan(1e-14);
    }
    const e = energies(EQ, motion(EQ, ONE, transferTime));
    // the envelope is zero there, but its slope is not: v₁ = −(aΔω/2) cos ω̄t at most
    expect(e.E1 / e.E).toBeLessThan((dOmega / (2 * meanOmega)) ** 2 * 1.01);
  });
});

describe('conservation', () => {
  it('the total energy E₁ + E₂ + E_c of the closed form is constant while it moves from body to body', () => {
    const E0 = energies(UNEQ, ONE).E;
    for (const t of [0.5, 3.1, 12.4, 40]) expect(relativeError(energies(UNEQ, motion(UNEQ, ONE, t)).E, E0)).toBeLessThan(1e-12);
  });

  it('the sum of the squared mode frequencies equals the trace of M⁻¹K, their product its determinant', () => {
    const [lo, hi] = modeOmegaSquared(UNEQ);
    const A = (UNEQ.k1 + UNEQ.kc) / UNEQ.m1;
    const B = (UNEQ.k2 + UNEQ.kc) / UNEQ.m2;
    expect(relativeError(lo + hi, A + B)).toBeLessThan(1e-14);
    expect(relativeError(lo * hi, A * B - (UNEQ.kc * UNEQ.kc) / (UNEQ.m1 * UNEQ.m2))).toBeLessThan(1e-13);
  });

  it('the modes are M-orthogonal: m₁a₁b₁ + m₂a₂b₂ = 0', () => {
    const [a, b] = normalModes(UNEQ);
    expect(Math.abs(UNEQ.m1 * a.shape[0] * b.shape[0] + UNEQ.m2 * a.shape[1] * b.shape[1])).toBeLessThan(1e-14);
  });
});

describe('scaling', () => {
  it('with weak coupling the transfer time grows as 1/k_c, T_s ≈ π m ω₁/k_c', () => {
    const t1 = beats(symmetric(1, 10, 0.01)).transferTime;
    const t2 = beats(symmetric(1, 10, 0.005)).transferTime;
    expect(relativeError(t2 / t1, 2)).toBeLessThan(2e-3);
    expect(relativeError(Math.PI / weakSplitting(1, 10, 0.01), t1)).toBeLessThan(2e-3);
  });

  it('identical oscillators transfer completely; detuning far beyond the coupling transfers little', () => {
    expect(relativeError(transferAmplitude(EQ), 1)).toBeLessThan(1e-14);
    const detuned: Coupled = { m1: 1, m2: 1.5, k1: 10, k2: 10, kc: 0.2 };
    expect(transferAmplitude(detuned)).toBeLessThan(0.15);
    // the envelope of body 2 never exceeds that bound (in mass-weighted terms)
    let peak = 0;
    for (let t = 0; t < 200; t += 0.01) peak = Math.max(peak, Math.abs(Math.sqrt(1.5) * motion(detuned, ONE, t).x2));
    expect(peak / 0.1).toBeLessThanOrEqual(transferAmplitude(detuned) + 1e-9);
    expect(peak / 0.1).toBeGreaterThan(0.95 * transferAmplitude(detuned));
  });
});

describe('convergence', () => {
  it('RK4 converges to the closed form at fourth order', () => {
    const s0: State2 = { x1: 0.1, x2: -0.03, v1: 0.2, v2: 0 };
    const exact = motion(UNEQ, s0, 5);
    const err = (dt: number) => Math.abs(integrateCoupled(UNEQ, s0, 5, dt).x1 - exact.x1);
    const e1 = err(0.02);
    const e2 = err(0.01);
    expect(e1).toBeLessThan(1e-6);
    expect(e1 / e2).toBeGreaterThan(12);
    expect(e1 / e2).toBeLessThan(20);
  });

  it('RK4 shows the full transfer of a weakly coupled equal pair at T_s', () => {
    const { transferTime, dOmega, meanOmega } = beats(EQ);
    const st = integrateCoupled(EQ, ONE, transferTime, 0.002);
    const e = energies(EQ, st);
    expect(e.E1 / e.E).toBeLessThan((dOmega / (2 * meanOmega)) ** 2 * 1.01);
    expect(e.E2 / e.E).toBeGreaterThan(0.9);
  });
});
