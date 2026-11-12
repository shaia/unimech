/**
 * Small oscillations about a minimum of a potential (lesson 5.2): the Taylor expansion of U(x) about a point to
 * fourth order, the osculating parabola ½U″(x₀)(x − x₀)², the frequency of small oscillations ω₀² = U″(x₀)/m, and
 * what happens when the oscillation is not small: the true period of a bound motion against 2π/ω₀, the leading
 * correction to the frequency, and the time averages of the kinetic and potential energy over a period.
 *
 * The potentials are `Potential` objects of energy.ts (lesson 3.3), so the same tools read a spring, a pendulum
 * (in its arc length), the Morse well of a molecule, a well that stiffens, a Lennard-Jones well, a spring that
 * snaps through, and a bead on a curved wire.
 *
 * MODEL SPECIFICATION
 * - System: one particle of mass m on a line (coordinate x, or the arc length s along a curve), with the kinetic
 *   energy ½m ẋ² and a potential energy U(x); no non-conservative force.
 * - Dynamics: m ẍ = −U′(x). Near a minimum x₀ (U′(x₀) = 0, U″(x₀) > 0),
 *   U(x) = U(x₀) + ½U″(x₀)(x − x₀)² + (1/6)U‴(x₀)(x − x₀)³ + (1/24)U⁗(x₀)(x − x₀)⁴ + …,
 *   and keeping the quadratic term gives harmonic motion with ω₀² = U″(x₀)/m (the harmonic approximation).
 *   The true period of the bound motion between the turning points x₁ < x₀ < x₂ is T = 2∫dx/|v| (energy.ts
 *   `period`); the time average of a function f(x) over it is (2/T)∫f dx/|v|.
 *   Leading correction (Landau & Lifshitz, Mechanics §28), with U = ½k(x − x₀)² + c₃(x − x₀)³ + c₄(x − x₀)⁴:
 *   ω ≈ ω₀ + (3β/(8ω₀) − 5α²/(12ω₀³))A², α = 3c₃/m, β = 4c₄/m, A the amplitude.
 *   Pendulum (arc length s = Lθ): U = mgL(1 − cos θ), ω₀² = g/L, exact T = 2π√(L/g)/AGM(1, cos(θ₀/2)).
 *   Morse well U = D[(1 − e^(−(x − x₀)/w))² − 1]: ω₀² = 2D/(m w²), exact T(E) = T₀/√(−E/D) for −D < E < 0.
 *   Bead on a wire (x(φ), y(φ)) under gravity: T = 2∫|dr/dφ| dφ / √(2g(y₁ − y(φ))); at the bottom of y = f(x),
 *   ω₀² = g f″(x₀) when f′(x₀) = 0; on a cycloid of generating radius R, T = 2π√(4R/g) at every amplitude.
 * - Boundary: a release at rest at a turning point (the motion is fixed by its energy and its well).
 * - Ignored: friction and drag; the rolling of a body (a bead slides); the mass of springs, wires and rods.
 * - Valid when: U has four continuous derivatives near x₀; for the approximation itself, when the first dropped
 *   term is small against the quadratic one, |U‴|A/3 ≪ U″ (an asymmetric well) and U⁗A²/12 ≪ U″ (a symmetric one).
 * - Failure modes: the finite-difference third and fourth derivatives lose digits when the step is far from
 *   ~(1e-16)^(1/5) of the length scale; `boundMotion` finds the turning points on a grid (energy.ts) and returns
 *   null when the energy is not bound on both sides of x₀; at an energy equal to a maximum of U (the top of the
 *   pendulum, E = 2mgL) the period diverges logarithmically and the quadrature does not converge.
 */

import { G } from './constants';
import { curvature, harmonicWell, morseWell, period, rootsOf, type Potential } from './energy';

/* ------------------------------------------------------------------ Taylor expansion */

/** U(x) ≈ Σ cₙ(x − x₀)ⁿ, cₙ = U⁽ⁿ⁾(x₀)/n!, to fourth order. */
export interface Taylor {
  x0: number;
  c0: number;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
}

/**
 * The Taylor coefficients of U about x₀, to fourth order: U and U′ from the potential, U″ from its d2U (or a
 * central difference of U′), U‴ and U⁗ from central differences of U″ with step h.
 */
export function taylorCoefficients(p: Potential, x0: number, h?: number): Taylor {
  const span = p.domain[1] - p.domain[0];
  const s = h ?? 5e-4 * span;
  const d2 = (x: number) => curvature(p, x);
  const u3 = (d2(x0 + s) - d2(x0 - s)) / (2 * s);
  const u4 = (d2(x0 + s) - 2 * d2(x0) + d2(x0 - s)) / (s * s);
  return { x0, c0: p.U(x0), c1: p.dU(x0), c2: d2(x0) / 2, c3: u3 / 6, c4: u4 / 24 };
}

