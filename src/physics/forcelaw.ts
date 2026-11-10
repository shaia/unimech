/**
 * The equation of motion along a line, m dv/dt = F, when the force is a known function of the time alone or of
 * the position alone (lesson 2.8). A force of time is integrated twice in time; a force of position is turned
 * into an integral over x by the chain rule, a = dv/dt = v dv/dx, so that m v dv = F(x) dx.
 *
 * MODEL SPECIFICATION
 * - System: one point body of mass m on a line (x in metres, t in seconds, F in newtons), with the initial
 *   conditions x(0) = x₀, v(0) = v₀. The force is either F(t), a prescribed history that does not care where the
 *   body is, or F(x), a field that depends only on where the body is (a spring, the pull of the Earth along a
 *   radius). A force that depends on the velocity is lesson 2.7's and is not handled here.
 * - Dynamics: Newton's second law along the line.
 *     F(t):  v(t) = v₀ + (1/m)∫₀ᵗ F dt′,  x(t) = x₀ + ∫₀ᵗ v dt′   (two running integrals)
 *     F(x):  ½v² − ½v₀² = (1/m)∫ₓ₀ˣ F dx′                       (the chain rule, then one integral over x)
 *   with closed forms for the presets of the figure and the worked examples: a constant force (lesson 1.2's
 *   uniform acceleration), a ramp F = ct, a phased cosine F = F₀cos(ωt + φ) (sine and cosine are φ = −π/2 and 0),
 *   a decaying push F = F₀e^(−t/τ); a spring F = −kx, a stiff spring F = −kx³, an inverse-square pull
 *   F = −GMm/r² along a radius.
 * - Boundary: t ≥ 0. Along a radius r > 0; a fall stops at the surface (the caller's `stop`).
 * - Ignored: every force the caller leaves out (friction, drag, the Earth's rotation), the body's size.
 * - Valid when: the force is a function of t alone or of x alone. The running integral in time uses midpoint
 *   pieces for v and trapezoids for x, both O(1/n²); the integral over x uses calculus.riemann's midpoint rule,
 *   O(1/n²); the time stepping of an F(x) motion is motion.ts's RK4, O(dt⁴).
 * - Failure modes: under F(x) the chain rule gives only v², so the sign of v must come from the direction of
 *   motion, and where v² would turn negative the body never gets there (it turns back first): `speedFromForce`
 *   returns NaN there. The time to reach a point, ∫dx/|v|, has an integrable 1/√ singularity where the body starts
 *   from rest; `travelTime` handles it with a substitution, a plain Riemann sum does not converge well.
 */

import { G_NEWTON, M_EARTH } from './constants';
import { accumulate, riemann } from './calculus';
import { rk4Step, type Body } from './motion';

export type ForceOfTime = (t: number) => number;
export type ForceOfPosition = (x: number) => number;

/** One instant of a motion along a line. */
export interface LineState {
  x: number;
  v: number;
}

export interface TimeSample extends LineState {
  t: number;
  /** the force at that instant [N] */
  F: number;
}

/* ---------------------------------------------------------------- F(t): two integrations in time */

/**
 * The motion under a force of time, as two running integrals on n equal steps up to T:
 * v = v₀ + (1/m)∫F dt′ (midpoint pieces, calculus.accumulate), then x = x₀ + ∫v dt′ (trapezoids over the v samples).
 * Returns the n + 1 samples, the first being (0, x₀, v₀).
 */
export function integrateForceOfTime(F: ForceOfTime, m: number, x0: number, v0: number, T: number, n: number): TimeSample[] {
  const { x: ts, F: impulse } = accumulate(F, 0, T, n);
  const dt = T / n;
  const out: TimeSample[] = [{ t: 0, x: x0, v: v0, F: F(0) }];
  let x = x0;
  for (let i = 1; i <= n; i++) {
    const v = v0 + impulse[i] / m;
    x += ((out[i - 1].v + v) / 2) * dt;
    out.push({ t: ts[i], x, v, F: F(ts[i]) });
  }
  return out;
}

