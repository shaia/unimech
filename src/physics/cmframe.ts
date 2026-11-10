/**
 * The centre-of-mass frame of a head-on collision of two bodies (lesson 4.2, figure CMFrameCollision): the
 * velocity of the centre of mass, the Galilean transformation into the frame that moves with it and back, the
 * reduced mass, the split of the kinetic energy into the energy of the centre of mass and the energy of the
 * relative motion, and the collision with a coefficient of restitution e solved in the centre-of-mass frame.
 * Self-contained on purpose (lesson 4.1's module is written in parallel); `galilean.ts` supplies the frame change.
 *
 * MODEL SPECIFICATION
 * - System: two point bodies (in the figure, blocks of finite width) of masses m₁, m₂ > 0 on a straight line,
 *   the x axis, positive to the right; v₁, v₂ are their velocities along x in the laboratory frame. Body 1 starts
 *   on the left, so the bodies approach when v_rel = v₁ − v₂ > 0.
 * - Dynamics: no external force along x (a frictionless track), so the total momentum P = m₁v₁ + m₂v₂ and the
 *   velocity of the centre of mass V = P/M (M = m₁ + m₂) are constant before, during and after the collision.
 *   The centre-of-mass frame moves at +V along x: u_i = v_i − V (galilean.ts velocityInFrame), v_i = u_i + V.
 *   In it m₁u₁ = −m₂u₂ = μ v_rel ≡ p, μ = m₁m₂/M. The collision is instantaneous and is closed by the
 *   coefficient of restitution: separation speed = e × approach speed, u₂′ − u₁′ = e (u₁ − u₂), with
 *   0 ≤ e ≤ 1. With zero total momentum in the frame this gives u_i′ = −e u_i.
 *   Energy: K = ½MV² + ½μ v_rel² (König's theorem for two bodies); after the collision the relative part is
 *   e² ½μ v_rel², so the loss is (1 − e²) ½μ v_rel², the same in every inertial frame.
 * - Boundary: the collision happens at t = 0 with the bodies in contact at x = 0 (body 1's right face, body 2's
 *   left face); before it each moves uniformly, after it each moves uniformly with its new velocity.
 * - Ignored: the duration of the contact and the deformation during it (the restitution rule replaces them),
 *   rotation, friction with the track, the bodies' sizes in the momentum and energy balance, relativity.
 * - Valid when: the impulse of external forces during the contact is negligible next to the impulse the bodies
 *   exchange (lesson 4.4); speeds far below c; e is a property of the pair of bodies and does not depend on the
 *   approach speed (true only roughly for real bodies).
 * - Failure modes: with v_rel ≤ 0 the bodies never meet: `collide` returns the velocities unchanged (no collision),
 *   and `positionsAt` keeps them moving apart. m → 0 or m → ∞ are reachable only as limits: `reducedMass` with an
 *   infinite mass returns the other mass, `collide` with m₂ = Infinity is the collision with a wall moving at v₂,
 *   and `positionsAt` puts the centre of mass on the infinitely heavy body. Both masses infinite has no centre of
 *   mass: `positionsAt` throws.
 */

import { velocityFromFrame, velocityInFrame } from './galilean';

/** Two bodies on a line: masses [kg] and velocities along +x in the laboratory frame [m/s]. */
export interface Pair {
  m1: number;
  v1: number;
  m2: number;
  v2: number;
}

/** Velocity along x of a frame moving at V along x, as galilean.ts writes it for vectors. */
const inFrame = (v: number, V: number) => velocityInFrame([v, 0], [V, 0])[0];
const fromFrame = (u: number, V: number) => velocityFromFrame([u, 0], [V, 0])[0];

/** Total mass M = m₁ + m₂ [kg]. */
export const totalMass = (s: Pair) => s.m1 + s.m2;

/** Total momentum P = m₁v₁ + m₂v₂ [kg·m/s]. */
export const totalMomentum = (s: Pair) => s.m1 * s.v1 + s.m2 * s.v2;

/**
 * Velocity of the centre of mass V = (m₁v₁ + m₂v₂)/(m₁ + m₂) [m/s]: the mass-weighted average of the velocities.
 * With m₂ = Infinity it is v₂ (the frame of an infinitely heavy body is its own frame).
 */
export function cmVelocity(s: Pair): number {
  if (!Number.isFinite(s.m2)) return s.v2;
  if (!Number.isFinite(s.m1)) return s.v1;
  return totalMomentum(s) / totalMass(s);
}

/** Reduced mass μ = m₁m₂/(m₁ + m₂) [kg]; with one mass infinite it is the other mass. */
export function reducedMass(m1: number, m2: number): number {
  if (!Number.isFinite(m2)) return m1;
  if (!Number.isFinite(m1)) return m2;
  return (m1 * m2) / (m1 + m2);
}

/** Relative velocity v_rel = v₁ − v₂ [m/s]: positive when body 1 (on the left) closes in on body 2. */
export const relativeVelocity = (s: Pair) => s.v1 - s.v2;

/** A velocity in the centre-of-mass frame: u = v − V. */
export const toCM = (v: number, V: number) => inFrame(v, V);

/** A velocity back in the laboratory frame: v = u + V. */
export const fromCM = (u: number, V: number) => fromFrame(u, V);

/** The pair described in the centre-of-mass frame: u₁ = v₁ − V, u₂ = v₂ − V, and the momenta m₁u₁ = −m₂u₂ = p. */
export function inCMFrame(s: Pair): { V: number; u1: number; u2: number; p1: number; p2: number } {
  const V = cmVelocity(s);
  const u1 = toCM(s.v1, V);
  const u2 = toCM(s.v2, V);
  // with m₂ infinite its momentum in the frame is −m₁u₁ (it absorbs the momentum without moving)
  const p1 = s.m1 * u1;
  const p2 = Number.isFinite(s.m2) ? s.m2 * u2 : -p1;
  return { V, u1, u2, p1, p2 };
}

