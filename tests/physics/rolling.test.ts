import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { BETA, rollingSpeed } from '~/physics/rigidbody';
import {
  floorAngularMomentum,
  inclineEnergy,
  inclineMotion,
  inclineState,
  integrateSkid,
  kePerMass,
  skid,
  skidSummary,
  timeDown,
} from '~/physics/rolling';
import { relativeError } from '~/physics/vec';

const deg = (d: number) => (d * Math.PI) / 180;
const R = 0.11;

describe('analytic limits', () => {
  it('a body with β → 0 (a point mass) rolls down the slope at g sin θ and needs no friction', () => {
    const m = inclineMotion(1e-9, deg(25), 0.3);
    expect(m.rolling).toBe(true);
    expect(relativeError(m.a, G * Math.sin(deg(25)))).toBeLessThan(1e-8);
    expect(m.fPerMass).toBeLessThan(1e-8);
  });

  it('with μ = 0 every round body slides like the frictionless block, a = g sin θ, and does not turn', () => {
    for (const beta of Object.values(BETA)) {
      const m = inclineMotion(beta, deg(20), 0);
      expect(m.rolling).toBe(false);
      expect(relativeError(m.a, G * Math.sin(deg(20)))).toBeLessThan(1e-14);
      expect(m.alphaR).toBe(0);
    }
    expect(relativeError(inclineMotion(0, deg(20), 0).a, G * Math.sin(deg(20)))).toBeLessThan(1e-14);
  });

  it('just above the threshold μ = β tan θ/(1 + β) the body rolls, just below it slips, and a is continuous there', () => {
    const th = deg(30);
    const muMin = (BETA.ring * Math.tan(th)) / (1 + BETA.ring);
    const above = inclineMotion(BETA.ring, th, muMin * (1 + 1e-9));
    const below = inclineMotion(BETA.ring, th, muMin * (1 - 1e-9));
    expect(above.rolling).toBe(true);
    expect(below.rolling).toBe(false);
    expect(relativeError(above.a, below.a)).toBeLessThan(1e-8);
    expect(below.slipRate).toBeGreaterThan(0);
  });

  it('a ball already rolling on the level floor (v₀ = ω₀R) feels no friction: it keeps v and ω', () => {
    const s = skid(4, 4 / R, R, BETA.solidSphere, 0.2, 3);
    expect(s.rolling).toBe(true);
    expect(relativeError(s.v, 4)).toBeLessThan(1e-14);
    expect(relativeError(s.x, 12)).toBeLessThan(1e-14);
  });

  it('a solid ball thrown without spin ends rolling at (5/7)v₀, after t = 2v₀/(7μg), keeping 5/7 of its energy', () => {
    const v0 = 6;
    const mu = 0.15;
    const r = skidSummary(v0, 0, R, BETA.solidSphere, mu);
    expect(relativeError(r.vFinal, (5 / 7) * v0)).toBeLessThan(1e-14);
    expect(relativeError(r.tRoll, (2 * v0) / (7 * mu * G))).toBeLessThan(1e-14);
    expect(relativeError(r.distance, (12 * v0 * v0) / (49 * mu * G))).toBeLessThan(1e-12);
    const Kf = kePerMass(r.vFinal, r.omegaFinal, R, BETA.solidSphere);
    expect(relativeError(Kf / (0.5 * v0 * v0), 5 / 7)).toBeLessThan(1e-14);
  });

  it('a backspin of exactly R|ω₀| = v₀/β stops the ball dead; more backspin brings it back', () => {
    const v0 = 3;
    const beta = BETA.solidSphere;
    const stop = skidSummary(v0, -v0 / beta / R, R, beta, 0.2);
    expect(Math.abs(stop.vFinal)).toBeLessThan(1e-14);
    const back = skidSummary(v0, (-1.2 * v0) / beta / R, R, beta, 0.2);
    expect(back.vFinal).toBeLessThan(0);
    expect(back.tTurn).not.toBeNull();
    expect(relativeError(back.returnSpinR, 2.5 * v0)).toBeLessThan(1e-14);
  });
});

