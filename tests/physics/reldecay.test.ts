import { describe, expect, it } from 'vitest';
import {
  classicalDecay,
  cmBeta,
  cmBetaFixedTarget,
  decayAtRest,
  decayEnergies,
  decayInFlight,
  decayKinetic,
  decayMomentum,
  decayQ,
  fixedTargetEnergyFor,
  fromPrimed,
  invariantMass,
  labEnergyRange,
  movingAt,
  openingAngle,
  pairMass,
  particle,
  sqrtSCollider,
  sqrtSFixedTarget,
  sqrtSHeadOn,
  thresholdKineticCollider,
  thresholdKineticFixedTarget,
  thresholdKineticNewtonian,
  toPrimed,
  total,
  type FourMomentum,
} from '~/physics/reldecay';
import { gammaOf } from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

// rest energies in MeV, as the lesson states them
const PI = 140;
const PI0 = 135;
const MU = 106;
const P = 938;
const LAMBDA = 1116;
const K0 = 498;

const close = (a: number, b: number, tol = 1e-12) => expect(relativeError(a, b)).toBeLessThan(tol);
const sameP4 = (a: FourMomentum, b: FourMomentum, tol = 1e-12) => {
  const scale = Math.max(Math.abs(a.E), Math.abs(b.E));
  expect(Math.abs(a.E - b.E) / scale).toBeLessThan(tol);
  expect(Math.abs(a.px - b.px) / scale).toBeLessThan(tol);
  expect(Math.abs(a.py - b.py) / scale).toBeLessThan(tol);
};

const DECAYS: [number, number, number][] = [
  [PI, MU, 0],
  [PI, 0, MU],
  [LAMBDA, P, PI],
  [K0, PI, PI],
  [1000, 499, 499],
];
const BETAS = [-0.9, -0.3, 0, 0.2, 0.6, 0.95, 0.999];
const ANGLES = [0, 0.4, Math.PI / 2, 2.5, Math.PI];

describe('analytic cases (the numbers of the bank and the lesson)', () => {
  it('π⁺ → μ⁺ν at rest: E_μ = 110.1 MeV, K_μ = 4.13 MeV, p = 29.9 MeV/c, the neutrino takes 29.9 of Q = 34', () => {
    const [Emu, Enu] = decayEnergies(PI, MU, 0);
    close(Emu, (PI * PI + MU * MU) / (2 * PI));
    expect(Emu).toBeCloseTo(110.13, 2);
    close(decayMomentum(PI, MU, 0), (PI * PI - MU * MU) / (2 * PI));
    expect(decayMomentum(PI, MU, 0)).toBeCloseTo(29.87, 2);
    close(Enu, decayMomentum(PI, MU, 0));
    const [Kmu, Knu] = decayKinetic(PI, MU, 0);
    expect(Kmu).toBeCloseTo(4.13, 2);
    close(Kmu + Knu, decayQ(PI, MU, 0));
  });

  it('Λ⁰ → pπ⁻ at rest: p* = 101 MeV/c (Newton: 96.2); the pion takes 32.6 of Q = 38 MeV', () => {
    expect(decayMomentum(LAMBDA, P, PI)).toBeCloseTo(100.9, 1);
    expect(classicalDecay(LAMBDA, P, PI).p).toBeCloseTo(96.2, 1);
    const [Kp, Kpi] = decayKinetic(LAMBDA, P, PI);
    expect(Kpi).toBeCloseTo(32.6, 1);
    expect(Kp).toBeCloseTo(5.4, 1);
  });

  it('K⁰ → π⁺π⁻ at rest: equal masses share Q = 218 MeV equally, 109 MeV each', () => {
    const [K1, K2] = decayKinetic(K0, PI, PI);
    close(K1, K2);
    close(K1, 109);
  });

  it('p + p → p + p + p + p̄: 6mc² on a fixed target, mc² per beam head on', () => {
    close(thresholdKineticFixedTarget(P, P, 4 * P), 6 * P);
    close(thresholdKineticCollider(P, 4 * P), P);
  });

  it('p + p → p + p + π⁰: K_th = 2m_π + m_π²/(2m_p) = 279.7 MeV on a fixed target, m_π/2 per beam head on', () => {
    close(thresholdKineticFixedTarget(P, P, 2 * P + PI0), 2 * PI0 + (PI0 * PI0) / (2 * P));
    expect(thresholdKineticFixedTarget(P, P, 2 * P + PI0)).toBeCloseTo(279.7, 1);
    close(thresholdKineticCollider(P, 2 * P + PI0), PI0 / 2);
  });

  it('the pair mass of two tracks: a proton and a pion at rest together have mass m_p + m_π; a pair can identify a Λ⁰', () => {
    close(pairMass(P, 0, PI, 0, 0), P + PI);
    // back to back with the decay momentum of Λ⁰ → pπ⁻: the pair mass is the Λ⁰'s
    close(pairMass(P, decayMomentum(LAMBDA, P, PI), PI, decayMomentum(LAMBDA, P, PI), Math.PI), LAMBDA, 1e-12);
  });
});

