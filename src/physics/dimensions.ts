/**
 * Dimensions and orders of magnitude (lesson 0.1): the bookkeeping behind dimensional analysis and
 * order-of-magnitude estimates. The figure DimensionLab draws it; the lesson's worked examples, its
 * workbook and its bank recompute with it.
 *
 * MODEL SPECIFICATION
 * - System: a physical quantity is described by its dimension, the exponents (a, b, c) of mass M,
 *   length L and time T in [x] = M^a L^b T^c (mechanics needs no other base dimension). A pure number,
 *   an angle in radians and a ratio of two like quantities have [x] = M⁰L⁰T⁰ (dimensionless).
 * - Rules: the dimension of a product is the sum of the exponent vectors, of a power p of x it is
 *   p·[x]. Only quantities of one dimension may be added, subtracted or compared; the argument of
 *   exp, ln, sin and cos is dimensionless.
 * - Dimensional analysis: a target y assumed to depend only on x₁ … xₙ is written y = C·∏ xᵢ^pᵢ with C
 *   a dimensionless constant. Matching M, L and T gives three linear equations A·p = [y], where the
 *   columns of the 3×n matrix A are the [xᵢ]. `solveExponents` returns one solution (free exponents set
 *   to 0) and a basis of the null space of A: each null vector is a dimensionless group, and with k of
 *   them the analysis fixes y only up to an unknown function of the k groups, not up to a constant.
 * - Orders of magnitude: the order of x > 0 is the power of ten nearest x on a logarithmic scale,
 *   10^round(log₁₀ x); the boundary between 10ⁿ and 10ⁿ⁺¹ is √10·10ⁿ ≈ 3.16·10ⁿ. Two values are "of
 *   the same order" when their ratio is below √10 either way. A product of estimated factors has
 *   log₁₀ equal to the sum of the factors' log₁₀: multiplication is addition on the log axis.
 * - Ignored: units of temperature, current and amount of substance; numerical constants (2π, √2, ½),
 *   which dimensional analysis can never fix; signs (an order of magnitude is of |x|).
 * - Valid when: the list of variables is complete. A missing variable (a forgotten g, or the
 *   viscosity in slow flow) gives a confident wrong answer; nothing here can detect it.
 * - Failure modes: `solveExponents` eliminates in floating point with a pivot threshold of 1e-9; the
 *   exponents of mechanics are small rationals (halves, thirds), so the results are exact to ~1e-15.
 *   An inconsistent system (no product of the xᵢ has the target's dimension) returns `particular: null`.
 */

import { G_NEWTON, M_EARTH, M_MOON, R_EARTH, R_MOON } from './constants';

/** Exponents of [M, L, T]. */
export type Dim = readonly [number, number, number];

export const BASE = ['M', 'L', 'T'] as const;

/** The dimensions of the quantities the course uses, by name. */
export const DIM = {
  none: [0, 0, 0],
  mass: [1, 0, 0],
  length: [0, 1, 0],
  time: [0, 0, 1],
  area: [0, 2, 0],
  volume: [0, 3, 0],
  frequency: [0, 0, -1],
  velocity: [0, 1, -1],
  acceleration: [0, 1, -2],
  force: [1, 1, -2],
  momentum: [1, 1, -1],
  energy: [1, 2, -2],
  power: [1, 2, -3],
  pressure: [1, -1, -2],
  density: [1, -3, 0],
  linearDensity: [1, -1, 0],
  viscosity: [1, -1, -1],
  springConstant: [1, 0, -2],
  surfaceTension: [1, 0, -2],
  linearDrag: [1, 0, -1],
  quadraticDrag: [1, -1, 0],
  gravConstant: [-1, 3, -2],
  angularMomentum: [1, 2, -1],
} as const satisfies Record<string, Dim>;

/** [x^p]. */
export const dimPow = (d: Dim, p: number): Dim => [d[0] * p, d[1] * p, d[2] * p];

/** [∏ xᵢ^pᵢ] = Σ pᵢ[xᵢ]. */
export function dimProduct(factors: readonly { dim: Dim; power: number }[]): Dim {
  const out: [number, number, number] = [0, 0, 0];
  for (const f of factors) for (let k = 0; k < 3; k++) out[k] += f.dim[k] * f.power;
  return out;
}

/** a − b, component by component: what is still missing to turn [b] into [a]. */
export const dimGap = (a: Dim, b: Dim): Dim => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const dimEqual = (a: Dim, b: Dim, tol = 1e-9) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol;

export const isDimensionless = (d: Dim, tol = 1e-9) => dimEqual(d, DIM.none, tol);

