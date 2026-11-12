/**
 * The rotating Earth (lesson 7.4): what the Coriolis force does to bodies that move on the Earth, beyond the
 * formulas of `rotating.ts` (effective gravity, the plumb line, the eastward fall, the Foucault rate). This module
 * integrates the motions those formulas summarise, so the lesson's figure and its tests can show them happen:
 * a Foucault pendulum whose plane turns at ω sin λ, a body that moves horizontally and turns at 2ω sin λ, a parcel
 * of air that falls toward a low and circles it, and a body dropped in the Earth's frame.
 *
 * MODEL SPECIFICATION
 * - System: a body (a pendulum bob, a puck, a parcel of air) near a point at latitude λ on the Earth, in the
 *   Earth's frame, which rotates at the constant ω = 7.29·10⁻⁵ rad/s. Local axes: x east, y north, z up along the
 *   plumb line. In these axes ω = ω(0, cos λ, sin λ) (`earthOmegaLocal` of rotating.ts).
 * - Dynamics: m a′ = F + m g_eff − 2m ω × v′. The centrifugal force at the point is inside g_eff (it sets the
 *   plumb line, the z axis). For horizontal motion (v′ in the xy plane) the vertical part of ω, Ω_z = ω sin λ,
 *   gives the horizontal Coriolis acceleration 2Ω_z(v_y, −v_x), to the right of v′ when Ω_z > 0 (the north);
 *   the horizontal part ω cos λ gives a vertical force only, which a support or the string absorbs.
 *   - Foucault pendulum, small swings (length ℓ, ω₀² = g/ℓ): ẍ = −ω₀²x + 2Ω_z ẏ, ÿ = −ω₀²y − 2Ω_z ẋ. Released
 *     from rest at (x₀, 0): x + iy = x₀ e^(−iΩ_z t)[cos Wt + i(Ω_z/W) sin Wt], W = √(ω₀² + Ω_z²). The swing is a
 *     thin ellipse (axis ratio Ω_z/W) whose long axis, the plane, turns at −Ω_z: clockwise from above in the north.
 *   - A body moving horizontally with no other horizontal force turns its velocity at the rate 2Ω_z (clockwise in
 *     the north): over a flow that lasts L/v the direction turns by 2Ω_z L/v.
 *   - A parcel of air: a pressure-gradient acceleration of fixed size a_P toward a low (away from a high) at the
 *     origin (linear inside a core radius r_c, so it is finite at the centre), the horizontal Coriolis, and a
 *     linear friction −k v.
 * - Boundary: initial position and velocity in the local horizontal plane (the drop: rest at height h).
 * - Ignored: the curvature of the Earth over the motion; the change of λ, g and ω × (ω × r) across it, except in
 *   `dropFromRest`, which keeps the centrifugal term of the displacement; air drag on the pendulum and the drop;
 *   the pendulum's vertical motion (small swings); in the parcel model the real structure of a storm (the
 *   pressure field is fixed and round, friction is linear, there is no vertical motion and no moisture).
 * - Valid when: speeds ≪ ωR, displacements ≪ R; the pendulum's amplitude ≪ ℓ; Ω_z ≪ ω₀.
 * - Failure modes: at λ = 0, Ω_z = 0: the plane does not turn, the inertial-turning period is infinite and the
 *   Coriolis-to-inertia ratio (`rossbyNumber`) divides by zero (returned as Infinity).
 */

import { G } from './constants';
import { earthOmegaLocal, stepNonInertial, type State3 } from './rotating';
import type { Vec3 } from './vec';

