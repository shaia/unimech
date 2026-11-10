import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  allowedIntervals,
  doubleWell,
  equilibria,
  harmonicWell,
  intervalAt,
  mechanicalEnergy,
  morseWell,
  period,
  sampleAt,
  simulate,
  smallOscillationPeriod,
  speedAt,
  stepLine,
  turningPoints,
  type Potential,
} from '~/physics/energy';
import { relativeError } from '~/physics/vec';

const { harmonic: SPRING, double: DOUBLE, morse: MORSE } = PRESETS;

/** The largest relative drift of the mechanical energy over a conservative run. */
function energyDrift(p: Potential, x0: number, dt: number, tEnd: number): number {
  const run = simulate(p, { x0, dt, tEnd });
  const E0 = run.samples[0].E;
  return Math.max(...run.samples.map((s) => Math.abs(s.E - E0))) / Math.abs(E0);
}

describe('analytic limits', () => {
  it('in a harmonic well the turning points are ±√(2E/k) and the speed at the bottom is √(2E/m)', () => {
    const k = 4;
    for (const E of [0.5, 2, 7]) {
      const tp = turningPoints(SPRING, E);
      expect(tp).toHaveLength(2);
      expect(relativeError(tp[1], Math.sqrt((2 * E) / k))).toBeLessThan(1e-12);
      expect(relativeError(tp[0], -Math.sqrt((2 * E) / k))).toBeLessThan(1e-12);
      expect(relativeError(speedAt(SPRING, E, 0), Math.sqrt((2 * E) / SPRING.m))).toBeLessThan(1e-14);
    }
  });

  it('in a harmonic well the period is 2π√(m/k) at every energy (the ∮dx/v sum and the small-oscillation formula agree)', () => {
    const T = 2 * Math.PI * Math.sqrt(SPRING.m / 4);
    expect(relativeError(smallOscillationPeriod(SPRING, 0), T)).toBeLessThan(1e-14);
    for (const E of [0.1, 2, 7]) {
      const [x1, x2] = turningPoints(SPRING, E);
      expect(relativeError(period(SPRING, E, x1, x2), T)).toBeLessThan(1e-9);
    }
  });

  it('the double well U₀((x/a)² − 1)² has turning points x² = a²(1 ± √(E/U₀)) below the hump and two above it', () => {
    const U0 = 2;
    const E = 1;
    const tp = turningPoints(DOUBLE, E);
    expect(tp).toHaveLength(4);
    const outer = Math.sqrt(1 + Math.sqrt(E / U0));
    const inner = Math.sqrt(1 - Math.sqrt(E / U0));
    for (const [got, want] of [
      [tp[0], -outer],
      [tp[1], -inner],
      [tp[2], inner],
      [tp[3], outer],
    ])
      expect(relativeError(got, want)).toBeLessThan(1e-12);
    const above = turningPoints(DOUBLE, 3);
    expect(above).toHaveLength(2);
    expect(relativeError(above[1], Math.sqrt(1 + Math.sqrt(3 / U0)))).toBeLessThan(1e-12);
  });

  it('the allowed region is two intervals below the hump of the double well, one above it, and open to infinity in a Morse well at E > 0', () => {
    expect(allowedIntervals(DOUBLE, 1)).toHaveLength(2);
    const one = allowedIntervals(DOUBLE, 3);
    expect(one).toHaveLength(1);
    expect(one[0].loTurn && one[0].hiTurn).toBe(true);
    const bound = allowedIntervals(MORSE, -1);
    expect(bound).toHaveLength(1);
    expect(bound[0].loTurn && bound[0].hiTurn).toBe(true);
    const free = allowedIntervals(MORSE, 0.5);
    expect(free).toHaveLength(1);
    expect(free[0].loTurn).toBe(true);
    expect(free[0].hiTurn).toBe(false);
  });

  it('the allowed interval holding x is bounded by the turning points around it, and is null where U(x) > E', () => {
    // double well below the hump (E = 1): x = ±1 lies between √(1 − √(E/U₀)) and √(1 + √(E/U₀)) on its side
    const inner = Math.sqrt(1 - Math.sqrt(1 / 2));
    const outer = Math.sqrt(1 + Math.sqrt(1 / 2));
    const right = intervalAt(DOUBLE, 1, 1);
    expect(right).not.toBeNull();
    expect(relativeError(right!.lo, inner)).toBeLessThan(1e-12);
    expect(relativeError(right!.hi, outer)).toBeLessThan(1e-12);
    expect(right!.loTurn && right!.hiTurn).toBe(true);
    const left = intervalAt(DOUBLE, 1, -1);
    expect(relativeError(left!.lo, -outer)).toBeLessThan(1e-12);
    expect(relativeError(left!.hi, -inner)).toBeLessThan(1e-12);
    // the hump top is forbidden below the hump, and a turning point itself belongs to its interval
    expect(intervalAt(DOUBLE, 1, 0)).toBeNull();
    expect(intervalAt(DOUBLE, 1, outer)).not.toBeNull();
    // above the hump (E = 3) one interval holds both wells
    const one = intervalAt(DOUBLE, 3, 0);
    expect(relativeError(one!.hi, Math.sqrt(1 + Math.sqrt(3 / 2)))).toBeLessThan(1e-12);
    expect(relativeError(one!.lo, -one!.hi)).toBeLessThan(1e-12);
    // a Morse well at E > 0: the interval is not bounded on the right
    const free = intervalAt(MORSE, 0.5, 3);
    expect(free!.loTurn).toBe(true);
    expect(free!.hiTurn).toBe(false);
  });

  it('the Morse turning points solve (1 − e^(−s))² = 1 + E/D, s = (x − x₀)/w', () => {
    const D = 2;
    const w = 0.5;
    const E = -1;
    const r = Math.sqrt(1 + E / D);
    const tp = turningPoints(MORSE, E);
    expect(tp).toHaveLength(2);
    expect(relativeError(tp[0], 1 - w * Math.log(1 + r))).toBeLessThan(1e-12);
    expect(relativeError(tp[1], 1 - w * Math.log(1 - r))).toBeLessThan(1e-12);
  });

  it('equilibria sit where U′ = 0, stable at a minimum (U″ > 0) and unstable at a maximum (U″ < 0)', () => {
    const eq = equilibria(DOUBLE);
    expect(eq.map((e) => e.kind)).toEqual(['stable', 'unstable', 'stable']);
    expect(relativeError(eq[0].x, -1)).toBeLessThan(1e-12);
    expect(Math.abs(eq[1].x)).toBeLessThan(1e-12);
    expect(relativeError(eq[1].U, 2)).toBeLessThan(1e-12);
    // U″(±a) = 8U₀/a² and U″(0) = −4U₀/a²
    expect(relativeError(eq[2].curvature, 16)).toBeLessThan(1e-12);
    expect(relativeError(eq[1].curvature, -8)).toBeLessThan(1e-12);
    const m = equilibria(MORSE);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe('stable');
    expect(relativeError(m[0].x, 1)).toBeLessThan(1e-12);
    expect(relativeError(m[0].curvature, (2 * 2) / 0.25)).toBeLessThan(1e-12);
  });

  it('a small oscillation about a minimum has the period 2π√(m/U″(x₀)): the ∮dx/v sum tends to it as E → U(x₀)', () => {
    for (const [p, x0] of [
      [DOUBLE, 1],
      [MORSE, 1],
    ] as const) {
      const T0 = smallOscillationPeriod(p, x0);
      const E = p.U(x0) + 1e-6;
      const tp = turningPoints(p, E).filter((x) => Math.abs(x - x0) < 0.1);
      expect(tp).toHaveLength(2);
      expect(relativeError(period(p, E, tp[0], tp[1]), T0)).toBeLessThan(1e-5);
    }
  });

  it('a particle released at rest at the bottom of a well stays there: zero force at an equilibrium', () => {
    const run = simulate(DOUBLE, { x0: 1, dt: 0.01, tEnd: 5 });
    expect(Math.max(...run.samples.map((s) => Math.abs(s.x - 1)))).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('without drag RK4 keeps the mechanical energy to 10⁻⁷ over many periods, in all three wells', () => {
    expect(energyDrift(SPRING, -1, 0.01, 30)).toBeLessThan(1e-7);
    expect(energyDrift(DOUBLE, 1.5, 0.005, 30)).toBeLessThan(1e-7);
    expect(energyDrift(MORSE, 0.6, 0.005, 30)).toBeLessThan(1e-7);
  });

  it('with drag the work of the drag, integrated on its own, equals the change in mechanical energy: W_nc = ΔE', () => {
    for (const b of [0.1, 0.5]) {
      const run = simulate(DOUBLE, { x0: 1.5, b, dt: 0.002, tEnd: 20 });
      const first = run.samples[0];
      for (const s of run.samples.filter((_, i) => i % 1000 === 0 || i === run.samples.length - 1)) {
        expect(Math.abs(s.Wnc - (s.E - first.E))).toBeLessThan(1e-8 * first.E);
      }
    }
  });

  it('with drag the mechanical energy only falls, and the particle settles at a stable equilibrium', () => {
    const run = simulate(DOUBLE, { x0: 1.5, b: 0.3, dt: 0.005, tEnd: 60 });
    const E = run.samples.map((s) => s.E);
    for (let i = 1; i < E.length; i++) expect(E[i]).toBeLessThanOrEqual(E[i - 1] + 1e-12);
    const end = run.samples[run.samples.length - 1];
    expect(Math.abs(Math.abs(end.x) - 1)).toBeLessThan(1e-3);
    expect(end.E).toBeLessThan(1e-5);
  });

  it('above the Morse plateau (E > 0) the particle leaves the domain; below it, it never does', () => {
    const E = 0.5;
    const x0 = turningPoints(MORSE, E)[0];
    expect(simulate(MORSE, { x0, dt: 0.005, tEnd: 30 }).escapedAt).not.toBeNull();
    const x1 = turningPoints(MORSE, -0.5)[0];
    expect(simulate(MORSE, { x0: x1, dt: 0.005, tEnd: 30 }).escapedAt).toBeNull();
  });

  it('a particle released at rest at a turning point turns at the other one: max x reached is the outer root of U = E', () => {
    const E = 1;
    const tp = turningPoints(DOUBLE, E);
    const run = simulate(DOUBLE, { x0: tp[3], dt: 0.002, tEnd: 4 });
    const xs = run.samples.map((s) => s.x);
    expect(relativeError(Math.min(...xs), tp[2])).toBeLessThan(1e-5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(tp[3] + 1e-9);
  });
});

describe('scaling', () => {
  it('a harmonic well with k four times as stiff turns at half the distance for the same E', () => {
    const soft = harmonicWell(1, 1);
    const stiff = harmonicWell(4, 1);
    expect(relativeError(turningPoints(soft, 0.5)[1] / turningPoints(stiff, 0.5)[1], 2)).toBeLessThan(1e-12);
  });

  it('the small-oscillation period of a double well scales as a√(m/U₀)', () => {
    const T1 = smallOscillationPeriod(doubleWell(2, 1, 1), 1);
    const T2 = smallOscillationPeriod(doubleWell(8, 3, 4), 3);
    expect(relativeError(T2 / T1, 3 * Math.sqrt((4 / 8) * 2))).toBeLessThan(1e-12);
  });

  it('a Morse well w times wider oscillates w times slower at the same depth', () => {
    const narrow = morseWell(2, 1, 0.5, 1, [0.3, 5]);
    const wide = morseWell(2, 1, 1, 1, [0.1, 9]);
    expect(relativeError(smallOscillationPeriod(wide, 1) / smallOscillationPeriod(narrow, 1), 2)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the RK4 energy error over a fixed time falls at least as dt⁴: halving dt divides it by 16 to 32', () => {
    // RK4 is fourth order, but its energy error carries a dt⁴ and a dt⁵ term of comparable size (a linear system, the
    // harmonic well, has only the dt⁵ one: ratio 32). At these steps the ratio lies between 16 and 32 (18–24 here;
    // 15.5–31.7 over other starts and durations) and drifts toward 16 as dt shrinks; at dt = 0.04 it was ~31 and
    // reached 35 for neighbouring starts, too close to a band edge. The fine run stays far above round-off.
    for (const [p, x0] of [
      [DOUBLE, 1.5],
      [MORSE, 0.6],
    ] as const) {
      for (const dt of [0.01, 0.005]) {
        const e1 = energyDrift(p, x0, dt, 10);
        const e2 = energyDrift(p, x0, dt / 2, 10);
        expect(e2).toBeGreaterThan(1e-11);
        expect(e1 / e2).toBeGreaterThan(14);
        expect(e1 / e2).toBeLessThan(40);
      }
    }
  });

  it('one RK4 step of the harmonic well matches the exact state (A cos ωt, −Aω sin ωt) to O(dt⁵)', () => {
    const w = 2;
    // the state error |Δx| + |Δv|/ω: from rest, the dt⁵ term of the step sits in v (x's starts at dt⁶)
    const err = (dt: number) => {
      const [x, v] = stepLine(SPRING, 1, 0, dt);
      return Math.abs(x - Math.cos(w * dt)) + Math.abs(v + w * Math.sin(w * dt)) / w;
    };
    const ratio = err(0.02) / err(0.01);
    expect(ratio).toBeGreaterThan(25);
    expect(ratio).toBeLessThan(40);
  });

  it('the ∮dx/v period sum converges with the number of points (the turning-point singularity is removed)', () => {
    const E = 1;
    const tp = turningPoints(DOUBLE, E);
    const fine = period(DOUBLE, E, tp[2], tp[3], 8000);
    expect(relativeError(period(DOUBLE, E, tp[2], tp[3], 400), fine)).toBeLessThan(1e-6);
  });

  it('sampleAt returns the samples at the step times, clamps outside the run, and interpolates between steps with an O(dt²) error', () => {
    // harmonic well, k = 4, m = 1, released at rest at x = −1: x(t) = −cos 2t
    const run = simulate(SPRING, { x0: -1, dt: 0.01, tEnd: 4 });
    const s = run.samples;
    const at = sampleAt(run, s[137].t);
    for (const k of ['x', 'v', 'E', 'K'] as const) expect(relativeError(at[k], s[137][k])).toBeLessThan(1e-9);
    expect(sampleAt(run, -1)).toBe(s[0]);
    expect(sampleAt(run, 99)).toBe(s[s.length - 1]);
    // worst error at the midpoints over one period: the chord of a curve misses it by dt²/8·|x″| ≤ dt²/8·4
    const worst = (dtWanted: number) => {
      const m = simulate(SPRING, { x0: -1, dt: dtWanted, tEnd: Math.PI });
      const dt = m.samples[1].t;
      let e = 0;
      for (let i = 0; i + 1 < m.samples.length; i++) {
        const t = m.samples[i].t + 0.5 * dt;
        e = Math.max(e, Math.abs(sampleAt(m, t).x + Math.cos(2 * t)));
      }
      return [e, dt] as const;
    };
    const [e1, dt1] = worst(0.02);
    const [e2] = worst(0.01);
    expect(relativeError(e1, (dt1 * dt1) / 2)).toBeLessThan(0.05);
    expect(e1 / e2).toBeGreaterThan(3.5);
    expect(e1 / e2).toBeLessThan(4.5);
  });

  it('the turning points agree with bisection to the last digits whatever the scan grid', () => {
    const a = turningPoints(DOUBLE, 1, 200);
    const b = turningPoints(DOUBLE, 1, 20000);
    a.forEach((x, i) => expect(relativeError(x, b[i])).toBeLessThan(1e-14));
    expect(relativeError(mechanicalEnergy(DOUBLE, a[0], 0), 1)).toBeLessThan(1e-12);
  });
});
