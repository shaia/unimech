/**
 * Motion under a general central force, read from the effective potential (lesson 6.3). The inverse-square case
 * (its conic, its elements, Kepler's laws) is `orbit.ts`; this module adds what that one does not have: the
 * effective potential of any central potential, its minimum (the circular orbit) and its turning points found
 * numerically, the radial motion r(t), θ(t) integrated for any central force (a rosette when the force is not
 * 1/r²), and the apsidal angle and the radial period as integrals. Every function works per unit (reduced) mass,
 * in the notation of orbit.ts: h the specific angular momentum, ε the specific energy, u(r) the potential energy
 * per unit mass.
 *
 * MODEL SPECIFICATION
 * - System: one body (or the relative coordinate of two, with the reduced mass μ, lesson 6.2) in a plane, with
 *   polar coordinates (r, θ) about the centre of force; θ = 0 at the first periapsis (the inner turning point).
 * - Dynamics: the force is central, F = −μ u′(r) r̂, so its torque about the centre is zero and h = r²θ̇ is
 *   constant. Then ε = ½ṙ² + u_eff(r) with u_eff(r) = h²/(2r²) + u(r), and the radial equation is
 *   r̈ = h²/r³ − u′(r) = −u_eff′(r); θ̇ = h/r². The state (r, ṙ, θ) is integrated with RK4 at an adaptive step
 *   dt = η·r/v (a fixed fraction of the time the body takes to cover its own distance from the centre).
 *   Apsidal angle Δθ = ∫ (h/r²) dr / √(2(ε − u_eff)) from r_p to r_a, and the radial period
 *   T_r = 2∫ dr / √(2(ε − u_eff)), both with the substitution r = c − d cos ψ, which removes the inverse-square-
 *   root singularities at the turning points.
 * - Potentials: `keplerPotential` u = −GM/r; `freePotential` u = 0 (no force: a straight line, and still the
 *   h²/(2r²) term); `yukawaPotential` u = −(GM/r)e^(−r/λ), an attraction that weakens faster than 1/r² far away
 *   (a rosette); `harmonicPotential` u = ½ω²r² (closed ellipses centred on the centre: a test case).
 * - Boundary: (h, ε) and the potential. The motion starts at the inner turning point; an unbound motion is
 *   integrated outward to `rEscape` and its incoming branch is the mirror image (t → −t, θ → −θ).
 * - Ignored: everything orbit.ts ignores (other bodies, size, relativity, drag).
 * - Valid when: u is smooth for r > 0 and the barrier h²/(2r²) wins over u as r → 0 (true for every potential
 *   here when h ≠ 0), so the body never reaches the centre.
 * - Failure modes: roots are found by a scan on a geometric grid and bisection, so two turning points closer than
 *   the grid step (ε within ~1e-6 of the minimum of u_eff) can merge: callers treat that as the circular orbit.
 *   h = 0 is a radial fall through the centre and is not modelled. The quadratures lose accuracy as the orbit
 *   tends to a circle (ε − u_eff is a difference of nearly equal numbers); `nearCircularApsidalAngle` is the
 *   limit there.
 */

export interface CentralPotential {
  id: 'kepler' | 'free' | 'yukawa' | 'harmonic';
  /** potential energy per unit mass u(r) [J/kg] */
  u: (r: number) => number;
  /** du/dr [N/kg]; positive for an attraction */
  du: (r: number) => number;
  /** d²u/dr², for the near-circular apsidal angle */
  d2u: (r: number) => number;
  /** u(∞) [J/kg]: a motion with ε above it is unbound (Infinity when every motion is bound) */
  uInf: number;
}

export const keplerPotential = (GM: number): CentralPotential => ({
  id: 'kepler',
  u: (r) => -GM / r,
  du: (r) => GM / (r * r),
  d2u: (r) => (-2 * GM) / (r * r * r),
  uInf: 0,
});

export const freePotential = (): CentralPotential => ({ id: 'free', u: () => 0, du: () => 0, d2u: () => 0, uInf: 0 });

export const yukawaPotential = (GM: number, lambda: number): CentralPotential => ({
  id: 'yukawa',
  u: (r) => (-GM / r) * Math.exp(-r / lambda),
  du: (r) => (GM * Math.exp(-r / lambda) * (1 / (r * r) + 1 / (r * lambda))),
  d2u: (r) => -GM * Math.exp(-r / lambda) * (2 / (r * r * r) + 2 / (r * r * lambda) + 1 / (r * lambda * lambda)),
  uInf: 0,
});

export const harmonicPotential = (omega: number): CentralPotential => ({
  id: 'harmonic',
  u: (r) => 0.5 * omega * omega * r * r,
  du: (r) => omega * omega * r,
  d2u: () => omega * omega,
  uInf: Number.POSITIVE_INFINITY,
});

