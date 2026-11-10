import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  bestPull,
  boardSlide,
  constantSpeedPull,
  frictionAtRest,
  holdRange,
  incline,
  pullBlock,
  slideDownAcceleration,
  stack,
  stepSlider,
  tableclothPull,
  thresholdAngle,
  upAndBack,
  type Slider,
  type SliderForces,
} from '~/physics/friction';
import { rk4Step, type Body } from '~/physics/motion';
import { relativeError } from '~/physics/vec';

const rad = (d: number) => (d * Math.PI) / 180;
const EXACT = 1e-9;
const C = { mus: 0.5, muk: 0.3 };

describe('analytic limits', () => {
  it('static friction below its ceiling equals the other forces along the surface, not μs N', () => {
    const r = frictionAtRest(20, 98, C);
    expect(r.holds).toBe(true);
    expect(r.f).toBe(-20);
    expect(relativeError(r.fMax, 49)).toBeLessThan(EXACT);
  });

  it('past the ceiling the body slides and the friction drops to μk N, against the push', () => {
    const r = frictionAtRest(60, 98, C);
    expect(r.holds).toBe(false);
    expect(relativeError(r.f, -0.3 * 98)).toBeLessThan(EXACT);
  });

  it('a block on an incline holds below tan θ = μs and slips just above it', () => {
    const th = thresholdAngle(0.6);
    expect(relativeError(Math.tan(rad(th)), 0.6)).toBeLessThan(EXACT);
    expect(incline(2, th - 0.01, { mus: 0.6, muk: 0.4 }).holds).toBe(true);
    expect(incline(2, th + 0.01, { mus: 0.6, muk: 0.4 }).holds).toBe(false);
  });

  it('below the threshold the friction on the incline is mg sin θ, up the slope; once sliding a = g(sin θ − μk cos θ)', () => {
    const st = incline(3, 20, C);
    expect(st.holds).toBe(true);
    expect(relativeError(st.f, 3 * G * Math.sin(rad(20)))).toBeLessThan(EXACT);
    const sl = incline(3, 35, C);
    expect(sl.holds).toBe(false);
    expect(relativeError(sl.a, slideDownAcceleration(35, 0.3))).toBeLessThan(EXACT);
  });

  it('with μ → 0 the incline gives a = g sin θ, and a level floor (θ = 0) needs no friction at all', () => {
    expect(relativeError(incline(1, 30, { mus: 0, muk: 0 }).a, G * 0.5)).toBeLessThan(EXACT);
    const level = incline(1, 0, C);
    expect(level.holds).toBe(true);
    expect(level.f).toBe(0);
    expect(relativeError(level.N, G)).toBeLessThan(EXACT);
  });

  it('a rope pulled up at angle φ lowers the normal force to mg − F sin φ; at φ = 0 N = mg', () => {
    expect(relativeError(pullBlock(20, 100, 0, C).N, 20 * G)).toBeLessThan(EXACT);
    const p = pullBlock(20, 100, 30, C, true);
    expect(relativeError(p.N, 20 * G - 50)).toBeLessThan(EXACT);
    expect(relativeError(p.a, (100 * Math.cos(rad(30)) - 0.3 * p.N) / 20)).toBeLessThan(EXACT);
  });

  it('the constant-speed pull is smallest at tan φ = μk', () => {
    const best = bestPull(10, 0.4);
    expect(relativeError(constantSpeedPull(10, best.phiDeg, 0.4), best.F)).toBeLessThan(EXACT);
    for (const d of [0, 10, 30, 40]) expect(constantSpeedPull(10, d, 0.4)).toBeGreaterThan(best.F);
  });

  it('the forces that hold a block on an incline run from mg(sin θ − μs cos θ) to mg(sin θ + μs cos θ), with f = 0 at mg sin θ', () => {
    const h = holdRange(5, 30, 0.3);
    for (const F of [h.Fmin, h.Fzero, h.Fmax]) {
      const drive = 5 * G * Math.sin(rad(30)) - F; // along +s, down the slope
      expect(frictionAtRest(drive, 5 * G * Math.cos(rad(30)), { mus: 0.3, muk: 0.2 }).holds).toBe(true);
    }
    expect(frictionAtRest(5 * G * 0.5 - h.Fmax * 1.001, 5 * G * Math.cos(rad(30)), { mus: 0.3, muk: 0.2 }).holds).toBe(false);
  });

  it('stacked blocks pulled by the bottom move together up to (mA + mB) μs g, and friction on the top block points forward', () => {
    const s = stack({ mA: 1, mB: 3, F: 15, on: 'B', ...{ mus: 0.4, muk: 0.3 } });
    expect(relativeError(s.Fmax, 4 * 0.4 * G)).toBeLessThan(EXACT);
    expect(s.together).toBe(true);
    expect(s.fOnA).toBeGreaterThan(0);
    const slip = stack({ mA: 1, mB: 3, F: 20, on: 'B', mus: 0.4, muk: 0.3 });
    expect(slip.together).toBe(false);
    expect(relativeError(slip.aA, 0.3 * G)).toBeLessThan(EXACT);
    expect(relativeError(slip.aB, (20 - 0.3 * G) / 3)).toBeLessThan(EXACT);
    expect(slip.aB).toBeGreaterThan(slip.aA);
  });

  it('pulling the top block instead lowers the limit by mA/mB, and friction on the top block points backward', () => {
    const s = stack({ mA: 1, mB: 3, F: 5, on: 'A', mus: 0.4, muk: 0.3 });
    expect(relativeError(s.Fmax, (4 * 0.4 * G) / 3)).toBeLessThan(EXACT);
    expect(s.together).toBe(true);
    expect(s.fOnA).toBeLessThan(0);
  });

  it('a board of vanishing mass: the block keeps nothing of its speed difference (they share v₀ at once)', () => {
    const b = boardSlide(2, 1e-9, 4, 0.25);
    expect(b.t).toBeLessThan(1e-6);
  });

  it('the tablecloth: an infinitely fast pull leaves the dish where it was', () => {
    expect(tableclothPull(0.3, 1e9, 0.2, 0.2).total).toBeLessThan(1e-6);
  });
});

