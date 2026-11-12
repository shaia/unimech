/**
 * Rolling, with and without slipping (lesson 8.4), on top of the shared rigid-body model (rigidbody.ts): a round body
 * released from rest on an incline, which rolls when the static friction it needs is available and otherwise rolls
 * with slipping under kinetic friction; and a body that lands skidding on a level floor (rigidbody.ts `skidState`),
 * with the slip speed of its contact point, its kinetic energy and its angular momentum about a point of the floor.
 *
 * MODEL SPECIFICATION
 * - System: one round rigid body of mass m, radius R and I_cm = β m R² (β from rigidbody.ts `BETA`), on a plane
 *   (an incline of angle θ, or the level floor). x is the distance the centre has moved along the plane, positive
 *   down the slope (incline) or along the throw (floor). The spin ω is a scalar in the ROLLING SENSE, as in
 *   rigidbody.ts: ω > 0 is the sense in which the body would turn if it rolled along +x, so the contact point moves
 *   relative to the plane at the slip speed u = v − ωR, and rolling without slipping is u = 0.
 * - Dynamics: Σ F = m a along the plane, N = m g cos θ across it; Σ τ = I_cm α about the axis through the CM (the CM
 *   accelerates, the equation still holds there). Rolling: a = αR, the friction is static and whatever rolling needs,
 *   f = β m a (up the slope on an incline), and it does no work. Slipping: kinetic friction μ N opposes u.
 *   Incline from rest: rolling needs μ_s ≥ β tan θ/(1 + β), then a = g sin θ/(1 + β); with less, the body slips
 *   from the start with a = g(sin θ − μ cos θ), αR = μ g cos θ/β, and u grows (no return to rolling on the slope).
 *   Floor: friction μ m g against u until u = 0 at t = β|u₀|/(μ g (1 + β)), then it rolls with no friction.
 *   About any fixed point Q of the floor line the friction has no torque and the weight and the normal force (equal,
 *   opposite, on one vertical line) cancel, so L_Q = m R (v + β R ω) (in the rolling sense) is conserved.
 * - Boundary: the incline body starts at rest at x = 0; the floor body starts at x = 0 with v₀ and ω₀ (any signs).
 * - Ignored: rolling resistance (deformation of body and plane), air, the difference between μ_s and μ_k (the
 *   figure uses one μ for both, so the slip threshold and the kinetic friction share it), bouncing.
 * - Valid when: the body stays on the plane (N > 0: θ < 90°), it is rigid and round, and the plane is fixed.
 * - Failure modes: μ = 0 on the floor never reaches rolling (the time is ∞); on the incline with μ exactly at the
 *   threshold the body rolls (f = μ_s N is allowed).
 */

import { G } from './constants';
import { minMuForRolling, rollingAcceleration, rollingFriction, skidState, skidToRoll } from './rigidbody';

export interface InclineMotion {
  /** true when the body rolls without slipping */
  rolling: boolean;
  /** acceleration of the centre down the slope [m/s²] */
  a: number;
  /** angular acceleration times R, in the rolling sense [m/s²]: a when rolling */
  alphaR: number;
  /** the friction on the body from the slope, up the slope, per unit mass [N/kg] */
  fPerMass: number;
  /** the least μ_s for rolling at this angle */
  muMin: number;
  /** the rate at which the slip speed u = v − ωR grows [m/s²]: 0 when rolling */
  slipRate: number;
}

/**
 * A round body (β) released from rest on an incline of angle θ (radians) with one coefficient μ for static and
 * kinetic friction. β = 0 is a point mass (or a block): it has nothing to turn, so it needs no friction to "roll";
 * a block that slides on a frictionless strip is β = 0 with μ = 0.
 */
export function inclineMotion(beta: number, theta: number, mu: number, g = G): InclineMotion {
  const muMin = minMuForRolling(beta, theta);
  if (beta === 0) {
    // a block: no rotation; kinetic friction μ N if it slides (it slides when tan θ > μ)
    const slides = Math.tan(theta) > mu;
    const a = slides ? g * (Math.sin(theta) - mu * Math.cos(theta)) : 0;
    return { rolling: false, a, alphaR: 0, fPerMass: slides ? mu * g * Math.cos(theta) : g * Math.sin(theta), muMin: 0, slipRate: a };
  }
  if (mu >= muMin) {
    const a = rollingAcceleration(beta, theta, g);
    return { rolling: true, a, alphaR: a, fPerMass: rollingFriction(1, beta, theta, g), muMin, slipRate: 0 };
  }
  const f = mu * g * Math.cos(theta);
  const a = g * Math.sin(theta) - f;
  const alphaR = f / beta;
  return { rolling: false, a, alphaR, fPerMass: f, muMin, slipRate: a - alphaR };
}

