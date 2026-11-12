import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { amplitudePhase, freeMotion, integrate, naturalFrequency, periodOf, seriesK } from '~/physics/oscillator';
import {
  arrangementK,
  bouncePeriod,
  cutSpringK,
  equilibriumStretch,
  firstTimeAt,
  moonGravity,
  parallelOf,
  referencePoint,
  seriesOf,
  stretchRange,
  verticalAccel,
  verticalEnergy,
  verticalMotion,
  wrapPhase,
  type VerticalSpring,
} from '~/physics/shm';
import { relativeError } from '~/physics/vec';

const W = 5; // ω₀ = √(20/0.8)
const SPRING: VerticalSpring = { m: 0.3, k: 20, g: G };

/** RK4 of ÿ = −(k/m)y − g from (y₀, v₀) over T with step dt, in relaxed-length coordinates. */
const rk4Vertical = (s: VerticalSpring, y0: number, v0: number, T: number, dt: number) =>
  integrate((y) => verticalAccel(s)(y), { x: y0, v: v0 }, T, dt);

/** A body on a spring that bounces elastically off a stop at xw: the time between two bounces, by RK4 steps. */
function simulatedBouncePeriod(omega: number, A: number, xw: number, dt: number): number {
  // start at the stop, just after a bounce, moving toward +x
  let x = xw;
  let v = omega * Math.sqrt(A * A - xw * xw);
  let t = 0;
  for (let i = 0; i < 1e7; i++) {
    const s = integrate((xx) => -omega * omega * xx, { x, v }, dt, dt);
    if (s.x < xw && s.v < 0) {
      // the crossing inside this step, by linear interpolation of x
      return t + (dt * (x - xw)) / (x - s.x);
    }
    x = s.x;
    v = s.v;
    t += dt;
  }
  return Number.NaN;
}

