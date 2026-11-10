import { describe, expect, it } from 'vitest';
import {
  cmVelocity,
  collide,
  collideLab,
  energySplit,
  fromCM,
  inCMFrame,
  kineticEnergy,
  kineticEnergyInCM,
  positionsAt,
  reducedMass,
  shiftFrame,
  toCM,
  totalMomentum,
  type Pair,
} from '~/physics/cmframe';
import { relativeError } from '~/physics/vec';

/** The default state of figure 4.2: 1.0 kg at +4.0 m/s meets 1.5 kg at −1.0 m/s. */
const FIG: Pair = { m1: 1.0, v1: 4.0, m2: 1.5, v2: -1.0 };

/** A small deterministic generator, so a failure is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
/** Random approaching pairs: masses 0.1…10 kg, velocities −10…10 m/s with v₁ > v₂. */
function randomPairs(n: number, seed = 7): Pair[] {
  const r = rng(seed);
  const out: Pair[] = [];
  while (out.length < n) {
    const p = { m1: 0.1 + 9.9 * r(), v1: -10 + 20 * r(), m2: 0.1 + 9.9 * r(), v2: -10 + 20 * r() };
    if (p.v1 - p.v2 > 0.01) out.push(p);
  }
  return out;
}
/** A comparison scale for a quantity that may be zero: compare a − b against the size of the inputs. */
const close = (a: number, b: number, scale: number, tol = 1e-12) => expect(Math.abs(a - b) / scale).toBeLessThan(tol);

describe('analytic identities', () => {
  it('the total momentum in the centre-of-mass frame is zero: m₁u₁ = −m₂u₂ = μ v_rel', () => {
    for (const s of randomPairs(200)) {
      const { p1, p2 } = inCMFrame(s);
      const pScale = s.m1 * Math.abs(s.v1) + s.m2 * Math.abs(s.v2);
      close(p1 + p2, 0, pScale);
      expect(relativeError(p1, reducedMass(s.m1, s.m2) * (s.v1 - s.v2))).toBeLessThan(1e-12);
    }
  });

  it('K_lab = ½MV² + ½μv_rel², and ½μv_rel² is the kinetic energy measured in the centre-of-mass frame', () => {
    for (const s of randomPairs(200, 11)) {
      const k = energySplit(s);
      expect(relativeError(k.Kcm + k.Krel, k.K)).toBeLessThan(1e-12);
      expect(relativeError(kineticEnergyInCM(s), k.Krel)).toBeLessThan(1e-12);
    }
  });

  it('the collision solved in the centre-of-mass frame and moved back equals the direct laboratory solution, for any e', () => {
    for (const s of randomPairs(100, 23))
      for (const e of [0, 0.25, 0.5, 0.8, 1]) {
        const cm = collide(s, e);
        const lab = collideLab(s, e);
        const vScale = Math.abs(s.v1) + Math.abs(s.v2);
        close(cm.v1, lab.v1, vScale);
        close(cm.v2, lab.v2, vScale);
      }
  });

  it('into the centre-of-mass frame and back is the identity: (v − V) + V = v', () => {
    for (const v of [-7.5, 0, 3.25]) for (const V of [-2, 0, 1.5]) expect(fromCM(toCM(v, V), V)).toBe(v);
  });

  it('the figure state: V = 1.0 m/s, u = +3.0 and −2.0 m/s, μ = 0.6 kg, K = 8.75 J = 1.25 J + 7.5 J', () => {
    const { V, u1, u2, p1 } = inCMFrame(FIG);
    const k = energySplit(FIG);
    expect(relativeError(V, 1)).toBeLessThan(1e-15);
    expect(relativeError(u1, 3)).toBeLessThan(1e-15);
    expect(relativeError(u2, -2)).toBeLessThan(1e-15);
    expect(relativeError(p1, 3)).toBeLessThan(1e-15);
    expect(relativeError(k.mu, 0.6)).toBeLessThan(1e-15);
    expect(relativeError(k.K, 8.75)).toBeLessThan(1e-15);
    expect(relativeError(k.Kcm, 1.25)).toBeLessThan(1e-15);
    expect(relativeError(k.Krel, 7.5)).toBeLessThan(1e-15);
  });
});

