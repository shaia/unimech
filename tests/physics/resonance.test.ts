import { describe, expect, it } from 'vitest';
import { averagePowerPerMass, amplitudePeakFrequency, drivenMotion, integrate, linearAccel, steadyState, type Oscillator } from '~/physics/oscillator';
import {
  amplitudeAndLag,
  amplitudeAtNatural,
  amplitudeWidth,
  averageEnergyPerMass,
  cabs,
  carg,
  cdiv,
  cis,
  cmul,
  complexAmplitude,
  decompose,
  denominator,
  energyQ,
  peakAmplitude,
  peakPowerPerMass,
  powerWidth,
  resonanceCurve,
  resonantEnvelope,
  settlingTime,
  staticAmplitude,
  transientTime,
} from '~/physics/resonance';
import { relativeError } from '~/physics/vec';

const O: Oscillator = { omega0: 10, gamma: 1.25 }; // Q = 8, the default of figure 5.4
const F0 = 1; // f₀ = F₀/m [m/s²]

describe('analytic limits', () => {
  it('the complex amplitude has modulus A and argument −δ of the real steady state', () => {
    for (const w of [0.5, 6, 10, 14, 30]) {
      const X = complexAmplitude(O, F0, w);
      const r = steadyState(O, F0, w);
      expect(relativeError(cabs(X), r.A)).toBeLessThan(1e-14);
      expect(relativeError(-carg(X), r.delta)).toBeLessThan(1e-13);
      const m = amplitudeAndLag(O, F0, w);
      expect(relativeError(m.A, r.A)).toBeLessThan(1e-14);
      expect(relativeError(m.delta, r.delta)).toBeLessThan(1e-13);
    }
  });

  it('z = X̃e^(iωt) solves the complex equation: (−ω² + iγω + ω₀²)X̃ = f₀', () => {
    const w = 7;
    const X = complexAmplitude(O, F0, w);
    const lhs = cmul(denominator(O, w), X);
    expect(relativeError(lhs.re, F0)).toBeLessThan(1e-14);
    expect(Math.abs(lhs.im)).toBeLessThan(1e-14);
  });

  it("Euler's formula: e^(iπ) = −1, e^(iπ/2) = i, and multiplying adds the angles", () => {
    expect(relativeError(cis(Math.PI).re, -1)).toBeLessThan(1e-15);
    expect(Math.abs(cis(Math.PI / 2).re)).toBeLessThan(1e-15);
    const p = cmul(cis(0.4), cis(1.1));
    expect(relativeError(carg(p), 1.5)).toBeLessThan(1e-14);
    expect(relativeError(cabs(cdiv(cis(0.4), cis(1.1))), 1)).toBeLessThan(1e-14);
  });

  it('a slow drive is followed in phase with the static displacement F₀/k: δ → 0, A → f₀/ω₀²', () => {
    const r = amplitudeAndLag(O, F0, 1e-4);
    expect(relativeError(r.A, staticAmplitude(O, F0))).toBeLessThan(1e-8);
    expect(r.delta).toBeLessThan(1e-5);
  });

  it('a fast drive moves a free mass: A → f₀/ω², and δ → π with π − δ ≈ γ/ω', () => {
    const w = 1e4;
    const r = amplitudeAndLag(O, F0, w);
    expect(relativeError(r.A, F0 / (w * w))).toBeLessThan(1e-5);
    expect(relativeError(Math.PI - r.delta, 1.25 / w)).toBeLessThan(1e-5);
  });

  it('at ω = ω₀ the lag is exactly π/2 and the amplitude is Q·F₀/k', () => {
    const r = amplitudeAndLag(O, F0, O.omega0);
    expect(relativeError(r.delta, Math.PI / 2)).toBeLessThan(1e-15);
    expect(relativeError(r.A, amplitudeAtNatural(O, F0))).toBeLessThan(1e-14);
    expect(relativeError(r.A, 8 * staticAmplitude(O, F0))).toBeLessThan(1e-14);
  });

  it('the amplitude peak is f₀/(γω_d), at ω_max = √(ω₀² − γ²/2), and no sample of the curve exceeds it', () => {
    const o: Oscillator = { omega0: 10, gamma: 6 };
    const wm = amplitudePeakFrequency(o);
    expect(relativeError(steadyState(o, F0, wm).A, peakAmplitude(o, F0))).toBeLessThan(1e-14);
    const top = Math.max(...resonanceCurve(o, F0, 0, 20, 4000).map((s) => s.A));
    expect(top).toBeLessThanOrEqual(peakAmplitude(o, F0) * (1 + 1e-14));
    expect(relativeError(top, peakAmplitude(o, F0))).toBeLessThan(1e-6);
  });

  it('the lag is π/4 and 3π/4 exactly at the half-power frequencies', () => {
    const { lo, hi } = powerWidth(O);
    expect(relativeError(amplitudeAndLag(O, F0, lo).delta, Math.PI / 4)).toBeLessThan(1e-13);
    expect(relativeError(amplitudeAndLag(O, F0, hi).delta, (3 * Math.PI) / 4)).toBeLessThan(1e-13);
  });

  it('from rest at ω = ω₀ the envelope grows at f₀/(2ω₀) at first, whatever the damping', () => {
    for (const g of [0.01, 0.1, 1]) {
      const o: Oscillator = { omega0: 10, gamma: g };
      const t = 1e-4;
      expect(relativeError(resonantEnvelope(o, F0, t) / t, F0 / (2 * 10))).toBeLessThan(1e-3);
    }
  });
});

