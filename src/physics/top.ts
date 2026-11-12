/**
 * Lesson 8.8: angular momentum that is not parallel to the angular velocity, principal axes, and the heavy symmetric
 * top. Builds on the shared rigid body (`rigidbody.ts`: `inertiaTensor`, `applyTensor`, `principalAxes`,
 * `precessionRate`, `steadyPrecession`); what is here is only what lesson 8.8's figure and scripts need beyond it:
 * the tilted dumbbell on a vertical axle, the 2 × 2 principal-axis problem, and the full motion of a heavy symmetric
 * top (precession with nutation) integrated by RK4.
 *
 * MODEL SPECIFICATION
 * - System: (1) a rigid set of point masses that turns at a constant angular velocity ω about a fixed axle through a
 *   fixed point O; the tilted dumbbell is two masses m at ±r û, with û at the angle θ from the axle. (2) A heavy
 *   symmetric top or gyroscope: a rigid body symmetric about its axis ê₃, of mass M, its tip held at a fixed pivot
 *   P (it may turn about P freely), its centre of mass a distance d from P along ê₃; I₃ is its moment of inertia
 *   about ê₃ and I₁ about any axis through P perpendicular to ê₃.
 * - Frame: inertial; z up, O or P at the origin. The axis of the top is ê₃ = (sin θ cos φ, sin θ sin φ, cos θ):
 *   θ from the upward vertical, φ its azimuth, counter-clockwise seen from above (about +z). The spin ω₃ is the
 *   component of the angular velocity along ê₃.
 * - Dynamics: (1) every point moves at v = ω × r, so L_O = Σ m r × (ω × r) = I ω with I the inertia tensor about O;
 *   at constant ω the vector L_O turns with the body, and the axle must supply the torque τ_O = dL_O/dt = ω × L_O.
 *   (2) dL_P/dt = τ_P = r_cm × M g, about the pivot P. That torque has no z component and no component along ê₃, so
 *   L_z and the spin ω₃ stay constant, and so does the energy E = ½ I₁ (θ̇² + φ̇² sin²θ) + ½ I₃ ω₃² + M g d cos θ.
 *   With L_z = I₁ φ̇ sin²θ + I₃ ω₃ cos θ fixed by the start, φ̇ = (L_z − I₃ ω₃ cos θ)/(I₁ sin²θ) and
 *   I₁ θ̈ = I₁ φ̇² sin θ cos θ − I₃ ω₃ φ̇ sin θ + M g d sin θ, integrated by RK4 in (θ, θ̇, φ). The angular momentum
 *   about P is L = I₁ (θ̇ φ̂ + φ̇ ẑ − φ̇ cos θ ê₃) + I₃ ω₃ ê₃. The pivot pushes on the top with F = M a_cm − M g.
 *   The fast-top limit (I₃ ω₃ ≫ √(I₁ M g d)): the axis precesses at Ω = M g d/(I₃ ω₃), nodding (nutation) at about
 *   I₃ ω₃/I₁ through a dip of about 2 I₁ M g d sin θ₀/(I₃ ω₃)² when it is let go with no precession.
 * - Boundary: θ(0) = θ₀, θ̇(0) = 0, φ(0) = φ₀, φ̇(0) = φ̇₀ (0 for a top let go without precession; the slow root of
 *   `steadyPrecession` for steady precession), ω₃ given.
 * - Ignored: friction at the pivot and in the bearings (the spin never slows), air, the stand's give; the pivot does
 *   not slide.
 * - Valid when: the body is rigid and symmetric about ê₃ (I₁ = I₂ about P); 0 < θ < π along the whole motion.
 * - Failure modes: as sin θ → 0 the equation for φ̇ divides by zero: `integrateTop` stops (and marks the state
 *   `fallen`) when θ leaves [THETA_MIN, THETA_MAX], which is also how a top with no spin "falls". The step dt must
 *   resolve the nutation, period ≈ 2π I₁/(I₃ ω₃); `integrateTop` takes its substeps from that.
 */