describe('analytic limits', () => {
  it('released from rest (v₀ = 0) the amplitude is x₀ and the phase 0, or π when x₀ < 0', () => {
    const pos = amplitudePhase(W, 0.1, 0);
    expect(pos.A).toBe(0.1);
    expect(Math.abs(pos.phi)).toBe(0);
    const neg = amplitudePhase(W, -0.1, 0);
    expect(relativeError(neg.A, 0.1)).toBeLessThan(1e-15);
    expect(relativeError(Math.abs(neg.phi), Math.PI)).toBeLessThan(1e-15);
  });

  it('started from the equilibrium the amplitude is |v₀|/ω₀ and the phase −π/2 for v₀ > 0, +π/2 for v₀ < 0', () => {
    const up = amplitudePhase(W, 0, 0.5);
    expect(relativeError(up.A, 0.1)).toBeLessThan(1e-15);
    expect(relativeError(up.phi, -Math.PI / 2)).toBeLessThan(1e-15);
    expect(relativeError(amplitudePhase(W, 0, -0.5).phi, Math.PI / 2)).toBeLessThan(1e-15);
  });

  it('the reference point projects on x(t) and its second coordinate is −v/ω₀ at every instant', () => {
    const x0 = 0.1;
    const v0 = 0.5;
    const { A, phi } = amplitudePhase(W, x0, v0);
    for (const t of [0, 0.13, 0.9, 2.2]) {
      const p = referencePoint(A, phi, W, t);
      const s = freeMotion({ omega0: W }, { x: x0, v: v0 }, t);
      expect(relativeError(p.px, s.x)).toBeLessThan(1e-12);
      expect(relativeError(p.py, -s.v / W)).toBeLessThan(1e-12);
    }
  });

  it('from rest at the end, the body first reaches the centre after a quarter period and the other end after half', () => {
    const T = periodOf(W);
    expect(relativeError(firstTimeAt(W, 0.1, 0, 0, -1), T / 4)).toBeLessThan(1e-12);
    expect(relativeError(firstTimeAt(W, 0.1, 0, -0.1, -1), T / 2)).toBeLessThan(1e-12);
    expect(firstTimeAt(W, 0.1, 0, 0.1, 1)).toBe(0);
    expect(firstTimeAt(W, 0.1, 0, 0.2, 1)).toBeNaN();
  });

  it('firstTimeAt lands on the place it was asked for, moving the way it was asked', () => {
    const x0 = -0.05;
    const v0 = -0.6;
    const { A, phi } = amplitudePhase(W, x0, v0);
    for (const [x, dir] of [
      [0.03, 1],
      [0.03, -1],
      [-0.07, 1],
      [0, -1],
    ] as const) {
      const t = firstTimeAt(W, A, phi, x, dir);
      const s = freeMotion({ omega0: W }, { x: x0, v: v0 }, t);
      expect(Math.abs(s.x - x)).toBeLessThan(1e-12);
      expect(Math.sign(s.v)).toBe(dir);
    }
  });

  it('without gravity (g = 0) the vertical spring is the horizontal one: no shift, the same motion', () => {
    const s: VerticalSpring = { m: 0.3, k: 20, g: 0 };
    expect(equilibriumStretch(s)).toBe(0);
    for (const t of [0.2, 1.1]) {
      const v = verticalMotion(s, 0.04, -0.3, t);
      const h = freeMotion({ omega0: naturalFrequency(20, 0.3) }, { x: 0.04, v: -0.3 }, t);
      expect(relativeError(v.y, h.x)).toBeLessThan(1e-15);
    }
  });

  it('released at the relaxed length, the vertical spring stretches at most 2mg/k and comes back to relaxed', () => {
    const D = equilibriumStretch(SPRING);
    const r = stretchRange(SPRING, D, 0);
    expect(relativeError(r.max, (2 * SPRING.m * G) / SPRING.k)).toBeLessThan(1e-15);
    expect(Math.abs(r.min)).toBeLessThan(1e-15);
    const half = verticalMotion(SPRING, D, 0, periodOf(naturalFrequency(SPRING.k, SPRING.m)) / 2);
    expect(relativeError(half.stretch, 2 * D)).toBeLessThan(1e-12);
  });

  it('a stop at −A changes nothing (T′ = T), a stop at the centre halves the period, one at −A/2 leaves 2T/3', () => {
    const T = periodOf(W);
    expect(relativeError(bouncePeriod(W, 0.1, -0.1), T)).toBeLessThan(1e-15);
    expect(relativeError(bouncePeriod(W, 0.1, 0), T / 2)).toBeLessThan(1e-15);
    expect(relativeError(bouncePeriod(W, 0.1, -0.05), (2 * T) / 3)).toBeLessThan(1e-14);
    expect(bouncePeriod(W, 0.1, -0.2)).toBeNaN();
  });

  it('the Moon’s surface gravity G M/R² is about a sixth of the Earth’s', () => {
    expect(relativeError(moonGravity(), 1.62)).toBeLessThan(0.005);
    expect(relativeError(G / moonGravity(), 6.05)).toBeLessThan(0.01);
  });
});

describe('conservation', () => {
  it('the reference point stays on the circle of radius A', () => {
    const { A, phi } = amplitudePhase(W, 0.07, -0.4);
    for (const t of [0, 0.3, 1.7, 9]) {
      const p = referencePoint(A, phi, W, t);
      expect(relativeError(Math.hypot(p.px, p.py), A)).toBeLessThan(1e-14);
    }
  });

  it('on the vertical spring ½mv² + ½ky² + mgy (spring plus gravity) is constant, and so is ½mv² + ½kx² about the equilibrium', () => {
    const x0 = 0.05;
    const v0 = 0.8;
    const E0 = verticalEnergy(SPRING, x0 - equilibriumStretch(SPRING), v0);
    const e0 = 0.5 * SPRING.m * v0 * v0 + 0.5 * SPRING.k * x0 * x0;
    for (const t of [0.1, 0.37, 1.4, 5]) {
      const s = verticalMotion(SPRING, x0, v0, t);
      expect(relativeError(verticalEnergy(SPRING, s.y, s.v), E0)).toBeLessThan(1e-12);
      expect(relativeError(0.5 * SPRING.m * s.v * s.v + 0.5 * SPRING.k * s.x * s.x, e0)).toBeLessThan(1e-12);
    }
  });
});

