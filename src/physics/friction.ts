/**
 * Dry friction (lesson 2.4): static friction as an unknown with a ceiling, kinetic friction as a fixed
 * magnitude against the relative sliding; a block on an incline, a block pulled along a floor by a rope,
 * two blocks stacked on a smooth floor, a block sliding onto a board, and the tablecloth pull.
 *
 * MODEL SPECIFICATION
 * - System: rigid blocks treated as point bodies, each pressed against one flat surface with a normal
 *   force N (found from Newton's second law perpendicular to the surface, never assumed to be mg).
 *   Axes are stated per function: along the surface (s, or x on a floor) and perpendicular to it.
 * - Dynamics: the Amontons–Coulomb model. While two surfaces do not slide on each other, the static
 *   friction f_s takes whatever value and direction Newton's second law demands for no relative sliding,
 *   provided |f_s| ≤ μs·N; when that is not enough, they slide, and the kinetic friction has magnitude
 *   μk·N and points against the velocity of the body relative to the other surface. Between switches the
 *   acceleration is constant, so `stepSlider` advances exactly (no integration error) and stops the body
 *   at the instant its relative velocity reaches zero, where static friction is tested again.
 * - Boundary: N ≥ 0 (a rope pulled up hard enough lifts the block: `pullBlock` flags it); the stacked
 *   blocks sit on a smooth floor (no friction under the bottom block).
 * - Ignored: the dependence of μk on speed, of μs on how long the surfaces rested together, rolling,
 *   tipping over, the size and area of the contact, air resistance.
 * - Valid when: dry, clean, rigid surfaces at moderate speeds and pressures (wood, metal, rubber on
 *   concrete). The model assumes μk ≤ μs (an assumption of the model, not a law: it holds for the usual
 *   pairs of surfaces, and the functions here take it as given).
 * - Failure modes: lubricated or very soft contacts (friction depends on speed and area); stick-slip
 *   oscillations (a squeaking door) need μk(v); a block that tips before it slides; a strongly loaded
 *   contact where μ itself changes with N.
 */

import { G } from './constants';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** The two coefficients of one pair of surfaces. */
export interface Coefficients {
  /** static coefficient μs */
  mus: number;
  /** kinetic coefficient μk ≤ μs */
  muk: number;
}

/**
 * Friction on a body at rest relative to the surface, given the sum `drive` of every other force on it
 * along the surface. If |drive| ≤ μs·N, static friction holds with f = −drive; otherwise the body starts
 * to slide in the direction of `drive`, and kinetic friction −sign(drive)·μk·N acts.
 */
export function frictionAtRest(drive: number, N: number, c: Coefficients): { holds: boolean; f: number; fMax: number } {
  const fMax = c.mus * N;
  if (Math.abs(drive) <= fMax * (1 + 1e-12)) return { holds: true, f: -drive, fMax };
  return { holds: false, f: -Math.sign(drive) * c.muk * N, fMax };
}

/** Kinetic friction [N] on a body sliding with velocity vRel relative to the surface: against vRel. */
export const kineticFriction = (vRel: number, N: number, muk: number): number => -Math.sign(vRel) * muk * N;

/** A body that moves along one straight line on a surface: position s [m], velocity v [m/s]. */
export interface Slider {
  s: number;
  v: number;
}

/** The forces on a slider other than friction: `drive` along +s [N], N the normal force [N]. */
export interface SliderForces extends Coefficients {
  m: number;
  drive: number;
  N: number;
}

/** The acceleration of the slider right now, and the friction that acts [m/s², N]. */
export function sliderAcceleration(st: Slider, p: SliderForces): { a: number; f: number; sliding: boolean } {
  if (st.v !== 0) {
    const f = kineticFriction(st.v, p.N, p.muk);
    return { a: (p.drive + f) / p.m, f, sliding: true };
  }
  const r = frictionAtRest(p.drive, p.N, p);
  return r.holds ? { a: 0, f: r.f, sliding: false } : { a: (p.drive + r.f) / p.m, f: r.f, sliding: true };
}

/**
 * Advance a slider by dt under constant forces, exactly: the acceleration is constant until the velocity
 * reaches zero, where the body stops and static friction is tested again (it may hold, or the body may
 * start back the other way).
 */
