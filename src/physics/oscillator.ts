/**
 * The one-dimensional linear oscillator of chapter 5 (lessons 5.1–5.4): the free undamped oscillator, the damped
 * oscillator in its three regimes, and the driven oscillator (steady state, transient, resonance). Shared by the
 * lessons' figures and by their scripts, so every number of the chapter comes from one solution.
 *
 * MODEL SPECIFICATION
 * - System: one point body of mass m on a line; x is its displacement from the equilibrium position (positive
 *   along a chosen axis). It is acted on by a restoring force −k x (a spring, or any force linearised about a
 *   stable equilibrium, lesson 5.2), a linear damping force −b ẋ and, optionally, a driving force F₀ cos ωt.
 * - Dynamics: ẍ + γ ẋ + ω₀² x = f₀ cos ωt, with ω₀ = √(k/m), γ = b/m (the energy decay rate), f₀ = F₀/m and the
 *   quality factor Q = ω₀/γ.
 *   Free (f₀ = 0): with a = γ/2,
 *     under-damped (a < ω₀): x = e^(−at)(x₀ cos ω_d t + ((v₀ + a x₀)/ω_d) sin ω_d t), ω_d = √(ω₀² − a²);
 *     critical      (a = ω₀): x = e^(−at)(x₀ + (v₀ + a x₀) t);
 *     over-damped   (a > ω₀): x = c₁ e^(s₁t) + c₂ e^(s₂t), s₁,₂ = −a ± √(a² − ω₀²).
 *   Undamped (γ = 0): x = A cos(ω₀t + φ), A = √(x₀² + (v₀/ω₀)²), φ = atan2(−v₀/ω₀, x₀).
 *   Driven steady state: x = A cos(ωt − δ), A = f₀/√((ω₀² − ω²)² + γ²ω²), δ = atan2(γω, ω₀² − ω²) ∈ [0, π]
 *   (the lag of x behind the force). The full motion is the steady state plus the free solution whose initial
 *   conditions are the difference.
 * - Boundary: initial displacement x₀ and velocity v₀ at t = 0.
 * - Ignored: the spring's mass, dry (Coulomb) friction, nonlinearity of the spring (large stretches), any
 *   damping that is not linear in the velocity.
 * - Valid when: the restoring force is linear in x over the whole motion (small oscillations, lesson 5.2) and the
 *   damping is proportional to the velocity.
 * - Failure modes: near critical damping (|a − ω₀| ≪ ω₀) the under- and over-damped formulas lose digits;
 *   `regime` switches to the critical form inside a relative band CRITICAL_BAND. The amplitude peak
 *   `amplitudePeakFrequency` exists only for Q > 1/√2.
 */

import { relativeError } from './vec';

/** Relative band around a = ω₀ treated as critical damping. */
export const CRITICAL_BAND = 1e-9;

export interface Oscillator {
  /** natural angular frequency ω₀ = √(k/m) [rad/s] */
  omega0: number;
  /** damping rate γ = b/m [1/s]; 0 when undamped */
  gamma?: number;
}

export interface State {
  x: number;
  v: number;
}

export type Regime = 'undamped' | 'under' | 'critical' | 'over';

/** ω₀ = √(k/m). */
export const naturalFrequency = (k: number, m: number) => Math.sqrt(k / m);
/** T = 2π/ω. */
export const periodOf = (omega: number) => (2 * Math.PI) / omega;
/** Two springs in series: 1/k = 1/k₁ + 1/k₂. */
export const seriesK = (k1: number, k2: number) => (k1 * k2) / (k1 + k2);
/** Two springs in parallel: k = k₁ + k₂. */
export const parallelK = (k1: number, k2: number) => k1 + k2;
/** Static stretch of a vertical spring under its load: Δ = m g / k (the oscillation about it has the same ω₀). */
export const staticStretch = (m: number, k: number, g: number) => (m * g) / k;
/** Mechanical energy ½ m v² + ½ k x² (x measured from the equilibrium position). */
export const energy = (m: number, k: number, s: State) => 0.5 * m * s.v * s.v + 0.5 * k * s.x * s.x;
/** Q = ω₀/γ. */
export const qualityFactor = (o: Oscillator) => o.omega0 / (o.gamma ?? 0);

/** Amplitude and phase of the undamped motion x = A cos(ωt + φ) from x₀, v₀. */
export function amplitudePhase(omega: number, x0: number, v0: number): { A: number; phi: number } {
  return { A: Math.hypot(x0, v0 / omega), phi: Math.atan2(-v0 / omega, x0) };
}

/** Which of the free solutions applies. */
export function regime(o: Oscillator): Regime {
  const g = o.gamma ?? 0;
  if (g === 0) return 'undamped';
  const a = g / 2;
  if (relativeError(a, o.omega0) < CRITICAL_BAND) return 'critical';
  return a < o.omega0 ? 'under' : 'over';
}

