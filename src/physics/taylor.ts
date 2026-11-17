/**
 * Derivatives and approximations (lesson 0.3): the secant slope that becomes the derivative, the derivative of a
 * vector taken component by component, and the Taylor polynomial of a function about a point x₀, with the
 * interval around x₀ in which the polynomial stays within a chosen relative error of the function.
 *
 * The functions are the ones mechanics expands again and again: sin θ and cos θ (the pendulum, small angles),
 * e^(−x) (a decay, the drag of lesson 2.7), ln(1 + x) (the rocket of lesson 3.6) and the power (1 + x)ⁿ
 * (√(1 + x), 1/(1 + x)², the Lorentz factor of chapter 10). Each carries its k-th derivative in closed form, so
 * a Taylor coefficient is exact, not a finite difference.
 *
 * MODEL SPECIFICATION
 * - System: a real function f of one real variable, smooth on an open domain that contains x₀; a vector function
 *   r(t) = (x(t), y(t)) of time; the height of a ball thrown straight up, y(t) = v₀t − ½gt².
 * - Dynamics: none. The derivative is the limit of the secant slope (f(x₀ + h) − f(x₀))/h as h → 0. The Taylor
 *   polynomial of order n about x₀ is Pₙ(x) = Σₖ₌₀ⁿ f⁽ᵏ⁾(x₀)(x − x₀)ᵏ/k!: it has the value and the first n
 *   derivatives of f at x₀. The derivative of a vector is the vector of the derivatives of its Cartesian components
 *   (the unit vectors x̂, ŷ do not change).
 * - Boundary: the expansion point x₀ lies inside the domain; the interval of validity is searched inside a finite
 *   window [lo, hi] given by the caller and never crosses the edge of the domain.
 * - Ignored: functions with a jump or a kink near x₀; complex x; the remainder's exact (Lagrange) form.
 * - Valid when: |x − x₀| is small against the distance over which f changes appreciably; then the error of Pₙ
 *   is close to the first neglected (non-zero) term and shrinks like |x − x₀|ⁿ⁺¹. The forward secant has an
 *   error of order h (½f″(x₀)h), the central difference (f(x₀ + h) − f(x₀ − h))/(2h) of order h² (f‴(x₀)h²/6).
 * - Failure modes: the relative error |Pₙ − f|/|f| is infinite where f = 0 and Pₙ ≠ 0, so a validity interval
 *   ends at a zero of f (other than x₀ itself, where Pₙ(x₀) = f(x₀) and the limit is used); beyond the radius of
 *   convergence (|x| ≥ 1 for ln(1 + x) and a non-integer power) a higher order makes things worse, not better;
 *   a secant with h below ~1e-8·|x₀| loses digits to cancellation.
 */

import { G } from './constants';

export type Fn = (x: number) => number;

/** A function with its k-th derivative in closed form (k = 0 is the function itself) and its open domain. */
export interface Expandable {
  /** the k-th derivative at x */
  d: (x: number, k: number) => number;
  /** the open domain (−Infinity / Infinity allowed) */
  domain: [number, number];
}

/** k! for an integer k ≥ 0. */
export function factorial(k: number): number {
  let p = 1;
  for (let i = 2; i <= k; i++) p *= i;
  return p;
}

/** The falling factorial n(n − 1)…(n − k + 1), for any real n (1 when k = 0). */
export function fallingFactorial(n: number, k: number): number {
  let p = 1;
  for (let i = 0; i < k; i++) p *= n - i;
  return p;
}

/** The generalized binomial coefficient C(n, k) = n(n − 1)…(n − k + 1)/k!, the coefficient of xᵏ in (1 + x)ⁿ. */
export const binomial = (n: number, k: number): number => fallingFactorial(n, k) / factorial(k);

/* ------------------------------------------------------------------ the functions of the lesson */

