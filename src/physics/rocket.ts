/**
 * Bodies whose mass changes (lesson 3.6): a rocket that ejects its fuel, in free space or launched vertically in
 * uniform gravity, and a cart or a conveyor belt onto which sand falls (or out of which it leaks).
 *
 * MODEL SPECIFICATION
 * - System: the rocket together with the fuel it ejects in each short interval dt (a closed system); the cart
 *   together with the sand that lands on it (or leaves it) in dt. One dimension: the rocket's axis points UP
 *   (along the motion in free space), the cart's axis along its track. Inertial frame.
 * - Dynamics: momentum over dt, P(t + dt) − P(t) = F_ext dt, for the closed system. With w the velocity of the
 *   mass gained or lost and M the body's mass, this gives the variable-mass equation
 *     M dv/dt = F_ext + (w − v) dM/dt.
 *   Rocket: w − v = −u (u the exhaust speed relative to the rocket), dM/dt = −μ (μ the burn rate, constant):
 *   M dv/dt = u μ − M g, the thrust u μ minus the weight. During the burn, from lift-off at t_l with mass m_l,
 *     v(t) = u ln(m_l/M(t)) − g (t − t_l),   M(t) = m₀ − μ t,
 *     y(t) = u [τ − (M/μ) ln(m_l/M)] − ½ g τ²,   τ = t − t_l;
 *   in free space (g = 0) Tsiolkovsky's Δv = u ln(m₀/m₁). After burn-out a coast under gravity alone.
 *   Sand falling vertically on a cart (w = 0 along the track), dM/dt = +μ: at constant speed the pushing force
 *   is F = v μ, its power v² μ, half of it kinetic energy and half heat; with no force the cart slows,
 *   v = M₀ v₀/(M₀ + μ t). Sand leaking through the floor leaves with the cart's velocity (w = v): no change.
 * - Boundary: the rocket starts at rest at t = 0 on a launch pad (y = 0); the pad pushes up (a normal force)
 *   while the thrust is less than the weight, so the rocket lifts off once M g < u μ, at M = u μ/g, or never if
 *   the dry mass m₁ is heavier than that. Burn-out at t_b = (m₀ − m₁)/μ. No ground after lift-off (callers
 *   stop the flight).
 * - Ignored: air drag, the change of g with height (and the curvature of the Earth), the pressure term of a real
 *   nozzle (u is the effective exhaust speed), a burn rate that changes, the rocket's rotation; for the sand,
 *   the vertical impulse of the landing (it is taken by the track, not by the pushing force), and the time a
 *   grain slides on the belt (the power is a time average over many grains).
 * - Valid when: u and μ are constant, the burn is short enough for g to be constant (heights ≪ the Earth's
 *   radius), and the air is negligible (in practice, above the dense atmosphere).
 * - Failure modes: M → 0 makes the logarithm diverge (m₁ must be positive); μ → 0 makes t_b diverge and, in
 *   gravity, the rocket never lifts off; the closed form of y(t) cancels for μ τ ≪ m_l (a series keeps it
 *   exact); the numerical integrator steps exactly onto lift-off and burn-out, where the acceleration jumps,
 *   so RK4 keeps its order; the parcel model (`parcelRocket`) is exact for impulsive ejections and tends to the
 *   continuous rocket only at first order in the parcel size.
 */

/** A rocket burning at a constant rate. */
export interface Rocket {
  /** initial mass, with all its fuel [kg] */
  m0: number;
  /** dry mass at burn-out [kg] (0 < m1 < m0) */
  m1: number;
  /** exhaust speed relative to the rocket [m/s] */
  u: number;
  /** burn rate |dM/dt| [kg/s] */
  rate: number;
  /** free-fall acceleration [m/s²]; 0 (free space) by default */
  g?: number;
}

const gOf = (r: Rocket) => r.g ?? 0;

/** Tsiolkovsky: the change in velocity while the mass falls from m0 to m, with no external force [m/s]. */
export const tsiolkovsky = (u: number, m0: number, m: number) => u * Math.log(m0 / m);

/** The mass ratio m₀/m₁ a rocket with exhaust speed u needs for a change in velocity dv in free space. */
export const massRatioFor = (dv: number, u: number) => Math.exp(dv / u);

