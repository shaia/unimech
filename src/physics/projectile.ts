/**
 * A projectile under constant gravity: the analytic solution of lesson 1.2, over level ground, from a
 * height, and onto an incline; the envelope of all paths at one launch speed; and a numerical flight
 * (RK4 under any force) that the analytic solution is tested against and that a drag mode (lesson 2.7)
 * plugs into without changing the callers.
 *
 * MODEL SPECIFICATION
 * - System: one point body launched at t = 0 from the origin, or from height h₀ above it, with speed v₀
 *   at angle θ above the horizontal. World axes: x horizontal (the launch direction), y up. The ground
 *   is either level (the line y = 0) or an incline through the origin at angle β above the horizontal
 *   (the line y = x·tan β; β < 0 slopes down in the launch direction).
 * - Dynamics: constant acceleration a = g = (0, −g), so by two integrations
 *   r(t) = r₀ + v₀t + ½gt² and v(t) = v₀ + gt, exactly. The numerical flight integrates Newton's second
 *   law with `rk4Step` (motion.ts) under a given force, `gravity` by default; under a constant force
 *   RK4 is exact, so it must reproduce the analytic path to rounding.
 * - Boundary: the flight ends when the body reaches the ground line again (the later root).
 * - Ignored: air resistance (until a drag force is passed to `numericFlight`), spin, wind, the body's
 *   size, the Earth's curvature and rotation, the variation of g with height.
 * - Valid when: the body is dense and slow enough that drag is small against its weight (a stone, a shot
 *   put, a basketball over a few metres) and the flight is short against the Earth's radius.
 * - Failure modes: a light or fast body (a shuttlecock, a ping-pong ball, a long football kick) lands
 *   well short of these ranges and its best angle is below 45°; an incline throw with θ ≤ β never
 *   leaves the slope (the functions return a zero flight); a target outside the envelope has no aim.
 */

import { G } from './constants';
import { gravity, rk4Step, type Body, type Force } from './motion';

export type Vec2 = [number, number];

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface Launch {
  /** launch speed [m/s] */
  v0: number;
  /** launch angle above the horizontal [deg] */
  angleDeg: number;
  /** launch height above the origin [m] (level ground only) */
  h0?: number;
  /** free-fall acceleration [m/s²]; G by default */
  g?: number;
}

/** v₀ as a vector [m/s]. */
export const launchVelocity = (l: Launch): Vec2 => [l.v0 * Math.cos(rad(l.angleDeg)), l.v0 * Math.sin(rad(l.angleDeg))];

/** r(t) = r₀ + v₀t + ½gt² [m]. */
export function positionAt(l: Launch, t: number): Vec2 {
  const g = l.g ?? G;
  const [vx, vy] = launchVelocity(l);
  return [vx * t, (l.h0 ?? 0) + vy * t - 0.5 * g * t * t];
}

/** v(t) = v₀ + gt [m/s]. */
export function velocityAt(l: Launch, t: number): Vec2 {
  const g = l.g ?? G;
  const [vx, vy] = launchVelocity(l);
  return [vx, vy - g * t];
}

/** The trajectory equation y(x) = h₀ + x tanθ − g x² / (2 v₀² cos²θ) [m]. */
export function trajectoryY(l: Launch, x: number): number {
  const g = l.g ?? G;
  const th = rad(l.angleDeg);
  const c = Math.cos(th);
  return (l.h0 ?? 0) + x * Math.tan(th) - (g * x * x) / (2 * l.v0 * l.v0 * c * c);
}

/** Time to the top of the path, v₀ sinθ / g [s]; 0 for a downward launch. */
export const apexTime = (l: Launch) => Math.max(0, (l.v0 * Math.sin(rad(l.angleDeg))) / (l.g ?? G));

/** Greatest height above the origin, h₀ + v₀² sin²θ / (2g) [m] (h₀ for a downward launch). */
export function maxHeight(l: Launch): number {
  const vy = Math.max(0, l.v0 * Math.sin(rad(l.angleDeg)));
  return (l.h0 ?? 0) + (vy * vy) / (2 * (l.g ?? G));
}

/**
 * Time in the air until y = 0, the later root of h₀ + v₀ sinθ·t − ½gt² = 0:
 * t = (v₀ sinθ + √(v₀² sin²θ + 2gh₀)) / g [s]. With h₀ = 0 it is 2v₀ sinθ / g.
 */
