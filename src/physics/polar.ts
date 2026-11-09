/**
 * Velocity and acceleration in plane polar coordinates (lesson 1.4): the unit vectors r̂ and θ̂ that
 * ride with the moving point, the polar components of v and a, and the four terms of the acceleration.
 * The figure PolarFrame draws them; the lesson's worked examples and workbook recompute with them.
 *
 * MODEL SPECIFICATION
 * - System: a point moving in a plane, described about a fixed origin O by its distance r(t) ≥ 0 [m]
 *   and its angle θ(t) [rad], measured counter-clockwise from +x. x = r cos θ, y = r sin θ.
 * - Dynamics: kinematics only, no forces. The unit vectors r̂ = (cos θ, sin θ), θ̂ = (−sin θ, cos θ)
 *   depend on θ, so dr̂/dt = θ̇ θ̂ and dθ̂/dt = −θ̇ r̂. Hence
 *     v = ṙ r̂ + r θ̇ θ̂,
 *     a = (r̈ − r θ̇²) r̂ + (r θ̈ + 2 ṙ θ̇) θ̂,
 *   with four named terms: r̈ (change of the radial speed), −r θ̇² (centripetal), r θ̈ (change of the
 *   rotation rate) and 2 ṙ θ̇ (the Coriolis term of the acceleration: kinematics, never a force).
 *   a_θ = (1/r)·d(r² θ̇)/dt, so a_θ = 0 keeps r² θ̇ constant.
 * - Boundary: each preset motion fixes r(0), ṙ(0), θ(0), θ̇(0) explicitly (see `polarMotion`).
 * - Ignored: the third dimension (the motion stays in the plane); the frame is the fixed (inertial)
 *   plane: these are not rotating-frame quantities (those are chapter 7).
 * - Valid when: r > 0. At r = 0 the angle and the unit vectors are undefined.
 * - Failure modes: at r = 0 `polarBasis` still returns the vectors of the given θ, and the components
 *   stay finite, but θ itself is meaningless there; callers keep r > 0 (the straight-line preset
 *   never passes through O). The central difference used by tests and `numericState` is O(h²); below
 *   h ≈ 1e-5·T rounding error dominates.
 */

import { add, scale, type Vec2 } from './vec';

/** The polar unit vectors at angle θ. */
export function polarBasis(theta: number): { rHat: Vec2; thetaHat: Vec2 } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { rHat: [c, s], thetaHat: [-s, c] };
}

/** The state of the point at one instant: r, θ and their first two time derivatives. */
export interface PolarState {
  r: number;
  rd: number;
  rdd: number;
  th: number;
  thd: number;
  thdd: number;
}

/** Polar components of the velocity: v_r = ṙ, v_θ = r θ̇. */
export function polarVelocity(s: PolarState): { vr: number; vth: number } {
  return { vr: s.rd, vth: s.r * s.thd };
}

/** The four terms of the polar acceleration, each the coefficient of its unit vector. */
export interface AccelTerms {
  /** r̈, along r̂ */
  radial: number;
  /** −r θ̇², along r̂ (always toward O) */
  centripetal: number;
  /** r θ̈, along θ̂ */
  angular: number;
  /** 2 ṙ θ̇, along θ̂: the Coriolis term */
  coriolis: number;
}

export function accelTerms(s: PolarState): AccelTerms {
  return {
    radial: s.rdd,
    centripetal: -s.r * s.thd * s.thd,
    angular: s.r * s.thdd,
    coriolis: 2 * s.rd * s.thd,
  };
}

/** Polar components of the acceleration: a_r = r̈ − r θ̇², a_θ = r θ̈ + 2 ṙ θ̇. */
export function polarAcceleration(s: PolarState): { ar: number; ath: number } {
  const t = accelTerms(s);
  return { ar: t.radial + t.centripetal, ath: t.angular + t.coriolis };
}

