import { describe, expect, it } from 'vitest';
import {
  add4,
  boostX,
  energyInRestFrameOf,
  fixedTargetSqrtS,
  fourMomentum,
  fromVelocity,
  invariantMass,
  kineticEnergy,
  massOf,
  minkowskiDot,
  minkowskiNorm2,
  photon,
  relativeGamma,
  restFrameBeta,
  twoPhotonMass,
  velocityOf,
  type FourVector,
} from '~/physics/fourvector';
import { addVelocities, gammaOf, lorentz, transverseVelocity } from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const BETAS = [-0.9, -0.6, -0.25, 0.1, 0.4, 0.75, 0.95];
const PION = 140; // MeV, the rest energy used by lesson 10.2's figure
const PROTON = 938;

const close = (a: FourVector, b: FourVector, tol = 1e-12) => {
  const scale = Math.max(...a.map(Math.abs), ...b.map(Math.abs));
  for (let i = 0; i < 4; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(tol * scale);
};

describe('analytic limits', () => {
  it('a boost at β = 0 changes nothing', () => {
    const P = fourMomentum(PION, [105, -40, 7]);
    close(boostX(P, 0), P);
  });

  it('a particle at rest seen from a frame at +β has E′ = γmc² and p′c = −γβmc²: it moves at −β there', () => {
    for (const b of BETAS) {
      const P = boostX(fourMomentum(PROTON, 0), b);
      expect(relativeError(P[0], gammaOf(b) * PROTON)).toBeLessThan(1e-12);
      expect(relativeError(P[1], -gammaOf(b) * b * PROTON)).toBeLessThan(1e-12);
      expect(relativeError(velocityOf(P)[0], -b)).toBeLessThan(1e-12);
    }
  });

  it('for slow particles and slow frames the momentum transforms like Newton\'s: p′ ≈ p − mv', () => {
    // m = 1000 MeV, u = 0.002c, frame at 0.001c: the relativistic correction is of order β², below 1e-5
    const m = 1000;
    const P = fromVelocity(m, 0.002);
    const Pp = boostX(P, 0.001);
    const newton = m * 0.002 - m * 0.001;
    expect(relativeError(Pp[1], newton)).toBeLessThan(1e-5);
  });

  it('for slow particles the kinetic energy transforms like Galileo\'s: K′ ≈ ½m(u − v)²', () => {
    const m = 1000;
    const Pp = boostX(fromVelocity(m, 0.003), 0.001);
    expect(relativeError(kineticEnergy(Pp), 0.5 * m * 0.002 ** 2)).toBeLessThan(1e-4);
  });

  it('a photon moving along +x keeps E′ = p′c and is red-shifted by √((1 − β)/(1 + β)) (lesson 9.4)', () => {
    for (const b of BETAS) {
      const Pp = boostX(photon(10), b);
      expect(relativeError(Pp[0], Pp[1])).toBeLessThan(1e-12);
      expect(relativeError(Pp[0], 10 * Math.sqrt((1 - b) / (1 + b)))).toBeLessThan(1e-12);
    }
    // the bank's case: 10 MeV, a frame at 0.6c along the photon: 5.00 MeV
    expect(relativeError(boostX(photon(10), 0.6)[0], 5)).toBeLessThan(1e-12);
  });

  it('a particle moving along y gets p′_x = −γβE and keeps p′_y; its speed agrees with velocity addition', () => {
    const P = fromVelocity(PROTON, [0, 0.6, 0]);
    const Pp = boostX(P, 0.8);
    expect(Pp[2]).toBe(P[2]);
    const [ux, uy] = transverseVelocity(0, 0.6, -0.8, 1); // the S′ velocity of a body with u = (0, 0.6) in S
    const v = velocityOf(Pp);
    expect(relativeError(v[0], ux)).toBeLessThan(1e-12);
    expect(relativeError(v[1], uy)).toBeLessThan(1e-12);
  });

  it('two photons at angle θ have Mc² = √(2E₁E₂(1 − cos θ)): zero when parallel, E₁ + E₂ when opposite', () => {
    expect(twoPhotonMass(100, 100, 0)).toBe(0);
    expect(relativeError(twoPhotonMass(100, 100, Math.PI), 200)).toBeLessThan(1e-12);
    expect(relativeError(twoPhotonMass(100, 100, Math.PI / 2), invariantMass(photon(100, 0), photon(100, Math.PI / 2)))).toBeLessThan(1e-12);
    expect(relativeError(twoPhotonMass(100, 100, Math.PI / 2), Math.SQRT2 * 100)).toBeLessThan(1e-12);
  });

  it('√s on a fixed target is 2mc² for a beam at rest and ≈ √(2mc²E) for E ≫ mc²', () => {
    expect(relativeError(fixedTargetSqrtS(PROTON, PROTON, PROTON), 2 * PROTON)).toBeLessThan(1e-12);
    const E = 1e9;
    expect(relativeError(fixedTargetSqrtS(E, PROTON, PROTON), Math.sqrt(2 * PROTON * E))).toBeLessThan(1e-6);
    // the bank's case: 30 GeV on 0.938 GeV: 7.62 GeV
    expect(relativeError(fixedTargetSqrtS(30, 0.938, 0.938), 7.62)).toBeLessThan(2e-3);
  });

  it('the rest frame of a particle is at β = pc/E, and a massless particle has none', () => {
    const P = fourMomentum(PION, 105); // E = 175, β = 0.6
    expect(relativeError(restFrameBeta(P), 0.6)).toBeLessThan(1e-12);
    expect(Math.abs(boostX(P, restFrameBeta(P))[1])).toBeLessThan(1e-12 * P[0]);
    expect(() => restFrameBeta(photon(5))).toThrow(RangeError);
  });

  it('no frame moves at c: a boost at |β| ≥ 1 throws, and a spacelike four-vector has no mass', () => {
    expect(() => boostX(photon(1), 1)).toThrow(RangeError);
    expect(() => fromVelocity(1, [0.8, 0.7, 0])).toThrow(RangeError);
    expect(() => massOf([1, 2, 0, 0])).toThrow(RangeError);
  });
});

describe('conservation (invariants of the boost)', () => {
  it('P·P = (mc²)² in every frame: the point slides along its mass hyperbola', () => {
    const P = fourMomentum(PION, [105, 30, -20]);
    for (const b of BETAS) expect(relativeError(massOf(boostX(P, b)), PION)).toBeLessThan(1e-12);
  });

  it('the product of two different four-vectors is the same in every frame', () => {
    const A = fourMomentum(PROTON, [500, 200, 0]);
    const B = photon(300, 2.1);
    const ab = minkowskiDot(A, B);
    for (const b of BETAS) expect(relativeError(minkowskiDot(boostX(A, b), boostX(B, b)), ab)).toBeLessThan(1e-12);
  });

  it('a system\'s invariant mass is the same in every frame, though its energy and momentum are not', () => {
    const A = fourMomentum(PION, 105);
    const B = fourMomentum(PION, 0);
    const M = invariantMass(A, B);
    expect(relativeError(M, Math.sqrt(315 ** 2 - 105 ** 2))).toBeLessThan(1e-12);
    for (const b of BETAS) {
      expect(relativeError(invariantMass(boostX(A, b), boostX(B, b)), M)).toBeLessThan(1e-12);
      // the boost of a sum is the sum of the boosts (the transformation is linear)
      close(boostX(add4(A, B), b), add4(boostX(A, b), boostX(B, b)));
    }
  });

  it('the invariant mass is not the sum of the masses: two opposite 100 MeV photons weigh 200 MeV/c²', () => {
    expect(relativeError(invariantMass(photon(100, 0), photon(100, Math.PI)), 200)).toBeLessThan(1e-12);
    // two equal masses closing at γ each: M = 2γm
    const g = gammaOf(0.6);
    expect(relativeError(invariantMass(fromVelocity(PROTON, 0.6), fromVelocity(PROTON, -0.6)), 2 * g * PROTON)).toBeLessThan(1e-12);
  });

  it('in the centre-of-mass frame the total momentum vanishes and the total energy is Mc²', () => {
    const tot = add4(fourMomentum(PION, 105), fourMomentum(PION, 0));
    const cm = boostX(tot, restFrameBeta(tot));
    expect(Math.abs(cm[1])).toBeLessThan(1e-12 * cm[0]);
    expect(relativeError(cm[0], massOf(tot))).toBeLessThan(1e-12);
  });

  it('the energy of one particle in the rest frame of another, from P·Q/m, equals the explicit boost', () => {
    const A = fourMomentum(PROTON, 1250);
    const B = fourMomentum(PROTON, 400);
    const explicit = boostX(A, restFrameBeta(B))[0];
    expect(relativeError(energyInRestFrameOf(A, B), explicit)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('a four-momentum is linear in the mass at fixed velocity, and its boost is linear too', () => {
    const P1 = fromVelocity(1, [0.3, -0.4, 0.2]);
    const P5 = fromVelocity(5, [0.3, -0.4, 0.2]);
    for (let i = 0; i < 4; i++) expect(relativeError(P5[i], 5 * P1[i])).toBeLessThan(1e-12);
    const b1 = boostX(P1, 0.7);
    const b5 = boostX(P5, 0.7);
    for (let i = 0; i < 4; i++) expect(relativeError(b5[i], 5 * b1[i])).toBeLessThan(1e-12);
  });

  it('the invariant mass of two photons scales as √(E₁E₂)', () => {
    expect(relativeError(twoPhotonMass(400, 100, 1), 2 * twoPhotonMass(100, 100, 1))).toBeLessThan(1e-12);
  });
});

describe('analytic identities (composition of boosts, centre-of-mass frame)', () => {
  it('a boost by β₁ then by β₂ is one boost by (β₁ + β₂)/(1 + β₁β₂): velocity addition (lesson 9.4)', () => {
    const P = fourMomentum(PION, [105, 50, 0]);
    for (const b1 of [0.3, -0.5, 0.8]) {
      for (const b2 of [0.6, -0.2, 0.9]) close(boostX(boostX(P, b1), b2), boostX(P, addVelocities(b1, b2, 1)), 1e-11);
    }
  });

  it('a boost undone by the opposite boost returns the original four-vector', () => {
    const P = fourMomentum(PROTON, [-300, 120, 40]);
    for (const b of BETAS) close(boostX(boostX(P, b), -b), P, 1e-11);
  });

  it('the boost of (E, pc) uses the same rows as the Lorentz transformation of (ct, x)', () => {
    const P = fourMomentum(PION, 250);
    const e = lorentz({ t: P[0], x: P[1] }, 0.45, 1);
    const Pp = boostX(P, 0.45);
    expect(relativeError(Pp[0], e.t)).toBeLessThan(1e-12);
    expect(relativeError(Pp[1], e.x)).toBeLessThan(1e-12);
  });

  it('on a fixed target of equal mass, each particle’s γ in the centre-of-mass frame is (√s/2)/mc² = E_tot/√s = γ_cm', () => {
    // the bank's Q-10.2-cm-gamma: 100 GeV proton on a proton at rest, γ* = 7.34
    const m = 0.938;
    const beam = fourMomentum(m, Math.sqrt(100 ** 2 - m ** 2));
    const target = fourMomentum(m, 0);
    const tot = add4(beam, target);
    const sqrtS = massOf(tot);
    const bcm = restFrameBeta(tot);
    expect(relativeError(boostX(beam, bcm)[0] / m, sqrtS / 2 / m)).toBeLessThan(1e-12);
    expect(relativeError(boostX(target, bcm)[0] / m, tot[0] / sqrtS)).toBeLessThan(1e-12);
    expect(relativeError(tot[0] / sqrtS, gammaOf(bcm))).toBeLessThan(1e-12);
    expect(relativeError(sqrtS / 2 / m, 7.34)).toBeLessThan(2e-3);
  });

  it('the relative γ of two particles, P·Q/(m₁m₂), equals γ of their velocity difference', () => {
    const A = fromVelocity(PROTON, 0.8);
    const B = fromVelocity(PROTON, -0.8);
    const brel = addVelocities(0.8, 0.8, 1);
    expect(relativeError(relativeGamma(A, B), gammaOf(brel))).toBeLessThan(1e-12);
    expect(relativeError(minkowskiNorm2(A), PROTON ** 2)).toBeLessThan(1e-12);
  });
});