describe('analytic limits', () => {
  it('elastic (e = 1): in the centre-of-mass frame every velocity reverses and keeps its size', () => {
    for (const s of randomPairs(50, 3)) {
      const o = collide(s, 1);
      expect(o.u1After).toBe(-o.u1);
      expect(o.u2After).toBe(-o.u2);
      close(o.lost, 0, kineticEnergy(s));
    }
  });

  it('perfectly inelastic (e = 0): both bodies stop in the centre-of-mass frame and move together at V in the lab', () => {
    for (const s of randomPairs(50, 5)) {
      const o = collide(s, 0);
      expect(Math.abs(o.u1After)).toBe(0);
      expect(Math.abs(o.u2After)).toBe(0);
      expect(o.v1).toBe(o.V);
      expect(o.v2).toBe(o.V);
      expect(relativeError(o.lost, energySplit(s).Krel)).toBeLessThan(1e-12);
    }
  });

  it('equal masses: V is the plain average, μ = m/2, and an elastic collision exchanges the velocities', () => {
    for (const s of randomPairs(50, 9).map((p) => ({ ...p, m2: p.m1 }))) {
      expect(relativeError(cmVelocity(s), (s.v1 + s.v2) / 2)).toBeLessThan(1e-12);
      expect(relativeError(reducedMass(s.m1, s.m2), s.m1 / 2)).toBeLessThan(1e-14);
      const o = collide(s, 1);
      const vScale = Math.abs(s.v1) + Math.abs(s.v2);
      close(o.v1, s.v2, vScale);
      close(o.v2, s.v1, vScale);
    }
  });

  it('m₂ → ∞: the centre-of-mass frame becomes the frame of body 2, μ → m₁, and body 1 bounces off a moving wall', () => {
    const s: Pair = { m1: 0.5, v1: 6, m2: 1, v2: -1.5 };
    for (const m2 of [1e3, 1e6, 1e9]) {
      const big = { ...s, m2 };
      // V − v₂ = m₁(v₁ − v₂)/M, of relative order m₁/m₂
      expect(Math.abs(cmVelocity(big) - s.v2) / Math.abs(s.v1 - s.v2)).toBeLessThan(2 * (s.m1 / m2));
      expect(relativeError(reducedMass(s.m1, m2), s.m1)).toBeLessThan(2 * (s.m1 / m2));
      const o = collide(big, 0.7);
      // the wall: v₁′ = v₂ − e (v₁ − v₂)
      expect(Math.abs(o.v1 - (s.v2 - 0.7 * (s.v1 - s.v2))) / Math.abs(s.v1 - s.v2)).toBeLessThan(4 * (s.m1 / m2));
    }
    const wall = collide({ ...s, m2: Infinity }, 0.7);
    expect(wall.V).toBe(s.v2);
    expect(wall.v2).toBe(s.v2);
    expect(relativeError(wall.v1, s.v2 - 0.7 * (s.v1 - s.v2))).toBeLessThan(1e-15);
    expect(collideLab({ ...s, m2: Infinity }, 0.7).v1).toBe(wall.v1);
  });

  it('an infinitely heavy body carries the centre of mass: x_cm is its position, the limit of large m₂', () => {
    const s: Pair = { m1: 0.5, v1: 6, m2: Infinity, v2: -1.5 };
    const w = { h1: 0.4, h2: 0.6 };
    for (const t of [-1, 0, 0.8]) {
      const at = positionsAt(s, 0.7, w, t);
      expect(Number.isFinite(at.xcm)).toBe(true);
      expect(at.xcm).toBe(at.x2);
      const big = positionsAt({ ...s, m2: 1e9 }, 0.7, w, t);
      expect(Math.abs(big.xcm - at.xcm)).toBeLessThan(1e-8);
    }
    expect(() => positionsAt({ ...s, m1: Infinity }, 0.7, w, 0)).toThrow(RangeError);
  });

  it('m₂ ≪ m₁: μ → m₂, so a heavy body hitting a light one has almost no energy available', () => {
    for (const m2 of [1e-3, 1e-6]) {
      expect(relativeError(reducedMass(2, m2), m2)).toBeLessThan(m2);
      const s: Pair = { m1: 2, v1: 5, m2, v2: 0 };
      expect(energySplit(s).Krel / kineticEnergy(s)).toBeLessThan(1.01 * (m2 / 2));
    }
  });

  it('bodies that do not approach (v_rel ≤ 0) do not collide: nothing changes and nothing is lost', () => {
    const o = collide({ m1: 1, v1: -1, m2: 2, v2: 3 }, 0.5);
    expect(o.collides).toBe(false);
    expect(o.v1).toBe(-1);
    expect(o.v2).toBe(3);
    expect(o.lost).toBe(0);
  });
});

