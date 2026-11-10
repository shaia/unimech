/**
 * Angular momentum and torque of one particle about a chosen point (lesson 3.7): L = (r − r_O) × p and
 * τ = (r − r_O) × F, their z-components in the plane, the lever arm, the area the line from O to the particle
 * sweeps, and three motions that show what is conserved about which point: a free particle (a straight line), a
 * particle under a central force (a spring to a centre, or an inverse-square pull, integrated with RK4), and a
 * puck on a string pulled through a hole at a constant rate.
 *
 * MODEL SPECIFICATION
 * - System: one point particle of mass m; a fixed reference point O (any point, chosen by the caller), and for a
 *   central force a fixed centre C. Axes: x to the right, y up the page, z out of the page (⊙), so in the plane
 *   L = L_z ẑ with L_z = (x − x_O) p_y − (y − y_O) p_x, positive counter-clockwise about O.
 * - Dynamics: dL_O/dt = τ_O for a fixed O (v × m v = 0). Central force about C: F = f(|r − C|)(r − C)/|r − C|,
 *   so τ_C = 0 and L_C is constant, while τ_O = (C − O) × F. Spring: F = −k (r − C) (natural length zero).
 *   Inverse square: F = −k (r − C)/|r − C|³. Pulled string: the tension that keeps the radial speed constant is
 *   T = L²/(m r³) toward the hole (then r̈ − r θ̇² = −T/m gives r̈ = 0). Integrated with motion.ts `rk4Step`.
 * - Boundary: the particle starts at pos₀ with vel₀ at t = 0; O and C do not move.
 * - Ignored: the particle's size and spin (a point has no angular momentum about its own centre); friction on the
 *   table; the mass of the string and of the spring; the motion of whatever exerts the central force (the Sun is
 *   held fixed: the two-body problem is chapter 6).
 * - Valid when: O is fixed in an inertial frame (a moving O adds −v_O × p to dL/dt); the RK4 step is small against
 *   the orbit's shortest time scale (for the inverse-square pull, the time near the closest approach).
 * - Failure modes: the inverse-square and the pulled-string forces diverge at r → 0: an orbit with L ≈ 0 (aimed
 *   at C) falls into the centre and RK4 blows up; the pulled string stops making sense at r = 0, where T → ∞.
 *   `sweptArea` sums triangles from O, so it is the swept area only while the path does not wind back on itself
 *   around O.
 */

import { rk4Step, type Body, type Force } from './motion';
import { cross3, len, len3, scale3, sub, sub3, type Vec2, type Vec3 } from './vec';

export const ORIGIN3: Vec3 = [0, 0, 0];
export const ORIGIN2: Vec2 = [0, 0];

/** The z-component of a × b for two vectors in the plane: a_x b_y − a_y b_x. */
export const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

/** Angular momentum about the point O [kg·m²/s]: L = (r − r_O) × m v. */
export function angularMomentum(pos: Vec3, vel: Vec3, m: number, about: Vec3 = ORIGIN3): Vec3 {
  return scale3(cross3(sub3(pos, about), vel), m);
}

/** Torque of the force F acting at pos, about the point O [N·m]: τ = (r − r_O) × F. */
export function torque(pos: Vec3, F: Vec3, about: Vec3 = ORIGIN3): Vec3 {
  return cross3(sub3(pos, about), F);
}

/** L_z about O of a particle moving in the plane [kg·m²/s]: m[(x − x_O) v_y − (y − y_O) v_x]. */
export function angularMomentumZ(pos: Vec2, vel: Vec2, m: number, about: Vec2 = ORIGIN2): number {
  return m * cross2(sub(pos, about), vel);
}

/** τ_z about O of a force in the plane acting at pos [N·m]. */
export function torqueZ(pos: Vec2, F: Vec2, about: Vec2 = ORIGIN2): number {
  return cross2(sub(pos, about), F);
}

/**
 * The lever arm [m]: the perpendicular distance from O to the line through `pos` along `dir` (the line of motion
 * for L, the line of action of a force for τ). |L| = p·d and |τ| = F·d.
 */
export function leverArm(pos: Vec2, dir: Vec2, about: Vec2 = ORIGIN2): number {
  const l = len(dir);
  return l === 0 ? len(sub(pos, about)) : Math.abs(cross2(sub(pos, about), dir)) / l;
}

/** The foot of the perpendicular from O to the line through `pos` along `dir` (where the lever arm meets the line). */
export function footOfPerpendicular(pos: Vec2, dir: Vec2, about: Vec2 = ORIGIN2): Vec2 {
  const l2 = dir[0] * dir[0] + dir[1] * dir[1];
  if (l2 === 0) return pos;
  const s = ((about[0] - pos[0]) * dir[0] + (about[1] - pos[1]) * dir[1]) / l2;
  return [pos[0] + s * dir[0], pos[1] + s * dir[1]];
}

/** The areal velocity about O [m²/s]: dA/dt = ½ (r − r_O) × v = L_z/(2m), signed like L_z. */
export const arealVelocity = (Lz: number, m: number): number => Lz / (2 * m);

