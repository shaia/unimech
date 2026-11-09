import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  accelerationInFrame,
  boatGroundVelocity,
  closestApproach,
  crossing,
  fromMovingFrame,
  minimumDrift,
  positionConstAccel,
  relativeVelocity,
  riverHeadingOpposite,
  roundTripAcross,
  roundTripAlong,
  toMovingFrame,
  velocityFromFrame,
  velocityInFrame,
  type Event2,
} from '~/physics/galilean';
import { add, len, relativeError, sub, type Vec2 } from '~/physics/vec';

const TOL = 1e-12;
const close = (a: number, b: number, tol = TOL) => expect(relativeError(a, b)).toBeLessThan(tol);
const closeVec = (a: Vec2, b: Vec2, tol = TOL) => {
  // compare by the size of the difference relative to the larger vector
  const m = Math.max(len(a), len(b));
  expect(m === 0 ? 0 : len(sub(a, b)) / m).toBeLessThan(tol);
};

describe('analytic limits', () => {
  it('a frame at rest (V = 0) changes nothing', () => {
    const e: Event2 = { t: 3, r: [5, -2] };
    expect(toMovingFrame(e, [0, 0])).toEqual(e);
    expect(velocityInFrame([4, 1], [0, 0])).toEqual([4, 1]);
  });
  it('a body moving with the frame is at rest in it, and stays at its starting place', () => {
    const V: Vec2 = [25, 0];
    expect(velocityInFrame(V, V)).toEqual([0, 0]);
    for (const t of [0, 1, 4.5]) closeVec(toMovingFrame({ t, r: [25 * t + 3, 7] }, V).r, [3, 7]);
  });
  it('vertical rain seen from a moving car slants backward: tan φ = V/u from the vertical', () => {
    const rain: Vec2 = [0, -8];
    const car: Vec2 = [20, 0];
    const rel = relativeVelocity(rain, car);
    close(Math.atan2(-rel[0], -rel[1]), Math.atan(20 / 8));
    close(len(rel), Math.hypot(20, 8));
  });
  it('heading straight across, the crossing time is d/u whatever the current', () => {
    for (const c of [0, 0.5, 3]) close(crossing(2, c, 0, 60).time, 30);
    close(crossing(2, 1.5, 0, 60).drift, 45);
  });
  it('heading upstream at sin θ = c/u lands opposite the start, after d/√(u² − c²)', () => {
    const th = riverHeadingOpposite(2.5, 1.5)!;
    close(Math.sin(th), 0.6);
    const x = crossing(2.5, 1.5, th, 120);
    expect(Math.abs(x.drift)).toBeLessThan(1e-9);
    close(x.time, 60);
  });
  it('a boat no faster than the current cannot land opposite', () => {
    expect(riverHeadingOpposite(1.5, 1.5)).toBeNull();
    expect(riverHeadingOpposite(1, 2)).toBeNull();
  });
  it('round trips in still water take 2L/u, and in a current always longer', () => {
    close(roundTripAlong(5, 0, 100), 40);
    close(roundTripAcross(5, 0, 100), 40);
    expect(roundTripAlong(5, 3, 100)).toBeGreaterThan(roundTripAcross(5, 3, 100));
    expect(roundTripAcross(5, 3, 100)).toBeGreaterThan(40);
  });
  it('a ball tossed straight up in a cart lands back in the hand, a horizontal distance V·2u/g away on the ground', () => {
    const V = 15;
    const u = 6;
    const T = (2 * u) / G;
    const ground = positionConstAccel([0, 0], [V, u], [0, -G], T);
    close(ground[0], V * T);
    expect(Math.abs(ground[1])).toBeLessThan(1e-12);
    const inCart = toMovingFrame({ t: T, r: ground }, [V, 0]).r;
    expect(Math.abs(inCart[0])).toBeLessThan(1e-12);
  });
});

