/**
 * Angular momentum of a rigid body and its conservation (lesson 8.6): a turntable whose moment of inertia changes
 * while nothing outside turns it (weights pulled along rails, a ring dropped on it), and a short collision between a
 * particle and a rod, either pinned at one end or free on a smooth table. Imports the chapter's shared model,
 * src/physics/rigidbody.ts; the closed forms here are checked against its `spinChange`, `hitPivoted` and
 * `stickToFreeRod`.
 *
 * MODEL SPECIFICATION
 * - System (turntable): a platform of moment of inertia I₀ about a fixed vertical axis on a frictionless bearing,
 *   with n equal point masses m on radial rails at a common radius r, so I = I₀ + n m r²; optionally a ring of
 *   moment I_ring dropped on it at rest. Angular momentum is the component L_z = Iω along the axis.
 * - Dynamics (turntable): no external torque about the axis, so L_z = I ω is constant. When the masses move from r₁
 *   to r₂ slowly (ṙ ≪ ω r), the string on each mass pulls inward with T = m ω² r and does the work
 *   W = ∫ n m ω² r (−dr) = L²/2 (1/I₂ − 1/I₁) = ΔK. A ring dropped on the platform slides on it under a constant
 *   friction torque τ_f until both turn together at ω_f = L/(I + I_ring); the heat is ½ I I_ring/(I + I_ring) ω².
 * - System (strike): a uniform rod (M, length ℓ) at rest along y on a horizontal smooth table, its top end at
 *   y = +ℓ/2, its centre at the origin; a particle m moves along +x at speed v and hits the rod a distance s below
 *   the top end (0 ≤ s ≤ ℓ). Mount 'pivot': a pin holds the top end; mount 'free': nothing holds the rod.
 *   x right, y up, z out of the table (⊙): ω > 0 is counter-clockwise. Angular momentum about the pin (pivot) or
 *   about O, the fixed point where the rod's centre is at the instant of the hit (free).
 * - Dynamics (strike): one impulse J (along +x on the rod, −x on the particle) at the hit point. Pivot: I_P ω = J s,
 *   the pin supplies whatever impulse J_P keeps the top end in place. Free: M u = J (u the velocity of the rod's
 *   centre) and I_cm ω = J b, b = s − ℓ/2. The rod's hit point then moves at J k with k = s²/I_P (pivot) or
 *   1/M + b²/I_cm (free). Restitution e (0 sticks, 1 elastic) closes it: J = (1 + e) v/(1/m + k).
 *   Sticking: ω = m v s/(I_P + m s²) (pivot), ω = μ v b/(I_cm + μ b²) with μ = m M/(m + M) (free).
 * - Boundary: the turntable's initial ω₀ and r₀; the rod at rest, the particle's m, v, s.
 * - Ignored: the bearing's friction and air; the size of the masses on the rails and of the particle; the time the
 *   collision takes (the rod does not move during it); gravity and the table's normal force during the hit (finite
 *   forces give no impulse in a vanishing time, and both are vertical anyway); friction between particle and rod.
 * - Valid when: the axis is fixed and the masses move slowly along the rails (the quasi-static pull); the collision
 *   is short compared with the time the rod takes to turn appreciably; 0 ≤ e ≤ 1.
 * - Failure modes: a hit at the pin (s = 0) gives k = 0: the particle bounces off as from a wall and ω = 0; the
 *   slip time of the ring is infinite for τ_f = 0 (the ring never catches up).
 */

import { rodCentre, rodEnd } from './rigidbody';

// ---------------------------------------------------------------- a body that changes its moment of inertia

/** Moment of inertia of a platform I₀ with n point masses m at radius r: I₀ + n m r². */
export const turntableInertia = (I0: number, m: number, r: number, n = 2) => I0 + n * m * r * r;

/** Kinetic energy of rotation written with the angular momentum: K = L²/(2I). */
export const keFromL = (L: number, I: number) => (L * L) / (2 * I);

