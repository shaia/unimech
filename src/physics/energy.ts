/**
 * Motion in one dimension in a potential energy U(x) (lesson 3.3; reused by 5.2 and 6.3): reading the energy
 * diagram (turning points, the allowed region, equilibria and their stability), the motion itself under
 * F = −dU/dx with RK4, the mechanical energy and its loss to a linear drag, the period of a bound motion
 * (∮dx/v), and the period of small oscillations about a minimum, 2π√(m/U″(x₀)).
 *
 * A potential is an object {U, dU, d2U?, domain, label, …} (`Potential`), not a hard-coded formula, so a later
 * lesson can hand the same tools an effective potential or a pendulum's U(θ). The presets of lesson 3.3
 * (`harmonicWell`, `doubleWell`, `morseWell`) are factories with their parameters.
 *
 * MODEL SPECIFICATION
 * - System: one particle of mass m on a straight line (coordinate x), acted on by a conservative force
 *   F(x) = −dU/dx and, optionally, a linear drag −b v (a non-conservative force, as in lesson 2.7).
 * - Dynamics: m dv/dt = −U′(x) − b v, integrated with RK4 (`rk4Step`, motion.ts). The mechanical energy
 *   E = ½mv² + U(x) is constant when b = 0; otherwise dE/dt = −b v² = P_drag (the power of the drag), and the
 *   work of the drag W_nc = ∫P dt (Simpson's rule on the RK4 samples) equals ΔE.
 *   Conservative motion only: v(x) = ±√(2(E − U(x))/m); the allowed region is U(x) ≤ E; turning points solve
 *   U(x) = E; equilibria solve U′(x) = 0, stable where U″ > 0 and unstable where U″ < 0; the period of a
 *   bound motion between turning points x₁ < x₂ is T = 2∫dx/|v|, and near a minimum x₀ it tends to
 *   2π√(m/U″(x₀)).
 * - Boundary: the potential is given on a finite `domain` [a, b]; a particle that reaches an edge has left the
 *   region the potential describes (`escaped`), and the integration stops there.
 * - Ignored: everything that is not in U or in the drag (no friction proportional to a normal force: a particle
 *   on a line has none that the model knows); relativity (½mv² is the kinetic energy).
 * - Valid when: U is smooth (two derivatives) on the domain; dt is small against the shortest period of small
 *   oscillation, 2π√(m/max U″) (RK4's energy error per unit time falls as dt⁴).
 * - Failure modes: root finding scans the domain on a grid and refines by bisection, so two roots closer than
 *   the grid step (a tangency, E exactly at a maximum of U) can be missed or merged; an equilibrium with
 *   U″ = 0 (a flat point or an inflection) is reported 'neutral' and its stability is decided by higher
 *   derivatives this module does not take; `period` assumes the interval is bounded by two simple turning
 *   points (U′ ≠ 0 there); at E equal to a maximum of U the period diverges and the sum does not.
 */

import { rk4Step, type Body, type Force } from './motion';

export interface Potential {
  /** a short id, for presets and test names */
  id: string;
  /** a label for the reader (Hebrew in the course's presets) */
  label: string;
  /** potential energy [J] at position x [m] */
  U: (x: number) => number;
  /** dU/dx [N] */
  dU: (x: number) => number;
  /** d²U/dx² [N/m]; a central difference of dU when omitted */
  d2U?: (x: number) => number;
  /** the interval of x on which U describes the system [m] */
  domain: readonly [number, number];
  /** the range of U a diagram shows [J] */
  uRange: readonly [number, number];
  /** the particle's mass [kg] */
  m: number;
}

export type EquilibriumKind = 'stable' | 'unstable' | 'neutral';

export interface Equilibrium {
  x: number;
  U: number;
  /** U″(x) [N/m] */
  curvature: number;
  kind: EquilibriumKind;
}

/** An interval of the allowed region U ≤ E; each end is a turning point or an edge of the domain. */
export interface Interval {
  lo: number;
  hi: number;
  /** true when the end is a turning point (U = E), false when it is the edge of the domain */
  loTurn: boolean;
  hiTurn: boolean;
}

