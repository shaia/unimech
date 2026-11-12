/**
 * The gravity of a spherical shell and of a uniform solid sphere (lesson 6.1): the shell cut into rings and the
 * rings' pulls summed numerically, next to the analytic results of the shell theorem, for the field g(r) and the
 * potential energy U(r) outside and inside.
 *
 * MODEL SPECIFICATION
 * - System: a thin uniform spherical shell of mass M and radius R, centred at the origin, and a probe (a point mass
 *   m) on the x axis at distance r ≥ 0 from the centre. The shell is cut by planes perpendicular to the x axis into
 *   n rings of equal thickness 2R/n. Archimedes' hat-box theorem: a zone of a sphere between two parallel planes
 *   has an area proportional to the distance between them, so every such ring has the same mass M/n. A uniform
 *   solid sphere is a set of concentric shells (layers), each of the mass of its spherical layer, M·(b³ − a³)/R³.
 * - Dynamics (statics): Newton's law of gravitation. A ring of mass dM, centred on the axis at x with radius
 *   ρ = √(R² − x²), lies at the same distance s = √(r² + R² − 2rx) from every point of the probe's axis position;
 *   by symmetry it pulls the probe along the axis only, by G dM (r − x)/s³ per unit probe mass (positive = toward
 *   the centre), and its potential energy per unit probe mass is −G dM/s.
 *   Analytic (the shell theorem): outside (r > R) g = GM/r², U/m = −GM/r; inside (r < R) g = 0, U/m = −GM/R.
 *   Uniform solid sphere: inside g = GMr/R³ (only the mass M(r) = M r³/R³ inside r pulls),
 *   U/m = −GM(3R² − r²)/(2R³); outside the same as a point mass. Point-mass law: gravityForce, gravityPotential
 *   (orbit.ts), with the zero of potential energy at infinity.
 * - Boundary: the probe is on the axis (no loss of generality: the shell is symmetric about any line through its
 *   centre).
 * - Ignored: the shell's thickness (a thin shell), any non-uniformity of density over the shell, the probe's own
 *   gravity on the shell (it is a test mass), relativity.
 * - Valid when: the density depends only on the distance from the centre (each shell uniform); the probe is a point.
 * - Failure modes: on the shell itself (r = R) the near ring's integrand is singular; the analytic field there is
 *   the average of the two sides, GM/(2R²), and the ring sum converges to it slowly. The midpoint ring sum
 *   converges as 1/n² while the probe is a finite distance from the shell, more slowly as r → R. In the solid
 *   sum a layer next to the probe has the same difficulty, so `sphereSum` places the probe between layer edges
 *   only to the accuracy of n layers.
 */

import { gravityForce, gravityPotential } from './orbit';

export interface Ring {
  /** axial position of the ring's plane [m] */
  x: number;
  /** ring radius √(R² − x²) [m] */
  rho: number;
  /** ring mass [kg] */
  m: number;
}

export interface RingPull {
  ring: Ring;
  /** distance from the probe to every point of the ring [m] */
  s: number;
  /** the ring's pull per unit probe mass along the axis, positive toward the centre [m/s²] */
  g: number;
  /** the ring's potential energy per unit probe mass [J/kg] */
  u: number;
}

export interface ShellSum {
  /** each ring's contribution */
  pulls: RingPull[];
  /** net field per unit probe mass, positive toward the centre [m/s²] */
  g: number;
  /** potential energy per unit probe mass [J/kg] */
  u: number;
  /** the sum of the pulls toward the centre (positive parts) [m/s²] */
  inward: number;
  /** the sum of the pulls away from the centre (negative parts, as a positive number) [m/s²] */
  outward: number;
}

/** A shell of mass M and radius R cut into n rings of equal thickness, so of equal mass M/n (hat-box theorem). */
export function shellRings(M: number, R: number, n: number): Ring[] {
  const out: Ring[] = [];
  const dx = (2 * R) / n;
  for (let k = 0; k < n; k++) {
    const x = -R + (k + 0.5) * dx;
    out.push({ x, rho: Math.sqrt(Math.max(0, R * R - x * x)), m: M / n });
  }
  return out;
}

