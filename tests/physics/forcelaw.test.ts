import { describe, expect, it } from 'vitest';
import { G, R_EARTH } from '~/physics/constants';
import {
  constantForceState,
  cubicSpringForce,
  cubicSpringQuarterTime,
  decayingForceState,
  driftVelocity,
  GM_EARTH,
  integrateForceOfPosition,
  integrateForceOfTime,
  inverseSquareForce,
  inverseSquareSpeedSquared,
  phasedCosineState,
  radialFallTime,
  rampForceState,
  speedFromForce,
  speedSquaredFromForce,
  springForce,
  springSpeedSquared,
  travelTime,
  type ForceOfTime,
} from '~/physics/forcelaw';
import { constantAccelState, fadingPushState, linearJerkState } from '~/physics/kinematics';
import { positionAt, velocityAt } from '~/physics/projectile';
import { relativeError } from '~/physics/vec';

const M = 2.0;

describe('analytic limits: the closed forms reduce to known motions', () => {
  it('a constant force reproduces lesson 1.2: a vertical throw with g = F/m', () => {
    // a body thrown straight up at 7 m/s under its weight alone: F = −mg, x = height
    const launch = { v0: 7, angleDeg: 90 };
    for (const t of [0.2, 0.5, 1.1]) {
      const s = constantForceState(-M * G, M, 0, 7, t);
      expect(relativeError(s.x, positionAt(launch, t)[1])).toBeLessThan(1e-12);
      expect(relativeError(s.v, velocityAt(launch, t)[1])).toBeLessThan(1e-12);
    }
  });

  it('the running integral of a constant force is exactly uniform acceleration (lesson 1.1)', () => {
    const run = integrateForceOfTime(() => 4, M, 1, -3, 5, 50);
    const exact = constantAccelState([4 / M, 0], [1, 0], [-3, 0], 5);
    expect(relativeError(run[50].v, exact.v[0])).toBeLessThan(1e-12);
    expect(relativeError(run[50].x, exact.r[0])).toBeLessThan(1e-12);
  });

  it('a ramp F = ct gives v ∝ t² and x ∝ t³, the same as lesson 1.1\'s a = (c/m)t', () => {
    for (const t of [0.5, 2, 3.7]) {
      const s = rampForceState(6, M, 0.3, 1.2, t);
      const k = linearJerkState(6 / M, 0.3, 1.2, t);
      expect(relativeError(s.x, k.x)).toBeLessThan(1e-12);
      expect(relativeError(s.v, k.v)).toBeLessThan(1e-12);
    }
    // the ladder's numbers: F = 6.0t N on 2.0 kg from rest, v(2 s) = 6.0 m/s, x(2 s) = 4.0 m
    expect(rampForceState(6, 2, 0, 0, 2).v).toBeCloseTo(6, 12);
    expect(rampForceState(6, 2, 0, 0, 2).x).toBeCloseTo(4, 12);
  });

  it('a decaying push matches lesson 1.1\'s sprinter with a₀ = F₀/m', () => {
    for (const t of [0.1, 1, 4]) {
      const s = decayingForceState(4, 0.5, M, 0, 0, t);
      const k = fadingPushState(4 / M, 0.5, t);
      expect(relativeError(s.x, k.x)).toBeLessThan(1e-12);
      expect(relativeError(s.v, k.v)).toBeLessThan(1e-12);
    }
  });

  it('a slow cosine (ωt ≪ 1) acts like a constant force F₀', () => {
    const t = 0.3;
    const s = phasedCosineState(3, 1e-4, 0, M, 0, 0.5, t);
    const c = constantForceState(3, M, 0, 0.5, t);
    expect(relativeError(s.x, c.x)).toBeLessThan(1e-6);
    expect(relativeError(s.v, c.v)).toBeLessThan(1e-6);
  });

  it('a body at rest under F₀cos ωt stays between 0 and 2F₀/(mω²); under F₀sin ωt it drifts at F₀/(mω)', () => {
    const F0 = 2;
    const w = 4;
    const m = 0.5;
    let max = -Infinity;
    let min = Infinity;
    for (let i = 0; i <= 4000; i++) {
      const x = phasedCosineState(F0, w, 0, m, 0, 0, (i / 4000) * 10).x;
      max = Math.max(max, x);
      min = Math.min(min, x);
    }
    expect(relativeError(max, (2 * F0) / (m * w * w))).toBeLessThan(1e-6);
    expect(Math.abs(min)).toBeLessThan(1e-9);
    const T = (2 * Math.PI) / w;
    const sin = (t: number) => phasedCosineState(F0, w, -Math.PI / 2, m, 0, 0, t).x;
    expect(relativeError((sin(5 * T) - sin(2 * T)) / (3 * T), F0 / (m * w))).toBeLessThan(1e-12);
    expect(relativeError(driftVelocity(F0, w, -Math.PI / 2, m, 0), F0 / (m * w))).toBeLessThan(1e-12);
    expect(driftVelocity(F0, w, 0, m, 0)).toBe(0);
  });

  it('a drop of h ≪ r₀ under the inverse-square pull is a fall at constant g(r₀)', () => {
    const r0 = 2 * R_EARTH;
    const h = 1;
    const g0 = GM_EARTH / (r0 * r0);
    expect(relativeError(inverseSquareSpeedSquared(GM_EARTH, r0, 0, r0 - h), 2 * g0 * h)).toBeLessThan(1e-5);
  });

  it('a fall from infinity reaches the surface at √(2GM/R), 11.2 km/s; from 2R it reaches √(GM/R), 7.91 km/s', () => {
    expect(Math.sqrt(inverseSquareSpeedSquared(GM_EARTH, 1e30, 0, R_EARTH)) / 1000).toBeCloseTo(11.18, 2);
    expect(Math.sqrt(inverseSquareSpeedSquared(GM_EARTH, 2 * R_EARTH, 0, R_EARTH)) / 1000).toBeCloseTo(7.91, 2);
  });

  it('the radial fall time is zero at the start and √(r₀³/2GM)·π/2 at the centre', () => {
    const r0 = 3 * R_EARTH;
    expect(radialFallTime(GM_EARTH, r0, r0)).toBe(0);
    expect(relativeError(radialFallTime(GM_EARTH, r0, 0), Math.sqrt(r0 ** 3 / (2 * GM_EARTH)) * (Math.PI / 2))).toBeLessThan(1e-12);
  });
});

