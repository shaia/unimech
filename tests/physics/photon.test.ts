import { describe, expect, it } from 'vitest';
import { C_LIGHT, E_CHARGE, H_PLANCK, M_ELECTRON } from '~/physics/constants';
import {
  REST_MEV,
  bindingEnergy,
  compton,
  comptonEdge,
  comptonShift,
  comptonWavelength,
  electronKinetic,
  emittedPhotonEnergy,
  invariantMassEnergy,
  photonEnergy,
  photonMomentum,
  photonOnRestMass,
  photonWavelength,
  radiationPressure,
  reactionQ,
  recoilAngle,
  recoilAngleFromHalfAngle,
  scatteredEnergy,
  scatteredLocusEccentricity,
} from '~/physics/photon';
import { relativeError } from '~/physics/vec';

const ME = REST_MEV.electron;
const DEG = Math.PI / 180;
const ENERGIES = [0.001, 0.02, 0.1, 0.511, 1, 5, 100]; // MeV
const ANGLES = [5, 30, 60, 90, 120, 150, 175].map((d) => d * DEG);

describe('analytic limits', () => {
  it('the electron’s Compton wavelength h/(m_e c) is 2.43 pm with the course constants', () => {
    expect(relativeError(comptonWavelength(), 2.4259e-12)).toBeLessThan(1e-4);
  });

  it('forward scattering (θ = 0) changes nothing: no shift, E′ = E, K = 0', () => {
    for (const E of ENERGIES) {
      expect(comptonShift(0)).toBe(0);
      expect(scatteredEnergy(E, 0)).toBe(E);
      expect(electronKinetic(E, 0)).toBe(0);
    }
  });

  it('at 90° the shift is λ_C, at 180° it is 2λ_C, the largest', () => {
    const lc = comptonWavelength();
    expect(relativeError(comptonShift(90 * DEG), lc)).toBeLessThan(1e-15);
    expect(relativeError(comptonShift(Math.PI), 2 * lc)).toBeLessThan(1e-15);
    for (const t of ANGLES) expect(comptonShift(t)).toBeLessThan(2 * lc);
  });

  it('a soft photon (E ≪ m_e c²) scatters without losing energy: the classical (Thomson) limit, error ≈ ε(1 − cos θ)', () => {
    for (const t of ANGLES) {
      const E = 1e-6; // 1 eV
      const loss = 1 - scatteredEnergy(E, t) / E;
      expect(relativeError(loss, (E / ME) * (1 - Math.cos(t)))).toBeLessThan(1e-5);
    }
  });

  it('a very hard photon backscattered leaves with m_e c²/2, whatever its energy', () => {
    expect(relativeError(scatteredEnergy(1e6, Math.PI), ME / 2)).toBeLessThan(1e-6);
  });

  it('a 1.00 MeV photon backscattered: E′ = 0.204 MeV, the electron gets the Compton edge 0.796 MeV', () => {
    expect(relativeError(scatteredEnergy(1, Math.PI), 0.203505)).toBeLessThan(1e-4);
    expect(relativeError(comptonEdge(1), 0.796495)).toBeLessThan(1e-4);
  });

  it('the electron recoils sideways (φ → 90°) when θ → 0 and straight ahead (φ = 0) when θ = 180°', () => {
    for (const E of ENERGIES) {
      expect(relativeError(recoilAngle(E, 1e-9), Math.PI / 2)).toBeLessThan(1e-5);
      expect(Math.abs(recoilAngle(E, Math.PI))).toBeLessThan(1e-12);
    }
  });

  it('a photon has p = E/c: a 2.0 eV photon carries 1.07e-27 kg·m/s; 500 nm is 2.49 eV', () => {
    expect(relativeError(photonMomentum(2.0 * E_CHARGE), 1.0667e-27)).toBeLessThan(1e-3);
    expect(relativeError(photonEnergy(500e-9) / E_CHARGE, 2.486)).toBeLessThan(1e-3);
    expect(relativeError(photonWavelength(photonEnergy(500e-9)), 500e-9)).toBeLessThan(1e-14);
  });

  it('a mirror feels twice the radiation pressure of an absorber: sunlight 1.36 kW/m² gives 9.07 μPa on a mirror', () => {
    expect(relativeError(radiationPressure(1360, true), 9.0667e-6)).toBeLessThan(1e-4);
    expect(relativeError(radiationPressure(1360, true), 2 * radiationPressure(1360, false))).toBeLessThan(1e-15);
  });

  it('the deuteron’s binding energy is 2.224 MeV; helium-4’s 28.30 MeV', () => {
    const { proton: p, neutron: n, deuteron: d, alpha: a } = REST_MEV;
    expect(relativeError(bindingEnergy([p, n], d), 2.224)).toBeLessThan(1e-4);
    expect(relativeError(bindingEnergy([p, p, n, n], a), 28.295)).toBeLessThan(1e-4);
  });
});