/** The thrust, the force the exhaust exerts on the rocket: u |dM/dt| [N]. */
export const thrust = (r: Rocket) => r.u * r.rate;

/** The burn time (m₀ − m₁)/μ [s]. */
export const burnTime = (r: Rocket) => (r.m0 - r.m1) / r.rate;

/** The rocket's mass at time t [kg]: m₀ − μ t during the burn, m₁ after it. */
export const massAt = (r: Rocket, t: number) => Math.max(r.m1, r.m0 - r.rate * Math.max(0, t));

/** The mass below which the thrust exceeds the weight, u μ/g [kg]; Infinity in free space. */
export const liftoffMass = (r: Rocket) => (gOf(r) > 0 ? thrust(r) / gOf(r) : Infinity);

/**
 * When the rocket leaves the pad [s]: 0 if the thrust exceeds the weight at once (or in free space), the moment
 * the mass falls to u μ/g otherwise, and Infinity if even the dry rocket is too heavy to lift.
 */
export function liftoffTime(r: Rocket): number {
  const ml = liftoffMass(r);
  if (ml >= r.m0) return 0;
  if (ml <= r.m1) return Infinity;
  return (r.m0 - ml) / r.rate;
}

/** f(x) = x + (1 − x) ln(1 − x), the dimensionless climb during the burn; a series for small x (no cancellation). */
function climb(x: number): number {
  if (x < 1e-3) {
    // Σ xⁿ/(n(n − 1)), n ≥ 2
    let s = 0;
    let p = x;
    for (let n = 2; n <= 8; n++) {
      p *= x;
      s += p / (n * (n - 1));
    }
    return s;
  }
  return x + (1 - x) * Math.log1p(-x);
}

/** The state at the end of the burn: time, velocity, height, and whether the rocket ever left the pad. */
export interface Burnout {
  t: number;
  v: number;
  y: number;
  lifted: boolean;
}

/** Velocity and height during the burn, τ after lift-off from mass m_l (closed form). */
function burnPhase(r: Rocket, ml: number, tau: number): { v: number; y: number } {
  const g = gOf(r);
  const x = (r.rate * tau) / ml; // the fraction of m_l burnt since lift-off
  const v = -r.u * Math.log1p(-x) - g * tau;
  const y = (r.u * ml * climb(x)) / r.rate - 0.5 * g * tau * tau;
  return { v, y };
}

/** Burn-out: t_b, v_b = u ln(m_l/m₁) − g (t_b − t_l), and the height y_b reached during the burn. */
export function burnout(r: Rocket): Burnout {
  const tb = burnTime(r);
  const tl = liftoffTime(r);
  if (!Number.isFinite(tl)) return { t: tb, v: 0, y: 0, lifted: false };
  const { v, y } = burnPhase(r, massAt(r, tl), tb - tl);
  return { t: tb, v, y, lifted: true };
}

/** The upward velocity at time t [m/s] (0 on the pad; a coast under gravity after burn-out). */
export function velocity(r: Rocket, t: number): number {
  const tl = liftoffTime(r);
  if (!(t > tl)) return 0;
  const tb = burnTime(r);
  if (t <= tb) return burnPhase(r, massAt(r, tl), t - tl).v;
  const b = burnout(r);
  return b.v - gOf(r) * (t - tb);
}

/** The height at time t [m]. */
export function height(r: Rocket, t: number): number {
  const tl = liftoffTime(r);
  if (!(t > tl)) return 0;
  const tb = burnTime(r);
  if (t <= tb) return burnPhase(r, massAt(r, tl), t - tl).y;
  const b = burnout(r);
  const s = t - tb;
  return b.y + b.v * s - 0.5 * gOf(r) * s * s;
}

/** The velocity lost to gravity during the burn, g (t_b − t_l) [m/s]: free-space Δv minus v_b. */
export function gravityLoss(r: Rocket): number {
  const tl = liftoffTime(r);
  return Number.isFinite(tl) ? gOf(r) * (burnTime(r) - tl) : NaN;
}

