/**
 * Work as a line integral, and the work-energy theorem along a computed trajectory (lesson 3.1).
 *
 * A force field F(r) in a plane, a path from A to B written as a parametric curve r(s) with s from 0 to 1, and
 * the work W = ∫ F·dr along it: the sum of F·Δr over the small pieces Δr of the path, in the limit of many
 * pieces. Along a path the body is guided (a track, a hand); this module computes only the work of F. Along a
 * trajectory the body moves under F alone, and the work of F, which is then the net force, is compared with the
 * change of the kinetic energy.
 *
 * MODEL SPECIFICATION
 * - System: a point body in the (x, y) plane, metres; a force that depends on the position only, F(r) in
 *   newtons: uniform (gravity near the ground, F = (0, −mg) with y up), a spring of zero natural length anchored
 *   at O (F = −k(r − O)), or a "shear" force F = (c y, 0) whose x component grows with the height.
 * - Dynamics: along a path, none: W = ∫₀¹ F(r(s))·r′(s) ds, an ordinary integral in s (calculus.riemann).
 *   The figure's version cuts the path into n chords Δrᵢ = r(sᵢ₊₁) − r(sᵢ) and sums F(r(s_mid))·Δrᵢ.
 *   Along a trajectory: Newton's second law m a = F(r), stepped with RK4 (motion.ts `rk4Step`); the work of F
 *   over each step is ∫F·v dt by Simpson's rule, with the midpoint state taken from the cubic Hermite curve
 *   through the two ends of the step (positions and velocities), so the sum is O(dt⁴), like RK4 itself.
 * - Boundary: r(0) = A, r(1) = B. A trajectory starts at r₀ with velocity v₀ at t = 0 and is stopped by the
 *   caller (`keep`), e.g. when it leaves the drawing.
 * - Ignored: every force the caller leaves out; the size and rotation of the body; anything outside the plane.
 * - Valid when: F is smooth along the path and r(s) is smooth on [0, 1]. Errors: the midpoint rule and the
 *   chord sum are O(1/n²), the left and right rules O(1/n); the trajectory's W − ΔK is O(dt⁴).
 * - Failure modes: a path with a corner inside a piece (a polyline cut in the wrong place) drops the order to
 *   O(1/n); the tangent by central difference (when a path gives no `tangent`) has a floor of about 1e-10;
 *   a stiff spring with dt ≳ 1/ω makes RK4 unstable, and then W and ΔK still agree with each other only to
 *   O(dt⁴) while both are wrong.
 */

import { G } from './constants';
import { derivative, riemann, type RiemannRule } from './calculus';
import { rk4Step, type Body, type Force } from './motion';
import { add, dot, len, scale, sub, type Vec2 } from './vec';

/** A force that depends only on where the body is [N]. */
export type Field = (r: Vec2) => Vec2;

/** A path from A = at(0) to B = at(1); `tangent` is dr/ds when it is known in closed form. */
export interface Path {
  at: (s: number) => Vec2;
  tangent?: (s: number) => Vec2;
}

/* ---------------------------------------------------------------- force fields */

/** A constant force F everywhere. */
export const uniformField =
  (F: Vec2): Field =>
  () =>
    F;

/** The weight of a body of mass m near the ground, with y up: F = (0, −mg). */
export const gravityField = (m: number, g = G): Field => uniformField([0, -m * g]);

/** A spring of zero natural length anchored at O, constant k: F = −k(r − O), toward O. */
export const springField =
  (k: number, O: Vec2 = [0, 0]): Field =>
  (r) => [-k * (r[0] - O[0]), -k * (r[1] - O[1])];

/** A force along x whose size grows with the height: F = (c y, 0). Zero on the x axis, to the left below it. */
export const shearField =
  (c: number): Field =>
  (r) => [c * r[1], 0];

/* ---------------------------------------------------------------- paths */

/** The straight segment from A to B. */
export const linePath = (A: Vec2, B: Vec2): Path => {
  const d = sub(B, A);
  return { at: (s) => add(A, scale(d, s)), tangent: () => d };
};

/**
 * The path whose distance from O and angle about O both change at a steady rate from A to B (the shorter way
 * round). When |A − O| = |B − O| it is an arc of the circle about O.
 */
export function polarPath(A: Vec2, B: Vec2, O: Vec2 = [0, 0]): Path {
  const a = sub(A, O);
  const b = sub(B, O);
  const rA = len(a);
  const rB = len(b);
  const pA = Math.atan2(a[1], a[0]);
  let dp = Math.atan2(b[1], b[0]) - pA;
  if (dp > Math.PI) dp -= 2 * Math.PI;
  if (dp < -Math.PI) dp += 2 * Math.PI;
  const dr = rB - rA;
  return {
    at: (s) => {
      const r = rA + dr * s;
      const p = pA + dp * s;
      return [O[0] + r * Math.cos(p), O[1] + r * Math.sin(p)];
    },
    tangent: (s) => {
      const r = rA + dr * s;
      const p = pA + dp * s;
      const c = Math.cos(p);
      const sn = Math.sin(p);
      return [dr * c - r * dp * sn, dr * sn + r * dp * c];
    },
  };
}

/** The quadratic Bézier curve from A to B pulled toward the control point C: r = (1−s)²A + 2s(1−s)C + s²B. */
export function bezierPath(A: Vec2, C: Vec2, B: Vec2): Path {
  return {
    at: (s) => {
      const u = 1 - s;
      return [u * u * A[0] + 2 * s * u * C[0] + s * s * B[0], u * u * A[1] + 2 * s * u * C[1] + s * s * B[1]];
    },
    tangent: (s) => [2 * (1 - s) * (C[0] - A[0]) + 2 * s * (B[0] - C[0]), 2 * (1 - s) * (C[1] - A[1]) + 2 * s * (B[1] - C[1])],
  };
}

