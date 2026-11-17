/**
 * Lesson 10.4: the photon's energy and momentum, Compton scattering off a free electron at rest, and the binding
 * energy of a system from its mass defect. Used by the ComptonLab figure, the lesson's scripts and its tests.
 *
 * MODEL SPECIFICATION
 * - System: (1) a photon, a massless particle: E = hf = pc, λ = c/f = h/p, speed c in every inertial frame. (2) A
 *   photon of energy E moving along +x hits a free electron (rest energy mc²) at rest at the origin; afterwards a
 *   photon of energy E′ leaves at the scattering angle θ (measured from +x, scattered into y ≥ 0) and the electron
 *   recoils at the angle φ below the +x axis. (3) A bound system of rest energy Mc² whose free parts, at rest and far
 *   apart, have rest energies mᵢc².
 * - Dynamics: conservation of energy and of the momentum vector in the lab frame, with E² = (pc)² + (mc²)² for every
 *   particle (m = 0 for the photon). Eliminating the electron gives 1/E′ − 1/E = (1 − cos θ)/(mc²), i.e.
 *   λ′ − λ = λ_C(1 − cos θ) with λ_C = h/(mc), and E′ = E/(1 + ε(1 − cos θ)), ε = E/(mc²). The electron's momentum
 *   closes the triangle: p_e = p − p′, so tan φ = E′ sin θ/(E − E′ cos θ), equivalently cot φ = (1 + ε) tan(θ/2).
 *   At fixed E the tip of p′ traces an ellipse, eccentricity ε/(1 + ε), with a focus at the common tail of p and p′
 *   (the origin of the momentum diagram); in polar form E′ = ℓ/(1 − e cos θ), θ measured from the apoapsis direction +x.
 *   Binding: energy conservation for pulling the system apart, Mc² + B = Σmᵢc², so B = (Σmᵢ − M)c² = Δm·c².
 *   A reaction releases Q = Σ(rest energies before) − Σ(rest energies after).
 * - Units: the scattering functions work in any one energy unit (the lesson uses MeV) and give momenta as pc in that
 *   unit; the SI helpers take joules, metres and seconds and default to H_PLANCK, C_LIGHT, M_ELECTRON. Rest energies
 *   of particles and nuclei are data the lesson states in its text, in MeV (REST_MEV); they are not derived from the
 *   SI constants (M_ELECTRON·c² with the course's three-figure constants is 0.512 MeV, the stated datum 0.511 MeV).
 * - Boundary: the electron is free and at rest before the collision; the photon leaves in the xy plane.
 * - Ignored: the electron's binding in an atom (valid when E is much larger than the binding energy, a few eV to keV),
 *   the quantum cross-section (how often each angle occurs: Klein–Nishina), spin and polarisation, the recoil of
 *   anything other than the electron. For binding: the energy carried by the electrons of an atom when nuclear rest
 *   energies are used (the data are for bare nuclei).
 * - Valid when: E > 0 and 0 ≤ θ ≤ π; rest energies positive.
 * - Failure modes: `scatteredEnergy` and `compton` throw a RangeError for E ≤ 0 or mc² ≤ 0. `invariantMassEnergy`
 *   returns 0 for a lightlike total (to rounding) and throws for a spacelike one, which no system of particles has.
 */

import { C_LIGHT, E_CHARGE, H_PLANCK, M_ELECTRON } from './constants';

// ---------------------------------------------------------------- data (stated in the lesson's text, MeV)

/**
 * Rest energies [MeV] of the particles and bare nuclei the lesson and its bank use (CODATA 2018 values, as the
 * prompts state them). The electron's 0.511 MeV is the datum every Compton number uses.
 */
export const REST_MEV = {
  electron: 0.511,
  proton: 938.272,
  neutron: 939.565,
  deuteron: 1875.613,
  triton: 2808.921,
  helion: 2808.391,
  alpha: 3727.379,
} as const;

// ---------------------------------------------------------------- units

/** Joules in one MeV, from E_CHARGE (joules per eV). */
export const MEV = 1e6 * E_CHARGE;
export const toMeV = (joules: number): number => joules / MEV;
export const fromMeV = (mev: number): number => mev * MEV;

// ---------------------------------------------------------------- the photon (SI)

/** E = hc/λ [J] of a photon of wavelength λ [m]. */
export const photonEnergy = (lambda: number, h = H_PLANCK, c = C_LIGHT): number => (h * c) / lambda;

/** λ = hc/E [m] of a photon of energy E [J]. */
export const photonWavelength = (E: number, h = H_PLANCK, c = C_LIGHT): number => (h * c) / E;

/** p = E/c [kg·m/s] of a photon of energy E [J]: E² = (pc)² + (mc²)² with m = 0. */
export const photonMomentum = (E: number, c = C_LIGHT): number => E / c;

/** f = E/h [Hz]. */
export const photonFrequency = (E: number, h = H_PLANCK): number => E / h;

/**
 * Radiation pressure [Pa] of a beam of intensity I [W/m²] hitting a flat surface head-on: each joule carries 1/c of
 * momentum, absorbed (I/c) or reversed by a mirror (2I/c).
 */
export const radiationPressure = (I: number, mirror: boolean, c = C_LIGHT): number => ((mirror ? 2 : 1) * I) / c;

/** The mass change ΔE/c² [kg] of a system that gains (or, negative, loses) the energy ΔE [J]. */
export const massOfEnergy = (dE: number, c = C_LIGHT): number => dE / (c * c);

// ---------------------------------------------------------------- Compton scattering

