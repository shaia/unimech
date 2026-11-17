import { describe, expect, it } from 'vitest';
import {
  ACCEL_A0,
  ACCEL_T,
  PROFILES,
  ROD_L,
  SWING_A,
  distanceFromRoots,
  exactAbsIntegral,
  exactIntegral,
  partialSums,
  rodExact,
  rodSum,
  signedSum,
  unsignedSum,
} from '~/physics/accumulate';
import { derivative, riemann } from '~/physics/calculus';
import { relativeError } from '~/physics/vec';

const { reverse, swing, accel, uniform, tapered, bulge } = PROFILES;

describe('analytic limits', () => {
  it('the car that backs up: displacement 3 m, distance 5 m over 3 s (v = 4 − 2t)', () => {
    expect(relativeError(exactIntegral(reverse, 0, 3), 3)).toBeLessThan(1e-12);
    expect(relativeError(exactAbsIntegral(reverse, 0, 3), 5)).toBeLessThan(1e-12);
    // up to the stop at t = 2 s the two agree: 4 m
    expect(relativeError(exactIntegral(reverse, 0, 2), 4)).toBeLessThan(1e-12);
    expect(relativeError(exactAbsIntegral(reverse, 0, 2), 4)).toBeLessThan(1e-12);
  });

  it('over one full period of an oscillation the displacement is zero and the distance is 4A', () => {
    expect(Math.abs(exactIntegral(swing, 0, swing.b))).toBeLessThan(1e-12);
    expect(relativeError(exactAbsIntegral(swing, 0, swing.b), 4 * SWING_A)).toBeLessThan(1e-12);
    // half a period: from one end to the other, 2A
    expect(relativeError(exactAbsIntegral(swing, 0, swing.b / 2), 2 * SWING_A)).toBeLessThan(1e-12);
  });

  it('a linearly fading acceleration gives Δv = a₀T/2, half of a constant a₀', () => {
    expect(relativeError(exactIntegral(accel, 0, ACCEL_T), (ACCEL_A0 * ACCEL_T) / 2)).toBeLessThan(1e-12);
  });

  it('the midpoint sum of a linear rate is exact for every N, even N = 1', () => {
    for (const n of [1, 2, 7]) {
      expect(relativeError(signedSum(reverse, 0, 1.7, n, 'mid'), exactIntegral(reverse, 0, 1.7))).toBeLessThan(1e-12);
      expect(relativeError(rodSum(tapered, n, 'mid').mass, rodExact(tapered).mass)).toBeLessThan(1e-12);
    }
  });

  it('the left sum of a constant density is exact: a uniform rod has mass λL and its centre in the middle', () => {
    const s = rodSum(uniform, 3, 'left');
    expect(relativeError(s.mass, 0.5)).toBeLessThan(1e-12);
    // the left sum puts each piece's mass at its left end: the centre is pulled left by Δx/2
    expect(relativeError(s.xcm, ROD_L / 2 - ROD_L / 6)).toBeLessThan(1e-12);
    expect(relativeError(rodSum(uniform, 3, 'mid').xcm, ROD_L / 2)).toBeLessThan(1e-12);
  });

  it('the three rods all have mass 0.50 kg; the tapered one has its centre at 0.6L, the symmetric bulge at L/2', () => {
    for (const p of [uniform, tapered, bulge]) expect(relativeError(rodExact(p).mass, 0.5)).toBeLessThan(1e-12);
    expect(relativeError(rodExact(uniform).xcm, 0.5 * ROD_L)).toBeLessThan(1e-12);
    expect(relativeError(rodExact(tapered).xcm, 0.6 * ROD_L)).toBeLessThan(1e-12);
    expect(relativeError(rodExact(bulge).xcm, 0.5 * ROD_L)).toBeLessThan(1e-12);
  });
});

