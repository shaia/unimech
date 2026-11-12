import { describe, expect, it } from 'vitest';
import {
  axisMoments,
  centreOfMass,
  cut,
  cylinderAboutDiameter,
  exactAboutCM,
  exactInertia,
  pieceMass,
  pieceSum,
  secondMoments,
  shellRingSum,
  squareInPlane,
  sumError,
  washer,
  type CutBody,
} from '~/physics/inertia';
import { disc, discDiameter, hollowSphere, parallelAxis, perpendicularAxis, plateCentre, plateInPlane, ring, ringDiameter, rodCentre, rodEnd, solidSphere } from '~/physics/rigidbody';
import { riemann } from '~/physics/calculus';
import { relativeError } from '~/physics/vec';

const BODIES: CutBody[] = ['rod', 'cone', 'ring', 'disc', 'sphere'];

describe('analytic limits', () => {
  it('the sums of many pieces reach the integrals: rod L²/12, cone 3L²/80 about its CM, ring R², disc R²/2, sphere 2R²/5', () => {
    for (const b of BODIES) expect(Math.abs(sumError(b, 2000, centreOfMass(b)))).toBeLessThan(1e-6);
    expect(relativeError(exactAboutCM('rod'), rodCentre(1, 1))).toBeLessThan(1e-15);
    expect(relativeError(exactAboutCM('ring'), ring(1, 1))).toBeLessThan(1e-15);
    expect(relativeError(exactAboutCM('disc'), disc(1, 1))).toBeLessThan(1e-15);
    expect(relativeError(exactAboutCM('sphere'), solidSphere(1, 1))).toBeLessThan(1e-15);
  });

  it('the rod about its end is L²/3, and the cone about its tip 3L²/5 (= ∫ x²·3x² dx)', () => {
    expect(relativeError(exactInertia('rod', 0), rodEnd(1, 1))).toBeLessThan(1e-14);
    expect(relativeError(exactInertia('cone', 0), riemann((x) => 3 * x ** 4, 0, 1, 4000))).toBeLessThan(1e-6);
    expect(relativeError(exactInertia('cone', 0), 0.6)).toBeLessThan(1e-14);
  });

  it('the CM of the cone (λ ∝ x²) lies 3L/4 from its tip, and the middle and the heavy end are equally far from it', () => {
    const X = riemann((x) => 3 * x ** 3, 0, 1, 4000);
    expect(relativeError(X, centreOfMass('cone'))).toBeLessThan(1e-6);
    expect(relativeError(exactInertia('cone', 0.5), exactInertia('cone', 1))).toBeLessThan(1e-14);
    expect(relativeError(exactInertia('cone', 1), 0.1)).toBeLessThan(1e-14);
  });

  it('a ring needs no integral: its sum is R² + a² at every n, because every piece is a distance R from the centre', () => {
    for (const n of [1, 2, 3, 7, 50]) for (const a of [0, 0.4, -1.3]) expect(relativeError(pieceSum(cut('ring', n), a), 1 + a * a)).toBeLessThan(1e-13);
  });

  it('a thin shell from rings tends to 2R²/3', () => {
    expect(relativeError(shellRingSum(4000), hollowSphere(1, 1))).toBeLessThan(1e-6);
  });

  it('a washer is a disc when the hole closes and a ring when the rim thins; a cylinder about a diameter is a disc (L → 0) or a rod (R → 0)', () => {
    expect(relativeError(washer(2, 0, 0.3), disc(2, 0.3))).toBeLessThan(1e-15);
    expect(relativeError(washer(2, 0.3, 0.3), ring(2, 0.3))).toBeLessThan(1e-15);
    expect(relativeError(cylinderAboutDiameter(2, 0.3, 0), discDiameter(2, 0.3))).toBeLessThan(1e-15);
    expect(relativeError(cylinderAboutDiameter(2, 0, 0.9), rodCentre(2, 0.9))).toBeLessThan(1e-15);
    // L = √3 R: the same I about a diameter as about the symmetry axis
    expect(relativeError(cylinderAboutDiameter(2, 0.3, Math.sqrt(3) * 0.3), disc(2, 0.3))).toBeLessThan(1e-14);
  });
});

describe('conservation', () => {
  it('cutting conserves mass: the pieces of every body sum to M at every n', () => {
    for (const b of BODIES) for (const n of [1, 2, 5, 33, 200]) expect(Math.abs(pieceMass(cut(b, n)) - 1)).toBeLessThan(1e-13);
  });
});

