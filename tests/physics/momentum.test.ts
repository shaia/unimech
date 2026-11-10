import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { derivative } from '~/physics/calculus';
import { freeWedge } from '~/physics/constraints';
import {
  SHAPE_FACTOR,
  averageForce,
  barrelRecoil,
  cumulativeImpulse,
  impulseQuadrature,
  jetForce,
  peakForce,
  pulseDisplacement,
  pulseFor,
  pulseForce,
  pulseImpulse,
  pulseVelocity,
  pushTime,
  recoilFinal,
  recoilState,
  springEnergy,
  throwRecoil,
  trackEnd,
  wedgeEnd,
  wedgeSlideTime,
  wedgeState,
  type Pulse,
  type PulseShape,
  type SpringRecoil,
} from '~/physics/momentum';
import { relativeError } from '~/physics/vec';

const SHAPES: PulseShape[] = ['rect', 'triangle', 'halfsine'];
/** The ball of the lesson's figure: 0.50 kg at 4.0 m/s, stopped (J = 2.0 N·s). */
const BALL = { m: 0.5, v0: -4 };
/** The carts of the lesson's figure. */
const CARTS: SpringRecoil = { m1: 1, m2: 2, k: 50, x0: 0.2 };
/** The wedge of the lesson's figure. */
const WEDGE = { m: 1, M: 2, theta: 40, h: 0.6 };

