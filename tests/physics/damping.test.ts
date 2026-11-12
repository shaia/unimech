import { describe, expect, it } from 'vitest';
import {
  characteristicRoots,
  criticalB,
  crossingTime,
  cyclesUntilEnergyFactor,
  dampedPeriod,
  dissipatedPower,
  energyAt,
  energyLossPerCycle,
  envelope,
  logDecrement,
  settlingTime,
  slowestRate,
  timeUntilAmplitudeFactor,
  timeUntilEnergyFactor,
} from '~/physics/damping';
import { freeMotion, integrate, linearAccel, type Oscillator } from '~/physics/oscillator';
import { relativeError } from '~/physics/vec';

const W0 = 4;
const REST = { x: 0.1, v: 0 };

describe('analytic limits', () => {
  it('without damping the roots of s² + γs + ω₀² = 0 are ±iω₀', () => {
    const [s1, s2] = characteristicRoots({ omega0: W0, gamma: 0 });
    expect(Math.abs(s1.re)).toBe(0);
    expect(relativeError(s1.im, W0)).toBeLessThan(1e-15);
    expect(relativeError(s2.im, -W0)).toBeLessThan(1e-15);
  });

  it('every root satisfies the characteristic equation, in all three regimes', () => {
    for (const g of [0.3, 6, 8, 16]) {
      for (const s of characteristicRoots({ omega0: W0, gamma: g })) {
        // (re + i im)² + γ(re + i im) + ω₀²
        const re = s.re * s.re - s.im * s.im + g * s.re + W0 * W0;
        const im = 2 * s.re * s.im + g * s.im;
        expect(Math.hypot(re, im) / (W0 * W0)).toBeLessThan(1e-12);
      }
    }
  });

  it('the roots sum to −γ and multiply to ω₀² (Vieta); under-damped roots lie on the circle |s| = ω₀', () => {
    for (const g of [0.5, 3, 7.9, 12]) {
      const [a, b] = characteristicRoots({ omega0: W0, gamma: g });
      expect(relativeError(a.re + b.re, -g)).toBeLessThan(1e-14);
      const prodRe = a.re * b.re - a.im * b.im;
      expect(relativeError(prodRe, W0 * W0)).toBeLessThan(1e-12);
      if (g < 2 * W0) expect(relativeError(Math.hypot(a.re, a.im), W0)).toBeLessThan(1e-14);
    }
  });

  it('critical damping is b = 2√(km), where the two roots meet at −ω₀', () => {
    const k = 16;
    const m = 1;
    expect(relativeError(criticalB(k, m), 2 * W0 * m)).toBeLessThan(1e-15);
    const [s1, s2] = characteristicRoots({ omega0: W0, gamma: criticalB(k, m) / m });
    expect(s1.re).toBe(-W0);
    expect(s2.re).toBe(-W0);
  });

  it('for weak damping the logarithmic decrement is πγ/ω₀ = π/Q and the energy lost per cycle is 2π/Q', () => {
    const o: Oscillator = { omega0: W0, gamma: 1e-4 };
    const Q = W0 / 1e-4;
    expect(relativeError(logDecrement(o), Math.PI / Q)).toBeLessThan(1e-6);
    expect(relativeError(energyLossPerCycle(o), (2 * Math.PI) / Q)).toBeLessThan(1e-4);
  });

  it('successive maxima of the under-damped motion are exactly e^(−Λ) apart', () => {
    const o: Oscillator = { omega0: W0, gamma: 1.3 };
    const T = dampedPeriod(o);
    // two times one damped period apart: the motion is e^(−γt/2) times a T_d-periodic function
    const x1 = freeMotion(o, REST, 0.37).x;
    const x2 = freeMotion(o, REST, 0.37 + T).x;
    expect(relativeError(x2 / x1, Math.exp(-logDecrement(o)))).toBeLessThan(1e-12);
  });

  it('the energy falls by e^(2π) after Q cycles when Q ≫ 1, and the amplitude takes twice as long as the energy to fall by any factor', () => {
    const o: Oscillator = { omega0: W0, gamma: 0.004 };
    const Q = W0 / 0.004;
    expect(relativeError(cyclesUntilEnergyFactor(o, Math.exp(2 * Math.PI)), Q)).toBeLessThan(1e-6);
    for (const f of [2, 10, 100]) expect(relativeError(timeUntilAmplitudeFactor(o, f), 2 * timeUntilEnergyFactor(o, f))).toBeLessThan(1e-15);
  });

  it('a strongly over-damped body creeps back at the rate k/b = ω₀²/γ, set by the spring and the damper alone', () => {
    for (const g of [100, 1e3, 1e4]) {
      expect(relativeError(slowestRate({ omega0: W0, gamma: g }), (W0 * W0) / g)).toBeLessThan(2 * (W0 / g) ** 2);
    }
  });

  it('the under-damped envelope bounds the motion and touches it', () => {
    const o: Oscillator = { omega0: W0, gamma: 0.8 };
    let touch = 0;
    for (let i = 0; i <= 4000; i++) {
      const t = (6 * i) / 4000;
      const r = Math.abs(freeMotion(o, REST, t).x) / envelope(o, REST, t);
      expect(r).toBeLessThan(1 + 1e-12);
      touch = Math.max(touch, r);
    }
    expect(touch).toBeGreaterThan(0.9999);
  });
});