describe('conservation and identities', () => {
  it('fundamental theorem: every profile antiderivative has the rate as its derivative and vanishes at the start', () => {
    for (const p of Object.values(PROFILES)) {
      expect(Math.abs(p.F(p.a))).toBeLessThan(1e-12);
      for (const s of [0.13, 0.5, 0.91].map((u) => p.a + u * (p.b - p.a))) {
        expect(relativeError(derivative(p.F, s), p.f(s))).toBeLessThan(1e-7);
      }
      if (p.G) for (const s of [0.2, 0.7]) expect(relativeError(derivative(p.G, s), s * p.f(s))).toBeLessThan(1e-7);
    }
  });

  it('the integral is additive: over [a, c] it is the integral over [a, b] plus over [b, c]', () => {
    for (const p of [reverse, swing, accel]) {
      const c = p.b * 0.9;
      const m = c * 0.37;
      const split = signedSum(p, p.a, m, 2000, 'mid') + signedSum(p, m, c, 2000, 'mid');
      expect(relativeError(split, exactIntegral(p, p.a, c))).toBeLessThan(1e-6);
    }
  });

  it('distance is never less than |displacement|, and equals it when the velocity keeps its sign', () => {
    for (const p of [reverse, swing]) {
      for (const hi of [0.5, 1.5, 2.5, p.b]) {
        expect(exactAbsIntegral(p, 0, hi)).toBeGreaterThanOrEqual(Math.abs(exactIntegral(p, 0, hi)) - 1e-12);
      }
    }
    expect(relativeError(exactAbsIntegral(reverse, 0, 1.5), exactIntegral(reverse, 0, 1.5))).toBeLessThan(1e-12);
  });

  it('distanceFromRoots: v = t² − 4t + 3 on [0, 4] s gives displacement 4/3 m and distance 4 m', () => {
    const F = (t: number) => t ** 3 / 3 - 2 * t * t + 3 * t;
    expect(relativeError(F(4) - F(0), 4 / 3)).toBeLessThan(1e-12);
    expect(relativeError(distanceFromRoots(F, 0, 4, [1, 3]), 4)).toBeLessThan(1e-12);
  });

  it('the running sums end at the full sum, and each step adds one piece', () => {
    const S = partialSums(swing, 0, 3, 12, 'mid');
    expect(S).toHaveLength(13);
    expect(relativeError(S[12], signedSum(swing, 0, 3, 12, 'mid'))).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('doubling a rate doubles the integral; reversing the interval flips its sign', () => {
    const f = swing.f;
    expect(relativeError(riemann((t) => 2 * f(t), 0, 1.3, 50), 2 * riemann(f, 0, 1.3, 50))).toBeLessThan(1e-12);
    expect(relativeError(riemann(f, 1.3, 0, 50), -riemann(f, 0, 1.3, 50))).toBeLessThan(1e-12);
  });

  it('the centre of mass does not depend on the scale of the density', () => {
    const scaled = { ...tapered, f: (x: number) => 7 * tapered.f(x) };
    expect(relativeError(rodSum(scaled, 20, 'left').xcm, rodSum(tapered, 20, 'left').xcm)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the left sum converges as 1/N: doubling N halves the error', () => {
    for (const p of [reverse, swing, tapered]) {
      const exact = exactIntegral(p, p.a, p.b * 0.8);
      const e1 = Math.abs(signedSum(p, p.a, p.b * 0.8, 40, 'left') - exact);
      const e2 = Math.abs(signedSum(p, p.a, p.b * 0.8, 80, 'left') - exact);
      expect(relativeError(e1 / e2, 2)).toBeLessThan(0.05);
    }
  });

  it('the midpoint sum of a curved rate converges as 1/N²: doubling N quarters the error', () => {
    for (const p of [swing, bulge]) {
      const hi = p.a + (p.b - p.a) * 0.8;
      const exact = exactIntegral(p, p.a, hi);
      const e1 = Math.abs(signedSum(p, p.a, hi, 40, 'mid') - exact);
      const e2 = Math.abs(signedSum(p, p.a, hi, 80, 'mid') - exact);
      expect(relativeError(e1 / e2, 4)).toBeLessThan(0.02);
    }
  });

  it('the unsigned sum converges to the distance, and the rod sums to the exact mass and centre', () => {
    expect(relativeError(unsignedSum(swing, 0, swing.b, 400, 'mid'), 4 * SWING_A)).toBeLessThan(1e-4);
    expect(relativeError(unsignedSum(reverse, 0, 3, 400, 'left'), 5)).toBeLessThan(1e-2);
    const s = rodSum(tapered, 400, 'left');
    expect(relativeError(s.mass, rodExact(tapered).mass)).toBeLessThan(3e-3);
    expect(relativeError(s.xcm, rodExact(tapered).xcm)).toBeLessThan(3e-3);
  });
});