/** The work of the pull that takes the moment of inertia from I₁ to I₂ at constant L: L²/2 (1/I₂ − 1/I₁). */
export const pullWork = (L: number, I1: number, I2: number) => 0.5 * L * L * (1 / I2 - 1 / I1);

/** The inward pull on one mass moving slowly along its rail: m ω² r (the net radial force of its circle). */
export const pullForce = (m: number, omega: number, r: number) => m * omega * omega * r;

/**
 * The same work as an integral of force along the path: W = ∫ n T (−dr) from r₁ to r₂, with ω(r) = L/I(r) at
 * each radius. Midpoint sum of `steps` pieces (for the convergence test).
 */
export function pullWorkByIntegral(I0: number, m: number, n: number, L: number, r1: number, r2: number, steps: number): number {
  const h = (r2 - r1) / steps;
  let W = 0;
  for (let i = 0; i < steps; i++) {
    const r = r1 + (i + 0.5) * h;
    const w = L / turntableInertia(I0, m, r, n);
    W += n * pullForce(m, w, r) * -h;
  }
  return W;
}

/** Two bodies on one axis (ω₁, ω₂) brought to turn together: L conserved, kinetic energy lost to heat. */
export function couple(I1: number, omega1: number, I2: number, omega2: number) {
  const L = I1 * omega1 + I2 * omega2;
  const omegaF = L / (I1 + I2);
  const K0 = 0.5 * I1 * omega1 * omega1 + 0.5 * I2 * omega2 * omega2;
  const K1 = 0.5 * (I1 + I2) * omegaF * omegaF;
  return { L, omegaF, K0, K1, heat: K0 - K1 };
}

/**
 * The slip of a ring (I₂, at ω₂) on a platform (I₁, at ω₁ > ω₂) under a constant friction torque τ (> 0) between
 * them: each changes at ±τ/I until they turn together. Returns the angular velocities and the angles turned at
 * time t, and the slip time.
 */
export function coupleState(I1: number, omega1: number, I2: number, omega2: number, tau: number, t: number) {
  const { omegaF } = couple(I1, omega1, I2, omega2);
  const s = Math.sign(omega1 - omega2);
  const a1 = (-s * tau) / I1;
  const a2 = (s * tau) / I2;
  const tSlip = tau > 0 ? (I1 * Math.abs(omega1 - omegaF)) / tau : Infinity;
  const tt = Math.min(t, tSlip);
  const w1 = omega1 + a1 * tt;
  const w2 = omega2 + a2 * tt;
  let phi1 = omega1 * tt + 0.5 * a1 * tt * tt;
  let phi2 = omega2 * tt + 0.5 * a2 * tt * tt;
  if (t > tSlip) {
    phi1 += omegaF * (t - tSlip);
    phi2 += omegaF * (t - tSlip);
  }
  return { omega1: w1, omega2: w2, phi1, phi2, tSlip, slipping: t < tSlip };
}

// ---------------------------------------------------------------- a particle hits a rod

export type Mount = 'pivot' | 'free';

export interface Strike {
  /** particle mass [kg] and speed along +x [m/s] */
  m: number;
  v: number;
  /** rod mass [kg] and length [m] */
  M: number;
  L: number;
  /** the hit point, a distance s below the top end (0 ≤ s ≤ L) [m] */
  s: number;
  mount: Mount;
  /** coefficient of restitution: 0 the particle sticks, 1 elastic */
  e: number;
}

export interface StrikeResult {
  /** lever arm of the hit about the reference point (pin, or O at the rod's centre), signed: L_z = m v b */
  b: number;
  /** the rod's moment of inertia about the reference point (I_P or I_cm) */
  I: number;
  /** inverse effective mass of the rod's hit point: k = s²/I_P or 1/M + b²/I_cm */
  k: number;
  /** the impulse the particle gives the rod, along +x [N·s] */
  J: number;
  /** the rod's angular velocity just after (counter-clockwise +) */
  omega: number;
  /** the velocity (x) of the rod's centre just after */
  u: number;
  /** the particle's velocity (x) just after */
  vAfter: number;
  /** the impulse of the pin on the rod (x), zero for a free rod */
  pivotImpulse: number;
  /** total momentum (x), angular momentum about the reference point (z), kinetic energy: before and after */
  p0: number;
  p1: number;
  L0: number;
  L1: number;
  K0: number;
  K1: number;
}

