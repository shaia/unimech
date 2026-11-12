/**
 * Carousel (lesson 7.3): the centrifugal and Coriolis forces at work in a few rotating-frame problems, on top of the
 * shared model of src/physics/rotating.ts (which this module imports and never changes): a puck sliding on a
 * frictionless turntable (the figure RotatingFrame), a puck released from a string, a bead on a rotating hoop, a
 * bead on a rotating parabolic wire and the liquid surface in a rotating bucket.
 *
 * MODEL SPECIFICATION
 * - System: a particle of mass m on (or near) a horizontal turntable that turns at a constant angular velocity
 *   ω ẑ about a vertical axis through its centre O (ω > 0: counter-clockwise seen from above). The inertial frame S
 *   (the room) and the turntable frame S′ share the origin O, and their axes coincide at t = 0. Primed quantities
 *   are measured in S′; the painted line on the turntable is its +x′ axis.
 * - Dynamics: in S, a puck on a frictionless turntable feels no horizontal force and moves on a straight line.
 *   In S′ the same motion obeys m a′ = −mω × (ω × r′) − 2mω × v′ (centrifugal plus Coriolis), integrated by
 *   `stepNonInertial`; the exact answer is `toRotating` of the straight line. The Coriolis force is perpendicular
 *   to v′ and does no work, so ½v′² − ½ω²ρ² is constant for a free puck (ρ the distance from the axis).
 *   The centrifugal force is −∇ of the potential energy −½mω²ρ². A bead on a hoop of radius R turning about its
 *   vertical diameter has, in S′, U_eff(θ) = −mgR cos θ − ½mω²R² sin²θ (θ from the bottom); a liquid at rest in a
 *   rotating bucket has a free surface of constant g z − ½ω²r², the paraboloid z = z₀ + ω²r²/(2g).
 * - Boundary: the launch: distance ρ₀ from O along the painted line, speed u relative to the turntable, direction
 *   α from the painted line (counter-clockwise); the turntable's radius for the moment the puck leaves it.
 * - Ignored: friction between puck and turntable (the puck's vertical forces balance); the bead's size and
 *   friction; the bucket's surface tension; ω̇ (no Euler force).
 * - Valid when: ω is constant and the axis vertical; speeds ≪ c.
 * - Failure modes: a puck at rest at the centre (ρ₀ = 0, u = 0) never leaves the turntable (`exitTime` = Infinity);
 *   the bead's equilibrium is the bottom for ω ≤ √(g/R), where the off-bottom root of cos θ = g/(ω²R) does not
 *   exist; at ω = √(g/R) exactly the small oscillations about the bottom have zero frequency (neutral, quartic).
 */

import { freeForce, stepNonInertial, toInertial, toRotating, type State3 } from './rotating';
import { cross3, dot3, type Vec3 } from './vec';

// ---------------------------------------------------------------- a puck on a frictionless turntable

/** A launch from the turntable, as a rider standing on it makes it. */
export interface Launch {
  /** distance from the centre along the painted line (+x′) [m] */
  rho0: number;
  /** speed relative to the turntable [m/s] */
  speed: number;
  /** direction of the launch velocity from the painted line, counter-clockwise [rad] */
  angle: number;
}

/** The launch state in the turntable frame S′, at t = 0. */
export const launchRotating = (l: Launch): State3 => ({
  r: [l.rho0, 0, 0],
  v: [l.speed * Math.cos(l.angle), l.speed * Math.sin(l.angle), 0],
});

/** The same state in the room S (axes coincide at t = 0): v = v′ + ω × r′. */
export const launchInertial = (l: Launch, omega: number): State3 => toInertial(launchRotating(l), omega, 0);

/** The free motion in S: a straight line at constant velocity. */
export const freeLine = (s0: State3, t: number): State3 => ({
  r: [s0.r[0] + s0.v[0] * t, s0.r[1] + s0.v[1] * t, s0.r[2] + s0.v[2] * t],
  v: s0.v,
});

/** The straight line of S as S′ sees it at time t: the exact rotating-frame motion of a free puck. */
export const freeLineSeenRotating = (s0In: State3, omega: number, t: number): State3 => toRotating(freeLine(s0In, t), omega, t);

/**
 * When the free puck (state s0 in S at t = 0) reaches the distance `radius` from the axis, moving outward:
 * the positive root of |r₀ + v t| = radius. Infinity if it never does (at rest inside).
 */
export function exitTime(s0: State3, radius: number): number {
  const a = s0.v[0] * s0.v[0] + s0.v[1] * s0.v[1];
  const b = 2 * (s0.r[0] * s0.v[0] + s0.r[1] * s0.v[1]);
  const c = s0.r[0] * s0.r[0] + s0.r[1] * s0.r[1] - radius * radius;
  if (a === 0) return c >= 0 ? 0 : Infinity;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  return Math.max(0, (-b + Math.sqrt(disc)) / (2 * a));
}

export interface PathSample {
  t: number;
  /** the state in S′ */
  s: State3;
}

/**
 * Integrate a free puck in S′ (only the centrifugal and Coriolis forces act there) from s0p for tEnd seconds in
 * steps of about dt, with RK4 (`stepNonInertial`, m = 1: forces per unit mass). Returns every step.
 */
