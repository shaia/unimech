import { describe, expect, it } from 'vitest';
import { C_LIGHT } from '~/physics/constants';
import {
  altitudeFromSurvival,
  betaForProperTrip,
  betaFromLegRatio,
  clockLag,
  clockLagSmallSpeed,
  clockSnapshot,
  crossing,
  legRatio,
  longitudinalLegs,
  meanRange,
  MUON_LIFETIME,
  properTick,
  rodInMotion,
  swarmLifetimes,
  tiltedClockLegs,
} from '~/physics/dilation';
import { gammaOf, lightClockTick, survivalFraction } from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const c = C_LIGHT;
const close = (a: number, b: number, tol = 1e-12) => expect(relativeError(a, b)).toBeLessThan(tol);
const BETAS = [0.1, 0.6, 0.8, 0.95, 0.999];

describe('analytic limits', () => {
  it('a clock at rest ticks in 2L₀/c in both orientations, with equal legs', () => {
    close(clockSnapshot(1.8, 0, 1, 'transverse').T, properTick(1.8));
    const [a, b] = longitudinalLegs(1.8, 0);
    close(a, 1.8 / c);
    close(b, 1.8 / c);
  });

  it('the 3-4-5 light clock: L₀ = 1.8 m at 0.8c ticks in 20 ns, the pulse 3.0 m along each diagonal', () => {
    const v = 0.8 * c;
    const s = clockSnapshot(1.8, v, 1, 'transverse');
    close(s.T, 20e-9);
    const top = clockSnapshot(1.8, v, s.T / 2, 'transverse');
    close(top.pulse[0], 2.4);
    close(top.pulse[1], 1.8);
    close(Math.hypot(top.pulse[0], top.pulse[1]), 3.0);
    const [out, back] = longitudinalLegs(1.8, v);
    close(out, 18e-9);
    close(back, 2e-9);
  });

  it('a tilted clock is the transverse clock at θ₀ = 90° and the longitudinal one at θ₀ = 0', () => {
    for (const b of BETAS) {
      const v = b * c;
      const [a1, a2] = tiltedClockLegs(1.0, 0, v);
      const [l1, l2] = longitudinalLegs(1.0, v);
      close(a1, l1, 1e-10);
      close(a2, l2, 1e-10);
      const [p1, p2] = tiltedClockLegs(1.0, Math.PI / 2, v);
      close(p1, p2, 1e-10);
      close(p1 + p2, lightClockTick(1.0, v, 'transverse'), 1e-10);
    }
  });

  it('a rod along the motion contracts by γ, a rod across it keeps its length', () => {
    const v = 0.8 * c;
    close(rodInMotion(2.0, 0, v).length, 2.0 / gammaOf(0.8));
    close(rodInMotion(2.0, Math.PI / 2, v).length, 2.0, 1e-12);
  });

  it('with no relative speed the particles survive the classical fraction, and the frames coincide', () => {
    const x = crossing(1000, 1e-6 * c, 1e-3);
    close(x.survivalLayerFrame, x.survivalClassical, 1e-9);
    close(x.thicknessInParticleFrame, 1000, 1e-9);
  });

  it('the leg ratio of a clock at rest is 1, and β = 0.6 gives 4', () => {
    close(legRatio(0), 1);
    close(legRatio(0.6), 4);
    close(betaFromLegRatio(4), 0.6);
  });
});

