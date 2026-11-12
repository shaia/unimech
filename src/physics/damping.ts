/**
 * The damped oscillator of lesson 5.3, read through its characteristic equation: the roots s₁, s₂ of
 * s² + γ s + ω₀² = 0, the envelope of the under-damped motion, the logarithmic decrement, the energy lost per
 * cycle and the number of cycles (or the time) until the energy falls by a given factor, the decay rate of the
 * slowest part of the motion, the settling time and the single zero crossing of an over-damped motion.
 * The motion itself comes from the shared `oscillator.ts` (`freeMotion`, `regime`, `dampedFrequency`).
 *
 * MODEL SPECIFICATION
 * - System: one point body of mass m on a line, x its displacement from the equilibrium position, acted on by a
 *   linear restoring force −k x (exerted by a spring) and a linear damping force −b ẋ (exerted by a fluid or a
 *   dashpot). No driving force.
 * - Dynamics: ẍ + γ ẋ + ω₀² x = 0, γ = b/m, ω₀ = √(k/m), Q = ω₀/γ. The trial solution e^(st) turns it into
 *   s² + γ s + ω₀² = 0, s₁,₂ = −γ/2 ± √(γ²/4 − ω₀²): complex (under-damped, γ < 2ω₀), a double root −ω₀ (critical,
 *   γ = 2ω₀), or two negative reals (over-damped, γ > 2ω₀). The mechanical energy E = ½mẋ² + ½kx² obeys
 *   dE/dt = −b ẋ² exactly; averaged over a cycle of weak damping, dE/dt = −γE, so E ∝ e^(−γt) and the amplitude
 *   ∝ e^(−γt/2).
 * - Boundary: x₀ and v₀ at t = 0.
 * - Ignored: dry (Coulomb) friction, damping that is not linear in ẋ, the spring's mass, any driving force.
 * - Valid when: the restoring force is linear over the whole motion and the damping force is proportional to the
 *   velocity (a body moving slowly through a viscous fluid, an oil dashpot, eddy-current braking).
 * - Failure modes: the "energy per cycle" functions use cycle averages, which are exact for the envelope
 *   (successive maxima are exactly e^(−γT_d/2) apart) but only approximate for the instantaneous energy, which
 *   falls in steps; `cyclesUntilEnergyFactor` and `energyLossPerCycle` are meaningful for an under-damped
 *   oscillator only (NaN otherwise). `settlingTime` scans the closed-form motion on a finite grid and refines by
 *   bisection; it is accurate to the grid's resolution of the last band crossing.
 */

import { dampedFrequency, energy, freeMotion, regime, type Oscillator, type State } from './oscillator';

export interface Complex {
  re: number;
  im: number;
}

/** The two roots of s² + γ s + ω₀² = 0; s₁ has the larger real part (or the positive imaginary part). */
export function characteristicRoots(o: Oscillator): [Complex, Complex] {
  const a = (o.gamma ?? 0) / 2;
  const disc = a * a - o.omega0 * o.omega0;
  if (regime(o) === 'critical') return [{ re: -a, im: 0 }, { re: -a, im: 0 }];
  if (disc < 0) {
    const wd = Math.sqrt(-disc);
    return [{ re: -a, im: wd }, { re: -a, im: -wd }];
  }
  const kappa = Math.sqrt(disc);
  return [{ re: -a + kappa, im: 0 }, { re: -a - kappa, im: 0 }];
}

/** The critical damping coefficient b_c = 2√(km) [kg/s]. */
export const criticalB = (k: number, m: number) => 2 * Math.sqrt(k * m);

/** The damped period T_d = 2π/ω_d of an under-damped oscillator (∞ otherwise). */
export function dampedPeriod(o: Oscillator): number {
  const wd = dampedFrequency(o);
  return wd > 0 ? (2 * Math.PI) / wd : Number.POSITIVE_INFINITY;
}

/** The amplitude of the envelope at t = 0 for an under-damped motion: x = A₀ e^(−γt/2) cos(ω_d t + φ). */
export function envelopeAmplitude(o: Oscillator, s0: State): number {
  const wd = dampedFrequency(o);
  const a = (o.gamma ?? 0) / 2;
  if (!(wd > 0)) return Number.NaN;
  return Math.hypot(s0.x, (s0.v + a * s0.x) / wd);
}

