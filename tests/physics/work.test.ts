import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { springForce } from '~/physics/forcelaw';
import {
  bezierPath,
  chordSum,
  constantForceWork,
  gravityField,
  kinetic,
  lineIntegral,
  linePath,
  pathLength,
  polarPath,
  shearField,
  shearLineWork,
  springField,
  springWork,
  trajectoryWork,
  uniformField,
  workPieces,
  type Path,
} from '~/physics/work';
import { dot, len, relativeError, sub, type Vec2 } from '~/physics/vec';

const A: Vec2 = [-1.5, 1.0];
const B: Vec2 = [1.5, 0.2];
/** three shapes between the same two points: a segment, a polar arc about O, a Bézier curve that rises above A */
const PATHS: Record<string, Path> = {
  line: linePath(A, B),
  polar: polarPath(A, B),
  bezier: bezierPath(A, [0.2, 2.4], B),
  dip: bezierPath(A, [-0.5, -1.6], B),
};

describe('analytic limits', () => {
  it('a constant force does work F·Δr whatever the shape of the path', () => {
    const F: Vec2 = [2.5, -3.0];
    const W = constantForceWork(F, A, B);
    // the polar path's tangent is not a polynomial in s, so the midpoint rule needs many pieces to reach 1e-8
    for (const path of Object.values(PATHS)) expect(relativeError(lineIntegral(uniformField(F), path, 20000), W)).toBeLessThan(1e-8);
  });

  it('gravity does work m g h, the weight times the drop, along every path', () => {
    const m = 0.4;
    for (const path of Object.values(PATHS))
      expect(relativeError(lineIntegral(gravityField(m), path, 20000), m * G * (A[1] - B[1]))).toBeLessThan(1e-8);
  });

  it('a zero-length spring does work ½k(r_A² − r_B²) along every path', () => {
    const k = 3;
    const W = springWork(k, A, B);
    expect(relativeError(W, 0.5 * k * (dot(A, A) - dot(B, B)))).toBeLessThan(1e-15);
    for (const path of Object.values(PATHS)) expect(relativeError(lineIntegral(springField(k), path, 20000), W)).toBeLessThan(1e-8);
  });

  it('the spring field in the plane agrees with the one-dimensional spring of lesson 2.8 along a line through O', () => {
    const k = 50;
    const along = lineIntegral(springField(k), linePath([0.1, 0], [0.4, 0]));
    // ∫ F dx with F = −kx, by midpoint pieces
    let oneD = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) oneD += springForce(k)(0.1 + ((i + 0.5) * 0.3) / n) * (0.3 / n);
    expect(relativeError(along, oneD)).toBeLessThan(1e-6);
  });

  it('a force perpendicular to the motion does no work: a spring along a circle about its anchor, gravity along a level line', () => {
    const k = 3;
    const arc = polarPath([-1.2, 0.9], [1.5, 0]);
    expect(Math.abs(lineIntegral(springField(k), arc))).toBeLessThan(1e-12);
    // every chord of the arc is perpendicular to the force at its middle, so every piece is zero, not just the sum
    for (const p of workPieces(springField(k), arc, 16)) expect(Math.abs(p.dW)).toBeLessThan(1e-12);
    expect(Math.abs(lineIntegral(gravityField(1), linePath([-1, 0.5], [2, 0.5])))).toBeLessThan(1e-12);
  });

  it('the polar path is an arc of the circle about O when the ends are equally far from O', () => {
    const arc = polarPath([-1.2, 0.9], [1.5, 0]);
    for (const s of [0, 0.3, 0.71, 1]) expect(relativeError(len(arc.at(s)), 1.5)).toBeLessThan(1e-14);
    // length = radius × angle turned
    const turn = Math.atan2(0.9, -1.2);
    expect(relativeError(pathLength(arc, 2000), 1.5 * turn)).toBeLessThan(1e-6);
  });

  it('the shear force (c y, 0) does different work along different paths between the same points', () => {
    const c = 3;
    const line = lineIntegral(shearField(c), PATHS.line);
    expect(relativeError(line, shearLineWork(c, A, B))).toBeLessThan(1e-12);
    // the Bézier above the line passes where y is larger while x grows: more work; the one below, less
    const up = lineIntegral(shearField(c), PATHS.bezier);
    const down = lineIntegral(shearField(c), PATHS.dip);
    expect(up).toBeGreaterThan(line + 1);
    expect(down).toBeLessThan(line - 1);
    // along x then y, and along y then x (the ladder's paths): c·y·Δx on the level legs only
    expect(lineIntegral(shearField(2), linePath([0, 0], [1, 0])) + lineIntegral(shearField(2), linePath([1, 0], [1, 1]))).toBeCloseTo(0, 12);
    expect(relativeError(lineIntegral(shearField(2), linePath([0, 0], [0, 1])) + lineIntegral(shearField(2), linePath([0, 1], [1, 1])), 2)).toBeLessThan(1e-12);
    expect(relativeError(lineIntegral(shearField(2), linePath([0, 0], [1, 1])), 1)).toBeLessThan(1e-12);
  });

  it('reversing the path reverses the sign of the work', () => {
    const F = shearField(3);
    const back = bezierPath(B, [0.2, 2.4], A);
    expect(relativeError(lineIntegral(F, back), -lineIntegral(F, PATHS.bezier))).toBeLessThan(1e-9);
  });

  it('the tangent by central difference agrees with the closed form', () => {
    const p = PATHS.bezier;
    const bare: Path = { at: p.at };
    expect(relativeError(lineIntegral(shearField(3), bare), lineIntegral(shearField(3), p))).toBeLessThan(1e-8);
  });
});