export function levelFlightTime(l: Launch): number {
  const g = l.g ?? G;
  const vy = l.v0 * Math.sin(rad(l.angleDeg));
  const h0 = l.h0 ?? 0;
  return (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
}

/** Horizontal distance to the landing point on y = 0 [m]. With h₀ = 0 it is v₀² sin 2θ / g. */
export const levelRange = (l: Launch) => launchVelocity(l)[0] * levelFlightTime(l);

/* ------------------------------------------------------------------ incline */

export interface InclineFlight {
  /** time in the air, 2v₀ sin(θ − β) / (g cos β) [s] */
  time: number;
  /** distance along the incline from the launch point to the impact point [m] */
  along: number;
  /** the impact point [m] */
  impact: Vec2;
  /** greatest distance from the incline, v₀² sin²(θ − β) / (2g cos β), reached at time/2 [m] */
  maxClearance: number;
}

/**
 * A launch from the foot of an incline at β (deg above the horizontal; negative = sloping down) with
 * speed v₀ at θ above the horizontal, solved in tilted axes: ξ along the incline, η perpendicular
 * to it. Then g = (−g sinβ, −g cosβ) and v₀ = (v₀ cos(θ − β), v₀ sin(θ − β)); the body is back on the
 * incline when η = 0. Returns a zero flight when θ ≤ β (the body never leaves the slope).
 */
export function inclineFlight(v0: number, angleDeg: number, betaDeg: number, g = G): InclineFlight {
  const a = rad(betaDeg);
  const rel = rad(angleDeg - betaDeg);
  if (rel <= 0) return { time: 0, along: 0, impact: [0, 0], maxClearance: 0 };
  const gx = -g * Math.sin(a);
  const gy = -g * Math.cos(a);
  const ux = v0 * Math.cos(rel);
  const uy = v0 * Math.sin(rel);
  const time = (-2 * uy) / gy;
  const along = ux * time + 0.5 * gx * time * time;
  return {
    time,
    along,
    impact: [along * Math.cos(a), along * Math.sin(a)],
    maxClearance: (uy * uy) / (-2 * gy),
  };
}

/** The same range from the trajectory equation: L = 2v₀² cosθ sin(θ − β) / (g cos²β) [m]. */
export function inclineRangeClosedForm(v0: number, angleDeg: number, betaDeg: number, g = G): number {
  const th = rad(angleDeg);
  const a = rad(betaDeg);
  return Math.max(0, (2 * v0 * v0 * Math.cos(th) * Math.sin(th - a)) / (g * Math.cos(a) ** 2));
}

/** The launch angle above the horizontal that reaches farthest along an incline at β: 45° + β/2 [deg]. */
export const inclineBestAngle = (betaDeg: number) => 45 + betaDeg / 2;

/** The farthest reach along an incline at β: v₀² / (g(1 + sin β)) [m]. */
export const inclineMaxRange = (v0: number, betaDeg: number, g = G) => (v0 * v0) / (g * (1 + Math.sin(rad(betaDeg))));

/* ------------------------------------------------------------------ envelope and aiming */

/** The envelope of all paths launched from the origin at speed v₀: y = v₀²/(2g) − g x²/(2v₀²) [m]. */
export const envelopeY = (v0: number, x: number, g = G) => (v0 * v0) / (2 * g) - (g * x * x) / (2 * v0 * v0);

/**
 * The launch angles [deg] from the origin at speed v₀ that pass through (x, y), x > 0, low angle first:
 * tanθ = (v₀² ± √(v₀⁴ − g(g x² + 2 y v₀²))) / (g x). Two angles below the envelope, one on it, none above.
 */
export function aimAngles(v0: number, x: number, y: number, g = G): number[] {
  const v2 = v0 * v0;
  const disc = v2 * v2 - g * (g * x * x + 2 * y * v2);
  if (disc < 0) return [];
  const r = Math.sqrt(disc);
  const lo = deg(Math.atan((v2 - r) / (g * x)));
  const hi = deg(Math.atan((v2 + r) / (g * x)));
  return disc === 0 ? [lo] : [lo, hi];
}

/* ------------------------------------------------------------------ the numerical flight */

export interface Flight {
  /** path from launch to impact, [x, y] in m; the last point is the impact point */
  path: Vec2[];
  /** time of each path point [s] */
  times: number[];
  /** time in the air [s] */
  time: number;
  /** the impact point [m] */
  impact: Vec2;
  /** highest y reached [m] */
  peak: number;
  /** velocity at impact [m/s] */
  impactVelocity: Vec2;
}

export interface FlightOptions {
  /** the ground: level (y = 0) by default, or an incline at betaDeg through the origin */
  betaDeg?: number;
  /** the force on a body of unit mass [N]; constant gravity by default. A drag mode passes gravity + drag. */
  force?: Force;
  /** integration step [s] */
  dt?: number;
}

/** Cubic Hermite interpolation on one step: value at fraction s ∈ [0, 1] from the end values and slopes. */
function hermite(y0: number, d0: number, y1: number, d1: number, h: number, s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * d0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * d1;
}

/**
 * Follow the body with RK4 until it comes back to the ground line, and find the impact inside the last
 * step by bisection on the Hermite interpolant (exact for a quadratic path, so exact without drag).
 */
export function numericFlight(l: Launch, opts: FlightOptions = {}): Flight {
  const g = l.g ?? G;
  const dt = opts.dt ?? 0.01;
  const tanA = Math.tan(rad(opts.betaDeg ?? 0));
  const F = opts.force ?? gravity(1, g);
  const [vx0, vy0] = launchVelocity(l);
  const h0 = l.h0 ?? 0;
  /** height above the ground line */
  const above = (x: number, y: number) => y - x * tanA;
  let b: Body = { pos: [0, h0, 0], vel: [vx0, vy0, 0], m: 1 };
  let t = 0;
  const path: Vec2[] = [[0, h0]];
  const times = [0];
  let peak = h0;
  for (let i = 0; i < 1e6; i++) {
    const next = rk4Step(b, F, t, dt);
    const [x0, y0] = b.pos;
    const [x1, y1] = next.pos;
    const [ux0, uy0] = b.vel;
    const [ux1, uy1] = next.vel;
    if (uy0 > 0 && uy1 <= 0) {
      // the top inside this step: vy crosses zero; locate it on the interpolant's derivative linearly
      const s = uy0 / (uy0 - uy1);
      peak = Math.max(peak, hermite(y0, uy0, y1, uy1, dt, s));
    }
    if (above(x1, y1) < 0) {
      const d0 = uy0 - ux0 * tanA;
      const d1 = uy1 - ux1 * tanA;
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 80; k++) {
        const mid = (lo + hi) / 2;
        if (hermite(above(x0, y0), d0, above(x1, y1), d1, dt, mid) > 0) lo = mid;
        else hi = mid;
      }
      const s = (lo + hi) / 2;
      const xi = hermite(x0, ux0, x1, ux1, dt, s);
      const impact: Vec2 = [xi, xi * tanA];
      const tl = t + s * dt;
      path.push(impact);
      times.push(tl);
      return { path, times, time: tl, impact, peak, impactVelocity: [ux0 + s * (ux1 - ux0), uy0 + s * (uy1 - uy0)] };
    }
    b = next;
    t += dt;
    path.push([x1, y1]);
    times.push(t);
  }
  throw new Error(`numericFlight(${l.v0}, ${l.angleDeg}): the body never came down`);
}