/** sin x: the derivatives cycle sin, cos, −sin, −cos. */
export const SIN: Expandable = {
  d: (x, k) => [Math.sin(x), Math.cos(x), -Math.sin(x), -Math.cos(x)][k % 4],
  domain: [-Infinity, Infinity],
};

/** cos x: the derivatives cycle cos, −sin, −cos, sin. */
export const COS: Expandable = {
  d: (x, k) => [Math.cos(x), -Math.sin(x), -Math.cos(x), Math.sin(x)][k % 4],
  domain: [-Infinity, Infinity],
};

/** e^(s·x): the k-th derivative is sᵏ e^(s·x). */
export const expOf = (s: number): Expandable => ({
  d: (x, k) => s ** k * Math.exp(s * x),
  domain: [-Infinity, Infinity],
});

/** (1 + x)ⁿ for any real n: the k-th derivative is n(n − 1)…(n − k + 1)(1 + x)ⁿ⁻ᵏ. */
export const powerOf = (n: number): Expandable => ({
  d: (x, k) => fallingFactorial(n, k) * (1 + x) ** (n - k),
  domain: Number.isInteger(n) && n >= 0 ? [-Infinity, Infinity] : [-1, Infinity],
});

/** ln(1 + x): the k-th derivative (k ≥ 1) is (−1)ᵏ⁻¹(k − 1)!/(1 + x)ᵏ. */
export const LN1P: Expandable = {
  d: (x, k) => (k === 0 ? Math.log(1 + x) : ((k % 2 === 1 ? 1 : -1) * factorial(k - 1)) / (1 + x) ** k),
  domain: [-1, Infinity],
};

export type TaylorPresetId = 'sin' | 'cos' | 'sqrt' | 'inv2' | 'exp' | 'ln';

/** The functions the lesson's figure expands: sin θ, cos θ, √(1 + x), 1/(1 + x)², e^(−x), ln(1 + x). */
export const TAYLOR_PRESETS: Record<TaylorPresetId, Expandable> = {
  sin: SIN,
  cos: COS,
  sqrt: powerOf(0.5),
  inv2: powerOf(-2),
  exp: expOf(-1),
  ln: LN1P,
};

/** The value f(x) of an expandable function. */
export const valueOf = (g: Expandable, x: number): number => g.d(x, 0);

/* ------------------------------------------------------------------ Taylor polynomials */

/** The Taylor coefficients c₀ … c_order of g about x₀: cₖ = g⁽ᵏ⁾(x₀)/k!. */
export function taylorCoefficients(g: Expandable, x0: number, order: number): number[] {
  const c: number[] = [];
  for (let k = 0; k <= order; k++) c.push(g.d(x0, k) / factorial(k));
  return c;
}

/** The polynomial Σ cₖ(x − x₀)ᵏ, by Horner's rule. */
export function taylorPolynomial(c: number[], x0: number): Fn {
  return (x) => {
    const u = x - x0;
    let s = 0;
    for (let k = c.length - 1; k >= 0; k--) s = s * u + c[k];
    return s;
  };
}

/** The Taylor polynomial of order n of g about x₀, as a function. */
export const taylorOf = (g: Expandable, x0: number, n: number): Fn => taylorPolynomial(taylorCoefficients(g, x0, n), x0);

/**
 * The first neglected term of the order-n polynomial: the first k > n whose coefficient is not zero (searched up
 * to order n + 6), and its value cₖ(x − x₀)ᵏ at x. In sin θ about 0 the term after θ is θ³/6, not a θ² term.
 */
export function firstNeglectedTerm(g: Expandable, x0: number, n: number, x: number): { order: number; value: number } {
  const scale = Math.max(1, Math.abs(g.d(x0, 0)));
  for (let k = n + 1; k <= n + 6; k++) {
    const ck = g.d(x0, k) / factorial(k);
    if (Math.abs(ck) > 1e-12 * scale) return { order: k, value: ck * (x - x0) ** k };
  }
  return { order: n + 7, value: 0 };
}