describe('conservation', () => {
  it('the work-energy theorem: W_net = ΔK at every instant of an RK4 trajectory under a spring', () => {
    const m = 0.4;
    const run = trajectoryWork(springField(3), m, [1.5, 0], [0, 2.2], 1e-3, 3000);
    for (const s of run.filter((_, i) => i % 250 === 0 && i > 0))
      expect(relativeError(s.W, s.K - run[0].K) * Math.abs(s.K - run[0].K)).toBeLessThan(1e-10 * run[0].K);
  });

  it('W_net = ΔK for a projectile (uniform gravity) and for the shear force, to a relative 1e-8', () => {
    const m = 0.4;
    for (const F of [gravityField(m), shearField(3)]) {
      const run = trajectoryWork(F, m, [-1.6, -0.6], [2, 3.5], 1e-3, 900);
      const end = run[run.length - 1];
      expect(relativeError(end.W, end.K - run[0].K)).toBeLessThan(1e-8);
    }
  });

  it('over a whole period of the spring the body returns with its kinetic energy and the net work is zero', () => {
    const m = 0.4;
    const k = 3;
    const T = 2 * Math.PI * Math.sqrt(m / k);
    const n = 4000;
    const run = trajectoryWork(springField(k), m, [1.5, 0], [0, 2.2], T / n, n);
    const end = run[run.length - 1];
    expect(Math.abs(end.W)).toBeLessThan(1e-9 * run[0].K);
    expect(relativeError(end.K, run[0].K)).toBeLessThan(1e-9);
  });

  it('a projectile: the work of gravity equals m g times the drop, and the speed follows from it', () => {
    const m = 0.4;
    const v0: Vec2 = [2.25, 3.9];
    const run = trajectoryWork(gravityField(m), m, [0, 0], v0, 1e-3, 700);
    const end = run[run.length - 1];
    expect(relativeError(end.W, -m * G * end.pos[1])).toBeLessThan(1e-9);
    expect(relativeError(Math.hypot(...end.vel), Math.sqrt(dot(v0, v0) - 2 * G * end.pos[1]))).toBeLessThan(1e-9);
  });

  it('the trajectory stops when the caller says so', () => {
    const run = trajectoryWork(gravityField(1), 1, [0, 0], [1, 0], 1e-2, 1000, (s) => s.pos[1] > -1);
    expect(run[run.length - 1].pos[1]).toBeLessThanOrEqual(-1);
    expect(run[run.length - 2].pos[1]).toBeGreaterThan(-1);
  });
});

