/**
 * Coordinates and the gradient (lesson 0.7): plane polar (r, θ), cylindrical (s, φ, z) and spherical
 * (r, θ, φ) coordinates, their unit vectors and how those turn, the line, area and volume elements, mass
 * integrals over thin shells, and the gradient of a scalar field in the plane with its level curves.
 * The figures CoordinateLab and GradientMap draw these; the lesson's worked examples and workbook
 * recompute with them.
 *
 * MODEL SPECIFICATION
 * - System: points of the plane and of space. Plane polar: x = r cos θ, y = r sin θ, θ counter-clockwise
 *   from +x. Cylindrical: x = s cos φ, y = s sin φ, z. Spherical: x = r sin θ cos φ, y = r sin θ sin φ,
 *   z = r cos θ, with θ ∈ [0, π] measured from +z and φ counter-clockwise from +x in the xy plane.
 *   A scalar field f(x, y) of the plane (a height in m, an energy in J), with its gradient
 *   ∇f = (∂f/∂x, ∂f/∂y).
 * - Dynamics: none; geometry and calculus. The plane polar unit vectors r̂ = (cos θ, sin θ),
 *   θ̂ = (−sin θ, cos θ) obey dr̂/dθ = θ̂ and dθ̂/dθ = −r̂, so along a motion dr̂/dt = θ̇ θ̂, dθ̂/dt = −θ̇ r̂.
 *   Line elements: dℓ = dr r̂ + r dθ θ̂ (polar), ds ŝ + s dφ φ̂ + dz ẑ (cylindrical),
 *   dr r̂ + r dθ θ̂ + r sin θ dφ φ̂ (spherical). Hence dA = r dr dθ, dV = s ds dφ dz, dV = r² sin θ dr dθ dφ,
 *   and for a quantity that depends on one coordinate only: a ring 2πr dr, a cylindrical shell 2πsL ds,
 *   a spherical shell 4πr² dr. The directional derivative along a unit vector ŝ is ∇f·ŝ: largest
 *   (= |∇f|) along ∇f, zero along the level curve, so ∇f is perpendicular to the level curves.
 *   In polar components ∇f = (∂f/∂r) r̂ + (1/r)(∂f/∂θ) θ̂.
 * - Boundary: the exact area of a finite polar patch (r…r+dr, θ…θ+dθ) is ½((r+dr)² − r²)dθ; the exact
 *   volume of a finite spherical patch is ⅓((r+dr)³ − r³)(cos θ − cos(θ+dθ))dφ. These are what the
 *   elements approximate, with a relative error of first order in dr/r and dθ.
 * - Ignored: curvature of space (Euclidean only); fields that are not smooth (a cusp, a cliff).
 * - Valid when: r > 0 (s > 0) for the polar (cylindrical) unit vectors, 0 < θ < π for the spherical ones;
 *   a field is differentiable at the point where its gradient is taken.
 * - Failure modes: at r = 0, on the z axis (s = 0, sin θ = 0), the angle φ and the unit vectors θ̂, φ̂
 *   are undefined: the functions still return the vectors of the angles they are given. The numerical
 *   gradient is a central difference, O(h²); below h ≈ 1e-6 of the length scale rounding dominates.
 *   `simpson` needs an even n and a smooth integrand; its error is O(h⁴). `toPolar` returns θ in (−π, π].
 */

import { polarBasis } from './polar';
import { cross3, dot, len, norm, type Vec2, type Vec3 } from './vec';

export { polarBasis };
export type { Vec2, Vec3 };

/* ------------------------------------------------------------------ plane polar */

/** Cartesian point of the polar coordinates (r, θ). */
export const fromPolar = (r: number, theta: number): Vec2 => [r * Math.cos(theta), r * Math.sin(theta)];

/** Polar coordinates of a point; θ in (−π, π], taken with atan2 so the quadrant is right. */
export function toPolar(p: Vec2): { r: number; theta: number } {
  return { r: Math.hypot(p[0], p[1]), theta: Math.atan2(p[1], p[0]) };
}