describe('analytic limits', () => {
  it('a rectangular pulse carries the impulse F·Δt, a triangle F·Δt/2, a half-sine 2F·Δt/π', () => {
    const F = 250;
    const T = 0.008;
    expect(relativeError(pulseImpulse({ shape: 'rect', peak: F, duration: T }), F * T)).toBeLessThan(1e-15);
    expect(relativeError(pulseImpulse({ shape: 'triangle', peak: F, duration: T }), (F * T) / 2)).toBeLessThan(1e-15);
    expect(relativeError(pulseImpulse({ shape: 'halfsine', peak: F, duration: T }), (2 * F * T) / Math.PI)).toBeLessThan(1e-15);
  });

  it('the area accumulated up to the end of the pulse is the whole impulse, and nothing is added afterwards', () => {
    for (const shape of SHAPES) {
      const p: Pulse = { shape, peak: 40, duration: 0.08 };
      expect(relativeError(cumulativeImpulse(p, 0.08), pulseImpulse(p))).toBeLessThan(1e-14);
      expect(relativeError(cumulativeImpulse(p, 0.5), pulseImpulse(p))).toBeLessThan(1e-14);
      expect(cumulativeImpulse(p, 0)).toBe(0);
    }
  });

  it('the accumulated impulse is an antiderivative of the force: dJ/dt = F(t) inside the pulse', () => {
    for (const shape of SHAPES) {
      const p: Pulse = { shape, peak: 40, duration: 0.08 };
      for (const t of [0.01, 0.03, 0.05, 0.07]) {
        expect(relativeError(derivative((s) => cumulativeImpulse(p, s), t, 1e-6), pulseForce(p, t))).toBeLessThan(1e-6);
      }
    }
  });

  it('pulses of equal impulse give the same change of momentum, whatever their shape or duration', () => {
    const J = 2;
    for (const shape of SHAPES)
      for (const T of [0.008, 0.02, 0.08, 0.12]) {
        const p = pulseFor(shape, J, T);
        expect(relativeError(pulseVelocity(p, BALL.m, BALL.v0, T) - BALL.v0, J / BALL.m)).toBeLessThan(1e-14);
      }
    // the ball of the figure stops: −4.0 m/s + 2.0 N·s / 0.50 kg = 0
    expect(Math.abs(pulseVelocity(pulseFor('triangle', 2, 0.08), BALL.m, BALL.v0, 0.08))).toBeLessThan(1e-14);
  });

  it('every shape has the average force J/Δt; the peak is the average divided by the shape factor', () => {
    for (const shape of SHAPES) {
      const p = pulseFor(shape, 2, 0.08);
      expect(relativeError(pulseImpulse(p) / p.duration, averageForce(2, 0.08))).toBeLessThan(1e-14);
      expect(relativeError(p.peak * SHAPE_FACTOR[shape], averageForce(2, 0.08))).toBeLessThan(1e-14);
    }
  });

  it('a body stopped by a rectangular pulse travels v₀Δt/2 (constant deceleration)', () => {
    const p = pulseFor('rect', 2, 0.08);
    expect(relativeError(pulseDisplacement(p, BALL.m, BALL.v0, 0.08), (BALL.v0 * 0.08) / 2)).toBeLessThan(1e-12);
  });

  it('a wedge of infinite mass is the fixed incline: V → 0 and the block arrives at √(2gh) along the face', () => {
    const { m, theta, h } = WEDGE;
    const end = wedgeEnd(m, 1e9, theta, h);
    expect(end.V).toBeLessThan(1e-8);
    expect(relativeError(Math.hypot(end.vx, end.vy), Math.sqrt(2 * G * h))).toBeLessThan(1e-8);
    expect(relativeError(Math.atan2(end.vy, end.vx), (theta * Math.PI) / 180)).toBeLessThan(1e-8);
    // and the held wedge (fixed = true) reaches the floor at the incline's time √(2h/(g sin²θ))
    const s = Math.sin((theta * Math.PI) / 180);
    expect(relativeError(wedgeSlideTime(m, 0, theta, h, true), Math.sqrt((2 * h) / (G * s * s)))).toBeLessThan(1e-14);
  });

  it('a vertical face (θ → 90°) does not push the wedge sideways: V → 0 and the block falls freely', () => {
    const end = wedgeEnd(1, 2, 89.9999, 0.6);
    expect(end.V).toBeLessThan(1e-5);
    expect(relativeError(end.vy, Math.sqrt(2 * G * 0.6))).toBeLessThan(1e-9);
  });

  it('a track of infinite mass is a fixed track: the block leaves the bottom at √(2gR) and the track stays', () => {
    const e = trackEnd(1, 1e12, 0.45);
    expect(relativeError(e.v, Math.sqrt(2 * G * 0.45))).toBeLessThan(1e-11);
    expect(e.V).toBeLessThan(1e-11);
  });

  it('a thrower much heavier than the ball recoils at −m u/M either way; a light one feels the difference', () => {
    expect(relativeError(throwRecoil(1e6, 1, 10, true), throwRecoil(1e6, 1, 10, false))).toBeLessThan(2e-6);
    expect(relativeError(throwRecoil(60, 2, 8, false), -2 * 8 / 60)).toBeLessThan(1e-15);
  });

  it('a gun fired straight up does not recoil along the rails, and a very heavy gun leaves the shell at the barrel angle', () => {
    expect(Math.abs(barrelRecoil(500, 10, 200, 90).V)).toBeLessThan(1e-12);
    const heavy = barrelRecoil(1e12, 10, 200, 30);
    expect(relativeError(heavy.phi, Math.PI / 6)).toBeLessThan(1e-9);
  });

  it('a jet stopped by a wall pushes it with the momentum the water brings per second, ρAv²; bounced straight back, twice that', () => {
    // the lesson's hose: 3.0 cm across, 20 m/s, water 1000 kg/m³
    const rho = 1000;
    const A = Math.PI * 0.015 ** 2;
    const v = 20;
    const dt = 0.01;
    const slug = rho * A * v * dt; // the water that reaches the wall in dt
    expect(relativeError(jetForce(rho, A, v), (slug * v) / dt)).toBeLessThan(1e-12); // Δp = slug·v → 0
    expect(relativeError(jetForce(rho, A, v, true), (slug * v - slug * -v) / dt)).toBeLessThan(1e-12); // Δp = slug·v → −slug·v
    expect(relativeError(jetForce(rho, A, v), 282.743)).toBeLessThan(1e-5);
  });
});

