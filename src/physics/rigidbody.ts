/**
 * The rigid body of chapter 8 (lessons 8.1–8.8), shared by every lesson's figure and script so the chapter's numbers
 * come from one model: moments of inertia of the standard bodies and the two axis theorems, the velocity of a point
 * of a body that translates and turns, rotation about a fixed axis (constant α, the Atwood machine with a pulley that
 * has mass, kinetic energy and work), rolling (down an incline, and a skidding ball that starts to roll), the
 * physical pendulum and the centre of percussion, a particle that hits a pivoted body, the inertia tensor of a set
 * of point masses with its principal axes, and the precession of a fast top.
 *
 * MODEL SPECIFICATION
 * - System: one rigid body (גוף צפיד): the distances between all its points are fixed. Planar functions use x to the
 *   right, y up, z out of the page (⊙), so ω = ω ẑ with ω > 0 counter-clockwise. The 1-D rolling functions take
 *   the spin as a scalar in the ROLLING SENSE: ω > 0 is the sense in which a wheel that moves along +x would turn
 *   while rolling (clockwise on the page), so rolling without slipping is v = ωR. A body's moment of inertia about
 *   its centre of mass is I_cm = β m R² for a round body (β = 1 ring, ½ disc, ⅔ hollow sphere, ⅖ solid sphere).
 *   Every torque and angular momentum is about a named point or axis.
 * - Dynamics: Σ F = m a_cm; Σ τ = I α about a fixed axis or about the CM (even when the CM accelerates); a point of
 *   the body moves at v = V_cm + ω × r (r from the CM). Rolling without slipping: v = ωR and a = αR, the friction
 *   is static and does no work. A skidding ball: kinetic friction μ m g opposes the slip of the contact point until
 *   the slip vanishes, then it rolls. Physical pendulum: I_P θ̈ = −m g d sin θ, small angles T = 2π√(I_P/(m g d)).
 *   A fast symmetric top (spin ω₃ about its axis, pivot at its tip, CM a distance d up the axis): the gravitational
 *   torque turns L ≈ I₃ ω₃ at Ω = m g d/(I₃ ω₃); the exact steady precession at axis angle θ from the vertical
 *   solves I₁ cos θ Ω² − I₃ ω₃ Ω + m g d = 0 (ω₃ the full component of ω along the axis).
 * - Boundary: initial values given by the caller (ω₀, v₀, θ₀); the pivot or axle is fixed in an inertial frame.
 * - Ignored: deformation, the axle's friction (unless a torque is given), rolling resistance, air, the mass of
 *   strings, the slip of a string on a pulley (the string turns the pulley without slipping: a = αR).
 * - Valid when: the body is rigid; rolling needs μ_s ≥ β tan θ/(1 + β) on an incline; the small-angle period needs
 *   θ₀ ≪ 1 rad; the gyroscopic approximation needs I₃ ω₃ ≫ √(I₁ m g d) (the slow root then ≈ m g d/(I₃ ω₃)).
 * - Failure modes: `skidToRoll` with μ = 0 never reaches rolling (t = ∞); `steadyPrecession` returns no root when
 *   the spin is too slow ((I₃ ω₃)² < 4 I₁ m g d cos θ, the top cannot precess steadily: it falls); `principalAxes`
 *   (Jacobi) returns the axes of a degenerate eigenvalue in an arbitrary orthogonal basis of their plane.
 */

import { G } from './constants';
import { riemann, type Fn } from './calculus';
import { add, type Vec2, type Vec3 } from './vec';

// ---------------------------------------------------------------- moments of inertia (8.2)

/** Thin rod of mass m and length L about a perpendicular axis through its centre: mL²/12. */
export const rodCentre = (m: number, L: number) => (m * L * L) / 12;
/** Thin rod about a perpendicular axis through one end: mL²/3. */
export const rodEnd = (m: number, L: number) => (m * L * L) / 3;
/** Thin ring (or thin-walled cylinder) about its axis: mR². */
export const ring = (m: number, R: number) => m * R * R;
/** Uniform disc (or solid cylinder) about its axis: mR²/2. */
export const disc = (m: number, R: number) => (m * R * R) / 2;
/** Thin spherical shell about a diameter: 2mR²/3. */
export const hollowSphere = (m: number, R: number) => (2 * m * R * R) / 3;
/** Uniform solid sphere about a diameter: 2mR²/5. */
export const solidSphere = (m: number, R: number) => (2 * m * R * R) / 5;
/** Uniform rectangular plate a × b about the perpendicular axis through its centre: m(a² + b²)/12. */
export const plateCentre = (m: number, a: number, b: number) => (m * (a * a + b * b)) / 12;
/** Uniform plate about an axis in its plane through its centre, parallel to the side b: m a²/12. */
export const plateInPlane = (m: number, a: number) => (m * a * a) / 12;
/** Thin ring about a diameter: mR²/2 (perpendicular-axis theorem). */
export const ringDiameter = (m: number, R: number) => (m * R * R) / 2;
/** Uniform disc about a diameter: mR²/4 (perpendicular-axis theorem). */
export const discDiameter = (m: number, R: number) => (m * R * R) / 4;

