import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  averageVelocity,
  circlePath,
  constantAccelState,
  cycloidPath,
  distanceRate,
  ellipsePath,
  fadingPushState,
  gravityAccel,
  integrateAccel,
  integrateVelocityDependent,
  linearJerkState,
  pathLength,
  powerLawStop,
  quadraticSlowing,
  rotatingAccel,
  rotatingAccelState,
  rotatingDrift,
  shiftOrigin,
  speed,
  speedRate,
  splitAccel,
  turningAccel,
  vectorDerivative,
  type Path2,
} from '~/physics/kinematics';
import { dot, len, relativeError, type Vec2 } from '~/physics/vec';

const close = (a: Vec2, b: Vec2, tol: number) => {
  const scaleOf = Math.max(len(a), len(b), 1e-12);
  expect(Math.hypot(a[0] - b[0], a[1] - b[1]) / scaleOf).toBeLessThan(tol);
};
const PRESETS: [string, Path2][] = [
  ['circle', circlePath(3, 0.8, [0.5, -1])],
  ['ellipse', ellipsePath(4, 2.5, 0.8)],
  ['cycloid', cycloidPath(1, 1, -6, -2)],
];

describe('analytic limits', () => {
  it('an ellipse with equal axes is a circle: constant speed Rω and |a| = v²/R', () => {
    const p = ellipsePath(2.5, 2.5, 1.3);
    for (const t of [0, 0.4, 1.7, 3.9]) {
      expect(relativeError(speed(p.v(t)), 2.5 * 1.3)).toBeLessThan(1e-12);
      expect(relativeError(len(p.a(t)), (2.5 * 1.3) ** 2 / 2.5)).toBeLessThan(1e-12);
    }
  });

  it('on an ellipse a = −ω²r, and the speed is largest at the ends of the short axis, where |a| = ω²b', () => {
    const p = ellipsePath(3, 2, 2);
    for (const t of [0.1, 0.9, 2.2]) close(p.a(t), [-4 * p.r(t)[0], -4 * p.r(t)[1]], 1e-12);
    const tMax = Math.PI / 4; // ωt = π/2: the point (0, b)
    for (const dt of [-0.05, 0.05]) expect(speed(p.v(tMax))).toBeGreaterThan(speed(p.v(tMax + dt)));
    expect(relativeError(len(p.a(tMax)), 4 * 2)).toBeLessThan(1e-12);
  });

  it('the rotating acceleration with ω → 0 becomes a constant acceleration (a₀, 0)', () => {
    const a0 = 2;
    const v0: Vec2 = [0.3, -1];
    const exact = constantAccelState([a0, 0], [1, 1], v0, 1.5);
    const slow = rotatingAccelState(a0, 1e-4, [1, 1], v0, 1.5);
    close(slow.r, exact.r, 1e-4);
    close(slow.v, exact.v, 1e-4);
  });

  it('quadratic slowing with k → 0 is uniform motion x = v₀t', () => {
    const q = quadraticSlowing(1e-9, 10);
    expect(relativeError(q.x(3), 30)).toBeLessThan(1e-7);
  });

  it('the power-law stop returns the constant-deceleration case for n = 0 and v₀/k for n = 1', () => {
    expect(relativeError(powerLawStop(2, 0, 6).tStop, 3)).toBeLessThan(1e-12);
    expect(relativeError(powerLawStop(2, 0, 6).xStop, 36 / 4)).toBeLessThan(1e-12);
    expect(powerLawStop(2, 1, 6).tStop).toBe(Infinity);
    expect(relativeError(powerLawStop(2, 1, 6).xStop, 3)).toBeLessThan(1e-12);
    expect(powerLawStop(2, 2, 6).xStop).toBe(Infinity);
  });

  it('a fading push behaves like a constant acceleration a₀ while t ≪ τ and reaches the speed a₀τ when t ≫ τ', () => {
    const early = fadingPushState(8, 1.25, 1e-3);
    expect(relativeError(early.v, 8e-3)).toBeLessThan(1e-3);
    expect(relativeError(early.x, 0.5 * 8 * 1e-6)).toBeLessThan(1e-3);
    expect(relativeError(fadingPushState(8, 1.25, 40).v, 10)).toBeLessThan(1e-12);
  });

  it('the rim of a rolling wheel stops at the ground with a = Rω² upward, and moves at 2Rω at the top', () => {
    const p = cycloidPath(1.5, 2);
    expect(speed(p.v(0))).toBeLessThan(1e-12);
    close(p.a(0), [0, 1.5 * 4], 1e-12);
    expect(relativeError(speed(p.v(Math.PI / 2)), 2 * 1.5 * 2)).toBeLessThan(1e-12);
  });
});

