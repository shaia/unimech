/**
 * Rotation about a fixed axis (lesson 8.3), on top of the shared rigid-body module: the Atwood machine over a pulley
 * that has mass, run from rest with its energy accounts, and a body pivoted on a fixed horizontal axle released from
 * rest with the line pivot–CM horizontal (a rod hinged at one end), integrated in time, with the acceleration of
 * its points and the force of the axle.
 *
 * MODEL SPECIFICATION
 * - System: (a) two blocks m₁, m₂ on a string over a pulley (moment of inertia I about its axle, radius R); m₁
 *   moves down when (m₁ − m₂)g > 0; x is m₁'s descent from rest, v its speed, ω = v/R the pulley's spin.
 *   (b) one rigid body on a fixed horizontal frictionless axle P, moment of inertia I_P about it, mass m, CM a
 *   distance d from P. φ is the angle the line P–CM has turned BELOW the horizontal (φ = 0 at release, φ = π/2 with
 *   the CM straight under P); φ̇ = ω > 0 while it falls. Coordinates: P at the origin, x toward the CM at release,
 *   y up; the CM is at (d cos φ, −d sin φ).
 * - Dynamics: (a) m₁g − T₁ = m₁a, T₂ − m₂g = m₂a, (T₁ − T₂)R = Iα, a = αR (rigidbody.atwoodMassivePulley); the
 *   motion is uniformly accelerated. (b) τ = I_P α about P: I_P φ̈ = m g d cos φ (the weight acts at the CM; the
 *   axle's force acts at P and has no torque about it). Integrated by RK4. The axle's force is F = m a_cm − m g⃗.
 * - Boundary: both start from rest; (b) at φ = 0.
 * - Ignored: the axle's friction, air, the string's mass and stretch, the slip of the string on the pulley.
 * - Valid when: the body is rigid; the string stays taut (a < g for m₁, always true here); the axle is fixed in an
 *   inertial frame.
 * - Failure modes: (a) with m₁ = m₂ nothing moves (a = 0); (b) the RK4 step must be small against the fall time
 *   √(I_P/(m g d)); `pivotedRun` returns samples up to tEnd and does not stop at φ = π.
 */

import { G } from './constants';
import { atwoodMassivePulley, rotationalKE } from './rigidbody';

// ---------------------------------------------------------------- (a) the Atwood machine with a massive pulley

export interface AtwoodState {
  a: number;
  alpha: number;
  T1: number;
  T2: number;
  /** m₁'s descent from rest [m] and the common speed of the blocks [m/s] */
  x: number;
  v: number;
  /** the pulley's spin [rad/s] and the angle it has turned [rad] */
  omega: number;
  theta: number;
  /** kinetic energies of m₁, m₂ and the pulley, and the change of the potential energy since the start [J] */
  K1: number;
  K2: number;
  Krot: number;
  dU: number;
}

/** The Atwood machine with a pulley (I, R) at time t after a release from rest. */
export function atwoodState(m1: number, m2: number, I: number, R: number, t: number, g = G): AtwoodState {
  const { a, alpha, T1, T2 } = atwoodMassivePulley(m1, m2, I, R, g);
  const x = 0.5 * a * t * t;
  const v = a * t;
  const omega = v / R;
  return {
    a,
    alpha,
    T1,
    T2,
    x,
    v,
    omega,
    theta: x / R,
    K1: 0.5 * m1 * v * v,
    K2: 0.5 * m2 * v * v,
    Krot: rotationalKE(I, omega),
    dU: -(m1 - m2) * g * x,
  };
}

/** The time m₁ takes to descend a distance D from rest (Infinity when a ≤ 0). */
export function atwoodTimeTo(m1: number, m2: number, I: number, R: number, D: number, g = G): number {
  const { a } = atwoodMassivePulley(m1, m2, I, R, g);
  return a > 0 ? Math.sqrt((2 * D) / a) : Infinity;
}

