/**
 * Momentum, impulse and the conservation of momentum (lesson 3.5): force pulses and the impulse they carry
 * (rectangular, triangular, half-sine), the peak force a given impulse needs in a given time, the recoil of
 * two carts pushed apart by a spring, the recoil of a thrower or a gun barrel, and the systems in which only
 * one component of the momentum is conserved: a block on a smooth wedge (or a curved track) that is free to
 * slide on a smooth floor.
 *
 * MODEL SPECIFICATION
 * - System: point bodies of constant mass, or rigid blocks that only translate. The pulse: one body under a
 *   force F(t) that acts from t = 0 to t = Δt along one axis. The recoil: two carts on a straight smooth track
 *   and an ideal massless spring between them, compressed by x₀ and released at t = 0. The wedge: a block of
 *   mass m on the smooth face of a wedge of mass M (angle θ, face descending to the right, as in
 *   constraints.ts) that stands on a smooth horizontal floor; both start at rest, the block at height h above
 *   the floor.
 * - Dynamics: dp/dt = F; for a system dP/dt = F_ext, component by component. Impulse J = ∫F dt = Δp.
 *   Pulse shapes with peak F_max: rect F_max; triangle rising linearly to F_max at Δt/2 and back to zero;
 *   half-sine F_max sin(πt/Δt). J = k·F_max·Δt with k = 1, 1/2, 2/π. The spring: the compression s obeys
 *   μ s̈ = −k s (μ = m₁m₂/(m₁+m₂)) until s = 0 at t_p = (π/2)√(μ/k); afterwards the carts coast. The wedge:
 *   constant accelerations from constraints.ts `freeWedge` (Newton's laws with the constraint); the end
 *   state from horizontal momentum + energy + the constraint, which the tests compare with it.
 * - Boundary: the pulse starts at t = 0; the carts start with a common velocity v₀; the wedge problem ends
 *   when the block reaches the floor (the bottom of the face), before it slides onto the floor.
 * - Ignored: friction everywhere (track, floor, face), the spring's mass, rotation of every body, the
 *   impact of the block on the floor at the bottom of the face, the change of the gun's mass while the shell
 *   is in the barrel (the shell leaves with a stated speed relative to the barrel), air.
 * - Valid when: the masses are constant and every surface is smooth. The pulse shapes are idealisations of a
 *   measured contact force; only the area (the impulse) and the duration carry over to a real contact.
 * - Failure modes: Δt → 0 at fixed J makes the peak force diverge (an ideal impulsive force; chapter 4); M → ∞
 *   in `freeWedge` is 0·∞ (use a large finite M or `fixedWedge`); θ → 90° makes the face vertical, and the block
 *   falls freely beside the wedge (V → 0); a shell fired with a speed relative to the ground instead of the
 *   barrel needs `throwRecoil(…, relative = false)`.
 */

import { G } from './constants';
import { riemann } from './calculus';
import { freeWedge, fixedWedge } from './constraints';

/* ------------------------------------------------------------------ force pulses and impulse */

export type PulseShape = 'rect' | 'triangle' | 'halfsine';

/** A force pulse along one axis: its shape, its peak force [N] and its duration [s]. It starts at t = 0. */
export interface Pulse {
  shape: PulseShape;
  peak: number;
  duration: number;
}

/** The average force over the pulse as a fraction of the peak: J = k·F_max·Δt. */
export const SHAPE_FACTOR: Record<PulseShape, number> = { rect: 1, triangle: 0.5, halfsine: 2 / Math.PI };

/** The force of the pulse at time t [N]; zero before t = 0 and after t = Δt. */
export function pulseForce(p: Pulse, t: number): number {
  const T = p.duration;
  if (t < 0 || t > T) return 0;
  const u = t / T;
  if (p.shape === 'rect') return p.peak;
  if (p.shape === 'triangle') return u <= 0.5 ? 2 * p.peak * u : 2 * p.peak * (1 - u);
  return p.peak * Math.sin(Math.PI * u);
}