/** The Taylor polynomial of order n (0 … 4) as a function of x. */
export function taylorPolynomial(t: Taylor, order: 0 | 1 | 2 | 3 | 4): (x: number) => number {
  const c = [t.c0, t.c1, t.c2, t.c3, t.c4];
  return (x) => {
    const d = x - t.x0;
    let sum = 0;
    for (let n = order; n >= 0; n--) sum = sum * d + c[n];
    return sum;
  };
}

/** The osculating parabola at a minimum x₀: U(x₀) + ½U″(x₀)(x − x₀)² (the slope there is zero). */
export function parabolaAt(p: Potential, x0: number): (x: number) => number {
  const U0 = p.U(x0);
  const k = curvature(p, x0);
  return (x) => U0 + 0.5 * k * (x - x0) * (x - x0);
}

/** The minimum of U nearest a guess: Newton's method on U′ = 0 with U″, then a check that it is a minimum. */
export function minimumNear(p: Potential, guess: number): number {
  let x = guess;
  for (let i = 0; i < 60; i++) {
    const k = curvature(p, x);
    const step = p.dU(x) / k;
    x -= step;
    if (Math.abs(step) < 1e-14 * Math.max(1, Math.abs(x))) break;
  }
  if (!(curvature(p, x) > 0)) throw new Error('minimumNear: no minimum near the guess');
  return x;
}

/** The angular frequency of small oscillations about the minimum x₀ [rad/s]: √(U″(x₀)/m). */
export function smallOmega(p: Potential, x0: number): number {
  const k = curvature(p, x0);
  return k > 0 ? Math.sqrt(k / p.m) : NaN;
}

/* ------------------------------------------------------------------ the true motion at a finite energy */

export interface BoundMotion {
  /** turning points on each side of the minimum [m] */
  x1: number;
  x2: number;
  /** the true period [s] and the small-oscillation period 2π√(m/U″(x₀)) [s] */
  T: number;
  T0: number;
}

/** The bound motion about the minimum x₀ at mechanical energy E, or null if E is not trapped on both sides. */
export function boundMotion(p: Potential, x0: number, E: number, n = 4000): BoundMotion | null {
  if (!(E > p.U(x0))) return null;
  const f = (x: number) => p.U(x) - E;
  const left = rootsOf(f, p.domain[0], x0, n);
  const right = rootsOf(f, x0, p.domain[1], n);
  if (!left.length || !right.length) return null;
  const x1 = left[left.length - 1];
  const x2 = right[0];
  return { x1, x2, T: period(p, E, x1, x2), T0: (2 * Math.PI) / smallOmega(p, x0) };
}

/** The energy at which a release at rest from x (on either side of the minimum) moves: U(x). */
export const energyAt = (p: Potential, x: number) => p.U(x);

export interface TimeAverages {
  T: number;
  /** ⟨K⟩ and ⟨U − U_ref⟩ over one period [J] */
  K: number;
  U: number;
}

/**
 * The time averages of the kinetic and the potential energy over one period of the bound motion between x₁ and x₂
 * at energy E. U is measured from `Uref` (the bottom of the well, by default the lower turning-point side's minimum
 * passed in). The substitution x = c + h sin θ removes the 1/√ singularity at the turning points.
 */
export function timeAverages(p: Potential, E: number, x1: number, x2: number, Uref: number, n = 4000): TimeAverages {
  const c = 0.5 * (x1 + x2);
  const h = 0.5 * (x2 - x1);
  const dth = Math.PI / n;
  let T = 0;
  let Ui = 0;
  for (let i = 0; i < n; i++) {
    const th = -Math.PI / 2 + (i + 0.5) * dth;
    const x = c + h * Math.sin(th);
    const v = Math.sqrt(Math.max(1e-300, (2 * (E - p.U(x))) / p.m));
    const dt = (h * Math.cos(th) * dth) / v;
    T += dt;
    Ui += (p.U(x) - Uref) * dt;
  }
  const avgU = Ui / T;
  return { T: 2 * T, U: avgU, K: E - Uref - avgU };
}

/**
 * The leading correction to the frequency at amplitude A (Landau & Lifshitz §28), from the Taylor coefficients:
 * ω ≈ ω₀ + (3β/(8ω₀) − 5α²/(12ω₀³))A², α = 3c₃/m, β = 4c₄/m.
 */
export function correctedOmega(t: Taylor, m: number, A: number): number {
  const w0 = Math.sqrt((2 * t.c2) / m);
  const alpha = (3 * t.c3) / m;
  const beta = (4 * t.c4) / m;
  return w0 + ((3 * beta) / (8 * w0) - (5 * alpha * alpha) / (12 * w0 ** 3)) * A * A;
}

