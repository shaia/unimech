import { describe, expect, it } from 'vitest';
import {
  axisTilt,
  coneRegion,
  diagramInterval,
  hyperbolaPoint,
  orderInFrame,
  paperLength,
  primedSeparation,
  primedUnitOnPaper,
  readByParallels,
  reversalBeta,
  unitHyperbolaCt,
} from '~/physics/minkowski';
import { fromPrimedDiagram, gammaOf, primedAxes, toPrimedDiagram } from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const BETAS = [-0.9, -0.6, -0.25, 0.1, 0.4, 0.75, 0.95];

describe('analytic limits', () => {
  it('at β = 0 the primed axes are the axes of S: no tilt, one unit is one unit on paper', () => {
    expect(axisTilt(0)).toBe(0);
    expect(primedUnitOnPaper(0)).toBe(1);
    const r = readByParallels(2.5, -1.5, 0);
    expect(r.xPrime).toBeCloseTo(2.5, 12);
    expect(r.ctPrime).toBeCloseTo(-1.5, 12);
  });

  it('as β → 1 both primed axes close onto the light line and their unit on paper grows without bound', () => {
    expect(relativeError(axisTilt(0.999999), Math.PI / 4)).toBeLessThan(1e-6);
    expect(primedUnitOnPaper(0.999)).toBeGreaterThan(30);
  });

  it('at β = 0.75 the axes tilt by atan 0.75 = 36.87° and one primed unit is γ·1.25 = 1.890 on paper', () => {
    expect(relativeError((axisTilt(0.75) * 180) / Math.PI, 36.8699)).toBeLessThan(1e-5);
    expect(relativeError(primedUnitOnPaper(0.75), 1.25 / Math.sqrt(1 - 0.5625))).toBeLessThan(1e-12);
  });

  it('the light line bisects the primed axes: an event on x = ct has x′ = ct′ for every β', () => {
    for (const b of BETAS) {
      const [xp, ctp] = toPrimedDiagram(3, 3, b);
      expect(relativeError(xp, ctp)).toBeLessThan(1e-12);
    }
  });

  it('a timelike pair keeps its time order in every frame; a spacelike pair reverses above β = cΔt/Δx', () => {
    for (const b of BETAS) expect(orderInFrame(5, 2, b)).toBe(1); // inside the future cone
    expect(reversalBeta(5, 2)).toBeNull();
    expect(reversalBeta(3, 3)).toBeNull(); // lightlike
    expect(reversalBeta(2, 5)).toBeCloseTo(0.4, 15);
    expect(orderInFrame(2, 5, 0.39)).toBe(1);
    expect(orderInFrame(2, 5, 0.4)).toBe(0);
    expect(orderInFrame(2, 5, 0.41)).toBe(-1);
    expect(orderInFrame(2, -5, 0.41)).toBe(1); // a frame moving away from B only delays it more
  });

  it('the light cone sorts events into future, past, on the cone, and elsewhere', () => {
    const a: [number, number] = [1, 1];
    expect(coneRegion(a, [1, 1])).toBe('same');
    expect(coneRegion(a, [2, 4])).toBe('future');
    expect(coneRegion(a, [0, -2])).toBe('past');
    expect(coneRegion(a, [4, 4])).toBe('future-light');
    expect(coneRegion(a, [-1, -1])).toBe('past-light');
    expect(coneRegion(a, [5, 2])).toBe('elsewhere');
  });
});