/** The impulse of the whole pulse, J = k·F_max·Δt [N·s] (closed form). */
export const pulseImpulse = (p: Pulse): number => SHAPE_FACTOR[p.shape] * p.peak * p.duration;

/** The impulse delivered from 0 to t, ∫₀ᵗ F dt′ [N·s] (closed form; the area shaded up to t). */
export function cumulativeImpulse(p: Pulse, t: number): number {
  const T = p.duration;
  const F = p.peak;
  if (t <= 0) return 0;
  if (t >= T) return pulseImpulse(p);
  if (p.shape === 'rect') return F * t;
  if (p.shape === 'halfsine') return ((F * T) / Math.PI) * (1 - Math.cos((Math.PI * t) / T));
  // triangle: F t²/T up to T/2 (area F T/4 there), then the falling side
  if (t <= T / 2) return (F * t * t) / T;
  const s = t - T / 2;
  return (F * T) / 4 + 2 * F * (s - (t * t - (T * T) / 4) / (2 * T));
}

/** The impulse by the midpoint rule with n pieces (calculus.ts `riemann`): the quadrature the tests converge. */
export const impulseQuadrature = (p: Pulse, n: number): number => riemann((t) => pulseForce(p, t), 0, p.duration, n, 'mid');

/** The peak force a pulse of a given shape needs to deliver the impulse J in the time Δt [N]. */
export const peakForce = (shape: PulseShape, J: number, duration: number): number => J / (SHAPE_FACTOR[shape] * duration);

/** The average force that delivers the impulse J in the time Δt [N], whatever the shape. */
export const averageForce = (J: number, duration: number): number => J / duration;

/** The pulse of a given shape and duration that delivers the impulse J. */
export const pulseFor = (shape: PulseShape, J: number, duration: number): Pulse => ({ shape, peak: peakForce(shape, J, duration), duration });

/** A body of mass m that has velocity v₀ at t = 0, under the pulse: its velocity at t, v₀ + (1/m)∫₀ᵗF dt′ [m/s]. */
export const pulseVelocity = (p: Pulse, m: number, v0: number, t: number): number => v0 + cumulativeImpulse(p, t) / m;

/** Its displacement from t = 0 to t [m]: v₀ t + (1/m)∫₀ᵗ J(t′) dt′ (midpoint pieces inside the pulse, exact after). */
export function pulseDisplacement(p: Pulse, m: number, v0: number, t: number, n = 200): number {
  if (t <= 0) return 0;
  const inside = Math.min(t, p.duration);
  const area = riemann((s) => cumulativeImpulse(p, s), 0, inside, n, 'mid');
  const after = t > p.duration ? pulseImpulse(p) * (t - p.duration) : 0;
  return v0 * t + (area + after) / m;
}

/** The impulse that changes a body's velocity from v₁ to v₂ (signed, along one axis) [N·s]. */
export const impulseFromVelocities = (m: number, v1: number, v2: number): number => m * (v2 - v1);

/* ------------------------------------------------------------------ two carts and a spring */

/** Two carts on a smooth track, cart 1 on the left, a spring of constant k compressed by x₀ between them. */
export interface SpringRecoil {
  m1: number;
  m2: number;
  /** spring constant [N/m] and initial compression [m] */
  k: number;
  x0: number;
  /** common initial velocity of both carts [m/s] (positive to the right) */
  v0?: number;
}

/** The energy stored in the spring, ½ k x₀² [J]. */
export const springEnergy = (r: SpringRecoil): number => 0.5 * r.k * r.x0 * r.x0;

/** The reduced mass μ = m₁m₂/(m₁ + m₂) [kg]. */
const reducedMass = (r: SpringRecoil): number => (r.m1 * r.m2) / (r.m1 + r.m2);