describe('conservation: what the Galilean transformation leaves unchanged', () => {
  const V: Vec2 = [12, -3];
  it('the inverse transformation returns the original event', () => {
    const e: Event2 = { t: 2.7, r: [-4, 9.5] };
    const back = fromMovingFrame(toMovingFrame(e, V), V);
    expect(back.t).toBe(e.t);
    closeVec(back.r, e.r);
  });
  it('composing two transformations gives one with the summed velocity', () => {
    const V2: Vec2 = [-5, 7];
    const e: Event2 = { t: 1.9, r: [30, -11] };
    const twice = toMovingFrame(toMovingFrame(e, V), V2);
    const once = toMovingFrame(e, add(V, V2));
    expect(twice.t).toBe(once.t);
    closeVec(twice.r, once.r);
  });
  it('the time interval and the distance between two simultaneous events are frame-independent', () => {
    const e1: Event2 = { t: 4, r: [1, 2] };
    const e2: Event2 = { t: 4, r: [-6, 10] };
    const p1 = toMovingFrame(e1, V);
    const p2 = toMovingFrame(e2, V);
    close(len(sub(p1.r, p2.r)), len(sub(e1.r, e2.r)));
    expect(p2.t - p1.t).toBe(e2.t - e1.t);
  });
  it('the distance between two events at different times is not frame-independent', () => {
    const e1: Event2 = { t: 0, r: [0, 0] };
    const e2: Event2 = { t: 4, r: [100, 0] };
    const p = toMovingFrame(e2, [25, 0]);
    expect(len(sub(p.r, toMovingFrame(e1, [25, 0]).r))).toBeLessThan(1e-12);
  });
  it('the acceleration is the same in every frame at constant V: a finite difference of v − V', () => {
    const r0: Vec2 = [0, 1.2];
    const v0: Vec2 = [3, 5];
    const a: Vec2 = [0, -G];
    const h = 1e-3;
    for (const Vf of [[0, 0], [4, 0], [12, -3]] as Vec2[]) {
      const rp = (t: number) => toMovingFrame({ t, r: positionConstAccel(r0, v0, a, t) }, Vf).r;
      const t = 0.6;
      const acc: Vec2 = [
        (rp(t + h)[0] - 2 * rp(t)[0] + rp(t - h)[0]) / (h * h),
        (rp(t + h)[1] - 2 * rp(t)[1] + rp(t - h)[1]) / (h * h),
      ];
      expect(Math.abs(acc[0] - a[0])).toBeLessThan(1e-6);
      close(acc[1], a[1], 1e-6);
      closeVec(accelerationInFrame(a, [0, 0]), a);
    }
  });
  it('a frame that accelerates at A sees a − A', () => {
    closeVec(accelerationInFrame([0, -G], [-2, 0]), [2, -G]);
  });
  it('the velocity of one body relative to another is the same in every frame', () => {
    const vA: Vec2 = [7, -1];
    const vB: Vec2 = [-2, 4];
    closeVec(relativeVelocity(velocityInFrame(vA, V), velocityInFrame(vB, V)), relativeVelocity(vA, vB));
    expect(relativeVelocity(vA, vB)).toEqual(relativeVelocity(vB, vA).map((x) => -x));
    closeVec(velocityFromFrame(velocityInFrame(vA, V), V), vA);
  });
  it('the closest approach is the same computed in the ground frame or in a moving frame', () => {
    const a = closestApproach([0, 0], [20, 0], [0, 30], [0, -15]);
    const shifted = closestApproach([0, 0], velocityInFrame([20, 0], V), [0, 30], velocityInFrame([0, -15], V));
    close(a.t, shifted.t);
    close(a.d, shifted.d);
  });
});

describe('convergence: closed forms agree with brute-force minimisation', () => {
  it('closest approach of two ships matches a fine search over time', () => {
    const rA0: Vec2 = [0, 0];
    const vA: Vec2 = [20, 0];
    const rB0: Vec2 = [0, 30];
    const vB: Vec2 = [0, -15];
    const ca = closestApproach(rA0, vA, rB0, vB);
    close(ca.t, 0.72);
    close(ca.d, 24);
    let best = Infinity;
    let bt = 0;
    for (let t = 0; t <= 3; t += 1e-5) {
      const d = len(sub(add(rB0, [vB[0] * t, vB[1] * t]), add(rA0, [vA[0] * t, vA[1] * t])));
      if (d < best) {
        best = d;
        bt = t;
      }
    }
    close(best, ca.d, 1e-8);
    close(bt, ca.t, 1e-4);
  });
  it('bodies already moving apart are closest now', () => {
    const ca = closestApproach([0, 0], [-1, 0], [10, 0], [2, 0]);
    expect(ca.t).toBe(0);
    close(ca.d, 10);
  });
  it('the minimum-drift heading matches a search over headings when the boat is slower than the current', () => {
    const u = 1;
    const c = 2;
    const d = 60;
    const m = minimumDrift(u, c, d)!;
    let best = Infinity;
    let bth = 0;
    for (let th = 0; th < Math.PI / 2; th += 1e-6) {
      const x = crossing(u, c, th, d).drift;
      if (x < best) {
        best = x;
        bth = th;
      }
    }
    close(best, m.drift, 1e-8);
    close(bth, m.theta, 1e-4);
    close(m.drift, 60 * Math.sqrt(3));
    expect(minimumDrift(2, 1, d)).toBeNull();
  });
});

describe('scaling', () => {
  it('crossing time and drift grow in proportion to the river width', () => {
    const a = crossing(2.5, 1.5, 0.3, 60);
    const b = crossing(2.5, 1.5, 0.3, 120);
    close(b.time / a.time, 2);
    close(b.drift / a.drift, 2);
  });
  it('doubling every speed halves the crossing time and keeps the drift', () => {
    const a = crossing(2, 1, 0.2, 80);
    const b = crossing(4, 2, 0.2, 80);
    close(a.time / b.time, 2);
    close(a.drift, b.drift);
    closeVec(boatGroundVelocity(4, 2, 0.2), boatGroundVelocity(2, 1, 0.2).map((x) => 2 * x) as unknown as Vec2);
  });
});
