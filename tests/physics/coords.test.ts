import { describe, expect, it } from 'vitest';
import {
  FIELDS,
  angleBetween,
  ballMass,
  capArea,
  cylinderMass,
  cylindricalBasis,
  directionalDerivative,
  discMass,
  fromCylindrical,
  fromPolar,
  fromSpherical,
  gradientPath,
  levelTangent,
  numericGradient,
  polarAreaElement,
  polarBasis,
  polarBasisDerivatives,
  polarComponents,
  polarGradient,
  polarPatchArea,
  ringArea,
  ringAreaElement,
  shellMass,
  simpson,
  sphericalBasis,
  sphericalCross,
  sphericalElement,
  sphericalPatchVolume,
  toCylindrical,
  toPolar,
  toSpherical,
  unitAt,
  type Vec2,
} from '~/physics/coords';
import { R_EARTH } from '~/physics/constants';
import { dot3, len, len3, relativeError } from '~/physics/vec';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('analytic limits', () => {
  it('polar ↔ Cartesian round-trips in all four quadrants, and atan2 picks the right quadrant', () => {
    for (const [x, y] of [[3, 4], [-3, 4], [-3, -4], [3, -4]] as Vec2[]) {
      const { r, theta } = toPolar([x, y]);
      expect(relativeError(r, 5)).toBeLessThan(1e-15);
      const back = fromPolar(r, theta);
      near(back[0], x, 1e-12);
      near(back[1], y, 1e-12);
    }
    // (−3, −4) is in the third quadrant: 233.13°, not the 53.13° of arctan(y/x)
    near((toPolar([-3, -4]).theta * 180) / Math.PI + 360, 233.13, 0.01);
  });

  it('the polar unit vectors are orthonormal, and the position vector is r r̂ with no θ̂ part', () => {
    for (const th of [0, 0.4, 2.6, -2]) {
      const { rHat, thetaHat } = polarBasis(th);
      near(len(rHat), 1, 1e-15);
      near(rHat[0] * thetaHat[0] + rHat[1] * thetaHat[1], 0, 1e-15);
      const c = polarComponents(fromPolar(2.5, th), th);
      near(c.ar, 2.5, 1e-14);
      near(c.ath, 0, 1e-14);
    }
  });

  it('cylindrical and spherical coordinates round-trip, θ measured from +z', () => {
    const p = fromCylindrical(2, 2.2, -1.5);
    const c = toCylindrical(p);
    near(c.s, 2, 1e-14);
    near(c.phi, 2.2, 1e-14);
    near(c.z, -1.5, 1e-14);
    const q = fromSpherical(3, 0.9, -2.4);
    const s = toSpherical(q);
    near(s.r, 3, 1e-14);
    near(s.theta, 0.9, 1e-13);
    near(s.phi, -2.4, 1e-13);
    // θ = 0 is the +z axis
    const top = fromSpherical(2, 0, 1.3);
    near(top[2], 2, 1e-15);
    near(Math.hypot(top[0], top[1]), 0, 1e-15);
  });

  it('the spherical basis is orthonormal and right-handed (r̂ × θ̂ = φ̂); at the equator it is the cylindrical one with θ̂ = −ẑ', () => {
    for (const [th, ph] of [[0.3, 0.2], [1.2, 2.5], [2.8, -1]]) {
      const b = sphericalBasis(th, ph);
      for (const u of [b.rHat, b.thetaHat, b.phiHat]) near(len3(u), 1, 1e-15);
      near(dot3(b.rHat, b.thetaHat), 0, 1e-15);
      near(dot3(b.rHat, b.phiHat), 0, 1e-15);
      near(dot3(b.thetaHat, b.phiHat), 0, 1e-15);
      const x = sphericalCross(th, ph);
      for (let i = 0; i < 3; i++) near(x[i], b.phiHat[i], 1e-15);
    }
    const eq = sphericalBasis(Math.PI / 2, 0.7);
    const cyl = cylindricalBasis(0.7);
    for (let i = 0; i < 3; i++) {
      near(eq.rHat[i], cyl.sHat[i], 1e-15);
      near(eq.phiHat[i], cyl.phiHat[i], 1e-15);
      near(eq.thetaHat[i], -cyl.zHat[i], 1e-15);
    }
  });

  it('a uniform ball, disc and cylinder give the textbook masses', () => {
    const rho = 900;
    expect(relativeError(ballMass(() => rho, 0.5), (4 / 3) * Math.PI * 0.125 * rho)).toBeLessThan(1e-12);
    expect(relativeError(discMass(() => 20, 0.3), Math.PI * 0.09 * 20)).toBeLessThan(1e-12);
    expect(relativeError(cylinderMass(() => rho, 0.1, 2), Math.PI * 0.01 * 2 * rho)).toBeLessThan(1e-12);
  });

  it('the whole sphere is a cap with α = π: 4πR²; a hemisphere is half of it', () => {
    expect(relativeError(capArea(2, Math.PI), 4 * Math.PI * 4)).toBeLessThan(1e-15);
    expect(relativeError(capArea(2, Math.PI / 2), 2 * Math.PI * 4)).toBeLessThan(1e-15);
  });

  it('on a circular bowl the gradient is radial, and a steepest path from any point is a straight ray', () => {
    const bowl = FIELDS.bowl;
    for (const p of [[1, 0.5], [-1.2, 2], [0.3, -2.1]] as Vec2[]) {
      const g = bowl.grad(p[0], p[1]);
      expect(angleBetween(g, p)).toBeLessThan(1e-7); // acos near 1 resolves only ~√ε
      const path = gradientPath(bowl, p, 0.02, 400);
      const end = path[path.length - 1];
      expect(angleBetween(end, p)).toBeLessThan(1e-7);
    }
  });

  it('on the elongated hill ∇h points at the top only on the axes, and the steepest path still reaches the top', () => {
    const hill = FIELDS.hill;
    const top = hill.summit!;
    expect(angleBetween(hill.grad(1.5, 0), [top[0] - 1.5, 0])).toBeLessThan(1e-7);
    const p: Vec2 = [1.5, 0.5];
    const off = angleBetween(hill.grad(p[0], p[1]), [top[0] - p[0], top[1] - p[1]]);
    expect((off * 180) / Math.PI).toBeGreaterThan(25);
    const path = gradientPath(hill, p, 0.01, 2000);
    const end = path[path.length - 1];
    expect(len(end)).toBeLessThan(0.05);
  });
});

