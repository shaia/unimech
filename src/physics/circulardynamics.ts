/**
 * MODEL SPECIFICATION: the dynamics of circular motion (lesson 2.6).
 *
 * System:    one point body of mass m [kg] on a circle of radius R [m], acted on by real forces only: its
 *            weight mg (exerted by the Earth), a normal force N (by a road, a hoop or a wall), static friction f
 *            (by the road), a tension T (by a string) or the force of a light rod. The kinematics of the circle
 *            (a_c = v²/R toward the centre, a_t = dv/dt along the velocity) is lesson 1.3's, imported from
 *            curvilinear.ts.
 * Dynamics:  Newton's second law in an inertial frame (the ground), written in components:
 *              radial (toward the centre):  ΣF_r = m v²/R      tangential:  ΣF_t = m dv/dt
 *            The "centripetal force" is not a force of its own: it is the name of ΣF_r. There is no
 *            centrifugal force in this module (it exists only in a rotating frame, chapter 7).
 *            Presets solved in closed form:
 *              flat curve:        f = m v²/R ≤ μs m g          → v_max = √(μs g R)
 *              banked curve (θ):  N sinθ + f cosθ = m v²/R,  N cosθ − f sinθ = m g   (f > 0 down the slope)
 *                                 → N = m(g cosθ + (v²/R) sinθ),  f = m((v²/R) cosθ − g sinθ);
 *                                 f = 0 at the design speed v₀² = gR tanθ; |f| ≤ μs N gives the speed range.
 *              conical pendulum:  T cosθ = m g,  T sinθ = m ω² L sinθ  → ω² = g/(L cosθ),  T = m g/cosθ.
 *              vertical circle:   angle φ from the lowest point, counter-clockwise; position R(sin φ, −cos φ)
 *                                 from the centre. Radial: F_s − m g cos φ = m v²/R, where F_s is the force of
 *                                 the string or rod toward the centre (a string pulls, F_s = T ≥ 0; a rod
 *                                 may also push, F_s < 0). Tangential: m dv/dt = −m g sin φ, which with the
 *                                 chain rule (dv/dt = (v/R) dv/dφ) integrates to v² = v_b² − 2gR(1 − cos φ).
 *              hump (outside of a vertical circle, top):  m g − N = m v²/R, N ≥ 0 → v ≤ √(gR).
 * Boundary:  the circle is given (a road, a string of fixed length, a rigid hoop); the speed at the lowest
 *            point v_b, the bank angle θ, μs, L, ω are inputs.
 * Ignored:   air drag, rolling resistance and the size of the body (a car is a point at its centre of mass,
 *            so no tipping); the mass of the string or rod; the Earth's rotation.
 * Valid when: the body stays on its circle. A string holds it only while T ≥ 0, a road only while N ≥ 0,
 *            static friction only while |f| ≤ μs N.
 * Failure modes: a string with v_b² between 2gR and 5gR goes slack at cos φ_s = (2gR − v_b²)/(3gR); after
 *            that the body is a projectile (curvilinear.projectilePath) until the string is taut again, where a
 *            jerk that this model does not describe takes over. With v_b² ≤ 2gR the body swings back below the
 *            horizontal (a pendulum) and never goes slack. On a banked curve with μs ≥ cot θ there is no upper
 *            speed limit (vMax = Infinity), and with μs ≥ tan θ a parked car does not slide (vMin = 0).
 *            A conical pendulum needs ω² L > g; slower, the only solution is θ = 0, hanging straight down.
 *
 * Sign convention: radial components positive toward the centre; φ counter-clockwise from the lowest point;
 * bank friction positive down the slope (toward the centre of the curve).
 */

import { G } from './constants';
import type { Vec2 } from './vec';

/* ---------------------------------------------------------------- flat and banked curves */

/** Largest speed on a flat curve of radius R with static friction μs: √(μs g R). */
export const flatCurveMaxSpeed = (mu: number, R: number, g: number = G): number => Math.sqrt(mu * g * R);

/** The speed at which a curve banked at θ needs no friction: √(g R tan θ). */
export const bankedDesignSpeed = (R: number, theta: number, g: number = G): number => Math.sqrt(g * R * Math.tan(theta));

