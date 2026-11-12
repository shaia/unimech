/**
 * The conic orbit drawn and measured (lesson 6.4): what `orbit.ts` gives as elements (e, p, a), turned into a
 * curve with its geometry — the centre, the semi-axes, the second focus, the asymptotes of a hyperbola — plus the
 * sideways launch of the lesson's figure, an adaptive integration of the trajectory for animating any conic, and the
 * cut of a double cone by a plane that gives the same family of curves.
 *
 * MODEL SPECIFICATION
 * - System: a body moving relative to an attracting centre (the focus), in the plane of the motion. Perifocal
 *   coordinates: the focus at the origin, the periapsis on +x (θ = 0), motion counter-clockwise. For two bodies the
 *   relative coordinate obeys the same model with GM → G(m₁ + m₂) (lesson 6.2).
 * - Dynamics: r̈ = −GM r̂/r² (orbit.ts). The orbit equation in u = 1/r, d²u/dθ² + u = GM/h², has the solution
 *   r(θ) = p/(1 + e cos θ), p = h²/GM. Geometry of that conic: a = p/(1 − e²) (negative for a hyperbola),
 *   b = p/√|1 − e²|, centre at x = −ae, second focus at x = −2ae, asymptotes of a hyperbola at θ∞ = arccos(−1/e),
 *   deflection χ = 2θ∞ − π with sin(χ/2) = 1/e.
 * - Sideways launch: from (r₀, 0) with speed v₀ at angle φ from the sideways (+y) direction, positive outward.
 *   h = r₀v₀ cos φ, ε = v₀²/2 − GM/r₀; for φ = 0, e = |β² − 1| with β = v₀/√(GM/r₀).
 * - Cone: a double cone of half-angle α (between the axis and a generator) cut by a plane at angle ψ to the axis
 *   gives a conic of eccentricity e = cos ψ / cos α (a circle at ψ = 90°, a parabola at ψ = α, a hyperbola below).
 * - Boundary: the elements (p, e), or a launch state; for the cone, α and ψ.
 * - Ignored: everything orbit.ts ignores (other bodies, drag, relativity, the bodies' size except as a surface the
 *   figure stops at).
 * - Valid when: as orbit.ts.
 * - Failure modes: e = 1 exactly has a = ∞ and b undefined (returned as Infinity / NaN-free special case); e within
 *   `KIND_BAND` of 1 is classified a parabola. The adaptive integrator's step is η√(r³/GM); its error grows near a
 *   radial fall (h → 0), where it stops at `rMin`. No plane cuts a cone of half-angle α with e > 1/cos α: `coneCutAngle`
 *   returns null there.
 */

import { classify, elementsFromState, stepKepler, type Elements, type OrbitKind, type PlanarState } from './orbit';
import type { Vec2, Vec3 } from './vec';

export interface ConicGeometry {
  kind: OrbitKind;
  e: number;
  p: number;
  /** semi-major axis, p/(1 − e²): positive for an ellipse, negative for a hyperbola, Infinity for a parabola */
  a: number;
  /** semi-minor axis p/√|1 − e²| (Infinity for a parabola) */
  b: number;
  /** focus-to-centre distance |a|e (Infinity for a parabola) */
  c: number;
  /** x of the conic's centre in perifocal coordinates, −ae (0 for a circle; Infinity for a parabola) */
  centreX: number;
  /** periapsis and apoapsis distances (apoapsis Infinity when unbound) */
  rp: number;
  ra: number;
  /** true anomaly of the asymptotes (π for a parabola, null when bound) */
  thetaInf: number | null;
  /** deflection of the velocity between infinity in and infinity out, 2θ∞ − π (null when bound; π for a parabola) */
  deflection: number | null;
}

