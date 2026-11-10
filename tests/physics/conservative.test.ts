import { describe, expect, it } from 'vitest';
import {
  arcPath,
  circle,
  curl3,
  curlZ,
  forceFromPotential,
  gradient,
  inverseSquare,
  lineIntegral,
  lineIntegral3,
  minDistance,
  pointVortex,
  polylineWork,
  potentialFrom,
  potentialFrom3,
  reversed,
  samplePath,
  segment,
  shear,
  signedArea,
  sPath,
  springField,
  uniformGravity,
  vortex,
  type Field2,
  type Field3,
  type Path2,
} from '~/physics/conservative';
import { G } from '~/physics/constants';
import { relativeError, type Vec2 } from '~/physics/vec';

const A: Vec2 = [-1.3, -0.4];
const B: Vec2 = [1.1, 0.9];
/** The loop: path 1 from A to B, then path 2 back from B to A. */
const loopWork = (F: Field2, p1: Path2, p2: Path2) => lineIntegral(F, p1) + lineIntegral(F, reversed(p2));

const CONSERVATIVE = {
  gravity: uniformGravity(0.5, G),
  spring: springField(4),
  inverseSquare: inverseSquare(2),
};

describe('analytic limits', () => {
  it('the curl of a gradient is zero: −∇U has (∇×F)_z = 0 for every potential, at every point', () => {
    const potentials = [
      (x: number, y: number) => x * x * y,
      (x: number, y: number) => Math.sin(x) * Math.exp(y),
      (x: number, y: number) => -2 / Math.hypot(x, y),
      (x: number, y: number) => 3 * x * x * x - x * y * y,
    ];
    for (const U of potentials) {
      // with one step h for both differences, the difference operators commute exactly, as ∂x∂y = ∂y∂x does:
      // what is left is round-off, of order ε|U|/h²
      const F = forceFromPotential(U, 1e-3);
      for (const [x, y] of [[0.7, -0.3], [1.2, 0.8], [-0.5, 1.5]] as const) {
        expect(Math.abs(curlZ(F, x, y, 1e-3))).toBeLessThan(1e-8);
      }
    }
  });

  it('the curl of the vortex k(−y, x) is 2k and of the shear (ky, 0) is −k, at every point', () => {
    for (const [x, y] of [[0, 0], [1.4, -0.6], [-2, 3]] as const) {
      expect(relativeError(curlZ(vortex(1.5).F, x, y), 3)).toBeLessThan(1e-9);
      expect(relativeError(curlZ(shear(2).F, x, y), -2)).toBeLessThan(1e-9);
    }
  });

  it('the 3D curl of a gradient is the zero vector; of the rotation ω×r it is 2ω', () => {
    const F: Field3 = (x, y, z) => [-y * z, -x * z, -x * y]; // −∇(xyz)
    const c = curl3(F, 0.4, -1.1, 0.9);
    for (const v of c) expect(Math.abs(v)).toBeLessThan(1e-8);
    const w = [0.3, -0.7, 1.2] as const;
    const rot: Field3 = (x, y, z) => [w[1] * z - w[2] * y, w[2] * x - w[0] * z, w[0] * y - w[1] * x];
    const r = curl3(rot, 1, 2, -0.5);
    r.forEach((v, i) => expect(relativeError(v, 2 * w[i])).toBeLessThan(1e-9));
  });

  it('a conservative field does zero work around a closed loop: gravity, the spring and the inverse-square centre', () => {
    for (const { F } of Object.values(CONSERVATIVE)) {
      for (const bulge of [-1.4, 0.6, 1.8]) {
        expect(Math.abs(loopWork(F, segment(A, B), arcPath(A, B, bulge)))).toBeLessThan(1e-9);
        expect(Math.abs(loopWork(F, segment(A, B), sPath(A, B, bulge)))).toBeLessThan(1e-9);
      }
      expect(Math.abs(lineIntegral(F, circle([0.4, 0.3], 0.9, 0.2), 800))).toBeLessThan(1e-9);
    }
  });

  it('the inverse-square centre does zero work even on a loop that goes around the centre (it has a potential −K/r)', () => {
    const { F } = inverseSquare(2);
    expect(Math.abs(lineIntegral(F, circle([0, 0], 0.8), 800))).toBeLessThan(1e-12);
    const a: Vec2 = [-1.4, 0.6];
    const b: Vec2 = [1.4, 0.6];
    // the arc dips to y = 0.6 − 2.4/2 = −0.6: the loop encloses the centre
    expect(Math.abs(loopWork(F, segment(a, b), arcPath(a, b, -2.4)))).toBeLessThan(1e-7);
  });

  it('Stokes: the vortex does work 2k × (enclosed area) around a loop, counterclockwise positive', () => {
    const k = 1.5;
    const { F } = vortex(k);
    // a circle of radius R: 2πkR²
    expect(relativeError(lineIntegral(F, circle([0.3, -0.2], 0.7)), 2 * Math.PI * k * 0.49)).toBeLessThan(1e-12);
    expect(relativeError(lineIntegral(F, circle([0.3, -0.2], 0.7, 0, true)), -2 * Math.PI * k * 0.49)).toBeLessThan(1e-12);
    // straight path out, arc back: the area between the chord and the quadratic Bézier is L·bulge/3
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (const bulge of [-1.2, 0.8]) {
      const W = loopWork(F, segment(A, B), arcPath(A, B, bulge));
      // path 1 then path 2 reversed runs counterclockwise when the arc bulges to the left of A→B
      expect(relativeError(W, (2 * k * (L * bulge)) / 3)).toBeLessThan(1e-12);
    }
  });

  it('the S path makes two lobes of opposite orientation: zero net area, so equal work on both paths even in the vortex', () => {
    const { F } = vortex(1.5);
    const W1 = lineIntegral(F, segment(A, B));
    const W2 = lineIntegral(F, sPath(A, B, 1.1));
    expect(relativeError(W1, W2)).toBeLessThan(1e-12);
    const loop = [...samplePath(segment(A, B), 50), ...samplePath(reversed(sPath(A, B, 1.1)), 400)];
    expect(Math.abs(signedArea(loop))).toBeLessThan(1e-9);
  });

  it('the point vortex k(−y, x)/r² has zero curl off the centre, zero work on a loop that misses it, and 2πk around it', () => {
    const k = 0.8;
    const { F } = pointVortex(k);
    for (const [x, y] of [[0.5, 0.2], [-1.3, 0.7], [2, -2]] as const) expect(Math.abs(curlZ(F, x, y))).toBeLessThan(1e-8);
    expect(Math.abs(lineIntegral(F, circle([1.5, 0.5], 0.6), 800))).toBeLessThan(1e-10);
    for (const R of [0.2, 1, 5]) expect(relativeError(lineIntegral(F, circle([0, 0], R), 800), 2 * Math.PI * k)).toBeLessThan(1e-12);
  });

  it('the work of uniform gravity from A to B is −mg(y_B − y_A) along any path', () => {
    const m = 0.5;
    const { F } = uniformGravity(m, G);
    const expected = -m * G * (B[1] - A[1]);
    for (const p of [segment(A, B), arcPath(A, B, 1.7), sPath(A, B, -0.9)]) expect(relativeError(lineIntegral(F, p), expected)).toBeLessThan(1e-12);
  });
});