/** θ in degrees, in [0, 360). */
export const degrees360 = (theta: number): number => {
  const d = (theta * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
};

/** dr̂/dθ = θ̂ and dθ̂/dθ = −r̂: how the polar unit vectors turn with θ. */
export function polarBasisDerivatives(theta: number): { dRhat: Vec2; dThetaHat: Vec2 } {
  const { rHat, thetaHat } = polarBasis(theta);
  return { dRhat: thetaHat, dThetaHat: [-rHat[0], -rHat[1]] };
}

/** The polar components (A_r, A_θ) of a vector A at angle θ: A·r̂ and A·θ̂. */
export function polarComponents(a: Vec2, theta: number): { ar: number; ath: number } {
  const { rHat, thetaHat } = polarBasis(theta);
  return { ar: dot(a, rHat), ath: dot(a, thetaHat) };
}

/** Exact area of the polar patch r…r+dr, θ…θ+dθ. */
export const polarPatchArea = (r: number, dr: number, dth: number): number => 0.5 * ((r + dr) ** 2 - r * r) * dth;

/** The area element r dr dθ (the patch area to first order). */
export const polarAreaElement = (r: number, dr: number, dth: number): number => r * dr * dth;

/** Exact area of the ring r…r+dr, and its element 2πr dr. */
export const ringArea = (r: number, dr: number): number => Math.PI * ((r + dr) ** 2 - r * r);
export const ringAreaElement = (r: number, dr: number): number => 2 * Math.PI * r * dr;

/* ------------------------------------------------------------------ cylindrical */

export const fromCylindrical = (s: number, phi: number, z: number): Vec3 => [s * Math.cos(phi), s * Math.sin(phi), z];

export function toCylindrical(p: Vec3): { s: number; phi: number; z: number } {
  return { s: Math.hypot(p[0], p[1]), phi: Math.atan2(p[1], p[0]), z: p[2] };
}

/** ŝ, φ̂, ẑ at azimuth φ. */
export function cylindricalBasis(phi: number): { sHat: Vec3; phiHat: Vec3; zHat: Vec3 } {
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  return { sHat: [c, sn, 0], phiHat: [-sn, c, 0], zHat: [0, 0, 1] };
}

/** Edge lengths of the cylindrical element (ds, s dφ, dz) and the element s ds dφ dz. */
export const cylindricalElement = (s: number, ds: number, dphi: number, dz: number) => ({
  edges: [ds, s * dphi, dz] as Vec3,
  dV: s * ds * dphi * dz,
});

/* ------------------------------------------------------------------ spherical */

export const fromSpherical = (r: number, theta: number, phi: number): Vec3 => [
  r * Math.sin(theta) * Math.cos(phi),
  r * Math.sin(theta) * Math.sin(phi),
  r * Math.cos(theta),
];

export function toSpherical(p: Vec3): { r: number; theta: number; phi: number } {
  const r = Math.hypot(p[0], p[1], p[2]);
  return { r, theta: r === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, p[2] / r))), phi: Math.atan2(p[1], p[0]) };
}

/** r̂, θ̂, φ̂ at (θ, φ): r̂ outward, θ̂ toward growing θ (southward), φ̂ toward growing φ (eastward). */
export function sphericalBasis(theta: number, phi: number): { rHat: Vec3; thetaHat: Vec3; phiHat: Vec3 } {
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  return {
    rHat: [st * cp, st * sp, ct],
    thetaHat: [ct * cp, ct * sp, -st],
    phiHat: [-sp, cp, 0],
  };
}

/** Edge lengths of the spherical element (dr, r dθ, r sin θ dφ) and the element r² sin θ dr dθ dφ. */
export const sphericalElement = (r: number, theta: number, dr: number, dth: number, dphi: number) => ({
  edges: [dr, r * dth, r * Math.sin(theta) * dphi] as Vec3,
  dV: r * r * Math.sin(theta) * dr * dth * dphi,
});

/** Exact volume of the spherical patch r…r+dr, θ…θ+dθ, φ…φ+dφ. */
export const sphericalPatchVolume = (r: number, theta: number, dr: number, dth: number, dphi: number): number =>
  (((r + dr) ** 3 - r ** 3) / 3) * (Math.cos(theta) - Math.cos(theta + dth)) * dphi;

