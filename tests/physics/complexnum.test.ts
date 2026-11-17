import { describe, expect, it } from 'vitest';
import {
  amplitudeFromInitial,
  arctanNaive,
  cabs,
  cadd,
  carg,
  cdiv,
  cexp,
  cis,
  cmul,
  complex,
  compoundRotation,
  conj,
  cosSinToAmplitude,
  cscale,
  csub,
  derivativeAmplitude,
  dragDrivenAmplitude,
  expSeries,
  I,
  meanProduct,
  meanProductNumeric,
  polar,
  reAt,
  sumAmplitude,
  sumOfOscillations,
  toPolar,
  wrapAngle,
  type Complex,
} from '~/physics/complexnum';
import { rk4Step, type Body } from '~/physics/motion';
import { relativeError } from '~/physics/vec';

const close = (a: Complex, b: Complex) => cabs(csub(a, b)) / Math.max(1, cabs(a), cabs(b));
const SAMPLES: Complex[] = [complex(3, 4), complex(-3, 1.5), complex(-1, -2), complex(2.5, -0.5), complex(0, 2), complex(-4, 0)];

describe('analytic limits', () => {
  it("Euler's formula puts e^(iθ) on the unit circle: e^0 = 1, e^(iπ/2) = i, e^(iπ) = −1", () => {
    expect(close(cexp(complex(0, 0)), complex(1))).toBeLessThan(1e-15);
    expect(close(cexp(complex(0, Math.PI / 2)), I)).toBeLessThan(1e-15);
    expect(close(cexp(complex(0, Math.PI)), complex(-1))).toBeLessThan(1e-15);
    for (const th of [0.3, 1.7, -2.9, 5]) expect(relativeError(cabs(cexp(complex(0, th))), 1)).toBeLessThan(1e-15);
  });

  it('the argument is the calculator arctan(y/x) in the right half-plane, and differs from it by ±π in the left', () => {
    for (const z of SAMPLES) {
      const naive = arctanNaive(z);
      const phi = carg(z);
      if (z.re > 0) expect(Math.abs(phi - naive)).toBeLessThan(1e-15);
      else if (z.re < 0) expect(Math.abs(Math.abs(phi - naive) - Math.PI)).toBeLessThan(1e-14);
    }
    // the lesson's point: −3 + 1.5i is at 153.4°, not at −26.6°
    expect(relativeError((carg(complex(-3, 1.5)) * 180) / Math.PI, 153.43)).toBeLessThan(1e-4);
    expect(relativeError((arctanNaive(complex(-3, 1.5)) * 180) / Math.PI, -26.57)).toBeLessThan(1e-3);
  });

  it('two oscillations add to A₁ + A₂ in phase, |A₁ − A₂| in antiphase and √(A₁² + A₂²) a quarter period apart', () => {
    const [A1, A2] = [2.5, 1.5];
    expect(relativeError(sumAmplitude(A1, A2, 0), 4)).toBeLessThan(1e-15);
    expect(relativeError(sumAmplitude(A1, A2, Math.PI), 1)).toBeLessThan(1e-14);
    expect(relativeError(sumAmplitude(A1, A2, Math.PI / 2), Math.hypot(A1, A2))).toBeLessThan(1e-14);
    expect(sumAmplitude(1, 1, Math.PI)).toBeLessThan(1e-7);
  });

  it('the drag-driven velocity amplitude tends to F₀/b for a slow force and to F₀/(mω), a quarter period behind, for a fast one', () => {
    const slow = dragDrivenAmplitude(0.5, 2, 1, 1e-6);
    expect(relativeError(cabs(slow), 0.5)).toBeLessThan(1e-9);
    const fast = dragDrivenAmplitude(0.5, 2, 1, 1e6);
    expect(relativeError(cabs(fast), 1 / (0.5 * 1e6))).toBeLessThan(1e-9);
    expect(relativeError(carg(fast), -Math.PI / 2)).toBeLessThan(1e-5);
  });
});

