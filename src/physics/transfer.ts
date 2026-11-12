/**
 * Escape and transfer orbits (lesson 6.6): what src/physics/orbit.ts does not already hold. An impulsive burn
 * applied to a state, the state at any point of a conic, a launch at a given speed and angle, the four speeds of a
 * Hohmann transfer, the phase angle of a rendezvous, the bi-elliptic comparison, the height of a radial launch, and
 * a propagator for figures that move a craft along its orbit.
 *
 * MODEL SPECIFICATION
 * - System: a spacecraft (or projectile) of negligible mass moving about one attracting centre of parameter GM, in
 *   the plane of its motion, with the centre at the origin and polar angle φ measured counter-clockwise from +x.
 *   Every quantity is per unit mass, in the notation of orbit.ts: h = r × v (signed, positive counter-clockwise),
 *   ε = v²/2 − GM/r, e, p = h²/GM, a = −GM/(2ε), ω = the polar angle of the periapsis.
 * - Dynamics: r̈ = −GM r̂/r² between burns (orbit.ts). A burn is impulsive: the velocity jumps by Δv at a fixed
 *   position, so ε jumps by v·Δv + Δv²/2 and r does not change. A "tangential" burn is along the velocity (Δv > 0
 *   forward, Δv < 0 backward). On a conic, r(φ) = p/(1 + e cos(φ − ω)), the radial velocity is (GM/h) e sin(φ − ω)
 *   and the transverse velocity h/r.
 * - Boundary: a state (r, v), or a circular orbit and a burn, or a launch point, speed and angle.
 * - Ignored: the mass the engine burns (the rocket equation of lesson 3.6 turns Δv into fuel), the duration of a
 *   burn, other bodies (for an interplanetary transfer: the planets' own gravity, i.e. the escape from the planet,
 *   and the arrival), drag, the rotation of the central body, relativity.
 * - Valid when: the burn lasts much less than the orbital period, the orbits are coplanar, speeds ≪ c.
 * - Failure modes: h = 0 (a radial launch) has no conic angle: `stateAt` is undefined there, use `radialMaxRadius`
 *   and `propagate`; `propagate` takes RK4 steps of a fixed fraction of the local dynamical time r^{3/2}/√GM, so a
 *   close periapsis pass is resolved, but a fall into r → 0 is not (stop at the body's radius).
 */

import { circularSpeed, escapeSpeed, orbitalPeriod, stepKepler, visViva, type Elements, type PlanarState } from './orbit';

/** Apply an impulsive burn Δv (a vector) at the current position. */
export function burn(s: PlanarState, dv: [number, number]): PlanarState {
  return { r: [s.r[0], s.r[1]], v: [s.v[0] + dv[0], s.v[1] + dv[1]] };
}

/** A tangential burn: Δv along the velocity (positive forward, negative backward). */
export function tangentialBurn(s: PlanarState, dv: number): PlanarState {
  const v = Math.hypot(s.v[0], s.v[1]);
  if (v === 0) throw new Error('tangentialBurn: the velocity is zero, so "along the velocity" is undefined');
  return burn(s, [(dv * s.v[0]) / v, (dv * s.v[1]) / v]);
}

/** The state at polar angle φ on the conic of elements `el` (h ≠ 0). */
export function stateAt(GM: number, el: Elements, phi: number): PlanarState {
  if (el.h === 0) throw new Error('stateAt: a radial orbit (h = 0) has no conic angle');
  const th = phi - el.periapsisAngle;
  const d = 1 + el.e * Math.cos(th);
  if (d <= 0) throw new Error('stateAt: φ is beyond the asymptote of the hyperbola');
  const r = el.p / d;
  const vr = (GM / el.h) * el.e * Math.sin(th);
  const vt = el.h / r;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return { r: [r * c, r * s], v: [vr * c - vt * s, vr * s + vt * c] };
}

/** The state at the periapsis or the apoapsis (null for the apoapsis of an open orbit). */
export function apsisState(GM: number, el: Elements, which: 'peri' | 'apo'): PlanarState | null {
  if (which === 'apo' && el.e >= 1) return null;
  return stateAt(GM, el, el.periapsisAngle + (which === 'apo' ? Math.PI : 0));
}

/**
 * A launch from the point (r, 0) at speed v, at angle α above the local horizontal (α = 0 tangential and
 * counter-clockwise, α = π/2 straight out along +x).
 */
export function launchState(r: number, v: number, alpha: number): PlanarState {
  return { r: [r, 0], v: [v * Math.sin(alpha), v * Math.cos(alpha)] };
}

