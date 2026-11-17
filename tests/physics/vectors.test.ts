import { describe, expect, it } from 'vitest';
import { add3, cross3, dot, dot3, len, len3, relativeError, scale3, type Vec2, type Vec3 } from '~/physics/vec';
import {
  angleBetween,
  angleBetween3,
  crossZ,
  depthOf,
  fromPolar,
  lift,
  parallelogramArea3,
  perpendicularPart3,
  scalarProjection,
  scalarProjection3,
  signedTurn,
  sumMagnitude,
  toPolar,
  triangleArea3,
  tripleProduct,
  vectorProjection3,
} from '~/physics/vectors';

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
const vecErr3 = (a: Vec3, b: Vec3) => len3([a[0] - b[0], a[1] - b[1], a[2] - b[2]]) / Math.max(len3(a), len3(b), 1e-300);

/** A deterministic spread of vectors (no randomness: a failing case must be reproducible). */
const SAMPLE: Vec3[] = [
  [3, 4, 0],
  [2, -1, 2],
  [30, 20, 10],
  [0.4, 0.3, 0],
  [10, 20, 30],
  [-1.7, 0.2, 5.5],
  [1e-3, -2e-3, 4e-3],
  [-6, 2, 0],
];

describe('analytic limits', () => {
  it('a vector of magnitude F at angle α has components F cos α and F sin α, and magnitude and angle come back', () => {
    for (const [F, a] of [[40, Math.PI / 6], [5, 2.5], [1, -1.1], [7, Math.PI]] as const) {
      const v = fromPolar(F, a);
      expect(relativeError(v[0], F * Math.cos(a))).toBeLessThan(1e-15);
      expect(relativeError(v[1], F * Math.sin(a))).toBeLessThan(1e-15);
      const back = toPolar(v);
      expect(relativeError(back.mag, F)).toBeLessThan(1e-15);
      expect(relativeError(back.angle, a)).toBeLessThan(1e-14);
    }
  });

  it('toPolar picks the quadrant: (−3, 4) is at 126.9°, not at arctan(4/−3) = −53.1°', () => {
    const { angle } = toPolar([-3, 4]);
    expect(relativeError((angle * 180) / Math.PI, 126.8698976)).toBeLessThan(1e-9);
  });

  it('parallel vectors: A·B = AB and A×B = 0; antiparallel: A·B = −AB', () => {
    for (const a of SAMPLE) {
      const b = scale3(a, 2.5);
      expect(relativeError(dot3(a, b), len3(a) * len3(b))).toBeLessThan(1e-14);
      expect(len3(cross3(a, b)) / (len3(a) * len3(b))).toBeLessThan(1e-15);
      expect(relativeError(dot3(a, scale3(a, -1)), -(len3(a) ** 2))).toBeLessThan(1e-15);
      expect(angleBetween3(a, b)).toBeLessThan(1e-15);
      expect(relativeError(angleBetween3(a, scale3(a, -1)), Math.PI)).toBeLessThan(1e-15);
    }
  });

  it('perpendicular vectors: A·B = 0 and |A×B| = AB; two perpendicular unit vectors give |û×ŵ| = 1', () => {
    const a: Vec3 = [1, 2, 2];
    const b: Vec3 = [2, -2, 1];
    expect(dot3(a, b)).toBe(0);
    expect(relativeError(len3(cross3(a, b)), len3(a) * len3(b))).toBeLessThan(1e-15);
    expect(relativeError(angleBetween3(a, b), Math.PI / 2)).toBeLessThan(1e-15);
    for (const th of [0.3, 1.9, -2.2]) {
      const u = lift(fromPolar(1, th));
      const w = lift(fromPolar(1, th + Math.PI / 2));
      expect(relativeError(len3(cross3(u, w)), 1)).toBeLessThan(1e-15);
    }
  });

  it('the unit vectors of the axes: x̂×ŷ = ẑ, ŷ×ẑ = x̂, ẑ×x̂ = ŷ, the reversed order gives the minus, and x̂×x̂ = 0', () => {
    expect(cross3(X, Y)).toEqual(Z);
    expect(cross3(Y, Z)).toEqual(X);
    expect(cross3(Z, X)).toEqual(Y);
    expect(cross3(Y, X)).toEqual([0, 0, -1]);
    expect(len3(cross3(X, X))).toBe(0);
    expect(dot3(X, Y)).toBe(0);
    expect(dot3(Z, Z)).toBe(1);
  });

  it('in the page: right × up is out of the page (⊙), and the turn from A to B is counter-clockwise exactly when (A×B)_z > 0', () => {
    expect(depthOf(crossZ([1, 0], [0, 1]))).toBe('out');
    expect(depthOf(crossZ([0, 1], [1, 0]))).toBe('in');
    expect(depthOf(crossZ([2, 1], [4, 2]))).toBe('none');
    for (let k = 1; k < 12; k++) {
      const turn = -Math.PI + (k * 2 * Math.PI) / 12 + 0.05;
      const a = fromPolar(1.3, 0.4);
      const b = fromPolar(2.1, 0.4 + turn);
      expect(Math.sign(crossZ(a, b))).toBe(Math.sign(Math.sin(turn)));
      expect(relativeError(signedTurn(a, b), turn)).toBeLessThan(1e-12);
    }
  });

  it('the magnitude of a sum: A + B when parallel, |A − B| when antiparallel, √(A² + B²) when perpendicular', () => {
    expect(relativeError(sumMagnitude(300, 200, 0), 500)).toBeLessThan(1e-15);
    expect(relativeError(sumMagnitude(300, 200, Math.PI), 100)).toBeLessThan(1e-12);
    expect(relativeError(sumMagnitude(300, 200, Math.PI / 2), Math.hypot(300, 200))).toBeLessThan(1e-12);
  });
});

