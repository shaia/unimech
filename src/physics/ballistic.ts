/**
 * A short collision followed by a long stage (lesson 4.4): the ballistic pendulum, a perfectly inelastic
 * collision followed by sliding against kinetic friction, and one followed by the compression of a spring;
 * and a finite-duration collision model that measures the impulse the external forces deliver during the
 * collision, so the staged answer (momentum across the collision, energy or work after it) can be checked
 * against the full motion and the approximation seen to fail when the collision is not short.
 *
 * MODEL SPECIFICATION
 * - System: a projectile of mass m (a bullet, or a block) moving with speed v along the coordinate s hits a
 *   target of mass M at rest and sticks to it. Three scenes:
 *   'pendulum': the target hangs on a light inextensible string of length L; s is the arc length of the
 *     target's path from its lowest point (φ = s/L), and both bodies move along that arc.
 *   'floor': the target rests on a rough floor, kinetic coefficient μk (static friction taken equal to
 *     kinetic); the floor's normal force on the target is (m + M)g (the projectile's weight is carried by the
 *     target once they touch, and the projectile's weight before that is ignored).
 *   'spring': the target rests on a smooth floor against a light spring of constant k, fixed to a wall, at its
 *     natural length; s is the spring's compression.
 * - Dynamics, the staged model (an instantaneous collision): stage 1 conserves momentum along s,
 *   m v = (m + M)V; stage 2 starts at s = 0 with V: the pendulum conserves mechanical energy
 *   (h = V²/2g, cos θ = 1 − h/L), the slide obeys the work–energy theorem (d = V²/2μk g), the spring
 *   conserves energy (x = V√((m + M)/k)).
 * - Dynamics, the finite-duration model: while the projectile slides relative to the target (w = v_b − v_B > 0)
 *   the contact force between them is a constant F_c = μ_r v/Δt, μ_r = mM/(m + M), chosen so that without
 *   external forces the relative velocity vanishes in exactly Δt. External forces along s: pendulum
 *   −(m + M) g sin φ_B, shared as −m g sin φ_B on the projectile and −M g sin φ_B on the target (the string's
 *   tension is perpendicular to the motion); floor −μk(m + M)g on the moving target, static friction up to
 *   μk(m + M)g on the resting one; spring −k s_B on the target. When w reaches zero the bodies lock and stage 2
 *   starts from the locked state (s_c, V_c), solved exactly (energy for the pendulum and the spring, constant
 *   deceleration for the slide). Stage 1 is integrated with RK4 at a fixed number of steps per Δt; the lock
 *   instant is found by bisection within the step that crosses w = 0.
 * - Boundary: the projectile reaches the target at t = 0, s = 0, with the target at rest at s = 0.
 * - Ignored: the shape of the real contact force (any pulse with the same Δt gives the same leading-order
 *   impulse estimate up to a factor of order one), rotation of the block, air resistance, the mass of the
 *   string and of the spring, the wood the bullet removes, heating's effect on anything.
 * - Valid when: pendulum h ≤ L (otherwise the string goes slack before the top); the projectile is much
 *   shorter than L. The staged model is the limit Δt → 0 of the finite one: the error of the momentum after the
 *   collision is ≈ Δt/T₂ for a constant external force (friction) and ≈ (π²/24)(Δt/T₂)² for one that grows from
 *   zero (the pendulum's gravity along the arc, the spring), T₂ the duration of stage 2 in the staged model.
 * - Failure modes: Δt comparable to T₂ (the "collision" is no longer short, and the two stages overlap: the
 *   finite model then still computes, but the split into stages has lost its meaning); h > L (`slack`);
 *   a contact force smaller than the static friction leaves the target at rest during the whole collision.
 */

import { G } from './constants';

/* ------------------------------------------------------------------ the staged (instantaneous) model */

/** Common velocity after a perfectly inelastic collision along one line [m/s]. */
export const stuckVelocity = (m1: number, v1: number, m2: number, v2 = 0): number => (m1 * v1 + m2 * v2) / (m1 + m2);

/** K after / K before for a projectile m that sticks in a target M at rest: m/(m + M). */
export const keptEnergyFraction = (m: number, M: number): number => m / (m + M);

/** Height a body moving at V rises on a string, or a frictionless track, while energy is conserved [m]. */
export const riseHeight = (V: number, g = G): number => (V * V) / (2 * g);

/** Height of a string's swing from its angle: h = L(1 − cos θ) [m]. */
export const riseFromAngle = (L: number, thetaDeg: number): number => L * (1 - Math.cos((thetaDeg * Math.PI) / 180));

/** Swing angle of a string of length L whose bob rose by h [deg]; NaN beyond 90° is not returned: h > L gives NaN. */
export const angleFromRise = (L: number, h: number): number => (h > L ? NaN : (Math.acos(1 - h / L) * 180) / Math.PI);