import { G } from './constants';
import { applyTensor, disc, discDiameter, inertiaTensor, parallelAxis, steadyPrecession, type PointMass } from './rigidbody';
import { cross3, dot3, len3, type Vec3 } from './vec';

// ---------------------------------------------------------------- the bodies of figure 8.8 (TopLab)

/** Figure 8.8א: two masses m on a light rod, each r from the centre; bearings ±H along the axle from the centre. */
export const LAB_DUMBBELL = { m: 0.3, r: 0.25, H: 0.3 } as const;
/** Figure 8.8ב: a disc rotor of mass M and radius R on a light axle, its centre d from the pivot. */
export const LAB_GYRO = { M: 0.2, R: 0.035, d: 0.045 } as const;

// ---------------------------------------------------------------- L = I ω for point masses

/** L = Σ m r × (ω × r), summed directly (the definition), about the origin. */
export function angularMomentumDirect(points: readonly PointMass[], omega: Vec3): Vec3 {
  let L: Vec3 = [0, 0, 0];
  for (const { m, r } of points) {
    const v = cross3(omega, r);
    const l = cross3(r, v);
    L = [L[0] + m * l[0], L[1] + m * l[1], L[2] + m * l[2]];
  }
  return L;
}

/** L = I ω through the inertia tensor about the origin (the same vector as `angularMomentumDirect`). */
export const angularMomentum = (points: readonly PointMass[], omega: Vec3): Vec3 => applyTensor(inertiaTensor(points), omega);

/** The tilted dumbbell: masses m at ±r û, û at the angle θ from +z and at the azimuth φ. */
export function dumbbellPoints(m: number, r: number, theta: number, phi = 0): PointMass[] {
  const u: Vec3 = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
  return [
    { m, r: [r * u[0], r * u[1], r * u[2]] },
    { m, r: [-r * u[0], -r * u[1], -r * u[2]] },
  ];
}

/** The part of v along the unit axis n, and the part perpendicular to it (its length). */
export function splitAlong(v: Vec3, n: Vec3): { along: number; perp: number } {
  const along = dot3(v, n);
  const p: Vec3 = [v[0] - along * n[0], v[1] - along * n[1], v[2] - along * n[2]];
  return { along, perp: len3(p) };
}

/** Angle between two vectors [rad]; 0 when either is zero. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const la = len3(a);
  const lb = len3(b);
  if (la === 0 || lb === 0) return 0;
  return Math.atan2(len3(cross3(a, b)), dot3(a, b));
}

/**
 * The tilted dumbbell turning at ω about the vertical axle through its centre, rod at θ from the axle:
 * |L| = 2 m r² ω sin θ, perpendicular to the rod in the plane of the rod and the axle; L_z = |L| sin θ along the
 * axle, L_⊥ = |L| cos θ across it, turning with the body; the axle must supply τ = ω L_⊥ (as a couple of the two
 * bearings); the angle between L and ω is 90° − θ (undefined at θ = 0, where L = 0).
 */
export function dumbbell(m: number, r: number, theta: number, omega: number) {
  const L = 2 * m * r * r * omega * Math.sin(theta);
  const Lz = L * Math.sin(theta);
  const Lperp = L * Math.cos(theta);
  return { L, Lz, Lperp, tau: omega * Lperp, angle: Math.PI / 2 - theta };
}

/** The bearing torque at constant ω: τ = ω × L (the rate of change of a vector that turns with the body). */
export const bearingTorque = (omega: Vec3, L: Vec3): Vec3 => cross3(omega, L);

/** Two bearings a distance D apart along the axle supply the torque τ (perpendicular to the axle) as a couple: F = τ/D each. */
export const bearingForce = (tau: number, D: number) => tau / D;