/** u_eff(r) = h²/(2r²) + u(r) [J/kg]. */
export const effective = (pot: CentralPotential, h: number, r: number) => (h * h) / (2 * r * r) + pot.u(r);
/** du_eff/dr = −h²/r³ + u′(r) [N/kg]; the radial acceleration is its negative. */
export const effectiveSlope = (pot: CentralPotential, h: number, r: number) => -(h * h) / (r * r * r) + pot.du(r);

/** Bisection on [a, b] for a sign change of f. */
function bisect(f: (r: number) => number, a: number, b: number): number {
  let fa = f(a);
  for (let i = 0; i < 200; i++) {
    const m = 0.5 * (a + b);
    const fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else b = m;
    if (Math.abs(b - a) <= 1e-14 * Math.abs(m)) break;
  }
  return 0.5 * (a + b);
}

/** Sign changes of f on a geometric grid from rLo to rHi, refined by bisection. */
function roots(f: (r: number) => number, rLo: number, rHi: number, n = 4000): number[] {
  const out: number[] = [];
  const q = Math.pow(rHi / rLo, 1 / n);
  let a = rLo;
  let fa = f(a);
  for (let i = 1; i <= n; i++) {
    const b = rLo * Math.pow(q, i);
    const fb = f(b);
    if (fa === 0) out.push(a);
    else if (Math.sign(fa) !== Math.sign(fb) && fb !== 0) out.push(bisect(f, a, b));
    a = b;
    fa = fb;
  }
  return out;
}

/** The extrema of u_eff in [rLo, rHi]: minima are stable circular orbits, maxima unstable ones. */
export function circularOrbits(pot: CentralPotential, h: number, rLo: number, rHi: number): { r: number; kind: 'min' | 'max' }[] {
  return roots((r) => effectiveSlope(pot, h, r), rLo, rHi).map((r) => {
    const curv = (3 * h * h) / (r * r * r * r) + pot.d2u(r);
    return { r, kind: curv > 0 ? 'min' : 'max' };
  });
}

/** The radius of the stable circular orbit (the lowest minimum of u_eff in range), or null. */
export function circularOrbit(pot: CentralPotential, h: number, rLo: number, rHi: number): number | null {
  const mins = circularOrbits(pot, h, rLo, rHi).filter((c) => c.kind === 'min');
  if (!mins.length) return null;
  return mins.reduce((best, c) => (effective(pot, h, c.r) < effective(pot, h, best) ? c.r : best), mins[0].r);
}

/** The turning radii of the radial motion, u_eff(r) = ε, in [rLo, rHi], sorted. */
export function radialTurningPoints(pot: CentralPotential, h: number, eps: number, rLo: number, rHi: number): number[] {
  return roots((r) => effective(pot, h, r) - eps, rLo, rHi);
}

export interface PolarState {
  r: number;
  rdot: number;
  theta: number;
}

/** One RK4 step of r̈ = −u_eff′(r), θ̇ = h/r². */
export function stepPolar(pot: CentralPotential, h: number, s: PolarState, dt: number): PolarState {
  const f = (q: PolarState): PolarState => ({ r: q.rdot, rdot: -effectiveSlope(pot, h, q.r), theta: h / (q.r * q.r) });
  const add = (a: PolarState, b: PolarState, k: number): PolarState => ({ r: a.r + k * b.r, rdot: a.rdot + k * b.rdot, theta: a.theta + k * b.theta });
  const k1 = f(s);
  const k2 = f(add(s, k1, dt / 2));
  const k3 = f(add(s, k2, dt / 2));
  const k4 = f(add(s, k3, dt));
  return {
    r: s.r + (dt / 6) * (k1.r + 2 * k2.r + 2 * k3.r + k4.r),
    rdot: s.rdot + (dt / 6) * (k1.rdot + 2 * k2.rdot + 2 * k3.rdot + k4.rdot),
    theta: s.theta + (dt / 6) * (k1.theta + 2 * k2.theta + 2 * k3.theta + k4.theta),
  };
}

export interface OrbitSample extends PolarState {
  t: number;
}

export interface Trace {
  samples: OrbitSample[];
  /** the inner turning point the motion starts from (the periapsis) [m] */
  rp: number;
  /** the outer turning point, or Infinity when the motion is unbound */
  ra: number;
  bound: boolean;
}

/**
 * The motion of energy ε and angular momentum h, from the periapsis (t = 0, θ = 0). A bound motion runs for
 * `tEnd`; an unbound one runs outward until r > rEscape and is mirrored to give the incoming branch (t < 0).
 * `eta` is the step as a fraction of r/v. When ε is at (or rounds to) the minimum of u_eff, the orbit is the
 * circle at that minimum.
 */
