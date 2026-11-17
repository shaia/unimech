/**
 * Force in special relativity (lesson 10.5): the second law F = dp/dt with the relativistic momentum p = γmv, the
 * motion under a constant force from rest (hyperbolic motion), the work–energy theorem W = ΔE, and the different
 * response to a force along and across the velocity. A numerical integrator of dp/dt = F cross-checks the closed
 * forms and handles forces that depend on time, position or velocity.
 *
 * MODEL SPECIFICATION
 * - System: one point body of mass m (the same in every frame: the course has no "relativistic mass") moving along
 *   the x axis of an inertial frame S, pushed by a force F along x measured in S. `longitudinalAccel` and
 *   `transverseAccel` also give the response to a force along and across the velocity at one instant.
 * - Dynamics: F = dp/dt with p = γmv, γ = 1/√(1 − v²/c²); equivalently v = pc²/E with E = √((pc)² + (mc²)²).
 *   From rest at x = 0, t = 0, under a constant F (u = Ft/(mc), the length L = mc²/F):
 *     p = Ft,  γβ = u,  v = c·u/√(1 + u²),  γ = √(1 + u²),  x = L(√(1 + u²) − 1),
 *     τ = (mc/F)·arsinh u (proper time),  rapidity φ = arsinh u = Fτ/(mc),
 *     worldline (x + L)² − (ct)² = L² (a hyperbola in the Minkowski diagram).
 *   Work–energy: dE/dt = Fv, so W = ∫F dx = ΔE = Δ(γmc²); from rest W = (γ − 1)mc² = Fx.
 *   Along the velocity F = γ³ma; across it (|v| unchanged at that instant) F = γma.
 *   Newton's predictions, for contrast: v = Ft/m, x = ½(F/m)t², which cross c at t = mc/F.
 * - Boundary: from rest at the origin for the closed forms; any x₀, p₀ for the integrator.
 * - Ignored: radiation by an accelerated charge (radiation reaction), the source of the force (a field that is
 *   uniform in S), gravity; the force is the force measured in S.
 * - Valid when: the body has m > 0 and F is given in S. Every speed stays below c by construction (v = pc²/E).
 * - Failure modes: `speedForMomentum` etc. throw for m ≤ 0; `timeToSpeed` and `workBetween` throw (through
 *   `gammaOf`) for a speed at or above c. The integrator's error per unit time falls as dt⁴ for a smooth force; a
 *   force that switches abruptly needs the caller to stop at the switch.
 *
 * Every function takes the speed of light `c` as its last argument, default C_LIGHT = 3.0e8 m/s, so the same code
 * serves SI and units with c = 1.
 */

import { C_LIGHT } from './constants';
import { gammaOf } from './relativity';

const checkMass = (m: number) => {
  if (!(m > 0)) throw new RangeError(`m = ${m}: a body with momentum p and mass m > 0 is required`);
};

// ---------------------------------------------------------------- momentum, energy and speed

/** The relativistic energy E = √((pc)² + (mc²)²) of a body of mass m and momentum p [J]. */
export function energyOfMomentum(p: number, m: number, c = C_LIGHT): number {
  checkMass(m);
  return Math.hypot(p * c, m * c * c);
}

/** The velocity v = pc²/E of a body of momentum p: always below c in size. */
export function speedForMomentum(p: number, m: number, c = C_LIGHT): number {
  return (p * c * c) / energyOfMomentum(p, m, c);
}

/** γ = E/(mc²) = √(1 + (p/(mc))²) of a body of momentum p. */
export function gammaForMomentum(p: number, m: number, c = C_LIGHT): number {
  checkMass(m);
  return Math.hypot(1, p / (m * c));
}

/** pc from the kinetic energy K = (γ − 1)mc²: √(K² + 2K·mc²) (any energy unit, mc² in the same unit). */
export const pcFromKinetic = (K: number, mc2: number): number => Math.sqrt(K * K + 2 * K * mc2);

// ---------------------------------------------------------------- hyperbolic motion: constant F from rest

/** The time Newton's law would need to bring the body from rest to c under F: mc/F. */
export const newtonTimeToC = (F: number, m: number, c = C_LIGHT): number => (m * c) / F;

/** The length scale of hyperbolic motion, L = mc²/F: the distance from the body's start to the hyperbola's centre. */
export const hyperbolicLength = (F: number, m: number, c = C_LIGHT): number => (m * c * c) / F;

/** The dimensionless time u = Ft/(mc) = p/(mc) = γβ. */
export const reducedTime = (F: number, m: number, t: number, c = C_LIGHT): number => (F * t) / (m * c);

export interface HyperbolicState {
  /** time in S [s] */
  t: number;
  /** position [m] */
  x: number;
  /** momentum Ft [kg·m/s] */
  p: number;
  /** velocity [m/s], below c */
  v: number;
  gamma: number;
  /** relativistic energy γmc² [J] */
  E: number;
  /** kinetic energy (γ − 1)mc² = work done = Fx [J] */
  K: number;
  /** proper time on the body's clock [s] */
  tau: number;
  /** acceleration dv/dt = F/(γ³m) [m/s²] */
  a: number;
}

