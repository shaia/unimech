import { describe, expect, it } from 'vitest';
import {
  blockOnAcceleratingFloor,
  dropInFrame,
  hangingTension,
  horizontalAccelForPeriodRatio,
  inclineInCart,
  inclineRestAcceleration,
  pendulumPeriodInFrame,
  scaleReading,
  seenFromFrame,
  solvedInFrame,
  tidalApproach,
  tidalApproachExact,
  type LinearFrame,
} from '~/physics/accelframe';
import { G, R_EARTH } from '~/physics/constants';
import { atwood } from '~/physics/tension';
import { plumbAngleLinear } from '~/physics/rotating';
import { len3, relativeError, type Vec3 } from '~/physics/vec';

const g: Vec3 = [0, -G, 0];

describe('analytic limits', () => {
  it('a frame at constant velocity (A = 0) is inertial: a dropped ball lands under its release point after √(2h/g)', () => {
    const d = dropInFrame(1.6, g, [0, 0, 0]);
    expect(d).not.toBeNull();
    expect(relativeError(d!.t, Math.sqrt((2 * 1.6) / G))).toBeLessThan(1e-12);
    expect(Math.abs(d!.offset[0])).toBeLessThan(1e-15);
  });

  it('in a cart accelerating at A a ball released at rest lands Ah/g behind, on the line of the plumb string', () => {
    const A = 3.5;
    const h = 1.6;
    const d = dropInFrame(h, g, [A, 0, 0])!;
    expect(relativeError(-d.offset[0], (A * h) / G)).toBeLessThan(1e-12);
    // the path is straight along g_eff: horizontal run over drop equals tan of the plumb angle
    expect(relativeError(-d.offset[0] / h, Math.tan(plumbAngleLinear(G, A)))).toBeLessThan(1e-12);
    // horizontal A leaves the vertical motion alone: same fall time as at rest
    expect(relativeError(d.t, Math.sqrt((2 * h) / G))).toBeLessThan(1e-12);
  });

  it('in an elevator in free fall (A = g down) nothing falls, the string goes slack, the pendulum never swings back', () => {
    const A: Vec3 = [0, -G, 0];
    expect(dropInFrame(1.6, g, A)).toBeNull();
    expect(hangingTension(0.4, g, A)).toBe(0);
    expect(pendulumPeriodInFrame(1, g, A)).toBe(Number.POSITIVE_INFINITY);
    expect(scaleReading(60, G, -G)).toBe(0);
  });

  it('a scale reads mg at rest or at any constant velocity, m(g + A) accelerating up, and 0 past free fall', () => {
    expect(relativeError(scaleReading(60, G, 0), 60 * G)).toBeLessThan(1e-12);
    expect(relativeError(scaleReading(60, G, 1.4), 60 * (G + 1.4))).toBeLessThan(1e-12);
    expect(scaleReading(60, G, -12)).toBe(0);
  });

  it('a block holds on an accelerating floor up to A = μ_s g, then slides back at A − μ_k g', () => {
    const hold = blockOnAcceleratingFloor(0.4 * G, 0.4, 0.3, G);
    expect(hold.sliding).toBe(false);
    expect(hold.aRel).toBe(0);
    const slide = blockOnAcceleratingFloor(6, 0.4, 0.3, G);
    expect(slide.sliding).toBe(true);
    expect(relativeError(-slide.aRel, 6 - 0.3 * G)).toBeLessThan(1e-12);
    // braking (A < 0) mirrors it: the block slides forward
    const brake = blockOnAcceleratingFloor(-6, 0.4, 0.3, G);
    expect(relativeError(brake.aRel, 6 - 0.3 * G)).toBeLessThan(1e-12);
  });

  it('a smooth incline in a cart holds a block exactly at A = g tan α, and at A = 0 the block slides down at g sin α', () => {
    const alpha = (25 * Math.PI) / 180;
    const A0 = inclineRestAcceleration(G, alpha);
    expect(Math.abs(inclineInCart(G, A0, alpha).aUp)).toBeLessThan(1e-12);
    expect(relativeError(-inclineInCart(G, 0, alpha).aUp, G * Math.sin(alpha))).toBeLessThan(1e-12);
    // at the holding acceleration the normal force per unit mass is |g_eff| = g / cos α
    expect(relativeError(inclineInCart(G, A0, alpha).normal, G / Math.cos(alpha))).toBeLessThan(1e-12);
  });

  it('a pendulum in a cart of horizontal acceleration has the period 2π√(L/√(g² + A²)), shorter than at rest', () => {
    const L = 0.6;
    const A = 6.0;
    const T = pendulumPeriodInFrame(L, g, [A, 0, 0]);
    expect(relativeError(T, 2 * Math.PI * Math.sqrt(L / Math.hypot(G, A)))).toBeLessThan(1e-12);
    expect(T).toBeLessThan(pendulumPeriodInFrame(L, g, [0, 0, 0]));
  });
});