export function traceOrbit(
  pot: CentralPotential,
  h: number,
  eps: number,
  o: { rLo: number; rHi: number; tEnd: number; rEscape: number; eta?: number; maxSteps?: number },
): Trace {
  const eta = o.eta ?? 0.004;
  const maxSteps = o.maxSteps ?? 40000;
  const tps = radialTurningPoints(pot, h, eps, o.rLo, o.rHi);
  const rc = circularOrbit(pot, h, o.rLo, o.rHi);
  // the periapsis: the turning point just inside the well (for the potentials here, the innermost one)
  let rp = tps.length ? tps[0] : rc ?? o.rLo;
  let ra = tps.length > 1 ? tps[1] : Number.POSITIVE_INFINITY;
  const bound = eps < pot.uInf || ra < Number.POSITIVE_INFINITY;
  if (rc !== null && (tps.length === 0 || (bound && Math.abs(ra - rp) < 1e-6 * rc))) {
    // the circle: u_eff′(rc) = 0, so the RK4 below keeps r = rc to rounding
    rp = rc;
    ra = rc;
  }
  const out: OrbitSample[] = [{ t: 0, r: rp, rdot: 0, theta: 0 }];
  let s: PolarState = { r: rp, rdot: 0, theta: 0 };
  let t = 0;
  for (let i = 0; i < maxSteps; i++) {
    const v = Math.hypot(s.rdot, h / s.r);
    const dt = (eta * s.r) / Math.max(v, 1e-30);
    s = stepPolar(pot, h, s, dt);
    t += dt;
    out.push({ t, ...s });
    if (bound ? t >= o.tEnd : s.r > o.rEscape) break;
  }
  if (bound) return { samples: out, rp, ra, bound };
  const back = out
    .slice(1)
    .reverse()
    .map((q) => ({ t: -q.t, r: q.r, rdot: -q.rdot, theta: -q.theta }));
  return { samples: [...back, ...out], rp, ra, bound };
}

/** The state at time t, linearly interpolated between samples (clamped to the run). */
export function sampleOrbit(tr: Trace, t: number): OrbitSample {
  const s = tr.samples;
  if (t <= s[0].t) return s[0];
  if (t >= s[s.length - 1].t) return s[s.length - 1];
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (s[m].t <= t) lo = m;
    else hi = m;
  }
  const a = s[lo];
  const b = s[hi];
  const f = (t - a.t) / (b.t - a.t);
  return { t, r: a.r + f * (b.r - a.r), rdot: a.rdot + f * (b.rdot - a.rdot), theta: a.theta + f * (b.theta - a.theta) };
}

/** ∫₀^π g(ψ) dψ by Simpson's rule on n (even) intervals. */
function simpson(g: (psi: number) => number, n: number): number {
  const hstep = Math.PI / n;
  let s = g(0) + g(Math.PI);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * g(i * hstep);
  return (s * hstep) / 3;
}

/** The integrand's 1/√(2(ε − u_eff)) · dr/dψ under r = c − d cos ψ, with its endpoint limits taken analytically. */
function radialWeight(pot: CentralPotential, h: number, eps: number, rp: number, ra: number) {
  const c = 0.5 * (ra + rp);
  const d = 0.5 * (ra - rp);
  // near a turning point r₀, ε − u_eff ≈ |u_eff′(r₀)|·|r − r₀| and |r − r₀| ≈ d ψ²/2, so the weight → √(d/|u_eff′(r₀)|)
  const limit = (r0: number) => Math.sqrt(d / Math.abs(effectiveSlope(pot, h, r0)));
  return (psi: number): { r: number; w: number } => {
    const r = c - d * Math.cos(psi);
    if (psi < 1e-6) return { r: rp, w: limit(rp) };
    if (Math.PI - psi < 1e-6) return { r: ra, w: limit(ra) };
    const k = eps - effective(pot, h, r);
    return { r, w: (d * Math.sin(psi)) / Math.sqrt(2 * Math.max(k, 1e-300)) };
  };
}

/** The angle swept from the periapsis to the apoapsis of a bound orbit (π for every Kepler ellipse). */
export function apsidalAngle(pot: CentralPotential, h: number, eps: number, rp: number, ra: number, n = 4000): number {
  const w = radialWeight(pot, h, eps, rp, ra);
  return simpson((psi) => {
    const q = w(psi);
    return (h / (q.r * q.r)) * q.w;
  }, n);
}

/** The radial period, from periapsis to periapsis: T_r = 2∫dr/|ṙ| (the orbital period for a Kepler ellipse). */
export function radialPeriod(pot: CentralPotential, h: number, eps: number, rp: number, ra: number, n = 4000): number {
  const w = radialWeight(pot, h, eps, rp, ra);
  return 2 * simpson((psi) => w(psi).w, n);
}

/**
 * The apsidal angle of a nearly circular orbit of radius r₀: π/√(3 + r₀u″(r₀)/u′(r₀)), from the small radial
 * oscillation about the minimum of u_eff (ω_r² = u_eff″(r₀), θ̇ = h/r₀²). π for 1/r², π/2 for a spring.
 */
export function nearCircularApsidalAngle(pot: CentralPotential, r0: number): number {
  return Math.PI / Math.sqrt(3 + (r0 * pot.d2u(r0)) / pot.du(r0));
}