export function stepSlider(st: Slider, p: SliderForces, dt: number): Slider {
  let { s, v } = st;
  let left = dt;
  for (let k = 0; k < 4 && left > 0; k++) {
    const { a, sliding } = sliderAcceleration({ s, v }, p);
    if (!sliding) return { s, v: 0 };
    // a moving body whose acceleration opposes its velocity stops at t = −v/a
    if (v !== 0 && a * v < 0) {
      const tStop = -v / a;
      if (tStop <= left) {
        s += v * tStop + 0.5 * a * tStop * tStop;
        v = 0;
        left -= tStop;
        continue;
      }
    }
    s += v * left + 0.5 * a * left * left;
    v += a * left;
    left = 0;
  }
  return { s, v };
}

/** The angle [deg] above which a body at rest on an incline slips: tan θ = μs, whatever its mass. */
export const thresholdAngle = (mus: number): number => deg(Math.atan(mus));

/** A block on an incline at angle θ, at rest or sliding down; s points down the slope. */
export interface InclineState {
  N: number;
  /** mg sin θ, the component of the weight down the slope [N] */
  along: number;
  /** μs N [N] */
  fMax: number;
  /** does static friction hold a block placed at rest? */
  holds: boolean;
  /** the friction on a block at rest, or kinetic once it slides; positive up the slope [N] */
  f: number;
  /** acceleration down the slope [m/s²]: 0 if it holds, g(sin θ − μk cos θ) once it slides down */
  a: number;
}

export function incline(m: number, thetaDeg: number, c: Coefficients, g = G): InclineState {
  const th = rad(thetaDeg);
  const N = m * g * Math.cos(th);
  const along = m * g * Math.sin(th);
  const r = frictionAtRest(along, N, c);
  // f is reported positive up the slope (the opposite of +s)
  return { N, along, fMax: r.fMax, holds: r.holds, f: -r.f, a: r.holds ? 0 : (along + r.f) / m };
}

/** Acceleration [m/s²] down the slope of a block sliding down: g(sin θ − μk cos θ) (negative: it slows down). */
export const slideDownAcceleration = (thetaDeg: number, muk: number, g = G): number =>
  g * (Math.sin(rad(thetaDeg)) - muk * Math.cos(rad(thetaDeg)));

/** Deceleration [m/s²] of a block sliding up the slope: g(sin θ + μk cos θ). */
export const slideUpDeceleration = (thetaDeg: number, muk: number, g = G): number =>
  g * (Math.sin(rad(thetaDeg)) + muk * Math.cos(rad(thetaDeg)));

/**
 * The range of forces F, along the slope and up it, that keep a block at rest on an incline:
 * F_min = mg(sin θ − μs cos θ) (static friction up the slope, at its limit; 0 if the block holds by itself)
 * to F_max = mg(sin θ + μs cos θ) (static friction down the slope, at its limit). At F = mg sin θ, f = 0.
 */
export function holdRange(m: number, thetaDeg: number, mus: number, g = G): { Fmin: number; Fmax: number; Fzero: number } {
  const s = Math.sin(rad(thetaDeg));
  const c = Math.cos(rad(thetaDeg));
  return { Fmin: Math.max(0, m * g * (s - mus * c)), Fmax: m * g * (s + mus * c), Fzero: m * g * s };
}

/** A block on a level floor pulled by a rope with force F at angle φ above the horizontal; x along the floor. */
export interface PullState {
  N: number;
  /** F cos φ [N] */
  Fx: number;
  fMax: number;
  /** the rope lifts the block off the floor (F sin φ > mg) */
  lifted: boolean;
  /** does static friction hold a block at rest? */
  holds: boolean;
  /** friction on the block, along +x [N] (static if it holds, kinetic otherwise) */
  f: number;
  /** acceleration of a block that starts at rest or slides forward [m/s²] */
  a: number;
}

/**
 * The block starts at rest unless `sliding` (then it is moving forward, +x, and friction is kinetic).
 * N = mg − F sin φ from the vertical component of the second law.
 */
export function pullBlock(m: number, F: number, phiDeg: number, c: Coefficients, sliding = false, g = G): PullState {
  const Fx = F * Math.cos(rad(phiDeg));
  const Nraw = m * g - F * Math.sin(rad(phiDeg));
  const lifted = Nraw < 0;
  const N = Math.max(0, Nraw);
  const fMax = c.mus * N;
  if (sliding) {
    const f = -c.muk * N;
    return { N, Fx, fMax, lifted, holds: false, f, a: (Fx + f) / m };
  }
  const r = frictionAtRest(Fx, N, c);
  return { N, Fx, fMax, lifted, holds: r.holds, f: r.f, a: r.holds ? 0 : (Fx + r.f) / m };
}

/** The rope force [N] at angle φ that drags the block at constant speed: μk mg / (cos φ + μk sin φ). */
export const constantSpeedPull = (m: number, phiDeg: number, muk: number, g = G): number =>
  (muk * m * g) / (Math.cos(rad(phiDeg)) + muk * Math.sin(rad(phiDeg)));