describe('conservation', () => {
  it('the second law with −mA in S′ gives exactly the motion of S transformed by r′ = r − R', () => {
    const f: LinearFrame = { R0: [2, 0.5, 0], V0: [3, -1, 0], A: [2.5, 1.5, 0] };
    const body = { r: [1, 4, 0] as Vec3, v: [-2, 6, 0] as Vec3 };
    for (const t of [0, 0.3, 1.1, 2.7]) {
      const a = seenFromFrame(body, g, f, t);
      const b = solvedInFrame(body, g, f, t);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(a.r[i] - b.r[i])).toBeLessThan(1e-12 * (1 + Math.abs(a.r[i])));
        expect(Math.abs(a.v[i] - b.v[i])).toBeLessThan(1e-12 * (1 + Math.abs(a.v[i])));
      }
    }
  });

  it('an Atwood machine in an elevator accelerating up obeys the second law in S with real forces only', () => {
    const m1 = 3.0;
    const m2 = 2.0;
    const A = 1.2;
    // in S′ the machine runs in g_eff = g + A; atwood(a > 0: m₂ descends), so m₁ descends at −a
    const { a, T } = atwood(m1, m2, G + A);
    const aRelHeavy = -a; // m₁ down, relative to the elevator
    // in S: m₁ accelerates at A − aRelHeavy (up positive); T − m₁g = m₁ a₁
    const a1 = A - aRelHeavy;
    expect(relativeError(T - m1 * G, m1 * a1)).toBeLessThan(1e-12);
    const a2 = A + aRelHeavy;
    expect(relativeError(T - m2 * G, m2 * a2)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('the period ratio T/T₀ = (g/|g_eff|)^½ inverts to the cart acceleration', () => {
    for (const ratio of [0.95, 0.9, 0.7]) {
      const A = horizontalAccelForPeriodRatio(G, ratio)!;
      const T = pendulumPeriodInFrame(1, g, [A, 0, 0]);
      const T0 = pendulumPeriodInFrame(1, g, [0, 0, 0]);
      expect(relativeError(T / T0, ratio)).toBeLessThan(1e-12);
    }
    expect(horizontalAccelForPeriodRatio(G, 1.1)).toBeNull();
  });

  it('the tension of a hanging mass grows as √(g² + A²) with horizontal A and as g + A with vertical A', () => {
    expect(relativeError(hangingTension(0.4, g, [7, 0, 0]), 0.4 * Math.hypot(G, 7))).toBeLessThan(1e-12);
    expect(relativeError(hangingTension(0.4, g, [0, 2.5, 0]), 0.4 * (G + 2.5))).toBeLessThan(1e-12);
    expect(relativeError(len3([0, -(G + 2.5), 0]), G + 2.5)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the tidal approach of two bodies falling side by side tends to ½(g d/R)t², the first-order estimate', () => {
    const d = 20;
    const t = 3;
    const exact = tidalApproachExact(G, d, R_EARTH, t);
    const est = tidalApproach(G, d, R_EARTH, t);
    expect(relativeError(exact, est)).toBeLessThan(1e-3);
  });
});