/* ------------------------------------------------------------------ presets */

/** A harmonic well, U = ½ k x²: a spring of constant k [N/m] with its equilibrium at x = 0. */
export function harmonicWell(k: number, m: number, half = 2, label = 'בור הרמוני'): Potential {
  return {
    id: 'harmonic',
    label,
    U: (x) => 0.5 * k * x * x,
    dU: (x) => k * x,
    d2U: () => k,
    domain: [-half, half],
    uRange: [-0.05 * 0.5 * k * half * half, 0.6 * 0.5 * k * half * half],
    m,
  };
}

/**
 * A symmetric double well, U = U₀((x/a)² − 1)²: minima U = 0 at x = ±a, a maximum U = U₀ at x = 0 (the hump
 * between the wells).
 */
export function doubleWell(U0: number, a: number, m: number, half = 2, label = 'בור כפול'): Potential {
  return {
    id: 'double',
    label,
    U: (x) => U0 * ((x / a) ** 2 - 1) ** 2,
    dU: (x) => ((4 * U0 * x) / (a * a)) * ((x / a) ** 2 - 1),
    d2U: (x) => ((4 * U0) / (a * a)) * (3 * (x / a) ** 2 - 1),
    domain: [-half * a, half * a],
    uRange: [-0.25 * U0, 2.5 * U0],
    m,
  };
}

/**
 * A Morse well, the shape of the potential between two atoms: U = D[(1 − e^(−(x − x₀)/w))² − 1]. Minimum −D at
 * x₀, a steep wall at small x, and U → 0 from below as x → ∞, so a particle with E ≥ 0 is not bound.
 */
export function morseWell(D: number, x0: number, w: number, m: number, domain: readonly [number, number], label = 'בור דמוי מולקולה'): Potential {
  const e = (x: number) => Math.exp(-(x - x0) / w);
  return {
    id: 'morse',
    label,
    U: (x) => D * ((1 - e(x)) ** 2 - 1),
    dU: (x) => ((2 * D) / w) * (1 - e(x)) * e(x),
    d2U: (x) => ((2 * D) / (w * w)) * e(x) * (2 * e(x) - 1),
    domain,
    uRange: [-1.25 * D, 1.5 * D],
    m,
  };
}

/** The three wells of lesson 3.3's figure: m = 1.0 kg; k = 4.0 N/m; U₀ = 2.0 J, a = 1.0 m; D = 2.0 J, x₀ = 1.0 m, w = 0.50 m. */
export const PRESETS = {
  harmonic: { ...harmonicWell(4, 1, 2), uRange: [-0.8, 5] },
  double: { ...doubleWell(2, 1, 1, 2), uRange: [-0.8, 5] },
  morse: { ...morseWell(2, 1, 0.5, 1, [0.3, 5]), uRange: [-2.8, 2.5] },
} as const satisfies Record<string, Potential>;
export type PresetId = keyof typeof PRESETS;

/* ------------------------------------------------------------------ reading the diagram */

/** The force on the particle [N]: F = −dU/dx. */
export const force = (p: Potential, x: number) => -p.dU(x);

/** U″(x) [N/m]: the preset's own, or a central difference of dU. */
export function curvature(p: Potential, x: number): number {
  if (p.d2U) return p.d2U(x);
  const h = 1e-5 * Math.max(1, Math.abs(x));
  return (p.dU(x + h) - p.dU(x - h)) / (2 * h);
}

/** The mechanical energy [J] of the particle at x moving with velocity v: E = ½mv² + U(x). */
export const mechanicalEnergy = (p: Potential, x: number, v: number) => 0.5 * p.m * v * v + p.U(x);

/** The kinetic energy K = E − U(x) [J]; negative where x is forbidden. */
export const kineticAt = (p: Potential, E: number, x: number) => E - p.U(x);

/** The speed at x for mechanical energy E [m/s]: √(2(E − U)/m), and 0 where x is forbidden. */
export const speedAt = (p: Potential, E: number, x: number) => Math.sqrt(Math.max(0, (2 * (E - p.U(x))) / p.m));

