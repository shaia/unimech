/**
 * Angular momentum and kinetic energy of a system of two particles (lesson 3.8): the total angular momentum
 * about a fixed point, its split into the part of the centre of mass and the part of the motion about it
 * (König), the torques of external and internal forces, and the motion of a two-particle system in a uniform
 * field, held together by a rigid light rod (analytic) or by a spring (RK4).
 *
 * MODEL SPECIFICATION
 * - System: two point particles of masses m₁, m₂ moving in the plane of the page (x to the right, y up, z out of
 *   the page, so a positive z component is counter-clockwise, ⊙). Every angular momentum and torque here is
 *   the z component, taken about a NAMED point: a fixed point O given by the caller, or the centre of mass.
 * - Dynamics: Newton's second law for each particle. External force: a uniform field, m_i g along −y (g = 0
 *   for none). Internal forces, on 1 by 2 (on 2 by 1 always the opposite, the weak third law):
 *   a spring along the line of the particles, −k(|r₁₂| − d₀) r̂₁₂ with r₁₂ = r₁ − r₂ (central); and an optional
 *   HYPOTHETICAL pair `shear`·ẑ × r̂₁₂, equal and opposite but perpendicular to the line of the particles
 *   (non-central). No real interaction between two particles has such a pair; it is a thought experiment
 *   that shows why the strong form of the third law is needed: its torque about every point is
 *   shear·|r₁₂|, and it spins the system up with no external torque.
 *   Spring: integrated with classical RK4 on the 8-dimensional state (motion.ts's `rk4Step` moves one body
 *   under a given force; here the two bodies are coupled, so the step is written for the pair).
 *   Rigid rod: the CM moves as a projectile, R(t) = R₀ + V₀t − ½gt²ŷ, and the rod turns about the CM with
 *   ω(t) = ω₀ + αt, α = shear·d/I, I = μd², μ = m₁m₂/(m₁ + m₂) (the rod's tension is central and does not
 *   enter the torque about the CM; a uniform field has no torque about the CM).
 * - Boundary: the caller gives the initial state; the flight ends when the caller stops it.
 * - Ignored: the mass and the size of the rod or spring, air, the Earth's rotation, any variation of the field
 *   over the size of the system (a non-uniform field has a torque about the CM: tides, chapter 6).
 * - Valid when: the particles are small against their distance; for the spring, dt ≪ 2π/√(k/μ) and
 *   dt ≪ 1/ω (RK4's error per unit time falls as dt⁴).
 * - Failure modes: the spring's state may pass through |r₁₂| = 0 (a head-on collapse) where r̂₁₂ is undefined;
 *   the functions return a zero direction there. A stiff spring with a large dt blows up. The identities
 *   (König, the torque of a pair) are exact for any state, so they test the bookkeeping, not the integrator.
 */

import { add, len, scale, sub, type Vec2 } from './vec';

/** z component of a × b for vectors in the plane. */
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

/** ẑ × a: a turned by +90°. */
export const zCross = (a: Vec2): Vec2 => [-a[1], a[0]];

export interface State {
  r1: Vec2;
  v1: Vec2;
  r2: Vec2;
  v2: Vec2;
}

export interface System {
  /** masses [kg] */
  m1: number;
  m2: number;
  /** uniform field strength along −y [m/s²]; 0 for none */
  g: number;
  /** spring between the particles: constant [N/m] and natural length [m]; k = 0 or absent for none */
  k?: number;
  d0?: number;
  /** HYPOTHETICAL non-central internal pair [N]: on 1 by 2, shear·ẑ × r̂₁₂; on 2 by 1, the opposite */
  shear?: number;
}

export const totalMass = (s: { m1: number; m2: number }) => s.m1 + s.m2;

/** μ = m₁m₂/(m₁ + m₂) [kg]. */
export const reducedMass = (m1: number, m2: number) => (m1 * m2) / (m1 + m2);

/** Moment of inertia of a rigid dumbbell about its centre of mass, I = μd² [kg·m²]. */
export const dumbbellInertia = (m1: number, m2: number, d: number) => reducedMass(m1, m2) * d * d;

/** The centre of mass: position R, velocity V, total mass M. */
export function centerOfMass(sys: System, s: State): { R: Vec2; V: Vec2; M: number } {
  const M = totalMass(sys);
  const R = scale(add(scale(s.r1, sys.m1), scale(s.r2, sys.m2)), 1 / M);
  const V = scale(add(scale(s.v1, sys.m1), scale(s.v2, sys.m2)), 1 / M);
  return { R, V, M };
}

