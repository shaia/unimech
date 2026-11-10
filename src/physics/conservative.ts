/**
 * Conservative forces and potential energy (lesson 3.2): the work of a force field along a path, the closed-loop
 * test, the curl test, the potential energy built from a force by integrating from a reference point, and the force
 * recovered from a potential as minus its gradient.
 *
 * MODEL SPECIFICATION
 * - System: a force field F(r), a force that depends on the position only (not on the velocity or the time), in the
 *   plane (x, y) or in space (x, y, z), in newtons with positions in metres. A potential energy U(r) in joules.
 * - Dynamics: none; this is the geometry of fields. The work along a path r(s), s ∈ [0, 1], is the line integral
 *   W = ∫ F(r(s))·r′(s) ds. The curl in the plane is (∇×F)_z = ∂F_y/∂x − ∂F_x/∂y; in space ∇×F has three such
 *   components. The potential is U(r) = U(r₀) − ∫_{r₀}^{r} F·dr along a straight segment from the reference r₀, which
 *   is the value along any path when F is conservative. The force from a potential is F = −∇U.
 * - Boundary: a path is a parametric curve r(s) with its derivative r′(s), or a polyline of points. A closed loop
 *   ends where it starts. The reference point of U is chosen by the caller.
 * - Ignored: forces that are not fields at all (kinetic friction and drag depend on the direction of the velocity,
 *   so they have no value F(r) at a point); time-dependent fields.
 * - Valid when: F is smooth on and near the path, and U is smooth near the point. Errors: the central-difference
 *   curl and gradient are O(h²); the composite Simpson line integral is O(1/n⁴) on a smooth parametric path; the
 *   midpoint rule on a polyline is O(1/n²).
 * - Failure modes: a path through a singularity of F (the centre of an inverse-square field) gives a meaningless
 *   integral; `minDistance` lets the caller detect it. A curl that is zero everywhere except at an excluded point
 *   (the field k(−y, x)/(x² + y²)) is not enough for path independence around that point: the curl test needs a
 *   region without holes. h below ~1e-6·|r| loses digits to cancellation.
 */

import type { Vec2, Vec3 } from './vec';

export type Field2 = (x: number, y: number) => Vec2;
export type Field3 = (x: number, y: number, z: number) => Vec3;
export type Scalar2 = (x: number, y: number) => number;
export type Scalar3 = (x: number, y: number, z: number) => number;

/** A parametric path r(s), s ∈ [0, 1], with its derivative dr/ds. */
export interface Path2 {
  r: (s: number) => Vec2;
  dr: (s: number) => Vec2;
}
export interface Path3 {
  r: (s: number) => Vec3;
  dr: (s: number) => Vec3;
}

/* ------------------------------------------------------------------ derivatives */

/** Default step for central differences: small against the length scale |r| (or 1 m). */
const step = (...xs: number[]) => 1e-5 * Math.max(1, ...xs.map(Math.abs));

/** (∇×F)_z = ∂F_y/∂x − ∂F_x/∂y at (x, y), by central differences, error O(h²). */
export function curlZ(F: Field2, x: number, y: number, h = step(x, y)): number {
  const dFydx = (F(x + h, y)[1] - F(x - h, y)[1]) / (2 * h);
  const dFxdy = (F(x, y + h)[0] - F(x, y - h)[0]) / (2 * h);
  return dFydx - dFxdy;
}

/** ∇×F in space at (x, y, z), by central differences, error O(h²). */
export function curl3(F: Field3, x: number, y: number, z: number, h = step(x, y, z)): Vec3 {
  const d = (i: 0 | 1 | 2, axis: 0 | 1 | 2) => {
    const p: [number, number, number] = [x, y, z];
    const m: [number, number, number] = [x, y, z];
    p[axis] += h;
    m[axis] -= h;
    return (F(...p)[i] - F(...m)[i]) / (2 * h);
  };
  return [d(2, 1) - d(1, 2), d(0, 2) - d(2, 0), d(1, 0) - d(0, 1)];
}

/** ∇U at (x, y), by central differences, error O(h²). */
export function gradient(U: Scalar2, x: number, y: number, h = step(x, y)): Vec2 {
  return [(U(x + h, y) - U(x - h, y)) / (2 * h), (U(x, y + h) - U(x, y - h)) / (2 * h)];
}

/** ∇U at (x, y, z), by central differences, error O(h²). */
export function gradient3(U: Scalar3, x: number, y: number, z: number, h = step(x, y, z)): Vec3 {
  return [
    (U(x + h, y, z) - U(x - h, y, z)) / (2 * h),
    (U(x, y + h, z) - U(x, y - h, z)) / (2 * h),
    (U(x, y, z + h) - U(x, y, z - h)) / (2 * h),
  ];
}

