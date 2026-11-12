/**
 * Statics of a rigid body in a plane (lesson 8.5): forces applied at points, their torques about any point, and the
 * three scenes of the lesson: a ladder against a smooth wall with a person on it, a beam on two supports with a load,
 * and a couple. Every number of the lesson, its figure (LadderStatics), its examples and its workbook comes from here
 * or from the scripts in .scratch/ch8/8-5/.
 *
 * MODEL SPECIFICATION
 * - System: one rigid body (גוף צפיד) at rest, acted on by forces applied at given points, all in the xy plane.
 *   x to the right, y up, z out of the page (⊙). A torque about a point P is τ_P = Σ (r_i − r_P) × F_i, a z component,
 *   positive counter-clockwise. A uniform body's weight acts at its centre (uniform field: the CM).
 * - Dynamics: none. Equilibrium is ΣF = 0 and Στ_P = 0; if ΣF = 0, Στ is the same about every point
 *   (τ_B = τ_A + (r_A − r_B) × ΣF).
 * - Ladder: a uniform ladder of length L and mass M leans on a vertical wall at x = 0 (the wall on the left) and stands
 *   on the floor y = 0, at an angle θ with the floor: foot B = (L cos θ, 0), top A = (0, L sin θ). A person of mass m
 *   stands on the rung a distance s from the foot, at rest, and pushes it down with a force equal to their weight mg.
 *   The wall is smooth (one horizontal force N₂ at A, away from the wall); the floor pushes up with N₁ and its static
 *   friction f at B points toward the wall. Solved by torques about B: N₂ = g cot θ (M/2 + m s/L), f = N₂,
 *   N₁ = (M + m) g. The ladder stays when f ≤ μ_s N₁.
 * - Rough wall (wall friction μ_w as well): statically indeterminate (four unknowns, three equations) below the
 *   threshold; at the threshold both frictions are at their maximum (the rigid ladder slips at both ends at once), which
 *   gives tan θ_min = (1 + μ_s μ_w)(M/2 + m s/L)/(μ_s (M + m)) − μ_w, and for m = 0, (1 − μ_s μ_w)/(2μ_s).
 * - Beam: a uniform beam (length L, mass M) on two supports at x = a < b, with point loads; each support pushes up only.
 * - Boundary: the geometry and the masses given by the caller; g = 9.8 m/s² unless given.
 * - Ignored: deformation of the body, of the floor and of the wall; the width of the ladder and of the beam; the person's
 *   own size (a point load on the rung); rolling or sticking of the supports.
 * - Valid when: the body is at rest and every contact force is a push (N ≥ 0) and every static friction satisfies
 *   |f| ≤ μ_s N. Outside that the body is not in static equilibrium: a ladder with f > μ_s N₁ slips, a beam with a
 *   negative support force tips about the other support.
 * - Failure modes: θ → 0 makes N₂ → ∞ (a flat ladder cannot lean); a zero force has no line of action (its lever arm
 *   is returned as 0); `ladderMaxClimb` can return a fraction above 1 (the person can stand at the very top) or below
 *   0 (the empty ladder already slips): the caller clamps.
 */

import { G } from './constants';
import type { Vec2 } from './vec';

/** A force F applied at the point `at` of the body, with an id the caller chooses. */
export interface PointForce {
  id: string;
  at: Vec2;
  F: Vec2;
}

/** z component of a × b for vectors in the plane. */
export const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

/** ΣF of a set of forces. */
export function netForce(fs: readonly PointForce[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const f of fs) {
    x += f.F[0];
    y += f.F[1];
  }
  return [x, y];
}

/** τ_P = (r − r_P) × F, the torque of one force about the point P (+ counter-clockwise). */
export const torqueAbout = (f: PointForce, P: Vec2): number => cross2([f.at[0] - P[0], f.at[1] - P[1]], f.F);

/** Στ_P of a set of forces about the point P. */
export const netTorque = (fs: readonly PointForce[], P: Vec2): number => fs.reduce((s, f) => s + torqueAbout(f, P), 0);

/** The lever arm of a force about P: the distance from P to its line of action (0 for a zero force). */
export function leverArm(f: PointForce, P: Vec2): number {
  const m = Math.hypot(f.F[0], f.F[1]);
  return m === 0 ? 0 : Math.abs(torqueAbout(f, P)) / m;
}

