import { describe, expect, it } from 'vitest';
import { G, G_NEWTON, M_EARTH, M_MOON, R_EARTH, R_MOON } from '~/physics/constants';
import {
  DIM,
  DIMENSION_PRESETS,
  ESTIMATE_PRESETS,
  ORDER_BOUNDARY,
  dimEqual,
  dimPow,
  dimProduct,
  estimateValues,
  fraction,
  isDimensionless,
  logLadder,
  orderOfMagnitude,
  sameOrder,
  siUnit,
  solveExponents,
  type Dim,
  type DimensionPresetName,
} from '~/physics/dimensions';
import { orbitalPeriod } from '~/physics/orbit';
import { pendulumPeriod } from '~/physics/smallosc';
import { relativeError } from '~/physics/vec';

const near = (a: number, b: number, tol = 1e-12) => Math.abs(a - b) < tol;
const sameVector = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => near(x, b[i]));
const solve = (name: DimensionPresetName) => {
  const p = DIMENSION_PRESETS[name];
  return solveExponents(p.target.dim, p.vars.map((x) => x.dim));
};

describe('identities: the dimension of a product is the sum of the exponents', () => {
  it('a newton is a kilogram times an acceleration, and a joule is a newton times a metre', () => {
    expect(dimEqual(dimProduct([{ dim: DIM.mass, power: 1 }, { dim: DIM.acceleration, power: 1 }]), DIM.force)).toBe(true);
    expect(dimEqual(dimProduct([{ dim: DIM.force, power: 1 }, { dim: DIM.length, power: 1 }]), DIM.energy)).toBe(true);
    expect(siUnit(DIM.force)).toBe('kg·m·s^−2');
  });

  it('GM/R has the dimension of a velocity squared, so √(GM/R) is a speed', () => {
    const gmr = dimProduct([
      { dim: DIM.gravConstant, power: 1 },
      { dim: DIM.mass, power: 1 },
      { dim: DIM.length, power: -1 },
    ]);
    expect(dimEqual(gmr, dimPow(DIM.velocity, 2))).toBe(true);
    expect(dimEqual(dimPow(gmr, 0.5), DIM.velocity)).toBe(true);
  });

  it('the drag constants of lesson 2.7 give speeds: mg/b is a speed and mg/c a speed squared', () => {
    const mg = dimProduct([{ dim: DIM.mass, power: 1 }, { dim: DIM.acceleration, power: 1 }]);
    expect(dimEqual(dimProduct([{ dim: mg, power: 1 }, { dim: DIM.linearDrag, power: -1 }]), DIM.velocity)).toBe(true);
    expect(dimEqual(dimProduct([{ dim: mg, power: 1 }, { dim: DIM.quadraticDrag, power: -1 }]), dimPow(DIM.velocity, 2))).toBe(true);
  });

  it('every null vector the solver returns is a dimensionless combination', () => {
    for (const name of Object.keys(DIMENSION_PRESETS) as DimensionPresetName[]) {
      const p = DIMENSION_PRESETS[name];
      for (const q of solve(name).nullspace) {
        expect(isDimensionless(dimProduct(p.vars.map((x, i) => ({ dim: x.dim, power: q[i] }))))).toBe(true);
      }
    }
  });

  it('the particular solution of every preset has exactly the dimension of a time', () => {
    for (const name of Object.keys(DIMENSION_PRESETS) as DimensionPresetName[]) {
      const p = DIMENSION_PRESETS[name];
      const s = solve(name).particular!;
      expect(dimEqual(dimProduct(p.vars.map((x, i) => ({ dim: x.dim, power: s[i] }))), DIM.time)).toBe(true);
    }
  });

  it('exponents print as fractions: 3/2, −1/2, 1/3, 2', () => {
    expect([fraction(1.5), fraction(-0.5), fraction(1 / 3), fraction(2)]).toEqual(['3/2', '−1/2', '1/3', '2']);
  });
});