describe('analytic limits', () => {
  it('at the edge M = m₁ + m₂ the products are born at rest', () => {
    expect(decayMomentum(P + PI, P, PI)).toBe(0);
    const [K1, K2] = decayKinetic(P + PI, P, PI);
    expect(Math.abs(K1) + Math.abs(K2)).toBeLessThan(1e-9);
  });

  it('below the edge the decay is forbidden', () => {
    expect(() => decayMomentum(P, P, PI)).toThrow(RangeError);
  });

  it('a massless product: pc = (M² − m²)/(2M) and E = pc', () => {
    for (const M of [140, 494, 1000]) {
      const p = decayMomentum(M, 0, 106);
      close(p, (M * M - 106 * 106) / (2 * M));
      close(decayEnergies(M, 0, 106)[0], p);
    }
  });

  it('non-relativistic limit: when Q ≪ the masses, p → √(2μQ) and Q is shared in the inverse ratio of the masses (Newton)', () => {
    const m1 = 1000;
    const m2 = 3000;
    let prev = Infinity;
    for (const Q of [10, 1, 0.1, 0.01]) {
      const M = m1 + m2 + Q;
      const c = classicalDecay(M, m1, m2);
      const [K1, K2] = decayKinetic(M, m1, m2);
      const err = relativeError(K1, c.K1);
      // the relative error is of order Q/m: it shrinks tenfold with Q
      expect(err).toBeLessThan(prev);
      prev = err;
      expect(relativeError(decayMomentum(M, m1, m2), c.p)).toBeLessThan(Q / m1);
      expect(relativeError(K1 / K2, m2 / m1)).toBeLessThan(Q / m1);
    }
    expect(prev).toBeLessThan(1e-5);
  });

  it('a heavy target turns all of the beam energy into new mass: K_th → Δ as M → ∞', () => {
    const m = 938;
    const delta = 135;
    for (const M of [1e6, 1e8]) close(thresholdKineticFixedTarget(m, M, m + M + delta), delta, (3 * m) / M);
  });

  it('Newton’s threshold Δ(m + M)/M is the small-Δ limit of the relativistic one; the difference is exactly Δ²/(2M)', () => {
    const m = 938;
    const M = 938;
    for (const delta of [1, 135, 1876]) {
      const rel = thresholdKineticFixedTarget(m, M, m + M + delta);
      close(rel - thresholdKineticNewtonian(m, M, m + M + delta), (delta * delta) / (2 * M), 1e-6);
    }
    const d = 0.01;
    close(thresholdKineticFixedTarget(m, M, m + M + d), thresholdKineticNewtonian(m, M, m + M + d), 1e-5);
  });

  it('a reaction whose products are no heavier than its inputs has no threshold', () => {
    expect(thresholdKineticFixedTarget(P, P, 2 * P)).toBe(0);
    expect(thresholdKineticCollider(P, 2 * P)).toBe(0);
  });
});

describe('conservation in every frame', () => {
  it('at rest: the products’ momenta cancel and their energies add up to M', () => {
    for (const [M, m1, m2] of DECAYS)
      for (const th of ANGLES) {
        const t = total(decayAtRest(M, m1, m2, th));
        close(t.E, M);
        expect(Math.hypot(t.px, t.py)).toBeLessThan(1e-12 * M);
      }
  });

  it('in flight: the products carry the parent’s energy γM and momentum γβM, for every angle and speed', () => {
    for (const [M, m1, m2] of DECAYS)
      for (const b of BETAS)
        for (const th of ANGLES) sameP4(total(decayInFlight(M, m1, m2, b, th)), movingAt(M, b), 1e-12);
  });

  it('each product keeps its own mass in the lab: E² − p² = m²', () => {
    for (const [M, m1, m2] of DECAYS)
      for (const b of BETAS) {
        for (const [q, m] of [...decayInFlight(M, m1, m2, b, 1.1)].map((q, i) => [q, i ? m2 : m1] as const)) {
          // a massless product has E² − p² = 0 only to rounding of E²: compare on the scale of E²
          expect(Math.abs(q.E * q.E - q.px * q.px - q.py * q.py - m * m)).toBeLessThan(1e-12 * q.E * q.E);
        }
      }
  });

  it('at threshold on a fixed target the lab energy that does not become mass is the kinetic energy of the products moving together', () => {
    const K = thresholdKineticFixedTarget(P, P, 4 * P);
    const bcm = cmBetaFixedTarget(K, P, P);
    // the four products, at rest in the CM frame, move together at β_cm in the lab and carry E and p
    const lab = movingAt(4 * P, bcm);
    sameP4(lab, total([particle(P, Math.sqrt((K + P) ** 2 - P * P)), particle(P, 0)]), 1e-12);
    close(bcm, Math.sqrt(48) / 8, 1e-12);
    close(gammaOf(bcm), 2, 1e-12);
  });
});