export interface BankedForces {
  /** normal force [N] */
  N: number;
  /** static friction needed [N]: positive down the slope (toward the centre), negative up the slope */
  f: number;
  /** the net force [N], horizontal toward the centre: m v²/R */
  net: number;
}

/** The normal force and the friction a car of mass m needs at speed v on a curve of radius R banked at θ. */
export function bankedForces(m: number, R: number, theta: number, v: number, g: number = G): BankedForces {
  const ac = (v * v) / R;
  return {
    N: m * (g * Math.cos(theta) + ac * Math.sin(theta)),
    f: m * (ac * Math.cos(theta) - g * Math.sin(theta)),
    net: m * ac,
  };
}

export interface SpeedRange {
  /** slowest speed without sliding down [m/s]; 0 when friction can hold a parked car */
  vMin: number;
  /** fastest speed without sliding up [m/s]; Infinity when μs ≥ cot θ */
  vMax: number;
}

/**
 * The speeds at which a car stays on a banked curve without sliding:
 *   v_min² = gR (sinθ − μs cosθ)/(cosθ + μs sinθ)    (friction μs N up the slope)
 *   v_max² = gR (sinθ + μs cosθ)/(cosθ − μs sinθ)    (friction μs N down the slope)
 */
export function bankedSpeedRange(R: number, theta: number, mu: number, g: number = G): SpeedRange {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const lo = (g * R * (s - mu * c)) / (c + mu * s);
  const den = c - mu * s;
  return {
    vMin: lo > 0 ? Math.sqrt(lo) : 0,
    vMax: den > 0 ? Math.sqrt((g * R * (s + mu * c)) / den) : Infinity,
  };
}

/* ---------------------------------------------------------------- conical pendulum */

export interface Conical {
  /** angular velocity [rad/s] */
  omega: number;
  /** period of one turn [s] */
  period: number;
  /** radius of the horizontal circle [m] */
  radius: number;
  /** tension in units of the weight, T/(mg) = 1/cos θ */
  tensionPerWeight: number;
}

/** A conical pendulum of string length L at angle θ from the vertical: ω² = g/(L cos θ). */
export function conicalPendulum(L: number, theta: number, g: number = G): Conical {
  const omega = Math.sqrt(g / (L * Math.cos(theta)));
  return { omega, period: (2 * Math.PI) / omega, radius: L * Math.sin(theta), tensionPerWeight: 1 / Math.cos(theta) };
}

/** The angle [rad] at which a conical pendulum of length L turns at ω: cos θ = g/(ω² L); 0 when ω² L ≤ g. */
export function conicalAngle(L: number, omega: number, g: number = G): number {
  const c = g / (omega * omega * L);
  return c >= 1 ? 0 : Math.acos(c);
}

/**
 * A ride whose chains of length L hang from a ring of radius d about the axis (d = 0 is the conical
 * pendulum): tan θ = ω² (d + L sin θ)/g, so ω = √(g tan θ/(d + L sin θ)).
 */
export const chainRideOmega = (d: number, L: number, theta: number, g: number = G): number =>
  Math.sqrt((g * Math.tan(theta)) / (d + L * Math.sin(theta)));

/* ---------------------------------------------------------------- vertical circle */

export type Support = 'string' | 'rod';

/** Position on a vertical circle of radius R about the origin, angle φ from the lowest point (CCW). */
export const verticalPosition = (R: number, phi: number): Vec2 => [R * Math.sin(phi), -R * Math.cos(phi)];

/** Velocity on the circle for speed v moving counter-clockwise (v < 0: clockwise). */
export const verticalVelocity = (v: number, phi: number): Vec2 => [v * Math.cos(phi), v * Math.sin(phi)];

/** v² at angle φ from the tangential second law and the chain rule: v_b² − 2gR(1 − cos φ) (may be negative: not reached). */
export const verticalSpeed2 = (vb: number, R: number, phi: number, g: number = G): number => vb * vb - 2 * g * R * (1 - Math.cos(phi));

/**
 * The force of the string or rod toward the centre [N] at angle φ, at speed² v2: from the radial component
 * F_s − m g cos φ = m v²/R. Positive: pulls toward the centre; negative: pushes away (a rod only).
 */
