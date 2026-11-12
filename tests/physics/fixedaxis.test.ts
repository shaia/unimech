import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  QUARTER_SWING_INTEGRAL,
  atwoodState,
  atwoodTimeTo,
  fasterThanGBeyond,
  pivotForce,
  pivotedAlpha,
  pivotedOmegaSq,
  pivotedQuarterTime,
  pivotedRun,
  pulleyEnergyShare,
  releaseAcceleration,
} from '~/physics/fixedaxis';
import { disc, ring, rodEnd } from '~/physics/rigidbody';
import { relativeError } from '~/physics/vec';

/** A uniform rod of mass M and length L hinged at one end: I_P = ML²/3, d = L/2. */
const rod = (M: number, L: number) => ({ Ip: rodEnd(M, L), m: M, d: L / 2 });

/** The first sample at or past φ = π/2, linearly interpolated in time. */
function timeToVertical(samples: { t: number; phi: number }[]): number {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (b.phi >= Math.PI / 2) return a.t + ((Math.PI / 2 - a.phi) / (b.phi - a.phi)) * (b.t - a.t);
  }
  return NaN;
}

describe('analytic limits', () => {
  it('a massless pulley gives the Atwood machine of chapter 2: a = (m₁ − m₂)g/(m₁ + m₂) and equal tensions', () => {
    const s = atwoodState(1.6, 1.0, 0, 0.15, 0.5);
    expect(relativeError(s.a, (0.6 * G) / 2.6)).toBeLessThan(1e-14);
    expect(relativeError(s.T1, s.T2)).toBeLessThan(1e-14);
  });

  it('a pulley with mass makes the tensions differ by exactly (I/R²)a, the torque that turns it', () => {
    const I = disc(2.4, 0.15);
    const s = atwoodState(1.6, 1.0, I, 0.15, 0.3);
    expect(relativeError((s.T1 - s.T2) * 0.15, I * s.alpha)).toBeLessThan(1e-12);
    expect(s.T1).toBeGreaterThan(s.T2);
  });

  it('a uniform rod hinged at one end and released horizontal starts at α = 3g/(2L), its tip at 3g/2', () => {
    const { Ip, m, d } = rod(0.5, 1.0);
    expect(relativeError(pivotedAlpha(Ip, m, d, 0), (3 * G) / 2)).toBeLessThan(1e-14);
    expect(relativeError(releaseAcceleration(Ip, m, d, 1.0), 1.5 * G)).toBeLessThan(1e-14);
  });

  it('points of a released rod beyond 2L/3 from the hinge accelerate faster than g', () => {
    const { Ip, m, d } = rod(0.7, 1.2);
    const s = fasterThanGBeyond(Ip, m, d);
    expect(relativeError(s, 0.8)).toBeLessThan(1e-14);
    expect(relativeError(releaseAcceleration(Ip, m, d, s), G)).toBeLessThan(1e-14);
  });

  it('the hinge holds a released rod with only a quarter of its weight, and with 5/2 of it when the rod hangs vertical', () => {
    const { Ip, m, d } = rod(0.5, 1.0);
    const [fx0, fy0] = pivotForce(Ip, m, d, 0, 0);
    expect(Math.abs(fx0)).toBeLessThan(1e-12);
    expect(relativeError(fy0, (m * G) / 4)).toBeLessThan(1e-14);
    const w = Math.sqrt(pivotedOmegaSq(Ip, m, d, Math.PI / 2));
    const [fx1, fy1] = pivotForce(Ip, m, d, Math.PI / 2, w);
    expect(Math.abs(fx1)).toBeLessThan(1e-12);
    expect(relativeError(fy1, 2.5 * m * G)).toBeLessThan(1e-12);
  });

  it('a heavy point mass at the tip of a light rod is a simple pendulum: the tip starts at g', () => {
    const M = 1e-9;
    const mTip = 2;
    const L = 0.9;
    const Ip = rodEnd(M, L) + mTip * L * L;
    const m = M + mTip;
    const d = (M * L * 0.5 + mTip * L) / m;
    expect(relativeError(releaseAcceleration(Ip, m, d, L), G)).toBeLessThan(1e-8);
  });

  it('the quarter-swing constant is ∫₀^{π/2} dφ/√(sin φ), checked by a midpoint sum after φ = u²', () => {
    // with φ = u², dφ = 2u du and the integrand 2u/√(sin u²) is finite at u = 0
    const n = 200000;
    const top = Math.sqrt(Math.PI / 2);
    const h = top / n;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) * h;
      s += (2 * u) / Math.sqrt(Math.sin(u * u));
    }
    expect(relativeError(s * h, QUARTER_SWING_INTEGRAL)).toBeLessThan(1e-8);
  });
});

