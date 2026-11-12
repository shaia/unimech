/**
 * Special-relativity kinematics (chapter 9, lessons 9.1–9.6): the ether experiment, time dilation and length
 * contraction, the Lorentz transformation, velocity addition and the Doppler effect, the spacetime interval and the
 * Minkowski diagram, and the paradoxes. Shared by the chapter's figures and scripts, so every number of the chapter
 * comes from one model; chapter 10 (dynamics) builds on it.
 *
 * MODEL SPECIFICATION
 * - System: events (t, x) described from two inertial frames in standard configuration. S is unprimed; the primed
 *   frame S′ moves relative to S at velocity v along +x (v may be negative); the axes are parallel and the origins
 *   coincide at t = t′ = 0. The transverse coordinates are unchanged (y′ = y, z′ = z) and are carried only by
 *   `transverseVelocity`. Every function takes the speed of light `c` as its last argument, default C_LIGHT = 3.0e8
 *   m/s, so the same code serves SI (metres, seconds) and the units the lessons use: c = 1 with light-years and
 *   years, or light-seconds and seconds, or x and ct in the same unit.
 * - Dynamics: kinematics only. β = v/c, γ = 1/√(1 − β²). The Lorentz transformation
 *     x′ = γ(x − vt),  t′ = γ(t − vx/c²),
 *   and its inverse with v → −v. It keeps the interval s² = c²Δt² − Δx² (timelike positive, the course's sign).
 *   From it: time dilation Δt = γτ (τ the proper time, read on a clock at rest in its frame), length contraction
 *   L = L₀/γ (L₀ the proper length, measured in the rest frame of the body), the relativity of simultaneity
 *   Δt′ = −γvΔx/c² for Δt = 0, velocity addition u = (u′ + v)/(1 + u′v/c²), and the longitudinal Doppler factor
 *   f/f₀ = √((1 + β)/(1 − β)) for a source and an observer approaching each other (β > 0 approaching, β < 0
 *   receding). A worldline's proper time is the sum over its straight pieces of √(Δt² − Δx²/c²).
 * - Ether (lesson 9.1): the classical prediction the experiment refuted. An interferometer with two arms of length
 *   L moves through an ether at v along one arm; light moves at c relative to the ether and Galilean addition
 *   holds. The round trip takes (2L/c)/(1 − β²) along the motion and (2L/c)/√(1 − β²) across it. Rotating the
 *   apparatus by 90° swaps the arms, so the fringe pattern shifts by 2cΔt/λ fringes ≈ 2Lβ²/λ.
 * - Boundary: events and velocities as given; the paradox helpers fix their own scenes (documented on each).
 * - Ignored: gravity (special relativity only: no clock rates from height), acceleration of clocks (a clock's rate
 *   depends only on its speed — the clock hypothesis; a turnaround is instantaneous), the time light takes to
 *   reach an observer unless a function says it computes a received signal (the Doppler helpers, the twin's
 *   received signals). Seeing is not measuring.
 * - Valid when: every speed is below c. In the ether model, the ether exists (it does not: that is the point).
 * - Failure modes: `gammaOf` throws a RangeError for |β| ≥ 1, so every function that needs γ throws for a speed at
 *   or above c. `properTimeBetween` returns null for a spacelike pair, `properDistanceBetween` for a timelike one;
 *   `simultaneousFrameVelocity` returns null for a timelike or lightlike pair, `coLocalFrameVelocity` for a spacelike
 *   or lightlike pair. `classifyInterval` calls a pair lightlike when c²Δt² and Δx² agree to a relative 1e-9.
 */

import { C_LIGHT } from './constants';

/** An event in the (t, x) plane of one frame: when [s, or the time unit with c = 1] and where [m, or that unit]. */
export interface Event {
  t: number;
  x: number;
}

// ---------------------------------------------------------------- β and γ

/** β = v/c, the speed as a fraction of the speed of light. */
export const beta = (v: number, c = C_LIGHT): number => v / c;

