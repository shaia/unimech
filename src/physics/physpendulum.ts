/**
 * The physical pendulum and the centre of percussion of lesson 8.7, on top of the shared rigid body
 * (src/physics/rigidbody.ts): a flat body (a uniform rod, or a uniform disc) hangs on a horizontal axle through a hole
 * a distance d from its centre of mass and swings in its own plane; or it hangs at rest and is struck.
 *
 * MODEL SPECIFICATION
 * - System: one rigid body (גוף צפיד) of mass m and moment of inertia I_cm = m k² about the axis through its centre
 *   of mass (CM) perpendicular to its plane; k is the radius of gyration. A frictionless horizontal axle through the
 *   pivot P, a distance d > 0 from the CM, perpendicular to the plane. Axes: x right, y up, z out of the page (⊙);
 *   θ is the angle of the line P → CM from the downward vertical, counter-clockwise positive. The body's points are
 *   located by b, the distance from P along the line P → CM (b = d at the CM, b = ℓ at the centre of oscillation).
 * - Dynamics: about the fixed axis through P, I_P θ̈ = −m g d sin θ with I_P = I_cm + m d² (parallel axes); the axle's
 *   force has no torque about P. Dividing by m d: θ̈ = −(g/ℓ) sin θ with the equivalent length ℓ = I_P/(m d)
 *   = d + k²/d, the equation of a simple pendulum of length ℓ at EVERY amplitude. Small angles: T = 2π√(ℓ/g);
 *   any amplitude θ₀ released at rest: T = 2π√(ℓ/g)/AGM(1, cos(θ₀/2)) (smallosc.ts `pendulumPeriod`); the motion
 *   θ(t) is integrated with RK4 (oscillator.ts `integrate`). T(d) is shortest at d = k (T_min = 2π√(2k/g)), and the
 *   holes at d and k²/d (on opposite sides of the CM) have the same period (Huygens: P and the centre of
 *   oscillation O can be swapped).
 *   A blow: a short horizontal impulse J (along +x) at distance b from P on the hanging body at rest. During it the
 *   body does not move, gravity's impulse is negligible, and the axle exerts an impulse P_x. Angular impulse about P:
 *   J b = I_P ω; linear impulse: J + P_x = m v_cm = m ω d. So P_x = J (m d b/I_P − 1): zero at b = ℓ (the centre of
 *   percussion = the centre of oscillation), against the blow (P_x < 0) for b < ℓ, along it for b > ℓ.
 *   Without the axle (a free body struck at s = b − d below its CM): v_cm = J/m, ω = J s/I_cm, and the point of the
 *   line at rest just after the blow sits k²/s above the CM; for s = k²/d it is P itself.
 * - Boundary: release at rest at θ₀ (the swing); body at rest hanging straight down when struck (the blow).
 * - Ignored: friction at the axle, air, the size of the holes, the axle's own motion (fixed in an inertial frame),
 *   gravity's impulse during the blow, the deformation of the body (a real bat vibrates).
 * - Valid when: the small-angle period needs θ₀ ≪ 1 rad (θ₀ = 10° → 0.2 % long, 60° → 7 % long); the blow must be
 *   short against the period, and perpendicular to the line P → CM.
 * - Failure modes: d → 0 gives ℓ → ∞ and T → ∞ (neutral equilibrium at d = 0: no period at all); θ₀ → π gives
 *   T → ∞ (the AGM → 0); `swingTable` steps a fixed number of RK4 steps per period and loses accuracy if asked for
 *   fewer than ~100 steps per period.
 */

import { G } from './constants';
import { integrate } from './oscillator';
import { disc, parallelAxis, rodCentre } from './rigidbody';
import { pendulumPeriod } from './smallosc';

/** The flat bodies of the figure: a uniform rod of length `size`, or a uniform disc of radius `size`. */
export type BodyKind = 'rod' | 'disc';
export interface Body {
  kind: BodyKind;
  /** mass [kg] */
  m: number;
  /** the rod's length or the disc's radius [m] */
  size: number;
}

/** I_cm about the axis through the CM perpendicular to the body's plane. */
export const bodyIcm = (b: Body) => (b.kind === 'rod' ? rodCentre(b.m, b.size) : disc(b.m, b.size));
/** Radius of gyration about the CM: k = √(I_cm/m). */
export const gyrationRadius = (b: Body) => Math.sqrt(bodyIcm(b) / b.m);
/** The farthest a pivot hole can be from the CM: half the rod, or the disc's rim. */
export const maxPivot = (b: Body) => (b.kind === 'rod' ? b.size / 2 : b.size);
/** I_P about the pivot at distance d from the CM (parallel axes). */
export const pivotInertia = (b: Body, d: number) => parallelAxis(bodyIcm(b), b.m, d);

