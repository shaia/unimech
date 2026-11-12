/**
 * A frame in linear acceleration (lesson 7.1): what lesson 7.1's figure, examples and workbook need beyond the shared
 * module `rotating.ts` (which holds −mA, g_eff = g − A and the plumb angle atan(A/g)).
 *
 * MODEL SPECIFICATION
 * - System: bodies of mass m inside a box (a cart, an elevator, a closed cabin) whose axes stay parallel to those of
 *   an inertial frame S while its origin moves with R(t) = R₀ + V₀t + ½At², A constant. S′ is the box's frame;
 *   primes are quantities measured in S′: r′ = r − R, v′ = v − V, a′ = a − A. Axes: x along the floor, y up.
 * - Dynamics: in S, m a = ΣF (real forces only). In S′, m a′ = ΣF − mA: the fictitious force −mA, proportional to the
 *   mass like gravity, so a body under gravity alone has a′ = g − A = g_eff, constant. A body at rest in S′ feels
 *   g_eff as its gravity: a hanging string lies along g_eff with tension m|g_eff|, a scale reads m(g + A_y) for
 *   vertical A, a simple pendulum of length L swings about g_eff with period 2π√(L/|g_eff|), a floor with friction
 *   holds a block while |A| ≤ μ_s g and lets it slide back at |A| − μ_k g beyond, a smooth incline holds a block at
 *   A = g tan α, and an Atwood machine runs as in a field g_eff.
 * - Boundary: the state (r, v) of a body in S at t = 0; the frame's R₀, V₀ and A.
 * - Ignored: rotation of the box (lessons 7.2–7.4), air drag, the size of bodies (points), the variation of g over the
 *   box (tidal effects: they are what limits the equivalence principle to a small box), the mass of strings and
 *   pulleys, relativity.
 * - Valid when: A is constant (a changing A gives a changing g_eff and the same formulas at each instant); speeds ≪ c.
 * - Failure modes: g_eff = 0 (free fall) has no "down": a dropped body never lands (`dropInFrame` returns null) and
 *   the pendulum period is infinite (returned as Infinity). A scale on the floor reads 0 when g + A_y ≤ 0: the body
 *   leaves the floor (`scaleReading` clamps). A string goes slack at g_eff = 0 (tension 0).
 */

import { effectiveGravity, linearFictitiousForce } from './rotating';
import { add3, len3, scale3, sub3, type Vec3 } from './vec';

/** A body's position and velocity at one instant. */
export interface Kin3 {
  r: Vec3;
  v: Vec3;
}

/** How a frame's origin moves in S: R(t) = R₀ + V₀t + ½At². */
export interface LinearFrame {
  R0: Vec3;
  V0: Vec3;
  A: Vec3;
}

/** r₀ + v₀t + ½at², v₀ + at: motion at a constant acceleration. */
export function constantAcceleration(s: Kin3, a: Vec3, t: number): Kin3 {
  return { r: add3(add3(s.r, scale3(s.v, t)), scale3(a, 0.5 * t * t)), v: add3(s.v, scale3(a, t)) };
}

/** The frame's origin and velocity in S at time t. */
export const frameAt = (f: LinearFrame, t: number): Kin3 => constantAcceleration({ r: f.R0, v: f.V0 }, f.A, t);

/**
 * A body under gravity g alone, given in S at t = 0, seen in S′ at time t, computed in S and transformed:
 * r′ = r − R, v′ = v − V.
 */
export function seenFromFrame(body: Kin3, g: Vec3, f: LinearFrame, t: number): Kin3 {
  const b = constantAcceleration(body, g, t);
  const o = frameAt(f, t);
  return { r: sub3(b.r, o.r), v: sub3(b.v, o.v) };
}

/**
 * The same body computed in S′ directly, with the fictitious force: start at r′₀ = r₀ − R₀, v′₀ = v₀ − V₀, and move at
 * a′ = (mg − mA)/m = g − A.
 */
export function solvedInFrame(body: Kin3, g: Vec3, f: LinearFrame, t: number): Kin3 {
  const m = 1;
  const aPrime = scale3(add3(scale3(g, m), linearFictitiousForce(m, f.A)), 1 / m);
  return constantAcceleration({ r: sub3(body.r, f.R0), v: sub3(body.v, f.V0) }, aPrime, t);
}

/**
 * A body released at rest in S′ from height h above the floor (the floor is y′ = 0). It moves on a straight line along
 * g_eff = g − A. Returns the time to the floor and the landing point relative to the point under the release, or null
 * when g_eff has no downward component (free fall or worse: it never lands).
 */
export function dropInFrame(h: number, g: Vec3, A: Vec3): { t: number; offset: Vec3 } | null {
  const ge = effectiveGravity(g, A);
  if (ge[1] >= 0) return null;
  const t = Math.sqrt((2 * h) / -ge[1]);
  const off = scale3(ge, 0.5 * t * t);
  return { t, offset: [off[0], 0, off[2]] };
}

/** Tension of a string holding a mass m at rest in the frame: m|g − A| (0 in free fall: the string is slack). */
export const hangingTension = (m: number, g: Vec3, A: Vec3): number => m * len3(effectiveGravity(g, A));