/**
 * The analytic flight sampled for drawing: n + 1 points from launch to impact, on level ground or on an
 * incline at betaDeg. Same shape as `numericFlight`, so a figure can switch to a numerical (drag) flight.
 */
export function analyticFlight(l: Launch, opts: { betaDeg?: number; n?: number } = {}): Flight {
  const n = opts.n ?? 160;
  const beta = opts.betaDeg ?? 0;
  if (beta !== 0 && (l.h0 ?? 0) !== 0) throw new Error('a launch from a height is modelled over level ground only');
  const time = beta === 0 ? levelFlightTime(l) : inclineFlight(l.v0, l.angleDeg, beta, l.g ?? G).time;
  const path: Vec2[] = [];
  const times: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (time * i) / n;
    times.push(t);
    path.push(positionAt(l, t));
  }
  const impact = positionAt(l, time);
  if (beta !== 0) impact[1] = impact[0] * Math.tan(rad(beta));
  else impact[1] = 0;
  path[n] = impact;
  return { path, times, time, impact, peak: maxHeight(l), impactVelocity: velocityAt(l, time) };
}

/** Where the body is at time t along a sampled flight: linear between stored points; the impact after it. */
export function flightPositionAt(f: Flight, t: number): Vec2 {
  if (t <= 0) return f.path[0];
  if (t >= f.time) return f.path[f.path.length - 1];
  let lo = 0;
  let hi = f.times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f.times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const s = (t - f.times[lo]) / (f.times[hi] - f.times[lo]);
  const a = f.path[lo];
  const c = f.path[hi];
  return [a[0] + s * (c[0] - a[0]), a[1] + s * (c[1] - a[1])];
}