/** A state in the local horizontal plane: x east, y north [m], and the velocity [m/s]. */
export interface Planar {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** The vertical component of the Earth's angular velocity at latitude λ [rad]: Ω_z = ω sin λ (negative in the south). */
export const verticalOmega = (omega: number, lat: number): number => omega * Math.sin(lat);

/** Horizontal Coriolis acceleration on a horizontal velocity: 2Ω_z(v_y, −v_x), to the right of v when Ω_z > 0. */
export const horizontalCoriolisAccel = (wz: number, vx: number, vy: number): [number, number] => [2 * wz * vy, -2 * wz * vx];

/** One RK4 step of a planar motion whose acceleration is a(s). */
export function rk4Planar(s: Planar, acc: (s: Planar) => [number, number], dt: number): Planar {
  const d = (q: Planar): [number, number, number, number] => {
    const [ax, ay] = acc(q);
    return [q.vx, q.vy, ax, ay];
  };
  const shift = (q: Planar, k: [number, number, number, number], h: number): Planar => ({
    x: q.x + h * k[0],
    y: q.y + h * k[1],
    vx: q.vx + h * k[2],
    vy: q.vy + h * k[3],
  });
  const k1 = d(s);
  const k2 = d(shift(s, k1, dt / 2));
  const k3 = d(shift(s, k2, dt / 2));
  const k4 = d(shift(s, k3, dt));
  const w = (i: number) => (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
  return { x: s.x + dt * w(0), y: s.y + dt * w(1), vx: s.vx + dt * w(2), vy: s.vy + dt * w(3) };
}

// ---------------------------------------------------------------- the Foucault pendulum

/** Small swings of a pendulum (ω₀² = g/ℓ) in the Earth's frame: ẍ = −ω₀²x + 2Ω_z ẏ, ÿ = −ω₀²y − 2Ω_z ẋ. */
export function foucaultAccel(s: Planar, w0: number, wz: number): [number, number] {
  const [cx, cy] = horizontalCoriolisAccel(wz, s.vx, s.vy);
  return [-w0 * w0 * s.x + cx, -w0 * w0 * s.y + cy];
}

export const foucaultStep = (s: Planar, w0: number, wz: number, dt: number): Planar => rk4Planar(s, (q) => foucaultAccel(q, w0, wz), dt);

/** The exact swing released from rest (relative to the ground) at (x₀, 0) at t = 0. */
export function foucaultExact(x0: number, w0: number, wz: number, t: number): Planar {
  const W = Math.hypot(w0, wz);
  const q = wz / W;
  // z = x₀ e^(−iΩt)(cos Wt + i q sin Wt)
  const c = Math.cos(wz * t);
  const s = Math.sin(wz * t);
  const a = Math.cos(W * t);
  const b = q * Math.sin(W * t);
  // dz/dt = x₀ e^(−iΩt)[(−iΩ)(a + ib) + (−W sin Wt + i qW cos Wt)]
  const da = -W * Math.sin(W * t) + wz * b;
  const db = q * W * Math.cos(W * t) - wz * a;
  return {
    x: x0 * (c * a + s * b),
    y: x0 * (c * b - s * a),
    vx: x0 * (c * da + s * db),
    vy: x0 * (c * db - s * da),
  };
}

/** The azimuth of the swing's plane at time t, from the starting plane: −Ω_z t (counter-clockwise positive). */
export const foucaultPlaneAngle = (omega: number, lat: number, t: number): number => -verticalOmega(omega, lat) * t;

/** The pendulum's energy per unit mass in the Earth's frame, ½v² + ½ω₀²r²: the Coriolis force does no work. */
export const foucaultEnergy = (s: Planar, w0: number): number => 0.5 * (s.vx * s.vx + s.vy * s.vy) + 0.5 * w0 * w0 * (s.x * s.x + s.y * s.y);

export interface Swing {
  /** time of the turning point [s] */
  t: number;
  /** azimuth of the bob there, folded into (−π/2, π/2] (a plane has no front and back) [rad] */
  azimuth: number;
}

/**
 * Integrate a swing released from rest at (x₀, 0) and return the bob's azimuth at every turning point (each
 * maximum of the distance from the centre): the plane, one value per half swing.
 */
export function foucaultSwings(x0: number, w0: number, wz: number, tEnd: number, stepsPerSwing = 400): Swing[] {
  const dt = (2 * Math.PI) / w0 / stepsPerSwing;
  let s: Planar = { x: x0, y: 0, vx: 0, vy: 0 };
  let t = 0;
  const out: Swing[] = [];
  let prevRdot = 0;
  while (t < tEnd) {
    const n = foucaultStep(s, w0, wz, dt);
    const rdot = n.x * n.vx + n.y * n.vy;
    if (prevRdot > 0 && rdot <= 0) {
      // the turning point lies between s and n: interpolate on r·v = 0
      const f = prevRdot / (prevRdot - rdot);
      const x = s.x + f * (n.x - s.x);
      const y = s.y + f * (n.y - s.y);
      out.push({ t: t + f * dt, azimuth: foldPlane(Math.atan2(y, x)) });
    }
    prevRdot = rdot;
    s = n;
    t += dt;
  }
  return out;
}

/** An angle folded into (−π/2, π/2]: the azimuth of a line through the centre. */
export function foldPlane(a: number): number {
  let x = a % Math.PI;
  if (x > Math.PI / 2) x -= Math.PI;
  if (x <= -Math.PI / 2) x += Math.PI;
  return x;
}

// ---------------------------------------------------------------- horizontal motion

/** The rate at which a body moving horizontally, with no other horizontal force, turns its velocity: 2ω sin λ (clockwise in the north). */
export const coriolisTurnRate = (omega: number, lat: number): number => 2 * verticalOmega(omega, lat);

/** The angle [rad] by which the Coriolis force turns a horizontal flow of size L and speed v over its duration L/v. */
export const coriolisTurnAngle = (omega: number, lat: number, L: number, v: number): number => (coriolisTurnRate(omega, lat) * L) / v;

/**
 * The flow's own acceleration v²/L over the horizontal Coriolis acceleration 2ωv|sin λ|: v / (2ω|sin λ|L).
 * Large: the Coriolis force does not matter (a sink). Small: it dominates (a storm).
 */
export function rossbyNumber(v: number, L: number, omega: number, lat: number): number {
  const f = Math.abs(coriolisTurnRate(omega, lat));
  return f === 0 ? Infinity : v / (f * L);
}

/** Sideways deflection [m] of a body that moves horizontally at speed v for a time t, to first order: ω sin λ v t² (to the right in the north). */
export const horizontalDeflection = (omega: number, lat: number, v: number, t: number): number => verticalOmega(omega, lat) * v * t * t;

// ---------------------------------------------------------------- a parcel of air around a low

export interface ParcelField {
  /** size of the pressure-gradient acceleration [m/s²] */
  aP: number;
  /** +1: a low at the origin (the push points to it); −1: a high (it points away) */
  sense: 1 | -1;
  /** inside this radius the push falls linearly to zero [m] */
  rCore: number;
  /** Ω_z = ω sin λ [rad/s] */
  wz: number;
  /** linear friction [1/s] */
  k: number;
}

export function parcelAccel(s: Planar, f: ParcelField): [number, number] {
  const r = Math.hypot(s.x, s.y);
  const push = r === 0 ? 0 : (f.aP * Math.min(1, r / f.rCore)) / r;
  const [cx, cy] = horizontalCoriolisAccel(f.wz, s.vx, s.vy);
  return [-f.sense * push * s.x + cx - f.k * s.vx, -f.sense * push * s.y + cy - f.k * s.vy];
}

export const parcelStep = (s: Planar, f: ParcelField, dt: number): Planar => rk4Planar(s, (q) => parcelAccel(q, f), dt);

/** n + 1 samples of a parcel's path over [0, tEnd]. */
export function parcelPath(s0: Planar, f: ParcelField, tEnd: number, n: number, sub = 8): Planar[] {
  const out: Planar[] = [s0];
  const dt = tEnd / n / sub;
  let s = s0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < sub; j++) s = parcelStep(s, f, dt);
    out.push(s);
  }
  return out;
}