/** The force of a potential, F = −∇U, as a field. */
export const forceFromPotential =
  (U: Scalar2, h?: number): Field2 =>
  (x, y) => {
    const g = gradient(U, x, y, h);
    return [-g[0], -g[1]];
  };

/* ------------------------------------------------------------------ line integrals */

/** Composite Simpson over s ∈ [0, 1] with n (even) pieces, error O(1/n⁴) for a smooth integrand. */
function simpson(f: (s: number) => number, n: number): number {
  const m = n % 2 === 0 ? n : n + 1;
  const ds = 1 / m;
  let sum = f(0) + f(1);
  for (let i = 1; i < m; i++) sum += (i % 2 === 1 ? 4 : 2) * f(i * ds);
  return (sum * ds) / 3;
}

/** The work W = ∫ F·dr along a parametric path in the plane, by composite Simpson with n pieces. */
export function lineIntegral(F: Field2, path: Path2, n = 400): number {
  return simpson((s) => {
    const [x, y] = path.r(s);
    const [dx, dy] = path.dr(s);
    const [fx, fy] = F(x, y);
    return fx * dx + fy * dy;
  }, n);
}

/** The work W = ∫ F·dr along a parametric path in space, by composite Simpson with n pieces. */
export function lineIntegral3(F: Field3, path: Path3, n = 400): number {
  return simpson((s) => {
    const r = path.r(s);
    const d = path.dr(s);
    const f = F(r[0], r[1], r[2]);
    return f[0] * d[0] + f[1] * d[1] + f[2] * d[2];
  }, n);
}

/**
 * The work along a polyline of points, each segment by the midpoint rule: Σ F(midpoint)·Δr, error O(1/n²) in the
 * number of points of a sampled smooth curve. Pass `closed` to add the segment back to the start.
 */
