import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  accelerationAt,
  dragFlight,
  dragRatio,
  integrateFall,
  linearDragPosition,
  netForce,
  position,
  riseHeight,
  riseTime,
  sampleFall,
  sphereDrag,
  sphereMass,
  terminalSpeed,
  timeScale,
  timeToFraction,
  velocity,
  RHO_WATER,
  type Fall,
} from '~/physics/drag';
import { analyticFlight, levelFlightTime, positionAt } from '~/physics/projectile';
import { relativeError } from '~/physics/vec';

/** The drop of the lesson's ladder: m = 0.020 kg, b = 0.050 kg/s. */
const DROP: Fall = { m: 0.02, b: 0.05 };
/** The skydiver of the ladder: m = 80 kg, c = 0.25 kg/m. */
const DIVER: Fall = { m: 80, c: 0.25 };

describe('analytic limits', () => {
  it('without drag the fall is free fall: v = v₀ + g t, y = v₀ t + ½ g t²', () => {
    for (const v0 of [0, 3, -5]) {
      const f: Fall = { m: 1, v0 };
      expect(relativeError(velocity(f, 1.3), v0 + G * 1.3)).toBeLessThan(1e-14);
      expect(relativeError(position(f, 1.3), v0 * 1.3 + 0.5 * G * 1.69)).toBeLessThan(1e-14);
    }
  });

  it('as the linear drag b → 0 the solution tends to free fall (no cancellation in the closed form)', () => {
    for (const b of [1e-4, 1e-7, 1e-10]) {
      const f: Fall = { m: 1, b, v0: 2 };
      // the first correction is of relative order t/τ = b t / m
      expect(relativeError(velocity(f, 1), 2 + G)).toBeLessThan(2 * b);
      expect(relativeError(position(f, 1), 2 + 0.5 * G)).toBeLessThan(2 * b);
    }
  });

  it('as the quadratic drag c → 0 the solution tends to free fall', () => {
    for (const c of [1e-4, 1e-8]) {
      const f: Fall = { m: 1, c };
      expect(relativeError(velocity(f, 1), G)).toBeLessThan(10 * c);
      expect(relativeError(position(f, 1), 0.5 * G)).toBeLessThan(10 * c);
    }
  });

  it('long after the release (t ≫ τ) the speed is the terminal speed, and the net force on the body is zero', () => {
    expect(relativeError(velocity(DROP, 30 * timeScale(DROP)), terminalSpeed(DROP))).toBeLessThan(1e-12);
    expect(relativeError(velocity(DIVER, 30 * timeScale(DIVER)), terminalSpeed(DIVER))).toBeLessThan(1e-12);
    expect(Math.abs(netForce(DROP, terminalSpeed(DROP)))).toBeLessThan(1e-15);
    expect(Math.abs(accelerationAt(DIVER, terminalSpeed(DIVER)))).toBeLessThan(1e-12);
  });

  it('the ladder numbers: v_t = mg/b = 3.92 m/s, τ = 0.40 s, 90 % after τ ln 10 = 0.921 s; the skydiver 56 m/s', () => {
    expect(relativeError(terminalSpeed(DROP), 3.92)).toBeLessThan(1e-12);
    expect(relativeError(timeScale(DROP), 0.4)).toBeLessThan(1e-12);
    expect(relativeError(timeToFraction(DROP, 0.9), 0.4 * Math.LN10)).toBeLessThan(1e-12);
    expect(relativeError(terminalSpeed(DIVER), 56)).toBeLessThan(1e-12);
  });

  it('after one time constant a linear-drag body has 1 − 1/e ≈ 63 % of its terminal speed, a quadratic one tanh 1 ≈ 76 %', () => {
    expect(relativeError(velocity(DROP, timeScale(DROP)) / terminalSpeed(DROP), 1 - Math.exp(-1))).toBeLessThan(1e-14);
    expect(relativeError(velocity(DIVER, timeScale(DIVER)) / terminalSpeed(DIVER), Math.tanh(1))).toBeLessThan(1e-14);
  });

  it('at the release the acceleration is g whatever the drag, and the initial slope of v(t) meets v_t at t = τ', () => {
    expect(accelerationAt(DROP, 0)).toBe(G);
    expect(accelerationAt(DIVER, 0)).toBe(G);
    expect(relativeError(G * timeScale(DROP), terminalSpeed(DROP))).toBeLessThan(1e-14);
  });

  it('released at the terminal speed the body keeps it; released faster it slows down to it', () => {
    for (const f of [DROP, DIVER]) {
      const vt = terminalSpeed(f);
      expect(relativeError(velocity({ ...f, v0: vt }, 2), vt)).toBeLessThan(1e-12);
      const fast = { ...f, v0: 3 * vt };
      expect(velocity(fast, 0.5 * timeScale(f))).toBeGreaterThan(vt);
      expect(velocity(fast, 0.5 * timeScale(f))).toBeLessThan(3 * vt);
      expect(relativeError(velocity(fast, 40 * timeScale(f)), vt)).toBeLessThan(1e-9);
    }
  });

  it('a linear-drag throw up at 10 m/s tops out after τ ln(1 + v₀/v_t) = 0.507 s, earlier than v₀/g = 1.02 s', () => {
    const up: Fall = { ...DROP, v0: -10 };
    const tTop = riseTime(DROP, 10);
    expect(relativeError(tTop, 0.4 * Math.log(1 + 10 / 3.92))).toBeLessThan(1e-12);
    expect(Math.abs(velocity(up, tTop))).toBeLessThan(1e-12);
    expect(tTop).toBeLessThan(10 / G);
    expect(relativeError(-position(up, tTop), riseHeight(DROP, 10))).toBeLessThan(1e-12);
  });

  it('a quadratic-drag throw up: v = 0 at T arctan(u₀/v_t), at the height (v_t²/2g) ln(1 + u₀²/v_t²), continuous at the top', () => {
    const up: Fall = { ...DIVER, v0: -40 };
    const tTop = riseTime(DIVER, 40);
    expect(Math.abs(velocity(up, tTop))).toBeLessThan(1e-12);
    expect(relativeError(-position(up, tTop), riseHeight(DIVER, 40))).toBeLessThan(1e-12);
    const e = 1e-7;
    expect(Math.abs(velocity(up, tTop - e) - velocity(up, tTop + e))).toBeLessThan(10 * G * e);
    expect(Math.abs(position(up, tTop - e) - position(up, tTop + e))).toBeLessThan(1e-9);
  });

  it('as drag → 0 the rise time and height of a throw up tend to v₀/g and v₀²/(2g)', () => {
    expect(relativeError(riseTime({ m: 1, b: 1e-9 }, 10), 10 / G)).toBeLessThan(1e-8);
    expect(relativeError(riseHeight({ m: 1, b: 1e-9 }, 10), 100 / (2 * G))).toBeLessThan(1e-8);
    expect(relativeError(riseTime({ m: 1, c: 1e-12 }, 10), 10 / G)).toBeLessThan(1e-8);
    expect(relativeError(riseHeight({ m: 1, c: 1e-12 }, 10), 100 / (2 * G))).toBeLessThan(1e-8);
  });

  it('under linear drag a horizontal launch drifts at most v₀ₓ τ, and the vertical motion does not depend on v₀ₓ', () => {
    const tau = 0.5;
    const far = linearDragPosition({ v0: 12, angleDeg: 0 }, tau, 40 * tau);
    expect(relativeError(far[0], 12 * tau)).toBeLessThan(1e-12);
    const a = linearDragPosition({ v0: 12, angleDeg: 0, h0: 50 }, tau, 1.1);
    const b = linearDragPosition({ v0: 3, angleDeg: 0, h0: 50 }, tau, 1.1);
    expect(a[1]).toBe(b[1]);
  });
});

