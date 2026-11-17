/**
 * Relativistic decays and collisions (lesson 10.3): the two-body decay of a particle at rest and in flight, and the
 * threshold energy of a reaction that creates particles, on a fixed target and in a head-on collider. Shared by the
 * lesson's figure (DecayLab) and its scripts, so every number of the lesson comes from one model.
 *
 * MODEL SPECIFICATION
 * - System: free point particles described by their energy E and momentum p in an inertial frame. NATURAL UNITS,
 *   c = 1, with MeV throughout: a mass m stands for the rest energy mc² [MeV], a momentum p for pc [MeV], an energy
 *   E for E [MeV]. A lesson's "938 MeV proton" passes m = 938; a result p = 101 means 101 MeV/c. Particles move in
 *   the (x, y) plane; a four-momentum is { E, px, py }.
 * - Dynamics: conservation of the total energy and of the total momentum in every inertial frame, and for each
 *   particle E² − p² = m² (massless: E = |p|). The four-momentum transforms between frames like (ct, x, y); the
 *   primed frame moves at +β along x relative to the unprimed one (the course's convention), so a four-momentum
 *   given in the primed frame is, in the unprimed one,
 *     E = γ(E′ + βp′ₓ),  pₓ = γ(p′ₓ + βE′),  p_y = p′_y.
 *   s = E_tot² − p_tot² is the same in every frame; √s is the total energy in the centre-of-mass (CM) frame, the
 *   frame where p_tot = 0, and the invariant mass of the system.
 *   Two-body decay M → m₁ + m₂ at rest: the products fly back to back with equal |p*|,
 *     E₁* = (M² + m₁² − m₂²)/(2M),  p* = √[(M² − (m₁ + m₂)²)(M² − (m₁ − m₂)²)]/(2M).
 *   Threshold: √s = Σm_f, all products at rest in the CM frame. Beam m on target M at rest:
 *     s = m² + M² + 2E·M,  K_th = [(Σm_f)² − (m + M)²]/(2M).
 *   Head-on, two identical beams of mass m and equal energy E: p_tot = 0, √s = 2E, K_th = Σm_f/2 − m per beam.
 * - Boundary: given masses, energies and the parent's velocity β along +x; the decay angle θ* is measured in the
 *   parent's rest frame from +x, for product 1 (product 2 at θ* + π).
 * - Ignored: spin, the decay's angular distribution (θ* is chosen, not drawn), lifetimes, binding and Fermi motion
 *   of a nuclear target (a target "at rest" is a free particle at rest), radiation, every conservation law other
 *   than energy and momentum (charge, baryon number…: the presets respect them).
 * - Valid when: every mass ≥ 0; a decay needs M ≥ m₁ + m₂; |β| < 1.
 * - Failure modes: `decayMomentum` and `decayEnergies` throw a RangeError for M < m₁ + m₂ (the decay is forbidden)
 *   or M ≤ 0; `gammaOf` (relativity.ts) throws for |β| ≥ 1; `thresholdKineticFixedTarget` throws for a target of
 *   mass 0 (a massless particle is never at rest) and returns 0 when the final masses do not exceed the initial
 *   ones (such a reaction has no threshold). `invariantMass` of a set whose E² < p² by rounding returns 0, not NaN.
 */

import { gammaOf } from './relativity';

/** A four-momentum in the (x, y) plane, natural units [MeV]: energy and the two momentum components. */
export interface FourMomentum {
  E: number;
  px: number;
  py: number;
}

// ---------------------------------------------------------------- one particle

/** E = √(p² + m²) [MeV] from the momentum p and the mass m (both in MeV). */
export const energyFromMomentum = (p: number, m: number): number => Math.hypot(p, m);

/** |p| = √(E² − m²) [MeV]. */
export const momentumFromEnergy = (E: number, m: number): number => Math.sqrt(Math.max(0, E * E - m * m));

/** Speed β = |p|/E of a particle. */
export const speedOf = (q: FourMomentum): number => Math.hypot(q.px, q.py) / q.E;

/** Kinetic energy K = E − m. */
export const kineticOf = (q: FourMomentum, m: number): number => q.E - m;

/** The four-momentum of a particle of mass m moving with momentum p at angle θ from +x. */
export function particle(m: number, p: number, theta = 0): FourMomentum {
  return { E: energyFromMomentum(p, m), px: p * Math.cos(theta), py: p * Math.sin(theta) };
}

/** The four-momentum of a particle of mass m moving along +x with speed β (β < 0: along −x). */
export function movingAt(m: number, b: number): FourMomentum {
  const g = gammaOf(b);
  return { E: g * m, px: g * m * b, py: 0 };
}

// ---------------------------------------------------------------- frames and invariants

/**
 * A four-momentum given in the primed frame (which moves at +β along x relative to the unprimed frame) expressed in
 * the unprimed frame: E = γ(E′ + βp′ₓ), pₓ = γ(p′ₓ + βE′). With β the parent's velocity in the lab, this takes a
 * product from the parent's rest frame to the lab.
 */