/** The round bodies that roll; β = I_cm/(mR²). */
export type RoundBody = 'ring' | 'disc' | 'hollowSphere' | 'solidSphere';
export const BETA: Readonly<Record<RoundBody, number>> = { ring: 1, disc: 1 / 2, hollowSphere: 2 / 3, solidSphere: 2 / 5 };

/** Parallel-axis theorem: I = I_cm + m d², d the distance between the axis and the parallel axis through the CM. */
export const parallelAxis = (Icm: number, m: number, d: number) => Icm + m * d * d;
/** Perpendicular-axis theorem for a flat body in the xy plane: I_z = I_x + I_y. */
export const perpendicularAxis = (Ix: number, Iy: number) => Ix + Iy;
/** Radius of gyration k: I = m k². */
export const radiusOfGyration = (I: number, m: number) => Math.sqrt(I / m);

/**
 * I = ∫ λ(s) s² ds over s ∈ [a, b] for a thin body along a line perpendicular to the axis; s is the signed distance
 * from the axis (a rod from s = −L/2 to L/2 about its centre), λ the linear density [kg/m]. Midpoint sum of n pieces.
 */
export const inertiaByIntegral = (lambda: Fn, a: number, b: number, n: number) => riemann((s) => lambda(s) * s * s, a, b, n, 'mid');
/** The mass ∫ λ(s) ds of the same body. */
export const massByIntegral = (lambda: Fn, a: number, b: number, n: number) => riemann(lambda, a, b, n, 'mid');

// ---------------------------------------------------------------- kinematics (8.1)

/** ẑ × r for ω = ω ẑ: the velocity of rotation of a point at r (from the CM), ω r turned by +90°. */
export const rotationVelocity = (omega: number, r: Vec2): Vec2 => [-omega * r[1], omega * r[0]];
/** Velocity of a point of the body: v = V_cm + ω × r, r from the CM, ω counter-clockwise positive. */
export const pointVelocity = (Vcm: Vec2, omega: number, r: Vec2): Vec2 => add(Vcm, rotationVelocity(omega, r));
/** Instantaneous centre of rotation (the point at rest), relative to the CM: r = ẑ × V/ω. Null for ω = 0. */
export const instantaneousCentre = (Vcm: Vec2, omega: number): Vec2 | null =>
  omega === 0 ? null : [-Vcm[1] / omega, Vcm[0] / omega];

/** Rotation at constant angular acceleration α from θ₀, ω₀. */
export function uniformAlpha(theta0: number, omega0: number, alpha: number, t: number): { theta: number; omega: number } {
  return { theta: theta0 + omega0 * t + 0.5 * alpha * t * t, omega: omega0 + alpha * t };
}
/** Tangential and centripetal acceleration of a point at radius r: a_t = αr, a_c = ω²r. */
export const pointAcceleration = (omega: number, alpha: number, r: number) => ({ at: alpha * r, ac: omega * omega * r });

// ---------------------------------------------------------------- fixed axis (8.3)

/** Kinetic energy of rotation about a fixed axis: ½ I ω². */
export const rotationalKE = (I: number, omega: number) => 0.5 * I * omega * omega;
/** Kinetic energy of a body that translates and turns (König): ½ m V_cm² + ½ I_cm ω². */
export const rigidKE = (m: number, Vcm: number, Icm: number, omega: number) => 0.5 * m * Vcm * Vcm + 0.5 * Icm * omega * omega;
/** Work of a constant torque through an angle Δθ: W = τ Δθ. Power: τ ω. */
export const torqueWork = (tau: number, dTheta: number) => tau * dTheta;

/**
 * Atwood machine over a pulley of moment of inertia I and radius R, string not slipping (a = αR), axle frictionless.
 * m₁ moves down when a > 0. T₁ (on m₁) and T₂ (on m₂) differ: (T₁ − T₂) R = I α.
 */
export function atwoodMassivePulley(m1: number, m2: number, I: number, R: number, g = G) {
  const a = ((m1 - m2) * g) / (m1 + m2 + I / (R * R));
  return { a, alpha: a / R, T1: m1 * (g - a), T2: m2 * (g + a) };
}

/** A block of mass m hanging from a string wound on a wheel (I, R) on a fixed frictionless axle. */
export function hangingFromWheel(m: number, I: number, R: number, g = G) {
  const a = (m * g) / (m + I / (R * R));
  return { a, alpha: a / R, T: m * (g - a) };
}