describe('conservation', () => {
  it('the work done by linear drag equals the loss of mechanical energy, mg y − ½ m (v² − v₀²) = ∫ b v² dt', () => {
    const f: Fall = { ...DROP, v0: -6 };
    const t1 = 2.3;
    const n = 4000; // Simpson on the analytic v(t)
    const h = t1 / n;
    let I = 0;
    for (let i = 0; i <= n; i++) {
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      I += w * 0.05 * velocity(f, i * h) ** 2;
    }
    I *= h / 3;
    const lost = f.m * G * position(f, t1) - 0.5 * f.m * (velocity(f, t1) ** 2 - 36);
    expect(relativeError(lost, I)).toBeLessThan(1e-10);
  });

  it('the work done by quadratic drag equals the loss of mechanical energy, through the top of a throw up', () => {
    const f: Fall = { ...DIVER, v0: -30 };
    const t1 = 9;
    const n = 6000;
    const h = t1 / n;
    let I = 0;
    for (let i = 0; i <= n; i++) {
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      I += w * 0.25 * Math.abs(velocity(f, i * h)) ** 3;
    }
    I *= h / 3;
    const lost = f.m * G * position(f, t1) - 0.5 * f.m * (velocity(f, t1) ** 2 - 900);
    // Simpson across the kink of |v|³ at the top converges slowly: a few parts in 10⁷
    expect(relativeError(lost, I)).toBeLessThan(1e-6);
  });
});