/** The geometry of r = p/(1 + e cos θ). */
export function conicGeometry(p: number, e: number): ConicGeometry {
  const kind = classify(e);
  const rp = p / (1 + e);
  if (kind === 'parabola') {
    return { kind, e, p, a: Infinity, b: Infinity, c: Infinity, centreX: Infinity, rp, ra: Infinity, thetaInf: Math.PI, deflection: Math.PI };
  }
  const a = p / (1 - e * e);
  const b = p / Math.sqrt(Math.abs(1 - e * e));
  const c = Math.abs(a) * e;
  const bound = e < 1;
  const thetaInf = bound ? null : Math.acos(-1 / e);
  return {
    kind,
    e,
    p,
    a,
    b,
    c,
    centreX: -a * e,
    rp,
    ra: bound ? p / (1 - e) : Infinity,
    thetaInf,
    deflection: thetaInf === null ? null : 2 * thetaInf - Math.PI,
  };
}

/** u(θ) = 1/r = (1 + e cos θ)/p, the solution of u'' + u = 1/p. */
export const uOfTheta = (p: number, e: number, theta: number) => (1 + e * Math.cos(theta)) / p;

/**
 * Points of the conic in perifocal coordinates [m], θ from −θmax to θmax: the whole ellipse, or the part of a
 * parabola or hyperbola within rMax of the focus.
 */
export function sampleConic(p: number, e: number, rMax: number, n = 400): Vec2[] {
  let tMax = Math.PI;
  if (e >= 1 || p / (1 - e) > rMax) {
    // r(θ) = rMax at cos θ = (p/rMax − 1)/e
    const c = (p / rMax - 1) / Math.max(e, 1e-12);
    tMax = c <= -1 ? Math.PI : c >= 1 ? 0 : Math.acos(c);
  }
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const th = -tMax + (2 * tMax * i) / n;
    const d = 1 + e * Math.cos(th);
    if (d <= 0) continue;
    const r = Math.min(p / d, rMax);
    out.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  return out;
}

export interface Launch {
  /** the launch state, at (r₀, 0) */
  state: PlanarState;
  el: Elements;
  geo: ConicGeometry;
  /** v₀ over the circular speed at r₀ */
  beta: number;
  /** where the launch point sits on the orbit: periapsis, apoapsis, or neither (a tilted launch); circle when e ≈ 0 */
  launchAt: 'circle' | 'periapsis' | 'apoapsis' | 'other';
}

/** A launch from (r₀, 0) with speed v₀, at angle φ [rad] from the sideways (+y) direction, positive outward. */
export function launch(GM: number, r0: number, v0: number, phi = 0): Launch {
  const state: PlanarState = { r: [r0, 0], v: [v0 * Math.sin(phi), v0 * Math.cos(phi)] };
  const el = elementsFromState(GM, state.r, state.v);
  const geo = conicGeometry(el.p, el.e);
  const beta = v0 / Math.sqrt(GM / r0);
  let launchAt: Launch['launchAt'] = 'other';
  if (el.kind === 'circle') launchAt = 'circle';
  else if (Math.abs(phi) < 1e-12) launchAt = beta > 1 ? 'periapsis' : 'apoapsis';
  return { state, el, geo, beta, launchAt };
}

/** e of a sideways launch (φ = 0) at β = v₀/v_circ: |β² − 1|. */
export const sidewaysEccentricity = (beta: number) => Math.abs(beta * beta - 1);

export interface TrajectorySample {
  t: number;
  x: number;
  y: number;
}

/**
 * The trajectory from a state, by RK4 with the step η√(r³/GM) (small near the focus, large far away), until tMax,
 * until r > rMax, or until r < rMin (the surface of the central body). `hit` says which stopped it.
 */
export function integrateTrajectory(
  GM: number,
  s0: PlanarState,
  o: { tMax: number; rMax: number; rMin: number; eta?: number; maxSteps?: number },
): { samples: TrajectorySample[]; hit: 'time' | 'escaped' | 'surface' } {
  const eta = o.eta ?? 0.01;
  const maxSteps = o.maxSteps ?? 200000;
  let s = s0;
  let t = 0;
  const samples: TrajectorySample[] = [{ t, x: s.r[0], y: s.r[1] }];
  for (let i = 0; i < maxSteps; i++) {
    const r = Math.hypot(s.r[0], s.r[1]);
    if (r < o.rMin) return { samples, hit: 'surface' };
    if (r > o.rMax) return { samples, hit: 'escaped' };
    if (t >= o.tMax) return { samples, hit: 'time' };
    const dt = Math.min(eta * Math.sqrt((r * r * r) / GM), o.tMax - t);
    s = stepKepler(GM, s, dt);
    t += dt;
    samples.push({ t, x: s.r[0], y: s.r[1] });
  }
  return { samples, hit: 'time' };
}

