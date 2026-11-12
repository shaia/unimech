import { describe, expect, it } from 'vitest';
import { D_EARTH_MOON, G_NEWTON, M_EARTH, M_MOON, R_EARTH } from '~/physics/constants';
import { elementsFromState, type PlanarState } from '~/physics/orbit';
import {
  angularMomentumAboutCM,
  angularMomentumOfBodies,
  barycentre,
  binaryAt,
  binaryPeriod,
  centreOfMass,
  circularBinary,
  fromRelative,
  massesFromSpeeds,
  pairEnergy,
  reducedMass,
  relativeAcceleration,
  stepTwoBody,
  toRelative,
} from '~/physics/twobody';
import { relativeError } from '~/physics/vec';

/** Dimensionless units for the dynamics tests: G = 1, a = 1. */
const GN = 1;

/** A small deterministic generator, so a failure is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const close = (a: number, b: number, scale: number, tol = 1e-12) => expect(Math.abs(a - b) / scale).toBeLessThan(tol);

/** A generic moving pair: the centre of mass drifts, the relative orbit is an ellipse. */
function samplePair(m1: number, m2: number): { b1: PlanarState; b2: PlanarState } {
  const s = binaryAt(GN, m1, m2, 1, 0.5, 0);
  const V: [number, number] = [0.13, -0.07];
  return {
    b1: { r: s.b1.r, v: [s.b1.v[0] + V[0], s.b1.v[1] + V[1]] },
    b2: { r: s.b2.r, v: [s.b2.v[0] + V[0], s.b2.v[1] + V[1]] },
  };
}

describe('analytic identities', () => {
  it('splitting into (R, r) and joining back returns both bodies exactly', () => {
    const r = rng(3);
    for (let i = 0; i < 100; i++) {
      const m1 = 0.1 + 10 * r();
      const m2 = 0.1 + 10 * r();
      const b1: PlanarState = { r: [r() - 0.5, r() - 0.5], v: [r() - 0.5, r() - 0.5] };
      const b2: PlanarState = { r: [r() - 0.5, r() - 0.5], v: [r() - 0.5, r() - 0.5] };
      const back = fromRelative(m1, m2, toRelative(m1, b1, m2, b2));
      for (let k = 0; k < 2; k++) {
        close(back.b1.r[k], b1.r[k], 1);
        close(back.b2.v[k], b2.v[k], 1);
      }
    }
  });

  it('the centre of mass lies on the line between the bodies and divides it inversely to the masses (m₁d₁ = m₂d₂)', () => {
    const { d1, d2 } = barycentre(2, 6, 1);
    expect(relativeError(2 * d1, 6 * d2)).toBeLessThan(1e-15);
    expect(relativeError(d1 + d2, 1)).toBeLessThan(1e-15);
  });

  it('the angular momentum of both bodies about the centre of mass equals μ r × v', () => {
    const m1 = 1.3;
    const m2 = 4.1;
    const { b1, b2 } = samplePair(m1, m2);
    const s = toRelative(m1, b1, m2, b2);
    expect(relativeError(angularMomentumOfBodies(m1, b1, m2, b2), angularMomentumAboutCM(m1, m2, s.r, s.v))).toBeLessThan(1e-13);
  });

  it('the kinetic energy of the bodies equals ½MV² + ½μv² (König, lesson 4.2)', () => {
    const m1 = 0.7;
    const m2 = 2.9;
    const { b1, b2 } = samplePair(m1, m2);
    const K = 0.5 * m1 * (b1.v[0] ** 2 + b1.v[1] ** 2) + 0.5 * m2 * (b2.v[0] ** 2 + b2.v[1] ** 2);
    const e = pairEnergy(GN, m1, m2, toRelative(m1, b1, m2, b2));
    expect(relativeError(e.Kcm + e.Krel, K)).toBeLessThan(1e-13);
  });

  it('the relative acceleration is F/μ, the sum of the two bodies’ accelerations', () => {
    const d = 0.5;
    const F = (G_NEWTON * 2 * 6) / (d * d);
    expect(relativeError(relativeAcceleration(G_NEWTON, 2, 6, d), F / reducedMass(2, 6))).toBeLessThan(1e-14);
    expect(relativeError(relativeAcceleration(G_NEWTON, 2, 6, d), F / 2 + F / 6)).toBeLessThan(1e-14);
  });

  it('a circular binary has energy −Gm₁m₂/(2a) and both bodies share the period', () => {
    const c = circularBinary(GN, 1, 3, 2);
    expect(relativeError(c.E, -(GN * 3) / 4)).toBeLessThan(1e-13);
    expect(relativeError((2 * Math.PI * c.d1) / c.v1, c.T)).toBeLessThan(1e-13);
    expect(relativeError((2 * Math.PI * c.d2) / c.v2, c.T)).toBeLessThan(1e-13);
  });

  it('the masses recovered from both speeds and the period give back the binary they came from', () => {
    const c = circularBinary(G_NEWTON, 3e30, 1.2e30, 4e11);
    const m = massesFromSpeeds(G_NEWTON, c.v1, c.v2, c.T);
    expect(relativeError(m.m1, 3e30)).toBeLessThan(1e-12);
    expect(relativeError(m.m2, 1.2e30)).toBeLessThan(1e-12);
    expect(relativeError(m.a, 4e11)).toBeLessThan(1e-12);
  });

  it('the Earth–Moon centre of mass lies inside the Earth, 4670 km from its centre', () => {
    const { d2 } = barycentre(M_MOON, M_EARTH, D_EARTH_MOON);
    expect(relativeError(d2, 4.67e6)).toBeLessThan(2e-3);
    expect(d2).toBeLessThan(R_EARTH);
  });
});