/** How long the spring pushes: a quarter period of the relative motion, (π/2)√(μ/k) [s]. */
export const pushTime = (r: SpringRecoil): number => (Math.PI / 2) * Math.sqrt(reducedMass(r) / r.k);

/**
 * The carts' velocities after the push. In the frame of the centre of mass the momenta are equal and opposite
 * and share the spring energy E: v₁ = v₀ − √(2E m₂ / (m₁ M)), v₂ = v₀ + √(2E m₁ / (m₂ M)), M = m₁ + m₂.
 */
export function recoilFinal(r: SpringRecoil): { v1: number; v2: number } {
  const E = springEnergy(r);
  const M = r.m1 + r.m2;
  const v0 = r.v0 ?? 0;
  return { v1: v0 - Math.sqrt((2 * E * r.m2) / (r.m1 * M)), v2: v0 + Math.sqrt((2 * E * r.m1) / (r.m2 * M)) };
}

export interface RecoilState {
  /** displacements of the carts from their starting places [m] */
  d1: number;
  d2: number;
  v1: number;
  v2: number;
  /** the spring's compression [m] and the force it exerts on each cart (on cart 2 to the right, on cart 1 to the left) [N] */
  s: number;
  force: number;
}

/** The two carts at time t after the release: s = x₀ cos ωt while the spring pushes, then coasting. */
export function recoilState(r: SpringRecoil, t: number): RecoilState {
  const M = r.m1 + r.m2;
  const v0 = r.v0 ?? 0;
  const w = Math.sqrt(r.k / reducedMass(r));
  const tp = pushTime(r);
  const tc = Math.min(Math.max(t, 0), tp);
  const s = r.x0 * Math.cos(w * tc);
  // the separation rate; at t_p it is x₀ω, all the spring energy in the relative motion
  const rate = r.x0 * w * Math.sin(w * tc);
  const opened = r.x0 - s;
  const coast = Math.max(0, t - tp);
  const v1 = v0 - (r.m2 / M) * rate;
  const v2 = v0 + (r.m1 / M) * rate;
  return {
    d1: v0 * Math.max(t, 0) - (r.m2 / M) * opened + (v1 - v0) * coast,
    d2: v0 * Math.max(t, 0) + (r.m1 / M) * opened + (v2 - v0) * coast,
    v1,
    v2,
    s: t >= tp ? 0 : s,
    force: t >= tp ? 0 : r.k * s,
  };
}

/**
 * A thrower of mass M (with the cart they stand on), at rest on a smooth floor, throws a body of mass m with
 * speed u. relative = true: u relative to the thrower after the throw, V = −m u/(M + m); relative = false: u
 * relative to the ground, V = −m u/M. Returns the thrower's velocity V (the body's is positive) [m/s].
 */
export const throwRecoil = (M: number, m: number, u: number, relative = true): number => (relative ? (-m * u) / (M + m) : (-m * u) / M);

/**
 * A gun of mass M on smooth horizontal rails fires a shell of mass m with speed u relative to the barrel, at
 * elevation α. Only the horizontal momentum is conserved (the rails push up while the shell is fired):
 * M V = m (u cos α − V) gives the recoil speed V = m u cos α/(M + m). Returns V and the shell's ground
 * velocity (vx forward, vy up) and its elevation φ above the horizontal [rad].
 */
export function barrelRecoil(M: number, m: number, u: number, alphaDeg: number): { V: number; vx: number; vy: number; phi: number } {
  const a = (alphaDeg * Math.PI) / 180;
  const V = (m * u * Math.cos(a)) / (M + m);
  const vx = u * Math.cos(a) - V;
  const vy = u * Math.sin(a);
  return { V, vx, vy, phi: Math.atan2(vy, vx) };
}

/* ------------------------------------------------------------------ the free wedge and the free track */

export interface WedgeEnd {
  /** the wedge's speed (it moves to the left) [m/s] */
  V: number;
  /** the block's ground velocity: vx to the right, vy downward (both positive) [m/s] */
  vx: number;
  vy: number;
  /** the block's speed relative to the wedge, along the face [m/s] */
  u: number;
}

