/**
 * Vector algebra for lesson 0.2: components, magnitude and direction, the dot product (the angle
 * between two vectors and the projection of one on a direction) and the cross product (the area two
 * vectors span and its right-hand direction). The figure VectorLab draws with it; the lesson's worked
 * examples and workbook recompute with it. The plain tuple helpers stay in vec.ts.
 *
 * MODEL SPECIFICATION
 * - System: arrows in a Euclidean space of two or three dimensions, given by their Cartesian components
 *   on a right-handed set of axes x̂, ŷ, ẑ (with x̂ to the right and ŷ up the page, ẑ points out of it).
 *   A plane vector (Aₓ, A_y) is the space vector (Aₓ, A_y, 0).
 * - Dynamics: none; this is geometry. The definitions used:
 *     A·B = AB cos θ = AₓBₓ + A_yB_y + A_zB_z,
 *     A×B = (A_yB_z − A_zB_y, A_zBₓ − AₓB_z, AₓB_y − A_yBₓ),  |A×B| = AB sin θ,
 *   where θ ∈ [0, π] is the angle between A and B. In the plane only (A×B)_z = AₓB_y − A_yBₓ survives:
 *   positive is ⊙ (out of the page, the turn from A to B is counter-clockwise), negative is ⊗.
 * - Boundary: none.
 * - Ignored: units (every function works in the caller's), curvilinear bases (lesson 0.7), and any
 *   transformation law beyond rotations of the axes.
 * - Valid when: the components are finite. A direction is defined only for a nonzero vector.
 * - Failure modes: the angle of the zero vector is undefined; `toPolar` returns angle 0 for it and
 *   `angleBetween*` returns NaN when either vector is zero. arccos loses digits near 0 and π (a change
 *   δ in cos θ moves θ by δ/sin θ), so angles between vectors are computed as atan2(|A×B|, A·B),
 *   which keeps full relative accuracy at every angle.
 */

import { cross3, dot, dot3, len, len3, scale3, sub3, type Vec2, type Vec3 } from './vec';

/** The components of a plane vector of magnitude `mag` at angle `angle` [rad], counter-clockwise from +x. */
export const fromPolar = (mag: number, angle: number): Vec2 => [mag * Math.cos(angle), mag * Math.sin(angle)];

/** Magnitude and direction of a plane vector; the angle is in (−π, π], counter-clockwise from +x (atan2 picks the quadrant). */
export function toPolar(v: Vec2): { mag: number; angle: number } {
  return { mag: len(v), angle: Math.atan2(v[1], v[0]) };
}

/** A plane vector as a space vector in the plane z = 0. */
export const lift = (v: Vec2): Vec3 => [v[0], v[1], 0];

/** The z component of A×B for plane vectors: AₓB_y − A_yBₓ. Positive: ⊙, out of the page. */
export const crossZ = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

/** The angle between two space vectors, in [0, π] radians; NaN if either is zero. */
export function angleBetween3(a: Vec3, b: Vec3): number {
  if (len3(a) === 0 || len3(b) === 0) return NaN;
  return Math.atan2(len3(cross3(a, b)), dot3(a, b));
}

/** The angle between two plane vectors, in [0, π] radians; NaN if either is zero. */
export const angleBetween = (a: Vec2, b: Vec2): number => angleBetween3(lift(a), lift(b));

/** The signed turn from A to B in the plane, in (−π, π]: positive counter-clockwise (then A×B is ⊙). */
export const signedTurn = (a: Vec2, b: Vec2): number => Math.atan2(crossZ(a, b), dot(a, b));

/** The scalar projection (the component) of A along the direction of `onto`: A·û. */
export const scalarProjection3 = (a: Vec3, onto: Vec3): number => dot3(a, onto) / len3(onto);

/** The plane version of `scalarProjection3`. */
export const scalarProjection = (a: Vec2, onto: Vec2): number => dot(a, onto) / len(onto);

/** The part of A along `onto`: (A·û) û. */
export function vectorProjection3(a: Vec3, onto: Vec3): Vec3 {
  const l = len3(onto);
  return scale3(onto, dot3(a, onto) / (l * l));
}

/** The part of A perpendicular to `onto`: A − (A·û) û. */
export const perpendicularPart3 = (a: Vec3, onto: Vec3): Vec3 => sub3(a, vectorProjection3(a, onto));

/** The area of the parallelogram A and B span: |A×B|. */
export const parallelogramArea3 = (a: Vec3, b: Vec3): number => len3(cross3(a, b));

/** The area of the triangle with corners P, Q, R: ½|(Q − P)×(R − P)|. */
export const triangleArea3 = (p: Vec3, q: Vec3, r: Vec3): number => 0.5 * parallelogramArea3(sub3(q, p), sub3(r, p));

/** The scalar triple product A·(B×C): the signed volume of the box the three vectors span. */
export const tripleProduct = (a: Vec3, b: Vec3, c: Vec3): number => dot3(a, cross3(b, c));

/** |A + B| from the two magnitudes and the angle θ between the vectors: √(A² + B² + 2AB cos θ). */
export const sumMagnitude = (A: number, B: number, theta: number): number => Math.sqrt(A * A + B * B + 2 * A * B * Math.cos(theta));

/** Which way a z component points, seen from in front of the page; |z| ≤ eps counts as zero. */
export function depthOf(z: number, eps = 1e-12): 'out' | 'in' | 'none' {
  if (Math.abs(z) <= eps) return 'none';
  return z > 0 ? 'out' : 'in';
}
