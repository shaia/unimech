import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { gravity } from '~/physics/motion';
import {
  aimAngles,
  analyticFlight,
  apexTime,
  envelopeY,
  flightPositionAt,
  inclineBestAngle,
  inclineFlight,
  inclineMaxRange,
  inclineRangeClosedForm,
  levelFlightTime,
  levelRange,
  maxHeight,
  numericFlight,
  positionAt,
  trajectoryY,
  velocityAt,
} from '~/physics/projectile';
import { relativeError } from '~/physics/vec';

const rad = (d: number) => (d * Math.PI) / 180;
const EXACT = 1e-9;
const CASES: [number, number][] = [
  [10, 15],
  [20, 30],
  [20, 45],
  [25, 72],
  [14, 60],
];

describe('analytic limits', () => {
  it.each(CASES)('v₀ = %d m/s at %d° on level ground: R = v₀² sin2θ/g, T = 2v₀ sinθ/g, H = v₀² sin²θ/2g', (v0, d) => {
    const l = { v0, angleDeg: d };
    expect(relativeError(levelRange(l), (v0 * v0 * Math.sin(2 * rad(d))) / G)).toBeLessThan(EXACT);
    expect(relativeError(levelFlightTime(l), (2 * v0 * Math.sin(rad(d))) / G)).toBeLessThan(EXACT);
    expect(relativeError(maxHeight(l), (v0 * Math.sin(rad(d))) ** 2 / (2 * G))).toBeLessThan(EXACT);
  });

  it('the top of the path comes at half the flight time on level ground, where vy = 0', () => {
    const l = { v0: 18, angleDeg: 50 };
    expect(relativeError(apexTime(l), levelFlightTime(l) / 2)).toBeLessThan(EXACT);
    expect(Math.abs(velocityAt(l, apexTime(l))[1])).toBeLessThan(1e-12);
    expect(relativeError(positionAt(l, apexTime(l))[1], maxHeight(l))).toBeLessThan(EXACT);
  });

  it('a vertical launch rises v₀²/2g and comes back to its start (range 0)', () => {
    const l = { v0: 15, angleDeg: 90 };
    expect(relativeError(maxHeight(l), (15 * 15) / (2 * G))).toBeLessThan(EXACT);
    expect(Math.abs(levelRange(l))).toBeLessThan(1e-12);
  });

  it('a launch from a height h₀ lands at the later root of h₀ + v₀ sinθ·t − gt²/2 = 0; h₀ → 0 returns the level flight', () => {
    const l = { v0: 15, angleDeg: 30, h0: 20 };
    const t = levelFlightTime(l);
    expect(Math.abs(positionAt(l, t)[1])).toBeLessThan(1e-9);
    expect(relativeError(levelFlightTime({ v0: 15, angleDeg: 30, h0: 1e-9 }), levelFlightTime({ v0: 15, angleDeg: 30 }))).toBeLessThan(1e-9);
  });

  it('the trajectory equation y(x) passes through r(t) at every t (t eliminated through x = v₀ cosθ·t)', () => {
    const l = { v0: 21, angleDeg: 37, h0: 3 };
    for (let t = 0; t < 3; t += 0.29) {
      const [x, y] = positionAt(l, t);
      expect(relativeError(trajectoryY(l, x), y)).toBeLessThan(EXACT);
    }
  });

  it('the incline range tends to the level range as the incline angle tends to 0', () => {
    for (const [v0, d] of CASES) {
      const level = levelRange({ v0, angleDeg: d });
      expect(relativeError(inclineFlight(v0, d, 0).along, level)).toBeLessThan(EXACT);
      expect(relativeError(inclineFlight(v0, d, 1e-6).along, level)).toBeLessThan(1e-6);
    }
  });

  it('a throw along the incline itself (θ = β) never leaves it: range 0', () => {
    expect(inclineFlight(20, 25, 25).along).toBe(0);
    expect(inclineRangeClosedForm(20, 25, 25)).toBe(0);
  });

  it('tilted axes and the trajectory equation give the same incline range, up or down the slope', () => {
    for (const [v0, d, a] of [
      [20, 50, 20],
      [12, 70, 35],
      [15, 30, -20],
      [25, 10, -30],
    ]) {
      const f = inclineFlight(v0, d, a);
      expect(relativeError(f.along, inclineRangeClosedForm(v0, d, a))).toBeLessThan(EXACT);
      // the impact point lies on the path and on the incline
      expect(relativeError(trajectoryY({ v0, angleDeg: d }, f.impact[0]), f.impact[1])).toBeLessThan(1e-8);
    }
  });

  it('the best angle on an incline is 45° + β/2 and reaches v₀²/(g(1 + sinβ)); β = 0 gives 45° and v₀²/g', () => {
    for (const a of [-30, -10, 0, 20, 40]) {
      let best = 0;
      let bestD = 0;
      for (let d = a + 0.01; d < 90; d += 0.01) {
        const L = inclineFlight(20, d, a).along;
        if (L > best) [best, bestD] = [L, d];
      }
      expect(Math.abs(bestD - inclineBestAngle(a))).toBeLessThan(0.02);
      expect(relativeError(best, inclineMaxRange(20, a))).toBeLessThan(1e-6);
    }
    expect(inclineBestAngle(0)).toBe(45);
    expect(relativeError(inclineMaxRange(20, 0), 400 / G)).toBeLessThan(EXACT);
  });

  it('the envelope reaches v₀²/2g overhead and meets the ground at the greatest range v₀²/g', () => {
    expect(relativeError(envelopeY(20, 0), 400 / (2 * G))).toBeLessThan(EXACT);
    expect(Math.abs(envelopeY(20, 400 / G))).toBeLessThan(1e-12);
  });
});

