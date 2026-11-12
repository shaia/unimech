/**
 * The ether model of the Michelson–Morley interferometer, at any orientation of the arms, and the light legs a
 * figure draws (lesson 9.1). The shared module relativity.ts holds the two textbook orientations
 * (`etherTimeParallel`, `etherTimePerpendicular`, `fringeShiftOnRotation`); this module generalises them to an arm at
 * any angle to the wind, to arms of unequal length, and gives the lab-frame velocity of each leg for drawing.
 *
 * MODEL SPECIFICATION
 * - System: an interferometer at rest in the lab. Light leaves the beam splitter along arm 1 (length L₁, at angle
 *   θ to the ether wind) and along arm 2 (length L₂, at θ + 90°), reflects from a mirror at the end of each arm and
 *   returns to the splitter. The lab moves through the ether at speed v, so in the lab the ether flows past at the
 *   wind velocity w = v x̂ (the wind blows along +x; θ is measured from +x, counter-clockwise).
 * - Dynamics: the classical (pre-1905) prediction. Light moves at c relative to the ether and velocities add as in
 *   Galileo: in the lab, light's velocity is c n̂ + w, with n̂ the direction it is aimed relative to the ether. For it
 *   to travel along the arm direction û its lab speed u must satisfy |u û − w| = c, so
 *     u = (û·w) + √(c² − |w|² + (û·w)²),
 *   and with û·w = v cos θ the round trip of an arm of length L is
 *     t(θ) = 2L √(c² − v² sin²θ) / (c² − v²) = (2L/c) √(1 − β² sin²θ) / (1 − β²).
 *   θ = 0 gives (2L/c)/(1 − β²) and θ = 90° gives (2L/c)/√(1 − β²), the two textbook cases.
 *   The pattern at the detector is set by the difference Δt = t₁ − t₂; turning the instrument from θ₀ to θ shifts it by
 *   c(Δt(θ₀) − Δt(θ))/λ fringes (one fringe per period λ/c of the light).
 * - Boundary: arms exactly straight, the splitter at their common end; the light's travel inside the splitter and the
 *   tilt of the mirrors are ignored. The lab moves at constant velocity (Earth's rotation and orbit are slow changes).
 * - Ignored: everything relativity changes (that is the point: the experiment found no shift). Dispersion, the finite
 *   coherence of the source, the arms' thermal drift.
 * - Valid when: v < c (in the model light can always beat the wind). The small-speed forms hold for β ≪ 1.
 * - Failure modes: every function throws a RangeError for v ≥ c (the light could not get upstream).
 */

import { C_LIGHT } from './constants';

function check(v: number, c: number) {
  if (!(Math.abs(v) < c)) throw new RangeError(`ether wind v = ${v} is not below c = ${c}: light cannot get upstream`);
}

/** Lab speed of light travelling along a direction at angle `phi` to the wind (ether model). */
export function legSpeed(phi: number, v: number, c = C_LIGHT): number {
  check(v, c);
  const uw = v * Math.cos(phi);
  return uw + Math.sqrt(c * c - v * v + uw * uw);
}

/**
 * The direction (angle from +x) in which light must be aimed relative to the ether so that it travels along the
 * direction `phi` in the lab: n̂ = (u û − w)/c.
 */
export function aimAngle(phi: number, v: number, c = C_LIGHT): number {
  const u = legSpeed(phi, v, c);
  return Math.atan2(u * Math.sin(phi), u * Math.cos(phi) - v);
}

/** Round trip of an arm of length L at angle θ to the wind: (2L/c)√(1 − β² sin²θ)/(1 − β²). */
export function armRoundTrip(L: number, theta: number, v: number, c = C_LIGHT): number {
  check(v, c);
  const b = v / c;
  const s = Math.sin(theta);
  return ((2 * L) / c) * (Math.sqrt(1 - b * b * s * s) / (1 - b * b));
}

/** The same round trip as the sum of the two legs, out along θ and back along θ + 180° (for checking). */
export function armRoundTripFromLegs(L: number, theta: number, v: number, c = C_LIGHT): number {
  return L / legSpeed(theta, v, c) + L / legSpeed(theta + Math.PI, v, c);
}

/** Δt = t₁ − t₂: arm 1 (L₁) at θ, arm 2 (L₂) at θ + 90°. */
export function armDifference(L1: number, L2: number, theta: number, v: number, c = C_LIGHT): number {
  return armRoundTrip(L1, theta, v, c) - armRoundTrip(L2, theta + Math.PI / 2, v, c);
}

/**
 * Fringes the pattern moves by when the instrument is turned from θ₀ to θ: c(Δt(θ₀) − Δt(θ))/λ. Positive when the
 * difference shrinks. From θ₀ = 0 to θ = 90° with equal arms it is 2c Δt(0)/λ, `fringeShiftOnRotation` in
 * relativity.ts.
 */
export function fringeShiftBetween(
  L1: number,
  L2: number,
  theta0: number,
  theta: number,
  v: number,
  lambda: number,
  c = C_LIGHT,
): number {
  return (c * (armDifference(L1, L2, theta0, v, c) - armDifference(L1, L2, theta, v, c))) / lambda;
}

/** Small-speed form of a 90° turn with unequal arms: (L₁ + L₂)β²/λ (equal arms: 2Lβ²/λ). */
export const fringeShiftUnequalSmallSpeed = (L1: number, L2: number, v: number, lambda: number, c = C_LIGHT): number =>
  ((L1 + L2) * (v / c) ** 2) / lambda;

/** The ether wind for which a 90° turn of equal arms L shifts the pattern by N fringes: v = c√(Nλ/(2L)). */
export const windForShift = (N: number, L: number, lambda: number, c = C_LIGHT): number => c * Math.sqrt((N * lambda) / (2 * L));

/** The binomial approximation (1 + x)ⁿ ≈ 1 + nx, valid for |x| ≪ 1; its error is about n(n − 1)x²/2. */
export const binomialApprox = (x: number, n: number): number => 1 + n * x;

/**
 * Where a light pulse is on an arm at time t after it leaves the splitter: distance from the splitter [m] (0 → L
 * on the way out, L → 0 on the way back), and whether it is on its way back. After the round trip it stays at 0.
 */
export function pulseOnArm(L: number, theta: number, v: number, t: number, c = C_LIGHT): { s: number; back: boolean; done: boolean } {
  const out = legSpeed(theta, v, c);
  const back = legSpeed(theta + Math.PI, v, c);
  const t1 = L / out;
  if (t <= t1) return { s: Math.max(0, out * t), back: false, done: false };
  const t2 = t1 + L / back;
  if (t < t2) return { s: L - back * (t - t1), back: true, done: false };
  return { s: 0, back: true, done: true };
}
