/**
 * Vector kinematics of a point body: from a position vector r(t) to v = dr/dt and a = dv/dt, and back
 * from a given acceleration to v(t) and r(t) by integration with initial conditions (lesson 1.1).
 *
 * MODEL SPECIFICATION
 * - System: one point body in the plane (x, y in metres, t in seconds). Its motion is either prescribed,
 *   r(t) with exact derivatives (`Path2`), or rebuilt from an acceleration: a function of the time alone
 *   (`AccelOfTime`, integrated in the plane) or of the velocity alone (`AccelOfVelocity`, along a line).
 * - Dynamics: none. This module describes motion; forces enter in chapter 2. The identities it relies on:
 *     v = dr/dt, a = dv/dt; |v| = |dr/dt| (the speed), which is not d|r|/dt;
 *     d|v|/dt = v·a/|v| (the part of a along v), and the part of a across v is |v × a|/|v|;
 *     v(t) = v₀ + ∫₀ᵗ a dt′, r(t) = r₀ + ∫₀ᵗ v dt′; for a = a(v) along a line, dv/a(v) = dt and
 *     v dv/a(v) = dx (the chain rule a = v dv/dx).
 * - Boundary: t ≥ 0 for integrated motions; prescribed paths are defined for every t and are drawn on
 *   [0, duration]. The origin O is the point r = 0; moving it changes r and d|r|/dt, never v or a.
 * - Ignored: the size of the body, and whatever produces the acceleration.
 * - Valid when: the body can be treated as a point. The numerical integrator (classical RK4 on
 *   ṙ = v, v̇ = a) has error O(dt⁴) for a smooth a(t) or a(v); it is exact for a polynomial a(t) of degree ≤ 2.
 * - Failure modes: d|r|/dt is undefined at r = 0 and d|v|/dt at v = 0 (a cusp of the cycloid: the
 *   functions return 0 there, the one-sided limits differ); a velocity-dependent a(v) that changes sign at
 *   v = 0 (friction) needs the caller to stop the integration at the stop, which `powerLawStop` does in
 *   closed form.
 *
 * Everything the live figure `TrajectoryVectors` shows is computed here: the preset paths (circle,
 * ellipse, cycloid) with their exact v and a, the speed and the two rates it is confused with, and the
 * rebuilt paths from a(t) (constant gravity, a rotating acceleration) with their closed forms.
 */

import { G } from './constants';
import { add, dot, len, scale, type Vec2 } from './vec';

/* ---------------------------------------------------------------- prescribed paths */

/** A prescribed motion with its exact derivatives. */
export interface Path2 {
  r: (t: number) => Vec2;
  v: (t: number) => Vec2;
  a: (t: number) => Vec2;
  /** the drawn time window [0, duration] */
  duration: number;
}

/** Uniform circular motion of radius R about `center`, angular rate ω, starting at angle φ₀. */
export function circlePath(R: number, omega: number, center: Vec2 = [0, 0], phi0 = 0, duration = (2 * Math.PI) / Math.abs(omega)): Path2 {
  return {
    r: (t) => [center[0] + R * Math.cos(omega * t + phi0), center[1] + R * Math.sin(omega * t + phi0)],
    v: (t) => [-R * omega * Math.sin(omega * t + phi0), R * omega * Math.cos(omega * t + phi0)],
    a: (t) => [-R * omega * omega * Math.cos(omega * t + phi0), -R * omega * omega * Math.sin(omega * t + phi0)],
    duration,
  };
}

/** r = (A cos ωt, B sin ωt): an ellipse about the origin; a = −ω² r. */
export function ellipsePath(A: number, B: number, omega: number, duration = (2 * Math.PI) / Math.abs(omega)): Path2 {
  return {
    r: (t) => [A * Math.cos(omega * t), B * Math.sin(omega * t)],
    v: (t) => [-A * omega * Math.sin(omega * t), B * omega * Math.cos(omega * t)],
    a: (t) => [-A * omega * omega * Math.cos(omega * t), -B * omega * omega * Math.sin(omega * t)],
    duration,
  };
}

/**
 * A point on the rim of a wheel of radius R rolling without slipping to the right along y = y₀ at angular
 * rate ω (centre speed V = Rω): r = (x₀ + R(ωt − sin ωt), y₀ + R(1 − cos ωt)). It stops for an instant
 * at every touch of the ground (t = 2πk/ω), where a = (0, Rω²) points up.
 */
export function cycloidPath(R: number, omega: number, x0 = 0, y0 = 0, duration = (4 * Math.PI) / omega): Path2 {
  return {
    r: (t) => [x0 + R * (omega * t - Math.sin(omega * t)), y0 + R * (1 - Math.cos(omega * t))],
    v: (t) => [R * omega * (1 - Math.cos(omega * t)), R * omega * Math.sin(omega * t)],
    a: (t) => [R * omega * omega * Math.sin(omega * t), R * omega * omega * Math.cos(omega * t)],
    duration,
  };
}

/** The same motion seen from an origin moved to `O`: r′ = r − O; v and a are unchanged. */
export function shiftOrigin(p: Path2, O: Vec2): Path2 {
  return { ...p, r: (t) => [p.r(t)[0] - O[0], p.r(t)[1] - O[1]] };
}

