/**
 * The centre of mass (lesson 3.4): of point masses, of a continuous body as an integral over thin strips (computed
 * numerically with the Riemann sums of calculus.ts, beside the closed forms), and its motion: a shell that bursts in
 * flight, whose centre of mass keeps to the unexploded parabola while every fragment flies, and a person walking on a
 * plank that floats on frictionless water, whose centre of mass with the plank stays put.
 *
 * MODEL SPECIFICATION
 * - System: N point masses mᵢ at rᵢ; or one thin body (a rod along x with linear density λ(x) that is uniform or
 *   grows linearly from end to end; an isosceles triangular plate, a half-disc and a half-ring of uniform density);
 *   or a shell of mass M that splits into two fragments; or a person of mass m on a plank of mass M.
 * - Dynamics: R_cm = Σmᵢrᵢ / M, and for a body R_cm = (1/M)∫r dm. Summing Newton's second law over the particles,
 *   the internal forces cancel in third-law pairs, so M·a_cm = F_ext. The shell is a projectile (constant g, y up,
 *   launched from the origin on level ground); the burst is internal and instantaneous: the fragments' velocities
 *   change by Δv₁ = (m₂/M)·u·n̂ and Δv₂ = −(m₁/M)·u·n̂, so the momentum M·v_cm is unchanged, u is the speed at which
 *   they separate and n̂ the direction in which fragment 1 leaves fragment 2. A fragment that reaches y = 0 stops
 *   there (the ground stops it and then holds it up). The plank: no horizontal external force at all.
 * - Boundary: the shell's fragments are followed until both have landed; the plank's person stays on the plank.
 * - Ignored: air, the size and spin of the fragments, any bounce or slide on landing, the water's drag on the plank.
 * - Valid when: the burst lasts much less than the flight; the fragments are dense enough for air to be negligible;
 *   the plank moves slowly (water drag grows with speed).
 * - Failure modes: once a fragment has landed the ground pushes on the system (an impulse at the landing, then the
 *   normal force), so the centre of mass leaves the parabola: that is the physics, not an error. A burst at y ≤ 0 or
 *   after the shell has landed is rejected. The numerical integral of the half-disc converges only as N^(−3/2), not
 *   N^(−2): its strip width 2√(R² − y²) has an infinite slope at the top edge.
 */

import { riemann, type Fn, type RiemannRule } from './calculus';
import { G } from './constants';

export type Vec2 = [number, number];

/* ------------------------------------------------------------------ point masses */

export interface PointMass {
  /** mass [kg] */
  m: number;
  /** position [m] */
  r: Vec2;
}

export const totalMass = (ps: readonly PointMass[]): number => ps.reduce((s, p) => s + p.m, 0);

/** R_cm = Σ mᵢ rᵢ / Σ mᵢ [m]. */
export function centerOfMass(ps: readonly PointMass[]): Vec2 {
  const M = totalMass(ps);
  if (!(M > 0)) throw new Error('centerOfMass: the total mass must be positive');
  let x = 0;
  let y = 0;
  for (const p of ps) {
    x += p.m * p.r[0];
    y += p.m * p.r[1];
  }
  return [x / M, y / M];
}

/** The plain average of the positions, every particle counted once whatever its mass: the wrong "centre". */
export function unweightedMean(ps: readonly PointMass[]): Vec2 {
  const n = ps.length;
  return [ps.reduce((s, p) => s + p.r[0], 0) / n, ps.reduce((s, p) => s + p.r[1], 0) / n];
}

/* ------------------------------------------------------------------ continuous bodies */

/** A rod from x = 0 to x = L with λ(x) = λA + (λB − λA)·x/L [kg/m]. λA = λB is uniform; λA = 0 is λ ∝ x. */
export interface Rod {
  kind: 'rod';
  L: number;
  lamA: number;
  lamB: number;
}
/** An isosceles triangular plate: base `base` on the x axis, centred on the origin, apex at (0, h); density σ [kg/m²]. */
export interface Triangle {
  kind: 'triangle';
  base: number;
  h: number;
  sigma: number;
}
/** A half-disc of radius R: flat edge on the x axis, centre at the origin, y ≥ 0; density σ [kg/m²]. */
export interface HalfDisc {
  kind: 'half-disc';
  R: number;
  sigma: number;
}
/** A thin wire bent into a half-circle of radius R about the origin, y ≥ 0; linear density λ [kg/m]. */
export interface HalfRing {
  kind: 'half-ring';
  R: number;
  lam: number;
}
export type Shape = Rod | Triangle | HalfDisc | HalfRing;

/**
 * How a body is cut into strips: the variable s runs over [a, b]; a strip of width ds has mass (dm/ds)·ds and its own
 * centre of mass at `coord(s)` along the body's symmetry axis. The rod is cut across x, the plates into horizontal
 * strips at height y, the wire into arcs at angle θ from the x axis.
 */
