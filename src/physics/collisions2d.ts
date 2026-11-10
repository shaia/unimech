/**
 * Collisions in a plane (lesson 4.3): two smooth discs (pucks on air-hockey ice, seen from above) that meet once.
 * The collision is a normal impulse along the line of centres at contact, with a coefficient of restitution e;
 * the contact geometry comes from the impact parameter b and the radii; the module also gives the scattering
 * angles, the maximum scattering angle of a heavy projectile, and the 1D formula the head-on case reduces to.
 *
 * MODEL SPECIFICATION
 * - System: two rigid smooth discs of masses m₁, m₂ and radii R₁, R₂ sliding on a horizontal frictionless plane;
 *   the plane's x, y axes are the axes of every vector here (`Vec2` from vec.ts). In the scattering setup
 *   (`scatter`) the target (disc 2) is at rest with its centre at the origin, and the projectile (disc 1) comes
 *   in along +x on the line y = b: b is the impact parameter, the distance between the target's centre and the
 *   line on which the projectile's centre moves. b > 0 means the projectile passes above the target's centre.
 * - Dynamics: during contact the only force between the discs is the normal force at the point of contact. The
 *   discs are smooth (no friction between them), so that force, and its impulse J, points along the line of
 *   centres n̂ (the unit vector from the centre of disc 1 to the centre of disc 2 at contact). With the
 *   approach speed w = (v₁ − v₂)·n̂ > 0 and μ = m₁m₂/(m₁ + m₂):
 *     J = (1 + e) μ w,   v₁' = v₁ − (J/m₁) n̂,   v₂' = v₂ + (J/m₂) n̂.
 *   This conserves both momentum components for every e; along n̂ the relative velocity reverses and shrinks
 *   by e (the 1D law of lesson 4.1); the tangential components are unchanged; the kinetic energy is conserved
 *   iff e = 1. In `scatter`, sin φ = b/D with D = R₁ + R₂ and n̂ = (cos φ, −sin φ): the target, at rest, leaves
 *   along n̂, at the angle −φ.
 * - Boundary: the discs touch once; |b| < D for a hit (|b| ≥ D is a miss: nothing changes).
 * - Ignored: the duration of the contact (an impulse), friction between the discs and with the ice, spin (a
 *   smooth disc gets no torque from a force through its centre), deformation, a second contact.
 * - Valid when: the contact time is short, so the impulse of the ice's friction during it is negligible (lesson
 *   4.4), and the discs' surfaces are smooth. e is a property of the pair of materials, 0 ≤ e ≤ 1.
 * - Failure modes: a real billiard ball rolls and spins, and the friction between the balls makes the angle
 *   between the outgoing paths differ from 90° by a few degrees; b → ±D (grazing) gives J → 0, and the angle
 *   of a projectile that barely moves after the collision (equal masses, b → 0) is ill-conditioned: `scatter`
 *   returns NaN for the angle of a disc whose speed after is below 1e-12 of the incoming speed.
 */

import { add, dot, len, scale, sub, type Vec2 } from './vec';

/** The result of one contact. */
export interface Impact {
  v1: Vec2;
  v2: Vec2;
  /** the impulse that disc 1 exerts on disc 2, along n̂ [N·s] (disc 2 exerts −J on disc 1) */
  J: number;
  /** the approach speed along the line of centres before, (v₁ − v₂)·n̂ [m/s] */
  approach: number;
}

/** Reduced mass m₁m₂/(m₁ + m₂) [kg]. */
export const reducedMass = (m1: number, m2: number) => (m1 * m2) / (m1 + m2);

/** Kinetic energy ½mv² of a body with velocity v [J]. */
export const kinetic = (m: number, v: Vec2) => 0.5 * m * dot(v, v);

/**
 * The collision of two smooth discs whose line of centres at contact is n̂ (unit vector from 1 to 2). If the
 * discs are not approaching along n̂ there is no impulse and the velocities are returned unchanged.
 */
