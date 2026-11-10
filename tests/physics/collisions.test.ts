import { describe, expect, it } from 'vitest';
import {
  approaching,
  bounceHeight,
  cmVelocity,
  collide,
  elastic,
  elasticTransferFraction,
  kineticEnergyLoss,
  momentum,
  perfectlyInelastic,
  reducedMass,
  restitution,
  restitutionFromHeights,
  totalKineticEnergy,
} from '~/physics/collisions';
import { relativeError } from '~/physics/vec';

/** A spread of pairs: equal masses, heavy on light, light on heavy, head-on and overtaking, with signs mixed. */
const CASES: [number, number, number, number][] = [
  [1, 1, 2, 0],
  [3, 1, 2, 0],
  [1, 3, 2, 0],
  [0.3, 0.5, 0.8, -0.4],
  [30000, 20000, 2, 1],
  [1.7, 0.2, -1, -3.5],
];
const ES = [0, 0.25, 0.5, 0.7, 0.9, 1];

describe('analytic limits', () => {
  it('e = 1 is the elastic collision: the general formula equals the elastic solution', () => {
    for (const [m1, m2, v1, v2] of CASES) {
      const g = collide(m1, m2, v1, v2, 1);
      const el = elastic(m1, m2, v1, v2);
      expect(relativeError(g.v1, el.v1)).toBeLessThan(1e-12);
      expect(relativeError(g.v2, el.v2)).toBeLessThan(1e-12);
    }
  });

  it('e = 0 is the perfectly inelastic collision: both bodies leave with the velocity of the centre of mass', () => {
    for (const [m1, m2, v1, v2] of CASES) {
      const a = collide(m1, m2, v1, v2, 0);
      const V = perfectlyInelastic(m1, m2, v1, v2);
      expect(relativeError(a.v1, V)).toBeLessThan(1e-12);
      expect(relativeError(a.v2, V)).toBeLessThan(1e-12);
      expect(relativeError(V, (m1 * v1 + m2 * v2) / (m1 + m2))).toBeLessThan(1e-15);
    }
  });

  it('equal masses in an elastic collision exchange velocities', () => {
    for (const [v1, v2] of [
      [2, 0],
      [3, -1],
      [-0.5, -2],
    ]) {
      const a = elastic(1.3, 1.3, v1, v2);
      expect(relativeError(a.v1, v2)).toBeLessThan(1e-12);
      expect(relativeError(a.v2, v1)).toBeLessThan(1e-12);
    }
  });

  it('a body hitting a much heavier one at rest comes back with e times its speed: v₁′ → −e v₁ as m₂ → ∞', () => {
    for (const e of ES) {
      // the exact wall
      expect(relativeError(collide(1, Infinity, 2, 0, e).v1, -e * 2)).toBeLessThan(1e-15);
      // finite masses converge to it, with an error of order m₁/m₂
      for (const m2 of [1e3, 1e6, 1e9]) {
        const a = collide(1, m2, 2, 0, e);
        expect(Math.abs(a.v1 + e * 2)).toBeLessThan((10 * 2) / m2);
      }
    }
  });

  it('an elastic body much heavier than a target at rest gives the target twice its own velocity', () => {
    for (const m1 of [1e3, 1e6]) expect(relativeError(elastic(m1, 1, 3, 0).v2, 6)).toBeLessThan(2 / m1);
  });

  it('a wall moving at v₂ returns an elastic ball at v₂ − (v₁ − v₂): the speed relative to the wall is kept', () => {
    const a = collide(1, Infinity, 10, -4, 1);
    expect(relativeError(a.v1, -18)).toBeLessThan(1e-15);
    expect(a.v2).toBe(-4);
  });

  it('the lesson figure presets: exchange, 3:1 heavy on light, 1:3 light on heavy, sticking', () => {
    expect(elastic(1, 1, 2, 0)).toEqual({ v1: 0, v2: 2 });
    const hl = elastic(3, 1, 2, 0);
    expect(relativeError(hl.v1, 1)).toBeLessThan(1e-15);
    expect(relativeError(hl.v2, 3)).toBeLessThan(1e-15);
    const lh = elastic(1, 3, 2, 0);
    expect(relativeError(lh.v1, -1)).toBeLessThan(1e-15);
    expect(relativeError(lh.v2, 1)).toBeLessThan(1e-15);
    expect(perfectlyInelastic(1, 1, 2, 0)).toBe(1);
  });

  it('the energy handed to a target at rest in an elastic collision is all of it only for equal masses', () => {
    expect(elasticTransferFraction(1, 1)).toBe(1);
    expect(relativeError(elasticTransferFraction(1, 12), 48 / 169)).toBeLessThan(1e-15);
    expect(elasticTransferFraction(1, 1e9)).toBeLessThan(1e-8);
  });

  it('a ball on a heavy floor: each bounce multiplies the height by e², and e = √(h₁/h₀)', () => {
    expect(relativeError(restitutionFromHeights(2, 1.28), 0.8)).toBeLessThan(1e-15);
    expect(relativeError(bounceHeight(2, 0.8, 3), 2 * 0.64 ** 3)).toBeLessThan(1e-14);
    expect(bounceHeight(2, 1, 5)).toBe(2);
    expect(bounceHeight(2, 0, 1)).toBe(0);
  });
});

