import { describe, expect, it } from 'vitest';
import { C_LIGHT, M_ELECTRON, M_PROTON } from '~/physics/constants';
import {
  betaFromEnergyMev,
  betaFromKineticMev,
  betaFromMomentumEnergy,
  betaFromMomentumMev,
  classicalBetaFromKineticMev,
  classicalKinetic,
  classicalKineticFromMomentumMev,
  classicalMomentum,
  collisionYMomentumChange,
  eOverMc2,
  energy,
  energyFromBeta,
  energyFromMomentumMev,
  gammaFromKineticMev,
  kOverMc2,
  kOverMc2Series,
  kinetic,
  kineticFromBeta,
  kineticFromMomentumMev,
  kineticRatio,
  mevFromJoules,
  momentum,
  momentumFromEnergyMev,
  momentumFromKineticMev,
  momentumSiFromMev,
  oneMinusBetaFromGamma,
  pOverMc,
  pcFromBeta,
  restEnergy,
  restEnergyFromEnergyMomentum,
  restEnergyFromKineticMomentum,
} from '~/physics/relenergy';
import { gammaOf } from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const c = C_LIGHT;
const close = (a: number, b: number, tol = 1e-12) => expect(relativeError(a, b)).toBeLessThan(tol);
const BETAS = [1e-6, 0.01, 0.1, 0.3, 0.5, 0.6, 0.8, 0.9, 0.99, 0.999];

describe('analytic limits', () => {
  it('at β = 0.6: γ = 5/4, p = (3/4)mc, K = mc²/4; at β = 0.8: γ = 5/3, p = (4/3)mc, K = (2/3)mc²', () => {
    close(eOverMc2(0.6), 1.25);
    close(pOverMc(0.6), 0.75);
    close(kOverMc2(0.6), 0.25);
    close(eOverMc2(0.8), 5 / 3);
    close(pOverMc(0.8), 4 / 3);
    close(kOverMc2(0.8), 2 / 3);
  });

  it('a body at rest has p = 0, K = 0 and E = mc², its rest energy', () => {
    expect(pOverMc(0)).toBe(0);
    expect(kOverMc2(0)).toBe(0);
    expect(eOverMc2(0)).toBe(1);
    close(energy(2, 0), restEnergy(2));
  });

  it("at low speed the relativistic momentum and kinetic energy reduce to Newton's mv and ½mv²", () => {
    const m = 3;
    const v = 1e-4 * c;
    close(momentum(m, v), classicalMomentum(m, v), 1e-8);
    close(kinetic(m, v), classicalKinetic(m, v), 1e-8);
  });

  it('K/(½mv²) − 1 → (3/4)β² as β → 0 (0.756% at β = 0.1, the ladder key)', () => {
    for (const b of [1e-3, 1e-2]) close((kineticRatio(b) - 1) / (0.75 * b * b), 1, 2 * b * b);
    close((kineticRatio(0.1) - 1) * 100, 0.7563, 1e-3);
    expect(kineticRatio(0)).toBe(1);
  });

  it('as β → 1 the momentum and the kinetic energy grow without bound, while Newton stays finite', () => {
    expect(pOverMc(0.999999)).toBeGreaterThan(700);
    expect(kOverMc2(0.999999)).toBeGreaterThan(700);
    expect(kineticRatio(0.999999)).toBeGreaterThan(1000);
    expect(() => pOverMc(1)).toThrow(RangeError);
  });

  it('a massless particle has E = pc, K = pc and moves at exactly c, whatever its energy', () => {
    for (const pc of [1e-3, 1, 100, 1e6]) {
      expect(energyFromMomentumMev(pc, 0)).toBe(pc);
      close(kineticFromMomentumMev(pc, 0), pc);
      expect(betaFromMomentumMev(pc, 0)).toBe(1);
    }
  });

  it('ultra-relativistic: E → pc, and E − pc → (mc²)²/(2pc) when pc ≫ mc²', () => {
    const mc2 = 1;
    const pc = 1e4;
    close((energyFromMomentumMev(pc, mc2) - pc) / (mc2 ** 2 / (2 * pc)), 1, 1e-7);
  });

  it('non-relativistic: K from the momentum → p²/(2m) − p⁴/(8m³c²) when pc ≪ mc²', () => {
    const mc2 = 1;
    const pc = 1e-2;
    const series = (pc * pc) / (2 * mc2) - pc ** 4 / (8 * mc2 ** 3);
    close(kineticFromMomentumMev(pc, mc2), series, 1e-8);
    close(kineticFromMomentumMev(pc, mc2), classicalKineticFromMomentumMev(pc, mc2), 1e-4);
  });

  it('1 − β ≈ 1/(2γ²) for γ ≫ 1, computed without cancellation (a 6.5 TeV proton)', () => {
    const g = 6500e3 / 938;
    close(oneMinusBetaFromGamma(g), 1 / (2 * g * g), 1e-7);
    close(oneMinusBetaFromGamma(1.25), 0.4);
  });
});