/** A vector given by its polar components (along r̂ and θ̂ at angle θ), in Cartesian components. */
export function fromPolarComponents(cr: number, cth: number, theta: number): Vec2 {
  const { rHat, thetaHat } = polarBasis(theta);
  return add(scale(rHat, cr), scale(thetaHat, cth));
}

export const position = (s: PolarState): Vec2 => [s.r * Math.cos(s.th), s.r * Math.sin(s.th)];
export const velocity = (s: PolarState): Vec2 => {
  const v = polarVelocity(s);
  return fromPolarComponents(v.vr, v.vth, s.th);
};
export const acceleration = (s: PolarState): Vec2 => {
  const a = polarAcceleration(s);
  return fromPolarComponents(a.ar, a.ath, s.th);
};

/** r² θ̇ [m²/s]: constant whenever a_θ = 0 (a pull, or push, only along r̂). */
export const arealRate = (s: PolarState): number => s.r * s.r * s.thd;

/**
 * Tangential and normal components of the acceleration, along the path (lesson 1.3), for contrast with
 * the polar ones: a_t = a·v/|v|, a_n = |v × a|/|v|. At rest (v = 0) a_t = |a| and a_n = 0 by convention.
 */
export function pathComponents(s: PolarState): { at: number; an: number } {
  const v = velocity(s);
  const a = acceleration(s);
  const sp = Math.hypot(v[0], v[1]);
  if (sp === 0) return { at: Math.hypot(a[0], a[1]), an: 0 };
  return { at: (a[0] * v[0] + a[1] * v[1]) / sp, an: Math.abs(v[0] * a[1] - v[1] * a[0]) / sp };
}

/* ----------------------------------------------------------------------------- preset motions */

/** A motion given analytically: the state at every time t ≥ 0. */
export type PolarMotion = (t: number) => PolarState;

export type PresetName = 'circle' | 'spin-up' | 'radial' | 'bug' | 'bead' | 'spiral' | 'line' | 'pull';

export interface PresetParams {
  /** circle radius, starting distance, line distance, spiral constant scale [m] */
  r0: number;
  /** rotation rate [rad/s] (for 'spin-up', the angular acceleration [rad/s²]) */
  omega: number;
  /** radial speed (bug, radial, pull) or the speed along the line [m/s] */
  u: number;
}

/**
 * The preset motions of the lesson, each with its parameters:
 * - circle:  r = r0, θ = ωt (uniform circular motion, lesson 1.3);
 * - spin-up: r = r0, θ = ½αt² with α = `omega` (circular motion speeding up from rest);
 * - radial:  r = r0 + ut, θ = π/6 fixed (along a fixed ray);
 * - bug:     r = r0 + ut, θ = ωt (walking out along a rod that turns at constant ω);
 * - bead:    r = r0 cosh ωt, θ = ωt (a free bead on a smooth rod turning at constant ω: a_r = 0);
 * - spiral:  r = bθ with b = r0/π, θ = ωt (the spiral of Archimedes, which reaches r = r0 at θ = π);
 * - line:    x = −L + ut, y = r0 (constant velocity along a line at distance r0 from O, L = 2·r0);
 * - pull:    r = r0 − ut, r² θ̇ = r0² ω (a puck pulled in through a hole: a_θ = 0).
 */