// ---------------------------------------------------------------- rolling (8.4)

/** Acceleration of a round body rolling without slipping down an incline of angle θ: g sin θ/(1 + β). */
export const rollingAcceleration = (beta: number, theta: number, g = G) => (g * Math.sin(theta)) / (1 + beta);
/** The static friction (up the slope) that rolling needs: m g sin θ · β/(1 + β). */
export const rollingFriction = (m: number, beta: number, theta: number, g = G) => (m * g * Math.sin(theta) * beta) / (1 + beta);
/** The least coefficient of static friction for rolling without slipping: β tan θ/(1 + β). */
export const minMuForRolling = (beta: number, theta: number) => (beta * Math.tan(theta)) / (1 + beta);
/** Speed after rolling from rest down a height h: √(2 g h/(1 + β)). */
export const rollingSpeed = (beta: number, h: number, g = G) => Math.sqrt((2 * g * h) / (1 + beta));
/** Share of the kinetic energy of a rolling body that is rotational: β/(1 + β). */
export const rotationalShare = (beta: number) => beta / (1 + beta);

/**
 * A round body (β, R) on a level floor with kinetic friction μ: centre speed v₀ along +x, spin ω₀ in the rolling
 * sense. The contact point slips at u = v − ωR; friction μ m g opposes the slip until u = 0, then it rolls at
 * v_f = (v₀ + β R ω₀)/(1 + β). Returns that time, the final speed, the distance the centre moves meanwhile, and the
 * kinetic energy lost per unit mass (the heat): ½ β u₀²/(1 + β).
 */
export function skidToRoll(v0: number, omega0: number, R: number, beta: number, mu: number, g = G) {
  const u0 = v0 - omega0 * R;
  const s = Math.sign(u0);
  const tRoll = (Math.abs(u0) * beta) / (mu * g * (1 + beta));
  const vFinal = (v0 + beta * R * omega0) / (1 + beta);
  const distance = v0 * tRoll - 0.5 * s * mu * g * tRoll * tRoll;
  const heatPerMass = (0.5 * beta * u0 * u0) / (1 + beta);
  return { u0, tRoll, vFinal, omegaFinal: vFinal / R, distance, heatPerMass };
}

/** The state of the skidding body at time t (before and after it starts to roll). */
export function skidState(v0: number, omega0: number, R: number, beta: number, mu: number, t: number, g = G) {
  const { u0, tRoll, vFinal, distance } = skidToRoll(v0, omega0, R, beta, mu, g);
  const s = Math.sign(u0);
  if (t < tRoll) {
    const v = v0 - s * mu * g * t;
    const omega = omega0 + (s * mu * g * t) / (beta * R);
    const x = v0 * t - 0.5 * s * mu * g * t * t;
    const phi = omega0 * t + (0.5 * s * mu * g * t * t) / (beta * R);
    return { x, v, omega, phi, rolling: false };
  }
  const phiRoll = omega0 * tRoll + (0.5 * s * mu * g * tRoll * tRoll) / (beta * R);
  const dt = t - tRoll;
  return { x: distance + vFinal * dt, v: vFinal, omega: vFinal / R, phi: phiRoll + (vFinal / R) * dt, rolling: true };
}

// ---------------------------------------------------------------- angular momentum (8.6)

/** A body that changes its moment of inertia with no external torque about its axis: ω₂ = I₁ω₁/I₂. */
export const spinChange = (I1: number, omega1: number, I2: number) => (I1 * omega1) / I2;

/**
 * A particle (m, speed v, line of motion a distance b from the pivot, perpendicular to the line pivot–hit point)
 * hits a body pivoted at P (I_P). Sticking: ω = m v b/(I_P + m b²). Elastic: ω = 2 m v b/(I_P + m b²) and the
 * particle leaves at v' = v (m b² − I_P)/(m b² + I_P) (positive: on along its first direction).
 */
export function hitPivoted(m: number, v: number, b: number, Ip: number, elastic: boolean) {
  const J = m * b * b;
  if (!elastic) return { omega: (m * v * b) / (Ip + J), vAfter: ((m * v * b) / (Ip + J)) * b };
  return { omega: (2 * m * v * b) / (Ip + J), vAfter: (v * (J - Ip)) / (J + Ip) };
}

/**
 * A particle (m, speed v) sticks to a free rod (M, length L) at rest on a frictionless table, hitting it
 * perpendicularly a distance b from the rod's centre. Returns the speed of the combined CM, the distance of that CM
 * from the rod's centre, the moment of inertia of the whole about it and the angular speed.
 */
export function stickToFreeRod(m: number, v: number, M: number, L: number, b: number) {
  const Vcm = (m * v) / (m + M);
  const c = (m * b) / (m + M);
  const I = rodCentre(M, L) + M * c * c + m * (b - c) * (b - c);
  const omega = (m * v * (b - c)) / I;
  return { Vcm, c, I, omega };
}

