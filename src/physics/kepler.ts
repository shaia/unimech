/**
 * Kepler's three laws as numbers (lesson 6.5): the ellipse's area and axes, the areal velocity, the area of a sector
 * swept from the focus, the time between two points of an orbit, the period of two bodies and the orbit's energy, and
 * the planets' measured semi-major axes and periods for a T²–a³ plot. Built on the shared model of `orbit.ts`.
 *
 * MODEL SPECIFICATION
 * - System: the relative coordinate of two bodies attracting by gravity (or a body of negligible mass around a fixed
 *   centre), in the plane of the motion, polar angle θ from the periapsis, origin at the attracting centre (a focus
 *   of the ellipse). GM stands for G(m₁ + m₂) (lesson 6.2).
 * - Dynamics: as `orbit.ts`: r(θ) = p/(1 + e cos θ), p = a(1 − e²); specific angular momentum h = √(GM p) is
 *   constant, so the areal velocity dA/dt = ½r²θ̇ = h/2 (per unit reduced mass: L/(2μ)) is constant; T = 2π√(a³/GM);
 *   the orbit's energy E = −G m₁ m₂/(2a). Time along the orbit from Kepler's equation M = ψ − e sin ψ, ψ the eccentric
 *   anomaly (named ψ here: the lesson's E is the energy).
 * - Boundary: the orbit's elements a, e (bound orbits only, 0 ≤ e < 1), and the two angles or times asked about.
 * - Ignored: everything `orbit.ts` ignores (other bodies, size, relativity, drag). The planets' data are measured
 *   values and include every perturbation (Jupiter's and Saturn's pulls on each other and on the outer planets); the
 *   fact sheet's tropical period (equinox to equinox) is shorter than the sidereal one by the precession of the
 *   equinoxes, 50″ a year, a fraction that grows with the period (0.6 % for Neptune). The data therefore lie on the
 *   model's T² = 4π²a³/GM line within 0.2 % for Mercury to Jupiter and Uranus, 0.6 % for Saturn and 1.2 % for
 *   Neptune: invisible on the figure's log-log plot.
 * - Valid when: 0 ≤ e < 1 and speeds ≪ c.
 * - Failure modes: `sectorArea` integrates numerically (composite Simpson); it converges as n⁻⁴ for a smooth r(θ) and
 *   needs more samples as e → 1, where r(θ) varies sharply near the periapsis. Angles may run past 2π: `timeBetween`
 *   counts whole turns, so θ₂ < θ₁ gives a negative time.
 *
 * Planet data: NASA Goddard Space Flight Center, NSSDCA "Planetary Fact Sheet - Metric"
 * (https://nssdc.gsfc.nasa.gov/planetary/factsheet/, last updated 18 March 2025, opened 2026-11-11): "Distance from
 * Sun (10⁶ km)", which the fact sheet's notes define as the semi-major axis, "Orbital Period (days)" (tropical) and
 * "Orbital Eccentricity", copied as printed.
 */

import { DAY } from './constants';
import { ellipseAtTime, orbitalPeriod } from './orbit';
import type { Vec2 } from './vec';

/** Semi-minor axis b = a√(1 − e²). */
export const semiMinorAxis = (a: number, e: number) => a * Math.sqrt(1 - e * e);
/** Area of the ellipse, πab. */
export const ellipseArea = (a: number, e: number) => Math.PI * a * semiMinorAxis(a, e);
/** Semi-latus rectum p = a(1 − e²) = b²/a. */
export const semiLatusRectum = (a: number, e: number) => a * (1 - e * e);
/** Areal velocity of an orbit, dA/dt = h/2 = ½√(GM p) [m²/s]. */
export const arealVelocity = (GM: number, a: number, e: number) => 0.5 * Math.sqrt(GM * semiLatusRectum(a, e));
/** Areal velocity from a state relative to the centre, ½|r × v|. */
export const arealVelocityOfState = (r: Vec2, v: Vec2) => 0.5 * Math.abs(r[0] * v[1] - r[1] * v[0]);
/** Period of two bodies m₁, m₂ whose relative orbit has semi-major axis a: 2π√(a³/(G(m₁ + m₂))). */
export const twoBodyPeriod = (Gn: number, m1: number, m2: number, a: number) => orbitalPeriod(Gn * (m1 + m2), a);
/** Energy of a bound two-body orbit, E = −G m₁ m₂/(2a) (zero of potential energy at infinite separation). */
export const orbitEnergy = (Gn: number, m1: number, m2: number, a: number) => (-Gn * m1 * m2) / (2 * a);
/** Specific energy of an orbit, ε = −GM/(2a). */
export const specificOrbitEnergy = (GM: number, a: number) => -GM / (2 * a);
/** Semi-major axis from the specific energy, a = −GM/(2ε) (ε < 0). */
export const semiMajorFromEnergy = (GM: number, eps: number) => -GM / (2 * eps);

/** Area swept from the focus between true anomalies θ₁ and θ₂, ∫½r²dθ, by composite Simpson with n (even) panels. */
export function sectorArea(p: number, e: number, th1: number, th2: number, n = 400): number {
  const m = n % 2 ? n + 1 : n;
  const f = (th: number) => {
    const r = p / (1 + e * Math.cos(th));
    return 0.5 * r * r;
  };
  const h = (th2 - th1) / m;
  let s = f(th1) + f(th2);
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(th1 + i * h);
  return (s * h) / 3;
}