/** Ballistic pendulum, forward: bullet m at v sticks in block M; the pair rises to h. */
export function ballisticPendulum(m: number, M: number, v: number, g = G) {
  const V = stuckVelocity(m, v, M);
  const Kbefore = 0.5 * m * v * v;
  const Kafter = 0.5 * (m + M) * V * V;
  return { V, h: riseHeight(V, g), Kbefore, Kafter, lost: Kbefore - Kafter };
}

/** Ballistic pendulum, backward: the bullet's speed from the rise h, v = ((m + M)/m)√(2gh) [m/s]. */
export const bulletSpeedFromRise = (m: number, M: number, h: number, g = G): number => ((m + M) / m) * Math.sqrt(2 * g * h);

/** The common wrong move: energy conserved from the bullet to the top, ½mv² = (m + M)gh [m/s]. */
export const energyOnlySpeed = (m: number, M: number, h: number, g = G): number => Math.sqrt((2 * (m + M) * g * h) / m);

/** A bullet that passes through a hanging block, entering at v and leaving at vOut: the block's V and rise h. */
export function bulletThrough(m: number, M: number, v: number, vOut: number, g = G) {
  const V = (m * (v - vOut)) / M;
  return { V, h: riseHeight(V, g) };
}

/** Distance a body moving at V slides on a level floor before kinetic friction stops it [m]. */
export const slideDistance = (V: number, muk: number, g = G): number => (V * V) / (2 * muk * g);

/** A projectile m at v sticks in a target M at rest on a rough floor; the pair slides d. */
export function stickThenSlide(m: number, M: number, v: number, muk: number, g = G) {
  const V = stuckVelocity(m, v, M);
  const Kbefore = 0.5 * m * v * v;
  const Kafter = 0.5 * (m + M) * V * V;
  const d = slideDistance(V, muk, g);
  return { V, d, Kbefore, Kafter, lostInCollision: Kbefore - Kafter, frictionWork: muk * (m + M) * g * d };
}

/** A projectile m at v sticks in a target M that rests against a spring k fixed to a wall: the largest compression. */
export function stickThenSpring(m: number, M: number, v: number, k: number) {
  const V = stuckVelocity(m, v, M);
  return { V, x: V * Math.sqrt((m + M) / k), Kafter: 0.5 * (m + M) * V * V };
}

/** Two free carts with a light spring between them, m1 at v on m2 at rest: largest compression v√(μ/k). */
export const freeSpringCompression = (m1: number, v: number, m2: number, k: number): number => v * Math.sqrt((m1 * m2) / (m1 + m2) / k);

/** Average force over a collision of duration dt that changes a body's momentum by dp [N]. */
export const averageForce = (dp: number, dt: number): number => dp / dt;

/* ------------------------------------------------------------------ the finite-duration model */

export type Scene = 'pendulum' | 'floor' | 'spring';

export interface Setup {
  scene: Scene;
  /** projectile mass [kg] and speed [m/s] */
  m: number;
  v: number;
  /** target mass [kg] */
  M: number;
  /** pendulum: string length [m] */
  L?: number;
  /** floor: kinetic friction coefficient */
  muk?: number;
  /** spring: spring constant [N/m] */
  k?: number;
  g?: number;
}

const gOf = (s: Setup) => s.g ?? G;
const reduced = (s: Setup) => (s.m * s.M) / (s.m + s.M);

/** The constant contact force that stops the relative motion in exactly dt when no external force acts [N]. */
export const contactForce = (s: Setup, dt: number): number => (reduced(s) * s.v) / dt;

/** The external force along s on (projectile, target), given the target's position and velocity. */
function external(s: Setup, sB: number, vB: number, push: number): [number, number] {
  const g = gOf(s);
  if (s.scene === 'pendulum') {
    const sin = Math.sin(sB / (s.L as number));
    return [-s.m * g * sin, -s.M * g * sin];
  }
  if (s.scene === 'spring') return [0, -(s.k as number) * sB];
  // floor: kinetic friction on a moving target; static friction (up to the same ceiling) on a resting one
  const fMax = (s.muk as number) * (s.m + s.M) * g;
  if (vB > 0) return [0, -fMax];
  return [0, push > fMax ? -fMax : -push];
}

/** A state of stage 1: projectile (sb, vb) and target (sB, vB) along s. */
interface S1 {
  sb: number;
  vb: number;
  sB: number;
  vB: number;
  /** external impulse along s delivered so far to the pair [N·s] */
  J: number;
}