describe('identities', () => {
  it('dr̂/dθ = θ̂ and dθ̂/dθ = −r̂, checked against a central difference', () => {
    const h = 1e-5;
    for (const th of [0.2, 1.7, -2.9]) {
      const { dRhat, dThetaHat } = polarBasisDerivatives(th);
      const p = polarBasis(th + h);
      const m = polarBasis(th - h);
      near((p.rHat[0] - m.rHat[0]) / (2 * h), dRhat[0], 1e-9);
      near((p.rHat[1] - m.rHat[1]) / (2 * h), dRhat[1], 1e-9);
      near((p.thetaHat[0] - m.thetaHat[0]) / (2 * h), dThetaHat[0], 1e-9);
      near((p.thetaHat[1] - m.thetaHat[1]) / (2 * h), dThetaHat[1], 1e-9);
    }
  });

  it('the line element: a step dθ at radius r moves the point by the arc r dθ, along θ̂', () => {
    const r = 1.8;
    const th = 0.9;
    const dth = 1e-6;
    const a = fromPolar(r, th);
    const b = fromPolar(r, th + dth);
    const step: Vec2 = [b[0] - a[0], b[1] - a[1]];
    expect(relativeError(len(step), r * dth)).toBeLessThan(1e-6);
    expect(angleBetween(step, polarBasis(th).thetaHat)).toBeLessThan(1e-5);
  });

  it('∫ sin θ dθ dφ over the sphere is 4π, so the shell element is 4πr² dr', () => {
    const inner = simpson((th) => Math.sin(th), 0, Math.PI, 200);
    expect(relativeError(inner * 2 * Math.PI, 4 * Math.PI)).toBeLessThan(1e-8);
  });

  it('the directional derivative is largest along ∇f (= |∇f|) and zero along the level curve', () => {
    for (const name of ['ramp', 'bowl', 'hill'] as const) {
      const F = FIELDS[name];
      const p: Vec2 = [0.9, -0.6];
      const g = F.grad(p[0], p[1]);
      expect(relativeError(directionalDerivative(g, g), len(g))).toBeLessThan(1e-14);
      near(directionalDerivative(g, levelTangent(g)), 0, 1e-15);
      let best = -Infinity;
      for (let k = 0; k < 360; k++) best = Math.max(best, directionalDerivative(g, unitAt((k * Math.PI) / 180)));
      expect(best).toBeLessThanOrEqual(len(g) * (1 + 1e-12));
      // f does not change, to first order, along the level tangent
      const t = levelTangent(g);
      const e = 1e-4;
      const df = F.f(p[0] + e * t[0], p[1] + e * t[1]) - F.f(p[0] - e * t[0], p[1] - e * t[1]);
      expect(Math.abs(df)).toBeLessThan(1e-7 * Math.max(1, len(g)));
    }
  });

  it('the analytic gradients of the figure fields agree with the numerical gradient', () => {
    for (const name of ['ramp', 'bowl', 'hill'] as const) {
      const F = FIELDS[name];
      for (const p of [[0.4, 1.1], [-1.7, -0.3]] as Vec2[]) {
        const a = F.grad(p[0], p[1]);
        const n = numericGradient(F.f, p);
        near(a[0], n[0], 1e-8);
        near(a[1], n[1], 1e-8);
      }
    }
  });

  it('the gradient in polar components (∂f/∂r, (1/r)∂f/∂θ) is the Cartesian gradient seen along r̂ and θ̂', () => {
    // the saddle U = ½k(x² − y²) = ½k r² cos 2θ of worked example 6, with k = 2.0
    const k = 2.0;
    const Upol = (r: number, th: number) => 0.5 * k * r * r * Math.cos(2 * th);
    for (const [r, th] of [[0.5, Math.PI / 6], [1.3, 2.2]]) {
      const { gr, gth } = polarGradient(Upol, r, th);
      const [x, y] = fromPolar(r, th);
      const cart = polarComponents([k * x, -k * y], th);
      near(gr, cart.ar, 1e-8);
      near(gth, cart.ath, 1e-8);
    }
    // the bank's ladder: ∇(3x² + 2xy) at (1, 2) has x component 10
    const U: (x: number, y: number) => number = (x, y) => 3 * x * x + 2 * x * y;
    near(numericGradient(U, [1, 2])[0], 10, 1e-8);
  });
});