/** The position at time t on a sampled trajectory (linear between samples). */
export function positionAt(samples: TrajectorySample[], t: number): Vec2 {
  if (t <= samples[0].t) return [samples[0].x, samples[0].y];
  let lo = 0;
  let hi = samples.length - 1;
  if (t >= samples[hi].t) return [samples[hi].x, samples[hi].y];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - samples[lo].t) / (samples[hi].t - samples[lo].t);
  return [samples[lo].x + f * (samples[hi].x - samples[lo].x), samples[lo].y + f * (samples[hi].y - samples[lo].y)];
}

/* ---------------------------------------------------------------- the cone */

/** The angle ψ between the cutting plane and the cone's axis that gives eccentricity e: cos ψ = e cos α. */
export function coneCutAngle(e: number, alpha: number): number | null {
  const c = e * Math.cos(alpha);
  if (c > 1 + 1e-12) return null;
  return Math.acos(Math.min(1, c));
}

/** e of the cut of a cone of half-angle α by a plane at angle ψ (`beta`) to the axis. */
export const coneEccentricity = (alpha: number, beta: number) => Math.cos(beta) / Math.cos(alpha);

/**
 * The cone (apex at the origin, axis z) cut by the plane n·P = d with n = (−cos ψ, 0, sin ψ), ψ = `beta`: for each generator
 * direction φ, the point t·g(φ) with |t| ≤ tMax that lies on the plane. Returns one or two branches (a hyperbola cuts
 * both nappes), each a list of 3D points in order of φ.
 */
export function coneSection(alpha: number, beta: number, d: number, tMax: number, n = 360): Vec3[][] {
  const branches: Vec3[][] = [];
  let cur: Vec3[] = [];
  let lastSign = 0;
  for (let i = 0; i <= n; i++) {
    const phi = -Math.PI + (2 * Math.PI * i) / n;
    const g: Vec3 = [Math.sin(alpha) * Math.cos(phi), Math.sin(alpha) * Math.sin(phi), Math.cos(alpha)];
    const den = Math.sin(beta) * g[2] - Math.cos(beta) * g[0];
    const t = Math.abs(den) < 1e-12 ? Infinity : d / den;
    const sign = Math.sign(t);
    if (!Number.isFinite(t) || Math.abs(t) > tMax || (lastSign !== 0 && sign !== lastSign)) {
      if (cur.length > 1) branches.push(cur);
      cur = [];
    }
    if (Number.isFinite(t) && Math.abs(t) <= tMax) {
      cur.push([t * g[0], t * g[1], t * g[2]]);
      lastSign = sign;
    }
  }
  if (cur.length > 1) branches.push(cur);
  // a closed curve that started and ended at φ = ±π is one branch split in two: join it
  if (branches.length >= 2) {
    const first = branches[0];
    const last = branches[branches.length - 1];
    const a = first[0];
    const b = last[last.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9 * Math.max(1, Math.abs(d))) {
      branches[0] = [...last, ...first.slice(1)];
      branches.pop();
    }
  }
  return branches;
}

/** Coordinates of a 3D point within the cutting plane: s along the plane's tilted direction (in the xz-plane), w = y. */
export function inPlane(beta: number, P: Vec3): Vec2 {
  // unit vectors spanning the plane n·P = d with n = (−cos ψ, 0, sin ψ): (sin ψ, 0, cos ψ) and (0, 1, 0)
  return [P[0] * Math.sin(beta) + P[2] * Math.cos(beta), P[1]];
}