/* ------------------------------------------------------------------ common wells */

/** A spring, U = ½kx² (energy.ts `harmonicWell`): the parabola is exact. */
export const springWell = (k: number, m: number, half: number) => harmonicWell(k, m, half, 'קפיץ');

/**
 * A simple pendulum of length L in its arc length s = Lθ from the bottom: U = mgL(1 − cos(s/L)), on −πL ≤ s ≤ πL.
 */
export function pendulumWell(m: number, L: number, g = G, label = 'מטוטלת'): Potential {
  return {
    id: 'pendulum',
    label,
    U: (s) => m * g * L * (1 - Math.cos(s / L)),
    dU: (s) => m * g * Math.sin(s / L),
    d2U: (s) => ((m * g) / L) * Math.cos(s / L),
    domain: [-Math.PI * L, Math.PI * L],
    uRange: [-0.12 * m * g * L, 2.3 * m * g * L],
    m,
  };
}

/** The arithmetic-geometric mean of a and b. */
export function agm(a: number, b: number): number {
  let x = a;
  let y = b;
  for (let i = 0; i < 60 && Math.abs(x - y) > 1e-16 * x; i++) [x, y] = [(x + y) / 2, Math.sqrt(x * y)];
  return (x + y) / 2;
}

/** The exact period of a simple pendulum released at rest at angle θ₀ [rad]: 2π√(L/g)/AGM(1, cos(θ₀/2)). */
export const pendulumPeriod = (L: number, theta0: number, g = G) => (2 * Math.PI * Math.sqrt(L / g)) / agm(1, Math.cos(theta0 / 2));

/** The Morse well of energy.ts, its small-oscillation ω₀ = √(2D/(m w²)) and its exact period T₀/√(−E/D). */
export const morse = morseWell;
export const morseOmega = (D: number, w: number, m: number) => Math.sqrt((2 * D) / (m * w * w));
export const morsePeriod = (D: number, w: number, m: number, E: number) => (2 * Math.PI) / morseOmega(D, w, m) / Math.sqrt(-E / D);

/** A well that stiffens away from its bottom: U = ½kx² + ¼βx⁴ (β > 0). */
export function stiffWell(k: number, beta: number, m: number, half: number, label = 'בור מתקשה'): Potential {
  return {
    id: 'stiff',
    label,
    U: (x) => 0.5 * k * x * x + 0.25 * beta * x ** 4,
    dU: (x) => k * x + beta * x ** 3,
    d2U: (x) => k + 3 * beta * x * x,
    domain: [-half, half],
    uRange: [-0.05 * (0.5 * k * half * half), 0.5 * k * half * half + 0.25 * beta * half ** 4],
    m,
  };
}

/** A pure quartic well, U = αx⁴: U″(0) = 0, so there is no harmonic approximation at all. */
export function quarticWell(alpha: number, m: number, half: number): Potential {
  return {
    id: 'quartic',
    label: 'בור מסדר רביעי',
    U: (x) => alpha * x ** 4,
    dU: (x) => 4 * alpha * x ** 3,
    d2U: (x) => 12 * alpha * x * x,
    domain: [-half, half],
    uRange: [0, alpha * half ** 4],
    m,
  };
}

/** The Lennard-Jones well U = ε[(r₀/r)¹² − 2(r₀/r)⁶], minimum −ε at r₀, for a particle of (reduced) mass m. */
export function lennardJones(eps: number, r0: number, m: number, domain: readonly [number, number]): Potential {
  return {
    id: 'lj',
    label: 'בור לנרד-ג׳ונס',
    U: (r) => eps * ((r0 / r) ** 12 - 2 * (r0 / r) ** 6),
    dU: (r) => (eps / r) * (-12 * (r0 / r) ** 12 + 12 * (r0 / r) ** 6),
    d2U: (r) => (eps / (r * r)) * (156 * (r0 / r) ** 12 - 84 * (r0 / r) ** 6),
    domain,
    uRange: [-1.2 * eps, eps],
    m,
  };
}

/**
 * A spring of constant k and natural length ℓ₀ whose far end is fixed a distance d from a straight frictionless
 * track; the particle on the track is at x. U = ½k(√(d² + x²) − ℓ₀)². For d < ℓ₀ the spring is compressed at x = 0,
 * which is a maximum, and the minima are at x = ±√(ℓ₀² − d²).
 */
export function snapSpring(k: number, l0: number, d: number, m: number, half: number): Potential {
  const r = (x: number) => Math.sqrt(d * d + x * x);
  return {
    id: 'snap',
    label: 'קפיץ נלחץ',
    U: (x) => 0.5 * k * (r(x) - l0) ** 2,
    dU: (x) => (k * (r(x) - l0) * x) / r(x),
    d2U: (x) => k * (1 - (l0 * d * d) / r(x) ** 3),
    domain: [-half, half],
    uRange: [0, 0.5 * k * (r(half) - l0) ** 2],
    m,
  };
}