export interface Strips {
  a: number;
  b: number;
  /** mass per unit of the strip variable: λ(x), σ·w(y) or λR [kg per unit of s] */
  dmds: Fn;
  /** the coordinate of the strip's centre of mass along the symmetry axis [m] */
  coord: Fn;
  /** the axis the centre of mass lies on: x for the rod, y for the others */
  axis: 'x' | 'y';
  /** the strip variable */
  variable: 'x' | 'y' | 'θ';
}

export function stripsOf(s: Shape): Strips {
  switch (s.kind) {
    case 'rod':
      return { a: 0, b: s.L, dmds: (x) => s.lamA + ((s.lamB - s.lamA) * x) / s.L, coord: (x) => x, axis: 'x', variable: 'x' };
    case 'triangle':
      // the width at height y shrinks linearly from the base to the apex
      return { a: 0, b: s.h, dmds: (y) => s.sigma * s.base * (1 - y / s.h), coord: (y) => y, axis: 'y', variable: 'y' };
    case 'half-disc':
      return { a: 0, b: s.R, dmds: (y) => s.sigma * 2 * Math.sqrt(Math.max(0, s.R * s.R - y * y)), coord: (y) => y, axis: 'y', variable: 'y' };
    case 'half-ring':
      // an arc of angle dθ has length R dθ and sits at height R sin θ
      return { a: 0, b: Math.PI, dmds: () => s.lam * s.R, coord: (th) => s.R * Math.sin(th), axis: 'y', variable: 'θ' };
  }
}

/** The body's mass and its centre of mass along the symmetry axis, as Riemann sums over n strips. */
export function numericCM(s: Shape, n: number, rule: RiemannRule = 'mid'): { M: number; coord: number } {
  const st = stripsOf(s);
  const M = riemann(st.dmds, st.a, st.b, n, rule);
  const first = riemann((x) => st.coord(x) * st.dmds(x), st.a, st.b, n, rule);
  return { M, coord: first / M };
}

/** The exact centre of mass along the symmetry axis [m]. */
export function exactCM(s: Shape): number {
  switch (s.kind) {
    case 'rod':
      // ∫xλ dx / ∫λ dx with λ linear: L(λA + 2λB) / (3(λA + λB))
      return (s.L * (s.lamA + 2 * s.lamB)) / (3 * (s.lamA + s.lamB));
    case 'triangle':
      return s.h / 3;
    case 'half-disc':
      return (4 * s.R) / (3 * Math.PI);
    case 'half-ring':
      return (2 * s.R) / Math.PI;
  }
}

/** The exact mass [kg]. */
export function exactMass(s: Shape): number {
  switch (s.kind) {
    case 'rod':
      return ((s.lamA + s.lamB) / 2) * s.L;
    case 'triangle':
      return (s.sigma * s.base * s.h) / 2;
    case 'half-disc':
      return (s.sigma * Math.PI * s.R * s.R) / 2;
    case 'half-ring':
      return s.lam * Math.PI * s.R;
  }
}

/** The centre of mass as a point: (X, 0) for the rod, (0, Y) for the symmetric plates and the wire [m]. */
export function cmPoint(s: Shape): Vec2 {
  const c = exactCM(s);
  return s.kind === 'rod' ? [c, 0] : [0, c];
}

/* ------------------------------------------------------------------ the bursting shell */

export interface Burst {
  /** launch speed [m/s] and angle above the horizontal [deg], from the origin on level ground */
  v0: number;
  angleDeg: number;
  /** the instant of the burst [s]; must be inside the flight */
  tBurst: number;
  /** fragment 1's share of the mass, 0 < f < 1 */
  fraction: number;
  /** the speed at which the fragments separate right after the burst, |v₁ − v₂| [m/s] */
  u: number;
  /** the direction in which fragment 1 leaves fragment 2, above +x [deg] */
  phiDeg: number;
  /** free-fall acceleration [m/s²]; G by default */
  g?: number;
}

export interface FragmentPlan {
  /** share of the total mass */
  fraction: number;
  /** position and velocity right after the burst */
  r0: Vec2;
  v0: Vec2;
  /** the instant it lands, and where [s], [m] */
  tLand: number;
  xLand: number;
}