describe('consistency: derivatives and integrals agree', () => {
  for (const [name, p] of PRESETS) {
    it(`${name}: v is the derivative of r and a the derivative of v (finite differences)`, () => {
      for (const t of [0.3, 1.1, 2.6, 4.4]) {
        close(vectorDerivative(p.r, t), p.v(t), 1e-7);
        close(vectorDerivative(p.v, t), p.a(t), 1e-7);
      }
    });

    it(`${name}: d|v|/dt equals the part of a along v, and the two parts of a add up to a`, () => {
      for (const t of [0.7, 1.9, 3.3]) {
        const h = 1e-5;
        const numeric = (speed(p.v(t + h)) - speed(p.v(t - h))) / (2 * h);
        expect(Math.abs(numeric - speedRate(p.v(t), p.a(t)))).toBeLessThan(1e-7 * (1 + len(p.a(t))));
        const { along, across } = splitAccel(p.v(t), p.a(t));
        close([along[0] + across[0], along[1] + across[1]], p.a(t), 1e-12);
        expect(Math.abs(dot(across, p.v(t)))).toBeLessThan(1e-9);
        expect(relativeError(Math.hypot(speedRate(p.v(t), p.a(t)), turningAccel(p.v(t), p.a(t))), len(p.a(t)))).toBeLessThan(1e-12);
      }
    });
  }

  it('the speed is not the rate of change of the distance from the origin: on a circle about O, d|r|/dt = 0 while |v| = Rω', () => {
    const p = circlePath(3, 0.8);
    for (const t of [0.2, 2.5]) {
      expect(Math.abs(distanceRate(p.r(t), p.v(t)))).toBeLessThan(1e-12);
      expect(relativeError(speed(p.v(t)), 2.4)).toBeLessThan(1e-12);
    }
  });

  it('moving the origin changes r and d|r|/dt but not v', () => {
    const p = circlePath(3, 0.8);
    const q = shiftOrigin(p, [5, 0]);
    const t = 1.2;
    close(vectorDerivative(q.r, t), p.v(t), 1e-7);
    expect(Math.abs(distanceRate(q.r(t), q.v(t)))).toBeGreaterThan(0.5);
  });

  it('the path length is never less than the size of the displacement, and equals it only on a straight line', () => {
    const p = ellipsePath(4, 2.5, 0.8);
    const T = p.duration;
    expect(len(averageVelocity(p, 0, T))).toBeLessThan(1e-12); // a full lap: zero average velocity
    expect(pathLength(p, 0, T)).toBeGreaterThan(20);
    const line: Path2 = { r: (t) => [2 * t, 3 * t], v: () => [2, 3], a: () => [0, 0], duration: 1 };
    expect(relativeError(pathLength(line, 0, 1), Math.hypot(2, 3))).toBeLessThan(1e-12);
  });

  it('integrating a = kt twice from (x₀ = 0, v₀ = 2 m/s) gives x(2 s) = 12 m (the ladder key)', () => {
    const s = integrateAccel((t) => [6 * t, 0], [0, 0], [2, 0], 2, 50);
    expect(relativeError(s.at(-1)!.r[0], linearJerkState(6, 0, 2, 2).x)).toBeLessThan(1e-12);
    expect(relativeError(linearJerkState(6, 0, 2, 2).x, 12)).toBeLessThan(1e-12);
  });

  it('RK4 on a velocity-dependent a = −kv² reproduces v(t) = v₀/(1 + kv₀t) and x(t) = ln(1 + kv₀t)/k', () => {
    const q = quadraticSlowing(0.05, 10);
    const s = integrateVelocityDependent((v) => -0.05 * v * v, 0, 10, 20, 2000).at(-1)!;
    expect(relativeError(s.v, q.v(20))).toBeLessThan(1e-9);
    expect(relativeError(s.x, q.x(20))).toBeLessThan(1e-9);
    expect(relativeError(q.vOfX(q.x(20)), q.v(20))).toBeLessThan(1e-12);
  });
});