/** The minima of the snap-through spring, ±√(ℓ₀² − d²), and the small-oscillation ω₀² = (k/m)(1 − d²/ℓ₀²) there. */
export const snapMinimum = (l0: number, d: number) => Math.sqrt(l0 * l0 - d * d);
export const snapOmega = (k: number, l0: number, d: number, m: number) => Math.sqrt((k / m) * (1 - (d * d) / (l0 * l0)));

/* ------------------------------------------------------------------ a bead on a wire */

export interface Curve {
  x: (phi: number) => number;
  y: (phi: number) => number;
  dx: (phi: number) => number;
  dy: (phi: number) => number;
}

/** A wire y = f(x), parametrised by x itself. */
export const graphCurve = (f: (x: number) => number, df: (x: number) => number): Curve => ({ x: (u) => u, y: f, dx: () => 1, dy: df });

/** A cycloid with its lowest point at the origin, generating radius R: x = R(φ + sin φ), y = R(1 − cos φ), |φ| < π. */
export const cycloid = (R: number): Curve => ({
  x: (f) => R * (f + Math.sin(f)),
  y: (f) => R * (1 - Math.cos(f)),
  dx: (f) => R * (1 + Math.cos(f)),
  dy: (f) => R * Math.sin(f),
});

/**
 * The period of a bead sliding without friction on a wire in a vertical plane (y up), released at rest at the
 * parameter φ₂ and turning back at φ₁ with y(φ₁) = y(φ₂): T = 2∫|dr/dφ| dφ / √(2g(y₂ − y(φ))).
 */
export function beadPeriod(c: Curve, phi1: number, phi2: number, g = G, n = 4000): number {
  const y0 = c.y(phi2);
  const mid = 0.5 * (phi1 + phi2);
  const h = 0.5 * (phi2 - phi1);
  const dth = Math.PI / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const th = -Math.PI / 2 + (i + 0.5) * dth;
    const f = mid + h * Math.sin(th);
    const ds = Math.hypot(c.dx(f), c.dy(f));
    const v = Math.sqrt(Math.max(1e-300, 2 * g * (y0 - c.y(f))));
    sum += (ds * h * Math.cos(th)) / v;
  }
  return 2 * sum * dth;
}

/** Small oscillations of a bead at the bottom of a wire y = f(x) (f′(x₀) = 0): ω₀² = g f″(x₀) = g/R, R the radius of curvature. */
export const beadOmega = (d2f: number, g = G) => Math.sqrt(g * d2f);

/* ------------------------------------------------------------------ the presets of lesson 5.2's figure */

export interface Well {
  potential: Potential;
  /** the minimum the figure expands about [m] */
  x0: number;
  /** the range of the energy slider [J] */
  Emin: number;
  Emax: number;
  /** the energy shown first [J] and the side the particle is released on (+1 right, −1 left) */
  E: number;
  side: 1 | -1;
  /** the stretch of x a diagram shows [m] */
  view: readonly [number, number];
}

/**
 * Lesson 5.2's wells, all with m = 1.0 kg: a spring k = 4.0 N/m (the parabola is exact); a pendulum L = 0.80 m in its
 * arc length; the Morse well of lesson 3.3 (D = 2.0 J, x₀ = 1.0 m, w = 0.50 m); a stiffening well k = 4.0 N/m,
 * β = 4.0 N/m³.
 */
/** The pendulum length of lesson 5.2's figure [m]. */
export const PENDULUM_L = 0.8;

export const WELLS = {
  spring: { potential: { ...springWell(4, 1, 2), uRange: [-0.6, 5.2] }, x0: 0, Emin: 0.1, Emax: 4.5, E: 1, side: 1, view: [-1.6, 1.6] },
  pendulum: { potential: pendulumWell(1, PENDULUM_L), x0: 0, Emin: 0.1, Emax: 15.4, E: 0.5, side: 1, view: [-2.52, 2.52] },
  morse: {
    potential: { ...morseWell(2, 1, 0.5, 1, [0.4, 4.5]), uRange: [-2.3, 0.6] },
    x0: 1,
    Emin: -1.95,
    Emax: -0.1,
    E: -1.9,
    side: 1,
    view: [0.5, 3.2],
  },
  stiff: { potential: { ...stiffWell(4, 4, 1, 2), uRange: [-0.6, 9] }, x0: 0, Emin: 0.1, Emax: 8, E: 0.1, side: 1, view: [-1.6, 1.6] },
} as const satisfies Record<string, Well>;
export type WellId = keyof typeof WELLS;
