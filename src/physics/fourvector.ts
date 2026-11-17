/**
 * Four-vectors (lesson 10.2): the energy-momentum four-vector of a particle and of a system, its Lorentz
 * transformation, the Minkowski product and the invariant mass. Shared by the FourMomentum figure and the lesson's
 * scripts. The kinematics (β, γ, velocity addition) come from src/physics/relativity.ts.
 *
 * MODEL SPECIFICATION
 * - System: free particles, each with a mass m ≥ 0 and a momentum vector p, described from inertial frames in
 *   standard configuration: S′ moves relative to S at β = v/c along +x, axes parallel (as in relativity.ts).
 * - Units: NATURAL, c = 1. A four-vector A = (A₀, A₁, A₂, A₃) holds (E, p_x c, p_y c, p_z c) in ONE energy unit
 *   (the lessons use MeV or GeV); a mass is given as its rest energy mc² in that unit. Divide every component by c
 *   to read the course's (E/c, p_x, p_y, p_z) in MeV/c. A velocity is β = v/c.
 * - Dynamics: none (kinematics of four-vectors). The four-momentum of a particle is P = (E, pc) with
 *   E = √((pc)² + (mc²)²) = γ_u mc² and pc = γ_u m u c, i.e. m times the four-velocity γ_u(c, u). The boost to S′:
 *     A′₀ = γ(A₀ − βA₁),  A′₁ = γ(A₁ − βA₀),  A′₂ = A₂,  A′₃ = A₃,
 *   the same rows as ct′ = γ(ct − βx), x′ = γ(x − β·ct). The Minkowski product A·B = A₀B₀ − A₁B₁ − A₂B₂ − A₃B₃ (the
 *   course's sign, timelike positive) is the same in every frame; so P·P = (mc²)² and, for a system, the invariant
 *   mass Mc² = √((ΣE)² − (Σpc)²). A massless particle (a photon) has P·P = 0, E = |pc|.
 * - Boundary: four-vectors as given; `fourMomentum` builds a physical one (E ≥ |pc|) from a mass and a momentum.
 * - Ignored: interactions, forces, spin, quantum effects; what an observer sees (light-travel delays): the
 *   components are what a frame measures.
 * - Valid when: |β| < 1 for every boost; every particle has m ≥ 0 and E ≥ |pc| (timelike or lightlike P).
 * - Failure modes: `boostX` throws a RangeError for |β| ≥ 1 (via gammaOf); so does `fromVelocity` for a speed at
 *   or above c. `massOf` throws for a spacelike four-vector (P·P below −1e-9 of E²), which no set of real particles
 *   has; a P·P a rounding error below zero is read as 0 (a photon). `restFrameBeta` throws for a massless P (no rest
 *   frame) and for E ≤ 0. `twoPhotonMass` throws for a negative energy.
 */

import { gammaOf } from './relativity';
import type { Vec3 } from './vec';

/** A four-vector (A₀, A₁, A₂, A₃): for a four-momentum, (E, p_x c, p_y c, p_z c) in one energy unit. */
export type FourVector = readonly [number, number, number, number];

/** The four-momentum of a particle of rest energy m (= mc²) and momentum p (as pc; a number means along x). */
export function fourMomentum(m: number, p: Vec3 | number): FourVector {
  if (m < 0) throw new RangeError(`a mass cannot be negative (got ${m})`);
  const v: Vec3 = typeof p === 'number' ? [p, 0, 0] : p;
  const E = Math.sqrt(m * m + v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [E, v[0], v[1], v[2]];
}

/** The four-momentum of a particle of rest energy m moving at velocity β (a number means along x): γm(1, β). */
export function fromVelocity(m: number, beta: Vec3 | number): FourVector {
  const b: Vec3 = typeof beta === 'number' ? [beta, 0, 0] : beta;
  const g = gammaOf(Math.hypot(b[0], b[1], b[2]));
  return [g * m, g * m * b[0], g * m * b[1], g * m * b[2]];
}

/** A photon of energy E moving in the xy plane at angle θ from +x: (E, E cos θ, E sin θ, 0). */
export function photon(E: number, theta = 0): FourVector {
  if (E < 0) throw new RangeError(`a photon energy cannot be negative (got ${E})`);
  return [E, E * Math.cos(theta), E * Math.sin(theta), 0];
}

/** The sum of four-vectors (the total four-momentum of a system). */
export function add4(...vs: readonly FourVector[]): FourVector {
  const s = [0, 0, 0, 0];
  for (const v of vs) for (let i = 0; i < 4; i++) s[i] += v[i];
  return [s[0], s[1], s[2], s[3]];
}

/** a − b. */
export const sub4 = (a: FourVector, b: FourVector): FourVector => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];