/** Eccentric anomaly ψ of the true anomaly θ, continuous in θ (whole turns carried over). */
export function eccentricFromTrue(theta: number, e: number): number {
  const turns = Math.round(theta / (2 * Math.PI));
  const t0 = theta - turns * 2 * Math.PI;
  const psi = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(t0 / 2), Math.sqrt(1 + e) * Math.cos(t0 / 2));
  return psi + turns * 2 * Math.PI;
}

/** Mean anomaly M = ψ − e sin ψ of the true anomaly θ (the fraction of the period times 2π, from the periapsis). */
export const meanAnomaly = (theta: number, e: number) => {
  const psi = eccentricFromTrue(theta, e);
  return psi - e * Math.sin(psi);
};

/** Area swept from the focus between θ₁ and θ₂, exactly: (ab/2)·ΔM. */
export const sectorAreaExact = (a: number, e: number, th1: number, th2: number) =>
  0.5 * a * semiMinorAxis(a, e) * (meanAnomaly(th2, e) - meanAnomaly(th1, e));

/** Time to travel from true anomaly θ₁ to θ₂ along the orbit (θ₂ > θ₁ in the direction of motion). */
export function timeBetween(GM: number, a: number, e: number, th1: number, th2: number): number {
  const n = Math.sqrt(GM / (a * a * a));
  return (meanAnomaly(th2, e) - meanAnomaly(th1, e)) / n;
}

/**
 * Position and velocity at time t after the periapsis passage, periapsis along +x and motion counter-clockwise:
 * v_r = (GM/h) e sin θ, v_θ = (GM/h)(1 + e cos θ), h = √(GM p).
 */
export function stateAt(GM: number, a: number, e: number, t: number): { r: Vec2; v: Vec2; theta: number; dist: number } {
  const { theta, r } = ellipseAtTime(GM, a, e, t);
  const h = Math.sqrt(GM * semiLatusRectum(a, e));
  const vr = (GM / h) * e * Math.sin(theta);
  const vt = (GM / h) * (1 + e * Math.cos(theta));
  const c = Math.cos(theta), s = Math.sin(theta);
  return { r: [r * c, r * s], v: [vr * c - vt * s, vr * s + vt * c], theta, dist: r };
}

/** Fraction of the period from the periapsis to an end of the minor axis: 1/4 − e/(2π). */
export const minorAxisFraction = (e: number) => 0.25 - e / (2 * Math.PI);

/**
 * Fraction of the period spent on the periapsis side of the line through the focus perpendicular to the major axis
 * (from θ = −90° to +90°): (arccos e − e√(1 − e²))/π, about ½ − 2e/π for small e.
 */
export const nearHalfFraction = (e: number) => (Math.acos(e) - e * Math.sqrt(1 - e * e)) / Math.PI;

export interface Sector {
  /** start and end time [s] */
  t0: number;
  t1: number;
  /** start and end true anomaly [rad], increasing */
  th0: number;
  th1: number;
  /** area from the focus, integrated numerically [m²] */
  area: number;
}

/** The orbit cut into n sectors of equal time T/n from the periapsis, each with its numerically integrated area. */
export function equalTimeSectors(GM: number, a: number, e: number, n: number): Sector[] {
  const T = orbitalPeriod(GM, a);
  const p = semiLatusRectum(a, e);
  const out: Sector[] = [];
  let prev = 0;
  for (let k = 0; k < n; k++) {
    const t0 = (k * T) / n;
    const t1 = ((k + 1) * T) / n;
    let th1 = ellipseAtTime(GM, a, e, t1).theta;
    while (th1 <= prev + 1e-12) th1 += 2 * Math.PI;
    out.push({ t0, t1, th0: prev, th1, area: sectorArea(p, e, prev, th1) });
    prev = th1;
  }
  return out;
}

export interface Planet {
  id: string;
  /** Hebrew name */
  he: string;
  /** semi-major axis [10⁶ km], as printed by the NASA fact sheet */
  aMkm: number;
  /** orbital period [days], as printed */
  days: number;
  e: number;
}

/** The eight planets (NASA Planetary Fact Sheet, see the docstring). */
export const PLANETS: Planet[] = [
  { id: 'mercury', he: 'כוכב חמה', aMkm: 57.9, days: 88.0, e: 0.206 },
  { id: 'venus', he: 'נוגה', aMkm: 108.2, days: 224.7, e: 0.007 },
  { id: 'earth', he: 'כדור הארץ', aMkm: 149.6, days: 365.2, e: 0.017 },
  { id: 'mars', he: 'מאדים', aMkm: 228.0, days: 687.0, e: 0.094 },
  { id: 'jupiter', he: 'צדק', aMkm: 778.5, days: 4331, e: 0.049 },
  { id: 'saturn', he: 'שבתאי', aMkm: 1432.0, days: 10747, e: 0.052 },
  { id: 'uranus', he: 'אורנוס', aMkm: 2867.0, days: 30589, e: 0.047 },
  { id: 'neptune', he: 'נפטון', aMkm: 4515.0, days: 59800, e: 0.01 },
];
/** A planet's semi-major axis [m]. */
export const planetA = (pl: Planet) => pl.aMkm * 1e9;
/** A planet's period [s]. */
export const planetT = (pl: Planet) => pl.days * DAY;
