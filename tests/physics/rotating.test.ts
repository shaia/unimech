import { describe, expect, it } from 'vitest';
import { G, OMEGA_EARTH, R_EARTH } from '~/physics/constants';
import type { Force } from '~/physics/motion';
import {
  centrifugalForce,
  coriolisForce,
  earthOmegaLocal,
  effectiveGravity,
  effectiveGravityEarth,
  effectiveGravityMagnitude,
  fallDeflectionEast,
  foucaultPeriod,
  foucaultRate,
  freeForce,
  inertialRate,
  jacobiIntegral,
  nonInertialForce,
  plumbAngleLinear,
  plumbDeviation,
  rotateZ,
  stepNonInertial,
  toInertial,
  toRotating,
  type State3,
} from '~/physics/rotating';
import { add3, dot3, len3, relativeError, scale3, sub3, type Vec3 } from '~/physics/vec';

const deg = Math.PI / 180;

/** Free motion in S, seen in S′ at time t (the exact answer every integration is compared with). */
const freeSeenRotating = (s0: State3, omega: number, t: number): State3 =>
  toRotating({ r: add3(s0.r, scale3(s0.v, t)), v: s0.v }, omega, t);

function integrate(m: number, s: State3, real: Force, omega: number, T: number, n: number): State3 {
  const dt = T / n;
  let st = s;
  for (let i = 0; i < n; i++) st = stepNonInertial(m, st, real, { omega: [0, 0, omega] }, i * dt, dt);
  return st;
}

describe('analytic limits', () => {
  it('a frame accelerating at A sees a hanging mass at rest when the string leans atan(A/g) back from the vertical', () => {
    const A = 4.0;
    const geff = effectiveGravity([0, -G, 0], [A, 0, 0]);
    // the string lies along g_eff: angle from the downward vertical
    const angle = Math.atan2(-geff[0], -geff[1]);
    expect(relativeError(Math.abs(angle), plumbAngleLinear(G, A))).toBeLessThan(1e-12);
    expect(geff[0]).toBeLessThan(0); // leans opposite to A
    expect(relativeError(len3(geff), Math.hypot(G, A))).toBeLessThan(1e-12);
  });

  it('with ω = 0 the rotating-frame transformation is the identity', () => {
    const s: State3 = { r: [1, 2, 3], v: [-0.5, 0.25, 4] };
    const sp = toRotating(s, 0, 7);
    expect(sp.r).toEqual(s.r);
    expect(sp.v).toEqual(s.v);
  });

  it('toInertial undoes toRotating', () => {
    const s: State3 = { r: [1.2, -0.7, 0.3], v: [0.4, 0.9, -0.1] };
    const back = toInertial(toRotating(s, 0.8, 2.3), 0.8, 2.3);
    expect(len3(sub3(back.r, s.r))).toBeLessThan(1e-14);
    expect(len3(sub3(back.v, s.v))).toBeLessThan(1e-14);
  });

  it('a vector fixed in the rotating frame changes in the inertial frame at ω × Q', () => {
    const omega = 1.7;
    const Q: Vec3 = [0.6, -0.3, 0.2];
    const t = 0.9;
    const h = 1e-5;
    const numeric = scale3(sub3(rotateZ(Q, omega * (t + h)), rotateZ(Q, omega * (t - h))), 1 / (2 * h));
    const predicted = inertialRate([0, 0, 0], [0, 0, omega], rotateZ(Q, omega * t));
    expect(len3(sub3(numeric, predicted)) / len3(predicted)).toBeLessThan(1e-9);
  });

  it('the fictitious forces turn an inertial straight line into the curve the rotating frame sees', () => {
    const omega = 0.785;
    const s0: State3 = { r: [-2, 0.5, 0], v: [1.5, 0.2, 0] };
    const T = 4;
    const got = integrate(1, toRotating(s0, omega, 0), freeForce, omega, T, 4000);
    const want = freeSeenRotating(s0, omega, T);
    expect(len3(sub3(got.r, want.r))).toBeLessThan(1e-9);
    expect(len3(sub3(got.v, want.v))).toBeLessThan(1e-9);
  });

  it('a body at rest in the inertial frame needs the net of centrifugal and Coriolis, −mω²ρ, inward in the rotating frame', () => {
    const m = 2;
    const omega = 0.5;
    const rp: Vec3 = [3, 0, 0];
    const vp = toRotating({ r: rp, v: [0, 0, 0] }, omega, 0).v; // −ω × r′
    const net = add3(centrifugalForce(m, [0, 0, omega], rp), coriolisForce(m, [0, 0, omega], vp));
    expect(relativeError(net[0], -m * omega * omega * 3)).toBeLessThan(1e-12);
    expect(Math.abs(net[1])).toBeLessThan(1e-12);
  });

  it('the plumb line follows the radius at the equator and the poles, and |g_eff| is g − ω²R and g there', () => {
    expect(plumbDeviation(G, OMEGA_EARTH, R_EARTH, 0)).toBe(0);
    expect(Math.abs(plumbDeviation(G, OMEGA_EARTH, R_EARTH, 90 * deg))).toBeLessThan(1e-15);
    const c = OMEGA_EARTH * OMEGA_EARTH * R_EARTH;
    expect(relativeError(effectiveGravityMagnitude(G, OMEGA_EARTH, R_EARTH, 0), G - c)).toBeLessThan(1e-12);
    expect(relativeError(effectiveGravityMagnitude(G, OMEGA_EARTH, R_EARTH, 90 * deg), G)).toBeLessThan(1e-12);
  });

  it('the plumb line leans toward the equator by ≈ ω²R sin 2λ / (2g) to first order', () => {
    const c = OMEGA_EARTH * OMEGA_EARTH * R_EARTH;
    for (const lat of [10, 30, 45, 60, 80]) {
      const a = plumbDeviation(G, OMEGA_EARTH, R_EARTH, lat * deg);
      expect(relativeError(a, (c * Math.sin(2 * lat * deg)) / (2 * G))).toBeLessThan(0.005);
      expect(effectiveGravityEarth(G, OMEGA_EARTH, R_EARTH, lat * deg)[1]).toBeLessThan(0); // south: toward the equator
    }
  });

  it('the plumb deviation is largest near 45° and matches the 7.4 bank (0.0991° at 45°, 0.0859° at 30°)', () => {
    let best = 0;
    let bestLat = 0;
    for (let l = 0; l <= 90; l += 0.01) {
      const a = plumbDeviation(G, OMEGA_EARTH, R_EARTH, l * deg);
      if (a > best) [best, bestLat] = [a, l];
    }
    expect(Math.abs(bestLat - 45)).toBeLessThan(0.2);
    expect((plumbDeviation(G, OMEGA_EARTH, R_EARTH, 45 * deg) / deg).toPrecision(3)).toBe('0.0991');
    expect((plumbDeviation(G, OMEGA_EARTH, R_EARTH, 30 * deg) / deg).toPrecision(3)).toBe('0.0859');
  });

  it('ω points north and up at latitude λ, and straight up at the north pole', () => {
    const w = earthOmegaLocal(OMEGA_EARTH, 90 * deg);
    expect(Math.abs(w[1])).toBeLessThan(1e-20);
    expect(relativeError(w[2], OMEGA_EARTH)).toBeLessThan(1e-15);
  });

  it('a Foucault pendulum at the pole turns once per sidereal day, and never on the equator', () => {
    expect(relativeError(foucaultPeriod(OMEGA_EARTH, 90 * deg), (2 * Math.PI) / OMEGA_EARTH)).toBeLessThan(1e-12);
    expect(foucaultPeriod(OMEGA_EARTH, 0)).toBe(Infinity);
  });
});