describe('conservation', () => {
  it('the total momentum of the two carts stays at its initial value while the spring pushes and afterwards', () => {
    for (const v0 of [0, 0.3, -0.2]) {
      const r = { ...CARTS, v0 };
      const P0 = (r.m1 + r.m2) * v0;
      for (const t of [0, 0.05, 0.1, 0.15, 0.2, 0.5, 1.2]) {
        const s = recoilState(r, t);
        expect(Math.abs(r.m1 * s.v1 + r.m2 * s.v2 - P0)).toBeLessThan(1e-14);
      }
    }
  });

  it('the centre of mass of the carts moves uniformly: m₁d₁ + m₂d₂ = (m₁ + m₂) v₀ t', () => {
    const r = { ...CARTS, v0: 0.3 };
    for (const t of [0.07, 0.2, 0.9]) {
      const s = recoilState(r, t);
      expect(relativeError(r.m1 * s.d1 + r.m2 * s.d2, (r.m1 + r.m2) * 0.3 * t)).toBeLessThan(1e-12);
    }
  });

  it('the spring energy ends up as kinetic energy of the carts (on top of the common motion)', () => {
    for (const v0 of [0, 0.4]) {
      const r = { ...CARTS, v0 };
      const { v1, v2 } = recoilFinal(r);
      const K = 0.5 * r.m1 * v1 * v1 + 0.5 * r.m2 * v2 * v2;
      expect(relativeError(K, springEnergy(r) + 0.5 * (r.m1 + r.m2) * v0 * v0)).toBeLessThan(1e-14);
      // the state at the end of the push agrees with the closed form
      const s = recoilState(r, pushTime(r) + 0.3);
      expect(relativeError(s.v1, v1)).toBeLessThan(1e-12);
      expect(relativeError(s.v2, v2)).toBeLessThan(1e-12);
    }
  });

  it('the horizontal momentum of block + free wedge stays zero at every instant of the slide', () => {
    const { m, M, theta, h } = WEDGE;
    const tEnd = wedgeSlideTime(m, M, theta, h);
    for (const f of [0.1, 0.4, 0.8, 1]) {
      const s = wedgeState(m, M, theta, h, f * tEnd);
      expect(Math.abs(s.px)).toBeLessThan(1e-14);
    }
  });

  it('the vertical momentum of block + wedge is not conserved: it changes at the rate N_floor − (M + m)g', () => {
    const { m, M, theta, h } = WEDGE;
    const tEnd = wedgeSlideTime(m, M, theta, h);
    const a = wedgeState(m, M, theta, h, 0.3 * tEnd);
    const b = wedgeState(m, M, theta, h, 0.6 * tEnd);
    expect(b.py).toBeLessThan(a.py);
    expect(a.py).toBeLessThan(0);
    const rate = (b.py - a.py) / (0.3 * tEnd);
    expect(relativeError(rate, a.Nfloor - (M + m) * G)).toBeLessThan(1e-12);
    // the floor pushes up less than the weight of block + wedge while the block falls
    expect(a.Nfloor).toBeLessThan((M + m) * G);
  });

  it('a held wedge does not conserve the horizontal momentum of the block: it grows from zero', () => {
    const { m, M, theta, h } = WEDGE;
    const tEnd = wedgeSlideTime(m, M, theta, h, true);
    expect(wedgeState(m, M, theta, h, 0.5 * tEnd, true).px).toBeGreaterThan(0.1);
  });

  it('Newton’s laws with the constraint (constraints.ts) and momentum + energy give the same end of the slide', () => {
    for (const [m, M, theta, h] of [
      [1, 2, 40, 0.6],
      [1, 3, 30, 0.45],
      [2.5, 1.5, 55, 0.3],
    ]) {
      const end = wedgeEnd(m, M, theta, h);
      const s = wedgeState(m, M, theta, h, 1e9);
      expect(s.landed).toBe(true);
      expect(relativeError(-s.Vx, end.V)).toBeLessThan(1e-12);
      expect(relativeError(s.vx, end.vx)).toBeLessThan(1e-12);
      expect(relativeError(-s.vy, end.vy)).toBeLessThan(1e-12);
      // energy: m g h = ½ M V² + ½ m v²
      expect(relativeError(m * G * h, 0.5 * M * end.V ** 2 + 0.5 * m * (end.vx ** 2 + end.vy ** 2))).toBeLessThan(1e-12);
    }
  });

  it('the free wedge recoils as the horizontal momentum demands at every instant: M A = −m a_x', () => {
    const w = freeWedge(1, 2, 40);
    expect(relativeError(2 * w.A, -1 * w.ax)).toBeLessThan(1e-14);
  });

  it('the gun and the shell share zero horizontal momentum, and the track and the block too', () => {
    const b = barrelRecoil(500, 10, 200, 30);
    expect(Math.abs(10 * b.vx - 500 * b.V)).toBeLessThan(1e-9);
    const e = trackEnd(1, 3, 0.45);
    expect(relativeError(1 * e.v, 3 * e.V)).toBeLessThan(1e-14);
    expect(relativeError(0.5 * 1 * e.v ** 2 + 0.5 * 3 * e.V ** 2, 1 * G * 0.45)).toBeLessThan(1e-14);
  });
});

