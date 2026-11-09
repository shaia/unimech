/**
 * MODEL SPECIFICATION: a point moving along a curved path in the plane (lesson 1.3).
 *
 * System:    one point whose position is a known function r(t) = (x(t), y(t)) [m], t [s]. Kinematics only:
 *            nothing here says what makes the point move (the dynamics of circular motion is lesson 2.6).
 * Dynamics:  none. Each path family writes its velocity v = dr/dt and acceleration a = dv/dt out by hand
 *            (exact derivatives). Finite differences exist to show that Δv/Δt converges to a as Δt → 0.
 *            The acceleration is split along the intrinsic (tangent–normal) frame of the path:
 *              T̂ = v/|v|,  a_t = a·T̂ = d|v|/dt,  a⊥ = |v × a|/|v| = |v|²/ρ,  ρ = |v|³/|v × a|,
 *            where ρ is the radius of curvature and N̂ (toward the centre of curvature) is the unit normal
 *            on the side the path bends to. Circular motion is the case ρ = R:
 *              θ(t) = θ₀ + ω₀t + ½αt²,  |v| = |ω|R,  a_t = αR (signed along v when ω > 0),  a⊥ = ω²R.
 * Boundary:  paths are defined for every real t; `duration` is only the stretch a figure plays.
 * Ignored:   air resistance (the projectile), the size and rotation of the body, the force behind the motion.
 * Valid when: the path is smooth (twice differentiable) and the speed is not zero, so that T̂ exists.
 * Failure modes: at |v| = 0 (a start from rest, a cusp of a cycloid, a stop on a slowing circle) there is
 *            no tangent. The point is about to move along a, so `tangentNormal` returns all of a as
 *            tangential (a_t = |a|, a⊥ = 0) and ρ = 0 (a cusp: the direction turns through a finite angle
 *            over a vanishing arc). On a straight stretch v × a = 0 and ρ = ∞ (Infinity), with no centre.
 *            Finite differences with Δt below ~1e-7 s lose their digits to rounding.
 *
 * Sign convention: angles counter-clockwise from +x; ω > 0 is counter-clockwise. a_t > 0 when the speed
 * grows, a_t < 0 when it falls. `turn` = sign(v × a): +1 when the path bends to the left of v.
 */

import { G } from './constants';
import { add, dot, len, scale, sub, type Vec2 } from './vec';

export interface CurvePath {
  /** position [m] */
  r(t: number): Vec2;
  /** velocity [m/s], the exact derivative of r */
  v(t: number): Vec2;
  /** acceleration [m/s²], the exact derivative of v */
  a(t: number): Vec2;
  /** seconds a figure plays */
  duration: number;
}

/** z-component of the cross product of two plane vectors, v_x a_y − v_y a_x. */
export const cross2 = (u: Vec2, w: Vec2): number => u[0] * w[1] - u[1] * w[0];

/**
 * Circular motion of radius R about centre c, angle θ(t) = θ₀ + ω₀t + ½αt² (counter-clockwise positive).
 * α = 0 is uniform circular motion.
 */
export function circlePath(R: number, omega0: number, alpha = 0, theta0 = 0, c: Vec2 = [0, 0], duration = 10): CurvePath {
  const th = (t: number) => theta0 + omega0 * t + 0.5 * alpha * t * t;
  const w = (t: number) => omega0 + alpha * t;
  return {
    r: (t) => [c[0] + R * Math.cos(th(t)), c[1] + R * Math.sin(th(t))],
    // v = R θ̇ θ̂, with θ̂ = (−sin θ, cos θ)
    v: (t) => [-R * w(t) * Math.sin(th(t)), R * w(t) * Math.cos(th(t))],
    // a = R θ̈ θ̂ − R θ̇² r̂
    a: (t) => {
      const p = th(t);
      const wt = w(t);
      return [-R * alpha * Math.sin(p) - R * wt * wt * Math.cos(p), R * alpha * Math.cos(p) - R * wt * wt * Math.sin(p)];
    },
    duration,
  };
}

/** Projectile under constant gravity g (default the course's G), thrown from p0 with velocity v0. */
export function projectilePath(p0: Vec2, v0: Vec2, g: number = G, duration = (2 * v0[1]) / g): CurvePath {
  return {
    r: (t) => [p0[0] + v0[0] * t, p0[1] + v0[1] * t - 0.5 * g * t * t],
    v: (t) => [v0[0], v0[1] - g * t],
    a: () => [0, -g],
    duration,
  };
}

/** The parabola r = (bt, ct²): constant acceleration (0, 2c) across a constant velocity component b. */
export function parabolaPath(b: number, c: number, duration = 4): CurvePath {
  return {
    r: (t) => [b * t, c * t * t],
    v: (t) => [b, 2 * c * t],
    a: () => [0, 2 * c],
    duration,
  };
}

/**
 * The ellipse r = (A cos ωt, B sin ωt) about c: a constant rate of the parameter, so the speed varies and
 * a = −ω²(r − c) always points at the centre of the ellipse.
 */
export function ellipsePath(A: number, B: number, omega: number, c: Vec2 = [0, 0], duration = (2 * Math.PI) / omega): CurvePath {
  return {
    r: (t) => [c[0] + A * Math.cos(omega * t), c[1] + B * Math.sin(omega * t)],
    v: (t) => [-A * omega * Math.sin(omega * t), B * omega * Math.cos(omega * t)],
    a: (t) => [-A * omega * omega * Math.cos(omega * t), -B * omega * omega * Math.sin(omega * t)],
    duration,
  };
}