export function polylineWork(F: Field2, pts: readonly Vec2[], closed = false): number {
  let w = 0;
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const [fx, fy] = F((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    w += fx * (b[0] - a[0]) + fy * (b[1] - a[1]);
  }
  return w;
}

/** The straight segment from a to b as a parametric path. */
export const segment = (a: Vec2, b: Vec2): Path2 => ({
  r: (s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s],
  dr: () => [b[0] - a[0], b[1] - a[1]],
});

/** The straight segment from a to b in space. */
export const segment3 = (a: Vec3, b: Vec3): Path3 => ({
  r: (s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s],
  dr: () => [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
});

/** A circle of radius R about c, once counterclockwise from the angle θ₀ (clockwise if `cw`). */
export const circle = (c: Vec2, R: number, theta0 = 0, cw = false): Path2 => {
  const k = (cw ? -1 : 1) * 2 * Math.PI;
  return {
    r: (s) => [c[0] + R * Math.cos(theta0 + k * s), c[1] + R * Math.sin(theta0 + k * s)],
    dr: (s) => [-R * k * Math.sin(theta0 + k * s), R * k * Math.cos(theta0 + k * s)],
  };
};

/** A path run backwards: the work along it is minus the work along the original. */
export const reversed = (p: Path2): Path2 => ({
  r: (s) => p.r(1 - s),
  dr: (s) => {
    const d = p.dr(1 - s);
    return [-d[0], -d[1]];
  },
});

/**
 * The quadratic Bézier from a to b whose control point sits a distance `bulge` from the chord's midpoint, along the
 * chord's left normal (counterclockwise from a→b). The curve's farthest point from the chord is bulge/2, and the
 * area between the chord and the curve is |a − b|·bulge/3.
 */
export function arcPath(a: Vec2, b: Vec2, bulge: number): Path2 {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / L;
  const ny = (b[0] - a[0]) / L;
  const c: Vec2 = [(a[0] + b[0]) / 2 + bulge * nx, (a[1] + b[1]) / 2 + bulge * ny];
  return {
    r: (s) => {
      const u = 1 - s;
      return [u * u * a[0] + 2 * u * s * c[0] + s * s * b[0], u * u * a[1] + 2 * u * s * c[1] + s * s * b[1]];
    },
    dr: (s) => [2 * (1 - s) * (c[0] - a[0]) + 2 * s * (b[0] - c[0]), 2 * (1 - s) * (c[1] - a[1]) + 2 * s * (b[1] - c[1])],
  };
}

/**
 * The cubic Bézier from a to b with its first control point `bulge` to the left of the chord's 1/3 point and its
 * second `bulge` to the right of its 2/3 point: an S symmetric under a half-turn about the chord's midpoint, so the
 * two lobes it makes with the chord have equal areas and opposite orientations.
 */
export function sPath(a: Vec2, b: Vec2, bulge: number): Path2 {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / L;
  const ny = (b[0] - a[0]) / L;
  const at = (t: number, d: number): Vec2 => [a[0] + (b[0] - a[0]) * t + d * nx, a[1] + (b[1] - a[1]) * t + d * ny];
  const p0 = a;
  const p1 = at(1 / 3, bulge);
  const p2 = at(2 / 3, -bulge);
  const p3 = b;
  return {
    r: (s) => {
      const u = 1 - s;
      const k0 = u * u * u;
      const k1 = 3 * u * u * s;
      const k2 = 3 * u * s * s;
      const k3 = s * s * s;
      return [k0 * p0[0] + k1 * p1[0] + k2 * p2[0] + k3 * p3[0], k0 * p0[1] + k1 * p1[1] + k2 * p2[1] + k3 * p3[1]];
    },
    dr: (s) => {
      const u = 1 - s;
      const d0 = 3 * u * u;
      const d1 = 6 * u * s;
      const d2 = 3 * s * s;
      return [
        d0 * (p1[0] - p0[0]) + d1 * (p2[0] - p1[0]) + d2 * (p3[0] - p2[0]),
        d0 * (p1[1] - p0[1]) + d1 * (p2[1] - p1[1]) + d2 * (p3[1] - p2[1]),
      ];
    },
  };
}

/** n + 1 points along a parametric path, for drawing and for the signed area. */
export const samplePath = (p: Path2, n = 200): Vec2[] => Array.from({ length: n + 1 }, (_, i) => p.r(i / n));

/** The signed area of a closed polyline (shoelace): positive when it runs counterclockwise. */
export function signedArea(pts: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** The smallest distance from a point to the samples of a path: detects a path through a singular centre. */
export function minDistance(p: Path2, c: Vec2, n = 400): number {
  let d = Infinity;
  for (let i = 0; i <= n; i++) {
    const r = p.r(i / n);
    d = Math.min(d, Math.hypot(r[0] - c[0], r[1] - c[1]));
  }
  return d;
}

/* ------------------------------------------------------------------ potential from a force */

/**
 * The potential energy at `point` relative to `ref`: U(point) − U(ref) = −∫_ref^point F·dr along the straight
 * segment. For a conservative field this is the value along any path.
 */
export const potentialFrom = (F: Field2, ref: Vec2, point: Vec2, n = 400): number => -lineIntegral(F, segment(ref, point), n);

/** The same in space. */
export const potentialFrom3 = (F: Field3, ref: Vec3, point: Vec3, n = 400): number => -lineIntegral3(F, segment3(ref, point), n);

/* ------------------------------------------------------------------ the fields of the lesson */

export interface FieldModel {
  F: Field2;
  /** the potential energy, for a conservative field; undefined for a field that has none */
  U?: Scalar2;
  /** a point where the field is singular (the centre of an inverse-square field) */
  singular?: Vec2;
}

/** Uniform gravity on a body of mass m: F = (0, −mg), U = mgy (U = 0 at y = 0). */
export const uniformGravity = (m: number, g: number): FieldModel => ({
  F: () => [0, -m * g],
  U: (_x, y) => m * g * y,
});

/** An isotropic spring anchored at the origin: F = −k(x, y), U = ½k(x² + y²). */
export const springField = (k: number): FieldModel => ({
  F: (x, y) => [-k * x, -k * y],
  U: (x, y) => 0.5 * k * (x * x + y * y),
});

/** An attractive inverse-square centre at the origin: F = −K r̂/r², U = −K/r (U = 0 far away). K > 0 attracts. */
export const inverseSquare = (K: number): FieldModel => ({
  F: (x, y) => {
    const r = Math.hypot(x, y);
    const r3 = r * r * r;
    return [(-K * x) / r3, (-K * y) / r3];
  },
  U: (x, y) => -K / Math.hypot(x, y),
  singular: [0, 0],
});

/** A vortex turning counterclockwise about the origin: F = k(−y, x), (∇×F)_z = 2k everywhere; no potential. */
export const vortex = (k: number): FieldModel => ({ F: (x, y) => [-k * y, k * x] });

/** A shear field: F = (ky, 0), (∇×F)_z = −k everywhere; no potential. */
export const shear = (k: number): FieldModel => ({ F: (_x, y) => [k * y, 0] });

/**
 * The field k(−y, x)/(x² + y²): its curl is zero everywhere except at the origin, where it is undefined, yet its work
 * once around the origin counterclockwise is 2πk on every loop. The counterexample that needs "a region without holes".
 */
export const pointVortex = (k: number): FieldModel => ({
  F: (x, y) => {
    const r2 = x * x + y * y;
    return [(-k * y) / r2, (k * x) / r2];
  },
  singular: [0, 0],
});
