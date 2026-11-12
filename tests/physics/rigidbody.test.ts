import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  BETA,
  applyTensor,
  atwoodMassivePulley,
  centreOfPercussion,
  disc,
  discDiameter,
  equivalentLength,
  fastestPivot,
  hangingFromWheel,
  hitPivoted,
  inertiaByIntegral,
  inertiaTensor,
  instantaneousCentre,
  massByIntegral,
  minMuForRolling,
  parallelAxis,
  perpendicularAxis,
  physicalPendulumPeriod,
  pivotImpulse,
  plateCentre,
  plateInPlane,
  pointVelocity,
  precessionRate,
  principalAxes,
  rigidKE,
  ring,
  ringDiameter,
  rodCentre,
  rodEnd,
  rollingAcceleration,
  rollingFriction,
  rollingSpeed,
  skidState,
  skidToRoll,
  solidSphere,
  spinChange,
  steadyPrecession,
  stickToFreeRod,
  uniformAlpha,
  type PointMass,
} from '~/physics/rigidbody';
import { relativeError } from '~/physics/vec';

describe('analytic limits', () => {
  it('a rod about its end is a rod about its centre moved L/2 by the parallel-axis theorem', () => {
    expect(relativeError(parallelAxis(rodCentre(3, 2), 3, 1), rodEnd(3, 2))).toBeLessThan(1e-14);
  });

  it('the perpendicular-axis theorem gives a disc and a ring about a diameter half their axial moment', () => {
    expect(relativeError(perpendicularAxis(discDiameter(2, 0.3), discDiameter(2, 0.3)), disc(2, 0.3))).toBeLessThan(1e-14);
    expect(relativeError(perpendicularAxis(ringDiameter(2, 0.3), ringDiameter(2, 0.3)), ring(2, 0.3))).toBeLessThan(1e-14);
    expect(relativeError(perpendicularAxis(plateInPlane(1, 0.4), plateInPlane(1, 0.6)), plateCentre(1, 0.4, 0.6))).toBeLessThan(1e-14);
  });

  it('a frictionless incline (β → 0) gives a sliding block its g sin θ; a ring rolls at half of it', () => {
    const th = 0.5;
    expect(relativeError(rollingAcceleration(0, th), G * Math.sin(th))).toBeLessThan(1e-14);
    expect(relativeError(rollingAcceleration(BETA.ring, th), (G * Math.sin(th)) / 2)).toBeLessThan(1e-14);
    expect(rollingFriction(1, 0, th)).toBe(0);
  });

  it('a massless pulley gives the Atwood machine its (m₁ − m₂)g/(m₁ + m₂) and equal tensions', () => {
    const r = atwoodMassivePulley(3, 2, 0, 0.1);
    expect(relativeError(r.a, G / 5)).toBeLessThan(1e-14);
    expect(relativeError(r.T1, r.T2)).toBeLessThan(1e-14);
  });

  it('a block on a massless wheel falls freely and a very heavy wheel holds it', () => {
    expect(relativeError(hangingFromWheel(2, 0, 0.1).a, G)).toBeLessThan(1e-14);
    expect(hangingFromWheel(2, 1e9, 0.1).a).toBeLessThan(1e-9);
  });

  it('a point mass on a light rod (I_cm = 0) is a simple pendulum: equivalent length d', () => {
    expect(relativeError(equivalentLength(0.5 * 1.2 ** 2, 0.5, 1.2), 1.2)).toBeLessThan(1e-14);
    expect(relativeError(physicalPendulumPeriod(0.5 * 1.2 ** 2, 0.5, 1.2), 2 * Math.PI * Math.sqrt(1.2 / G))).toBeLessThan(1e-14);
  });

  it('a rod pivoted at its end has its centre of percussion at 2L/3, and a blow there leaves no impulse at the pivot', () => {
    const m = 1.5;
    const L = 0.9;
    const s = centreOfPercussion(rodCentre(m, L), m, L / 2);
    expect(relativeError(s, (2 * L) / 3)).toBeLessThan(1e-14);
    expect(Math.abs(pivotImpulse(4, s, rodEnd(m, L), m, L / 2))).toBeLessThan(1e-14);
  });

  it('the period of a physical pendulum is shortest at the radius of gyration', () => {
    const m = 2;
    const Icm = rodCentre(m, 1);
    const T = (d: number) => physicalPendulumPeriod(parallelAxis(Icm, m, d), m, d);
    const k = fastestPivot(Icm, m);
    expect(T(k)).toBeLessThan(T(k * 1.01));
    expect(T(k)).toBeLessThan(T(k * 0.99));
  });

  it('a point at rest on a rolling wheel is the contact point, and the top moves at 2v', () => {
    const v = 3;
    const R = 0.4;
    const omega = -v / R; // rolling to +x turns clockwise
    const c = instantaneousCentre([v, 0], omega);
    expect(c).not.toBeNull();
    if (c) expect(Math.hypot(c[0], c[1] + R)).toBeLessThan(1e-14);
    const top = pointVelocity([v, 0], omega, [0, R]);
    expect(relativeError(top[0], 2 * v)).toBeLessThan(1e-14);
    expect(pointVelocity([v, 0], omega, [0, -R])[0]).toBeCloseTo(0, 14);
  });

  it('a particle elastic on a pivoted body with I_P = m b² stops dead, like equal masses head-on', () => {
    const r = hitPivoted(2, 3, 0.5, 2 * 0.25, true);
    expect(Math.abs(r.vAfter)).toBeLessThan(1e-14);
    expect(relativeError(r.omega, 3 / 0.5)).toBeLessThan(1e-14);
  });

  it('the inertia tensor of a dumbbell on a tilted axis has off-diagonal terms: L is not parallel to ω', () => {
    const a = 0.3;
    const pts: PointMass[] = [
      { m: 1, r: [a, a, 0] },
      { m: 1, r: [-a, -a, 0] },
    ];
    const L = applyTensor(inertiaTensor(pts), [1, 0, 0]);
    expect(Math.abs(L[1])).toBeGreaterThan(0.1);
    const { moments, axes } = principalAxes(inertiaTensor(pts));
    expect(Math.abs(moments[0])).toBeLessThan(1e-14);
    expect(relativeError(Math.abs(axes[0][0]), Math.SQRT1_2)).toBeLessThan(1e-12);
    const Lp = applyTensor(inertiaTensor(pts), axes[2]);
    expect(relativeError(Math.hypot(...Lp), moments[2])).toBeLessThan(1e-12);
  });

  it('the slow steady precession of a fast top tends to m g d/(I₃ ω₃) at any tilt', () => {
    const m = 0.3;
    const d = 0.04;
    const I1 = 4e-4;
    const I3 = 2e-4;
    for (const th of [0.2, 0.8, Math.PI / 2]) {
      const roots = steadyPrecession(m, d, I1, I3, 2000, th);
      expect(roots).not.toBeNull();
      if (roots) expect(relativeError(roots[0], precessionRate(m, d, I3, 2000))).toBeLessThan(1e-3);
    }
    expect(steadyPrecession(m, d, I1, I3, 1, 0.2)).toBeNull();
  });

  it('below the horizontal the slow precession still comes first and the fast one is retrograde', () => {
    const roots = steadyPrecession(0.3, 0.04, 4e-4, 2e-4, 2000, 2.2);
    expect(roots).not.toBeNull();
    if (roots) {
      expect(relativeError(roots[0], precessionRate(0.3, 0.04, 2e-4, 2000))).toBeLessThan(1e-3);
      expect(roots[1]).toBeLessThan(0);
    }
  });
});