describe('invariants and identities', () => {
  it('E² − (pc)² = (mc²)² at every speed: the energy triangle', () => {
    for (const b of BETAS) close(eOverMc2(b) ** 2 - pOverMc(b) ** 2, 1, 1e-9 / (1 - b) ** 2);
    const m = M_PROTON;
    const v = 0.8 * c;
    close(energy(m, v) ** 2 - (momentum(m, v) * c) ** 2, restEnergy(m) ** 2, 1e-12);
  });

  it('v = pc²/E returns the speed the particle was given', () => {
    for (const b of BETAS) close(betaFromMomentumEnergy(pcFromBeta(b, 7), energyFromBeta(b, 7)), b, 1e-12);
    const m = M_ELECTRON;
    const v = 0.3 * c;
    close((momentum(m, v) * c * c) / energy(m, v), v);
  });

  it('dE/dp = v: the slope of the hyperbola E(p) is the speed (central difference)', () => {
    const mc2 = 1;
    for (const pc of [0.1, 1, 10]) {
      const h = 1e-5 * pc;
      const slope = (energyFromMomentumMev(pc + h, mc2) - energyFromMomentumMev(pc - h, mc2)) / (2 * h);
      close(slope, betaFromMomentumMev(pc, mc2), 1e-8);
    }
  });

  it('the work-energy relation dK = v dp: ∫ β d(pc) from rest equals (γ − 1)mc²', () => {
    const b1 = 0.9;
    const n = 4000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const p0 = pOverMc((b1 * i) / n);
      const p1 = pOverMc((b1 * (i + 1)) / n);
      const bm = betaFromMomentumMev((p0 + p1) / 2, 1);
      sum += bm * (p1 - p0);
    }
    close(sum, kOverMc2(b1), 1e-6);
  });

  it("conservation in the thought experiment: γm·v_y is conserved at every u and β, Newton's m·v_y misses by 2mu(1 − 1/γ)", () => {
    for (const b of [0.1, 0.6, 0.9, 0.99]) {
      for (const u of [1e-4, 0.01, 0.3, 0.8]) {
        const d = collisionYMomentumChange(b, u);
        expect(Math.abs(d.relativistic)).toBeLessThan(1e-12 * u * gammaOf(b));
        close(d.newton, -2 * u * (1 - 1 / gammaOf(b)), 1e-12);
      }
    }
    // the figure's readout at 0.6c: −0.4 mu
    close(collisionYMomentumChange(0.6, 1e-3).newton / 1e-3, -0.4, 1e-12);
    // and no imbalance without relative motion (β → 0 like −β²u)
    close(collisionYMomentumChange(1e-3, 0.01).newton / (-0.01 * 1e-6), 1, 1e-5);
  });

  it('round trips: β → K → β, β → p → β, p → E → p, (K, p) → mc², (E, p) → mc²', () => {
    const mc2 = 938;
    for (const b of BETAS.slice(1)) {
      close(betaFromKineticMev(kineticFromBeta(b, mc2), mc2), b, 1e-9);
      close(betaFromMomentumMev(pcFromBeta(b, mc2), mc2), b, 1e-12);
      close(betaFromEnergyMev(energyFromBeta(b, mc2), mc2), b, 1e-9);
      close(gammaFromKineticMev(kineticFromBeta(b, mc2), mc2), gammaOf(b), 1e-12);
    }
    close(momentumFromEnergyMev(energyFromMomentumMev(500, mc2), mc2), 500, 1e-12);
    close(momentumFromKineticMev(kineticFromMomentumMev(500, mc2), mc2), 500, 1e-12);
    close(restEnergyFromEnergyMomentum(energyFromMomentumMev(310, 140), 310), 140, 1e-12);
    close(restEnergyFromKineticMomentum(kineticFromMomentumMev(310, 140), 310), 140, 1e-12);
  });

  it('the SI and the MeV families agree: an electron at 0.8c has K ≈ 0.341 MeV', () => {
    const k = mevFromJoules(kinetic(M_ELECTRON, 0.8 * c));
    expect(relativeError(k, kineticFromBeta(0.8, 0.511))).toBeLessThan(0.005);
    close(momentumSiFromMev(pcFromBeta(0.8, mevFromJoules(restEnergy(M_ELECTRON)))), momentum(M_ELECTRON, 0.8 * c), 1e-12);
  });

  it('no particle has E below its rest energy or pc above its energy', () => {
    expect(() => momentumFromEnergyMev(0.5, 1)).toThrow(RangeError);
    expect(() => betaFromMomentumEnergy(2, 1)).toThrow(RangeError);
    expect(() => restEnergyFromEnergyMomentum(1, 2)).toThrow(RangeError);
  });
});