/** The share of the kinetic energy that is the pulley's rotation: (I/R²)/(m₁ + m₂ + I/R²), the same at every instant. */
export const pulleyEnergyShare = (m1: number, m2: number, I: number, R: number) => I / (R * R) / (m1 + m2 + I / (R * R));

// ---------------------------------------------------------------- (b) a body pivoted on a fixed horizontal axle

/** Angular acceleration at angle φ below the horizontal: m g d cos φ / I_P. */
export const pivotedAlpha = (Ip: number, m: number, d: number, phi: number, g = G) => (m * g * d * Math.cos(phi)) / Ip;

/** ω² at angle φ from energy, released from rest at φ = 0: the CM has dropped d sin φ, so ½ I_P ω² = m g d sin φ. */
export const pivotedOmegaSq = (Ip: number, m: number, d: number, phi: number, g = G) => (2 * m * g * d * Math.sin(phi)) / Ip;

export interface PivotSample {
  t: number;
  phi: number;
  omega: number;
}

/** RK4 run of I_P φ̈ = m g d cos φ from rest at φ = 0, n steps up to tEnd; returns n + 1 samples. */
export function pivotedRun(Ip: number, m: number, d: number, tEnd: number, n: number, g = G): PivotSample[] {
  const k = (m * g * d) / Ip;
  const f = (phi: number) => k * Math.cos(phi);
  const h = tEnd / n;
  let phi = 0;
  let w = 0;
  const out: PivotSample[] = [{ t: 0, phi, omega: w }];
  for (let i = 1; i <= n; i++) {
    const k1p = w;
    const k1w = f(phi);
    const k2p = w + 0.5 * h * k1w;
    const k2w = f(phi + 0.5 * h * k1p);
    const k3p = w + 0.5 * h * k2w;
    const k3w = f(phi + 0.5 * h * k2p);
    const k4p = w + h * k3w;
    const k4w = f(phi + h * k3p);
    phi += (h / 6) * (k1p + 2 * k2p + 2 * k3p + k4p);
    w += (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    out.push({ t: i * h, phi, omega: w });
  }
  return out;
}

/**
 * The time to swing from φ = 0 to φ = π/2 (CM straight under P), exactly: t = c/√(2k), k = m g d/I_P, with
 * c = ∫₀^{π/2} dφ/√(sin φ) = (√π/2) Γ(1/4)/Γ(3/4) = 2.62205755…
 */
export const QUARTER_SWING_INTEGRAL = 2.6220575542921198;
export const pivotedQuarterTime = (Ip: number, m: number, d: number, g = G) => QUARTER_SWING_INTEGRAL / Math.sqrt((2 * m * g * d) / Ip);

/** Acceleration of the point a distance s from P along the line P–CM, at the release (ω = 0): straight down, α s. */
export const releaseAcceleration = (Ip: number, m: number, d: number, s: number, g = G) => pivotedAlpha(Ip, m, d, 0, g) * s;

/** The distance from P beyond which points accelerate faster than g at the release: I_P/(m d) (2L/3 for a rod). */
export const fasterThanGBeyond = (Ip: number, m: number, d: number) => Ip / (m * d);

/** Acceleration of the CM [x, y] at angle φ with spin ω: tangential α d plus centripetal ω² d toward P. */
export function pivotedCmAcceleration(Ip: number, m: number, d: number, phi: number, omega: number, g = G): [number, number] {
  const al = pivotedAlpha(Ip, m, d, phi, g);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [-d * (c * omega * omega + s * al), d * (s * omega * omega - c * al)];
}

/** The force [x, y] the axle exerts on the body: F = m a_cm − m g⃗ (y up). At the release of a rod: m g/4, up. */
export function pivotForce(Ip: number, m: number, d: number, phi: number, omega: number, g = G): [number, number] {
  const [ax, ay] = pivotedCmAcceleration(Ip, m, d, phi, omega, g);
  return [m * ax, m * ay + m * g];
}