export function fromPrimed(q: FourMomentum, b: number): FourMomentum {
  const g = gammaOf(b);
  return { E: g * (q.E + b * q.px), px: g * (q.px + b * q.E), py: q.py };
}

/** The same four-momentum seen from the primed frame: the inverse, β → −β. */
export const toPrimed = (q: FourMomentum, b: number): FourMomentum => fromPrimed(q, -b);

/** The sum of several four-momenta: the system's total energy and momentum. */
export function total(qs: readonly FourMomentum[]): FourMomentum {
  return qs.reduce((a, q) => ({ E: a.E + q.E, px: a.px + q.px, py: a.py + q.py }), { E: 0, px: 0, py: 0 });
}

/** s = E_tot² − p_tot² [MeV²] of a set of particles: the same in every frame. */
export function sOf(qs: readonly FourMomentum[]): number {
  const t = total(qs);
  return t.E * t.E - t.px * t.px - t.py * t.py;
}

/** The invariant mass √s of a set of particles [MeV]: the total energy in their CM frame. */
export const invariantMass = (qs: readonly FourMomentum[]): number => Math.sqrt(Math.max(0, sOf(qs)));

/** The velocity β_cm = p_tot/E_tot of the CM frame along x (the system's px over its E). */
export function cmBeta(qs: readonly FourMomentum[]): number {
  const t = total(qs);
  return t.px / t.E;
}

// ---------------------------------------------------------------- lesson 10.3: two-body decay

function checkDecay(M: number, m1: number, m2: number) {
  if (!(M > 0) || m1 < 0 || m2 < 0) throw new RangeError(`masses M = ${M}, m₁ = ${m1}, m₂ = ${m2} are not physical`);
  if (M < m1 + m2) throw new RangeError(`M = ${M} is below m₁ + m₂ = ${m1 + m2}: the decay is forbidden`);
}

/** Q = M − m₁ − m₂ [MeV]: the rest energy turned into kinetic energy. */
export const decayQ = (M: number, m1: number, m2: number): number => M - m1 - m2;

/**
 * |p*| of each product of M → m₁ + m₂ at rest [MeV]: √[(M² − (m₁ + m₂)²)(M² − (m₁ − m₂)²)]/(2M). Throws when the
 * decay is forbidden.
 */
export function decayMomentum(M: number, m1: number, m2: number): number {
  checkDecay(M, m1, m2);
  const a = M * M - (m1 + m2) ** 2;
  const b = M * M - (m1 - m2) ** 2;
  return Math.sqrt(Math.max(0, a * b)) / (2 * M);
}

/** The energies E₁* = (M² + m₁² − m₂²)/(2M) and E₂* = (M² + m₂² − m₁²)/(2M) of the products of a decay at rest. */
export function decayEnergies(M: number, m1: number, m2: number): [number, number] {
  checkDecay(M, m1, m2);
  return [(M * M + m1 * m1 - m2 * m2) / (2 * M), (M * M + m2 * m2 - m1 * m1) / (2 * M)];
}

/** The kinetic energies K₁* and K₂* of the products of a decay at rest; they add up to Q. */
export function decayKinetic(M: number, m1: number, m2: number): [number, number] {
  const [E1, E2] = decayEnergies(M, m1, m2);
  return [E1 - m1, E2 - m2];
}

/**
 * Newton's answer for the same decay (an explosion at rest, chapter 4): equal and opposite momenta and
 * p²/(2m₁) + p²/(2m₂) = Q, so p = √(2μQ) with μ = m₁m₂/(m₁ + m₂), K₁ = Q·m₂/(m₁ + m₂), K₂ = Q·m₁/(m₁ + m₂).
 * Meaningless for a massless product (μ = 0 gives p = 0): Newton has no massless particles.
 */
export function classicalDecay(M: number, m1: number, m2: number): { p: number; K1: number; K2: number } {
  const Q = decayQ(M, m1, m2);
  const mu = (m1 * m2) / (m1 + m2);
  return { p: Math.sqrt(2 * mu * Q), K1: (Q * m2) / (m1 + m2), K2: (Q * m1) / (m1 + m2) };
}

/** The two products of M → m₁ + m₂ in the parent's rest frame, product 1 at angle θ* from +x, product 2 opposite. */
export function decayAtRest(M: number, m1: number, m2: number, thetaStar = 0): [FourMomentum, FourMomentum] {
  const p = decayMomentum(M, m1, m2);
  const [E1, E2] = decayEnergies(M, m1, m2);
  const c = Math.cos(thetaStar);
  const s = Math.sin(thetaStar);
  return [
    { E: E1, px: p * c, py: p * s },
    { E: E2, px: -p * c, py: -p * s },
  ];
}