describe('scaling', () => {
  it('the work is bilinear: double the force, double the work; the spring work grows as the square of the size of the path', () => {
    const W1 = lineIntegral(shearField(3), PATHS.bezier);
    expect(relativeError(lineIntegral(shearField(6), PATHS.bezier), 2 * W1)).toBeLessThan(1e-12);
    const k = 3;
    const small = lineIntegral(springField(k), bezierPath([0.5, 0.5], [1, 1], [1, 0]));
    const big = lineIntegral(springField(k), bezierPath([1.5, 1.5], [3, 3], [3, 0]));
    expect(relativeError(big, 9 * small)).toBeLessThan(1e-9);
  });

  it('the kinetic energy is ½mv²: double the speed, four times the energy', () => {
    expect(relativeError(kinetic(2, [6, 8]), 100)).toBeLessThan(1e-15);
    expect(relativeError(kinetic(2, [12, 16]), 4 * kinetic(2, [6, 8]))).toBeLessThan(1e-15);
  });
});

describe('convergence', () => {
  const F = shearField(3);
  const exact = lineIntegral(F, PATHS.bezier, 20000);

  it('the midpoint rule in s converges as 1/n²: doubling n divides the error by about 4', () => {
    for (const n of [8, 16, 32]) {
      const e1 = Math.abs(lineIntegral(F, PATHS.bezier, n) - exact);
      const e2 = Math.abs(lineIntegral(F, PATHS.bezier, 2 * n) - exact);
      expect(e1 / e2).toBeGreaterThan(3.6);
      expect(e1 / e2).toBeLessThan(4.4);
    }
  });

  it('the left rule converges only as 1/n: doubling n halves the error', () => {
    for (const n of [16, 32, 64]) {
      const e1 = Math.abs(lineIntegral(F, PATHS.bezier, n, 'left') - exact);
      const e2 = Math.abs(lineIntegral(F, PATHS.bezier, 2 * n, 'left') - exact);
      expect(e1 / e2).toBeGreaterThan(1.8);
      expect(e1 / e2).toBeLessThan(2.2);
    }
  });

  it('the chord sum the figure draws converges as 1/n² to the line integral', () => {
    for (const n of [8, 16, 32]) {
      const e1 = Math.abs(chordSum(F, PATHS.bezier, n) - exact);
      const e2 = Math.abs(chordSum(F, PATHS.bezier, 2 * n) - exact);
      expect(e1 / e2).toBeGreaterThan(3.5);
      expect(e1 / e2).toBeLessThan(4.5);
    }
    expect(relativeError(chordSum(F, PATHS.bezier, 512), exact)).toBeLessThan(1e-5);
  });

  it('W − ΔK along an RK4 trajectory under a spring falls at least as dt⁴: halving dt divides it by 16 or more', () => {
    const m = 0.4;
    const gap = (dt: number) => {
      const n = Math.round(1.2 / dt);
      const run = trajectoryWork(springField(3), m, [-1.6, -0.6], [1, 1.5], dt, n);
      const end = run[run.length - 1];
      return Math.abs(end.W - (end.K - run[0].K));
    };
    for (const dt of [0.04, 0.02]) expect(gap(dt) / gap(dt / 2)).toBeGreaterThan(14);
    // under the shear force the motion is a polynomial in t (x cubic, y linear), which RK4 and Simpson follow exactly
    const run = trajectoryWork(shearField(3), m, [-1.6, -0.6], [1, 1.5], 0.08, 15);
    const end = run[run.length - 1];
    expect(relativeError(end.W, end.K - run[0].K)).toBeLessThan(1e-12);
  });

  it('the work by central-difference tangents keeps agreeing as n grows (no early floor)', () => {
    const bare: Path = { at: PATHS.polar.at };
    const W = springWork(3, A, B);
    expect(relativeError(lineIntegral(springField(3), bare, 2000), W)).toBeLessThan(1e-7);
    expect(relativeError(len(sub(bare.at(1), B)) + 1, 1)).toBeLessThan(1e-12);
  });
});
