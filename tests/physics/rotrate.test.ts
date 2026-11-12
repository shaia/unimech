import { describe, expect, it } from 'vitest';
import { rotateZ } from '~/physics/rotating';
import {
  accelerationTerms,
  fixedVectorInertial,
  fixedVectorRate,
  spinAngle,
  spinRate,
  unitChordAngle,
  unitChordRatio,
  walkerState,
  type Spin,
  type Walker,
} from '~/physics/rotrate';
import { cross3, dot3, len3, relativeError, scale3, sub3, type Vec3 } from '~/physics/vec';

const ZERO: Vec3 = [0, 0, 0];
const near = (a: Vec3, b: Vec3, tol: number) => expect(len3(sub3(a, b))).toBeLessThan(tol * Math.max(1, len3(b)));

/** Central difference of a vector function of time. */
const diff = (f: (t: number) => Vec3, t: number, h: number): Vec3 => scale3(sub3(f(t + h), f(t - h)), 1 / (2 * h));
/** Second central difference. */
const diff2 = (f: (t: number) => Vec3, t: number, h: number): Vec3 => {
  const a = f(t + h);
  const b = f(t);
  const c = f(t - h);
  return [(a[0] - 2 * b[0] + c[0]) / (h * h), (a[1] - 2 * b[1] + c[1]) / (h * h), (a[2] - 2 * b[2] + c[2]) / (h * h)];
};

const spin: Spin = { theta0: 0.3, omega0: 1.5, alpha: 0.4 };
const walker: Walker = { r0: 0.05, vp: 0.2, phi: 0.2 };

