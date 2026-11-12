/**
 * Lesson 7.2: the rate of change of a vector in a rotating frame, applied twice to the position. Builds on
 * `rotating.ts` (inertialRate, rotateZ) and adds what lesson 7.2's figure and scripts need: the five terms of the
 * inertial acceleration one by one, the picture of a turning unit vector, and a body walking along a line painted
 * on a turntable whose rotation rate may change.
 *
 * MODEL SPECIFICATION
 * - System: an inertial frame S and a frame S′ whose axes turn about the common +z axis through the common origin O
 *   (the turntable's centre), at the angle θ(t) = θ₀ + ω₀t + ½αt² (ω = θ̇ along +z, counter-clockwise seen from +z;
 *   ω̇ = α). Primes are quantities measured in S′: r′ (the same arrow as r, written in S′'s axes), v′ = (dr/dt)_rot,
 *   a′ = (dv′/dt)_rot. The general formula also takes an acceleration A of S′'s origin (lesson 7.1).
 * - Dynamics: (dQ/dt)_in = (dQ/dt)_rot + ω × Q for any vector Q, so a unit vector ê fixed in S′ turns at ω × ê; for
 *   the position, applied twice,
 *     a = A + a′ + 2ω × v′ + ω × (ω × r′) + ω̇ × r′.
 *   A walker moves along the S′ line from O at the angle φ (in S′), at the constant speed v′ relative to S′:
 *   r′(t) = (r₀ + v′t) ê_φ, a′ = 0.
 * - Boundary: the frame's θ₀, ω₀, α (and A); a vector's components in S′; the walker's r₀, v′, φ.
 * - Ignored: relativity; the walker's size; how the walker's feet produce the force it needs (only its value).
 * - Valid when: speeds ≪ c. The formulas hold for any ω(t) about a fixed axis; ω not along z is handled by
 *   `accelerationTerms`, which takes any 3-vectors.
 * - Failure modes: none numeric; a walker with r₀ + v′t < 0 has crossed O and the formulas still hold (r′ changes
 *   sign along ê_φ).
 */

import { inertialRate, rotateZ } from './rotating';
import { add3, cross3, scale3, type Vec3 } from './vec';

const ZERO: Vec3 = [0, 0, 0];

export interface AccelerationTerms {
  /** A: the acceleration of S′'s origin */
  frame: Vec3;
  /** a′: the acceleration measured in S′ */
  relative: Vec3;
  /** 2ω × v′: the Coriolis term */
  coriolis: Vec3;
  /** ω × (ω × r′): the centripetal term, toward the axis */
  centripetal: Vec3;
  /** ω̇ × r′ */
  euler: Vec3;
  /** their sum: the acceleration measured in S */
  total: Vec3;
}

/** a = A + a′ + 2ω × v′ + ω × (ω × r′) + ω̇ × r′, term by term (all vectors in one set of axes). */
export function accelerationTerms(rp: Vec3, vp: Vec3, ap: Vec3, omega: Vec3, omegaDot: Vec3 = ZERO, A: Vec3 = ZERO): AccelerationTerms {
  const coriolis = scale3(cross3(omega, vp), 2);
  const centripetal = cross3(omega, cross3(omega, rp));
  const euler = cross3(omegaDot, rp);
  const total = add3(add3(add3(A, ap), add3(coriolis, centripetal)), euler);
  return { frame: A, relative: ap, coriolis, centripetal, euler, total };
}

/**
 * A unit vector turned by Δθ: |Δê|/Δθ = 2 sin(Δθ/2)/Δθ, which tends to 1 as Δθ → 0 (the chord of the unit circle
 * over its arc).
 */
export const unitChordRatio = (dTheta: number): number => (dTheta === 0 ? 1 : (2 * Math.sin(dTheta / 2)) / dTheta);

/** The angle [rad] between Δê and ê for a unit vector turned by Δθ: π/2 + Δθ/2, which tends to 90°. */
export const unitChordAngle = (dTheta: number): number => Math.PI / 2 + dTheta / 2;

export interface Spin {
  theta0?: number;
  omega0: number;
  /** ω̇ [rad/s²] */
  alpha?: number;
}

/** θ(t) = θ₀ + ω₀t + ½αt². */
export const spinAngle = (s: Spin, t: number): number => (s.theta0 ?? 0) + s.omega0 * t + 0.5 * (s.alpha ?? 0) * t * t;

/** ω(t) = ω₀ + αt. */
export const spinRate = (s: Spin, t: number): number => s.omega0 + (s.alpha ?? 0) * t;

/** A vector fixed in S′ (components q′ along S′'s axes), seen in S at time t. */
export const fixedVectorInertial = (qp: Vec3, s: Spin, t: number): Vec3 => rotateZ(qp, spinAngle(s, t));

/** The rate of change in S of a vector fixed in S′, in S's axes: ω × Q, with (dQ/dt)_rot = 0. */
export const fixedVectorRate = (qp: Vec3, s: Spin, t: number): Vec3 =>
  inertialRate(ZERO, [0, 0, spinRate(s, t)], fixedVectorInertial(qp, s, t));

export interface Walker {
  /** distance from O along the painted line at t = 0 [m] */
  r0: number;
  /** speed along the line relative to S′ [m/s] (negative: toward O) */
  vp: number;
  /** direction of the painted line in S′ [rad] (default 0, along x′) */
  phi?: number;
}

export interface WalkerState {
  /** in S′'s axes */
  rp: Vec3;
  vp: Vec3;
  /** in S's axes */
  r: Vec3;
  v: Vec3;
  a: Vec3;
  /** the acceleration terms, in S's axes */
  terms: AccelerationTerms;
}

/** The walker at time t, in both frames: v = v′ + ω × r′, a = 2ω × v′ + ω × (ω × r′) + ω̇ × r′ (a′ = 0). */
export function walkerState(w: Walker, s: Spin, t: number): WalkerState {
  const phi = w.phi ?? 0;
  const e: Vec3 = [Math.cos(phi), Math.sin(phi), 0];
  const rp = scale3(e, w.r0 + w.vp * t);
  const vp = scale3(e, w.vp);
  const th = spinAngle(s, t);
  const omega: Vec3 = [0, 0, spinRate(s, t)];
  const omegaDot: Vec3 = [0, 0, s.alpha ?? 0];
  // every term is computed in S′'s axes, then turned by θ into S's axes
  const termsP = accelerationTerms(rp, vp, ZERO, omega, omegaDot);
  const turn = (q: Vec3) => rotateZ(q, th);
  const terms: AccelerationTerms = {
    frame: turn(termsP.frame),
    relative: turn(termsP.relative),
    coriolis: turn(termsP.coriolis),
    centripetal: turn(termsP.centripetal),
    euler: turn(termsP.euler),
    total: turn(termsP.total),
  };
  return { rp, vp, r: turn(rp), v: turn(inertialRate(vp, omega, rp)), a: terms.total, terms };
}
