/**
 * Ordinary differential equations for lesson 0.5: a first-order equation ẏ = f(t, y) read as a direction
 * field and integrated from an initial condition, three first-order models with closed-form solutions
 * (exponential decay, relaxation to an equilibrium, a draining barrel), and the second-order linear equation
 * with constant coefficients ẍ + γẋ + ω₀²x = 0 solved by the trial e^(st): its characteristic roots, the
 * solution that fits x(0) and ẋ(0), and the parts that solution is built from.
 *
 * MODEL SPECIFICATION
 * - System: one real unknown of time, y(t) (first order) or x(t) (second order).
 * - Dynamics: first order, ẏ = f(t, y), integrated by classical RK4 (error O(h⁴)) or forward Euler (O(h), kept
 *   only to show the difference in convergence). Closed forms: relaxation ẏ = −(y − y_eq)/τ, whose solution is
 *   y = y_eq + (y₀ − y_eq)e^(−(t−t₀)/τ) (y_eq = 0 is pure exponential decay); the barrel ḣ = −k√h (Torricelli
 *   outflow, k = (a/A)√(2g)), whose solution is √h = √h₀ − k(t − t₀)/2 until h = 0, at t₀ + 2√h₀/k.
 *   Second order, ẍ + γẋ + ω₀²x = 0 (chapter 5's form, γ = b/m, ω₀² = k/m): x = e^(st) gives
 *   s² + γs + ω₀² = 0, s₁,₂ = −γ/2 ± √(γ²/4 − ω₀²). Two real roots: x = C₁e^(s₁t) + C₂e^(s₂t). A double root
 *   s₀ = −γ/2: x = (C₁ + C₂t)e^(s₀t). Complex roots −γ/2 ± iω_d, ω_d = √(ω₀² − γ²/4): x = e^(−γt/2)(C₁cos ω_d t +
 *   C₂ sin ω_d t). The constants come from x(0) = x₀ and ẋ(0) = v₀. ω₀² may be negative (ẍ = κ²x, an unstable
 *   equilibrium): the roots are then real and one is positive.
 * - Boundary: one initial value (first order), x₀ and v₀ at t = 0 (second order).
 * - Ignored: equations that are not of these forms; nothing here solves a non-separable first-order equation in
 *   closed form (the RK4 integrator does any smooth f numerically).
 * - Valid when: f is smooth in y near the solution (then solution curves never cross). The barrel's f = −k√h is
 *   not: its slope ∂f/∂h is infinite at h = 0, every curve reaches h = 0 in finite time and merges with the
 *   solution h ≡ 0, so backward in time from h = 0 the solution is not unique.
 * - Failure modes: the regime test treats |γ²/4 − ω₀²| ≤ 1e-12·max(γ², ω₀², 1) as a double root, so a root
 *   pair a hair apart is drawn as critical; near that boundary the two-real-root and complex forms lose digits
 *   (C₁, C₂ ∝ 1/(s₁ − s₂)), which is why they hand over to the double-root form there.
 */

/* ------------------------------------------------------------------ first order */

/** The right-hand side of ẏ = f(t, y). */
export type Rhs = (t: number, y: number) => number;

/** One classical Runge–Kutta step of ẏ = f(t, y) from (t, y) by h (h may be negative: backward in time). */
export function rk4Step(f: Rhs, t: number, y: number, h: number): number {
  const k1 = f(t, y);
  const k2 = f(t + h / 2, y + (h / 2) * k1);
  const k3 = f(t + h / 2, y + (h / 2) * k2);
  const k4 = f(t + h, y + h * k3);
  return y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
}

/** One forward Euler step: follow the slope at the start for the whole step. */
export const eulerStep = (f: Rhs, t: number, y: number, h: number): number => y + h * f(t, y);

export interface Path {
  t: number[];
  y: number[];
}

/** Integrate ẏ = f(t, y) from (t₀, y₀) to t₁ in n equal steps (t₁ < t₀ integrates backward). */
export function integrate(f: Rhs, t0: number, y0: number, t1: number, n: number, method: 'rk4' | 'euler' = 'rk4'): Path {
  const h = (t1 - t0) / n;
  const step = method === 'rk4' ? rk4Step : eulerStep;
  const t = [t0];
  const y = [y0];
  let yy = y0;
  for (let i = 0; i < n; i++) {
    yy = step(f, t0 + i * h, yy, h);
    t.push(t0 + (i + 1) * h);
    y.push(yy);
  }
  return { t, y };
}