describe('conservation: ½mv² changes by the integral of F over x', () => {
  it('the chain rule agrees with the spring\'s closed form, v² + (k/m)x² unchanged', () => {
    const k = 200;
    const m = 0.5;
    for (const x of [0.08, 0.05, 0, -0.07]) {
      const v2 = speedSquaredFromForce(springForce(k), m, 0.1, 0, x);
      expect(relativeError(v2, springSpeedSquared(k, m, 0.1, 0, x))).toBeLessThan(1e-6);
    }
    // the ladder's number: v(0.05 m) = 1.73 m/s
    expect(speedFromForce(springForce(200), 0.5, 0.1, 0, 0.05)).toBeCloseTo(1.732, 3);
  });

  it('beyond the turning point v² < 0: the body never gets there', () => {
    expect(Number.isNaN(speedFromForce(springForce(50), 2, 0.4, 0, 0.45))).toBe(true);
  });

  it('the chain rule agrees with an RK4 run in time at the same position (spring, stiff spring, inverse square)', () => {
    const cases: { F: (x: number) => number; m: number; x0: number; v0: number; dt: number; n: number; stop?: (x: number) => boolean }[] = [
      { F: springForce(50), m: 2, x0: 0.4, v0: 0, dt: 1e-3, n: 600 },
      { F: cubicSpringForce(500), m: 0.2, x0: 0.1, v0: 0.3, dt: 1e-3, n: 700 },
      { F: inverseSquareForce(GM_EARTH, 1000), m: 1000, x0: 3 * R_EARTH, v0: 0, dt: 2, n: 20000, stop: (x) => x < R_EARTH },
    ];
    for (const c of cases) {
      const run = integrateForceOfPosition(c.F, c.m, c.x0, c.v0, c.dt, c.n, c.stop ? (x) => c.stop!(x) : undefined);
      for (const s of run.filter((_, i) => i % 97 === 50)) {
        const v2 = speedSquaredFromForce(c.F, c.m, c.x0, c.v0, s.x, 4000);
        expect(relativeError(Math.sqrt(Math.max(v2, 0)), Math.abs(s.v))).toBeLessThan(1e-5);
      }
    }
  });
});