describe('identities', () => {
  it('A×B is perpendicular to both A and B', () => {
    for (const a of SAMPLE) {
      for (const b of SAMPLE) {
        const c = cross3(a, b);
        const scaleAB = len3(a) * len3(b) * Math.max(len3(a), len3(b)) || 1;
        expect(Math.abs(dot3(c, a)) / scaleAB).toBeLessThan(1e-14);
        expect(Math.abs(dot3(c, b)) / scaleAB).toBeLessThan(1e-14);
      }
    }
  });

  it('the order matters: B×A = −A×B, while A·B = B·A', () => {
    for (const a of SAMPLE) {
      for (const b of SAMPLE) {
        expect(vecErr3(cross3(b, a), scale3(cross3(a, b), -1)) || 0).toBeLessThan(1e-15);
        expect(dot3(a, b)).toBe(dot3(b, a));
      }
    }
  });

  it('the component formulas agree with the definitions: A·B = AB cos θ and |A×B| = AB sin θ (Lagrange: |A×B|² + (A·B)² = A²B²)', () => {
    for (const a of SAMPLE) {
      for (const b of SAMPLE) {
        const AB = len3(a) * len3(b);
        const th = angleBetween3(a, b);
        expect(Math.abs(dot3(a, b) - AB * Math.cos(th)) / AB).toBeLessThan(1e-14);
        expect(Math.abs(len3(cross3(a, b)) - AB * Math.sin(th)) / AB).toBeLessThan(1e-14);
        expect(relativeError(len3(cross3(a, b)) ** 2 + dot3(a, b) ** 2, AB * AB)).toBeLessThan(1e-13);
      }
    }
  });

  it('the law of cosines is the dot product of a sum with itself: |A + B|² = A² + B² + 2A·B', () => {
    for (const a of SAMPLE) {
      for (const b of SAMPLE) {
        const s = add3(a, b);
        const rhs = sumMagnitude(len3(a), len3(b), angleBetween3(a, b));
        expect(Math.abs(len3(s) - rhs) / (len3(a) + len3(b))).toBeLessThan(1e-13);
      }
    }
  });

  it('a vector is its projection on a direction plus a perpendicular part, and their magnitudes add by Pythagoras', () => {
    const F: Vec3 = [30, 20, 10];
    const u: Vec3 = [0.6, 0.8, 0];
    const par = vectorProjection3(F, u);
    const perp = perpendicularPart3(F, u);
    expect(vecErr3(add3(par, perp), F)).toBeLessThan(1e-15);
    expect(Math.abs(dot3(perp, u))).toBeLessThan(1e-13);
    expect(relativeError(scalarProjection3(F, u), 34)).toBeLessThan(1e-14);
    expect(relativeError(len3(perp), Math.sqrt(1400 - 34 * 34))).toBeLessThan(1e-14);
    expect(relativeError(scalarProjection3(F, X), F[0])).toBeLessThan(1e-15);
  });

  it('the plane projection is the space projection of the lifted vectors', () => {
    const a: Vec2 = [2, 3];
    const b: Vec2 = [4, 1];
    expect(relativeError(scalarProjection(a, b), scalarProjection3(lift(a), lift(b)))).toBeLessThan(1e-15);
    expect(relativeError(crossZ(a, b), cross3(lift(a), lift(b))[2])).toBeLessThan(1e-15);
    expect(relativeError(angleBetween(a, b), Math.acos(dot(a, b) / (len(a) * len(b))))).toBeLessThan(1e-13);
  });

  it('A·(B×C) is unchanged by a cyclic swap and is zero when C lies in the plane of A and B', () => {
    const [a, b, c] = [SAMPLE[1], SAMPLE[5], SAMPLE[4]];
    const v = tripleProduct(a, b, c);
    expect(relativeError(tripleProduct(b, c, a), v)).toBeLessThan(1e-13);
    expect(relativeError(tripleProduct(c, a, b), v)).toBeLessThan(1e-13);
    expect(relativeError(tripleProduct(X, Y, Z), 1)).toBeLessThan(1e-15);
    const inPlane = add3(scale3(a, 0.7), scale3(b, -1.3));
    expect(Math.abs(tripleProduct(a, b, inPlane)) / (len3(a) * len3(b) * len3(inPlane))).toBeLessThan(1e-14);
  });

  it('a triangle is half the parallelogram: the right triangle (0,0,0), (3,0,0), (0,4,0) has area 6', () => {
    expect(relativeError(triangleArea3([0, 0, 0], [3, 0, 0], [0, 4, 0]), 6)).toBeLessThan(1e-15);
    expect(relativeError(parallelogramArea3([2, 0, 1], [0, 3, 1]), 7)).toBeLessThan(1e-15);
  });
});

