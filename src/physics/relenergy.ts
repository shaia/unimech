/**
 * Relativistic momentum and energy of one free particle (lesson 10.1): p = γmv, E = γmc², K = (γ − 1)mc², the
 * relation E² = (pc)² + (mc²)², the speed v = pc²/E, the massless case and the non-relativistic limit. Shared by
 * the lesson's figure (EnergyMomentumLab), its worked examples and its workbook, so every number comes from one model.
 *
 * MODEL SPECIFICATION
 * - System: one free particle of mass m (the same in every frame: the course has no "relativistic mass") moving
 *   along a line at speed v in an inertial frame. A massless particle (m = 0, a photon) is described by its
 *   momentum or its energy alone.
 * - Dynamics: none (no forces: lesson 10.5). The definitions
 *     p = γmv,  E = γmc²,  K = E − mc² = (γ − 1)mc²,  γ = 1/√(1 − β²), β = v/c,
 *   and their consequences E² − (pc)² = (mc²)² and v = pc²/E. Newton's p = mv and K = ½mv² = p²/(2m) are kept for
 *   contrast; they are the first terms of the series K = mc²(½β² + ⅜β⁴ + 5⁄16 β⁶ + …) and
 *   K = p²/(2m) − p⁴/(8m³c²) + ….
 *   `collisionYMomentumChange` adds the lesson's thought experiment (two balls, two frames, an elastic collision
 *   along y), which shows why m·v is replaced by γmv: the only place here with two bodies and two frames.
 * - Units: two families.
 *   (1) SI (kg, m/s, J, kg·m/s): `momentum`, `energy`, `kinetic`, `restEnergy`, … take the speed of light as their
 *       last argument, default C_LIGHT = 3.0e8 m/s.
 *   (2) Particle-physics units with c = 1: energies E, K and the rest energy mc² in MeV (or any one energy unit),
 *       momentum as pc in the same unit (MeV, i.e. p in MeV/c), mass as mc² (MeV, i.e. m in MeV/c²), speed as β.
 *       Functions whose names end in `Mev` or take `mc2`/`pc` work in these units. Rest energies are DATA stated in
 *       the prompt or the text (electron 0.511 MeV, muon 106 MeV, proton 938 MeV), never constants here.
 *   (3) Dimensionless: `pOverMc(β) = γβ`, `eOverMc2(β) = γ`, `kOverMc2(β) = γ − 1` — the figure's axes.
 *   `mevFromJoules` converts with E_CHARGE (1 eV = 1.6e-19 J).
 * - Boundary: speeds 0 ≤ |β| < 1 for a massive particle; any pc ≥ 0 and any mc² ≥ 0 in the c = 1 functions.
 * - Ignored: forces, fields, binding (lesson 10.4), collisions (lesson 10.3), Lorentz transformation of p and E
 *   (lesson 10.2), quantum effects. Directions: one dimension; |p| where a sign does not matter.
 * - Valid when: special relativity holds (no gravity). For m > 0 every speed is below c.
 * - Failure modes: anything that needs γ throws a RangeError at |β| ≥ 1 (`gammaOf`). `momentumFromEnergyMev` and
 *   `betaFromEnergyMev` throw when E < mc² (no such particle). `kOverMc2` uses the cancellation-free form
 *   β²γ²/(γ + 1), so the K/(½mv²) ratio stays accurate down to β ~ 1e-8; `oneMinusBeta` uses 1/(γ²(1 + β)), so
 *   it stays accurate at γ ~ 10⁴, where 1 − β computed directly loses every digit.
 */

import { C_LIGHT, E_CHARGE } from './constants';
import { gammaOf } from './relativity';

// ---------------------------------------------------------------- dimensionless (units of mc and mc²)

/** p/(mc) = γβ: the momentum in units of mc. Unbounded as β → 1. */
export const pOverMc = (b: number): number => gammaOf(b) * b;

/** E/(mc²) = γ. */
export const eOverMc2 = (b: number): number => gammaOf(b);

/** K/(mc²) = γ − 1, written β²γ²/(γ + 1) so small β loses no digits. */
export function kOverMc2(b: number): number {
  const g = gammaOf(b);
  return (b * b * g * g) / (g + 1);
}