/** γ = 1/√(1 − β²) ≥ 1 from β. Throws for |β| ≥ 1, where no frame exists. */
export function gammaOf(b: number): number {
  const b2 = b * b;
  if (!(b2 < 1)) throw new RangeError(`β = ${b} is not below 1: no inertial frame moves at or above c`);
  return 1 / Math.sqrt(1 - b2);
}

/** The Lorentz factor γ of a speed v. */
export const lorentzGamma = (v: number, c = C_LIGHT): number => gammaOf(v / c);

/** |β| from γ ≥ 1: √(1 − 1/γ²). */
export function betaFromGamma(g: number): number {
  if (!(g >= 1)) throw new RangeError(`γ = ${g} is below 1`);
  return Math.sqrt(1 - 1 / (g * g));
}

/** The small-speed approximation γ ≈ 1 + β²/2; its error is about (3/8)β⁴. */
export const gammaSmallSpeed = (b: number): number => 1 + (b * b) / 2;

/** Rapidity φ = artanh β: rapidities of collinear boosts add. */
export const rapidity = (b: number): number => {
  gammaOf(b);
  return Math.atanh(b);
};

/** β from the rapidity: tanh φ. */
export const betaFromRapidity = (phi: number): number => Math.tanh(phi);

// ---------------------------------------------------------------- lesson 9.1: the ether and the postulates

/** Galilean velocity addition u = u′ + v, the classical prediction (for contrast with `addVelocities`). */
export const galileanAdd = (uPrime: number, v: number): number => uPrime + v;

/** Ether model: round-trip time along an arm of length L parallel to the ether wind v: (2L/c)/(1 − β²). */
export const etherTimeParallel = (L: number, v: number, c = C_LIGHT): number => ((2 * L) / c) * gammaOf(v / c) ** 2;

/** Ether model: round-trip time along an arm of length L across the ether wind v: (2L/c)/√(1 − β²). */
export const etherTimePerpendicular = (L: number, v: number, c = C_LIGHT): number =>
  ((2 * L) / c) * gammaOf(v / c);

/** Ether model, equal arms: parallel minus perpendicular round-trip time [s]; ≈ Lβ²/c for β ≪ 1. */
export const etherTimeDifference = (L: number, v: number, c = C_LIGHT): number =>
  etherTimeParallel(L, v, c) - etherTimePerpendicular(L, v, c);

/** Ether model: fringes the pattern shifts by when the apparatus is turned 90° (the arms swap): 2cΔt/λ. */
export const fringeShiftOnRotation = (L: number, v: number, lambda: number, c = C_LIGHT): number =>
  (2 * c * etherTimeDifference(L, v, c)) / lambda;

/** Its small-speed form 2Lβ²/λ. */
export const fringeShiftSmallSpeed = (L: number, v: number, lambda: number, c = C_LIGHT): number =>
  (2 * L * (v / c) ** 2) / lambda;

// ---------------------------------------------------------------- lesson 9.2: time dilation, length contraction

/** Time between two ticks of a clock moving at v, measured in the frame where it moves: γτ. */
export const dilatedTime = (tau: number, v: number, c = C_LIGHT): number => lorentzGamma(v, c) * tau;

/** Proper time τ = Δt/γ of a clock moving at v, from the time Δt measured in the frame where it moves. */
export const properTimeOfMovingClock = (dt: number, v: number, c = C_LIGHT): number => dt / lorentzGamma(v, c);

/** Length of a body of proper length L₀ moving at v along that length: L₀/γ. */
export const contractedLength = (L0: number, v: number, c = C_LIGHT): number => L0 / lorentzGamma(v, c);

/** Proper length L₀ = γL of a body measured as L while moving at v along it. */
export const properLength = (L: number, v: number, c = C_LIGHT): number => L * lorentzGamma(v, c);

/**
 * A light clock (mirrors L₀ apart in its rest frame) moving at v, seen from the frame where it moves: the time of
 * one round trip of the light. Transverse (mirrors' separation across the motion): the light runs the diagonals,
 * 2L₀/√(c² − v²). Longitudinal (separation along the motion, contracted to L₀/γ): L/(c − v) + L/(c + v). Both equal
 * γ·2L₀/c: a clock's rate does not depend on its orientation.
 */
