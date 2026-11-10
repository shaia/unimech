/**
 * A body falling, or thrown, through air under a drag force that depends on its velocity (lesson 2.7): the
 * analytic solutions for linear drag (exponential approach to the terminal velocity, time constant τ = m/b)
 * and for quadratic drag (tanh on the way down, tan on the way up), a numerical fall with RK4 that checks
 * them and handles both drags at once, a projectile with drag through projectile.ts's `numericFlight`, and
 * the size–speed estimate that decides which drag dominates for a sphere in air.
 *
 * MODEL SPECIFICATION
 * - System: one point body of mass m near the Earth's surface, moving through still air. One dimension
 *   (`Fall`): the axis points DOWN, so a falling body has v > 0 and a body thrown up starts with v₀ < 0.
 *   Two dimensions (`dragFlight`): projectile.ts's axes, x horizontal and y up.
 * - Dynamics: m dv/dt = mg − b v − c |v| v along the downward axis (in 2D, F = m g − b v − c |v| v):
 *   the drag points against the velocity, linear with coefficient b [kg/s], quadratic with c [kg/m].
 *   Linear only: v(t) = v_t + (v₀ − v_t) e^(−t/τ), v_t = mg/b, τ = m/b = v_t/g.
 *   Quadratic only, from rest: v(t) = v_t tanh(t/T), v_t = √(mg/c), T = v_t/g; moving up with speed u:
 *   u(t) = v_t tan(arctan(u₀/v_t) − t/T). Both: terminal speed from c v² + b v = mg; integrated with RK4
 *   (`rk4Step`, motion.ts).
 * - Boundary: released at t = 0 from y = 0 with velocity v₀ (any sign); no ground (callers stop the fall).
 * - Ignored: buoyancy (a fraction ρ_air/ρ_body of the weight: ≈ 1.2·10⁻³ for water in air, about the same for a
 *   person), wind, spin (no lift), the
 *   change of the drag coefficients with speed between the two regimes, unsteady flow while the body
 *   accelerates, the variation of air density with height, the body's deformation (large raindrops flatten).
 * - Valid when: the body's speed stays inside one drag regime (see `dragRatio`); for a sphere in air the
 *   linear coefficient is b = C1_AIR·D and the quadratic one c = C2_AIR·D² (D the diameter).
 * - Failure modes: the sphere coefficients are order-of-magnitude values (±30 %) for smooth spheres at sea
 *   level, and wrong for a flat body or a skydiver (give c directly); b → 0 or c → 0 makes τ and v_t
 *   diverge: the analytic functions stay finite and tend to free fall (expm1 and a series keep the
 *   cancellation away), but `timeToFraction` and `riseTime` lose meaning; RK4 with dt ≳ τ is unstable, and a step that crosses
 *   v = 0 under quadratic drag (the top of a throw up: |v|v has no second derivative there) drops RK4 to
 *   low order, so the numerical fall stays accurate there only through a small dt.
 *
 * Constants (in this module because they belong only to drag):
 * - C1_AIR = 1.6·10⁻⁴ N·s/m² and C2_AIR = 0.25 N·s²/m⁴: Taylor, Classical Mechanics (2005), eqs. 2.4–2.5,
 *   for a sphere in air at STP, as quoted in the PHYS 2210 lecture notes
 *   (https://etneil.github.io/class_mech_notes/part1/projectile.html, opened 2026-11-09). C1_AIR is Stokes's
 *   3πη with η ≈ 1.7·10⁻⁵ Pa·s; C2_AIR is ½·C_D·ρ_air·(π/4) with C_D ≈ 0.5 and ρ_air ≈ 1.3 kg/m³.
 * - RHO_WATER = 1000 kg/m³ (fresh water, to three figures), for the mass of a water drop.
 */

import { G } from './constants';
import { gravity, rk4Step, type Body, type Force } from './motion';
import { numericFlight, type Flight, type FlightOptions, type Launch, type Vec2 } from './projectile';

/** Linear drag per unit diameter for a sphere in air at STP: b = C1_AIR·D [N·s/m²]. */
export const C1_AIR = 1.6e-4;
/** Quadratic drag per unit diameter squared for a sphere in air at STP: c = C2_AIR·D² [N·s²/m⁴]. */
export const C2_AIR = 0.25;
/** Density of water [kg/m³]. */
export const RHO_WATER = 1000;

