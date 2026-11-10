/**
 * Forces of mechanics (lesson 2.3): weight, the normal force, tension and the spring force. Weight and the
 * spring force have formulas (mg, −kx); the normal force and tension do not: they are the unknowns a
 * constraint fixes, found from the second law. The figure RopeTension draws these; the lesson's worked
 * examples and workbook recompute with them.
 *
 * MODEL SPECIFICATION
 * - System: point bodies (a person, a block, a load) and one-dimensional connectors: inextensible strings
 *   and ropes (massless, or uniform with mass m over length L, or with a given linear density λ(s)), and
 *   ideal springs of constant k. A surface touching a body pushes along its normal.
 * - Dynamics: Newton's second law in an inertial frame, along one line at a time.
 *   · Elevator: N − mg = ma (axis up), so N = m(g + a). A surface can only push: N ≥ 0.
 *   · Hump of radius R, speed v at the top (axis down, toward the centre): mg − N = mv²/R.
 *   · Rope: a piece of rope from s to s + ds has mass λ ds; the second law on it gives dT/ds = λ·a_eff,
 *     where s is measured from the load end and a_eff is what the rope behind must be given per unit mass:
 *     a for a horizontal pull on a frictionless floor, g + a for a vertical lift with acceleration a (up +).
 *     Hence T(s) = a_eff·(M + ∫₀ˢ λ ds'), the load M and the rope behind the point. A massless string
 *     (λ = 0) has the same tension everywhere, also while it accelerates.
 *   · Hooke's law: F = −kx, x the extension from the relaxed length. Springs in series carry the same
 *     force and their extensions add, 1/k = Σ 1/kᵢ; in parallel (equal extensions) the forces add, k = Σ kᵢ.
 *   · A heavy spring (mass m, constant k, relaxed length L) hanging with a load M: a piece of relaxed length
 *     dℓ has constant kL/dℓ and carries the tension at its place, so the total extension is
 *     (1/(kL))·∫ T dℓ = (M + m/2)g/k.
 *   · Atwood machine with a massless string over a massless frictionless pulley: one tension
 *     T = 2m₁m₂g/(m₁ + m₂), a = (m₂ − m₁)g/(m₁ + m₂) (positive: m₂ descends).
 * - Boundary: T = 0 at a free rope end with no load; T equals the applied force at the pulled end.
 * - Ignored: the stretch of strings and ropes (inextensible), sag of a horizontal rope (it is taken straight,
 *   which needs a pull much larger than its weight), friction (chapter 2.4), rotation of bodies, the
 *   pulley's mass and the time a change of tension takes to travel along a rope or spring (a wave).
 * - Valid when: the string stays taut (every T ≥ 0) and the body stays on the surface (N ≥ 0); the spring is
 *   in its linear range. The functions return the formula's value even where it goes negative: a negative
 *   N or T means the contact or the string is lost, and the caller must say so (`contactLost`).
 * - Failure modes: `tensionFromDensity` integrates λ with the midpoint rule; its error falls as 1/n² and
 *   is exact for a linear λ. `springChainExtension` lumps each piece's tension at its lower end; its error
 *   falls as 1/n.
 */

import { G } from './constants';
import { riemann, type Fn } from './calculus';

/* ------------------------------------------------------------ the normal force as a constraint unknown */

/** The normal force of an elevator floor (or a scale on it) on a body of mass m; a is the elevator's acceleration, up positive [N]. */
export const elevatorNormal = (m: number, a: number, g = G): number => m * (g + a);

/** The normal force of the road on a car at the top of a hump of radius R, speed v [N]. Negative: the car has left the road. */
export const humpNormal = (m: number, v: number, R: number, g = G): number => m * (g - (v * v) / R);

/** The normal force at the bottom of a dip of radius R [N]. */
export const dipNormal = (m: number, v: number, R: number, g = G): number => m * (g + (v * v) / R);

/** The speed above which a car leaves the top of a hump of radius R: N = 0 there [m/s]. */
export const humpTakeoffSpeed = (R: number, g = G): number => Math.sqrt(g * R);

/**
 * The normal force of a frictionless incline (angle θ) on a block of mass m pushed by a horizontal force F
 * toward the slope, and the block's acceleration along the slope (up the slope positive) [N, m/s²].
 */
export function inclinePush(m: number, thetaDeg: number, F: number, g = G): { N: number; a: number } {
  const th = (thetaDeg * Math.PI) / 180;
  return { N: m * g * Math.cos(th) + F * Math.sin(th), a: (F * Math.cos(th) - m * g * Math.sin(th)) / m };
}

/** A contact force or a tension below zero means the surface or the string has let go. */
export const contactLost = (force: number): boolean => force < 0;

/* ---------------------------------------------------------------------------------------- springs */

