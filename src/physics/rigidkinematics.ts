/**
 * Planar kinematics of a rigid body for lesson 8.1, on top of the shared model in rigidbody.ts (pointVelocity,
 * rotationVelocity, instantaneousCentre, uniformAlpha): where the points of a body are while it translates and
 * turns, the acceleration of a point as a vector, the slip of the contact point of a wheel, rolling on a moving
 * surface, and the moments of rotation at constant α (the instant ω = 0, the angle at which a_c = a_t).
 *
 * MODEL SPECIFICATION
 * - System: one rigid body in the xy plane (x right, y up, z out of the page, ⊙). Its pose is the position R of its
 *   centre of mass and the angle φ of a line fixed in the body, counter-clockwise from +x. A point of the body is
 *   given by its offset b in the body's own frame (b at φ = 0), so its offset from the CM is r = rot(φ) b. ω = dφ/dt
 *   and α = dω/dt are counter-clockwise positive (ω = ω ẑ). The round-body helpers take the floor below the
 *   centre (the contact point at r = (0, −R)); here ω keeps the counter-clockwise sign, so rolling to the right is
 *   ω = −V/R. (rigidbody.ts's 1-D rolling functions use the rolling sense instead; we never mix the two.)
 * - Dynamics: none (kinematics). v = V_cm + ω × r; a = A_cm + α × r − ω² r; uniform motion: R = R₀ + V t,
 *   φ = φ₀ + ω t; constant α: ω = ω₀ + α t, φ = φ₀ + ω₀ t + ½ α t², ω² = ω₀² + 2 α Δφ.
 * - Boundary: initial pose, V_cm and ω given by the caller.
 * - Ignored: deformation (the body is rigid), the thickness of the floor or belt, any force: nothing here says what
 *   makes the body move.
 * - Valid when: the body is rigid and moves in its own plane (ω perpendicular to that plane).
 * - Failure modes: a body with ω = 0 has no instantaneous centre (it is at infinity: pure translation), and
 *   `reversalTime` returns null when α = 0 or when ω₀ and α have the same sign (the body never stops).
 */

import { pointVelocity, rotationVelocity, uniformAlpha } from './rigidbody';
import { add, sub, type Vec2 } from './vec';

/** Turn a vector by the angle φ counter-clockwise. */
export const rotate = (b: Vec2, phi: number): Vec2 => [b[0] * Math.cos(phi) - b[1] * Math.sin(phi), b[0] * Math.sin(phi) + b[1] * Math.cos(phi)];

/** The pose of a body that moves at constant V_cm and constant ω: R = R₀ + V t, φ = φ₀ + ω t. */
export function uniformPose(R0: Vec2, phi0: number, Vcm: Vec2, omega: number, t: number): { R: Vec2; phi: number } {
  return { R: [R0[0] + Vcm[0] * t, R0[1] + Vcm[1] * t], phi: phi0 + omega * t };
}

/** Where a point of the body is: R + rot(φ) b, b the point's offset from the CM in the body's own frame. */
export const pointPosition = (R: Vec2, phi: number, b: Vec2): Vec2 => add(R, rotate(b, phi));

/**
 * Acceleration of a point of the body at r from the CM: a = A_cm + α ẑ × r − ω² r. The middle term is the
 * tangential acceleration (αr, perpendicular to r), the last the centripetal one (ω²r, toward the CM).
 */
export function pointAccelerationVec(Acm: Vec2, omega: number, alpha: number, r: Vec2): Vec2 {
  const t = rotationVelocity(alpha, r);
  return [Acm[0] + t[0] - omega * omega * r[0], Acm[1] + t[1] - omega * omega * r[1]];
}

/** The velocity of the contact point of a round body (radius R) on a floor below its centre: V + ωR along x. */
export const contactVelocity = (V: Vec2, omega: number, R: number): Vec2 => pointVelocity(V, omega, [0, -R]);

/** The counter-clockwise spin with which a round body moving at V along x rolls without slipping: ω = −V/R. */
export const rollingOmega = (V: number, R: number) => -V / R;

/**
 * A round body (radius R) rolling without slipping on a belt that moves along x at u: the contact point moves
 * with the belt, V + ωR = u, so ω = (u − V)/R (counter-clockwise positive).
 */
export const rollingOnBelt = (V: number, u: number, R: number) => (u - V) / R;

/**
 * A cylinder (radius R) between two boards moving along x, the top board at u₁ and the bottom one at u₂, without
 * slipping on either: V = (u₁ + u₂)/2 and ω = (u₂ − u₁)/(2R) (counter-clockwise positive).
 */
export function rollerBetween(u1: number, u2: number, R: number): { V: number; omega: number } {
  return { V: (u1 + u2) / 2, omega: (u2 - u1) / (2 * R) };
}

/**
 * The speed of a point on the rim of a wheel rolling without slipping at speed V, at height h above the floor:
 * it turns about the contact point at |ω| = V/R, a distance √(2Rh) away, so v = V √(2h/R).
 */
export const rimSpeedAtHeight = (V: number, R: number, h: number) => V * Math.sqrt((2 * h) / R);

/** Constant α: the time at which ω passes through zero (the body stops for an instant and turns back), or null. */
export function reversalTime(omega0: number, alpha: number): number | null {
  if (alpha === 0) return null;
  const t = -omega0 / alpha;
  return t > 0 ? t : null;
}

/** Constant α: ω after turning through Δφ, from ω² = ω₀² + 2αΔφ (the magnitude; null if never reached). */
export function omegaAfterAngle(omega0: number, alpha: number, dphi: number): number | null {
  const w2 = omega0 * omega0 + 2 * alpha * dphi;
  return w2 < 0 ? null : Math.sqrt(w2);
}

/**
 * The angle between a point's acceleration and the inward radius (toward the axis): tan β = a_t/a_c = α/ω². Signed:
 * positive when the tangential part points counter-clockwise.
 */
export const accelerationAngle = (omega: number, alpha: number) => Math.atan2(alpha, omega * omega);

/**
 * Constant α from rest: the time and the angle at which a point's tangential and centripetal accelerations are equal
 * (ω² = |α|): t = 1/√|α| and Δφ = ½ rad, whatever α.
 */
export function equalComponentsFromRest(alpha: number): { t: number; dphi: number } {
  const t = 1 / Math.sqrt(Math.abs(alpha));
  return { t, dphi: uniformAlpha(0, 0, Math.abs(alpha), t).theta };
}

/** The magnitude of a point's acceleration at radius r about a fixed axis: r √(α² + ω⁴). */
export const accelerationMagnitude = (omega: number, alpha: number, r: number) => r * Math.hypot(alpha, omega * omega);

/** The rigid-body condition: the components of the velocities of two points along the line between them. */
export function alongLine(pA: Vec2, vA: Vec2, pB: Vec2, vB: Vec2): [number, number] {
  const d = sub(pB, pA);
  const l = Math.hypot(d[0], d[1]);
  return [(vA[0] * d[0] + vA[1] * d[1]) / l, (vB[0] * d[0] + vB[1] * d[1]) / l];
}

/** Revolutions in an angle given in radians. */
export const revolutions = (theta: number) => theta / (2 * Math.PI);