function deriv(s: Setup, Fc: number, x: S1): S1 {
  const [eb, eB] = external(s, x.sB, x.vB, Fc);
  // a target held by static friction does not accelerate
  const aB = s.scene === 'floor' && x.vB <= 0 && eB === -Fc ? 0 : (Fc + eB) / s.M;
  return { sb: x.vb, vb: (-Fc + eb) / s.m, sB: x.vB, vB: aB, J: eb + eB };
}

function rk4(s: Setup, Fc: number, x: S1, h: number): S1 {
  const add = (a: S1, b: S1, c: number): S1 => ({ sb: a.sb + c * b.sb, vb: a.vb + c * b.vb, sB: a.sB + c * b.sB, vB: a.vB + c * b.vB, J: a.J + c * b.J });
  const k1 = deriv(s, Fc, x);
  const k2 = deriv(s, Fc, add(x, k1, h / 2));
  const k3 = deriv(s, Fc, add(x, k2, h / 2));
  const k4 = deriv(s, Fc, add(x, k3, h));
  const out = add(x, k1, h / 6);
  const o2 = add(out, k2, h / 3);
  const o3 = add(o2, k3, h / 3);
  const o4 = add(o3, k4, h / 6);
  // a target held by friction stays put exactly
  if (s.scene === 'floor' && o4.vB < 0) return { ...o4, vB: 0 };
  return o4;
}

export interface Stage1Sample {
  t: number;
  sb: number;
  vb: number;
  sB: number;
  vB: number;
}

export interface Collision {
  /** the contact force [N] and the instant the bodies lock [s] */
  Fc: number;
  tLock: number;
  /** the target's position and the common velocity at the lock */
  sLock: number;
  VLock: number;
  /** momentum along s before (m v) and at the lock ((m + M) V_lock) [kg·m/s] */
  pBefore: number;
  pAfter: number;
  /** impulse of the external forces along s during the collision [N·s] (negative: against the motion) */
  Jext: number;
  /** momentum the target received, M·V_lock [kg·m/s] */
  dpTarget: number;
  samples: Stage1Sample[];
}

/**
 * Integrate stage 1 with a contact force that would stop the relative motion in `dt`. `steps` RK4 steps per
 * dt; the step that crosses w = 0 is bisected to the lock instant. Samples every step (for drawing).
 */
export function collide(s: Setup, dt: number, steps = 400): Collision {
  const Fc = contactForce(s, dt);
  const h = dt / steps;
  let x: S1 = { sb: 0, vb: s.v, sB: 0, vB: 0, J: 0 };
  let t = 0;
  const samples: Stage1Sample[] = [{ t, sb: x.sb, vb: x.vb, sB: x.sB, vB: x.vB }];
  // external forces can stretch the collision; give it up to 50 dt
  for (let i = 0; i < 50 * steps; i++) {
    const nx = rk4(s, Fc, x, h);
    if (nx.vb - nx.vB <= 0) {
      // bisect the step for the instant w = 0
      let lo = 0;
      let hi = h;
      for (let j = 0; j < 60; j++) {
        const mid = (lo + hi) / 2;
        const y = rk4(s, Fc, x, mid);
        if (y.vb - y.vB > 0) lo = mid;
        else hi = mid;
      }
      const y = rk4(s, Fc, x, (lo + hi) / 2);
      t += (lo + hi) / 2;
      x = y;
      samples.push({ t, sb: x.sb, vb: x.vb, sB: x.sB, vB: x.vB });
      break;
    }
    x = nx;
    t += h;
    samples.push({ t, sb: x.sb, vb: x.vb, sB: x.sB, vB: x.vB });
  }
  // at the lock the two velocities are equal; the common one carries the pair's momentum
  const VLock = (s.m * x.vb + s.M * x.vB) / (s.m + s.M);
  return {
    Fc,
    tLock: t,
    sLock: x.sB,
    VLock,
    pBefore: s.m * s.v,
    pAfter: (s.m + s.M) * VLock,
    Jext: x.J,
    dpTarget: s.M * VLock,
    samples,
  };
}

/** Leading-order estimate of the external impulse during a collision of duration dt (magnitude) [N·s]. */
export function externalImpulseEstimate(s: Setup, dt: number): number {
  const g = gOf(s);
  const V = stuckVelocity(s.m, s.v, s.M);
  if (s.scene === 'floor') return (s.muk as number) * (s.m + s.M) * g * dt;
  if (s.scene === 'pendulum') return ((s.m + s.M) * g * V * dt * dt) / (6 * (s.L as number));
  return ((s.k as number) * V * dt * dt) / 6;
}

export interface Stage2 {
  /** pendulum: rise above the lowest point [m], swing angle [deg], slack if h > L */
  h?: number;
  thetaDeg?: number;
  slack?: boolean;
  /** floor: total distance from the target's start [m]; heat by friction in stage 2 [J] */
  d?: number;
  frictionWork?: number;
  /** spring: largest compression [m] */
  x?: number;
  /** duration of stage 2, from the lock to the top, the stop or the largest compression [s] */
  T2: number;
}

