import { describe, expect, it } from 'vitest';
import {
  amplitudePeakFrequency,
  amplitudePhase,
  averagePowerPerMass,
  drivenMotion,
  energy,
  freeMotion,
  halfPowerFrequencies,
  integrate,
  linearAccel,
  parallelK,
  periodOf,
  qualityFactor,
  regime,
  seriesK,
  steadyState,
  type Oscillator,
} from '~/physics/oscillator';
import { relativeError } from '~/physics/vec';

const S0 = { x: 0.05, v: 0.3 };

describe('analytic limits', () => {
  it('an undamped oscillator returns to its initial state after one period 2π/ω₀', () => {
    const o: Oscillator = { omega0: 3 };
    const s = freeMotion(o, S0, periodOf(3));
    expect(relativeError(s.x, S0.x)).toBeLessThan(1e-12);
    expect(relativeError(s.v, S0.v)).toBeLessThan(1e-12);
  });

  it('A cos(ω₀t + φ) from amplitudePhase reproduces x₀ and v₀', () => {
    const { A, phi } = amplitudePhase(3, S0.x, S0.v);
    expect(relativeError(A * Math.cos(phi), S0.x)).toBeLessThan(1e-14);
    expect(relativeError(-A * 3 * Math.sin(phi), S0.v)).toBeLessThan(1e-14);
  });

  it('the three damped regimes join continuously at critical damping', () => {
    const t = 0.7;
    const crit = freeMotion({ omega0: 2, gamma: 4 }, S0, t);
    for (const g of [4 * (1 - 1e-6), 4 * (1 + 1e-6)]) {
      const s = freeMotion({ omega0: 2, gamma: g }, S0, t);
      expect(relativeError(s.x, crit.x)).toBeLessThan(1e-5);
    }
    expect(regime({ omega0: 2, gamma: 4 })).toBe('critical');
    expect(regime({ omega0: 2, gamma: 1 })).toBe('under');
    expect(regime({ omega0: 2, gamma: 9 })).toBe('over');
  });

  it('a slow drive moves the body by the static stretch f₀/ω₀², in phase; a fast one by f₀/ω², in antiphase', () => {
    const o: Oscillator = { omega0: 5, gamma: 0.5 };
    const slow = steadyState(o, 2, 1e-6);
    expect(relativeError(slow.A, 2 / 25)).toBeLessThan(1e-9);
    expect(slow.delta).toBeLessThan(1e-6);
    const fast = steadyState(o, 2, 5e3);
    expect(relativeError(fast.A, 2 / 25e6)).toBeLessThan(1e-4);
    expect(Math.PI - fast.delta).toBeLessThan(1e-3);
  });

  it('at ω = ω₀ the response lags the force by π/2 and its amplitude is Q f₀/ω₀²', () => {
    const o: Oscillator = { omega0: 5, gamma: 0.5 };
    const r = steadyState(o, 2, 5);
    expect(relativeError(r.delta, Math.PI / 2)).toBeLessThan(1e-14);
    expect(relativeError(r.A, (qualityFactor(o) * 2) / 25)).toBeLessThan(1e-14);
  });

  it('springs in series are softer than either spring, in parallel stiffer than both', () => {
    expect(seriesK(100, 100)).toBe(50);
    expect(parallelK(100, 100)).toBe(200);
  });
});

describe('conservation', () => {
  it('the undamped energy ½mv² + ½kx² is constant along the motion', () => {
    const m = 0.4;
    const k = 0.4 * 9;
    const E0 = energy(m, k, S0);
    for (const t of [0.1, 1.3, 7.7]) expect(relativeError(energy(m, k, freeMotion({ omega0: 3 }, S0, t)), E0)).toBeLessThan(1e-12);
  });

  it('with light damping the energy averaged over a cycle decays as e^(−γt)', () => {
    const o: Oscillator = { omega0: 10, gamma: 0.05 };
    const avgE = (t0: number) => {
      let s = 0;
      const n = 400;
      for (let i = 0; i < n; i++) s += energy(1, 100, freeMotion(o, { x: 1, v: 0 }, t0 + (i / n) * periodOf(10)));
      return s / n;
    };
    expect(relativeError(avgE(20) / avgE(0), Math.exp(-0.05 * 20))).toBeLessThan(2e-3);
  });

  it('in the steady state the drive’s average power equals the power the damping dissipates', () => {
    const o: Oscillator = { omega0: 4, gamma: 0.8 };
    const f0 = 1.5;
    const w = 3.3;
    const { A } = steadyState(o, f0, w);
    // dissipated: <γ v²> = γ ω² A²/2 (per unit mass)
    expect(relativeError(averagePowerPerMass(o, f0, w), (0.8 * w * w * A * A) / 2)).toBeLessThan(1e-14);
  });
});

describe('scaling', () => {
  it('the half-power points are exactly γ apart and the amplitude peak sits below ω₀ by about γ²/(4ω₀)', () => {
    const o: Oscillator = { omega0: 10, gamma: 0.4 };
    const [lo, hi] = halfPowerFrequencies(o);
    expect(relativeError(hi - lo, 0.4)).toBeLessThan(1e-12);
    const P = (w: number) => averagePowerPerMass(o, 1, w);
    expect(relativeError(P(lo), P(10) / 2)).toBeLessThan(1e-10);
    expect(relativeError(P(hi), P(10) / 2)).toBeLessThan(1e-10);
    expect(relativeError(10 - amplitudePeakFrequency(o), 0.16 / 40)).toBeLessThan(1e-3);
    expect(amplitudePeakFrequency({ omega0: 1, gamma: 2 })).toBeNaN();
  });
});

describe('convergence', () => {
  it('RK4 converges to the closed form in every regime and with a drive', () => {
    const cases: Array<[Oscillator, number, number]> = [
      [{ omega0: 3 }, 0, 0],
      [{ omega0: 3, gamma: 0.6 }, 0, 0],
      [{ omega0: 3, gamma: 6 }, 0, 0],
      [{ omega0: 3, gamma: 15 }, 0, 0],
      [{ omega0: 3, gamma: 0.6 }, 2, 2.5],
    ];
    for (const [o, f0, w] of cases) {
      const exact = drivenMotion(o, f0, w, S0, 4);
      const num = integrate(linearAccel(o, f0, w), S0, 4, 1e-3);
      expect(Math.abs(num.x - exact.x)).toBeLessThan(1e-9);
      expect(Math.abs(num.v - exact.v)).toBeLessThan(1e-9);
    }
  });
});
