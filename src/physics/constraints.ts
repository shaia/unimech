/**
 * Constraints (lesson 2.5): bodies tied by one string of fixed length over massless pulleys, and a block
 * on a smooth wedge that is itself free on a smooth floor. In both, a geometric condition (the string's
 * length, the face of the wedge) ties the accelerations together, and the force that keeps it (the
 * tension, the normal force) is an unknown that Newton's second law finds together with them.
 *
 * MODEL SPECIFICATION
 * - System (hanging pulleys): body 1 (mass m₁) hangs on the free end of a string; body 2 (mass m₂) hangs on
 *   a pulley held by n vertical segments of the same string. n = 1 is the Atwood machine (both bodies on
 *   the two ends of a string over one fixed pulley); n = 2 is one movable pulley, the string's other end
 *   tied to the ceiling. Coordinates: the depths y₁, y₂ below the ceiling, positive down. Constraint:
 *   y₁ + n·y₂ = const, so a₁ = −n·a₂.
 * - System (table pulleys): body 1 on a smooth horizontal table, its string over a fixed pulley at the
 *   table's edge, down to body 2, which hangs on n segments (n = 1: tied straight to it; n = 2: on a movable
 *   pulley whose other segment is tied to a fixed hook). s₁ is body 1's distance from the edge pulley,
 *   y₂ body 2's depth; s₁ + n·y₂ = const, so body 1 moves toward the edge at n times body 2's speed.
 * - System (wedge): a wedge of mass M on a horizontal floor, its sloping face descending to the right at
 *   angle θ, with a block of mass m (a point) on the face. Ground frame (inertial), x to the right, y up.
 *   Constraint: the block's acceleration relative to the wedge, (a_x − A, a_y), lies along the face,
 *   so a_y = −(a_x − A)·tanθ (lesson 1.5: acceleration relative to the wedge = a − A).
 * - Dynamics: Newton's second law for each body in the ground frame, the tension T or the normal force N as
 *   unknowns. Hanging: m₁a₁ = m₁g − T, m₂a₂ = m₂g − nT (the massless pulley carries no net force, so it
 *   passes n·T to body 2). Wedge: m·a_x = N sinθ, m·a_y = N cosθ − mg, M·A = −N sinθ. Every acceleration
 *   is constant, so from rest each displacement is ½·a·t².
 * - Boundary: released from rest. The figure stops a pulley run when a body reaches a pulley or the floor,
 *   and a wedge run when the block reaches the foot of the face.
 * - Ignored: the masses and the friction of the pulleys and of the string, the string's stretch, friction
 *   on the face and on the floor, the size and rotation of the block, air resistance.
 * - Valid when: the pulleys are light and turn freely against the loads, the string does not stretch, and
 *   the surfaces are smooth (ice, an air track).
 * - Failure modes: a heavy pulley adds its moment of inertia to the masses (chapter 8) and the tension then
 *   differs on its two sides; a string can only pull, so a solution with T < 0 would mean a slack string
 *   (it never occurs from rest here); friction on the floor holds the wedge until its threshold, and then
 *   these formulas overestimate A.
 */

import { G } from './constants';

const rad = (deg: number) => (deg * Math.PI) / 180;

/* ------------------------------------------------------------------ pulleys */

export interface PulleySolution {
  /** body 1's acceleration [m/s²], positive down (hanging) or toward the edge pulley (table) */
  a1: number;
  /** body 2's acceleration [m/s²], positive down */
  a2: number;
  /** the tension, the same along the whole massless string [N] */
  T: number;
}

/**
 * Body 1 on the free end, body 2 on a pulley held by n segments (n = 1: the Atwood machine).
 * From m₁a₁ = m₁g − T, m₂a₂ = m₂g − nT and a₁ = −n·a₂:
 *   a₂ = (m₂ − n·m₁)g / (m₂ + n²·m₁),  T = (1 + n)·m₁m₂g / (m₂ + n²·m₁).
 */
export function hangingPulleys(m1: number, m2: number, n = 2, g = G): PulleySolution {
  const den = m2 + n * n * m1;
  const a2 = ((m2 - n * m1) * g) / den;
  return { a1: -n * a2, a2, T: ((1 + n) * m1 * m2 * g) / den };
}

/** The Atwood machine: two bodies on the two ends of one string over a fixed pulley (n = 1). */
export const atwood = (m1: number, m2: number, g = G): PulleySolution => hangingPulleys(m1, m2, 1, g);

/**
 * Body 1 on a smooth table, body 2 hanging on n segments below the edge pulley.
 * From m₁a₁ = T, m₂a₂ = m₂g − nT and a₁ = n·a₂:
 *   a₂ = m₂g / (m₂ + n²·m₁),  T = n·m₁m₂g / (m₂ + n²·m₁).
 */
export function tablePulleys(m1: number, m2: number, n = 1, g = G): PulleySolution {
  const den = m2 + n * n * m1;
  const a2 = (m2 * g) / den;
  return { a1: n * a2, a2, T: (n * m1 * m2 * g) / den };
}

export interface CompoundAtwood {
  /** accelerations [m/s²], positive down: body 1, the movable pulley, bodies 2 and 3 */
  a1: number;
  aP: number;
  a2: number;
  a3: number;
  /** tension in the upper string (body 1 – movable pulley) and in the lower one (bodies 2, 3) [N] */
  T1: number;
  T2: number;
}

