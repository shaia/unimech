/**
 * The paradoxes of special relativity (lesson 9.6): the twins and the pole in the barn, built on the shared
 * kinematics of `relativity.ts` (which owns β, γ, the Lorentz transformation, `worldlineProperTime`, `twinTrip` and
 * `poleBarn`). This module adds what the lesson's figure and examples need on top: events along the worldlines, the
 * traveller's "now" on Earth at any moment of her trip, the light signals each twin receives, a turnaround of finite
 * duration, and the pole-and-barn scene with the pole centred in the barn when the doors act.
 *
 * MODEL SPECIFICATION
 * - System. Twins: Earth (the home twin) rests at x = 0 in the inertial frame S. The traveller leaves at the event
 *   (t, x) = (0, 0), moves at +v to a star at x = L, turns instantly at the event (L/v, L) and returns at −v,
 *   meeting Earth at (2L/v, 0). Her outbound frame S′ moves at +v, her inbound frame S″ at −v. Pole and barn: a barn
 *   of proper length Lbarn rests in S with its entrance door at x = 0 and its exit door at x = Lbarn; a pole of
 *   proper length Lpole moves at +v (entering through the entrance). Both doors act (close and reopen at once) at
 *   t = 0 in S, when the pole's centre is at the barn's centre. S′ is the pole's frame, in standard configuration
 *   with S (origins together at t = t′ = 0), so the entrance door's event is the origin of both.
 * - Dynamics. Kinematics only. Proper time along a worldline: Σ √(Δt² − Δx²/c²) over its straight pieces. The
 *   "now" of a frame moving at u through an event (t, x) is the line t − ux/c² = const, which meets Earth's
 *   worldline (x = 0) at t − ux/c²: the Earth-clock reading that frame calls simultaneous with the event. Light
 *   moves at c in S. Events are transformed with `lorentz`.
 * - Boundary. A signal is sent at each whole multiple of `period` on the sender's clock, from just after the start
 *   up to and including the meeting; a signal that arrives exactly at the turnaround counts as outbound.
 * - Ignored. Gravity; the traveller's acceleration (a clock's rate depends only on its speed — the clock
 *   hypothesis): the instantaneous turn is the limit of `smoothTripWorldline` as its duration goes to zero; the
 *   pole's elasticity (the doors act on it nowhere in this scene unless they hit it, which the scene reports).
 * - Valid when 0 < v < c, L > 0, Lpole > 0, Lbarn > 0.
 * - Failure modes. v ≥ c throws (from `gammaOf`). At the turnaround event itself the traveller's frame is
 *   ambiguous: `homeNow` returns the outbound reading for τ ≤ τ_turn and the inbound one after it.
 */

import { C_LIGHT } from './constants';
import { type Event, lorentz, lorentzGamma, poleBarn, twinTrip, type TwinTrip, worldlineProperTime } from './relativity';

// ---------------------------------------------------------------- worldlines and proper time

/** The event on a piecewise-straight worldline (corner events in one frame) at proper time τ from its start. */
export function eventAtProperTime(events: readonly Event[], tau: number, c = C_LIGHT): Event {
  let acc = 0;
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1];
    const b = events[i];
    const piece = worldlineProperTime([a, b], c);
    if (tau <= acc + piece || i === events.length - 1) {
      const f = piece > 0 ? Math.max(0, Math.min(1, (tau - acc) / piece)) : 0;
      return { t: a.t + f * (b.t - a.t), x: a.x + f * (b.x - a.x) };
    }
    acc += piece;
  }
  return { ...events[0] };
}

/** Events along a worldline at every `step` of proper time from 0 up to its whole proper time (inclusive). */
export function properTimeTicks(events: readonly Event[], step: number, c = C_LIGHT): { tau: number; e: Event }[] {
  const total = worldlineProperTime(events, c);
  const out: { tau: number; e: Event }[] = [];
  const n = Math.floor(total / step + 1e-9);
  for (let k = 0; k <= n; k++) out.push({ tau: k * step, e: eventAtProperTime(events, k * step, c) });
  return out;
}

// ---------------------------------------------------------------- the twins