describe('analytic limits', () => {
  it('with ω = 0, ω̇ = 0 and A = 0 the acceleration in S equals the acceleration in S′', () => {
    const t = accelerationTerms([1, 2, 0], [0.3, -0.4, 0.1], [0.5, 0.6, -0.7], ZERO);
    expect(t.total).toEqual([0.5, 0.6, -0.7]);
  });

  it('a body at rest in a frame turning at constant ω has the centripetal acceleration ω²ρ toward the axis', () => {
    const w = 1.5;
    const s = walkerState({ r0: 0.3, vp: 0 }, { omega0: w }, 2.0);
    expect(relativeError(len3(s.a), w * w * 0.3)).toBeLessThan(1e-12);
    expect(dot3(s.a, s.r)).toBeLessThan(0);
    // and its speed in S is ωρ
    expect(relativeError(len3(s.v), w * 0.3)).toBeLessThan(1e-12);
  });

  it('a frame that only accelerates (ω = 0) adds A to the acceleration: lesson 7.1', () => {
    const t = accelerationTerms([1, 0, 0], [0, 1, 0], [0.1, 0.2, 0.3], ZERO, ZERO, [2, 0, 0]);
    expect(t.total).toEqual([2.1, 0.2, 0.3]);
  });

  it('the walker reproduces the polar acceleration of lesson 1.4: a_r = r̈ − rθ̇², a_θ = rθ̈ + 2ṙθ̇', () => {
    const tt = 1.1;
    const s = walkerState(walker, spin, tt);
    const r = walker.r0 + walker.vp * tt;
    const thdot = spinRate(spin, tt);
    const theta = spinAngle(spin, tt) + (walker.phi ?? 0);
    const rhat: Vec3 = [Math.cos(theta), Math.sin(theta), 0];
    const that: Vec3 = [-Math.sin(theta), Math.cos(theta), 0];
    expect(relativeError(dot3(s.a, rhat), -r * thdot * thdot)).toBeLessThan(1e-12);
    expect(relativeError(dot3(s.a, that), r * (spin.alpha ?? 0) + 2 * walker.vp * thdot)).toBeLessThan(1e-12);
  });

  it('a unit vector turned by a vanishing angle changes by Δθ at 90° to itself', () => {
    expect(unitChordRatio(0)).toBe(1);
    expect(Math.abs(unitChordRatio(1e-4) - 1)).toBeLessThan(1e-8);
    expect(Math.abs(unitChordAngle(1e-6) - Math.PI / 2)).toBeLessThan(1e-6);
    // exact at a finite angle: the chord of the unit circle
    const d = 0.8;
    const e1: Vec3 = [1, 0, 0];
    const e2 = rotateZ(e1, d);
    const de = sub3(e2, e1);
    expect(relativeError(len3(de) / d, unitChordRatio(d))).toBeLessThan(1e-12);
    expect(relativeError(Math.acos(dot3(de, e1) / len3(de)), unitChordAngle(d))).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('a vector fixed in the rotating frame keeps its length in S, and its rate ω × Q is perpendicular to it', () => {
    const q: Vec3 = [0.3, 0.1, 0.2];
    for (const t of [0, 0.7, 2.3]) {
      const Q = fixedVectorInertial(q, spin, t);
      expect(relativeError(len3(Q), len3(q))).toBeLessThan(1e-12);
      expect(Math.abs(dot3(Q, fixedVectorRate(q, spin, t)))).toBeLessThan(1e-15);
    }
  });

  it('the angular velocity has the same rate in both frames, because ω × ω = 0', () => {
    const w: Vec3 = [0.2, -0.4, 1.3];
    expect(cross3(w, w)).toEqual([0, 0, 0]);
  });
});

describe('scaling', () => {
  it('the Coriolis term is proportional to v′, the centripetal term to ω², the Euler term to ω̇', () => {
    const r: Vec3 = [0.3, 0, 0];
    const v: Vec3 = [0.2, 0, 0];
    const w: Vec3 = [0, 0, 1.5];
    const wd: Vec3 = [0, 0, 0.5];
    const t1 = accelerationTerms(r, v, ZERO, w, wd);
    const t2 = accelerationTerms(r, scale3(v, 2), ZERO, scale3(w, 3), scale3(wd, 5));
    expect(relativeError(len3(t2.coriolis), 6 * len3(t1.coriolis))).toBeLessThan(1e-12);
    expect(relativeError(len3(t2.centripetal), 9 * len3(t1.centripetal))).toBeLessThan(1e-12);
    expect(relativeError(len3(t2.euler), 5 * len3(t1.euler))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('differentiating a fixed vector in S converges to ω × Q', () => {
    const q: Vec3 = [0.3, 0.1, 0.2];
    const f = (t: number) => fixedVectorInertial(q, spin, t);
    const exact = fixedVectorRate(q, spin, 1.3);
    const e1 = len3(sub3(diff(f, 1.3, 1e-2), exact));
    const e2 = len3(sub3(diff(f, 1.3, 5e-3), exact));
    expect(e1).toBeLessThan(1e-4);
    expect(e1 / e2).toBeGreaterThan(3.8); // second order
  });

  it("differentiating the walker's path in S once gives v′ + ω × r′, and twice gives the five-term acceleration", () => {
    const f = (t: number) => walkerState(walker, spin, t).r;
    const tt = 0.9;
    const s = walkerState(walker, spin, tt);
    near(diff(f, tt, 1e-3), s.v, 1e-6);
    near(diff2(f, tt, 1e-3), s.a, 1e-5);
  });

  it('the general term formula agrees with differentiating a path in S twice, with ω not along z', () => {
    // a frame turning about the fixed unit axis n at the constant rate w: Rodrigues' rotation
    const n: Vec3 = [0.6, 0, 0.8];
    const w = 1.2;
    const rot = (q: Vec3, a: number): Vec3 => {
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const nxq = cross3(n, q);
      const nq = dot3(n, q);
      return [q[0] * c + nxq[0] * sn + n[0] * nq * (1 - c), q[1] * c + nxq[1] * sn + n[1] * nq * (1 - c), q[2] * c + nxq[2] * sn + n[2] * nq * (1 - c)];
    };
    // a path in S′'s axes with r′, v′, a′ all nonzero
    const rpOf = (t: number): Vec3 => [0.2 + 0.1 * t, 0.3 * t * t, -0.1 * t];
    const f = (t: number) => rot(rpOf(t), w * t);
    const tt = 0.7;
    // everything at time tt, turned into S's axes: the terms in S′ then turned by w tt
    const rp = rpOf(tt);
    const vp: Vec3 = [0.1, 0.6 * tt, -0.1];
    const ap: Vec3 = [0, 0.6, 0];
    const terms = accelerationTerms(rp, vp, ap, scale3(n, w));
    near(diff2(f, tt, 1e-3), rot(terms.total, w * tt), 1e-5);
  });
});