describe('scaling', () => {
  it('the spring\'s quarter period does not depend on the release point; the stiff spring\'s falls as 1/x₀', () => {
    const t1 = travelTime(springForce(50), 2, 0.4, 0);
    const t2 = travelTime(springForce(50), 2, 0.1, 0);
    expect(relativeError(t1, (Math.PI / 2) * Math.sqrt(2 / 50))).toBeLessThan(1e-3);
    expect(relativeError(t1, t2)).toBeLessThan(1e-3);
    const c1 = cubicSpringQuarterTime(500, 0.2, 0.1);
    expect(relativeError(cubicSpringQuarterTime(500, 0.2, 0.2), c1 / 2)).toBeLessThan(1e-12);
    expect(relativeError(travelTime(cubicSpringForce(500), 0.2, 0.1, 0), c1)).toBeLessThan(1e-3);
  });

  it('under F₀cos(ωt + φ) the drift velocity scales as F₀/(mω) and vanishes at φ = 0 and π', () => {
    expect(relativeError(driftVelocity(4, 2, -Math.PI / 2, 2, 0), 1)).toBeLessThan(1e-12);
    expect(relativeError(driftVelocity(8, 2, -Math.PI / 2, 2, 0), 2)).toBeLessThan(1e-12);
    expect(relativeError(driftVelocity(4, 4, -Math.PI / 2, 2, 0), 0.5)).toBeLessThan(1e-12);
    expect(Math.abs(driftVelocity(4, 2, Math.PI, 2, 0))).toBeLessThan(1e-15);
  });
});

describe('convergence of the numerical integrals', () => {
  const cases: [string, ForceOfTime, (t: number) => { x: number; v: number }][] = [
    ['ramp', (t) => 3 * t, (t) => rampForceState(3, M, 0, 0, t)],
    ['cosine', (t) => 4 * Math.cos(2 * t), (t) => phasedCosineState(4, 2, 0, M, 0, 0, t)],
    ['sine', (t) => 4 * Math.sin(2 * t), (t) => phasedCosineState(4, 2, -Math.PI / 2, M, 0, 0, t)],
    ['decay', (t) => 4 * Math.exp(-t), (t) => decayingForceState(4, 1, M, 0, 0, t)],
  ];
  for (const [name, F, exact] of cases) {
    it(`two running integrals of the ${name} force converge to the closed form as 1/n²`, () => {
      const T = 6;
      const err = (n: number) => {
        const run = integrateForceOfTime(F, M, 0, 0, T, n);
        const e = exact(T);
        return Math.abs(run[n].x - e.x) + Math.abs(run[n].v - e.v);
      };
      const e1 = err(100);
      const e2 = err(200);
      expect(e1).toBeLessThan(1e-2);
      // the ramp's midpoint v is exact; the trapezoid in x leaves an O(1/n²) error everywhere
      expect(e1 / e2).toBeGreaterThan(3.5);
      expect(e1 / e2).toBeLessThan(4.5);
    });
  }

  it('the time to fall from 3R to R by ∫dr/|v| agrees with the closed form and with RK4', () => {
    const r0 = 3 * R_EARTH;
    const exact = radialFallTime(GM_EARTH, r0, R_EARTH);
    expect(relativeError(travelTime(inverseSquareForce(GM_EARTH, 1), 1, r0, R_EARTH), exact)).toBeLessThan(1e-3);
    const run = integrateForceOfPosition(inverseSquareForce(GM_EARTH, 1), 1, r0, 0, 0.5, 40000, (x) => x < R_EARTH);
    const last = run[run.length - 1];
    const prev = run[run.length - 2];
    const tCross = prev.t + ((prev.x - R_EARTH) / (prev.x - last.x)) * (last.t - prev.t);
    expect(relativeError(tCross, exact)).toBeLessThan(1e-4);
  });
});