/** Newton's K/(mc²) = ½β², for contrast (no upper bound on β: it is wrong anyway near c). */
export const kClassicalOverMc2 = (b: number): number => 0.5 * b * b;

/** Newton's p/(mc) = β, for contrast. */
export const pClassicalOverMc = (b: number): number => b;

/** K/(½mv²) = 2(γ − 1)/β²: how much the true kinetic energy exceeds Newton's. 1 at β = 0. */
export function kineticRatio(b: number): number {
  if (b === 0) return 1;
  return kOverMc2(b) / kClassicalOverMc2(b);
}

/**
 * The Taylor series of K/(mc²) in β², truncated after `terms` terms: Σ_{n≥1} a_n β^{2n} with a_n = C(2n, n)/4ⁿ,
 * the coefficient of xⁿ in (1 − x)^(−1/2): ½β² + ⅜β⁴ + 5⁄16 β⁶ + 35⁄128 β⁸ + ….
 */
export function kOverMc2Series(b: number, terms: number): number {
  const x = b * b;
  let a = 1; // coefficient of x⁰ in (1 − x)^(−1/2)
  let sum = 0;
  let xn = 1;
  for (let n = 1; n <= terms; n++) {
    a *= (2 * n - 1) / (2 * n); // a_n = a_{n−1}·(2n − 1)/(2n)
    xn *= x;
    sum += a * xn;
  }
  return sum;
}

/** 1 − β from γ, without cancellation: 1/(γ²(1 + β)). For γ ≫ 1 it is ≈ 1/(2γ²). */
export function oneMinusBetaFromGamma(g: number): number {
  if (!(g >= 1)) throw new RangeError(`γ = ${g} is below 1`);
  const b = Math.sqrt(1 - 1 / (g * g));
  return 1 / (g * g * (1 + b));
}

// ---------------------------------------------------------------- the thought experiment (units m = 1, c = 1)

/**
 * The lesson's momentum thought experiment. Two balls of mass m: A thrown along +y at u in S; B thrown along −y at u
 * in S′, which moves at +β along x. They meet in an elastic collision and each one's y velocity reverses in its own
 * frame. In S, A goes (0, +u) → (0, −u) and B (β, −u/γ) → (β, +u/γ) (the velocity transformation with u′ₓ = 0:
 * u_y = u′_y/γ). Returns the total change, A plus B, of the y momentum in S, in units of mc: Newton's m·v_y gives
 * −2u(1 − 1/γ), never zero for β > 0; γ_body·m·v_y gives zero exactly, at any u, because γ_B = γ·γ_u.
 */
export function collisionYMomentumChange(b: number, u: number): { newton: number; relativistic: number } {
  const g = gammaOf(b);
  const uyB = u / g;
  const newton = -2 * u + 2 * uyB;
  const relativistic = -2 * gammaOf(u) * u + 2 * gammaOf(Math.hypot(b, uyB)) * uyB;
  return { newton, relativistic };
}

// ---------------------------------------------------------------- SI

/** Rest energy mc² [J]. */
export const restEnergy = (m: number, c = C_LIGHT): number => m * c * c;

/** Relativistic momentum p = γmv [kg·m/s]. */
export const momentum = (m: number, v: number, c = C_LIGHT): number => gammaOf(v / c) * m * v;

/** Relativistic energy E = γmc² [J]. */
export const energy = (m: number, v: number, c = C_LIGHT): number => gammaOf(v / c) * m * c * c;

/** Kinetic energy K = (γ − 1)mc² [J]. */
export const kinetic = (m: number, v: number, c = C_LIGHT): number => kOverMc2(v / c) * m * c * c;

/** Newton's momentum mv and kinetic energy ½mv², for contrast. */
export const classicalMomentum = (m: number, v: number): number => m * v;
export const classicalKinetic = (m: number, v: number): number => 0.5 * m * v * v;

/** Joules to MeV with E_CHARGE (1 eV = 1.6e-19 J). */
export const mevFromJoules = (j: number): number => j / (E_CHARGE * 1e6);

/** MeV to joules. */
export const joulesFromMev = (mev: number): number => mev * E_CHARGE * 1e6;

/** p [kg·m/s] from pc [MeV]: pc·(J per MeV)/c. */
export const momentumSiFromMev = (pc: number, c = C_LIGHT): number => joulesFromMev(pc) / c;