describe('conservation (invariants)', () => {
  it('a clock ticks in γT₀ whatever its orientation: across, along, or tilted by any angle', () => {
    for (const b of BETAS) {
      const v = b * c;
      const target = gammaOf(b) * properTick(1.0);
      const [o, k] = longitudinalLegs(1.0, v);
      close(o + k, target, 1e-10);
      for (const th of [0, 0.3, 0.7, 1.0, 1.4, Math.PI / 2, 2.5]) {
        const [t1, t2] = tiltedClockLegs(1.0, th, v);
        close(t1 + t2, target, 1e-10);
      }
    }
  });

  it('the pulse moves at c in S in both orientations, on both legs', () => {
    for (const b of BETAS) {
      const v = b * c;
      for (const o of ['transverse', 'longitudinal'] as const) {
        const T = clockSnapshot(1.0, v, 0, o).T;
        for (const f of [0.1, 0.3, 0.7, 0.9]) {
          const t = f * T;
          const h = T * 1e-6;
          const p1 = clockSnapshot(1.0, v, t - h, o).pulse;
          const p2 = clockSnapshot(1.0, v, t + h, o).pulse;
          const s1 = clockSnapshot(1.0, v, t - h, o).leg;
          const s2 = clockSnapshot(1.0, v, t + h, o).leg;
          if (s1 !== s2) continue; // straddles the reflection
          close(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / (2 * h), c, 1e-6);
        }
      }
    }
  });

  it('the pulse is back on the base mirror at the end of the tick, at x = vT, in both orientations', () => {
    const v = 0.8 * c;
    for (const o of ['transverse', 'longitudinal'] as const) {
      const s = clockSnapshot(1.8, v, 1, o);
      close(s.pulse[0], v * s.T, 1e-12);
      expect(Math.abs(s.pulse[1])).toBeLessThan(1e-12);
      close(s.base, v * s.T, 1e-12);
    }
  });

  it('the surviving fraction is the same computed in the layer frame and in the particle frame', () => {
    for (const b of [0.9, 0.995, 0.998, 0.9999]) {
      const x = crossing(15e3, b * c, MUON_LIFETIME);
      close(x.survivalLayerFrame, x.survivalParticleFrame, 1e-12);
      close(x.survivalParticleFrame, survivalFraction(x.properTime, MUON_LIFETIME), 1e-12);
      close(x.properTime * x.gamma, x.timeInLayerFrame, 1e-12);
    }
  });

  it('the proper time of a trip agrees in the frame of the road and in the frame of the traveller', () => {
    const L = 4.3; // light-years, c = 1
    const b = betaForProperTrip(L, 3.0, 1);
    close(L / b / gammaOf(b), 3.0, 1e-12); // S: time L/v, dilated
    close(L / gammaOf(b) / b, 3.0, 1e-12); // traveller: contracted road at v
  });
});

describe('scaling', () => {
  it('the tick scales with L₀ at a fixed speed', () => {
    for (const o of ['transverse', 'longitudinal'] as const) {
      const T1 = clockSnapshot(1.0, 0.7 * c, 0, o).T;
      const T3 = clockSnapshot(3.0, 0.7 * c, 0, o).T;
      close(T3 / T1, 3, 1e-12);
    }
  });

  it('the lag of a moving clock grows as v² at everyday speeds', () => {
    const l1 = clockLag(3600, 100);
    const l2 = clockLag(3600, 200);
    close(l2 / l1, 4, 1e-9);
  });

  it('the altitude from a surviving fraction inverts the survival law', () => {
    const v = 0.995 * c;
    const H = altitudeFromSurvival(0.25, v, MUON_LIFETIME);
    close(crossing(H, v, MUON_LIFETIME).survivalLayerFrame, 0.25, 1e-12);
    close(meanRange(v, MUON_LIFETIME), gammaOf(0.995) * v * MUON_LIFETIME);
  });
});

describe('convergence', () => {
  it('the small-speed lag β²Δt/2 approaches the exact lag, with an error of about β²/4', () => {
    for (const b of [1e-2, 1e-3, 1e-4]) {
      const exact = clockLag(1, b * c);
      const approx = clockLagSmallSpeed(1, b * c);
      expect(relativeError(exact, approx)).toBeLessThan(0.3 * b * b);
      expect(relativeError(exact, approx)).toBeGreaterThan(0.2 * b * b);
    }
  });

  it('the exact lag keeps its digits at an airliner speed, where 1 − 1/γ would cancel', () => {
    const v = 250;
    close(clockLag(36000, v), clockLagSmallSpeed(36000, v), 1e-11);
  });

  it("a swarm's surviving fraction converges to e^(−t/τ) as the swarm grows", () => {
    const frac = (n: number, t: number) => swarmLifetimes(n, 1).filter((s) => s > t).length / n;
    for (const t of [0.5, 1.44, 2]) {
      expect(Math.abs(frac(40, t) - Math.exp(-t))).toBeLessThanOrEqual(1 / 40 + 1e-12);
      expect(Math.abs(frac(4000, t) - Math.exp(-t))).toBeLessThanOrEqual(1 / 4000 + 1e-12);
    }
  });
});