/**
 * The roots of f on [a, b]: a scan on n equal steps for sign changes, each refined by bisection to the last
 * bit. A root exactly at a grid point is kept once.
 */
export function rootsOf(f: (x: number) => number, a: number, b: number, n = 4000): number[] {
  const out: number[] = [];
  const h = (b - a) / n;
  let x0 = a;
  let f0 = f(x0);
  if (f0 === 0) out.push(x0);
  for (let i = 1; i <= n; i++) {
    const x1 = i === n ? b : a + i * h;
    const f1 = f(x1);
    if (f1 === 0) out.push(x1);
    else if (f0 !== 0 && f0 * f1 < 0) {
      let lo = x0;
      let hi = x1;
      let flo = f0;
      for (let k = 0; k < 200; k++) {
        const mid = 0.5 * (lo + hi);
        if (mid <= lo || mid >= hi) break;
        const fm = f(mid);
        if (fm === 0) {
          lo = hi = mid;
          break;
        }
        if (flo * fm < 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      out.push(0.5 * (lo + hi));
    }
    x0 = x1;
    f0 = f1;
  }
  return out;
}

/** The turning points for mechanical energy E: the roots of U(x) = E in the domain, in increasing order. */
export const turningPoints = (p: Potential, E: number, n = 4000) => rootsOf((x) => p.U(x) - E, p.domain[0], p.domain[1], n);

/** The allowed region U(x) ≤ E, as intervals; an interval that reaches an edge of the domain is not bounded there. */
export function allowedIntervals(p: Potential, E: number, n = 4000): Interval[] {
  const [a, b] = p.domain;
  const cuts = [a, ...turningPoints(p, E, n), b];
  const out: Interval[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const lo = cuts[i];
    const hi = cuts[i + 1];
    if (hi - lo <= 0) continue;
    if (p.U(0.5 * (lo + hi)) <= E) out.push({ lo, hi, loTurn: i > 0, hiTurn: i + 2 < cuts.length });
  }
  return out;
}

/** The interval of the allowed region that holds x, or null if x is forbidden. */
export function intervalAt(p: Potential, E: number, x: number): Interval | null {
  return allowedIntervals(p, E).find((iv) => x >= iv.lo - 1e-12 && x <= iv.hi + 1e-12) ?? null;
}

/** The equilibria (U′ = 0) in the domain, each classified by the sign of U″ there. */
export function equilibria(p: Potential, n = 4000): Equilibrium[] {
  const [a, b] = p.domain;
  return rootsOf(p.dU, a, b, n).map((x) => {
    const k = curvature(p, x);
    const scale = Math.max(1e-12, Math.abs(curvature(p, a)), Math.abs(curvature(p, b)));
    const kind: EquilibriumKind = Math.abs(k) < 1e-9 * scale ? 'neutral' : k > 0 ? 'stable' : 'unstable';
    return { x, U: p.U(x), curvature: k, kind };
  });
}

/** The period of small oscillations about a stable equilibrium x₀ [s]: 2π√(m/U″(x₀)). */
export function smallOscillationPeriod(p: Potential, x0: number): number {
  const k = curvature(p, x0);
  return k > 0 ? 2 * Math.PI * Math.sqrt(p.m / k) : Infinity;
}

/**
 * The period of the bound motion between two turning points x₁ < x₂ [s]: T = 2∫dx/|v|, |v| = √(2(E − U)/m).
 * The substitution x = c + h sin θ (c the midpoint, h the half-width) removes the 1/√ singularity at simple
 * turning points, and the midpoint rule in θ converges fast.
 */
export function period(p: Potential, E: number, x1: number, x2: number, n = 2000): number {
  const c = 0.5 * (x1 + x2);
  const h = 0.5 * (x2 - x1);
  const dth = Math.PI / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const th = -Math.PI / 2 + (i + 0.5) * dth;
    const x = c + h * Math.sin(th);
    const v = Math.sqrt(Math.max(1e-300, (2 * (E - p.U(x))) / p.m));
    sum += (h * Math.cos(th)) / v;
  }
  return 2 * sum * dth;
}

/* ------------------------------------------------------------------ the motion */

export interface MotionOptions {
  /** start position [m] and velocity [m/s] */
  x0: number;
  v0?: number;
  /** linear drag coefficient [kg/s]; 0 for a conservative motion */
  b?: number;
  /** step [s] and duration [s] */
  dt: number;
  tEnd: number;
}

export interface MotionSample {
  t: number;
  x: number;
  v: number;
  K: number;
  U: number;
  /** mechanical energy K + U */
  E: number;
  /** work done by the drag since t = 0 (Simpson's rule on P) [J] */
  Wnc: number;
  /** power of the drag, F·v = −b v² [W] */
  P: number;
}

export interface Motion {
  samples: MotionSample[];
  /** the time at which the particle reached an edge of the domain, or null */
  escapedAt: number | null;
}

/** The net force along x: −U′(x) − b v, as motion.ts's 3D force (the y and z parts are zero). */
export const lineForce =
  (p: Potential, b = 0): Force =>
  (pos, vel) => [-p.dU(pos[0]) - b * vel[0], 0, 0];

/** One RK4 step of m dv/dt = −U′(x) − b v. */
export function stepLine(p: Potential, x: number, v: number, dt: number, b = 0, t = 0): [number, number] {
  const body: Body = { pos: [x, 0, 0], vel: [v, 0, 0], m: p.m };
  const next = rk4Step(body, lineForce(p, b), t, dt);
  return [next.pos[0], next.vel[0]];
}

/**
 * The motion from (x₀, v₀), sampled at every step, until tEnd or until the particle leaves the domain. The
 * work of the drag is integrated independently of E, by Simpson's rule over pairs of steps (the trapezoid
 * rule on the odd step in between), so W_nc = ΔE is a check, not an identity.
 */
export function simulate(p: Potential, o: MotionOptions): Motion {
  const b = o.b ?? 0;
  const n = Math.max(1, Math.ceil(o.tEnd / o.dt - 1e-9));
  const dt = o.tEnd / n;
  const [a, bEdge] = p.domain;
  const P = (v: number) => -b * v * v;
  let x = o.x0;
  let v = o.v0 ?? 0;
  const mk = (t: number, xx: number, vv: number, W: number): MotionSample => {
    const K = 0.5 * p.m * vv * vv;
    const U = p.U(xx);
    return { t, x: xx, v: vv, K, U, E: K + U, Wnc: W, P: P(vv) };
  };
  const samples: MotionSample[] = [mk(0, x, v, 0)];
  let escapedAt: number | null = null;
  let Weven = 0; // W at the last even sample
  for (let i = 1; i <= n; i++) {
    [x, v] = stepLine(p, x, v, dt, b, (i - 1) * dt);
    let W: number;
    if (i % 2 === 0) {
      const s0 = samples[i - 2];
      const s1 = samples[i - 1];
      Weven += (dt / 3) * (s0.P + 4 * s1.P + P(v));
      W = Weven;
    } else W = Weven + 0.5 * dt * (samples[i - 1].P + P(v));
    samples.push(mk(i * dt, x, v, W));
    if (x <= a || x >= bEdge) {
      escapedAt = i * dt;
      break;
    }
  }
  return { samples, escapedAt };
}

/** The state at time t, interpolated linearly between the samples (equal steps). */
export function sampleAt(m: Motion, t: number): MotionSample {
  const s = m.samples;
  const last = s[s.length - 1];
  if (t <= 0) return s[0];
  if (t >= last.t) return last;
  const dt = s[1].t - s[0].t;
  const i = Math.min(s.length - 2, Math.floor(t / dt));
  const f = (t - s[i].t) / dt;
  const lerp = (k: keyof MotionSample) => s[i][k] * (1 - f) + s[i + 1][k] * f;
  return { t, x: lerp('x'), v: lerp('v'), K: lerp('K'), U: lerp('U'), E: lerp('E'), Wnc: lerp('Wnc'), P: lerp('P') };
}