/**
 * The SI unit of a dimension written with kg, m and s, e.g. [1, 1, -2] → "kg·m·s⁻²". A dimensionless
 * quantity gives "1". Exponents that are not integers are written as fractions (½ → "1/2").
 */
export function siUnit(d: Dim): string {
  const names = ['kg', 'm', 's'];
  const parts: string[] = [];
  for (let k = 0; k < 3; k++) {
    const e = d[k];
    if (Math.abs(e) < 1e-9) continue;
    parts.push(Math.abs(e - 1) < 1e-9 ? names[k] : `${names[k]}^${fraction(e)}`);
  }
  return parts.length ? parts.join('·') : '1';
}

/** A small rational exponent as text: 1.5 → "3/2", −0.5 → "−1/2", 2 → "2". */
export function fraction(x: number): string {
  for (const q of [1, 2, 3, 4, 6]) {
    const p = Math.round(x * q);
    if (Math.abs(p / q - x) < 1e-9) {
      const sign = p < 0 ? '−' : '';
      return q === 1 ? `${sign}${Math.abs(p)}` : `${sign}${Math.abs(p)}/${q}`;
    }
  }
  return x.toPrecision(3);
}

export interface ExponentSolution {
  /** one set of exponents with [∏ xᵢ^pᵢ] = target, the free ones set to 0; null if none exists */
  particular: number[] | null;
  /** a basis of the dimensionless combinations: each vector q has [∏ xᵢ^qᵢ] = 1 */
  nullspace: number[][];
  /** the number of independent equations among M, L, T for these variables */
  rank: number;
}

/**
 * Solve Σ pᵢ[xᵢ] = target for the exponents pᵢ (the heart of dimensional analysis). Gauss–Jordan
 * elimination of the 3×n system with partial pivoting.
 */
export function solveExponents(target: Dim, dims: readonly Dim[]): ExponentSolution {
  const n = dims.length;
  // augmented matrix: rows M, L, T; columns the variables, then the target
  const A = [0, 1, 2].map((k) => [...dims.map((d) => d[k]), target[k]]);
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < n && row < 3; col++) {
    let best = row;
    for (let r = row + 1; r < 3; r++) if (Math.abs(A[r][col]) > Math.abs(A[best][col])) best = r;
    if (Math.abs(A[best][col]) < 1e-9) continue;
    [A[row], A[best]] = [A[best], A[row]];
    const piv = A[row][col];
    for (let c = 0; c <= n; c++) A[row][c] /= piv;
    for (let r = 0; r < 3; r++) {
      if (r === row) continue;
      const f = A[r][col];
      if (f !== 0) for (let c = 0; c <= n; c++) A[r][c] -= f * A[row][c];
    }
    pivots.push(col);
    row++;
  }
  const rank = pivots.length;
  // a remaining row 0 = b with b ≠ 0: no product of these variables has the target's dimension
  let consistent = true;
  for (let r = rank; r < 3; r++) if (Math.abs(A[r][n]) > 1e-9) consistent = false;
  const clean = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x);
  let particular: number[] | null = null;
  if (consistent) {
    particular = new Array(n).fill(0);
    pivots.forEach((col, r) => (particular![col] = clean(A[r][n])));
  }
  const free = [...Array(n).keys()].filter((c) => !pivots.includes(c));
  const nullspace = free.map((f) => {
    const v = new Array(n).fill(0);
    v[f] = 1;
    pivots.forEach((col, r) => (v[col] = clean(-A[r][f])));
    return v;
  });
  return { particular, nullspace, rank };
}

/* ---------------------------------------------------------------- orders of magnitude */

/** The exponent n of the order of magnitude 10ⁿ of |x| (nearest on a logarithmic scale). */
export const orderOfMagnitude = (x: number): number => Math.round(Math.log10(Math.abs(x)));

/** The boundary between two orders: 10^(n + ½) = √10·10ⁿ. */
export const ORDER_BOUNDARY = Math.sqrt(10);

/** How many decades apart a and b are: log₁₀(a/b). */
export const decadesApart = (a: number, b: number) => Math.log10(Math.abs(a / b));

/** a and b are of the same order of magnitude: their ratio is below √10 either way. */
export const sameOrder = (a: number, b: number) => Math.abs(decadesApart(a, b)) < 0.5;

/** The product of estimated factors and the running log₁₀ after each: the steps of the log ladder. */
export function logLadder(factors: readonly number[]): { product: number; partial: number[] } {
  const partial: number[] = [];
  let s = 0;
  for (const f of factors) {
    s += Math.log10(f);
    partial.push(s);
  }
  return { product: 10 ** s, partial };
}