export interface BurstPlan {
  /** the burst point and the shell's velocity just before it */
  rB: Vec2;
  vB: Vec2;
  frags: [FragmentPlan, FragmentPlan];
  /** the first and the last landing [s] */
  tFirst: number;
  tLast: number;
  /** the unexploded shell's flight time and range [s], [m] */
  tFlight: number;
  range: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** The unexploded shell at time t: r = v₀t + ½gt² (y up), even past its landing (a parabola, for drawing) [m]. */
export function parabolaAt(b: Burst, t: number): Vec2 {
  const g = b.g ?? G;
  const th = rad(b.angleDeg);
  return [b.v0 * Math.cos(th) * t, b.v0 * Math.sin(th) * t - 0.5 * g * t * t];
}

/** The unexploded shell's velocity at time t [m/s]. */
export function parabolaVelocity(b: Burst, t: number): Vec2 {
  const g = b.g ?? G;
  const th = rad(b.angleDeg);
  return [b.v0 * Math.cos(th), b.v0 * Math.sin(th) - g * t];
}

/** The later root of y₀ + v_y τ − ½gτ² = 0: the time a body at height y₀ ≥ 0 takes to reach the ground [s]. */
function fallTime(y0: number, vy: number, g: number): number {
  return (vy + Math.sqrt(vy * vy + 2 * g * y0)) / g;
}

export function burstPlan(b: Burst): BurstPlan {
  const g = b.g ?? G;
  const th = rad(b.angleDeg);
  const tFlight = (2 * b.v0 * Math.sin(th)) / g;
  if (!(b.tBurst > 0 && b.tBurst < tFlight)) throw new Error('burstPlan: the burst must happen in flight');
  if (!(b.fraction > 0 && b.fraction < 1)) throw new Error('burstPlan: each fragment needs a share of the mass');
  const rB = parabolaAt(b, b.tBurst);
  const vB = parabolaVelocity(b, b.tBurst);
  const n: Vec2 = [Math.cos(rad(b.phiDeg)), Math.sin(rad(b.phiDeg))];
  const f1 = b.fraction;
  const f2 = 1 - f1;
  // Δv₁ = f₂ u n̂ and Δv₂ = −f₁ u n̂: f₁Δv₁ + f₂Δv₂ = 0 (momentum) and Δv₁ − Δv₂ = u n̂ (separation)
  const frag = (fraction: number, k: number): FragmentPlan => {
    const v0: Vec2 = [vB[0] + k * b.u * n[0], vB[1] + k * b.u * n[1]];
    const tau = fallTime(rB[1], v0[1], g);
    return { fraction, r0: [rB[0], rB[1]], v0, tLand: b.tBurst + tau, xLand: rB[0] + v0[0] * tau };
  };
  const frags: [FragmentPlan, FragmentPlan] = [frag(f1, f2), frag(f2, -f1)];
  return {
    rB,
    vB,
    frags,
    tFirst: Math.min(frags[0].tLand, frags[1].tLand),
    tLast: Math.max(frags[0].tLand, frags[1].tLand),
    tFlight,
    range: b.v0 * Math.cos(th) * tFlight,
  };
}

export interface BurstState {
  /** the fragments' positions [m] (both at the shell before the burst) and whether each is still flying */
  r: [Vec2, Vec2];
  flying: [boolean, boolean];
  /** the centre of mass of the two fragments, and where the unexploded shell would be [m] */
  cm: Vec2;
  parabola: Vec2;
}

/** A fragment's position at time t (after the burst): a projectile until it lands, then at rest where it landed. */
function fragmentAt(f: FragmentPlan, tBurst: number, t: number, g: number): Vec2 {
  if (t >= f.tLand) return [f.xLand, 0];
  const tau = t - tBurst;
  return [f.r0[0] + f.v0[0] * tau, f.r0[1] + f.v0[1] * tau - 0.5 * g * tau * tau];
}

export function burstAt(b: Burst, t: number, plan: BurstPlan = burstPlan(b)): BurstState {
  const g = b.g ?? G;
  const parabola = parabolaAt(b, t);
  if (t <= b.tBurst) return { r: [parabola, parabola], flying: [true, true], cm: parabola, parabola };
  const [p1, p2] = plan.frags;
  const r1 = fragmentAt(p1, b.tBurst, t, g);
  const r2 = fragmentAt(p2, b.tBurst, t, g);
  const cm: Vec2 = [p1.fraction * r1[0] + p2.fraction * r2[0], p1.fraction * r1[1] + p2.fraction * r2[1]];
  return { r: [r1, r2], flying: [t < p1.tLand, t < p2.tLand], cm, parabola };
}

/**
 * The centre of mass's acceleration between landings: −g times the share of the mass still flying (y up) [m/s²].
 * A landed fragment is held up by the ground's normal force, which cancels its weight, so the external force on the
 * system is the weight of what still flies. At the landing instant itself the ground stops the fragment with an
 * impulse, and v_cm jumps by −(mᵢ/M)·vᵢ; that is not included here.
 */
export function cmAccelerationY(b: Burst, t: number, plan: BurstPlan = burstPlan(b)): number {
  const g = b.g ?? G;
  if (t <= b.tBurst) return -g;
  const flying = plan.frags.reduce((s, f) => s + (t < f.tLand ? f.fraction : 0), 0);
  return -g * flying;
}

/* ------------------------------------------------------------------ walking on a floating plank */

/**
 * A person of mass m walks a distance d along a plank of mass M (relative to the plank) on frictionless water, from
 * rest. The centre of mass stays put, so the plank moves Δx = −m d / (m + M) relative to the water [m].
 */
export const plankShift = (m: number, M: number, d: number): number => (-m * d) / (m + M);

/**
 * Where the plank's centre is when the person stands at s along it (s from the plank's left end), for a centre of
 * mass held at X [m]: m(x_p − L/2 + s) + M x_p = (m + M) X.
 */
export function plankCentre(m: number, M: number, L: number, s: number, X = 0): number {
  return X - (m * (s - L / 2)) / (m + M);
}