/** Distance, speed, spin (in the rolling sense, times R) and turned angle at time t, from rest. */
export function inclineState(beta: number, theta: number, mu: number, R: number, t: number, g = G) {
  const m = inclineMotion(beta, theta, mu, g);
  const x = 0.5 * m.a * t * t;
  const v = m.a * t;
  const omega = (m.alphaR * t) / R;
  const phi = (0.5 * m.alphaR * t * t) / R;
  return { x, v, omega, phi, u: v - omega * R };
}

/** The time to roll (or slide) a distance L down the slope from rest: √(2L/a). */
export function timeDown(beta: number, theta: number, mu: number, L: number, g = G) {
  const { a } = inclineMotion(beta, theta, mu, g);
  return a > 0 ? Math.sqrt((2 * L) / a) : Infinity;
}

/**
 * Kinetic energy per unit mass at the foot of a slope of length L, and the heat per unit mass the kinetic friction
 * made on the way (zero when the body rolls): m g L sin θ = K + Q.
 */
export function inclineEnergy(beta: number, theta: number, mu: number, L: number, R: number, g = G) {
  const t = timeDown(beta, theta, mu, L, g);
  const s = inclineState(beta, theta, mu, R, t, g);
  const K = 0.5 * s.v * s.v + 0.5 * beta * (s.omega * R) ** 2;
  return { K, heat: g * L * Math.sin(theta) - K };
}

// ---------------------------------------------------------------- the skidding body on a level floor

/** The slip speed of the contact point u = v − ωR (rolling sense): positive, the contact point slides forward. */
export const slipSpeed = (v: number, omega: number, R: number) => v - omega * R;

/** Kinetic energy per unit mass of a round body: ½ v² + ½ β (ωR)². */
export const kePerMass = (v: number, omega: number, R: number, beta: number) => 0.5 * v * v + 0.5 * beta * (omega * R) ** 2;

/** Angular momentum per unit mass about a fixed point of the floor line, in the rolling sense: R (v + β R ω). */
export const floorAngularMomentum = (v: number, omega: number, R: number, beta: number) => R * (v + beta * R * omega);

/** The state of the skidding body at time t (rigidbody.ts `skidState`), with its slip speed and energy per mass. */
export function skid(v0: number, omega0: number, R: number, beta: number, mu: number, t: number, g = G) {
  const s = skidState(v0, omega0, R, beta, mu, t, g);
  return { ...s, u: slipSpeed(s.v, s.omega, R), K: kePerMass(s.v, s.omega, R, beta) };
}

/** The whole skid: rigidbody.ts `skidToRoll`, with the turning point (v = 0) when the body reverses during the skid. */
export function skidSummary(v0: number, omega0: number, R: number, beta: number, mu: number, g = G) {
  const r = skidToRoll(v0, omega0, R, beta, mu, g);
  const s = Math.sign(r.u0);
  // v = v0 − s μ g t vanishes during the skid when v0 and the friction's push −s μ g have opposite signs
  const tTurn = s !== 0 && Math.sign(v0) === s ? Math.abs(v0) / (mu * g) : null;
  const turns = tTurn !== null && tTurn < r.tRoll;
  return {
    ...r,
    tTurn: turns ? tTurn : null,
    xTurn: turns && tTurn !== null ? v0 * tTurn - 0.5 * s * mu * g * tTurn * tTurn : null,
    /** the backspin (rolling-sense ω₀ < 0) beyond which the body ends rolling backward: R|ω₀| > v₀/β */
    returnSpinR: v0 / beta,
  };
}

/**
 * Step the skid numerically from Newton's second law and the torque equation about the CM alone (explicit Euler,
 * friction −sign(u) μ m g while the contact point slips); the step that would carry u through zero ends the skid
 * (the friction then takes the value that makes u = 0). A check of the closed form, for the convergence tests.
 */
export function integrateSkid(v0: number, omega0: number, R: number, beta: number, mu: number, tEnd: number, dt: number, g = G) {
  let v = v0;
  let wR = omega0 * R;
  let x = 0;
  let rolling = Math.abs(v - wR) < 1e-15;
  const n = Math.round(tEnd / dt);
  for (let i = 0; i < n; i++) {
    x += v * dt;
    if (rolling) continue;
    const s = Math.sign(v - wR);
    const nv = v - s * mu * g * dt;
    const nwR = wR + (s * mu * g * dt) / beta;
    if (Math.sign(nv - nwR) !== s) {
      // the slip ends inside this step: the friction impulse that brings u to zero exactly
      const J = (v - wR) / (1 + 1 / beta);
      v -= J;
      wR = v;
      rolling = true;
    } else {
      v = nv;
      wR = nwR;
    }
  }
  return { x, v, omega: wR / R, rolling };
}