describe('identities', () => {
  it('in a product the moduli multiply and the arguments add (mod 2π)', () => {
    for (const z of SAMPLES)
      for (const w of SAMPLES) {
        const p = cmul(z, w);
        expect(relativeError(cabs(p), cabs(z) * cabs(w))).toBeLessThan(1e-14);
        if (cabs(p) > 0) expect(Math.abs(wrapAngle(carg(p) - carg(z) - carg(w)))).toBeLessThan(1e-14);
      }
  });

  it('multiplying by i turns an arrow a quarter turn counter-clockwise, its length unchanged', () => {
    for (const z of SAMPLES) {
      const iz = cmul(I, z);
      expect(close(iz, complex(-z.im, z.re))).toBeLessThan(1e-15);
      expect(Math.abs(wrapAngle(carg(iz) - carg(z) - Math.PI / 2))).toBeLessThan(1e-14);
    }
  });

  it('z z̄ = |z|², and 1/z = z̄/|z|² has modulus 1/|z| and argument −arg z', () => {
    for (const z of SAMPLES) {
      const zz = cmul(z, conj(z));
      expect(relativeError(zz.re, cabs(z) ** 2)).toBeLessThan(1e-14);
      expect(Math.abs(zz.im)).toBeLessThan(1e-12);
      const inv = cdiv(complex(1), z);
      expect(close(inv, cscale(conj(z), 1 / cabs(z) ** 2))).toBeLessThan(1e-15);
      if (z.im !== 0 || z.re > 0) expect(Math.abs(wrapAngle(carg(inv) + carg(z)))).toBeLessThan(1e-14);
    }
  });

  it('the polar form returns the point: |z| e^(iφ) = z', () => {
    for (const z of SAMPLES) {
      const { r, phi } = toPolar(z);
      expect(close(polar(r, phi), z)).toBeLessThan(1e-15);
    }
  });

  it('e^(a+b) = e^a e^b, and cos θ = (e^(iθ) + e^(−iθ))/2, sin θ = (e^(iθ) − e^(−iθ))/(2i)', () => {
    const a = complex(0.4, 1.1);
    const b = complex(-0.7, 2.3);
    expect(close(cexp(cadd(a, b)), cmul(cexp(a), cexp(b)))).toBeLessThan(1e-15);
    for (const th of [0.2, 1.3, 2.9, -1.1]) {
      const c = cscale(cadd(cis(th), cis(-th)), 0.5);
      expect(relativeError(c.re, Math.cos(th))).toBeLessThan(1e-15);
      const s = cdiv(csub(cis(th), cis(-th)), complex(0, 2));
      expect(relativeError(s.re, Math.sin(th))).toBeLessThan(1e-15);
    }
  });

  it('Re is linear: the real sum of oscillations is the real part of the sum of complex amplitudes, at every time', () => {
    const w = 1.3;
    const list = [
      { A: 2.0, phi: 0.4 },
      { A: 1.2, phi: 2.5 },
      { A: 0.7, phi: -1.9 },
    ];
    const s = sumOfOscillations(list);
    for (const t of [0, 0.37, 1.9, 4.4, 7.1]) {
      const real = list.reduce((acc, o) => acc + o.A * Math.cos(w * t + o.phi), 0);
      expect(Math.abs(reAt(s.z, w, t) - real)).toBeLessThan(1e-14);
      expect(Math.abs(s.A * Math.cos(w * t + s.phi) - real)).toBeLessThan(1e-14);
    }
  });

  it('Re does not pass through a product: Re(zw) = Re z Re w − Im z Im w', () => {
    expect(cmul(I, I).re).toBe(-1); // while Re i · Re i = 0
    for (const z of SAMPLES)
      for (const w of SAMPLES) expect(Math.abs(cmul(z, w).re - (z.re * w.re - z.im * w.im))).toBeLessThan(1e-13);
  });

  it('c cos ωt + s sin ωt = Re((c − is)e^(iωt)), and the initial state fixes Ã: x(0) = Re Ã, v(0) = −ω Im Ã', () => {
    const w = 2.0;
    const A = cosSinToAmplitude(-1.5, 2.0);
    for (const t of [0, 0.3, 1.1, 2.6]) expect(Math.abs(reAt(A, w, t) - (-1.5 * Math.cos(w * t) + 2.0 * Math.sin(w * t)))).toBeLessThan(1e-14);
    const B = amplitudeFromInitial(-2.0, 15, 5.0);
    expect(relativeError(reAt(B, 5, 0), -2.0)).toBeLessThan(1e-15);
    expect(relativeError(reAt(derivativeAmplitude(B, 5), 5, 0), 15)).toBeLessThan(1e-15);
  });
});

