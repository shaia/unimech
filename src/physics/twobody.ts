/**
 * Two bodies that attract only each other (lesson 6.2): the split into the motion of the centre of mass and the
 * relative motion with the reduced mass, and the way back from the relative orbit to the orbits of both bodies.
 * The relative orbit itself comes from the shared model `orbit.ts`, with GM → G(m₁ + m₂).
 *
 * MODEL SPECIFICATION
 * - System: two point masses m₁ at r₁ and m₂ at r₂ in a plane, isolated (no external force). The centre of mass
 *   R = (m₁r₁ + m₂r₂)/M, M = m₁ + m₂; the relative position r = r₁ − r₂ (body 1 seen from body 2, the lessons'
 *   and the bank's convention); the reduced mass μ = m₁m₂/M.
 * - Dynamics: m₁r̈₁ = F(r), m₂r̈₂ = −F(r), F the force of body 2 on body 1 along the line between them. Then
 *   M R̈ = 0 and μ r̈ = F(r); for gravity F = −Gm₁m₂ r̂/r², so r̈ = −G(m₁ + m₂) r̂/r². Back to the bodies:
 *   r₁ = R + (m₂/M) r, r₂ = R − (m₁/M) r (the same for the velocities). Energy K = ½MV² + ½μv², angular momentum
 *   about the centre of mass L = μ r × v.
 * - Boundary: the bodies' positions and velocities at one instant, or the relative orbit's elements (a, e) with the
 *   centre of mass at rest at the origin and the relative periapsis on +x at t = 0.
 * - Ignored: every other body (perturbations, tides), the bodies' size and shape (point masses, or spheres by the
 *   shell theorem), relativity (gravitational waves, precession), mass loss.
 * - Valid when: the bodies are spheres or far apart compared with their size, and speeds ≪ c.
 * - Failure modes: r → 0 (a collision) makes the force infinite; `binaryAt` covers bound orbits only (0 ≤ e < 1);
 *   `stepTwoBody` is a fixed-step RK4 and loses accuracy near a close periapsis unless dt ≪ the periapsis passage.
 */

import { ellipseAtTime, orbitalPeriod, reducedMass, type PlanarState } from './orbit';
import type { Vec2 } from './vec';

export { reducedMass };

/** Total mass M = m₁ + m₂. */
export const totalMass = (m1: number, m2: number) => m1 + m2;

/** Centre of mass of two point masses, R = (m₁r₁ + m₂r₂)/M (also the CM velocity when given velocities). */
export function centreOfMass(m1: number, r1: Vec2, m2: number, r2: Vec2): Vec2 {
  const M = m1 + m2;
  return [(m1 * r1[0] + m2 * r2[0]) / M, (m1 * r1[1] + m2 * r2[1]) / M];
}

export interface RelativeSplit {
  /** centre-of-mass position and velocity */
  R: Vec2;
  V: Vec2;
  /** relative position r = r₁ − r₂ and relative velocity v = v₁ − v₂ */
  r: Vec2;
  v: Vec2;
}

/** Split two bodies' states into the centre-of-mass motion and the relative motion. */
export function toRelative(m1: number, b1: PlanarState, m2: number, b2: PlanarState): RelativeSplit {
  return {
    R: centreOfMass(m1, b1.r, m2, b2.r),
    V: centreOfMass(m1, b1.v, m2, b2.v),
    r: [b1.r[0] - b2.r[0], b1.r[1] - b2.r[1]],
    v: [b1.v[0] - b2.v[0], b1.v[1] - b2.v[1]],
  };
}

/** Back from the split to the bodies: r₁ = R + (m₂/M) r, r₂ = R − (m₁/M) r, and the same for the velocities. */
export function fromRelative(m1: number, m2: number, s: RelativeSplit): { b1: PlanarState; b2: PlanarState } {
  const M = m1 + m2;
  const f1 = m2 / M;
  const f2 = m1 / M;
  return {
    b1: { r: [s.R[0] + f1 * s.r[0], s.R[1] + f1 * s.r[1]], v: [s.V[0] + f1 * s.v[0], s.V[1] + f1 * s.v[1]] },
    b2: { r: [s.R[0] - f2 * s.r[0], s.R[1] - f2 * s.r[1]], v: [s.V[0] - f2 * s.v[0], s.V[1] - f2 * s.v[1]] },
  };
}

/**
 * Where the centre of mass sits on the line between the bodies, d apart: d₁ = (m₂/M) d from body 1 and
 * d₂ = (m₁/M) d from body 2 (the barycentre distance), so that m₁d₁ = m₂d₂.
 */
export function barycentre(m1: number, m2: number, d: number): { d1: number; d2: number } {
  const M = m1 + m2;
  return { d1: (m2 / M) * d, d2: (m1 / M) * d };
}

/** The bodies' speeds in the centre-of-mass frame from the relative speed: v₁ = (m₂/M) v, v₂ = (m₁/M) v. */
export function bodySpeeds(m1: number, m2: number, vRel: number): { v1: number; v2: number } {
  const { d1, d2 } = barycentre(m1, m2, vRel);
  return { v1: d1, v2: d2 };
}

/** Magnitude of the relative acceleration at separation d: F/μ = G(m₁ + m₂)/d². */
export const relativeAcceleration = (Gn: number, m1: number, m2: number, d: number) => (Gn * (m1 + m2)) / (d * d);

/** Period of a bound pair whose relative orbit has semi-major axis a: 2π√(a³/(G(m₁ + m₂))). */
export const binaryPeriod = (Gn: number, m1: number, m2: number, a: number) => orbitalPeriod(Gn * (m1 + m2), a);