// ---------------------------------------------------------------- particle-physics units (c = 1: MeV, MeV/c, MeV/c²)

/** pc = γβ·mc² of a particle of rest energy mc² at speed β. */
export const pcFromBeta = (b: number, mc2: number): number => pOverMc(b) * mc2;

/** E = γmc². */
export const energyFromBeta = (b: number, mc2: number): number => gammaOf(b) * mc2;

/** K = (γ − 1)mc². */
export const kineticFromBeta = (b: number, mc2: number): number => kOverMc2(b) * mc2;

/** E = √((pc)² + (mc²)²): the energy of a particle of momentum p. Works for m = 0 (E = pc). */
export const energyFromMomentumMev = (pc: number, mc2: number): number => Math.hypot(pc, mc2);

/** K = E − mc² from the momentum, without cancellation: (pc)²/(E + mc²). Works for m = 0 (K = pc). */
export function kineticFromMomentumMev(pc: number, mc2: number): number {
  const e = energyFromMomentumMev(pc, mc2);
  return e === 0 ? 0 : (pc * pc) / (e + mc2);
}

/** Newton's K = p²/(2m), in c = 1 units (pc)²/(2mc²). Infinite for m = 0. */
export const classicalKineticFromMomentumMev = (pc: number, mc2: number): number => (pc * pc) / (2 * mc2);

/** pc = √(E² − (mc²)²) from the energy. Throws if E < mc². */
export function momentumFromEnergyMev(E: number, mc2: number): number {
  if (E < mc2 * (1 - 1e-12)) throw new RangeError(`E = ${E} is below the rest energy ${mc2}`);
  return Math.sqrt(Math.max(0, E * E - mc2 * mc2));
}

/** pc = √(K² + 2K·mc²) from the kinetic energy. */
export const momentumFromKineticMev = (K: number, mc2: number): number => Math.sqrt(K * K + 2 * K * mc2);

/** β = pc/E: the speed from momentum and energy. A massless particle (E = pc) gives exactly 1. */
export function betaFromMomentumEnergy(pc: number, E: number): number {
  if (!(E > 0)) throw new RangeError('E must be positive');
  if (pc > E * (1 + 1e-12)) throw new RangeError(`pc = ${pc} exceeds E = ${E}: no such particle`);
  return Math.min(1, pc / E);
}

/** β of a particle of rest energy mc² and momentum pc: pc/√((pc)² + (mc²)²). */
export const betaFromMomentumMev = (pc: number, mc2: number): number =>
  pc === 0 && mc2 === 0 ? 1 : betaFromMomentumEnergy(pc, energyFromMomentumMev(pc, mc2));

/** γ = 1 + K/(mc²) from the kinetic energy. */
export const gammaFromKineticMev = (K: number, mc2: number): number => 1 + K / mc2;

/** β from the kinetic energy: √(1 − 1/γ²), γ = 1 + K/mc². */
export function betaFromKineticMev(K: number, mc2: number): number {
  const g = gammaFromKineticMev(K, mc2);
  return Math.sqrt(K * (K + 2 * mc2)) / (g * mc2);
}

/** β from the energy: √(1 − (mc²/E)²). Throws if E < mc². */
export const betaFromEnergyMev = (E: number, mc2: number): number => momentumFromEnergyMev(E, mc2) / E;

/** Newton's speed from the kinetic energy, √(2K/mc²): it exceeds 1 once K > ½mc². */
export const classicalBetaFromKineticMev = (K: number, mc2: number): number => Math.sqrt((2 * K) / mc2);

/** The rest energy of a particle whose E and pc are measured: √(E² − (pc)²) (the mass, as mc²). */
export function restEnergyFromEnergyMomentum(E: number, pc: number): number {
  const s = E * E - pc * pc;
  if (s < -1e-12 * E * E) throw new RangeError(`pc = ${pc} exceeds E = ${E}`);
  return Math.sqrt(Math.max(0, s));
}

/** The rest energy from the kinetic energy and the momentum: ((pc)² − K²)/(2K). */
export function restEnergyFromKineticMomentum(K: number, pc: number): number {
  if (!(K > 0)) throw new RangeError('K must be positive');
  return (pc * pc - K * K) / (2 * K);
}