/** The state at time t of a body that starts from rest at x = 0 under a constant force F along +x. */
export function hyperbolicMotion(F: number, m: number, t: number, c = C_LIGHT): HyperbolicState {
  checkMass(m);
  const u = reducedTime(F, m, t, c);
  const g = Math.hypot(1, u);
  const L = hyperbolicLength(F, m, c);
  // x = L(√(1 + u²) − 1) = L·u²/(√(1 + u²) + 1): the second form keeps its digits when u is small
  const x = (L * u * u) / (g + 1);
  return {
    t,
    x,
    p: F * t,
    v: (c * u) / g,
    gamma: g,
    E: g * m * c * c,
    K: ((u * u) / (g + 1)) * m * c * c,
    tau: (m * c * Math.asinh(u)) / F,
    a: F / (g * g * g * m),
  };
}

/** Speed at time t from rest under constant F: c·u/√(1 + u²). */
export const hyperbolicSpeed = (F: number, m: number, t: number, c = C_LIGHT): number => hyperbolicMotion(F, m, t, c).v;

/** Position at time t from rest at x = 0 under constant F: (mc²/F)(√(1 + u²) − 1). */
export const hyperbolicPosition = (F: number, m: number, t: number, c = C_LIGHT): number => hyperbolicMotion(F, m, t, c).x;

/** The time (in S) a constant force F needs to bring the body from rest to speed v: p/F = γmv/F. */
export const timeToSpeed = (F: number, m: number, v: number, c = C_LIGHT): number => (gammaOf(v / c) * m * v) / F;

/** Newton's prediction for the same force: v = Ft/m (passes c at t = mc/F). */
export const newtonSpeed = (F: number, m: number, t: number): number => (F * t) / m;

/** Newton's prediction for the same force: x = ½(F/m)t². */
export const newtonPosition = (F: number, m: number, t: number): number => (0.5 * F * t * t) / m;

/**
 * The hyperbola of the worldline: (x + L)² − (ct)² − L², divided by L² (zero on the worldline). x and t in SI.
 */
export function hyperbolaResidual(F: number, m: number, x: number, t: number, c = C_LIGHT): number {
  const L = hyperbolicLength(F, m, c);
  return ((x + L) ** 2 - (c * t) ** 2 - L * L) / (L * L);
}

// ---------------------------------------------------------------- work, energy and the response to a force

/** The work a force must do to take a body from speed v1 to v2 (same line): (γ₂ − γ₁)mc² [J]. */
export const workBetween = (m: number, v1: number, v2: number, c = C_LIGHT): number =>
  (gammaOf(v2 / c) - gammaOf(v1 / c)) * m * c * c;

/** Newton's work for the same change of speed, ½m(v₂² − v₁²), for contrast. */
export const newtonWorkBetween = (m: number, v1: number, v2: number): number => 0.5 * m * (v2 * v2 - v1 * v1);

/** dv/dt under a force F along the velocity v: F/(γ³m). */
export const longitudinalAccel = (F: number, m: number, v: number, c = C_LIGHT): number => F / (gammaOf(v / c) ** 3 * m);

/** The acceleration across the velocity under a force F across it: F/(γm) (the speed does not change at that instant). */
export const transverseAccel = (F: number, m: number, v: number, c = C_LIGHT): number => F / (gammaOf(v / c) * m);

// ---------------------------------------------------------------- numerical integration of dp/dt = F

/** A force along x [N], a function of the time, the position and the velocity. */
export type LineForce = (t: number, x: number, v: number) => number;

export interface RelSample {
  t: number;
  x: number;
  p: number;
  /** the work done so far, ∫F v dt [J] */
  W: number;
}

/**
 * One classical RK4 step of dx/dt = pc²/E(p), dp/dt = F(t, x, v), dW/dt = F·v. (src/physics/motion.ts's `rk4Step`
 * integrates Newton's a = F/m, where dx/dt is the state's velocity itself; here dx/dt is a function of p.)
 */
export function relRk4Step(s: RelSample, F: LineForce, m: number, dt: number, c = C_LIGHT): RelSample {
  const der = (t: number, x: number, p: number): [number, number, number] => {
    const v = speedForMomentum(p, m, c);
    const f = F(t, x, v);
    return [v, f, f * v];
  };
  const k1 = der(s.t, s.x, s.p);
  const k2 = der(s.t + dt / 2, s.x + (dt / 2) * k1[0], s.p + (dt / 2) * k1[1]);
  const k3 = der(s.t + dt / 2, s.x + (dt / 2) * k2[0], s.p + (dt / 2) * k2[1]);
  const k4 = der(s.t + dt, s.x + dt * k3[0], s.p + dt * k3[1]);
  const step = (i: 0 | 1 | 2) => (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return { t: s.t + dt, x: s.x + step(0), p: s.p + step(1), W: s.W + step(2) };
}

/** Integrate from (x₀, p₀) at t = 0 to t = T in n equal RK4 steps; returns the n + 1 samples. */
export function integrateRelativistic(
  F: LineForce,
  m: number,
  x0: number,
  p0: number,
  T: number,
  n: number,
  c = C_LIGHT,
): RelSample[] {
  checkMass(m);
  const out: RelSample[] = [{ t: 0, x: x0, p: p0, W: 0 }];
  const dt = T / n;
  let s = out[0];
  for (let i = 0; i < n; i++) {
    s = relRk4Step(s, F, m, dt, c);
    out.push(s);
  }
  return out;
}