describe('scaling', () => {
  it('with the same b, v_t and τ grow as m (linear); with the same c, v_t and T grow as √m (quadratic)', () => {
    expect(relativeError(terminalSpeed({ m: 0.04, b: 0.05 }) / terminalSpeed(DROP), 2)).toBeLessThan(1e-14);
    expect(relativeError(timeScale({ m: 0.04, b: 0.05 }) / timeScale(DROP), 2)).toBeLessThan(1e-14);
    expect(relativeError(terminalSpeed({ m: 320, c: 0.25 }) / terminalSpeed(DIVER), 2)).toBeLessThan(1e-14);
    expect(relativeError(timeScale({ m: 320, c: 0.25 }) / timeScale(DIVER), 2)).toBeLessThan(1e-14);
  });

  it('every fall from rest collapses onto one curve: v/v_t is a function of t/τ only (1 − e^(−x) or tanh x)', () => {
    for (const x of [0.3, 1, 2.5]) {
      const lin = [DROP, { m: 3, b: 0.7 }, { m: 1e-6, b: 4e-5 }].map((f) => velocity(f, x * timeScale(f)) / terminalSpeed(f));
      for (const r of lin) expect(relativeError(r, 1 - Math.exp(-x))).toBeLessThan(1e-13);
      const quad = [DIVER, { m: 0.145, c: 1.2e-3 }].map((f) => velocity(f, x * timeScale(f)) / terminalSpeed(f));
      for (const r of quad) expect(relativeError(r, Math.tanh(x))).toBeLessThan(1e-13);
    }
  });

  it('the quadratic-to-linear ratio grows as D v: a fog drop is linear, a baseball quadratic', () => {
    expect(relativeError(dragRatio(2e-3, 3) / dragRatio(1e-3, 3), 2)).toBeLessThan(1e-14);
    expect(relativeError(dragRatio(1e-3, 6) / dragRatio(1e-3, 3), 2)).toBeLessThan(1e-14);
    const fog = 2e-5;
    const vFog = terminalSpeed({ m: sphereMass(fog, RHO_WATER), ...sphereDrag(fog) });
    expect(dragRatio(fog, vFog)).toBeLessThan(1e-2);
    const D = 0.07;
    const vBall = terminalSpeed({ m: 0.145, ...sphereDrag(D) });
    expect(dragRatio(D, vBall)).toBeGreaterThan(1e3);
  });

  it('with both drags the terminal speed lies below each one alone and tends to the dominant one', () => {
    const fog = 2e-5;
    const m = sphereMass(fog, RHO_WATER);
    const both = terminalSpeed({ m, ...sphereDrag(fog) });
    const lin = terminalSpeed({ m, b: sphereDrag(fog).b });
    const quad = terminalSpeed({ m, c: sphereDrag(fog).c });
    expect(both).toBeLessThan(Math.min(lin, quad));
    expect(relativeError(both, lin)).toBeLessThan(1e-2);
    const D = 0.07;
    const bothBall = terminalSpeed({ m: 0.145, ...sphereDrag(D) });
    expect(relativeError(bothBall, terminalSpeed({ m: 0.145, c: sphereDrag(D).c }))).toBeLessThan(1e-3);
  });
});