describe('conservation', () => {
  it('rolling without slipping conserves mechanical energy: at the foot ½v²(1 + β) = g h', () => {
    const th = deg(20);
    const L = 2;
    for (const beta of Object.values(BETA)) {
      const e = inclineEnergy(beta, th, 0.6, L, R);
      expect(Math.abs(e.heat) / (G * L * Math.sin(th))).toBeLessThan(1e-12);
      const t = timeDown(beta, th, 0.6, L);
      const v = inclineState(beta, th, 0.6, R, t).v;
      expect(relativeError(v, rollingSpeed(beta, L * Math.sin(th)))).toBeLessThan(1e-12);
    }
  });

  it('rolling with slipping down the slope loses energy to heat equal to μ N times the sliding distance', () => {
    const th = deg(35);
    const mu = 0.12;
    const L = 3;
    const beta = BETA.disc;
    const e = inclineEnergy(beta, th, mu, L, R);
    const t = timeDown(beta, th, mu, L);
    const slid = inclineState(beta, th, mu, R, t);
    // the contact point slides a distance ∫u dt = ½ (slip rate) t² against the friction μ g cos θ (per unit mass)
    const slideDistance = 0.5 * inclineMotion(beta, th, mu).slipRate * t * t;
    expect(slid.u).toBeGreaterThan(0);
    expect(relativeError(e.heat, mu * G * Math.cos(th) * slideDistance)).toBeLessThan(1e-12);
  });

  it('during a skid the angular momentum about a point of the floor, R(v + βRω), stays constant', () => {
    for (const [v0, w0R] of [
      [6, 0],
      [3, -10],
      [0, 5],
      [4, 9],
    ]) {
      const L0 = floorAngularMomentum(v0, w0R / R, R, BETA.solidSphere);
      for (const t of [0.1, 0.5, 1, 3]) {
        const s = skid(v0, w0R / R, R, BETA.solidSphere, 0.2, t);
        expect(relativeError(floorAngularMomentum(s.v, s.omega, R, BETA.solidSphere), L0)).toBeLessThan(1e-12);
      }
    }
  });

  it('the energy lost in a skid is the heat ½ β u₀²/(1 + β), and none is lost once it rolls', () => {
    const beta = BETA.ring;
    const r = skidSummary(3, -5 / R, R, beta, 0.3);
    const K0 = kePerMass(3, -5 / R, R, beta);
    const Kroll = kePerMass(r.vFinal, r.omegaFinal, R, beta);
    expect(relativeError(K0 - Kroll, r.heatPerMass)).toBeLessThan(1e-12);
    const later = skid(3, -5 / R, R, beta, 0.3, r.tRoll + 2);
    expect(relativeError(later.K, Kroll)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('the speed at the foot depends on β and h only: mass and radius cancel', () => {
    const th = deg(15);
    const a1 = inclineState(BETA.disc, th, 0.5, 0.05, 1).v;
    const a2 = inclineState(BETA.disc, th, 0.5, 0.5, 1).v;
    expect(relativeError(a1, a2)).toBeLessThan(1e-14);
  });

  it('the skid lasts a time ∝ 1/μ, its distance ∝ 1/μ, and the final speed does not depend on μ', () => {
    const a = skidSummary(5, 0, R, BETA.solidSphere, 0.1);
    const b = skidSummary(5, 0, R, BETA.solidSphere, 0.4);
    expect(relativeError(a.tRoll / b.tRoll, 4)).toBeLessThan(1e-14);
    expect(relativeError(a.distance / b.distance, 4)).toBeLessThan(1e-12);
    expect(relativeError(a.vFinal, b.vFinal)).toBeLessThan(1e-14);
  });

  it('the race order down a slope is block, solid sphere, disc, hollow sphere, ring at any angle', () => {
    for (const th of [deg(5), deg(20), deg(40)]) {
      const times = [0, BETA.solidSphere, BETA.disc, BETA.hollowSphere, BETA.ring].map((b) => timeDown(b, th, b === 0 ? 0 : 10, 2));
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });
});

describe('convergence', () => {
  it('stepping the skid with friction against the slip converges to the closed form, first order in dt', () => {
    const v0 = 3;
    const w0 = -10 / R;
    const exact = skid(v0, w0, R, BETA.solidSphere, 0.2, 2);
    const err = (dt: number) => Math.abs(integrateSkid(v0, w0, R, BETA.solidSphere, 0.2, 2, dt).x - exact.x);
    // explicit Euler: the error in x is about ½ |a| t dt, so it halves with dt
    const e1 = err(1e-3);
    const e2 = err(5e-4);
    expect(e1).toBeLessThan(5e-3);
    expect(e2 / e1).toBeGreaterThan(0.4);
    expect(e2 / e1).toBeLessThan(0.6);
    const v = integrateSkid(v0, w0, R, BETA.solidSphere, 0.2, 2, 1e-4).v;
    expect(relativeError(v, exact.v)).toBeLessThan(1e-6);
  });
});