export interface TwinScene {
  L: number;
  v: number;
  c: number;
  gamma: number;
  /** the turnaround event in S */
  turn: Event;
  /** Earth's worldline: from the departure to the meeting */
  home: Event[];
  /** the traveller's worldline: departure, turnaround, meeting */
  traveller: Event[];
  /** the traveller's proper time at the turnaround, L/(γv) */
  tauTurn: number;
  /** relativity.ts's summary: Earth time, the traveller's proper time, the two "now" readings at the turn */
  trip: TwinTrip;
  /** the jump of the Earth reading the traveller calls "now" at the turnaround, 2vL/c² */
  jump: number;
}

export function twinScene(L: number, v: number, c = C_LIGHT): TwinScene {
  const gamma = lorentzGamma(v, c);
  const T = (2 * L) / v;
  const turn: Event = { t: L / v, x: L };
  const trip = twinTrip(L, v, c);
  return {
    L,
    v,
    c,
    gamma,
    turn,
    home: [
      { t: 0, x: 0 },
      { t: T, x: 0 },
    ],
    traveller: [{ t: 0, x: 0 }, turn, { t: T, x: 0 }],
    tauTurn: L / (gamma * v),
    trip,
    jump: trip.homeAtTurnInbound - trip.homeAtTurnOutbound,
  };
}

/** The Earth-clock reading a frame moving at u calls simultaneous with the event e: t − ux/c². */
export const homeReadingSimultaneous = (e: Event, u: number, c = C_LIGHT): number => e.t - (u * e.x) / (c * c);

/**
 * The traveller at her proper time τ: where she is (in S), the velocity of the inertial frame she is in (+v before
 * the turn, −v after it; +v at the turn itself), and the Earth-clock reading that frame calls "now".
 */
export function homeNow(s: TwinScene, tau: number): { e: Event; u: number; home: number } {
  const e = eventAtProperTime(s.traveller, tau, s.c);
  const u = tau <= s.tauTurn + 1e-12 ? s.v : -s.v;
  return { e, u, home: homeReadingSimultaneous(e, u, s.c) };
}

/** A light signal from one twin to the other. */
export interface Signal {
  /** the emission event, in S */
  emit: Event;
  /** the reception event, in S */
  receive: Event;
  /** the sender's clock at emission */
  tauEmit: number;
  /** the receiver's clock at reception */
  tauReceive: number;
  /** on which leg of the trip the traveller is at the end of the signal that touches her */
  leg: 'out' | 'in';
}

const TOL = 1e-9;

/** Earth sends a signal at every `period` of its clock; each one reaches the traveller (or the meeting). */
export function homeSignals(s: TwinScene, period: number): Signal[] {
  const { L, v, c, gamma } = s;
  const T = (2 * L) / v;
  const out: Signal[] = [];
  for (let k = 1; k * period <= T * (1 + TOL); k++) {
    const te = k * period;
    // outbound: c(t − te) = vt; inbound: c(t − te) = 2L − vt
    let t = (c * te) / (c - v);
    let leg: 'out' | 'in' = 'out';
    if (t > (L / v) * (1 + TOL)) {
      t = (2 * L + c * te) / (c + v);
      leg = 'in';
    }
    const x = leg === 'out' ? v * t : 2 * L - v * t;
    out.push({ emit: { t: te, x: 0 }, receive: { t, x }, tauEmit: te, tauReceive: t / gamma, leg });
  }
  return out;
}

/** The traveller sends a signal at every `period` of her clock; each one reaches Earth. */
export function travellerSignals(s: TwinScene, period: number): Signal[] {
  const total = s.trip.traveller;
  const out: Signal[] = [];
  for (let k = 1; k * period <= total * (1 + TOL); k++) {
    const tau = k * period;
    const e = eventAtProperTime(s.traveller, tau, s.c);
    const t = e.t + Math.abs(e.x) / s.c;
    out.push({ emit: e, receive: { t, x: 0 }, tauEmit: tau, tauReceive: t, leg: tau <= s.tauTurn * (1 + TOL) ? 'out' : 'in' });
  }
  return out;
}

/**
 * A round trip with a turnaround of finite duration `turn` (Earth time): speed +v, then a velocity falling linearly
 * from +v to −v over `turn`, centred on t = L/v, then −v back to Earth at t = 2L/v. Sampled into `n` straight pieces
 * per phase for `worldlineProperTime`. Its proper time tends to 2L/(γv) as turn → 0 (the clock hypothesis).
 */