/**
 * Reading of a scale on the floor of an elevator: N = m(g + A_up), A_up the elevator's acceleration, positive up.
 * Never negative: when g + A_up ≤ 0 the body leaves the floor and the scale reads 0.
 */
export const scaleReading = (m: number, g: number, Aup: number): number => Math.max(0, m * (g + Aup));

/** Period of a simple pendulum of length L swinging (small swings) in a frame accelerating at A: 2π√(L/|g − A|). */
export function pendulumPeriodInFrame(L: number, g: Vec3, A: Vec3): number {
  const ge = len3(effectiveGravity(g, A));
  return ge === 0 ? Number.POSITIVE_INFINITY : 2 * Math.PI * Math.sqrt(L / ge);
}

/**
 * The acceleration of a frame accelerating horizontally in which a simple pendulum's period is a fraction `ratio` of
 * its period at rest: |g_eff| = g/ratio², A = √(g_eff² − g²). Null when ratio > 1 (horizontal A only shortens it).
 */
export function horizontalAccelForPeriodRatio(g: number, ratio: number): number | null {
  if (ratio > 1 || ratio <= 0) return null;
  const ge = g / (ratio * ratio);
  return Math.sqrt(ge * ge - g * g);
}

/**
 * A block on the horizontal floor of a frame accelerating horizontally at A (along +x if A > 0), with friction
 * coefficients μ_s, μ_k. Accelerations per unit mass along x: in S′ (`aRel`) and in S (`aGround`); `friction` is the
 * friction force per unit mass on the block (along x).
 */
export function blockOnAcceleratingFloor(
  A: number,
  muS: number,
  muK: number,
  g: number,
): { sliding: boolean; aRel: number; aGround: number; friction: number } {
  if (Math.abs(A) <= muS * g) return { sliding: false, aRel: 0, aGround: A, friction: A };
  const s = Math.sign(A);
  // in S′ the fictitious force −mA pushes the block back; kinetic friction μ_k mg opposes that sliding
  return { sliding: true, aRel: -s * (Math.abs(A) - muK * g), aGround: s * muK * g, friction: s * muK * g };
}

/**
 * A block on a smooth incline fixed in a cart that accelerates horizontally at A. The incline makes the angle α with the
 * floor and rises toward the back of the cart, so its face looks forward and up. Returns the block's acceleration up
 * the slope in S′ (A cos α − g sin α) and the normal force per unit mass (g cos α + A sin α).
 */
export function inclineInCart(g: number, A: number, alpha: number): { aUp: number; normal: number } {
  return { aUp: A * Math.cos(alpha) - g * Math.sin(alpha), normal: g * Math.cos(alpha) + A * Math.sin(alpha) };
}

/** The cart acceleration that holds a block at rest on that smooth incline: g tan α. */
export const inclineRestAcceleration = (g: number, alpha: number): number => g * Math.tan(alpha);

/**
 * Tidal approach of two bodies released side by side, a distance d apart horizontally, near a planet of radius R where
 * the gravitational acceleration is g: both fall toward its centre, so in their common free-falling frame they approach
 * at g d/R (to first order in d/R) and close ½(g d/R)t² in a time t. This is what a large box can measure and a small
 * one cannot.
 */
export const tidalApproach = (g: number, d: number, R: number, t: number): number => 0.5 * ((g * d) / R) * t * t;

/** The same approach computed exactly from the two radial pulls (both bodies start at distance R from the centre). */
export function tidalApproachExact(g: number, d: number, R: number, t: number, steps = 4000): number {
  // each body: 2D motion toward the centre at (0, 0), starting at (±d/2, R') with R' = √(R² − d²/4) so |r| = R
  const GM = g * R * R;
  const y0 = Math.sqrt(R * R - (d * d) / 4);
  let x = d / 2;
  let y = y0;
  let vx = 0;
  let vy = 0;
  const dt = t / steps;
  const acc = (px: number, py: number): [number, number] => {
    const r = Math.hypot(px, py);
    const k = -GM / (r * r * r);
    return [k * px, k * py];
  };
  for (let i = 0; i < steps; i++) {
    // RK4 on (x, y, vx, vy)
    const a1 = acc(x, y);
    const a2 = acc(x + 0.5 * dt * vx, y + 0.5 * dt * vy);
    const a3 = acc(x + 0.5 * dt * (vx + 0.5 * dt * a1[0]), y + 0.5 * dt * (vy + 0.5 * dt * a1[1]));
    const a4 = acc(x + dt * (vx + 0.5 * dt * a2[0]), y + dt * (vy + 0.5 * dt * a2[1]));
    const nx = x + dt * vx + (dt * dt * (a1[0] + a2[0] + a3[0])) / 6;
    const ny = y + dt * vy + (dt * dt * (a1[1] + a2[1] + a3[1])) / 6;
    vx += (dt * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0])) / 6;
    vy += (dt * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1])) / 6;
    x = nx;
    y = ny;
  }
  // the two bodies are mirror images: their separation is 2x
  return d - 2 * x;
}