/** Right-handedness check helper: r̂ × θ̂ (should be φ̂). */
export const sphericalCross = (theta: number, phi: number): Vec3 => {
  const b = sphericalBasis(theta, phi);
  return cross3(b.rHat, b.thetaHat);
};

/* ------------------------------------------------------------------ integrals over shells */

/** Composite Simpson rule on [a, b] with n (even) intervals. */
export function simpson(f: (x: number) => number, a: number, b: number, n = 200): number {
  const m = n % 2 === 0 ? n : n + 1;
  const h = (b - a) / m;
  let s = f(a) + f(b);
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/** Mass of a flat disc of radius R with surface density σ(r), from rings: ∫ σ(r) 2πr dr. */
export const discMass = (sigma: (r: number) => number, R: number, n = 400): number =>
  simpson((r) => sigma(r) * 2 * Math.PI * r, 0, R, n);

/** Mass of a cylinder of radius R and length L with density ρ(s), from cylindrical shells: ∫ ρ(s) 2πsL ds. */
export const cylinderMass = (rho: (s: number) => number, R: number, L: number, n = 400): number =>
  simpson((s) => rho(s) * 2 * Math.PI * s * L, 0, R, n);

/** Mass of a ball of radius R with density ρ(r), from spherical shells: ∫ ρ(r) 4πr² dr. */
export const ballMass = (rho: (r: number) => number, R: number, n = 400): number =>
  simpson((r) => rho(r) * 4 * Math.PI * r * r, 0, R, n);

/** Mass between radii a and b of a spherically symmetric density, from shells. */
export const shellMass = (rho: (r: number) => number, a: number, b: number, n = 2000): number =>
  simpson((r) => rho(r) * 4 * Math.PI * r * r, a, b, n);

/** Area of the cap θ ≤ α on a sphere of radius R: ∫∫ R² sin θ dθ dφ = 2πR²(1 − cos α). */
export const capArea = (R: number, alpha: number): number => 2 * Math.PI * R * R * (1 - Math.cos(alpha));

/* ------------------------------------------------------------------ the gradient in the plane */

export type Field2 = (x: number, y: number) => number;

/** Central-difference gradient (∂f/∂x, ∂f/∂y) at p. */
export function numericGradient(f: Field2, p: Vec2, h = 1e-5): Vec2 {
  const [x, y] = p;
  return [(f(x + h, y) - f(x - h, y)) / (2 * h), (f(x, y + h) - f(x, y - h)) / (2 * h)];
}

/** The rate of change of f per unit length along the direction `dir` (normalised here): ∇f·ŝ. */
export const directionalDerivative = (grad: Vec2, dir: Vec2): number => dot(grad, norm(dir));

/** Unit vector at angle α from +x. */
export const unitAt = (alpha: number): Vec2 => [Math.cos(alpha), Math.sin(alpha)];

/** The direction along the level curve through a point: ∇f turned by +90°. Zero where ∇f = 0. */
export function levelTangent(grad: Vec2): Vec2 {
  const g = len(grad);
  return g === 0 ? [0, 0] : [-grad[1] / g, grad[0] / g];
}

/** Polar components of a gradient at (r, θ) from the partial derivatives in r and θ: (∂f/∂r, (1/r)∂f/∂θ). */
export function polarGradient(fPolar: (r: number, th: number) => number, r: number, th: number, h = 1e-6): { gr: number; gth: number } {
  const dr = (fPolar(r + h, th) - fPolar(r - h, th)) / (2 * h);
  const dth = (fPolar(r, th + h) - fPolar(r, th - h)) / (2 * h);
  return { gr: dr, gth: dth / r };
}

export interface FieldSpec {
  /** f(x, y), x and y in m */
  f: Field2;
  /** the analytic gradient */
  grad: (x: number, y: number) => Vec2;
  /** a top (or bottom) the reader may think the gradient points at, if any */
  summit?: Vec2;
  /** unit of f and of its gradient (per metre) */
  unit: string;
  gradUnit: string;
  /** level spacing of the drawn map */
  step: number;
}

export type FieldName = 'ramp' | 'bowl' | 'hill';

/** Parameters of the figure's fields (stated in its caption). */
export const FIELD_PARAMS = {
  ramp: { a: 0.2, b: 0.1 },
  bowl: { k: 2.0 },
  hill: { H: 1.0, a: 2.0, b: 1.0 },
} as const;

export const FIELDS: Record<FieldName, FieldSpec> = {
  // a uniform slope h = a x + b y (m): straight, parallel, equally spaced level lines
  ramp: {
    f: (x, y) => FIELD_PARAMS.ramp.a * x + FIELD_PARAMS.ramp.b * y,
    grad: () => [FIELD_PARAMS.ramp.a, FIELD_PARAMS.ramp.b],
    unit: 'm',
    gradUnit: 'm/m',
    step: 0.1,
  },
  // the energy of a particle on two equal springs, U = ½k(x² + y²) (J): circles, ∇U radial
  bowl: {
    f: (x, y) => 0.5 * FIELD_PARAMS.bowl.k * (x * x + y * y),
    grad: (x, y) => [FIELD_PARAMS.bowl.k * x, FIELD_PARAMS.bowl.k * y],
    summit: [0, 0],
    unit: 'J',
    gradUnit: 'J/m',
    step: 1,
  },
  // an elongated hill h = H exp(−x²/a² − y²/b²) (m): ∇h points at the top only on the two axes
  hill: {
    f: (x, y) => {
      const { H, a, b } = FIELD_PARAMS.hill;
      return H * Math.exp(-(x * x) / (a * a) - (y * y) / (b * b));
    },
    grad: (x, y) => {
      const { H, a, b } = FIELD_PARAMS.hill;
      const h = H * Math.exp(-(x * x) / (a * a) - (y * y) / (b * b));
      return [(-2 * x * h) / (a * a), (-2 * y * h) / (b * b)];
    },
    summit: [0, 0],
    unit: 'm',
    gradUnit: 'm/m',
    step: 0.1,
  },
};

/** Angle (rad, 0…π) between two nonzero vectors. */
export function angleBetween(a: Vec2, b: Vec2): number {
  const la = len(a);
  const lb = len(b);
  if (la === 0 || lb === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb))));
}