describe('analytic limits', () => {
  it('as m₁/m₂ → 0, μ → m₁, body 2 stays at the centre of mass and body 1 follows the relative orbit', () => {
    const m1 = 1e-9;
    const m2 = 1;
    expect(relativeError(reducedMass(m1, m2), m1)).toBeLessThan(1e-8);
    const s = binaryAt(GN, m1, m2, 1, 0.3, 0.37);
    expect(Math.hypot(s.b2.r[0], s.b2.r[1])).toBeLessThan(1e-8);
    expect(relativeError(Math.hypot(s.b1.r[0], s.b1.r[1]), Math.hypot(s.r[0], s.r[1]))).toBeLessThan(1e-8);
  });

  it('equal masses: μ = m/2, the bodies are always opposite at equal distances from the centre of mass', () => {
    expect(relativeError(reducedMass(2, 2), 1)).toBeLessThan(1e-15);
    const s = binaryAt(GN, 2, 2, 1, 0.6, 0.81);
    close(s.b1.r[0], -s.b2.r[0], 1);
    close(s.b1.r[1], -s.b2.r[1], 1);
  });

  it('both orbits are ellipses with the relative orbit’s eccentricity, scaled by m₂/M and m₁/M', () => {
    const m1 = 1;
    const m2 = 3;
    const e = 0.55;
    const s = binaryAt(GN, m1, m2, 1, e, 0); // periapsis
    const sa = binaryAt(GN, m1, m2, 1, e, s.T / 2); // apoapsis
    const rp1 = Math.hypot(s.b1.r[0], s.b1.r[1]);
    const ra1 = Math.hypot(sa.b1.r[0], sa.b1.r[1]);
    expect(relativeError((ra1 - rp1) / (ra1 + rp1), e)).toBeLessThan(1e-12);
    expect(relativeError(rp1 + ra1, 2 * (m2 / (m1 + m2)))).toBeLessThan(1e-12);
    const rp2 = Math.hypot(s.b2.r[0], s.b2.r[1]);
    expect(relativeError(rp2 / rp1, m1 / m2)).toBeLessThan(1e-12);
  });

  it('the relative state from binaryAt has the orbit’s elements with GM = G(m₁ + m₂)', () => {
    const s = binaryAt(GN, 0.4, 1.6, 1.5, 0.35, 0.9);
    const el = elementsFromState(GN * 2, s.r, s.v);
    expect(relativeError(el.a, 1.5)).toBeLessThan(1e-12);
    expect(relativeError(el.e, 0.35)).toBeLessThan(1e-11);
  });
});