describe('symmetry', () => {
  it('the level range is symmetric about 45°: θ and 90° − θ land at the same point', () => {
    for (const d of [5, 15, 30, 37.5, 44]) {
      expect(relativeError(levelRange({ v0: 20, angleDeg: d }), levelRange({ v0: 20, angleDeg: 90 - d }))).toBeLessThan(EXACT);
    }
  });

  it('45° reaches farther over level ground than any other whole-degree angle', () => {
    const r45 = levelRange({ v0: 20, angleDeg: 45 });
    for (let d = 1; d < 90; d++) if (d !== 45) expect(levelRange({ v0: 20, angleDeg: d })).toBeLessThan(r45);
  });

  it('the incline clearance is greatest at half the flight time, in tilted axes', () => {
    const [v0, d, a] = [20, 50, 20];
    const f = inclineFlight(v0, d, a);
    const clearance = (t: number) => {
      const [x, y] = positionAt({ v0, angleDeg: d }, t);
      return (y - x * Math.tan(rad(a))) * Math.cos(rad(a));
    };
    expect(relativeError(clearance(f.time / 2), f.maxClearance)).toBeLessThan(EXACT);
    expect(clearance(f.time / 2 + 0.01)).toBeLessThan(f.maxClearance);
    expect(clearance(f.time / 2 - 0.01)).toBeLessThan(f.maxClearance);
  });
});

describe('envelope and aiming', () => {
  it('every path at speed v₀ stays on or below the envelope and touches it once, at x = v₀²/(g tanθ)', () => {
    const v0 = 20;
    for (const d of [20, 45, 53.7, 70, 85]) {
      const l = { v0, angleDeg: d };
      // a path below 45° touches the envelope after it has crossed y = 0: follow the whole parabola
      const touch = (v0 * v0) / (G * Math.tan(rad(d)));
      expect(Math.abs(envelopeY(v0, touch) - trajectoryY(l, touch))).toBeLessThan(1e-9);
      let closest = Infinity;
      for (let x = 0.05; x < 2 * touch; x += touch / 400) {
        const gap = envelopeY(v0, x) - trajectoryY(l, x);
        expect(gap).toBeGreaterThan(-1e-9);
        closest = Math.min(closest, gap);
      }
      expect(closest).toBeLessThan(0.02);
    }
  });

  it('both aim angles pass through the target; a point on the envelope has one angle, above it none', () => {
    const v0 = 20;
    const [lo, hi] = aimAngles(v0, 30, 5);
    expect(relativeError(trajectoryY({ v0, angleDeg: lo }, 30), 5)).toBeLessThan(1e-9);
    expect(relativeError(trajectoryY({ v0, angleDeg: hi }, 30), 5)).toBeLessThan(1e-9);
    expect(aimAngles(v0, 30, envelopeY(v0, 30) + 0.01)).toEqual([]);
    const touch = aimAngles(v0, 30, envelopeY(v0, 30) - 1e-9);
    expect(Math.abs(touch[0] - touch[touch.length - 1])).toBeLessThan(0.01);
  });
});