describe('conservation: what the initial conditions fix and what they do not', () => {
  it('two bodies with the same a(t) keep a constant velocity difference, and their separation grows linearly', () => {
    const acc = rotatingAccel(2, 1);
    const A = integrateAccel(acc, [0, 0], [1, 0], 9, 900);
    const B = integrateAccel(acc, [0, 0], [3, 0], 9, 900);
    for (const i of [100, 450, 900]) {
      close([B[i].v[0] - A[i].v[0], B[i].v[1] - A[i].v[1]], [2, 0], 1e-10);
      close([B[i].r[0] - A[i].r[0], B[i].r[1] - A[i].r[1]], [2 * A[i].t, 0], 1e-9);
    }
  });

  it('under the rotating acceleration the path is a closed circle of radius a₀/ω² exactly when v₀ = (0, −a₀/ω)', () => {
    const a0 = 2;
    const w = 1;
    const v0: Vec2 = [0, -a0 / w];
    expect(len(rotatingDrift(a0, w, v0))).toBe(0);
    const centre: Vec2 = [a0 / (w * w), 0];
    for (const t of [0.5, 2, 4.4, 6]) {
      const { r } = rotatingAccelState(a0, w, [0, 0], v0, t);
      expect(relativeError(Math.hypot(r[0] - centre[0], r[1] - centre[1]), a0 / (w * w))).toBeLessThan(1e-12);
    }
    const lap = rotatingAccelState(a0, w, [0, 0], v0, (2 * Math.PI) / w);
    expect(len(lap.r)).toBeLessThan(1e-12);
  });

  it('for any other v₀ the average velocity over one period is the drift v₀ + (0, a₀/ω)', () => {
    const a0 = 2;
    const w = 1;
    const v0: Vec2 = [0.5, -2];
    const T = (2 * Math.PI) / w;
    const r = rotatingAccelState(a0, w, [0, 0], v0, T).r;
    close([r[0] / T, r[1] / T], rotatingDrift(a0, w, v0), 1e-12);
  });

  it('when the speed is constant the acceleration is perpendicular to the velocity (helix-like circle, v·a = 0)', () => {
    const p = circlePath(2, 3);
    for (const t of [0.1, 0.8, 1.6]) expect(Math.abs(dot(p.v(t), p.a(t)))).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('running the same path λ times faster multiplies v by λ and a by λ²', () => {
    const lam = 2.5;
    const slow = ellipsePath(3, 2, 0.6);
    const fast = ellipsePath(3, 2, 0.6 * lam);
    const t = 0.9;
    close(fast.r(t / lam), slow.r(t), 1e-12);
    expect(relativeError(speed(fast.v(t / lam)), lam * speed(slow.v(t)))).toBeLessThan(1e-12);
    expect(relativeError(len(fast.a(t / lam)), lam * lam * len(slow.a(t)))).toBeLessThan(1e-12);
  });

  it('the distance to half speed under a = −kv² is ln2/k, whatever v₀', () => {
    for (const v0 of [1, 10, 100]) expect(relativeError(quadraticSlowing(0.05, v0).xAtFraction(0.5), Math.LN2 / 0.05)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('RK4 rebuilds the rotating-acceleration path with error falling as dt⁴', () => {
    const a0 = 2;
    const w = 1;
    const T = 6;
    const exact = rotatingAccelState(a0, w, [0, 0], [0.5, -2], T).r;
    const err = (n: number) => {
      const r = integrateAccel(rotatingAccel(a0, w), [0, 0], [0.5, -2], T, n).at(-1)!.r;
      return Math.hypot(r[0] - exact[0], r[1] - exact[1]);
    };
    const ratio = err(20) / err(40);
    expect(ratio).toBeGreaterThan(14);
    expect(ratio).toBeLessThan(18);
  });

  it('under constant gravity RK4 is exact (a polynomial of degree 0)', () => {
    const s = integrateAccel(gravityAccel(G), [0, 0], [4, 7], 1.4, 7).at(-1)!;
    const e = constantAccelState([0, -G], [0, 0], [4, 7], 1.4);
    close(s.r, e.r, 1e-12);
    close(s.v, e.v, 1e-12);
  });

  it('the average velocity over a shrinking interval converges to v(t), with error falling as Δt', () => {
    const p = ellipsePath(4, 2.5, 0.8);
    const t = 1;
    const e = (dt: number) => len([averageVelocity(p, t, t + dt)[0] - p.v(t)[0], averageVelocity(p, t, t + dt)[1] - p.v(t)[1]]);
    const ratio = e(0.02) / e(0.01);
    expect(ratio).toBeGreaterThan(1.9);
    expect(ratio).toBeLessThan(2.1);
  });
});
