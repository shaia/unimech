import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  blowFree,
  blowPivoted,
  bodyIcm,
  conjugatePivot,
  ellOf,
  gyrationRadius,
  katerG,
  lineVelocity,
  maxPivot,
  minPeriod,
  periodAt,
  pivotInertia,
  smallPeriod,
  swingTable,
  thetaAt,
  type Body,
} from '~/physics/physpendulum';
import { equivalentLength, physicalPendulumPeriod, pivotImpulse } from '~/physics/rigidbody';
import { relativeError } from '~/physics/vec';

const ROD: Body = { kind: 'rod', m: 1.0, size: 1.2 };
const DISC: Body = { kind: 'disc', m: 1.0, size: 0.3 };

describe('analytic limits', () => {
  it('with k → 0 (all the mass at the CM) the equivalent length is d: the simple pendulum', () => {
    expect(relativeError(ellOf(1e-9, 0.7), 0.7)).toBeLessThan(1e-12);
    expect(relativeError(smallPeriod(1e-9, 0.7), 2 * Math.PI * Math.sqrt(0.7 / G))).toBeLessThan(1e-12);
  });

  it('a uniform rod hung at its end swings like a simple pendulum of 2L/3; a disc hung at its rim like one of 3R/2', () => {
    const kRod = gyrationRadius(ROD);
    expect(relativeError(ellOf(kRod, maxPivot(ROD)), (2 * ROD.size) / 3)).toBeLessThan(1e-14);
    const kDisc = gyrationRadius(DISC);
    expect(relativeError(ellOf(kDisc, maxPivot(DISC)), 1.5 * DISC.size)).toBeLessThan(1e-14);
  });

  it('ℓ = d + k²/d is the shared I_P/(m d), and the small-angle period is the shared 2π√(I_P/(m g d))', () => {
    for (const d of [0.05, 0.2, 0.35, 0.6]) {
      const Ip = pivotInertia(ROD, d);
      expect(relativeError(ellOf(gyrationRadius(ROD), d), equivalentLength(Ip, ROD.m, d))).toBeLessThan(1e-14);
      expect(relativeError(smallPeriod(gyrationRadius(ROD), d), physicalPendulumPeriod(Ip, ROD.m, d))).toBeLessThan(1e-14);
    }
  });

  it('the shortest small-angle period is at d = k, and it is 2π√(2k/g) (a scan of pivots finds no shorter one)', () => {
    const k = gyrationRadius(ROD);
    let best = Infinity;
    for (let i = 1; i <= 20000; i++) best = Math.min(best, smallPeriod(k, (i / 20000) * maxPivot(ROD)));
    expect(relativeError(best, minPeriod(k))).toBeLessThan(1e-7);
    expect(relativeError(minPeriod(k), 2 * Math.PI * Math.sqrt((2 * k) / G))).toBeLessThan(1e-14);
  });

  it('Huygens: the pivots at d and k²/d have the same period, and d + k²/d is the equivalent length', () => {
    const k = gyrationRadius(ROD);
    for (const d of [0.2, 0.3, 0.45]) {
      const d2 = conjugatePivot(k, d);
      expect(relativeError(smallPeriod(k, d2), smallPeriod(k, d))).toBeLessThan(1e-14);
      expect(relativeError(d + d2, ellOf(k, d))).toBeLessThan(1e-14);
    }
    // the figure's holes: 0.20 ↔ 0.60 and 0.30 ↔ 0.40 on a 1.20 m rod
    expect(relativeError(conjugatePivot(k, 0.2), 0.6)).toBeLessThan(1e-14);
    expect(relativeError(conjugatePivot(k, 0.3), 0.4)).toBeLessThan(1e-14);
  });

  it('a small release gives the small-angle period; a release at 90° is 1.18034 times longer (complete elliptic integral)', () => {
    const k = gyrationRadius(ROD);
    expect(relativeError(periodAt(k, 0.6, 1e-4), smallPeriod(k, 0.6))).toBeLessThan(1e-8);
    expect(relativeError(periodAt(k, 0.6, Math.PI / 2) / smallPeriod(k, 0.6), 1.1803406)).toBeLessThan(1e-6);
  });

  it('a blow at the centre of percussion b = ℓ leaves no impulse at the pivot; nearer the pivot the pivot pulls back, beyond it forward', () => {
    const k = gyrationRadius(ROD);
    for (const d of [0.2, 0.45, 0.6]) {
      const ell = ellOf(k, d);
      expect(Math.abs(blowPivoted(ROD, d, ell, 1).P)).toBeLessThan(1e-14);
      expect(blowPivoted(ROD, d, 0.5 * ell, 1).P).toBeLessThan(0);
      expect(blowPivoted(ROD, d, 1.1 * ell, 1).P).toBeGreaterThan(0);
    }
  });

  it('the axle impulse on the body is minus the shared pivotImpulse (that one is the reaction, along −P)', () => {
    for (const b of [0.1, 0.5, 0.8, 1.1]) {
      const r = blowPivoted(ROD, 0.6, b, 2.5);
      expect(relativeError(r.P, -pivotImpulse(2.5, b, pivotInertia(ROD, 0.6), ROD.m, 0.6))).toBeLessThan(1e-13);
    }
  });

  it('a rod hung at its end and struck at its middle: the pivot gives −J/4', () => {
    const r = blowPivoted(ROD, 0.6, 0.6, 3);
    expect(relativeError(r.P, -0.75)).toBeLessThan(1e-14);
  });

  it('a free body struck at its centre of percussion (about P) starts turning about P: P is the point at rest', () => {
    const k = gyrationRadius(ROD);
    const d = 0.45;
    const free = blowFree(ROD, d, ellOf(k, d), 1);
    expect(free.restFromPivot).not.toBeNull();
    if (free.restFromPivot !== null) expect(Math.abs(free.restFromPivot)).toBeLessThan(1e-14);
    expect(Math.abs(lineVelocity(free, d, 0))).toBeLessThan(1e-14);
    // a blow at the CM turns nothing: no point is at rest
    expect(blowFree(ROD, d, d, 1).restFromPivot).toBeNull();
  });
});