describe('conservation', () => {
  it('momentum is conserved for every e; kinetic energy only for e = 1, and the loss is (1 − e²) ½μv_rel²', () => {
    for (const s of randomPairs(100, 31))
      for (const e of [0, 0.3, 0.6, 1]) {
        const o = collide(s, e);
        const after: Pair = { ...s, v1: o.v1, v2: o.v2 };
        const pScale = s.m1 * Math.abs(s.v1) + s.m2 * Math.abs(s.v2);
        close(totalMomentum(after), totalMomentum(s), pScale);
        const K0 = kineticEnergy(s);
        close(K0 - kineticEnergy(after), o.lost, K0, 1e-11);
        // the energy of the centre of mass is untouched; only the relative part changes, by e²
        close(energySplit(after).Kcm, energySplit(s).Kcm, K0);
        close(energySplit(after).Krel, e * e * energySplit(s).Krel, K0, 1e-11);
      }
  });

  it('the restitution rule holds in the lab too: v₂′ − v₁′ = e (v₁ − v₂)', () => {
    for (const s of randomPairs(50, 41)) {
      const o = collide(s, 0.45);
      expect(relativeError(o.v2 - o.v1, 0.45 * (s.v1 - s.v2))).toBeLessThan(1e-11);
    }
  });

  it('the centre of mass moves at V before, during and after the collision', () => {
    const w = { h1: 0.3, h2: 0.45 };
    for (const s of randomPairs(20, 51)) {
      const V = cmVelocity(s);
      const x0 = positionsAt(s, 0.6, w, 0).xcm;
      for (const t of [-1.2, -0.3, 0.2, 0.9, 2]) {
        const { xcm } = positionsAt(s, 0.6, w, t);
        close(xcm, x0 + V * t, 1 + Math.abs(V * t));
      }
    }
  });

  it('after the contact the bodies separate and never overlap again (v₂′ ≥ v₁′)', () => {
    const w = { h1: 0.3, h2: 0.45 };
    for (const s of randomPairs(50, 61))
      for (const e of [0, 0.5, 1]) {
        const { x1, x2 } = positionsAt(s, e, w, 1.5);
        expect(x2 - w.h2 - (x1 + w.h1)).toBeGreaterThanOrEqual(-1e-9);
      }
  });
});

describe('scaling', () => {
  it('Galilean invariance: the energy lost and ½μv_rel² are the same in every inertial frame; K and ½MV² are not', () => {
    for (const s of randomPairs(50, 71))
      for (const W of [-5, 2.5, 13]) {
        const t = shiftFrame(s, W);
        const K0 = kineticEnergy(s) + kineticEnergy(t);
        close(collide(t, 0.4).lost, collide(s, 0.4).lost, K0, 1e-11);
        close(energySplit(t).Krel, energySplit(s).Krel, K0, 1e-11);
        // the velocities after the collision shift by the same W: the collision is the same event
        close(collide(t, 0.4).v1, collide(s, 0.4).v1 - W, 1 + Math.abs(W), 1e-11);
      }
    const t = shiftFrame(FIG, -2);
    expect(Math.abs(kineticEnergy(t) - kineticEnergy(FIG))).toBeGreaterThan(1);
  });

  it('scaling every velocity by λ scales the energy loss by λ², and scaling both masses by λ scales it by λ', () => {
    for (const s of randomPairs(30, 81)) {
      const base = collide(s, 0.3).lost;
      expect(relativeError(collide({ ...s, v1: 3 * s.v1, v2: 3 * s.v2 }, 0.3).lost, 9 * base)).toBeLessThan(1e-11);
      expect(relativeError(collide({ ...s, m1: 4 * s.m1, m2: 4 * s.m2 }, 0.3).lost, 4 * base)).toBeLessThan(1e-11);
    }
  });

  it('the fraction of K that can be lost is largest (all of it) when the total momentum is zero', () => {
    for (const s of randomPairs(50, 91)) {
      const k = energySplit(s);
      expect(k.Krel / k.K).toBeLessThanOrEqual(1 + 1e-12);
      const zero = shiftFrame(s, cmVelocity(s));
      const kz = energySplit(zero);
      expect(relativeError(kz.Krel, kz.K)).toBeLessThan(1e-11);
    }
  });
});