describe('convergence', () => {
  it('RK4 converges to the linear-drag solution at fourth order', () => {
    const f: Fall = { ...DROP, v0: -10 };
    const err = (dt: number) => {
      const s = integrateFall(f, 1.6, dt).at(-1)!;
      return Math.abs(s.v - velocity(f, 1.6));
    };
    const e1 = err(0.04);
    const e2 = err(0.02);
    expect(e1).toBeLessThan(1e-5);
    expect(Math.log2(e1 / e2)).toBeGreaterThan(3.7);
  });

  it('RK4 converges to the tanh solution of quadratic drag at fourth order on a fall from rest', () => {
    const f: Fall = { ...DIVER, v0: 0 };
    const err = (dt: number) => {
      const s = integrateFall(f, 7, dt).at(-1)!;
      return Math.max(Math.abs(s.v - velocity(f, 7)), Math.abs(s.y - position(f, 7)));
    };
    const e1 = err(0.1);
    const e2 = err(0.05);
    expect(e1).toBeLessThan(1e-4);
    expect(Math.log2(e1 / e2)).toBeGreaterThan(3.7);
  });

  it('RK4 still converges through the top of a quadratic-drag throw up, where −c|v|v is not smooth (order drops)', () => {
    const f: Fall = { ...DIVER, v0: -30 };
    const err = (dt: number) => {
      const s = integrateFall(f, 7, dt).at(-1)!;
      return Math.max(Math.abs(s.v - velocity(f, 7)), Math.abs(s.y - position(f, 7)));
    };
    const e1 = err(0.1);
    const e2 = err(0.05);
    // |v|v has a continuous first derivative but not a second at v = 0: the step that crosses the top
    // limits RK4 to low order, yet the error is still small and still falls with dt
    expect(e1).toBeLessThan(1e-4);
    expect(e2).toBeLessThan(e1 / 2);
  });

  it('sampleFall with both drags matches the dominant law where one dominates, and reaches the joint terminal speed', () => {
    const D = 0.07;
    const f: Fall = { m: 0.145, ...sphereDrag(D) };
    const s = sampleFall(f, 20, 100);
    const quad: Fall = { m: 0.145, c: sphereDrag(D).c };
    expect(relativeError(s[50].v, velocity(quad, s[50].t))).toBeLessThan(2e-3);
    expect(relativeError(s.at(-1)!.v, terminalSpeed(f))).toBeLessThan(1e-3);
  });

  it('a projectile with drag → 0 (numericFlight under dragFlight) reproduces the drag-free flight', () => {
    const l = { v0: 20, angleDeg: 40 };
    const fl = dragFlight(l, { bOverM: 1e-12 });
    expect(relativeError(fl.time, levelFlightTime(l))).toBeLessThan(1e-9);
    expect(relativeError(fl.impact[0], analyticFlight(l).impact[0])).toBeLessThan(1e-9);
    const t = 1.1;
    const i = fl.times.findIndex((tt) => tt >= t - 1e-12);
    expect(relativeError(fl.path[i][1], positionAt(l, fl.times[i])[1])).toBeLessThan(1e-9);
  });

  it('a projectile under linear drag (numericFlight) converges to the analytic linear-drag path', () => {
    const l = { v0: 20, angleDeg: 40 };
    const tau = 0.8;
    const fl = dragFlight(l, { bOverM: 1 / tau }, { dt: 0.005 });
    for (const k of [40, 120, 200]) {
      const [x, y] = linearDragPosition(l, tau, fl.times[k]);
      expect(Math.hypot(fl.path[k][0] - x, fl.path[k][1] - y)).toBeLessThan(1e-9);
    }
  });
});