describe('conservation', () => {
  it('in every regime the internal friction pair cancels: F = mA aA + mB aB', () => {
    for (const on of ['A', 'B'] as const) {
      for (const F of [2, 5, 10, 15.6, 20, 40]) {
        const s = stack({ mA: 1, mB: 3, F, on, mus: 0.4, muk: 0.3 });
        expect(relativeError(1 * s.aA + 3 * s.aB, F)).toBeLessThan(EXACT);
      }
    }
  });

  it('a block sliding onto a board on ice: momentum is conserved, and the kinetic energy lost is μk mA g times the slip', () => {
    const [mA, mB, v0, muk] = [2, 6, 4, 0.25];
    const b = boardSlide(mA, mB, v0, muk);
    expect(relativeError(mA * (v0 + b.aA * b.t) + mB * b.aB * b.t, mA * v0)).toBeLessThan(EXACT);
    const lost = 0.5 * mA * v0 * v0 - 0.5 * (mA + mB) * b.vCommon ** 2;
    expect(relativeError(lost, muk * mA * G * b.slip)).toBeLessThan(EXACT);
  });

  it('a block that goes up an incline and back loses μk mg cos θ times the path 2d of its kinetic energy', () => {
    const r = upAndBack(5, 37, 0.3);
    const lost = 0.5 * (25 - r.vBack ** 2);
    expect(relativeError(lost, 0.3 * G * Math.cos(rad(37)) * 2 * r.d)).toBeLessThan(EXACT);
  });
});

