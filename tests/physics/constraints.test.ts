import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  atwood,
  compoundAtwood,
  fixedWedge,
  freeWedge,
  freeWedgeByElimination,
  hangingPulleys,
  holdingForce,
  slideTime,
  tablePulleys,
  wedgeRecoil,
} from '~/physics/constraints';
import { relativeError } from '~/physics/vec';

const rad = (d: number) => (d * Math.PI) / 180;
const EXACT = 1e-9;
const MASSES: [number, number][] = [
  [1, 1],
  [2, 3],
  [3, 5],
  [0.5, 4],
  [6, 1.2],
];
const WEDGES: [number, number, number][] = [
  // m, M, θ
  [1, 4, 30],
  [2, 6, 45],
  [0.5, 1, 15],
  [4, 1, 60],
  [1, 20, 37],
];

describe('analytic limits', () => {
  it.each(MASSES)('one segment (n = 1) is the Atwood machine: a = (m₂ − m₁)g/(m₁ + m₂), T = 2m₁m₂g/(m₁ + m₂) [%d, %d kg]', (m1, m2) => {
    const s = atwood(m1, m2);
    expect(relativeError(s.a2, ((m2 - m1) * G) / (m1 + m2))).toBeLessThan(EXACT);
    expect(relativeError(s.a1, -s.a2)).toBeLessThan(EXACT);
    expect(relativeError(s.T, (2 * m1 * m2 * G) / (m1 + m2))).toBeLessThan(EXACT);
  });

  it('a movable pulley balances exactly when m₂ = n·m₁, for n = 1, 2, 3', () => {
    for (const n of [1, 2, 3]) {
      const s = hangingPulleys(1.5, 1.5 * n, n);
      expect(Math.abs(s.a1)).toBeLessThan(1e-12);
      expect(relativeError(s.T, 1.5 * G)).toBeLessThan(EXACT);
    }
  });

  it('with the load on the movable pulley tending to zero, body 1 falls freely and the pulley rises at g/2', () => {
    const s = hangingPulleys(2, 1e-9, 2);
    expect(relativeError(s.a1, G)).toBeLessThan(1e-8);
    expect(relativeError(s.a2, -G / 2)).toBeLessThan(1e-8);
    expect(s.T).toBeLessThan(1e-7);
  });

  it('the bank key: m₁ = 2.0 kg free, m₂ = 3.0 kg on the movable pulley gives a₁ = 1.78 m/s² down, a₂ = 0.891 up, T = 16.0 N', () => {
    const s = hangingPulleys(2, 3, 2);
    expect(relativeError(s.a1, 1.78)).toBeLessThan(0.003);
    expect(relativeError(s.a2, -0.891)).toBeLessThan(0.001);
    expect(relativeError(s.T, 16.0)).toBeLessThan(0.003);
  });

  it('a block on a table pulled by a hanging body: a = m₂g/(m₁ + m₂); with a huge table block nothing moves', () => {
    const s = tablePulleys(4, 1, 1);
    expect(relativeError(s.a1, G / 5)).toBeLessThan(EXACT);
    expect(relativeError(s.T, (4 * G) / 5)).toBeLessThan(EXACT);
    expect(tablePulleys(1e9, 1, 2).a2).toBeLessThan(1e-7);
    // with no table block the hanging body falls freely, whatever n
    expect(relativeError(tablePulleys(1e-12, 3, 2).a2, G)).toBeLessThan(1e-9);
  });

  it('the compound Atwood machine: with m₂ = m₃ it is the plain Atwood machine with m₂ + m₃ on one side', () => {
    const c = compoundAtwood(3, 1.5, 1.5);
    const a = atwood(3, 3);
    expect(Math.abs(c.a1 - a.a1)).toBeLessThan(1e-12);
    expect(relativeError(c.T1, a.T)).toBeLessThan(EXACT);
    expect(relativeError(c.a2, c.aP)).toBeLessThan(EXACT);
  });

  it('the compound Atwood machine with m₁ = m₂ + m₃ but m₂ ≠ m₃ is not balanced: body 1 descends', () => {
    const c = compoundAtwood(3, 1, 2);
    expect(c.a1).toBeGreaterThan(0);
    expect(relativeError(c.a1, 0.576)).toBeLessThan(0.002);
  });

  it.each(WEDGES)('a wedge of huge mass is the fixed incline: A → 0, N → mg cosθ, a_rel → g sinθ [m %d, θ %d°]', (m, _M, th) => {
    const free = freeWedge(m, 1e12, th);
    const fixed = fixedWedge(m, th);
    expect(Math.abs(free.A)).toBeLessThan(1e-9);
    expect(relativeError(free.N, fixed.N)).toBeLessThan(1e-9);
    expect(relativeError(free.aRel, fixed.aRel)).toBeLessThan(1e-9);
    expect(relativeError(free.pathAngle, rad(th))).toBeLessThan(1e-9);
  });

  it('a nearly flat face does not push the wedge, and a nearly vertical face lets the block fall freely', () => {
    const flat = freeWedge(1, 4, 1e-6);
    expect(Math.abs(flat.A)).toBeLessThan(1e-6);
    expect(relativeError(flat.N, G)).toBeLessThan(1e-9);
    const wall = freeWedge(1, 4, 90 - 1e-7);
    expect(Math.abs(wall.A)).toBeLessThan(1e-6);
    expect(relativeError(wall.ay, -G)).toBeLessThan(1e-9);
  });

  it('a light block (m → 0) slides as on a fixed incline and does not move the wedge', () => {
    const w = freeWedge(1e-12, 4, 30);
    expect(Math.abs(w.A)).toBeLessThan(1e-11);
    expect(relativeError(w.aRel, G * Math.sin(rad(30)))).toBeLessThan(1e-8);
  });

  it.each(WEDGES)('the closed form equals Gaussian elimination of the four equations [m %d, M %d, θ %d°]', (m, M, th) => {
    const w = freeWedge(m, M, th);
    const e = freeWedgeByElimination(m, M, th);
    expect(relativeError(w.A, e.A)).toBeLessThan(1e-12);
    expect(relativeError(w.N, e.N)).toBeLessThan(1e-12);
    expect(relativeError(w.ax, e.ax)).toBeLessThan(1e-12);
    expect(relativeError(w.ay, e.ay)).toBeLessThan(1e-12);
  });

  it.each(WEDGES)('the relative acceleration lies along the face and the ground path is steeper: tan φ = (1 + m/M) tanθ [m %d, M %d, θ %d°]', (m, M, th) => {
    const w = freeWedge(m, M, th);
    const t = Math.tan(rad(th));
    expect(relativeError(w.ay, -(w.ax - w.A) * t)).toBeLessThan(1e-12);
    expect(relativeError(Math.hypot(w.ax - w.A, w.ay), w.aRel)).toBeLessThan(1e-12);
    expect(relativeError(Math.tan(w.pathAngle), (1 + m / M) * t)).toBeLessThan(1e-12);
    expect(w.pathAngle).toBeGreaterThan(rad(th));
    // the normal force of a receding face is smaller than on a fixed one
    expect(w.N).toBeLessThan(m * G * Math.cos(rad(th)));
    expect(w.N).toBeGreaterThan(0);
  });

  it('the bank key: m = 1.0 kg, M = 4.0 kg, θ = 30° gives |A| = 0.998 m/s² and N = 7.99 N', () => {
    const w = freeWedge(1, 4, 30);
    expect(relativeError(-w.A, 0.998)).toBeLessThan(0.001);
    expect(relativeError(w.N, 7.99)).toBeLessThan(0.001);
  });

  it('a pushed wedge that keeps the block at rest on it: F = (M + m) g tanθ, N = mg/cosθ, and N sinθ = m·a', () => {
    const h = holdingForce(1, 4, 30);
    expect(relativeError(h.F, 5 * G * Math.tan(rad(30)))).toBeLessThan(EXACT);
    expect(relativeError(h.N * Math.sin(rad(30)), 1 * h.a)).toBeLessThan(EXACT);
    expect(relativeError(h.N * Math.cos(rad(30)), 1 * G)).toBeLessThan(EXACT);
  });
});

