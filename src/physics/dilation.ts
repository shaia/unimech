/**
 * Time dilation and length contraction derived without the Lorentz transformation (lesson 9.2): the light clock
 * across and along the motion, a tilted light clock, a rod at an angle, slow clocks at everyday speeds, and unstable
 * particles (muons, pions) crossing a distance. Builds on the shared chapter model in relativity.ts (gammaOf,
 * lightClockTick, survivalFraction) and adds what the lesson's figure and scripts need beyond it: where the light
 * pulse is at each moment, the two legs of a clock along the motion, and the muon swarm.
 *
 * MODEL SPECIFICATION
 * - System: a light clock (two mirrors a proper distance L₀ apart, a light pulse bouncing between them) at rest in
 *   the frame S′ of a platform that moves at v along +x relative to the frame S; and unstable particles of mean
 *   lifetime τ (measured in their rest frame) moving at v through a layer of proper thickness H at rest in S.
 * - Dynamics: light moves at c in every inertial frame (the second postulate); the distances across the motion are
 *   the same in both frames; a clock's rate depends only on its speed (the clock hypothesis). In S a tick of the
 *   clock across the motion takes T = 2L₀/√(c² − v²) = γT₀ with T₀ = 2L₀/c, the light rising at c/γ while it
 *   drifts at v. Along the motion the mirrors are L = L₀/γ apart in S and the legs take L/(c − v) and L/(c + v),
 *   again γT₀ in total. A clock tilted by θ₀ in its rest frame also ticks in γT₀. A particle that crosses H in S
 *   at v ages H/(γv) on its own clock, so a fraction e^{−H/(γvτ)} survives; in its own frame the layer is H/γ thick
 *   and passes at v: the same proper time, the same fraction.
 * - Boundary: one tick starts at t = 0 with the pulse leaving the base mirror (the rear mirror along the motion),
 *   which is then at x = 0; the particles start at the top of the layer at t = 0.
 * - Ignored: gravity, the mirrors' thickness and recoil, the particles' energy loss and their spread of speeds and
 *   directions (all move straight down at one speed), the Earth's motion, light-travel delays to observers (each
 *   frame reads its own synchronised clocks at the event: seeing is not measuring).
 * - Valid when: 0 ≤ v < c. The small-speed lag β²Δt/2 when β ≪ 1 (its relative error is about β²/4).
 * - Failure modes: every function that needs γ throws a RangeError for |v| ≥ c (from gammaOf); `betaFromLegRatio`
 *   needs a ratio ≥ 1 and `altitudeFromSurvival` a fraction in (0, 1].
 */

import { C_LIGHT } from './constants';
import { gammaOf } from './relativity';

/** The muon's mean lifetime in its rest frame [s], the value the course's questions state (2.2 μs). */
export const MUON_LIFETIME = 2.2e-6;

/** A clock's orientation: its mirrors' separation across the motion or along it. */
export type ClockOrientation = 'transverse' | 'longitudinal';

/** The proper tick T₀ = 2L₀/c of a light clock with mirrors L₀ apart, in its rest frame. */
export const properTick = (L0: number, c = C_LIGHT): number => (2 * L0) / c;

/** The two legs of a clock along the motion, in S: out to the front mirror L/(c − v), back L/(c + v), L = L₀/γ. */
export function longitudinalLegs(L0: number, v: number, c = C_LIGHT): [number, number] {
  const L = L0 / gammaOf(v / c);
  return [L / (c - v), L / (c + v)];
}

/** The leg ratio out/back of a clock along the motion, (1 + β)/(1 − β): independent of L₀. */
export const legRatio = (b: number): number => {
  gammaOf(b);
  return (1 + b) / (1 - b);
};

/** β from the leg ratio r = out/back ≥ 1: (r − 1)/(r + 1). */
export function betaFromLegRatio(r: number): number {
  if (!(r >= 1)) throw new RangeError(`leg ratio ${r} is below 1`);
  return (r - 1) / (r + 1);
}

/** Where things are in S at time t of one tick (0 ≤ t ≤ T): the pulse, the base (rear) mirror and the far mirror. */
export interface ClockSnapshot {
  /** the pulse [x, y] in S [m]; y is across the motion */
  pulse: [number, number];
  /** the base mirror's x (transverse) or the rear mirror's x (longitudinal) [m] */
  base: number;
  /** the far mirror: [x, y] of its centre [m] */
  far: [number, number];
  /** 'out' while the pulse goes to the far mirror, 'back' afterwards */
  leg: 'out' | 'back';
  /** the tick in S [s] */
  T: number;
}

/**
 * The light clock in S at time t (clamped to one tick). Transverse: the pulse rises at c/γ while it drifts at v,
 * reaches the far mirror (L₀ above the base) at T/2 and comes back. Longitudinal: the far mirror is L₀/γ ahead;
 * the pulse moves at +c to it, then at −c back to the rear mirror.
 */
