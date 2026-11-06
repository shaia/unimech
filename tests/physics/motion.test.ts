import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { gravity, rk4Step, type Body, type Force } from '~/physics/motion';
import { len3, relativeError } from '~/physics/vec';

/** Integrate from t = 0 for n steps of dt. */
function run(b: Body, F: Force, dt: number, n: number): Body {
  for (let i = 0; i < n; i++) b = rk4Step(b, F, i * dt, dt);
  return b;
}

/** A spring of stiffness k pulling the body back to the origin along x. */
const spring =
  (k: number): Force =>
  (p) => [-k * p[0], 0, 0];

describe('analytic limit: a horizontal launch under constant gravity', () => {
  it('RK4 reproduces x = v₀t and y = h − gt²/2 to rounding', () => {
    const v0 = 3;
    const h = 20;
    const b = run({ pos: [0, h, 0], vel: [v0, 0, 0], m: 0.5 }, gravity(0.5, G), 0.01, 150);
    const t = 1.5;
    expect(relativeError(b.pos[0], v0 * t)).toBeLessThan(1e-12);
    expect(relativeError(b.pos[1], h - (G * t * t) / 2)).toBeLessThan(1e-12);
    expect(relativeError(b.vel[1], -G * t)).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('mechanical energy of a mass on a spring stays constant over ten periods', () => {
    const m = 0.4;
    const k = 25;
    const T = 2 * Math.PI * Math.sqrt(m / k);
    const b0: Body = { pos: [0.1, 0, 0], vel: [0, 0, 0], m };
    const energy = (b: Body) => 0.5 * m * len3(b.vel) ** 2 + 0.5 * k * b.pos[0] ** 2;
    const b = run(b0, spring(k), T / 200, 2000);
    expect(relativeError(energy(b), energy(b0))).toBeLessThan(1e-6);
  });
});

describe('scaling', () => {
  it('under gravity alone the path does not depend on the mass', () => {
    const light = run({ pos: [0, 0, 0], vel: [4, 6, 0], m: 0.1 }, gravity(0.1, G), 0.005, 200);
    const heavy = run({ pos: [0, 0, 0], vel: [4, 6, 0], m: 10 }, gravity(10, G), 0.005, 200);
    expect(relativeError(heavy.pos[0], light.pos[0])).toBeLessThan(1e-12);
    expect(relativeError(heavy.pos[1], light.pos[1])).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('RK4 is fourth order: halving dt cuts the error about 16-fold', () => {
    const m = 1;
    const k = 4;
    const tEnd = 3;
    const exact = 0.2 * Math.cos(Math.sqrt(k / m) * tEnd);
    const err = (steps: number) =>
      Math.abs(run({ pos: [0.2, 0, 0], vel: [0, 0, 0], m }, spring(k), tEnd / steps, steps).pos[0] - exact);
    const ratio = err(40) / err(80);
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
  });
});