/** Stage 2 from the locked state (target at s0 with velocity V0, the pair moving together). Exact. */
export function stage2(s: Setup, s0: number, V0: number): Stage2 {
  const g = gOf(s);
  const mt = s.m + s.M;
  if (s.scene === 'pendulum') {
    const L = s.L as number;
    const h = L * (1 - Math.cos(s0 / L)) + (V0 * V0) / (2 * g);
    const slack = h > L;
    return { h, thetaDeg: slack ? 90 : angleFromRise(L, h), slack, T2: pendulumRiseTime(L, s0 / L, V0 / L, g) };
  }
  if (s.scene === 'floor') {
    const a = (s.muk as number) * g;
    const dSlide = V0 > 0 ? (V0 * V0) / (2 * a) : 0;
    return { d: s0 + dSlide, frictionWork: (s.muk as number) * mt * g * dSlide, T2: V0 > 0 ? V0 / a : 0 };
  }
  const k = s.k as number;
  const w = Math.sqrt(k / mt);
  const x = Math.sqrt(s0 * s0 + (V0 / w) ** 2);
  const phi0 = Math.atan2(s0, V0 / w);
  let dphi = Math.PI / 2 - phi0;
  while (dphi < 0) dphi += 2 * Math.PI;
  return { x, T2: dphi / w };
}

/**
 * Time for a pendulum (length L) from angle φ0 with angular velocity ω0 > 0 to its highest point, by RK4 with a
 * step of 1/2000 of the small-angle period and a bisection on the last step.
 */
export function pendulumRiseTime(L: number, phi0: number, omega0: number, g = G): number {
  if (omega0 <= 0) return 0;
  const h = (2 * Math.PI * Math.sqrt(L / g)) / 2000;
  let phi = phi0;
  let om = omega0;
  let t = 0;
  const f = (p: number) => -(g / L) * Math.sin(p);
  const step = (p: number, o: number, dt: number): [number, number] => {
    const k1p = o;
    const k1o = f(p);
    const k2p = o + (dt / 2) * k1o;
    const k2o = f(p + (dt / 2) * k1p);
    const k3p = o + (dt / 2) * k2o;
    const k3o = f(p + (dt / 2) * k2p);
    const k4p = o + dt * k3o;
    const k4o = f(p + dt * k3p);
    return [p + (dt / 6) * (k1p + 2 * k2p + 2 * k3p + k4p), o + (dt / 6) * (k1o + 2 * k2o + 2 * k3o + k4o)];
  };
  for (let i = 0; i < 100000; i++) {
    const [np, no] = step(phi, om, h);
    if (no <= 0) {
      let lo = 0;
      let hi = h;
      for (let j = 0; j < 60; j++) {
        const mid = (lo + hi) / 2;
        if (step(phi, om, mid)[1] > 0) lo = mid;
        else hi = mid;
      }
      return t + (lo + hi) / 2;
    }
    phi = np;
    om = no;
    t += h;
  }
  return t;
}

/** The pendulum's angle φ(t) from (φ0, ω0), sampled with RK4 at n + 1 equal times over [0, T] (for drawing). */
export function pendulumPath(L: number, phi0: number, omega0: number, T: number, n = 200, g = G): number[] {
  const out = [phi0];
  let p = phi0;
  let o = omega0;
  const dt = T / n;
  const f = (x: number) => -(g / L) * Math.sin(x);
  for (let i = 0; i < n; i++) {
    const k1p = o;
    const k1o = f(p);
    const k2p = o + (dt / 2) * k1o;
    const k2o = f(p + (dt / 2) * k1p);
    const k3p = o + (dt / 2) * k2o;
    const k3o = f(p + (dt / 2) * k2p);
    const k4p = o + dt * k3o;
    const k4o = f(p + dt * k3p);
    p += (dt / 6) * (k1p + 2 * k2p + 2 * k3p + k4p);
    o += (dt / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
    out.push(p);
  }
  return out;
}

/** The staged answer (Δt → 0) and the finite-Δt answer of one setup, and their relative difference. */
export function compare(s: Setup, dt: number, steps = 400) {
  const V = stuckVelocity(s.m, s.v, s.M);
  const staged = stage2(s, 0, V);
  const col = collide(s, dt, steps);
  const finite = stage2(s, col.sLock, col.VLock);
  const key = s.scene === 'pendulum' ? 'h' : s.scene === 'floor' ? 'd' : 'x';
  const a = staged[key] as number;
  const b = finite[key] as number;
  return { V, staged, col, finite, key, error: (b - a) / a };
}
