import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  beadCriticalOmega,
  beadEffectivePotential,
  beadEquilibrium,
  beadSmallOscillation,
  bucketRimRise,
  bucketSurface,
  centrifugalPerMass,
  centrifugalPotential,
  coriolisPerMass,
  exitTime,
  freeLine,
  freeLineSeenRotating,
  freePuckSpeedRotating,
  integrateRotating,
  launchInertial,
  launchRotating,
  parabolicWireCriticalOmega,
  parabolicWirePotential,
  power,
  radialLaunchOffLine,
  releasedDistance,
  type Launch,
} from '~/physics/carousel';
import { centrifugalForce, coriolisForce, jacobiIntegral } from '~/physics/rotating';
import { len3, relativeError, sub3, type Vec3 } from '~/physics/vec';

const deg = Math.PI / 180;
const rhoOf = (r: Vec3) => Math.hypot(r[0], r[1]);

/** Largest distance between the integrated S′ path and toRotating of the straight line. */
function worstDeviation(l: Launch, omega: number, tEnd: number, dt: number): number {
  const s0 = launchInertial(l, omega);
  const path = integrateRotating(launchRotating(l), omega, tEnd, dt);
  let worst = 0;
  for (const p of path) worst = Math.max(worst, len3(sub3(p.s.r, freeLineSeenRotating(s0, omega, p.t).r)));
  return worst;
}

describe('analytic limits', () => {
  it('a puck integrated with the centrifugal and Coriolis forces in S′ follows the straight line of S seen from S′', () => {
    for (const l of [
      { rho0: 0, speed: 0.4, angle: 0 },
      { rho0: 0.5, speed: 0, angle: 0 },
      { rho0: 0.6, speed: 0.5, angle: 135 * deg },
    ]) {
      expect(worstDeviation(l, 1.0, 3, 1 / 200)).toBeLessThan(1e-8);
    }
  });

  it('with ω = 0 the turntable frame sees the straight line itself', () => {
    const l: Launch = { rho0: 0.3, speed: 0.5, angle: 40 * deg };
    const path = integrateRotating(launchRotating(l), 0, 2, 0.01);
    const end = path[path.length - 1];
    const line = freeLine(launchInertial(l, 0), end.t);
    expect(len3(sub3(end.s.r, line.r))).toBeLessThan(1e-12);
  });

  it('a launch speed relative to the turntable adds the turntable velocity ω × r′ in the room', () => {
    const s = launchInertial({ rho0: 0.5, speed: 0, angle: 0 }, 1.2);
    expect(s.v[0]).toBeCloseTo(0, 14);
    expect(relativeError(s.v[1], 1.2 * 0.5)).toBeLessThan(1e-14);
  });

  it('a puck launched from the centre drifts off the painted line by ωut² at first: the Coriolis ½(2ωu)t²', () => {
    const u = 0.4;
    const omega = 1.0;
    const t = 0.01;
    expect(relativeError(radialLaunchOffLine(u, omega, t), omega * u * t * t)).toBeLessThan(1e-4);
    // and to the right of its motion for ω > 0: S′ sees it at negative y′
    const p = freeLineSeenRotating(launchInertial({ rho0: 0, speed: u, angle: 0 }, omega), omega, 0.5);
    expect(p.r[1]).toBeLessThan(0);
    expect(relativeError(-p.r[1], radialLaunchOffLine(u, omega, 0.5))).toBeLessThan(1e-12);
  });

  it('a released puck moves away from the axis as ρ₀√(1 + (ωt)²), in both frames', () => {
    const rho0 = 0.5;
    const omega = 1.0;
    const s0 = launchInertial({ rho0, speed: 0, angle: 0 }, omega);
    for (const t of [0.3, 1, 1.7]) {
      expect(relativeError(rhoOf(freeLine(s0, t).r), releasedDistance(rho0, omega, t))).toBeLessThan(1e-12);
      expect(relativeError(rhoOf(freeLineSeenRotating(s0, omega, t).r), releasedDistance(rho0, omega, t))).toBeLessThan(1e-12);
    }
    expect(relativeError(exitTime(s0, 1), Math.sqrt(1 - 0.25) / 0.5)).toBeLessThan(1e-12);
  });

  it('below ω_c = √(g/R) the bead sits at the bottom; above it at cos θ = g/(ω²R), and it climbs toward 90° as ω → ∞', () => {
    const R = 0.25;
    const wc = beadCriticalOmega(G, R);
    expect(beadEquilibrium(G, R, 0.9 * wc)).toBe(0);
    expect(relativeError(Math.cos(beadEquilibrium(G, R, 2 * wc)), 0.25)).toBeLessThan(1e-12);
    expect(beadEquilibrium(G, R, 1000 * wc)).toBeGreaterThan(89.99 * deg);
  });

  it('at the bead equilibrium the tangential components of gravity and the centrifugal force cancel', () => {
    const R = 0.3;
    const omega = 9;
    const th = beadEquilibrium(G, R, omega);
    expect(Math.abs(omega * omega * R * Math.sin(th) * Math.cos(th) - G * Math.sin(th))).toBeLessThan(1e-12);
  });

  it('the bead equilibrium is a minimum of U_eff, so dU_eff/dθ = 0 there', () => {
    const R = 0.2;
    const omega = 10;
    const th = beadEquilibrium(G, R, omega);
    const h = 1e-6;
    const d = (beadEffectivePotential(1, G, R, omega, th + h) - beadEffectivePotential(1, G, R, omega, th - h)) / (2 * h);
    expect(Math.abs(d)).toBeLessThan(1e-8);
  });
});