describe('conservation', () => {
  it('energy is conserved: E + m_e c² = E′ + √((p_e c)² + (m_e c²)²) at every energy and angle', () => {
    for (const E of ENERGIES)
      for (const t of ANGLES) {
        const ev = compton(E, t);
        const Ee = Math.hypot(Math.hypot(...ev.pe), ME);
        expect(relativeError(ev.Ep + Ee, E + ME)).toBeLessThan(1e-12);
        expect(relativeError(ev.electronEnergy, Ee)).toBeLessThan(1e-12);
      }
  });

  it('momentum is conserved: p = p′ + p_e as vectors (the triangle closes)', () => {
    for (const E of ENERGIES)
      for (const t of ANGLES) {
        const ev = compton(E, t);
        expect(relativeError(ev.pp[0] + ev.pe[0], ev.p[0])).toBeLessThan(1e-12);
        expect(Math.abs(ev.pp[1] + ev.pe[1])).toBeLessThan(1e-12 * E);
      }
  });

  it('the invariant mass of the system is the same before and after', () => {
    for (const E of ENERGIES)
      for (const t of ANGLES) {
        const ev = compton(E, t);
        const before = invariantMassEnergy(E + ME, E);
        const after = invariantMassEnergy(ev.Ep + ev.electronEnergy, Math.hypot(ev.pp[0] + ev.pe[0], ev.pp[1] + ev.pe[1]));
        expect(relativeError(after, before)).toBeLessThan(1e-10);
      }
  });

  it('a free electron cannot absorb a photon: the system’s mass √((mc²)² + 2E·mc²) exceeds mc² for every E > 0', () => {
    for (const E of ENERGIES) expect(photonOnRestMass(E, ME)).toBeGreaterThan(ME);
    expect(invariantMassEnergy(5, 5)).toBe(0); // a lone photon has no mass
  });

  it('fusion d + d → ⁴He releases 23.85 MeV, the difference of the binding energies (energy bookkeeping is path-independent)', () => {
    const { proton: p, neutron: n, deuteron: d, alpha: a } = REST_MEV;
    const Q = reactionQ([d, d], [a]);
    expect(relativeError(Q, 23.847)).toBeLessThan(1e-4);
    expect(relativeError(Q, bindingEnergy([p, p, n, n], a) - 2 * bindingEnergy([p, n], d))).toBeLessThan(1e-10);
  });

  it('a body that emits a photon recoils: E_γ is a little less than the drop in rest energy, and the momenta balance', () => {
    const M = 1000;
    const drop = 0.1;
    const Eg = emittedPhotonEnergy(M + drop, M);
    expect(Eg).toBeLessThan(drop);
    // recoil: the body's energy is √(M² + E_γ²), and the energies add up to M + drop
    expect(relativeError(Eg + Math.hypot(M, Eg), M + drop)).toBeLessThan(1e-12);
    // the recoil energy is E_γ²/(2Mc²) to leading order
    expect(relativeError(drop - Eg, (drop * drop) / (2 * (M + drop)))).toBeLessThan(1e-9);
  });
});

describe('scaling', () => {
  it('the shift Δλ does not depend on the incident energy: wavelengths from the energies differ by λ_C(1 − cos θ)', () => {
    const lc = comptonWavelength();
    const hc = ME * lc; // the unit system in which λ = hc/E with E in MeV
    for (const E of ENERGIES)
      for (const t of ANGLES) {
        const dl = hc / scatteredEnergy(E, t) - hc / E;
        expect(relativeError(dl, comptonShift(t, lc))).toBeLessThan(1e-9);
      }
  });

  it('the Compton wavelength scales as 1/m: a proton’s is smaller by m_p/m_e', () => {
    expect(relativeError(comptonWavelength(M_ELECTRON) / comptonWavelength(1836 * M_ELECTRON), 1836)).toBeLessThan(1e-14);
    expect(relativeError(comptonWavelength(M_ELECTRON, H_PLANCK, C_LIGHT), H_PLANCK / (M_ELECTRON * C_LIGHT))).toBeLessThan(1e-15);
  });

  it('the recoil angle satisfies cot φ = (1 + ε) tan(θ/2)', () => {
    for (const E of ENERGIES)
      for (const t of ANGLES) expect(relativeError(recoilAngle(E, t), recoilAngleFromHalfAngle(E, t))).toBeLessThan(1e-10);
  });

  it('the tip of p′ traces an ellipse with a focus at the momentum diagram’s origin and eccentricity ε/(1 + ε)', () => {
    for (const E of ENERGIES) {
      const e = scatteredLocusEccentricity(E);
      const r0 = E / (1 + E / ME); // semi-latus rectum of r = ℓ/(1 − e cos θ)
      for (const t of ANGLES) expect(relativeError(scatteredEnergy(E, t), r0 / (1 - e * Math.cos(t)))).toBeLessThan(1e-12);
    }
  });

  it('the electron always moves forward (φ < 90°) and the edge K_max/E = 2ε/(1 + 2ε) grows toward 1', () => {
    let prev = 0;
    for (const E of ENERGIES) {
      for (const t of ANGLES) expect(recoilAngle(E, t)).toBeLessThan(Math.PI / 2);
      const f = comptonEdge(E) / E;
      expect(relativeError(f, (2 * E) / ME / (1 + (2 * E) / ME))).toBeLessThan(1e-12);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });
});

describe('convergence', () => {
  it('E′ = E(1 − ε(1 − cos θ)) + O(ε²): the remainder over ε² stays bounded as ε → 0', () => {
    const t = 90 * DEG;
    const ratios = [1e-2, 1e-3, 1e-4].map((eps) => {
      const E = eps * ME;
      const rem = scatteredEnergy(E, t) / E - (1 - eps);
      return rem / (eps * eps);
    });
    for (const r of ratios) expect(relativeError(r, 1)).toBeLessThan(0.02);
  });
});