export function polarMotion(name: PresetName, p: PresetParams): PolarMotion {
  const { r0, omega: w, u } = p;
  switch (name) {
    case 'circle':
      return (t) => ({ r: r0, rd: 0, rdd: 0, th: w * t, thd: w, thdd: 0 });
    case 'spin-up':
      return (t) => ({ r: r0, rd: 0, rdd: 0, th: 0.5 * w * t * t, thd: w * t, thdd: w });
    case 'radial':
      return (t) => ({ r: r0 + u * t, rd: u, rdd: 0, th: Math.PI / 6, thd: 0, thdd: 0 });
    case 'bug':
      return (t) => ({ r: r0 + u * t, rd: u, rdd: 0, th: w * t, thd: w, thdd: 0 });
    case 'bead':
      return (t) => ({
        r: r0 * Math.cosh(w * t),
        rd: r0 * w * Math.sinh(w * t),
        rdd: r0 * w * w * Math.cosh(w * t),
        th: w * t,
        thd: w,
        thdd: 0,
      });
    case 'spiral': {
      const b = r0 / Math.PI;
      return (t) => ({ r: b * w * t, rd: b * w, rdd: 0, th: w * t, thd: w, thdd: 0 });
    }
    case 'line': {
      const d = r0;
      const L = 2 * r0;
      return (t) => {
        const x = -L + u * t;
        const r2 = x * x + d * d;
        const r = Math.sqrt(r2);
        // ṙ = x ẋ / r, θ = atan2(d, x), θ̇ = −d ẋ / r²; then r̈ = r θ̇² and θ̈ = −2 ṙ θ̇ / r (a = 0)
        const rd = (x * u) / r;
        const thd = (-d * u) / r2;
        return { r, rd, rdd: r * thd * thd, th: Math.atan2(d, x), thd, thdd: (-2 * rd * thd) / r };
      };
    }
    case 'pull': {
      const h = r0 * r0 * w;
      return (t) => {
        const r = r0 - u * t;
        // θ = h ∫ dt / (r0 − ut)² = (h/u)(1/r − 1/r0); θ̇ = h/r²; θ̈ = −2 h ṙ / r³ = 2hu/r³
        return { r, rd: -u, rdd: 0, th: (h / u) * (1 / r - 1 / r0), thd: h / (r * r), thdd: (2 * h * u) / (r * r * r) };
      };
    }
  }
}

/**
 * The parameters lesson 1.4 uses for each preset (its figures, captions and worked examples), chosen
 * to match the numbers of its question bank: the bug at ω = 3.0 rad/s and 0.50 m/s, the bead at
 * ω = 2.0 rad/s, the spiral with b = 0.10 m at ω = 1.0 rad/s.
 */
export const LESSON_PRESETS: Record<PresetName, PresetParams> = {
  circle: { r0: 1.0, omega: 1.0, u: 0 },
  'spin-up': { r0: 1.0, omega: 0.5, u: 0 },
  radial: { r0: 0.2, omega: 0, u: 0.5 },
  bug: { r0: 0.2, omega: 3.0, u: 0.5 },
  bead: { r0: 0.2, omega: 2.0, u: 0 },
  spiral: { r0: 0.1 * Math.PI, omega: 1.0, u: 0 },
  line: { r0: 0.5, omega: 0, u: 1.0 },
  pull: { r0: 1.0, omega: 0.5, u: 0.25 },
};

/** How long each preset runs before the figure loops it [s], given its parameters. */
export function presetDuration(name: PresetName, p: PresetParams): number {
  switch (name) {
    case 'circle':
      return (2 * Math.PI) / p.omega;
    case 'spin-up':
      return Math.sqrt((4 * Math.PI) / p.omega); // one full turn: ½αt² = 2π
    case 'radial':
    case 'bug':
      return (4 * p.r0) / p.u; // out to 5·r0
    case 'bead':
      return Math.acosh(5) / p.omega; // out to 5·r0
    case 'spiral':
      return (3 * Math.PI) / p.omega; // one and a half turns
    case 'line':
      return (4 * p.r0) / p.u; // from x = −2r0 to x = +2r0
    case 'pull':
      return (0.6 * p.r0) / p.u; // in to 0.4·r0
  }
}

/**
 * The state of a motion given only r(t) and θ(t), by central differences (O(h²)). For checks and
 * for motions without analytic derivatives.
 */
export function numericState(r: (t: number) => number, th: (t: number) => number, t: number, h = 1e-4): PolarState {
  const d1 = (f: (t: number) => number) => (f(t + h) - f(t - h)) / (2 * h);
  const d2 = (f: (t: number) => number) => (f(t + h) - 2 * f(t) + f(t - h)) / (h * h);
  return { r: r(t), rd: d1(r), rdd: d2(r), th: th(t), thd: d1(th), thdd: d2(th) };
}