describe('scaling', () => {
  it('both products are linear in each factor: (kA)·B = k(A·B) and (kA)×B = k(A×B)', () => {
    for (const k of [-3, 0.5, 7]) {
      for (const a of SAMPLE) {
        const b = SAMPLE[2];
        expect(Math.abs(dot3(scale3(a, k), b) - k * dot3(a, b)) / (Math.abs(k) * len3(a) * len3(b))).toBeLessThan(1e-14);
        expect(vecErr3(cross3(scale3(a, k), b), scale3(cross3(a, b), k)) || 0).toBeLessThan(1e-14);
      }
    }
  });

  it('turning the axes leaves A·B and |A×B| unchanged: they are scalars; the components change', () => {
    const rotZ = (v: Vec3, t: number): Vec3 => [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t), v[2]];
    const rotX = (v: Vec3, t: number): Vec3 => [v[0], v[1] * Math.cos(t) - v[2] * Math.sin(t), v[1] * Math.sin(t) + v[2] * Math.cos(t)];
    const R = (v: Vec3) => rotX(rotZ(v, 0.83), -1.4);
    for (const a of SAMPLE) {
      for (const b of SAMPLE) {
        const AB = len3(a) * len3(b);
        expect(Math.abs(dot3(R(a), R(b)) - dot3(a, b)) / AB).toBeLessThan(1e-14);
        expect(Math.abs(len3(cross3(R(a), R(b))) - len3(cross3(a, b))) / AB).toBeLessThan(1e-14);
        // and the cross product turns with the vectors: R(A)×R(B) = R(A×B)
        expect(len3(cross3(R(a), R(b)).map((c, i) => c - R(cross3(a, b))[i]) as unknown as Vec3) / AB).toBeLessThan(1e-14);
      }
    }
    expect(R([3, 4, 0])[0]).not.toBeCloseTo(3, 3);
  });

  it('the angle stays accurate for nearly parallel vectors, where arccos of the dot product loses its digits', () => {
    for (const eps of [1e-3, 1e-6, 1e-9]) {
      const a = lift(fromPolar(1, 0.2));
      const b = lift(fromPolar(1, 0.2 + eps));
      expect(relativeError(angleBetween3(a, b), eps)).toBeLessThan(1e-6);
    }
  });
});