describe('conservation', () => {
  it('a body rolling from rest down a height h has m g h of kinetic energy, split as β/(1 + β) rotational', () => {
    const m = 2;
    const R = 0.1;
    const h = 1.3;
    for (const beta of Object.values(BETA)) {
      const v = rollingSpeed(beta, h);
      expect(relativeError(rigidKE(m, v, beta * m * R * R, v / R), m * G * h)).toBeLessThan(1e-14);
    }
  });

  it('a skidding ball ends rolling with the angular momentum about the contact line it started with', () => {
    const R = 0.11;
    const beta = BETA.solidSphere;
    const r = skidToRoll(6, 4, R, beta, 0.2);
    // friction acts at the floor: about a point on the floor it has no torque, so v + β R ω is conserved
    expect(relativeError(r.vFinal + beta * R * r.omegaFinal, 6 + beta * R * 4)).toBeLessThan(1e-14);
    const lost = 0.5 * 36 + 0.5 * beta * R * R * 16 - 0.5 * r.vFinal ** 2 - 0.5 * beta * R * R * r.omegaFinal ** 2;
    expect(relativeError(lost, r.heatPerMass)).toBeLessThan(1e-12);
  });

  it('a skater who pulls in their arms keeps I ω and gains kinetic energy I₁/I₂ times', () => {
    const w2 = spinChange(3, 2, 1.2);
    expect(relativeError(1.2 * w2, 6)).toBeLessThan(1e-14);
    expect(relativeError((0.5 * 1.2 * w2 * w2) / (0.5 * 3 * 4), 3 / 1.2)).toBeLessThan(1e-14);
  });

  it('a particle sticking to a free rod conserves momentum and angular momentum about the combined CM', () => {
    const m = 0.2;
    const v = 5;
    const M = 1;
    const L = 1.2;
    const b = 0.4;
    const r = stickToFreeRod(m, v, M, L, b);
    expect(relativeError((m + M) * r.Vcm, m * v)).toBeLessThan(1e-14);
    expect(relativeError(r.I * r.omega, m * v * (b - r.c))).toBeLessThan(1e-14);
  });

  it('an elastic hit on a pivoted body keeps kinetic energy; a sticking hit loses some', () => {
    const m = 0.1;
    const v = 8;
    const b = 0.7;
    const Ip = rodEnd(1.2, 0.9);
    const e = hitPivoted(m, v, b, Ip, true);
    expect(relativeError(0.5 * m * e.vAfter ** 2 + 0.5 * Ip * e.omega ** 2, 0.5 * m * v * v)).toBeLessThan(1e-13);
    const s = hitPivoted(m, v, b, Ip, false);
    expect(0.5 * (Ip + m * b * b) * s.omega ** 2).toBeLessThan(0.5 * m * v * v);
  });
});