/**
 * Principal axes of the symmetric 2 × 2 block [[a, b], [b, c]] (one principal axis already known by symmetry):
 * the moments are (a + c)/2 ± √(((a − c)/2)² + b²); the axis of `l1` makes the angle α with the first axis,
 * tan 2α = 2b/(a − c). Returns l1 the smaller moment, l2 the larger, and α of l1's axis in (−π/2, π/2].
 */
export function principal2(a: number, b: number, c: number) {
  const mean = (a + c) / 2;
  const rad = Math.hypot((a - c) / 2, b);
  const l1 = mean - rad;
  const l2 = mean + rad;
  // the eigenvector of l1: (b, l1 − a) or (l1 − c, b), whichever is the longer (both are, unless b = 0)
  const v1: [number, number] = Math.abs(b) > 1e-300 ? (Math.abs(l1 - a) >= Math.abs(l1 - c) ? [b, l1 - a] : [l1 - c, b]) : a <= c ? [1, 0] : [0, 1];
  let alpha = Math.atan2(v1[1], v1[0]);
  if (alpha <= -Math.PI / 2) alpha += Math.PI;
  if (alpha > Math.PI / 2) alpha -= Math.PI;
  return { l1, l2, alpha };
}

// ---------------------------------------------------------------- the heavy symmetric top

export interface Top {
  /** mass [kg] */
  M: number;
  /** pivot to centre of mass, along the axis [m] */
  d: number;
  /** moment of inertia about any axis through the pivot perpendicular to the symmetry axis [kg·m²] */
  I1: number;
  /** moment of inertia about the symmetry axis [kg·m²] */
  I3: number;
  g?: number;
}

/**
 * A uniform disc rotor (M, R) on a light axle, its centre d from the pivot: I₃ = ½MR² about the axle, and
 * I₁ = ¼MR² + Md² about a perpendicular axis through the pivot (perpendicular-axis, then parallel-axis theorem).
 */
export const discTop = (M: number, R: number, d: number, g?: number): Top => ({
  M,
  d,
  I3: disc(M, R),
  I1: parallelAxis(discDiameter(M, R), M, d),
  ...(g === undefined ? {} : { g }),
});

/** The two constants of the motion that the start fixes: the spin ω₃ and L_z (about the vertical through P). */
export interface TopConstants {
  omega3: number;
  Lz: number;
}

export interface TopState {
  t: number;
  theta: number;
  thetaDot: number;
  phi: number;
  /** the axis left [THETA_MIN, THETA_MAX]: the top fell (or went through the vertical) */
  fallen?: boolean;
}

/** The integration stops outside these axis angles (sin θ → 0 at the vertical; a top past 0.85π lies on its stand). */
export const THETA_MIN = 0.02;
export const THETA_MAX = 0.85 * Math.PI;

const gOf = (top: Top) => top.g ?? G;

/** The constants of a top started at θ₀ with azimuthal rate φ̇₀ (and θ̇₀ = 0). */
export const topConstants = (top: Top, omega3: number, theta0: number, phiDot0: number): TopConstants => ({
  omega3,
  Lz: top.I1 * phiDot0 * Math.sin(theta0) ** 2 + top.I3 * omega3 * Math.cos(theta0),
});

/** φ̇ = (L_z − I₃ ω₃ cos θ)/(I₁ sin²θ). */
export const phiDotOf = (top: Top, c: TopConstants, theta: number) =>
  (c.Lz - top.I3 * c.omega3 * Math.cos(theta)) / (top.I1 * Math.sin(theta) ** 2);

/** θ̈ from I₁ θ̈ = I₁ φ̇² sin θ cos θ − I₃ ω₃ φ̇ sin θ + M g d sin θ. */
export function thetaAccel(top: Top, c: TopConstants, theta: number): number {
  const pd = phiDotOf(top, c, theta);
  const s = Math.sin(theta);
  return (top.I1 * pd * pd * s * Math.cos(theta) - top.I3 * c.omega3 * pd * s + top.M * gOf(top) * top.d * s) / top.I1;
}

