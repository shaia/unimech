import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { applyTensor, disc, discDiameter, inertiaTensor, precessionRate, principalAxes, type PointMass } from '~/physics/rigidbody';
import {
  angleBetween,
  angularMomentum,
  angularMomentumDirect,
  bearingTorque,
  dumbbell,
  dumbbellPoints,
  integrateTop,
  nutationEstimate,
  phiDotOf,
  pivotForce,
  principal2,
  splitAlong,
  steadyRate,
  topConstants,
  topEnergy,
  topL,
  topStep,
  topTorque,
  type Top,
  type TopState,
} from '~/physics/top';
import { cross3, len3, relativeError, type Vec3 } from '~/physics/vec';

/** A toy gyroscope: a disc rotor 0.20 kg, R = 0.035 m, its centre 0.045 m from the pivot. */
const M = 0.2;
const R = 0.035;
const D = 0.045;
const GYRO: Top = { M, d: D, I3: disc(M, R), I1: discDiameter(M, R) + M * D * D };

const deg = (x: number) => (x * Math.PI) / 180;

describe('analytic limits', () => {
  it('L = I ω through the inertia tensor is Σ m r × (ω × r) for any set of point masses', () => {
    const pts: PointMass[] = [
      { m: 0.3, r: [0.1, -0.2, 0.25] },
      { m: 0.7, r: [-0.15, 0.05, 0.1] },
      { m: 0.2, r: [0.3, 0.2, -0.4] },
    ];
    const w: Vec3 = [1.2, -0.7, 2.5];
    const a = angularMomentum(pts, w);
    const b = angularMomentumDirect(pts, w);
    for (let i = 0; i < 3; i++) expect(relativeError(a[i], b[i])).toBeLessThan(1e-13);
  });

  it('a tilted dumbbell has |L| = 2mr²ω sin θ at 90° − θ from ω, and needs the bearing torque ω L_⊥', () => {
    const m = 0.3;
    const r = 0.25;
    const w = 6;
    for (const th of [deg(20), deg(35), deg(60)]) {
      const d = dumbbell(m, r, th, w);
      const L = angularMomentum(dumbbellPoints(m, r, th, 0.4), [0, 0, w]);
      expect(relativeError(len3(L), d.L)).toBeLessThan(1e-13);
      expect(relativeError(L[2], d.Lz)).toBeLessThan(1e-13);
      expect(relativeError(angleBetween(L, [0, 0, w]), d.angle)).toBeLessThan(1e-12);
      expect(relativeError(len3(bearingTorque([0, 0, w], L)), d.tau)).toBeLessThan(1e-13);
    }
  });

  it('along a principal axis L is parallel to ω: the dumbbell needs no torque with its rod along or across the axle', () => {
    expect(dumbbell(0.3, 0.25, 0, 6).tau).toBe(0);
    expect(dumbbell(0.3, 0.25, Math.PI / 2, 6).tau).toBeLessThan(1e-15);
    const I = inertiaTensor(dumbbellPoints(0.3, 0.25, deg(35), 1.1));
    const { moments, axes } = principalAxes(I);
    for (let k = 0; k < 3; k++) {
      const L = applyTensor(I, axes[k]);
      expect(len3(cross3(L, axes[k]))).toBeLessThan(1e-14);
      expect(Math.abs(len3(L) - Math.abs(moments[k]))).toBeLessThan(1e-14);
    }
    // the moments: 0 along the rod, 2mr² (twice) across it
    expect(Math.abs(moments[0])).toBeLessThan(1e-15);
    expect(relativeError(moments[2], 2 * 0.3 * 0.25 ** 2)).toBeLessThan(1e-12);
  });

  it('the 2 × 2 principal axes diagonalise the block and agree with the Jacobi moments', () => {
    const a = 0.8;
    const b = -0.3;
    const c = 0.5;
    const { l1, l2, alpha } = principal2(a, b, c);
    const v: [number, number] = [Math.cos(alpha), Math.sin(alpha)];
    expect(relativeError(a * v[0] + b * v[1], l1 * v[0])).toBeLessThan(1e-12);
    expect(relativeError(b * v[0] + c * v[1], l1 * v[1])).toBeLessThan(1e-12);
    expect(relativeError(Math.tan(2 * alpha), (2 * b) / (a - c))).toBeLessThan(1e-12);
    const J = principalAxes([
      [a, b, 0],
      [b, c, 0],
      [0, 0, 2],
    ]).moments;
    expect(relativeError(J[0], l1)).toBeLessThan(1e-12);
    expect(relativeError(J[1], l2)).toBeLessThan(1e-12);
  });

  it('a top started at the steady-precession rate keeps its tilt and precesses uniformly', () => {
    const th = deg(60);
    const w3 = 400;
    const Om = steadyRate(GYRO, w3, th)!;
    const { samples } = integrateTop(GYRO, w3, th, Om, 3, 300);
    const last = samples[300];
    expect(Math.abs(last.theta - th)).toBeLessThan(1e-9);
    expect(relativeError(last.phi, Om * 3)).toBeLessThan(1e-9);
  });

  it('a fast top let go with no precession precesses on average at M g d/(I₃ ω₃) and dips by about 2I₁Mgd sinθ₀/(I₃ω₃)²', () => {
    const th = deg(60);
    const w3 = 400;
    const T = 6;
    const { samples } = integrateTop(GYRO, w3, th, 0, T, 6000);
    const Om = precessionRate(M, D, GYRO.I3, w3);
    expect(relativeError(samples[6000].phi / T, Om)).toBeLessThan(0.01);
    const maxDip = Math.max(...samples.map((s) => s.theta - th));
    expect(relativeError(maxDip, nutationEstimate(GYRO, w3, th).dip)).toBeLessThan(0.03);
    // the axis never rises above where it was let go
    expect(Math.min(...samples.map((s) => s.theta - th))).toBeGreaterThan(-1e-9);
  });

  it('a top with no spin falls like a pendulum: its axis drops and never turns sideways', () => {
    const { samples } = integrateTop(GYRO, 0, deg(60), 0, 2, 200);
    expect(samples.at(-1)!.fallen).toBe(true);
    expect(Math.max(...samples.map((s) => Math.abs(s.phi)))).toBe(0);
  });

  it('in steady precession the pivot pushes up with M g and inward with M Ω² d sin θ, the net radial force', () => {
    const th = deg(70);
    const w3 = 400;
    const Om = steadyRate(GYRO, w3, th)!;
    const c = topConstants(GYRO, w3, th, Om);
    const s: TopState = { t: 0, theta: th, thetaDot: 0, phi: 0.3 };
    const F = pivotForce(GYRO, c, s);
    expect(relativeError(F[2], M * G)).toBeLessThan(1e-12);
    const inward = -(F[0] * Math.cos(0.3) + F[1] * Math.sin(0.3));
    expect(relativeError(inward, M * Om * Om * D * Math.sin(th))).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('the integrated top keeps its energy, L_z and its spin over a thousand nutations', () => {
    const th = deg(50);
    const w3 = 200;
    const { c, samples } = integrateTop(GYRO, w3, th, 0, 10, 2000);
    // the spin energy ½I₃ω₃² is constant by construction: judge the drift against the energy that moves, M g d
    const E0 = topEnergy(GYRO, c, samples[0]);
    const Lz0 = topL(GYRO, c, samples[0])[2];
    for (const s of samples) {
      expect(Math.abs(topEnergy(GYRO, c, s) - E0) / (M * G * D)).toBeLessThan(1e-6);
      expect(relativeError(topL(GYRO, c, s)[2], Lz0)).toBeLessThan(1e-12);
    }
  });

  it('dL/dt about the pivot equals the torque of gravity about the pivot, at every instant of a nutating top', () => {
    const w3 = 150;
    const c = topConstants(GYRO, w3, deg(55), 0);
    let s: TopState = { t: 0, theta: deg(55), thetaDot: 0, phi: 0 };
    const h = 1e-6;
    for (let i = 0; i < 6; i++) {
      for (let k = 0; k < 400; k++) s = topStep(GYRO, c, s, 2e-5);
      const sp = topStep(GYRO, c, s, h);
      const sm = topStep(GYRO, c, s, -h);
      const Lp = topL(GYRO, c, sp);
      const Lm = topL(GYRO, c, sm);
      const dL: Vec3 = [(Lp[0] - Lm[0]) / (2 * h), (Lp[1] - Lm[1]) / (2 * h), (Lp[2] - Lm[2]) / (2 * h)];
      const tau = topTorque(GYRO, s);
      const scale = len3(tau);
      for (let j = 0; j < 3; j++) expect(Math.abs(dL[j] - tau[j]) / scale).toBeLessThan(1e-5);
    }
  });

  it('the torque of gravity is perpendicular to L₃ ê₃, so it turns the spin part of L and never changes its size', () => {
    const s = { theta: deg(40), phi: 1.2 };
    const t = topTorque(GYRO, s);
    const e: Vec3 = [Math.sin(s.theta) * Math.cos(s.phi), Math.sin(s.theta) * Math.sin(s.phi), Math.cos(s.theta)];
    expect(Math.abs(splitAlong(t, e).along)).toBeLessThan(1e-17);
    expect(Math.abs(t[2])).toBe(0);
    expect(relativeError(len3(t), M * G * D * Math.sin(s.theta))).toBeLessThan(1e-13);
  });
});

describe('scaling', () => {
  it('the bearing torque of a tilted dumbbell grows as ω²', () => {
    const a = dumbbell(0.3, 0.25, deg(35), 3).tau;
    const b = dumbbell(0.3, 0.25, deg(35), 6).tau;
    expect(relativeError(b / a, 4)).toBeLessThan(1e-13);
  });

  it('doubling the spin halves the nutation period and quarters the dip of a fast top', () => {
    const th = deg(60);
    const dip = (w3: number) => {
      const { samples } = integrateTop(GYRO, w3, th, 0, 0.5, 5000);
      return Math.max(...samples.map((s) => s.theta - th));
    };
    expect(relativeError(dip(400) / dip(800), 4)).toBeLessThan(0.03);
    expect(relativeError(nutationEstimate(GYRO, 800, th).frequency / nutationEstimate(GYRO, 400, th).frequency, 2)).toBeLessThan(1e-13);
  });

  it('the steady precession rate tends to M g d/(I₃ ω₃) at any tilt as the spin grows', () => {
    for (const th of [deg(30), deg(90), deg(110)]) {
      const w3 = 4000;
      expect(relativeError(steadyRate(GYRO, w3, th)!, precessionRate(M, D, GYRO.I3, w3))).toBeLessThan(1e-3);
    }
  });
});

describe('convergence', () => {
  it('the RK4 top converges at fourth order in the step', () => {
    const c = topConstants(GYRO, 150, deg(55), 0);
    const run = (n: number) => {
      let s: TopState = { t: 0, theta: deg(55), thetaDot: 0, phi: 0 };
      for (let i = 0; i < n; i++) s = topStep(GYRO, c, s, 0.2 / n);
      return s.theta;
    };
    const ref = run(16000);
    const e1 = Math.abs(run(500) - ref);
    const e2 = Math.abs(run(1000) - ref);
    expect(e1 / e2).toBeGreaterThan(12);
    expect(e1 / e2).toBeLessThan(20);
    expect(phiDotOf(GYRO, c, deg(55))).toBe(0);
  });
});