export function integrateRotating(s0p: State3, omega: number, tEnd: number, dt: number): PathSample[] {
  const n = Math.max(1, Math.ceil(tEnd / dt));
  const h = tEnd / n;
  const out: PathSample[] = [{ t: 0, s: s0p }];
  let s = s0p;
  for (let i = 0; i < n; i++) {
    s = stepNonInertial(1, s, freeForce, { omega: [0, 0, omega] }, i * h, h);
    out.push({ t: (i + 1) * h, s });
  }
  return out;
}

/** Centrifugal force per unit mass on a body at r′ (ω along +z): ω²ρ, away from the axis. */
export const centrifugalPerMass = (omega: number, rp: Vec3): Vec3 => [omega * omega * rp[0], omega * omega * rp[1], 0];

/** Coriolis force per unit mass on a body moving at v′ (ω along +z): −2ω ẑ × v′. */
export const coriolisPerMass = (omega: number, vp: Vec3): Vec3 => {
  const c = cross3([0, 0, omega], vp);
  return [-2 * c[0], -2 * c[1], -2 * c[2]];
};

/** The power a force F delivers to a body moving at v′: F · v′ (zero for the Coriolis force). */
export const power = (F: Vec3, vp: Vec3): number => dot3(F, vp);

/** Potential energy of the centrifugal force: −½mω²ρ² (zero on the axis). */
export const centrifugalPotential = (m: number, omega: number, rho: number): number => -0.5 * m * omega * omega * rho * rho;

/**
 * A free puck's speed relative to the turntable at distance ρ, from ½v′² − ½ω²ρ² = const (Coriolis does no work):
 * v′ = √(v₀′² + ω²(ρ² − ρ₀²)).
 */
export const freePuckSpeedRotating = (v0p: number, omega: number, rho0: number, rho: number): number =>
  Math.sqrt(v0p * v0p + omega * omega * (rho * rho - rho0 * rho0));

/**
 * A puck launched from the centre along the painted line at speed u: in S′ at time t it is at distance ut from
 * the centre, an angle ωt behind the line, so its distance from the line is ut·sin(ωt) (for ωt ≤ π/2 or so).
 */
export const radialLaunchOffLine = (u: number, omega: number, t: number): number => u * t * Math.sin(omega * t);

/** A puck released at rest on the turntable at ρ₀ (its string cut): distance from the axis ρ₀√(1 + (ωt)²). */
export const releasedDistance = (rho0: number, omega: number, t: number): number => rho0 * Math.sqrt(1 + omega * omega * t * t);

// ---------------------------------------------------------------- a bead on a rotating hoop

/** The critical rate above which the bead leaves the bottom of a hoop of radius R: √(g/R). */
export const beadCriticalOmega = (g: number, R: number): number => Math.sqrt(g / R);

/** The bead's stable equilibrium angle from the bottom: 0 for ω ≤ √(g/R), else acos(g/(ω²R)). */
export function beadEquilibrium(g: number, R: number, omega: number): number {
  const c = g / (omega * omega * R);
  return c >= 1 ? 0 : Math.acos(c);
}

/** U_eff(θ) = −mgR cos θ − ½mω²R² sin²θ in the hoop's frame (θ from the bottom). */
export const beadEffectivePotential = (m: number, g: number, R: number, omega: number, theta: number): number =>
  -m * g * R * Math.cos(theta) - 0.5 * m * omega * omega * R * R * Math.sin(theta) ** 2;

/**
 * Angular frequency of small oscillations along the hoop about the stable equilibrium:
 * √(g/R − ω²) about the bottom (ω < √(g/R)), ω sin θ₀ about θ₀ (ω > √(g/R)).
 */
export function beadSmallOscillation(g: number, R: number, omega: number): number {
  const th = beadEquilibrium(g, R, omega);
  if (th === 0) return Math.sqrt(Math.max(0, g / R - omega * omega));
  return omega * Math.sin(th);
}

// ---------------------------------------------------------------- a bead on a rotating parabolic wire

/**
 * A bead on a wire bent into z = kρ², turning about its vertical axis: U_eff/m = (gk − ½ω²)ρ². The bottom is stable
 * below ω = √(2gk), neutral (the bead stays anywhere) at it, unstable above it.
 */
export const parabolicWireCriticalOmega = (g: number, k: number): number => Math.sqrt(2 * g * k);

/** U_eff per unit mass on the parabolic wire, at distance ρ from the axis. */
export const parabolicWirePotential = (g: number, k: number, omega: number, rho: number): number =>
  (g * k - 0.5 * omega * omega) * rho * rho;

// ---------------------------------------------------------------- the rotating bucket

/** Height of the free surface at distance r from the axis: z₀ + ω²r²/(2g). */
export const bucketSurface = (z0: number, omega: number, r: number, g: number): number => z0 + (omega * omega * r * r) / (2 * g);

/**
 * How far the surface at the wall rises above the level of the liquid at rest (and the centre drops below it),
 * for a cylinder of radius R with the liquid's volume kept: ω²R²/(4g).
 */
export const bucketRimRise = (omega: number, R: number, g: number): number => (omega * omega * R * R) / (4 * g);