/** Linear interpolation in a run of samples at time t (clamped to the run). */
export function sampleAt(run: TimeSample[], t: number): TimeSample {
  const T = run[run.length - 1].t;
  const n = run.length - 1;
  const u = Math.max(0, Math.min(n, (t / T) * n));
  const i = Math.min(n - 1, Math.floor(u));
  const f = u - i;
  const a = run[i];
  const b = run[i + 1];
  return { t, x: a.x + (b.x - a.x) * f, v: a.v + (b.v - a.v) * f, F: a.F + (b.F - a.F) * f };
}

/** A constant force F₀: v = v₀ + (F₀/m)t, x = x₀ + v₀t + ½(F₀/m)t², lesson 1.2's uniform acceleration. */
export function constantForceState(F0: number, m: number, x0: number, v0: number, t: number): LineState {
  const a = F0 / m;
  return { x: x0 + v0 * t + 0.5 * a * t * t, v: v0 + a * t };
}

/** A ramp F = ct: v = v₀ + ct²/(2m), x = x₀ + v₀t + ct³/(6m). */
export function rampForceState(c: number, m: number, x0: number, v0: number, t: number): LineState {
  return { x: x0 + v0 * t + (c * t ** 3) / (6 * m), v: v0 + (c * t * t) / (2 * m) };
}

/**
 * A phased cosine F = F₀cos(ωt + φ), switched on at t = 0:
 *   v = v₀ + (F₀/mω)[sin(ωt + φ) − sin φ],
 *   x = x₀ + (v₀ − F₀ sin φ/(mω)) t − (F₀/mω²)[cos(ωt + φ) − cos φ].
 * φ = 0 is F₀cos ωt; φ = −π/2 is F₀sin ωt.
 */
export function phasedCosineState(F0: number, omega: number, phi: number, m: number, x0: number, v0: number, t: number): LineState {
  const k = F0 / (m * omega);
  const q = F0 / (m * omega * omega);
  return {
    v: v0 + k * (Math.sin(omega * t + phi) - Math.sin(phi)),
    x: x0 + (v0 - k * Math.sin(phi)) * t - q * (Math.cos(omega * t + phi) - Math.cos(phi)),
  };
}

/**
 * Under F₀cos(ωt + φ) the velocity is a fixed drift plus an oscillation of zero average: the drift, the average
 * velocity over a period, is v₀ − F₀ sin φ/(mω). It is set by the phase at which the force was switched on.
 */
export const driftVelocity = (F0: number, omega: number, phi: number, m: number, v0: number): number => v0 - (F0 * Math.sin(phi)) / (m * omega);

/** A push that decays, F = F₀e^(−t/τ): v = v₀ + (F₀τ/m)(1 − e^(−t/τ)), x = x₀ + v₀t + (F₀τ/m)(t − τ(1 − e^(−t/τ))). */
export function decayingForceState(F0: number, tau: number, m: number, x0: number, v0: number, t: number): LineState {
  const vInf = (F0 * tau) / m;
  const e = Math.exp(-t / tau);
  return { v: v0 + vInf * (1 - e), x: x0 + v0 * t + vInf * (t - tau * (1 - e)) };
}

/* ---------------------------------------------------------------- F(x): the chain rule */

/** v² at x from the chain rule: v² = v₀² + (2/m)∫ₓ₀ˣ F dx′ (midpoint rule, n pieces). */
export function speedSquaredFromForce(F: ForceOfPosition, m: number, x0: number, v0: number, x: number, n = 2000): number {
  return v0 * v0 + (2 / m) * riemann(F, x0, x, n, 'mid');
}

/** |v| at x from the chain rule; NaN where v² < 0, a point the body never reaches. */
export function speedFromForce(F: ForceOfPosition, m: number, x0: number, v0: number, x: number, n = 2000): number {
  const v2 = speedSquaredFromForce(F, m, x0, v0, x, n);
  return v2 < 0 ? Number.NaN : Math.sqrt(v2);
}

/** F = −kx: a spring of constant k [N/m] with its relaxed length at x = 0. */
export const springForce =
  (k: number): ForceOfPosition =>
  (x) =>
    -k * x;

/** F = −kx³: a stiff spring, k in N/m³. */
export const cubicSpringForce =
  (k: number): ForceOfPosition =>
  (x) =>
    -k * x ** 3;