/* ---------------------------------------------------------------- speed and the rates it is confused with */

/** The speed |v| = |dr/dt|: what a speedometer shows. */
export const speed = (v: Vec2): number => len(v);

/** d|r|/dt = r·v/|r|: the rate at which the distance from the origin changes (0 at r = 0). Not the speed. */
export function distanceRate(r: Vec2, v: Vec2): number {
  const d = len(r);
  return d === 0 ? 0 : dot(r, v) / d;
}

/** d|v|/dt = v·a/|v|: the part of a along v, the only part that changes the speed (0 at v = 0). */
export function speedRate(v: Vec2, a: Vec2): number {
  const s = len(v);
  return s === 0 ? 0 : dot(v, a) / s;
}

/** |v × a|/|v|: the part of a across v, which turns v without changing its length (|a| at v = 0). */
export function turningAccel(v: Vec2, a: Vec2): number {
  const s = len(v);
  return s === 0 ? len(a) : Math.abs(v[0] * a[1] - v[1] * a[0]) / s;
}

/** The two parts of a: along v (as a vector) and across v (as a vector); they add up to a. */
export function splitAccel(v: Vec2, a: Vec2): { along: Vec2; across: Vec2 } {
  const s = len(v);
  if (s === 0) return { along: [0, 0], across: a };
  const u: Vec2 = [v[0] / s, v[1] / s];
  const along = scale(u, dot(a, u));
  return { along, across: [a[0] - along[0], a[1] - along[1]] };
}

/** The derivative of a vector function by components (central difference, error O(h²)). */
export function vectorDerivative(f: (t: number) => Vec2, t: number, h = 1e-4): Vec2 {
  const p = f(t + h);
  const m = f(t - h);
  return [(p[0] - m[0]) / (2 * h), (p[1] - m[1]) / (2 * h)];
}

/** Δr = r(t₂) − r(t₁). */
export function displacement(p: Path2, t1: number, t2: number): Vec2 {
  const a = p.r(t1);
  const b = p.r(t2);
  return [b[0] - a[0], b[1] - a[1]];
}

/** Average velocity Δr/Δt over [t₁, t₂]. */
export function averageVelocity(p: Path2, t1: number, t2: number): Vec2 {
  return scale(displacement(p, t1, t2), 1 / (t2 - t1));
}

/** The distance travelled along the path, ∫|v| dt from t₁ to t₂ (Simpson, n even). Never less than |Δr|. */
export function pathLength(p: Path2, t1: number, t2: number, n = 400): number {
  const m = n % 2 === 0 ? n : n + 1;
  const h = (t2 - t1) / m;
  let s = len(p.v(t1)) + len(p.v(t2));
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * len(p.v(t1 + i * h));
  return Math.abs((s * h) / 3);
}

/* ---------------------------------------------------------------- from a(t) back to v(t) and r(t) */

export type AccelOfTime = (t: number) => Vec2;

export interface Sample {
  t: number;
  r: Vec2;
  v: Vec2;
}

/**
 * Rebuild the motion from a(t) and the initial conditions r(0) = r₀, v(0) = v₀: n RK4 steps on
 * ṙ = v, v̇ = a(t) up to time T. Returns the n + 1 samples, the first being (0, r₀, v₀).
 */
export function integrateAccel(acc: AccelOfTime, r0: Vec2, v0: Vec2, T: number, n: number): Sample[] {
  const dt = T / n;
  const out: Sample[] = [{ t: 0, r: r0, v: v0 }];
  let r = r0;
  let v = v0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const a1 = acc(t);
    const a2 = acc(t + dt / 2);
    const a4 = acc(t + dt);
    // k-stages of RK4 for (r, v): with a independent of r and v, stages 2 and 3 share a(t + dt/2)
    const v2 = add(v, scale(a1, dt / 2));
    const v3 = add(v, scale(a2, dt / 2));
    const v4 = add(v, scale(a2, dt));
    r = add(r, scale(add(add(v, scale(v2, 2)), add(scale(v3, 2), v4)), dt / 6));
    v = add(v, scale(add(add(a1, scale(a2, 4)), a4), dt / 6));
    out.push({ t: t + dt, r, v });
  }
  return out;
}

/** Constant acceleration g downward (y up): the free fall of chapter 1.2, here only an example of a(t). */
export const gravityAccel =
  (g = G): AccelOfTime =>
  () => [0, -g];

/** Closed form under a constant acceleration a: r = r₀ + v₀t + ½at², v = v₀ + at. */
export function constantAccelState(acc: Vec2, r0: Vec2, v0: Vec2, t: number): { r: Vec2; v: Vec2 } {
  return {
    r: [r0[0] + v0[0] * t + 0.5 * acc[0] * t * t, r0[1] + v0[1] * t + 0.5 * acc[1] * t * t],
    v: [v0[0] + acc[0] * t, v0[1] + acc[1] * t],
  };
}

