/**
 * Lab data and straight-line fits: the graphing toolbox of lesson 0.4, reused by every lab lesson.
 *
 * MODEL SPECIFICATION
 * - System: n measurements of a law. The controlled variable is set exactly; the measured one is
 *   read with a small random relative scatter, the same on every load (a seeded generator).
 * - Dynamics: none.
 * - Boundary: none.
 * - Ignored: uncertainty in the controlled variable; systematic errors (a zero offset, a
 *   miscalibrated meter), so a law through the origin stays through the origin up to scatter.
 * - Valid when: the scatter is a few percent and random. The "best line" is the least-squares
 *   line of y on x, which is what a student's ruler line approximates.
 * - Failure modes: fewer than two distinct x values leaves the slope undefined (NaN).
 */

import { G } from './constants';

/** A reproducible uniform generator on [0, 1) (mulberry32): the same seed, the same table. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Readings of `law` at each x, each off by a uniform relative error of at most `scatter`. */
export function measure(law: (x: number) => number, xs: readonly number[], scatter: number, seed: number): number[] {
  const rnd = seededRandom(seed);
  return xs.map((x) => law(x) * (1 + scatter * (2 * rnd() - 1)));
}

export interface Line {
  slope: number;
  intercept: number;
}

/** Least-squares line y = slope·x + intercept. */
export function fitLine(xs: readonly number[], ys: readonly number[]): Line {
  const n = xs.length;
  const mx = xs.reduce((a, x) => a + x, 0) / n;
  const my = ys.reduce((a, y) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** Least-squares slope of a line forced through the origin, y = slope·x. */
export function fitThroughOrigin(xs: readonly number[], ys: readonly number[]): number {
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
  }
  return sxy / sxx;
}

/* ------------------------------------------------------------------ laws */

/** Distance fallen from rest after time t, d = ½gt² [m]. */
export const fallDistance = (t: number) => 0.5 * G * t * t;

/** Time to fall a distance d from rest, t = √(2d/g) [s]. */
export const fallTime = (d: number) => Math.sqrt((2 * d) / G);

/** Length of a spring of natural length L0 [m] and constant k [N/m] under a load F [N] (Hooke). */
export const springLength = (F: number, L0: number, k: number) => L0 + F / k;

/* --------------------------------------------------------- linearization */

/** What goes on the horizontal axis: the measured x, or a function of it. */
export type Transform = 'x' | 'x2' | 'sqrt' | 'inv' | 'inv2';

export const TRANSFORMS: Record<Transform, (x: number) => number> = {
  x: (x) => x,
  x2: (x) => x * x,
  sqrt: (x) => Math.sqrt(x),
  inv: (x) => 1 / x,
  inv2: (x) => 1 / (x * x),
};

/* -------------------------------------------------------------- datasets */

export interface Dataset {
  /** horizontal-axis quantity, as measured */
  x: number[];
  /** vertical-axis quantity */
  y: number[];
  /** the transform of x that makes the law a straight line */
  linear: Transform;
  /** slope and intercept of the true law after that transform */
  law: Line;
}

/** to the millimetre (or millisecond): 3 decimals */
const mm = (v: number) => Number(v.toFixed(3));

/** Spring: hang 0…5 N, read the length to the millimetre. L0 = 12 cm, k = 50 N/m. */
function spring(): Dataset {
  const L0 = 0.12;
  const k = 50;
  const F = [0, 1, 2, 3, 4, 5];
  const L = measure((f) => springLength(f, L0, k), F, 0.008, 7).map(mm);
  return { x: F, y: L, linear: 'x', law: { slope: 1 / k, intercept: L0 } };
}

/** Free fall: drop from set heights, time the fall with a photogate (to the millisecond). */
function fall(): Dataset {
  // a wide range of heights, so that d against t is visibly curved
  const d = [0.1, 0.4, 0.7, 1.0, 1.3, 1.6];
  const t = measure(fallTime, d, 0.012, 11).map(mm);
  return { x: t, y: d, linear: 'x2', law: { slope: G / 2, intercept: 0 } };
}

export type DatasetId = 'spring' | 'fall';
export const DATASETS: Record<DatasetId, Dataset> = {
  spring: spring(),
  fall: fall(),
};
