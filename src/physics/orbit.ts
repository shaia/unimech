/**
 * Motion under an inverse-square attraction (chapter 6, lessons 6.2–6.6): the reduced two-body problem, the
 * effective potential, the conic orbit and its elements, Kepler's laws, escape and the Hohmann transfer. Shared by
 * the lessons' figures and scripts, so every number of the chapter comes from one model.
 *
 * MODEL SPECIFICATION
 * - System: a body moving relative to an attracting centre, in the plane of the motion, with polar coordinates
 *   (r, θ) about the centre and θ measured from the periapsis (the closest point). For two bodies m₁, m₂ the
 *   relative coordinate r = r₁ − r₂ (body 1 seen from body 2, the course's convention) obeys this model with GM → G(m₁ + m₂) and the reduced mass μ = m₁m₂/(m₁ + m₂)
 *   (lesson 6.2); for a satellite or a planet of negligible mass, GM is that of the central body.
 * - Dynamics: r̈ = −GM r̂/r². Per unit (reduced) mass: the specific angular momentum h = r² θ̇ = |r × v| and the
 *   specific energy ε = v²/2 − GM/r are conserved. Effective potential (per unit mass) u_eff(r) = h²/(2r²) − GM/r.
 *   Orbit: r(θ) = p/(1 + e cos θ), p = h²/GM, e = √(1 + 2εh²/(GM)²); a = −GM/(2ε) (a < 0 for a hyperbola, ∞ for a
 *   parabola). Vis-viva v² = GM(2/r − 1/a). Period T = 2π√(a³/GM). Kepler's equation M = E − e sin E.
 * - Boundary: a state (r, v) at one instant, or the orbit's elements.
 * - Ignored: other bodies (perturbations), the bodies' size and shape (point masses, or spheres by the shell
 *   theorem, lesson 6.1), relativity, drag, and the change of mass of a rocket during a burn (burns are impulsive).
 * - Valid when: the bodies are spheres or far apart compared with their size, and speeds ≪ c.
 * - Failure modes: e ≈ 1 makes the parabola/ellipse/hyperbola classification depend on rounding (`KIND_BAND`);
 *   h → 0 is a radial fall (r(θ) undefined); Kepler's equation is solved by Newton's method, which converges for
 *   every e < 1 from the starting guess E = M + e sin M (E = π for e > 0.8).
 */

import type { Vec2 } from './vec';

/** |e − 1| (and e) below this band count as a parabola (and a circle). */
export const KIND_BAND = 1e-9;

export type OrbitKind = 'circle' | 'ellipse' | 'parabola' | 'hyperbola';

export interface Elements {
  /** specific angular momentum h = |r × v| [m²/s] (signed: positive for counter-clockwise motion) */
  h: number;
  /** specific energy ε = v²/2 − GM/r [J/kg] */
  eps: number;
  /** eccentricity */
  e: number;
  /** semi-latus rectum p = h²/GM [m] */
  p: number;
  /** semi-major axis a = −GM/(2ε) [m]; Infinity for a parabola, negative for a hyperbola */
  a: number;
  /** polar angle of the periapsis direction [rad] (0 for a circle) */
  periapsisAngle: number;
  kind: OrbitKind;
}

/** μ = m₁m₂/(m₁ + m₂). */
export const reducedMass = (m1: number, m2: number) => (m1 * m2) / (m1 + m2);
/** Gravitational attraction between two point masses, F = G m₁ m₂ / r². */
export const gravityForce = (Gn: number, m1: number, m2: number, r: number) => (Gn * m1 * m2) / (r * r);
/** Gravitational potential energy U = −G m₁ m₂ / r (zero at infinity). */
export const gravityPotential = (Gn: number, m1: number, m2: number, r: number) => (-Gn * m1 * m2) / r;
/** Effective potential per unit mass, h²/(2r²) − GM/r. */
export const effectivePotential = (GM: number, h: number, r: number) => (h * h) / (2 * r * r) - GM / r;
/** Radius of the circular orbit of angular momentum h (the minimum of u_eff): h²/GM. */
export const circularRadius = (GM: number, h: number) => (h * h) / GM;
/** Circular-orbit speed √(GM/r). */
export const circularSpeed = (GM: number, r: number) => Math.sqrt(GM / r);
/** Escape speed √(2GM/r). */
export const escapeSpeed = (GM: number, r: number) => Math.sqrt((2 * GM) / r);
/** Vis-viva speed √(GM(2/r − 1/a)); a = Infinity for a parabola. */
export const visViva = (GM: number, r: number, a: number) => Math.sqrt(GM * (2 / r - (Number.isFinite(a) ? 1 / a : 0)));
/** Period of an elliptic orbit, 2π√(a³/GM). */
export const orbitalPeriod = (GM: number, a: number) => 2 * Math.PI * Math.sqrt((a * a * a) / GM);
/** Semi-major axis from the period (Kepler III inverted). */
export const semiMajorFromPeriod = (GM: number, T: number) => Math.cbrt((GM * T * T) / (4 * Math.PI * Math.PI));
/** e = √(1 + 2εh²/(GM)²) (clamped at 0 against rounding for a circle). */
export const eccentricity = (GM: number, eps: number, h: number) => Math.sqrt(Math.max(0, 1 + (2 * eps * h * h) / (GM * GM)));
/** r(θ) = p/(1 + e cos θ), θ from the periapsis; Infinity beyond a hyperbola's asymptote. */
export function radiusAt(p: number, e: number, theta: number): number {
  const d = 1 + e * Math.cos(theta);
  return d > 0 ? p / d : Number.POSITIVE_INFINITY;
}
/** Periapsis and apoapsis distances a(1 ∓ e) of an ellipse (apoapsis Infinity when unbound). */
export function apsides(p: number, e: number): { rp: number; ra: number } {
  return { rp: p / (1 + e), ra: e < 1 ? p / (1 - e) : Number.POSITIVE_INFINITY };
}
/** The turning radii of the radial motion: roots of ε r² + GM r − h²/2 = 0 (one root when ε ≥ 0). */
export function turningRadii(GM: number, h: number, eps: number): number[] {
  if (eps === 0) return [(h * h) / (2 * GM)];
  const disc = GM * GM + 2 * eps * h * h;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  const roots = [(-GM + s) / (2 * eps), (-GM - s) / (2 * eps)].filter((r) => r > 0);
  return roots.sort((x, y) => x - y);
}