/** Relaxation to an equilibrium: ẏ = −(y − y_eq)/τ. With y_eq = 0 it is exponential decay. */
export const relaxRhs =
  (yEq: number, tau: number): Rhs =>
  (_t, y) =>
    -(y - yEq) / tau;

/** The solution of ẏ = −(y − y_eq)/τ through (t₀, y₀): y_eq + (y₀ − y_eq)e^(−(t−t₀)/τ). */
export const relaxSolution =
  (yEq: number, tau: number, t0: number, y0: number) =>
  (t: number): number =>
    yEq + (y0 - yEq) * Math.exp(-(t - t0) / tau);

/** The time for the distance from equilibrium to shrink from |y₀ − y_eq| to |y − y_eq|: τ ln(…). */
export const relaxTime = (yEq: number, tau: number, y0: number, y: number): number =>
  tau * Math.log((y0 - yEq) / (y - yEq));

/** The barrel: ḣ = −k√h (h ≥ 0), k = (a/A)√(2g) for a hole of area a in a barrel of cross-section A. */
export const tankRhs =
  (k: number): Rhs =>
  (_t, h) =>
    -k * Math.sqrt(Math.max(h, 0));

/** k = (a/A)√(2g) of a barrel of cross-section A with a hole of area a [m^½/s]. */
export const tankK = (a: number, A: number, g: number): number => (a / A) * Math.sqrt(2 * g);

/**
 * The barrel's level through (t₀, h₀): (√h₀ − k(t − t₀)/2)² while that bracket is positive, then 0. Backward
 * in time from h₀ > 0 the same formula holds; from h₀ = 0 the function returns 0 (the solution that never
 * held water; backward from an empty barrel the solution is not unique).
 */
export function tankSolution(k: number, t0: number, h0: number) {
  const r0 = Math.sqrt(Math.max(h0, 0));
  return (t: number): number => {
    if (r0 === 0) return 0;
    const r = r0 - (k * (t - t0)) / 2;
    return r > 0 ? r * r : 0;
  };
}

/** The time to empty the barrel from h₀: 2√h₀/k. */
export const emptyTime = (k: number, h0: number): number => (2 * Math.sqrt(Math.max(h0, 0))) / k;

/* ------------------------------------------------------------------ second order */

export interface Complex {
  re: number;
  im: number;
}

export type Regime = 'over' | 'critical' | 'under';

/** The discriminant of s² + γs + ω₀² = 0 divided by 4: γ²/4 − ω₀² (ω₀² may be negative). */
export const quarterDiscriminant = (gamma: number, omega0sq: number): number => (gamma * gamma) / 4 - omega0sq;

/** Two real roots, a double root, or a complex pair. */
export function regime(gamma: number, omega0sq: number): Regime {
  const d = quarterDiscriminant(gamma, omega0sq);
  const scale = Math.max(gamma * gamma, Math.abs(omega0sq), 1);
  if (Math.abs(d) <= 1e-12 * scale) return 'critical';
  return d > 0 ? 'over' : 'under';
}

/** The characteristic polynomial p(s) = s² + γs + ω₀² at a real s. */
export const charPoly = (gamma: number, omega0sq: number, s: number): number => s * s + gamma * s + omega0sq;

/**
 * The roots of s² + γs + ω₀² = 0. s₁ has the larger real part (two real roots) or the positive imaginary
 * part (a complex pair); a double root is returned twice.
 */
export function charRoots(gamma: number, omega0sq: number): [Complex, Complex] {
  const a = -gamma / 2;
  const d = quarterDiscriminant(gamma, omega0sq);
  const r = regime(gamma, omega0sq);
  if (r === 'critical') return [{ re: a, im: 0 }, { re: a, im: 0 }];
  if (r === 'under') {
    const wd = Math.sqrt(-d);
    return [{ re: a, im: wd }, { re: a, im: -wd }];
  }
  const q = Math.sqrt(d);
  return [{ re: a + q, im: 0 }, { re: a - q, im: 0 }];
}

/** The equation back from its roots (Vieta): γ = −(s₁ + s₂), ω₀² = s₁s₂ (real for a real or conjugate pair). */
export function fromRoots(s1: Complex, s2: Complex): { gamma: number; omega0sq: number } {
  return { gamma: -(s1.re + s2.re), omega0sq: s1.re * s2.re - s1.im * s2.im };
}