describe('conservation (invariants of the boost)', () => {
  it('the interval between two events is the same in S and in every S′', () => {
    const a: [number, number] = [-1.5, 0.5];
    const b: [number, number] = [2, 4.5];
    const s2 = diagramInterval(a, b);
    for (const v of BETAS) {
      const [dxp, dctp] = primedSeparation(a, b, v);
      expect(relativeError(dctp * dctp - dxp * dxp, s2)).toBeLessThan(1e-12);
    }
  });

  it('the Euclidean "length" (cΔt)² + Δx² is not invariant: it changes with β', () => {
    const [xp, ctp] = toPrimedDiagram(2, 5, 0.4);
    expect(relativeError(xp * xp + ctp * ctp, 2 * 2 + 5 * 5)).toBeGreaterThan(0.1);
  });

  it('the unit events of every primed axis lie on the calibration hyperbolae (ct)² − x² = ±1', () => {
    for (const b of BETAS) {
      const { ctUnit, xUnit } = primedAxes(b);
      expect(relativeError(ctUnit[1] ** 2 - ctUnit[0] ** 2, 1)).toBeLessThan(1e-12);
      expect(relativeError(xUnit[1] ** 2 - xUnit[0] ** 2, -1)).toBeLessThan(1e-12);
      expect(relativeError(paperLength([0, 0], ctUnit), primedUnitOnPaper(b))).toBeLessThan(1e-12);
      expect(relativeError(unitHyperbolaCt(ctUnit[0]), ctUnit[1])).toBeLessThan(1e-12);
    }
  });

  it('hyperbola points of rapidity φ are the unit events of the frame with β = tanh φ, scaled by √|s²|', () => {
    for (const phi of [-1.2, -0.3, 0.5, 1.4]) {
      const b = Math.tanh(phi);
      const [x, ct] = hyperbolaPoint(9, phi);
      expect(relativeError(ct * ct - x * x, 9)).toBeLessThan(1e-12);
      const [xp, ctp] = toPrimedDiagram(x, ct, b);
      expect(Math.abs(xp)).toBeLessThan(1e-12);
      expect(relativeError(ctp, 3)).toBeLessThan(1e-12);
      const [x2, ct2] = hyperbolaPoint(-4, phi);
      expect(relativeError(ct2 * ct2 - x2 * x2, -4)).toBeLessThan(1e-12);
    }
    expect(() => hyperbolaPoint(0, 0.3)).toThrow(RangeError);
  });
});

describe('scaling', () => {
  it('the paper length of a primed unit grows as γ√(1 + β²), the same for both primed axes', () => {
    for (const b of BETAS) {
      const g = gammaOf(b);
      const { ctUnit, xUnit } = primedAxes(b);
      expect(relativeError(Math.hypot(...ctUnit), g * Math.sqrt(1 + b * b))).toBeLessThan(1e-12);
      expect(relativeError(Math.hypot(...xUnit), Math.hypot(...ctUnit))).toBeLessThan(1e-12);
    }
  });

  it('primed coordinates scale linearly with the event: doubling (x, ct) doubles (x′, ct′)', () => {
    const [x1, t1] = toPrimedDiagram(1.5, 2.5, 0.6);
    const [x2, t2] = toPrimedDiagram(3, 5, 0.6);
    expect(relativeError(x2, 2 * x1)).toBeLessThan(1e-12);
    expect(relativeError(t2, 2 * t1)).toBeLessThan(1e-12);
  });
});

describe('convergence (the graphical construction agrees with the transformation)', () => {
  it('reading x′ and ct′ with lines parallel to the primed axes gives the Lorentz transformation', () => {
    const events: [number, number][] = [
      [4.5, 6],
      [4, 2],
      [-2, 1],
      [3, -1.5],
      [0.5, 0.25],
    ];
    for (const b of BETAS)
      for (const [x, ct] of events) {
        const r = readByParallels(x, ct, b);
        const [xp, ctp] = toPrimedDiagram(x, ct, b);
        expect(Math.abs(r.xPrime - xp)).toBeLessThan(1e-12 * (1 + Math.abs(xp)));
        expect(Math.abs(r.ctPrime - ctp)).toBeLessThan(1e-12 * (1 + Math.abs(ctp)));
        // and the two feet add up to the event (oblique coordinates)
        expect(Math.abs(r.ctFoot[0] + r.xFoot[0] - x)).toBeLessThan(1e-12);
        expect(Math.abs(r.ctFoot[1] + r.xFoot[1] - ct)).toBeLessThan(1e-12);
        const [bx, bct] = fromPrimedDiagram(xp, ctp, b);
        expect(Math.abs(bx - x) + Math.abs(bct - ct)).toBeLessThan(1e-12);
      }
  });

  it('an event on the ct′ axis at β = 0.75, (4.5, 6), reads ct′ = √(36 − 20.25) = 3.97 = its paper length / 1.890', () => {
    const r = readByParallels(4.5, 6, 0.75);
    expect(Math.abs(r.xPrime)).toBeLessThan(1e-12);
    expect(relativeError(r.ctPrime, Math.sqrt(36 - 20.25))).toBeLessThan(1e-12);
    expect(relativeError(paperLength([0, 0], [4.5, 6]) / primedUnitOnPaper(0.75), r.ctPrime)).toBeLessThan(1e-12);
  });
});
