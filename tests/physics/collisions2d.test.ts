import { describe, expect, it } from 'vitest';
import {
  cmDeflection,
  contactNormal,
  elasticSpeedsAtAngle,
  headOn1D,
  kinetic,
  massRatioFromAngles,
  maxScatteringAngleScan,
  scatter,
  separationAngle,
  smoothImpact,
  stickTogether,
  thetaMaxElastic,
  type ScatterSetup,
} from '~/physics/collisions2d';
import { add, dot, len, relativeError, scale, sub, type Vec2 } from '~/physics/vec';

const D = 0.1;
const base = (o: Partial<ScatterSetup>): ScatterSetup => ({ m1: 0.15, m2: 0.25, v: 1.5, b: 0.04, R1: D / 2, R2: D / 2, e: 1, ...o });
const momentum = (m1: number, v1: Vec2, m2: number, v2: Vec2): Vec2 => add(scale(v1, m1), scale(v2, m2));
const DEG = Math.PI / 180;

describe('conservation', () => {
  it('both momentum components are conserved in every contact, for every e and every geometry', () => {
    const cases: [number, Vec2, number, Vec2, number, number][] = [
      [0.15, [1.5, 0], 0.25, [0, 0], 0.4, 1],
      [2, [3, -1], 0.5, [-1, 2], -1.1, 0.6],
      [0.3, [0, 2], 0.3, [1, -1], 2.2, 0],
    ];
    for (const [m1, v1, m2, v2, ang, e] of cases) {
      const n: Vec2 = [Math.cos(ang), Math.sin(ang)];
      const r = smoothImpact(m1, v1, m2, v2, n, e);
      const P0 = momentum(m1, v1, m2, v2);
      const P1 = momentum(m1, r.v1, m2, r.v2);
      expect(Math.abs(P1[0] - P0[0])).toBeLessThan(1e-14 * (len(P0) + 1));
      expect(Math.abs(P1[1] - P0[1])).toBeLessThan(1e-14 * (len(P0) + 1));
    }
  });

  it('kinetic energy is conserved when e = 1 and only then; it is lost for every e < 1', () => {
    for (const b of [-0.09, -0.03, 0, 0.02, 0.07]) {
      const el = scatter(base({ b, e: 1 }));
      expect(relativeError(el.K1, el.K0)).toBeLessThan(1e-14);
      for (const e of [0, 0.3, 0.9]) {
        const r = scatter(base({ b, e }));
        expect(r.K1).toBeLessThan(r.K0 * (1 - 1e-6));
      }
    }
  });

  it('the energy lost is (1 − e²) times ½μw², w the approach speed along the line of centres', () => {
    const m1 = 0.15;
    const m2 = 0.25;
    const mu = (m1 * m2) / (m1 + m2);
    for (const e of [0, 0.5, 0.8]) {
      const r = scatter(base({ e, b: 0.03 }));
      const w = dot(r.v1, r.n);
      expect(relativeError(r.K0 - r.K1, (1 - e * e) * 0.5 * mu * w * w)).toBeLessThan(1e-12);
    }
  });

  it('smooth discs: the tangential velocity components are unchanged, and the normal ones obey e', () => {
    const n: Vec2 = [Math.cos(0.7), Math.sin(0.7)];
    const t: Vec2 = [-n[1], n[0]];
    const v1: Vec2 = [2, 0.5];
    const v2: Vec2 = [-0.3, 0.4];
    for (const e of [0, 0.4, 1]) {
      const r = smoothImpact(0.4, v1, 0.9, v2, n, e);
      expect(relativeError(dot(r.v1, t), dot(v1, t))).toBeLessThan(1e-14);
      expect(relativeError(dot(r.v2, t), dot(v2, t))).toBeLessThan(1e-14);
      // separation speed along n̂ after = e × approach speed before
      expect(Math.abs(dot(sub(r.v2, r.v1), n) - e * dot(sub(v1, v2), n))).toBeLessThan(1e-14);
    }
  });

  it('discs that are separating along the line of centres get no impulse, and a miss changes nothing', () => {
    const r = smoothImpact(1, [-1, 0], 1, [0, 0], [1, 0], 1);
    expect(r.J).toBe(0);
    const miss = scatter(base({ b: 0.1 }));
    expect(miss.hit).toBe(false);
    expect(miss.v1p).toEqual([1.5, 0]);
  });

  it('two bodies that stick move with the velocity of the centre of mass, in both components', () => {
    const v = stickTogether(1200, [15, 0], 1600, [0, 10]);
    expect(relativeError(v[0], 18000 / 2800)).toBeLessThan(1e-14);
    expect(relativeError(v[1], 16000 / 2800)).toBeLessThan(1e-14);
  });
});