export const supportForce = (m: number, v2: number, R: number, phi: number, g: number = G): number => (m * v2) / R + m * g * Math.cos(phi);

/** The same force when the speed at the lowest point is v_b: m v_b²/R − 2mg + 3mg cos φ. */
export const supportForceFromBottom = (m: number, vb: number, R: number, phi: number, g: number = G): number =>
  supportForce(m, verticalSpeed2(vb, R, phi, g), R, phi, g);

/** Smallest speed at the top that keeps the body on the circle: √(gR) on a string, 0 on a rod. */
export const topMinSpeed = (R: number, support: Support, g: number = G): number => (support === 'string' ? Math.sqrt(g * R) : 0);

/** Smallest speed at the bottom that takes the body round the circle: √(5gR) on a string, √(4gR) on a rod. */
export const bottomMinSpeed = (R: number, support: Support, g: number = G): number =>
  Math.sqrt((support === 'string' ? 5 : 4) * g * R);

/** Highest angle the body reaches when it stops on the circle (v_b² ≤ 4gR); π when it goes over the top. */
export function stopAngle(vb: number, R: number, g: number = G): number {
  const c = 1 - (vb * vb) / (2 * g * R);
  return c <= -1 ? Math.PI : Math.acos(c);
}

/**
 * The angle at which a string goes slack, cos φ_s = (2gR − v_b²)/(3gR), for 2gR < v_b² < 5gR; null otherwise
 * (the string stays taut: the body swings back, or goes round).
 */
export function slackAngle(vb: number, R: number, g: number = G): number | null {
  const v2 = vb * vb;
  if (v2 <= 2 * g * R || v2 >= 5 * g * R) return null;
  return Math.acos((2 * g * R - v2) / (3 * g * R));
}

/**
 * Time [s] from leaving the circle at (p0, v0) (both relative to the centre) until the body, now a
 * projectile, is a distance R from the centre again: the string is taut again. Bisection after a scan.
 */
export function retautTime(p0: Vec2, v0: Vec2, R: number, g: number = G): number {
  const d = (t: number) => Math.hypot(p0[0] + v0[0] * t, p0[1] + v0[1] * t - 0.5 * g * t * t) - R;
  const h = 1e-4 * Math.sqrt(R / g);
  let lo = h;
  // the body first moves inside the circle (d < 0); scan for the return to d = 0
  let t = h;
  while (d(t) >= 0 && t < 10) t += h;
  lo = t;
  let hi = lo;
  while (d(hi) < 0 && hi < 100) hi += 0.01 * Math.sqrt(R / g);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (d(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** One RK4 step of the tangential equation on the circle, φ̈ = −(g/R) sin φ, for the state (φ, φ̇). */
export function circleStep(phi: number, w: number, R: number, dt: number, g: number = G): [number, number] {
  const f = (p: number) => -(g / R) * Math.sin(p);
  const k1p = w;
  const k1w = f(phi);
  const k2p = w + (dt / 2) * k1w;
  const k2w = f(phi + (dt / 2) * k1p);
  const k3p = w + (dt / 2) * k2w;
  const k3w = f(phi + (dt / 2) * k2p);
  const k4p = w + dt * k3w;
  const k4w = f(phi + dt * k3p);
  return [phi + (dt / 6) * (k1p + 2 * k2p + 2 * k3p + k4p), w + (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w)];
}

/** Normal force of a road on a car of mass m at the top of a hump of radius R: m(g − v²/R); negative = it has left the road. */
export const humpNormal = (m: number, v: number, R: number, g: number = G): number => m * (g - (v * v) / R);

/** Normal force at the bottom of a dip of radius R: m(g + v²/R). */
export const dipNormal = (m: number, v: number, R: number, g: number = G): number => m * (g + (v * v) / R);

/** Slowest angular velocity of a rotor (a drum of radius R, wall friction μs) whose riders stay up: √(g/(μs R)). */
export const rotorMinOmega = (mu: number, R: number, g: number = G): number => Math.sqrt(g / (mu * R));

/** Largest distance from the axis at which a body stays on a turntable turning at ω: μs g/ω². */
export const turntableMaxRadius = (mu: number, omega: number, g: number = G): number => (mu * g) / (omega * omega);
