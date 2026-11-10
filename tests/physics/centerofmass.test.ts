import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  burstAt,
  burstPlan,
  centerOfMass,
  cmAccelerationY,
  exactCM,
  exactMass,
  numericCM,
  parabolaAt,
  plankCentre,
  plankShift,
  unweightedMean,
  type Burst,
  type Shape,
} from '~/physics/centerofmass';
import { relativeError } from '~/physics/vec';

const ROD_UNIFORM: Shape = { kind: 'rod', L: 1.5, lamA: 2, lamB: 2 };
const ROD_LINEAR: Shape = { kind: 'rod', L: 1.5, lamA: 0, lamB: 4 };
const TRIANGLE: Shape = { kind: 'triangle', base: 1.2, h: 0.9, sigma: 3 };
const HALF_DISC: Shape = { kind: 'half-disc', R: 0.6, sigma: 3 };
const HALF_RING: Shape = { kind: 'half-ring', R: 0.6, lam: 2 };

/** The burst of the lesson's figure: 20 m/s at 60°, at the top, two equal halves separating at 10 m/s, 30° up. */
const top = (20 * Math.sin(Math.PI / 3)) / G;
const BURST: Burst = { v0: 20, angleDeg: 60, tBurst: top, fraction: 0.5, u: 10, phiDeg: 30 };

describe('analytic limits', () => {
  it('a uniform rod has its centre of mass at its middle, L/2', () => {
    expect(relativeError(numericCM(ROD_UNIFORM, 50).coord, 0.75)).toBeLessThan(1e-14);
    expect(relativeError(exactCM(ROD_UNIFORM), 0.75)).toBeLessThan(1e-15);
  });

  it('a rod with λ ∝ x has its centre of mass at 2L/3, toward the heavy end', () => {
    expect(relativeError(exactCM(ROD_LINEAR), 1.0)).toBeLessThan(1e-15);
    expect(relativeError(numericCM(ROD_LINEAR, 2000).coord, 1.0)).toBeLessThan(1e-6);
  });

  it('a rod with λ = λ0(1 + x/L) lies between: 5L/9', () => {
    const rod: Shape = { kind: 'rod', L: 9, lamA: 1, lamB: 2 };
    expect(relativeError(exactCM(rod), 5)).toBeLessThan(1e-15);
    expect(relativeError(numericCM(rod, 2000).coord, 5)).toBeLessThan(1e-6);
  });

  it('a uniform triangular plate has its centre of mass a third of the height above its base', () => {
    expect(relativeError(numericCM(TRIANGLE, 4000).coord, 0.3)).toBeLessThan(1e-7);
  });

  it('a uniform half-disc has its centre of mass 4R/3π above its flat edge', () => {
    expect(relativeError(numericCM(HALF_DISC, 20000).coord, (4 * 0.6) / (3 * Math.PI))).toBeLessThan(1e-6);
  });

  it('a half-ring of wire has its centre of mass 2R/π above the diameter, outside the wire', () => {
    const Y = numericCM(HALF_RING, 2000).coord;
    expect(relativeError(Y, (2 * 0.6) / Math.PI)).toBeLessThan(1e-6);
    // the wire is at distance R from the centre everywhere; its centre of mass is at 0.637 R, off the wire
    expect(Y).toBeLessThan(0.6);
  });

  it('the wire sits higher than the half-disc of the same radius: all its mass is at distance R', () => {
    expect(exactCM(HALF_RING)).toBeGreaterThan(exactCM(HALF_DISC));
  });

  it('the numerical masses are the areas and lengths times the density', () => {
    for (const s of [ROD_UNIFORM, ROD_LINEAR, TRIANGLE, HALF_DISC, HALF_RING]) {
      expect(relativeError(numericCM(s, 20000).M, exactMass(s))).toBeLessThan(1e-6);
    }
  });

  it('two equal masses have their centre of mass at the midpoint; one mass alone, at itself', () => {
    expect(centerOfMass([{ m: 3, r: [1, 2] }, { m: 3, r: [5, -2] }])).toEqual([3, 0]);
    expect(centerOfMass([{ m: 7, r: [1.5, -0.5] }])).toEqual([1.5, -0.5]);
  });

  it('the centre of mass divides the segment between two masses inversely to the masses', () => {
    // 3 kg at x = 0 and 1 kg at x = 4: one metre from the heavy one, three from the light one
    const [X] = centerOfMass([{ m: 3, r: [0, 0] }, { m: 1, r: [4, 0] }]);
    expect(relativeError(X, 1)).toBeLessThan(1e-15);
  });

  it('with equal masses the centre of mass is the plain average; with unequal masses it is not', () => {
    const eq = [{ m: 2, r: [0, 0] as [number, number] }, { m: 2, r: [3, 0] as [number, number] }, { m: 2, r: [0, 6] as [number, number] }];
    expect(centerOfMass(eq)).toEqual(unweightedMean(eq));
    const uneq = [{ m: 1, r: [0, 0] as [number, number] }, { m: 2, r: [3, 0] as [number, number] }, { m: 3, r: [0, 4] as [number, number] }];
    expect(relativeError(centerOfMass(uneq)[1], 2)).toBeLessThan(1e-15);
    expect(relativeError(unweightedMean(uneq)[1], 4 / 3)).toBeLessThan(1e-15);
  });

  it('a burst with no separation speed leaves both fragments on the parabola', () => {
    const b: Burst = { ...BURST, u: 0 };
    for (const t of [top + 0.3, top + 1.2]) {
      const s = burstAt(b, t);
      expect(relativeError(s.r[0][0], s.parabola[0])).toBeLessThan(1e-14);
      expect(relativeError(s.r[1][1], s.parabola[1])).toBeLessThan(1e-12);
    }
  });
});