/** The greatest height, after the coast that follows burn-out: y_b + v_b²/(2g) [m]; Infinity in free space. */
export function apexHeight(r: Rocket): number {
  const b = burnout(r);
  if (!b.lifted) return 0;
  const g = gOf(r);
  return g > 0 ? b.y + (b.v * b.v) / (2 * g) : Infinity;
}

/** The time of the greatest height [s]. */
export function apexTime(r: Rocket): number {
  const b = burnout(r);
  const g = gOf(r);
  return g > 0 && b.lifted ? b.t + b.v / g : Infinity;
}

/**
 * The normal force of the pad on the rocket at time t [N]: M g − u μ while the rocket sits on it (thrust below
 * the weight), 0 once it flies.
 */
export function padForce(r: Rocket, t: number): number {
  if (t > liftoffTime(r)) return 0;
  return Math.max(0, massAt(r, t) * gOf(r) - (t < burnTime(r) ? thrust(r) : 0));
}

/* ------------------------------------------------------------ numerical integration with a varying mass */

/**
 * The variable-mass equation, M dv/dt = F_ext + (w − v) dM/dt: the acceleration of a body of mass M and velocity v
 * under an external force F_ext, gaining mass at the rate dM/dt (negative when it loses mass) that arrives with,
 * or leaves with, velocity w.
 */
export const variableMassAcceleration = (M: number, v: number, Fext: number, dMdt: number, w: number) =>
  (Fext + (w - v) * dMdt) / M;

/** The state of a body whose mass changes: position, velocity, mass. */
export interface MassState {
  y: number;
  v: number;
  m: number;
}

/** d/dt of (y, v, m) at time t. */
export type MassRates = (s: MassState, t: number) => MassState;

/** One classical RK4 step of (y, v, m) under the given rates; the mass is a state variable like the others. */
export function rk4MassStep(s: MassState, rates: MassRates, t: number, dt: number): MassState {
  const at = (a: MassState, k: MassState, h: number): MassState => ({ y: a.y + k.y * h, v: a.v + k.v * h, m: a.m + k.m * h });
  const k1 = rates(s, t);
  const k2 = rates(at(s, k1, dt / 2), t + dt / 2);
  const k3 = rates(at(s, k2, dt / 2), t + dt / 2);
  const k4 = rates(at(s, k3, dt), t + dt);
  return {
    y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    v: s.v + (dt / 6) * (k1.v + 2 * k2.v + 2 * k3.v + k4.v),
    m: s.m + (dt / 6) * (k1.m + 2 * k2.m + 2 * k3.m + k4.m),
  };
}

/** The rocket's rates in flight during the burn: dv/dt from the variable-mass equation with w − v = −u. */
const flightRates =
  (r: Rocket): MassRates =>
  (s) => ({
    y: s.v,
    v: variableMassAcceleration(s.m, s.v, -s.m * gOf(r), -r.rate, s.v - r.u),
    m: -r.rate,
  });

/** A sample of a numerically integrated flight. */
export interface FlightSample extends MassState {
  t: number;
}

/**
 * The rocket integrated numerically with a varying mass (RK4 on y, v and M), from the pad to burn-out, with
 * `steps` equal steps between lift-off and burn-out. The pad phase needs no integration (the rocket is at rest
 * and only the mass changes). Independent of the closed form: it uses only the variable-mass equation.
 */
export function integrateBurn(r: Rocket, steps: number): FlightSample[] {
  const tl = liftoffTime(r);
  const tb = burnTime(r);
  if (!Number.isFinite(tl)) return [{ t: tb, y: 0, v: 0, m: r.m1 }];
  const out: FlightSample[] = [];
  if (tl > 0) out.push({ t: 0, y: 0, v: 0, m: r.m0 });
  let s: MassState = { y: 0, v: 0, m: r.m0 - r.rate * tl };
  out.push({ t: tl, ...s });
  const dt = (tb - tl) / steps;
  const rates = flightRates(r);
  for (let i = 0; i < steps; i++) {
    s = rk4MassStep(s, rates, tl + i * dt, dt);
    out.push({ t: tl + (i + 1) * dt, ...s });
  }
  return out;
}

/* ------------------------------------------------------------ the rocket as a train of ejected parcels */