describe('conservation', () => {
  it('the Coriolis force does no work: it is perpendicular to v′ and to ω', () => {
    const w: Vec3 = [0.3, -0.2, 0.9];
    const vp: Vec3 = [1.1, 0.4, -0.6];
    const f = coriolisForce(1.5, w, vp);
    expect(Math.abs(dot3(f, vp))).toBeLessThan(1e-15);
    expect(Math.abs(dot3(f, w))).toBeLessThan(1e-15);
  });

  it('the Jacobi integral is conserved for free motion seen from a rotating frame, while ½v′² is not', () => {
    const omega = 1.2;
    const w: Vec3 = [0, 0, omega];
    let s = toRotating({ r: [0.5, -1, 0], v: [0.3, 0.8, 0] }, omega, 0);
    const J0 = jacobiIntegral(s, w);
    const K0 = 0.5 * dot3(s.v, s.v);
    let maxDK = 0;
    const dt = 1e-3;
    for (let i = 0; i < 5000; i++) {
      s = stepNonInertial(1, s, freeForce, { omega: w }, i * dt, dt);
      maxDK = Math.max(maxDK, Math.abs(0.5 * dot3(s.v, s.v) - K0));
    }
    expect(Math.abs(jacobiIntegral(s, w) - J0) / Math.abs(J0)).toBeLessThan(1e-9);
    expect(maxDK).toBeGreaterThan(0.1);
  });

  it('the Jacobi integral is conserved with a real spring force toward the axis', () => {
    const omega = 0.9;
    const k = 4;
    const w: Vec3 = [0, 0, omega];
    const spring: Force = (r) => [-k * r[0], -k * r[1], 0];
    const u = (r: Vec3) => 0.5 * k * (r[0] * r[0] + r[1] * r[1]);
    let s: State3 = { r: [1, 0, 0], v: [0, 0.4, 0] };
    const J0 = jacobiIntegral(s, w, u(s.r));
    const dt = 1e-3;
    for (let i = 0; i < 8000; i++) s = stepNonInertial(1, s, spring, { omega: w }, i * dt, dt);
    expect(Math.abs(jacobiIntegral(s, w, u(s.r)) - J0) / Math.abs(J0)).toBeLessThan(1e-9);
  });

  it('the inertial speed |v′ + ω × r′| of a free body stays constant though the rotating frame sees it change', () => {
    const omega = 0.6;
    const s0: State3 = { r: [1, 1, 0], v: [-0.2, 0.7, 0] };
    for (const t of [0.5, 2, 6]) {
      const sp = freeSeenRotating(s0, omega, t);
      const back = toInertial(sp, omega, t);
      expect(relativeError(len3(back.v), len3(s0.v))).toBeLessThan(1e-13);
    }
  });
});

