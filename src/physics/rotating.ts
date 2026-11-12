/**
 * Non-inertial frames (chapter 7, lessons 7.1–7.4): a frame in linear acceleration, a frame rotating at a constant
 * angular velocity, the fictitious forces they need, and the rotating Earth. Shared by the lessons' figures and
 * scripts, so every number of the chapter comes from one model.
 *
 * MODEL SPECIFICATION
 * - System: a particle of mass m seen from an inertial frame S (unprimed: r, v, a) and from a frame S′ (primed:
 *   r′, v′, a′) whose origin accelerates at A relative to S and whose axes rotate at angular velocity ω about that
 *   origin (lesson 7.1: ω = 0; lessons 7.2–7.4: A = 0, ω constant). In the transformations below the two origins
 *   coincide and the axes coincide at t = 0, and ω points along +z (counter-clockwise seen from +z).
 * - Dynamics: the rate of change of any vector Q, (dQ/dt)_in = (dQ/dt)_rot + ω × Q (lesson 7.2). For the
 *   position this gives v = v′ + ω × r′, and once more
 *     m a′ = F − m A − m ω × (ω × r′) − 2m ω × v′ − m (dω/dt) × r′,
 *   the real net force F plus the fictitious forces: linear (−mA), centrifugal (−mω×(ω×r′)), Coriolis (−2mω×v′),
 *   Euler (−m ω̇×r′). Coriolis is perpendicular to v′ and does no work in S′, so for a real force with potential
 *   energy U and constant ω the Jacobi integral ½v′² − ½|ω×r′|² + U/m is conserved in S′.
 * - Earth (lesson 7.4): local axes at latitude λ, x east, y north, z up along the radius from the Earth's centre
 *   (a sphere of radius R, gravitational acceleration g toward the centre with no rotation). There
 *   ω = ω(0, cos λ, sin λ); the centrifugal acceleration is ω²R(0, −sin λ cos λ, cos²λ), so the effective
 *   gravity g_eff = (0, −ω²R sin λ cos λ, −(g − ω²R cos²λ)) and the plumb line leans from the radius toward the
 *   equator by α = atan(ω²R sin λ cos λ / (g − ω²R cos²λ)). A body dropped from rest lands east of the plumb
 *   point by (1/3) ω g t³ cos λ (to first order in ω); a Foucault pendulum's plane turns at ω sin λ, clockwise
 *   seen from above in the north.
 * - Boundary: a state (r, v) at one instant in one frame; the frames' A, ω (and ω̇).
 * - Ignored: relativity; in the Earth formulas, the Earth's oblateness and its orbit around the Sun, air drag, the
 *   variation of g with height over a drop, and terms of order ω² in the fall deflection.
 * - Valid when: speeds ≪ c. The Earth formulas: drops and pendulum swings small compared with R.
 * - Failure modes: ω = 0 makes the Foucault period infinite (returned as Infinity); at λ = ±90° the plumb deviation
 *   is 0 and the "east" axis is undefined (any horizontal axis then serves).
 */

import { rk4Step, type Force } from './motion';
import { add3, cross3, dot3, len3, scale3, sub3, type Vec3 } from './vec';

export interface State3 {
  r: Vec3;
  v: Vec3;
}

// ---------------------------------------------------------------- lesson 7.1: a frame in linear acceleration

/** The fictitious force in a frame accelerating at A: −mA. */
export const linearFictitiousForce = (m: number, A: Vec3): Vec3 => scale3(A, -m);

/** Effective gravity in a frame accelerating at A: g_eff = g − A (g the gravitational field, a vector). */
export const effectiveGravity = (g: Vec3, A: Vec3): Vec3 => sub3(g, A);

/**
 * Angle [rad] from the vertical of a plumb line (or a hanging mass at rest) in a frame accelerating horizontally at
 * A, with gravity g: atan(A/g). It leans opposite to A.
 */
export const plumbAngleLinear = (g: number, A: number): number => Math.atan2(A, g);

// ---------------------------------------------------------------- lesson 7.2: rates of change and the transformation

/** (dQ/dt)_in = (dQ/dt)_rot + ω × Q. */
export const inertialRate = (rateRot: Vec3, omega: Vec3, Q: Vec3): Vec3 => add3(rateRot, cross3(omega, Q));

/** (dQ/dt)_rot = (dQ/dt)_in − ω × Q. */
export const rotatingRate = (rateIn: Vec3, omega: Vec3, Q: Vec3): Vec3 => sub3(rateIn, cross3(omega, Q));

/** Rotate a vector about +z by the angle θ (counter-clockwise seen from +z). */
export const rotateZ = (q: Vec3, theta: number): Vec3 => {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c * q[0] - s * q[1], s * q[0] + c * q[1], q[2]];
};

/**
 * The state seen from the frame rotating about +z at the constant rate ω (axes coincide at t = 0):
 * r′ = R(−ωt) r, v′ = R(−ωt)(v − ω × r), components along the rotating axes.
 */
export function toRotating(s: State3, omega: number, t: number): State3 {
  const w: Vec3 = [0, 0, omega];
  return { r: rotateZ(s.r, -omega * t), v: rotateZ(sub3(s.v, cross3(w, s.r)), -omega * t) };
}

/** The inverse of `toRotating`: r = R(ωt) r′, v = R(ωt)(v′ + ω × r′). */
export function toInertial(sp: State3, omega: number, t: number): State3 {
  const w: Vec3 = [0, 0, omega];
  return { r: rotateZ(sp.r, omega * t), v: rotateZ(add3(sp.v, cross3(w, sp.r)), omega * t) };
}

// ---------------------------------------------------------------- lesson 7.3: the fictitious forces of a rotating frame

