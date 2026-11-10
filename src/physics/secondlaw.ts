/**
 * Inertial frames and Newton's second law as a vector equation (lesson 2.1, figure InertialCart).
 *
 * MODEL SPECIFICATION
 * - System: point bodies of mass m [kg] acted on by forces [N] given as plane vectors. For the frames part,
 *   a car (a rigid box) moves along x with initial velocity V0 ≥ 0 [m/s] and constant acceleration A [m/s²]
 *   (A < 0 brakes it to a stop, after which it stays at rest), and a puck slides on its frictionless floor.
 *   The puck starts at rest relative to the car; either nothing acts on it horizontally ("free"), or a taut
 *   string ties it to the wall toward which the car accelerates ("tied"), so that it moves with the car.
 * - Dynamics: Newton's second law in an inertial frame (the ground), ΣF = m a, component by component. The
 *   net force is the vector sum of the forces. A frame that accelerates at A describes every acceleration as
 *   a' = a − A (galilean.ts, accelerationInFrame), so there ΣF ≠ m a' whenever A ≠ 0: that is what makes the
 *   car frame non-inertial. No fictitious force is ever added (chapter 7).
 * - Boundary: the car's walls stop a free puck: wallContactTime gives the moment it reaches a wall a distance
 *   d away. A towed or hanging body is assumed to have settled at a fixed angle relative to its vehicle.
 * - Ignored: friction and air drag, the size of the puck, the string's mass and stretch, the rotation of the
 *   Earth for the ground frame (its frame acceleration ω²R is 0.35% of g; see rotatingFrameAcceleration).
 * - Valid when: speeds are far below the speed of light; the ground can be treated as inertial (experiments
 *   short against a day, or a precision coarser than a few tenths of a percent of g).
 * - Failure modes: a car that brakes from rest (V0 = 0, A < 0) does not move; a free puck in a car that never
 *   accelerates never reaches a wall (wallContactTime returns Infinity). A string that would have to push
 *   is slack: twoStringHang reports slack when the back string's tension comes out negative.
 */

import { G, R_EARTH } from './constants';
import { add, len, scale, sub, type Vec2 } from './vec';

/* ------------------------------------------------------------------ forces as vectors */

/** A force of magnitude F [N] at angle θ [rad] counter-clockwise from +x. */
export const forceFromPolar = (F: number, theta: number): Vec2 => [F * Math.cos(theta), F * Math.sin(theta)];

/** The net force: the vector sum of all the forces on one body. */
export const netForce = (forces: readonly Vec2[]): Vec2 => forces.reduce<Vec2>((s, f) => add(s, f), [0, 0]);

/** The sum of the magnitudes, which equals |ΣF| only when all the forces point the same way. */
export const sumOfMagnitudes = (forces: readonly Vec2[]): number => forces.reduce((s, f) => s + len(f), 0);

/** Newton's second law solved for the acceleration: a = ΣF / m. */
export const accelerationFromForces = (forces: readonly Vec2[], m: number): Vec2 => scale(netForce(forces), 1 / m);

/** The one unknown force that, with the known ones, gives the body of mass m the acceleration a: m a − Σ known. */
export const requiredForce = (m: number, a: Vec2, known: readonly Vec2[]): Vec2 => sub(scale(a, m), netForce(known));

/** The points of a head-to-tail chain: start, start + F1, start + F1 + F2, … The last point is start + ΣF. */
export function headToTail(forces: readonly Vec2[], start: Vec2 = [0, 0]): Vec2[] {
  const pts: Vec2[] = [start];
  for (const f of forces) pts.push(add(pts[pts.length - 1], f));
  return pts;
}

/** The motion under a constant net force: r(t) = r0 + v0 t + ½ (ΣF/m) t², v(t) = v0 + (ΣF/m) t. */
export function constantForceMotion(r0: Vec2, v0: Vec2, F: Vec2, m: number, t: number): { r: Vec2; v: Vec2 } {
  const a = scale(F, 1 / m);
  return { r: add(add(r0, scale(v0, t)), scale(a, 0.5 * t * t)), v: add(v0, scale(a, t)) };
}

/* ------------------------------------------------------------------ the car and the puck */

/** The car's velocity: V0 + A t, but a braking car (A < 0) stops at zero and stays there. */
export function carVelocity(V0: number, A: number, t: number): number {
  const v = V0 + A * t;
  return A < 0 ? Math.max(0, v) : v;
}

/** The time a braking car comes to rest (Infinity when it does not brake to a stop). */
export const carStopTime = (V0: number, A: number): number => (A < 0 ? V0 / -A : Infinity);

/** The car's displacement from its position at t = 0. */
export function carPosition(V0: number, A: number, t: number): number {
  const ts = Math.min(t, carStopTime(V0, A));
  return V0 * ts + 0.5 * A * ts * ts;
}

/** The car's acceleration at time t: A while it moves, 0 once a braking car has stopped. */
export const carAcceleration = (V0: number, A: number, t: number): number => (t < carStopTime(V0, A) ? A : 0);

export interface PuckState {
  /** the puck in the ground frame: displacement from its start, velocity, acceleration (along x) */
  x: number;
  v: number;
  a: number;
  /** the puck in the car frame: displacement from its starting place in the car, velocity, acceleration */
  xr: number;
  vr: number;
  ar: number;
  /** the net horizontal force on the puck [N] (the string's pull when tied, 0 when free) */
  F: number;
}

