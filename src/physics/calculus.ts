/**
 * One-variable calculus for chapter 8's primer (lessons 8.1–8.2): the secant slope that shrinks to
 * the derivative, and Riemann sums that converge to the integral. Later lessons reuse `riemann` for
 * every "sum of small pieces" they integrate numerically.
 *
 * MODEL SPECIFICATION
 * - System: a real function f of one variable, smooth on the interval used.
 * - Dynamics: none. The derivative is the limit of the secant slope (f(x+h) − f(x))/h as h → 0; the
 *   definite integral is the limit of Σ f(xᵢ)·Δx as the number of pieces N → ∞.
 * - Boundary: the interval [a, b] is closed and finite; a > b gives the negative of [b, a].
 * - Ignored: functions with jumps or infinities inside the interval (improper integrals).
 * - Valid when: f is smooth near x (derivative) or on [a, b] (integral). Errors: the forward secant
 *   is O(h), the central difference O(h²); left/right sums O(1/N), midpoint and trapezoid O(1/N²).
 * - Failure modes: h below ~1e-8·|x| loses digits to cancellation (the derivative gets worse, not
 *   better); a function singular inside [a, b] makes every sum meaningless.
 */

export type Fn = (x: number) => number;

/** Slope of the secant through (x, f(x)) and (x+h, f(x+h)): the "average rate" over [x, x+h]. */
export const secantSlope = (f: Fn, x: number, h: number): number => (f(x + h) - f(x)) / h;

/**
 * The derivative f′(x) by the central difference (f(x+h) − f(x−h))/(2h), error O(h²). The default h
 * balances truncation against rounding for |x| of order 1.
 */
export const derivative = (f: Fn, x: number, h = 1e-5 * Math.max(1, Math.abs(x))): number =>
  (f(x + h) - f(x - h)) / (2 * h);

/** The tangent line of f at x₀, as a function: y = f(x₀) + f′(x₀)(x − x₀). */
export function tangentLine(f: Fn, x0: number): Fn {
  const y0 = f(x0);
  const m = derivative(f, x0);
  return (x) => y0 + m * (x - x0);
}

export type RiemannRule = 'left' | 'right' | 'mid' | 'trapezoid';

/** One rectangle (or trapezoid) of a Riemann sum, for drawing: from x0 to x1, signed heights. */
export interface RiemannPiece {
  x0: number;
  x1: number;
  /** the height used for a rectangle; for the trapezoid rule, the average of the two ends */
  height: number;
  /** the ends of a trapezoid (equal to `height` for a rectangle) */
  y0: number;
  y1: number;
}

/** The N pieces of a Riemann sum of f over [a, b] under a rule. */
export function riemannPieces(f: Fn, a: number, b: number, n: number, rule: RiemannRule = 'mid'): RiemannPiece[] {
  const dx = (b - a) / n;
  const pieces: RiemannPiece[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = a + i * dx;
    const x1 = x0 + dx;
    if (rule === 'trapezoid') {
      const y0 = f(x0);
      const y1 = f(x1);
      pieces.push({ x0, x1, height: (y0 + y1) / 2, y0, y1 });
    } else {
      const h = f(rule === 'left' ? x0 : rule === 'right' ? x1 : x0 + dx / 2);
      pieces.push({ x0, x1, height: h, y0: h, y1: h });
    }
  }
  return pieces;
}

/** Riemann sum Σ f(xᵢ)Δx of f over [a, b] with n pieces: the integral's approximation. */
export function riemann(f: Fn, a: number, b: number, n: number, rule: RiemannRule = 'mid'): number {
  const dx = (b - a) / n;
  let s = 0;
  if (rule === 'trapezoid') {
    s = (f(a) + f(b)) / 2;
    for (let i = 1; i < n; i++) s += f(a + i * dx);
    return s * dx;
  }
  const off = rule === 'left' ? 0 : rule === 'right' ? 1 : 0.5;
  for (let i = 0; i < n; i++) s += f(a + (i + off) * dx);
  return s * dx;
}

/**
 * The accumulated integral F(x) = ∫ₐˣ f dt sampled at n+1 points: the antiderivative that the
 * fundamental theorem says has F′ = f. Midpoint pieces between samples.
 */
export function accumulate(f: Fn, a: number, b: number, n: number): { x: number[]; F: number[] } {
  const dx = (b - a) / n;
  const x = [a];
  const F = [0];
  for (let i = 0; i < n; i++) {
    x.push(a + (i + 1) * dx);
    F.push(F[i] + f(a + (i + 0.5) * dx) * dx);
  }
  return { x, F };
}