describe('conservation (energy balance)', () => {
  it('in the steady state the drive puts in, per cycle, exactly what the damping takes out', () => {
    for (const w of [4, 10, 17]) {
      const { A, delta } = steadyState(O, F0, w);
      const n = 20000;
      const T = (2 * Math.PI) / w;
      let pin = 0;
      let pout = 0;
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) * T) / n;
        const v = -A * w * Math.sin(w * t - delta);
        pin += F0 * Math.cos(w * t) * v;
        pout += (O.gamma ?? 0) * v * v;
      }
      expect(relativeError(pin / n, averagePowerPerMass(O, F0, w))).toBeLessThan(1e-9);
      expect(relativeError(pout / n, pin / n)).toBeLessThan(1e-9);
      // ½ f₀ ω A sin δ is the same power
      expect(relativeError(0.5 * F0 * w * A * Math.sin(delta), pin / n)).toBeLessThan(1e-9);
    }
  });

  it('Q = 2π × (energy stored) / (energy lost per cycle) at ω = ω₀', () => {
    for (const g of [0.05, 1.25, 4]) {
      const o: Oscillator = { omega0: 10, gamma: g };
      expect(relativeError(energyQ(o, F0, 10), 10 / g)).toBeLessThan(1e-14);
    }
  });

  it('at ω = ω₀ the stored energy is constant in time, ½ω₀²A² per unit mass', () => {
    const { A, delta } = steadyState(O, F0, 10);
    for (const t of [0, 0.13, 0.4]) {
      const x = A * Math.cos(10 * t - delta);
      const v = -A * 10 * Math.sin(10 * t - delta);
      expect(relativeError(0.5 * v * v + 50 * x * x, averageEnergyPerMass(O, F0, 10))).toBeLessThan(1e-13);
    }
  });

  it('the peak power f₀²/(2γ) is reached at ω₀ and half of it at the edges of the power width', () => {
    const { lo, hi } = powerWidth(O);
    expect(relativeError(averagePowerPerMass(O, F0, 10), peakPowerPerMass(O, F0))).toBeLessThan(1e-14);
    expect(relativeError(averagePowerPerMass(O, F0, lo), 0.5 * peakPowerPerMass(O, F0))).toBeLessThan(1e-13);
    expect(relativeError(averagePowerPerMass(O, F0, hi), 0.5 * peakPowerPerMass(O, F0))).toBeLessThan(1e-13);
  });
});