export function smoothImpact(m1: number, v1: Vec2, m2: number, v2: Vec2, n: Vec2, e: number): Impact {
  const approach = dot(sub(v1, v2), n);
  if (!(approach > 0)) return { v1, v2, J: 0, approach };
  const J = (1 + e) * reducedMass(m1, m2) * approach;
  return { v1: sub(v1, scale(n, J / m1)), v2: add(v2, scale(n, J / m2)), J, approach };
}

/**
 * The line of centres at contact for a projectile moving along +x on the line y = b towards a target centred at
 * the origin, with D = R₁ + R₂: n̂ = (cos φ, −sin φ), sin φ = b/D. null for a miss (|b| ≥ D).
 */
export function contactNormal(b: number, D: number): Vec2 | null {
  if (!(Math.abs(b) < D)) return null;
  const s = b / D;
  return [Math.sqrt(1 - s * s), -s];
}

/** The angle φ between the incoming direction and the line of centres, sin φ = b/D [rad] (signed like b). */
export const contactAngle = (b: number, D: number) => Math.asin(Math.max(-1, Math.min(1, b / D)));

/** The input of the scattering setup: the target at rest at the origin, the projectile along +x on y = b. */
export interface ScatterSetup {
  m1: number;
  m2: number;
  /** the projectile's speed [m/s] */
  v: number;
  /** impact parameter [m] */
  b: number;
  R1: number;
  R2: number;
  /** coefficient of restitution, 0 ≤ e ≤ 1 */
  e: number;
}

export interface Scatter {
  hit: boolean;
  /** line of centres at contact (unit, from 1 to 2); [1, 0] for a miss */
  n: Vec2;
  /** the projectile's centre at contact (the target's centre is the origin) [m] */
  c1: Vec2;
  /** velocities before and after [m/s] */
  v1: Vec2;
  v1p: Vec2;
  v2p: Vec2;
  /** the impulse on the target [N·s] */
  J: number;
  /** directions after, counter-clockwise from +x (the incoming direction) [rad]; NaN for a disc left at rest */
  theta1: number;
  theta2: number;
  /** kinetic energy before and after [J] */
  K0: number;
  K1: number;
}

/** Signed direction of a velocity, counter-clockwise from +x; NaN when the speed is below `tiny`. */
const direction = (v: Vec2, tiny: number) => (len(v) > tiny ? Math.atan2(v[1], v[0]) : NaN);

export function scatter(s: ScatterSetup): Scatter {
  const D = s.R1 + s.R2;
  const v1: Vec2 = [s.v, 0];
  const K0 = kinetic(s.m1, v1);
  const n = contactNormal(s.b, D);
  if (!n) {
    return { hit: false, n: [1, 0], c1: [-D, s.b], v1, v1p: v1, v2p: [0, 0], J: 0, theta1: 0, theta2: NaN, K0, K1: K0 };
  }
  const imp = smoothImpact(s.m1, v1, s.m2, [0, 0], n, s.e);
  const tiny = 1e-12 * Math.abs(s.v);
  return {
    hit: true,
    n,
    c1: scale(n, -D),
    v1,
    v1p: imp.v1,
    v2p: imp.v2,
    J: imp.J,
    theta1: direction(imp.v1, tiny),
    theta2: direction(imp.v2, tiny),
    K0,
    K1: kinetic(s.m1, imp.v1) + kinetic(s.m2, imp.v2),
  };
}

/** Angle between two velocities after the collision [rad], in [0, π]; NaN if either is at rest. */
export function separationAngle(a: Vec2, b: Vec2): number {
  const la = len(a);
  const lb = len(b);
  if (!(la > 0 && lb > 0)) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb))));
}

/**
 * The largest scattering angle of a projectile on a target at rest, elastic: arcsin(m₂/m₁) when m₁ > m₂; for
 * m₁ ≤ m₂ there is no limit below π (m₁ = m₂: every angle below π/2, and the supremum π/2 is not reached).
 */
