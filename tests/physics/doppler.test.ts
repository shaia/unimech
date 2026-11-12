import { describe, expect, it } from 'vitest';
import { C_LIGHT } from '~/physics/constants';
import {
  additionSlope,
  arrivalTime,
  chainedLaunches,
  echoFactor,
  emissionEvents,
  receivedPeriodObserverMoving,
  receivedPeriodSourceMoving,
  receivedProperPeriod,
  symmetricFrameVelocity,
  wavelengthAhead,
  wavelengthBehind,
} from '~/physics/doppler';
import {
  addVelocities,
  classicalDopplerMovingObserver,
  classicalDopplerMovingSource,
  dopplerFactor,
  gammaOf,
  lorentz,
  velocityInFrame,
} from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const BETAS = [-0.9, -0.5, -0.2, 0.05, 0.3, 0.5, 0.85];

describe('analytic limits', () => {
  it('a light pulse launched at c from a ship at any speed moves at c in S', () => {
    for (const b of BETAS) expect(relativeError(addVelocities(1, b, 1), 1)).toBeLessThan(1e-14);
  });

  it('at everyday speeds the relativistic sum differs from u′ + v by the fraction u′v/c² (jet and missile: 2.8e-12)', () => {
    const v = 250;
    const up = 1000;
    const u = addVelocities(up, v);
    const excess = (up + v - u) / (up + v);
    // u′ + v − u = (u′ + v)·(u′v/c²)/(1 + u′v/c²)
    expect(relativeError(excess, (up * v) / C_LIGHT ** 2)).toBeLessThan(1e-3);
  });

  it('the slope of u(u′) is 1 when the frame does not move and 1 − β² at u′ = 0', () => {
    expect(additionSlope(0.7, 0, 1)).toBe(1);
    expect(relativeError(additionSlope(0, 0.5, 1), 0.75)).toBeLessThan(1e-14);
  });

  it('a source at rest is received at its own period; the observer-frame and source-frame periods are T₀/D', () => {
    expect(receivedPeriodSourceMoving(1, 0)).toBe(1);
    for (const b of BETAS) {
      const D = dopplerFactor(b);
      expect(relativeError(receivedPeriodSourceMoving(1, b), 1 / D)).toBeLessThan(1e-13);
      expect(relativeError(receivedPeriodObserverMoving(1, b), 1 / D)).toBeLessThan(1e-13);
    }
  });

  it('the crests ahead of a source moving at β are spaced λ₀/D(β), the crests behind λ₀·D(β)', () => {
    for (const b of BETAS) {
      expect(relativeError(wavelengthAhead(1, b), 1 / dopplerFactor(b))).toBeLessThan(1e-13);
      expect(relativeError(wavelengthBehind(1, b), dopplerFactor(b))).toBeLessThan(1e-13);
    }
  });

  it('for β ≪ 1 the factor is 1 + β, and both sound formulas agree with it to first order', () => {
    const b = 1e-4;
    const D = dopplerFactor(b);
    expect(Math.abs(D - (1 + b))).toBeLessThan(b * b);
    expect(Math.abs(classicalDopplerMovingSource(1, b) - D)).toBeLessThan(b * b);
    expect(Math.abs(classicalDopplerMovingObserver(1, b) - D)).toBeLessThan(b * b);
  });

  it('two bodies flying apart at +0.9c and −0.7c move at ±0.824c in the symmetric frame, which moves at 0.294c', () => {
    const w = symmetricFrameVelocity(0.9, -0.7, 1);
    expect(relativeError(w, 0.293561)).toBeLessThan(1e-5);
    const u1 = velocityInFrame(0.9, w, 1);
    const u2 = velocityInFrame(-0.7, w, 1);
    expect(relativeError(u1, -u2)).toBeLessThan(1e-13);
    // the Galilean limit: small speeds give the average (a + b)/2
    expect(relativeError(symmetricFrameVelocity(3e-4, -1e-4, 1), 1e-4)).toBeLessThan(1e-6);
    expect(symmetricFrameVelocity(0.4, -0.4, 1)).toBe(0);
  });
});