export function smoothTripWorldline(L: number, v: number, turn: number, n = 400): Event[] {
  const t1 = L / v - turn / 2;
  const t2 = L / v + turn / 2;
  const T = (2 * L) / v;
  const x1 = v * t1;
  const pos = (t: number): number => {
    if (t <= t1) return v * t;
    if (t <= t2) {
      const s = t - t1;
      return x1 + v * s - (v * s * s) / turn;
    }
    return x1 - v * (t - t2);
  };
  const pts: Event[] = [];
  const add = (a: number, b: number, m: number) => {
    for (let i = 0; i < m; i++) {
      const t = a + ((b - a) * i) / m;
      pts.push({ t, x: pos(t) });
    }
  };
  add(0, t1, 1);
  if (turn > 0) add(t1, t2, n);
  add(t2, T, 1);
  pts.push({ t: T, x: pos(T) });
  return pts;
}

// ---------------------------------------------------------------- the pole and the barn

export interface PoleBarnScene {
  Lpole: number;
  Lbarn: number;
  v: number;
  c: number;
  gamma: number;
  /** pole length in the barn frame S, Lpole/γ (relativity.ts) */
  poleInBarnFrame: number;
  /** barn length in the pole frame S′, Lbarn/γ (relativity.ts) */
  barnInPoleFrame: number;
  /** does the pole fit in the barn in S (relativity.ts)? */
  fitsInBarnFrame: boolean;
  /** S: the pole's rear and front at t = 0 (centred in the barn) */
  rear0: number;
  front0: number;
  /** the doors' events [entrance, exit] in S: both at t = 0 */
  doorsBarn: [Event, Event];
  /** the same events in the pole frame S′ */
  doorsPole: [Event, Event];
  /** the pole's ends in S′, where they rest */
  rearPole: number;
  frontPole: number;
  /** does each door's event touch the pole, judged in S and judged in S′ (always equal: an event is one place) */
  hitsBarnFrame: [boolean, boolean];
  hitsPoleFrame: [boolean, boolean];
  /** S: the gap between each door and the nearer pole end when the doors act (negative: the door hits the pole) */
  clearanceBarn: number;
  /** S′: the gap between each door's event and the nearer pole end, γ times the gap in S */
  clearancePole: number;
  /** S′: how long before the entrance door the exit door acts, γvLbarn/c² [s, or the time unit with c = 1] */
  doorGapPole: number;
}

export function poleBarnScene(Lpole: number, Lbarn: number, v: number, c = C_LIGHT): PoleBarnScene {
  const pb = poleBarn(Lpole, Lbarn, v, c);
  const gamma = lorentzGamma(v, c);
  const len = pb.poleInBarnFrame;
  const rear0 = (Lbarn - len) / 2;
  const front0 = rear0 + len;
  const doorsBarn: [Event, Event] = [
    { t: 0, x: 0 },
    { t: 0, x: Lbarn },
  ];
  const doorsPole: [Event, Event] = [lorentz(doorsBarn[0], v, c), lorentz(doorsBarn[1], v, c)];
  const rearPole = gamma * rear0;
  const frontPole = gamma * front0;
  const inside = (x: number, a: number, b: number) => x >= a - 1e-12 * Math.max(1, Math.abs(b)) && x <= b + 1e-12 * Math.max(1, Math.abs(b));
  const clearanceBarn = (Lbarn - len) / 2;
  return {
    Lpole,
    Lbarn,
    v,
    c,
    gamma,
    poleInBarnFrame: len,
    barnInPoleFrame: pb.barnInPoleFrame,
    fitsInBarnFrame: pb.fitsInBarnFrame,
    rear0,
    front0,
    doorsBarn,
    doorsPole,
    rearPole,
    frontPole,
    hitsBarnFrame: [inside(0, rear0, front0), inside(Lbarn, rear0, front0)],
    hitsPoleFrame: [inside(doorsPole[0].x, rearPole, frontPole), inside(doorsPole[1].x, rearPole, frontPole)],
    clearanceBarn,
    clearancePole: Math.min(rearPole - doorsPole[0].x, doorsPole[1].x - frontPole),
    doorGapPole: doorsPole[0].t - doorsPole[1].t,
  };
}

/** S′ position of the entrance (0) or exit (1) door at S′ time t′: the barn moves at −v in the pole frame. */
export function doorInPoleFrame(s: PoleBarnScene, door: 0 | 1, tPrime: number): number {
  const ev = s.doorsPole[door];
  return ev.x - s.v * (tPrime - ev.t);
}
