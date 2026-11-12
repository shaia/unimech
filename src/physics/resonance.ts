/**
 * The driven oscillator of lesson 5.4 read as a resonance: the complex amplitude, the resonance curves A(ω), δ(ω)
 * and the average power P̄(ω), their widths, the energy definition of Q, and how long the transient takes to die.
 * Built on the shared chapter-5 model (`oscillator.ts`); every closed form here is checked against it.
 *
 * MODEL SPECIFICATION
 * - System: one point body of mass m on a line, x its displacement from equilibrium (positive along a chosen
 *   axis), acted on by a spring −k x, a linear damping force −b ẋ and a driving force F₀ cos ωt exerted by an
 *   external agent (a motor, a hand).
 * - Dynamics: ẍ + γẋ + ω₀²x = f₀ cos ωt, γ = b/m, f₀ = F₀/m, Q = ω₀/γ (oscillator.ts). The complex method
 *   solves z̈ + γż + ω₀²z = f₀ e^(iωt) with z = X̃ e^(iωt): X̃ = f₀/(ω₀² − ω² + iγω), and x = Re z = A cos(ωt − δ)
 *   with A = |X̃|, δ = −arg X̃ ∈ [0, π].
 *   Average power of the drive in the steady state: P̄/m = ½ γ ω² A² = ½ f₀ ω A sin δ (equal: energy balance).
 *   A² is half its peak where (ω₀² − ω²)² + γ²ω² = 2 D_min (solved exactly in u = ω²); P̄ is half its peak
 *   where |ω₀² − ω²| = γω, exactly γ apart.
 *   The transient is the free damped motion: its amplitude falls as e^(−γt/2), an e-fold every 2/γ = 2Q/ω₀.
 * - Boundary: the state (x₀, v₀) at t = 0, when the drive is switched on.
 * - Ignored: the spring's mass, dry friction, a nonlinear spring, any back-reaction of the body on the driver
 *   (F₀ and ω are fixed whatever the body does).
 * - Valid when: the restoring force is linear in x over the whole motion and the damping is linear in ẋ.
 * - Failure modes: `amplitudeWidth` has no lower half-point when the A² curve at ω = 0 is already above half its
 *   peak (very heavy damping): it then returns the width from ω = 0 and flags `fromZero`. `peakAmplitude` exists
 *   only for Q > 1/√2 (otherwise the largest amplitude is the static one, at ω = 0).
 */

import { averagePowerPerMass, dampedFrequency, freeMotion, halfPowerFrequencies, steadyState, type Oscillator, type State } from './oscillator';

/* ---------------------------------------------------------------- complex numbers, as much as the method needs */

export interface Complex {
  re: number;
  im: number;
}

export const complex = (re: number, im = 0): Complex => ({ re, im });
export const cadd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const cmul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export function cdiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
/** |z| */
export const cabs = (z: Complex) => Math.hypot(z.re, z.im);
/** arg z ∈ (−π, π] */
export const carg = (z: Complex) => Math.atan2(z.im, z.re);
/** e^(iθ) = cos θ + i sin θ (Euler's formula). */
export const cis = (theta: number): Complex => ({ re: Math.cos(theta), im: Math.sin(theta) });
/** r e^(iθ) */
export const polar = (r: number, theta: number): Complex => ({ re: r * Math.cos(theta), im: r * Math.sin(theta) });

/* ---------------------------------------------------------------- the steady state by the complex method */

/** The denominator ω₀² − ω² + iγω of the complex amplitude (the "triangle" whose angle is δ). */
export function denominator(o: Oscillator, omega: number): Complex {
  return { re: o.omega0 * o.omega0 - omega * omega, im: (o.gamma ?? 0) * omega };
}

/** The complex amplitude X̃ = f₀/(ω₀² − ω² + iγω). */
export function complexAmplitude(o: Oscillator, f0: number, omega: number): Complex {
  return cdiv(complex(f0), denominator(o, omega));
}

/** A and δ read off X̃: A = |X̃|, δ = −arg X̃ (the lag of x behind the force, in [0, π]). */
export function amplitudeAndLag(o: Oscillator, f0: number, omega: number): { A: number; delta: number } {
  const X = complexAmplitude(o, f0, omega);
  let delta = -carg(X);
  if (delta < 0) delta += 2 * Math.PI; // f₀ > 0 and γω ≥ 0 keep it in [0, π]; guard −0
  return { A: cabs(X), delta };
}

/** The static displacement f₀/ω₀² = F₀/k (the response to a constant force of the same size). */
export const staticAmplitude = (o: Oscillator, f0: number) => f0 / (o.omega0 * o.omega0);

/** The amplitude at ω = ω₀: f₀/(γω₀) = Q·F₀/k. */
export const amplitudeAtNatural = (o: Oscillator, f0: number) => f0 / ((o.gamma ?? 0) * o.omega0);