describe('conservation (the energy balance)', () => {
  it('the energy lost equals the work of the damping force, ∫ bẋ² dt (dE/dt = −bẋ² exactly)', () => {
    const m = 1;
    for (const g of [0.8, 8, 16]) {
      const o: Oscillator = { omega0: W0, gamma: g };
      const T = 3;
      const n = 6000;
      let lost = 0;
      // Simpson's rule on b v²
      for (let i = 0; i <= n; i++) {
        const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
        lost += w * dissipatedPower(o, m, REST, (T * i) / n);
      }
      lost *= T / n / 3;
      const dE = energyAt(o, m, REST, 0) - energyAt(o, m, REST, T);
      expect(relativeError(lost, dE)).toBeLessThan(1e-9);
    }
  });

  it('the energy never rises: it is flat only at the turning points, where ẋ = 0', () => {
    const o: Oscillator = { omega0: W0, gamma: 0.8 };
    let prev = energyAt(o, 1, REST, 0);
    for (let i = 1; i <= 3000; i++) {
      const E = energyAt(o, 1, REST, (6 * i) / 3000);
      expect(E).toBeLessThanOrEqual(prev * (1 + 1e-14));
      prev = E;
    }
  });
});

describe('scaling', () => {
  it('the slowest decay rate is largest at critical damping, where it equals ω₀', () => {
    const rates = [0.5, 2, 4, 6, 7.9, 8, 8.1, 10, 16, 32].map((g) => ({ g, r: slowestRate({ omega0: W0, gamma: g }) }));
    const best = rates.reduce((a, b) => (b.r > a.r ? b : a));
    expect(best.g).toBe(8);
    expect(relativeError(best.r, W0)).toBeLessThan(1e-12);
  });

  it('released from rest, more damping above critical returns more slowly (settling time to 1 % grows with γ)', () => {
    const ts = [8, 12, 16, 24].map((g) => settlingTime({ omega0: W0, gamma: g }, REST, 0.01, 20));
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
  });

  it('an under-damped settling time to a small band approaches the envelope estimate 2 ln(1/tol)/γ', () => {
    const o: Oscillator = { omega0: W0, gamma: 0.4 };
    const ts = settlingTime(o, REST, 1e-3, 60, 60000);
    const est = timeUntilAmplitudeFactor(o, 1e3);
    // the last exit from the band happens within one half damped period of the envelope's own crossing
    expect(Math.abs(ts - est)).toBeLessThan(dampedPeriod(o) / 2 + 0.3);
  });

  it('an over-damped body crosses x = 0 once, and only when pushed toward it faster than |s₂|x₀', () => {
    const o: Oscillator = { omega0: W0, gamma: 16 };
    const [, s2] = characteristicRoots(o);
    const vc = -s2.re * REST.x;
    expect(crossingTime(o, { x: REST.x, v: -0.99 * vc })).toBeNull();
    const t = crossingTime(o, { x: REST.x, v: -1.01 * vc });
    expect(t).not.toBeNull();
    expect(Math.abs(freeMotion(o, { x: REST.x, v: -1.01 * vc }, t as number).x)).toBeLessThan(1e-14);
    expect(crossingTime(o, REST)).toBeNull();
  });
});

describe('convergence', () => {
  it('RK4 on ẍ + γẋ + ω₀²x = 0 converges to the closed form at fourth order, in every regime', () => {
    for (const g of [0.8, 8, 16]) {
      const o: Oscillator = { omega0: W0, gamma: g };
      const exact = freeMotion(o, { x: 0.1, v: -0.5 }, 2).x;
      const e1 = Math.abs(integrate(linearAccel(o), { x: 0.1, v: -0.5 }, 2, 0.02).x - exact);
      const e2 = Math.abs(integrate(linearAccel(o), { x: 0.1, v: -0.5 }, 2, 0.01).x - exact);
      expect(e1 / e2).toBeGreaterThan(12);
      expect(e2).toBeLessThan(1e-6);
    }
  });
});
