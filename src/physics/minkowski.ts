/**
 * Reading and drawing a Minkowski diagram (lesson 9.5): the geometry of the (x, ct) plane of S with the axes of a
 * moving frame S′ drawn in, on top of the shared model of src/physics/relativity.ts (the Lorentz transformation,
 * the interval and its classification, primedAxes/toPrimedDiagram/fromPrimedDiagram). This module adds what the
 * lesson's figure and scripts need beyond it: where two events lie relative to each other's light cone, the speed
 * above which a spacelike pair changes its time order, the length on paper of one unit of the primed axes, the
 * calibration hyperbolae, and the graphical reading of primed coordinates with lines parallel to the primed axes.
 *
 * MODEL SPECIFICATION
 * - System: events in one spatial dimension, drawn in the (x, ct) plane of the inertial frame S, x to the right and
 *   ct up, both in ONE length unit (a light-second, a metre, ...), so that light runs at 45°. S′ moves at β = v/c
 *   along +x (|β| < 1); the origins coincide (x = ct = 0 is x′ = ct′ = 0), as in relativity.ts.
 * - Dynamics: none; geometry of the Lorentz transformation x′ = γ(x − β·ct), ct′ = γ(ct − β·x). The ct′ axis is the
 *   line x = β·ct and the x′ axis the line ct = β·x. Lines of constant t′ are parallel to the x′ axis, lines of
 *   constant x′ parallel to the ct′ axis. The event x′ = 0, ct′ = 1 is at (γβ, γ) and lies on the calibration
 *   hyperbola (ct)² − x² = 1, so one unit of a primed axis is γ√(1 + β²) long on paper.
 * - Boundary: events as given, in the diagram's single unit; the speed of light is 1 in that unit per unit of ct.
 * - Ignored: y and z (transverse coordinates are unchanged and play no role in the diagram); acceleration; what an
 *   observer sees (light-travel delays): the diagram holds the coordinates a frame measures.
 * - Valid when: |β| < 1. A spacelike pair has a reversal speed below 1 only because |c·Δt| < |Δx|.
 * - Failure modes: every function that needs γ throws a RangeError for |β| ≥ 1 (via gammaOf). `reversalBeta`
 *   returns null for a timelike or lightlike pair (no frame reverses their order) and for Δx = 0.
 *   `hyperbolaPoint` throws for s² = 0 (the light lines are not a hyperbola). Equality tests use a relative 1e-9.
 */

import { classifyInterval, gammaOf, toPrimedDiagram, type IntervalKind } from './relativity';

/** A point of the diagram in its single unit: [x, ct]. */
export type DiagramPoint = readonly [number, number];

/** Where event B lies relative to event A's light cone. */
export type ConeRegion = 'same' | 'future' | 'past' | 'future-light' | 'past-light' | 'elsewhere';

/**
 * The region of B relative to the light cone of A, from the separation (Δx, cΔt) = B − A in the diagram's unit.
 * 'future'/'past': timelike, inside the upper/lower cone; '-light': on the cone; 'elsewhere': spacelike.
 */
export function coneRegion(a: DiagramPoint, b: DiagramPoint): ConeRegion {
  const dx = b[0] - a[0];
  const dct = b[1] - a[1];
  if (dx === 0 && dct === 0) return 'same';
  const kind: IntervalKind = classifyInterval(dct, dx, 1);
  if (kind === 'spacelike') return 'elsewhere';
  if (kind === 'lightlike') return dct > 0 ? 'future-light' : 'past-light';
  return dct > 0 ? 'future' : 'past';
}

/** The interval s² = (cΔt)² − Δx² between two diagram points (the course's sign: timelike positive). */
export const diagramInterval = (a: DiagramPoint, b: DiagramPoint): number => {
  const dx = b[0] - a[0];
  const dct = b[1] - a[1];
  return dct * dct - dx * dx;
};

/** The separation B − A as S′ (moving at β) describes it: [Δx′, cΔt′]. */
export function primedSeparation(a: DiagramPoint, b: DiagramPoint, beta: number): [number, number] {
  return toPrimedDiagram(b[0] - a[0], b[1] - a[1], beta);
}