/** Total momentum P = m₁v₁ + m₂v₂ [kg·m/s]. */
export const momentum = (sys: System, s: State): Vec2 => add(scale(s.v1, sys.m1), scale(s.v2, sys.m2));

/** Total angular momentum about the fixed point O, L_O = Σ (rᵢ − O) × mᵢvᵢ [kg·m²/s]. */
export const angularMomentum = (sys: System, s: State, O: Vec2): number =>
  cross(sub(s.r1, O), scale(s.v1, sys.m1)) + cross(sub(s.r2, O), scale(s.v2, sys.m2));

/** The part of the centre of mass about O: (R − O) × MV [kg·m²/s]. */
export function orbitalAngularMomentum(sys: System, s: State, O: Vec2): number {
  const { R, V, M } = centerOfMass(sys, s);
  return cross(sub(R, O), scale(V, M));
}

/** The angular momentum about the centre of mass, from positions and velocities relative to it [kg·m²/s]. */
export function spinAngularMomentum(sys: System, s: State): number {
  const { R, V } = centerOfMass(sys, s);
  return cross(sub(s.r1, R), scale(sub(s.v1, V), sys.m1)) + cross(sub(s.r2, R), scale(sub(s.v2, V), sys.m2));
}

/** Total kinetic energy [J]. */
export const kineticEnergy = (sys: System, s: State) =>
  0.5 * sys.m1 * (s.v1[0] ** 2 + s.v1[1] ** 2) + 0.5 * sys.m2 * (s.v2[0] ** 2 + s.v2[1] ** 2);

/** ½MV², the kinetic energy of the centre of mass [J]. */
export function cmKineticEnergy(sys: System, s: State): number {
  const { V, M } = centerOfMass(sys, s);
  return 0.5 * M * (V[0] ** 2 + V[1] ** 2);
}

/** The kinetic energy of the motion relative to the centre of mass [J]. */
export function relativeKineticEnergy(sys: System, s: State): number {
  const { V } = centerOfMass(sys, s);
  const u1 = sub(s.v1, V);
  const u2 = sub(s.v2, V);
  return 0.5 * sys.m1 * (u1[0] ** 2 + u1[1] ** 2) + 0.5 * sys.m2 * (u2[0] ** 2 + u2[1] ** 2);
}

/** Unit vector from particle 2 to particle 1, and their distance. */
function lineOf(s: State): { u: Vec2; d: number } {
  const r = sub(s.r1, s.r2);
  const d = len(r);
  return { u: d === 0 ? [0, 0] : scale(r, 1 / d), d };
}

/** The central part of the internal force on 1 by 2 (the spring) [N]. */
export function centralForce(sys: System, s: State): Vec2 {
  const k = sys.k ?? 0;
  if (k === 0) return [0, 0];
  const { u, d } = lineOf(s);
  return scale(u, -k * (d - (sys.d0 ?? 0)));
}

/** The hypothetical non-central part of the internal force on 1 by 2 [N]. */
export function shearForce(sys: System, s: State): Vec2 {
  const sh = sys.shear ?? 0;
  if (sh === 0) return [0, 0];
  return scale(zCross(lineOf(s).u), sh);
}

/** The whole internal force on particle 1 by particle 2 [N]; on 2 by 1 it is the opposite. */
export const internalForce = (sys: System, s: State): Vec2 => add(centralForce(sys, s), shearForce(sys, s));

/** Torque of the internal pair about any point, (r₁ − r₂) × F₁₂ (the point drops out) [N·m]. */
export const internalTorque = (sys: System, s: State): number => cross(sub(s.r1, s.r2), internalForce(sys, s));

/** Torque of the internal pair about the point O, computed term by term: (r₁ − O) × F₁₂ + (r₂ − O) × F₂₁ [N·m]. */
export function internalTorqueAbout(sys: System, s: State, O: Vec2): number {
  const F = internalForce(sys, s);
  return cross(sub(s.r1, O), F) + cross(sub(s.r2, O), scale(F, -1));
}

/** Torque of the uniform field about the fixed point O, Σ (rᵢ − O) × mᵢg(−ŷ) [N·m]. */
export const externalTorque = (sys: System, s: State, O: Vec2): number =>
  cross(sub(s.r1, O), [0, -sys.m1 * sys.g]) + cross(sub(s.r2, O), [0, -sys.m2 * sys.g]);

/** Torque of the uniform field about the centre of mass (zero for every state) [N·m]. */
export function externalTorqueAboutCM(sys: System, s: State): number {
  return externalTorque(sys, s, centerOfMass(sys, s).R);
}