/**
 * The puck at time t. Free: nothing acts on it horizontally, so in the ground frame it keeps the car's
 * initial velocity V0; in the car frame it is displaced by x' = V0 t − X(t). Tied: it moves with the car, and
 * the string pulls it with F = m a_car. In both cases the car frame sees a' = a − a_car.
 */
export function puckState(V0: number, A: number, m: number, tied: boolean, t: number): PuckState {
  const X = carPosition(V0, A, t);
  const Vc = carVelocity(V0, A, t);
  const Ac = carAcceleration(V0, A, t);
  if (tied) return { x: X, v: Vc, a: Ac, xr: 0, vr: 0, ar: 0, F: m * Ac };
  const x = V0 * t;
  return { x, v: V0, a: 0, xr: x - X, vr: V0 - Vc, ar: Ac === 0 ? 0 : -Ac, F: 0 };
}

/**
 * When a free puck, at rest in the car at t = 0, reaches a wall a distance d from it. Accelerating (A > 0):
 * x' = −½ A t², so t = √(2d/A), toward the back. Braking (A < 0): x' = ½|A|t² until the car stops at
 * ts = V0/|A|, when x' = V0²/(2|A|); after that the puck slides on at V0. Infinity if it never gets there.
 */
export function wallContactTime(V0: number, A: number, d: number): number {
  if (A > 0) return Math.sqrt((2 * d) / A);
  if (A === 0 || V0 <= 0) return Infinity;
  const ts = carStopTime(V0, A);
  const atStop = (V0 * V0) / (2 * -A);
  if (d <= atStop) return Math.sqrt((2 * d) / -A);
  return ts + (d - atStop) / V0;
}

/* ------------------------------------------------------------------ how inertial is a frame */

/** The acceleration of a point at distance R from the axis of a frame that turns at ω: ω²R. */
export const rotatingFrameAcceleration = (omega: number, R: number): number => omega * omega * R;

/** Free-fall acceleration at height h above the Earth's surface: g (R_E / (R_E + h))². */
export const gravityAtAltitude = (h: number, g = G, R = R_EARTH): number => g * (R / (R + h)) ** 2;

/* ------------------------------------------------------------------ bodies carried by an accelerating vehicle */

/**
 * A small body hanging on a string from a vehicle that accelerates with magnitude a along a straight road
 * sloping DOWN at angle α (α = 0: level), once it has settled at a fixed angle relative to the vehicle.
 * Ground frame, x forward along the road, y perpendicular to it: the string supplies T = m(a − g), so
 * the string makes the angle θ with the vehicle's perpendicular to the road, tan θ = (a − g sin α)/(g cos α),
 * leaning back (θ > 0) when a > g sin α; and T/m = √(a² + g² − 2 a g sin α).
 */
export function hangingInVehicle(a: number, alpha = 0, g = G): { theta: number; tensionPerMass: number } {
  return {
    theta: Math.atan2(a - g * Math.sin(alpha), g * Math.cos(alpha)),
    tensionPerMass: Math.sqrt(a * a + g * g - 2 * a * g * Math.sin(alpha)),
  };
}

/**
 * A lamp of mass m hangs from the ceiling of a car on two strings, one toward the front and one toward the
 * back, each at angle α from the vertical, and moves with the car, which accelerates forward at A on a level
 * road. Ground frame: (T_f − T_b) sin α = m A and (T_f + T_b) cos α = m g. The back string goes slack
 * when A ≥ g tan α (then the two-string answer is not valid: slack = true).
 */
export function twoStringHang(m: number, alpha: number, A: number, g = G): { front: number; back: number; slack: boolean } {
  const sum = (m * g) / Math.cos(alpha);
  const diff = (m * A) / Math.sin(alpha);
  const front = (sum + diff) / 2;
  const back = (sum - diff) / 2;
  return { front, back, slack: back < 0 };
}

/* ------------------------------------------------------------------ inclines */

/**
 * A block of mass m on a frictionless incline at θ, pushed by a HORIZONTAL force F toward the incline. Axes
 * along the incline (up the slope) and perpendicular to it: a = (F cos θ − m g sin θ)/m up the slope, and the
 * normal force N = m g cos θ + F sin θ (positive while the block stays on the surface).
 */
export function inclineHorizontalPush(m: number, F: number, theta: number, g = G): { a: number; N: number } {
  return { a: (F * Math.cos(theta) - m * g * Math.sin(theta)) / m, N: m * g * Math.cos(theta) + F * Math.sin(theta) };
}

/* ------------------------------------------------------------------ a frame that falls on purpose */

/**
 * A plane flying a parabola with constant downward acceleration a_p: a body at rest in the cabin has, relative
 * to the cabin, the downward acceleration g − a_p (galilean.ts: a' = a − A). To make it g_eff the plane needs
 * a_p = g − g_eff. With the same largest change of altitude H = v_y²/(2 a_p), the time on the parabola,
 * 2 v_y / a_p = 2√(2H/a_p), scales as 1/√a_p: T = T0 √(g / (g − g_eff)) from the weightless T0 (a_p = g).
 */
export const reducedGravityFlightTime = (T0: number, gEff: number, g = G): number => T0 * Math.sqrt(g / (g - gEff));