export function thetaMaxElastic(m1: number, m2: number): number {
  if (m1 > m2) return Math.asin(m2 / m1);
  return m1 === m2 ? Math.PI / 2 : Math.PI;
}

/**
 * The projectile's speed after an elastic collision with a target at rest when it leaves at the angle θ:
 * v₁'/v = [m₁cos θ ± √(m₂² − m₁² sin²θ)]/(m₁ + m₂). Both roots are physical when m₁ > m₂ (θ ≤ θmax: two impact
 * parameters give the same angle); only the + root is non-negative when m₁ ≤ m₂. Returns [] beyond θmax.
 */
export function elasticSpeedsAtAngle(m1: number, m2: number, v: number, theta: number): number[] {
  const disc = m2 * m2 - m1 * m1 * Math.sin(theta) ** 2;
  if (disc < 0) return [];
  const r = Math.sqrt(disc);
  const roots = [(m1 * Math.cos(theta) + r) / (m1 + m2), (m1 * Math.cos(theta) - r) / (m1 + m2)].map((k) => k * v);
  return roots.filter((x, i) => x >= 0 && (i === 0 || Math.abs(x - roots[0]) > 1e-15 * v));
}

/** The 1D collision of lesson 4.1, written from its own formulas: v₁' and v₂' with restitution e. */
export function headOn1D(m1: number, u1: number, m2: number, u2: number, e: number): [number, number] {
  const M = m1 + m2;
  const vcm = (m1 * u1 + m2 * u2) / M;
  return [vcm - (e * m2 * (u1 - u2)) / M, vcm + (e * m1 * (u1 - u2)) / M];
}

/**
 * The deflection of the relative velocity in the centre-of-mass frame for an elastic collision of smooth discs:
 * χ = π − 2φ, sin φ = b/D (the relative velocity reflects off the line of centres).
 */
export const cmDeflection = (b: number, D: number) => Math.PI - 2 * contactAngle(Math.abs(b), D);

/**
 * The largest |θ₁| over impact parameters in (−D, D), by a scan of `n` values of b, then a golden-section
 * refinement around the best one. Works for any e (no closed form is needed); returns the angle and the b.
 */
export function maxScatteringAngleScan(m1: number, m2: number, e: number, D: number, n = 4000): { theta: number; b: number } {
  const th = (b: number) => {
    const t = scatter({ m1, m2, v: 1, b, R1: D / 2, R2: D / 2, e }).theta1;
    return Number.isFinite(t) ? Math.abs(t) : -1;
  };
  let best = 0;
  let bBest = 0;
  for (let i = 1; i < n; i++) {
    const b = (i / n) * D;
    const t = th(b);
    if (t > best) {
      best = t;
      bBest = b;
    }
  }
  let lo = Math.max(1e-12, bBest - D / n);
  let hi = Math.min(D * (1 - 1e-12), bBest + D / n);
  const gr = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 80; k++) {
    const a = hi - gr * (hi - lo);
    const c = lo + gr * (hi - lo);
    if (th(a) > th(c)) hi = c;
    else lo = a;
  }
  const b = (lo + hi) / 2;
  return { theta: Math.max(best, th(b)), b };
}

/**
 * The mass ratio m₂/m₁ of an elastic collision with a target at rest, read off the two directions after it
 * (θ₁ of the projectile, θ₂ of the target, both measured from the incoming direction on opposite sides, > 0):
 * m₂/m₁ = sin θ₁ / sin(θ₁ + 2θ₂), from the law of sines in the momentum triangle and the energy.
 */
export const massRatioFromAngles = (theta1: number, theta2: number) => Math.sin(theta1) / Math.sin(theta1 + 2 * theta2);

/** The common velocity of two bodies that stick together (momentum conservation) [m/s]. */
export const stickTogether = (m1: number, v1: Vec2, m2: number, v2: Vec2): Vec2 =>
  scale(add(scale(v1, m1), scale(v2, m2)), 1 / (m1 + m2));