describe('conservation (one answer in every frame)', () => {
  it('the period read on the observer’s clock is the same computed in the observer’s frame or the source’s', () => {
    for (const b of BETAS) {
      // observer frame: observer at rest at x = 10, source passing x = 0 at t = 0 moving toward it at βc
      const obs = receivedProperPeriod(1, 0, b, 10, 0, 1);
      // source frame: source at rest at x = 0, observer passing x = 10 at t = 0 moving toward it at βc
      const src = receivedProperPeriod(1, 0, 0, 10, -b, 1);
      expect(relativeError(obs, src)).toBeLessThan(1e-12);
      expect(relativeError(obs, 1 / dopplerFactor(b))).toBeLessThan(1e-12);
    }
  });

  it('emission events placed γT₀ apart in S are T₀ apart on the source’s own clock (Lorentz transformation to its frame)', () => {
    const b = 0.6;
    const [e0, e1] = emissionEvents(0, b, 1, 0, 1, 1);
    const p0 = lorentz(e0, b, 1);
    const p1 = lorentz(e1, b, 1);
    expect(Math.abs(p1.x - p0.x)).toBeLessThan(1e-12); // one place in the source's frame
    expect(relativeError(p1.t - p0.t, 1)).toBeLessThan(1e-12);
  });

  it('only the relative velocity matters: a source at 0.5c chasing an observer at 0.2c gives D(1/3) = √2', () => {
    // in S, both move along +x; the source is behind
    const T = receivedProperPeriod(1, 0, 0.5, 5, 0.2, 1);
    const rel = velocityInFrame(0.5, 0.2, 1);
    expect(relativeError(rel, 1 / 3)).toBeLessThan(1e-13);
    expect(relativeError(1 / T, dopplerFactor(rel))).toBeLessThan(1e-12);
    expect(relativeError(1 / T, Math.SQRT2)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('approaching and receding at the same speed are inverse factors: D(β)·D(−β) = 1', () => {
    for (const b of BETAS) expect(relativeError(dopplerFactor(b) * dopplerFactor(-b), 1)).toBeLessThan(1e-13);
  });

  it('the light factor is the geometric mean of the two sound factors: D² = (1 + β)/(1 − β)', () => {
    for (const b of BETAS) {
      const sq = classicalDopplerMovingSource(1, b) * classicalDopplerMovingObserver(1, b);
      expect(relativeError(dopplerFactor(b) ** 2, sq)).toBeLessThan(1e-13);
      expect(relativeError(echoFactor(b), sq)).toBeLessThan(1e-13);
    }
  });

  it('Doppler factors multiply under velocity addition: D(u′ ⊕ v) = D(u′)·D(v)', () => {
    for (const a of BETAS)
      for (const b of BETAS) expect(relativeError(dopplerFactor(addVelocities(a, b, 1)), dopplerFactor(a) * dopplerFactor(b))).toBeLessThan(1e-12);
  });

  it('speeds below c add to a speed below c, and u(u′) rises from −c to c', () => {
    for (const v of BETAS) {
      let prev = -Infinity;
      for (let up = -0.99; up <= 0.99; up += 0.03) {
        const u = addVelocities(up, v, 1);
        expect(Math.abs(u)).toBeLessThan(1);
        expect(u).toBeGreaterThan(prev);
        expect(additionSlope(up, v, 1)).toBeGreaterThan(0);
        prev = u;
      }
    }
  });

  it('a chain of launches at 0.5c each approaches c but never reaches it: 0.5, 0.8, 0.929, 0.976', () => {
    const u = chainedLaunches(0.5, 30, 1);
    const want = [0.5, 0.8, 13 / 14, 40 / 41];
    want.forEach((x, i) => expect(relativeError(u[i], x)).toBeLessThan(1e-13));
    u.forEach((x, i) => {
      expect(x).toBeLessThan(1);
      if (i > 0) expect(x).toBeGreaterThan(u[i - 1]);
    });
  });
});

describe('convergence', () => {
  it('the slope formula matches a centred finite difference of the addition rule', () => {
    for (const v of BETAS)
      for (const up of [-0.8, 0, 0.4, 0.9]) {
        const h = 1e-5;
        const fd = (addVelocities(up + h, v, 1) - addVelocities(up - h, v, 1)) / (2 * h);
        expect(relativeError(fd, additionSlope(up, v, 1))).toBeLessThan(1e-8);
      }
  });

  it('the average received period over many crests is the single-crest period (no drift as the distance shrinks)', () => {
    const b = 0.5;
    const ev = emissionEvents(-40, b, 1, 0, 40, 1);
    const arr = ev.map((e) => arrivalTime(e, 30, 0, 1));
    const mean = (arr[40] - arr[0]) / 40;
    expect(relativeError(mean, gammaOf(b) * (1 - b))).toBeLessThan(1e-12);
  });
});