/** Spring energy ½k(|r₁₂| − d₀)² [J]. */
export function springEnergy(sys: System, s: State): number {
  const k = sys.k ?? 0;
  return k === 0 ? 0 : 0.5 * k * (lineOf(s).d - (sys.d0 ?? 0)) ** 2;
}

/** Gravitational energy M g Y, zero at y = 0 [J]. */
export const fieldEnergy = (sys: System, s: State) => sys.g * (sys.m1 * s.r1[1] + sys.m2 * s.r2[1]);

/** Accelerations of the two particles [m/s²]. */
export function accelerations(sys: System, s: State): [Vec2, Vec2] {
  const F = internalForce(sys, s);
  return [
    [F[0] / sys.m1, F[1] / sys.m1 - sys.g],
    [-F[0] / sys.m2, -F[1] / sys.m2 - sys.g],
  ];
}

const axpy = (s: State, d: State, h: number): State => ({
  r1: add(s.r1, scale(d.r1, h)),
  v1: add(s.v1, scale(d.v1, h)),
  r2: add(s.r2, scale(d.r2, h)),
  v2: add(s.v2, scale(d.v2, h)),
});

function rate(sys: System, s: State): State {
  const [a1, a2] = accelerations(sys, s);
  return { r1: s.v1, v1: a1, r2: s.v2, v2: a2 };
}

/** One classical RK4 step of the pair. */
export function rk4(sys: System, s: State, dt: number): State {
  const k1 = rate(sys, s);
  const k2 = rate(sys, axpy(s, k1, dt / 2));
  const k3 = rate(sys, axpy(s, k2, dt / 2));
  const k4 = rate(sys, axpy(s, k3, dt));
  const comb = (f: (x: State) => Vec2): Vec2 => scale(add(add(f(k1), scale(f(k2), 2)), add(scale(f(k3), 2), f(k4))), dt / 6);
  return {
    r1: add(s.r1, comb((x) => x.r1)),
    v1: add(s.v1, comb((x) => x.v1)),
    r2: add(s.r2, comb((x) => x.r2)),
    v2: add(s.v2, comb((x) => x.v2)),
  };
}

/** The states at n + 1 equal steps from 0 to tEnd, each sample reached by `sub` RK4 steps. */
export function integrate(sys: System, s0: State, tEnd: number, n: number, sub = 8): State[] {
  const out: State[] = [s0];
  const dt = tEnd / n / sub;
  let s = s0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < sub; j++) s = rk4(sys, s, dt);
    out.push(s);
  }
  return out;
}

/** A dumbbell at a given instant: CM at R moving with V, the line from 2 to 1 at angle θ, turning at ω. */
export function dumbbellState(m1: number, m2: number, d: number, R: Vec2, V: Vec2, theta: number, omega: number): State {
  const M = m1 + m2;
  const u: Vec2 = [Math.cos(theta), Math.sin(theta)];
  const a1 = scale(u, (m2 / M) * d);
  const a2 = scale(u, (-m1 / M) * d);
  return {
    r1: add(R, a1),
    v1: add(V, scale(zCross(a1), omega)),
    r2: add(R, a2),
    v2: add(V, scale(zCross(a2), omega)),
  };
}

export interface Rigid {
  m1: number;
  m2: number;
  /** rod length [m] */
  d: number;
  g: number;
  /** HYPOTHETICAL non-central pair [N] (see System) */
  shear?: number;
}

export interface Launch {
  /** CM position and velocity at t = 0 */
  R0: Vec2;
  V0: Vec2;
  /** angle of the line from 2 to 1 [rad], and the angular velocity [rad/s], at t = 0 */
  theta0: number;
  omega0: number;
}

/** Angular acceleration of the rigid dumbbell about its CM, α = shear·d/(μd²) [rad/s²]. */
export const rigidAngularAcceleration = (db: Rigid) => ((db.shear ?? 0) * db.d) / dumbbellInertia(db.m1, db.m2, db.d);

/** The rigid dumbbell at time t (analytic): CM on a parabola, ω(t) = ω₀ + αt. */
export function rigidState(db: Rigid, l: Launch, t: number): State {
  const alpha = rigidAngularAcceleration(db);
  const R: Vec2 = [l.R0[0] + l.V0[0] * t, l.R0[1] + l.V0[1] * t - 0.5 * db.g * t * t];
  const V: Vec2 = [l.V0[0], l.V0[1] - db.g * t];
  return dumbbellState(db.m1, db.m2, db.d, R, V, l.theta0 + l.omega0 * t + 0.5 * alpha * t * t, l.omega0 + alpha * t);
}

/** Time for the CM to come back to its launch height, 2V₀ᵧ/g [s]. */
export const flightTime = (V0: Vec2, g: number) => (2 * V0[1]) / g;