export function lightClockTick(L0: number, v: number, orientation: 'transverse' | 'longitudinal', c = C_LIGHT): number {
  const g = lorentzGamma(v, c);
  if (orientation === 'transverse') return (2 * Math.hypot(L0, (v * L0 * g) / c)) / c;
  const L = L0 / g;
  return L / (c - Math.abs(v)) + L / (c + Math.abs(v));
}

/** Fraction of unstable particles (mean lifetime τ in their rest frame) left after a proper time t: e^(−t/τ). */
export const survivalFraction = (properTime: number, meanLifetime: number): number => Math.exp(-properTime / meanLifetime);

// ---------------------------------------------------------------- lesson 9.3: the Lorentz transformation

/** The event as S′ (moving at v along +x) describes it: x′ = γ(x − vt), t′ = γ(t − vx/c²). */
export function lorentz(e: Event, v: number, c = C_LIGHT): Event {
  const g = lorentzGamma(v, c);
  return { t: g * (e.t - (v * e.x) / (c * c)), x: g * (e.x - v * e.t) };
}

/** The inverse: an event described in S′ (moving at v), described back in S: x = γ(x′ + vt′), t = γ(t′ + vx′/c²). */
export const inverseLorentz = (ep: Event, v: number, c = C_LIGHT): Event => lorentz(ep, -v, c);

/** The Galilean transformation x′ = x − vt, t′ = t (the limit c → ∞), for contrast. */
export const galileo = (e: Event, v: number): Event => ({ t: e.t, x: e.x - v * e.t });

/** Difference of two events, b − a, in the frame that describes both. */
export const separation = (a: Event, b: Event): Event => ({ t: b.t - a.t, x: b.x - a.x });

/** Two events simultaneous in S (Δt = 0) and Δx apart are Δt′ = −γvΔx/c² apart in S′. */
export const simultaneityShift = (dx: number, v: number, c = C_LIGHT): number => (-lorentzGamma(v, c) * v * dx) / (c * c);

/**
 * The velocity of the frame in which two events (separated by Δt, Δx in S) are simultaneous: v = c²Δt/Δx.
 * Exists only for a spacelike pair; null otherwise.
 */
export function simultaneousFrameVelocity(dt: number, dx: number, c = C_LIGHT): number | null {
  return classifyInterval(dt, dx, c) === 'spacelike' ? (c * c * dt) / dx : null;
}

/** The velocity of the frame in which two events happen at the same place: v = Δx/Δt. Timelike pairs only. */
export function coLocalFrameVelocity(dt: number, dx: number, c = C_LIGHT): number | null {
  return classifyInterval(dt, dx, c) === 'timelike' ? dx / dt : null;
}

// ---------------------------------------------------------------- lesson 9.4: velocities and Doppler

/** A body moves at u′ along x in S′ (which moves at v): its velocity in S, (u′ + v)/(1 + u′v/c²). */
export const addVelocities = (uPrime: number, v: number, c = C_LIGHT): number => (uPrime + v) / (1 + (uPrime * v) / (c * c));

/** A body moves at u along x in S: its velocity in S′ (moving at v), (u − v)/(1 − uv/c²). */
export const velocityInFrame = (u: number, v: number, c = C_LIGHT): number => (u - v) / (1 - (u * v) / (c * c));

/**
 * A body with velocity (u′ₓ, u′ᵧ) in S′ (moving at v along x): its velocity in S,
 * uₓ = (u′ₓ + v)/(1 + u′ₓv/c²), uᵧ = u′ᵧ/(γ(1 + u′ₓv/c²)).
 */
export function transverseVelocity(uxPrime: number, uyPrime: number, v: number, c = C_LIGHT): [number, number] {
  const d = 1 + (uxPrime * v) / (c * c);
  return [(uxPrime + v) / d, uyPrime / (lorentzGamma(v, c) * d)];
}