describe('scaling', () => {
  it('every standard moment of inertia scales as m R² and the rolling race is ordered by β alone', () => {
    for (const f of [ring, disc, solidSphere]) expect(relativeError(f(2, 0.6), 8 * f(1, 0.3))).toBeLessThan(1e-14);
    const a = (Object.keys(BETA) as (keyof typeof BETA)[]).map((k) => rollingAcceleration(BETA[k], 0.4));
    expect(a[3]).toBeGreaterThan(a[1]); // solid sphere beats the disc
    expect(a[1]).toBeGreaterThan(a[2]); // the disc beats the hollow sphere
    expect(a[2]).toBeGreaterThan(a[0]); // the hollow sphere beats the ring
  });

  it('the friction needed to roll grows as tan θ', () => {
    expect(relativeError(minMuForRolling(0.5, 0.6) / minMuForRolling(0.5, 0.3), Math.tan(0.6) / Math.tan(0.3))).toBeLessThan(1e-14);
  });

  it('the gyroscopic precession halves when the spin doubles', () => {
    expect(relativeError(precessionRate(1, 0.1, 0.01, 200) / precessionRate(1, 0.1, 0.01, 100), 0.5)).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('the integral of λ s² over a uniform rod converges to mL²/12 at second order', () => {
    const m = 3;
    const L = 2;
    const lam = () => m / L;
    const e1 = relativeError(inertiaByIntegral(lam, -L / 2, L / 2, 10), rodCentre(m, L));
    const e2 = relativeError(inertiaByIntegral(lam, -L / 2, L / 2, 20), rodCentre(m, L));
    expect(e1 / e2).toBeGreaterThan(3.9);
    expect(e1 / e2).toBeLessThan(4.1);
  });

  it('a rod whose density grows linearly from one end has I = mL²/2 about its light end', () => {
    const m = 3;
    const L = 2;
    const lam = (s: number) => ((2 * m) / (L * L)) * s;
    expect(relativeError(massByIntegral(lam, 0, L, 4000), m)).toBeLessThan(1e-12);
    expect(relativeError(inertiaByIntegral(lam, 0, L, 4000), (m * L * L) / 2)).toBeLessThan(1e-6);
  });

  it('the skidding state joins the rolling state continuously at t_roll', () => {
    const R = 0.1;
    const beta = BETA.solidSphere;
    const { tRoll } = skidToRoll(5, 0, R, beta, 0.3);
    const a = skidState(5, 0, R, beta, 0.3, tRoll * (1 - 1e-9));
    const b = skidState(5, 0, R, beta, 0.3, tRoll * (1 + 1e-9));
    expect(relativeError(a.x, b.x)).toBeLessThan(1e-8);
    expect(relativeError(a.v, b.v)).toBeLessThan(1e-8);
    expect(relativeError(a.phi, b.phi)).toBeLessThan(1e-8);
    expect(relativeError(b.v, b.omega * R)).toBeLessThan(1e-14);
  });

  it('uniform angular acceleration obeys ω² = ω₀² + 2αΔθ', () => {
    const s = uniformAlpha(0, 30, -5, 4);
    expect(relativeError(s.omega ** 2, 900 + 2 * -5 * s.theta)).toBeLessThan(1e-14);
  });
});