/** The foot of the perpendicular from P to the force's line of action (the end of the lever arm); `at` for a zero force. */
export function armFoot(f: PointForce, P: Vec2): Vec2 {
  const m2 = f.F[0] * f.F[0] + f.F[1] * f.F[1];
  if (m2 === 0) return f.at;
  const u = ((P[0] - f.at[0]) * f.F[0] + (P[1] - f.at[1]) * f.F[1]) / m2;
  return [f.at[0] + u * f.F[0], f.at[1] + u * f.F[1]];
}

/** Change of point: τ_B = τ_A + (r_A − r_B) × ΣF. */
export const shiftTorque = (tauA: number, A: Vec2, B: Vec2, Fnet: Vec2): number => tauA + cross2([A[0] - B[0], A[1] - B[1]], Fnet);

// ---------------------------------------------------------------- the ladder against a smooth wall

export interface Ladder {
  /** length [m] and mass [kg] of the (uniform) ladder */
  L: number;
  M: number;
  /** the person's mass [kg] (0: nobody) and distance from the foot along the ladder [m], 0 ≤ s ≤ L */
  m: number;
  s: number;
  /** angle with the floor [rad] */
  theta: number;
  /** static friction coefficient between the foot and the floor */
  mu: number;
  g?: number;
}

export interface LadderSolution {
  /** top (on the wall), foot (on the floor), centre, the rung the person stands on, and the corner of wall and floor */
  A: Vec2;
  B: Vec2;
  C: Vec2;
  S: Vec2;
  O: Vec2;
  /** where the lines of action of N₁ (vertical through B) and N₂ (horizontal through A) meet */
  Q: Vec2;
  /** the floor's push up, the floor's static friction (toward the wall) and the wall's push (away from the wall) [N] */
  N1: number;
  f: number;
  N2: number;
  /** μ_s N₁: the largest friction the floor can give [N] */
  fMax: number;
  /** f > μ_s N₁: no static equilibrium, the ladder slips */
  slips: boolean;
  /** forces on the ladder: N1, f, N2 (the floor's and the wall's), W (the Earth's pull on the ladder), P (the person's push) */
  forces: PointForce[];
}

/** The forces on a ladder in equilibrium against a smooth wall (the values equilibrium needs, even when it slips). */
export function solveLadder(l: Ladder): LadderSolution {
  const g = l.g ?? G;
  const c = Math.cos(l.theta);
  const sn = Math.sin(l.theta);
  const A: Vec2 = [0, l.L * sn];
  const B: Vec2 = [l.L * c, 0];
  const C: Vec2 = [(l.L / 2) * c, (l.L / 2) * sn];
  const S: Vec2 = [(l.L - l.s) * c, l.s * sn];
  // torques about the foot B: N₂ L sin θ = M g (L/2) cos θ + m g s cos θ
  const N2 = (g * c * (l.M / 2 + (l.m * l.s) / l.L)) / sn;
  const f = N2;
  const N1 = (l.M + l.m) * g;
  const fMax = l.mu * N1;
  const forces: PointForce[] = [
    { id: 'N1', at: B, F: [0, N1] },
    { id: 'f', at: B, F: [-f, 0] },
    { id: 'N2', at: A, F: [N2, 0] },
    { id: 'W', at: C, F: [0, -l.M * g] },
  ];
  if (l.m > 0) forces.push({ id: 'P', at: S, F: [0, -l.m * g] });
  return { A, B, C, S, O: [0, 0], Q: [B[0], A[1]], N1, f, N2, fMax, slips: f > fMax * (1 + 1e-12), forces };
}

/** Smallest angle with the floor at which the ladder, with the person at s/L, does not slip (smooth wall) [rad]. */
export function ladderMinAngle(M: number, m: number, sFrac: number, mu: number): number {
  return Math.atan((M / 2 + m * sFrac) / (mu * (M + m)));
}

/** How far up the ladder the person can stand, as a fraction of L (smooth wall); clamp to [0, 1] for a real ladder. */
export function ladderMaxClimb(M: number, m: number, theta: number, mu: number): number {
  return (mu * (M + m) * Math.tan(theta) - M / 2) / m;
}