/**
 * The relative error |approx − exact|/|exact| of an approximation. Where both vanish (the expansion point of
 * sin θ about 0) it is zero; where only the exact value vanishes it is infinite.
 */
export function approximationError(exact: number, approx: number): number {
  const diff = Math.abs(approx - exact);
  if (diff <= 1e-15 * Math.max(1, Math.abs(exact))) return 0;
  return Math.abs(exact) === 0 ? Infinity : diff / Math.abs(exact);
}

export interface ValidInterval {
  lo: number;
  hi: number;
  /** whether the error reached the tolerance on that side inside the window (false: the window's edge was reached) */
  loBounded: boolean;
  hiBounded: boolean;
}

/**
 * The interval around x₀, inside the window [lo, hi] and the domain of g, where the order-n Taylor polynomial is
 * within a relative error `tol` of g. Scans outward from x₀ in `steps` steps per side and refines each crossing
 * by bisection, so the edges are accurate to ~1e-12 of the window.
 */
export function validInterval(g: Expandable, x0: number, n: number, tol: number, window: [number, number], steps = 4000): ValidInterval {
  const P = taylorOf(g, x0, n);
  const f = (x: number) => g.d(x, 0);
  const ok = (x: number) => approximationError(f(x), P(x)) <= tol;
  const eps = 1e-9 * (window[1] - window[0]);
  const edgeLo = Math.max(window[0], g.domain[0] + eps);
  const edgeHi = Math.min(window[1], g.domain[1] - eps);
  const side = (edge: number): { at: number; bounded: boolean } => {
    const span = edge - x0;
    if (Math.abs(span) < eps) return { at: x0, bounded: false };
    let prev = x0;
    for (let i = 1; i <= steps; i++) {
      const x = x0 + (span * i) / steps;
      if (!ok(x)) {
        let a = prev;
        let b = x;
        for (let j = 0; j < 50; j++) {
          const m = 0.5 * (a + b);
          if (ok(m)) a = m;
          else b = m;
        }
        return { at: a, bounded: true };
      }
      prev = x;
    }
    return { at: edge, bounded: false };
  };
  const L = side(edgeLo);
  const H = side(edgeHi);
  return { lo: L.at, hi: H.at, loBounded: L.bounded, hiBounded: H.bounded };
}

/* ------------------------------------------------------------------ derivatives as limits */

/** The forward secant slope (f(x₀ + h) − f(x₀))/h: an average rate over [x₀, x₀ + h] (h < 0: from the left). */
export const secant = (f: Fn, x0: number, h: number): number => (f(x0 + h) - f(x0)) / h;

/** The central difference (f(x₀ + h) − f(x₀ − h))/(2h): the mean of the left and the right secants. */
export const centralDifference = (f: Fn, x0: number, h: number): number => (f(x0 + h) - f(x0 - h)) / (2 * h);

/** The derivative of a vector function r(t) = (x(t), y(t)), component by component (central differences). */
export function vectorDerivative(r: (t: number) => [number, number], t: number, h = 1e-5): [number, number] {
  const a = r(t + h);
  const b = r(t - h);
  return [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)];
}

/* ------------------------------------------------------------------ the ball of the secant figure */

/** A ball thrown straight up at v₀ = 20 m/s from y = 0 at t = 0, with g from constants.ts; y up. */
export const THROW = { v0: 20, g: G } as const;

/** Its height y(t) = v₀t − ½gt² [m]. */
export const throwHeight = (t: number): number => THROW.v0 * t - 0.5 * THROW.g * t * t;

/** Its velocity ẏ = v₀ − gt [m/s] (the derivative in closed form). */
export const throwVelocity = (t: number): number => THROW.v0 - THROW.g * t;

/** The time it is back at y = 0: 2v₀/g [s]. */
export const throwLanding = (): number => (2 * THROW.v0) / THROW.g;