/** The Minkowski product A·B = A₀B₀ − A₁B₁ − A₂B₂ − A₃B₃ (timelike positive). */
export const minkowskiDot = (a: FourVector, b: FourVector): number => a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3];

/** A·A: for a four-momentum, (mc²)². */
export const minkowskiNorm2 = (a: FourVector): number => minkowskiDot(a, a);

/** The rest energy √(A·A) of a timelike or lightlike four-momentum. Throws for a spacelike one. */
export function massOf(a: FourVector): number {
  const n2 = minkowskiNorm2(a);
  if (n2 >= 0) return Math.sqrt(n2);
  if (-n2 <= 1e-9 * a[0] * a[0]) return 0;
  throw new RangeError(`the four-vector is spacelike (A·A = ${n2}): it is not the four-momentum of real particles`);
}

/** The invariant mass (as Mc²) of a system: √((ΣE)² − (Σpc)²). Not the sum of the masses. */
export const invariantMass = (...ps: readonly FourVector[]): number => massOf(add4(...ps));

/** The four-vector as S′ (moving at β along +x) measures it: A′₀ = γ(A₀ − βA₁), A′₁ = γ(A₁ − βA₀). */
export function boostX(a: FourVector, beta: number): FourVector {
  const g = gammaOf(beta);
  return [g * (a[0] - beta * a[1]), g * (a[1] - beta * a[0]), a[2], a[3]];
}

/** The velocity β = pc/E of whatever carries the four-momentum (a particle, or a system's centre of mass). */
export function velocityOf(a: FourVector): Vec3 {
  if (!(a[0] > 0)) throw new RangeError(`the energy must be positive (got ${a[0]})`);
  return [a[1] / a[0], a[2] / a[0], a[3] / a[0]];
}

/**
 * The velocity β along x of the frame in which the x component of the momentum vanishes: β = p_x c/E. For a particle
 * moving along x, its rest frame; for a system, its centre-of-mass frame. Throws for a massless four-momentum.
 */
export function restFrameBeta(a: FourVector): number {
  if (!(a[0] > 0)) throw new RangeError(`the energy must be positive (got ${a[0]})`);
  if (massOf(a) === 0) throw new RangeError('a massless particle has no rest frame');
  return a[1] / a[0];
}

/** The kinetic energy E − mc² of a particle. */
export const kineticEnergy = (a: FourVector): number => a[0] - massOf(a);

/** The invariant mass (Mc²) of two photons of energies E₁, E₂ at an angle θ: √(2E₁E₂(1 − cos θ)). */
export function twoPhotonMass(E1: number, E2: number, theta: number): number {
  if (E1 < 0 || E2 < 0) throw new RangeError('a photon energy cannot be negative');
  return Math.sqrt(2 * E1 * E2 * (1 - Math.cos(theta)));
}

/**
 * √s for a beam particle (rest energy m1, energy E1) hitting a target at rest (rest energy m2):
 * s = (P₁ + P₂)·(P₁ + P₂) = m1² + m2² + 2E1·m2.
 */
export function fixedTargetSqrtS(E1: number, m1: number, m2: number): number {
  if (E1 < m1) throw new RangeError(`the energy ${E1} is below the rest energy ${m1}`);
  return Math.sqrt(m1 * m1 + m2 * m2 + 2 * E1 * m2);
}

/** The energy of particle `a` measured in the rest frame of massive particle `b`: (P_a·P_b)/(m_b c²). */
export function energyInRestFrameOf(a: FourVector, b: FourVector): number {
  const mb = massOf(b);
  if (mb === 0) throw new RangeError('a massless particle has no rest frame');
  return minkowskiDot(a, b) / mb;
}

/** The Lorentz factor of the relative speed of two massive particles: γ_rel = P_a·P_b/(m_a m_b c⁴). */
export function relativeGamma(a: FourVector, b: FourVector): number {
  const ma = massOf(a);
  const mb = massOf(b);
  if (ma === 0 || mb === 0) throw new RangeError('a massless particle has no rest frame');
  return minkowskiDot(a, b) / (ma * mb);
}