export function clockSnapshot(L0: number, v: number, t: number, orientation: ClockOrientation, c = C_LIGHT): ClockSnapshot {
  const g = gammaOf(v / c);
  const T = g * properTick(L0, c);
  const tt = Math.max(0, Math.min(T, t));
  const base = v * tt;
  if (orientation === 'transverse') {
    const rise = c / g;
    const half = T / 2;
    const y = tt <= half ? rise * tt : L0 - rise * (tt - half);
    return { pulse: [v * tt, y], base, far: [base, L0], leg: tt <= half ? 'out' : 'back', T };
  }
  const L = L0 / g;
  const [t1] = longitudinalLegs(L0, v, c);
  const x = tt <= t1 ? c * tt : c * t1 - c * (tt - t1);
  return { pulse: [x, 0], base, far: [base + L, 0], leg: tt <= t1 ? 'out' : 'back', T };
}

/**
 * A light clock whose mirrors are L₀ apart along the direction θ₀ from +x in its rest frame, seen from S: the two
 * legs [s]. In S the separation is (L₀cos θ₀/γ, L₀ sin θ₀); each leg solves |d ± (v t, 0)| = c t.
 */
export function tiltedClockLegs(L0: number, theta0: number, v: number, c = C_LIGHT): [number, number] {
  const g = gammaOf(v / c);
  const dx = (L0 * Math.cos(theta0)) / g;
  const dy = L0 * Math.sin(theta0);
  const d2 = dx * dx + dy * dy;
  const k = c * c - v * v;
  const root = Math.sqrt(dx * dx * v * v + k * d2);
  return [(dx * v + root) / k, (-dx * v + root) / k];
}

/** A rod of proper length L₀ at θ₀ from the motion in its rest frame, in S: its length and its angle from +x. */
export function rodInMotion(L0: number, theta0: number, v: number, c = C_LIGHT): { length: number; angle: number } {
  const g = gammaOf(v / c);
  const dx = (L0 * Math.cos(theta0)) / g;
  const dy = L0 * Math.sin(theta0);
  return { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

/**
 * How far a moving clock falls behind S's clocks over a time Δt of S: Δt − Δt/γ = Δt·β²/(1 + √(1 − β²)), written so
 * that it does not lose its digits at everyday speeds (β ~ 10⁻⁶).
 */
export function clockLag(dt: number, v: number, c = C_LIGHT): number {
  const b = v / c;
  gammaOf(b);
  return (dt * b * b) / (1 + Math.sqrt(1 - b * b));
}

/** The small-speed form of `clockLag`: Δt·β²/2. */
export const clockLagSmallSpeed = (dt: number, v: number, c = C_LIGHT): number => (dt * (v / c) ** 2) / 2;

/** Mean distance an unstable particle covers in S before it decays: γvτ. */
export const meanRange = (v: number, tau: number, c = C_LIGHT): number => gammaOf(v / c) * v * tau;

/** Everything about particles crossing a layer of proper thickness H at v, in both frames. */
export interface Crossing {
  gamma: number;
  /** S (the layer's frame): crossing time H/v and the dilated mean lifetime γτ [s] */
  timeInLayerFrame: number;
  lifetimeInLayerFrame: number;
  /** the particle's frame: the layer's thickness H/γ and the time it takes to pass, H/(γv) [m, s] */
  thicknessInParticleFrame: number;
  properTime: number;
  /** the fraction that survives the crossing, computed in each frame */
  survivalLayerFrame: number;
  survivalParticleFrame: number;
  /** the classical prediction (no dilation, no contraction): e^{−H/(vτ)} */
  survivalClassical: number;
}

export function crossing(H: number, v: number, tau: number, c = C_LIGHT): Crossing {
  const g = gammaOf(v / c);
  const timeInLayerFrame = H / v;
  const lifetimeInLayerFrame = g * tau;
  const thicknessInParticleFrame = H / g;
  const properTime = thicknessInParticleFrame / v;
  return {
    gamma: g,
    timeInLayerFrame,
    lifetimeInLayerFrame,
    thicknessInParticleFrame,
    properTime,
    survivalLayerFrame: Math.exp(-timeInLayerFrame / lifetimeInLayerFrame),
    survivalParticleFrame: Math.exp(-properTime / tau),
    survivalClassical: Math.exp(-timeInLayerFrame / tau),
  };
}

/** The layer thickness H (in its own frame) that leaves a fraction f of particles moving at v: γvτ ln(1/f). */
export function altitudeFromSurvival(f: number, v: number, tau: number, c = C_LIGHT): number {
  if (!(f > 0 && f <= 1)) throw new RangeError(`survival fraction ${f} is not in (0, 1]`);
  return meanRange(v, tau, c) * Math.log(1 / f);
}

/** The speed β at which a trip of proper length L (in S) takes a proper time τ on the traveller's clock. */
export function betaForProperTrip(L: number, tau: number, c = C_LIGHT): number {
  const k = L / (c * tau); // γβ
  return k / Math.sqrt(1 + k * k);
}

/**
 * The proper lifetimes of an n-particle swarm, spread as the quantiles of the exponential law: the i-th particle
 * (i = 0 … n−1) lives −τ ln((i + ½)/n). A swarm of these, crossing a layer, keeps the fraction e^{−t/τ} up to 1/n.
 */
export function swarmLifetimes(n: number, tau: number): number[] {
  return Array.from({ length: n }, (_, i) => -tau * Math.log((i + 0.5) / n));
}