/** Centrifugal force −m ω × (ω × r′); magnitude mω²ρ, ρ the distance from the axis, pointing away from the axis. */
export const centrifugalForce = (m: number, omega: Vec3, rp: Vec3): Vec3 => scale3(cross3(omega, cross3(omega, rp)), -m);

/** Coriolis force −2m ω × v′. Perpendicular to v′ (it does no work in the rotating frame) and to ω. */
export const coriolisForce = (m: number, omega: Vec3, vp: Vec3): Vec3 => scale3(cross3(omega, vp), -2 * m);

/** Euler force −m (dω/dt) × r′ (only while the frame's rotation rate changes). */
export const eulerForce = (m: number, omegaDot: Vec3, rp: Vec3): Vec3 => scale3(cross3(omegaDot, rp), -m);

export interface FrameMotion {
  /** acceleration of the frame's origin relative to an inertial frame [m/s²] */
  A?: Vec3;
  /** angular velocity of the frame's axes [rad/s] */
  omega?: Vec3;
  /** dω/dt [rad/s²] */
  omegaDot?: Vec3;
}

const ZERO: Vec3 = [0, 0, 0];

/**
 * The total force seen in the non-inertial frame: the real force plus every fictitious force,
 * F − mA − mω×(ω×r′) − 2mω×v′ − m ω̇×r′. Pass it to `rk4Step` (or use `stepNonInertial`).
 */
export function nonInertialForce(m: number, real: Force, frame: FrameMotion): Force {
  const A = frame.A ?? ZERO;
  const w = frame.omega ?? ZERO;
  const wd = frame.omegaDot ?? ZERO;
  return (rp, vp, t) => {
    let f = real(rp, vp, t);
    f = add3(f, linearFictitiousForce(m, A));
    f = add3(f, centrifugalForce(m, w, rp));
    f = add3(f, coriolisForce(m, w, vp));
    f = add3(f, eulerForce(m, wd, rp));
    return f;
  };
}

/** One RK4 step of m a′ = F + fictitious forces in the non-inertial frame. */
export function stepNonInertial(m: number, s: State3, real: Force, frame: FrameMotion, t: number, dt: number): State3 {
  const b = rk4Step({ pos: s.r, vel: s.v, m }, nonInertialForce(m, real, frame), t, dt);
  return { r: b.pos, v: b.vel };
}

/** No real force. */
export const freeForce: Force = () => ZERO;

/**
 * The Jacobi integral per unit mass in a frame rotating at constant ω: ½v′² − ½|ω × r′|² + u(r′), with u the real
 * potential energy per unit mass. Conserved, because the Coriolis force does no work.
 */
export function jacobiIntegral(s: State3, omega: Vec3, u = 0): number {
  const wr = cross3(omega, s.r);
  return 0.5 * dot3(s.v, s.v) - 0.5 * dot3(wr, wr) + u;
}

/** Height of the free surface of a liquid rotating with its container, above its lowest point: ω²ρ²/(2g). */
export const paraboloidHeight = (omega: number, rho: number, g: number): number => (omega * omega * rho * rho) / (2 * g);

// ---------------------------------------------------------------- lesson 7.4: the rotating Earth

/** ω in the local axes (east, north, up) at latitude λ [rad]: ω(0, cos λ, sin λ). */
export const earthOmegaLocal = (omega: number, lat: number): Vec3 => [0, omega * Math.cos(lat), omega * Math.sin(lat)];

/**
 * Effective gravity at latitude λ on a spherical Earth of radius R, in the local axes (east, north, up along the
 * radius): g − ω × (ω × R ẑ) = (0, −ω²R sin λ cos λ, −(g − ω²R cos²λ)).
 */
export function effectiveGravityEarth(g: number, omega: number, R: number, lat: number): Vec3 {
  const w = earthOmegaLocal(omega, lat);
  return add3([0, 0, -g], scale3(cross3(w, cross3(w, [0, 0, R])), -1));
}

/** |g_eff| at latitude λ. */
export const effectiveGravityMagnitude = (g: number, omega: number, R: number, lat: number): number =>
  len3(effectiveGravityEarth(g, omega, R, lat));

/**
 * Angle [rad] between the plumb line and the radius at latitude λ:
 * α = atan(ω²R sin λ cos λ / (g − ω²R cos²λ)). Zero at the equator and the poles, largest near 45°.
 */
export function plumbDeviation(g: number, omega: number, R: number, lat: number): number {
  const c = omega * omega * R;
  return Math.atan2(c * Math.sin(lat) * Math.cos(lat), g - c * Math.cos(lat) * Math.cos(lat));
}

/** Eastward deflection of a body dropped from rest for a time t, to first order in ω: (1/3) ω g t³ cos λ. */
export const fallDeflectionEast = (omega: number, g: number, t: number, lat: number): number =>
  (omega * g * t * t * t * Math.cos(lat)) / 3;

/** Rate [rad/s] at which a Foucault pendulum's plane turns at latitude λ: ω sin λ (clockwise from above in the north). */
export const foucaultRate = (omega: number, lat: number): number => omega * Math.sin(lat);

/** Time for the plane of a Foucault pendulum to turn once: 2π / (ω |sin λ|); Infinity on the equator. */
export function foucaultPeriod(omega: number, lat: number): number {
  const r = Math.abs(foucaultRate(omega, lat));
  return r === 0 ? Infinity : (2 * Math.PI) / r;
}

/** Horizontal Coriolis acceleration on a body moving horizontally at speed v at latitude λ: 2ωv sin λ. */
export const horizontalCoriolis = (omega: number, v: number, lat: number): number => 2 * omega * v * Math.abs(Math.sin(lat));