/** The best rope angle (tan φ = μk) and the smallest constant-speed pull μk mg/√(1 + μk²). */
export const bestPull = (m: number, muk: number, g = G): { phiDeg: number; F: number } => ({
  phiDeg: deg(Math.atan(muk)),
  F: (muk * m * g) / Math.sqrt(1 + muk * muk),
});

/** Two blocks: A on top of B, B on a smooth floor; a horizontal force F (along +x) on A or on B. */
export interface StackInput extends Coefficients {
  mA: number;
  mB: number;
  F: number;
  on: 'A' | 'B';
  g?: number;
}

export interface StackState {
  /** the largest F for which they move together: (mA + mB) μs g, or (mA + mB) μs g mA/mB when pulling A */
  Fmax: number;
  together: boolean;
  /** the friction that B exerts on A, along +x [N]; A exerts the opposite on B (a third-law pair) */
  fOnA: number;
  aA: number;
  aB: number;
}

export function stack(p: StackInput): StackState {
  const g = p.g ?? G;
  const M = p.mA + p.mB;
  const limit = p.mus * p.mA * g; // the normal force between the blocks is mA g
  const kinetic = p.muk * p.mA * g;
  if (p.on === 'B') {
    // friction is the only horizontal force on A: mA a ≤ μs mA g
    const Fmax = M * p.mus * g;
    const a = p.F / M;
    if (p.mA * a <= limit * (1 + 1e-12)) return { Fmax, together: true, fOnA: p.mA * a, aA: a, aB: a };
    // B runs ahead, A slides back relative to B: friction on A is forward
    return { Fmax, together: false, fOnA: kinetic, aA: kinetic / p.mA, aB: (p.F - kinetic) / p.mB };
  }
  // pulling A: friction is the only horizontal force on B, mB a ≤ μs mA g
  const Fmax = (M * p.mus * g * p.mA) / p.mB;
  const a = p.F / M;
  if (p.mB * a <= limit * (1 + 1e-12)) return { Fmax, together: true, fOnA: -p.mB * a, aA: a, aB: a };
  // A runs ahead, the friction on A is backward and on B forward
  return { Fmax, together: false, fOnA: -kinetic, aA: (p.F - kinetic) / p.mA, aB: kinetic / p.mB };
}

/**
 * A block A slides at v₀ onto a board B at rest on smooth ice; kinetic friction μk between them until they
 * share one velocity. x along v₀, from the point where A lands on B.
 */
export function boardSlide(mA: number, mB: number, v0: number, muk: number, g = G) {
  const aA = -muk * g; // friction on A is backward
  const aB = (muk * mA * g) / mB; // and on B forward
  const vCommon = (mA * v0) / (mA + mB);
  const t = (vCommon - v0) / aA;
  const xA = v0 * t + 0.5 * aA * t * t;
  const xB = 0.5 * aB * t * t;
  return { aA, aB, vCommon, t, xA, xB, slip: xA - xB };
}

/**
 * The tablecloth pull: a dish sits a distance L from the trailing edge of a cloth (the edge away from the
 * hand) that is pulled with acceleration aCloth from rest (aCloth > μs g, so the dish slides on the cloth at
 * once). Kinetic friction μk g drags the dish forward while it slides back relative to the cloth, until the
 * trailing edge passes under it; then the table, coefficient muTable, stops it.
 */
export function tableclothPull(L: number, aCloth: number, muk: number, muTable: number, g = G) {
  const aDish = muk * g;
  const t = Math.sqrt((2 * L) / (aCloth - aDish));
  const onCloth = 0.5 * aDish * t * t;
  const v = aDish * t;
  const onTable = (v * v) / (2 * muTable * g);
  return { aDish, t, onCloth, v, onTable, total: onCloth + onTable };
}

/**
 * A block sent up an incline with v₀ (μk < tan θ, so it comes back): the time up, the distance, and the
 * time down to its start. td/tu = √((sin θ + μk cos θ)/(sin θ − μk cos θ)).
 */
export function upAndBack(v0: number, thetaDeg: number, muk: number, g = G) {
  const aUp = slideUpDeceleration(thetaDeg, muk, g);
  const aDown = slideDownAcceleration(thetaDeg, muk, g);
  const tUp = v0 / aUp;
  const d = (v0 * v0) / (2 * aUp);
  const tDown = Math.sqrt((2 * d) / aDown);
  return { aUp, aDown, tUp, d, tDown, vBack: aDown * tDown };
}