describe('scaling', () => {
  it('the midpoint sum of a uniform rod about its centre is exactly (1 − 1/n²) L²/12', () => {
    for (const n of [1, 2, 4, 10, 37]) expect(Math.abs(pieceSum(cut('rod', n), 0.5) - (1 - 1 / (n * n)) / 12)).toBeLessThan(1e-15);
  });

  it('moving the axis by d adds exactly M d² for every body whose pieces have their CM at the body CM (parallel-axis theorem)', () => {
    for (const b of ['rod', 'ring', 'disc', 'sphere'] as const) {
      const pc = cut(b, 9);
      const X = centreOfMass(b);
      for (const d of [0.1, 0.5, 1.2]) expect(relativeError(pieceSum(pc, X + d) - pieceSum(pc, X), d * d)).toBeLessThan(1e-12);
      expect(relativeError(exactInertia(b, X + 0.7), parallelAxis(exactAboutCM(b), 1, 0.7))).toBeLessThan(1e-14);
    }
  });

  it('among parallel axes, I is smallest through the CM: the exact I(a) is a parabola with its vertex at X_cm', () => {
    for (const b of BODIES) {
      const X = centreOfMass(b);
      for (const d of [-0.3, -0.01, 0.01, 0.3]) expect(exactInertia(b, X + d)).toBeGreaterThan(exactInertia(b, X));
    }
  });

  it('a flat body obeys I_z = I_x + I_y; a thickness h adds 2Σmz² = h²/6 to the left side; a cube has I_x = I_y = I_z', () => {
    for (const b of ['plate', 'disc', 'ring'] as const) {
      const f = axisMoments(b, 0);
      expect(relativeError(f.Iz, perpendicularAxis(f.Ix, f.Iy))).toBeLessThan(1e-15);
      const t = axisMoments(b, 0.8);
      expect(relativeError(t.Ix + t.Iy - t.Iz, (0.8 * 0.8) / 6)).toBeLessThan(1e-14);
      expect(relativeError(t.Iz, f.Iz)).toBeLessThan(1e-15);
    }
    expect(relativeError(axisMoments('disc', 0).Ix, discDiameter(1, 1))).toBeLessThan(1e-15);
    expect(relativeError(axisMoments('ring', 0).Ix, ringDiameter(1, 1))).toBeLessThan(1e-15);
    const cube = axisMoments('plate', 1);
    expect(relativeError(cube.Ix, cube.Iz)).toBeLessThan(1e-15);
    expect(relativeError(secondMoments('plate', 0).xx, squareInPlane(1, 1))).toBeLessThan(1e-15);
  });

  it('the flat bodies and worked-example formulas here agree with the shared rigidbody.ts at any M and size', () => {
    const [M, a, R] = [1.7, 0.43, 0.29];
    // square plate (side a): in-plane axis a²/12, perpendicular axis a²/6
    expect(relativeError(squareInPlane(M, a), plateInPlane(M, a))).toBeLessThan(1e-15);
    expect(relativeError(M * a * a * axisMoments('plate', 0).Iz, plateCentre(M, a, a))).toBeLessThan(1e-15);
    // disc and ring of radius R, about their axis and a diameter
    expect(relativeError(M * R * R * axisMoments('disc', 0).Iz, disc(M, R))).toBeLessThan(1e-15);
    expect(relativeError(M * R * R * axisMoments('ring', 0).Iz, ring(M, R))).toBeLessThan(1e-15);
    expect(relativeError(M * R * R * axisMoments('disc', 0).Ix, discDiameter(M, R))).toBeLessThan(1e-15);
    // a cylinder of length L about a diameter is a stack of discs about their diameters moved by the parallel axis
    const L = 0.8;
    expect(relativeError(cylinderAboutDiameter(M, R, L), discDiameter(M, R) + rodCentre(M, L))).toBeLessThan(1e-15);
    // the exact I(a) of every cut body is the shared parallel-axis theorem about its CM
    for (const b of BODIES) expect(relativeError(exactInertia(b, 0.9), parallelAxis(exactAboutCM(b), 1, 0.9 - centreOfMass(b)))).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('the midpoint sums converge as 1/n²: doubling n divides the error by about 4', () => {
    for (const b of ['rod', 'cone', 'disc', 'sphere'] as const) {
      const X = centreOfMass(b);
      const e1 = Math.abs(sumError(b, 40, X));
      const e2 = Math.abs(sumError(b, 80, X));
      expect(e1 / e2).toBeGreaterThan(3.8);
      expect(e1 / e2).toBeLessThan(4.2);
    }
  });

  it('the shell from rings converges as 1/n² too', () => {
    const e = (n: number) => Math.abs(shellRingSum(n) - 2 / 3);
    expect(e(40) / e(80)).toBeGreaterThan(3.8);
    expect(e(40) / e(80)).toBeLessThan(4.2);
  });
});
