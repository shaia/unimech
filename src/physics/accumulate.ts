/**
 * Accumulation (lesson 0.4): a definite integral as the limit of a sum of small pieces. A rate that
 * changes (a velocity, an acceleration, a linear density) is cut into N pieces; in each piece the rate is
 * nearly constant, so the piece contributes rate × width; the sum tends to the integral as N → ∞.
 * The figure RiemannSum draws these sums; the lesson's numbers are recomputed with these functions.
 *
 * MODEL SPECIFICATION
 * - System: a rate f(s) of one variable s (the time t, or the position x along a thin rod) on a closed
 *   interval [a, b]. Each lesson profile carries its exact antiderivative F (with F(a) = 0), the zeros of f
 *   where it changes sign, and for a rod the exact first moment G(x) = ∫₀ˣ s·λ(s) ds.
 * - Dynamics: none. The signed sum Σ f(sᵢ)Δs (Δs = (b − a)/N, sᵢ the left end or the middle of piece i)
 *   tends to F(b) − F(a). The unsigned sum Σ |f(sᵢ)|Δs tends to the total ∫|f| ds, which for a velocity
 *   is the distance travelled: the integral split at the zeros of f, each part taken in absolute value.
 * - Boundary: the profiles' intervals are fixed (below). A rod lies on the x axis from 0 to L.
 * - Ignored: improper integrals (an infinite rate or interval), densities that are not integrable; a rod
 *   is thin, so its mass depends only on x.
 * - Valid when: f is smooth on each piece. The left sum's error falls as 1/N, the midpoint sum's as 1/N²;
 *   the midpoint sum of a linear rate is exact for every N (the two triangles in each piece cancel).
 * - Failure modes: a sum over [a, b] with b < a is the negative of the sum over [b, a]; a piece that
 *   straddles a zero of f mixes signs, so the unsigned sum of a velocity converges to the distance only as
 *   N grows.
 */

import { riemann, type Fn, type RiemannRule } from './calculus';

export type MotionKey = 'reverse' | 'swing' | 'accel';
export type RodKey = 'uniform' | 'tapered' | 'bulge';
export type ProfileKey = MotionKey | RodKey;

export interface Profile {
  key: ProfileKey;
  /** a rate in time (velocity or acceleration), or a linear density along a rod */
  kind: 'velocity' | 'acceleration' | 'rod';
  f: Fn;
  /** the antiderivative of f with F(a) = 0 */
  F: Fn;
  a: number;
  b: number;
  /** zeros of f inside (a, b) where it changes sign, ascending */
  roots: number[];
  /** rods only: the first moment G(x) = ∫₀ˣ s·λ(s) ds */
  G?: Fn;
}

/** A car drives forward, stops at t = 2 s and backs up: v = 4 − 2t m/s on [0, 3] s. */
const V0_REV = 4.0;
const K_REV = 2.0;
/** A cart on a spring: x = A sin ωt, so v = Aω cos ωt, over one period. */
export const SWING_A = 0.5;
export const SWING_W = Math.PI / 2;
/** A car whose acceleration fades linearly: a = a₀(1 − t/T) on [0, T]. */
export const ACCEL_A0 = 4.0;
export const ACCEL_T = 8.0;
/** Three rods of length 1.0 m, each of mass 0.50 kg. */
export const ROD_L = 1.0;
const LAM_UNIFORM = 0.5;
const LAM_TAPER = 0.2; // λ = λ₀(1 + 3x/L)
const LAM_BULGE = 0.3; // λ = λ₀(1 + 4x(L − x)/L²)