/** The collision of a particle with a pinned or a free rod (see the model specification). */
export function strike(S: Strike): StrikeResult {
  const { m, v, M, L, s, mount, e } = S;
  const pivot = mount === 'pivot';
  const b = pivot ? s : s - L / 2;
  const I = pivot ? rodEnd(M, L) : rodCentre(M, L);
  const k = pivot ? (b * b) / I : 1 / M + (b * b) / I;
  const J = ((1 + e) * v) / (1 / m + k);
  const omega = (J * b) / I;
  const u = pivot ? (omega * L) / 2 : J / M;
  const vAfter = v - J / m;
  const p0 = m * v;
  const p1 = m * vAfter + M * u;
  const L0 = m * v * b;
  // after: the particle still on its line (lever arm b), the rod's spin about the reference point; a free rod's
  // centre is at O at that instant, so its translation adds nothing about O
  const L1 = m * vAfter * b + I * omega;
  const K0 = 0.5 * m * v * v;
  const Krod = pivot ? 0.5 * I * omega * omega : 0.5 * M * u * u + 0.5 * I * omega * omega;
  const K1 = 0.5 * m * vAfter * vAfter + Krod;
  return { b, I, k, J, omega, u, vAfter, pivotImpulse: pivot ? p1 - p0 : 0, p0, p1, L0, L1, K0, K1 };
}

/** The kinetic energy a collision turns into heat and deformation: ½ (1 − e²) v²/(1/m + k). */
export const strikeHeat = (S: Strike) => {
  const r = strike({ ...S, e: 0 });
  return (0.5 * (1 - S.e * S.e) * S.v * S.v) / (1 / S.m + r.k);
};

/**
 * Where the rod and the particle are a time t after the hit (t ≥ 0), with nothing acting after it (the pin holds a
 * pinned rod's top end). Returns the rod's centre and angle (0 = along +y, counter-clockwise +), its two ends, and
 * the particle (carried with the rod when it stuck).
 */
export function strikeState(S: Strike, r: StrikeResult, t: number) {
  const th = r.omega * t;
  const dir: [number, number] = [-Math.sin(th), Math.cos(th)]; // from the centre toward the top end
  const pin: [number, number] = [0, S.L / 2];
  const centre: [number, number] = S.mount === 'pivot' ? [pin[0] - (dir[0] * S.L) / 2, pin[1] - (dir[1] * S.L) / 2] : [r.u * t, 0];
  const top: [number, number] = [centre[0] + (dir[0] * S.L) / 2, centre[1] + (dir[1] * S.L) / 2];
  const bottom: [number, number] = [centre[0] - (dir[0] * S.L) / 2, centre[1] - (dir[1] * S.L) / 2];
  const along = S.L / 2 - S.s; // the hit point, from the centre toward the top end
  const particle: [number, number] =
    S.e === 0 ? [centre[0] + dir[0] * along, centre[1] + dir[1] * along] : [r.vAfter * t, S.L / 2 - S.s];
  return { centre, angle: th, top, bottom, particle };
}

/**
 * The point of the rod at rest just after the hit, as a distance below the top end (it may lie off the rod, or
 * not exist when ω = 0). A free rod: where u − ω y = 0 along the rod; a pinned rod: the pin.
 */
export function pointAtRest(S: Strike, r: StrikeResult): number | null {
  if (S.mount === 'pivot') return 0;
  if (r.omega === 0) return null;
  // a point at height y (from the centre) on the rod moves at u − ω y along x
  const y = r.u / r.omega;
  return S.L / 2 - y;
}