/** The same two products in the lab, where the parent moves at β along +x. */
export function decayInFlight(M: number, m1: number, m2: number, b: number, thetaStar = 0): [FourMomentum, FourMomentum] {
  const [q1, q2] = decayAtRest(M, m1, m2, thetaStar);
  return [fromPrimed(q1, b), fromPrimed(q2, b)];
}

/**
 * The lab energy range of product i of a decay in flight: from emission straight backward to straight forward in
 * the parent's rest frame, E = γ(E* ∓ |β|p*).
 */
export function labEnergyRange(M: number, m1: number, m2: number, b: number, which: 1 | 2 = 1): [number, number] {
  const g = gammaOf(b);
  const p = decayMomentum(M, m1, m2);
  const E = decayEnergies(M, m1, m2)[which - 1];
  const ab = Math.abs(b);
  return [g * (E - ab * p), g * (E + ab * p)];
}

/** The angle between two momenta [rad], 0…π (0 when either particle is at rest). */
export function openingAngle(a: FourMomentum, c: FourMomentum): number {
  const la = Math.hypot(a.px, a.py);
  const lc = Math.hypot(c.px, c.py);
  if (la === 0 || lc === 0) return 0;
  const cos = (a.px * c.px + a.py * c.py) / (la * lc);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/**
 * The invariant mass of two particles of masses m₁, m₂ and momenta p₁, p₂ with an angle θ between them:
 * M² = m₁² + m₂² + 2(E₁E₂ − p₁p₂ cos θ). Used to identify a parent from its products' tracks.
 */
export function pairMass(m1: number, p1: number, m2: number, p2: number, theta: number): number {
  return invariantMass([particle(m1, p1, 0), particle(m2, p2, theta)]);
}

// ---------------------------------------------------------------- lesson 10.3: threshold energy

/** s [MeV²] for a beam of mass m and total energy E on a target of mass M at rest: m² + M² + 2EM. */
export const sFixedTarget = (E: number, m: number, M: number): number => m * m + M * M + 2 * E * M;

/** √s for a beam of mass m with kinetic energy K on a target of mass M at rest [MeV]. */
export const sqrtSFixedTarget = (K: number, m: number, M: number): number => Math.sqrt(sFixedTarget(K + m, m, M));

/**
 * √s of a head-on collision [MeV]: particle 1 (mass m₁, energy E₁) along +x and particle 2 (mass m₂, energy E₂)
 * along −x: s = m₁² + m₂² + 2(E₁E₂ + p₁p₂).
 */
export function sqrtSHeadOn(E1: number, m1: number, E2: number, m2: number): number {
  const p1 = momentumFromEnergy(E1, m1);
  const p2 = momentumFromEnergy(E2, m2);
  return Math.sqrt(m1 * m1 + m2 * m2 + 2 * (E1 * E2 + p1 * p2));
}

/** √s for two identical beams of mass m, each with kinetic energy K, meeting head on: 2(K + m). */
export const sqrtSCollider = (K: number, m: number): number => 2 * (K + m);

/**
 * The threshold kinetic energy of a beam of mass m on a target of mass M at rest, for final particles whose masses
 * add up to sumFinal: [(Σm_f)² − (m + M)²]/(2M). 0 when Σm_f ≤ m + M (no threshold). Throws for M ≤ 0.
 */
export function thresholdKineticFixedTarget(m: number, M: number, sumFinal: number): number {
  if (!(M > 0)) throw new RangeError(`target mass ${M}: a fixed target must have mass`);
  if (sumFinal <= m + M) return 0;
  return (sumFinal * sumFinal - (m + M) ** 2) / (2 * M);
}

/** The threshold kinetic energy of EACH of two identical beams of mass m meeting head on: Σm_f/2 − m (≥ 0). */
export const thresholdKineticCollider = (m: number, sumFinal: number): number => Math.max(0, sumFinal / 2 - m);

/**
 * Newton's threshold (chapter 4's available energy): only the CM part ½μv² of the kinetic energy can become the new
 * rest energy Δ = Σm_f − m − M, and that part is the fraction M/(m + M) of K, so K = Δ(m + M)/M. The relativistic
 * threshold is this plus Δ²/(2M).
 */
export function thresholdKineticNewtonian(m: number, M: number, sumFinal: number): number {
  const d = sumFinal - m - M;
  return d <= 0 ? 0 : (d * (m + M)) / M;
}

/** The beam energy E (total) that a fixed target needs to reach a given √s: E = (s − m² − M²)/(2M). */
export const fixedTargetEnergyFor = (sqrtS: number, m: number, M: number): number => (sqrtS * sqrtS - m * m - M * M) / (2 * M);

/** β of the CM frame for a beam (mass m, kinetic energy K) on a target M at rest: p/(E + M). */
export function cmBetaFixedTarget(K: number, m: number, M: number): number {
  const E = K + m;
  return momentumFromEnergy(E, m) / (E + M);
}