describe('conservation', () => {
  it.each(WEDGES)('the horizontal momentum stays zero: m·a_x + M·A = 0 [m %d, M %d, θ %d°]', (m, M, th) => {
    const w = freeWedge(m, M, th);
    expect(Math.abs(m * w.ax + M * w.A)).toBeLessThan(1e-12 * m * G);
  });

  it.each(WEDGES)('the vertical forces on block and wedge together equal the vertical acceleration of the system [m %d, M %d, θ %d°]', (m, M, th) => {
    const w = freeWedge(m, M, th);
    // external vertical forces: the floor's N, and the weights; only the block accelerates vertically
    expect(relativeError(w.Nfloor - (m + M) * G, m * w.ay)).toBeLessThan(1e-12);
  });

  it.each(WEDGES)('from rest, the kinetic energy equals the weight\'s work on the block (the smooth normal force does no net work) [m %d, M %d, θ %d°]', (m, M, th) => {
    const w = freeWedge(m, M, th);
    const t = 0.37;
    const K = 0.5 * m * ((w.ax * t) ** 2 + (w.ay * t) ** 2) + 0.5 * M * (w.A * t) ** 2;
    const drop = -0.5 * w.ay * t * t;
    expect(relativeError(K, m * G * drop)).toBeLessThan(1e-12);
  });

  it('the wedge recoil from the momentum: ΔX = −m L cosθ/(m + M) equals ½At² at the time the block slides L', () => {
    for (const [m, M, th] of WEDGES) {
      const w = freeWedge(m, M, th);
      const L = 1.2;
      const t = slideTime(w.aRel, L);
      expect(relativeError(0.5 * w.A * t * t, wedgeRecoil(m, M, th, L))).toBeLessThan(1e-12);
    }
  });

  it.each(MASSES)('the string does no net work: from rest, ½m₁v₁² + ½m₂v₂² = g(m₁Δy₁ + m₂Δy₂) for n = 1, 2, 3 [%d, %d kg]', (m1, m2) => {
    for (const n of [1, 2, 3]) {
      const s = hangingPulleys(m1, m2, n);
      const t = 0.8;
      const K = 0.5 * m1 * (s.a1 * t) ** 2 + 0.5 * m2 * (s.a2 * t) ** 2;
      const W = G * (m1 * 0.5 * s.a1 * t * t + m2 * 0.5 * s.a2 * t * t);
      if (K === 0) expect(Math.abs(W)).toBeLessThan(1e-12);
      else expect(relativeError(K, W)).toBeLessThan(1e-12);
      // the tension's power on the two bodies cancels: T·v₁ + nT·v₂ = 0 with v₁ = −n·v₂
      expect(Math.abs(s.T * s.a1 + n * s.T * s.a2)).toBeLessThan(1e-9);
    }
  });

  it('in the compound Atwood machine both strings keep their lengths and the energy balances', () => {
    const c = compoundAtwood(3, 1, 2);
    expect(Math.abs(c.a1 + c.aP)).toBeLessThan(1e-12);
    expect(Math.abs(c.a2 - c.aP + (c.a3 - c.aP))).toBeLessThan(1e-12);
    const K = 0.5 * (3 * c.a1 ** 2 + 1 * c.a2 ** 2 + 2 * c.a3 ** 2);
    const W = G * 0.5 * (3 * c.a1 + 1 * c.a2 + 2 * c.a3);
    expect(relativeError(K, W)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('multiplying every mass by the same factor changes no acceleration and scales the tension and N by it', () => {
    const k = 7.3;
    const a = hangingPulleys(2, 3, 2);
    const b = hangingPulleys(2 * k, 3 * k, 2);
    expect(relativeError(a.a1, b.a1)).toBeLessThan(EXACT);
    expect(relativeError(b.T, k * a.T)).toBeLessThan(EXACT);
    const w = freeWedge(1, 4, 30);
    const W = freeWedge(k, 4 * k, 30);
    expect(relativeError(w.A, W.A)).toBeLessThan(EXACT);
    expect(relativeError(W.N, k * w.N)).toBeLessThan(EXACT);
  });

  it('every acceleration is proportional to g (on the Moon all of them are six times smaller)', () => {
    const w = freeWedge(1, 4, 30, G);
    const moon = freeWedge(1, 4, 30, G / 6);
    expect(relativeError(moon.A, w.A / 6)).toBeLessThan(EXACT);
    expect(relativeError(hangingPulleys(2, 3, 2, G / 6).a1, hangingPulleys(2, 3, 2).a1 / 6)).toBeLessThan(EXACT);
  });

  it('the load you can hold on n supporting segments grows as n: m₂ = n·m₁ balances', () => {
    for (const n of [1, 2, 3, 4]) expect(Math.abs(hangingPulleys(1, n, n).a2)).toBeLessThan(1e-12);
  });
});

/**
 * A model with no constraint at all: the face is a stiff spring that pushes the block out along the face's
 * normal in proportion to how far it has sunk in. RK4 integrates block and wedge as two free bodies. As
 * the stiffness grows, the wedge's motion must converge to the constrained solution.
 */
function penaltyWedgeX(m: number, M: number, thetaDeg: number, k: number, tEnd: number): number {
  const th = rad(thetaDeg);
  const n: [number, number] = [Math.sin(th), Math.cos(th)];
  // state: block x, y, vx, vy; wedge X, V. The face passes through (X, 0); the block starts on it,
  // just touching, so it first sinks in by about N/k; a critically damped dashpot in the contact kills the
  // bounce, and what is left of the error is the sink-in, which shrinks as 1/k
  let s = [0, 0, 0, 0, 0, 0];
  const c = 2 * Math.sqrt(k * m);
  const f = (u: number[]) => {
    const depth = -(n[0] * (u[0] - u[4]) + n[1] * u[1]); // > 0 when the block is inside the wedge
    const rate = -(n[0] * (u[2] - u[5]) + n[1] * u[3]);
    const F = depth > 0 ? Math.max(0, k * depth + c * rate) : 0;
    return [u[2], u[3], (F * n[0]) / m, (F * n[1]) / m - G, u[5], (-F * n[0]) / M];
  };
  const dt = 0.05 / Math.sqrt(k / Math.min(m, M));
  const steps = Math.ceil(tEnd / dt);
  const h = tEnd / steps;
  for (let i = 0; i < steps; i++) {
    const k1 = f(s);
    const k2 = f(s.map((x, j) => x + (h / 2) * k1[j]));
    const k3 = f(s.map((x, j) => x + (h / 2) * k2[j]));
    const k4 = f(s.map((x, j) => x + h * k3[j]));
    s = s.map((x, j) => x + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
  }
  return s[4];
}

describe('convergence', () => {
  it('a stiff-spring face converges to the constrained wedge as the stiffness grows', () => {
    const t = 0.4;
    const exact = 0.5 * freeWedge(1, 4, 30).A * t * t;
    const errs = [1e3, 1e4, 1e5].map((k) => relativeError(penaltyWedgeX(1, 4, 30, k, t), exact));
    expect(errs[1]).toBeLessThan(errs[0]);
    expect(errs[2]).toBeLessThan(errs[1]);
    expect(errs[2]).toBeLessThan(0.01);
  });
});
