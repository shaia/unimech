import { describe, expect, it } from 'vitest';
import { C_LIGHT } from '~/physics/constants';
import {
  aimAngle,
  armDifference,
  armRoundTrip,
  armRoundTripFromLegs,
  binomialApprox,
  fringeShiftBetween,
  fringeShiftUnequalSmallSpeed,
  legSpeed,
  pulseOnArm,
  windForShift,
} from '~/physics/ether';
import { etherTimeDifference, etherTimeParallel, etherTimePerpendicular, fringeShiftOnRotation, fringeShiftSmallSpeed } from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const deg = Math.PI / 180;
const c = C_LIGHT;
const L = 11; // the 1887 arms [m]
const lambda = 550e-9;
const vOrbit = 3.0e4;

describe('analytic limits', () => {
  it('along the wind the round trip is (2L/c)/(1 − β²), as relativity.ts states', () => {
    for (const v of [vOrbit, 0.3 * c, 0.6 * c]) expect(relativeError(armRoundTrip(L, 0, v), etherTimeParallel(L, v))).toBeLessThan(1e-12);
  });

  it('across the wind the round trip is (2L/c)/√(1 − β²), as relativity.ts states', () => {
    for (const v of [vOrbit, 0.3 * c, 0.6 * c]) expect(relativeError(armRoundTrip(L, 90 * deg, v), etherTimePerpendicular(L, v))).toBeLessThan(1e-12);
  });

  it('with no wind every arm takes 2L/c and no turn moves the pattern', () => {
    for (const th of [0, 30, 77, 90].map((x) => x * deg)) expect(relativeError(armRoundTrip(L, th, 0), (2 * L) / c)).toBeLessThan(1e-14);
    expect(fringeShiftBetween(L, L, 0, 90 * deg, 0, lambda)).toBe(0);
  });

  it('a 90° turn of equal arms shifts the pattern by 2cΔt/λ ≈ 2Lβ²/λ = 0.40 fringe at 30 km/s', () => {
    const N = fringeShiftBetween(L, L, 0, 90 * deg, vOrbit, lambda);
    expect(relativeError(N, fringeShiftOnRotation(L, vOrbit, lambda))).toBeLessThan(1e-6);
    expect(relativeError(N, fringeShiftSmallSpeed(L, vOrbit, lambda))).toBeLessThan(1e-6);
    expect(relativeError(N, 0.4)).toBeLessThan(1e-6);
  });

  it('the cross arm is aimed upstream at arcsin β from the arm, and along the wind light is not deflected', () => {
    const b = 0.6;
    expect(relativeError(aimAngle(90 * deg, b * c) - 90 * deg, Math.asin(b))).toBeLessThan(1e-12);
    expect(Math.abs(aimAngle(0, b * c))).toBeLessThan(1e-15);
    expect(relativeError(legSpeed(90 * deg, b * c), c * Math.sqrt(1 - b * b))).toBeLessThan(1e-12);
  });

  it('downstream the light gains the wind, upstream it loses it: c + v and c − v', () => {
    expect(relativeError(legSpeed(0, 0.3 * c), 1.3 * c)).toBeLessThan(1e-14);
    expect(relativeError(legSpeed(Math.PI, 0.3 * c), 0.7 * c)).toBeLessThan(1e-12);
  });

  it('the binomial approximation agrees with the exact factors to order x²', () => {
    const x = 1e-4;
    expect(Math.abs(binomialApprox(-x, -1) - 1 / (1 - x))).toBeLessThan(2 * x * x);
    expect(Math.abs(binomialApprox(-x, -0.5) - 1 / Math.sqrt(1 - x))).toBeLessThan(x * x);
  });
});

describe('conservation', () => {
  it('the speed of light relative to the ether is c on every leg, at every arm angle', () => {
    const v = 0.45 * c;
    for (const phi of [0, 20, 90, 135, 180, 250].map((x) => x * deg)) {
      const u = legSpeed(phi, v);
      const rel = Math.hypot(u * Math.cos(phi) - v, u * Math.sin(phi));
      expect(relativeError(rel, c)).toBeLessThan(1e-12);
      const n = aimAngle(phi, v);
      // aimed along n̂ at c relative to the ether, plus the wind, the light moves along the arm at u: c n̂ + w = u û
      const miss = Math.hypot(c * Math.cos(n) + v - u * Math.cos(phi), c * Math.sin(n) - u * Math.sin(phi));
      expect(miss / c).toBeLessThan(1e-12);
    }
  });

  it('the round trip from the legs equals the closed form at every angle', () => {
    for (const v of [vOrbit, 0.3 * c, 0.6 * c]) {
      for (const th of [0, 15, 45, 60, 90, 120, 200].map((x) => x * deg)) {
        expect(relativeError(armRoundTripFromLegs(L, th, v), armRoundTrip(L, th, v))).toBeLessThan(1e-12);
      }
    }
  });

  it('a pulse is back at the splitter exactly at the round-trip time', () => {
    const v = 0.3 * c;
    const T = armRoundTrip(L, 90 * deg, v);
    expect(pulseOnArm(L, 90 * deg, v, T * (1 - 1e-9)).done).toBe(false);
    expect(pulseOnArm(L, 90 * deg, v, T * (1 + 1e-9)).done).toBe(true);
    expect(relativeError(pulseOnArm(L, 0, v, L / (1.3 * c)).s, L)).toBeLessThan(1e-12);
  });

  it('turning by 180° brings the pattern back: the shift has period 180°', () => {
    const v = 0.3 * c;
    expect(Math.abs(fringeShiftBetween(L, L, 0, 180 * deg, v, lambda))).toBeLessThan(1e-6 * fringeShiftBetween(L, L, 0, 90 * deg, v, lambda));
  });
});

describe('scaling', () => {
  it('the time difference grows as β²: doubling the wind multiplies it by 4 (small speeds)', () => {
    const r = etherTimeDifference(L, 2 * vOrbit) / etherTimeDifference(L, vOrbit);
    expect(relativeError(r, 4)).toBeLessThan(1e-6);
  });

  it('with unequal arms a 90° turn shifts by (L₁ + L₂)β²/λ: the fixed path difference drops out', () => {
    const N = fringeShiftBetween(2.0, 3.0, 0, 90 * deg, vOrbit, 633e-9);
    expect(relativeError(N, fringeShiftUnequalSmallSpeed(2.0, 3.0, vOrbit, 633e-9))).toBeLessThan(1e-6);
  });

  it('windForShift inverts 2Lβ²/λ', () => {
    const v = windForShift(0.01, L, lambda);
    expect(relativeError(fringeShiftSmallSpeed(L, v, lambda), 0.01)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the exact shift approaches the small-speed form 2Lβ²/λ as β → 0, with error ∝ β²', () => {
    let prev = Infinity;
    for (const b of [0.1, 0.05, 0.025]) {
      const err = relativeError(fringeShiftBetween(L, L, 0, 90 * deg, b * c, lambda), fringeShiftSmallSpeed(L, b * c, lambda));
      expect(err).toBeLessThan(prev);
      if (prev < Infinity) expect(relativeError(prev / err, 4)).toBeLessThan(0.05);
      prev = err;
    }
  });
});