/** The spring's closed form of the chain rule: v² = v₀² + (k/m)(x₀² − x²). */
export const springSpeedSquared = (k: number, m: number, x0: number, v0: number, x: number): number => v0 * v0 + (k / m) * (x0 * x0 - x * x);

/** GM of the Earth [m³/s²] from constants.ts. */
export const GM_EARTH = G_NEWTON * M_EARTH;

/** F = −GMm/r² along a radius (negative: toward the centre). */
export const inverseSquareForce =
  (GM: number, m: number): ForceOfPosition =>
  (r) =>
    (-GM * m) / (r * r);

/** The inverse-square closed form of the chain rule: v² = v₀² + 2GM(1/r − 1/r₀). */
export const inverseSquareSpeedSquared = (GM: number, r0: number, v0: number, r: number): number => v0 * v0 + 2 * GM * (1 / r - 1 / r0);

/**
 * The time to fall from rest at r₀ to r < r₀ under GM/r² (a radial fall), in closed form:
 * t = √(r₀³/2GM) [√(u(1 − u)) + arccos √u], u = r/r₀. From t = ∫ dr/|v| with the substitution r = r₀cos²θ.
 */
export function radialFallTime(GM: number, r0: number, r: number): number {
  const u = r / r0;
  return Math.sqrt(r0 ** 3 / (2 * GM)) * (Math.sqrt(u * (1 - u)) + Math.acos(Math.sqrt(u)));
}

/**
 * The time a body released from rest at x₀ takes to reach x₁ (moving toward x₁ all the way), t = ∫dx/|v(x)|, with v
 * from the chain rule. The substitution x = x₁ + (x₀ − x₁)(1 − s²) removes the 1/√ singularity at the release point:
 * dx/|v| = 2|x₀ − x₁| s ds/|v|, and |v| ∝ s near s = 0.
 */
export function travelTime(F: ForceOfPosition, m: number, x0: number, x1: number, n = 4000): number {
  const L = x0 - x1;
  // v² along the way, accumulated from the release point in the same pieces the time integral uses
  const xOf = (s: number) => x1 + L * (1 - s * s);
  let t = 0;
  let v2 = 0;
  let prevX = x0;
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n;
    const x = xOf(s);
    v2 += (2 / m) * riemann(F, prevX, x, 8, 'mid');
    prevX = x;
    t += (2 * Math.abs(L) * s) / Math.sqrt(Math.max(v2, 1e-300)) / n;
  }
  return t;
}

/**
 * The quarter period of the stiff spring F = −kx³ released from rest at x₀: from v² = (k/2m)(x₀⁴ − x⁴),
 * t = √(2m/k)/x₀ · ∫₀¹ du/√(1 − u⁴), and with u = sin θ the integral is ∫₀^(π/2) dθ/√(1 + sin²θ) = 1.31103.
 * It falls as 1/x₀: a larger swing is faster, unlike the linear spring.
 */
export function cubicSpringQuarterTime(k: number, m: number, x0: number): number {
  const C = riemann((th) => 1 / Math.sqrt(1 + Math.sin(th) ** 2), 0, Math.PI / 2, 2000, 'mid');
  return (Math.sqrt((2 * m) / k) / Math.abs(x0)) * C;
}

/**
 * The motion under F(x) stepped in time with motion.ts's RK4: n steps of dt from (x₀, v₀). `stop(x, v)` ends the run
 * (at the ground, at a wall); the last sample is then the first one past the stop.
 */
export function integrateForceOfPosition(
  F: ForceOfPosition,
  m: number,
  x0: number,
  v0: number,
  dt: number,
  n: number,
  stop?: (x: number, v: number) => boolean,
): { t: number; x: number; v: number }[] {
  let b: Body = { pos: [x0, 0, 0], vel: [v0, 0, 0], m };
  const force = (p: readonly [number, number, number]) => [F(p[0]), 0, 0] as const;
  const out = [{ t: 0, x: x0, v: v0 }];
  for (let i = 0; i < n; i++) {
    b = rk4Step(b, force, i * dt, dt);
    out.push({ t: (i + 1) * dt, x: b.pos[0], v: b.vel[0] });
    if (stop?.(b.pos[0], b.vel[0])) break;
  }
  return out;
}