describe('conservation', () => {
  it('the Coriolis force does no work: ½v′² − ½ω²ρ² stays constant along an integrated path', () => {
    const omega = 1.3;
    const l: Launch = { rho0: 0.4, speed: 0.6, angle: 100 * deg };
    const path = integrateRotating(launchRotating(l), omega, 4, 1 / 400);
    const J0 = jacobiIntegral(path[0].s, [0, 0, omega]);
    for (const p of path) expect(Math.abs(jacobiIntegral(p.s, [0, 0, omega]) - J0)).toBeLessThan(1e-10);
    const end = path[path.length - 1].s;
    expect(relativeError(len3(end.v), freePuckSpeedRotating(0.6, omega, 0.4, rhoOf(end.r)))).toBeLessThan(1e-9);
  });

  it('the Coriolis power F · v′ is zero for every velocity', () => {
    for (const v of [
      [1, 0, 0],
      [0.3, -2, 0],
      [0.5, 0.5, 1],
    ] as Vec3[]) {
      expect(Math.abs(power(coriolisPerMass(0.8, v), v))).toBeLessThan(1e-15);
      expect(len3(sub3(coriolisPerMass(0.8, v), coriolisForce(1, [0, 0, 0.8], v)))).toBeLessThan(1e-15);
    }
  });

  it('the centrifugal force is minus the gradient of −½mω²ρ²', () => {
    const m = 2;
    const omega = 0.7;
    const r: Vec3 = [0.6, -0.8, 0];
    const h = 1e-6;
    const U = (x: number, y: number) => centrifugalPotential(m, omega, Math.hypot(x, y));
    const grad: Vec3 = [(U(r[0] + h, r[1]) - U(r[0] - h, r[1])) / (2 * h), (U(r[0], r[1] + h) - U(r[0], r[1] - h)) / (2 * h), 0];
    const F = centrifugalForce(m, [0, 0, omega], r);
    expect(len3(sub3(F, [-grad[0], -grad[1], 0]))).toBeLessThan(1e-8);
    expect(len3(sub3(centrifugalPerMass(omega, r), [F[0] / m, F[1] / m, F[2] / m]))).toBeLessThan(1e-15);
  });

  it('the bucket keeps its volume: the wall rises by ω²R²/(4g) and the centre drops by as much', () => {
    const omega = 5;
    const R = 0.2;
    const h0 = 0.3;
    const rise = bucketRimRise(omega, R, G);
    const z0 = h0 - rise;
    // volume under the paraboloid, by the midpoint rule over thin rings
    const n = 20000;
    let V = 0;
    for (let i = 0; i < n; i++) {
      const r = ((i + 0.5) * R) / n;
      V += bucketSurface(z0, omega, r, G) * 2 * Math.PI * r * (R / n);
    }
    expect(relativeError(V, Math.PI * R * R * h0)).toBeLessThan(1e-8);
    expect(relativeError(bucketSurface(z0, omega, R, G) - h0, rise)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('the Coriolis force does not depend on where the body is, the centrifugal force grows as ρ', () => {
    const v: Vec3 = [0.4, 0.1, 0];
    const omega = 0.9;
    expect(len3(coriolisPerMass(omega, v))).toBeCloseTo(2 * omega * len3(v), 14);
    expect(relativeError(len3(centrifugalPerMass(omega, [2, 0, 0])), 2 * len3(centrifugalPerMass(omega, [1, 0, 0])))).toBeLessThan(1e-15);
  });

  it('doubling ω doubles the early sideways drift of a puck launched from the centre', () => {
    const t = 0.02;
    expect(relativeError(radialLaunchOffLine(0.5, 2, t) / radialLaunchOffLine(0.5, 1, t), 2)).toBeLessThan(1e-3);
  });

  it('small oscillations of the bead have Ω² = U_eff″/(mR²): √(g/R − ω²) below ω_c and ω sin θ₀ above it', () => {
    const R = 0.2;
    for (const omega of [5, 10]) {
      const th = beadEquilibrium(G, R, omega);
      const h = 1e-4;
      const U = (x: number) => beadEffectivePotential(1, G, R, omega, x);
      const second = (U(th + h) - 2 * U(th) + U(th - h)) / (h * h);
      expect(relativeError(Math.sqrt(second / (R * R)), beadSmallOscillation(G, R, omega))).toBeLessThan(1e-6);
    }
  });

  it('the parabolic wire is neutral at ω = √(2gk): U_eff vanishes for every ρ', () => {
    const k = 2.5;
    const wc = parabolicWireCriticalOmega(G, k);
    expect(Math.abs(parabolicWirePotential(G, k, wc, 0.7))).toBeLessThan(1e-12);
    expect(parabolicWirePotential(G, k, 0.8 * wc, 0.7)).toBeGreaterThan(0);
    expect(parabolicWirePotential(G, k, 1.2 * wc, 0.7)).toBeLessThan(0);
  });
});

describe('convergence', () => {
  it('the RK4 path converges to the exact rotating-frame path at fourth order in the step', () => {
    const l: Launch = { rho0: 0.2, speed: 0.5, angle: 60 * deg };
    const e1 = worstDeviation(l, 1.5, 3, 0.1);
    const e2 = worstDeviation(l, 1.5, 3, 0.05);
    const order = Math.log2(e1 / e2);
    expect(order).toBeGreaterThan(3.7);
    expect(order).toBeLessThan(4.3);
  });
});