describe('scaling', () => {
  it('p/(mc), E/(mc²) and K/(mc²) depend on β alone: the same β gives the same ratios for any mass', () => {
    for (const m of [M_ELECTRON, M_PROTON, 1]) {
      close(momentum(m, 0.7 * c) / (m * c), pOverMc(0.7));
      close(kinetic(m, 0.7 * c) / restEnergy(m), kOverMc2(0.7));
    }
  });

  it('the speed depends only on K/(mc²): a proton with K = 2mc² and an electron with K = 2mc² move at 0.943c', () => {
    close(betaFromKineticMev(2 * 938, 938), Math.sqrt(8 / 9));
    close(betaFromKineticMev(2 * 0.511, 0.511), Math.sqrt(8 / 9));
  });

  it("Newton's speed √(2K/mc²) grows as √K and passes c at K = mc²/2; the true speed stays below c", () => {
    close(classicalBetaFromKineticMev(0.5, 1), 1);
    for (const K of [0.5, 2, 20, 2000]) expect(betaFromKineticMev(K, 1)).toBeLessThan(1);
    close(classicalBetaFromKineticMev(4, 1) / classicalBetaFromKineticMev(1, 1), 2);
  });

  it('at fixed momentum the speed falls as the mass grows (photon > electron > muon > proton)', () => {
    const order = [0, 0.511, 106, 938].map((mc2) => betaFromMomentumMev(100, mc2));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThan(order[i - 1]);
  });
});

describe('convergence', () => {
  it('the series ½β² + ⅜β⁴ + … converges to γ − 1, its error falling about as β^(2n+2)', () => {
    for (const b of [0.1, 0.5, 0.9]) {
      let last = Infinity;
      for (const n of [1, 2, 4, 8, 16, 32]) {
        const err = Math.abs(kOverMc2Series(b, n) - kOverMc2(b));
        // strictly smaller until the error reaches rounding level
        if (last > 1e-14 * kOverMc2(b)) expect(err).toBeLessThan(last);
        else expect(err).toBeLessThanOrEqual(1e-14 * kOverMc2(b));
        last = err;
      }
      expect(relativeError(kOverMc2Series(b, 400), kOverMc2(b))).toBeLessThan(1e-9);
    }
    // two terms at β = 0.1: the error is the third term, 5/16·β⁶, to a few per cent
    close(kOverMc2(0.1) - kOverMc2Series(0.1, 2), (5 / 16) * 1e-6, 0.03);
  });

  it('the cancellation-free K/(mc²) agrees with γ − 1 where both are accurate', () => {
    for (const b of [0.3, 0.6, 0.9]) close(kOverMc2(b), gammaOf(b) - 1, 1e-13);
    // at β = 1e-6, γ − 1 computed directly keeps only a few digits; the series is exact there
    close(kOverMc2(1e-6), kOverMc2Series(1e-6, 3), 1e-12);
  });
});