/** ω_d = √(ω₀² − γ²/4) for an under-damped oscillator (0 otherwise). */
export function dampedFrequency(o: Oscillator): number {
  const a = (o.gamma ?? 0) / 2;
  return Math.sqrt(Math.max(0, o.omega0 * o.omega0 - a * a));
}

/** The free motion (no driving force) at time t from the state at t = 0. */
export function freeMotion(o: Oscillator, s0: State, t: number): State {
  const { x: x0, v: v0 } = s0;
  const w0 = o.omega0;
  const a = (o.gamma ?? 0) / 2;
  switch (regime(o)) {
    case 'undamped': {
      const c = Math.cos(w0 * t);
      const s = Math.sin(w0 * t);
      return { x: x0 * c + (v0 / w0) * s, v: -x0 * w0 * s + v0 * c };
    }
    case 'under': {
      const wd = dampedFrequency(o);
      const C = x0;
      const S = (v0 + a * x0) / wd;
      const e = Math.exp(-a * t);
      const c = Math.cos(wd * t);
      const s = Math.sin(wd * t);
      return { x: e * (C * c + S * s), v: e * ((-a * C + wd * S) * c + (-a * S - wd * C) * s) };
    }
    case 'critical': {
      const B = v0 + a * x0;
      const e = Math.exp(-a * t);
      return { x: e * (x0 + B * t), v: e * (B - a * (x0 + B * t)) };
    }
    case 'over': {
      const kappa = Math.sqrt(a * a - w0 * w0);
      const s1 = -a + kappa;
      const s2 = -a - kappa;
      const c1 = (v0 - s2 * x0) / (s1 - s2);
      const c2 = x0 - c1;
      const e1 = Math.exp(s1 * t);
      const e2 = Math.exp(s2 * t);
      return { x: c1 * e1 + c2 * e2, v: c1 * s1 * e1 + c2 * s2 * e2 };
    }
  }
}

/** Steady-state response to f₀ cos ωt: x = A cos(ωt − δ). */
export function steadyState(o: Oscillator, f0: number, omega: number): { A: number; delta: number } {
  const g = o.gamma ?? 0;
  const re = o.omega0 * o.omega0 - omega * omega;
  const im = g * omega;
  return { A: f0 / Math.hypot(re, im), delta: Math.atan2(im, re) };
}

/** The driven motion (steady state + transient) at time t from the state at t = 0. */
export function drivenMotion(o: Oscillator, f0: number, omega: number, s0: State, t: number): State {
  const { A, delta } = steadyState(o, f0, omega);
  const xs = (tt: number) => A * Math.cos(omega * tt - delta);
  const vs = (tt: number) => -A * omega * Math.sin(omega * tt - delta);
  const tr = freeMotion(o, { x: s0.x - xs(0), v: s0.v - vs(0) }, t);
  return { x: xs(t) + tr.x, v: vs(t) + tr.v };
}

/** Time-averaged power delivered by the driving force in the steady state, per unit mass: ½ γ ω² A². */
export function averagePowerPerMass(o: Oscillator, f0: number, omega: number): number {
  const { A } = steadyState(o, f0, omega);
  return 0.5 * (o.gamma ?? 0) * omega * omega * A * A;
}

/** The driving frequency of the amplitude peak, √(ω₀² − γ²/2); NaN when Q ≤ 1/√2 (no peak). */
export function amplitudePeakFrequency(o: Oscillator): number {
  const g = o.gamma ?? 0;
  const w2 = o.omega0 * o.omega0 - (g * g) / 2;
  return w2 > 0 ? Math.sqrt(w2) : Number.NaN;
}

/** The two frequencies where the average power is half its peak (the peak is at ω₀); their difference is exactly γ. */
export function halfPowerFrequencies(o: Oscillator): [number, number] {
  const a = (o.gamma ?? 0) / 2;
  const r = Math.sqrt(o.omega0 * o.omega0 + a * a);
  return [r - a, r + a];
}

/** Numerical integration with RK4 (for tests and for forces the closed forms do not cover). */
export function integrate(
  accel: (x: number, v: number, t: number) => number,
  s0: State,
  T: number,
  dt: number,
): State {
  let { x, v } = s0;
  let t = 0;
  const n = Math.max(1, Math.round(T / dt));
  const h = T / n;
  for (let i = 0; i < n; i++) {
    const k1x = v;
    const k1v = accel(x, v, t);
    const k2x = v + 0.5 * h * k1v;
    const k2v = accel(x + 0.5 * h * k1x, k2x, t + 0.5 * h);
    const k3x = v + 0.5 * h * k2v;
    const k3v = accel(x + 0.5 * h * k2x, k3x, t + 0.5 * h);
    const k4x = v + h * k3v;
    const k4v = accel(x + h * k3x, k4x, t + h);
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    t += h;
  }
  return { x, v };
}

/** The acceleration of the linear oscillator, for `integrate`. */
export const linearAccel =
  (o: Oscillator, f0 = 0, omega = 0) =>
  (x: number, v: number, t: number) =>
    -o.omega0 * o.omega0 * x - (o.gamma ?? 0) * v + f0 * Math.cos(omega * t);