/** The signed area of the triangle O, a, b [m²]: positive when a → b turns counter-clockwise about O. */
export const triangleArea = (about: Vec2, a: Vec2, b: Vec2): number => 0.5 * cross2(sub(a, about), sub(b, about));

/** The signed area the line from O to the particle sweeps along a sampled path [m²] (a fan of triangles from O). */
export function sweptArea(path: readonly Vec2[], about: Vec2 = ORIGIN2): number {
  let A = 0;
  for (let i = 1; i < path.length; i++) A += triangleArea(about, path[i - 1], path[i]);
  return A;
}

/* ---------------------------------------------------------------- motions */

/** A free particle: r(t) = r₀ + v t. */
export const freePosition = (pos0: Vec2, vel: Vec2, t: number): Vec2 => [pos0[0] + vel[0] * t, pos0[1] + vel[1] * t];

/** A spring of natural length zero from the centre C: F = −k (r − C). */
export const springForce =
  (k: number, centre: Vec3 = ORIGIN3): Force =>
  (pos) =>
    scale3(sub3(pos, centre), -k);

/** An inverse-square pull toward C: F = −k (r − C)/|r − C|³ (k = G M m for gravity). */
export const inverseSquareForce =
  (k: number, centre: Vec3 = ORIGIN3): Force =>
  (pos) => {
    const d = sub3(pos, centre);
    const r = len3(d);
    return scale3(d, -k / (r * r * r));
  };

/**
 * The tension of a string pulled through a hole at C that keeps a puck's radial speed constant: T = L²/(m r³)
 * toward C, for a puck of angular momentum L about C. Its torque about C is zero, so L stays the value given.
 */
export const pulledStringForce =
  (L: number, m: number, centre: Vec3 = ORIGIN3): Force =>
  (pos) => {
    const d = sub3(pos, centre);
    const r = len3(d);
    return scale3(d, -(L * L) / (m * r ** 4));
  };

export interface Sample {
  t: number;
  pos: Vec3;
  vel: Vec3;
}

/** RK4 from t = 0 to T in n equal steps (n = ⌈T/dt⌉), every step kept: n + 1 samples. */
export function integrate(body: Body, F: Force, T: number, dt: number): Sample[] {
  const n = Math.max(1, Math.ceil(T / dt - 1e-9));
  const h = T / n;
  const out: Sample[] = [{ t: 0, pos: body.pos, vel: body.vel }];
  let b = body;
  for (let i = 0; i < n; i++) {
    b = rk4Step(b, F, i * h, h);
    out.push({ t: (i + 1) * h, pos: b.pos, vel: b.vel });
  }
  return out;
}

/** The speed of a circular orbit of radius r about the centre: spring v = r√(k/m), inverse square v = √(k/(m r)). */
export const circularSpeed = (law: 'spring' | 'inverse-square', k: number, m: number, r: number): number =>
  law === 'spring' ? r * Math.sqrt(k / m) : Math.sqrt(k / (m * r));

/** Mechanical energy per orbit: ½ m v² + U, with U = ½ k r² (spring) or −k/r (inverse square). */
export function orbitEnergy(law: 'spring' | 'inverse-square', k: number, m: number, pos: Vec3, vel: Vec3, centre: Vec3 = ORIGIN3): number {
  const r = len3(sub3(pos, centre));
  const K = 0.5 * m * (vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2);
  return K + (law === 'spring' ? 0.5 * k * r * r : -k / r);
}

/**
 * A puck on a smooth table, on a string through a hole at the origin, moving in a circle of radius r₀ at speed
 * v₀, pulled in at the constant radial speed u from t = 0. Angular momentum about the hole, L = m r₀ v₀, is
 * conserved, so the tangential speed is v_θ = v₀ r₀/r, and θ(t) = (L/(m u))(1/r − 1/r₀) since θ̇ = L/(m r²).
 */
export function pulledPuck(m: number, r0: number, v0: number, u: number) {
  const L = m * r0 * v0;
  const r = (t: number) => r0 - u * t;
  const vTheta = (rr: number) => (v0 * r0) / rr;
  const speed = (rr: number) => Math.hypot(u, vTheta(rr));
  const theta = (t: number) => (u === 0 ? (v0 / r0) * t : (L / (m * u)) * (1 / r(t) - 1 / r0));
  const position = (t: number): Vec2 => {
    const rr = r(t);
    const th = theta(t);
    return [rr * Math.cos(th), rr * Math.sin(th)];
  };
  const velocity = (t: number): Vec2 => {
    const th = theta(t);
    const vt = vTheta(r(t));
    // ṙ r̂ + r θ̇ θ̂ with ṙ = −u
    return [-u * Math.cos(th) - vt * Math.sin(th), -u * Math.sin(th) + vt * Math.cos(th)];
  };
  /** the time at which the radius is r₁ */
  const timeTo = (r1: number) => (r0 - r1) / u;
  const kinetic = (rr: number) => 0.5 * m * speed(rr) ** 2;
  return { L, r, vTheta, speed, theta, position, velocity, timeTo, kinetic };
}