/**
 * Rough wall and rough floor, at the threshold of slipping (both frictions at their maximum): the smallest angle with
 * the floor [rad]. With m = 0: tan θ = (1 − μ_s μ_w)/(2μ_s). NaN-free: an angle ≤ 0 means it never slips.
 */
export function roughWallMinAngle(M: number, m: number, sFrac: number, muFloor: number, muWall: number): number {
  const t = ((1 + muFloor * muWall) * (M / 2 + m * sFrac)) / (muFloor * (M + m)) - muWall;
  return Math.atan(Math.max(0, t));
}

/** The forces at the threshold of slipping with a rough wall: N₁ = W/(1 + μ_s μ_w), f = μ_s N₁, N₂ = f, f_w = μ_w N₂. */
export function roughWallThresholdForces(W: number, muFloor: number, muWall: number) {
  const N1 = W / (1 + muFloor * muWall);
  const f = muFloor * N1;
  const N2 = f;
  return { N1, f, N2, fw: muWall * N2 };
}

// ---------------------------------------------------------------- a beam on two supports

export interface Load {
  id: string;
  m: number;
  x: number;
}

export interface Beam {
  /** length [m] and mass [kg]; the beam runs from x = 0 to x = L */
  L: number;
  M: number;
  /** the supports, a < b [m] */
  a: number;
  b: number;
  loads: Load[];
  g?: number;
}

export interface BeamSolution {
  /** the supports' pushes [N]; a negative value is a pull the support cannot give */
  N1: number;
  N2: number;
  /** 'left': the right end would go down and the left end lift (N₁ < 0); 'right' the other way */
  tips: 'none' | 'left' | 'right';
  forces: PointForce[];
}

/** Support forces of a beam from torques about each support (exact for two supports). */
export function solveBeam(b: Beam): BeamSolution {
  const g = b.g ?? G;
  const weights: PointForce[] = [{ id: 'W', at: [b.L / 2, 0], F: [0, -b.M * g] }, ...b.loads.map((l) => ({ id: l.id, at: [l.x, 0] as Vec2, F: [0, -l.m * g] as Vec2 }))];
  // about support 2 (x = b): N₁ (b − a) = Σ m g (b − x)
  const N1 = weights.reduce((s, w) => s - w.F[1] * (b.b - w.at[0]), 0) / (b.b - b.a);
  // about support 1 (x = a): N₂ (b − a) = Σ m g (x − a)
  const N2 = weights.reduce((s, w) => s - w.F[1] * (w.at[0] - b.a), 0) / (b.b - b.a);
  const tol = 1e-9 * Math.max(1, Math.abs(N1) + Math.abs(N2));
  const tips = N1 < -tol ? 'left' : N2 < -tol ? 'right' : 'none';
  return {
    N1,
    N2,
    tips,
    forces: [{ id: 'N1', at: [b.a, 0], F: [0, N1] }, { id: 'N2', at: [b.b, 0], F: [0, N2] }, ...weights],
  };
}

/** Where a load of mass m on the overhang beyond support b makes N₁ = 0 (the beam is about to tip about b) [m]. */
export const beamTipPosition = (b: Pick<Beam, 'L' | 'M' | 'b'>, m: number): number => b.b + (b.M * (b.b - b.L / 2)) / m;

// ---------------------------------------------------------------- a crate pushed sideways (tip or slide)

/**
 * A uniform crate of mass m and width w on a rough floor, pushed horizontally by F at height h. In equilibrium the
 * floor's push N = m g acts a distance x = F h/(m g) ahead of the centre (toward the push's direction) and f = F.
 * It slides when F > μ_s m g, it tips when x > w/2, i.e. F > m g w/(2h). It tips first when h > w/(2μ_s).
 */
export function pushedCrate(m: number, w: number, h: number, F: number, mu: number, g = G) {
  const N = m * g;
  const x = (F * h) / N;
  const slideF = mu * N;
  const tipF = (N * w) / (2 * h);
  return { N, f: F, x, slideF, tipF, first: tipF < slideF ? ('tip' as const) : ('slide' as const) };
}

/** The push height above which a crate tips before it slides: w/(2μ_s). */
export const tipHeight = (w: number, mu: number) => w / (2 * mu);