/** A vertical motion along a DOWNWARD axis: drag −b v − c |v| v, released with velocity v₀ (negative = up). */
export interface Fall {
  /** mass [kg] */
  m: number;
  /** linear drag coefficient [kg/s] */
  b?: number;
  /** quadratic drag coefficient [kg/m] */
  c?: number;
  /** initial velocity along the downward axis [m/s]; negative for a body thrown up */
  v0?: number;
  /** free-fall acceleration [m/s²]; G by default */
  g?: number;
}

export type DragLaw = 'none' | 'linear' | 'quadratic' | 'both';

const bOf = (f: Fall) => f.b ?? 0;
const cOf = (f: Fall) => f.c ?? 0;
const gOf = (f: Fall) => f.g ?? G;

export function lawOf(f: Fall): DragLaw {
  const b = bOf(f) > 0;
  const c = cOf(f) > 0;
  return b && c ? 'both' : b ? 'linear' : c ? 'quadratic' : 'none';
}

/** The drag force on the body along the downward axis at velocity v [N]: −b v − c |v| v. */
export const dragForce = (f: Fall, v: number) => -bOf(f) * v - cOf(f) * Math.abs(v) * v;

/** The net force along the downward axis at velocity v [N]: mg + drag. */
export const netForce = (f: Fall, v: number) => f.m * gOf(f) + dragForce(f, v);

/** The acceleration along the downward axis at velocity v [m/s²]. */
export const accelerationAt = (f: Fall, v: number) => netForce(f, v) / f.m;

/**
 * The terminal speed, where the drag balances the weight [m/s]: mg/b (linear), √(mg/c) (quadratic), the
 * positive root of c v² + b v − mg = 0 (both), Infinity without drag.
 */
export function terminalSpeed(f: Fall): number {
  const b = bOf(f);
  const c = cOf(f);
  const W = f.m * gOf(f);
  if (c > 0) return (2 * W) / (b + Math.sqrt(b * b + 4 * c * W)); // the root without cancellation
  if (b > 0) return W / b;
  return Infinity;
}

/**
 * The characteristic time [s]: τ = m/b for linear drag, T = v_t/g for quadratic (and for both). For linear
 * drag the two agree: m/b = (mg/b)/g.
 */
export const timeScale = (f: Fall) => (lawOf(f) === 'linear' ? f.m / bOf(f) : terminalSpeed(f) / gOf(f));

/** x − 1 + e^(−x), accurate for small x where the three terms cancel. */
function xm1e(x: number): number {
  if (Math.abs(x) < 1e-3) return x * x * (0.5 - x / 6 + (x * x) / 24);
  return x + Math.expm1(-x);
}

/* ------------------------------------------------------------------ linear drag */

function linearVelocity(f: Fall, t: number): number {
  const vt = terminalSpeed(f);
  const tau = timeScale(f);
  const v0 = f.v0 ?? 0;
  const e = Math.exp(-t / tau);
  // v_t (1 − e) + v₀ e, with 1 − e = −expm1(−t/τ): finite and → v₀ + g t as b → 0
  return vt * -Math.expm1(-t / tau) + v0 * e;
}

function linearPosition(f: Fall, t: number): number {
  const vt = terminalSpeed(f);
  const tau = timeScale(f);
  const v0 = f.v0 ?? 0;
  // y = v₀ τ (1 − e) + v_t τ (t/τ − 1 + e)
  return v0 * tau * -Math.expm1(-t / tau) + vt * tau * xm1e(t / tau);
}

/* ------------------------------------------------------------------ quadratic drag */

const atanh = (x: number) => 0.5 * Math.log((1 + x) / (1 - x));
const acoth = (x: number) => 0.5 * Math.log((x + 1) / (x - 1));
/** ln cosh x without overflow */
const lnCosh = (x: number) => {
  const a = Math.abs(x);
  return a + Math.log1p(Math.exp(-2 * a)) - Math.LN2;
};

/** Time to the top for a quadratic-drag body thrown up with speed u₀ = −v₀ > 0: T arctan(u₀/v_t). */
function quadraticTop(f: Fall): number {
  const u0 = -(f.v0 ?? 0);
  if (u0 <= 0) return 0;
  return timeScale(f) * Math.atan(u0 / terminalSpeed(f));
}