describe('conservation', () => {
  it('the Atwood machine with a massive pulley keeps K₁ + K₂ + ½Iω² + ΔU = 0 at every instant', () => {
    const I = ring(2.4, 0.15);
    for (const t of [0.2, 0.6, 1.1]) {
      const s = atwoodState(1.6, 1.0, I, 0.15, t);
      const total = s.K1 + s.K2 + s.Krot;
      expect(relativeError(total, -s.dU)).toBeLessThan(1e-12);
    }
  });

  it('the pulley carries the same share of the kinetic energy at every instant: (I/R²)/(m₁ + m₂ + I/R²)', () => {
    const I = disc(2.4, 0.15);
    const share = pulleyEnergyShare(1.6, 1.0, I, 0.15);
    for (const t of [0.1, 0.9]) {
      const s = atwoodState(1.6, 1.0, I, 0.15, t);
      expect(relativeError(s.Krot / (s.K1 + s.K2 + s.Krot), share)).toBeLessThan(1e-12);
    }
  });

  it('the RK4 run of a falling rod conserves ½I_Pω² − m g d sin φ', () => {
    const { Ip, m, d } = rod(0.5, 1.0);
    const run = pivotedRun(Ip, m, d, 1.0, 2000);
    for (const s of run.filter((_, i) => i % 250 === 0 && i > 0)) {
      const K = 0.5 * Ip * s.omega * s.omega;
      const drop = m * G * d * Math.sin(s.phi);
      expect(relativeError(K, drop)).toBeLessThan(1e-9);
    }
  });
});

describe('scaling', () => {
  it('a longer rod turns more slowly: α ∝ 1/L at the release and the fall time ∝ √L', () => {
    const a1 = rod(0.5, 0.5);
    const a2 = rod(0.5, 2.0);
    expect(relativeError(pivotedAlpha(a1.Ip, a1.m, a1.d, 0) / pivotedAlpha(a2.Ip, a2.m, a2.d, 0), 4)).toBeLessThan(1e-14);
    expect(relativeError(pivotedQuarterTime(a2.Ip, a2.m, a2.d) / pivotedQuarterTime(a1.Ip, a1.m, a1.d), 2)).toBeLessThan(1e-14);
  });

  it('the mass of a uniform rod cancels: the same motion for 0.2 kg and 5 kg', () => {
    const a = rod(0.2, 0.8);
    const b = rod(5, 0.8);
    expect(relativeError(pivotedAlpha(a.Ip, a.m, a.d, 0.7), pivotedAlpha(b.Ip, b.m, b.d, 0.7))).toBeLessThan(1e-14);
  });

  it('the Atwood times scale as √D: four times the drop takes twice as long', () => {
    const I = disc(2.4, 0.15);
    expect(relativeError(atwoodTimeTo(1.6, 1, I, 0.15, 4) / atwoodTimeTo(1.6, 1, I, 0.15, 1), 2)).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('the RK4 fall time of a rod to the vertical converges on the exact c/√(2k) at fourth order', () => {
    const { Ip, m, d } = rod(0.5, 1.0);
    const exact = pivotedQuarterTime(Ip, m, d);
    const err = (n: number) => Math.abs(timeToVertical(pivotedRun(Ip, m, d, 0.6, n)) - exact);
    // the crossing time is interpolated linearly between samples, so refine both together: the error falls fast
    expect(err(4000) / exact).toBeLessThan(1e-6);
    // ω at the vertical from the run agrees with energy conservation, ω² = 3g/L
    const run = pivotedRun(Ip, m, d, exact, 4000);
    expect(relativeError(run[run.length - 1].omega ** 2, (3 * G) / 1.0)).toBeLessThan(1e-9);
  });

  it('halving the RK4 step cuts the error in φ at a fixed time about sixteenfold', () => {
    const { Ip, m, d } = rod(0.5, 1.0);
    const ref = pivotedRun(Ip, m, d, 0.4, 64000).at(-1)!.phi;
    const e1 = Math.abs(pivotedRun(Ip, m, d, 0.4, 20).at(-1)!.phi - ref);
    const e2 = Math.abs(pivotedRun(Ip, m, d, 0.4, 40).at(-1)!.phi - ref);
    const ratio = e1 / e2;
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
  });
});