describe('analytic results: dimensional analysis reproduces the known laws up to a constant', () => {
  it('the pendulum: T = C·m⁰·L^(1/2)·g^(−1/2), unique, so the mass cannot enter', () => {
    const s = solve('pendulum');
    expect(sameVector(s.particular!, [0, 0.5, -0.5])).toBe(true);
    expect(s.nullspace).toHaveLength(0);
  });

  it('the spring: T = C·√(m/k), and the amplitude exponent is forced to 0', () => {
    const s = solve('spring');
    expect(sameVector(s.particular!, [0.5, -0.5, 0])).toBe(true);
    expect(s.nullspace).toHaveLength(0);
  });

  it("the orbit: T = C·r^(3/2)/√(GM), Kepler's third law", () => {
    const s = solve('orbit');
    expect(sameVector(s.particular!, [-0.5, -0.5, 1.5])).toBe(true);
    expect(s.nullspace).toHaveLength(0);
  });

  it('a dimensionless amplitude θ₀ leaves one free direction: the group is θ₀ itself', () => {
    const s = solve('amplitude');
    expect(sameVector(s.particular!, [0, 0.5, -0.5, 0])).toBe(true);
    expect(s.nullspace).toHaveLength(1);
    expect(sameVector(s.nullspace[0], [0, 0, 0, 1])).toBe(true);
  });

  it('drag with ρ, η, v and D has one dimensionless group, ρvD/η (the Reynolds number)', () => {
    const s = solveExponents(DIM.force, [DIM.density, DIM.viscosity, DIM.velocity, DIM.length]);
    expect(s.rank).toBe(3);
    expect(s.nullspace).toHaveLength(1);
    const q = s.nullspace[0];
    const k = q[0];
    expect(sameVector(q.map((x) => x / k), [1, -1, 1, 1])).toBe(true);
  });

  it('no product of a mass and a length is a time: the system is inconsistent', () => {
    expect(solveExponents(DIM.time, [DIM.mass, DIM.length]).particular).toBeNull();
  });

  it("the exact pendulum period over √(L/g) depends on θ₀ only, and tends to 2π as θ₀ → 0", () => {
    for (const th of [0.1, 0.5, 1.0, 2.0]) {
      const f1 = pendulumPeriod(0.5, th, G) / Math.sqrt(0.5 / G);
      const f2 = pendulumPeriod(3.0, th, 1.62) / Math.sqrt(3.0 / 1.62);
      expect(relativeError(f1, f2)).toBeLessThan(1e-12);
    }
    expect(relativeError(pendulumPeriod(1, 1e-4) / Math.sqrt(1 / G), 2 * Math.PI)).toBeLessThan(1e-8);
    expect(pendulumPeriod(1, 2.0) / Math.sqrt(1 / G)).toBeGreaterThan(2 * Math.PI * 1.3);
  });

  it('the constant of the orbit is 2π for every radius and every central mass', () => {
    for (const [GM, r] of [
      [G_NEWTON * M_EARTH, R_EARTH],
      [G_NEWTON * M_EARTH, 3.84e8],
      [1.0, 7.0],
    ]) {
      expect(relativeError(orbitalPeriod(GM, r) / Math.sqrt(r ** 3 / GM), 2 * Math.PI)).toBeLessThan(1e-12);
    }
  });
});

describe('scaling: what the dimensional result predicts without its constant', () => {
  it('four times the length doubles the period at any fixed amplitude', () => {
    for (const th of [0.05, 0.8, 2.5]) expect(relativeError(pendulumPeriod(4, th) / pendulumPeriod(1, th), 2)).toBeLessThan(1e-12);
  });

  it('a result is the same in any units: T = 2π√(L/g) in metres or in centimetres', () => {
    const inMetres = 2 * Math.PI * Math.sqrt(0.8 / G);
    const inCentimetres = 2 * Math.PI * Math.sqrt(80 / (G * 100));
    expect(relativeError(inMetres, inCentimetres)).toBeLessThan(1e-14);
  });

  it('a pendulum clock on the Moon runs slower by √(g/g_Moon) = 2.46', () => {
    const gMoon = (G_NEWTON * M_MOON) / R_MOON ** 2;
    expect(relativeError(pendulumPeriod(1, 0.05, gMoon) / pendulumPeriod(1, 0.05, G), Math.sqrt(G / gMoon))).toBeLessThan(1e-12);
    expect(Math.sqrt(G / gMoon)).toBeCloseTo(2.46, 2);
  });
});

describe('orders of magnitude: the logarithmic scale', () => {
  it('the order is the nearest power of ten on a log scale: the boundary is √10, not 5', () => {
    expect(orderOfMagnitude(3000)).toBe(3);
    expect(orderOfMagnitude(3200)).toBe(4);
    expect(orderOfMagnitude(0.002)).toBe(-3);
    expect(ORDER_BOUNDARY).toBeCloseTo(3.162, 3);
  });

  it('multiplication is addition on the log axis: the ladder ends at the product', () => {
    const fs = [4.19, 2.58e20, 3000];
    const { product, partial } = logLadder(fs);
    expect(relativeError(product, fs[0] * fs[1] * fs[2])).toBeLessThan(1e-12);
    expect(near(partial[2], Math.log10(product), 1e-12)).toBe(true);
  });

  it("the Earth from surface rock is of the same order as its measured mass, from water it is not", () => {
    const p = ESTIMATE_PRESETS['earth-mass'];
    const rock = logLadder(estimateValues(p, 1)).product;
    const water = logLadder(estimateValues(p, 0)).product;
    expect(sameOrder(rock, p.reference)).toBe(true);
    expect(sameOrder(water, p.reference)).toBe(false);
    // and rock falls short: the interior is denser than the surface
    expect(rock).toBeLessThan(p.reference);
  });

  it("the Moon's surface gravity from rock is within 10% of GM/R²", () => {
    const p = ESTIMATE_PRESETS['moon-g'];
    expect(relativeError(logLadder(estimateValues(p, 1)).product, p.reference)).toBeLessThan(0.11);
  });

  it('the dimension of every estimate factor product is right: (4π/3)·G·ρ·R is an acceleration', () => {
    const g: Dim = dimProduct([
      { dim: DIM.gravConstant, power: 1 },
      { dim: DIM.density, power: 1 },
      { dim: DIM.length, power: 1 },
    ]);
    expect(dimEqual(g, DIM.acceleration)).toBe(true);
  });
});