describe('scaling', () => {
  it('the power width is exactly γ = ω₀/Q, for any damping', () => {
    for (const g of [0.02, 1, 5, 12]) expect(relativeError(powerWidth({ omega0: 10, gamma: g }).width, g)).toBeLessThan(1e-13);
  });

  it('the half-height width of A² tends to γ as Q grows, with a relative error that falls like 1/Q²', () => {
    const errs = [10, 20, 40].map((Q) => relativeError(amplitudeWidth({ omega0: 10, gamma: 10 / Q }).width, 10 / Q));
    expect(errs[2]).toBeLessThan(1e-3);
    expect(errs[0] / errs[1]).toBeGreaterThan(3.5);
    expect(errs[1] / errs[2]).toBeGreaterThan(3.5);
  });

  it('A² is exactly half its peak at both edges of amplitudeWidth', () => {
    const o: Oscillator = { omega0: 10, gamma: 3 };
    const { lo, hi } = amplitudeWidth(o);
    const peak2 = peakAmplitude(o, F0) ** 2;
    expect(relativeError(steadyState(o, F0, lo).A ** 2, 0.5 * peak2)).toBeLessThan(1e-12);
    expect(relativeError(steadyState(o, F0, hi).A ** 2, 0.5 * peak2)).toBeLessThan(1e-12);
  });

  it('the resonant amplitude grows in proportion to Q, and so does the transient time 2Q/ω₀', () => {
    const a = { omega0: 10, gamma: 1 };
    const b = { omega0: 10, gamma: 0.5 };
    expect(relativeError(amplitudeAtNatural(b, F0) / amplitudeAtNatural(a, F0), 2)).toBeLessThan(1e-15);
    expect(relativeError(transientTime(b) / transientTime(a), 2)).toBeLessThan(1e-15);
    expect(relativeError(settlingTime(a, 0.1), 2 * Math.log(10))).toBeLessThan(1e-15);
  });
});

describe('convergence', () => {
  it('RK4 from rest converges to the closed-form driven motion, with error falling like dt⁴', () => {
    const w = 8;
    const s0 = { x: 0, v: 0 };
    const exact = drivenMotion(O, F0, w, s0, 3);
    const err = (dt: number) => Math.abs(integrate(linearAccel(O, F0, w), s0, 3, dt).x - exact.x);
    const e1 = err(0.02);
    const e2 = err(0.01);
    expect(e1 / e2).toBeGreaterThan(12);
    // measured against the steady amplitude: x itself may sit near a zero crossing
    const A = steadyState(O, F0, w).A;
    expect(Math.abs(integrate(linearAccel(O, F0, w), s0, 3, 0.001).x - exact.x) / A).toBeLessThan(1e-9);
  });

  it('the transient part falls as e^(−γt/2): after t its size is e^(−γt/2) of its start', () => {
    const s0 = { x: 0.05, v: 0 };
    const w = 6;
    const size = (t: number) => {
      // amplitude of the free under-damped motion from its state: √(x² + ((v + ax)/ω_d)²) e^(…) is the envelope
      const tr = decompose(O, F0, w, s0, t).transient;
      const a = 0.625;
      const wd = Math.sqrt(100 - a * a);
      return Math.hypot(tr.x, (tr.v + a * tr.x) / wd);
    };
    const t = 3.2;
    expect(relativeError(size(t) / size(0), Math.exp(-1.25 * t / 2))).toBeLessThan(1e-12);
  });

  it('steady state + transient = the whole motion, and two different starts end in the same steady state', () => {
    const w = 9;
    const t = 40; // 25 transient times
    const a = drivenMotion(O, F0, w, { x: 0, v: 0 }, t);
    const b = drivenMotion(O, F0, w, { x: 0.05, v: 0.8 }, t);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-11);
    const d = decompose(O, F0, w, { x: 0.05, v: 0.8 }, 1.3);
    const whole = drivenMotion(O, F0, w, { x: 0.05, v: 0.8 }, 1.3);
    expect(relativeError(d.steady.x + d.transient.x, whole.x)).toBeLessThan(1e-12);
  });

  it('the weak-damping envelope A₀(1 − e^(−γt/2)) matches the exact motion from rest at ω₀ to order 1/Q', () => {
    const o: Oscillator = { omega0: 12, gamma: 0.12 }; // Q = 100
    let worst = 0;
    const A0 = amplitudeAtNatural(o, F0);
    for (let t = 0; t < 60; t += 0.013) {
      const x = drivenMotion(o, F0, 12, { x: 0, v: 0 }, t).x;
      worst = Math.max(worst, Math.abs(x - resonantEnvelope(o, F0, t) * Math.sin(12 * t)));
    }
    expect(worst / A0).toBeLessThan(0.02);
  });
});