export function classify(e: number): OrbitKind {
  if (e < KIND_BAND) return 'circle';
  if (Math.abs(e - 1) < KIND_BAND) return 'parabola';
  return e < 1 ? 'ellipse' : 'hyperbola';
}

/** The orbit's elements from a position and a velocity relative to the centre. */
export function elementsFromState(GM: number, r: Vec2, v: Vec2): Elements {
  const rr = Math.hypot(r[0], r[1]);
  const h = r[0] * v[1] - r[1] * v[0];
  const eps = 0.5 * (v[0] * v[0] + v[1] * v[1]) - GM / rr;
  // eccentricity vector e = (v × h)/GM − r̂, with h along z
  const ex = (v[1] * h) / GM - r[0] / rr;
  const ey = (-v[0] * h) / GM - r[1] / rr;
  const e = Math.hypot(ex, ey);
  // e = 1 also for every radial (h = 0) motion, bound or not: there the energy decides, not e
  const unboundScale = Math.abs(eps) * rr / GM;
  let kind = classify(e);
  if (kind === 'parabola' && unboundScale >= KIND_BAND) kind = eps < 0 ? 'ellipse' : 'hyperbola';
  const p = (h * h) / GM;
  const a = kind === 'parabola' ? Number.POSITIVE_INFINITY : -GM / (2 * eps);
  return { h, eps, e, p, a, periapsisAngle: kind === 'circle' ? 0 : Math.atan2(ey, ex), kind };
}

/** Solve Kepler's equation M = E − e sin E for the eccentric anomaly E (ellipse, 0 ≤ e < 1). */
export function eccentricAnomaly(M: number, e: number): number {
  const Mn = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = e > 0.8 ? Math.PI : Mn + e * Math.sin(Mn);
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - Mn) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E + (M - Mn);
}

/** True anomaly θ (from the periapsis) and radius at time t after periapsis passage on an ellipse. */
export function ellipseAtTime(GM: number, a: number, e: number, t: number): { theta: number; r: number } {
  const n = Math.sqrt(GM / (a * a * a));
  const E = eccentricAnomaly(n * t, e);
  const theta = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  return { theta, r: a * (1 - e * Math.cos(E)) };
}

/** The Hohmann transfer between coplanar circular orbits r₁ → r₂: the two burns, their sum and the transfer time. */
export function hohmann(GM: number, r1: number, r2: number): { a: number; dv1: number; dv2: number; total: number; time: number } {
  const a = (r1 + r2) / 2;
  const dv1 = visViva(GM, r1, a) - circularSpeed(GM, r1);
  const dv2 = circularSpeed(GM, r2) - visViva(GM, r2, a);
  return { a, dv1, dv2, total: Math.abs(dv1) + Math.abs(dv2), time: orbitalPeriod(GM, a) / 2 };
}

export interface PlanarState {
  r: Vec2;
  v: Vec2;
}

/** One RK4 step of r̈ = −GM r̂/r² (for tests and for figures that integrate rather than evaluate). */
export function stepKepler(GM: number, s: PlanarState, dt: number): PlanarState {
  const acc = (p: Vec2): Vec2 => {
    const d = Math.hypot(p[0], p[1]);
    const k = -GM / (d * d * d);
    return [k * p[0], k * p[1]];
  };
  const add = (a: Vec2, b: Vec2, h: number): Vec2 => [a[0] + h * b[0], a[1] + h * b[1]];
  const k1r = s.v;
  const k1v = acc(s.r);
  const k2r = add(s.v, k1v, dt / 2);
  const k2v = acc(add(s.r, k1r, dt / 2));
  const k3r = add(s.v, k2v, dt / 2);
  const k3v = acc(add(s.r, k2r, dt / 2));
  const k4r = add(s.v, k3v, dt);
  const k4v = acc(add(s.r, k3r, dt));
  return {
    r: [s.r[0] + (dt / 6) * (k1r[0] + 2 * k2r[0] + 2 * k3r[0] + k4r[0]), s.r[1] + (dt / 6) * (k1r[1] + 2 * k2r[1] + 2 * k3r[1] + k4r[1])],
    v: [s.v[0] + (dt / 6) * (k1v[0] + 2 * k2v[0] + 2 * k3v[0] + k4v[0]), s.v[1] + (dt / 6) * (k1v[1] + 2 * k2v[1] + 2 * k3v[1] + k4v[1])],
  };
}