export const PROFILES: Record<ProfileKey, Profile> = {
  reverse: {
    key: 'reverse',
    kind: 'velocity',
    f: (t) => V0_REV - K_REV * t,
    F: (t) => V0_REV * t - (K_REV * t * t) / 2,
    a: 0,
    b: 3,
    roots: [V0_REV / K_REV],
  },
  swing: {
    key: 'swing',
    kind: 'velocity',
    f: (t) => SWING_A * SWING_W * Math.cos(SWING_W * t),
    F: (t) => SWING_A * Math.sin(SWING_W * t),
    a: 0,
    b: (2 * Math.PI) / SWING_W,
    roots: [Math.PI / (2 * SWING_W), (3 * Math.PI) / (2 * SWING_W)],
  },
  accel: {
    key: 'accel',
    kind: 'acceleration',
    f: (t) => ACCEL_A0 * (1 - t / ACCEL_T),
    F: (t) => ACCEL_A0 * (t - (t * t) / (2 * ACCEL_T)),
    a: 0,
    b: ACCEL_T,
    roots: [],
  },
  uniform: {
    key: 'uniform',
    kind: 'rod',
    f: () => LAM_UNIFORM,
    F: (x) => LAM_UNIFORM * x,
    G: (x) => (LAM_UNIFORM * x * x) / 2,
    a: 0,
    b: ROD_L,
    roots: [],
  },
  tapered: {
    key: 'tapered',
    kind: 'rod',
    f: (x) => LAM_TAPER * (1 + (3 * x) / ROD_L),
    F: (x) => LAM_TAPER * (x + (3 * x * x) / (2 * ROD_L)),
    G: (x) => LAM_TAPER * ((x * x) / 2 + (x * x * x) / ROD_L),
    a: 0,
    b: ROD_L,
    roots: [],
  },
  bulge: {
    key: 'bulge',
    kind: 'rod',
    f: (x) => LAM_BULGE * (1 + (4 * x * (ROD_L - x)) / (ROD_L * ROD_L)),
    F: (x) => LAM_BULGE * (x + (4 / (ROD_L * ROD_L)) * ((ROD_L * x * x) / 2 - (x * x * x) / 3)),
    G: (x) => LAM_BULGE * ((x * x) / 2 + (4 / (ROD_L * ROD_L)) * ((ROD_L * x * x * x) / 3 - (x * x * x * x) / 4)),
    a: 0,
    b: ROD_L,
    roots: [],
  },
};

/** The exact signed integral ∫_lo^hi f = F(hi) − F(lo): a displacement, a change of velocity, a mass. */
export const exactIntegral = (p: Profile, lo: number, hi: number): number => p.F(hi) - p.F(lo);

/**
 * The exact ∫_lo^hi |f|: split [lo, hi] at the zeros of f inside it and add the parts in absolute value.
 * For a velocity this is the distance travelled.
 */
export const exactAbsIntegral = (p: Profile, lo: number, hi: number): number => distanceFromRoots(p.F, lo, hi, p.roots);

/**
 * The same for any rate given by its antiderivative F and its sign changes: Σ |F(c_{k+1}) − F(c_k)| over
 * the cuts c = lo, the zeros inside (lo, hi), hi.
 */
export function distanceFromRoots(F: Fn, lo: number, hi: number, roots: number[]): number {
  const cuts = [lo, ...roots.filter((r) => r > lo && r < hi), hi];
  let s = 0;
  for (let i = 0; i + 1 < cuts.length; i++) s += Math.abs(F(cuts[i + 1]) - F(cuts[i]));
  return s;
}

/** The signed Riemann sum Σ f(sᵢ)Δs over [lo, hi] with n pieces. */
export const signedSum = (p: Profile, lo: number, hi: number, n: number, rule: RiemannRule): number =>
  hi === lo ? 0 : riemann(p.f, lo, hi, n, rule);

/** The unsigned Riemann sum Σ |f(sᵢ)|Δs over [lo, hi] with n pieces: the distance estimate. */
export const unsignedSum = (p: Profile, lo: number, hi: number, n: number, rule: RiemannRule): number =>
  hi === lo ? 0 : riemann((s) => Math.abs(p.f(s)), lo, hi, n, rule);

/** The running sums after each piece: S₀ = 0, S_k = Σ_{i<k} f(sᵢ)Δs, for drawing how the sum builds F. */
export function partialSums(p: Profile, lo: number, hi: number, n: number, rule: RiemannRule): number[] {
  const ds = (hi - lo) / n;
  const off = rule === 'left' ? 0 : rule === 'right' ? 1 : 0.5;
  const out = [0];
  for (let i = 0; i < n; i++) out.push(out[i] + p.f(lo + (i + off) * ds) * ds);
  return out;
}

/** A rod's exact mass M = ∫₀ᴸ λ dx and centre of mass x_cm = (1/M)∫₀ᴸ xλ dx. */
export function rodExact(p: Profile): { mass: number; xcm: number } {
  if (!p.G) throw new Error(`${p.key} is not a rod`);
  const mass = p.F(p.b) - p.F(p.a);
  return { mass, xcm: (p.G(p.b) - p.G(p.a)) / mass };
}

/**
 * A rod cut into n pieces, each counted at its sample point xᵢ with mass mᵢ = λ(xᵢ)Δx: the mass Σ mᵢ
 * and the centre of mass Σ xᵢmᵢ / Σ mᵢ.
 */
export function rodSum(p: Profile, n: number, rule: RiemannRule): { mass: number; xcm: number } {
  const mass = riemann(p.f, p.a, p.b, n, rule);
  const moment = riemann((x) => x * p.f(x), p.a, p.b, n, rule);
  return { mass, xcm: moment / mass };
}
