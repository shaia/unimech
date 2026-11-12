/**
 * The simple harmonic oscillator of lesson 5.1, beyond what the shared `oscillator.ts` gives: the vertical spring
 * about its stretched equilibrium, the reference circle (the geometry of A and φ), the first moment the motion
 * reaches a given place, spring arrangements (series, parallel, a cut spring) and the period of an oscillator
 * that bounces elastically off a stop. The free motion itself is `freeMotion` / `amplitudePhase` of oscillator.ts.
 *
 * MODEL SPECIFICATION
 * - System: one point body of mass m on a line, attached to an ideal massless spring of constant k (or to an
 *   arrangement of such springs, replaced by one spring of constant k_eq). Horizontal: no friction. Vertical: the
 *   spring hangs from a fixed support and the body moves along the vertical under the spring and its weight mg.
 * - Coordinates: x is the displacement from the equilibrium position. Vertical: the axis points UP; y is the
 *   body's position measured up from the point where the spring's end sits when the spring is relaxed, so the
 *   stretch is s = −y, the equilibrium is y = −Δ with Δ = mg/k, and x = y + Δ.
 * - Dynamics: m ẍ = −k x, so x = A cos(ω₀t + φ) with ω₀ = √(k/m). Vertical: m ÿ = −k y − m g, which the shift
 *   y = x − Δ turns into the same m ẍ = −k x: gravity moves the centre, never ω₀.
 *   Reference circle: the point P = A(cos θ, sin θ), θ = ω₀t + φ, turns counter-clockwise at ω₀; its first
 *   coordinate is x and its second is −v/ω₀ (so P₀ = (x₀, −v₀/ω₀), |P₀| = A, angle φ).
 *   Elastic stop at x_w (−A < x_w < A, the body arriving from the positive side): the bounce reverses v, which on
 *   the circle jumps θ₁ → 2π − θ₁ with cos θ₁ = x_w/A; the period is T′ = 2θ₁/ω₀.
 * - Boundary: x₀ and v₀ at t = 0.
 * - Ignored: the spring's mass, friction and air, nonlinearity of the spring at large stretch or compression,
 *   the body's size (a coil spring may be compressed: Hooke's law is used on both sides of the relaxed length).
 *   The stop's collision lasts no time and is perfectly elastic.
 * - Valid when: the spring obeys Hooke's law over the whole motion and the support does not move.
 * - Failure modes: `firstTimeAt` returns NaN for |x| > A (the body never gets there); at a turning point either
 *   direction is accepted. `bouncePeriod` needs |x_w| ≤ A (otherwise the stop is never reached).
 */

import { G_NEWTON, M_MOON, R_MOON } from './constants';
import { amplitudePhase, freeMotion, naturalFrequency, staticStretch } from './oscillator';

/** Free-fall acceleration on the Moon's surface, G M/R² [m/s²] (≈ 1.62). */
export const moonGravity = () => (G_NEWTON * M_MOON) / (R_MOON * R_MOON);

/** A phase brought into (−π, π]. */
export function wrapPhase(phi: number): number {
  let p = phi % (2 * Math.PI);
  if (p <= -Math.PI) p += 2 * Math.PI;
  if (p > Math.PI) p -= 2 * Math.PI;
  return p;
}

/* ---------------------------------------------------------------- spring arrangements */

export type Arrangement = 'single' | 'series' | 'parallel';

/** n springs in series: 1/k = Σ 1/kᵢ (each carries the same force; the stretches add). */
export const seriesOf = (ks: readonly number[]) => 1 / ks.reduce((s, k) => s + 1 / k, 0);
/** n springs in parallel: k = Σ kᵢ (each stretches the same; the forces add). */
export const parallelOf = (ks: readonly number[]) => ks.reduce((s, k) => s + k, 0);
/** A piece that is a fraction f of a spring of constant k has constant k/f (the whole is its pieces in series). */
export const cutSpringK = (k: number, fraction: number) => k / fraction;
/** The equivalent constant of one spring, two identical springs in series, or two in parallel. */
export function arrangementK(kind: Arrangement, k: number): number {
  if (kind === 'series') return seriesOf([k, k]);
  if (kind === 'parallel') return parallelOf([k, k]);
  return k;
}