/**
 * Longitudinal Doppler factor f_received/f_emitted = √((1 + β)/(1 − β)), with β > 0 when source and observer
 * approach each other and β < 0 when they recede. Only the relative velocity enters: no medium.
 */
export function dopplerFactor(betaApproach: number): number {
  gammaOf(betaApproach);
  return Math.sqrt((1 + betaApproach) / (1 - betaApproach));
}

/** Received frequency for an emitted f₀, β > 0 approaching. */
export const dopplerFrequency = (f0: number, betaApproach: number): number => f0 * dopplerFactor(betaApproach);

/** Received wavelength for an emitted λ₀, β > 0 approaching: λ₀/D. */
export const dopplerWavelength = (lambda0: number, betaApproach: number): number => lambda0 / dopplerFactor(betaApproach);

/** The β (approach positive) that gives the ratio f_received/f_emitted = r: (r² − 1)/(r² + 1). */
export const betaFromDopplerRatio = (r: number): number => (r * r - 1) / (r * r + 1);

/** Classical Doppler with a medium (sound), for contrast: a source approaching at v_s a listener at rest, f₀/(1 − β). */
export const classicalDopplerMovingSource = (f0: number, betaApproach: number): number => f0 / (1 - betaApproach);

/** Classical Doppler with a medium (sound), for contrast: a listener approaching at v_o a source at rest, f₀(1 + β). */
export const classicalDopplerMovingObserver = (f0: number, betaApproach: number): number => f0 * (1 + betaApproach);

// ---------------------------------------------------------------- lesson 9.5: the interval and the Minkowski diagram

/** The interval s² = c²Δt² − Δx² − Δy² − Δz² (timelike positive). */
export const interval = (dt: number, dx: number, c = C_LIGHT, dy = 0, dz = 0): number =>
  c * c * dt * dt - dx * dx - dy * dy - dz * dz;

export type IntervalKind = 'timelike' | 'lightlike' | 'spacelike';

/** Classify a pair of events by the sign of s²; lightlike when c²Δt² and Δx² agree to a relative 1e-9. */
export function classifyInterval(dt: number, dx: number, c = C_LIGHT): IntervalKind {
  const a = c * c * dt * dt;
  const b = dx * dx;
  const scale = Math.max(a, b);
  if (scale === 0 || Math.abs(a - b) <= 1e-9 * scale) return 'lightlike';
  return a > b ? 'timelike' : 'spacelike';
}

/** Can a signal at or below c connect the two events (timelike or lightlike)? */
export const canBeCausal = (dt: number, dx: number, c = C_LIGHT): boolean => classifyInterval(dt, dx, c) !== 'spacelike';

/** Proper time between two events, √(s²)/c: the time on a clock that moves uniformly from one to the other. */
export function properTimeBetween(dt: number, dx: number, c = C_LIGHT): number | null {
  const k = classifyInterval(dt, dx, c);
  if (k === 'spacelike') return null;
  return k === 'lightlike' ? 0 : Math.sqrt(interval(dt, dx, c)) / c;
}

/** Proper distance √(−s²): the distance in the frame where the two events are simultaneous. Spacelike only. */
export function properDistanceBetween(dt: number, dx: number, c = C_LIGHT): number | null {
  const k = classifyInterval(dt, dx, c);
  if (k === 'timelike') return null;
  return k === 'lightlike' ? 0 : Math.sqrt(-interval(dt, dx, c));
}

/**
 * The axes of S′ drawn in the (x, ct) plane of S, with x and ct in one unit: the ct′ axis is the line x = β·ct and
 * the x′ axis the line ct = β·x, each turned by atan β toward the light line. `ctUnit` is the event x′ = 0, ct′ = 1
 * and `xUnit` the event x′ = 1, ct′ = 0, in S coordinates [x, ct]: (γβ, γ) and (γ, γβ). Their spacing along the
 * primed axes is longer than 1 on paper: both lie on the hyperbolae c²t² − x² = ±1.
 */
