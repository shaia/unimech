/**
 * Lesson 9.4: velocity addition and the longitudinal Doppler effect, as the lesson's figure and scripts need them
 * beyond the shared `relativity.ts` (which holds `addVelocities`, `velocityInFrame`, `dopplerFactor` and the
 * classical sound formulas; this module imports them and never duplicates them).
 *
 * MODEL SPECIFICATION
 * - System: bodies, sources and observers moving uniformly along one line, the x axis, described from inertial
 *   frames in standard configuration (S′ moves at +v along x relative to S, origins together at t = t′ = 0). A
 *   source emits a crest (a light flash, a wave crest) every T₀ of its own clock, T₀ its proper period; the light
 *   of every crest moves at c in every frame, toward the observer. Every function takes c as its last argument
 *   (default C_LIGHT), so c = 1 serves the figure's units (time in T₀, distance in cT₀).
 * - Dynamics: kinematics only. Velocity addition u = (u′ + v)/(1 + u′v/c²) at fixed v is a strictly increasing
 *   function of u′ with slope (1 − β²)/(1 + u′v/c²)², and it maps u′ = ±c to u = ±c, so |u′| < c ⇒ |u| < c. For
 *   Doppler, emission events are placed in one frame (each crest at the source's position at its emission time, the
 *   emissions γT₀ apart in a frame where the source moves at v), each crest's light is followed to the observer, and
 *   the received period is the difference of consecutive arrival times divided by the observer's γ (the observer's
 *   own clock). In the observer's rest frame this gives T = γ(1 − β)T₀; in the source's rest frame
 *   T = T₀/(γ(1 + β)); both are T₀√((1 − β)/(1 + β)) = T₀/D(β), with β > 0 when source and observer approach.
 * - Boundary: the source and the observer never pass each other while crests are exchanged (each function's scene
 *   states where they are); the observer is always ahead of the light it receives.
 * - Ignored: transverse motion (the Doppler effect here is along the line of sight only), the time a crest takes to
 *   be emitted (a crest is an event), any medium (light needs none; the classical sound formulas of relativity.ts
 *   are the contrast), gravity.
 * - Valid when: every speed is below c. The sound comparison treats β as the speed over the speed of sound.
 * - Failure modes: functions that need γ throw a RangeError for |β| ≥ 1 (through `gammaOf`). `arrivalTime` throws
 *   if the observer moves at or above c. `symmetricFrameVelocity` returns 0 when the two velocities are opposite
 *   (the frame is S itself).
 */

import { C_LIGHT } from './constants';
import { addVelocities, gammaOf, type Event } from './relativity';

// ---------------------------------------------------------------- velocity addition

/** du/du′ of u = (u′ + v)/(1 + u′v/c²) at fixed v: (1 − v²/c²)/(1 + u′v/c²)², positive for |v| < c. */
export function additionSlope(uPrime: number, v: number, c = C_LIGHT): number {
  const d = 1 + (uPrime * v) / (c * c);
  return (1 - (v * v) / (c * c)) / (d * d);
}

/**
 * A chain of launches: a ship at rest in S launches a probe at w (relative to the ship), that probe launches a
 * second at w relative to itself, and so on. Returns the speeds in S after 1, 2, …, n launches.
 */
export function chainedLaunches(w: number, n: number, c = C_LIGHT): number[] {
  const out: number[] = [];
  let u = 0;
  for (let i = 0; i < n; i++) {
    u = addVelocities(w, u, c);
    out.push(u);
  }
  return out;
}

/**
 * Two bodies move along x in S at velocities a and b. The velocity w of the frame in which they move with equal and
 * opposite velocities: the root with |w| < c of (a + b)w² − 2(c² + ab)w + (a + b)c² = 0.
 */
export function symmetricFrameVelocity(a: number, b: number, c = C_LIGHT): number {
  const s = a + b;
  if (s === 0) return 0;
  const K = (c * c + a * b) / s; // the roots are K ± √(K² − c²); their product is c²
  const root = Math.sqrt(K * K - c * c);
  return K > 0 ? K - root : K + root;
}

// ---------------------------------------------------------------- Doppler from events

/**
 * Emission events of a source that passes x0 at t = 0 moving at vs along x in the frame that describes the events,
 * with proper period T0: the source's clock is slow by γ there, so crest k is emitted at t = kγT₀, at the source's
 * position then. Returns crests k = kFrom … kTo.
 */
export function emissionEvents(x0: number, vs: number, T0: number, kFrom: number, kTo: number, c = C_LIGHT): Event[] {
  const period = gammaOf(vs / c) * T0;
  const out: Event[] = [];
  for (let k = kFrom; k <= kTo; k++) {
    const t = k * period;
    out.push({ t, x: x0 + vs * t });
  }
  return out;
}

/**
 * The time at which the light of an emission event e reaches an observer who moves as x = xo + vo·t (|vo| < c), in
 * the same frame. The light goes toward the observer's side of e.
 */
export function arrivalTime(e: Event, xo: number, vo: number, c = C_LIGHT): number {
  if (!(Math.abs(vo) < c)) throw new RangeError('the observer must move slower than light');
  const s = Math.sign(xo + vo * e.t - e.x) || 1; // +1: the light goes in +x
  // e.x + s·c·(t − e.t) = xo + vo·t
  return (xo - e.x + s * c * e.t) / (s * c - vo);
}

/**
 * The period an observer reads on their own clock between two consecutive crests, computed from events in one
 * frame: the source passes xs at t = 0 moving at vs, the observer passes xo at t = 0 moving at vo; arrival-time
 * difference divided by the observer's γ.
 */
export function receivedProperPeriod(T0: number, xs: number, vs: number, xo: number, vo: number, c = C_LIGHT): number {
  const [e0, e1] = emissionEvents(xs, vs, T0, 0, 1, c);
  const dt = arrivalTime(e1, xo, vo, c) - arrivalTime(e0, xo, vo, c);
  return dt / gammaOf(vo / c);
}

/** Observer at rest, source approaching at β (β < 0 receding): emissions γT₀ apart, each with βγT₀ less distance to go. */
export const receivedPeriodSourceMoving = (T0: number, b: number): number => gammaOf(b) * (1 - b) * T0;

/** Source at rest, observer approaching at β: crests met every T₀/(1 + β) of the source's time, read on a clock slow by γ. */
export const receivedPeriodObserverMoving = (T0: number, b: number): number => T0 / (gammaOf(b) * (1 + b));

/**
 * Crest spacing in the frame where the source moves at speed βc, proper period T₀ (λ₀ = cT₀): ahead of the source
 * γ(1 − β)λ₀, behind it γ(1 + β)λ₀ (β > 0 means the source moves toward the side called "ahead").
 */
export const wavelengthAhead = (lambda0: number, b: number): number => gammaOf(b) * (1 - b) * lambda0;
export const wavelengthBehind = (lambda0: number, b: number): number => gammaOf(b) * (1 + b) * lambda0;

/**
 * A radar echo: a wave of frequency f₀ sent from S to a mirror that moves at β (approach positive) and reflected
 * back: the mirror receives f₀D and re-emits that in its own frame, so the echo arrives at f₀D² = f₀(1 + β)/(1 − β).
 */
export const echoFactor = (b: number): number => {
  gammaOf(b);
  return (1 + b) / (1 - b);
};