/**
 * For a spacelike pair (cΔt, Δx), the β (of a frame moving along +x) at which the two events are simultaneous,
 * cΔt/Δx; frames moving faster than it in the same direction find the order reversed. Its magnitude is below 1.
 * Null for a timelike or lightlike pair (no frame changes their order) and for Δx = 0.
 */
export function reversalBeta(dct: number, dx: number): number | null {
  if (dx === 0) return null;
  return classifyInterval(dct, dx, 1) === 'spacelike' ? dct / dx : null;
}

/** The sign of cΔt′ in the frame moving at β: +1 the same order as cΔt > 0 gives, −1 reversed, 0 simultaneous. */
export function orderInFrame(dct: number, dx: number, beta: number): -1 | 0 | 1 {
  const g = gammaOf(beta);
  const d = g * (dct - beta * dx);
  const scale = Math.max(Math.abs(dct), Math.abs(beta * dx));
  if (scale === 0 || Math.abs(d) <= 1e-9 * g * scale) return 0;
  return d > 0 ? 1 : -1;
}

/** The angle by which each primed axis is turned toward the light line, atan β [rad]. */
export const axisTilt = (beta: number): number => {
  gammaOf(beta);
  return Math.atan(beta);
};

/** The length on paper of one unit of the ct′ (or x′) axis, in units of the S axes: γ√(1 + β²) ≥ 1. */
export const primedUnitOnPaper = (beta: number): number => gammaOf(beta) * Math.sqrt(1 + beta * beta);

/** The ruler length of the segment from A to B on the paper, √(Δx² + (cΔt)²): not a physical quantity. */
export const paperLength = (a: DiagramPoint, b: DiagramPoint): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * A point of the calibration hyperbola (ct)² − x² = s² about the origin, parametrised by the rapidity φ of the frame
 * whose axis passes through it: for s² > 0 the upper branch (√s² sinh φ, √s² cosh φ), the event of the ct′ axis of
 * the frame with β = tanh φ; for s² < 0 the right branch (√−s² cosh φ, √−s² sinh φ), on its x′ axis.
 */
export function hyperbolaPoint(s2: number, phi: number): [number, number] {
  if (s2 === 0) throw new RangeError('s² = 0: the light lines are not a hyperbola');
  const a = Math.sqrt(Math.abs(s2));
  return s2 > 0 ? [a * Math.sinh(phi), a * Math.cosh(phi)] : [a * Math.cosh(phi), a * Math.sinh(phi)];
}

/** The upper branch of (ct)² − x² = 1 as a function: ct = √(1 + x²) (the hyperbola taught in the lesson). */
export const unitHyperbolaCt = (x: number): number => Math.sqrt(1 + x * x);

/**
 * Read the primed coordinates of an event by the construction the lesson teaches, independently of the
 * transformation formulas: through the event draw a line parallel to the x′ axis (slope β) and intersect it with
 * the ct′ axis (x = β·ct); draw a line parallel to the ct′ axis and intersect it with the x′ axis (ct = β·x). The
 * feet are returned in S coordinates, and each primed coordinate is the signed paper distance of its foot from the
 * origin divided by the paper length of one primed unit.
 */
export function readByParallels(
  x: number,
  ct: number,
  beta: number,
): { ctFoot: [number, number]; xFoot: [number, number]; xPrime: number; ctPrime: number } {
  const unit = primedUnitOnPaper(beta);
  const d = 1 - beta * beta;
  // parallel to the x′ axis through (x, ct): ct − β·x = const; on the ct′ axis x = β·ct'' → ct''(1 − β²) = ct − β·x
  const ctOnAxis = (ct - beta * x) / d;
  const ctFoot: [number, number] = [beta * ctOnAxis, ctOnAxis];
  // parallel to the ct′ axis through (x, ct): x − β·ct = const; on the x′ axis ct = β·x'' → x''(1 − β²) = x − β·ct
  const xOnAxis = (x - beta * ct) / d;
  const xFoot: [number, number] = [xOnAxis, beta * xOnAxis];
  const signed = (p: [number, number], along: number) => Math.sign(along) * Math.hypot(p[0], p[1]);
  return { ctFoot, xFoot, ctPrime: signed(ctFoot, ctOnAxis) / unit, xPrime: signed(xFoot, xOnAxis) / unit };
}
