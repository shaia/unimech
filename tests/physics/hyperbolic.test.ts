import { describe, expect, it } from 'vitest';
import { C_LIGHT, E_CHARGE, M_ELECTRON, M_PROTON } from '~/physics/constants';
import {
  energyOfMomentum,
  gammaForMomentum,
  hyperbolaResidual,
  hyperbolicLength,
  hyperbolicMotion,
  hyperbolicPosition,
  hyperbolicSpeed,
  integrateRelativistic,
  longitudinalAccel,
  newtonPosition,
  newtonSpeed,
  newtonTimeToC,
  newtonWorkBetween,
  pcFromKinetic,
  reducedTime,
  speedForMomentum,
  timeToSpeed,
  transverseAccel,
  workBetween,
  type LineForce,
} from '~/physics/hyperbolic';
import { gammaOf } from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const c = C_LIGHT;
const close = (a: number, b: number, tol = 1e-12) => expect(relativeError(a, b)).toBeLessThan(tol);

/** The proton of the lesson's bank: F = 1.6e-13 N. */
const m = M_PROTON;
const F = 1.6e-13;
const T = newtonTimeToC(F, m);

describe('analytic limits', () => {
  it('at early times hyperbolic motion is Newton’s constant acceleration: v → Ft/m, x → ½(F/m)t²', () => {
    const t = 1e-4 * T; // u = 1e-4
    close(hyperbolicSpeed(F, m, t), newtonSpeed(F, m, t), 1e-7);
    close(hyperbolicPosition(F, m, t), newtonPosition(F, m, t), 1e-7);
    // the first correction: v/v_N = 1/√(1 + u²) ≈ 1 − u²/2
    const u = 0.01;
    const tu = u * T;
    close(hyperbolicSpeed(F, m, tu) / newtonSpeed(F, m, tu), 1 - (u * u) / 2, 1e-8);
  });

  it('in the limit c → ∞ the closed forms become Newton’s, whatever the time', () => {
    const t = 5e-6;
    const cBig = 1e15;
    close(hyperbolicSpeed(F, m, t, cBig), newtonSpeed(F, m, t), 1e-9);
    close(hyperbolicPosition(F, m, t, cBig), newtonPosition(F, m, t), 1e-9);
  });

  it('the speed stays below c at every time and tends to c; Newton’s line crosses c at t = mc/F', () => {
    let prev = 0;
    for (const u of [0.1, 0.5, 1, 2, 5, 10, 100, 1e4]) {
      const v = hyperbolicSpeed(F, m, u * T);
      expect(v).toBeLessThan(c);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    expect(1 - hyperbolicSpeed(F, m, 1e4 * T) / c).toBeLessThan(1e-8);
    close(newtonSpeed(F, m, T), c);
    // at that moment the true speed is c/√2
    close(hyperbolicSpeed(F, m, T), c / Math.SQRT2);
  });

  it('at late times the body runs a fixed distance mc²/F behind a light flash sent from its start', () => {
    const t = 1e3 * T;
    const lag = c * t - hyperbolicPosition(F, m, t);
    close(lag, hyperbolicLength(F, m), 1e-3);
  });

  it('the acceleration starts at F/m and falls as 1/γ³; across the velocity it is F/(γm)', () => {
    close(hyperbolicMotion(F, m, 0).a, F / m);
    const s = hyperbolicMotion(F, m, 2 * T);
    close(s.a, F / (s.gamma ** 3 * m));
    close(longitudinalAccel(F, m, s.v), s.a);
    close(transverseAccel(F, m, s.v) / longitudinalAccel(F, m, s.v), s.gamma ** 2);
    close(transverseAccel(F, m, 0), longitudinalAccel(F, m, 0));
  });

  it('proper time: τ = (mc/F)·arsinh(Ft/(mc)), which is t when u ≪ 1 and grows only logarithmically later', () => {
    close(hyperbolicMotion(F, m, 1e-5 * T).tau, 1e-5 * T, 1e-9);
    const s = hyperbolicMotion(F, m, 100 * T);
    close(s.tau, T * Math.asinh(100));
    expect(s.tau).toBeLessThan(0.06 * s.t);
  });
});

describe('conservation and invariants', () => {
  it('work equals the change of relativistic energy: Fx = (γ − 1)mc² at every time', () => {
    for (const u of [1e-3, 0.3, 1, 1.597, 4, 30]) {
      const s = hyperbolicMotion(F, m, u * T);
      close(F * s.x, s.K, 1e-12);
      close(s.E - m * c * c, s.K, 1e-9);
      close(F * s.x, workBetween(m, 0, s.v), 1e-9);
    }
  });

  it('E² = (pc)² + (mc²)² and v = pc²/E along the motion', () => {
    const s = hyperbolicMotion(F, m, 3 * T);
    close(s.E, energyOfMomentum(s.p, m));
    close(s.v, speedForMomentum(s.p, m));
    close(s.gamma, gammaForMomentum(s.p, m));
    close(s.gamma, gammaOf(s.v / c), 1e-12);
  });

  it('the worldline is the hyperbola (x + mc²/F)² − (ct)² = (mc²/F)²', () => {
    for (const u of [0.2, 1, 3, 10]) {
      const s = hyperbolicMotion(F, m, u * T);
      expect(Math.abs(hyperbolaResidual(F, m, s.x, s.t))).toBeLessThan(1e-12);
    }
  });

  it('the rapidity grows linearly in proper time: φ = Fτ/(mc), so the proper acceleration F/m is constant', () => {
    for (const u of [0.5, 2, 8]) {
      const s = hyperbolicMotion(F, m, u * T);
      close(Math.atanh(s.v / c), (F * s.tau) / (m * c), 1e-12);
    }
  });

  it('along an RK4 trajectory under a time-dependent force, ∫F v dt equals ΔE', () => {
    const f: LineForce = (t) => F * (1 + Math.sin(t / T));
    const run = integrateRelativistic(f, m, 0, 0, 6 * T, 4000);
    const end = run[run.length - 1];
    close(end.W, energyOfMomentum(end.p, m) - m * c * c, 1e-9);
  });

  it('a relativistic spring conserves E + ½kx²; with ½kA² = mc² the top speed is (√3/2)c, not Newton’s √2·c', () => {
    // units with m = k = c = 1: the amplitude A = √2 stores ½kA² = mc², so γ_max = 2
    const spring: LineForce = (_t, x) => -x;
    const A = Math.SQRT2;
    const E0 = 1 + 0.5 * A * A;
    const run = integrateRelativistic(spring, 1, A, 0, 20, 20000, 1);
    let vmax = 0;
    for (const s of run) {
      close(energyOfMomentum(s.p, 1, 1) + 0.5 * s.x * s.x, E0, 1e-11);
      vmax = Math.max(vmax, Math.abs(speedForMomentum(s.p, 1, 1)));
    }
    close(vmax, Math.sqrt(3) / 2, 1e-6);
    // Newton: ½v² = ½kA² gives v = A = √2 > 1
    expect(vmax).toBeLessThan(1);
  });
});

describe('scaling', () => {
  it('x/(mc²/F) and v/c depend only on Ft/(mc): doubling F halves the time to any speed', () => {
    const u = 1.3;
    const F2 = 2 * F;
    close(hyperbolicSpeed(F2, m, (u * T) / 2), hyperbolicSpeed(F, m, u * T));
    close(hyperbolicPosition(F2, m, (u * T) / 2) / hyperbolicLength(F2, m), hyperbolicPosition(F, m, u * T) / hyperbolicLength(F, m));
    close(timeToSpeed(F2, m, 0.9 * c), timeToSpeed(F, m, 0.9 * c) / 2);
    close(reducedTime(F, m, timeToSpeed(F, m, 0.9 * c)), 0.9 * gammaOf(0.9));
  });

  it('the work to reach v grows without bound as v → c, while Newton’s stays below ½mc²', () => {
    let prev = 0;
    for (const b of [0.9, 0.99, 0.999, 0.9999]) {
      const W = workBetween(m, 0, b * c);
      expect(W).toBeGreaterThan(prev);
      prev = W;
      expect(newtonWorkBetween(m, 0, b * c)).toBeLessThan(0.5 * m * c * c);
    }
    expect(prev).toBeGreaterThan(69 * m * c * c);
  });
});

describe('convergence', () => {
  it('RK4 under a constant force matches the closed form, with the error falling as dt⁴', () => {
    const Tend = 4 * T;
    const exact = hyperbolicPosition(F, m, Tend);
    const err = (n: number) => {
      const run = integrateRelativistic(() => F, m, 0, 0, Tend, n);
      return Math.abs(run[n].x - exact) / exact;
    };
    const e1 = err(20);
    const e2 = err(40);
    const e3 = err(80);
    expect(e3).toBeLessThan(1e-7);
    const order1 = Math.log2(e1 / e2);
    const order2 = Math.log2(e2 / e3);
    expect(order1).toBeGreaterThan(3.6);
    expect(order2).toBeGreaterThan(3.6);
    // the momentum is exact: dp/dt = F does not depend on the state
    const run = integrateRelativistic(() => F, m, 0, 0, Tend, 20);
    close(run[20].p, F * Tend, 1e-12);
  });
});

describe('the bank’s numbers', () => {
  it('proton, F = 1.6e-13 N, t = 5.0 μs: β = 0.848, x = 830 m (Newton 1.60c and 1198 m)', () => {
    const s = hyperbolicMotion(F, m, 5e-6);
    expect(s.v / c).toBeCloseTo(0.848, 3);
    expect(Math.round(s.x)).toBe(830);
    expect(newtonSpeed(F, m, 5e-6) / c).toBeCloseTo(1.597, 3);
    expect(Math.round(newtonPosition(F, m, 5e-6))).toBe(1198);
  });

  it('electron, 2.0 MeV of work from rest: pc = 2.46 MeV', () => {
    const mc2 = (M_ELECTRON * c * c) / (1e6 * E_CHARGE);
    expect(pcFromKinetic(2.0, 0.511)).toBeCloseTo(2.46, 2);
    expect(mc2).toBeCloseTo(0.512, 3);
  });

  it('proton: W(0.90c → 0.99c)/W(0 → 0.90c) = 3.70', () => {
    expect(workBetween(m, 0.9 * c, 0.99 * c) / workBetween(m, 0, 0.9 * c)).toBeCloseTo(3.7, 2);
  });
});