/**
 * Body 1 on one end of a string over a fixed pulley; on the other end a movable pulley, over which a second
 * string carries bodies 2 and 3. Constraints (depths, positive down): y₁ + y_P = const and
 * (y₂ − y_P) + (y₃ − y_P) = const. The massless movable pulley: T₁ = 2T₂. Then
 *   T₂ = 4g / (4/m₁ + 1/m₂ + 1/m₃).
 */
export function compoundAtwood(m1: number, m2: number, m3: number, g = G): CompoundAtwood {
  const T2 = (4 * g) / (4 / m1 + 1 / m2 + 1 / m3);
  const T1 = 2 * T2;
  const a1 = g - T1 / m1;
  return { a1, aP: -a1, a2: g - T2 / m2, a3: g - T2 / m3, T1, T2 };
}

/* -------------------------------------------------------------------- wedge */

export interface WedgeSolution {
  /** the wedge's acceleration along x [m/s²] (negative: it recoils to the left) */
  A: number;
  /** the block's acceleration in the ground frame [m/s²] */
  ax: number;
  ay: number;
  /** the block's acceleration relative to the wedge, along the face, down the slope [m/s²] */
  aRel: number;
  /** the normal force between block and wedge [N] */
  N: number;
  /** the normal force of the floor on the wedge [N] */
  Nfloor: number;
  /** the angle below the horizontal of the block's path in the ground frame [rad] */
  pathAngle: number;
}

/**
 * A block on the smooth face of a wedge that is free on a smooth floor (face descending to the right).
 *   N = mMg cosθ / (M + m sin²θ),  A = −mg sinθ cosθ / (M + m sin²θ),
 *   a_rel = (M + m) g sinθ / (M + m sin²θ),  tan(path) = (1 + m/M) tanθ.
 */
export function freeWedge(m: number, M: number, thetaDeg: number, g = G): WedgeSolution {
  const th = rad(thetaDeg);
  const s = Math.sin(th);
  const c = Math.cos(th);
  const den = M + m * s * s;
  const N = (m * M * g * c) / den;
  const A = (-N * s) / M;
  const ax = (N * s) / m;
  const ay = (N * c) / m - g;
  return {
    A,
    ax,
    ay,
    aRel: ((M + m) * g * s) / den,
    N,
    Nfloor: M * g + N * c,
    pathAngle: Math.atan2(-ay, ax),
  };
}

/** The same block on the same face of a wedge fixed to the floor (the limit M → ∞). */
export function fixedWedge(m: number, thetaDeg: number, g = G): WedgeSolution {
  const th = rad(thetaDeg);
  const a = g * Math.sin(th);
  return {
    A: 0,
    ax: a * Math.cos(th),
    ay: -a * Math.sin(th),
    aRel: a,
    N: m * g * Math.cos(th),
    Nfloor: Number.NaN,
    pathAngle: th,
  };
}

/**
 * The same wedge problem solved without the closed form: the four equations
 *   m·a_x − N sinθ = 0,  m·a_y − N cosθ = −mg,  M·A + N sinθ = 0,  a_y + (a_x − A) tanθ = 0
 * as a linear system in (a_x, a_y, A, N), by Gaussian elimination. The tests compare it to `freeWedge`.
 */
export function freeWedgeByElimination(m: number, M: number, thetaDeg: number, g = G): { ax: number; ay: number; A: number; N: number } {
  const th = rad(thetaDeg);
  const s = Math.sin(th);
  const c = Math.cos(th);
  const t = Math.tan(th);
  const rows = [
    [m, 0, 0, -s, 0],
    [0, m, 0, -c, -m * g],
    [0, 0, M, s, 0],
    [t, 1, -t, 0, 0],
  ];
  const [ax, ay, A, N] = solveLinear(rows);
  return { ax, ay, A, N };
}

/** Solve an n×(n+1) augmented system by Gaussian elimination with partial pivoting. */
export function solveLinear(aug: number[][]): number[] {
  const a = aug.map((r) => r.slice());
  const n = a.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    [a[col], a[piv]] = [a[piv], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let k = col; k <= n; k++) a[r][k] -= f * a[col][k];
    }
  }
  return a.map((r, i) => r[n] / r[i]);
}

/**
 * A horizontal force F on the wedge's vertical back (to the right) that keeps the block at rest on the
 * smooth face: block and wedge share the acceleration g·tanθ, so F = (M + m) g tanθ and N = mg / cosθ.
 */
export function holdingForce(m: number, M: number, thetaDeg: number, g = G): { a: number; F: number; N: number } {
  const th = rad(thetaDeg);
  const a = g * Math.tan(th);
  return { a, F: (M + m) * a, N: (m * g) / Math.cos(th) };
}

/**
 * How far the wedge moves while the block slides a length L down the face from rest: the horizontal
 * momentum stays zero, so m·Δx + M·ΔX = 0 with Δx − ΔX = L cosθ, giving ΔX = −m L cosθ / (m + M).
 */
export function wedgeRecoil(m: number, M: number, thetaDeg: number, L: number): number {
  return (-m * L * Math.cos(rad(thetaDeg))) / (m + M);
}

/** Time to slide a length L along the face from rest, at the relative acceleration a_rel. */
export const slideTime = (aRel: number, L: number) => Math.sqrt((2 * L) / aRel);