describe('analytic limits', () => {
  it('equal masses, elastic, target at rest: the outgoing paths are at 90° for every b ≠ 0', () => {
    for (const b of [-0.099, -0.05, -0.001, 0.001, 0.02, 0.04, 0.0866, 0.0999]) {
      const r = scatter(base({ m1: 0.15, m2: 0.15, b }));
      expect(Math.abs(separationAngle(r.v1p, r.v2p) - Math.PI / 2)).toBeLessThan(1e-9);
      expect(Math.abs(Math.abs(r.theta1 - r.theta2) - Math.PI / 2)).toBeLessThan(1e-9);
    }
  });

  it('equal masses, e < 1: the angle between the outgoing paths is below 90°, since v₁′·v₂′ = ¼(1 + e)(1 − e)w² > 0', () => {
    // v₁'·v₂' = ((1+e)/2)((1−e)/2) w² > 0 with w = v cos φ
    for (const e of [0, 0.5, 0.9]) {
      const r = scatter(base({ m1: 0.2, m2: 0.2, b: 0.05, e }));
      const w = 1.5 * Math.cos(Math.asin(0.5));
      expect(relativeError(dot(r.v1p, r.v2p), ((1 + e) / 2) * ((1 - e) / 2) * w * w)).toBeLessThan(1e-12);
      expect(separationAngle(r.v1p, r.v2p)).toBeLessThan(Math.PI / 2);
    }
  });

  it('b = 0 is a head-on collision: the result is the 1D formula of lesson 4.1', () => {
    for (const [m1, m2, e] of [
      [0.15, 0.25, 1],
      [0.45, 0.15, 0.7],
      [0.2, 0.2, 0],
      [1, 3, 0.5],
    ]) {
      const r = scatter(base({ m1, m2, e, b: 0 }));
      const [a, c] = headOn1D(m1, 1.5, m2, 0, e);
      expect(Math.abs(r.v1p[0] - a)).toBeLessThan(1e-14);
      expect(Math.abs(r.v2p[0] - c)).toBeLessThan(1e-14);
      expect(Math.abs(r.v1p[1])).toBeLessThan(1e-15);
      expect(Math.abs(r.v2p[1])).toBeLessThan(1e-15);
    }
  });

  it('the target, at rest, always leaves along the line of centres: θ₂ = −arcsin(b/D), whatever the masses and e', () => {
    for (const [m1, m2, e] of [
      [0.15, 0.25, 1],
      [0.45, 0.15, 0.3],
      [0.1, 1, 0],
    ]) {
      const r = scatter(base({ m1, m2, e, b: 0.03 }));
      expect(relativeError(r.theta2, -Math.asin(0.3))).toBeLessThan(1e-12);
    }
  });

  it('m₁ > m₂, elastic: the largest scattering angle over b is arcsin(m₂/m₁)', () => {
    for (const [m1, m2] of [
      [0.45, 0.15],
      [4, 1],
      [2, 1],
      [1.05, 1],
    ]) {
      const scan = maxScatteringAngleScan(m1, m2, 1, D);
      expect(relativeError(scan.theta, Math.asin(m2 / m1))).toBeLessThan(1e-9);
      expect(relativeError(thetaMaxElastic(m1, m2), Math.asin(m2 / m1))).toBeLessThan(1e-15);
      // at θmax the projectile's lab velocity is tangent to the circle of outcomes: speed v√(m₁² − m₂²)/(m₁ + m₂)
      const r = scatter({ m1, m2, v: 1, b: scan.b, R1: D / 2, R2: D / 2, e: 1 });
      expect(relativeError(len(r.v1p), Math.sqrt(m1 * m1 - m2 * m2) / (m1 + m2))).toBeLessThan(1e-6);
    }
  });

  it('m₁ < m₂, elastic: the projectile can go back (θ₁ → 180° as b → 0); m₁ = m₂: θ₁ < 90° always', () => {
    const back = scatter(base({ m1: 0.15, m2: 0.45, b: 1e-6 }));
    expect(Math.abs(back.theta1)).toBeGreaterThan(179 * DEG);
    for (const b of [1e-6, 0.01, 0.05, 0.09]) {
      const eq = scatter(base({ m1: 0.2, m2: 0.2, b }));
      expect(Math.abs(eq.theta1)).toBeLessThan(Math.PI / 2);
    }
  });

  it('the elastic speeds at a given angle match the collision: both roots below θmax come from two values of b', () => {
    const m1 = 0.45;
    const m2 = 0.15;
    const th = 12 * DEG;
    const roots = elasticSpeedsAtAngle(m1, m2, 1.5, th);
    expect(roots.length).toBe(2);
    // find the two b's by bisection on θ₁(b) on each side of the b of θmax
    const bStar = maxScatteringAngleScan(m1, m2, 1, D).b;
    const th1 = (b: number) => scatter(base({ m1, m2, b })).theta1;
    const solve = (lo: number, hi: number) => {
      for (let k = 0; k < 100; k++) {
        const mid = (lo + hi) / 2;
        if ((th1(mid) - th) * (th1(lo) - th) <= 0) hi = mid;
        else lo = mid;
      }
      return (lo + hi) / 2;
    };
    const speeds = [solve(1e-9, bStar), solve(bStar, D * (1 - 1e-9))].map((b) => len(scatter(base({ m1, m2, b })).v1p));
    speeds.sort((a, b) => b - a);
    expect(relativeError(speeds[0], roots[0])).toBeLessThan(1e-9);
    expect(relativeError(speeds[1], roots[1])).toBeLessThan(1e-9);
    expect(elasticSpeedsAtAngle(m1, m2, 1.5, 25 * DEG)).toEqual([]);
  });

  it('elastic smooth discs: in the centre-of-mass frame the relative velocity turns by χ = π − 2 arcsin(b/D)', () => {
    for (const b of [0, 0.02, 0.05, 0.09]) {
      const r = scatter(base({ b }));
      const rel0: Vec2 = r.v1;
      const rel1 = sub(r.v1p, r.v2p);
      expect(Math.abs(separationAngle(rel0, rel1) - cmDeflection(b, D))).toBeLessThan(1e-9);
    }
  });

  it('the mass ratio read off the two angles of an elastic collision is the true one', () => {
    for (const [m1, m2, b] of [
      [4, 16, 0.03],
      [0.15, 0.25, 0.06],
      [0.45, 0.15, 0.02],
    ]) {
      const r = scatter({ m1, m2, v: 2, b, R1: D / 2, R2: D / 2, e: 1 });
      expect(relativeError(massRatioFromAngles(r.theta1, -r.theta2), m2 / m1)).toBeLessThan(1e-12);
    }
  });

  it('the grazing limit b → D gives no impulse: the projectile keeps its velocity', () => {
    const r = scatter(base({ b: D * (1 - 1e-10) }));
    expect(r.J).toBeLessThan(1e-4 * 0.15 * 1.5);
    expect(relativeError(r.v1p[0], 1.5)).toBeLessThan(1e-4);
  });
});