/** Hooke's law: the force of a spring stretched by x (compressed: x < 0) on what is attached to it [N]. */
export const springForce = (k: number, x: number): number => -k * x;

/** The extension of a massless spring holding a body of mass m at rest, or accelerating up at a [m]. */
export const hangingExtension = (m: number, k: number, a = 0, g = G): number => (m * (g + a)) / k;

/** The constant of springs in series: the same force through each, extensions add [N/m]. */
export const seriesK = (...ks: number[]): number => 1 / ks.reduce((s, k) => s + 1 / k, 0);

/** The constant of springs in parallel: the same extension, forces add [N/m]. */
export const parallelK = (...ks: number[]): number => ks.reduce((s, k) => s + k, 0);

/** The extension of a uniform heavy spring (mass m, constant k) hanging with a load M at its bottom [m]. */
export const heavySpringExtension = (M: number, m: number, k: number, g = G): number => ((M + m / 2) * g) / k;

/**
 * The same extension computed by cutting the spring into n pieces of constant n·k each, every piece carrying
 * the tension at its lower end (the load and the pieces below it): a first-order sum that converges to
 * `heavySpringExtension` [m].
 */
export function springChainExtension(M: number, m: number, k: number, n: number, g = G): number {
  let x = 0;
  for (let j = 0; j < n; j++) x += ((M + (m * j) / n) * g) / (n * k);
  return x;
}

/* ------------------------------------------------------------------------------------- ropes */

/** A rope behind a point: the load at its end, its own mass and length, and the acceleration it must be given. */
export interface Rope {
  /** the load at the rope's end, s = 0 [kg] */
  M: number;
  /** the rope's mass [kg] (0: a massless string) */
  m: number;
  /** its length [m] */
  L: number;
  /** a for a horizontal pull, g + a for a vertical lift with acceleration a (up +) [m/s²] */
  aEff: number;
}

/** The tension at distance s from the load end of a uniform rope: it gives the load and the rope behind the point a_eff [N]. */
export const ropeTension = (r: Rope, s: number): number => r.aEff * (r.M + (r.m * s) / r.L);

/** A uniform rope hanging from a ceiling (or a hand lifting it with acceleration a, up +), with a load M at its bottom. */
export const hangingRope = (M: number, m: number, L: number, a = 0, g = G): Rope => ({ M, m, L, aEff: g + a });

/** The tension at depth y below the top of a hanging rope [N]. */
export const hangingTensionAtDepth = (r: Rope, y: number): number => ropeTension(r, r.L - y);

/** A uniform rope pulled by F along a frictionless floor, dragging a block M: the common acceleration a = F/(M + m). */
export function pulledRope(F: number, M: number, m: number, L: number): Rope {
  return { M, m, L, aEff: F / (M + m) };
}

/**
 * The tension at distance s from the load end of a rope with linear density λ(s), by the midpoint rule with
 * n pieces: a_eff·(M + ∫₀ˢ λ) [N].
 */
export function tensionFromDensity(lambda: Fn, M: number, aEff: number, s: number, n = 200): number {
  return aEff * (M + (s > 0 ? riemann(lambda, 0, s, n, 'mid') : 0));
}

/** A uniform rope sliding off a frictionless table (x of its length L hanging over a smooth edge): a and T at the edge. */
export function ropeOverEdge(m: number, L: number, x: number, g = G): { a: number; Tedge: number } {
  const a = (g * x) / L;
  return { a, Tedge: ((m * (L - x)) / L) * a };
}

/** A uniform rope over a small smooth peg, x on one side and L − x on the other: a (the x side descends) and T at the peg. */
export function ropeOverPeg(m: number, L: number, x: number, g = G): { a: number; Tpeg: number } {
  const a = (g * (2 * x - L)) / L;
  return { a, Tpeg: ((m * (L - x)) / L) * (g + a) };
}

/** Blocks in a row on a frictionless floor, joined by massless strings, pulled by F at the last one: a and the tension after each block. */
export function blockTrain(F: number, masses: number[]): { a: number; T: number[] } {
  const a = F / masses.reduce((s, m) => s + m, 0);
  let behind = 0;
  return { a, T: masses.slice(0, -1).map((m) => (behind += m) * a) };
}

/** Atwood machine: massless string over a massless frictionless pulley. a > 0: m₂ descends. */
export function atwood(m1: number, m2: number, g = G): { a: number; T: number } {
  return { a: ((m2 - m1) * g) / (m1 + m2), T: (2 * m1 * m2 * g) / (m1 + m2) };
}

/** The tension in a uniform rope (mass m₁, length l) whirled at ω about one end, with a point mass m₂ at the far end, at distance r. */
export const whirledRopeTension = (m1: number, m2: number, l: number, omega: number, r: number): number =>
  m2 * omega * omega * l + (m1 * omega * omega * (l * l - r * r)) / (2 * l);