describe('scaling', () => {
  it('at fixed dr and dθ the patch area grows in proportion to r (twice as far, twice the area)', () => {
    const a1 = polarAreaElement(0.5, 0.01, 0.01);
    const a2 = polarAreaElement(1.0, 0.01, 0.01);
    expect(relativeError(a2 / a1, 2)).toBeLessThan(1e-15);
    expect(relativeError(ringAreaElement(10, 0.1) / ringAreaElement(1, 0.1), 10)).toBeLessThan(1e-15);
  });

  it('the spherical element scales as r² sin θ: it vanishes at the pole and peaks at the equator', () => {
    const e = (r: number, th: number) => sphericalElement(r, th, 0.01, 0.01, 0.01).dV;
    expect(relativeError(e(2, 1) / e(1, 1), 4)).toBeLessThan(1e-15);
    expect(e(1, 0)).toBe(0);
    expect(e(1, Math.PI / 2)).toBeGreaterThan(e(1, 1));
  });

  it('half the volume of a uniform ball lies outside r = 2^(−1/3) R ≈ 0.794 R', () => {
    const R = 1;
    const rh = 2 ** (-1 / 3);
    const inner = ballMass(() => 1, rh);
    const total = ballMass(() => 1, R);
    expect(relativeError(inner / total, 0.5)).toBeLessThan(1e-12);
    near(rh, 0.794, 5e-4);
  });

  it('the mass of a ball with a fixed density profile ρ(r/R) scales as R³', () => {
    const prof = (R: number) => (r: number) => 1000 * (1 - (r / R) ** 2);
    expect(relativeError(ballMass(prof(2), 2) / ballMass(prof(1), 1), 8)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the exact polar patch area tends to r dr dθ, with an error of first order in dr/r', () => {
    const r = 1;
    let prev = Infinity;
    for (const dr of [0.2, 0.1, 0.05, 0.025]) {
      const err = relativeError(polarPatchArea(r, dr, 0.1), polarAreaElement(r, dr, 0.1));
      // exact / element = 1 + dr/(2r)
      expect(relativeError(err, dr / (2 * r + dr))).toBeLessThan(1e-12);
      expect(err).toBeLessThan(prev);
      prev = err;
    }
    expect(relativeError(ringArea(1, 1e-6), ringAreaElement(1, 1e-6))).toBeLessThan(1e-6);
  });

  it('the exact spherical patch volume tends to r² sin θ dr dθ dφ', () => {
    const errs = [0.1, 0.05, 0.025].map((d) =>
      relativeError(sphericalPatchVolume(1.5, 1.0, d, d, d), sphericalElement(1.5, 1.0, d, d, d).dV),
    );
    expect(errs[1]).toBeLessThan(errs[0] * 0.6);
    expect(errs[2]).toBeLessThan(errs[1] * 0.6);
    expect(errs[2]).toBeLessThan(0.03);
  });

  it('Simpson’s rule converges at fourth order on the shell integrals', () => {
    const exact = (4 * Math.PI) / 5; // ∫₀¹ r² · 4π r² dr
    const e1 = relativeError(simpson((r) => 4 * Math.PI * r ** 4, 0, 1, 8), exact);
    const e2 = relativeError(simpson((r) => 4 * Math.PI * r ** 4, 0, 1, 16), exact);
    expect(e1 / e2).toBeGreaterThan(14);
    expect(e1 / e2).toBeLessThan(18);
  });

  it('the bank’s planet with ρ = ρ₀(1 − r/R) has M = πρ₀R³/3 = 3.25·10²⁴ kg by shells', () => {
    const rho0 = 1.2e4;
    const M = ballMass((r) => rho0 * (1 - r / R_EARTH), R_EARTH);
    expect(relativeError(M, (Math.PI * rho0 * R_EARTH ** 3) / 3)).toBeLessThan(1e-12);
    expect(relativeError(M, 3.25e24)).toBeLessThan(0.002);
  });

  it('an exponential atmosphere: the shell integral matches 4πρ₀H(R² + 2RH + 2H²)', () => {
    const rho0 = 1.225;
    const H = 8500;
    const R = R_EARTH;
    const M = shellMass((r) => rho0 * Math.exp(-(r - R) / H), R, R + 40 * H, 20000);
    expect(relativeError(M, 4 * Math.PI * rho0 * H * (R * R + 2 * R * H + 2 * H * H))).toBeLessThan(1e-9);
  });
});