/**
 * The path of steepest ascent (sign +1) or descent (−1) from p0: a curve that follows ∇f, integrated by
 * RK4 in arc length with step ds. It stops where |∇f| is tiny (a top), after maxSteps, or outside `box`.
 */
export function gradientPath(spec: FieldSpec, p0: Vec2, ds: number, maxSteps: number, sign = 1, box = 3): Vec2[] {
  const dir = (p: Vec2): Vec2 | null => {
    const g = spec.grad(p[0], p[1]);
    const L = len(g);
    return L < 1e-6 ? null : [(sign * g[0]) / L, (sign * g[1]) / L];
  };
  const pts: Vec2[] = [p0];
  let p = p0;
  for (let i = 0; i < maxSteps; i++) {
    const k1 = dir(p);
    if (!k1) break;
    const k2 = dir([p[0] + 0.5 * ds * k1[0], p[1] + 0.5 * ds * k1[1]]);
    if (!k2) break;
    const k3 = dir([p[0] + 0.5 * ds * k2[0], p[1] + 0.5 * ds * k2[1]]);
    if (!k3) break;
    const k4 = dir([p[0] + ds * k3[0], p[1] + ds * k3[1]]);
    if (!k4) break;
    const next: Vec2 = [
      p[0] + (ds / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      p[1] + (ds / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    ];
    // near a top the unit direction flips back and forth: stop once f stops increasing
    if (sign * (spec.f(next[0], next[1]) - spec.f(p[0], p[1])) <= 0) break;
    if (Math.abs(next[0]) > box || Math.abs(next[1]) > box) {
      pts.push(next);
      break;
    }
    pts.push(next);
    p = next;
  }
  return pts;
}