// ---------------------------------------------------------------- physical pendulum (8.7)

/** Small-oscillation period of a physical pendulum: 2π√(I_P/(m g d)), d from the pivot to the CM. */
export const physicalPendulumPeriod = (Ip: number, m: number, d: number, g = G) => 2 * Math.PI * Math.sqrt(Ip / (m * g * d));
/** Equivalent length: the simple pendulum with the same period, ℓ = I_P/(m d). */
export const equivalentLength = (Ip: number, m: number, d: number) => Ip / (m * d);
/**
 * Centre of percussion for a pivot P a distance d from the CM: the point, on the line P–CM a distance
 * d + I_cm/(m d) from P, where a blow perpendicular to that line produces no impulsive reaction at P.
 */
export const centreOfPercussion = (Icm: number, m: number, d: number) => d + Icm / (m * d);
/** The pivot distance with the shortest period: d = k = √(I_cm/m). */
export const fastestPivot = (Icm: number, m: number) => Math.sqrt(Icm / m);
/**
 * A blow J (perpendicular to P–CM) lands a distance s from P on a body at rest. Returns J(1 − m d s/I_P): the impulse
 * the BODY exerts ON THE PIVOT, positive along J. The pivot's impulse on the body is minus this (from
 * m d ω = J + J_P and I_P ω = J s). Zero at the centre of percussion.
 */
export const pivotImpulse = (J: number, s: number, Ip: number, m: number, d: number) => J * (1 - (m * d * s) / Ip);

// ---------------------------------------------------------------- inertia tensor and the top (8.8)

export type Mat3 = [[number, number, number], [number, number, number], [number, number, number]];
export interface PointMass {
  m: number;
  r: Vec3;
}

/** Inertia tensor about the origin: I_ij = Σ m (r² δ_ij − r_i r_j). */
export function inertiaTensor(points: readonly PointMass[]): Mat3 {
  const I: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const { m, r } of points) {
    const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) I[i][j] += m * ((i === j ? r2 : 0) - r[i] * r[j]);
  }
  return I;
}

/** L = I ω. */
export const applyTensor = (I: Mat3, w: Vec3): Vec3 => [
  I[0][0] * w[0] + I[0][1] * w[1] + I[0][2] * w[2],
  I[1][0] * w[0] + I[1][1] * w[1] + I[1][2] * w[2],
  I[2][0] * w[0] + I[2][1] * w[1] + I[2][2] * w[2],
];

/** Principal moments and axes of a symmetric 3×3 tensor (cyclic Jacobi), moments ascending, axes unit columns. */
export function principalAxes(I: Mat3): { moments: [number, number, number]; axes: [Vec3, Vec3, Vec3] } {
  const a = I.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-30 * (a[0][0] ** 2 + a[1][1] ** 2 + a[2][2] ** 2 + 1e-300)) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      if (a[p][q] === 0) continue;
      const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
      const c = Math.cos(th);
      const s = Math.sin(th);
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j]);
  const col = (j: number): Vec3 => [v[0][j], v[1][j], v[2][j]];
  return {
    moments: [a[order[0]][order[0]], a[order[1]][order[1]], a[order[2]][order[2]]],
    axes: [col(order[0]), col(order[1]), col(order[2])],
  };
}

/** Gyroscopic precession rate of a fast top or gyroscope: Ω = m g d/(I₃ ω₃) (independent of the tilt). */
export const precessionRate = (m: number, d: number, I3: number, omega3: number, g = G) => (m * g * d) / (I3 * omega3);

/**
 * Steady precession of a symmetric top at angle θ from the vertical: the roots of I₁ cos θ Ω² − I₃ ω₃ Ω + m g d = 0.
 * Returns [slow, fast] or null when no steady precession exists. At θ = 90° only the slow root m g d/(I₃ ω₃) exists;
 * below the horizontal (θ > 90°) the fast root is negative and the slow one still comes first.
 */
export function steadyPrecession(m: number, d: number, I1: number, I3: number, omega3: number, theta: number, g = G): [number, number] | null {
  const A = I1 * Math.cos(theta);
  const B = I3 * omega3;
  const C = m * g * d;
  if (Math.abs(A) < 1e-15 * B) return [C / B, Infinity];
  const disc2 = B * B - 4 * A * C;
  if (disc2 < 0) return null;
  const q = 0.5 * (B + Math.sqrt(disc2));
  // C/q is always the slow root (q is the large-magnitude combination, so no cancellation); q/A is the fast one,
  // negative (retrograde) when the axis is below the horizontal (cos θ < 0). Never sort them by value.
  return [C / q, q / A];
}