describe('conservation', () => {
  it('while every fragment flies, the centre of mass is exactly on the unexploded parabola', () => {
    for (const b of [BURST, { ...BURST, fraction: 0.25, u: 14, phiDeg: -40, tBurst: 0.6 * top }]) {
      const plan = burstPlan(b);
      for (let k = 1; k <= 20; k++) {
        const t = b.tBurst + ((plan.tFirst - b.tBurst) * k) / 21;
        const s = burstAt(b, t, plan);
        const p = parabolaAt(b, t);
        expect(relativeError(s.cm[0], p[0])).toBeLessThan(1e-13);
        expect(Math.abs(s.cm[1] - p[1])).toBeLessThan(1e-12 * Math.max(1, Math.abs(p[1])));
      }
    }
  });

  it('the burst does not change the momentum: f₁v₁ + f₂v₂ equals the shell velocity just before it', () => {
    const plan = burstPlan(BURST);
    const [a, c] = plan.frags;
    expect(relativeError(a.fraction * a.v0[0] + c.fraction * c.v0[0], plan.vB[0])).toBeLessThan(1e-15);
    expect(Math.abs(a.fraction * a.v0[1] + c.fraction * c.v0[1] - plan.vB[1])).toBeLessThan(1e-14);
    // and the fragments separate at u
    expect(relativeError(Math.hypot(a.v0[0] - c.v0[0], a.v0[1] - c.v0[1]), BURST.u)).toBeLessThan(1e-14);
  });

  it('a burst that sends both fragments off horizontally lands them together, and their centre of mass at the range', () => {
    const b: Burst = { ...BURST, phiDeg: 0, fraction: 0.3 };
    const plan = burstPlan(b);
    expect(relativeError(plan.frags[0].tLand, plan.frags[1].tLand)).toBeLessThan(1e-14);
    const X = plan.frags[0].fraction * plan.frags[0].xLand + plan.frags[1].fraction * plan.frags[1].xLand;
    expect(relativeError(X, plan.range)).toBeLessThan(1e-14);
  });

  it('after the first landing the ground pushes on the system, and the centre of mass leaves the parabola', () => {
    const plan = burstPlan(BURST);
    const t = 0.5 * (plan.tFirst + plan.tLast);
    const s = burstAt(BURST, t, plan);
    const p = parabolaAt(BURST, t);
    expect(Math.hypot(s.cm[0] - p[0], s.cm[1] - p[1])).toBeGreaterThan(1);
  });

  it('between the landings the centre of mass falls with g times the share of the mass still flying', () => {
    const plan = burstPlan(BURST);
    const t = 0.5 * (plan.tFirst + plan.tLast);
    const h = 1e-3;
    const y = (tt: number) => burstAt(BURST, tt, plan).cm[1];
    const a = (y(t + h) - 2 * y(t) + y(t - h)) / (h * h);
    expect(relativeError(a, cmAccelerationY(BURST, t, plan))).toBeLessThan(1e-5);
    expect(relativeError(cmAccelerationY(BURST, t, plan), -G / 2)).toBeLessThan(1e-15);
  });

  it('a person walking on a plank on frictionless water leaves the centre of mass where it was', () => {
    const m = 50;
    const M = 200;
    const L = 6;
    for (const s of [0, 1.7, 4.2, 6]) {
      const xp = plankCentre(m, M, L, s, 2.5);
      const person = xp - L / 2 + s;
      expect(relativeError((m * person + M * xp) / (m + M), 2.5)).toBeLessThan(1e-15);
    }
    // from one end to the other, the plank moves m L / (m + M) = 1.2 m backwards
    expect(relativeError(plankCentre(m, M, L, L) - plankCentre(m, M, L, 0), plankShift(m, M, L))).toBeLessThan(1e-15);
    expect(relativeError(plankShift(m, M, L), -1.2)).toBeLessThan(1e-15);
  });
});