/**
 * The block reaches the floor after sliding down from height h, from rest. Horizontal momentum (zero):
 * m vx = M V. The constraint: relative to the wedge the block moves along the face, vx = u cos θ − V,
 * vy = u sin θ. Energy: m g h = ½ M V² + ½ m (vx² + vy²). Solved:
 *   V = √(2 g h m² cos²θ / ((M + m)(M + m sin²θ))),  u = (M + m) V/(m cos θ).
 */
export function wedgeEnd(m: number, M: number, thetaDeg: number, h: number, g = G): WedgeEnd {
  const th = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const V = Math.sqrt((2 * g * h * m * m * c * c) / ((M + m) * (M + m * s * s)));
  const u = ((M + m) * V) / (m * c);
  return { V, vx: u * c - V, vy: u * s, u };
}

export interface WedgeState {
  /** time [s] and whether the block has reached the floor */
  t: number;
  landed: boolean;
  /** the wedge's displacement and velocity along x (negative: to the left) */
  X: number;
  Vx: number;
  /** the block's displacement from its start (x right, y up) and its velocity */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** the system's momentum components (x right, y up) [kg·m/s] */
  px: number;
  py: number;
  /** the floor's normal force on the wedge [N] (NaN when the wedge is fixed: the floor's push is then unknown) */
  Nfloor: number;
  /** the normal force between block and wedge [N] */
  N: number;
}

/** The time for the block to reach the floor from height h [s]. fixed = the wedge is held (M → ∞). */
export function wedgeSlideTime(m: number, M: number, thetaDeg: number, h: number, fixed = false, g = G): number {
  const w = fixed ? fixedWedge(m, thetaDeg, g) : freeWedge(m, M, thetaDeg, g);
  return Math.sqrt((2 * h) / -w.ay);
}

/**
 * Block and wedge at time t after the release, from constraints.ts's constant accelerations (Newton's laws
 * with the constraint), clamped at the instant the block reaches the floor. fixed = the wedge held in place.
 */
export function wedgeState(m: number, M: number, thetaDeg: number, h: number, t: number, fixed = false, g = G): WedgeState {
  const w = fixed ? fixedWedge(m, thetaDeg, g) : freeWedge(m, M, thetaDeg, g);
  const tEnd = Math.sqrt((2 * h) / -w.ay);
  const tc = Math.min(Math.max(t, 0), tEnd);
  const Vx = w.A * tc;
  const vx = w.ax * tc;
  const vy = w.ay * tc;
  return {
    t: tc,
    landed: t >= tEnd,
    X: 0.5 * w.A * tc * tc,
    Vx,
    x: 0.5 * w.ax * tc * tc,
    y: 0.5 * w.ay * tc * tc,
    vx,
    vy,
    px: m * vx + (fixed ? 0 : M * Vx),
    py: m * vy,
    Nfloor: w.Nfloor,
    N: w.N,
  };
}

/**
 * A block of mass m slides from rest down a smooth quarter-circle track of radius R cut into a block of mass M
 * that stands on a smooth floor. At the bottom the block's velocity is horizontal, so horizontal momentum and
 * energy alone give v = √(2 g R M/(M + m)) for the block and V = m v/M for the track (opposite directions).
 */
export function trackEnd(m: number, M: number, R: number, g = G): { v: number; V: number } {
  const v = Math.sqrt((2 * g * R * M) / (M + m));
  return { v, V: (m * v) / M };
}

/** A jet of fluid (density ρ, cross-section A, speed v) that hits a wall head-on and stops along the normal
 * (splashes sideways): the force on the wall is ρ A v²; a jet that bounced straight back would give 2ρ A v². */
export const jetForce = (rho: number, A: number, v: number, bounce = false): number => (bounce ? 2 : 1) * rho * A * v * v;