/* ---------------------------------------------------------------- the reference circle */

export interface CirclePoint {
  /** θ = ω₀t + φ [rad], not wrapped */
  theta: number;
  /** first coordinate: the displacement x [m] */
  px: number;
  /** second coordinate: −v/ω₀ [m] */
  py: number;
}

/** The reference point at time t for x = A cos(ω₀t + φ). */
export function referencePoint(A: number, phi: number, omega: number, t: number): CirclePoint {
  const theta = omega * t + phi;
  return { theta, px: A * Math.cos(theta), py: A * Math.sin(theta) };
}

/**
 * The earliest t ≥ 0 at which the motion x = A cos(ω₀t + φ) is at x while moving in `direction` (+1 toward +x,
 * −1 toward −x). At x = ±A (a turning point) the direction is ignored. NaN when |x| > A.
 */
export function firstTimeAt(omega: number, A: number, phi: number, x: number, direction: 1 | -1): number {
  const c = x / A;
  if (Math.abs(c) > 1 + 1e-12) return Number.NaN;
  const a = Math.acos(Math.max(-1, Math.min(1, c)));
  // v = −Aω sin θ: moving toward +x needs sin θ < 0, so θ = −a (mod 2π); toward −x, θ = +a
  const target = direction > 0 ? -a : a;
  const twoPi = 2 * Math.PI;
  let d = (target - phi) % twoPi;
  if (d < 0) d += twoPi;
  if (d > twoPi - 1e-12 || d === 0) return 0; // a turning point now (and never −0)
  return d / omega;
}

/* ---------------------------------------------------------------- the vertical spring */

export interface VerticalSpring {
  m: number;
  k: number;
  /** free-fall acceleration [m/s²]; 0 in orbit */
  g: number;
}

export interface VerticalState {
  /** displacement from the equilibrium, up positive [m] */
  x: number;
  /** velocity, up positive [m/s] */
  v: number;
  /** position measured up from the relaxed-length point [m] */
  y: number;
  /** stretch of the spring, s = −y [m] (negative: compressed) */
  stretch: number;
}

/** The static stretch Δ = mg/k of the vertical spring. */
export const equilibriumStretch = (s: VerticalSpring) => staticStretch(s.m, s.k, s.g);

/** The vertical motion from x₀, v₀ (about the equilibrium, up positive): the free oscillation shifted by −Δ. */
export function verticalMotion(s: VerticalSpring, x0: number, v0: number, t: number): VerticalState {
  const D = equilibriumStretch(s);
  const st = freeMotion({ omega0: naturalFrequency(s.k, s.m) }, { x: x0, v: v0 }, t);
  const y = st.x - D;
  return { x: st.x, v: st.v, y, stretch: -y };
}

/** The largest and smallest stretch over the motion, Δ + A and Δ − A (negative: the spring is compressed). */
export function stretchRange(s: VerticalSpring, x0: number, v0: number): { max: number; min: number; A: number } {
  const D = equilibriumStretch(s);
  const { A } = amplitudePhase(naturalFrequency(s.k, s.m), x0, v0);
  return { max: D + A, min: D - A, A };
}

/** The acceleration in relaxed-length coordinates, ÿ = −(k/m) y − g, for numerical checks. */
export const verticalAccel = (s: VerticalSpring) => (y: number) => -(s.k / s.m) * y - s.g;

/** Mechanical energy in relaxed-length coordinates: ½mv² + ½ky² + mgy (spring plus gravity, zero at y = 0). */
export const verticalEnergy = (s: VerticalSpring, y: number, v: number) => 0.5 * s.m * v * v + 0.5 * s.k * y * y + s.m * s.g * y;

/* ---------------------------------------------------------------- an elastic stop */

/** The period of an oscillator of amplitude A that bounces elastically off a stop at x_w (|x_w| ≤ A): 2 arccos(x_w/A)/ω₀. */
export function bouncePeriod(omega: number, A: number, xWall: number): number {
  const c = xWall / A;
  if (Math.abs(c) > 1 + 1e-12) return Number.NaN;
  return (2 * Math.acos(Math.max(-1, Math.min(1, c)))) / omega;
}