/** One RK4 step of (θ, θ̇, φ). */
export function topStep(top: Top, c: TopConstants, s: TopState, dt: number): TopState {
  const f = (th: number, thd: number): [number, number, number] => [thd, thetaAccel(top, c, th), phiDotOf(top, c, th)];
  const k1 = f(s.theta, s.thetaDot);
  const k2 = f(s.theta + 0.5 * dt * k1[0], s.thetaDot + 0.5 * dt * k1[1]);
  const k3 = f(s.theta + 0.5 * dt * k2[0], s.thetaDot + 0.5 * dt * k2[1]);
  const k4 = f(s.theta + dt * k3[0], s.thetaDot + dt * k3[1]);
  const w = (i: number) => (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return { t: s.t + dt, theta: s.theta + w(0), thetaDot: s.thetaDot + w(1), phi: s.phi + w(2) };
}

/** The nutation of a fast top let go with no precession: frequency ≈ I₃ω₃/I₁, dip ≈ 2 I₁ M g d sin θ₀/(I₃ω₃)². */
export function nutationEstimate(top: Top, omega3: number, theta0: number) {
  const L3 = top.I3 * omega3;
  return { frequency: L3 / top.I1, dip: (2 * top.I1 * top.M * gOf(top) * top.d * Math.sin(theta0)) / (L3 * L3) };
}

/**
 * Samples of the motion at t = i T/n, i = 0 … n, from θ₀ (θ̇₀ = 0), φ₀ = 0 and φ̇₀. Each interval is cut into enough
 * RK4 substeps to resolve the nutation (≥ 40 per nutation period and ≥ `minSub`). After the top falls, the last
 * state repeats, marked `fallen`.
 */
export function integrateTop(top: Top, omega3: number, theta0: number, phiDot0: number, T: number, n: number, minSub = 4): { c: TopConstants; samples: TopState[] } {
  const c = topConstants(top, omega3, theta0, phiDot0);
  const h = T / n;
  // the fastest rate in the motion: the nutation, or the fall of a slow top √(M g d/I₁)
  const rate = Math.max(Math.abs(top.I3 * omega3) / top.I1, Math.sqrt((top.M * gOf(top) * top.d) / top.I1), Math.abs(phiDot0), 1e-6);
  const sub = Math.max(minSub, Math.ceil((h * rate * 40) / (2 * Math.PI)));
  let s: TopState = { t: 0, theta: theta0, thetaDot: 0, phi: 0 };
  const samples: TopState[] = [s];
  for (let i = 1; i <= n; i++) {
    if (!s.fallen) {
      for (let k = 0; k < sub; k++) {
        const next = topStep(top, c, s, h / sub);
        if (!(next.theta > THETA_MIN && next.theta < THETA_MAX) || !Number.isFinite(next.theta)) {
          s = { ...s, fallen: true };
          break;
        }
        s = next;
      }
      s = s.fallen ? s : { ...s, t: i * h };
    }
    samples.push(s.fallen ? { ...s, t: i * h } : s);
  }
  return { c, samples };
}

/** The axis ê₃ = (sin θ cos φ, sin θ sin φ, cos θ). */
export const topAxis = (s: { theta: number; phi: number }): Vec3 => [
  Math.sin(s.theta) * Math.cos(s.phi),
  Math.sin(s.theta) * Math.sin(s.phi),
  Math.cos(s.theta),
];

/** The centre of mass, d along the axis from the pivot. */
export const topCM = (top: Top, s: { theta: number; phi: number }): Vec3 => {
  const e = topAxis(s);
  return [top.d * e[0], top.d * e[1], top.d * e[2]];
};

/** The torque of gravity about the pivot: r_cm × (−M g ẑ), horizontal, of size M g d sin θ. */
export function topTorque(top: Top, s: { theta: number; phi: number }): Vec3 {
  return cross3(topCM(top, s), [0, 0, -top.M * gOf(top)]);
}

/** The angular momentum about the pivot: L = I₁ (θ̇ φ̂ + φ̇ ẑ − φ̇ cos θ ê₃) + I₃ ω₃ ê₃. */
export function topL(top: Top, c: TopConstants, s: TopState): Vec3 {
  const e = topAxis(s);
  const pd = phiDotOf(top, c, s.theta);
  const ph: Vec3 = [-Math.sin(s.phi), Math.cos(s.phi), 0];
  const k = top.I1;
  const a = top.I3 * c.omega3 - k * pd * Math.cos(s.theta);
  return [k * s.thetaDot * ph[0] + a * e[0], k * s.thetaDot * ph[1] + a * e[1], k * pd + a * e[2]];
}

/** The mechanical energy ½ I₁ (θ̇² + φ̇² sin²θ) + ½ I₃ ω₃² + M g d cos θ. */
export function topEnergy(top: Top, c: TopConstants, s: TopState): number {
  const pd = phiDotOf(top, c, s.theta);
  return 0.5 * top.I1 * (s.thetaDot ** 2 + pd * pd * Math.sin(s.theta) ** 2) + 0.5 * top.I3 * c.omega3 ** 2 + top.M * gOf(top) * top.d * Math.cos(s.theta);
}

/**
 * The force the pivot exerts on the top: F = M a_cm + M g ẑ (Newton's second law for the CM). With ê_θ = ∂ê₃/∂θ and
 * φ̂ the azimuthal unit vector, a_cm/d = (θ̈ − φ̇² sin θ cos θ) ê_θ − (θ̇² + φ̇² sin²θ) ê₃ + (φ̈ sin θ + 2 θ̇ φ̇ cos θ) φ̂,
 * with φ̈ = θ̇ (I₃ ω₃ − 2 I₁ φ̇ cos θ)/(I₁ sin θ).
 */
export function pivotForce(top: Top, c: TopConstants, s: TopState): Vec3 {
  const { theta: th, thetaDot: thd, phi } = s;
  const pd = phiDotOf(top, c, th);
  const tdd = thetaAccel(top, c, th);
  const pdd = (thd * (top.I3 * c.omega3 - 2 * top.I1 * pd * Math.cos(th))) / (top.I1 * Math.sin(th));
  const e3 = topAxis(s);
  const eth: Vec3 = [Math.cos(th) * Math.cos(phi), Math.cos(th) * Math.sin(phi), -Math.sin(th)];
  const eph: Vec3 = [-Math.sin(phi), Math.cos(phi), 0];
  const A = tdd - pd * pd * Math.sin(th) * Math.cos(th);
  const B = -(thd * thd + pd * pd * Math.sin(th) ** 2);
  const C = pdd * Math.sin(th) + 2 * thd * pd * Math.cos(th);
  const Md = top.M * top.d;
  return [
    Md * (A * eth[0] + B * e3[0] + C * eph[0]),
    Md * (A * eth[1] + B * e3[1] + C * eph[1]),
    Md * (A * eth[2] + B * e3[2] + C * eph[2]) + top.M * gOf(top),
  ];
}

/**
 * The precession rate of steady precession at θ: the slow root of I₁ cos θ Ω² − I₃ ω₃ Ω + M g d = 0 (the one of
 * smaller size), or null. `steadyPrecession` returns [slow, fast] at every tilt (below the horizontal the fast root is
 * negative); picking the root of smaller size here is a guard that agrees with its first entry (checked at 30°–150°,
 * ω₃ = 80–400 rad/s).
 */
export function steadyRate(top: Top, omega3: number, theta: number): number | null {
  const r = steadyPrecession(top.M, top.d, top.I1, top.I3, omega3, theta, gOf(top));
  if (!r) return null;
  return Math.abs(r[0]) <= Math.abs(r[1]) ? r[0] : r[1];
}