function quadraticVelocity(f: Fall, t: number): number {
  const vt = terminalSpeed(f);
  const T = timeScale(f);
  const v0 = f.v0 ?? 0;
  if (v0 < 0) {
    const tTop = quadraticTop(f);
    if (t < tTop) return -vt * Math.tan(Math.atan(-v0 / vt) - t / T);
    return vt * Math.tanh((t - tTop) / T);
  }
  if (v0 === vt) return vt;
  if (v0 < vt) return vt * Math.tanh(t / T + atanh(v0 / vt));
  return vt / Math.tanh(t / T + acoth(v0 / vt));
}

function quadraticPosition(f: Fall, t: number): number {
  const vt = terminalSpeed(f);
  const T = timeScale(f);
  const L = (vt * vt) / gOf(f);
  const v0 = f.v0 ?? 0;
  if (v0 < 0) {
    const a = Math.atan(-v0 / vt);
    const tTop = quadraticTop(f);
    if (t < tTop) return -L * Math.log(Math.cos(a - t / T) / Math.cos(a));
    const H = 0.5 * L * Math.log(1 + (v0 * v0) / (vt * vt));
    return -H + L * lnCosh((t - tTop) / T);
  }
  if (v0 === vt) return vt * t;
  if (v0 < vt) {
    const a = atanh(v0 / vt);
    return L * (lnCosh(t / T + a) - lnCosh(a));
  }
  const b = acoth(v0 / vt);
  return L * Math.log(Math.sinh(t / T + b) / Math.sinh(b));
}

/* ------------------------------------------------------------------ one law, analytic */

/** The velocity along the downward axis at time t [m/s], analytic for no drag, linear or quadratic drag. */
export function velocity(f: Fall, t: number): number {
  switch (lawOf(f)) {
    case 'none':
      return (f.v0 ?? 0) + gOf(f) * t;
    case 'linear':
      return linearVelocity(f, t);
    case 'quadratic':
      return quadraticVelocity(f, t);
    default:
      throw new Error('velocity(): linear and quadratic drag together have no closed form here; use sampleFall');
  }
}

/** The displacement along the downward axis at time t [m] (negative while above the release point). */
export function position(f: Fall, t: number): number {
  switch (lawOf(f)) {
    case 'none':
      return (f.v0 ?? 0) * t + 0.5 * gOf(f) * t * t;
    case 'linear':
      return linearPosition(f, t);
    case 'quadratic':
      return quadraticPosition(f, t);
    default:
      throw new Error('position(): linear and quadratic drag together have no closed form here; use sampleFall');
  }
}

/**
 * From rest, the time to reach the fraction `frac` of the terminal speed [s]: −τ ln(1 − frac) for linear
 * drag (τ ln 10 for 90 %), T artanh(frac) for quadratic.
 */
export function timeToFraction(f: Fall, frac: number): number {
  const law = lawOf(f);
  if (law === 'linear') return -timeScale(f) * Math.log(1 - frac);
  if (law === 'quadratic') return timeScale(f) * atanh(frac);
  throw new Error(`timeToFraction(): needs one drag law, got ${law}`);
}

/** Time from a throw straight up at speed u₀ > 0 to the top [s]: τ ln(1 + u₀/v_t) (linear), T arctan(u₀/v_t) (quadratic). */
export function riseTime(f: Fall, u0: number): number {
  const law = lawOf(f);
  const vt = terminalSpeed(f);
  if (law === 'linear') return timeScale(f) * Math.log1p(u0 / vt);
  if (law === 'quadratic') return timeScale(f) * Math.atan(u0 / vt);
  if (law === 'none') return u0 / gOf(f);
  throw new Error('riseTime(): needs one drag law');
}

/** Height of the top above the release point for a throw straight up at u₀ [m]. */
export function riseHeight(f: Fall, u0: number): number {
  const law = lawOf(f);
  const vt = terminalSpeed(f);
  const g = gOf(f);
  if (law === 'linear') {
    const tau = timeScale(f);
    // τ (u₀ − v_t ln(1 + u₀/v_t)), written with the series-safe form for a weak drag
    return tau * vt * xm1Log(u0 / vt);
  }
  if (law === 'quadratic') return ((vt * vt) / (2 * g)) * Math.log1p((u0 * u0) / (vt * vt));
  if (law === 'none') return (u0 * u0) / (2 * g);
  throw new Error('riseHeight(): needs one drag law');
}

/** x − ln(1 + x), accurate for small x. */
function xm1Log(x: number): number {
  if (Math.abs(x) < 1e-3) return x * x * (0.5 - x / 3 + (x * x) / 4);
  return x - Math.log1p(x);
}