describe('symmetry', () => {
  it('b → −b mirrors the outcome: the angles change sign and the speeds stay', () => {
    for (const [m1, m2, e] of [
      [0.15, 0.25, 1],
      [0.45, 0.15, 0.6],
      [0.2, 0.2, 1],
    ]) {
      for (const b of [0.01, 0.04, 0.08]) {
        const up = scatter(base({ m1, m2, e, b }));
        const dn = scatter(base({ m1, m2, e, b: -b }));
        expect(Math.abs(up.theta1 + dn.theta1)).toBeLessThan(1e-13);
        expect(Math.abs(up.theta2 + dn.theta2)).toBeLessThan(1e-13);
        expect(relativeError(len(up.v1p), len(dn.v1p))).toBeLessThan(1e-14);
        expect(relativeError(len(up.v2p), len(dn.v2p))).toBeLessThan(1e-14);
      }
    }
  });

  it('the contact normal is a unit vector, and the projectile passing above (b > 0) pushes the target down', () => {
    const n = contactNormal(0.04, D)!;
    expect(relativeError(len(n), 1)).toBeLessThan(1e-15);
    expect(n[1]).toBeLessThan(0);
    expect(scatter(base({ b: 0.04 })).theta1).toBeGreaterThan(0);
  });
});

describe('scaling', () => {
  it('angles depend only on b/D and m₂/m₁; speeds scale with v; the impulse with m and v', () => {
    const a = scatter(base({ b: 0.04 }));
    const k = scatter({ m1: 0.15 * 3, m2: 0.25 * 3, v: 1.5 * 2, b: 0.04 * 5, R1: 0.25, R2: 0.25, e: 1 });
    expect(relativeError(a.theta1, k.theta1)).toBeLessThan(1e-13);
    expect(relativeError(a.theta2, k.theta2)).toBeLessThan(1e-13);
    expect(relativeError(len(k.v1p), 2 * len(a.v1p))).toBeLessThan(1e-13);
    expect(relativeError(k.J, 6 * a.J)).toBeLessThan(1e-13);
    expect(relativeError(kinetic(0.15, a.v1), a.K0)).toBeLessThan(1e-15);
  });
});