describe('conservation and consistency', () => {
  it('−∇U recovers the field of every conservative preset', () => {
    for (const { F, U } of Object.values(CONSERVATIVE)) {
      const back = forceFromPotential(U!, 1e-5);
      for (const [x, y] of [[0.6, -0.8], [-1.2, 0.5], [1.5, 1.1]] as const) {
        const f = F(x, y);
        const g = back(x, y);
        expect(relativeError(g[0], f[0]) < 1e-8 || Math.abs(g[0] - f[0]) < 1e-9).toBe(true);
        expect(relativeError(g[1], f[1])).toBeLessThan(1e-8);
      }
    }
  });

  it('the potential built by integrating F from a reference point equals U(r) − U(r₀), whatever the reference', () => {
    for (const { F, U } of Object.values(CONSERVATIVE)) {
      for (const ref of [[0.9, 0.9], [-1.5, 0.4]] as Vec2[]) {
        const p: Vec2 = [1.3, -0.7];
        expect(relativeError(potentialFrom(F, ref, p, 4000), U!(...p) - U!(...ref))).toBeLessThan(1e-10);
      }
    }
  });

  it('ΔU = −W: the drop in potential energy from A to B equals the work of the force', () => {
    for (const { F, U } of Object.values(CONSERVATIVE)) {
      expect(relativeError(U!(...B) - U!(...A), -lineIntegral(F, arcPath(A, B, 0.9), 4000))).toBeLessThan(1e-10);
    }
  });

  it('the force is perpendicular to the level curves of U: along a level-curve tangent F·t = 0', () => {
    for (const { F, U } of Object.values(CONSERVATIVE)) {
      for (const [x, y] of [[0.8, 0.3], [-1.1, -0.9]] as const) {
        const g = gradient(U!, x, y);
        const t: Vec2 = [-g[1], g[0]]; // tangent to the level curve through (x, y)
        const f = F(x, y);
        expect(Math.abs(f[0] * t[0] + f[1] * t[1])).toBeLessThan(1e-6 * Math.hypot(...f) * Math.hypot(...t));
        // and it points down the potential: F·∇U < 0
        expect(f[0] * g[0] + f[1] * g[1]).toBeLessThan(0);
      }
    }
  });

  it('a 3D conservative force: the work along a helix equals −ΔU of U = −axyz', () => {
    const a = 2;
    const F: Field3 = (x, y, z) => [a * y * z, a * x * z, a * x * y];
    const R = 1;
    const b = 0.5;
    const T = Math.PI / 4;
    const helix = {
      r: (s: number) => [R * Math.cos(T * s), R * Math.sin(T * s), b * T * s] as const,
      dr: (s: number) => [-R * T * Math.sin(T * s), R * T * Math.cos(T * s), b * T] as const,
    };
    const end = helix.r(1);
    const W = lineIntegral3(F, helix);
    expect(relativeError(W, a * end[0] * end[1] * end[2])).toBeLessThan(1e-10);
    expect(relativeError(potentialFrom3(F, [0, 0, 0], end), -a * end[0] * end[1] * end[2])).toBeLessThan(1e-10);
  });

  it('the signed area of the figure loop (path 1 out, arc back) is +|AB|·bulge/3 for a left bulge, and curl × area is the loop work', () => {
    // the loop exactly as the figure samples it: 60 points on the chord, 300 on the arc run backwards
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (const bulge of [1.6, -1.6, 0.7]) {
      const loop = [...samplePath(segment(A, B), 60), ...samplePath(reversed(arcPath(A, B, bulge)), 300)];
      const S = signedArea(loop);
      expect(Math.sign(S)).toBe(Math.sign(bulge));
      expect(relativeError(S, (L * bulge) / 3)).toBeLessThan(1e-4);
      for (const { F } of [vortex(1.5), shear(2)]) {
        const curl = curlZ(F, 0.3, -0.4);
        const W = loopWork(F, segment(A, B), arcPath(A, B, bulge));
        expect(relativeError(curl * S, W)).toBeLessThan(1e-4);
      }
    }
  });

  it('minDistance finds how close a path comes to a point: zero through it, R on a circle about it, the offset of a line', () => {
    const c: Vec2 = [0, 0];
    expect(minDistance(segment([-1, -1], [1, 1]), c, 400)).toBeLessThan(1e-12);
    expect(relativeError(minDistance(circle(c, 0.8), c), 0.8)).toBeLessThan(1e-12);
    expect(relativeError(minDistance(segment([-1, 0.5], [1, 0.5]), c, 400), 0.5)).toBeLessThan(1e-12);
    // the arc of the "around the centre" step dips to y = 0.6 − 2.4/2 = −0.6: it passes 0.6 m from the centre
    expect(relativeError(minDistance(arcPath([-1.4, 0.6], [1.4, 0.6], -2.4), c, 400), 0.6)).toBeLessThan(1e-9);
  });

  it('reversing a path flips the sign of the work', () => {
    const { F } = shear(2);
    const p = arcPath(A, B, 0.7);
    expect(relativeError(lineIntegral(F, reversed(p)), -lineIntegral(F, p))).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('the loop work of the vortex grows as the square of the loop size (2πkR²), the curl stays the same', () => {
    const { F } = vortex(1.5);
    const W1 = lineIntegral(F, circle([0, 0], 0.5));
    const W2 = lineIntegral(F, circle([0, 0], 1.0));
    expect(relativeError(W2 / W1, 4)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the central-difference curl converges at second order in h', () => {
    // a field with a non-trivial third derivative: F = (sin y·e^x, x³y)
    const F: Field2 = (x, y) => [Math.sin(y) * Math.exp(x), x * x * x * y];
    const [x, y] = [0.4, 0.7];
    const exact = 3 * x * x * y - Math.cos(y) * Math.exp(x);
    const e1 = Math.abs(curlZ(F, x, y, 0.02) - exact);
    const e2 = Math.abs(curlZ(F, x, y, 0.01) - exact);
    expect(e1 / e2).toBeGreaterThan(3.8);
    expect(e1 / e2).toBeLessThan(4.2);
  });

  it('the central-difference gradient converges at second order in h', () => {
    const U = (x: number, y: number) => Math.sin(x) * Math.exp(y) + x * x * x * y;
    const [x, y] = [0.4, 0.7];
    const exact = [Math.cos(x) * Math.exp(y) + 3 * x * x * y, Math.sin(x) * Math.exp(y) + x * x * x];
    const err = (h: number) => {
      const g = gradient(U, x, y, h);
      return Math.hypot(g[0] - exact[0], g[1] - exact[1]);
    };
    expect(err(0.02) / err(0.01)).toBeGreaterThan(3.8);
    expect(err(0.02) / err(0.01)).toBeLessThan(4.2);
  });

  it('the central-difference 3D curl converges at second order in h', () => {
    // F = (sin y·e^z, x³z, cos x·y²): ∇×F = (2y·cos x − x³, sin y·e^z + y²·sin x, 3x²z − cos y·e^z)
    const F: Field3 = (x, y, z) => [Math.sin(y) * Math.exp(z), x * x * x * z, Math.cos(x) * y * y];
    const [x, y, z] = [0.4, 0.7, -0.3];
    const exact = [
      2 * Math.cos(x) * y - x * x * x,
      Math.sin(y) * Math.exp(z) + Math.sin(x) * y * y,
      3 * x * x * z - Math.cos(y) * Math.exp(z),
    ];
    const err = (h: number) => {
      const c = curl3(F, x, y, z, h);
      return Math.hypot(c[0] - exact[0], c[1] - exact[1], c[2] - exact[2]);
    };
    expect(err(0.02) / err(0.01)).toBeGreaterThan(3.8);
    expect(err(0.02) / err(0.01)).toBeLessThan(4.2);
  });

  it('the Simpson line integral converges at fourth order in the number of pieces', () => {
    const { F } = shear(2);
    const p = arcPath(A, B, 1.3);
    const ref = lineIntegral(F, p, 4000);
    // F = (2y, 0) on a quadratic Bézier is a cubic polynomial in s, which Simpson integrates exactly
    expect(relativeError(lineIntegral(F, p, 4), ref)).toBeLessThan(1e-12);
    // a smooth non-polynomial integrand on an open path (a closed circle is periodic and converges faster than any power)
    const G2: Field2 = (x, y) => [Math.cos(y), x * Math.exp(-x)];
    const c = arcPath([0.2, 0.1], [1.3, 1.2], 0.8);
    const exact = lineIntegral(G2, c, 20000);
    const e1 = Math.abs(lineIntegral(G2, c, 20) - exact);
    const e2 = Math.abs(lineIntegral(G2, c, 40) - exact);
    expect(e1 / e2).toBeGreaterThan(14);
    expect(e1 / e2).toBeLessThan(18);
  });

  it('the polyline (midpoint) work converges at second order in the number of points', () => {
    const { F } = vortex(1.5);
    const c = circle([0, 0], 0.8);
    const exact = 2 * Math.PI * 1.5 * 0.64;
    const e = (n: number) => Math.abs(polylineWork(F, samplePath(c, n).slice(0, n), true) - exact);
    expect(e(50) / e(100)).toBeGreaterThan(3.8);
    expect(e(50) / e(100)).toBeLessThan(4.2);
  });
});