/** The Compton wavelength h/(mc) [m] of a particle of mass m [kg] (default the electron: 2.43 pm). */
export const comptonWavelength = (m = M_ELECTRON, h = H_PLANCK, c = C_LIGHT): number => h / (m * c);

/** Δλ = λ_C(1 − cos θ): the photon's wavelength grows by this much, whatever its energy. */
export const comptonShift = (theta: number, lambdaC = comptonWavelength()): number => lambdaC * (1 - Math.cos(theta));

function checkPositive(E: number, mc2: number) {
  if (!(E > 0)) throw new RangeError(`photon energy ${E} must be positive`);
  if (!(mc2 > 0)) throw new RangeError(`rest energy ${mc2} must be positive`);
}

/** E′ = E/(1 + (E/mc²)(1 − cos θ)): the scattered photon's energy (same unit as E and mc²). */
export function scatteredEnergy(E: number, theta: number, mc2: number = REST_MEV.electron): number {
  checkPositive(E, mc2);
  return E / (1 + (E / mc2) * (1 - Math.cos(theta)));
}

/** The kinetic energy the electron receives, K = E − E′. */
export const electronKinetic = (E: number, theta: number, mc2: number = REST_MEV.electron): number => E - scatteredEnergy(E, theta, mc2);

/** The largest K a photon of energy E can give a free electron (θ = 180°): E·2ε/(1 + 2ε), ε = E/mc². */
export const comptonEdge = (E: number, mc2: number = REST_MEV.electron): number => electronKinetic(E, Math.PI, mc2);

/** The recoil angle φ ≥ 0 of the electron below the +x axis: tan φ = E′ sin θ/(E − E′ cos θ). θ = 0 gives π/2 (the limit). */
export function recoilAngle(E: number, theta: number, mc2: number = REST_MEV.electron): number {
  const Ep = scatteredEnergy(E, theta, mc2);
  const y = Ep * Math.sin(theta);
  const x = E - Ep * Math.cos(theta);
  if (Math.abs(x) <= 1e-15 * E && Math.abs(y) <= 1e-15 * E) return Math.PI / 2; // θ = 0: the limit of φ as θ → 0
  return Math.atan2(y, x);
}

/** The same angle from cot φ = (1 + ε) tan(θ/2). */
export const recoilAngleFromHalfAngle = (E: number, theta: number, mc2: number = REST_MEV.electron): number =>
  Math.atan2(1, (1 + E / mc2) * Math.tan(theta / 2));

export interface ComptonEvent {
  /** incident and scattered photon energies, the electron's kinetic and total energy (one unit) */
  E: number;
  Ep: number;
  K: number;
  electronEnergy: number;
  /** momenta as pc [the energy unit], vectors (x, y): incident along +x, scattered at θ above, electron at φ below */
  p: [number, number];
  pp: [number, number];
  pe: [number, number];
  theta: number;
  phi: number;
}

/** The whole event: energies, the three momentum vectors (as pc) and the two angles. */
export function compton(E: number, theta: number, mc2: number = REST_MEV.electron): ComptonEvent {
  const Ep = scatteredEnergy(E, theta, mc2);
  const pp: [number, number] = [Ep * Math.cos(theta), Ep * Math.sin(theta)];
  const pe: [number, number] = [E - pp[0], -pp[1]];
  return {
    E,
    Ep,
    K: E - Ep,
    electronEnergy: E - Ep + mc2,
    p: [E, 0],
    pp,
    pe,
    theta,
    phi: recoilAngle(E, theta, mc2),
  };
}

/** The eccentricity ε/(1 + ε) of the ellipse the tip of p′ traces as θ varies (0 in the classical limit: a circle). */
export const scatteredLocusEccentricity = (E: number, mc2: number = REST_MEV.electron): number => E / mc2 / (1 + E / mc2);

// ---------------------------------------------------------------- invariants, binding energy, reactions

/** Mc² = √(E² − (pc)²) of a system with total energy E and total momentum pc (one unit). */
export function invariantMassEnergy(E: number, pc: number): number {
  const s = E * E - pc * pc;
  const tol = 1e-12 * E * E;
  if (s < -tol) throw new RangeError('E² − (pc)² < 0: no system of particles has a spacelike total');
  return s <= tol ? 0 : Math.sqrt(s);
}

/** The invariant mass energy of a photon E plus a particle mc² at rest: √((mc²)² + 2E·mc²), more than mc² for E > 0. */
export const photonOnRestMass = (E: number, mc2: number): number => invariantMassEnergy(E + mc2, E);

/** B = Σmᵢc² − Mc²: the energy needed to pull a system of rest energy Mc² apart into free parts at rest. */
export const bindingEnergy = (parts: readonly number[], bound: number): number => parts.reduce((a, b) => a + b, 0) - bound;

/** Q = Σ(rest energies before) − Σ(rest energies after): positive when a reaction releases energy. */
export const reactionQ = (before: readonly number[], after: readonly number[]): number =>
  before.reduce((a, b) => a + b, 0) - after.reduce((a, b) => a + b, 0);

/**
 * A body of rest energy M*c², at rest, emits one photon and is left with rest energy Mc² (a de-exciting nucleus or
 * atom). The photon's energy is E_γ = ((M*c²)² − (Mc²)²)/(2M*c²), a little less than the drop M*c² − Mc²: the body
 * recoils with the photon's momentum.
 */
export const emittedPhotonEnergy = (MstarC2: number, MC2: number): number => (MstarC2 * MstarC2 - MC2 * MC2) / (2 * MstarC2);