describe('conservation', () => {
  it.each(CASES)('energy: over level ground at %d m/s, %d°, the body lands with its launch speed', (v0, d) => {
    const f = numericFlight({ v0, angleDeg: d });
    expect(relativeError(Math.hypot(...f.impactVelocity), v0)).toBeLessThan(1e-9);
  });

  it('energy: v² = v₀² − 2g(y − y₀) at every instant of the analytic solution', () => {
    const l = { v0: 17, angleDeg: 63, h0: 4 };
    for (let t = 0; t < 3.5; t += 0.31) {
      const [vx, vy] = velocityAt(l, t);
      const y = positionAt(l, t)[1];
      expect(relativeError(vx * vx + vy * vy, 17 * 17 - 2 * G * (y - 4))).toBeLessThan(EXACT);
    }
  });

  it('the horizontal velocity never changes: the acceleration has no horizontal component', () => {
    const l = { v0: 22, angleDeg: 41 };
    for (let t = 0; t < 3; t += 0.5) expect(velocityAt(l, t)[0]).toBe(velocityAt(l, 0)[0]);
  });
});

describe('scaling', () => {
  it('doubling the launch speed makes every length four times larger and every time twice as long', () => {
    expect(relativeError(levelRange({ v0: 20, angleDeg: 35 }), 4 * levelRange({ v0: 10, angleDeg: 35 }))).toBeLessThan(EXACT);
    expect(relativeError(inclineFlight(20, 50, 20).along, 4 * inclineFlight(10, 50, 20).along)).toBeLessThan(EXACT);
    expect(relativeError(inclineFlight(20, 50, 20).time, 2 * inclineFlight(10, 50, 20).time)).toBeLessThan(EXACT);
  });

  it('a gravity six times weaker carries the body six times farther', () => {
    expect(relativeError(levelRange({ v0: 12, angleDeg: 40, g: G / 6 }), 6 * levelRange({ v0: 12, angleDeg: 40 }))).toBeLessThan(EXACT);
  });

  it('the relative position of two bodies thrown together changes linearly in time (½gt² cancels)', () => {
    const a = { v0: 20, angleDeg: 60 };
    const b = { v0: 13, angleDeg: 0, h0: 25 };
    const d = (t: number) => {
      const [xa, ya] = positionAt(a, t);
      const [xb, yb] = positionAt(b, t);
      return [xb - xa, yb - ya];
    };
    // equal steps in time give equal steps in the separation
    const s1 = [d(1)[0] - d(0)[0], d(1)[1] - d(0)[1]];
    const s2 = [d(2.3)[0] - d(1.3)[0], d(2.3)[1] - d(1.3)[1]];
    expect(relativeError(s1[0], s2[0])).toBeLessThan(EXACT);
    expect(relativeError(s1[1], s2[1])).toBeLessThan(EXACT);
  });
});

describe('convergence', () => {
  it('RK4 under constant g reproduces the analytic trajectory (exact for a constant force)', () => {
    const l = { v0: 19, angleDeg: 53 };
    const f = numericFlight(l, { dt: 0.05 });
    f.path.forEach((p, i) => {
      const [x, y] = positionAt(l, f.times[i]);
      expect(Math.hypot(p[0] - x, p[1] - y)).toBeLessThan(1e-9);
    });
    expect(relativeError(f.time, levelFlightTime(l))).toBeLessThan(1e-9);
    expect(relativeError(f.peak, maxHeight(l))).toBeLessThan(1e-9);
  });

  it('the numerical impact on an incline agrees with the tilted-axes solution, at any step size', () => {
    for (const dt of [0.2, 0.01]) {
      const f = numericFlight({ v0: 20, angleDeg: 50 }, { betaDeg: 20, dt });
      const exact = inclineFlight(20, 50, 20);
      expect(relativeError(f.time, exact.time)).toBeLessThan(1e-9);
      expect(relativeError(Math.hypot(...f.impact), exact.along)).toBeLessThan(1e-9);
    }
  });

  it('a force passed in replaces gravity (the hook a drag mode uses): gravity passed explicitly changes nothing', () => {
    const l = { v0: 16, angleDeg: 38 };
    const a = numericFlight(l);
    const b = numericFlight(l, { force: gravity(1, G) });
    expect(relativeError(a.time, b.time)).toBeLessThan(EXACT);
  });

  it('the sampled analytic flight interpolates to within g·Δt²/8 of the exact position', () => {
    const l = { v0: 20, angleDeg: 40 };
    const f = analyticFlight(l, { n: 160 });
    const step = f.time / 160;
    let worst = 0;
    for (let t = 0; t < f.time; t += 0.0037) {
      const [x, y] = flightPositionAt(f, t);
      const [ex, ey] = positionAt(l, t);
      worst = Math.max(worst, Math.hypot(x - ex, y - ey));
    }
    expect(worst).toBeLessThanOrEqual((G * step * step) / 8 + 1e-12);
  });
});