/** The largest steady-state amplitude over ω, at ω_max = √(ω₀² − γ²/2): f₀/(γ ω_d). NaN when Q ≤ 1/√2. */
export function peakAmplitude(o: Oscillator, f0: number): number {
  const g = o.gamma ?? 0;
  if (o.omega0 * o.omega0 - (g * g) / 2 <= 0) return Number.NaN;
  return f0 / (g * dampedFrequency(o));
}

/* ---------------------------------------------------------------- the curves and their widths */

export interface CurveSample {
  omega: number;
  A: number;
  delta: number;
  /** average power per unit mass ½γω²A² [W/kg] */
  p: number;
}

/** n + 1 samples of A(ω), δ(ω) and P̄(ω)/m on [wMin, wMax]. */
export function resonanceCurve(o: Oscillator, f0: number, wMin: number, wMax: number, n: number): CurveSample[] {
  const out: CurveSample[] = [];
  for (let i = 0; i <= n; i++) {
    const omega = wMin + ((wMax - wMin) * i) / n;
    const { A, delta } = steadyState(o, f0, omega);
    out.push({ omega, A, delta, p: averagePowerPerMass(o, f0, omega) });
  }
  return out;
}

/**
 * The full width of A²(ω) at half its peak, exact. In u = ω²: D(u) = (ω₀² − u)² + γ²u, with its minimum D_min at
 * u* = ω₀² − γ²/2 (or at u = 0 when that is negative); the half-points solve D(u) = 2 D_min.
 */
export function amplitudeWidth(o: Oscillator): { lo: number; hi: number; width: number; fromZero: boolean } {
  const g = o.gamma ?? 0;
  const w2 = o.omega0 * o.omega0;
  const uStar = Math.max(0, w2 - (g * g) / 2);
  const Dmin = (w2 - uStar) ** 2 + g * g * uStar;
  // u² − (2ω₀² − γ²)u + ω₀⁴ − 2D_min = 0
  const bq = 2 * w2 - g * g;
  const cq = w2 * w2 - 2 * Dmin;
  const disc = Math.sqrt(bq * bq - 4 * cq);
  const uHi = (bq + disc) / 2;
  const uLo = (bq - disc) / 2;
  const hi = Math.sqrt(uHi);
  const fromZero = uLo <= 0;
  const lo = fromZero ? 0 : Math.sqrt(uLo);
  return { lo, hi, width: hi - lo, fromZero };
}

/** The full width of P̄(ω) at half its peak: exactly γ (oscillator.ts halfPowerFrequencies). */
export function powerWidth(o: Oscillator): { lo: number; hi: number; width: number } {
  const [lo, hi] = halfPowerFrequencies(o);
  return { lo, hi, width: hi - lo };
}

/** The peak of P̄/m, at ω = ω₀: f₀²/(2γ). */
export const peakPowerPerMass = (o: Oscillator, f0: number) => (f0 * f0) / (2 * (o.gamma ?? 0));

/* ---------------------------------------------------------------- energy and time */

/** Time-averaged mechanical energy per unit mass in the steady state: ¼(ω² + ω₀²)A². */
export function averageEnergyPerMass(o: Oscillator, f0: number, omega: number): number {
  const { A } = steadyState(o, f0, omega);
  return 0.25 * (omega * omega + o.omega0 * o.omega0) * A * A;
}

/** 2π × (energy stored) / (energy the damping takes per cycle), in the steady state at ω; equals Q at ω = ω₀. */
export function energyQ(o: Oscillator, f0: number, omega: number): number {
  const E = averageEnergyPerMass(o, f0, omega);
  const lostPerCycle = averagePowerPerMass(o, f0, omega) * ((2 * Math.PI) / omega);
  return (2 * Math.PI * E) / lostPerCycle;
}

/** The e-folding time of the transient's amplitude, 2/γ = 2Q/ω₀. */
export const transientTime = (o: Oscillator) => 2 / (o.gamma ?? 0);

/** The time until the transient's amplitude has fallen to the fraction `frac` of its start: (2/γ) ln(1/frac). */
export const settlingTime = (o: Oscillator, frac: number) => transientTime(o) * Math.log(1 / frac);

/** The steady-state part and the transient part of the driven motion at t, from the state s0 at t = 0. */
export function decompose(o: Oscillator, f0: number, omega: number, s0: State, t: number): { steady: State; transient: State } {
  const { A, delta } = steadyState(o, f0, omega);
  const xs = (tt: number) => A * Math.cos(omega * tt - delta);
  const vs = (tt: number) => -A * omega * Math.sin(omega * tt - delta);
  const tr = freeMotion(o, { x: s0.x - xs(0), v: s0.v - vs(0) }, t);
  return { steady: { x: xs(t), v: vs(t) }, transient: tr };
}

/**
 * The envelope of the motion from rest at ω = ω₀, weak damping: x ≈ A₀(1 − e^(−γt/2)) sin ω₀t with A₀ = f₀/(γω₀).
 * Its slope at t = 0 is f₀/(2ω₀), whatever the damping.
 */
export const resonantEnvelope = (o: Oscillator, f0: number, t: number) =>
  amplitudeAtNatural(o, f0) * (1 - Math.exp(-((o.gamma ?? 0) * t) / 2));
