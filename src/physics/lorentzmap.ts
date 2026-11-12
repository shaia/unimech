/**
 * Lesson 9.3: a lattice of synchronised clocks seen from another frame. Builds on `relativity.ts` (lorentz,
 * inverseLorentz, gammaOf) and adds what lesson 9.3's figure (ClockLattice) and scripts need: where a clock of a
 * moving lattice is, and what it reads, at one instant of the frame that draws it; the same under Galileo's
 * transformation; and an event as either frame describes it.
 *
 * MODEL SPECIFICATION
 * - System: two inertial frames in standard configuration. S is unprimed; S′ moves relative to S at v = βc along
 *   +x; the origins coincide at t = t′ = 0. Each frame fills its x axis with clocks at rest in it, synchronised in
 *   that frame (every clock of S reads t, every clock of S′ reads t′). A clock is named by its place in its own
 *   frame, its proper coordinate. "The instant T of frame F" is the set of events with time T in F: a picture of
 *   the other lattice drawn at that instant shows where each of its clocks is, and what it reads, at that time of F.
 * - Dynamics: the Lorentz transformation x′ = γ(x − vt), t′ = γ(t − vx/c²). A clock of S′ at proper coordinate ξ′,
 *   at the instant t of S, is at x = vt + ξ′/γ and reads t′ = t/γ − vξ′/c². A clock of S at ξ, at the instant t′ of
 *   S′, is at x′ = −vt′ + ξ/γ and reads t = t′/γ + vξ/c² (the same with v → −v). Hence: the spacing d₀ of a moving
 *   lattice is d₀/γ (length contraction), a single moving clock advances by Δt/γ while the frame's time advances by
 *   Δt (time dilation), and at one instant two moving clocks d₀ apart (proper) differ by vd₀/c², the rear one ahead
 *   (the relativity of simultaneity). Galileo's transformation (x′ = x − vt, t′ = t) is kept for contrast: the moving
 *   clock is at vt + ξ′ and reads t.
 * - Boundary: β in (−1, 1); the instant; the clocks' proper coordinates; events given in S.
 * - Ignored: light-travel time to an observer (each event is timed by the frame's own clock at its place: seeing is
 *   not measuring); y and z (unchanged by the transformation along x); acceleration (the frames are inertial forever).
 * - Valid when: |β| < 1. Units: any, through c (c = 1 with light-seconds and seconds, as the figure uses).
 * - Failure modes: every function that needs γ throws a RangeError for |β| ≥ 1 (through `gammaOf`).
 */

import { C_LIGHT } from './constants';
import { gammaOf, inverseLorentz, lorentz, type Event } from './relativity';

/** The frame a picture is drawn in: S (unprimed) or S′ (moving at +v along x relative to S). */
export type FrameName = 'S' | 'S′';

/** A clock of a lattice, at one instant of the frame that draws it: where it is and what it reads in its own frame. */
export interface ClockView {
  /** position in the drawing frame [m, or the unit with c = 1] */
  x: number;
  /** the reading of the clock, in its own frame's time [s, or the unit with c = 1] */
  reading: number;
}

/**
 * A clock at rest in a frame that moves at βc along +x relative to the drawing frame, at proper coordinate ξ in its
 * own frame (origins coinciding at time 0), seen at the instant T of the drawing frame: at x = βcT + ξ/γ, reading
 * T/γ − βξ/c. Use β > 0 for S′'s clocks drawn in S, and β < 0 (−v) for S's clocks drawn in S′.
 */
export function movingClock(xi: number, T: number, b: number, c = C_LIGHT): ClockView {
  const g = gammaOf(b);
  return { x: b * c * T + xi / g, reading: T / g - (b * xi) / c };
}

/** Galileo's picture of the same clock: it is at βcT + ξ and reads T, the drawing frame's own time. */
export function galileanMovingClock(xi: number, T: number, b: number, c = C_LIGHT): ClockView {
  return { x: b * c * T + xi, reading: T };
}

/** The spacing, in the drawing frame, of clocks that are d₀ apart in their own frame (proper): d₀/γ. */
export const latticeSpacing = (d0: number, b: number): number => d0 / gammaOf(b);

/**
 * At one instant of the drawing frame, how far the rear clock of a moving pair d₀ apart (proper) is ahead of the
 * front one: βd₀/c = vd₀/c² (rear = the one behind in the direction of motion).
 */
export const rearClockLead = (d0: number, b: number, c = C_LIGHT): number => (Math.abs(b) * d0) / c;

/** An event given in S, described in the frame `frame` (S′ moves at βc): (t, x) or (t′, x′). */
export function eventIn(e: Event, frame: FrameName, b: number, c = C_LIGHT): Event {
  return frame === 'S' ? { ...e } : lorentz(e, b * c, c);
}

/** An event given in the frame `frame`, described in S. */
export function eventToS(e: Event, frame: FrameName, b: number, c = C_LIGHT): Event {
  return frame === 'S' ? { ...e } : inverseLorentz(e, b * c, c);
}

/** Galileo's description of an event of S in S′ (x′ = x − vt, t′ = t), for the figure's Galileo mode. */
export function galileanEventIn(e: Event, frame: FrameName, b: number, c = C_LIGHT): Event {
  return frame === 'S' ? { ...e } : { t: e.t, x: e.x - b * c * e.t };
}

/** Galileo's inverse: an event given in `frame`, described in S. */
export function galileanEventToS(e: Event, frame: FrameName, b: number, c = C_LIGHT): Event {
  return frame === 'S' ? { ...e } : { t: e.t, x: e.x + b * c * e.t };
}