describe('invariance of √s', () => {
  it('the products’ invariant mass is the parent’s mass in every frame', () => {
    for (const [M, m1, m2] of DECAYS)
      for (const b of BETAS) for (const th of ANGLES) close(invariantMass(decayInFlight(M, m1, m2, b, th)), M, 1e-10);
  });

  it('√s of a beam on a fixed target is the same seen from the CM frame, where the total momentum is zero', () => {
    for (const K of [10, 280, 5628, 1e5]) {
      const beam = particle(P, Math.sqrt((K + P) ** 2 - P * P));
      const target = particle(P, 0);
      const bcm = cmBeta([beam, target]);
      const cm = [toPrimed(beam, bcm), toPrimed(target, bcm)];
      const t = total(cm);
      expect(Math.abs(t.px)).toBeLessThan(1e-9 * t.E);
      close(t.E, sqrtSFixedTarget(K, P, P), 1e-12);
      close(invariantMass([beam, target]), sqrtSFixedTarget(K, P, P), 1e-12);
    }
  });

  it('head on, equal beams: the lab is the CM frame and √s = 2E; the general head-on formula agrees', () => {
    for (const K of [0, 67.5, 938, 6800e3]) close(sqrtSHeadOn(K + P, P, K + P, P), sqrtSCollider(K, P), 1e-12);
  });

  it('a target at rest seen from a moving frame is a head-on collision with the same √s', () => {
    const K = 2000;
    const beam = particle(P, Math.sqrt((K + P) ** 2 - P * P));
    const target = particle(P, 0);
    for (const b of [0.3, 0.7]) {
      const bq = toPrimed(beam, b);
      const tq = toPrimed(target, b);
      close(sqrtSHeadOn(bq.E, P, tq.E, P), sqrtSFixedTarget(K, P, P), 1e-12);
    }
  });

  it('fromPrimed and toPrimed are inverse', () => {
    const q = { E: 500, px: 120, py: -40 };
    sameP4(fromPrimed(toPrimed(q, 0.63), 0.63), q, 1e-13);
  });
});

describe('scaling', () => {
  it('fixed target: √s grows like √E at high energy (doubling E multiplies √s by √2); head on it grows like E', () => {
    const r = sqrtSFixedTarget(200e3 - P, P, P) / sqrtSFixedTarget(100e3 - P, P, P);
    close(r, Math.SQRT2, 1e-2);
    expect(sqrtSFixedTarget(100e3 - P, P, P) / 1000).toBeCloseTo(13.8, 1);
    expect(sqrtSFixedTarget(200e3 - P, P, P) / 1000).toBeCloseTo(19.4, 1);
    close(sqrtSCollider(200e3 - P, P) / sqrtSCollider(100e3 - P, P), 2, 1e-12);
  });

  it('the fixed-target energy for a given √s grows like s: the inverse of √s(E)', () => {
    for (const rs of [2000, 13.6e6]) close(sqrtSFixedTarget(fixedTargetEnergyFor(rs, P, P) - P, P, P), rs, 1e-12);
  });

  it('in flight the lab energy of a product ranges over γ(E* ± βp*); a fast parent throws both products forward', () => {
    const [lo, hi] = labEnergyRange(PI, 0, MU, 0.6, 1);
    const g = gammaOf(0.6);
    const p = decayMomentum(PI, 0, MU);
    close(lo, g * 0.4 * p);
    close(hi, g * 1.6 * p);
    const [n1, n2] = decayInFlight(PI, 0, MU, 0.9, Math.PI / 2);
    expect(openingAngle(n1, n2)).toBeLessThan(Math.PI / 2);
    const [a1, a2] = decayAtRest(PI, 0, MU, Math.PI / 2);
    close(openingAngle(a1, a2), Math.PI);
  });
});