describe('scaling', () => {
  it('the threshold angle and the sliding acceleration do not depend on the mass', () => {
    for (const m of [0.1, 1, 50]) {
      expect(incline(m, 25, { mus: 0.45, muk: 0.3 }).holds).toBe(incline(1, 25, { mus: 0.45, muk: 0.3 }).holds);
      expect(relativeError(incline(m, 40, C).a, incline(1, 40, C).a)).toBeLessThan(EXACT);
    }
  });

  it('doubling both stacked masses doubles the largest common pull; the largest common acceleration stays μs g', () => {
    const one = stack({ mA: 1, mB: 3, F: 0, on: 'B', mus: 0.4, muk: 0.3 });
    const two = stack({ mA: 2, mB: 6, F: 0, on: 'B', mus: 0.4, muk: 0.3 });
    expect(relativeError(two.Fmax, 2 * one.Fmax)).toBeLessThan(EXACT);
    expect(relativeError(one.Fmax / 4, 0.4 * G)).toBeLessThan(EXACT);
  });

  it('the up-and-back time ratio is √((sin θ + μk cos θ)/(sin θ − μk cos θ)), the same at any launch speed', () => {
    const want = Math.sqrt((0.6 + 0.5 * 0.8) / (0.6 - 0.5 * 0.8));
    const th = (Math.atan2(0.6, 0.8) * 180) / Math.PI;
    for (const v0 of [1, 3, 10]) {
      const r = upAndBack(v0, th, 0.5);
      expect(relativeError(r.tDown / r.tUp, want)).toBeLessThan(EXACT);
    }
    expect(relativeError(want, Math.sqrt(5))).toBeLessThan(EXACT);
  });
});

describe('convergence', () => {
  const run = (st0: Slider, p: SliderForces, T: number, n: number) => {
    let st = st0;
    for (let k = 0; k < n; k++) st = stepSlider(st, p, T / n);
    return st;
  };

  it('the exact slider step gives the same state for any step size, through a stop and a hold', () => {
    // a block sent up a 20° slope (s up the slope) with μs = 0.5 > tan 20°: it stops and stays
    const m = 2;
    const p: SliderForces = { m, drive: -m * G * Math.sin(rad(20)), N: m * G * Math.cos(rad(20)), ...C };
    const coarse = run({ s: 0, v: 3 }, p, 2, 3);
    const fine = run({ s: 0, v: 3 }, p, 2, 3000);
    const d = 9 / (2 * G * (Math.sin(rad(20)) + 0.3 * Math.cos(rad(20))));
    expect(relativeError(coarse.s, d)).toBeLessThan(EXACT);
    expect(relativeError(fine.s, d)).toBeLessThan(1e-7);
    expect(coarse.v).toBe(0);
  });

  it('on a steep slope the block stops, turns back and slides down, and the step size does not matter', () => {
    const m = 1;
    const p: SliderForces = { m, drive: -m * G * Math.sin(rad(37)), N: m * G * Math.cos(rad(37)), mus: 0.5, muk: 0.3 };
    const r = upAndBack(5, 37, 0.3);
    const T = r.tUp + r.tDown;
    for (const n of [1, 7, 500]) {
      const st = run({ s: 0, v: 5 }, p, T, n);
      expect(Math.abs(st.s)).toBeLessThan(1e-9);
      expect(relativeError(-st.v, r.vBack)).toBeLessThan(1e-9);
    }
  });

  it('within one sliding phase RK4 under gravity plus kinetic friction agrees with the closed form', () => {
    const m = 1.5;
    const th = rad(40);
    const muk = 0.3;
    // world x down the slope: the force along it is mg sin θ − μk mg cos θ while the block slides down
    const along = m * G * (Math.sin(th) - muk * Math.cos(th));
    const force = (): Body['pos'] => [along, 0, 0];
    let b: Body = { pos: [0, 0, 0], vel: [0.5, 0, 0], m };
    const n = 200;
    const T = 1.2;
    for (let k = 0; k < n; k++) b = rk4Step(b, force, (k * T) / n, T / n);
    const a = slideDownAcceleration(40, muk);
    expect(relativeError(b.pos[0], 0.5 * T + 0.5 * a * T * T)).toBeLessThan(1e-12);
  });
});