/** The solution of ẍ + γẋ + ω₀²x = 0 that fits x(0) = x₀ and ẋ(0) = v₀, with the parts it is built from. */
export interface SecondOrderSolution {
  regime: Regime;
  roots: [Complex, Complex];
  x: (t: number) => number;
  v: (t: number) => number;
  /**
   * The two terms whose sum is x(t): C₁e^(s₁t) and C₂e^(s₂t) (two real roots); C₁e^(s₀t) and C₂te^(s₀t) (a
   * double root); C₁e^(−γt/2)cos ω_d t and C₂e^(−γt/2)sin ω_d t (complex roots).
   */
  parts: [(t: number) => number, (t: number) => number];
  /** the constants C₁, C₂ of those parts */
  C: [number, number];
  /** the amplitude envelope A e^(−γt/2) of a complex-root solution (A = √(C₁² + C₂²)); undefined otherwise */
  envelope?: (t: number) => number;
}

export function solveSecondOrder(gamma: number, omega0sq: number, x0: number, v0: number): SecondOrderSolution {
  const roots = charRoots(gamma, omega0sq);
  const reg = regime(gamma, omega0sq);
  if (reg === 'over') {
    const s1 = roots[0].re;
    const s2 = roots[1].re;
    const C1 = (v0 - s2 * x0) / (s1 - s2);
    const C2 = (s1 * x0 - v0) / (s1 - s2);
    return {
      regime: reg,
      roots,
      C: [C1, C2],
      parts: [(t) => C1 * Math.exp(s1 * t), (t) => C2 * Math.exp(s2 * t)],
      x: (t) => C1 * Math.exp(s1 * t) + C2 * Math.exp(s2 * t),
      v: (t) => C1 * s1 * Math.exp(s1 * t) + C2 * s2 * Math.exp(s2 * t),
    };
  }
  if (reg === 'critical') {
    const s0 = -gamma / 2;
    const C1 = x0;
    const C2 = v0 - s0 * x0;
    return {
      regime: reg,
      roots,
      C: [C1, C2],
      parts: [(t) => C1 * Math.exp(s0 * t), (t) => C2 * t * Math.exp(s0 * t)],
      x: (t) => (C1 + C2 * t) * Math.exp(s0 * t),
      v: (t) => (C2 + s0 * (C1 + C2 * t)) * Math.exp(s0 * t),
    };
  }
  const a = gamma / 2;
  const wd = roots[0].im;
  const C1 = x0;
  const C2 = (v0 + a * x0) / wd;
  const A = Math.hypot(C1, C2);
  return {
    regime: reg,
    roots,
    C: [C1, C2],
    parts: [(t) => C1 * Math.exp(-a * t) * Math.cos(wd * t), (t) => C2 * Math.exp(-a * t) * Math.sin(wd * t)],
    x: (t) => Math.exp(-a * t) * (C1 * Math.cos(wd * t) + C2 * Math.sin(wd * t)),
    v: (t) =>
      Math.exp(-a * t) * ((C2 * wd - a * C1) * Math.cos(wd * t) - (C1 * wd + a * C2) * Math.sin(wd * t)),
    envelope: (t) => A * Math.exp(-a * t),
  };
}

/**
 * The times t > 0 at which a solution crosses x = 0. Two real roots: at most one, where
 * e^((s₁−s₂)t) = −C₂/C₁ > 1. A double root: at most one, t = −C₁/C₂ > 0. Complex roots: infinitely many;
 * the first `max` are returned.
 */
export function zeroCrossings(sol: SecondOrderSolution, max = 4): number[] {
  const [C1, C2] = sol.C;
  if (sol.regime === 'over') {
    const s1 = sol.roots[0].re;
    const s2 = sol.roots[1].re;
    if (C1 === 0) return [];
    const q = -C2 / C1;
    return q > 1 ? [Math.log(q) / (s1 - s2)] : [];
  }
  if (sol.regime === 'critical') {
    if (C2 === 0) return [];
    const t = -C1 / C2;
    return t > 0 ? [t] : [];
  }
  // C₁cos ω_d t + C₂ sin ω_d t = A cos(ω_d t − δ), δ = atan2(C₂, C₁): zero where ω_d t − δ = π/2 + nπ
  const wd = sol.roots[0].im;
  const delta = Math.atan2(C2, C1);
  const out: number[] = [];
  for (let n = -2; out.length < max && n < max + 4; n++) {
    const t = (Math.PI / 2 + n * Math.PI + delta) / wd;
    if (t > 1e-12) out.push(t);
  }
  return out;
}