describe('convergence', () => {
  it('the exponential series Σ (iθ)^k/k! converges to cos θ + i sin θ, faster than any power of 1/n', () => {
    const th = 2.0;
    const errs = [4, 8, 12, 16].map((n) => close(expSeries(complex(0, th), n), cis(th)));
    for (let k = 1; k < errs.length; k++) expect(errs[k]).toBeLessThan(errs[k - 1] / 20);
    expect(errs[3]).toBeLessThan(1e-9);
  });

  it('n small rotations (1 + iθ/n)^n approach e^(iθ) with an error that halves when n doubles (first order)', () => {
    const th = Math.PI;
    const e = (n: number) => close(compoundRotation(th, n), cis(th));
    for (const n of [100, 1000, 10000]) {
      const ratio = e(n) / e(2 * n);
      expect(ratio).toBeGreaterThan(1.9);
      expect(ratio).toBeLessThan(2.1);
    }
    expect(e(100000)).toBeLessThan(1e-4);
  });

  it('the cycle average of a product of two oscillations, by quadrature, converges to ½ Re(F̃ v̄)', () => {
    const F = polar(2.0, 0.3);
    const v = polar(0.5, -0.9);
    const exact = meanProduct(F, v);
    expect(relativeError(exact, 0.5 * 2.0 * 0.5 * Math.cos(1.2))).toBeLessThan(1e-14);
    expect(relativeError(meanProductNumeric(F, v, 3.0, 64), exact)).toBeLessThan(1e-12);
    // the wrong product Re(F̃ṽ e^(2iωt)) averages to zero over a cycle, and misses the mean entirely
    const T = (2 * Math.PI) / 3.0;
    let wrong = 0;
    for (let k = 0; k < 64; k++) wrong += reAt(cmul(F, v), 6.0, ((k + 0.5) * T) / 64) / 64;
    expect(Math.abs(wrong)).toBeLessThan(1e-12);
    expect(exact).toBeGreaterThan(0.1);
  });

  it('the derivative of Re(Ã e^(iωt)) by central differences converges to Re(iωÃ e^(iωt)) at second order', () => {
    const A = complex(-2, 1.5);
    const w = 1.7;
    const t = 0.8;
    const exact = reAt(derivativeAmplitude(A, w), w, t);
    const err = (h: number) => Math.abs((reAt(A, w, t + h) - reAt(A, w, t - h)) / (2 * h) - exact);
    const ratio = err(1e-2) / err(5e-3);
    expect(ratio).toBeGreaterThan(3.8);
    expect(ratio).toBeLessThan(4.2);
  });

  it('a body under linear drag and F₀ cos ωt, integrated by RK4, settles onto v = Re(ṽ e^(iωt)) with ṽ = F₀/(b + imω)', () => {
    const [m, b, F0, w] = [0.5, 2.0, 1.0, 4.0];
    const vt = dragDrivenAmplitude(m, b, F0, w);
    let body: Body = { pos: [0, 0, 0], vel: [0, 0, 0], m };
    const dt = 1e-3;
    let t = 0;
    // the transient decays as e^(−bt/m), time constant 0.25 s; integrate 20 time constants
    while (t < 5 - 1e-12) {
      body = rk4Step(body, (_p, vel, tt) => [-b * vel[0] + F0 * Math.cos(w * tt), 0, 0], t, dt);
      t += dt;
    }
    expect(Math.abs(body.vel[0] - reAt(vt, w, t))).toBeLessThan(1e-7);
    expect(relativeError(cabs(vt), 1 / Math.sqrt(8))).toBeLessThan(1e-14);
  });
});

describe('scaling', () => {
  it('multiplying by r e^(iα) scales every arrow by r and turns it by α: a figure keeps its shape', () => {
    const k = polar(1.5, 0.6);
    const [a, b] = [complex(1, 2), complex(-2, 0.5)];
    const before = cabs(csub(a, b));
    const after = cabs(csub(cmul(k, a), cmul(k, b)));
    expect(relativeError(after, 1.5 * before)).toBeLessThan(1e-14);
  });

  it('doubling every amplitude doubles the sum and leaves its phase unchanged', () => {
    const one = sumOfOscillations([
      { A: 1, phi: 0 },
      { A: 0.8, phi: 2.2 },
    ]);
    const two = sumOfOscillations([
      { A: 2, phi: 0 },
      { A: 1.6, phi: 2.2 },
    ]);
    expect(relativeError(two.A, 2 * one.A)).toBeLessThan(1e-14);
    expect(Math.abs(two.phi - one.phi)).toBeLessThan(1e-14);
  });
});