/** One ring's pull on a unit probe mass at distance r from the centre on the axis. */
export function ringPull(Gn: number, ring: Ring, r: number): RingPull {
  const s = Math.hypot(r - ring.x, ring.rho);
  return { ring, s, g: (Gn * ring.m * (r - ring.x)) / (s * s * s), u: (-Gn * ring.m) / s };
}

/** The rings' pulls summed: a numerical integral over the shell (midpoint rule in x). */
export function shellSum(Gn: number, M: number, R: number, r: number, n: number): ShellSum {
  const pulls = shellRings(M, R, n).map((ring) => ringPull(Gn, ring, r));
  let g = 0;
  let u = 0;
  let inward = 0;
  let outward = 0;
  for (const p of pulls) {
    g += p.g;
    u += p.u;
    if (p.g >= 0) inward += p.g;
    else outward -= p.g;
  }
  return { pulls, g, u, inward, outward };
}

/** The shell theorem: field of a thin uniform shell, toward the centre (GM/r² outside, 0 inside, the mean on it). */
export function shellField(Gn: number, M: number, R: number, r: number): number {
  if (r > R) return gravityForce(Gn, M, 1, r);
  if (r < R) return 0;
  return (Gn * M) / (2 * R * R);
}

/** Potential energy per unit probe mass of a thin shell: −GM/r outside, −GM/R (constant) inside. */
export function shellPotential(Gn: number, M: number, R: number, r: number): number {
  return gravityPotential(Gn, M, 1, Math.max(r, R));
}

/** Mass of a uniform sphere inside radius r: M (r/R)³, and M outside. */
export const enclosedMass = (M: number, R: number, r: number) => (r >= R ? M : M * (r / R) ** 3);

/** Field of a uniform solid sphere, toward the centre: GM(r)/r² = GMr/R³ inside, GM/r² outside. */
export function sphereField(Gn: number, M: number, R: number, r: number): number {
  if (r <= 0) return 0;
  return gravityForce(Gn, enclosedMass(M, R, r), 1, r);
}

/** Potential energy per unit probe mass of a uniform solid sphere: −GM(3R² − r²)/(2R³) inside, −GM/r outside. */
export function spherePotential(Gn: number, M: number, R: number, r: number): number {
  if (r >= R) return gravityPotential(Gn, M, 1, r);
  return (-Gn * M * (3 * R * R - r * r)) / (2 * R * R * R);
}

/** Force on a probe of mass m from a uniform solid sphere, toward the centre [N]. */
export const sphereForce = (Gn: number, M: number, m: number, R: number, r: number) => m * sphereField(Gn, M, R, r);

/** Potential energy of a probe of mass m and a uniform solid sphere, zero at infinity [J]. */
export const sphereEnergy = (Gn: number, M: number, m: number, R: number, r: number) => m * spherePotential(Gn, M, R, r);

export interface Layer {
  /** inner and outer radius of the layer, and the radius of the thin shell standing for it [m] */
  a: number;
  b: number;
  mid: number;
  /** mass of the layer [kg] */
  m: number;
}

/** A uniform solid sphere cut into nLayers concentric layers of equal thickness. */
export function sphereLayers(M: number, R: number, nLayers: number): Layer[] {
  const out: Layer[] = [];
  for (let k = 0; k < nLayers; k++) {
    const a = (k * R) / nLayers;
    const b = ((k + 1) * R) / nLayers;
    out.push({ a, b, mid: 0.5 * (a + b), m: (M * (b ** 3 - a ** 3)) / R ** 3 });
  }
  return out;
}

export interface SphereSum {
  /** each layer's field (its rings summed), toward the centre [m/s²] */
  layers: { layer: Layer; g: number; u: number }[];
  g: number;
  u: number;
}

/** A uniform solid sphere as concentric thin shells, each summed ring by ring. */
export function sphereSum(Gn: number, M: number, R: number, r: number, nLayers: number, nRings: number): SphereSum {
  const layers = sphereLayers(M, R, nLayers).map((layer) => {
    const s = shellSum(Gn, layer.m, layer.mid, r, nRings);
    return { layer, g: s.g, u: s.u };
  });
  return { layers, g: layers.reduce((t, l) => t + l.g, 0), u: layers.reduce((t, l) => t + l.u, 0) };
}
