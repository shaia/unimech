/**
 * Relative motion and the Galilean transformation (lesson 1.5, figure GalileanFrames).
 *
 * MODEL SPECIFICATION
 * - System: point bodies in a plane, described from two frames of reference. The frame S is the ground;
 *   the primed frame S' moves relative to S with velocity V [m/s] (the course's convention: along +x when
 *   it is a single number), and the two origins coincide at t = 0. An event is a place and a time, (t, r).
 * - Dynamics: kinematics only. The Galilean transformation r' = r − V t, t' = t. Differentiating once,
 *   v' = v − V (V constant); differentiating again, a' = a. When the frame itself accelerates (its velocity
 *   V(t) changes at the rate A), v' = v − V(t) and a' = a − A. Relative velocity v_AB = v_A − v_B is the
 *   velocity of A in the frame that moves with B.
 * - Boundary: none for the transformation. A river is a strip of width d between two straight banks, its
 *   current uniform across the strip; a boat keeps a fixed heading and a fixed speed relative to the water.
 * - Ignored: relativity (the time is the same in every frame: t' = t), the size of the bodies, the time a
 *   boat needs to reach its speed, any variation of the current across the river.
 * - Valid when: every speed is far below the speed of light (|v|/c ≲ 10⁻³ keeps the error of t' = t
 *   below 10⁻⁶); for a' = a, the frames do not rotate and V is constant.
 * - Failure modes: a boat with u ≤ c cannot reach the point opposite its start (riverHeadingOpposite
 *   returns null); a boat with zero velocity across the river never crosses (crossing time Infinity).
 *   closestApproach with equal velocities has no unique time: it returns t = 0 and the constant distance.
 */

import { add, dot, len, scale, sub, type Vec2 } from './vec';

/** An event: where (r, metres) and when (t, seconds) something happens, as one frame describes it. */
export interface Event2 {
  t: number;
  r: Vec2;
}

/** The same event described from the frame S' that moves with constant velocity V relative to S. */
export const toMovingFrame = (e: Event2, V: Vec2): Event2 => ({ t: e.t, r: sub(e.r, scale(V, e.t)) });

/** The inverse transformation: an event described in S' (moving with V), described back in S. */
export const fromMovingFrame = (e: Event2, V: Vec2): Event2 => ({ t: e.t, r: add(e.r, scale(V, e.t)) });

/** Velocity of a body in a frame that moves with velocity V: v' = v − V. */
export const velocityInFrame = (v: Vec2, V: Vec2): Vec2 => sub(v, V);

/** Velocity back in the ground frame from the velocity v' in a frame moving with V: v = v' + V. */
export const velocityFromFrame = (vPrime: Vec2, V: Vec2): Vec2 => add(vPrime, V);

/** Acceleration in a frame whose own acceleration is A: a' = a − A (A = 0 for a frame at constant V). */
export const accelerationInFrame = (a: Vec2, A: Vec2): Vec2 => sub(a, A);

/** Velocity of A relative to B (as seen from the frame that moves with B): v_AB = v_A − v_B. */
export const relativeVelocity = (vA: Vec2, vB: Vec2): Vec2 => sub(vA, vB);

/** Position at time t under constant acceleration: r0 + v0 t + ½ a t². */
export const positionConstAccel = (r0: Vec2, v0: Vec2, a: Vec2, t: number): Vec2 =>
  add(add(r0, scale(v0, t)), scale(a, 0.5 * t * t));

/* ------------------------------------------------------------------ closest approach */

export interface Approach {
  /** time of the closest approach, counted from t = 0 (never negative) [s] */
  t: number;
  /** the smallest distance at t ≥ 0 [m] */
  d: number;
}

/**
 * Closest approach of two bodies in uniform motion, from t = 0 on. In the frame of A, B starts at
 * r0 = rB0 − rA0 and moves in a straight line with w = vB − vA, so |r0 + w t|² is smallest at
 * t* = −r0·w / |w|², and the distance there is |r0 × w| / |w|. A t* in the past means they are already
 * moving apart: the closest is now.
 */
export function closestApproach(rA0: Vec2, vA: Vec2, rB0: Vec2, vB: Vec2): Approach {
  const r0 = sub(rB0, rA0);
  const w = relativeVelocity(vB, vA);
  const w2 = dot(w, w);
  if (w2 === 0) return { t: 0, d: len(r0) };
  const t = Math.max(0, -dot(r0, w) / w2);
  return { t, d: len(add(r0, scale(w, t))) };
}

/* ------------------------------------------------------------------ crossing a river */

/**
 * A river along x, its banks at y = 0 and y = d, the current c along +x. A boat moves at speed u relative
 * to the water, heading at angle θ from straight across, θ > 0 upstream (toward −x). Its ground velocity is
 * (c − u sin θ, u cos θ).
 */
export const boatGroundVelocity = (u: number, c: number, theta: number): Vec2 => [c - u * Math.sin(theta), u * Math.cos(theta)];

export interface Crossing {
  /** time to reach the far bank [s]; Infinity when the boat does not move across */
  time: number;
  /** displacement along the bank, + downstream [m] */
  drift: number;
  /** speed relative to the ground [m/s] */
  groundSpeed: number;
}

/** Crossing time, drift and ground speed for a fixed heading θ. */
export function crossing(u: number, c: number, theta: number, d: number): Crossing {
  const v = boatGroundVelocity(u, c, theta);
  if (v[1] <= 0) return { time: Infinity, drift: v[0] === 0 ? 0 : Math.sign(v[0]) * Infinity, groundSpeed: len(v) };
  const time = d / v[1];
  return { time, drift: v[0] * time, groundSpeed: len(v) };
}

/** The heading (upstream of straight across) that lands the boat opposite its start: sin θ = c/u; null if u ≤ c. */
export function riverHeadingOpposite(u: number, c: number): number | null {
  if (u <= c) return null;
  return Math.asin(c / u);
}

/**
 * When the boat is slower than the current (u < c) it cannot hold the line across. The heading that
 * minimises the drift points the boat's ground velocity at the largest angle from the current: the
 * ground velocity is tangent to the circle of radius u around the tip of c, so sin θ = u/c, and the
 * drift is d·√(c² − u²)/u. Returns null when u ≥ c (then zero drift is possible).
 */
export function minimumDrift(u: number, c: number, d: number): { theta: number; drift: number } | null {
  if (u >= c) return null;
  return { theta: Math.asin(u / c), drift: (d * Math.sqrt(c * c - u * u)) / u };
}

/** Round trip of length L each way at speed u relative to a medium that moves at c along the path. */
export const roundTripAlong = (u: number, c: number, L: number): number => L / (u - c) + L / (u + c);

/** Round trip of length L each way at speed u across a medium moving at c (heading corrected for drift). */
export const roundTripAcross = (u: number, c: number, L: number): number => (2 * L) / Math.sqrt(u * u - c * c);