describe('scaling', () => {
  it('the period 2π√(m/k) does not depend on the amplitude: every start returns after the same T', () => {
    const T = periodOf(W);
    for (const [x0, v0] of [
      [0.01, 0],
      [0.2, 0],
      [0.1, 0.5],
      [0, -1.5],
    ]) {
      const s = freeMotion({ omega0: W }, { x: x0, v: v0 }, T);
      expect(Math.abs(s.x - x0)).toBeLessThan(1e-12);
    }
  });

  it('four times the mass doubles the period; four times the spring constant halves it', () => {
    const T = periodOf(naturalFrequency(20, 0.8));
    expect(relativeError(periodOf(naturalFrequency(20, 3.2)), 2 * T)).toBeLessThan(1e-14);
    expect(relativeError(periodOf(naturalFrequency(80, 0.8)), T / 2)).toBeLessThan(1e-14);
  });

  it('n identical springs make k/n in series and nk in parallel; two in series agree with oscillator.seriesK', () => {
    for (const n of [2, 3, 5]) {
      const ks = Array.from({ length: n }, () => 30);
      expect(relativeError(seriesOf(ks), 30 / n)).toBeLessThan(1e-14);
      expect(relativeError(parallelOf(ks), 30 * n)).toBeLessThan(1e-14);
    }
    expect(relativeError(seriesOf([300, 600]), seriesK(300, 600))).toBeLessThan(1e-14);
    expect(arrangementK('series', 20)).toBe(10);
    expect(arrangementK('parallel', 20)).toBe(40);
    expect(arrangementK('single', 20)).toBe(20);
  });

  it('a spring is its pieces in series: cut at any fraction f, the pieces k/f and k/(1 − f) give back k', () => {
    for (const f of [0.5, 1 / 3, 0.8]) {
      expect(relativeError(seriesOf([cutSpringK(50, f), cutSpringK(50, 1 - f)]), 50)).toBeLessThan(1e-14);
    }
    expect(cutSpringK(50, 0.5)).toBe(100);
  });

  it('the static stretch mg/k grows with g, but the period of the vertical spring does not change with g', () => {
    const earth = { ...SPRING, g: G };
    const moon = { ...SPRING, g: moonGravity() };
    expect(relativeError(equilibriumStretch(earth) / equilibriumStretch(moon), G / moonGravity())).toBeLessThan(1e-14);
    const T = periodOf(naturalFrequency(SPRING.k, SPRING.m));
    for (const s of [earth, moon]) {
      const back = verticalMotion(s, 0.06, 0.2, T);
      expect(Math.abs(back.x - 0.06)).toBeLessThan(1e-12);
    }
  });
});

describe('convergence', () => {
  it('RK4 of the full vertical equation mÿ = −ky − mg converges to the shifted cosine at fourth order', () => {
    const D = equilibriumStretch(SPRING);
    const x0 = 0.08;
    const v0 = -0.5;
    const T = 1.3;
    const exact = verticalMotion(SPRING, x0, v0, T);
    const err = (dt: number) => Math.abs(rk4Vertical(SPRING, x0 - D, v0, T, dt).x - exact.y);
    const e1 = err(0.02);
    const e2 = err(0.01);
    expect(e2).toBeLessThan(1e-6);
    expect(e1 / e2).toBeGreaterThan(12);
    expect(e1 / e2).toBeLessThan(20);
  });

  it('a simulated body bouncing off a stop at −A/2 settles on the period 2T/3 as the step shrinks', () => {
    const T = periodOf(W);
    const want = bouncePeriod(W, 0.1, -0.05);
    const coarse = relativeError(simulatedBouncePeriod(W, 0.1, -0.05, 2e-3), want);
    const fine = relativeError(simulatedBouncePeriod(W, 0.1, -0.05, 2e-4), want);
    expect(fine).toBeLessThan(coarse);
    expect(fine).toBeLessThan(1e-4);
    expect(relativeError(want, (2 * T) / 3)).toBeLessThan(1e-14);
  });

  it('wrapPhase brings any phase into (−π, π] without changing the motion', () => {
    for (const p of [7, -7, Math.PI, -Math.PI, 0.3, 20]) {
      const w = wrapPhase(p);
      expect(w).toBeGreaterThan(-Math.PI);
      expect(w).toBeLessThanOrEqual(Math.PI);
      expect(Math.abs(Math.cos(w) - Math.cos(p))).toBeLessThan(1e-12);
      expect(Math.abs(Math.sin(w) - Math.sin(p))).toBeLessThan(1e-12);
    }
  });
});
