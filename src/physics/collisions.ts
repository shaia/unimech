/**
 * Head-on collisions of two bodies on a line (lesson 4.1, figure CollisionTrack): the general collision with a
 * coefficient of restitution e, its two ends (elastic, e = 1; perfectly inelastic, e = 0), the kinetic energy
 * lost, the velocity of the centre of mass, a body much heavier than the other (a wall, at rest or moving), and
 * a ball bouncing on a heavy floor.
 *
 * MODEL SPECIFICATION
 * - System: two bodies of masses m₁, m₂ moving along one line (the x axis, positive to the right), body 1 on the
 *   left of body 2, with velocities v₁, v₂ before the collision and v₁′, v₂′ after it. They meet only if they
 *   approach, v₁ > v₂.
 * - Dynamics: the collision lasts so short a time that the impulse of every external force during it is
 *   negligible, so the total momentum is conserved: m₁v₁ + m₂v₂ = m₁v₁′ + m₂v₂′. The second condition is
 *   Newton's law of restitution, v₂′ − v₁′ = −e (v₂ − v₁): the speed of separation is e times the speed of
 *   approach. Together:
 *     v₁′ = V − (m₂/M) e (v₁ − v₂),   v₂′ = V + (m₁/M) e (v₁ − v₂),   V = (m₁v₁ + m₂v₂)/M,   M = m₁ + m₂.
 *   Kinetic energy lost: ΔK = ½ μ (v₁ − v₂)² (1 − e²), with μ = m₁m₂/M (the reduced mass).
 *   A body of infinite mass (m₂ = Infinity) keeps its velocity, and v₁′ = v₂ − e (v₁ − v₂).
 * - Boundary: e in [0, 1]; e = 1 elastic (kinetic energy conserved), e = 0 the bodies move together.
 * - Ignored: the duration and the force history of the contact (only the before and after states), rotation,
 *   friction with the track during the contact, any dependence of e on the speed of approach.
 * - Valid when: the bodies move along one line (a head-on collision of smooth bodies), and e is a property of
 *   the pair. A bouncing ball: the floor is much heavier than the ball and does not move, air drag negligible.
 * - Failure modes: v₁ ≤ v₂ means the bodies do not meet; the formulas still return numbers (the "collision"
 *   would push them together), so callers check `approaching`. e > 1 would add kinetic energy (an explosion
 *   between them): `collide` throws on e outside [0, 1]. Both masses infinite: no defined result (throws).
 */

/** The velocities after a collision [m/s], along the x axis. */
export interface After {
  v1: number;
  v2: number;
}

const checkE = (e: number) => {
  if (!(e >= 0 && e <= 1)) throw new RangeError(`coefficient of restitution ${e} is outside [0, 1]`);
};

/** Do the bodies meet? Body 1 is on the left of body 2: they approach when v₁ > v₂. */
export const approaching = (v1: number, v2: number): boolean => v1 > v2;

/** Total momentum m₁v₁ + m₂v₂ [kg·m/s]. */
export const momentum = (m1: number, m2: number, v1: number, v2: number): number => m1 * v1 + m2 * v2;

/** Kinetic energy of one body, ½ m v² [J]. */
export const kineticEnergy = (m: number, v: number): number => 0.5 * m * v * v;

/** Total kinetic energy of the two bodies [J]. */
export const totalKineticEnergy = (m1: number, m2: number, v1: number, v2: number): number =>
  kineticEnergy(m1, v1) + kineticEnergy(m2, v2);

/** Velocity of the centre of mass, (m₁v₁ + m₂v₂)/(m₁ + m₂) [m/s]; a body of infinite mass carries it. */
export function cmVelocity(m1: number, m2: number, v1: number, v2: number): number {
  if (m1 === Infinity && m2 === Infinity) throw new RangeError('both masses infinite');
  if (m2 === Infinity) return v2;
  if (m1 === Infinity) return v1;
  return (m1 * v1 + m2 * v2) / (m1 + m2);
}

/** Reduced mass μ = m₁m₂/(m₁ + m₂) [kg]; with one mass infinite, the other one. */
export function reducedMass(m1: number, m2: number): number {
  if (m2 === Infinity) return m1;
  if (m1 === Infinity) return m2;
  return (m1 * m2) / (m1 + m2);
}

/**
 * A head-on collision with coefficient of restitution e: momentum conserved, v₂′ − v₁′ = e (v₁ − v₂).
 * Either mass may be Infinity (a wall that keeps its velocity).
 */
export function collide(m1: number, m2: number, v1: number, v2: number, e: number): After {
  checkE(e);
  if (m1 === Infinity && m2 === Infinity) throw new RangeError('both masses infinite');
  const u = v1 - v2; // speed of approach
  if (m2 === Infinity) return { v1: v2 - e * u, v2 };
  if (m1 === Infinity) return { v1, v2: v1 + e * u };
  const M = m1 + m2;
  const V = (m1 * v1 + m2 * v2) / M;
  return { v1: V - (m2 / M) * e * u, v2: V + (m1 / M) * e * u };
}

/** Elastic collision (e = 1): v₁′ = ((m₁ − m₂)v₁ + 2m₂v₂)/M, v₂′ = ((m₂ − m₁)v₂ + 2m₁v₁)/M. */
export function elastic(m1: number, m2: number, v1: number, v2: number): After {
  if (m2 === Infinity || m1 === Infinity) return collide(m1, m2, v1, v2, 1);
  const M = m1 + m2;
  return { v1: ((m1 - m2) * v1 + 2 * m2 * v2) / M, v2: ((m2 - m1) * v2 + 2 * m1 * v1) / M };
}

/** Perfectly inelastic collision (e = 0): the bodies move together at the velocity of the centre of mass. */
export const perfectlyInelastic = (m1: number, m2: number, v1: number, v2: number): number => cmVelocity(m1, m2, v1, v2);

/** Kinetic energy lost in the collision, ½ μ (v₁ − v₂)² (1 − e²) [J]. */
export function kineticEnergyLoss(m1: number, m2: number, v1: number, v2: number, e: number): number {
  checkE(e);
  const u = v1 - v2;
  return 0.5 * reducedMass(m1, m2) * u * u * (1 - e * e);
}

/** The coefficient of restitution read off the velocities: −(v₂′ − v₁′)/(v₂ − v₁). */
export const restitution = (v1: number, v2: number, after: After): number => -(after.v2 - after.v1) / (v2 - v1);

/** Fraction of the initial kinetic energy that the target at rest receives in an elastic collision: 4m₁m₂/M². */
export const elasticTransferFraction = (m1: number, m2: number): number => (4 * m1 * m2) / ((m1 + m2) * (m1 + m2));

/** A ball dropped from rest at h₀ onto a heavy floor with coefficient e: the height after the n-th bounce, h₀ e²ⁿ [m]. */
export const bounceHeight = (h0: number, e: number, n: number): number => h0 * e ** (2 * n);

/** The coefficient of restitution of a ball on a heavy floor, from the drop height and the rebound height: √(h₁/h₀). */
export const restitutionFromHeights = (h0: number, h1: number): number => Math.sqrt(h1 / h0);
