import { describe, expect, it } from 'vitest';
import { C_LIGHT } from '~/physics/constants';
import {
  eventIn,
  eventToS,
  galileanEventIn,
  galileanEventToS,
  galileanMovingClock,
  latticeSpacing,
  movingClock,
  rearClockLead,
} from '~/physics/lorentzmap';
import { gammaOf, interval, lorentz } from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const c = C_LIGHT;
const close = (a: number, b: number, tol = 1e-12) => expect(relativeError(a, b)).toBeLessThan(tol);
/** |a − b| small against a scale (for values that may be 0) */
const near = (a: number, b: number, scale: number, tol = 1e-12) => expect(Math.abs(a - b)).toBeLessThan(tol * scale);

describe('analytic limits', () => {
  it('at β = 0 the moving lattice is the drawing lattice: same places, same readings', () => {
    for (const xi of [-4, 0, 2, 6]) {
      const k = movingClock(xi, 5, 0, 1);
      expect(k.x).toBe(xi);
      expect(k.reading).toBe(5);
    }
  });

  it('the clock at the moving origin reads T/γ: time dilation (β = 0.8, T = 5 s → 3 s)', () => {
    const k = movingClock(0, 5, 0.8, 1);
    close(k.x, 4);
    close(k.reading, 3);
  });

  it('two events simultaneous in S, 6 ls apart, are 8 s apart in S′ at β = 0.8; the one further along +x first', () => {
    const A = eventIn({ t: 3, x: 0 }, 'S′', 0.8, 1);
    const B = eventIn({ t: 3, x: 6 }, 'S′', 0.8, 1);
    close(A.t, 5);
    close(A.x, -4);
    close(B.t, -3);
    close(B.x, 6);
    close(B.t - A.t, -8);
  });

  it('each event of the lesson coincides with a clock of S′ that shows its time t′', () => {
    // at t = 3 s (β = 0.8) the S′ clocks at ξ′ = −4 and 6 ls stand at x = 0 and 6 ls, reading 5 s and −3 s
    const a = movingClock(-4, 3, 0.8, 1);
    const b = movingClock(6, 3, 0.8, 1);
    near(a.x, 0, 1);
    close(a.reading, 5);
    close(b.x, 6);
    close(b.reading, -3);
  });

  it('Galileo is the small-speed limit: at v = 30 m/s the Lorentz picture differs by parts in 1e13', () => {
    const v = 30;
    const b = v / c;
    const L = movingClock(300, 10, b, c);
    const Gal = galileanMovingClock(300, 10, b, c);
    expect(Math.abs(L.reading - Gal.reading)).toBeLessThan(2e-13);
    expect(relativeError(L.x, Gal.x)).toBeLessThan(1e-14);
  });
});

describe('conservation (invariants)', () => {
  it('a moving clock reads exactly the Lorentz time t′ of the event where it is', () => {
    for (const b of [-0.6, 0.3, 0.8, 0.95])
      for (const xi of [-6, 0, 2.5, 8])
        for (const T of [-3, 0, 4.2]) {
          const k = movingClock(xi, T, b, 1);
          const e = lorentz({ t: T, x: k.x }, b, 1);
          near(e.x, xi, 10);
          near(e.t, k.reading, 10);
        }
  });

  it('S′ drawing S is S drawing S′ with v → −v: the same clock, met at the same event, from both sides', () => {
    // an S clock at ξ = 4 ls, drawn at the instant t′ of S′; the event (t′, x′) maps back to x = 4 and its reading t
    const b = 0.6;
    const k = movingClock(4, 2, -b, 1);
    const e = eventToS({ t: 2, x: k.x }, 'S′', b, 1);
    near(e.x, 4, 1);
    near(e.t, k.reading, 1);
  });

  it('eventIn and eventToS undo each other, and the interval c²Δt² − Δx² is the same in both frames', () => {
    const e = { t: 5, x: 1 * c };
    const p = eventIn(e, 'S′', 0.8, c);
    close(p.t, 7);
    close(p.x, -5 * c);
    const back = eventToS(p, 'S′', 0.8, c);
    close(back.t, e.t);
    close(back.x, e.x);
    close(interval(p.t, p.x, c), interval(e.t, e.x, c));
  });

  it('Galileo keeps time and the distance between simultaneous events, and its maps undo each other', () => {
    const a = galileanEventIn({ t: 3, x: 0 }, 'S′', 0.8, 1);
    const b = galileanEventIn({ t: 3, x: 6 }, 'S′', 0.8, 1);
    expect(b.t - a.t).toBe(0);
    close(b.x - a.x, 6);
    const back = galileanEventToS(b, 'S′', 0.8, 1);
    close(back.x, 6);
    expect(back.t).toBe(3);
  });
});

describe('scaling', () => {
  it('the lattice spacing is d₀/γ: 2 ls → 1.2 ls at β = 0.8, the same for ±β', () => {
    close(latticeSpacing(2, 0.8), 1.2);
    close(latticeSpacing(2, -0.8), 1.2);
    for (const b of [0.1, 0.5, 0.9]) close(latticeSpacing(3, b), 3 / gammaOf(b));
  });

  it('at one instant neighbouring moving clocks differ by βd₀/c, the rear one ahead, at every instant', () => {
    for (const b of [0.3, 0.8])
      for (const T of [-2, 0, 7]) {
        const rear = movingClock(0, T, b, 1);
        const front = movingClock(2, T, b, 1);
        close(rear.reading - front.reading, rearClockLead(2, b, 1));
      }
    // drawn from S′, the S lattice moves toward −x: its rear is at larger x, and it is ahead
    const rear = movingClock(2, 1, -0.8, 1);
    const front = movingClock(0, 1, -0.8, 1);
    expect(rear.x).toBeGreaterThan(front.x);
    close(rear.reading - front.reading, rearClockLead(2, 0.8, 1));
  });

  it('in SI the lead vd₀/c² of a 900 m train at 0.8c is 2.4 μs', () => {
    close(rearClockLead(900, 0.8, c), 2.4e-6);
  });
});

describe('convergence', () => {
  it('a single moving clock advances at the rate 1/γ of the drawing frame, at every step size', () => {
    const b = 0.6;
    for (const dT of [1, 0.1, 1e-3]) {
      const a = movingClock(2, 1, b, 1);
      const z = movingClock(2, 1 + dT, b, 1);
      close((z.reading - a.reading) / dT, 1 / gammaOf(b), 1e-9);
      close((z.x - a.x) / dT, b, 1e-9);
    }
  });

  it('the Lorentz picture approaches the Galilean one as β → 0; the reading gap is βξ/c to first order in β', () => {
    // gap = T(1 − 1/γ) + βξ/c: its first-order part is βξ/c, the rest is O(β²)
    let prev = Infinity;
    for (const b of [0.1, 0.01, 0.001]) {
      const L = movingClock(5, 4, b, 1);
      const Gal = galileanMovingClock(5, 4, b, 1);
      const gap = Math.abs(L.reading - Gal.reading);
      expect(gap).toBeLessThan(prev);
      expect(Math.abs(gap / (b * 5) - 1)).toBeLessThan(b);
      prev = gap;
    }
  });
});