/** a(t) = a₀(cos ωt, sin ωt): an acceleration of constant magnitude whose direction turns at rate ω. */
export const rotatingAccel =
  (a0: number, omega: number): AccelOfTime =>
  (t) => [a0 * Math.cos(omega * t), a0 * Math.sin(omega * t)];

/**
 * Closed form under the rotating acceleration, integrated twice with v(0) = v₀ and r(0) = r₀:
 *   v = v₀ + (a₀/ω)(sin ωt, 1 − cos ωt),
 *   r = r₀ + v₀t + (a₀/ω²)(1 − cos ωt, ωt − sin ωt).
 */
export function rotatingAccelState(a0: number, omega: number, r0: Vec2, v0: Vec2, t: number): { r: Vec2; v: Vec2 } {
  const s = Math.sin(omega * t);
  const c = Math.cos(omega * t);
  const k = a0 / omega;
  const q = a0 / (omega * omega);
  return {
    v: [v0[0] + k * s, v0[1] + k * (1 - c)],
    r: [r0[0] + v0[0] * t + q * (1 - c), r0[1] + v0[1] * t + q * (omega * t - s)],
  };
}

/**
 * Under the rotating acceleration the velocity is a fixed drift plus a turning part of length a₀/ω:
 * v = u + (a₀/ω)(sin ωt, −cos ωt) with u = v₀ + (0, a₀/ω). u is the average velocity over a period, and
 * the path closes into a circle of radius a₀/ω² exactly when u = 0, that is v₀ = (0, −a₀/ω).
 */
export function rotatingDrift(a0: number, omega: number, v0: Vec2): Vec2 {
  return [v0[0], v0[1] + a0 / omega];
}

/* ---------------------------------------------------------------- along a line: a(t), a(v) */

/** a(t) = kt from (x₀, v₀): v = v₀ + kt²/2, x = x₀ + v₀t + kt³/6. */
export function linearJerkState(k: number, x0: number, v0: number, t: number): { x: number; v: number } {
  return { x: x0 + v0 * t + (k * t ** 3) / 6, v: v0 + (k * t * t) / 2 };
}

/**
 * A push that fades, a(t) = a₀e^(−t/τ), from rest at x = 0 (a sprinter's model):
 * v = a₀τ(1 − e^(−t/τ)) → a₀τ, x = a₀τ(t − τ(1 − e^(−t/τ))).
 */
export function fadingPushState(a0: number, tau: number, t: number): { x: number; v: number; a: number } {
  const e = Math.exp(-t / tau);
  return { x: a0 * tau * (t - tau * (1 - e)), v: a0 * tau * (1 - e), a: a0 * e };
}

export type AccelOfVelocity = (v: number) => number;

/** n RK4 steps on ẋ = v, v̇ = f(v) along a line, from (x₀, v₀), up to time T. */
export function integrateVelocityDependent(f: AccelOfVelocity, x0: number, v0: number, T: number, n: number): { t: number; x: number; v: number }[] {
  const dt = T / n;
  const out = [{ t: 0, x: x0, v: v0 }];
  let x = x0;
  let v = v0;
  for (let i = 0; i < n; i++) {
    const k1v = f(v);
    const k1x = v;
    const k2v = f(v + (dt / 2) * k1v);
    const k2x = v + (dt / 2) * k1v;
    const k3v = f(v + (dt / 2) * k2v);
    const k3x = v + (dt / 2) * k2v;
    const k4v = f(v + dt * k3v);
    const k4x = v + dt * k3v;
    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    out.push({ t: (i + 1) * dt, x, v });
  }
  return out;
}

/**
 * Quadratic slowing a = −kv² (v > 0), from x = 0 with speed v₀, by separation of variables:
 * v(t) = v₀/(1 + kv₀t), x(t) = ln(1 + kv₀t)/k, and v(x) = v₀e^(−kx). It never stops: x grows without bound.
 */
export function quadraticSlowing(k: number, v0: number) {
  return {
    v: (t: number) => v0 / (1 + k * v0 * t),
    x: (t: number) => Math.log(1 + k * v0 * t) / k,
    vOfX: (x: number) => v0 * Math.exp(-k * x),
    /** the distance at which the speed has fallen to a fraction f of v₀ */
    xAtFraction: (f: number) => -Math.log(f) / k,
    /** the time at which the speed has fallen to a fraction f of v₀ */
    tAtFraction: (f: number) => (1 / f - 1) / (k * v0),
  };
}

/**
 * Power-law slowing a = −kvⁿ (v > 0, k > 0), from speed v₀. Separation of variables gives
 * t_stop = v₀^(1−n)/(k(1−n)), finite only for n < 1, and x_stop = v₀^(2−n)/(k(2−n)), finite only for n < 2.
 * Infinity marks "never". n = 0 is constant deceleration (t = v₀/k, x = v₀²/2k); n = 1 is linear slowing,
 * which never stops but covers only v₀/k.
 */
export function powerLawStop(k: number, n: number, v0: number): { tStop: number; xStop: number } {
  return {
    tStop: n < 1 ? v0 ** (1 - n) / (k * (1 - n)) : Infinity,
    xStop: n < 2 ? v0 ** (2 - n) / (k * (2 - n)) : Infinity,
  };
}