/* ------------------------------------------------------------------ numerical fall (RK4) */

/** The net force of `Fall` as a motion.ts Force, in world axes (y up): gravity plus the drag. */
export function fallForce(f: Fall): Force {
  const b = bOf(f);
  const c = cOf(f);
  const W = gravity(f.m, gOf(f));
  return (p, v, t) => {
    const w = W(p, v, t);
    const s = Math.hypot(v[0], v[1], v[2]);
    const k = b + c * s;
    return [w[0] - k * v[0], w[1] - k * v[1], w[2] - k * v[2]];
  };
}

export interface FallSample {
  t: number;
  /** velocity along the downward axis [m/s] */
  v: number;
  /** displacement along the downward axis [m] */
  y: number;
}

/**
 * Integrate the fall with RK4 from 0 to tEnd in N = round(tEnd/dt) equal steps (N + 1 samples, the last at
 * tEnd exactly).
 */
export function integrateFall(f: Fall, tEnd: number, dt: number): FallSample[] {
  const F = fallForce(f);
  const N = Math.max(1, Math.round(tEnd / dt));
  const h = tEnd / N;
  let body: Body = { pos: [0, 0, 0], vel: [0, -(f.v0 ?? 0), 0], m: f.m };
  const out: FallSample[] = [{ t: 0, v: f.v0 ?? 0, y: 0 }];
  for (let i = 0; i < N; i++) {
    body = rk4Step(body, F, i * h, h);
    out.push({ t: (i + 1) * h, v: -body.vel[1], y: -body.pos[1] });
  }
  return out;
}

/** n + 1 samples of the fall over [0, tEnd]: analytic for one law, RK4 (40 sub-steps per sample) for both. */
export function sampleFall(f: Fall, tEnd: number, n = 200): FallSample[] {
  if (lawOf(f) !== 'both') {
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = (tEnd * i) / n;
      return { t, v: velocity(f, t), y: position(f, t) };
    });
  }
  const fine = integrateFall(f, tEnd, tEnd / (n * 40));
  return Array.from({ length: n + 1 }, (_, i) => fine[i * 40]);
}

/* ------------------------------------------------------------------ a projectile with drag */

/**
 * A launch (projectile.ts axes: x horizontal, y up) under gravity and drag per unit mass b/m and c/m,
 * integrated by projectile.ts's `numericFlight` until the body is back on the ground.
 */
export function dragFlight(l: Launch, drag: { bOverM?: number; cOverM?: number }, opts: Omit<FlightOptions, 'force'> = {}): Flight {
  const g = l.g ?? G;
  const k1 = drag.bOverM ?? 0;
  const k2 = drag.cOverM ?? 0;
  const force: Force = (_p, v) => {
    const s = Math.hypot(v[0], v[1]);
    const k = k1 + k2 * s;
    return [-k * v[0], -g - k * v[1], 0];
  };
  return numericFlight(l, { ...opts, force });
}

/**
 * The analytic position of a launch under linear drag with time constant τ = m/b (x horizontal, y up):
 * each component relaxes on its own, x = v₀ₓ τ (1 − e^(−t/τ)), y = h₀ + (v₀ᵧ + v_t) τ (1 − e^(−t/τ)) − v_t t.
 */
export function linearDragPosition(l: Launch, tau: number, t: number): Vec2 {
  const g = l.g ?? G;
  const vt = g * tau;
  const th = (l.angleDeg * Math.PI) / 180;
  const vx = l.v0 * Math.cos(th);
  const vy = l.v0 * Math.sin(th);
  const one = -Math.expm1(-t / tau);
  return [vx * tau * one, (l.h0 ?? 0) + vy * tau * one - vt * tau * xm1e(t / tau)];
}

/* ------------------------------------------------------------------ which drag dominates */

/** The mass of a sphere of diameter D [m] and density ρ [kg/m³]: ρ π D³ / 6. */
export const sphereMass = (D: number, rho: number) => (rho * Math.PI * D ** 3) / 6;

/** Linear and quadratic drag coefficients of a sphere of diameter D in air: b = C1_AIR·D, c = C2_AIR·D². */
export const sphereDrag = (D: number) => ({ b: C1_AIR * D, c: C2_AIR * D * D });

/** The ratio of quadratic to linear drag on a sphere of diameter D at speed v in air: (C2/C1) D v. */
export const dragRatio = (D: number, v: number) => (C2_AIR / C1_AIR) * D * v;