export function primedAxes(b: number): { ctUnit: [number, number]; xUnit: [number, number]; angle: number } {
  const g = gammaOf(b);
  return { ctUnit: [g * b, g], xUnit: [g, g * b], angle: Math.atan(b) };
}

/** S coordinates [x, ct] of the event whose S′ coordinates are (x′, ct′), β = v/c, x and ct in one unit. */
export function fromPrimedDiagram(xPrime: number, ctPrime: number, b: number): [number, number] {
  const g = gammaOf(b);
  return [g * (xPrime + b * ctPrime), g * (ctPrime + b * xPrime)];
}

/** S′ coordinates [x′, ct′] of the event at (x, ct) in S, β = v/c, x and ct in one unit. */
export function toPrimedDiagram(x: number, ct: number, b: number): [number, number] {
  const g = gammaOf(b);
  return [g * (x - b * ct), g * (ct - b * x)];
}

// ---------------------------------------------------------------- lesson 9.6: worldlines and the paradoxes

/**
 * Proper time along a worldline given by its corner events in one inertial frame (straight between corners, every
 * piece slower than c): Σ √(Δt² − Δx²/c²). Throws if a piece is spacelike.
 */
export function worldlineProperTime(events: readonly Event[], c = C_LIGHT): number {
  let tau = 0;
  for (let i = 1; i < events.length; i++) {
    const d = separation(events[i - 1], events[i]);
    if (d.t <= 0) throw new RangeError('a worldline runs forward in time');
    const p = properTimeBetween(d.t, d.x, c);
    if (p === null) throw new RangeError('a worldline piece is faster than light');
    tau += p;
  }
  return tau;
}

/** The twins: a trip to a star at distance L (Earth frame) and straight back at speed v, turning instantly. */
export interface TwinTrip {
  /** Earth time for the round trip, 2L/v */
  home: number;
  /** traveller's proper time, 2L/(γv) */
  traveller: number;
  /** Earth's clock reading the outbound frame calls simultaneous with the turnaround: L/v − vL/c² */
  homeAtTurnOutbound: number;
  /** Earth's clock reading the inbound frame calls simultaneous with the turnaround: L/v + vL/c² */
  homeAtTurnInbound: number;
}

export function twinTrip(L: number, v: number, c = C_LIGHT): TwinTrip {
  const g = lorentzGamma(v, c);
  const half = L / v;
  return {
    home: 2 * half,
    traveller: (2 * half) / g,
    homeAtTurnOutbound: half - (v * L) / (c * c),
    homeAtTurnInbound: half + (v * L) / (c * c),
  };
}

/**
 * The pole and the barn: a pole of proper length Lpole moves at v (+x) into a barn of proper length Lbarn whose
 * entrance is at x = 0 and exit at x = Lbarn (barn frame S). The barn's doors close (an event each) at t = 0, when
 * the pole's rear is at the entrance. Pole frame S′ moves at v; its origin is the pole's rear.
 */
export interface PoleBarn {
  /** pole length in the barn frame, Lpole/γ */
  poleInBarnFrame: number;
  /** barn length in the pole frame, Lbarn/γ */
  barnInPoleFrame: number;
  /** does the pole fit in the barn frame (Lpole/γ ≤ Lbarn)? */
  fitsInBarnFrame: boolean;
  /** pole-frame times of the doors' closing events [entrance, exit]: [0, −γvLbarn/c²]; the exit closes first */
  doorTimesPoleFrame: [number, number];
  /** pole-frame positions of the doors' closing events [entrance, exit]: [0, γLbarn] */
  doorPlacesPoleFrame: [number, number];
}

export function poleBarn(Lpole: number, Lbarn: number, v: number, c = C_LIGHT): PoleBarn {
  const g = lorentzGamma(v, c);
  const exit = lorentz({ t: 0, x: Lbarn }, v, c);
  return {
    poleInBarnFrame: Lpole / g,
    barnInPoleFrame: Lbarn / g,
    fitsInBarnFrame: Lpole / g <= Lbarn,
    doorTimesPoleFrame: [0, exit.t],
    doorPlacesPoleFrame: [0, exit.x],
  };
}