/** Both bodies on circular orbits about the centre of mass, separation a. */
export function circularBinary(Gn: number, m1: number, m2: number, a: number) {
  const M = m1 + m2;
  const mu = reducedMass(m1, m2);
  const T = binaryPeriod(Gn, m1, m2, a);
  const vRel = (2 * Math.PI * a) / T;
  const { d1, d2 } = barycentre(m1, m2, a);
  const { v1, v2 } = bodySpeeds(m1, m2, vRel);
  return {
    T,
    vRel,
    d1,
    d2,
    v1,
    v2,
    /** total energy in the centre-of-mass frame, ½μv² − Gm₁m₂/a = −Gm₁m₂/(2a) */
    E: 0.5 * mu * vRel * vRel - (Gn * m1 * m2) / a,
    /** angular momentum about the centre of mass, μ a v */
    L: mu * a * vRel,
    M,
    mu,
  };
}

/**
 * A circular binary from what a spectroscope measures: both speeds and the common period.
 * a = (v₁ + v₂)T/(2π), M = (v₁ + v₂)³T/(2πG), and m₁/m₂ = v₂/v₁.
 */
export function massesFromSpeeds(Gn: number, v1: number, v2: number, T: number): { m1: number; m2: number; M: number; a: number } {
  const a = ((v1 + v2) * T) / (2 * Math.PI);
  const M = ((v1 + v2) ** 3 * T) / (2 * Math.PI * Gn);
  return { m1: (M * v2) / (v1 + v2), m2: (M * v1) / (v1 + v2), M, a };
}

/** The energy of the pair split as in lesson 4.2, plus the potential energy −Gm₁m₂/r. */
export function pairEnergy(Gn: number, m1: number, m2: number, s: RelativeSplit) {
  const M = m1 + m2;
  const mu = reducedMass(m1, m2);
  const V2 = s.V[0] * s.V[0] + s.V[1] * s.V[1];
  const v2 = s.v[0] * s.v[0] + s.v[1] * s.v[1];
  const r = Math.hypot(s.r[0], s.r[1]);
  const Kcm = 0.5 * M * V2;
  const Krel = 0.5 * mu * v2;
  const U = (-Gn * m1 * m2) / r;
  return { Kcm, Krel, U, /** the energy of the relative motion, conserved */ Erel: Krel + U };
}

/** z-component of the angular momentum about the centre of mass, L = μ (r × v). */
export const angularMomentumAboutCM = (m1: number, m2: number, r: Vec2, v: Vec2) => reducedMass(m1, m2) * (r[0] * v[1] - r[1] * v[0]);

/** z-component of Σ mᵢ (rᵢ − R) × vᵢ, summed body by body (for checking the identity above). */
export function angularMomentumOfBodies(m1: number, b1: PlanarState, m2: number, b2: PlanarState): number {
  const R = centreOfMass(m1, b1.r, m2, b2.r);
  const l = (m: number, b: PlanarState) => m * ((b.r[0] - R[0]) * b.v[1] - (b.r[1] - R[1]) * b.v[0]);
  return l(m1, b1) + l(m2, b2);
}

/**
 * Both bodies at time t, the centre of mass at rest at the origin, the relative orbit an ellipse of semi-major
 * axis a and eccentricity e (0 ≤ e < 1) traversed counter-clockwise, its periapsis on +x at t = 0.
 * Returns the bodies, the relative state and the period.
 */
export function binaryAt(Gn: number, m1: number, m2: number, a: number, e: number, t: number) {
  const GM = Gn * (m1 + m2);
  const { theta, r } = ellipseAtTime(GM, a, e, t);
  const p = a * (1 - e * e);
  const h = Math.sqrt(GM * p);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // radial ṙ = (GM/h) e sin θ, transverse r θ̇ = h/r
  const vr = (GM / h) * e * s;
  const vt = h / r;
  const rel: RelativeSplit = {
    R: [0, 0],
    V: [0, 0],
    r: [r * c, r * s],
    v: [vr * c - vt * s, vr * s + vt * c],
  };
  const { b1, b2 } = fromRelative(m1, m2, rel);
  return { b1, b2, r: rel.r, v: rel.v, theta, T: orbitalPeriod(GM, a) };
}

/** One RK4 step of both bodies directly, m₁r̈₁ = −Gm₁m₂ r̂/r², m₂r̈₂ = +Gm₁m₂ r̂/r² (r̂ from body 2 to body 1). */
export function stepTwoBody(Gn: number, m1: number, m2: number, b1: PlanarState, b2: PlanarState, dt: number): { b1: PlanarState; b2: PlanarState } {
  type S = [number, number, number, number, number, number, number, number]; // x1 y1 x2 y2 vx1 vy1 vx2 vy2
  const deriv = (y: S): S => {
    const dx = y[0] - y[2];
    const dy = y[1] - y[3];
    const d3 = Math.hypot(dx, dy) ** 3;
    const k = Gn / d3;
    return [y[4], y[5], y[6], y[7], -k * m2 * dx, -k * m2 * dy, k * m1 * dx, k * m1 * dy];
  };
  const y0: S = [b1.r[0], b1.r[1], b2.r[0], b2.r[1], b1.v[0], b1.v[1], b2.v[0], b2.v[1]];
  const plus = (y: S, k: S, f: number): S => y.map((v, i) => v + f * k[i]) as S;
  const k1 = deriv(y0);
  const k2 = deriv(plus(y0, k1, dt / 2));
  const k3 = deriv(plus(y0, k2, dt / 2));
  const k4 = deriv(plus(y0, k3, dt));
  const y = y0.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as S;
  return {
    b1: { r: [y[0], y[1]], v: [y[4], y[5]] },
    b2: { r: [y[2], y[3]], v: [y[6], y[7]] },
  };
}