/** The z-component of r × v per unit mass about the centre: positive = counter-clockwise seen from above. */
export const spinAbout = (s: Planar): number => s.x * s.vy - s.y * s.vx;

// ---------------------------------------------------------------- a drop, integrated in the Earth's frame

/**
 * A body dropped from rest at height h, integrated in the local axes of latitude λ with the real force −mg ẑ
 * along the plumb line (g_eff, here taken as `g`) and the fictitious forces of the rotation about the drop point
 * (Coriolis, and the centrifugal force of the displacement only). Returns the time to fall h and where it lands
 * (x east, y north) relative to the foot of the plumb line.
 */
export function dropFromRest(omega: number, lat: number, h: number, g: number = G, steps = 4000): { t: number; east: number; north: number } {
  const w: Vec3 = earthOmegaLocal(omega, lat);
  const weight = (): Vec3 => [0, 0, -g];
  const tGuess = Math.sqrt((2 * h) / g);
  const dt = (1.2 * tGuess) / steps;
  let s: State3 = { r: [0, 0, h], v: [0, 0, 0] };
  let t = 0;
  for (let i = 0; i < 2 * steps; i++) {
    const n = stepNonInertial(1, s, weight, { omega: w }, t, dt);
    if (n.r[2] <= 0) {
      const f = s.r[2] / (s.r[2] - n.r[2]);
      return { t: t + f * dt, east: s.r[0] + f * (n.r[0] - s.r[0]), north: s.r[1] + f * (n.r[1] - s.r[1]) };
    }
    s = n;
    t += dt;
  }
  return { t, east: s.r[0], north: s.r[1] };
}

/** The rotation rate at which g_eff vanishes on the equator: ω_c = √(g/R). */
export const criticalOmega = (g: number, R: number): number => Math.sqrt(g / R);