describe('convergence', () => {
  /** The midpoint sum's error with n and 2n strips, and their ratio. */
  const ratio = (s: Shape, n: number) => {
    const ex = exactCM(s);
    return Math.abs(numericCM(s, n).coord - ex) / Math.abs(numericCM(s, 2 * n).coord - ex);
  };

  it('for the wire and the triangle the midpoint sum converges as 1/N²: doubling N quarters the error', () => {
    for (const s of [HALF_RING, TRIANGLE, ROD_LINEAR]) {
      for (const n of [8, 32]) expect(relativeError(ratio(s, n), 4)).toBeLessThan(0.02);
    }
  });

  it('the half-disc converges more slowly, as N^(−3/2): the strip width has an infinite slope at the top', () => {
    expect(relativeError(ratio(HALF_DISC, 64), 2 ** 1.5)).toBeLessThan(0.03);
    expect(relativeError(ratio(HALF_DISC, 256), 2 ** 1.5)).toBeLessThan(0.02);
  });

  it('the uniform rod is exact with any number of strips: its integrand is linear', () => {
    for (const n of [1, 2, 5]) expect(relativeError(numericCM(ROD_UNIFORM, n).coord, 0.75)).toBeLessThan(1e-15);
  });
});

describe('scaling', () => {
  it('the centre of mass of a body scales with its size: double the radius, double the height', () => {
    const big: Shape = { kind: 'half-disc', R: 1.2, sigma: 3 };
    expect(relativeError(exactCM(big), 2 * exactCM(HALF_DISC))).toBeLessThan(1e-15);
    expect(relativeError(numericCM(big, 500).coord, 2 * numericCM(HALF_DISC, 500).coord)).toBeLessThan(1e-14);
  });

  it('the centre of mass does not depend on the overall density, only on how the mass is spread', () => {
    const heavy: Shape = { kind: 'rod', L: 1.5, lamA: 0, lamB: 40 };
    expect(relativeError(numericCM(heavy, 100).coord, numericCM(ROD_LINEAR, 100).coord)).toBeLessThan(1e-14);
    expect(relativeError(numericCM({ ...TRIANGLE, sigma: 30 }, 100).coord, numericCM(TRIANGLE, 100).coord)).toBeLessThan(1e-14);
  });

  it('the centre of mass of point masses moves with the origin: shift every position, shift R_cm the same', () => {
    const ps = [{ m: 2, r: [1, 1] as [number, number] }, { m: 1, r: [5, 1] as [number, number] }, { m: 1, r: [3, 3] as [number, number] }];
    const [X, Y] = centerOfMass(ps);
    const [X2, Y2] = centerOfMass(ps.map((p) => ({ m: p.m, r: [p.r[0] - 4, p.r[1] + 7] as [number, number] })));
    expect(relativeError(X2, X - 4)).toBeLessThan(1e-15);
    expect(relativeError(Y2, Y + 7)).toBeLessThan(1e-15);
  });

  it('scaling every mass by the same factor leaves the centre of mass where it is', () => {
    const ps = [{ m: 2, r: [1, 1] as [number, number] }, { m: 1, r: [5, 1] as [number, number] }];
    expect(centerOfMass(ps.map((p) => ({ ...p, m: 10 * p.m })))).toEqual(centerOfMass(ps));
  });

  it('the plank moves in proportion to the walk, and less the heavier it is', () => {
    expect(relativeError(plankShift(50, 200, 3), plankShift(50, 200, 6) / 2)).toBeLessThan(1e-15);
    expect(Math.abs(plankShift(50, 400, 6))).toBeLessThan(Math.abs(plankShift(50, 200, 6)));
    // an infinitely heavy plank (a pier) does not move: the shift tends to zero as m/M
    expect(Math.abs(plankShift(50, 5e9, 6))).toBeLessThan(1e-7);
  });

  it('the landing points of a burst scale as v₀²/g when the separation speed scales as v₀', () => {
    const p1 = burstPlan(BURST);
    const p2 = burstPlan({ ...BURST, v0: 40, u: 20, tBurst: 2 * BURST.tBurst });
    expect(relativeError(p2.frags[0].xLand, 4 * p1.frags[0].xLand)).toBeLessThan(1e-13);
    expect(relativeError(p2.frags[1].xLand, 4 * p1.frags[1].xLand)).toBeLessThan(1e-13);
  });
});
