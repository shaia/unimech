/**
 * Complex numbers and the complex exponential as a tool for oscillations (lesson 0.6). The arithmetic helpers come
 * from `resonance.ts` (lesson 5.4 owns them); this module adds what chapter 0 teaches on top of them: the polar
 * form and its quadrant, the conjugate, the exponential of any complex number, the series and the limit that define
 * e^(iθ), an oscillation as the real part of a rotating arrow, and the sum of oscillations of one frequency.
 *
 * MODEL SPECIFICATION
 * - System: numbers z = x + iy with i² = −1, drawn as points (x, y) of the complex plane (Re to the right, Im up),
 *   and real harmonic oscillations x(t) = A cos(ωt + φ) of one angular frequency ω, with A ≥ 0 and φ in rad.
 * - Dynamics: Euler's formula e^(iθ) = cos θ + i sin θ, so z = |z| e^(iφ) with |z| = √(x² + y²), φ = arg z.
 *   In a product the moduli multiply and the arguments add. An oscillation is x(t) = Re(Ã e^(iωt)) with the
 *   complex amplitude Ã = A e^(iφ); d/dt multiplies Ã by iω (a quarter turn ahead, ω times longer). Oscillations of
 *   the same ω add as their complex amplitudes add: |Ã₁ + Ã₂|² = A₁² + A₂² + 2A₁A₂ cos(φ₂ − φ₁).
 *   The cycle average of a product of two oscillations is ⟨Re(F̃e^(iωt)) Re(ṽe^(iωt))⟩ = ½ Re(F̃ conj(ṽ)).
 * - Boundary: arg z is returned in (−π, π] (atan2). Time t in s, ω in rad/s.
 * - Ignored: nothing physical; floating-point rounding only.
 * - Valid when: Re may be taken at the end of a calculation only through linear operations with real
 *   coefficients (sums, real multiples, time derivatives and integrals). A product of two oscillations must be
 *   formed from the real quantities (or from ½(z + z̄)), never as Re of the product of complex amplitudes.
 * - Failure modes: arg 0 is returned as 0 (it is undefined); `arctanNaive` is the calculator's arctan(y/x), wrong by
 *   ±π whenever x < 0 and undefined at x = 0 (it returns ±π/2 there) — it exists to show that error, not to use it.
 *   `sumOfOscillations` assumes one common ω: oscillations of different frequencies do not add to one sinusoid.
 */

import { cabs, cadd, carg, cdiv, cis, cmul, complex, polar, type Complex } from './resonance';

export { cabs, cadd, carg, cdiv, cis, cmul, complex, polar, type Complex };

export const csub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
/** The conjugate z̄ = x − iy: the mirror image in the real axis. */
export const conj = (z: Complex): Complex => ({ re: z.re, im: -z.im });
/** A real multiple a·z. */
export const cscale = (z: Complex, a: number): Complex => ({ re: a * z.re, im: a * z.im });
/** e^z = e^x (cos y + i sin y). */
export const cexp = (z: Complex): Complex => polar(Math.exp(z.re), z.im);
/** i, the unit of the imaginary axis. */
export const I: Complex = { re: 0, im: 1 };

/** The polar form: modulus r = |z| and argument φ = arg z ∈ (−π, π]. */
export const toPolar = (z: Complex): { r: number; phi: number } => ({ r: cabs(z), phi: carg(z) });

/** The calculator's arctan(y/x), which ignores the quadrant (see Failure modes). */
export function arctanNaive(z: Complex): number {
  if (z.re === 0) return z.im >= 0 ? Math.PI / 2 : -Math.PI / 2;
  return Math.atan(z.im / z.re);
}

/** An angle brought into (−π, π]. */
export function wrapAngle(a: number): number {
  const t = 2 * Math.PI;
  let r = ((a % t) + t) % t; // [0, 2π)
  if (r > Math.PI) r -= t;
  return r;
}

/** The partial sum Σ_{k=0}^{n} z^k / k! of the exponential series. */
export function expSeries(z: Complex, n: number): Complex {
  let term = complex(1);
  let sum = complex(1);
  for (let k = 1; k <= n; k++) {
    term = cscale(cmul(term, z), 1 / k);
    sum = cadd(sum, term);
  }
  return sum;
}

/** (1 + iθ/n)^n: n small rotations, each by about θ/n; tends to e^(iθ) as n → ∞. */
export function compoundRotation(theta: number, n: number): Complex {
  const step = complex(1, theta / n);
  let z = complex(1);
  for (let k = 0; k < n; k++) z = cmul(z, step);
  return z;
}

/** The oscillation x(t) = Re(Ã e^(iωt)). */
export const reAt = (A: Complex, omega: number, t: number): number => cmul(A, cis(omega * t)).re;

/** The complex amplitude of the derivative: d/dt Re(Ã e^(iωt)) = Re(iωÃ e^(iωt)). */
export const derivativeAmplitude = (A: Complex, omega: number): Complex => cmul(complex(0, omega), A);

/** c cos ωt + s sin ωt = Re((c − is) e^(iωt)). */
export const cosSinToAmplitude = (c: number, s: number): Complex => complex(c, -s);

/** The complex amplitude from the initial state: x(0) = Re Ã, v(0) = −ω Im Ã. */
export const amplitudeFromInitial = (x0: number, v0: number, omega: number): Complex => complex(x0, -v0 / omega);

/** A list of oscillations A_k cos(ωt + φ_k), one ω, added: the complex amplitude, its modulus and its phase. */
export function sumOfOscillations(list: { A: number; phi: number }[]): { z: Complex; A: number; phi: number } {
  let z = complex(0);
  for (const o of list) z = cadd(z, polar(o.A, o.phi));
  return { z, A: cabs(z), phi: carg(z) };
}

/** The amplitude of A₁cos ωt + A₂cos(ωt + Δφ): the law of cosines for the two arrows. */
export const sumAmplitude = (A1: number, A2: number, dphi: number): number =>
  Math.sqrt(Math.max(0, A1 * A1 + A2 * A2 + 2 * A1 * A2 * Math.cos(dphi)));

/** The cycle average ⟨Re(F̃e^(iωt)) · Re(ṽe^(iωt))⟩ = ½ Re(F̃ v̄). */
export const meanProduct = (F: Complex, v: Complex): number => 0.5 * cmul(F, conj(v)).re;

/** The cycle average of the same product by the midpoint rule with n samples (to check `meanProduct`). */
export function meanProductNumeric(F: Complex, v: Complex, omega: number, n: number): number {
  const T = (2 * Math.PI) / omega;
  let s = 0;
  for (let k = 0; k < n; k++) {
    const t = ((k + 0.5) * T) / n;
    s += reAt(F, omega, t) * reAt(v, omega, t);
  }
  return s / n;
}

/**
 * The steady velocity of a body under linear drag and a sinusoidal force, m v̇ = −b v + F₀ cos ωt (a first-order
 * equation solved by the complex method): ṽ = F₀/(b + imω), v = Re(ṽ e^(iωt)).
 */
export const dragDrivenAmplitude = (m: number, b: number, F0: number, omega: number): Complex =>
  cdiv(complex(F0), complex(b, m * omega));