/** The envelope A₀ e^(−γt/2) of an under-damped motion at time t. */
export function envelope(o: Oscillator, s0: State, t: number): number {
  return envelopeAmplitude(o, s0) * Math.exp((-(o.gamma ?? 0) * t) / 2);
}

/** The logarithmic decrement Λ = ln(x_n / x_(n+1)) between successive maxima: γ T_d / 2. */
export function logDecrement(o: Oscillator): number {
  return ((o.gamma ?? 0) * dampedPeriod(o)) / 2;
}

/** The fraction of the (cycle-averaged) energy lost in one damped period: 1 − e^(−γT_d); ≈ 2π/Q when Q ≫ 1. */
export function energyLossPerCycle(o: Oscillator): number {
  const T = dampedPeriod(o);
  return Number.isFinite(T) ? 1 - Math.exp(-(o.gamma ?? 0) * T) : Number.NaN;
}

/** The time for the (cycle-averaged) energy to fall by `factor` (> 1): ln(factor)/γ. */
export const timeUntilEnergyFactor = (o: Oscillator, factor: number) => Math.log(factor) / (o.gamma ?? 0);

/** The time for the amplitude to fall by `factor` (> 1): 2 ln(factor)/γ. */
export const timeUntilAmplitudeFactor = (o: Oscillator, factor: number) => (2 * Math.log(factor)) / (o.gamma ?? 0);

/** The number of damped periods until the energy falls by `factor`: ln(factor)/(γ T_d) (≈ Q ln(factor)/2π). */
export function cyclesUntilEnergyFactor(o: Oscillator, factor: number): number {
  const T = dampedPeriod(o);
  return Number.isFinite(T) ? Math.log(factor) / ((o.gamma ?? 0) * T) : Number.NaN;
}

/** The decay rate of the slowest part of the free motion: γ/2 (under-damped and critical), −s₁ (over-damped). */
export function slowestRate(o: Oscillator): number {
  const [s1] = characteristicRoots(o);
  return -s1.re;
}

/** The mechanical energy ½mẋ² + ½kx² at time t, with k = mω₀². */
export function energyAt(o: Oscillator, m: number, s0: State, t: number): number {
  return energy(m, m * o.omega0 * o.omega0, freeMotion(o, s0, t));
}

/** The power the damping force takes out, b ẋ² = mγẋ² (positive), at time t. */
export function dissipatedPower(o: Oscillator, m: number, s0: State, t: number): number {
  const v = freeMotion(o, s0, t).v;
  return m * (o.gamma ?? 0) * v * v;
}

/**
 * The single time an over-damped (or critical) motion passes x = 0, or null if it never does after t = 0.
 * Over-damped: x = c₁e^(s₁t) + c₂e^(s₂t) = 0 ⇔ e^((s₁−s₂)t) = −c₂/c₁, a monotonic function: at most one root.
 */
export function crossingTime(o: Oscillator, s0: State): number | null {
  const r = regime(o);
  if (r === 'critical') {
    const a = (o.gamma ?? 0) / 2;
    const B = s0.v + a * s0.x;
    if (B === 0) return null;
    const t = -s0.x / B;
    return t > 0 ? t : null;
  }
  if (r !== 'over') return null;
  const [s1, s2] = characteristicRoots(o);
  const c1 = (s0.v - s2.re * s0.x) / (s1.re - s2.re);
  const c2 = s0.x - c1;
  if (c1 === 0) return null;
  const q = -c2 / c1;
  if (!(q > 1)) return null;
  return Math.log(q) / (s1.re - s2.re);
}

/**
 * The settling time: the earliest t_s after which |x(t)| ≤ tol·scale for all later t, with scale = |x₀| unless
 * given. Scans the closed form on a grid of `n` steps up to `horizon`, then bisects the last exit from the band.
 */
export function settlingTime(o: Oscillator, s0: State, tol: number, horizon: number, n = 20000, scale?: number): number {
  const band = tol * (scale ?? Math.abs(s0.x));
  const out = (t: number) => Math.abs(freeMotion(o, s0, t).x) > band;
  let last = -1;
  for (let i = n; i >= 0; i--) {
    if (out((horizon * i) / n)) {
      last = i;
      break;
    }
  }
  if (last < 0) return 0;
  if (last === n) return Number.POSITIVE_INFINITY;
  let lo = (horizon * last) / n;
  let hi = (horizon * (last + 1)) / n;
  for (let k = 0; k < 60; k++) {
    const mid = 0.5 * (lo + hi);
    if (out(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}