/** The forward burn that turns a circular orbit of radius r into a parabola: (√2 − 1)√(GM/r). */
export const escapeBurn = (GM: number, r: number) => escapeSpeed(GM, r) - circularSpeed(GM, r);

/** The four speeds of a Hohmann transfer r₁ → r₂ (either way) and its burns, signed (positive = forward). */
export function hohmannSpeeds(GM: number, r1: number, r2: number) {
  const a = (r1 + r2) / 2;
  const v1 = circularSpeed(GM, r1);
  const v2 = circularSpeed(GM, r2);
  /** on the transfer ellipse at r₁ and at r₂ */
  const vAt1 = visViva(GM, r1, a);
  const vAt2 = visViva(GM, r2, a);
  const dv1 = vAt1 - v1;
  const dv2 = v2 - vAt2;
  return { a, v1, v2, vAt1, vAt2, dv1, dv2, total: Math.abs(dv1) + Math.abs(dv2), time: orbitalPeriod(GM, a) / 2 };
}

/**
 * The phase angle of a Hohmann rendezvous: the angle by which the target, on the circle r₂, must lead the craft
 * on r₁ at the first burn, so that both arrive together: π − n₂ t_H = π(1 − ((r₁ + r₂)/(2r₂))^{3/2}).
 * Negative when the target must trail (r₂ < r₁).
 */
export function phaseAngle(r1: number, r2: number): number {
  return Math.PI * (1 - Math.pow((r1 + r2) / (2 * r2), 1.5));
}

/** The synodic period: how often the same relative position of two circular orbits returns, 1/|1/T₁ − 1/T₂|. */
export const synodicPeriod = (T1: number, T2: number) => 1 / Math.abs(1 / T1 - 1 / T2);

/**
 * The bi-elliptic transfer r₁ → r_b → r₂ (r_b ≥ r₂ > r₁): three forward/backward burns, total |Δv|.
 * r_b = Infinity is the limit of two parabolas (escape and return from infinity).
 */
export function biEllipticTotal(GM: number, r1: number, r2: number, rb: number): number {
  if (!Number.isFinite(rb)) return escapeBurn(GM, r1) + escapeBurn(GM, r2);
  const a1 = (r1 + rb) / 2;
  const a2 = (r2 + rb) / 2;
  const d1 = visViva(GM, r1, a1) - circularSpeed(GM, r1);
  const d2 = visViva(GM, rb, a2) - visViva(GM, rb, a1);
  const d3 = visViva(GM, r2, a2) - circularSpeed(GM, r2);
  return Math.abs(d1) + Math.abs(d2) + Math.abs(d3);
}

/**
 * The farthest distance of a radial launch from radius R at speed v₀ < v_esc: from ε = v₀²/2 − GM/R = −GM/r_max,
 * r_max = 1/(1/R − v₀²/(2GM)); Infinity at or above the escape speed.
 */
export function radialMaxRadius(GM: number, R: number, v0: number): number {
  const inv = 1 / R - (v0 * v0) / (2 * GM);
  return inv > 0 ? 1 / inv : Number.POSITIVE_INFINITY;
}

/** A bound orbit whose periapsis lies inside a body of radius R hits it (open orbits launched outward escape). */
export const hitsBody = (el: Elements, R: number) => el.e < 1 && el.p / (1 + el.e) < R;

/**
 * Advance a state by dt with RK4 sub-steps of `frac` times the local dynamical time r^{3/2}/√GM.
 * Stops early (returning `hit: true`) when the distance falls below `rMin`.
 */
export function propagate(GM: number, s: PlanarState, dt: number, frac = 2e-3, rMin = 0): { s: PlanarState; hit: boolean } {
  let left = dt;
  let cur = s;
  let guard = 0;
  while (left > 0 && guard++ < 200000) {
    const r = Math.hypot(cur.r[0], cur.r[1]);
    if (r <= rMin) return { s: cur, hit: true };
    const h = Math.min(left, frac * Math.sqrt((r * r * r) / GM));
    cur = stepKepler(GM, cur, h);
    left -= h;
  }
  return { s: cur, hit: Math.hypot(cur.r[0], cur.r[1]) <= rMin };
}

/** Specific energy and angular momentum of a state (for checks). */
export function invariants(GM: number, s: PlanarState): { eps: number; h: number } {
  const r = Math.hypot(s.r[0], s.r[1]);
  return { eps: 0.5 * (s.v[0] * s.v[0] + s.v[1] * s.v[1]) - GM / r, h: s.r[0] * s.v[1] - s.r[1] * s.v[0] };
}