/**
 * A point on the rim of a wheel of radius R rolling without slipping along +x at angular rate ω, starting at
 * the contact point: the cycloid r = R(ωt − sin ωt, 1 − cos ωt).
 */
export function cycloidPath(R: number, omega: number, duration = (2 * Math.PI) / omega): CurvePath {
  return {
    r: (t) => [R * (omega * t - Math.sin(omega * t)), R * (1 - Math.cos(omega * t))],
    v: (t) => [R * omega * (1 - Math.cos(omega * t)), R * omega * Math.sin(omega * t)],
    a: (t) => [R * omega * omega * Math.sin(omega * t), R * omega * omega * Math.cos(omega * t)],
    duration,
  };
}

export interface IntrinsicSplit {
  /** |v| [m/s] */
  speed: number;
  /** unit tangent v/|v| (the direction of a at |v| = 0) */
  T: Vec2;
  /** unit normal toward the centre of curvature ([0, 0] on a straight stretch) */
  N: Vec2;
  /** signed tangential component a·T̂ = d|v|/dt: + speeding up, − slowing down [m/s²] */
  aT: number;
  /** size of the normal component |v × a|/|v| = |v|²/ρ, never negative [m/s²] */
  aN: number;
  /** the tangential part as a vector */
  tangential: Vec2;
  /** the normal part as a vector, toward the centre of curvature */
  normal: Vec2;
  /** radius of curvature |v|³/|v × a| [m]; Infinity on a straight stretch, 0 at a stop */
  rho: number;
  /** +1 if the path bends to the left of v, −1 to the right, 0 straight */
  turn: number;
}

/** Split a along the path: the part along v changes the speed, the part across v turns the velocity. */
export function tangentNormal(v: Vec2, a: Vec2): IntrinsicSplit {
  const s = len(v);
  const k = cross2(v, a);
  if (s === 0) {
    // at rest the point is about to move along a: all of a is tangential (MODEL SPECIFICATION)
    const la = len(a);
    const T: Vec2 = la === 0 ? [0, 0] : [a[0] / la, a[1] / la];
    return { speed: 0, T, N: [0, 0], aT: la, aN: 0, tangential: a, normal: [0, 0], rho: 0, turn: 0 };
  }
  const T: Vec2 = [v[0] / s, v[1] / s];
  const turn = Math.sign(k);
  const N: Vec2 = turn === 0 ? [0, 0] : [-T[1] * turn, T[0] * turn];
  const aT = dot(a, T);
  const aN = Math.abs(k) / s;
  return {
    speed: s,
    T,
    N,
    aT,
    aN,
    tangential: scale(T, aT),
    normal: scale(N, aN),
    rho: k === 0 ? Infinity : (s * s * s) / Math.abs(k),
    turn,
  };
}

/** Radius of curvature of a path at time t, |v|³/|v × a|. */
export const curvatureRadius = (path: CurvePath, t: number): number => tangentNormal(path.v(t), path.a(t)).rho;

/** Centre of the osculating circle at time t, r + ρN̂; null on a straight stretch or at a stop. */
export function curvatureCentre(path: CurvePath, t: number): Vec2 | null {
  const sp = tangentNormal(path.v(t), path.a(t));
  if (!Number.isFinite(sp.rho) || sp.rho === 0) return null;
  return add(path.r(t), scale(sp.N, sp.rho));
}

/* ---------------------------------------------------------------- circular motion in numbers */

/** Angular velocity [rad/s] of something turning at n revolutions per minute. */
export const omegaFromRpm = (rpm: number): number => (2 * Math.PI * rpm) / 60;

/** Angular velocity [rad/s] from the frequency f [revolutions per second]: ω = 2πf. */
export const omegaFromFrequency = (f: number): number => 2 * Math.PI * f;

/** Period [s] of uniform circular motion at angular velocity ω: T = 2π/|ω|. */
export const periodOf = (omega: number): number => (2 * Math.PI) / Math.abs(omega);

/** Centripetal acceleration ω²R [m/s²]. */
export const centripetalFromOmega = (omega: number, R: number): number => omega * omega * R;

/** Centripetal acceleration v²/R [m/s²]. */
export const centripetalFromSpeed = (v: number, R: number): number => (v * v) / R;

/**
 * |Δv| between two instants Δθ apart on a uniform circle of speed v: the chord between two arrows of length v
 * at angle Δθ, 2v·sin(Δθ/2). Divided by Δt = Δθ/ω it tends to vω = v²/R.
 */
export const chordDeltaV = (v: number, dTheta: number): number => 2 * v * Math.sin(dTheta / 2);

/* ---------------------------------------------------------------- finite differences */

/** Δv over [t, t+Δt], the vector subtraction v(t+Δt) − v(t). */
export const deltaV = (path: CurvePath, t: number, dt: number): Vec2 => sub(path.v(t + dt), path.v(t));

/** Average acceleration over [t, t+Δt]: Δv/Δt (error of order Δt). */
export const averageAcceleration = (path: CurvePath, t: number, dt: number): Vec2 => scale(deltaV(path, t, dt), 1 / dt);

/** Central difference of a vector function of time (error of order h²). */
export const centralDifference = (f: (t: number) => Vec2, t: number, h: number): Vec2 =>
  scale(sub(f(t + h), f(t - h)), 1 / (2 * h));

/** Angle between two vectors [rad], 0 when either is zero. */
export function angleBetween(u: Vec2, w: Vec2): number {
  const lu = len(u);
  const lw = len(w);
  if (lu === 0 || lw === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot(u, w) / (lu * lw))));
}