/** Equivalent length ℓ = I_P/(m d) = d + k²/d. */
export const ellOf = (k: number, d: number) => d + (k * k) / d;
/** Small-angle period of a body of radius of gyration k hung at distance d from its CM: 2π√((k² + d²)/(g d)). */
export const smallPeriod = (k: number, d: number, g = G) => 2 * Math.PI * Math.sqrt(ellOf(k, d) / g);
/** The period at amplitude θ₀ (release at rest): the simple pendulum of length ℓ, exactly. */
export const periodAt = (k: number, d: number, theta0: number, g = G) => pendulumPeriod(ellOf(k, d), theta0, g);
/** The other pivot distance with the same period: d′ = k²/d, on the other side of the CM (d d′ = k², d + d′ = ℓ). */
export const conjugatePivot = (k: number, d: number) => (k * k) / d;
/** Shortest small-angle period, at d = k: 2π√(2k/g). */
export const minPeriod = (k: number, g = G) => smallPeriod(k, k, g);

/** Kater's reversible pendulum: two pivots on opposite sides of the CM with the same period T, a distance D apart: g = 4π²D/T². */
export const katerG = (D: number, T: number) => (4 * Math.PI * Math.PI * D) / (T * T);

/**
 * θ(t) over one period of a release at rest from θ₀, sampled at n + 1 equal steps of time by RK4 (sub-steps per
 * sample). The motion is periodic, so θ at any t is the table at t mod T.
 */
export function swingTable(ell: number, theta0: number, n = 480, sub = 4, g = G): { T: number; theta: number[]; omega: number[] } {
  const T = pendulumPeriod(ell, theta0, g);
  const dt = T / n;
  const accel = (x: number) => -(g / ell) * Math.sin(x);
  const theta = [theta0];
  const omega = [0];
  let s = { x: theta0, v: 0 };
  for (let i = 1; i <= n; i++) {
    s = integrate(accel, s, dt, dt / sub);
    theta.push(s.x);
    omega.push(s.v);
  }
  return { T, theta, omega };
}

/** θ at time t from a swing table (linear interpolation, periodic). */
export function thetaAt(tab: { T: number; theta: number[] }, t: number): number {
  const n = tab.theta.length - 1;
  const u = ((((t % tab.T) + tab.T) % tab.T) / tab.T) * n;
  const i = Math.min(n - 1, Math.floor(u));
  const f = u - i;
  return tab.theta[i] * (1 - f) + tab.theta[i + 1] * f;
}

/** A blow J along +x at distance b below the pivot of a hanging body at rest: what it does at once. */
export interface BlowResult {
  /** angular velocity just after (counter-clockwise positive, so a blow to the right below P gives ω > 0) [rad/s] */
  omega: number;
  /** the CM's velocity just after, along x [m/s] */
  vcm: number;
  /** the impulse of the axle ON the body along x [N·s]: P_x = J(m d b/I_P − 1) */
  P: number;
}

/** The body on its axle (pivot at distance d from the CM), struck at b from the pivot. */
export function blowPivoted(body: Body, d: number, b: number, J: number): BlowResult {
  const Ip = pivotInertia(body, d);
  // angular impulse about P: r = (0, −b), J = (J, 0): (r × J)_z = b J
  const omega = (J * b) / Ip;
  // the CM is a distance d below P: v = ω × r = ω d along +x
  const vcm = omega * d;
  return { omega, vcm, P: body.m * vcm - J };
}

/** The same body without the axle, struck at b from where the pivot was (s = b − d below the CM). */
export function blowFree(body: Body, d: number, b: number, J: number): BlowResult & { restFromPivot: number | null } {
  const s = b - d;
  const omega = (J * s) / bodyIcm(body);
  const vcm = J / body.m;
  // v_x(y) = vcm − ω (y − y_cm) along the line, y measured up from P (y_cm = −d): zero at y = −d + vcm/ω
  const restFromPivot = omega === 0 ? null : d - vcm / omega;
  return { omega, vcm, P: 0, restFromPivot };
}

/** The x-velocity, just after the blow, of the point of the line P → CM a distance y below P. */
export const lineVelocity = (r: BlowResult, d: number, y: number) => r.vcm + r.omega * (y - d);