/** dr/ds: the path's own tangent, or a central difference of each component (calculus.derivative). */
export function tangentOf(path: Path, s: number): Vec2 {
  if (path.tangent) return path.tangent(s);
  return [derivative((u) => path.at(u)[0], s, 1e-6), derivative((u) => path.at(u)[1], s, 1e-6)];
}

/** The length of the path [m]: the sum of n chords. */
export function pathLength(path: Path, n = 400): number {
  let L = 0;
  let prev = path.at(0);
  for (let i = 1; i <= n; i++) {
    const r = path.at(i / n);
    L += len(sub(r, prev));
    prev = r;
  }
  return L;
}

/* ---------------------------------------------------------------- work along a path */

/** W = ∫₀¹ F(r(s))·r′(s) ds by a Riemann sum with n pieces in s (calculus.riemann). */
export function lineIntegral(F: Field, path: Path, n = 400, rule: RiemannRule = 'mid'): number {
  return riemann((s) => dot(F(path.at(s)), tangentOf(path, s)), 0, 1, n, rule);
}

/** One piece of the path, as the figure draws it. */
export interface WorkPiece {
  /** the chord's ends and the point of the path where F is taken (parameter midpoint) */
  a: Vec2;
  b: Vec2;
  mid: Vec2;
  /** F at `mid` [N] */
  F: Vec2;
  /** F·Δr for this piece [J] */
  dW: number;
  /** the work from A to the end of this piece [J] */
  W: number;
  /** the length along the path from A to the end of this piece [m] */
  ell: number;
}

/** The path cut into n chords Δr, each with its F·Δr and the running sum (the chord sum, O(1/n²)). */
export function workPieces(F: Field, path: Path, n: number): WorkPiece[] {
  const out: WorkPiece[] = [];
  let W = 0;
  let ell = 0;
  let a = path.at(0);
  for (let i = 0; i < n; i++) {
    const b = path.at((i + 1) / n);
    const mid = path.at((i + 0.5) / n);
    const f = F(mid);
    const d = sub(b, a);
    const dW = dot(f, d);
    W += dW;
    ell += len(d);
    out.push({ a, b, mid, F: f, dW, W, ell });
    a = b;
  }
  return out;
}

/** Σ F(r(s_mid))·Δr over n chords. */
export const chordSum = (F: Field, path: Path, n: number): number => {
  const p = workPieces(F, path, n);
  return p[p.length - 1].W;
};

/** The work of a constant force from A to B, along any path: F·(B − A). */
export const constantForceWork = (F: Vec2, A: Vec2, B: Vec2): number => dot(F, sub(B, A));

/** The work of a zero-length spring anchored at O from A to B, along any path: ½k(|A − O|² − |B − O|²). */
export const springWork = (k: number, A: Vec2, B: Vec2, O: Vec2 = [0, 0]): number => {
  const a = len(sub(A, O));
  const b = len(sub(B, O));
  return 0.5 * k * (a * a - b * b);
};

/** The work of the shear force (c y, 0) along the straight segment from A to B: c·(y_A + y_B)/2·(x_B − x_A). */
export const shearLineWork = (c: number, A: Vec2, B: Vec2): number => (c * (A[1] + B[1]) * (B[0] - A[0])) / 2;

/** The kinetic energy ½mv² [J]. */
export const kinetic = (m: number, v: Vec2): number => 0.5 * m * dot(v, v);

/* ---------------------------------------------------------------- the work-energy theorem along a trajectory */

export interface TrajectorySample {
  t: number;
  pos: Vec2;
  vel: Vec2;
  /** the work of F from the start to this instant [J] */
  W: number;
  /** the kinetic energy now [J] */
  K: number;
}

const to3 = (v: Vec2): [number, number, number] => [v[0], v[1], 0];

/**
 * The motion of a body of mass m under F alone, from r₀ with velocity v₀, in `steps` RK4 steps of dt, and the
 * work of F summed along it. Stops early (after the first sample for which `keep` is false).
 */
export function trajectoryWork(
  F: Field,
  m: number,
  r0: Vec2,
  v0: Vec2,
  dt: number,
  steps: number,
  keep: (s: TrajectorySample) => boolean = () => true,
): TrajectorySample[] {
  const force: Force = (p) => to3(F([p[0], p[1]]));
  let body: Body = { pos: to3(r0), vel: to3(v0), m };
  const power = (r: Vec2, v: Vec2) => dot(F(r), v);
  let W = 0;
  const out: TrajectorySample[] = [{ t: 0, pos: r0, vel: v0, W: 0, K: kinetic(m, v0) }];
  for (let i = 0; i < steps; i++) {
    const p0: Vec2 = [body.pos[0], body.pos[1]];
    const u0: Vec2 = [body.vel[0], body.vel[1]];
    body = rk4Step(body, force, i * dt, dt);
    const p1: Vec2 = [body.pos[0], body.pos[1]];
    const u1: Vec2 = [body.vel[0], body.vel[1]];
    // the cubic Hermite curve through (p0, u0) and (p1, u1), at the middle of the step
    const pm: Vec2 = add(scale(add(p0, p1), 0.5), scale(sub(u0, u1), dt / 8));
    const um: Vec2 = sub(scale(sub(p1, p0), 1.5 / dt), scale(add(u0, u1), 0.25));
    W += (dt / 6) * (power(p0, u0) + 4 * power(pm, um) + power(p1, u1));
    const sample = { t: (i + 1) * dt, pos: p1, vel: u1, W, K: kinetic(m, u1) };
    out.push(sample);
    if (!keep(sample)) break;
  }
  return out;
}