describe('scaling', () => {
  it('at fixed separation the period goes as (m₁ + m₂)^(−1/2), whichever body carries the mass', () => {
    const T1 = binaryPeriod(GN, 1, 1, 1);
    expect(relativeError(binaryPeriod(GN, 3, 1, 1), T1 / Math.SQRT2)).toBeLessThan(1e-14);
    expect(relativeError(binaryPeriod(GN, 1, 3, 1), binaryPeriod(GN, 3, 1, 1))).toBeLessThan(1e-15);
  });

  it('the barycentre distance scales linearly with the separation', () => {
    expect(relativeError(barycentre(1, 4, 10).d2, 10 * barycentre(1, 4, 1).d2)).toBeLessThan(1e-15);
  });
});

describe('conservation (direct integration of both bodies)', () => {
  const m1 = 1;
  const m2 = 2.5;
  const T = binaryPeriod(GN, m1, m2, 1);

  function run(n: number) {
    let { b1, b2 } = samplePair(m1, m2);
    const start = toRelative(m1, b1, m2, b2);
    const dt = T / n;
    for (let i = 0; i < n; i++) ({ b1, b2 } = stepTwoBody(GN, m1, m2, b1, b2, dt));
    return { start, end: toRelative(m1, b1, m2, b2), b1, b2 };
  }

  it('the centre of mass moves in a straight line at constant velocity: R(T) = R(0) + V T', () => {
    const { start, end } = run(2000);
    close(end.V[0], start.V[0], 1, 1e-12);
    close(end.R[0], start.R[0] + start.V[0] * T, 1, 1e-10);
    close(end.R[1], start.R[1] + start.V[1] * T, 1, 1e-10);
  });

  it('the relative energy ½μv² − Gm₁m₂/r and the angular momentum μ r × v stay constant', () => {
    const { start, end } = run(2000);
    const E0 = pairEnergy(GN, m1, m2, start).Erel;
    const E1 = pairEnergy(GN, m1, m2, end).Erel;
    expect(relativeError(E1, E0)).toBeLessThan(1e-9);
    expect(relativeError(angularMomentumAboutCM(m1, m2, end.r, end.v), angularMomentumAboutCM(m1, m2, start.r, start.v))).toBeLessThan(1e-9);
  });
});

describe('convergence', () => {
  it('integrating both bodies directly converges (fourth order) to the reduced one-body solution', () => {
    const m1 = 0.8;
    const m2 = 2.2;
    const e = 0.5;
    const s0 = binaryAt(GN, m1, m2, 1, e, 0);
    const tEnd = 0.6 * s0.T;
    const exact = binaryAt(GN, m1, m2, 1, e, tEnd);
    const err = (n: number) => {
      let b1 = s0.b1;
      let b2 = s0.b2;
      for (let i = 0; i < n; i++) ({ b1, b2 } = stepTwoBody(GN, m1, m2, b1, b2, tEnd / n));
      return Math.hypot(b1.r[0] - exact.b1.r[0], b1.r[1] - exact.b1.r[1]) + Math.hypot(b2.r[0] - exact.b2.r[0], b2.r[1] - exact.b2.r[1]);
    };
    const e1 = err(400);
    const e2 = err(800);
    expect(e2).toBeLessThan(1e-6);
    // halving dt divides the error by about 2⁴ = 16
    expect(e1 / e2).toBeGreaterThan(12);
    expect(e1 / e2).toBeLessThan(20);
    // the CM stays at the origin throughout
    expect(Math.hypot(...centreOfMass(m1, exact.b1.r, m2, exact.b2.r))).toBeLessThan(1e-14);
  });
});