describe('scaling', () => {
  it('at a fixed impulse the peak force falls as 1/Δt: ten times longer, ten times lower', () => {
    for (const shape of SHAPES) expect(relativeError(peakForce(shape, 2, 0.008) / peakForce(shape, 2, 0.08), 10)).toBeLessThan(1e-14);
  });

  it('after the push the carts move in the inverse ratio of their masses: v₁/v₂ = −m₂/m₁', () => {
    for (const [m1, m2] of [
      [1, 2],
      [0.5, 3],
      [2, 2],
    ]) {
      const { v1, v2 } = recoilFinal({ m1, m2, k: 50, x0: 0.2 });
      expect(relativeError(v1 / v2, -m2 / m1)).toBeLessThan(1e-14);
    }
  });

  it('the wedge’s final speed grows as √h', () => {
    const { m, M, theta } = WEDGE;
    expect(relativeError(wedgeEnd(m, M, theta, 0.8).V / wedgeEnd(m, M, theta, 0.2).V, 2)).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('the midpoint quadrature of a half-sine pulse converges to 2F·Δt/π with error ∝ 1/N²', () => {
    const p: Pulse = { shape: 'halfsine', peak: 50, duration: 0.08 };
    const exact = pulseImpulse(p);
    const e1 = Math.abs(impulseQuadrature(p, 20) - exact);
    const e2 = Math.abs(impulseQuadrature(p, 40) - exact);
    expect(e1 / e2).toBeGreaterThan(3.9);
    expect(e1 / e2).toBeLessThan(4.1);
    expect(relativeError(impulseQuadrature(p, 2000), exact)).toBeLessThan(1e-6);
  });

  it('the midpoint rule is exact for the rectangle and, with an even N (the kink on a node), for the triangle', () => {
    expect(relativeError(impulseQuadrature({ shape: 'rect', peak: 30, duration: 0.1 }, 7), 3)).toBeLessThan(1e-14);
    expect(relativeError(impulseQuadrature({ shape: 'triangle', peak: 30, duration: 0.1 }, 8), 1.5)).toBeLessThan(1e-14);
  });

  it('the displacement during a half-sine pulse converges as the number of pieces grows', () => {
    const p = pulseFor('halfsine', 2, 0.08);
    // closed form: v₀t + (F T/(π m))(t − (T/π) sin(πt/T)) at t = T
    const exact = BALL.v0 * 0.08 + ((p.peak * 0.08) / (Math.PI * BALL.m)) * 0.08;
    expect(relativeError(pulseDisplacement(p, BALL.m, BALL.v0, 0.08, 400), exact)).toBeLessThan(1e-5);
  });
});