describe('scaling', () => {
  it('a dropped body lands east by (1/3)ωg t³ cos λ: the full rotating-frame equations agree to first order in ω', () => {
    const lat = 31.8 * deg;
    const w = earthOmegaLocal(OMEGA_EARTH, lat);
    const gravityOnly: Force = () => [0, 0, -G];
    for (const h of [50, 100, 400]) {
      const T = Math.sqrt((2 * h) / G);
      const n = 2000;
      const dt = T / n;
      let s: State3 = { r: [0, 0, h], v: [0, 0, 0] };
      // local flat model: only the Coriolis force matters at first order (the centrifugal part is in g)
      for (let i = 0; i < n; i++) s = stepNonInertial(1, s, gravityOnly, { omega: w }, i * dt, dt);
      // drop the centrifugal term's tiny horizontal contribution by comparing with ω → −ω (odd part = Coriolis)
      let s2: State3 = { r: [0, 0, h], v: [0, 0, 0] };
      for (let i = 0; i < n; i++) s2 = stepNonInertial(1, s2, gravityOnly, { omega: scale3(w, -1) }, i * dt, dt);
      const east = (s.r[0] - s2.r[0]) / 2;
      expect(relativeError(east, fallDeflectionEast(OMEGA_EARTH, G, T, lat))).toBeLessThan(1e-4);
    }
  });

  it('the 100 m drop at Jerusalem (λ = 31.8°) lands 1.87 cm east, as in the 7.4 bank', () => {
    const T = Math.sqrt((2 * 100) / G);
    expect((fallDeflectionEast(OMEGA_EARTH, G, T, 31.8 * deg) * 100).toPrecision(3)).toBe('1.87');
  });

  it('the Foucault rate scales as sin λ (45.4 h per turn at Jerusalem)', () => {
    for (const lat of [15, 31.8, 60]) {
      expect(relativeError(foucaultRate(OMEGA_EARTH, lat * deg), OMEGA_EARTH * Math.sin(lat * deg))).toBeLessThan(1e-15);
    }
    expect((foucaultPeriod(OMEGA_EARTH, 31.8 * deg) / 3600).toPrecision(3)).toBe('45.4');
  });

  it('the Coriolis force scales linearly with v′ and with ω, the centrifugal force with ω² and the distance', () => {
    const vp: Vec3 = [0.4, 0, 0];
    const rp: Vec3 = [2, 0, 0];
    const a = len3(coriolisForce(1, [0, 0, 0.5], vp));
    expect(relativeError(len3(coriolisForce(1, [0, 0, 1], vp)), 2 * a)).toBeLessThan(1e-14);
    expect(relativeError(len3(coriolisForce(1, [0, 0, 0.5], scale3(vp, 3))), 3 * a)).toBeLessThan(1e-14);
    const c = len3(centrifugalForce(1, [0, 0, 0.5], rp));
    expect(relativeError(len3(centrifugalForce(1, [0, 0, 1], rp)), 4 * c)).toBeLessThan(1e-14);
    expect(relativeError(len3(centrifugalForce(1, [0, 0, 0.5], scale3(rp, 2))), 2 * c)).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('RK4 in the rotating frame converges at fourth order to the exact transformed straight line', () => {
    const omega = 1.5;
    const s0: State3 = { r: [-1, 0.3, 0], v: [0.8, 0.1, 0] };
    const T = 3;
    const want = freeSeenRotating(s0, omega, T);
    const err = (n: number) => len3(sub3(integrate(1, toRotating(s0, omega, 0), freeForce, omega, T, n).r, want.r));
    const e1 = err(40);
    const e2 = err(80);
    const order = Math.log2(e1 / e2);
    expect(order).toBeGreaterThan(3.7);
    expect(order).toBeLessThan(4.4);
  });

  it('nonInertialForce adds nothing for a frame that neither accelerates nor rotates', () => {
    const real: Force = () => [1, 2, 3];
    expect(nonInertialForce(2, real, {})([5, 5, 5], [1, 1, 1], 0)).toEqual([1, 2, 3]);
  });
});