/* ---------------------------------------------------------------- the lesson's problems */

export interface DimVariable {
  /** the symbol as printed (plain text, the figure draws it in italics) */
  sym: string;
  /** what it is, in Hebrew, for the readout and the screen-reader line */
  name: string;
  dim: Dim;
}

export interface DimensionProblem {
  target: DimVariable;
  vars: DimVariable[];
}

export type DimensionPresetName = 'pendulum' | 'spring' | 'orbit' | 'amplitude';

const v = (sym: string, name: string, dim: Dim): DimVariable => ({ sym, name, dim });
const PERIOD = v('T', 'זמן המחזור', DIM.time);

/**
 * The problems of figure 0.1א: the period of a simple pendulum (m, L, g); of a body on a spring (m, k
 * and the amplitude A); of a circular orbit (G, the central mass M, the radius r); and of a pendulum
 * whose amplitude θ₀ is added to the list, so that a dimensionless variable appears.
 */
export const DIMENSION_PRESETS: Record<DimensionPresetName, DimensionProblem> = {
  pendulum: { target: PERIOD, vars: [v('m', 'מסת המשקולת', DIM.mass), v('L', 'אורך החוט', DIM.length), v('g', 'תאוצת הנפילה', DIM.acceleration)] },
  spring: { target: PERIOD, vars: [v('m', 'המסה', DIM.mass), v('k', 'קבוע הקפיץ', DIM.springConstant), v('A', 'האמפליטודה', DIM.length)] },
  orbit: { target: PERIOD, vars: [v('G', 'קבוע הכבידה', DIM.gravConstant), v('M', 'המסה המרכזית', DIM.mass), v('r', 'רדיוס המסלול', DIM.length)] },
  amplitude: {
    target: PERIOD,
    vars: [v('m', 'מסת המשקולת', DIM.mass), v('L', 'אורך החוט', DIM.length), v('g', 'תאוצת הנפילה', DIM.acceleration), v('θ₀', 'זווית השחרור', DIM.none)],
  },
};

/** One factor of an estimate: a fixed value, or a few physically motivated guesses to choose from. */
export interface EstimateFactor {
  /** the factor as printed, e.g. "R³" */
  sym: string;
  /** fixed value, or the choices */
  value?: number;
  choices?: { label: string; value: number }[];
}

export interface EstimateProblem {
  /** the quantity estimated, e.g. "M" */
  sym: string;
  unit: string;
  factors: EstimateFactor[];
  /** the value it is compared with */
  reference: number;
}

export type EstimatePresetName = 'earth-mass' | 'moon-g';

/** three densities a learner knows, kg/m³: water, rock at the surface, iron */
export const DENSITY_GUESSES = [
  { label: 'מים', value: 1000 },
  { label: 'סלע', value: 3000 },
  { label: 'ברזל', value: 8000 },
];

/**
 * The estimates of figure 0.1ב. Both rest on M = ρ·(4π/3)R³ for a uniform ball:
 * - the mass of the Earth, M = (4π/3)·R³·ρ, compared with the measured M_EARTH;
 * - the surface gravity of the Moon, g = GM/R² = (4π/3)·G·ρ·R, compared with G·M_MOON/R_MOON².
 * The density is the guess; R and G are known.
 */
export const ESTIMATE_PRESETS: Record<EstimatePresetName, EstimateProblem> = {
  'earth-mass': {
    sym: 'M',
    unit: 'kg',
    factors: [
      { sym: '4π/3', value: (4 * Math.PI) / 3 },
      { sym: 'R³', value: R_EARTH ** 3 },
      { sym: 'ρ', choices: DENSITY_GUESSES },
    ],
    reference: M_EARTH,
  },
  'moon-g': {
    sym: 'g',
    unit: 'm/s²',
    factors: [
      { sym: '4π/3', value: (4 * Math.PI) / 3 },
      { sym: 'G', value: G_NEWTON },
      { sym: 'ρ', choices: DENSITY_GUESSES },
      { sym: 'R', value: R_MOON },
    ],
    reference: (G_NEWTON * M_MOON) / (R_MOON * R_MOON),
  },
};

/** The values of an estimate's factors for one choice per choosable factor (index into its choices). */
export function estimateValues(p: EstimateProblem, choice: number): number[] {
  return p.factors.map((f) => f.value ?? f.choices![Math.max(0, Math.min(f.choices!.length - 1, choice))].value);
}