/** The pair seen from any frame that moves at W along x (every velocity shifted by −W). */
export const shiftFrame = (s: Pair, W: number): Pair => ({ ...s, v1: inFrame(s.v1, W), v2: inFrame(s.v2, W) });

/** Kinetic energy of the pair in the laboratory frame, ½m₁v₁² + ½m₂v₂² [J]. */
export const kineticEnergy = (s: Pair) => 0.5 * s.m1 * s.v1 * s.v1 + 0.5 * s.m2 * s.v2 * s.v2;

export interface EnergySplit {
  /** total kinetic energy in the laboratory frame [J] */
  K: number;
  /** energy of the centre of mass, ½MV² [J] */
  Kcm: number;
  /** energy of the relative motion, ½μv_rel², which is also the whole kinetic energy in the centre-of-mass frame [J] */
  Krel: number;
  M: number;
  V: number;
  mu: number;
  vrel: number;
}

/** K = ½MV² + ½μv_rel²: the two parts, each computed from its own formula (not one from the other). */
export function energySplit(s: Pair): EnergySplit {
  const M = totalMass(s);
  const V = cmVelocity(s);
  const mu = reducedMass(s.m1, s.m2);
  const vrel = relativeVelocity(s);
  return { K: kineticEnergy(s), Kcm: 0.5 * M * V * V, Krel: 0.5 * mu * vrel * vrel, M, V, mu, vrel };
}

/** Kinetic energy in the centre-of-mass frame computed directly, ½m₁u₁² + ½m₂u₂² [J] (finite masses). */
export function kineticEnergyInCM(s: Pair): number {
  const { u1, u2 } = inCMFrame(s);
  return 0.5 * s.m1 * u1 * u1 + 0.5 * s.m2 * u2 * u2;
}

export interface Outcome {
  /** velocities after the collision, laboratory frame [m/s] */
  v1: number;
  v2: number;
  /** velocities before and after, centre-of-mass frame [m/s] */
  u1: number;
  u2: number;
  u1After: number;
  u2After: number;
  V: number;
  /** kinetic energy turned into other forms, (1 − e²)½μv_rel² [J] (0 when there is no collision) */
  lost: number;
  /** false when the bodies do not approach (v_rel ≤ 0): nothing happens */
  collides: boolean;
}

/**
 * The collision solved by the recipe of the lesson: into the centre-of-mass frame (u = v − V), reverse every
 * velocity and scale it by e (u′ = −e u), back to the laboratory (v′ = u′ + V).
 */
export function collide(s: Pair, e: number): Outcome {
  const { V, u1, u2 } = inCMFrame(s);
  const vrel = relativeVelocity(s);
  if (!(vrel > 0)) return { v1: s.v1, v2: s.v2, u1, u2, u1After: u1, u2After: u2, V, lost: 0, collides: false };
  const u1After = -e * u1;
  const u2After = -e * u2;
  const mu = reducedMass(s.m1, s.m2);
  return {
    v1: fromCM(u1After, V),
    v2: fromCM(u2After, V),
    u1,
    u2,
    u1After,
    u2After,
    V,
    lost: (1 - e * e) * 0.5 * mu * vrel * vrel,
    collides: true,
  };
}

/**
 * The same collision solved directly in the laboratory frame, from conservation of momentum and the restitution
 * rule v₂′ − v₁′ = e(v₁ − v₂), without the centre-of-mass frame (the textbook formulas, used by the tests).
 */
export function collideLab(s: Pair, e: number): { v1: number; v2: number } {
  if (!(relativeVelocity(s) > 0)) return { v1: s.v1, v2: s.v2 };
  if (!Number.isFinite(s.m2)) return { v1: s.v2 - e * (s.v1 - s.v2), v2: s.v2 };
  const M = totalMass(s);
  const P = totalMomentum(s);
  return {
    v1: (P - s.m2 * e * (s.v1 - s.v2)) / M,
    v2: (P + s.m1 * e * (s.v1 - s.v2)) / M,
  };
}

/** Half-widths of the two blocks, in the units of the caller (for `positionsAt`). */
export interface Widths {
  h1: number;
  h2: number;
}

/**
 * Centres of the two blocks in the laboratory frame at time t, with contact at t = 0 at x = 0 (body 1's right face
 * and body 2's left face). Before the contact, x_i = ∓h_i + v_i t; after it, x_i = ∓h_i + v_i′ t. Without a
 * collision the bodies keep their velocities for all t. Also the centre of mass, which moves at V throughout.
 */
export function positionsAt(s: Pair, e: number, w: Widths, t: number): { x1: number; x2: number; xcm: number } {
  const out = collide(s, e);
  const after = out.collides && t > 0;
  const v1 = after ? out.v1 : s.v1;
  const v2 = after ? out.v2 : s.v2;
  const x1 = -w.h1 + v1 * t;
  const x2 = w.h2 + v2 * t;
  return { x1, x2, xcm: cmPosition(s.m1, x1, s.m2, x2) };
}

/** Position of the centre of mass (m₁x₁ + m₂x₂)/(m₁ + m₂) [m]; with one mass infinite, that body's position. */
function cmPosition(m1: number, x1: number, m2: number, x2: number): number {
  if (!Number.isFinite(m1) && !Number.isFinite(m2)) throw new RangeError('both masses infinite');
  if (!Number.isFinite(m2)) return x2;
  if (!Number.isFinite(m1)) return x1;
  return (m1 * x1 + m2 * x2) / (m1 + m2);
}