describe('conservation', () => {
  it('the integrated swing keeps its energy ½ℓθ̇² − g cos θ (per unit m ℓ) to 1e-9 over a period at 80°', () => {
    const ell = 0.8;
    const th0 = (80 * Math.PI) / 180;
    const tab = swingTable(ell, th0, 600, 4);
    const E = (i: number) => 0.5 * ell * tab.omega[i] ** 2 - G * Math.cos(tab.theta[i]);
    const E0 = E(0);
    for (let i = 0; i < tab.theta.length; i += 37) expect(Math.abs(E(i) - E0) / Math.abs(E0)).toBeLessThan(1e-9);
  });

  it('the angular impulse about the pivot of the blow, J b, equals I_P ω just after it; the momentum balance J + P = m v_cm', () => {
    const d = 0.3;
    const b = 0.9;
    const r = blowPivoted(DISC, d, b, 1.7);
    expect(relativeError(pivotInertia(DISC, d) * r.omega, 1.7 * b)).toBeLessThan(1e-14);
    expect(relativeError(1.7 + r.P, DISC.m * r.vcm)).toBeLessThan(1e-14);
  });
});

describe('scaling', () => {
  it('the period does not depend on the mass, and grows as √size for the same shape and the same d/size', () => {
    const big: Body = { kind: 'rod', m: 7, size: 4.8 };
    const k1 = gyrationRadius(ROD);
    const k4 = gyrationRadius(big);
    expect(relativeError(smallPeriod(k4, 4 * 0.3), 2 * smallPeriod(k1, 0.3))).toBeLessThan(1e-14);
    expect(relativeError(bodyIcm(big) / big.m, 16 * (bodyIcm(ROD) / ROD.m))).toBeLessThan(1e-14);
  });

  it('the pivot impulse is proportional to the blow', () => {
    const a = blowPivoted(ROD, 0.6, 0.3, 1).P;
    expect(relativeError(blowPivoted(ROD, 0.6, 0.3, 3.5).P, 3.5 * a)).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('the RK4 swing returns to θ₀ after its exact period, and the error falls about 16× when the step halves', () => {
    const ell = 0.8;
    const th0 = (60 * Math.PI) / 180;
    const err = (n: number) => Math.abs(swingTable(ell, th0, n, 1).theta[n] - th0);
    const e1 = err(60);
    const e2 = err(120);
    expect(e1).toBeLessThan(1e-4);
    expect(e2).toBeLessThan(e1 / 8);
  });

  it('Kater: two pivots with the same period, a distance D apart, give back g = 4π²D/T²', () => {
    const k = gyrationRadius(ROD);
    const d = 0.25;
    const D = d + conjugatePivot(k, d);
    expect(relativeError(katerG(D, smallPeriod(k, d)), G)).toBeLessThan(1e-14);
  });

  it('θ(t) read from the table matches the exact small-angle cosine for a 1° release', () => {
    const ell = 0.8;
    const th0 = Math.PI / 180;
    const tab = swingTable(ell, th0, 480, 4);
    const w = Math.sqrt(G / ell);
    for (const t of [0.1, 0.37, 1.2, 2.9]) expect(Math.abs(thetaAt(tab, t) - th0 * Math.cos(w * t))).toBeLessThan(1e-3 * th0);
  });
});