/** A rocket that ejects its fuel as n equal parcels, each pushed out at speed u relative to the rocket. */
export interface ParcelFlight {
  /** the rocket's velocity after each ejection [m/s] (n + 1 values, from v0) */
  v: number[];
  /** each parcel's velocity in the inertial frame [m/s] */
  parcels: number[];
  /** the mass of one parcel [kg] */
  dm: number;
}

/**
 * Free space, from velocity v0: the fuel m₀ − m₁ leaves in n equal parcels. Each ejection conserves momentum
 * exactly: a rocket of mass M at v leaves with M − δm at v′ and a parcel δm at v′ − u (u relative to the rocket
 * after the push), so v′ = v + u δm/M. The total momentum of rocket and parcels stays m₀ v0.
 */
export function parcelRocket(m0: number, m1: number, u: number, n: number, v0 = 0): ParcelFlight {
  const dm = (m0 - m1) / n;
  const v = [v0];
  const parcels: number[] = [];
  let M = m0;
  let vr = v0;
  for (let k = 0; k < n; k++) {
    vr += (u * dm) / M;
    M -= dm;
    v.push(vr);
    parcels.push(vr - u);
  }
  return { v, parcels, dm };
}

/** The total momentum of the rocket (mass m₁ at its last velocity) and all its parcels [kg·m/s]. */
export const parcelMomentum = (f: ParcelFlight, m1: number) => m1 * f.v[f.v.length - 1] + f.parcels.reduce((s, w) => s + f.dm * w, 0);

/* ------------------------------------------------------------ sand on a cart, gravel on a belt */

/** The force that keeps a cart (or belt) at speed v while mass lands on it at rate μ with along-track speed w [N]. */
export const sandForce = (v: number, rate: number, w = 0) => (v - w) * rate;

/** The power budget of a belt at speed v loaded at rate μ with along-track speed w [W]. */
export interface BeltPower {
  /** the power the pushing force (the motor) supplies, F v */
  motor: number;
  /** the rate at which the sand's kinetic energy grows, ½ (v² − w²) μ */
  kinetic: number;
  /** the rate at which friction turns energy into heat while the sand slides, ½ (v − w)² μ */
  heat: number;
}

export function beltPower(v: number, rate: number, w = 0): BeltPower {
  return {
    motor: sandForce(v, rate, w) * v,
    kinetic: 0.5 * (v * v - w * w) * rate,
    heat: 0.5 * (v - w) * (v - w) * rate,
  };
}

/**
 * One grain (per kilogram) landing on a belt at speed v with along-track speed w < v, carried up to speed by
 * kinetic friction μ_k g: the slide time, the length it slides relative to the belt, the work the belt (its motor)
 * does, the kinetic energy it gains, and the heat. Computed from the grain's own motion, not from the budget above.
 */
export function grainOnBelt(v: number, w: number, muK: number, g: number) {
  const a = muK * g; // the grain's acceleration while it slides [m/s²]
  const tSlide = (v - w) / a;
  const grainPath = w * tSlide + 0.5 * a * tSlide * tSlide; // the grain's displacement in the ground frame
  const beltPath = v * tSlide; // the belt's displacement in the same time
  const slide = beltPath - grainPath; // the relative sliding length
  const f = a; // the friction force per kilogram [N/kg]
  return {
    tSlide,
    slide,
    /** the motor's work per kilogram: the friction on the belt is −f, so the motor pushes f over the belt's path */
    motorWork: f * beltPath,
    kineticGain: 0.5 * (v * v - w * w),
    heat: f * slide,
  };
}

/** A cart coasting with no horizontal force while sand falls vertically into it: v = M₀ v₀/(M₀ + μ t). */
export const coastingCart = (M0: number, v0: number, rate: number, t: number) => (M0 * v0) / (M0 + rate * t);

/**
 * The (wrong) prediction of F = d(Mv)/dt written blindly for a cart that leaks sand at rate μ with no force:
 * 0 = M dv/dt + v dM/dt gives v = M₀ v₀/(M₀ − μ t), a cart that speeds up. The leaking sand leaves with the cart's
 * own velocity and carries its momentum away: the true velocity stays v₀.
 */
export const blindLeakVelocity = (M0: number, v0: number, rate: number, t: number) => (M0 * v0) / (M0 - rate * t);