describe('conservation', () => {
  it('momentum is conserved in every collision, whatever e', () => {
    for (const [m1, m2, v1, v2] of CASES)
      for (const e of ES) {
        const a = collide(m1, m2, v1, v2, e);
        expect(relativeError(momentum(m1, m2, a.v1, a.v2), momentum(m1, m2, v1, v2))).toBeLessThan(1e-12);
      }
  });

  it('kinetic energy is conserved if and only if e = 1', () => {
    for (const [m1, m2, v1, v2] of CASES) {
      const K = totalKineticEnergy(m1, m2, v1, v2);
      for (const e of ES) {
        const a = collide(m1, m2, v1, v2, e);
        const Kf = totalKineticEnergy(m1, m2, a.v1, a.v2);
        if (e === 1) expect(relativeError(Kf, K)).toBeLessThan(1e-12);
        else expect(Kf).toBeLessThan(K * (1 - 1e-6));
      }
    }
  });

  it('the kinetic energy lost equals ½ μ (v₁ − v₂)² (1 − e²)', () => {
    for (const [m1, m2, v1, v2] of CASES)
      for (const e of ES.filter((x) => x < 1)) {
        const a = collide(m1, m2, v1, v2, e);
        const lost = totalKineticEnergy(m1, m2, v1, v2) - totalKineticEnergy(m1, m2, a.v1, a.v2);
        expect(relativeError(kineticEnergyLoss(m1, m2, v1, v2, e), lost)).toBeLessThan(1e-9);
        expect(relativeError(reducedMass(m1, m2), (m1 * m2) / (m1 + m2))).toBeLessThan(1e-15);
      }
  });

  it('the velocity of the centre of mass is the same before and after', () => {
    for (const [m1, m2, v1, v2] of CASES)
      for (const e of ES) {
        const a = collide(m1, m2, v1, v2, e);
        expect(relativeError(cmVelocity(m1, m2, a.v1, a.v2), cmVelocity(m1, m2, v1, v2))).toBeLessThan(1e-12);
      }
  });

  it('a perfectly inelastic collision with equal masses, one at rest, loses half the kinetic energy', () => {
    expect(relativeError(kineticEnergyLoss(1, 1, 2, 0, 0), 0.5 * totalKineticEnergy(1, 1, 2, 0))).toBeLessThan(1e-15);
  });
});

describe('relative velocity', () => {
  it('the relative velocity reverses and shrinks by e: v₂′ − v₁′ = −e (v₂ − v₁)', () => {
    for (const [m1, m2, v1, v2] of CASES)
      for (const e of ES) {
        const a = collide(m1, m2, v1, v2, e);
        expect(Math.abs(a.v2 - a.v1 + e * (v2 - v1))).toBeLessThan(1e-12 * Math.abs(v2 - v1) + 1e-15);
        expect(Math.abs(restitution(v1, v2, a) - e)).toBeLessThan(1e-12);
      }
  });

  it('the bodies meet only when they approach (body 1 on the left faster than body 2)', () => {
    expect(approaching(2, 0)).toBe(true);
    expect(approaching(1, 1)).toBe(false);
    expect(approaching(-1, 0.5)).toBe(false);
  });

  it('e outside [0, 1] is refused', () => {
    expect(() => collide(1, 1, 1, 0, 1.2)).toThrow(RangeError);
    expect(() => collide(1, 1, 1, 0, -0.1)).toThrow(RangeError);
  });
});

describe('scaling', () => {
  it('multiplying every velocity by λ scales the velocities after by λ and the energies by λ²', () => {
    for (const [m1, m2, v1, v2] of CASES)
      for (const e of [0, 0.6, 1])
        for (const lam of [0.1, 3, -2]) {
          const a = collide(m1, m2, v1, v2, e);
          const b = collide(m1, m2, lam * v1, lam * v2, e);
          expect(relativeError(b.v1, lam * a.v1)).toBeLessThan(1e-12);
          expect(relativeError(b.v2, lam * a.v2)).toBeLessThan(1e-12);
          const loss = kineticEnergyLoss(m1, m2, v1, v2, e);
          expect(relativeError(kineticEnergyLoss(m1, m2, lam * v1, lam * v2, e), lam * lam * loss)).toBeLessThan(1e-12);
          expect(relativeError(totalKineticEnergy(m1, m2, b.v1, b.v2), lam * lam * totalKineticEnergy(m1, m2, a.v1, a.v2))).toBeLessThan(1e-12);
        }
  });

  it('multiplying both masses by k leaves the velocities after unchanged (only the mass ratio matters)', () => {
    for (const [m1, m2, v1, v2] of CASES) {
      const a = collide(m1, m2, v1, v2, 0.5);
      const b = collide(7 * m1, 7 * m2, v1, v2, 0.5);
      expect(relativeError(b.v1, a.v1)).toBeLessThan(1e-12);
      expect(relativeError(b.v2, a.v2)).toBeLessThan(1e-12);
    }
  });

  it('a Galilean boost by w adds w to every velocity after, and leaves the energy lost unchanged', () => {
    for (const [m1, m2, v1, v2] of CASES) {
      const a = collide(m1, m2, v1, v2, 0.7);
      const b = collide(m1, m2, v1 + 1.5, v2 + 1.5, 0.7);
      expect(Math.abs(b.v1 - a.v1 - 1.5)).toBeLessThan(1e-12 * (1 + Math.abs(a.v1)) + 1e-12);
      expect(Math.abs(b.v2 - a.v2 - 1.5)).toBeLessThan(1e-12 * (1 + Math.abs(a.v2)) + 1e-12);
      expect(relativeError(kineticEnergyLoss(m1, m2, v1 + 1.5, v2 + 1.5, 0.7), kineticEnergyLoss(m1, m2, v1, v2, 0.7))).toBeLessThan(1e-12);
    }
  });
});
